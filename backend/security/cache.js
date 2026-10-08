/**
 * security/cache.js — Qisqa muddatli xotira keshi (hisoblar uchun).
 *
 * NEGA KERAK
 * Har bir himoyalangan so'rovda `requireAuth` hisobni bazadan o'qir edi.
 * MongoDB Atlas boshqa qit'ada bo'lgani uchun bitta o'qish ~220 ms — ya'ni
 * HAR BIR so'rovga 220 ms qo'shilardi. Kesh buni deyarli nolga tushiradi.
 *
 * XAVFSIZLIK
 * Kesh — bu "eskirgan ruxsat" xavfi. Shuning uchun:
 *   • TTL juda qisqa (30 s);
 *   • hisob o'zgargan HAR BIR joyda (parol, status, o'chirish, tokenVersion)
 *     kesh DARHOL tozalanadi — ya'ni bloklangan foydalanuvchi 30 soniya emas,
 *     o'sha zahoti chiqarib yuboriladi;
 *   • kesh faqat shu jarayon xotirasida — qayta ishga tushirilsa yo'qoladi.
 */

const TTL_MS = 30_000;
const MAX_ENTRIES = 5000;

/** @type {Map<string, {value:any, expires:number}>} */
const store = new Map();

export function cacheGet(key) {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    store.delete(key);
    return undefined;
  }
  // LRU: eng yangi ishlatilgan oxiriga ko'chadi
  store.delete(key);
  store.set(key, hit);
  return hit.value;
}

export function cacheSet(key, value, ttlMs = TTL_MS) {
  if (store.size >= MAX_ENTRIES) {
    // Eng eski yozuvni chiqaramiz (Map tartibi = qo'shilish tartibi)
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, { value, expires: Date.now() + ttlMs });
}

export function cacheDelete(key) {
  store.delete(key);
}

/** Hisob o'zgarganda chaqiriladi — id va login bo'yicha ikkala yozuv ham. */
export function invalidateAccount(id, username) {
  if (id) store.delete("acc:" + String(id));
  if (username) store.delete("accu:" + String(username).toLowerCase());
}

export function cacheClear() {
  store.clear();
}

export const cacheStats = () => ({ size: store.size, ttlMs: TTL_MS });
