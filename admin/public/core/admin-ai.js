/* ============================================================================
   ADMIN AI YORDAMCHI — CRM ma'lumotlarini biladigan AI (faqat admin)
   ============================================================================
   Admin oddiy tilda savol beradi: "qaysi bola sust o'qiyapti?", "Frontend-3
   guruhida eng yaxshisi kim?", "kim ko'p dars qoldirgan?", "bu oy moliya
   qanday?" — AI CRM dagi haqiqiy ma'lumotga qarab javob beradi. Boshqa har
   qanday savolga ham (metodika, marketing, xat yozish va h.k.) javob beradi.

   QANDAY ISHLAYDI
   ---------------
   Har savolda brauzerdagi `D` dan IXCHAM hisobot quriladi: guruhlar, mentorlar,
   har bir talaba bo'yicha davomat (bu oy / oxirgi 3 oy, oxirgi darslar),
   baholar, testlar, coin, qarz va oldindan hisoblangan reyting. Bu hisobot
   AI ga tizim ko'rsatmasi (system prompt) sifatida yuboriladi — AI faqat shu
   raqamlarga tayanadi va ism o'ylab topmaydi.

   Telefon raqamlari, parollar va loginlar hisobotga KIRITILMAYDI.
   Backend: POST /api/ai-chat  { mode: "admin", system, messages }
   ========================================================================== */
