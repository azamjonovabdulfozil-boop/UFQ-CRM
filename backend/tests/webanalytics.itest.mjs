/**
 * Saytlar analitikasi — integratsion sinov (haqiqiy MongoDB, test bazasi).
 *
 *   WA_TEST_MONGO=mongodb://127.0.0.1:27017 node tests/webanalytics.itest.mjs
 *
 * Production bazasiga ulanmaslik uchun: faqat WA_TEST_MONGO dan o'qiydi va
 * har safar yangi, tasodifiy nomli baza ochib, oxirida o'chiradi.
 * Tekshiriladi: sayt qo'shish, takroriy URL, tracking skripti, hodisalarni
 * qabul qilish, begona domen va botlarni rad etish, takroriy hodisalar,
 * sessiya/manba/konversiya hisoblari, saytlar aralashmasligi, ruxsatlar,
 * CSV eksport, xarajat importi, sahifalangan hodisalar.
 */
import assert from "node:assert/strict";
import express from "express";
import { MongoClient } from "mongodb";
import { randomBytes } from "node:crypto";
import { createWaPublicRouter, createWaSuperRouter } from "../webanalytics/router.js";
import { rateLimit } from "../security/rateLimit.js";

const URI = process.env.WA_TEST_MONGO;
if (!URI) {
  console.log("⏭  WA_TEST_MONGO berilmagan — sinov o'tkazib yuborildi");
  process.exit(0);
}
if (/mongodb\.net/.test(URI) && !process.env.WA_TEST_FORCE) throw new Error("Bulutdagi (ehtimol production) bazada sinov o'tkazilmaydi");

const client = await new MongoClient(URI).connect();
const dbName = "wa_itest_" + randomBytes(4).toString("hex");
const db = client.db(dbName);
const audits = [];

const app = express();
app.use(createWaPublicRouter({ getDb: () => db, rateLimit }));
app.use(express.json());
// Soddalashtirilgan autentifikatsiya: "Bearer super" — Super Admin, boshqasi — rad
const requireSuperAdmin = (req, res, next) => {
  const h = req.get("authorization") || "";
  if (h === "Bearer super") return (req.user = { sub: "u1", username: "super", isSuper: true }), next();
  return res.status(h ? 403 : 401).json({ ok: false, error: "ruxsat yo'q" });
};
app.use(
  createWaSuperRouter({
    getDb: () => db,
    requireSuperAdmin,
    audit: async (ev) => audits.push(ev),
    rateLimit,
    getTimezone: async () => "Asia/Tashkent",
  }),
);
const srv = app.listen(0);
const base = `http://127.0.0.1:${srv.address().port}`;
process.env.WA_PUBLIC_URL = base;

