/**
 * Saytlar analitikasi — sof hisob-kitoblar (bazasiz).
 *   node tests/webanalytics.test.mjs
 */
import assert from "node:assert/strict";
import * as C from "../webanalytics/core.js";

let n = 0;
const t = (name, fn) => {
  fn();
  n++;
  console.log("✅", name);
};
const site = { _id: "ws_a", host: "shop.uz", goals: [{ id: "g1aaaa", type: "page", match: "/rahmat" }, { id: "g2bbbb", type: "form", match: "", lead: true }], settings: {} };
const hex = (i, len = 24) => i.toString(16).padStart(len, "0");

t("URL normallashtirish va takrorni aniqlash kaliti", () => {
  const a = C.normalizeSiteUrl("Shop.uz/");
  assert.equal(a.ok, true);
  assert.equal(a.url, "https://shop.uz/");
  const b = C.normalizeSiteUrl("https://www.shop.uz");
  assert.equal(a.key, b.key, "www va www'siz — bitta sayt");
  assert.equal(C.normalizeSiteUrl("javascript:alert(1)").ok, false);
  assert.equal(C.normalizeSiteUrl("ftp://shop.uz").ok, false);
  assert.equal(C.normalizeSiteUrl("localhost").ok, false);
  assert.equal(C.normalizeSiteUrl("https://u:p@shop.uz").ok, false);
});

t("domen tekshiruvi: subdomen ha, begona domen yo'q", () => {
  assert.equal(C.hostAllowed("www.shop.uz", site), true);
  assert.equal(C.hostAllowed("blog.shop.uz", site), true);
  assert.equal(C.hostAllowed("evilshop.uz", site), false);
  assert.equal(C.hostAllowed("shop.uz.evil.com", site), false);
});

t("manba aniqlash: taxmin yo'q", () => {
  const cs = (o) => C.classifySource({ siteHost: "shop.uz", ...o });
  assert.deepEqual([cs({}).source, cs({}).channel], ["To'g'ridan-to'g'ri", "To'g'ridan-to'g'ri"]);
  assert.equal(cs({ refHost: "www.google.com" }).source, "Google");
  assert.equal(cs({ refHost: "www.google.com" }).channel, "Organik qidiruv");
  assert.equal(cs({ refHost: "yandex.ru" }).source, "Qidiruv tizimi");
  assert.equal(cs({ refHost: "t.me" }).source, "Telegram");
  assert.equal(cs({ refHost: "l.instagram.com" }).source, "Instagram");
  assert.equal(cs({ refHost: "m.facebook.com" }).channel, "Ijtimoiy tarmoqlar");
  assert.equal(cs({ refHost: "youtube.com" }).source, "YouTube");
  assert.equal(cs({ refHost: "kun.uz" }).source, "Boshqa saytlar");
  assert.equal(cs({ refHost: "blog.shop.uz" }).source, "To'g'ridan-to'g'ri", "o'z saytidan kelish — manba emas");
  assert.equal(cs({ utm: { source: "instagram", medium: "cpc", campaign: "kuz" } }).channel, "Pulli reklama");
  assert.equal(cs({ utm: { source: "news", medium: "email" } }).source, "Email");
  assert.equal(cs({ refHost: "google.com", paidClick: true }).channel, "Pulli reklama");
});

t("User-Agent: qurilma, brauzer, OT, bot", () => {
  const iphone = C.parseUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1");
  assert.deepEqual([iphone.device, iphone.browser, iphone.os, iphone.bot], ["Telefon", "Safari", "iOS", false]);
  const win = C.parseUA("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36 Edg/124.0");
  assert.deepEqual([win.device, win.browser, win.os], ["Kompyuter", "Edge", "Windows"]);
  assert.equal(C.parseUA("Googlebot/2.1").bot, true);
  assert.equal(C.parseUA("HeadlessChrome/120").bot, true);
});

