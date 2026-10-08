/**
 * security/sessions.js — Refresh sessiyalari (rotatsiya + qayta ishlatishni aniqlash).
 *
 * Model:
 *   • Access token  — qisqa umrli (15 daq), imzolangan, bazaga tegmaydi.
 *   • Refresh token — uzoq umrli, httpOnly cookie'da, bazada FAQAT SHA-256
 *     xeshi saqlanadi. Har ishlatilganda YANGISIGA almashtiriladi (rotation).
 *
 * Nima uchun rotatsiya? Agar o'g'irlangan refresh token ishlatilsa, haqiqiy
 * foydalanuvchi keyingi safar eski (allaqachon ishlatilgan) token bilan
 * keladi — server buni "qayta ishlatish" deb aniqlaydi va O'SHA QURILMANING
 * BUTUN oilasini (family) bekor qiladi. Ya'ni o'g'irlik sezilmay qolmaydi.
 */
import { randomToken, sha256, randomId } from "./crypto.js";
import { CONFIG } from "./config.js";
import { audit } from "./audit.js";
import { clientIp } from "./rateLimit.js";
import { safeLog } from "./sanitize.js";

const COL = "auth_sessions";

let _getDb = null;
export function initSessions(getDb) {
  _getDb = getDb;
}
const db = () => _getDb();

export async function ensureSessionIndexes() {
  const col = db().collection(COL);
  // Muddati o'tgan sessiyalar bazadan o'zi o'chadi
  await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "session_ttl" });
  await col.createIndex({ tokenHash: 1 }, { unique: true, name: "token_hash_unique" });
  await col.createIndex({ accountId: 1, lastUsedAt: -1 });
  await col.createIndex({ family: 1 });
}

function deviceOf(req) {
  return {
    ip: req ? clientIp(req) : null,
    ua: req ? safeLog(req.get("user-agent"), 200) : null,
  };
}

/**
 * Yangi sessiya ochadi (login).
 * @returns {Promise<{token:string, family:string, expiresAt:Date}>}
 */
export async function createSession(account, req) {
  const token = randomToken(32);
  const family = randomId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CONFIG.refreshTtlSec * 1000);

  await db().collection(COL).insertOne({
    tokenHash: sha256(token),
    family,
    accountId: String(account._id),
    username: account.username,
    role: account.role,
    createdAt: now,
    lastUsedAt: now,
    expiresAt,
    usedAt: null,
    revokedAt: null,
    device: deviceOf(req),
    generation: 1,
  });

  // ⚙️ TEZLIK: limitni tekshirish kirish javobini kuttirmasin — fonda.
  enforceSessionLimit(String(account._id)).catch(() => {});
  return { token, family, expiresAt };
}

/** Bitta foydalanuvchida ochiq sessiyalar sonini cheklaymiz. */
async function enforceSessionLimit(accountId) {
  const col = db().collection(COL);
  const active = await col
    .find({ accountId, revokedAt: null }, { projection: { _id: 1, lastUsedAt: 1 } })
    .sort({ lastUsedAt: -1 })
    .toArray();
  if (active.length <= CONFIG.maxSessionsPerUser) return;
  const excess = active.slice(CONFIG.maxSessionsPerUser).map((d) => d._id);
  await col.updateMany({ _id: { $in: excess } }, { $set: { revokedAt: new Date(), revokeReason: "limit" } });
}

/**
 * Refresh tokenni tekshirib, YANGISIGA almashtiradi.
 * @returns {Promise<{ok:true, token:string, session:object} | {ok:false, code:string, error:string}>}
 */
