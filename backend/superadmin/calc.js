/**
 * superadmin/calc.js — CRM analitikasi (server tomonida hisoblanadi).
 *
 * Hech qanday taxminiy yoki to'qima raqam yo'q. Ma'lumot yetarli bo'lmasa
 * qiymat `null` bo'ladi va interfeysda "Ma'lumot yetarli emas" deb
 * ko'rsatiladi — nol bilan almashtirilmaydi.
 *
 * Manbalar (crm_data kolleksiyasi, `_type: "main"`):
 *   attendance    att_<guruh>_<yil>_<oy(0-11)> → s<talaba> → l1..l12 = K/Y/S
 *   groups        days (Du..Sh), startDate, mentorId, status
 *   students      groupId, status, joinDate
 *   simpleGrades  talaba → [{id, score(0–100), date, mentorName}]
 *   testResults   test → talaba → {score(%), completedAt}
 *   lesson_marks  dars birinchi marta qachon belgilangani (yangi jurnal)
 *
 * Formulalar:
 *   Davomat %        = K / (K + Y + S) × 100 (S — sababli, lekin qatnashmagan)
 *   O'tilgan dars    = kamida bitta talabaga davomat belgilangan dars
 *   Rejadagi dars    = guruh jadvalidagi kun (guruh boshlangan, arxivda emas)
 *   O'z vaqtida      = dars kuni yoki ertasi kuni belgilangan (lesson_marks)
 *   Uy vazifalari    = CRM'da modul yo'q → null + izoh
 */
import {
  addDays,
  avg,
  dayOf,
  delta,
  diffDays,
  fmtDay,
  inRange,
  monthsBetween,
  pct,
  round1,
  weekStart,
  weekdayOf,
  ymd,
} from "./util.js";

export const LESSON_COUNT = 12;
const DAYMAP = { Ya: 0, Du: 1, Se: 2, Ch: 3, Pa: 4, Ju: 5, Sh: 6 };
const ACTIVE_STUDENT = new Set(["Aktiv", "Probatsiya", "", undefined, null]);
const isArchivedGroup = (g) => g && (g.status === "Arxiv" || g.status === "Man etilgan");

export const HOMEWORK_INFO = {
  available: false,
  title: "Uy vazifalari moduli mavjud emas",
  reason:
    "CRM bazasida uy vazifalari saqlanmaydi: topshiriq berilishi, muddati, topshirilgan vaqti va tekshirilgan vaqti yozilmaydi. Shu sababli bu ko'rsatkichlar hisoblanmaydi (nol deb ko'rsatilmaydi).",
  plan: [
    "Yangi `homework` kolleksiyasi: {id, groupId, mentorId, title, givenAt, dueAt}",
    "Topshiriqlar `homework_submissions`: {homeworkId, studentId, submittedAt, checkedAt, score}",
    "Mentor paneliga «Uy vazifasi berish» va «Tekshirish» oynalari; talaba paneliga «Topshirish»",
    "Indekslar: {groupId, givenAt}, {homeworkId, studentId} (unique)",
    "Shundan so'ng: berilgan / bajarilgan / kechikkan / tekshirilmagan soni va tekshirish tezligi (checkedAt − submittedAt) avtomatik hisoblanadi",
  ],
};

// ─── Asosiy tuzilma ───────────────────────────────────────────────────────────

/** Guruh jadvali bo'yicha oyning dars kunlari (davomat jadvalidagi bilan bir xil). */
function scheduleDays(g, y, m) {
  const days = ((g && g.days) || []).map((d) => DAYMAP[d]).filter((x) => x != null);
  if (!days.length) return null;
  const out = [];
  const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  for (let d = 1; d <= dim && out.length < LESSON_COUNT; d++)
    if (days.includes(weekdayOf(ymd(y, m, d)))) out.push(d);
  return out;
}