t("sahifa yo'li: so'rov parametrlari va e-pochta saqlanmaydi", () => {
  assert.equal(C.cleanPath("https://shop.uz/narxlar/?email=a@b.uz&utm_source=x"), "/narxlar");
  assert.equal(C.cleanPath("https://shop.uz/user/ali@mail.uz/profil"), "/user/:email/profil");
  assert.equal(C.cleanPath("https://shop.uz/order/123456789"), "/order/:n");
});

t("hodisa tekshiruvi: noto'g'ri tur, begona domen, vaqt siljishi", () => {
  const now = new Date("2026-10-23T10:00:00Z");
  const p = { sid: hex(1), vid: hex(2), now: 2_000_000 };
  const ok = C.normalizeEvent({ e: "page_view", id: hex(9, 20), ts: 1_990_000, u: "https://shop.uz/?utm_source=telegram&utm_campaign=kuz", r: "https://t.me/x" }, p, site, now);
  assert.equal(ok.path, "/");
  assert.equal(ok.utm.campaign, "kuz");
  assert.equal(ok.refHost, "t.me");
  assert.equal(now - ok.t, 10_000, "mijoz soati emas — server vaqti minus kechikish");
  assert.equal(C.normalizeEvent({ e: "hack", id: hex(9, 20), u: "https://shop.uz/" }, p, site, now), null);
  assert.equal(C.normalizeEvent({ e: "page_view", id: hex(9, 20), u: "https://evil.com/" }, p, site, now), null);
  assert.equal(C.normalizeEvent({ e: "page_view", id: "x", u: "https://shop.uz/" }, p, site, now), null);
  const big = C.normalizeEvent({ e: "page_view", id: hex(9, 20), ts: -1e15, u: "https://shop.uz/" }, p, site, now);
  assert.equal(now - big.t, 10 * 60_000, "kechikish 10 daqiqa bilan cheklanadi");
});

// Sessiya yasash yordamchisi
function mkSession(i, { start, events, isNew = true, ua = { device: "Kompyuter", browser: "Chrome", os: "Windows" } }) {
  const evs = events.map((e, k) => ({ siteId: "ws_a", sid: hex(i), vid: hex(1000 + (e.vid ?? i)), eid: hex(i * 100 + k, 20), t: new Date(start.getTime() + (e.at || 0) * 1000), path: e.path || "/", ...e }));
  return { s: C.applySessionEvents(null, evs, { siteHost: "shop.uz", isNewVisitor: isNew, goals: site.goals, ...ua }), evs };
}

t("sessiya: kirish/chiqish sahifasi, maqsadlar, lead, taxminiy yakun", () => {
  const start = new Date("2026-10-20T08:00:00Z");
  const { s } = mkSession(1, {
    start,
    events: [
      { type: "session_start" },
      { type: "page_view", path: "/", refHost: "instagram.com" },
      { type: "page_view", path: "/narxlar", at: 30 },
      { type: "form_submit", path: "/ariza", at: 60, name: "ariza" },
      { type: "page_view", path: "/rahmat", at: 61 },
    ],
  });
  assert.equal(s.source, "Instagram");
  assert.equal(s.entry, "/");
  assert.equal(s.exit, "/rahmat");
  assert.equal(s.pages, 3);
  assert.equal(s.forms, 1);
  assert.equal(s.leads, 1, "forma maqsadi lead deb belgilangan");
  assert.equal(s.conv, 2, "forma maqsadi + /rahmat sahifa maqsadi");
  assert.equal(s.exitSeen, false, "page_exit kelmagan — davomiylik taxminiy");
  assert.equal(C.sessionSeconds(s), 61);
  // Keyinroq page_exit keladi — mavjud sessiya yangilanadi, manba o'zgarmaydi
  const s2 = C.applySessionEvents(s, [{ siteId: "ws_a", sid: s.sid, vid: s.vid, type: "page_exit", t: new Date(start.getTime() + 90_000), path: "/rahmat", dur: 29_000 }], { siteHost: "shop.uz", goals: site.goals });
  assert.equal(s2.exitSeen, true);
  assert.equal(C.sessionSeconds(s2), 90);
  assert.equal(s2.source, "Instagram");
});

