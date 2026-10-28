/**
 * superadmin/router.js — Super Admin API (/api/super/*).
 *
 * HAR BIR marshrut `requireSuperAdmin` bilan himoyalangan: tekshiruv serverda,
 * bazadagi hisob roli bo'yicha. Oddiy admin token bilan kelsa — 403 va
 * jurnalga "authz.super_denied" yoziladi. Faqat menyuni yashirish xavfsizlik
 * hisoblanmaydi — shuning uchun hamma narsa shu yerda tekshiriladi.
 */
import { Router } from "express";
import { ObjectId } from "mongodb";
import { monitorEventLoopDelay } from "node:perf_hooks";
import {
  computeAll,
  buildContext,
  series,
  studentGrowth,
  studentDynamics,
  lessonsIn,
  CRITERIA,
  HOMEWORK_INFO,
} from "./calc.js";
import { buildInsights, aiStatus } from "./insights.js";
import { requestStats, activeUsers, STARTED_AT } from "./metrics.js";
import {
  MODULES,
  getSettings,
  saveSettings,
  effectiveModules,
  settingsMenuAllowed,
  defaultSettings,
} from "./settings.js";
import { buildReport, REPORTS, reportFileName } from "./reports.js";
import { render, MIME } from "./exporters.js";
import { summarizeCrmChange, LESSON_MARKS_COL } from "./changes.js";
import { describeEvent, deviceText, kindOf, crmLookups, ROLE_TEXT, STAFF_ROLES } from "./activityView.js";
import { DELETED_ACCOUNTS_DOC } from "../security/bootstrap.js";
import { parseRange, prevRange, todayIn, dayOf, escRe, maskPhone, clip, addDays, dayStartUtc } from "./util.js";

const eld = monitorEventLoopDelay({ resolution: 20 });
eld.enable();

// ─── Jurnal toifalari ─────────────────────────────────────────────────────────
export const CATEGORIES = [
  ["Kirish", /^auth\.login\.success$/],
  ["Chiqish", /^auth\.logout$/],
  ["Kirish xatosi", /^auth\.(login\.(failed|unknown_user|locked|disabled|device_blocked|otp_failed)|session\.reuse_detected)/],
  ["Parol", /^(auth\.(password|username)|bootstrap\.password|super\.admin\.(reset_link|password_set))/],
  ["Ma'lumot o'zgarishi", /^(data\.|kv\.crm|super\.data\.|super\.ai\.action)/],
  ["AI yordamchi", /^super\.ai\.chat$/],
  ["Sozlama", /^(settings\.|super\.(settings|modules|branding)|module\.)/],
  ["Ruxsatlar", /^(super\.admin\.|admin\.|authz\.|bootstrap\.(role|account))/],
  ["Eksport", /^(report\.|super\.export|backup\.download)/],
  ["Zaxira", /^(backup\.|data\.restore)/],
  ["Server xatosi", /^server\.error$/],
  ["Xavfsizlik", /^(auth\.(2fa|reauth)|super\.(2fa|reauth)|proxy\.blocked)/],
];
export function categoryOf(ev) {
  const e = String(ev || "");
  for (const [label, re] of CATEGORIES) if (re.test(e)) return label;
  if (e.includes("denied")) return "Ruxsatlar";
  return "Boshqa";
}
const EVENT_TEXT = {
  "auth.login.success": "Tizimga kirdi",
  "auth.logout": "Tizimdan chiqdi",
  "auth.login.failed": "Parol noto'g'ri kiritildi",
  "auth.login.unknown_user": "Noma'lum login bilan urinish",
  "auth.login.device_blocked": "Bloklangan qurilmadan urinish",
  "auth.login.otp_failed": "Tasdiqlash kodi noto'g'ri",
  "auth.login.disabled": "Bloklangan hisob bilan urinish",
  "auth.session.reuse_detected": "Sessiya tokeni qayta ishlatildi (o'g'irlik shubhasi)",
  "auth.password.changed": "Parolini o'zgartirdi",
  "auth.password.admin_reset": "Parol tiklandi (admin)",
  "auth.password.reset_completed": "Parol havola orqali tiklandi",
  "auth.password.reset_invalid": "Yaroqsiz tiklash havolasi",
  "data.change": "Ma'lumot o'zgartirildi",
  "data.restore": "Zaxira nusxadan tiklandi",
  "data.write.partial_denied": "Ruxsatsiz bo'limga yozish rad etildi",
  "settings.change": "Sozlama o'zgartirildi",
  "report.export": "Hisobot eksport qilindi",
  "server.error": "Server xatosi",
  "authz.denied": "Ruxsat yo'q — rad etildi",
  "authz.super_denied": "Super Admin bo'limiga ruxsatsiz urinish",
  "module.api_denied": "O'chirilgan modulga murojaat rad etildi",
  "super.modules.update": "Menyu/modul sozlamalari o'zgartirildi",
  "super.settings.update": "Tizim sozlamalari o'zgartirildi",
  "super.branding.update": "CRM nomi/logotipi o'zgartirildi",
  "super.admin.status": "Administrator holati o'zgartirildi",
  "super.admin.create": "Yangi administrator yaratildi",
  "super.admin.delete": "Administrator o'chirildi",
  "super.admin.profile": "Administrator ism-familiyasi o'zgartirildi",
  "super.admin.restrictions": "Administrator ruxsatlari o'zgartirildi",
  "super.admin.reset_link": "Parolni tiklash havolasi yaratildi",
  "super.admin.password_set": "Administrator paroli almashtirildi",
  "super.admin.sessions_revoked": "Administrator sessiyalari bekor qilindi",
  "super.data.edit": "Super Admin yozuvni tahrirladi",
  "super.ai.chat": "Super Admin AI yordamchisidan foydalandi",
  "super.ai.action": "Super Admin AI orqali amal bajardi",
  "super.data.view_sensitive": "Shaxsiy ma'lumotlar ochildi",
  "backup.create": "Zaxira nusxa yaratildi",
  "backup.failed": "Zaxira nusxa yaratilmadi",
  "backup.download": "Zaxira nusxa yuklab olindi",
  "super.2fa.enabled": "2 bosqichli tasdiqlash yoqildi",
  "super.2fa.disabled": "2 bosqichli tasdiqlash o'chirildi",
  "super.reauth_failed": "Qayta tasdiqlash muvaffaqiyatsiz",
  "kv.write.denied": "Ruxsatsiz sozlama/kalitga yozish rad etildi",
  "kv.bulk.denied": "Ruxsatsiz kalitlarga yozish rad etildi",
  "kv.crm.partial_denied": "Ruxsatsiz CRM bo'limiga yozish rad etildi",
  "module.write_denied": "O'chirilgan modulga yozish rad etildi",
  "auth.login.locked": "Bloklangan hisob bilan urinish",
  "auth.password.self_change_denied": "Parolni o'zi almashtirishga urinish rad etildi",
  "auth.password.upgraded": "Parol xavfsiz formatga o'tkazildi",
  "auth.username.changed": "Login o'zgartirildi",
  "auth.revoke_all": "Barcha qurilmalardan chiqdi",
  "authz.super_target_denied": "Super Admin hisobiga tegishga urinish rad etildi",
  "admin.account.upsert": "Hisob yaratildi/yangilandi",
  "admin.account.status": "Hisob holati o'zgartirildi",
  "admin.account.delete": "Hisob o'chirildi",
  "admin.accounts.sync": "Mentor/talaba hisoblari sinxronlandi",
  "admin.accounts.remove": "Mentor/talaba hisoblari o'chirildi",
  "admin.accounts.rename": "Login almashtirildi",
  "admin.device.unblock": "Qurilma blokdan chiqarildi",
  "bootstrap.role_promoted": "Hisob Super Admin roliga o'tkazildi (ENV)",
  "bootstrap.password_applied": "Parol server sozlamasidan qo'llandi (ENV)",
  "bootstrap.account_created": "Hisob server sozlamasidan yaratildi (ENV)",
  "server.start": "Server ishga tushdi",
  "super.export": "Ma'lumotlar eksport qilindi",
  "coins.write.denied": "Coin yozuvi rad etildi",
  "blob.delete": "Fayl o'chirildi",
  "kv.clear": "KV ombori tozalandi",
};
export function eventText(e) {
  const base = EVENT_TEXT[e.event] || e.event;
  const m = e.meta || {};
  if (e.event === "data.change" && m.summary) return base + ": " + m.summary;
  if (e.event === "report.export") return `${base}: ${m.report || ""} (${m.format || ""})`;
  if (e.event === "settings.change" && m.setting) return `${base}: ${m.setting}`;
  if (e.event === "module.api_denied" && m.module) return `${base}: ${m.module}`;
  if (e.event === "super.data.edit" && m.summary) return `${base}: ${m.summary}`;
  if (e.event === "server.error" && m.message) return `${base}: ${String(m.message).slice(0, 120)}`;
  if (e.target && e.target.username) return `${base} → ${e.target.username}`;
  return base;
}

const isoOrNull = (v) => {
  const d = new Date(String(v || ""));
  return isNaN(d.getTime()) ? null : d;
};

/**
 * @param {object} deps
 *   getDb, audit, requireSuperAdmin, requireAuth, rateLimit,
 *   broadcast(keys), snapshotCrmData(prev, reason, {force}), dataWeight(d),
 *   BACKUP_COL, CRM_KV_KEY, sseCount(), readCrmData(), security helpers…
 */