/**
 * CRM ma'lumotidan indekslar quradi — bir so'rov ichida qayta ishlatiladi.
 * @param {object} D        crm_data hujjati
 * @param {Map}    marksLog lesson_marks: "gid_y_m_l" → {firstMarkedAt}
 */
export function buildContext(D, marksLog, tz, today) {
  const data = D || {};
  const students = Array.isArray(data.students) ? data.students : [];
  const groups = Array.isArray(data.groups) ? data.groups : [];
  const mentors = Array.isArray(data.mentors) ? data.mentors : [];
  const courses = Array.isArray(data.courses) ? data.courses : [];
  const tests = Array.isArray(data.tests) ? data.tests : [];
  const studentById = new Map(students.map((s) => [String(s.id), s]));
  const groupById = new Map(groups.map((g) => [String(g.id), g]));
  const mentorById = new Map(mentors.map((m) => [String(m.id), m]));
  const mentorOfGroup = (g) =>
    !g
      ? null
      : (g.mentorId != null && mentorById.get(String(g.mentorId))) || mentors.find((m) => m.name && m.name === g.mentor) || null;

  // Baholar — id bo'yicha takrorlanmaydi
  const grades = [];
  const seen = new Set();
  const sg = data.simpleGrades && typeof data.simpleGrades === "object" ? data.simpleGrades : {};
  for (const sid of Object.keys(sg)) {
    for (const g of Array.isArray(sg[sid]) ? sg[sid] : []) {
      const score = Number(g && g.score);
      if (!g || !isFinite(score)) continue;
      const key = sid + "|" + (g.id || g.date + "|" + score);
      if (seen.has(key)) continue;
      seen.add(key);
      grades.push({ sid: String(sid), score, day: dayOf(g.date, tz), mentor: g.mentorName || "" });
    }
  }
  // Test natijalari — har talaba har testda bitta natija (obyekt kaliti)
  const testResults = [];
  const tr = data.testResults && typeof data.testResults === "object" ? data.testResults : {};
  for (const tid of Object.keys(tr)) {
    const t = tests.find((x) => String(x.id) === String(tid));
    for (const sid of Object.keys(tr[tid] || {})) {
      const x = tr[tid][sid];
      if (!x || x.score == null || !isFinite(Number(x.score))) continue;
      testResults.push({
        tid: String(tid),
        sid: String(sid),
        score: Number(x.score),
        day: dayOf(x.completedAt || x.date || x.submittedAt, tz),
        title: t ? t.title : "Test",
      });
    }
  }
  return {
    D: data, tz, today, students, groups, mentors, courses, tests,
    studentById, groupById, mentorById, mentorOfGroup,
    grades, testResults, marksLog: marksLog || new Map(),
  };
}

/**
 * Davrdagi darslar.
 * Har dars: {gid, y, m, l, day, undated, planned, past, held, marks:{sid:v}, K, Y, S, onTime}
 */
export function lessonsIn(ctx, r) {
  const out = [];
  const att = ctx.D.attendance && typeof ctx.D.attendance === "object" ? ctx.D.attendance : {};
  for (const g of ctx.groups) {
    const start = dayOf(g.startDate, ctx.tz);
    const archived = isArchivedGroup(g);
    for (const [y, m] of monthsBetween(r.from, r.to)) {
      const sheet = att["att_" + g.id + "_" + y + "_" + m] || {};
      const days = scheduleDays(g, y, m);
      for (let l = 1; l <= LESSON_COUNT; l++) {
        const marks = {};
        let K = 0, Y = 0, S = 0;
        for (const sk of Object.keys(sheet)) {
          const v = sheet[sk] && sheet[sk]["l" + l];
          if (v === "K" || v === "Y" || v === "S") {
            marks[sk.replace(/^s/, "")] = v;
            if (v === "K") K++;
            else if (v === "Y") Y++;
            else S++;
          }
        }
        const held = K + Y + S > 0;
        let day = null, undated = false;
        if (days && days[l - 1] != null) day = ymd(y, m, days[l - 1]);
        else {
          if (!held) continue;
          undated = true;
        }
        if (day && !inRange(day, r)) continue;
        const planned = !!day && !archived && (!start || day >= start);
        if (!planned && !held) continue;
        const log = ctx.marksLog.get(`${g.id}_${y}_${m}_${l}`);
        const markedDay = log ? dayOf(log.firstMarkedAt, ctx.tz) : null;
        out.push({
          gid: String(g.id), y, m, l, day, undated, planned,
          past: !!day && day <= ctx.today,
          held, marks, K, Y, S,
          markedDay,
          onTime: day && markedDay ? markedDay <= addDays(day, 1) : null,
          lateDays: day && markedDay ? Math.max(0, diffDays(day, markedDay)) : null,
        });
      }
    }
  }
  return out;
}

