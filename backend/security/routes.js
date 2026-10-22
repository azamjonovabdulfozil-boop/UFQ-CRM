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
import { issueToken, sha256 } from "./crypto.js";
import { decryptSecret, verifyTotp } from "./totp.js";
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
  findByUsername,
  renameAccount,
  bumpTokenVersion,
  setPasswordInternal,
  ROLES,
  SUPERADMIN_ROLE,
  COL as ACCOUNTS_COL,
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

let _getDbForRoutes = null;
/** routes.js ga baza kerak (OTP qadami, tiklash tokeni) — index.js ulaydi. */
export function initRoutesDb(getDb) {
  _getDbForRoutes = getDb;
}

/** Hisobning 2 bosqichli tasdig'i yoqilganmi va kod to'g'rimi. */
async function checkSecondFactor(acc, otp) {
  if (!acc?.totp?.enabled) return { ok: true, skipped: true };
  if (otp == null || otp === "")
    return { ok: false, code: "otp-required", error: "Tasdiqlash kodini kiriting (Authenticator ilovasidan)" };
  const secret = decryptSecret(acc.totp.secretEnc);
  if (!secret)
    return { ok: false, code: "otp-invalid", error: "Tasdiqlash sozlamasi buzilgan — tiklash havolasidan foydalaning" };
  const step = verifyTotp(secret, otp, acc.totp.lastStep ?? null);
  if (step == null) return { ok: false, code: "otp-invalid", error: "Tasdiqlash kodi noto'g'ri yoki eskirgan" };
  if (_getDbForRoutes)
    await _getDbForRoutes().collection(ACCOUNTS_COL).updateOne({ _id: acc._id }, { $set: { "totp.lastStep": step } });
  return { ok: true };
}

