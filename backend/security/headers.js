/**
 * security/headers.js — HTTP xavfsizlik sarlavhalari (helmet o'rnini bosadi).
 *
 * Har biri aniq hujumga qarshi:
 *   CSP                     — XSS: begona skript yuklanmaydi/ishlamaydi
 *   X-Frame-Options         — clickjacking: sahifa begona iframe ichida ochilmaydi
 *   X-Content-Type-Options  — MIME sniffing
 *   Referrer-Policy         — manzildagi maxfiy qiymatlar tashqariga chiqmaydi
 *   HSTS                    — brauzer bu domenga faqat HTTPS bilan boradi
 *   Permissions-Policy      — kamera/mikrofon/geolokatsiya kabi API'lar o'chiq
 */

// Portal Vue ilovasi va core skriptlari inline stil ishlatadi, shuning uchun
// style-src'da 'unsafe-inline' qoldirilgan. Skript uchun esa u YO'Q — aynan
// skript XSS uchun eng xavfli vektor.
import crypto from "node:crypto";

const cspApp = (nonce) => [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  // Inline skript FAQAT nonce bilan ishlaydi — XSS orqali qo'shilgan
  // <script> teg nonce ni bilmagani uchun brauzer uni ishga tushirmaydi.
  `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "connect-src 'self' https: wss:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

// API javoblari uchun — hech narsa yuklanmaydi, hech qayerga chizilmaydi.
const CSP_API = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; sandbox";

const CACHEABLE_API = /^\/api\/(img-proxy|cert-render\.js)/;

export function securityHeaders(req, res, next) {
  const isApi = req.path.startsWith("/api/");

  // Har sahifa uchun yangi nonce — sahifa ichidagi o'z skriptimiz shu bilan
  // belgilanadi, boshqasi ishlamaydi.
  const nonce = crypto.randomBytes(16).toString("base64");
  res.locals.cspNonce = nonce;

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", isApi ? "DENY" : "SAMEORIGIN");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", isApi ? "same-origin" : "cross-origin");
  res.setHeader("Origin-Agent-Cluster", "?1");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), interest-cohort=()",
  );
  res.setHeader("Content-Security-Policy", isApi ? CSP_API : cspApp(nonce));
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");

  // HSTS faqat HTTPS orqali kelgan so'rovda — aks holda dev'da localhost
  // brauzerda "faqat https" bo'lib qulflanib qoladi.
  const proto = (req.get("x-forwarded-proto") || req.protocol || "").split(",")[0].trim();
  if (proto === "https")
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");

  res.removeHeader("X-Powered-By");

  // Maxfiy javoblar keshlanmasin
  if (isApi && !CACHEABLE_API.test(req.path)) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
  }
  next();
}

export default securityHeaders;
