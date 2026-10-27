/**
 * superadmin/settings.js — tizim sozlamalari va modullarni boshqarish.
 *
 * Hammasi `system_settings` kolleksiyasida (bitta hujjat — bitta bo'lim):
 *   modules       — oddiy admin panelidagi bo'limlar: menyuda ko'rinishi va
 *                   API (ma'lumot) ga kirish huquqi ALOHIDA boshqariladi
 *   general       — vaqt mintaqasi
 *   notifications — Telegram/SMS xabarnomalarini yoqish/o'chirish,
 *                   xavfsizlik ogohlantirishi chegaralari
 *   ranking       — o'qituvchilar reytingi mezonlari va og'irliklari
 *
 * Muhim qoidalar:
 *   • Modulni o'chirish ma'lumotni O'CHIRMAYDI — faqat kirishni yopadi.
 *   • Cheklovlar faqat ODDIY adminga ta'sir qiladi. Super Admin, mentor va
 *     talaba ishlashiga tegmaydi — Super Admin o'zini bloklab qo'ya olmaydi.
 *   • "Sozlamalar" bo'limini o'chirib bo'lmaydi.
 */
import { DEFAULT_TZ, isValidTz } from "./util.js";

export const SETTINGS_COL = "system_settings";

/**
 * Oddiy admin panelidagi bo'limlar.
 *   nav        — chap menyudagi tugma id si (frontend)
 *   tabs       — go() orqali ochiladigan bo'lim nomlari
 *   write      — CRM obyektidagi bo'limlar: API yopilsa yozish rad etiladi
 *   read       — API yopilsa o'qishda ham olib tashlanadigan bo'limlar
 *                (faqat boshqa modullar ishlatmaydigan bo'limlar)
 *   endpoints  — API yopilsa admin uchun 403 qaytaradigan manzillar
 */
export const MODULES = [
  { key: "dashboard", label: "Dashboard", nav: "nav-dashboard", tabs: ["dashboard"], write: [], read: [], endpoints: [] },
  { key: "courses", label: "Kurslar", nav: "nav-courses", tabs: ["courses"], write: ["courses"], read: [], endpoints: [] },
  {
    key: "groups",
    label: "Guruhlar va darslar (davomat)",
    nav: "nav-groups",
    tabs: ["groups"],
    write: ["groups", "attendance"],
    read: [],
    endpoints: [{ prefix: "/api/telegram/attendance" }],
  },
  { key: "mentors", label: "Mentorlar", nav: "nav-mentors", tabs: ["mentors"], write: ["mentors"], read: [], endpoints: [] },
  { key: "students", label: "Talabalar", nav: "nav-students", tabs: ["students"], write: ["students"], read: [], endpoints: [] },
  {
    key: "debtors",
    label: "Qarzdorlar",
    nav: "nav-debtors",
    tabs: ["debtors"],
    write: [],
    read: [],
    endpoints: [{ prefix: "/api/notify/" }, { prefix: "/api/debtor-bot/" }],
  },
  {
    key: "admin-ai",
    label: "AI Yordamchi",
    nav: "nav-admin-ai",
    tabs: ["admin-ai"],
    write: [],
    read: [],
    endpoints: [{ prefix: "/api/ai-chat" }, { prefix: "/api/ai/" }, { prefix: "/api/ai-tts" }],
  },
  {
    key: "methodology",
    label: "Metodologiya",
    nav: "nav-methodology",
    tabs: ["methodology"],
    write: [],
    read: [],
    endpoints: [{ prefix: "/api/methodology" }],
  },
  {
    key: "certificates",
    label: "Sertifikatlar",
    nav: "nav-certificates",
    tabs: ["certificates"],
    write: ["certificates", "certTemplates"],
    read: ["certificates", "certTemplates"],
    endpoints: [],
  },
  { key: "finance", label: "Moliya", nav: "nav-finance", tabs: ["finance"], write: ["finance"], read: ["finance"], endpoints: [] },
  {
    key: "coin-shop",
    label: "Coin Shop",
    nav: "nav-coin-shop",
    tabs: ["coin-shop"],
    write: [],
    read: [],
    endpoints: [{ prefix: "/api/coins", methods: ["POST"] }],
    kvKeys: ["edu_shop_v1"],
  },
];
const MODULE_KEYS = new Set(MODULES.map((m) => m.key));