/** Oddiy admin Super Admin hisobiga tegishi mumkin emas. */
async function guardSuperTarget(req, res, id) {
  const target = await findById(id);
  if (target && target.role === SUPERADMIN_ROLE && !req.user.isSuper) {
    await audit("authz.super_target_denied", { req, actor: req.user, target: { id }, severity: "critical" });
    res.status(403).json({ ok: false, code: "forbidden", error: "Bu hisob himoyalangan" });
    return false;
  }
  return true;
}

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

      // ── Ikkinchi bosqich (TOTP) — yoqilgan hisoblar uchun ──────────────
      const second = await checkSecondFactor(acc, req.body?.otp);
      if (!second.ok) {
        if (second.code === "otp-invalid") {
          const note = await noteDeviceFailure(did, req, username);
          await audit("auth.login.otp_failed", {
            req,
            actor: { sub: String(acc._id), username: acc.username, role: acc.role },
            severity: "warn",
          });
          if (note.blocked) {
            res.setHeader("Retry-After", String(note.retryAfter));
            return res.status(429).json({
              ok: false,
              code: "device-blocked",
              error: "Juda ko'p xato urinish — qurilma vaqtincha bloklandi.",
              retryAfter: note.retryAfter,
            });
          }
        }
        return res.status(401).json({ ok: false, code: second.code, error: second.error });
      }

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
        meta: { legacyUpgraded: !!out.upgraded, secondFactor: !second.skipped },
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
      // Sessiya yo'q yoki tugagan — bu xato emas, oddiy holat (foydalanuvchi
      // hali kirmagan yoki muddati o'tgan). 401 qaytarilsa brauzer konsolida
      // har safar qizil xato chiqardi; mijoz faqat `ok` ga qaraydi.
      if (!out.ok) {
        clearAuthCookies(req, res);
        return res.json({ ok: false, noSession: true, code: out.code, error: out.error });
      }

      const acc = await findById(out.session.accountId);
      if (!acc || acc.status === "disabled") {
        clearAuthCookies(req, res);
        return res.json({ ok: false, noSession: true, code: "account-disabled", error: "Hisob faol emas" });
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

  // ── Parolni bir martalik havola orqali tiklash ──────────────────────────
  // Havolani Super Admin yaratadi (Administratorlar → Parolni tiklash) yoki
  // server konsolidagi skript (Super Admin uchun). Eski parol hech qachon
  // ko'rsatilmaydi; token bazada faqat SHA-256 xeshi ko'rinishida turadi,
  // bir marta ishlaydi va qisqa muddatda eskiradi.
  r.post("/auth/reset-password", authLimiter, async (req, res) => {
    try {
      const token = safeString(req.body?.token, 200);
      const pw = req.body?.newPassword ?? req.body?.password;
      if (!token || typeof pw !== "string")
        return res.status(400).json({ ok: false, error: "token va yangi parol kerak" });
      const col = _getDbForRoutes().collection(ACCOUNTS_COL);
      const acc = await col.findOne({ "resetToken.hash": sha256(token) });
      if (!acc || !acc.resetToken || new Date(acc.resetToken.expiresAt).getTime() < Date.now()) {
        await audit("auth.password.reset_invalid", { req, severity: "warn" });
        return res.status(400).json({ ok: false, code: "reset-invalid", error: "Havola yaroqsiz yoki muddati tugagan" });
      }
      if (acc.status === "disabled")
        return res.status(403).json({ ok: false, code: "account-disabled", error: "Hisob faol emas" });
      const out = await setPasswordInternal(String(acc._id), pw, req, "auth.password.reset_completed", {
        sub: String(acc._id),
        username: acc.username,
        role: acc.role,
      });
      if (!out.ok) return res.status(400).json(out);
      const unset = { resetToken: "" };
      // Super Admin uchun konsol skripti 2FA ni ham o'chirishni so'rashi mumkin
      if (acc.resetToken.disable2fa) unset.totp = "";
      await col.updateOne({ _id: acc._id }, { $unset: unset });
      await revokeAllForAccount(String(acc._id), "password-reset");
      res.json({ ok: true, username: acc.username });
    } catch (e) {
      console.error("reset xatosi:", e);
      res.status(500).json({ ok: false, error: "Tiklashda xatolik" });
    }
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
    const all = await listAccounts({ role });
    // Oddiy admin Super Admin hisobini ko'rmaydi ham
    res.json({ ok: true, accounts: req.user.isSuper ? all : all.filter((a) => !a.isSuper) });
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

    if (!(await guardSuperTarget(req, res, id))) return;
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
    if (!(await guardSuperTarget(req, res, id))) return;

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
    if (!(await guardSuperTarget(req, res, id))) return;

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
    // Parol FAQAT `newPassword` maydonidan olinadi — admin aynan shu safar
    // kiritgan yangi parol. Ilgari `pass` olinardi: brauzerdagi eski ro'yxatda
    // (KV) eski parollar qolib ketgan va admin yangi talaba qo'shganda butun
    // ro'yxat shu ESKI parollar bilan qayta yuborilib, hammaning paroli
    // eskisiga qaytib qolardi — admin parolni qayta o'rnatmaguncha mentor/
    // talaba kira olmasdi.
    const newPass = typeof u.newPassword === "string" ? u.newPassword : "";
    const hasPass = !!newPass;
    // Login almashtirilgan, yangi parol berilmagan — eski hisob (paroli bilan)
    // yangi loginga ko'chiriladi
    if (!hasPass && u.prevLogin) {
      const prev = safeUsername(u.prevLogin);
      if (prev && prev !== username && !(await findByUsername(username))) {
        const rn = await renameAccount(prev, username, role);
        if (rn.ok) await audit("admin.accounts.rename", { req, actor, meta: { role, from: prev, to: username } });
      }
    }
    const out = await upsertAccount({
      username,
      role,
      name: u.name || username,
      mentorName: u.mentorName || null,
      studentId: u.studentId ?? null,
      studentName: u.studentName || null,
      // Yangi parol berilgan bo'lsa darhol scrypt bilan o'rnatiladi; bo'lmasa
      // mavjud parol o'zgarmay qoladi.
      ...(hasPass ? { password: newPass } : {}),
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

/**
 * Admin mentor/talabaning loginini o'chirsa yoki almashtirsa — eski hisob
 * `accounts` dan ham o'chiriladi. Aks holda eski login bilan kirish
 * ishlayverardi. Faqat shu roldagi hisob o'chadi (admin hisobiga tegilmaydi).
 */
export async function removePortalAccounts(logins, role, actor, req) {
  const removed = [];
  for (const l of Array.isArray(logins) ? logins.slice(0, 200) : []) {
    const acc = await findByUsername(l);
    if (!acc || acc.role !== role) continue;
    const out = await deleteAccount(String(acc._id));
    if (out.ok) {
      await revokeAllForAccount(String(acc._id)).catch(() => {});
      removed.push(acc.username);
    }
  }
  if (removed.length)
    await audit("admin.accounts.remove", { req, actor, meta: { role, removed }, severity: "warn" });
  return removed;
}
