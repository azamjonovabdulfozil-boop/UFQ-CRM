/**
 * SERTIFIKATLAR moduli
 * ============================================================================
 * Admin sertifikat yaratadi → talaba o'z panelida ("🎖 Sertifikatlarim")
 * ko'radi, chop etadi yoki PDF qilib saqlaydi. Mentorning bunga aloqasi yo'q.
 *
 * SHABLON = ADMIN YUKLAGAN RASM
 * -----------------------------
 * Dizayn kodda yozilmagan. Admin sertifikat blankasini RASM (PNG/JPG) qilib
 * yuklaydi, so'ng shu rasm ustida har bir maydonni — ism, kurs, raqam, o'qish
 * davri, berilgan sana, QR — sichqoncha bilan kerakli joyga sudrab qo'yadi
 * (shrift o'lchami, rangi, qalinligi ham shu yerda sozlanadi).
 *
 * Sertifikat yaratilganda ma'lumot AYNAN o'sha joylarga tushadi: rasm — fon,
 * matnlar — ustida. Maydon to'ldirilishi bilan ko'rinish darrov yangilanadi.
 *
 * Joylashuv FOIZDA saqlanadi (x/y — rasm kengligi/balandligining foizi),
 * shuning uchun ekranda, chop etishda va QR sahifasida bir xil chiqadi.
 *
 * QR KOD
 * ------
 * QR ichida `{backend}/sert/{raqam}` havolasi turadi. Skaner qilinganda
 * backend (server.js → GET /sert/:no) o'sha raqamdagi sertifikatni bazadan
 * topib, xuddi shu shablon rasmi va joylashuvi bilan chizib beradi — ya'ni
 * ochilgan sahifa aynan skaner qilingan qog'ozga mos bo'ladi.
 *
 * ⚠️ Bu fayl ochiq (login talab qilmaydigan) tekshiruv sahifasida ham
 * ishlatiladi. Shuning uchun D, LANG, toast kabi CRM globallariga
 * tekshiruvsiz murojaat qilinmaydi va yuklanishida yon ta'sir bo'lmaydi.
 */

/* ─── Yordamchilar ────────────────────────────────────────────────────────── */

function _certEsc(v) {
  return String(v == null ? "" : v).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

/** D.certificates — ro'yxat hali bo'lmasa yaratib beradi. */
function certAll() {
  if (!window.D || typeof D !== "object") return [];
  if (!Array.isArray(D.certificates)) D.certificates = [];
  return D.certificates;
}

/** D.certTemplates — admin yuklagan shablonlar. */
function certTemplatesAll() {
  if (!window.D || typeof D !== "object") return [];
  if (!Array.isArray(D.certTemplates)) D.certTemplates = [];
  return D.certTemplates;
}

function certById(id) {
  return (
    certAll().find(function (c) {
      return String(c.id) === String(id);
    }) || null
  );
}

function certTplById(id) {
  return (
    certTemplatesAll().find(function (t) {
      return String(t.id) === String(id);
    }) || null
  );
}

function _certBrand() {
  try {
    if (typeof _brandSettings !== "undefined" && _brandSettings.crmName)
      return _brandSettings.crmName;
  } catch (e) {}
  return "EduManage";
}

var _CERT_MON_UZ = [
  "yanvar", "fevral", "mart", "aprel", "may", "iyun",
  "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr",
];

/** Sanani "8-sentabr, 2026-yil" ko'rinishida chiqaradi (CRM formatiga mos). */
function _certDate(d) {
  if (!d) return "—";
  if (typeof fmtDate === "function") {
    var r = fmtDate(d);
    if (r && r !== "—") return r;
  }
  var dt = new Date(String(d) + "T00:00:00");
  if (isNaN(dt)) return String(d);
  return dt.getDate() + "-" + _CERT_MON_UZ[dt.getMonth()] + ", " + dt.getFullYear() + "-yil";
}

/** "O'qish davri" — ikkita sanadan bitta matn. */
function certPeriodText(c) {
  var a = c.periodFrom ? _certDate(c.periodFrom) : "";
  var b = c.periodTo ? _certDate(c.periodTo) : "";
  if (a && b) return a + " — " + b;
  return a || b || c.period || "—";
}

/**
 * QR ichidagi havola — tekshiruv sahifasi.
 * Tekshiruv sahifasini BACKEND beradi, portal esa (Vercel'da) boshqa domenda
 * turishi mumkin. Shuning uchun main.js qo'yadigan `__SSE_BASE__` (backend
 * to'liq manzili) ustun, u bo'sh bo'lsa — shu sahifaning o'z origini.
 */
function certPublicUrl(c) {
  var base = "";
  try {
    base = window.__SSE_BASE__ || "";
    if (!base) base = location.origin;
  } catch (e) {}
  return String(base).replace(/\/$/, "") + "/sert/" + encodeURIComponent(c.no || "");
}

/** Keyingi bo'sh sertifikat raqami: SERT-2026-0007 */
function certNextNo() {
  var year = new Date().getFullYear();
  var prefix = "SERT-" + year + "-";
  var max = 0;
  certAll().forEach(function (c) {
    var m = String(c.no || "").match(/^SERT-\d{4}-(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10) || 0);
  });
  return prefix + String(max + 1).padStart(4, "0");
}

/* ─── QR kod ──────────────────────────────────────────────────────────────── */
// qrcodejs (cdnjs) — faqat kerak bo'lganda yuklanadi. Kutubxona yuklanmasa
// (internet yo'q) sertifikat baribir chiziladi, QR o'rniga havola matni chiqadi.

var _certQrPromise = null;

function _certLoadQrLib() {
  if (typeof window.QRCode !== "undefined") return Promise.resolve(window.QRCode);
  if (_certQrPromise) return _certQrPromise;
  _certQrPromise = new Promise(function (resolve) {
    var s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
    s.onload = function () {
      resolve(window.QRCode || null);
    };
    s.onerror = function () {
      resolve(null);
    };
    document.head.appendChild(s);
  });
  return _certQrPromise;
}

/**
 * Matndan QR rasm (data URL) yasaydi. Kutubxona bo'lmasa "" qaytaradi —
 * chaqiruvchi bunda QR o'rniga havolani chiqaradi.
 */
function certQrDataUrl(text, size) {
  size = size || 420;
  return _certLoadQrLib().then(function (QR) {
    if (!QR) return "";
    return new Promise(function (resolve) {
      var box = document.createElement("div");
      box.style.cssText = "position:fixed;left:-9999px;top:-9999px";
      document.body.appendChild(box);
      try {
        new QR(box, {
          text: text,
          width: size,
          height: size,
          colorDark: "#0f172a",
          colorLight: "#ffffff",
          correctLevel: QR.CorrectLevel ? QR.CorrectLevel.M : 0,
        });
      } catch (e) {
        box.remove();
        return resolve("");
      }
      // qrcodejs canvas (yoki eski brauzerda img) yasaydi — biroz kutamiz.
      setTimeout(function () {
        var url = "";
        try {
          var cv = box.querySelector("canvas");
          if (cv) url = cv.toDataURL("image/png");
          else {
            var im = box.querySelector("img");
            if (im) url = im.src;
          }
        } catch (e) {}
        box.remove();
        resolve(url || "");
      }, 60);
    });
  });
}

/* ─── Shablon rasmi (backend "blobs" ombori) ──────────────────────────────── */
// Rasm CRM ma'lumoti ichida SAQLANMAYDI — u juda katta bo'lib, butun bazani
// og'irlashtirardi (test PDF va videolarda ishlatilgan yondashuvning aynan
// o'zi). Rasm `blobs` kolleksiyasida, CRM ichida esa faqat uning id si.

function _certApiBase() {
  try {
    if (window.__API_BASE__) return window.__API_BASE__;
    if (typeof __API_BASE__ !== "undefined" && __API_BASE__) return __API_BASE__;
  } catch (e) {}
  return "";
}

var _certImgCache = {}; // blobId → data URL

function certUploadTplImage(blobId, dataUrl, name) {
  return fetch(_certApiBase() + "/api/blob", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: blobId, data: dataUrl, name: name || "" }),
  })
    .then(function (r) {
      return r.json();
    })
    .then(function (d) {
      if (d && d.ok) _certImgCache[blobId] = dataUrl;
      return d;
    });
}

function certDeleteTplImage(blobId) {
  delete _certImgCache[blobId];
  return fetch(_certApiBase() + "/api/blob/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: blobId }),
  }).catch(function () {});
}

/** Shablon rasmini oladi (keshdan yoki backend'dan). Topilmasa "". */
function certTplImage(tpl) {
  var id = tpl && tpl.blobId;
  if (!id) return Promise.resolve("");
  if (_certImgCache[id]) return Promise.resolve(_certImgCache[id]);
  return fetch(_certApiBase() + "/api/blob/" + encodeURIComponent(id))
    .then(function (r) {
      return r.ok ? r.json() : null;
    })
    .then(function (d) {
      var url = d && d.ok ? d.data : "";
      if (url) _certImgCache[id] = url;
      return url || "";
    })
    .catch(function () {
      return "";
    });
}

/* ─── Shablon modeli ──────────────────────────────────────────────────────── */

/** Shablonga joylashtiriladigan maydonlar. */
var CERT_FIELDS = [
  { key: "name", label: "👤 Ism familya", sample: "Ism Familya" },
  { key: "course", label: "📚 Kurs", sample: "Kurs nomi" },
  { key: "no", label: "🔢 Sertifikat raqami", sample: "SERT-2026-0001" },
  { key: "period", label: "🗓 O'qish davri", sample: "1-yanvar, 2025-yil — 1-dekabr, 2025-yil" },
  { key: "date", label: "📅 Berilgan sana", sample: "8-sentabr, 2026-yil" },
  { key: "qr", label: "🔳 QR kod", sample: "" },
];

var CERT_FONTS = {
  serif: "Georgia,'Times New Roman',serif",
  sans: "'Segoe UI',system-ui,-apple-system,sans-serif",
  mono: "'JetBrains Mono','Courier New',monospace",
};

/**
 * Yangi shablon uchun boshlang'ich joylashuv. Rasm har xil bo'lgani uchun bu
 * faqat BOSHLANG'ICH nuqta — admin har birini sudrab o'z joyiga qo'yadi.
 * x/y — foizda (rasm kengligi/balandligiga nisbatan), size — 1000px kenglikka
 * nisbatan piksel.
 */
function certDefaultFields() {
  return {
    name:   { on: true, x: 50, y: 46, size: 46, color: "#111827", bold: true,  italic: true,  align: "center", font: "serif" },
    course: { on: true, x: 50, y: 58, size: 24, color: "#1f2937", bold: true,  italic: false, align: "center", font: "sans" },
    period: { on: true, x: 30, y: 72, size: 16, color: "#374151", bold: false, italic: false, align: "center", font: "sans" },
    date:   { on: true, x: 70, y: 72, size: 16, color: "#374151", bold: false, italic: false, align: "center", font: "sans" },
    no:     { on: true, x: 18, y: 88, size: 15, color: "#374151", bold: true,  italic: false, align: "center", font: "mono" },
    qr:     { on: true, x: 50, y: 85, size: 11, color: "#0f172a", bold: false, italic: false, align: "center", font: "sans" },
  };
}

function _certField(tpl, key) {
  var def = certDefaultFields()[key];
  var f = tpl && tpl.fields && tpl.fields[key];
  return Object.assign({}, def, f || {});
}

/** Shablon bo'lmasa ham sertifikat chizilsin — oddiy oq blanka. */
function _certFallbackTpl() {
  return { id: 0, name: "Shablon tanlanmagan", blobId: "", w: 1000, h: 707, fields: certDefaultFields() };
}

/** Sertifikat qaysi shablonda chiziladi. */
function certTplFor(c) {
  return (c && c.templateId ? certTplById(c.templateId) : null) || certTemplatesAll()[0] || _certFallbackTpl();
}

/** Chizish o'lchami: kenglik doim 1000px, balandlik rasm nisbatidan. */
function certSize(tpl) {
  var w = (tpl && tpl.w) || 1000;
  var h = (tpl && tpl.h) || 707;
  return { w: 1000, h: Math.round((1000 * h) / w) };
}

/** Maydon matnlari — sertifikat ma'lumotidan. */
function certFieldTexts(c) {
  return {
    name: c.name || "",
    course: c.course || "",
    no: c.no || "",
    period: certPeriodText(c),
    date: _certDate(c.issueDate),
  };
}

/* ─── Chizish ─────────────────────────────────────────────────────────────── */

/** Bitta maydonning CSS joylashuvi (foizli — har qanday o'lchamda mos). */
function _certFieldStyle(f) {
  var tx = f.align === "left" ? "0" : f.align === "right" ? "-100%" : "-50%";
  return (
    "position:absolute;left:" + f.x + "%;top:" + f.y + "%;" +
    "transform:translate(" + tx + ",-50%);white-space:nowrap;" +
    "font-family:" + (CERT_FONTS[f.font] || CERT_FONTS.sans) + ";" +
    "font-size:" + f.size + "px;color:" + f.color + ";" +
    "font-weight:" + (f.bold ? 700 : 400) + ";" +
    "font-style:" + (f.italic ? "italic" : "normal") + ";" +
    "line-height:1.2"
  );
}

/**
 * Sertifikatni chizadi: 1000px kenglikdagi blok.
 *   c    — sertifikat ma'lumoti
 *   qr   — QR rasm (data URL) yoki ""
 *   tpl  — shablon (berilmasa sertifikatnikidan olinadi)
 *   img  — shablon rasmi (data URL) yoki ""
 */
function certRenderHtml(c, qr, tpl, img) {
  tpl = tpl || certTplFor(c);
  var sz = certSize(tpl);
  var txt = certFieldTexts(c);

  var bg = img
    ? '<img src="' + img + '" alt="" style="position:absolute;inset:0;width:100%;height:100%;display:block">'
    : '<div style="position:absolute;inset:0;background:#fff;border:1px dashed #cbd5e1"></div>' +
      '<div style="position:absolute;left:50%;top:14%;transform:translateX(-50%);font:600 15px system-ui,sans-serif;color:#94a3b8;white-space:nowrap">' +
      "Shablon rasmi yuklanmagan</div>";

  var parts = [];
  var covers = [];
  CERT_FIELDS.forEach(function (meta) {
    var f = _certField(tpl, meta.key);
    if (!f.on) return;

    // Blankadagi namuna yozuv ("Ism Familiya", "DD.MM.YYYY", QR namunasi)
    // qiymat bilan ustma-ust chiqmasligi uchun fon rangida yopiladi.
    if (f.cover && f.cover.w && f.cover.h) {
      covers.push(
        '<div style="position:absolute;left:' + f.x + "%;top:" + f.y +
        '%;transform:translate(-50%,-50%);width:' + f.cover.w + "%;height:" + f.cover.h +
        '%;background:' + (f.cover.color || "#ffffff") + '"></div>',
      );
    }

    if (meta.key === "qr") {
      if (c.qr === false) return;
      var side = (f.size / 100) * sz.w;
      var box =
        "position:absolute;left:" + f.x + "%;top:" + f.y + "%;" +
        "transform:translate(-50%,-50%);width:" + side + "px;height:" + side + "px";
      if (qr)
        parts.push('<img src="' + qr + '" alt="QR" style="' + box + ';background:#fff;padding:4px;border-radius:6px;box-sizing:border-box">');
      else
        parts.push(
          '<div style="' + box + ';font:9px system-ui,sans-serif;color:#64748b;' +
          'word-break:break-all;text-align:center;display:flex;align-items:center;justify-content:center">' +
          _certEsc(certPublicUrl(c)) + "</div>",
        );
      return;
    }

    var v = txt[meta.key];
    // Bo'sh maydon ("—") shablonga umuman chizilmaydi
    if (!v || v === "—") return;
    parts.push('<div style="' + _certFieldStyle(f) + '">' + _certEsc(v) + "</div>");
  });

  return (
    '<div style="position:relative;width:' + sz.w + "px;height:" + sz.h +
    'px;background:#fff;overflow:hidden">' + bg + covers.join("") + parts.join("") + "</div>"
  );
}

