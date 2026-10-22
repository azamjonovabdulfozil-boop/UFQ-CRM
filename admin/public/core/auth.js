// ===================== AUTH (Yagona - Admin + Mentor + Talaba) =====================
// 🔐 BUG FIX: Auth session faqat browser-local saqlanadi (backend KV'ga YOZILMAYDI)
// backend-storage.js ichida CLIENT_ONLY_KEYS ro'yxatida AUTH_KEY mavjud.

const AUTH_KEY = 'edumanage_auth_v10';
const MENTOR_USERS_KEY = 'edumanage_mentor_users_v8';
const STUDENT_USERS_KEY = 'edumanage_student_users_v9';
const ADMIN_CRED_KEY = 'edumanage_admin_cred_v1';

// ── Auth saqlash/o'qish: localStorage + sessionStorage ikki qatlam ─────────────
// localStorage: tab yopilmasa saqlanadi (eslab qolish)
// sessionStorage: tab yopilsa o'chadi (xavfsizroq fallback)

function _authRead() {
  try {
    // Avval localStorage dan o'qi
    const ls = localStorage.getItem(AUTH_KEY);
    if (ls) return JSON.parse(ls);
    // Fallback: sessionStorage
    const ss = sessionStorage.getItem(AUTH_KEY);
    if (ss) return JSON.parse(ss);
  } catch (e) {}
  return {};
}

function _authWrite(obj) {
  const str = JSON.stringify(obj);
  // localStorage.setItem intercepted by backend-storage — lekin CLIENT_ONLY_KEYS
  // ro'yxatida bo'lgani uchun backend'ga YOZILMAYDI, faqat local qoladi.
  try { Storage.prototype.setItem.call(localStorage, AUTH_KEY, str); } catch (e) {}
  // sessionStorage ga ham yoz — qo'shimcha xavfsizlik
  try { sessionStorage.setItem(AUTH_KEY, str); } catch (e) {}
}

function _authDelete() {
  try { Storage.prototype.removeItem.call(localStorage, AUTH_KEY); } catch (e) {}
  try { sessionStorage.removeItem(AUTH_KEY); } catch (e) {}
}

// ── Admin credentials ─────────────────────────────────────────────────────────
// ⚠️ Admin paroli ENDI brauzerda saqlanmaydi. Ilgari u `localStorage` da ochiq
// matnda turardi (va backend KV'ga ham sinxronlanardi) — ya'ni qurilmaga kirgan
// yoki XSS topgan har kim uni o'qib olardi. Endi parol faqat serverda, scrypt
// xeshi ko'rinishida. Bu funksiyalar orqaga moslik uchun qoldirilgan.
function getAdminCred() {
  return { login: '', pass: '' };
}
/**
 * ⚠️ PAROL SIYOSATI
 * Parolni FAQAT admin panelidan o'zgartirish mumkin:
 *   • admin — sozlamalar bo'limida o'z parolini almashtiradi (joriy parolni
 *     bilishi shart);
 *   • mentor/talaba — o'zi almashtira olmaydi, adminga murojaat qiladi.
 * Bu tekshiruv faqat KO'RINISH uchun — serverning o'zi ham
 * `/api/auth/change-password` ni admin bo'lmaganlarga rad etadi.
 */
function canChangeOwnPassword() {
  try {
    return !!(window.CRMAuth && window.CRMAuth.role() === 'admin');
  } catch (e) {
    return false;
  }
}

const PASSWORD_ADMIN_ONLY_MSG =
  "Parolni faqat administrator o'zgartiradi.\n\nYangi parol kerak bo'lsa, o'quv markazi administratoriga murojaat qiling.";

