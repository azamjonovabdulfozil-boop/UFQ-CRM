/**
 * methodology.js — 🧭 Metodologiya.
 *
 * Admin kurs metodologiyasini yuklaydi (PDF, Word .docx, Excel .xlsx, CSV,
 * TXT). Server hujjat MATNINI o'qib, uni bo'limlar va darslarga ajratadi:
 *   1-bo'lim «Kompyuter savodxonligi» → 1-dars, 2-dars …
 *   2-bo'lim «Dizaynerlik» → …
 * Har bir darsda hujjatdagi matnning o'zi saqlanadi (nima o'tiladi, misollar
 * va h.k.) — hech narsa o'ylab topilmaydi. Mentor «Metodologiya» bo'limida
 * bo'lim → darsni tanlab, bugun nima o'tishini ko'radi.
 *
 * Ajratish tartibi:
 *   1) hujjatdagi sarlavhalar («1-bo'lim», «Modul 2», «3-dars», «Mavzu 4»,
 *      Word'dagi Heading uslublari, Excel ustunlari);
 *   2) topilmasa va AI kaliti bo'lsa — AI faqat QAYERDAN bo'lishni
 *      ko'rsatadi (qator raqamlari), matn baribir hujjatdan olinadi;
 *   3) bo'lmasa — PDF sahifalari / matn bo'laklari bo'yicha.
 *
 * Saqlash: `methodologies` kolleksiyasi (asl fayl — Binary, 12 MB gacha).
 * Ruxsat: ko'rish — admin va mentor; yuklash/o'zgartirish — faqat admin.
 */
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { Binary } from "mongodb";

const require = createRequire(import.meta.url);
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const MAX_LESSON_CHARS = 30000;
const MAX_TOTAL_CHARS = 3_000_000;

const KINDS = {
  pdf: { mime: "application/pdf", label: "PDF" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "Word" },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", label: "Excel" },
  csv: { mime: "text/csv; charset=utf-8", label: "CSV" },
  txt: { mime: "text/plain; charset=utf-8", label: "Matn" },
};

/* ─── Matn yordamchilari ─────────────────────────────────────────────────── */

