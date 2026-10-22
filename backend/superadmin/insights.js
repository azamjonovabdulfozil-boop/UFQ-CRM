/**
 * superadmin/insights.js — aqlli tavsiyalar (QOIDAVIY statistik tahlil).
 *
 * Bu AI EMAS va o'zini AI deb ko'rsatmaydi. Har bir tavsiya aniq qoida
 * asosida chiqadi va quyidagilarni o'z ichiga oladi:
 *   title    — aniqlangan holat
 *   numbers  — uni tasdiqlovchi raqamlar
 *   period   — tahlil davri
 *   reason   — xulosa chiqarish sababi (qoida)
 *   next     — tavsiya etiladigan keyingi qadam
 *
 * AI integratsiyasi uchun joy (`aiStatus`) ajratilgan: ulansa, unga faqat
 * yig'ma, anonim matn (sarlavha va raqamlar) yuboriladi — talabalarning
 * ismlari va shaxsiy ma'lumotlari tashqi xizmatga yuborilmaydi.
 */
import { pct } from "./util.js";

const fp = (v) => (v == null ? "—" : String(Math.round(v * 10) / 10).replace(/\.0$/, "") + "%");
const fn = (v) => (v == null ? "—" : String(Math.round(v * 10) / 10).replace(/\.0$/, ""));

export const aiStatus = () => ({
  available: false,
  mode: "rules",
  note:
    "Tavsiyalar haqiqiy CRM statistikasiga asoslangan qoidalar bilan hisoblanadi. AI xizmati ulanmagan. " +
    "Kelajakda ulansa, tashqi xizmatga faqat anonim yig'ma raqamlar yuboriladi.",
});

/**
 * @param {object} all   computeAll() natijasi
 * @param {object} sys   { monitor, failedLogins, serverErrors24h, thresholds }
 */
