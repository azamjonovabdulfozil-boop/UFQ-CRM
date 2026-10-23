/**
 * webanalytics/router.js — Saytlar analitikasi (Super Admin).
 *
 * Ikki qism:
 *   1) OCHIQ tracking — `createWaPublicRouter`: /api/wa/t.js (skript) va
 *      /api/wa/collect (hodisalar). Bu marshrutlar umumiy xavfsizlik
 *      qatlamidan OLDIN ulanadi: CORS/CSRF tekshiruvi tashqi saytlardan
 *      keladigan so'rovni to'sardi. O'rniga o'z himoyasi bor: tracking ID,
 *      Origin/sahifa domeni sayt domeniga mosligi, botlar filtri, hajm va
 *      IP bo'yicha so'rov limiti, takroriy hodisalarni rad etish.
 *   2) Super Admin API — `createWaSuperRouter`: faqat Super Admin.
 *
 * Kolleksiyalar (ishga tushganda indekslar yaratiladi — bu "migratsiya"):
 *   wa_sites      saytlar (site_id = _id, trackingId noyob, key — takroriy URL ni aniqlash)
 *   wa_events     xom hodisalar (TTL bilan avtomatik o'chadi)
 *   wa_sessions   sessiyalar (har hodisada yangilanadi — statistika shundan)
 *   wa_visitors   psevdonim tashrif buyuruvchilar (yangi / qaytgan)
 *   wa_spend      import qilingan reklama xarajatlari
 *   wa_alerts     aniqlangan ogohlantirishlar tarixi
 *   wa_checks     sayt texnik holati tekshiruvlari (TTL)
 */
import express, { Router } from "express";
import { randomBytes } from "node:crypto";
import { assertSafeUrl } from "../security/ssrf.js";
import { clientIp } from "../security/rateLimit.js";
import { selfOrigin } from "../security/cors.js";
import * as C from "./core.js";
import { trackerScript } from "./tracker.js";

const RETENTION_DAYS = Math.max(30, Number(process.env.WA_RETENTION_DAYS) || 400);
const MAX_DOCS = 300_000; // bitta hisobotda o'qiladigan hujjatlar chegarasi
const CATEGORIES = ["Biznes", "Ta'lim", "Internet do'kon", "Xizmatlar", "Blog / Media", "Portfolio", "Davlat / Jamiyat", "Boshqa"];
const GOAL_TYPES = ["page", "event", "click", "form"];

const rid = (n) => randomBytes(n).toString("hex");
const newTrackingId = () => "UFQ-" + randomBytes(6).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "X").slice(0, 8);
const clip = (v, n) => String(v ?? "").replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, n);
const validTz = (tz) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export function createWaStore(getDb) {
  const db = () => getDb();
  const col = (n) => db().collection(n);
  let indexed = false;
  async function ensureIndexes() {
    if (indexed) return;
    indexed = true;
    try {
      await Promise.all([
        col("wa_sites").createIndex({ trackingId: 1 }, { unique: true }),
        col("wa_sites").createIndex({ key: 1 }, { unique: true }),
        col("wa_events").createIndex({ siteId: 1, eid: 1 }, { unique: true }),
        col("wa_events").createIndex({ siteId: 1, type: 1, t: -1 }),
        col("wa_events").createIndex({ t: 1 }, { expireAfterSeconds: RETENTION_DAYS * 86400 }),
        col("wa_sessions").createIndex({ siteId: 1, sid: 1 }, { unique: true }),
        col("wa_sessions").createIndex({ siteId: 1, start: -1 }),
        col("wa_sessions").createIndex({ siteId: 1, last: -1 }),
        col("wa_sessions").createIndex({ start: 1 }, { expireAfterSeconds: RETENTION_DAYS * 86400 }),
        col("wa_visitors").createIndex({ siteId: 1, vid: 1 }, { unique: true }),
        col("wa_visitors").createIndex({ last: 1 }, { expireAfterSeconds: RETENTION_DAYS * 86400 }),
        col("wa_spend").createIndex({ siteId: 1, date: 1 }),
        col("wa_alerts").createIndex({ siteId: 1, key: 1 }, { unique: true }),
        col("wa_alerts").createIndex({ at: -1 }),
        col("wa_checks").createIndex({ siteId: 1, at: -1 }),
        col("wa_checks").createIndex({ at: 1 }, { expireAfterSeconds: 30 * 86400 }),
      ]);
    } catch (e) {
      indexed = false;
      console.error("❌ [wa] indekslar:", e?.message);
    }
  }
  return { db, col, ensureIndexes };
}

// ═══════════════════════════ OCHIQ TRACKING ═══════════════════════════════════

