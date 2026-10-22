/**
 * analytics.js — Super Admin uchun monitoring va faoliyat jurnali (server tomoni).
 *
 *   • metricsMiddleware      — har bir /api/ so'rovning vaqti va holatini
 *                              XOTIRADA hisoblaydi (bazaga yozmaydi, server
 *                              sekinlashmaydi). Server qayta ishga tushsa
 *                              hisoblagich noldan boshlanadi.
 *   • summarizeCrmChange     — CRM ma'lumoti saqlanganda nima o'zgarganini
 *                              qisqa xulosa qiladi (audit jurnali uchun).
 *   • createAnalyticsRouter  — /api/admin/monitor, /api/admin/activity,
 *                              /api/admin/report-export (faqat admin).
 *
 * Jurnalga hech qachon parol, token yoki so'rov tanasi yozilmaydi. So'rov
 * manzilidan query qismi olib tashlanadi (masalan ?access_token=...).
 */
import os from "node:os";
import { Router } from "express";

// ─── 1. So'rov metrikalari ────────────────────────────────────────────────────

const STARTED_AT = Date.now();
const MINUTES = 60; // daqiqalik grafik uchun oxirgi 60 daqiqa
const minuteBuckets = new Map(); // minuteKey -> {n, err, ms}
const endpoints = new Map(); // "GET /api/x/:id" -> stats
const recentErrors = []; // oxirgi 100 ta xato
const MAX_ENDPOINTS = 300;
const latencies = []; // oxirgi 2000 ta so'rov vaqti (p95 uchun)

/** /api/users/123 → /api/users/:id — endpointlarni guruhlash uchun. */
function routeKey(method, path) {
  const clean = String(path || "")
    .split("?")[0]
    .split("/")
    .map((seg) => {
      if (!seg) return seg;
      if (/^\d+$/.test(seg)) return ":id";
      if (/^[a-f0-9]{16,}$/i.test(seg)) return ":id";
      if (/^[A-Za-z0-9_-]{24,}$/.test(seg)) return ":id";
      if (seg.length > 40) return ":val";
      return seg;
    })
    .join("/");
  return method + " " + clean.slice(0, 120);
}

const minuteKey = (t) => Math.floor(t / 60000);

function prune(now) {
  const min = minuteKey(now) - MINUTES;
  for (const k of minuteBuckets.keys()) if (k <= min) minuteBuckets.delete(k);
}

export function metricsMiddleware(req, res, next) {
  if (!req.path.startsWith("/api/")) return next();
  const t0 = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const now = Date.now();
    const status = res.statusCode;
    const isErr = status >= 500 || (status >= 400 && status !== 401 && status !== 404);
    // SSE oqimi soatlab ochiq turadi — javob vaqtiga qo'shilmaydi
    const longLived = req.path.startsWith("/api/events");

    const mk = minuteKey(now);
    const b = minuteBuckets.get(mk) || { n: 0, err: 0, ms: 0 };
    b.n++;
    if (status >= 500) b.err++;
    if (!longLived) b.ms += ms;
    minuteBuckets.set(mk, b);
    if (minuteBuckets.size > MINUTES + 5) prune(now);

    if (!longLived) {
      latencies.push(ms);
      if (latencies.length > 2000) latencies.shift();
    }

    const key = routeKey(req.method, req.originalUrl || req.path);
    let e = endpoints.get(key);
    if (!e) {
      if (endpoints.size >= MAX_ENDPOINTS) return; // xotira cheksiz o'smasin
      e = { key, n: 0, e4: 0, e5: 0, ms: 0, max: 0, lastStatus: 0, lastErrorAt: null };
      endpoints.set(key, e);
    }
    e.n++;
    if (!longLived) {
      e.ms += ms;
      if (ms > e.max) e.max = ms;
    }
    e.lastStatus = status;
    if (status >= 500) e.e5++;
    else if (status >= 400) e.e4++;
    if (isErr) {
      e.lastErrorAt = now;
      recentErrors.push({ at: new Date(now).toISOString(), method: req.method, path: key.split(" ")[1], status, ms: Math.round(ms) });
      if (recentErrors.length > 100) recentErrors.shift();
    }
  });
  next();
}

