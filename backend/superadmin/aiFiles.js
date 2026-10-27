/**
 * superadmin/aiFiles.js — Super Admin AI'ga yuborilgan fayl va ovozni
 * har bir AI dvigateli tushunadigan ko'rinishga keltiradi.
 *
 *   • ovozli xabar      → aniq matnga (transkripsiya), ovozning o'zi saqlanadi
 *                          (Super Admin uni Telegramdagidek qayta eshitadi)
 *   • rasm              → AI rasmni ko'radi (Claude / Gemini)
 *   • PDF               → AI hujjatni o'qiydi (skanerlangan bo'lsa ham)
 *   • Word, Excel, CSV, matn, kod → matni ajratib olinadi
 *   • audio fayl        → matnga aylantiriladi
 *   • boshqa (zip, exe…) → nomi, turi va hajmi aytiladi
 *
 * Suhbat tarixiga faylning o'zi emas, qisqa matnli izohi yoziladi —
 * baza hujjati kattalashib ketmaydi.
 */
import { createRequire } from "node:module";
import { Binary } from "mongodb";
import { randomUUID } from "node:crypto";

const require = createRequire(import.meta.url);
export const MEDIA_COL = "super_ai_media";

const MAX_FILES = 10;
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const MAX_TOTAL_BYTES = 16 * 1024 * 1024;
const MAX_TEXT_CHARS = 60_000; // bitta hujjatdan AI'ga beriladigan matn
const HISTORY_TEXT_CHARS = 6_000; // tarixda saqlanadigan qismi
const B64 = /^[A-Za-z0-9+/=\s]+$/;

