/**
 * Super Admin API mijozi. Token va CSRF sarlavhalarini core/secure-auth.js
 * (window.fetch o'ramasi) qo'shadi — bu yerda faqat manzil va xatolar.
 */
import { reactive } from "vue";

const BUILD_ID = typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : String(Date.now());

export const session = reactive({ ready: false, user: null, error: null, forbidden: false });

const base = () => window.__API_BASE__ || "";

export class ApiError extends Error {
  constructor(msg, status, code) {
    super(msg);
    this.status = status;
    this.code = code;
  }
}

export async function api(path, { method = "GET", body, query } = {}) {
  let url = base() + path;
  if (query) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") q.set(k, v);
    const s = q.toString();
    if (s) url += (url.includes("?") ? "&" : "?") + s;
  }
  const opts = { method, headers: { Accept: "application/json" } };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  let r;
  try {
    r = await fetch(url, opts);
  } catch {
    throw new ApiError("Serverga ulanib bo'lmadi. Internet aloqasini tekshiring.", 0, "network");
  }
  let d = null;
  try {
    d = await r.json();
  } catch {}
  if (r.status === 401) {
    session.user = null;
    throw new ApiError("Sessiya tugagan — qaytadan kiring", 401, "unauth");
  }
  if (r.status === 403 && d && d.code === "forbidden") session.forbidden = true;
  if (!r.ok || !d || d.ok === false)
    throw new ApiError((d && d.error) || `Server xatosi (HTTP ${r.status})`, r.status, d && d.code);
  return d;
}

/** Faylni yuklab olish (hisobot, eksport, zaxira). */
export async function download(path, { method = "GET", body, query } = {}) {
  let url = base() + path;
  if (query) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") q.set(k, v);
    if (q.toString()) url += "?" + q.toString();
  }
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(url, opts);
  if (!r.ok) {
    let d = null;
    try { d = await r.json(); } catch {}
    throw new ApiError((d && d.error) || `Yuklab bo'lmadi (HTTP ${r.status})`, r.status, d && d.code);
  }
  const blob = await r.blob();
  const cd = r.headers.get("Content-Disposition") || "";
  const m = /filename="?([^"]+)"?/.exec(cd);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = m ? m[1] : "fayl";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1500);
}

/** Admin portali manzili (login sahifasi) — /admin/ yoki / */
export const portalUrl = (extra = "") => new URL("../" + extra, location.href).toString();

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-sa="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src + "?v=" + BUILD_ID;
    s.dataset.sa = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Yuklanmadi: " + src));
    document.head.appendChild(s);
  });
}

/** Sessiyani tiklaydi. Kirilmagan bo'lsa — admin login sahifasiga. */
export async function boot() {
  try {
    await loadScript((import.meta.env.BASE_URL || "/") + "core/secure-auth.js");
    const A = window.CRMAuth;
    A.onExpired(() => {
      session.user = null;
      location.href = portalUrl();
    });
    const user = await A.restore();
    if (!user) {
      location.replace(portalUrl());
      return;
    }
    if (user.role !== "superadmin") {
      // Server rad etadi va urinishni jurnalga yozadi (authz.super_denied)
      try {
        await fetch((window.__API_BASE__ || "") + "/api/super/me");
      } catch {}
      session.forbidden = true;
      session.user = user;
      session.ready = true;
      return;
    }
    session.user = user;
    session.ready = true;
  } catch (e) {
    session.error = e.message || String(e);
    session.ready = true;
  }
}

export async function logout() {
  try {
    await window.CRMAuth.logout();
  } catch {}
  location.href = portalUrl();
}