const DEFAULTS = {
  modules: Object.fromEntries(MODULES.map((m) => [m.key, { menu: true, api: true }])),
  general: { timezone: DEFAULT_TZ },
  // Davomat va to'lov: «S» (sababli) belgisi qo'yilgan dars uchun talabadan
  // pul yechilsinmi. true — yechiladi (avvalgi xatti-harakat), false — yechilmaydi.
  attendance: { chargeExcused: true },
  // Sozlamalar → «Menyu bo'limlari» kartasi har bir rol uchun ochiq/yopiq.
  // false bo'lsa o'sha rol sozlamalarida bu bo'lim umuman chiqmaydi.
  settingsMenu: { admin: true, mentor: true, student: true },
  notifications: {
    telegramAttendance: true, // davomat hisoboti ota-onalar guruhiga
    debtorMessages: true, // qarzdorlarga Telegram/SMS xabar
    failedLoginAlert: 10, // davrda shuncha xato kirishdan keyin ogohlantirish
    serverErrorAlert: 5, // 24 soatda shuncha server xatosidan keyin
  },
  ranking: {
    weights: { attendance: 30, marking: 20, ontime: 10, trend: 20, grading: 10, stability: 10 },
    minMarks: 10, // reytingga kirish uchun minimal davomat belgilari
    minMarksHigh: 30, // "ishonchli" daraja uchun
  },
};

let cache = null;
let cacheAt = 0;
let _getDb = null;
export function initSettings(getDb) {
  _getDb = getDb;
}

function merge(base, over) {
  if (!over || typeof over !== "object") return structuredClone(base);
  const out = structuredClone(base);
  for (const k of Object.keys(base)) {
    if (over[k] == null) continue;
    if (base[k] && typeof base[k] === "object" && !Array.isArray(base[k])) out[k] = merge(base[k], over[k]);
    else out[k] = over[k];
  }
  return out;
}

/** Barcha sozlamalar (10 soniya keshlanadi, yozuvda darhol yangilanadi). */
export async function getSettings() {
  if (cache && Date.now() - cacheAt < 10_000) return cache;
  const out = structuredClone(DEFAULTS);
  try {
    const docs = await _getDb()
      .collection(SETTINGS_COL)
      .find({ _id: { $in: ["modules", "general", "notifications", "ranking", "settingsMenu", "attendance"] } })
      .toArray();
    for (const d of docs) out[d._id] = merge(DEFAULTS[d._id], d.value);
  } catch (e) {
    // Baza yo'q — sukut qiymatlari (hamma narsa ochiq) qaytadi
  }
  cache = out;
  cacheAt = Date.now();
  return out;
}

export const timezoneNow = async () => (await getSettings()).general.timezone || DEFAULT_TZ;

function validate(section, value) {
  const v = value && typeof value === "object" ? value : {};
  if (section === "modules") {
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      if (!MODULE_KEYS.has(k)) continue;
      const api = x?.api !== false;
      // API yopiq bo'lsa menyuda ko'rsatishning ma'nosi yo'q
      out[k] = { menu: x?.menu !== false && api, api };
    }
    return { ok: true, value: merge(DEFAULTS.modules, out) };
  }
  if (section === "settingsMenu") {
    return {
      ok: true,
      value: { admin: v.admin !== false, mentor: v.mentor !== false, student: v.student !== false },
    };
  }
  if (section === "attendance") {
    return { ok: true, value: { chargeExcused: v.chargeExcused !== false } };
  }
  if (section === "general") {
    const tz = String(v.timezone || DEFAULT_TZ);
    if (!isValidTz(tz)) return { ok: false, error: "Vaqt mintaqasi noto'g'ri" };
    return { ok: true, value: { timezone: tz } };
  }
  if (section === "notifications") {
    const n = (x, lo, hi, d) => (Number.isFinite(Number(x)) ? Math.min(hi, Math.max(lo, Math.round(Number(x)))) : d);
    return {
      ok: true,
      value: {
        telegramAttendance: v.telegramAttendance !== false,
        debtorMessages: v.debtorMessages !== false,
        failedLoginAlert: n(v.failedLoginAlert, 1, 1000, DEFAULTS.notifications.failedLoginAlert),
        serverErrorAlert: n(v.serverErrorAlert, 1, 1000, DEFAULTS.notifications.serverErrorAlert),
      },
    };
  }
  if (section === "ranking") {
    const w = {};
    for (const k of Object.keys(DEFAULTS.ranking.weights)) {
      const x = Number(v.weights?.[k]);
      w[k] = Number.isFinite(x) ? Math.min(100, Math.max(0, Math.round(x))) : DEFAULTS.ranking.weights[k];
    }
    if (!Object.values(w).some((x) => x > 0)) return { ok: false, error: "Kamida bitta mezonning og'irligi 0 dan katta bo'lsin" };
    const minMarks = Math.min(500, Math.max(1, Math.round(Number(v.minMarks) || DEFAULTS.ranking.minMarks)));
    const minMarksHigh = Math.min(2000, Math.max(minMarks, Math.round(Number(v.minMarksHigh) || DEFAULTS.ranking.minMarksHigh)));
    return { ok: true, value: { weights: w, minMarks, minMarksHigh } };
  }
  return { ok: false, error: "Noma'lum bo'lim" };
}

