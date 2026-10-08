// ===================== DATA =====================
const STORAGE_KEY = "edumanage_crm_v8";

const DEFAULT_DATA = {
  nextId: 100,
  courses: [],
  groups: [],
  mentors: [],
  students: [],
  attendance: {},
  finance: [],
  gradingCriteria: {},
  grades: {},
  simpleGrades: {}, // 2.Baholash: har talaba uchun oddiy baho yozuvlari tarixi {studentId:[{id,score,comment,date,mentorName}]}
  tests: [],
  testResults: {},
  // Sertifikatlar — admin yaratadi, talaba o'z panelida ko'radi
  // (core/certificates.js). Mentor bilan bog'liq emas.
  certificates: [],
  // Sertifikat shablonlari — admin yuklagan blanka rasmi (backend "blobs"
  // ichida) va maydonlarning rasm ustidagi joylashuvi.
  certTemplates: [],
};

function _mergeData(p) {
  const d = Object.assign({}, DEFAULT_DATA, p);
  if (!d.courses) d.courses = [];
  if (!d.groups) d.groups = [];
  if (!d.mentors) d.mentors = [];
  if (!d.students) d.students = [];
  if (!d.attendance) d.attendance = {};
  if (!d.finance) d.finance = [];
  if (!d.gradingCriteria) d.gradingCriteria = {};
  if (!d.grades) d.grades = {};
  if (!d.simpleGrades) d.simpleGrades = {};
  if (!d.tests) d.tests = [];
  if (!d.testResults) d.testResults = {};
  if (!d.certificates) d.certificates = [];
  if (!d.certTemplates) d.certTemplates = [];
  syncGroupRelations(d);
  return d;
}

