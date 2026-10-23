/**
 * QARZDORLAR sahifasi (faqat admin)
 * ============================================================================
 * Bu sahifada FAQAT qarzdor talabalar ko'rinadi (`s.isDebtor === true`).
 * Qarzdorlik holati alohida saqlanmaydi — u davomatdan hisoblanadi
 * (attendance-render.js → recomputeAllDebtStatuses): oyiga 12 dars to'lganda
 * talaba avtomatik "Qarzdor" bo'ladi va "To'landi" tugmasi bosilgunicha
 * shunday qoladi.
 *
 * XABAR YUBORISH — IKKITA KANAL
 * -----------------------------
 *   📨 Ota-onalar guruhiga — xabar guruhning Telegram chatiga tushadi (davomat
 *      hisoboti ketadigan o'sha chat). Bepul, hech kim hech narsa bosmaydi.
 *      Shart: guruhga chat ID biriktirilgan bo'lsin (Guruhlar → ✏️ → Telegram).
 *
 *   📱 SMS — talabaning (ota-onasining raqami bo'lsa — o'shaning) telefoniga
 *      SMS ketadi. Talabadan hech qanday harakat talab qilinmaydi.
 *      Shart: serverda Eskiz.uz sozlangan bo'lsin (ESKIZ_EMAIL/PASSWORD).
 *
 * Nega talabaning SHAXSIY Telegramiga yuborilmaydi? Telegram boti
 * foydalanuvchiga birinchi bo'lib yoza olmaydi — u avval botni o'zi ishga
 * tushirishi shart. Talabadan hech narsa talab qilmaydigan kanal — SMS.
 * Shu sabab avvalgi "shaxsiy havola + Start" oqimi olib tashlandi.
 *
 *   🤖 Qarzdorlar boti — ALOHIDA Telegram bot (o'z tokeni bilan). Token shu
 *      sahifadagi "🤖 Qarzdorlar boti" kartasiga qo'yiladi. Ota-ona botni
 *      ochib /start → "📱 Raqamni yuborish" bosadi; raqam CRM dagi talaba
 *      (yoki ota-ona) raqamiga mos kelsa, xabarlar uning shaxsiy chatiga
 *      keladi. Kim ulanganini ro'yxatdagi "🤖" belgisi ko'rsatadi.
 */

var _debtSelected = {}; // studentId → true
var _debtMsgs = []; // oynada ochilgan xabarlar (avtomatik yozilgan)
var _debtMsgsChan = "parents";
var _debtChan = null; // /api/notify/status javobi
var _debtChanLoading = false;
var _debtBot = null; // /api/debtor-bot/status javobi

/* ─── Xabar matni AVTOMATIK yoziladi ──────────────────────────────────────
   Ilgari oynada shablon (`{ism}`, `{guruh}`, `{qarz}`) turardi va admin uni
   o'zi to'ldirishi yoki "hozir kimga ketyapti" ni boshida chamalab olishi
   kerak edi. Endi tugma bosilgan zahoti matn TO'LIQ yozilgan holda chiqadi:
   ism-familya, guruh va summa o'rniga qo'yilgan bo'ladi. Admin xohlasa
   tahrirlaydi, xohlamasa shundayligicha jo'natadi.                         */

var DEBT_CHAN_LBL = {
  parents: "📨 Ota-onalar guruhiga",
  sms: "📱 SMS",
  bot: "🤖 Qarzdorlar boti",
};

/* ─── Yordamchilar ────────────────────────────────────────────────────────── */

function _debtStudents() {
  if (!window.D || !Array.isArray(D.students)) return [];
  return D.students.filter(function (s) {
    return !!s.isDebtor;
  });
}

/** Talabaning jami qarzi (so'm) — davomat asosidagi oylik hisobdan. */
function debtorAmount(s) {
  try {
    if (typeof calcStudentAllMonthsDebt !== "function" || !s.groupId) return 0;
    return calcStudentAllMonthsDebt(s.id, s.groupId).reduce(function (sum, m) {
      return sum + (m.toPay || 0);
    }, 0);
  } catch (e) {
    return 0;
  }
}

