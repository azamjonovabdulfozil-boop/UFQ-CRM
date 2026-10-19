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

  var SUGGEST = [
    "Qaysi talabalar sust o'qiyapti va nima uchun?",
    "Har bir guruhda eng yaxshi talaba kim?",
    "Kim ko'p dars qoldiryapti? Kimning ota-onasiga qo'ng'iroq qilish kerak?",
    "Davomati eng past guruhlar qaysi?",
    "Bu oy moliya holati qanday?",
    "Qarzdorlar ro'yxati va jami qarz",
    "Eng yaxshi mentor kim (guruhlari natijasiga qarab)?",
    "Ota-onalar uchun oylik hisobot matnini yozib ber",
  ];

  function injectStyles() {
    if (document.getElementById("aai-styles")) return;
    var st = document.createElement("style");
    st.id = "aai-styles";
    st.textContent =
      ".aai-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}" +
      ".aai-bar select{padding:6px 10px;border-radius:8px;border:1.5px solid var(--border2);background:var(--bg3);color:var(--text);font-size:12px;font-weight:600}" +
      ".aai-btn{font-size:11px;padding:6px 10px;border-radius:7px;border:1.5px solid var(--border2);background:var(--bg3);color:var(--text3);cursor:pointer;font-weight:600}" +
      ".aai-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}" +
      ".aai-chip{font-size:12.5px;padding:8px 12px;border-radius:999px;border:1.5px solid var(--border2);background:var(--bg);color:var(--text2);cursor:pointer;font-weight:600;text-align:left;line-height:1.3}" +
      ".aai-chip:hover{border-color:var(--accent);color:var(--accent)}" +
      ".aai-msg p{margin:0 0 6px}.aai-msg p:last-child{margin-bottom:0}" +
      ".aai-msg ul,.aai-msg ol{margin:4px 0 8px;padding-left:20px}.aai-msg li{margin:2px 0}" +
      ".aai-h{font-weight:800;font-size:14px;margin:8px 0 4px}" +
      ".aai-hr{border:0;border-top:1px solid var(--border2);margin:10px 0}" +
      ".aai-code{background:var(--bg4,var(--bg3));padding:1px 5px;border-radius:4px;font-size:.9em}" +
      ".aai-table-wrap{overflow-x:auto;margin:6px 0 8px}" +
      ".aai-table{border-collapse:collapse;font-size:12.5px;min-width:100%}" +
      ".aai-table th,.aai-table td{border:1px solid var(--border2);padding:5px 8px;text-align:left;white-space:nowrap}" +
      ".aai-table th{background:var(--bg3);font-weight:700}" +
      ".aai-note{font-size:11px;color:var(--text3)}";
    document.head.appendChild(st);
  }

  function bubble(role, html) {
    return role === "user"
      ? '<div class="ai-bubble ai-bubble-user"><div class="ai-bubble-text">' + html + "</div></div>"
      : '<div class="ai-bubble ai-bubble-bot"><div class="ai-avatar">🤖</div><div class="ai-bubble-text aai-msg">' + html + "</div></div>";
  }

  function renderAdminAI() {
    var wrap = document.getElementById("admin-ai-wrap");
    if (!wrap || typeof D === "undefined") return;
    // Javob kutilayotganda qayta chizmaymiz (live-sync ham shu funksiyani chaqiradi)
    if (_busy && wrap.querySelector("#aai-msgs")) return;
    var keepInput = (document.getElementById("aai-input") || {}).value || "";
    injectStyles();

    var groups = D.groups || [];
    var gOpts =
      '<option value="">👥 Barcha guruhlar</option>' +
      groups
        .map(function (g) {
          return '<option value="' + g.id + '"' + (String(g.id) === String(_focusGroup) ? " selected" : "") + ">" + esc(g.name) + "</option>";
        })
        .join("");

    wrap.innerHTML =
      '<div class="ai-panel-container">' +
      '<div class="ai-panel-header">' +
      '<div style="display:flex;align-items:center;gap:10px;min-width:0">' +
      '<div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--teal));display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">🤖</div>' +
      '<div style="min-width:0"><div style="font-size:15px;font-weight:800;color:var(--text)">AI Yordamchi (Admin)</div>' +
      '<div class="aai-note">CRM ma\'lumotlarini biladi: ' + (D.students || []).length + " talaba · " + groups.length + " guruh</div></div></div>" +
      '<div class="aai-bar"><select id="aai-group" onchange="adminAiSetGroup(this.value)" title="Savollarni bitta guruhga yo\'naltirish">' + gOpts + "</select>" +
      '<button class="aai-btn" onclick="adminAiClear()">🗑 Tozalash</button></div>' +
      "</div>" +
      '<div class="ai-messages" id="aai-msgs"></div>' +
      '<div class="ai-input-row">' +
      '<textarea id="aai-input" class="ai-textarea" rows="1" placeholder="Masalan: Qaysi bola sust o\'qiyapti?" ' +
      "onkeydown=\"if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();adminAiSend()}\" " +
      "oninput=\"this.style.height='auto';this.style.height=Math.min(this.scrollHeight,140)+'px'\"></textarea>" +
      '<button class="ai-send-btn" id="aai-send" onclick="adminAiSend()">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>' +
      "</button></div></div>";

    var inp = document.getElementById("aai-input");
    if (inp && keepInput) inp.value = keepInput;
    renderMessages();
  }

  function renderMessages() {
    var box = document.getElementById("aai-msgs");
    if (!box) return;
    var h = loadHistory();
    var welcome =
      "Salom! Men markazingiz ma'lumotlarini biladigan AI yordamchiman. 📊\n\n" +
      "Talabalar, guruhlar, davomat, baholar, coinlar, qarzlar va moliya haqida so'rang — " +
      "aniq ismlar va raqamlar bilan javob beraman. Boshqa har qanday savolga ham yordam beraman.";
    var html = bubble("bot", md(welcome));
    if (!h.length)
      html +=
        '<div class="aai-chips">' +
        SUGGEST.map(function (q) {
          return '<button class="aai-chip" onclick="adminAiAsk(this.textContent)">' + esc(q) + "</button>";
        }).join("") +
        "</div>";
    h.forEach(function (m) {
      html += bubble(m.role === "user" ? "user" : "bot", m.role === "user" ? esc(m.content).replace(/\n/g, "<br>") : md(m.content));
    });
    box.innerHTML = html;
    box.scrollTop = box.scrollHeight;
  }

  function apiBase() {
    try {
      if (typeof __API_BASE__ !== "undefined" && __API_BASE__) return __API_BASE__;
    } catch (e) {}
    return window.__API_BASE__ || "";
  }

  async function adminAiSend() {
    var inp = document.getElementById("aai-input");
    var btn = document.getElementById("aai-send");
    var box = document.getElementById("aai-msgs");
    if (!inp || !box || _busy) return;
    var text = inp.value.trim();
    if (!text) return;
    inp.value = "";
    inp.style.height = "auto";

    var h = loadHistory();
    h.push({ role: "user", content: text });
    saveHistory(h);
    renderMessages();

    _busy = true;
    if (btn) btn.disabled = true;
    var typing = document.createElement("div");
    typing.className = "ai-bubble ai-bubble-bot ai-typing";
    typing.innerHTML =
      '<div class="ai-avatar">🤖</div><div class="ai-bubble-text"><span class="ai-dots"><span></span><span></span><span></span></span> ' +
      '<span class="aai-note">ma\'lumotlar tahlil qilinmoqda…</span></div>';
    box.appendChild(typing);
    box.scrollTop = box.scrollHeight;

    var reply;
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
      reply = data.text || "...";
    } catch (e) {
      reply = "⚠️ Javob olinmadi: " + (e && e.message ? e.message : "xato") + ". Qaytadan urinib ko'ring.";
    }
    var h2 = loadHistory();
    h2.push({ role: "assistant", content: reply });
    saveHistory(h2);
    _busy = false;
    if (btn) btn.disabled = false;
    renderMessages();
    var inp2 = document.getElementById("aai-input");
    if (inp2) inp2.focus();
  }

  window.renderAdminAI = renderAdminAI;
  window.adminAiSend = adminAiSend;
  window.adminAiAsk = function (q) {
    var inp = document.getElementById("aai-input");
    if (!inp) return;
    inp.value = q;
    adminAiSend();
  };
  window.adminAiSetGroup = function (v) {
    _focusGroup = v || "";
    if (typeof toast === "function")
      toast(v ? "🎯 Savollar tanlangan guruh bo'yicha" : "👥 Barcha guruhlar bo'yicha");
  };
  window.adminAiClear = async function () {
    if (typeof crmConfirm === "function" && !(await crmConfirm("AI suhbat tarixi tozalansinmi?", { okText: "Ha" }))) return;
    saveHistory([]);
    renderMessages();
  };
  // Test va tekshiruv uchun
  window.adminAiContext = buildContext;
})();
