/**
 * azureTts.js — Microsoft Azure Speech: o'zbekchani odamdek o'qiydigan
 * neyron ovoz (uz-UZ-MadinaNeural — ayol, uz-UZ-SardorNeural — erkak).
 * Tez (bir gap ~0.5–1 soniya) va sifatli.
 *
 * Sozlash (Render → Environment):
 *   AZURE_SPEECH_KEY=<kalit>         Azure portal → Speech service → Keys
 *   AZURE_SPEECH_REGION=westeurope   xizmat yaratilgan hudud (ixtiyoriy —
 *                                    yozilmasa yoki noto'g'ri bo'lsa server
 *                                    uni o'zi aniqlaydi)
 *   AZURE_TTS_VOICE_UZ=uz-UZ-SardorNeural   (ixtiyoriy, sukut — Madina)
 *   AZURE_TTS_VOICE_RU=ru-RU-DmitryNeural   (ixtiyoriy, sukut — Svetlana)
 *   AZURE_TTS_RATE=+8%                      (ixtiyoriy, o'qish tezligi)
 * Kalit boshqa nom bilan qo'yilgan bo'lsa ham topiladi (pastdagi ro'yxat).
 * Bepul tarif (F0) oyiga 500 000 belgigacha.
 */

const clean = (v) =>
  String(v || "")
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .trim();

const KEY_NAMES = [
  "AZURE_SPEECH_KEY",
  "AZURE_TTS_KEY",
  "AZURE_SPEECH_API_KEY",
  "AZURE_KEY",
  "AZURE_API_KEY",
  "AZURE_COGNITIVE_KEY",
  "SPEECH_KEY",
  "SPEECH_API_KEY",
  "MICROSOFT_SPEECH_KEY",
  "MICROSOFT_TTS_KEY",
  "MS_SPEECH_KEY",
  "MS_TTS_KEY",
];
const REGION_NAMES = [
  "AZURE_SPEECH_REGION",
  "AZURE_TTS_REGION",
  "AZURE_REGION",
  "AZURE_SPEECH_LOCATION",
  "AZURE_LOCATION",
  "SPEECH_REGION",
  "MICROSOFT_SPEECH_REGION",
  "MS_SPEECH_REGION",
];
const ENDPOINT_NAMES = ["AZURE_SPEECH_ENDPOINT", "AZURE_TTS_ENDPOINT", "SPEECH_ENDPOINT", "AZURE_ENDPOINT"];

const firstEnv = (names) => {
  for (const n of names) {
    const v = clean(process.env[n]);
    if (v && !/your_|xxx/i.test(v)) return v;
  }
  return "";
};

const speechKey = () => firstEnv(KEY_NAMES);

/** "West Europe" → "westeurope"; endpoint manzilidan ham hududni ajratadi. */
function configuredRegion() {
  let r = firstEnv(REGION_NAMES);
  if (!r) {
    const ep = firstEnv(ENDPOINT_NAMES);
    const m = /^https?:\/\/([a-z0-9]+)\.(?:api\.cognitive|tts\.speech|stt\.speech)\.microsoft\.com/i.exec(ep);
    if (m) r = m[1];
  }
  return r.toLowerCase().replace(/[\s_-]+/g, "");
}

export const azureTtsConfigured = () => !!speechKey();

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

// ── Hududni avtomatik aniqlash ──────────────────────────────────────────────
// Azure kaliti faqat o'z hududida ishlaydi. Hudud yozilmagan yoki noto'g'ri
// bo'lsa — barcha hududlarga parallel "token" so'rovi yuboriladi va kalit
// qabul qilingan hudud eslab qolinadi.
const REGIONS = [
  "westeurope", "northeurope", "eastus", "eastus2", "westus", "westus2", "westus3", "centralus",
  "northcentralus", "southcentralus", "westcentralus", "canadacentral", "brazilsouth", "uksouth",
  "francecentral", "germanywestcentral", "switzerlandnorth", "swedencentral", "norwayeast", "italynorth",
  "polandcentral", "spaincentral", "uaenorth", "qatarcentral", "israelcentral", "southafricanorth",
  "centralindia", "southindia", "westindia", "eastasia", "southeastasia", "japaneast", "japanwest",
  "koreacentral", "koreasouth", "australiaeast", "australiasoutheast", "chinanorth2", "chinaeast2",
];
let _region = null; // aniqlangan hudud
let _detecting = null;

async function tokenOk(region, key, ms = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(`https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
      method: "POST",
      headers: { "Ocp-Apim-Subscription-Key": key, "Content-Length": "0" },
      signal: ctrl.signal,
    });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

async function detectRegion(key) {
  if (_detecting) return _detecting;
  _detecting = (async () => {
    const hits = await Promise.all(REGIONS.map(async (rg) => ((await tokenOk(rg, key)) ? rg : null)));
    const found = hits.find(Boolean) || null;
    if (found) console.log("🔊 Azure Speech hududi aniqlandi:", found);
    return found;
  })().finally(() => {
    const t = setTimeout(() => (_detecting = null), 60_000);
    if (t.unref) t.unref();
  });
  return _detecting;
}

async function synth(region, key, ssml, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        // Yuqori sifat: 24 kHz, 96 kbit/s
        "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
        "User-Agent": "edumanage-crm",
      },
      body: ssml,
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Matnni MP3 ga aylantiradi.
 * @returns {Promise<Buffer>}
 */
export async function azureTts(text, { timeoutMs = 20000 } = {}) {
  const key = speechKey();
  if (!key) throw new Error("Azure kaliti yo'q");
  const lang = detectLang(text);
  const voice =
    lang === "ru"
      ? clean(process.env.AZURE_TTS_VOICE_RU) || "ru-RU-SvetlanaNeural"
      : clean(process.env.AZURE_TTS_VOICE_UZ) || "uz-UZ-MadinaNeural";
  const rate = clean(process.env.AZURE_TTS_RATE) || "+8%";
  const input = lang === "uz" ? normalizeUz(text) : String(text).trim();
  const ssml =
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${voice.slice(0, 5)}'>` +
    `<voice name='${voice}'><prosody rate='${xmlEsc(rate)}'>${xmlEsc(input)}</prosody></voice></speak>`;

  let region = _region || configuredRegion();
  if (!region) region = _region = await detectRegion(key);
  if (!region) throw new Error("Azure: kalit hech bir hududda qabul qilinmadi (kalit noto'g'ri)");

  let r = await synth(region, key, ssml, timeoutMs);
  // 401 — kalit shu hududniki emas: to'g'ri hududni topib, qayta urinamiz
  if (r.status === 401 || r.status === 403) {
    const found = await detectRegion(key);
    if (found && found !== region) {
      _region = region = found;
      r = await synth(region, key, ssml, timeoutMs);
    }
  }
  if (!r.ok) {
    const body = (await r.text().catch(() => "")).slice(0, 160);
    const err = new Error(
      "Azure TTS HTTP " + r.status + " (hudud: " + region + ")" + (body ? ": " + body : "") +
        (r.status === 401 ? " — kalit noto'g'ri yoki boshqa hududniki" : ""),
    );
    err.status = r.status;
    throw err;
  }
  _region = region;
  return Buffer.from(await r.arrayBuffer());
}