// ===================== RELATIONAL INTEGRITY (Course/Mentor -> Group) =====================
// Guruh (Group) endi kurs va mentorni ID orqali bog'laydi (courseId / mentorId),
// matn (nom) emas. Kurs yoki mentor nomi o'zgarganda barcha guruhlar avtomatik
// yangi nomni ko'rsatishi uchun har safar ma'lumot yuklanganda/saqlanganda shu
// funksiya guruhlarning courseId/mentorId'sini eski (legacy) matn maydonlaridan
// migratsiya qiladi va ko'rsatiladigan `course`/`mentor` matn maydonlarini joriy
// Course/Mentor yozuvlaridan qayta hisoblaydi (dinamik join natijasini keshlaydi).
function getCourseById(id) {
  if (id === null || id === undefined || id === "") return null;
  return D.courses.find((c) => String(c.id) === String(id)) || null;
}
function getMentorById(id) {
  if (id === null || id === undefined || id === "") return null;
  return D.mentors.find((m) => String(m.id) === String(id)) || null;
}
function syncGroupRelations(data) {
  const src = data || D;
  if (!src || !Array.isArray(src.groups)) return;
  const courses = src.courses || [];
  const mentors = src.mentors || [];
  src.groups.forEach((g) => {
    if (g.courseId === undefined || g.courseId === null) {
      if (g.course) {
        const match = courses.find((c) => c.name === g.course);
        if (match) g.courseId = match.id;
      }
    }
    if (g.mentorId === undefined || g.mentorId === null) {
      if (g.mentor) {
        const match = mentors.find((m) => m.name === g.mentor);
        if (match) g.mentorId = match.id;
      }
    }
    const c =
      g.courseId !== undefined && g.courseId !== null
        ? courses.find((x) => x.id === g.courseId)
        : null;
    if (c) g.course = c.name;
    const m =
      g.mentorId !== undefined && g.mentorId !== null
        ? mentors.find((x) => x.id === g.mentorId)
        : null;
    if (m) g.mentor = m.name;
  });
}
function loadData() {
  try {
    const r = localStorage.getItem(STORAGE_KEY);
    if (r) {
      const parsed = _mergeData(JSON.parse(r));
      if (_dataWeight(parsed) > 0) window.__CRM_HAD_DATA__ = true;
      return parsed;
    }
  } catch (e) {}
  // localStorage bo'sh — toza holat qaytaramiz, syncFromBackend to'ldiradi
  return {
    nextId: 100,
    courses: [],
    groups: [],
    mentors: [],
    students: [],
    attendance: {},
    finance: [],
    gradingCriteria: {},
    grades: {},
    simpleGrades: {},
    tests: [],
    testResults: {},
    certificates: [],
    certTemplates: [],
  };
}
// Backend dan yangi ma'lumot olish va appni yangilash
async function syncFromBackend() {
  try {
    const r = await fetch("/api/data");
    if (!r.ok) return;
    const json = await r.json();
    if (!json.ok || !json.data) return;
    // Backend javob berdi — demak saqlash yana xavfsiz (boot paytida
    // yuklash muvaffaqiyatsiz bo'lgan bo'lsa ham shu yerda tiklanadi).
    window.__CRM_KV_LOADED__ = true;
    hideDataLockBanner();

    // ⚠️ "O'chirgan narsa qaytib kelardi" — hozirgina o'zimiz saqlagan bo'lsak,
    // server bizning yozuvimizni hali olmagan bo'lishi mumkin. Shu grace oyna
    // ichida serverning (eski) nusxasini ustiga yozmaymiz; oyna o'tgach keyingi
    // sinxronlash to'g'ri ma'lumotni keltiradi.
    if (window.__CRM_WROTE_RECENTLY__ && window.__CRM_WROTE_RECENTLY__(STORAGE_KEY))
      return;

    // ⚠️ Serverdagi nusxa BO'SH, bu brauzerdagisi esa to'la bo'lsa — serverni
    // ustun deb bilmaymiz, aksincha brauzerdagini serverga QAYTARAMIZ.
    // Shu tufayli ma'lumot bir marta o'chib ketgan bo'lsa ham, uni hali
    // ochmagan istalgan brauzer bazani o'zi tiklab beradi.
    if (_dataWeight(json.data) === 0 && _dataWeight(D) > 0) {
      console.warn("[CRM] Serverda ma'lumot bo'sh — brauzerdagi nusxa tiklanmoqda");
      saveData({ force: true });
      if (typeof toast === "function")
        toast("♻️ Serverdagi ma'lumot bo'sh edi — bu brauzerdagi nusxa tiklandi");
      return;
    }

    const fresh = _mergeData(json.data);
    // localStorage ni ham yangilash — RAW yozamiz (shimni chetlab): bu server
    // ma'lumoti, uni backendga qaytarib yozish (echo) va "mahalliy yozdik"
    // grace oynasini noto'g'ri yoqish shart emas.
    try {
      Storage.prototype.setItem.call(localStorage, STORAGE_KEY, JSON.stringify(json.data));
    } catch (e) {}
    Object.assign(D, fresh);
    // Backend'dan kelgan eng yangi davomat asosida qarzdorlik holatini qayta
    // hisoblaymiz — shu orqali mentor tomonida 12-dars to'lganda belgilangan
    // isDebtor holati ADMIN va STUDENT panellarida ham avtomatik ko'rinadi,
    // hatto ular davomat belgilamasa ham (faqat ko'rib turgan bo'lsa ham).
    if (typeof recomputeAllDebtStatuses === "function") {
      recomputeAllDebtStatuses({ silent: true });
    }
    if (typeof updateCounts === "function") updateCounts();
    // Har doim FAOL bo'lgan ekranni (qaysi panel/tab ochiq bo'lsa ham,
    // admin/mentor/student — farqi yo'q) qayta chizamiz, shunda foydalanuvchi
    // sahifani yangilamasdan turib ham eng so'nggi ma'lumotni ko'radi.
    renderCurrentView();
  } catch (e) {}
}
// Ochiq bo'lgan barcha panel/tab turlari uchun render funksiyalarini qayta
// ishga tushiradi va joriy tabni qayta faollashtiradi. setLang() da ham,
// live-sync (backend'dan avtomatik yangilanish) da ham ishlatiladi — shu
// bilan CRM ning HAR BIR bo'limi (Kurslar, Guruhlar, Mentorlar, Talabalar,
// Davomat, To'lovlar, Testlar, Baholash, Jadval, Chat va h.k.) foydalanuvchi
// sahifani yangilamasdan (F5 siz) darhol yangilanadi.
function renderCurrentView() {
  try {
    if (typeof renderAll === "function") renderAll();
  } catch (e) {}
  var rerenderFns = [
    "renderDashboard", "renderCourses", "renderGroups", "renderMentors", "renderStudents", "renderDebtors",
    "renderFinance", "renderFinanceMonthNav", "renderSettingsPanel", "renderAdminCoinShop",
    "renderMentorDashboard", "renderMySchedule", "renderMentorChat", "renderMentorAI",
    "renderMentorStudentsAI", "renderTestsPanel", "renderGradesPanel", "renderMentorVideos",
    "renderStudentDashboard", "renderStudentSchedulePage", "renderStudentRatingPage",
    "renderStudentGradesPage", "renderStudentTestsPage", "renderStudentChatPage",
    "renderStudentAI", "renderStudentVideos", "renderStudentGoalsPage", "renderStudentCoinShop",
    "renderAdminChatMonitor",
  ];
  rerenderFns.forEach(function (fn) {
    try {
      if (typeof window[fn] === "function") window[fn]();
    } catch (e) {}
  });
  // Joriy ochiq bo'lgan tab/panelni ham mos keladigan render funksiyasi
  // bilan qayta chizamiz (DOM klasslari, saveUI(), chat-polling holati kabi
  // yon ta'sirlarga tegmasdan) — shunda masalan "Davomat" panelida turgan
  // foydalanuvchi ham yangi ma'lumotni sahifani yangilamasdan ko'radi.
  if (typeof currentTab !== "undefined" && currentTab) {
    try {
      renderTabView(currentTab);
    } catch (e) {}
  }
}
function renderTabView(tab) {
  var call = function (fn) {
    if (typeof window[fn] === "function") window[fn]();
  };
  if (tab === "dashboard") call("renderDashboard");
  if (tab === "debtors") call("renderDebtors");
  if (tab === "finance") call("renderFinance");
  if (tab === "settings") call("renderSettingsPanel");
  if (tab === "mentor-dash") call("renderMentorDashboard");
  if (tab === "mentor-ai") call("renderMentorAI");
  if (tab === "mentor-students-ai") call("renderMentorStudentsAI");
  if (tab === "student-ai") call("renderStudentAI");
  if (tab === "mentor-groups") call("renderMentorGroups");
  if (tab === "mentors-my") call("renderMySchedule");
  if (tab === "mentor-chat") call("renderMentorChat");
  if (tab === "student-my") call("renderStudentDashboard");
  if (tab === "tests") call("renderTestsPanel");
  if (tab === "grades") call("renderGradesPanel");
  if (tab === "student-schedule") call("renderStudentSchedulePage");
  if (tab === "student-rating") call("renderStudentRatingPage");
  if (tab === "student-grades") call("renderStudentGradesPage");
  if (tab === "student-tests") call("renderStudentTestsPage");
  if (tab === "student-chat") call("renderStudentChatPage");
  if (tab === "student-goals") call("renderStudentGoalsPage");
  if (tab === "mentor-videos") call("renderMentorVideos");
  if (tab === "student-videos") call("renderStudentVideos");
  if (tab === "coin-shop") call("renderAdminCoinShop");
  if (tab === "student-coin-shop") call("renderStudentCoinShop");
  if (tab === "admin-chats") call("renderAdminChatMonitor");
}
/**
 * ⚠️ MA'LUMOT YO'QOLISHIDAN HIMOYA
 * ---------------------------------
 * Sabab: boot paytida `/api/kv` yoki `/api/data` javob bermasa (Render uyquda,
 * internet uzilgan, localStorage to'lgan) `D` bo'sh bo'lib qolardi. Shundan
 * keyin foydalanuvchining har qanday harakati `saveData()` ni chaqirib, BO'SH
 * ro'yxatlarni serverga yozardi va butun baza o'chib ketardi.
 *
 * Endi bo'sh holatni saqlash faqat quyidagi shartlarda ruxsat etiladi:
 *   • backend'dan ma'lumot muvaffaqiyatli yuklangan bo'lsa, VA
 *   • foydalanuvchi o'zi "hammasini o'chirish" tugmasini bosgan bo'lsa
 *     (resetData → force).
 */
