/**
 * webanalytics/core.js — saytlar analitikasining SOF hisob-kitoblari.
 *
 * Bu yerda baza ham, tarmoq ham yo'q: kirish — sessiyalar va hodisalar
 * massivi, chiqish — tayyor statistika. Shuning uchun hammasi testlanadi
 * (tests/webanalytics.test.mjs).
 *
 * Asosiy qoidalar:
 *   • Tashrif buyuruvchi = saytning o'z brauzer xotirasidagi tasodifiy
 *     psevdonim (vid). Turli qurilmalar BITTA odam deb hisoblanmaydi.
 *   • Sessiya 30 daqiqa faoliyatsizlikdan keyin tugaydi. Brauzer yopilib
 *     `page_exit` kelmagan bo'lsa — davomiylik oxirgi hodisagacha hisoblanadi
 *     va bunday sessiyalar "taxminiy" deb alohida sanaladi.
 *   • Manba faqat referrer yoki UTM dan aniqlanadi. Ikkalasi ham yo'q —
 *     "To'g'ridan-to'g'ri"; aniqlab bo'lmasa — "Noma'lum". Taxmin qilinmaydi.
 */

export const SESSION_TIMEOUT_MIN = 30;
export const EVENT_TYPES = ["session_start", "page_view", "page_exit", "scroll", "click", "form_submit", "lead", "purchase", "conversion"];
export const CONVERSION_TYPES = new Set(["conversion", "purchase", "lead"]);
export const BOUNCE_MAX_SEC = 10;

// ─── Sana va davrlar ──────────────────────────────────────────────────────────

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isDay = (s) => DAY_RE.test(String(s || ""));

export function dayIn(date, tz) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  } catch {
    return new Date(date).toISOString().slice(0, 10);
  }
}
export function hourIn(date, tz) {
  try {
    return Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(date)) % 24;
  } catch {
    return new Date(date).getUTCHours();
  }
}
export function addDays(day, n) {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const diffDays = (a, b) => Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000);

/** Mahalliy kun boshining UTC vaqti (vaqt zonasi siljishini hisobga olgan holda). */
export function dayStartUtc(day, tz) {
  const guess = new Date(day + "T00:00:00Z");
  // Shu lahzada tz dagi soat — siljishni topamiz (2 marta, DST uchun)
  let t = guess.getTime();
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(t));
    const g = (k) => Number(parts.find((p) => p.type === k)?.value);
    const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"));
    t = guess.getTime() - (asUtc - t);
  }
  return new Date(t);
}

export const PERIODS = ["today", "yesterday", "7", "30", "90", "month", "prevmonth", "custom"];
const MON = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const fmtDay = (d) => `${Number(d.slice(8))}-${MON[Number(d.slice(5, 7)) - 1]}`;

/** Davr: { key, from, to (mahalliy kunlar, ikkalasi ham kiradi), days, label, prev:{from,to} } */
export function resolveRange(q = {}, tz = "Asia/Tashkent", now = new Date()) {
  const today = dayIn(now, tz);
  let key = PERIODS.includes(String(q.period)) ? String(q.period) : "30";
  let from, to;
  if (key === "custom" && isDay(q.from) && isDay(q.to) && q.from <= q.to && diffDays(q.from, q.to) <= 730) {
    from = q.from;
    to = q.to;
  } else if (key === "today") from = to = today;
  else if (key === "yesterday") from = to = addDays(today, -1);
  else if (key === "month") {
    from = today.slice(0, 8) + "01";
    to = today;
  } else if (key === "prevmonth") {
    const firstThis = today.slice(0, 8) + "01";
    to = addDays(firstThis, -1);
    from = to.slice(0, 8) + "01";
  } else {
    if (key === "custom") key = "30";
    const n = Number(key);
    from = addDays(today, -(n - 1));
    to = today;
  }
  const days = diffDays(from, to) + 1;
  let prev;
  if (key === "month") {
    const pEnd = addDays(from, -1);
    const pFrom = pEnd.slice(0, 8) + "01";
    // Joriy oyning shu kunigacha bo'lgan qismi bilan solishtiriladi
    prev = { from: pFrom, to: [addDays(pFrom, days - 1), pEnd].sort()[0] };
  } else if (key === "prevmonth") {
    const pEnd = addDays(from, -1);
    prev = { from: pEnd.slice(0, 8) + "01", to: pEnd };
  } else prev = { from: addDays(from, -days), to: addDays(from, -1) };
  const label = from === to ? fmtDay(from) : `${fmtDay(from)} — ${fmtDay(to)}`;
  return { key, from, to, days, label, prev, tz };
}

export const rangeBounds = (r, tz) => ({ start: dayStartUtc(r.from, tz), end: dayStartUtc(addDays(r.to, 1), tz) });