export function attAgg(lessons, filterSid) {
  let K = 0, Y = 0, S = 0;
  for (const ls of lessons)
    for (const sid of Object.keys(ls.marks)) {
      if (filterSid && !filterSid(sid)) continue;
      const v = ls.marks[sid];
      if (v === "K") K++;
      else if (v === "Y") Y++;
      else S++;
    }
  const marked = K + Y + S;
  return { K, Y, S, marked, pct: pct(K, marked) };
}

function lessonAgg(L) {
  const plannedPast = L.filter((x) => x.planned && x.past);
  const heldPlanned = plannedPast.filter((x) => x.held);
  const logged = L.filter((x) => x.held && x.onTime != null);
  return {
    plannedPast: plannedPast.length,
    plannedFuture: L.filter((x) => x.planned && !x.past).length,
    held: L.filter((x) => x.held).length,
    heldPlanned: heldPlanned.length,
    missed: plannedPast.length - heldPlanned.length,
    undated: L.filter((x) => x.held && x.undated).length,
    marking: plannedPast.length ? pct(heldPlanned.length, plannedPast.length) : null,
    logged: logged.length,
    onTime: logged.filter((x) => x.onTime).length,
    onTimePct: logged.length ? pct(logged.filter((x) => x.onTime).length, logged.length) : null,
    avgLateDays: logged.length ? avg(logged.map((x) => x.lateDays)) : null,
  };
}

// ─── Guruhlar ─────────────────────────────────────────────────────────────────

