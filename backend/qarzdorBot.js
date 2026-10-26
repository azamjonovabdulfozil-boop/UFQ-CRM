/**
 * UFQ CRM — Qarzdorlar Telegram boti
 * ============================================================================
 * Davomat botidan ALOHIDA bot. U qarzdor talabaning (yoki ota-onasining)
 * SHAXSIY Telegramiga to'lov eslatmasini yuboradi.
 *
 * QANDAY ISHLAYDI
 * ---------------
 *   1) Admin @BotFather da yangi bot ochadi va tokenini Qarzdorlar sahifasidagi
 *      "🤖 Qarzdorlar boti" kartasiga qo'yadi. Token bazaga saqlanadi va bot
 *      shu zahoti ishga tushadi (server qayta ishga tushirilmaydi).
 *   2) Ota-ona (yoki talaba) botni ochib /start bosadi va "📱 Raqamni yuborish"
 *      tugmasi orqali O'Z telefon raqamini yuboradi.
 *   3) Bot raqamni CRM dagi talabalarning telefoni / ota-onasining telefoni
 *      bilan solishtiradi. Mos kelsa — chat shu talabaga bog'lanadi.
 *   4) Qarzdorlar sahifasida "🤖 Bot orqali" bosilganda xabar shu chatga ketadi.
 *
 * Nega raqam orqali? Telegram bot foydalanuvchiga birinchi bo'lib yoza olmaydi,
 * shuning uchun foydalanuvchi bir marta botni ochishi shart. Raqamni Telegram
 * o'zi tasdiqlaydi (faqat o'z kontaktini yuborish mumkin) — begona odam
 * boshqa talabaning qarzi haqidagi xabarlarni o'ziga ulay olmaydi.
 *
 * Bog'lanish TELEFON RAQAMI bo'yicha saqlanadi, talaba id si bo'yicha emas:
 * talabaning raqami CRM da o'zgartirilsa, yuborishda yangi raqam ishlatiladi.
 */

import { createTelegramClient } from "./telegramClient.js";
import { normalizePhone } from "./smsSender.js";

const SETTINGS = "app_settings";
const SETTINGS_ID = "qarzdor_bot";
const LINKS = "debtor_bot_links";

let _getDb = null;
let _token = ""; // bazadan o'qilgan token (bo'lmasa QARZDOR_BOT_TOKEN env)

const bot = createTelegramClient({
  envKey: "QARZDOR_BOT_TOKEN",
  label: "qarzdor-bot",
  getToken: () => _token,
});

export const TOKEN_RE = /^\d{5,15}:[A-Za-z0-9_-]{30,60}$/;

/* ─── Ishga tushirish va token ──────────────────────────────────────────── */

export async function initQarzdorBot({ getDb }) {
  _getDb = getDb;
  try {
    const doc = await getDb().collection(SETTINGS).findOne({ _id: SETTINGS_ID });
    _token = String(doc?.token || "").trim();
    await getDb().collection(LINKS).createIndex({ chatId: 1 }, { unique: true });
    await getDb().collection(LINKS).createIndex({ phone: 1 });
  } catch (e) {
    console.warn("⚠️ [qarzdor-bot] sozlama o'qilmadi:", e.message);
  }
  startQarzdorPolling();
}

export function startQarzdorPolling() {
  return bot.startPolling(handleUpdate, ["message"]);
}

export const qarzdorBotReady = () => bot.ready();

/** Token qayerdan olinmoqda — "db" (admin panel), "env" yoki "". */
function tokenSource() {
  if (_token) return "db";
  const e = (process.env.QARZDOR_BOT_TOKEN || "").trim();
  return e && !e.includes("your_") ? "env" : "";
}

