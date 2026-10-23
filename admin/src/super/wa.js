/** Saytlar analitikasi: davr tanlovi va formatlash yordamchilari. */
import { reactive, computed, watch } from "vue";

const KEY = "sa_wa_period";
let saved = null;
try {
  saved = JSON.parse(localStorage.getItem(KEY) || "null");
} catch {}
export const waPeriod = reactive(saved && saved.period ? saved : { period: "30", from: "", to: "" });
watch(
  waPeriod,
  (v) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(v));
    } catch {}
  },
  { deep: true },
);
export const WA_PERIODS = [
  ["today", "Bugun"],
  ["yesterday", "Kecha"],
  ["7", "7 kun"],
  ["30", "30 kun"],
  ["90", "90 kun"],
  ["month", "Joriy oy"],
  ["prevmonth", "Oldingi oy"],
  ["custom", "Oraliq"],
];
export const waQuery = computed(() =>
  waPeriod.period === "custom" && waPeriod.from && waPeriod.to
    ? { period: "custom", from: waPeriod.from, to: waPeriod.to }
    : { period: waPeriod.period === "custom" ? "30" : waPeriod.period },
);

/** Sekund → "2 daq 05 s" */
export function dur(sec) {
  if (sec == null || !isFinite(sec)) return "—";
  sec = Math.round(sec);
  if (sec < 60) return sec + " s";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m} daq ${String(s).padStart(2, "0")} s`;
  return `${Math.floor(m / 60)} soat ${m % 60} daq`;
}
export const money = (v) => (v == null || !isFinite(v) ? "—" : String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " so'm");
export const num = (v) => (v == null || !isFinite(v) ? "—" : String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, " "));
export const pct = (v) => (v == null || !isFinite(v) ? "—" : Math.round(v * 10) / 10 + "%");
/** O'zgarish foizi (oldingi davrga nisbatan). */
export function change(cur, prev) {
  if (cur == null || prev == null) return null;
  if (prev === 0) return cur === 0 ? 0 : null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}
export const EVENT_LABEL = {
  session_start: "Sessiya boshlandi",
  page_view: "Sahifa ko'rildi",
  page_exit: "Sahifadan chiqildi",
  scroll: "Scroll",
  click: "Tugma bosildi",
  form_submit: "Forma yuborildi",
  lead: "Lead",
  purchase: "Xarid",
  conversion: "Konversiya",
};
export const GOAL_TYPES = [
  ["page", "Sahifaga kirish (yo'l)"],
  ["event", "Hodisa nomi"],
  ["click", "Tugma (data-ufq-event)"],
  ["form", "Forma yuborilishi"],
];