t("KPI: 47 sessiya, bounce, konversiya foizi, yangi/qaytgan", () => {
  const sessions = [];
  const start = new Date("2026-10-20T08:00:00Z");
  for (let i = 0; i < 47; i++) {
    const evs = [{ type: "page_view", path: "/" }];
    if (i % 2 === 0) evs.push({ type: "page_view", path: "/xizmatlar", at: 40 });
    if (i % 10 === 0) evs.push({ type: "conversion", path: "/xizmatlar", at: 50 });
    sessions.push(mkSession(i + 1, { start: new Date(start.getTime() + i * 3600_000), events: evs, isNew: i % 3 !== 0 }).s);
  }
  const k = C.sessionKpis(sessions);
  assert.equal(k.sessions, 47);
  assert.equal(k.visitors, 47);
  assert.equal(k.pageviews, 47 + 24);
  assert.equal(k.bounceRate, Math.round((23 / 47) * 1000) / 10);
  assert.equal(k.conversions, 5);
  assert.equal(k.conversionRate, Math.round((5 / 47) * 1000) / 10);
  assert.equal(k.newSessions + k.returningSessions, 47);
  assert.equal(C.sessionKpis([]).conversionRate, null, "nolga bo'lish yo'q");
});

t("davrlar: bugun, kecha, joriy/oldingi oy va solishtirish", () => {
  const now = new Date("2026-10-23T10:00:00Z");
  const tz = "Asia/Tashkent";
  assert.deepEqual([C.resolveRange({ period: "today" }, tz, now).from, C.resolveRange({ period: "yesterday" }, tz, now).from], ["2026-10-23", "2026-10-22"]);
  const m = C.resolveRange({ period: "month" }, tz, now);
  assert.deepEqual([m.from, m.to, m.prev.from, m.prev.to], ["2026-10-01", "2026-10-23", "2026-09-01", "2026-09-23"]);
  const pm = C.resolveRange({ period: "prevmonth" }, tz, now);
  assert.deepEqual([pm.from, pm.to, pm.prev.from, pm.prev.to], ["2026-09-01", "2026-09-30", "2026-08-01", "2026-08-31"]);
  const w = C.resolveRange({ period: "7" }, tz, now);
  assert.deepEqual([w.from, w.prev.from, w.prev.to], ["2026-10-17", "2026-10-10", "2026-10-16"]);
  const bad = C.resolveRange({ period: "custom", from: "2026-10-10", to: "2026-10-01" }, tz, now);
  assert.equal(bad.key, "30", "noto'g'ri oraliq — 30 kun");
  // Toshkent kuni boshlanishi = 19:00 UTC oldingi kun
  assert.equal(C.dayStartUtc("2026-10-23", tz).toISOString(), "2026-10-22T19:00:00.000Z");
});

t("sahifalar va foydalanuvchi yo'li", () => {
  const start = new Date("2026-10-20T08:00:00Z");
  const a = mkSession(1, { start, events: [{ type: "page_view", path: "/", refHost: "instagram.com" }, { type: "page_view", path: "/xizmatlar", at: 20 }, { type: "page_view", path: "/narxlar", at: 40 }, { type: "lead", path: "/narxlar", at: 50 }] });
  const b = mkSession(2, { start, events: [{ type: "page_view", path: "/", refHost: "google.com" }, { type: "page_view", path: "/xizmatlar", at: 20 }] });
  const sessions = [a.s, b.s];
  const pvs = [...a.evs, ...b.evs].filter((e) => e.type === "page_view");
  const exits = [{ path: "/xizmatlar", dur: 20_000 }];
  const pages = C.pagesStats(sessions, pvs, exits);
  const home = pages.find((p) => p.path === "/");
  assert.equal(home.views, 2);
  assert.equal(home.entries, 2);
  assert.deepEqual(home.next, [{ path: "/xizmatlar", n: 2 }]);
  const srv = pages.find((p) => p.path === "/xizmatlar");
  assert.equal(srv.exits, 1);
  assert.equal(srv.exitRate, 50);
  assert.equal(srv.avgTime, 20);
  const j = C.journeys(sessions, pvs);
  assert.equal(j.topPaths.length, 2);
  assert.ok(j.topPaths.some((p) => p.path === "Instagram → / → /xizmatlar → /narxlar → ✓ Konversiya"));
  assert.ok(j.topPaths.some((p) => p.path === "Google → / → /xizmatlar → Saytdan chiqish"));
  const total = j.links.filter((l) => l.source.startsWith("0|")).reduce((x, l) => x + l.value, 0);
  assert.equal(total, 2, "manbadan chiquvchi oqimlar sessiyalar soniga teng");
});

