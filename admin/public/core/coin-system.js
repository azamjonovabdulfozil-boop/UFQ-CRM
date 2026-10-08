// ================================================
// COIN SHOP SYSTEM — EduManage
// Admin: mahsulot qo'shish + mentorga coin
// Talaba: coin shop — sotib olish
// ================================================
(function () {
  "use strict";

  var SHOP_KEY = "edu_shop_v1";
  var COIN_KEY = "edu_mentor_coins_v1";
  var PURCHASE_KEY = "edu_purchases_v1";

  function getShop() {
    try {
      return JSON.parse(localStorage.getItem(SHOP_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }
  function saveShop(d) {
    localStorage.setItem(SHOP_KEY, JSON.stringify(d));
  }
  function getCoins() {
    try {
      return JSON.parse(localStorage.getItem(COIN_KEY) || "{}");
    } catch (e) {
      return {};
    }
  }
  function saveCoins(d) {
    localStorage.setItem(COIN_KEY, JSON.stringify(d));
  }
  function getPurchases() {
    try {
      return JSON.parse(localStorage.getItem(PURCHASE_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }
  function savePurchases(d) {
    localStorage.setItem(PURCHASE_KEY, JSON.stringify(d));
  }

  // Per-group mentor balance: key = "mg_MentorName_GroupId"
  function _mgKey(name, gid) {
    return "mg_" + name + "_" + gid;
  }
  function getMentorGroupBal(name, gid) {
    return getCoins()[_mgKey(name, gid)] || 0;
  }
  function setMentorGroupBal(name, gid, n) {
    var c = getCoins();
    c[_mgKey(name, gid)] = Math.max(0, n);
    saveCoins(c);
  }
  // Sum across all groups (for display/compatibility)
  function getMentorBal(name) {
    var c = getCoins(),
      sum = 0,
      hasGroup = false;
    Object.keys(c).forEach(function (k) {
      if (k.startsWith("mg_" + name + "_")) {
        sum += c[k] || 0;
        hasGroup = true;
      }
    });
    // Legacy fallback: FAQAT guruh keylari yo'q bo'lsa ishlatilsin
    if (!hasGroup && c["m_" + name]) sum = c["m_" + name];
    return sum;
  }
  // Legacy setMentorBal not used for new sends, kept for compatibility
  function setMentorBal(name, n) {
    var c = getCoins();
    c["m_" + name] = Math.max(0, n);
    saveCoins(c);
  }
  function getStudentBal(id) {
    return getCoins()["s_" + id] || 0;
  }
  function setStudentBal(id, n) {
    var c = getCoins();
    c["s_" + id] = Math.max(0, n);
    saveCoins(c);
  }

  // 🔧 BUG FIX: mentordan talabaga coin berish avval 2 ta ALOHIDA
  // localStorage.setItem chaqiruvi orqali bajarilardi (guruh balansini
  // kamaytirish, keyin talaba balansini oshirish). Har bir yozuv orqa fonda
  // backend'ga mustaqil so'rov yuborgani uchun, bu ikki so'rov tarmoqda
  // tartibsiz yetib borishi mumkin edi — natijada serverda "guruh balansi
  // kamaydi, lekin talaba balansi qo'shilmadi" degan noto'g'ri holat qolib
  // ketardi. Bu funksiya ikkala o'zgarishni BITTA o'qish-yozish operatsiyasida
  // (demak bitta tarmoq so'rovida) bajarib, bu poyga holatini yo'q qiladi.
  function transferCoinToStudent(mentorName, gid, studentId, amt) {
    var c = getCoins();
    if (gid) {
      var mk = _mgKey(mentorName, gid);
      c[mk] = Math.max(0, (c[mk] || 0) - amt);
    } else {
      var mnk = "m_" + mentorName;
      c[mnk] = Math.max(0, (c[mnk] || 0) - amt);
    }
    var sk = "s_" + studentId;
    c[sk] = Math.max(0, (c[sk] || 0) + amt);
    saveCoins(c);
  }

  // ─── Backend bilan sinxronlash ───────────────────────────────────────────────
  var API_BASE = (function () {
    // 1. Vite build da VITE_API_URL env var ishlatiladi (Vercel uchun)
    if (typeof __API_BASE__ !== "undefined" && __API_BASE__)
      return __API_BASE__;
    // 2. Mahallida localhost proxy
    if (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1"
    )
      return (
        window.location.protocol +
        "//" +
        window.location.hostname +
        ":" +
        (window.location.port || 3000)
      );
    // 3. Production: bir xil domen (Render)
    return window.location.origin;
  })();

  function syncToBackend() {
    try {
      var payload = {
        coins: getCoins(),
        shop: getShop(),
        purchases: getPurchases(),
      };
      fetch(API_BASE + "/api/coins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(function () {});
    } catch (e) {}
  }

  // 🔧 BUG FIX: oddiy localStorage.setItem orqali yozish orqa fonda
  // (fire-and-forget) backend'ga POST yuboradi — bu tugamasidan oldin
  // foydalanuvchi sahifani yangilasa, sahifa hydrate bosqichida backend'dan
  // ESKI (hali yozib ulgurmagan) holatni qayta yuklab, local o'zgarishni
  // "yo'qotib" qo'yardi (masalan, admin mentorga coin qo'yib, darhol
  // yangilasa, coin yo'qolib qolardi). Bu funksiya yozuvni ANIQ KUTIB, faqat
  // backend tasdiqlagandan keyin davom etish imkonini beradi.
  function awaitKeySync(key, value) {
    return fetch(API_BASE + "/api/kv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: key, value: JSON.stringify(value) }),
    }).catch(function () {});
  }

  function awaitCoinSync() {
    return awaitKeySync(COIN_KEY, getCoins());
  }

  // Xaridlar + do'kon ro'yxatini ham kutib yozamiz (masalan xarid rad
  // etilganda: coin qaytdi, lekin "rad etilgan" belgisi yozilmay qolsa,
  // sahifa yangilanganda xaridni ikkinchi marta rad etib yuborish mumkin edi)
  function awaitPurchaseSync() {
    return Promise.all([
      awaitKeySync(PURCHASE_KEY, getPurchases()),
      awaitKeySync(SHOP_KEY, getShop()),
    ]);
  }

  function loadFromBackend(cb) {
    // /api/kv dan o'qiymiz — shim ham shu yerga yozadi, bir xil manba
    fetch(API_BASE + "/api/kv")
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        if (!d || !d.ok) return cb && cb();
        var data = d.data || {};
        // Storage.prototype.setItem — shimni bypass qilib faqat local yangilaymiz (loop bo'lmasin)
        if (data[COIN_KEY]) {
          try {
            var coins = JSON.parse(data[COIN_KEY]);
            if (typeof coins === "object" && Object.keys(coins).length) {
              Storage.prototype.setItem.call(
                localStorage,
                COIN_KEY,
                data[COIN_KEY],
              );
            }
          } catch (e) {}
        }
        if (data[SHOP_KEY]) {
          try {
            var shop = JSON.parse(data[SHOP_KEY]);
            if (Array.isArray(shop) && shop.length) {
              Storage.prototype.setItem.call(
                localStorage,
                SHOP_KEY,
                data[SHOP_KEY],
              );
            }
          } catch (e) {}
        }
        if (data[PURCHASE_KEY]) {
          try {
            var purchases = JSON.parse(data[PURCHASE_KEY]);
            if (Array.isArray(purchases) && purchases.length) {
              Storage.prototype.setItem.call(
                localStorage,
                PURCHASE_KEY,
                data[PURCHASE_KEY],
              );
            }
          } catch (e) {}
        }
        cb && cb();
      })
      .catch(function () {
        cb && cb();
      });
  }
  // ─────────────────────────────────────────────────────────────────────────────
  function tl(uz, ru, en) {
    var l = (typeof LANG !== "undefined" ? LANG : null) || window.LANG || "uz";
    return l === "ru" ? ru : l === "en" ? en : uz;
  }
  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function escJs(s) {
    return String(s || "")
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'");
  }

  // ───────────────────────────────────────────────────────────────
  // MAHSULOT RASMI
  // Rasm `contain` bilan TO'LIQ ko'rinadi va HECH QANDAY orqa fon
  // qo'shilmaydi — faqat rasmning o'zi (shaffof PNG shaffofligicha
  // qoladi). Barcha o'lchamlar CSS'da (.cs-img*) — inline `height`
  // yo'q, shuning uchun rasm hech qachon kartadan tashqariga chiqmaydi.
  // ───────────────────────────────────────────────────────────────
  function imgBox(src, opts) {
    opts = opts || {};
    var cls =
      "cs-img" +
      (opts.variant ? " cs-img--" + opts.variant : "") +
      (opts.zoom ? " cs-img--zoom" : "");
    var style = opts.style ? ' style="' + opts.style + '"' : "";
    var inner;
    if (src) {
      // Kesh bo'lsa — darhol tozalangan rasm, aks holda asl rasm ko'rsatiladi
      // va orqa fonda tozalanadi (data-cs-bg belgisi orqali).
      var shown = _bgCache[src] || src;
      inner =
        '<img class="cs-img-fg" src="' +
        esc(shown) +
        '" data-cs-src="' +
        esc(src) +
        '"' +
        (_bgCache[src] ? "" : " data-cs-bg=\"1\"") +
        ' alt="' +
        esc(opts.alt || "") +
        '" loading="lazy">';
    } else {
      inner =
        '<div class="cs-img-ph">' +
        (opts.placeholder ||
          '<span style="font-size:' + (opts.phSize || "34px") + '">🎁</span>') +
        "</div>";
    }
    return (
      '<div class="' +
      cls +
      '"' +
      style +
      ">" +
      inner +
      (opts.overlay || "") +
      "</div>"
    );
  }

  // ───────────────────────────────────────────────────────────────
  // KO'RSATISHDA FONNI OLIB TASHLASH
  // Do'kondagi eski mahsulotlar rasmi (masalan tashqi havola) ham
  // orqa fonsiz ko'rinsin. Natija xotirada keshlanadi — saqlashga
  // (localStorage/backend) yozilmaydi, shuning uchun joy egallamaydi.
  // ───────────────────────────────────────────────────────────────
  var _bgCache = {}; // src -> tayyor data URL yoki asl src
  var _bgQueue = [],
    _bgActive = 0,
    BG_PARALLEL = 3;

  function _bgPump() {
    while (_bgActive < BG_PARALLEL && _bgQueue.length) {
      var job = _bgQueue.shift();
      _bgActive++;
      (function (job) {
        removeImageBackground(job.src, function (out) {
          _bgActive--;
          _bgCache[job.src] = out || job.src;
          _applyBgToDom(job.src);
          _bgPump();
        });
      })(job);
    }
  }

  function _applyBgToDom(src) {
    var res = _bgCache[src];
    if (!res || res === src) return;
    var list = document.querySelectorAll('img[data-cs-src="' + CSS.escape(src) + '"]');
    for (var i = 0; i < list.length; i++) list[i].src = res;
  }

  // Sahifadagi mahsulot rasmlarini ko'rib chiqadi va fonini olib tashlaydi
  function csScanShopImages() {
    var imgs = document.querySelectorAll("img.cs-img-fg[data-cs-bg]");
    for (var i = 0; i < imgs.length; i++) {
      var el = imgs[i];
      el.removeAttribute("data-cs-bg");
      var src = el.getAttribute("data-cs-src") || el.getAttribute("src");
      if (!src) continue;
      if (_bgCache[src]) {
        if (_bgCache[src] !== src) el.src = _bgCache[src];
        continue;
      }
      if (
        _bgQueue.some(function (j) {
          return j.src === src;
        })
      )
        continue;
      _bgQueue.push({ src: src });
    }
    _bgPump();
  }
  window.csScanShopImages = csScanShopImages;

  // Har qanday yangi mahsulot rasmi DOM ga tushsa — avtomatik tozalanadi
  // (modal, xaridlar ro'yxati, talaba do'koni va h.k.)
  var _scanTimer = null;
  function _watchShopImages() {
    if (!window.MutationObserver || !document.body) return;
    new MutationObserver(function () {
      clearTimeout(_scanTimer);
      _scanTimer = setTimeout(csScanShopImages, 120);
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", _watchShopImages);
  else _watchShopImages();

  // Kvadrat kichik rasm (xaridlar ro'yxati uchun)
  function imgThumb(src, size, radius) {
    return imgBox(src, {
      style:
        "width:" +
        size +
        "px;height:" +
        size +
        "px;border-radius:" +
        (radius || 10) +
        "px;flex:0 0 auto",
      phSize: Math.round(size * 0.45) + "px",
    });
  }

  // ───────────────────────────────────────────────────────────────
  // Yuklangan rasmni kichraytirib siqish.
  // Telefon kamerasidan kelgan 3–5 MB rasm base64'da ~7 MB bo'lib,
  // localStorage kvotasini (~5 MB) to'ldiradi — natijada mahsulot
  // umuman saqlanmaydi yoki rasm buzilib ko'rinadi.
  // ───────────────────────────────────────────────────────────────
  var IMG_MAX = 1000; // px — eng uzun tomoni
  function compressImage(file, cb) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var raw = e.target.result;
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth || img.width;
        var h = img.naturalHeight || img.height;
        if (!w || !h) return cb(raw);
        var scale = Math.min(1, IMG_MAX / Math.max(w, h));
        var cw = Math.round(w * scale),
          ch = Math.round(h * scale);
        try {
          var cv = document.createElement("canvas");
          cv.width = cw;
          cv.height = ch;
          var ctx = cv.getContext("2d");
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, cw, ch);
          // Shaffoflik yo'qolmasin: PNG va JPEG'ni solishtirib, kichigini olamiz
          var jpg = cv.toDataURL("image/jpeg", 0.85);
          var out = jpg;
          if (/png|webp|gif/i.test(file.type || "")) {
            var png = cv.toDataURL("image/png");
            if (png.length < jpg.length * 1.6) out = png;
          }
          cb(out.length < raw.length ? out : raw);
        } catch (err) {
          cb(raw);
        }
      };
      img.onerror = function () {
        cb(raw);
      };
      img.src = raw;
    };
    reader.onerror = function () {
      cb(null);
    };
    reader.readAsDataURL(file);
  }

  // ───────────────────────────────────────────────────────────────
  // ORQA FONNI OLIB TASHLASH (avtomatik)
  // Mahsulot rasmining bir xil rangli foni (oq/kulrang/studiya foni)
  // shaffof qilinadi — kartada faqat buyumning o'zi ko'rinadi.
  // Chekkalardan boshlab "flood fill" qilinadi, shuning uchun buyum
  // ichidagi oq ranglar saqlanadi. Tolerantlik fon rangining
  // tarqoqligiga qarab avtomatik moslashadi (soya/gradient uchun).
  // ───────────────────────────────────────────────────────────────
  var BG_TOL_MIN = 34, // eng kichik tolerantlik
    BG_TOL_MAX = 85, // eng katta tolerantlik
    BG_SOFT_PAD = 22, // yumshoq chegara kengligi (chekka tishli bo'lmasin)
    BG_MAX_SPREAD = 55; // fon shundan tarqoqroq bo'lsa — bir xil fon emas

  var WORK_MAX_SIDE = 1100, // tahlil uchun eng uzun tomon
    PNG_MAX_SIDE = 700, // shaffof PNG eng uzun tomoni
    PNG_MAX_BYTES = 700 * 1024; // taxminiy data URL hajmi chegarasi

  // Canvas'ning bir qismini kerakli masshtabda PNG data URL ga aylantiradi
  function _cropToPng(cv, x, y, w, h, scale) {
    var ow = Math.max(1, Math.round(w * scale)),
      oh = Math.max(1, Math.round(h * scale));
    var c2 = document.createElement("canvas");
    c2.width = ow;
    c2.height = oh;
    var cx = c2.getContext("2d");
    cx.imageSmoothingQuality = "high";
    cx.drawImage(cv, x, y, w, h, 0, 0, ow, oh);
    return c2.toDataURL("image/png");
  }

  function _bgDist(r, g, b, c) {
    var dr = r - c[0],
      dg = g - c[1],
      db = b - c[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  // Tashqi URL'dagi rasmni server proxy orqali data: URL ga aylantiradi
  // (brauzer canvas'i cross-origin rasmni o'qiy olmaydi).
  // ⚠️ Proxy bir nechta manzilda bo'lishi mumkin: sozlangan API_BASE (masalan
  // Render), sahifaning o'z domeni (vite dev /api ni localhost:3000 ga uzatadi)
  // va localhost:3000. Qaysi biri javob bersa — o'sha ishlatiladi, shuning
  // uchun backend deploy qilinmagan bo'lsa ham mahalliy server yetarli.
  function _proxyBases() {
    var list = [];
    if (API_BASE) list.push(API_BASE);
    list.push(""); // nisbiy: /api/... (vite proxy yoki bir xil domen)
    var hn = window.location.hostname;
    if (hn === "localhost" || hn === "127.0.0.1")
      list.push(window.location.protocol + "//" + hn + ":3000");
    // takrorlarni olib tashlaymiz
    return list.filter(function (b, i) {
      return list.indexOf(b) === i;
    });
  }

  function fetchImageAsDataUrl(url, cb) {
    var bases = _proxyBases(),
      i = 0;
    function next() {
      if (i >= bases.length) return cb(null);
      var base = bases[i++];
      fetch(base + "/api/img-proxy?url=" + encodeURIComponent(url))
        .then(function (r) {
          if (!r.ok) throw new Error("proxy " + r.status);
          var ct = r.headers.get("content-type") || "";
          if (!/^image\//i.test(ct)) throw new Error("rasm emas");
          return r.blob();
        })
        .then(function (b) {
          var fr = new FileReader();
          fr.onload = function () {
            cb(String(fr.result || "") || null);
          };
          fr.onerror = next;
          fr.readAsDataURL(b);
        })
        .catch(next);
    }
    next();
  }

  function removeImageBackground(src, cb) {
    if (!src || /^data:image\/svg/i.test(src)) return cb(src);
    if (!/^data:/i.test(src)) {
      // Tashqi URL — avval proxy orqali yuklab olamiz
      return fetchImageAsDataUrl(src, function (dataUrl) {
        if (!dataUrl) return cb(src); // proxy ishlamadi — asl havola qolsin
        _processBg(dataUrl, function (out) {
          // Fon topilmasa (yoki rasm allaqachon shaffof bo'lsa) — asl havola
          // qoladi, base64 nusxa saqlanmaydi.
          cb(out || src);
        });
      });
    }
    _processBg(src, function (out) {
      cb(out || src);
    });
  }

  function _processBg(src, cb) {
    var img = new Image();
    img.onload = function () {
      try {
        var nw = img.naturalWidth || img.width,
          nh = img.naturalHeight || img.height;
        if (!nw || !nh) return cb(null);
        // Juda katta rasmlar (masalan 2400px) tahlilni sekinlashtiradi, natija
        // esa baribir PNG_MAX_SIDE gacha kichraytiriladi — shuning uchun
        // avvaldan kichraytirib olamiz.
        var pre = Math.min(1, WORK_MAX_SIDE / Math.max(nw, nh));
        var w = Math.max(1, Math.round(nw * pre)),
          h = Math.max(1, Math.round(nh * pre));
        var cv = document.createElement("canvas");
        cv.width = w;
        cv.height = h;
        var ctx = cv.getContext("2d", { willReadFrequently: true });
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, w, h);
        var id = ctx.getImageData(0, 0, w, h);
        var d = id.data;

        // Rasmda allaqachon shaffof joy ko'p bo'lsa — tegmaymiz
        var transparent = 0,
          checked = 0;
        for (var i = 3; i < d.length; i += 4 * 17) {
          checked++;
          if (d[i] < 250) transparent++;
        }
        if (checked && transparent / checked > 0.08) return cb(null);

        // ── Fon rangi: chekka piksellarning medianasi ──
        var samples = [];
        function push(x, y) {
          var o = (y * w + x) * 4;
          samples.push([d[o], d[o + 1], d[o + 2]]);
        }
        var stepX = Math.max(1, Math.floor(w / 80)),
          stepY = Math.max(1, Math.floor(h / 80));
        for (var x = 0; x < w; x += stepX) {
          push(x, 0);
          push(x, 1);
          push(x, h - 1);
          push(x, h - 2);
        }
        for (var y = 0; y < h; y += stepY) {
          push(0, y);
          push(1, y);
          push(w - 1, y);
          push(w - 2, y);
        }
        var bgc = [0, 1, 2].map(function (k) {
          var arr = samples
            .map(function (s2) {
              return s2[k];
            })
            .sort(function (a, b) {
              return a - b;
            });
          return arr[Math.floor(arr.length / 2)] || 0;
        });

        // ── Tolerantlik: fon ranglarining tarqoqligiga moslashadi ──
        var devs = samples
          .map(function (s2) {
            return _bgDist(s2[0], s2[1], s2[2], bgc);
          })
          .sort(function (a, b) {
            return a - b;
          });
        var p85 = devs[Math.floor(devs.length * 0.85)] || 0;
        // Fon bir xil rangda emas (manzara, gradient-rang, naqsh) — tegmaymiz
        if (p85 > BG_MAX_SPREAD) return cb(null);
        var tol = Math.min(
          BG_TOL_MAX,
          Math.max(BG_TOL_MIN, Math.round(p85 * 1.4 + 18)),
        );
        var soft = tol + BG_SOFT_PAD;

        // ── Chekkalardan flood fill ──
        var n = w * h;
        var seen = new Uint8Array(n);
        var stack = new Int32Array(n);
        var sp = 0;
        function seed(idx) {
          if (seen[idx]) return;
          var o = idx * 4;
          if (_bgDist(d[o], d[o + 1], d[o + 2], bgc) > soft) return;
          seen[idx] = 1;
          stack[sp++] = idx;
        }
        for (var x2 = 0; x2 < w; x2++) {
          seed(x2);
          seed((h - 1) * w + x2);
        }
        for (var y2 = 0; y2 < h; y2++) {
          seed(y2 * w);
          seed(y2 * w + w - 1);
        }
        var removed = 0;
        while (sp > 0) {
          var idx2 = stack[--sp];
          var o2 = idx2 * 4;
          var dd = _bgDist(d[o2], d[o2 + 1], d[o2 + 2], bgc);
          if (dd > tol) {
            // Yumshoq chegara: buyum qirrasi — shaffoflik qisman beriladi,
            // lekin bu piksel orqali fon buyum ichiga TARQALMAYDI.
            var a = Math.round((255 * (dd - tol)) / (soft - tol));
            if (a < d[o2 + 3]) d[o2 + 3] = a;
            continue;
          }
          d[o2 + 3] = 0;
          removed++;
          var cx = idx2 % w,
            cy = (idx2 - cx) / w;
          if (cx > 0) seed(idx2 - 1);
          if (cx < w - 1) seed(idx2 + 1);
          if (cy > 0) seed(idx2 - w);
          if (cy < h - 1) seed(idx2 + w);
        }

        // Deyarli hech narsa o'chmadi yoki hammasi o'chdi — asl rasm qolsin
        var ratio = removed / n;
        if (ratio < 0.01 || ratio > 0.985) return cb(null);

        ctx.putImageData(id, 0, 0);

        // ── Shaffof chekkalarni kesib tashlash: faqat buyumning o'zi ──
        var minX = w,
          minY = h,
          maxX = -1,
          maxY = -1;
        for (var yy = 0; yy < h; yy++) {
          for (var xx = 0; xx < w; xx++) {
            if (d[(yy * w + xx) * 4 + 3] > 12) {
              if (xx < minX) minX = xx;
              if (xx > maxX) maxX = xx;
              if (yy < minY) minY = yy;
              if (yy > maxY) maxY = yy;
            }
          }
        }
        var out;
        if (maxX >= minX && maxY >= minY) {
          var pad = 2;
          var cx0 = Math.max(0, minX - pad),
            cy0 = Math.max(0, minY - pad),
            cw = Math.min(w, maxX + pad + 1) - cx0,
            ch = Math.min(h, maxY + pad + 1) - cy0;
          // Shaffof PNG JPEG dan ancha katta bo'ladi — localStorage va backend
          // sinxronizatsiyasi to'lib ketmasligi uchun o'lchamni cheklaymiz va
          // kerak bo'lsa kichraytirib qayta yozamiz.
          var scale = Math.min(1, PNG_MAX_SIDE / Math.max(cw, ch));
          out = _cropToPng(cv, cx0, cy0, cw, ch, scale);
          var guard = 0;
          while (out.length > PNG_MAX_BYTES && scale > 0.25 && guard++ < 4) {
            scale *= 0.75;
            out = _cropToPng(cv, cx0, cy0, cw, ch, scale);
          }
        } else {
          out = cv.toDataURL("image/png");
        }
        cb(out || null);
      } catch (e) {
        // Canvas o'qib bo'lmadi (cross-origin va h.k.) — asl rasm qoladi
        cb(null);
      }
    };
    img.onerror = function () {
      cb(null);
    };
    img.src = src;
  }

  window.csRemoveImageBackground = removeImageBackground;

  function coinPill(n, big) {
    var fs = big ? "15px" : "12px",
      pad = big ? "5px 14px" : "3px 10px";
    return (
      '<span style="display:inline-flex;align-items:center;gap:3px;background:linear-gradient(135deg,rgba(245,158,11,0.22),rgba(217,119,6,0.15));color:#fcd34d;font-size:' +
      fs +
      ";font-weight:800;padding:" +
      pad +
      ';border-radius:20px;border:1.5px solid rgba(251,191,36,0.55);box-shadow:0 0 6px rgba(245,158,11,0.2)">🪙 ' +
      n +
      "</span>"
    );
  }
  function toast(msg, color) {
    color = color || "#0d9488";
    var el = document.createElement("div");
    el.style.cssText =
      "position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--bg);border:2px solid " +
      color +
      ";padding:10px 22px;border-radius:24px;font-size:14px;font-weight:700;z-index:99999;box-shadow:0 4px 20px rgba(0,0,0,.18);white-space:nowrap";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () {
      el.style.opacity = "0";
      el.style.transition = "opacity .3s";
      setTimeout(function () {
        el.remove();
      }, 350);
    }, 2400);
  }
  function fmtDate(d) {
    if (!d) return "—";
    var dt = new Date(d);
    return (
      String(dt.getDate()).padStart(2, "0") +
      "." +
      String(dt.getMonth() + 1).padStart(2, "0") +
      "." +
      dt.getFullYear() +
      " " +
      String(dt.getHours()).padStart(2, "0") +
      ":" +
      String(dt.getMinutes()).padStart(2, "0")
    );
  }

  function injectStyles() {
    if (document.getElementById("cs-styles")) return;
    var s = document.createElement("style");
    s.id = "cs-styles";
    s.textContent =
      ".cs-tab{padding:8px 16px;border-radius:20px;border:2px solid var(--border2);background:var(--bg2);color:var(--text);font-size:13px;font-weight:700;cursor:pointer;transition:.15s}" +
      ".cs-tab:hover{border-color:#f59e0b;background:var(--bg3);color:var(--amber-text,#92400e)}" +
      ".cs-tab-act{background:var(--accent,#3b82f6)!important;color:#fff!important;border-color:transparent!important}" +
      ".cs-mrow{display:flex;align-items:center;gap:12px;padding:13px 15px;border-radius:14px;border:2px solid var(--border2);background:var(--bg2);cursor:pointer;margin-bottom:9px;transition:.15s}" +
      ".cs-mrow:hover{border-color:#f59e0b;background:var(--bg3)}" +
      ".cs-mrow.selected{border-color:#f59e0b!important;background:rgba(245,158,11,0.12)!important}" +
      ".cs-modal-input{width:100%;border:2px solid var(--border2);border-radius:10px;outline:none;box-sizing:border-box;background:var(--bg2);color:var(--text);transition:.2s;font-family:inherit}" +
      ".cs-modal-input:focus{border-color:#f59e0b}" +
      "@keyframes csUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}";
    document.head.appendChild(s);
  }

  // ===================================================
  // ADMIN COIN SHOP
  // ===================================================
  window.renderAdminCoinShop = function () {
    var wrap = document.getElementById("panel-coin-shop");
    if (!wrap) return;
    injectStyles();
    var items = getShopItems();
    var purchases = getPurchases();

    wrap.innerHTML =
      '<div style="padding:0 0 32px">' +
      // Header
      '<div style="background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:18px;padding:24px 26px;color:#fff;margin-bottom:22px;position:relative;overflow:hidden;box-shadow:0 4px 24px rgba(245,158,11,.3)">' +
      '<div style="position:absolute;right:-20px;top:-20px;font-size:110px;opacity:.1;pointer-events:none">🪙</div>' +
      '<div style="font-size:24px;font-weight:900;margin-bottom:4px">🪙 Coin Shop</div>' +
      '<div style="font-size:13px;opacity:.88;margin-bottom:18px">' +
      tl(
        "Mahsulotlar · Mentor balanslari · Xaridlar tarixi",
        "Товары · Балансы менторов · История покупок",
        "Products · Mentor balances · Purchases",
      ) +
      "</div>" +
      '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
      '<button onclick="csOpenAddProduct()" style="background:rgba(255,255,255,.22);border:2px solid rgba(255,255,255,.6);color:#fff;border-radius:24px;padding:9px 20px;font-size:13px;font-weight:700;cursor:pointer">➕ ' +
      tl("Mahsulot qo'shish", "Добавить товар", "Add Product") +
      "</button>" +
      '<button onclick="csOpenSendCoin()" style="background:rgba(255,255,255,.22);border:2px solid rgba(255,255,255,.6);color:#fff;border-radius:24px;padding:9px 20px;font-size:13px;font-weight:700;cursor:pointer">🎁 ' +
      tl("Mentorga coin", "Монеты ментору", "Coins to Mentor") +
      "</button>" +
      "</div>" +
      "</div>" +
      // Stats
      '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:22px">' +
      '<div style="background:var(--bg2);border:1.5px solid #bfdbfe;border-radius:14px;padding:16px"><div style="font-size:22px;margin-bottom:6px">📦</div><div style="font-size:24px;font-weight:900;color:var(--accent)">' +
      items.length +
      '</div><div style="font-size:12px;color:var(--text2);font-weight:600">' +
      tl("Mahsulotlar", "Товары", "Products") +
      "</div></div>" +
      '<div style="background:var(--teal-light);border:1.5px solid var(--teal);border-radius:14px;padding:16px"><div style="font-size:22px;margin-bottom:6px">🧾</div><div style="font-size:24px;font-weight:900;color:var(--teal-text)">' +
      purchases.length +
      '</div><div style="font-size:12px;color:var(--text2);font-weight:600">' +
      tl("Jami xaridlar", "Всего покупок", "Total Purchases") +
      "</div></div>" +
      "</div>" +
      // Tabs
      '<div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap">' +
      '<button id="cstab-p" onclick="csTab(\'p\')" class="cs-tab cs-tab-act">📦 ' +
      tl("Mahsulotlar", "Товары", "Products") +
      " (" +
      items.length +
      ")</button>" +
      '<button id="cstab-x" onclick="csTab(\'x\')" class="cs-tab">🧾 ' +
      tl("Xaridlar", "Покупки", "Purchases") +
      " (" +
      purchases.filter(function (p) {
        return p.type !== "admin-send";
      }).length +
      ")</button>" +
      "</div>" +
      '<div id="csp-p">' +
      renderAdminProducts(items) +
      "</div>" +
      '<div id="csp-x" style="display:none">' +
      renderAdminPurchases(purchases) +
      "</div>" +
      "</div>";

    setTimeout(csScanShopImages, 20);
  };

  function getShopItems() {
    return getShop();
  }

  function csAllCoinSum() {
    var c = getCoins(),
      sum = 0;
    Object.keys(c).forEach(function (k) {
      if (k.startsWith("m_")) sum += c[k] || 0;
    });
    return sum;
  }

  window.csTab = function (t) {
    ["p", "x"].forEach(function (k) {
      var p = document.getElementById("csp-" + k),
        b = document.getElementById("cstab-" + k);
      if (p) p.style.display = k === t ? "block" : "none";
      if (b) {
        b.className = k === t ? "cs-tab cs-tab-act" : "cs-tab";
      }
    });
  };

  function renderAdminProducts(items) {
    if (!items.length)
      return (
        '<div style="text-align:center;padding:70px 20px;color:var(--text3)">' +
        '<div style="font-size:64px;margin-bottom:16px">🛒</div>' +
        '<div style="font-size:18px;font-weight:700;margin-bottom:8px">' +
        tl("Mahsulot yo'q", "Товаров нет", "No products yet") +
        "</div>" +
        '<div style="font-size:13px">' +
        tl(
          "'+ Mahsulot qo\\'shish' tugmasini bosing",
          "Нажмите '+ Добавить товар'",
          "Click '+ Add Product'",
        ) +
        "</div>" +
        "</div>"
      );
    return (
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:18px">' +
      items
        .map(function (item) {
          var st = item.stock || 0,
            so = st <= 0;
          var sc = so ? "#ef4444" : st <= 3 ? "#f59e0b" : "#10b981";
          var sbg = so ? "#fef2f2" : st <= 3 ? "#fffbeb" : "#f0fdf4";
          return (
            '<div class="cs-card" style="background:var(--bg);border-radius:18px;overflow:hidden;border:1.5px solid var(--border);box-shadow:0 2px 12px rgba(0,0,0,.07)">' +
            imgBox(item.image, {
              variant: "card",
              alt: item.name,
              phSize: "44px",
              overlay: so
                ? '<div class="cs-img-veil"><span style="color:#fff;font-size:14px;font-weight:800;border:2px solid rgba(255,255,255,.7);padding:4px 14px;border-radius:20px">' +
                  tl("TUGAGAN", "НЕТУ", "SOLD OUT") +
                  "</span></div>"
                : "",
            }) +
            '<div style="padding:14px 16px">' +
            '<div style="font-size:15px;font-weight:800;margin-bottom:10px;line-height:1.3;color:var(--text)">' +
            esc(item.name) +
            "</div>" +
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">' +
            coinPill(item.price) +
            '<span style="font-size:12px;font-weight:700;color:' +
            sc +
            ";background:" +
            sbg +
            ";padding:3px 10px;border-radius:12px;border:1.5px solid " +
            sc +
            '">📦 ' +
            st +
            " " +
            tl("ta", "шт", "left") +
            "</span>" +
            "</div>" +
            '<div style="display:flex;gap:7px">' +
            "<button onclick=\"csOpenAddProduct('" +
            escJs(item.id) +
            '\')" class="cs-btn cs-btn-edit" style="flex:1;padding:8px;border-radius:10px;border:1.5px solid var(--border2);background:var(--bg2);color:var(--text);font-size:12px;font-weight:700;cursor:pointer">✏️ ' +
            tl("Tahrir", "Изменить", "Edit") +
            "</button>" +
            "<button onclick=\"csDeleteProduct('" +
            escJs(item.id) +
            '\')" class="cs-btn cs-btn-del" style="padding:8px 12px;border-radius:10px;border:1.5px solid var(--orange);background:var(--orange-light);color:var(--orange-text);font-size:12px;font-weight:700;cursor:pointer">🗑</button>' +
            "</div>" +
            "</div>" +
            "</div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function renderAdminBalances() {
    var mentors = (window.D && window.D.mentors) || [];
    if (!mentors.length)
      return (
        '<div style="text-align:center;padding:40px;color:var(--text3);font-size:14px">' +
        tl("Mentorlar yo'q", "Менторов нет", "No mentors") +
        "</div>"
      );
    return (
      '<div style="font-size:15px;font-weight:800;margin-bottom:16px">🎓 ' +
      tl(
        "Mentor coinlari (guruh bo\'yicha)",
        "Монеты менторов (по группам)",
        "Mentor Coins (per group)",
      ) +
      "</div>" +
      '<div style="display:flex;flex-direction:column;gap:14px">' +
      mentors
        .map(function (m) {
          var grps = ((window.D && window.D.groups) || []).filter(function (g) {
            return g.mentor === m.name;
          });
          var totalBal = getMentorBal(m.name);
          var grpRows = grps.length
            ? grps
                .map(function (g) {
                  var gBal = getMentorGroupBal(m.name, g.id);
                  return (
                    '<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:9px;background:var(--bg3);font-size:12px">' +
                    '<span style="flex:1;font-weight:600">📚 ' +
                    esc(g.name || g.id) +
                    "</span>" +
                    coinPill(gBal) +
                    "</div>"
                  );
                })
                .join("")
            : '<div style="font-size:11px;color:var(--text3);padding:4px 0">' +
              tl("Guruh yo'q", "Нет групп", "No groups") +
              "</div>";
          return (
            '<div style="background:var(--bg);border:1.5px solid var(--border2);border-radius:14px;padding:14px 16px;box-shadow:0 1px 4px rgba(0,0,0,.05)">' +
            '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">' +
            '<div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#d97706);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:900;color:#fff;flex-shrink:0">' +
            (m.name[0] || "M") +
            "</div>" +
            '<div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:700">' +
            esc(m.name) +
            "</div>" +
            '<div style="font-size:11px;color:var(--text3)">' +
            tl("Jami", "Итого", "Total") +
            ": " +
            coinPill(totalBal) +
            "</div></div>" +
            "<button onclick=\"csOpenSendCoin('" +
            escJs(m.name) +
            '\')" style="padding:5px 12px;border-radius:8px;border:1.5px solid #fbbf24;background:var(--bg3);color:#92400e;font-size:11px;font-weight:700;cursor:pointer;flex-shrink:0">+🪙</button>' +
            "</div>" +
            '<div style="display:flex;flex-direction:column;gap:5px">' +
            grpRows +
            "</div>" +
            "</div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function renderAdminPurchases(purchases) {
    // Faqat talaba xaridlarini ko'rsatamiz (admin->mentor transferlarini emas)
    var filtered = purchases.filter(function (p) {
      return p.type !== "admin-send";
    });
    if (!filtered.length)
      return (
        '<div style="text-align:center;padding:50px;color:var(--text3)"><div style="font-size:44px;margin-bottom:12px">🧾</div><div style="font-size:14px">' +
        tl("Xaridlar yo'q", "Покупок нет", "No purchases yet") +
        "</div></div>"
      );
    var sorted = filtered.slice().sort(function (a, b) {
      return new Date(b.date) - new Date(a.date);
    });
    return (
      '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;background:var(--bg2);border-radius:14px;overflow:hidden;box-shadow:0 1px 8px rgba(0,0,0,.07)">' +
      '<thead><tr style="background:var(--bg2);border-bottom:2px solid var(--border2)">' +
      '<th style="text-align:left;padding:12px 14px;font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase">' +
      tl("Talaba", "Студент", "Student") +
      "</th>" +
      '<th style="text-align:left;padding:12px 14px;font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase">' +
      tl("Mahsulot", "Товар", "Product") +
      "</th>" +
      '<th style="text-align:center;padding:12px 14px;font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase">' +
      tl("Narxi", "Цена", "Price") +
      "</th>" +
      '<th style="text-align:center;padding:12px 14px;font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase">' +
      tl("Sana", "Дата", "Date") +
      "</th>" +
      '<th style="text-align:center;padding:12px 14px;font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase">' +
      tl("Holat", "Статус", "Status") +
      "</th>" +
      "</tr></thead><tbody>" +
      sorted
        .map(function (p, i) {
          var stt = purchaseStatus(p);
          return (
            '<tr class="cs-prow" style="border-bottom:1px solid var(--border);background:' +
            (i % 2 ? "var(--bg2)" : "var(--bg)") +
            '">' +
            '<td style="padding:11px 14px"><div style="font-size:13px;font-weight:700">' +
            esc(p.studentName || "—") +
            "</div></td>" +
            '<td style="padding:11px 14px"><div style="display:flex;align-items:center;gap:10px">' +
            imgThumb(p.itemImage, 34, 8) +
            '<span style="font-size:13px;font-weight:600">' +
            esc(p.itemName || "—") +
            "</span></div></td>" +
            '<td style="text-align:center;padding:11px 14px">' +
            coinPill(p.coinPrice || 0) +
            "</td>" +
            '<td style="text-align:center;padding:11px 14px;font-size:12px;color:var(--text2);font-weight:600">' +
            fmtDate(p.date) +
            "</td>" +
            '<td style="text-align:center;padding:11px 14px">' +
            statusBadge(stt) +
            // Kutilayotgan xarid: tasdiqlash yoki RAD ETISH
            // (rad etilganda coin talabaga qaytariladi)
            (stt === "pending"
              ? '<div style="display:flex;gap:6px;justify-content:center;margin-top:6px">' +
                "<button onclick=\"csApprove('" +
                escJs(p.id) +
                '\')" class="cs-btn cs-btn-ok" style="padding:3px 10px;border-radius:8px;border:1px solid var(--teal);background:var(--teal-light);color:var(--teal-text);font-size:11px;font-weight:700;cursor:pointer">✅ ' +
                tl("Tasdiqlash", "Подтвердить", "Approve") +
                "</button>" +
                "<button onclick=\"csReject('" +
                escJs(p.id) +
                '\')" class="cs-btn cs-btn-no" style="padding:3px 10px;border-radius:8px;border:1px solid var(--orange);background:var(--orange-light);color:var(--orange-text);font-size:11px;font-weight:700;cursor:pointer">❌ ' +
                tl("Rad etish", "Отклонить", "Reject") +
                "</button>" +
                "</div>"
              : "") +
            (stt === "rejected"
              ? '<div style="margin-top:5px;font-size:10px;color:var(--text3);font-weight:600">↩️ ' +
                tl(
                  "Coin qaytarildi",
                  "Монеты возвращены",
                  "Coins refunded",
                ) +
                "</div>"
              : "") +
            "</td></tr>"
          );
        })
        .join("") +
      "</tbody></table></div>"
    );
  }

  // Xarid holati: kutilmoqda / tasdiqlangan / rad etilgan
  function purchaseStatus(p) {
    if (p.rejected) return "rejected";
    if (p.approved) return "approved";
    return "pending";
  }

  function statusBadge(stt) {
    var map = {
      approved: {
        bg: "var(--teal-light)",
        fg: "var(--teal-text)",
        txt: "✅ " + tl("Tasdiqlangan", "Подтверждено", "Approved"),
      },
      rejected: {
        bg: "var(--orange-light)",
        fg: "var(--orange-text)",
        txt: "❌ " + tl("Rad etilgan", "Отклонено", "Rejected"),
      },
      pending: {
        bg: "var(--amber-light)",
        fg: "var(--amber-text)",
        txt: "⏳ " + tl("Kutilmoqda", "Ожидание", "Pending"),
      },
    };
    var m = map[stt] || map.pending;
    return (
      '<span style="display:inline-block;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap;flex-shrink:0;background:' +
      m.bg +
      ";color:" +
      m.fg +
      '">' +
      m.txt +
      "</span>"
    );
  }

  window.csApprove = function (id) {
    var p = getPurchases(),
      it = p.find(function (x) {
        return x.id === id;
      });
    if (!it || it.approved || it.rejected) return;
    it.approved = true;
    it.rejected = false;
    savePurchases(p);
    awaitPurchaseSync();
    toast("✅ " + tl("Tasdiqlandi!", "Подтверждено!", "Approved!"), "#0d9488");
    renderAdminCoinShop();
  };

  // ===================================================
  // XARIDNI RAD ETISH
  // Admin rad etsa: 1) coin talabaga TO'LIQ qaytariladi,
  // 2) mahsulot soni (stock) ortga qaytariladi,
  // 3) xarid "rad etilgan" deb belgilanadi.
  // Coin va xaridlar bitta o'qish-yozishda yangilanadi va
  // backend tasdiqlashi kutiladi — shunda sahifa darhol
  // yangilansa ham qaytarilgan coin yo'qolmaydi.
  // ===================================================
  window.csReject = async function (id) {
    var list = getPurchases();
    var it = list.find(function (x) {
      return x.id === id;
    });
    if (!it || it.rejected || it.approved) return;
    if (
      !(await crmConfirm(
        tl(
          "Xaridni rad etasizmi? Coin talabaga qaytariladi.",
          "Отклонить покупку? Монеты вернутся студенту.",
          "Reject this purchase? Coins will be refunded.",
        ),
        { danger: true },
      ))
    )
      return;

    // Serverdagi eng so'nggi holatni olamiz (boshqa qurilmadan
    // o'zgargan bo'lishi mumkin), keyin ustiga yozamiz
    await new Promise(function (resolve) {
      loadFromBackend(resolve);
    });

    list = getPurchases();
    it = list.find(function (x) {
      return x.id === id;
    });
    if (!it || it.rejected || it.approved) {
      renderAdminCoinShop();
      return;
    }

    var amt = parseInt(it.coinPrice) || 0;
    var sid = it.studentId;

    // 1) Coin qaytarish (bitta yozuv)
    if (sid != null && amt > 0) {
      var c = getCoins();
      var sk = "s_" + sid;
      c[sk] = Math.max(0, (c[sk] || 0) + amt);
      saveCoins(c);
    }

    // 2) Mahsulot sonini tiklash
    if (it.itemId) {
      var items = getShop();
      var idx = items.findIndex(function (x) {
        return x.id === it.itemId;
      });
      if (idx >= 0) {
        items[idx].stock = (parseInt(items[idx].stock) || 0) + 1;
        saveShop(items);
      }
    }

    // 3) Holatni belgilaymiz
    it.rejected = true;
    it.approved = false;
    it.rejectedAt = new Date().toISOString();
    it.refunded = amt;
    savePurchases(list);

    await Promise.all([awaitCoinSync(), awaitPurchaseSync()]);

    toast(
      "❌ " +
        tl("Rad etildi", "Отклонено", "Rejected") +
        " · ↩️ 🪙" +
        amt +
        " " +
        tl("qaytarildi", "возвращено", "refunded"),
      "#ea580c",
    );
    updateMentorCoinTopbar();
    renderAdminCoinShop();
  };

  // Modal ichidagi rasm maydoni (bo'sh holat + tanlangan rasm)
  function cspPreviewHtml(src) {
    return imgBox(src, {
      variant: "upload",
      placeholder:
        '<div style="font-size:32px;color:var(--accent)">🖼</div>' +
        '<div style="font-size:13px;font-weight:700;color:var(--accent)">' +
        tl("Rasm yuklash", "Загрузить фото", "Upload Image") +
        "</div>" +
        '<div style="font-size:11px;opacity:.75">' +
        tl(
          "Bosib tanlang yoki URL kiring",
          "Нажмите или введите URL",
          "Click or enter URL",
        ) +
        "</div>",
      overlay: src
        ? '<div class="cs-img-upload-hint">' +
          tl(
            "O'zgartirish uchun bosing",
            "Нажмите, чтобы изменить",
            "Click to change",
          ) +
          "</div>"
        : "",
    });
  }

  // ===================================================
  // MAHSULOT QO'SHISH MODAL
  // ===================================================
  window.csOpenAddProduct = function (editId) {
    var items = getShop();
    var item = editId
      ? items.find(function (x) {
          return x.id === editId;
        })
      : null;
    var old = document.getElementById("cs-prod-modal");
    if (old) old.remove();
    var ov = document.createElement("div");
    ov.id = "cs-prod-modal";
    ov.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9100;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px)";
    ov.onclick = function (e) {
      if (e.target === ov) ov.remove();
    };
    document.body.appendChild(ov);

    var isEdit = !!item;
    var hdr = isEdit
      ? "linear-gradient(135deg,#7c3aed,#6d28d9)"
      : "linear-gradient(135deg,#2563eb,#1d4ed8)";

    var box = document.createElement("div");
    box.style.cssText =
      "background:var(--bg);border-radius:22px;overflow:hidden;max-width:460px;width:100%;box-shadow:0 24px 60px rgba(0,0,0,.28);max-height:94vh;display:flex;flex-direction:column;animation:csUp .25s";
    box.innerHTML =
      '<div style="background:' +
      hdr +
      ';padding:22px 24px;color:#fff;position:relative;overflow:hidden;flex-shrink:0">' +
      '<div style="position:absolute;right:-18px;top:-18px;font-size:90px;opacity:.1;pointer-events:none">' +
      (isEdit ? "✏️" : "📦") +
      "</div>" +
      '<div style="font-size:21px;font-weight:900;margin-bottom:3px">' +
      (isEdit
        ? "✏️ " + tl("Tahrirlash", "Редактировать", "Edit Product")
        : "📦 " + tl("Yangi mahsulot", "Новый товар", "New Product")) +
      "</div>" +
      '<div style="font-size:12px;opacity:.88">' +
      tl(
        "Nomi · coin narxi · soni · rasmi",
        "Название · цена · остаток · фото",
        "Name · price · stock · image",
      ) +
      "</div>" +
      "</div>" +
      '<div style="padding:22px 24px;overflow-y:auto;flex:1">' +
      // Rasm preview — kliklab yuklash
      '<div id="csp-imgprev" onclick="document.getElementById(\'csp-file\').click()" style="cursor:pointer;margin-bottom:18px;border:2px dashed var(--border2);border-radius:14px">' +
      cspPreviewHtml(item && item.image) +
      "</div>" +
      '<input id="csp-file" type="file" accept="image/*" style="display:none">' +
      // URL
      '<div style="margin-bottom:14px">' +
      '<label style="font-size:12px;font-weight:700;color:var(--text);display:block;margin-bottom:5px">🔗 URL ' +
      tl(
        "(yoki yuqoridan yuklang)",
        "(или загрузите выше)",
        "(or upload above)",
      ) +
      "</label>" +
      '<input id="csp-url" type="text" value="' +
      (item && item.image && !item.image.startsWith("data:")
        ? esc(item.image)
        : "") +
      '" style="width:100%;padding:10px 14px;border:2px solid var(--border2);border-radius:10px;font-size:13px;outline:none;box-sizing:border-box;transition:.2s" placeholder="https://..." onfocus="this.style.borderColor=\'#3b82f6\'" onblur="this.style.borderColor=\'#e5e7eb\'">' +
      '<div id="csp-img-note" style="display:none;margin-top:6px;font-size:11px;font-weight:700;line-height:1.5"></div>' +
      "</div>" +
      // Nomi
      '<div style="margin-bottom:14px">' +
      '<label style="font-size:12px;font-weight:700;color:var(--text);display:block;margin-bottom:5px">📝 ' +
      tl("Nomi *", "Название *", "Name *") +
      "</label>" +
      '<input id="csp-name" type="text" value="' +
      (item ? esc(item.name) : "") +
      '" style="width:100%;padding:11px 14px;border:2px solid var(--border2);border-radius:10px;font-size:15px;font-weight:600;outline:none;box-sizing:border-box;transition:.2s" placeholder="' +
      tl(
        "Masalan: Uy vazifasini o\\'tkazib yuborish",
        "Например: Пропуск д/з",
        "E.g. Skip homework",
      ) +
      '" onfocus="this.style.borderColor=\'#3b82f6\'" onblur="this.style.borderColor=\'#e5e7eb\'">' +
      "</div>" +
      // Narxi + Soni
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">' +
      "<div>" +
      '<label style="font-size:12px;font-weight:700;color:var(--text);display:block;margin-bottom:5px">🪙 ' +
      tl("Coin narxi *", "Цена *", "Price *") +
      "</label>" +
      '<div style="position:relative"><span style="position:absolute;left:13px;top:50%;transform:translateY(-50%);font-size:16px;pointer-events:none">🪙</span>' +
      '<input id="csp-price" type="number" min="1" value="' +
      (item ? item.price : "") +
      '" style="width:100%;padding:11px 14px 11px 38px;border:2px solid var(--border2);border-radius:10px;font-size:20px;font-weight:900;outline:none;box-sizing:border-box;color:#92400e;transition:.2s" placeholder="500" onfocus="this.style.borderColor=\'#f59e0b\'" onblur="this.style.borderColor=\'#e5e7eb\'"></div>' +
      "</div>" +
      "<div>" +
      '<label style="font-size:12px;font-weight:700;color:var(--text);display:block;margin-bottom:5px">📦 ' +
      tl("Qolgan soni *", "Остаток *", "Stock *") +
      "</label>" +
      '<div style="position:relative"><span style="position:absolute;left:13px;top:50%;transform:translateY(-50%);font-size:16px;pointer-events:none">📦</span>' +
      '<input id="csp-stock" type="number" min="0" value="' +
      (item ? item.stock : "") +
      '" style="width:100%;padding:11px 14px 11px 38px;border:2px solid var(--border2);border-radius:10px;font-size:20px;font-weight:900;outline:none;box-sizing:border-box;color:#065f46;transition:.2s" placeholder="10" onfocus="this.style.borderColor=\'#10b981\'" onblur="this.style.borderColor=\'#e5e7eb\'"></div>' +
      "</div>" +
      "</div>" +
      "</div>" +
      '<div style="padding:16px 24px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;flex-shrink:0;background:var(--bg3)">' +
      '<button id="csp-cancel" style="padding:11px 22px;border-radius:11px;border:2px solid var(--border2);background:var(--bg2);color:var(--text);font-size:13px;font-weight:600;cursor:pointer">' +
      tl("Bekor", "Отмена", "Cancel") +
      "</button>" +
      '<button id="csp-save" style="padding:11px 28px;border-radius:11px;border:none;background:' +
      hdr +
      ';color:#fff;font-size:14px;font-weight:800;cursor:pointer">💾 ' +
      tl("Saqlash", "Сохранить", "Save") +
      "</button>" +
      "</div>";

    ov.appendChild(box);

    // Tanlangan rasm: _cspImgRaw — asl nusxa, _cspImg — saqlanadigan
    // (fon olib tashlangan) nusxa.
    window._cspImgRaw = item && item.image ? item.image : null;
    window._cspImg = window._cspImgRaw;

    function setPreview(src) {
      var a = document.getElementById("csp-imgprev");
      if (a) a.innerHTML = cspPreviewHtml(src);
    }
    function setNote(txt, color) {
      var el = document.getElementById("csp-img-note");
      if (!el) return;
      el.textContent = txt || "";
      el.style.color = color || "var(--text3)";
      el.style.display = txt ? "block" : "none";
    }
    function setBusy(msg) {
      setPreview(null);
      var ph = document.querySelector("#csp-imgprev .cs-img-ph");
      if (ph) ph.innerHTML = '<div style="font-size:13px;font-weight:700">' + msg + "</div>";
    }
    // Rasm tanlanganda orqa fon avtomatik olib tashlanadi — faqat buyum qoladi.
    // Ishlov tugamasdan "Saqlash" bosilsa, csSaveProduct shu Promise'ni kutadi
    // (aks holda fon olinmagan asl rasm saqlanib qolardi).
    function applyImage(raw) {
      window._cspImgRaw = raw || null;
      if (!raw) {
        window._cspImg = null;
        window._cspPending = null;
        setPreview(null);
        return;
      }
      setBusy("⏳ " + tl("Yuklanmoqda…", "Загрузка…", "Loading…"));
      setNote("");
      window._cspPending = new Promise(function (resolve) {
        removeImageBackground(raw, function (out) {
          window._cspImg = out || raw;
          setPreview(window._cspImg);
          // Fon olib tashlanmagan bo'lsa — jim qolmaymiz, sababini aytamiz
          if (String(window._cspImg).indexOf("data:image/png") !== 0) {
            setNote(
              /^data:/i.test(raw)
                ? "⚠️ " +
                    tl(
                      "Bu rasmda bir xil rangli fon topilmadi — rasm o'zgarishsiz saqlanadi.",
                      "Однородный фон не найден — изображение сохранится как есть.",
                      "No plain background found — the image is kept as is.",
                    )
                : "⚠️ " +
                    tl(
                      "Fonni olib tashlab bo'lmadi (rasm boshqa saytda, server javob bermadi). Faylni yuklab qo'ysangiz fon avtomatik olinadi.",
                      "Не удалось удалить фон (изображение на другом сайте, сервер не ответил). Загрузите файл — фон удалится автоматически.",
                      "Could not remove the background (remote image, server unreachable). Upload the file instead.",
                    ),
              "#b45309",
            );
          } else {
            setNote(
              "✅ " +
                tl(
                  "Orqa fon olib tashlandi",
                  "Фон удалён",
                  "Background removed",
                ),
              "#047857",
            );
          }
          window._cspPending = null;
          resolve(window._cspImg);
        });
      });
    }
    var _urlTimer = null;
    document.getElementById("csp-url").oninput = function () {
      var v = this.value.trim();
      clearTimeout(_urlTimer);
      if (!v) return applyImage(null);
      // Kutish holatini darhol belgilaymiz — Saqlash bosilsa kutiladi
      window._cspPending = new Promise(function (resolve) {
        _urlTimer = setTimeout(function () {
          applyImage(v);
          var p = window._cspPending;
          if (p && p.then) p.then(resolve);
          else resolve(window._cspImg);
        }, 400);
      });
    };
    document.getElementById("csp-file").onchange = function () {
      var f = this.files[0];
      if (!f) return;
      setBusy("⏳ " + tl("Yuklanmoqda…", "Загрузка…", "Loading…"));
      compressImage(f, function (dataUrl) {
        var u = document.getElementById("csp-url");
        if (u) u.value = "";
        applyImage(dataUrl || null);
      });
    };
    document.getElementById("csp-cancel").onclick = function () {
      ov.remove();
    };
    document.getElementById("csp-save").onclick = function () {
      csSaveProduct(editId || null);
    };
    setTimeout(function () {
      var n = document.getElementById("csp-name");
      if (n) n.focus();
    }, 100);
  };

  window.csSaveProduct = function (editId) {
    // Rasm hali ishlanayotgan bo'lsa — kutamiz, aks holda fon olinmagan
    // (asl) rasm saqlanib qolardi.
    if (window._cspPending && window._cspPending.then) {
      var btn = document.getElementById("csp-save");
      if (btn) {
        btn.disabled = true;
        btn.textContent =
          "⏳ " + tl("Rasm tayyorlanmoqda…", "Обработка…", "Processing…");
      }
      window._cspPending.then(function () {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "💾 " + tl("Saqlash", "Сохранить", "Save");
        }
        window.csSaveProduct(editId);
      });
      return;
    }
    var name = (document.getElementById("csp-name").value || "").trim();
    var price = parseInt(document.getElementById("csp-price").value) || 0;
    var stock = parseInt(document.getElementById("csp-stock").value);
    var url = (document.getElementById("csp-url").value || "").trim();
    if (!name) {
      crmAlert(tl("Nomini kiriting!", "Введите название!", "Enter name!"));
      return;
    }
    if (price <= 0) {
      crmAlert(tl("Coin narxini kiriting!", "Введите цену!", "Enter price!"));
      return;
    }
    if (isNaN(stock) || stock < 0) {
      crmAlert(tl("Sonini kiriting!", "Введите остаток!", "Enter stock!"));
      return;
    }
    function done(img) {
      var items = getShop();
      if (editId) {
        var idx = items.findIndex(function (x) {
          return x.id === editId;
        });
        if (idx >= 0)
          items[idx] = Object.assign({}, items[idx], {
            name: name,
            price: price,
            stock: stock,
            image: img !== undefined ? img : items[idx].image,
          });
      } else {
        items.push({
          id: "p_" + Date.now(),
          name: name,
          price: price,
          stock: stock,
          image: img || null,
        });
      }
      try {
        saveShop(items);
      } catch (e) {
        // localStorage kvotasi to'lgan bo'lsa — foydalanuvchi sababini bilsin
        crmAlert(
          tl(
            "Rasm juda katta — saqlab bo'lmadi. Kichikroq rasm tanlang.",
            "Изображение слишком большое — не удалось сохранить.",
            "Image is too large to save. Please pick a smaller one.",
          ),
        );
        return;
      }
      window._cspImg = null;
      window._cspImgRaw = null;
      var m = document.getElementById("cs-prod-modal");
      if (m) m.remove();
      toast(
        "✅ " +
          (editId
            ? tl("Yangilandi", "Обновлено", "Updated")
            : tl("Qo'shildi", "Добавлено", "Added")) +
          ": " +
          name,
        "#0d9488",
      );
      renderAdminCoinShop();
    }
    // _cspImg — fayldan yuklangan (siqilgan) yoki URL orqali kiritilgan rasm
    done(window._cspImg || url || null);
  };

  window.csDeleteProduct = async function (id) {
    if (!(await crmConfirm(tl("O'chirasizmi?", "Удалить?", "Delete?"), { danger: true })))
      return;
    saveShop(
      getShop().filter(function (x) {
        return x.id !== id;
      }),
    );
    toast("🗑 " + tl("O'chirildi", "Удалено", "Deleted"), "#f59e0b");
    renderAdminCoinShop();
  };

  // ===================================================
  // MENTORGA COIN YUBORISH MODAL
  // Barcha mentorlar + ularning barcha guruhlari
  // ===================================================
  window.csOpenSendCoin = function (pre) {
    var mentors = (window.D && window.D.mentors) || [];
    if (!mentors.length) {
      crmAlert(tl("Mentorlar yo'q!", "Менторов нет!", "No mentors!"));
      return;
    }
    var old = document.getElementById("cs-send-modal");
    if (old) old.remove();
    var ov = document.createElement("div");
    ov.id = "cs-send-modal";
    ov.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9100;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px)";
    ov.onclick = function (e) {
      if (e.target === ov) ov.remove();
    };
    document.body.appendChild(ov);

    // HAMMA mentorlar — nechta bo'lsa ham barchasi
    var rows = mentors
      .map(function (m) {
        var grps = ((window.D && window.D.groups) || []).filter(function (g) {
          return g.mentor === m.name;
        });
        var stus = ((window.D && window.D.students) || []).filter(function (s) {
          return grps.some(function (g) {
            return g.id === s.groupId;
          });
        });
        var safe = "msrow_" + m.name.replace(/[^a-zA-Z0-9]/g, "_");
        var sel = pre && pre === m.name;
        return (
          '<div id="' +
          safe +
          '" onclick="csSelMentor(\'' +
          escJs(m.name) +
          "')\"" +
          ' class="cs-mrow' +
          (sel ? " selected" : "") +
          '">' +
          '<div style="width:46px;height:46px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#d97706);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;color:#fff;flex-shrink:0">' +
          (m.name[0] || "M") +
          "</div>" +
          '<div style="flex:1;min-width:0">' +
          '<div style="font-size:14px;font-weight:800;margin-bottom:3px">' +
          esc(m.name) +
          "</div>" +
          '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
          '<span style="font-size:11px;color:var(--text2)">📚 ' +
          grps.length +
          " " +
          tl("guruh", "групп", "groups") +
          "</span>" +
          '<span style="font-size:11px;color:var(--text2)">👥 ' +
          stus.length +
          " " +
          tl("talaba", "студ.", "students") +
          "</span>" +
          "</div>" +
          "</div>" +
          '<span id="chk_' +
          safe +
          '" style="font-size:20px;' +
          (sel ? "" : "display:none") +
          '">✅</span>' +
          "</div>"
        );
      })
      .join("");

    var box = document.createElement("div");
    box.style.cssText =
      "background:var(--bg);border-radius:22px;overflow:hidden;max-width:500px;width:100%;box-shadow:0 24px 60px rgba(0,0,0,.28);max-height:94vh;display:flex;flex-direction:column;animation:csUp .25s";
    box.innerHTML =
      '<div style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:22px 24px;color:#fff;position:relative;overflow:hidden;flex-shrink:0">' +
      '<div style="position:absolute;right:-18px;top:-18px;font-size:90px;opacity:.1;pointer-events:none">🪙</div>' +
      '<div style="font-size:21px;font-weight:900;margin-bottom:3px">🎁 ' +
      tl("Mentorga coin yuborish", "Монеты ментору", "Send Coins to Mentor") +
      "</div>" +
      '<div style="font-size:12px;opacity:.88">' +
      tl(
        "Mentor tanlanadi → uning barcha guruhlari teng coin oladi",
        "Выберите ментора → все его группы получат монеты",
        "Select mentor → all groups receive coins equally",
      ) +
      "</div>" +
      "</div>" +
      '<div style="padding:20px 24px;overflow-y:auto;flex:1">' +
      '<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px">' +
      tl("Mentorni tanlang", "Выберите ментора", "Select Mentor") +
      "</div>" +
      // BARCHA mentorlar scroll bilan
      '<div style="max-height:310px;overflow-y:auto;padding-right:3px;margin-bottom:16px">' +
      rows +
      "</div>" +
      '<div id="cs-send-info" style="display:none;margin-bottom:14px;padding:12px 16px;background:var(--teal-light);border:1.5px solid var(--teal);border-radius:12px;font-size:12px;color:var(--teal-text);line-height:1.6"></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
      '<div><label style="font-size:12px;font-weight:700;color:var(--text);display:block;margin-bottom:5px">🪙 ' +
      tl("Coin miqdori *", "Количество *", "Amount *") +
      "</label>" +
      '<div style="position:relative"><span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);font-size:16px;pointer-events:none">🪙</span>' +
      '<input id="cs-send-amt" type="number" min="1" class="cs-modal-input" style="padding:11px 14px 11px 38px;font-size:20px;font-weight:900;" placeholder="500" oninput="csUpdateInfo()"></div></div>' +
      '<div><label style="font-size:12px;font-weight:700;color:var(--text);display:block;margin-bottom:5px">💬 ' +
      tl("Sabab", "Причина", "Reason") +
      "</label>" +
      '<input id="cs-send-rsn" type="text" class="cs-modal-input" style="padding:11px 14px;font-size:13px;" placeholder="' +
      tl("Oylik mukofot", "Ежемес. награда", "Monthly reward") +
      '"></div>' +
      "</div>" +
      "</div>" +
      '<div style="padding:16px 24px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;flex-shrink:0;background:var(--bg3)">' +
      '<button onclick="document.getElementById(\'cs-send-modal\').remove()" style="padding:11px 22px;border-radius:11px;border:2px solid var(--border2);background:var(--bg2);color:var(--text);font-size:13px;font-weight:600;cursor:pointer">' +
      tl("Bekor", "Отмена", "Cancel") +
      "</button>" +
      '<button id="cs-send-btn" onclick="csSendCoins()" style="padding:11px 28px;border-radius:11px;border:none;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;font-size:14px;font-weight:800;cursor:pointer">🪙 ' +
      tl("Yuborish", "Отправить", "Send") +
      "</button>" +
      "</div>";

    ov.appendChild(box);
    window._csSel = pre || null;
    if (pre) csUpdateInfo();
  };

  window.csSelMentor = function (name) {
    window._csSel = name;
    document.querySelectorAll('[id^="msrow_"]').forEach(function (el) {
      el.classList.remove("selected");
    });
    var safe = "msrow_" + name.replace(/[^a-zA-Z0-9]/g, "_");
    var row = document.getElementById(safe);
    if (row) row.classList.add("selected");
    var chks = document.querySelectorAll('[id^="chk_msrow_"]');
    chks.forEach(function (el) {
      el.style.display = "none";
    });
    var chk = document.getElementById("chk_" + safe);
    if (chk) chk.style.display = "inline";
    csUpdateInfo();
  };

  window.csUpdateInfo = function () {
    var name = window._csSel;
    var amt =
      parseInt((document.getElementById("cs-send-amt") || {}).value) || 0;
    var info = document.getElementById("cs-send-info");
    if (!info) return;
    if (!name) {
      info.style.display = "none";
      return;
    }
    var grps = ((window.D && window.D.groups) || []).filter(function (g) {
      return g.mentor === name;
    });
    var stus = ((window.D && window.D.students) || []).filter(function (s) {
      return grps.some(function (g) {
        return g.id === s.groupId;
      });
    });
    var grpCount = Math.max(1, grps.length);
    var total = amt * grpCount;
    info.style.display = "block";
    info.innerHTML =
      "✅ <b>" +
      esc(name) +
      "</b><br>" +
      "🪙 <b>" +
      amt +
      "</b> × <b>" +
      grpCount +
      "</b> " +
      tl("guruh", "групп", "groups") +
      " = <b>🪙 " +
      total +
      "</b><br>" +
      "📚 <b>" +
      grps.length +
      "</b> " +
      tl("guruh", "групп", "groups") +
      " &nbsp;·&nbsp; 👥 <b>" +
      stus.length +
      "</b> " +
      tl("talaba", "студентов", "students");
  };

  // 🔧 BUG FIX: admin mentorga coin berganda, agar mentorning bir nechta
  // guruhi bo'lsa, har bir guruh uchun ALOHIDA localStorage yozuvi (demak
  // alohida tarmoq so'rovi) qilinardi. Bu localhostda (deyarli lahzalik
  // tarmoq) bilinmasdi, lekin production serverida (Render'gacha yuqoriroq
  // va o'zgaruvchan kechikish bilan) bu so'rovlar tartibsiz yetib borib,
  // oxirgi yetib kelgan (kamroq ma'lumotli) yozuv avvalgilarini "yo'qotib"
  // qo'yishi mumkin edi. Endi hammasi BITTA o'qish-yozishda bajariladi.
  function giveMentorCoinsBatch(name, groupIds, amtPerGroup, fallbackTotal) {
    var c = getCoins();
    if (groupIds && groupIds.length > 0) {
      groupIds.forEach(function (gid) {
        var mk = _mgKey(name, gid);
        c[mk] = (c[mk] || 0) + amtPerGroup;
      });
    } else {
      var mnk = "m_" + name;
      c[mnk] = (c[mnk] || 0) + fallbackTotal;
    }
    saveCoins(c);
  }

  window.csSendCoins = async function () {
    // 🔧 BUG FIX: localStorage'dagi coin ma'lumoti faqat SAHIFA OCHILGANDA
    // backend'dan bir marta yuklanadi. Agar admin panel bir qurilmada
    // (masalan kompyuterda) uzoq vaqt ochiq tursa-yu, shu orada BOSHQA
    // qurilmadan (telefondan) coin qo'shilsa, kompyuterning keshi buni
    // bilmay qoladi. Keyin kompyuterdan coin qo'shilsa, u ESKI (stale)
    // qiymat ustiga qo'shib, serverdagi yangi (telefondan qo'shilgan)
    // qiymatni butunlay O'CHIRIB YUBORARDI. Shuning uchun coin qo'shishdan
    // OLDIN har doim backend'dan eng so'nggi holatni qayta yuklaymiz.
    var sendBtn0 = document.getElementById("cs-send-btn");
    if (sendBtn0) {
      sendBtn0.disabled = true;
      sendBtn0.textContent = tl("Yuklanmoqda...", "Загрузка...", "Loading...");
    }
    await new Promise(function (resolve) {
      loadFromBackend(resolve);
    });
    if (sendBtn0) {
      sendBtn0.disabled = false;
      sendBtn0.textContent = "🪙 " + tl("Yuborish", "Отправить", "Send");
    }

    var name = window._csSel;
    var amt =
      parseInt((document.getElementById("cs-send-amt") || {}).value) || 0;
    var rsn = (
      (document.getElementById("cs-send-rsn") || {}).value ||
      tl("Admin yubordi", "Отправил админ", "Admin sent")
    ).trim();
    if (!name) {
      crmAlert(tl("Mentor tanlang!", "Выберите ментора!", "Select a mentor!"));
      return;
    }
    if (amt <= 0) {
      crmAlert(
        tl("Coin miqdori kiriting!", "Введите количество!", "Enter amount!"),
      );
      return;
    }

    var grps = ((window.D && window.D.groups) || []).filter(function (g) {
      return g.mentor === name;
    });
    var stus = ((window.D && window.D.students) || []).filter(function (s) {
      return grps.some(function (g) {
        return g.id === s.groupId;
      });
    });
    var grpCount = Math.max(1, grps.length);
    var total = amt * grpCount;

    // 🔧 BUG FIX: bitta atomik operatsiyada (poyga holatisiz)
    giveMentorCoinsBatch(
      name,
      grps.map(function (g) {
        return g.id;
      }),
      amt,
      total,
    );

    // Purchases tarixiga qo'shish
    var purchases = getPurchases();
    purchases.push({
      id: Date.now(),
      type: "admin-send",
      mentorName: name,
      amount: total,
      perGroup: amt,
      groupCount: grpCount,
      reason: rsn,
      studentCount: stus.length,
      date: new Date().toISOString(),
    });
    savePurchases(purchases);

    // 🔧 BUG FIX: backend tasdiqlashini kutamiz — shunda foydalanuvchi
    // darhol sahifani yangilasa ham, coin "yo'qolib qolmaydi"
    var sendBtn = document.getElementById("cs-send-btn");
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.textContent = tl("Saqlanmoqda...", "Сохранение...", "Saving...");
    }
    await awaitCoinSync();

    document.getElementById("cs-send-modal").remove();
    window._csSel = null;
    toast(
      "🎁 " +
        esc(name) +
        " — 🪙" +
        amt +
        "×" +
        grpCount +
        " = 🪙" +
        total +
        " " +
        tl("qo'shildi!", "добавлено!", "added!"),
      "#0d9488",
    );
    updateMentorCoinTopbar();
    renderAdminCoinShop();
  };

  // ===================================================
  // TALABA COIN SHOP
  // Tepasiada coin balansi + admin qoshgan mahsulotlar
  // ===================================================
  window.renderStudentCoinShop = function () {
    var wrap = document.getElementById("panel-student-coin-shop");
    if (!wrap) return;
    injectStyles();
    var cu = window.getCurrentUser ? window.getCurrentUser() : {};
    var stuId = cu.studentId ? parseInt(cu.studentId) : null;
    var stu = ((window.D && window.D.students) || []).find(function (s) {
      return s.id === stuId;
    });
    var bal = getStudentBal(stuId);
    var items = getShop();
    var myBuys = getPurchases().filter(function (p) {
      return p.studentId === stuId;
    });

    wrap.innerHTML =
      '<div style="padding:0 0 40px">' +
      // ── Hero coin kartochkasi ──────────────────────
      '<div style="background:linear-gradient(135deg,#f59e0b 0%,#d97706 50%,#b45309 100%);border-radius:22px;padding:28px 28px 22px;color:#fff;margin-bottom:24px;position:relative;overflow:hidden;box-shadow:0 8px 32px rgba(245,158,11,.4)">' +
      '<div style="position:absolute;right:-30px;top:-30px;font-size:140px;opacity:.1;pointer-events:none">🪙</div>' +
      '<div style="position:absolute;left:-10px;bottom:-20px;font-size:100px;opacity:.07;pointer-events:none">✨</div>' +
      '<div style="font-size:11px;font-weight:800;opacity:.8;text-transform:uppercase;letter-spacing:.12em;margin-bottom:6px">💰 ' +
      tl("Mening balansi", "Мой баланс", "My Balance") +
      "</div>" +
      '<div style="font-size:58px;font-weight:900;letter-spacing:-2px;line-height:1;margin-bottom:12px;text-shadow:0 2px 12px rgba(0,0,0,.2)">🪙 ' +
      bal +
      "</div>" +
      '<div style="display:flex;align-items:center;gap:10px">' +
      '<div style="width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900">' +
      (stu ? (stu.name || "T")[0].toUpperCase() : "T") +
      "</div>" +
      "<div>" +
      '<div style="font-size:14px;font-weight:800">' +
      (stu ? esc(stu.name) : "") +
      "</div>" +
      '<div style="font-size:11px;opacity:.75">' +
      tl("Talaba", "Студент", "Student") +
      "</div>" +
      "</div>" +
      "</div>" +
      "</div>" +
      // ── Stats row ─────────────────────────────────
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px">' +
      '<div style="background:linear-gradient(135deg,#fef3c7,#fde68a);border:1.5px solid #fbbf24;border-radius:16px;padding:14px 16px;text-align:center">' +
      '<div style="font-size:28px;font-weight:900;color:#92400e">🛍️ ' +
      items.length +
      "</div>" +
      '<div style="font-size:11px;font-weight:700;color:#a16207">' +
      tl("Do'kondagi mahsulotlar", "Товаров в магазине", "Products in shop") +
      "</div>" +
      "</div>" +
      '<div style="background:linear-gradient(135deg,#d1fae5,#a7f3d0);border:1.5px solid #6ee7b7;border-radius:16px;padding:14px 16px;text-align:center">' +
      '<div style="font-size:28px;font-weight:900;color:#065f46">🧾 ' +
      myBuys.length +
      "</div>" +
      '<div style="font-size:11px;font-weight:700;color:#047857">' +
      tl("Xaridlarim", "Мои покупки", "My purchases") +
      "</div>" +
      "</div>" +
      "</div>" +
      // ── Tabs ─────────────────────────────────────
      '<div style="display:flex;gap:8px;margin-bottom:22px">' +
      '<button id="cstab-st" onclick="csStudentTab(\'shop\')" class="cs-tab cs-tab-act" style="flex:1;padding:11px;font-size:14px">🛍️ ' +
      tl("Do'kon", "Магазин", "Shop") +
      " (" +
      items.length +
      ")</button>" +
      '<button id="cstab-sb" onclick="csStudentTab(\'buys\')" class="cs-tab" style="flex:1;padding:11px;font-size:14px">🧾 ' +
      tl("Xaridlarim", "Покупки", "My Buys") +
      " (" +
      myBuys.length +
      ")</button>" +
      "</div>" +
      '<div id="stu-shop-panel">' +
      renderStudentShopGrid(items, bal, stuId) +
      "</div>" +
      '<div id="stu-buys-panel" style="display:none">' +
      renderStudentPurchases(myBuys) +
      "</div>" +
      "</div>";
    setTimeout(csScanShopImages, 20);
  };

  window.csStudentTab = function (t) {
    var sp = document.getElementById("stu-shop-panel");
    var bp = document.getElementById("stu-buys-panel");
    var st = document.getElementById("cstab-st");
    var sb = document.getElementById("cstab-sb");
    if (sp) sp.style.display = t === "shop" ? "block" : "none";
    if (bp) bp.style.display = t === "buys" ? "block" : "none";
    if (st) st.className = t === "shop" ? "cs-tab cs-tab-act" : "cs-tab";
    if (sb) sb.className = t === "buys" ? "cs-tab cs-tab-act" : "cs-tab";
    setTimeout(csScanShopImages, 20);
  };

  function renderStudentShopGrid(items, bal, stuId) {
    if (!items.length)
      return (
        '<div style="text-align:center;padding:80px 20px;color:var(--text3)">' +
        '<div style="font-size:72px;margin-bottom:16px;filter:grayscale(.3)">🛒</div>' +
        '<div style="font-size:18px;font-weight:800;margin-bottom:8px">' +
        tl("Do\'konda mahsulot yo\'q", "Магазин пуст", "Shop is empty") +
        "</div>" +
        '<div style="font-size:13px;opacity:.7">' +
        tl(
          "Admin hali mahsulot qo\'shmagan",
          "Администратор ещё не добавил товары",
          "Admin has not added products yet",
        ) +
        "</div>" +
        "</div>"
      );
    return (
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:20px">' +
      items
        .map(function (item) {
          var st = item.stock || 0,
            so = st <= 0,
            canBuy = bal >= item.price && !so;
          var cardBorder = canBuy
            ? "rgba(16,185,129,0.4)"
            : so
              ? "rgba(239,68,68,0.3)"
              : "var(--border)";
          var cardGlow = canBuy
            ? "0 4px 20px rgba(16,185,129,.2)"
            : "0 2px 12px rgba(0,0,0,.07)";
          return (
            '<div class="cs-shop-card' +
            (canBuy ? "" : " is-off") +
            '" style="background:var(--bg);border-radius:20px;overflow:hidden;border:2px solid ' +
            cardBorder +
            ";box-shadow:" +
            cardGlow +
            ';position:relative">' +
            // Az qoldi badge
            (!so && st <= 3 && st > 0
              ? '<div style="position:absolute;top:10px;right:10px;z-index:2;background:#f59e0b;color:#fff;font-size:10px;font-weight:800;padding:3px 10px;border-radius:20px;box-shadow:0 2px 8px rgba(0,0,0,.2)">⚡ ' +
                st +
                " " +
                tl("qoldi", "осталось", "left") +
                "</div>"
              : "") +
            // Rasm — to'liq ko'rinadi (contain), kesilmaydi va kartadan
            // tashqariga chiqmaydi. Balandlik nisbat orqali beriladi.
            imgBox(item.image, {
              variant: "card",
              alt: item.name,
              phSize: "56px",
              zoom: canBuy,
              overlay:
                (so
                  ? '<div class="cs-img-veil"><span style="color:#fff;font-size:14px;font-weight:800;border:2px solid rgba(255,255,255,.7);padding:5px 16px;border-radius:20px;letter-spacing:.05em">' +
                    tl("TUGAGAN", "НЕТУ", "SOLD OUT") +
                    "</span></div>"
                  : "") +
                (canBuy
                  ? '<div class="cs-img-badge" style="bottom:8px;left:8px;background:rgba(16,185,129,.88);backdrop-filter:blur(4px);color:#fff;font-size:10px;font-weight:800;padding:3px 10px;border-radius:20px">✅ ' +
                    tl("Sotib olish mumkin", "Можно купить", "Available") +
                    "</div>"
                  : ""),
            }) +
            // Karta ma\'lumotlari
            '<div style="padding:16px 16px 14px">' +
            '<div style="font-size:15px;font-weight:800;margin-bottom:10px;line-height:1.35;color:var(--text)">' +
            esc(item.name) +
            "</div>" +
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">' +
            coinPill(item.price, true) +
            (bal < item.price && !so
              ? '<span style="font-size:11px;font-weight:700;color:#ef4444;background:#fef2f2;padding:3px 9px;border-radius:12px;border:1px solid #fecaca">−' +
                (item.price - bal) +
                "🪙</span>"
              : "") +
            "</div>" +
            (so
              ? '<button disabled style="width:100%;padding:10px;border-radius:12px;border:none;background:var(--bg3);color:var(--text3);font-size:12px;font-weight:700">' +
                tl("Tugagan", "Нет в наличии", "Sold Out") +
                "</button>"
              : canBuy
                ? "<button onclick=\"csBuyItem('" +
                  escJs(item.id) +
                  '\')" class="cs-btn cs-btn-buy" style="width:100%;padding:11px;border-radius:12px;border:none;background:linear-gradient(135deg,#10b981,#059669);color:#fff;font-size:14px;font-weight:800;cursor:pointer;box-shadow:0 4px 14px rgba(16,185,129,.38)">🛒 ' +
                  tl("Sotib olish", "Купить", "Buy Now") +
                  "</button>"
                : '<button disabled style="width:100%;padding:10px;border-radius:12px;border:none;background:linear-gradient(135deg,#fef3c7,#fde68a);color:#92400e;font-size:12px;font-weight:700">💔 ' +
                  tl("Coin yetmaydi", "Монет не хватает", "Not enough") +
                  "</button>") +
            "</div>" +
            "</div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function renderStudentPurchases(buys) {
    if (!buys.length)
      return (
        '<div style="text-align:center;padding:50px;color:var(--text3)"><div style="font-size:44px;margin-bottom:12px">🛍️</div><div style="font-size:14px">' +
        tl(
          "Hali hech narsa sotib olmadingiz",
          "Вы ещё ничего не купили",
          "You haven't bought anything yet",
        ) +
        "</div></div>"
      );
    var sorted = buys.slice().sort(function (a, b) {
      return new Date(b.date) - new Date(a.date);
    });
    return (
      '<div style="display:flex;flex-direction:column;gap:10px">' +
      sorted
        .map(function (p) {
          return (
            '<div class="cs-buyrow" style="background:var(--bg);border:1.5px solid var(--border2);border-radius:14px;padding:14px 16px;display:flex;align-items:center;gap:14px;box-shadow:0 1px 4px rgba(0,0,0,.05)">' +
            imgThumb(p.itemImage, 48, 10) +
            '<div style="flex:1;min-width:0">' +
            '<div style="font-size:14px;font-weight:700;margin-bottom:4px">' +
            esc(p.itemName || "—") +
            "</div>" +
            '<div style="font-size:11px;color:var(--text3)">' +
            fmtDate(p.date) +
            (purchaseStatus(p) === "rejected"
              ? " · ↩️ " +
                tl(
                  "coin qaytarildi",
                  "монеты возвращены",
                  "coins refunded",
                )
              : "") +
            "</div>" +
            "</div>" +
            coinPill(p.coinPrice || 0) +
            statusBadge(purchaseStatus(p)) +
            "</div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  // ── Sotib olish modali ──────────────────────────
  window.csBuyItem = function (itemId) {
    var item = getShop().find(function (x) {
      return x.id === itemId;
    });
    if (!item) {
      crmAlert(
        tl("Mahsulot topilmadi!", "Товар не найден!", "Product not found!"),
      );
      return;
    }
    var cu = window.getCurrentUser ? window.getCurrentUser() : {};
    var stuId = cu.studentId ? parseInt(cu.studentId) : null;
    var bal = getStudentBal(stuId);
    if (bal < item.price) {
      crmAlert(
        tl("Coin yetarli emas!", "Недостаточно монет!", "Not enough coins!"),
      );
      return;
    }
    if ((item.stock || 0) <= 0) {
      crmAlert(tl("Mahsulot tugagan!", "Товар закончился!", "Out of stock!"));
      return;
    }

    var old = document.getElementById("cs-buy-modal");
    if (old) old.remove();
    var ov = document.createElement("div");
    ov.id = "cs-buy-modal";
    ov.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px)";
    ov.onclick = function (e) {
      if (e.target === ov) ov.remove();
    };
    document.body.appendChild(ov);

    var box = document.createElement("div");
    box.style.cssText =
      "background:var(--bg);border-radius:22px;overflow:hidden;max-width:340px;width:100%;box-shadow:0 24px 60px rgba(0,0,0,.3);text-align:center;animation:csUp .25s";
    box.innerHTML =
      '<div style="background:linear-gradient(135deg,#10b981,#0d9488);padding:22px 20px;color:#fff;position:relative;overflow:hidden">' +
      '<div style="position:absolute;right:-10px;top:-10px;font-size:80px;opacity:.1;pointer-events:none">🛒</div>' +
      imgBox(item.image, {
        alt: item.name,
        phSize: "34px",
        style:
          "width:80px;height:80px;border-radius:14px;margin:0 auto 12px;" +
          "box-shadow:0 4px 16px rgba(0,0,0,.25)",
      }) +
      '<div style="font-size:17px;font-weight:800;margin-bottom:8px">' +
      esc(item.name) +
      "</div>" +
      coinPill(item.price, true) +
      "</div>" +
      '<div style="padding:22px 20px">' +
      '<div style="font-size:13px;color:var(--text2);margin-bottom:16px;line-height:1.6">' +
      tl(
        "Sotib olishni tasdiqlaysizmi?",
        "Подтвердить покупку?",
        "Confirm purchase?",
      ) +
      "<br>" +
      '<span style="color:#059669;font-weight:700">' +
      tl("Sizda qoladi", "У вас останется", "You will have") +
      ": 🪙 " +
      (bal - item.price) +
      "</span></div>" +
      // 🔐 Parol tasdiqlash — xarid faqat to'g'ri parol bilan
      '<div style="text-align:left;margin-bottom:14px">' +
      '<label style="font-size:12px;font-weight:700;color:var(--text);display:block;margin-bottom:6px">🔐 ' +
      tl(
        "Tasdiqlash uchun parolingizni kiriting",
        "Введите пароль для подтверждения",
        "Enter your password to confirm",
      ) +
      "</label>" +
      '<input id="cs-buy-pass" type="password" autocomplete="current-password" placeholder="••••••••" style="width:100%;padding:11px 14px;border:2px solid var(--border2);border-radius:11px;font-size:15px;outline:none;box-sizing:border-box;background:var(--bg2);color:var(--text)" onkeydown="if(event.key===\'Enter\')csConfirmBuy(\'' +
      escJs(itemId) +
      '\')">' +
      '<div id="cs-buy-err" style="display:none;margin-top:7px;font-size:12px;font-weight:700;color:#ef4444"></div>' +
      "</div>" +
      '<div style="display:flex;gap:8px">' +
      '<button onclick="document.getElementById(\'cs-buy-modal\').remove()" style="flex:1;padding:12px;border-radius:12px;border:2px solid var(--border2);background:var(--bg2);color:var(--text);font-size:13px;font-weight:600;cursor:pointer">' +
      tl("Bekor", "Отмена", "Cancel") +
      "</button>" +
      "<button id=\"cs-buy-go\" onclick=\"csConfirmBuy('" +
      escJs(itemId) +
      '\')" style="flex:1;padding:12px;border-radius:12px;border:none;background:linear-gradient(135deg,#10b981,#0d9488);color:#fff;font-size:14px;font-weight:800;cursor:pointer">🛒 ' +
      tl("Sotib olish", "Купить", "Buy") +
      "</button>" +
      "</div>" +
      "</div>";
    ov.appendChild(box);
    setTimeout(function () {
      var pi = document.getElementById("cs-buy-pass");
      if (pi) pi.focus();
    }, 120);
  };

  // ── Talaba parolini tekshirish ───────────────────────────
  // Xarid faqat o'z parolini kiritgan talaba tomonidan amalga oshiriladi.
  function verifyStudentPassword(pass, cb) {
    var cu = window.getCurrentUser ? window.getCurrentUser() : {};
    var users =
      typeof window.getStudentUsers === "function"
        ? window.getStudentUsers()
        : [];
    var sid = cu.studentId != null ? String(cu.studentId) : null;
    // Avval studentId bo'yicha aniq moslik; topilmasa — ism bo'yicha zaxira
    var mine = users.filter(function (u) {
      return sid && u.studentId != null && String(u.studentId) === sid;
    });
    if (!mine.length) {
      mine = users.filter(function (u) {
        if (u.studentName && cu.studentName && u.studentName === cu.studentName)
          return true;
        return !!(u.name && cu.name && u.name === cu.name);
      });
    }
    if (!mine.length) return cb(false, "nouser");
    function match(hash) {
      return mine.some(function (u) {
        return u.pass === pass || (hash && u.pass === hash);
      });
    }
    if (typeof window.sha256Hex === "function") {
      window
        .sha256Hex(pass)
        .then(function (h) {
          cb(match(h), null);
        })
        .catch(function () {
          cb(match(null), null);
        });
    } else {
      cb(match(null), null);
    }
  }

  window.csConfirmBuy = function (itemId) {
    var passEl = document.getElementById("cs-buy-pass");
    // Modal orqali kelgan xarid — avval parol tekshiriladi
    if (passEl) {
      var errEl = document.getElementById("cs-buy-err");
      var btn = document.getElementById("cs-buy-go");
      var pass = passEl.value || "";
      function fail(msg) {
        if (errEl) {
          errEl.textContent = msg;
          errEl.style.display = "block";
        }
        passEl.value = "";
        passEl.style.borderColor = "#ef4444";
        passEl.focus();
        if (btn) {
          btn.disabled = false;
          btn.style.opacity = "1";
        }
      }
      if (!pass.trim())
        return fail(
          "🔐 " +
            tl("Parolni kiriting!", "Введите пароль!", "Enter your password!"),
        );
      if (btn) {
        btn.disabled = true;
        btn.style.opacity = ".6";
      }
      if (errEl) errEl.style.display = "none";
      verifyStudentPassword(pass.trim(), function (ok, why) {
        if (!ok) {
          if (why === "nouser")
            return fail(
              "⚠️ " +
                tl(
                  "Hisobingiz topilmadi — qaytadan kiring",
                  "Аккаунт не найден — войдите заново",
                  "Account not found — please log in again",
                ),
            );
          return fail(
            "❌ " +
              tl("Parol noto'g'ri!", "Неверный пароль!", "Wrong password!"),
          );
        }
        passEl.remove(); // qayta tekshirilmasin
        csConfirmBuy(itemId);
      });
      return;
    }
    var cu = window.getCurrentUser ? window.getCurrentUser() : {};
    var stuId = cu.studentId ? parseInt(cu.studentId) : null;
    var items = getShop();
    var item = items.find(function (x) {
      return x.id === itemId;
    });
    if (!item) {
      crmAlert(tl("Mahsulot topilmadi!", "Не найдено!", "Not found!"));
      return;
    }
    var bal = getStudentBal(stuId);
    if (bal < item.price || item.stock <= 0) {
      crmAlert(
        tl("Xarid amalga oshmadi!", "Покупка не удалась!", "Purchase failed!"),
      );
      return;
    }

    setStudentBal(stuId, bal - item.price);
    item.stock = Math.max(0, item.stock - 1);
    saveShop(items);

    var stu = ((window.D && window.D.students) || []).find(function (s) {
      return s.id === stuId;
    });
    var purchases = getPurchases();
    purchases.push({
      id: "buy_" + Date.now(),
      studentId: stuId,
      studentName: stu ? stu.name : "—",
      itemId: item.id,
      itemName: item.name,
      itemImage: item.image || null,
      coinPrice: item.price,
      date: new Date().toISOString(),
      approved: false,
    });
    savePurchases(purchases);

    var m = document.getElementById("cs-buy-modal");
    if (m) m.remove();
    toast(
      '🎉 "' +
        item.name +
        '" ' +
        tl(
          "sotib olindi! −" + item.price + " coin",
          "куплено! −" + item.price + " монет",
          "purchased! −" + item.price + " coins",
        ),
      "#0d9488",
    );
    updateMentorCoinTopbar();
    renderStudentCoinShop();
  };

  // ===================================================
  // INIT — rolga qarab ko'rsatish
  // ===================================================
  function updateMentorCoinTopbar() {
    var cu = window.getCurrentUser ? window.getCurrentUser() : {};
    var mBar = document.getElementById("mentor-coin-topbar");
    var sBar = document.getElementById("student-coin-topbar");
    var amtEl = document.getElementById("mentor-coin-amount");
    var sAmtEl = document.getElementById("student-coin-amount");
    var mLbl = document.getElementById("mentor-coin-label");
    var sLbl = document.getElementById("student-coin-label");

    // Hide both first
    if (mBar) mBar.style.display = "none";
    if (sBar) sBar.style.display = "none";

    if (cu.role === "Mentor") {
      // Mentor coin topbar navbar dan olib tashlandi — hech narsa ko'rsatmaymiz
      if (mBar) mBar.style.display = "none";
    } else if (cu.role === "Talaba") {
      var stuId = cu.studentId ? parseInt(cu.studentId) : null;
      var sBal = getStudentBal(stuId);
      if (sAmtEl) sAmtEl.textContent = sBal;
      if (sLbl) sLbl.textContent = tl("Talaba", "Студент", "Student");
      if (sBar) sBar.style.display = "flex";
    }
    // Admin uchun hech qaysi topbar ko'rinmaydi
  }
  window.updateMentorCoinTopbar = updateMentorCoinTopbar;

  function init() {
    var cu = window.getCurrentUser ? window.getCurrentUser() : {};
    var navAdmin = document.getElementById("nav-coin-shop");
    var navStu = document.getElementById("nav-student-coin-shop");

    if (cu.role === "Talaba") {
      // Faqat talaba coin shop ko'rinadi
      if (navAdmin) navAdmin.style.display = "none";
      if (navStu) navStu.style.display = "flex";
    } else if (cu.role === "Mentor") {
      if (navAdmin) navAdmin.style.display = "none";
      if (navStu) navStu.style.display = "none";
    } else {
      // Admin
      if (navAdmin) navAdmin.style.display = "flex";
      if (navStu) navStu.style.display = "none";
    }

    // Backend dan yuklash, keyin render
    loadFromBackend(function () {
      updateMentorCoinTopbar();
      if (window.currentTab === "coin-shop") renderAdminCoinShop();
      if (window.currentTab === "student-coin-shop") renderStudentCoinShop();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(init, 900);
    });
  } else {
    setTimeout(init, 900);
  }

  // Login/logout da qayta ishlash
  var _origShowApp = window.showApp;
  if (typeof _origShowApp === "function") {
    window.showApp = function () {
      _origShowApp.apply(this, arguments);
      setTimeout(init, 400);
    };
  }

  // ===================================================
  // COIN BERISH / QAYTARIB OLISH — DAVOMAT JADVALIDAN
  // Miqdor MUSBAT bo'lsa  → guruh balansidan talabaga beriladi
  // Miqdor MANFIY bo'lsa  → talabadan guruh balansiga qaytariladi
  // (mentor xato bergan coinni "minus" qilib ortga olishi mumkin)
  // ===================================================

  // Barcha ekrandagi balans ko'rsatkichlarini yangilaydi
  function refreshCoinUI(studentId, mentorName, groupId) {
    var sBal = getStudentBal(studentId);
    var gBal = groupId
      ? getMentorGroupBal(mentorName, groupId)
      : getMentorBal(mentorName);

    // Davomat jadvalidagi talaba balansi
    var sEl = document.getElementById("sc-bal-" + studentId);
    if (sEl) sEl.textContent = sBal;

    // Guruh balansi — jadval sarlavhasi va ustun ichidagi ko'rsatkichlar
    document.querySelectorAll('[id^="sc-mbal-"]').forEach(function (el) {
      el.textContent = gBal;
    });
    document.querySelectorAll('[id^="sc-bal-mentor"]').forEach(function (el) {
      el.textContent = "Guruh: " + gBal;
    });
    var hdr = document.getElementById("att-mentor-bal-hdr");
    if (hdr) hdr.textContent = gBal;

    // Talaba detali paneli (agar ochiq bo'lsa)
    var dM = document.getElementById("detail-mentor-bal-" + studentId);
    if (dM) dM.textContent = "🪙 " + gBal;
    var dS = document.getElementById("detail-stu-bal-" + studentId);
    if (dS) dS.textContent = "🪙 " + sBal;

    return { s: sBal, g: gBal };
  }

  // Miqdorni tekshiradi: musbat — guruhda yetarli coin bormi,
  // manfiy — talabada qaytarib olishga yetarli coin bormi
  function validateCoinAmount(amt, gBal, sBal) {
    if (!amt) {
      return tl("Miqdor kiriting!", "Введите количество!", "Enter amount!");
    }
    if (amt > 0 && amt > gBal) {
      return tl(
        "Guruh balansida coin yetarli emas! Bor: 🪙" + gBal,
        "Монет в группе не хватает! Есть: 🪙" + gBal,
        "Not enough group coins! Available: 🪙" + gBal,
      );
    }
    if (amt < 0 && -amt > sBal) {
      return tl(
        "Talabada shuncha coin yo'q! Bor: 🪙" + sBal,
        "У студента нет столько монет! Есть: 🪙" + sBal,
        "Student doesn't have that many coins! Has: 🪙" + sBal,
      );
    }
    return null;
  }

  // Yagona umumiy logika (musbat ham, manfiy ham shu yerdan o'tadi)
  async function applyCoinChange(studentId, mentorName, groupId, amt, inp) {
    var gBal = groupId
      ? getMentorGroupBal(mentorName, groupId)
      : getMentorBal(mentorName);
    var sBal = getStudentBal(studentId);

    var err = validateCoinAmount(amt, gBal, sBal);
    if (err) {
      toast(err, "#ef4444");
      refreshCoinUI(studentId, mentorName, groupId);
      if (inp) {
        inp.style.borderColor = "#ef4444";
        setTimeout(function () {
          inp.style.borderColor = "";
        }, 1500);
      }
      return;
    }

    // 🔧 Atomik transfer: manfiy miqdorda yo'nalish teskari bo'ladi
    // (talabadan guruh balansiga qaytadi) — poyga holatisiz, bitta yozuv.
    transferCoinToStudent(mentorName, groupId, studentId, amt);
    await awaitCoinSync();

    if (inp) inp.value = "";
    document
      .querySelectorAll('[id^="sc-inp-' + studentId + '-"]')
      .forEach(function (el) {
        el.value = "";
      });

    var b = refreshCoinUI(studentId, mentorName, groupId);

    var stu = ((window.D && window.D.students) || []).find(function (s) {
      return s.id === studentId;
    });
    var nm = stu ? stu.name : tl("Talaba", "Студент", "Student");
    if (amt > 0) {
      toast(
        "✅ " +
          nm +
          " ga 🪙" +
          amt +
          " · " +
          tl("Guruhda qoldi", "В группе осталось", "Group balance") +
          ": 🪙" +
          b.g,
        "#0d9488",
      );
    } else {
      toast(
        "↩️ " +
          nm +
          " dan 🪙" +
          -amt +
          " " +
          tl("qaytarib olindi", "возвращено", "taken back") +
          " · " +
          tl("Talabada", "У студента", "Student") +
          ": 🪙" +
          b.s,
        "#ea580c",
      );
    }
    updateMentorCoinTopbar();
  }

  // Umumiy kirish nuqtasi — inputdagi qiymatni o'qib, backend'dan
  // eng so'nggi balansni olib, keyin qo'llaydi.
  function runCoinChange(studentId, mentorName, inp, sign) {
    var raw = parseInt(inp ? inp.value : 0) || 0;
    var amt = Math.abs(raw) * (sign < 0 ? -1 : raw < 0 ? -1 : 1);
    if (!amt) {
      toast(
        tl("Miqdor kiriting!", "Введите количество!", "Enter amount!"),
        "#ef4444",
      );
      if (inp) inp.focus();
      return;
    }
    var stu = ((window.D && window.D.students) || []).find(function (s) {
      return s.id === studentId;
    });
    var groupId = stu ? stu.groupId : null;
    // DOIM backend dan yangi balansni olamiz
    loadFromBackend(function () {
      applyCoinChange(studentId, mentorName, groupId, amt, inp);
    });
  }

  // sign: 1 (berish) yoki -1 (qaytarib olish). Ko'rsatilmasa,
  // inputdagi qiymatning ishorasi ishlatiladi (masalan "-50").
  window.csGiveCoin = function (studentId, mentorName, sign) {
    runCoinChange(
      studentId,
      mentorName,
      document.getElementById("sc-inp-" + studentId),
      sign,
    );
  };

  window.csTakeCoin = function (studentId, mentorName) {
    window.csGiveCoin(studentId, mentorName, -1);
  };

  // ===================================================
  // COIN BERISH / OLISH — DAVOMAT KATAGI ICHIDAN
  // ===================================================
  window.csGiveCoinFromCell = function (
    studentId,
    mentorName,
    inputSuffix,
    sign,
  ) {
    runCoinChange(
      studentId,
      mentorName,
      document.getElementById("sc-inp-" + inputSuffix),
      sign,
    );
  };

  window.csTakeCoinFromCell = function (studentId, mentorName, inputSuffix) {
    window.csGiveCoinFromCell(studentId, mentorName, inputSuffix, -1);
  };


  window.coinShop = {
    getShop: getShop,
    getCoins: getCoins,
    getMentorBal: getMentorBal,
    getMentorGroupBal: getMentorGroupBal,
    setMentorGroupBal: setMentorGroupBal,
    setMentorBal: setMentorBal, // 🔧 BUG FIX: avval eksport qilinmagan edi (mentor-coin-give.js TypeError berardi)
    getStudentBal: getStudentBal,
    setStudentBal: setStudentBal,
    transferCoinToStudent: transferCoinToStudent, // 🔧 BUG FIX: atomik (poyga holatisiz) coin berish
    awaitCoinSync: awaitCoinSync, // 🔧 BUG FIX: backend yozuvini kutish (darhol refresh qilinsa yo'qolmasin)
  };
})();
