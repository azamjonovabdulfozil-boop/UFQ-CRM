/**
 * secure-auth.js — Mijoz tomonidagi sessiya qatlami.
 *
 * ⚠️ NIMA O'ZGARDI
 * Ilgari kirish TO'LIQ brauzerda tekshirilardi: `/api/users` barcha loginlarni
 * PAROLI BILAN qaytarardi va JS ularni solishtirardi. Demak:
 *   • parolni ko'rish uchun sayt kodini ochish kifoya edi;
 *   • `localStorage.edumanage_auth_v10` ni qo'lda `{"role":"Super Admin"}`
 *     deb yozib, admin bo'lib olish mumkin edi;
 *   • API hech kimdan hech narsa so'ramasdi.
 *
 * Endi: parol serverga yuboriladi, server imzolangan access token beradi va
 * HAR BIR /api/ so'rovi shu token bilan ketadi. Rol ham serverda tekshiriladi —
 * localStorage ni tahrirlash hech narsa bermaydi.
 *
 * Token qayerda saqlanadi?
 *   access token  — faqat XOTIRADA (o'zgaruvchida). localStorage'da emas,
 *                   chunki XSS uni o'sha zahoti o'g'irlagan bo'lardi.
 *   refresh token — httpOnly cookie'da (JS umuman ko'ra olmaydi).
 * Sahifa yangilanganda access token yo'qoladi va cookie orqali tiklanadi.
 */
