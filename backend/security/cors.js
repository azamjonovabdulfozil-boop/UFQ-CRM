/**
 * security/cors.js — Origin bo'yicha oq ro'yxat (avvalgi `*` o'rniga).
 *
 * `Access-Control-Allow-Origin: *` bilan cookie yuborib bo'lmaydi va har qanday
 * begona sayt API'ga so'rov yubora oladi. Endi faqat ro'yxatdagi domenlar, va
 * ular uchun `credentials: true` ishlaydi.
 */
import { CONFIG } from "./config.js";

const DEV_PATTERNS = [
  /^https?:\/\/localhost(:\d+)?$/i,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/i,
  /^https?:\/\/\[::1\](:\d+)?$/i,
  /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/i,
];

function buildMatchers() {
  const exact = new Set();
  const patterns = [];
  for (const o of CONFIG.allowedOrigins) {
    if (o.startsWith("*.")) {
      // *.vercel.app — pastki domenlar
      const host = o.slice(2).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      patterns.push(new RegExp(`^https://([a-z0-9-]+\\.)*${host}$`, "i"));
    } else {
      exact.add(o.replace(/\/$/, "").toLowerCase());
    }
  }
  if (!CONFIG.isProd) patterns.push(...DEV_PATTERNS);
  return { exact, patterns };
}

const { exact, patterns } = buildMatchers();

export function isAllowedOrigin(origin) {
  if (!origin) return false;
  const o = String(origin).replace(/\/$/, "").toLowerCase();
  if (exact.has(o)) return true;
  return patterns.some((re) => re.test(o));
}

/** So'rov o'z domenidan kelganmi (proxy orqasida ham to'g'ri ishlaydi). */
export function selfOrigin(req) {
  const proto = (req.get("x-forwarded-proto") || req.protocol || "http").split(",")[0].trim();
  return `${proto}://${req.get("host")}`;
}

export function corsMiddleware(req, res, next) {
  const origin = req.get("origin");

  // Origin yo'q = same-origin so'rov yoki server-to-server. CORS kerak emas.
  if (!origin) {
    if (req.method === "OPTIONS") return res.sendStatus(204);
    return next();
  }

  if (!isAllowedOrigin(origin) && origin.toLowerCase() !== selfOrigin(req).toLowerCase()) {
    // CORS sarlavhasi QO'YILMAYDI — brauzer javobni o'zi bloklaydi.
    if (req.method === "OPTIONS") return res.sendStatus(403);
    if (req.path.startsWith("/api/"))
      return res
        .status(403)
        .json({ ok: false, code: "cors-denied", error: "Origin ruxsat etilmagan" });
    return next();
  }

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type,Authorization,X-Client-Id,X-CSRF-Token,X-Device-Id,X-Requested-With",
  );
  res.setHeader("Access-Control-Expose-Headers", "X-Request-Id,Retry-After");
  res.setHeader("Access-Control-Max-Age", "600");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
}

/**
 * CSRF himoyasi — holatni o'zgartiruvchi so'rovda Origin/Referer tekshiriladi.
 * Sessiya cookie'da bo'lganda bu asosiy to'siq.
 */
export function verifyOrigin(req, res, next) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();

  const origin = req.get("origin");
  let source = origin || null;
  if (!source) {
    const ref = req.get("referer");
    if (ref) {
      try {
        source = new URL(ref).origin;
      } catch {
        source = null;
      }
    }
  }

  if (!source) {
    // Brauzer holatni o'zgartiruvchi so'rovda Origin ni deyarli har doim
    // yuboradi. Yo'qligi — brauzerdan tashqari mijoz (curl, mobil ilova):
    // ular Bearer token bilan ishlaydi, cookie bilan emas → CSRF xavfi yo'q.
    const hasCookieSession = !!(req.cookies && req.cookies[CONFIG.cookieName]);
    if (hasCookieSession && !req.get("authorization"))
      return res
        .status(403)
        .json({ ok: false, code: "csrf-origin-missing", error: "Origin sarlavhasi yo'q" });
    return next();
  }

  if (source.toLowerCase() === selfOrigin(req).toLowerCase() || isAllowedOrigin(source))
    return next();

  return res
    .status(403)
    .json({ ok: false, code: "csrf-bad-origin", error: "So'rov manbasi ruxsat etilmagan" });
}
