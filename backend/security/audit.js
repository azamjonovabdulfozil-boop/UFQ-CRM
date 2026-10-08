/**
 * security/audit.js — Xavfsizlik hodisalari jurnali.
 *
 * "Kim, qachon, qayerdan, nima qildi" — buzilish yuz berganda yagona
 * ishonchli manba shu. Jurnal MongoDB'da TTL indeks bilan saqlanadi
 * (AUDIT_RETENTION_DAYS kundan keyin avtomatik o'chadi).
 *
 * Jurnalga HECH QACHON parol, token yoki API kalit yozilmaydi.
 */
import { CONFIG } from "./config.js";
import { clientIp } from "./rateLimit.js";
import { safeLog } from "./sanitize.js";

const COL = "security_audit";
let _getDb = null;
let ready = false;

export function initAudit(getDb) {
  _getDb = getDb;
}

export async function ensureAuditIndexes() {
  if (!_getDb) return;
  try {
    const col = _getDb().collection(COL);
    await col.createIndex(
      { at: 1 },
      { expireAfterSeconds: CONFIG.auditRetentionDays * 86400, name: "audit_ttl" },
    );
    await col.createIndex({ event: 1, at: -1 });
    await col.createIndex({ actorId: 1, at: -1 });
    await col.createIndex({ ip: 1, at: -1 });
    ready = true;
  } catch (e) {
    console.warn("⚠️  Audit indekslari yaratilmadi:", e.message);
  }
}

/** Maxfiy bo'lishi mumkin bo'lgan maydonlarni jurnalga tushirmaymiz. */
const SECRET_KEYS = /pass|password|parol|token|secret|key|authorization|cookie|hash/i;

function scrub(obj, depth = 0) {
  if (obj === null || typeof obj !== "object" || depth > 6) return obj;
  if (Array.isArray(obj)) return obj.slice(0, 50).map((v) => scrub(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SECRET_KEYS.test(k)) {
      out[k] = "[redacted]";
      continue;
    }
    out[k] = typeof v === "string" ? safeLog(v, 300) : scrub(v, depth + 1);
  }
  return out;
}

/**
 * Hodisani yozadi. Hech qachon xato tashlamaydi — audit yozilmagani asosiy
 * amalni to'xtatmasligi kerak, lekin konsolga chiqadi.
 *
 * @param {string} event   masalan "auth.login.success"
 * @param {object} info    { req, actor, target, meta, severity }
 */
export async function audit(event, info = {}) {
  const { req, actor, target, meta, severity = "info" } = info;
  const doc = {
    at: new Date(),
    event: String(event).slice(0, 80),
    severity,
    actorId: actor?.sub || actor?.id || null,
    actorName: actor?.username || actor?.name || null,
    actorRole: actor?.role || null,
    ip: req ? clientIp(req) : null,
    ua: req ? safeLog(req.get("user-agent"), 200) : null,
    method: req?.method || null,
    path: req ? safeLog(req.originalUrl || req.path, 200) : null,
    target: target ? scrub(target) : null,
    meta: meta ? scrub(meta) : null,
  };

  // Muhim hodisalar konsolga ham — Render loglarida darhol ko'rinsin.
  if (severity === "warn" || severity === "critical") {
    console.warn(
      `🔐 [${severity}] ${doc.event} ip=${doc.ip || "?"} actor=${doc.actorName || "anon"}` +
        (meta ? " " + safeLog(JSON.stringify(scrub(meta)), 300) : ""),
    );
  }

  if (!_getDb || !ready) return;
  enqueue(doc);
}

// ─── To'plamli yozish ─────────────────────────────────────────────────────────
//
// Audit yozuvi so'rov javobini KUTTIRMASLIGI kerak. MongoDB Atlas uzoqda
// bo'lgani uchun har bir insertOne ~200 ms qo'shardi. Endi yozuvlar buferga
// tushadi va fonda to'plam bo'lib yoziladi — foydalanuvchi kutmaydi, jurnal
// esa baribir to'liq saqlanadi.
const BUFFER = [];
const FLUSH_MS = 2000;
const FLUSH_SIZE = 50;
const MAX_BUFFER = 2000; // xotira cheksiz o'smasin
let flushTimer = null;
let flushing = false;

function enqueue(doc) {
  if (BUFFER.length >= MAX_BUFFER) BUFFER.shift(); // eng eskisini tashlaymiz
  BUFFER.push(doc);
  if (BUFFER.length >= FLUSH_SIZE) return void flush();
  if (!flushTimer) {
    flushTimer = setTimeout(flush, FLUSH_MS);
    if (typeof flushTimer.unref === "function") flushTimer.unref();
  }
}

async function flush() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (flushing || !BUFFER.length || !_getDb) return;
  flushing = true;
  const batch = BUFFER.splice(0, BUFFER.length);
  try {
    await _getDb().collection(COL).insertMany(batch, { ordered: false });
  } catch (e) {
    console.warn("⚠️  Audit yozilmadi (" + batch.length + " ta):", e.message);
  } finally {
    flushing = false;
  }
}

/** Server to'xtayotganda buferni bo'shatish. */
export async function flushAudit() {
  await flush();
}
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.once(sig, () => {
    flush().finally(() => process.exit(0));
  });
}

/** Admin panel uchun — oxirgi hodisalar. */
export async function recentEvents({ limit = 100, event = null, actorId = null } = {}) {
  if (!_getDb) return [];
  const filter = {};
  if (typeof event === "string" && event) filter.event = event;
  if (typeof actorId === "string" && actorId) filter.actorId = actorId;
  return _getDb()
    .collection(COL)
    .find(filter)
    .sort({ at: -1 })
    .limit(Math.min(Math.max(1, limit), 500))
    .toArray();
}

export const AUDIT_COLLECTION = COL;