(function () {
  "use strict";

  var API =
    typeof __API_BASE__ !== "undefined" && __API_BASE__ ? __API_BASE__ : "";

  var AUTH_KEY = "edumanage_auth_v10";

  var state = {
    accessToken: null,
    expiresAt: 0, // ms
    csrfToken: null,
    user: null,
    refreshing: null, // bir vaqtda bitta yangilash (parallel 401 larni birlashtiradi)
    // Server "sessiya yo'q" deb javob bergani. Shundan keyin token so'rab
    // serverni bezovta qilmaymiz — pastdagi izohga qarang.
    noSession: false,
    // Sahifa ochilgandan beri kamida bir marta yangilashga urinib ko'rildimi.
    attempted: false,
  };

  // ── QURILMA IDENTIFIKATORI ─────────────────────────────────────────────────
  // Server noto'g'ri parol urinishlarini IP emas, QURILMA bo'yicha hisoblaydi
  // (bitta Wi-Fi ortida o'nlab odam bo'lishi mumkin). Cookie o'chirilgan yoki
  // cross-site rejimda kelmasa — shu sarlavha qurilmani tanitadi.
  var DEV_KEY = "edu_device_id";
  var deviceId = (function () {
    try {
      var v = localStorage.getItem(DEV_KEY);
      if (v && /^[A-Za-z0-9_-]{16,64}$/.test(v)) return v;
    } catch (e) {}
    var buf = new Uint8Array(18);
    (window.crypto || {}).getRandomValues
      ? window.crypto.getRandomValues(buf)
      : buf.forEach(function (_, i) {
          buf[i] = Math.floor(Math.random() * 256);
        });
    var id = "d_";
    for (var i = 0; i < buf.length; i++) id += "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_"[buf[i] % 64];
    try {
      localStorage.setItem(DEV_KEY, id);
    } catch (e) {}
    return id;
  })();

  // Cross-site rejimda (portal Vercel'da, backend Render'da) cookie
  // ishlamasligi mumkin — server refresh tokenni javobda ham beradi.
  var RT_KEY = "edu_rt_fallback";
  function saveFallbackRt(t) {
    try {
      if (t) sessionStorage.setItem(RT_KEY, t);
    } catch (e) {}
  }
  function readFallbackRt() {
    try {
      return sessionStorage.getItem(RT_KEY) || null;
    } catch (e) {
      return null;
    }
  }
  function clearFallbackRt() {
    try {
      sessionStorage.removeItem(RT_KEY);
    } catch (e) {}
  }

  // Asl fetch — o'ramaga tushmasin (cheksiz rekursiya bo'lmasin)
  var rawFetch = window.fetch ? window.fetch.bind(window) : null;

  // ── Demo rejimi ────────────────────────────────────────────────────────────
  // Portfolio uchun iframe'da CRM tarmoqdan uzilgan holda ishlaydi (demo-mode.js).
  // U yerda server ham, ma'lumot ham yo'q — sessiyani tekshirishning ma'nosi
  // yo'q. Bu HIMOYANI ZAIFLASHTIRMAYDI: demo rejimda hech qanday so'rov
  // serverga umuman chiqmaydi, ya'ni ko'rsatiladigan ma'lumot ham bo'sh.
  var DEMO = window.__CRM_DEMO__ === true;
  if (DEMO) {
    var demoUser = {
      username: "demo",
      name: "Demo",
      role: "admin",
      legacyRole: "Super Admin",
      mentorName: null,
      studentId: null,
      studentName: null,
      mustChangePassword: false,
    };
    window.CRMAuth = {
      login: function () { return Promise.resolve({ ok: true, user: demoUser }); },
      logout: function () { return Promise.resolve(); },
      refresh: function () { return Promise.resolve(true); },
      getToken: function () { return Promise.resolve(null); },
      tokenSync: function () { return null; },
      changePassword: function () { return Promise.resolve({ ok: false, error: "Demo rejim" }); },
      restore: function () { return Promise.resolve(demoUser); },
      user: function () { return demoUser; },
      role: function () { return "admin"; },
      isLoggedIn: function () { return true; },
      streamUrl: function () { return Promise.resolve(""); },
      onExpired: function () {},
      _clear: function () {},
    };
    return;
  }

  /**
   * Serverdagi sessiyadan qolgan "belgi" cookie'si bor-yo'qligi.
   *
   * Refresh cookie httpOnly — JS uni ko'rmaydi, shuning uchun ilgari sessiya
   * bor-yo'qligini bilishning yagona yo'li serverga so'rov yuborish edi:
   * login qilinmagan HAR BIR tashrifda konsolda `POST /api/auth/refresh 401`
   * chiqardi. Server endi refresh cookie bilan birga oddiy (sirsiz) belgi
   * cookie'sini ham qo'yadi — u yo'q bo'lsa, so'rov umuman yuborilmaydi.
   */
  function hasSessionHint() {
    try {
      if (document.cookie.indexOf("edu_has_session=1") !== -1) return true;
    } catch (e) {}
    // Cross-site rejimda cookie kelmasligi mumkin — zaxira token bo'lsa,
    // sessiya bor deb hisoblaymiz.
    return !!readFallbackRt();
  }

  function apiUrl(path) {
    return /^https?:/i.test(path) ? path : API + path;
  }

  function applySession(data) {
    state.noSession = false;
    state.accessToken = data.accessToken || null;
    state.expiresAt = Date.now() + (Number(data.expiresIn || 900) - 30) * 1000;
    state.csrfToken = data.csrfToken || state.csrfToken;
    state.user = data.user || state.user;
    if (data.refreshToken) saveFallbackRt(data.refreshToken);
    if (state.user) writeLegacyAuth(state.user);
    return state.user;
  }

  function clearSession() {
    state.noSession = true;
    state.accessToken = null;
    state.expiresAt = 0;
    state.csrfToken = null;
    state.user = null;
    clearFallbackRt();
    try {
      Storage.prototype.removeItem.call(localStorage, AUTH_KEY);
    } catch (e) {}
    try {
      sessionStorage.removeItem(AUTH_KEY);
    } catch (e) {}
  }

  /**
   * Mavjud UI kodi `edumanage_auth_v10` dan foydalanadi (rol, ism, studentId).
   * Uni to'ldirib turamiz — LEKIN endi bu faqat KO'RINISH uchun. Haqiqiy
   * ruxsat serverda, tokendagi rol bo'yicha beriladi; bu yerni tahrirlash
   * hech qanday qo'shimcha huquq bermaydi.
   */
  function writeLegacyAuth(user) {
    var obj = {
      loggedIn: true,
      name: user.name,
      role: user.legacyRole || "Talaba",
      mentorName: user.mentorName || null,
      studentId: user.studentId || null,
      studentName: user.studentName || null,
      username: user.username,
      mustChangePassword: !!user.mustChangePassword,
    };
    var str = JSON.stringify(obj);
    try {
      Storage.prototype.setItem.call(localStorage, AUTH_KEY, str);
    } catch (e) {}
    try {
      sessionStorage.setItem(AUTH_KEY, str);
    } catch (e) {}
  }

  // ── Server bilan muloqot ───────────────────────────────────────────────────

  function postJson(path, body, extraHeaders) {
    var h = { "Content-Type": "application/json", "X-Device-Id": deviceId };
    if (extraHeaders) for (var k in extraHeaders) h[k] = extraHeaders[k];
    return rawFetch(apiUrl(path), {
      method: "POST",
      credentials: "include", // refresh cookie shu bilan boradi
      headers: h,
      body: JSON.stringify(body || {}),
    });
  }

  /** Kirish. @returns {Promise<{ok:boolean, user?:object, error?:string, code?:string}>} */
  function login(username, password) {
    state.noSession = false; // yangi urinish — eski "sessiya yo'q" holati bekor
    return postJson("/api/auth/login", { username: username, password: password })
      .then(function (r) {
        return r.json().then(function (d) {
          return { status: r.status, d: d };
        });
      })
      .then(function (res) {
        if (!res.d || !res.d.ok) {
          state.noSession = true; // kirilmadi — token so'rab yurmaymiz
          return {
            ok: false,
            code: (res.d && res.d.code) || "error",
            error: (res.d && res.d.error) || "Kirishda xatolik",
            retryAfter: res.d && res.d.retryAfter,
            attemptsLeft: res.d && res.d.attemptsLeft,
          };
        }
        var user = applySession(res.d);
        return { ok: true, user: user };
      })
      .catch(function () {
        return { ok: false, code: "network", error: "Serverga ulanib bo'lmadi" };
      });
  }

  /**
   * Access tokenni yangilash. Parallel chaqiruvlar bitta so'rovga birlashadi.
   *
   * ⚠️ BUG FIX — "401 lar shovqini" va o'z-o'zini bloklash.
   * Ilgari sessiya yo'q bo'lsa ham HAR BIR /api/ so'rovi avval
   * `/api/auth/refresh` ga borardi. Login qilinmagan sahifada bir nechta modul
   * (coin-system, backend-storage, live-sync…) bir vaqtda uyg'onadi — natijada
   * konsolda o'nlab `401 (Unauthorized)` chiqar, yomoni: server login
   * cheklovini oshirib yuborib, foydalanuvchini 15 daqiqaga BLOKLAB qo'yardi.
   *
   * Endi server bir marta "sessiya yo'q" desa, `state.noSession` yoqiladi va
   * keyingi urinishlar tarmoqqa umuman chiqmaydi. Bayroq faqat haqiqiy
   * kirishda (login) yoki `restore({force:true})` da tozalanadi.
   */
  function refresh(force) {
    if (state.refreshing) return state.refreshing;
    if (state.noSession && !force) return Promise.resolve(false);

    var body = {};
    var rt = readFallbackRt();
    if (rt) body.refreshToken = rt;

    state.attempted = true;
    state.refreshing = postJson("/api/auth/refresh", body)
      .then(function (r) {
        return r.json().catch(function () {
          return {};
        });
      })
      .then(function (d) {
        if (d && d.ok) {
          applySession(d);
          return true;
        }
        clearSession(); // state.noSession = true — boshqa urinmaymiz
        return false;
      })
      .catch(function () {
        // Tarmoq uzilgan bo'lishi mumkin — "sessiya yo'q" deb hisoblamaymiz,
        // aks holda internet qaytganda ham qayta ulanmasdi.
        return false;
      })
      .then(function (v) {
        state.refreshing = null;
        return v;
      });

    return state.refreshing;
  }

  /** Yaroqli access token qaytaradi (kerak bo'lsa yangilaydi). */
  function getToken() {
    if (state.accessToken && Date.now() < state.expiresAt)
      return Promise.resolve(state.accessToken);
    if (state.noSession) return Promise.resolve(null); // login qilinmagan
    return refresh().then(function (ok) {
      return ok ? state.accessToken : null;
    });
  }

  function logout() {
    var rt = readFallbackRt();
    var csrf = state.csrfToken;
    clearSession();
    return postJson("/api/auth/logout", { refreshToken: rt }, csrf ? { "X-CSRF-Token": csrf } : null).catch(
      function () {},
    );
  }

  function changePassword(currentPassword, newPassword) {
    return getToken()
      .then(function (t) {
        return postJson(
          "/api/auth/change-password",
          { currentPassword: currentPassword, newPassword: newPassword },
          t ? { Authorization: "Bearer " + t } : null,
        );
      })
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        if (d && d.ok) applySession(d);
        return d;
      })
      .catch(function () {
        return { ok: false, error: "Serverga ulanib bo'lmadi" };
      });
  }

  // ── Sessiya tugaganda ──────────────────────────────────────────────────────
  var onExpiredCbs = [];
  function handleExpired() {
    clearSession();
    onExpiredCbs.forEach(function (cb) {
      try {
        cb();
      } catch (e) {}
    });
  }

  // ── fetch o'ramasi: har bir /api/ so'roviga token qo'shiladi ────────────────
  //
  // Bu qatlam backend-storage.js ning o'ramasidan OLDIN o'rnatiladi, shuning
  // uchun mavjud yuzlab `fetch("/api/...")` chaqiruvlarini birma-bir
  // o'zgartirish shart emas — hammasi avtomatik himoyalanadi.
  /** Tarmoqqa chiqmasdan 401 javob — "hali kirilmagan" holati uchun. */
  function notAuthorized() {
    var body = JSON.stringify({ ok: false, code: "no-session", error: "Avtorizatsiya talab qilinadi" });
    return Promise.resolve(
      new Response(body, { status: 401, headers: { "Content-Type": "application/json" } }),
    );
  }

  if (rawFetch) {
    window.fetch = function (input, init) {
      var isStr = typeof input === "string";
      var url = isStr ? input : input && input.url;

      // /api/ bo'lmagan yoki autentifikatsiyaning o'zi bo'lgan so'rovlarga tegmaymiz
      if (!url || url.indexOf("/api/") === -1 || url.indexOf("/api/auth/") !== -1)
        return rawFetch(input, init);

      return getToken().then(function (token) {
        // Sessiya yo'q — so'rovni umuman yubormaymiz. Server baribir 401
        // qaytarardi; bu esa konsolni to'ldirar va login cheklovini yeb
        // qo'yardi. Modullar uchun javob shakli o'zgarmaydi.
        if (!token && state.noSession) return notAuthorized();

        var opts = init ? Object.assign({}, init) : {};
        opts.credentials = opts.credentials || "include";
        var h = new Headers(opts.headers || (!isStr && input && input.headers) || {});
        h.set("X-Device-Id", deviceId);
        if (token && !h.has("Authorization")) h.set("Authorization", "Bearer " + token);
        if (state.csrfToken && !h.has("X-CSRF-Token")) h.set("X-CSRF-Token", state.csrfToken);
        opts.headers = h;

        return rawFetch(isStr ? input : input.url, opts).then(function (r) {
          // 401 — token eskirgan bo'lishi mumkin: bir marta yangilab qayta urinamiz
          if (r.status === 401 && token) {
            return refresh().then(function (ok) {
              if (!ok) {
                handleExpired();
                return r;
              }
              var h2 = new Headers(opts.headers);
              h2.set("Authorization", "Bearer " + state.accessToken);
              if (state.csrfToken) h2.set("X-CSRF-Token", state.csrfToken);
              return rawFetch(isStr ? input : input.url, Object.assign({}, opts, { headers: h2 }));
            });
          }
          if (r.status === 401) handleExpired();
          return r;
        });
      });
    };
  }

  // ── Ochiq interfeys ────────────────────────────────────────────────────────
  window.CRMAuth = {
    login: login,
    logout: logout,
    refresh: refresh,
    getToken: getToken,
    /** Xotiradagi yaroqli token (sinxron). backend-storage.js shuni ishlatadi. */
    tokenSync: function () {
      return state.accessToken && Date.now() < state.expiresAt ? state.accessToken : null;
    },
    changePassword: changePassword,
    /**
     * Sahifa ochilganda cookie orqali sessiyani tiklaydi.
     * Token allaqachon yaroqli bo'lsa — serverga bekorga bormaydi (har
     * chaqiruv refresh tokenni almashtiradi, ortiqcha almashtirish kerak emas).
     */
    restore: function (opts) {
      if (state.accessToken && Date.now() < state.expiresAt)
        return Promise.resolve(state.user);
      // Sahifa ochilishida bir marta MAJBURIY urinamiz: cookie bor-yo'qligini
      // faqat shu yo'l bilan bilib bo'ladi. Muvaffaqiyatsiz bo'lsa noSession
      // yoqiladi va boshqa hech bir modul serverni bezovta qilmaydi.
      // Sahifa ochilishida BIR MARTA majburiy urinamiz (cookie bor-yo'qligini
      // faqat shunday bilib bo'ladi). Urinib bo'lingan bo'lsa — takrorlamaymiz.
      var force = opts && typeof opts.force === "boolean" ? opts.force : !state.attempted;
      // Sessiya belgisi yo'q — hech qachon kirilmagan yoki chiqib ketilgan.
      // Serverga bekorga bormaymiz (konsolda 401 chiqmaydi).
      if (!hasSessionHint()) {
        state.noSession = true;
        state.attempted = true;
        return Promise.resolve(null);
      }
      return refresh(force).then(function (ok) {
        return ok ? state.user : null;
      });
    },
    user: function () {
      return state.user;
    },
    role: function () {
      return state.user ? state.user.role : null;
    },
    isLoggedIn: function () {
      return !!state.user;
    },
    /** SSE (EventSource) sarlavha qo'sha olmaydi — token manzilga qo'shiladi. */
    streamUrl: function (path) {
      return getToken().then(function (t) {
        return apiUrl(path) + (t ? (path.indexOf("?") < 0 ? "?" : "&") + "access_token=" + encodeURIComponent(t) : "");
      });
    },
    onExpired: function (cb) {
      if (typeof cb === "function") onExpiredCbs.push(cb);
    },
    _clear: clearSession,
  };
})();
