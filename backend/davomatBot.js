/**
 * EduManage CRM — Davomat Telegram boti
 * ============================================================================
 * Mentor/admin K, Y yoki S bosganda ota-onalar Telegram guruhiga davomat
 * hisoboti yuboriladi. Bir dars uchun bitta xabar bo'ladi: keyingi belgilashda
 * o'sha xabar TAHRIRLANADI, yangi xabar tashlanmaydi.
 *
 * Nega tashqi servis emas, shu yerda?
 * ------------------------------------
 * Avval bu ish `davomat-Mars` degan alohida botga HTTP orqali topshirilardi.
 * U yondashuvning uchta jiddiy kamchiligi bor edi:
 *
 *   1) Guruh va talabalar ro'yxati u yerga NUSXALANISHI kerak edi. Ro'yxat
 *      o'zgarsa qo'lda qayta sinxronlash talab qilinardi, aks holda hisobot
 *      eskirgan ro'yxat bo'yicha chiqardi.
 *   2) U bot davomatni qabul qilib DARHOL "ok" qaytarardi, Telegramga esa fon
 *      rejimida yuborardi — yuborilmasa CRM tomonda hech narsa bilinmasdi.
 *   3) Bot boshqa loyiha bilan baham ko'rilardi, shuning uchun har bir yozuv
 *      amali "begona guruhga tegib ketmaslik" qoidalari bilan cheklangan edi.
 *
 * Endi hisobot to'g'ridan-to'g'ri CRM ma'lumotidan quriladi — nusxa ham,
 * sinxronlash ham, "ulash" tugmasi ham kerak emas. Yuborish natijasi esa
 * chaqiruvchiga ROSTAKAM qaytariladi.
 *
 * Saqlanadigan yagona narsa — xabar id si (`telegram_reports` kolleksiyasi),
 * shu orqali keyingi belgilashda o'sha xabar tahrirlanadi.
 *
 * ⚠️ Bu bot faqat GURUHGA yozadi — davomat hisobotini ham, qarzdorlik
 * xabarnomasini ham (Qarzdorlar sahifasi → "📨 Ota-onalar guruhiga").
 * Talabaning SHAXSIY Telegramiga yozib bo'lmaydi: Telegram bot foydalanuvchiga
 * birinchi bo'lib yoza olmaydi. Shuning uchun shaxsiy yetkazish kanali —
 * SMS (`smsSender.js`).
 */

import { createTelegramClient } from "./telegramClient.js";

const DEBOUNCE_MS = 1500; // ketma-ket belgilashlar bitta xabarga birlashsin
const COLLECTION = "telegram_reports";

const bot = createTelegramClient({
  envKey: "TELEGRAM_BOT_TOKEN",
  label: "davomat-bot",
});

let _getDb = null;

export function initDavomatBot({ getDb }) {
  _getDb = getDb;
}

export function botReady() {
  return bot.ready();
}

/* ─── Telegram API ──────────────────────────────────────────────────────────
   Navbat, 429 da qayta urinish va getUpdates halqasi `telegramClient.js` da —
   ikkala bot uchun bir xil bo'lgani uchun bir joyda turadi. Bu botning navbati
   qarzdorlik botinikidan ALOHIDA: hisobot ommaviy xabarlar ortida navbatda
   turib qolmaydi.                                                          */

const sendMessage = (chatId, text) => bot.sendMessage(chatId, text);
const editMessage = (chatId, messageId, text) =>
  bot.editMessage(chatId, messageId, text);

/**
 * Ixtiyoriy matnni guruhga yuboradi (Qarzdorlar sahifasi ishlatadi).
 * Davomat hisobotidan farqi: bu xabar tahrirlanmaydi, har safar yangisi
 * ketadi — qarzdorlik xabarnomasi tarixi guruhda ko'rinib tursin.
 */