t("kampaniyalar: CPA, ROAS, nolga bo'lish, uydirma qiymat yo'q", () => {
  const start = new Date("2026-10-20T08:00:00Z");
  const mk = (i, conv, value) =>
    mkSession(i, {
      start,
      events: [{ type: "page_view", path: "/", utm: { source: "instagram", medium: "cpc", campaign: "kuz" } }, ...(conv ? [{ type: "purchase", path: "/", at: 5, value }] : [])],
    }).s;
  const sessions = [mk(1, true, 300000), mk(2, true, 200000), mk(3, false), mk(4, false)];
  let rows = C.campaigns(sessions, []);
  assert.equal(rows[0].sessions, 4);
  assert.equal(rows[0].conversions, 2);
  assert.equal(rows[0].conversionRate, 50);
  assert.equal(rows[0].spend, null, "xarajat import qilinmagan — null, 0 emas");
  assert.equal(rows[0].cpa, null);
  assert.equal(rows[0].roas, null);
  rows = C.campaigns(sessions, [{ campaign: "kuz", spend: 100000 }, { campaign: "qish", spend: 50000 }]);
  const kuz = rows.find((r) => r.campaign === "kuz");
  assert.equal(kuz.cpa, 50000);
  assert.equal(kuz.roas, 5);
  assert.equal(kuz.revenueSource, "kuzatilgan");
  const qish = rows.find((r) => r.campaign === "qish");
  assert.equal(qish.sessions, 0);
  assert.equal(qish.roas, null);
  assert.equal(C.campaigns(sessions, [{ campaign: "kuz", spend: 0 }]).find((r) => r.campaign === "kuz").roas, null, "xarajat 0 — ROAS yo'q");
});

t("ogohlantirishlar: kichik hajmda yo'q, keskin pasayishda bor", () => {
  const s = { _id: "ws_a", name: "Shop" };
  const k = (sessions, cr = 5, br = 40, leads = 0) => ({ sessions, conversionRate: cr, bounceRate: br, leads });
  assert.equal(C.detectAlerts({ site: s, cur: k(2), prev: k(10) }).length, 0);
  const a = C.detectAlerts({ site: s, cur: k(30, 2, 60, 1), prev: k(100, 5, 40, 10) });
  const types = a.map((x) => x.type).sort();
  assert.deepEqual(types, ["bounce_up", "conversion_drop", "leads_drop", "traffic_drop"]);
  assert.equal(a.find((x) => x.type === "traffic_drop").change, -70);
  const stale = C.detectAlerts({ site: s, cur: k(0), prev: k(0), lastEventAt: new Date(Date.now() - 30 * 3600_000) });
  assert.equal(stale[0].type, "tracking_stopped");
});

t("CSV: formula in'yeksiyasiga qarshi va qo'shtirnoq", () => {
  const csv = C.toCsv([["a", "A"], ["b", "B"]], [{ a: "=HYPERLINK(1)", b: 'x,"y"' }]);
  assert.ok(csv.includes("'=HYPERLINK(1)"));
  assert.ok(csv.includes('"x,""y"""'));
});

console.log(`\n${n} ta test o'tdi`);
