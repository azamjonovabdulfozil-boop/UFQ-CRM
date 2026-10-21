/**
 * methodology.js — 🧭 Metodologiya.
 *
 *  • Admin: «Metodologiya» bo'limi — kurs metodologiyasini yuklaydi (PDF,
 *    Word .docx, Excel .xlsx, CSV, TXT). Server hujjatni bo'limlar va
 *    darslarga ajratadi (1-bo'lim «Kompyuter savodxonligi» → 1-dars …).
 *  • Mentor: «Metodologiya» bo'limi — metodologiyani tanlaydi, bo'lim →
 *    darsni bosadi va hujjatdagi matnni (nima o'tiladi, misollar) ko'radi.
 *    O'tilgan darslarni belgilaydi; «Davom ettirish» keyingi darsni ochadi.
 *
 * Admin va mentor portallarida bir xil fayl.
 */
(function () {
  "use strict";

  /* ─── Yordamchilar ─────────────────────────────────────────────────────── */

  function api() {
    try {
      if (typeof __API_BASE__ !== "undefined" && __API_BASE__) return __API_BASE__;
    } catch (e) {}
    return window.__API_BASE__ || "";
  }
  function isMentor() {
    try {
      return typeof isMentorRole === "function" && isMentorRole();
    } catch (e) {
      return false;
    }
  }
  var esc = function (v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  function say(m) {
    if (typeof toast === "function") toast(m);
  }
  function data() {
    return typeof D !== "undefined" && D ? D : { courses: [], groups: [] };
  }
  function fmtSize(b) {
    if (!b) return "—";
    if (b < 1048576) return Math.max(1, Math.round(b / 1024)) + " KB";
    return (b / 1048576).toFixed(1) + " MB";
  }
  function getJson(path, opts) {
    return fetch(api() + path, opts).then(function (r) {
      return r
        .json()
        .catch(function () {
          return {};
        })
        .then(function (d) {
          if (!r.ok || !d.ok) throw new Error((d && d.error) || "Server xatosi (" + r.status + ")");
          return d;
        });
    });
  }
  function sendJson(method, path, body) {
    return getJson(path, { method: method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  }
  function userKey() {
    try {
      var cu = (typeof getCurrentUser === "function" && getCurrentUser()) || {};
      return String(cu.mentorId || cu.id || cu.username || "u");
    } catch (e) {
      return "u";
    }
  }
  function lsGet(k, def) {
    try {
      var v = localStorage.getItem(k);
      return v ? JSON.parse(v) : def;
    } catch (e) {
      return def;
    }
  }
  function lsSet(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {}
  }

  var KIND = {
    pdf: { label: "PDF", cls: "pdf" },
    docx: { label: "WORD", cls: "doc" },
    xlsx: { label: "EXCEL", cls: "xls" },
    csv: { label: "CSV", cls: "xls" },
    txt: { label: "TXT", cls: "txt" },
  };

  /* ─── Ma'lumot ─────────────────────────────────────────────────────────── */

  var _list = null;
  var _docs = {};
  var _poll = null;

  function loadList() {
    return getJson("/api/methodology").then(function (d) {
      _list = d.items || [];
      updateNavCount();
      return _list;
    });
  }
  function loadDoc(id, force) {
    if (!force && _docs[id]) return Promise.resolve(_docs[id]);
    return getJson("/api/methodology/" + encodeURIComponent(id)).then(function (d) {
      _docs[id] = d.item;
      return d.item;
    });
  }
  function updateNavCount() {
    var el = document.getElementById("nc-methodology");
    if (el) el.textContent = (_list || []).length;
  }

  /* ─── Uslublar ─────────────────────────────────────────────────────────── */

  function styles() {
    if (document.getElementById("mt-styles")) return;
    var st = document.createElement("style");
    st.id = "mt-styles";
    st.textContent = [
      ".mt-page{max-width:1240px;margin:0 auto;display:flex;flex-direction:column;gap:18px;padding-bottom:40px}",
      ".mt-card{background:var(--bg2);border:1px solid var(--border2);border-radius:20px;padding:20px;min-width:0}",
      /* yuqori panel */
      ".mt-top{display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:18px 20px;border-radius:20px;color:#fff;background:linear-gradient(120deg,var(--accent),var(--accent-2,var(--teal)));position:relative;overflow:hidden}",
      ".mt-top::after{content:'';position:absolute;right:-70px;top:-90px;width:240px;height:240px;border-radius:50%;background:rgba(255,255,255,.1);pointer-events:none}",
      ".mt-top-ic{width:52px;height:52px;border-radius:16px;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:26px;flex-shrink:0}",
      ".mt-top-txt{min-width:0;flex:1;position:relative;z-index:1}",
      ".mt-top-txt small{display:block;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.85}",
      ".mt-top-sel{margin-top:4px;max-width:100%;min-height:0;height:40px;padding:0 36px 0 12px;border-radius:12px;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.16);color:#fff;font:inherit;font-size:16px;font-weight:800;cursor:pointer;appearance:none;-webkit-appearance:none;background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\");background-repeat:no-repeat;background-position:right 10px center;background-size:16px}",
      ".mt-top-sel option{color:#0f172a}",
      ".mt-top-meta{font-size:12.5px;opacity:.9;margin-top:6px}",
      ".mt-top-prog{position:relative;z-index:1;display:flex;flex-direction:column;align-items:flex-end;gap:8px}",
      ".mt-top-prog b{font-size:22px;font-weight:900;line-height:1}",
      ".mt-top-prog span{font-size:12px;opacity:.9}",
      ".mt-cont{min-height:0;display:inline-flex;align-items:center;gap:8px;padding:9px 14px;border-radius:12px;border:0;background:#fff;color:var(--accent);font:inherit;font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 6px 16px rgba(0,0,0,.15)}",
      ".mt-cont:hover{transform:translateY(-1px)}",
      /* asosiy qism */
      ".mt-grid{display:grid;grid-template-columns:330px minmax(0,1fr);gap:18px;align-items:start}",
      ".mt-side{position:sticky;top:0;padding:12px;max-height:calc(100dvh - 140px);overflow-y:auto}",
      ".mt-side-cap{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);padding:6px 8px 10px}",
      ".mt-sec{border-radius:14px;margin-bottom:6px}",
      ".mt-sec-h{display:flex;align-items:center;gap:10px;width:100%;min-height:0;padding:10px;border:0;border-radius:14px;background:transparent;text-align:left;cursor:pointer;color:var(--text)}",
      ".mt-sec-h:hover{background:var(--bg3)}",
      ".mt-sec.open>.mt-sec-h{background:color-mix(in srgb,var(--accent) 8%,transparent)}",
      ".mt-sec-n{width:34px;height:34px;border-radius:10px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:14px;color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,transparent)}",
      ".mt-sec.open .mt-sec-n{color:#fff;background:linear-gradient(135deg,var(--accent),var(--accent-2,var(--teal)))}",
      ".mt-sec-t{flex:1;min-width:0}",
      ".mt-sec-t b{display:block;font-size:13.5px;font-weight:800;line-height:1.3;overflow-wrap:anywhere}",
      ".mt-sec-t small{font-size:11.5px;color:var(--text3)}",
      ".mt-sec-bar{height:4px;border-radius:4px;background:var(--bg4);overflow:hidden;margin-top:5px}.mt-sec-bar i{display:block;height:100%;background:#10b981}",
      ".mt-chev{color:var(--text3);transition:transform .2s;font-size:12px}.mt-sec.open .mt-chev{transform:rotate(90deg)}",
      ".mt-les-list{display:none;flex-direction:column;gap:2px;padding:4px 0 8px 18px;margin-left:16px;border-left:2px solid var(--border)}",
      ".mt-sec.open .mt-les-list{display:flex}",
      ".mt-les{display:flex;align-items:center;gap:10px;width:100%;min-height:0;padding:8px 10px;border:0;border-radius:10px;background:transparent;text-align:left;cursor:pointer;color:var(--text2);font:inherit;font-size:13px}",
      ".mt-les:hover{background:var(--bg3);color:var(--text)}",
      ".mt-les.on{background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent);font-weight:700}",
      ".mt-les i{font-style:normal;flex-shrink:0;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;background:var(--bg4);color:var(--text2)}",
      ".mt-les.done i{background:#10b981;color:#fff}",
      ".mt-les.next i{background:var(--accent);color:#fff}",
      ".mt-les span{flex:1;min-width:0;overflow-wrap:anywhere;line-height:1.35}",
      /* o'qish oynasi */
      ".mt-read{padding:0;overflow:hidden}",
      ".mt-read-h{padding:22px 26px 18px;border-bottom:1px solid var(--border)}",
      ".mt-crumb{font-size:12px;font-weight:700;color:var(--text3);display:flex;gap:6px;flex-wrap:wrap;align-items:center}",
      ".mt-crumb b{color:var(--accent)}",
      ".mt-title{margin:8px 0 0;font-size:24px;font-weight:900;letter-spacing:-.4px;line-height:1.25;color:var(--text)}",
      ".mt-chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}",
      ".mt-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;background:var(--bg3);color:var(--text2);border:1px solid var(--border)}",
      ".mt-chip.ok{background:rgba(16,185,129,.12);color:#059669;border-color:transparent}",
      ".mt-chip.next{background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent);border-color:transparent}",
      ".mt-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}",
      ".mt-btn{min-height:0;display:inline-flex;align-items:center;gap:7px;padding:9px 14px;border-radius:11px;border:1px solid var(--border2);background:var(--bg2);color:var(--text);font:inherit;font-size:13px;font-weight:700;cursor:pointer}",
      ".mt-btn:hover{border-color:var(--accent);color:var(--accent)}",
      ".mt-btn.pri{border:0;color:#fff;background:linear-gradient(135deg,var(--accent),var(--accent-2,var(--teal)))}",
      ".mt-btn.pri:hover{color:#fff;filter:brightness(1.05)}",
      ".mt-btn.done{border-color:#10b981;color:#059669;background:rgba(16,185,129,.08)}",
      ".mt-btn:disabled{opacity:.4;cursor:default}",
      ".mt-body{padding:22px 26px 26px;display:flex;flex-direction:column;gap:12px;font-size:14.5px;line-height:1.7;color:var(--text)}",
      ".mt-p{margin:0;overflow-wrap:anywhere}",
      ".mt-ul{margin:0;padding-left:0;list-style:none;display:flex;flex-direction:column;gap:6px}",
      ".mt-ul li{position:relative;padding-left:22px;overflow-wrap:anywhere}",
      ".mt-ul li::before{content:'';position:absolute;left:6px;top:.7em;width:7px;height:7px;border-radius:50%;background:var(--accent)}",
      ".mt-kv{display:grid;grid-template-columns:minmax(120px,190px) minmax(0,1fr);gap:4px 16px;padding:12px 14px;border-radius:14px;background:var(--bg3);border:1px solid var(--border)}",
      ".mt-kv dt{font-weight:800;color:var(--text2);font-size:13px}",
      ".mt-kv dd{margin:0;overflow-wrap:anywhere;white-space:pre-wrap}",
      ".mt-ex{display:flex;gap:12px;padding:14px 16px;border-radius:14px;background:color-mix(in srgb,#f59e0b 10%,var(--bg2));border:1px solid color-mix(in srgb,#f59e0b 35%,transparent)}",
      ".mt-ex-ic{flex-shrink:0;width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:#f59e0b;color:#fff;font-size:15px}",
      ".mt-ex b{display:block;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#b45309;margin-bottom:2px}",
      ".mt-sub{margin:6px 0 0;font-size:15px;font-weight:800;color:var(--text);display:flex;align-items:center;gap:8px}",
      ".mt-sub::before{content:'';width:4px;height:16px;border-radius:4px;background:var(--accent)}",
      ".mt-intro{padding:14px 16px;border-radius:14px;background:color-mix(in srgb,var(--accent) 6%,var(--bg2));border:1px dashed color-mix(in srgb,var(--accent) 35%,transparent);font-size:13.5px;white-space:pre-wrap}",
      ".mt-intro b{display:block;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);margin-bottom:4px}",
      ".mt-nav{display:flex;gap:10px;justify-content:space-between;padding:16px 26px;border-top:1px solid var(--border);background:var(--bg3)}",
      ".mt-nav .mt-btn{max-width:48%}",
      ".mt-nav .mt-btn span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".mt-empty{text-align:center;padding:48px 20px;color:var(--text3);font-size:14px;line-height:1.6}",
      ".mt-empty-ic{width:64px;height:64px;margin:0 auto 12px;border-radius:20px;display:flex;align-items:center;justify-content:center;font-size:30px;color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,transparent)}",
      ".mt-empty b{display:block;color:var(--text);font-size:16px;margin-bottom:4px}",
      ".mt-mobile-nav{display:none;gap:8px}",
      ".mt-mobile-nav select{flex:1;min-width:0;height:42px;border-radius:12px;border:1px solid var(--border2);background:var(--bg2);color:var(--text);font:inherit;font-size:13.5px;padding:0 10px}",
      /* admin: yuklash va ro'yxat */
      ".mt-up{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:22px;align-items:start}",
      ".mt-up h3{margin:0;font-size:18px;font-weight:900;color:var(--text)}",
      ".mt-up p{margin:6px 0 0;font-size:13.5px;line-height:1.6;color:var(--text3)}",
      ".mt-steps{display:flex;flex-direction:column;gap:10px;margin-top:16px}",
      ".mt-step{display:flex;gap:12px;align-items:flex-start;font-size:13px;color:var(--text2);line-height:1.5}",
      ".mt-step i{font-style:normal;flex-shrink:0;width:26px;height:26px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,transparent)}",
      ".mt-form{display:flex;flex-direction:column;gap:10px}",
      ".mt-form label{font-size:12px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.05em}",
      ".mt-form input[type=text],.mt-form select{width:100%;height:44px;border-radius:12px;border:1px solid var(--border2);background:var(--bg);color:var(--text);font:inherit;font-size:14px;padding:0 12px}",
      ".mt-drop{display:flex;align-items:center;gap:14px;padding:18px;border:2px dashed var(--border2);border-radius:16px;background:var(--bg);cursor:pointer;transition:.15s}",
      ".mt-drop:hover,.mt-drop.drag{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 6%,var(--bg))}",
      ".mt-drop-ic{width:46px;height:46px;border-radius:14px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:22px;color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,transparent)}",
      ".mt-drop b{display:block;font-size:14px;color:var(--text)}.mt-drop small{font-size:12px;color:var(--text3)}",
      ".mt-types{display:flex;gap:6px;flex-wrap:wrap}",
      ".mt-go{height:46px;border-radius:12px;border:0;color:#fff;font:inherit;font-size:14.5px;font-weight:800;cursor:pointer;background:linear-gradient(135deg,var(--accent),var(--accent-2,var(--teal)));box-shadow:0 8px 18px -8px var(--accent)}",
      ".mt-go:disabled{opacity:.5;cursor:not-allowed}",
      ".mt-list-h{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:2px 2px 0}",
      ".mt-list-h h3{margin:0;font-size:17px;font-weight:900;color:var(--text)}",
      ".mt-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:14px}",
      ".mt-item{display:flex;flex-direction:column;gap:12px;background:var(--bg2);border:1px solid var(--border2);border-radius:18px;padding:16px}",
      ".mt-item-top{display:flex;gap:12px;align-items:flex-start}",
      ".mt-file{width:46px;height:54px;border-radius:11px;flex-shrink:0;display:flex;align-items:flex-end;justify-content:center;padding-bottom:7px;font-size:9.5px;font-weight:900;letter-spacing:.04em;color:#fff}",
      ".mt-file.pdf{background:linear-gradient(160deg,#ef4444,#b91c1c)}.mt-file.doc{background:linear-gradient(160deg,#3b82f6,#1d4ed8)}.mt-file.xls{background:linear-gradient(160deg,#22c55e,#15803d)}.mt-file.txt{background:linear-gradient(160deg,#64748b,#334155)}",
      ".mt-name{font-size:15px;font-weight:800;color:var(--text);line-height:1.3;overflow-wrap:anywhere}",
      ".mt-subt{font-size:12px;color:var(--text3);margin-top:3px}",
      ".mt-stats{display:flex;gap:8px;flex-wrap:wrap}",
      ".mt-st{font-size:12.5px;font-weight:700;padding:8px 11px;border-radius:11px;line-height:1.45}",
      ".mt-st.ready{background:rgba(16,185,129,.12);color:#059669}",
      ".mt-st.processing{background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent)}",
      ".mt-st.error{background:rgba(244,63,94,.1);color:#e11d48}",
      ".mt-item .mt-acts{margin-top:0}",
      ".mt-item .mt-btn{padding:7px 11px;font-size:12.5px}",
      ".mt-back{align-self:flex-start}",
      "@media (max-width:1000px){.mt-grid{grid-template-columns:1fr}.mt-side{display:none}.mt-mobile-nav{display:flex}.mt-up{grid-template-columns:1fr}}",
      "@media (max-width:600px){.mt-top{padding:16px}.mt-top-prog{align-items:flex-start;width:100%}.mt-read-h,.mt-body{padding-left:16px;padding-right:16px}.mt-nav{padding:12px 16px}.mt-title{font-size:20px}.mt-kv{grid-template-columns:1fr}.mt-mobile-nav{flex-direction:column}}",
    ].join("");
    document.head.appendChild(st);
  }

  /* ─── Dars matnini chiroyli ko'rsatish ─────────────────────────────────── */

  var EX_RE = /^(misol|masalan|namuna|amaliy\s*mashq|mashq|topshiriq|example|пример|упражнение|задание)\b\s*[:.\-–—]?\s*/i;
  var BULLET_RE = /^\s*(?:[•●▪◦‣\-–—*]|\d{1,2}[.)]|[a-zа-я][.)])\s+/i;
  var KEY_RE = /^([A-ZА-ЯЎҚҒҲa-zа-яўқғҳ'ʻ’ ]{2,40}):\s+(.+)$/;

  function lessonBody(L) {
    if (L.kv && L.kv.length) {
      return (
        '<dl class="mt-kv">' +
        L.kv
          .map(function (x) {
            return "<dt>" + esc(x.k) + "</dt><dd>" + esc(x.v) + "</dd>";
          })
          .join("") +
        "</dl>"
      );
    }
    var lines = String(L.text || "").split("\n");
    var out = [];
    var list = null;
    var para = [];
    var flushPara = function () {
      if (para.length) out.push('<p class="mt-p">' + esc(para.join(" ")) + "</p>");
      para = [];
    };
    var flushList = function () {
      if (list) out.push('<ul class="mt-ul">' + list.join("") + "</ul>");
      list = null;
    };
    lines.forEach(function (raw) {
      var t = raw.trim();
      if (!t) {
        flushPara();
        flushList();
        return;
      }
      var norm = t.replace(/[ʻʼ’‘`]/g, "'");
      if (EX_RE.test(norm)) {
        flushPara();
        flushList();
        var rest = t.replace(/^[^:.\-–—]*[:.\-–—]?\s*/, "");
        var head = norm.match(EX_RE)[1];
        out.push(
          '<div class="mt-ex"><div class="mt-ex-ic">💡</div><div><b>' + esc(head) + "</b>" + esc(rest || t) + "</div></div>",
        );
        return;
      }
      if (BULLET_RE.test(t)) {
        flushPara();
        if (!list) list = [];
        list.push("<li>" + esc(t.replace(BULLET_RE, "")) + "</li>");
        return;
      }
      var kv = t.length < 400 ? KEY_RE.exec(t) : null;
      if (kv) {
        flushPara();
        flushList();
        out.push('<p class="mt-p"><b>' + esc(kv[1]) + ":</b> " + esc(kv[2]) + "</p>");
        return;
      }
      if (t.length <= 70 && /:$/.test(t)) {
        flushPara();
        flushList();
        out.push('<div class="mt-sub">' + esc(t.replace(/:$/, "")) + "</div>");
        return;
      }
      flushList();
      // Qisqa qatorlar (PDF'dan) — bitta paragrafga yig'iladi
      para.push(t);
      if (/[.!?…]$/.test(t)) flushPara();
    });
    flushPara();
    flushList();
    return out.join("") || '<p class="mt-p" style="color:var(--text3)">Bu darsda matn yo\'q.</p>';
  }

  /* ─── Ko'ruvchi (mentor va admin uchun umumiy) ─────────────────────────── */

  var _v = null; // {id, doc, si, li, mount, back}

  function doneKey(id) {
    return "mt_done_" + userKey() + "_" + id;
  }
  function lastKey(id) {
    return "mt_last_" + userKey() + "_" + id;
  }
  function getDone(id) {
    var a = lsGet(doneKey(id), []);
    return Array.isArray(a) ? a : [];
  }
  function allLessons(doc) {
    var out = [];
    (doc.sections || []).forEach(function (s, si) {
      (s.lessons || []).forEach(function (l, li) {
        out.push({ si: si, li: li, key: si + ":" + li });
      });
    });
    return out;
  }
  /** Keyingi dars — oxirgi o'tilgan darsdan keyingisi (mentor ketma-ket o'tadi). */
  function nextLesson(doc, done) {
    var all = allLessons(doc);
    var last = -1;
    all.forEach(function (x, i) {
      if (done.indexOf(x.key) >= 0) last = i;
    });
    return all[last + 1] || all[all.length - 1] || null;
  }

  /** Mentor uchun mos metodologiya: o'z guruhlari kursiga tegishlisi. */
  function preferredId(list) {
    var saved = lsGet("mt_pick_" + userKey(), null);
    if (saved && list.some(function (x) {
      return x.id === saved;
    }))
      return saved;
    try {
      var cu = (typeof getCurrentUser === "function" && getCurrentUser()) || {};
      var D_ = data();
      var mid = String(cu.mentorId || "");
      var courses = (D_.groups || [])
        .filter(function (g) {
          return mid && String(g.mentorId) === mid;
        })
        .map(function (g) {
          var c = (D_.courses || []).find(function (x) {
            return x.id === g.courseId;
          });
          return c ? String(c.name || "").trim().toLowerCase() : "";
        });
      var hit = list.find(function (x) {
        return x.course && courses.indexOf(String(x.course).trim().toLowerCase()) >= 0;
      });
      if (hit) return hit.id;
    } catch (e) {}
    var ready = list.find(function (x) {
      return x.status === "ready";
    });
    return (ready || list[0] || {}).id || null;
  }

  function mountViewer(mount, id, back) {
    styles();
    _v = { id: id, doc: null, si: 0, li: 0, mount: mount, back: back || null, loading: true };
    renderViewer();
    loadDoc(id, true)
      .then(function (doc) {
        if (!_v || _v.id !== id) return;
        _v.doc = doc;
        _v.loading = false;
        var last = lsGet(lastKey(id), null);
        var pos = last && doc.sections[last.si] && doc.sections[last.si].lessons[last.li] ? last : nextLesson(doc, getDone(id));
        _v.si = pos ? pos.si : 0;
        _v.li = pos ? pos.li : 0;
        renderViewer();
      })
      .catch(function (e) {
        if (!_v) return;
        _v.loading = false;
        _v.error = e.message;
        renderViewer();
      });
  }

  function topBar(doc) {
    var list = _list || [];
    var done = getDone(doc.id);
    var total = allLessons(doc).length;
    var doneN = done.filter(function (k) {
      var p = k.split(":");
      return doc.sections[+p[0]] && doc.sections[+p[0]].lessons[+p[1]];
    }).length;
    var nx = nextLesson(doc, done);
    var nxS = nx && doc.sections[nx.si];
    var nxL = nxS && nxS.lessons[nx.li];
    var k = KIND[doc.kind] || KIND.txt;
    return (
      '<div class="mt-top"><div class="mt-top-ic">🧭</div><div class="mt-top-txt"><small>Metodologiya</small>' +
      (list.length > 1 && !_v.back
        ? '<select class="mt-top-sel" onchange="mtPick(this.value)">' +
          list
            .filter(function (x) {
              return x.status === "ready";
            })
            .map(function (x) {
              return '<option value="' + esc(x.id) + '"' + (x.id === doc.id ? " selected" : "") + ">" + esc(x.title) + "</option>";
            })
            .join("") +
          "</select>"
        : '<div style="font-size:20px;font-weight:900;margin-top:2px">' + esc(doc.title) + "</div>") +
      '<div class="mt-top-meta">' +
      (doc.course ? esc(doc.course) + " · " : "") +
      doc.sections.length + " bo'lim · " + total + " dars · " + k.label +
      "</div></div>" +
      (_v.back ? "" : '<div class="mt-top-prog"><div style="text-align:right"><b>' + doneN + " / " + total + "</b><span> dars o'tildi</span></div>" +
      (nxL
        ? '<button type="button" class="mt-cont" onclick="mtOpen(' + nx.si + "," + nx.li + ')">▶ Davom ettirish: ' +
          (nx.si + 1) + "-bo'lim · " + (nx.li + 1) + "-dars</button>"
        : "") +
      "</div>") +
      "</div>"
    );
  }

  function sidebar(doc) {
    var done = getDone(doc.id);
    var nx = nextLesson(doc, done);
    return (
      '<aside class="mt-card mt-side"><div class="mt-side-cap">Bo\'limlar va darslar</div>' +
      doc.sections
        .map(function (s, si) {
          var n = s.lessons.length;
          var d = s.lessons.filter(function (_, li) {
            return done.indexOf(si + ":" + li) >= 0;
          }).length;
          var open = si === _v.si;
          return (
            '<div class="mt-sec' + (open ? " open" : "") + '"><button type="button" class="mt-sec-h" onclick="mtSec(' + si + ')">' +
            '<span class="mt-sec-n">' + (si + 1) + '</span><span class="mt-sec-t"><b>' + esc(s.title) + "</b><small>" + n + " dars · " + d + " o'tildi</small>" +
            '<div class="mt-sec-bar"><i style="width:' + (n ? Math.round((d / n) * 100) : 0) + '%"></i></div></span><span class="mt-chev">▶</span></button>' +
            '<div class="mt-les-list">' +
            s.lessons
              .map(function (l, li) {
                var key = si + ":" + li;
                var cls = (si === _v.si && li === _v.li ? " on" : "") + (done.indexOf(key) >= 0 ? " done" : nx && nx.key === key ? " next" : "");
                return '<button type="button" class="mt-les' + cls + '" onclick="mtOpen(' + si + "," + li + ')"><i>' +
                  (done.indexOf(key) >= 0 ? "✓" : li + 1) + "</i><span>" + esc(l.title) + "</span></button>";
              })
              .join("") +
            "</div></div>"
          );
        })
        .join("") +
      "</aside>"
    );
  }

  function mobileNav(doc) {
    var s = doc.sections[_v.si];
    return (
      '<div class="mt-mobile-nav">' +
      '<select onchange="mtSec(+this.value,true)">' +
      doc.sections
        .map(function (x, i) {
          return '<option value="' + i + '"' + (i === _v.si ? " selected" : "") + ">" + (i + 1) + "-bo'lim · " + esc(x.title) + "</option>";
        })
        .join("") +
      "</select>" +
      '<select onchange="mtOpen(' + _v.si + ',+this.value)">' +
      (s ? s.lessons : [])
        .map(function (l, i) {
          return '<option value="' + i + '"' + (i === _v.li ? " selected" : "") + ">" + (i + 1) + "-dars · " + esc(l.title) + "</option>";
        })
        .join("") +
      "</select></div>"
    );
  }

  function reader(doc) {
    var s = doc.sections[_v.si];
    var L = s && s.lessons[_v.li];
    if (!L) return '<div class="mt-card"><div class="mt-empty">Dars topilmadi</div></div>';
    var done = getDone(doc.id);
    var key = _v.si + ":" + _v.li;
    var isDone = done.indexOf(key) >= 0;
    var nx = nextLesson(doc, done);
    var all = allLessons(doc);
    var pos = all.findIndex(function (x) {
      return x.key === key;
    });
    var prev = all[pos - 1];
    var next = all[pos + 1];
    var lessonName = function (x) {
      var ls = doc.sections[x.si].lessons[x.li];
      return (x.si + 1) + "." + (x.li + 1) + " " + ls.title;
    };
    var firstPage = L.pages ? parseInt(String(L.pages), 10) : null;
    var chips =
      '<span class="mt-chip">' + (_v.li + 1) + "-dars / " + s.lessons.length + "</span>" +
      (L.pages ? '<span class="mt-chip">📄 ' + esc(L.pages) + "-bet</span>" : "") +
      (isDone ? '<span class="mt-chip ok">✓ O\'tilgan</span>' : nx && nx.key === key ? '<span class="mt-chip next">📍 Keyingi dars</span>' : "");
    var acts =
      (isMentor() || !_v.back
        ? '<button type="button" class="mt-btn' + (isDone ? " done" : " pri") + '" onclick="mtToggleDone()">' + (isDone ? "✓ O'tildi" : "✔ O'tildi deb belgilash") + "</button>"
        : "") +
      (doc.kind === "pdf"
        ? '<button type="button" class="mt-btn" onclick="mtFile(' + (firstPage || 0) + ')">📄 PDF\'da ko\'rish' + (firstPage ? " (" + firstPage + "-bet)" : "") + "</button>"
        : '<button type="button" class="mt-btn" onclick="mtFile(0)">⬇ Asl faylni yuklab olish</button>');
    var intro = _v.li === 0 && s.introText ? '<div class="mt-intro"><b>Bo\'lim haqida</b>' + esc(s.introText) + "</div>" : "";
    return (
      '<article class="mt-card mt-read">' +
      '<div class="mt-read-h"><div class="mt-crumb"><b>' + (_v.si + 1) + "-bo'lim</b><span>·</span><span>" + esc(s.title) + "</span></div>" +
      '<h2 class="mt-title">' + (_v.li + 1) + "-dars. " + esc(L.title) + "</h2>" +
      '<div class="mt-chips">' + chips + '</div><div class="mt-acts">' + acts + "</div></div>" +
      '<div class="mt-body">' + intro + lessonBody(L) + "</div>" +
      '<div class="mt-nav"><button type="button" class="mt-btn" ' + (prev ? 'onclick="mtOpen(' + prev.si + "," + prev.li + ')"' : "disabled") + "><span>‹ " + (prev ? esc(lessonName(prev)) : "Oldingi dars") + "</span></button>" +
      '<button type="button" class="mt-btn" ' + (next ? 'onclick="mtOpen(' + next.si + "," + next.li + ')"' : "disabled") + "><span>" + (next ? esc(lessonName(next)) : "Keyingi dars") + " ›</span></button></div>" +
      "</article>"
    );
  }

  function renderViewer() {
    if (!_v) return;
    var mount = document.getElementById(_v.mount);
    if (!mount) return;
    var back = _v.back ? '<button type="button" class="mt-btn mt-back" onclick="mtBack()">‹ Ro\'yxatga qaytish</button>' : "";
    if (_v.loading) {
      mount.innerHTML = '<div class="mt-page">' + back + '<div class="mt-card"><div class="mt-empty">⏳ Yuklanmoqda…</div></div></div>';
      return;
    }
    if (_v.error || !_v.doc) {
      mount.innerHTML = '<div class="mt-page">' + back + '<div class="mt-card"><div class="mt-empty">⚠️ ' + esc(_v.error || "Topilmadi") + "</div></div></div>";
      return;
    }
    var doc = _v.doc;
    if (doc.status !== "ready" || !(doc.sections || []).length) {
      mount.innerHTML =
        '<div class="mt-page">' + back + '<div class="mt-card"><div class="mt-empty"><div class="mt-empty-ic">⏳</div><b>' + esc(doc.title) +
        "</b>" + (doc.status === "error" ? "⚠️ " + esc(doc.error) : "Hujjat bo'limlarga ajratilmoqda — biroz kuting.") + "</div></div></div>";
      return;
    }
    var keepScroll = document.querySelector("#" + _v.mount + " .mt-side");
    var sideTop = keepScroll ? keepScroll.scrollTop : 0;
    mount.innerHTML =
      '<div class="mt-page">' + back + topBar(doc) + mobileNav(doc) + '<div class="mt-grid">' + sidebar(doc) + reader(doc) + "</div></div>";
    var side = document.querySelector("#" + _v.mount + " .mt-side");
    if (side) side.scrollTop = sideTop;
  }

  window.mtOpen = function (si, li) {
    if (!_v || !_v.doc) return;
    _v.si = si;
    _v.li = li;
    lsSet(lastKey(_v.doc.id), { si: si, li: li });
    renderViewer();
    var r = document.querySelector("#" + _v.mount + " .mt-read");
    if (r && window.innerWidth < 1000) r.scrollIntoView({ behavior: "smooth", block: "start" });
    else document.getElementById("scroll")?.scrollTo({ top: 0, behavior: "smooth" });
  };
  window.mtSec = function (si, openFirst) {
    if (!_v || !_v.doc) return;
    if (openFirst || _v.si !== si) {
      _v.si = si;
      _v.li = 0;
      lsSet(lastKey(_v.doc.id), { si: si, li: 0 });
    }
    renderViewer();
  };
  window.mtToggleDone = function () {
    if (!_v || !_v.doc) return;
    var id = _v.doc.id;
    var key = _v.si + ":" + _v.li;
    var d = getDone(id);
    var i = d.indexOf(key);
    if (i >= 0) d.splice(i, 1);
    else d.push(key);
    lsSet(doneKey(id), d);
    if (i < 0) {
      say("✅ Dars o'tildi deb belgilandi");
      var all = allLessons(_v.doc);
      var nx = all[all.findIndex(function (x) {
        return x.key === key;
      }) + 1];
      if (nx) {
        _v.si = nx.si;
        _v.li = nx.li;
        lsSet(lastKey(id), { si: nx.si, li: nx.li });
      }
    }
    renderViewer();
  };
  window.mtPick = function (id) {
    lsSet("mt_pick_" + userKey(), id);
    if (_v) mountViewer(_v.mount, id, _v.back);
  };
  window.mtFile = function (page) {
    var id = _v && _v.doc && _v.doc.id;
    if (!id) return;
    var doc = _v.doc;
    var isPdf = doc.kind === "pdf";
    var w = isPdf ? window.open("", "_blank") : null;
    if (w) w.document.write('<p style="font:16px sans-serif;padding:20px">⏳ Fayl ochilmoqda…</p>');
    fetch(api() + "/api/methodology/" + encodeURIComponent(id) + "/file")
      .then(function (r) {
        if (!r.ok) throw new Error("Fayl ochilmadi (" + r.status + ")");
        return r.blob();
      })
      .then(function (blob) {
        if (isPdf) {
          var url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" })) + (page ? "#page=" + page : "");
          if (w) w.location.href = url;
          else window.open(url, "_blank");
        } else {
          var a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = doc.fileName || "metodologiya";
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
      })
      .catch(function (e) {
        if (w) w.close();
        say("⚠️ " + e.message);
      });
  };

  /* ─── Mentor sahifasi ──────────────────────────────────────────────────── */

  function renderMentorMethod() {
    styles();
    var mount = document.getElementById("mentor-method-wrap");
    if (!mount) return;
    if (!_v || _v.mount !== "mentor-method-wrap" || !_v.doc) mount.innerHTML = '<div class="mt-page"><div class="mt-card"><div class="mt-empty">⏳ Yuklanmoqda…</div></div></div>';
    loadList()
      .then(function (list) {
        var ready = list.filter(function (x) {
          return x.status === "ready";
        });
        if (!ready.length) {
          _v = null;
          mount.innerHTML =
            '<div class="mt-page"><div class="mt-card"><div class="mt-empty"><div class="mt-empty-ic">🧭</div><b>Hali metodologiya yuklanmagan</b>' +
            "Administrator kurs metodologiyasini yuklagach, bo'limlar va darslar shu yerda chiqadi.</div></div></div>";
          return;
        }
        var id = preferredId(ready);
        if (_v && _v.mount === "mentor-method-wrap" && _v.doc && _v.doc.id === id) return renderViewer();
        mountViewer("mentor-method-wrap", id, null);
      })
      .catch(function (e) {
        mount.innerHTML = '<div class="mt-page"><div class="mt-card"><div class="mt-empty">⚠️ ' + esc(e.message) + "</div></div></div>";
      });
  }

  /* ─── Admin sahifasi ───────────────────────────────────────────────────── */

  var _file = null;
  var _busy = false;
  var _adminView = null; // ko'rilayotgan metodologiya id

  function courseOptions() {
    var cs = (data().courses || []).map(function (c) {
      return c.name;
    }).filter(Boolean);
    return '<option value="">— Kursni tanlang (ixtiyoriy) —</option>' + cs.map(function (n) {
      return '<option value="' + esc(n) + '">' + esc(n) + "</option>";
    }).join("");
  }

  function statusHtml(x) {
    if (x.status === "ready")
      return '<div class="mt-st ready">✓ Tayyor — ' + x.sectionsCount + " bo'lim, " + x.lessonsCount + " dars" +
        (x.method === "ai" ? " (AI bo'lib berdi)" : x.method === "pages" ? " (sahifalar bo'yicha)" : x.method === "chunks" ? " (qismlarga bo'lindi)" : "") + "</div>";
    if (x.status === "error") return '<div class="mt-st error">⚠️ ' + esc(x.error || "Xatolik") + "</div>";
    return '<div class="mt-st processing">⏳ Bo\'limlarga ajratilmoqda…</div>';
  }

  function renderMethodology() {
    styles();
    var mount = document.getElementById("methodology-wrap");
    if (!mount) return;
    if (_adminView) return mountViewer("methodology-wrap", _adminView, true);
    var list = _list || [];
    mount.innerHTML =
      '<div class="mt-page">' +
      '<div class="mt-card mt-up"><div><h3>🧭 Metodologiya yuklash</h3>' +
      "<p>Mentorlar darsni qaysi tartibda va qanday o'tishini shu yerdan ko'radi. Hujjat bo'limlar va darslarga avtomatik ajratiladi, har bir darsda hujjatdagi matnning o'zi chiqadi.</p>" +
      '<div class="mt-steps">' +
      "<div class=\"mt-step\"><i>1</i><span>Faylni tanlang: <b>PDF, Word (.docx), Excel (.xlsx), CSV</b> yoki <b>TXT</b>.</span></div>" +
      "<div class=\"mt-step\"><i>2</i><span>Hujjatda <b>«1-bo'lim. Kompyuter savodxonligi»</b>, <b>«1-dars. …»</b> kabi sarlavhalar bo'lsa — aynan shunday bo'linadi. Word'da sarlavha uslublari (Heading 1/2), Excel'da «Bo'lim / Mavzu / Nima o'tiladi / Misollar» ustunlari ham tushuniladi.</span></div>" +
      "<div class=\"mt-step\"><i>3</i><span>Mentor «Metodologiya» bo'limida bo'lim → darsni bosadi va bugun nima o'tishini ko'radi.</span></div>" +
      "</div></div>" +
      '<div class="mt-form">' +
      '<label for="mt-title">Nomi</label><input type="text" id="mt-title" maxlength="200" placeholder="Masalan: AI kursi metodologiyasi">' +
      '<label for="mt-course">Kurs</label><select id="mt-course">' + courseOptions() + "</select>" +
      '<label>Fayl</label><div class="mt-drop" id="mt-drop" onclick="document.getElementById(\'mt-file\').click()">' +
      '<div class="mt-drop-ic">📄</div><div style="min-width:0"><b id="mt-file-name">Faylni tanlang yoki shu yerga tashlang</b>' +
      "<small>PDF · Word · Excel · CSV · TXT — 12 MB gacha</small></div></div>" +
      '<input type="file" id="mt-file" accept=".pdf,.docx,.xlsx,.csv,.txt,application/pdf" style="display:none" onchange="mtPickFile(this.files[0])">' +
      '<button type="button" class="mt-go" id="mt-go" onclick="mtUpload()" disabled>⬆ Yuklash va bo\'limlarga ajratish</button>' +
      "</div></div>" +
      '<div class="mt-list-h"><h3>Yuklangan metodologiyalar (' + list.length + ")</h3></div>" +
      (list.length
        ? '<div class="mt-list">' +
          list
            .map(function (x) {
              var k = KIND[x.kind] || KIND.txt;
              var id = esc(x.id);
              return (
                '<div class="mt-item"><div class="mt-item-top"><div class="mt-file ' + k.cls + '">' + k.label + "</div>" +
                '<div style="min-width:0;flex:1"><div class="mt-name">' + esc(x.title) + '</div><div class="mt-subt">' +
                (x.course ? esc(x.course) + " · " : "") + esc(x.fileName) + " · " + fmtSize(x.size) + "</div></div></div>" +
                statusHtml(x) +
                '<div class="mt-acts">' +
                (x.status === "ready" ? '<button type="button" class="mt-btn pri" onclick="mtView(\'' + id + '\')">👁 Ko\'rish</button>' : "") +
                '<button type="button" class="mt-btn" onclick="mtRename(\'' + id + '\')">✏️ Nomi</button>' +
                '<button type="button" class="mt-btn" onclick="mtReparse(\'' + id + '\')">🔄 Qayta ajratish</button>' +
                '<button type="button" class="mt-btn" onclick="mtRemove(\'' + id + '\')">🗑 O\'chirish</button>' +
                "</div></div>"
              );
            })
            .join("") +
          "</div>"
        : '<div class="mt-card"><div class="mt-empty"><div class="mt-empty-ic">🧭</div><b>Hali metodologiya yo\'q</b>Yuqoridagi formadan birinchi faylni yuklang.</div></div>') +
      "</div>";
    var drop = document.getElementById("mt-drop");
    if (drop) {
      ["dragenter", "dragover"].forEach(function (ev) {
        drop.addEventListener(ev, function (e) {
          e.preventDefault();
          drop.classList.add("drag");
        });
      });
      ["dragleave", "drop"].forEach(function (ev) {
        drop.addEventListener(ev, function (e) {
          e.preventDefault();
          drop.classList.remove("drag");
        });
      });
      drop.addEventListener("drop", function (e) {
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) window.mtPickFile(f);
      });
    }
    if (_file) window.mtPickFile(_file);
    schedulePoll();
  }

  function refreshAdmin() {
    return loadList()
      .then(function () {
        if (!_adminView) renderMethodology();
      })
      .catch(function (e) {
        var m = document.getElementById("methodology-wrap");
        if (m && !_list) m.innerHTML = '<div class="mt-page"><div class="mt-card"><div class="mt-empty">⚠️ ' + esc(e.message) + "</div></div></div>";
      });
  }

  function schedulePoll() {
    clearTimeout(_poll);
    if (!(_list || []).some(function (x) {
      return x.status === "processing";
    }))
      return;
    _poll = setTimeout(function () {
      var panel = document.getElementById("panel-methodology");
      if (panel && panel.classList.contains("active")) refreshAdmin();
    }, 4000);
  }

  window.mtPickFile = function (f) {
    if (!f) return;
    if (f.size > 12 * 1024 * 1024) {
      say("⚠️ Fayl 12 MB dan katta");
      return;
    }
    if (!/\.(pdf|docx|xlsx|csv|txt)$/i.test(f.name)) {
      say(/\.doc$/i.test(f.name) ? "⚠️ Eski .doc — Word'da .docx qilib saqlang" : /\.xls$/i.test(f.name) ? "⚠️ Eski .xls — Excel'da .xlsx qilib saqlang" : "⚠️ PDF, Word (.docx), Excel (.xlsx), CSV yoki TXT tanlang");
      return;
    }
    _file = f;
    var n = document.getElementById("mt-file-name");
    if (n) n.textContent = f.name + " · " + fmtSize(f.size);
    var t = document.getElementById("mt-title");
    if (t && !t.value) t.value = f.name.replace(/\.[a-z0-9]+$/i, "");
    var go = document.getElementById("mt-go");
    if (go) go.disabled = false;
  };

  window.mtUpload = function () {
    if (!_file || _busy) return;
    var go = document.getElementById("mt-go");
    var title = (document.getElementById("mt-title") || {}).value || "";
    var course = (document.getElementById("mt-course") || {}).value || "";
    _busy = true;
    if (go) {
      go.disabled = true;
      go.textContent = "⏳ Yuklanmoqda…";
    }
    var r = new FileReader();
    r.onload = function () {
      sendJson("POST", "/api/methodology", { title: title.trim(), course: course, fileName: _file.name, data: r.result })
        .then(function () {
          say("✅ Yuklandi — bo'limlarga ajratilmoqda");
          _file = null;
          return refreshAdmin();
        })
        .catch(function (e) {
          say("⚠️ " + e.message);
        })
        .then(function () {
          _busy = false;
          var g = document.getElementById("mt-go");
          if (g) {
            g.textContent = "⬆ Yuklash va bo'limlarga ajratish";
            g.disabled = !_file;
          }
        });
    };
    r.onerror = function () {
      _busy = false;
      say("⚠️ Faylni o'qib bo'lmadi");
    };
    r.readAsDataURL(_file);
  };

  window.mtView = function (id) {
    _adminView = id;
    mountViewer("methodology-wrap", id, true);
    document.getElementById("scroll")?.scrollTo({ top: 0 });
  };
  window.mtBack = function () {
    _adminView = null;
    _v = null;
    renderMethodology();
  };
  window.mtReparse = function (id) {
    sendJson("POST", "/api/methodology/" + encodeURIComponent(id) + "/reparse")
      .then(function () {
        delete _docs[id];
        say("🔄 Qayta ajratilmoqda");
        return refreshAdmin();
      })
      .catch(function (e) {
        say("⚠️ " + e.message);
      });
  };
  window.mtRename = function (id) {
    var x = (_list || []).find(function (i) {
      return i.id === id;
    });
    if (!x) return;
    var ask = typeof crmPrompt === "function" ? crmPrompt("Metodologiya nomi", { value: x.title, okText: "Saqlash" }) : Promise.resolve(window.prompt("Metodologiya nomi", x.title));
    Promise.resolve(ask).then(function (v) {
      if (v == null || !String(v).trim()) return;
      sendJson("PUT", "/api/methodology/" + encodeURIComponent(id), { title: String(v).trim() })
        .then(function () {
          delete _docs[id];
          say("✅ Saqlandi");
          return refreshAdmin();
        })
        .catch(function (e) {
          say("⚠️ " + e.message);
        });
    });
  };
  window.mtRemove = function (id) {
    var x = (_list || []).find(function (i) {
      return i.id === id;
    });
    var ask = typeof crmConfirm === "function" ? crmConfirm("«" + ((x && x.title) || "") + "» metodologiyasi o'chirilsinmi?", { title: "O'chirish", okText: "Ha, o'chirish" }) : Promise.resolve(window.confirm("O'chirilsinmi?"));
    Promise.resolve(ask).then(function (ok) {
      if (!ok) return;
      getJson("/api/methodology/" + encodeURIComponent(id), { method: "DELETE" })
        .then(function () {
          delete _docs[id];
          say("🗑 O'chirildi");
          return refreshAdmin();
        })
        .catch(function (e) {
          say("⚠️ " + e.message);
        });
    });
  };

  window.renderMethodology = function () {
    styles();
    var mount = document.getElementById("methodology-wrap");
    if (mount && !_list) mount.innerHTML = '<div class="mt-page"><div class="mt-card"><div class="mt-empty">⏳ Yuklanmoqda…</div></div></div>';
    if (_adminView) return renderMethodology();
    refreshAdmin();
  };
  window.renderMentorMethod = renderMentorMethod;

  // Menyu hisoblagichi (admin) — sahifa ochilganda bir marta
  setTimeout(function () {
    if (!isMentor() && document.getElementById("nc-methodology")) loadList().catch(function () {});
  }, 2500);
})();
