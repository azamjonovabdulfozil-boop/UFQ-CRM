/**
 * DEMO REJIMI — portfolio saytidagi iframe uchun xavfsiz, namunaviy CRM.
 * ---------------------------------------------------------------------
 * Muammo: bu CRM ma'lumotni UMUMIY serverda saqlaydi. Portfoliodagi demoni
 * ochgan har qanday mehmon o'quvchi qo'shsa yoki to'lov yozsa — u haqiqiy
 * bazaga tushib, hammaga ko'rinardi. Va aksincha: mehmonga markazning
 * real ma'lumotlari ko'rinib turardi.
 *
 * Yechim: demo rejimida CRM serverdan UZILADI va o'rniga shu fayldagi
 * NAMUNAVIY ma'lumot bilan ishlaydi:
 *   • hech qanday `/api/...` so'rovi tarmoqqa chiqmaydi — real ma'lumot
 *     na o'qiladi, na yoziladi;
 *   • tizim to'ldirilgan holda ochiladi (kurslar, guruhlar, mentorlar,
 *     talabalar, to'lovlar) — lekin bularning hammasi o'ylab topilgan;
 *   • mehmon HAR BIR portalga `admin` / `admin123` bilan kiradi va o'sha
 *     portalning roliga (Admin / Mentor / Talaba) tushadi;
 *   • login oynasi ostida shu login-parol yozib qo'yiladi;
 *   • mehmon qo'shgan narsa faqat o'sha oynada yashaydi va sahifa
 *     yangilanishi bilan yo'qoladi — demo har safar bir xil holatdan
 *     boshlanadi.
 *
 * MUHIM: bularning hammasi FAQAT demo rejimida ishlaydi. CRM'ni brauzerda
 * odatdagidek ochganda bu fayl birinchi qatorda chiqib ketadi — na login
 * yozuvi, na namunaviy ma'lumot ko'rinadi, na bironta so'rov to'siladi.
 *
 * Bu fayl `index.html` da MODUL skriptdan OLDIN, oddiy `<script>` sifatida
 * ulanadi: modullar kechiktirilgan (deferred) ishga tushadi, shuning uchun
 * to'siq ilovaning birinchi qatoridan ham oldin o'rnatiladi.
 *
 * Demo rejimi qachon yoqiladi:
 *   1. manzilda `?demo=1` bo'lsa (portfolio havolalari shunday),
 *   2. sahifa iframe ichida ochilgan bo'lsa.
 */