function requestStats() {
  const now = Date.now();
  prune(now);
  const cur = minuteKey(now);
  const series = [];
  for (let i = MINUTES - 1; i >= 0; i--) {
    const b = minuteBuckets.get(cur - i) || { n: 0, err: 0, ms: 0 };
    series.push({ t: new Date((cur - i) * 60000).toISOString(), n: b.n, err: b.err, avgMs: b.n ? Math.round(b.ms / b.n) : null });
  }
  const sum = (arr) => arr.reduce((a, x) => ({ n: a.n + x.n, err: a.err + x.err }), { n: 0, err: 0 });
  const last = (m) => sum(series.slice(-m));
  const sorted = latencies.slice().sort((a, b) => a - b);
  const pct = (p) => (sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]) : null);
  const all = [...endpoints.values()].map((e) => ({
    key: e.key,
    n: e.n,
    e4: e.e4,
    e5: e.e5,
    avgMs: e.n ? Math.round(e.ms / e.n) : null,
    maxMs: Math.round(e.max),
    lastStatus: e.lastStatus,
    lastErrorAt: e.lastErrorAt ? new Date(e.lastErrorAt).toISOString() : null,
  }));
  return {
    since: new Date(STARTED_AT).toISOString(),
    lastMinute: last(1),
    last15: last(15),
    last60: last(60),
    p50: pct(0.5),
    p95: pct(0.95),
    sampleSize: sorted.length,
    series,
    topByCount: all.slice().sort((a, b) => b.n - a.n).slice(0, 12),
    topByErrors: all.filter((e) => e.e4 + e.e5 > 0).sort((a, b) => b.e5 + b.e4 - (a.e5 + a.e4)).slice(0, 12),
    recentErrors: recentErrors.slice(-30).reverse(),
  };
}

// ─── 2. CRM o'zgarishlari xulosasi ────────────────────────────────────────────

const LIST_SECTIONS = {
  students: "Talabalar",
  groups: "Guruhlar",
  mentors: "Mentorlar",
  courses: "Kurslar",
  finance: "Moliya",
  tests: "Testlar",
};

const nameOf = (x) => String((x && (x.name || x.title || x.desc || x.description)) || (x && x.id) || "").slice(0, 60);

function diffList(prev, next) {
  const a = Array.isArray(prev) ? prev : [];
  const b = Array.isArray(next) ? next : [];
  const pa = new Map(a.filter((x) => x && x.id != null).map((x) => [String(x.id), x]));
  const pb = new Map(b.filter((x) => x && x.id != null).map((x) => [String(x.id), x]));
  const added = [], removed = [], changed = [];
  const fields = new Set(); // qaysi maydonlar o'zgargani (qiymatlari emas)
  for (const [id, x] of pb) {
    if (!pa.has(id)) added.push(nameOf(x));
    else if (JSON.stringify(pa.get(id)) !== JSON.stringify(x)) {
      changed.push(nameOf(x));
      const old = pa.get(id) || {};
      for (const k of new Set([...Object.keys(old), ...Object.keys(x)]))
        if (JSON.stringify(old[k]) !== JSON.stringify(x[k])) fields.add(k);
    }
  }
  for (const [id, x] of pa) if (!pb.has(id)) removed.push(nameOf(x));
  return { added, removed, changed, fields: [...fields].slice(0, 8) };
}

/** Map turidagi bo'lim (attendance, grades...) — nechta kalit o'zgargan. */
function diffMap(prev, next) {
  const a = prev && typeof prev === "object" ? prev : {};
  const b = next && typeof next === "object" ? next : {};
  let changed = 0;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) changed++;
  return changed;
}

/**
 * @returns {null | {sections: object, summary: string}} — o'zgarish bo'lmasa null.
 */
export function summarizeCrmChange(prev, next) {
  if (!next || typeof next !== "object") return null;
  const p = prev || {};
  const sections = {};
  const parts = [];
  for (const [k, label] of Object.entries(LIST_SECTIONS)) {
    if (!(k in next)) continue;
    const d = diffList(p[k], next[k]);
    if (d.added.length + d.removed.length + d.changed.length === 0) continue;
    sections[k] = {
      added: d.added.slice(0, 10),
      removed: d.removed.slice(0, 10),
      changed: d.changed.slice(0, 10),
      counts: [d.added.length, d.removed.length, d.changed.length],
      changedFields: d.fields,
    };
    const bits = [];
    if (d.added.length) bits.push(`+${d.added.length}`);
    if (d.removed.length) bits.push(`−${d.removed.length}`);
    if (d.changed.length) bits.push(`~${d.changed.length}` + (d.fields.length ? ` (${d.fields.join(", ")})` : ""));
    parts.push(`${label} ${bits.join(" ")}`);
  }
  const MAPS = { attendance: "Davomat", simpleGrades: "Baholar", grades: "Mezonli baholar", gradingCriteria: "Baholash mezonlari", testResults: "Test natijalari" };
  for (const [k, label] of Object.entries(MAPS)) {
    if (!(k in next)) continue;
    const n = diffMap(p[k], next[k]);
    if (!n) continue;
    sections[k] = { changedItems: n };
    parts.push(`${label} (${n})`);
  }
  if (!parts.length) return null;
  return { sections, summary: parts.join(", ").slice(0, 300) };
}

// ─── 3. Sozlama o'zgarishlarini jurnalga yozish ───────────────────────────────