function groupStats(g, ctx, P) {
  const gid = String(g.id);
  const members = ctx.students.filter((s) => String(s.groupId) === gid);
  const memberIds = new Set(members.map((s) => String(s.id)));
  const L = P.L.filter((x) => x.gid === gid);
  const PL = P.PL.filter((x) => x.gid === gid);
  const a = attAgg(L), pa = attAgg(PL);
  const G = P.G.filter((x) => memberIds.has(x.sid));
  const PG = P.PG.filter((x) => memberIds.has(x.sid));
  const T = P.T.filter((x) => memberIds.has(x.sid));
  const la = lessonAgg(L);
  const per = members.map((s) => {
    const sid = String(s.id);
    const sa = attAgg(L, (x) => x === sid);
    const spa = attAgg(PL, (x) => x === sid);
    const sgr = G.filter((x) => x.sid === sid).map((x) => x.score);
    const spg = PG.filter((x) => x.sid === sid).map((x) => x.score);
    const st = T.filter((x) => x.sid === sid).map((x) => x.score);
    const ag = avg(sgr);
    const reasons = [];
    if (sa.marked >= 4 && sa.pct < 60) reasons.push("davomat " + sa.pct + "%");
    if (sgr.length >= 2 && ag < 60) reasons.push("o'rtacha baho " + ag);
    const gd = sgr.length >= 2 && spg.length >= 2 ? delta(ag, avg(spg)) : null;
    if (gd != null && gd <= -15) reasons.push("baho " + gd + " ga tushgan");
    const ad = sa.marked >= 4 && spa.marked >= 4 ? delta(sa.pct, spa.pct) : null;
    if (ad != null && ad <= -30) reasons.push("davomat " + ad + " p.p. tushgan");
    return {
      id: sid, name: s.name || "—", status: s.status || "Aktiv",
      att: sa, prevAtt: spa, attDelta: ad,
      avgGrade: ag, gradeN: sgr.length, gradeDelta: gd,
      avgTest: avg(st), testN: st.length, reasons,
    };
  });
  const mentor = ctx.mentorOfGroup(g);
  const avgG = avg(G.map((x) => x.score)), prevG = avg(PG.map((x) => x.score));
  return {
    id: gid, name: g.name || "Guruh", course: g.course || "",
    mentorId: mentor ? String(mentor.id) : null, mentorName: mentor ? mentor.name : g.mentor || "—",
    status: g.status || "", archived: isArchivedGroup(g), days: g.days || [], noSchedule: !(g.days || []).length,
    size: members.length,
    activeSize: members.filter((s) => ACTIVE_STUDENT.has(s.status)).length,
    att: a, prevAtt: pa, attDelta: a.marked >= 10 && pa.marked >= 10 ? delta(a.pct, pa.pct) : null,
    avgGrade: avgG, gradeN: G.length, prevAvgGrade: prevG, prevGradeN: PG.length,
    gradeDelta: G.length >= 3 && PG.length >= 3 ? delta(avgG, prevG) : null,
    avgTest: avg(T.map((x) => x.score)), testN: T.length,
    lessons: la,
    members: per,
    top: per.filter((x) => x.att.marked >= 3).sort((a1, b1) => (b1.att.pct || 0) - (a1.att.pct || 0) || (b1.avgGrade || 0) - (a1.avgGrade || 0)).slice(0, 3),
    needHelp: per.filter((x) => x.reasons.length),
  };
}

// ─── O'qituvchilar reytingi ───────────────────────────────────────────────────

export const CRITERIA = [
  { key: "attendance", label: "Talabalar davomati", unit: "%", formula: "K / (K+Y+S) — mentor guruhlaridagi davrdagi barcha belgilar" },
  { key: "marking", label: "Rejadagi darslar o'tilishi", unit: "%", formula: "Jadval bo'yicha o'tgan darslardan davomat belgilanganlari ulushi" },
  { key: "ontime", label: "Darsni o'z vaqtida belgilash", unit: "%", formula: "Dars kuni yoki ertasi belgilangan darslar ulushi (lesson_marks jurnali, kamida 3 dars)" },
  { key: "trend", label: "Natijalar o'zgarishi", unit: "ball", formula: "Talabalar o'rtacha bahosi: shu davr − oldingi teng davr; 50 = o'zgarishsiz, ±20 ball = 0/100" },
  { key: "grading", label: "Baholash faolligi", unit: "baho/talaba", formula: "Davrda bir talabaga qo'yilgan baholar, eng faol mentorga nisbatan %" },
  { key: "stability", label: "Barqarorlik", unit: "%", formula: "Rejadagi darsi bor haftalardan nechtasida davomat belgilangan" },
];