async function saveAdminCred(login, pass) {
  if (!canChangeOwnPassword()) {
    await crmAlert(PASSWORD_ADMIN_ONLY_MSG, { title: '🔒 Parol' });
    return { ok: false, error: PASSWORD_ADMIN_ONLY_MSG };
  }
  // Login/parol serverda yangilanadi — joriy parol so'ralmaydi.
  const r = await window.CRMAuth.updateCredentials(login, pass);
  if (!r || !r.ok) await crmAlert('Parol almashtirilmadi: ' + ((r && r.error) || 'xatolik'));
  else await crmAlert('✅ Parol almashtirildi.');
  return r;
}

// ── Users ─────────────────────────────────────────────────────────────────────
// ⚠️ XAVFSIZLIK: bu ro'yxat ENDI PAROLSIZ keladi va u FAQAT ro'yxat ko'rsatish
// uchun ishlatiladi. Kirish tekshiruvi serverda (/api/auth/login) bo'ladi.
async function getUsers() {
  try {
    const r = await fetch('/api/users');
    if (r.ok) {
      const data = await r.json();
      if (Array.isArray(data.mentors)) localStorage.setItem(MENTOR_USERS_KEY, JSON.stringify(data.mentors));
      if (Array.isArray(data.students)) localStorage.setItem(STUDENT_USERS_KEY, JSON.stringify(data.students));
    }
  } catch (e) {}
  try {
    const extras = JSON.parse(localStorage.getItem(MENTOR_USERS_KEY) || '[]');
    const studs = JSON.parse(localStorage.getItem(STUDENT_USERS_KEY) || '[]');
    return extras.concat(studs);
  } catch (e) { return []; }
}