function _debtMoney(n) {
  return typeof fmtMoney === "function"
    ? fmtMoney(n)
    : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function _debtEsc(v) {
  return String(v == null ? "" : v).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

function _debtGroup(s) {
  return (
    (window.D && D.groups
      ? D.groups.find(function (x) {
          return x.id === (s && s.groupId);
        })
      : null) || null
  );
}

/** Guruhga Telegram chat ID biriktirilganmi. */
function _debtHasGroupChat(s) {
  var g = _debtGroup(s);
  return !!(g && String(g.telegramChatId || "").trim());
}

/**
 * Raqamni SMS uchun tekshiradi. Backend dagi normalizePhone bilan bir xil
 * qoida — foydalanuvchi "yuborilmadi" degan javobni yuborgandan KEYIN emas,
 * ro'yxatning o'zida ko'rsin.
 */
function _debtPhone(s) {
  var raw = (s && (s.parentPhone || s.phone)) || "";
  var d = String(raw).replace(/\D/g, "");
  if (d.length === 12 && d.indexOf("998") === 0) return { raw: raw, ok: true };
  if (d.length === 9) return { raw: raw, ok: true };
  return { raw: raw, ok: false };
}

/** Talaba (yoki ota-onasi) qarzdorlar botiga ulanganmi. */
function _debtBotLinked(s) {
  return !!(_debtBot && _debtBot.linked && s && _debtBot.linked[s.id]);
}

/** Tanlangan kanal shu talaba uchun ishlaydimi. */
function _debtCanSend(s, chan) {
  if (chan === "bot") return _debtBotLinked(s);
  return chan === "sms" ? _debtPhone(s).ok : _debtHasGroupChat(s);
}

/* ─── Xabar matnini avtomatik qurish ──────────────────────────────────────
   Ikkita kanal ikki xil manzilga yozadi, shuning uchun matn ham ikki xil:

     📨 Guruhga  — bitta ota-onalar chatiga BITTA xabar ketadi. Bir guruhda
                   bir necha qarzdor bo'lsa, ular bitta ro'yxatga yig'iladi
                   (chatga bir xilga o'xshash 5 ta xabar tashlanmaydi).
     📱 SMS      — har bir ota-onaga alohida, shuning uchun har talabaga
                   alohida qisqa matn (70 belgi = 1 SMS).                    */

function _debtParentsText(students, groupName) {
  if (students.length === 1) {
    var s = students[0];
    return (
      "💸 To'lov eslatmasi\n\n" +
      "O'quvchi: " + (s.name || "") + "\n" +
      "Guruh: " + groupName + "\n" +
      "To'lanishi kerak: " + _debtMoney(debtorAmount(s)) + " so'm\n\n" +
      "Iltimos, to'lovni yaqin kunlarda amalga oshiring. Rahmat!"
    );
  }
  var total = 0;
  var list = students
    .map(function (s, i) {
      var amount = debtorAmount(s);
      total += amount;
      return i + 1 + ". " + (s.name || "") + " — " + _debtMoney(amount) + " so'm";
    })
    .join("\n");
  return (
    "💸 To'lov eslatmasi\n\n" +
    "Hurmatli ota-onalar! " + groupName + " guruhidagi quyidagi o'quvchilarning " +
    "to'lov muddati keldi:\n\n" +
    list + "\n\n" +
    "Jami: " + _debtMoney(total) + " so'm\n\n" +
    "Iltimos, to'lovni yaqin kunlarda amalga oshiring. Rahmat!"
  );
}

function _debtBotText(s) {
  var g = _debtGroup(s);
  return (
    "💸 To'lov eslatmasi\n\n" +
    "Hurmatli ota-ona!\n" +
    "O'quvchi: " + (s.name || "") + "\n" +
    "Guruh: " + ((g && g.name) || "—") + "\n" +
    "To'lanishi kerak: " + _debtMoney(debtorAmount(s)) + " so'm\n\n" +
    "Iltimos, to'lovni yaqin kunlarda amalga oshiring. Rahmat!"
  );
}

function _debtSmsText(s) {
  var g = _debtGroup(s);
  // SMS da o'zbekcha apostrof/harflar provayder tomonda muammo qilmasin —
  // matn sodda lotin harflarida.
  return (
    "Hurmatli ota-ona, " + (s.name || "") + " (" + ((g && g.name) || "-") +
    ") uchun " + _debtMoney(debtorAmount(s)) + " som tolov muddati keldi. Oquv markazi."
  );
}

/**
 * Yuboriladigan xabarlar ro'yxati.
 * @returns {{kind:string,label:string,text:string,groupId?:number,studentId?:number,studentIds?:number[]}[]}
 */
function _debtBuildMessages(chan, students) {
  if (chan === "bot")
    return students.map(function (s) {
      return {
        kind: "bot",
        studentId: s.id,
        label: "🤖 " + (s.name || ""),
        text: _debtBotText(s),
      };
    });
  if (chan === "sms")
    return students.map(function (s) {
      return {
        kind: "sms",
        studentId: s.id,
        label: "📱 " + (s.name || "") + " · " + (_debtPhone(s).raw || "—"),
        text: _debtSmsText(s),
      };
    });

  var byGroup = [];
  students.forEach(function (s) {
    var g = _debtGroup(s);
    var gid = g ? g.id : 0;
    var row = null;
    for (var i = 0; i < byGroup.length; i++)
      if (byGroup[i].gid === gid) row = byGroup[i];
    if (!row) {
      row = { gid: gid, name: (g && g.name) || "Guruhsiz", list: [] };
      byGroup.push(row);
    }
    row.list.push(s);
  });

  return byGroup.map(function (r) {
    return {
      kind: "parents",
      groupId: r.gid,
      studentIds: r.list.map(function (s) {
        return s.id;
      }),
      label:
        "📨 " + r.name + " guruhiga (" + r.list.length + " ta o'quvchi)",
      text: _debtParentsText(r.list, r.name),
    };
  });
}

/* Bir nechta xabar bo'lsa, admin HAR BIRINI ko'rib turishi kerak — shuning
   uchun ular bitta maydonda ajratgich chiziq bilan ketma-ket ko'rsatiladi va
   jo'natishdan oldin yana o'sha chiziq bo'yicha bo'linadi. */
var DEBT_SEP = "═══";

function _debtJoinMessages(msgs) {
  if (msgs.length === 1) return msgs[0].text;
  return msgs
    .map(function (m) {
      return DEBT_SEP + " " + m.label + " " + DEBT_SEP + "\n" + m.text;
    })
    .join("\n\n");
}

function _debtSplitMessages(full, count) {
  var txt = String(full == null ? "" : full);
  if (count === 1) return [txt.trim()];
  var parts = txt.split(/\n*^═══[^\n]*═══[ \t]*\n/m);
  if (parts.length && !parts[0].trim()) parts.shift();
  return parts.map(function (p) {
    return p.trim();
  });
}

/* ─── Kanallar holati ─────────────────────────────────────────────────────── */

function loadDebtorLinks(cb) {
  if (_debtChanLoading) return;
  _debtChanLoading = true;
  var j = function (r) {
    return r.json();
  };
  Promise.all([
    fetch("/api/notify/status").then(j).catch(function () {
      return null;
    }),
    fetch("/api/debtor-bot/status").then(j).catch(function () {
      return null;
    }),
  ]).then(function (r) {
    _debtChanLoading = false;
    if (r[0] && r[0].ok) _debtChan = r[0];
    // ⚠️ Holat olinmasa ham null qoldirmaymiz: aks holda renderDebtors() uni
    // darhol qayta so'rardi → soniyasiga yuzlab so'rov va qayta chizish.
    else if (!_debtChan) _debtChan = { ok: false, failed: true };
    if (r[1] && r[1].ok) _debtBot = r[1];
    else if (!_debtBot) _debtBot = { ok: false, configured: false, linked: {}, status: "⚠️ Holatni olib bo'lmadi" };
    if (cb) cb();
    else renderDebtors();
  });
}

/* ─── 🤖 Qarzdorlar boti kartasi (token qo'yish joyi) ───────────────────── */

function _debtRenderBotCard() {
  var box = document.getElementById("debtor-bot-card");
  if (!box) return;
  // Admin token yozayotgan bo'lsa — kartani qayta chizib matnni o'chirmaymiz
  var cur = document.getElementById("debt-bot-token");
  if (cur && cur.value && document.activeElement === cur) return;
  var b = _debtBot;
  if (!b) {
    box.innerHTML =
      '<div class="debt-bot-card"><div class="debt-bot-head">🤖 Qarzdorlar boti</div>' +
      '<div class="debt-help">⏳ Holat tekshirilmoqda...</div></div>';
    return;
  }
  var stCls = b.working ? "debt-bot-st-ok" : b.configured ? "debt-bot-st-bad" : "debt-bot-st-off";
  var open = !b.working || box.getAttribute("data-open") === "1";
  var debtors = _debtStudents();

  var html =
    '<div class="debt-bot-card">' +
    '<div class="debt-bot-row">' +
    '<div class="debt-bot-head">🤖 Qarzdorlar boti ' +
    '<span class="debt-bot-st ' + stCls + '">' + _debtEsc(b.status || "") + "</span></div>" +
    (b.working
      ? '<button class="btn btn-sm" onclick="debtBotToggle()">' + (open ? "▲ Yopish" : "⚙️ Tokenni almashtirish") + "</button>"
      : "") +
    "</div>";

  if (b.working) {
    html +=
      '<div class="debt-bot-info">' +
      '<span>🔗 <a href="' + _debtEsc(b.link) + '" target="_blank" rel="noopener">' + _debtEsc(b.link) + "</a></span>" +
      '<button class="btn btn-sm" onclick="debtBotCopyLink()">📋 Havolani nusxalash</button>' +
      "<span>👥 Ulangan chatlar: <b>" + (b.totalLinks || 0) + "</b> · qarzdorlardan: <b>" +
      debtors.filter(_debtBotLinked).length + " / " + debtors.length + "</b></span>" +
      "</div>" +
      '<div class="debt-help">Shu havolani ota-onalarga yuboring: ular botni ochib <b>/start</b> → ' +
      "<b>📱 Raqamni yuborish</b> ni bosadi. Raqam CRM dagi talaba yoki ota-ona raqamiga mos kelsa, " +
      "to'lov eslatmalari ularning shaxsiy Telegramiga keladi.</div>";
  }

  if (open) {
    html +=
      '<div class="debt-bot-form">' +
      '<input type="password" id="debt-bot-token" autocomplete="off" spellcheck="false" placeholder="' +
      (b.configured ? "Yangi token (almashtirish uchun)" : "123456789:AAH...  — @BotFather bergan token") + '">' +
      '<button class="btn btn-primary" id="debt-bot-save" onclick="debtBotSaveToken()">💾 Saqlash</button>' +
      (b.source === "db"
        ? '<button class="btn" onclick="debtBotRemoveToken()">🗑 O\'chirish</button>'
        : "") +
      "</div>" +
      '<div class="debt-help">1) Telegramda <b>@BotFather</b> → <code>/newbot</code> → botga nom bering. ' +
      "2) U bergan tokenni shu yerga qo'yib <b>Saqlang</b> — bot darhol ishga tushadi. " +
      "⚠️ Davomat botining tokenini qo'ymang — bu alohida bot bo'lishi kerak.</div>" +
      '<div id="debt-bot-msg"></div>';
  }
  html += "</div>";
  box.innerHTML = html;
}

function debtBotToggle() {
  var box = document.getElementById("debtor-bot-card");
  if (!box) return;
  box.setAttribute("data-open", box.getAttribute("data-open") === "1" ? "0" : "1");
  _debtRenderBotCard();
}

function debtBotCopyLink() {
  var link = _debtBot && _debtBot.link;
  if (!link) return;
  var done = function () {
    if (typeof toast === "function") toast("📋 Havola nusxalandi");
  };
  try {
    navigator.clipboard.writeText(link).then(done, function () {
      prompt("Havola:", link);
    });
  } catch (e) {
    prompt("Havola:", link);
  }
}

function _debtBotPost(token) {
  var msg = document.getElementById("debt-bot-msg");
  var btn = document.getElementById("debt-bot-save");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "⏳ Tekshirilmoqda...";
  }
  return fetch("/api/debtor-bot/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: token }),
  })
    .then(function (r) {
      return r.json();
    })
    .then(function (d) {
      if (!d || !d.ok) throw new Error((d && d.error) || "saqlanmadi");
      if (typeof toast === "function")
        toast(d.removed ? "🗑 Token o'chirildi" : "✅ Bot ulandi: @" + d.username);
      var box = document.getElementById("debtor-bot-card");
      if (box) box.setAttribute("data-open", "0");
      _debtBot = null;
      _debtRenderBotCard();
      setTimeout(function () {
        loadDebtorLinks();
      }, 600);
    })
    .catch(function (e) {
      if (msg)
        msg.innerHTML = '<div class="debt-note debt-note-warn">❌ ' + _debtEsc(e.message) + "</div>";
      if (btn) {
        btn.disabled = false;
        btn.textContent = "💾 Saqlash";
      }
    });
}

