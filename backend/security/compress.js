/**
 * security/compress.js — Javoblarni siqish (gzip / brotli).
 *
 * NEGA
 * `/api/kv` butun CRM ma'lumotini bitta JSON qilib qaytaradi — bu bir necha
 * megabayt bo'lishi mumkin. Siqilmagan holda uni tarmoq orqali uzatish
 * sekinlikning asosiy qismi edi. JSON juda yaxshi siqiladi (odatda 5–10 barobar).
 *
 * Tashqi `compression` paketi o'rniga Node'ning o'z `zlib` moduli — qo'shimcha
 * bog'liqlik yo'q.
 *
 * Xavfsizlik eslatmasi: siqish + maxfiy ma'lumot birgalikda BREACH/CRIME
 * turidagi hujumlarga yo'l ochishi mumkin. Bu hujum sirni TOPISH uchun
 * javobga hujumchi nazorat qiladigan matn qo'shishni talab qiladi. Shu sabab
 * autentifikatsiya javoblari (token, CSRF) SIQILMAYDI — pastdagi SKIP ro'yxati.
 */
import zlib from "node:zlib";

/** Siqishdan foyda yo'q (allaqachon siqilgan) turlar. */
const SKIP_TYPES = /^(image\/(?!svg)|video\/|audio\/|font\/|application\/(zip|gzip|pdf|octet-stream))/i;

/** Token/CSRF chiqadigan yo'llar — siqilmaydi (BREACH). */
const SKIP_PATHS = /^\/api\/auth\//;

/** Shundan kichik javoblarni siqish foyda bermaydi (sarlavha o'zi katta). */
const MIN_BYTES = 1024;

const BROTLI_OPTS = {
  params: {
    [zlib.constants.BROTLI_PARAM_QUALITY]: 4, // tezlik/hajm muvozanati
    [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
  },
};
const GZIP_OPTS = { level: 6 };

function pickEncoding(req) {
  const accept = (req.get("accept-encoding") || "").toLowerCase();
  if (accept.includes("br")) return "br";
  if (accept.includes("gzip")) return "gzip";
  return null;
}

/**
 * res.json() va res.send() ni o'rab, javob tanasini siqadi.
 * Oqim (SSE) va fayl yuborish (sendFile) ga TEGMAYDI.
 */
export function compression(req, res, next) {
  const encoding = pickEncoding(req);
  if (!encoding || SKIP_PATHS.test(req.path)) return next();

  const origJson = res.json.bind(res);
  const origSend = res.send.bind(res);

  const compress = (buf, contentType) => {
    if (!Buffer.isBuffer(buf)) return null;
    if (buf.length < MIN_BYTES) return null;
    if (contentType && SKIP_TYPES.test(contentType)) return null;
    try {
      return encoding === "br"
        ? zlib.brotliCompressSync(buf, BROTLI_OPTS)
        : zlib.gzipSync(buf, GZIP_OPTS);
    } catch {
      return null;
    }
  };

  res.json = function (body) {
    const raw = Buffer.from(JSON.stringify(body), "utf8");
    const out = compress(raw, "application/json");
    if (!out) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return origSend(raw);
    }
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Encoding", encoding);
    res.setHeader("Content-Length", String(out.length));
    res.setHeader("Vary", mergeVary(res.getHeader("Vary")));
    return origSend(out);
  };

  res.send = function (body) {
    // Faqat matn/bufer — obyekt bo'lsa res.json ga tushadi
    if (typeof body === "object" && body !== null && !Buffer.isBuffer(body)) return origJson(body);
    const type = String(res.getHeader("Content-Type") || "");
    const raw = Buffer.isBuffer(body) ? body : Buffer.from(String(body ?? ""), "utf8");
    const out = compress(raw, type);
    if (!out) return origSend(body);
    if (!type) res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Encoding", encoding);
    res.setHeader("Content-Length", String(out.length));
    res.setHeader("Vary", mergeVary(res.getHeader("Vary")));
    return origSend(out);
  };

  next();
}

/** Mavjud Vary qiymatini buzmasdan Accept-Encoding qo'shamiz. */
function mergeVary(current) {
  const parts = String(current || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.some((p) => p.toLowerCase() === "accept-encoding")) parts.push("Accept-Encoding");
  return parts.join(", ");
}

export default compression;
