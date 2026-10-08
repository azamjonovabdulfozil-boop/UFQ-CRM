/**
 * security/devices.js — Qurilma (device) bo'yicha bloklash.
 *
 * ⚠️ NIMA UCHUN IP EMAS, QURILMA?
 * Ilgari noto'g'ri parol ketma-ketligi IP manzil bo'yicha bloklanardi. Bitta
 * o'quv markazida hamma bitta Wi-Fi orqali chiqadi — ya'ni bitta talaba parolni
 * 8 marta xato kiritsa, BUTUN BINO (o'sha internet) 15 daqiqaga kirolmay
 * qolardi. Hisob (username) bo'yicha bloklash ham yomon: begona odam sizning
 * loginingiz bilan ataylab xato parol yozib, sizni tizimdan uzib qo'yishi
 * mumkin edi (DoS).
 *
 * Endi blok FAQAT AYNAN O'SHA QURILMAGA (brauzer profiliga) qo'yiladi:
 *   • boshqa telefon/kompyuter — o'sha Wi-Fi da bo'lsa ham — bemalol kiradi;
 *   • hisob egasi boshqa qurilmadan kira oladi;
 *   • bloklangan qurilma esa muddat tugaguncha login qila olmaydi.
 *
 * Qurilma qanday aniqlanadi (kuchdan zaifga qarab):
 *   1) `edu_did` cookie — server qo'ygan, 1 yil yashaydigan tasodifiy id;
 *   2) `X-Device-Id` sarlavhasi — mijoz localStorage'da saqlaydigan id
 *      (cookie o'chirilgan yoki cross-site rejimda cookie kelmasa);
 *   3) User-Agent + til + platformadan olingan barmoq izi (eng zaifi).
 * Hech qaysisi IP ga bog'liq emas — internetni almashtirish blokni ochmaydi,
 * lekin qo'shni qurilmaga ham yuqmaydi.
 */
import crypto from "node:crypto";
import { CONFIG, deriveKey } from "./config.js";
import { audit } from "./audit.js";
import { resetLimit } from "./rateLimit.js";
import { safeLog } from "./sanitize.js";

const COL = "auth_device_blocks";
const COOKIE = "edu_did";

let _getDb = null;
export function initDevices(getDb) {
  _getDb = getDb;
}
const db = () => (_getDb ? _getDb() : null);

export async function ensureDeviceIndexes() {
  const col = db()?.collection(COL);
  if (!col) return;
  // Eskirgan yozuvlar o'zi o'chadi
  await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "device_ttl" });
}

/** Tez javob uchun xotiradagi nusxa (baza bilan bir xil holat). */
const mem = new Map(); // deviceId -> {failed, blockedUntil, lastFailedAt}
let lastSweep = Date.now();
function sweep() {
  const now = Date.now();
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, v] of mem)
    if ((v.blockedUntil || 0) < now && now - (v.lastFailedAt || 0) > CONFIG.deviceFailWindowSec * 1000)
      mem.delete(k);
}

function isValidId(v) {
  return typeof v === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(v);
}

/** Barmoq izi — cookie ham, sarlavha ham bo'lmaganda. IP QATNASHMAYDI. */
function fingerprint(req) {
  const parts = [
    req.get("user-agent") || "",
    req.get("accept-language") || "",
    req.get("sec-ch-ua-platform") || "",
    req.get("sec-ch-ua") || "",
  ].join("|");
  return (
    "fp_" +
    crypto.createHmac("sha256", deriveKey("device-fp")).update(parts).digest("base64url").slice(0, 22)
  );
}

/**
 * So'rovni yuborgan qurilmaning barqaror identifikatori.
 * `res` berilsa va cookie hali yo'q bo'lsa — yangisi o'rnatiladi.
 */
export function deviceId(req, res) {
  if (req._deviceId) return req._deviceId;

  let id = req.cookies?.[COOKIE];
  if (!isValidId(id)) {
    const hdr = req.get("x-device-id");
    id = isValidId(hdr) ? hdr : null;
  }
  const generated = !id;
  if (!id) id = "d_" + crypto.randomBytes(18).toString("base64url");

  if (res && generated) setDeviceCookie(req, res, id);
  req._deviceId = id;
  return id;
}

function setDeviceCookie(req, res, id) {
  const proto = (req.get("x-forwarded-proto") || req.protocol || "http").split(",")[0].trim();
  const secure = proto === "https" || CONFIG.isProd;
  res.append(
    "Set-Cookie",
    `${COOKIE}=${id}; Path=/; Max-Age=${365 * 24 * 3600}; HttpOnly` +
      (secure ? "; Secure" : "") +
      (CONFIG.crossSite ? "; SameSite=None" : "; SameSite=Lax") +
      (CONFIG.cookieDomain ? `; Domain=${CONFIG.cookieDomain}` : ""),
  );
}