export async function sendGroupMessage(chatId, text) {
  if (!bot.ready())
    return { ok: false, code: "no-token", error: "TELEGRAM_BOT_TOKEN sozlanmagan" };
  const id = String(chatId || "").trim();
  const err = validateChatId(id);
  if (err) return { ok: false, code: "bad-chat", error: err };
  try {
    const msg = await sendMessage(id, text);
    return { ok: true, messageId: msg.message_id, chatId: id };
  } catch (e) {
    // Guruh supergruppaga aylantirilgan — yangi ID bilan bir marta qayta
    // urinamiz, aks holda xabar shunchaki yo'qoladi.
    if (e.migrateTo) {
      try {
        const msg = await sendMessage(e.migrateTo, text);
        await rememberMigration(id, e.migrateTo);
        return { ok: true, messageId: msg.message_id, chatId: e.migrateTo, migrated: true };
      } catch (e2) {
        return { ok: false, error: e2.telegram || e2.message };
      }
    }
    return { ok: false, error: e.telegram || e.message };
  }
}

/**
 * Guruh supergruppaga aylanganda chat ID o'zgaradi. Buni CRM ma'lumotida ham
 * yangilamasak, keyingi har bir xabar yana o'sha xatoga urilib turadi va
 * foydalanuvchi sababini bilmaydi.
 */
async function rememberMigration(oldId, newId) {
  try {
    await _getDb()
      .collection("crm_data")
      .updateOne(
        { _type: "main", "groups.telegramChatId": String(oldId) },
        { $set: { "groups.$[g].telegramChatId": String(newId) } },
        { arrayFilters: [{ "g.telegramChatId": String(oldId) }] },
      );
    console.log(`ℹ️ [davomat-bot] chat ID yangilandi: ${oldId} → ${newId} (supergruppa)`);
  } catch (e) {
    console.warn("⚠️ [davomat-bot] yangi chat ID saqlanmadi:", e.message);
  }
}

/* ─── Hisobot matni ─────────────────────────────────────────────────────── */

const DAY_MAP = { Du: 1, Se: 2, Ch: 3, Pa: 4, Ju: 5, Sh: 6 };
const MONTHS = [
  "yanvar", "fevral", "mart", "aprel", "may", "iyun",
  "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr",
];

// Dars raqami (1..12) → oy ichidagi kalendar kuni. Frontenddagi
// getLessonDates bilan bir xil qoida: guruhning dars kunlari oy bo'ylab
// ketma-ket sanaladi, 1-dars = birinchi shunday kun.
export function lessonDate(group, year, month, lessonNo, lessonCount = 12) {
  const days = (group?.days || []).map((d) => DAY_MAP[d] || 0).filter(Boolean);
  if (!days.length) return null;
  const inMonth = new Date(year, month + 1, 0).getDate();
  const found = [];
  for (let day = 1; day <= inMonth && found.length < lessonCount; day++) {
    if (days.includes(new Date(year, month, day).getDay())) found.push(day);
  }
  return found[lessonNo - 1] || null;
}

const ICON = { K: "✅", Y: "❌", S: "📝" };

export function buildReport(group, students, marks, year, month, lessonNo) {
  const day = lessonDate(group, year, month, lessonNo);
  const dateStr = day
    ? `${day}-${MONTHS[month]}, ${year}`
    : `${MONTHS[month]} ${year}`;
  const time = new Date().toLocaleTimeString("uz-UZ", {
    timeZone: "Asia/Tashkent",
    hour: "2-digit",
    minute: "2-digit",
  });

  const lines = [
    "📊 Davomat hisoboti",
    "",
    `👥 Guruh: ${group.name}`,
    `📅 Sana: ${dateStr} (${lessonNo}-dars)`,
    `⏰ Yangilandi: ${time}`,
    "",
  ];

  let k = 0, y = 0, s = 0, none = 0;
  students.forEach((st, i) => {
    const v = marks[`s${st.id}`]?.[`l${lessonNo}`] || "";
    if (v === "K") k++;
    else if (v === "Y") y++;
    else if (v === "S") s++;
    else none++;
    lines.push(`${i + 1}. ${st.name} ${ICON[v] || "⚪️"}`);
  });

  lines.push("");
  if (y > 0) lines.push("\nFarzandingiz kech qolayotgan bo'lishi mumkin ⚠️");

  return lines.join("\n");
}

/* ─── Xabar id sini saqlash ─────────────────────────────────────────────── */

const reportKey = (gid, year, month, lesson) =>
  `${gid}:${year}:${month}:${lesson}`;