function teacherStats(m, groupList, ctx, P) {
  const mine = groupList.filter((x) => x.mentorId && x.mentorId === String(m.id));
  const active = mine.filter((x) => !x.archived);
  const gids = new Set(mine.map((x) => x.id));
  const L = P.L.filter((x) => gids.has(x.gid));
  const PL = P.PL.filter((x) => gids.has(x.gid));
  const a = attAgg(L), pa = attAgg(PL);
  const la = lessonAgg(L);
  const memberIds = new Set();
  mine.forEach((x) => x.members.forEach((p) => memberIds.add(p.id)));
  const activeIds = new Set();
  active.forEach((x) => x.members.forEach((p) => activeIds.add(p.id)));
  const G = P.G.filter((x) => memberIds.has(x.sid));
  const PG = P.PG.filter((x) => memberIds.has(x.sid));
  const givenByMe = P.G.filter((x) => x.mentor && x.mentor === m.name).length;
  const plannedPast = L.filter((x) => x.planned && x.past);
  const wPlan = new Set(plannedPast.map((x) => weekStart(x.day)));
  const wHeld = new Set(plannedPast.filter((x) => x.held).map((x) => weekStart(x.day)));
  const gNow = avg(G.map((x) => x.score)), gPrev = avg(PG.map((x) => x.score));
  const trend = G.length >= 3 && PG.length >= 3 ? delta(gNow, gPrev) : null;
  const students = activeIds.size;
  return {
    id: String(m.id), name: m.name || "Mentor", subject: m.subject || "",
    groups: mine.map((x) => ({ id: x.id, name: x.name, archived: x.archived, size: x.size })),
    groupCount: mine.length, activeGroups: active.length, students,
    lessons: la,
    att: a, prevAtt: pa, attDelta: a.marked >= 10 && pa.marked >= 10 ? delta(a.pct, pa.pct) : null,
    avgGrade: gNow, prevAvgGrade: gPrev, gradeN: G.length, trend,
    avgTest: avg(P.T.filter((x) => memberIds.has(x.sid)).map((x) => x.score)),
    gradesGiven: givenByMe,
    gradesPerStudent: students ? round1(givenByMe / students) : null,
    weeksPlanned: wPlan.size, weeksHeld: wHeld.size,
    metrics: {
      attendance: a.pct,
      marking: la.plannedPast >= 3 ? la.marking : null,
      ontime: la.logged >= 3 ? la.onTimePct : null,
      trend: trend == null ? null : Math.max(0, Math.min(100, round1(50 + trend * 2.5))),
      grading: null,
      stability: wPlan.size >= 2 ? pct(wHeld.size, wPlan.size) : null,
    },
    sample: a.marked,
  };
}

/**
 * Umumiy ball = mavjud mezonlar bo'yicha og'irlikli o'rtacha (0–100).
 * Mezon hisoblanmasa — tashlab ketiladi va og'irlik qolganlariga taqsimlanadi.
 * Ishonchlilik: high — ≥ minMarksHigh belgi va ≥ 3 mezon; low — ≥ minMarks
 * belgi va ≥ 2 mezon; none — reytingga kiritilmaydi (ball = null).
 */
export function rankTeachers(list, ranking) {
  const w = ranking.weights;
  const gp = list.map((t) => t.gradesPerStudent).filter((v) => v != null && v > 0);
  const maxGp = gp.length ? Math.max(...gp) : 0;
  for (const t of list) {
    if (t.metrics.attendance != null && t.sample < ranking.minMarks) t.metrics.attendance = null;
    t.metrics.grading = maxGp > 0 && t.students > 0 ? round1(((t.gradesPerStudent || 0) / maxGp) * 100) : null;
    let wSum = 0, sum = 0, used = 0;
    const parts = [];
    for (const c of CRITERIA) {
      const v = t.metrics[c.key];
      const wt = Number(w[c.key]) || 0;
      if (v == null || wt <= 0) continue;
      wSum += wt;
      sum += v * wt;
      used++;
      parts.push({ key: c.key, value: v, weight: wt });
    }
    t.criteriaUsed = used;
    t.parts = parts.map((p) => ({ ...p, share: round1((p.weight / wSum) * 100) }));
    t.score = wSum > 0 ? round1(sum / wSum) : null;
    t.confidence =
      t.sample >= ranking.minMarksHigh && used >= 3 ? "high" : t.sample >= ranking.minMarks && used >= 2 ? "low" : "none";
    if (t.confidence === "none") t.score = null;
  }
  const ranked = list.filter((t) => t.score != null).sort((a, b) => b.score - a.score);
  ranked.forEach((t, i) => (t.rank = i + 1));
  return list;
}