// Server javobini qaytaradi: { ok, accounts:[{login, ok, error}] }. Ilgari
// javob umuman tekshirilmasdi — server loginni rad etsa ham "saqlandi"
// chiqardi, mentor esa kira olmasdi.
// ⚠️ Parol localStorage'ga yozilmaydi — u faqat serverga ketadi.
async function _postUsers(body) {
  try {
    const r = await fetch('/api/users/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) return { ok: false, error: d.error || ('Server xatosi (HTTP ' + r.status + ')') };
    const bad = (d.accounts || []).find((a) => !a.ok);
    return bad ? { ok: false, error: (bad.login || '') + ': ' + (bad.error || 'saqlanmadi'), accounts: d.accounts } : d;
  } catch (e) {
    return { ok: false, error: "Serverga ulanib bo'lmadi" };
  }
}
// Ro'yxatda parol bo'lmasligi shart. Yangi parol faqat `newPassword` maydonida,
// faqat admin hozir o'zgartirgan bitta yozuvda serverga ketadi.
const _noPass = (arr) => arr.map(({ pass, password, newPassword, hashed, prevLogin, ...u }) => u);
// Brauzerdagi (va KV dagi) eski ro'yxatda 20-oktyabrgacha saqlangan parollar
// qolib ketgan. Ular qaytib serverga yuborilmasin — o'qishda tozalanadi.
const _readUsers = (key) => { try { const a = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(a) ? a.map(({ pass, password, newPassword, hashed, ...u }) => u) : []; } catch (e) { return []; } };

function saveMentorUsers(arr, removedLogins) {
  localStorage.setItem(MENTOR_USERS_KEY, JSON.stringify(_noPass(arr)));
  return _postUsers({ mentors: arr, removedMentorLogins: removedLogins || [] });
}
function getMentorUsers() { return _readUsers(MENTOR_USERS_KEY); }

function saveStudentUsers(arr, removedLogins) {
  localStorage.setItem(STUDENT_USERS_KEY, JSON.stringify(_noPass(arr)));
  return _postUsers({ students: arr, removedStudentLogins: removedLogins || [] });
}
function getStudentUsers() { return _readUsers(STUDENT_USERS_KEY); }

// ── Auth checks ───────────────────────────────────────────────────────────────
function checkAuth() { try { return !!_authRead().loggedIn; } catch (e) { return false; } }
function getCurrentUser() { return _authRead(); }
// Rol eski ('Super Admin'/'Mentor'/'Talaba') yoki yangi ('admin'/'mentor'/
// 'student') shaklda kelishi mumkin — ikkalasini ham tan olamiz (katta-kichik
// harfga ahamiyatsiz). Aks holda yangi shakldagi rol hech biriga mos kelmay,
// foydalanuvchi noto'g'ri "admin" deb hisoblanardi (masalan /api/admin/* ga
// so'rov yuborib 403 olardi).
function _crmRole() { return String((getCurrentUser() || {}).role || '').trim().toLowerCase(); }
function isMentorRole() { return _crmRole() === 'mentor'; }
function isStudentRole() { var r = _crmRole(); return r === 'talaba' || r === 'student'; }
function isAdminRole() { var r = _crmRole(); return r === 'super admin' || r === 'admin'; }

// ── Login ─────────────────────────────────────────────────────────────────────
// ⚠️ TUB O'ZGARISH: parol endi BRAUZERDA solishtirilmaydi.
//
// Ilgari bu funksiya `/api/users` dan barcha loginlarni PAROLI BILAN yuklab,
// ularni JS da tekshirardi. Ya'ni brauzer konsolida bitta so'rov bilan admin
// paroli ko'rinardi. Endi login/parol serverga yuboriladi, server esa qisqa
// umrli imzolangan token qaytaradi. Rollar ham serverda tekshiriladi —
// localStorage'ni tahrirlab admin bo'lib olish endi ishlamaydi.
// ── Super Admin paneli manzili ───────────────────────────────────────────────
// Backend orqali: /admin/super-admin/ ; Vercel'da (admin domeni ildizida): /super-admin/
function superAdminUrl() {
  return (/^\/admin(\/|$)/.test(location.pathname) ? '/admin' : '') + '/super-admin/';
}
// Super Admin oddiy CRM panelini ham ochishi mumkin (?crm=1) — tahrirlash uchun
function superWantsCrm() {
  try {
    if (new URLSearchParams(location.search).get('crm') === '1') sessionStorage.setItem('edu_super_crm', '1');
    return sessionStorage.getItem('edu_super_crm') === '1';
  } catch (e) { return false; }
}

async function doLogin() {
  const user = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-err');
  const otpWrap = document.getElementById('login-otp-wrap');
  const otpEl = document.getElementById('login-otp');
  const otp = otpWrap && otpWrap.style.display !== 'none' && otpEl ? otpEl.value.trim() : '';

  const btn = document.querySelector('#login-form-panel .login-btn') || document.querySelector('.login-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Tekshirilmoqda...'; }

  const out = await window.CRMAuth.login(user, pass, otp);

  if (btn) { btn.disabled = false; btn.textContent = 'Kirish'; }

  // Parol to'g'ri, lekin hisobda 2 bosqichli tasdiqlash yoqilgan — kod so'raladi
  if (!out.ok && (out.code === 'otp-required' || out.code === 'otp-invalid')) {
    if (otpWrap) otpWrap.style.display = '';
    errEl.textContent = out.code === 'otp-required'
      ? '🛡️ Authenticator ilovasidagi 6 xonali kodni kiriting'
      : (out.error || "Tasdiqlash kodi noto'g'ri");
    errEl.style.display = 'block';
    if (otpEl) { otpEl.value = ''; otpEl.focus(); }
    return;
  }

  if (!out.ok) {
    // Qurilma bloklangan bo'lsa — sababi va qolgan vaqti aniq yozilsin.
    // ⚠️ Blok QURILMAGA qo'yiladi: xuddi shu Wi-Fi dagi boshqa telefon
    // yoki kompyuterdan kirish ochiq qoladi.
    let msg = out.error || "Login yoki parol noto'g'ri!";
    if (out.code === 'device-blocked') {
      const min = Math.max(1, Math.ceil((out.retryAfter || 900) / 60));
      msg = `🔒 Parol bir necha marta xato kiritildi — bu qurilma ${min} daqiqaga bloklandi.\nBoshqa qurilmadan kirish mumkin yoki administratorga murojaat qiling.`;
    } else if (typeof out.attemptsLeft === 'number' && out.attemptsLeft > 0 && out.attemptsLeft <= 3) {
      msg += ` (yana ${out.attemptsLeft} ta urinish qoldi — keyin bu qurilma vaqtincha bloklanadi)`;
    }
    errEl.textContent = msg;
    errEl.style.whiteSpace = 'pre-line'; // ko'p qatorli xabar to'g'ri ko'rinsin
    errEl.style.display = 'block';
    ['login-user', 'login-pass'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.add('field-error');
      setTimeout(() => el.classList.remove('field-error'), 500);
    });
    const lp0 = document.getElementById('login-pass');
    if (lp0) { lp0.value = ''; lp0.focus(); }
    return;
  }
  errEl.style.display = 'none';
  if (otpWrap) otpWrap.style.display = 'none';
  if (otpEl) otpEl.value = '';

  const found = out.user;
  // 👑 Super Admin — o'zining alohida paneliga
  if (found.role === 'superadmin' && !superWantsCrm()) {
    const lp1 = document.getElementById('login-pass');
    if (lp1) lp1.value = '';
    location.href = superAdminUrl();
    return;
  }
  const isMentor = found.legacyRole === 'Mentor';
  const isStudent = found.legacyRole === 'Talaba';

  const lu = document.getElementById('login-user');
  const lp = document.getElementById('login-pass');
  if (lu) lu.value = '';
  if (lp) lp.value = '';

  // UI tab'ni rolga qarab o'rnat
  try {
    const ui = JSON.parse(localStorage.getItem(UI_KEY) || '{}');
    ui.tab = isMentor ? 'mentor-dash' : isStudent ? 'student-my' : 'dashboard';
    localStorage.setItem(UI_KEY, JSON.stringify(ui));
  } catch (e) {}

  // Sessiya holatini CRMAuth o'zi yozadi (xotirada token, cookie'da refresh).
  // Vaqtinchalik parol berilgan bo'lsa — avval uni almashtirish shart.
  if (found.mustChangePassword) {
    await promptPasswordChange();
    return;
  }

  // Sessiya bor — CRM ma'lumotini serverdan yuklaymiz, so'ng panelni ochamiz.
  if (typeof window.__CRM_HYDRATE__ === "function") window.__CRM_HYDRATE__();
  showApp();
}

