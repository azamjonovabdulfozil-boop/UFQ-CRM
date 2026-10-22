/**
 * superadmin/util.js — sana, davr va raqam yordamchilari.
 *
 * Barcha kalendar sanalari "YYYY-MM-DD" satri ko'rinishida, TANLANGAN vaqt
 * mintaqasida (sukut: Asia/Tashkent) hisoblanadi. Server UTC da ishlasa ham
 * "bugun" va "dars kuni" O'zbekiston vaqti bo'yicha to'g'ri chiqadi.
 */

export const DAY_MS = 86400000;
export const DEFAULT_TZ = "Asia/Tashkent";

const fmtCache = new Map();
function dayFormatter(tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    fmtCache.set(tz, f);
  }
  return f;
}

export function isValidTz(tz) {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: String(tz) });
    return true;
  } catch {
    return false;
  }
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Har qanday sana qiymatini mintaqadagi "YYYY-MM-DD" ga keltiradi; noto'g'ri bo'lsa null. */
export function dayOf(v, tz = DEFAULT_TZ) {
  if (v == null || v === "") return null;
  if (typeof v === "string") {
    const s = v.trim();
    if (DAY_RE.test(s)) return s;
  }
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return null;
  return dayFormatter(tz).format(d);
}

export const todayIn = (tz = DEFAULT_TZ) => dayOf(new Date(), tz);

export function addDays(day, n) {
  const m = DAY_RE.exec(day);
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]) + n * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

export function diffDays(a, b) {
  const ma = DAY_RE.exec(a), mb = DAY_RE.exec(b);
  if (!ma || !mb) return null;
  return Math.round((Date.UTC(+mb[1], +mb[2] - 1, +mb[3]) - Date.UTC(+ma[1], +ma[2] - 1, +ma[3])) / DAY_MS);
}

/** Kalendar sananing hafta kuni (0 = yakshanba) — mintaqaga bog'liq emas. */
export function weekdayOf(day) {
  const m = DAY_RE.exec(day);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay() : null;
}

export const pad2 = (n) => String(n).padStart(2, "0");
export const ymd = (y, m0, d) => `${y}-${pad2(m0 + 1)}-${pad2(d)}`;

/** Haftaning dushanbasi — haftalik guruhlash uchun. */
export function weekStart(day) {
  const wd = weekdayOf(day);
  return wd == null ? null : addDays(day, -((wd + 6) % 7));
}

const MONTHS = ["yan", "fev", "mar", "apr", "may", "iyun", "iyul", "avg", "sen", "okt", "noy", "dek"];
export function fmtDay(day) {
  const m = DAY_RE.exec(day || "");
  return m ? `${+m[3]}-${MONTHS[+m[2] - 1]} ${m[1]}` : "—";
}

/**
 * So'rovdagi davrni o'qiydi.
 *   period=today|7|30|90|custom, from=YYYY-MM-DD, to=YYYY-MM-DD
 * @returns {{key, from, to, days, label}}
 */
export function parseRange(q, tz = DEFAULT_TZ) {
  const today = todayIn(tz);
  const key = String(q?.period || "30");
  if (key === "custom") {
    const f = DAY_RE.test(String(q?.from || "")) ? String(q.from) : null;
    const t = DAY_RE.test(String(q?.to || "")) ? String(q.to) : null;
    if (f && t && f <= t) {
      const days = diffDays(f, t) + 1;
      if (days <= 731) return { key, from: f, to: t, days, label: `${fmtDay(f)} — ${fmtDay(t)}` };
    }
  }
  const n = key === "today" ? 1 : [7, 30, 90].includes(Number(key)) ? Number(key) : 30;
  const from = addDays(today, -(n - 1));
  return {
    key: key === "today" ? "today" : String(n),
    from,
    to: today,
    days: n,
    label: n === 1 ? `Bugun, ${fmtDay(today)}` : `Oxirgi ${n} kun (${fmtDay(from)} — ${fmtDay(today)})`,
  };
}

/** Oldingi teng uzunlikdagi davr — bir xil mezon bilan taqqoslash uchun. */
export function prevRange(r) {
  const to = addDays(r.from, -1);
  const from = addDays(to, -(r.days - 1));
  return { key: "prev", from, to, days: r.days, label: `${fmtDay(from)} — ${fmtDay(to)}` };
}

export const inRange = (day, r) => !!day && day >= r.from && day <= r.to;

export function monthsBetween(fromDay, toDay) {
  const out = [];
  let y = +fromDay.slice(0, 4), m = +fromDay.slice(5, 7) - 1;
  const ty = +toDay.slice(0, 4), tm = +toDay.slice(5, 7) - 1;
  while (y < ty || (y === ty && m <= tm)) {
    out.push([y, m]);
    m++;
    if (m > 11) { m = 0; y++; }
  }
  return out;
}

export const round1 = (v) => (v == null || !isFinite(v) ? null : Math.round(v * 10) / 10);
export const pct = (a, b) => (b > 0 ? round1((a / b) * 100) : null);
export const avg = (arr) => (arr.length ? round1(arr.reduce((s, x) => s + x, 0) / arr.length) : null);
export const delta = (a, b) => (a == null || b == null ? null : round1(a - b));

export const clip = (v, n = 200) => String(v == null ? "" : v).slice(0, n);
export const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Telefon raqamini qisman yashirish: +998 90 *** ** 67 */
export function maskPhone(p) {
  const d = String(p || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length < 7) return "***";
  return "+" + d.slice(0, 5) + " *** ** " + d.slice(-2);
}

/** Mintaqadagi kun boshining (00:00) UTC vaqti — jurnalni davr bo'yicha filtrlash uchun. */
export function dayStartUtc(day, tz = DEFAULT_TZ) {
  const guess = Date.parse(day + "T00:00:00Z");
  if (isNaN(guess)) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(guess));
  const get = (t) => Number(parts.find((p) => p.type === t)?.value);
  const localAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess - (localAsUtc - guess));
}
