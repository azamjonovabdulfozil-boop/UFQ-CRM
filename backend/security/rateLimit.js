/**
 * security/rateLimit.js — So'rov chastotasini cheklash va brute-force to'sish.
 *
 * Uch qatlam:
 *   1) Global    — bitta IP dan daqiqasiga N so'rov (DoS/skanerlash)
 *   2) Nozik yo'l — login, AI, SMS/Telegram kabi "qimmat" endpointlar uchun qat'iyroq
 *   3) Hisob     — noto'g'ri parol ketma-ketligi (accounts.js da, bazada)
 *
 * Algoritm: sliding window counter — sodda, xotirada, taqsimlangan holatda ham
 * (bir instans) yetarlicha aniq. Render'da bitta instans ishlaydi.
 */

/** @type {Map<string, {count:number, reset:number, blockedUntil:number}>} */
const buckets = new Map();
let lastSweep = Date.now();

function sweep(now) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of buckets)
    if (b.reset < now && b.blockedUntil < now) buckets.delete(k);
}

/**
 * So'rovni yuborgan mijozning IP manzili. Proxy (Render/Cloudflare) orqasida
 * `req.ip` express'ning `trust proxy` sozlamasi bilan to'g'ri ishlaydi.
 * IPv6 uchun /64 prefiks olinadi — bitta foydalanuvchi minglab manzil bilan
 * limitni chetlab o'tolmasin.
 */
export function clientIp(req) {
  const raw = req.ip || req.socket?.remoteAddress || "unknown";
  const ip = String(raw).replace(/^::ffff:/, "");
  if (ip.includes(":")) return ip.split(":").slice(0, 4).join(":") + "::/64";
  return ip;
}

/**
 * @param {object} opts
 * @param {number} opts.windowMs  Oyna uzunligi
 * @param {number} opts.max       Oynadagi maksimal so'rov
 * @param {number} [opts.blockMs] Limit oshsa qancha vaqt to'liq bloklansin
 * @param {(req)=>string} [opts.key] Hisob kaliti (default: IP)
 * @param {string} [opts.name]    Log/audit uchun nom
 */
export function rateLimit({ windowMs, max, blockMs = 0, key, name = "rl", skip }) {
  return function limiter(req, res, next) {
    if (typeof skip === "function" && skip(req)) return next();

    const now = Date.now();
    sweep(now);

    const id = name + ":" + (typeof key === "function" ? key(req) : clientIp(req));
    let b = buckets.get(id);
    if (!b) {
      b = { count: 0, reset: now + windowMs, blockedUntil: 0 };
      buckets.set(id, b);
    }

    if (b.blockedUntil > now) {
      const retry = Math.ceil((b.blockedUntil - now) / 1000);
      res.setHeader("Retry-After", String(retry));
      return res.status(429).json({
        ok: false,
        code: "rate-limited",
        error: `Juda ko'p so'rov. ${retry} soniyadan keyin urinib ko'ring.`,
        retryAfter: retry,
      });
    }

    if (b.reset < now) {
      b.count = 0;
      b.reset = now + windowMs;
    }

    b.count++;
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - b.count)));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(b.reset / 1000)));

    if (b.count > max) {
      b.blockedUntil = now + (blockMs || windowMs);
      const retry = Math.ceil((b.blockedUntil - now) / 1000);
      res.setHeader("Retry-After", String(retry));
      return res.status(429).json({
        ok: false,
        code: "rate-limited",
        error: `Juda ko'p so'rov. ${retry} soniyadan keyin urinib ko'ring.`,
        retryAfter: retry,
      });
    }
    next();
  };
}

/** Muvaffaqiyatli amaldan keyin hisobni tozalash (masalan to'g'ri login). */
export function resetLimit(name, keyValue) {
  buckets.delete(name + ":" + keyValue);
}

/** Diagnostika uchun — nechta faol hisob bor. */
export const limiterStats = () => ({ buckets: buckets.size });

// ─── Tayyor cheklovlar ────────────────────────────────────────────────────────

/** Butun API uchun umumiy tom (DoS/skaner). */
export const globalLimiter = rateLimit({
  name: "global",
  windowMs: 60_000,
  max: 600,
  blockMs: 60_000,
  // SSE oqimi uzoq turadi va bitta so'rov sifatida hisoblanadi — muammo yo'q.
});

/**
 * So'rovni yuborgan QURILMA kaliti — IP EMAS.
 *
 * ⚠️ Ilgari login cheklovi IP bo'yicha edi. Bitta o'quv markazida hamma bitta
 * Wi-Fi orqali chiqadi: bitta talaba parolni bir necha marta xato yozsa,
 * BUTUN BINO 15 daqiqaga tizimdan uzilardi. Endi kalit qurilmadan olinadi
 * (cookie `edu_did` yoki `X-Device-Id`), shuning uchun blok faqat o'sha
 * telefon/kompyuterga tegadi. `devices.js` ni import qilmaymiz — modullar
 * halqasi (rateLimit → devices → audit → rateLimit) hosil bo'lmasin.
 */
export function deviceKey(req) {
  if (req._deviceId) return req._deviceId;
  const c = req.cookies?.edu_did;
  if (typeof c === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(c)) return c;
  const h = req.get?.("x-device-id");
  if (typeof h === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(h)) return h;
  // Zaxira: brauzer barmoq izi. IP QATNASHMAYDI — internet almashsa ham
  // kalit o'zgarmaydi, qo'shni qurilmaga esa yuqmaydi.
  const parts = [
    req.get?.("user-agent") || "",
    req.get?.("accept-language") || "",
    req.get?.("sec-ch-ua-platform") || "",
  ].join("|");
  let hash = 5381;
  for (let i = 0; i < parts.length; i++) hash = ((hash * 33) ^ parts.charCodeAt(i)) >>> 0;
  return "fp" + hash.toString(36);
}

/** Login/parol almashtirish — eng qat'iy. QURILMA bo'yicha (IP emas). */
export const authLimiter = rateLimit({
  name: "auth-device",
  windowMs: 15 * 60_000,
  max: 40,
  blockMs: 15 * 60_000,
  key: deviceKey,
});

/**
 * Login — foydalanuvchi nomi + qurilma bo'yicha.
 *
 * Kalitga qurilma ham qo'shilgan: aks holda begona odam sizning loginingiz
 * bilan ataylab xato parol yozib, SIZNI tizimdan uzib qo'ya olardi (DoS).
 * Endi u faqat o'z qurilmasini bloklaydi.
 */
export const loginUserLimiter = rateLimit({
  name: "auth-user",
  windowMs: 15 * 60_000,
  max: 12,
  blockMs: 15 * 60_000,
  key: (req) =>
    String(req.body?.username || req.body?.login || "?").toLowerCase().slice(0, 64) + "@" + deviceKey(req),
});

/** Yozuv amallari. */
export const writeLimiter = rateLimit({
  name: "write",
  windowMs: 60_000,
  max: 240,
  blockMs: 60_000,
});

/** Tashqi xizmatga pul/limit sarflaydigan yo'llar: AI, SMS, Telegram, proxy. */
export const expensiveLimiter = rateLimit({
  name: "expensive",
  windowMs: 60_000,
  max: 20,
  blockMs: 2 * 60_000,
});

/** Ochiq (loginsiz) sertifikat tekshiruvi — sanab chiqishga qarshi. */
export const publicLookupLimiter = rateLimit({
  name: "public-lookup",
  windowMs: 60_000,
  max: 30,
  blockMs: 5 * 60_000,
});
