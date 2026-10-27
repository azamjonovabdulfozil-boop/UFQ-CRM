/**
 * security/xssData.js — CRM ma'lumotidagi HTML/JS in'yeksiyasini zararsizlantiradi.
 *
 * Muammo: portallar ma'lumotni (ism, guruh nomi, test savoli, chat fayli…)
 * HTML shablonlarga ekranlamasdan qo'yadi, CSP esa ilova tugmalari uchun
 * inline `onclick` ga ruxsat beradi. Natijada mentor yoki talaba yozgan
 * `<img onerror=…>` admin brauzerida ishga tushardi.
 *
 * Yechim — ma'lumotning o'zida: HTML tuzilishini buzadigan belgilar ko'rinishi
 * deyarli bir xil, lekin brauzer teg deb tushunmaydigan belgilarga almashadi:
 *     <  →  ‹      >  →  ›      "  →  ”
 * va `javascript:` / `vbscript:` / `data:text/html` havolalari o'chiriladi.
 * Ilova ma'lumotga HTML saqlamaydi, shuning uchun hech narsa buzilmaydi.
 *
 * Ikki joyda qo'llanadi: yozishda (bazaga toza tushadi) va o'qishda (bazada
 * qolgan eski yozuvlar ham bazaga tegmasdan zararsizlanadi).
 */

const RISKY = /[<>"]|script\s*:|data\s*:\s*text\/html/i;
// Havola sxemasi: boshidagi bo'shliq va boshqaruv belgilari brauzer tomonidan tashlab yuboriladi
const BAD_SCHEME = /^[\s\u0000-\u001f]*(javascript|vbscript|data\s*:\s*text\/html)/i;

export function cleanStr(s) {
  if (typeof s !== "string" || !RISKY.test(s)) return s;
  let out = s.replace(/</g, "‹").replace(/>/g, "›").replace(/"/g, "”");
  if (BAD_SCHEME.test(out)) out = "#" + out.replace(BAD_SCHEME, "").replace(/^\s*:?/, "");
  return out;
}

/** Obyekt/massivni chuqur tozalaydi. Asl obyekt o'zgarmaydi — o'zgargan bo'lsa yangisi qaytadi. */
export function cleanDeep(v, depth = 0) {
  if (typeof v === "string") return cleanStr(v);
  if (!v || typeof v !== "object" || depth > 40) return v;
  if (Array.isArray(v)) {
    let changed = false;
    const out = v.map((x) => {
      const y = cleanDeep(x, depth + 1);
      if (y !== x) changed = true;
      return y;
    });
    return changed ? out : v;
  }
  if (v instanceof Date || (v.constructor && v.constructor.name === "ObjectId")) return v;
  let changed = false;
  const out = {};
  for (const k of Object.keys(v)) {
    const nk = cleanStr(k);
    const nv = cleanDeep(v[k], depth + 1);
    if (nk !== k || nv !== v[k]) changed = true;
    out[nk] = nv;
  }
  return changed ? out : v;
}

/** KV qiymati (odatda JSON satr) — ichini tozalab qaytaradi. */
export function cleanKvValue(value) {
  if (typeof value !== "string" || !RISKY.test(value)) return value;
  const t = value.trimStart();
  if (t[0] === "{" || t[0] === "[") {
    try {
      const parsed = JSON.parse(value);
      const c = cleanDeep(parsed);
      return c === parsed ? value : JSON.stringify(c);
    } catch {
      /* JSON emas — oddiy satr sifatida */
    }
  }
  // JSON ichidagi qo'shtirnoqlar ("") — JSON bo'lmagan qiymatda bo'lmaydi
  return cleanStr(value);
}

// ── O'qish uchun kesh: bir xil ma'lumot har so'rovda qayta yurilmasin ──
const objCache = new WeakMap();
export function cleanDeepCached(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const hit = objCache.get(obj);
  if (hit) return hit;
  const out = cleanDeep(obj);
  objCache.set(obj, out);
  return out;
}

const kvCache = new Map(); // key → { src, out }
export function cleanKvCached(key, value) {
  const hit = kvCache.get(key);
  if (hit && hit.src === value) return hit.out;
  const out = cleanKvValue(value);
  kvCache.set(key, { src: value, out });
  if (kvCache.size > 5000) kvCache.delete(kvCache.keys().next().value);
  return out;
}