/**
 * Majburiy parol almashtirish oynasi — admin tomonidan tiklangan yoki
 * boshlang'ich paroldan keyin. Almashtirilmaguncha ilova ochilmaydi.
 */
async function promptPasswordChange() {
  // Mentor/talaba parolni o'zi almashtira olmaydi — ularni oynada ushlab
  // turishning ma'nosi yo'q, aks holda panelga umuman kira olmasdi.
  if (!canChangeOwnPassword()) {
    if (typeof window.__CRM_HYDRATE__ === "function") window.__CRM_HYDRATE__();
    showApp();
    return;
  }

  const next = await crmPrompt("Xavfsizlik uchun parolni almashtirish shart.\n\nYangi parol (kamida 5 belgi):", {
    title: '🔐 Yangi parol',
    password: true,
    okText: 'Saqlash',
  });
  if (next === null) { await window.CRMAuth.logout(); location.reload(); return; }

  const r = await window.CRMAuth.updateCredentials(null, next);
  if (!r || !r.ok) {
    await crmAlert("Parol almashtirilmadi: " + ((r && r.error) || 'xatolik'));
    return promptPasswordChange();
  }
  await crmAlert('✅ Parol almashtirildi.');
  if (typeof window.__CRM_HYDRATE__ === "function") window.__CRM_HYDRATE__();
  showApp();
}