async function loadReport(key) {
  return await _getDb().collection(COLLECTION).findOne({ _id: key });
}

async function saveReport(key, chatId, messageId) {
  await _getDb()
    .collection(COLLECTION)
    .updateOne(
      { _id: key },
      { $set: { chatId, messageId, updatedAt: new Date() } },
      { upsert: true },
    );
}

async function dropReport(key) {
  await _getDb().collection(COLLECTION).deleteOne({ _id: key });
}

/* ─── Yuborish ──────────────────────────────────────────────────────────── */

// Xabarni tahrirlashga urinadi; iloji bo'lmasa YANGI xabar yuboradi. Sababi:
// editMessageText har xil sabab bilan rad etilishi mumkin (xabar o'chirilgan,
// juda eski, chat ko'chgan) — bunda hisobot umuman yangilanmay qolmasin.
async function sendOrEdit(key, chatId, text) {
  const prev = await loadReport(key);

  if (prev?.messageId && String(prev.chatId) === String(chatId)) {
    try {
      await editMessage(chatId, prev.messageId, text);
      return { messageId: prev.messageId, edited: true };
    } catch (e) {
      // "message is not modified" — xato emas, matn o'zgarmagan
      if (/not modified/i.test(e.telegram || e.message))
        return { messageId: prev.messageId, edited: true };
      await dropReport(key);
    }
  }

  try {
    const msg = await sendMessage(chatId, text);
    await saveReport(key, chatId, msg.message_id);
    return { messageId: msg.message_id, edited: false };
  } catch (e) {
    if (!e.migrateTo) throw e;
    const msg = await sendMessage(e.migrateTo, text);
    await saveReport(key, e.migrateTo, msg.message_id);
    await rememberMigration(chatId, e.migrateTo);
    return { messageId: msg.message_id, edited: false, migrated: true };
  }
}

/* ─── Debounce ──────────────────────────────────────────────────────────── */
// Mentor bir necha talabani ketma-ket belgilaganda har biriga alohida xabar
// ketmasin. Oxirgi chaqiruv haqiqiy yuborishni bajaradi va NATIJANI qaytaradi;
// undan oldingilari "superseded" bo'lib tinch tugaydi. Shu bilan chaqiruvchi
// har doim rost javob oladi — "yuborildi" deb aldab qo'yilmaydi.

const timers = new Map();

function scheduleSend(key, job) {
  const existing = timers.get(key);
  if (existing) {
    clearTimeout(existing.handle);
    existing.resolve({ superseded: true });
  }
  return new Promise((resolve, reject) => {
    const handle = setTimeout(async () => {
      timers.delete(key);
      try {
        resolve(await job());
      } catch (e) {
        reject(e);
      }
    }, DEBOUNCE_MS);
    timers.set(key, { handle, resolve });
  });
}

/* ─── Ommaviy API ───────────────────────────────────────────────────────── */

export function validateChatId(id) {
  // Nusxa-ko'chirishda ID ga qo'shilib ketgan bo'sh joy/ko'rinmas belgi tufayli
  // butun integratsiya "sababsiz" ishlamay qolgan edi — shuning uchun bu yerda
  // ham tozalaymiz, chaqiruvchining trim qilganiga tayanmaymiz.
  const v = String(id == null ? "" : id).trim();
  if (!v) return "Ota-onalar guruhi chat ID si kiritilmagan";
  if (/^\d/.test(v))
    return `Chat ID "${v}" musbat — bu foydalanuvchi id si, guruh emas.`;
  // Oddiy guruh: -123456789 · supergruppa/kanal: -1001234567890
  if (!/^-\d{5,15}$/.test(v))
    return `Chat ID "${v}" noto'g'ri. Namuna: -1001234567890`;
  return null;
}

/**
 * Bitta dars uchun hisobotni yuboradi/tahrirlaydi.
 * Hisobot CRM ma'lumotidan quriladi — nusxa ro'yxat yo'q.
 *
 * ⚠️ `loadD` — ma'lumotni O'QIYDIGAN funksiya, tayyor ma'lumot emas. Bu ataylab:
 * frontend belgilashni saqlash (POST /api/data) va hisobot so'rovini deyarli
 * bir vaqtda yuboradi. Ma'lumot debounce'dan OLDIN o'qilsa, eng oxirgi belgi
 * hali bazaga tushmagan bo'lishi mumkin va hisobotdan tushib qolardi. Shuning
 * uchun o'qish debounce tugagach, yuborishdan bevosita oldin bajariladi.
 */
