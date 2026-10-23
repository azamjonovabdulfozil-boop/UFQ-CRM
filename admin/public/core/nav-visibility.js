// ================================================
// BO'LIMLARNI YASHIRISH — Sozlamalar → «Bo'limlar»
// Foydalanuvchi kerak bo'lmagan bo'limni (masalan, AI Yordamchi) o'chirsa,
// u chap menyudan yo'qoladi; qayta yoqsa — yana paydo bo'ladi.
//
// Tanlov har bir rol + foydalanuvchi uchun alohida, _uiSettings ichida
// (localStorage) saqlanadi. Yashirish CSS sinfi orqali (!important) —
// rol kodi tugmaga inline display:flex bersa ham bo'lim yashirin qoladi.
// «Sozlamalar» bo'limini yashirib bo'lmaydi.
// ================================================
(function () {
  "use strict";

  // Har bir rol uchun yashirsa bo'ladigan bo'limlar: nav tugma id → tab nomi
  var SECTIONS = {
    admin: [
      ["nav-dashboard", "dashboard"],
      ["nav-courses", "courses"],
      ["nav-groups", "groups"],
      ["nav-mentors", "mentors"],
      ["nav-students", "students"],
      ["nav-debtors", "debtors"],
      ["nav-admin-ai", "admin-ai"],
      ["nav-methodology", "methodology"],
      ["nav-certificates", "certificates"],
      ["nav-finance", "finance"],
      ["nav-coin-shop", "coin-shop"],
    ],
    mentor: [
      ["nav-mentor-dash", "mentor-dash"],
      ["nav-mentor-groups", "mentor-groups"],
      ["nav-mentor-method", "mentor-method"],
      ["nav-mentors-my", "mentors-my"],
      ["nav-mentor-chat", "mentor-chat"],
      ["nav-mentor-ai", "mentor-ai"],
      ["nav-mentor-students-ai", "mentor-students-ai"],
      ["nav-tests-mentor", "tests"],
      ["nav-grades-mentor", "grades"],
      ["nav-mentor-videos", "mentor-videos"],
    ],
    student: [
      ["nav-student-my", "student-my"],
      ["nav-student-schedule", "student-schedule"],
      ["nav-student-rating", "student-rating"],
      ["nav-student-grades", "student-grades"],
      ["nav-student-tests", "student-tests"],
      ["nav-student-chat", "student-chat"],
      ["nav-student-ai", "student-ai"],
      ["nav-student-videos", "student-videos"],
      ["nav-student-certificates", "student-certificates"],
      ["nav-student-goals", "student-goals"],
      ["nav-student-coin-shop", "student-coin-shop"],
    ],
  };

  var HIDDEN_CLASS = "nav-user-hidden";

  // Super Admin → «Menyu boshqaruvi»: shu rol uchun «Menyu bo'limlari»
  // yopilgan bo'lsa (false) — sozlamalarda bu bo'lim chiqmaydi va
  // foydalanuvchining oldin yashirgan bo'limlari hisobga olinmaydi.
  var menuAllowed = true;

  function injectStyles() {
    if (document.getElementById("nav-visibility-style")) return;
    var st = document.createElement("style");
    st.id = "nav-visibility-style";
    st.textContent =
      "#sidebar .nav-btn." + HIDDEN_CLASS + "{display:none!important}" +
      "#sett-nav-card{grid-column:1/-1}" +
      ".navvis-list{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}" +
      "@media(max-width:1100px){.navvis-list{grid-template-columns:repeat(3,minmax(0,1fr))}}" +
      "@media(max-width:760px){.navvis-list{grid-template-columns:repeat(2,minmax(0,1fr))}}" +
      "@media(max-width:400px){.navvis-list{grid-template-columns:1fr}}" +
      ".navvis-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--border);border-radius:var(--r-lg);background:var(--bg);cursor:pointer;user-select:none;transition:border-color .2s,opacity .2s}" +
      ".navvis-row:hover{border-color:var(--border2)}" +
      ".navvis-row.off{opacity:.55}" +
      ".navvis-ic{width:22px;display:flex;align-items:center;justify-content:center;font-size:16px;color:var(--text2);flex-shrink:0}" +
      ".navvis-name{flex:1;min-width:0;font-size:14px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".navvis-sw{position:relative;width:40px;height:22px;min-height:0;min-width:0;max-width:none;border-radius:11px;border:none;padding:0;background:var(--bg4);cursor:pointer;flex-shrink:0;transition:background .2s}" +
      ".navvis-sw::after{content:'';position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform .2s}" +
      ".navvis-sw[aria-checked='true']{background:var(--accent)}" +
      ".navvis-sw[aria-checked='true']::after{transform:translateX(18px)}" +
      ".navvis-sw:focus-visible{outline:2px solid var(--accent);outline-offset:2px}" +
      ".navvis-actions{grid-column:1/-1;display:flex;justify-content:flex-end;margin-top:4px}" +
      ".navvis-reset{border:1px solid var(--border);background:var(--bg2);color:var(--text);border-radius:var(--r-md);padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer}" +
      ".navvis-reset:hover{border-color:var(--accent);color:var(--accent)}";
    document.head.appendChild(st);
  }

  function role() {
    try {
      if (typeof isMentorRole === "function" && isMentorRole()) return "mentor";
      if (typeof isStudentRole === "function" && isStudentRole()) return "student";
    } catch (e) {}
    return "admin";
  }

  function settingsKey() {
    var key = "hiddenNav_" + role();
    try {
      var cu = (typeof getCurrentUser === "function" && getCurrentUser()) || {};
      var uid = cu.studentId || cu.mentorId || cu.id || cu.username || "";
      if (uid) key += "_" + String(uid);
    } catch (e) {}
    return key;
  }

  function ui() {
    try {
      if (typeof _uiSettings !== "undefined" && _uiSettings) return _uiSettings;
    } catch (e) {}
    return null;
  }

  function getHidden() {
    if (!menuAllowed) return [];
    var s = ui();
    var list = s && s[settingsKey()];
    return Array.isArray(list) ? list.slice() : [];
  }

  function setHidden(list) {
    var s = ui();
    if (!s) return;
    s[settingsKey()] = list;
    try {
      if (typeof saveUI === "function") saveUI();
    } catch (e) {}
  }

  function sections() {
    return (SECTIONS[role()] || []).filter(function (it) {
      var el = document.getElementById(it[0]);
      // Super Admin o'chirgan bo'lim bu ro'yxatda ham ko'rinmaydi
      return !!el && !el.classList.contains("nav-super-hidden");
    });
  }

  function applyHidden() {
    var hidden = getHidden();
    var all = SECTIONS.admin.concat(SECTIONS.mentor, SECTIONS.student);
    all.forEach(function (it) {
      var el = document.getElementById(it[0]);
      if (el) el.classList.toggle(HIDDEN_CLASS, hidden.indexOf(it[0]) >= 0);
    });
  }

  function isTabHidden(tab) {
    var hidden = getHidden();
    return sections().some(function (it) {
      return it[1] === tab && hidden.indexOf(it[0]) >= 0;
    });
  }

  // Yashirilgan bo'lim o'rniga ochiladigan birinchi ko'rinadigan bo'lim
  function fallbackTab() {
    var hidden = getHidden();
    var list = sections();
    for (var i = 0; i < list.length; i++) {
      if (hidden.indexOf(list[i][0]) >= 0) continue;
      var el = document.getElementById(list[i][0]);
      if (el && getComputedStyle(el).display !== "none") return list[i];
    }
    return ["nav-settings", "settings"];
  }

  function labelOf(btn) {
    var c = btn.cloneNode(true);
    c.querySelectorAll(".nav-ic,.nav-count").forEach(function (n) {
      n.remove();
    });
    return (c.textContent || "").replace(/\s+/g, " ").trim();
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function txt(uz, ru, en) {
    var L = typeof LANG !== "undefined" ? LANG : "uz";
    return L === "ru" ? ru : L === "en" ? en : uz;
  }

  function renderCard() {
    var box = document.getElementById("sett-nav-list");
    if (!box) return;
    var title = document.getElementById("sett-nav-title");
    var sub = document.getElementById("sett-nav-sub");
    if (title) title.textContent = txt("Bo'limlar", "Разделы", "Sections");
    if (sub)
      sub.textContent = txt(
        "Kerak bo'lmagan bo'limni o'chiring — u menyudan yo'qoladi",
        "Отключите ненужный раздел — он исчезнет из меню",
        "Turn off a section you don't need — it disappears from the menu",
      );

    var hidden = getHidden();
    var html = sections()
      .map(function (it) {
        var btn = document.getElementById(it[0]);
        var on = hidden.indexOf(it[0]) < 0;
        var ic = btn.querySelector(".nav-ic");
        var name = labelOf(btn) || it[1];
        return (
          '<div class="navvis-row' + (on ? "" : " off") + '" data-nav="' + esc(it[0]) + '">' +
          '<span class="navvis-ic">' + (ic ? ic.innerHTML : "") + "</span>" +
          '<span class="navvis-name">' + esc(name) + "</span>" +
          '<button type="button" class="navvis-sw" role="switch" aria-checked="' + on +
          '" aria-label="' + esc(name) + '"></button>' +
          "</div>"
        );
      })
      .join("");
    html +=
      '<div class="navvis-actions"><button type="button" class="navvis-reset" data-nav-reset="1">' +
      esc(txt("Hammasini ko'rsatish", "Показать все", "Show all")) +
      "</button></div>";
    box.innerHTML = html;
  }

  function toggle(navId) {
    var hidden = getHidden();
    var i = hidden.indexOf(navId);
    var turnedOff = i < 0;
    if (turnedOff) hidden.push(navId);
    else hidden.splice(i, 1);
    setHidden(hidden);
    applyHidden();
    renderCard();
    if (typeof toast === "function") {
      var btn = document.getElementById(navId);
      var name = btn ? labelOf(btn) : "";
      toast(
        turnedOff
          ? txt("🙈 «" + name + "» menyudan yashirildi", "🙈 «" + name + "» скрыт из меню", "🙈 «" + name + "» hidden from menu")
          : txt("👁 «" + name + "» menyuga qaytarildi", "👁 «" + name + "» снова в меню", "👁 «" + name + "» is back in the menu"),
      );
    }
  }

  function onListClick(e) {
    var box = document.getElementById("sett-nav-list");
    if (!box || !box.contains(e.target)) return;
    if (e.target.closest("[data-nav-reset]")) {
      setHidden([]);
      applyHidden();
      renderCard();
      return;
    }
    var row = e.target.closest(".navvis-row");
    if (row && row.dataset.nav) toggle(row.dataset.nav);
  }

  // go() ni o'raymiz: yashirilgan bo'limga o'tishga urinilsa — birinchi
  // ko'rinadigan bo'limga yo'naltiramiz (masalan, saqlangan oxirgi tab).
  function wrapGo() {
    var orig = window.go;
    if (typeof orig !== "function" || orig.__navVis) return;
    var wrapped = function (tab, el) {
      applyHidden();
      if (tab !== "settings" && isTabHidden(tab)) {
        var fb = fallbackTab();
        return orig.call(this, fb[1], document.getElementById(fb[0]));
      }
      return orig.apply(this, arguments);
    };
    wrapped.__navVis = true;
    window.go = wrapped;
  }

  function wrapSettings() {
    var orig = window.renderSettingsPanel;
    if (typeof orig !== "function" || orig.__navVis) return;
    var wrapped = function () {
      var r = orig.apply(this, arguments);
      try {
        renderCard();
      } catch (e) {}
      return r;
    };
    wrapped.__navVis = true;
    window.renderSettingsPanel = wrapped;
  }

  injectStyles();
  wrapGo();
  wrapSettings();
  applyHidden();
  // Skriptlar qayta yuklansa (go() qayta e'lon qilinadi) — o'rash yangilanadi,
  // click tinglovchisi esa faqat bir marta qo'shiladi.
  if (!window.__NAV_VISIBILITY_CLICK__) {
    window.__NAV_VISIBILITY_CLICK__ = true;
    document.addEventListener("click", function (e) {
      if (typeof window.__navVisClick === "function") window.__navVisClick(e);
    });
  }
  window.__navVisClick = onListClick;

  function setMenuAllowed(v) {
    v = v !== false;
    var changed = v !== menuAllowed;
    menuAllowed = v;
    if (typeof window.__setSettingsMenuAllowed === "function") window.__setSettingsMenuAllowed(v);
    if (changed) {
      applyHidden();
      try { renderCard(); } catch (e) {}
    }
  }

  var _loading = false;
  function loadPolicy() {
    if (_loading) return;
    try {
      if (window.CRMAuth && !window.CRMAuth.isLoggedIn()) return;
    } catch (e) { return; }
    _loading = true;
    fetch("/api/modules/me", { headers: { Accept: "application/json" } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.ok && "settingsMenu" in d) setMenuAllowed(d.settingsMenu);
      })
      .catch(function () {})
      .then(function () { _loading = false; });
  }

  function wrapShowApp() {
    var orig = window.showApp;
    if (typeof orig !== "function" || orig.__navVisPol) return;
    var wrapped = function () {
      var r = orig.apply(this, arguments);
      setTimeout(loadPolicy, 0);
      return r;
    };
    wrapped.__navVisPol = true;
    window.showApp = wrapped;
  }

  wrapShowApp();
  loadPolicy();
  if (!window.__NAV_VIS_POLICY_TIMER__) {
    window.__NAV_VIS_POLICY_TIMER__ = setInterval(function () {
      if (typeof window.__navVisLoadPolicy === "function") window.__navVisLoadPolicy();
    }, 60000);
    window.addEventListener("focus", function () {
      if (typeof window.__navVisLoadPolicy === "function") window.__navVisLoadPolicy();
    });
  }
  window.__navVisLoadPolicy = loadPolicy;
  window.setNavMenuAllowed = setMenuAllowed;
  window.applyNavVisibility = applyHidden;
  window.renderNavVisibilityCard = renderCard;
})();