// ─── URL, manba, qurilma ──────────────────────────────────────────────────────

/** Sayt URL ini tekshiradi va normallashtiradi. */
export function normalizeSiteUrl(raw) {
  let s = String(raw || "").trim();
  if (!s) return { ok: false, error: "URL kiritilmagan" };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = "https://" + s;
  let u;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, error: "URL noto'g'ri" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, error: "Faqat http yoki https manzil" };
  if (u.username || u.password) return { ok: false, error: "URL ichida login/parol bo'lmasin" };
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host.includes(".") && !/^\[/.test(u.hostname)) return { ok: false, error: "To'liq domen kiriting (masalan: example.uz)" };
  const path = u.pathname.replace(/\/+$/, "") || "";
  const bare = host.replace(/^www\./, "");
  return { ok: true, url: `${u.protocol}//${host}${u.port ? ":" + u.port : ""}${path || "/"}`, origin: `${u.protocol}//${host}${u.port ? ":" + u.port : ""}`, host, key: bare + path.toLowerCase() };
}

/** Hodisa manbasi sayt domenigami (yoki uning subdomeni / ruxsat etilgan host). */
export function hostAllowed(host, site) {
  const h = String(host || "").toLowerCase().replace(/^www\./, "");
  if (!h) return false;
  const base = String(site.host || "").replace(/^www\./, "");
  if (h === base || h.endsWith("." + base)) return true;
  return (site.settings?.allowedHosts || []).some((a) => {
    const x = String(a).toLowerCase().replace(/^www\./, "");
    return x && (h === x || h.endsWith("." + x));
  });
}

const SEARCH = [
  [/(^|\.)google\./, "Google"],
  [/(^|\.)(bing\.com|yandex\.|ya\.ru|duckduckgo\.com|yahoo\.|baidu\.com|ecosia\.org|search\.brave\.com|mail\.ru|naver\.com)/, "Qidiruv tizimi"],
];
const SOCIAL = [
  [/(^|\.)(t\.me|telegram\.(org|me)|web\.telegram\.org)$/, "Telegram"],
  [/(^|\.)(instagram\.com|l\.instagram\.com)$/, "Instagram"],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me|m\.facebook\.com|l\.facebook\.com|lm\.facebook\.com)$/, "Facebook"],
  [/(^|\.)(youtube\.com|youtu\.be|m\.youtube\.com)$/, "YouTube"],
];
const UTM_SOURCE_MAP = [
  [/^(google|adwords|googleads)$/, "Google"],
  [/^(bing|yandex|yahoo|duckduckgo|baidu)$/, "Qidiruv tizimi"],
  [/^(telegram|tg|t\.me)$/, "Telegram"],
  [/^(instagram|ig)$/, "Instagram"],
  [/^(facebook|fb|meta)$/, "Facebook"],
  [/^(youtube|yt)$/, "YouTube"],
];
const PAID_MEDIUM = /^(cpc|ppc|paid|paidsearch|paid_social|paidsocial|cpm|cpv|display|ads?|banner|retargeting)$/;

/**
 * Manba va kanal. Taxmin qilinmaydi: referrer ham, UTM ham bo'lmasa —
 * "To'g'ridan-to'g'ri"; faqat noma'lum belgilar bo'lsa — "Noma'lum".
 * @returns {{source:string, channel:string, refHost:string}}
 */
export function classifySource({ refHost = "", utm = {}, paidClick = false, siteHost = "" }) {
  const rh = String(refHost || "").toLowerCase().replace(/^www\./, "");
  const us = String(utm.source || "").toLowerCase().trim();
  const um = String(utm.medium || "").toLowerCase().trim();
  const sameSite = rh && siteHost && (rh === siteHost.replace(/^www\./, "") || rh.endsWith("." + siteHost.replace(/^www\./, "")));

  let source = null;
  if (us) {
    for (const [rx, name] of UTM_SOURCE_MAP) if (rx.test(us)) source = name;
    if (!source) source = um === "email" || us === "email" || us === "newsletter" ? "Email" : us.slice(0, 40);
  } else if (rh && !sameSite) {
    for (const [rx, name] of [...SEARCH, ...SOCIAL]) if (rx.test(rh)) source = name;
    if (!source && /(^|\.)(mail\.google\.com|outlook\.(live|office)\.com|mail\.yahoo\.com|e\.mail\.ru)$/.test(rh)) source = "Email";
    if (!source) source = "Boshqa saytlar";
  }

  let channel;
  if (paidClick || PAID_MEDIUM.test(um)) channel = "Pulli reklama";
  else if (um === "email" || source === "Email") channel = "Email";
  else if (source === "Google" || source === "Qidiruv tizimi") channel = "Organik qidiruv";
  else if (["Telegram", "Instagram", "Facebook", "YouTube"].includes(source) || /^(social|sm|smm)$/.test(um)) channel = "Ijtimoiy tarmoqlar";
  else if (source === "Boshqa saytlar" || um === "referral") channel = "Boshqa saytlar";
  else if (!source && (!rh || sameSite) && !us) channel = "To'g'ridan-to'g'ri";
  else if (source && us) channel = um ? "Kampaniya (" + um.slice(0, 20) + ")" : "Kampaniya";
  else channel = "Noma'lum";

  if (!source) source = channel === "To'g'ridan-to'g'ri" ? "To'g'ridan-to'g'ri" : "Noma'lum";
  return { source, channel, refHost: sameSite ? "" : rh };
}

