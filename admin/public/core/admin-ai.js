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
   Suhbatlar tarixi saqlanadi ("Tarix" ro'yxati), xabarga istalgan fayl
   biriktiriladi (rasm, ovoz, PDF, Word, Excel, exe…), ovozli xabar yoziladi
   va javob "Eshitish" tugmasi bilan ovoz chiqarib o'qiladi.

   Backend: POST /api/ai-chat  { mode: "admin", system, messages }
            POST /api/ai-tts   { text } → mp3
   ========================================================================== */
(function () {
  "use strict";

  var MAX_CONTEXT = 180000; // belgi — juda katta markazda ham sig'sin
  var _focusGroup = ""; // "" = barcha guruhlar (hisobotni bitta guruhga toraytirish uchun)
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

  /* ─── Suhbatlar tarixi ─────────────────────────────────────────────────── */
  /* Har bir suhbat alohida saqlanadi va "Tarix" ro'yxatidan qayta ochiladi.
     Kalit `admin_private_` bilan boshlanadi: backend-storage uni serverga
     sinxronlaydi (boshqa qurilmada ham ko'rinadi), server esa uni faqat
     adminga beradi — mentor va talaba o'qiy olmaydi.
     Fayllarning o'zi saqlanmaydi (juda katta) — faqat nomi, turi, kichik
     rasm ko'rinishi va hujjatdan olingan matn. */

  var STORE_KEY = "admin_private_ai_chats_v1";
  var OLD_HISTORY_KEY = "ai_history_admin";
  var MAX_CHATS = 60;
  var MAX_STORE_BYTES = 2 * 1024 * 1024;
  var _memParts = {}; // xabar kaliti → shu sessiyada yuborilgan fayl qismlari

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
    var st = null;
    try {
      st = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    } catch (e) {}
    if (st && Array.isArray(st.chats)) return st;
    st = { chats: [], current: null };
    // Avvalgi (bitta suhbatli) tarix yo'qolmasin — birinchi suhbat bo'lib ko'chadi
    try {
      var old = JSON.parse(localStorage.getItem(OLD_HISTORY_KEY) || "[]");
      if (Array.isArray(old) && old.length) {
        var now = Date.now();
        var c = { id: uid(), createdAt: now, updatedAt: now, messages: old.map(function (m) {
          return { role: m.role === "user" ? "user" : "assistant", content: String(m.content || ""), ts: now };
        }) };
        st.chats.push(c);
        st.current = c.id;
        // Bir marta ko'chiriladi — keyingi ochilishlarda yangi ombordan o'qiladi
        localStorage.setItem(STORE_KEY, JSON.stringify(st));
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
    try {
      localStorage.setItem(STORE_KEY, json);
    } catch (e) {}
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

  var SUGGEST = [
    { ic: "📉", t: "Kim sust o'qiyapti?", q: "Qaysi talabalar sust o'qiyapti va nima uchun? Har biriga nima qilish kerakligini ham ayt." },
    { ic: "🏆", t: "Guruhlardagi eng yaxshilar", q: "Har bir guruhda eng yaxshi talaba kim? Jadval qilib ber." },
    { ic: "🚫", t: "Kim dars qoldiryapti?", q: "Kim ko'p dars qoldiryapti yoki ketma-ket kelmayapti? Kimning ota-onasiga qo'ng'iroq qilish kerak?" },
    { ic: "💸", t: "Qarzdorlar", q: "Qarzdorlar ro'yxatini summasi bilan ber va jami qarzni hisobla." },
    { ic: "📊", t: "Guruhlarni solishtir", q: "Guruhlarni davomat va o'zlashtirish bo'yicha solishtir. Qaysi guruh e'tibor talab qiladi?" },
    { ic: "💰", t: "Moliya holati", q: "Bu oy moliya holati qanday? O'tgan oy bilan solishtir." },
  ];

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
  };

  function injectStyles() {
    if (document.getElementById("aai-styles")) return;
    var st = document.createElement("style");
    st.id = "aai-styles";
    st.textContent = [
      "#panel-admin-ai{padding:0}",
      ".aai{position:relative;display:flex;flex-direction:column;height:calc(100dvh - 64px - 48px);min-height:500px;background:var(--bg2);border:1px solid var(--border);border-radius:18px;overflow:hidden;box-shadow:var(--shadow-sm)}",
      /* sarlavha — mentor AI kabi */
      ".aai-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 18px;border-bottom:1px solid var(--border);background:var(--bg2)}",
      ".aai-who{display:flex;align-items:center;gap:11px;min-width:0}",
      ".aai-ava{width:40px;height:40px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#fff;background:linear-gradient(135deg,var(--accent),var(--teal))}",
      ".aai-name{font-size:15px;font-weight:800;color:var(--text);line-height:1.2}",
      ".aai-on{font-size:11.5px;color:var(--text3);display:flex;align-items:center;gap:5px;margin-top:2px}",
      ".aai-on i{width:7px;height:7px;border-radius:50%;background:#22c55e}",
      ".aai-hbtns{display:flex;gap:8px;flex-shrink:0}",
      ".aai-hbtn{display:flex;align-items:center;gap:6px;height:34px;padding:0 12px;border-radius:9px;border:1.5px solid var(--border2);background:var(--bg3);color:var(--text2);font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;transition:.15s}",
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
      ".aai-body{flex:1;min-height:0;overflow-y:auto;padding:18px 20px;display:flex;flex-direction:column;gap:14px;background:var(--bg)}",
      ".aai-b{display:flex;align-items:flex-start;gap:10px;max-width:82%;animation:aaiIn .2s ease}",
      "@keyframes aaiIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}",
      ".aai-b.me{align-self:flex-end;flex-direction:row-reverse;max-width:75%}",
      ".aai-b .aai-ava{width:32px;height:32px}.aai-b .aai-ava svg{width:16px;height:16px}",
      ".aai-bc{min-width:0}",
      ".aai-txt{padding:10px 14px;border-radius:4px 16px 16px 16px;font-size:13.5px;line-height:1.6;color:var(--text);background:var(--bg2);border:1px solid var(--border);word-break:break-word}",
      ".aai-b.me .aai-txt{background:var(--accent);color:#fff;border-color:transparent;border-radius:16px 16px 4px 16px;white-space:pre-wrap}",
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
      ".aai-chip{display:flex;align-items:center;gap:6px;padding:8px 13px;border-radius:999px;border:1.5px solid var(--border2);background:var(--bg2);color:var(--text2);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;transition:.15s}",
      ".aai-chip:hover{border-color:var(--accent);color:var(--accent);transform:translateY(-1px)}",
      /* pastki qator */
      ".aai-foot{border-top:1px solid var(--border);background:var(--bg2);padding:10px 14px}",
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
      ".aai-input{flex:1;min-width:0;border:1.5px solid var(--border2);border-radius:12px;padding:10px 14px;font:inherit;font-size:13.5px;line-height:1.5;background:var(--bg);color:var(--text);resize:none;outline:none;min-height:42px;max-height:160px;overflow:hidden;transition:border-color .15s}",
      ".aai-input:focus{border-color:var(--accent)}",
      ".aai-send{width:42px;height:42px;border-radius:12px;border:0;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:.15s}",
      ".aai-send:hover{opacity:.9;transform:scale(1.04)}.aai-send:disabled{opacity:.4;cursor:not-allowed;transform:none}",
      ".aai-rec{display:flex;align-items:center;gap:8px;flex:1;min-height:42px;padding:0 14px;border-radius:12px;background:rgba(239,68,68,.08);color:#dc2626;font-size:13px;font-weight:700}",
      ".aai-rec i{width:9px;height:9px;border-radius:50%;background:#ef4444;animation:aaiDot 1s infinite}",
      ".aai-drop{position:absolute;inset:0;z-index:30;display:none;align-items:center;justify-content:center;background:rgba(59,130,246,.10);border:2.5px dashed var(--accent);border-radius:18px;font-size:15px;font-weight:800;color:var(--accent);pointer-events:none}",
      ".aai.drag .aai-drop{display:flex}",
      "@media (max-width:900px){.aai{height:calc(100dvh - 64px - 24px);min-height:400px;border-radius:14px}" +
        ".aai-head{padding:10px 12px}.aai-on-x{display:none}.aai-hbtn span{display:none}.aai-hbtn{padding:0 10px}" +
        ".aai-body{padding:12px}.aai-b{max-width:94%}.aai-b.me{max-width:88%}.aai-b .aai-ava{display:none}" +
        ".aai-chips{padding-left:0}.aai-foot{padding:8px 10px calc(8px + env(safe-area-inset-bottom,0px))}" +
        ".aai-ib,.aai-send{width:40px;height:40px}.aai-hist{top:56px;right:8px}.aai-hi-del{opacity:1}}",
    ].join("");
    document.head.appendChild(st);
  }

  /* ─── Chizish ─────────────────────────────────────────────────────────── */

  function renderAdminAI() {
    var wrap = document.getElementById("admin-ai-wrap");
    if (!wrap || typeof D === "undefined") return;
    // Javob kutilayotganda yoki ovoz yozilayotganda qayta chizmaymiz
    // (live-sync ham shu funksiyani chaqiradi)
    if ((_busy || _rec) && wrap.querySelector("#aai-body")) return;
    var keepInput = (document.getElementById("aai-input") || {}).value || "";
    injectStyles();

    wrap.innerHTML =
      '<div class="aai" id="aai-root">' +
      '<div class="aai-drop">📎 Faylni shu yerga tashlang</div>' +
      '<div class="aai-head">' +
      '<div class="aai-who"><div class="aai-ava">' + ICON.bot + "</div>" +
      '<div><div class="aai-name">AI Yordamchi</div><div class="aai-on"><i></i>Onlayn<span class="aai-on-x"> · markaz ma\'lumotlarini biladi</span></div></div></div>' +
      '<div class="aai-hbtns">' +
      '<button class="aai-hbtn" id="aai-hbtn" onclick="adminAiToggleHist(event)" title="Oldingi suhbatlar">' + ICON.hist + "<span>Tarix</span>" + ICON.chev + "</button>" +
      '<button class="aai-hbtn" onclick="adminAiNew()" title="Yangi suhbat">' + ICON.plus + "<span>Yangi</span></button>" +
      "</div></div>" +
      '<div id="aai-hist-box"></div>' +
      '<div class="aai-body" id="aai-body"></div>' +
      '<div class="aai-foot">' +
      '<div class="aai-pend" id="aai-pend" style="display:none"></div>' +
      '<div class="aai-row" id="aai-row">' +
      '<input type="file" id="aai-file" multiple style="display:none" onchange="adminAiPick(this)">' +
      '<button class="aai-ib" onclick="document.getElementById(\'aai-file\').click()" title="Fayl biriktirish: rasm, ovoz, PDF, Word, Excel, exe va boshqalar">' + ICON.clip + "</button>" +
      '<button class="aai-ib" id="aai-mic" onclick="adminAiMic()" title="Ovozli xabar yozish">' + ICON.mic + "</button>" +
      '<textarea id="aai-input" class="aai-input" rows="1" placeholder="' + (window.innerWidth < 600 ? "Savol yozing…" : "Savol yozing yoki fayl biriktiring…") + '" ' +
      "onkeydown=\"if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();adminAiSend()}\" " +
      "oninput=\"this.style.height='auto';this.style.height=Math.min(this.scrollHeight,160)+'px';this.style.overflowY=this.scrollHeight>160?'auto':'hidden'\"></textarea>" +
      '<button class="aai-send" id="aai-send" onclick="adminAiSend()" title="Yuborish">' + ICON.send + "</button>" +
      "</div></div></div>";

    var inp = document.getElementById("aai-input");
    if (inp && keepInput) inp.value = keepInput;
    bindDrop();
    renderPending();
    renderMessages();
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
  }

  function filesHtml(files) {
    if (!files || !files.length) return "";
    return (
      '<div class="aai-files">' +
      files
        .map(function (f) {
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
    var html = bubbleBot(
      md(
        "Salom! Men markazingiz ma'lumotlarini biladigan AI yordamchiman.\n\n" +
          "- 📊 Talabalar, guruhlar, davomat, baholar, qarzlar va moliya tahlili\n" +
          "- 📎 Rasm, ovozli xabar, PDF, Word, Excel va boshqa fayllarni tahlil qilaman\n" +
          "- 🔊 Javobni ovoz chiqarib o'qib beraman\n" +
          "- 💡 Boshqa har qanday savolga ham yordam beraman\n\n" +
          "Nima yordam kerak?",
      ),
    );
    if (!msgs.length && !_busy)
      html +=
        '<div class="aai-chips">' +
        SUGGEST.map(function (s, i) {
          return '<button class="aai-chip" onclick="adminAiSuggest(' + i + ')"><span>' + s.ic + "</span>" + esc(s.t) + "</button>";
        }).join("") +
        "</div>";

    msgs.forEach(function (m, i) {
      if (m.role === "user")
        html +=
          '<div class="aai-b me"><div class="aai-bc">' + filesHtml(m.files) +
          (m.content ? '<div class="aai-txt">' + esc(m.content) + "</div>" : "") + "</div></div>";
      else {
        var speaking = _tts.idx === i && _tts.chat === (chat && chat.id);
        html += bubbleBot(
          md(m.content),
          '<button class="aai-act' + (speaking ? " on" : "") + '" onclick="adminAiSpeak(' + i + ')">' +
            (speaking ? ICON.stop + "To'xtatish" : ICON.speak + "Eshitish") + "</button>" +
            '<button class="aai-act" onclick="adminAiCopy(' + i + ')">' + ICON.copy + "Nusxalash</button>",
        );
      }
    });

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

    body.innerHTML = html;
    body.scrollTop = msgs.length || _busy ? body.scrollHeight : 0;
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
                '<button class="aai-hi-del" onclick="event.stopPropagation();adminAiDel(\'' + c.id + '\')" title="O\'chirish">' + ICON.trash + "</button></div>"
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
      var res = await fetch(apiBase() + "/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "admin", hasFiles: hasFiles, system: systemPrompt(), messages: messages }),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data.ok) throw new Error(data.error || "Server xato: " + res.status);
      var st2 = loadStore();
      var c2 = st2.chats.find(function (x) {
        return x.id === chat.id;
      });
      if (c2) {
        c2.messages.push({ role: "assistant", content: data.text || "...", ts: Date.now() });
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
    var inp = document.getElementById("aai-input");
    if (inp) inp.focus();
  }

  function adminAiSend() {
    var inp = document.getElementById("aai-input");
    if (!inp || _busy || _rec) return;
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
            return { name: p.name, size: p.size, kind: p.kind, thumb: p.thumb, binary: !!p.part };
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

  function renderRec() {
    var row = document.getElementById("aai-row");
    var mic = document.getElementById("aai-mic");
    var inp = document.getElementById("aai-input");
    if (!row || !mic || !inp) return;
    var old = document.getElementById("aai-recbar");
    if (_rec) {
      mic.classList.add("rec");
      mic.innerHTML = ICON.stop;
      mic.title = "Yozishni tugatish";
      inp.style.display = "none";
      var sec = Math.floor((Date.now() - _rec.t0) / 1000);
      var txt = "<i></i>Yozilmoqda… " + Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0") + " · tugatish uchun ⏹ ni bosing";
      if (old) old.innerHTML = txt;
      else mic.insertAdjacentHTML("afterend", '<div class="aai-rec" id="aai-recbar">' + txt + "</div>");
    } else {
      mic.classList.remove("rec");
      mic.innerHTML = ICON.mic;
      mic.title = "Ovozli xabar yozish";
      inp.style.display = "";
      if (old) old.remove();
    }
  }

  async function startRec() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (typeof toast === "function") toast("⚠️ Bu brauzer ovoz yozishni qo'llab-quvvatlamaydi");
      return;
    }
    try {
      var stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      var Ctx = window.AudioContext || window.webkitAudioContext;
      var ctx = new Ctx();
      var src = ctx.createMediaStreamSource(stream);
      var proc = ctx.createScriptProcessor(4096, 1, 1);
      var chunks = [];
      proc.onaudioprocess = function (e) {
        chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      src.connect(proc);
      proc.connect(ctx.destination);
      _rec = { stream: stream, ctx: ctx, src: src, proc: proc, chunks: chunks, t0: Date.now() };
      _rec.timer = setInterval(function () {
        if (Date.now() - _rec.t0 > MAX_REC_SEC * 1000) stopRec();
        else renderRec();
      }, 500);
      renderRec();
    } catch (e) {
      if (typeof toast === "function") toast("⚠️ Mikrofonga ruxsat berilmadi");
    }
  }

  function stopRec() {
    var r = _rec;
    if (!r) return;
    _rec = null;
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
    var sec = (Date.now() - r.t0) / 1000;
    if (sec < 0.8 || !r.chunks.length) {
      if (typeof toast === "function") toast("⚠️ Ovoz juda qisqa");
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
    var d = new Date();
    var file = new File([blob], "Ovozli xabar " + String(d.getHours()).padStart(2, "0") + "-" + String(d.getMinutes()).padStart(2, "0") + ".wav", { type: "audio/wav" });
    addFiles([file], "voice");
    var inp = document.getElementById("aai-input");
    if (inp) inp.focus();
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

  function ttsFetch(text) {
    return fetch(apiBase() + "/api/ai-tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text }),
    }).then(function (r) {
      if (!r.ok) throw new Error("tts " + r.status);
      return r.blob();
    });
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
    renderMessages();
  }

  /** Brauzer ovozlari ro'yxati — Chrome/Edge uni kechikib yuklaydi. */
  function loadVoices() {
    return new Promise(function (resolve) {
      var v = speechSynthesis.getVoices();
      if (v && v.length) return resolve(v);
      var t = setTimeout(function () {
        resolve(speechSynthesis.getVoices() || []);
      }, 1500);
      speechSynthesis.addEventListener(
        "voiceschanged",
        function () {
          clearTimeout(t);
          resolve(speechSynthesis.getVoices() || []);
        },
        { once: true },
      );
    });
  }

  /**
   * Brauzerning o'z ovozi — server ovozi ishlamasa. Avval o'zbekcha
   * "Natural/Online" ovoz (Microsoft Edge'da "Madina"/"Sardor" bor), so'ng
   * har qanday o'zbekcha ovoz. Ruscha matn — ruscha ovoz bilan.
   */
  async function browserSpeak(text, done) {
    if (!window.speechSynthesis) return done(false);
    var voices = await loadVoices();
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
    var v =
      cyr > lat
        ? pick(/^ru/i)
        : pick(/^uz/i) || pick(/uzbek|madina|sardor/i) || pick(/^tr/i);
    var u = new SpeechSynthesisUtterance(text.replace(/[‘’ʻʼ`´]/g, "'"));
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    } else u.lang = cyr > lat ? "ru-RU" : "uz-UZ";
    if (!v || !/^uz/i.test(v.lang)) {
      if (cyr <= lat && typeof toast === "function")
        toast("ℹ️ Bu brauzerda o'zbekcha ovoz yo'q. Tabiiy o'zbekcha ovoz uchun serverga AZURE_SPEECH_KEY qo'ying yoki Microsoft Edge'da oching.");
    }
    u.rate = 0.95;
    u.onend = function () {
      done(true);
    };
    u.onerror = function () {
      done(false);
    };
    speechSynthesis.speak(u);
  }

  async function speak(i) {
    var st = loadStore();
    var chat = currentChat(st, false);
    var m = chat && chat.messages[i];
    if (!m) return;
    if (_tts.idx === i && _tts.chat === chat.id) return stopSpeak();
    stopSpeak();
    var my = (_tts = { idx: i, chat: chat.id, audio: null, stop: false });
    renderMessages();

    var chunks = speechChunks(plainForSpeech(m.content), 600);
    var next = ttsFetch(chunks[0]);
    for (var k = 0; k < chunks.length; k++) {
      if (my.stop) return;
      var blob;
      try {
        blob = await next;
      } catch (e) {
        // Xizmat ishlamadi — qolgan qismini brauzer ovozi o'qiydi
        if (my.stop) return;
        browserSpeak(chunks.slice(k).join(" "), function () {
          if (_tts === my) stopSpeak();
        });
        return;
      }
      if (k + 1 < chunks.length) next = ttsFetch(chunks[k + 1]); // keyingisini oldindan tayyorlash
      if (my.stop) return;
      await new Promise(function (resolve) {
        var url = URL.createObjectURL(blob);
        var a = new Audio(url);
        my.audio = a;
        a.onended = a.onerror = function () {
          URL.revokeObjectURL(url);
          resolve();
        };
        a.play().catch(resolve);
      });
    }
    if (_tts === my) stopSpeak();
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
    if (_rec) stopRec();
    else startRec();
  };
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
  // Test va tekshiruv uchun
  window.adminAiContext = buildContext;
  window.adminAiPrepare = prepareFile;
})();