export async function sendAttendanceReport(loadD, groupId, year, month, lesson) {
  if (!botReady()) return { ok: false, error: "TELEGRAM_BOT_TOKEN sozlanmagan" };

  const key = reportKey(groupId, year, month, lesson);

  try {
    const out = await scheduleSend(key, async () => {
      const D = (await loadD()) || {};
      const group = (D.groups || []).find((g) => g.id === groupId);
      if (!group) throw new Error(`Guruh topilmadi: ${groupId}`);

      const chatId = String(group.telegramChatId || "").trim();
      if (!chatId) return { skipped: "chat-id-yoq" };

      const chatErr = validateChatId(chatId);
      if (chatErr) throw new Error(chatErr);

      if (!(group.days || []).length)
        throw new Error(
          `"${group.name}" guruhida dars kunlari belgilanmagan — hisobot sanasi aniqlanmaydi`,
        );

      const students = (D.students || []).filter((s) => s.groupId === groupId);
      if (!students.length) throw new Error("Guruhda talaba yo'q");

      const marks =
        (D.attendance || {})[`att_${groupId}_${year}_${month}`] || {};
      const text = buildReport(group, students, marks, year, month, lesson);
      return await sendOrEdit(key, chatId, text);
    });

    if (out.superseded) return { ok: true, superseded: true };
    if (out.skipped) return { ok: true, skipped: out.skipped };
    return { ok: true, delivered: true, edited: out.edited };
  } catch (e) {
    return { ok: false, error: e.telegram || e.message };
  }
}

/* ─── Guruhlarni aniqlash ───────────────────────────────────────────────────
   Botni ota-onalar guruhiga qo'shgandan keyin chat ID ni qo'lda qidirmaslik
   uchun: halqa ko'rgan guruhlar shu keshda to'planadi.
   getUpdates BITTA joyda — halqada — o'qiladi. Uni boshqa joydan ham chaqirsak
   yangilanishlar "o'g'irlanib", guruh xabari yo'qolib qolardi.             */

const chatCache = new Map();
const CHATS_COLLECTION = "telegram_chats";

// getUpdates faqat OXIRGI 24 SOATdagi yangilanishlarni beradi va server qayta
// ishga tushsa kesh bo'shab qoladi — ya'ni bot guruhga kecha qo'shilgan bo'lsa
// "🔍 Aniqlash" hech narsa topmasdi. Shuning uchun ko'rilgan guruhlar bazaga
// yoziladi va ro'yxat o'sha yerdan ham o'qiladi.
async function rememberChat(chat) {
  const row = {
    id: String(chat.id),
    title: chat.title || "",
    type: chat.type,
  };
  chatCache.set(row.id, row);
  try {
    await _getDb()
      .collection(CHATS_COLLECTION)
      .updateOne(
        { _id: row.id },
        { $set: { ...row, seenAt: new Date() } },
        { upsert: true },
      );
  } catch (e) {
    /* baza yo'q bo'lsa ham kesh ishlaydi */
  }
}

// Halqa umuman yangilanish ko'rdimi — "bot guruhda yo'q" bilan "bot guruhni
// ko'rmayapti" ni ajratish uchun. Ilgari bu son guruhlar soniga teng edi,
// shuning uchun ogohlantirish matni hech qachon to'g'ri chiqmasdi.
let updatesSeen = 0;

/* ─── getUpdates halqasi ────────────────────────────────────────────────── */