/** Chop etish / alohida sahifa uchun to'liq HTML hujjat. */
function certDocument(c, qr, tpl, img) {
  tpl = tpl || certTplFor(c);
  var sz = certSize(tpl);
  var landscape = sz.w >= sz.h;
  return (
    "<!DOCTYPE html><html lang='uz'><head><meta charset='utf-8'>" +
    "<title>" + _certEsc(c.no || "Sertifikat") + " — " + _certEsc(c.name || "") + "</title>" +
    "<style>" +
    "*{box-sizing:border-box}html,body{margin:0;padding:0;background:#e2e8f0}" +
    ".sheet{width:1000px;margin:24px auto;box-shadow:0 10px 40px rgba(0,0,0,.18)}" +
    "@media print{@page{size:A4 " + (landscape ? "landscape" : "portrait") + ";margin:0}" +
    "html,body{background:#fff}.sheet{margin:0;box-shadow:none;" +
    "transform:scale(.9985);transform-origin:top left}}" +
    "</style></head><body><div class='sheet'>" +
    certRenderHtml(c, qr, tpl, img) +
    "</div>" +
    "<script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script>" +
    "</body></html>"
  );
}

/**
 * Sertifikatni yangi oynada ochadi (chop etish / PDF saqlash).
 * QR va shablon rasmi avval tayyorlanadi — yangi oynada hech narsa
 * qayta yuklanmasin (chop etish darrov to'g'ri ko'rinsin).
 */
function certPrint(id) {
  var c = typeof id === "object" ? id : certById(id);
  if (!c || !c.no) return;
  var w = window.open("", "_blank");
  if (!w) {
    if (typeof toast === "function") toast("⚠️ Brauzer yangi oynani bloklab qo'ydi");
    return;
  }
  w.document.write("<p style='font-family:sans-serif;padding:20px'>⏳ Tayyorlanmoqda...</p>");
  var tpl = certTplFor(c);
  Promise.all([
    c.qr === false ? Promise.resolve("") : certQrDataUrl(certPublicUrl(c)),
    certTplImage(tpl),
  ]).then(function (r) {
    w.document.open();
    w.document.write(certDocument(c, r[0], tpl, r[1]));
    w.document.close();
  });
}

/* ─── Umumiy modal (admin ham, talaba ham ishlatadi) ──────────────────────── */

function _certOpenModal(title, bodyHtml, action, wide) {
  var ov = document.getElementById("cert-overlay");
  if (!ov) {
    ov = document.createElement("div");
    ov.id = "cert-overlay";
    ov.className = "overlay";
    ov.onclick = function (e) {
      if (e.target === ov) certCloseModal();
    };
    ov.innerHTML =
      '<div class="modal" id="cert-modal-box">' +
      '<div class="modal-head"><div class="modal-title" id="cert-modal-title"></div>' +
      '<button class="m-close" onclick="certCloseModal()">✕</button></div>' +
      '<div class="modal-body" id="cert-modal-body"></div>' +
      '<div class="modal-foot"><button class="btn" onclick="certCloseModal()">Yopish</button>' +
      '<button class="btn btn-primary" id="cert-modal-ok" style="display:none"></button></div>' +
      "</div>";
    document.body.appendChild(ov);
    ov.querySelector("#cert-modal-box").addEventListener("click", function (e) {
      e.stopPropagation();
    });
  }
  var box = document.getElementById("cert-modal-box");
  box.style.maxWidth = wide ? "900px" : "";
  box.style.width = wide ? "94vw" : "";
  document.getElementById("cert-modal-title").textContent = title;
  document.getElementById("cert-modal-body").innerHTML = bodyHtml;
  var ok = document.getElementById("cert-modal-ok");
  if (action) {
    ok.style.display = "";
    ok.disabled = false;
    ok.textContent = action.label;
    ok.onclick = action.onClick;
  } else {
    ok.style.display = "none";
    ok.onclick = null;
  }
  ov.classList.add("open");
  ov.style.display = "flex";
}

function certCloseModal() {
  var ov = document.getElementById("cert-overlay");
  if (ov) {
    ov.classList.remove("open");
    ov.style.display = "none";
  }
}

/**
 * 1000px kenglikdagi chizmani konteyner kengligiga moslab kichraytiradi.
 * (transform: scale — chop etishda o'lcham baribir to'liq qoladi.)
 */
function certFitPreview(wrapId) {
  var wrap = document.getElementById(wrapId);
  if (!wrap) return;
  var inner = wrap.firstElementChild;
  if (!inner) return;
  var s = wrap.clientWidth / 1000;
  if (!s || !isFinite(s)) return;
  inner.style.transformOrigin = "top left";
  inner.style.transform = "scale(" + s + ")";
  wrap.style.height = (inner.offsetHeight || 707) * s + "px";
}

