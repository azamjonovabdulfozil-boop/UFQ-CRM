/**
 * security/routes.js — Autentifikatsiya API.
 *
 *   POST /api/auth/login            — kirish (access token + refresh cookie)
 *   POST /api/auth/refresh          — access tokenni yangilash (rotatsiya bilan)
 *   POST /api/auth/logout           — chiqish
 *   GET  /api/auth/me               — joriy foydalanuvchi
 *   POST /api/auth/change-password  — parolni almashtirish (FAQAT admin)
 *   GET  /api/auth/sessions         — faol qurilmalar
 *   POST /api/auth/revoke-all       — barcha qurilmalardan chiqish
 *
 *   GET  /api/admin/accounts        — hisoblar ro'yxati (parolsiz!)
 *   POST /api/admin/accounts        — hisob yaratish/yangilash
 *   POST /api/admin/accounts/password — parolni tiklash
 *   POST /api/admin/accounts/status   — bloklash/ochish
 *   POST /api/admin/accounts/delete   — o'chirish
 *   GET  /api/admin/devices         — bloklangan qurilmalar
 *   POST /api/admin/devices/unblock — qurilma blokini ochish
 *   GET  /api/admin/audit           — xavfsizlik jurnali
 */
import { Router } from "express";
import { issueToken } from "./crypto.js";
import { CONFIG } from "./config.js";
import {
  authenticate,
  updateOwnCredentials,
  adminResetPassword,
  publicView,
  listAccounts,
  upsertAccount,
  setStatus,
  deleteAccount,
  findById,
  bumpTokenVersion,
  ROLES,
} from "./accounts.js";
import { createSession, rotateSession, revokeSession, revokeAllForAccount, listSessions } from "./sessions.js";
import {
  setRefreshCookie,
  clearAuthCookies,
  requireAuth,
  requireRole,
  requireCsrf,
} from "./middleware.js";
import { authLimiter, loginUserLimiter, resetLimit, clientIp, deviceKey } from "./rateLimit.js";
import {
  deviceId,
  checkDeviceBlock,
  noteDeviceFailure,
  clearDeviceFailures,
  listBlockedDevices,
  unblockDevice,
} from "./devices.js";
import { audit, recentEvents } from "./audit.js";
import { safeUsername, safeString, safeObjectIdHex } from "./sanitize.js";

/** Access token — hisobning joriy holatidan quriladi. */
async function mintAccess(account) {
  return issueToken(
    {
      typ: "access",
      sub: String(account._id),
      usr: account.username,
      role: account.role,
      tv: account.tokenVersion || 1,
    },
    CONFIG.accessTtlSec,
  );
}

/** Har bir kirish so'roviga qurilma identifikatorini biriktiradi. */
function deviceCookie(req, res, next) {
  try {
    deviceId(req, res);
  } catch {}
  next();
}