/** User-Agent dan faqat kategoriya (to'liq UA saqlanmaydi). */
export function parseUA(ua = "", screenW = 0) {
  const s = String(ua);
  const bot = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|telegrambot|whatsapp|python-requests|curl\/|wget|phantom|selenium|puppeteer|playwright/i.test(s);
  let device = "Kompyuter";
  // Faqat User-Agent bo'yicha (ekran o'lchamidan taxmin qilinmaydi)
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(s)) device = "Planshet";
  else if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone|Opera Mini/i.test(s)) device = "Telefon";
  let browser = "Boshqa";
  if (/YaBrowser/i.test(s)) browser = "Yandex";
  else if (/Edg\//i.test(s)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(s)) browser = "Opera";
  else if (/SamsungBrowser/i.test(s)) browser = "Samsung";
  else if (/Firefox|FxiOS/i.test(s)) browser = "Firefox";
  else if (/Chrome|CriOS/i.test(s)) browser = "Chrome";
  else if (/Safari/i.test(s)) browser = "Safari";
  let os = "Boshqa";
  if (/Windows/i.test(s)) os = "Windows";
  else if (/iPhone|iPad|iPod/i.test(s)) os = "iOS";
  else if (/Android/i.test(s)) os = "Android";
  else if (/Mac OS X|Macintosh/i.test(s)) os = "macOS";
  else if (/Linux/i.test(s)) os = "Linux";
  return { bot, device, browser, os };
}

/** Sahifa yo'li: faqat pathname (so'rov parametrlari — shaxsiy ma'lumot bo'lishi mumkin — saqlanmaydi). */
export function cleanPath(rawUrl) {
  try {
    const u = new URL(String(rawUrl));
    let p = decodeURIComponent(u.pathname || "/").replace(/\/{2,}/g, "/");
    if (p.length > 1) p = p.replace(/\/$/, "");
    // E-pochta yoki uzun raqamlar yo'lda bo'lsa — yashiramiz
    p = p.replace(/[^/\s]+@[^/\s]+/g, ":email").replace(/\d{7,}/g, ":n");
    return p.slice(0, 200) || "/";
  } catch {
    return null;
  }
}
export function utmOf(rawUrl) {
  try {
    const q = new URL(String(rawUrl)).searchParams;
    const g = (k) => (q.get(k) || "").replace(/[<>"']/g, "").trim().slice(0, 100);
    return {
      utm: { source: g("utm_source"), medium: g("utm_medium"), campaign: g("utm_campaign"), content: g("utm_content"), term: g("utm_term") },
      paidClick: !!(q.get("gclid") || q.get("fbclid") || q.get("yclid") || q.get("msclkid") || q.get("ttclid")),
    };
  } catch {
    return { utm: {}, paidClick: false };
  }
}
export function hostOf(rawUrl) {
  try {
    return new URL(String(rawUrl)).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** Hodisa maqsadga mosmi (konversiya). */
export function matchGoals(ev, goals = []) {
  const hit = [];
  for (const g of goals || []) {
    if (!g || !g.id) continue;
    const m = String(g.match || "").trim();
    if (g.type === "page" && ev.type === "page_view" && m && (ev.path === m || (m.endsWith("*") && ev.path.startsWith(m.slice(0, -1))))) hit.push(g);
    else if (g.type === "event" && m && (ev.type === m || (ev.name && ev.name === m))) hit.push(g);
    else if (g.type === "click" && ev.type === "click" && m && ev.name === m) hit.push(g);
    else if (g.type === "form" && ev.type === "form_submit" && (!m || ev.name === m)) hit.push(g);
  }
  return hit;
}

// ─── Statistika ───────────────────────────────────────────────────────────────

const r1 = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 10) / 10);
const r2 = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 100) / 100);
const pct = (a, b) => (b > 0 ? r1((a / b) * 100) : null);
export const change = (cur, prev) => (prev == null || cur == null ? null : prev === 0 ? (cur === 0 ? 0 : null) : r1(((cur - prev) / prev) * 100));
export const safeDiv = (a, b) => (b > 0 && a != null ? a / b : null);

