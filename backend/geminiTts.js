/**
 * geminiTts.js — Google Gemini nutq modeli (rasmiy API, GEMINI_API_KEY).
 *
 * Gemini TTS ko'p tilli: o'zbekchani ham tabiiy o'qiydi. Unga uslub haqida
 * ko'rsatma berish mumkin — "ona tili o'zbek bo'lgan diktordek o'qi".
 * Javob — xom PCM (24 kHz, 16-bit, mono); brauzer o'ynashi uchun WAV ga
 * o'raymiz.
 *
 * ENV: GEMINI_API_KEY (yoki GOOGLE_API_KEY), ixtiyoriy GEMINI_TTS_MODEL,
 *      GEMINI_TTS_VOICE (sukut — "Kore").
 */

// Render'ga qo'yilganda qo'shtirnoq yoki bo'sh joy qolib ketishi mumkin — tozalaymiz
const key = () =>
  String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
export const geminiTtsConfigured = () => !!key() && !key().includes("your_");

function pcmToWav(pcm, rate = 24000) {
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + pcm.length, 4);
  head.write("WAVE", 8);
  head.write("fmt ", 12);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36);
  head.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([head, pcm]);
}

const STYLE = {
  uz:
    "Quyidagi matnni ona tili o'zbek bo'lgan toshkentlik diktordek o'qing: o'zbek adabiy talaffuzida, " +
    "o', g', q, x, sh, ch tovushlarini to'g'ri aytib, raqamlarni o'zbekcha o'qib, tabiiy, iliq va " +
    "shoshilmasdan. Chet el aksenti bo'lmasin. Matn:\n",
  ru: "Прочитай следующий текст естественно, тепло и спокойно, как носитель русского языка:\n",
};

/**
 * @param {string} text
 * @param {"uz"|"ru"} lang
 * @returns {Promise<{buf:Buffer, type:string}>}
 */
export async function geminiTts(text, lang = "uz", { timeoutMs = 60000 } = {}) {
  const models = [process.env.GEMINI_TTS_MODEL, "gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"].filter(Boolean);
  const body = {
    contents: [{ parts: [{ text: (STYLE[lang] || STYLE.uz) + text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: process.env.GEMINI_TTS_VOICE || "Kore" } } },
    },
  };
  let lastErr = null;
  for (const model of [...new Set(models)]) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key())}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal },
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        lastErr = new Error("Gemini TTS HTTP " + r.status + ": " + (data?.error?.message || ""));
        if (r.status === 404 || r.status === 400) continue; // boshqa modelni sinaymiz
        throw lastErr;
      }
      const part = (data.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData || p.inline_data);
      const inl = part && (part.inlineData || part.inline_data);
      if (!inl?.data) {
        lastErr = new Error("Gemini TTS bo'sh audio qaytardi");
        continue;
      }
      const raw = Buffer.from(inl.data, "base64");
      const mime = String(inl.mimeType || inl.mime_type || "");
      if (/wav|mpeg|mp3|ogg/i.test(mime)) return { buf: raw, type: mime };
      const rate = Number((/rate=(\d+)/.exec(mime) || [])[1]) || 24000;
      return { buf: pcmToWav(raw, rate), type: "audio/wav" };
    } catch (e) {
      lastErr = e;
      if (e.name === "AbortError") break;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr || new Error("Gemini TTS ishlamadi");
}
