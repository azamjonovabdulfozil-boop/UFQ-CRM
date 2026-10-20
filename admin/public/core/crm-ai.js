/* ============================================================================
   CRM AI YORDAMCHI — admin, mentor va talaba uchun (bitta dvigatel)
   ============================================================================
   Har bir rolning AI si boshqacha ishlaydi:

   • ADMIN  — butun markaz ma'lumotini biladi. Hisobot shu yerda, brauzerdagi
              `D` dan quriladi va AI ga ko'rsatma sifatida yuboriladi.
   • MENTOR — faqat o'z guruhlari va o'z talabalarini biladi, boshqa har
              qanday savolga ham javob beradi. Ko'rsatma va ma'lumot SERVERDA
              quriladi (backend/aiPortal.js). "Talabalar AI suhbatlari"
              bo'limida o'z talabalarining AI suhbatlari va ogohlantirishlarni
              ko'radi, bloklangan talabani blokdan chiqaradi.
   • TALABA — faqat o'qishga oid savollarga javob oladi. Sinfdoshlari haqida
              AI hech narsa bilmaydi. So'kinsa — 3 marta ogohlantirish,
              4-chisida AI bloklanadi; har safar mentoriga xabar boradi.

   Hammasida: suhbatlar tarixi, fayl biriktirish (rasm, ovoz, PDF, Word,
   Excel…), ovozli xabar va javobni "Eshitish".

   Backend: POST /api/ai-chat  { mode, system?, messages }
            POST /api/ai-tts   { text } → audio
            GET/PUT /api/ai/chats, GET /api/ai/state, /api/ai/students,
            /api/ai/student-chats, /api/ai/alerts, POST /api/ai/unblock
   ========================================================================== */