/** Sessiya davomiyligi (sek). page_exit kelmagan bo'lsa — oxirgi hodisagacha (taxminiy). */
export function sessionSeconds(s) {
  const st = new Date(s.start).getTime();
  const la = new Date(s.last || s.start).getTime();
  return Math.max(0, Math.round((la - st) / 1000));
}
export const isBounce = (s) => (s.pages || 0) <= 1 && (s.conv || 0) === 0 && sessionSeconds(s) < BOUNCE_MAX_SEC;

/** Sessiyalar to'plamining asosiy ko'rsatkichlari. */
export function sessionKpis(sessions, pageviews = null) {
  const n = sessions.length;
  const visitors = new Set(sessions.map((s) => s.vid)).size;
  const pv = pageviews ? pageviews.length : sessions.reduce((a, s) => a + (s.pages || 0), 0);
  const durs = sessions.map(sessionSeconds);
  const bounces = sessions.filter(isBounce).length;
  const conv = sessions.reduce((a, s) => a + (s.conv || 0), 0);
  const convSessions = sessions.filter((s) => (s.conv || 0) > 0).length;
  const leads = sessions.reduce((a, s) => a + (s.leads || 0), 0);
  const revenue = sessions.reduce((a, s) => a + (s.revenue || 0), 0);
  const newV = sessions.filter((s) => s.isNew).length;
  return {
    sessions: n,
    visitors,
    pageviews: pv,
    newSessions: newV,
    returningSessions: n - newV,
    pagesPerSession: n ? r2(pv / n) : null,
    avgDuration: n ? Math.round(durs.reduce((a, b) => a + b, 0) / n) : null,
    bounceRate: pct(bounces, n),
    conversions: conv,
    convSessions,
    conversionRate: pct(convSessions, n),
    leads,
    revenue: r2(revenue),
    estimatedEnd: sessions.filter((s) => !s.exitSeen).length,
  };
}

function groupBy(arr, keyFn) {
  const m = new Map();
  for (const x of arr) {
    const k = keyFn(x);
    if (k == null) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

/** Bir o'lcham bo'yicha jadval (manba, kanal, qurilma ...). */
export function breakdown(sessions, keyFn, limit = 50) {
  const total = sessions.length;
  return [...groupBy(sessions, keyFn)]
    .map(([key, list]) => {
      const k = sessionKpis(list);
      return {
        key,
        sessions: k.sessions,
        visitors: k.visitors,
        pageviews: k.pageviews,
        avgDuration: k.avgDuration,
        bounceRate: k.bounceRate,
        conversions: k.conversions,
        conversionRate: k.conversionRate,
        leads: k.leads,
        revenue: k.revenue,
        share: pct(k.sessions, total),
      };
    })
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, limit);
}

/** Kunlik (yoki bitta kun bo'lsa — soatlik) qatorlar. */
export function timeseries(sessions, range, tz) {
  const hourly = range.from === range.to;
  const labels = [];
  if (hourly) for (let h = 0; h < 24; h++) labels.push(String(h).padStart(2, "0") + ":00");
  else for (let d = range.from; d <= range.to; d = addDays(d, 1)) labels.push(d);
  const idx = new Map(labels.map((l, i) => [l, i]));
  const z = () => labels.map(() => 0);
  const out = { hourly, labels, sessions: z(), visitors: z(), pageviews: z(), newSessions: z(), returningSessions: z(), conversions: z() };
  const vis = labels.map(() => new Set());
  for (const s of sessions) {
    const t = new Date(s.start);
    const key = hourly ? String(hourIn(t, tz)).padStart(2, "0") + ":00" : dayIn(t, tz);
    const i = idx.get(key);
    if (i == null) continue;
    out.sessions[i]++;
    vis[i].add(s.vid);
    out.pageviews[i] += s.pages || 0;
    out[s.isNew ? "newSessions" : "returningSessions"][i]++;
    out.conversions[i] += s.conv || 0;
  }
  out.visitors = vis.map((x) => x.size);
  return out;
}

/** Soatlar bo'yicha trafik (0–23). */
export function hourly(sessions, tz) {
  const a = Array(24).fill(0);
  for (const s of sessions) a[hourIn(new Date(s.start), tz)]++;
  return a;
}

/**
 * Sahifalar: ko'rishlar, noyob ko'rishlar, kirishlar, chiqishlar, chiqish
 * darajasi, o'rtacha qolish vaqti, keyingi sahifalar va konversiyaga hissasi.
 */
export function pagesStats(sessions, pageviews, exits = []) {
  const bySid = new Map(sessions.map((s) => [s.sid, s]));
  const pages = new Map();
  const get = (p) => {
    if (!pages.has(p)) pages.set(p, { path: p, title: "", views: 0, uniq: new Set(), entries: 0, exits: 0, timeSum: 0, timeN: 0, next: new Map(), convSessions: new Set() });
    return pages.get(p);
  };
  // Sessiya ichidagi tartib
  const seq = groupBy(pageviews.slice().sort((a, b) => new Date(a.t) - new Date(b.t)), (e) => e.sid);
  for (const [sid, list] of seq) {
    const s = bySid.get(sid);
    list.forEach((e, i) => {
      const p = get(e.path);
      p.views++;
      p.uniq.add(sid);
      if (e.title && !p.title) p.title = e.title;
      if (i < list.length - 1 && list[i + 1].path !== e.path) {
        const nx = list[i + 1].path;
        p.next.set(nx, (p.next.get(nx) || 0) + 1);
      }
      if (s && (s.conv || 0) > 0) p.convSessions.add(sid);
    });
  }
  for (const s of sessions) {
    if (s.entry) get(s.entry).entries++;
    if (s.exit) get(s.exit).exits++;
  }
  for (const e of exits) {
    if (!e.path || !(e.dur > 0)) continue;
    const p = get(e.path);
    p.timeSum += Math.min(e.dur, 30 * 60_000);
    p.timeN++;
  }
  return [...pages.values()]
    .map((p) => ({
      path: p.path,
      title: p.title,
      views: p.views,
      sessions: p.uniq.size,
      entries: p.entries,
      exits: p.exits,
      exitRate: pct(p.exits, p.uniq.size),
      avgTime: p.timeN ? Math.round(p.timeSum / p.timeN / 1000) : null,
      convSessions: p.convSessions.size,
      next: [...p.next].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([path, n]) => ({ path, n })),
    }))
    .sort((a, b) => b.views - a.views);
}

