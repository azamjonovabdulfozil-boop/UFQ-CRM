/**
 * security/totp.js — Ikki bosqichli tasdiqlash (TOTP, RFC 6238).
 *
 * Google Authenticator, Microsoft Authenticator, Authy va boshqa ilovalar
 * bilan ishlaydi: 30 soniyalik 6 xonali kod. Tashqi kutubxona kerak emas.
 *
 * Sir (secret) bazada OCHIQ saqlanmaydi — AUTH_SECRET dan olingan alohida
 * kalit bilan AES-256-GCM orqali shifrlanadi. Baza sizib chiqsa ham sirni
 * AUTH_SECRET siz tiklab bo'lmaydi.
 */
import crypto from "node:crypto";
import { deriveKey } from "./config.js";

const KEY = deriveKey("totp-secret");
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf) {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  const s = String(str || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0;
  const out = [];
  for (const ch of s) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Yangi 160-bitli sir (base32). */
export const newTotpSecret = () => base32Encode(crypto.randomBytes(20));

function hotp(secretBuf, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac("sha1", secretBuf).update(msg).digest();
  const off = h[h.length - 1] & 0xf;
  const code = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 1e6).padStart(6, "0");
}

/** Joriy kod (sinov uchun ham kerak). */
export function totpNow(secretB32, t = Date.now()) {
  return hotp(base32Decode(secretB32), Math.floor(t / 30000));
}

/**
 * Kodni tekshiradi (±1 qadam — soat biroz farq qilsa ham ishlaydi).
 * @returns {number|null} mos kelgan qadam (qayta ishlatishni to'sish uchun) yoki null
 */
export function verifyTotp(secretB32, code, lastStep = null, t = Date.now()) {
  const c = String(code || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const key = base32Decode(secretB32);
  const step = Math.floor(t / 30000);
  for (const d of [0, -1, 1]) {
    const s = step + d;
    if (lastStep != null && s <= lastStep) continue; // bir kod ikki marta ishlamaydi
    const expected = hotp(key, s);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(c))) return s;
  }
  return null;
}

export function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([c.update(String(plain), "utf8"), c.final()]);
  return [iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}

export function decryptSecret(blob) {
  try {
    const [iv, tag, enc] = String(blob || "").split(".");
    const d = crypto.createDecipheriv("aes-256-gcm", KEY, Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(enc, "base64")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function otpauthUri(secretB32, account, issuer = "EduManage CRM") {
  const label = encodeURIComponent(issuer + ":" + account);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
