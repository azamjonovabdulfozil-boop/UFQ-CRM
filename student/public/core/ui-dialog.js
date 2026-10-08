/**
 * ui-dialog.js — Brauzerning alert / confirm / prompt oynalari o'rniga.
 *
 * ⚠️ NIMA UCHUN KERAK BO'LDI
 * Sayt bo'ylab `alert()`, `confirm()`, `prompt()` ishlatilardi. Ular:
 *   • brauzerning o'zi chizadigan, sayt bilan umuman uyg'unlashmaydigan oyna;
 *   • butun sahifani MULOQOTSIZ qotirib qo'yadi (sinxron blok) — shu payt
 *     avtosaqlash, live-sync va boshqa taymerlar ham to'xtaydi;
 *   • telefon brauzerlarida "bu sayt boshqa oyna chiqarmasin" tugmasi bor —
 *     foydalanuvchi bir marta bossa, keyin tasdiqlash oynalari umuman
 *     ko'rinmaydi va `confirm()` doim `false` qaytaradi (o'chirish, saqlash
 *     kabi amallar jimgina ishlamay qoladi);
 *   • iframe/demo rejimida ba'zi brauzerlar ularni butunlay bloklaydi.
 *
 * Shu sababli hammasi CRM uslubidagi modal oynaga ko'chirildi. Farqi: bu
 * funksiyalar Promise qaytaradi, ya'ni chaqiruv joyida `await` kerak.
 *
 *   await crmAlert("Saqlandi");
 *   if (!(await crmConfirm("O'chirilsinmi?"))) return;
 *   const name = await crmPrompt("Ism:");           // bekor qilinsa — null
 *   const pw   = await crmPrompt("Parol:", { password: true });
 *
 * Klaviatura: Enter — tasdiqlash, Esc — bekor qilish. Fokus oynadan
 * chiqmaydi (tab bilan orqadagi tugmalarga o'tib bo'lmaydi).
 */