/** Sertifikatni konteynerga chizadi (rasm va QR tayyor bo'lgach yangilaydi). */
function certPaint(wrapId, c) {
  var wrap = document.getElementById(wrapId);
  if (!wrap) return;
  wrap.style.overflow = "hidden";
  var tpl = certTplFor(c);

  function draw(qr, img) {
    var el = document.getElementById(wrapId);
    if (!el) return;
    el.innerHTML = certRenderHtml(c, qr, tpl, img);
    certFitPreview(wrapId);
  }

  draw("", _certImgCache[tpl.blobId] || "");
  Promise.all([
    c.qr === false ? Promise.resolve("") : certQrDataUrl(certPublicUrl(c)),
    certTplImage(tpl),
  ]).then(function (r) {
    draw(r[0], r[1]);
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   ADMIN — SHABLONLAR (rasm yuklash va maydonlarni joylashtirish)
   ══════════════════════════════════════════════════════════════════════════ */

/** Panel ichidagi ikki bo'lim: sertifikatlar ro'yxati / shablonlar. */
function certSwitchTab(tab) {
  var isTpl = tab === "tpl";
  var l = document.getElementById("cert-tab-list");
  var t = document.getElementById("cert-tab-tpl");
  if (l) l.style.display = isTpl ? "none" : "";
  if (t) t.style.display = isTpl ? "" : "none";
  ["cert-tabbtn-list", "cert-tabbtn-tpl"].forEach(function (id) {
    var b = document.getElementById(id);
    if (b) b.classList.remove("btn-primary");
  });
  var act = document.getElementById(isTpl ? "cert-tabbtn-tpl" : "cert-tabbtn-list");
  if (act) act.classList.add("btn-primary");
  if (isTpl) renderCertTemplates();
  else renderCertificates();
}

function renderCertTemplates() {
  var box = document.getElementById("cert-tpl-grid");
  if (!box) return;
  var list = certTemplatesAll();

  if (!list.length) {
    box.innerHTML =
      '<div style="text-align:center;padding:52px 20px;color:var(--text3)">' +
      '<div style="font-size:46px;opacity:.35">🖼</div>' +
      '<div style="font-size:14px;font-weight:800;color:var(--text);margin-top:8px">Shablon yuklanmagan</div>' +
      '<div style="font-size:12px;margin-top:4px;max-width:460px;margin-left:auto;margin-right:auto;line-height:1.6">' +
      "Sertifikat blankasini rasm (PNG yoki JPG) qilib yuklang — so'ng ism, kurs, raqam, " +
      "o'qish davri, sana va QR kodni rasm ustida kerakli joyga sudrab qo'yasiz. " +
      "Sertifikat yaratilganda ma'lumot aynan o'sha joylarga tushadi.</div></div>";
    return;
  }

  box.innerHTML = list
    .map(function (t) {
      var used = certAll().filter(function (c) {
        return String(c.templateId) === String(t.id);
      }).length;
      return (
        '<div style="background:var(--bg);border:1.5px solid var(--border2);border-radius:var(--r-lg);overflow:hidden;box-shadow:var(--shadow-sm)">' +
        '<div id="cert-tplprev-' + t.id + '" style="width:100%;overflow:hidden;background:var(--bg3);cursor:pointer" onclick="certOpenTplEditor(' + t.id + ')"></div>' +
        '<div style="padding:12px 14px">' +
        '<div style="font-size:14px;font-weight:800;color:var(--text)">' + _certEsc(t.name) + "</div>" +
        '<div style="font-size:11.5px;color:var(--text3);margin-top:3px">' +
        (t.w || "?") + "×" + (t.h || "?") + " px · " + used + " ta sertifikatda ishlatilgan</div>" +
        '<div style="display:flex;gap:8px;margin-top:10px">' +
        '<button class="btn btn-sm btn-primary" style="flex:1" onclick="certOpenTplEditor(' + t.id + ')">🎯 Maydonlarni joylash</button>' +
        '<button class="btn btn-sm" onclick="certDeleteTemplate(' + t.id + ')">🗑</button>' +
        "</div></div></div>"
      );
    })
    .join("");

  // Har bir shablon namunaviy ma'lumot bilan ko'rsatiladi
  list.forEach(function (t) {
    certPaint("cert-tplprev-" + t.id, _certSampleCert(t));
  });
}

/** Shablonni ko'rsatish uchun namunaviy (saqlanmaydigan) sertifikat. */
function _certSampleCert(tpl) {
  return {
    id: 0,
    templateId: tpl.id,
    no: "SERT-" + new Date().getFullYear() + "-0001",
    name: "Ism Familya",
    course: "Kurs nomi",
    periodFrom: "2025-01-15",
    periodTo: "2025-12-01",
    issueDate: new Date().toISOString().slice(0, 10),
    qr: true,
  };
}

/* ─── SHABLONNI AVTOMATIK O'QISH (maydonlarni o'zi joylashtiradi) ─────────── */
/**
 * Yuklangan blanka rasmini tahlil qiladi va maydonlarni BO'SH joylarga o'zi
 * qo'yadi — admin sudrab o'tirmaydi (kerak bo'lsa keyin tuzatadi).
 *
 * Qanday ishlaydi: rasm kichiklashtirilib canvas ga chiziladi, har bir satr
 * uchun "bo'yoq zichligi" hisoblanadi (fon rangidan qanchalik farq qiladi).
 * Zichligi past, ketma-ket satrlar — bo'sh yo'lak. Yo'laklar yuqoridan pastga
 * tartiblanib, katta-kattasiga ism, keyin kurs, so'ng davr/sana, eng pastdagi
 * yo'lakka raqam va QR joylashtiriladi. Fon to'q bo'lsa matn oq qilinadi.
 */
function certAutoLayout(imgEl) {
  var fields = certDefaultFields();
  try {
    var W = 240;
    var H = Math.max(40, Math.round((W * imgEl.naturalHeight) / imgEl.naturalWidth));
    var cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    var ctx = cv.getContext("2d");
    ctx.drawImage(imgEl, 0, 0, W, H);
    var px = ctx.getImageData(0, 0, W, H).data;

    var lum = function (i) {
      return (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) / 255;
    };

    // Fon rangi — chap va o'ng chekkalarning o'rtacha yorqinligi
    var bg = 0, n = 0;
    for (var y = 0; y < H; y += 2) {
      bg += lum((y * W + 2) * 4) + lum((y * W + (W - 3)) * 4);
      n += 2;
    }
    bg = n ? bg / n : 1;
    var darkBg = bg < 0.5;
    var color = darkBg ? "#f8fafc" : "#111827";
    var soft = darkBg ? "#e2e8f0" : "#374151";
    CERT_FIELDS.forEach(function (m) {
      if (m.key !== "qr") fields[m.key].color = m.key === "name" || m.key === "course" ? color : soft;
    });

    // Har bir satrdagi "bo'yoq" ulushi (fon rangidan farq qiladigan piksellar)
    var ink = [];
    for (var y2 = 0; y2 < H; y2++) {
      var c = 0;
      for (var x = 0; x < W; x++) {
        if (Math.abs(lum((y2 * W + x) * 4) - bg) > 0.18) c++;
      }
      ink.push(c / W);
    }

    // Bo'sh yo'laklar: ink past bo'lgan ketma-ket satrlar (foizda)
    var bands = [], st = -1;
    for (var y3 = 0; y3 <= H; y3++) {
      var empty = y3 < H && ink[y3] < 0.03;
      if (empty && st < 0) st = y3;
      if (!empty && st >= 0) {
        var top = (st / H) * 100, bot = (y3 / H) * 100;
        var hh = bot - top;
        // Chetki oq maydonlar (ramkadan tashqarisi) hisobga olinmaydi
        if (hh >= 4 && bot > 20 && top < 97) bands.push({ top: top, bot: bot, h: hh, mid: (top + bot) / 2 });
        st = -1;
      }
    }
    if (!bands.length) return fields;

    bands.sort(function (a, b) {
      return b.h - a.h;
    });
    var main = bands[0]; // eng katta bo'sh maydon — asosiy yozuv joyi

    // Asosiy maydondan pastda alohida bo'sh yo'lak bormi (imzo/raqam qatori)
    var lower = bands
      .filter(function (b) {
        return b.top >= main.bot - 0.5;
      })
      .sort(function (a, b) {
        return b.mid - a.mid;
      })[0];

    var pxH = function (pct) {
      return (pct / 100) * 707; // 1000px kenglikdagi varaqqa nisbatan
    };
    var clamp = function (v, lo, hi) {
      return Math.max(lo, Math.min(hi, Math.round(v)));
    };
    var at = function (frac) {
      return Math.round((main.top + main.h * frac) * 10) / 10;
    };

    // Asosiy maydonni ustma-ust qatorlarga bo'lamiz
    fields.name.y = at(0.3);
    fields.name.size = clamp(pxH(main.h) * 0.22, 24, 58);

    fields.course.y = at(0.55);
    fields.course.size = clamp(pxH(main.h) * 0.11, 16, 30);

    var rowY = at(0.76);
    fields.period.y = rowY;
    fields.date.y = rowY;
    fields.period.x = 27;
    fields.date.x = 73;
    fields.period.size = clamp(pxH(main.h) * 0.06, 12, 20);
    fields.date.size = fields.period.size;

    // Raqam va QR — pastdagi alohida yo'lakda, bo'lmasa asosiy maydon oxirida
    // Pastki chetga yopishib qolmasin — QR va raqam varaq ichida qoladi
    var botY = Math.min(90, lower ? Math.round(lower.mid * 10) / 10 : at(0.93));
    fields.no.y = botY;
    fields.no.x = 18;
    fields.no.size = clamp(pxH(lower ? lower.h : main.h * 0.14) * 0.5, 12, 18);
    fields.qr.y = Math.min(86, botY);
    fields.qr.x = 50;
    fields.qr.size = 11;

    // QR pastdagi yozuvlar bilan urishib ketmasin
    if (!lower && fields.qr.y > 88) fields.qr.y = 88;
  } catch (e) {
    // Tahlil qilib bo'lmasa (masalan canvas cheklovi) — standart joylashuv
  }
  return fields;
}

/* ─── SHABLONNI O'QISH: matn tanish (OCR) + chiziqlarni topish ───────────── */
/**
 * Blanka rasmi TAHLIL QILINADI va maydonlar o'z joyiga qo'yiladi — admin
 * hech narsani sudramaydi:
 *
 *   1) Rasmdagi yozuvlar OCR (tesseract.js) bilan o'qiladi — "Ism Familiya",
 *      "Kurs nomi", "O'qish muddati", "Sana", "DD.MM.YYYY", "Sertifikatni
 *      tekshirish" kabi yorliq va namunalar topiladi.
 *   2) Rasmdagi INGICHKA GORIZONTAL CHIZIQLAR aniqlanadi — qiymat yoziladigan
 *      joylar odatda shu chiziqlar ustida turadi.
 *   3) Har bir maydon o'z yorlig'iga bog'lanadi:
 *        · "Ism Familiya" / "DD.MM.YYYY" kabi NAMUNA matn bo'lsa — qiymat aynan
 *          o'sha joyga qo'yiladi, namunaning ustiga fon rangida "yamoq"
 *          tushiriladi (ikkita matn ustma-ust chiqmasin).
 *        · "Kurs nomi", "O'qish muddati" kabi YORLIQ bo'lsa — qiymat uning
 *          ostidagi chiziq ustiga qo'yiladi.
 *        · QR uchun blankadagi QR namunasi (yoki "tekshirish" yozuvi ustidagi
 *          kvadrat) topiladi va QR aynan o'sha o'lchamda o'sha joyga tushadi.
 *   4) Shrift o'lchami va rangi ham blankadagi namunadan olinadi.
 *
 * OCR yuklanmasa (internet yo'q) — chiziq va bo'sh joy tahliliga asoslangan
 * zaxira joylashuv ishlatiladi.
 */

/* ── Rasm tahlili (canvas) ──────────────────────────────────────────────── */

function _certAnalyze(imgEl) {
  var W = 1000;
  var H = Math.max(50, Math.round((W * imgEl.naturalHeight) / imgEl.naturalWidth));
  var cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  var ctx = cv.getContext("2d");
  ctx.drawImage(imgEl, 0, 0, W, H);
  var px = ctx.getImageData(0, 0, W, H).data;

  var lum = function (x, y) {
    var i = (Math.round(y) * W + Math.round(x)) * 4;
    return (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) / 255;
  };

  // Fon — eng ko'p uchraydigan yorqinlik (blanka asosan fon rangida)
  var hist = new Array(32).fill(0);
  for (var y = 0; y < H; y += 2)
    for (var x = 0; x < W; x += 2) hist[Math.min(31, Math.floor(lum(x, y) * 32))]++;
  var top = 0;
  for (var i2 = 1; i2 < 32; i2++) if (hist[i2] > hist[top]) top = i2;
  var bg = (top + 0.5) / 32;

  var A = {
    W: W,
    H: H,
    bg: bg,
    dark: bg < 0.5,
    lum: lum,
    isInk: function (x, y) {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x >= W || y >= H) return false;
      return Math.abs(lum(x, y) - bg) > 0.22;
    },
    rgb: function (x, y) {
      x = Math.max(0, Math.min(W - 1, Math.round(x)));
      y = Math.max(0, Math.min(H - 1, Math.round(y)));
      var i = (y * W + x) * 4;
      return [px[i], px[i + 1], px[i + 2]];
    },
  };

  /** Berilgan to'rtburchakdagi yozuv rangi (o'rtacha "bo'yoq" rangi). */
  A.inkColor = function (b) {
    var r = 0, g = 0, bl = 0, n = 0;
    for (var y = Math.max(0, b.y0); y < Math.min(H, b.y1); y++)
      for (var x = Math.max(0, b.x0); x < Math.min(W, b.x1); x++)
        if (A.isInk(x, y)) {
          var c = A.rgb(x, y);
          r += c[0]; g += c[1]; bl += c[2]; n++;
        }
    if (!n) return A.dark ? "#f8fafc" : "#111827";
    return _certHex(r / n, g / n, bl / n);
  };

  /** To'rtburchak atrofidagi fon rangi (yamoq shu rangda bo'ladi). */
  A.bgColor = function (b) {
    var r = 0, g = 0, bl = 0, n = 0;
    var pad = 6;
    for (var y = Math.max(0, b.y0 - pad); y < Math.min(H, b.y1 + pad); y++)
      for (var x = Math.max(0, b.x0 - pad); x < Math.min(W, b.x1 + pad); x++) {
        var inside = x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1;
        if (inside || A.isInk(x, y)) continue;
        var c = A.rgb(x, y);
        r += c[0]; g += c[1]; bl += c[2]; n++;
      }
    if (!n) return A.dark ? "#0f172a" : "#ffffff";
    return _certHex(r / n, g / n, bl / n);
  };

  /** Hududdagi "bo'yoq" piksellarining chegara to'rtburchagi. */
  A.inkBox = function (reg) {
    var x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (var y = Math.max(0, reg.y0); y < Math.min(H, reg.y1); y++)
      for (var x = Math.max(0, reg.x0); x < Math.min(W, reg.x1); x++)
        if (A.isInk(x, y)) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    return x1 < 0 ? null : { x0: x0, y0: y0, x1: x1 + 1, y1: y1 + 1 };
  };

  A.lines = _certRuleLines(A);
  return A;
}

function _certHex(r, g, b) {
  var h = function (v) {
    return ("0" + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2);
  };
  return "#" + h(r) + h(g) + h(b);
}

/**
 * Ingichka gorizontal chiziqlar — qiymat yoziladigan "joy"lar.
 * Qalin to'q maydonlar (burchak bezaklari, muhr) chetlab o'tiladi.
 */
function _certRuleLines(A) {
  var W = A.W, H = A.H;

  // 1) Har bir satrdagi UZUN to'q yo'laklar (bitta satrda bir nechta bo'lishi
  //    mumkin — masalan uch ustunning uchta chizig'i bir balandlikda turadi).
  var runs = [];
  for (var y = Math.round(H * 0.1); y < H * 0.98; y++) {
    var cur = 0, st = 0;
    for (var x = 0; x <= W; x++) {
      var ink = x < W && A.isInk(x, y);
      if (ink) {
        if (!cur) st = x;
        cur++;
      } else {
        if (cur >= W * 0.05 && cur <= W * 0.92) runs.push({ y: y, x0: st, x1: st + cur });
        cur = 0;
      }
    }
  }

  // 2) Ustma-ust tushgan yo'laklarni bitta chiziqqa yig'amiz
  var groups = [];
  runs.forEach(function (r) {
    var g = null;
    for (var i = groups.length - 1; i >= 0; i--) {
      var c = groups[i];
      if (r.y - c.y1 > 2) continue;
      var ov = Math.min(r.x1, c.x1) - Math.max(r.x0, c.x0);
      if (ov > (r.x1 - r.x0) * 0.5) {
        g = c;
        break;
      }
    }
    if (g) {
      g.y1 = r.y;
      g.x0 = Math.min(g.x0, r.x0);
      g.x1 = Math.max(g.x1, r.x1);
    } else {
      groups.push({ y0: r.y, y1: r.y, x0: r.x0, x1: r.x1 });
    }
  });

  // 3) Faqat INGICHKA chiziqlar qoladi (qalin bloklar — bezak yoki muhr)
  return groups
    .filter(function (l) {
      if (l.y1 - l.y0 + 1 > 6) return false;
      var ya = l.y0 - 7, yb = l.y1 + 7, c1 = 0, c2 = 0, n = 0;
      for (var x = l.x0; x < l.x1; x += 2) {
        n++;
        if (ya > 0 && A.isInk(x, ya)) c1++;
        if (yb < H && A.isInk(x, yb)) c2++;
      }
      // Yorliq/qiymat chiziqning ustida yoki ostida bo'lishi normal —
      // chegara keng; maqsad: qalin to'q maydonlarni chetlatish.
      return n > 0 && c1 / n < 0.5 && c2 / n < 0.5;
    })
    .map(function (l) {
      return {
        y: (l.y0 + l.y1) / 2,
        x0: l.x0,
        x1: l.x1,
        cx: (l.x0 + l.x1) / 2,
        len: l.x1 - l.x0,
      };
    });
}

/* ── OCR (tesseract.js) ─────────────────────────────────────────────────── */

var _certOcrLib = null;

function _certLoadOcr() {
  if (typeof window.Tesseract !== "undefined") return Promise.resolve(window.Tesseract);
  if (_certOcrLib) return _certOcrLib;
  _certOcrLib = new Promise(function (resolve) {
    var s = document.createElement("script");
    // v5 — standart yo'llari bilan ishlaydi (core va til fayllarini o'zi topadi)
    s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
    s.onload = function () {
      resolve(window.Tesseract || null);
    };
    s.onerror = function () {
      resolve(null);
    };
    document.head.appendChild(s);
  });
  return _certOcrLib;
}

/** OCR uchun rasmni kichraytiramiz — katta blankada tanish sekin kechadi. */
function _certOcrImage(imgEl, maxW) {
  maxW = maxW || 1600;
  var w = Math.min(maxW, imgEl.naturalWidth);
  var h = Math.round((w * imgEl.naturalHeight) / imgEl.naturalWidth);
  var cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  cv.getContext("2d").drawImage(imgEl, 0, 0, w, h);
  return { url: cv.toDataURL("image/png"), w: w };
}

/**
 * Rasmdagi matnlar: {text, norm, x0,y0,x1,y1} — tahlil koordinatasida (1000px).
 *
 * ⚠️ OCR bitta "qator"ga sahifaning butun kengligidagi so'zlarni qo'shib
 * yuboradi (masalan "Kurs nomi  O'qish muddati  Tashkilot" — uchala ustun
 * birga). Shuning uchun SO'ZLAR olinadi va faqat yonma-yon turganlari
 * (oradagi bo'shliq harf balandligidan kichik bo'lsa) bitta iboraga
 * birlashtiriladi — har bir yorliq o'z joyi bilan ajraladi.
 */
function _certOcrPhrases(imgEl, analysisW, onProgress) {
  return _certLoadOcr()
    .then(function (T) {
      if (!T) return null;
      var small = _certOcrImage(imgEl);
      var scale = analysisW / small.w;
      var opts = {
        logger: function (m) {
          if (onProgress && m && m.status === "recognizing text")
            onProgress(Math.round((m.progress || 0) * 100));
        },
      };
      return Promise.resolve(T.createWorker("eng", 1, opts)).then(function (w) {
        return w
          .recognize(small.url, {}, { blocks: true, text: false })
          .then(function (r) {
            var words = [];
            var d = (r && r.data) || {};
            var takeLine = function (l) {
              (l.words || []).forEach(function (wd) {
                if (!wd || !wd.bbox) return;
                var t = String(wd.text || "").trim();
                if (!t) return;
                words.push({
                  text: t,
                  x0: wd.bbox.x0 * scale,
                  y0: wd.bbox.y0 * scale,
                  x1: wd.bbox.x1 * scale,
                  y1: wd.bbox.y1 * scale,
                });
              });
            };
            (d.blocks || []).forEach(function (b) {
              (b.paragraphs || []).forEach(function (p) {
                (p.lines || []).forEach(takeLine);
              });
            });
            // Ba'zi versiyalar `lines` ni ham qaytaradi — bir so'z ikki marta
            // tushmasligi uchun faqat bloklardan hech narsa chiqmasa olamiz.
            if (!words.length) (d.lines || []).forEach(takeLine);
            return w.terminate().then(
              function () {
                return _certGroupWords(words);
              },
              function () {
                return _certGroupWords(words);
              },
            );
          })
          .catch(function () {
            try { w.terminate(); } catch (e) {}
            return null;
          });
      });
    })
    .catch(function () {
      return null;
    });
}

/** Yonma-yon so'zlarni bitta iboraga birlashtiradi (ustunlar aralashmasin). */
function _certGroupWords(words) {
  if (!words || !words.length) return [];

  // 1) So'zlarni QATORLARGA ajratamiz (markazi bir xil balandlikda bo'lganlar)
  var rows = [];
  words
    .slice()
    .sort(function (a, b) {
      return (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2;
    })
    .forEach(function (w) {
      var cy = (w.y0 + w.y1) / 2;
      var h = Math.max(6, w.y1 - w.y0);
      var row = rows[rows.length - 1];
      if (row && Math.abs(cy - row.cy) < h * 0.7) {
        row.items.push(w);
        row.cy = (row.cy * (row.items.length - 1) + cy) / row.items.length;
      } else {
        rows.push({ cy: cy, items: [w] });
      }
    });

  // 2) Har bir qatorda yonma-yon turgan so'zlarni birlashtiramiz
  var out = [];
  rows.forEach(function (row) {
    row.items.sort(function (a, b) {
      return a.x0 - b.x0;
    });
    var cur = null;
    row.items.forEach(function (w) {
      var h = Math.max(6, w.y1 - w.y0);
      if (cur && w.x0 - cur.x1 < h * 1.2) {
        cur.text += " " + w.text;
        cur.x1 = Math.max(cur.x1, w.x1);
        cur.y0 = Math.min(cur.y0, w.y0);
        cur.y1 = Math.max(cur.y1, w.y1);
      } else {
        if (cur) out.push(cur);
        cur = { text: w.text, x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1 };
      }
    });
    if (cur) out.push(cur);
  });

  out.forEach(function (p) {
    p.norm = _certNorm(p.text);
  });
  return out;
}

/** Matnni solishtirish uchun soddalashtiradi: apostrof, bo'shliq, belgilar olib tashlanadi. */
function _certNorm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[‘’ʻʼ'`´]/g, "")
    .replace(/[^a-z0-9Ѐ-ӿ]/g, "");
}


/* ── Yorliqlar lug'ati ──────────────────────────────────────────────────── */

var CERT_WORDS = {
  // Blankadagi NAMUNA matnlar — qiymat aynan shu joyga tushadi (ustiga yamoq)
  namePh: ["ismfamiliya", "ismfamilya", "ismfamiliyasi", "fullname", "имяфамилия"],
  datePh: ["ddmmyyyy", "ddmmgggg", "kkaayyyy", "01012025", "ddmmyy"],
  // YORLIQLAR — qiymat ularning ostidagi chiziq ustiga tushadi
  name: ["fio", "ismisharifi", "ismsharif", "name", "фио"],
  course: ["kursnomi", "kurs", "yonalish", "course", "курс"],
  period: ["oqishmuddati", "oqishdavri", "muddat", "davr", "period", "duration", "срок", "период"],
  date: ["sana", "berilgansana", "date", "дата"],
  no: ["sertifikatraqami", "raqam", "number", "номер"],
  qr: ["sertifikatnitekshirish", "tekshirish", "qrkod", "qr", "verify", "scan"],
  // Bular BIZNIKI EMAS — ular bilan adashtirmaslik kerak
  sign: ["rahbar", "direktor", "mudir", "imzo", "director", "signature", "подпись"],
  org: ["tashkilot", "oquvmarkazi", "markaz", "organization", "организация"],
};

function _certHas(line, list) {
  return list.some(function (k) {
    return line.norm.indexOf(k) !== -1;
  });
}

/* ── Asosiy: rasmni tahlil qilib maydonlarni joylashtirish ───────────────── */

/**
 * @returns Promise<fields> — OCR ishlamasa chiziq/bo'sh joy tahliliga qaytadi.
 */
function certAutoLayoutSmart(imgEl, dataUrl, onProgress) {
  var A;
  try {
    A = _certAnalyze(imgEl);
  } catch (e) {
    return Promise.resolve(certAutoLayout(imgEl));
  }
  return _certOcrPhrases(imgEl, A.W, onProgress).then(function (lines) {
    if (!lines || !lines.length) return certAutoLayout(imgEl); // zaxira
    try {
      return _certPlaceByOcr(A, lines) || certAutoLayout(imgEl);
    } catch (e) {
      return certAutoLayout(imgEl);
    }
  });
}

/** Matn kengligi (px) — 1000px kenglikdagi varaq o'lchovida. */
function _certTextW(text, fl) {
  try {
    _certTextW._cv = _certTextW._cv || document.createElement("canvas");
    var ctx = _certTextW._cv.getContext("2d");
    ctx.font =
      (fl.italic ? "italic " : "") + (fl.bold ? "700 " : "400 ") +
      fl.size + "px " + (CERT_FONTS[fl.font] || CERT_FONTS.sans);
    return ctx.measureText(String(text || "")).width;
  } catch (e) {
    return String(text || "").length * fl.size * 0.52;
  }
}

/** Shriftni maydon kengligiga moslaydi — uzun ism/kurs chegaradan chiqmasin. */
function _certFitFont(fl, sample, maxW) {
  if (!maxW || maxW <= 0) return;
  var guard = 0;
  while (fl.size > 8 && _certTextW(sample, fl) > maxW && guard++ < 80) fl.size -= 1;
}

/** Har bir maydon uchun "eng uzun bo'lishi mumkin" namunaviy qiymat. */
var CERT_SAMPLES = {
  name: "Ismoil Toxirov",
  course: "Frontend Development",
  period: "15-yanvar, 2025-yil — 14-dekabr, 2025-yil",
  date: "8-sentabr, 2026-yil",
  no: "SERT-2026-0001",
};

function _certPlaceByOcr(A, lines) {
  var W = A.W, H = A.H;
  var f = certDefaultFields();
  // Tashxis uchun: qaysi yozuv qaysi maydonga bog'landi (konsoldan ko'rish mumkin)
  var dbg = { phrases: lines.length, rules: A.lines.length, picked: {} };
  window.__certLayoutDebug = dbg;
  var pctX = function (v) {
    return Math.round((v / W) * 1000) / 10;
  };
  var pctY = function (v) {
    return Math.round((v / H) * 1000) / 10;
  };
  // 1000px kenglikdagi varaqda shrift o'lchami (tahlil ham 1000px — 1:1)
  var sizeOf = function (b, k) {
    return Math.max(9, Math.round((b.y1 - b.y0) * (k || 1.12)));
  };

  var signs = lines.filter(function (l) {
    return _certHas(l, CERT_WORDS.sign);
  });
  var orgs = lines.filter(function (l) {
    return _certHas(l, CERT_WORDS.org);
  });

  /** Yorliq ostidagi (yoki ustidagi) eng yaqin chiziq. */
  function ruleNear(box, dir) {
    var cx = (box.x0 + box.x1) / 2;
    var cands = A.lines.filter(function (l) {
      if (l.x0 - 12 > cx || l.x1 + 12 < cx) return false;
      return dir === "up" ? l.y < box.y0 : l.y > box.y1 - 2;
    });
    if (!cands.length) return null;
    cands.sort(function (a, b) {
      return dir === "up" ? b.y - a.y : a.y - b.y;
    });
    var r = cands[0];
    var gap = dir === "up" ? box.y0 - r.y : r.y - box.y1;
    return gap <= H * 0.09 ? r : null;
  }

  /** Qiymatni namunaning O'RNIGA qo'yadi (ustiga fon rangida yamoq tushadi). */
  function putOver(key, box, k) {
    var fl = f[key];
    fl.on = true;
    fl.align = "center";
    fl.x = pctX((box.x0 + box.x1) / 2);
    fl.y = pctY((box.y0 + box.y1) / 2);
    fl.size = sizeOf(box, k);
    fl.color = A.inkColor(box);
    fl.bold = false;
    fl.italic = false;

    // Qiymat namunadan uzunroq bo'lishi mumkin — sahifadan chiqib ketmasin
    var slot = Math.min(W * 0.8, Math.max((box.x1 - box.x0) * 2.2, W * 0.3));
    _certFitFont(fl, CERT_SAMPLES[key] || "", slot);

    // Yamoq: namunaviy yozuvni ham, yangi qiymatni ham to'liq yopsin
    var textW = _certTextW(CERT_SAMPLES[key] || "", fl);
    var wPx = Math.max(box.x1 - box.x0, textW) + (box.x1 - box.x0) * 0.12 + 10;
    var padY = (box.y1 - box.y0) * 0.35 + 3;
    fl.cover = {
      w: Math.min(96, pctX(wPx)),
      h: Math.min(30, pctY(box.y1 - box.y0 + padY * 2)),
      color: A.bgColor(box),
    };
  }

  /** Hududdagi "bo'yoq" ulushi — u yer bo'shmi yoki band. */
  function inkRatio(x0, x1, y0, y1) {
    var n = 0, c = 0;
    for (var y = Math.max(0, Math.round(y0)); y < Math.min(H, Math.round(y1)); y += 2)
      for (var x = Math.max(0, Math.round(x0)); x < Math.min(W, Math.round(x1)); x += 2) {
        n++;
        if (A.isInk(x, y)) c++;
      }
    return n ? c / n : 0;
  }

  /**
   * Qiymatni chiziqqa bog'laydi. Ba'zi blankalarda qiymat chiziq USTIGA
   * yoziladi, ba'zilarida OSTIGA (yorliq → chiziq → qiymat). Shuning uchun
   * chiziqning qaysi tomoni bo'sh ekaniga qarab tanlaymiz.
   */
  function putOnRule(key, label, rule, k) {
    var fl = f[key];
    var size = sizeOf(label, k || 1.1);
    var gap = H * 0.055;
    var below = inkRatio(rule.x0, rule.x1, rule.y + 3, rule.y + gap);
    var above = inkRatio(rule.x0, rule.x1, rule.y - gap, rule.y - 3);
    var useBelow = below < 0.02 && (above > 0.02 || label.y1 <= rule.y + 2);
    fl.on = true;
    fl.align = "center";
    fl.x = pctX(rule.cx);
    fl.y = pctY(useBelow ? rule.y + size * 0.85 : rule.y - size * 0.62);
    fl.size = size;
    fl.color = A.inkColor(label);
    fl.bold = false;
    fl.italic = false;
    fl.cover = null;
    // Qiymat chiziq uzunligiga sig'sin (uzun bo'lsa shrift kichrayadi)
    _certFitFont(fl, CERT_SAMPLES[key] || "", (rule.x1 - rule.x0) * 0.98);
    fl.y = pctY(useBelow ? rule.y + fl.size * 0.85 : rule.y - fl.size * 0.62);
  }

  var used = [];
  function taken(l) {
    return used.indexOf(l) !== -1;
  }

  /* ── ISM ──
     Blankada odatda ikkita "Ism Familiya" bo'ladi: yuqoridagi — talabaniki,
     pastdagi (Rahbar ostida) — direktorniki. Kattarog'i va yuqoridagisi
     tanlanadi, imzo yorlig'i ostidagisi chetlab o'tiladi. */
  var namePh = lines.filter(function (l) {
    if (!_certHas(l, CERT_WORDS.namePh)) return false;
    var underSign = signs.some(function (s) {
      return l.y0 > s.y0 - 2 && l.y0 - s.y1 < H * 0.08 &&
        Math.abs((l.x0 + l.x1) / 2 - (s.x0 + s.x1) / 2) < W * 0.2;
    });
    return !underSign;
  });
  namePh.sort(function (a, b) {
    return b.y1 - b.y0 - (a.y1 - a.y0);
  });
  if (namePh[0]) {
    dbg.picked.name = namePh[0].text;
    putOver("name", namePh[0], 1.15);
    f.name.italic = true;
    f.name.bold = true;
    used.push(namePh[0]);
  } else {
    var nameLbl = lines.filter(function (l) {
      return _certHas(l, CERT_WORDS.name) && !taken(l);
    })[0];
    var r = nameLbl && ruleNear(nameLbl, "down");
    if (r) {
      putOnRule("name", nameLbl, r, 1.4);
      f.name.bold = true;
      used.push(nameLbl);
    }
  }

  /* ── KURS ── */
  var courseLbl = lines.filter(function (l) {
    return _certHas(l, CERT_WORDS.course) && !_certHas(l, CERT_WORDS.org) && !taken(l);
  })[0];
  if (courseLbl) {
    var rc = ruleNear(courseLbl, "down") || ruleNear(courseLbl, "up");
    dbg.picked.course = courseLbl.text + (rc ? " → chiziq y=" + Math.round(rc.y) : " → CHIZIQ YO'Q");
    if (rc) {
      putOnRule("course", courseLbl, rc, 1.5);
      f.course.bold = true;
      used.push(courseLbl);
    }
  }

  /* ── O'QISH DAVRI ── */
  var perLbl = lines.filter(function (l) {
    return _certHas(l, CERT_WORDS.period) && !taken(l);
  })[0];
  if (perLbl) {
    var rp = ruleNear(perLbl, "down") || ruleNear(perLbl, "up");
    dbg.picked.period = perLbl.text + (rp ? " → chiziq y=" + Math.round(rp.y) : " → CHIZIQ YO'Q");
    if (rp) {
      putOnRule("period", perLbl, rp, 1.25);
      used.push(perLbl);
    }
  }

  /* ── SANA ── namuna ("DD.MM.YYYY") ustun, bo'lmasa "Sana" yorlig'i ── */
  var datePh = lines.filter(function (l) {
    return _certHas(l, CERT_WORDS.datePh) && !taken(l);
  })[0];
  if (datePh) {
    dbg.picked.date = datePh.text;
    putOver("date", datePh, 1.1);
    used.push(datePh);
  } else {
    var dateLbl = lines.filter(function (l) {
      return _certHas(l, CERT_WORDS.date) && !taken(l);
    })[0];
    var rd = dateLbl && (ruleNear(dateLbl, "down") || ruleNear(dateLbl, "up"));
    if (rd) {
      putOnRule("date", dateLbl, rd, 1.25);
      used.push(dateLbl);
    }
  }

  /* ── SERTIFIKAT RAQAMI ── blankada joyi bo'lmasa pastki chap burchak ── */
  var noLbl = lines.filter(function (l) {
    return _certHas(l, CERT_WORDS.no) && !taken(l);
  })[0];
  if (noLbl) {
    var rn = ruleNear(noLbl, "down") || ruleNear(noLbl, "up");
    if (rn) putOnRule("no", noLbl, rn, 1.05);
    else putOver("no", noLbl, 1);
    used.push(noLbl);
  } else {
    f.no.x = 16;
    f.no.y = 93;
    f.no.size = 15;
    f.no.align = "center";
    f.no.color = A.dark ? "#e2e8f0" : "#475569";
    f.no.cover = null;
  }

  /* ── QR ── blankadagi QR namunasi topilsa, QR aynan o'sha joyga ── */
  var qrBox = _certFindQrBox(A, lines);
  dbg.picked.qr = qrBox ? "topildi" : "topilmadi";
  if (qrBox) {
    f.qr.on = true;
    f.qr.x = pctX((qrBox.x0 + qrBox.x1) / 2);
    f.qr.y = pctY((qrBox.y0 + qrBox.y1) / 2);
    f.qr.size = Math.round(((qrBox.x1 - qrBox.x0) / W) * 1000) / 10;
    f.qr.cover = {
      w: Math.min(40, pctX(qrBox.x1 - qrBox.x0 + 8)),
      h: Math.min(40, pctY(qrBox.y1 - qrBox.y0 + 8)),
      color: A.bgColor(qrBox),
    };
  } else {
    f.qr.x = 84;
    f.qr.y = 88;
    f.qr.size = 9;
    f.qr.cover = null;
  }

  return f;
}

/**
 * Blankadagi QR namunasini topadi: "tekshirish" yozuvi ustidagi kvadrat,
 * bo'lmasa yuqori burchaklardagi zich kvadrat blok.
 */
function _certFindQrBox(A, lines) {
  var W = A.W, H = A.H;

  // 1) "Sertifikatni tekshirish" kabi yozuv topilsa — QR o'sha yozuv ustida
  var lbl = lines.filter(function (l) {
    return _certHas(l, CERT_WORDS.qr);
  })[0];
  if (lbl) {
    var cx = (lbl.x0 + lbl.x1) / 2;
    var box = A.inkBox({
      x0: cx - W * 0.13,
      x1: cx + W * 0.13,
      y0: Math.max(0, lbl.y0 - H * 0.22),
      y1: lbl.y0 - 3,
    });
    if (box) {
      var bw = box.x1 - box.x0, bh = box.y1 - box.y0;
      if (bw > W * 0.03 && bh > W * 0.03 && bw / bh > 0.6 && bw / bh < 1.7) return box;
    }
  }

  // 2) Yozuv topilmasa — rasmdan QR ga o'xshash KVADRAT qidiramiz.
  //    QR ning ikki belgisi bor: bo'yoq zich VA juda ko'p o'tish (oq↔qora).
  //    Shu ikkinchi shart bezak uchburchagi yoki muhr kabi bir tekis to'q
  //    joylarni chetlab o'tadi.
  var n = (W + 1) * (H + 1);
  var ii = new Int32Array(n), ti = new Int32Array(n);
  for (var y = 0; y < H; y++) {
    var rowI = 0, rowT = 0;
    for (var x = 0; x < W; x++) {
      rowI += A.isInk(x, y) ? 1 : 0;
      var t = 0;
      if (x < W - 2 && Math.abs(A.lum(x, y) - A.lum(x + 2, y)) > 0.2) t = 1;
      if (!t && y < H - 2 && Math.abs(A.lum(x, y) - A.lum(x, y + 2)) > 0.2) t = 1;
      rowT += t;
      ii[(y + 1) * (W + 1) + x + 1] = ii[y * (W + 1) + x + 1] + rowI;
      ti[(y + 1) * (W + 1) + x + 1] = ti[y * (W + 1) + x + 1] + rowT;
    }
  }
  var sum = function (arr, x0, y0, x1, y1) {
    x0 = Math.max(0, Math.round(x0)); y0 = Math.max(0, Math.round(y0));
    x1 = Math.min(W, Math.round(x1)); y1 = Math.min(H, Math.round(y1));
    if (x1 <= x0 || y1 <= y0) return 0;
    return (
      arr[y1 * (W + 1) + x1] - arr[y0 * (W + 1) + x1] -
      arr[y1 * (W + 1) + x0] + arr[y0 * (W + 1) + x0]
    );
  };

  var best = null;
  [0.05, 0.07, 0.09, 0.12, 0.15].forEach(function (fr) {
    var sz = Math.round(W * fr);
    if (sz < 20 || sz > H * 0.6) return;
    var step = Math.max(4, Math.round(sz / 4));
    for (var y = 0; y + sz <= H; y += step) {
      for (var x = 0; x + sz <= W; x += step) {
        var area = sz * sz;
        var dens = sum(ii, x, y, x + sz, y + sz) / area;
        if (dens < 0.22 || dens > 0.88) continue;
        var tr = sum(ti, x, y, x + sz, y + sz) / area;
        if (tr < 0.18) continue; // bir tekis to'q maydon — QR emas
        if (!best || tr > best.tr) best = { x: x, y: y, sz: sz, tr: tr, dens: dens };
      }
    }
  });
  if (!best) return null;

  // Topilgan kvadratni haqiqiy chegarasigacha kengaytiramiz
  var b = { x0: best.x, y0: best.y, x1: best.x + best.sz, y1: best.y + best.sz };
  var grow = 0;
  while (grow < best.sz * 0.6) {
    var g = 3, changed = false;
    if (b.x0 - g > 0 && sum(ii, b.x0 - g, b.y0, b.x0, b.y1) / (g * (b.y1 - b.y0)) > 0.25) { b.x0 -= g; changed = true; }
    if (b.x1 + g < W && sum(ii, b.x1, b.y0, b.x1 + g, b.y1) / (g * (b.y1 - b.y0)) > 0.25) { b.x1 += g; changed = true; }
    if (b.y0 - g > 0 && sum(ii, b.x0, b.y0 - g, b.x1, b.y0) / (g * (b.x1 - b.x0)) > 0.25) { b.y0 -= g; changed = true; }
    if (b.y1 + g < H && sum(ii, b.x0, b.y1, b.x1, b.y1 + g) / (g * (b.x1 - b.x0)) > 0.25) { b.y1 += g; changed = true; }
    if (!changed) break;
    grow += g;
  }
  var w2 = b.x1 - b.x0, h2 = b.y1 - b.y0;
  if (w2 / h2 < 0.6 || w2 / h2 > 1.7) return null;
  return b;
}

/* ─── Shablon rasmini yuklash ─────────────────────────────────────────────── */

var _certUpload = null; // {dataUrl, w, h, name}

function certOpenTplUpload() {
  _certUpload = null;
  var body =
    '<div class="fg"><label>Shablon nomi <span class="req">*</span></label>' +
    '<input id="f-tpl-name" placeholder="Masalan: Asosiy blanka (2026)"></div>' +
    '<div class="fg"><label>Shablon rasmi <span class="req">*</span></label>' +
    '<div id="cert-drop" style="border:2px dashed var(--border2);border-radius:var(--r-lg);padding:26px;text-align:center;cursor:pointer;background:var(--bg3)">' +
    '<div style="font-size:34px">🖼</div>' +
    '<div style="font-size:13px;font-weight:700;color:var(--text);margin-top:6px">Rasmni tanlang yoki shu yerga tashlang</div>' +
    '<div style="font-size:11.5px;color:var(--text3);margin-top:4px">PNG yoki JPG · eng yaxshisi 2000px kenglikdagi tayyor blanka · 8MB gacha</div>' +
    "</div>" +
    '<input type="file" id="cert-file" accept="image/png,image/jpeg,image/webp" style="display:none"></div>' +
    '<div id="cert-upload-prev" style="width:100%;overflow:hidden;border-radius:var(--r-md)"></div>' +
    '<div style="font-size:12px;color:var(--text3);margin-top:10px;line-height:1.6">🤖 Rasm ' +
    "<b>avtomatik o'qiladi</b>: blankadagi «Ism Familiya», «Kurs nomi», «O'qish muddati», " +
    "«Sana», «DD.MM.YYYY» kabi yozuvlar va chiziqlar topilib, maydonlar o'z joyiga qo'yiladi " +
    "(namunaviy yozuvlar ustiga fon rangi tushadi). Qo'lda joylashtirish shart emas — " +
    "xohlasangiz keyin tuzatasiz.</div>";

  _certOpenModal("🖼 Shablon rasmini yuklash", body, { label: "⬆️ Yuklash", onClick: certSaveTplUpload }, true);

  setTimeout(function () {
    var dz = document.getElementById("cert-drop");
    var fi = document.getElementById("cert-file");
    if (!dz || !fi) return;
    dz.addEventListener("click", function () {
      fi.click();
    });
    dz.addEventListener("dragover", function (e) {
      e.preventDefault();
      dz.style.borderColor = "var(--accent)";
    });
    dz.addEventListener("dragleave", function () {
      dz.style.borderColor = "";
    });
    dz.addEventListener("drop", function (e) {
      e.preventDefault();
      dz.style.borderColor = "";
      _certPickImage(e.dataTransfer.files[0]);
    });
    fi.addEventListener("change", function () {
      _certPickImage(fi.files[0]);
    });
  }, 40);
}

function _certPickImage(file) {
  if (!file) return;
  if (!/^image\//.test(file.type)) {
    if (typeof toast === "function") toast("⚠️ Faqat rasm (PNG/JPG) yuklanadi");
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    if (typeof toast === "function") toast("⚠️ Rasm 8MB dan kichik bo'lsin");
    return;
  }
  var reader = new FileReader();
  reader.onload = function (e) {
    var url = e.target.result;
    var im = new Image();
    im.onload = function () {
      _certUpload = {
        dataUrl: url,
        w: im.naturalWidth,
        h: im.naturalHeight,
        name: file.name,
        // Tez zaxira joylashuv — tahlil tugaguncha shu turadi
        fields: certAutoLayout(im),
      };
      var prev = document.getElementById("cert-upload-prev");
      var status = function (txt) {
        var el = document.getElementById("cert-upload-status");
        if (el) el.innerHTML = txt;
      };
      if (prev) {
        prev.innerHTML =
          '<img src="' + url + '" style="width:100%;display:block;border:1px solid var(--border)">' +
          '<div id="cert-upload-status" style="font-size:11.5px;color:var(--text3);padding:6px 2px">✅ ' +
          _certEsc(file.name) + " · " + im.naturalWidth + "×" + im.naturalHeight + " px</div>";
      }

      // Blanka O'QILADI: yozuvlar (OCR) va chiziqlar topilib, maydonlar
      // o'z joyiga qo'yiladi. Admin qo'lda hech narsa surmaydi.
      status("🔎 Blanka o'qilmoqda — maydon joylari aniqlanmoqda...");
      _certUpload.ready = certAutoLayoutSmart(im, url, function (p) {
        status("🔎 Blanka o'qilmoqda... " + p + "%");
      })
        .then(function (fields) {
          if (_certUpload) _certUpload.fields = fields;
          status("✅ Joylashuv aniqlandi — «Yuklash» tugmasini bosing");
          return fields;
        })
        .catch(function () {
          status("⚠️ Tahlil bo'lmadi — taxminiy joylashuv qo'yildi");
        });
      var nm = document.getElementById("f-tpl-name");
      if (nm && !nm.value.trim())
        nm.value = String(file.name).replace(/\.[^.]+$/, "");
    };
    im.onerror = function () {
      if (typeof toast === "function") toast("⚠️ Rasm o'qilmadi");
    };
    im.src = url;
  };
  reader.readAsDataURL(file);
}

function certSaveTplUpload() {
  var nm = (document.getElementById("f-tpl-name") || {}).value || "";
  nm = nm.trim();
  if (!nm) {
    if (typeof toast === "function") toast("⚠️ Shablon nomini yozing");
    return;
  }
  if (!_certUpload) {
    if (typeof toast === "function") toast("⚠️ Avval rasmni tanlang");
    return;
  }

  var btn = document.getElementById("cert-modal-ok");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "⏳ Yuklanmoqda...";
  }

  var id = typeof newId === "function" ? newId() : Date.now();
  var blobId = "certtpl_" + id;
  var up = _certUpload;

  // Blanka tahlili hali tugamagan bo'lsa — kutamiz (joylashuv shundan chiqadi)
  Promise.resolve(up.ready)
    .then(function () {
      return certUploadTplImage(blobId, up.dataUrl, up.name);
    })
    .then(function (d) {
      if (!d || !d.ok) throw new Error((d && d.error) || "yuklanmadi");
      certTemplatesAll().push({
        id: id,
        name: nm,
        blobId: blobId,
        w: up.w,
        h: up.h,
        fields: up.fields || certDefaultFields(),
        createdAt: new Date().toISOString(),
      });
      if (typeof saveData === "function") saveData();
      _certUpload = null;
      certCloseModal();
      renderCertTemplates();
      if (typeof toast === "function")
        toast("✅ Shablon tayyor — maydonlar avtomatik joylashtirildi");
      // Muharrir ATAYIN ochilmaydi: joylashuv o'zi hisoblangan, admin uchun
      // qo'shimcha ish yo'q. Tuzatmoqchi bo'lsa — "🎯 Maydonlarni joylash".
    })
    .catch(function (e) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "⬆️ Yuklash";
      }
      if (typeof toast === "function") toast("🚫 Yuklanmadi: " + e.message);
    });
}