(function () {
  'use strict';

  var isDemo = false;
  try {
    isDemo = /(^|[?&])demo=1(&|$)/.test(window.location.search) || window.top !== window.self;
  } catch (e) {
    // `window.top` ga murojaat xato bersa — demak boshqa domendagi
    // iframe ichidamiz, ya'ni bu ham demo
    isDemo = true;
  }

  window.__CRM_DEMO__ = isDemo;

  // Demo namunaviy ma'lumot joylaganini bildiruvchi belgi
  var SEED_MARK = '__crm_demo_seeded';

  /*
   * Demo va haqiqiy CRM bitta manzilda (origin) yashaydi, ya'ni ular BITTA
   * `localStorage` ni bo'lishadi. Mehmon avval demoni ochib, keyin xuddi shu
   * brauzerda haqiqiy CRM'ga kirsa — demo ma'lumoti o'sha yerda qolib,
   * birinchi saqlashdayoq REAL serverga yozilib ketardi. Shuning uchun
   * oddiy rejimda demodan qolgan hamma narsa avval tozalanadi.
   */
  if (!isDemo) {
    try {
      if (window.localStorage.getItem(SEED_MARK) !== null) {
        Storage.prototype.clear.call(window.localStorage);
        try {
          Storage.prototype.clear.call(window.sessionStorage);
        } catch (e) {}
      }
    } catch (e) {}
    return;
  }

  var DEMO_LOGIN = 'admin';
  var DEMO_PASS = 'admin123';

  /* --------------------------------------------------------- qaysi portal? */

  /*
   * Uchala ilova bir xil kodni ishlatadi, lekin har biri FAQAT o'z rolini
   * qabul qiladi (`crmBoot.js` → `guardRole`). Shuning uchun bitta login
   * uchala portalda ham ishlashi uchun hisobning ROLI portalga qarab
   * tanlanadi. Portal `<title>` dan aniqlanadi — u router sarlavhani
   * o'zgartirishidan oldin o'qiladi; zaxira sifatida manzil tekshiriladi.
   */
  var PORTAL = (function () {
    var title = (document.title || '').toLowerCase();
    var host = (window.location.hostname + window.location.pathname).toLowerCase();
    if (title.indexOf('talaba') !== -1 || host.indexOf('student') !== -1) return 'student';
    if (title.indexOf('mentor') !== -1 || host.indexOf('mentor') !== -1) return 'mentor';
    return 'admin';
  })();

  /* ------------------------------------------------- 1. bo'sh holatdan boshlash */

  /*
   * Oldingi tashrifdan qolgan narsa bo'lmasin: har bir yuklanishda ombor
   * tozalanadi. `Storage.prototype` orqali chaqiramiz — backend-storage.js
   * `localStorage.clear` ni o'rab, serverga tozalash so'rovini yuboradi,
   * bu yerda esa serverga umuman tegmaymiz.
   */
  try {
    Storage.prototype.clear.call(window.localStorage);
  } catch (e) {}
  try {
    Storage.prototype.clear.call(window.sessionStorage);
  } catch (e) {}

  /* ------------------------------------------------------ 2. namunaviy ma'lumot */

  /** Bugundan `n` kun oldingi sana — `2026-09-05` ko'rinishida */
  function daysAgo(n) {
    var d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }

  var MENTORS = [
    {
      id: 201,
      name: 'Sardor Rahimov',
      phone: '+998 90 111 22 33',
      subject: 'Frontend',
      experience: '5 yil',
      age: '29',
      email: 'sardor@demo.uz',
      telegram: '@sardor_demo',
      address: 'Toshkent',
      joinDate: daysAgo(420),
      resume: 'Vue va React bo‘yicha 5 yillik tajriba.',
    },
    {
      id: 202,
      name: 'Nilufar Qodirova',
      phone: '+998 90 444 55 66',
      subject: 'Backend',
      experience: '4 yil',
      age: '27',
      email: 'nilufar@demo.uz',
      telegram: '@nilufar_demo',
      address: 'Samarqand',
      joinDate: daysAgo(300),
      resume: 'Node.js va PostgreSQL yo‘nalishida mentor.',
    },
  ];

  var COURSES = [
    { id: 101, name: 'Frontend Development', duration: '8 oy', price: '1 200 000', status: 'Faol' },
    { id: 102, name: 'Backend Development', duration: '10 oy', price: '1 400 000', status: 'Faol' },
    { id: 103, name: 'UI/UX Design', duration: '6 oy', price: '1 000 000', status: 'Faol' },
  ];

  var GROUPS = [
    {
      id: 301, name: 'FE-1', courseId: 101, mentorId: 201, status: 'Faol',
      startDate: daysAgo(90), days: ['Du', 'Ch', 'Ju'], room: '12',
      timeStart: '09:00', timeEnd: '11:00', telegramChatId: '',
    },
    {
      id: 302, name: 'BE-1', courseId: 102, mentorId: 202, status: 'Faol',
      startDate: daysAgo(60), days: ['Se', 'Pa', 'Sh'], room: '14',
      timeStart: '14:00', timeEnd: '16:00', telegramChatId: '',
    },
    {
      id: 303, name: 'UX-1', courseId: 103, mentorId: 201, status: 'Faol',
      startDate: daysAgo(30), days: ['Du', 'Ch'], room: '9',
      timeStart: '18:00', timeEnd: '20:00', telegramChatId: '',
    },
  ];

  /** Talaba yozuvini qisqa yozish uchun */
  function student(id, first, last, groupId, isDebtor, joined) {
    return {
      id: id,
      firstName: first,
      lastName: last,
      name: first + ' ' + last,
      phone: '+998 90 ' + (100 + (id % 800)) + ' 00 00',
      joinDate: daysAgo(joined),
      birthDate: '2004-0' + ((id % 8) + 1) + '-15',
      parentName: 'Ota-ona (demo)',
      parentPhone: '+998 90 000 00 00',
      groupId: groupId,
      status: 'Aktiv',
      isDebtor: !!isDebtor,
      source: 'Instagram',
      notes: '',
    };
  }

  var STUDENTS = [
    student(401, 'Jasur', 'Mirzayev', 301, false, 85),
    student(402, 'Dilnoza', 'Karimova', 301, false, 80),
    student(403, 'Bekzod', 'Tursunov', 301, true, 70),
    student(404, 'Malika', 'Yusupova', 302, false, 55),
    student(405, 'Aziz', 'Sobirov', 302, false, 50),
    student(406, 'Kamola', 'Ergasheva', 302, true, 40),
    student(407, 'Shahzod', 'Nazarov', 303, false, 25),
    student(408, 'Zilola', 'Ismoilova', 303, false, 20),
  ];

  /** To'lov yozuvi */
  function tx(id, type, title, amount, studentId, ago) {
    var date = new Date();
    date.setDate(date.getDate() - ago);
    return {
      id: id,
      type: type,
      title: title,
      description: '',
      amount: amount,
      date: date.toISOString(),
      studentId: studentId,
      createdAt: date.toISOString(),
    };
  }

  var FINANCE = [
    tx(501, 'income', 'Oylik to‘lov — Jasur Mirzayev', 1200000, 401, 12),
    tx(502, 'income', 'Oylik to‘lov — Dilnoza Karimova', 1200000, 402, 11),
    tx(503, 'income', 'Oylik to‘lov — Malika Yusupova', 1400000, 404, 8),
    tx(504, 'expense', 'Ijara to‘lovi', 4500000, null, 6),
    tx(505, 'income', 'Oylik to‘lov — Shahzod Nazarov', 1000000, 407, 3),
    tx(506, 'expense', 'Internet va kommunal', 850000, null, 2),
  ];

  var DEMO_DATA = {
    nextId: 900,
    courses: COURSES,
    groups: GROUPS,
    mentors: MENTORS,
    students: STUDENTS,
    attendance: {},
    finance: FINANCE,
    gradingCriteria: {},
    grades: {},
    simpleGrades: {},
    tests: [],
    testResults: {},
  };

  /* --------------------------------------------- portalga mos demo hisoblari */

  // Mentor va talaba hisoblari: parol OCHIQ matnda — `doLogin()` xesh bilan
  // bir qatorda ochiq matnni ham qabul qiladi (eski hisoblar bilan moslik).
  var DEMO_MENTOR_USERS = [];
  var DEMO_STUDENT_USERS = [];

  if (PORTAL === 'mentor') {
    DEMO_MENTOR_USERS.push({
      login: DEMO_LOGIN, pass: DEMO_PASS, name: MENTORS[0].name,
      role: 'Mentor', mentorId: String(MENTORS[0].id), mentorName: MENTORS[0].name,
    });
  } else if (PORTAL === 'student') {
    DEMO_STUDENT_USERS.push({
      login: DEMO_LOGIN, pass: DEMO_PASS, name: STUDENTS[0].name,
      role: 'Talaba', studentId: STUDENTS[0].id, studentName: STUDENTS[0].name,
    });
  }

  /*
   * `getUsers()` ro'yxatni ADMIN hisobidan boshlaydi. Mentor va talaba
   * portallarida `admin` shu birinchi yozuvga tushib, "Super Admin" roli
   * bilan qaytardi — `guardRole` esa uni darhol chiqarib yuborardi.
   * Shuning uchun bu portallarda admin hisobiga boshqa login beramiz.
   */
  var ADMIN_CRED =
    PORTAL === 'admin'
      ? { login: DEMO_LOGIN, pass: DEMO_PASS }
      : { login: '__demo_superadmin__', pass: Math.random().toString(36).slice(2) };

  function seed(key, value) {
    try {
      Storage.prototype.setItem.call(window.localStorage, key, JSON.stringify(value));
    } catch (e) {}
  }

  seed(SEED_MARK, 1);
  seed('edumanage_crm_v8', DEMO_DATA);
  seed('edumanage_mentor_users_v8', DEMO_MENTOR_USERS);
  seed('edumanage_student_users_v9', DEMO_STUDENT_USERS);
  seed('edumanage_admin_cred_v1', ADMIN_CRED);

  /* ------------------------------------------------ 3. serverdan uzib qo'yish */

  var isApi = function (url) {
    return typeof url === 'string' && url.indexOf('/api/') !== -1;
  };

  /**
   * Har bir `/api/` yo'li uchun demo javobi — ilova kutgan SHAKLDA.
   * Shakl noto'g'ri bo'lsa ilova xato beradi, shuning uchun yo'llar
   * birma-bir yozilgan.
   */
  function demoPayload(url) {
    if (url.indexOf('/api/users') !== -1) {
      return { ok: true, mentors: DEMO_MENTOR_USERS, students: DEMO_STUDENT_USERS };
    }
    // Ombor (KV) bo'sh qaytadi — yuqorida joylangan namunaviy ma'lumot
    // ustidan hech nima yozilmasin
    if (url.indexOf('/api/kv') !== -1) return { ok: true, data: {} };
    // `/api/data` uchun `ok:false` — syncFromBackend() shu javobda darhol
    // ortga qaytadi va sahifadagi namunaviy holatni tegmasdan qoldiradi
    if (url.indexOf('/api/data') !== -1) return { ok: false };
    if (url.indexOf('/api/rev') !== -1) return { ok: true, rev: 0 };
    if (url.indexOf('/api/coins') !== -1) return { ok: true, coins: {} };
    return { ok: false, demo: true };
  }

  // ── fetch ──────────────────────────────────────────────────────────────────
  var _fetch = window.fetch ? window.fetch.bind(window) : null;
  if (_fetch) {
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : input && input.url;
      if (isApi(url)) {
        var body = JSON.stringify(demoPayload(url));
        return Promise.resolve(
          new Response(body, {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      return _fetch(input, init);
    };
  }

  // ── XMLHttpRequest ─────────────────────────────────────────────────────────
  // backend-storage.js ombordan ma'lumot olishda SINXRON XHR ishlatadi —
  // faqat `fetch` ni to'sish yetarli emas.
  var _open = XMLHttpRequest.prototype.open;
  var _send = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this.__demoUrl = url;
    if (isApi(url)) {
      this.__demoBlocked = true;
      return; // haqiqiy ulanish ochilmaydi
    }
    return _open.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    if (!this.__demoBlocked) return _send.apply(this, arguments);

    var self = this;
    var text = JSON.stringify(demoPayload(String(this.__demoUrl || '')));

    // Sinxron XHR kutilgan joyda javob DARHOL tayyor bo'lishi kerak
    try {
      Object.defineProperty(self, 'readyState', { value: 4, configurable: true });
      Object.defineProperty(self, 'status', { value: 200, configurable: true });
      Object.defineProperty(self, 'responseText', { value: text, configurable: true });
      Object.defineProperty(self, 'response', { value: text, configurable: true });
    } catch (e) {}

    if (typeof self.onreadystatechange === 'function') {
      try {
        self.onreadystatechange();
      } catch (e) {}
    }
    if (typeof self.onload === 'function') {
      try {
        self.onload();
      } catch (e) {}
    }
  };

  // ── EventSource (live-sync) ────────────────────────────────────────────────
  // Realtime oqim ochilsa server bir zumdan keyin haqiqiy ma'lumotni
  // yuborib, namunaviy ekranni bosib ketardi. Demo rejimida oqim yo'q.
  if (window.EventSource) {
    window.EventSource = function () {
      return {
        addEventListener: function () {},
        removeEventListener: function () {},
        close: function () {},
        readyState: 2, // CLOSED — chaqiruvchi zaxira yo'lga o'tadi
        onopen: null,
        onmessage: null,
        onerror: null,
      };
    };
  }

  /* ------------------------------------------- 4. FAQAT KO'RISH (read-only) */

  /*
   * Demoga kirgan mehmon tizimni AYLANIB CHIQSIN, lekin hech narsani
   * o'zgartira olmasin: qo'shish, tahrirlash, o'chirish, davomat belgilash,
   * baho qo'yish, xabar yuborish — hammasi to'xtatiladi.
   *
   * Nega shunchaki "yozuv serverga ketmasin" yetarli emas: mehmon o'quvchi
   * qo'shsa, u ekranda PAYDO BO'LARDI (o'zgarish xotirada bajarilardi) va
   * demo "haqiqiy tizimni buzdim" degan taassurot qoldirardi.
   *
   * To'xtatish nuqtasi — hujjat darajasidagi CAPTURE bosqichidagi tinglovchi.
   * U elementning o'z `onclick` ishlovchisidan OLDIN ishlaydi, shuning uchun
   * `onclick="event.stopPropagation();setAtt(...)"` kabi yozuvlarni ham
   * ushlab qoladi.
   */

  // O'zgartiruvchi ishlovchilar — CRM'ning `onclick`/`onchange` atributlaridan
  // yig'ilgan to'liq ro'yxat.
  var BLOCKED = [
    // saqlash
    'saveModal', 'saveCriteria', 'saveFinTransaction', 'saveAdminCredentials',
    'saveMentorCredentials', 'saveStudentCredentials', 'saveCrmName',
    'saveSimpleGrade', 'saveStudentGoal', 'saveStudentDisplayName',
    'saveTest', 'saveVideo', 'saveStudentGrade', 'saveData',
    // o'chirish
    'delItem', 'deleteCriteria', 'deleteFinTx', 'deleteMentorCredential',
    'deleteSimpleGrade', 'deleteStudentCredential', 'deleteStudentGoal',
    'deleteTest', 'deleteVideo', 'showDelModal', 'executeDelete', 'resetData',
    // qo'shish / tahrirlash oynalari
    'openModal', 'editItem', 'openEditCriteria', 'openEditTest',
    'openAddGradeModal', 'openCreateTestModal', 'openFinModal',
    'openMentorSalaryModal', 'addQuestion', 'addStudentGoal',
    'csOpenAddProduct', 'csOpenSendCoin', 'csSendCoins',
    // boshqa o'zgartirishlar
    'setAtt', 'setMentorGroupStatus', 'markStudentPaid', 'toggleStudentGoal',
    'useSuggestedSalary', 'submitStudentTest', 'startStudentTest',
    'sendStudentMessage', 'sendMentorMessage', 'sendStudentChatPageMsg',
    'detectTelegramChats', 'importTestFromFile', 'handleTestFileImport',
    'handleTestPdfAttach', 'handleVideoFile', 'removeTestPdfAttach',
    'autoExtractTestQuestions',
  ];

  // Ro'yxatdan chetda qolgan yangi funksiyalarni ham ushlaydigan zaxira qoida
  var BLOCKED_RE = /\b(save|delete|del|edit|add|create|remove|reset|import|submit|send)[A-Z_]/;

  // Nomi qoidaga tushsa ham xavfsiz bo'lgan amallar
  var ALLOWED = ['toggleSidebar', 'exportData', 'exportGrades', 'downloadTestPdf',
    'insertChatEmoji', 'doLogin', 'doLogout', 'selectAdminChat'];

  function isBlockedCode(code) {
    if (!code) return false;
    for (var i = 0; i < ALLOWED.length; i++) {
      if (code.indexOf(ALLOWED[i]) !== -1) return false;
    }
    for (var j = 0; j < BLOCKED.length; j++) {
      // `saveModal(` ko'rinishidagi aniq chaqiruv
      if (code.indexOf(BLOCKED[j] + '(') !== -1) return true;
    }
    return BLOCKED_RE.test(code);
  }

  /** Element yoki uning ota-onasidagi to'siladigan ishlovchi */
  function blockedTarget(node) {
    var el = node && node.nodeType === 1 ? node : node && node.parentElement;
    while (el && el !== document.documentElement) {
      var code = (el.getAttribute && (el.getAttribute('onclick') || el.getAttribute('onchange'))) || '';
      if (isBlockedCode(code)) return el;
      el = el.parentElement;
    }
    return null;
  }

  /** Kichik xabar — CRM'ning o'z `toast()` iga bog'lanmaydi */
  var toastTimer = null;
  function demoToast() {
    var box = document.getElementById('__demo_toast');
    if (!box) {
      box = document.createElement('div');
      box.id = '__demo_toast';
      box.style.cssText = [
        'position:fixed', 'left:50%', 'bottom:28px', 'transform:translateX(-50%)',
        'z-index:2147483647', 'padding:12px 18px', 'border-radius:12px',
        'background:#0f172a', 'color:#e2e8f0', 'font-size:14px', 'font-weight:600',
        'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
        'box-shadow:0 12px 34px rgba(0,0,0,.4)', 'border:1px solid rgba(96,165,250,.5)',
        'pointer-events:none', 'opacity:0', 'transition:opacity .18s ease',
        'max-width:min(90vw,420px)', 'text-align:center',
      ].join(';');
      box.textContent = '👁 Demo — bu yerda faqat ko‘rish mumkin';
      document.body.appendChild(box);
    }
    box.style.opacity = '1';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      box.style.opacity = '0';
    }, 2200);
  }

  function guard(event) {
    if (!blockedTarget(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    demoToast();
  }

  // Capture bosqichi — elementning o'z ishlovchisidan oldin
  ['click', 'change', 'submit'].forEach(function (type) {
    document.addEventListener(type, guard, true);
  });

  /*
   * Doimiy belgi: mehmon nima uchun tugmalar "ishlamayotganini" tushunsin.
   * Login oynasida ko'rinmaydi — u yerda allaqachon login/parol yozuvi bor.
   */
  function paintBadge() {
    if (document.getElementById('__demo_badge')) return;
    if (!document.body) return;
    var badge = document.createElement('div');
    badge.id = '__demo_badge';
    badge.textContent = '👁 Demo — faqat ko‘rish';
    badge.style.cssText = [
      'position:fixed', 'right:14px', 'bottom:14px', 'z-index:2147483646',
      'padding:8px 14px', 'border-radius:999px', 'background:rgba(15,23,42,.92)',
      'color:#dbeafe', 'font-size:12px', 'font-weight:700',
      'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
      'border:1px solid rgba(96,165,250,.55)', 'box-shadow:0 6px 20px rgba(0,0,0,.35)',
      'pointer-events:none', 'user-select:none',
    ].join(';');
    document.body.appendChild(badge);
  }

  function syncBadge() {
    var login = document.getElementById('login-screen');
    var loginKorinyapti = login && getComputedStyle(login).display !== 'none';
    var badge = document.getElementById('__demo_badge');
    if (loginKorinyapti) {
      if (badge) badge.style.display = 'none';
      return;
    }
    paintBadge();
    badge = document.getElementById('__demo_badge');
    if (badge) badge.style.display = '';
  }

  /*
   * Ikkinchi qatlam: `saveData()` — CRM'dagi barcha o'zgarishlar shu funksiya
   * orqali saqlanadi. Biror amal to'siqdan o'tib ketsa ham, u na omborga,
   * na serverga yozilmasin.
   */
  window.addEventListener('load', function () {
    if (typeof window.saveData === 'function') {
      window.saveData = function () {};
    }
  });

  /* ------------------------------------ 5. login oynasidagi demo ma'lumotnomasi */

  /*
   * Login formasi Vue tomonidan chiziladi, shuning uchun element darhol
   * mavjud emas. `.login-hint` — o'sha formadagi (odatda bo'sh turadigan)
   * maxsus joy: demo rejimida to'ldiriladi, oddiy saytda esa hech qachon
   * qo'l tegmaydi va bo'shligicha qoladi.
   *
   * Diqqat: "bir marta to'ldirdim" degan bayroqqa ishonib bo'lmaydi —
   * `forms-credentials.js` yuklanishida shu joyni ATAYLAB tozalaydi
   * (`hint.textContent = ""`), ya'ni yozuv jimgina yo'q bo'lardi.
   * Shuning uchun bayroq emas, MAZMUN tekshiriladi: quti bo'shab qolsa
   * kuzatuvchi uni qaytadan to'ldiradi.
   */
  function paintHint() {
    var box = document.querySelector('#login-screen .login-hint');
    if (!box || box.childElementCount > 0) return false;

    /*
     * Uslublar `!important` bilan: `.login-hint` sinfi mayda (11px) va xira
     * (`--text3`) yozuv uchun mo'ljallangan — bu yerdagi yozuv esa mehmon
     * BIRINCHI o'qishi kerak bo'lgan narsa.
     *
     * Ranglar mavzu o'zgaruvchilaridan OLINMAYDI: login oynasining o'zi
     * har doim to'q rangda chiziladi, `--text` esa mavzuga ergashadi —
     * yorug' mavzuda u to'q ko'k bo'lib, to'q fonda o'qilmay qolgan edi.
     */
    box.style.cssText = [
      'margin-top:16px', 'padding:13px 15px', 'border-radius:12px', 'text-align:center',
      'border:1px dashed rgba(96,165,250,.55)', 'background:rgba(96,165,250,.13)',
      'font-family:inherit !important', 'font-size:13px !important',
      'line-height:1.75', 'color:#e2e8f0 !important', 'opacity:1',
    ].join(';');

    var mono = [
      "font-family:'JetBrains Mono',ui-monospace,monospace", 'font-weight:700',
      'font-size:13px', 'padding:2px 8px', 'border-radius:6px',
      'background:rgba(96,165,250,.18)', 'color:#dbeafe',
      'border:1px solid rgba(96,165,250,.65)',
    ].join(';');

    box.innerHTML =
      '<div style="font-weight:800;margin-bottom:6px;color:#93c5fd">' +
      '🔎 Demo rejimi</div>' +
      '<div style="color:#e2e8f0">Login: <span style="' + mono + '">' +
      DEMO_LOGIN + '</span> &nbsp;·&nbsp; Parol: <span style="' + mono + '">' +
      DEMO_PASS + '</span></div>' +
      '<div style="margin-top:6px;font-size:11.5px;color:#a8b6cc">' +
      'Ma’lumotlar namunaviy. O‘zgarishlar saqlanmaydi.</div>';
    return true;
  }

  function watchForLogin() {
    paintHint();
    syncBadge();
    // Login oynasi yopilib-ochilishi mumkin (chiqish → qayta kirish) va
    // boshqa skript yozuvni tozalab ketishi mumkin — shuning uchun
    // kuzatuvchi butun sahifa umri davomida ishlab turadi.
    var observer = new MutationObserver(function () {
      paintHint();
      syncBadge();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchForLogin);
  } else {
    watchForLogin();
  }
})();
