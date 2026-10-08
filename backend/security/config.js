/**
 * security/config.js — Xavfsizlik sozlamalari va muhit tekshiruvi.
 *
 * Prinsip: sozlama YO'Q bo'lsa — eng xavfsiz qiymat tanlanadi, ishlab
 * chiqarish muhitida (NODE_ENV=production) esa zaif sozlama bilan server
 * UMUMAN ISHGA TUSHMAYDI. "Standart parol bilan qolib ketish" — eng ko'p
 * uchraydigan buzilish sababi, shuning uchun u kod darajasida to'siladi.
 */
import crypto from "node:crypto";
import { readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const bool = (v, dflt = false) => {
  if (v === undefined || v === null || v === "") return dflt;
  return /^(1|true|yes|on)$/i.test(String(v).trim());
};
const int = (v, dflt) => {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : dflt;
};
const list = (v) =>
  String(v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export const IS_PROD = process.env.NODE_ENV === "production";

/**
 * Token imzolash kaliti. Prod'da ENV dan KELISHI SHART.
 * Dev'da bir marta generatsiya qilinib `.secret` fayliga yoziladi — shunda
 * server qayta ishga tushganda sessiyalar buzilmaydi, lekin kalit kodga
 * ham, git'ga ham tushmaydi.
 */
function resolveSecret() {
  const fromEnv = (process.env.AUTH_SECRET || process.env.JWT_SECRET || "").trim();
  if (fromEnv) {
    if (fromEnv.length < 32)
      throw new Error(
        "AUTH_SECRET juda qisqa — kamida 32 belgi kerak. " +
          "Yangi kalit: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"",
      );
    if (/^(secret|changeme|password|test|your_)/i.test(fromEnv))
      throw new Error("AUTH_SECRET namunaviy qiymatda qolgan — almashtiring.");
    return fromEnv;
  }
  if (IS_PROD)
    throw new Error(
      "AUTH_SECRET o'rnatilmagan. Ishlab chiqarish muhitida bu majburiy.\n" +
        "  Render → Environment → AUTH_SECRET = <64 belgili tasodifiy satr>",
    );

  const f = join(__dirname, "..", ".auth-secret");
  try {
    if (existsSync(f)) {
      const v = readFileSync(f, "utf8").trim();
      if (v.length >= 32) return v;
    }
    const v = crypto.randomBytes(48).toString("hex");
    writeFileSync(f, v, { mode: 0o600 });
    try { chmodSync(f, 0o600); } catch {}
    console.warn(
      "⚠️  AUTH_SECRET yo'q — dev uchun backend/.auth-secret yaratildi.\n" +
        "    Serverga chiqarishdan oldin ENV orqali o'z kalitingizni bering.",
    );
    return v;
  } catch (e) {
    console.warn("⚠️  .auth-secret yozilmadi, vaqtinchalik kalit ishlatiladi:", e.message);
    return crypto.randomBytes(48).toString("hex");
  }
}

export const SECRET = resolveSecret();

/** Bir-biridan mustaqil maqsadlar uchun alohida kalitlar (kalitni qayta ishlatmaslik). */
export function deriveKey(purpose) {
  return crypto.hkdfSync("sha256", Buffer.from(SECRET, "utf8"), Buffer.alloc(0), Buffer.from("edumanage:" + purpose), 32);
}

export const CONFIG = {
  isProd: IS_PROD,

  // ── Sessiya muddatlari ─────────────────────────────────────────────────
  accessTtlSec: int(process.env.ACCESS_TOKEN_TTL, 15 * 60),          // 15 daqiqa
  refreshTtlSec: int(process.env.REFRESH_TOKEN_TTL, 14 * 24 * 3600), // 14 kun
  idleTimeoutSec: int(process.env.SESSION_IDLE_TIMEOUT, 12 * 3600),  // 12 soat harakatsizlik
  maxSessionsPerUser: int(process.env.MAX_SESSIONS_PER_USER, 10),

  // ── Parol siyosati ─────────────────────────────────────────────────────
  passwordMinLength: int(process.env.PASSWORD_MIN_LENGTH, 10),
  passwordMaxLength: 200,
  passwordHistory: int(process.env.PASSWORD_HISTORY, 5),
  // Eski (ochiq matnli / sha256) parollar bilan kirishga ruxsat. Birinchi
  // muvaffaqiyatli kirishda parol avtomatik scrypt'ga ko'chiriladi.
  allowLegacyPasswords: bool(process.env.ALLOW_LEGACY_PASSWORDS, true),

  // ── Brute-force himoyasi ───────────────────────────────────────────────
  // ⚠️ Blok QURILMAGA qo'yiladi (security/devices.js), IP yoki Wi-Fi ga emas:
  // bitta markazda hamma bitta internetdan chiqadi, shuning uchun IP bo'yicha
  // bloklash butun binoni tizimdan uzib qo'yardi.
  deviceMaxFailedAttempts: int(process.env.DEVICE_MAX_FAILED_ATTEMPTS, 8),
  deviceBlockSec: int(process.env.DEVICE_BLOCK_SECONDS, 15 * 60),
  deviceFailWindowSec: int(process.env.DEVICE_FAIL_WINDOW_SECONDS, 30 * 60),

  maxFailedAttempts: int(process.env.MAX_FAILED_ATTEMPTS, 8),
  lockoutSec: int(process.env.LOCKOUT_SECONDS, 15 * 60),
  // Hisobning O'ZINI bloklash — sukut bo'yicha O'CHIQ. Yoqilsa, begona odam
  // sizning loginingiz bilan ataylab xato parol yozib sizni tizimdan uzib
  // qo'yishi mumkin (DoS). Himoya qurilma blokidan keladi.
  lockAccountOnFailures: bool(process.env.LOCK_ACCOUNT_ON_FAILURES, false),

  // ── Parol siyosati: kim o'zgartira oladi ───────────────────────────────
  // Parol FAQAT admin panelidan o'zgartiriladi. Talaba/mentor portalida
  // "parolni almashtirish" umuman yo'q — server ham buni rad etadi.
  selfPasswordChangeRoles: list(process.env.SELF_PASSWORD_CHANGE_ROLES || "admin"),

  // ── CORS ───────────────────────────────────────────────────────────────
  // Bo'sh bo'lsa: prod'da faqat o'z domeni (same-origin), dev'da localhost.
  allowedOrigins: list(process.env.ALLOWED_ORIGINS),
  allowCredentials: true,

  // ── Cookie ─────────────────────────────────────────────────────────────
  cookieName: "edu_rt",
  csrfCookieName: "edu_csrf",
  // "Sessiya bor edi" belgisi — httpOnly EMAS, ichida sir yo'q. Mijoz shuni
  // o'qib, login qilinmagan holatda serverga bekorga so'rov yubormaydi.
  sessionHintCookieName: "edu_has_session",
  // Portallar boshqa domenda (Vercel) bo'lsa — SameSite=None; Secure kerak.
  crossSite: bool(process.env.CROSS_SITE_AUTH, false),
  cookieDomain: (process.env.COOKIE_DOMAIN || "").trim() || null,

  // ── So'rov cheklovlari ─────────────────────────────────────────────────
  jsonLimit: process.env.JSON_LIMIT || "25mb",
  maxBlobBytes: int(process.env.MAX_BLOB_BYTES, 40 * 1024 * 1024),
  maxKvValueBytes: int(process.env.MAX_KV_VALUE_BYTES, 20 * 1024 * 1024),

  // ── Ishonchli proxy (Render/Vercel oldida turadi) ──────────────────────
  trustProxy: bool(process.env.TRUST_PROXY, true),

  // ── Boshlang'ich admin ─────────────────────────────────────────────────
  bootstrapAdminUser: (process.env.BOOTSTRAP_ADMIN_USER || "admin").trim(),
  bootstrapAdminPassword: (process.env.BOOTSTRAP_ADMIN_PASSWORD || "").trim(),

  // ── Audit ──────────────────────────────────────────────────────────────
  auditRetentionDays: int(process.env.AUDIT_RETENTION_DAYS, 180),

  // ── Ochiq (autentifikatsiyasiz) sertifikat tekshiruvi ─────────────────
  publicCertLookup: bool(process.env.PUBLIC_CERT_LOOKUP, true),
};

/** Ishga tushishda muhitni tekshirish — zaif sozlama bo'lsa ogohlantiradi/to'xtatadi. */
export function auditEnvironment() {
  const problems = [];
  const warnings = [];

  if (!process.env.MONGODB_URI) warnings.push("MONGODB_URI yo'q — localhost ishlatiladi.");
  const uri = process.env.MONGODB_URI || "";
  if (IS_PROD && /:\/\/[^/@]*:[^/@]*@/.test(uri) === false && !/localhost|127\.0\.0\.1/.test(uri))
    warnings.push("MONGODB_URI parolsiz ko'rinadi.");

  if (IS_PROD && CONFIG.allowedOrigins.length === 0)
    warnings.push(
      "ALLOWED_ORIGINS ko'rsatilmagan — faqat same-origin so'rovlar qabul qilinadi.",
    );
  if (CONFIG.allowedOrigins.includes("*"))
    problems.push("ALLOWED_ORIGINS ichida '*' bor — bu CORS himoyasini butunlay o'chiradi.");

  if (IS_PROD && CONFIG.allowLegacyPasswords)
    warnings.push(
      "ALLOW_LEGACY_PASSWORDS yoqilgan — eski ochiq matnli parollar hali ishlaydi. " +
        "Barcha foydalanuvchi kirib bo'lgach ALLOW_LEGACY_PASSWORDS=0 qiling.",
    );

  if (CONFIG.bootstrapAdminPassword && CONFIG.bootstrapAdminPassword.length < CONFIG.passwordMinLength)
    problems.push("BOOTSTRAP_ADMIN_PASSWORD juda qisqa.");

  if (problems.length) {
    console.error("\n🛑 XAVFSIZLIK: server ishga tushmadi\n" + problems.map((p) => "   • " + p).join("\n") + "\n");
    throw new Error("Xavfsizlik sozlamalari yaroqsiz");
  }
  if (warnings.length)
    console.warn("\n⚠️  Xavfsizlik eslatmalari:\n" + warnings.map((w) => "   • " + w).join("\n") + "\n");
}

export default CONFIG;
