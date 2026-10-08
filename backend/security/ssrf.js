/**
 * security/ssrf.js — SSRF (Server-Side Request Forgery) himoyasi.
 *
 * `/api/img-proxy` foydalanuvchi bergan URL ni SERVER nomidan ochadi. Himoyasiz
 * holda bu bilan ichki tarmoqqa kirish mumkin:
 *   http://169.254.169.254/latest/meta-data/   → bulut hisob ma'lumotlari
 *   http://localhost:27017/                    → MongoDB
 *   http://10.0.0.5/admin                      → ichki panel
 *
 * Shu sabab: sxema oq ro'yxati, DNS natijasini tekshirish (domen ichki IP ga
 * ko'rsatishi mumkin), qayta yo'naltirishlarni qo'lda kuzatish (har qadamda
 * qayta tekshirish), hajm va vaqt cheklovi.
 */
import dns from "node:dns/promises";
import net from "node:net";

/** RFC1918 va boshqa maxsus diapazonlar. */
function isPrivateIPv4(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

function isPrivateIPv6(ip) {
  const s = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (s === "::" || s === "::1") return true;
  if (s.startsWith("fe80")) return true; // link-local
  if (/^f[cd]/.test(s)) return true; // unique local fc00::/7
  if (s.startsWith("::ffff:")) {
    const v4 = s.slice(7);
    return net.isIPv4(v4) ? isPrivateIPv4(v4) : true;
  }
  if (s.startsWith("64:ff9b:")) return true; // NAT64 → ichki IPv4 ga o'tishi mumkin
  return false;
}

export function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return true; // noma'lum format — ishonmaymiz
}

/**
 * URL ni tekshiradi va u ko'rsatayotgan barcha IP manzillarni qaytaradi.
 * @returns {Promise<{ok:true, url:URL, addresses:string[]} | {ok:false, error:string}>}
 */
export async function assertSafeUrl(rawUrl) {
  let u;
  try {
    u = new URL(String(rawUrl));
  } catch {
    return { ok: false, error: "URL yaroqsiz" };
  }

  if (u.protocol !== "http:" && u.protocol !== "https:")
    return { ok: false, error: "Faqat http/https ruxsat etilgan" };
  if (u.username || u.password)
    return { ok: false, error: "URL ichida login/parol bo'lmasin" };

  const host = u.hostname.replace(/^\[|\]$/g, "");

  // To'g'ridan-to'g'ri IP berilgan bo'lsa
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) return { ok: false, error: "Ichki tarmoq manzili taqiqlangan" };
    return { ok: true, url: u, addresses: [host] };
  }

  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.home\.arpa)$/i.test(host))
    return { ok: false, error: "Ichki domen taqiqlangan" };

  let addrs;
  try {
    addrs = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    return { ok: false, error: "Domen topilmadi" };
  }
  if (!addrs.length) return { ok: false, error: "Domen manzilga yechilmadi" };

  // Bittasi ham ichki bo'lsa — rad etamiz (DNS rebinding'ga qarshi qat'iylik).
  for (const a of addrs)
    if (isPrivateAddress(a.address))
      return { ok: false, error: "Domen ichki manzilga ko'rsatmoqda" };

  return { ok: true, url: u, addresses: addrs.map((a) => a.address) };
}

/**
 * Xavfsiz fetch: har bir qayta yo'naltirishni qo'lda tekshiradi, hajm va
 * vaqtni cheklaydi.
 * @returns {Promise<{ok:true, buffer:Buffer, mime:string} | {ok:false, status:number, error:string}>}
 */
export async function safeFetch(rawUrl, { maxBytes = 12 * 1024 * 1024, timeoutMs = 10_000, maxRedirects = 3, allowedMime = /^image\// } = {}) {
  let current = rawUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const check = await assertSafeUrl(current);
    if (!check.ok) return { ok: false, status: 400, error: check.error };

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    let r;
    try {
      r = await fetch(check.url.href, {
        signal: ctl.signal,
        redirect: "manual", // har qadamni O'ZIMIZ tekshiramiz
        headers: { Accept: "image/*", "User-Agent": "EduManage-ImageProxy/1.0" },
      });
    } catch (e) {
      clearTimeout(timer);
      return { ok: false, status: 502, error: e?.name === "AbortError" ? "Vaqt tugadi" : "Ulanib bo'lmadi" };
    }
    clearTimeout(timer);

    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get("location");
      if (!loc) return { ok: false, status: 502, error: "Redirect manzilsiz" };
      current = new URL(loc, check.url).href;
      continue;
    }

    if (!r.ok) return { ok: false, status: 502, error: "HTTP " + r.status };

    const mime = (r.headers.get("content-type") || "").split(";")[0].trim();
    if (allowedMime && !allowedMime.test(mime))
      return { ok: false, status: 415, error: "Ruxsat etilmagan tur: " + (mime || "noma'lum") };

    const declared = Number(r.headers.get("content-length") || 0);
    if (declared && declared > maxBytes)
      return { ok: false, status: 413, error: "Fayl juda katta" };

    // Oqimni bo'lak-bo'lak o'qiymiz — yolg'on Content-Length bilan xotirani
    // to'ldirib bo'lmasin.
    const chunks = [];
    let total = 0;
    const reader = r.body?.getReader();
    if (!reader) return { ok: false, status: 502, error: "Javob bo'sh" };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        try { await reader.cancel(); } catch {}
        return { ok: false, status: 413, error: "Fayl juda katta" };
      }
      chunks.push(Buffer.from(value));
    }
    return { ok: true, buffer: Buffer.concat(chunks, total), mime };
  }
  return { ok: false, status: 502, error: "Juda ko'p qayta yo'naltirish" };
}
