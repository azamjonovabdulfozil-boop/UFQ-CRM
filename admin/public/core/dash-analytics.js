// ===================== KENGAYTIRILGAN ANALITIKA (uchala dashboard) =====================
// Mavjud render funksiyalarini o'raydi va ularning oxiriga qo'shimcha analitika
// bo'limini qo'shadi:
//   • renderDashboard        — admin dashboard  (#dash-charts)
//   • renderMentorDashboard  — mentor dashboard (#mentor-dash-wrap)
//   • renderStudentDashboard — talaba dashboard (#student-my-wrap)
// Asl funksiyalarga tegilmaydi — bu fayl ishlamasa ham dashboard avvalgidek chiqadi.
(function () {
  "use strict";

  const SECTION_ID = "xa-analytics";
  const WEEK_DAYS = ["Du", "Se", "Ch", "Pa", "Ju", "Sh"];
  const JS_DAY = ["Yak", "Du", "Se", "Ch", "Pa", "Ju", "Sh"];

  // ---------- yordamchilar ----------
  const esc = (v) =>
    String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const money = (n) => (typeof fmtMoney === "function" ? fmtMoney(n) : String(Math.round(n)));
  const lessonCount = () => (typeof LESSON_COUNT === "number" ? LESSON_COUNT : 12);
  const monthShort = (m) => {
    try {
      if (typeof getMonthName === "function") return getMonthName(m, true);
    } catch (e) {}
    return ["Yan", "Fev", "Mar", "Apr", "May", "Iyn", "Iyl", "Avg", "Sen", "Okt", "Noy", "Dek"][m];
  };
  const pctColor = (p) => (p == null ? "var(--text3)" : p >= 80 ? "#0d9488" : p >= 60 ? "#d97706" : "#dc2626");

  /** Oxirgi n oy: [{y, m, label}] — eskisidan yangisiga. */
  function lastMonths(n) {
    const now = new Date();
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push({ y: d.getFullYear(), m: d.getMonth(), label: monthShort(d.getMonth()) });
    }
    return out;
  }

  /** Talabalar ro'yxati bo'yicha davomat: {p: kelgan, mk: belgilangan}. */
  function attFor(students, y, m) {
    let p = 0, mk = 0;
    if (!D.attendance) return { p, mk };
    students.forEach((s) => {
      const sa = (D.attendance["att_" + s.groupId + "_" + y + "_" + m] || {})["s" + s.id] || {};
      for (let l = 1; l <= lessonCount(); l++) {
        const v = sa["l" + l] || "";
        if (v === "K") { p++; mk++; }
        else if (v === "Y" || v === "S") mk++;
      }
    });
    return { p, mk };
  }
  const pctOf = (a) => (a.mk > 0 ? Math.round((a.p / a.mk) * 100) : null);

  /** Talabaning barcha baholari o'rtachasi (yo'q bo'lsa null). */
  function avgGrade(sid) {
    const arr = (D.simpleGrades && D.simpleGrades[sid]) || [];
    if (!arr.length) return null;
    return Math.round(arr.reduce((s, g) => s + (Number(g.score) || 0), 0) / arr.length);
  }
  function avgOf(list) {
    const v = list.filter((x) => x != null);
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  }

  /** Talabaning test natijalari: [{title, score, date}]. */
  function testResultsOf(sid) {
    const out = [];
    const res = D.testResults || {};
    Object.keys(res).forEach((tid) => {
      const r = res[tid] && res[tid][sid];
      if (!r || r.score == null) return;
      const t = (D.tests || []).find((x) => String(x.id) === String(tid));
      out.push({ title: t ? t.title : "Test", score: Number(r.score) || 0, date: r.date || r.submittedAt || null });
    });
    return out;
  }

  function debtOf(s) {
    try {
      if (typeof debtorAmount === "function") return debtorAmount(s) || 0;
    } catch (e) {}
    return 0;
  }

  // ---------- grafik bloklari ----------
  /** Vertikal ustunli grafik. items: [{label, val, color?, sub?}] */
  function columns(items, { max = null, suffix = "", color = "var(--accent)" } = {}) {
    const top = max || Math.max(1, ...items.map((x) => x.val || 0));
    return `<div class="xa-cols">${items
      .map((x) => {
        const h = x.val ? Math.max(4, Math.round((x.val / top) * 100)) : 0;
        return `<div class="xa-col" title="${esc(x.label)}: ${x.val == null ? "—" : x.val + suffix}">
          <div class="xa-col-val">${x.val == null ? "—" : x.val + suffix}</div>
          <div class="xa-col-track"><div class="xa-col-fill" style="height:${h}%;background:${x.color || color}"></div></div>
          <div class="xa-col-lbl">${esc(x.label)}</div>
        </div>`;
      })
      .join("")}</div>`;
  }

  /** Gorizontal chiziqli ro'yxat. items: [{label, val, text?, color?}] */
  function bars(items, { max = null, empty = "Ma'lumot yo'q" } = {}) {
    if (!items.length) return `<div class="xa-empty">${empty}</div>`;
    const top = max || Math.max(1, ...items.map((x) => x.val || 0));
    return items
      .map(
        (x) => `<div class="xa-bar">
        <div class="xa-bar-name" title="${esc(x.label)}">${esc(x.label)}</div>
        <div class="xa-bar-track"><div class="xa-bar-fill" style="width:${Math.round(((x.val || 0) / top) * 100)}%;background:${x.color || "var(--accent)"}"></div></div>
        <div class="xa-bar-val">${x.text != null ? x.text : x.val}</div>
      </div>`,
      )
      .join("");
  }

  const card = (title, body, extra = "") => `<div class="xa-card" ${extra}><div class="xa-title">${title}</div>${body}</div>`;
  const tile = (label, val, sub, color) =>
    `<div class="xa-tile" style="--xc:${color}"><div class="xa-tile-lbl">${label}</div><div class="xa-tile-val">${val}</div>${sub ? `<div class="xa-tile-sub">${sub}</div>` : ""}</div>`;

  function table(head, rows, empty) {
    if (!rows.length) return `<div class="xa-empty">${empty}</div>`;
    return `<div class="xa-table-wrap"><table class="xa-table"><thead><tr>${head
      .map((h, i) => `<th${i ? ' style="text-align:center"' : ""}>${h}</th>`)
      .join("")}</tr></thead><tbody>${rows
      .map((r) => `<tr>${r.map((c, i) => `<td${i ? ' style="text-align:center"' : ""}>${c}</td>`).join("")}</tr>`)
      .join("")}</tbody></table></div>`;
  }
  const pctCell = (p) => `<b style="color:${pctColor(p)}">${p == null ? "—" : p + "%"}</b>`;

  function injectStyles() {
    if (document.getElementById("xa-styles")) return;
    const st = document.createElement("style");
    st.id = "xa-styles";
    st.textContent = `
#${SECTION_ID}{margin-top:18px;}
.xa-head{display:flex;align-items:center;gap:8px;margin:4px 0 12px;font-size:16px;font-weight:800;color:var(--text);letter-spacing:-.3px;}
.xa-head small{font-size:11px;font-weight:600;color:var(--text3);}
.xa-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-bottom:14px;}
.xa-card{background:var(--bg2,var(--bg));border:1.5px solid var(--border);border-radius:16px;padding:16px 16px 12px;box-shadow:var(--shadow-sm);min-width:0;}
.xa-title{font-size:12px;font-weight:700;color:var(--text2);margin-bottom:12px;text-transform:uppercase;letter-spacing:.06em;}
.xa-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px;}
.xa-tile{background:var(--bg2,var(--bg));border:1.5px solid var(--border);border-left:4px solid var(--xc);border-radius:12px;padding:11px 13px;}
.xa-tile-lbl{font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;}
.xa-tile-val{font-size:20px;font-weight:900;color:var(--xc);letter-spacing:-.6px;margin-top:3px;}
.xa-tile-sub{font-size:11px;color:var(--text3);margin-top:2px;}
.xa-cols{display:flex;align-items:flex-end;gap:6px;height:150px;}
.xa-col{flex:1;display:flex;flex-direction:column;align-items:center;height:100%;min-width:0;}
.xa-col-val{font-size:10px;font-weight:700;color:var(--text2);margin-bottom:3px;white-space:nowrap;}
.xa-col-track{flex:1;width:100%;max-width:34px;background:var(--bg3,rgba(148,163,184,.15));border-radius:6px;display:flex;align-items:flex-end;overflow:hidden;}
.xa-col-fill{width:100%;border-radius:6px;transition:height .5s;}
.xa-col-lbl{font-size:10px;color:var(--text3);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;}
.xa-bar{display:flex;align-items:center;gap:8px;margin-bottom:8px;}
.xa-bar-name{font-size:12px;color:var(--text2);width:96px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.xa-bar-track{flex:1;height:9px;background:var(--bg3,rgba(148,163,184,.15));border-radius:5px;overflow:hidden;}
.xa-bar-fill{height:100%;border-radius:5px;}
.xa-bar-val{font-size:11px;font-weight:700;color:var(--text2);min-width:46px;text-align:right;flex-shrink:0;}
.xa-table-wrap{overflow-x:auto;}
.xa-table{width:100%;border-collapse:collapse;font-size:12px;}
.xa-table th{font-size:10px;color:var(--text3);font-weight:700;text-transform:uppercase;padding:6px 8px;border-bottom:2px solid var(--border);text-align:left;white-space:nowrap;}
.xa-table td{padding:7px 8px;border-bottom:1px solid var(--border);color:var(--text);white-space:nowrap;}
.xa-table tr:last-child td{border-bottom:none;}
.xa-legend{display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;font-size:11px;color:var(--text2);}
.xa-legend i{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:4px;vertical-align:-1px;}
.xa-empty{padding:16px;text-align:center;color:var(--text3);font-size:12px;}
.xa-list-item{display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border);font-size:12px;}
.xa-list-item:last-child{border-bottom:none;}
.xa-tag{font-size:10px;font-weight:700;padding:2px 7px;border-radius:7px;white-space:nowrap;}
@media(max-width:640px){.xa-grid{grid-template-columns:1fr;}.xa-cols{height:130px;}}
`;
    document.head.appendChild(st);
  }

  function mount(container, html) {
    if (!container) return;
    injectStyles();
    const old = container.querySelector("#" + SECTION_ID);
    if (old) old.remove();
    const el = document.createElement("div");
    el.id = SECTION_ID;
    el.innerHTML = html;
    container.appendChild(el);
  }

  // ===================== ADMIN =====================
  function adminAnalytics() {
    const months = lastMonths(6);
    const now = new Date();
    const cy = now.getFullYear(), cm = now.getMonth();
    const students = D.students || [];
    const activeStudents = students.filter((s) => s.status === "Aktiv");

    // Davomat va yangi talabalar trendi
    const attTrend = months.map((x) => ({ label: x.label, val: pctOf(attFor(students, x.y, x.m)) }));
    const joinTrend = months.map((x) => ({
      label: x.label,
      val: students.filter((s) => {
        const d = new Date(s.joinDate);
        return d.getFullYear() === x.y && d.getMonth() === x.m;
      }).length,
    }));

    // Guruhlar bo'yicha davomat (bu oy)
    const groupAtt = (D.groups || [])
      .map((g) => {
        const gs = students.filter((s) => s.groupId === g.id);
        return { g, n: gs.length, pct: pctOf(attFor(gs, cy, cm)) };
      })
      .filter((x) => x.n > 0)
      .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));

    // Qarzdorlik
    const debtors = students.filter((s) => s.isDebtor).map((s) => ({ s, amount: debtOf(s) }));
    const totalDebt = debtors.reduce((a, x) => a + x.amount, 0);
    const topDebtors = debtors.slice().sort((a, b) => b.amount - a.amount).slice(0, 5);

    // Haftalik dars yuklamasi
    const weekLoad = WEEK_DAYS.map((d) => ({
      label: d,
      val: (D.groups || []).filter((g) => (g.days || []).includes(d)).length,
      color: d === JS_DAY[now.getDay()] ? "#ea580c" : "#6366f1",
    }));

    // Mentor samaradorligi
    const mentorRows = (D.mentors || [])
      .map((m) => {
        const gs = (D.groups || []).filter((g) => g.mentor === m.name);
        const st = students.filter((s) => gs.some((g) => g.id === s.groupId));
        const pct = pctOf(attFor(st, cy, cm));
        const grade = avgOf(st.map((s) => avgGrade(s.id)));
        return { m, groups: gs.length, n: st.length, pct, grade, debt: st.filter((s) => s.isDebtor).length };
      })
      .sort((a, b) => b.n - a.n);

    // Test natijalari
    const allTests = students.flatMap((s) => testResultsOf(s.id));
    const testAvg = avgOf(allTests.map((t) => t.score));

    // Kunlik reja: bugun dars bor guruhlar
    const todayCode = JS_DAY[now.getDay()];
    const todayGroups = (D.groups || []).filter((g) => (g.days || []).includes(todayCode));

    // Retention: arxiv/faolsiz ulushi
    const leftCnt = students.filter((s) => s.status === "Arxiv" || s.status === "Faolsiz").length;
    const retention = students.length ? Math.round(((students.length - leftCnt) / students.length) * 100) : null;
    const avgGroupSize = (D.groups || []).length ? Math.round((students.length / D.groups.length) * 10) / 10 : 0;

    return `
<div class="xa-head">📈 Kengaytirilgan analitika <small>· real vaqtda hisoblanadi</small></div>
<div class="xa-tiles">
  ${tile("Saqlanish (retention)", retention == null ? "—" : retention + "%", `${leftCnt} ta ketgan / faolsiz`, "#0d9488")}
  ${tile("Jami qarz", money(totalDebt), `${debtors.length} ta qarzdor`, "#dc2626")}
  ${tile("O'rtacha guruh hajmi", avgGroupSize, `${(D.groups || []).length} ta guruh`, "#6366f1")}
  ${tile("Test o'rtachasi", testAvg == null ? "—" : testAvg + "%", `${allTests.length} ta natija`, "#7c3aed")}
  ${tile("Bugungi darslar", todayGroups.length, `${activeStudents.length} ta aktiv talaba`, "#ea580c")}
</div>
<div class="xa-grid">
  ${card("🗓️ Davomat trendi (6 oy)", columns(attTrend, { max: 100, suffix: "%", color: "#0d9488" }))}
  ${card("👥 Yangi talabalar (6 oy)", columns(joinTrend, { color: "#3b82f6" }))}
  ${card("📅 Haftalik dars yuklamasi", columns(weekLoad) + `<div class="xa-legend"><span><i style="background:#ea580c"></i>Bugun</span><span><i style="background:#6366f1"></i>Guruhlar soni</span></div>`)}
</div>
<div class="xa-grid">
  ${card(
    "🏫 Guruhlar bo'yicha davomat (bu oy)",
    bars(
      groupAtt.slice(0, 8).map((x) => ({ label: x.g.name, val: x.pct || 0, text: x.pct == null ? "—" : x.pct + "%", color: pctColor(x.pct) })),
      { max: 100, empty: "Guruh yo'q" },
    ),
  )}
  ${card(
    "💸 Eng katta qarzdorlar",
    bars(
      topDebtors.map((x) => ({ label: x.s.name, val: x.amount, text: money(x.amount), color: "#dc2626" })),
      { empty: "Qarzdor yo'q 🎉" },
    ),
  )}
  ${card(
    "⏰ Bugungi darslar",
    todayGroups.length
      ? todayGroups
          .slice()
          .sort((a, b) => String(a.timeStart || "").localeCompare(String(b.timeStart || "")))
          .map(
            (g) => `<div class="xa-list-item"><b style="color:var(--accent);min-width:86px">${esc(g.timeStart || "—")}–${esc(g.timeEnd || "")}</b>
              <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(g.name)}</span>
              <span style="color:var(--text3)">${esc(g.mentor || "")}</span></div>`,
          )
          .join("")
      : `<div class="xa-empty">Bugun dars yo'q</div>`,
  )}
