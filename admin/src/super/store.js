/** Umumiy holat: davr tanlagichi, mavzu, bildirishnomalar va formatlash. */
import { reactive, computed, watch } from "vue";

const LS = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};

// ── Davr ──────────────────────────────────────────────────────────────────
export const period = reactive(LS.get("sa_period", { period: "30", from: "", to: "" }));
watch(period, (v) => LS.set("sa_period", v), { deep: true });
export const periodQuery = computed(() =>
  period.period === "custom" && period.from && period.to
    ? { period: "custom", from: period.from, to: period.to }
    : { period: period.period === "custom" ? "30" : period.period },
);
export const PERIODS = [
  ["today", "Bugun"],
  ["7", "7 kun"],
  ["30", "30 kun"],
  ["90", "90 kun"],
  ["custom", "Oraliq"],
];

// ── Mavzu (yorug' / qorong'i) ─────────────────────────────────────────────
export const ui = reactive({ theme: LS.get("sa_theme", "auto"), navOpen: false, collapsed: LS.get("sa_collapsed", false) });
function applyTheme() {
  const t = ui.theme;
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
}
watch(() => ui.theme, (t) => (LS.set("sa_theme", t), applyTheme()));
watch(() => ui.collapsed, (v) => LS.set("sa_collapsed", v));
applyTheme();
export function isDark() {
  if (ui.theme === "dark") return true;
  if (ui.theme === "light") return false;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// ── Bildirishnomalar ──────────────────────────────────────────────────────
export const toasts = reactive([]);
let tid = 0;
export function toast(text, kind = "ok") {
  const id = ++tid;
  toasts.push({ id, text, kind });
  setTimeout(() => {
    const i = toasts.findIndex((t) => t.id === id);
    if (i >= 0) toasts.splice(i, 1);
  }, kind === "error" ? 6000 : 3500);
}

// ── Formatlash ────────────────────────────────────────────────────────────
const MONTHS = ["yan", "fev", "mar", "apr", "may", "iyun", "iyul", "avg", "sen", "okt", "noy", "dek"];
export const fmt = {
  n(v, d = 1) {
    if (v == null || !isFinite(v)) return "—";
    const p = 10 ** d;
    return String(Math.round(v * p) / p).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  },
  int(v) {
    return v == null || !isFinite(v) ? "—" : String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  },
  pct(v) {
    return v == null || !isFinite(v) ? "—" : String(Math.round(v * 10) / 10) + "%";
  },
  delta(v, unit = "") {
    if (v == null || !isFinite(v)) return "";
    const r = Math.round(v * 10) / 10;
    return (r > 0 ? "+" : r < 0 ? "−" : "±") + Math.abs(r) + unit;
  },
  day(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
    return m ? `${+m[3]}-${MONTHS[+m[2] - 1]} ${m[1]}` : s || "—";
  },
  dt(v) {
    if (!v) return "—";
    const d = new Date(v);
    if (isNaN(d)) return "—";
    return `${d.getDate()}-${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  },
  ago(v) {
    if (!v) return "hech qachon";
    const s = Math.round((Date.now() - new Date(v).getTime()) / 1000);
    if (s < 60) return "hozirgina";
    if (s < 3600) return Math.floor(s / 60) + " daqiqa oldin";
    if (s < 86400) return Math.floor(s / 3600) + " soat oldin";
    if (s < 86400 * 30) return Math.floor(s / 86400) + " kun oldin";
    return fmt.dt(v);
  },
  dur(sec) {
    if (sec == null) return "—";
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
    return d ? `${d} kun ${h} soat` : h ? `${h} soat ${m} daqiqa` : `${m} daqiqa`;
  },
};
export const NO_DATA = "Ma'lumot yetarli emas";
export const roleName = (r) =>
  ({ superadmin: "Super Admin", admin: "Admin", mentor: "Mentor", student: "Talaba", system: "Tizim" })[r] || r || "—";
