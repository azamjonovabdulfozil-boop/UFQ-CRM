/**
 * security/policy.js — Maydon darajasidagi ruxsatlar (RBAC dan chuqurroq).
 *
 * Muammo: bu CRM da butun ma'lumot BITTA obyekt (`edumanage_crm_v8`) va bitta
 * KV omborida yashaydi. Faqat "yozishga ruxsat bor/yo'q" darajasida cheklash
 * yetarli emas — talaba o'z ballini yozayotganda AYNI so'rov bilan moliyaviy
 * bo'limni ham o'zgartirib yuborishi mumkin edi.
 *
 * Shu sabab bu yerda server tomonda quyidagilar majburlanadi:
 *   • KV kalitlariga rol bo'yicha ruxsat (kim qaysi kalitni yoza oladi)
 *   • CRM obyektining bo'limlariga rol bo'yicha ruxsat (talabaning yozuvi
 *     serverdagi nusxa ustiga FAQAT ruxsat etilgan bo'limlarda qo'llanadi)
 *   • Coin balansiga qoidalar (talaba o'z balansini oshira olmaydi)
 */
import { ROLES } from "./accounts.js";

export const CRM_KV_KEY = "edumanage_crm_v8";

// ─── KV kalitlari ─────────────────────────────────────────────────────────────

/** Faqat admin: hisob ma'lumotlari, foydalanuvchilar ro'yxati, brending. */
const ADMIN_ONLY_KEYS = new Set([
  "edumanage_admin_cred_v1",
  "edumanage_mentor_users_v8",
  "edumanage_student_users_v9",
  "edumanage_branding_v1",
  "edumanage_settings_v1",
]);

/** Admin + mentor: o'quv jarayoni ma'lumotlari. */
const STAFF_KEYS = new Set([
  CRM_KV_KEY,
  "edu_shop_v1",
  "edumanage_finance_v1",
  "edumanage_tests_v1",
  "edumanage_videos_v1",
  "edumanage_cert_templates_v1",
]);

/** Talabaga ochiq prefikslar (o'z natijalari, chat, xabarnomalar, UI). */
const STUDENT_WRITABLE = [
  /^edu_purchases_v1$/,
  /^edu_mentor_coins_v1$/, // maxsus qoida bilan — pastdagi checkCoinWrite
  /^edumanage_ui_/,
  /^edu_chat_/,
  /^edumanage_chat_/,
  /^edumanage_notifications_/,
  /^edu_notif_/,
  /^edumanage_test_results_/,
  /^edu_student_/,
];

/**
 * @returns {{ok:true} | {ok:false, error:string}}
 */
export function canWriteKvKey(role, key) {
  if (role === ROLES.ADMIN) return { ok: true };

  if (ADMIN_ONLY_KEYS.has(key))
    return { ok: false, error: `"${key}" kalitini faqat administrator o'zgartira oladi` };

  if (role === ROLES.MENTOR) return { ok: true };

  if (role === ROLES.STUDENT) {
    if (STAFF_KEYS.has(key))
      return { ok: false, error: `"${key}" kalitini talaba o'zgartira olmaydi` };
    if (STUDENT_WRITABLE.some((re) => re.test(key))) return { ok: true };
    return { ok: false, error: `"${key}" kalitiga yozish uchun ruxsat yo'q` };
  }

  return { ok: false, error: "Ruxsat yo'q" };
}

export const canReadKvKey = (role, key) =>
  role === ROLES.ADMIN || role === ROLES.MENTOR || !ADMIN_ONLY_KEYS.has(key);

/** O'qishda ham hisob ma'lumotlari chiqib ketmasin. */
export function filterKvForRole(role, dataMap) {
  if (role === ROLES.ADMIN) return dataMap;
  const out = {};
  for (const [k, v] of Object.entries(dataMap || {})) if (canReadKvKey(role, k)) out[k] = v;
  return out;
}

// ─── CRM obyektining bo'limlari ───────────────────────────────────────────────

/** Talaba o'zgartira oladigan bo'limlar — faqat o'z faoliyati natijalari. */
const STUDENT_CRM_SECTIONS = new Set([
  "testResults",
  "simpleGrades",
  "chats",
  "notifications",
  "studentNotes",
]);

/** Mentor o'zgartira olmaydigan bo'limlar — moliya va hisob sozlamalari. */
const ADMIN_ONLY_CRM_SECTIONS = new Set(["finance", "certificates", "certTemplates", "settings"]);

/** Aniq solishtirish uchun yetarlicha kichikmi (element/kalit soni bo'yicha). */
function isSmall(v) {
  if (Array.isArray(v)) return v.length <= 200;
  if (v && typeof v === "object") return Object.keys(v).length <= 200;
  return true;
}

/**
 * Kelgan CRM obyektini rolga qarab "kesib" beradi: ruxsat etilmagan bo'limlar
 * SERVERDAGI nusxadan olinadi, ya'ni foydalanuvchi ularni o'zgartira olmaydi.
 *
 * @param {string} role
 * @param {object} incoming  Mijozdan kelgan obyekt
 * @param {object} current   Bazadagi joriy obyekt
 * @returns {{data:object, rejected:string[]}}
 */