</div>
${card(
  "🎓 Mentorlar samaradorligi (bu oy)",
  table(
    ["Mentor", "Guruh", "Talaba", "Davomat", "O'rt. baho", "Qarzdor"],
    mentorRows.map((r) => [esc(r.m.name), r.groups, r.n, pctCell(r.pct), r.grade == null ? "—" : r.grade, r.debt ? `<span style="color:#dc2626;font-weight:700">${r.debt}</span>` : "0"]),
    "Mentor yo'q",
  ),
  'style="margin-bottom:14px"',
)}`;
  }

  // ===================== MENTOR =====================
  function mentorAnalytics() {
    const cu = typeof getCurrentUser === "function" ? getCurrentUser() || {} : {};
    const mentorName = cu.mentorName || cu.name;
    const myGroups = (D.groups || []).filter((g) => g.mentor === mentorName);
    const myStudents = (D.students || []).filter((s) => myGroups.some((g) => g.id === s.groupId));
    const now = new Date();
    const cy = now.getFullYear(), cm = now.getMonth();

    const attTrend = lastMonths(6).map((x) => ({ label: x.label, val: pctOf(attFor(myStudents, x.y, x.m)) }));

    const groupRows = myGroups.map((g) => {
      const gs = myStudents.filter((s) => s.groupId === g.id);
      return [
        esc(g.name),
        gs.length,
        pctCell(pctOf(attFor(gs, cy, cm))),
        avgOf(gs.map((s) => avgGrade(s.id))) ?? "—",
        gs.filter((s) => s.isDebtor).length,
      ];
    });

    // Baho taqsimoti
    const avgs = myStudents.map((s) => avgGrade(s.id)).filter((x) => x != null);
    const dist = [
      { label: "A'lo 86+", val: avgs.filter((x) => x >= 86).length, color: "#059669" },
      { label: "Yaxshi 71–85", val: avgs.filter((x) => x >= 71 && x < 86).length, color: "#0d9488" },
      { label: "Qoniq. 56–70", val: avgs.filter((x) => x >= 56 && x < 71).length, color: "#d97706" },
      { label: "Past <56", val: avgs.filter((x) => x < 56).length, color: "#dc2626" },
    ];

    // Xavf ostidagi talabalar
    const risk = myStudents
      .map((s) => {
        const pct = pctOf(attFor([s], cy, cm));
        const g = avgGrade(s.id);
        const reasons = [];
        if (pct != null && pct < 60) reasons.push(["Davomat " + pct + "%", "#dc2626"]);
        if (g != null && g < 56) reasons.push(["Baho " + g, "#d97706"]);
        if (s.isDebtor) reasons.push(["Qarzdor", "#ea580c"]);
        return { s, reasons };
      })
      .filter((x) => x.reasons.length)
      .sort((a, b) => b.reasons.length - a.reasons.length)
      .slice(0, 8);

    // Test natijalari
    const tests = myStudents.flatMap((s) => testResultsOf(s.id));
    const testAvg = avgOf(tests.map((t) => t.score));
    const gradeAvg = avgOf(avgs);
    const attNow = pctOf(attFor(myStudents, cy, cm));
    const prev = new Date(cy, cm - 1, 1);
    const attPrev = pctOf(attFor(myStudents, prev.getFullYear(), prev.getMonth()));
    const attDelta = attNow != null && attPrev != null ? attNow - attPrev : null;

    return `