function debtBotSaveToken() {
  var inp = document.getElementById("debt-bot-token");
  var t = ((inp && inp.value) || "").trim();
  if (!t) {
    if (typeof toast === "function") toast("⚠️ Tokenni kiriting");
    return;
  }
  _debtBotPost(t);
}

async function debtBotRemoveToken() {
  if (
    typeof crmConfirm === "function" &&
    !(await crmConfirm("Qarzdorlar boti tokeni o'chirilsinmi? Bot ishlashdan to'xtaydi.", {
      okText: "Ha, o'chirilsin",
    }))
  )
    return;
  _debtBotPost("");
}

/* ─── Render ──────────────────────────────────────────────────────────────── */

var _debtFilteredIds = [];

function renderDebtors() {
  var box = document.getElementById("debtor-list");
  if (!box) return;

  // Qarzdorlik holati har doim davomatdan qayta hisoblanadi — shunda mentor
  // tomonda belgilangan davomat bu sahifada ham darrov aks etadi.
  if (typeof recomputeAllDebtStatuses === "function") {
    try {
      recomputeAllDebtStatuses({ silent: true });
    } catch (e) {}
  }

  // Kanal holati (Telegram/SMS sozlanganmi) — ilgari faqat "🔄 Yangilash"
  // bosilganda o'qilardi, shuning uchun sahifa birinchi ochilganda kanal
  // o'chiq bo'lsa ham hech qanday ogohlantirish ko'rinmasdi.
  if (_debtChan === null && !_debtChanLoading) loadDebtorLinks();
  _debtRenderBotCard();

  var q = (
    (document.getElementById("s-debtor") || {}).value || ""
  ).toLowerCase();
  var gf = (document.getElementById("filter-debtor-group") || {}).value || "";
  var cf = (document.getElementById("filter-debtor-tg") || {}).value || "";

  var all = _debtStudents();
  var items = all.filter(function (s) {
    var mQ =
      !q ||
      (s.name || "").toLowerCase().indexOf(q) !== -1 ||
      (s.phone || "").indexOf(q) !== -1;
    var mG = !gf || String(s.groupId) === String(gf);
    var mC =
      !cf ||
      (cf === "tg"
        ? _debtHasGroupChat(s)
        : cf === "sms"
          ? _debtPhone(s).ok
          : cf === "bot"
            ? _debtBotLinked(s)
            : /* "none" */ !_debtHasGroupChat(s) && !_debtPhone(s).ok && !_debtBotLinked(s));
    return mQ && mG && mC;
  });

  // Guruh filtri variantlari
  var gsel = document.getElementById("filter-debtor-group");
  if (gsel) {
    var gids = [];
    all.forEach(function (s) {
      if (s.groupId && gids.indexOf(s.groupId) === -1) gids.push(s.groupId);
    });
    var cur = gsel.value;
    gsel.innerHTML =
      '<option value="">Barcha guruh</option>' +
      gids
        .map(function (id) {
          var g = (D.groups || []).find(function (x) {
            return x.id === id;
          });
          return (
            '<option value="' +
            id +
            '">' +
            _debtEsc(g ? g.name : "Guruh " + id) +
            "</option>"
          );
        })
        .join("");
    gsel.value = cur;
  }

  _debtFilteredIds = items.map(function (s) {
    return s.id;
  });

  // Ko'rinmay qolgan talabalar tanlovdan chiqariladi
  var visible = {};
  items.forEach(function (s) {
    visible[s.id] = true;
  });
  Object.keys(_debtSelected).forEach(function (id) {
    if (!visible[id]) delete _debtSelected[id];
  });

  var totalDebt = 0;
  var tgCount = 0;
  var smsCount = 0;
  var botCount = 0;
  all.forEach(function (s) {
    if (_debtBotLinked(s)) botCount++;
    totalDebt += debtorAmount(s);
    if (_debtHasGroupChat(s)) tgCount++;
    if (_debtPhone(s).ok) smsCount++;
  });

  // Sarlavha statistikasi
  var stat = document.getElementById("debtor-stats");
  if (stat) {
    stat.innerHTML =
      '<div class="debt-stat debt-stat-orange"><div class="debt-stat-num">' +
      all.length +
      '</div><div class="debt-stat-lbl">💸 Qarzdor talaba</div></div>' +
      '<div class="debt-stat debt-stat-red"><div class="debt-stat-num">' +
      _debtMoney(totalDebt) +
      '</div><div class="debt-stat-lbl">💰 Jami qarz (so\'m)</div></div>' +
      '<div class="debt-stat debt-stat-blue"><div class="debt-stat-num">' +
      tgCount +
      " / " +
      all.length +
      '</div><div class="debt-stat-lbl">📨 Guruhi Telegramga ulangan</div></div>' +
      '<div class="debt-stat debt-stat-green"><div class="debt-stat-num">' +
      smsCount +
      " / " +
      all.length +
      '</div><div class="debt-stat-lbl">📱 SMS uchun raqami bor</div></div>' +
      '<div class="debt-stat debt-stat-blue"><div class="debt-stat-num">' +
      botCount +
      " / " +
      all.length +
      '</div><div class="debt-stat-lbl">🤖 Botga ulangan</div></div>';
  }

  _debtRenderChanWarn(stat);

  if (!all.length) {
    box.innerHTML =
      '<div class="debt-empty"><div style="font-size:44px">🎉</div>' +
      '<div style="font-weight:800;margin-top:10px">Qarzdor talaba yo\'q</div>' +
      '<div style="color:var(--text3);font-size:13px;margin-top:4px">' +
      "Talaba oyiga 12 ta darsni to'liq o'qib bo'lganda avtomatik qarzdor " +
      "sifatida shu yerga tushadi.</div></div>";
    Pager.clear("debtors", box);
    _debtUpdateBar();
    return;
  }

  if (!items.length) {
    box.innerHTML =
      '<div class="debt-empty"><div style="font-size:32px">🔍</div>' +
      '<div style="margin-top:8px;color:var(--text3)">Filtrga mos talaba topilmadi</div></div>';
    Pager.clear("debtors", box);
    _debtUpdateBar();
    return;
  }

  var _pg = Pager.slice("debtors", items, {
    sig: [q, gf, cf].join("|"),
    render: renderDebtors,
  });
  box.innerHTML = _pg.items
    .map(function (s, _i) {
      var i = _pg.start + _i;
      var g = _debtGroup(s);
      var ph = _debtPhone(s);
      var amount = debtorAmount(s);
      var checked = _debtSelected[s.id] ? "checked" : "";
      var avCls =
        typeof AV_CLS !== "undefined" ? AV_CLS[i % AV_CLS.length] : "av1";
      var initials =
        typeof ini === "function"
          ? ini(s.name)
          : (s.name || "?").substring(0, 2).toUpperCase();

      var tgBadge = _debtHasGroupChat(s)
        ? '<span class="badge b-teal">📨 Guruh ulangan</span>'
        : '<span class="badge b-orange" title="Guruhlar → ✏️ → Telegram chat ID">⚠️ Guruh ulanmagan</span>';
      var smsBadge = ph.ok
        ? '<span class="badge b-teal">📱 ' + _debtEsc(ph.raw) + "</span>"
        : '<span class="badge b-orange">⚠️ Raqam yo\'q</span>';
      var botBadge =
        _debtBot && _debtBot.working
          ? _debtBotLinked(s)
            ? '<span class="badge b-teal">🤖 Botga ulangan</span>'
            : '<span class="badge b-orange" title="Ota-ona botni ochib raqamini yuborishi kerak">🤖 Ulanmagan</span>'
          : "";

      return (
        '<div class="list-item debt-item' +
        (_debtSelected[s.id] ? " debt-item-sel" : "") +
        '">' +
        '<label class="debt-check"><input type="checkbox" ' +
        checked +
        ' onchange="toggleDebtor(' +
        s.id +
        ',this.checked)"></label>' +
        '<div class="av ' +
        avCls +
        '">' +
        initials +
        "</div>" +
        '<div class="li-info">' +
        '<div class="li-name">' +
        _debtEsc(s.name) +
        "</div>" +
        '<div class="li-sub">📱 ' +
        _debtEsc(s.phone || "—") +
        " · " +
        _debtEsc(g ? g.name : "Guruhsiz") +
        "</div>" +
        '<div class="li-tags">' +
        '<span class="badge b-red">💰 ' +
        _debtMoney(amount) +
        " so'm</span>" +
        tgBadge +
        smsBadge +
        botBadge +
        "</div>" +
        "</div>" +
        '<div class="li-right" onclick="event.stopPropagation()">' +
        '<button class="btn btn-sm" onclick="openDebtorMessage(\'parents\',' +
        s.id +
        ')">📨 Guruhga</button>' +
        '<button class="btn btn-sm" onclick="openDebtorMessage(\'sms\',' +
        s.id +
        ')">📱 SMS</button>' +
        '<button class="btn btn-sm" onclick="openDebtorMessage(\'bot\',' +
        s.id +
        ')">🤖 Bot</button>' +
        '<button class="btn btn-sm btn-primary" onclick="debtorMarkPaid(' +
        s.id +
        ')">✅ To\'landi</button>' +
        "</div>" +
        "</div>"
      );
    })
    .join("");
  Pager.mount("debtors", box);

  _debtUpdateBar();
}