export async function saveSettings(section, value, actor) {
  const r = validate(section, value);
  if (!r.ok) return r;
  await _getDb()
    .collection(SETTINGS_COL)
    .updateOne(
      { _id: section },
      { $set: { value: r.value, updatedAt: new Date(), updatedBy: actor?.username || null } },
      { upsert: true },
    );
  cache = null;
  return { ok: true, value: r.value };
}

export const defaultSettings = () => structuredClone(DEFAULTS);

// ─── Samarali (amaldagi) cheklovlar ───────────────────────────────────────────

/**
 * Foydalanuvchi uchun modullar holati.
 * Faqat ODDIY admin cheklanadi; global sozlama + shu adminga berilgan
 * shaxsiy cheklov (Administratorlar → Ruxsatlar) birlashtiriladi.
 */
export async function effectiveModules(user) {
  const all = Object.fromEntries(MODULES.map((m) => [m.key, { menu: true, api: true }]));
  if (!user || user.isSuper || user.role !== "admin") return all;
  const s = await getSettings();
  const own = (user.adminRestrictions && user.adminRestrictions.modules) || {};
  for (const m of MODULES) {
    const g = s.modules[m.key] || { menu: true, api: true };
    const o = own[m.key] || {};
    const api = g.api !== false && o.api !== false;
    all[m.key] = { menu: api && g.menu !== false && o.menu !== false, api };
  }
  return all;
}

/** Foydalanuvchi roli uchun Sozlamalar → «Menyu bo'limlari» ochiqmi. Super Admin uchun har doim ochiq. */
export async function settingsMenuAllowed(user) {
  if (!user || user.isSuper) return true;
  const s = await getSettings();
  const key = user.role === "mentor" ? "mentor" : user.role === "student" ? "student" : "admin";
  return s.settingsMenu?.[key] !== false;
}

/** CRM bo'limlari bo'yicha cheklov: { readBlocked:Set, writeBlocked:Set, modules:[...] } */
export async function sectionPolicy(user) {
  const out = { readBlocked: new Set(), writeBlocked: new Set(), kvBlocked: new Set(), modules: [] };
  if (!user || user.isSuper || user.role !== "admin") return out;
  const eff = await effectiveModules(user);
  for (const m of MODULES) {
    if (eff[m.key].api) continue;
    out.modules.push(m.key);
    m.write.forEach((x) => out.writeBlocked.add(x));
    m.read.forEach((x) => out.readBlocked.add(x));
    (m.kvKeys || []).forEach((x) => out.kvBlocked.add(x));
  }
  return out;
}

/** CRM obyektidan o'qish taqiqlangan bo'limlarni olib tashlaydi. */
export function stripSections(data, blocked) {
  if (!blocked || !blocked.size || !data || typeof data !== "object") return data;
  const out = { ...data };
  for (const k of blocked) delete out[k];
  return out;
}

/** Yozish taqiqlangan bo'limlarni serverdagi nusxadan tiklaydi. */
export function protectSections(incoming, prev, blocked) {
  const rejected = [];
  if (!blocked || !blocked.size || !incoming || typeof incoming !== "object") return { data: incoming, rejected };
  const out = { ...incoming };
  for (const k of blocked) {
    if (!(k in out)) continue;
    const before = prev && k in prev ? prev[k] : undefined;
    if (JSON.stringify(out[k]) !== JSON.stringify(before)) rejected.push(k);
    if (before === undefined) delete out[k];
    else out[k] = before;
  }
  return { data: out, rejected };
}

/**
 * API darajasidagi himoya: o'chirilgan modulning endpointlariga oddiy admin
 * so'rov yuborsa 403. `resolveUser` — security/middleware.js dagi funksiya.
 */
export function createModuleApiGuard({ resolveUser, audit }) {
  const watched = MODULES.flatMap((m) => m.endpoints.map((e) => ({ ...e, key: m.key, label: m.label })));
  return async function moduleApiGuard(req, res, next) {
    if (!req.path.startsWith("/api/")) return next();
    const hit = watched.find((e) => req.path.startsWith(e.prefix) && (!e.methods || e.methods.includes(req.method)));
    if (!hit) return next();
    try {
      const r = await resolveUser(req);
      if (!r.ok || r.user.role !== "admin" || r.user.isSuper) return next();
      const eff = await effectiveModules(r.user);
      if (eff[hit.key] && eff[hit.key].api) return next();
      audit("module.api_denied", { req, actor: r.user, meta: { module: hit.key }, severity: "warn" });
      return res.status(403).json({
        ok: false,
        code: "module-disabled",
        error: `«${hit.label}» bo'limi Super Admin tomonidan o'chirilgan`,
      });
    } catch {
      return next();
    }
  };
}
