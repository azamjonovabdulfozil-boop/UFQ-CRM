/**
 * ui-scale.js — «Matn o'lchami» (A) butun loyihadagi HAMMA matnga ta'sir qilsin.
 *
 * Muammo: harf o'lchamlarining ko'pi qat'iy piksel bilan yozilgan — CSS
 * fayllarda ham (font-size:13px), JS chizadigan HTML ichida ham
 * (style="font-size:12px"). Shuning uchun S/M/L/XL tanlansa, faqat
 * --ui-font-size ishlatilgan bir-ikki joy o'zgarardi.
 *
 * Yechim: har bir piksel o'lcham `calc(13px * var(--fs-scale))` ga
 * aylantiriladi (CSS qoidalari ham, keyin chiziladigan HTML ham —
 * MutationObserver orqali). --fs-scale body dagi fs-sm/md/lg/xl sinfidan
 * olinadi, shuning uchun o'lcham darhol, sahifani yangilamasdan o'zgaradi.
 */
(function () {
  "use strict";

  var SCALE = { "fs-sm": 0.88, "fs-md": 1, "fs-lg": 1.14, "fs-xl": 1.3 };
  var PX = /^\s*(\d+(?:\.\d+)?)px\s*$/;
  var root = document.documentElement;

  function applyScale() {
    var s = 1;
    var b = document.body;
    if (b)
      for (var k in SCALE)
        if (b.classList.contains(k)) {
          s = SCALE[k];
          break;
        }
    root.style.setProperty("--fs-scale", String(s));
  }

  function scaled(v) {
    var m = PX.exec(v || "");
    return m ? "calc(" + m[1] + "px * var(--fs-scale, 1))" : null;
  }

  /* CSS qoidalari */
  var doneSheets = typeof WeakSet !== "undefined" ? new WeakSet() : null;
  function fixRules(rules) {
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      try {
        if (r.style && r.style.fontSize) {
          var nv = scaled(r.style.fontSize);
          if (nv) r.style.setProperty("font-size", nv, r.style.getPropertyPriority("font-size"));
        }
        if (r.cssRules && r.cssRules.length) fixRules(r.cssRules); // @media va h.k.
      } catch (e) {}
    }
  }
  function fixSheets() {
    var list = document.styleSheets;
    for (var i = 0; i < list.length; i++) {
      var sh = list[i];
      if (doneSheets && doneSheets.has(sh)) continue;
      try {
        var rules = sh.cssRules; // boshqa domendagi (shrift) jadval — xato beradi
        if (!rules) continue;
        fixRules(rules);
        if (doneSheets) doneSheets.add(sh);
      } catch (e) {}
    }
  }

  /* HTML ichidagi style="font-size:…px" */
  function fixEl(el) {
    // <html> ning o'lchami (rem uchun) constants-i18n-ui.js da allaqachon o'rnatiladi
    if (el === root || !el.style || !el.style.fontSize) return;
    var nv = scaled(el.style.fontSize);
    if (nv) el.style.setProperty("font-size", nv, el.style.getPropertyPriority("font-size"));
  }
  function fixTree(node) {
    if (!node || node.nodeType !== 1) return;
    fixEl(node);
    if (node.querySelectorAll) {
      var els = node.querySelectorAll('[style*="font-size"]');
      for (var i = 0; i < els.length; i++) fixEl(els[i]);
    }
  }

  var sheetTimer = null;
  function sheetsSoon() {
    clearTimeout(sheetTimer);
    sheetTimer = setTimeout(fixSheets, 30);
  }

  function start() {
    applyScale();
    fixSheets();
    fixTree(document.body);
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === "attributes") {
          if (m.target === document.body && m.attributeName === "class") applyScale();
          else if (m.attributeName === "style") fixEl(m.target);
          continue;
        }
        for (var j = 0; j < m.addedNodes.length; j++) {
          var n = m.addedNodes[j];
          if (n.nodeType !== 1) continue;
          if (n.tagName === "STYLE" || n.tagName === "LINK") {
            sheetsSoon();
            if (n.tagName === "LINK") n.addEventListener("load", sheetsSoon);
          } else fixTree(n);
        }
      }
    }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style"] });
    // Kechikib yuklanadigan CSS fayllar uchun yana bir bor
    window.addEventListener("load", sheetsSoon);
    setTimeout(fixSheets, 1500);
    setTimeout(fixSheets, 5000);
  }

  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
})();
