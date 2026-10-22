// ===================== SUPER ADMIN: ANALITIKA MARKAZI =====================
// Faqat admin panelida yuklanadi. Barcha ko'rsatkichlar mavjud CRM
// yozuvlaridan (D) va serverdagi jurnal/monitoringdan HISOBLANADI — hech
// qanday taxminiy yoki to'qima raqam yo'q. Ma'lumot yetarli bo'lmasa
// "Ma'lumot yetarli emas" deb ko'rsatiladi, nol bilan almashtirilmaydi.
//
// Manbalar:
//   D.attendance   att_<guruh>_<yil>_<oy> → s<talaba> → l1..l12 = K/Y/S
//   D.groups       days (Du..Sh), startDate, mentorId, status
//   D.simpleGrades talaba → [{id, score, date, mentorName}]
//   D.testResults  test → talaba → {score, completedAt}
//   /api/admin/activity, /api/admin/monitor, /api/admin/analytics/accounts
//
// Uy vazifalari: CRM'da bunday modul YO'Q — bo'limlarda shunday deb yoziladi.
(function () {
  "use strict";

  // ───────────────────────── yordamchilar ─────────────────────────
  const DAY = 86400000;
  const LC = () => (typeof LESSON_COUNT === "number" ? LESSON_COUNT : 12);
  const esc = (v) =>
    String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const ic = (n, o) => (typeof window.IC === "function" ? window.IC(n, o) : "");
  const MONTHS = ["yan", "fev", "mar", "apr", "may", "iyun", "iyul", "avg", "sen", "okt", "noy", "dek"];
  const sod = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const eod = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
  const ymd = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const fmtD = (d) => (d ? d.getDate() + "-" + MONTHS[d.getMonth()] + " " + d.getFullYear() : "—");
  const fmtDT = (v) => {
    const d = v instanceof Date ? v : new Date(v);
    if (isNaN(d)) return "—";
    return d.getDate() + "-" + MONTHS[d.getMonth()] + ", " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  };
  /** "2026-10-22", ISO yoki Date → Date (mahalliy vaqt). Noto'g'ri bo'lsa null. */
  function parseDate(v) {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    const s = String(v);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }
  const inR = (d, r) => !!d && d >= r.from && d <= r.to;
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
  const avg = (arr) => (arr.length ? Math.round((arr.reduce((s, x) => s + x, 0) / arr.length) * 10) / 10 : null);
  const fmtP = (v) => (v == null ? "—" : (Math.round(v * 10) / 10).toString().replace(/\.0$/, "") + "%");
  const fmtN = (v) => (v == null ? "—" : (Math.round(v * 10) / 10).toString().replace(/\.0$/, ""));
  const delta = (a, b) => (a == null || b == null ? null : Math.round((a - b) * 10) / 10);
  const NO_DATA = "Ma'lumot yetarli emas";

  // ───────────────────────── holat ─────────────────────────
  const CFG_KEY = "admin_private_analytics_v1"; // faqat adminga ko'rinadi (KV siyosati)
  const DEFAULT_WEIGHTS = { attendance: 30, marking: 25, trend: 20, grading: 15, stability: 10 };
  const state = {
    tab: "overview",
    period: { key: "30", from: null, to: null },
    weights: Object.assign({}, DEFAULT_WEIGHTS),
    teacherSort: "score",
    groupFilter: "",
    teacherFilter: "",
    accounts: null,
    activity: null,
    activityQ: { event: "", actor: "", severity: "", page: 1 },
    monitor: null,
    monitorErr: null,
    pollSec: 30,
    pollTimer: null,
    lastCalc: null,
  };
  try {
    const saved = JSON.parse(localStorage.getItem(CFG_KEY) || "{}");
    if (saved.weights) state.weights = Object.assign({}, DEFAULT_WEIGHTS, saved.weights);
    if (saved.pollSec != null) state.pollSec = saved.pollSec;
    if (saved.period && saved.period.key) state.period = saved.period;
  } catch (e) {}
  function saveCfg() {
    try {
      localStorage.setItem(CFG_KEY, JSON.stringify({ weights: state.weights, pollSec: state.pollSec, period: state.period }));
    } catch (e) {}
  }

  // ───────────────────────── davr ─────────────────────────
  const PERIODS = [
    ["today", "Bugun"],
    ["7", "7 kun"],
    ["30", "30 kun"],
    ["90", "90 kun"],
    ["custom", "Oraliq"],
  ];
  function range() {
    const p = state.period;
    const now = new Date();
    if (p.key === "custom" && p.from && p.to) {
      const f = sod(parseDate(p.from)), t = eod(parseDate(p.to));
      if (f <= t) return { from: f, to: t, label: fmtD(f) + " — " + fmtD(t) };
    }
    const n = p.key === "today" ? 1 : Number(p.key) || 30;
    const from = sod(new Date(now.getTime() - (n - 1) * DAY));
    const to = eod(now);
    return { from, to, label: n === 1 ? "Bugun, " + fmtD(from) : "Oxirgi " + n + " kun (" + fmtD(from) + " — " + fmtD(to) + ")" };
  }
  /** Oldingi teng uzunlikdagi davr — taqqoslash uchun bir xil mezon. */
  function prevRange(r) {
    const len = r.to.getTime() - r.from.getTime() + 1;
    const to = new Date(r.from.getTime() - 1);
    const from = new Date(r.from.getTime() - len);
    return { from, to, label: fmtD(from) + " — " + fmtD(to) };
  }

  // ───────────────────────── darslar va davomat ─────────────────────────
  const DAYMAP = { Du: 1, Se: 2, Ch: 3, Pa: 4, Ju: 5, Sh: 6 };
  /** Guruh jadvali bo'yicha oyning dars kunlari (davomat jadvalidagi bilan bir xil). */
  function scheduleDays(g, y, m) {
    const days = ((g && g.days) || []).map((d) => DAYMAP[d]).filter(Boolean);
    if (!days.length) return null;
    const out = [];
    const dim = new Date(y, m + 1, 0).getDate();
    for (let d = 1; d <= dim && out.length < LC(); d++) if (days.includes(new Date(y, m, d).getDay())) out.push(d);
    return out;
  }
  function monthsBetween(from, to) {
    const out = [];
    let y = from.getFullYear(), m = from.getMonth();
    while (y < to.getFullYear() || (y === to.getFullYear() && m <= to.getMonth())) {
      out.push([y, m]);
      m++;
      if (m > 11) { m = 0; y++; }
    }
    return out;
  }
  const groupById = (id) => (D.groups || []).find((g) => String(g.id) === String(id));
  const mentorOfGroup = (g) =>
    g ? (D.mentors || []).find((m) => (g.mentorId != null && String(m.id) === String(g.mentorId))) || (D.mentors || []).find((m) => m.name === g.mentor) || null : null;

  /**
   * Davrdagi darslar. Har bir dars: {gid, y, m, l, date, undated, planned, past, held, marks:{sid:v}, K, Y, S}
   *   planned — jadval bo'yicha shu davrga to'g'ri keladi (guruh boshlangan, arxivda emas)
   *   past    — sanasi bugundan oldin yoki bugun
   *   held    — kamida bitta talabaga davomat belgilangan (= dars o'tilgan deb hisoblanadi)
   *   undated — guruhda dars kunlari kiritilmagan; sana noma'lum, oy bo'yicha olinadi
   */
  function lessonsIn(r) {
    const out = [];
    const today = eod(new Date());
    const att = D.attendance || {};
    (D.groups || []).forEach((g) => {
      const start = parseDate(g.startDate);
      const archived = g.status === "Arxiv" || g.status === "Man etilgan";
      monthsBetween(r.from, r.to).forEach(([y, m]) => {
        const sheet = att["att_" + g.id + "_" + y + "_" + m] || {};
        const days = scheduleDays(g, y, m);
        for (let l = 1; l <= LC(); l++) {
          const marks = {};
          let K = 0, Y = 0, S = 0;
          Object.keys(sheet).forEach((sk) => {
            const v = sheet[sk] && sheet[sk]["l" + l];
            if (v === "K" || v === "Y" || v === "S") {
              marks[sk.slice(1)] = v;
              if (v === "K") K++; else if (v === "Y") Y++; else S++;
            }
          });
          const held = K + Y + S > 0;
          let date = null, undated = false;
          if (days) {
            if (days[l - 1] == null) { if (!held) continue; undated = true; }
            else date = new Date(y, m, days[l - 1]);
          } else {
            if (!held) continue; // jadvalsiz guruh — faqat belgilangan darslar
            undated = true;
          }
          if (date && !inR(date, r)) continue;
          const planned = !!date && !archived && (!start || date >= sod(start));
          if (!planned && !held) continue;
          out.push({ gid: g.id, y, m, l, date, undated, planned, past: !!date && date <= today, held, marks, K, Y, S });
        }
      });
    });
    return out;
  }

  /** Davomat jamlanmasi: present% = K / (K + Y + S). S (sababli) ham qatnashmagan deb sanaladi. */
  function attAgg(lessons, filterSid) {
    let K = 0, Y = 0, S = 0;
    lessons.forEach((ls) => {
      Object.keys(ls.marks).forEach((sid) => {
        if (filterSid && !filterSid(sid)) return;
        const v = ls.marks[sid];
        if (v === "K") K++; else if (v === "Y") Y++; else S++;
      });
    });
    const marked = K + Y + S;
    return { K, Y, S, marked, pct: pct(K, marked) };
  }

  // ───────────────────────── baholar va testlar ─────────────────────────
  /** Barcha baholar (id bo'yicha takrorlanmaydi). */
  function allGrades() {
    const out = [];
    const seen = new Set();
    const sg = D.simpleGrades || {};
    Object.keys(sg).forEach((sid) => {
      (sg[sid] || []).forEach((g) => {
        const score = Number(g && g.score);
        if (!isFinite(score)) return;
        const key = sid + "|" + (g.id || g.date + "|" + score);
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ sid: String(sid), score, date: parseDate(g.date), mentor: g.mentorName || "" });
      });
    });
    return out;
  }
  function allTestResults() {
    const out = [];
    const res = D.testResults || {};
    Object.keys(res).forEach((tid) => {
      const t = (D.tests || []).find((x) => String(x.id) === String(tid));
      Object.keys(res[tid] || {}).forEach((sid) => {
        const x = res[tid][sid];
        if (!x || x.score == null || !isFinite(Number(x.score))) return;
        out.push({ tid, sid: String(sid), score: Number(x.score), date: parseDate(x.completedAt || x.date || x.submittedAt), title: t ? t.title : "Test", gid: t ? t.groupId : null });
      });
    });
    return out;
  }

  // ───────────────────────── asosiy hisob ─────────────────────────
  /**
   * Hamma ko'rsatkichlar bitta joyda hisoblanadi. Natija bir render ichida
   * qayta ishlatiladi.
   */
  function calc() {
    const r = range();
    const pr = prevRange(r);
    const L = lessonsIn(r);
    const PL = lessonsIn(pr);
    const grades = allGrades();
    const tests = allTestResults();
    const students = D.students || [];
    const studentById = new Map(students.map((s) => [String(s.id), s]));
    const groupOfSid = (sid) => { const s = studentById.get(String(sid)); return s ? s.groupId : null; };

    const G = grades.filter((g) => inR(g.date, r));
    const PG = grades.filter((g) => inR(g.date, pr));
    const T = tests.filter((t) => inR(t.date, r));
    const PT = tests.filter((t) => inR(t.date, pr));

    // Talabalar
    const statusCount = {};
    students.forEach((s) => { const k = s.status || "Aktiv"; statusCount[k] = (statusCount[k] || 0) + 1; });
    const activeStudents = students.filter((s) => !s.status || s.status === "Aktiv" || s.status === "Probatsiya");
    const newStudents = students.filter((s) => inR(parseDate(s.joinDate), r));
    const prevNewStudents = students.filter((s) => inR(parseDate(s.joinDate), pr));
    // "Faol emas": holati Faolsiz/Muzlatilgan YOKI aktiv bo'lsa-yu davrda darsga
    // belgilangan, lekin bir marta ham kelmagan (kamida 3 ta belgi bo'lsa).
    const perStudentAtt = {};
    L.forEach((ls) => Object.keys(ls.marks).forEach((sid) => {
      const a = perStudentAtt[sid] || (perStudentAtt[sid] = { K: 0, n: 0 });
      a.n++;
      if (ls.marks[sid] === "K") a.K++;
    }));
    const inactive = students.filter((s) => {
      if (s.status === "Faolsiz" || s.status === "Muzlatilgan") return true;
      const a = perStudentAtt[String(s.id)];
      return activeStudents.includes(s) && a && a.n >= 3 && a.K === 0;
    });

    // Darslar
    const plannedPast = L.filter((x) => x.planned && x.past);
    const plannedFuture = L.filter((x) => x.planned && !x.past);
    const held = L.filter((x) => x.held);
    const unmarked = plannedPast.filter((x) => !x.held);
    const undated = held.filter((x) => x.undated);

    const att = attAgg(L);
    const prevAtt = attAgg(PL);

    // Guruhlar
    const groups = (D.groups || []).map((g) => groupStats(g, { L, PL, G, PG, T, PT, studentById, r }));
    // O'qituvchilar
    const teachers = (D.mentors || []).map((m) => teacherStats(m, groups, { L, PL, G, PG, r, pr }));
    rankTeachers(teachers);

    return {
      r, pr, L, PL, G, PG, T, PT, grades, tests,
      students, activeStudents, statusCount, newStudents, prevNewStudents, inactive, perStudentAtt,
      plannedPast, plannedFuture, held, unmarked, undated,
      att, prevAtt,
      avgGrade: avg(G.map((g) => g.score)),
      prevAvgGrade: avg(PG.map((g) => g.score)),
      avgTest: avg(T.map((t) => t.score)),
      prevAvgTest: avg(PT.map((t) => t.score)),
      groups, teachers, groupOfSid, studentById,
    };
  }

  function groupStats(g, ctx) {
    const gid = String(g.id);
    const members = (D.students || []).filter((s) => String(s.groupId) === gid);
    const memberIds = new Set(members.map((s) => String(s.id)));
    const L = ctx.L.filter((x) => String(x.gid) === gid);
    const PL = ctx.PL.filter((x) => String(x.gid) === gid);
    const a = attAgg(L), pa = attAgg(PL);
    const G = ctx.G.filter((x) => memberIds.has(x.sid));
    const PG = ctx.PG.filter((x) => memberIds.has(x.sid));
    const T = ctx.T.filter((x) => memberIds.has(x.sid));
    const plannedPast = L.filter((x) => x.planned && x.past).length;
    const heldN = L.filter((x) => x.held).length;
    const heldPlanned = L.filter((x) => x.planned && x.past && x.held).length;
    // Har bir talaba
    const per = members.map((s) => {
      const sid = String(s.id);
      const sa = attAgg(L, (x) => x === sid);
      const spa = attAgg(PL, (x) => x === sid);
      const sg = G.filter((x) => x.sid === sid).map((x) => x.score);
      const spg = PG.filter((x) => x.sid === sid).map((x) => x.score);
      const st = T.filter((x) => x.sid === sid).map((x) => x.score);
      const reasons = [];
      if (sa.marked >= 4 && sa.pct < 60) reasons.push("davomat " + fmtP(sa.pct));
      const ag = avg(sg);
      if (sg.length >= 2 && ag < 60) reasons.push("o'rtacha baho " + fmtN(ag));
      const gd = sg.length >= 2 && spg.length >= 2 ? delta(ag, avg(spg)) : null;
      if (gd != null && gd <= -15) reasons.push("baho " + fmtN(gd) + " ga tushgan");
      const ad = sa.marked >= 4 && spa.marked >= 4 ? delta(sa.pct, spa.pct) : null;
      if (ad != null && ad <= -30) reasons.push("davomat " + fmtN(ad) + " p.p. tushgan");
      return { s, sid, att: sa, prevAtt: spa, attDelta: ad, avgGrade: ag, gradeN: sg.length, gradeDelta: gd, avgTest: avg(st), testN: st.length, reasons };
    });
    const mentor = mentorOfGroup(g);
    return {
      g, gid, name: g.name || "Guruh", course: g.course || "", mentor, mentorName: mentor ? mentor.name : g.mentor || "—",
      archived: g.status === "Arxiv" || g.status === "Man etilgan",
      size: members.length, members: per,
      att: a, prevAtt: pa, attDelta: a.marked >= 10 && pa.marked >= 10 ? delta(a.pct, pa.pct) : null,
      avgGrade: avg(G.map((x) => x.score)), gradeN: G.length,
      prevAvgGrade: avg(PG.map((x) => x.score)), prevGradeN: PG.length,
      gradeDelta: G.length >= 3 && PG.length >= 3 ? delta(avg(G.map((x) => x.score)), avg(PG.map((x) => x.score))) : null,
      avgTest: avg(T.map((x) => x.score)), testN: T.length,
      plannedPast, held: heldN, heldPlanned, unmarked: plannedPast - heldPlanned,
      marking: plannedPast > 0 ? pct(heldPlanned, plannedPast) : null,
      noSchedule: !((g.days || []).length),
      top: per.filter((x) => x.att.marked >= 3).sort((a1, b1) => (b1.att.pct || 0) - (a1.att.pct || 0) || (b1.avgGrade || 0) - (a1.avgGrade || 0)).slice(0, 3),
      needHelp: per.filter((x) => x.reasons.length),
    };
  }

  // ───────────────────────── o'qituvchilar reytingi ─────────────────────────
  const CRITERIA = [
    { key: "attendance", label: "Talabalar davomati", unit: "%", desc: "Mentor guruhlaridagi K / (K+Y+S) — davrdagi barcha belgilar." },
    { key: "marking", label: "Darslarni o'z vaqtida belgilash", unit: "%", desc: "Jadval bo'yicha o'tgan darslardan nechtasida davomat belgilangan." },
    { key: "trend", label: "Natijalar o'zgarishi", unit: "ball", desc: "Talabalar o'rtacha bahosi: shu davr − oldingi teng davr. 50 = o'zgarishsiz." },
    { key: "grading", label: "Baholash faolligi", unit: "baho/talaba", desc: "Davrda bir talabaga qo'yilgan baholar soni (mentorlar orasida nisbiy)." },
    { key: "stability", label: "Barqarorlik", unit: "%", desc: "Darsi bor haftalardan nechtasida davomat belgilangan (muntazamlik)." },
  ];
  function weekKey(d) { const x = sod(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return ymd(x); }

  function teacherStats(m, groups, ctx) {
    const mine = groups.filter((x) => x.mentor && String(x.mentor.id) === String(m.id));
    const active = mine.filter((x) => !x.archived);
    const gids = new Set(mine.map((x) => x.gid));
    const L = ctx.L.filter((x) => gids.has(String(x.gid)));
    const PL = ctx.PL.filter((x) => gids.has(String(x.gid)));
    const a = attAgg(L), pa = attAgg(PL);
    const plannedPast = L.filter((x) => x.planned && x.past);
    const heldPlanned = plannedPast.filter((x) => x.held);
    const held = L.filter((x) => x.held);
    const memberIds = new Set();
    mine.forEach((x) => x.members.forEach((p) => memberIds.add(p.sid)));
    // Yuklama (talaba soni) — faqat arxivda bo'lmagan guruhlar bo'yicha
    const activeIds = new Set();
    active.forEach((x) => x.members.forEach((p) => activeIds.add(p.sid)));
    const G = ctx.G.filter((x) => memberIds.has(x.sid));
    const PG = ctx.PG.filter((x) => memberIds.has(x.sid));
    const givenByMe = ctx.G.filter((x) => x.mentor && x.mentor === m.name).length;
    // Barqarorlik: rejalashtirilgan darsi bo'lgan haftalardan nechtasida belgi bor
    const wPlan = new Set(plannedPast.map((x) => weekKey(x.date)));
    const wHeld = new Set(heldPlanned.map((x) => weekKey(x.date)));
    const gNow = avg(G.map((x) => x.score)), gPrev = avg(PG.map((x) => x.score));
    const trend = G.length >= 3 && PG.length >= 3 ? delta(gNow, gPrev) : null;
    const students = activeIds.size;
    return {
      m, name: m.name || "Mentor", groups: mine.length, activeGroups: active.length, students,
      plannedPast: plannedPast.length, held: held.length, heldPlanned: heldPlanned.length,
      plannedFuture: L.filter((x) => x.planned && !x.past).length,
      att: a, prevAtt: pa, attDelta: a.marked >= 10 && pa.marked >= 10 ? delta(a.pct, pa.pct) : null,
      avgGrade: gNow, gradeN: G.length, trend,
      gradesGiven: givenByMe, gradesPerStudent: students ? Math.round((givenByMe / students) * 100) / 100 : null,
      metrics: {
        attendance: a.marked >= 10 ? a.pct : null,
        marking: plannedPast.length >= 3 ? pct(heldPlanned.length, plannedPast.length) : null,
        trend: trend == null ? null : Math.max(0, Math.min(100, 50 + trend * 2.5)),
        grading: null, // pastda mentorlar orasida nisbiy hisoblanadi
        stability: wPlan.size >= 2 ? pct(wHeld.size, wPlan.size) : null,
      },
      sample: a.marked,
    };
  }

  /**
   * Umumiy ball = mavjud mezonlar bo'yicha og'irlikli o'rtacha (0–100).
   * Mezon hisoblanmasa (ma'lumot kam) — u tashlab ketiladi va og'irliklar
   * qolganlariga qayta taqsimlanadi. Ishonchlilik:
   *   ishonchli  — ≥ 30 ta davomat belgisi va ≥ 3 ta mezon
   *   taxminiy   — ≥ 10 ta belgi va ≥ 2 ta mezon
   *   yetarli emas — qolganlari (reytingga kiritilmaydi)
   */
  function rankTeachers(list) {
    const gp = list.map((t) => t.gradesPerStudent).filter((v) => v != null && v > 0);
    const maxGp = gp.length ? Math.max(...gp) : 0;
    list.forEach((t) => {
      t.metrics.grading = maxGp > 0 && t.students > 0 ? Math.round(((t.gradesPerStudent || 0) / maxGp) * 1000) / 10 : null;
      let wSum = 0, sum = 0, used = 0;
      CRITERIA.forEach((c) => {
        const v = t.metrics[c.key];
        const w = Number(state.weights[c.key]) || 0;
        if (v == null || w <= 0) return;
        wSum += w; sum += v * w; used++;
      });
      t.criteriaUsed = used;
      t.score = wSum > 0 ? Math.round((sum / wSum) * 10) / 10 : null;
      t.confidence = t.sample >= 30 && used >= 3 ? "high" : t.sample >= 10 && used >= 2 ? "low" : "none";
      if (t.confidence === "none") t.score = null;
    });
  }

  // ───────────────────────── aqlli tavsiyalar (statistik qoidalar) ─────────────────────────
  // Har bir tavsiya: {level, title, numbers, period, reason, next, tab}
  // level: "alert" (tez e'tibor), "warn", "good" (ijobiy), "info"
  function insights(c) {
    const out = [];
    const per = c.r.label, cmp = "oldingi davr: " + c.pr.label;
    // 1. Davomati pasayayotgan / yaxshilangan guruhlar
    c.groups.forEach((g) => {
      if (g.attDelta != null && g.attDelta <= -10)
        out.push({
          level: g.attDelta <= -20 ? "alert" : "warn",
          title: g.name + " guruhida davomat pasaymoqda",
          numbers: "Davomat " + fmtP(g.prevAtt.pct) + " → " + fmtP(g.att.pct) + " (" + fmtN(g.attDelta) + " p.p.), " + g.att.marked + " ta belgi",
          period: per + "; " + cmp,
          reason: "Ikki teng davr bir xil formula (K/(K+Y+S)) bilan solishtirildi, har birida kamida 10 ta belgi bor.",
          next: "Mentor (" + g.mentorName + ") bilan kelmay qolayotgan talabalarni ko'rib chiqing, ota-onalar bilan bog'laning.",
          tab: "groups",
        });
      else if (g.attDelta != null && g.attDelta >= 10)
        out.push({
          level: "good",
          title: g.name + " guruhida davomat yaxshilandi",
          numbers: "Davomat " + fmtP(g.prevAtt.pct) + " → " + fmtP(g.att.pct) + " (+" + fmtN(g.attDelta) + " p.p.)",
          period: per + "; " + cmp,
          reason: "Ikki teng davr solishtirildi, har birida kamida 10 ta belgi bor.",
          next: "Mentorning tajribasini boshqa guruhlarga ham ulashish mumkin.",
          tab: "groups",
        });
    });
    // 2. Darslar belgilanmay qolayotgan guruhlar (rejadan ortda / jurnal to'ldirilmagan)
    c.groups.forEach((g) => {
      if (g.archived || g.plannedPast < 3 || g.unmarked < 2) return;
      if (g.marking != null && g.marking < 75)
        out.push({
          level: g.marking < 50 ? "alert" : "warn",
          title: g.name + ": " + g.unmarked + " ta dars uchun davomat belgilanmagan",
          numbers: "Jadval bo'yicha o'tgan " + g.plannedPast + " ta darsdan " + (g.plannedPast - g.unmarked) + " tasida belgi bor (" + fmtP(g.marking) + ")",
          period: per,
          reason: "Dars kunlari guruh jadvalidan olinadi. Belgi yo'q bo'lsa — dars o'tilmagan yoki jurnal to'ldirilmagan.",
          next: "Mentor " + g.mentorName + " dan darslar o'tilganini aniqlang va davomatni to'ldirishni so'rang.",
          tab: "groups",
        });
    });
    // 3. Baholar o'zgarishi
    c.groups.forEach((g) => {
      if (g.gradeDelta == null) return;
      if (g.gradeDelta <= -10)
        out.push({
          level: "warn",
          title: g.name + " guruhida o'rtacha baho pasaydi",
          numbers: "O'rtacha baho " + fmtN(g.prevAvgGrade) + " → " + fmtN(g.avgGrade) + " (" + fmtN(g.gradeDelta) + "), " + g.gradeN + " ta baho",
          period: per + "; " + cmp,
          reason: "Har ikki davrda kamida 3 tadan baho bor.",
          next: "Qaysi mavzularda qiyinchilik borligini mentor bilan muhokama qiling; qo'shimcha mashg'ulot rejalashtiring.",
          tab: "groups",
        });
      else if (g.gradeDelta >= 10)
        out.push({
          level: "good",
          title: g.name + " guruhida natijalar yaxshilanmoqda",
          numbers: "O'rtacha baho " + fmtN(g.prevAvgGrade) + " → " + fmtN(g.avgGrade) + " (+" + fmtN(g.gradeDelta) + ")",
          period: per + "; " + cmp,
          reason: "Har ikki davrda kamida 3 tadan baho bor.",
          next: "Ijobiy tajribani qayd eting.",
          tab: "groups",
        });
    });
    // 4. Faolligi keskin o'zgargan talabalar
    const drops = [];
    c.groups.forEach((g) => g.members.forEach((p) => { if (p.attDelta != null && p.attDelta <= -30) drops.push({ g, p }); }));
    if (drops.length)
      out.push({
        level: "warn",
        title: drops.length + " ta talabaning davomati keskin tushgan",
        numbers: drops.slice(0, 5).map((x) => x.p.s.name + " (" + x.g.name + "): " + fmtP(x.p.prevAtt.pct) + " → " + fmtP(x.p.att.pct)).join("; ") + (drops.length > 5 ? " …" : ""),
        period: per + "; " + cmp,
        reason: "Talabaning ikki teng davrdagi davomati solishtirildi (har birida ≥ 4 ta belgi), farq 30 p.p. dan katta.",
        next: "Bu yakuniy xulosa emas — mentor talaba bilan gaplashib, sababini aniqlasin va yordam bersin.",
        tab: "groups",
      });
    // 5. Ma'lumot to'liq kiritilmagan bo'limlar
    const noSched = c.groups.filter((g) => !g.archived && g.noSchedule);
    if (noSched.length)
      out.push({
        level: "info",
        title: noSched.length + " ta guruhda dars kunlari kiritilmagan",
        numbers: noSched.map((g) => g.name).slice(0, 8).join(", "),
        period: "Joriy holat",
        reason: "Dars kunlarisiz rejalashtirilgan darslar va 'o'z vaqtida belgilash' hisoblanmaydi.",
        next: "Guruhlar bo'limida har bir guruhga dars kunlarini belgilang.",
        tab: "groups",
      });
    const noMentor = c.groups.filter((g) => !g.archived && !g.mentor);
    if (noMentor.length)
      out.push({
        level: "info",
        title: noMentor.length + " ta guruhga mentor biriktirilmagan",
        numbers: noMentor.map((g) => g.name).slice(0, 8).join(", "),
        period: "Joriy holat",
        reason: "Bu guruhlar o'qituvchilar reytingiga kirmaydi.",
        next: "Guruhni tahrirlab mentorni tanlang.",
        tab: "groups",
      });
    const noGroup = c.students.filter((s) => (!s.status || s.status === "Aktiv") && !groupById(s.groupId));
    if (noGroup.length)
      out.push({
        level: "info",
        title: noGroup.length + " ta aktiv talaba hech qaysi guruhda emas",
        numbers: noGroup.slice(0, 6).map((s) => s.name).join(", ") + (noGroup.length > 6 ? " …" : ""),
        period: "Joriy holat",
        reason: "Guruhsiz talabaning davomati va baholari hisobga olinmaydi.",
        next: "Talabalar bo'limida guruhini belgilang.",
        tab: "groups",
      });
    const noGrades = c.groups.filter((g) => !g.archived && g.held >= 4 && g.size > 0 && g.gradeN === 0);
    if (noGrades.length)
      out.push({
        level: "info",
        title: noGrades.length + " ta guruhda davrda birorta ham baho qo'yilmagan",
        numbers: noGrades.map((g) => g.name + " (" + g.held + " dars)").slice(0, 8).join(", "),
        period: per,
        reason: "Darslar o'tilgan, lekin baholar jurnali bo'sh — natijalar dinamikasini kuzatib bo'lmaydi.",
        next: "Mentorlarga baholash jurnalini yuritishni eslating.",
        tab: "teachers",
      });
    if (c.undated.length)
      out.push({
        level: "info",
        title: c.undated.length + " ta o'tilgan darsning sanasi aniq emas",
        numbers: "Bu darslar oy bo'yicha hisoblandi",
        period: per,
        reason: "Guruh jadvalida dars kunlari yo'q yoki belgi jadvaldagi kunlardan ortiq ustunga qo'yilgan.",
        next: "Guruh dars kunlarini to'g'rilang — shunda kunlik/haftalik grafiklar aniqroq bo'ladi.",
        tab: "groups",
      });
    // 6. Tizim (monitoring yuklangan bo'lsa)
    const mon = state.monitor;
    if (mon && mon.requests) {
      const r60 = mon.requests.last60;
      const er = r60.n >= 50 ? pct(r60.err, r60.n) : null;
      if (er != null && er >= 2)
        out.push({
          level: er >= 5 ? "alert" : "warn",
          title: "Server xatolari odatdagidan ko'p",
          numbers: "Oxirgi 60 daqiqada " + r60.n + " so'rovdan " + r60.err + " tasi 5xx (" + fmtP(er) + ")",
          period: "Oxirgi 60 daqiqa (hisob server ishga tushgandan beri: " + fmtDT(mon.requests.since) + ")",
          reason: "5xx — server ichki xatosi. 2% dan oshsa foydalanuvchilar sezadi.",
          next: "Monitoring → 'Ko'p xato qaytarayotgan endpointlar' jadvalini oching.",
          tab: "monitor",
        });
      if (mon.serverErrors24h >= 5)
        out.push({
          level: "warn",
          title: "So'nggi 24 soatda " + mon.serverErrors24h + " ta server xatosi qayd etilgan",
          numbers: mon.serverErrors24h + " ta 'server.error' hodisasi",
          period: "Oxirgi 24 soat",
          reason: "Jurnaldagi server xatolari soni (qayta ishga tushishdan keyin ham saqlanadi).",
          next: "Jurnal → 'Server xatosi' bo'yicha filtrlang.",
          tab: "activity",
        });
      if (mon.db && mon.db.ok && mon.db.pingMs > 500)
        out.push({
          level: "warn",
          title: "Ma'lumotlar bazasi sekin javob bermoqda",
          numbers: "Ping: " + mon.db.pingMs + " ms",
          period: "Hozir",
          reason: "Odatda bir necha o'n ms bo'ladi.",
          next: "MongoDB Atlas holatini tekshiring.",
          tab: "monitor",
        });
    }
    const act = state.activity;
    if (act && act.byEvent) {
      const failed = act.byEvent.filter((e) => /^auth\.login\.(failed|unknown_user)|^auth\.device\.blocked/.test(e.event)).reduce((s, e) => s + e.n, 0);
      if (failed >= 20)
        out.push({
          level: "warn",
          title: "Ko'p muvaffaqiyatsiz kirish urinishlari",
          numbers: failed + " ta xato parol / noma'lum login urinishi",
          period: per,
          reason: "Parol esdan chiqqan foydalanuvchilar yoki parol tanlash urinishi bo'lishi mumkin.",
          next: "Jurnal → 'Kirish xatosi' bo'yicha IP va loginlarni ko'rib chiqing.",
          tab: "activity",
        });
    }
    const order = { alert: 0, warn: 1, info: 2, good: 3 };
    return out.sort((a, b) => order[a.level] - order[b.level]);
  }

  // AI integratsiyasi uchun alohida joy. Hozir ULANMAGAN — tavsiyalar faqat
  // yuqoridagi statistik qoidalardan chiqadi. Kelajakda ulanganda unga faqat
  // yig'ma, anonim matn (tavsiya sarlavhasi va raqamlar) yuborilishi kerak —
  // talabaning shaxsiy ma'lumotlari tashqi xizmatga yuborilmaydi.
  window.SuperAnalyticsAI = window.SuperAnalyticsAI || {
    available: false,
    /** @param {Array} items insights() natijasi @returns {Promise<string>} */
    explain: null,
  };

  // ───────────────────────── server ma'lumotlari ─────────────────────────
  async function getJson(url) {
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d || d.ok === false) throw new Error((d && d.error) || "HTTP " + r.status);
    return d;
  }
  async function loadAccounts() {
    try { state.accounts = (await getJson("/api/admin/analytics/accounts")).roles; }
    catch (e) { state.accounts = { error: e.message }; }
  }
  async function loadActivity() {
    const r = range();
    const q = state.activityQ;
    const p = new URLSearchParams({ from: r.from.toISOString(), to: r.to.toISOString(), page: String(q.page || 1), limit: "50" });
    if (q.event) p.set("event", q.event);
    if (q.actor) p.set("actor", q.actor);
    if (q.severity) p.set("severity", q.severity);
    try { state.activity = await getJson("/api/admin/activity?" + p.toString()); }
    catch (e) { state.activity = { error: e.message }; }
  }
  async function loadMonitor() {
    try { state.monitor = await getJson("/api/admin/monitor"); state.monitorErr = null; }
    catch (e) { state.monitorErr = e.message; }
  }

  // ───────────────────────── grafiklar (SVG) ─────────────────────────
  const COLORS = ["var(--accent)", "var(--teal)", "var(--amber)", "var(--purple)", "var(--orange)"];
  /**
   * Chiziqli grafik. series: [{name, values:[number|null], color}]
   * null — "ma'lumot yo'q": chiziq uziladi, nol chizilmaydi.
   */
  function lineChart(labels, series, opts) {
    opts = opts || {};
    // viewBox kengligi taxminan haqiqiy kenglikka teng — shunda matn va
    // nuqtalar har qanday ekranda bir xil o'lchamda qoladi (cho'zilmaydi).
    const vw = window.innerWidth || 1200;
    const content = vw >= 1024 ? vw - 300 : vw - 40;
    const full = content - 40;
    const W = Math.round(Math.max(280, Math.min(1200, opts.wide || vw < 860 ? full : (content - 14) / 2 - 34)));
    const H = opts.h || 200, P = { l: 38, r: 12, t: 12, b: 26 };
    const vals = series.flatMap((s) => s.values).filter((v) => v != null);
    if (!vals.length) return `<div class="an-empty">${NO_DATA}</div>`;
    const max = opts.max != null ? opts.max : Math.max(1, ...vals) * 1.1;
    const min = opts.min != null ? opts.min : 0;
    const x = (i) => P.l + (labels.length <= 1 ? (W - P.l - P.r) / 2 : (i * (W - P.l - P.r)) / (labels.length - 1));
    const y = (v) => P.t + (H - P.t - P.b) * (1 - (v - min) / (max - min || 1));
    const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => {
      const v = min + (max - min) * f;
      return `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" class="an-grid"/><text x="${P.l - 6}" y="${y(v) + 3}" class="an-axis" text-anchor="end">${fmtN(Math.round(v))}</text>`;
    }).join("");
    const step = Math.max(1, Math.ceil(labels.length / 8));
    const xl = labels.map((l, i) => (i % step === 0 || i === labels.length - 1 ? `<text x="${x(i)}" y="${H - 8}" class="an-axis" text-anchor="middle">${esc(l)}</text>` : "")).join("");
    const lines = series.map((s, si) => {
      const col = s.color || COLORS[si % COLORS.length];
      let d = "", pts = "";
      s.values.forEach((v, i) => {
        if (v == null) return;
        const cmd = i === 0 || s.values[i - 1] == null ? "M" : "L";
        d += cmd + x(i).toFixed(1) + " " + y(v).toFixed(1) + " ";
        pts += `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" fill="${col}"><title>${esc(s.name)} — ${esc(labels[i])}: ${fmtN(v)}${opts.unit || ""}</title></circle>`;
      });
      return `<path d="${d}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>${pts}`;
    }).join("");
    const legend = series.length > 1 ? `<div class="an-legend">${series.map((s, si) => `<span><i style="background:${s.color || COLORS[si % COLORS.length]}"></i>${esc(s.name)}</span>`).join("")}</div>` : "";
    return `<svg class="an-svg" viewBox="0 0 ${W} ${H}" role="img">${grid}${xl}${lines}</svg>${legend}`;
  }
  /** Ustunli grafik. items: [{label, value, color?, hint?}] */
  function colChart(items, opts) {
    opts = opts || {};
    if (!items.length || items.every((i) => i.value == null)) return `<div class="an-empty">${NO_DATA}</div>`;
    const max = opts.max || Math.max(1, ...items.map((i) => i.value || 0));
    return `<div class="an-cols">${items.map((i) => {
      const h = i.value ? Math.max(3, Math.round((i.value / max) * 100)) : 0;
      return `<div class="an-col" title="${esc(i.label)}: ${i.value == null ? "—" : fmtN(i.value) + (opts.unit || "")}${i.hint ? " — " + esc(i.hint) : ""}">
        <div class="an-col-v">${i.value == null ? "—" : fmtN(i.value)}</div>
        <div class="an-col-t"><div class="an-col-f" style="height:${h}%;background:${i.color || "var(--accent)"}"></div></div>
        <div class="an-col-l">${esc(i.label)}</div></div>`;
    }).join("")}</div>`;
  }
  /** Gorizontal chiziqlar. items: [{label, value, text?, color?, onclick?}] */
  function barList(items, opts) {
    opts = opts || {};
    if (!items.length) return `<div class="an-empty">${opts.empty || NO_DATA}</div>`;
    const max = opts.max || Math.max(1, ...items.map((i) => i.value || 0));
    return items.map((i) => `<div class="an-bar${i.onclick ? " an-click" : ""}" ${i.onclick ? `onclick="${i.onclick}"` : ""}>
      <div class="an-bar-n" title="${esc(i.label)}">${esc(i.label)}</div>
      <div class="an-bar-t"><div class="an-bar-f" style="width:${i.value == null ? 0 : Math.round((i.value / max) * 100)}%;background:${i.color || "var(--accent)"}"></div></div>
      <div class="an-bar-v">${i.text != null ? i.text : i.value == null ? "—" : fmtN(i.value)}</div></div>`).join("");
  }
  const pctCol = (p) => (p == null ? "var(--text3)" : p >= 80 ? "var(--teal)" : p >= 60 ? "var(--amber)" : "#dc2626");
  const deltaHtml = (d, unit) => {
    if (d == null) return `<span class="an-dl">—</span>`;
    const cls = d > 0 ? "up" : d < 0 ? "down" : "";
    return `<span class="an-dl ${cls}">${d > 0 ? "+" : ""}${fmtN(d)}${unit || ""}</span>`;
  };
  /** Grafik kartasi: nom, davr, o'lchov birligi va manba har doim ko'rinadi. */
  function chartCard(title, meta, body, extra) {
    return `<section class="an-card ${extra || ""}"><div class="an-card-h"><h3>${title}</h3>${meta.action || ""}</div>
      <div class="an-meta">${meta.period ? `<span>${ic("calendar")} ${esc(meta.period)}</span>` : ""}${meta.unit ? `<span>O'lchov: ${esc(meta.unit)}</span>` : ""}${meta.source ? `<span>Manba: ${esc(meta.source)}</span>` : ""}</div>
      ${body}</section>`;
  }

  // ───────────────────────── davr bo'laklari (grafiklar uchun) ─────────────────────────
  /** ≤ 14 kun — kunlik, ≤ 120 kun — haftalik, aks holda oylik. */
  function buckets(r) {
    const days = Math.round((r.to - r.from) / DAY) + 1;
    const out = [];
    if (days <= 14) {
      for (let t = r.from.getTime(); t <= r.to.getTime(); t += DAY) {
        const f = sod(new Date(t));
        out.push({ label: f.getDate() + "-" + MONTHS[f.getMonth()], from: f, to: eod(f) });
      }
    } else if (days <= 120) {
      let f = sod(r.from);
      while (f <= r.to) {
        const t = eod(new Date(Math.min(f.getTime() + 6 * DAY, r.to.getTime())));
        out.push({ label: f.getDate() + "-" + MONTHS[f.getMonth()], from: f, to: t });
        f = sod(new Date(t.getTime() + 1));
      }
    } else {
      monthsBetween(r.from, r.to).forEach(([y, m]) => {
        const f = new Date(Math.max(new Date(y, m, 1).getTime(), r.from.getTime()));
        const t = new Date(Math.min(eod(new Date(y, m + 1, 0)).getTime(), r.to.getTime()));
        out.push({ label: MONTHS[m] + " " + String(y).slice(2), from: f, to: t });
      });
    }
    return out;
  }
  const bucketKind = (r) => { const d = Math.round((r.to - r.from) / DAY) + 1; return d <= 14 ? "kunlik" : d <= 120 ? "haftalik" : "oylik"; };

  // ───────────────────────── umumiy kartalar ─────────────────────────
  function statCard(o) {
    return `<button class="an-stat${o.onclick ? "" : " an-static"}" ${o.onclick ? `onclick="${o.onclick}"` : "tabindex=-1"} style="--c:${o.color || "var(--accent)"}">
      <div class="an-stat-top"><span class="an-stat-ic">${ic(o.icon || "chart")}</span><span class="an-stat-l">${esc(o.label)}</span></div>
      <div class="an-stat-v">${o.value}</div>
      <div class="an-stat-s">${o.sub || "&nbsp;"}</div></button>`;
  }
  function activityWindows() {
    const a = state.activity30;
    if (!a || !a.byDay) return null;
    const now = new Date();
    const sumSince = (days) => {
      const from = ymd(sod(new Date(now.getTime() - (days - 1) * DAY)));
      return a.byDay.filter((d) => d.day >= from).reduce((s, d) => s + d.n, 0);
    };
    return { today: sumSince(1), week: sumSince(7), month: sumSince(30) };
  }
  async function loadActivity30() {
    const to = new Date(), from = new Date(to.getTime() - 30 * DAY);
    try { state.activity30 = await getJson("/api/admin/activity?limit=1&from=" + from.toISOString() + "&to=" + to.toISOString()); }
    catch (e) { state.activity30 = { error: e.message }; }
  }

  function renderOverview(c) {
    const ins = insights(c);
    const acc = state.accounts;
    const admins = acc && !acc.error ? (acc.admin ? acc.admin.total : 0) : null;
    const aw = activityWindows();
    const mon = state.monitor;
    const groupsActive = c.groups.filter((g) => !g.archived).length;
    const teachersWithGroups = c.teachers.filter((t) => t.activeGroups > 0).length;
    const archived = c.statusCount["Arxiv"] || 0;

    // 1. Statistika kartalari
    const cards = [
      statCard({ label: "Talabalar", icon: "users", value: c.students.length, sub: `aktiv ${c.activeStudents.length} · arxiv ${archived}`, onclick: "__AN.drill('students')" }),
      statCard({ label: "Yangi talabalar", icon: "user", value: c.newStudents.length, sub: `oldingi davr: ${c.prevNewStudents.length} ${deltaHtml(c.newStudents.length - c.prevNewStudents.length)}`, onclick: "__AN.drill('new')", color: "var(--teal)" }),
      statCard({ label: "Faol bo'lmagan", icon: "eye-off", value: c.inactive.length, sub: "holati yoki davomati bo'yicha", onclick: "__AN.drill('inactive')", color: "var(--amber)" }),
      statCard({ label: "O'qituvchilar", icon: "teacher", value: (D.mentors || []).length, sub: `guruhi bor: ${teachersWithGroups}`, onclick: "__AN.go('teachers')", color: "var(--purple)" }),
      statCard({ label: "Guruhlar (sinflar)", icon: "school", value: groupsActive, sub: `jami ${c.groups.length}, arxivda ${c.groups.length - groupsActive}`, onclick: "__AN.go('groups')", color: "var(--indigo)" }),
      statCard({ label: "Administratorlar", icon: "key", value: admins == null ? (acc && acc.error ? "—" : "…") : admins, sub: acc && acc.admin ? `30 kunda kirgan: ${acc.admin.loggedIn30d}` : acc && acc.error ? "server javob bermadi" : "yuklanmoqda", color: "var(--orange)" }),
      statCard({ label: "O'tilgan darslar", icon: "book-open", value: c.held.length, sub: `rejada ${c.plannedPast.length + c.plannedFuture.length} · belgilanmagan ${c.unmarked.length}`, onclick: "__AN.drill('lessons')", color: "var(--blue)" }),
      statCard({ label: "Davomat", icon: "check-circle", value: c.att.marked ? fmtP(c.att.pct) : NO_DATA, sub: c.att.marked ? `${c.att.marked} belgi ${deltaHtml(c.att.marked >= 10 && c.prevAtt.marked >= 10 ? delta(c.att.pct, c.prevAtt.pct) : null, " p.p.")}` : "davrda belgi yo'q", onclick: "__AN.drill('attendance')", color: pctCol(c.att.pct) }),
      statCard({ label: "O'rtacha baho", icon: "medal", value: c.avgGrade == null ? NO_DATA : fmtN(c.avgGrade), sub: c.G.length ? `${c.G.length} ta baho ${deltaHtml(c.G.length >= 3 && c.PG.length >= 3 ? delta(c.avgGrade, c.prevAvgGrade) : null)}` : "davrda baho yo'q", onclick: "__AN.go('groups')", color: "var(--amber)" }),
      statCard({ label: "Test natijalari", icon: "clipboard", value: c.avgTest == null ? NO_DATA : fmtP(c.avgTest), sub: c.T.length ? `${c.T.length} ta topshirish` : "davrda test topshirilmagan", color: "var(--teal)" }),
      statCard({ label: "Uy vazifalari", icon: "note", value: "Modul yo'q", sub: "CRM'da uy vazifasi yozuvlari saqlanmaydi", color: "var(--text3)" }),
      statCard({ label: "Tizim faolligi", icon: "zap", value: aw ? aw.today : "…", sub: aw ? `bugun · hafta ${aw.week} · oy ${aw.month} hodisa` : state.activity30 && state.activity30.error ? "jurnal o'qilmadi" : "yuklanmoqda", onclick: "__AN.go('activity')", color: "var(--indigo)" }),
      statCard({ label: "Tizim holati", icon: mon && mon.db && mon.db.ok ? "check-circle" : "alert", value: mon ? (mon.db && mon.db.ok ? "Ishlayapti" : "Muammo") : state.monitorErr ? "Javob yo'q" : "…", sub: mon ? `baza ${mon.db && mon.db.ok ? mon.db.pingMs + " ms" : "ulanmagan"} · 24 soatda xato: ${mon.serverErrors24h ?? "—"}` : "", onclick: "__AN.go('monitor')", color: mon && mon.db && mon.db.ok ? "var(--teal)" : "#dc2626" }),
    ].join("");

    // 2. Talabalar soni (oxirgi 12 oy)
    const months = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) months.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
    const joinDates = c.students.map((s) => parseDate(s.joinDate));
    const unknownJoin = joinDates.filter((d) => !d).length;
    const cum = months.map((m) => joinDates.filter((d) => d && d <= eod(new Date(m.getFullYear(), m.getMonth() + 1, 0))).length);
    const newPer = months.map((m) => joinDates.filter((d) => d && d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth()).length);
    const growth = chartCard("Talabalar soni — vaqt bo'yicha", {
      period: "Oxirgi 12 oy", unit: "talaba", source: "talabaning qo'shilgan sanasi",
    }, lineChart(months.map((m) => MONTHS[m.getMonth()] + " " + String(m.getFullYear()).slice(2)), [
      { name: "Jami (qo'shilgan sana bo'yicha)", values: cum },
      { name: "Shu oyda qo'shilgan", values: newPer, color: "var(--teal)" },
    ], { unit: " ta", wide: true }) + `<div class="an-note">${unknownJoin ? unknownJoin + " ta talabada qo'shilgan sana yo'q — grafikka kirmadi. " : ""}Ketgan sana saqlanmagani uchun arxivdagi talabalar ham jami ichida.</div>`);

    // 3. Davomat va baholar grafiklari
    const B = buckets(c.r);
    const attVals = B.map((b) => {
      const ls = c.L.filter((x) => x.date && x.date >= b.from && x.date <= b.to);
      const a = attAgg(ls);
      return a.marked ? a.pct : null;
    });
    const gVals = B.map((b) => avg(c.G.filter((g) => g.date && g.date >= b.from && g.date <= b.to).map((g) => g.score)));
    const tVals = B.map((b) => avg(c.T.filter((t) => t.date && t.date >= b.from && t.date <= b.to).map((t) => t.score)));
    const attChart = chartCard("Davomat dinamikasi", { period: c.r.label + " · " + bucketKind(c.r), unit: "% (K / (K+Y+S))", source: "davomat jadvali" },
      lineChart(B.map((b) => b.label), [{ name: "Davomat", values: attVals, color: "var(--teal)" }], { max: 100, unit: "%" }) +
      (c.undated.length ? `<div class="an-note">${c.undated.length} ta sanasi noma'lum dars grafikka kirmadi (umumiy foizda hisobga olingan).</div>` : ""));
    const gradeChart = chartCard("Baholar va testlar", { period: c.r.label + " · " + bucketKind(c.r), unit: "ball (0–100)", source: "baholar jurnali, test natijalari" },
      lineChart(B.map((b) => b.label), [{ name: "O'rtacha baho", values: gVals, color: "var(--amber)" }, { name: "Test natijasi", values: tVals, color: "var(--purple)" }], { max: 100 }) +
      `<div class="an-note">Uy vazifalari grafigi yo'q: CRM'da uy vazifasi moduli mavjud emas.</div>`);

    // 4. O'qituvchilar reytingi (qisqa)
    const ranked = c.teachers.filter((t) => t.score != null).sort((a, b) => b.score - a.score).slice(0, 5);
    const teachersCard = chartCard("O'qituvchilar reytingi", { period: c.r.label, unit: "umumiy ball (0–100)", source: "davomat, darslar, baholar", action: `<button class="an-link" onclick="__AN.go('teachers')">Barchasi ${ic("chevron-right")}</button>` },
      barList(ranked.map((t) => ({ label: t.name, value: t.score, text: fmtN(t.score) + (t.confidence === "low" ? " *" : ""), color: "var(--purple)", onclick: `__AN.teacher('${esc(t.m.id)}')` })), { max: 100, empty: "Reyting uchun ma'lumot yetarli emas" }) +
      `<div class="an-note">* taxminiy — ma'lumot kam. Mezonlar va og'irliklarni "O'qituvchilar" bo'limida sozlash mumkin.</div>`);

    // 5. Guruhlarni taqqoslash
    const cmpGroups = c.groups.filter((g) => !g.archived && g.att.marked >= 5).sort((a, b) => (b.att.pct || 0) - (a.att.pct || 0)).slice(0, 10);
    const groupsCard = chartCard("Guruhlarni taqqoslash — davomat", { period: c.r.label, unit: "%", source: "davomat jadvali", action: `<button class="an-link" onclick="__AN.go('groups')">Batafsil ${ic("chevron-right")}</button>` },
      barList(cmpGroups.map((g) => ({ label: g.name, value: g.att.pct, text: fmtP(g.att.pct) + (g.avgGrade != null ? " · baho " + fmtN(g.avgGrade) : ""), color: pctCol(g.att.pct), onclick: `__AN.group('${esc(g.gid)}')` })), { max: 100, empty: "Davrda 5 tadan ortiq belgisi bor guruh yo'q" }));

    // 6. Ogohlantirishlar  7. Tavsiyalar
    const alerts = ins.filter((i) => i.level === "alert" || i.level === "warn");
    const warnEvents = state.activity && state.activity.events ? state.activity.events.filter((e) => e.severity !== "info").slice(0, 3) : [];
    const alertsCard = `<section class="an-card"><div class="an-card-h"><h3>${ic("alert")} Muhim ogohlantirishlar</h3></div>
      ${alerts.length || warnEvents.length ? alerts.slice(0, 5).map(insightRow).join("") + warnEvents.map((e) => `<div class="an-ins an-warn an-mini"><b>${esc(e.event)}</b> · ${fmtDT(e.at)} · ${esc(e.actor || e.ip || "")}</div>`).join("") : `<div class="an-empty ok">${ic("check-circle")} Hozircha muhim ogohlantirish yo'q</div>`}</section>`;
    const tips = ins.filter((i) => i.level === "info" || i.level === "good");
    const tipsCard = `<section class="an-card"><div class="an-card-h"><h3>${ic("sparkles")} Aqlli tavsiyalar</h3><button class="an-link" onclick="__AN.go('insights')">Barchasi (${ins.length}) ${ic("chevron-right")}</button></div>
      ${tips.length ? tips.slice(0, 4).map(insightRow).join("") : `<div class="an-empty">Tavsiya yo'q</div>`}</section>`;

    // 8. Administratorlar faoliyati
    const adminEv = state.activity && state.activity.events ? state.activity.events.filter((e) => e.role === "admin").slice(0, 8) : null;
    const adminCard = `<section class="an-card"><div class="an-card-h"><h3>${ic("clipboard")} Oxirgi administrator faoliyati</h3><button class="an-link" onclick="__AN.go('activity')">Jurnal ${ic("chevron-right")}</button></div>
      ${adminEv == null ? `<div class="an-empty">${state.activity && state.activity.error ? "Jurnal o'qilmadi: " + esc(state.activity.error) : "Yuklanmoqda…"}</div>` : adminEv.length ? `<div class="an-feed">${adminEv.map(feedRow).join("")}</div>` : `<div class="an-empty">Davrda administrator harakati yo'q</div>`}</section>`;

    // 9. Backend va baza holati
    const sysCard = `<section class="an-card"><div class="an-card-h"><h3>${ic("laptop")} Backend va ma'lumotlar bazasi</h3><button class="an-link" onclick="__AN.go('monitor')">Monitoring ${ic("chevron-right")}</button></div>${sysMini()}</section>`;

    // 10. Tezkor boshqaruv
    const quick = `<section class="an-card"><div class="an-card-h"><h3>${ic("zap")} Tezkor boshqaruv</h3></div><div class="an-quick">
      <button onclick="__AN.quick('student')">${ic("plus")} Talaba qo'shish</button>
      <button onclick="__AN.quick('group')">${ic("plus")} Guruh qo'shish</button>
      <button onclick="__AN.quick('groups')">${ic("calendar")} Davomat</button>
      <button onclick="__AN.go('reports')">${ic("download")} Hisobot yuklash</button>
      <button onclick="__AN.go('insights')">${ic("sparkles")} Tavsiyalar</button>
      <button onclick="__AN.go('activity')">${ic("clipboard")} Faoliyat jurnali</button></div></section>`;

    return `<div class="an-stats">${cards}</div>
      ${growth}
      <div class="an-grid2">${attChart}${gradeChart}</div>
      <div class="an-grid2">${teachersCard}${groupsCard}</div>
      <div class="an-grid2">${alertsCard}${tipsCard}</div>
      <div class="an-grid2">${adminCard}${sysCard}</div>
      ${quick}`;
  }

  function sysMini() {
    const m = state.monitor;
    if (!m) return `<div class="an-empty">${state.monitorErr ? "Server javob bermadi: " + esc(state.monitorErr) : "Yuklanmoqda…"}</div>`;
    const r60 = m.requests.last60;
    return `<div class="an-kv">
      <div><span>Backend</span><b class="ok">Ishlayapti</b></div>
      <div><span>Ishlash vaqti</span><b>${dur(m.server.uptimeSec)}</b></div>
      <div><span>Baza</span><b class="${m.db.ok ? "ok" : "bad"}">${m.db.ok ? "Ulangan · " + m.db.pingMs + " ms" : "Ulanmagan"}</b></div>
      <div><span>So'rovlar (60 daq)</span><b>${r60.n} · xato ${r60.err}</b></div>
      <div><span>Javob vaqti p95</span><b>${m.requests.p95 == null ? "—" : m.requests.p95 + " ms"}</b></div>
      <div><span>Onlayn hozir</span><b>${m.online ? m.online.student + " talaba · " + m.online.mentor + " mentor" : "—"}</b></div>
      <div><span>Oxirgi ma'lumot yangilanishi</span><b>${m.lastDataUpdate ? fmtDT(m.lastDataUpdate) : "—"}</b></div>
    </div>`;
  }
  function dur(sec) {
    if (sec == null) return "—";
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
    return (d ? d + " kun " : "") + (h ? h + " soat " : "") + m + " daq";
  }
  const LEVEL = { alert: ["Tez e'tibor", "alert"], warn: ["Diqqat", "warn"], info: ["Ma'lumot", "info"], good: ["Ijobiy", "good"] };
  function insightRow(i) {
    return `<div class="an-ins an-${LEVEL[i.level][1]}"><div class="an-ins-h"><span class="an-badge">${LEVEL[i.level][0]}</span><b>${esc(i.title)}</b></div>
      <div class="an-ins-n">${esc(i.numbers)}</div></div>`;
  }
  const EVENT_UZ = {
    "auth.login.success": "Tizimga kirdi",
    "auth.logout": "Tizimdan chiqdi",
    "auth.login.failed": "Parol xato",
    "auth.login.unknown_user": "Noma'lum login",
    "data.change": "Ma'lumot o'zgartirdi",
    "settings.change": "Sozlamani o'zgartirdi",
    "report.export": "Hisobot eksport qildi",
    "admin.accounts.sync": "Login/parol saqladi",
    "admin.accounts.remove": "Hisobni o'chirdi",
    "admin.accounts.rename": "Loginni o'zgartirdi",
    "server.error": "Server xatosi",
    "server.start": "Server ishga tushdi",
  };
  function eventText(e) {
    let t = EVENT_UZ[e.event] || e.event;
    const m = e.meta || {};
    if (e.event === "data.change" && m.summary) t += ": " + m.summary;
    else if (e.event === "settings.change" && m.setting) t += ": " + m.setting;
    else if (e.event === "report.export" && m.report) t += ": " + m.report + " (" + (m.format || "") + ")";
    return t;
  }
  function feedRow(e) {
    return `<div class="an-feed-r"><span class="an-feed-t">${fmtDT(e.at)}</span><span class="an-feed-a">${esc(e.actor || "—")}</span><span class="an-feed-e">${esc(eventText(e))}</span></div>`;
  }

  // ───────────────────────── o'qituvchilar ─────────────────────────
  const SORTS = {
    score: ["Umumiy ball", (t) => t.score],
    attendance: ["Eng yuqori davomat", (t) => t.metrics.attendance],
    held: ["Eng ko'p o'tilgan dars", (t) => t.held],
    grading: ["Baholash faolligi", (t) => t.gradesPerStudent],
    trend: ["Natijasi eng ko'p yaxshilangan", (t) => t.trend],
    stability: ["Eng barqaror", (t) => t.metrics.stability],
  };
  const CONF = { high: ["Ishonchli", "good"], low: ["Taxminiy", "warn"], none: [NO_DATA, "muted"] };
  function renderTeachers(c) {
    const getter = SORTS[state.teacherSort][1];
    const list = c.teachers.slice().sort((a, b) => {
      const va = getter(a), vb = getter(b);
      if (va == null && vb == null) return a.name.localeCompare(b.name);
      if (va == null) return 1;
      if (vb == null) return -1;
      return vb - va;
    });
    const wsum = CRITERIA.reduce((s, k) => s + (Number(state.weights[k.key]) || 0), 0);
    const weights = `<section class="an-card"><div class="an-card-h"><h3>${ic("settings")} Reyting mezonlari va og'irliklari</h3><button class="an-link" onclick="__AN.resetWeights()">Standart</button></div>
      <div class="an-weights">${CRITERIA.map((k) => `<label class="an-w"><div class="an-w-h"><b>${k.label}</b><span>${Math.round(((Number(state.weights[k.key]) || 0) / (wsum || 1)) * 100)}%</span></div>
        <input type="range" min="0" max="50" step="5" value="${Number(state.weights[k.key]) || 0}" oninput="__AN.weight('${k.key}', this.value)">
        <small>${k.desc}</small></label>`).join("")}</div>
      <div class="an-note">Reyting bitta ko'rsatkichga emas, bir nechta mezonning og'irlikli o'rtachasiga asoslanadi. Mezon bo'yicha ma'lumot yetishmasa, u tashlab ketiladi. Kamida 10 ta davomat belgisi va 2 ta mezon bo'lmasa, o'qituvchi reytingga kiritilmaydi. Yuklama (guruh, talaba soni) alohida ko'rsatiladi — kichik guruhli mentor ham adolatli baholanadi. Uy vazifasini tekshirish tezligi o'lchanmaydi: CRM'da uy vazifasi moduli yo'q.</div></section>`;
    const sortSel = `<select class="an-sel" onchange="__AN.sort(this.value)">${Object.keys(SORTS).map((k) => `<option value="${k}" ${k === state.teacherSort ? "selected" : ""}>${SORTS[k][0]}</option>`).join("")}</select>`;
    let rank = 0;
    const rows = list.map((t) => {
      const v = getter(t);
      if (v != null) rank++;
      const conf = CONF[t.confidence];
      return `<tr class="an-click" onclick="__AN.teacher('${esc(t.m.id)}')">
        <td>${v != null ? rank : "—"}</td>
        <td><b>${esc(t.name)}</b><div class="an-sub"><span class="an-pill ${conf[1]}">${conf[0]}</span></div></td>
        <td class="num"><b>${t.score == null ? "—" : fmtN(t.score)}</b></td>
        <td class="num">${t.activeGroups} / ${t.students}</td>
        <td class="num">${t.held}<div class="an-sub">rejada ${t.plannedPast}${t.plannedFuture ? " + " + t.plannedFuture : ""}</div></td>
        <td class="num">${fmtP(t.metrics.marking)}</td>
        <td class="num" style="color:${pctCol(t.att.pct)}">${t.att.marked ? fmtP(t.att.pct) : "—"}<div class="an-sub">${deltaHtml(t.attDelta, " p.p.")}</div></td>
        <td class="num">${t.avgGrade == null ? "—" : fmtN(t.avgGrade)}<div class="an-sub">${deltaHtml(t.trend)}</div></td>
        <td class="num">${t.gradesGiven}<div class="an-sub">${t.gradesPerStudent == null ? "" : fmtN(t.gradesPerStudent) + "/talaba"}</div></td>
        <td class="num">${fmtP(t.metrics.stability)}</td></tr>`;
    }).join("");
    return weights + `<section class="an-card"><div class="an-card-h"><h3>${ic("teacher")} O'qituvchilar faoliyati</h3>${sortSel}</div>
      <div class="an-meta"><span>${ic("calendar")} ${esc(c.r.label)}</span><span>Taqqoslash: ${esc(c.pr.label)}</span></div>
      <div class="an-tw"><table class="an-t"><thead><tr><th>#</th><th>O'qituvchi</th><th>Ball</th><th>Guruh / talaba</th><th>O'tilgan dars</th><th>O'z vaqtida belgilangan</th><th>Davomat</th><th>O'rtacha baho (o'zgarish)</th><th>Qo'ygan baholari</th><th>Barqarorlik</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="10" class="an-empty">O'qituvchi yo'q</td></tr>`}</tbody></table></div></section>`;
  }

  // ───────────────────────── guruhlar va talabalar ─────────────────────────
  function renderGroups(c) {
    const mentors = D.mentors || [];
    let list = c.groups.filter((g) => !g.archived || state.showArchived);
    if (state.teacherFilter) list = list.filter((g) => g.mentor && String(g.mentor.id) === state.teacherFilter);
    list.sort((a, b) => (b.att.pct ?? -1) - (a.att.pct ?? -1));
    const filters = `<div class="an-filters">
      <select class="an-sel" onchange="__AN.tfilter(this.value)"><option value="">Barcha o'qituvchilar</option>${mentors.map((m) => `<option value="${esc(m.id)}" ${String(m.id) === state.teacherFilter ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select>
      <label class="an-chk"><input type="checkbox" ${state.showArchived ? "checked" : ""} onchange="__AN.archived(this.checked)"> Arxivdagi guruhlar</label></div>`;
    const cmp = chartCard("Guruhlar: davomat va o'rtacha baho", { period: c.r.label, unit: "% / ball", source: "davomat jadvali, baholar jurnali" },
      `<div class="an-grid2 tight"><div><div class="an-sub-h">Davomat, %</div>${barList(list.filter((g) => g.att.marked).map((g) => ({ label: g.name, value: g.att.pct, text: fmtP(g.att.pct), color: pctCol(g.att.pct), onclick: `__AN.group('${esc(g.gid)}')` })), { max: 100 })}</div>
       <div><div class="an-sub-h">O'rtacha baho</div>${barList(list.filter((g) => g.avgGrade != null).sort((a, b) => b.avgGrade - a.avgGrade).map((g) => ({ label: g.name, value: g.avgGrade, text: fmtN(g.avgGrade) + " (" + g.gradeN + ")", color: "var(--amber)", onclick: `__AN.group('${esc(g.gid)}')` })), { max: 100 })}</div></div>`);
    const rows = list.map((g) => `<tr class="an-click" onclick="__AN.group('${esc(g.gid)}')">
      <td><b>${esc(g.name)}</b><div class="an-sub">${esc(g.course)}${g.archived ? " · arxiv" : ""}</div></td>
      <td>${esc(g.mentorName)}</td>
      <td class="num">${g.size}</td>
      <td class="num" style="color:${pctCol(g.att.pct)}">${g.att.marked ? fmtP(g.att.pct) : "—"}<div class="an-sub">${deltaHtml(g.attDelta, " p.p.")}</div></td>
      <td class="num">${g.avgGrade == null ? "—" : fmtN(g.avgGrade)}<div class="an-sub">${deltaHtml(g.gradeDelta)}</div></td>
      <td class="num">${g.avgTest == null ? "—" : fmtP(g.avgTest)}</td>
      <td class="num">${g.held}<div class="an-sub">${g.marking == null ? (g.noSchedule ? "jadval yo'q" : "") : fmtP(g.marking) + " o'z vaqtida"}</div></td>
      <td class="num">${g.needHelp.length ? `<span class="an-pill warn">${g.needHelp.length}</span>` : "—"}</td></tr>`).join("");
    return filters + cmp + `<section class="an-card"><div class="an-card-h"><h3>${ic("school")} Guruhlar bo'yicha</h3></div>
      <div class="an-meta"><span>${ic("calendar")} ${esc(c.r.label)}</span><span>O'zgarish: oldingi teng davrga nisbatan</span></div>
      <div class="an-tw"><table class="an-t"><thead><tr><th>Guruh</th><th>O'qituvchi</th><th>Talaba</th><th>Davomat</th><th>O'rtacha baho</th><th>Test</th><th>O'tilgan dars</th><th>Yordam kerak</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="8" class="an-empty">Guruh yo'q</td></tr>`}</tbody></table></div>
      <div class="an-note">"Yordam kerak" — davomati 60% dan past, o'rtacha bahosi 60 dan past yoki natijasi keskin tushgan talabalar. Bu jazo yoki yakuniy qaror uchun emas — o'qituvchiga kimga ko'proq e'tibor berish kerakligini ko'rsatadi.</div></section>
      <section class="an-card"><div class="an-card-h"><h3>Uy vazifalari</h3></div><div class="an-empty">CRM'da uy vazifalari moduli yo'q — berilgan va bajarilgan vazifalar statistikasi hisoblanmaydi. Modul qo'shilsa, bu yerda guruhlar bo'yicha bajarilish foizi chiqadi.</div></section>`;
  }

  /** Oxirgi n oy bo'yicha davomat (talaba/guruh profili uchun). */
  function monthlyAtt(n, filterL, filterSid) {
    const now = new Date();
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const f = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const r = { from: f, to: eod(new Date(f.getFullYear(), f.getMonth() + 1, 0)) };
      const ls = lessonsIn(r).filter(filterL);
      const a = attAgg(ls, filterSid);
      out.push({ label: MONTHS[f.getMonth()] + " " + String(f.getFullYear()).slice(2), pct: a.marked ? a.pct : null, marked: a.marked });
    }
    return out;
  }

  function groupModal(gid) {
    const c = state.lastCalc || calc();
    const g = c.groups.find((x) => x.gid === String(gid));
    if (!g) return;
    const ma = monthlyAtt(6, (x) => String(x.gid) === g.gid);
    const rows = g.members.slice().sort((a, b) => (b.att.pct ?? -1) - (a.att.pct ?? -1)).map((p) => `<tr class="an-click" onclick="__AN.student('${esc(p.sid)}')">
      <td>${esc(p.s.name)}</td><td class="num" style="color:${pctCol(p.att.pct)}">${p.att.marked ? fmtP(p.att.pct) : "—"}</td>
      <td class="num">${p.avgGrade == null ? "—" : fmtN(p.avgGrade)}</td><td class="num">${p.avgTest == null ? "—" : fmtP(p.avgTest)}</td>
      <td>${p.reasons.length ? `<span class="an-pill warn">${esc(p.reasons.join(", "))}</span>` : ""}</td></tr>`).join("");
    anModal(g.name + " — guruh tahlili", `
      <div class="an-kv">
        <div><span>O'qituvchi</span><b>${esc(g.mentorName)}</b></div><div><span>Kurs</span><b>${esc(g.course || "—")}</b></div>
        <div><span>Talabalar</span><b>${g.size}</b></div><div><span>Davomat</span><b>${g.att.marked ? fmtP(g.att.pct) : NO_DATA} ${deltaHtml(g.attDelta, " p.p.")}</b></div>
        <div><span>O'rtacha baho</span><b>${g.avgGrade == null ? NO_DATA : fmtN(g.avgGrade)} ${deltaHtml(g.gradeDelta)}</b></div>
        <div><span>O'tilgan / rejadagi dars</span><b>${g.held} / ${g.plannedPast}</b></div></div>
      <div class="an-sub-h">Davomat — oxirgi 6 oy, %</div>
      ${colChart(ma.map((m) => ({ label: m.label, value: m.pct, color: pctCol(m.pct), hint: m.marked + " belgi" })), { max: 100, unit: "%" })}
      <div class="an-grid2 tight">
        <div><div class="an-sub-h">${ic("trophy")} Eng faol talabalar</div>${g.top.length ? g.top.map((p) => `<div class="an-li">${esc(p.s.name)} — ${fmtP(p.att.pct)}${p.avgGrade != null ? ", baho " + fmtN(p.avgGrade) : ""}</div>`).join("") : `<div class="an-empty">${NO_DATA}</div>`}</div>
        <div><div class="an-sub-h">${ic("hand")} Qo'shimcha e'tibor kerak</div>${g.needHelp.length ? g.needHelp.map((p) => `<div class="an-li">${esc(p.s.name)} — ${esc(p.reasons.join(", "))}</div>`).join("") : `<div class="an-empty ok">Yo'q</div>`}</div></div>
      <div class="an-sub-h">Talabalar (${esc(state.lastCalc ? state.lastCalc.r.label : "")})</div>
      <div class="an-tw"><table class="an-t"><thead><tr><th>Talaba</th><th>Davomat</th><th>Baho</th><th>Test</th><th>Izoh</th></tr></thead><tbody>${rows || `<tr><td colspan="5" class="an-empty">Talaba yo'q</td></tr>`}</tbody></table></div>`);
  }

  function studentModal(sid) {
    const s = (D.students || []).find((x) => String(x.id) === String(sid));
    if (!s) return;
    const g = groupById(s.groupId);
    const ma = monthlyAtt(6, () => true, (x) => x === String(sid));
    const grades = allGrades().filter((x) => x.sid === String(sid)).sort((a, b) => (b.date || 0) - (a.date || 0));
    const tests = allTestResults().filter((x) => x.sid === String(sid)).sort((a, b) => (b.date || 0) - (a.date || 0));
    const gm = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const f = new Date(now.getFullYear(), now.getMonth() - i, 1);
      gm.push({ label: MONTHS[f.getMonth()], value: avg(grades.filter((x) => x.date && x.date.getFullYear() === f.getFullYear() && x.date.getMonth() === f.getMonth()).map((x) => x.score)) });
    }
    anModal(s.name + " — o'quv dinamikasi", `
      <div class="an-kv"><div><span>Guruh</span><b>${esc(g ? g.name : "—")}</b></div><div><span>Holati</span><b>${esc(s.status || "Aktiv")}</b></div>
        <div><span>Qo'shilgan</span><b>${fmtD(parseDate(s.joinDate))}</b></div><div><span>Baholar soni</span><b>${grades.length}</b></div></div>
      <div class="an-grid2 tight">
        <div><div class="an-sub-h">Davomat — 6 oy, %</div>${colChart(ma.map((m) => ({ label: m.label, value: m.pct, color: pctCol(m.pct), hint: m.marked + " belgi" })), { max: 100, unit: "%" })}</div>
        <div><div class="an-sub-h">O'rtacha baho — 6 oy</div>${colChart(gm.map((m) => ({ label: m.label, value: m.value, color: "var(--amber)" })), { max: 100 })}</div></div>
      <div class="an-grid2 tight">
        <div><div class="an-sub-h">Baholar tarixi</div>${grades.length ? `<div class="an-list">${grades.slice(0, 30).map((x) => `<div class="an-li"><b>${fmtN(x.score)}</b> · ${fmtD(x.date)}${x.mentor ? " · " + esc(x.mentor) : ""}</div>`).join("")}</div>` : `<div class="an-empty">Baho yo'q</div>`}</div>
        <div><div class="an-sub-h">Testlar</div>${tests.length ? `<div class="an-list">${tests.map((x) => `<div class="an-li"><b>${fmtP(x.score)}</b> · ${esc(x.title)} · ${fmtD(x.date)}</div>`).join("")}</div>` : `<div class="an-empty">Test topshirmagan</div>`}</div></div>
      <div class="an-note">Uy vazifalari tarixi yo'q — CRM'da bu modul mavjud emas. Telefon va ota-ona ma'lumotlari bu oynada ko'rsatilmaydi.</div>`);
  }

  function teacherModal(id) {
    const c = state.lastCalc || calc();
    const t = c.teachers.find((x) => String(x.m.id) === String(id));
    if (!t) return;
    const gs = c.groups.filter((g) => g.mentor && String(g.mentor.id) === String(id));
    anModal(t.name + " — o'qituvchi tahlili", `
      <div class="an-kv"><div><span>Umumiy ball</span><b>${t.score == null ? NO_DATA : fmtN(t.score)}</b></div><div><span>Ishonchlilik</span><b>${CONF[t.confidence][0]} (${t.sample} ta belgi, ${t.criteriaUsed} mezon)</b></div>
        <div><span>Guruh / talaba</span><b>${t.activeGroups} / ${t.students}</b></div><div><span>O'tilgan dars</span><b>${t.held} (rejada ${t.plannedPast})</b></div></div>
      <div class="an-sub-h">Mezonlar bo'yicha (0–100)</div>
      ${barList(CRITERIA.map((k) => ({ label: k.label, value: t.metrics[k.key], text: t.metrics[k.key] == null ? NO_DATA : fmtN(t.metrics[k.key]), color: "var(--purple)" })), { max: 100 })}
      <div class="an-sub-h">Guruhlari</div>
      <div class="an-tw"><table class="an-t"><thead><tr><th>Guruh</th><th>Talaba</th><th>Davomat</th><th>Baho</th><th>Dars</th></tr></thead><tbody>
      ${gs.map((g) => `<tr class="an-click" onclick="__AN.group('${esc(g.gid)}')"><td>${esc(g.name)}${g.archived ? " (arxiv)" : ""}</td><td class="num">${g.size}</td><td class="num">${g.att.marked ? fmtP(g.att.pct) : "—"}</td><td class="num">${g.avgGrade == null ? "—" : fmtN(g.avgGrade)}</td><td class="num">${g.held}/${g.plannedPast}</td></tr>`).join("") || `<tr><td colspan="5" class="an-empty">Guruh yo'q</td></tr>`}
      </tbody></table></div>`);
  }

  function drillModal(kind) {
    const c = state.lastCalc || calc();
    const stu = (list, extra) => `<div class="an-tw"><table class="an-t"><thead><tr><th>Talaba</th><th>Guruh</th><th>Holati</th><th>${extra ? extra[0] : "Qo'shilgan"}</th></tr></thead><tbody>${list.map((s) => `<tr class="an-click" onclick="__AN.student('${esc(s.id)}')"><td>${esc(s.name)}</td><td>${esc((groupById(s.groupId) || {}).name || "—")}</td><td>${esc(s.status || "Aktiv")}</td><td>${extra ? extra[1](s) : fmtD(parseDate(s.joinDate))}</td></tr>`).join("") || `<tr><td colspan="4" class="an-empty">Yo'q</td></tr>`}</tbody></table></div>`;
    if (kind === "students") {
      anModal("Talabalar — holati bo'yicha", barList(Object.keys(c.statusCount).map((k) => ({ label: k, value: c.statusCount[k] }))) + stu(c.students));
    } else if (kind === "new") {
      anModal("Yangi talabalar — " + c.r.label, `<div class="an-note">Formula: qo'shilgan sanasi davr ichida bo'lgan talabalar.</div>` + stu(c.newStudents));
    } else if (kind === "inactive") {
      anModal("Faol bo'lmagan talabalar", `<div class="an-note">Holati "Faolsiz"/"Muzlatilgan" yoki aktiv bo'lsa-yu davrda kamida 3 ta darsga belgilanib, bittasiga ham kelmagan talabalar.</div>` +
        stu(c.inactive, ["Sabab", (s) => (s.status === "Faolsiz" || s.status === "Muzlatilgan" ? "holati: " + esc(s.status) : "davrda 0% davomat")]));
    } else if (kind === "lessons") {
      anModal("Darslar — " + c.r.label, `<div class="an-note">O'tilgan = kamida bitta talabaga davomat belgilangan dars. Rejadagi = guruh jadvali (dars kunlari) bo'yicha davrga tushgan darslar. Belgilanmagan = sanasi o'tgan, lekin belgisi yo'q.</div>
        <div class="an-tw"><table class="an-t"><thead><tr><th>Guruh</th><th>O'tilgan</th><th>Rejada (o'tgan)</th><th>Rejada (kelgusi)</th><th>Belgilanmagan</th></tr></thead><tbody>
        ${c.groups.filter((g) => g.held || g.plannedPast).map((g) => `<tr class="an-click" onclick="__AN.group('${esc(g.gid)}')"><td>${esc(g.name)}</td><td class="num">${g.held}</td><td class="num">${g.plannedPast}</td><td class="num">${c.plannedFuture.filter((x) => String(x.gid) === g.gid).length}</td><td class="num">${g.unmarked || "—"}</td></tr>`).join("") || `<tr><td colspan="5" class="an-empty">${NO_DATA}</td></tr>`}</tbody></table></div>`);
    } else if (kind === "attendance") {
      anModal("Davomat — " + c.r.label, `<div class="an-kv"><div><span>Keldi (K)</span><b>${c.att.K}</b></div><div><span>Yo'q (Y)</span><b>${c.att.Y}</b></div><div><span>Sababli (S)</span><b>${c.att.S}</b></div><div><span>Davomat</span><b>${fmtP(c.att.pct)}</b></div></div>
        <div class="an-note">Formula: K / (K + Y + S) × 100. Sababli ham darsda qatnashmagan deb sanaladi.</div>` +
        barList(c.groups.filter((g) => g.att.marked).sort((a, b) => b.att.pct - a.att.pct).map((g) => ({ label: g.name, value: g.att.pct, text: fmtP(g.att.pct) + " (" + g.att.marked + ")", color: pctCol(g.att.pct), onclick: `__AN.group('${esc(g.gid)}')` })), { max: 100 }));
    }
  }

  // ───────────────────────── modal ─────────────────────────
  function anModal(title, body) {
    closeModal();
    const el = document.createElement("div");
    el.id = "an-modal";
    el.className = "an-modal";
    el.innerHTML = `<div class="an-modal-box" role="dialog" aria-modal="true"><div class="an-modal-h"><h3>${esc(title)}</h3><button class="an-x" onclick="__AN.close()" aria-label="Yopish">${ic("x")}</button></div><div class="an-modal-b">${body}</div></div>`;
    el.addEventListener("click", (e) => { if (e.target === el) closeModal(); });
    document.body.appendChild(el);
  }
  function closeModal() { const m = document.getElementById("an-modal"); if (m) m.remove(); }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  // ───────────────────────── tavsiyalar bo'limi ─────────────────────────
  function renderInsights(c) {
    const ins = insights(c);
    const f = state.insFilter || "";
    const list = f ? ins.filter((i) => i.level === f) : ins;
    const counts = { alert: 0, warn: 0, info: 0, good: 0 };
    ins.forEach((i) => counts[i.level]++);
    const chips = [["", "Barchasi", ins.length], ["alert", "Tez e'tibor", counts.alert], ["warn", "Diqqat", counts.warn], ["info", "Ma'lumot", counts.info], ["good", "Ijobiy", counts.good]]
      .map(([k, l, n]) => `<button class="an-chip ${f === k ? "on" : ""}" onclick="__AN.insFilter('${k}')">${l} <span>${n}</span></button>`).join("");
    return `<section class="an-card"><div class="an-card-h"><h3>${ic("sparkles")} Aqlli tavsiyalar</h3></div>
      <div class="an-note">Tavsiyalar mavjud statistikadan qat'iy qoidalar asosida chiqariladi (sun'iy intellekt ulanmagan). Har birida raqamlar, davr va sabab ko'rsatilgan. Monitoring va jurnal yuklangach, tizimga oid tavsiyalar ham qo'shiladi.</div>
      <div class="an-chips">${chips}</div></section>
      ${list.length ? list.map((i) => `<section class="an-card an-ins-card an-${LEVEL[i.level][1]}">
        <div class="an-ins-h"><span class="an-badge">${LEVEL[i.level][0]}</span><b>${esc(i.title)}</b></div>
        <dl class="an-dl5">
          <dt>Kuzatuv</dt><dd>${esc(i.title)}</dd>
          <dt>Raqamlar</dt><dd>${esc(i.numbers)}</dd>
          <dt>Davr</dt><dd>${esc(i.period)}</dd>
          <dt>Sabab</dt><dd>${esc(i.reason)}</dd>
          <dt>Keyingi qadam</dt><dd>${esc(i.next)}</dd>
        </dl>${i.tab ? `<button class="an-link" onclick="__AN.go('${i.tab}')">Batafsil ${ic("chevron-right")}</button>` : ""}</section>`).join("") : `<section class="an-card"><div class="an-empty ok">${ic("check-circle")} Bu toifada tavsiya yo'q</div></section>`}`;
  }

  // ───────────────────────── monitoring ─────────────────────────
  function renderMonitor() {
    const m = state.monitor;
    const intervals = [[0, "O'chiq"], [15, "15 s"], [30, "30 s"], [60, "1 daq"], [300, "5 daq"]];
    const bar = `<div class="an-filters"><span class="an-sub">Avtomatik yangilash:</span>
      <select class="an-sel" onchange="__AN.poll(this.value)">${intervals.map(([v, l]) => `<option value="${v}" ${Number(state.pollSec) === v ? "selected" : ""}>${l}</option>`).join("")}</select>
      <button class="an-btn" onclick="__AN.refreshMonitor()">${ic("refresh")} Yangilash</button>
      <span class="an-sub">${m ? "Oxirgi: " + fmtDT(m.now) : ""}</span></div>`;
    if (!m) return bar + `<section class="an-card"><div class="an-empty">${state.monitorErr ? "Server javob bermadi: " + esc(state.monitorErr) : "Yuklanmoqda…"}</div></section>`;
    const rq = m.requests;
    const er60 = rq.last60.n ? pct(rq.last60.err, rq.last60.n) : null;
    const sess = m.sessions || {};
    const sessTxt = ["admin", "mentor", "student"].map((r) => (sess[r] ? sess[r].users : 0)).join(" / ");
    const tiles = [
      statCard({ label: "Backend", icon: "laptop", value: "Ishlayapti", sub: "ishlash vaqti " + dur(m.server.uptimeSec), color: "var(--teal)" }),
      statCard({ label: "Ma'lumotlar bazasi", icon: m.db.ok ? "check-circle" : "x-circle", value: m.db.ok ? m.db.pingMs + " ms" : "Ulanmagan", sub: m.db.ok ? "ping javob vaqti" : esc(m.db.error || ""), color: m.db.ok ? (m.db.pingMs > 500 ? "var(--amber)" : "var(--teal)") : "#dc2626" }),
      statCard({ label: "Faol foydalanuvchilar", icon: "users", value: (m.online ? m.online.student + m.online.mentor : 0), sub: "hozir onlayn · sessiyalar (30 daq) admin/mentor/talaba: " + sessTxt, color: "var(--accent)" }),
      statCard({ label: "So'rovlar", icon: "zap", value: rq.lastMinute.n + "/daq", sub: `15 daq: ${rq.last15.n} · 60 daq: ${rq.last60.n}`, color: "var(--indigo)" }),
      statCard({ label: "Xatolar (5xx)", icon: "alert", value: rq.last60.err, sub: "oxirgi 60 daq " + (er60 == null ? "" : "· " + fmtP(er60)) + " · 24 soat jurnalda: " + (m.serverErrors24h ?? "—"), color: rq.last60.err ? "#dc2626" : "var(--teal)" }),
      statCard({ label: "Javob vaqti", icon: "clock", value: rq.p50 == null ? "—" : rq.p50 + " ms", sub: "median · p95: " + (rq.p95 == null ? "—" : rq.p95 + " ms") + " (" + rq.sampleSize + " so'rov)", color: rq.p95 > 1500 ? "var(--amber)" : "var(--teal)" }),
      statCard({ label: "Server resurslari", icon: "settings", value: m.server.memoryMb + " MB", sub: `heap ${m.server.heapMb} MB · yuklama ${m.server.load1} (${m.server.cpus} CPU)`, color: "var(--purple)" }),
      statCard({ label: "Oxirgi yangilanish", icon: "save", value: m.lastDataUpdate ? fmtDT(m.lastDataUpdate) : "—", sub: "CRM ma'lumoti · zaxira: " + (m.lastBackup ? fmtDT(m.lastBackup) : "—"), color: "var(--blue)" }),
    ].join("");
    const series = rq.series;
    const labels = series.map((s) => { const d = new Date(s.t); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); });
    const chart = chartCard("So'rovlar va xatolar — daqiqa bo'yicha", { period: "Oxirgi 60 daqiqa", unit: "so'rov / daqiqa", source: "server xotirasidagi hisoblagich (" + fmtDT(rq.since) + " dan beri)" },
      lineChart(labels, [{ name: "So'rovlar", values: series.map((s) => s.n) }, { name: "5xx xatolar", values: series.map((s) => s.err), color: "#dc2626" }]));
    const latChart = chartCard("O'rtacha javob vaqti", { period: "Oxirgi 60 daqiqa", unit: "ms", source: "server xotirasidagi hisoblagich" },
      lineChart(labels, [{ name: "O'rtacha", values: series.map((s) => s.avgMs), color: "var(--purple)" }], { unit: " ms" }));
    const epRow = (e) => `<tr><td><code>${esc(e.key)}</code></td><td class="num">${e.n}</td><td class="num">${e.e4 || "—"}</td><td class="num" style="color:${e.e5 ? "#dc2626" : ""}">${e.e5 || "—"}</td><td class="num">${e.avgMs == null ? "—" : e.avgMs + " ms"}</td><td class="num">${e.maxMs} ms</td></tr>`;
    const epHead = `<thead><tr><th>Endpoint</th><th>So'rov</th><th>4xx</th><th>5xx</th><th>O'rtacha</th><th>Eng sekin</th></tr></thead>`;
    const counts = m.db.counts || {};
    return bar + `<div class="an-stats">${tiles}</div>
      <div class="an-grid2">${chart}${latChart}</div>
      <section class="an-card"><div class="an-card-h"><h3>${ic("alert")} Ko'p xato qaytarayotgan endpointlar</h3></div><div class="an-meta"><span>Server ishga tushgandan beri (${fmtDT(rq.since)})</span><span>401/404 xato hisoblanmaydi</span></div>
        <div class="an-tw"><table class="an-t">${epHead}<tbody>${rq.topByErrors.map(epRow).join("") || `<tr><td colspan="6" class="an-empty ok">Xato yo'q</td></tr>`}</tbody></table></div></section>
      <div class="an-grid2">
        <section class="an-card"><div class="an-card-h"><h3>Oxirgi xatolar</h3></div>
          <div class="an-tw"><table class="an-t"><thead><tr><th>Vaqt</th><th>So'rov</th><th>Holat</th><th>ms</th></tr></thead><tbody>${rq.recentErrors.map((e) => `<tr><td>${fmtDT(e.at)}</td><td><code>${esc(e.method + " " + e.path)}</code></td><td class="num">${e.status}</td><td class="num">${e.ms}</td></tr>`).join("") || `<tr><td colspan="4" class="an-empty ok">Xato yo'q</td></tr>`}</tbody></table></div></section>
        <section class="an-card"><div class="an-card-h"><h3>Eng ko'p chaqirilgan endpointlar</h3></div>
          <div class="an-tw"><table class="an-t">${epHead}<tbody>${rq.topByCount.map(epRow).join("")}</tbody></table></div></section></div>
      <section class="an-card"><div class="an-card-h"><h3>${ic("folder")} Ma'lumotlar bazasi</h3></div>
        <div class="an-kv">${Object.keys(counts).map((k) => `<div><span>${esc(k)}</span><b>${counts[k]} yozuv</b></div>`).join("")}<div><span>Node.js</span><b>${esc(m.server.node)}</b></div><div><span>Server ishga tushgan</span><b>${fmtDT(m.server.startedAt)}</b></div></div>
        <div class="an-note">So'rov hisoblagichlari server xotirasida turadi va server qayta ishga tushganda noldan boshlanadi (bazaga ortiqcha yuk tushmasligi uchun). Server xatolari esa jurnalda saqlanadi. Monitoring faqat shu bo'lim ochiq va brauzer oynasi ko'rinib turganda yangilanadi.</div></section>`;
  }

  // ───────────────────────── faoliyat jurnali ─────────────────────────
  const CATS = [
    ["", "Barcha hodisalar"], ["auth.login.success", "Kirish"], ["auth.logout", "Chiqish"], ["auth.login", "Kirish urinishlari (hammasi)"],
    ["data.change", "Ma'lumot o'zgarishi"], ["settings.", "Sozlamalar"], ["admin.", "Hisoblar (login/parol)"], ["report.", "Eksport"],
    ["server.error", "Server xatosi"], ["auth.device", "Qurilma bloki"],
  ];
  function renderActivity(c) {
    const a = state.activity;
    const q = state.activityQ;
    const filters = `<div class="an-filters">
      <select class="an-sel" onchange="__AN.aq('event', this.value)">${CATS.map(([k, l]) => `<option value="${k}" ${q.event === k ? "selected" : ""}>${l}</option>`).join("")}</select>
      <input class="an-in" placeholder="Foydalanuvchi logini" value="${esc(q.actor)}" onchange="__AN.aq('actor', this.value)">
      <select class="an-sel" onchange="__AN.aq('severity', this.value)"><option value="">Har qanday daraja</option><option value="warn" ${q.severity === "warn" ? "selected" : ""}>Ogohlantirish</option><option value="critical" ${q.severity === "critical" ? "selected" : ""}>Jiddiy</option><option value="info" ${q.severity === "info" ? "selected" : ""}>Oddiy</option></select></div>`;
    if (!a) return filters + `<section class="an-card"><div class="an-empty">Yuklanmoqda…</div></section>`;
    if (a.error) return filters + `<section class="an-card"><div class="an-empty">Jurnal o'qilmadi: ${esc(a.error)}</div></section>`;
    const days = buckets(c.r);
    const byDay = new Map(a.byDay.map((d) => [d.day, d]));
    const dayVals = days.map((b) => { let n = 0, w = 0; for (let t = b.from.getTime(); t <= b.to.getTime(); t += DAY) { const d = byDay.get(ymd(new Date(t))); if (d) { n += d.n; w += d.warn; } } return [n, w]; });
    const chart = chartCard("Faollik — vaqt bo'yicha", { period: c.r.label + " · " + bucketKind(c.r), unit: "hodisa", source: "xavfsizlik jurnali (security_audit)" },
      lineChart(days.map((b) => b.label), [{ name: "Barcha hodisalar", values: dayVals.map((v) => v[0]) }, { name: "Ogohlantirishlar", values: dayVals.map((v) => v[1]), color: "#dc2626" }]));
    const cats = chartCard("Hodisa turlari", { period: c.r.label, unit: "hodisa", source: "xavfsizlik jurnali" },
      barList(Object.keys(a.categories).sort((x, y) => a.categories[y] - a.categories[x]).map((k) => ({ label: k, value: a.categories[k] }))));
    const actors = chartCard("Eng faol foydalanuvchilar", { period: c.r.label, unit: "hodisa", source: "xavfsizlik jurnali" },
      barList(a.byActor.map((x) => ({ label: x.name + (x.role ? " (" + x.role + ")" : ""), value: x.n, text: x.n + " · " + fmtDT(x.last) }))));
    const pages = Math.max(1, Math.ceil(a.total / a.limit));
    const rows = a.events.map((e) => `<tr class="${e.severity !== "info" ? "an-row-warn" : ""}"><td>${fmtDT(e.at)}</td><td>${esc(e.actor || "—")}<div class="an-sub">${esc(e.role || "")}</div></td>
      <td><span class="an-pill ${e.severity !== "info" ? "warn" : ""}">${esc(e.category)}</span></td><td>${esc(eventText(e))}</td><td class="an-sub">${esc(e.ip || "")}</td></tr>`).join("");
    return filters + `<div class="an-grid2">${chart}${cats}</div>${actors}
      <section class="an-card"><div class="an-card-h"><h3>${ic("clipboard")} Hodisalar (${a.total})</h3>
        <div class="an-pager"><button class="an-btn" ${a.page <= 1 ? "disabled" : ""} onclick="__AN.apage(-1)">${ic("chevron-left")}</button><span>${a.page} / ${pages}</span><button class="an-btn" ${a.page >= pages ? "disabled" : ""} onclick="__AN.apage(1)">${ic("chevron-right")}</button></div></div>
        <div class="an-tw"><table class="an-t"><thead><tr><th>Vaqt</th><th>Kim</th><th>Turi</th><th>Nima qildi</th><th>IP</th></tr></thead><tbody>${rows || `<tr><td colspan="5" class="an-empty">Hodisa yo'q</td></tr>`}</tbody></table></div>
        <div class="an-note">Jurnalga parol, token va boshqa maxfiy ma'lumotlar yozilmaydi. Ma'lumot o'zgarishida faqat bo'lim, yozuv nomi va soni saqlanadi. Sessiya muddati tugab chiqib ketishlar "Chiqish" sifatida qayd etilmaydi — faqat "Chiqish" tugmasi bosilganda.</div></section>`;
  }

  // ───────────────────────── hisobotlar va eksport ─────────────────────────
  const REPORTS = {
    teachers: "O'qituvchilar faoliyati",
    groups: "Guruhlar natijalari",
    attendance: "Davomat (talabalar bo'yicha)",
    grades: "Baholar va testlar",
    admins: "Administratorlar faoliyati",
    system: "CRM ishlash holati",
    monthly: "Umumiy hisobot (davr bo'yicha)",
  };
  async function buildReport(kind) {
    const c = state.lastCalc || calc();
    const gf = state.groupFilter, tf = state.teacherFilter;
    let groups = c.groups;
    if (gf) groups = groups.filter((g) => g.gid === gf);
    if (tf) groups = groups.filter((g) => g.mentor && String(g.mentor.id) === tf);
    const rep = { title: REPORTS[kind], period: c.r.label, columns: [], rows: [], method: "" };
    if (kind === "teachers") {
      let ts = c.teachers;
      if (tf) ts = ts.filter((t) => String(t.m.id) === tf);
      rep.columns = ["O'qituvchi", "Umumiy ball", "Ishonchlilik", "Faol guruh", "Talaba", "O'tilgan dars", "Rejadagi (o'tgan)", "O'z vaqtida belgilangan %", "Davomat %", "Davomat o'zgarishi (p.p.)", "O'rtacha baho", "Baho o'zgarishi", "Qo'ygan baholari", "Barqarorlik %"];
      rep.rows = ts.map((t) => [t.name, t.score, CONF[t.confidence][0], t.activeGroups, t.students, t.held, t.plannedPast, t.metrics.marking, t.att.marked ? t.att.pct : null, t.attDelta, t.avgGrade, t.trend, t.gradesGiven, t.metrics.stability]);
      rep.method = "Ball = mezonlar og'irlikli o'rtachasi (" + CRITERIA.map((k) => k.label + " " + (state.weights[k.key] || 0)).join(", ") + "). Davomat = K/(K+Y+S). O'tilgan dars = kamida bitta davomat belgisi bor dars.";
    } else if (kind === "groups") {
      rep.columns = ["Guruh", "Kurs", "O'qituvchi", "Talaba", "Davomat %", "Davomat o'zgarishi (p.p.)", "O'rtacha baho", "Baho o'zgarishi", "Baholar soni", "Test o'rtacha %", "O'tilgan dars", "Rejadagi (o'tgan)", "Yordam kerak (talaba)"];
      rep.rows = groups.map((g) => [g.name, g.course, g.mentorName, g.size, g.att.marked ? g.att.pct : null, g.attDelta, g.avgGrade, g.gradeDelta, g.gradeN, g.avgTest, g.held, g.plannedPast, g.needHelp.length]);
      rep.method = "O'zgarish — oldingi teng davrga (" + c.pr.label + ") nisbatan. Uy vazifalari: CRM'da modul yo'q.";
    } else if (kind === "attendance") {
      rep.columns = ["Talaba", "Guruh", "O'qituvchi", "Keldi (K)", "Yo'q (Y)", "Sababli (S)", "Davomat %"];
      groups.forEach((g) => g.members.forEach((p) => rep.rows.push([p.s.name, g.name, g.mentorName, p.att.K, p.att.Y, p.att.S, p.att.marked ? p.att.pct : null])));
      rep.method = "Davomat = K / (K + Y + S) × 100, davr ichidagi darslar bo'yicha (sana guruh jadvalidan olinadi).";
    } else if (kind === "grades") {
      rep.columns = ["Talaba", "Guruh", "Baholar soni", "O'rtacha baho", "Oldingi davr o'rtachasi", "O'zgarish", "Testlar soni", "Test o'rtacha %"];
      groups.forEach((g) => g.members.forEach((p) => rep.rows.push([p.s.name, g.name, p.gradeN, p.avgGrade, p.gradeDelta == null ? null : Math.round((p.avgGrade - p.gradeDelta) * 10) / 10, p.gradeDelta, p.testN, p.avgTest])));
      rep.method = "Baholar — baholash jurnali (0–100). Testlar — topshirilgan sana davr ichida bo'lgan natijalar. Uy vazifalari: CRM'da modul yo'q.";
    } else if (kind === "admins") {
      const r = range();
      const all = [];
      for (let page = 1; page <= 10; page++) {
        const d = await getJson("/api/admin/activity?limit=200&page=" + page + "&from=" + r.from.toISOString() + "&to=" + r.to.toISOString());
        d.events.filter((e) => e.role === "admin").forEach((e) => all.push(e));
        if (page * 200 >= d.total) break;
      }
      rep.columns = ["Vaqt", "Administrator", "Hodisa", "Tavsif", "IP"];
      rep.rows = all.map((e) => [fmtDT(e.at), e.actor, e.event, eventText(e), e.ip]);
      rep.method = "Manba: xavfsizlik jurnali (security_audit), faqat admin roli. Maxfiy maydonlar jurnalga yozilmaydi.";
    } else if (kind === "system") {
      await loadMonitor();
      const m = state.monitor;
      if (!m) throw new Error("Monitoring ma'lumoti olinmadi");
      rep.period = "Holat: " + fmtDT(m.now) + " (so'rovlar: " + fmtDT(m.requests.since) + " dan beri)";
      rep.columns = ["Ko'rsatkich", "Qiymat"];
      rep.rows = [
        ["Backend ishlash vaqti", dur(m.server.uptimeSec)], ["Node.js", m.server.node], ["Xotira (RSS), MB", m.server.memoryMb],
        ["Baza", m.db.ok ? "ulangan" : "ulanmagan"], ["Baza ping, ms", m.db.pingMs], ["So'rovlar (60 daq)", m.requests.last60.n],
        ["5xx xatolar (60 daq)", m.requests.last60.err], ["Javob vaqti median, ms", m.requests.p50], ["Javob vaqti p95, ms", m.requests.p95],
        ["Server xatolari (24 soat, jurnal)", m.serverErrors24h], ["Onlayn talaba", m.online ? m.online.student : null], ["Onlayn mentor", m.online ? m.online.mentor : null],
        ["Oxirgi ma'lumot yangilanishi", m.lastDataUpdate ? fmtDT(m.lastDataUpdate) : "—"], ["Oxirgi zaxira", m.lastBackup ? fmtDT(m.lastBackup) : "—"],
      ].concat(m.requests.topByErrors.map((e) => ["Xatoli endpoint: " + e.key, "4xx " + e.e4 + ", 5xx " + e.e5 + " / " + e.n]));
      rep.method = "So'rov hisoblagichlari server xotirasida (qayta ishga tushganda nollanadi); server xatolari — jurnaldan.";
    } else {
      rep.columns = ["Ko'rsatkich", "Shu davr", "Oldingi davr", "Formula"];
      rep.rows = [
        ["Jami talabalar", c.students.length, null, "barcha yozuvlar"],
        ["Aktiv talabalar", c.activeStudents.length, null, "holati Aktiv yoki Probatsiya"],
        ["Yangi talabalar", c.newStudents.length, c.prevNewStudents.length, "qo'shilgan sana davrda"],
        ["Faol bo'lmagan talabalar", c.inactive.length, null, "Faolsiz/Muzlatilgan yoki 0% davomat (≥3 belgi)"],
        ["O'qituvchilar", (D.mentors || []).length, null, ""],
        ["Faol guruhlar", c.groups.filter((g) => !g.archived).length, null, "arxivda emas"],
        ["O'tilgan darslar", c.held.length, null, "kamida bitta davomat belgisi"],
        ["Rejadagi darslar (o'tgan)", c.plannedPast.length, null, "guruh jadvali bo'yicha"],
        ["Belgilanmagan darslar", c.unmarked.length, null, "sanasi o'tgan, belgi yo'q"],
        ["Davomat %", c.att.marked ? c.att.pct : null, c.prevAtt.marked ? c.prevAtt.pct : null, "K/(K+Y+S)"],
        ["O'rtacha baho", c.avgGrade, c.prevAvgGrade, "baholar jurnali o'rtachasi"],
        ["Test o'rtacha %", c.avgTest, c.prevAvgTest, "test natijalari o'rtachasi"],
        ["Uy vazifalari", "modul yo'q", null, ""],
      ];
      rep.method = "Oldingi davr: " + c.pr.label + ". Bo'sh katak — ma'lumot yetarli emas.";
    }
    const filt = [];
    if (gf) filt.push("guruh: " + ((groupById(gf) || {}).name || gf));
    if (tf) filt.push("o'qituvchi: " + (((D.mentors || []).find((m) => String(m.id) === tf)) || {}).name);
    rep.filters = filt.join(", ");
    return rep;
  }
  const cell = (v) => (v == null || (typeof v === "number" && !isFinite(v)) ? "" : v);
  function reportHeader(rep) {
    const cu = typeof getCurrentUser === "function" ? getCurrentUser() : {};
    return [["Hisobot", rep.title], ["Davr", rep.period], ["Filtr", rep.filters || "yo'q"], ["Tayyorlandi", fmtDT(new Date()) + " — " + (cu.username || cu.name || "admin")], ["Hisoblash usuli", rep.method]];
  }
  async function logExport(rep, format) {
    const r = await fetch("/api/admin/report-export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report: rep.title, format, from: state.lastCalc ? state.lastCalc.r.from.toISOString() : "", to: state.lastCalc ? state.lastCalc.r.to.toISOString() : "", filters: { group: state.groupFilter, teacher: state.teacherFilter }, rows: rep.rows.length }),
    });
    if (!r.ok) throw new Error(r.status === 403 ? "Eksport uchun ruxsat yo'q" : "Server eksportni tasdiqlamadi (HTTP " + r.status + ")");
  }
  function download(name, blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  const fileBase = (rep) => (rep.title.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "hisobot") + "_" + ymd(new Date());
  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Kutubxona yuklanmadi")); document.head.appendChild(s); });
  }
  async function doExport(kind, format) {
    const btns = document.querySelectorAll(".an-exp button");
    btns.forEach((b) => (b.disabled = true));
    try {
      const rep = await buildReport(kind);
      await logExport(rep, format); // ruxsat tekshiruvi + audit
      const head = reportHeader(rep);
      if (format === "csv") {
        const q = (v) => { const s = String(cell(v)); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
        const lines = head.map((h) => h.map(q).join(",")).concat([""], [rep.columns.map(q).join(",")], rep.rows.map((r) => r.map(q).join(",")));
        download(fileBase(rep) + ".csv", new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
      } else if (format === "xlsx") {
        if (!window.XLSX) await loadScript("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js");
        const aoa = head.concat([[]], [rep.columns], rep.rows.map((r) => r.map(cell)));
        const ws = window.XLSX.utils.aoa_to_sheet(aoa);
        ws["!cols"] = rep.columns.map((col, i) => ({ wch: Math.min(40, Math.max(10, String(col).length + 2, ...rep.rows.slice(0, 50).map((r) => String(cell(r[i])).length + 2))) }));
        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, ws, "Hisobot");
        window.XLSX.writeFile(wb, fileBase(rep) + ".xlsx");
      } else {
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(rep.title)}</title><style>
          body{font-family:Arial,sans-serif;color:#111;margin:24px;font-size:12px}h1{font-size:18px;margin:0 0 8px}
          .h td{padding:2px 10px 2px 0;vertical-align:top}.h td:first-child{color:#555;white-space:nowrap}
          table.d{border-collapse:collapse;width:100%;margin-top:14px}table.d th,table.d td{border:1px solid #bbb;padding:4px 6px;text-align:left}
          table.d th{background:#eee}@page{size:landscape;margin:12mm}</style></head><body>
          <h1>${esc(rep.title)}</h1><table class="h">${head.map((h) => `<tr><td>${esc(h[0])}</td><td>${esc(h[1])}</td></tr>`).join("")}</table>
          <table class="d"><thead><tr>${rep.columns.map((c0) => `<th>${esc(c0)}</th>`).join("")}</tr></thead><tbody>
          ${rep.rows.map((r) => `<tr>${r.map((v) => `<td>${esc(cell(v))}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${rep.columns.length}">Ma'lumot yo'q</td></tr>`}</tbody></table></body></html>`;
        const fr = document.createElement("iframe");
        fr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
        document.body.appendChild(fr);
        fr.srcdoc = html;
        fr.onload = () => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) {} setTimeout(() => fr.remove(), 60000); };
      }
      if (typeof toast === "function") toast("Hisobot tayyor: " + rep.title + " (" + rep.rows.length + " qator)");
    } catch (e) {
      if (typeof toast === "function") toast("Hisobot tayyorlanmadi: " + e.message);
    } finally {
      btns.forEach((b) => (b.disabled = false));
    }
  }
  function renderReports(c) {
    const k = state.reportKind || "monthly";
    const mentors = D.mentors || [];
    const usesFilters = ["teachers", "groups", "attendance", "grades"].includes(k);
    const preview = state.reportPreview && state.reportPreview.kind === k ? state.reportPreview.rep : null;
    return `<section class="an-card"><div class="an-card-h"><h3>${ic("download")} Hisobot tayyorlash</h3></div>
      <div class="an-rep-types">${Object.keys(REPORTS).map((key) => `<button class="an-chip ${key === k ? "on" : ""}" onclick="__AN.rkind('${key}')">${REPORTS[key]}</button>`).join("")}</div>
      <div class="an-filters">
        <span class="an-sub">${ic("calendar")} ${esc(c.r.label)} (yuqoridagi davr tanlagichidan)</span>
        ${usesFilters ? `<select class="an-sel" onchange="__AN.gfilter(this.value)"><option value="">Barcha guruhlar</option>${c.groups.map((g) => `<option value="${esc(g.gid)}" ${g.gid === state.groupFilter ? "selected" : ""}>${esc(g.name)}</option>`).join("")}</select>
        <select class="an-sel" onchange="__AN.tfilter(this.value)"><option value="">Barcha o'qituvchilar</option>${mentors.map((m) => `<option value="${esc(m.id)}" ${String(m.id) === state.teacherFilter ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select>` : ""}
      </div>
      <div class="an-exp"><button class="an-btn" onclick="__AN.preview('${k}')">${ic("eye")} Ko'rib chiqish</button>
        <button class="an-btn pri" onclick="__AN.export('${k}','csv')">${ic("file")} CSV</button>
        <button class="an-btn pri" onclick="__AN.export('${k}','xlsx')">${ic("file")} Excel</button>
        <button class="an-btn pri" onclick="__AN.export('${k}','pdf')">${ic("printer")} PDF</button></div>
      <div class="an-note">Har bir eksport serverda ruxsat bilan tekshiriladi va jurnalga yoziladi (kim, qachon, qaysi hisobot). Hisobot boshida davr, filtr va hisoblash usuli ko'rsatiladi. PDF — chop etish oynasida "PDF sifatida saqlash" ni tanlang.</div></section>
      ${preview ? `<section class="an-card"><div class="an-card-h"><h3>${esc(preview.title)}</h3><span class="an-sub">${preview.rows.length} qator</span></div>
        <div class="an-meta"><span>${esc(preview.period)}</span>${preview.filters ? `<span>${esc(preview.filters)}</span>` : ""}</div>
        <div class="an-tw"><table class="an-t"><thead><tr>${preview.columns.map((x) => `<th>${esc(x)}</th>`).join("")}</tr></thead><tbody>
        ${preview.rows.slice(0, 50).map((r) => `<tr>${r.map((v) => `<td>${v == null ? "—" : esc(typeof v === "number" ? fmtN(v) : v)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${preview.columns.length}" class="an-empty">${NO_DATA}</td></tr>`}</tbody></table></div>
        ${preview.rows.length > 50 ? `<div class="an-note">Faqat birinchi 50 qator ko'rsatildi — faylda hammasi bo'ladi.</div>` : ""}<div class="an-note">${esc(preview.method)}</div></section>` : ""}`;
  }

  // ───────────────────────── qobiq va boshqaruv ─────────────────────────
  const TABS = [
    ["overview", "Umumiy", "chart"], ["teachers", "O'qituvchilar", "teacher"], ["groups", "Guruhlar va talabalar", "school"],
    ["insights", "Tavsiyalar", "sparkles"], ["monitor", "Monitoring", "laptop"], ["activity", "Faoliyat jurnali", "clipboard"], ["reports", "Hisobotlar", "download"],
  ];
  function shell() {
    const p = state.period;
    const r = range();
    return `<div class="an-head">
      <div class="an-title"><div class="an-period-l">${ic("calendar")} ${esc(r.label)}</div><div class="an-sub">Barcha ko'rsatkichlar CRM yozuvlaridan hisoblanadi</div></div>
      <div class="an-period">${PERIODS.map(([k, l]) => `<button class="an-chip ${p.key === k ? "on" : ""}" onclick="__AN.period('${k}')">${l}</button>`).join("")}
        ${p.key === "custom" ? `<input type="date" class="an-in" value="${esc(p.from || "")}" onchange="__AN.custom('from', this.value)"><input type="date" class="an-in" value="${esc(p.to || "")}" onchange="__AN.custom('to', this.value)">` : ""}
        <button class="an-btn" onclick="__AN.reload()" title="Yangilash">${ic("refresh")}</button></div></div>
      <nav class="an-tabs">${TABS.map(([k, l, i]) => `<button class="${state.tab === k ? "on" : ""}" onclick="__AN.go('${k}')">${ic(i)} ${l}</button>`).join("")}</nav>
      <div id="an-body"></div>`;
  }
  function body() {
    const el = document.getElementById("an-body");
    if (!el) return;
    let c;
    try {
      c = calc();
      state.lastCalc = c;
    } catch (e) {
      console.error("[Analitika]", e);
      el.innerHTML = `<section class="an-card"><div class="an-empty">Hisoblashda xatolik: ${esc(e.message)}</div></section>`;
      return;
    }
    const R = { overview: renderOverview, teachers: renderTeachers, groups: renderGroups, insights: renderInsights, monitor: renderMonitor, activity: renderActivity, reports: renderReports }[state.tab] || renderOverview;
    el.innerHTML = R(c);
  }
  const panelActive = () => { const p = document.getElementById("panel-analytics"); return !!(p && p.classList.contains("active")); };
  function rerender() { if (panelActive()) body(); }

  let lastAcc = 0;
  function render() {
    const wrap = document.getElementById("analytics-wrap");
    if (!wrap) return;
    if (typeof isAdminRole === "function" && !isAdminRole()) {
      wrap.innerHTML = `<div class="an-empty">Bu bo'lim faqat administrator uchun.</div>`;
      return;
    }
    ensureCss();
    wrap.innerHTML = shell();
    body();
    // Server ma'lumotlarini fonda olib, kelganda qayta chizamiz
    const jobs = [];
    if (!state.accounts || Date.now() - lastAcc > 5 * 60000) { lastAcc = Date.now(); jobs.push(loadAccounts()); }
    if (state.tab === "overview" || state.tab === "activity" || state.tab === "insights") jobs.push(loadActivity());
    if (state.tab === "overview" && !state.activity30) jobs.push(loadActivity30());
    if (state.tab !== "activity" && state.tab !== "reports") jobs.push(loadMonitor());
    Promise.all(jobs).then(rerender);
    schedulePoll();
  }
  function schedulePoll() {
    if (state.pollTimer) { clearTimeout(state.pollTimer); state.pollTimer = null; }
    if (state.tab !== "monitor" || !Number(state.pollSec)) return;
    state.pollTimer = setTimeout(async function tick() {
      state.pollTimer = null;
      if (!panelActive() || state.tab !== "monitor") return;
      if (document.visibilityState === "visible") { await loadMonitor(); rerender(); }
      schedulePoll();
    }, Number(state.pollSec) * 1000);
  }
  function stop() { if (state.pollTimer) { clearTimeout(state.pollTimer); state.pollTimer = null; } closeModal(); }

  window.__AN = {
    go(tab) { state.tab = tab; closeModal(); render(); window.scrollTo({ top: 0, behavior: "smooth" }); },
    period(k) {
      state.period.key = k;
      if (k === "custom" && !state.period.from) { const r0 = range(); state.period.from = ymd(new Date(Date.now() - 29 * DAY)); state.period.to = ymd(new Date()); void r0; }
      state.activityQ.page = 1; saveCfg(); render();
    },
    custom(which, v) { state.period[which] = v; saveCfg(); render(); },
    reload() { state.accounts = null; state.activity30 = null; render(); },
    drill: drillModal, group: groupModal, student: studentModal, teacher: teacherModal, close: closeModal,
    weight(k, v) { state.weights[k] = Number(v); saveCfg(); clearTimeout(this._wt); this._wt = setTimeout(body, 150); },
    resetWeights() { state.weights = Object.assign({}, DEFAULT_WEIGHTS); saveCfg(); body(); },
    sort(v) { state.teacherSort = v; body(); },
    tfilter(v) { state.teacherFilter = v; state.reportPreview = null; body(); },
    gfilter(v) { state.groupFilter = v; state.reportPreview = null; body(); },
    archived(v) { state.showArchived = !!v; body(); },
    insFilter(v) { state.insFilter = v; body(); },
    poll(v) { state.pollSec = Number(v); saveCfg(); schedulePoll(); },
    async refreshMonitor() { await loadMonitor(); rerender(); },
    async aq(k, v) { state.activityQ[k] = v; state.activityQ.page = 1; await loadActivity(); rerender(); },
    async apage(d) { state.activityQ.page = Math.max(1, (state.activityQ.page || 1) + d); await loadActivity(); rerender(); },
    rkind(k) { state.reportKind = k; body(); },
    async preview(k) {
      try { state.reportPreview = { kind: k, rep: await buildReport(k) }; }
      catch (e) { if (typeof toast === "function") toast("Hisobot tayyorlanmadi: " + e.message); }
      body();
    },
    export: doExport,
    quick(what) {
      // CRM'ning umumiy "qo'shish" oynasi (forms-credentials.js)
      if (what === "student" && typeof window.openModal === "function") return window.openModal("student");
      if (what === "group" && typeof window.openModal === "function") return window.openModal("group");
      if (what === "groups" && typeof go === "function") return go("groups", document.getElementById("nav-groups"));
    },
  };
  window.renderSuperAnalytics = render;
  window.stopSuperAnalytics = stop;
  // Test va kelajakdagi integratsiyalar uchun: hisob funksiyalari
  window.SuperAnalyticsCore = { calc, lessonsIn, attAgg, insights, range, prevRange, rankTeachers, CRITERIA };

  // ───────────────────────── uslublar ─────────────────────────
  // Ilova mavzusi o'zgaruvchilaridan (--bg2, --text, --accent ...) foydalanadi —
  // yorug', qorong'i va qora mavzularda o'zi moslashadi.
  function ensureCss() {
    if (document.getElementById("an-css")) return;
    const st = document.createElement("style");
    st.id = "an-css";
    st.textContent = `
#analytics-wrap{padding:4px 0 32px;color:var(--text)}
.an-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:12px}
.an-title h2{margin:0;font-size:22px;font-weight:800;letter-spacing:-.4px;display:flex;align-items:center;gap:8px}
.an-sub{font-size:12px;color:var(--text3)}
.an-period-l{font-size:15px;font-weight:700;display:flex;gap:6px;align-items:center}
.an-period{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.an-chip{border:1px solid var(--border2);background:var(--bg2);color:var(--text2);border-radius:999px;padding:6px 12px;font-size:12.5px;font-weight:600;cursor:pointer;display:inline-flex;gap:6px;align-items:center}
.an-chip.on{background:var(--accent);border-color:var(--accent);color:#fff}
.an-chip span{opacity:.75;font-weight:700}
.an-btn{border:1px solid var(--border2);background:var(--bg2);color:var(--text);border-radius:10px;padding:7px 12px;font-size:12.5px;font-weight:600;cursor:pointer;display:inline-flex;gap:6px;align-items:center}
.an-btn.pri{background:var(--accent);color:#fff;border-color:var(--accent)}
.an-btn:disabled{opacity:.5;cursor:default}
.an-in,.an-sel{border:1px solid var(--border2);background:var(--bg2);color:var(--text);border-radius:10px;padding:7px 10px;font-size:12.5px;max-width:100%}
.an-tabs{display:flex;gap:4px;overflow-x:auto;border-bottom:1px solid var(--border2);margin-bottom:14px;scrollbar-width:thin}
.an-tabs button{flex:none;border:0;background:none;color:var(--text2);padding:10px 12px;font-size:13px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;display:inline-flex;gap:6px;align-items:center}
.an-tabs button.on{color:var(--accent);border-bottom-color:var(--accent)}
.an-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-bottom:14px}
.an-stat{text-align:left;background:var(--bg2);border:1px solid var(--border2);border-radius:var(--r-lg,16px);padding:12px 14px;cursor:pointer;color:var(--text);box-shadow:var(--shadow-sm);transition:transform .12s,border-color .12s;border-top:3px solid var(--c)}
.an-stat:hover{transform:translateY(-1px);border-color:var(--c)}
.an-stat.an-static{cursor:default}.an-stat.an-static:hover{transform:none}
.an-stat-top{display:flex;align-items:center;gap:6px;color:var(--text2);font-size:12px;font-weight:600}
.an-stat-ic{color:var(--c);display:inline-flex}
.an-stat-v{font-size:22px;font-weight:800;margin:6px 0 2px;letter-spacing:-.4px;line-height:1.15;word-break:break-word}
.an-stat-s{font-size:11.5px;color:var(--text3);line-height:1.35}
.an-card{background:var(--bg2);border:1px solid var(--border2);border-radius:var(--r-lg,16px);padding:14px 16px;margin-bottom:14px;box-shadow:var(--shadow-sm);min-width:0}
.an-card-h{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px;flex-wrap:wrap}
.an-card-h h3{margin:0;font-size:15px;font-weight:700;display:flex;gap:6px;align-items:center}
.an-meta{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:11.5px;color:var(--text3);margin-bottom:10px}
.an-meta span{display:inline-flex;gap:4px;align-items:center}
.an-grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.an-grid2>.an-card{margin-bottom:0}.an-grid2{margin-bottom:14px}
.an-grid2.tight{gap:12px;margin:8px 0}
.an-svg{width:100%;height:auto;display:block;overflow:visible}
.an-grid{stroke:var(--border2);stroke-width:1}
.an-axis{fill:var(--text3);font-size:10.5px}
.an-legend{display:flex;flex-wrap:wrap;gap:12px;font-size:11.5px;color:var(--text2);margin-top:6px}
.an-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
.an-note{font-size:11.5px;color:var(--text3);margin-top:8px;line-height:1.5}
.an-empty{padding:18px 8px;text-align:center;color:var(--text3);font-size:13px}
.an-empty.ok{color:var(--teal)}
.an-bar{display:grid;grid-template-columns:minmax(80px,32%) 1fr auto;gap:8px;align-items:center;padding:5px 2px;border-radius:8px}
.an-bar-n{font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.an-bar-t{height:8px;background:var(--bg3);border-radius:99px;overflow:hidden}
.an-bar-f{height:100%;border-radius:99px}
.an-bar-v{font-size:12px;font-weight:700;color:var(--text2);white-space:nowrap}
.an-click{cursor:pointer}.an-click:hover{background:var(--bg3)}
.an-cols{display:flex;gap:6px;align-items:flex-end;height:160px;padding-top:6px}
.an-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;min-width:0}
.an-col-v{font-size:11px;font-weight:700;color:var(--text2)}
.an-col-t{flex:1;width:100%;max-width:42px;background:var(--bg3);border-radius:8px;display:flex;align-items:flex-end;overflow:hidden}
.an-col-f{width:100%;border-radius:8px 8px 0 0}
.an-col-l{font-size:10.5px;color:var(--text3);white-space:nowrap}
.an-tw{overflow-x:auto;-webkit-overflow-scrolling:touch}
.an-t{width:100%;border-collapse:collapse;font-size:12.5px}
.an-t th{text-align:left;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.03em;padding:8px;border-bottom:1px solid var(--border2);white-space:nowrap}
.an-t td{padding:8px;border-bottom:1px solid var(--border);vertical-align:top}
.an-t td.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.an-t code{font-size:11.5px;word-break:break-all}
.an-row-warn td{background:rgba(220,38,38,.05)}
.an-dl{font-size:11px;font-weight:700;color:var(--text3)}
.an-dl.up{color:var(--teal)}.an-dl.down{color:#dc2626}
.an-pill{display:inline-block;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:99px;background:var(--bg3);color:var(--text2)}
.an-pill.good{background:var(--teal-light);color:var(--teal-text)}
.an-pill.warn{background:var(--amber-light);color:var(--amber-text)}
.an-pill.muted{color:var(--text3)}
.an-link{border:0;background:none;color:var(--accent);font-size:12.5px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:2px;padding:0}
.an-ins{border-left:3px solid var(--text3);background:var(--bg3);border-radius:10px;padding:8px 10px;margin-bottom:8px;font-size:12.5px}
.an-ins-h{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.an-ins-n{color:var(--text2);margin-top:3px;font-size:12px}
.an-badge{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;padding:2px 7px;border-radius:6px;background:var(--bg4);color:var(--text2)}
.an-alert{border-left-color:#dc2626}.an-alert .an-badge{background:rgba(220,38,38,.12);color:#dc2626}
.an-warn{border-left-color:var(--amber)}.an-warn .an-badge{background:var(--amber-light);color:var(--amber-text)}
.an-info{border-left-color:var(--accent)}.an-info .an-badge{background:var(--accent-light);color:var(--accent-text)}
.an-good{border-left-color:var(--teal)}.an-good .an-badge{background:var(--teal-light);color:var(--teal-text)}
.an-ins-card{border-left-width:4px}
.an-mini{padding:6px 10px}
.an-dl5{display:grid;grid-template-columns:130px 1fr;gap:6px 12px;margin:10px 0 6px;font-size:12.5px}
.an-dl5 dt{color:var(--text3);font-weight:600}.an-dl5 dd{margin:0}
.an-chips,.an-rep-types{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.an-feed-r{display:grid;grid-template-columns:110px 110px 1fr;gap:8px;font-size:12px;padding:6px 0;border-bottom:1px solid var(--border)}
.an-feed-t{color:var(--text3)}.an-feed-a{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.an-kv{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;margin-bottom:10px}
.an-kv>div{background:var(--bg3);border-radius:10px;padding:8px 10px;display:flex;flex-direction:column;gap:2px}
.an-kv span{font-size:11px;color:var(--text3)}.an-kv b{font-size:13px}
.an-kv b.ok{color:var(--teal)}.an-kv b.bad{color:#dc2626}
.an-quick{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px}
.an-quick button{border:1px solid var(--border2);background:var(--bg3);color:var(--text);border-radius:12px;padding:12px;font-size:13px;font-weight:600;cursor:pointer;display:flex;gap:8px;align-items:center}
.an-quick button:hover{border-color:var(--accent);color:var(--accent)}
.an-filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}
.an-chk{font-size:12.5px;display:inline-flex;gap:6px;align-items:center;color:var(--text2)}
.an-weights{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin-top:6px}
.an-w{display:flex;flex-direction:column;gap:4px;background:var(--bg3);border-radius:12px;padding:10px 12px}
.an-w-h{display:flex;justify-content:space-between;font-size:12.5px}.an-w-h span{color:var(--accent);font-weight:800}
.an-w input{width:100%;accent-color:var(--accent)}
.an-w small{font-size:11px;color:var(--text3);line-height:1.4}
.an-sub-h{font-size:12px;font-weight:700;color:var(--text2);margin:12px 0 6px;display:flex;gap:6px;align-items:center}
.an-li{font-size:12.5px;padding:5px 0;border-bottom:1px solid var(--border)}
.an-list{max-height:260px;overflow:auto}
.an-pager{display:flex;align-items:center;gap:6px;font-size:12px}
.an-exp{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px}
.an-modal{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9998;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(2px)}
.an-modal-box{background:var(--bg2);color:var(--text);border-radius:18px;width:min(920px,100%);max-height:92vh;display:flex;flex-direction:column;box-shadow:var(--shadow-xl)}
.an-modal-h{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--border2)}
.an-modal-h h3{margin:0;font-size:16px}
.an-x{border:0;background:var(--bg3);color:var(--text);border-radius:10px;width:34px;height:34px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.an-modal-b{padding:14px 18px 18px;overflow:auto}
@media (max-width:860px){.an-grid2{grid-template-columns:1fr}}
@media (max-width:560px){
  .an-stats{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .an-stat{padding:10px 11px}.an-stat-v{font-size:18px}
  .an-card{padding:12px}
  .an-title h2{font-size:18px}
  .an-dl5{grid-template-columns:1fr}.an-dl5 dt{margin-top:4px}
  .an-feed-r{grid-template-columns:1fr;gap:2px}
  .an-bar{grid-template-columns:minmax(70px,38%) 1fr auto}
  .an-modal{padding:0;align-items:stretch}.an-modal-box{border-radius:0;max-height:100vh}
}`;
    document.head.appendChild(st);
  }
})();