// ─── Hammasi bitta joyda ──────────────────────────────────────────────────────

export function computeAll(ctx, r, pr, ranking) {
  const L = lessonsIn(ctx, r);
  const PL = lessonsIn(ctx, pr);
  const G = ctx.grades.filter((g) => inRange(g.day, r));
  const PG = ctx.grades.filter((g) => inRange(g.day, pr));
  const T = ctx.testResults.filter((t) => inRange(t.day, r));
  const PT = ctx.testResults.filter((t) => inRange(t.day, pr));
  const P = { L, PL, G, PG, T, PT };

  const statusCount = {};
  for (const s of ctx.students) {
    const k = s.status || "Aktiv";
    statusCount[k] = (statusCount[k] || 0) + 1;
  }
  const activeStudents = ctx.students.filter((s) => ACTIVE_STUDENT.has(s.status));
  const joinDay = (s) => dayOf(s.joinDate, ctx.tz);
  const newStudents = ctx.students.filter((s) => inRange(joinDay(s), r));
  const prevNewStudents = ctx.students.filter((s) => inRange(joinDay(s), pr));
  const perStudentAtt = {};
  for (const ls of L)
    for (const sid of Object.keys(ls.marks)) {
      const x = perStudentAtt[sid] || (perStudentAtt[sid] = { K: 0, n: 0 });
      x.n++;
      if (ls.marks[sid] === "K") x.K++;
    }
  // "Faolligi pasaygan": holati Faolsiz/Muzlatilgan YOKI aktiv bo'lsa-yu
  // davrda kamida 3 marta belgilanib, birorta ham kelmagan
  const inactive = ctx.students.filter((s) => {
    if (s.status === "Faolsiz" || s.status === "Muzlatilgan") return true;
    const x = perStudentAtt[String(s.id)];
    return ACTIVE_STUDENT.has(s.status) && x && x.n >= 3 && x.K === 0;
  });

  const groups = ctx.groups.map((g) => groupStats(g, ctx, P));
  const teachers = rankTeachers(ctx.mentors.map((m) => teacherStats(m, groups, ctx, P)), ranking);

  return {
    range: r, prevRange: pr, P,
    students: {
      total: ctx.students.length,
      active: activeStudents.length,
      statusCount,
      newInPeriod: newStudents.length,
      newPrev: prevNewStudents.length,
      newToday: ctx.students.filter((s) => joinDay(s) === ctx.today).length,
      inactive: inactive.map((s) => ({ id: String(s.id), name: s.name, status: s.status || "Aktiv", groupId: s.groupId })),
      noJoinDate: ctx.students.filter((s) => !joinDay(s)).length,
    },
    lessons: lessonAgg(L),
    prevLessons: lessonAgg(PL),
    att: attAgg(L),
    prevAtt: attAgg(PL),
    grades: { n: G.length, avg: avg(G.map((g) => g.score)), prevN: PG.length, prevAvg: avg(PG.map((g) => g.score)) },
    tests: { n: T.length, avg: avg(T.map((t) => t.score)), prevN: PT.length, prevAvg: avg(PT.map((t) => t.score)) },
    groups,
    teachers,
    homework: HOMEWORK_INFO,
  };
}

// ─── Vaqt qatorlari (grafiklar) ───────────────────────────────────────────────

/** Davrni kun / hafta / oy bo'laklariga ajratadi (≤ 31 → kun, ≤ 120 → hafta). */
export function buckets(r) {
  const out = [];
  if (r.days <= 31) {
    for (let d = r.from; d <= r.to; d = addDays(d, 1)) out.push({ key: d, from: d, to: d, label: fmtDay(d).replace(/ \d{4}$/, "") });
  } else if (r.days <= 120) {
    let d = weekStart(r.from);
    while (d <= r.to) {
      const e = addDays(d, 6);
      out.push({ key: d, from: d < r.from ? r.from : d, to: e > r.to ? r.to : e, label: fmtDay(d < r.from ? r.from : d).replace(/ \d{4}$/, "") });
      d = addDays(d, 7);
    }
  } else {
    for (const [y, m] of monthsBetween(r.from, r.to)) {
      const f = ymd(y, m, 1);
      const e = ymd(y, m, new Date(Date.UTC(y, m + 1, 0)).getUTCDate());
      out.push({ key: f, from: f < r.from ? r.from : f, to: e > r.to ? r.to : e, label: f.slice(0, 7) });
    }
  }
  return out;
}

