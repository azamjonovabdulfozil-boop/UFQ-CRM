/* ===========================================================================
   Davomat → Telegram ko'prigi
   ---------------------------------------------------------------------------
   setAtt() ni o'rab oladi: mentor/admin K, Y yoki S bosgan zahoti backend'ga
   xabar beriladi, backend esa ota-onalar guruhiga hisobot yuboradi.

   Bot endi CRM ning O'ZIDA (backend/davomatBot.js). Shuning uchun bu fayl
   avvalgisidan ancha sodda:

     • guruhni "botga ulash" yo'q — hisobot backend'da CRM ma'lumotidan
       quriladi, ya'ni talabalar ro'yxatini hech qayerga nusxalash shart emas;
     • botGroupId / botStudentIds kabi holat yo'q;
     • sanani ham backend hisoblaydi.

   Bu yerdan ketadigan yagona narsa — QAYSI guruh, QAYSI oy va QAYSI dars
   belgilangani. Qolganini backend biladi.
   =========================================================================== */
(function () {
  if (typeof window === "undefined") return;

  var API_BASE =
    typeof __API_BASE__ !== "undefined" && __API_BASE__
      ? __API_BASE__
      : window.__API_BASE__ || "";

  function getRole() {
    try {
      return (
        (window.CURRENT_USER && window.CURRENT_USER.role) ||
        localStorage.getItem("role") ||
        ""
      );
    } catch (_) {
      return "";
    }
  }

  function toast(msg) {
    try {
      if (typeof window.toast === "function") window.toast(msg);
      else console.log("[telegram]", msg);
    } catch (e) {
      console.log("[telegram]", msg);
    }
  }

  // Bir xil nosozlik har katakni bosganda qalqib chiqmasin, lekin "umr bo'yi
  // bir marta" ham bo'lmasin — nosozlik qaytalansa foydalanuvchi bilishi kerak.
  var WARN_TTL = 60000;
  var warned = {};
  function warnThrottled(key, msg) {
    console.warn("[telegram]", msg);
    var now = Date.now();
    // "Chat ID yo'q" — sozlash kamchiligi, tarmoq nosozligi emas: har katakni
    // belgilaganda qalqib chiqmasin, 10 daqiqada bir marta yetarli.
    var ttl = key.indexOf("tg-nochat-") === 0 ? 600000 : WARN_TTL;
    if (warned[key] && now - warned[key] < ttl) return;
    warned[key] = now;
    toast(msg);
  }

  async function report(groupId, year, month, lesson) {
    try {
      var res = await fetch(API_BASE + "/api/telegram/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: groupId,
          year: year,
          month: month,
          lesson: lesson,
        }),
      });
      var data = await res.json().catch(function () {
        return {};
      });

      if (!res.ok || !data.ok) {
        warnThrottled(
          "tg-" + groupId,
          "⚠️ Telegram: " + (data.error || "HTTP " + res.status),
        );
        return;
      }
      // Chat ID kiritilmagan guruh. Ilgari bu holat MUTLAQO jim o'tar edi —
      // natijada admin davomatni belgilab, Telegramda hech narsa ko'rmasdi va
      // sababini bilmasdi ("bot buzuq" degan xulosa). Endi kamdan-kam, lekin
      // aniq eslatib turamiz: tuzatish joyi Guruhlar → ✏️ → Telegram.
      if (data.skipped) {
        if (data.skipped === "chat-id-yoq") {
          var gname = "";
          try {
            var g = ((window.D && D.groups) || []).find(function (x) {
              return x.id === groupId;
            });
            gname = (g && g.name) || "";
          } catch (_) {}
          warnThrottled(
            "tg-nochat-" + groupId,
            "📨 Telegram: " +
              (gname ? '"' + gname + '" guruhiga' : "bu guruhga") +
              " chat ID biriktirilmagan — hisobot yuborilmadi." +
              " Guruhlar → ✏️ → Telegram bo'limidan sozlang.",
          );
        }
        return;
      }
      // superseded — ketma-ket belgilashlar birlashdi, oxirgisi yuboradi.
      if (data.delivered) delete warned["tg-" + groupId];
    } catch (e) {
      warnThrottled(
        "tg-" + groupId,
        "⚠️ Telegram: hisobot yuborilmadi — " + (e && e.message),
      );
    }
  }

  /* --- Chat ID ni avtomatik aniqlash ---------------------------------------
     Chat ID ni qo'lda topish (getUpdates ni brauzerda ochish, `-100` prefiksi
     bormi-yo'qmi deb boshqotirish) eng ko'p xatoga sabab bo'lgan qadam edi —
     noto'g'ri ID bilan hech qanday xato ko'rinmasdi, xabar ham kelmasdi.
     Endi bot o'zi ko'rgan guruhlarni ro'yxat qilib beradi.                  */
  window.detectTelegramChats = async function () {
    var hint = document.getElementById("f-tgchat-hint");
    var list = document.getElementById("tg-chat-list");
    var input = document.getElementById("f-tgchat");
    if (hint) hint.textContent = "⏳ qidirilmoqda...";
    try {
      var res = await fetch(API_BASE + "/api/telegram/chats");
      var data = await res.json().catch(function () {
        return {};
      });
      if (!data.ok) {
        if (hint) hint.textContent = "⚠️ " + (data.error || "aniqlanmadi");
        return;
      }
      if (!data.chats.length) {
        // Telegram "privacy mode" tufayli bot guruhdagi ODDIY xabarlarni
        // ko'rmaydi — shuning uchun "guruhga xabar yozing" deyish yetarli
        // emas edi. Bot faqat "/" bilan boshlanadigan xabarlarni oladi.
        if (hint)
          hint.textContent =
            data.updateCount > 0
              ? "Guruh topilmadi — bot faqat shaxsiy chatlarni ko'rdi. Botni ota-onalar guruhiga qo'shing."
              : "Guruh topilmadi — guruhga /id deb yozing (oddiy xabarni bot ko'rmaydi), keyin qayta bosing. Yoki ID ni qo'lda kiriting.";
        return;
      }
      if (list) {
        list.innerHTML = data.chats
          .map(function (c) {
            return (
              '<option value="' + c.id + '">' + (c.title || c.type) + "</option>"
            );
          })
          .join("");
      }
      // Bitta guruh bo'lsa o'zimiz to'ldiramiz — ortiqcha qadam qolmasin.
      if (data.chats.length === 1 && input && !input.value.trim())
        input.value = data.chats[0].id;
      if (hint)
        hint.textContent =
          "✅ " +
          data.chats.length +
          " ta guruh topildi: " +
          data.chats
            .map(function (c) {
              return (c.title || c.id) + " (" + c.id + ")";
            })
            .join(", ");
    } catch (e) {
      if (hint) hint.textContent = "⚠️ " + (e && e.message);
    }
  };

  /* --- Chat ID rostdan saqlandimi ------------------------------------------
     Bir marta shunday bo'ldi: chat ID forma orqali kiritildi, "✅ Yangilandi"
     chiqdi, lekin bazada bo'sh qoldi (live-sync fon rejimida eski nusxani
     qaytarib yozgan). Foydalanuvchi esa "sozladim, ishlamayapti" holatida
     qoldi. Endi saqlangandan keyin backend'dan tekshiramiz.               */
  window.verifyTelegramChatSaved = async function (gid, expected) {
    await new Promise(function (r) {
      setTimeout(r, 1200);
    });
    try {
      var res = await fetch(API_BASE + "/api/data", { cache: "no-store" });
      var json = await res.json();
      var g = ((json.data && json.data.groups) || []).find(function (x) {
        return x.id === gid;
      });
      var got = ((g && g.telegramChatId) || "").trim();
      if (got === (expected || "").trim()) return;
      toast(
        "⚠️ Telegram chat ID saqlanmadi — qayta kiritib, Saqlash ni bosing",
      );
      console.warn("[telegram] chat ID saqlanmadi:", { expected: expected, got: got });
    } catch (e) {
      /* tarmoq xatosi — tekshirib bo'lmadi, jim qolamiz */
    }
  };

  /* --- setAtt() ni o'rash ---------------------------------------------------
     ⚠️ Bu yerda bir marta jimgina ishlamay qolgan: panellarning yuklovchisi
     skriptlarni GURUH-GURUH yuklaydi va telegram-bridge.js `setAtt` ni
     aniqlaydigan attendance-render.js dan OLDINGI guruhda edi. Natijada
     `window.setAtt` hali yo'q bo'lib, ko'prik o'ramasdan chiqib ketardi —
     davomat saqlanardi-yu, Telegramga hech narsa ketmasdi va xato ham
     chiqmasdi.

     Yuklash tartibi to'g'irlandi, lekin tartibga TAYANMAYMIZ: `setAtt` ni
     xossa (accessor) qilib qo'yamiz. Kim qachon `window.setAtt = ...` desa,
     biz uni ichki funksiya sifatida ushlaymiz; tashqariga esa har doim
     o'ralgan variant ko'rinadi. Endi yuklash tartibi o'zgarsa ham buzilmaydi. */
  var inner = typeof window.setAtt === "function" ? window.setAtt : null;

  function wrapped(attKey, sKey, lKey, val) {
    var result = inner ? inner.apply(this, arguments) : undefined;
    try {
      // Talaba paneli davomat belgilamaydi.
      if (getRole() === "student") return result;

      // attKey: att_<gid>_<year>_<month>   ·   lKey: l<n>
      var m = /^att_(\d+)_(\d+)_(\d+)$/.exec(attKey);
      var lm = /^l(\d+)$/.exec(lKey);
      if (!m || !lm) {
        console.warn("[telegram] kalit tanilmadi:", attKey, lKey);
        return result;
      }

      // Belgi tozalanganda ham yuboramiz: hisobot butun dars bo'yicha
      // qayta quriladi, ya'ni Telegramdagi xabar ⚪️ ga qaytishi kerak.
      // (Eski versiyada tozalash e'tiborsiz qolar va Telegramda eski belgi
      // qolib ketardi.)
      report(
        parseInt(m[1], 10),
        parseInt(m[2], 10),
        parseInt(m[3], 10),
        parseInt(lm[1], 10),
      );
    } catch (e) {
      console.error("[telegram]", e);
    }
    return result;
  }

  // Skriptlar panel almashganda qayta yuklanadi — xossani ikki marta
  // o'rnatib, hisobotni ikki marta yubormaslik uchun bayroq.
  if (!window.__tgAttBridge) {
    var installed = false;
    try {
      Object.defineProperty(window, "setAtt", {
        configurable: true,
        get: function () {
          return wrapped;
        },
        set: function (fn) {
          inner = fn;
        },
      });
      installed = true;
    } catch (e) {
      // Eski brauzer yoki xossa qayta aniqlanmaydigan holat — oddiy o'rash.
      if (inner) {
        window.setAtt = wrapped;
        installed = true;
      }
    }
    window.__tgAttBridge = installed;
    console.log(
      installed
        ? "[telegram] davomat ko'prigi tayyor"
        : "[telegram] setAtt o'ralmadi",
    );
  }
})();
