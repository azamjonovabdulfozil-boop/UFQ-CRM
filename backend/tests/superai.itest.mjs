/**
 * Super Admin AI — integratsion sinov (xotiradagi soxta baza + soxta Super
 * Admin API, lekin HAQIQIY Claude API). Haqiqiy bazaga tegmaydi.
 *   node --env-file=.env tests/superai.itest.mjs
 */
import assert from "node:assert/strict";
import express from "express";
import { createSuperAiRouter } from "../superadmin/ai.js";

if (!process.env.ANTHROPIC_API_KEY) {
  console.log("⏭  ANTHROPIC_API_KEY yo'q — sinov o'tkazib yuborildi");
  process.exit(0);
}

// ── Xotiradagi soxta MongoDB ────────────────────────────────────────────────
const store = {
  crm_data: [
    {
      _type: "main",
      nextId: 10,
      courses: [{ id: 1, name: "Frontend", price: "600000", status: "Faol" }],
      mentors: [{ id: 2, name: "Aziz Karimov", phone: "+998901112233" }],
      groups: [{ id: 3, name: "FE-1", courseId: 1, course: "Frontend", mentorId: 2, mentor: "Aziz Karimov", status: "Faol", days: ["Du", "Ch"] }],
      students: [
        { id: 4, name: "Ali Valiyev", groupId: 3, status: "Aktiv", isDebtor: true },
        { id: 5, name: "Vali Aliyev", groupId: 3, status: "Aktiv", isDebtor: false },
      ],
      finance: [],
    },
  ],
  kv: [],
  super_ai_chats: [],
};
const match = (doc, q) => Object.entries(q).every(([k, v]) => doc[k] === v);
const col = (name) => ({
  findOne: async (q) => store[name].find((d) => match(d, q)) || null,
  updateOne: async (q, u) => {
    const d = store[name].find((x) => match(x, q));
    if (d) Object.assign(d, u.$set);
  },
  replaceOne: async (q, doc) => {
    const i = store[name].findIndex((x) => match(x, q));
    if (i >= 0) store[name][i] = doc;
    else store[name].push(doc);
  },
  deleteOne: async (q) => {
    store[name] = store[name].filter((x) => !match(x, q));
  },
  find: (q) => ({ sort: () => ({ limit: () => ({ toArray: async () => store[name].filter((d) => match(d, q)) }) }) }),
});
const audits = [];

// ── Soxta Super Admin API (AI uni shu port orqali chaqiradi) ─────────────────
const api = express();
api.use(express.json());
api.get("/api/super/data/:entity", (req, res) => {
  const rows = store.crm_data[0][req.params.entity] || [];
  res.json({ ok: true, total: rows.length, rows });
});
api.get("/api/super/overview", (req, res) => res.json({ ok: true, students: store.crm_data[0].students.length, groups: 1 }));
api.get("/api/super/modules", (req, res) =>
  res.json({ ok: true, modules: [{ key: "finance", label: "Moliya", state: { menu: true, api: true } }], settingsMenu: { admin: true, mentor: true, student: true } }),
);
const posted = [];
api.post("/api/super/modules", (req, res) => {
  posted.push(req.body);
  res.json({ ok: true });
});
api.get("/api/super/reports", (req, res) => res.json({ ok: true, reports: [{ key: "attendance", title: "Davomat" }] }));
api.get("/api/super/reports/:kind", (req, res) => res.json({ ok: true, report: { title: "Davomat", rows: [[1], [2]] } }));
api.use((req, res) => res.status(404).json({ ok: false, error: "yo'q: " + req.path }));
const apiSrv = api.listen(0);
const apiPort = apiSrv.address().port;

// ── AI router ───────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.user = { sub: "u1", username: "super", role: "admin", isSuper: true };
  next();
});
app.use(
  createSuperAiRouter({
    getDb: () => ({ collection: col }),
    audit: async (ev, o) => audits.push({ ev, meta: o.meta }),
    requireSuperAdmin: (_q, _s, n) => n(),
    rateLimit: () => (_q, _s, n) => n(),
    broadcast: () => {},
    snapshotCrmData: async () => {},
    CRM_KV_KEY: "edumanage_crm_v8",
    port: apiPort,
  }),
);
const srv = app.listen(0);
const base = `http://127.0.0.1:${srv.address().port}`;
const chat = async (message, chatId) =>
  (await fetch(base + "/api/super/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, chatId }) })).json();

try {
  let r = await chat("Nechta o'quvchi bor? Ismlarini yoz.");
  console.log("1)", r.ok, r.engine, r.error || "", JSON.stringify(r.reply || "").slice(0, 300));
  assert.equal(r.ok, true, r.error);
  assert.match(r.reply, /Ali Valiyev/);

  r = await chat("FE-1 guruhiga Sardor Usmonov degan yangi o'quvchi qo'sh", r.chatId);
  console.log("2)", r.ok, r.error || "", JSON.stringify(r.actions), JSON.stringify(r.reply || "").slice(0, 200));
  assert.ok(store.crm_data[0].students.some((s) => /Sardor/.test(s.name) && s.groupId === 3), "o'quvchi qo'shilmadi");

  r = await chat("Vali Aliyevni o'chir", r.chatId);
  console.log("3a)", JSON.stringify(r.reply).slice(0, 200));
  assert.ok(store.crm_data[0].students.some((s) => s.id === 5), "tasdiqsiz o'chirib yubordi!");
  r = await chat("Ha, tasdiqlayman, o'chir", r.chatId);
  console.log("3b)", JSON.stringify(r.actions));
  assert.ok(!store.crm_data[0].students.some((s) => s.id === 5), "tasdiqdan keyin ham o'chirilmadi");

  r = await chat("Talabalar sozlamasidagi «Menyu bo'limlari»ni o'chirib qo'y", r.chatId);
  console.log("4)", JSON.stringify(posted), JSON.stringify(r.reply).slice(0, 160));
  assert.equal(posted.at(-1)?.settingsMenu?.student, false);

  r = await chat("Oxirgi 30 kunlik davomat hisobotini Excel qilib ber", r.chatId);
  console.log("5)", JSON.stringify(r.files));
  assert.equal(r.files?.[0]?.kind, "attendance");
  assert.equal(r.files?.[0]?.format, "xlsx");
  console.log("audit:", audits.map((a) => a.ev).join(", "));
  console.log("\n✅ Super Admin AI sinovi o'tdi");
} finally {
  srv.close();
  apiSrv.close();
}
