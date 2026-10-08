/**
 * security/middleware.js — Autentifikatsiya va ruxsat (RBAC) qatlami.
 *
 * `requireAuth`  — Bearer token bo'lmasa 401.
 * `requireRole`  — rol yetarli bo'lmasa 403.
 * `optionalAuth` — token bo'lsa taniydi, bo'lmasa ham o'tkazadi (ochiq sahifalar).
 *
 * Access token ichidagi `tv` (token version) hisobdagi `tokenVersion` bilan
 * solishtiriladi: parol o'zgarsa yoki hisob o'chirilsa, hali muddati
 * tugamagan tokenlar ham DARHOL kuchini yo'qotadi.
 */
import { verifyToken, randomToken, timingSafeStr } from "./crypto.js";
import { CONFIG } from "./config.js";
import { findByIdCached, ROLES } from "./accounts.js";
import { audit } from "./audit.js";

// ─── Cookie o'qish/yozish (tashqi kutubxonasiz) ───────────────────────────────

export function cookieParser(req, _res, next) {
  const header = req.get("cookie") || "";
  const jar = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k) continue;
    try {
      jar[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      jar[k] = part.slice(i + 1).trim();
    }
  }
  req.cookies = jar;
  next();
}

/** Cookie sozlamalari — brauzer himoyasining muhim qismi. */
function cookieOptions(req, maxAgeSec) {
  const proto = (req.get("x-forwarded-proto") || req.protocol || "http").split(",")[0].trim();
  const secure = proto === "https" || CONFIG.isProd;
  const parts = [
    "Path=/",
    "HttpOnly",                                       // JS o'qiy olmaydi → XSS o'g'irlay olmaydi
    `Max-Age=${maxAgeSec}`,
    secure ? "Secure" : null,                          // faqat HTTPS orqali
    // Portallar boshqa domenda bo'lsa None kerak, aks holda Strict — CSRF'ga qarshi eng kuchli
    CONFIG.crossSite ? "SameSite=None" : "SameSite=Strict",
    CONFIG.cookieDomain ? `Domain=${CONFIG.cookieDomain}` : null,
  ].filter(Boolean);
  if (CONFIG.crossSite && !secure)
    console.warn("⚠️  CROSS_SITE_AUTH yoqilgan, lekin ulanish HTTPS emas — cookie ishlamasligi mumkin.");
  return parts.join("; ");
}

export function setRefreshCookie(req, res, token) {
  res.append("Set-Cookie", `${CONFIG.cookieName}=${encodeURIComponent(token)}; ${cookieOptions(req, CONFIG.refreshTtlSec)}`);
  // CSRF uchun juft cookie — HttpOnly EMAS, chunki mijoz uni o'qib
  // sarlavhaga qo'yishi kerak (double-submit).
  const csrf = randomToken(16);
  const proto = (req.get("x-forwarded-proto") || req.protocol || "http").split(",")[0].trim();
  const secure = proto === "https" || CONFIG.isProd;
  res.append(
    "Set-Cookie",
    `${CONFIG.csrfCookieName}=${csrf}; Path=/; Max-Age=${CONFIG.refreshTtlSec}` +
      (secure ? "; Secure" : "") +
      (CONFIG.crossSite ? "; SameSite=None" : "; SameSite=Strict") +
      (CONFIG.cookieDomain ? `; Domain=${CONFIG.cookieDomain}` : ""),
  );
  // ── Sessiya belgisi (maxfiy EMAS) ───────────────────────────────────────
  // Refresh cookie httpOnly — JS uni ko'ra olmaydi. Shu sababli sahifa
  // ochilganda mijoz "sessiya bormi?" degan savolga faqat serverga so'rov
  // yuborib javob olardi va login qilinmagan har bir tashrifda konsolda
  // `POST /api/auth/refresh 401` chiqib turardi. Bu belgi cookie'si aynan
  // refresh cookie bilan birga qo'yiladi va o'chiriladi; ichida hech qanday
  // sir yo'q — faqat "sessiya bor edi" degan ma'no.
  res.append(
    "Set-Cookie",
    `${CONFIG.sessionHintCookieName}=1; Path=/; Max-Age=${CONFIG.refreshTtlSec}` +
      (secure ? "; Secure" : "") +
      (CONFIG.crossSite ? "; SameSite=None" : "; SameSite=Strict") +
      (CONFIG.cookieDomain ? `; Domain=${CONFIG.cookieDomain}` : ""),
  );

  return csrf;
}