async function certDeleteTemplate(id) {
  var t = certTplById(id);
  if (!t) return;
  var used = certAll().filter(function (c) {
    return String(c.templateId) === String(id);
  });
  if (used.length) {
    crmAlert(
      "«" + t.name + "» shabloni " + used.length +
        " ta sertifikatda ishlatilyapti.\n\nAvval o'sha sertifikatlarni boshqa shablonga o'tkazing yoki o'chiring.",
    );
    return;
  }
  if (!(await crmConfirm("«" + t.name + "» shabloni o'chirilsinmi?", { danger: true }))) return;
  var list = certTemplatesAll();
  var i = list.findIndex(function (x) {
    return String(x.id) === String(id);
  });
  if (i >= 0) list.splice(i, 1);
  if (t.blobId) certDeleteTplImage(t.blobId);
  if (typeof saveData === "function") saveData();
  renderCertTemplates();
  if (typeof toast === "function") toast("🗑 Shablon o'chirildi");
}

/* ─── Maydonlarni joylashtirish (sudrab qo'yish) ──────────────────────────── */

var _certEdTpl = null; // tahrirlanayotgan NUSXA (Saqlash bosilgunicha asliga tegmaydi)
var _certEdSel = "name";

function certOpenTplEditor(id) {
  var t = certTplById(id);
  if (!t) return;
  _certEdTpl = JSON.parse(JSON.stringify(t));
  if (!_certEdTpl.fields) _certEdTpl.fields = certDefaultFields();
  CERT_FIELDS.forEach(function (m) {
    _certEdTpl.fields[m.key] = _certField(_certEdTpl, m.key);
  });
  _certEdSel = "name";

  var body =
    '<div class="fg"><label>Shablon nomi</label><input id="f-tpl-name2" value="' + _certEsc(t.name) + '"></div>' +
    '<div style="font-size:12.5px;color:var(--text3);margin-bottom:8px;line-height:1.6">' +
    "💡 Maydonni <b>sichqoncha bilan sudrab</b> rasmning kerakli joyiga qo'ying. " +
    "Tanlangan maydonning shrifti, o'lchami va rangi pastdan sozlanadi. " +
    "Bu yerda ko'rsatilgan matnlar — namuna; sertifikat yaratilganda o'rniga haqiqiy ma'lumot tushadi.</div>" +
    '<div style="display:flex;justify-content:flex-end;margin-bottom:8px">' +
    '<button class="btn btn-sm" onclick="certEdAutoLayout()">🪄 Avtomatik joylashtirish</button></div>' +
    '<div id="cert-ed-wrap" style="width:100%;overflow:hidden;border:1px solid var(--border);border-radius:var(--r-md);background:var(--bg3)"></div>' +
    '<div id="cert-ed-ctrl" style="margin-top:12px"></div>';

  _certOpenModal("🎯 " + t.name + " — maydonlarni joylashtirish", body, {
    label: "💾 Saqlash",
    onClick: certSaveTplEditor,
  }, true);

  setTimeout(function () {
    certTplImage(_certEdTpl).then(_certEdRender);
  }, 40);
}

