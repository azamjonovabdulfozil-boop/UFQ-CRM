/**
 * Live Sync (REALTIME) — o'zgarishlar sahifani yangilamasdan DARHOL keladi.
 *
 * Nima o'zgardi (avval): har 5 soniyada faqat /api/data so'raladigan polling
 * bor edi. Coin, do'kon (shop), xaridlar, chat, video va boshqa hamma narsa
 * esa KV (localStorage ko'zgusi) da saqlanadi — ya'ni ular polling'ga umuman
 * tushmasdi. Shuning uchun mentor coin qo'yganda yoki admin do'konga mahsulot
 * qo'shganda, talaba F5 bosmaguncha ko'rmasdi.
 *
 * Endi (hozir):
 *   1. Brauzer serverga SSE (Server-Sent Events) orqali doimiy ulanadi:
 *      GET /api/events.
 *   2. Serverda HAR QANDAY yozuv bo'lishi bilan (coin, shop, xarid, davomat,
 *      baho, test, chat, sozlama...) barcha ulangan brauzerlarga xabar ketadi.
 *   3. Brauzer faqat O'ZGARGAN kalitlarni yuklab oladi (/api/kv?keys=...),
 *      localStorage ni yangilaydi va ochiq ekranni qayta chizadi.
 *   4. O'z yozuvimiz qaytib kelsa (echo) — e'tiborsiz qoldiriladi.
 *
 * Zaxira (fallback): SSE ishlamasa (eski proxy, offline, brauzer qo'llamasa)
 * avtomatik ravishda polling'ga tushadi — xatti-harakat bir xil, faqat
 * biroz sekinroq.
 */