const clip = (v, n) => String(v == null ? "" : v).slice(0, n);
const APOS = /[ʻʼ’‘`´]/g;
const normApos = (s) => String(s || "").replace(APOS, "'");
const squash = (s) => String(s || "").replace(/[ \t ]+/g, " ").trim();

function decodeEntities(s) {
  return String(s)
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&amp;/g, "&");
}
const stripTags = (h) => squash(decodeEntities(String(h).replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")));

/* ─── Fayldan qatorlar ───────────────────────────────────────────────────── */

/** PDF → [{t, page}] — har bir sahifa matni qatorlarga bo'linadi. */
async function pdfLines(buf) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs")).href;
  } catch (e) {}
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  }).promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    let cur = "";
    let lastY = null;
    const push = () => {
      const t = squash(cur);
      if (t) out.push({ t, page: p });
      cur = "";
    };
    for (const it of tc.items) {
      if (typeof it.str !== "string") continue;
      const y = it.transform ? Math.round(it.transform[5]) : null;
      if (lastY != null && y != null && Math.abs(y - lastY) > 2 && cur) push();
      cur += (cur && !cur.endsWith(" ") && it.str && !it.str.startsWith(" ") ? " " : "") + it.str;
      if (it.hasEOL) push();
      if (y != null) lastY = y;
    }
    push();
    page.cleanup();
  }
  await doc.destroy();
  return { lines: out, pages: doc.numPages };
}

/** Word (.docx) → [{t, h}] — h: sarlavha darajasi (Heading 1 → 1). */
async function docxLines(buf) {
  const mammoth = require("mammoth");
  const { value: html } = await mammoth.convertToHtml({ buffer: buf });
  const out = [];
  const re = /<(h[1-6]|p|li|tr)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[1].toLowerCase();
    let t;
    if (tag === "tr") {
      const cells = [...m[2].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => stripTags(c[1])).filter(Boolean);
      t = cells.join(" — ");
    } else t = stripTags(m[2]);
    if (!t) continue;
    out.push({ t, h: tag[0] === "h" ? +tag[1] : 0, li: tag === "li" });
  }
  return { lines: out };
}

function textLines(buf) {
  const s = buf.toString("utf8").replace(/^﻿/, "");
  return { lines: s.split(/\r?\n/).map((t) => ({ t: squash(t) })).filter((l) => l.t) };
}

function csvRows(buf) {
  const s = buf.toString("utf8").replace(/^﻿/, "");
  const first = s.split(/\r?\n/, 1)[0] || "";
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : ",";
  const rows = [];
  let row = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

async function xlsxSheets(buf) {
  const readXlsxFile = require("read-excel-file/node");
  const { readSheetNames } = require("read-excel-file/node");
  const names = await readSheetNames(buf);
  const sheets = [];
  for (const name of names.slice(0, 30)) {
    const rows = await readXlsxFile(buf, { sheet: name });
    sheets.push({ name, rows });
  }
  return sheets;
}

/* ─── Sarlavhalarni topish ───────────────────────────────────────────────── */

const NUM = "(\\d{1,3}|[IVXLC]{1,6})";
const SEC_WORDS = "bo'lim|bob|modul|qism|blok|bosqich|oy|daraja|level|раздел|модуль|глава|часть|блок|этап|месяц|section|module|chapter|unit|part|stage|month";
const LES_WORDS = "dars|mavzu|mashg'ulot|lesson|topic|class|урок|тема|занятие";
const sepTail = "\\s*(?:[-–—:.)]\\s*)?";
const SEC_RE = new RegExp(`^(?:${NUM}\\s*[-–.]?\\s*(?:${SEC_WORDS})\\b|(?:${SEC_WORDS})\\s*[№#]?\\s*${NUM}(?![\\w']))${sepTail}(.*)$`, "i");
const LES_RE = new RegExp(`^(?:${NUM}\\s*[-–.]?\\s*(?:${LES_WORDS})\\b|(?:${LES_WORDS})\\s*[№#]?\\s*${NUM}(?![\\w']))${sepTail}(.*)$`, "i");
const TOC_RE = /(\.{4,}|…{2,}|_{4,})\s*\d{1,4}\s*$/;

function headingOf(line) {
  const t = normApos(line.t);
  if (t.length > 140 || TOC_RE.test(t)) return null;
  let m = SEC_RE.exec(t);
  if (m) return { kind: "sec", num: m[1] || m[2], title: squash(m[3]) };
  m = LES_RE.exec(t);
  if (m) return { kind: "les", num: m[1] || m[2], title: squash(m[3]) };
  return null;
}

/** Sarlavha bo'sh bo'lsa ("2-dars" yolg'iz turgan) — keyingi qisqa qatorni nom qilib oladi. */
function titleFrom(lines, i, h, fallback) {
  if (h.title) return { title: h.title, skip: 0 };
  const nx = lines[i + 1];
  if (nx && nx.t.length <= 120 && !headingOf(nx)) return { title: nx.t, skip: 1 };
  return { title: fallback, skip: 0 };
}

const pagesOf = (body) => {
  const ps = body.map((l) => l.page).filter(Boolean);
  if (!ps.length) return "";
  const a = Math.min(...ps);
  const b = Math.max(...ps);
  return a === b ? String(a) : a + "-" + b;
};

function makeLesson(title, body, n) {
  const text = body.map((l) => (l.li ? "• " : "") + l.t).join("\n");
  return { n, title: clip(title || n + "-dars", 300), pages: pagesOf(body), text: clip(text, MAX_LESSON_CHARS) };
}

/**
 * Qatorlar + topilgan sarlavha nuqtalari → bo'limlar.
 * marks: [{i, kind:'sec'|'les', title, skip}]
 */
function buildFromMarks(lines, marks, docTitle) {
  const sections = [];
  let sec = null;
  let les = null;
  let intro = [];
  const ensureSec = () => {
    if (!sec) {
      sec = { title: docTitle || "Asosiy bo'lim", intro: [], lessons: [] };
      sections.push(sec);
    }
  };
  const flushLes = () => {
    if (les) {
      ensureSec();
      sec.lessons.push(makeLesson(les.title, les.body, sec.lessons.length + 1));
      les = null;
    }
  };
  let mi = 0;
  for (let i = 0; i < lines.length; i++) {
    const mk = marks[mi] && marks[mi].i === i ? marks[mi++] : null;
    if (mk) {
      if (mk.kind === "sec") {
        flushLes();
        sec = { title: clip(mk.title, 300), intro: [], lessons: [] };
        sections.push(sec);
      } else {
        flushLes();
        ensureSec();
        les = { title: mk.title, body: [] };
      }
      i += mk.skip || 0;
      continue;
    }
    if (les) les.body.push(lines[i]);
    else if (sec) sec.intro.push(lines[i]);
    else intro.push(lines[i]);
  }
  flushLes();
  // Faqat bo'limlar bo'lsa (darslar yo'q) — bo'lim matnini bitta dars qilamiz
  sections.forEach((s) => {
    if (!s.lessons.length && s.intro.length) s.lessons.push(makeLesson(s.title, s.intro, 1));
    s.introText = clip(
      s.lessons.length && s.intro.length ? s.intro.map((l) => l.t).join("\n") : "",
      4000,
    );
    delete s.intro;
  });
  // Mundarija takrorlarini olib tashlash: bo'sh darsli bo'limlar / bo'sh darslar
  const nonEmpty = sections
    .map((s) => ({ ...s, lessons: s.lessons.filter((l) => l.text.length >= 15) }))
    .filter((s) => s.lessons.length);
  const result = nonEmpty.length ? nonEmpty : sections.filter((s) => s.lessons.length);
  result.forEach((s) => s.lessons.forEach((l, i) => (l.n = i + 1)));
  return { sections: result, introText: clip(intro.map((l) => l.t).join("\n"), 4000) };
}

/** 1) Matndagi «1-bo'lim», «2-dars» kabi sarlavhalar va Word Heading'lari. */
function structureByHeadings(lines, docTitle) {
  const marks = [];
  lines.forEach((l, i) => {
    const h = headingOf(l);
    if (!h) return;
    const tf = titleFrom(lines, i, h, h.kind === "sec" ? h.num + "-bo'lim" : h.num + "-dars");
    marks.push({ i, kind: h.kind, title: tf.title, skip: tf.skip });
  });
  let lesCount = marks.filter((m) => m.kind === "les").length;
  let secCount = marks.filter((m) => m.kind === "sec").length;

  // Word: Heading 1/2 uslublari (matnda raqamli sarlavha bo'lmasa)
  if (lesCount < 2) {
    const levels = [...new Set(lines.filter((l) => l.h).map((l) => l.h))].sort();
    if (levels.length) {
      const [l1, l2] = levels;
      const hm = [];
      lines.forEach((l, i) => {
        if (!l.h) return;
        if (l2 && l.h === l1) hm.push({ i, kind: "sec", title: l.t });
        else if (l.h === (l2 || l1)) hm.push({ i, kind: "les", title: l.t });
      });
      if (hm.filter((m) => m.kind === "les").length >= 2) {
        marks.length = 0;
        marks.push(...hm);
        lesCount = hm.filter((m) => m.kind === "les").length;
        secCount = hm.filter((m) => m.kind === "sec").length;
      }
    }
  }
  if (lesCount < 2 && secCount < 2) return null;
  const r = buildFromMarks(lines, marks, docTitle);
  return r.sections.length ? r : null;
}

/** 3) Zaxira: PDF — sahifalar bo'yicha, matn — ~40 qatorlik bo'laklar. */
function structureByChunks(lines, docTitle, isPdf) {
  const lessons = [];
  if (isPdf) {
    const byPage = new Map();
    lines.forEach((l) => {
      if (!byPage.has(l.page)) byPage.set(l.page, []);
      byPage.get(l.page).push(l);
    });
    [...byPage.entries()].forEach(([p, body]) => lessons.push(makeLesson(p + "-sahifa", body, lessons.length + 1)));
  } else {
    for (let i = 0; i < lines.length; i += 40) {
      const body = lines.slice(i, i + 40);
      lessons.push(makeLesson(clip(body[0]?.t, 80) || lessons.length + 1 + "-qism", body, lessons.length + 1));
    }
  }
  return { sections: lessons.length ? [{ title: docTitle || "Hujjat", lessons, introText: "" }] : [], introText: "" };
}

/* ─── Excel ──────────────────────────────────────────────────────────────── */

const H_SEC = /bo'lim|bob|modul|qism|blok|bosqich|^oy$|раздел|модуль|глава|section|module|chapter|unit|block/i;
const H_NUM = /^(№|#|n|no|t\/r|т\/р|dars\s*(№|raqami?)?|урок\s*№?|lesson\s*(no|#)?)$/i;
const H_TITLE = /mavzu|nomi|sarlavha|тема|название|topic|title|subject/i;
const H_ANY = new RegExp([H_SEC.source, H_TITLE.source, "dars|урок|lesson|maqsad|reja|metod|misol|vazifa|izoh|soat|daqiqa|цель|план|пример|задание|goal|plan|example|task|content|mazmun"].join("|"), "i");

const cellStr = (v) => {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return squash(String(v));
};

function structureSheet(name, rows) {
  rows = rows.map((r) => (r || []).map(cellStr));
  let hi = -1;
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const hits = rows[i].filter((c) => c && c.length < 60 && H_ANY.test(normApos(c))).length;
    if (hits >= 2) {
      hi = i;
      break;
    }
  }
  if (hi < 0) return null;
  const head = rows[hi].map((h) => normApos(h));
  let cSec = head.findIndex((h) => h && H_SEC.test(h));
  let cTitle = head.findIndex((h, i) => h && i !== cSec && H_TITLE.test(h));
  let cNum = head.findIndex((h, i) => h && i !== cSec && i !== cTitle && H_NUM.test(h.trim()));
  if (cTitle < 0) cTitle = head.findIndex((h, i) => h && i !== cSec && i !== cNum && /dars|урок|lesson/i.test(h));
  if (cTitle < 0) return null;

  const sections = [];
  const byTitle = new Map();
  let curSec = null;
  for (let r = hi + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row.some(Boolean)) continue;
    if (cSec >= 0 && row[cSec]) curSec = row[cSec];
    const secTitle = cSec >= 0 ? curSec || name : name;
    const title = row[cTitle] || (cNum >= 0 && row[cNum] ? row[cNum] + "-dars" : "");
    const kv = [];
    row.forEach((v, i) => {
      if (!v || i === cSec || i === cTitle || i === cNum) return;
      kv.push({ k: clip(rows[hi][i] || "Izoh", 120), v: clip(v, 6000) });
    });
    if (!title && !kv.length) continue;
    if (!byTitle.has(secTitle)) {
      const s = { title: clip(secTitle, 300), lessons: [], introText: "" };
      byTitle.set(secTitle, s);
      sections.push(s);
    }
    const s = byTitle.get(secTitle);
    const n = s.lessons.length + 1;
    s.lessons.push({
      n,
      title: clip(title || n + "-dars", 300),
      pages: "",
      text: clip(kv.map((x) => x.k + ": " + x.v).join("\n"), MAX_LESSON_CHARS),
      kv,
    });
  }
  return sections.length ? sections : null;
}

/* ─── AI (faqat bo'lish nuqtalari) ───────────────────────────────────────── */

async function fetchT(url, opts, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function hasAiKey() {
  const ok = (k) => k && !String(k).includes("your_");
  return ok(process.env.LOVABLE_API_KEY) || ok(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) || ok(process.env.ANTHROPIC_API_KEY);
}

async function askText(prompt) {
  const errors = [];
  const lovable = process.env.LOVABLE_API_KEY;
  if (lovable && !lovable.includes("your_")) {
    try {
      const r = await fetchT(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "Lovable-API-Key": lovable },
          body: JSON.stringify({
            model: process.env.TEXTBOOK_AI_MODEL || process.env.LOVABLE_AI_MODEL || "google/gemini-3-flash-preview",
            messages: [{ role: "user", content: prompt }],
          }),
        },
        180000,
      );
      const d = await r.json().catch(() => ({}));
      const text = d?.choices?.[0]?.message?.content;
      if (r.ok && text) return text;
      errors.push("Lovable: " + (d?.error?.message || "HTTP " + r.status));
    } catch (e) {
      errors.push("Lovable: " + (e?.name === "AbortError" ? "javob bermadi" : e?.message));
    }
  }
  const gem = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (gem && !gem.includes("your_")) {
    try {
      const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
      const r = await fetchT(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(gem)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } }),
        },
        180000,
      );
      const d = await r.json().catch(() => ({}));
      const text = d?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("");
      if (r.ok && text) return text;
      errors.push("Gemini: " + (d?.error?.message || "HTTP " + r.status));
    } catch (e) {
      errors.push("Gemini: " + (e?.name === "AbortError" ? "javob bermadi" : e?.message));
    }
  }
  const ak = process.env.ANTHROPIC_API_KEY;
  if (ak && !ak.includes("your_")) {
    try {
      const r = await fetchT(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": ak, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5", max_tokens: 8000, messages: [{ role: "user", content: prompt }] }),
        },
        180000,
      );
      const d = await r.json().catch(() => ({}));
      const text = (d?.content || []).map((c) => c.text || "").join("");
      if (r.ok && text) return text;
      errors.push("Anthropic: " + (d?.error?.message || "HTTP " + r.status));
    } catch (e) {
      errors.push("Anthropic: " + (e?.name === "AbortError" ? "javob bermadi" : e?.message));
    }
  }
  throw new Error(errors.join(" · ") || "AI kaliti sozlanmagan");
}