export function createAuthRouter() {
  const r = Router();

  // ── Kirish ──────────────────────────────────────────────────────────────
  r.post("/auth/login", deviceCookie, authLimiter, loginUserLimiter, async (req, res) => {
    try {
      const username = req.body?.username ?? req.body?.login ?? req.body?.user;
      const password = req.body?.password ?? req.body?.pass;
      const did = deviceId(req, res);

      // ── Qurilma bloki ───────────────────────────────────────────────────
      // Blok IP/Wi-Fi ga emas, AYNAN SHU QURILMAGA qo'yiladi: yonidagi
      // telefon o'sha internetdan bemalol kiraveradi.
      const blocked = await checkDeviceBlock(did);
      if (blocked.blocked) {
        res.setHeader("Retry-After", String(blocked.retryAfter));
        await audit("auth.login.device_blocked", {
          req,
          meta: { username: String(username || "").slice(0, 64) },
          severity: "warn",
        });
        return res.status(429).json({
          ok: false,
          code: "device-blocked",
          error: `Bu qurilma vaqtincha bloklandi. ${Math.ceil(blocked.retryAfter / 60)} daqiqadan keyin urinib ko'ring.`,
          retryAfter: blocked.retryAfter,
        });
      }

      const out = await authenticate(username, password, req);
      if (!out.ok) {
        // Parol noto'g'ri bo'lsa — shu qurilmaning hisoblagichi oshadi.
        // Hisob o'chirilgan bo'lsa qurilma aybdor emas, hisoblanmaydi.
        if (out.code === "invalid-credentials") {
          const note = await noteDeviceFailure(did, req, username);
          if (note.blocked) {
            res.setHeader("Retry-After", String(note.retryAfter));
            return res.status(429).json({
              ok: false,
              code: "device-blocked",
              error: `Parol ${CONFIG.deviceMaxFailedAttempts} marta xato kiritildi — bu qurilma ${Math.ceil(
                note.retryAfter / 60,
              )} daqiqaga bloklandi.`,
              retryAfter: note.retryAfter,
            });
          }
          return res.status(401).json({
            ok: false,
            code: out.code,
            error: out.error,
            attemptsLeft: note.left,
          });
        }
        const status = out.code === "account-locked" ? 429 : out.code === "account-disabled" ? 403 : 401;
        if (out.retryAfter) res.setHeader("Retry-After", String(out.retryAfter));
        return res.status(status).json({ ok: false, code: out.code, error: out.error });
      }

      const acc = out.account;
      const { token: refresh } = await createSession(acc, req);
      const csrf = setRefreshCookie(req, res, refresh);
      const access = await mintAccess(acc);

      // Muvaffaqiyatli kirishdan keyin bu login uchun hisob tozalanadi
      resetLimit("auth-user", String(username || "").toLowerCase().slice(0, 64) + "@" + deviceKey(req));
      resetLimit("auth-device", deviceKey(req));
      await clearDeviceFailures(did);

      await audit("auth.login.success", {
        req,
        actor: { sub: String(acc._id), username: acc.username, role: acc.role },
        meta: { legacyUpgraded: !!out.upgraded },
      });

      res.json({
        ok: true,
        accessToken: access,
        expiresIn: CONFIG.accessTtlSec,
        csrfToken: csrf,
        // Portallar cross-site rejimda cookie ola olmasa — zaxira yo'l.
        refreshToken: CONFIG.crossSite ? refresh : undefined,
        user: publicView(acc),
      });
    } catch (e) {
      console.error("login xatosi:", e);
      res.status(500).json({ ok: false, error: "Kirishda xatolik" });
    }
  });

  // ── Tokenni yangilash ───────────────────────────────────────────────────
  r.post("/auth/refresh", authLimiter, async (req, res) => {
    try {
      const raw = req.cookies?.[CONFIG.cookieName] || (CONFIG.crossSite ? req.body?.refreshToken : null);
      const out = await rotateSession(raw, req);
      if (!out.ok) {
        clearAuthCookies(req, res);
        return res.status(401).json({ ok: false, code: out.code, error: out.error });
      }

      const acc = await findById(out.session.accountId);
      if (!acc || acc.status === "disabled") {
        clearAuthCookies(req, res);
        return res.status(401).json({ ok: false, code: "account-disabled", error: "Hisob faol emas" });
      }

      const csrf = setRefreshCookie(req, res, out.token);
      res.json({
        ok: true,
        accessToken: await mintAccess(acc),
        expiresIn: CONFIG.accessTtlSec,
        csrfToken: csrf,
        refreshToken: CONFIG.crossSite ? out.token : undefined,
        user: publicView(acc),
      });
    } catch (e) {
      console.error("refresh xatosi:", e);
      res.status(500).json({ ok: false, error: "Yangilashda xatolik" });
    }
  });

  // ── Chiqish ─────────────────────────────────────────────────────────────
  r.post("/auth/logout", async (req, res) => {
    const raw = req.cookies?.[CONFIG.cookieName] || req.body?.refreshToken;
    try {
      await revokeSession(raw, "logout");
    } catch {}
    clearAuthCookies(req, res);
    await audit("auth.logout", { req, actor: req.user || null });
    res.json({ ok: true });
  });

  // ── Joriy foydalanuvchi ─────────────────────────────────────────────────
  r.get("/auth/me", requireAuth, async (req, res) => {
    const acc = await findById(req.user.sub);
    res.json({ ok: true, user: publicView(acc) });
  });

  // ── Parolni almashtirish ────────────────────────────────────────────────
  //
  // ⚠️ SIYOSAT: parolni faqat ADMIN panelidan o'zgartirish mumkin.
  //   • admin — shu yerdan o'z login va parolini almashtiradi (joriy parol so'ralmaydi);
  //   • mentor/talaba — umuman almashtira olmaydi, adminga murojaat qiladi.
  // Portallardan "parolni almashtirish" oynasi olib tashlandi, lekin himoya
  // UI da emas, aynan shu yerda — so'rovni qo'lda yuborish ham ish bermaydi.
  r.post("/auth/change-password", requireAuth, authLimiter, async (req, res) => {
    if (!CONFIG.selfPasswordChangeRoles.includes(req.user.role)) {
      await audit("auth.password.self_change_denied", { req, actor: req.user, severity: "warn" });
      return res.status(403).json({
        ok: false,
        code: "self-change-disabled",
        error: "Parolni faqat administrator o'zgartiradi. Iltimos, administratorga murojaat qiling.",
      });
    }
    const next = req.body?.newPassword ?? req.body?.password;
    const username = req.body?.username;
    if ((next != null && typeof next !== "string") || (username != null && typeof username !== "string"))
      return res.status(400).json({ ok: false, error: "Noto'g'ri so'rov" });

    const out = await updateOwnCredentials(req.user.sub, { username, password: next || "" }, req);
    if (!out.ok) return res.status(400).json(out);

    // Barcha eski sessiyalar yopiladi, shu qurilma uchun yangisi ochiladi
    await revokeAllForAccount(req.user.sub, "password-changed");
    const acc = await findById(req.user.sub);
    const { token } = await createSession(acc, req);
    const csrf = setRefreshCookie(req, res, token);

    res.json({
      ok: true,
      accessToken: await mintAccess(acc),
      expiresIn: CONFIG.accessTtlSec,
      csrfToken: csrf,
      refreshToken: CONFIG.crossSite ? token : undefined,
      user: publicView(acc),
    });
  });

  // ── Faol qurilmalar ─────────────────────────────────────────────────────
  r.get("/auth/sessions", requireAuth, async (req, res) => {
    res.json({ ok: true, sessions: await listSessions(req.user.sub), current: clientIp(req) });
  });

  r.post("/auth/revoke-all", requireAuth, requireCsrf, async (req, res) => {
    const n = await revokeAllForAccount(req.user.sub, "user-revoke-all");
    await bumpTokenVersion(req.user.sub);
    clearAuthCookies(req, res);
    await audit("auth.revoke_all", { req, actor: req.user, meta: { sessions: n }, severity: "warn" });
    res.json({ ok: true, revoked: n });
  });

  // ── Admin: hisoblarni boshqarish ────────────────────────────────────────
  const admin = [requireAuth, requireRole(ROLES.ADMIN)];

  r.get("/admin/accounts", admin, async (req, res) => {
    const role = safeString(req.query?.role, 20);
    res.json({ ok: true, accounts: await listAccounts({ role }) });
  });

  r.post("/admin/accounts", admin, async (req, res) => {
    const b = req.body || {};
    const out = await upsertAccount({
      username: b.username ?? b.login,
      password: b.password || undefined,
      role: b.role,
      name: b.name,
      mentorName: b.mentorName,
      studentId: b.studentId,
      studentName: b.studentName,
      status: b.status,
      mustChangePassword: b.mustChangePassword === true,
    });
    if (!out.ok) return res.status(400).json(out);
    await audit("admin.account.upsert", {
      req,
      actor: req.user,
      target: { username: out.account?.username, role: out.account?.role },
      severity: "warn",
    });
    res.json({ ok: true, account: publicView(out.account) });
  });

  r.post("/admin/accounts/password", admin, async (req, res) => {
    const id = safeObjectIdHex(req.body?.id);
    const password = req.body?.password;
    if (!id || typeof password !== "string")
      return res.status(400).json({ ok: false, error: "id va password kerak" });

    const out = await adminResetPassword(id, password, req, req.user);
    if (!out.ok) return res.status(400).json(out);
    await revokeAllForAccount(id, "admin-password-reset");
    res.json({ ok: true });
  });

  r.post("/admin/accounts/status", admin, async (req, res) => {
    const id = safeObjectIdHex(req.body?.id);
    const status = req.body?.status === "disabled" ? "disabled" : "active";
    if (!id) return res.status(400).json({ ok: false, error: "id kerak" });
    if (id === req.user.sub && status === "disabled")
      return res.status(400).json({ ok: false, error: "O'z hisobingizni bloklab bo'lmaydi" });

    const out = await setStatus(id, status);
    if (!out.ok) return res.status(404).json(out);
    if (status === "disabled") await revokeAllForAccount(id, "admin-disabled");
    await audit("admin.account.status", { req, actor: req.user, target: { id, status }, severity: "warn" });
    res.json({ ok: true });
  });

  r.post("/admin/accounts/delete", admin, async (req, res) => {
    const id = safeObjectIdHex(req.body?.id);
    if (!id) return res.status(400).json({ ok: false, error: "id kerak" });
    if (id === req.user.sub) return res.status(400).json({ ok: false, error: "O'z hisobingizni o'chirib bo'lmaydi" });

    const out = await deleteAccount(id);
    if (!out.ok) return res.status(400).json(out);
    await revokeAllForAccount(id, "account-deleted");
    await audit("admin.account.delete", { req, actor: req.user, target: out.account, severity: "critical" });
    res.json({ ok: true });
  });

  // ── Admin: bloklangan qurilmalar ────────────────────────────────────────
  // Parolni ko'p marta xato kiritgan qurilmalar. Admin blokni muddatidan
  // oldin ochib bera oladi (masalan talaba parolini unutgan bo'lsa).
  r.get("/admin/devices", admin, async (req, res) => {
    res.json({ ok: true, devices: await listBlockedDevices(100) });
  });

  r.post("/admin/devices/unblock", admin, requireCsrf, async (req, res) => {
    const id = safeString(req.body?.id, 64);
    if (!id) return res.status(400).json({ ok: false, error: "id kerak" });
    await unblockDevice(id);
    await audit("admin.device.unblock", { req, actor: req.user, target: { device: id }, severity: "warn" });
    res.json({ ok: true });
  });

  // ── Admin: xavfsizlik jurnali ───────────────────────────────────────────
  r.get("/admin/audit", admin, async (req, res) => {
    const limit = Math.min(Number(req.query?.limit) || 100, 500);
    const event = safeString(req.query?.event, 80);
    const events = await recentEvents({ limit, event });
    res.json({ ok: true, events });
  });

  return r;
}