const SETTINGS_KEY_RE = /^(edumanage_branding_v1|edumanage_settings_v1|hiddenNav_|edu_shop_v1|edumanage_cert_templates_v1)/;
const settingsSeen = new Map(); // `${actor}|${key}` -> vaqt (bir xil yozuvni ko'paytirmaslik uchun)

/** KV yozuvi sozlama bo'lsa true (60 soniyada bir martadan ko'p emas). */
export function isAuditableSettingWrite(key, actorId) {
  if (!SETTINGS_KEY_RE.test(String(key || ""))) return false;
  const id = `${actorId || "?"}|${key}`;
  const now = Date.now();
  const last = settingsSeen.get(id) || 0;
  if (now - last < 60_000) return false;
  settingsSeen.set(id, now);
  if (settingsSeen.size > 500) settingsSeen.clear();
  return true;
}

// ─── 4. Router ────────────────────────────────────────────────────────────────

const CATEGORY = (ev) => {
  const e = String(ev || "");
  if (e.startsWith("auth.login.success")) return "Kirish";
  if (e === "auth.logout") return "Chiqish";
  if (e.startsWith("auth.login") || e.startsWith("auth.device") || e.startsWith("auth.session")) return "Kirish xatosi";
  if (e.startsWith("data.change")) return "Ma'lumot o'zgarishi";
  if (e.startsWith("settings.")) return "Sozlama";
  if (e.startsWith("admin.")) return "Hisoblar";
  if (e.startsWith("report.")) return "Eksport";
  if (e.startsWith("server.error")) return "Server xatosi";
  if (e.includes("denied")) return "Rad etilgan";
  return "Boshqa";
};

const isoOrNull = (v) => {
  const d = new Date(String(v || ""));
  return isNaN(d.getTime()) ? null : d;
};