const kb = (n) => (n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
const clip = (s, n) => (String(s || "").length > n ? String(s).slice(0, n) + "…" : String(s || ""));
const ext = (name) => (String(name || "").toLowerCase().match(/\.([a-z0-9]{1,8})$/) || [])[1] || "";

const TEXT_EXT = new Set([
  "txt", "md", "csv", "tsv", "json", "xml", "html", "htm", "css", "js", "mjs", "ts", "vue", "py", "java", "c", "cpp", "cs",
  "php", "rb", "go", "rs", "sql", "log", "ini", "yml", "yaml", "env", "sh", "bat", "srt", "vtt",
]);

function kindOf(name, mime) {
  const e = ext(name);
  const m = String(mime || "").toLowerCase();
  if (/^image\/(png|jpe?g|gif|webp)$/.test(m) || ["png", "jpg", "jpeg", "gif", "webp"].includes(e)) return "image";
  if (m === "application/pdf" || e === "pdf") return "pdf";
  if (m.startsWith("audio/") || ["mp3", "wav", "ogg", "oga", "m4a", "webm", "aac", "flac", "opus"].includes(e)) return "audio";
  if (e === "docx" || m.includes("wordprocessingml")) return "docx";
  if (e === "xlsx" || m.includes("spreadsheetml")) return "xlsx";
  if (m.startsWith("text/") || TEXT_EXT.has(e) || m === "application/json") return "text";
  return "other";
}
const imageMime = (name, mime) => {
  const m = String(mime || "").toLowerCase();
  if (/^image\/(png|jpeg|gif|webp)$/.test(m)) return m;
  const e = ext(name);
  return e === "png" ? "image/png" : e === "gif" ? "image/gif" : e === "webp" ? "image/webp" : "image/jpeg";
};

async function docxText(buf) {
  const mammoth = require("mammoth");
  const { value } = await mammoth.extractRawText({ buffer: buf });
  return String(value || "").replace(/\n{3,}/g, "\n\n").trim();
}
async function xlsxText(buf) {
  const readXlsxFile = require("read-excel-file/node");
  const { readSheetNames } = require("read-excel-file/node");
  const names = await readSheetNames(buf);
  const out = [];
  for (const name of names.slice(0, 10)) {
    const rows = await readXlsxFile(buf, { sheet: name });
    out.push(`### List: ${name} (${rows.length} qator)`);
    for (const row of rows.slice(0, 1000))
      out.push(row.map((c) => (c == null ? "" : c instanceof Date ? c.toISOString().slice(0, 10) : String(c).replace(/[\t\n]/g, " "))).join(" | "));
  }
  return out.join("\n");
}

/** Kichik «to'lqin» (0–9 raqamlar) — ovozli xabar ko'rinishi uchun */
const cleanWave = (w) => String(w || "").replace(/[^0-9]/g, "").slice(0, 64);

/**
 * @param {object} body  { message, files:[{name,mime,data}], voice:{data,mime,dur,wave} }
 * @param {object} opt   { transcribe(f,hints) → Promise<string>, hints:string[], db, owner }
 * @returns {{ error?, text, claude, lovable, gemini, history, display }}
 */
export async function prepareInput(body, opt) {
  const userText = clip(String(body?.message || "").trim(), 8000);
  const files = Array.isArray(body?.files) ? body.files.slice(0, MAX_FILES + 1) : [];
  if (files.length > MAX_FILES) return { error: `Bir xabarga ${MAX_FILES} tadan ko'p fayl biriktirib bo'lmaydi` };
  const voice = body?.voice && body.voice.data ? body.voice : null;

  const claude = [];
  const lovable = [];
  const gemini = [];
  const notes = []; // AI'ga matnli izohlar
  const hist = []; // tarixga yoziladigan qisqa izohlar
  const display = { files: [], voice: null };
  const media = [];
  let total = 0;

  // ── Ovozli xabar ──
  let voiceText = "";
  if (voice) {
    const data = String(voice.data).replace(/\s+/g, "");
    if (!B64.test(data)) return { error: "Ovoz formati noto'g'ri" };
    const buf = Buffer.from(data, "base64");
    if (!buf.length) return { error: "Ovoz bo'sh" };
    if (buf.length > MAX_FILE_BYTES) return { error: "Ovozli xabar juda uzun (≈ 3 daqiqagacha bo'lsin)" };
    total += buf.length;
    const mime = /^audio\/[a-z0-9.+-]+$/i.test(String(voice.mime || "")) ? String(voice.mime).toLowerCase() : "audio/wav";
    voiceText = (await opt.transcribe({ data, mime, format: mime.split("/")[1] === "mpeg" ? "mp3" : mime.split("/")[1] }, opt.hints).catch(() => "")) || "";
    if (!voiceText)
      return {
        error:
          "Ovozli xabarni aniq tushunib bo'lmadi. Iltimos, telefonni yaqinroq tutib, shovqinsiz joyda qaytadan yozing yoki matn bilan yuboring.",
        code: "voice-unclear",
      };
    const id = randomUUID();
    media.push({ _id: id, mime, buf });
    display.voice = { id, dur: Math.max(0, Math.min(600, Number(voice.dur) || 0)), wave: cleanWave(voice.wave), transcript: clip(voiceText, 4000) };
  }

  // ── Fayllar ──
  for (const f of files) {
    const name = clip(String(f?.name || "fayl").replace(/[\\/:*?"<>|]/g, "_"), 120);
    const data = String(f?.data || "").replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
    if (!data || !B64.test(data)) return { error: `«${name}» faylini o'qib bo'lmadi` };
    const buf = Buffer.from(data, "base64");
    if (buf.length > MAX_FILE_BYTES) return { error: `«${name}» juda katta (${kb(buf.length)}). Bitta fayl 12 MB gacha bo'lsin` };
    total += buf.length;
    if (total > MAX_TOTAL_BYTES) return { error: "Fayllar jami juda katta (16 MB gacha)" };
    const kind = kindOf(name, f?.mime);
    const mime = kind === "image" ? imageMime(name, f?.mime) : kind === "pdf" ? "application/pdf" : String(f?.mime || "application/octet-stream").slice(0, 100);
    const item = { name, mime, kind, size: buf.length };

    if (kind === "image") {
      claude.push({ type: "image", source: { type: "base64", media_type: mime, data } });
      lovable.push({ type: "image_url", image_url: { url: `data:${mime};base64,${data}` } });
      gemini.push({ inline_data: { mime_type: mime, data } });
      notes.push(`🖼 Rasm biriktirildi: «${name}». Rasmni diqqat bilan ko'rib tahlil qil.`);
      hist.push(`[Rasm: ${name} — o'sha xabarda ko'rib chiqilgan]`);
    } else if (kind === "pdf") {
      claude.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data }, title: name });
      lovable.push({ type: "file", file: { filename: name, file_data: `data:application/pdf;base64,${data}` } });
      gemini.push({ inline_data: { mime_type: "application/pdf", data } });
      notes.push(`📕 PDF hujjat biriktirildi: «${name}» (${kb(buf.length)}). Uni to'liq o'qib tahlil qil.`);
      hist.push(`[PDF: ${name} — o'sha xabarda o'qilgan]`);
    } else if (kind === "audio") {
      const t = await opt.transcribe({ data, mime: mime.startsWith("audio/") ? mime : "audio/mpeg", format: ext(name) || "mp3" }, opt.hints).catch(() => "");
      notes.push(t ? `🎵 Audio fayl «${name}» matni:\n«${clip(t, MAX_TEXT_CHARS)}»` : `🎵 Audio fayl «${name}» — nutqni aniqlab bo'lmadi (musiqa yoki shovqin bo'lishi mumkin).`);
      hist.push(t ? `[Audio «${name}» matni: ${clip(t, HISTORY_TEXT_CHARS)}]` : `[Audio: ${name} — nutq aniqlanmadi]`);
    } else if (kind === "docx" || kind === "xlsx" || kind === "text") {
      let t = "";
      try {
        t = kind === "docx" ? await docxText(buf) : kind === "xlsx" ? await xlsxText(buf) : buf.toString("utf8").replace(/^﻿/, "");
      } catch {
        t = "";
      }
      const label = kind === "docx" ? "📝 Word hujjat" : kind === "xlsx" ? "📊 Excel jadval" : "📄 Fayl";
      notes.push(
        t
          ? `${label} «${name}» mazmuni${t.length > MAX_TEXT_CHARS ? " (boshidan " + MAX_TEXT_CHARS + " belgi)" : ""}:\n${clip(t, MAX_TEXT_CHARS)}`
          : `${label} «${name}» — ichidan matn o'qib bo'lmadi (bo'sh yoki shikastlangan).`,
      );
      hist.push(t ? `[${label} «${name}»: ${clip(t, HISTORY_TEXT_CHARS)}]` : `[${label}: ${name} — matn o'qilmadi]`);
    } else {
      const sig = buf.subarray(0, 4).toString("hex");
      const what = sig === "504b0304" ? "ZIP arxiv" : sig.startsWith("4d5a") ? "Windows dasturi (exe)" : "ikkilik fayl";
      notes.push(`📦 Fayl «${name}»: ${what}, ${kb(buf.length)}. Ichidagi ma'lumotni o'qib bo'lmaydi — faqat turi va hajmini hisobga ol.`);
      hist.push(`[Fayl: ${name} — ${what}, ${kb(buf.length)}]`);
    }

    // Rasm va hujjatlarni panelda qayta ochish uchun saqlaymiz
    if (kind === "image" || kind === "pdf" || buf.length <= 4 * 1024 * 1024) {
      const id = randomUUID();
      media.push({ _id: id, mime, buf, name });
      item.id = id;
    }
    display.files.push(item);
  }

  if (!userText && !voiceText && !display.files.length) return { error: "Xabar bo'sh" };

  // AI'ga boradigan to'liq matn
  const parts = [];
  if (voiceText)
    parts.push(
      "🎤 Super Admin ovozli xabar yubordi. Uning so'zma-so'z matni:\n«" + voiceText + "»\n" +
        "Ovozdagi buyruqni aynan shu matn bo'yicha bajar. Matnda ism, guruh yoki raqam noaniq bo'lsa — taxmin qilma, CRM'dan qidirib aniqla yoki Super Admindan so'ra. " +
        "Matn juda qisqa, uzuq yoki ma'nosiz bo'lsa (masalan bitta so'z) — hech qanday amal bajarma, nima demoqchi ekanini so'ra. " +
        "Ovozdan kelgan o'chirish yoki o'zgartirish buyrug'ini nima o'zgarishini aytib, «ha» tasdig'ini olgandan keyingina bajar.",
    );
  if (userText) parts.push(userText);
  parts.push(...notes);
  if (!userText && !voiceText && display.files.length) parts.push("Biriktirilgan fayllarni tahlil qilib, asosiy xulosalarni ayt va kerak bo'lsa qanday amal bajarish mumkinligini taklif qil.");
  const text = parts.join("\n\n");

  const history = [voiceText ? "🎤 (ovozli xabar) " + voiceText : "", userText, ...hist].filter(Boolean).join("\n\n");
  const visibleText = userText; // panelda ko'rinadigan yozuv

  // Saqlash: ovoz va fayllar alohida kolleksiyada (suhbat hujjati kichik qoladi)
  if (media.length && opt.db) {
    const now = new Date();
    await opt.db
      .collection(MEDIA_COL)
      .insertMany(media.map((m) => ({ _id: m._id, owner: opt.owner, mime: m.mime, name: m.name || null, size: m.buf.length, data: new Binary(m.buf), createdAt: now })))
      .catch((e) => console.warn("⚠️  [super-ai] media saqlanmadi:", e.message));
  }

  return {
    text,
    claude: claude.length ? [...claude, { type: "text", text }] : text,
    lovable: lovable.length ? [{ type: "text", text }, ...lovable] : text,
    gemini: [{ text }, ...gemini],
    history,
    visibleText,
    display,
  };
}

export async function ensureMediaIndexes(db) {
  try {
    await db.collection(MEDIA_COL).createIndex({ owner: 1, createdAt: -1 });
  } catch {}
}