/**
 * Foydalanuvchi yo'li (Sankey uchun): manba → 1-sahifa → 2-sahifa → 3-sahifa → natija.
 * Har qadamda eng ko'p 6 tasi, qolgani "Boshqa sahifalar". Faqat sayt ichidagi
 * navigatsiya; sayt tashqarisidagi faoliyat kuzatilmaydi.
 */
export function journeys(sessions, pageviews, { depth = 3, perStep = 6 } = {}) {
  const seq = groupBy(pageviews.slice().sort((a, b) => new Date(a.t) - new Date(b.t)), (e) => e.sid);
  const paths = sessions.map((s) => {
    const list = (seq.get(s.sid) || []).map((e) => e.path).filter((p, i, a) => i === 0 || a[i - 1] !== p);
    if (!list.length && s.entry) list.push(s.entry);
    const steps = [s.source || "Noma'lum", ...list.slice(0, depth)];
    steps.push((s.conv || 0) > 0 ? "✓ Konversiya" : "Saytdan chiqish");
    return steps;
  });
  // Har ustun uchun yetakchi qiymatlar. Natija (konversiya / chiqish) yo'lning
  // haqiqiy oxirgi qadamidan KEYINGI ustunga qo'yiladi — oqim boshqa sahifalar
  // ustidan "sakrab" o'tib, go'yo ular orqali o'tgandek ko'rinmasin.
  const cols = depth + 2;
  const isResult = (v) => v === "✓ Konversiya" || v === "Saytdan chiqish";
  const keep = [];
  for (let c = 0; c < cols; c++) {
    const cnt = new Map();
    for (const p of paths) {
      const v = p[c];
      if (v != null && !isResult(v)) cnt.set(v, (cnt.get(v) || 0) + 1);
    }
    keep.push(new Set([...cnt].sort((a, b) => b[1] - a[1]).slice(0, perStep).map((x) => x[0])));
  }
  const nodeMap = new Map();
  const linkMap = new Map();
  const node = (c, label) => {
    const v = isResult(label) || keep[c].has(label) ? label : c === 0 ? "Boshqa manbalar" : "Boshqa sahifalar";
    const id = c + "|" + v;
    if (!nodeMap.has(id)) nodeMap.set(id, { id, col: c, label: v, value: 0 });
    return nodeMap.get(id);
  };
  const top = new Map();
  for (const p of paths) {
    const cells = p.map((v, c) => [c, v]);
    let prev = null;
    for (const [c, v] of cells) {
      const n = node(c, v);
      n.value++;
      if (prev) {
        const k = prev.id + ">" + n.id;
        linkMap.set(k, (linkMap.get(k) || 0) + 1);
      }
      prev = n;
    }
    const key = p.join(" → ");
    top.set(key, (top.get(key) || 0) + 1);
  }
  return {
    columns: cols,
    nodes: [...nodeMap.values()],
    links: [...linkMap].map(([k, value]) => {
      const [source, target] = k.split(">");
      return { source, target, value };
    }),
    topPaths: [...top].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([path, n]) => ({ path, n, share: pct(n, sessions.length) })),
  };
}