export async function rotateSession(rawToken, req) {
  if (!rawToken || typeof rawToken !== "string")
    return { ok: false, code: "no-session", error: "Sessiya topilmadi" };

  const col = db().collection(COL);
  const hash = sha256(rawToken);
  const sess = await col.findOne({ tokenHash: hash });

  if (!sess) return { ok: false, code: "no-session", error: "Sessiya topilmadi yoki muddati tugagan" };

  const now = new Date();

  // ── Bir necha tab bir vaqtda yangilaganda ───────────────────────────────
  // Ikki tab bir xil cookie bilan deyarli bir vaqtda kelishi mumkin: birinchisi
  // tokenni almashtiradi, ikkinchisi esa hali eski cookie bilan keladi. Buni
  // "o'g'irlik" deb hisoblash foydalanuvchini bekordan-bekor tizimdan
  // chiqarardi. Shu sabab qisqa (GRACE_MS) oyna beriladi — haqiqiy hujumchi
  // o'g'irlangan tokenni odatda ancha keyin ishlatadi.
  const GRACE_MS = 15000;
  const justUsed =
    sess.usedAt && !sess.revokedAt && now.getTime() - new Date(sess.usedAt).getTime() <= GRACE_MS;

  // Oddiy chiqish (logout) — bu hujum emas, shunchaki sessiya yopilgan.
  if (sess.revokedAt && ["logout", "password-changed", "user-revoke-all"].includes(sess.revokeReason))
    return { ok: false, code: "session-ended", error: "Sessiya yopilgan. Qaytadan kiring." };

  // ── Qayta ishlatish aniqlandi: token allaqachon almashtirilgan ──────────
  if ((sess.usedAt && !justUsed) || sess.revokedAt) {
    await col.updateMany(
      { family: sess.family, revokedAt: null },
      { $set: { revokedAt: now, revokeReason: "reuse-detected" } },
    );
    await audit("auth.session.reuse_detected", {
      req,
      actor: { sub: sess.accountId, username: sess.username, role: sess.role },
      meta: { family: sess.family, generation: sess.generation },
      severity: "critical",
    });
    return {
      ok: false,
      code: "session-reuse",
      error: "Xavfsizlik sababli barcha sessiyalar yopildi. Qaytadan kiring.",
    };
  }

  if (new Date(sess.expiresAt).getTime() <= now.getTime())
    return { ok: false, code: "session-expired", error: "Sessiya muddati tugagan" };

  // Uzoq harakatsizlik — sessiya o'ladi
  const idleMs = now.getTime() - new Date(sess.lastUsedAt || sess.createdAt).getTime();
  if (idleMs > CONFIG.idleTimeoutSec * 1000) {
    await col.updateOne({ _id: sess._id }, { $set: { revokedAt: now, revokeReason: "idle" } });
    return { ok: false, code: "session-idle", error: "Uzoq vaqt harakatsizlik — qaytadan kiring" };
  }

  // ── Rotatsiya ───────────────────────────────────────────────────────────
  const nextToken = randomToken(32);
  await col.updateOne({ _id: sess._id }, { $set: { usedAt: now } });
  await col.insertOne({
    tokenHash: sha256(nextToken),
    family: sess.family,
    accountId: sess.accountId,
    username: sess.username,
    role: sess.role,
    createdAt: now,
    lastUsedAt: now,
    // Sirg'aluvchi muddat: faol foydalanuvchi qayta login qilmaydi,
    // lekin mutlaq chegara ham bor (family boshlanganidan refreshTtl).
    expiresAt: new Date(
      Math.min(
        now.getTime() + CONFIG.refreshTtlSec * 1000,
        new Date(sess.createdAt).getTime() + 2 * CONFIG.refreshTtlSec * 1000,
      ),
    ),
    usedAt: null,
    revokedAt: null,
    device: deviceOf(req),
    generation: (sess.generation || 1) + 1,
  });

  // Eski avlodlarni tozalab turamiz (bazada axlat to'planmasin) — fonda
  col.deleteMany({
    family: sess.family,
    usedAt: { $ne: null },
    createdAt: { $lt: new Date(now.getTime() - 24 * 3600 * 1000) },
  }).catch(() => {});

  return { ok: true, token: nextToken, session: { ...sess, generation: (sess.generation || 1) + 1 } };
}

/** Chiqish — shu sessiyani (yoki butun oilani) bekor qiladi. */
export async function revokeSession(rawToken, reason = "logout") {
  if (!rawToken) return false;
  const col = db().collection(COL);
  const sess = await col.findOne({ tokenHash: sha256(rawToken) });
  if (!sess) return false;
  await col.updateMany(
    { family: sess.family, revokedAt: null },
    { $set: { revokedAt: new Date(), revokeReason: reason } },
  );
  return true;
}

/** Barcha qurilmalardan chiqarish. */
export async function revokeAllForAccount(accountId, reason = "revoke-all") {
  const r = await db()
    .collection(COL)
    .updateMany({ accountId: String(accountId), revokedAt: null }, { $set: { revokedAt: new Date(), revokeReason: reason } });
  return r.modifiedCount;
}

/** Foydalanuvchining faol qurilmalari ro'yxati. */
export async function listSessions(accountId) {
  const docs = await db()
    .collection(COL)
    .find({ accountId: String(accountId), revokedAt: null, usedAt: null })
    .sort({ lastUsedAt: -1 })
    .limit(50)
    .toArray();
  return docs.map((d) => ({
    id: String(d._id),
    createdAt: d.createdAt,
    lastUsedAt: d.lastUsedAt,
    expiresAt: d.expiresAt,
    ip: d.device?.ip || null,
    ua: d.device?.ua || null,
    generation: d.generation,
  }));
}

export const SESSION_COLLECTION = COL;