export function createWaPublicRouter({ getDb, rateLimit }) {
  const store = createWaStore(getDb);
  const { col } = store;
  const r = Router();

  // Sayt keshi (har hodisada bazaga bormaslik uchun)
  const siteCache = new Map();
  async function siteByTid(tid) {
    if (!/^UFQ-[A-Z0-9]{8}$/.test(String(tid || ""))) return null;
    const c = siteCache.get(tid);
    if (c && Date.now() - c.at < 60_000) return c.site;
    const site = await col("wa_sites").findOne({ trackingId: tid });
    siteCache.set(tid, { at: Date.now(), site });
    if (siteCache.size > 5000) siteCache.clear();
    return site;
  }

  // Bir sessiyaning hodisalari ketma-ket qayta ishlanadi (poyga holatisiz)
  const locks = new Map();
  function withLock(key, fn) {
    const prev = locks.get(key) || Promise.resolve();
    const next = prev.then(fn, fn);
    locks.set(key, next.catch(() => {}));
    next.finally(() => {
      if (locks.get(key) === next || locks.size > 10000) locks.delete(key);
    });
    return next;
  }

  const ipLimiter = rateLimit({ windowMs: 60_000, max: 240, name: "wa-collect", key: (req) => clientIp(req) });
  const lastSeenWrite = new Map();

  const plain = (res, code, body = "") => {
    res.status(code);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(body);
  };

  // ── Skript ──
  r.get("/api/wa/t.js", async (req, res) => {
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("X-Content-Type-Options", "nosniff");
    try {
      const site = await siteByTid(String(req.query.id || ""));
      if (!site || site.status === "paused") {
        res.setHeader("Cache-Control", "public, max-age=300");
        return res.status(site ? 200 : 404).send("/* UFQ Analytics: " + (site ? "kuzatuv to'xtatilgan" : "noma'lum tracking ID") + " */");
      }
      const base = (process.env.WA_PUBLIC_URL || selfOrigin(req)).replace(/\/$/, "");
      const s = site.settings || {};
      res.setHeader("Cache-Control", "public, max-age=600");
      res.send(
        trackerScript({
          endpoint: base + "/api/wa/collect",
          trackingId: site.trackingId,
          config: { dnt: s.respectDnt !== false, consent: !!s.consentRequired, to: s.sessionTimeoutMin || C.SESSION_TIMEOUT_MIN, sel: s.clickSelectors || "" },
        }),
      );
    } catch (e) {
      console.error("❌ [wa] t.js:", e?.message);
      res.status(500).send("/* xato */");
    }
  });

  // ── Hodisalar ──
  r.options("/api/wa/collect", (req, res) => plain(res, 204));
  r.post("/api/wa/collect", ipLimiter, express.text({ type: () => true, limit: "16kb" }), async (req, res) => {
    // Javob tezda qaytadi — sayt kutib qolmasin
    try {
      let p;
      try {
        p = JSON.parse(typeof req.body === "string" ? req.body : "");
      } catch {
        return plain(res, 400, "bad json");
      }
      if (!p || typeof p !== "object") return plain(res, 400, "bad payload");
      const site = await siteByTid(p.tid);
      if (!site) return plain(res, 404, "unknown site");
      if (site.status === "paused") return plain(res, 202, "paused");
      if (!/^[a-f0-9]{24}$/.test(String(p.vid || "")) || !/^[a-f0-9]{24}$/.test(String(p.sid || ""))) return plain(res, 400, "bad id");
      // Origin (yoki Referer) sayt domenidan bo'lishi kerak
      const origin = req.get("origin") || req.get("referer") || "";
      const oHost = C.hostOf(origin);
      if (site.settings?.strictOrigin !== false && (!oHost || !C.hostAllowed(oHost, site))) return plain(res, 403, "origin");
      const ua = C.parseUA(req.get("user-agent") || "", Number(p.sw) || 0);
      if (ua.bot) return plain(res, 202, "bot");
      const list = Array.isArray(p.ev) ? p.ev.slice(0, 25) : [];
      const now = new Date();
      const evs = list.map((x) => C.normalizeEvent(x, p, site, now)).filter(Boolean);
      if (!evs.length) return plain(res, 202, "empty");
      plain(res, 202, "ok");

      // Qolgani javobdan keyin
      const country = clip(req.get("cf-ipcountry") || req.get("x-vercel-ip-country") || req.get("x-country-code") || "", 2).toUpperCase();
      await withLock(site._id + ":" + p.sid, async () => {
        // Takroriy hodisalar (eid noyob) — rad etiladi
        let fresh = evs;
        try {
          await col("wa_events").insertMany(evs, { ordered: false });
        } catch (e) {
          if (e?.code !== 11000 && !(e?.writeErrors || []).every((w) => w.code === 11000)) throw e;
          const dup = new Set((e.writeErrors || []).map((w) => evs[w.index]?.eid));
          fresh = evs.filter((x) => !dup.has(x.eid));
        }
        if (!fresh.length) return;
        const sessions = col("wa_sessions");
        const prev = await sessions.findOne({ siteId: site._id, sid: p.sid });
        let isNewVisitor = false;
        if (!prev) {
          const before = await col("wa_visitors").findOneAndUpdate(
            { siteId: site._id, vid: p.vid },
            { $setOnInsert: { first: now }, $set: { last: now }, $inc: { sessions: 1 } },
            { upsert: true, returnDocument: "before" },
          );
          isNewVisitor = !(before && (before.value !== undefined ? before.value : before));
        } else await col("wa_visitors").updateOne({ siteId: site._id, vid: p.vid }, { $set: { last: now } });
        const next = C.applySessionEvents(prev, fresh, {
          siteHost: site.host,
          isNewVisitor,
          device: ua.device,
          browser: ua.browser,
          os: ua.os,
          country: country && country !== "XX" ? country : "Noma'lum",
          lang: clip(p.lng, 12) || null,
          goals: site.goals || [],
        });
        const { _id, ...doc } = next;
        await sessions.replaceOne({ siteId: site._id, sid: p.sid }, doc, { upsert: true });
        // Oxirgi hodisa vaqti — daqiqasiga bir marta yoziladi
        const lw = lastSeenWrite.get(site._id) || 0;
        if (Date.now() - lw > 60_000) {
          lastSeenWrite.set(site._id, Date.now());
          await col("wa_sites").updateOne({ _id: site._id }, { $set: { lastEventAt: now, ...(site.firstEventAt ? {} : { firstEventAt: now }) } });
          if (!site.firstEventAt) siteCache.delete(site.trackingId);
        }
      });
    } catch (e) {
      console.error("❌ [wa] collect:", e?.message);
      if (!res.headersSent) plain(res, 500, "error");
    }
  });

  return r;
}

