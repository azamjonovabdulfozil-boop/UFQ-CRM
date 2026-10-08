/**
 * EduManage CRM — Telegram transport qatlami (ikkala bot uchun umumiy)
 * ============================================================================
 * CRM da IKKITA mustaqil Telegram bot ishlaydi:
 *
 *   • davomatBot.js — ota-onalar GURUHIGA davomat hisoboti  (TELEGRAM_BOT_TOKEN)
 *   • qarzdorBot.js — qarzdor TALABAGA shaxsiy xabar        (QARZDOR_BOT_TOKEN)
 *
 * Ular bir-biriga bog'liq emas: alohida token, alohida getUpdates halqasi,
 * alohida navbat. Bittasining tokeni bekor qilinsa yoki 429 ga tushsa,
 * ikkinchisi ishlashda davom etadi.
 *
 * Nega bitta faylda? Chunki quyidagi uchta narsa har ikkala botda AYNAN bir xil
 * va nusxalansa ikki joyda alohida tuzatishga majbur bo'lardik:
 *
 *   1) Navbat — chiquvchi so'rovlar ketma-ket, sekundiga ~25 tadan. Telegram
 *      30/s dan keyin 429 qaytaradi; navbatsiz xabar shunchaki yo'qolardi.
 *   2) 429 da qayta urinish — Telegram qancha kutishni o'zi aytadi (retry_after),
 *      kutamiz va AYNAN o'sha xabarni qayta yuboramiz.
 *   3) getUpdates halqasi — uzun so'rov (long polling), 409 Conflict da
 *      (ikkinchi nusxa ham o'qiyotganda) log'ni bosmay, uzoqroq kutish.
 *
 * Navbat har bot uchun ALOHIDA: davomat hisoboti qarzdorlik xabarlari ortida
 * navbatda turib qolmasligi kerak.
 */

const API = "https://api.telegram.org";
const MIN_INTERVAL_MS = 40; // ~25 so'rov/s — Telegramning 30/s limitidan past
const MAX_RETRIES = 5;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {object} opts
 * @param {string} opts.envKey Token qaysi muhit o'zgaruvchisidan olinadi
 * @param {string} opts.label  Xato matnlarida ko'rinadigan nom
 */
export function createTelegramClient({ envKey, label }) {
  let queueTail = Promise.resolve();
  let botInfo = null;
  let polling = false;
  let pollOffset = 0;

  function token() {
    const t = (process.env[envKey] || "").trim();
    return t && !t.includes("your_") ? t : "";
  }

  const ready = () => !!token();

  function enqueue(fn) {
    const run = async () => {
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          return await fn();
        } catch (e) {
          if (e.retryAfter && attempt < MAX_RETRIES) {
            await sleep((e.retryAfter + 1) * 1000);
            continue;
          }
          throw e;
        }
      }
    };
    const result = queueTail.then(async () => {
      try {
        return await run();
      } finally {
        await sleep(MIN_INTERVAL_MS);
      }
    });
    queueTail = result.catch(() => {});
    return result;
  }

  /** Telegram API chaqiruvi. Navbatdan O'TMAYDI — navbat sendMessage darajasida. */
  async function api(method, body, timeoutMs = 15000) {
    const t = token();
    if (!t) throw new Error(`${envKey} sozlanmagan (${label})`);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let data;
    try {
      const r = await fetch(`${API}/bot${t}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
        signal: ctrl.signal,
      });
      data = await r.json();
    } finally {
      clearTimeout(timer);
    }
    if (!data.ok) {
      // Telegramning asl matnini saqlaymiz — "bot was blocked by the user"
      // kabi javoblar nosozlikni bir qarashda tushuntiradi.
      const err = new Error(data.description || `Telegram ${method} xatosi`);
      err.telegram = data.description || "";
      err.code = data.error_code;
      if (data.error_code === 429 && data.parameters?.retry_after)
        err.retryAfter = Number(data.parameters.retry_after);
      // Oddiy guruh supergruppaga aylantirilsa chat ID O'ZGARADI va eski ID
      // bilan yuborilgan har bir xabar rad etiladi. Telegram yangi ID ni shu
      // yerda aytadi — uni yuqoriga uzatamiz, chaqiruvchi qayta urinsin.
      if (data.parameters?.migrate_to_chat_id)
        err.migrateTo = String(data.parameters.migrate_to_chat_id);
      throw err;
    }
    return data.result;
  }

  const sendMessage = (chatId, text, extra) =>
    enqueue(() => api("sendMessage", { chat_id: chatId, text, ...(extra || {}) }));

  const editMessage = (chatId, messageId, text) =>
    enqueue(() =>
      api("editMessageText", { chat_id: chatId, message_id: messageId, text }),
    );

  /** Bot haqida ma'lumot (username deep-link uchun kerak). Keshlanadi. */
  async function getBotInfo() {
    if (botInfo) return botInfo;
    if (!ready()) return null;
    try {
      botInfo = await api("getMe", {}, 8000);
    } catch (e) {
      botInfo = null;
    }
    return botInfo;
  }

  /** Token HAQIQATAN ishlaydimi — /api/health uchun. */
  async function status() {
    if (!ready()) return `⚠️ sozlanmagan (${envKey})`;
    try {
      const me = await api("getMe", {}, 8000);
      return `✅ @${me.username}`;
    } catch (e) {
      return `❌ ${e.telegram || e.message}`;
    }
  }

  /**
   * getUpdates halqasi. FAQAT shu yerda o'qiladi: boshqa joydan ham chaqirilsa
   * yangilanishlar "o'g'irlanib", bog'lanish xabari yo'qolib qolardi.
   */
  function startPolling(onUpdate, allowedUpdates) {
    if (polling || !ready()) return false;
    polling = true;
    (async () => {
      while (polling) {
        try {
          const ups =
            (await api(
              "getUpdates",
              {
                offset: pollOffset,
                timeout: 25,
                allowed_updates: allowedUpdates || ["message", "my_chat_member"],
              },
              35000,
            )) || [];
          for (const u of ups) {
            pollOffset = u.update_id + 1;
            try {
              await onUpdate(u);
            } catch (e) {
              console.warn(`⚠️ [${label}] update ishlanmadi:`, e.message);
            }
          }
        } catch (e) {
          const desc = e.telegram || e.message || "";
          // 409 Conflict — boshqa nusxa ham getUpdates qilyapti (masalan lokal
          // server va Render bir vaqtda). Uzoqroq kutamiz, log'ni bosmaymiz.
          await sleep(/conflict|terminated by other/i.test(desc) ? 15000 : 5000);
        }
      }
    })();
    return true;
  }

  const isPolling = () => polling;

  return {
    envKey,
    label,
    token,
    ready,
    api,
    enqueue,
    sendMessage,
    editMessage,
    getBotInfo,
    status,
    startPolling,
    isPolling,
  };
}