/** Maydoncha (rasm + sudraladigan maydonlar) va boshqaruv panelini chizadi. */
function _certEdRender() {
  _certEdStage();
  _certEdCtrl();
}

/** Faqat maydonchani qayta chizadi — boshqaruvdagi fokus/qiymatlarga tegmaydi. */
function _certEdStage() {
  var wrap = document.getElementById("cert-ed-wrap");
  if (!wrap || !_certEdTpl) return;
  var sz = certSize(_certEdTpl);
  var img = _certImgCache[_certEdTpl.blobId] || "";

  var covers = CERT_FIELDS.map(function (m) {
    var f = _certEdTpl.fields[m.key];
    if (!f.on || !f.cover || !f.cover.w) return "";
    return (
      '<div style="position:absolute;left:' + f.x + "%;top:" + f.y +
      '%;transform:translate(-50%,-50%);width:' + f.cover.w + "%;height:" + f.cover.h +
      '%;background:' + (f.cover.color || "#fff") + '"></div>'
    );
  }).join("");

  var boxes = CERT_FIELDS.map(function (m) {
    var f = _certEdTpl.fields[m.key];
    var sel = _certEdSel === m.key;
    var ring =
      "outline:" + (sel ? "2px solid #2563eb" : "1px dashed rgba(37,99,235,.55)") +
      ";outline-offset:3px;cursor:move";
    if (m.key === "qr") {
      var side = (f.size / 100) * sz.w;
      return (
        '<div data-k="qr" style="position:absolute;left:' + f.x + "%;top:" + f.y +
        '%;transform:translate(-50%,-50%);width:' + side + "px;height:" + side +
        'px;background:rgba(15,23,42,.08);display:flex;align-items:center;justify-content:center;' +
        "font:600 13px system-ui,sans-serif;color:#0f172a;" + ring +
        ";opacity:" + (f.on ? 1 : 0.35) + '">🔳 QR</div>'
      );
    }
    return (
      '<div data-k="' + m.key + '" style="' + _certFieldStyle(f) + ";" + ring +
      ";opacity:" + (f.on ? 1 : 0.35) + '">' + _certEsc(m.sample) + "</div>"
    );
  }).join("");

  wrap.innerHTML =
    '<div id="cert-ed-stage" style="position:relative;width:' + sz.w + "px;height:" + sz.h +
    'px;background:#fff;overflow:hidden">' +
    (img
      ? '<img src="' + img + '" alt="" style="position:absolute;inset:0;width:100%;height:100%;display:block;-webkit-user-drag:none;user-select:none">'
      : '<div style="position:absolute;inset:0;background:#fff"></div>') +
    covers +
    boxes +
    "</div>";

  certFitPreview("cert-ed-wrap");

  // Sudrash va tanlash
  var stage = document.getElementById("cert-ed-stage");
  CERT_FIELDS.forEach(function (m) {
    var el = stage.querySelector('[data-k="' + m.key + '"]');
    if (!el) return;
    var start = function (e) {
      _certEdSel = m.key;
      _certEdDrag(e, m.key);
    };
    el.addEventListener("mousedown", start);
    el.addEventListener("touchstart", start, { passive: false });
  });
}

