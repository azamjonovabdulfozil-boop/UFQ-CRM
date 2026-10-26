/**
 * screen-fit.js — katta ekranlarda (2K, 4K, elektron doskalar) butun
 * interfeysni ekranga mos ravishda proporsional kattalashtiradi.
 *
 * Muammo: loyiha o'lchamlari qat'iy piksel bilan yozilgan. 4K monitorda
 * (3840px) hamma narsa juda mayda bo'lib, ekran o'rtasiga siqilib qolardi.
 *
 * Yechim: ekran ~1680×945 dan katta bo'lsa, <html> ga CSS `zoom` beriladi —
 * matn, karta, jadval, tugma, oraliqlar birga kattalashadi, ya'ni har qanday
 * katta ekran "1680px dagi ko'rinish"ning kattalashtirilgan nusxasini ko'radi.
 * 1680px va undan kichik ekranlarda hech narsa o'zgarmaydi (zoom = 1).
 *
 * Zoom ostida `100vh` / `100vw` ham kattalashib ketadi (brauzer spetsifikatsiyasi
 * bo'yicha), shuning uchun barcha CSS qoidalaridagi va style="" dagi viewport
 * birliklari `calc(100vh / var(--vk))` ko'rinishiga keltiriladi. --vk shu
 * brauzerda o'lchab topiladi (zoom'ni vh ga qo'llamaydigan brauzerda 1 bo'ladi).
 *
 * JS uchun: window.__uiZoom — getBoundingClientRect() pikselining CSS
 * pikselga nisbati (ekrandan o'lchangan qiymatni style ga yozishda bo'linadi).
 */
(function () {
  "use strict";
  if (window.__screenFit) return;
  window.__screenFit = true;

  var BASE_W = 1680; // shu kenglikkacha interfeys o'z holicha
  var BASE_H = 945;
  var MAX_Z = 3;
  var root = document.documentElement;

  // zoom faqat ekranda — chop etishda asl o'lcham
  var st = document.createElement("style");
  st.setAttribute("data-screen-fit", "");
  st.textContent =
    "html{zoom:var(--ui-zoom,1)}" +
    "@media print{html{zoom:1!important}}";
  (document.head || root).appendChild(st);

  function targetZoom() {
    var w = window.innerWidth || root.clientWidth;
    var h = window.innerHeight || root.clientHeight;
    var z = Math.min(w / BASE_W, h / BASE_H);
    if (!(z > 1.04)) return 1; // kichik farqda kattalashtirish shart emas
    return Math.min(MAX_Z, Math.round(z * 100) / 100);
  }

  function probe(css) {
    var d = document.createElement("div");
    d.style.cssText = "position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;" + css;
    (document.body || root).appendChild(d);
    var r = d.getBoundingClientRect();
    d.parentNode.removeChild(d);
    return r;
  }

  // zoom ostida vh qanchalik "kattalashadi" va ekran pikseli / CSS piksel
  function measure() {
    var ih = window.innerHeight || 1;
    var vk = probe("width:10px;height:100vh").height / ih;
    var gz = probe("width:100px;height:10px").width / 100;
    if (!(vk > 0.2 && vk < 10)) vk = 1;
    if (!(gz > 0.2 && gz < 10)) gz = 1;
    vk = Math.round(vk * 1000) / 1000;
    gz = Math.round(gz * 1000) / 1000;
    root.style.setProperty("--vk", String(vk));
    var changed = window.__uiZoom !== gz;
    window.__uiZoom = gz;
    if (changed) {
      try {
        window.dispatchEvent(new CustomEvent("uizoomchange", { detail: { zoom: gz } }));
      } catch (e) {}
    }
  }

  function apply() {
    var z = targetZoom();
    root.style.setProperty("--ui-zoom", String(z));
    root.classList.toggle("ui-zoomed", z > 1);
    measure();
  }

  /* ---- viewport birliklarini zoom'ga moslash ---- */
  var VP = /(-?\d*\.?\d+)(d|s|l)?(vh|vw|vmin|vmax)\b/g;
  function fixValue(v) {
    if (!v || v.indexOf("v") < 0 || v.indexOf("--vk") >= 0) return null;
    VP.lastIndex = 0;
    if (!VP.test(v)) return null;
    VP.lastIndex = 0;
    return v.replace(VP, function (m) {
      return "calc(" + m + " / var(--vk, 1))";
    });
  }
  function fixStyle(s) {
    if (!s) return;
    for (var i = 0; i < s.length; i++) {
      var name = s[i];
      var val = s.getPropertyValue(name);
      var nv = fixValue(val);
      if (nv) s.setProperty(name, nv, s.getPropertyPriority(name));
    }
  }
  function fixRules(rules) {
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      try {
        if (r.style && /v(h|w|min|max)\b/.test(r.style.cssText)) fixStyle(r.style);
        if (r.cssRules && r.cssRules.length) fixRules(r.cssRules); // @media, @supports, @keyframes
      } catch (e) {}
    }
  }
  var done = typeof WeakMap !== "undefined" ? new WeakMap() : null;
  function fixSheets() {
    var list = document.styleSheets;
    for (var i = 0; i < list.length; i++) {
      var sh = list[i];
      try {
        var rules = sh.cssRules; // boshqa domendagi (shrift) jadval — xato beradi
        if (!rules) continue;
        // <style> matni o'zgarsa (Vue HMR) qoidalar soni ham o'zgaradi
        if (done && done.get(sh) === rules.length) continue;
        fixRules(rules);
        if (done) done.set(sh, rules.length);
      } catch (e) {}
    }
  }
  function fixEl(el) {
    if (el && el.nodeType === 1 && el.style && el.style.length) {
      var a = el.getAttribute("style");
      if (a && /v(h|w|min|max)\b/.test(a) && a.indexOf("--vk") < 0) fixStyle(el.style);
    }
  }
  function fixTree(n) {
    if (!n || n.nodeType !== 1) return;
    fixEl(n);
    if (n.querySelectorAll) {
      var els = n.querySelectorAll("[style*='vh'],[style*='vw'],[style*='vmin'],[style*='vmax']");
      for (var i = 0; i < els.length; i++) fixEl(els[i]);
    }
  }

  var tSheets = null;
  function sheetsSoon() {
    clearTimeout(tSheets);
    tSheets = setTimeout(fixSheets, 20);
  }

  var tResize = null;
  function onResize() {
    clearTimeout(tResize);
    tResize = setTimeout(apply, 80);
  }

  function start() {
    apply();
    fixSheets();
    fixTree(document.body);
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === "attributes") {
          fixEl(m.target);
          continue;
        }
        if (m.type === "characterData") {
          sheetsSoon();
          continue;
        }
        for (var j = 0; j < m.addedNodes.length; j++) {
          var n = m.addedNodes[j];
          if (n.nodeType !== 1) {
            if (n.parentNode && n.parentNode.tagName === "STYLE") sheetsSoon();
            continue;
          }
          if (n.tagName === "STYLE" || n.tagName === "LINK") {
            sheetsSoon();
            if (n.tagName === "LINK") n.addEventListener("load", sheetsSoon);
          } else fixTree(n);
        }
      }
    }).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["style"] });
    window.addEventListener("load", function () {
      sheetsSoon();
      apply();
    });
    setTimeout(fixSheets, 1500);
    setTimeout(fixSheets, 5000);
  }

  // Zoom birinchi chizishdan OLDIN qo'yilsin — sahifa "sakramasin"
  root.style.setProperty("--ui-zoom", String(targetZoom()));
  window.__uiZoom = 1;
  window.addEventListener("resize", onResize);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", onResize);
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
})();