/** Kampaniyalar: tashriflar, konversiyalar, xarajat, daromad, CPA, ROAS. */
export function campaigns(sessions, spendRows = []) {
  const withUtm = sessions.filter((s) => s.utm && s.utm.campaign);
  const g = groupBy(withUtm, (s) => [s.utm.campaign, s.utm.source || "", s.utm.medium || ""].join("\u0001"));
  const spend = new Map();
  for (const r of spendRows) {
    const k = String(r.campaign || "").toLowerCase();
    const x = spend.get(k) || { spend: 0, revenue: 0, impressions: 0, clicks: 0, hasRev: false, hasImp: false, hasClicks: false };
    x.spend += Number(r.spend) || 0;
    if (r.revenue != null) (x.revenue += Number(r.revenue) || 0), (x.hasRev = true);
    if (r.impressions != null) (x.impressions += Number(r.impressions) || 0), (x.hasImp = true);
    if (r.clicks != null) (x.clicks += Number(r.clicks) || 0), (x.hasClicks = true);
    spend.set(k, x);
  }
  const rows = [...g].map(([key, list]) => {
    const [campaign, source, medium] = key.split("\u0001");
    const k = sessionKpis(list);
    return { campaign, source, medium, sessions: k.sessions, visitors: k.visitors, conversions: k.conversions, leads: k.leads, conversionRate: k.conversionRate, trackedRevenue: k.revenue };
  });
  // Xarajat kampaniya nomi bo'yicha (bir nechta manba bo'lsa — birinchisiga) biriktiriladi
  const used = new Set();
  for (const r of rows.sort((a, b) => b.sessions - a.sessions)) {
    const k = r.campaign.toLowerCase();
    const sp = spend.get(k);
    if (sp && !used.has(k)) {
      used.add(k);
      r.spend = r2(sp.spend);
      r.importedRevenue = sp.hasRev ? r2(sp.revenue) : null;
      r.impressions = sp.hasImp ? sp.impressions : null;
      r.clicks = sp.hasClicks ? sp.clicks : null;
    } else {
      r.spend = null;
      r.importedRevenue = null;
      r.impressions = null;
      r.clicks = null;
    }
    const revenue = r.trackedRevenue > 0 ? r.trackedRevenue : r.importedRevenue;
    r.revenue = revenue ?? null;
    r.revenueSource = r.trackedRevenue > 0 ? "kuzatilgan" : r.importedRevenue != null ? "import" : null;
    r.cpa = r.spend != null && r.conversions > 0 ? r2(r.spend / r.conversions) : null;
    r.roas = r.spend > 0 && revenue != null ? r2(revenue / r.spend) : null;
  }
  // Xarajati bor, lekin tashrifi kuzatilmagan kampaniyalar ham ko'rinsin
  for (const [k, sp] of spend)
    if (!used.has(k))
      rows.push({
        campaign: spendRows.find((r) => String(r.campaign || "").toLowerCase() === k)?.campaign || k,
        source: "", medium: "", sessions: 0, visitors: 0, conversions: 0, leads: 0, conversionRate: null, trackedRevenue: 0,
        spend: r2(sp.spend), importedRevenue: sp.hasRev ? r2(sp.revenue) : null, impressions: sp.hasImp ? sp.impressions : null, clicks: sp.hasClicks ? sp.clicks : null,
        revenue: sp.hasRev ? r2(sp.revenue) : null, revenueSource: sp.hasRev ? "import" : null, cpa: null, roas: sp.spend > 0 && sp.hasRev ? r2(sp.revenue / sp.spend) : null,
      });
  return rows.sort((a, b) => b.sessions - a.sessions || (b.spend || 0) - (a.spend || 0));
}

/** Konversiya voronkasi. */
export function funnel(sessions) {
  const n = sessions.length;
  const steps = [
    ["Sessiyalar", n],
    ["2+ sahifa ko'rgan", sessions.filter((s) => (s.pages || 0) >= 2).length],
    ["Forma yuborgan yoki lead", sessions.filter((s) => (s.forms || 0) > 0 || (s.leads || 0) > 0).length],
    ["Konversiya", sessions.filter((s) => (s.conv || 0) > 0).length],
  ];
  return steps.map(([label, v], i) => ({ label, value: v, ofTotal: pct(v, n), ofPrev: i ? pct(v, steps[i - 1][1]) : null }));
}

/** Kichik trend (kartochka uchun) — kunlik qiymatlar. */
export function spark(series, n = 14) {
  return series.slice(-n);
}