function _dataWeight(d) {
  if (!d) return 0;
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
}

function showDataLockBanner(msg) {
  var el = document.getElementById("crm-data-lock");
  if (!el) {
    el = document.createElement("div");
    el.id = "crm-data-lock";
    el.style.cssText =
      "position:fixed;left:0;right:0;top:0;z-index:99999;background:#b45309;" +
      "color:#fff;font:600 13px/1.5 system-ui,sans-serif;padding:10px 16px;" +
      "text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.25)";
    document.body.appendChild(el);
  }
  el.innerHTML =
    "⚠️ " + msg +
    ' <button onclick="location.reload()" style="margin-left:10px;padding:3px 10px;' +
    'border:0;border-radius:6px;background:#fff;color:#b45309;font-weight:700;' +
    'cursor:pointer">Qayta yuklash</button>';
  el.style.display = "block";
}

function hideDataLockBanner() {
  var el = document.getElementById("crm-data-lock");
  if (el) el.style.display = "none";
}

function saveData(opts) {
  const force = !!(opts && opts.force);

  if (!force) {
    if (window.__CRM_KV_LOADED__ === false) {
      showDataLockBanner(
        "Serverga ulanib bo'lmadi — o'zgarishlar SAQLANMAYDI. " +
          "Ma'lumot o'chib ketmasligi uchun saqlash to'xtatildi.",
      );
      console.warn("[CRM] saveData to'sildi: backend'dan yuklanmagan");
      updateStorageBadge(false);
      return;
    }
    if (_dataWeight(D) === 0 && window.__CRM_HAD_DATA__) {
      showDataLockBanner(
        "Bo'sh ma'lumotni saqlashga urinildi — bloklandi. Sahifani yangilang.",
      );
      console.warn("[CRM] saveData to'sildi: bo'sh ma'lumot");
      return;
    }
  }
  if (_dataWeight(D) > 0) window.__CRM_HAD_DATA__ = true;

  const payload = {
    _hasUserData: true,
    nextId: D.nextId,
    courses: D.courses,
    groups: D.groups,
    mentors: D.mentors,
    students: D.students,
    attendance: D.attendance || {},
    finance: D.finance || [],
    gradingCriteria: D.gradingCriteria || {},
    grades: D.grades || {},
    simpleGrades: D.simpleGrades || {},
    tests: D.tests || [],
    testResults: D.testResults || {},
    certificates: D.certificates || [],
    certTemplates: D.certTemplates || [],
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {}
  fetch("/api/data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(force ? { ...payload, force: true } : payload),
  })
    .then((r) => r.json())
    .then((d) => {
      updateStorageBadge(d.ok);
      if (!d.ok && d.code === "empty-overwrite-blocked") {
        // Server himoyasi ishladi — bu brauzerdagi nusxa noto'g'ri.
        window.__CRM_KV_LOADED__ = false;
        showDataLockBanner(
          "Server bo'sh ma'lumotni qabul qilmadi (baza saqlanib qoldi). " +
            "Sahifani yangilang.",
        );
      }
    })
    .catch(() => updateStorageBadge(false));
}
function updateStorageBadge(ok) {
  const el = document.getElementById("storage-status");
  if (!el) return;
  el.textContent = ok ? "💾 Saqlangan" : "⚠️ Saqlanmadi";
  el.style.background = ok ? "var(--teal-light)" : "var(--amber-light)";
  el.style.color = ok ? "var(--teal-text)" : "var(--amber-text)";
}
async function resetData() {
  if (!(await crmConfirm("Barcha ma'lumotlar o'chiriladi?", { danger: true }))) return;
  localStorage.removeItem(STORAGE_KEY);
  const empty = {
    nextId: 100,
    courses: [],
    groups: [],
    mentors: [],
    students: [],
    attendance: {},
    finance: [],
    gradingCriteria: {},
    grades: {},
    tests: [],
    testResults: {},
    certificates: [],
    certTemplates: [],
  };
  Object.assign(D, empty);
  window.__CRM_HAD_DATA__ = false;
  fetch("/api/data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...empty, _hasUserData: true, force: true }),
  }).catch(() => {});
  groupPage = 1;
  updateCounts();
  updateGroupFilters();
  updateStudentCourseFilter();
  renderAll();
  toast("🔄 Barcha ma'lumotlar o'chirildi");
}
if (!window.D) window.D = {};
var D = window.D;
function newId() {
  return ++D.nextId;
}
function updateCounts() {
  document.getElementById("nc-courses").textContent = D.courses.length;
  document.getElementById("nc-groups").textContent = D.groups.length;
  document.getElementById("nc-mentors").textContent = D.mentors.length;
  document.getElementById("nc-students").textContent = D.students.length;
  const ncCert = document.getElementById("nc-certificates");
  if (ncCert) ncCert.textContent = (D.certificates || []).length;
  const ncDebtors = document.getElementById("nc-debtors");
  if (ncDebtors) {
    const n = D.students.filter((s) => s.isDebtor).length;
    ncDebtors.textContent = n;
    ncDebtors.style.display = n ? "" : "none";
  }
  const ncTests = document.getElementById("nc-tests");
  if (ncTests) ncTests.textContent = D.tests.length;
}
function groupStudentCount(gid) {
  return D.students.filter((s) => s.groupId === gid).length;
}
function groupLabel(gid) {
  const g = D.groups.find((x) => x.id === gid);
  return g ? g.name + " (" + g.course.split(" ")[0] + ")" : "—";
}
function studentCourse(s) {
  const g = D.groups.find((x) => x.id === s.groupId);
  return g ? g.course : "";
}
function autoGroupName(courseId) {
  const course = getCourseById(courseId);
  const courseName = course ? course.name : "";
  if (!courseName) return "";
  const w = courseName.split(/\s+/);
  const prefix =
    w.length >= 2
      ? (w[0][0] + w[1][0]).toUpperCase()
      : courseName.substring(0, 2).toUpperCase();
  const count = D.groups.filter((g) => g.courseId === course.id).length;
  return prefix + "-" + (count + 1);
}
function generateStudentId(id) {
  return "STD-" + new Date().getFullYear() + "-" + String(id).padStart(4, "0");
}
function getCourseDuration(courseName) {
  const c = D.courses.find((x) => x.name === courseName);
  return c ? c.duration : "—";
}
function getCoursePrice(courseName) {
  const c = D.courses.find((x) => x.name === courseName);
  if (!c) return 0;
  return (
    parseInt((c.price || "0").replace(/\s/g, "").replace(/[^\d]/g, "")) || 0
  );
}
function getLessonPrice(courseName) {
  const cp = getCoursePrice(courseName);
  return cp > 0 ? Math.round(cp / LESSON_COUNT) : 0;
}
function getExpYears(expStr) {
  if (!expStr) return 0;
  const m = expStr.match(/(\d+)/);
  return m ? parseInt(m[1]) : 0;
}
function openLightbox(src) {
  document.getElementById("lightbox-img").src = src;
  document.getElementById("lightbox").classList.add("open");
}
function closeLightbox() {
  document.getElementById("lightbox").classList.remove("open");
  document.getElementById("lightbox-img").src = "";
}
function timeToMin(t_) {
  if (!t_) return 0;
  const [h, m] = t_.split(":").map(Number);
  return h * 60 + m;
}
function checkRoomConflict(room, timeStart, timeEnd, editId) {
  if (!room || !timeStart || !timeEnd) return null;
  const newS = timeToMin(timeStart),
    newE = timeToMin(timeEnd);
  for (const g of D.groups) {
    if (editId && g.id === editId) continue;
    if (g.room !== room) continue;
    if (!g.timeStart || !g.timeEnd) continue;
    const gS = timeToMin(g.timeStart),
      gE = timeToMin(g.timeEnd);
    if (newS < gE && newE > gS) return g;
  }
  return null;
}
function liveCheckConflict(editId) {
  const room = (document.getElementById("f-room")?.value || "").trim();
  const ts = document.getElementById("f-timestart")?.value || "";
  const te = document.getElementById("f-timeend")?.value || "";
  const warn = document.getElementById("room-conflict-warn");
  if (!warn) return;
  if (ts && te && timeToMin(te) <= timeToMin(ts)) {
    warn.classList.add("show");
    warn.innerHTML = `⚠️ <b>Tugash vaqti boshlanish vaqtidan katta bo'lishi kerak!</b>`;
    return;
  }
  if (!room || !ts || !te) {
    warn.classList.remove("show");
    return;
  }
  const conflict = checkRoomConflict(room, ts, te, editId || null);
  if (conflict) {
    warn.classList.add("show");
    warn.innerHTML = `⚠️ <b>To'qnashuv!</b> Xona ${room} da ${conflict.name} guruhi allaqachon ${conflict.timeStart}–${conflict.timeEnd} vaqtida band.`;
  } else {
    warn.classList.remove("show");
  }
}
function phoneOnlyDigits(el) {
  el.value = el.value.replace(/[^\d+]/g, "");
}
function setExpFilter(val, btn) {
  _expFilter = val;
  document
    .querySelectorAll(".exp-pill")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  renderMentors();
}
function mentorPhotoSrc(m) {
  if (m && m.photo && m.photo.data && m.photo.type)
    return `data:${m.photo.type};base64,${m.photo.data}`;
  return null;
}
function mentorAvatarHtml(m, idx, size = "sm") {
  const src = mentorPhotoSrc(m);
  if (src) {
    const cls = size === "lg" ? "av-photo-lg" : "av-photo";
    return `<img class="${cls}" src="${src}" alt="${m.name}" onclick="event.stopPropagation();openLightbox('${src}')">`;
  }
  const cls = size === "lg" ? "detail-av" : "av";
  const style =
    size === "lg"
      ? ' style="font-size:24px;width:68px;height:68px;border-radius:50%"'
      : "";
  return `<div class="${cls} ${AV_CLS[idx % 5]}"${style}>${ini(m.name)}</div>`;
}
function updateGroupFilters() {
  const cs = document.getElementById("fg-course");
  const ms = document.getElementById("fg-mentor");
  if (!cs || !ms) return;
  const cv = cs.value,
    mv = ms.value;
  cs.innerHTML =
    `<option value="">${t("all_courses")}</option>` +
    D.courses
      .map(
        (c) =>
          `<option value="${c.name}" ${cv === c.name ? "selected" : ""}>${c.name}</option>`,
      )
      .join("");
  ms.innerHTML =
    `<option value="">${t("all_mentors")}</option>` +
    D.mentors
      .map(
        (m) =>
          `<option value="${m.name}" ${mv === m.name ? "selected" : ""}>${m.name}</option>`,
      )
      .join("");
}
function updateStudentCourseFilter() {
  const sel = document.getElementById("filter-student-course");
  if (!sel) return;
  const v = sel.value;
  sel.innerHTML =
    `<option value="">${t("all_direction")}</option>` +
    D.courses
      .map(
        (c) =>
          `<option value="${c.name}" ${v === c.name ? "selected" : ""}>${c.name}</option>`,
      )
      .join("");
}