/** Tokenni tekshirib (getMe) bazaga saqlaydi va botni qayta ishga tushiradi. */
export async function setQarzdorToken(raw) {
  const token = String(raw || "").trim();

  if (!token) {
    await _getDb().collection(SETTINGS).deleteOne({ _id: SETTINGS_ID });
    bot.stopPolling();
    _token = "";
    startQarzdorPolling(); // env da token bo'lsa — o'sha bilan davom etadi
    return { ok: true, removed: true };
  }

  if (!TOKEN_RE.test(token))
    return { ok: false, error: "Token formati noto'g'ri. @BotFather bergan tokenni to'liq qo'ying (123456789:ABC...)" };
  if (token === String(process.env.TELEGRAM_BOT_TOKEN || "").trim())
    return {
      ok: false,
      error: "Bu davomat botining tokeni. Qarzdorlar uchun @BotFather da ALOHIDA bot oching.",
    };

  // Token haqiqiyligini Telegramning o'zidan so'raymiz — saqlashdan OLDIN
  let me;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(10000),
    });
    const d = await r.json();
    if (!d.ok) return { ok: false, error: "Telegram tokenni rad etdi: " + (d.description || "noto'g'ri token") };
    me = d.result;
  } catch (e) {
    return { ok: false, error: "Telegramga ulanib bo'lmadi: " + e.message };
  }

  // Webhook o'rnatilgan bo'lsa getUpdates ishlamaydi — o'chirib qo'yamiz
  try {
    await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
      method: "POST",
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    /* muhim emas */
  }

  await _getDb()
    .collection(SETTINGS)
    .updateOne(
      { _id: SETTINGS_ID },
      { $set: { token, username: me.username || "", updatedAt: new Date() } },
      { upsert: true },
    );
  bot.stopPolling();
  _token = token;
  startQarzdorPolling();

  // Bot buyruqlar menyusi (ixtiyoriy)
  try {
    await bot.api("setMyCommands", {
      commands: [
        { command: "start", description: "Botni ulash (raqamni yuborish)" },
        { command: "stop", description: "Xabarlarni o'chirish" },
      ],
    });
  } catch (e) {}

  return { ok: true, username: me.username || "" };
}

/* ─── Bog'lanishlar ─────────────────────────────────────────────────────── */

const studentPhones = (s) =>
  [normalizePhone(s?.phone), normalizePhone(s?.parentPhone)].filter(Boolean);

/** Raqamga mos keladigan talabalar. */
function studentsByPhone(D, phone) {
  return (D?.students || []).filter((s) => studentPhones(s).includes(phone));
}

/** Qaysi talabalar botga ulangan — {studentId: chatlar soni}. */
export async function linkedMap(D) {
  const out = {};
  if (!_getDb) return out;
  const links = await _getDb().collection(LINKS).find({}, { projection: { phone: 1 } }).toArray();
  const count = {};
  for (const l of links) count[l.phone] = (count[l.phone] || 0) + 1;
  for (const s of D?.students || []) {
    let n = 0;
    for (const p of studentPhones(s)) n += count[p] || 0;
    if (n) out[s.id] = n;
  }
  return out;
}

export async function qarzdorStatus(D) {
  const source = tokenSource();
  const info = source ? await bot.getBotInfo() : null;
  let linked = {};
  let totalLinks = 0;
  try {
    linked = await linkedMap(D);
    totalLinks = await _getDb().collection(LINKS).countDocuments();
  } catch (e) {}
  return {
    ok: true,
    configured: !!source,
    source,
    working: !!info,
    username: info?.username || "",
    name: info?.first_name || "",
    link: info?.username ? `https://t.me/${info.username}` : "",
    status: !source
      ? "⚠️ Token qo'yilmagan"
      : info
        ? `✅ @${info.username} ishlayapti`
        : "❌ Token ishlamayapti (bekor qilingan yoki noto'g'ri)",
    linked,
    totalLinks,
  };
}

/**
 * Talabaga (uning va ota-onasining raqamiga ulangan barcha chatlarga) xabar.
 * @returns {{ok:boolean, sent?:number, error?:string, code?:string}}
 */
