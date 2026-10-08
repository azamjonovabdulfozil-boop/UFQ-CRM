/**
 * security/index.js — Xavfsizlik qatlamini ilovaga ulash.
 *
 * server.js dan faqat ikkita chaqiruv kerak:
 *     installSecurity(app)            — middleware'lar (marshrutlardan OLDIN)
 *     await initSecurityStore(getDb)  — baza tayyor bo'lgach (indeks + ko'chirish)
 */
import crypto from "node:crypto";
import { CONFIG, auditEnvironment } from "./config.js";
import { securityHeaders } from "./headers.js";
import { compression } from "./compress.js";
import { corsMiddleware, verifyOrigin } from "./cors.js";
import { cookieParser } from "./middleware.js";
import { sanitizeRequest } from "./sanitize.js";
import { globalLimiter } from "./rateLimit.js";
import { initAudit, ensureAuditIndexes, audit } from "./audit.js";
import { initAccounts, ensureAccountIndexes } from "./accounts.js";
import { initSessions, ensureSessionIndexes } from "./sessions.js";
import { initDevices, ensureDeviceIndexes, deviceId } from "./devices.js";
import { bootstrapSecurity } from "./bootstrap.js";
import { createAuthRouter } from "./routes.js";

export * from "./middleware.js";
export * from "./policy.js";
export { CONFIG } from "./config.js";
export { ROLES, publicView, toLegacyRole, fromLegacyRole } from "./accounts.js";
export { audit } from "./audit.js";
export { rateLimit, expensiveLimiter, writeLimiter, publicLookupLimiter, clientIp, deviceKey } from "./rateLimit.js";
export { deviceId, checkDeviceBlock, listBlockedDevices, unblockDevice } from "./devices.js";
export { safeFetch, assertSafeUrl } from "./ssrf.js";
export { syncPortalAccounts } from "./routes.js";
export * from "./sanitize.js";

/** Har so'rovga kuzatuv identifikatori — loglarni bog'lash uchun. */
function requestId(req, res, next) {
  const id = crypto.randomUUID();
  req.id = id;
  res.setHeader("X-Request-Id", id);
  next();
}

/** Qurilma cookie'sini o'qiydi/qo'yadi — `req._deviceId` to'ldiriladi. */
function deviceTag(req, res, next) {
  try {
    deviceId(req, res);
  } catch {}
  next();
}

/**
 * Marshrutlardan OLDIN chaqiriladi.
 * Tartib muhim: sarlavhalar → CORS → cookie → tozalash → limit → CSRF.
 */
export function installSecurity(app) {
  auditEnvironment();

  if (CONFIG.trustProxy) app.set("trust proxy", 1); // Render/Vercel proxy orqasida to'g'ri IP
  app.disable("x-powered-by");
  // ETag statik fayllar uchun QOLDIRILADI: brauzer o'zgarmagan faylni qayta
  // yuklamaydi (304). API javoblari baribir `no-store` bilan ketadi, shuning
  // uchun ular keshlanmaydi.
  app.set("etag", "weak");

  app.use(requestId);
  app.use(securityHeaders);
  // Javoblarni siqish — katta JSON (butun CRM ma'lumoti) uchun eng katta ta'sir
  app.use(compression);
  app.use(corsMiddleware);
  app.use(cookieParser);
  // Qurilma identifikatori (cookie `edu_did`) — bloklash IP emas, QURILMA
  // bo'yicha ishlashi uchun. cookieParser dan KEYIN turishi shart.
  app.use(deviceTag);

  return {
    /** JSON body o'qilgandan KEYIN ulanadigan qatlam. */
    afterBodyParser(app2) {
      app2.use(sanitizeRequest);
      app2.use(globalLimiter);
      app2.use(verifyOrigin);
      app2.use("/api", createAuthRouter());
    },
  };
}

/** JSON parse xatolarini tushunarli qilib qaytaradi (HTML sahifa o'rniga). */
export function bodyErrorHandler(err, req, res, next) {
  if (!err) return next();
  if (err.type === "entity.too.large" || err.status === 413)
    return res.status(413).json({ ok: false, code: "payload-too-large", error: "Yuborilgan ma'lumot juda katta" });
  if (err.type === "entity.parse.failed" || err instanceof SyntaxError)
    return res.status(400).json({ ok: false, code: "bad-json", error: "JSON formati noto'g'ri" });
  return next(err);
}

/**
 * Oxirgi xato ushlagich — ichki xato matni tashqariga CHIQMAYDI.
 * Stack trace, MongoDB xabari va fayl yo'llari hujumchi uchun qimmatli
 * ma'lumot; foydalanuvchi faqat request id ni ko'radi.
 */
export function errorHandler(err, req, res, _next) {
  const id = req.id || "-";
  console.error(`❌ [${id}] ${req.method} ${req.originalUrl}:`, err?.stack || err);
  audit("server.error", {
    req,
    actor: req.user || null,
    meta: { message: String(err?.message || err).slice(0, 300) },
    severity: "warn",
  }).catch(() => {});
  if (res.headersSent) return;
  res.status(err?.status || 500).json({
    ok: false,
    code: "internal-error",
    error: CONFIG.isProd ? "Ichki xatolik yuz berdi" : String(err?.message || err),
    requestId: id,
  });
}

/** Baza tayyor bo'lgach chaqiriladi: indekslar + eski hisoblarni ko'chirish. */
export async function initSecurityStore(getDb) {
  initAudit(getDb);
  initAccounts(getDb);
  initSessions(getDb);
  initDevices(getDb);

  await ensureAuditIndexes();
  await ensureAccountIndexes();
  await ensureSessionIndexes();
  await ensureDeviceIndexes();
  await bootstrapSecurity(getDb);

  await audit("server.start", { meta: { prod: CONFIG.isProd } });
}
