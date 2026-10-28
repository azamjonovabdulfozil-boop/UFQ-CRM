/**
 * crm-extras.js — admin uchun qo'shimcha amallar:
 *
 *   🧾 To'lov cheki   — talabadan to'lov olingandan keyin chek oynasi ochiladi
 *                       (chop etish yoki PDF qilib saqlash mumkin). Moliya
 *                       ro'yxatidagi har bir kirimdan chekni qayta chiqarsa bo'ladi.
 *   🔀 Guruhga o'tkazish — talabani bir guruhdan boshqasiga ko'chirish.
 *   📊 Excel           — Moliya bo'limini oy yoki yil bo'yicha .xlsx faylga chiqarish.
 *
 * data-finance.js, attendance-render.js va constants-i18n-ui.js dan keyin yuklanadi.
 */
(function () {
  "use strict";

  // ── Umumiy yordamchilar ────────────────────────────────────────────────────
  var esc = function (s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };
  var money = function (n) {
    return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  };
  var MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
  var pad = function (n) {
    return String(n).padStart(2, "0");
  };
  var dateText = function (iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "—";
    return d.getDate() + "-" + MONTHS[d.getMonth()] + " " + d.getFullYear() + ", " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  };
  var me = function () {
    try {
      var u = (typeof getCurrentUser === "function" && getCurrentUser()) || {};
      return u.name || u.username || u.login || "";
    } catch (e) {
      return "";
    }
  };
  var brand = function () {
    try {
      // eslint-disable-next-line no-undef
      var b = typeof _brandSettings !== "undefined" ? _brandSettings : {};
      // eslint-disable-next-line no-undef
      var logo = b.crmLogo || (typeof UFQ_DEFAULT_LOGO !== "undefined" ? UFQ_DEFAULT_LOGO : "");
      return { name: b.crmName || "UFQ CRM", logo: logo };
    } catch (e) {
      return { name: "UFQ CRM", logo: "" };
    }
  };
  var findGroup = function (gid) {
    return (D.groups || []).find(function (g) {
      return g.id === gid;
    });
  };
  var findStudent = function (sid) {
    return (D.students || []).find(function (s) {
      return s.id === sid;
    });
  };

  // ── Oyna (modal) ───────────────────────────────────────────────────────────
  var CSS =
    ".cx-back{position:fixed;inset:0;background:rgba(10,15,28,.55);z-index:10050;display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;transition:opacity .15s}" +
    ".cx-back.on{opacity:1}" +
    ".cx-box{background:var(--bg2,#fff);color:var(--text,#1a2332);border:1px solid var(--border,#e2e8f0);border-radius:16px;width:100%;max-width:460px;max-height:calc(100dvh - 32px);display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,.25)}" +
    ".cx-box.wide{max-width:520px}" +
    ".cx-h{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:16px 18px;border-bottom:1px solid var(--border,#e2e8f0);font-weight:800;font-size:16px}" +
    ".cx-x{background:none;border:0;font-size:22px;line-height:1;cursor:pointer;color:var(--text3,#94a3b8)}" +
    ".cx-b{padding:16px 18px;overflow-y:auto;display:grid;gap:12px;font-size:14px}" +
    ".cx-f{padding:12px 18px;border-top:1px solid var(--border,#e2e8f0);display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}" +
    ".cx-btn{padding:9px 16px;border-radius:10px;border:1px solid var(--border,#e2e8f0);background:var(--bg3,#f6f9fc);color:var(--text,#1a2332);font-weight:700;cursor:pointer;font-size:14px}" +
    ".cx-btn.pri{background:var(--accent,#3b82f6);border-color:var(--accent,#3b82f6);color:#fff}" +
    ".cx-btn:disabled{opacity:.55;cursor:default}" +
    ".cx-note{background:var(--bg3,#f6f9fc);border:1px solid var(--border,#e2e8f0);border-radius:10px;padding:10px 12px;font-size:13px;color:var(--text2,#4a5568)}" +
    ".cx-warn{background:var(--amber-light,#fffbeb);color:var(--amber-text,#b45309);border-color:rgba(217,119,6,.3)}" +
    ".cx-lbl{font-size:12px;font-weight:700;color:var(--text2,#4a5568);margin-bottom:4px;display:block}" +
    ".cx-sel{width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--border,#e2e8f0);background:var(--bg2,#fff);color:var(--text,#1a2332);font-size:14px}" +
    ".cx-opt{display:flex;gap:10px;align-items:center;padding:12px;border:1px solid var(--border,#e2e8f0);border-radius:12px;cursor:pointer}" +
    ".cx-opt:has(input:checked){border-color:var(--accent,#3b82f6);background:var(--accent-light,#eff6ff)}" +
    ".cx-row{display:flex;justify-content:space-between;gap:10px}" +
    ".cx-row span:first-child{color:var(--text2,#4a5568)}" +
    ".cx-row b{text-align:right}" +
    /* Chek ko'rinishi (oynada) */
    ".fin-tx-rc{background:none;border:1px solid var(--border,#e2e8f0);border-radius:8px;padding:4px 7px;cursor:pointer;margin-right:4px;font-size:13px}" +
    ".fin-tx-rc:hover{background:var(--accent-light,#eff6ff)}" +
    // Katta summalar (1 250 000 so'm) ikki qatorga bo'linmasin; chek tugmasi uchun joy
    "@media(min-width:901px){.fin-tx-header,.fin-tx-row{grid-template-columns:48px 1fr 150px 110px 170px 96px}}" +
    ".fin-tx-amount-income,.fin-tx-amount-expense,.fin-tx-amount-salary{white-space:nowrap}";

  function ensureStyle() {
    if (document.getElementById("cx-style")) return;
    var st = document.createElement("style");
    st.id = "cx-style";
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /** @returns {{el:HTMLElement, close:Function}} */
  function modal(opts) {
    ensureStyle();
    var back = document.createElement("div");
    back.className = "cx-back";
    back.setAttribute("role", "dialog");
    back.setAttribute("aria-modal", "true");
    back.innerHTML =
      '<div class="cx-box' + (opts.wide ? " wide" : "") + '"><div class="cx-h"><span>' + esc(opts.title) + '</span><button type="button" class="cx-x" aria-label="Yopish">×</button></div>' +
      '<div class="cx-b">' + opts.html + '</div><div class="cx-f"></div></div>';
    var foot = back.querySelector(".cx-f");
    function close() {
      document.removeEventListener("keydown", onKey, true);
      back.classList.remove("on");
      setTimeout(function () {
        back.remove();
      }, 150);
    }
    (opts.buttons || []).forEach(function (b) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cx-btn" + (b.primary ? " pri" : "");
      btn.textContent = b.text;
      btn.addEventListener("click", function () {
        if (b.onClick) b.onClick(btn, close);
        else close();
      });
      foot.appendChild(btn);
    });
    back.querySelector(".cx-x").addEventListener("click", close);
    back.addEventListener("mousedown", function (e) {
      if (e.target === back) close();
    });
    function onKey(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    }
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(back);
    requestAnimationFrame(function () {
      back.classList.add("on");
    });
    return { el: back, close: close };
  }

  // ═══════════════════════ 🧾 TO'LOV CHEKI ═══════════════════════════════════
  function receiptData(tx, extra) {
    var s = tx.studentId != null ? findStudent(tx.studentId) : null;
    var g = s ? findGroup(s.groupId) : null;
    return {
      no: String(tx.id),
      at: tx.createdAt || tx.date,
      student: s ? s.name : tx.title || "",
      group: g ? g.name : "",
      course: g ? g.course || "" : "",
      mentor: g ? g.mentor || "" : "",
      period: (extra && extra.period) || tx.period || "",
      note: tx.description || "",
      amount: Number(tx.amount) || 0,
      by: tx.createdBy || me(),
    };
  }

  // Summani so'z bilan: 1 250 000 → «bir million ikki yuz ellik ming»
  var ONES = ["", "bir", "ikki", "uch", "to'rt", "besh", "olti", "yetti", "sakkiz", "to'qqiz"];
  var TENS = ["", "o'n", "yigirma", "o'ttiz", "qirq", "ellik", "oltmish", "yetmish", "sakson", "to'qson"];
  var SCALES = ["", "ming", "million", "milliard"];
  function words3(n) {
    var out = [];
    var h = Math.floor(n / 100), t = Math.floor((n % 100) / 10), o = n % 10;
    if (h) out.push(ONES[h] + " yuz");
    if (t) out.push(TENS[t]);
    if (o) out.push(ONES[o]);
    return out.join(" ");
  }
  function amountWords(num) {
    var n = Math.round(Math.abs(Number(num) || 0));
    if (!n) return "nol so'm";
    var parts = [];
    for (var i = 0; n > 0 && i < SCALES.length; i++) {
      var chunk = n % 1000;
      if (chunk) parts.unshift(words3(chunk) + (SCALES[i] ? " " + SCALES[i] : ""));
      n = Math.floor(n / 1000);
    }
    var s = parts.join(" ") + " so'm";
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  var dateOnly = function (iso) {
    var d = new Date(iso);
    return isNaN(d) ? "—" : pad(d.getDate()) + "." + pad(d.getMonth() + 1) + "." + d.getFullYear();
  };
  var timeOnly = function (iso) {
    var d = new Date(iso);
    return isNaN(d) ? "" : pad(d.getHours()) + ":" + pad(d.getMinutes());
  };

  /**
   * Chekning to'liq HTML hujjati. Oynadagi ko'rinish ham, chop etish ham
   * AYNAN shu hujjatdan — ekranda nima ko'rinsa, qog'ozga ham shu chiqadi.
   * @param {"80"|"a4"} mode  80 mm chek printeri yoki oddiy A4 printer
   */
  function receiptDoc(r, mode) {
    var b = brand();
    var a4 = mode === "a4";
    var rows = [
      ["Talaba", r.student],
      ["Guruh", r.group],
      ["Kurs", r.course],
      ["Mentor", r.mentor],
      ["To'lov davri", r.period],
      ["Izoh", r.note && r.note !== r.group + " guruhi · " + r.course ? r.note : ""],
    ]
      .filter(function (x) {
        return x[1];
      })
      .map(function (x) {
        return '<div class="row"><span>' + esc(x[0]) + "</span><b>" + esc(x[1]) + "</b></div>";
      })
      .join("");
    var css =
      "@page{" + (a4 ? "size:A4;margin:18mm" : "size:80mm auto;margin:3mm") + "}" +
      "*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
      "html,body{margin:0;background:#fff}" +
      "body{font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#0f172a;font-size:" + (a4 ? "14px" : "12px") + ";line-height:1.35}" +
      ".rc{width:" + (a4 ? "130mm" : "74mm") + ";margin:0 auto;padding:" + (a4 ? "10mm 11mm 9mm" : "3mm 2mm 4mm") + ";" + (a4 ? "border:1px solid #e2e8f0;border-radius:4mm;margin-top:6mm" : "") + "}" +
      ".hd{text-align:center}" +
      ".logo{width:" + (a4 ? "20mm" : "15mm") + ";height:" + (a4 ? "20mm" : "15mm") + ";object-fit:contain;display:block;margin:0 auto 1.5mm}" +
      ".brand{font-size:" + (a4 ? "22px" : "17px") + ";font-weight:800;letter-spacing:.2px}" +
      ".kind{display:inline-block;margin-top:2mm;padding:.8mm 3mm;border:1.5px solid #0f172a;border-radius:10mm;font-size:" + (a4 ? "11px" : "9.5px") + ";font-weight:800;letter-spacing:1.6px}" +
      ".meta{display:flex;justify-content:space-between;margin-top:3.5mm;font-size:" + (a4 ? "12px" : "10.5px") + ";color:#475569}" +
      ".meta b{color:#0f172a;font-variant-numeric:tabular-nums}" +
      ".cut{border:0;border-top:1.5px dashed #94a3b8;margin:3mm 0}" +
      ".row{display:flex;justify-content:space-between;gap:4mm;padding:1.1mm 0}" +
      ".row span{color:#64748b;white-space:nowrap}" +
      ".row b{text-align:right;font-weight:650;word-break:break-word}" +
      ".total{margin-top:1mm;padding:" + (a4 ? "4mm 5mm" : "2.6mm 3mm") + ";border-radius:2.5mm;background:#f1f5f9;border:1px solid #e2e8f0}" +
      ".total .lbl{font-size:" + (a4 ? "11px" : "9.5px") + ";font-weight:800;letter-spacing:1.2px;color:#475569}" +
      ".total .sum{font-size:" + (a4 ? "28px" : "21px") + ";font-weight:800;font-variant-numeric:tabular-nums;margin-top:.5mm;white-space:nowrap}" +
      ".total .sum small{font-size:.55em;font-weight:700;margin-left:1mm}" +
      ".total .wrd{font-size:" + (a4 ? "11.5px" : "9.5px") + ";color:#475569;margin-top:.6mm;font-style:italic}" +
      ".paid{display:flex;align-items:center;justify-content:center;gap:1.5mm;margin:3mm auto 0;width:max-content;padding:1mm 3.5mm;border:2px solid #15803d;color:#15803d;border-radius:1.5mm;font-weight:800;letter-spacing:2px;font-size:" + (a4 ? "13px" : "11px") + ";transform:rotate(-3deg)}" +
      ".sign{display:flex;gap:6mm;margin-top:" + (a4 ? "12mm" : "8mm") + "}" +
      ".sign div{flex:1;border-top:1px solid #0f172a;padding-top:1mm;text-align:center;font-size:" + (a4 ? "11px" : "9.5px") + ";color:#475569}" +
      ".sign div b{display:block;color:#0f172a;font-weight:650;margin-bottom:.3mm}" +
      ".ft{text-align:center;margin-top:4mm;font-size:" + (a4 ? "12px" : "10.5px") + ";font-weight:650}" +
      ".ft small{display:block;font-weight:400;color:#94a3b8;margin-top:.8mm;font-size:.85em}";
    return (
      '<!doctype html><html><head><meta charset="utf-8"><title>Chek №' + esc(r.no) + "</title><style>" + css + "</style></head><body><div class='rc'>" +
      "<div class='hd'>" +
      (b.logo ? "<img class='logo' src='" + esc(b.logo) + "' alt=''>" : "") +
      "<div class='brand'>" + esc(b.name) + "</div>" +
      "<div class='kind'>TO'LOV CHEKI</div>" +
      "</div>" +
      "<div class='meta'><span>Chek № <b>" + esc(r.no) + "</b></span><span><b>" + dateOnly(r.at) + "</b> · <b>" + timeOnly(r.at) + "</b></span></div>" +
      "<hr class='cut'>" + rows + "<hr class='cut'>" +
      "<div class='total'><div class='lbl'>JAMI TO'LANDI</div><div class='sum'>" + money(r.amount) + "<small>so'm</small></div><div class='wrd'>" + esc(amountWords(r.amount)) + "</div></div>" +
      "<div class='paid'>✓ TO'LANDI</div>" +
      "<div class='sign'><div><b>" + esc(r.by || "—") + "</b>Qabul qildi</div><div><b>&nbsp;</b>To'lovchi imzosi</div></div>" +
      "<div class='ft'>To'lovingiz uchun rahmat!<small>Chekni saqlab qo'ying</small></div>" +
      "</div></body></html>"
    );
  }

  function printReceipt(r, mode) {
    var fr = document.createElement("iframe");
    fr.setAttribute("aria-hidden", "true");
    fr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    document.body.appendChild(fr);
    var doc = fr.contentWindow.document;
    doc.open();
    doc.write(receiptDoc(r, mode));
    doc.close();
    var done = false;
    var go = function () {
      if (done) return;
      done = true;
      try {
        fr.contentWindow.focus();
        fr.contentWindow.print();
      } catch (e) {
        if (typeof toast === "function") toast("⚠️ Chop etib bo'lmadi");
      }
      setTimeout(function () {
        fr.remove();
      }, 60000);
    };
    // Logo yuklanishini kutamiz (yuklanmasa ham 800 ms dan keyin chop etiladi)
    var img = doc.querySelector("img");
    if (img && !img.complete) {
      img.addEventListener("load", go);
      img.addEventListener("error", function () {
        img.remove();
        go();
      });
      setTimeout(go, 800);
    } else setTimeout(go, 60);
  }

  var RC_CSS =
    ".cx-box.rcx{max-width:440px}" +
    ".rcx .cx-b{background:var(--bg3,#f6f9fc);gap:14px}" +
    ".rcx-ok{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;background:linear-gradient(135deg,#16a34a,#0d9488);color:#fff;box-shadow:0 8px 20px rgba(22,163,74,.25)}" +
    ".rcx-ok i{flex-shrink:0;width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.2);display:grid;place-items:center;font-style:normal;font-size:20px;font-weight:800}" +
    ".rcx-ok b{display:block;font-size:15px}" +
    ".rcx-ok span{font-size:12.5px;opacity:.92}" +
    ".rcx-ok .amt{margin-left:auto;font-size:17px;font-weight:800;white-space:nowrap}" +
    ".rcx-paper{position:relative;background:#fff;border-radius:6px;box-shadow:0 10px 30px rgba(15,23,42,.12),0 1px 0 rgba(15,23,42,.04);padding:6px 0}" +
    ".rcx-paper:before,.rcx-paper:after{content:'';position:absolute;left:0;right:0;height:10px;background-size:14px 10px;background-repeat:repeat-x}" +
    ".rcx-paper:before{top:-9px;background-image:radial-gradient(circle at 7px 0,transparent 6px,#fff 6.5px)}" +
    ".rcx-paper:after{bottom:-9px;background-image:radial-gradient(circle at 7px 10px,transparent 6px,#fff 6.5px)}" +
    ".rcx-paper iframe{display:block;width:100%;border:0;height:520px}" +
    ".rcx-fmt{display:flex;align-items:center;gap:8px;justify-content:center;font-size:12.5px;color:var(--text2,#4a5568)}" +
    ".rcx-seg{display:inline-flex;background:var(--bg2,#fff);border:1px solid var(--border,#e2e8f0);border-radius:10px;padding:3px}" +
    ".rcx-seg button{border:0;background:none;padding:6px 12px;border-radius:8px;font-weight:700;font-size:12.5px;color:var(--text2,#4a5568);cursor:pointer}" +
    ".rcx-seg button.on{background:var(--accent,#3b82f6);color:#fff}";

  /** Chek oynasi. tx — D.finance dagi kirim yozuvi. */
  function showReceipt(tx, extra) {
    if (!tx) return;
    if (!document.getElementById("cx-rc-style")) {
      var st = document.createElement("style");
      st.id = "cx-rc-style";
      st.textContent = RC_CSS;
      document.head.appendChild(st);
    }
    var r = receiptData(tx, extra);
    var mode = "80";
    try {
      mode = localStorage.getItem("cx_rc_mode") === "a4" ? "a4" : "80";
    } catch (e) {}
    var fresh = extra && extra.fresh;
    var html =
      (fresh
        ? '<div class="rcx-ok"><i>✓</i><div><b>To\'lov qabul qilindi</b><span>' + esc(r.student) + (r.group ? " · " + esc(r.group) : "") + '</span></div><div class="amt">' + money(r.amount) + " so'm</div></div>"
        : "") +
      '<div class="rcx-paper"><iframe title="Chek" class="rcx-frame"></iframe></div>' +
      '<div class="rcx-fmt">Printer: <span class="rcx-seg"><button type="button" data-m="80">Chek (80 mm)</button><button type="button" data-m="a4">A4 qog\'oz</button></span></div>';
    var m = modal({
      title: fresh ? "🧾 Chek tayyor" : "🧾 To'lov cheki",
      html: html,
      buttons: [
        { text: "Yopish" },
        {
          text: "🖨 Chop etish",
          primary: true,
          onClick: function () {
            printReceipt(r, mode);
          },
        },
      ],
    });
    m.el.querySelector(".cx-box").classList.add("rcx");
    var frame = m.el.querySelector(".rcx-frame");
    // Oynada har doim chek ko'rinishi (A4 da ham — faqat chop etish formati o'zgaradi)
    frame.srcdoc = receiptDoc(r, "80");
    frame.addEventListener("load", function () {
      try {
        var fit = function () {
          var h = frame.contentDocument.documentElement.scrollHeight;
          if (h) frame.style.height = h + "px";
        };
        fit();
        var im = frame.contentDocument.querySelector("img");
        if (im) {
          im.addEventListener("load", fit);
          im.addEventListener("error", function () {
            im.remove();
            fit();
          });
        }
      } catch (e) {}
    });
    var seg = m.el.querySelectorAll(".rcx-seg button");
    var paint = function () {
      seg.forEach(function (bt) {
        bt.classList.toggle("on", bt.getAttribute("data-m") === mode);
      });
    };
    seg.forEach(function (bt) {
      bt.addEventListener("click", function () {
        mode = bt.getAttribute("data-m");
        try {
          // Faqat shu brauzer sozlamasi — serverga sinxronlanmaydi
          Storage.prototype.setItem.call(localStorage, "cx_rc_mode", mode);
        } catch (e) {}
        paint();
      });
    });
    paint();
  }
  window.crmReceipt = function (txId) {
    var tx = (D.finance || []).find(function (t) {
      return String(t.id) === String(txId);
    });
    if (!tx) {
      if (typeof toast === "function") toast("⚠️ To'lov topilmadi");
      return;
    }
    showReceipt(tx);
  };

  // To'lov olinadigan joylarni o'raymiz: yangi kirim paydo bo'lsa — chek oynasi
  function newIncome(beforeIds) {
    return (D.finance || []).filter(function (t) {
      return t && t.type === "income" && t.studentId != null && !beforeIds.has(String(t.id));
    });
  }
  function stamp(txs, period) {
    var by = me();
    txs.forEach(function (t) {
      if (!t.createdBy && by) t.createdBy = by;
      if (period && !t.period) t.period = period;
    });
  }
  function idsNow() {
    return new Set(
      (D.finance || []).map(function (t) {
        return String(t.id);
      }),
    );
  }

  function wrapPayments() {
    if (typeof window.markStudentPaid === "function" && !window.markStudentPaid.__cx) {
      var origPaid = window.markStudentPaid;
      var wrapped = function (studentId) {
        var before = idsNow();
        // Qaysi oylar uchun to'lanayotgani — chaqiruvdan OLDIN hisoblanadi
        var period = "";
        try {
          var s = findStudent(studentId);
          if (s && typeof calcStudentAllMonthsDebt === "function")
            period = calcStudentAllMonthsDebt(s.id, s.groupId)
              .filter(function (m) {
                return m.isFullMonth && m.toPay > 0;
              })
              .map(function (m) {
                return m.label;
              })
              .join(", ");
        } catch (e) {}
        var out = origPaid.apply(this, arguments);
        var fresh = newIncome(before);
        if (fresh.length) {
          stamp(fresh, period);
          if (typeof saveData === "function") saveData();
          showReceipt(fresh[fresh.length - 1], { fresh: true, period: period });
        }
        return out;
      };
      wrapped.__cx = true;
      window.markStudentPaid = wrapped;
    }
    if (typeof window.saveFinTransaction === "function" && !window.saveFinTransaction.__cx) {
      var origSave = window.saveFinTransaction;
      var wrappedSave = function () {
        var before = idsNow();
        var out = origSave.apply(this, arguments);
        var fresh = newIncome(before);
        if (fresh.length) {
          var tx = fresh[fresh.length - 1];
          var d = new Date(tx.date);
          var period = isNaN(d) ? "" : MONTHS[d.getMonth()].charAt(0).toUpperCase() + MONTHS[d.getMonth()].slice(1) + " " + d.getFullYear();
          stamp(fresh, period);
          if (typeof saveData === "function") saveData();
          showReceipt(tx, { fresh: true, period: period });
        }
        return out;
      };
      wrappedSave.__cx = true;
      window.saveFinTransaction = wrappedSave;
    }
  }

  // ═══════════════════════ 🔀 GURUHGA O'TKAZISH ══════════════════════════════
  window.openTransferStudent = function (studentId) {
    var s = findStudent(studentId);
    if (!s) return;
    var cur = findGroup(s.groupId);
    var groups = (D.groups || []).filter(function (g) {
      return g.id !== s.groupId && g.status !== "Arxiv";
    });
    if (!groups.length) {
      if (typeof crmAlert === "function") crmAlert("O'tkazish uchun boshqa faol guruh yo'q. Avval yangi guruh oching.", { title: "Guruh yo'q" });
      return;
    }
    var count = function (gid) {
      return (D.students || []).filter(function (x) {
        return x.groupId === gid;
      }).length;
    };
    var debt = 0;
    try {
      if (cur && typeof calcStudentAllMonthsDebt === "function")
        debt = calcStudentAllMonthsDebt(s.id, s.groupId).reduce(function (a, m) {
          return a + (m.toPay || 0);
        }, 0);
    } catch (e) {}
    var opts = groups
      .slice()
      .sort(function (a, b) {
        return String(a.name).localeCompare(String(b.name));
      })
      .map(function (g) {
        var bits = [g.course, g.mentor, g.timeStart ? g.timeStart + (g.timeEnd ? "–" + g.timeEnd : "") : "", count(g.id) + " ta talaba"].filter(Boolean);
        return '<option value="' + esc(g.id) + '">' + esc(g.name) + " — " + esc(bits.join(" · ")) + "</option>";
      })
      .join("");
    var html =
      '<div class="cx-row"><span>Talaba</span><b>' + esc(s.name) + "</b></div>" +
      '<div class="cx-row"><span>Hozirgi guruh</span><b>' + esc(cur ? cur.name + (cur.course ? " — " + cur.course : "") : "biriktirilmagan") + "</b></div>" +
      '<div><label class="cx-lbl" for="cx-tr-g">Yangi guruh</label><select id="cx-tr-g" class="cx-sel">' + opts + "</select></div>" +
      (debt > 0
        ? '<div class="cx-note cx-warn">⚠️ Eski guruhda to\'lanmagan ' + money(debt) + " so'm bor. Davomat tarixi eski guruhda qoladi — o'tkazishdan oldin to'lovni olishni unutmang.</div>"
        : '<div class="cx-note">Davomat va baholar tarixi o\'chmaydi. Talaba yangi guruh jadvaliga darhol qo\'shiladi.</div>');
    modal({
      title: "🔀 Boshqa guruhga o'tkazish",
      html: html,
      buttons: [
        { text: "Bekor qilish" },
        {
          text: "O'tkazish",
          primary: true,
          onClick: function (btn, close) {
            var sel = document.getElementById("cx-tr-g");
            var to = findGroup(Number(sel.value)) || findGroup(sel.value);
            if (!to) return;
            var from = s.groupId;
            s.groupId = to.id;
            if (!Array.isArray(s.groupHistory)) s.groupHistory = [];
            s.groupHistory.push({ from: from, to: to.id, at: new Date().toISOString(), by: me() });
            try {
              if (typeof syncGroupRelations === "function") syncGroupRelations(D);
            } catch (e) {}
            if (typeof saveData === "function") saveData();
            ["renderStudents", "renderGroups", "renderCourses", "updateCounts"].forEach(function (f) {
              try {
                if (typeof window[f] === "function") window[f]();
              } catch (e) {}
            });
            close();
            try {
              if (typeof closeDetail === "function") closeDetail();
            } catch (e) {}
            if (typeof toast === "function") toast("✅ " + s.name + " → «" + to.name + "» guruhiga o'tkazildi");
          },
        },
      ],
    });
  };

  // ═══════════════════════ 📊 MOLIYA → EXCEL ══════════════════════════════════
  window.openFinExport = function () {
    // eslint-disable-next-line no-undef
    var y = typeof _finYear !== "undefined" ? _finYear : new Date().getFullYear();
    // eslint-disable-next-line no-undef
    var m = typeof _finMonth !== "undefined" ? _finMonth : new Date().getMonth();
    var mName = MONTHS[m].charAt(0).toUpperCase() + MONTHS[m].slice(1);
    var html =
      '<label class="cx-opt"><input type="radio" name="cx-fx" value="month" checked><div><b>' + esc(mName + " " + y) + '</b><div style="font-size:12px;color:var(--text2)">Tanlangan oydagi barcha to\'lovlar</div></div></label>' +
      '<label class="cx-opt"><input type="radio" name="cx-fx" value="year"><div><b>' + y + '-yil to\'liq</b><div style="font-size:12px;color:var(--text2)">Yil davomidagi barcha kirim, chiqim va oyliklar</div></div></label>' +
      '<div class="cx-note">Faylda: sana, vaqt, turi, talaba, guruh, summa, kim kiritgani va oxirida jami kirim, chiqim, balans.</div>';
    modal({
      title: "📊 Moliyani Excel'ga chiqarish",
      html: html,
      buttons: [
        { text: "Bekor qilish" },
        {
          text: "⬇ Yuklab olish",
          primary: true,
          onClick: function (btn, close) {
            var all = document.querySelector('input[name="cx-fx"]:checked').value === "year";
            var url = "/api/finance/export?format=xlsx&year=" + y + (all ? "" : "&month=" + m);
            btn.disabled = true;
            btn.textContent = "⏳ Tayyorlanmoqda…";
            fetch(url, { cache: "no-store" })
              .then(function (r) {
                if (!r.ok)
                  return r
                    .json()
                    .catch(function () {
                      return {};
                    })
                    .then(function (d) {
                      throw new Error((d && d.error) || "HTTP " + r.status);
                    });
                var cd = r.headers.get("content-disposition") || "";
                var mm = /filename="?([^";]+)"?/i.exec(cd);
                return r.blob().then(function (blob) {
                  return { blob: blob, name: mm ? mm[1] : "moliya.xlsx" };
                });
              })
              .then(function (f) {
                var a = document.createElement("a");
                a.href = URL.createObjectURL(f.blob);
                a.download = f.name;
                document.body.appendChild(a);
                a.click();
                setTimeout(function () {
                  URL.revokeObjectURL(a.href);
                  a.remove();
                }, 2000);
                close();
                if (typeof toast === "function") toast("✅ Excel fayl yuklab olindi");
              })
              .catch(function (e) {
                btn.disabled = false;
                btn.textContent = "⬇ Yuklab olish";
                if (typeof toast === "function") toast("⚠️ Yuklab bo'lmadi: " + e.message);
              });
          },
        },
      ],
    });
  };

  ensureStyle();
  wrapPayments();
  // Boshqa skriptlar funksiyani keyinroq qayta e'lon qilsa ham o'ram saqlansin
  setTimeout(wrapPayments, 1500);
})();
