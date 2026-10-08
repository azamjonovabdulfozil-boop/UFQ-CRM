/**
 * security/crypto.js — Parol xeshlash, token imzolash, tasodifiy qiymatlar.
 *
 * Tashqi kutubxonasiz (faqat node:crypto) — o'rnatish muammosi bo'lmaydi va
 * ta'minot zanjiri (supply chain) hujum yuzasi kengaymaydi.
 *
 * Parol:  scrypt (RFC 7914) — GPU/ASIC bilan tanlashga qarshi xotira-og'ir
 *         algoritm. Har parolda o'ziga xos "salt", natija timing-safe
 *         solishtiriladi.
 * Token:  JWT-ga mos HS256 (HMAC-SHA256) — imzo tekshirilmasa token rad etiladi.
 */
import crypto from "node:crypto";
import { promisify } from "node:util";
import { deriveKey } from "./config.js";

const scrypt = promisify(crypto.scrypt);

// N=2^15 — zamonaviy serverda ~100 ms. Foydalanuvchi sezmaydi, hujumchi uchun
// sekundiga urinishlar sonini keskin kamaytiradi.
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64, maxmem: 96 * 1024 * 1024 };

// ─── Parol ────────────────────────────────────────────────────────────────────

/** @returns {Promise<string>} `scrypt$N$r$p$salt$hash` ko'rinishidagi satr */
export async function hashPassword(password) {
  const pw = String(password ?? "");
  const salt = crypto.randomBytes(16);
  const dk = await scrypt(pw.normalize("NFKC"), salt, SCRYPT.keylen, SCRYPT);
  return [
    "scrypt",
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString("base64url"),
    Buffer.from(dk).toString("base64url"),
  ].join("$");
}

/** Doimiy vaqtli tekshiruv. Xato formatdagi xesh uchun ham `false` qaytaradi. */
export async function verifyPassword(password, stored) {
  try {
    const parts = String(stored || "").split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const [, N, r, p, saltB64, hashB64] = parts;
    const salt = Buffer.from(saltB64, "base64url");
    const expected = Buffer.from(hashB64, "base64url");
    const dk = await scrypt(String(password ?? "").normalize("NFKC"), salt, expected.length, {
      N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem,
    });
    return crypto.timingSafeEqual(Buffer.from(dk), expected);
  } catch {
    return false;
  }
}

/** Har doim bir xil vaqt ketishi uchun — hisob topilmaganda ham "tekshiramiz". */
export async function fakeVerify() {
  try {
    await scrypt("dummy", crypto.randomBytes(16), SCRYPT.keylen, SCRYPT);
  } catch {}
  return false;
}

/** Eski hisoblar bilan moslik: ochiq matn yoki sha256 hex. */
export function verifyLegacyPassword(password, stored) {
  const s = String(stored ?? "");
  const pw = String(password ?? "");
  if (!s) return false;
  if (/^[a-f0-9]{64}$/i.test(s)) {
    const h = crypto.createHash("sha256").update(pw, "utf8").digest("hex");
    return timingSafeStr(h.toLowerCase(), s.toLowerCase());
  }
  return timingSafeStr(pw, s);
}

/** Uzunlikni oshkor qilmaydigan satr solishtiruvi. */
export function timingSafeStr(a, b) {
  const ba = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  const len = Math.max(ba.length, bb.length, 1);
  const pa = Buffer.alloc(len); ba.copy(pa);
  const pb = Buffer.alloc(len); bb.copy(pb);
  return crypto.timingSafeEqual(pa, pb) && ba.length === bb.length;
}

// ─── Parol siyosati ───────────────────────────────────────────────────────────

const COMMON = new Set([
  "password", "parol", "123456", "12345678", "123456789", "qwerty", "admin",
  "admin123", "admin1234", "iloveyou", "welcome", "letmein", "abc123",
  "password1", "passw0rd", "qwerty123", "1q2w3e4r", "111111", "000000",
  "student", "mentor", "edumanage", "crm12345", "ufqcrm", "salom123",
]);

/**
 * @returns {{ok:boolean, error?:string, score:number}}
 * Uzunlik — asosiy mezon (NIST SP 800-63B): 12+ belgili ibora murakkab
 * "Pa$$w0rd" dan kuchliroq. Shu sabab qattiq "1 ta katta harf" talabi emas,
 * uzunlik + lug'at tekshiruvi ishlatiladi.
 */
