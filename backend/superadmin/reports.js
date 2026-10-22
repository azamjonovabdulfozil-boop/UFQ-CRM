/**
 * superadmin/reports.js — hisobotlarni yig'ish (ustunlar + qatorlar).
 * Har bir hisobotda davr, manba va hisoblash usuli ko'rsatiladi.
 */
import { CRITERIA, HOMEWORK_INFO } from "./calc.js";
import { fmtDay } from "./util.js";

export const REPORTS = {
  overview: "Umumiy CRM hisoboti",
  teachers: "O'qituvchilar samaradorligi",
  groups: "Sinflar (guruhlar) natijalari",
  attendance: "Davomat",
  homework: "Uy vazifalari",
  students: "O'quvchilar natijalari",
  admins: "Administratorlar faoliyati",
  system: "Tizim monitoringi",
};

const CONF = { high: "ishonchli", low: "taxminiy", none: "ma'lumot yetarli emas" };
const SRC_CRM = "CRM bazasi (crm_data): talabalar, guruhlar, davomat jurnali, baholar, test natijalari";

/**
 * @param {string} kind
 * @param {object} p  { all, filters:{group, teacher}, ranking, extra:{activity, monitor, accounts} }
 */
export function buildReport(kind, p) {
  const { all, filters = {}, ranking } = p;
  const rep = { title: REPORTS[kind], period: all ? all.range.label : "", source: SRC_CRM, method: "", columns: [], rows: [] };
  let groups = all ? all.groups : [];
  if (filters.group) groups = groups.filter((g) => g.id === String(filters.group));
  if (filters.teacher) groups = groups.filter((g) => g.mentorId === String(filters.teacher));
  const f = [];
  if (filters.group) f.push("guruh: " + ((all.groups.find((g) => g.id === String(filters.group)) || {}).name || filters.group));
  if (filters.teacher) f.push("o'qituvchi: " + ((all.teachers.find((t) => t.id === String(filters.teacher)) || {}).name || filters.teacher));
  rep.filters = f.join(", ");

  if (kind === "teachers") {
    let ts = all.teachers;
    if (filters.teacher) ts = ts.filter((t) => t.id === String(filters.teacher));
    rep.columns = [
      "O'rin", "O'qituvchi", "Umumiy ball", "Ishonchlilik", "Faol guruh", "Talaba", "O'tilgan dars", "Rejadagi (o'tgan)",
      "Rejadagi darslar o'tilishi %", "O'z vaqtida belgilash %", "Davomat %", "Davomat o'zgarishi (p.p.)",
      "O'rtacha baho", "Baho o'zgarishi", "Qo'ygan baholari", "Barqarorlik %",
    ];
    rep.rows = ts
      .slice()
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
      .map((t) => [
        t.rank || null, t.name, t.score, CONF[t.confidence], t.activeGroups, t.students, t.lessons.held, t.lessons.plannedPast,
        t.metrics.marking, t.metrics.ontime, t.att.marked ? t.att.pct : null, t.attDelta,
        t.avgGrade, t.trend, t.gradesGiven, t.metrics.stability,
      ]);
    rep.method =
      "Ball = mezonlarning og'irlikli o'rtachasi (" +
      CRITERIA.map((c) => `${c.label} ${ranking.weights[c.key] || 0}`).join(", ") +
      "). Hisoblanmagan mezon tashlab ketiladi. Reyting tahlil uchun — kadrlar bo'yicha qaror avtomatik qabul qilinmaydi.";
  } else if (kind === "groups") {
    rep.columns = [
      "Guruh", "Kurs", "O'qituvchi", "Talaba", "Davomat %", "Davomat o'zgarishi (p.p.)", "O'rtacha baho", "Baho o'zgarishi",
      "Baholar soni", "Test o'rtacha %", "O'tilgan dars", "Rejadagi (o'tgan)", "Belgilanmagan dars", "Yordam kerak (talaba)",
    ];
    rep.rows = groups.map((g) => [
      g.name, g.course, g.mentorName, g.size, g.att.marked ? g.att.pct : null, g.attDelta, g.avgGrade, g.gradeDelta,
      g.gradeN, g.avgTest, g.lessons.held, g.lessons.plannedPast, g.lessons.missed, g.needHelp.length,
    ]);
    rep.method = `O'zgarish — oldingi teng davrga (${all.prevRange.label}) nisbatan. Davomat = K/(K+Y+S).`;
  } else if (kind === "attendance") {
    rep.columns = ["Talaba", "Guruh", "O'qituvchi", "Keldi (K)", "Kelmadi (Y)", "Sababli (S)", "Davomat %", "Oldingi davr %"];
    for (const g of groups)
      for (const m of g.members)
        rep.rows.push([m.name, g.name, g.mentorName, m.att.K, m.att.Y, m.att.S, m.att.pct, m.prevAtt.pct]);
    rep.method = "Davomat = K / (K + Y + S) × 100 — davr ichidagi darslar bo'yicha (dars sanasi guruh jadvalidan).";
  } else if (kind === "students") {
    rep.columns = ["Talaba", "Guruh", "Holat", "Baholar soni", "O'rtacha baho", "Baho o'zgarishi", "Testlar soni", "Test o'rtacha %", "Davomat %", "E'tibor sababi"];
    for (const g of groups)
      for (const m of g.members)
        rep.rows.push([m.name, g.name, m.status, m.gradeN, m.avgGrade, m.gradeDelta, m.testN, m.avgTest, m.att.pct, m.reasons.join("; ")]);
    rep.method = "Baholar — baholash jurnali (0–100), testlar — davr ichida topshirilgan natijalar (%). O'zgarish — oldingi teng davrga nisbatan.";
  } else if (kind === "homework") {
    rep.columns = ["Holat", "Izoh"];
    rep.rows = [["Mavjud emas", HOMEWORK_INFO.reason], ...HOMEWORK_INFO.plan.map((x, i) => [`Reja ${i + 1}`, x])];
    rep.method = "Hisoblanmadi — CRM'da uy vazifalari ma'lumoti saqlanmaydi.";
  } else if (kind === "admins") {
    const ev = (p.extra && p.extra.activity) || [];
    rep.source = "Xavfsizlik jurnali (security_audit) — administratorlar va Super Admin amallari";
    rep.columns = ["Vaqt", "Foydalanuvchi", "Rol", "Hodisa", "Toifa", "Tavsif", "Natija", "IP"];
    rep.rows = ev.map((e) => [e.atText, e.actor, e.role, e.event, e.category, e.text, e.severity === "info" ? "muvaffaqiyatli" : e.severity, e.ip]);
    rep.method = "Davr ichidagi jurnal yozuvlari, eng yangisi birinchi. Parol, token va maxfiy maydonlar jurnalga yozilmaydi.";
  } else if (kind === "system") {
    const m = p.extra && p.extra.monitor;
    rep.source = "Server xotirasidagi so'rov hisoblagichlari va xavfsizlik jurnali";
    rep.period = m ? `Holat: ${m.nowText} (so'rovlar hisobi ${m.sinceText} dan beri)` : "—";
    rep.columns = ["Ko'rsatkich", "Qiymat"];
    rep.rows = m ? m.rows : [];
    rep.method = "So'rov hisoblagichlari server qayta ishga tushganda nollanadi; server xatolari — jurnaldan. Hosting bermaydigan CPU/disk ko'rsatkichlari kiritilmagan.";
  } else {
    rep.columns = ["Ko'rsatkich", "Shu davr", "Oldingi davr", "Formula"];
    const s = all.students;
    rep.rows = [
      ["Jami talabalar", s.total, null, "barcha yozuvlar (joriy holat)"],
      ["Aktiv talabalar", s.active, null, "holati Aktiv yoki Probatsiya"],
      ["Yangi talabalar", s.newInPeriod, s.newPrev, "qo'shilgan sana davr ichida"],
      ["Faol bo'lmagan talabalar", s.inactive.length, null, "Faolsiz/Muzlatilgan yoki ≥3 belgida 0% davomat"],
      ["O'qituvchilar", all.teachers.length, null, "mentorlar ro'yxati"],
      ["Faol guruhlar", all.groups.filter((g) => !g.archived).length, null, "arxivda emas"],
      ["O'tilgan darslar", all.lessons.held, all.prevLessons.held, "kamida bitta davomat belgisi bor"],
      ["Rejadagi darslar (o'tgan)", all.lessons.plannedPast, all.prevLessons.plannedPast, "guruh jadvali bo'yicha"],
      ["Belgilanmagan darslar", all.lessons.missed, all.prevLessons.missed, "sanasi o'tgan, belgi yo'q"],
      ["Davomat %", all.att.pct, all.prevAtt.pct, "K/(K+Y+S)"],
      ["O'rtacha baho", all.grades.avg, all.grades.prevAvg, "baholar jurnali o'rtachasi"],
      ["Test o'rtacha %", all.tests.avg, all.tests.prevAvg, "test natijalari o'rtachasi"],
      ["Uy vazifalari", "mavjud emas", null, "CRM'da modul yo'q"],
    ];
    rep.method = `Oldingi davr: ${all.prevRange.label}. Bo'sh katak — ma'lumot yetarli emas.`;
  }
  return rep;
}

export const reportFileName = (kind, ext) =>
  `${kind}_hisobot_${new Date().toISOString().slice(0, 10)}.${ext}`;

export { fmtDay };