<div class="xa-head">📈 Mening analitikam</div>
<div class="xa-tiles">
  ${tile("Davomat (bu oy)", attNow == null ? "—" : attNow + "%", attDelta == null ? "o'tgan oy ma'lumoti yo'q" : (attDelta >= 0 ? "▲ +" : "▼ ") + attDelta + "% o'tgan oyga", pctColor(attNow))}
  ${tile("O'rtacha baho", gradeAvg == null ? "—" : gradeAvg, `${avgs.length} ta talaba baholangan`, "#7c3aed")}
  ${tile("Test o'rtachasi", testAvg == null ? "—" : testAvg + "%", `${tests.length} ta natija`, "#6366f1")}
  ${tile("E'tibor kerak", risk.length, "talaba xavf ostida", risk.length ? "#dc2626" : "#059669")}
</div>
<div class="xa-grid">
  ${card("🗓️ Davomat trendi (6 oy)", columns(attTrend, { max: 100, suffix: "%", color: "#0d9488" }))}
  ${card("🏅 Baholar taqsimoti", columns(dist))}
  ${card(
    "⚠️ E'tibor talab qiladigan talabalar",
    risk.length
      ? risk
          .map(
            (x) => `<div class="xa-list-item"><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600">${esc(x.s.name)}</span>
            ${x.reasons.map(([t, c]) => `<span class="xa-tag" style="background:${c}1a;color:${c}">${t}</span>`).join("")}</div>`,
          )
          .join("")
      : `<div class="xa-empty">Hammasi joyida 🎉</div>`,
  )}