export function checkPasswordStrength(password, { minLength = 10, username = "", name = "" } = {}) {
  const pw = String(password ?? "");
  if (pw.length < minLength)
    return { ok: false, score: 0, error: `Parol kamida ${minLength} belgi bo'lsin` };
  if (pw.length > 200) return { ok: false, score: 0, error: "Parol 200 belgidan uzun bo'lmasin" };
  if (/^\s|\s$/.test(pw)) return { ok: false, score: 0, error: "Parol bo'sh joy bilan boshlanmasin/tugamasin" };

  const low = pw.toLowerCase();
  if (COMMON.has(low)) return { ok: false, score: 0, error: "Bu parol juda ko'p ishlatiladi — boshqasini tanlang" };
  for (const c of COMMON) if (c.length >= 6 && low.includes(c))
    return { ok: false, score: 0, error: `Parol ichida ommabop so'z bor ("${c}")` };

  const u = String(username || "").toLowerCase();
  if (u.length >= 3 && low.includes(u))
    return { ok: false, score: 0, error: "Parol login bilan bir xil bo'lmasin" };
  for (const part of String(name || "").toLowerCase().split(/\s+/))
    if (part.length >= 4 && low.includes(part))
      return { ok: false, score: 0, error: "Parol ism-familiyani o'z ichiga olmasin" };

  if (/^(.)\1+$/.test(pw)) return { ok: false, score: 0, error: "Parol bir xil belgilardan iborat" };
  if (isSequential(low)) return { ok: false, score: 0, error: "Parol ketma-ket belgilardan iborat (12345, qwerty…)" };

  let score = 1;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^\w\s]/].filter((re) => re.test(pw)).length;
  if (classes >= 3) score++;
  if (new Set(pw).size >= 10) score++;
  return { ok: true, score: Math.min(score, 5) };
}

function isSequential(s) {
  if (s.length < 4) return false;
  const rows = "abcdefghijklmnopqrstuvwxyz0123456789qwertyuiopasdfghjklzxcvbnm";
  for (let i = 0; i + s.length <= rows.length; i++) {
    const seg = rows.slice(i, i + s.length);
    if (seg === s || [...seg].reverse().join("") === s) return true;
  }
  return false;
}

// ─── Tasodifiy qiymatlar ──────────────────────────────────────────────────────

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
export const randomId = () => crypto.randomUUID();
/** Ombordagi token — faqat xesh holida saqlanadi (baza sizsa ham foydasiz). */
export const sha256 = (v) => crypto.createHash("sha256").update(String(v), "utf8").digest("hex");

// ─── Imzolangan token (JWT / HS256) ───────────────────────────────────────────

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const ACCESS_KEY = deriveKey("access-token");

function sign(data, key) {
  return crypto.createHmac("sha256", key).update(data).digest("base64url");
}

/** @param {object} payload @param {number} ttlSec */
export function issueToken(payload, ttlSec, key = ACCESS_KEY) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64u(
    JSON.stringify({ ...payload, iat: now, nbf: now - 5, exp: now + ttlSec, jti: crypto.randomUUID() }),
  );
  return `${head}.${body}.${sign(head + "." + body, key)}`;
}

/**
 * Tokenni tekshiradi. Imzo — timing-safe, muddat — majburiy.
 * @returns {{ok:true, payload:object} | {ok:false, error:string}}
 */
export function verifyToken(token, key = ACCESS_KEY) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return { ok: false, error: "malformed" };
    const [h, b, s] = parts;
    const expect = sign(h + "." + b, key);
    const A = Buffer.from(s, "base64url");
    const B = Buffer.from(expect, "base64url");
    if (A.length !== B.length || !crypto.timingSafeEqual(A, B))
      return { ok: false, error: "bad-signature" };
    const head = JSON.parse(Buffer.from(h, "base64url").toString("utf8"));
    if (head.alg !== "HS256") return { ok: false, error: "bad-alg" }; // alg=none hujumiga qarshi
    const payload = JSON.parse(Buffer.from(b, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== "number" || payload.exp <= now) return { ok: false, error: "expired" };
    if (typeof payload.nbf === "number" && payload.nbf > now) return { ok: false, error: "not-yet-valid" };
    return { ok: true, payload };
  } catch {
    return { ok: false, error: "malformed" };
  }
}