/**
 * Portal foydalanuvchilarini `accounts` bilan sinxronlash uchun yordamchi —
 * admin mentor/talaba yaratganda chaqiriladi (server.js dagi /api/users/save).
 */
export async function syncPortalAccounts(list, role, actor, req) {
  const results = [];
  for (const u of Array.isArray(list) ? list : []) {
    const username = safeUsername(u?.login);
    if (!username) {
      results.push({ login: u?.login, ok: false, error: "Login yaroqsiz" });
      continue;
    }
    const out = await upsertAccount({
      username,
      role,
      name: u.name || username,
      mentorName: u.mentorName || null,
      studentId: u.studentId ?? null,
      studentName: u.studentName || null,
      // Parol berilgan bo'lsa o'rnatiladi; bo'lmasa mavjud parol saqlanadi.
      // ⚠️ `legacyPassword` yo'li ishlatiladi (`password` emas): admin mentor/
      // talabaga ODDIY parol beradi (sozlamalar kartochkasida kamida 4 belgi),
      // `password` yo'li esa admin uchun mo'ljallangan QATTIQ siyosatni (10+
      // belgi, lug'at) qo'llab, bunday parolni jimgina rad etardi — natijada
      // hisob `accounts` ga umuman yozilmay, mentor/talaba kira olmasdi.
      // legacyPassword ham ochiq matnni (sozlama kartochkasi), ham sha256 ni
      // (talaba modalida oldindan xeshlanadi) to'g'ri qabul qiladi va birinchi
      // kirishda avtomatik scrypt'ga ko'chiriladi.
      legacyPassword: typeof u.pass === "string" && u.pass ? u.pass : undefined,
    });
    results.push({ login: username, ok: out.ok, error: out.error });
  }
  if (results.some((x) => x.ok))
    await audit("admin.accounts.sync", {
      req,
      actor,
      meta: { role, total: results.length, ok: results.filter((x) => x.ok).length },
    });
  return results;
}