export function buildInsights(all, sys = {}) {
  const out = [];
  const per = all.range.label;
  const cmp = "oldingi davr: " + all.prevRange.label;
  const groups = all.groups.filter((g) => !g.archived);

  // 1. Davomat pasayishi / yaxshilanishi
  for (const g of groups) {
    if (g.attDelta != null && g.attDelta <= -10)
      out.push({
        level: g.attDelta <= -20 ? "alert" : "warn",
        kind: "attendance_drop",
        title: `${g.name} guruhida davomat pasaymoqda`,
        numbers: `Davomat ${fp(g.prevAtt.pct)} → ${fp(g.att.pct)} (${fn(g.attDelta)} p.p.), ${g.att.marked} ta belgi`,
        period: `${per}; ${cmp}`,
        reason: "Ikki teng davr bir xil formula (K/(K+Y+S)) bilan solishtirildi, har birida kamida 10 ta belgi bor, farq 10 p.p. dan katta.",
        next: `Mentor (${g.mentorName}) bilan kelmay qolayotgan talabalarni ko'rib chiqing, ota-onalar bilan bog'laning.`,
        link: { page: "analytics", tab: "groups", id: g.id },
      });
    else if (g.attDelta != null && g.attDelta >= 10)
      out.push({
        level: "good",
        kind: "attendance_up",
        title: `${g.name} guruhida davomat yaxshilandi`,
        numbers: `Davomat ${fp(g.prevAtt.pct)} → ${fp(g.att.pct)} (+${fn(g.attDelta)} p.p.)`,
        period: `${per}; ${cmp}`,
        reason: "Ikki teng davr solishtirildi, har birida kamida 10 ta belgi bor.",
        next: "Mentorning tajribasini boshqa guruhlar bilan ulashing.",
        link: { page: "analytics", tab: "groups", id: g.id },
      });
  }

  // 2. Rejalashtirilgan darslar ortda qolishi
  for (const g of groups) {
    const ls = g.lessons;
    if (ls.plannedPast < 3 || ls.missed < 2 || ls.marking == null || ls.marking >= 75) continue;
    out.push({
      level: ls.marking < 50 ? "alert" : "warn",
      kind: "lessons_behind",
      title: `${g.name}: ${ls.missed} ta rejadagi dars belgilanmagan`,
      numbers: `Jadval bo'yicha o'tgan ${ls.plannedPast} ta darsdan ${ls.heldPlanned} tasida davomat bor (${fp(ls.marking)})`,
      period: per,
      reason: "Dars kunlari guruh jadvalidan olinadi. Belgi yo'q — dars o'tilmagan yoki jurnal to'ldirilmagan. Chegara: 75%.",
      next: `Mentor ${g.mentorName} dan darslar o'tilganini aniqlang va davomatni to'ldirishni so'rang.`,
      link: { page: "analytics", tab: "lessons" },
    });
  }

  // 3. Darsni kechikib belgilash (lesson_marks jurnali bo'yicha)
  for (const t of all.teachers) {
    const ls = t.lessons;
    if (ls.logged < 5 || ls.onTimePct == null || ls.onTimePct >= 70) continue;
    out.push({
      level: "warn",
      kind: "late_marking",
      title: `${t.name} davomatni kechikib belgilamoqda`,
      numbers: `${ls.logged} ta darsdan ${ls.onTime} tasi o'z vaqtida (${fp(ls.onTimePct)}), o'rtacha kechikish ${fn(ls.avgLateDays)} kun`,
      period: per,
      reason: "Dars kuni yoki ertasi belgilangan dars o'z vaqtida hisoblanadi (belgilash vaqti server jurnalidan). Chegara: 70%.",
      next: "Mentorga davomatni dars paytida belgilashni eslating; kechikish sababini aniqlang.",
      link: { page: "teachers", id: t.id },
    });
  }

  // 4. O'quv natijalarining keskin o'zgarishi
  for (const g of groups) {
    if (g.gradeDelta == null) continue;
    if (g.gradeDelta <= -10)
      out.push({
        level: "warn",
        kind: "grades_drop",
        title: `${g.name} guruhida o'rtacha baho pasaydi`,
        numbers: `O'rtacha baho ${fn(g.prevAvgGrade)} → ${fn(g.avgGrade)} (${fn(g.gradeDelta)}), ${g.gradeN} ta baho`,
        period: `${per}; ${cmp}`,
        reason: "Har ikki davrda kamida 3 tadan baho bor, farq 10 balldan katta.",
        next: "Qaysi mavzularda qiyinchilik borligini mentor bilan muhokama qiling; qo'shimcha mashg'ulot rejalashtiring.",
        link: { page: "analytics", tab: "groups", id: g.id },
      });
    else if (g.gradeDelta >= 10)
      out.push({
        level: "good",
        kind: "grades_up",
        title: `${g.name} guruhida natijalar yaxshilanmoqda`,
        numbers: `O'rtacha baho ${fn(g.prevAvgGrade)} → ${fn(g.avgGrade)} (+${fn(g.gradeDelta)})`,
        period: `${per}; ${cmp}`,
        reason: "Har ikki davrda kamida 3 tadan baho bor.",
        next: "Ijobiy tajribani qayd eting.",
        link: { page: "analytics", tab: "groups", id: g.id },
      });
  }

  // 5. Faolligi keskin pasaygan talabalar (ismlar faqat shu panelda ko'rinadi)
  const drops = [];
  for (const g of groups) for (const p of g.members) if (p.attDelta != null && p.attDelta <= -30) drops.push({ g, p });
  if (drops.length)
    out.push({
      level: "warn",
      kind: "student_activity_drop",
      title: `${drops.length} ta talabaning davomati keskin tushgan`,
      numbers:
        drops.slice(0, 5).map((x) => `${x.p.name} (${x.g.name}): ${fp(x.p.prevAtt.pct)} → ${fp(x.p.att.pct)}`).join("; ") +
        (drops.length > 5 ? " …" : ""),
      period: `${per}; ${cmp}`,
      reason: "Talabaning ikki teng davrdagi davomati solishtirildi (har birida ≥ 4 ta belgi), farq 30 p.p. dan katta.",
      next: "Bu yakuniy xulosa emas — mentor talaba bilan gaplashib, sababini aniqlasin.",
      link: { page: "analytics", tab: "students" },
    });
  if (all.students.inactive.length)
    out.push({
      level: "info",
      kind: "inactive_students",
      title: `${all.students.inactive.length} ta talaba faol emas`,
      numbers: `Faolsiz/Muzlatilgan holatdagilar va davrda ≥3 marta belgilanib birorta darsga kelmaganlar`,
      period: per,
      reason: "Talaba holati va davr ichidagi davomat belgilari bo'yicha.",
      next: "Ro'yxatni ko'rib chiqing: qaytarish uchun bog'laning yoki holatini yangilang.",
      link: { page: "analytics", tab: "students" },
    });

  // 6. Ma'lumot to'liq kiritilmagan bo'limlar
  const noSched = groups.filter((g) => g.noSchedule);
  if (noSched.length)
    out.push({
      level: "info",
      kind: "data_no_schedule",
      title: `${noSched.length} ta guruhda dars kunlari kiritilmagan`,
      numbers: noSched.map((g) => g.name).slice(0, 8).join(", "),
      period: "Joriy holat",
      reason: "Dars kunlarisiz rejalashtirilgan darslar va 'o'z vaqtida' ko'rsatkichi hisoblanmaydi.",
      next: "Guruhlar bo'limida har bir guruhga dars kunlarini belgilang.",
      link: { page: "data", tab: "groups" },
    });
  const noMentor = groups.filter((g) => !g.mentorId);
  if (noMentor.length)
    out.push({
      level: "info",
      kind: "data_no_mentor",
      title: `${noMentor.length} ta guruhga mentor biriktirilmagan`,
      numbers: noMentor.map((g) => g.name).slice(0, 8).join(", "),
      period: "Joriy holat",
      reason: "Bu guruhlar o'qituvchilar reytingiga kirmaydi.",
      next: "Guruhni tahrirlab mentorni tanlang.",
      link: { page: "data", tab: "groups" },
    });
  if (all.students.noJoinDate)
    out.push({
      level: "info",
      kind: "data_no_join",
      title: `${all.students.noJoinDate} ta talabaning qo'shilgan sanasi yo'q`,
      numbers: "Bu talabalar «yangi qo'shilganlar» va o'sish grafigida hisobga olinmaydi",
      period: "Joriy holat",
      reason: "Qo'shilgan sana bo'sh yoki noto'g'ri formatda.",
      next: "Talabalar bo'limida qo'shilgan sanani to'ldiring.",
      link: { page: "data", tab: "students" },
    });
  const noGrades = groups.filter((g) => g.lessons.held >= 4 && g.size > 0 && g.gradeN === 0);
  if (noGrades.length)
    out.push({
      level: "info",
      kind: "data_no_grades",
      title: `${noGrades.length} ta guruhda davrda birorta ham baho qo'yilmagan`,
      numbers: noGrades.map((g) => `${g.name} (${g.lessons.held} dars)`).slice(0, 8).join(", "),
      period: per,
      reason: "Darslar o'tilgan, lekin baholar jurnali bo'sh — natijalar dinamikasini kuzatib bo'lmaydi.",
      next: "Mentorlarga baholash jurnalini yuritishni eslating.",
      link: { page: "teachers" },
    });
  if (all.lessons.undated)
    out.push({
      level: "info",
      kind: "data_undated",
      title: `${all.lessons.undated} ta o'tilgan darsning sanasi aniq emas`,
      numbers: "Bu darslar oy bo'yicha hisoblandi",
      period: per,
      reason: "Guruh jadvalida dars kunlari yo'q yoki belgi jadvaldagi kunlardan ortiq ustunga qo'yilgan.",
      next: "Guruh dars kunlarini to'g'rilang.",
      link: { page: "data", tab: "groups" },
    });
  out.push({
    level: "info",
    kind: "homework_missing",
    title: "Uy vazifalari bo'yicha tahlil mavjud emas",
    numbers: "CRM bazasida uy vazifalari saqlanmaydi",
    period: "Joriy holat",
    reason: all.homework.reason,
    next: "Uy vazifalari modulini qo'shish rejasi «Analitika → Uy vazifalari» bo'limida.",
    link: { page: "analytics", tab: "homework" },
  });

  // 7. Tizim va xavfsizlik
  const th = sys.thresholds || {};
  const mon = sys.monitor;
  if (mon && mon.requests) {
    const r60 = mon.requests.last60;
    const er = r60.n >= 50 ? pct(r60.err, r60.n) : null;
    if (er != null && er >= 2)
      out.push({
        level: er >= 5 ? "alert" : "warn",
        kind: "server_errors_rate",
        title: "Server xatolari odatdagidan ko'p",
        numbers: `Oxirgi 60 daqiqada ${r60.n} so'rovdan ${r60.err} tasi 5xx (${fp(er)})`,
        period: "Oxirgi 60 daqiqa",
        reason: "5xx — server ichki xatosi. 2% dan oshsa foydalanuvchilar sezadi.",
        next: "Monitoring → «Xato qaytarayotgan endpointlar» jadvalini oching.",
        link: { page: "monitoring" },
      });
  }
  if (sys.serverErrors24h != null && sys.serverErrors24h >= (th.serverErrorAlert || 5))
    out.push({
      level: "warn",
      kind: "server_errors_24h",
      title: `So'nggi 24 soatda ${sys.serverErrors24h} ta server xatosi`,
      numbers: `${sys.serverErrors24h} ta «server.error» hodisasi (chegara: ${th.serverErrorAlert || 5})`,
      period: "Oxirgi 24 soat",
      reason: "Jurnaldagi server xatolari soni (qayta ishga tushishdan keyin ham saqlanadi).",
      next: "Faoliyat tarixi → «Server xatosi» bo'yicha filtrlang.",
      link: { page: "activity", category: "Server xatosi" },
    });
  if (sys.failedLogins != null && sys.failedLogins >= (th.failedLoginAlert || 10))
    out.push({
      level: "warn",
      kind: "failed_logins",
      title: "Ko'p muvaffaqiyatsiz kirish urinishlari",
      numbers: `${sys.failedLogins} ta xato parol / noma'lum login / xato kod (chegara: ${th.failedLoginAlert || 10})`,
      period: per,
      reason: "Parol esdan chiqqan foydalanuvchilar yoki parol tanlash urinishi bo'lishi mumkin.",
      next: "Faoliyat tarixi → «Kirish xatosi» bo'yicha IP va loginlarni ko'rib chiqing.",
      link: { page: "activity", category: "Kirish xatosi" },
    });
  if (mon && mon.db && mon.db.ok && mon.db.pingMs > 500)
    out.push({
      level: "warn",
      kind: "db_slow",
      title: "Ma'lumotlar bazasi sekin javob bermoqda",
      numbers: `Ping: ${mon.db.pingMs} ms`,
      period: "Hozir",
      reason: "Odatda bir necha o'n ms bo'ladi.",
      next: "MongoDB Atlas holatini tekshiring.",
      link: { page: "monitoring" },
    });

  const order = { alert: 0, warn: 1, info: 2, good: 3 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}