const call = async (method, path, body, auth = "super") => {
  const r = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: "Bearer " + auth } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const ct = r.headers.get("content-type") || "";
  return { status: r.status, body: ct.includes("json") ? await r.json() : await r.text() };
};
const UA_PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";
const UA_PC = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const hex = (n) => randomBytes(n).toString("hex");
async function beacon(tid, { origin, ua = UA_PC, vid, sid, ev }) {
  const body = JSON.stringify({ tid, vid, sid, sw: 1440, lng: "uz-UZ", now: Date.now(), ev: ev.map((e) => ({ id: e.id || hex(12), ts: Date.now(), ...e })) });
  const r = await fetch(base + "/api/wa/collect", { method: "POST", headers: { "Content-Type": "text/plain", Origin: origin, "User-Agent": ua }, body });
  return { status: r.status, text: await r.text() };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const t = async (name, fn) => {
  await fn();
  n++;
  console.log("✅", name);
};

try {
  let A, B;
  await t("ruxsatsiz so'rov rad etiladi", async () => {
    assert.equal((await call("GET", "/api/super/wa/sites", null, null)).status, 401);
    assert.equal((await call("GET", "/api/super/wa/overview", null, "admin")).status, 403);
  });

  await t("sayt qo'shish, takroriy URL, ichki manzil taqiqi", async () => {
    const r = await call("POST", "/api/super/wa/sites", { name: "Shop", url: "shop-wa-test.example", goals: [{ name: "Rahmat", type: "page", match: "/rahmat" }] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    A = r.body.site;
    assert.match(A.id, /^ws_[a-f0-9]{12}$/);
    assert.match(A.trackingId, /^UFQ-[A-Z0-9]{8}$/);
    assert.equal(A.tracking, "waiting");
    assert.ok(A.snippet.includes(A.trackingId));
    const dup = await call("POST", "/api/super/wa/sites", { name: "Yana", url: "https://www.shop-wa-test.example/" });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.siteId, A.id);
    assert.equal((await call("POST", "/api/super/wa/sites", { name: "x", url: "http://127.0.0.1/" })).status, 400);
    assert.equal((await call("POST", "/api/super/wa/sites", { name: "x", url: "http://app.localhost/" })).status, 400);
    assert.equal((await call("POST", "/api/super/wa/sites", { name: "x", url: "http://10.1.2.3/" })).status, 400);
    B = (await call("POST", "/api/super/wa/sites", { name: "Blog", url: "https://blog-wa-test.example" })).body.site;
    assert.notEqual(A.trackingId, B.trackingId);
  });

  await t("tracking skripti beriladi, noma'lum ID — 404", async () => {
    const r = await fetch(`${base}/api/wa/t.js?id=${A.trackingId}`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("cross-origin-resource-policy"), "cross-origin");
    const js = await r.text();
    assert.ok(js.includes(base + "/api/wa/collect") && js.includes(A.trackingId));
    assert.equal((await fetch(`${base}/api/wa/t.js?id=UFQ-NOPE0000`)).status, 404);
  });

  const O = "https://shop-wa-test.example";
  const v1 = hex(12), s1 = hex(12), v2 = hex(12), s2 = hex(12);
  await t("hodisalar qabul qilinadi; begona domen, bot, buzuq so'rov rad", async () => {
    const pv1 = hex(12);
    const r1 = await beacon(A.trackingId, {
      origin: O, vid: v1, sid: s1,
      ev: [
        { e: "session_start", u: O + "/" },
        { e: "page_view", id: pv1, u: O + "/?utm_source=instagram&utm_medium=cpc&utm_campaign=kuz&email=a@b.uz", r: "https://l.instagram.com/" },
      ],
    });
    assert.equal(r1.status, 202);
    // Takroriy hodisa (bir xil id) — ikkinchi marta sanalmaydi
    await beacon(A.trackingId, { origin: O, vid: v1, sid: s1, ev: [{ e: "page_view", id: pv1, u: O + "/" }] });
    await beacon(A.trackingId, {
      origin: O, vid: v1, sid: s1,
      ev: [
        { e: "page_view", u: O + "/narxlar" },
        { e: "form_submit", u: O + "/narxlar", n: "ariza" },
        { e: "page_view", u: O + "/rahmat" },
        { e: "purchase", u: O + "/rahmat", v: 250000 },
        { e: "page_exit", u: O + "/rahmat", du: 15000, sd: 80 },
      ],
    });
    // Ikkinchi tashrif buyuruvchi: Google'dan, telefon, 1 sahifa — bounce
    await beacon(A.trackingId, { origin: O, ua: UA_PHONE, vid: v2, sid: s2, ev: [{ e: "session_start", u: O + "/" }, { e: "page_view", u: O + "/", r: "https://www.google.com/" }] });
    // Rad etilishi kerak bo'lganlar
    assert.equal((await beacon(A.trackingId, { origin: "https://evil.example", vid: hex(12), sid: hex(12), ev: [{ e: "page_view", u: O + "/" }] })).status, 403);
    assert.equal((await beacon(A.trackingId, { origin: O, ua: "Mozilla/5.0 HeadlessChrome/120", vid: hex(12), sid: hex(12), ev: [{ e: "page_view", u: O + "/" }] })).text, "bot");
    assert.equal((await beacon(A.trackingId, { origin: O, vid: "x", sid: hex(12), ev: [{ e: "page_view", u: O + "/" }] })).status, 400);
    assert.equal((await beacon("UFQ-NOPE0000", { origin: O, vid: hex(12), sid: hex(12), ev: [{ e: "page_view", u: O + "/" }] })).status, 404);
    // A saytining tracking ID si bilan B saytining sahifasini yozib bo'lmaydi
    assert.equal((await beacon(A.trackingId, { origin: "https://blog-wa-test.example", vid: hex(12), sid: hex(12), ev: [{ e: "page_view", u: "https://blog-wa-test.example/" }] })).status, 403);
    const bad = await fetch(base + "/api/wa/collect", { method: "POST", headers: { "Content-Type": "text/plain", Origin: O }, body: "{bad" });
    assert.equal(bad.status, 400);
    await wait(400); // javobdan keyingi yozuvlar tugashini kutamiz
  });

  let st;
  await t("statistika: sessiyalar, manbalar, konversiya, daromad", async () => {
    st = (await call("GET", `/api/super/wa/sites/${A.id}/stats?period=today`)).body;
    assert.equal(st.ok, true, st.error);
    const c = st.kpis.cur;
    assert.equal(c.sessions, 2);
    assert.equal(c.visitors, 2);
    assert.equal(c.pageviews, 4, "takroriy page_view sanalmadi");
    assert.equal(c.conversions, 2, "purchase + /rahmat maqsadi");
    assert.equal(c.convSessions, 1);
    assert.equal(c.conversionRate, 50);
    assert.equal(c.revenue, 250000);
    assert.equal(c.bounceRate, 50);
    assert.equal(c.newSessions, 2);
    assert.equal(c.estimatedEnd, 1, "ikkinchi sessiyada chiqish hodisasi yo'q");
    const src = Object.fromEntries(st.sources.map((x) => [x.key, x.sessions]));
    assert.deepEqual(src, { Instagram: 1, Google: 1 });
    assert.equal(st.channels.find((x) => x.key === "Pulli reklama")?.sessions, 1);
    assert.equal(st.devices.find((x) => x.key === "Telefon")?.sessions, 1);
    const home = st.pages.find((p) => p.path === "/");
    assert.equal(home.entries, 2);
    assert.ok(!st.pages.some((p) => p.path.includes("email")), "so'rov parametrlari saqlanmagan");
    assert.equal(st.pages.find((p) => p.path === "/rahmat").avgTime, 15);
    const camp = st.campaigns.find((x) => x.campaign === "kuz");
    assert.equal(camp.sessions, 1);
    assert.equal(camp.spend, null);
    assert.equal(camp.roas, null);
    assert.ok(st.journey.topPaths.some((p) => p.path === "Instagram → / → /narxlar → /rahmat → ✓ Natija"));
    assert.equal(st.funnel[3].value, 1);
    assert.equal(st.goals[0].sessions, 1);
  });

  await t("filtrlar: manba, qurilma, sahifa", async () => {
    const g = (q) => call("GET", `/api/super/wa/sites/${A.id}/stats?period=today&${q}`).then((r) => r.body.kpis.cur.sessions);
    assert.equal(await g("source=Google"), 1);
    assert.equal(await g("device=Telefon"), 1);
    assert.equal(await g("page=%2Fnarxlar"), 1);
    assert.equal(await g("event=purchase"), 1);
    assert.equal(await g("campaign=kuz"), 1);
  });

  await t("saytlar aralashmaydi", async () => {
    const sb = (await call("GET", `/api/super/wa/sites/${B.id}/stats?period=today`)).body;
    assert.equal(sb.kpis.cur.sessions, 0);
    assert.equal(sb.pages.length, 0);
    const ov = (await call("GET", `/api/super/wa/overview?period=today`)).body;
    assert.equal(ov.kpis.cur.sessions, 2);
    assert.equal(ov.sites.find((s) => s.id === A.id).sessions, 2);
    assert.equal(ov.sites.find((s) => s.id === B.id).sessions, 0);
    assert.equal(ov.totals.sites, 2);
    const onlyB = (await call("GET", `/api/super/wa/overview?period=today&site=${B.id}`)).body;
    assert.equal(onlyB.kpis.cur.sessions, 0);
  });

  await t("real vaqt, hodisalar jurnali (sahifalangan), tracking holati", async () => {
    const rt = (await call("GET", `/api/super/wa/sites/${A.id}/realtime`)).body;
    assert.equal(rt.activeSessions, 2);
    assert.ok(rt.recent.length > 0);
    const ev = (await call("GET", `/api/super/wa/sites/${A.id}/events?period=today&page=1&limit=5`)).body;
    assert.equal(ev.events.length, 5);
    assert.ok(ev.total >= 9);
    assert.ok(!("vid" in ev.events[0]), "psevdonim ID chiqarilmaydi");
    const s = (await call("GET", `/api/super/wa/sites/${A.id}`)).body.site;
    assert.equal(s.tracking, "active");
  });

  await t("xarajat importi: CPA va ROAS hisoblanadi; noto'g'ri qator o'tkaziladi", async () => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date());
    const r = await call("POST", `/api/super/wa/sites/${A.id}/spend`, { rows: [{ date: today, campaign: "kuz", spend: "100 000" }, { date: "yomon", campaign: "x", spend: 1 }] });
    assert.equal(r.body.added, 1);
    assert.deepEqual(r.body.skipped, [2]);
    const camp = (await call("GET", `/api/super/wa/sites/${A.id}/stats?period=today`)).body.campaigns.find((x) => x.campaign === "kuz");
    assert.equal(camp.spend, 100000);
    assert.equal(camp.cpa, 50000, "100 000 / 2 konversiya");
    assert.equal(camp.roas, 2.5, "250 000 / 100 000");
  });

  await t("CSV eksport", async () => {
    const r = await fetch(`${base}/api/super/wa/sites/${A.id}/export?period=today&kind=sessions`, { headers: { Authorization: "Bearer super" } });
    assert.equal(r.status, 200);
    const csv = await r.text();
    assert.equal(csv.trim().split("\r\n").length, 3, "sarlavha + 2 sessiya");
    assert.ok(csv.includes("Instagram"));
  });

  await t("sozlash, to'xtatish va o'chirish (tasdiq bilan)", async () => {
    const up = await call("POST", `/api/super/wa/sites/${A.id}`, { status: "paused", goals: [{ name: "Lead", type: "event", match: "lead", lead: true }] });
    assert.equal(up.body.site.status, "paused");
    assert.equal((await call("DELETE", `/api/super/wa/sites/${B.id}`)).status, 400, "domen yozilmasa o'chirilmaydi");
    assert.equal((await call("DELETE", `/api/super/wa/sites/${B.id}?confirm=blog-wa-test.example`)).status, 200);
    assert.equal((await call("GET", `/api/super/wa/sites/${B.id}`)).status, 404);
  });

  console.log(`\n${n} ta integratsion test o'tdi · audit: ${[...new Set(audits)].join(", ")}`);
} finally {
  srv.close();
  await db.dropDatabase().catch(() => {});
  await client.close();
}