export function createAnalyticsRouter({ getDb, requireAdmin, audit, collections }) {
  const r = Router();

  // ── Monitoring: backend, baza, so'rovlar, faol foydalanuvchilar ─────────
  r.get("/api/admin/monitor", requireAdmin, async (req, res) => {
    const out = {
      ok: true,
      now: new Date().toISOString(),
      server: {
        startedAt: new Date(STARTED_AT).toISOString(),
        uptimeSec: Math.round(process.uptime()),
        node: process.version,
        memoryMb: Math.round(process.memoryUsage().rss / 1048576),
        heapMb: Math.round(process.memoryUsage().heapUsed / 1048576),
        load1: Math.round(os.loadavg()[0] * 100) / 100,
        cpus: os.cpus().length,
        platform: process.platform,
      },
      requests: requestStats(),
      db: { ok: false },
    };
    try {
      const db = getDb();
      const t0 = Date.now();
      await db.command({ ping: 1 });
      out.db = { ok: true, pingMs: Date.now() - t0, counts: {} };
      for (const c of collections || []) {
        try {
          out.db.counts[c] = await db.collection(c).estimatedDocumentCount();
        } catch {}
      }
      const now = Date.now();
      // Faol sessiyalar: bekor qilinmagan va oxirgi 30 daqiqada ishlatilgan
      const since30 = new Date(now - 30 * 60_000);
      const activeSessions = await db
        .collection("auth_sessions")
        .aggregate([
          { $match: { revokedAt: null, lastUsedAt: { $gte: since30 } } },
          { $group: { _id: "$role", n: { $sum: 1 }, users: { $addToSet: "$accountId" } } },
        ])
        .toArray();
      out.sessions = {};
      for (const s of activeSessions) out.sessions[s._id || "?"] = { sessions: s.n, users: s.users.length };
      // Hozir onlayn: ilova ochiq bo'lsa har 20 soniyada "presence_" belgisi yoziladi
      const presence = await db
        .collection("kv")
        .find({ key: { $regex: "^presence_" } }, { projection: { key: 1, value: 1 } })
        .toArray();
      const online = { student: 0, mentor: 0 };
      for (const p of presence) {
        const ts = Number(String(p.value || "").replace(/"/g, ""));
        if (!ts || now - ts > 90_000) continue;
        if (p.key.startsWith("presence_student_")) online.student++;
        else if (p.key.startsWith("presence_mentor_")) online.mentor++;
      }
      out.online = online;
      const crm = await db.collection("crm_data").findOne({ _type: "main" }, { projection: { _updatedAt: 1 } });
      out.lastDataUpdate = crm?._updatedAt || null;
      const lastBackup = await db.collection("crm_data_backups").findOne({}, { sort: { createdAt: -1 }, projection: { createdAt: 1 } });
      out.lastBackup = lastBackup?.createdAt || null;
      // Oxirgi 24 soatdagi server xatolari (jurnaldan — restartdan keyin ham saqlanadi)
      out.serverErrors24h = await db
        .collection("security_audit")
        .countDocuments({ event: "server.error", at: { $gte: new Date(now - 86400_000) } });
    } catch (e) {
      out.db = { ok: false, error: "Bazaga ulanib bo'lmadi" };
    }
    res.json(out);
  });

  // ── Faoliyat jurnali: filtr, sahifalash va jamlanma ─────────────────────
  r.get("/api/admin/activity", requireAdmin, async (req, res) => {
    try {
      const db = getDb();
      const to = isoOrNull(req.query.to) || new Date();
      const from = isoOrNull(req.query.from) || new Date(to.getTime() - 7 * 86400_000);
      const match = { at: { $gte: from, $lte: to } };
      const ev = String(req.query.event || "").replace(/[^a-z_.]/gi, "").slice(0, 60);
      if (ev) match.event = { $regex: "^" + ev.replace(/\./g, "\\.") };
      const actor = String(req.query.actor || "").replace(/[^a-z0-9._@+-]/gi, "").slice(0, 64);
      if (actor) match.actorName = actor;
      const sev = String(req.query.severity || "");
      if (["info", "warn", "critical"].includes(sev)) match.severity = sev;

      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
      const page = Math.max(Number(req.query.page) || 1, 1);
      const col = db.collection("security_audit");
      const [total, events, byDay, byEvent, byActor] = await Promise.all([
        col.countDocuments(match),
        col
          .find(match, { projection: { ua: 0 } })
          .sort({ at: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .toArray(),
        col
          .aggregate([
            { $match: match },
            {
              $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$at", timezone: "Asia/Tashkent" } },
                n: { $sum: 1 },
                warn: { $sum: { $cond: [{ $in: ["$severity", ["warn", "critical"]] }, 1, 0] } },
              },
            },
            { $sort: { _id: 1 } },
          ])
          .toArray(),
        col.aggregate([{ $match: match }, { $group: { _id: "$event", n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 40 }]).toArray(),
        col
          .aggregate([
            { $match: { ...match, actorName: { $ne: null } } },
            { $group: { _id: { name: "$actorName", role: "$actorRole" }, n: { $sum: 1 }, last: { $max: "$at" } } },
            { $sort: { n: -1 } },
            { $limit: 15 },
          ])
          .toArray(),
      ]);
      const categories = {};
      for (const e of byEvent) categories[CATEGORY(e._id)] = (categories[CATEGORY(e._id)] || 0) + e.n;
      res.json({
        ok: true,
        from,
        to,
        total,
        page,
        limit,
        events: events.map((e) => ({
          at: e.at,
          event: e.event,
          category: CATEGORY(e.event),
          severity: e.severity,
          actor: e.actorName,
          role: e.actorRole,
          ip: e.ip,
          path: e.path,
          meta: e.meta,
        })),
        byDay: byDay.map((d) => ({ day: d._id, n: d.n, warn: d.warn })),
        byEvent: byEvent.map((e) => ({ event: e._id, category: CATEGORY(e._id), n: e.n })),
        byActor: byActor.map((a) => ({ name: a._id.name, role: a._id.role, n: a.n, last: a.last })),
        categories,
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: "Jurnal o'qilmadi" });
    }
  });

  // ── Admin hisoblari soni (umumiy statistika kartasi uchun) ──────────────
  r.get("/api/admin/analytics/accounts", requireAdmin, async (req, res) => {
    try {
      const rows = await getDb()
        .collection("accounts")
        .aggregate([
          {
            $group: {
              _id: "$role",
              n: { $sum: 1 },
              active30: { $sum: { $cond: [{ $gte: ["$lastLoginAt", new Date(Date.now() - 30 * 86400_000)] }, 1, 0] } },
            },
          },
        ])
        .toArray();
      const out = {};
      for (const r0 of rows) out[r0._id] = { total: r0.n, loggedIn30d: r0.active30 };
      res.json({ ok: true, roles: out });
    } catch {
      res.status(500).json({ ok: false, error: "Hisoblar o'qilmadi" });
    }
  });

  // ── Eksport qilinganini jurnalga yozish ──────────────────────────────────
  // Hisobot brauzerda tayyorlanadi (ma'lumot allaqachon adminda), lekin
  // "kim, qachon, qaysi hisobotni oldi" serverda qayd etiladi.
  r.post("/api/admin/report-export", requireAdmin, async (req, res) => {
    const b = req.body || {};
    const clip = (v, n) => String(v == null ? "" : v).slice(0, n);
    await audit("report.export", {
      req,
      actor: req.user,
      meta: {
        report: clip(b.report, 60),
        format: clip(b.format, 10),
        from: clip(b.from, 30),
        to: clip(b.to, 30),
        filters: clip(JSON.stringify(b.filters || {}), 200),
        rows: Number(b.rows) || 0,
      },
    });
    res.json({ ok: true });
  });

  return r;
}
