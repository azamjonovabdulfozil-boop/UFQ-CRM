/**
 * azureTts.js — Microsoft Azure Speech: o'zbekchani odamdek o'qiydigan ovoz.
 *
 * O'zbek tilida tabiiy talaffuz qiladigan neyron ovozlar faqat Azure'da bor:
 * uz-UZ-MadinaNeural (ayol) va uz-UZ-SardorNeural (erkak). OpenAI ovozlari
 * o'zbekchani chet el aksenti bilan o'qiydi.
 *
 * Sozlash (Render → Environment):
 *   AZURE_SPEECH_KEY=<kalit>         Azure portal → Speech service → Keys
 *   AZURE_SPEECH_REGION=westeurope   xizmat yaratilgan hudud
 *   AZURE_TTS_VOICE_UZ=uz-UZ-SardorNeural   (ixtiyoriy, sukut — Madina)
 *   AZURE_TTS_VOICE_RU=ru-RU-DmitryNeural   (ixtiyoriy, sukut — Svetlana)
 * Bepul tarif (F0) oyiga 500 000 belgigacha.
 */

export const azureTtsConfigured = () =>
  !!(String(process.env.AZURE_SPEECH_KEY || "").trim() && String(process.env.AZURE_SPEECH_REGION || "").trim());

/** Matn tili: kirill harflari ko'p bo'lsa — rus, aks holda — o'zbek. */
export function detectLang(text) {
  const s = String(text || "");
  const cyr = (s.match(/[Ѐ-ӿ]/g) || []).length;
  const lat = (s.match(/[A-Za-z]/g) || []).length;
  return cyr > lat ? "ru" : "uz";
}

const xmlEsc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);

/** O'zbekcha matnni ovoz to'g'ri o'qiydigan ko'rinishga keltirish. */
export function normalizeUz(text) {
  return String(text)
    // o' / g' dagi turli tutuq belgilarini bittaga keltiramiz
    .replace(/[‘’ʻʼ`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Matnni MP3 ga aylantiradi.
 * @returns {Promise<Buffer>}
 */
export async function azureTts(text, { timeoutMs = 30000 } = {}) {
  const lang = detectLang(text);
  const voice =
    lang === "ru"
      ? process.env.AZURE_TTS_VOICE_RU || "ru-RU-SvetlanaNeural"
      : process.env.AZURE_TTS_VOICE_UZ || "uz-UZ-MadinaNeural";
  const input = lang === "uz" ? normalizeUz(text) : String(text).trim();
  const ssml =
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${voice.slice(0, 5)}'>` +
    `<voice name='${voice}'><prosody rate='0%'>${xmlEsc(input)}</prosody></voice></speak>`;

  const region = String(process.env.AZURE_SPEECH_REGION).trim();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": String(process.env.AZURE_SPEECH_KEY).trim(),
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "edumanage-crm",
      },
      body: ssml,
      signal: ctrl.signal,
    });
    if (!r.ok) {
      const err = new Error("Azure TTS HTTP " + r.status);
      err.status = r.status;
      throw err;
    }
    return Buffer.from(await r.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}