function _certEdDrag(e, key) {
  e.preventDefault();
  var stage = document.getElementById("cert-ed-stage");
  var el = stage && stage.querySelector('[data-k="' + key + '"]');
  var f = _certEdTpl.fields[key];
  if (!stage || !el) return;

  // Tanlovni darrov ko'rsatamiz (boshqaruv paneli ham yangilanadi)
  _certEdCtrl();
  CERT_FIELDS.forEach(function (m) {
    var b = stage.querySelector('[data-k="' + m.key + '"]');
    if (b)
      b.style.outline =
        m.key === key ? "2px solid #2563eb" : "1px dashed rgba(37,99,235,.55)";
  });

  var move = function (ev) {
    var p = ev.touches && ev.touches[0] ? ev.touches[0] : ev;
    var r = stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    var x = ((p.clientX - r.left) / r.width) * 100;
    var y = ((p.clientY - r.top) / r.height) * 100;
    f.x = Math.max(0, Math.min(100, Math.round(x * 10) / 10));
    f.y = Math.max(0, Math.min(100, Math.round(y * 10) / 10));
    el.style.left = f.x + "%";
    el.style.top = f.y + "%";
    if (ev.cancelable) ev.preventDefault();
  };
  var up = function () {
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", up);
    document.removeEventListener("touchmove", move);
    document.removeEventListener("touchend", up);
    _certEdCtrl(); // x/y maydonlari yangilansin
  };
  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", up);
  document.addEventListener("touchmove", move, { passive: false });
  document.addEventListener("touchend", up);
}