/**
 * Kanal sozlanmagan bo'lsa — sababini ro'yxat ustida ochiq yozamiz.
 * Banner har renderda qaytadan quriladi, shuning uchun avval eskisi
 * olib tashlanadi — aks holda har chizishda bittadan ko'payib ketardi.
 */
function _debtRenderChanWarn(stat) {
  var old = document.getElementById("debt-chan-warn");
  if (old) old.remove();
  if (!stat || !_debtChan) return;

  var msgs = [];
  if (_debtChan.sms && !_debtChan.sms.ready)
    msgs.push(
      "📱 <b>SMS o'chiq</b> — " +
        _debtEsc(_debtChan.sms.status || "") +
        ". Serverda <code>ESKIZ_EMAIL</code> va <code>ESKIZ_PASSWORD</code> " +
        "ni to'ldiring (eskiz.uz kabinetidan olinadi) va serverni qayta ishga tushiring.",
    );
  if (_debtChan.telegram && _debtChan.telegram.status.indexOf("✅") !== 0)
    msgs.push(
      "📨 <b>Telegram o'chiq</b> — " +
        _debtEsc(_debtChan.telegram.status || "") +
        ". <code>TELEGRAM_BOT_TOKEN</code> ni tekshiring.",
    );
  if (!msgs.length) return;

  stat.insertAdjacentHTML(
    "afterend",
    '<div id="debt-chan-warn" class="debt-note debt-note-warn" style="margin:0 0 12px">' +
      msgs.join("<div style=\"height:6px\"></div>") +
      "</div>",
  );
}

