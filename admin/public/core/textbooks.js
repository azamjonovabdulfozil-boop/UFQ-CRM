/**
 * textbooks.js — 📚 Darsliklar va 📘 Dars metodi.
 *
 *  • Admin: «Darsliklar» bo'limi — kurs uchun PDF darslik yuklaydi. Server
 *    (AI) uni darslarga ajratadi: mavzu, maqsad, dars rejasi, metod, vazifa.
 *  • Mentor (va admin): davomat oynasida «📘 Dars metodi» tugmasi — bugun
 *    qaysi dars, nima o'tish kerakligi hammasi chiqadi. Tugma faqat shu
 *    guruh kursi uchun darslik yuklangan bo'lsa ko'rinadi.
 *
 * Uchala portalda bir xil fayl (talaba uchun hech narsa qilmaydi).
 */
(function () {
  "use strict";

  /* ─── Yordamchilar ─────────────────────────────────────────────────────── */

  function api() {
    try {
      if (typeof __API_BASE__ !== "undefined" && __API_BASE__) return __API_BASE__;
    } catch (e) {}
    return window.__API_BASE__ || "";
  }
  function role() {
    try {
      if (typeof isStudentRole === "function" && isStudentRole()) return "student";
      if (typeof isMentorRole === "function" && isMentorRole()) return "mentor";
    } catch (e) {}
    return "admin";
  }
  var esc = function (v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  function say(m) {
    if (typeof toast === "function") toast(m);
  }
  function lessonCount() {
    return typeof LESSON_COUNT === "number" ? LESSON_COUNT : 12;
  }
  function data() {
    return typeof D !== "undefined" && D ? D : { courses: [], groups: [], attendance: {} };
  }
  function fmtSize(b) {
    if (!b) return "—";
    if (b < 1048576) return Math.max(1, Math.round(b / 1024)) + " KB";
    return (b / 1048576).toFixed(1) + " MB";
  }
  var norm = function (s) {
    return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
  };

  function getJson(path, opts) {
    return fetch(api() + path, opts).then(function (r) {
      return r
        .json()
        .catch(function () {
          return {};
        })
        .then(function (d) {
          if (!r.ok || !d.ok) throw new Error((d && d.error) || "Server xatosi (" + r.status + ")");
          return d;
        });
    });
  }
  function sendJson(method, path, body) {
    return getJson(path, { method: method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  }

  /* ─── Ma'lumot ─────────────────────────────────────────────────────────── */

  var _list = null; // darsliklar ro'yxati (meta)
  var _listAt = 0;
  var _books = {}; // id → darslik (darslari bilan)

  function loadList(force) {
    if (!force && _list && Date.now() - _listAt < 60000) return Promise.resolve(_list);
    return getJson("/api/textbooks").then(function (d) {
      _list = d.items || [];
      _listAt = Date.now();
      updateNavCount();
      return _list;
    });
  }
  function loadBook(id, force) {
    if (!force && _books[id] && _books[id].status === "ready" && Date.now() - _books[id]._at < 120000) return Promise.resolve(_books[id]);
    return getJson("/api/textbooks/" + encodeURIComponent(id)).then(function (d) {
      d.item._at = Date.now();
      _books[id] = d.item;
      return d.item;
    });
  }
  /** Kurs uchun darsliklar (eng yangisi birinchi, darslari borlari oldinda). */
  function booksForCourse(course) {
    var c = norm(course);
    return (_list || [])
      .filter(function (b) {
        return norm(b.course) === c && b.lessonsCount > 0;
      })
      .sort(function (a, b) {
        return (b.status === "ready") - (a.status === "ready") || String(b.createdAt).localeCompare(String(a.createdAt));
      });
  }

  /* ─── Guruh hozir qaysi darsda ─────────────────────────────────────────── */

  function lessonDays(group, y, m) {
    var map = { Du: 1, Se: 2, Ch: 3, Pa: 4, Ju: 5, Sh: 6, Ya: 0 };
    var days = (group.days || []).map(function (d) {
      return map[d];
    }).filter(function (d) {
      return d != null;
    });
    var out = [];
    var dim = new Date(y, m + 1, 0).getDate();
    for (var day = 1; day <= dim && out.length < lessonCount(); day++) if (days.indexOf(new Date(y, m, day).getDay()) >= 0) out.push(day);
    return out;
  }

  /** {current, todayMarked, isToday, done} — o'tilgan darslar davomat belgilaridan sanaladi. */
  function groupProgress(gid) {
    var D_ = data();
    var att = D_.attendance || {};
    var pre = "att_" + gid + "_";
    var marks = [];
    Object.keys(att).forEach(function (k) {
      if (k.indexOf(pre) !== 0) return;
      var p = k.slice(pre.length).split("_");
      var y = +p[0], m = +p[1];
      if (isNaN(y) || isNaN(m)) return;
      var a = att[k] || {};
      for (var l = 1; l <= lessonCount(); l++) {
        var any = Object.keys(a).some(function (sk) {
          return a[sk] && a[sk]["l" + l];
        });
        if (any) marks.push(y * 10000 + m * 100 + l);
      }
    });
    marks.sort(function (a, b) {
      return a - b;
    });
    var g = (D_.groups || []).find(function (x) {
      return x.id === gid;
    });
    var now = new Date();
    var col = -1;
    if (g) {
      var days = lessonDays(g, now.getFullYear(), now.getMonth());
      col = days.indexOf(now.getDate()) + 1; // bugungi dars ustuni (0 — bugun dars yo'q)
    }
    var todayKey = col > 0 ? now.getFullYear() * 10000 + now.getMonth() * 100 + col : -1;
    var idx = marks.indexOf(todayKey);
    if (idx >= 0) return { current: idx + 1, isToday: true, done: marks.length };
    return { current: marks.length + 1, isToday: col > 0, done: marks.length };
  }

  /* ─── 📘 Dars metodi oynasi ────────────────────────────────────────────── */

  var _v = null; // {books, book, i, gid, label, edit}

  function styles() {
    if (document.getElementById("tb-styles")) return;
    var st = document.createElement("style");
    st.id = "tb-styles";
    st.textContent = [
      ".tbv-ov{position:fixed;inset:0;z-index:10050;background:rgba(15,23,42,.55);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:16px;animation:tbFade .15s}",
      "@keyframes tbFade{from{opacity:0}}",
      ".tbv{width:min(820px,100%);max-height:calc(100dvh - 32px);display:flex;flex-direction:column;background:var(--bg2);border:1px solid var(--border);border-radius:20px;box-shadow:0 30px 70px rgba(0,0,0,.3);overflow:hidden;animation:tbUp .2s}",
      "@keyframes tbUp{from{transform:translateY(12px);opacity:0}}",
      ".tbv-head{display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid var(--border);background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 10%,var(--bg2)),var(--bg2))}",
      ".tbv-ic{width:42px;height:42px;border-radius:13px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:22px;background:linear-gradient(135deg,var(--accent),var(--teal,#14b8a6));box-shadow:0 8px 18px color-mix(in srgb,var(--accent) 30%,transparent)}",
      ".tbv-t{font-size:16px;font-weight:800;color:var(--text);line-height:1.25}",
      ".tbv-s{font-size:12px;color:var(--text3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".tbv-x{margin-left:auto;width:36px;height:36px;border-radius:10px;border:1px solid var(--border2);background:var(--bg3);color:var(--text2);font-size:18px;cursor:pointer;flex-shrink:0}",
      ".tbv-nav{display:flex;align-items:center;gap:8px;padding:10px 18px;border-bottom:1px solid var(--border);flex-wrap:wrap}",
      ".tbv-nb{height:34px;min-width:34px;padding:0 10px;border-radius:10px;border:1px solid var(--border2);background:var(--bg3);color:var(--text);font:inherit;font-weight:800;cursor:pointer}",
      ".tbv-nb:disabled{opacity:.35;cursor:default}",
      ".tbv-sel{height:34px;flex:1;min-width:160px;border-radius:10px;border:1px solid var(--border2);background:var(--bg);color:var(--text);font:inherit;font-size:13px;padding:0 10px}",
      ".tbv-badge{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:999px;font-size:11.5px;font-weight:800;background:var(--teal-light,#ccfbf1);color:var(--teal-text,#0f766e)}",
      ".tbv-body{overflow-y:auto;padding:18px 20px 22px;display:flex;flex-direction:column;gap:14px}",
      ".tbv-topic{font-size:21px;font-weight:800;color:var(--text);letter-spacing:-.01em;line-height:1.3}",
      ".tbv-meta{display:flex;gap:8px;flex-wrap:wrap;font-size:12px;color:var(--text3)}",
      ".tbv-sec{border:1px solid var(--border);border-radius:14px;background:var(--bg);padding:12px 14px}",
      ".tbv-sec h4{margin:0 0 8px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--text3);font-weight:800}",
      ".tbv-sec ul{margin:0;padding-left:18px}.tbv-sec li{margin:3px 0;font-size:13.5px;line-height:1.55;color:var(--text)}",
      ".tbv-txt{font-size:13.5px;line-height:1.65;color:var(--text);white-space:pre-wrap}",
      ".tbv-plan{display:flex;flex-direction:column;gap:6px}",
      ".tbv-step{display:flex;gap:10px;align-items:flex-start;font-size:13.5px;line-height:1.5;color:var(--text)}",
      ".tbv-min{flex-shrink:0;min-width:52px;text-align:center;padding:2px 6px;border-radius:8px;background:var(--accent-light);color:var(--accent-text,var(--accent));font-size:11.5px;font-weight:800}",
      ".tbv-foot{display:flex;gap:8px;flex-wrap:wrap;padding:12px 18px;border-top:1px solid var(--border);background:var(--bg2)}",
      ".tbv-foot .btn{font-size:12.5px}",
      ".tbv-all{display:flex;flex-direction:column;gap:4px}",
      ".tbv-li{display:flex;gap:10px;align-items:center;padding:8px 10px;border-radius:10px;cursor:pointer;font-size:13px;color:var(--text)}",
      ".tbv-li:hover{background:var(--bg3)}.tbv-li.on{background:var(--accent-light)}",
      ".tbv-li b{min-width:30px;color:var(--text3)}.tbv-li.done b{color:var(--teal-text,#0f766e)}",
      ".tbv-empty{padding:30px 10px;text-align:center;color:var(--text3);font-size:13.5px;line-height:1.6}",
      ".tbv-in,.tbv-ta{width:100%;border:1px solid var(--border2);border-radius:10px;background:var(--bg);color:var(--text);font:inherit;font-size:13px;padding:8px 10px}",
      ".tbv-ta{min-height:70px;resize:vertical}",
      ".tbv-lbl{font-size:11.5px;font-weight:800;color:var(--text3);margin:8px 0 4px;text-transform:uppercase;letter-spacing:.05em}",
      /* davomatdagi tugma */
      ".att-method-btn{display:inline-flex;align-items:center;gap:6px;margin-top:6px;padding:6px 12px;border-radius:10px;border:1px solid color-mix(in srgb,var(--accent) 35%,transparent);background:var(--accent-light);color:var(--accent-text,var(--accent));font:inherit;font-size:12.5px;font-weight:800;cursor:pointer;max-width:100%}",
      ".att-method-btn span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".att-method-btn:hover{filter:brightness(1.05);transform:translateY(-1px)}",
      ".att-method-btn.none{background:var(--bg3);color:var(--text3);border-color:var(--border2)}",
      /* admin bo'limi */
      ".tb-page{display:flex;flex-direction:column;gap:16px}",
      ".tb-card{background:var(--bg2);border:1px solid var(--border);border-radius:18px;padding:18px}",
      ".tb-hero{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}",
      ".tb-hero h3{margin:0;font-size:17px;font-weight:800;color:var(--text)}",
      ".tb-hero p{margin:4px 0 0;font-size:13px;color:var(--text3);line-height:1.55;max-width:640px}",
      ".tb-form{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}",
      ".tb-form .fsel,.tb-form input[type=text]{width:100%;height:42px;border-radius:12px;border:1px solid var(--border2);background:var(--bg);color:var(--text);font:inherit;font-size:13.5px;padding:0 12px}",
      ".tb-drop{grid-column:1/-1;display:flex;align-items:center;gap:12px;padding:16px;border:2px dashed var(--border2);border-radius:14px;background:var(--bg);cursor:pointer;transition:.15s}",
      ".tb-drop:hover,.tb-drop.drag{border-color:var(--accent);background:var(--accent-light)}",
      ".tb-drop b{display:block;font-size:13.5px;color:var(--text)}.tb-drop small{color:var(--text3);font-size:12px}",
      ".tb-go{grid-column:1/-1;height:44px;border-radius:12px;border:0;background:linear-gradient(135deg,var(--accent),color-mix(in srgb,var(--accent) 70%,#6366f1));color:#fff;font:inherit;font-size:14px;font-weight:800;cursor:pointer;box-shadow:0 8px 18px color-mix(in srgb,var(--accent) 30%,transparent)}",
      ".tb-go:disabled{opacity:.5;cursor:not-allowed}",
      ".tb-courses{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}",
      ".tb-cc{font-size:11.5px;font-weight:700;padding:4px 10px;border-radius:999px;background:var(--bg3);color:var(--text3);border:1px solid var(--border)}",
      ".tb-cc.ok{background:var(--teal-light,#ccfbf1);color:var(--teal-text,#0f766e);border-color:transparent}",
      ".tb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}",
      ".tb-item{display:flex;flex-direction:column;gap:10px;background:var(--bg2);border:1px solid var(--border);border-radius:16px;padding:14px}",
      ".tb-item-top{display:flex;gap:12px;align-items:flex-start}",
      ".tb-pdf{width:44px;height:52px;border-radius:10px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;color:#fff;background:linear-gradient(160deg,#ef4444,#b91c1c);box-shadow:0 6px 14px rgba(239,68,68,.3)}",
      ".tb-name{font-size:14px;font-weight:800;color:var(--text);line-height:1.3;word-break:break-word}",
      ".tb-sub{font-size:12px;color:var(--text3);margin-top:3px}",
      ".tb-st{font-size:12px;font-weight:700;padding:7px 10px;border-radius:10px;line-height:1.45}",
      ".tb-st.ready{background:var(--teal-light,#ccfbf1);color:var(--teal-text,#0f766e)}",
      ".tb-st.processing{background:var(--accent-light);color:var(--accent-text,var(--accent))}",
      ".tb-st.error{background:var(--orange-light,#fff7ed);color:var(--orange-text,#c2410c)}",
      ".tb-bar{height:5px;border-radius:5px;background:var(--bg4,var(--border));overflow:hidden;margin-top:6px}.tb-bar i{display:block;height:100%;background:var(--accent);transition:width .4s}",
      ".tb-acts{display:flex;gap:6px;flex-wrap:wrap}",
      ".tb-acts .btn{font-size:12px;padding:6px 10px}",
      "@media (max-width:700px){.tb-form{grid-template-columns:1fr}.tbv-ov{padding:0;align-items:stretch}.tbv{border-radius:0;max-height:none;height:100dvh}.tbv-topic{font-size:18px}}",
    ].join("");
    document.head.appendChild(st);
  }

  function closeViewer() {
    var ov = document.getElementById("tbv-ov");
    if (ov) ov.remove();
    _v = null;
    document.removeEventListener("keydown", viewerKeys);
  }
  function viewerKeys(e) {
    if (!_v || _v.edit) return;
    if (e.key === "Escape") closeViewer();
    else if (e.key === "ArrowLeft") window.tbvGo(-1);
    else if (e.key === "ArrowRight") window.tbvGo(1);
  }

  /**
   * @param {{course:string, gid?:number, bookId?:string, lesson?:number, groupName?:string}} o
   */
  function openViewer(o) {
    styles();
    closeViewer();
    _v = { course: o.course, gid: o.gid, books: [], book: null, i: 0, start: o.lesson || 1, prog: o.gid != null ? groupProgress(o.gid) : null, label: o.groupName || "", showAll: false, edit: false, loading: true };
    if (_v.prog && !o.lesson) _v.start = _v.prog.current;
    var ov = document.createElement("div");
    ov.className = "tbv-ov";
    ov.id = "tbv-ov";
    ov.onclick = function (e) {
      if (e.target === ov && !(_v && _v.edit)) closeViewer();
    };
    ov.innerHTML = '<div class="tbv" id="tbv"></div>';
    document.body.appendChild(ov);
    document.addEventListener("keydown", viewerKeys);
    renderViewer();
    loadList(true)
      .then(function () {
        if (!_v) return;
        _v.books = o.bookId
          ? (_list || []).filter(function (b) {
              return b.id === o.bookId;
            })
          : booksForCourse(o.course);
        if (!_v.books.length) {
          _v.loading = false;
          return renderViewer();
        }
        return pickBook(_v.books[0].id);
      })
      .catch(function (e) {
        if (!_v) return;
        _v.loading = false;
        _v.error = e.message;
        renderViewer();
      });
  }

  function pickBook(id) {
    if (!_v) return;
    _v.loading = true;
    renderViewer();
    return loadBook(id, true)
      .then(function (b) {
        if (!_v) return;
        _v.book = b;
        _v.loading = false;
        _v.i = Math.max(0, Math.min((b.lessons || []).length - 1, (_v.start || 1) - 1));
        renderViewer();
      })
      .catch(function (e) {
        if (!_v) return;
        _v.loading = false;
        _v.error = e.message;
        renderViewer();
      });
  }

  function renderViewer() {
    var box = document.getElementById("tbv");
    if (!box || !_v) return;
    var b = _v.book;
    var lessons = (b && b.lessons) || [];
    var L = lessons[_v.i];
    var head =
      '<div class="tbv-head"><div class="tbv-ic">📘</div><div style="min-width:0"><div class="tbv-t">Dars metodi</div>' +
      '<div class="tbv-s">' + esc(_v.course || (b && b.course) || "") + (_v.label ? " · " + esc(_v.label) : "") + (b ? " · " + esc(b.title) : "") + "</div></div>" +
      '<button class="tbv-x" onclick="tbvClose()" title="Yopish">×</button></div>';

    if (_v.loading) {
      box.innerHTML = head + '<div class="tbv-body"><div class="tbv-empty">⏳ Yuklanmoqda…</div></div>';
      return;
    }
    if (_v.error) {
      box.innerHTML = head + '<div class="tbv-body"><div class="tbv-empty">⚠️ ' + esc(_v.error) + "</div></div>";
      return;
    }
    if (!b || !lessons.length) {
      box.innerHTML =
        head +
        '<div class="tbv-body"><div class="tbv-empty">📚 «' + esc(_v.course) + "» kursi uchun hali darslik yuklanmagan.<br>" +
        (role() === "admin"
          ? 'Uni <b>Darsliklar</b> bo\'limidan PDF ko\'rinishida yuklang — darslar avtomatik tuziladi.<br><br><button class="btn btn-primary btn-sm" onclick="tbvClose();typeof closeStatModal===\'function\'&&closeStatModal();go(\'textbooks\',document.getElementById(\'nav-textbooks\'))">📚 Darsliklarga o\'tish</button>'
          : "Darslik administrator tomonidan yuklanadi.") +
        "</div></div>";
      return;
    }

    var n = _v.i + 1;
    var prog = _v.prog;
    var badge = "";
    if (prog && n === prog.current) badge = '<span class="tbv-badge">' + (prog.isToday ? "📍 Bugungi dars" : "➡️ Keyingi dars") + "</span>";
    else if (prog && n < prog.current) badge = '<span class="tbv-badge" style="background:var(--bg3);color:var(--text3)">✔ O\'tilgan</span>';

    var nav =
      '<div class="tbv-nav">' +
      '<button class="tbv-nb" onclick="tbvGo(-1)" ' + (_v.i <= 0 ? "disabled" : "") + ' title="Oldingi dars">‹</button>' +
      '<select class="tbv-sel" onchange="tbvJump(this.value)">' +
      lessons
        .map(function (l, i) {
          return '<option value="' + i + '"' + (i === _v.i ? " selected" : "") + ">" + (i + 1) + "-dars · " + esc(l.topic) + "</option>";
        })
        .join("") +
      "</select>" +
      '<button class="tbv-nb" onclick="tbvGo(1)" ' + (_v.i >= lessons.length - 1 ? "disabled" : "") + ' title="Keyingi dars">›</button>' +
      (prog ? '<button class="tbv-nb" onclick="tbvJump(' + (Math.min(prog.current, lessons.length) - 1) + ')" title="Guruh hozir shu darsda">📍 Bugun</button>' : "") +
      (_v.books.length > 1
        ? '<select class="tbv-sel" style="flex:0 1 200px" onchange="tbvBook(this.value)">' +
          _v.books
            .map(function (x) {
              return '<option value="' + esc(x.id) + '"' + (x.id === b.id ? " selected" : "") + ">📕 " + esc(x.title) + "</option>";
            })
            .join("") +
          "</select>"
        : "") +
      "</div>";

    var body;
    if (_v.edit) body = editForm(L);
    else if (_v.showAll)
      body =
        '<div class="tbv-all">' +
        lessons
          .map(function (l, i) {
            var cls = (i === _v.i ? " on" : "") + (prog && i + 1 < prog.current ? " done" : "");
            return '<div class="tbv-li' + cls + '" onclick="tbvJump(' + i + ')"><b>' + (i + 1) + "</b><span>" + esc(l.topic) + "</span>" +
              (prog && i + 1 === prog.current ? '<span class="tbv-badge" style="margin-left:auto">📍</span>' : "") + "</div>";
          })
          .join("") +
        "</div>";
    else body = lessonHtml(L, n, lessons.length, badge, b);

    var pdfBtn = '<button class="btn btn-sm" onclick="tbvPdf()">📄 Darslikni ochish' + (L && L.pages ? " (" + esc(String(L.pages).split(/[-–,]/)[0]) + "-bet)" : "") + "</button>";
    var foot = _v.edit
      ? '<div class="tbv-foot"><button class="btn btn-primary btn-sm" onclick="tbvSave()">💾 Saqlash</button><button class="btn btn-sm" onclick="tbvEdit(false)">Bekor qilish</button></div>'
      : '<div class="tbv-foot">' + pdfBtn +
        '<button class="btn btn-sm" onclick="tbvAll()">' + (_v.showAll ? "📘 Darsga qaytish" : "📋 Barcha darslar (" + lessons.length + ")") + "</button>" +
        (role() === "admin" && !_v.showAll ? '<button class="btn btn-sm" onclick="tbvEdit(true)">✏️ Tahrirlash</button>' : "") +
        (b.status === "processing" ? '<span class="tbv-s" style="align-self:center">⏳ AI qolgan darslarni tayyorlamoqda…</span>' : "") +
        "</div>";
    box.innerHTML = head + nav + '<div class="tbv-body" id="tbv-body">' + body + "</div>" + foot;
  }

  function lessonHtml(L, n, total, badge, b) {
    if (!L) return '<div class="tbv-empty">Dars topilmadi</div>';
    var h = '<div><div class="tbv-meta"><span><b>' + n + "-dars</b> / " + total + "</span>" + (L.pages ? "<span>📖 " + esc(L.pages) + "-betlar</span>" : "") + badge + "</div>" +
      '<div class="tbv-topic" style="margin-top:6px">' + esc(L.topic) + "</div></div>";
    if (!L.detailed && !(L.goals || []).length && !(L.plan || []).length && !L.method)
      h += '<div class="tbv-sec"><div class="tbv-txt">' + (b && b.status === "processing" ? "⏳ Bu dars uchun batafsil reja hali tayyorlanmoqda — biroz kuting." : "Bu dars uchun batafsil reja yo'q.") + "</div></div>";
    if ((L.goals || []).length)
      h += '<div class="tbv-sec"><h4>🎯 Dars maqsadi</h4><ul>' + L.goals.map(function (g) {
        return "<li>" + esc(g) + "</li>";
      }).join("") + "</ul></div>";
    if ((L.plan || []).length) {
      var total2 = L.plan.reduce(function (s, p) {
        return s + (p.min || 0);
      }, 0);
      h += '<div class="tbv-sec"><h4>🗂 Dars rejasi' + (total2 ? " · " + total2 + " daqiqa" : "") + '</h4><div class="tbv-plan">' +
        L.plan.map(function (p) {
          return '<div class="tbv-step"><span class="tbv-min">' + (p.min ? p.min + " daq" : "•") + "</span><span>" + esc(p.step) + "</span></div>";
        }).join("") + "</div></div>";
    }
    if (L.method) h += '<div class="tbv-sec"><h4>👩‍🏫 Qanday o\'tish kerak (metod)</h4><div class="tbv-txt">' + esc(L.method) + "</div></div>";
    if (L.materials) h += '<div class="tbv-sec"><h4>🧰 Kerakli materiallar</h4><div class="tbv-txt">' + esc(L.materials) + "</div></div>";
    if (L.homework) h += '<div class="tbv-sec"><h4>🏠 Uyga vazifa</h4><div class="tbv-txt">' + esc(L.homework) + "</div></div>";
    if (L.notes) h += '<div class="tbv-sec"><h4>💡 Mentorga maslahat</h4><div class="tbv-txt">' + esc(L.notes) + "</div></div>";
    return h;
  }

  function editForm(L) {
    L = L || {};
    var ta = function (id, label, v, rows) {
      return '<div class="tbv-lbl">' + label + '</div><textarea class="tbv-ta" id="tbe-' + id + '" rows="' + (rows || 3) + '">' + esc(v || "") + "</textarea>";
    };
    return (
      '<div class="tbv-lbl">Mavzu</div><input class="tbv-in" id="tbe-topic" value="' + esc(L.topic || "") + '">' +
      '<div class="tbv-lbl">Darslik betlari</div><input class="tbv-in" id="tbe-pages" value="' + esc(L.pages || "") + '" placeholder="masalan: 12-15">' +
      ta("goals", "Maqsadlar (har biri yangi qatorda)", (L.goals || []).join("\n")) +
      ta("plan", "Dars rejasi (har qator: daqiqa | bosqich)", (L.plan || []).map(function (p) {
        return (p.min || "") + " | " + p.step;
      }).join("\n"), 5) +
      ta("method", "Metod — qanday o'tish kerak", L.method, 5) +
      ta("materials", "Materiallar", L.materials, 2) +
      ta("homework", "Uyga vazifa", L.homework, 2) +
      ta("notes", "Mentorga maslahat", L.notes, 2)
    );
  }

  window.tbvClose = closeViewer;
  window.tbvGo = function (d) {
    if (!_v || !_v.book) return;
    var max = (_v.book.lessons || []).length - 1;
    _v.i = Math.max(0, Math.min(max, _v.i + d));
    _v.showAll = false;
    renderViewer();
    var bd = document.getElementById("tbv-body");
    if (bd) bd.scrollTop = 0;
  };
  window.tbvJump = function (i) {
    if (!_v) return;
    _v.i = Math.max(0, +i || 0);
    _v.showAll = false;
    renderViewer();
  };
  window.tbvAll = function () {
    if (!_v) return;
    _v.showAll = !_v.showAll;
    renderViewer();
  };
  window.tbvBook = function (id) {
    pickBook(id);
  };
  window.tbvEdit = function (on) {
    if (!_v) return;
    _v.edit = !!on;
    renderViewer();
  };
  window.tbvSave = function () {
    if (!_v || !_v.book) return;
    var g = function (id) {
      var el = document.getElementById("tbe-" + id);
      return el ? el.value : "";
    };
    var lessons = (_v.book.lessons || []).slice();
    lessons[_v.i] = {
      topic: g("topic").trim(),
      pages: g("pages").trim(),
      goals: g("goals").split("\n").map(function (s) {
        return s.trim();
      }).filter(Boolean),
      plan: g("plan").split("\n").map(function (s) {
        var m = /^\s*(\d+)?\s*\|\s*(.*)$/.exec(s);
        return m ? { min: +m[1] || 0, step: m[2].trim() } : { min: 0, step: s.trim() };
      }).filter(function (p) {
        return p.step;
      }),
      method: g("method"),
      materials: g("materials"),
      homework: g("homework"),
      notes: g("notes"),
    };
    sendJson("PUT", "/api/textbooks/" + encodeURIComponent(_v.book.id), { lessons: lessons })
      .then(function () {
        say("✅ Dars saqlandi");
        _v.edit = false;
        return pickBook(_v.book.id);
      })
      .catch(function (e) {
        say("⚠️ " + e.message);
      });
  };
  /** PDF ni yangi oynada (kerakli betda) ochadi. */
  window.tbvPdf = function (id, page) {
    var bookId = id || (_v && _v.book && _v.book.id);
    if (!bookId) return;
    if (page == null && _v && _v.book) {
      var L = (_v.book.lessons || [])[_v.i];
      page = L && L.pages ? parseInt(String(L.pages), 10) : null;
    }
    var w = window.open("", "_blank"); // bosish paytida — brauzer to'smasin
    if (w) w.document.write('<p style="font:16px sans-serif;padding:20px">⏳ Darslik ochilmoqda…</p>');
    fetch(api() + "/api/textbooks/" + encodeURIComponent(bookId) + "/pdf")
      .then(function (r) {
        if (!r.ok) throw new Error("PDF ochilmadi (" + r.status + ")");
        return r.blob();
      })
      .then(function (blob) {
        var url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" })) + (page ? "#page=" + page : "");
        if (w) w.location.href = url;
        else window.open(url, "_blank");
      })
      .catch(function (e) {
        if (w) w.close();
        say("⚠️ " + e.message);
      });
  };
  window.openLessonMethod = openViewer;

  /* ─── Davomat oynasiga tugma ───────────────────────────────────────────── */

  function attachMethodButton(gid) {
    if (role() === "student") return;
    var info = document.getElementById("att-group-info");
    if (!info) return;
    var old = document.getElementById("att-method-btn");
    if (old) old.remove();
    var g = (data().groups || []).find(function (x) {
      return x.id === gid;
    });
    if (!g) return;
    styles();
    var btn = document.createElement("button");
    btn.id = "att-method-btn";
    btn.className = "att-method-btn";
    btn.style.display = "none";
    btn.onclick = function () {
      openViewer({ course: g.course, gid: gid, groupName: g.name });
    };
    info.insertAdjacentElement("afterend", btn);
    loadList(false)
      .then(function () {
        if (!document.body.contains(btn)) return;
        var books = booksForCourse(g.course);
        if (!books.length) {
          // Darslik yuklanmagan: mentorga ko'rsatmaymiz, adminga — eslatma
          if (role() === "admin") {
            btn.classList.add("none");
            btn.innerHTML = "<span>📘 Bu kurs uchun darslik yo'q — yuklash</span>";
            btn.style.display = "";
          }
          return;
        }
        var p = groupProgress(gid);
        btn.innerHTML = "<span>📘 Dars metodi · " + (p.isToday ? "bugun " : "keyingi: ") + p.current + "-dars</span>";
        btn.style.display = "";
        // mavzu nomini ham qo'shamiz
        return loadBook(books[0].id).then(function (bk) {
          var L = (bk.lessons || [])[p.current - 1];
          if (L && document.body.contains(btn))
            btn.innerHTML = "<span>📘 Dars metodi · " + (p.isToday ? "bugun " : "keyingi: ") + p.current + "-dars — " + esc(L.topic) + "</span>";
        });
      })
      .catch(function () {});
  }

  function hookAttendance() {
    var orig = window.showGroupStudents;
    if (typeof orig !== "function" || orig._tb) return false;
    var wrapped = function (gid) {
      var r = orig.apply(this, arguments);
      try {
        attachMethodButton(gid);
      } catch (e) {}
      return r;
    };
    wrapped._tb = true;
    window.showGroupStudents = wrapped;
    return true;
  }
  if (!hookAttendance()) setTimeout(hookAttendance, 1500);

  /* ─── 📚 Admin: «Darsliklar» bo'limi ───────────────────────────────────── */

  var _upl = { file: null, busy: false };
  var _poll = null;

  function updateNavCount() {
    var nc = document.getElementById("nc-textbooks");
    if (nc && _list) nc.textContent = _list.length;
  }

  function renderTextbooks() {
    var wrap = document.getElementById("textbooks-wrap");
    if (!wrap || role() !== "admin") return;
    styles();
    if (!wrap.querySelector(".tb-page")) {
      wrap.innerHTML = '<div class="tb-page"><div class="tb-card" id="tb-upload"></div><div id="tb-list"><div class="tbv-empty">⏳ Yuklanmoqda…</div></div></div>';
      renderUpload();
    }
    loadList(true)
      .then(function () {
        renderList();
        renderUpload();
      })
      .catch(function (e) {
        var l = document.getElementById("tb-list");
        if (l) l.innerHTML = '<div class="tbv-empty">⚠️ ' + esc(e.message) + "</div>";
      });
  }

  function courseNames() {
    var seen = {};
    var out = [];
    (data().courses || []).forEach(function (c) {
      var n = String((c && (c.name || c.title)) || "").trim();
      if (n && !seen[norm(n)]) {
        seen[norm(n)] = 1;
        out.push(n);
      }
    });
    (data().groups || []).forEach(function (g) {
      var n = String(g.course || "").trim();
      if (n && !seen[norm(n)]) {
        seen[norm(n)] = 1;
        out.push(n);
      }
    });
    return out;
  }

  function renderUpload() {
    var box = document.getElementById("tb-upload");
    if (!box) return;
    var keepCourse = (document.getElementById("tb-course") || {}).value || "";
    var keepTitle = (document.getElementById("tb-title") || {}).value || "";
    var names = courseNames();
    var have = {};
    (_list || []).forEach(function (b) {
      have[norm(b.course)] = 1;
    });
    var f = _upl.file;
    box.innerHTML =
      '<div class="tb-hero"><div class="tbv-ic" style="width:52px;height:52px;font-size:26px">📚</div><div style="flex:1;min-width:240px">' +
      "<h3>Darsliklar</h3><p>Kurs uchun darslikni PDF ko'rinishida yuklang. AI uni darslarga ajratadi: har bir dars uchun mavzu, maqsad, dars rejasi, " +
      "qanday o'tish kerakligi va uyga vazifa. Mentor davomat qilayotganda <b>📘 Dars metodi</b> tugmasini bosib bugungi darsni ko'radi.</p></div></div>" +
      '<div class="tb-form">' +
      '<select class="fsel" id="tb-course"><option value="">— Kursni tanlang —</option>' +
      names.map(function (n) {
        return '<option value="' + esc(n) + '"' + (n === keepCourse ? " selected" : "") + ">" + esc(n) + (have[norm(n)] ? " ✓" : "") + "</option>";
      }).join("") +
      "</select>" +
      '<input type="text" id="tb-title" placeholder="Nomi (ixtiyoriy) — masalan: Matematika 5-sinf" value="' + esc(keepTitle) + '">' +
      '<label class="tb-drop" id="tb-drop"><input type="file" id="tb-file" accept="application/pdf,.pdf" style="display:none" onchange="tbPick(this.files[0])">' +
      '<div class="tb-pdf">PDF</div><div><b>' + (f ? esc(f.name) : "PDF faylni tanlang yoki shu yerga tashlang") + "</b><small>" +
      (f ? fmtSize(f.size) : "15 MB gacha · darslik, qo'llanma, metodik kitob") + "</small></div></label>" +
      '<button class="tb-go" id="tb-go" onclick="tbUpload()" ' + (_upl.busy ? "disabled" : "") + ">" + (_upl.busy ? "⏳ Yuklanmoqda…" : "⬆️ Yuklash va darslarga ajratish") + "</button>" +
      "</div>" +
      (names.length
        ? '<div class="tb-courses">' + names.map(function (n) {
            return '<span class="tb-cc' + (have[norm(n)] ? " ok" : "") + '">' + (have[norm(n)] ? "✅ " : "○ ") + esc(n) + "</span>";
          }).join("") + "</div>"
        : '<div class="tb-sub" style="margin-top:10px">Avval «Kurslar» bo\'limida kurs qo\'shing.</div>');
    var drop = document.getElementById("tb-drop");
    if (drop) {
      drop.addEventListener("dragover", function (e) {
        e.preventDefault();
        drop.classList.add("drag");
      });
      drop.addEventListener("dragleave", function () {
        drop.classList.remove("drag");
      });
      drop.addEventListener("drop", function (e) {
        e.preventDefault();
        drop.classList.remove("drag");
        if (e.dataTransfer && e.dataTransfer.files[0]) window.tbPick(e.dataTransfer.files[0]);
      });
    }
  }

  function renderList() {
    var box = document.getElementById("tb-list");
    if (!box) return;
    var items = _list || [];
    if (!items.length) {
      box.innerHTML = '<div class="tb-card"><div class="tbv-empty">📭 Hali darslik yuklanmagan. Yuqoridan birinchi darslikni yuklang.</div></div>';
      return;
    }
    box.innerHTML =
      '<div class="tb-grid">' +
      items
        .map(function (b) {
          var st;
          if (b.status === "processing") {
            var p = b.progress || {};
            var pct = p.total ? Math.round((p.done / p.total) * 100) : 5;
            st = '<div class="tb-st processing">⏳ ' + (p.stage === "details" ? "AI dars rejalarini tuzmoqda: " + p.done + " / " + p.total : "AI darslikni o'qib, darslarga ajratmoqda…") +
              '<div class="tb-bar"><i style="width:' + pct + '%"></i></div></div>';
          } else if (b.status === "error") st = '<div class="tb-st error">⚠️ ' + esc(b.error || "Tahlil qilinmadi") + "</div>";
          else st = '<div class="tb-st ready">✅ ' + b.lessonsCount + " ta dars tayyor" + (b.error ? '<div style="font-weight:600;margin-top:3px">' + esc(b.error) + "</div>" : "") + "</div>";
          var id = esc(b.id);
          return (
            '<div class="tb-item"><div class="tb-item-top"><div class="tb-pdf">PDF</div><div style="min-width:0;flex:1">' +
            '<div class="tb-name">' + esc(b.title) + "</div>" +
            '<div class="tb-sub">📚 ' + esc(b.course) + " · " + fmtSize(b.size) + " · " + esc(new Date(b.createdAt).toLocaleDateString()) + "</div></div></div>" +
            st +
            '<div class="tb-acts">' +
            (b.lessonsCount ? '<button class="btn btn-sm btn-primary" onclick="openLessonMethod({course:\'' + esc(String(b.course).replace(/'/g, "\\'")) + '\',bookId:\'' + id + '\'})">📘 Darslarni ko\'rish</button>' : "") +
            '<button class="btn btn-sm" onclick="tbvPdf(\'' + id + '\')">📄 PDF</button>' +
            (b.status !== "processing" ? '<button class="btn btn-sm" onclick="tbReparse(\'' + id + '\')">🔄 Qayta tahlil</button>' : "") +
            '<button class="btn btn-sm btn-del-outline" onclick="tbDelete(\'' + id + '\')">🗑</button>' +
            "</div></div>"
          );
        })
        .join("") +
      "</div>";
    clearTimeout(_poll);
    if (items.some(function (b) {
      return b.status === "processing";
    }))
      _poll = setTimeout(function () {
        var panel = document.getElementById("panel-textbooks");
        if (panel && panel.classList.contains("active")) renderTextbooks();
      }, 5000);
  }

  window.tbPick = function (file) {
    if (!file) return;
    if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) return say("⚠️ Faqat PDF fayl yuklash mumkin");
    if (file.size > 15 * 1024 * 1024) return say("⚠️ PDF 15 MB dan katta — kichikroq faylni tanlang");
    _upl.file = file;
    var t = document.getElementById("tb-title");
    if (t && !t.value) t.value = file.name.replace(/\.pdf$/i, "");
    renderUpload();
  };
  window.tbUpload = function () {
    var course = (document.getElementById("tb-course") || {}).value || "";
    var title = (document.getElementById("tb-title") || {}).value || "";
    if (!course) return say("⚠️ Avval kursni tanlang");
    if (!_upl.file) return say("⚠️ PDF faylni tanlang");
    if (_upl.busy) return;
    _upl.busy = true;
    renderUpload();
    var file = _upl.file;
    new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () {
        res(r.result);
      };
      r.onerror = function () {
        rej(new Error("Faylni o'qib bo'lmadi"));
      };
      r.readAsDataURL(file);
    })
      .then(function (du) {
        return sendJson("POST", "/api/textbooks", { course: course, title: title, fileName: file.name, data: du });
      })
      .then(function () {
        say("✅ Darslik yuklandi — AI uni darslarga ajratmoqda");
        _upl = { file: null, busy: false };
        var t = document.getElementById("tb-title");
        if (t) t.value = "";
        renderTextbooks();
      })
      .catch(function (e) {
        _upl.busy = false;
        renderUpload();
        say("⚠️ " + e.message);
      });
  };
  window.tbReparse = function (id) {
    sendJson("POST", "/api/textbooks/" + encodeURIComponent(id) + "/reparse")
      .then(function () {
        say("🔄 Qayta tahlil boshlandi");
        renderTextbooks();
      })
      .catch(function (e) {
        say("⚠️ " + e.message);
      });
  };
  window.tbDelete = function (id) {
    var go_ = function () {
      getJson("/api/textbooks/" + encodeURIComponent(id), { method: "DELETE" })
        .then(function () {
          say("🗑 Darslik o'chirildi");
          delete _books[id];
          renderTextbooks();
        })
        .catch(function (e) {
          say("⚠️ " + e.message);
        });
    };
    if (typeof crmConfirm === "function")
      crmConfirm("Bu darslik va uning barcha darslari o'chirilsinmi?", { okText: "O'chirish" }).then(function (ok) {
        if (ok) go_();
      });
    else if (confirm("Bu darslik o'chirilsinmi?")) go_();
  };
  window.renderTextbooks = renderTextbooks;

  // Menyudagi son — admin ochilganda bir marta
  setTimeout(function () {
    if (role() === "admin" && document.getElementById("nc-textbooks")) loadList(false).catch(function () {});
  }, 3000);
})();
