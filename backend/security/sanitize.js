/**
 * security/sanitize.js — Kiruvchi ma'lumotni tozalash va tekshirish.
 *
 * Asosiy xavf: MongoDB so'roviga foydalanuvchi obyektini to'g'ridan-to'g'ri
 * uzatish. Masalan `{ login: { $ne: null } }` yuborilsa, filtr HAR QANDAY
 * hisobga mos keladi (NoSQL injection). Shu sabab so'rovga tushadigan har
 * qanday qiymat quyidagi funksiyalardan o'tkaziladi.
 */

/** Prototip ifloslanishiga (prototype pollution) yo'l ochadigan kalitlar. */
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Boshqaruv belgilari — log injection, terminal hiylalari, null bayt. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Obyektdan `$` bilan boshlanadigan operator kalitlarini va nuqtali
 * yo'llarni olib tashlaydi (rekursiv).
 */
/** Kalit xavflimi — `$` operator, nuqtali yo'l yoki prototip kaliti. */
function isDangerousKey(k) {
  return k.charCodeAt(0) === 36 /* $ */ || k.includes(".") || FORBIDDEN_KEYS.has(k);
}

/**
 * ⚙️ TEZLIK: CRM ma'lumoti megabaytlab bo'lishi mumkin. Ilgari bu funksiya
 * BUTUN daraxtni qayta qurardi — millionlab obyekt yaratilardi. Endi avval
 * "xavfli kalit bormi" deb tekshiriladi va faqat kerak bo'lganda qayta
 * quriladi. Amalda ma'lumotning 99% qismi o'zgarishsiz o'tadi.
 */
export function sanitizeDeep(value, depth = 0) {
  if (depth > 40) return null; // rekursiv bomba / stack overflow himoyasi
  if (value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    let changed = false;
    const out = new Array(value.length);
    for (let i = 0; i < value.length; i++) {
      const v = value[i];
      const s = sanitizeDeep(v, depth + 1);
      out[i] = s;
      if (s !== v) changed = true;
    }
    return changed ? out : value;
  }
  if (value instanceof Date) return value;

  const keys = Object.keys(value);

  // Tez yo'l: xavfli kalit yo'q va ichki qiymatlar ham o'zgarmagan bo'lsa,
  // yangi obyekt umuman yaratilmaydi.
  let needsRebuild = false;
  for (let i = 0; i < keys.length; i++) {
    if (isDangerousKey(keys[i])) {
      needsRebuild = true;
      break;
    }
  }
  if (!needsRebuild) {
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const v = value[k];
      const s = sanitizeDeep(v, depth + 1);
      if (s !== v) {
        needsRebuild = true;
        break;
      }
    }
    if (!needsRebuild) return value;
  }

  const out = {};
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (isDangerousKey(k)) continue;
    out[k] = sanitizeDeep(value[k], depth + 1);
  }
  return out;
}

/** Express middleware — body/query ni tozalaydi. */
export function sanitizeRequest(req, _res, next) {
  if (req.body && typeof req.body === "object") req.body = sanitizeDeep(req.body);
  if (req.query && typeof req.query === "object") {
    const clean = sanitizeDeep({ ...req.query });
    for (const k of Object.keys(req.query)) delete req.query[k];
    Object.assign(req.query, clean);
  }
  next();
}

/** So'rov filtrida ishlatiladigan qiymat — faqat primitiv bo'lishi shart. */
export function scalar(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  return null;
}

/** Filtrda ishlatiladigan matn: obyekt bo'lsa rad etiladi, uzunligi cheklanadi. */
export function safeString(v, max = 512) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.length > max) return null;
  if (CONTROL_CHARS.test(s)) return null;
  return s;
}

/** Login: harf/raqam/._- , 3–64 belgi. Kichik harfga keltiriladi. */
export function safeUsername(v) {
  const s = safeString(v, 64);
  if (!s || s.length < 3) return null;
  const u = s.toLowerCase();
  return /^[a-z0-9._\-@+]{3,64}$/.test(u) ? u : null;
}

/** MongoDB ObjectId shaklidagi 24-belgili hex. */
export function safeObjectIdHex(v) {
  const s = safeString(v, 24);
  return s && /^[a-f0-9]{24}$/i.test(s) ? s : null;
}

/** KV kaliti — ma'noli, cheklangan alifbo. */
export function safeKvKey(v) {
  const s = safeString(v, 200);
  return s && /^[A-Za-z0-9._:\-]{1,200}$/.test(s) ? s : null;
}

/** Blob identifikatori. */
export function safeBlobId(v) {
  const s = safeString(v, 128);
  return s && /^[A-Za-z0-9._:\-]{1,128}$/.test(s) ? s : null;
}

const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
  "=": "&#61;",
  "/": "&#47;",
};

/** HTML kontekstiga tushadigan matnni ekranlash (XSS). */
export function escapeHtml(v) {
  return String(v ?? "").replace(/[&<>"'`=/]/g, (c) => HTML_ESCAPES[c]);
}

/** UTF-8 baytlar soni — limit tekshiruvi uchun (satr uzunligi emas). */
export const byteLength = (s) => Buffer.byteLength(String(s ?? ""), "utf8");

/** Loglarga tushadigan matn — yangi qator bilan soxta yozuv qo'shib bo'lmasin. */
export const safeLog = (v, max = 200) =>
  String(v ?? "")
    .replace(CONTROL_CHARS_G, " ")
    .slice(0, max);

const CONTROL_CHARS_G = /[\u0000-\u001f\u007f]/g;