(function () {
  "use strict";

  if (window.crmConfirm) return; // ikki marta yuklanmasin

  var STYLE_ID = "crm-dialog-style";
  var CSS =
    "" +
    ".crm-dlg-back{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;" +
    "background:rgba(15,23,42,.55);backdrop-filter:blur(3px);padding:16px;opacity:0;transition:opacity .15s ease}" +
    ".crm-dlg-back.on{opacity:1}" +
    ".crm-dlg{background:var(--bg2,#fff);color:var(--text,#1a2332);border:1px solid var(--border2,rgba(0,0,0,.1));" +
    "border-radius:var(--r-lg,16px);box-shadow:0 20px 60px rgba(0,0,0,.28);width:100%;max-width:420px;" +
    "padding:22px;transform:translateY(8px) scale(.98);transition:transform .15s ease;font-size:14px}" +
    ".crm-dlg-back.on .crm-dlg{transform:none}" +
    ".crm-dlg-title{font-weight:700;font-size:16px;margin:0 0 8px;display:flex;gap:8px;align-items:center}" +
    ".crm-dlg-msg{color:var(--text2,#4a5568);line-height:1.55;white-space:pre-wrap;word-break:break-word;margin:0 0 14px}" +
    ".crm-dlg input{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:var(--r-sm,8px);" +
    "border:1px solid var(--border2,rgba(0,0,0,.12));background:var(--bg3,#f6f9fc);color:var(--text,#1a2332);" +
    "font-size:14px;font-family:inherit;margin-bottom:14px}" +
    ".crm-dlg input:focus{outline:2px solid var(--accent,#3b82f6);outline-offset:1px}" +
    ".crm-dlg-err{color:#dc2626;font-size:12.5px;margin:-8px 0 12px;display:none}" +
    ".crm-dlg-btns{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}" +
    ".crm-dlg-btn{padding:9px 16px;border-radius:var(--r-sm,8px);border:1px solid var(--border2,rgba(0,0,0,.12));" +
    "background:var(--bg3,#f6f9fc);color:var(--text,#1a2332);font-size:14px;font-weight:600;cursor:pointer;font-family:inherit}" +
    ".crm-dlg-btn:hover{filter:brightness(.97)}" +
    ".crm-dlg-btn.primary{background:var(--accent,#3b82f6);border-color:transparent;color:#fff}" +
    ".crm-dlg-btn.danger{background:#dc2626;border-color:transparent;color:#fff}" +
    "@media(max-width:480px){.crm-dlg-btns{flex-direction:column-reverse}.crm-dlg-btn{width:100%}}";

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  // Bir vaqtda bitta oyna: ketma-ket chaqiruvlar navbatga tushadi
  var queue = Promise.resolve();

  function open(opts) {
    var run = function () {
      return new Promise(function (resolve) {
        ensureStyle();

        var back = document.createElement("div");
        back.className = "crm-dlg-back";
        back.setAttribute("role", "dialog");
        back.setAttribute("aria-modal", "true");

        var box = document.createElement("div");
        box.className = "crm-dlg";

        var h = document.createElement("div");
        h.className = "crm-dlg-title";
        h.textContent = opts.title || "";
        if (opts.title) box.appendChild(h);

        var msg = document.createElement("div");
        msg.className = "crm-dlg-msg";
        msg.textContent = opts.message == null ? "" : String(opts.message);
        box.appendChild(msg);

        var input = null;
        if (opts.type === "prompt") {
          input = document.createElement("input");
          input.type = opts.password ? "password" : "text";
          input.value = opts.value || "";
          if (opts.placeholder) input.placeholder = opts.placeholder;
          if (opts.password) input.autocomplete = "current-password";
          box.appendChild(input);
        }

        var err = document.createElement("div");
        err.className = "crm-dlg-err";
        box.appendChild(err);

        var btns = document.createElement("div");
        btns.className = "crm-dlg-btns";

        var cancel = null;
        if (opts.type !== "alert") {
          cancel = document.createElement("button");
          cancel.type = "button";
          cancel.className = "crm-dlg-btn";
          cancel.textContent = opts.cancelText || "Bekor qilish";
          btns.appendChild(cancel);
        }

        var okBtn = document.createElement("button");
        okBtn.type = "button";
        okBtn.className = "crm-dlg-btn " + (opts.danger ? "danger" : "primary");
        okBtn.textContent = opts.okText || (opts.type === "alert" ? "Yopish" : "Tasdiqlash");
        btns.appendChild(okBtn);

        box.appendChild(btns);
        back.appendChild(box);
        document.body.appendChild(back);
        requestAnimationFrame(function () {
          back.classList.add("on");
        });

        var prevFocus = document.activeElement;
        setTimeout(function () {
          (input || okBtn).focus();
          if (input) input.select();
        }, 30);

        function close(result) {
          document.removeEventListener("keydown", onKey, true);
          back.classList.remove("on");
          setTimeout(function () {
            back.remove();
            try {
              if (prevFocus && prevFocus.focus) prevFocus.focus();
            } catch (e) {}
          }, 150);
          resolve(result);
        }

        function accept() {
          if (opts.type === "prompt") {
            var val = input.value;
            if (opts.required && !String(val).trim()) {
              err.textContent = opts.requiredMsg || "Bu maydon bo'sh bo'lmasin";
              err.style.display = "block";
              input.focus();
              return;
            }
            return close(val);
          }
          close(opts.type === "alert" ? undefined : true);
        }

        function reject() {
          close(opts.type === "prompt" ? null : opts.type === "alert" ? undefined : false);
        }

        okBtn.addEventListener("click", accept);
        if (cancel) cancel.addEventListener("click", reject);
        back.addEventListener("mousedown", function (e) {
          if (e.target === back) reject();
        });

        function onKey(e) {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            reject();
          } else if (e.key === "Enter" && (!input || document.activeElement === input || document.activeElement === okBtn)) {
            e.preventDefault();
            e.stopPropagation();
            accept();
          } else if (e.key === "Tab") {
            // Fokus oynadan chiqib ketmasin
            var f = [input, cancel, okBtn].filter(Boolean);
            var i = f.indexOf(document.activeElement);
            e.preventDefault();
            f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
          }
        }
        document.addEventListener("keydown", onKey, true);
      });
    };
    var p = queue.then(run, run);
    queue = p.catch(function () {});
    return p;
  }

  /** Xabar oynasi. @returns {Promise<void>} */
  window.crmAlert = function (message, opts) {
    opts = opts || {};
    return open({
      type: "alert",
      message: message,
      title: opts.title || "Xabar",
      okText: opts.okText || "Yopish",
    });
  };

  /** Tasdiqlash. @returns {Promise<boolean>} */
  window.crmConfirm = function (message, opts) {
    opts = opts || {};
    return open({
      type: "confirm",
      message: message,
      title: opts.title || "Tasdiqlang",
      okText: opts.okText || "Ha",
      cancelText: opts.cancelText || "Yo'q",
      danger: !!opts.danger,
    });
  };

  /** Matn so'rash. Bekor qilinsa null. @returns {Promise<string|null>} */
  window.crmPrompt = function (message, opts) {
    opts = opts || {};
    return open({
      type: "prompt",
      message: message,
      title: opts.title || "Kiriting",
      value: opts.value || "",
      placeholder: opts.placeholder || "",
      password: !!opts.password,
      required: opts.required !== false,
      okText: opts.okText || "OK",
      cancelText: opts.cancelText || "Bekor qilish",
    });
  };

  /**
   * Xavfsizlik to'ri: kodning biror burchagida qolib ketgan brauzer oynasi
   * ham CRM oynasiga aylansin. `alert` va `confirm` sinxron qiymat kutadi —
   * uni bera olmaymiz, shuning uchun `confirm` bu yerda `false` qaytaradi
   * (xavfsiz tomon: hech narsa o'chirilmaydi) va oyna baribir ko'rinadi.
   */
  window.alert = function (m) {
    window.crmAlert(m);
  };
  window.confirm = function (m) {
    window.crmConfirm(m);
    console.warn("[ui-dialog] confirm() → crmConfirm(): `await` bilan chaqiring");
    return false;
  };
  window.prompt = function (m, d) {
    window.crmPrompt(m, { value: d });
    console.warn("[ui-dialog] prompt() → crmPrompt(): `await` bilan chaqiring");
    return null;
  };
})();