/** Tanlangan maydon sozlamalari. */
function _certEdCtrl() {
  var box = document.getElementById("cert-ed-ctrl");
  if (!box || !_certEdTpl) return;
  var key = _certEdSel;
  var f = _certEdTpl.fields[key];
  var meta = CERT_FIELDS.find(function (m) {
    return m.key === key;
  }) || CERT_FIELDS[0];
  var isQr = key === "qr";

  var chips = CERT_FIELDS.map(function (m) {
    var on = _certEdTpl.fields[m.key].on;
    var act = m.key === key;
    return (
      '<button class="btn btn-sm' + (act ? " btn-primary" : "") +
      '" onclick="certEdSelect(\'' + m.key + '\')" style="opacity:' + (on ? 1 : 0.5) + '">' +
      _certEsc(m.label) + "</button>"
    );
  }).join("");

  var fontOpts = [["serif", "Serif (Georgia)"], ["sans", "Sans (Segoe UI)"], ["mono", "Mono (JetBrains)"]]
    .map(function (o) {
      return '<option value="' + o[0] + '"' + (f.font === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
    })
    .join("");
  var alignOpts = [["left", "⬅️ Chapga"], ["center", "↔️ Markazga"], ["right", "➡️ O'ngga"]]
    .map(function (o) {
      return '<option value="' + o[0] + '"' + (f.align === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
    })
    .join("");

  box.innerHTML =
    '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">' + chips + "</div>" +
    '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--r-md);padding:12px">' +
    '<div style="font-size:13px;font-weight:800;color:var(--text);margin-bottom:10px">' +
    _certEsc(meta.label) + " sozlamalari</div>" +
    '<label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:10px;cursor:pointer">' +
    '<input type="checkbox" ' + (f.on ? "checked" : "") +
    ' onchange="certEdSet(\'on\',this.checked)" style="width:17px;height:17px">Shablonda ko\'rsatilsin</label>' +
    '<div class="form-row"><div class="fg"><label>Gorizontal (%)</label>' +
    '<input type="number" step="0.5" min="0" max="100" value="' + f.x + '" oninput="certEdSet(\'x\',this.value)"></div>' +
    '<div class="fg"><label>Vertikal (%)</label>' +
    '<input type="number" step="0.5" min="0" max="100" value="' + f.y + '" oninput="certEdSet(\'y\',this.value)"></div></div>' +
    (isQr
      ? '<div class="fg"><label>QR o\'lchami: <b id="cert-ed-szlbl">' + f.size + '%</b> (rasm kengligiga nisbatan)</label>' +
        '<input type="range" min="4" max="40" step="0.5" value="' + f.size + '" oninput="certEdSet(\'size\',this.value)" style="width:100%"></div>'
      : '<div class="fg"><label>Shrift o\'lchami: <b id="cert-ed-szlbl">' + f.size + "px</b></label>" +
        '<input type="range" min="8" max="120" step="1" value="' + f.size + '" oninput="certEdSet(\'size\',this.value)" style="width:100%"></div>' +
        '<div class="form-row"><div class="fg"><label>Shrift</label><select onchange="certEdSet(\'font\',this.value)">' + fontOpts + "</select></div>" +
        '<div class="fg"><label>Joylashuv nuqtasi</label><select onchange="certEdSet(\'align\',this.value)">' + alignOpts + "</select></div></div>" +
        '<div class="form-row"><div class="fg"><label>Rang</label>' +
        '<input type="color" value="' + f.color + '" oninput="certEdSet(\'color\',this.value)" style="height:38px;padding:2px"></div>' +
        '<div class="fg"><label>Uslub</label><div style="display:flex;gap:14px;padding:9px 0">' +
        '<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer"><input type="checkbox" ' +
        (f.bold ? "checked" : "") + ' onchange="certEdSet(\'bold\',this.checked)" style="width:16px;height:16px"><b>Qalin</b></label>' +
        '<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer"><input type="checkbox" ' +
        (f.italic ? "checked" : "") + ' onchange="certEdSet(\'italic\',this.checked)" style="width:16px;height:16px"><i>Qiya</i></label>' +
        "</div></div></div>") +
    "</div>";
}

function certEdSelect(key) {
  _certEdSel = key;
  _certEdRender();
}

function certEdSet(prop, val) {
  if (!_certEdTpl) return;
  var f = _certEdTpl.fields[_certEdSel];
  if (prop === "x" || prop === "y" || prop === "size") {
    var n = parseFloat(val);
    if (isNaN(n)) return;
    f[prop] = prop === "size" ? n : Math.max(0, Math.min(100, n));
    var lbl = document.getElementById("cert-ed-szlbl");
    if (prop === "size" && lbl) lbl.textContent = f.size + (_certEdSel === "qr" ? "%" : "px");
  } else {
    f[prop] = val;
  }
  // ⚠️ Faqat maydoncha qayta chiziladi: boshqaruv paneli ham qayta chizilsa,
  // surgich (range) yoki rang tanlagichdagi fokus har harakatda uzilib qolardi.
  _certEdStage();
}

/** Maydonlarni rasm bo'yicha qaytadan avtomatik joylashtiradi. */
function certEdAutoLayout() {
  if (!_certEdTpl) return;
  var src = _certImgCache[_certEdTpl.blobId];
  if (!src) {
    if (typeof toast === "function") toast("⚠️ Shablon rasmi hali yuklanmadi");
    return;
  }
  var im = new Image();
  im.onload = function () {
    if (typeof toast === "function") toast("🔎 Blanka o'qilmoqda...");
    certAutoLayoutSmart(im, src).then(function (fields) {
      _certEdTpl.fields = fields;
      _certEdRender();
      if (typeof toast === "function") toast("🪄 Maydonlar joylashtirildi");
    });
  };
  im.src = src;
}

function certSaveTplEditor() {
  if (!_certEdTpl) return;
  var t = certTplById(_certEdTpl.id);
  if (!t) return;
  var nm = (document.getElementById("f-tpl-name2") || {}).value || "";
  if (nm.trim()) t.name = nm.trim();
  t.fields = JSON.parse(JSON.stringify(_certEdTpl.fields));
  if (typeof saveData === "function") saveData();
  certCloseModal();
  renderCertTemplates();
  renderCertificates();
  if (typeof toast === "function") toast("💾 Shablon saqlandi");
  _certEdTpl = null;
}

/* ══════════════════════════════════════════════════════════════════════════
   ADMIN — SERTIFIKATLAR RO'YXATI
   ══════════════════════════════════════════════════════════════════════════ */

function updateCertCount() {
  var el = document.getElementById("nc-certificates");
  if (el) el.textContent = certAll().length;
}

function renderCertificates() {
  var box = document.getElementById("cert-list");
  if (!box) return;
  updateCertCount();
  _certFillTplFilter();

  var q = (document.getElementById("s-cert") || {}).value || "";
  q = q.trim().toLowerCase();
  var tplFilter = (document.getElementById("filter-cert-tpl") || {}).value || "";

  var list = certAll()
    .filter(function (c) {
      if (tplFilter && String(c.templateId) !== String(tplFilter)) return false;
      if (!q) return true;
      return (
        String(c.name || "").toLowerCase().indexOf(q) !== -1 ||
        String(c.course || "").toLowerCase().indexOf(q) !== -1 ||
        String(c.no || "").toLowerCase().indexOf(q) !== -1
      );
    })
    .slice()
    .sort(function (a, b) {
      return String(b.issueDate || "").localeCompare(String(a.issueDate || ""));
    });

  if (!list.length) {
    var noTpl = !certTemplatesAll().length;
    box.innerHTML =
      '<div style="text-align:center;padding:52px 20px;color:var(--text3)">' +
      '<div style="font-size:46px;opacity:.35">🎖</div>' +
      '<div style="font-size:14px;font-weight:800;color:var(--text);margin-top:8px">' +
      (certAll().length ? "Hech nima topilmadi" : "Hali sertifikat yaratilmagan") +
      "</div>" +
      '<div style="font-size:12px;margin-top:4px;max-width:460px;margin-left:auto;margin-right:auto;line-height:1.6">' +
      (noTpl
        ? "Avval <b>🎨 Shablonlar</b> bo'limida sertifikat blankasini rasm qilib yuklang va " +
          "maydonlarni joylashtiring — keyin shu yerda sertifikat yaratasiz."
        : "\"+ Sertifikat yaratish\" tugmasini bosing — ma'lumotlarni to'ldirasiz, ular " +
          "shablon rasmidagi o'z joyiga tushadi va sertifikat talabaning panelida paydo bo'ladi.") +
      "</div></div>";
    return;
  }

  box.innerHTML = list
    .map(function (c) {
      var tpl = c.templateId ? certTplById(c.templateId) : null;
      var owner = c.studentId
        ? '<span style="color:var(--teal-text)">👤 Talaba paneliga ulangan</span>'
        : '<span style="color:var(--text3)">👤 Talabaga bog\'lanmagan</span>';
      return (
        '<div class="list-item" style="display:flex;align-items:center;gap:14px;padding:12px 16px;border-bottom:1px solid var(--border)">' +
        '<div style="width:44px;height:44px;border-radius:12px;background:var(--accent-light);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">🎖</div>' +
        '<div style="flex:1;min-width:0">' +
        '<div style="font-size:14px;font-weight:800;color:var(--text)">' + _certEsc(c.name) + "</div>" +
        '<div style="font-size:12px;color:var(--text3);margin-top:2px">' +
        "📚 " + _certEsc(c.course) + " · 🗓 " + _certEsc(certPeriodText(c)) +
        " · 📅 " + _certEsc(_certDate(c.issueDate)) + "</div>" +
        '<div style="font-size:11px;color:var(--text3);margin-top:3px;display:flex;gap:12px;flex-wrap:wrap">' +
        '<span style="font-family:\'JetBrains Mono\',monospace;font-weight:700;color:var(--accent-text)">' + _certEsc(c.no) + "</span>" +
        "<span>🖼 " + _certEsc(tpl ? tpl.name : "shablon topilmadi") + "</span>" +
        "<span>" + (c.qr === false ? "QR yo'q" : "🔳 QR bor") + "</span>" +
        owner +
        "</div></div>" +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">' +
        '<button class="btn btn-sm" onclick="certPreview(' + c.id + ')">👁 Ko\'rish</button>' +
        '<button class="btn btn-sm" onclick="certPrint(' + c.id + ')">🖨 Chop etish</button>' +
        '<button class="btn btn-sm" onclick="certCopyLink(' + c.id + ')">🔗 Havola</button>' +
        '<button class="btn btn-sm" onclick="openCertModal(' + c.id + ')">✏️</button>' +
        '<button class="btn btn-sm" onclick="deleteCertificate(' + c.id + ')">🗑</button>' +
        "</div></div>"
      );
    })
    .join("");
}

/** Filtr ro'yxatini yuklangan shablonlar bilan to'ldiradi. */
function _certFillTplFilter() {
  var sel = document.getElementById("filter-cert-tpl");
  if (!sel) return;
  var cur = sel.value;
  sel.innerHTML =
    '<option value="">Barcha shablonlar</option>' +
    certTemplatesAll()
      .map(function (t) {
        return '<option value="' + t.id + '">🖼 ' + _certEsc(t.name) + "</option>";
      })
      .join("");
  sel.value = cur;
}

function certCopyLink(id) {
  var c = certById(id);
  if (!c) return;
  var url = certPublicUrl(c);
  try {
    navigator.clipboard.writeText(url);
    if (typeof toast === "function") toast("🔗 Havola nusxalandi");
  } catch (e) {
    // Clipboard ruxsat etilmagan bo'lsa — havolani ko'rsatamiz, foydalanuvchi
    // o'zi nusxalasin (oyna ichidagi matnni belgilash mumkin).
    crmAlert(url, { title: "🔗 Sertifikat havolasi" });
  }
}

function certPreview(id) {
  var c = certById(id);
  if (!c) return;
  _certInjectStyles();
  var url = certPublicUrl(c);
  var item = function (lbl, val) {
    return '<div class="cert-view-item"><span>' + lbl + "</span><b>" + _certEsc(val) + "</b></div>";
  };

  _certOpenModal(
    "🎖 " + (c.name || "Sertifikat"),
    '<div id="cert-view-wrap" style="width:100%;overflow:hidden;border-radius:8px;box-shadow:0 4px 18px rgba(0,0,0,.18)"></div>' +
      '<div class="cert-view-meta">' +
      item("👤 Ism familya", c.name || "—") +
      item("📚 Kurs", c.course || "—") +
      item("🗓 O'qish davri", certPeriodText(c)) +
      item("📅 Berilgan sana", _certDate(c.issueDate)) +
      item("🔢 Raqam", c.no || "—") +
      "</div>" +
      '<div class="cert-link">🔳 QR skaner qilinganda ochiladi: <code>' + _certEsc(url) + "</code>" +
      '<button class="btn btn-sm" onclick="certCopyLink(' + c.id + ')">Nusxalash</button></div>',
    { label: "⬇️ Yuklab olish / chop etish", onClick: function () { certPrint(c.id); } },
    true,
  );
  setTimeout(function () { certPaint("cert-view-wrap", c); }, 30);
}

/* ─── Sertifikat yaratish / tahrirlash ────────────────────────────────────── */

var _certEditId = null;

function _certTodayStr() {
  if (typeof todayStr === "function") return todayStr();
  var d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function openCertModal(id) {
  var c = id ? certById(id) : null;
  _certEditId = c ? c.id : null;

  var tpls = certTemplatesAll();
  if (!tpls.length) {
    _certOpenModal(
      "🖼 Avval shablon kerak",
      '<div style="text-align:center;padding:24px 10px">' +
        '<div style="font-size:44px">🖼</div>' +
        '<div style="font-size:14px;font-weight:800;color:var(--text);margin-top:8px">Shablon yuklanmagan</div>' +
        '<div style="font-size:12.5px;color:var(--text3);margin-top:6px;line-height:1.6">' +
        "Sertifikat blankasini rasm qilib yuklang va maydonlarni joylashtiring — " +
        "shundan keyin sertifikat yaratish mumkin bo'ladi.</div></div>",
      { label: "🖼 Shablon yuklash", onClick: function () { certOpenTplUpload(); } },
    );
    return;
  }

  var students = (window.D && Array.isArray(D.students) ? D.students : [])
    .slice()
    .sort(function (a, b) {
      return String(a.name || "").localeCompare(String(b.name || ""));
    });

  var stOpts =
    '<option value="">— Talabaga bog\'lamaslik —</option>' +
    students
      .map(function (s) {
        var g = (window.D && D.groups ? D.groups : []).find(function (x) {
          return x.id === s.groupId;
        });
        return (
          '<option value="' + s.id + '"' +
          (c && String(c.studentId) === String(s.id) ? " selected" : "") +
          ">" + _certEsc(s.name) + (g ? " — " + _certEsc(g.course || g.name) : "") + "</option>"
        );
      })
      .join("");

  var curTpl = c && c.templateId ? String(c.templateId) : String(tpls[0].id);
  var tplOpts = tpls
    .map(function (t) {
      return '<option value="' + t.id + '"' + (curTpl === String(t.id) ? " selected" : "") +
        ">🖼 " + _certEsc(t.name) + "</option>";
    })
    .join("");

  var courseList = (window.D && D.courses ? D.courses : [])
    .map(function (x) { return '<option value="' + _certEsc(x.name) + '">'; })
    .join("");

  var body =
    '<div style="background:var(--accent-light);border-radius:var(--r-md);padding:10px 12px;font-size:12.5px;color:var(--accent-text);margin-bottom:12px;line-height:1.6">' +
    "💡 Talabani tanlang — ism, kurs, o'qish davri, raqam va sana <b>avtomatik</b> to'ladi. " +
    "Butun guruhga birdaniga berish uchun: <b>🎓 Guruhga sertifikat berish</b>.</div>" +
    '<div class="fg"><label>👤 Talaba — tanlansa hamma maydon avtomatik to\'ladi</label>' +
    '<select id="f-cert-student" onchange="_certFillFromStudent()">' + stOpts + "</select></div>" +
    '<div class="form-row">' +
    '<div class="fg"><label>Ism familya <span class="req">*</span></label>' +
    '<input id="f-cert-name" value="' + _certEsc(c ? c.name : "") + '" placeholder="Jasur Mirzayev" oninput="_certLivePreview()"></div>' +
    '<div class="fg"><label>Kurs <span class="req">*</span></label>' +
    '<input id="f-cert-course" list="cert-course-list" value="' + _certEsc(c ? c.course : "") + '" placeholder="Frontend Development" oninput="_certLivePreview()">' +
    '<datalist id="cert-course-list">' + courseList + "</datalist></div>" +
    "</div>" +
    '<div class="form-row">' +
    '<div class="fg"><label>Sertifikat raqami <span class="req">*</span></label>' +
    '<input id="f-cert-no" value="' + _certEsc(c ? c.no : certNextNo()) + '" style="font-family:\'JetBrains Mono\',monospace" oninput="_certLivePreview()"></div>' +
    '<div class="fg"><label>📅 Berilgan sana <span class="req">*</span></label>' +
    '<input type="date" id="f-cert-date" value="' + _certEsc(c ? c.issueDate : _certTodayStr()) + '" onchange="_certLivePreview()"></div>' +
    "</div>" +
    '<div class="modal-section-label">🗓 O\'qish davri</div>' +
    '<div class="form-row">' +
    '<div class="fg"><label>Boshlangan</label><input type="date" id="f-cert-from" value="' + _certEsc(c ? c.periodFrom : "") + '" onchange="_certLivePreview()"></div>' +
    '<div class="fg"><label>Tugagan</label><input type="date" id="f-cert-to" value="' + _certEsc(c ? c.periodTo : "") + '" onchange="_certLivePreview()"></div>' +
    "</div>" +
    '<div class="form-row">' +
    '<div class="fg"><label>🖼 Shablon</label><select id="f-cert-tpl" onchange="_certLivePreview()">' + tplOpts + "</select></div>" +
    '<div class="fg"><label>🔳 QR kod</label>' +
    '<label style="display:flex;align-items:center;gap:8px;font-size:13px;padding:9px 0;cursor:pointer">' +
    '<input type="checkbox" id="f-cert-qr" ' + (!c || c.qr !== false ? "checked" : "") + ' onchange="_certLivePreview()" style="width:17px;height:17px">' +
    "Sertifikatga QR kod qo'yilsin</label></div>" +
    "</div>" +
    '<div style="font-size:12px;color:var(--text3);margin:-4px 0 10px">💡 QR skaner qilinganda shu sertifikatning ' +
    "ma'lumotlari ochiladi (ism, kurs, raqam, davr, sana) — har bir sertifikat uchun alohida havola.</div>" +
    '<div class="modal-section-label">👁 Shablonda qanday chiqishi</div>' +
    '<div style="max-width:560px;margin:0 auto">' +
    '<div id="cert-form-preview" style="width:100%;overflow:hidden;border:1px solid var(--border);border-radius:var(--r-md)"></div>' +
    "</div>";

  _certOpenModal(c ? "✏️ Sertifikatni tahrirlash" : "🎖 Yangi sertifikat", body, {
    label: c ? "💾 Saqlash" : "✨ Yaratish",
    onClick: saveCertModal,
  }, true);

  setTimeout(_certLivePreview, 40);
}

/**
 * Talaba tanlansa — BARCHA maydon avtomatik to'ladi: ism, kurs, o'qish davri
 * (guruh boshlangan sana + kurs davomiyligi) va berilgan sana. Admin hech
 * narsa yozib o'tirmaydi, kerak bo'lsagina tuzatadi.
 */
function _certFillFromStudent() {
  var sel = document.getElementById("f-cert-student");
  if (!sel || !sel.value) return;
  var s = (window.D && D.students ? D.students : []).find(function (x) {
    return String(x.id) === String(sel.value);
  });
  if (!s) return;

  var a = certAutoFor(s, _certEditId ? (certById(_certEditId) || {}).no : null);
  if (!a) return;

  var set = function (id, v) {
    var el = document.getElementById(id);
    if (el && v) el.value = v;
  };
  set("f-cert-name", a.name);
  set("f-cert-course", a.course);
  set("f-cert-from", a.periodFrom);
  set("f-cert-to", a.periodTo);
  if (!_certEditId) {
    set("f-cert-no", a.no);
    set("f-cert-date", a.issueDate);
  }
  _certLivePreview();
}

/** Formadagi qiymatlardan sertifikat obyekti (saqlanmagan). */
function _certFromForm() {
  var val = function (id) {
    var el = document.getElementById(id);
    return el ? String(el.value || "").trim() : "";
  };
  var stEl = document.getElementById("f-cert-student");
  var qrEl = document.getElementById("f-cert-qr");
  var tplVal = val("f-cert-tpl");
  return {
    id: _certEditId,
    studentId: stEl && stEl.value ? parseInt(stEl.value, 10) : null,
    name: val("f-cert-name"),
    course: val("f-cert-course"),
    no: val("f-cert-no"),
    periodFrom: val("f-cert-from"),
    periodTo: val("f-cert-to"),
    issueDate: val("f-cert-date"),
    qr: qrEl ? !!qrEl.checked : true,
    templateId: tplVal ? parseInt(tplVal, 10) : null,
  };
}

var _certPrevTimer = null;

function _certLivePreview() {
  clearTimeout(_certPrevTimer);
  _certPrevTimer = setTimeout(function () {
    var d = _certFromForm();
    if (!d.name) d.name = "Ism Familya";
    if (!d.course) d.course = "Kurs nomi";
    certPaint("cert-form-preview", d);
  }, 220);
}

function saveCertModal() {
  var d = _certFromForm();
  if (!d.name || !d.course || !d.no || !d.issueDate) {
    if (typeof toast === "function") toast("⚠️ Ism, kurs, raqam va sanani to'ldiring!");
    return;
  }
  if (!d.templateId) {
    if (typeof toast === "function") toast("⚠️ Shablonni tanlang");
    return;
  }
  // Raqam noyob bo'lishi shart — QR aynan shu raqam bo'yicha topadi.
  var dup = certAll().find(function (c) {
    return String(c.no).toLowerCase() === d.no.toLowerCase() && String(c.id) !== String(_certEditId);
  });
  if (dup) {
    if (typeof toast === "function") toast("🚫 Bu raqamli sertifikat allaqachon bor!");
    return;
  }

  var list = certAll();
  if (_certEditId) {
    var cur = certById(_certEditId);
    if (cur) {
      d.id = cur.id;
      d.createdAt = cur.createdAt;
      Object.assign(cur, d);
    }
  } else {
    d.id = typeof newId === "function" ? newId() : Date.now();
    d.createdAt = new Date().toISOString();
    list.push(d);
  }

  if (typeof saveData === "function") saveData();
  certCloseModal();
  renderCertificates();
  if (typeof toast === "function")
    toast(_certEditId ? "💾 Sertifikat yangilandi" : "🎖 Sertifikat yaratildi");
  _certEditId = null;
}

async function deleteCertificate(id) {
  var c = certById(id);
  if (!c) return;
  if (
    !(await crmConfirm(
      "«" + c.no + "» sertifikati o'chirilsinmi?\n\nTalabaning panelidan ham yo'qoladi, QR havolasi ishlamay qoladi.",
      { danger: true },
    ))
  )
    return;
  var list = certAll();
  var i = list.findIndex(function (x) {
    return String(x.id) === String(id);
  });
  if (i >= 0) list.splice(i, 1);
  if (typeof saveData === "function") saveData();
  renderCertificates();
  if (typeof toast === "function") toast("🗑 Sertifikat o'chirildi");
}

/* ─── AVTOMATIK TO'LDIRISH ────────────────────────────────────────────────── */
/**
 * Sertifikat ma'lumoti qo'lda yozilmaydi — CRM da allaqachon bor narsadan
 * hisoblanadi:
 *   ism      → talabaning ismi
 *   kurs     → guruhining kursi
 *   davr     → guruh boshlangan sana + kursning davomiyligi ("11 oy")
 *              (davomiylik noma'lum bo'lsa — oxirgi davomat sanasi yoki bugun)
 *   raqam    → SERT-{yil}-{ketma-ket}
 *   sana     → bugun
 * Admin faqat talabani (yoki butun guruhni) tanlaydi.
 */

/** "11 oy", "1 yil", "6 months" kabi matndan oylar sonini oladi. */
function _certCourseMonths(course) {
  var d = String((course && course.duration) || "").toLowerCase();
  var mo = d.match(/(\d+)\s*(oy|мес|month)/);
  if (mo) return parseInt(mo[1], 10);
  var yr = d.match(/(\d+)\s*(yil|год|year)/);
  if (yr) return parseInt(yr[1], 10) * 12;
  var n = d.match(/\d+/);
  return n ? parseInt(n[0], 10) : 0; // raqamning o'zi bo'lsa — oy deb olamiz
}

function _certAddMonths(dateStr, months) {
  var d = new Date(String(dateStr) + "T00:00:00");
  if (isNaN(d) || !months) return "";
  var day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0); // oy oxiridan chiqib ketmasin
  return d.toISOString().slice(0, 10);
}

/** Talabaning davomatdagi oxirgi darsi sanasi (davomiylik noma'lum bo'lsa). */
function _certLastAttendance(studentId) {
  try {
    var att = (window.D && D.attendance) || {};
    var sk = "s" + studentId;
    var last = "";
    Object.keys(att).forEach(function (k) {
      var rec = att[k] && att[k][sk];
      if (!rec) return;
      Object.keys(rec).forEach(function (day) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(day) && day > last) last = day;
      });
    });
    return last;
  } catch (e) {
    return "";
  }
}

/** Talabadan sertifikat maydonlarini avtomatik hisoblaydi. */
function certAutoFor(s, no) {
  if (!s) return null;
  var g = (window.D && D.groups ? D.groups : []).find(function (x) {
    return x.id === s.groupId;
  });
  var course =
    (g && (g.course || "")) ||
    (typeof getCourseById === "function" && g ? (getCourseById(g.courseId) || {}).name || "" : "") ||
    "";
  var cObj = (window.D && D.courses ? D.courses : []).find(function (x) {
    return x.name === course || (g && String(x.id) === String(g.courseId));
  });

  var from = (g && g.startDate) || s.joinDate || "";
  var months = _certCourseMonths(cObj);
  var to = from && months ? _certAddMonths(from, months) : "";
  if (!to) to = _certLastAttendance(s.id) || _certTodayStr();

  return {
    studentId: s.id,
    name: s.name || "",
    course: course,
    periodFrom: from,
    periodTo: to,
    no: no || certNextNo(),
    issueDate: _certTodayStr(),
    qr: true,
  };
}

/** Raqamlarni ketma-ket beradi: SERT-2026-0007, -0008, ... */
function _certNoSeq(i) {
  var base = certNextNo();
  var m = base.match(/^(.*-)(\d+)$/);
  if (!m) return base + "-" + (i + 1);
  return m[1] + String(parseInt(m[2], 10) + i).padStart(m[2].length, "0");
}

/* ─── Guruhga birdaniga sertifikat berish ─────────────────────────────────── */

