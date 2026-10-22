/**
 * superadmin/metrics.js — so'rov metrikalari (Super Admin → Monitoring).
 *
 * Har bir /api/ so'rovning vaqti va holati XOTIRADA sanaladi — bazaga
 * yozilmaydi, server sekinlashmaydi. Server qayta ishga tushsa hisoblagich
 * noldan boshlanadi (bu monitoringda ochiq ko'rsatiladi).
 * Manzildan query qismi olib tashlanadi (masalan ?access_token=...).
 */
export const STARTED_AT = Date.now();
const MINUTES = 60;
const minuteBuckets = new Map(); // minuteKey -> {n, err, ms}
const endpoints = new Map();
const recentErrors = [];
const MAX_ENDPOINTS = 300;
const latencies = [];
// "Faol foydalanuvchi" — oxirgi 5 daqiqada token bilan so'rov yuborgan hisob
const lastSeen = new Map(); // accountId -> {at, role}

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
    const longLived = req.path.startsWith("/api/events");

    if (req.user && req.user.sub) {
      lastSeen.set(req.user.sub, { at: now, role: req.user.accountRole || req.user.role });
      if (lastSeen.size > 5000) {
        for (const [k, v] of lastSeen) if (now - v.at > 15 * 60000) lastSeen.delete(k);
      }
    }

    const mk = minuteKey(now);
    const b = minuteBuckets.get(mk) || { n: 0, err: 0, ms: 0, c: 0 };
    b.n++;
    if (status >= 500) b.err++;
    if (!longLived) { b.ms += ms; b.c++; }
    minuteBuckets.set(mk, b);
    if (minuteBuckets.size > MINUTES + 5) prune(now);

    if (!longLived) {
      latencies.push(ms);
      if (latencies.length > 2000) latencies.shift();
    }

    const key = routeKey(req.method, req.originalUrl || req.path);
    let e = endpoints.get(key);
    if (!e) {
      if (endpoints.size >= MAX_ENDPOINTS) return;
      e = { key, n: 0, e4: 0, e5: 0, ms: 0, c: 0, max: 0, lastStatus: 0, lastErrorAt: null };
      endpoints.set(key, e);
    }
    e.n++;
    if (!longLived) {
      e.ms += ms;
      e.c++;
      if (ms > e.max) e.max = ms;
    }
    e.lastStatus = status;
    if (status >= 500) e.e5++;
    else if (status >= 400) e.e4++;
    if (isErr) {
      e.lastErrorAt = now;
      recentErrors.push({
        at: new Date(now).toISOString(),
        method: req.method,
        path: key.split(" ")[1],
        status,
        ms: Math.round(ms),
      });
      if (recentErrors.length > 100) recentErrors.shift();
    }
  });
  next();
}

/** Oxirgi N daqiqada so'rov yuborgan hisoblar soni (rol bo'yicha). */
export function activeUsers(windowMin = 5) {
  const now = Date.now();
  const out = { total: 0, byRole: {} };
  for (const v of lastSeen.values()) {
    if (now - v.at > windowMin * 60000) continue;
    out.total++;
    out.byRole[v.role] = (out.byRole[v.role] || 0) + 1;
  }
  return out;
}

export function requestStats() {
  const now = Date.now();
  prune(now);
  const cur = minuteKey(now);
  const series = [];
  for (let i = MINUTES - 1; i >= 0; i--) {
    const b = minuteBuckets.get(cur - i) || { n: 0, err: 0, ms: 0, c: 0 };
    series.push({
      t: new Date((cur - i) * 60000).toISOString(),
      n: b.n,
      err: b.err,
      avgMs: b.c ? Math.round(b.ms / b.c) : null,
    });
  }
  const sum = (arr) => arr.reduce((a, x) => ({ n: a.n + x.n, err: a.err + x.err }), { n: 0, err: 0 });
  const last = (m) => sum(series.slice(-m));
  const sorted = latencies.slice().sort((a, b) => a - b);
  const q = (p) => (sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]) : null);
  const all = [...endpoints.values()].map((e) => ({
    key: e.key,
    n: e.n,
    e4: e.e4,
    e5: e.e5,
    avgMs: e.c ? Math.round(e.ms / e.c) : null,
    maxMs: Math.round(e.max),
    lastStatus: e.lastStatus,
    lastErrorAt: e.lastErrorAt ? new Date(e.lastErrorAt).toISOString() : null,
  }));
  return {
    since: new Date(STARTED_AT).toISOString(),
    lastMinute: last(1),
    last15: last(15),
    last60: last(60),
    p50: q(0.5),
    p95: q(0.95),
    sampleSize: sorted.length,
    series,
    topByCount: all.slice().sort((a, b) => b.n - a.n).slice(0, 12),
    topBySlow: all.filter((e) => e.avgMs != null && e.n >= 3).sort((a, b) => b.avgMs - a.avgMs).slice(0, 8),
    topByErrors: all
      .filter((e) => e.e4 + e.e5 > 0)
      .sort((a, b) => b.e5 + b.e4 - (a.e5 + a.e4))
      .slice(0, 12),
    recentErrors: recentErrors.slice(-30).reverse(),
  };
}