</div>
${card("🏫 Guruhlarim taqqoslash (bu oy)", table(["Guruh", "Talaba", "Davomat", "O'rt. baho", "Qarzdor"], groupRows, "Guruh yo'q"), 'style="margin-bottom:14px"')}`;
  }

  // ===================== TALABA =====================
  function studentAnalytics() {
    const cu = typeof getCurrentUser === "function" ? getCurrentUser() || {} : {};
    const sid = cu.studentId ? parseInt(cu.studentId) : null;
    const s = sid ? (D.students || []).find((x) => x.id === sid) : null;
    if (!s) return "";
    const mates = (D.students || []).filter((x) => x.groupId === s.groupId);

    const trend = lastMonths(6).map((x) => ({
      label: x.label,
      me: pctOf(attFor([s], x.y, x.m)),
      grp: pctOf(attFor(mates, x.y, x.m)),
    }));

    const grades = ((D.simpleGrades && D.simpleGrades[s.id]) || [])
      .slice()
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(-10);
    const gradeCols = grades.map((g) => {
      const d = new Date(g.date);
      const sc = Number(g.score) || 0;
      return {
        label: isNaN(d) ? "" : d.getDate() + "." + String(d.getMonth() + 1).padStart(2, "0"),
        val: sc,
        color: sc >= 71 ? "#0d9488" : sc >= 56 ? "#d97706" : "#dc2626",
      };
    });

    const myAvg = avgGrade(s.id);
    const grpAvg = avgOf(mates.map((x) => avgGrade(x.id)));
    const allAtt = (() => {
      let p = 0, mk = 0;
      Object.keys(D.attendance || {})
        .filter((k) => k.startsWith("att_" + s.groupId + "_"))
        .forEach((k) => {
          const sa = D.attendance[k]["s" + s.id] || {};
          for (let l = 1; l <= lessonCount(); l++) {
            const v = sa["l" + l] || "";
            if (v === "K") { p++; mk++; }
            else if (v === "Y" || v === "S") mk++;
          }
        });
      return { p, mk };
    })();
    const tests = testResultsOf(s.id).sort((a, b) => b.score - a.score);
    const testAvg = avgOf(tests.map((t) => t.score));
    const firstHalf = avgOf(grades.slice(0, Math.floor(grades.length / 2)).map((g) => Number(g.score) || 0));
    const secondHalf = avgOf(grades.slice(Math.floor(grades.length / 2)).map((g) => Number(g.score) || 0));
    const gradeTrend = firstHalf != null && secondHalf != null ? secondHalf - firstHalf : null;

    const compare = [
      { label: "Mening bahom", val: myAvg || 0, text: myAvg == null ? "—" : myAvg, color: "var(--accent)" },
      { label: "Guruh o'rtachasi", val: grpAvg || 0, text: grpAvg == null ? "—" : grpAvg, color: "#94a3b8" },
      { label: "Mening davomatim", val: trend[5].me || 0, text: trend[5].me == null ? "—" : trend[5].me + "%", color: "#0d9488" },
      { label: "Guruh davomati", val: trend[5].grp || 0, text: trend[5].grp == null ? "—" : trend[5].grp + "%", color: "#94a3b8" },
    ];

    return `