async function load(id) {
  let rec = mem.get(id);
  if (rec) return rec;
  const col = db()?.collection(COL);
  const doc = col ? await col.findOne({ _id: id }).catch(() => null) : null;
  rec = doc
    ? { failed: doc.failed || 0, blockedUntil: +new Date(doc.blockedUntil || 0), lastFailedAt: +new Date(doc.lastFailedAt || 0) }
    : { failed: 0, blockedUntil: 0, lastFailedAt: 0 };
  mem.set(id, rec);
  return rec;
}

async function save(id, rec, meta) {
  mem.set(id, rec);
  const col = db()?.collection(COL);
  if (!col) return;
  const keepMs = Math.max(CONFIG.deviceBlockSec, CONFIG.deviceFailWindowSec) * 1000;
  await col
    .updateOne(
      { _id: id },
      {
        $set: {
          failed: rec.failed,
          blockedUntil: new Date(rec.blockedUntil || 0),
          lastFailedAt: new Date(rec.lastFailedAt || Date.now()),
          expiresAt: new Date(Date.now() + keepMs),
          ...(meta || {}),
        },
      },
      { upsert: true },
    )
    .catch(() => {});
}

/**
 * Qurilma bloklanganmi?
 * @returns {Promise<{blocked:boolean, retryAfter?:number}>}
 */
export async function checkDeviceBlock(id) {
  sweep();
  const rec = await load(id);
  const now = Date.now();
  if (rec.blockedUntil > now)
    return { blocked: true, retryAfter: Math.ceil((rec.blockedUntil - now) / 1000) };
  return { blocked: false };
}

/**
 * Noto'g'ri parol — shu QURILMA hisoblagichini oshiradi.
 * Chegaraga yetganda faqat shu qurilma bloklanadi.
 * @returns {Promise<{blocked:boolean, retryAfter?:number, left:number}>}
 */
export async function noteDeviceFailure(id, req, username) {
  const now = Date.now();
  const rec = await load(id);

  // Oyna: oxirgi xatodan beri uzoq vaqt o'tgan bo'lsa — hisob noldan boshlanadi
  if (rec.lastFailedAt && now - rec.lastFailedAt > CONFIG.deviceFailWindowSec * 1000) rec.failed = 0;

  rec.failed += 1;
  rec.lastFailedAt = now;

  const limit = CONFIG.deviceMaxFailedAttempts;
  if (rec.failed >= limit) {
    rec.blockedUntil = now + CONFIG.deviceBlockSec * 1000;
    rec.failed = 0;
    await save(id, rec, { ua: safeLog(req?.get("user-agent"), 200), lastUsername: safeLog(username, 64) });
    audit("auth.device.blocked", {
      req,
      meta: { device: id.slice(0, 12) + "…", username: safeLog(username, 64), seconds: CONFIG.deviceBlockSec },
      severity: "critical",
    }).catch(() => {});
    return { blocked: true, retryAfter: CONFIG.deviceBlockSec, left: 0 };
  }

  await save(id, rec, { ua: safeLog(req?.get("user-agent"), 200), lastUsername: safeLog(username, 64) });
  return { blocked: false, left: Math.max(0, limit - rec.failed) };
}

/** Muvaffaqiyatli kirish — hisob tozalanadi. */
export async function clearDeviceFailures(id) {
  mem.set(id, { failed: 0, blockedUntil: 0, lastFailedAt: 0 });
  const col = db()?.collection(COL);
  if (col) await col.deleteOne({ _id: id }).catch(() => {});
}

/** Admin uchun: bloklangan qurilmalar ro'yxati. */
export async function listBlockedDevices(limit = 50) {
  const col = db()?.collection(COL);
  if (!col) return [];
  const docs = await col
    .find({ blockedUntil: { $gt: new Date() } })
    .sort({ blockedUntil: -1 })
    .limit(limit)
    .toArray()
    .catch(() => []);
  return docs.map((d) => ({
    id: String(d._id),
    blockedUntil: d.blockedUntil,
    lastUsername: d.lastUsername || null,
    ua: d.ua || null,
  }));
}

/**
 * Admin uchun: qurilma blokini qo'lda ochish.
 *
 * Bazadagi blokdan tashqari xotiradagi chastota hisoblagichlarini ham
 * tozalaymiz — aks holda blok "ochilgan" ko'rinsa-da, `authLimiter` o'sha
 * qurilmani yana 429 bilan qaytarib turardi.
 */
export async function unblockDevice(id) {
  if (typeof id !== "string" || !id) return false;
  const col = db()?.collection(COL);
  const doc = col ? await col.findOne({ _id: id }).catch(() => null) : null;
  await clearDeviceFailures(id);
  resetLimit("auth-device", id);
  if (doc?.lastUsername) resetLimit("auth-user", String(doc.lastUsername).toLowerCase() + "@" + id);
  return true;
}

export const DEVICE_COOKIE = COOKIE;
export const DEVICE_COLLECTION = COL;