async function handleUpdate(u) {
  updatesSeen++;
  const chat = u.message?.chat || u.my_chat_member?.chat;
  if (!chat) return;

  if (chat.type !== "private") {
    await rememberChat(chat);
    // Guruhda /id (yoki /start) yozilsa — chat ID ni O'SHA YERDA aytamiz.
    // Sozlash yo'riqnomasi shuni so'raydi; ilgari bot jim turar edi va
    // foydalanuvchi "bot ishlamayapti" degan xulosaga kelardi.
    const txt = String(u.message?.text || "").trim();
    if (/^\/(id|start|chatid)(@\w+)?\b/i.test(txt)) {
      try {
        await sendMessage(
          chat.id,
          `🆔 Bu guruhning chat ID si:\n${chat.id}\n\n` +
            "CRM → Guruhlar → ✏️ → «Ota-onalar guruhi chat ID» maydoniga shuni " +
            "qo'ying (yoki 🔍 Aniqlash ni bosing) va Saqlang. Shundan keyin " +
            "davomat hisoboti shu guruhga o'zi kelib turadi.",
        );
      } catch (e) {
        console.warn("⚠️ [davomat-bot] /id javobi ketmadi:", e.telegram || e.message);
      }
    }
    return;
  }

  // Shaxsiy yozishma — bu bot uchun emas. Jim qolsak, talaba "bot ishlamayapti"
  // deb o'ylaydi; shuning uchun qisqacha tushuntiramiz.
  if (!/^\/start\b/.test(String(u.message?.text || "").trim())) return;
  try {
    await sendMessage(
      chat.id,
      "👋 Bu — davomat hisoboti boti. U faqat ota-onalar guruhiga yozadi.\n\n" +
        "To'lov xabarlari uchun o'quv markazi bergan shaxsiy havolani oching.",
    );
  } catch (e) {}
}

/** Serverni ishga tushirganda chaqiriladi. Token yo'q bo'lsa — jim turadi. */
export function startTelegramPolling() {
  return bot.startPolling(handleUpdate, ["message", "my_chat_member"]);
}

/**
 * Botni guruhga qo'shgandan keyin chat ID ni QO'LDA qidirmaslik uchun:
 * halqa to'plagan guruhlar ro'yxatini qaytaradi.
 */
export async function discoverChats() {
  if (!bot.ready())
    return { ok: false, error: "TELEGRAM_BOT_TOKEN sozlanmagan" };
  try {
    // getUpdates webhook o'rnatilgan bo'lsa umuman ishlamaydi. Buni oldindan
    // aytmasak, foydalanuvchi bo'sh ro'yxatni ko'rib "bot guruhda yo'q" deb
    // o'ylaydi — aslida sabab butunlay boshqa.
    // Tekshiruvning o'zi ishlamay qolsa — aniqlashni TO'XTATMAYMIZ, u shunchaki
    // qo'shimcha ma'lumot. Asosiy ish getUpdates da.
    try {
      const wh = await bot.api("getWebhookInfo", {}, 8000);
      if (wh?.url)
        return {
          ok: false,
          error: `Botga webhook o'rnatilgan (${wh.url}) — avtomatik aniqlash ishlamaydi. Chat ID ni qo'lda kiriting.`,
        };
    } catch (_) {
      /* tekshirib bo'lmadi — davom etamiz */
    }

    // Halqa ishlamayotgan bo'lsa (token yangi qo'yilgan) — yoqib qo'yamiz.
    startTelegramPolling();

    // Kesh + bazada saqlangan guruhlar birlashtiriladi (server qayta ishga
    // tushgan bo'lsa kesh bo'sh, lekin baza to'la).
    const merged = new Map(chatCache);
    try {
      const rows = await _getDb()
        .collection(CHATS_COLLECTION)
        .find({})
        .sort({ seenAt: -1 })
        .limit(50)
        .toArray();
      for (const r of rows)
        if (!merged.has(r.id))
          merged.set(r.id, { id: r.id, title: r.title || "", type: r.type });
    } catch (e) {
      /* bazadan o'qib bo'lmadi — keshdagisi bilan davom etamiz */
    }

    return {
      ok: true,
      chats: [...merged.values()],
      // Xabar umuman kelmaganini (privacy mode) va "keldi-yu guruh emas"
      // holatini ajratish uchun — hint matni shunga qarab tanlanadi.
      updateCount: updatesSeen,
    };
  } catch (e) {
    return { ok: false, error: e.telegram || e.message };
  }
}

/** Token haqiqatan ishlaydimi — /api/health uchun. */
export async function botStatus() {
  return await bot.status();
}