export function clearAuthCookies(req, res) {
  const base = `Path=/; Max-Age=0` + (CONFIG.cookieDomain ? `; Domain=${CONFIG.cookieDomain}` : "");
  res.append("Set-Cookie", `${CONFIG.cookieName}=; HttpOnly; ${base}; SameSite=${CONFIG.crossSite ? "None; Secure" : "Strict"}`);
  res.append("Set-Cookie", `${CONFIG.csrfCookieName}=; ${base}; SameSite=${CONFIG.crossSite ? "None; Secure" : "Strict"}`);
  res.append("Set-Cookie", `${CONFIG.sessionHintCookieName}=; ${base}; SameSite=${CONFIG.crossSite ? "None; Secure" : "Strict"}`);
}

/**
 * Double-submit CSRF: cookie'dagi qiymat va sarlavhadagi qiymat mos kelishi
 * kerak. Begona sayt cookie'ni yubora oladi, lekin uni O'QIY olmaydi —
 * demak sarlavhaga qo'ya olmaydi.
 */
export function requireCsrf(req, res, next) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  const cookie = req.cookies?.[CONFIG.csrfCookieName];
  const header = req.get("x-csrf-token");
  if (!cookie || !header || !timingSafeStr(cookie, header))
    return res.status(403).json({ ok: false, code: "csrf-invalid", error: "CSRF tekshiruvi o'tmadi" });
  next();
}

// ─── Token o'qish ─────────────────────────────────────────────────────────────

function bearer(req) {
  const h = req.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

/**
 * Access tokenni tekshiradi va `req.user` ni to'ldiradi.
 * @returns {Promise<{ok:true, user:object} | {ok:false, code:string, error:string}>}
 */
export async function resolveUser(req) {
  const token = bearer(req) || (typeof req.query?.access_token === "string" ? req.query.access_token : null);
  if (!token) return { ok: false, code: "no-token", error: "Avtorizatsiya talab qilinadi" };

  const v = verifyToken(token);
  if (!v.ok)
    return {
      ok: false,
      code: v.error === "expired" ? "token-expired" : "token-invalid",
      error: v.error === "expired" ? "Sessiya muddati tugadi" : "Token yaroqsiz",
    };

  const p = v.payload;
  if (p.typ !== "access") return { ok: false, code: "token-invalid", error: "Token turi noto'g'ri" };

  const acc = await findByIdCached(p.sub);
  if (!acc) return { ok: false, code: "account-missing", error: "Hisob topilmadi" };
  if (acc.status === "disabled") return { ok: false, code: "account-disabled", error: "Hisob faol emas" };
  if ((acc.tokenVersion || 1) !== p.tv)
    return { ok: false, code: "token-stale", error: "Sessiya bekor qilingan — qaytadan kiring" };

  return {
    ok: true,
    user: {
      sub: String(acc._id),
      id: String(acc._id),
      username: acc.username,
      name: acc.name,
      role: acc.role,
      mentorName: acc.mentorName || null,
      studentId: acc.studentId ?? null,
      studentName: acc.studentName || null,
      mustChangePassword: !!acc.mustChangePassword,
    },
  };
}

export function requireAuth(req, res, next) {
  resolveUser(req)
    .then((r) => {
      if (!r.ok) {
        // 401 = "kim ekaningizni bilmayman", 403 = "bilaman, lekin ruxsat yo'q"
        return res.status(401).json({ ok: false, code: r.code, error: r.error });
      }
      req.user = r.user;
      next();
    })
    .catch((e) => res.status(500).json({ ok: false, error: "Autentifikatsiya xatosi" }));
}

/** Token bo'lsa taniydi, bo'lmasa `req.user = null` bilan davom etadi. */
export function optionalAuth(req, _res, next) {
  resolveUser(req)
    .then((r) => {
      req.user = r.ok ? r.user : null;
      next();
    })
    .catch(() => {
      req.user = null;
      next();
    });
}

/** @param {...string} roles — ROLES.ADMIN, ROLES.MENTOR, ROLES.STUDENT */
export function requireRole(...roles) {
  const allowed = new Set(roles.flat());
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, code: "no-token", error: "Avtorizatsiya talab qilinadi" });
    if (!allowed.has(req.user.role)) {
      audit("authz.denied", {
        req,
        actor: req.user,
        meta: { need: [...allowed], have: req.user.role },
        severity: "warn",
      });
      return res.status(403).json({ ok: false, code: "forbidden", error: "Bu amal uchun ruxsat yo'q" });
    }
    next();
  };
}

export const requireAdmin = [requireAuth, requireRole(ROLES.ADMIN)];
export const requireStaff = [requireAuth, requireRole(ROLES.ADMIN, ROLES.MENTOR)];

/**
 * Parolni almashtirish majburiy bo'lgan hisob boshqa hech nima qila olmasin
 * (admin tomonidan tiklangan vaqtinchalik paroldan keyin).
 */
export function blockUntilPasswordChanged(req, res, next) {
  if (req.user?.mustChangePassword)
    return res.status(403).json({
      ok: false,
      code: "password-change-required",
      error: "Davom etishdan oldin parolni almashtiring",
    });
  next();
}