function _debtUpdateBar() {
  var n = Object.keys(_debtSelected).length;
  var bar = document.getElementById("debtor-actionbar");
  if (!bar) return;
  bar.style.display = n ? "flex" : "none";
  var lbl = document.getElementById("debtor-selcount");
  if (lbl) lbl.textContent = n + " ta talaba tanlandi";
  var all = document.getElementById("debtor-selectall");
  if (all) {
    var visibleCount = (_debtFilteredIds || []).length;
    all.checked = visibleCount > 0 && n >= visibleCount;
  }
}

function toggleDebtor(id, on) {
  if (on) _debtSelected[id] = true;
  else delete _debtSelected[id];
  renderDebtors();
}

function toggleAllDebtors(on) {
  _debtSelected = {};
  // "Hammasini tanlash" — faqat joriy sahifadagi 10 tani emas, filtrga mos
  // BARCHA qarzdorlarni tanlaydi (sahifalash tanlovga ta'sir qilmaydi).
  if (on) {
    (_debtFilteredIds || []).forEach(function (id) {
      _debtSelected[id] = true;
    });
  }
  renderDebtors();
}

/**
 * "To'landi" — qarzdorlikni yopadi va ro'yxatni darhol yangilaydi.
 * markStudentPaid() to'lovni D.finance ga daromad sifatida yozadi va
 * hisoblangan davomatni tozalaydi, shuning uchun tasdiq so'raymiz.
 */
