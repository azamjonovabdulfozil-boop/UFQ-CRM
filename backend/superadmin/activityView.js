/**
 * superadmin/activityView.js — faoliyat tarixini ODDIY TILGA o'giradi.
 *
 * Jurnalda (security_audit) texnik yozuvlar turadi: "data.change",
 * "Talabalar ~1 (phone)" va h.k. Super Admin esa "kim, qachon, nima qildi"
 * ni darhol tushunishi kerak:
 *
 *   «Aziz Karimov (Mentor) — FD-1 guruhida davomat belgiladi:
 *    oktabr, 12-dars — 8 keldi, 2 kelmadi»
 *
 * Bu modul faqat KO'RSATISH uchun: jurnalning o'ziga tegmaydi.
 */
import { parseUA } from "../webanalytics/core.js";

export const ROLE_TEXT = {
  superadmin: "Super Admin",
  admin: "Admin",
  mentor: "Mentor",
  student: "Talaba",
  system: "Tizim",
};

/** Faoliyat tarixida ko'rsatiladigan rollar (Super Admin talabi: admin va mentorlar). */
export const STAFF_ROLES = ["admin", "mentor"];

const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];

// Yozuv turlari: [birlik, qaratqich (…ni), ko'plik]
const ENT = {
  students: ["talaba", "talabani", "talabalar"],
  groups: ["guruh", "guruhni", "guruhlar"],
  mentors: ["mentor", "mentorni", "mentorlar"],
  courses: ["kurs", "kursni", "kurslar"],
  finance: ["to'lov yozuvi", "to'lov yozuvini", "to'lov yozuvlari"],
  tests: ["test", "testni", "testlar"],
  certificates: ["sertifikat", "sertifikatni", "sertifikatlar"],
};

// O'zgargan maydon nomlari — odam tushunadigan so'zlar bilan
const FIELD = {
  name: "ism", fullName: "ism", firstName: "ism", lastName: "familiya", phone: "telefon", phone2: "qo'shimcha telefon",
  parentPhone: "ota-ona telefoni", parentName: "ota-ona ismi", email: "e-pochta", address: "manzil", birthDate: "tug'ilgan sana",
  birth: "tug'ilgan sana", passport: "pasport", groupId: "guruh", group: "guruh", groupIds: "guruhlar", course: "kurs",
  courseId: "kurs", status: "holat", price: "narx", amount: "summa", sum: "summa", paid: "to'lov", payment: "to'lov",
  payments: "to'lovlar", balance: "balans", debt: "qarz", isDebtor: "qarzdorlik", discount: "chegirma", mentorId: "mentor",
  mentor: "mentor", mentorName: "mentor", days: "dars kunlari", time: "dars vaqti", startTime: "dars vaqti",
  endTime: "tugash vaqti", room: "xona", startDate: "boshlanish sanasi", endDate: "tugash sanasi", joinDate: "qo'shilgan sana",
  duration: "davomiylik", note: "izoh", notes: "izoh", comment: "izoh", salary: "oylik", login: "login", photo: "rasm",
  avatar: "rasm", archived: "arxiv", level: "daraja", coins: "coin", title: "nomi", desc: "tavsif", description: "tavsif",
  questions: "savollar", date: "sana", type: "turi", category: "toifa", method: "to'lov usuli", lessons: "darslar",
};
const fieldText = (k) => FIELD[k] || null;

const SETTING_TEXT = {
  edumanage_branding_v1: "CRM nomi va logotipi",
  edumanage_settings_v1: "umumiy sozlamalar",
  edu_shop_v1: "Coin Shop mahsulotlari",
  edumanage_cert_templates_v1: "sertifikat shablonlari",
};
const MODULE_TEXT = {
  dashboard: "Dashboard", courses: "Kurslar", groups: "Guruhlar", mentors: "Mentorlar", students: "Talabalar",
  debtors: "Qarzdorlar", "admin-ai": "AI Yordamchi", methodology: "Metodologiya", certificates: "Sertifikatlar",
  finance: "Moliya", "coin-shop": "Coin Shop",
};
const REPORT_FMT = { csv: "CSV", xlsx: "Excel", pdf: "PDF" };