/**
 * Intellektual ogohlantirishlar — faqat raqamlarga tayanadi. Kichik hajmda
 * (tasodif katta bo'lganda) ogohlantirish berilmaydi.
 */
export function detectAlerts({ site, cur, prev, health, lastEventAt, now = new Date(), spendCur = 0, spendPrev = 0 }) {
  const out = [];
  const add = (type, level, metric, before, after, reason, action) =>
    out.push({ type, level, metric, prev: before, cur: after, change: change(after, before), reason, action, siteId: site._id, siteName: site.name, at: now });
  const MIN = 20;
  if (prev.sessions >= MIN && cur.sessions < prev.sessions * 0.6)
    add("traffic_drop", "bad", "Sessiyalar", prev.sessions, cur.sessions, "Tashriflar oldingi davrga nisbatan keskin kamaydi.", "Trafik manbalari jadvalida qaysi manba kamayganini tekshiring; reklama kampaniyalari to'xtamaganini va tracking kodi barcha sahifalarda turganini ko'ring.");
  if (prev.sessions >= MIN && cur.sessions > prev.sessions * 2)
    add("traffic_spike", "info", "Sessiyalar", prev.sessions, cur.sessions, "Tashriflar odatdagidan ikki baravardan ko'p oshdi.", "Qaysi manba yoki kampaniya o'sish berganini ko'ring. Bounce rate ham keskin oshgan bo'lsa — bot trafik bo'lishi mumkin.");
  if (prev.sessions >= MIN && prev.conversionRate > 0 && cur.conversionRate != null && cur.conversionRate < prev.conversionRate * 0.7)
    add("conversion_drop", "bad", "Konversiya foizi", prev.conversionRate, cur.conversionRate, "Konversiya foizi 30% dan ko'proq pasaydi.", "Ariza/xarid sahifalari ishlayotganini, formalar yuborilayotganini va narx/taklif o'zgarmaganini tekshiring.");
  if (prev.sessions >= MIN && cur.sessions >= MIN && cur.bounceRate != null && prev.bounceRate != null && cur.bounceRate - prev.bounceRate >= 15)
    add("bounce_up", "warn", "Bounce rate", prev.bounceRate, cur.bounceRate, "Bitta sahifani ko'rib tez chiqib ketuvchilar ulushi 15 punktdan ko'proq oshdi.", "Kirish sahifalari jadvalidan chiqish darajasi oshgan sahifalarni toping; sahifa tezligi va reklama mosligini tekshiring.");
  if (prev.leads >= 5 && cur.leads < prev.leads * 0.6)
    add("leads_drop", "bad", "Leadlar", prev.leads, cur.leads, "Leadlar soni 40% dan ko'proq kamaydi.", "Ariza formasini sinab ko'ring va lead keltiradigan manbalar trafigini solishtiring.");
  if (spendPrev > 0 && spendCur > spendPrev * 1.5)
    add("spend_up", "warn", "Reklama xarajati", spendPrev, spendCur, "Reklama xarajati 50% dan ko'proq oshdi.", "Kampaniyalar jadvalida CPA va ROAS o'zgarishini tekshiring.");
  if (lastEventAt && now - new Date(lastEventAt) > 24 * 3600_000)
    add("tracking_stopped", "bad", "Oxirgi hodisa", null, null, "24 soatdan beri saytdan birorta ham hodisa kelmadi.", "Tracking kodi saytdan olib tashlanmaganini va sayt ishlayotganini tekshiring (\"Ulanishni tekshirish\").");
  if (health && health.ok === false)
    add("site_down", "bad", "Sayt holati", null, null, "Oxirgi tekshiruvda sayt javob bermadi: " + (health.error || "HTTP " + health.status) + ".", "Hosting va domen sozlamalarini tekshiring.");
  return out;
}

/** CSV qatori (Excel uchun ; emas, , ishlatiladi; qo'shtirnoq ekranlanadi). */
export function toCsv(cols, rows) {
  const esc = (v) => {
    if (v == null) return "";
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // formula in'yeksiyasiga qarshi
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return "﻿" + [cols.map((c) => esc(c[1])).join(","), ...rows.map((r) => cols.map((c) => esc(r[c[0]])).join(","))].join("\r\n");
}

// ─── Hodisalarni qabul qilish (sof qism) ─────────────────────────────────────

const clipStr = (v, n) => String(v ?? "").replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, n);

/**
 * Brauzerdan kelgan bitta hodisani tekshiradi va saqlanadigan ko'rinishga
 * keltiradi. Noto'g'ri bo'lsa — null. Vaqt server soatiga tayanadi (mijoz
 * soati noto'g'ri bo'lishi mumkin): server_vaqti − (mijoz_hozir − mijoz_ts).
 */