async function debtorMarkPaid(id) {
  var s = (D.students || []).find(function (x) {
    return x.id === id;
  });
  if (!s) return;
  var amount = debtorAmount(s);
  if (
    !(await crmConfirm(
      s.name +
        " — qarzdorlik yopilsinmi?\n\n" +
        _debtMoney(amount) +
        " so'm Moliya bo'limiga daromad sifatida yoziladi.",
      { okText: "Ha, yopilsin" },
    ))
  )
    return;
  delete _debtSelected[id];
  markStudentPaid(id);
  // markStudentPaid talaba kartochkasini ochadi — uni yopib, ro'yxatga qaytamiz
  if (typeof closeDetail === "function") {
    try {
      closeDetail();
    } catch (e) {}
  }
  renderDebtors();
}

/* ─── Xabar yuborish oynasi ───────────────────────────────────────────────── */

/**
 * @param {"parents"|"sms"} chan Qaysi kanal
 * @param {number}  [singleId]   Bitta talaba (bo'lmasa — tanlanganlar)
 */
function openDebtorMessage(chan, singleId) {
  chan = chan === "sms" || chan === "bot" ? chan : "parents";
  if (chan === "bot" && !(_debtBot && _debtBot.working)) {
    if (typeof toast === "function")
      toast("⚠️ Avval «🤖 Qarzdorlar boti» kartasiga bot tokenini qo'ying");
    var card = document.getElementById("debtor-bot-card");
    if (card) {
      card.setAttribute("data-open", "1");
      _debtRenderBotCard();
      card.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    return;
  }

  var ids =
    singleId != null
      ? [singleId]
      : Object.keys(_debtSelected).map(function (x) {
          return parseInt(x, 10);
        });
  if (!ids.length) {
    if (typeof toast === "function") toast("⚠️ Avval talabani tanlang");
    return;
  }

  var students = ids
    .map(function (id) {
      return (D.students || []).find(function (x) {
        return x.id === id;
      });
    })
    .filter(Boolean);

  var can = students.filter(function (s) {
    return _debtCanSend(s, chan);
  });
  var cant = students.filter(function (s) {
    return !_debtCanSend(s, chan);
  });

  // Matn shu yerda TO'LIQ yoziladi — admin hech narsa to'ldirmaydi.
  // Faqat kanal ishlaydigan talabalar (`can`) matnga kiritiladi: yuborib
  // bo'lmaydigan bolaning ismi xabarda turib qolmasin.
  _debtMsgs = _debtBuildMessages(chan, can);
  _debtMsgsChan = chan;
  var tpl = _debtJoinMessages(_debtMsgs);

  var body =
    '<div class="debt-recips">' +
    students
      .map(function (s) {
        return (
          '<span class="debt-chip' +
          (_debtCanSend(s, chan) ? "" : " debt-chip-off") +
          '">' +
          (_debtCanSend(s, chan) ? "✅ " : "⚠️ ") +
          _debtEsc(s.name) +
          "</span>"
        );
      })
      .join("") +
    "</div>" +
    (cant.length
      ? '<div class="debt-note debt-note-warn">⚠️ ' +
        cant.length +
        " ta talabaga bu kanal orqali yuborib bo'lmaydi — " +
        (chan === "sms"
          ? "telefon raqami kiritilmagan yoki noto'g'ri (Talabalar → ✏️)."
          : chan === "bot"
            ? "ota-onasi (yoki o'zi) botga ulanmagan. Bot havolasini yuboring — ular /start bosib raqamini yuborsin."
          : "guruhiga Telegram chat ID biriktirilmagan (Guruhlar → ✏️ → Telegram).") +
        "</div>"
      : "") +
    (chan === "bot"
      ? '<div class="debt-note">🤖 Xabar qarzdorlar boti orqali ota-onaning (yoki talabaning) ' +
        "SHAXSIY Telegramiga ketadi — boshqalar ko'rmaydi.</div>"
      : chan === "sms"
      ? '<div class="debt-note">📱 SMS ota-onaning raqamiga ketadi (kiritilmagan bo\'lsa — talabanikiga). ' +
        "Matn qisqa bo'lsin: 70 belgidan oshsa, bitta o'rniga bir nechta SMS " +
        "yechiladi. Eskiz ixtiyoriy matnni yubormaydi — shu matnni kabinetdagi " +
        '"SMS shablonlari" bo\'limida bir marta tasdiqlatib oling.</div>'
      : '<div class="debt-note">📨 Xabar guruhning ota-onalar chatiga tushadi — ' +
        "davomat hisoboti ketadigan o'sha chatga. Guruhdagi hamma ko'radi.</div>") +
    '<div class="debt-field-lbl">Xabar matni ' +
    '<span style="font-weight:400;color:var(--text3)">— avtomatik yozildi, ' +
    "tahrirlash mumkin</span></div>" +
    '<textarea id="debt-msg" rows="' +
    (_debtMsgs.length > 1 ? 14 : chan === "sms" ? 4 : 9) +
    '" class="debt-textarea" oninput="_debtCount()">' +
    _debtEsc(tpl) +
    "</textarea>" +
    '<div class="debt-help" id="debt-msg-count"></div>' +
    (_debtMsgs.length > 1
      ? '<div class="debt-help">⚠️ ' +
        _debtMsgs.length +
        " ta alohida xabar ketadi. Har biri <code>═══</code> chiziq bilan " +
        "ajratilgan — chiziqlarni o'chirmang, aks holda xabarlar aralashib " +
        "ketadi.</div>"
      : "") +
    '<div id="debt-send-result"></div>';

  _debtOpenModal(
    DEBT_CHAN_LBL[chan] + " (" + can.length + " ta qabul qiluvchi)",
    body,
    can.length
      ? {
          label: "Jo'natish",
          onClick: function () {
            sendDebtorMessages(chan);
          },
        }
      : null,
  );
  _debtCount(chan);
}

/** SMS uzunligi — necha SMS ketishini oldindan ko'rsatadi. */
function _debtCount(chan) {
  var ta = document.getElementById("debt-msg");
  var out = document.getElementById("debt-msg-count");
  if (!ta || !out) return;
  var isSms = (chan || _debtMsgsChan) === "sms";

  // Bir nechta xabar bir maydonda turadi — uzunlikni ajratgichlar bo'yicha
  // bo'lib, ENG UZUN blok bo'yicha hisoblaymiz: SMS narxi har bir xabar
  // uchun alohida hisoblanadi, jami belgilar soni bo'yicha emas.
  var parts = _debtSplitMessages(ta.value, _debtMsgs.length || 1);
  var max = 0;
  parts.forEach(function (p) {
    if (p.length > max) max = p.length;
  });

  if (!isSms) {
    out.textContent =
      parts.length > 1
        ? parts.length + " ta xabar · eng uzuni " + max + " belgi"
        : max + " belgi";
    return;
  }
  var perMsg = Math.max(1, Math.ceil(max / 70));
  out.textContent =
    parts.length > 1
      ? parts.length +
        " ta SMS · eng uzuni " +
        max +
        " belgi (~" +
        perMsg +
        " qism)"
      : max + " belgi · taxminan " + perMsg + " ta SMS";
}

/**
 * Oynadagi matnni jo'natadi. Matn AVTOMATIK yozilgan (yoki admin tahrirlagan)
 * bo'ladi — bu funksiya uni bloklarga bo'lib, har bir blokni o'z manziliga
 * yuboradi: guruh xabari → guruh chatiga, SMS → talabaning raqamiga.
 */
function sendDebtorMessages(chan) {
  chan = chan || _debtMsgsChan;
  var ta = document.getElementById("debt-msg");
  var full = (ta && ta.value) || "";
  if (!full.trim()) {
    if (typeof toast === "function") toast("⚠️ Xabar matni bo'sh");
    return;
  }
  if (!_debtMsgs.length) return;

  var parts = _debtSplitMessages(full, _debtMsgs.length);
  if (parts.length !== _debtMsgs.length) {
    // Ajratgich chiziq o'chirilgan — qaysi matn kimga ketishini endi aniq
    // aytib bo'lmaydi. Taxmin qilib noto'g'ri odamga yuborgandan ko'ra
    // to'xtaganimiz ma'qul.
    if (typeof toast === "function")
      toast(
        "⚠️ Ajratgich chiziqlar (═══) buzilgan — oynani yopib qayta oching",
      );
    return;
  }

  var messages = [];
  var labels = [];
  for (var i = 0; i < _debtMsgs.length; i++) {
    var m = _debtMsgs[i];
    var text = parts[i];
    if (!text) continue;
    labels.push(m.label);
    messages.push(
      m.kind === "sms" || m.kind === "bot"
        ? { studentId: m.studentId, text: text }
        : { groupId: m.groupId, text: text },
    );
  }
  if (!messages.length) {
    if (typeof toast === "function") toast("⚠️ Xabar matni bo'sh");
    return;
  }

  var btn = document.getElementById("debt-modal-ok");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "⏳ Yuborilmoqda...";
  }

  fetch(chan === "sms" ? "/api/notify/sms" : chan === "bot" ? "/api/notify/bot" : "/api/notify/parents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: messages }),
  })
    .then(function (r) {
      return r.json();
    })
    .then(function (d) {
      if (!d || !d.ok) throw new Error((d && d.error) || "yuborilmadi");
      var res = d.results || [];
      var bad = [];
      res.forEach(function (r, i) {
        if (!r.ok) bad.push({ label: labels[i] || "?", error: r.error });
      });
      var out = document.getElementById("debt-send-result");
      if (out) {
        out.innerHTML =
          '<div class="debt-note ' +
          (bad.length ? "debt-note-warn" : "debt-note-ok") +
          '">✅ Yuborildi: <b>' +
          (d.sent || 0) +
          "</b>" +
          (bad.length
            ? "<br>❌ Yuborilmadi: <b>" +
              bad.length +
              '</b><div style="margin-top:6px;font-size:12px">' +
              bad
                .map(function (r) {
                  return _debtEsc(r.label) + " — " + _debtEsc(r.error || "xato");
                })
                .join("<br>") +
              "</div>"
            : "") +
          "</div>";
      }
      if (typeof toast === "function")
        toast(
          bad.length
            ? "⚠️ " + (d.sent || 0) + " yuborildi, " + bad.length + " xato"
            : "✅ " + (d.sent || 0) + " ta xabar yuborildi",
        );
    })
    .catch(function (e) {
      var out = document.getElementById("debt-send-result");
      if (out)
        out.innerHTML =
          '<div class="debt-note debt-note-warn">❌ ' +
          _debtEsc(e.message) +
          "</div>";
      if (typeof toast === "function") toast("❌ " + e.message);
    })
    .then(function () {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Qayta jo'natish";
      }
    });
}

