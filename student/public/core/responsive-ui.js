/* ===================================================================
   EduManage CRM — RESPONSIVE UI BEHAVIOURS v1.0
   -------------------------------------------------------------------
   `responsive.css` ni to'ldiruvchi kichik xulq-atvor qatlami. Faqat
   CSS bilan qilib bo'lmaydigan narsalar:

     1. Panellar HTML'ni satr sifatida generatsiya qiladi va <table>
        larni scroll konteynerga o'ramaydi → mobilda jadval sahifani
        yon tomonga cho'zib yuboradi. Bu yerda avtomatik o'raymiz.
     2. Sidebar: Escape bilan yopish, chapga surib yopish, ekran
        kengayganda (planshet→desktop) avtomatik yopish.
     3. Topbar: scroll qilinganda soya (`.rs-scrolled`).

   Hech qanday mavjud funksiya qayta yozilmaydi — faqat qo'shimcha.
   =================================================================== */
(function () {
  "use strict";

  if (window.__rsUiInit) return;
  window.__rsUiInit = true;

  var MOBILE_MQ = window.matchMedia("(max-width: 900px)");

  /* ---------------------------------------------------------------
     1. Jadvallarni avtomatik scroll konteynerga o'rash
     --------------------------------------------------------------- */

  // Bu selektorlar ichidagi jadvallarning o'z scroll yechimi bor
  var ALREADY_SCROLLABLE = ".rs-table-scroll, .att-table-scroll";

  function wrapTables(root) {
    var tables = (root || document).querySelectorAll("table:not([data-rs-wrapped])");
    for (var i = 0; i < tables.length; i++) {
      var t = tables[i];
      t.setAttribute("data-rs-wrapped", "1");
      if (t.closest(ALREADY_SCROLLABLE)) continue;

      var parent = t.parentNode;
      if (!parent || parent.nodeType !== 1) continue;

      var wrap = document.createElement("div");
      wrap.className = "rs-table-scroll";
      parent.insertBefore(wrap, t);
      wrap.appendChild(t);
    }
  }

  /* ---------------------------------------------------------------
     2. Sidebar xulqi
     --------------------------------------------------------------- */

  function sidebarEl() {
    return document.getElementById("sidebar");
  }
  function overlayEl() {
    return document.getElementById("sidebar-overlay");
  }

  function closeSidebar() {
    var sb = sidebarEl();
    var ov = overlayEl();
    if (sb) sb.classList.remove("open");
    if (ov) ov.classList.remove("open");
  }

  function isSidebarOpen() {
    var sb = sidebarEl();
    return !!(sb && sb.classList.contains("open"));
  }

  // Escape → yopish
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && isSidebarOpen()) closeSidebar();
  });

  // Desktopga o'tilganda ochiq qolgan sidebar yopilsin
  function onBreakpointChange(e) {
    if (!e.matches) closeSidebar();
  }
  if (typeof MOBILE_MQ.addEventListener === "function") {
    MOBILE_MQ.addEventListener("change", onBreakpointChange);
  } else if (typeof MOBILE_MQ.addListener === "function") {
    MOBILE_MQ.addListener(onBreakpointChange); // eski Safari
  }

  // Chapga surib yopish
  (function enableSwipeClose() {
    var startX = null;
    var startY = null;
    var tracking = false;

    document.addEventListener(
      "touchstart",
      function (e) {
        if (!isSidebarOpen() || !MOBILE_MQ.matches) return;
        var sb = sidebarEl();
        if (!sb || !e.touches.length) return;
        if (!sb.contains(e.target)) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        tracking = true;
      },
      { passive: true },
    );

    document.addEventListener(
      "touchmove",
      function (e) {
        if (!tracking || !e.touches.length) return;
        var dx = e.touches[0].clientX - startX;
        var dy = e.touches[0].clientY - startY;
        // Vertikal harakat ustun bo'lsa — bu scroll, aralashmaymiz
        if (Math.abs(dy) > Math.abs(dx)) {
          tracking = false;
          return;
        }
        if (dx < -55) {
          closeSidebar();
          tracking = false;
        }
      },
      { passive: true },
    );

    document.addEventListener("touchend", function () {
      tracking = false;
    });
  })();

  /* ---------------------------------------------------------------
     3. Topbar soyasi (scroll holati)
     --------------------------------------------------------------- */

  var topbarTicking = false;

  function syncTopbarShadow() {
    topbarTicking = false;
    var tb = document.querySelector(".topbar");
    if (!tb) return;
    // Mobilda sahifa scroll qiladi, desktopda `.scroll` konteyner
    var scroller = document.getElementById("scroll");
    var y = MOBILE_MQ.matches
      ? window.pageYOffset || document.documentElement.scrollTop || 0
      : scroller
        ? scroller.scrollTop
        : 0;
    tb.classList.toggle("rs-scrolled", y > 4);
  }

  function requestTopbarSync() {
    if (topbarTicking) return;
    topbarTicking = true;
    requestAnimationFrame(syncTopbarShadow);
  }

  window.addEventListener("scroll", requestTopbarSync, { passive: true });

  /* ---------------------------------------------------------------
     4. Ishga tushirish + DOM o'zgarishlarini kuzatish
     --------------------------------------------------------------- */

  var scanQueued = false;

  function runScan() {
    scanQueued = false;
    wrapTables(document.getElementById("scroll") || document);
    requestTopbarSync();
  }

  // Diqqat: bu yerda requestAnimationFrame ISHLATILMAYDI. Brauzer
  // fon tabda rAF ni to'xtatib qo'yadi — panel qayta render bo'lsa,
  // jadval o'ralmay qolar va sahifa yon tomonga cho'zilardi.
  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    setTimeout(runScan, 0);
  }

  function start() {
    // Birinchi skan — darhol, kechiktirmasdan
    runScan();

    var scroller = document.getElementById("scroll");
    if (scroller) {
      scroller.addEventListener("scroll", requestTopbarSync, { passive: true });
    }

    // Panellar qayta render qilinganda yangi jadvallar paydo bo'ladi
    var host = document.getElementById("crm-app") || document.body;
    if (host && typeof MutationObserver === "function") {
      new MutationObserver(function (records) {
        for (var i = 0; i < records.length; i++) {
          if (records[i].addedNodes && records[i].addedNodes.length) {
            queueScan();
            return;
          }
        }
      }).observe(host, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