export function applyCrmWritePolicy(role, incoming, current) {
  if (role === ROLES.ADMIN) return { data: incoming, rejected: [] };

  const cur = current || {};
  const out = { ...incoming };
  const rejected = [];

  const sections = new Set([...Object.keys(incoming || {}), ...Object.keys(cur)]);
  for (const key of sections) {
    if (key.startsWith("_")) continue;

    let allowed;
    if (role === ROLES.MENTOR) allowed = !ADMIN_ONLY_CRM_SECTIONS.has(key);
    else if (role === ROLES.STUDENT) allowed = STUDENT_CRM_SECTIONS.has(key);
    else allowed = false;

    if (allowed) continue;

    // ⚙️ TEZLIK: ilgari bu yerda har bir bo'lim IKKI MARTA JSON.stringify
    // qilinardi — megabaytlik `students` yoki `attendance` uchun bu juda
    // qimmat edi. Endi arzon tekshiruv: bir xil havola bo'lsa o'zgarmagan;
    // aks holda faqat KICHIK bo'limlar aniq solishtiriladi, kattalari esa
    // "o'zgargan" deb belgilanadi. Bu faqat jurnaldagi ro'yxatga ta'sir
    // qiladi — himoyaning o'zi (qiymatni serverdagisiga qaytarish)
    // baribir har doim bajariladi.
    const a = incoming?.[key];
    const b = cur[key];
    let changed;
    if (a === b) changed = false;
    else if (a === undefined || b === undefined) changed = true;
    else changed = isSmall(a) && isSmall(b) ? JSON.stringify(a) !== JSON.stringify(b) : true;

    if (key in cur) out[key] = cur[key];
    else delete out[key];
    if (changed) rejected.push(key);
  }
  return { data: out, rejected };
}

// ─── Coin balansi ─────────────────────────────────────────────────────────────

/**
 * Coin xaritasi: `s_<studentId>` — talaba, `m_<mentorName>` — mentor.
 *
 * Qoidalar:
 *   admin   — hamma narsa
 *   mentor  — talabalarning balansini o'zgartirishi va O'Z balansini faqat
 *             KAMAYTIRISHI mumkin (coin berish o'z hisobidan yechiladi)
 *   talaba  — faqat O'Z balansini va faqat KAMAYTIRA oladi (do'kondan xarid)
 *
 * @returns {{ok:true} | {ok:false, error:string}}
 */
export function checkCoinWrite(user, nextCoins, prevCoins) {
  if (!user) return { ok: false, error: "Avtorizatsiya kerak" };
  if (user.role === ROLES.ADMIN) return { ok: true };

  const prev = prevCoins && typeof prevCoins === "object" ? prevCoins : {};
  const next = nextCoins && typeof nextCoins === "object" ? nextCoins : {};
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);

  const ownKey =
    user.role === ROLES.STUDENT
      ? "s_" + user.studentId
      : user.mentorName
        ? "m_" + user.mentorName
        : null;

  for (const k of keys) {
    const before = Number(prev[k] || 0);
    const after = Number(next[k] || 0);
    if (before === after) continue;
    if (!Number.isFinite(after) || after < 0)
      return { ok: false, error: "Coin qiymati noto'g'ri" };

    if (user.role === ROLES.STUDENT) {
      if (k !== ownKey) return { ok: false, error: "Boshqa foydalanuvchining balansini o'zgartirib bo'lmaydi" };
      if (after > before) return { ok: false, error: "Balansni o'zingiz oshira olmaysiz" };
      continue;
    }

    if (user.role === ROLES.MENTOR) {
      if (k.startsWith("m_")) {
        if (k !== ownKey) return { ok: false, error: "Boshqa mentorning balansini o'zgartirib bo'lmaydi" };
        if (after > before) return { ok: false, error: "O'z balansingizni oshira olmaysiz" };
      }
      continue; // s_* — talabaga coin berish, ruxsat
    }

    return { ok: false, error: "Ruxsat yo'q" };
  }
  return { ok: true };
}

/** Xaridlar ro'yxati — talaba faqat o'ziniki uchun yozuv qo'sha oladi. */
export function checkPurchaseWrite(user, nextPurchases, prevPurchases) {
  if (!user) return { ok: false, error: "Avtorizatsiya kerak" };
  if (user.role !== ROLES.STUDENT) return { ok: true };

  const prev = Array.isArray(prevPurchases) ? prevPurchases : [];
  const next = Array.isArray(nextPurchases) ? nextPurchases : [];
  if (next.length < prev.length)
    return { ok: false, error: "Xaridlar tarixini o'chirib bo'lmaydi" };

  for (const p of next.slice(prev.length)) {
    const sid = Number(p?.studentId ?? p?.sid);
    if (Number.isFinite(sid) && sid !== Number(user.studentId))
      return { ok: false, error: "Boshqa talaba nomidan xarid qilib bo'lmaydi" };
  }
  return { ok: true };
}
