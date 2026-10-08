/**
 * useCrmBoot — CRM yadrosining core skriptlarini yuklaydigan composable.
 *
 * Belgilash (markup) endi to'liq Vue komponentlarida (components/shell/).
 * Bu composable faqat CSS + vanilla core skriptlarni to'g'ri tartibda ulaydi:
 * skriptlar `document.getElementById` bilan ishlagani uchun ular komponentlar
 * DOM ga tushganidan KEYIN, ya'ni onMounted ichida yuklanadi.
 * Uchala portal (admin / mentor / talaba) shuni ishlatadi, farqi faqat rolda.
 */

import { ref, onMounted, onUnmounted } from "vue";

// Tartib muhim: har bir script keyingisiga bog'liq bo'lishi mumkin.
// Shuning uchun dependency group larga bo'lamiz va har group parallel yuklanadi.
export const SCRIPT_GROUPS = [
  // Group 0: ikonkalar — hammasidan OLDIN.
  // Observer shundan keyingi har bir render'ni qamrab oladi.
  ["icons.js"],
  // Group 0.2: modal oynalar (crmAlert/crmConfirm/crmPrompt) — brauzerning
  // alert/confirm/prompt oynalari o'rniga. Boshqa skriptlar undan foydalanadi,
  // shuning uchun eng boshida yuklanadi.
  ["ui-dialog.js"],
  // Group 0.5: sessiya qatlami — backend-storage.js dan OLDIN bo'lishi SHART.
  // U window.fetch ni o'rab, har bir /api/ so'roviga token qo'shadi; keyingi
  // o'ramalar (backend-storage) uning ustiga qo'yiladi.
  ["secure-auth.js"],
  // Group 1: mustaqil util scriptlar — parallel
  ["backend-storage.js", "constants-i18n-ui.js"],
  // Group 2: auth (constants kerak)
  ["auth.js"],
  // Group 3: data scriptlar — parallel
  ["data-finance.js", "ai-assistant.js"],
  // Group 4: student-dashboard BIRINCHI (grading uni patch qiladi)
  ["student-dashboard.js", "attendance-render.js", "coin-system.js"],
  // telegram-bridge setAtt() ni o'raydi — shuning uchun attendance-render.js
  // dan KEYIN yuklanishi shart (aks holda o'ramay chiqib ketadi).
  ["telegram-bridge.js"],
  // Group 5: student-dashboard ga bog'liq — parallel
  ["grading-tests-mentor.js", "student-pages-video.js"],
  // Group 6: coin-system va forms — parallel
  ["mentor-coin-give.js", "forms-credentials.js"],
  // Group 7: live-sync + responsive-ui (oxirida, hammasi yuklanganidan keyin)
  // Kengaytirilgan dashboard analitikasi — render funksiyalarini o'raydi
  ["dash-analytics.js"],
  ["live-sync.js", "responsive-ui.js"],
];

// Tartib muhim: responsive qatlam edu-styles.css dan keyin kelishi shart.
const STYLESHEETS = ["edu-styles.css", "responsive.css"];

// CSS ni <head> ga preload qilib oldindan boshlash
// Build belgisi — fayl nomi o'zgarmagani uchun brauzer eski nusxani
// keshdan olmasin (yangi build = yangi ?v=).
const BUILD_ID =
  typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : String(Date.now());
const v = (url) => url + (url.includes("?") ? "&" : "?") + "v=" + BUILD_ID;

function preloadCSS(base, name) {
  const href = v(base + name);
  if (document.querySelector(`link[data-crm-css="${name}"]`)) return;
  // Preload link — brauzer CSS ni yuklab, render blockmaysiz
  const pre = document.createElement("link");
  pre.rel = "preload";
  pre.as = "style";
  pre.href = href;
  pre.setAttribute("data-crm-pre", name);
  document.head.appendChild(pre);
  // Haqiqiy stylesheet
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = href;
  l.setAttribute("data-crm-css", name);
  document.head.appendChild(l);
}

function loadScript(coreBase, name) {
  return new Promise((resolve, reject) => {
    document.querySelector(`script[data-crm="${name}"]`)?.remove();
    const s = document.createElement("script");
    s.src = v(coreBase + name);
    s.setAttribute("data-crm", name);
    s.onload = resolve;
    s.onerror = () => reject(new Error("Yuklanmadi: " + name));
    document.body.appendChild(s);
  });
}

/**
 * Login qilgan foydalanuvchi roli mos kelmasa, portalga kiritmaydi.
 * window.showApp() ni o'rab qo'yamiz — core skriptlar login muvaffaqiyatli
 * bo'lganda aynan shuni chaqiradi.
 */
function guardRole(role, portalLabel) {
  const orig = window.showApp;
  if (!orig) return;
  window.showApp = function () {
    const user = typeof getCurrentUser === "function" ? getCurrentUser() : {};
    if (user.role !== role) {
      if (typeof _authDelete === "function") _authDelete();
      const errEl = document.getElementById("login-err");
      if (errEl) {
        errEl.textContent = `🚫 Bu portal faqat ${portalLabel} uchun!`;
        errEl.style.display = "block";
      }
      const passEl = document.getElementById("login-pass");
      if (passEl) {
        passEl.value = "";
        passEl.focus();
      }
      return;
    }
    orig.call(this);
  };
}

/**
 * @param {object} opts
 * @param {string} opts.role        Ruxsat etilgan rol (masalan "Mentor")
 * @param {string} opts.portalLabel Xato matnida ko'rinadigan nom
 * @param {string} opts.logTag      console dagi teg
 */
export function useCrmBoot({ role, portalLabel, logTag }) {
  const booting = ref(true);
  const bootError = ref(null);

  const raw = import.meta.env.BASE_URL || "/";
  const base = raw.endsWith("/") ? raw : raw + "/";
  const coreBase = base + "core/";

  function reload() {
    location.reload();
  }

  onMounted(async () => {
    try {
      STYLESHEETS.forEach((name) => preloadCSS(base, name));

      // onMounted da farzand komponentlar allaqachon DOM da —
      // core skriptlar kerakli elementlarni darrov topadi.
      // Script grouplarni ketma-ket, lekin har group ichida parallel
      for (const group of SCRIPT_GROUPS) {
        await Promise.all(group.map((name) => loadScript(coreBase, name)));
      }

      guardRole(role, portalLabel);

      if (typeof window.__crmBoot === "function") {
        window.__crmBoot();
      }
      booting.value = false;
    } catch (err) {
      console.error(`[${logTag} Boot]`, err);
      bootError.value = err.message;
      booting.value = false;
    }
  });

  onUnmounted(() => {
    SCRIPT_GROUPS.flat().forEach((name) => {
      document.querySelector(`script[data-crm="${name}"]`)?.remove();
    });
  });

  return { booting, bootError, reload };
}