export async function sendToStudent(D, studentId, text) {
  if (!bot.ready()) return { ok: false, code: "no-token", error: "Qarzdorlar boti tokeni qo'yilmagan" };
  const st = (D?.students || []).find((x) => x.id === studentId);
  if (!st) return { ok: false, error: "Talaba topilmadi" };
  const phones = studentPhones(st);
  if (!phones.length) return { ok: false, code: "no-phone", error: "Talabaning telefon raqami kiritilmagan" };

  const links = await _getDb().collection(LINKS).find({ phone: { $in: phones } }).toArray();
  if (!links.length)
    return { ok: false, code: "not-linked", error: "Botga ulanmagan (ota-ona botda /start bosib raqamini yubormagan)" };

  let sent = 0;
  let lastErr = "";
  for (const l of links) {
    try {
      await bot.sendMessage(l.chatId, text);
      sent++;
    } catch (e) {
      lastErr = e.telegram || e.message;
      // Foydalanuvchi botni bloklagan / o'chirgan — bog'lanish endi foydasiz
      if (e.code === 403) await _getDb().collection(LINKS).deleteOne({ chatId: l.chatId });
    }
  }
  return sent ? { ok: true, sent } : { ok: false, error: lastErr || "yuborilmadi" };
}

/* ─── Telegram yangilanishlari ──────────────────────────────────────────── */

const contactKeyboard = {
  reply_markup: {
    keyboard: [[{ text: "📱 Raqamni yuborish", request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  },
};
const noKeyboard = { reply_markup: { remove_keyboard: true } };

async function loadD() {
  return (await _getDb().collection("crm_data").findOne({ _type: "main" })) || {};
}

async function handleUpdate(u) {
  const m = u.message;
  if (!m || !m.chat || m.chat.type !== "private") return; // faqat shaxsiy chat
  const chatId = String(m.chat.id);
  const text = String(m.text || "").trim();

  if (m.contact) {
    // Faqat O'Z kontaktini yuborgan bo'lsa qabul qilamiz
    if (m.contact.user_id && m.from && m.contact.user_id !== m.from.id) {
      await bot.sendMessage(chatId, "⚠️ Iltimos, pastdagi tugma orqali O'Z raqamingizni yuboring.", contactKeyboard);
      return;
    }
    const phone = normalizePhone(m.contact.phone_number);
    const D = phone ? await loadD() : {};
    const found = phone ? studentsByPhone(D, phone) : [];
    if (!found.length) {
      await bot.sendMessage(
        chatId,
        "❌ Bu raqam (" + (m.contact.phone_number || "") + ") o'quv markazi ro'yxatida topilmadi.\n\n" +
          "O'quv markazida qaysi raqam yozilgan bo'lsa, o'sha raqamli Telegramdan kiring yoki administratorga murojaat qiling.",
        noKeyboard,
      );
      return;
    }
    await _getDb()
      .collection(LINKS)
      .updateOne(
        { chatId },
        {
          $set: {
            chatId,
            phone,
            firstName: m.from?.first_name || "",
            username: m.from?.username || "",
            linkedAt: new Date(),
          },
        },
        { upsert: true },
      );
    await bot.sendMessage(
      chatId,
      "✅ Ulandingiz!\n\nO'quvchi: " + found.map((s) => s.name).join(", ") +
        "\n\nEndi to'lov eslatmalari shu yerga keladi. O'chirish uchun /stop yuboring.",
      noKeyboard,
    );
    return;
  }

  if (/^\/stop\b/.test(text)) {
    await _getDb().collection(LINKS).deleteOne({ chatId });
    await bot.sendMessage(chatId, "🔕 Xabarlar o'chirildi. Qayta ulash uchun /start bosing.", noKeyboard);
    return;
  }

  const linked = await _getDb().collection(LINKS).findOne({ chatId });
  if (linked && !/^\/start\b/.test(text)) {
    await bot.sendMessage(chatId, "✅ Siz ulangansiz — to'lov eslatmalari shu yerga keladi.\nSavollar bo'yicha o'quv markaziga murojaat qiling.");
    return;
  }

  await bot.sendMessage(
    chatId,
    "👋 Assalomu alaykum!\n\nBu — o'quv markazining to'lov eslatmalari boti.\n\n" +
      "Ulanish uchun pastdagi «📱 Raqamni yuborish» tugmasini bosing. " +
      "Raqamingiz o'quv markazidagi o'quvchi (yoki ota-ona) raqami bilan bir xil bo'lishi kerak.",
    contactKeyboard,
  );
}
