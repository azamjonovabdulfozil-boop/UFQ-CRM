/**
 * security/kick.js — hisob o'chirilganda/bloklanganda uning ochiq sahifalarini
 * DARHOL yopish.
 *
 * Server bunday hisobning so'rovlarini baribir rad etadi (requireAuth har
 * so'rovda hisobni tekshiradi). Lekin ochiq turgan CRM sahifasi keyingi
 * so'rovgacha ishlayotgandek ko'rinadi. server.js shu yerga SSE oqimlariga
 * xabar yuboruvchi funksiyani ulaydi; brauzer xabarni olib, darhol login
 * ekraniga qaytadi.
 */

let handler = null;

/** server.js chaqiradi: (accountId, reason) => yopilgan oqimlar soni */
export function setKickHandler(fn) {
  handler = typeof fn === "function" ? fn : null;
}

/**
 * @param {string} accountId
 * @param {"deleted"|"disabled"|"password"|"revoked"} reason
 */
export function kickAccount(accountId, reason) {
  if (!handler || !accountId) return 0;
  try {
    return handler(String(accountId), reason) || 0;
  } catch {
    return 0;
  }
}