// ═══════════════════════════ SAYT HOLATI (SSRF himoyali) ══════════════════════

export async function checkSite(url, trackingId, { timeoutMs = 8000 } = {}) {
  const at = new Date();
  let current = url;
  const t0 = Date.now();
  for (let hop = 0; hop <= 3; hop++) {
    const chk = await assertSafeUrl(current);
    if (!chk.ok) return { at, ok: false, status: null, ms: null, error: chk.error };
    let r;
    try {
      r = await fetch(chk.url.href, {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "User-Agent": "UFQ-Analytics-Monitor/1.0 (+site health check)", Accept: "text/html,*/*;q=0.5" },
      });
    } catch (e) {
      return { at, ok: false, status: null, ms: Date.now() - t0, error: e?.name === "TimeoutError" ? "Javob kutish vaqti tugadi" : "Ulanib bo'lmadi" };
    }
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
      current = new URL(r.headers.get("location"), chk.url).href;
      continue;
    }
    const ms = Date.now() - t0;
    let snippetFound = null;
    const type = r.headers.get("content-type") || "";
    if (r.ok && /html/i.test(type) && trackingId) {
      try {
        const reader = r.body.getReader();
        let got = 0, text = "";
        while (got < 600_000) {
          const { value, done } = await reader.read();
          if (done) break;
          got += value.length;
          text += Buffer.from(value).toString("utf8");
          if (text.includes(trackingId)) break;
        }
        reader.cancel().catch(() => {});
        snippetFound = text.includes(trackingId);
      } catch {}
    } else r.body?.cancel?.().catch(() => {});
    return { at, ok: r.status < 400, status: r.status, ms, finalUrl: current, snippetFound, error: r.status >= 400 ? "HTTP " + r.status : null };
  }
  return { at, ok: false, status: null, ms: Date.now() - t0, error: "Juda ko'p qayta yo'naltirish" };
}

// ═══════════════════════════ SUPER ADMIN API ══════════════════════════════════