const list = (arr, n = 3) => {
  const names = arr.map((x) => x && String(x.name || "").split(" — ")[0]).filter(Boolean);
  if (!names.length) return "";
  const head = names.slice(0, n).join(", ");
  return names.length > n ? `${head} va yana ${names.length - n} ta` : head;
};

/**
 * CRM'dan nomlarni topish uchun yordamchi: guruh va talaba id → nom.
 * @param {object} D crm_data hujjati
 */
export function crmLookups(D) {
  const groups = new Map();
  const students = new Map();
  for (const g of Array.isArray(D?.groups) ? D.groups : []) if (g && g.id != null) groups.set(String(g.id), String(g.name || ""));
  for (const s of Array.isArray(D?.students) ? D.students : [])
    if (s && s.id != null) students.set(String(s.id), String(s.name || "").split(" — ")[0]);
  return { groups, students };
}

/** CRM o'zgarishini gaplarga aylantiradi. */
function describeDataChange(meta, L) {
  const lines = [];
  const sec = (meta && meta.sections) || {};
  for (const [k, w] of Object.entries(ENT)) {
    const s = sec[k];
    if (!s) continue;
    const [one, acc, many] = w;
    const [nAdd, nDel, nChg] = s.counts || [s.added?.length || 0, s.removed?.length || 0, s.changed?.length || 0];
    if (nAdd) lines.push(`Yangi ${nAdd > 1 ? many : one} qo'shdi${nAdd > 1 ? ` (${nAdd} ta)` : ""}: ${list(s.added || []) || "—"}`);
    if (nDel) lines.push(`${cap(nDel > 1 ? many : acc)} o'chirdi${nDel > 1 ? ` (${nDel} ta)` : ""}: ${list(s.removed || []) || "—"}`);
    if (nChg) {
      const f = (s.changedFields || []).map(fieldText).filter(Boolean);
      const uniq = [...new Set(f)];
      lines.push(
        `${cap(one)} ma'lumotini o'zgartirdi${nChg > 1 ? ` (${nChg} ta)` : ""}: ${list(s.changed || []) || "—"}` +
          (uniq.length ? ` — ${uniq.slice(0, 5).join(", ")}` : ""),
      );
    }
  }
  if (sec.attendance) {
    const items = Array.isArray(sec.attendance.lessons) ? sec.attendance.lessons : [];
    if (items.length) {
      for (const it of items.slice(0, 6)) {
        const gname = L.groups.get(String(it.groupId)) || `#${it.groupId}`;
        const when = `${MONTHS[(Number(it.month) || 1) - 1] || ""}, ${it.lesson}-dars`;
        const m = it.marks || {};
        const bits = [];
        if (m.K) bits.push(`${m.K} keldi`);
        if (m.Y) bits.push(`${m.Y} kelmadi`);
        if (m.S) bits.push(`${m.S} sababli`);
        lines.push(`${gname} guruhida davomat belgiladi: ${when}${bits.length ? " — " + bits.join(", ") : ""}`);
      }
      if (items.length > 6) lines.push(`… va yana ${items.length - 6} ta darsda davomat`);
    } else {
      // Eski yozuvlar: faqat qaysi guruh ekani ma'lum
      const gids = [...new Set((meta.ids || []).filter((x) => String(x).startsWith("groups:")).map((x) => String(x).slice(7)))];
      const names = gids.map((g) => L.groups.get(g) || `#${g}`);
      lines.push(`Davomat belgiladi${names.length ? ": " + names.slice(0, 4).join(", ") + " guruhi" : ""}`);
    }
  }
  if (sec.simpleGrades) {
    const ids = Array.isArray(sec.simpleGrades.students) ? sec.simpleGrades.students : [];
    const names = ids.map((id) => L.students.get(String(id))).filter(Boolean);
    const n = sec.simpleGrades.changedItems || ids.length;
    lines.push(`Baho qo'ydi: ${names.length ? list(names.map((name) => ({ name })), 4) : n + " ta talabaga"}`);
  }
  if (sec.grades) lines.push(`Mezonli baholarni kiritdi (${sec.grades.changedItems} ta yozuv)`);
  if (sec.gradingCriteria) lines.push("Baholash mezonlarini o'zgartirdi");
  if (sec.testResults) lines.push(`Test natijalari yangilandi (${sec.testResults.changedItems} ta)`);
  if (!lines.length && meta && meta.summary) lines.push("Ma'lumotlarni o'zgartirdi: " + meta.summary);
  return lines;
}

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * Hodisa → { title, details[] } (oddiy o'zbek tilida).
 * @param {object} e   security_audit hujjati
 * @param {object} ctx { lookups, nameOf(username) }
 */
export function describeEvent(e, ctx) {
  const m = e.meta || {};
  const t = e.target || {};
  const who = (u) => (u ? ctx.nameOf(u) : "");
  switch (e.event) {
    case "auth.login.success":
      return { title: "Tizimga kirdi", details: [] };
    case "auth.logout":
      return { title: "Tizimdan chiqdi", details: [] };
    case "auth.login.failed":
      return {
        title: m.locked ? "Parolni ko'p marta xato kiritdi — hisob vaqtincha bloklandi" : "Kirishda parolni xato kiritdi",
        details: m.attempt ? [`${m.attempt}-urinish`] : [],
      };
    case "auth.login.locked":
    case "auth.login.disabled":
      return { title: "Bloklangan hisob bilan kirmoqchi bo'ldi", details: [] };
    case "auth.login.device_blocked":
      return { title: "Bloklangan qurilmadan kirmoqchi bo'ldi", details: [] };
    case "auth.login.unknown_user":
      return { title: "Mavjud bo'lmagan login bilan kirmoqchi bo'ldi", details: m.username ? [`Login: ${m.username}`] : [] };
    case "auth.login.otp_failed":
      return { title: "Tasdiqlash kodini xato kiritdi", details: [] };
    case "auth.session.reuse_detected":
      return { title: "Eski sessiya qayta ishlatildi — xavfsizlik ogohlantirishi", details: ["Boshqa qurilmada eski kirish ishlatilgan bo'lishi mumkin"] };
    case "auth.password.changed":
      return { title: "O'z parolini o'zgartirdi", details: [] };
    case "auth.password.reset_completed":
      return { title: "Parolini havola orqali yangiladi", details: [] };
    case "auth.username.changed":
      return { title: "O'z loginini o'zgartirdi", details: m.to ? [`Yangi login: ${m.to}`] : [] };
    case "auth.revoke_all":
      return { title: "Barcha qurilmalardan chiqdi", details: [] };
    case "data.change":
      {
        const lines = describeDataChange(m, ctx.lookups);
        return { title: lines[0] || "Ma'lumotlarni o'zgartirdi", details: lines.slice(1) };
      }
    case "data.write.partial_denied":
    case "kv.crm.partial_denied":
    case "module.write_denied":
      return { title: "Ruxsati yo'q bo'limdagi ma'lumotni o'zgartirmoqchi bo'ldi — rad etildi", details: [] };
    case "kv.write.denied":
    case "kv.bulk.denied":
      return { title: "Ruxsati yo'q sozlamani o'zgartirmoqchi bo'ldi — rad etildi", details: [] };
    case "authz.denied":
      return { title: "Ruxsati yo'q bo'limga kirmoqchi bo'ldi — rad etildi", details: [] };
    case "authz.super_denied":
      return { title: "Super Admin bo'limiga kirmoqchi bo'ldi — rad etildi", details: [] };
    case "authz.super_target_denied":
      return { title: "Super Admin hisobini o'zgartirmoqchi bo'ldi — rad etildi", details: [] };
    case "module.api_denied":
      return { title: `O'chirilgan bo'limni ochmoqchi bo'ldi: ${MODULE_TEXT[m.module] || m.module || ""}`, details: [] };
    case "settings.change":
      return { title: `Sozlamani o'zgartirdi: ${SETTING_TEXT[m.setting] || m.setting || ""}`, details: [] };
    case "admin.accounts.sync":
      return { title: "Mentor/talabalarning login-parollarini saqlab yangiladi", details: [] };
    case "admin.accounts.remove":
      return { title: "Mentor/talaba loginini o'chirdi", details: t.username ? [`Login: ${t.username}`] : [] };
    case "admin.accounts.rename":
      return { title: "Mentor/talaba loginini almashtirdi", details: [] };
    case "admin.account.upsert":
      return { title: `Login yaratdi yoki yangiladi${t.username ? ": " + t.username : ""}`, details: [] };
    case "admin.account.status":
      return { title: `Hisob holatini o'zgartirdi${t.username ? ": " + t.username : ""}`, details: [] };
    case "admin.account.delete":
      return { title: `Hisobni o'chirdi${t.username ? ": " + t.username : ""}`, details: [] };
    case "admin.device.unblock":
      return { title: "Bloklangan qurilmani blokdan chiqardi", details: [] };
    case "notify.sms":
      return { title: "SMS xabar yubordi", details: [] };
    case "blob.delete":
      return { title: "Faylni o'chirdi", details: [] };
    case "report.export":
      return { title: `Hisobot yuklab oldi: ${m.report || ""}${m.format ? " (" + (REPORT_FMT[m.format] || m.format) + ")" : ""}`, details: [] };
    case "super.admin.create":
      return { title: `Yangi administrator qo'shdi: ${who(t.username) || t.username || ""}`, details: [] };
    case "super.admin.delete":
      return { title: `Administratorni o'chirdi: ${t.name || t.username || ""}`, details: t.username ? [`Login: ${t.username}`] : [] };
    case "super.admin.status":
      return {
        title: `${t.status === "disabled" ? "Administratorni blokladi" : "Administratorni faollashtirdi"}: ${who(t.username) || t.username || ""}`,
        details: [],
      };
    case "super.admin.profile":
      return { title: `Administrator ism-familiyasini o'zgartirdi: ${t.name || t.username || ""}`, details: [] };
    case "super.admin.restrictions":
      return { title: `Administrator ruxsatlarini o'zgartirdi: ${who(t.username) || t.username || ""}`, details: [] };
    case "super.admin.reset_link":
      return { title: `Parol tiklash havolasini yaratdi: ${who(t.username) || t.username || ""}`, details: [] };
    case "super.admin.password_set":
      return { title: `Administrator parolini almashtirdi: ${who(t.username) || t.username || ""}`, details: [] };
    case "super.admin.sessions_revoked":
      return { title: `Administratorni qurilmalardan chiqarib yubordi: ${who(t.username) || t.username || ""}`, details: [] };
    case "super.modules.update":
      return { title: "Menyu bo'limlarini yoqdi/o'chirdi", details: [] };
    case "super.settings.update":
      if (m.section === "attendance")
        return {
          title: `Davomat qoidasini o'zgartirdi: sababli dars uchun pul ${m.value && m.value.chargeExcused === false ? "yechilmaydi" : "yechiladi"}`,
          details: [],
        };
      return { title: "Tizim sozlamalarini o'zgartirdi", details: [] };
    case "super.branding.update":
      return { title: "CRM nomi yoki logotipini o'zgartirdi", details: [] };
    case "server.start":
      return { title: "Server ishga tushdi", details: [] };
    case "server.error":
      return { title: "Serverda xatolik yuz berdi", details: m.message ? [String(m.message).slice(0, 160)] : [] };
    default:
      return { title: ctx.fallback ? ctx.fallback(e) : e.event, details: [] };
  }
}

/** Qurilma: "Telefon · Chrome · Android" */
export function deviceText(ua) {
  if (!ua) return "";
  const p = parseUA(ua);
  return [p.device, p.browser !== "Boshqa" ? p.browser : "", p.os !== "Boshqa" ? p.os : ""].filter(Boolean).join(" · ");
}

/** Hodisa turi: rang va belgi uchun. */
export function kindOf(event) {
  const e = String(event || "");
  if (e === "auth.login.success") return "login";
  if (e === "auth.logout" || e === "auth.revoke_all") return "logout";
  if (/failed|denied|locked|disabled|blocked|unknown_user|reuse_detected|otp_failed/.test(e)) return "warn";
  if (e === "data.change" || e.startsWith("super.data.")) return "data";
  return "action";
}