// ── Bir martalik havola orqali yangi parol (?reset=TOKEN) ──────────────────────
function resetTokenFromUrl() {
  try {
    const t = new URLSearchParams(location.search).get('reset');
    return t && /^[A-Za-z0-9_-]{20,200}$/.test(t) ? t : null;
  } catch (e) { return null; }
}
function showResetPanel() {
  const lp = document.getElementById('login-form-panel');
  const rp = document.getElementById('reset-panel');
  if (lp) lp.style.display = 'none';
  if (rp) rp.style.display = '';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('crm-app').style.display = 'none';
  setTimeout(() => { const i = document.getElementById('reset-pass'); if (i) i.focus(); }, 100);
}
async function doResetPassword() {
  const token = resetTokenFromUrl();
  const p1 = document.getElementById('reset-pass').value;
  const p2 = document.getElementById('reset-pass2').value;
  const err = document.getElementById('reset-err');
  const show = (m, ok) => {
    err.textContent = m;
    err.style.display = 'block';
    err.style.whiteSpace = 'pre-line';
    err.style.color = ok ? 'var(--teal, #0d9488)' : '';
  };
  if (!token) return show("Havola yaroqsiz");
  if (p1.length < 8) return show("Parol kamida 8 belgi bo'lsin");
  if (p1 !== p2) return show("Parollar bir xil emas");
  const btn = document.getElementById('reset-btn');
  if (btn) btn.disabled = true;
  const r = await window.CRMAuth.resetPassword(token, p1);
  if (btn) btn.disabled = false;
  if (!r || !r.ok) return show((r && r.error) || "Parol o'rnatilmadi");
  show("✅ Parol o'rnatildi (" + (r.username || '') + "). Endi yangi parol bilan kiring.", true);
  document.getElementById('reset-pass').value = '';
  document.getElementById('reset-pass2').value = '';
  setTimeout(() => {
    history.replaceState(null, '', location.pathname);
    const lp = document.getElementById('login-form-panel');
    const rp = document.getElementById('reset-panel');
    if (rp) rp.style.display = 'none';
    if (lp) lp.style.display = '';
    const u = document.getElementById('login-user');
    if (u) { u.value = r.username || ''; document.getElementById('login-pass').focus(); }
  }, 1800);
}
window.doResetPassword = doResetPassword;

// ── Logout ────────────────────────────────────────────────────────────────────
async function doLogout() {
  if (!(await crmConfirm('Tizimdan chiqasizmi?', { title: '🚪 Chiqish', okText: 'Ha, chiqaman' })))
    return;
  // Serverdagi sessiyani ham yopamiz — faqat brauzerdan o'chirish yetarli emas
  try { await window.CRMAuth.logout(); } catch (e) {}
  _authDelete();
  try { localStorage.removeItem('edu_remember_cred'); } catch (e) {}
  location.reload();
}

// ── showApp: login → panel ────────────────────────────────────────────────────
function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('crm-app').style.display = 'flex';
  initApp();
  updateVideoNavLabels();
  if (isMentorRole()) setupMentorView();
  else if (isStudentRole()) setupStudentView();
  // Admin uchun setupAdminView() initApp() ichida chaqiriladi
}