<div class="xa-head">📈 Mening natijalarim</div>
<div class="xa-tiles">
  ${tile("Jami darslar", allAtt.p + " / " + allAtt.mk, "qatnashgan / belgilangan", "#0d9488")}
  ${tile("O'rtacha baho", myAvg == null ? "—" : myAvg, gradeTrend == null ? "hali kam baho" : (gradeTrend >= 0 ? "▲ +" : "▼ ") + gradeTrend + " so'nggi baholarda", "#7c3aed")}
  ${tile("Test o'rtachasi", testAvg == null ? "—" : testAvg + "%", `${tests.length} ta test topshirilgan`, "#6366f1")}
  ${tile("Eng yaxshi test", tests.length ? tests[0].score + "%" : "—", tests.length ? esc(tests[0].title) : "hali yo'q", "#d97706")}
</div>
<div class="xa-grid">
  ${card(
    "🗓️ Davomatim trendi (6 oy)",
    columns(trend.map((x) => ({ label: x.label, val: x.me, color: pctColor(x.me) })), { max: 100, suffix: "%" }) +
      `<div class="xa-legend">${trend
        .map((x) => `<span>${esc(x.label)}: guruh ${x.grp == null ? "—" : x.grp + "%"}</span>`)
        .join("")}</div>`,
  )}
  ${card("🏅 So'nggi baholarim", gradeCols.length ? columns(gradeCols, { max: 100 }) : `<div class="xa-empty">Hali baho qo'yilmagan</div>`)}
  ${card("⚖️ Guruh bilan taqqoslash", bars(compare, { max: 100 }))}