(function () {
  "use strict";

  var POLL_INTERVAL = 4000; // zaxira polling (SSE yo'q yoki uzilgan)
  // SSE "ochiq" bo'lsa ham ishlab turadigan sekin xavfsizlik polling'i.
  // ⚠️ Proxy (Vercel/Render) orqasida SSE ba'zan "ochiq" ko'rinib, lekin oqim
  // qotib qoladi — xabar kelmaydi. Agar polling butunlay to'xtatilsa, ma'lumot
  // refresh qilmaguncha yangilanmasdi. Shu sekin poll o'sha holatda ham
  // yangilanishni kafolatlaydi.
  var SAFETY_POLL_INTERVAL = 15000;
  var RECONCILE_INTERVAL = 30000; // xavfsizlik uchun to'liq tekshiruv
  // Oddiy so'rovlar uchun: nisbiy manzil (Vercel /api ni backend'ga proxy
  // qiladi, Render'da esa bir xil domen).
  var API_BASE =
    typeof __API_BASE__ !== "undefined" && __API_BASE__
      ? __API_BASE__
      : window.__API_BASE__ || "";

  // SSE uchun: TO'G'RIDAN-TO'G'RI backend. Proxy'lar uzluksiz oqimni
  // buferlab/uzib qo'yishi mumkin, shuning uchun aylanma yo'ldan bormaymiz.
  var SSE_BASE = window.__SSE_BASE__ || API_BASE || "";

  var STORAGE_KEY = "edumanage_crm_v8";
  var COIN_KEY = "edu_mentor_coins_v1";
  var SHOP_KEY = "edu_shop_v1";
  var PURCHASE_KEY = "edu_purchases_v1";

  var CLIENT_ID = window.__CRM_CLIENT_ID__ || "";
  var CLIENT_ONLY = window.__CRM_CLIENT_ONLY_KEYS__ || [
    "edumanage_auth_v10",
    "edu_remember_cred",
    "edumanage_ui_v8",
  ];

  var es = null; // EventSource
  var pollTimer = null;
  var reconcileTimer = null;
  var started = false;
  var inFlight = false;
  var lastKvHash = null;
  var pendingRender = false;
  var pendingKeys = {}; // kutayotgan (hali chizilmagan) o'zgargan kalitlar
  var queue = {}; // debounce uchun to'planayotgan kalitlar
  var debounceTimer = null;
  var sseOpened = false; // SSE hech bo'lmasa bir marta ochilganmi
  var sseFails = 0; // ketma-ket muvaffaqiyatsiz urinishlar
  var sseSupported = null; // null = hali noma'lum
  var probeTimer = null;

  // ─── Yordamchilar ───────────────────────────────────────────────────────────
  function djb2(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) {
      h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    }
    return h;
  }

  function isClientOnly(k) {
    return CLIENT_ONLY.indexOf(k) !== -1;
  }

  // Shimni chetlab o'tib yozamiz — aks holda backend'dan kelgan qiymat
  // darhol backend'ga qaytib yozilib, cheksiz aylanma hosil bo'lardi.
  function rawSet(k, v) {
    try {
      Storage.prototype.setItem.call(localStorage, k, v);
    } catch (e) {}
  }
  function rawGet(k) {
    try {
      return Storage.prototype.getItem.call(localStorage, k);
    } catch (e) {
      return null;
    }
  }

  /**
   * Foydalanuvchi ayni damda HAQIQATAN biror narsa yozayaptimi?
   *
   * ⚠️ Avvalgi tekshiruv juda qattiq edi: kursor istalgan maydonda (masalan
   * bo'sh qidiruv katagida) turgan bo'lsa ham ekran QAYTA CHIZILMASDI — ya'ni
   * foydalanuvchi qidiruvga bosib qo'ygan bo'lsa, yangi coin yoki mahsulot
   * unga ko'rinmay qolardi. Endi faqat rostdan yozayotgan (yoki ichida matn
   * bor) maydon renderni kechiktiradi.
   *
   * Ma'lumot baribir localStorage ga DARHOL yoziladi — kechiktirilayotgani
   * faqat ekranni qayta chizish, u esa maydondan chiqishi bilan bajariladi.
   */
  var TYPING_WINDOW = 4000; // so'nggi 4 soniyada yozgan bo'lsa — band
  var lastTypedAt = 0;
  document.addEventListener(
    "input",
    function () {
      lastTypedAt = Date.now();
    },
    true
  );
  document.addEventListener(
    "keydown",
    function () {
      lastTypedAt = Date.now();
    },
    true
  );

  function isUserBusy() {
    // Ochiq modal/oyna — uni qayta chizish ochiq formani buzishi mumkin
    if (
      document.querySelector(
        ".modal.open, .modal.show, dialog[open], .sheet.open"
      )
    ) {
      return true;
    }

    var ae = document.activeElement;
    var editable =
      ae &&
      (ae.tagName === "INPUT" ||
        ae.tagName === "TEXTAREA" ||
        ae.tagName === "SELECT" ||
        ae.isContentEditable);
    if (!editable) return false;

    // Yaqinda tugma bosgan bo'lsa — yozayapti
    if (Date.now() - lastTypedAt < TYPING_WINDOW) return true;
    // Maydonda matn bor — uni yo'qotib qo'ymaymiz
    if (ae.value && String(ae.value).length) return true;

    // Bo'sh va tegilmagan maydon — bu "bandlik" emas
    return false;
  }

  // ─── O'zgarishni UI ga qo'llash ─────────────────────────────────────────────
  function applyToUI(changed) {
    // 1. CRM yadro ma'lumoti (kurslar, guruhlar, davomat, baholar, testlar...)
    if (changed.indexOf(STORAGE_KEY) !== -1) {
      try {
        if (typeof loadData === "function" && window.D) {
          Object.assign(window.D, loadData());
        }
      } catch (e) {}
      try {
        if (typeof recomputeAllDebtStatuses === "function")
          recomputeAllDebtStatuses({ silent: true });
      } catch (e) {}
      try {
        if (typeof updateCounts === "function") updateCounts();
      } catch (e) {}
    }

    // 2. Coin balansi — topbar'dagi raqam. Bu yengil, shuning uchun
    //    foydalanuvchi band bo'lsa ham darhol yangilanadi.
    var coinTouched =
      changed.indexOf(COIN_KEY) !== -1 ||
      changed.indexOf(SHOP_KEY) !== -1 ||
      changed.indexOf(PURCHASE_KEY) !== -1;
    if (coinTouched) {
      try {
        if (typeof window.updateMentorCoinTopbar === "function")
          window.updateMentorCoinTopbar();
      } catch (e) {}
      notifyCoinChange();
    }

    // 3. To'liq qayta chizish — foydalanuvchi band bo'lsa keyinga suramiz.
    if (isUserBusy()) {
      changed.forEach(function (k) {
        pendingKeys[k] = 1;
      });
      pendingRender = true;
      return;
    }
    rerender();
  }

  function rerender() {
    pendingRender = false;
    pendingKeys = {};
    try {
      if (typeof renderCurrentView === "function") {
        renderCurrentView();
      } else if (typeof renderAll === "function") {
        renderAll();
      }
    } catch (e) {
      console.warn("[live-sync] render xatosi:", e);
    }
  }

  /**
   * Talabaning coin balansi oshgan/kamayganini sezib, kichik bildirishnoma
   * ko'rsatadi — mentor coin qo'yganini talaba darhol payqashi uchun.
   */
  var lastOwnBal = null;
  function notifyCoinChange() {
    try {
      if (!window.coinShop || !window.getCurrentUser) return;
      var cu = window.getCurrentUser() || {};
      if (cu.role !== "Talaba" || !cu.studentId) return;
      var bal = window.coinShop.getStudentBal(parseInt(cu.studentId));
      if (lastOwnBal !== null && bal !== lastOwnBal && typeof toast === "function") {
        var diff = bal - lastOwnBal;
        if (diff > 0) toast("🪙 +" + diff + " coin qo'shildi!", "#0d9488");
      }
      lastOwnBal = bal;
    } catch (e) {}
  }

  // ─── Serverdan o'zgargan kalitlarni olish ───────────────────────────────────
  // CRM ma'lumotining "og'irligi" — nechta haqiqiy yozuv bor (0 = bo'sh).
  function _crmWeight(raw) {
    try {
      var d = JSON.parse(raw);
      var n = 0;
      ["courses", "groups", "mentors", "students", "finance", "tests"].forEach(
        function (k) {
          if (Array.isArray(d[k])) n += d[k].length;
        },
      );
      ["attendance", "grades", "gradingCriteria", "simpleGrades", "testResults"].forEach(
        function (k) {
          if (d[k] && typeof d[k] === "object") n += Object.keys(d[k]).length;
        },
      );
      return n;
    } catch (e) {
      return 0;
    }
  }

  function fetchKeys(keys) {
    var all = !keys || !keys.length || keys.indexOf("*") !== -1;
    var url = API_BASE + "/api/kv";
    if (!all) url += "?keys=" + encodeURIComponent(keys.join(","));

    return fetch(url, { cache: "no-store" })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (d) {
        if (!d || !d.ok) return;
        var data = d.data || {};
        var changed = [];
        var graceSkipped = false;
        Object.keys(data).forEach(function (k) {
          if (isClientOnly(k)) return; // sessiya kalitlariga TEGMAYMIZ
          // ⚠️ Serverdagi CRM nusxasi bo'sh, brauzerdagisi to'la bo'lsa —
          // TEGMAYMIZ. Bir marta yuz bergan bo'shalish shu yo'l bilan
          // brauzerlarga tarqalib ketmasin (syncFromBackend uni serverga
          // qaytaradi).
          if (k === STORAGE_KEY && _crmWeight(data[k]) === 0) {
            var lw = _crmWeight(rawGet(k));
            if (lw > 0) return;
          }
          if (rawGet(k) !== data[k]) {
            // Hozirgina o'zimiz yozgan/o'chirgan bo'lsak — serverning eski
            // nusxasini ustiga yozmaymiz (o'chirilgan narsa qaytib kelmasin).
            if (window.__CRM_WROTE_RECENTLY__ && window.__CRM_WROTE_RECENTLY__(k)) {
              graceSkipped = true;
              return;
            }
            rawSet(k, data[k]);
            changed.push(k);
          }
        });
        // So'ralgan kalit javobda yo'q bo'lsa — u serverda O'CHIRILGAN.
        // Mahalliy nusxadan ham olib tashlaymiz, aks holda o'chirilgan
        // narsa (masalan do'kondan olingan mahsulot) ekranda qolib ketardi.
        if (!all) {
          keys.forEach(function (k) {
            if (isClientOnly(k)) return;
            if (
              !Object.prototype.hasOwnProperty.call(data, k) &&
              rawGet(k) !== null
            ) {
              try {
                Storage.prototype.removeItem.call(localStorage, k);
              } catch (e) {}
              changed.push(k);
            }
          });
        } else {
          lastKvHash = graceSkipped ? null : djb2(JSON.stringify(data));
        }
        if (changed.length) applyToUI(changed);
      })
      .catch(function () {});
  }

  // Bir necha xabar ketma-ket kelsa — bitta so'rovga birlashtiramiz.
  function enqueue(keys) {
    (keys && keys.length ? keys : ["*"]).forEach(function (k) {
      // Server tomonidagi maxsus belgilar KV kaliti emas — to'liq yangilash
      if (k === "__users__" || k === "__blob__") queue["*"] = 1;
      else queue[k] = 1;
    });
    if (debounceTimer) return;
    debounceTimer = setTimeout(function () {
      debounceTimer = null;
      var ks = Object.keys(queue);
      queue = {};
      if (ks.length) fetchKeys(ks);
    }, 120);
  }

  // ─── SSE ulanish ────────────────────────────────────────────────────────────
  //
  // ⚠️ Backend hali yangilanmagan bo'lishi mumkin (eski versiyada /api/events
  // yo'q). Bunday holda EventSource har 3 soniyada qayta urinib, console ni
  // 404 xatolari bilan to'ldiradi. Shuning uchun avval /api/rev orqali
  // "backend realtime'ni qo'llaydimi?" deb tekshiramiz va faqat shundan keyin
  // ulanamiz. Qo'llamasa — jimgina polling'da ishlaymiz va vaqti-vaqti bilan
  // qayta tekshirib turamiz (backend deploy bo'lishi bilan o'zi ulanadi).
  function probeRealtime() {
    return fetch(SSE_BASE + "/api/rev", { cache: "no-store" })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (d) {
        return !!(d && d.ok);
      })
      .catch(function () {
        return false;
      });
  }

  // Backend yangilanguncha vaqti-vaqti bilan qayta tekshiramiz
  function scheduleProbe() {
    if (probeTimer) return;
    probeTimer = setInterval(function () {
      if (es || document.hidden) return;
      probeRealtime().then(function (ok) {
        if (ok && !es) connectSSE();
      });
    }, 60000);
  }

  function dropSSE() {
    if (es) {
      try {
        es.close();
      } catch (e) {}
      es = null;
    }
  }

  function connectSSE() {
    if (!window.EventSource) return false;
    // ⚠️ Oqim endi himoyalangan: EventSource sarlavha qo'sha olmagani uchun
    // qisqa umrli access token manzilga qo'shiladi (CRMAuth uni yangilab
    // turadi). Token bo'lmasa umuman ulanmaymiz.
    if (!window.CRMAuth) return false;
    window.CRMAuth.streamUrl("/api/events").then(function (url) {
      if (!url || url.indexOf("access_token=") === -1) return;
      // Nisbiy manzil bo'lsa SSE_BASE bilan to'ldiramiz
      if (!/^https?:/i.test(url)) url = SSE_BASE + url;
      openStream(url);
    });
    return true;
  }

  function openStream(url) {
    if (es) return;
    try {
      es = new EventSource(url, { withCredentials: true });
    } catch (e) {
      es = null;
      return false;
    }

    es.onmessage = function (ev) {
      var msg;
      try {
        msg = JSON.parse(ev.data);
      } catch (e) {
        return;
      }
      if (!msg || msg.hello) return;
      // O'z yozuvimiz qaytib keldi — qayta yuklash shart emas.
      if (msg.origin && CLIENT_ID && msg.origin === CLIENT_ID) return;
      enqueue(msg.keys);
    };

    es.onerror = function () {
      // Ulanish uzildi — zaxira polling darhol yoqiladi, ma'lumot to'xtamaydi.
      startPolling();
      if (sseOpened) return; // ishlab turgan ulanish uzildi — o'zi tiklaydi
      // Hech qachon ochilmagan bo'lsa, demak endpoint yo'q (eski backend).
      // 2 urinishdan keyin butunlay to'xtatamiz — console 404 ga to'lmasin.
      sseFails++;
      if (sseFails >= 2) {
        dropSSE();
        sseSupported = false;
        scheduleProbe();
      }
    };

    es.onopen = function () {
      // SSE ochildi. Pollingni BUTUNLAY to'xtatmaymiz — proxy orqasida oqim
      // "ochiq"ligicha qotib qolishi mumkin. Sekin xavfsizlik polling'iga
      // o'tamiz, shunda SSE jim qolса ham ma'lumot yangilanib turadi.
      sseOpened = true;
      sseFails = 0;
      sseSupported = true;
      startPolling(SAFETY_POLL_INTERVAL);
      fetchKeys(["*"]);
    };
    return true;
  }

  // ─── Zaxira polling ─────────────────────────────────────────────────────────
  function poll() {
    if (inFlight || document.hidden) return;
    inFlight = true;
    fetch(API_BASE + "/api/kv", { cache: "no-store" })
      .then(function (r) {
        return r.ok ? r.text() : null;
      })
      .then(function (text) {
        if (!text) return;
        var h = djb2(text);
        if (h === lastKvHash) return;
        var d;
        try {
          d = JSON.parse(text);
        } catch (e) {
          return;
        }
        if (!d || !d.ok) return;
        var data = d.data || {};
        var changed = [];
        var skippedGrace = false;
        Object.keys(data).forEach(function (k) {
          if (isClientOnly(k)) return;
          if (rawGet(k) !== data[k]) {
            // Hozirgina o'zimiz yozgan/o'chirgan bo'lsak — serverning eski
            // nusxasini ustiga yozmaymiz (o'chirilgan narsa qaytib kelmasin).
            if (window.__CRM_WROTE_RECENTLY__ && window.__CRM_WROTE_RECENTLY__(k)) {
              skippedGrace = true;
              return;
            }
            rawSet(k, data[k]);
            changed.push(k);
          }
        });
        // Grace sabab biror narsa o'tkazib yuborilgan bo'lsa — hash'ni eslab
        // qolmaymiz, keyingi pollda (oyna o'tgach) qayta tekshiriladi.
        lastKvHash = skippedGrace ? null : h;
        if (changed.length) applyToUI(changed);
      })
      .catch(function () {})
      .finally(function () {
        inFlight = false;
      });
  }

  var currentPollMs = POLL_INTERVAL;
  function startPolling(ms) {
    var want = ms || POLL_INTERVAL;
    // Allaqachon kerakli tezlikda ishlab tursa — tegmaymiz.
    if (pollTimer && currentPollMs === want) return;
    stopPolling();
    currentPollMs = want;
    pollTimer = setInterval(poll, want);
  }
  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  /**
   * Xavfsizlik tarmog'i: /api/data (crm_data kolleksiyasi) KV dan chetda
   * o'zgargan bo'lsa ham (masalan Telegram boti yoki tashqi skript orqali)
   * har 30 soniyada bir bor solishtiriladi.
   */
  function reconcile() {
    if (document.hidden) return;
    // Kutib qolgan render bo'lsa va foydalanuvchi bo'shagan bo'lsa — chizamiz
    if (pendingRender && !isUserBusy()) rerender();
    try {
      if (typeof syncFromBackend === "function" && !isUserBusy())
        syncFromBackend();
    } catch (e) {}
  }

  // ─── Boshlash / to'xtatish ──────────────────────────────────────────────────
  function start() {
    if (started) return;
    started = true;
    if (!reconcileTimer)
      reconcileTimer = setInterval(reconcile, RECONCILE_INTERVAL);
    // Birinchi to'liq tekshiruv — boshqa qurilmada bo'lgan o'zgarishlarni olish
    fetchKeys(["*"]);
    // Realtime ulanishdan OLDIN backend uni qo'llashini tekshiramiz.
    // Tekshiruv tugaguncha polling ishlab turadi — ma'lumot baribir keladi.
    startPolling();
    probeRealtime().then(function (ok) {
      sseSupported = ok;
      if (ok) {
        connectSSE();
      } else {
        scheduleProbe(); // backend deploy bo'lishi bilan o'zi ulanadi
      }
    });
  }

  function stop() {
    started = false;
    dropSSE();
    if (probeTimer) {
      clearInterval(probeTimer);
      probeTimer = null;
    }
    stopPolling();
    if (reconcileTimer) {
      clearInterval(reconcileTimer);
      reconcileTimer = null;
    }
  }

  // Tab yashirilganda SSE ni ochiq qoldiramiz (u deyarli resurs yemaydi va
  // qaytganda ma'lumot allaqachon yangi bo'ladi), faqat pollingni to'xtatamiz.
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      stopPolling();
    } else {
      // SSE bo'lsa sekin xavfsizlik polling'i, bo'lmasa to'liq tezlikda.
      startPolling(es ? SAFETY_POLL_INTERVAL : POLL_INTERVAL);
      fetchKeys(["*"]); // qaytganda darhol tekshiramiz
      if (pendingRender && !isUserBusy()) rerender();
    }
  });

  // Foydalanuvchi formadan chiqqanda kutib turgan renderni bajaramiz
  document.addEventListener(
    "focusout",
    function () {
      setTimeout(function () {
        if (pendingRender && !isUserBusy()) rerender();
      }, 200);
    },
    true
  );

  // Modal yopilgan bo'lishi mumkin — sichqoncha bosilgandan keyin tekshiramiz
  document.addEventListener("click", function () {
    if (!pendingRender) return;
    setTimeout(function () {
      if (pendingRender && !isUserBusy()) rerender();
    }, 250);
  });

  // Login qilingach (crm-app ko'rinsa) boshlaymiz
  function maybeStart() {
    var app = document.getElementById("crm-app");
    if (app && app.style.display !== "none") {
      start();
    } else {
      setTimeout(maybeStart, 800);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", maybeStart);
  } else {
    maybeStart();
  }

  // Tashqaridan boshqarish uchun
  window.__liveSync = {
    start: start,
    stop: stop,
    pollNow: poll,
    refresh: function () {
      return fetchKeys(["*"]);
    },
    isRealtime: function () {
      return !!(es && es.readyState === 1);
    },
    status: function () {
      return {
        realtime: !!(es && es.readyState === 1),
        sseSupported: sseSupported,
        polling: !!pollTimer,
        sseBase: SSE_BASE,
      };
    },
    setInterval: function (ms) {
      POLL_INTERVAL = ms;
      stopPolling();
      startPolling();
    },
  };
})();