export function series(ctx, all) {
  const B = buckets(all.range);
  const { L, G, T } = all.P;
  return B.map((b) => {
    const inB = (d) => !!d && d >= b.from && d <= b.to;
    const Lb = L.filter((x) => inB(x.day));
    const a = attAgg(Lb);
    const g = G.filter((x) => inB(x.day)).map((x) => x.score);
    const t = T.filter((x) => inB(x.day)).map((x) => x.score);
    return {
      label: b.label,
      from: b.from,
      to: b.to,
      attendance: a.pct,
      marks: a.marked,
      held: Lb.filter((x) => x.held).length,
      planned: Lb.filter((x) => x.planned).length,
      newStudents: ctx.students.filter((s) => inB(dayOf(s.joinDate, ctx.tz))).length,
      avgGrade: avg(g),
      grades: g.length,
      avgTest: avg(t),
    };
  });
}

/** Talabalar sonining o'sishi: har bo'lak oxirida qo'shilgan sanasi bo'yicha jami. */
export function studentGrowth(ctx, r) {
  const B = buckets(r);
  const joins = ctx.students.map((s) => dayOf(s.joinDate, ctx.tz));
  const unknown = joins.filter((d) => !d).length;
  return {
    unknownJoinDate: unknown,
    points: B.map((b) => ({ label: b.label, to: b.to, total: joins.filter((d) => d && d <= b.to).length })),
  };
}

/** Bitta talabaning oylik dinamikasi (oxirgi `months` oy). */
export function studentDynamics(ctx, sid, months = 6) {
  const s = ctx.studentById.get(String(sid));
  if (!s) return null;
  const out = [];
  const t = ctx.today;
  let y = +t.slice(0, 4), m = +t.slice(5, 7) - 1;
  const list = [];
  for (let i = 0; i < months; i++) {
    list.unshift([y, m]);
    m--;
    if (m < 0) { m = 11; y--; }
  }
  const att = ctx.D.attendance || {};
  for (const [yy, mm] of list) {
    const row = (att["att_" + s.groupId + "_" + yy + "_" + mm] || {})["s" + s.id] || {};
    let K = 0, Y = 0, S = 0;
    for (let l = 1; l <= LESSON_COUNT; l++) {
      const v = row["l" + l];
      if (v === "K") K++;
      else if (v === "Y") Y++;
      else if (v === "S") S++;
    }
    const prefix = `${yy}-${String(mm + 1).padStart(2, "0")}`;
    const g = ctx.grades.filter((x) => x.sid === String(s.id) && x.day && x.day.startsWith(prefix)).map((x) => x.score);
    const tr = ctx.testResults.filter((x) => x.sid === String(s.id) && x.day && x.day.startsWith(prefix)).map((x) => x.score);
    out.push({ month: prefix, K, Y, S, attendance: pct(K, K + Y + S), avgGrade: avg(g), grades: g.length, avgTest: avg(tr), tests: tr.length });
  }
  const withAtt = out.filter((x) => x.attendance != null);
  const withG = out.filter((x) => x.avgGrade != null);
  return {
    months: out,
    trend: {
      attendance: withAtt.length >= 2 ? delta(withAtt[withAtt.length - 1].attendance, withAtt[0].attendance) : null,
      grade: withG.length >= 2 ? delta(withG[withG.length - 1].avgGrade, withG[0].avgGrade) : null,
    },
  };
}