function setLang(lang, btn) {
  if (LANG === lang) return;
  LANG = lang;
  try {
    const raw = localStorage.getItem(UI_KEY);
    const u = raw ? JSON.parse(raw) : {};
    u.lang = lang;
    localStorage.setItem(UI_KEY, JSON.stringify(u));
  } catch(e){}
  try { _uiSettings.lang = lang; saveUI && saveUI(); } catch(e){}
  document.querySelectorAll(".lang-btn").forEach((b) => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  ["uz","ru","en"].forEach((l) => {
    const sb = document.getElementById("lb-" + l);
    if (sb) sb.classList.toggle("active", l === lang);
  });
  // === Instant in-place re-render across the whole app ===
  try { applyTranslations && applyTranslations(); } catch(e){}
  try { applyUISettings && applyUISettings(); } catch(e){}
  // Re-run every known panel renderer via the single authoritative dispatcher so
  // EVERY panel/section reflects the new language immediately (fixes a bug where
  // this used to call a hand-maintained list of function names that had drifted
  // out of sync with the real renderer names, so many panels silently never
  // re-rendered on language switch — renderCurrentView() is kept correct in one place).
  try { renderCurrentView && renderCurrentView(); } catch(e){}
  // Finally re-activate current tab so it is freshly rendered
  if (typeof go === "function" && typeof currentTab !== "undefined" && currentTab) {
    try {
      var navBtn = document.querySelector(".nav-btn.active") || document.getElementById("nav-" + currentTab);
      go(currentTab, navBtn);
    } catch(e){}
  }
}

// ===================== FINANCE (FIX #5) =====================
// Finance now supports multiple years, not just 2026
function getAvailableFinanceYears() {
  const years = new Set();
  const now = new Date();
  years.add(now.getFullYear());
  years.add(2026); // always include
  if (D.finance) {
    D.finance.forEach((tx) => {
      const y = new Date(tx.date).getFullYear();
      if (y > 2020 && y < 2100) years.add(y);
    });
  }
  return Array.from(years).sort();
}

function getFinanceForMonth(month, year) {
  if (!D.finance) D.finance = [];
  return D.finance.filter((tx) => {
    const d = new Date(tx.date);
    return d.getFullYear() === year && d.getMonth() === month;
  });
}

// FIX #5: Month nav shows both months AND year selector
function renderFinanceMonthNav() {
  const nav = document.getElementById("fin-month-nav");
  const years = getAvailableFinanceYears();
  const monthNames = getMonthNames(true);

  // Year buttons + month buttons
  let html = "";
  // Year selector row
  html += `<div style="display:flex;align-items:center;gap:4px;padding:4px 8px;border-right:1px solid var(--border);flex-shrink:0">`;
  years.forEach((y) => {
    html += `<button class="fin-month-btn ${y === _finYear ? "active" : ""}" onclick="setFinYear(${y})" style="font-weight:800">${y}</button>`;
  });
  html += `</div>`;
  // Month buttons
  monthNames.forEach((m, idx) => {
    html += `<button class="fin-month-btn ${idx === _finMonth && _finYear === _finYear ? "active" : ""}" onclick="setFinMonth(${idx},${_finYear})" ${idx === _finMonth ? 'style="background:linear-gradient(135deg,var(--accent),var(--teal));color:#fff;box-shadow:var(--shadow-sm)"' : ""}>${m}</button>`;
  });

  nav.innerHTML = html;
  setTimeout(() => {
    const a = nav.querySelector(".active[style]");
    if (a) a.scrollIntoView({ block: "nearest", inline: "center" });
  }, 50);
}

function setFinYear(y) {
  _finYear = y;
  renderFinance();
}
function setFinMonth(m, y) {
  _finMonth = m;
  _finYear = y;
  renderFinance();
}

function renderFinanceSummary() {
  const txs = getFinanceForMonth(_finMonth, _finYear);
  let totalIncome = 0,
    totalExpense = 0,
    totalSalary = 0;
  txs.forEach((tx) => {
    if (tx.type === "income") totalIncome += tx.amount;
    else if (tx.type === "expense") totalExpense += tx.amount;
    else if (tx.type === "salary") totalSalary += tx.amount;
  });
  const balance = totalIncome - (totalExpense + totalSalary);
  const monthName = getMonthName(_finMonth, false) + " " + _finYear;

  document.getElementById("fin-summary-row").innerHTML = `
    <div class="fin-summary-card fin-sc-income">
      <div class="fin-sc-icon">💚</div>
      <div class="fin-sc-val" style="color:var(--teal-text)">${fmtMoney(totalIncome)} so'm</div>
      <div class="fin-sc-label">${t("income")} — ${monthName}</div>
    </div>
    <div class="fin-summary-card fin-sc-expense">
      <div class="fin-sc-icon">🔴</div>
      <div class="fin-sc-val" style="color:var(--orange-text)">${fmtMoney(totalExpense)} so'm</div>
      <div class="fin-sc-label">${t("expense")} — ${monthName}</div>
    </div>
    <div class="fin-summary-card fin-sc-salary">
      <div class="fin-sc-icon">🎓</div>
      <div class="fin-sc-val" style="color:var(--purple-text)">${fmtMoney(totalSalary)} so'm</div>
      <div class="fin-sc-label">${t("salary")} — ${monthName}</div>
    </div>
    <div class="fin-summary-card fin-sc-balance">
      <div class="fin-sc-icon">${balance >= 0 ? "📈" : "📉"}</div>
      <div class="fin-sc-val" style="color:${balance >= 0 ? "var(--accent-text)" : "var(--orange-text)"}">${balance >= 0 ? "+" : ""}${fmtMoney(balance)} so'm</div>
      <div class="fin-sc-label">Balans — ${monthName}</div>
    </div>
  `;
}

function renderFinanceList() {
  const filterType = document.getElementById("fin-filter-type")?.value || "";
  let txs = getFinanceForMonth(_finMonth, _finYear);
  if (filterType) txs = txs.filter((tx) => tx.type === filterType);
  txs = txs.slice().sort((a, b) => new Date(b.date) - new Date(a.date));

  const container = document.getElementById("fin-transactions");
  if (!txs.length) {
    container.innerHTML = `<div class="empty"><div class="empty-ic">💰</div><div class="empty-txt">Bu oyda tranzaksiya yo'q</div></div>`;
    return;
  }
  const typeIcon = { income: "💚", expense: "🔴", salary: "🎓" };
  const typeClass = {
    income: "fin-tx-income",
    expense: "fin-tx-expense",
    salary: "fin-tx-salary",
  };
  const typeName = {
    income: t("income"),
    expense: t("expense"),
    salary: t("salary"),
  };
  const amountClass = {
    income: "fin-tx-amount-income",
    expense: "fin-tx-amount-expense",
    salary: "fin-tx-amount-salary",
  };
  const sign = { income: "+", expense: "−", salary: "−" };

  container.innerHTML = `
    <div class="fin-tx-header">
      <div></div>
      <div>Nomi / Tavsif</div>
      <div>Sana</div>
      <div>Tur</div>
      <div>Summa</div>
      <div style="text-align:right">Amal</div>
    </div>
    ${txs
      .map(
        (tx) => `
      <div class="fin-tx-row">
        <div><div class="fin-tx-icon ${typeClass[tx.type]}">${typeIcon[tx.type]}</div></div>
        <div>
          <div class="fin-tx-name">${tx.title || "—"}</div>
          <div class="fin-tx-desc">${tx.description || ""}</div>
        </div>
        <div style="font-size:12px;color:var(--text2)">${fmtDateTime(tx.date)}</div>
        <div><span class="badge ${tx.type === "income" ? "b-teal" : tx.type === "salary" ? "b-purple" : "b-orange"}">${typeName[tx.type]}</span></div>
        <div class="${amountClass[tx.type]}">${sign[tx.type]}${fmtMoney(tx.amount)} so'm</div>
        <div style="text-align:right"><button class="fin-tx-del" onclick="deleteFinTx(${tx.id})" title="O'chirish">🗑</button></div>
      </div>
    `,
      )
      .join("")}
  `;
}

// FIX #5: Update filter select options with translated text
function renderFinance() {
  // Update filter options with current language
  const filterSel = document.getElementById("fin-filter-type");
  if (filterSel) {
    const curVal = filterSel.value;
    filterSel.innerHTML = `
      <option value="">${t("all_")}</option>
      <option value="income">💚 ${t("income")}</option>
      <option value="expense">🔴 ${t("expense")}</option>
      <option value="salary">🎓 ${t("salary")}</option>
    `;
    filterSel.value = curVal;
  }
  renderFinanceMonthNav();
  renderFinanceSummary();
  renderFinanceList();
}

async function deleteFinTx(id) {
  if (!(await crmConfirm("Bu tranzaksiyani o'chirasizmi?", { danger: true }))) return;
  D.finance = D.finance.filter((tx) => tx.id !== id);
  saveData();
  renderFinance();
  toast("🗑 O'chirildi");
}

function openFinModal(type, data = {}) {
  _finModal_type = type;
  _finModal_editId = data.id || null;
  const titles = {
    income: "💚 " + t("income") + " qo'shish",
    expense: "🔴 " + t("expense") + " qo'shish",
  };
  document.getElementById("fin-modal-title").textContent =
    titles[type] || "Qo'shish";
  const today = new Date().toISOString().slice(0, 16);
  document.getElementById("fin-modal-body").innerHTML = `
    <div class="fg"><label>Nomi <span class="req">*</span></label>
      <input id="fin-title" placeholder="${type === "income" ? "Masalan: Jasur Mirzayev to'lovi" : "Masalan: Internet to'lovi"}" value="${data.title || ""}">
    </div>
    <div class="fg"><label>Tavsif (ixtiyoriy)</label>
      <textarea id="fin-desc" rows="2" placeholder="Qo'shimcha ma'lumot...">${data.description || ""}</textarea>
    </div>
    <div class="form-row">
      <div class="fg"><label>Summa (so'm) <span class="req">*</span></label>
        <input id="fin-amount" type="number" min="0" placeholder="500 000" value="${data.amount || ""}">
      </div>
      <div class="fg"><label>Sana va vaqt <span class="req">*</span></label>
        <input id="fin-date" type="datetime-local" value="${data.date ? data.date.slice(0, 16) : today}">
      </div>
    </div>
    ${
      type === "income"
        ? `
    <div class="fg"><label>Talaba (ixtiyoriy)</label>
      <select id="fin-student">
        <option value="">— Talabani tanlang —</option>
        ${D.students.map((s) => `<option value="${s.id}" ${data.studentId == s.id ? "selected" : ""}>${s.name} — ${groupLabel(s.groupId)}</option>`).join("")}
      </select>
    </div>`
        : ""
    }
  `;
  document.getElementById("fin-overlay").classList.add("open");
  setTimeout(() => document.getElementById("fin-title")?.focus(), 100);
}
function closeFinModal() {
  document.getElementById("fin-overlay").classList.remove("open");
}
function saveFinTransaction() {
  const title = (document.getElementById("fin-title")?.value || "").trim();
  const amount = parseFloat(document.getElementById("fin-amount")?.value || 0);
  const date = document.getElementById("fin-date")?.value;
  if (!title) {
    toast("⚠️ Nomni kiriting!");
    return;
  }
  if (!amount || amount <= 0) {
    toast("⚠️ Summani kiriting!");
    return;
  }
  if (!date) {
    toast("⚠️ Sanani kiriting!");
    return;
  }
  const studentId = document.getElementById("fin-student")?.value || null;
  const tx = {
    id: newId(),
    type: _finModal_type,
    title,
    description: (document.getElementById("fin-desc")?.value || "").trim(),
    amount,
    date: new Date(date).toISOString(),
    studentId: studentId ? parseInt(studentId) : null,
    createdAt: new Date().toISOString(),
  };
  if (!D.finance) D.finance = [];
  D.finance.push(tx);
  saveData();
  closeFinModal();
  renderFinance();
  if (tx.type === "income" && tx.studentId) {
    const s = D.students.find((x) => x.id === tx.studentId);
    if (s) {
      // To'lov qilingan har bir talaba — avvalgi holatidan (Faolsiz/Muzlatilgan/
      // Probatsiya/qarzdor) qat'i nazar — har doim "Aktiv" holatga o'tkaziladi.
      const wasDebtor = s.isDebtor;
      s.isDebtor = false;
      s.status = "Aktiv";
      saveData();
      updateCounts();
      renderStudents();
      if (typeof renderDashboard === "function") renderDashboard();
      // Davomat (attendance) jadvali ochiq bo'lsa — statusni shu yerda ham
      // darhol yangilaymiz, shunda "To'lov -> Aktiv" o'zgarishi davomatda ham ko'rinadi.
      if (
        typeof _attGid === "number" &&
        s.groupId === _attGid &&
        typeof _renderAttTable === "function"
      ) {
        _renderAttTable(_attGid, _attMonth, _attYear);
      }
      toast(
        wasDebtor
          ? "✅ Kirim qo'shildi + " + s.name + " qarzdorlikdan chiqdi!"
          : "✅ Kirim qo'shildi + " + s.name + " Aktiv holatga o'tkazildi!",
      );
    } else toast("✅ Kirim qo'shildi!");
  } else {
    toast("✅ " + (tx.type === "income" ? "Kirim" : "Chiqim") + " qo'shildi!");
  }
}

// Izoh matnini input value ichiga xavfsiz qo'yish uchun
function salEsc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function openMentorSalaryModal() {
  const monthName = getMonthName(_finMonth, false) + " " + _finYear;
  const txs = getFinanceForMonth(_finMonth, _finYear);
  const paidSalaries = txs.filter((t_) => t_.type === "salary");

  const mentorRows = D.mentors.map((m) => {
    const mGroups = D.groups.filter((g) => g.mentor === m.name);
    const mStudentIds = D.students
      .filter((s) => mGroups.some((g) => g.id === s.groupId))
      .map((s) => s.id);
    let mentorIncome = 0;
    txs
      .filter(
        (t_) =>
          t_.type === "income" &&
          t_.studentId &&
          mStudentIds.includes(t_.studentId),
      )
      .forEach((t_) => (mentorIncome += t_.amount));
    if (mentorIncome === 0) {
      mGroups.forEach((g) => {
        const grpStudents = D.students.filter((s) => s.groupId === g.id);
        const cp = getCoursePrice(g.course);
        const lp = cp > 0 ? Math.round(cp / LESSON_COUNT) : 0;
        grpStudents.forEach((s) => {
          const attKey = "att_" + g.id + "_" + _finYear + "_" + _finMonth;
          const sAtt =
            (D.attendance[attKey] && D.attendance[attKey]["s" + s.id]) || {};
          let payLessons = 0;
          for (let l = 1; l <= LESSON_COUNT; l++) {
            const v = sAtt["l" + l] || "";
            // K, Y va S — uchalasi ham to'lovga kiradi
            if (v === "K" || v === "Y" || v === "S") payLessons++;
          }
          mentorIncome += payLessons * lp;
        });
      });
    }
    // 20% — faqat TAVSIYA. Yakuniy summani admin o'zi yozadi.
    const suggested = Math.round(mentorIncome * MENTOR_SALARY_PCT);
    const paidTx = paidSalaries.find((t_) => t_.mentorId === m.id) || null;
    return { mentor: m, mentorIncome, suggested, paidTx, mGroups, mStudentIds };
  });

  const totalSent = mentorRows.reduce(
    (s, r) => s + (r.paidTx ? r.paidTx.amount : 0),
    0,
  );

  const tSalary = (uz, ru, en) => (L === "ru" ? ru : L === "en" ? en : uz);

  // Jadval o'rniga kartochkalar: 6 ustunli jadval telefonda gorizontal
  // skrollga majburlar va ustunlar qisilib o'qib bo'lmas edi. Kartochka
  // tartibi keng ekranda 2 ustun, torda esa 1 ustunga tushadi.
  document.getElementById("salary-modal-body").innerHTML = `
    <div class="sal-note">💡<div><b>${tSalary("Qoida", "Правило", "Rule")}:</b> ${tSalary(
      "Oylik summasini <b>admin o'zi yozadi</b> va mentorga jo'natadi. 20% — faqat tavsiya, xohlagancha o'zgartirsangiz bo'ladi.",
      "Сумму зарплаты <b>админ вводит сам</b> и отправляет ментору. 20% — только рекомендация, можно изменить.",
      "The <b>admin enters the amount</b> and sends it to the mentor. 20% is only a suggestion — change it freely.",
    )} ${tSalary("Bu oy", "Этот месяц", "This month")}: <b>${monthName}</b></div></div>
    <div class="sal-list">
      ${
        mentorRows.length
          ? ""
          : `<div class="sal-empty">${tSalary("Mentor yo'q", "Менторов нет", "No mentors")}</div>`
      }
      ${mentorRows
        .map(
          (row, i) => `
        <div class="sal-card${row.paidTx ? " is-paid" : ""}">
          <div class="sal-info">
            <div class="sal-head">
              ${mentorAvatarHtml(row.mentor, i, "sm")}
              <div class="sal-head-txt">
                <div class="sal-name">${salEsc(row.mentor.name)}</div>
                <div class="sal-sub">${salEsc(row.mentor.subject || "—")}</div>
              </div>
            </div>
            <div class="sal-groups">${
              row.mGroups
                .map((g) => `<span class="badge b-blue">${salEsc(g.name)}</span>`)
                .join("") ||
              `<span class="sal-sub">${tSalary("Guruh yo'q", "Нет групп", "No groups")}</span>`
            }</div>
            <div class="sal-meta">
              <span class="sal-chip sal-chip--income">${tSalary("Talabalar to'lovi", "Оплаты студентов", "Student payments")}: <b>${fmtMoney(row.mentorIncome)}</b> so'm</span>
              ${
                row.paidTx
                  ? `<span class="sal-chip sal-chip--paid">✅ ${tSalary("Jo'natildi", "Отправлено", "Sent")}: <b>${fmtMoney(row.paidTx.amount)}</b> so'm</span>`
                  : `<span class="sal-chip sal-chip--wait">⏳ ${tSalary("Jo'natilmagan", "Не отправлено", "Not sent")}</span>`
              }
            </div>
          </div>
          <div class="sal-pay">
            <div class="sal-field">
              <label for="sal-inp-${row.mentor.id}">${tSalary("Oylik summasi", "Сумма зарплаты", "Salary amount")}</label>
              <input id="sal-inp-${row.mentor.id}" type="number" min="0" step="1000" class="salary-amount-inp" value="${row.paidTx ? row.paidTx.amount : row.suggested || ""}" placeholder="${tSalary("Summa (so'm)", "Сумма (сум)", "Amount (sum)")}">
            </div>
            <div class="sal-field">
              <label for="sal-note-${row.mentor.id}">${tSalary("Izoh", "Комментарий", "Note")}</label>
              <input id="sal-note-${row.mentor.id}" type="text" class="salary-note-inp" value="${salEsc(row.paidTx && row.paidTx.note ? row.paidTx.note : "")}" placeholder="${tSalary("Ixtiyoriy", "Необязательно", "Optional")}">
            </div>
            <div class="salary-hint">💡 ${tSalary("Tavsiya", "Рекомендация", "Suggested")} (20%): <b>${fmtMoney(row.suggested)}</b> <button type="button" class="salary-hint-btn" onclick="useSuggestedSalary(${row.mentor.id},${row.suggested})">${tSalary("qo'yish", "поставить", "use")}</button></div>
            <div class="sal-actions">
              <button class="salary-pay-btn" onclick="paySalary(${row.mentor.id})">${row.paidTx ? `🔄 ${tSalary("Yangilash", "Обновить", "Update")}` : `💸 ${tSalary("Jo'natish", "Отправить", "Send")}`}</button>
              ${row.paidTx ? `<button class="salary-cancel-btn" title="${tSalary("Bekor qilish", "Отменить", "Cancel")}" onclick="cancelSalary(${row.mentor.id})">🗑</button>` : ""}
            </div>
          </div>
        </div>
      `,
        )
        .join("")}
    </div>
    <div class="sal-total">
      <span>${tSalary("Jo'natilgan oylik", "Отправлено зарплат", "Salaries sent")}: <b style="color:var(--purple-text)">${fmtMoney(totalSent)} so'm</b></span>
      <span>${tSalary("Mentorlar", "Менторы", "Mentors")}: <b style="color:var(--teal-text)">${mentorRows.filter((r) => r.paidTx).length} / ${mentorRows.length}</b></span>
    </div>
  `;
  document.getElementById("salary-overlay").classList.add("open");
}
function closeMentorSalaryModal() {
  document.getElementById("salary-overlay").classList.remove("open");
}
window.useSuggestedSalary = function (mentorId, amount) {
  const inp = document.getElementById("sal-inp-" + mentorId);
  if (!inp) return;
  inp.value = amount;
  inp.focus();
};
// Shu oy uchun mentorga jo'natilgan oylik tranzaksiyasi (bo'lmasa null)
function findMentorSalaryTx(mentorId, month, year) {
  return (
    getFinanceForMonth(
      month === undefined ? _finMonth : month,
      year === undefined ? _finYear : year,
    ).find((t_) => t_.type === "salary" && t_.mentorId === mentorId) || null
  );
}
window.paySalary = async function (mentorId) {
  const mentor = D.mentors.find((m) => m.id === mentorId);
  if (!mentor) return;
  const mentorName = mentor.name;
  const inp = document.getElementById("sal-inp-" + mentorId);
  const noteInp = document.getElementById("sal-note-" + mentorId);
  const amount = Math.round(Number(String((inp && inp.value) || "").trim()));
  if (!isFinite(amount) || amount <= 0) {
    toast("⚠️ Avval oylik summasini yozing!");
    if (inp) inp.focus();
    return;
  }
  const note = ((noteInp && noteInp.value) || "").trim();
  const period = getMonthName(_finMonth, false) + " " + _finYear;
  if (!D.finance) D.finance = [];
  const existing = findMentorSalaryTx(mentorId);
  if (existing) {
    if (
      !(await crmConfirm(
        `${mentorName} oyligi ${fmtMoney(existing.amount)} → ${fmtMoney(amount)} so'mga o'zgartirilsinmi?`,
      ))
    )
      return;
    existing.amount = amount;
    existing.note = note;
    existing.description = note || `${period} oyi uchun mentor oyligi`;
    existing.updatedAt = new Date().toISOString();
    saveData();
    toast(
      "✅ " + mentorName + " oyligi yangilandi: " + fmtMoney(amount) + " so'm",
    );
  } else {
    if (!(await crmConfirm(`${mentorName}ga ${fmtMoney(amount)} so'm oylik jo'natilsinmi?`)))
      return;
    D.finance.push({
      id: newId(),
      type: "salary",
      title: `${mentorName} — Oylik`,
      description: note || `${period} oyi uchun mentor oyligi`,
      note,
      amount,
      date: new Date(_finYear, _finMonth, 15).toISOString(),
      mentorId,
      createdAt: new Date().toISOString(),
    });
    saveData();
    toast(
      "✅ " + mentorName + "ga oylik jo'natildi: " + fmtMoney(amount) + " so'm",
    );
  }
  openMentorSalaryModal();
  renderFinance();
};
window.cancelSalary = async function (mentorId) {
  const mentor = D.mentors.find((m) => m.id === mentorId);
  if (!mentor) return;
  const existing = findMentorSalaryTx(mentorId);
  if (!existing) return;
  if (
    !(await crmConfirm(
      `${mentor.name}ga jo'natilgan ${fmtMoney(existing.amount)} so'm oylik bekor qilinsinmi?`,
      { danger: true },
    ))
  )
    return;
  D.finance = D.finance.filter((t_) => t_.id !== existing.id);
  saveData();
  toast("🗑 " + mentor.name + " oyligi bekor qilindi");
  openMentorSalaryModal();
  renderFinance();
};
