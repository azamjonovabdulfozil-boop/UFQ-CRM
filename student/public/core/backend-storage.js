/**
 * Backend Storage Shim — barcha localStorage backend'ga sinxronlanadi.
 *
 * ⚠️  BUG FIX: Auth session kalitlari (edumanage_auth_*) backend KV'ga
 * YOZILMAYDI — chunki bu shared server, har bir user o'z sessionini
 * faqat o'z browserida saqlashi kerak.
 *
 * Auth kalitlari: localStorage (browser-only) + sessionStorage (fallback)
 * CRM kalitlari:  localStorage + backend KV (sinxron)
 */
(function () {
  // API base URL — Vercel da VITE_API_URL, mahallida va Render da relative ''
  var _API =
    typeof __API_BASE__ !== "undefined" && __API_BASE__ ? __API_BASE__ : "";

  // ── 1. Auth uchun CLIENT-ONLY kalitlar ro'yxati ──────────────────────────────
  var CLIENT_ONLY_KEYS = [
    "edumanage_auth_v10", // login sessiyasi — faqat browserda!
    "edu_remember_cred", // "Eslab qol" checkbox
    "edumanage_ui_v8", // UI sozlamalari (tab, theme) — har user o'ziniki
  ];
  // ⚠️ BUG FIX: edumanage_admin_cred_v1 endi CLIENT_ONLY emas — backend'ga
  // sinxronlanadi. Aks holda admin parolni sozlamalarda almashtirsa-yu,
  // localStorage tozalansa (yoki boshqa brauzer/qurilmadan kirsa), eski/standart
  // parolga qaytib qolar edi, chunki yagona nusxa faqat local edi.

  function isClientOnly(key) {
    return CLIENT_ONLY_KEYS.indexOf(key) !== -1;
  }

  // Realtime qatlami (live-sync.js) shu ro'yxatga tayanadi: server'dan kelgan
  // yangilanish ichida sessiya kalitlari bo'lsa, ular YOZILMAYDI — aks holda
  // bir foydalanuvchi boshqasining sessiyasini bosib ketardi.
  window.__CRM_CLIENT_ONLY_KEYS__ = CLIENT_ONLY_KEYS;

  // ── Mahalliy yozuv vaqtlari (sinxronlash poygasiga qarshi) ──────────────────
  // ⚠️ "O'chirilgan narsa qaytib kelardi" bug'i: biror kalitni hozirgina O'ZIMIZ
  // yozgan/o'chirgan bo'lsak, server bu yozuvni hali ko'rmagan bo'lishi mumkin.
  // Shu oyna ichida live-sync (/api/kv) va syncFromBackend (/api/data)
  // serverning ESKI nusxasini mahalliy ustiga YOZMAYDI — aks holda o'chirilgan
  // yozuv qaytib kelardi. Oyna o'tgach server bizning yozuvimizni olib ulguradi.
  window.__CRM_LAST_WRITE__ = {};
  var LOCAL_WRITE_GRACE_MS = 9000;
  window.__CRM_WROTE_RECENTLY__ = function (key) {
    try {
      var t = window.__CRM_LAST_WRITE__[key];
      return !!(t && Date.now() - t < LOCAL_WRITE_GRACE_MS);
    } catch (e) {
      return false;
    }
  };

  // ── Bu brauzerning yagona identifikatori ────────────────────────────────────
  // Har bir yozuv so'roviga `x-client-id` sarlavhasi qo'shiladi. Server shu id
  // ni realtime xabariga qaytaradi va brauzer O'Z yozuvini qayta yuklamaydi
  // (echo). Aks holda foydalanuvchi yozayotgan payt UI o'zini qayta chizib,
  // "sakrab" turardi.
  var CLIENT_ID = (function () {
    try {
      var k = "edu_client_id";
      var v = sessionStorage.getItem(k);
      if (!v) {
        v = Math.random().toString(36).slice(2) + Date.now().toString(36);
        sessionStorage.setItem(k, v);
      }
      return v;
    } catch (e) {
      return Math.random().toString(36).slice(2);
    }
  })();
  window.__CRM_CLIENT_ID__ = CLIENT_ID;

  // Barcha /api/ POST so'rovlariga client id sarlavhasini qo'shamiz — shunda
  // coin-system.js, data-finance.js va boshqa modullardagi mavjud fetch
  // chaqiruvlarini birma-bir o'zgartirish shart emas.
  //
  // Shu bilan birga nisbiy ("/api/...") manzillar backend domeniga
  // yo'naltiriladi. Portal Vercel'da turganda "/api/data" o'sha saytning
  // o'zidan qidirilib 404 qaytarardi — natijada yangilanish umuman kelmasdi.
  var _fetch = window.fetch ? window.fetch.bind(window) : null;
  if (_fetch) {
    window.fetch = function (input, init) {
      try {
        var isStr = typeof input === "string";
        var url = isStr ? input : input && input.url;
        // Nisbiy /api/ manzilni backend bazasiga bog'laymiz
        if (isStr && _API && input.indexOf("/api/") === 0) {
          input = _API + input;
          url = input;
        }
        var method = (
          (init && init.method) ||
          (!isStr && input && input.method) ||
          "GET"
        ).toUpperCase();
        if (url && url.indexOf("/api/") !== -1 && method !== "GET") {
          init = init ? Object.assign({}, init) : {};
          var h = new Headers(
            (init && init.headers) || (!isStr && input && input.headers) || {}
          );
          if (!h.has("x-client-id")) h.set("x-client-id", CLIENT_ID);
          init.headers = h;
        }
      } catch (e) {}
      return _fetch(input, init);
    };
  }

  // ── Demo rejimi (demo-mode.js) ──────────────────────────────────────────────
  // Portfoliodagi iframe uchun CRM serverdan uzilgan holda ishlaydi: ombordan
  // ma'lumot O'QILMAYDI va serverga hech nima YOZILMAYDI. Tarmoq to'sig'ini
  // demo-mode.js o'rnatadi; bu yerdagi tekshiruvlar niyatni ochiq qiladi va
  // skriptlar tartibi o'zgarib ketsa ham yozuvni ushlab qoladi.
  var DEMO = window.__CRM_DEMO__ === true;

  // ── 2. Sync hydrate — boshqa skriptlar localStorage ni o'qishidan oldin ──────
  //    FAQAT CRM kalitlarini backend'dan yuklaymiz, auth kalitlarini O'ZGARTIRMAYMIZ
  // ⚠️ MUHIM: bu yuklash MUVAFFAQIYATLI bo'lganini eslab qolamiz.
  //
  // Ilgari xato jimgina yutilardi: backend javob bermasa (Render uyquda,
  // internet uzilgan, CORS) localStorage BO'SH qolar, CRM esa "ma'lumot yo'q"
  // deb ishlashda davom etardi. Foydalanuvchi biror narsani o'zgartirishi
  // bilan o'sha bo'sh holat serverga yozilib, hamma narsa o'chib ketardi.
  // Endi yuklanmagan bo'lsa — yozish TAQIQLANADI (data-finance.js dagi
  // saveData() va quyidagi sync() shu bayroqni tekshiradi).
  var CRM_KEY = "edumanage_crm_v8";
  var loaded = DEMO; // demo rejimida yozuv baribir tarmoqqa chiqmaydi
  var loadError = "";

  // CRM ma'lumotining "og'irligi" — nechta haqiqiy yozuv bor (0 = bo'sh).
  function crmWeight(raw) {
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

  // ⚠️ XAVFSIZLIK O'ZGARISHI: /api/kv endi autentifikatsiya talab qiladi.
  // Ilgari bu yuklash skript yuklanishi bilan (login qilinmasdan OLDIN)
  // ishlardi — ya'ni CRM ma'lumoti hech kim so'ralmasdan tarqalardi.
  //
  // Endi yuklash SESSIYA TIKLANGANDAN KEYIN bajariladi: crmBoot avval
  // CRMAuth.restore() ni kutadi, so'ng shu funksiyani chaqiradi va faqat
  // undan keyin panelni ko'rsatadi. Boshqa skriptlar localStorage ni
  // sinxron o'qigani uchun so'rovning o'zi sinxron qolgan.
  function hydrateFromServer() {
   if (DEMO) { loaded = true; return true; }
   try {
    var token = window.CRMAuth && window.CRMAuth.tokenSync ? window.CRMAuth.tokenSync() : null;
    if (!token) {
      loadError = "sessiya yo'q";
      loaded = false;
      return false;
    }
    // ⚡ TEZLIK (refresh'da qotib qolmaslik uchun): localStorage da allaqachon
    // CRM ma'lumoti bo'lsa, sahifani BLOKLAYDIGAN sinxron so'rovni o'tkazib
    // yuboramiz. Ma'lumot darhol keshdan ko'rinadi; eng so'nggi nusxa fon
    // rejimida (syncFromBackend + live-sync) yuklanadi.
    try {
      var _cached = Storage.prototype.getItem.call(localStorage, CRM_KEY);
      if (_cached && crmWeight(_cached) > 0) {
        loaded = true;
        window.__CRM_KV_LOADED__ = true;
        window.__CRM_KV_ERROR__ = "";
        if (typeof window.hideDataLockBanner === "function") {
          try { window.hideDataLockBanner(); } catch (e) {}
        }
        return true;
      }
    } catch (e) {}
    var x = new XMLHttpRequest();
    x.open("GET", _API + "/api/kv", false); // sinxron (faqat birinchi yuklash)
    x.setRequestHeader("Authorization", "Bearer " + token);
    x.withCredentials = true;
    x.send(null);
    if (x.status >= 200 && x.status < 300) {
      var r = JSON.parse(x.responseText || "{}");
      if (r && r.ok && r.data && typeof r.data === "object") {
        // Faqat AUTH bo'lmagan kalitlarni yozamiz
        var quotaFail = [];
        Object.keys(r.data).forEach(function (k) {
          if (isClientOnly(k)) return;
          // ⚠️ Serverdagi CRM ma'lumoti BO'SH, brauzerdagi nusxa esa to'la
          // bo'lsa — brauzerdagini SAQLAB QOLAMIZ. Aks holda serverda bir
          // marta yuz bergan bo'shalish barcha brauzerlarga tarqalib,
          // oxirgi omon qolgan nusxa ham yo'q bo'lardi. Bu holatda aksincha:
          // brauzerdagi nusxa serverga qaytariladi (data-finance.js).
          if (k === CRM_KEY) {
            var localRaw = Storage.prototype.getItem.call(localStorage, k);
            if (localRaw && crmWeight(r.data[k]) === 0 && crmWeight(localRaw) > 0) {
              window.__CRM_LOCAL_NEWER__ = true;
              console.warn(
                "[CRM] Serverda ma'lumot bo'sh — brauzerdagi nusxa saqlanib qoldi va serverga qaytariladi.",
              );
              return;
            }
          }
          try {
            Storage.prototype.setItem.call(localStorage, k, r.data[k]);
          } catch (e) {
            // localStorage to'lgan (QuotaExceededError). Bu ayniqsa CRM
            // kalitida xavfli — quyida buni alohida tekshiramiz.
            quotaFail.push(k);
          }
        });
        // Server CRM ma'lumotini bergan, lekin u localStorage ga tushmagan
        // bo'lsa — "yuklandi" deb hisoblamaymiz.
        loaded =
          quotaFail.indexOf(CRM_KEY) === -1 &&
          (!(CRM_KEY in r.data) ||
            Storage.prototype.getItem.call(localStorage, CRM_KEY) != null);
        if (!loaded)
          loadError = "localStorage to'lib qolgan (" + quotaFail.join(", ") + ")";
      } else {
        loadError = "serverdan noto'g'ri javob";
      }
    } else {
      loadError = "HTTP " + x.status;
    }
   } catch (e) {
    loadError = (e && e.message) || "tarmoq xatosi";
   }
   // ⚠️ BUG FIX: ilgari bu funksiya faqat ichki `loaded` o'zgaruvchisini
   // yangilardi, `window.__CRM_KV_LOADED__` esa sahifa ochilgandagi qiymatida
   // (false) qolib ketardi. Login ekranida yuklash tabiiy ravishda
   // muvaffaqiyatsiz bo'ladi (sessiya hali yo'q), shuning uchun kirgandan
   // KEYIN ham saqlash to'silib turardi: qizil "SAQLASH o'chirildi" chizig'i
   // chiqar, o'zgarishlar serverga ketmasdi. Endi bayroq shu yerda ham
   // yangilanadi.
   window.__CRM_KV_LOADED__ = loaded;
   window.__CRM_KV_ERROR__ = loadError;
   if (loaded && typeof window.hideDataLockBanner === "function") {
     try { window.hideDataLockBanner(); } catch (e2) {}
   }
   return loaded;
  }

  // crmBoot va doLogin shu orqali chaqiradi (sessiya tayyor bo'lgach).
  window.__CRM_HYDRATE__ = hydrateFromServer;
  if (DEMO) loaded = true;

  window.__CRM_KV_LOADED__ = loaded;
  window.__CRM_KV_ERROR__ = loadError;
  if (!loaded && !DEMO) {
    // Login ekranida sessiya hali yo'q — bu XATO emas, oddiy holat.
    // Kirgandan keyin __CRM_HYDRATE__() qayta yuklaydi. Shu sababli konsolni
    // qizil xato bilan to'ldirmaymiz.
    if (!loadError || loadError === "sessiya yo'q") {
      // Sahifa endi ochildi: ma'lumot kirgandan keyin (__CRM_HYDRATE__)
      // yuklanadi. Bu xato emas — konsolni qizil satr bilan to'ldirmaymiz.
      console.info("[CRM] Ma'lumot kirgandan keyin yuklanadi.");
    } else {
      console.error(
        "[CRM] Backend'dan ma'lumot yuklanmadi (" +
          loadError +
          "). Ma'lumot o'chib ketmasligi uchun SAQLASH vaqtincha o'chirildi.",
      );
    }
  }

  // ── 3. Yozish/o'chirishni backend ga proxy qilish ────────────────────────────
  var _set = Storage.prototype.setItem;
  var _rem = Storage.prototype.removeItem;
  var _clr = Storage.prototype.clear;

  function sync(key, value) {
    if (DEMO) return; // Demo: o'zgarish faqat shu oynada qoladi
    if (isClientOnly(key)) return; // Auth kalitlarini backend'ga YOZMA
    // Boshlang'ich yuklash muvaffaqiyatsiz bo'lgan bo'lsa — CRM ma'lumotini
    // serverga YOZMAYMIZ, aks holda bo'sh/eskirgan nusxa bazani bosib ketadi.
    if (!window.__CRM_KV_LOADED__ && key === CRM_KEY) {
      console.warn("[CRM] Saqlash to'sildi: ma'lumot hali yuklanmagan");
      return;
    }
    // Bu kalitni hozir o'zimiz yozdik — grace oynasini belgilaymiz.
    try { window.__CRM_LAST_WRITE__[key] = Date.now(); } catch (e) {}
    try {
      fetch(_API + "/api/kv", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-client-id": CLIENT_ID,
        },
        body: JSON.stringify({ key: key, value: value }),
      }).catch(function () {});
    } catch (e) {}
  }

  localStorage.setItem = function (k, v) {
    _set.call(localStorage, k, v);
    sync(k, v);
  };

  localStorage.removeItem = function (k) {
    _rem.call(localStorage, k);
    sync(k, null);
  };

  localStorage.clear = function () {
    // Auth kalitlarini saqlab qolamiz — faqat CRM kalitlarini tozalaymiz
    var savedAuth = {};
    CLIENT_ONLY_KEYS.forEach(function (k) {
      try {
        var v = Storage.prototype.getItem.call(localStorage, k);
        if (v !== null) savedAuth[k] = v;
      } catch (e) {}
    });

    _clr.call(localStorage);

    // Auth kalitlarini qayta yozamiz
    Object.keys(savedAuth).forEach(function (k) {
      try {
        Storage.prototype.setItem.call(localStorage, k, savedAuth[k]);
      } catch (e) {}
    });

    // Backend'da faqat CRM kalitlarini tozalaymiz
    if (!DEMO) {
      try {
        fetch(_API + "/api/kv/clear", { method: "POST" }).catch(function () {});
      } catch (e) {}
    }
  };

  window.__BACKEND_STORAGE__ = true;
})();
