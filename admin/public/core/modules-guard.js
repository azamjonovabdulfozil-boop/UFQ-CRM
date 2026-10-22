// ================================================
// MODULLAR CHEKLOVI — Super Admin → «Menyu boshqaruvi»
//
// Super Admin o'chirgan bo'lim oddiy admin menyusida ko'rinmaydi va unga
// o'tib bo'lmaydi (go() o'raladi). Bu faqat KO'RINISH: haqiqiy himoya
// serverda — o'chirilgan modulning API'si adminga 403 qaytaradi, CRM
// bo'limlariga yozuv rad etiladi. Holat /api/modules/me dan olinadi va
// har daqiqada hamda oyna fokusga qaytganda yangilanadi.
//
// Super Admin bu panelni ochsa (?crm=1) — hech narsa cheklanmaydi va
// menyuda «Super Admin paneli» tugmasi chiqadi.
// ================================================
(function () {
  "use strict";

  var HID = "nav-super-hidden";
  var state = { modules: null, isSuper: false, restricted: false, loading: false };
  var FALLBACK = ["dashboard", "groups", "students", "courses", "mentors", "settings"];

  function injectStyles() {
    if (document.getElementById("modules-guard-style")) return;
    var st = document.createElement("style");
    st.id = "modules-guard-style";
    st.textContent =
      "#sidebar .nav-btn." + HID + "{display:none!important}" +
      "#nav-super-link{background:linear-gradient(135deg,rgba(124,58,237,.12),rgba(59,130,246,.12));color:var(--accent-text);font-weight:700;margin-bottom:6px}";
    document.head.appendChild(st);
  }

  function moduleOfTab(tab) {
    if (!state.modules) return null;
    for (var i = 0; i < state.modules.length; i++)
      if ((state.modules[i].tabs || []).indexOf(tab) >= 0) return state.modules[i];
    return null;
  }
  function isBlocked(tab) {
    var m = moduleOfTab(tab);
    return !!(m && (!m.menu || !m.api));
  }
  function firstAllowed() {
    for (var i = 0; i < FALLBACK.length; i++) {
      var t = FALLBACK[i];
      if (t === "settings" || !isBlocked(t)) return t;
    }
    return "settings";
  }

  function apply(quiet) {
    if (!state.modules) return;
    state.modules.forEach(function (m) {
      var el = document.getElementById(m.nav);
      if (el && el.classList.contains(HID) !== !m.menu) el.classList.toggle(HID, !m.menu);
    });
    if (!quiet && typeof window.renderNavVisibilityCard === "function") {
      try { window.renderNavVisibilityCard(); } catch (e) {}
    }
  }

  function superLink() {
    var nav = document.querySelector("#sidebar nav") || document.querySelector("#sidebar");
    var ex = document.getElementById("nav-super-link");
    if (!state.isSuper) {
      if (ex) ex.remove();
      return;
    }
    if (ex || !nav) return;
    var b = document.createElement("button");
    b.className = "nav-btn";
    b.id = "nav-super-link";
    b.type = "button";
    b.innerHTML = '<span class="nav-ic">👑</span><span>Super Admin paneli</span>';
    b.addEventListener("click", function () {
      try { sessionStorage.removeItem("edu_super_crm"); } catch (e) {}
      location.href = typeof superAdminUrl === "function" ? superAdminUrl() : "/super-admin/";
    });
    var first = nav.querySelector(".nav-btn");
    if (first && first.parentNode) first.parentNode.insertBefore(b, first);
    else nav.insertBefore(b, nav.firstChild);
  }

  function enforceCurrent() {
    try {
      if (typeof currentTab !== "undefined" && isBlocked(currentTab) && typeof window.go === "function") {
        var t = firstAllowed();
        window.go(t, document.getElementById("nav-" + t));
      }
    } catch (e) {}
  }

  function load() {
    if (state.loading) return;
    try {
      if (!window.CRMAuth || !window.CRMAuth.isLoggedIn()) return;
    } catch (e) { return; }
    state.loading = true;
    fetch("/api/modules/me", { headers: { Accept: "application/json" } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) return;
        var before = JSON.stringify(state.modules);
        state.modules = d.modules || [];
        state.isSuper = !!d.isSuper;
        state.restricted = !!d.restricted;
        apply();
        superLink();
        if (before !== JSON.stringify(state.modules)) enforceCurrent();
      })
      .catch(function () {})
      .then(function () { state.loading = false; });
  }

  // go() ni o'raymiz — o'chirilgan bo'limga o'tishga urinilsa ruxsat etilganiga
  function wrapGo() {
    var orig = window.go;
    if (typeof orig !== "function" || orig.__modGuard) return;
    var wrapped = function (tab, el) {
      if (tab !== "settings" && isBlocked(tab)) {
        var m = moduleOfTab(tab);
        if (typeof toast === "function")
          toast("🔒 «" + (m ? m.label : tab) + "» bo'limi Super Admin tomonidan o'chirilgan");
        var fb = firstAllowed();
        if (fb === tab) fb = "settings";
        return orig.call(this, fb, document.getElementById("nav-" + fb));
      }
      return orig.apply(this, arguments);
    };
    wrapped.__modGuard = true;
    window.go = wrapped;
  }

  // Panel ochilgan zahoti (login yoki sessiya tiklanganda) holatni olamiz
  function wrapShowApp() {
    var orig = window.showApp;
    if (typeof orig !== "function" || orig.__modGuard) return;
    var wrapped = function () {
      var r = orig.apply(this, arguments);
      state.modules = null;
      setTimeout(load, 0);
      return r;
    };
    wrapped.__modGuard = true;
    window.showApp = wrapped;
  }

  injectStyles();
  wrapGo();
  wrapShowApp();
  load();
  // Zaxira: kirilgan, lekin holat hali olinmagan bo'lsa — 1.5 s da qayta urinish
  // (kirilmagan bo'lsa tarmoqqa so'rov ketmaydi)
  if (!window.__MODULES_GUARD_EARLY__)
    window.__MODULES_GUARD_EARLY__ = setInterval(function () {
      if (!state.modules) return load();
      // Menyu qayta chizilsa ham holat saqlanib qolsin (tarmoqsiz, faqat DOM)
      apply(true);
      superLink();
    }, 1500);
  if (!window.__MODULES_GUARD_TIMER__) {
    window.__MODULES_GUARD_TIMER__ = setInterval(load, 60000);
    window.addEventListener("focus", load);
  }
  window.reloadModuleGuard = load;
})();