export function normalizeEvent(raw, payload, site, now = new Date()) {
  if (!raw || typeof raw !== "object") return null;
  const type = String(raw.e || "");
  if (!EVENT_TYPES.includes(type)) return null;
  const eid = String(raw.id || "");
  if (!/^[a-f0-9]{16,40}$/.test(eid)) return null;
  const host = hostOf(raw.u);
  if (!host || !hostAllowed(host, site)) return null; // boshqa domendan kelgan hodisa
  const path = cleanPath(raw.u);
  if (!path) return null;
  const cNow = Number(payload.now), cTs = Number(raw.ts);
  let lag = Number.isFinite(cNow) && Number.isFinite(cTs) ? cNow - cTs : 0;
  lag = Math.min(Math.max(lag, 0), 10 * 60_000);
  const ev = { siteId: site._id, eid, type, t: new Date(now.getTime() - lag), sid: payload.sid, vid: payload.vid, path };
  if (type === "page_view") {
    ev.title = clipStr(raw.t, 150);
    const r = String(raw.r || "");
    if (r) ev.refHost = hostOf(r).replace(/^www\./, "");
    const { utm, paidClick } = utmOf(raw.u);
    if (Object.values(utm).some(Boolean)) ev.utm = utm;
    if (paidClick) ev.paid = true;
  }
  if (raw.n) ev.name = clipStr(raw.n, 80);
  if (type === "scroll" || type === "page_exit") {
    const sd = Number(raw.sd);
    if (Number.isFinite(sd)) ev.scroll = Math.min(100, Math.max(0, Math.round(sd)));
  }
  if (type === "page_exit") {
    const du = Number(raw.du);
    if (Number.isFinite(du) && du >= 0) ev.dur = Math.min(Math.round(du), 6 * 3600_000);
  }
  if ((type === "purchase" || type === "conversion" || type === "lead") && raw.v != null) {
    const v = Number(raw.v);
    if (Number.isFinite(v) && v >= 0 && v < 1e12) ev.value = Math.round(v * 100) / 100;
  }
  return ev;
}

/**
 * Sessiyani yangi hodisalar bilan yangilaydi (sof funksiya). `s` — mavjud
 * sessiya yoki null. Manba sessiyaning BIRINCHI sahifa ko'rishidan olinadi.
 */
export function applySessionEvents(s, events, ctx) {
  const evs = events.slice().sort((a, b) => a.t - b.t);
  if (!evs.length) return s;
  const first = evs[0];
  if (!s) {
    const pv = evs.find((e) => e.type === "page_view") || first;
    const src = classifySource({ refHost: pv.refHost, utm: pv.utm || {}, paidClick: !!pv.paid, siteHost: ctx.siteHost });
    s = {
      siteId: first.siteId,
      sid: first.sid,
      vid: first.vid,
      start: first.t,
      last: first.t,
      isNew: !!ctx.isNewVisitor,
      entry: pv.type === "page_view" ? pv.path : null,
      exit: null,
      source: src.source,
      channel: src.channel,
      refHost: src.refHost || null,
      utm: pv.utm && Object.values(pv.utm).some(Boolean) ? pv.utm : null,
      device: ctx.device,
      browser: ctx.browser,
      os: ctx.os,
      country: ctx.country || "Noma'lum",
      lang: ctx.lang || null,
      pages: 0,
      conv: 0,
      leads: 0,
      forms: 0,
      revenue: 0,
      goals: [],
      maxScroll: 0,
      exitSeen: false,
      lastPv: null,
    };
  } else s = { ...s, goals: [...(s.goals || [])] };

  for (const e of evs) {
    if (e.t < s.start) s.start = e.t;
    if (e.t > s.last) s.last = e.t;
    if (e.type === "page_view") {
      s.pages++;
      if (!s.entry) s.entry = e.path;
      if (!s.lastPv || e.t >= s.lastPv) {
        s.lastPv = e.t;
        s.exit = e.path;
      }
    }
    if (e.type === "page_exit") s.exitSeen = true;
    if (e.scroll != null && e.scroll > s.maxScroll) s.maxScroll = e.scroll;
    if (e.type === "form_submit") s.forms++;
    if (e.type === "lead") s.leads++;
    if (e.type === "purchase" && e.value) s.revenue = Math.round((s.revenue + e.value) * 100) / 100;
    const hits = matchGoals(e, ctx.goals);
    const isConv = CONVERSION_TYPES.has(e.type) || hits.length > 0;
    if (isConv) s.conv++;
    for (const g of hits) {
      if (!s.goals.includes(g.id)) s.goals.push(g.id);
      if (g.lead && e.type !== "lead") s.leads++;
    }
  }
  return s;
}