export function createWaSuperRouter({ getDb, requireSuperAdmin: S, audit, rateLimit, getTimezone }) {
  const store = createWaStore(getDb);
  const { col, ensureIndexes } = store;
  const r = Router();
  const fail = (res, e, msg = "Ichki xatolik") => {
    console.error("❌ [wa]", e?.stack || e);
    if (!res.headersSent) res.status(500).json({ ok: false, error: msg });
  };
  const checkLimiter = rateLimit({ windowMs: 60_000, max: 20, name: "wa-check", key: (req) => req.user?.sub || "?" });
  r.use("/api/super/wa", S, async (_req, _res, next) => {
    await ensureIndexes();
    next();
  });

  const pubSite = (s, req) => {
    const base = (process.env.WA_PUBLIC_URL || selfOrigin(req)).replace(/\/$/, "");
    return {
      id: s._id, name: s.name, url: s.url, host: s.host, description: s.description || "", category: s.category || "Boshqa",
      timezone: s.timezone, goals: s.goals || [], settings: s.settings || {}, status: s.status || "active",
      trackingId: s.trackingId, createdAt: s.createdAt, firstEventAt: s.firstEventAt || null, lastEventAt: s.lastEventAt || null,
      health: s.health || null,
      tracking: s.lastEventAt ? (Date.now() - new Date(s.lastEventAt) < 24 * 3600_000 ? "active" : "stale") : "waiting",
      snippet: `<script defer src="${base}/api/wa/t.js?id=${s.trackingId}"></script>`,
      scriptUrl: `${base}/api/wa/t.js?id=${s.trackingId}`,
    };
  };

  function cleanGoals(list) {
    return (Array.isArray(list) ? list : [])
      .slice(0, 20)
      .map((g) => ({
        id: /^[a-z0-9]{6,16}$/.test(String(g?.id || "")) ? g.id : rid(4),
        name: clip(g?.name, 60) || "Maqsad",
        type: GOAL_TYPES.includes(g?.type) ? g.type : "event",
        match: clip(g?.match, 120),
        lead: !!g?.lead,
      }))
      .filter((g) => g.match || g.type === "form");
  }
  function cleanSettings(s = {}, prev = {}) {
    const hosts = (Array.isArray(s.allowedHosts) ? s.allowedHosts : String(s.allowedHosts || "").split(/[\s,]+/))
      .map((h) => String(h).toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
      .filter((h) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h))
      .slice(0, 10);
    const sel = clip(s.clickSelectors ?? prev.clickSelectors ?? "", 200);
    return {
      respectDnt: s.respectDnt !== undefined ? s.respectDnt !== false : prev.respectDnt !== false,
      consentRequired: s.consentRequired !== undefined ? !!s.consentRequired : !!prev.consentRequired,
      strictOrigin: s.strictOrigin !== undefined ? s.strictOrigin !== false : prev.strictOrigin !== false,
      sessionTimeoutMin: Math.min(120, Math.max(5, Math.round(Number(s.sessionTimeoutMin ?? prev.sessionTimeoutMin) || C.SESSION_TIMEOUT_MIN))),
      clickSelectors: /^[a-zA-Z0-9\s.#_\-[\]="':,>*()]*$/.test(sel) ? sel : "",
      allowedHosts: s.allowedHosts !== undefined ? hosts : prev.allowedHosts || [],
    };
  }

  // ── Saytlar ro'yxati ──
  r.get("/api/super/wa/sites", async (req, res) => {
    try {
      const sites = await col("wa_sites").find({}).sort({ createdAt: -1 }).toArray();
      res.json({ ok: true, sites: sites.map((s) => pubSite(s, req)), categories: CATEGORIES });
    } catch (e) {
      fail(res, e);
    }
  });

  // ── Sayt qo'shish ──
  r.post("/api/super/wa/sites", async (req, res) => {
    try {
      const b = req.body || {};
      const name = clip(b.name, 80);
      if (!name) return res.status(400).json({ ok: false, error: "Sayt nomini kiriting" });
      const nu = C.normalizeSiteUrl(b.url);
      if (!nu.ok) return res.status(400).json({ ok: false, error: nu.error });
      // Ichki/maxfiy manzil emasligini tekshiramiz (sayt holatini shu URL orqali tekshiramiz)
      const safe = await assertSafeUrl(nu.url);
      // Domen hali DNS da topilmasa ham qo'shishga ruxsat (holat bo'limida ko'rinadi),
      // lekin ichki tarmoq / localhost manzillari qat'iyan rad etiladi
      if (!safe.ok && safe.error !== "Domen topilmadi") return res.status(400).json({ ok: false, error: "Bu manzilni qo'shib bo'lmaydi: " + safe.error });
      const dup = await col("wa_sites").findOne({ key: nu.key });
      if (dup) return res.status(409).json({ ok: false, code: "duplicate", error: `Bu sayt allaqachon qo'shilgan: «${dup.name}»`, siteId: dup._id });
      const tz = validTz(b.timezone) ? b.timezone : await getTimezone();
      const site = {
        _id: "ws_" + rid(6),
        trackingId: newTrackingId(),
        key: nu.key,
        name,
        url: nu.url,
        origin: nu.origin,
        host: nu.host,
        description: clip(b.description, 500),
        category: CATEGORIES.includes(b.category) ? b.category : "Boshqa",
        timezone: tz,
        goals: cleanGoals(b.goals),
        settings: cleanSettings(b.settings || {}),
        status: "active",
        createdAt: new Date(),
        createdBy: req.user.username,
        lastEventAt: null,
        health: null,
      };
      for (let i = 0; i < 3; i++) {
        try {
          await col("wa_sites").insertOne(site);
          break;
        } catch (e) {
          if (e?.code === 11000 && /trackingId/.test(e.message || "")) site.trackingId = newTrackingId();
          else if (e?.code === 11000) return res.status(409).json({ ok: false, code: "duplicate", error: "Bu sayt allaqachon qo'shilgan" });
          else throw e;
        }
      }
      await audit("super.wa.site_create", { req, actor: req.user, target: { site: site._id, host: site.host }, severity: "info" });
      // Holat tekshiruvi fonda
      checkSite(site.url, site.trackingId)
        .then((h) => Promise.all([col("wa_sites").updateOne({ _id: site._id }, { $set: { health: h } }), col("wa_checks").insertOne({ siteId: site._id, ...h })]))
        .catch(() => {});
      res.json({ ok: true, site: pubSite(site, req) });
    } catch (e) {
      fail(res, e, "Sayt qo'shilmadi");
    }
  });

  async function siteOr404(req, res) {
    const s = await col("wa_sites").findOne({ _id: clip(req.params.id, 40) });
    if (!s) res.status(404).json({ ok: false, error: "Sayt topilmadi" });
    return s;
  }

  r.get("/api/super/wa/sites/:id", async (req, res) => {
    try {
      const s = await siteOr404(req, res);
      if (s) res.json({ ok: true, site: pubSite(s, req), categories: CATEGORIES });
    } catch (e) {
      fail(res, e);
    }
  });

  r.post("/api/super/wa/sites/:id", async (req, res) => {
    try {
      const s = await siteOr404(req, res);
      if (!s) return;
      const b = req.body || {};
      const set = {};
      if (b.name != null) set.name = clip(b.name, 80) || s.name;
      if (b.description != null) set.description = clip(b.description, 500);
      if (b.category != null && CATEGORIES.includes(b.category)) set.category = b.category;
      if (b.timezone != null && validTz(b.timezone)) set.timezone = b.timezone;
      if (b.goals != null) set.goals = cleanGoals(b.goals);
      if (b.settings != null) set.settings = cleanSettings(b.settings, s.settings || {});
      if (b.status === "active" || b.status === "paused") set.status = b.status;
      await col("wa_sites").updateOne({ _id: s._id }, { $set: set });
      await audit("super.wa.site_update", { req, actor: req.user, target: { site: s._id }, meta: { fields: Object.keys(set) } });
      res.json({ ok: true, site: pubSite({ ...s, ...set }, req) });
    } catch (e) {
      fail(res, e, "Saqlanmadi");
    }
  });

  r.delete("/api/super/wa/sites/:id", async (req, res) => {
    try {
      const s = await siteOr404(req, res);
      if (!s) return;
      if (req.query.confirm !== s.host) return res.status(400).json({ ok: false, error: "Tasdiqlash uchun sayt domenini kiriting" });
      await Promise.all(
        ["wa_events", "wa_sessions", "wa_visitors", "wa_spend", "wa_alerts", "wa_checks"].map((c) => col(c).deleteMany({ siteId: s._id })),
      );
      await col("wa_sites").deleteOne({ _id: s._id });
      await audit("super.wa.site_delete", { req, actor: req.user, target: { site: s._id, host: s.host }, severity: "warn" });
      res.json({ ok: true });
    } catch (e) {
      fail(res, e, "O'chirilmadi");
    }
  });

  // ── Ulanish va texnik holat ──
  r.post("/api/super/wa/sites/:id/check", checkLimiter, async (req, res) => {
    try {
      const s = await siteOr404(req, res);
      if (!s) return;
      const h = await checkSite(s.url, s.trackingId);
      await col("wa_sites").updateOne({ _id: s._id }, { $set: { health: h } });
      await col("wa_checks").insertOne({ siteId: s._id, ...h });
      const fresh = await col("wa_sites").findOne({ _id: s._id });
      res.json({ ok: true, health: h, site: pubSite(fresh, req) });
    } catch (e) {
      fail(res, e, "Tekshirib bo'lmadi");
    }
  });

  // ── Yordamchi: davr, filtrlar, ma'lumot o'qish ──
  function filtersOf(q) {
    const f = {};
    for (const k of ["source", "channel", "campaign", "device", "page", "event", "browser", "os"]) if (q[k]) f[k] = clip(q[k], 120);
    return f;
  }
  async function loadSessions(siteIds, start, end, f = {}, projection = null) {
    const q = { siteId: { $in: siteIds }, start: { $gte: start, $lt: end } };
    if (f.source) q.source = f.source;
    if (f.channel) q.channel = f.channel;
    if (f.campaign) q["utm.campaign"] = f.campaign;
    if (f.device) q.device = f.device;
    if (f.browser) q.browser = f.browser;
    if (f.os) q.os = f.os;
    let list = await col("wa_sessions").find(q, projection ? { projection } : {}).limit(MAX_DOCS).toArray();
    return list;
  }
  async function loadEvents(siteIds, types, start, end, sids = null) {
    const q = { siteId: { $in: siteIds }, type: { $in: types }, t: { $gte: start, $lt: end } };
    let list = await col("wa_events")
      .find(q, { projection: { _id: 0, sid: 1, path: 1, t: 1, title: 1, type: 1, dur: 1, name: 1 } })
      .limit(MAX_DOCS)
      .toArray();
    if (sids) list = list.filter((e) => sids.has(e.sid));
    return list;
  }
  // Sahifa yoki hodisa filtri — shu sahifani ko'rgan / shu hodisa bo'lgan sessiyalar
  async function applyEventFilters(siteIds, sessions, f, start, end) {
    if (!f.page && !f.event) return sessions;
    const q = { siteId: { $in: siteIds }, t: { $gte: start, $lt: end } };
    if (f.page) Object.assign(q, { type: "page_view", path: f.page });
    if (f.event) q.type = f.event;
    if (f.page && f.event) {
      const a = new Set(await col("wa_events").distinct("sid", { ...q, type: "page_view", path: f.page }));
      const b = new Set(await col("wa_events").distinct("sid", { siteId: q.siteId, t: q.t, type: f.event }));
      return sessions.filter((s) => a.has(s.sid) && b.has(s.sid));
    }
    const sids = new Set(await col("wa_events").distinct("sid", q));
    return sessions.filter((s) => sids.has(s.sid));
  }
  const PREV_PROJ = { _id: 0, sid: 1, vid: 1, start: 1, last: 1, pages: 1, conv: 1, leads: 1, revenue: 1, isNew: 1, exitSeen: 1, forms: 1 };

  async function spendRows(siteIds, range) {
    return col("wa_spend")
      .find({ siteId: { $in: siteIds }, date: { $gte: range.from, $lte: range.to } }, { projection: { _id: 0 } })
      .toArray();
  }

  async function persistAlerts(alerts, range) {
    for (const a of alerts) {
      const key = a.type + ":" + range.to;
      await col("wa_alerts")
        .updateOne({ siteId: a.siteId, key }, { $set: { ...a, key, period: range.label } }, { upsert: true })
        .catch(() => {});
    }
  }

  // ── Bitta sayt statistikasi ──
  r.get("/api/super/wa/sites/:id/stats", async (req, res) => {
    try {
      const site = await siteOr404(req, res);
      if (!site) return;
      const tz = site.timezone || (await getTimezone());
      const range = C.resolveRange(req.query, tz);
      const { start, end } = C.rangeBounds(range, tz);
      const pb = C.rangeBounds(range.prev, tz);
      const f = filtersOf(req.query);
      const ids = [site._id];

      let sessions = await loadSessions(ids, start, end, f);
      sessions = await applyEventFilters(ids, sessions, f, start, end);
      let prevSessions = await loadSessions(ids, pb.start, pb.end, f, PREV_PROJ);
      prevSessions = await applyEventFilters(ids, prevSessions, f, pb.start, pb.end);
      const filtered = Object.keys(f).length > 0;
      const sidSet = filtered ? new Set(sessions.map((s) => s.sid)) : null;
      const [pageviews, exits, spend, spendPrev] = await Promise.all([
        loadEvents(ids, ["page_view"], start, end, sidSet),
        loadEvents(ids, ["page_exit"], start, end, sidSet),
        spendRows(ids, range),
        spendRows(ids, range.prev),
      ]);
      const cur = C.sessionKpis(sessions, pageviews);
      const prev = C.sessionKpis(prevSessions);
      const ts = C.timeseries(sessions, range, tz);
      const spendCur = spend.reduce((a, x) => a + (Number(x.spend) || 0), 0);
      const spendPrevSum = spendPrev.reduce((a, x) => a + (Number(x.spend) || 0), 0);
      const alerts = C.detectAlerts({ site, cur, prev, health: site.health, lastEventAt: site.lastEventAt, spendCur, spendPrev: spendPrevSum });
      persistAlerts(alerts, range);
      const options = {
        sources: [...new Set(sessions.map((s) => s.source))].sort(),
        channels: [...new Set(sessions.map((s) => s.channel))].sort(),
        campaigns: [...new Set(sessions.map((s) => s.utm?.campaign).filter(Boolean))].sort(),
        devices: ["Kompyuter", "Telefon", "Planshet"],
        pages: [...new Set(pageviews.map((e) => e.path))].sort().slice(0, 300),
        events: C.EVENT_TYPES,
      };
      res.json({
        ok: true,
        site: pubSite(site, req),
        range,
        filters: f,
        truncated: sessions.length >= MAX_DOCS || pageviews.length >= MAX_DOCS,
        kpis: { cur, prev, spark: { sessions: C.spark(ts.sessions), visitors: C.spark(ts.visitors), pageviews: C.spark(ts.pageviews), conversions: C.spark(ts.conversions) } },
        timeseries: ts,
        hourly: C.hourly(sessions, tz),
        sources: C.breakdown(sessions, (s) => s.source),
        channels: C.breakdown(sessions, (s) => s.channel),
        devices: C.breakdown(sessions, (s) => s.device),
        browsers: C.breakdown(sessions, (s) => s.browser),
        os: C.breakdown(sessions, (s) => s.os),
        countries: C.breakdown(sessions, (s) => s.country || "Noma'lum"),
        languages: C.breakdown(sessions, (s) => (s.lang ? s.lang.split("-")[0] : null), 15),
        landing: C.breakdown(sessions, (s) => s.entry, 100),
        pages: C.pagesStats(sessions, pageviews, exits).slice(0, 300),
        journey: C.journeys(sessions, pageviews),
        campaigns: C.campaigns(sessions, spend),
        spend: { total: Math.round(spendCur * 100) / 100, prev: Math.round(spendPrevSum * 100) / 100, rows: spend.length },
        funnel: C.funnel(sessions),
        goals: (site.goals || []).map((g) => ({ ...g, sessions: sessions.filter((s) => (s.goals || []).includes(g.id)).length })),
        alerts,
        options,
      });
    } catch (e) {
      fail(res, e, "Statistika tayyorlanmadi");
    }
  });

  // ── Real vaqt (polling bilan; har so'rovda bazadan yangidan o'qiladi) ──
  async function realtime(siteIds) {
    const now = Date.now();
    const since5 = new Date(now - 5 * 60_000);
    const since30 = new Date(now - 30 * 60_000);
    const [active, recent, sessions30] = await Promise.all([
      col("wa_sessions").find({ siteId: { $in: siteIds }, last: { $gte: since5 } }, { projection: { _id: 0, siteId: 1, sid: 1, exit: 1, source: 1, device: 1 } }).limit(5000).toArray(),
      col("wa_events")
        .find({ siteId: { $in: siteIds }, t: { $gte: since30 }, type: { $in: ["page_view", "lead", "purchase", "conversion", "form_submit", "session_start"] } }, { projection: { _id: 0, siteId: 1, sid: 1, type: 1, path: 1, t: 1, name: 1, value: 1 } })
        .sort({ t: -1 })
        .limit(40)
        .toArray(),
      col("wa_events").find({ siteId: { $in: siteIds }, t: { $gte: since30 }, type: "page_view" }, { projection: { _id: 0, path: 1 } }).limit(20000).toArray(),
    ]);
    const top = new Map();
    for (const e of sessions30) top.set(e.path, (top.get(e.path) || 0) + 1);
    const srcBySid = new Map(active.map((s) => [s.sid, s]));
    return {
      at: new Date(),
      activeSessions: active.length,
      activePages: [...active.reduce((m, s) => m.set(s.exit || "—", (m.get(s.exit || "—") || 0) + 1), new Map())].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([path, n]) => ({ path, n })),
      topPages30: [...top].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([path, n]) => ({ path, n })),
      recent: recent.map((e) => ({ ...e, source: srcBySid.get(e.sid)?.source || null, device: srcBySid.get(e.sid)?.device || null })),
      conversions30: recent.filter((e) => C.CONVERSION_TYPES.has(e.type)).length,
    };
  }
  r.get("/api/super/wa/sites/:id/realtime", async (req, res) => {
    try {
      const site = await siteOr404(req, res);
      if (!site) return;
      res.json({ ok: true, ...(await realtime([site._id])), lastEventAt: site.lastEventAt || null });
    } catch (e) {
      fail(res, e);
    }
  });

  // ── Barcha saytlar bo'yicha umumiy dashboard ──
  r.get("/api/super/wa/overview", async (req, res) => {
    try {
      const sites = await col("wa_sites").find({}).sort({ createdAt: -1 }).toArray();
      const tz = await getTimezone();
      const range = C.resolveRange(req.query, tz);
      const { start, end } = C.rangeBounds(range, tz);
      const pb = C.rangeBounds(range.prev, tz);
      const pick = req.query.site && sites.some((s) => s._id === req.query.site) ? [req.query.site] : sites.map((s) => s._id);
      const [sessions, prevSessions, rt] = await Promise.all([
        loadSessions(pick, start, end, {}, { ...PREV_PROJ, siteId: 1 }),
        loadSessions(pick, pb.start, pb.end, {}, { ...PREV_PROJ, siteId: 1 }),
        realtime(pick),
      ]);
      const cur = C.sessionKpis(sessions);
      const prev = C.sessionKpis(prevSessions);
      const ts = C.timeseries(sessions, range, tz);
      const today = C.dayIn(new Date(), tz);
      const todayStart = C.dayStartUtc(today, tz);
      const bySite = new Map();
      for (const s of sessions) (bySite.get(s.siteId) || bySite.set(s.siteId, []).get(s.siteId)).push(s);
      const bySitePrev = new Map();
      for (const s of prevSessions) (bySitePrev.get(s.siteId) || bySitePrev.set(s.siteId, []).get(s.siteId)).push(s);
      const allAlerts = [];
      const rows = sites.map((s) => {
        const list = bySite.get(s._id) || [];
        const k = C.sessionKpis(list);
        const kp = C.sessionKpis(bySitePrev.get(s._id) || []);
        allAlerts.push(...C.detectAlerts({ site: s, cur: k, prev: kp, health: s.health, lastEventAt: s.lastEventAt }));
        return {
          ...pubSite(s, req),
          sessions: k.sessions,
          visitors: k.visitors,
          pageviews: k.pageviews,
          bounceRate: k.bounceRate,
          conversions: k.conversions,
          change: C.change(k.sessions, kp.sessions),
          todaySessions: list.filter((x) => new Date(x.start) >= todayStart).length,
          spark: C.timeseries(list, range, tz).sessions.slice(-14),
        };
      });
      persistAlerts(allAlerts, range);
      const todaySessions = sessions.filter((x) => new Date(x.start) >= todayStart);
      res.json({
        ok: true,
        range,
        totals: {
          sites: sites.length,
          activeSites: sites.filter((s) => s.status !== "paused" && s.lastEventAt && Date.now() - new Date(s.lastEventAt) < 24 * 3600_000).length,
          todaySessions: todaySessions.length,
          todayVisitors: new Set(todaySessions.map((s) => s.vid)).size,
          activeNow: rt.activeSessions,
        },
        kpis: { cur, prev, spark: { sessions: C.spark(ts.sessions), visitors: C.spark(ts.visitors), pageviews: C.spark(ts.pageviews), conversions: C.spark(ts.conversions) } },
        timeseries: ts,
        sites: rows,
        realtime: rt,
        silentSites: sites
          .filter((s) => s.status !== "paused" && (!s.lastEventAt || Date.now() - new Date(s.lastEventAt) > 24 * 3600_000))
          .map((s) => ({ id: s._id, name: s.name, lastEventAt: s.lastEventAt || null })),
        alerts: allAlerts,
      });
    } catch (e) {
      fail(res, e, "Umumiy statistika tayyorlanmadi");
    }
  });

  // ── Ogohlantirishlar tarixi ──
  r.get("/api/super/wa/alerts", async (req, res) => {
    try {
      const q = req.query.site ? { siteId: clip(req.query.site, 40) } : {};
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 10));
      const [total, rows] = await Promise.all([
        col("wa_alerts").countDocuments(q),
        col("wa_alerts").find(q, { projection: { _id: 0 } }).sort({ at: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
      ]);
      res.json({ ok: true, total, page, limit, alerts: rows });
    } catch (e) {
      fail(res, e);
    }
  });

  // ── Xom hodisalar (sahifalangan) ──
  r.get("/api/super/wa/sites/:id/events", async (req, res) => {
    try {
      const site = await siteOr404(req, res);
      if (!site) return;
      const tz = site.timezone || (await getTimezone());
      const range = C.resolveRange(req.query, tz);
      const { start, end } = C.rangeBounds(range, tz);
      const q = { siteId: site._id, t: { $gte: start, $lt: end } };
      if (C.EVENT_TYPES.includes(req.query.type)) q.type = req.query.type;
      if (req.query.page_path) q.path = clip(req.query.page_path, 200);
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 10));
      const [total, rows] = await Promise.all([
        col("wa_events").countDocuments(q),
        col("wa_events").find(q, { projection: { _id: 0, siteId: 0, vid: 0 } }).sort({ t: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
      ]);
      res.json({ ok: true, total, page, limit, events: rows });
    } catch (e) {
      fail(res, e);
    }
  });

  // ── CSV eksport ──
  r.get("/api/super/wa/sites/:id/export", async (req, res) => {
    try {
      const site = await siteOr404(req, res);
      if (!site) return;
      const tz = site.timezone || (await getTimezone());
      const range = C.resolveRange(req.query, tz);
      const { start, end } = C.rangeBounds(range, tz);
      const kind = ["sessions", "pageviews", "events", "pages", "sources", "campaigns"].includes(req.query.kind) ? req.query.kind : "sessions";
      const fmtT = (d) => (d ? new Date(d).toLocaleString("sv-SE", { timeZone: tz }) : "");
      let cols, rows;
      if (kind === "sessions") {
        const list = await loadSessions([site._id], start, end, filtersOf(req.query));
        cols = [["start", "Boshlanish"], ["dur", "Davomiylik (s)"], ["est", "Davomiylik taxminiy"], ["pages", "Sahifalar"], ["entry", "Kirish sahifasi"], ["exit", "Chiqish sahifasi"], ["source", "Manba"], ["channel", "Kanal"], ["campaign", "Kampaniya"], ["device", "Qurilma"], ["browser", "Brauzer"], ["os", "OT"], ["country", "Mamlakat"], ["isNew", "Yangi"], ["conv", "Konversiyalar"], ["leads", "Leadlar"], ["revenue", "Daromad"]];
        rows = list.map((s) => ({ ...s, start: fmtT(s.start), dur: C.sessionSeconds(s), est: s.exitSeen ? "yo'q" : "ha", campaign: s.utm?.campaign || "", isNew: s.isNew ? "ha" : "yo'q" }));
      } else if (kind === "pageviews" || kind === "events") {
        const types = kind === "pageviews" ? ["page_view"] : C.EVENT_TYPES;
        const list = await col("wa_events").find({ siteId: site._id, type: { $in: types }, t: { $gte: start, $lt: end } }, { projection: { _id: 0, vid: 0, siteId: 0 } }).sort({ t: 1 }).limit(100_000).toArray();
        cols = [["t", "Vaqt"], ["type", "Hodisa"], ["path", "Sahifa"], ["title", "Sarlavha"], ["refHost", "Referrer"], ["name", "Nomi"], ["value", "Qiymat"], ["dur", "Vaqt (ms)"], ["scroll", "Scroll %"], ["sid", "Sessiya"]];
        rows = list.map((e) => ({ ...e, t: fmtT(e.t) }));
      } else {
        const sessions = await loadSessions([site._id], start, end);
        if (kind === "pages") {
          const pv = await loadEvents([site._id], ["page_view"], start, end);
          const ex = await loadEvents([site._id], ["page_exit"], start, end);
          cols = [["path", "Sahifa"], ["views", "Ko'rishlar"], ["sessions", "Sessiyalar"], ["entries", "Kirishlar"], ["exits", "Chiqishlar"], ["exitRate", "Chiqish %"], ["avgTime", "O'rtacha vaqt (s)"], ["convSessions", "Konversiyali sessiyalar"]];
          rows = C.pagesStats(sessions, pv, ex);
        } else if (kind === "sources") {
          cols = [["key", "Manba"], ["sessions", "Sessiyalar"], ["visitors", "Tashrif buyuruvchilar"], ["pageviews", "Ko'rishlar"], ["avgDuration", "O'rtacha davomiylik (s)"], ["bounceRate", "Bounce %"], ["conversions", "Konversiyalar"], ["conversionRate", "Konversiya %"]];
          rows = C.breakdown(sessions, (s) => s.source, 1000);
        } else {
          cols = [["campaign", "Kampaniya"], ["source", "Manba"], ["medium", "Tur"], ["sessions", "Sessiyalar"], ["conversions", "Konversiyalar"], ["leads", "Leadlar"], ["conversionRate", "Konversiya %"], ["spend", "Xarajat"], ["revenue", "Daromad"], ["revenueSource", "Daromad manbasi"], ["cpa", "CPA"], ["roas", "ROAS"]];
          rows = C.campaigns(sessions, await spendRows([site._id], range));
        }
      }
      await audit("report.export", { req, actor: req.user, meta: { report: "Sayt analitikasi: " + site.name, kind, format: "csv", from: range.from, to: range.to, rows: rows.length } });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${site.host}-${kind}-${range.from}_${range.to}.csv"`);
      res.send(C.toCsv(cols, rows));
    } catch (e) {
      fail(res, e, "Eksport qilinmadi");
    }
  });

  // ── Reklama xarajatlari (import) ──
  r.get("/api/super/wa/sites/:id/spend", async (req, res) => {
    try {
      const site = await siteOr404(req, res);
      if (!site) return;
      const rows = await col("wa_spend").find({ siteId: site._id }).sort({ date: -1 }).limit(2000).toArray();
      res.json({ ok: true, rows: rows.map(({ _id, ...x }) => ({ id: String(_id), ...x })) });
    } catch (e) {
      fail(res, e);
    }
  });
  r.post("/api/super/wa/sites/:id/spend", async (req, res) => {
    try {
      const site = await siteOr404(req, res);
      if (!site) return;
      const input = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 2000) : [];
      const num = (v) => (v === "" || v == null ? null : Number(String(v).replace(/\s/g, "").replace(",", ".")));
      const good = [];
      const bad = [];
      input.forEach((x, i) => {
        const date = String(x?.date || "").trim();
        const spend = num(x?.spend);
        const campaign = clip(x?.campaign, 100);
        const revenue = num(x?.revenue);
        const impressions = num(x?.impressions);
        const clicks = num(x?.clicks);
        if (!C.isDay(date) || !campaign || !(spend >= 0) || [revenue, impressions, clicks].some((v) => v != null && !(v >= 0)))
          return bad.push(i + 1);
        good.push({ siteId: site._id, date, campaign, source: clip(x?.source, 60), spend, revenue, impressions, clicks, importedAt: new Date(), importedBy: req.user.username });
      });
      if (!good.length) return res.status(400).json({ ok: false, error: "Yaroqli qator yo'q. Format: sana (YYYY-MM-DD), kampaniya, xarajat", bad });
      await col("wa_spend").insertMany(good);
      await audit("super.wa.spend_import", { req, actor: req.user, target: { site: site._id }, meta: { rows: good.length } });
      res.json({ ok: true, added: good.length, skipped: bad });
    } catch (e) {
      fail(res, e, "Import qilinmadi");
    }
  });
  r.delete("/api/super/wa/sites/:id/spend", async (req, res) => {
    try {
      const site = await siteOr404(req, res);
      if (!site) return;
      const { ObjectId } = await import("mongodb");
      const id = String(req.query.row || "");
      const q = { siteId: site._id };
      if (/^[a-f0-9]{24}$/.test(id)) q._id = new ObjectId(id);
      else if (req.query.all !== "1") return res.status(400).json({ ok: false, error: "Qator ko'rsatilmagan" });
      const out = await col("wa_spend").deleteMany(q);
      res.json({ ok: true, deleted: out.deletedCount });
    } catch (e) {
      fail(res, e);
    }
  });

  return r;
}

// ═══════════════════════════ FON TEKSHIRUVI ══════════════════════════════════

/** Har 15 daqiqada faol saytlar holatini tekshiradi. */
export function startWaMonitor(getDb) {
  const { col, ensureIndexes } = createWaStore(getDb);
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await ensureIndexes();
      const sites = await col("wa_sites").find({ status: { $ne: "paused" } }, { projection: { _id: 1, url: 1, trackingId: 1 } }).toArray();
      for (const s of sites) {
        const h = await checkSite(s.url, s.trackingId).catch((e) => ({ at: new Date(), ok: false, error: e?.message }));
        await col("wa_sites").updateOne({ _id: s._id }, { $set: { health: h } });
        await col("wa_checks").insertOne({ siteId: s._id, ...h });
      }
    } catch (e) {
      // Baza hali tayyor emas — keyingi safar
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 60_000).unref?.();
  setInterval(tick, 15 * 60_000).unref?.();
}