export function createSuperRouter(deps) {
  const {
    getDb, audit, requireSuperAdmin, requireAuth, rateLimit, broadcast, snapshotCrmData, dataWeight,
    BACKUP_COL, CRM_KV_KEY, sseCount, sec,
  } = deps;
  const r = Router();
  const S = requireSuperAdmin;
  const sensitiveLimiter = rateLimit({ windowMs: 15 * 60_000, max: 10, name: "super-sensitive", key: (req) => req.user?.sub || "?" });
  const exportLimiter = rateLimit({ windowMs: 60_000, max: 30, name: "super-export", key: (req) => req.user?.sub || "?" });

  const db = () => getDb();
  const fail = (res, e, msg = "Ichki xatolik") => {
    console.error("❌ [super]", e?.stack || e);
    if (!res.headersSent) res.status(500).json({ ok: false, error: msg });
  };

  // ── Umumiy kontekst: CRM + jurnal + sozlamalar ─────────────────────────
  async function loadCtx(req) {
    const settings = await getSettings();
    const tz = settings.general.timezone;
    const D = (await db().collection("crm_data").findOne({ _type: "main" })) || {};
    const rng = parseRange(req.query, tz);
    const pr = prevRange(rng);
    const marks = await db()
      .collection(LESSON_MARKS_COL)
      .find({}, { projection: { _id: 0, key: 1, firstMarkedAt: 1 } })
      .toArray()
      .catch(() => []);
    const marksLog = new Map(marks.map((m) => [m.key, m]));
    const ctx = buildContext(D, marksLog, tz, todayIn(tz));
    const all = computeAll(ctx, rng, pr, settings.ranking);
    return { settings, tz, D, ctx, all, range: rng, prev: pr, dataUpdatedAt: D._updatedAt || null };
  }

  /** Qayta tasdiqlash: parol (+ 2FA yoqilgan bo'lsa kod). Xavfli amallar uchun. */
  async function reauth(req, res) {
    const acc = await sec.findById(req.user.sub);
    const pw = String(req.body?.password || "");
    let ok = !!(acc && acc.passwordHash && pw && (await sec.verifyPassword(pw, acc.passwordHash)));
    if (ok && acc.totp && acc.totp.enabled) {
      const secret = sec.decryptSecret(acc.totp.secretEnc);
      const step = secret ? sec.verifyTotp(secret, req.body?.otp, acc.totp.lastStep ?? null) : null;
      ok = step != null;
      if (ok) await db().collection(sec.ACCOUNTS_COL).updateOne({ _id: acc._id }, { $set: { "totp.lastStep": step } });
    }
    if (!ok) {
      await audit("super.reauth_failed", { req, actor: req.user, severity: "warn" });
      // 401 emas — aks holda brauzerdagi sessiya qatlami buni "sessiya
      // tugadi" deb tushunib, foydalanuvchini tizimdan chiqarib yuborardi
      res.status(403).json({
        ok: false,
        code: "reauth-failed",
        error: acc?.totp?.enabled ? "Parol yoki tasdiqlash kodi noto'g'ri" : "Parol noto'g'ri",
      });
      return null;
    }
    return acc;
  }

  // ═══════════════════════ PROFIL VA XAVFSIZLIK ═══════════════════════════
  r.get("/api/super/me", S, async (req, res) => {
    const acc = await sec.findById(req.user.sub);
    const fp = await db().collection("system_settings").findOne({ _id: "env_credentials" });
    res.json({
      ok: true,
      user: sec.publicView(acc),
      security: {
        twoFactor: !!acc?.totp?.enabled,
        passwordChangedAt: acc?.passwordChangedAt || null,
        passwordFromEnv: !!(fp && fp[acc.username]) && (!acc.passwordChangedAt || new Date(acc.passwordChangedAt) <= new Date(fp.updatedAt || 0)),
        idleTimeoutMin: Math.round(Math.min(sec.CONFIG.idleTimeoutSec, sec.CONFIG.superIdleTimeoutSec) / 60),
      },
    });
  });

  r.post("/api/super/me/password", S, sensitiveLimiter, async (req, res) => {
    const acc = await reauth(req, res);
    if (!acc) return;
    const next = req.body?.newPassword;
    if (typeof next !== "string" || next.length < 10)
      return res.status(400).json({ ok: false, error: "Yangi parol kamida 10 belgi bo'lsin" });
    if (next === req.body?.password) return res.status(400).json({ ok: false, error: "Yangi parol eskisidan farq qilsin" });
    const out = await sec.setPasswordInternal(String(acc._id), next, req, "auth.password.changed", req.user);
    if (!out.ok) return res.status(400).json(out);
    await sec.revokeAllForAccount(String(acc._id), "password-changed");
    res.json({ ok: true, relogin: true });
  });

  r.post("/api/super/me/2fa/setup", S, sensitiveLimiter, async (req, res) => {
    const acc = await reauth(req, res);
    if (!acc) return;
    const secret = sec.newTotpSecret();
    await db()
      .collection(sec.ACCOUNTS_COL)
      .updateOne({ _id: acc._id }, { $set: { "totpPending": { secretEnc: sec.encryptSecret(secret), at: new Date() } } });
    res.json({ ok: true, secret, uri: sec.otpauthUri(secret, acc.username) });
  });

  r.post("/api/super/me/2fa/enable", S, sensitiveLimiter, async (req, res) => {
    const acc = await sec.findById(req.user.sub);
    const pend = acc?.totpPending;
    if (!pend || Date.now() - new Date(pend.at).getTime() > 15 * 60_000)
      return res.status(400).json({ ok: false, error: "Sozlash muddati tugagan — qaytadan boshlang" });
    const secret = sec.decryptSecret(pend.secretEnc);
    const step = secret ? sec.verifyTotp(secret, req.body?.code) : null;
    if (step == null) return res.status(400).json({ ok: false, error: "Kod noto'g'ri. Ilovadagi joriy 6 xonali kodni kiriting." });
    await db()
      .collection(sec.ACCOUNTS_COL)
      .updateOne(
        { _id: acc._id },
        { $set: { totp: { enabled: true, secretEnc: pend.secretEnc, lastStep: step, enabledAt: new Date() } }, $unset: { totpPending: "" } },
      );
    sec.invalidateAccount(String(acc._id), acc.username);
    await audit("super.2fa.enabled", { req, actor: req.user, severity: "warn" });
    res.json({ ok: true });
  });

  r.post("/api/super/me/2fa/disable", S, sensitiveLimiter, async (req, res) => {
    const acc = await reauth(req, res);
    if (!acc) return;
    await db().collection(sec.ACCOUNTS_COL).updateOne({ _id: acc._id }, { $unset: { totp: "", totpPending: "" } });
    sec.invalidateAccount(String(acc._id), acc.username);
    await audit("super.2fa.disabled", { req, actor: req.user, severity: "critical" });
    res.json({ ok: true });
  });

  r.get("/api/super/me/sessions", S, async (req, res) => {
    res.json({ ok: true, sessions: await sec.listSessions(req.user.sub) });
  });

  // ═══════════════════════ DASHBOARD ═══════════════════════════════════════
  async function securitySummary(fromDate) {
    const col = db().collection("security_audit");
    const since = fromDate || new Date(Date.now() - 7 * 86400_000);
    const rows = await col
      .aggregate([
        { $match: { at: { $gte: since }, severity: { $in: ["warn", "critical"] } } },
        { $group: { _id: "$event", n: { $sum: 1 }, last: { $max: "$at" } } },
        { $sort: { n: -1 } },
        { $limit: 30 },
      ])
      .toArray();
    const failed = rows
      .filter((x) => /^auth\.login\.(failed|unknown_user|device_blocked|otp_failed)$/.test(x._id))
      .reduce((s, x) => s + x.n, 0);
    const critical = await col
      .find({ at: { $gte: since }, severity: "critical" }, { projection: { ua: 0 } })
      .sort({ at: -1 })
      .limit(8)
      .toArray();
    return {
      failedLogins: failed,
      byEvent: rows.map((x) => ({ event: x._id, text: EVENT_TEXT[x._id] || x._id, n: x.n, last: x.last })),
      critical: critical.map((e) => ({ at: e.at, event: e.event, text: eventText(e), actor: e.actorName, ip: e.ip })),
    };
  }

  async function accountStats(rng, tz) {
    const now = Date.now();
    const accs = await db()
      .collection(sec.ACCOUNTS_COL)
      .find({}, { projection: { role: 1, status: 1, lastLoginAt: 1, createdAt: 1 } })
      .toArray();
    const by = {};
    let newToday = 0;
    const today = todayIn(tz);
    for (const a of accs) {
      const k = a.role;
      const x = by[k] || (by[k] = { total: 0, active30: 0, never: 0, disabled: 0 });
      x.total++;
      if (a.status === "disabled") x.disabled++;
      if (!a.lastLoginAt) x.never++;
      else if (now - new Date(a.lastLoginAt).getTime() <= 30 * 86400_000) x.active30++;
      if (a.createdAt && dayOf(a.createdAt, tz) === today) newToday++;
    }
    const sum = (f) => Object.values(by).reduce((s, x) => s + f(x), 0);
    return {
      byRole: by,
      total: accs.length,
      active30: sum((x) => x.active30),
      inactive: accs.length - sum((x) => x.active30),
      newToday,
      admins: (by.admin?.total || 0) + (by.superadmin?.total || 0),
    };
  }

  async function systemSnapshot() {
    const out = {
      server: {
        startedAt: new Date(STARTED_AT).toISOString(),
        uptimeSec: Math.round(process.uptime()),
        node: process.version,
        memoryMb: Math.round(process.memoryUsage().rss / 1048576),
        heapMb: Math.round(process.memoryUsage().heapUsed / 1048576),
        eventLoopMs: { mean: Math.round(eld.mean / 1e6), p99: Math.round(eld.percentile(99) / 1e6) },
        sseClients: typeof sseCount === "function" ? sseCount() : null,
      },
      requests: requestStats(),
      activeUsers: activeUsers(5),
      db: { ok: false },
    };
    try {
      const t0 = Date.now();
      await db().command({ ping: 1 });
      out.db = { ok: true, pingMs: Date.now() - t0, name: db().databaseName };
      try {
        const st = await db().stats();
        out.db.collections = st.collections;
        out.db.dataSizeMb = Math.round((st.dataSize / 1048576) * 10) / 10;
        out.db.storageSizeMb = Math.round((st.storageSize / 1048576) * 10) / 10;
      } catch {}
      const now = Date.now();
      const sess = await db()
        .collection("auth_sessions")
        .aggregate([
          { $match: { revokedAt: null, usedAt: null, lastUsedAt: { $gte: new Date(now - 30 * 60_000) } } },
          { $group: { _id: "$role", users: { $addToSet: "$accountId" } } },
        ])
        .toArray();
      out.sessions30m = Object.fromEntries(sess.map((s) => [s._id || "?", s.users.length]));
      const crm = await db().collection("crm_data").findOne({ _type: "main" }, { projection: { _updatedAt: 1 } });
      out.lastDataUpdate = crm?._updatedAt || null;
      const lb = await db().collection(BACKUP_COL).findOne({}, { sort: { createdAt: -1 }, projection: { createdAt: 1, reason: 1 } });
      out.lastBackup = lb ? { at: lb.createdAt, reason: lb.reason } : null;
      out.serverErrors24h = await db()
        .collection("security_audit")
        .countDocuments({ event: "server.error", at: { $gte: new Date(now - 86400_000) } });
      out.lastErrors = (
        await db()
          .collection("security_audit")
          .find({ event: "server.error" }, { projection: { at: 1, meta: 1, path: 1, method: 1 } })
          .sort({ at: -1 })
          .limit(10)
          .toArray()
      ).map((e) => ({ at: e.at, path: e.path, method: e.method, message: e.meta?.message || "" }));
    } catch (e) {
      out.db = { ok: false, error: "Bazaga ulanib bo'lmadi" };
    }
    out.notAvailable = ["CPU yuklamasi", "Disk hajmi"].map((x) => ({
      name: x,
      reason: "Hosting (Render) bu ma'lumotni ilovaga bermaydi — taxminiy qiymat ko'rsatilmaydi.",
    }));
    return out;
  }

  r.get("/api/super/overview", S, async (req, res) => {
    try {
      const L = await loadCtx(req);
      const { all, ctx, settings } = L;
      const fromDate = dayStartUtc(L.range.from, L.tz);
      const [accounts, security, system, recent] = await Promise.all([
        accountStats(L.range, L.tz),
        securitySummary(fromDate),
        systemSnapshot(),
        db()
          .collection("security_audit")
          .find({ actorRole: { $in: ["admin", "superadmin"] }, event: { $nin: ["auth.login.failed"] } }, { projection: { ua: 0 } })
          .sort({ at: -1 })
          .limit(12)
          .toArray(),
      ]);
      const insights = buildInsights(all, {
        monitor: system,
        failedLogins: security.failedLogins,
        serverErrors24h: system.serverErrors24h,
        thresholds: settings.notifications,
      });
      const top = all.teachers.filter((t) => t.score != null).sort((a, b) => b.score - a.score).slice(0, 5);
      res.json({
        ok: true,
        range: L.range,
        prevRange: L.prev,
        timezone: L.tz,
        dataUpdatedAt: L.dataUpdatedAt,
        stats: {
          students: all.students,
          teachers: { total: ctx.mentors.length, withGroups: all.teachers.filter((t) => t.activeGroups > 0).length },
          groups: { total: ctx.groups.length, active: all.groups.filter((g) => !g.archived).length },
          courses: ctx.courses.length,
          accounts,
          lessons: all.lessons,
          prevLessons: all.prevLessons,
          att: all.att,
          prevAtt: all.prevAtt,
          grades: all.grades,
          tests: all.tests,
          homework: { available: false, reason: HOMEWORK_INFO.reason },
        },
        series: series(ctx, all),
        growth: studentGrowth(ctx, L.range),
        topTeachers: top.map((t) => ({ id: t.id, name: t.name, score: t.score, confidence: t.confidence })),
        insights: insights.filter((i) => i.level === "alert" || i.level === "warn").slice(0, 6),
        security,
        system: {
          db: system.db,
          uptimeSec: system.server.uptimeSec,
          serverErrors24h: system.serverErrors24h,
          errorRate60: system.requests.last60,
          p95: system.requests.p95,
          lastErrors: system.lastErrors?.slice(0, 5) || [],
          activeUsers: system.activeUsers,
          lastBackup: system.lastBackup,
        },
        recentActivity: recent.map((e) => ({
          at: e.at, event: e.event, text: eventText(e), category: categoryOf(e.event), actor: e.actorName, role: e.actorRole, severity: e.severity,
        })),
      });
    } catch (e) {
      fail(res, e, "Statistika hisoblanmadi");
    }
  });

  // ═══════════════════════ ANALITIKA ═══════════════════════════════════════
  r.get("/api/super/analytics", S, async (req, res) => {
    try {
      const L = await loadCtx(req);
      const { all, ctx } = L;
      const lessons = all.P.L;
      // Darslar: o'qituvchi va guruh bo'yicha taqsimot
      const byGroup = all.groups.map((g) => ({
        id: g.id, name: g.name, mentorName: g.mentorName, archived: g.archived, ...g.lessons,
      }));
      const byTeacher = all.teachers.map((t) => ({ id: t.id, name: t.name, ...t.lessons }));
      const missedList = lessons
        .filter((x) => x.planned && x.past && !x.held)
        .slice(0, 300)
        .map((x) => {
          const g = ctx.groupById.get(x.gid);
          return { groupId: x.gid, group: g ? g.name : x.gid, mentor: g ? (ctx.mentorOfGroup(g) || {}).name || g.mentor || "—" : "—", day: x.day, lesson: x.l };
        })
        .sort((a, b) => (a.day < b.day ? 1 : -1));
      res.json({
        ok: true,
        range: L.range,
        prevRange: L.prev,
        timezone: L.tz,
        students: all.students,
        att: all.att,
        prevAtt: all.prevAtt,
        grades: all.grades,
        tests: all.tests,
        lessons: all.lessons,
        prevLessons: all.prevLessons,
        groups: all.groups,
        lessonsByGroup: byGroup,
        lessonsByTeacher: byTeacher,
        missedLessons: missedList,
        series: series(ctx, all),
        growth: studentGrowth(ctx, L.range),
        homework: HOMEWORK_INFO,
        marksLogSince: (await db().collection(LESSON_MARKS_COL).findOne({}, { sort: { firstMarkedAt: 1 }, projection: { firstMarkedAt: 1 } }).catch(() => null))?.firstMarkedAt || null,
      });
    } catch (e) {
      fail(res, e, "Analitika hisoblanmadi");
    }
  });

  r.get("/api/super/analytics/student/:id", S, async (req, res) => {
    try {
      const L = await loadCtx(req);
      const sid = clip(req.params.id, 40);
      const s = L.ctx.studentById.get(sid);
      if (!s) return res.status(404).json({ ok: false, error: "Talaba topilmadi" });
      const g = L.ctx.groupById.get(String(s.groupId));
      const member = L.all.groups.flatMap((x) => x.members).find((m) => m.id === sid) || null;
      res.json({
        ok: true,
        student: { id: sid, name: s.name, status: s.status || "Aktiv", group: g ? g.name : "—", groupId: s.groupId, joinDate: s.joinDate || null },
        period: member,
        dynamics: studentDynamics(L.ctx, sid, Math.min(12, Math.max(3, Number(req.query.months) || 6))),
      });
    } catch (e) {
      fail(res, e);
    }
  });

  // ═══════════════════════ O'QITUVCHILAR REYTINGI ══════════════════════════
  r.get("/api/super/teachers", S, async (req, res) => {
    try {
      const L = await loadCtx(req);
      res.json({
        ok: true,
        range: L.range,
        prevRange: L.prev,
        criteria: CRITERIA,
        ranking: L.settings.ranking,
        teachers: L.all.teachers,
        note:
          "Reyting tahlil va inson tomonidan ko'rib chiqish uchun. U ishga qabul qilish, ishdan bo'shatish yoki jazolash qarorini avtomatik qabul qilmaydi.",
        homeworkNote: "Uy vazifalarini tekshirish tezligi hisoblanmaydi — CRM'da uy vazifalari moduli yo'q.",
      });
    } catch (e) {
      fail(res, e);
    }
  });

  r.post("/api/super/teachers/criteria", S, async (req, res) => {
    const out = await saveSettings("ranking", req.body || {}, req.user);
    if (!out.ok) return res.status(400).json(out);
    await audit("super.settings.update", { req, actor: req.user, meta: { section: "ranking", value: out.value } });
    res.json({ ok: true, ranking: out.value });
  });

  // ═══════════════════════ TAVSIYALAR ══════════════════════════════════════
  r.get("/api/super/insights", S, async (req, res) => {
    try {
      const L = await loadCtx(req);
      const fromDate = dayStartUtc(L.range.from, L.tz);
      const [security, system] = await Promise.all([securitySummary(fromDate), systemSnapshot()]);
      res.json({
        ok: true,
        range: L.range,
        prevRange: L.prev,
        ai: aiStatus(),
        insights: buildInsights(L.all, {
          monitor: system,
          failedLogins: security.failedLogins,
          serverErrors24h: system.serverErrors24h,
          thresholds: L.settings.notifications,
        }),
      });
    } catch (e) {
      fail(res, e);
    }
  });

  // ═══════════════════════ MARKAZIY MA'LUMOTLAR ════════════════════════════
  const ENTITIES = ["students", "groups", "mentors", "courses", "lessons", "grades", "tests", "admins"];
  const STUDENT_STATUSES = ["Aktiv", "Faolsiz", "Muzlatilgan", "Probatsiya", "Arxiv"];
  const DAYS = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];

  async function entityRows(entity, L, showSensitive) {
    const { ctx, all } = L;
    if (entity === "students")
      return ctx.students.map((s) => {
        const g = ctx.groupById.get(String(s.groupId));
        const m = all.groups.find((x) => x.id === String(s.groupId))?.members.find((x) => x.id === String(s.id));
        return {
          id: String(s.id), name: s.name || "—", status: s.status || "Aktiv", groupId: s.groupId != null ? String(s.groupId) : "",
          group: g ? g.name : "—", joinDate: s.joinDate || "", phone: showSensitive ? s.phone || "" : maskPhone(s.phone),
          attendance: m ? m.att.pct : null, avgGrade: m ? m.avgGrade : null, isDebtor: !!s.isDebtor,
        };
      });
    if (entity === "groups")
      return all.groups.map((g) => ({
        id: g.id, name: g.name, course: g.course, mentorId: g.mentorId || "", mentor: g.mentorName, status: g.status || "—",
        days: (g.days || []).join(", "), size: g.size, attendance: g.att.pct, avgGrade: g.avgGrade, held: g.lessons.held,
      }));
    if (entity === "mentors")
      return all.teachers.map((t) => {
        const m = ctx.mentorById.get(t.id) || {};
        return {
          id: t.id, name: t.name, subject: m.subject || "", phone: showSensitive ? m.phone || "" : maskPhone(m.phone),
          groups: t.activeGroups, students: t.students, held: t.lessons.held, score: t.score, joinDate: m.joinDate || "",
        };
      });
    if (entity === "courses")
      return ctx.courses.map((c) => ({
        id: String(c.id), name: c.name || "—", price: c.price ?? null, duration: c.duration || "",
        groups: ctx.groups.filter((g) => String(g.courseId) === String(c.id) || g.course === c.name).length,
      }));
    if (entity === "lessons")
      return lessonsIn(ctx, L.range).map((x) => {
        const g = ctx.groupById.get(x.gid);
        return {
          id: `${x.gid}_${x.y}_${x.m}_${x.l}`, group: g ? g.name : x.gid, groupId: x.gid,
          mentor: g ? (ctx.mentorOfGroup(g) || {}).name || g.mentor || "—" : "—",
          day: x.day || `${x.y}-${String(x.m + 1).padStart(2, "0")} (sana noma'lum)`, lesson: x.l,
          state: x.held ? "o'tilgan" : x.past ? "belgilanmagan" : "rejada",
          present: x.K, absent: x.Y, excused: x.S, markedDay: x.markedDay || "",
        };
      });
    if (entity === "grades")
      return ctx.grades
        .filter((g) => !g.day || (g.day >= L.range.from && g.day <= L.range.to))
        .map((g, i) => {
          const s = ctx.studentById.get(g.sid);
          const gr = s ? ctx.groupById.get(String(s.groupId)) : null;
          return { id: g.sid + "_" + i, student: s ? s.name : g.sid, studentId: g.sid, group: gr ? gr.name : "—", score: g.score, day: g.day || "", mentor: g.mentor || "—" };
        });
    if (entity === "tests")
      return ctx.tests.map((t) => {
        const res = ctx.testResults.filter((x) => x.tid === String(t.id));
        const g = ctx.groupById.get(String(t.groupId));
        return {
          id: String(t.id), title: t.title || "Test", group: g ? g.name : "—", questions: Array.isArray(t.questions) ? t.questions.length : null,
          results: res.length, avgScore: res.length ? Math.round((res.reduce((s, x) => s + x.score, 0) / res.length) * 10) / 10 : null,
        };
      });
    if (entity === "admins") {
      const accs = await db()
        .collection(sec.ACCOUNTS_COL)
        .find({ role: { $in: ["admin", "superadmin"] } })
        .toArray();
      return accs.map((a) => ({
        id: String(a._id), username: a.username, name: a.name || a.username, role: a.role === "superadmin" ? "Super Admin" : "Admin",
        status: a.status || "active", lastLoginAt: a.lastLoginAt || null, createdAt: a.createdAt || null,
      }));
    }
    return [];
  }

  function queryRows(rows, q) {
    let out = rows;
    const term = String(q.q || "").trim().toLowerCase().slice(0, 80);
    if (term) out = out.filter((x) => Object.values(x).some((v) => v != null && String(v).toLowerCase().includes(term)));
    for (const k of ["status", "groupId", "mentorId", "state", "role"]) {
      const v = String(q[k] || "");
      if (v) out = out.filter((x) => String(x[k] ?? "") === v);
    }
    const sort = String(q.sort || "");
    if (sort && out.length && sort in out[0]) {
      const dir = q.dir === "desc" ? -1 : 1;
      out = out.slice().sort((a, b) => {
        const x = a[sort], y = b[sort];
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "uz")) * dir;
      });
    }
    return out;
  }

  r.get("/api/super/data/:entity", S, async (req, res) => {
    try {
      const entity = String(req.params.entity);
      if (!ENTITIES.includes(entity)) return res.status(404).json({ ok: false, error: "Noma'lum bo'lim" });
      const L = await loadCtx(req);
      const rows = queryRows(await entityRows(entity, L, false), req.query);
      const limit = Math.min(Math.max(Number(req.query.limit) || 25, 5), 200);
      const page = Math.max(Number(req.query.page) || 1, 1);
      res.json({
        ok: true,
        entity,
        range: L.range,
        total: rows.length,
        page,
        limit,
        rows: rows.slice((page - 1) * limit, page * limit),
        options: {
          groups: L.ctx.groups.map((g) => ({ id: String(g.id), name: g.name })),
          mentors: L.ctx.mentors.map((m) => ({ id: String(m.id), name: m.name })),
          statuses: STUDENT_STATUSES,
        },
      });
    } catch (e) {
      fail(res, e);
    }
  });

  async function entityHistory(entity, id) {
    const key = (entity === "mentors" ? "mentors" : entity) + ":" + id;
    const ev = await db()
      .collection("security_audit")
      .find({ "meta.ids": key }, { projection: { ua: 0 } })
      .sort({ at: -1 })
      .limit(50)
      .toArray();
    return ev.map((e) => ({ at: e.at, actor: e.actorName, role: e.actorRole, event: e.event, text: eventText(e) }));
  }

  r.get("/api/super/data/:entity/:id", S, async (req, res) => {
    try {
      const entity = String(req.params.entity);
      const id = clip(req.params.id, 60);
      if (!["students", "groups", "mentors", "courses"].includes(entity))
        return res.status(404).json({ ok: false, error: "Bu bo'lim uchun batafsil ko'rinish yo'q" });
      const L = await loadCtx(req);
      const list = L.D[entity] || [];
      const rec = list.find((x) => String(x.id) === id);
      if (!rec) return res.status(404).json({ ok: false, error: "Yozuv topilmadi" });
      // Ichki/og'ir maydonlar ko'rsatilmaydi (rasm, fayl, parol izlari)
      const { pass, password, newPassword, photo, resumeFile, resumeData, avatar, ...safe } = rec;
      const sensitive = ["phone", "parentPhone", "birthDate", "address", "email", "telegram"].filter((k) => safe[k]);
      if (sensitive.length)
        await audit("super.data.view_sensitive", { req, actor: req.user, target: { entity, id }, meta: { fields: sensitive } });
      let extra = null;
      if (entity === "students") extra = { dynamics: studentDynamics(L.ctx, id, 6) };
      if (entity === "groups") {
        const g = L.all.groups.find((x) => x.id === id);
        extra = g ? { stats: { att: g.att, avgGrade: g.avgGrade, lessons: g.lessons }, members: g.members } : null;
      }
      if (entity === "mentors") extra = { stats: L.all.teachers.find((t) => t.id === id) || null };
      res.json({ ok: true, entity, record: safe, extra, history: await entityHistory(entity, id), editable: EDITABLE[entity] || [] });
    } catch (e) {
      fail(res, e);
    }
  });

  // Super Admin tahrirlay oladigan maydonlar (qolgani — CRM panelida)
  const EDITABLE = {
    students: ["status", "groupId", "phone", "parentName", "parentPhone", "notes"],
    groups: ["status", "mentorId", "days"],
    mentors: ["phone", "telegram", "email"],
    courses: ["name", "price"],
  };
  function cleanField(entity, k, v, D) {
    if (entity === "students" && k === "status") return STUDENT_STATUSES.includes(v) ? v : undefined;
    if (k === "groupId") {
      const g = (D.groups || []).find((x) => String(x.id) === String(v));
      return g ? g.id : undefined;
    }
    if (k === "mentorId") {
      const m = (D.mentors || []).find((x) => String(x.id) === String(v));
      return m ? m.id : v === "" || v == null ? null : undefined;
    }
    if (k === "days") return Array.isArray(v) ? DAYS.filter((d) => v.includes(d)) : undefined;
    if (k === "price") return Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : undefined;
    if (entity === "groups" && k === "status") return ["Faol", "Kutilmoqda", "Man etilgan", "Arxiv"].includes(v) ? v : undefined;
    if (typeof v !== "string") return undefined;
    return v.replace(/[<>]/g, "").slice(0, k === "notes" ? 2000 : 200);
  }

  r.post("/api/super/data/:entity/:id", S, async (req, res) => {
    try {
      const entity = String(req.params.entity);
      const id = clip(req.params.id, 60);
      const allowed = EDITABLE[entity];
      if (!allowed) return res.status(400).json({ ok: false, error: "Bu bo'limni tahrirlab bo'lmaydi" });
      const col = db().collection("crm_data");
      const prev = await col.findOne({ _type: "main" });
      if (!prev) return res.status(404).json({ ok: false, error: "CRM ma'lumoti topilmadi" });
      const list = Array.isArray(prev[entity]) ? prev[entity].map((x) => ({ ...x })) : [];
      const idx = list.findIndex((x) => String(x.id) === id);
      if (idx < 0) return res.status(404).json({ ok: false, error: "Yozuv topilmadi" });
      const changes = {};
      for (const [k, v] of Object.entries(req.body?.fields || {})) {
        if (!allowed.includes(k)) continue;
        const cv = cleanField(entity, k, v, prev);
        if (cv === undefined) return res.status(400).json({ ok: false, error: `«${k}» qiymati noto'g'ri` });
        if (JSON.stringify(list[idx][k]) !== JSON.stringify(cv)) changes[k] = cv;
      }
      if (!Object.keys(changes).length) return res.json({ ok: true, unchanged: true });
      Object.assign(list[idx], changes);
      if (entity === "groups" && "mentorId" in changes) {
        const m = (prev.mentors || []).find((x) => String(x.id) === String(changes.mentorId));
        list[idx].mentor = m ? m.name : "";
      }
      await snapshotCrmData(prev, "pre-super-edit");
      await col.updateOne({ _type: "main" }, { $set: { [entity]: list, _updatedAt: new Date() } });
      // KV nusxasi ham yangilanadi — portallar o'zgarishni darhol ko'radi
      try {
        const kv = await db().collection("kv").findOne({ key: CRM_KV_KEY });
        if (kv) {
          const obj = JSON.parse(String(kv.value));
          obj[entity] = list;
          await db().collection("kv").updateOne({ key: CRM_KV_KEY }, { $set: { value: JSON.stringify(obj), _updatedAt: new Date() } });
        }
      } catch {}
      const ch = summarizeCrmChange({ [entity]: prev[entity] }, { [entity]: list });
      await audit("super.data.edit", {
        req,
        actor: req.user,
        target: { entity, id },
        meta: { summary: ch?.summary || entity, fields: Object.keys(changes), ids: [entity + ":" + id] },
        severity: "warn",
      });
      broadcast([CRM_KV_KEY]);
      res.json({ ok: true, changed: Object.keys(changes) });
    } catch (e) {
      fail(res, e, "Saqlanmadi");
    }
  });

  r.get("/api/super/data/:entity/export/:format", S, exportLimiter, async (req, res) => {
    try {
      const entity = String(req.params.entity);
      const format = String(req.params.format);
      if (!ENTITIES.includes(entity) || !MIME[format]) return res.status(400).json({ ok: false, error: "Noto'g'ri so'rov" });
      const L = await loadCtx(req);
      const rows = queryRows(await entityRows(entity, L, false), req.query);
      const cols = rows.length ? Object.keys(rows[0]) : ["—"];
      const rep = {
        title: `Ma'lumotlar: ${entity}`,
        period: ["lessons", "grades"].includes(entity) ? L.range.label : "Joriy holat",
        source: "CRM bazasi (crm_data) / hisoblar (accounts)",
        method: "Jadvaldagi filtr va qidiruv natijasi. Telefon raqamlari qisman yashirilgan.",
        generatedAt: new Date().toLocaleString("uz-UZ", { timeZone: L.tz }),
        generatedBy: req.user.username,
        filters: ["q", "status", "groupId", "mentorId", "state"].filter((k) => req.query[k]).map((k) => `${k}=${clip(req.query[k], 40)}`).join(", "),
        columns: cols,
        rows: rows.map((r0) => cols.map((c) => r0[c])),
      };
      await audit("super.export", { req, actor: req.user, meta: { entity, format, rows: rows.length } });
      res.setHeader("Content-Type", MIME[format]);
      res.setHeader("Content-Disposition", `attachment; filename="${entity}_${new Date().toISOString().slice(0, 10)}.${format}"`);
      res.send(render(rep, format));
    } catch (e) {
      fail(res, e, "Eksport bajarilmadi");
    }
  });

  // ═══════════════════════ ADMINISTRATORLAR ════════════════════════════════
  r.get("/api/super/admins", S, async (req, res) => {
    try {
      const accs = await db()
        .collection(sec.ACCOUNTS_COL)
        .find({ role: { $in: ["admin", "superadmin"] } })
        .toArray();
      const ids = accs.map((a) => String(a._id));
      const sess = await db()
        .collection("auth_sessions")
        .aggregate([
          { $match: { accountId: { $in: ids }, revokedAt: null, usedAt: null, expiresAt: { $gt: new Date() } } },
          { $group: { _id: "$accountId", n: { $sum: 1 }, last: { $max: "$lastUsedAt" } } },
        ])
        .toArray();
      const sm = new Map(sess.map((s) => [s._id, s]));
      res.json({
        ok: true,
        modules: MODULES.map((m) => ({ key: m.key, label: m.label })),
        admins: accs.map((a) => ({
          ...sec.publicView(a),
          firstName: a.firstName || "",
          lastName: a.lastName || "",
          fullName: displayName(a),
          failedAttempts: a.failedAttempts || 0,
          lastFailedAt: a.lastFailedAt || null,
          restrictions: a.restrictions || null,
          activeSessions: sm.get(String(a._id))?.n || 0,
          lastActivity: sm.get(String(a._id))?.last || null,
          resetPending: a.resetToken ? { expiresAt: a.resetToken.expiresAt } : null,
          self: String(a._id) === req.user.sub,
        })),
      });
    } catch (e) {
      fail(res, e);
    }
  });

  /** Ism yoki familiya: harflar, bo'sh joy, apostrof, chiziqcha (2–40 belgi). */
  function personName(v) {
    const x = String(v || "").replace(/\s+/g, " ").trim();
    if (x.length < 2 || x.length > 40) return null;
    if (!/^[\p{L}][\p{L}\p{M}' ʻʼ‘’`.-]*$/u.test(x)) return null;
    return x;
  }
  function namesFrom(body) {
    let first = personName(body?.firstName);
    let last = personName(body?.lastName);
    // Eski mijozlar (va AI) faqat "name" yuborishi mumkin: "Ism Familiya"
    if ((!first || !last) && body?.name) {
      const parts = String(body.name).replace(/\s+/g, " ").trim().split(" ");
      first = first || personName(parts[0]);
      last = last || personName(parts.slice(1).join(" "));
    }
    return first && last ? { first, last } : null;
  }
  async function forgetDeleted(username) {
    await db()
      .collection("system_settings")
      .updateOne({ _id: DELETED_ACCOUNTS_DOC }, { $unset: { ["usernames." + username]: "" } })
      .catch(() => {});
  }

  r.post("/api/super/admins", S, sensitiveLimiter, async (req, res) => {
    const username = sec.safeUsername(req.body?.username);
    if (!username) return res.status(400).json({ ok: false, error: "Login yaroqsiz (3–64 belgi: a-z 0-9 . _ - @ +)" });
    const nm = namesFrom(req.body);
    if (!nm) return res.status(400).json({ ok: false, error: "Ism va familiyani kiriting (har biri 2–40 harf)" });
    if (await db().collection(sec.ACCOUNTS_COL).findOne({ username }))
      return res.status(400).json({ ok: false, error: "Bu login band" });
    const password = String(req.body?.password ?? "");
    if (!password) return res.status(400).json({ ok: false, error: "Parolni kiriting" });
    // Login va parolni Super Admin o'zi beradi; parol bazada faqat xesh holida saqlanadi
    // va javobda qaytarilmaydi.
    const name = clip(nm.first + " " + nm.last, 120);
    const out = await sec.upsertAccount({ username, role: "admin", name, password });
    if (!out.ok) return res.status(400).json(out);
    await db()
      .collection(sec.ACCOUNTS_COL)
      .updateOne({ _id: out.account._id }, { $set: { firstName: nm.first, lastName: nm.last } });
    // Shu login avval o'chirilgan bo'lsa — endi qayta ishlatilmoqda
    await forgetDeleted(username);
    await audit("super.admin.create", { req, actor: req.user, target: { username, name }, severity: "warn" });
    res.json({ ok: true, account: sec.publicView(out.account) });
  });

  async function targetAdmin(req, res) {
    const id = sec.safeObjectIdHex(req.params.id);
    const acc = id ? await sec.findById(id) : null;
    if (!acc || !["admin", "superadmin"].includes(acc.role)) {
      res.status(404).json({ ok: false, error: "Administrator topilmadi" });
      return null;
    }
    return acc;
  }

  r.get("/api/super/admins/:id", S, async (req, res) => {
    const acc = await targetAdmin(req, res);
    if (!acc) return;
    const activity = await db()
      .collection("security_audit")
      .find({ actorId: String(acc._id) }, { projection: { ua: 0 } })
      .sort({ at: -1 })
      .limit(100)
      .toArray();
    res.json({
      ok: true,
      account: { ...sec.publicView(acc), restrictions: acc.restrictions || null, failedAttempts: acc.failedAttempts || 0 },
      sessions: await sec.listSessions(String(acc._id)),
      activity: activity.map((e) => ({ at: e.at, event: e.event, text: eventText(e), category: categoryOf(e.event), ip: e.ip, severity: e.severity })),
    });
  });

  r.post("/api/super/admins/:id/profile", S, async (req, res) => {
    const acc = await targetAdmin(req, res);
    if (!acc) return;
    const nm = namesFrom(req.body);
    if (!nm) return res.status(400).json({ ok: false, error: "Ism va familiyani kiriting (har biri 2–40 harf)" });
    const name = clip(nm.first + " " + nm.last, 120);
    await db()
      .collection(sec.ACCOUNTS_COL)
      .updateOne({ _id: acc._id }, { $set: { firstName: nm.first, lastName: nm.last, name, updatedAt: new Date() } });
    sec.invalidateAccount(String(acc._id), acc.username);
    await audit("super.admin.profile", { req, actor: req.user, target: { username: acc.username, name } });
    res.json({ ok: true, name });
  });

  /**
   * Administratorni BUTUNLAY o'chirish. Xavfli amal — Super Admin paroli
   * bilan qayta tasdiqlanadi. Hisob va sessiyalari o'chadi; faoliyat tarixi
   * (jurnal) saqlanib qoladi va unda ism-familiya ko'rinishda davom etadi.
   * Login «o'chirilganlar» ro'yxatiga yoziladi — server qayta ishga tushganda
   * ENV yoki boshlang'ich admin qoidasi uni qayta yaratib qo'ymaydi.
   */
  r.post("/api/super/admins/:id/delete", S, sensitiveLimiter, async (req, res) => {
    const acc = await targetAdmin(req, res);
    if (!acc) return;
    if (acc.role === "superadmin" || String(acc._id) === req.user.sub)
      return res.status(400).json({ ok: false, error: "Super Admin hisobini o'chirib bo'lmaydi" });
    if (String(req.body?.confirm || "").trim().toLowerCase() !== acc.username)
      return res.status(400).json({ ok: false, error: "Tasdiqlash uchun administrator loginini aynan yozing" });
    if (!(await reauth(req, res))) return;
    const id = String(acc._id);
    const name = displayName(acc);
    await sec.revokeAllForAccount(id, "super-deleted").catch(() => 0);
    await sec.bumpTokenVersion(id).catch(() => {});
    await db()
      .collection("system_settings")
      .updateOne(
        { _id: DELETED_ACCOUNTS_DOC },
        { $set: { ["usernames." + acc.username]: { id, name, role: acc.role, at: new Date(), by: req.user.username } } },
        { upsert: true },
      );
    await db().collection(sec.ACCOUNTS_COL).deleteOne({ _id: acc._id });
    sec.invalidateAccount(id, acc.username);
    await audit("super.admin.delete", { req, actor: req.user, target: { username: acc.username, name }, severity: "critical" });
    res.json({ ok: true });
  });

  r.post("/api/super/admins/:id/status", S, async (req, res) => {
    const acc = await targetAdmin(req, res);
    if (!acc) return;
    if (acc.role === "superadmin") return res.status(400).json({ ok: false, error: "Super Admin hisobini bloklab bo'lmaydi" });
    const status = req.body?.status === "disabled" ? "disabled" : "active";
    await sec.setStatus(String(acc._id), status);
    if (status === "disabled") await sec.revokeAllForAccount(String(acc._id), "super-disabled");
    await audit("super.admin.status", { req, actor: req.user, target: { username: acc.username, status }, severity: "warn" });
    res.json({ ok: true });
  });

  r.post("/api/super/admins/:id/sessions/revoke", S, async (req, res) => {
    const acc = await targetAdmin(req, res);
    if (!acc) return;
    let n = 0;
    if (req.body?.all) {
      n = await sec.revokeAllForAccount(String(acc._id), "super-revoke-all");
      await sec.bumpTokenVersion(String(acc._id)); // ochiq access tokenlar ham darhol o'ladi
    } else if (await sec.revokeSessionById(String(acc._id), String(req.body?.sessionId || ""))) n = 1;
    await audit("super.admin.sessions_revoked", { req, actor: req.user, target: { username: acc.username }, meta: { count: n, all: !!req.body?.all }, severity: "warn" });
    res.json({ ok: true, revoked: n });
  });

  // Administrator parolini Super Admin o'zi yangisiga almashtiradi (havolasiz).
  // Eski parol ko'rsatilmaydi; almashgach adminning barcha sessiyalari yopiladi.
  r.post("/api/super/admins/:id/password", S, sensitiveLimiter, async (req, res) => {
    const acc = await targetAdmin(req, res);
    if (!acc) return;
    if (acc.role === "superadmin")
      return res.status(400).json({ ok: false, error: "O'z parolingizni «Profil va xavfsizlik» bo'limida almashtiring" });
    const password = String(req.body?.password ?? "");
    if (!password) return res.status(400).json({ ok: false, error: "Yangi parolni kiriting" });
    const out = await sec.setPasswordInternal(String(acc._id), password, req, "super.admin.password_set", req.user);
    if (!out.ok) return res.status(400).json(out);
    await sec.revokeAllForAccount(String(acc._id), "super-password-set").catch(() => 0);
    res.json({ ok: true });
  });

  r.post("/api/super/admins/:id/restrictions", S, async (req, res) => {
    const acc = await targetAdmin(req, res);
    if (!acc) return;
    if (acc.role === "superadmin") return res.status(400).json({ ok: false, error: "Super Admin cheklanmaydi" });
    const modules = {};
    for (const m of MODULES) {
      const x = req.body?.modules?.[m.key];
      if (!x) continue;
      const api = x.api !== false;
      const menu = x.menu !== false && api;
      if (!api || !menu) modules[m.key] = { menu, api };
    }
    const restrictions = Object.keys(modules).length ? { modules, updatedAt: new Date(), updatedBy: req.user.username } : null;
    await db()
      .collection(sec.ACCOUNTS_COL)
      .updateOne({ _id: acc._id }, restrictions ? { $set: { restrictions } } : { $unset: { restrictions: "" } });
    sec.invalidateAccount(String(acc._id), acc.username);
    await audit("super.admin.restrictions", { req, actor: req.user, target: { username: acc.username }, meta: { modules }, severity: "warn" });
    res.json({ ok: true, restrictions });
  });

  // ═══════════════════════ MENYU VA MODULLAR ═══════════════════════════════
  r.get("/api/super/modules", S, async (req, res) => {
    const s = await getSettings();
    res.json({
      ok: true,
      modules: MODULES.map((m) => ({
        key: m.key, label: m.label, nav: m.nav,
        affects: {
          write: m.write, read: m.read, endpoints: m.endpoints.map((e) => e.prefix),
        },
        state: s.modules[m.key] || { menu: true, api: true },
      })),
      locked: [{ key: "settings", label: "Sozlamalar", reason: "Bu bo'lim har doim ochiq — aks holda admin tizimni boshqara olmay qoladi" }],
      settingsMenu: s.settingsMenu,
    });
  });

  r.post("/api/super/modules", S, async (req, res) => {
    const prevAll = await getSettings();
    const before = prevAll.modules;
    const out = await saveSettings("modules", req.body?.modules || {}, req.user);
    if (!out.ok) return res.status(400).json(out);
    // Sozlamalar → «Menyu bo'limlari» (admin / mentor / talaba)
    let sm = prevAll.settingsMenu;
    if (req.body?.settingsMenu && typeof req.body.settingsMenu === "object") {
      const o2 = await saveSettings("settingsMenu", req.body.settingsMenu, req.user);
      if (o2.ok) {
        if (JSON.stringify(o2.value) !== JSON.stringify(sm))
          await audit("super.modules.update", {
            req,
            actor: req.user,
            meta: { settingsMenu: Object.entries(o2.value).map(([k, v]) => `${k}: ${v ? "ochiq" : "yopiq"}`).join(", ") },
            severity: "warn",
          });
        sm = o2.value;
      }
    }
    const changed = Object.keys(out.value).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(out.value[k]));
    await audit("super.modules.update", {
      req,
      actor: req.user,
      meta: { changed: changed.map((k) => `${k}: menyu=${out.value[k].menu ? "ha" : "yo'q"}, api=${out.value[k].api ? "ha" : "yo'q"}`) },
      severity: "warn",
    });
    // Ochiq admin panellar menyuni darhol yangilaydi
    broadcast(["__modules__"]);
    res.json({ ok: true, modules: out.value, settingsMenu: sm });
  });

  // ═══════════════════════ SOZLAMALAR ══════════════════════════════════════
  r.get("/api/super/settings", S, async (req, res) => {
    const s = await getSettings();
    let branding = {};
    try {
      const kv = await db().collection("kv").findOne({ key: "edumanage_branding_v1" });
      branding = kv ? JSON.parse(String(kv.value)) : {};
    } catch {}
    res.json({
      ok: true,
      settings: s,
      defaults: defaultSettings(),
      branding: {
        crmName: branding.crmName && branding.crmName !== "EduManage" ? branding.crmName : "UFQ CRM",
        crmLogo: branding.crmLogo || null,
        defaultAccent: branding.defaultAccent || "blue",
        defaultTheme: branding.defaultTheme || "auto",
      },
      timezones: ["Asia/Tashkent", "Asia/Samarkand", "Asia/Almaty", "Asia/Bishkek", "Asia/Dushanbe", "Europe/Moscow", "UTC"],
    });
  });

  r.post("/api/super/settings/:section", S, async (req, res) => {
    const section = String(req.params.section);
    if (!["general", "notifications", "ranking", "attendance"].includes(section))
      return res.status(400).json({ ok: false, error: "Noma'lum bo'lim" });
    const out = await saveSettings(section, req.body || {}, req.user);
    if (!out.ok) return res.status(400).json(out);
    await audit("super.settings.update", { req, actor: req.user, meta: { section, value: out.value }, severity: "warn" });
    // Davomat qoidasi o'zgarsa — ochiq panellar qayta hisoblasin
    if (section === "attendance") broadcast(["edumanage_attendance_rules"]);
    res.json({ ok: true, value: out.value });
  });

  const ACCENTS = ["blue", "teal", "purple", "orange", "rose", "green"];
  r.post("/api/super/branding", S, async (req, res) => {
    try {
      const b = req.body || {};
      const col = db().collection("kv");
      const cur = await col.findOne({ key: "edumanage_branding_v1" });
      let obj = {};
      try { obj = cur ? JSON.parse(String(cur.value)) : {}; } catch {}
      if (b.crmName != null) {
        const n = String(b.crmName).replace(/[<>]/g, "").trim().slice(0, 40);
        if (!n) return res.status(400).json({ ok: false, error: "CRM nomi bo'sh bo'lmasin" });
        obj.crmName = n;
      }
      if (b.crmLogo !== undefined) {
        if (b.crmLogo === null || b.crmLogo === "") obj.crmLogo = null;
        else {
          const s = String(b.crmLogo);
          if (!/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s))
            return res.status(400).json({ ok: false, error: "Logo PNG/JPG/WEBP rasm bo'lsin" });
          if (s.length > 400_000) return res.status(413).json({ ok: false, error: "Logo 300 KB dan kichik bo'lsin" });
          obj.crmLogo = s;
        }
      }
      if (b.defaultAccent != null) {
        if (!ACCENTS.includes(b.defaultAccent)) return res.status(400).json({ ok: false, error: "Rang noto'g'ri" });
        obj.defaultAccent = b.defaultAccent;
      }
      if (b.defaultTheme != null) {
        if (!["auto", "light", "dark"].includes(b.defaultTheme)) return res.status(400).json({ ok: false, error: "Mavzu noto'g'ri" });
        obj.defaultTheme = b.defaultTheme;
      }
      await col.updateOne(
        { key: "edumanage_branding_v1" },
        { $set: { key: "edumanage_branding_v1", value: JSON.stringify(obj), _updatedAt: new Date() } },
        { upsert: true },
      );
      await audit("super.branding.update", {
        req,
        actor: req.user,
        meta: { crmName: obj.crmName, logo: obj.crmLogo ? "o'rnatilgan" : "yo'q", defaultAccent: obj.defaultAccent, defaultTheme: obj.defaultTheme },
        severity: "warn",
      });
      broadcast(["edumanage_branding_v1"]);
      res.json({ ok: true, branding: { crmName: obj.crmName, crmLogo: obj.crmLogo || null, defaultAccent: obj.defaultAccent || "blue", defaultTheme: obj.defaultTheme || "auto" } });
    } catch (e) {
      fail(res, e, "Saqlanmadi");
    }
  });

  // ═══════════════════════ MONITORING ══════════════════════════════════════
  r.get("/api/super/monitor", S, async (req, res) => {
    try {
      res.json({ ok: true, now: new Date().toISOString(), ...(await systemSnapshot()) });
    } catch (e) {
      fail(res, e);
    }
  });

  // ═══════════════════════ FAOLIYAT TARIXI ═════════════════════════════════
  async function activityQuery(q, tz) {
    const to = isoOrNull(q.to) || new Date();
    const from = isoOrNull(q.from) || new Date(to.getTime() - 7 * 86400_000);
    const match = { at: { $gte: from, $lte: to } };
    const cat = CATEGORIES.find(([label]) => label === String(q.category || ""));
    if (cat) match.event = { $regex: cat[1].source };
    const actor = String(q.actor || "").replace(/[^a-z0-9._@+-]/gi, "").slice(0, 64).toLowerCase();
    if (actor) match.actorName = actor;
    const role = String(q.role || "");
    if (["admin", "superadmin", "mentor", "student"].includes(role)) match.actorRole = role;
    const sev = String(q.severity || "");
    if (["info", "warn", "critical"].includes(sev)) match.severity = sev;
    const term = String(q.q || "").trim().slice(0, 60);
    if (term) {
      const re = { $regex: escRe(term), $options: "i" };
      match.$or = [{ event: re }, { actorName: re }, { path: re }, { ip: re }, { "meta.summary": re }];
    }
    return { match, from, to };
  }

  const fmtAt = (d, tz) => {
    try {
      return new Date(d).toLocaleString("uz-UZ", { timeZone: tz, hour12: false });
    } catch {
      return new Date(d).toISOString();
    }
  };

  // ── Xodimlar ma'lumotnomasi: hisob id / login → ism, rol ─────────────────
  // Jurnalda faqat login turadi. Ism-familiya hisobdan olinadi — admin keyin
  // ism kiritsa ham eski yozuvlarda to'g'ri ism ko'rinadi. O'chirilgan
  // administratorlar nomi `deleted_accounts` dan olinadi.
  const PLACEHOLDER_NAMES = new Set(["administrator", "admin", ""]);
  function displayName(acc) {
    const n = String(acc?.name || "").trim();
    if (!n || PLACEHOLDER_NAMES.has(n.toLowerCase()) || n === acc?.username) return "";
    return n.split(" — ")[0];
  }
  async function staffDirectory() {
    const accs = await db()
      .collection(sec.ACCOUNTS_COL)
      .find({}, { projection: { username: 1, name: 1, role: 1, status: 1, lastLoginAt: 1, mentorName: 1, studentName: 1 } })
      .toArray();
    const byId = new Map();
    const byName = new Map();
    for (const a of accs) {
      const p = {
        id: String(a._id),
        username: a.username,
        name: displayName(a) || (a.role === "mentor" && a.mentorName) || (a.role === "student" && String(a.studentName || "").split(" — ")[0]) || "",
        role: a.role,
        roleText: ROLE_TEXT[a.role] || a.role,
        status: a.status || "active",
        lastLoginAt: a.lastLoginAt || null,
        deleted: false,
      };
      byId.set(p.id, p);
      byName.set(p.username, p);
    }
    const tomb = await db().collection("system_settings").findOne({ _id: DELETED_ACCOUNTS_DOC }).catch(() => null);
    for (const [username, t] of Object.entries(tomb?.usernames || {})) {
      if (byName.has(username)) continue;
      const role = (t && t.role) || "admin";
      const p = { id: (t && t.id) || "", username, name: (t && t.name) || "", role, roleText: ROLE_TEXT[role] || role, status: "deleted", lastLoginAt: null, deleted: true };
      byName.set(username, p);
      if (p.id) byId.set(p.id, p);
    }
    return {
      byId,
      byName,
      person(e) {
        const p = (e.actorId && byId.get(String(e.actorId))) || (e.actorName && byName.get(e.actorName));
        if (p) return p;
        if (!e.actorName && !e.actorRole) return { id: "", username: "", name: "Tizim", role: "system", roleText: "Tizim", deleted: false };
        return { id: e.actorId || "", username: e.actorName || "", name: "", role: e.actorRole || "", roleText: ROLE_TEXT[e.actorRole] || e.actorRole || "", deleted: false };
      },
      nameOf(username) {
        const p = byName.get(username);
        return p ? (p.name ? `${p.name} (${p.username})` : p.username) : username;
      },
    };
  }
  async function crmNames() {
    const D = (await db().collection("crm_data").findOne({ _type: "main" }, { projection: { groups: 1, students: 1 } })) || {};
    return crmLookups(D);
  }
  function viewEvent(e, dir, lookups) {
    const d = describeEvent(e, { lookups, nameOf: dir.nameOf, fallback: eventText });
    const p = dir.person(e);
    return {
      id: String(e._id),
      at: e.at,
      kind: kindOf(e.event),
      title: d.title,
      details: d.details,
      person: { id: p.id, name: p.name, username: p.username || e.actorName || "", role: p.role, roleText: p.roleText, deleted: !!p.deleted },
      ip: e.ip || "",
      device: deviceText(e.ua),
      severity: e.severity,
      event: e.event,
      category: categoryOf(e.event),
    };
  }
  /** scope: staff (admin + mentor, standart) | admin | mentor | all */
  function scopeRoles(scope) {
    if (scope === "admin") return ["admin"];
    if (scope === "mentor") return ["mentor"];
    if (scope === "all") return null;
    return STAFF_ROLES;
  }
  const LOGIN_EVENTS = ["auth.login.success", "auth.logout", "auth.login.failed", "auth.revoke_all"];
  const KIND_MATCH = {
    login: { event: { $in: LOGIN_EVENTS } },
    data: {
      event: {
        $in: [
          "data.change", "admin.accounts.sync", "admin.accounts.remove", "admin.accounts.rename", "admin.account.upsert",
          "admin.account.status", "admin.account.delete", "settings.change", "blob.delete", "notify.sms", "report.export",
        ],
      },
    },
    warn: { severity: { $in: ["warn", "critical"] } },
  };

  r.get("/api/super/activity", S, async (req, res) => {
    try {
      const tz = (await getSettings()).general.timezone;
      const { match, from, to } = await activityQuery(req.query, tz);
      const roles = scopeRoles(String(req.query.scope || "staff"));
      if (roles && !match.actorRole) match.actorRole = { $in: roles };
      const personId = sec.safeObjectIdHex(req.query.person);
      if (personId) match.actorId = personId;
      const kind = KIND_MATCH[String(req.query.kind || "")];
      if (kind) Object.assign(match, kind);
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 200);
      const page = Math.max(Number(req.query.page) || 1, 1);
      const col = db().collection("security_audit");
      // Xodimlar kartochkalari uchun — tanlangan shaxs va tur filtrisiz (faqat davr va rol)
      const peopleMatch = { at: match.at, actorId: { $ne: null } };
      if (roles) peopleMatch.actorRole = { $in: roles };
      const [total, events, byDay, stats, dir, lookups] = await Promise.all([
        col.countDocuments(match),
        col.find(match).sort({ at: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
        col
          .aggregate([
            { $match: match },
            {
              $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$at", timezone: tz } },
                n: { $sum: 1 },
                warn: { $sum: { $cond: [{ $in: ["$severity", ["warn", "critical"]] }, 1, 0] } },
              },
            },
            { $sort: { _id: 1 } },
          ])
          .toArray(),
        col
          .aggregate([
            { $match: peopleMatch },
            { $sort: { at: 1 } },
            {
              $group: {
                _id: "$actorId",
                n: { $sum: 1 },
                logins: { $sum: { $cond: [{ $eq: ["$event", "auth.login.success"] }, 1, 0] } },
                failed: { $sum: { $cond: [{ $eq: ["$event", "auth.login.failed"] }, 1, 0] } },
                changes: { $sum: { $cond: [{ $eq: ["$event", "data.change"] }, 1, 0] } },
                actions: { $sum: { $cond: [{ $in: ["$event", LOGIN_EVENTS] }, 0, 1] } },
                lastLogin: { $max: { $cond: [{ $eq: ["$event", "auth.login.success"] }, "$at", null] } },
                lastAt: { $max: "$at" },
                name: { $last: "$actorName" },
                role: { $last: "$actorRole" },
              },
            },
          ])
          .toArray(),
        staffDirectory(),
        crmNames(),
      ]);
      // Faol sessiyalar — hozir kim tizimda
      const ids = [...dir.byId.values()].filter((p) => !p.deleted && (!roles || roles.includes(p.role))).map((p) => p.id);
      const sess = await db()
        .collection("auth_sessions")
        .aggregate([
          { $match: { accountId: { $in: ids }, revokedAt: null, usedAt: null, expiresAt: { $gt: new Date() } } },
          { $group: { _id: "$accountId", n: { $sum: 1 }, last: { $max: "$lastUsedAt" } } },
        ])
        .toArray()
        .catch(() => []);
      const sm = new Map(sess.map((s) => [s._id, s]));
      const st = new Map(stats.map((s) => [String(s._id), s]));
      const people = [];
      const seen = new Set();
      const allowed = roles || ["admin", "mentor", "superadmin"];
      for (const p of dir.byId.values()) {
        if (p.deleted || !allowed.includes(p.role)) continue;
        const s = st.get(p.id) || {};
        seen.add(p.id);
        people.push({
          ...p,
          events: s.n || 0, logins: s.logins || 0, failed: s.failed || 0, changes: s.changes || 0, actions: s.actions || 0,
          lastLoginInRange: s.lastLogin || null, lastAt: s.lastAt || null,
          activeSessions: sm.get(p.id)?.n || 0, lastSeen: sm.get(p.id)?.last || null,
        });
      }
      // O'chirilgan, lekin shu davrda harakati bo'lgan xodimlar
      for (const s of stats) {
        const id = String(s._id);
        if (seen.has(id) || !allowed.includes(s.role)) continue;
        const p = dir.byId.get(id) || dir.byName.get(s.name);
        // Hisob bor, faqat roli o'zgargan (masalan Super Admin'ga ko'tarilgan) — o'chirilgan emas
        if (p && !p.deleted) continue;
        people.push({
          ...(p || { id, username: s.name || "", name: "", role: s.role, roleText: ROLE_TEXT[s.role] || s.role, status: "deleted" }),
          id,
          deleted: true,
          events: s.n, logins: s.logins, failed: s.failed, changes: s.changes, actions: s.actions,
          lastLoginInRange: s.lastLogin || null, lastAt: s.lastAt || null, activeSessions: 0, lastSeen: null,
        });
      }
      const ord = { admin: 0, mentor: 1, superadmin: 2 };
      people.sort(
        (a, b) =>
          (a.deleted ? 1 : 0) - (b.deleted ? 1 : 0) ||
          (ord[a.role] ?? 9) - (ord[b.role] ?? 9) ||
          (b.events || 0) - (a.events || 0) ||
          String(a.name || a.username).localeCompare(String(b.name || b.username)),
      );
      res.json({
        ok: true,
        from, to, total, page, limit,
        people,
        events: events.map((e) => viewEvent(e, dir, lookups)),
        byDay: byDay.map((d) => ({ day: d._id, n: d.n, warn: d.warn })),
        retentionDays: sec.CONFIG.auditRetentionDays,
      });
    } catch (e) {
      fail(res, e, "Jurnal o'qilmadi");
    }
  });

  // Bitta xodim: qachon kirgan (soat, qurilma, IP), hozir qaysi qurilmalarda ochiq va nima qilgan
  r.get("/api/super/activity/person/:id", S, async (req, res) => {
    try {
      const id = sec.safeObjectIdHex(req.params.id);
      if (!id) return res.status(400).json({ ok: false, error: "Noto'g'ri id" });
      const tz = (await getSettings()).general.timezone;
      const { from, to } = await activityQuery(req.query, tz);
      const [dir, lookups] = await Promise.all([staffDirectory(), crmNames()]);
      const p = dir.byId.get(id) || { id, username: "", name: "", role: "", roleText: "", deleted: true };
      const col = db().collection("security_audit");
      const base = { actorId: id, at: { $gte: from, $lte: to } };
      const [logins, actions, sessions] = await Promise.all([
        col.find({ ...base, event: { $in: LOGIN_EVENTS } }).sort({ at: -1 }).limit(200).toArray(),
        col.find({ ...base, event: { $nin: LOGIN_EVENTS } }).sort({ at: -1 }).limit(300).toArray(),
        p.deleted ? [] : sec.listSessions(id),
      ]);
      if (!p.username && (logins[0] || actions[0])) p.username = (logins[0] || actions[0]).actorName || "";
      res.json({
        ok: true,
        from, to,
        person: p,
        logins: logins.map((e) => viewEvent(e, dir, lookups)),
        actions: actions.map((e) => viewEvent(e, dir, lookups)),
        sessions: sessions.map((s) => ({ id: s.id, createdAt: s.createdAt, lastUsedAt: s.lastUsedAt, ip: s.ip, device: deviceText(s.ua) })),
      });
    } catch (e) {
      fail(res, e, "Ma'lumot o'qilmadi");
    }
  });

  // ═══════════════════════ HISOBOTLAR ══════════════════════════════════════
  r.get("/api/super/reports", S, (req, res) => {
    res.json({ ok: true, reports: Object.entries(REPORTS).map(([key, title]) => ({ key, title })), formats: ["csv", "xlsx", "pdf"] });
  });

  r.get("/api/super/reports/:kind", S, exportLimiter, async (req, res) => {
    try {
      const kind = String(req.params.kind);
      if (!REPORTS[kind]) return res.status(404).json({ ok: false, error: "Noma'lum hisobot" });
      const format = String(req.query.format || "json");
      if (format !== "json" && !MIME[format]) return res.status(400).json({ ok: false, error: "Format: json, csv, xlsx yoki pdf" });
      const L = await loadCtx(req);
      const extra = {};
      if (kind === "admins") {
        const { match } = await activityQuery(
          { from: dayStartUtc(L.range.from, L.tz).toISOString(), to: new Date(dayStartUtc(addDays(L.range.to, 1), L.tz).getTime() - 1).toISOString() },
          L.tz,
        );
        match.actorRole = { $in: STAFF_ROLES };
        const [ev, dir, lookups] = await Promise.all([
          db().collection("security_audit").find(match).sort({ at: -1 }).limit(5000).toArray(),
          staffDirectory(),
          crmNames(),
        ]);
        extra.activity = ev.map((e) => {
          const v = viewEvent(e, dir, lookups);
          return {
            atText: fmtAt(e.at, L.tz),
            name: v.person.name || "—",
            login: v.person.username,
            role: v.person.roleText,
            text: [v.title, ...v.details].join("; "),
            ok: v.kind !== "warn",
            ip: v.ip,
            device: v.device,
          };
        });
      }
      if (kind === "system") {
        const m = await systemSnapshot();
        const rq = m.requests;
        extra.monitor = {
          nowText: fmtAt(new Date(), L.tz),
          sinceText: fmtAt(rq.since, L.tz),
          rows: [
            ["Backend ishlash vaqti (soat)", Math.round((m.server.uptimeSec / 3600) * 10) / 10],
            ["Node.js", m.server.node],
            ["Xotira (RSS), MB", m.server.memoryMb],
            ["Event loop kechikishi p99, ms", m.server.eventLoopMs.p99],
            ["Baza", m.db.ok ? "ulangan" : "ulanmagan"],
            ["Baza ping, ms", m.db.pingMs ?? null],
            ["Baza hajmi, MB", m.db.dataSizeMb ?? null],
            ["So'rovlar (60 daq)", rq.last60.n],
            ["5xx xatolar (60 daq)", rq.last60.err],
            ["Javob vaqti median, ms", rq.p50],
            ["Javob vaqti p95, ms", rq.p95],
            ["Server xatolari (24 soat, jurnal)", m.serverErrors24h],
            ["Faol foydalanuvchilar (5 daq)", m.activeUsers.total],
            ["Oxirgi ma'lumot yangilanishi", m.lastDataUpdate ? fmtAt(m.lastDataUpdate, L.tz) : "—"],
            ["Oxirgi zaxira nusxa", m.lastBackup ? fmtAt(m.lastBackup.at, L.tz) : "—"],
            ...rq.topByErrors.map((e) => ["Xatoli endpoint: " + e.key, `4xx ${e.e4}, 5xx ${e.e5} / ${e.n}`]),
          ],
        };
      }
      const rep = buildReport(kind, {
        all: L.all,
        filters: { group: req.query.group ? clip(req.query.group, 40) : "", teacher: req.query.teacher ? clip(req.query.teacher, 40) : "" },
        ranking: L.settings.ranking,
        extra,
      });
      rep.generatedAt = fmtAt(new Date(), L.tz);
      rep.generatedBy = req.user.username;
      if (format === "json") return res.json({ ok: true, report: rep });
      await audit("report.export", {
        req,
        actor: req.user,
        meta: { report: rep.title, kind, format, from: L.range.from, to: L.range.to, filters: rep.filters || "", rows: rep.rows.length },
      });
      res.setHeader("Content-Type", MIME[format]);
      res.setHeader("Content-Disposition", `attachment; filename="${reportFileName(kind, format)}"`);
      res.send(render(rep, format));
    } catch (e) {
      fail(res, e, "Hisobot tayyorlanmadi");
    }
  });

  // ═══════════════════════ ZAXIRA NUSXALARI ════════════════════════════════
  r.get("/api/super/backups", S, async (req, res) => {
    try {
      const col = db().collection(BACKUP_COL);
      const docs = await col.find({}, { projection: { data: 0 } }).sort({ createdAt: -1 }).limit(100).toArray();
      const failures = await db()
        .collection("security_audit")
        .find({ event: "backup.failed", at: { $gte: new Date(Date.now() - 14 * 86400_000) } }, { projection: { at: 1, meta: 1 } })
        .sort({ at: -1 })
        .limit(10)
        .toArray();
      const cur = await db().collection("crm_data").findOne({ _type: "main" });
      res.json({
        ok: true,
        current: { weight: dataWeight(cur), updatedAt: cur?._updatedAt || null },
        backups: docs.map((d) => ({ id: String(d._id), createdAt: d.createdAt, reason: d.reason, weight: d.weight, createdBy: d.createdBy || null })),
        lastSuccess: docs[0]?.createdAt || null,
        failures: failures.map((f) => ({ at: f.at, message: f.meta?.message || "" })),
        policy: {
          auto: "Har bir CRM yozuvidan oldin (10 daqiqada ko'pi bilan bir marta) va yozuvlar soni kamaysa — albatta",
          keepAuto: 40,
          keepManual: 20,
          scope: "Faqat CRM asosiy ma'lumoti (crm_data): talabalar, guruhlar, mentorlar, kurslar, davomat, baholar, testlar, moliya, sertifikatlar",
          limits: [
            "Hisoblar (parollar), jurnal, fayllar (blobs) va KV sozlamalari bu nusxaga kirmaydi.",
            "Nusxalar o'sha MongoDB bazasida saqlanadi — baza butunlay yo'qolsa, ular ham yo'qoladi. To'liq himoya uchun MongoDB Atlas'ning o'z zaxiralash xizmatini yoqing (hosting tarafida).",
          ],
        },
      });
    } catch (e) {
      fail(res, e);
    }
  });

  r.post("/api/super/backups/create", S, sensitiveLimiter, async (req, res) => {
    try {
      const cur = await db().collection("crm_data").findOne({ _type: "main" });
      if (!cur || !dataWeight(cur)) return res.status(400).json({ ok: false, error: "Nusxa olinadigan ma'lumot yo'q" });
      const id = await snapshotCrmData(cur, "manual", { force: true, by: req.user.username });
      if (!id) return res.status(500).json({ ok: false, error: "Zaxira nusxa yaratilmadi" });
      await audit("backup.create", { req, actor: req.user, meta: { weight: dataWeight(cur) }, severity: "warn" });
      res.json({ ok: true, id: String(id) });
    } catch (e) {
      fail(res, e, "Zaxira nusxa yaratilmadi");
    }
  });

  r.post("/api/super/backups/restore", S, sensitiveLimiter, async (req, res) => {
    try {
      const id = sec.safeObjectIdHex(req.body?.id);
      if (!id) return res.status(400).json({ ok: false, error: "Nusxa tanlanmagan" });
      if (String(req.body?.confirm || "").trim().toUpperCase() !== "TIKLASH")
        return res.status(400).json({ ok: false, error: "Tasdiqlash uchun TIKLASH so'zini yozing" });
      const acc = await reauth(req, res);
      if (!acc) return;
      const doc = await db().collection(BACKUP_COL).findOne({ _id: new ObjectId(id) });
      if (!doc) return res.status(404).json({ ok: false, error: "Nusxa topilmadi" });
      const prev = await db().collection("crm_data").findOne({ _type: "main" });
      const preId = await snapshotCrmData(prev, "pre-restore", { force: true, by: req.user.username });
      const { _type, _updatedAt, ...body } = doc.data || {};
      await db()
        .collection("crm_data")
        .updateOne({ _type: "main" }, { $set: { ...body, _type: "main", _updatedAt: new Date() } }, { upsert: true });
      try {
        const kv = await db().collection("kv").findOne({ key: CRM_KV_KEY });
        if (kv) {
          const obj = JSON.parse(String(kv.value));
          await db()
            .collection("kv")
            .updateOne({ key: CRM_KV_KEY }, { $set: { value: JSON.stringify({ ...obj, ...body }), _updatedAt: new Date() } });
        }
      } catch {}
      await audit("data.restore", {
        req,
        actor: req.user,
        target: { backupId: id, createdAt: doc.createdAt },
        meta: { preRestoreBackup: preId ? String(preId) : null, weight: dataWeight(body) },
        severity: "critical",
      });
      broadcast([CRM_KV_KEY]);
      res.json({ ok: true, weight: dataWeight(body), preRestoreBackup: preId ? String(preId) : null });
    } catch (e) {
      fail(res, e, "Tiklash bajarilmadi");
    }
  });

  r.post("/api/super/backups/:id/download", S, sensitiveLimiter, async (req, res) => {
    try {
      const id = sec.safeObjectIdHex(req.params.id);
      if (!id) return res.status(400).json({ ok: false, error: "id noto'g'ri" });
      const acc = await reauth(req, res);
      if (!acc) return;
      const doc = await db().collection(BACKUP_COL).findOne({ _id: new ObjectId(id) });
      if (!doc) return res.status(404).json({ ok: false, error: "Nusxa topilmadi" });
      await audit("backup.download", { req, actor: req.user, target: { backupId: id }, severity: "critical" });
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="crm_zaxira_${new Date(doc.createdAt).toISOString().slice(0, 10)}_${id.slice(-6)}.json"`);
      res.send(JSON.stringify({ createdAt: doc.createdAt, reason: doc.reason, weight: doc.weight, data: doc.data }, null, 1));
    } catch (e) {
      fail(res, e, "Yuklab bo'lmadi");
    }
  });

  // ═══════════════════════ ODDIY ADMIN UCHUN: MODULLAR HOLATI ══════════════
  // Davomat qoidalari — barcha portallar qarz va daromadni shunga ko'ra hisoblaydi
  r.get("/api/attendance-rules", requireAuth, async (req, res) => {
    const s = await getSettings();
    res.json({ ok: true, chargeExcused: s.attendance?.chargeExcused !== false });
  });

  r.get("/api/modules/me", requireAuth, async (req, res) => {
    const eff = await effectiveModules(req.user);
    res.json({
      ok: true,
      restricted: req.user.role === "admin" && !req.user.isSuper,
      isSuper: !!req.user.isSuper,
      settingsMenu: await settingsMenuAllowed(req.user),
      modules: MODULES.map((m) => ({ key: m.key, nav: m.nav, tabs: m.tabs, label: m.label, ...eff[m.key] })),
    });
  });

  return r;
}
