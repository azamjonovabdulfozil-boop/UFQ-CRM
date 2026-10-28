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
    ".cx-rc{background:#fff;color:#111;border:1px dashed #cbd5e1;border-radius:12px;padding:16px 16px 12px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px}" +
    ".fin-tx-rc{background:none;border:1px solid var(--border,#e2e8f0);border-radius:8px;padding:4px 7px;cursor:pointer;margin-right:4px;font-size:13px}" +
    ".fin-tx-rc:hover{background:var(--accent-light,#eff6ff)}";

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
      title: tx.title || "",
      note: tx.description || "",
      amount: Number(tx.amount) || 0,
      by: tx.createdBy || me(),
    };
  }

  function receiptRows(r) {
    var rows = [
      ["Chek №", r.no],
      ["Sana", dateText(r.at)],
      ["Talaba", r.student],
      ["Guruh", r.group],
      ["Kurs", r.course],
      ["Mentor", r.mentor],
      ["To'lov davri", r.period],
      ["Qabul qildi", r.by],
    ];
    return rows.filter(function (x) {
      return x[1];
    });
  }

  /** Chop etish uchun alohida, mustaqil HTML (80 mm chek printeri va A4 uchun mos). */
  function receiptPrintHtml(r) {
    var b = brand();
    var rows = receiptRows(r)
      .map(function (x) {
        return "<tr><td>" + esc(x[0]) + "</td><td>" + esc(x[1]) + "</td></tr>";
      })
      .join("");
    return (
      '<!doctype html><html><head><meta charset="utf-8"><title>Chek №' + esc(r.no) + "</title><style>" +
      "@page{size:80mm auto;margin:4mm}" +
      "*{box-sizing:border-box}body{margin:0;font-family:ui-monospace,Menlo,Consolas,'Courier New',monospace;color:#000;font-size:12px}" +
      ".rc{width:72mm;margin:0 auto;padding:2mm 0}" +
      ".c{text-align:center}.logo{max-width:22mm;max-height:22mm;display:block;margin:0 auto 2mm}" +
      ".brand{font-size:15px;font-weight:800}.ttl{font-weight:800;letter-spacing:1px;margin:3mm 0 2mm}" +
      ".hr{border-top:1px dashed #000;margin:2.5mm 0}" +
      "table{width:100%;border-collapse:collapse}td{padding:1mm 0;vertical-align:top}td:last-child{text-align:right;font-weight:700;padding-left:3mm;word-break:break-word}" +
      ".sum{display:flex;justify-content:space-between;font-size:16px;font-weight:800;margin:1mm 0}" +
      ".sign{display:flex;justify-content:space-between;gap:6mm;margin-top:7mm;font-size:11px}.sign div{flex:1;border-top:1px solid #000;padding-top:1mm;text-align:center}" +
      ".thx{margin-top:5mm;font-size:11px}" +
      "</style></head><body><div class='rc'>" +
      (b.logo ? "<img class='logo' src='" + esc(b.logo) + "' onerror='this.remove()'>" : "") +
      "<div class='c brand'>" + esc(b.name) + "</div>" +
      "<div class='c ttl'>TO'LOV CHEKI</div><div class='hr'></div>" +
      "<table>" + rows + "</table><div class='hr'></div>" +
      "<div class='sum'><span>JAMI:</span><span>" + money(r.amount) + " so'm</span></div>" +
      (r.note ? "<div style='font-size:11px;margin-top:1mm'>" + esc(r.note) + "</div>" : "") +
      "<div class='hr'></div>" +
      "<div class='sign'><div>Qabul qildi</div><div>To'lovchi</div></div>" +
      "<div class='c thx'>To'lovingiz uchun rahmat!</div>" +
      "</div></body></html>"
    );
  }

  function printReceipt(r) {
    var fr = document.createElement("iframe");
    fr.setAttribute("aria-hidden", "true");
    fr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    document.body.appendChild(fr);
    var doc = fr.contentWindow.document;
    doc.open();
    doc.write(receiptPrintHtml(r));
    doc.close();
    var go = function () {
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
    // Logo yuklanishini kutamiz (bo'lmasa ham 700 ms dan keyin chop etiladi)
    var img = doc.querySelector("img");
    if (img && !img.complete) {
      var done = false;
      var once = function () {
        if (done) return;
        done = true;
        go();
      };
      img.addEventListener("load", once);
      img.addEventListener("error", once);
      setTimeout(once, 700);
    } else setTimeout(go, 50);
  }

  /** Chek oynasi. tx — D.finance dagi kirim yozuvi. */
  function showReceipt(tx, extra) {
    if (!tx) return;
    var r = receiptData(tx, extra);
    var b = brand();
    var rows = receiptRows(r)
      .map(function (x) {
        return '<div class="cx-row"><span>' + esc(x[0]) + "</span><b>" + esc(x[1]) + "</b></div>";
      })
      .join("");
    var html =
      (extra && extra.fresh ? '<div class="cx-note">✅ To\'lov qabul qilindi. Chekni chop eting yoki PDF qilib saqlang.</div>' : "") +
      '<div class="cx-rc">' +
      '<div style="text-align:center;font-weight:800;font-size:15px">' + esc(b.name) + "</div>" +
      '<div style="text-align:center;font-weight:800;letter-spacing:1px;margin:6px 0 8px">TO\'LOV CHEKI</div>' +
      '<div style="border-top:1px dashed #94a3b8;margin:6px 0"></div>' +
      '<div style="display:grid;gap:5px">' + rows + "</div>" +
      '<div style="border-top:1px dashed #94a3b8;margin:8px 0"></div>' +
      '<div class="cx-row" style="font-size:17px;font-weight:800"><span style="color:#111">JAMI:</span><b>' + money(r.amount) + " so'm</b></div>" +
      (r.note ? '<div style="font-size:12px;color:#475569;margin-top:4px">' + esc(r.note) + "</div>" : "") +
      "</div>";
    modal({
      title: "🧾 To'lov cheki",
      html: html,
      buttons: [
        { text: "Yopish" },
        {
          text: "🖨 Chop etish",
          primary: true,
          onClick: function () {
            printReceipt(r);
          },
        },
      ],
    });
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

  wrapPayments();
  // Boshqa skriptlar funksiyani keyinroq qayta e'lon qilsa ham o'ram saqlansin
  setTimeout(wrapPayments, 1500);
})();