function parseJson(text) {
  let s = String(text || "").trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  if (fence) s = fence[1].trim();
  try {
    return JSON.parse(s);
  } catch (e) {}
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a >= 0 && b > a) return JSON.parse(s.slice(a, b + 1));
  throw new Error("AI javobi tushunarsiz");
}

/** 2) AI'dan faqat bo'lim/dars boshlanadigan QATOR RAQAMLARINI so'raymiz. */
async function structureByAi(lines, docTitle) {
  let budget = 150000;
  const numbered = [];
  for (let i = 0; i < lines.length && budget > 0; i++) {
    const s = `${i}: ${clip(lines[i].t, 160)}`;
    numbered.push(s);
    budget -= s.length + 1;
  }
  const prompt =
    `Quyida o'quv markazining «${docTitle}» metodologiyasi qatorlari (har biri raqam bilan). ` +
    "Hujjatni BO'LIMLAR va har bo'lim ichidagi DARSLARGA ajrat: har biri qaysi qatordan boshlanishini ko'rsat. " +
    "Hujjatdagi tartib va nomlarni saqla, yangi narsa o'ylab topma. Mundarijani hisobga olma.\n" +
    'FAQAT JSON qaytar: {"sections":[{"title":"Bo\'lim nomi","line":12,"lessons":[{"title":"Dars nomi","line":15}]}]}\n\n' +
    numbered.join("\n");
  const r = parseJson(await askText(prompt));
  const marks = [];
  (Array.isArray(r?.sections) ? r.sections : []).forEach((s) => {
    const sl = parseInt(s?.line, 10);
    if (Number.isFinite(sl) && sl >= 0 && sl < lines.length) marks.push({ i: sl, kind: "sec", title: clip(s.title || lines[sl].t, 300) });
    (Array.isArray(s?.lessons) ? s.lessons : []).forEach((l) => {
      const ll = parseInt(l?.line, 10);
      if (Number.isFinite(ll) && ll >= 0 && ll < lines.length) marks.push({ i: ll, kind: "les", title: clip(l.title || lines[ll].t, 300) });
    });
  });
  // Bir qatorda bo'lim va dars bo'lsa — bo'lim oldin; takrorlar olib tashlanadi
  const seen = new Set();
  const uniq = marks
    .sort((a, b) => a.i - b.i || (a.kind === "sec" ? -1 : 1))
    .filter((m) => {
      const k = m.i + m.kind;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  // Bir qatorda ikkalasi bo'lsa — dars matni o'sha qatordan keyin boshlanadi
  const fixed = [];
  uniq.forEach((m) => {
    const prev = fixed[fixed.length - 1];
    if (prev && prev.i === m.i) fixed.push({ ...m, i: m.i, skip: 0, sameLine: true });
    else fixed.push({ ...m, skip: 0 });
  });
  if (fixed.filter((m) => m.kind === "les").length < 2) return null;
  // buildFromMarks bitta qatorga bitta belgi kutadi: «sameLine» dars — bo'lim bilan birga ochiladi
  const merged = [];
  fixed.forEach((m) => {
    if (m.sameLine) merged[merged.length - 1].alsoLesson = m.title;
    else merged.push(m);
  });
  const lines2 = [];
  const marks2 = [];
  lines.forEach((l, i) => {
    const m = merged.find((x) => x.i === i);
    if (m) {
      marks2.push({ i: lines2.length, kind: m.kind, title: m.title, skip: 0 });
      if (m.alsoLesson) {
        lines2.push(l);
        marks2.push({ i: lines2.length, kind: "les", title: m.alsoLesson, skip: 0 });
      }
    }
    lines2.push(l);
  });
  const r2 = buildFromMarks(lines2, marks2, docTitle);
  return r2.sections.length ? r2 : null;
}

/* ─── Asosiy tahlil ──────────────────────────────────────────────────────── */

export async function analyzeFile(buf, kind, docTitle) {
  let sections = null;
  let introText = "";
  let method = "";
  let pages = 0;

  if (kind === "xlsx" || kind === "csv") {
    const sheets = kind === "xlsx" ? await xlsxSheets(buf) : [{ name: docTitle, rows: csvRows(buf) }];
    const all = [];
    sheets.forEach((sh) => {
      const s = structureSheet(sh.name, sh.rows);
      if (s) all.push(...s);
    });
    if (all.length) {
      sections = all;
      method = "table";
    } else {
      // Jadval sarlavhasi topilmadi — qatorlarni matn sifatida o'qiymiz
      const lines = [];
      sheets.forEach((sh) => sh.rows.forEach((r) => {
        const t = (r || []).map(cellStr).filter(Boolean).join(" — ");
        if (t) lines.push({ t });
      }));
      return analyzeLines(lines, docTitle, false);
    }
    return { sections, introText, method, pages };
  }

  let res;
  if (kind === "pdf") res = await pdfLines(buf);
  else if (kind === "docx") res = await docxLines(buf);
  else res = textLines(buf);
  const out = await analyzeLines(res.lines, docTitle, kind === "pdf");
  out.pages = res.pages || 0;
  return out;
}

async function analyzeLines(lines, docTitle, isPdf) {
  if (!lines.length) throw new Error("Hujjatdan matn o'qib bo'lmadi (skaner qilingan rasm bo'lishi mumkin)");
  let r = structureByHeadings(lines, docTitle);
  let method = "headings";
  if (!r && hasAiKey()) {
    try {
      r = await structureByAi(lines, docTitle);
      method = "ai";
    } catch (e) {
      r = null;
    }
  }
  if (!r) {
    r = structureByChunks(lines, docTitle, isPdf);
    method = isPdf ? "pages" : "chunks";
  }
  return { sections: r.sections, introText: r.introText || "", method, pages: 0 };
}

/* ─── API ────────────────────────────────────────────────────────────────── */

export function initMethodology({ app, getDb, ROLES, requireAuth, requireRole, writeLimiter, audit, fail }) {
  const col = () => getDb().collection("methodologies");
  const staff = [requireAuth, requireRole(ROLES.ADMIN, ROLES.MENTOR)];
  const admin = [requireAuth, requireRole(ROLES.ADMIN)];
  const running = new Set();
  const safeId = (v) => (/^[A-Za-z0-9-]{8,64}$/.test(String(v || "")) ? String(v) : null);

  const meta = (d) => ({
    id: d._id,
    title: d.title,
    course: d.course || "",
    fileName: d.fileName,
    kind: d.kind,
    size: d.size,
    status: d.status,
    error: d.error || "",
    method: d.method || "",
    sectionsCount: (d.sections || []).length,
    lessonsCount: (d.sections || []).reduce((s, x) => s + (x.lessons || []).length, 0),
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  });

  function kindOf(fileName, buf) {
    const ext = String(fileName || "").toLowerCase().split(".").pop();
    if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
    const zip = buf[0] === 0x50 && buf[1] === 0x4b;
    if (zip && ext === "docx") return "docx";
    if (zip && ext === "xlsx") return "xlsx";
    if (ext === "csv") return "csv";
    if (ext === "txt" || ext === "md") return "txt";
    if (ext === "doc") throw new Error("Eski Word (.doc) fayli — uni Word'da «.docx» qilib saqlab, qayta yuklang");
    if (ext === "xls") throw new Error("Eski Excel (.xls) fayli — uni Excel'da «.xlsx» qilib saqlab, qayta yuklang");
    throw new Error("Bu turdagi fayl qo'llab-quvvatlanmaydi (PDF, Word .docx, Excel .xlsx, CSV yoki TXT yuklang)");
  }

  function limitSize(sections) {
    let total = 0;
    return sections.map((s) => ({
      ...s,
      lessons: s.lessons.map((l) => {
        const room = Math.max(0, MAX_TOTAL_CHARS - total);
        const text = l.text.slice(0, room);
        total += text.length + (l.kv ? JSON.stringify(l.kv).length : 0);
        return { ...l, text };
      }),
    }));
  }

  async function parseDoc(id) {
    if (running.has(id)) return;
    running.add(id);
    try {
      const d = await col().findOne({ _id: id });
      if (!d) return;
      await col().updateOne({ _id: id }, { $set: { status: "processing", error: "", updatedAt: new Date() } });
      const buf = Buffer.from(d.file.buffer);
      const r = await analyzeFile(buf, d.kind, d.title);
      if (!r.sections.length) throw new Error("Hujjatdan bo'lim va darslar topilmadi");
      await col().updateOne(
        { _id: id },
        { $set: { status: "ready", sections: limitSize(r.sections), introText: r.introText, method: r.method, pages: r.pages, error: "", updatedAt: new Date() } },
      );
    } catch (e) {
      await col()
        .updateOne({ _id: id }, { $set: { status: "error", error: clip(e?.message || e, 500), updatedAt: new Date() } })
        .catch(() => {});
    } finally {
      running.delete(id);
    }
  }

  app.get("/api/methodology", staff, async (req, res) => {
    try {
      const list = await col().find({}, { projection: { file: 0, "sections.lessons.text": 0, "sections.lessons.kv": 0 } }).sort({ createdAt: -1 }).toArray();
      res.json({ ok: true, items: list.map(meta) });
    } catch (e) {
      fail(res, e, req);
    }
  });

  app.get("/api/methodology/:id", staff, async (req, res) => {
    try {
      const id = safeId(req.params.id);
      if (!id) return res.status(400).json({ ok: false, error: "id yaroqsiz" });
      const d = await col().findOne({ _id: id }, { projection: { file: 0 } });
      if (!d) return res.status(404).json({ ok: false, error: "Metodologiya topilmadi" });
      res.json({ ok: true, item: { ...meta(d), pages: d.pages || 0, introText: d.introText || "", sections: d.sections || [] } });
    } catch (e) {
      fail(res, e, req);
    }
  });

  app.get("/api/methodology/:id/file", staff, async (req, res) => {
    try {
      const id = safeId(req.params.id);
      if (!id) return res.status(400).json({ ok: false, error: "id yaroqsiz" });
      const d = await col().findOne({ _id: id }, { projection: { file: 1, fileName: 1, kind: 1 } });
      if (!d || !d.file) return res.status(404).json({ ok: false, error: "Fayl topilmadi" });
      const k = KINDS[d.kind] || KINDS.txt;
      res.setHeader("Content-Type", k.mime);
      res.setHeader(
        "Content-Disposition",
        (d.kind === "pdf" ? "inline" : "attachment") + "; filename*=UTF-8''" + encodeURIComponent(d.fileName || "metodologiya"),
      );
      res.setHeader("Cache-Control", "private, max-age=600");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.send(Buffer.from(d.file.buffer));
    } catch (e) {
      fail(res, e, req);
    }
  });

  app.post("/api/methodology", admin, writeLimiter, async (req, res) => {
    try {
      const fileName = clip(req.body?.fileName, 200).trim() || "metodologiya";
      const title = clip(req.body?.title, 200).trim() || fileName.replace(/\.[a-z0-9]+$/i, "");
      const course = clip(req.body?.course, 200).trim();
      let data = String(req.body?.data || "").replace(/^data:[^,]*,/, "");
      if (!data || !/^[A-Za-z0-9+/=\s]+$/.test(data.slice(0, 2000))) return res.status(400).json({ ok: false, error: "Fayl kerak" });
      const buf = Buffer.from(data, "base64");
      if (!buf.length) return res.status(400).json({ ok: false, error: "Fayl bo'sh" });
      if (buf.length > MAX_FILE_BYTES) return res.status(413).json({ ok: false, error: "Fayl 12 MB dan katta" });
      let kind;
      try {
        kind = kindOf(fileName, buf);
      } catch (e) {
        return res.status(415).json({ ok: false, error: e.message });
      }
      const id = randomUUID();
      const now = new Date();
      await col().insertOne({
        _id: id,
        title,
        course,
        fileName,
        kind,
        size: buf.length,
        file: new Binary(buf),
        status: "processing",
        sections: [],
        createdAt: now,
        updatedAt: now,
        by: req.user?.login || req.user?.username || "",
      });
      await audit("methodology.upload", { req, actor: req.user, target: { id }, meta: { size: buf.length, kind } }).catch(() => {});
      res.json({ ok: true, id });
      parseDoc(id);
    } catch (e) {
      fail(res, e, req);
    }
  });

  app.post("/api/methodology/:id/reparse", admin, writeLimiter, async (req, res) => {
    try {
      const id = safeId(req.params.id);
      if (!id) return res.status(400).json({ ok: false, error: "id yaroqsiz" });
      if (running.has(id)) return res.json({ ok: true, already: true });
      const d = await col().findOne({ _id: id }, { projection: { _id: 1 } });
      if (!d) return res.status(404).json({ ok: false, error: "Metodologiya topilmadi" });
      await col().updateOne({ _id: id }, { $set: { status: "processing", error: "", updatedAt: new Date() } });
      res.json({ ok: true });
      parseDoc(id);
    } catch (e) {
      fail(res, e, req);
    }
  });

  // Admin nom / kurs / bo'lim va dars nomlarini tuzatishi mumkin
  app.put("/api/methodology/:id", admin, writeLimiter, async (req, res) => {
    try {
      const id = safeId(req.params.id);
      if (!id) return res.status(400).json({ ok: false, error: "id yaroqsiz" });
      const set = {};
      if (req.body?.title != null) set.title = clip(req.body.title, 200).trim() || "Metodologiya";
      if (req.body?.course != null) set.course = clip(req.body.course, 200).trim();
      if (Array.isArray(req.body?.titles)) {
        const d = await col().findOne({ _id: id }, { projection: { sections: 1 } });
        if (!d) return res.status(404).json({ ok: false, error: "Metodologiya topilmadi" });
        const secs = d.sections || [];
        req.body.titles.slice(0, 200).forEach((t, si) => {
          if (!secs[si] || !t) return;
          if (t.title != null) secs[si].title = clip(t.title, 300).trim() || secs[si].title;
          (Array.isArray(t.lessons) ? t.lessons : []).slice(0, 500).forEach((lt, li) => {
            if (secs[si].lessons?.[li] && lt != null) secs[si].lessons[li].title = clip(lt, 300).trim() || secs[si].lessons[li].title;
          });
        });
        set.sections = secs;
      }
      if (!Object.keys(set).length) return res.status(400).json({ ok: false, error: "O'zgarish yo'q" });
      const r = await col().updateOne({ _id: id }, { $set: { ...set, updatedAt: new Date() } });
      if (!r.matchedCount) return res.status(404).json({ ok: false, error: "Metodologiya topilmadi" });
      res.json({ ok: true });
    } catch (e) {
      fail(res, e, req);
    }
  });

  app.delete("/api/methodology/:id", admin, writeLimiter, async (req, res) => {
    try {
      const id = safeId(req.params.id);
      if (!id) return res.status(400).json({ ok: false, error: "id yaroqsiz" });
      await audit("methodology.delete", { req, actor: req.user, target: { id } }).catch(() => {});
      await col().deleteOne({ _id: id });
      res.json({ ok: true });
    } catch (e) {
      fail(res, e, req);
    }
  });

  // Server qayta ishga tushsa — chala qolgan tahlillarni davom ettiramiz
  setTimeout(async () => {
    try {
      const left = await col().find({ status: "processing" }, { projection: { _id: 1 } }).toArray();
      left.forEach((d) => parseDoc(d._id));
    } catch (e) {}
  }, 15000);
}