/* ─── Kichik modal (asosiy modal formalar uchun band) ─────────────────────── */

function _debtOpenModal(title, bodyHtml, action) {
  var ov = document.getElementById("debt-overlay");
  if (!ov) {
    ov = document.createElement("div");
    ov.id = "debt-overlay";
    ov.className = "overlay";
    ov.onclick = function (e) {
      if (e.target === ov) _debtCloseModal();
    };
    ov.innerHTML =
      '<div class="modal" id="debt-modal-box">' +
      '<div class="modal-head"><div class="modal-title" id="debt-modal-title"></div>' +
      '<button class="m-close" onclick="_debtCloseModal()">✕</button></div>' +
      '<div class="modal-body" id="debt-modal-body"></div>' +
      '<div class="modal-foot"><button class="btn" onclick="_debtCloseModal()">Yopish</button>' +
      '<button class="btn btn-primary" id="debt-modal-ok" style="display:none"></button></div>' +
      "</div>";
    document.body.appendChild(ov);
    ov
      .querySelector("#debt-modal-box")
      .addEventListener("click", function (e) {
        e.stopPropagation();
      });
  }
  document.getElementById("debt-modal-title").textContent = title;
  document.getElementById("debt-modal-body").innerHTML = bodyHtml;
  var ok = document.getElementById("debt-modal-ok");
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

function _debtCloseModal() {
  var ov = document.getElementById("debt-overlay");
  if (!ov) return;
  ov.classList.remove("open");
  ov.style.display = "none";
}

/* ─── Global eksport (inline onclick lar uchun) ───────────────────────────── */

window.renderDebtors = renderDebtors;
window.toggleDebtor = toggleDebtor;
window.debtorMarkPaid = debtorMarkPaid;
window.toggleAllDebtors = toggleAllDebtors;
window.openDebtorMessage = openDebtorMessage;
window.sendDebtorMessages = sendDebtorMessages;
window.loadDebtorLinks = loadDebtorLinks;
window.debtorAmount = debtorAmount;
window._debtCount = _debtCount;
window._debtOpenModal = _debtOpenModal;
window._debtCloseModal = _debtCloseModal;
window.debtBotSaveToken = debtBotSaveToken;
window.debtBotRemoveToken = debtBotRemoveToken;
window.debtBotToggle = debtBotToggle;
window.debtBotCopyLink = debtBotCopyLink;
