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
// Coin balansi va xaridlar talabaga yopiq: xarid faqat /api/shop/buy orqali
// (server balansni tekshirib, coin yechib, xaridni bitta amalda yozadi).
const STUDENT_WRITABLE = [
  /^edumanage_ui_/,
  /^edu_chat_/,
  /^edumanage_chat_/,
  /^edumanage_notifications_/,
  /^edu_notif_/,
  /^edu_student_/,
];

/**
 * Talabaning FAQAT o'ziga tegishli kalitlari (oxirida o'z ID'si):
 *   presence_student_<id>      — "onlayn" belgisi (har 20 s da yoziladi)
 *   mchat_<mentor>_<id>        — mentor bilan yozishmasi
 * Boshqa talabaning ID'si bilan yozib bo'lmaydi.
 */
function isOwnStudentKey(key, user) {
  const id = user && user.studentId != null ? String(user.studentId) : "";
  if (!id) return false;
  if (key === "presence_student_" + id) return true;
  const m = /^mchat_(?!list_)[A-Za-z0-9+/_-]+_(\d+)$/.exec(key);
  return !!m && m[1] === id;
}

/**
 * @returns {{ok:true} | {ok:false, error:string}}
 */
/**
 * `admin_private_` bilan boshlanadigan kalitlar — faqat adminniki (masalan
 * admin AI yordamchisining suhbatlari: ularda talabalar tahlili bor). Ularni
 * mentor ham, talaba ham o'qiy olmaydi va yoza olmaydi.
 */
export const isAdminPrivateKey = (key) => /^admin_private_/.test(String(key || ""));

export function canWriteKvKey(role, key, user) {
  if (role === ROLES.ADMIN) return { ok: true };

  if (isAdminPrivateKey(key))
    return { ok: false, error: `"${key}" kaliti faqat administratorniki` };

  if (ADMIN_ONLY_KEYS.has(key))
    return { ok: false, error: `"${key}" kalitini faqat administrator o'zgartira oladi` };

  if (role === ROLES.MENTOR) return { ok: true };

  if (role === ROLES.STUDENT) {
    if (STAFF_KEYS.has(key))
      return { ok: false, error: `"${key}" kalitini talaba o'zgartira olmaydi` };
    if (STUDENT_WRITABLE.some((re) => re.test(key))) return { ok: true };
    if (isOwnStudentKey(key, user)) return { ok: true };
    return { ok: false, error: `"${key}" kalitiga yozish uchun ruxsat yo'q` };
  }

  return { ok: false, error: "Ruxsat yo'q" };
}

export const canReadKvKey = (role, key) =>
  role === ROLES.ADMIN ||
  (!isAdminPrivateKey(key) && (role === ROLES.MENTOR || !ADMIN_ONLY_KEYS.has(key)));

/** O'qishda ham hisob ma'lumotlari chiqib ketmasin. */
export function filterKvForRole(role, dataMap) {
  if (role === ROLES.ADMIN) return dataMap;
  const out = {};
  for (const [k, v] of Object.entries(dataMap || {})) if (canReadKvKey(role, k)) out[k] = v;
  return out;
}

// ─── CRM obyektining bo'limlari ───────────────────────────────────────────────

/**
 * Talaba o'zgartira oladigan bo'limlar.
 * testResults — faqat /api/tests/submit orqali (ball serverda hisoblanadi);
 * simpleGrades — mentor qo'yadigan baholar, talaba ularga tegolmaydi.
 */
const STUDENT_CRM_SECTIONS = new Set([
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
 *   mentor  — faqat o'z kalitlari (m_<ism>, mg_<ism>_<guruh>) va talabalar
 *             (s_*) o'zgaradi, JAMI coin esa OSHMAYDI: talabaga berilgan coin
 *             mentorning o'z balansidan yechiladi, qaytarib olingani qaytadi
 *   talaba  — hech narsa (xarid /api/shop/buy orqali, serverda)
 *
 * @returns {{ok:true} | {ok:false, error:string}}
 */
export function checkCoinWrite(user, nextCoins, prevCoins) {
  if (!user) return { ok: false, error: "Avtorizatsiya kerak" };
  if (user.role === ROLES.ADMIN) return { ok: true };

  const prev = prevCoins && typeof prevCoins === "object" ? prevCoins : {};
  const next = nextCoins && typeof nextCoins === "object" ? nextCoins : {};
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);

  let netDelta = 0;

  for (const k of keys) {
    const before = Number(prev[k] || 0);
    const after = Number(next[k] || 0);
    if (before === after) continue;
    if (!Number.isFinite(after) || after < 0)
      return { ok: false, error: "Coin qiymati noto'g'ri" };

    if (user.role === ROLES.STUDENT)
      return { ok: false, error: "Coin faqat do'kon orqali sarflanadi" };

    if (user.role === ROLES.MENTOR) {
      const name = user.mentorName || "";
      const own = name && (k === "m_" + name || (k.startsWith("mg_" + name + "_") && /^\d+$/.test(k.slice(("mg_" + name + "_").length))));
      if (!own && !k.startsWith("s_"))
        return { ok: false, error: "Boshqa mentorning balansini o'zgartirib bo'lmaydi" };
      netDelta += after - before;
      continue;
    }

    return { ok: false, error: "Ruxsat yo'q" };
  }
  // Mentor coin yarata olmaydi: talabaga berilgani o'z balansidan yechilishi shart
  if (user.role === ROLES.MENTOR && netDelta > 0)
    return { ok: false, error: "Coin faqat o'z balansingizdan beriladi — balans yetarli emas yoki ma'lumot eskirgan, sahifani yangilang" };
  return { ok: true };
}

/** Xaridlar ro'yxati — talaba faqat o'ziniki uchun yozuv qo'sha oladi. */
export function checkPurchaseWrite(user, nextPurchases, prevPurchases) {
  if (!user) return { ok: false, error: "Avtorizatsiya kerak" };
  if (user.role === ROLES.ADMIN) return { ok: true };
  // Xaridni tasdiqlash/rad etish (coin qaytarish) — faqat admin; talaba
  // xaridni /api/shop/buy orqali qiladi
  if (JSON.stringify(nextPurchases || []) !== JSON.stringify(prevPurchases || []))
    return { ok: false, error: "Xaridlarni faqat administrator o'zgartira oladi" };
  return { ok: true };
}