function certOpenBulk() {
  var tpls = certTemplatesAll();
  if (!tpls.length) {
    openCertModal(); // shablon yo'qligi haqidagi oynani ko'rsatadi
    return;
  }
  var groups = (window.D && D.groups ? D.groups : []).slice();
  if (!groups.length) {
    if (typeof toast === "function") toast("⚠️ Avval guruh qo'shing");
    return;
  }

  var gOpts = groups
    .map(function (g) {
      var n = (window.D && D.students ? D.students : []).filter(function (s) {
        return s.groupId === g.id;
      }).length;
      return '<option value="' + g.id + '">' + _certEsc(g.name) +
        " — " + _certEsc(g.course || "") + " (" + n + " ta talaba)</option>";
    })
    .join("");

  var tplOpts = tpls
    .map(function (t) {
      return '<option value="' + t.id + '">🖼 ' + _certEsc(t.name) + "</option>";
    })
    .join("");

  var body =
    '<div style="font-size:12.5px;color:var(--text3);margin-bottom:12px;line-height:1.6">' +
    "Guruhni tanlang — ism, kurs, o'qish davri, raqam va sana <b>avtomatik</b> to'ldiriladi " +
    "va guruhdagi har bir talabaga alohida sertifikat yaratiladi. Qo'lda hech narsa yozilmaydi.</div>" +
    '<div class="form-row">' +
    '<div class="fg"><label>👥 Guruh <span class="req">*</span></label>' +
    '<select id="f-bulk-group" onchange="_certBulkPreview()">' + gOpts + "</select></div>" +
    '<div class="fg"><label>🖼 Shablon</label><select id="f-bulk-tpl">' + tplOpts + "</select></div>" +
    "</div>" +
    '<div class="form-row">' +
    '<div class="fg"><label>📅 Berilgan sana</label>' +
    '<input type="date" id="f-bulk-date" value="' + _certTodayStr() + '" onchange="_certBulkPreview()"></div>' +
    '<div class="fg"><label>Sozlamalar</label>' +
    '<label style="display:flex;align-items:center;gap:8px;font-size:13px;padding:4px 0;cursor:pointer">' +
    '<input type="checkbox" id="f-bulk-qr" checked style="width:17px;height:17px">QR kod qo\'yilsin</label>' +
    '<label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">' +
    '<input type="checkbox" id="f-bulk-skip" checked onchange="_certBulkPreview()" style="width:17px;height:17px">' +
    "Sertifikati bor talabalar o'tkazib yuborilsin</label></div>" +
    "</div>" +
    '<div class="modal-section-label">👥 Kimga beriladi</div>' +
    '<div id="cert-bulk-list" class="list-box" style="max-height:280px;overflow:auto"></div>';

  _certOpenModal("🎓 Guruhga sertifikat berish", body, {
    label: "✨ Hammasiga yaratish",
    onClick: certSaveBulk,
  }, true);

  setTimeout(_certBulkPreview, 40);
}

/** Tanlangan guruh bo'yicha kimga sertifikat tushishini oldindan ko'rsatadi. */
function _certBulkRows() {
  var gid = (document.getElementById("f-bulk-group") || {}).value;
  var skip = (document.getElementById("f-bulk-skip") || {}).checked;
  var date = (document.getElementById("f-bulk-date") || {}).value || _certTodayStr();
  var students = (window.D && D.students ? D.students : []).filter(function (s) {
    return String(s.groupId) === String(gid);
  });

  var i = 0;
  return students.map(function (s) {
    var has = certAll().some(function (c) {
      return String(c.studentId) === String(s.id);
    });
    var row = certAutoFor(s);
    row.issueDate = date;
    row.skip = skip && has;
    row.has = has;
    if (!row.skip) {
      row.no = _certNoSeq(i);
      i++;
    } else {
      row.no = "—";
    }
    return row;
  });
}

function _certBulkPreview() {
  var box = document.getElementById("cert-bulk-list");
  if (!box) return;
  var rows = _certBulkRows();
  var willCreate = rows.filter(function (r) {
    return !r.skip;
  }).length;

  box.innerHTML = rows.length
    ? rows
        .map(function (r) {
          return (
            '<div style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid var(--border);opacity:' +
            (r.skip ? 0.5 : 1) + '">' +
            '<div style="flex:1;min-width:0">' +
            '<div style="font-size:13px;font-weight:700;color:var(--text)">' + _certEsc(r.name) + "</div>" +
            '<div style="font-size:11.5px;color:var(--text3)">📚 ' + _certEsc(r.course || "—") +
            " · 🗓 " + _certEsc(certPeriodText(r)) + "</div></div>" +
            '<div style="font-size:11.5px;font-family:\'JetBrains Mono\',monospace;color:' +
            (r.skip ? "var(--text3)" : "var(--accent-text)") + '">' +
            (r.skip ? "allaqachon bor" : _certEsc(r.no)) + "</div></div>"
          );
        })
        .join("")
    : '<div style="padding:20px;text-align:center;color:var(--text3);font-size:12.5px">Bu guruhda talaba yo\'q</div>';

  var ok = document.getElementById("cert-modal-ok");
  if (ok) {
    ok.textContent = "✨ " + willCreate + " ta sertifikat yaratish";
    ok.disabled = willCreate === 0;
  }
}

function certSaveBulk() {
  var rows = _certBulkRows().filter(function (r) {
    return !r.skip;
  });
  if (!rows.length) return;
  var tplId = parseInt((document.getElementById("f-bulk-tpl") || {}).value, 10) || null;
  var qr = (document.getElementById("f-bulk-qr") || {}).checked !== false;

  var list = certAll();
  rows.forEach(function (r) {
    list.push({
      id: typeof newId === "function" ? newId() : Date.now() + Math.random(),
      studentId: r.studentId,
      name: r.name,
      course: r.course,
      no: r.no,
      periodFrom: r.periodFrom,
      periodTo: r.periodTo,
      issueDate: r.issueDate,
      qr: qr,
      templateId: tplId,
      createdAt: new Date().toISOString(),
    });
  });

  if (typeof saveData === "function") saveData();
  certCloseModal();
  certSwitchTab("list");
  if (typeof toast === "function") toast("🎓 " + rows.length + " ta sertifikat yaratildi");
}

/* ══════════════════════════════════════════════════════════════════════════
   TALABA TOMONI — "Sertifikatlarim"
   ══════════════════════════════════════════════════════════════════════════ */

/** Sahifa uslublari — bir marta <head> ga qo'shiladi. */
function _certInjectStyles() {
  if (document.getElementById("cert-ui-styles")) return;
  var st = document.createElement("style");
  st.id = "cert-ui-styles";
  st.textContent = [
    ".cert-page{padding-bottom:40px}",
    ".cert-hero{display:flex;align-items:center;gap:18px;flex-wrap:wrap;",
    "background:var(--bg2);border:1px solid var(--border);border-radius:var(--r-lg);",
    "padding:18px 22px;box-shadow:var(--shadow-sm);margin-bottom:20px}",
    ".cert-hero-ic{width:52px;height:52px;border-radius:14px;display:flex;align-items:center;",
    "justify-content:center;font-size:26px;background:var(--accent-light);flex-shrink:0}",
    ".cert-hero-t{font-size:16px;font-weight:800;color:var(--text)}",
    ".cert-hero-s{font-size:12.5px;color:var(--text3);margin-top:3px;line-height:1.6;max-width:560px}",
    ".cert-hero-n{margin-left:auto;text-align:center;padding:8px 20px;border-radius:14px;",
    "background:var(--teal-light);border:1px solid var(--border)}",
    ".cert-hero-n b{display:block;font-size:24px;font-weight:800;color:var(--teal-text);line-height:1.1}",
    ".cert-hero-n span{font-size:11px;color:var(--text3);letter-spacing:.4px}",

    ".cert-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:20px}",
    ".cert-card{background:var(--bg2);border:1px solid var(--border2);border-radius:var(--r-lg);",
    "overflow:hidden;box-shadow:var(--shadow-sm);transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease;",
    "display:flex;flex-direction:column}",
    ".cert-card:hover{transform:translateY(-4px);box-shadow:var(--shadow-md);border-color:var(--accent)}",

    ".cert-thumb{position:relative;background:var(--bg3);padding:14px;cursor:pointer;",
    "border-bottom:1px solid var(--border)}",
    ".cert-thumb-in{width:100%;overflow:hidden;border-radius:6px;",
    "box-shadow:0 2px 10px rgba(0,0,0,.14)}",
    ".cert-thumb-ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;",
    "background:linear-gradient(180deg,rgba(15,23,42,0),rgba(15,23,42,.55));opacity:0;transition:opacity .18s ease}",
    ".cert-card:hover .cert-thumb-ov{opacity:1}",
    ".cert-thumb-ov span{background:rgba(255,255,255,.95);color:#0f172a;font-size:12.5px;font-weight:700;",
    "padding:8px 16px;border-radius:999px;box-shadow:0 4px 14px rgba(0,0,0,.25)}",
    ".cert-chip-ok{background:var(--green-ok-light);border-color:var(--green-ok);",
    "color:var(--green-ok);font-weight:800}",

    ".cert-body{padding:14px 16px 16px;display:flex;flex-direction:column;gap:10px;flex:1}",
    ".cert-title{font-size:15.5px;font-weight:800;color:var(--text);line-height:1.35}",
    ".cert-meta{display:flex;flex-wrap:wrap;gap:6px}",
    ".cert-chip{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:var(--text2);",
    "background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:4px 9px}",
    ".cert-chip b{font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--text)}",
    ".cert-acts{display:flex;gap:8px;margin-top:auto;padding-top:4px}",
    ".cert-acts .btn{flex:1;justify-content:center}",
    ".cert-acts .cert-ico{flex:0 0 auto;width:38px;padding:0}",

    ".cert-empty{text-align:center;padding:64px 24px;background:var(--bg2);border:1px dashed var(--border2);",
    "border-radius:var(--r-lg)}",
    ".cert-empty-ic{width:78px;height:78px;border-radius:50%;background:var(--accent-light);",
    "display:flex;align-items:center;justify-content:center;font-size:36px;margin:0 auto 14px}",
    ".cert-empty h3{font-size:16px;font-weight:800;color:var(--text);margin:0 0 6px}",
    ".cert-empty p{font-size:13px;color:var(--text3);line-height:1.7;max-width:420px;margin:0 auto}",

    ".cert-view-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:14px}",
    ".cert-view-item{background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:9px 12px}",
    ".cert-view-item span{display:block;font-size:10.5px;letter-spacing:.4px;text-transform:uppercase;color:var(--text3)}",
    ".cert-view-item b{font-size:13px;color:var(--text);font-weight:700}",
    ".cert-link{display:flex;align-items:center;gap:8px;margin-top:12px;background:var(--accent-light);",
    "border:1px solid var(--border);border-radius:10px;padding:9px 12px;font-size:11.5px;color:var(--accent-text)}",
    ".cert-link code{flex:1;word-break:break-all;font-size:11px}",

    "@media(max-width:640px){.cert-grid{grid-template-columns:1fr}",
    ".cert-hero{padding:14px 16px}.cert-hero-n{margin-left:0;width:100%}}",
  ].join("");
  document.head.appendChild(st);
}

/** Joriy talabaning sertifikatlari: studentId bo'yicha, bo'lmasa ism bo'yicha. */
function myCertificates() {
  var cu = typeof getCurrentUser === "function" ? getCurrentUser() : {};
  var sid = cu && cu.studentId ? parseInt(cu.studentId, 10) : null;
  var nm = String((cu && (cu.studentName || cu.name)) || "").trim().toLowerCase();
  return certAll().filter(function (c) {
    if (sid && c.studentId) return String(c.studentId) === String(sid);
    if (c.studentId) return false;
    // Talabaga bog'lanmagan sertifikat faqat ism to'liq mos kelsa ko'rinadi
    return !!nm && String(c.name || "").trim().toLowerCase() === nm;
  });
}

function renderStudentCertificates() {
  var box = document.getElementById("student-cert-body");
  if (!box) return;
  _certInjectStyles();
  box.className = "cert-page";

  var list = myCertificates().slice().sort(function (a, b) {
    return String(b.issueDate || "").localeCompare(String(a.issueDate || ""));
  });

  if (!list.length) {
    box.innerHTML =
      '<div class="cert-empty">' +
      '<div class="cert-empty-ic">🎖</div>' +
      "<h3>Hali sertifikat yo'q</h3>" +
      "<p>Kursni tamomlaganingizdan so'ng o'quv markazi sertifikat beradi va u shu yerda " +
      "paydo bo'ladi. Sertifikatni bu yerdan chop etish yoki PDF qilib saqlash mumkin.</p>" +
      "</div>";
    return;
  }

  box.innerHTML =
    '<div class="cert-hero">' +
    '<div class="cert-hero-ic">🎖</div>' +
    "<div>" +
    '<div class="cert-hero-t">Sertifikatlarim</div>' +
    '<div class="cert-hero-s">Har bir sertifikatda QR kod bor — uni skaner qilgan har qanday odam ' +
    "hujjatning haqiqiyligini bir soniyada tekshira oladi. Yuklab olib chop etsangiz ham QR ishlaydi.</div>" +
    "</div>" +
    '<div class="cert-hero-n"><b>' + list.length + "</b><span>TA SERTIFIKAT</span></div>" +
    "</div>" +
    '<div class="cert-grid">' +
    list
      .map(function (c) {
        return (
          '<div class="cert-card">' +
          '<div class="cert-thumb" onclick="certPreview(' + c.id + ')">' +
          '<div class="cert-thumb-in" id="cert-mini-' + c.id + '"></div>' +
          '<div class="cert-thumb-ov"><span>👁 Kattalashtirib ko\'rish</span></div>' +
          "</div>" +
          '<div class="cert-body">' +
          '<div class="cert-title">' + _certEsc(c.course || "Sertifikat") + "</div>" +
          '<div class="cert-meta">' +
          '<span class="cert-chip cert-chip-ok">✓ Tasdiqlangan</span>' +
          '<span class="cert-chip">📅 ' + _certEsc(_certDate(c.issueDate)) + "</span>" +
          '<span class="cert-chip">🔢 <b>' + _certEsc(c.no) + "</b></span>" +
          (certPeriodText(c) !== "—"
            ? '<span class="cert-chip">🗓 ' + _certEsc(certPeriodText(c)) + "</span>"
            : "") +
          "</div>" +
          '<div class="cert-acts">' +
          '<button class="btn" onclick="certPreview(' + c.id + ')">👁 Ko\'rish</button>' +
          '<button class="btn btn-primary" onclick="certPrint(' + c.id + ')">⬇️ Yuklab olish</button>' +
          '<button class="btn cert-ico" title="Tekshirish havolasini nusxalash" onclick="certCopyLink(' + c.id + ')">🔗</button>' +
          "</div></div></div>"
        );
      })
      .join("") +
    "</div>";

  list.forEach(function (c) {
    certPaint("cert-mini-" + c.id, c);
  });
}

/* ─── Oyna o'lchami o'zgarsa — ko'rinishlarni qayta moslash ───────────────── */
window.addEventListener("resize", function () {
  ["cert-form-preview", "cert-view-wrap", "cert-ed-wrap"].forEach(certFitPreview);
  document.querySelectorAll('[id^="cert-mini-"],[id^="cert-tplprev-"]').forEach(function (el) {
    certFitPreview(el.id);
  });
});