(function () {
  "use strict";

  var MAX_CONTEXT = 180000; // belgi — juda katta markazda ham sig'sin
  var _focusGroup = ""; // "" = barcha guruhlar (hisobotni bitta guruhga toraytirish uchun)
  var _busy = false;

  /** Joriy foydalanuvchi roli: "admin" | "mentor" | "student". */
  function role() {
    try {
      if (typeof isStudentRole === "function" && isStudentRole()) return "student";
      if (typeof isMentorRole === "function" && isMentorRole()) return "mentor";
    } catch (e) {}
    return "admin";
  }
  var WRAP_ID = { admin: "admin-ai-wrap", mentor: "mentor-ai-wrap", student: "student-ai-wrap" };
  var curUser = function () {
    try {
      return (typeof getCurrentUser === "function" && getCurrentUser()) || {};
    } catch (e) {
      return {};
    }
  };

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

  /* ─── Suhbatlar tarixi ─────────────────────────────────────────────────── */
  /* Har bir suhbat alohida saqlanadi va "Tarix" ro'yxatidan qayta ochiladi.
     Kalit `admin_private_` bilan boshlanadi: backend-storage uni serverga
     sinxronlaydi (boshqa qurilmada ham ko'rinadi), server esa uni faqat
     adminga beradi — mentor va talaba o'qiy olmaydi.
     Fayllarning o'zi saqlanmaydi (juda katta) — faqat nomi, turi, kichik
     rasm ko'rinishi va hujjatdan olingan matn. */

  var STORE_KEY = "admin_private_ai_chats_v1";
  var MAX_CHATS = 60;
  var MAX_STORE_BYTES = 2 * 1024 * 1024;
  var _memParts = {}; // xabar kaliti → shu sessiyada yuborilgan fayl qismlari

  /* Admin tarixi localStorage orqali serverga sinxronlanadi (admin_private_*).
     Mentor va talaba tarixi esa alohida /api/ai/chats ga yoziladi — mentor
     o'z talabalarining suhbatlarini ko'ra olishi uchun. Ularning brauzerdagi
     nusxasi faqat kesh: KV sinxroniga tushmaydi (to'g'ridan Storage.prototype). */
  function storeKey() {
    var r = role();
    if (r === "admin") return STORE_KEY;
    var cu = curUser();
    return "crm_ai_" + r + "_" + String(cu.studentId || cu.username || cu.mentorName || cu.name || "me").replace(/[^\w.-]/g, "_");
  }
  function oldHistoryKey() {
    var r = role();
    if (r === "admin") return "ai_history_admin";
    if (r === "mentor") return "ai_history_mentor";
    return "ai_history_student_" + (curUser().studentId || "me");
  }
  function lsGet(k) {
    try {
      return localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  }
  function lsSetLocal(k, v) {
    try {
      Storage.prototype.setItem.call(localStorage, k, v);
    } catch (e) {}
  }

  function uid() {
    return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function chatTitle(c) {
    var first = (c.messages || []).find(function (m) {
      return m.role === "user";
    });
    if (!first) return "Yangi suhbat";
    var t = String(first.content || "").replace(/\s+/g, " ").trim();
    if (!t && first.files && first.files.length) t = "📎 " + first.files[0].name;
    return t.length > 60 ? t.slice(0, 57) + "…" : t || "Yangi suhbat";
  }

  function loadStore() {
    var key = storeKey();
    var st = null;
    try {
      st = JSON.parse(lsGet(key) || "null");
    } catch (e) {}
    if (st && Array.isArray(st.chats)) return st;
    st = { chats: [], current: null };
    // Avvalgi (bitta suhbatli) tarix yo'qolmasin — birinchi suhbat bo'lib ko'chadi
    try {
      var old = JSON.parse(lsGet(oldHistoryKey()) || "[]");
      if (Array.isArray(old) && old.length) {
        var now = Date.now();
        var c = { id: uid(), createdAt: now, updatedAt: now, messages: old.map(function (m) {
          return { role: m.role === "user" ? "user" : "assistant", content: String(m.content || ""), ts: now };
        }) };
        st.chats.push(c);
        st.current = c.id;
        saveStore(st);
      }
    } catch (e) {}
    return st;
  }

  function saveStore(st) {
    st.chats.sort(function (a, b) {
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
    st.chats = st.chats.slice(0, MAX_CHATS);
    var json = JSON.stringify(st);
    // Juda kattalashsa — eng eski suhbatlar o'chadi (joriysi qoladi)
    while (json.length > MAX_STORE_BYTES && st.chats.length > 1) {
      var idx = st.chats.length - 1;
      if (st.chats[idx].id === st.current) idx--;
      if (idx < 0) break;
      st.chats.splice(idx, 1);
      json = JSON.stringify(st);
    }
    if (role() === "admin") {
      try {
        localStorage.setItem(STORE_KEY, json);
      } catch (e) {}
      return;
    }
    lsSetLocal(storeKey(), json);
    schedulePush();
  }

  /* ── Mentor/talaba tarixini server bilan sinxronlash ── */
  var _pushTimer = null;
  var _pulledFor = null;

  function pushNow(keepalive) {
    clearTimeout(_pushTimer);
    _pushTimer = null;
    var st;
    try {
      st = JSON.parse(lsGet(storeKey()) || "null");
    } catch (e) {}
    if (!st) return;
    var body = JSON.stringify({ store: st });
    fetch(apiBase() + "/api/ai/chats", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: body,
      // Sahifa yopilayotganda ham so'rov yetib borsin (64 KB gacha)
      keepalive: !!keepalive && body.length < 60000,
    }).catch(function () {});
  }

  function schedulePush() {
    clearTimeout(_pushTimer);
    _pushTimer = setTimeout(function () {
      pushNow(false);
    }, 1200);
  }

  // Saqlanmay qolgan o'zgarish bo'lsa — sahifa yopilishidan oldin yuboramiz
  window.addEventListener("pagehide", function () {
    if (_pushTimer && role() !== "admin") pushNow(true);
  });

  /** Serverdagi tarixni olib, brauzerdagisi bilan birlashtiradi (yangisi qoladi). */
  function pullStore() {
    var key = storeKey();
    if (role() === "admin" || _pulledFor === key) return;
    _pulledFor = key;
    fetch(apiBase() + "/api/ai/chats")
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        if (!d || !d.ok || !d.store) return;
        var local = loadStore();
        var byId = {};
        local.chats.forEach(function (c) {
          byId[c.id] = c;
        });
        var changed = false;
        var localNewer = false;
        var serverHas = {};
        (d.store.chats || []).forEach(function (c) {
          serverHas[c.id] = 1;
          var mine = byId[c.id];
          if (!mine || (c.updatedAt || 0) > (mine.updatedAt || 0)) {
            byId[c.id] = c;
            changed = true;
          } else if ((mine.updatedAt || 0) > (c.updatedAt || 0)) localNewer = true;
        });
        // Brauzerdagi nusxa yangiroq bo'lsa (masalan sahifa saqlanib ulgurmay
        // yopilgan) — serverga qayta yuboriladi
        var localOnly = localNewer || local.chats.some(function (c) {
          return !serverHas[c.id];
        });
        if (!changed && !localOnly) return;
        local.chats = Object.keys(byId).map(function (k) {
          return byId[k];
        });
        if (!local.current && d.store.current) local.current = d.store.current;
        saveStore(local); // birlashma serverga ham qaytadi
        if (!_busy) renderMessages();
      })
      .catch(function () {
        _pulledFor = null;
      });
  }

  function currentChat(st, create) {
    var c = st.chats.find(function (x) {
      return x.id === st.current;
    });
    if (!c && create) {
      c = { id: uid(), createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
      st.chats.unshift(c);
      st.current = c.id;
    }
    return c || null;
  }

  function fmtWhen(ts) {
    if (!ts) return "";
    var d = new Date(ts);
    var now = new Date();
    var hm = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    var day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var diff = Math.round((today - day) / 86400000);
    if (diff === 0) return "Bugun, " + hm;
    if (diff === 1) return "Kecha, " + hm;
    if (diff < 7) return diff + " kun oldin";
    return d.getDate() + "-" + MON[d.getMonth()] + (d.getFullYear() !== now.getFullYear() ? " " + d.getFullYear() : "");
  }

  /* ─── Fayllar (rasm, ovoz, PDF, Word, Excel, exe…) ──────────────────────── */
  /* Har bir fayl biriktirilgan zahoti tayyorlanadi:
       • rasm            → kichraytirilib AI ga rasm sifatida
       • ovoz / video    → AI ga o'zicha (AI eshitadi / ko'radi)
       • PDF             → AI ga o'zicha (skanerlangan PDF ham o'qiladi)
       • Word/Excel/PPT  → brauzerda matni ajratib olinadi
       • matn, kod, CSV  → matn sifatida
       • exe, zip va boshqalar → tuzilish tahlili: turi, ichidagi fayllar,
                                  ichidagi yozuvlar, SHA-256              */

  var MAX_FILE = 15 * 1024 * 1024; // AI ga o'zicha yuboriladigan fayl
  var MAX_SCAN = 60 * 1024 * 1024; // tahlil qilinadigan (exe, zip) fayl
  var MAX_TEXT = 120000; // bitta hujjatdan olinadigan matn
  var _pending = []; // biriktirilgan, hali yuborilmagan fayllar

  var KIND_ICON = {
    image: "🖼", audio: "🎵", voice: "🎤", video: "🎬", pdf: "📕", doc: "📝", sheet: "📊",
    slides: "📽", text: "📄", archive: "🗜", exe: "⚙️", other: "📦",
  };
  var TEXT_EXT = /\.(txt|md|csv|tsv|json|xml|html?|css|js|mjs|ts|tsx|jsx|vue|py|java|kt|c|cc|cpp|h|hpp|cs|go|rs|rb|php|sql|sh|bat|ps1|ya?ml|ini|cfg|conf|log|env|srt|vtt|rtf|tex)$/i;

  function kindOf(f) {
    var n = (f.name || "").toLowerCase();
    var t = (f.type || "").toLowerCase();
    if (/^image\//.test(t) || /\.(png|jpe?g|gif|webp|bmp|heic|avif)$/.test(n)) return "image";
    if (/^audio\//.test(t) || /\.(mp3|wav|ogg|oga|flac|aac|m4a|opus|aiff?)$/.test(n)) return "audio";
    if (/^video\//.test(t) || /\.(mp4|mov|webm|avi|mkv|3gp)$/.test(n)) return "video";
    if (t === "application/pdf" || /\.pdf$/.test(n)) return "pdf";
    if (/\.(docx|odt)$/.test(n)) return "doc";
    if (/\.(xlsx|xlsm|xls|ods)$/.test(n)) return "sheet";
    if (/\.(pptx|odp)$/.test(n)) return "slides";
    if (/^text\//.test(t) || TEXT_EXT.test(n) || /json|xml|javascript/.test(t)) return "text";
    if (/\.(zip|jar|apk|rar|7z|tar|gz|tgz)$/.test(n)) return "archive";
    if (/\.(exe|dll|msi|sys|com|scr|bin|so|elf|dmg|app)$/.test(n)) return "exe";
    return "other";
  }

  function fmtSize(b) {
    if (b < 1024) return b + " B";
    if (b < 1048576) return Math.round(b / 102.4) / 10 + " KB";
    return Math.round(b / 104857.6) / 10 + " MB";
  }

  function readAs(file, how) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        resolve(r.result);
      };
      r.onerror = function () {
        reject(new Error("fayl o'qilmadi"));
      };
      r[how](file);
    });
  }

  var _libs = {};
  function loadLib(name, url, globalName) {
    if (window[globalName]) return Promise.resolve(window[globalName]);
    if (_libs[name]) return _libs[name];
    _libs[name] = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = url;
      s.onload = function () {
        window[globalName] ? resolve(window[globalName]) : reject(new Error(name + " yuklanmadi"));
      };
      s.onerror = function () {
        delete _libs[name];
        reject(new Error(name + " kutubxonasi yuklanmadi (internet?)"));
      };
      document.head.appendChild(s);
    });
    return _libs[name];
  }
  var jszip = function () {
    return loadLib("jszip", "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js", "JSZip");
  };
  var sheetjs = function () {
    return loadLib("xlsx", "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js", "XLSX");
  };

  function xmlText(xml, paraTag) {
    return String(xml)
      .replace(new RegExp("</" + paraTag + ">", "g"), "\n")
      .replace(/<w:tab\/>|<a:tab\/>/g, "\t")
      .replace(/<w:br\/>|<a:br\/>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function clip(t) {
    t = String(t || "");
    return t.length > MAX_TEXT ? t.slice(0, MAX_TEXT) + "\n…(matn qisqartirildi)" : t;
  }

  /** Rasmni kichraytiradi: AI uchun (≤1600px) va ko'rinish uchun (96px). */
  function shrinkImage(dataUrl, max, quality) {
    return new Promise(function (resolve) {
      var im = new Image();
      im.onload = function () {
        var k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
        var cv = document.createElement("canvas");
        cv.width = Math.max(1, Math.round(im.naturalWidth * k));
        cv.height = Math.max(1, Math.round(im.naturalHeight * k));
        var ctx = cv.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(im, 0, 0, cv.width, cv.height);
        resolve(cv.toDataURL("image/jpeg", quality));
      };
      im.onerror = function () {
        resolve("");
      };
      im.src = dataUrl;
    });
  }

  async function sha256(buf) {
    try {
      var h = await crypto.subtle.digest("SHA-256", buf);
      return Array.from(new Uint8Array(h)).map(function (b) {
        return b.toString(16).padStart(2, "0");
      }).join("");
    } catch (e) {
      return "";
    }
  }

  /** Ikkilik fayl (exe, dll, bin…) tuzilishi va ichidagi yozuvlar. */
  async function binaryReport(file, buf) {
    var u8 = new Uint8Array(buf);
    var dv = new DataView(buf);
    var lines = [];
    var magic = Array.from(u8.slice(0, 8)).map(function (b) {
      return b.toString(16).padStart(2, "0");
    }).join(" ");
    var type = "noma'lum ikkilik fayl";
    if (u8[0] === 0x4d && u8[1] === 0x5a) {
      type = "Windows dasturi (PE: EXE/DLL)";
      try {
        var pe = dv.getUint32(0x3c, true);
        if (dv.getUint32(pe, false) === 0x50450000) {
          var machine = dv.getUint16(pe + 4, true);
          var nSec = dv.getUint16(pe + 6, true);
          var stamp = dv.getUint32(pe + 8, true);
          var chars = dv.getUint16(pe + 22, true);
          var optMagic = dv.getUint16(pe + 24, true);
          var subsys = dv.getUint16(pe + 24 + 68, true);
          var optSize = dv.getUint16(pe + 20, true);
          var secs = [];
          for (var i = 0; i < Math.min(nSec, 24); i++) {
            var o = pe + 24 + optSize + i * 40;
            var nm = "";
            for (var j = 0; j < 8 && u8[o + j]; j++) nm += String.fromCharCode(u8[o + j]);
            secs.push(nm + " (" + fmtSize(dv.getUint32(o + 16, true)) + ")");
          }
          lines.push(
            "Arxitektura: " + ({ 0x14c: "x86 (32-bit)", 0x8664: "x64 (64-bit)", 0xaa64: "ARM64", 0x1c4: "ARM" }[machine] || "0x" + machine.toString(16)),
            "Format: " + (optMagic === 0x20b ? "PE32+ (64-bit)" : "PE32"),
            "Turi: " + (chars & 0x2000 ? "DLL (kutubxona)" : "EXE (dastur)") +
              ", interfeys: " + ({ 2: "oynali (GUI)", 3: "konsol", 1: "drayver/tizim" }[subsys] || "boshqa (" + subsys + ")"),
            "Yig'ilgan sana (PE vaqt belgisi): " + new Date(stamp * 1000).toISOString().slice(0, 10) +
              " (ba'zi dasturlarda bu belgi ataylab o'zgartirilgan — aniq sana emas bo'lishi mumkin)",
            "Bo'limlar (" + nSec + "): " + secs.join(", "),
          );
        }
      } catch (e) {}
    } else if (u8[0] === 0x7f && u8[1] === 0x45 && u8[2] === 0x4c && u8[3] === 0x46) type = "Linux/Android dasturi (ELF)";
    else if (u8[0] === 0x50 && u8[1] === 0x4b) type = "ZIP arxivi";
    else if (u8[0] === 0x52 && u8[1] === 0x61 && u8[2] === 0x72) type = "RAR arxivi";
    else if (u8[0] === 0x37 && u8[1] === 0x7a) type = "7-Zip arxivi";
    else if (u8[0] === 0x1f && u8[1] === 0x8b) type = "GZIP arxivi";
    else if (u8[0] === 0xcf && u8[1] === 0xfa) type = "macOS dasturi (Mach-O)";
    else if (u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46) type = "PDF";

    // Ichidagi o'qiladigan yozuvlar (strings) — dastur nima qilishini taxmin qilish uchun
    var strs = [];
    var cur = "";
    var limit = Math.min(u8.length, 8 * 1024 * 1024);
    for (var k = 0; k < limit && strs.length < 600; k++) {
      var c = u8[k];
      if (c >= 32 && c < 127) cur += String.fromCharCode(c);
      else {
        if (cur.length >= 6) strs.push(cur);
        cur = "";
      }
    }
    var seen = {};
    strs = strs.filter(function (x) {
      if (seen[x]) return false;
      seen[x] = 1;
      return true;
    });
    var interesting = strs.filter(function (x) {
      return /https?:\/\/|\.dll|\.exe|[A-Za-z]:\\|HKEY_|password|token|version|copyright|microsoft|\.com|@|api|cmd|powershell/i.test(x);
    });

    var hash = await sha256(buf);
    return (
      "Fayl turi (sarlavha baytlari bo'yicha): " + type + "\nBirinchi baytlar: " + magic +
      (lines.length ? "\n" + lines.join("\n") : "") +
      (hash ? "\nSHA-256: " + hash : "") +
      "\n\nE'tiborli yozuvlar (" + interesting.length + "):\n" + interesting.slice(0, 120).join("\n") +
      "\n\nBoshqa o'qiladigan yozuvlar (namuna):\n" + strs.slice(0, 250).join("\n")
    ).slice(0, 30000);
  }

  /** Arxiv ichidagi fayllar ro'yxati. */
  async function zipReport(buf) {
    var JSZip = await jszip();
    var z = await JSZip.loadAsync(buf);
    var rows = [];
    z.forEach(function (path, e) {
      if (rows.length < 400) rows.push((e.dir ? "📁 " : "• ") + path + (e._data && e._data.uncompressedSize ? " (" + fmtSize(e._data.uncompressedSize) + ")" : ""));
    });
    return "Arxiv ichida " + Object.keys(z.files).length + " ta element:\n" + rows.join("\n");
  }

  async function officeText(kind, name, buf) {
    if (kind === "sheet") {
      var XLSX = await sheetjs();
      var wb = XLSX.read(buf, { type: "array" });
      return wb.SheetNames.slice(0, 20).map(function (sn) {
        return "=== Varaq: " + sn + " ===\n" + XLSX.utils.sheet_to_csv(wb.Sheets[sn]);
      }).join("\n\n");
    }
    var JSZip = await jszip();
    var z = await JSZip.loadAsync(buf);
    if (/\.odt$|\.odp$/i.test(name)) return xmlText(await z.file("content.xml").async("string"), "text:p");
    if (kind === "doc") return xmlText(await z.file("word/document.xml").async("string"), "w:p");
    // PowerPoint — har bir slayd alohida
    var slides = Object.keys(z.files)
      .filter(function (p) {
        return /^ppt\/slides\/slide\d+\.xml$/.test(p);
      })
      .sort(function (a, b) {
        return parseInt(a.replace(/\D/g, ""), 10) - parseInt(b.replace(/\D/g, ""), 10);
      });
    var out = [];
    for (var i = 0; i < slides.length; i++)
      out.push("--- Slayd " + (i + 1) + " ---\n" + xmlText(await z.file(slides[i]).async("string"), "a:p"));
    return out.join("\n\n");
  }

  /**
   * Faylni AI uchun tayyorlaydi.
   * @returns {Promise<{part?:object, text?:string, thumb?:string, note?:string}>}
   */
  async function prepareFile(file, forceKind) {
    var kind = forceKind || kindOf(file);
    var head = "[FAYL: " + file.name + " · " + fmtSize(file.size) + "]";

    if (kind === "image") {
      if (file.size > 25 * 1024 * 1024) throw new Error("rasm 25 MB dan katta");
      var src = await readAs(file, "readAsDataURL");
      var big = await shrinkImage(src, 1600, 0.86);
      if (!big) throw new Error("rasm ochilmadi (format qo'llab-quvvatlanmaydi)");
      return { part: { type: "image_url", image_url: { url: big } }, thumb: await shrinkImage(src, 120, 0.7), bytes: big.length };
    }
    if (kind === "audio" || kind === "voice") {
      if (file.size > MAX_FILE) throw new Error("ovoz fayli 15 MB dan katta");
      var au = await readAs(file, "readAsDataURL");
      var ext = ((file.name.match(/\.([a-z0-9]+)$/i) || [])[1] || "").toLowerCase();
      var fmt = { mpeg: "mp3", mp3: "mp3", wav: "wav", "x-wav": "wav", wave: "wav", ogg: "ogg", oga: "ogg", opus: "ogg", flac: "flac", aac: "aac", aiff: "aiff", aif: "aiff" }[
        ((file.type || "").split("/")[1] || "").replace(/;.*/, "")
      ] || { mp3: "mp3", wav: "wav", ogg: "ogg", oga: "ogg", opus: "ogg", flac: "flac", aac: "aac", aiff: "aiff", aif: "aiff" }[ext];
      if (fmt) return { part: { type: "input_audio", input_audio: { data: au.split(",")[1], format: fmt } }, bytes: au.length };
      // m4a va boshqalar — fayl sifatida
      return { part: { type: "file", file: { filename: file.name, file_data: au } }, bytes: au.length };
    }
    if (kind === "pdf" || kind === "video") {
      if (file.size > MAX_FILE) throw new Error((kind === "pdf" ? "PDF" : "video") + " 15 MB dan katta");
      var du = await readAs(file, "readAsDataURL");
      if (kind === "pdf" && !/^data:application\/pdf/.test(du)) du = du.replace(/^data:[^;]*/, "data:application/pdf");
      return { part: { type: "file", file: { filename: file.name, file_data: du } }, bytes: du.length };
    }
    if (kind === "doc" || kind === "sheet" || kind === "slides") {
      var ob = await readAs(file, "readAsArrayBuffer");
      return { text: head + "\n" + clip(await officeText(kind, file.name, ob)) };
    }
    if (kind === "text") {
      if (file.size > 20 * 1024 * 1024) throw new Error("matnli fayl 20 MB dan katta");
      return { text: head + "\n" + clip(await readAs(file, "readAsText")) };
    }
    if (file.size > MAX_SCAN) throw new Error("fayl 60 MB dan katta — tahlil qilib bo'lmaydi");
    var buf = await readAs(file, "readAsArrayBuffer");
    var u8 = new Uint8Array(buf.slice(0, 4));
    var report;
    if (u8[0] === 0x50 && u8[1] === 0x4b) {
      try {
        report = (await zipReport(buf)) + "\n\nSHA-256: " + (await sha256(buf));
      } catch (e) {
        report = await binaryReport(file, buf);
      }
    } else report = await binaryReport(file, buf);
    return { text: head + " — ikkilik fayl, quyida uning tuzilish tahlili:\n" + report };
  }

  /** Fayllarni biriktiradi (tugma, sudrab tashlash, Ctrl+V, ovoz yozish). */
  function addFiles(list, forceKind) {
    Array.prototype.forEach.call(list || [], function (file) {
      if (_pending.length >= 8) {
        if (typeof toast === "function") toast("⚠️ Bir xabarga 8 tagacha fayl");
        return;
      }
      var item = { id: uid(), name: file.name || "fayl", size: file.size || 0, kind: forceKind || kindOf(file), status: "busy" };
      _pending.push(item);
      renderPending();
      prepareFile(file, forceKind)
        .then(function (r) {
          Object.assign(item, r, { status: "ready" });
        })
        .catch(function (e) {
          item.status = "error";
          item.error = (e && e.message) || "xato";
        })
        .then(renderPending);
    });
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
  /* Mentor AI yordamchisi uslubida: tepada sarlavha, o'rtada pufakchalar,
     pastda yozish qatori. O'z klasslari (aai-*) bilan chiziladi — balandlik,
     mobil ko'rinish va mavzu ranglari shu yerda to'liq boshqariladi. */

  var SUGGESTS = {
    admin: [
      { ic: "📉", t: "Kim sust o'qiyapti?", q: "Qaysi talabalar sust o'qiyapti va nima uchun? Har biriga nima qilish kerakligini ham ayt." },
      { ic: "🏆", t: "Guruhlardagi eng yaxshilar", q: "Har bir guruhda eng yaxshi talaba kim? Jadval qilib ber." },
      { ic: "🚫", t: "Kim dars qoldiryapti?", q: "Kim ko'p dars qoldiryapti yoki ketma-ket kelmayapti? Kimning ota-onasiga qo'ng'iroq qilish kerak?" },
      { ic: "💸", t: "Qarzdorlar", q: "Qarzdorlar ro'yxatini summasi bilan ber va jami qarzni hisobla." },
      { ic: "📊", t: "Guruhlarni solishtir", q: "Guruhlarni davomat va o'zlashtirish bo'yicha solishtir. Qaysi guruh e'tibor talab qiladi?" },
      { ic: "💰", t: "Moliya holati", q: "Bu oy moliya holati qanday? O'tgan oy bilan solishtir." },
    ],
    mentor: [
      { ic: "📉", t: "Guruhimda kim sust?", q: "Mening guruhlarimda kim sust o'qiyapti va nima uchun? Har biriga nima qilishim kerak?" },
      { ic: "🏆", t: "Eng yaxshi talabalarim", q: "Har bir guruhimda eng yaxshi talabalar kim? Jadval qilib ber." },
      { ic: "🚫", t: "Kim dars qoldiryapti?", q: "Mening talabalarimdan kim ko'p dars qoldiryapti yoki ketma-ket kelmayapti?" },
      { ic: "📝", t: "Dars rejasi tuz", q: "Keyingi darsim uchun 90 daqiqalik dars rejasini tuzib ber." },
      { ic: "✅", t: "Test savollari", q: "Guruhim o'tayotgan mavzu bo'yicha javoblari bilan 10 ta test savoli tuz." },
      { ic: "✉️", t: "Ota-onaga xabar", q: "Dars qoldirayotgan talabaning ota-onasiga yuboriladigan muloyim xabar matnini yozib ber." },
    ],
    student: [
      { ic: "📚", t: "Mavzuni tushuntir", q: "Guruhimda o'tilayotgan mavzuni oddiy qilib, misollar bilan tushuntirib ber." },
      { ic: "📈", t: "Natijalarim qanday?", q: "Mening davomatim va baholarim qanday? Nimani yaxshilashim kerak?" },
      { ic: "🗓", t: "O'qish rejasi", q: "Menga bir haftalik o'qish rejasini tuzib ber." },
      { ic: "💡", t: "Yaxshi o'qish sirlari", q: "Darsni yaxshiroq o'zlashtirish va yodda saqlash uchun maslahatlar ber." },
    ],
  };
  var ROLE_TEXT = {
    admin: {
      sub: "markaz ma'lumotlarini biladi",
      hello:
        "Salom! Men markazingiz ma'lumotlarini biladigan AI yordamchiman.\n\n" +
        "- 📊 Talabalar, guruhlar, davomat, baholar, qarzlar va moliya tahlili\n" +
        "- 📎 Rasm, ovozli xabar, PDF, Word, Excel va boshqa fayllarni tahlil qilaman\n" +
        "- 🔊 Javobni ovoz chiqarib o'qib beraman\n" +
        "- 💡 Boshqa har qanday savolga ham yordam beraman\n\nNima yordam kerak?",
    },
    mentor: {
      sub: "guruhlaringizni biladi",
      hello:
        "Salom! Men sizning guruhlaringiz va talabalaringizni biladigan AI yordamchiman.\n\n" +
        "- 👥 Guruhlaringiz, talabalaringiz davomati, baholari va testlari tahlili\n" +
        "- 📝 Dars rejasi, test savollari, mavzu tushuntirish, ota-onaga xabar\n" +
        "- 📎 Rasm, ovozli xabar, PDF, Word, Excel fayllarini tahlil qilaman\n" +
        "- 🔊 Javobni ovoz chiqarib o'qib beraman\n" +
        "- 💡 Boshqa har qanday savolga ham javob beraman\n\nNima yordam kerak?",
    },
    student: {
      sub: "o'qishingizga yordam beradi",
      hello:
        "Salom! Men sizning AI o'qituvchi-yordamchingizman 🙂\n\n" +
        "- 📚 Dars mavzularini oddiy qilib tushuntiraman\n" +
        "- 🧩 Masala va mashqlarni bosqichma-bosqich yechishga yordam beraman\n" +
        "- 📎 Rasm (masalan, daftar yoki masala surati), ovozli xabar, PDF, Word, Excel yuborishingiz mumkin\n" +
        "- 🔊 Javobni ovoz chiqarib o'qib beraman\n\n" +
        "Iltimos, odob bilan yozing: so'kinish va haqoratli so'zlar uchun ogohlantirish beriladi, 4-marta AI bloklanadi.\n\nNimani o'rganamiz?",
    },
  };
  var SUGGEST = SUGGESTS.admin;

  var STATUS_STEPS = ["Ma'lumotlar yig'ilmoqda…", "Tahlil qilinmoqda…", "Javob yozilmoqda…"];
  var _lastError = "";
  var _statusTimer = null;
  var _histOpen = false;

  var I = function (d, sz) {
    return '<svg viewBox="0 0 24 24" width="' + (sz || 18) + '" height="' + (sz || 18) +
      '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + "</svg>";
  };
  var ICON = {
    bot: I('<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9.5 17h5"/>', 20),
    send: I('<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>', 18),
    clip: I('<path d="M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>', 19),
    mic: I('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5"/>', 19),
    stop: I('<rect x="6" y="6" width="12" height="12" rx="2"/>', 16),
    plus: I('<path d="M12 5v14M5 12h14"/>', 16),
    hist: I('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>', 16),
    chev: I('<path d="M6 9l6 6 6-6"/>', 14),
    copy: I('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>', 14),
    speak: I('<path d="M11 5L6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>', 14),
    retry: I('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>', 14),
    trash: I('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>', 14),
    x: I('<path d="M18 6L6 18M6 6l12 12"/>', 12),
    trash20: I('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>', 20),
    lock: I('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', 16),
    up: I('<path d="M6 15l6-6 6 6"/>', 14),
    play: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6" y="5" width="4.5" height="14" rx="1.2"/><rect x="13.5" y="5" width="4.5" height="14" rx="1.2"/></svg>',
  };

  function injectStyles() {
    if (document.getElementById("aai-styles")) return;
    var st = document.createElement("style");
    st.id = "aai-styles";
    st.textContent = [
      "#panel-admin-ai,#panel-mentor-ai,#panel-student-ai,#panel-mentor-students-ai{padding:0}",
      ".aai-blockbar{padding:12px 14px;border-radius:12px;background:rgba(239,68,68,.1);color:#b91c1c;font-size:13px;font-weight:700;line-height:1.5}",
      ".aai-warn .aai-txt{background:var(--orange-light,#fff7ed);border-color:#fdba74}",
      ".aai{position:relative;display:flex;flex-direction:column;height:calc(100dvh - 64px - 48px);min-height:420px;background:var(--bg2);border:1px solid var(--border);border-radius:20px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,.08)}",
      /* sarlavha — mentor AI kabi */
      ".aai-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 18px;border-bottom:1px solid var(--border);background:var(--bg2);position:relative;z-index:2}",
      ".aai-head .aai-ava{position:relative;box-shadow:0 6px 16px color-mix(in srgb,var(--accent) 35%,transparent)}",
      ".aai-head .aai-ava::after{content:'';position:absolute;right:0;bottom:0;width:11px;height:11px;border-radius:50%;background:#22c55e;border:2px solid var(--bg2)}",
      ".aai-who{display:flex;align-items:center;gap:11px;min-width:0}",
      ".aai-ava{width:40px;height:40px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#fff;background:linear-gradient(135deg,var(--accent),var(--teal,#14b8a6))}",
      ".aai-name{font-size:15px;font-weight:800;color:var(--text);line-height:1.2}",
      ".aai-on{font-size:11.5px;color:var(--text3);display:flex;align-items:center;gap:5px;margin-top:2px}",
      ".aai-on i{width:7px;height:7px;border-radius:50%;background:#22c55e}",
      ".aai-hbtns{display:flex;gap:8px;flex-shrink:0}",
      ".aai-hbtn{display:flex;align-items:center;gap:6px;height:36px;padding:0 13px;border-radius:12px;border:1px solid var(--border2);background:var(--bg3);color:var(--text2);font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;transition:.15s}",
      ".aai-hbtn:hover,.aai-hbtn.on{border-color:var(--accent);color:var(--accent)}",
      /* tarix ro'yxati (select kabi ochiladi) */
      ".aai-hist{position:absolute;top:62px;right:14px;width:340px;max-width:calc(100% - 28px);max-height:min(460px,calc(100% - 140px));display:flex;flex-direction:column;background:var(--bg2);border:1px solid var(--border2);border-radius:14px;box-shadow:0 18px 40px rgba(15,23,42,.22);z-index:20;overflow:hidden;animation:aaiIn .15s ease}",
      ".aai-hist-top{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.05em}",
      ".aai-hist-list{overflow-y:auto;padding:6px}",
      ".aai-hi{display:flex;align-items:center;gap:8px;padding:9px 10px;border-radius:10px;cursor:pointer}",
      ".aai-hi:hover{background:var(--bg3)}.aai-hi.cur{background:var(--accent-light)}",
      ".aai-hi-main{flex:1;min-width:0}",
      ".aai-hi-t{font-size:13px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".aai-hi.cur .aai-hi-t{color:var(--accent-text,var(--accent))}",
      ".aai-hi-s{font-size:11px;color:var(--text3);margin-top:1px}",
      ".aai-hi-del{width:28px;height:28px;border-radius:8px;border:0;background:transparent;color:var(--text3);display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;transition:.15s}",
      ".aai-hi:hover .aai-hi-del{opacity:1}.aai-hi-del:hover{background:var(--red-light,#fee2e2);color:#dc2626}",
      ".aai-hist-empty{padding:26px 14px;text-align:center;font-size:12.5px;color:var(--text3)}",
      /* xabarlar */
      ".aai-body{flex:1;min-height:0;overflow-y:auto;padding:20px max(20px,calc((100% - 920px)/2));display:flex;flex-direction:column;gap:14px;scroll-behavior:smooth;" +
        "background:radial-gradient(circle at 12% 0%,color-mix(in srgb,var(--accent) 8%,transparent),transparent 42%),radial-gradient(circle at 100% 100%,color-mix(in srgb,var(--teal,#14b8a6) 7%,transparent),transparent 46%),var(--bg)}",
      ".aai-body>:first-child{margin-top:auto}",
      /* bo'sh suhbat — o'rtada salomlashish */
      ".aai-hero{margin:auto 0;display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;padding:10px 0}",
      ".aai-hero-ava{width:68px;height:68px;border-radius:22px;display:flex;align-items:center;justify-content:center;color:#fff;background:linear-gradient(135deg,var(--accent),var(--teal,#14b8a6));box-shadow:0 14px 34px color-mix(in srgb,var(--accent) 40%,transparent);animation:aaiFloat 4s ease-in-out infinite}",
      ".aai-hero-ava svg{width:34px;height:34px}",
      "@keyframes aaiFloat{50%{transform:translateY(-5px)}}",
      ".aai-hero-t{font-size:22px;font-weight:800;color:var(--text);margin-top:6px;letter-spacing:-.01em}",
      ".aai-hero-s{font-size:13.5px;color:var(--text3);max-width:520px}",
      ".aai-hero .aai-txt{text-align:left;max-width:560px;margin-top:8px;border-radius:16px;padding:14px 18px;box-shadow:0 4px 18px rgba(15,23,42,.06)}",
      ".aai-hero .aai-chips{padding-left:0;justify-content:center;max-width:720px;margin-top:6px}",
      ".aai-b{display:flex;align-items:flex-start;gap:10px;max-width:82%}",
      ".aai-new{animation:aaiIn .2s ease}",
      "@keyframes aaiIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}",
      ".aai-b.me{align-self:flex-end;flex-direction:row-reverse;max-width:75%}",
      ".aai-b .aai-ava{width:32px;height:32px}.aai-b .aai-ava svg{width:16px;height:16px}",
      ".aai-bc{min-width:0}",
      ".aai-txt{padding:11px 15px;border-radius:6px 18px 18px 18px;font-size:13.5px;line-height:1.62;color:var(--text);background:var(--bg2);border:1px solid var(--border);word-break:break-word;box-shadow:0 2px 8px rgba(15,23,42,.05)}",
      ".aai-b.me .aai-txt{background:linear-gradient(135deg,var(--accent),color-mix(in srgb,var(--accent) 72%,#6366f1));color:#fff;border-color:transparent;border-radius:18px 18px 6px 18px;white-space:pre-wrap;box-shadow:0 6px 16px color-mix(in srgb,var(--accent) 28%,transparent)}",
      ".aai-txt p{margin:0 0 7px}.aai-txt p:last-child{margin-bottom:0}",
      ".aai-txt ul,.aai-txt ol{margin:4px 0 8px;padding-left:20px}.aai-txt li{margin:2px 0}",
      ".aai-h{font-weight:800;font-size:14px;margin:10px 0 5px}.aai-txt>.aai-h:first-child{margin-top:0}",
      ".aai-hr{border:0;border-top:1px solid var(--border);margin:10px 0}",
      ".aai-code{background:var(--bg3);border:1px solid var(--border);padding:1px 5px;border-radius:5px;font-size:.88em}",
      ".aai-table-wrap{overflow-x:auto;margin:6px 0 10px;border:1px solid var(--border);border-radius:10px}",
      ".aai-table{border-collapse:collapse;font-size:12.5px;width:100%}",
      ".aai-table th{background:var(--bg3);font-weight:700;text-align:left;padding:7px 10px;border-bottom:1px solid var(--border);white-space:nowrap}",
      ".aai-table td{padding:7px 10px;border-bottom:1px solid var(--border);white-space:nowrap}.aai-table tr:last-child td{border-bottom:0}",
      ".aai-acts{display:flex;gap:4px;margin-top:5px}",
      ".aai-act{display:flex;align-items:center;gap:5px;padding:4px 9px;border-radius:8px;border:0;background:transparent;color:var(--text3);font:inherit;font-size:12px;font-weight:600;cursor:pointer}",
      ".aai-act:hover{background:var(--bg3);color:var(--text)}.aai-act.on{color:var(--accent);background:var(--accent-light)}",
      ".aai-err .aai-txt{background:var(--orange-light,#fff7ed);color:var(--orange-text,#9a3412);border-color:transparent}",
      /* biriktirilgan fayllar */
      ".aai-ttswarn{margin:8px 14px 0;padding:9px 12px;border-radius:10px;background:#fff7ed;border:1px solid #fdba74;color:#9a3412;font-size:12.5px;line-height:1.5}",
      ".aai-voice{margin-top:5px;padding:7px 11px;border-radius:12px;background:var(--bg3);color:var(--text2);font-size:12.5px;font-style:italic;line-height:1.5;white-space:pre-wrap;word-break:break-word}",
      ".aai-files{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px}.aai-b.me .aai-files{justify-content:flex-end}",
      ".aai-fimg{width:110px;height:84px;border-radius:10px;object-fit:cover;border:1px solid var(--border);display:block}",
      ".aai-fchip{display:flex;align-items:center;gap:7px;padding:6px 10px;border-radius:10px;background:var(--bg2);border:1px solid var(--border);font-size:12px;color:var(--text2);max-width:240px}",
      ".aai-fchip b{font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".aai-fchip span{color:var(--text3);white-space:nowrap}",
      /* yozilmoqda */
      ".aai-wait{display:flex;align-items:center;gap:9px;color:var(--text3);font-size:12.5px}",
      ".aai-dots{display:inline-flex;gap:4px}.aai-dots i{width:7px;height:7px;border-radius:50%;background:var(--accent);animation:aaiDot 1.2s infinite}",
      ".aai-dots i:nth-child(2){animation-delay:.15s}.aai-dots i:nth-child(3){animation-delay:.3s}",
      "@keyframes aaiDot{0%,80%,100%{opacity:.25;transform:none}40%{opacity:1;transform:translateY(-3px)}}",
      /* tayyor savollar */
      ".aai-chips{display:flex;flex-wrap:wrap;gap:8px;padding-left:42px}",
      ".aai-chip{display:flex;align-items:center;gap:7px;padding:9px 14px;border-radius:999px;border:1px solid var(--border2);background:var(--bg2);color:var(--text2);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;transition:.15s;box-shadow:0 2px 6px rgba(15,23,42,.04)}",
      ".aai-chip:hover{border-color:var(--accent);color:var(--accent);transform:translateY(-2px);box-shadow:0 8px 18px color-mix(in srgb,var(--accent) 18%,transparent)}",
      /* pastki qator */
      ".aai-foot{border-top:1px solid var(--border);background:var(--bg2);padding:12px max(16px,calc((100% - 920px)/2)) 14px;position:relative;z-index:2}",
      ".aai-compose{flex:1;min-width:0;display:flex;align-items:flex-end;gap:2px;padding:3px 6px 3px 4px;border-radius:24px;border:1.5px solid var(--border2);background:var(--bg);transition:border-color .15s,box-shadow .15s}",
      ".aai-compose:focus-within{border-color:var(--accent);box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 14%,transparent)}",
      ".aai-compose .aai-ib{width:40px;height:40px;border:0;border-radius:50%;background:transparent}",
      ".aai-compose .aai-ib:hover{background:var(--bg3)}",
      ".aai-row.recording>.aai-compose{display:none!important}",
      ".aai-pend{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}",
      ".aai-pc{position:relative;display:flex;align-items:center;gap:7px;padding:6px 28px 6px 8px;border-radius:10px;background:var(--bg3);border:1px solid var(--border);font-size:12px;max-width:230px}",
      ".aai-pc img{width:30px;height:30px;border-radius:6px;object-fit:cover}",
      ".aai-pc b{font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".aai-pc small{display:block;color:var(--text3);font-size:10.5px}",
      ".aai-pc.err{border-color:#f97316}.aai-pc.err small{color:#ea580c}",
      ".aai-pc-x{position:absolute;right:5px;top:50%;transform:translateY(-50%);width:20px;height:20px;border-radius:50%;border:0;background:var(--bg4,var(--border));color:var(--text2);display:flex;align-items:center;justify-content:center;cursor:pointer}",
      ".aai-spin{width:14px;height:14px;border:2px solid var(--border2);border-top-color:var(--accent);border-radius:50%;animation:aaiSpin .8s linear infinite;flex-shrink:0}",
      "@keyframes aaiSpin{to{transform:rotate(360deg)}}",
      ".aai-row{display:flex;align-items:flex-end;gap:8px}",
      ".aai-ib{width:42px;height:42px;border-radius:12px;border:1.5px solid var(--border2);background:var(--bg3);color:var(--text2);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:.15s}",
      ".aai-ib:hover{border-color:var(--accent);color:var(--accent)}",
      ".aai-ib.rec{background:#ef4444;border-color:#ef4444;color:#fff;animation:aaiPulse 1.4s infinite}",
      "@keyframes aaiPulse{0%{box-shadow:0 0 0 0 rgba(239,68,68,.45)}70%{box-shadow:0 0 0 10px rgba(239,68,68,0)}100%{box-shadow:0 0 0 0 rgba(239,68,68,0)}}",
      ".aai-input{flex:1;min-width:0;border:0;border-radius:0;padding:10px 6px;font:inherit;font-size:14px;line-height:1.5;background:transparent;color:var(--text);resize:none;outline:none;min-height:40px;max-height:160px;overflow:hidden}",
      ".aai-input::placeholder{color:var(--text3)}",
      ".aai-send{width:48px;height:48px;border-radius:50%;border:0;background:linear-gradient(135deg,var(--accent),color-mix(in srgb,var(--accent) 70%,#6366f1));color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:.15s;box-shadow:0 6px 16px color-mix(in srgb,var(--accent) 35%,transparent)}",
      ".aai-send:hover{transform:scale(1.05)}.aai-send:disabled{opacity:.4;cursor:not-allowed;transform:none;box-shadow:none}",
      /* 🎤 Telegram uslubidagi ovozli xabar */
      ".aai-row{position:relative}",
      ".aai-mic{touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;transition:transform .15s,background .15s}",
      ".aai-mic.rec{background:#ef4444;transform:scale(1.2);animation:aaiPulse 1.4s infinite}",
      ".aai-row.recording>.aai-ib,.aai-row.recording>.aai-input,.aai-row.recording>.aai-send:not(.aai-mic){display:none!important}",
      ".aai-rec{display:flex;align-items:center;gap:10px;flex:1;min-width:0;min-height:48px;padding:0 6px 0 16px;border-radius:24px;background:var(--bg3);border:1.5px solid var(--border2);color:var(--text);font-size:13.5px;overflow:hidden;user-select:none;-webkit-user-select:none}",
      ".aai-rec-dot{width:10px;height:10px;border-radius:50%;background:#ef4444;flex-shrink:0;animation:aaiBlink 1s infinite}",
      "@keyframes aaiBlink{50%{opacity:.15}}",
      ".aai-rec-t{font-variant-numeric:tabular-nums;font-weight:700;min-width:50px;flex-shrink:0}",
      ".aai-rec-w{display:flex;align-items:center;justify-content:flex-end;gap:2px;height:28px;flex:1;min-width:0;overflow:hidden}",
      ".aai-rec-w i{width:3px;min-height:3px;border-radius:2px;background:var(--accent);flex-shrink:0}",
      ".aai-rec-h{color:var(--text3);font-size:12.5px;white-space:nowrap;flex-shrink:0;padding-right:8px;animation:aaiNudge 1.6s ease-in-out infinite}",
      "@keyframes aaiNudge{50%{transform:translateX(-6px)}}",
      ".aai-rec-x{width:36px;height:36px;border:0;border-radius:10px;background:transparent;color:#ef4444;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-left:-8px}",
      ".aai-rec-x:hover{background:rgba(239,68,68,.1)}",
      ".aai-lock{position:absolute;right:6px;bottom:66px;width:36px;padding:9px 0 7px;border-radius:18px;background:var(--bg2);border:1px solid var(--border);box-shadow:0 6px 18px rgba(0,0,0,.14);display:flex;flex-direction:column;align-items:center;gap:2px;color:var(--text3);animation:aaiUp .2s;z-index:5;pointer-events:none}",
      ".aai-lock svg:last-child{animation:aaiBob 1.2s ease-in-out infinite}",
      "@keyframes aaiUp{from{opacity:0;transform:translateY(10px)}}",
      "@keyframes aaiBob{50%{transform:translateY(-3px)}}",
      /* chatdagi ovozli xabar */
      ".aai-vm{display:flex;align-items:center;gap:10px;padding:8px 14px 8px 8px;border-radius:18px;background:var(--bg2);border:1px solid var(--border);min-width:210px;max-width:290px}",
      ".aai-b.me .aai-vm{background:var(--accent);border-color:transparent;border-radius:18px 18px 4px 18px;color:#fff}",
      ".aai-vm-btn{width:42px;height:42px;border-radius:50%;border:0;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:transform .15s}",
      ".aai-vm-btn:hover{transform:scale(1.06)}.aai-vm-btn svg{margin-left:2px}.aai-vm.play .aai-vm-btn svg{margin-left:0}",
      ".aai-b.me .aai-vm-btn{background:#fff;color:var(--accent)}",
      ".aai-vm-main{flex:1;min-width:0}",
      ".aai-vm-wave{display:flex;align-items:center;gap:2px;height:26px;cursor:pointer}",
      ".aai-vm-wave i{flex:1;max-width:3px;min-width:2px;border-radius:2px;background:var(--accent);opacity:.35}",
      ".aai-vm-wave i.on{opacity:1}",
      ".aai-b.me .aai-vm-wave i{background:#fff;opacity:.45}.aai-b.me .aai-vm-wave i.on{opacity:1}",
      ".aai-vm-t{font-size:11.5px;margin-top:2px;opacity:.75;font-variant-numeric:tabular-nums}",
      ".aai-drop{position:absolute;inset:0;z-index:30;display:none;align-items:center;justify-content:center;background:rgba(59,130,246,.10);border:2.5px dashed var(--accent);border-radius:18px;font-size:15px;font-weight:800;color:var(--accent);pointer-events:none}",
      ".aai.drag .aai-drop{display:flex}",
      "@media (max-width:900px){.aai{height:calc(100dvh - 64px - 24px);min-height:400px;border-radius:14px}" +
        ".aai-head{padding:10px 12px}.aai-on-x{display:none}.aai-hbtn span{display:none}.aai-hbtn{padding:0 10px}" +
        ".aai-body{padding:12px}.aai-b{max-width:94%}.aai-b.me{max-width:88%}.aai-b .aai-ava{display:none}" +
        ".aai-chips{padding-left:0}.aai-foot{padding:8px 10px calc(8px + env(safe-area-inset-bottom,0px))}" +
        ".aai{border-radius:16px}" +
        ".aai-send{width:44px;height:44px}.aai-compose .aai-ib{width:38px;height:38px}.aai-hist{top:56px;right:8px}.aai-hi-del{opacity:1}" +
        ".aai-input{font-size:16px}.aai-hero-t{font-size:19px}.aai-hero .aai-txt{padding:12px 14px}.aai-lock{bottom:62px}}",
    ].join("");
    document.head.appendChild(st);
  }

  /* ─── Chizish ─────────────────────────────────────────────────────────── */

  /** Oyna ekranning pastigacha cho'ziladi — yozish joyi doim eng pastda. */
  function fitHeight() {
    var els = [document.getElementById("aai-root")].concat(Array.prototype.slice.call(document.querySelectorAll(".ams")));
    var vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
    var phone = window.innerWidth <= 900;
    els.forEach(function (el) {
      if (!el || !el.offsetParent) return; // yashirin panel
      var top = el.getBoundingClientRect().top;
      var h = Math.round(vh - top - (phone ? 8 : 16));
      if (h < 380) return;
      el.style.height = h + "px";
      // Sahifa pastida ortiqcha joy (padding) bo'lsa — sahifa aylanmasin
      var extra = document.documentElement.scrollHeight - vh;
      if (extra > 0 && extra < 60 && h - extra >= 380) el.style.height = h - extra + "px";
    });
  }
  function fitSoon() {
    requestAnimationFrame(function () {
      fitHeight();
      setTimeout(fitHeight, 250); // panel ochilish animatsiyasidan keyin
    });
  }
  window.addEventListener("resize", fitSoon);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", fitSoon);

  function renderAdminAI() {
    fitSoon();
    var R = role();
    var wrap = document.getElementById(WRAP_ID[R]);
    if (!wrap || typeof D === "undefined") return;
    // Javob kutilayotganda yoki ovoz yozilayotganda qayta chizmaymiz
    // (live-sync ham shu funksiyani chaqiradi)
    if ((_busy || _rec) && wrap.querySelector("#aai-body")) return;
    // ⚠️ Panel allaqachon chizilgan bo'lsa — uni NOLDAN qayta qurmaymiz.
    // Ilgari live-sync har yangilanishda (bir necha soniyada bir) butun
    // panelni innerHTML bilan qayta yaratardi: xabarlar animatsiya bilan
    // qayta paydo bo'lardi, kursor/klaviatura yo'qolardi — ekran "miltillardi".
    // Endi faqat o'zgargan xabarlar yangilanadi.
    var existing = wrap.querySelector("#aai-root");
    if (existing && existing.getAttribute("data-role") === R) {
      renderPending();
      renderMessages();
      renderModeration();
      pullStore();
      return;
    }
    var keepInput = (document.getElementById("aai-input") || {}).value || "";
    injectStyles();

    wrap.innerHTML =
      '<div class="aai" id="aai-root" data-role="' + R + '">' +
      '<div class="aai-drop">📎 Faylni shu yerga tashlang</div>' +
      '<div class="aai-head">' +
      '<div class="aai-who"><div class="aai-ava">' + ICON.bot + "</div>" +
      '<div><div class="aai-name">AI Yordamchi</div><div class="aai-on"><i></i>Onlayn<span class="aai-on-x"> · ' + ROLE_TEXT[R].sub + '</span><span id="aai-modchip"></span></div></div></div>' +
      '<div class="aai-hbtns">' +
      '<button class="aai-hbtn" id="aai-hbtn" onclick="adminAiToggleHist(event)" title="Oldingi suhbatlar">' + ICON.hist + "<span>Tarix</span>" + ICON.chev + "</button>" +
      '<button class="aai-hbtn" onclick="adminAiNew()" title="Yangi suhbat">' + ICON.plus + "<span>Yangi</span></button>" +
      "</div></div>" +
      '<div id="aai-hist-box"></div>' +
      '<div id="aai-ttsbar"></div>' +
      '<div class="aai-body" id="aai-body"></div>' +
      '<div class="aai-foot">' +
      '<div class="aai-pend" id="aai-pend" style="display:none"></div>' +
      '<div class="aai-row" id="aai-row">' +
      '<input type="file" id="aai-file" multiple style="display:none" onchange="adminAiPick(this)">' +
      '<div class="aai-compose">' +
      '<button class="aai-ib" onclick="document.getElementById(\'aai-file\').click()" title="Fayl biriktirish: rasm, ovoz, PDF, Word, Excel, exe va boshqalar">' + ICON.clip + "</button>" +
      '<textarea id="aai-input" class="aai-input" rows="1" placeholder="' + (window.innerWidth < 600 ? "Xabar yozing…" : "Xabar yozing yoki fayl biriktiring…") + '" ' +
      "onkeydown=\"if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();adminAiSend()}\" " +
      "oninput=\"this.style.height='auto';this.style.height=Math.min(this.scrollHeight,160)+'px';this.style.overflowY=this.scrollHeight>160?'auto':'hidden';adminAiSendMode()\"></textarea>" +
      "</div>" +
      '<button class="aai-send" id="aai-send" onclick="adminAiSend()" title="Yuborish">' + ICON.send + "</button>" +
      '<button class="aai-send aai-mic" id="aai-mic" title="Bosib turing — ovozli xabar yozish" style="display:none">' + ICON.mic + "</button>" +
      "</div></div></div>";

    var inp = document.getElementById("aai-input");
    if (inp && keepInput) inp.value = keepInput;
    bindDrop();
    bindMic();
    renderPending();
    renderMessages();
    renderModeration();
    pullStore();
    if (R === "student") refreshModState();
    checkTtsStatus();
  }

  /* ─── Admin: ovoz xizmati holati ───────────────────────────────────────── */
  // Serverda ovoz xizmati sozlanmagan bo'lsa «Eshitish» ishlamaydi — admin
  // buni taxmin qilmasdan, shu yerda aniq ko'radi.
  var _ttsStatus = null;
  function checkTtsStatus(force) {
    if (role() !== "admin") return;
    if (_ttsStatus && !force) return renderTtsBar();
    fetch(apiBase() + "/api/ai-tts/status")
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        if (d && d.ok) _ttsStatus = d;
        renderTtsBar();
      })
      .catch(function () {});
  }
  function renderTtsBar(reason) {
    var bar = document.getElementById("aai-ttsbar");
    if (!bar) return;
    var d = _ttsStatus;
    var bad = reason || (d && !d.azure && !d.lovable && (!d.gemini || d.geminiPaused));
    if (!bad) {
      bar.innerHTML = "";
      return;
    }
    bar.innerHTML =
      '<div class="aai-ttswarn">🔇 <b>«Eshitish» ishlamayapti:</b> ' +
      esc(reason || "serverda o'zbekcha ovoz xizmati sozlanmagan") +
      ". Tuzatish: Render → Environment → <b>AZURE_SPEECH_KEY</b> (Microsoft ovozi) yoki <b>LOVABLE_API_KEY</b> qo'shing, so'ng «Save» bosing.</div>";
  }

  /* ─── Talaba: ogohlantirishlar va blok ─────────────────────────────────── */
  var _mod = { warnings: 0, blocked: false, max: 3 };

  function refreshModState() {
    fetch(apiBase() + "/api/ai/state")
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        if (d && d.ok && typeof d.warnings === "number") {
          _mod = { warnings: d.warnings, blocked: !!d.blocked, max: d.max || 3 };
          renderModeration();
        }
      })
      .catch(function () {});
  }

  function renderModeration() {
    if (role() !== "student") return;
    var chip = document.getElementById("aai-modchip");
    if (chip)
      chip.innerHTML = _mod.warnings > 0 || _mod.blocked
        ? ' · <b style="color:' + (_mod.blocked ? "#dc2626" : "#ea580c") + '">' +
          (_mod.blocked ? "🚫 bloklangan" : "⚠️ ogohlantirish " + Math.min(_mod.warnings, _mod.max) + "/" + _mod.max) + "</b>"
        : "";
    var row = document.getElementById("aai-row");
    var old = document.getElementById("aai-blocked");
    if (_mod.blocked) {
      if (row) row.style.display = "none";
      if (!old) {
        var foot = document.querySelector("#aai-root .aai-foot");
        if (foot)
          foot.insertAdjacentHTML(
            "beforeend",
            '<div id="aai-blocked" class="aai-blockbar">🚫 AI yordamchi siz uchun bloklangan — ' + _mod.max +
              " marta ogohlantirishdan keyin ham odobsiz so'z ishlatildi. Blokni mentoringiz yoki administrator ochadi.</div>",
          );
      }
    } else {
      if (row) row.style.display = "";
      if (old) old.remove();
    }
  }

  /** Sudrab tashlash va Ctrl+V bilan fayl qo'shish. */
  function bindDrop() {
    var root = document.getElementById("aai-root");
    if (!root) return;
    var depth = 0;
    root.addEventListener("dragenter", function (e) {
      if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") < 0) return;
      e.preventDefault();
      depth++;
      root.classList.add("drag");
    });
    root.addEventListener("dragover", function (e) {
      e.preventDefault();
    });
    root.addEventListener("dragleave", function () {
      if (--depth <= 0) {
        depth = 0;
        root.classList.remove("drag");
      }
    });
    root.addEventListener("drop", function (e) {
      e.preventDefault();
      depth = 0;
      root.classList.remove("drag");
      if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    });
    var inp = document.getElementById("aai-input");
    if (inp)
      inp.addEventListener("paste", function (e) {
        var files = e.clipboardData && e.clipboardData.files;
        if (files && files.length) {
          e.preventDefault();
          addFiles(files);
        }
      });
  }

  function renderPending() {
    var box = document.getElementById("aai-pend");
    if (!box) return;
    box.style.display = _pending.length ? "flex" : "none";
    box.innerHTML = _pending
      .map(function (p) {
        var lead = p.status === "busy"
          ? '<span class="aai-spin"></span>'
          : p.thumb
            ? '<img src="' + p.thumb + '" alt="">'
            : "<span>" + (KIND_ICON[p.kind] || "📦") + "</span>";
        var sub = p.status === "busy" ? "tayyorlanmoqda…" : p.status === "error" ? "⚠️ " + p.error : fmtSize(p.size);
        return (
          '<div class="aai-pc' + (p.status === "error" ? " err" : "") + '">' + lead +
          '<div style="min-width:0"><b>' + esc(p.name) + "</b><small>" + esc(sub) + "</small></div>" +
          '<button class="aai-pc-x" onclick="adminAiUnpick(\'' + p.id + '\')" title="Olib tashlash">' + ICON.x + "</button></div>"
        );
      })
      .join("");
    var btn = document.getElementById("aai-send");
    if (btn) btn.disabled = _busy || _pending.some(function (p) {
      return p.status === "busy";
    });
    updateSendMode();
  }

  function filesHtml(files) {
    if (!files || !files.length) return "";
    return (
      '<div class="aai-files">' +
      files
        .map(function (f) {
          if (f.kind === "voice" && f.wave) return voiceHtml(f);
          return f.thumb
            ? '<img class="aai-fimg" src="' + f.thumb + '" alt="' + esc(f.name) + '" title="' + esc(f.name) + '">'
            : '<div class="aai-fchip">' + (KIND_ICON[f.kind] || "📦") + "<b>" + esc(f.name) + "</b><span>" + fmtSize(f.size || 0) + "</span></div>";
        })
        .join("") +
      "</div>"
    );
  }

  function bubbleBot(inner, acts, cls) {
    return (
      '<div class="aai-b' + (cls ? " " + cls : "") + '"><div class="aai-ava">' + ICON.bot + '</div><div class="aai-bc">' +
      '<div class="aai-txt">' + inner + "</div>" +
      (acts ? '<div class="aai-acts">' + acts + "</div>" : "") +
      "</div></div>"
    );
  }

  function renderMessages() {
    var body = document.getElementById("aai-body");
    if (!body) return;
    var st = loadStore();
    var chat = currentChat(st, false);
    var msgs = (chat && chat.messages) || [];
    var R = role();
    SUGGEST = SUGGESTS[R];
    // Har bir element — alohida qism: keyin faqat o'zgarganlari almashtiriladi
    var empty = !msgs.length && !_busy && !_lastError;
    var parts = empty ? [] : [bubbleBot(md(ROLE_TEXT[R].hello))];
    var html = "";
    var flush = function () {
      if (html) parts.push(html);
      html = "";
    };
    if (empty)
      html +=
        '<div class="aai-hero">' +
        '<div class="aai-hero-ava">' + ICON.bot + "</div>" +
        '<div class="aai-hero-t">AI Yordamchi</div>' +
        '<div class="aai-hero-s">' + esc(ROLE_TEXT[R].sub.charAt(0).toUpperCase() + ROLE_TEXT[R].sub.slice(1)) + " · javob beradi, tushuntiradi, ovoz chiqarib o'qiydi</div>" +
        '<div class="aai-txt">' + md(ROLE_TEXT[R].hello) + "</div>" +
        '<div class="aai-chips">' +
        SUGGEST.map(function (s, i) {
          return '<button class="aai-chip" onclick="adminAiSuggest(' + i + ')"><span>' + s.ic + "</span>" + esc(s.t) + "</button>";
        }).join("") +
        "</div></div>";

    flush();
    msgs.forEach(function (m, i) {
      flush();
      if (m.role === "user")
        html +=
          '<div class="aai-b me"><div class="aai-bc">' + filesHtml(m.files) +
          (m.content ? '<div class="aai-txt">' + esc(m.content) + "</div>" : "") +
          (m.voiceText ? '<div class="aai-voice">🎤 «' + esc(m.voiceText) + "»</div>" : "") + "</div></div>";
      else {
        var speaking = _tts.idx === i && _tts.chat === (chat && chat.id);
        var loading = speaking && _tts.loading;
        html += bubbleBot(
          md(m.content),
          '<button class="aai-act' + (speaking ? " on" : "") + '" onclick="adminAiSpeak(' + i + ')">' +
            (loading ? '<span class="aai-spin"></span>Tayyorlanmoqda…' : speaking ? ICON.stop + "To'xtatish" : ICON.speak + "Eshitish") + "</button>" +
            '<button class="aai-act" onclick="adminAiCopy(' + i + ')">' + ICON.copy + "Nusxalash</button>",
          m.warn ? "aai-warn" : "",
        );
      }
    });
    flush();

    if (_busy)
      html += bubbleBot(
        '<div class="aai-wait"><span class="aai-dots"><i></i><i></i><i></i></span><span id="aai-status">' + STATUS_STEPS[0] + "</span></div>",
      );
    else if (_lastError)
      html += bubbleBot(
        "⚠️ Javob olinmadi: " + esc(_lastError),
        '<button class="aai-act" onclick="adminAiRetry()">' + ICON.retry + "Qayta urinish</button>",
        "aai-err",
      );

    flush();
    patchBody(body, parts, (chat && chat.id) || "", msgs.length > 0 || _busy);
  }

  /**
   * Xabarlar oynasini yangilaydi: o'zgarmagan xabarlarga TEGMAYDI, faqat
   * o'zgarganini almashtiradi va yangisini qo'shadi. Animatsiya faqat yangi
   * paydo bo'lgan xabarda — eski xabarlar qayta "yonib-o'chmaydi".
   */
  var _shown = { body: null, chat: null, parts: [] };
  var TRANSIENT = /aai-wait|aai-chips|aai-err|aai-hero/;

  function toEl(html) {
    var t = document.createElement("div");
    t.innerHTML = html;
    return t.firstElementChild;
  }

  function patchBody(body, parts, chatId, toBottom) {
    var old = _shown.parts;
    var kids = body.children;
    // Yangi (bo'sh) suhbatga birinchi xabar yozilganda ham — o'sha suhbat
    var sameChat = _shown.chat === chatId || (_shown.chat === "" && !!chatId);
    var same = _shown.body === body && sameChat && kids.length === old.length;
    if (same && old.length === parts.length && old.join("") === parts.join("")) return; // hech narsa o'zgarmagan

    var nearBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 80;
    var keepTop = body.scrollTop;
    var added = false;
    if (!same) {
      body.innerHTML = parts.join("");
      added = true;
    } else {
      for (var i = 0; i < parts.length; i++) {
        if (i < old.length && parts[i] === old[i]) continue;
        var el = toEl(parts[i]);
        if (!el) continue;
        var fresh = i >= old.length || TRANSIENT.test(old[i]);
        if (fresh) {
          el.classList.add("aai-new");
          added = true;
        }
        if (i < kids.length) body.replaceChild(el, kids[i]);
        else body.appendChild(el);
      }
      while (body.children.length > parts.length) body.removeChild(body.lastElementChild);
    }
    _shown = { body: body, chat: chatId, parts: parts };
    if (!toBottom) body.scrollTop = 0;
    else if (added || nearBottom) body.scrollTop = body.scrollHeight;
    else body.scrollTop = keepTop;
  }

  /* ─── Tarix ro'yxati ──────────────────────────────────────────────────── */

  function renderHist() {
    var box = document.getElementById("aai-hist-box");
    var btn = document.getElementById("aai-hbtn");
    if (btn) btn.classList.toggle("on", _histOpen);
    if (!box) return;
    if (!_histOpen) {
      box.innerHTML = "";
      return;
    }
    var st = loadStore();
    var list = st.chats.filter(function (c) {
      return c.messages && c.messages.length;
    });
    box.innerHTML =
      '<div class="aai-hist" onclick="event.stopPropagation()">' +
      '<div class="aai-hist-top"><span>Suhbatlar tarixi</span><span>' + list.length + " ta</span></div>" +
      '<div class="aai-hist-list">' +
      (list.length
        ? list
            .map(function (c) {
              var n = c.messages.filter(function (m) {
                return m.role === "user";
              }).length;
              return (
                '<div class="aai-hi' + (c.id === st.current ? " cur" : "") + '" onclick="adminAiOpen(\'' + c.id + '\')">' +
                '<div class="aai-hi-main"><div class="aai-hi-t">' + esc(chatTitle(c)) + "</div>" +
                '<div class="aai-hi-s">' + esc(fmtWhen(c.updatedAt)) + " · " + n + " ta savol</div></div>" +
                (role() === "student" ? "" : '<button class="aai-hi-del" onclick="event.stopPropagation();adminAiDel(\'' + c.id + '\')" title="O\'chirish">' + ICON.trash + "</button>") + "</div>"
              );
            })
            .join("")
        : '<div class="aai-hist-empty">Hali suhbat yo\'q. Birinchi savolingizni yozing — u shu yerda saqlanadi.</div>') +
      "</div></div>";
  }

  document.addEventListener("click", function () {
    if (_histOpen) {
      _histOpen = false;
      renderHist();
    }
  });

  /* ─── Yuborish ────────────────────────────────────────────────────────── */

  function apiBase() {
    try {
      if (typeof __API_BASE__ !== "undefined" && __API_BASE__) return __API_BASE__;
    } catch (e) {}
    return window.__API_BASE__ || "";
  }

  /** Tarixdagi xabarlardan API xabarlarini quradi (fayllar bilan). */
  function apiMessages(chat) {
    var msgs = chat.messages.slice(-12);
    var budget = 17 * 1024 * 1024; // fayl qismlari uchun (yangilaridan boshlab)
    var out = [];
    for (var i = msgs.length - 1; i >= 0; i--) {
      var m = msgs[i];
      if (m.role !== "user") {
        out.unshift({ role: "assistant", content: m.content });
        continue;
      }
      var text = (m.content || "") + (m.fileText ? "\n\n" + m.fileText : "");
      // Ovozning o'zi faqat shu sessiyada xotirada — tarix uchun uning matni
      if (m.voiceText && !(_memParts[m.key] || []).length)
        text += (text ? "\n\n" : "") + "🎤 Ovozli xabar matni: «" + m.voiceText + "»";
      var parts = _memParts[m.key] || [];
      var use = [];
      parts.forEach(function (p) {
        if (p.bytes <= budget) {
          use.push(p.part);
          budget -= p.bytes;
        }
      });
      var missing = (m.files || []).filter(function (f) {
        return f.binary;
      }).length - use.length;
      if (missing > 0) text += "\n\n[Oldin biriktirilgan " + missing + " ta fayl endi mavjud emas — kerak bo'lsa qayta yuboring]";
      out.unshift({
        role: "user",
        content: use.length ? [{ type: "text", text: text || "Ushbu faylni tahlil qil." }].concat(use) : text || "…",
      });
    }
    return out;
  }

  async function requestReply() {
    var st = loadStore();
    var chat = currentChat(st, false);
    if (!chat) return;
    _busy = true;
    _lastError = "";
    renderPending();
    renderMessages();

    var step = 0;
    clearInterval(_statusTimer);
    _statusTimer = setInterval(function () {
      step = Math.min(step + 1, STATUS_STEPS.length - 1);
      var el = document.getElementById("aai-status");
      if (el) el.textContent = STATUS_STEPS[step];
    }, 2500);

    var messages = apiMessages(chat);
    var hasFiles = messages.some(function (m) {
      return Array.isArray(m.content);
    });
    try {
      var payload = JSON.stringify(
        role() === "admin"
          ? { async: true, mode: "admin", hasFiles: hasFiles, system: systemPrompt(), messages: messages }
          : { async: true, mode: role(), hasFiles: hasFiles, messages: messages },
      );
      var out = await askAi(payload);
      var res = out.res;
      var data = out.data;
      if (data && data.moderation)
        _mod = { warnings: data.moderation.warnings || 0, blocked: !!data.moderation.blocked, max: data.moderation.max || 3 };
      if (data && data.code === "ai-blocked") _mod.blocked = true;
      if (!res.ok || !data.ok) throw new Error(data.error || "Server xato: " + res.status);
      var st2 = loadStore();
      var c2 = st2.chats.find(function (x) {
        return x.id === chat.id;
      });
      if (c2) {
        // Ovozli xabar matni — xabar ostida ko'rinadi va tarixda saqlanadi
        if (data.voiceText) {
          for (var q = c2.messages.length - 1; q >= 0; q--) {
            if (c2.messages[q].role !== "user") continue;
            c2.messages[q].voiceText = String(data.voiceText).slice(0, 8000);
            break;
          }
        }
        c2.messages.push({ role: "assistant", content: data.text || "...", ts: Date.now(), warn: data.moderation ? true : undefined });
        c2.updatedAt = Date.now();
        saveStore(st2);
      }
    } catch (e) {
      _lastError = (e && e.message) || "noma'lum xato";
    }
    clearInterval(_statusTimer);
    _busy = false;
    renderPending();
    renderMessages();
    renderModeration();
    // Telefonda fokus klaviaturani qayta ochib, ekranni sakratadi — faqat kompyuterda
    var inp = document.getElementById("aai-input");
    var touch = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    if (inp && !touch) inp.focus();
  }

  /**
   * AI ga so'rov: server so'rovni darhol qabul qiladi (job), javob tayyor
   * bo'lguncha qisqa so'rovlar bilan tekshiramiz. Uzoq ochiq ulanish yo'q —
   * oraliq proxy (Vercel) uni uza olmaydi. Tarmoq uzilishi, server qayta
   * ishga tushishi kabi vaqtinchalik xatolarda avtomatik qayta uriniladi —
   * foydalanuvchi "server xatosi"ni ko'rmaydi, javob birinchi urinishda keladi.
   */
  var sleep = function (ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  };
  var transient = function (status) {
    return !status || status === 404 || status === 408 || status === 425 || status === 429 || status >= 500;
  };

  async function askAi(payload) {
    var lastStatus = 0;
    var lastErr = "";
    for (var attempt = 0; attempt < 4; attempt++) {
      if (attempt) await sleep(attempt === 1 ? 1500 : attempt * 3000);
      var res, data;
      try {
        res = await fetch(apiBase() + "/api/ai-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
        });
        data = await res.json().catch(function () {
          return null;
        });
      } catch (e) {
        lastErr = "internet aloqasi uzildi";
        continue; // tarmoq xatosi — qayta urinamiz
      }
      lastStatus = res.status;
      if (!data) {
        lastErr = "server javob bermadi (HTTP " + res.status + ")";
        if (transient(res.status)) continue;
        return { res: res, data: { ok: false, error: lastErr } };
      }
      // Eski server (job qo'llamaydi) — javob shu yerning o'zida
      if (!data.job) {
        if (!data.ok && transient(res.status) && data.code !== "ai-blocked" && res.status !== 429) {
          lastErr = data.error || "server xatosi " + res.status;
          continue;
        }
        return { res: res, data: data };
      }
      // Javob tayyor bo'lguncha tekshirib turamiz (4 daqiqagacha)
      var started = Date.now();
      var misses = 0;
      while (Date.now() - started < 240000) {
        await sleep(Date.now() - started < 10000 ? 1000 : 1800);
        var pr, pd;
        try {
          pr = await fetch(apiBase() + "/api/ai-chat/job/" + encodeURIComponent(data.job), { cache: "no-store" });
          pd = await pr.json().catch(function () {
            return null;
          });
        } catch (e) {
          if (++misses > 8) break;
          continue; // vaqtinchalik uzilish — tekshirishda davom etamiz
        }
        if (pr.status === 404 && pd && pd.code === "job-not-found") {
          lastErr = "server qayta ishga tushdi";
          break; // server qayta ishga tushgan — so'rovni qayta yuboramiz
        }
        if (!pd) {
          if (++misses > 8) break;
          continue;
        }
        if (pd.pending) continue;
        return { res: pr, data: pd };
      }
      if (Date.now() - started >= 240000)
        return { res: { ok: false, status: 504 }, data: { ok: false, error: "AI javobi juda uzoq tayyorlandi — qaytadan urinib ko'ring" } };
    }
    return { res: { ok: false, status: lastStatus }, data: { ok: false, error: lastErr || "server javob bermadi" } };
  }

  function adminAiSend() {
    var inp = document.getElementById("aai-input");
    if (!inp || _busy || _rec) return;
    if (role() === "student" && _mod.blocked) return renderModeration();
    if (_pending.some(function (p) { return p.status === "busy"; })) {
      if (typeof toast === "function") toast("⏳ Fayl hali tayyorlanmoqda…");
      return;
    }
    var ready = _pending.filter(function (p) {
      return p.status === "ready";
    });
    var text = inp.value.trim();
    if (!text && !ready.length) return;

    var st = loadStore();
    var chat = currentChat(st, true);
    var key = chat.id + ":" + Date.now();
    var fileText = ready
      .filter(function (p) {
        return p.text;
      })
      .map(function (p) {
        return p.text;
      })
      .join("\n\n");
    // Saqlanadigan matn cheklanadi (tarix serverga sinxronlanadi)
    if (fileText.length > 40000) fileText = fileText.slice(0, 40000) + "\n…(qisqartirildi)";
    var binParts = ready.filter(function (p) {
      return p.part;
    });
    if (binParts.length) _memParts[key] = binParts.map(function (p) {
      return { part: p.part, bytes: p.bytes || 0 };
    });
    chat.messages.push({
      role: "user",
      content: text,
      key: key,
      ts: Date.now(),
      fileText: fileText || undefined,
      files: ready.length
        ? ready.map(function (p) {
            return { name: p.name, size: p.size, kind: p.kind, thumb: p.thumb, binary: !!p.part, dur: p.dur, wave: p.wave, vid: p.vid };
          })
        : undefined,
    });
    chat.updatedAt = Date.now();
    saveStore(st);

    inp.value = "";
    inp.style.height = "auto";
    _pending = [];
    renderPending();
    requestReply();
  }

  /* ─── 🎤 Ovozli xabar (WAV, 16 kHz) ───────────────────────────────────── */
  /* WAV tanlangani sababi: AI aynan shu formatni har doim qabul qiladi
     (brauzer odatda yozadigan webm esa qo'llab-quvvatlanmaydi).          */

  var _rec = null;
  var MAX_REC_SEC = 180;

  function encodeWav(chunks, rate) {
    var len = chunks.reduce(function (n, c) {
      return n + c.length;
    }, 0);
    var buf = new ArrayBuffer(44 + len * 2);
    var dv = new DataView(buf);
    var ws = function (o, s) {
      for (var i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i));
    };
    ws(0, "RIFF");
    dv.setUint32(4, 36 + len * 2, true);
    ws(8, "WAVE");
    ws(12, "fmt ");
    dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true);
    dv.setUint16(22, 1, true);
    dv.setUint32(24, rate, true);
    dv.setUint32(28, rate * 2, true);
    dv.setUint16(32, 2, true);
    dv.setUint16(34, 16, true);
    ws(36, "data");
    dv.setUint32(40, len * 2, true);
    var o = 44;
    chunks.forEach(function (c) {
      for (var i = 0; i < c.length; i++, o += 2) {
        var v = Math.max(-1, Math.min(1, c[i]));
        dv.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      }
    });
    return new Blob([buf], { type: "audio/wav" });
  }

  function downsample(data, from, to) {
    if (from === to) return data;
    var k = from / to;
    var out = new Float32Array(Math.floor(data.length / k));
    for (var i = 0; i < out.length; i++) {
      var s = Math.floor(i * k), e = Math.min(data.length, Math.floor((i + 1) * k)), sum = 0;
      for (var j = s; j < e; j++) sum += data[j];
      out[i] = sum / Math.max(1, e - s);
    }
    return out;
  }

  /* ─── Telegram uslubi ──────────────────────────────────────────────────
     • Matn bo'sh bo'lsa — «Yuborish» o'rnida 🎤 turadi.
     • Bosib turing → yozadi; qo'yib yuboring → darhol yuboriladi.
     • Chapga suring → bekor; tepaga suring → qulflanadi (qo'l bo'sh).
     • Bir marta bosish ham qulflangan yozishni boshlaydi (kompyuter uchun).
     • Chatda xabar ▶ tugmali to'lqin (waveform) ko'rinishida chiqadi.    */

  var _recWant = { lock: false, cancel: false }; // mikrofon ruxsati kutilayotganda
  var _hold = null; // barmoq/sichqoncha bosib turilgani
  var _vBlobs = {}; // ovozli xabarlar (shu sahifada)

  function canRecord() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  /** Matn yoki fayl bo'lsa — «Yuborish», bo'lmasa — 🎤. */
  function updateSendMode() {
    var send = document.getElementById("aai-send");
    var mic = document.getElementById("aai-mic");
    var inp = document.getElementById("aai-input");
    if (!send || !mic) return;
    if (_rec) {
      mic.style.display = "";
      return;
    }
    var has = (inp && inp.value.trim()) || _pending.length || !canRecord();
    send.style.display = has ? "" : "none";
    mic.style.display = has ? "none" : "";
  }

  function recTime(ms) {
    var s = Math.max(0, ms) / 1000;
    return Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0") + "," + Math.floor((s * 10) % 10);
  }
  function durText(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
  }

  function renderRec() {
    var row = document.getElementById("aai-row");
    var mic = document.getElementById("aai-mic");
    if (!row || !mic) return;
    var bar = document.getElementById("aai-recbar");
    var lock = document.getElementById("aai-lock");
    if (!_rec) {
      row.classList.remove("recording");
      mic.classList.remove("rec");
      mic.innerHTML = ICON.mic;
      mic.title = "Bosib turing — ovozli xabar yozish";
      if (bar) bar.remove();
      if (lock) lock.remove();
      updateSendMode();
      return;
    }
    row.classList.add("recording");
    mic.style.display = "";
    mic.classList.toggle("rec", !_rec.locked);
    mic.innerHTML = _rec.locked ? ICON.send : ICON.mic;
    mic.title = _rec.locked ? "Yuborish" : "Qo'yib yuboring — xabar yuboriladi";
    var narrow = window.innerWidth < 600;
    if (!bar) {
      mic.insertAdjacentHTML("beforebegin", '<div class="aai-rec" id="aai-recbar"></div>');
      bar = document.getElementById("aai-recbar");
    }
    bar.innerHTML =
      (_rec.locked ? '<button class="aai-rec-x" id="aai-rec-x" title="Bekor qilish">' + ICON.trash20 + "</button>" : "") +
      '<i class="aai-rec-dot"></i><span class="aai-rec-t" id="aai-rec-t"></span>' +
      '<div class="aai-rec-w" id="aai-rec-w"></div>' +
      (_rec.locked ? "" : '<span class="aai-rec-h" id="aai-rec-h">‹ ' + (narrow ? "Bekor qilish" : "Bekor qilish uchun chapga suring") + "</span>");
    var x = document.getElementById("aai-rec-x");
    if (x)
      x.onclick = function () {
        stopRec("cancel");
      };
    if (!_rec.locked) {
      if (!lock) row.insertAdjacentHTML("beforeend", '<div class="aai-lock" id="aai-lock">' + ICON.lock + ICON.up + "</div>");
    } else if (lock) lock.remove();
    recTick();
  }

  /** Vaqt va jonli to'lqin (har 100 ms). */
  function recTick() {
    if (!_rec) return;
    var t = document.getElementById("aai-rec-t");
    if (t) t.textContent = recTime(Date.now() - _rec.t0);
    var w = document.getElementById("aai-rec-w");
    if (w) {
      var n = Math.max(8, Math.floor((w.clientWidth || 160) / 5));
      var lv = _rec.levels.slice(-n);
      var html = "";
      for (var i = 0; i < lv.length; i++) html += '<i style="height:' + (3 + Math.round(lv[i] * 25)) + 'px"></i>';
      w.innerHTML = html;
    }
  }

  /** Barmoq surilganda — «bekor qilish» yozuvi va qulf ergashadi. */
  function recDrag(dx, dy) {
    var h = document.getElementById("aai-rec-h");
    if (h) {
      h.style.transform = "translateX(" + Math.round(dx * 0.7) + "px)";
      h.style.opacity = String(Math.max(0.15, 1 + dx / 130));
      h.style.animation = dx < -4 ? "none" : "";
    }
    var lock = document.getElementById("aai-lock");
    if (lock) lock.style.transform = "translateY(" + Math.round(dy * 0.5) + "px)";
  }

  function bindMic() {
    var mic = document.getElementById("aai-mic");
    if (!mic || mic._bound) return;
    mic._bound = true;
    mic.addEventListener("contextmenu", function (e) {
      e.preventDefault();
    });
    mic.addEventListener("pointerdown", function (e) {
      if (e.button) return;
      e.preventDefault();
      if (_rec && _rec.locked) return stopRec("send"); // qulflangan — yuborish
      if (_rec || _hold) return;
      try {
        mic.setPointerCapture(e.pointerId);
      } catch (x) {}
      _hold = { x0: e.clientX, y0: e.clientY, t0: Date.now(), id: e.pointerId };
      _recWant = { lock: false, cancel: false };
      startRec();
    });
    mic.addEventListener("pointermove", function (e) {
      if (!_hold || e.pointerId !== _hold.id || !_rec) return;
      var dx = Math.min(0, e.clientX - _hold.x0);
      var dy = Math.min(0, e.clientY - _hold.y0);
      if (dx < -110) {
        _hold = null;
        return stopRec("cancel");
      }
      if (dy < -80) {
        _hold = null;
        return lockRec();
      }
      recDrag(dx, dy);
    });
    var up = function (e) {
      if (!_hold || e.pointerId !== _hold.id) return;
      var quick = Date.now() - _hold.t0 < 400;
      _hold = null;
      if (!_rec) {
        // mikrofon hali ochilmagan (ruxsat so'ralmoqda) — ochilgach qulflanadi
        _recWant.lock = true;
        return;
      }
      if (quick) lockRec(); // bir marta bosildi — qo'l bo'sh rejim
      else stopRec("send");
    };
    mic.addEventListener("pointerup", up);
    mic.addEventListener("pointercancel", up);
  }

  function lockRec() {
    if (!_rec || _rec.locked) return;
    _rec.locked = true;
    try {
      navigator.vibrate && navigator.vibrate(15);
    } catch (e) {}
    renderRec();
  }

  document.addEventListener("keydown", function (e) {
    if (!_rec) return;
    if (e.key === "Escape") stopRec("cancel");
    else if (e.key === "Enter" && _rec.locked) {
      e.preventDefault();
      stopRec("send");
    }
  });

  async function startRec() {
    if (!canRecord()) {
      if (typeof toast === "function") toast("⚠️ Bu brauzer ovoz yozishni qo'llab-quvvatlamaydi");
      return;
    }
    if (_rec || _recWant.starting) return;
    _recWant.starting = true;
    try {
      var stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      _recWant.starting = false;
      if (_recWant.cancel) {
        stream.getTracks().forEach(function (t) {
          t.stop();
        });
        return;
      }
      var Ctx = window.AudioContext || window.webkitAudioContext;
      var ctx = new Ctx();
      if (ctx.state === "suspended") ctx.resume().catch(function () {});
      var src = ctx.createMediaStreamSource(stream);
      var proc = ctx.createScriptProcessor(2048, 1, 1);
      var chunks = [];
      var levels = [];
      proc.onaudioprocess = function (e) {
        var d = e.inputBuffer.getChannelData(0);
        chunks.push(new Float32Array(d));
        var sum = 0;
        for (var i = 0; i < d.length; i += 4) sum += d[i] * d[i];
        var rms = Math.sqrt(sum / (d.length / 4));
        levels.push(Math.min(1, Math.sqrt(rms) * 1.9));
      };
      src.connect(proc);
      proc.connect(ctx.destination);
      _rec = { stream: stream, ctx: ctx, src: src, proc: proc, chunks: chunks, levels: levels, t0: Date.now(), locked: !!_recWant.lock };
      _rec.timer = setInterval(function () {
        if (!_rec) return;
        if (Date.now() - _rec.t0 > MAX_REC_SEC * 1000) stopRec("send");
        else recTick();
      }, 100);
      try {
        navigator.vibrate && navigator.vibrate(25);
      } catch (e) {}
      renderRec();
    } catch (e) {
      _recWant.starting = false;
      _hold = null;
      if (typeof toast === "function") toast("⚠️ Mikrofonga ruxsat berilmadi — brauzer manzil satridagi 🔒 belgisidan ruxsat bering");
    }
  }

  /** @param {"send"|"cancel"} mode */
  function stopRec(mode) {
    var r = _rec;
    if (!r) {
      _recWant.cancel = mode === "cancel";
      return;
    }
    _rec = null;
    _hold = null;
    clearInterval(r.timer);
    try {
      r.proc.disconnect();
      r.src.disconnect();
      r.stream.getTracks().forEach(function (t) {
        t.stop();
      });
    } catch (e) {}
    var rate = r.ctx.sampleRate;
    try {
      r.ctx.close();
    } catch (e) {}
    renderRec();
    if (mode !== "send") {
      try {
        navigator.vibrate && navigator.vibrate([10, 40, 10]);
      } catch (e) {}
      return;
    }
    var sec = (Date.now() - r.t0) / 1000;
    if (sec < 0.8 || !r.chunks.length) {
      if (typeof toast === "function") toast("🎤 Ovozli xabar uchun tugmani bosib turing");
      return;
    }
    var all = new Float32Array(r.chunks.reduce(function (n, c) {
      return n + c.length;
    }, 0));
    var o = 0;
    r.chunks.forEach(function (c) {
      all.set(c, o);
      o += c.length;
    });
    var blob = encodeWav([downsample(all, rate, 16000)], 16000);
    sendVoice(blob, all.length / rate, waveOf(r.levels, 40));
  }

  /** To'lqin: 0–9 raqamlardan iborat qisqa satr (tarixda kam joy egallaydi). */
  function waveOf(levels, n) {
    var out = [];
    var max = 0;
    for (var i = 0; i < n; i++) {
      var a = Math.floor((i * levels.length) / n);
      var b = Math.max(a + 1, Math.floor(((i + 1) * levels.length) / n));
      var s = 0;
      for (var j = a; j < b && j < levels.length; j++) s += levels[j];
      var v = s / Math.max(1, Math.min(b, levels.length) - a);
      out.push(v);
      if (v > max) max = v;
    }
    return out
      .map(function (v) {
        return max ? Math.round((v / max) * 9) : 0;
      })
      .join("");
  }

  /** Yozilgan ovozni darhol AI ga yuboradi (Telegramdagidek). */
  function sendVoice(blob, dur, wave) {
    var d = new Date();
    var name = "Ovozli xabar " + String(d.getHours()).padStart(2, "0") + "-" + String(d.getMinutes()).padStart(2, "0") + ".wav";
    var file = new File([blob], name, { type: "audio/wav" });
    var vid = uid();
    _vBlobs[vid] = blob;
    vPut(vid, blob);
    var item = { id: uid(), name: name, size: blob.size, kind: "voice", status: "busy", dur: Math.round(dur * 10) / 10, wave: wave, vid: vid };
    _pending.push(item);
    renderPending();
    prepareFile(file, "voice")
      .then(function (r) {
        Object.assign(item, r, { status: "ready" });
      })
      .catch(function (e) {
        item.status = "error";
        item.error = (e && e.message) || "xato";
      })
      .then(function () {
        renderPending();
        if (item.status !== "ready") return;
        // AI hali oldingi savolga javob yozayotgan bo'lsa — tugashini kutamiz
        var tries = 0;
        (function trySend() {
          if (_pending.indexOf(item) < 0) return; // foydalanuvchi olib tashladi yoki yuborildi
          if (!_busy && !_rec) return adminAiSend();
          if (++tries < 600) setTimeout(trySend, 500);
        })();
      });
  }

  /* Ovozli xabarlar qurilmada saqlanadi — sahifa yangilansa ham eshitiladi. */
  var _vdb = null;
  function vdb() {
    if (_vdb) return _vdb;
    _vdb = new Promise(function (res, rej) {
      try {
        var q = indexedDB.open("crm-ai-voice", 1);
        q.onupgradeneeded = function () {
          q.result.createObjectStore("v");
        };
        q.onsuccess = function () {
          res(q.result);
        };
        q.onerror = function () {
          rej(q.error);
        };
      } catch (e) {
        rej(e);
      }
    });
    return _vdb;
  }
  function vPut(id, blob) {
    vdb()
      .then(function (db) {
        db.transaction("v", "readwrite").objectStore("v").put(blob, id);
      })
      .catch(function () {});
  }
  function vGet(id) {
    if (_vBlobs[id]) return Promise.resolve(_vBlobs[id]);
    return vdb()
      .then(function (db) {
        return new Promise(function (res) {
          var q = db.transaction("v").objectStore("v").get(id);
          q.onsuccess = function () {
            if (q.result) _vBlobs[id] = q.result;
            res(q.result || null);
          };
          q.onerror = function () {
            res(null);
          };
        });
      })
      .catch(function () {
        return null;
      });
  }

  function voiceHtml(f) {
    var w = String(f.wave || "");
    var bars = "";
    for (var i = 0; i < w.length; i++) bars += '<i style="height:' + (4 + Number(w[i]) * 2.4) + 'px"></i>';
    var id = esc(f.vid || "");
    return (
      '<div class="aai-vm" data-vm="' + id + '" data-dur="' + Number(f.dur || 0) + '">' +
      '<button class="aai-vm-btn" onclick="adminAiVoice(\'' + id + '\')" title="Eshitish">' + ICON.play + "</button>" +
      '<div class="aai-vm-main"><div class="aai-vm-wave" onclick="adminAiVoice(\'' + id + '\', event)">' + bars + "</div>" +
      '<div class="aai-vm-t">' + durText(f.dur) + "</div></div></div>"
    );
  }

  /* Ijro — bir vaqtda bitta ovozli xabar */
  var _vp = null;

  function vpPaint() {
    if (!_vp) return;
    var a = _vp.audio;
    var dur = a.duration && isFinite(a.duration) ? a.duration : _vp.dur;
    var pct = dur ? Math.min(1, a.currentTime / dur) : 0;
    var playing = !a.paused && !a.ended;
    document.querySelectorAll('[data-vm="' + _vp.vid + '"]').forEach(function (el) {
      el.classList.toggle("play", playing);
      var b = el.querySelector(".aai-vm-btn");
      var want = playing ? "pause" : "play";
      if (b && b.getAttribute("data-s") !== want) {
        b.setAttribute("data-s", want);
        b.innerHTML = ICON[want];
      }
      var bars = el.querySelectorAll(".aai-vm-wave i");
      var on = Math.round(pct * bars.length);
      bars.forEach(function (x, i) {
        x.classList.toggle("on", i < on);
      });
      var t = el.querySelector(".aai-vm-t");
      if (t) t.textContent = durText(a.currentTime > 0 ? a.currentTime : dur);
    });
  }

  function vpReset(vid) {
    document.querySelectorAll('[data-vm="' + vid + '"]').forEach(function (el) {
      el.classList.remove("play");
      var b = el.querySelector(".aai-vm-btn");
      if (b) {
        b.removeAttribute("data-s");
        b.innerHTML = ICON.play;
      }
      el.querySelectorAll(".aai-vm-wave i").forEach(function (x) {
        x.classList.remove("on");
      });
      var t = el.querySelector(".aai-vm-t");
      if (t) t.textContent = durText(Number(el.getAttribute("data-dur")) || 0);
    });
  }

  function vpStop() {
    var p = _vp;
    if (!p) return;
    _vp = null;
    cancelAnimationFrame(p.raf);
    try {
      p.audio.pause();
    } catch (e) {}
    if (p.url) URL.revokeObjectURL(p.url);
    vpReset(p.vid);
  }

  function vpLoop() {
    if (!_vp) return;
    vpPaint();
    _vp.raf = requestAnimationFrame(vpLoop);
  }

  /** ▶ / ⏸; to'lqinga bosilsa — o'sha joydan ijro. */
  function playVoice(vid, ev) {
    if (!vid) return;
    var seek = null;
    if (ev && ev.currentTarget) {
      var rc = ev.currentTarget.getBoundingClientRect();
      if (rc.width) seek = Math.max(0, Math.min(1, (ev.clientX - rc.left) / rc.width));
    }
    if (_vp && _vp.vid === vid) {
      var a0 = _vp.audio;
      if (seek != null && a0.duration && isFinite(a0.duration)) {
        a0.currentTime = seek * a0.duration;
        if (a0.paused) a0.play().catch(function () {});
      } else if (a0.paused) a0.play().catch(function () {});
      else a0.pause();
      vpPaint();
      return;
    }
    vpStop();
    if (_tts.idx >= 0) stopSpeak();
    // Pleer shu zahoti (bosish paytida) yaratiladi — iPhone ovozni to'smasin
    var a = new Audio();
    try {
      var su = silentUrl();
      if (su) {
        a.src = su;
        var pp = a.play();
        if (pp && pp.catch) pp.catch(function () {});
      }
    } catch (e) {}
    var el = document.querySelector('[data-vm="' + vid + '"]');
    var dur = el ? Number(el.getAttribute("data-dur")) || 0 : 0;
    var me = (_vp = { vid: vid, audio: a, url: null, dur: dur, raf: 0 });
    vGet(vid).then(function (blob) {
      if (_vp !== me) return;
      if (!blob) {
        vpStop();
        if (typeof toast === "function") toast("🎤 Bu ovozli xabar boshqa qurilmada yozilgan — uni faqat o'sha qurilmada eshitish mumkin");
        return;
      }
      me.url = URL.createObjectURL(blob);
      a.onended = function () {
        if (_vp === me) vpStop();
      };
      a.src = me.url;
      var start = function () {
        if (seek != null && a.duration && isFinite(a.duration)) a.currentTime = seek * a.duration;
      };
      a.onloadedmetadata = start;
      a.play().catch(function () {
        if (_vp === me) vpStop();
      });
      vpLoop();
    });
  }

  /* ─── 🔊 Eshitish ─────────────────────────────────────────────────────── */

  var _tts = { idx: -1, chat: null, audio: null, stop: false };

  function plainForSpeech(t) {
    return String(t || "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, "")
      .replace(/\|/g, ", ")
      .replace(/[*_`#>]+/g, "")
      .replace(/^\s*[-•]\s+/gm, "")
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
      .replace(/(\d)\s*%/g, "$1 foiz")
      .replace(/№\s*/g, "raqam ")
      .replace(/\s[–—]\s/g, ", ")
      .replace(/\n{2,}/g, ".\n")
      .replace(/\s+,/g, ",")
      .trim();
  }

  function speechChunks(text, max) {
    var parts = text.match(/[^.!?\n]+[.!?\n]*/g) || [text];
    var out = [];
    var cur = "";
    parts.forEach(function (p) {
      if ((cur + p).length > max && cur) {
        out.push(cur.trim());
        cur = "";
      }
      cur += p;
    });
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  var PLAY_RATE = 1.1;

  /** Birinchi bo'lak: birinchi gap; u uzun bo'lsa — vergul yoki bo'shliqda kesiladi. */
  function firstPiece(text, max) {
    var s1 = (text.match(/^[^.!?\n]+[.!?\n]*/) || [text])[0];
    if (s1.length <= max * 1.6) return s1;
    var cut = -1;
    var re = /[,;:—–]\s/g;
    var mm;
    while ((mm = re.exec(s1)) && mm.index < max * 1.6) if (mm.index >= max * 0.4) cut = mm.index + 1;
    if (cut < 0) cut = s1.lastIndexOf(" ", max);
    return cut > 20 ? s1.slice(0, cut) : s1;
  }

  function stopSpeak() {
    _tts.stop = true;
    if (_tts.audio) {
      try {
        _tts.audio.pause();
      } catch (e) {}
    }
    try {
      window.speechSynthesis && speechSynthesis.cancel();
    } catch (e) {}
    _tts = { idx: -1, chat: null, audio: null, stop: false };
    ttsRender();
  }

  /** Brauzer ovozlari ro'yxati — Chrome/Edge uni kechikib yuklaydi. */
  function loadVoices() {
    return new Promise(function (resolve) {
      var v = speechSynthesis.getVoices();
      if (v && v.length) return resolve(v);
      var t = setTimeout(function () {
        resolve(speechSynthesis.getVoices() || []);
      }, 1500);
      try {
        speechSynthesis.addEventListener(
          "voiceschanged",
          function () {
            clearTimeout(t);
            resolve(speechSynthesis.getVoices() || []);
          },
          { once: true },
        );
      } catch (e) {}
    });
  }
  // Ovozlar ro'yxatini oldindan yuklab qo'yamiz — bosilganda kutilmasin
  try {
    if (window.speechSynthesis) speechSynthesis.getVoices();
  } catch (e) {}

  /**
   * Brauzerning o'z ovozi — server ovozi ishlamasa yoki sozlanmagan bo'lsa.
   * Ovoz tanlash navbati: o'zbekcha (Edge'da tabiiy "Madina"/"Sardor") →
   * turkcha (lotin yozuvidagi o'zbekchani eng yaqin o'qiydi) → qozoq/ozarbayjon
   * → brauzerning standart ovozi. Ya'ni ovoz HAR DOIM chiqadi.
   * Matn gaplarga bo'lib o'qiladi: Chrome uzun matnni ~15 soniyadan keyin
   * jimgina to'xtatib qo'yadi.
   */
  async function browserSpeak(text, my, done) {
    if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") return done(false, "no-speech");
    var voices = await loadVoices();
    if (my.stop) return;
    var natural = /natural|online|neural/i;
    var pick = function (re) {
      var list = voices.filter(function (v) {
        return re.test(v.lang) || re.test(v.name);
      });
      return (
        list.find(function (v) {
          return natural.test(v.name);
        }) || list[0]
      );
    };
    var cyr = (text.match(/[Ѐ-ӿ]/g) || []).length;
    var lat = (text.match(/[A-Za-z]/g) || []).length;
    var ru = cyr > lat;
    var v = ru
      ? pick(/^ru/i)
      : pick(/^uz/i) || pick(/uzbek|madina|sardor/i) || pick(/^tr/i) || pick(/^(kk|az)/i);
    // Mos ovoz yo'q — o'zbekcha matnni ruscha/inglizcha ovoz bilan o'qish
    // tushunarsiz chiqadi (sinovda Windows'dagi ruscha "Irina" shunday o'qidi).
    // Shuning uchun o'qimaymiz va sababini aniq aytamiz.
    if (!v) return done(false, "no-voice");
    var lang = v ? v.lang : ru ? "ru-RU" : "tr-TR";
    var sentences = speechChunks(text.replace(/[‘’ʻʼ`´]/g, "'"), 180);
    if (!sentences.length) return done(true);

    try {
      speechSynthesis.cancel();
    } catch (e) {}
    // Chrome ba'zan o'qishni "pauza"da qotirib qo'yadi — vaqti-vaqti bilan uyg'otamiz
    var keep = setInterval(function () {
      if (my.stop) return clearInterval(keep);
      try {
        if (speechSynthesis.paused) speechSynthesis.resume();
      } catch (e) {}
    }, 4000);
    var idx = 0;
    var finish = function (ok, why) {
      clearInterval(keep);
      if (!my.stop) done(ok, why);
    };
    var nextOne = function () {
      if (my.stop) return clearInterval(keep);
      if (idx >= sentences.length) return finish(true);
      var u = new SpeechSynthesisUtterance(sentences[idx++]);
      if (v) u.voice = v;
      u.lang = lang;
      u.rate = 1.1;
      var settled = false;
      u.onend = function () {
        if (settled) return;
        settled = true;
        nextOne();
      };
      u.onerror = function (ev) {
        if (settled) return;
        settled = true;
        var code = ev && ev.error;
        if (my.stop || code === "interrupted" || code === "canceled") return clearInterval(keep);
        finish(false, code === "not-allowed" ? "blocked" : "no-speech");
      };
      speechSynthesis.speak(u);
    };
    // cancel() dan so'ng darhol speak() ba'zan e'tiborsiz qoladi — biroz kutamiz
    setTimeout(nextOne, 60);
  }

  /** Ovoz chiqmasa — sababini aniq aytamiz. */
  function speakError(err, why) {
    var msg;
    if (why === "blocked") msg = "brauzer ovozni to'sdi — «Eshitish» ni yana bir bor bosing";
    else if (why === "no-voice")
      msg =
        "server ovozi ishlamadi, bu kompyuterda esa o'zbekcha ovoz yo'q" +
        (role() === "admin" ? "" : " — administratorga xabar bering");
    else if (why === "no-speech")
      msg = "bu brauzerda ovoz chiqarish imkoni yo'q — Google Chrome yoki Microsoft Edge'da oching";
    else msg = (err && err.message) || "ovoz xizmati ishlamadi";
    var text = "⚠️ Ovoz chiqmadi: " + msg + ".";
    if (err && role() === "admin" && why !== "blocked")
      text += " Tuzatish: Render → Environment → AZURE_SPEECH_KEY yoki LOVABLE_API_KEY qo'shing.";
    if (typeof toast === "function") toast(text);
    try {
      console.warn("[AI ovoz]", msg, err && err.detail ? "— " + err.detail : "");
    } catch (e2) {}
  }

  /** 0.1 soniyalik haqiqiy jimjitlik (WAV) — pleerni bosish paytida "ochish" uchun. */
  var _silentUrl = null;
  function silentUrl() {
    if (_silentUrl) return _silentUrl;
    var n = 800; // 8 kHz × 0.1 s, 8-bit mono
    var b = new Uint8Array(44 + n);
    var dv = new DataView(b.buffer);
    var ws = function (o, s) {
      for (var i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i);
    };
    ws(0, "RIFF");
    dv.setUint32(4, 36 + n, true);
    ws(8, "WAVE");
    ws(12, "fmt ");
    dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true);
    dv.setUint16(22, 1, true);
    dv.setUint32(24, 8000, true);
    dv.setUint32(28, 8000, true);
    dv.setUint16(32, 1, true);
    dv.setUint16(34, 8, true);
    ws(36, "data");
    dv.setUint32(40, n, true);
    for (var i = 44; i < b.length; i++) b[i] = 128;
    try {
      _silentUrl = URL.createObjectURL(new Blob([b], { type: "audio/wav" }));
    } catch (e) {
      _silentUrl = "";
    }
    return _silentUrl;
  }

  // Server ovozi sozlanmaganini bir marta bilsak — keyingi safar darhol
  // brauzer ovozi bilan o'qiymiz (kutishsiz).
  var _serverTts = true;

  function speakWithBrowser(text, my, err) {
    if (my.stop) return;
    if (err && role() === "admin") {
      renderTtsBar("server ovozi ishlamadi (" + ((err.detail || err.message) + "").slice(0, 200) + ")");
      checkTtsStatus(true);
    }
    my.loading = false;
    ttsRender();
    browserSpeak(text, my, function (ok, why) {
      if (!ok) speakError(err, why);
      if (_tts === my) stopSpeak();
    });
  }

  /** «Eshitish» holati o'zgarganda — ochiq bo'lgan oynalardagi tugmalar yangilanadi. */
  function ttsRender() {
    renderMessages();
    if (_ms.tab === "chats" && document.getElementById("ams-body")) msRender(true);
  }

  function speak(i) {
    var st = loadStore();
    var chat = currentChat(st, false);
    var m = chat && chat.messages[i];
    if (!m) return;
    return speakContent(chat.id, i, m.content);
  }

  /** Istalgan AI javobini sifatli server ovozida o'qiydi (barcha panellar uchun bitta). */
  async function speakContent(chatId, i, content) {
    if (_tts.idx === i && _tts.chat === chatId) return stopSpeak();
    stopSpeak();
    vpStop();
    var plain = plainForSpeech(content);
    if (!plain) return;
    var chat = { id: chatId };

    // ⚠️ Brauzerlar ovozni faqat foydalanuvchi bosgan PAYTDA yoqishga ruxsat
    // beradi (ayniqsa iPhone). Shuning uchun pleer shu zahoti jimjitlik
    // bilan "ochiladi" va keyin har bir bo'lak shu pleerda ijro etiladi.
    var player = new Audio();
    try {
      var su = silentUrl();
      if (su) {
        player.src = su;
        var pp = player.play();
        if (pp && pp.catch) pp.catch(function () {});
      }
    } catch (e) {}
    var my = (_tts = { idx: i, chat: chat.id, audio: player, stop: false, loading: true });
    ttsRender();

    if (!_serverTts) return speakWithBrowser(plain, my, null);

    // Birinchi bo'lak qisqa — ovoz tezroq boshlansin; qolganlari katta
    // (so'rovlar soni kam bo'lsin — ovoz xizmatlarida daqiqalik limit bor)
    // (sifatli ovoz bir gapni ~5–10 soniyada tayyorlaydi; keyingi bo'lak
    // oldingisi o'ynayotganda tayyorlanadi — orada uzilish bo'lmaydi)
    // Birinchi bo'lak juda qisqa (bitta gap yoki uning boshi) — ovoz 2–3
    // soniyada boshlanadi. Keyingi bo'laklar o'ynab turgan paytda oldindan
    // tayyorlanadi (2 tasi birga), shuning uchun orada uzilish bo'lmaydi.
    var first = firstPiece(plain, 90);
    var chunks = [first].concat(speechChunks(plain.slice(first.length).trim(), 260)).filter(function (c) {
      return c && c.trim();
    });
    if (!chunks.length) return stopSpeak();
    var jobs = [];
    var job = function (n) {
      if (n < chunks.length && !jobs[n]) {
        jobs[n] = ttsFetch(chunks[n]);
        jobs[n].catch(function () {}); // "unhandled rejection" bo'lmasin
      }
      return jobs[n];
    };
    job(0);
    job(1);
    for (var k = 0; k < chunks.length; k++) {
      if (my.stop) return;
      var blob;
      try {
        blob = await job(k);
      } catch (e) {
        if (my.stop) return;
        if (e && e.code === "no-tts") _serverTts = false; // server ovozi umuman sozlanmagan
        // Server ovozi ishlamadi — qolgan qismini brauzer ovozi o'qiydi
        return speakWithBrowser(chunks.slice(k).join(" "), my, e);
      }
      job(k + 1);
      job(k + 2); // keyingi ikkitasini oldindan tayyorlash
      if (my.stop) return;
      if (my.loading) {
        my.loading = false;
        ttsRender();
      }
      var played = await new Promise(function (resolve) {
        var url = URL.createObjectURL(blob);
        var done = function (v) {
          player.onended = player.onerror = null;
          URL.revokeObjectURL(url);
          resolve(v);
        };
        player.onended = function () {
          done(true);
        };
        player.onerror = function () {
          done(false);
        };
        player.src = url;
        // Biroz tezroq ijro — ovoz balandligi (tembr) o'zgarmaydi
        try {
          player.preservesPitch = true;
          player.playbackRate = PLAY_RATE;
          player.defaultPlaybackRate = PLAY_RATE;
        } catch (e) {}
        var p = player.play();
        if (p && p.catch)
          p.catch(function (err) {
            if (err && err.name === "AbortError" && my.stop) return; // to'xtatildi
            done(err && err.name === "NotAllowedError" ? "blocked" : false);
          });
      });
      if (my.stop) return;
      if (played !== true) {
        // Pleer bu bo'lakni o'ynay olmadi — qolganini brauzer ovozi o'qiydi
        return speakWithBrowser(chunks.slice(k).join(" "), my, null);
      }
    }
    if (_tts === my) stopSpeak();
  }

  function ttsFetch(text) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl
      ? setTimeout(function () {
          ctrl.abort();
        }, 45000)
      : null;
    return fetch(apiBase() + "/api/ai-tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text }),
      signal: ctrl ? ctrl.signal : undefined,
    })
      .then(function (r) {
        if (!r.ok)
          return r
            .json()
            .catch(function () {
              return {};
            })
            .then(function (d) {
              var er = new Error(
                (d && d.error) || (r.status === 429 ? "juda ko'p so'rov — biroz kuting" : "ovoz xizmati " + r.status),
              );
              er.code = d && d.code;
              er.detail = d && d.detail;
              if (er.detail && role() === "admin") er.message += " (" + er.detail + ")";
              throw er;
            });
        return r.blob().then(function (b) {
          if (!b || b.size < 100) throw new Error("ovoz bo'sh keldi");
          return b;
        });
      })
      .catch(function (e) {
        if (e && e.name === "AbortError") throw new Error("ovoz xizmati javob bermadi");
        throw e;
      })
      .finally(function () {
        if (timer) clearTimeout(timer);
      });
  }

  /* ─── Global funksiyalar (inline onclick) ─────────────────────────────── */

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
    var chat = currentChat(loadStore(), false);
    var last = chat && chat.messages[chat.messages.length - 1];
    if (!_busy && last && last.role === "user") requestReply();
  };
  window.adminAiCopy = function (i) {
    var chat = currentChat(loadStore(), false);
    var m = chat && chat.messages[i];
    if (!m) return;
    try {
      navigator.clipboard.writeText(m.content).then(function () {
        if (typeof toast === "function") toast("📋 Javob nusxalandi");
      });
    } catch (e) {}
  };
  window.adminAiSpeak = speak;
  window.adminAiPick = function (input) {
    addFiles(input.files);
    input.value = "";
  };
  window.adminAiUnpick = function (id) {
    _pending = _pending.filter(function (p) {
      return p.id !== id;
    });
    renderPending();
  };
  window.adminAiMic = function () {
    if (_rec) stopRec("send");
    else {
      _recWant = { lock: true, cancel: false };
      startRec();
    }
  };
  window.adminAiSendMode = updateSendMode;
  window.adminAiVoice = playVoice;
  window.adminAiToggleHist = function (e) {
    if (e) e.stopPropagation();
    _histOpen = !_histOpen;
    renderHist();
  };
  window.adminAiOpen = function (id) {
    if (_busy) return;
    stopSpeak();
    var st = loadStore();
    st.current = id;
    saveStore(st);
    _histOpen = false;
    _lastError = "";
    renderHist();
    renderMessages();
  };
  window.adminAiNew = function () {
    if (_busy) return;
    stopSpeak();
    var st = loadStore();
    st.current = null; // bo'sh suhbat — birinchi xabar yuborilganda yaratiladi
    saveStore(st);
    _lastError = "";
    _histOpen = false;
    renderHist();
    renderMessages();
    var inp = document.getElementById("aai-input");
    if (inp) inp.focus();
  };
  window.adminAiDel = async function (id) {
    if (typeof crmConfirm === "function" && !(await crmConfirm("Bu suhbat o'chirilsinmi?", { okText: "O'chirish" }))) return;
    var st = loadStore();
    st.chats = st.chats.filter(function (c) {
      return c.id !== id;
    });
    if (st.current === id) st.current = null;
    saveStore(st);
    renderHist();
    renderMessages();
  };
  window.renderMentorAI = renderAdminAI;
  window.renderStudentAI = renderAdminAI;

  /* ─── Mentor: talabalarning AI suhbatlari va ogohlantirishlar ────────────── */
  /* Har bir talabaning AI bilan yozishmalari serverda saqlanadi — mentor ularni
     shu yerda (faqat o'qish uchun) ko'radi. Talaba so'kinsa yoki haqoratli so'z
     ishlatsa bu yerga ogohlantirish tushadi; 4-qoidabuzarlikdan keyin talaba
     bloklanadi va mentor uni shu yerdan blokdan chiqaradi. */

  var _ms = { tab: "chats", students: null, sel: null, store: null, chatId: null, alerts: null, loading: false };

  function msStyles() {
    if (document.getElementById("aai-ms-styles")) return;
    var st = document.createElement("style");
    st.id = "aai-ms-styles";
    st.textContent = [
      ".ams{display:flex;flex-direction:column;height:calc(100dvh - 64px - 48px);min-height:460px;background:var(--bg2);border:1px solid var(--border);border-radius:18px;overflow:hidden}",
      ".ams-tabs{display:flex;gap:6px;padding:10px 12px;border-bottom:1px solid var(--border)}",
      ".ams-tab{height:34px;padding:0 14px;border-radius:9px;border:1.5px solid var(--border2);background:var(--bg3);color:var(--text2);font:inherit;font-size:12.5px;font-weight:700;cursor:pointer}",
      ".ams-tab.on{border-color:var(--accent);color:var(--accent);background:var(--accent-light)}",
      ".ams-badge{display:inline-block;min-width:18px;padding:0 5px;margin-left:5px;border-radius:9px;background:#ef4444;color:#fff;font-size:11px;line-height:18px;text-align:center}",
      ".ams-main{flex:1;display:flex;min-height:0}",
      ".ams-list{width:250px;flex-shrink:0;border-right:1px solid var(--border);overflow-y:auto}",
      ".ams-st{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--border);cursor:pointer}",
      ".ams-st:hover{background:var(--bg3)}.ams-st.on{background:var(--accent-light)}",
      ".ams-st b{display:block;font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".ams-st small{display:block;font-size:11px;color:var(--text3)}",
      ".ams-flag{margin-left:auto;font-size:11px;font-weight:800;white-space:nowrap}",
      ".ams-view{flex:1;min-width:0;display:flex;flex-direction:column;background:var(--bg)}",
      ".ams-vhead{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid var(--border);background:var(--bg2)}",
      ".ams-vhead select{max-width:260px}",
      ".ams-body{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px}",
      ".ams-empty{margin:auto;text-align:center;color:var(--text3);font-size:13.5px;padding:30px}",
      ".ams-al{padding:12px 14px;border:1px solid var(--border);border-radius:12px;background:var(--bg2)}",
      ".ams-al.new{border-color:#f97316;box-shadow:0 0 0 3px rgba(249,115,22,.12)}",
      ".ams-al-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:12.5px;color:var(--text3)}",
      ".ams-al-top b{color:var(--text);font-size:13.5px}",
      ".ams-al-txt{margin-top:7px;padding:8px 10px;border-radius:9px;background:rgba(239,68,68,.07);color:#b91c1c;font-size:13px;white-space:pre-wrap;word-break:break-word}",
      "@media (max-width:900px){.ams{height:calc(100dvh - 64px - 24px)}.ams-main{flex-direction:column}.ams-list{width:auto;max-height:200px;border-right:0;border-bottom:1px solid var(--border)}}",
    ].join("");
    document.head.appendChild(st);
  }

  function getJson(url, opts) {
    return fetch(apiBase() + url, opts).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok || !d.ok) throw new Error((d && d.error) || "Server xato " + r.status);
        return d;
      });
    });
  }

  function msLoad() {
    _ms.loading = true;
    return Promise.all([
      getJson("/api/ai/students").then(function (d) {
        _ms.students = d.students || [];
      }),
      getJson("/api/ai/alerts").then(function (d) {
        _ms.alerts = d.alerts || [];
      }),
    ])
      .catch(function (e) {
        _ms.error = e.message;
      })
      .then(function () {
        _ms.loading = false;
        msRender();
      });
  }

  function msSelect(id) {
    msStopSpeak();
    _ms.sel = id;
    _ms.store = null;
    _ms.chatId = null;
    msRender();
    getJson("/api/ai/student-chats?studentId=" + encodeURIComponent(id))
      .then(function (d) {
        if (_ms.sel !== id) return;
        _ms.store = d.store || { chats: [] };
        var chats = (_ms.store.chats || []).slice().sort(function (a, b) {
          return (b.updatedAt || 0) - (a.updatedAt || 0);
        });
        _ms.store.chats = chats;
        _ms.chatId = chats.length ? chats[0].id : null;
        msRender();
      })
      .catch(function (e) {
        _ms.store = { chats: [], error: e.message };
        msRender();
      });
  }

  function msUnblock(id) {
    var go = function () {
      getJson("/api/ai/unblock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: id }),
      })
        .then(function () {
          if (typeof toast === "function") toast("🔓 Talaba blokdan chiqarildi, ogohlantirishlar nolga tushirildi");
          msLoad();
        })
        .catch(function (e) {
          if (typeof toast === "function") toast("⚠️ " + e.message);
        });
    };
    if (typeof crmConfirm === "function")
      crmConfirm("Talaba AI dan yana foydalana olsinmi? Ogohlantirishlar soni nolga tushadi.", { okText: "Blokdan chiqarish" }).then(function (ok) {
        if (ok) go();
      });
    else go();
  }

  function msRender(keepScroll) {
    var wrap = document.getElementById("mentor-students-ai-wrap");
    if (!wrap) return;
    var prevBody = keepScroll ? document.getElementById("ams-body") : null;
    var prevTop = prevBody ? prevBody.scrollTop : null;
    msStyles();
    injectStyles();
    fitSoon();
    var unread = (_ms.alerts || []).filter(function (a) {
      return !a.read;
    }).length;
    var head =
      '<div class="ams-tabs">' +
      '<button class="ams-tab' + (_ms.tab === "chats" ? " on" : "") + '" onclick="aiMsTab(\'chats\')">💬 Talabalar suhbatlari</button>' +
      '<button class="ams-tab' + (_ms.tab === "alerts" ? " on" : "") + '" onclick="aiMsTab(\'alerts\')">⚠️ Ogohlantirishlar' +
      (unread ? '<span class="ams-badge">' + unread + "</span>" : "") + "</button>" +
      '<button class="ams-tab" style="margin-left:auto" onclick="aiMsReload()" title="Yangilash">↻</button></div>';

    if (_ms.students == null) {
      wrap.innerHTML = '<div class="ams">' + head + '<div class="ams-empty">' + (_ms.error ? "⚠️ " + esc(_ms.error) : "Yuklanmoqda…") + "</div></div>";
      return;
    }

    var body;
    if (_ms.tab === "alerts") {
      var al = _ms.alerts || [];
      body =
        '<div class="ams-body">' +
        (al.length
          ? al
              .map(function (a) {
                return (
                  '<div class="ams-al' + (a.read ? "" : " new") + '"><div class="ams-al-top"><b>' + esc(a.studentName) + "</b>" +
                  (a.groupName ? "<span>· " + esc(a.groupName) + "</span>" : "") +
                  "<span>· " + esc(fmtWhen(new Date(a.createdAt).getTime())) + "</span>" +
                  '<span style="margin-left:auto;font-weight:800;color:' + (a.blocked ? "#dc2626" : "#ea580c") + '">' +
                  (a.blocked ? "🚫 BLOKLANDI" : "⚠️ " + a.warnings + "-ogohlantirish") + "</span></div>" +
                  '<div class="ams-al-txt">' + esc(a.text || "") + "</div>" +
                  '<div style="font-size:11.5px;color:var(--text3);margin-top:6px">' +
                  (a.source === "ai" ? "AI haqoratli gap deb aniqladi" : "So'kinish so'zi aniqlandi") + "</div></div>"
                );
              })
              .join("")
          : '<div class="ams-empty">✅ Hozircha ogohlantirish yo\'q. Talaba AI ga so\'kinsa yoki haqoratli so\'z yozsa, shu yerda ko\'rinadi.</div>') +
        "</div>";
      wrap.innerHTML = '<div class="ams">' + head + body + "</div>";
      if (unread)
        getJson("/api/ai/alerts/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
          .then(function () {
            (_ms.alerts || []).forEach(function (a) {
              a.read = true;
            });
            msBadge(0);
          })
          .catch(function () {});
      return;
    }

    var list = _ms.students
      .map(function (s) {
        var flag = s.blocked
          ? '<span class="ams-flag" style="color:#dc2626">🚫</span>'
          : s.warnings
            ? '<span class="ams-flag" style="color:#ea580c">⚠️ ' + s.warnings + "</span>"
            : "";
        return (
          '<div class="ams-st' + (s.id === _ms.sel ? " on" : "") + '" onclick="aiMsSel(' + Number(s.id) + ')">' +
          "<div style=\"min-width:0\"><b>" + esc(s.name) + "</b><small>" + esc(s.groupName) + " · " +
          (s.questions ? s.questions + " ta savol" : "suhbat yo'q") + "</small></div>" + flag + "</div>"
        );
      })
      .join("");

    var view;
    var sel = _ms.students.find(function (s) {
      return s.id === _ms.sel;
    });
    if (!sel) view = '<div class="ams-empty">👈 Talabani tanlang — uning AI bilan yozishmalari shu yerda ko\'rinadi.</div>';
    else {
      var vhead =
        '<div class="ams-vhead"><b style="font-size:14px">' + esc(sel.name) + "</b>" +
        (sel.blocked
          ? '<span style="color:#dc2626;font-weight:800;font-size:12px">🚫 AI bloklangan</span><button class="btn btn-sm" onclick="aiMsUnblock(' + Number(sel.id) + ')">🔓 Blokdan chiqarish</button>'
          : sel.warnings
            ? '<span style="color:#ea580c;font-weight:800;font-size:12px">⚠️ ' + sel.warnings + " ta ogohlantirish</span>" +
              '<button class="btn btn-sm" onclick="aiMsUnblock(' + Number(sel.id) + ')">Ogohlantirishlarni nolga tushirish</button>'
            : "");
      var chats = (_ms.store && _ms.store.chats) || [];
      if (chats.length)
        vhead +=
          '<select class="fsel" style="margin-left:auto" onchange="aiMsChat(this.value)">' +
          chats
            .map(function (c) {
              return '<option value="' + esc(c.id) + '"' + (c.id === _ms.chatId ? " selected" : "") + ">" + esc(chatTitle(c)) + " · " + esc(fmtWhen(c.updatedAt)) + "</option>";
            })
            .join("") +
          "</select>";
      vhead += '<span style="font-size:11px;color:var(--text3)">faqat o\'qish</span></div>';
      var inner;
      if (!_ms.store) inner = '<div class="ams-empty">Yuklanmoqda…</div>';
      else if (_ms.store.error) inner = '<div class="ams-empty">⚠️ ' + esc(_ms.store.error) + "</div>";
      else {
        var chat = chats.find(function (c) {
          return c.id === _ms.chatId;
        });
        inner = !chat
          ? '<div class="ams-empty">💬 Talaba hali AI bilan suhbatlashmagan</div>'
          : (chat.messages || [])
              .map(function (m, i) {
                if (m.role === "user")
                  return '<div class="aai-b me"><div class="aai-bc">' + filesHtml(m.files) + (m.content ? '<div class="aai-txt">' + esc(m.content) + "</div>" : "") + "</div></div>";
                var speaking = _tts.idx === i && _tts.chat === msChatKey();
                var loading = speaking && _tts.loading;
                return bubbleBot(
                  md(m.content),
                  '<button class="aai-act' + (speaking ? " on" : "") + '" onclick="aiMsSpeak(' + i + ')">' +
                    (loading ? '<span class="aai-spin"></span>Tayyorlanmoqda…' : speaking ? ICON.stop + "To'xtatish" : ICON.speak + "Eshitish") + "</button>",
                  m.warn ? "aai-warn" : "",
                );
              })
              .join("");
      }
      view = vhead + '<div class="ams-body" id="ams-body">' + inner + "</div>";
    }
    wrap.innerHTML =
      '<div class="ams">' + head + '<div class="ams-main"><div class="ams-list">' +
      (list || '<div class="ams-empty">Guruhlaringizda talaba yo\'q</div>') +
      '</div><div class="ams-view">' + view + "</div></div></div>";
    var b = document.getElementById("ams-body");
    if (b) b.scrollTop = prevTop != null ? prevTop : b.scrollHeight;
  }

  /** Mentor ko'rayotgan talaba suhbatining kaliti («Eshitish» holati uchun). */
  function msChatKey() {
    return "ms:" + _ms.sel + ":" + _ms.chatId;
  }
  function msStopSpeak() {
    if (String(_tts.chat || "").indexOf("ms:") === 0) stopSpeak();
  }

  function renderMentorStudentsAI() {
    if (!document.getElementById("mentor-students-ai-wrap")) return;
    msRender();
    fitSoon();
    if (!_ms.loading) msLoad();
  }

  window.renderMentorStudentsAI = renderMentorStudentsAI;
  window.aiMsTab = function (t) {
    msStopSpeak();
    _ms.tab = t;
    msRender();
  };
  window.aiMsSel = msSelect;
  window.aiMsChat = function (id) {
    msStopSpeak();
    _ms.chatId = id;
    msRender();
  };
  window.aiMsUnblock = msUnblock;
  window.aiMsSpeak = function (i) {
    var chats = (_ms.store && _ms.store.chats) || [];
    var chat = chats.find(function (c) {
      return c.id === _ms.chatId;
    });
    var m = chat && (chat.messages || [])[i];
    if (m) speakContent(msChatKey(), i, m.content);
  };
  window.aiMsReload = function () {
    msLoad();
    if (_ms.sel != null) msSelect(_ms.sel);
  };

  /* ─── Mentorga yangi ogohlantirish haqida xabar ─────────────────────────── */
  /* Har daqiqada tekshiriladi: yangi ogohlantirish bo'lsa — menyuda qizil
     belgi va ekranda xabar chiqadi. */
  var _lastUnread = -1;

  function msBadge(n) {
    var btn = document.getElementById("nav-mentor-students-ai");
    if (!btn) return;
    var b = btn.querySelector(".ams-nav-badge");
    if (!n) {
      if (b) b.remove();
      return;
    }
    if (!b) {
      b = document.createElement("span");
      b.className = "ams-nav-badge";
      b.style.cssText = "margin-left:auto;min-width:18px;padding:0 5px;border-radius:9px;background:#ef4444;color:#fff;font-size:11px;font-weight:800;line-height:18px;text-align:center";
      btn.appendChild(b);
    }
    b.textContent = n;
  }

  function pollAlerts() {
    if (role() !== "mentor") return;
    fetch(apiBase() + "/api/ai/state")
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        if (!d || !d.ok || typeof d.alertsUnread !== "number") return;
        var n = d.alertsUnread;
        msBadge(n);
        if (n > 0 && n > _lastUnread && typeof toast === "function")
          toast("⚠️ " + n + " ta yangi ogohlantirish: talaba AI ga odobsiz so'z yozdi. «Talabalar AI suhbatlari» bo'limini oching.");
        if (n > _lastUnread && _lastUnread >= 0 && document.getElementById("mentor-students-ai-wrap") && _ms.students) msLoad();
        _lastUnread = n;
      })
      .catch(function () {});
  }
  setTimeout(pollAlerts, 4000);
  setInterval(pollAlerts, 60000);

  // Test va tekshiruv uchun
  window.adminAiContext = buildContext;
  window.adminAiPrepare = prepareFile;
})();