</div>
${
  tests.length
    ? card(
        "📝 Test natijalarim",
        table(
          ["Test", "Natija"],
          tests.slice(0, 8).map((t) => [esc(t.title), pctCell(t.score)]),
          "",
        ),
        'style="margin-bottom:14px"',
      )
    : ""
}`;
  }

  // ===================== o'rash =====================
  function wrap(name, build, containerId) {
    const orig = window[name];
    if (typeof orig !== "function" || orig.__xa) return;
    const wrapped = function () {
      const r = orig.apply(this, arguments);
      try {
        const el = document.getElementById(containerId);
        if (el && window.D) mount(el, build());
      } catch (e) {
        console.warn("[dash-analytics] " + name + ":", e);
      }
      return r;
    };
    wrapped.__xa = true;
    window[name] = wrapped;
  }

  wrap("renderDashboard", adminAnalytics, "dash-charts");
  wrap("renderMentorDashboard", mentorAnalytics, "mentor-dash-wrap");
  wrap("renderStudentDashboard", studentAnalytics, "student-my-wrap");

  // Skript dashboard chizilganidan keyin yuklangan bo'lsa — darhol qo'shamiz.
  try {
    if (typeof currentTab !== "undefined") {
      if (currentTab === "dashboard") window.renderDashboard();
      else if (currentTab === "mentor-dash") window.renderMentorDashboard();
      else if (currentTab === "student-my") window.renderStudentDashboard();
    }
  } catch (e) {}
})();