(function () {
  "use strict";

  var HISTORY_KEY = "ai_history_admin";
  var MAX_CONTEXT = 180000; // belgi — juda katta markazda ham sig'sin
  var _focusGroup = ""; // "" = barcha guruhlar
  var _busy = false;

  /* ─── Yordamchilar ─────────────────────────────────────────────────────── */

  var L = function () {
    return typeof LANG !== "undefined" ? LANG : "uz";
  };
  var lessons = function () {
    return typeof LESSON_COUNT === "number" ? LESSON_COUNT : 12;
  };
  var esc = function (v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var money = function (n) {
    n = Math.round(Number(n) || 0);
    return typeof fmtMoney === "function"
      ? fmtMoney(n)
      : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  };
  var avg = function (arr) {
    var v = arr.filter(function (x) {
      return x != null && !isNaN(x);
    });
    return v.length
      ? Math.round(
          v.reduce(function (a, b) {
            return a + Number(b);
          }, 0) / v.length,
        )
      : null;
  };
  var pct = function (p, mk) {
    return mk > 0 ? Math.round((p / mk) * 100) : null;
  };
  var MON = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];

  function lastMonths(n) {
    var now = new Date();
    var out = [];
    for (var i = 0; i < n; i++) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push({ y: d.getFullYear(), m: d.getMonth() });
    }
    return out; // [bu oy, o'tgan oy, ...]
  }

  function coinsMap() {
    try {
      return JSON.parse(localStorage.getItem("edu_mentor_coins_v1") || "{}") || {};
    } catch (e) {
      return {};
    }
  }

  function debtOf(s) {
    try {
      if (typeof debtorAmount === "function") return debtorAmount(s) || 0;
    } catch (e) {}
    return 0;
  }

  /** Talabaning bir oylik davomati: K (keldi), Y (kelmadi), S (sababli). */
  function attMonth(s, y, m) {
    var row = ((D.attendance || {})["att_" + s.groupId + "_" + y + "_" + m] || {})["s" + s.id] || {};
    var r = { K: 0, Y: 0, S: 0, seq: [] };
    for (var l = 1; l <= lessons(); l++) {
      var v = row["l" + l] || "";
      if (v === "K" || v === "Y" || v === "S") {
        r[v]++;
        r.seq.push(v);
      }
    }
    return r;
  }

  /** Talaba bo'yicha barcha ko'rsatkichlar. */
  function studentStats(s, coins) {
    var months = lastMonths(3);
    var cur = attMonth(s, months[0].y, months[0].m);
    var K = 0, Y = 0, S = 0, seq = [];
    months
      .slice()
      .reverse()
      .forEach(function (x) {
        var a = attMonth(s, x.y, x.m);
        K += a.K;
        Y += a.Y;
        S += a.S;
        seq = seq.concat(a.seq);
      });

    var grades = ((D.simpleGrades || {})[s.id] || []).slice().sort(function (a, b) {
      return String(a.date || "").localeCompare(String(b.date || ""));
    });
    var gScores = grades.map(function (g) {
      return Number(g.score);
    });

    var tests = [];
    var res = D.testResults || {};
    Object.keys(res).forEach(function (tid) {
      var r = res[tid] && res[tid][s.id];
      if (!r || r.score == null) return;
      var t = (D.tests || []).find(function (x) {
        return String(x.id) === String(tid);
      });
      tests.push({ title: t ? t.title : "Test", score: Number(r.score) || 0 });
    });

    // Sababli (S) darslar davomat foiziga ta'sir qilmaydi
    var att3 = pct(K, K + Y);
    var gAvg = avg(gScores);
    var tAvg = avg(
      tests.map(function (t) {
        return t.score;
      }),
    );
    // Umumiy ball: davomat va o'zlashtirish (bor bo'lganlari) o'rtachasi
    var score = avg([att3, gAvg, tAvg]);

    // Ketma-ket qoldirilgan oxirgi darslar
    var missRow = 0;
    for (var i = seq.length - 1; i >= 0 && seq[i] === "Y"; i--) missRow++;

    return {
      s: s,
      curPct: pct(cur.K, cur.K + cur.Y),
      cur: cur,
      att3: att3,
      K: K,
      Y: Y,
      S: S,
      last: seq.slice(-6).join(""),
      missRow: missRow,
      gAvg: gAvg,
      gN: gScores.length,
      gLast: gScores.slice(-3),
      tAvg: tAvg,
      tests: tests,
      coins: coins["s_" + s.id] || 0,
      debt: s.isDebtor ? debtOf(s) : 0,
      score: score,
    };
  }

  /* ─── Hisobot (AI ga beriladigan kontekst) ──────────────────────────────── */

  function buildContext() {
    var now = new Date();
    var coins = coinsMap();
    var groups = D.groups || [];
    var courses = D.courses || [];
    var allStudents = (D.students || []).filter(function (s) {
      return s.status !== "Arxiv";
    });
    var archived = (D.students || []).length - allStudents.length;
    var stats = allStudents.map(function (s) {
      return studentStats(s, coins);
    });
    var byGroup = {};
    stats.forEach(function (x) {
      (byGroup[x.s.groupId] = byGroup[x.s.groupId] || []).push(x);
    });
    var groupName = function (id) {
      var g = groups.find(function (x) {
        return x.id === id;
      });
      return g ? g.name : "Guruhsiz";
    };
    var courseName = function (id) {
      var c = courses.find(function (x) {
        return String(x.id) === String(id);
      });
      return c ? c.name : "";
    };
    var fmtN = function (v, suf) {
      return v == null ? "—" : v + (suf || "");
    };

    var out = [];
    out.push("BUGUN: " + now.getDate() + "-" + MON[now.getMonth()] + " " + now.getFullYear() + ".");
    out.push(
      "UMUMIY: aktiv talabalar " + allStudents.length + " ta, arxivda " + archived +
        " ta, guruhlar " + groups.length + " ta, mentorlar " + (D.mentors || []).length +
        " ta, kurslar " + courses.length + " ta.",
    );

    // Kurslar
    if (courses.length)
      out.push(
        "\nKURSLAR:\n" +
          courses
            .map(function (c) {
              var bits = [c.name];
              if (c.price) bits.push("narxi " + money(c.price) + " so'm");
              if (c.duration) bits.push("davomiyligi " + c.duration);
              return "- " + bits.join(", ");
            })
            .join("\n"),
      );

    // Mentorlar
    if ((D.mentors || []).length)
      out.push(
        "\nMENTORLAR:\n" +
          D.mentors
            .map(function (m) {
              var gs = groups
                .filter(function (g) {
                  return g.mentor === m.name;
                })
                .map(function (g) {
                  return g.name;
                });
              return "- " + m.name + (gs.length ? " — guruhlari: " + gs.join(", ") : " — guruhi yo'q");
            })
            .join("\n"),
      );

    // Guruhlar
    out.push(
      "\nGURUHLAR (bu oy davomati, oxirgi 3 oy davomati, o'rtacha baho, talabalar soni):\n" +
        groups
          .map(function (g) {
            var list = byGroup[g.id] || [];
            var K = 0, M = 0, curK = 0, curM = 0;
            list.forEach(function (x) {
              K += x.K;
              M += x.K + x.Y;
              curK += x.cur.K;
              curM += x.cur.K + x.cur.Y;
            });
            var bits = [
              g.name,
              "mentor: " + (g.mentor || "—"),
              courseName(g.courseId) ? "kurs: " + courseName(g.courseId) : "",
              g.days ? "kunlari: " + (Array.isArray(g.days) ? g.days.join(",") : g.days) : "",
              g.time ? "vaqti: " + g.time : "",
              "talabalar: " + list.length,
              "davomat bu oy: " + fmtN(pct(curK, curM), "%"),
              "3 oy: " + fmtN(pct(K, M), "%"),
              "o'rt. baho: " + fmtN(avg(list.map(function (x) { return x.gAvg; }))),
              "qarzdorlar: " + list.filter(function (x) { return x.s.isDebtor; }).length,
            ].filter(Boolean);
            return "- " + bits.join(" | ");
          })
          .join("\n"),
    );

    // Oldindan hisoblangan reyting — AI xato hisoblamasligi uchun
    var rankLines = [];
    groups.forEach(function (g) {
      var list = (byGroup[g.id] || []).filter(function (x) {
        return x.score != null;
      });
      if (!list.length) return;
      list.sort(function (a, b) {
        return b.score - a.score;
      });
      var nm = function (x) {
        return x.s.name + " (" + x.score + ")";
      };
      // Ro'yxatlar bir-birini takrorlamasin (kichik guruhlarda)
      var top = list.slice(0, 3).map(nm);
      var weak = list.slice(Math.max(3, list.length - 3)).reverse().map(nm);
      rankLines.push(
        "- " + g.name + ": eng yaxshilar — " + top.join(", ") +
          (weak.length ? "; eng sustlar — " + weak.join(", ") : ""),
      );
    });
    var sorted = stats
      .filter(function (x) {
        return x.score != null;
      })
      .sort(function (a, b) {
        return b.score - a.score;
      });
    if (sorted.length) {
      var nmG = function (x) {
        return x.s.name + " (" + x.score + ", " + groupName(x.s.groupId) + ")";
      };
      rankLines.unshift(
        sorted.length <= 5
          ? "- BUTUN MARKAZ (yaxshidan sustga): " + sorted.map(nmG).join(", ")
          : "- BUTUN MARKAZ: eng yaxshi 5 — " + sorted.slice(0, 5).map(nmG).join(", ") +
              "\n- BUTUN MARKAZ: eng sust 5 — " +
              sorted.slice(Math.max(5, sorted.length - 5)).reverse().map(nmG).join(", "),
      );
    }
    var risk = stats.filter(function (x) {
      return (x.att3 != null && x.att3 < 70) || x.missRow >= 2 || (x.gAvg != null && x.gAvg < 60);
    });
    out.push(
      "\nREYTING (umumiy ball = davomat %, o'rtacha baho va test o'rtachasining o'rtachasi, 0–100):\n" +
        (rankLines.join("\n") || "- ma'lumot yetarli emas") +
        "\n- XAVF GURUHIDAGILAR (3 oylik davomat < 70% yoki ketma-ket 2+ dars qoldirgan yoki o'rtacha baho < 60): " +
        (risk.length
          ? risk
              .map(function (x) {
                return x.s.name + " (" + groupName(x.s.groupId) + ")";
              })
              .join(", ")
          : "yo'q"),
    );

    // Moliya
    try {
      if (typeof getFinanceForMonth === "function") {
        var fin = lastMonths(2).map(function (x) {
          var t = { income: 0, expense: 0, salary: 0 };
          getFinanceForMonth(x.m, x.y).forEach(function (tx) {
            if (t[tx.type] != null) t[tx.type] += Number(tx.amount) || 0;
          });
          return MON[x.m] + ": kirim " + money(t.income) + ", xarajat " + money(t.expense) +
            ", oylik " + money(t.salary) + ", sof foyda " + money(t.income - t.expense - t.salary) + " so'm";
        });
        var totalDebt = stats.reduce(function (a, x) {
          return a + x.debt;
        }, 0);
        out.push(
          "\nMOLIYA:\n- " + fin.join("\n- ") +
            "\n- Qarzdorlar: " + stats.filter(function (x) { return x.s.isDebtor; }).length +
            " ta, jami qarz " + money(totalDebt) + " so'm",
        );
      }
    } catch (e) {}

    // Talabalar — har biri bitta qator
    var focus = _focusGroup ? Number(_focusGroup) : null;
    var lines = stats
      .filter(function (x) {
        return !focus || x.s.groupId === focus;
      })
      .map(function (x) {
        var s = x.s;
        var bits = [
          s.name,
          groupName(s.groupId),
          s.status || "Aktiv",
          s.joinDate ? "qo'shilgan " + String(s.joinDate).slice(0, 10) : "",
          "davomat bu oy " + fmtN(x.curPct, "%") + " (K" + x.cur.K + "/Y" + x.cur.Y + "/S" + x.cur.S + ")",
          "3 oy " + fmtN(x.att3, "%") + " (K" + x.K + "/Y" + x.Y + "/S" + x.S + ")",
          x.last ? "oxirgi darslar " + x.last : "",
          x.missRow >= 2 ? "KETMA-KET " + x.missRow + " DARS QOLDIRGAN" : "",
          "baho o'rt " + fmtN(x.gAvg) + (x.gN ? " (" + x.gN + " ta, oxirgilari " + x.gLast.join(",") + ")" : ""),
          x.tests.length ? "testlar o'rt " + x.tAvg + " (" + x.tests.length + " ta)" : "test yo'q",
          "coin " + x.coins,
          s.isDebtor ? "QARZDOR " + money(x.debt) + " so'm" : "",
          "umumiy ball " + fmtN(x.score),
        ].filter(Boolean);
        return "- " + bits.join(" | ");
      });
    out.push(
      "\nTALABALAR" + (focus ? " (faqat " + groupName(focus) + " guruhi)" : "") +
        " [K=keldi, Y=kelmadi, S=sababli; davomat % = K/(K+Y), sababli dars hisobga olinmaydi]:\n" +
        (lines.join("\n") || "- talaba yo'q"),
    );

    var txt = out.join("\n");
    if (txt.length > MAX_CONTEXT)
      txt =
        txt.slice(0, MAX_CONTEXT) +
        "\n…(ro'yxat juda uzun — qolgani qisqartirildi. Aniqroq javob uchun guruhni tanlash mumkin.)";
    return txt;
  }

  function systemPrompt() {
    var lang = L();
    var langRule =
      lang === "ru"
        ? "Отвечай на русском языке."
        : lang === "en"
          ? "Answer in English."
          : "Foydalanuvchi qaysi tilda yozsa, o'sha tilda javob ber (odatda o'zbekcha, lotin yozuvida).";
    return (
      "Sen o'quv markazi ADMINISTRATORINING shaxsiy AI yordamchisisan. Quyida markazning CRM dagi " +
      "HAQIQIY ma'lumotlari berilgan.\n\n" +
      "QOIDALAR:\n" +
      "1. Talabalar, guruhlar, davomat, baholar, coin, qarz va moliya haqidagi savollarga FAQAT quyidagi " +
      "ma'lumotga tayanib javob ber. Ism, raqam yoki fakt o'ylab topma. Ma'lumot bo'lmasa — ochiq ayt.\n" +
      "2. Javobda aniq ismlar, guruh nomlari va raqamlarni ko'rsat (masalan davomat %, o'rtacha baho, " +
      "qoldirgan darslar). Nega shunday xulosa qilganingni qisqa tushuntir.\n" +
      "3. 'Sust', 'yaxshi', 'eng yaxshi' kabi savollarda REYTING bo'limidagi umumiy balldan foydalan, " +
      "lekin davomat va baholarni ham hisobga olib izohla. Kerak bo'lsa nima qilish kerakligini " +
      "(ota-onaga qo'ng'iroq, qo'shimcha dars, rag'batlantirish) tavsiya qil.\n" +
      "4. Ro'yxat va solishtirishlar uchun raqamlangan ro'yxat yoki jadval (markdown) ishlat.\n" +
      "5. CRM ga aloqasi yo'q savollarga ham (metodika, marketing, xabar/e'lon matni, reja tuzish, " +
      "umumiy bilim va h.k.) to'liq va foydali javob ber — sen hamma narsada yordam beradigan yordamchisan.\n" +
      "6. Qisqa va aniq yoz, ortiqcha kirish so'zlarisiz. " + langRule + "\n\n" +
      "===== CRM MA'LUMOTLARI =====\n" +
      buildContext() +
      "\n===== MA'LUMOTLAR TUGADI ====="
    );
  }

  /* ─── Tarix ─────────────────────────────────────────────────────────────── */

  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]") || [];
    } catch (e) {
      return [];
    }
  }
  function saveHistory(h) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(-30)));
    } catch (e) {}
  }

  /* ─── Markdown (sarlavha, ro'yxat, jadval, qalin) ───────────────────────── */

  function inline(s) {
    return s
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/`([^`]+)`/g, '<code class="aai-code">$1</code>');
  }

  function md(text) {
    var lines = esc(text).split("\n");
    var html = [];
    var list = null; // "ul" | "ol"
    var closeList = function () {
      if (list) html.push("</" + list + ">");
      list = null;
    };
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      // Jadval: | a | b | qatorlari ketma-ket
      if (/^\s*\|.*\|\s*$/.test(ln)) {
        closeList();
        var rows = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++]);
        i--;
        var cells = function (r) {
          return r.trim().replace(/^\||\|$/g, "").split("|").map(function (c) {
            return inline(c.trim());
          });
        };
        var body = rows.filter(function (r) {
          return !/^\s*\|[\s:|-]+\|\s*$/.test(r);
        });
        if (!body.length) continue;
        html.push(
          '<div class="aai-table-wrap"><table class="aai-table"><thead><tr>' +
            cells(body[0]).map(function (c) { return "<th>" + c + "</th>"; }).join("") +
            "</tr></thead><tbody>" +
            body.slice(1).map(function (r) {
              return "<tr>" + cells(r).map(function (c) { return "<td>" + c + "</td>"; }).join("") + "</tr>";
            }).join("") +
            "</tbody></table></div>",
        );
        continue;
      }
      var h = /^(#{1,4})\s+(.*)$/.exec(ln);
      if (h) {
        closeList();
        html.push('<div class="aai-h">' + inline(h[2]) + "</div>");
        continue;
      }
      if (/^\s*([-*_])\1{2,}\s*$/.test(ln)) {
        closeList();
        html.push('<hr class="aai-hr">');
        continue;
      }
      var ul = /^\s*[-*•]\s+(.*)$/.exec(ln);
      var ol = /^\s*(\d+)[.)]\s+(.*)$/.exec(ln);
      // Raqamli band ostidagi (surilgan) kichik bandlar — o'sha band ichiga
      if (ul && list === "ol" && /^\s{2,}/.test(ln) && /<\/li>$/.test(html[html.length - 1] || "")) {
        var last = html[html.length - 1];
        var item = "<li>" + inline(ul[1]) + "</li>";
        html[html.length - 1] = /<\/ul><\/li>$/.test(last)
          ? last.replace(/<\/ul><\/li>$/, item + "</ul></li>")
          : last.replace(/<\/li>$/, "<ul>" + item + "</ul></li>");
        continue;
      }
      if (ul || ol) {
        var kind = ul ? "ul" : "ol";
        if (list !== kind) {
          closeList();
          // Raqamli ro'yxat orasida boshqa qator bo'lsa ham raqam davom etsin
          html.push(ol ? '<ol start="' + ol[1] + '">' : "<ul>");
          list = kind;
        }
        html.push("<li>" + inline(ul ? ul[1] : ol[2]) + "</li>");
        continue;
      }
      closeList();
      html.push(ln.trim() ? "<p>" + inline(ln) + "</p>" : "");
    }
    closeList();
    return html.join("");
  }

  /* ─── UI ────────────────────────────────────────────────────────────────── */
  /* Panel o'z uslublari bilan chiziladi (aai-*): mentor/talaba chatining eski
     klasslariga tayanmaydi, shuning uchun balandlik, ramka va mobil ko'rinish
     shu yerda to'liq boshqariladi. Ranglar — CRM mavzusi o'zgaruvchilari,
     yorug' va qorong'i rejimda ham mos chiqadi. */

  var SUGGEST = [
    { ic: "📉", t: "Sust o'qiyotganlar", d: "Davomati va bahosi past talabalar va sababi", q: "Qaysi talabalar sust o'qiyapti va nima uchun? Har biriga nima qilish kerakligini ham ayt." },
    { ic: "🏆", t: "Eng yaxshi talabalar", d: "Har bir guruhning peshqadamlari", q: "Har bir guruhda eng yaxshi talaba kim? Jadval qilib ber." },
    { ic: "🚫", t: "Dars qoldiruvchilar", d: "Kimning ota-onasiga qo'ng'iroq qilish kerak", q: "Kim ko'p dars qoldiryapti yoki ketma-ket kelmayapti? Kimning ota-onasiga qo'ng'iroq qilish kerak?" },
    { ic: "💸", t: "Qarzdorlar", d: "Ro'yxat, summalar va jami qarz", q: "Qarzdorlar ro'yxatini summasi bilan ber va jami qarzni hisobla." },
    { ic: "📊", t: "Guruhlarni solishtirish", d: "Davomat va o'zlashtirish bo'yicha", q: "Guruhlarni davomat va o'zlashtirish bo'yicha solishtir. Qaysi guruh eng yaxshi, qaysi biri e'tibor talab qiladi?" },
    { ic: "💰", t: "Moliya holati", d: "Bu oy kirim, xarajat va foyda", q: "Bu oy moliya holati qanday? O'tgan oy bilan solishtir." },
  ];

  var STATUS_STEPS = ["Ma'lumotlar yig'ilmoqda…", "Tahlil qilinmoqda…", "Javob yozilmoqda…"];
  var _lastError = "";
  var _statusTimer = null;

  var ICON = {
    spark:
      '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>',
    send:
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>',
    plus:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    copy:
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
    retry:
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
  };

  function injectStyles() {
    if (document.getElementById("aai-styles")) return;
    var st = document.createElement("style");
    st.id = "aai-styles";
    st.textContent = [
      "#panel-admin-ai{padding:0}",
      ".aai{display:flex;flex-direction:column;height:calc(100dvh - 64px - 48px);min-height:520px;background:var(--bg2);border:1px solid var(--border);border-radius:20px;overflow:hidden;box-shadow:var(--shadow-sm)}",
      /* Sarlavha */
      ".aai-head{display:flex;align-items:center;gap:14px;padding:14px 18px;border-bottom:1px solid var(--border);flex-wrap:wrap}",
      ".aai-logo{width:42px;height:42px;border-radius:13px;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#fff;background:linear-gradient(135deg,var(--accent),var(--purple,#7c3aed));box-shadow:0 6px 16px rgba(59,130,246,.28)}",
      ".aai-title{font-size:16px;font-weight:800;color:var(--text);letter-spacing:-.2px;line-height:1.2}",
      ".aai-sub{font-size:12px;color:var(--text3);display:flex;align-items:center;gap:6px;margin-top:2px}",
      ".aai-dot{width:7px;height:7px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.18)}",
      ".aai-stats{display:flex;gap:8px;flex-wrap:wrap;margin-left:auto}",
      ".aai-stat{display:flex;flex-direction:column;padding:6px 12px;border-radius:12px;background:var(--bg3);border:1px solid var(--border);min-width:74px}",
      ".aai-stat b{font-size:15px;font-weight:800;color:var(--text);line-height:1.2}",
      ".aai-stat span{font-size:10.5px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.04em}",
      ".aai-new{display:flex;align-items:center;gap:6px;height:36px;padding:0 12px;border-radius:10px;border:1px solid var(--border2);background:var(--bg2);color:var(--text2);font-size:12.5px;font-weight:700;cursor:pointer;transition:.15s}",
      ".aai-new:hover{border-color:var(--accent);color:var(--accent)}",
      /* Xabarlar */
      ".aai-body{flex:1;min-height:0;overflow-y:auto;padding:24px 18px;background:var(--bg)}",
      ".aai-thread{max-width:880px;margin:0 auto;display:flex;flex-direction:column;gap:18px}",
      ".aai-row{display:flex;gap:10px;align-items:flex-start;animation:aaiIn .22s ease}",
      "@keyframes aaiIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}",
      ".aai-row-user{justify-content:flex-end}",
      ".aai-user{max-width:78%;background:var(--accent);color:#fff;padding:10px 15px;border-radius:18px 18px 4px 18px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-break:break-word;box-shadow:0 4px 12px rgba(59,130,246,.22)}",
      ".aai-av{width:32px;height:32px;border-radius:10px;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#fff;background:linear-gradient(135deg,var(--accent),var(--purple,#7c3aed))}",
      ".aai-av svg{width:17px;height:17px}",
      ".aai-col{flex:1;min-width:0}",
      ".aai-ans{background:var(--bg2);border:1px solid var(--border);border-radius:4px 18px 18px 18px;padding:14px 18px;font-size:14px;line-height:1.65;color:var(--text);word-break:break-word;box-shadow:var(--shadow-sm)}",
      ".aai-ans p{margin:0 0 8px}.aai-ans p:last-child{margin-bottom:0}",
      ".aai-ans ul,.aai-ans ol{margin:4px 0 10px;padding-left:22px}.aai-ans li{margin:3px 0}",
      ".aai-ans strong{font-weight:700;color:var(--text)}",
      ".aai-h{font-weight:800;font-size:15px;margin:12px 0 6px;color:var(--text)}.aai-ans>.aai-h:first-child{margin-top:0}",
      ".aai-hr{border:0;border-top:1px solid var(--border);margin:12px 0}",
      ".aai-code{background:var(--bg3);border:1px solid var(--border);padding:1px 6px;border-radius:6px;font-size:.88em}",
      ".aai-table-wrap{overflow-x:auto;margin:8px 0 12px;border:1px solid var(--border);border-radius:12px}",
      ".aai-table{border-collapse:collapse;font-size:13px;width:100%}",
      ".aai-table th{background:var(--bg3);font-weight:700;font-size:11.5px;text-transform:uppercase;letter-spacing:.03em;color:var(--text2);text-align:left;padding:9px 12px;border-bottom:1px solid var(--border);white-space:nowrap}",
      ".aai-table td{padding:9px 12px;border-bottom:1px solid var(--border);white-space:nowrap}",
      ".aai-table tr:last-child td{border-bottom:0}.aai-table tbody tr:nth-child(even) td{background:var(--bg3)}",
      ".aai-acts{display:flex;gap:6px;margin-top:6px}",
      ".aai-act{display:flex;align-items:center;gap:5px;padding:4px 9px;border-radius:8px;border:0;background:transparent;color:var(--text3);font-size:12px;font-weight:600;cursor:pointer}",
      ".aai-act:hover{background:var(--bg3);color:var(--text)}",
      ".aai-ans-wait{display:inline-block}",
      ".aai-err{background:var(--orange-light,#fff7ed);border-color:transparent;color:var(--orange-text,#9a3412)}",
      /* Yozilmoqda */
      ".aai-typing{display:flex;align-items:center;gap:10px;color:var(--text3);font-size:13px}",
      ".aai-dots{display:inline-flex;gap:4px}.aai-dots i{width:7px;height:7px;border-radius:50%;background:var(--accent);opacity:.35;animation:aaiDot 1.2s infinite}",
      ".aai-dots i:nth-child(2){animation-delay:.15s}.aai-dots i:nth-child(3){animation-delay:.3s}",
      "@keyframes aaiDot{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}",
      /* Bo'sh holat */
      ".aai-empty{max-width:760px;margin:0 auto;text-align:center;padding:12px 0 8px}",
      ".aai-empty .aai-logo{width:60px;height:60px;border-radius:18px;margin:0 auto 14px}",
      ".aai-empty .aai-logo svg{width:30px;height:30px}",
      ".aai-empty h2{font-size:22px;font-weight:800;color:var(--text);margin:0 0 6px;letter-spacing:-.4px}",
      ".aai-empty p{font-size:14px;color:var(--text3);margin:0 auto 22px;max-width:520px;line-height:1.6}",
      ".aai-sugg{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;text-align:left}",
      ".aai-card{display:flex;gap:12px;align-items:flex-start;padding:14px;border-radius:14px;border:1px solid var(--border);background:var(--bg2);cursor:pointer;transition:.15s;font:inherit;color:inherit;text-align:left}",
      ".aai-card:hover{border-color:var(--accent);transform:translateY(-1px);box-shadow:0 6px 18px rgba(15,23,42,.08)}",
      ".aai-card-ic{width:38px;height:38px;border-radius:11px;background:var(--accent-light);display:flex;align-items:center;justify-content:center;font-size:19px;flex-shrink:0}",
      ".aai-card b{display:block;font-size:13.5px;font-weight:700;color:var(--text);margin-bottom:2px}",
      ".aai-card span{display:block;font-size:12px;color:var(--text3);line-height:1.45}",
      /* Yozish maydoni */
      ".aai-foot{padding:12px 18px 14px;border-top:1px solid var(--border);background:var(--bg2)}",
      ".aai-box{max-width:880px;margin:0 auto;border:1.5px solid var(--border2);border-radius:16px;background:var(--bg);padding:10px 10px 8px 14px;transition:border-color .15s,box-shadow .15s}",
      ".aai-box:focus-within{border-color:var(--accent);box-shadow:0 0 0 4px var(--accent-light)}",
      ".aai-input{width:100%;border:0;outline:0;resize:none;background:transparent;color:var(--text);font:inherit;font-size:14px;line-height:1.5;min-height:24px;max-height:160px;padding:2px 0;overflow:hidden}",
      ".aai-input::placeholder{color:var(--text3)}",
      ".aai-tools{display:flex;align-items:center;gap:8px;margin-top:6px}",
      ".aai-select{height:32px;max-width:220px;padding:0 10px;border-radius:9px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);font-size:12.5px;font-weight:600;cursor:pointer}",
      ".aai-hint{margin-left:auto;font-size:11.5px;color:var(--text3)}",
      ".aai-send{width:38px;height:38px;border-radius:12px;border:0;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:.15s}",
      ".aai-send:hover{background:var(--accent-dark,#2563eb)}.aai-send:disabled{opacity:.4;cursor:not-allowed}",
      ".aai-disc{max-width:880px;margin:8px auto 0;text-align:center;font-size:11px;color:var(--text3)}",
      /* Telefon */
      "@media (max-width:900px){.aai{height:calc(100dvh - 64px - 24px);min-height:420px;border-radius:16px}" +
        ".aai-stats{display:none}.aai-head{padding:12px 14px;flex-wrap:nowrap}.aai-head>div:nth-child(2){flex:1}.aai-new{margin-left:auto;padding:0 10px}.aai-new span{display:none}.aai-sub{font-size:11.5px}.aai-card{padding:11px}.aai-body{padding:16px 12px}" +
        ".aai-sugg{grid-template-columns:1fr}.aai-user{max-width:88%}.aai-hint{display:none}" +
        ".aai-ans{padding:12px 14px;font-size:13.5px}.aai-foot{padding:10px 10px calc(10px + env(safe-area-inset-bottom,0px))}" +
        ".aai-empty h2{font-size:19px}.aai-select{max-width:160px}.aai-av{display:none}}",
    ].join("");
    document.head.appendChild(st);
  }

  /** Sarlavhadagi tezkor ko'rsatkichlar. */
  function headerStats() {
    var st = (D.students || []).filter(function (s) {
      return s.status !== "Arxiv";
    });
    var now = new Date();
    var K = 0, Y = 0;
    st.forEach(function (s) {
      var a = attMonth(s, now.getFullYear(), now.getMonth());
      K += a.K;
      Y += a.Y;
    });
    var att = pct(K, K + Y);
    return [
      { v: st.length, l: "Talaba" },
      { v: (D.groups || []).length, l: "Guruh" },
      { v: st.filter(function (s) { return s.isDebtor; }).length, l: "Qarzdor" },
      { v: att == null ? "—" : att + "%", l: "Davomat" },
    ];
  }

  function renderAdminAI() {
    var wrap = document.getElementById("admin-ai-wrap");
    if (!wrap || typeof D === "undefined") return;
    // Javob kutilayotganda qayta chizmaymiz (live-sync ham shu funksiyani chaqiradi)
    if (_busy && wrap.querySelector("#aai-body")) return;
    var keepInput = (document.getElementById("aai-input") || {}).value || "";
    injectStyles();

    var gOpts =
      '<option value="">👥 Barcha guruhlar</option>' +
      (D.groups || [])
        .map(function (g) {
          return '<option value="' + g.id + '"' + (String(g.id) === String(_focusGroup) ? " selected" : "") + ">" + esc(g.name) + "</option>";
        })
        .join("");

    wrap.innerHTML =
      '<div class="aai">' +
      '<div class="aai-head">' +
      '<div class="aai-logo">' + ICON.spark + "</div>" +
      '<div style="min-width:0"><div class="aai-title">AI Yordamchi</div>' +
      '<div class="aai-sub"><span class="aai-dot"></span>Markaz ma\'lumotlari asosida javob beradi</div></div>' +
      '<div class="aai-stats">' +
      headerStats()
        .map(function (x) {
          return '<div class="aai-stat"><b>' + esc(x.v) + "</b><span>" + esc(x.l) + "</span></div>";
        })
        .join("") +
      "</div>" +
      '<button class="aai-new" onclick="adminAiClear()" title="Suhbatni tozalab, yangisini boshlash">' + ICON.plus + "<span>Yangi suhbat</span></button>" +
      "</div>" +
      '<div class="aai-body" id="aai-body"><div class="aai-thread" id="aai-msgs"></div></div>' +
      '<div class="aai-foot">' +
      '<div class="aai-box">' +
      '<textarea id="aai-input" class="aai-input" rows="1" placeholder="Savolingizni yozing…" ' +
      "onkeydown=\"if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();adminAiSend()}\" " +
      "oninput=\"this.style.height='auto';this.style.height=Math.min(this.scrollHeight,160)+'px';this.style.overflowY=this.scrollHeight>160?'auto':'hidden'\"></textarea>" +
      '<div class="aai-tools">' +
      '<select id="aai-group" class="aai-select" onchange="adminAiSetGroup(this.value)" title="Savollarni bitta guruhga yo\'naltirish">' + gOpts + "</select>" +
      '<span class="aai-hint">Enter — yuborish · Shift+Enter — yangi qator</span>' +
      '<button class="aai-send" id="aai-send" onclick="adminAiSend()" title="Yuborish">' + ICON.send + "</button>" +
      "</div></div>" +
      '<div class="aai-disc">AI xato qilishi mumkin — muhim qarorlardan oldin raqamlarni tekshirib ko\'ring.</div>' +
      "</div></div>";

    var inp = document.getElementById("aai-input");
    if (inp && keepInput) inp.value = keepInput;
    renderMessages();
  }

  function rowUser(text) {
    return '<div class="aai-row aai-row-user"><div class="aai-user">' + esc(text) + "</div></div>";
  }

  function rowBot(inner, acts, extraCls) {
    return (
      '<div class="aai-row"><div class="aai-av">' + ICON.spark + '</div><div class="aai-col">' +
      '<div class="aai-ans' + (extraCls ? " " + extraCls : "") + '">' + inner + "</div>" +
      (acts ? '<div class="aai-acts">' + acts + "</div>" : "") +
      "</div></div>"
    );
  }

  function renderMessages() {
    var box = document.getElementById("aai-msgs");
    if (!box) return;
    var h = loadHistory();
    var html = "";

    if (!h.length && !_busy) {
      html =
        '<div class="aai-empty">' +
        '<div class="aai-logo">' + ICON.spark + "</div>" +
        "<h2>Salom! Nima haqida bilmoqchisiz?</h2>" +
        "<p>Men markazingizdagi talabalar, guruhlar, davomat, baholar, qarzlar va moliyani bilaman. " +
        "Aniq ismlar va raqamlar bilan javob beraman — boshqa har qanday savolga ham yordam beraman.</p>" +
        '<div class="aai-sugg">' +
        SUGGEST.map(function (s, i) {
          return (
            '<button class="aai-card" onclick="adminAiSuggest(' + i + ')">' +
            '<div class="aai-card-ic">' + s.ic + "</div>" +
            "<div><b>" + esc(s.t) + "</b><span>" + esc(s.d) + "</span></div></button>"
          );
        }).join("") +
        "</div></div>";
    }

    h.forEach(function (m, i) {
      if (m.role === "user") html += rowUser(m.content);
      else
        html += rowBot(
          md(m.content),
          '<button class="aai-act" onclick="adminAiCopy(' + i + ')">' + ICON.copy + "Nusxalash</button>",
        );
    });

    if (_busy)
      html += rowBot(
        '<div class="aai-typing"><span class="aai-dots"><i></i><i></i><i></i></span>' +
          '<span id="aai-status">' + STATUS_STEPS[0] + "</span></div>",
        "",
        "aai-ans-wait",
      );
    else if (_lastError)
      html += rowBot(
        "⚠️ Javob olinmadi: " + esc(_lastError),
        '<button class="aai-act" onclick="adminAiRetry()">' + ICON.retry + "Qayta urinish</button>",
        "aai-err",
      );

    box.innerHTML = html;
    var body = document.getElementById("aai-body");
    // Bo'sh holat tepadan, suhbat esa oxirgi xabardan ko'rinsin
    if (body) body.scrollTop = !h.length && !_busy ? 0 : body.scrollHeight;
  }

  function apiBase() {
    try {
      if (typeof __API_BASE__ !== "undefined" && __API_BASE__) return __API_BASE__;
    } catch (e) {}
    return window.__API_BASE__ || "";
  }

  /** Oxirgi savolga javob so'raydi (tarixdagi oxirgi xabar — foydalanuvchiniki). */
  async function requestReply() {
    var btn = document.getElementById("aai-send");
    _busy = true;
    _lastError = "";
    if (btn) btn.disabled = true;
    renderMessages();

    var step = 0;
    clearInterval(_statusTimer);
    _statusTimer = setInterval(function () {
      step = Math.min(step + 1, STATUS_STEPS.length - 1);
      var el = document.getElementById("aai-status");
      if (el) el.textContent = STATUS_STEPS[step];
    }, 2500);

    var h = loadHistory();
    try {
      var res = await fetch(apiBase() + "/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "admin",
          system: systemPrompt(),
          // Oxirgi 12 ta xabar — suhbat konteksti uchun yetarli
          messages: h.slice(-12).map(function (m) {
            return { role: m.role, content: m.content };
          }),
        }),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data.ok) throw new Error(data.error || "Server xato: " + res.status);
      var h2 = loadHistory();
      h2.push({ role: "assistant", content: data.text || "..." });
      saveHistory(h2);
    } catch (e) {
      _lastError = (e && e.message) || "noma'lum xato";
    }
    clearInterval(_statusTimer);
    _busy = false;
    var btn2 = document.getElementById("aai-send");
    if (btn2) btn2.disabled = false;
    renderMessages();
    var inp = document.getElementById("aai-input");
    if (inp) inp.focus();
  }

  function adminAiSend() {
    var inp = document.getElementById("aai-input");
    if (!inp || _busy) return;
    var text = inp.value.trim();
    if (!text) return;
    inp.value = "";
    inp.style.height = "auto";
    var h = loadHistory();
    h.push({ role: "user", content: text });
    saveHistory(h);
    requestReply();
  }

  window.renderAdminAI = renderAdminAI;
  window.adminAiSend = adminAiSend;
  window.adminAiAsk = function (q) {
    var inp = document.getElementById("aai-input");
    if (!inp) return;
    inp.value = q;
    adminAiSend();
  };
  window.adminAiSuggest = function (i) {
    if (SUGGEST[i]) window.adminAiAsk(SUGGEST[i].q);
  };
  window.adminAiRetry = function () {
    var h = loadHistory();
    if (!_busy && h.length && h[h.length - 1].role === "user") requestReply();
  };
  window.adminAiCopy = function (i) {
    var m = loadHistory()[i];
    if (!m) return;
    var done = function () {
      if (typeof toast === "function") toast("📋 Javob nusxalandi");
    };
    try {
      navigator.clipboard.writeText(m.content).then(done, function () {});
    } catch (e) {}
  };
  window.adminAiSetGroup = function (v) {
    _focusGroup = v || "";
    if (typeof toast === "function")
      toast(v ? "🎯 Savollar tanlangan guruh bo'yicha" : "👥 Barcha guruhlar bo'yicha");
  };
  window.adminAiClear = async function () {
    if (!loadHistory().length) return;
    if (typeof crmConfirm === "function" && !(await crmConfirm("Suhbat tozalanib, yangisi boshlansinmi?", { okText: "Ha" }))) return;
    saveHistory([]);
    _lastError = "";
    renderMessages();
  };
  // Test va tekshiruv uchun
  window.adminAiContext = buildContext;
})();