// ── Mentor view ───────────────────────────────────────────────────────────────
function setupMentorView() {
  const cu = getCurrentUser();
  ['nav-methodology', 'nav-dashboard', 'nav-courses', 'nav-groups', 'nav-mentors', 'nav-students', 'nav-debtors', 'nav-admin-ai', 'nav-finance', 'nav-certificates', 'nav-coin-shop', 'nav-student-coin-shop'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  ['nav-mentor-dash', 'nav-mentor-groups', 'nav-mentor-method', 'nav-mentors-my', 'nav-mentor-chat', 'nav-mentor-ai', 'nav-mentor-students-ai', 'nav-tests-mentor', 'nav-grades-mentor', 'nav-mentor-videos', 'nav-settings'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = 'flex';
  });
  const btnReset = document.getElementById('btn-reset');
  const btnExport = document.getElementById('btn-export');
  if (btnReset) btnReset.style.display = 'none';
  if (btnExport) btnExport.style.display = 'none';
  const uName = document.querySelector('.u-name');
  const uRole = document.querySelector('.u-role');
  if (uName) uName.textContent = cu.name || 'Mentor';
  if (uRole) uRole.textContent = 'Mentor';
  const av = document.querySelector('.u-av');
  if (av) av.textContent = (cu.name || 'M').substring(0, 2).toUpperCase();
  const mentorTabs=['mentor-dash','mentor-groups','mentors-my','mentor-chat','mentor-ai','tests-mentor','grades-mentor','mentor-videos','mentor-method','settings','tests','grades'];
  const tab = (mentorTabs.indexOf(currentTab)>=0 ? currentTab : 'mentor-dash');
  const navEl = document.getElementById('nav-' + tab) || document.getElementById('nav-mentor-dash');
  go(tab, navEl);
  if (typeof updateMentorCoinTopbar === 'function') updateMentorCoinTopbar();
  const ncMT = document.getElementById('nc-tests-mentor');
  if (ncMT) ncMT.textContent = D.tests.length;
}

// ── Talaba view ───────────────────────────────────────────────────────────────
function setupStudentView() {
  const cu = getCurrentUser();
  ['nav-methodology', 'nav-mentor-method', 'nav-courses', 'nav-groups', 'nav-mentors', 'nav-students', 'nav-debtors', 'nav-admin-ai', 'nav-finance', 'nav-certificates', 'nav-settings',
   'nav-dashboard', 'nav-mentor-dash', 'nav-mentor-groups', 'nav-mentors-my', 'nav-mentor-chat', 'nav-tests-mentor',
   'nav-grades-mentor', 'nav-tests', 'nav-grades'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  ['nav-student-my', 'nav-student-schedule', 'nav-student-rating', 'nav-student-grades',
   'nav-student-tests', 'nav-student-chat', 'nav-student-ai', 'nav-student-videos',
   'nav-student-goals', 'nav-student-certificates', 'nav-settings', 'nav-student-coin-shop'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = 'flex';
  });
  const ncST = document.getElementById('nc-student-tests');
  if (ncST) {
    const studentId = cu.studentId ? parseInt(cu.studentId) : null;
    const s = studentId ? D.students.find(x => x.id === studentId) : null;
    const grp = s ? D.groups.find(x => x.id === s.groupId) : null;
    const cnt = grp ? (D.tests || []).filter(t => t.groupId === grp.id).length : 0;
    if (cnt > 0) { ncST.textContent = cnt; ncST.style.display = 'flex'; }
  }
  const btnReset = document.getElementById('btn-reset');
  const btnExport = document.getElementById('btn-export');
  if (btnReset) btnReset.style.display = 'none';
  if (btnExport) btnExport.style.display = 'none';
  const uName = document.querySelector('.u-name');
  const uRole = document.querySelector('.u-role');
  const studentId2 = cu.studentId ? parseInt(cu.studentId) : null;
  const savedDisplay = _uiSettings['studentDisplayName_' + (studentId2 || '')];
  const showName = savedDisplay || (cu.studentName || cu.name || 'Talaba');
  const roleLbl = LANG === 'ru' ? 'Студент' : LANG === 'en' ? 'Student' : 'Talaba';
  if (uName) uName.textContent = showName;
  if (uRole) uRole.textContent = roleLbl;
  const av = document.querySelector('.u-av');
  if (av) av.textContent = showName.substring(0, 2).toUpperCase();
  const tab = currentTab || 'student-my';
  const navEl = document.getElementById('nav-' + tab) || document.getElementById('nav-student-my');
  go(tab, navEl);
  if (typeof updateMentorCoinTopbar === 'function') updateMentorCoinTopbar();
}
