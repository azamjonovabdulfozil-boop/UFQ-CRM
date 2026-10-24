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
  session_start: "Saytga kirdi",
  page_view: "Sahifani ochdi",
  page_exit: "Sahifadan chiqdi",
  scroll: "Sahifani pastga aylantirdi",
  click: "Tugmani bosdi",
  form_submit: "Forma yubordi",
  lead: "Ariza qoldirdi",
  purchase: "Xarid qildi",
  conversion: "Maqsadga yetdi",
};
export const GOAL_TYPES = [
  ["page", "Sahifa ochilsa"],
  ["form", "Forma yuborilsa"],
  ["click", "Tugma bosilsa"],
  ["event", "Maxsus hodisa (dasturchi uchun)"],
];

/** Sahifa analitikasi uchun oddiy tilda xulosa gaplari. */
export function plainSummary(d, periodLabel) {
  const c = d.kpis.cur;
  const p = d.kpis.prev;
  const out = [];
  if (!c.sessions) {
    out.push({ icon: "info", tone: "mute", html: `${periodLabel ? esc(periodLabel) + " davomida" : "Bu davrda"} saytga hech kim kirmadi.` });
    return out;
  }
  const ch = change(c.sessions, p.sessions);
  const cmp =
    ch == null ? "" : ch === 0 ? " Oldingi shunday davr bilan bir xil." : ` Oldingi shunday davrga nisbatan <b class="${ch > 0 ? "up" : "down"}">${Math.abs(ch)}% ${ch > 0 ? "ko'p" : "kam"}</b>.`;
  out.push({ icon: "users", tone: "info", html: `Saytga <b>${num(c.sessions)} marta</b> kirishdi, ularni <b>${num(c.visitors)} kishi</b> (qurilma) amalga oshirdi.${cmp}` });
  const src = (d.sources || [])[0];
  if (src) out.push({ icon: "link", tone: "info", html: `Ko'pchilik <b>${esc(src.key)}</b> orqali keldi — barcha tashriflarning <b>${pct(src.share)}</b>.` });
  const pg = (d.pages || []).slice().sort((a, b) => b.views - a.views)[0];
  if (pg) out.push({ icon: "doc", tone: "info", html: `Eng ko'p ochilgan sahifa — <b class="mono">${esc(pg.path)}</b> (${num(pg.views)} marta).` });
  const phone = (d.devices || []).find((x) => x.key === "Telefon");
  if (phone) out.push({ icon: "phone", tone: "info", html: `Tashriflarning <b>${pct(phone.share)}</b> telefondan bo'ldi${phone.share >= 50 ? " — saytning telefon ko'rinishi muhim" : ""}.` });
  if (c.avgDuration != null) out.push({ icon: "clock", tone: "info", html: `Odamlar saytda o'rtacha <b>${dur(c.avgDuration)}</b> qolishdi, har safar <b>${c.pagesPerSession ?? "—"}</b> ta sahifa ko'rishdi.` });
  if (c.bounceRate != null) {
    const b = Math.round(c.bounceRate);
    const bad = b >= 60;
    out.push({
      icon: bad ? "alert" : "check",
      tone: bad ? "warn" : "good",
      html: `Har 100 kishidan <b>${b} tasi</b> bitta sahifani ko'rib, darhol chiqib ketdi${bad ? " — bu ko'p: birinchi ochiladigan sahifalarni yaxshilang" : " — bu yaxshi ko'rsatkich"}.`,
    });
  }
  if (c.conversions > 0)
    out.push({ icon: "target", tone: "good", html: `<b>${num(c.conversions)} ta natija</b> bo'ldi (ariza, xarid va h.k.) — har 100 tashrifdan <b>${Math.round((c.conversionRate || 0) * 10) / 10} tasi</b>.${c.leads ? ` Shundan <b>${num(c.leads)} tasi ariza</b>.` : ""}` });
  else
    out.push({ icon: "target", tone: "mute", html: (d.goals || []).length ? "Bu davrda birorta ham natija (ariza, xarid) bo'lmadi." : "Natijalar hisoblanmayapti — «Sozlamalar»da nimani natija deb hisoblashni belgilang (masalan, ariza formasi)." });
  const h = d.hourly || [];
  const mx = Math.max(0, ...h);
  if (mx > 0) {
    const i = h.indexOf(mx);
    out.push({ icon: "chart", tone: "info", html: `Eng faol vaqt — soat <b>${String(i).padStart(2, "0")}:00–${String((i + 1) % 24).padStart(2, "0")}:00</b>.` });
  }
  return out;
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}
