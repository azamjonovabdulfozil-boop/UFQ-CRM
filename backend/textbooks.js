/**
 * textbooks.js — 📚 Darsliklar.
 *
 * Admin kurs uchun darslik (PDF) yuklaydi. AI uni darslarga ajratadi:
 * har bir dars uchun mavzu, maqsadlar, dars rejasi, o'qitish metodi,
 * materiallar, uyga vazifa va darslikdagi sahifalar. Mentor davomat
 * oynasidagi «📘 Dars metodi» tugmasi orqali bugungi darsni ko'radi.
 *
 * Saqlash: `textbooks` kolleksiyasi (PDF — Binary, 15 MB gacha).
 * Ruxsat: ko'rish — admin va mentor; yuklash/o'zgartirish — faqat admin.
 */
import { randomUUID } from "node:crypto";
import { Binary } from "mongodb";

const MAX_PDF_BYTES = 15 * 1024 * 1024;
const BATCH = 10; // bir AI so'rovida nechta darsning batafsil rejasi

export function initTextbooks({ app, getDb, ROLES, requireAuth, requireRole, writeLimiter, audit, fail }) {
  const col = () => getDb().collection("textbooks");
  const staff = [requireAuth, requireRole(ROLES.ADMIN, ROLES.MENTOR)];
  const admin = [requireAuth, requireRole(ROLES.ADMIN)];
  const running = new Set(); // hozir tahlil qilinayotgan darsliklar

  const safeId = (v) => (/^[A-Za-z0-9-]{8,64}$/.test(String(v || "")) ? String(v) : null);
  const clip = (v, n) => String(v == null ? "" : v).slice(0, n);

  const meta = (d) => ({
    id: d._id,
    course: d.course,
    title: d.title,
    fileName: d.fileName,
    size: d.size,
    status: d.status,
    error: d.error || "",
    progress: d.progress || null,
    lessonsCount: (d.lessons || []).length,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  });

  /** Darsni tozalaydi — AI yoki admin nima yuborsa ham shakli bir xil bo'lsin. */
  function cleanLesson(l, i) {
    const arr = (v, n) => (Array.isArray(v) ? v : v ? [v] : []).map((x) => clip(typeof x === "object" ? JSON.stringify(x) : x, 600)).filter(Boolean).slice(0, n);
    const plan = (Array.isArray(l?.plan) ? l.plan : [])
      .map((p) => (typeof p === "string" ? { step: clip(p, 600), min: 0 } : { step: clip(p?.step || p?.name || "", 600), min: Math.max(0, Math.min(240, parseInt(p?.min ?? p?.minutes, 10) || 0)) }))
      .filter((p) => p.step)
      .slice(0, 20);
    return {
      n: i + 1,
      topic: clip(l?.topic || l?.title || "", 300) || i + 1 + "-dars",
      goals: arr(l?.goals, 10),
      plan,
      method: clip(l?.method, 4000),
      materials: clip(l?.materials, 2000),
      homework: clip(l?.homework, 2000),
      pages: clip(l?.pages, 40),
      notes: clip(l?.notes, 3000),
      detailed: !!l?.detailed,
    };
  }

  /* ─── AI ──────────────────────────────────────────────────────────────── */

  async function fetchT(url, opts, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, { ...opts, signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
  }

  /** PDF + savol → AI matni. Lovable → Gemini → Anthropic (qaysi kalit bo'lsa). */
  async function askPdf(b64, fileName, prompt) {
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
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "text", text: prompt },
                    { type: "file", file: { filename: fileName || "darslik.pdf", file_data: "data:application/pdf;base64," + b64 } },
                  ],
                },
              ],
            }),
          },
          240000,
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
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }, { inline_data: { mime_type: "application/pdf", data: b64 } }] }],
              generationConfig: { responseMimeType: "application/json" },
            }),
          },
          240000,
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
            body: JSON.stringify({
              model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
              max_tokens: 16000,
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
                    { type: "text", text: prompt },
                  ],
                },
              ],
            }),
          },
          240000,
        );
        const d = await r.json().catch(() => ({}));
        const text = (d?.content || []).map((c) => c.text || "").join("");
        if (r.ok && text) return text;
        errors.push("Anthropic: " + (d?.error?.message || "HTTP " + r.status));
      } catch (e) {
        errors.push("Anthropic: " + (e?.name === "AbortError" ? "javob bermadi" : e?.message));
      }
    }
    throw new Error(errors.length ? errors.join(" · ") : "Serverda AI kaliti sozlanmagan (LOVABLE_API_KEY yoki GEMINI_API_KEY)");
  }

  /** AI javobidan JSON ni ajratib oladi (```json ... ``` bo'lsa ham). */
  function parseJson(text) {
    let s = String(text || "").trim();
    const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
    if (fence) s = fence[1].trim();
    try {
      return JSON.parse(s);
    } catch (e) {}
    const a = s.indexOf("{");
    const b = s.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(s.slice(a, b + 1));
      } catch (e) {}
    }
    const a2 = s.indexOf("[");
    const b2 = s.lastIndexOf("]");
    if (a2 >= 0 && b2 > a2) return { lessons: JSON.parse(s.slice(a2, b2 + 1)) };
    throw new Error("AI javobi tushunarsiz bo'ldi");
  }

  const STYLE =
    "Javobni o'zbek tilida (lotin yozuvida) yoz. Mentor darsga tayyorlanishi uchun aniq, amaliy va tushunarli bo'lsin. " +
    "FAQAT JSON qaytar, boshqa hech qanday matn yozma.";

  /** 1-bosqich: darslar ro'yxati (mavzu + sahifalar). */
  function outlinePrompt(course) {
    return (
      `Bu PDF — o'quv markazidagi «${course}» kursi uchun darslik. Uni ketma-ket DARSLARGA ajrat (har biri ~80–90 daqiqalik bitta dars).\n` +
      "Agar darslikda darslar/mavzular raqamlangan bo'lsa — o'sha tartib va sonni saqla. Bo'lmasa, mazmunni mantiqiy darslarga bo'l.\n" +
      "Kirish so'zi, mundarija, javoblar bo'limi kabi qismlarni alohida dars qilma.\n" +
      'Shakl: {"lessons":[{"topic":"Mavzu nomi","pages":"12-15"}]}\n' +
      STYLE
    );
  }

  /** 2-bosqich: tanlangan darslar uchun batafsil metodik reja. */
  function detailPrompt(course, lessons, from) {
    const list = lessons.map((l, i) => `${from + i + 1}. ${l.topic}${l.pages ? " (sahifa " + l.pages + ")" : ""}`).join("\n");
    return (
      `Bu PDF — «${course}» kursi darsligi. Quyidagi darslar uchun mentorga BATAFSIL dars metodini tuz (darslik mazmuniga tayan):\n${list}\n\n` +
      "Har bir dars uchun:\n" +
      "• goals — 2–4 ta aniq maqsad (talaba dars oxirida nimani biladi/qila oladi)\n" +
      "• plan — dars bosqichlari va daqiqalari (jami ~80–90 daqiqa): takrorlash, yangi mavzu, amaliyot, mustahkamlash va h.k.\n" +
      "• method — qanday o'tish kerak: tushuntirish usuli, misollar, savollar, guruhda ishlash, e'tibor beriladigan qiyin joylar\n" +
      "• materials — kerakli materiallar (darslik sahifalari, doska, kompyuter, tarqatma va h.k.)\n" +
      "• homework — uyga vazifa\n" +
      "• notes — mentor uchun qo'shimcha maslahat (ixtiyoriy)\n" +
      'Shakl: {"lessons":[{"topic":"","pages":"","goals":[""],"plan":[{"step":"","min":10}],"method":"","materials":"","homework":"","notes":""}]} — ro\'yxatdagi tartibda, aynan shu sonda.\n' +
      STYLE
    );
  }

  async function setProgress(id, patch) {
    await col().updateOne({ _id: id }, { $set: { ...patch, updatedAt: new Date() } });
  }

  async function parseBook(id) {
    if (running.has(id)) return;
    running.add(id);
    try {
      const doc = await col().findOne({ _id: id });
      if (!doc) return;
      const b64 = Buffer.from(doc.pdf.buffer).toString("base64");
      await setProgress(id, { status: "processing", error: "", progress: { stage: "outline", done: 0, total: 0 } });

      const outline = parseJson(await askPdf(b64, doc.fileName, outlinePrompt(doc.course)));
      let lessons = (Array.isArray(outline?.lessons) ? outline.lessons : []).map(cleanLesson).slice(0, 400);
      if (!lessons.length) throw new Error("AI darslikdan darslarni ajrata olmadi");
      await setProgress(id, { lessons, progress: { stage: "details", done: 0, total: lessons.length } });

      // Batafsil reja — bo'laklab (javob uzun bo'lib kesilib qolmasin)
      let done = 0;
      const errs = [];
      for (let from = 0; from < lessons.length; from += BATCH) {
        const part = lessons.slice(from, from + BATCH);
        let got = null;
        for (let attempt = 0; attempt < 2 && !got; attempt++) {
          try {
            const r = parseJson(await askPdf(b64, doc.fileName, detailPrompt(doc.course, part, from)));
            if (Array.isArray(r?.lessons) && r.lessons.length) got = r.lessons;
          } catch (e) {
            if (attempt) errs.push(e.message);
          }
        }
        if (got)
          part.forEach((l, i) => {
            const d = got[i];
            if (!d) return;
            lessons[from + i] = cleanLesson({ ...d, topic: l.topic || d.topic, pages: l.pages || d.pages, detailed: true }, from + i);
          });
        done = Math.min(lessons.length, from + BATCH);
        await setProgress(id, { lessons, progress: { stage: "details", done, total: lessons.length } });
      }
      const missing = lessons.filter((l) => !l.detailed).length;
      await setProgress(id, {
        status: "ready",
        progress: null,
        error: missing ? `${missing} ta dars uchun batafsil reja tuzilmadi${errs[0] ? " (" + clip(errs[0], 200) + ")" : ""} — «Qayta tahlil» ni bosing` : "",
      });
    } catch (e) {
      await setProgress(id, { status: "error", progress: null, error: clip(e?.message || e, 500) }).catch(() => {});
    } finally {
      running.delete(id);
    }
  }

  /* ─── API ─────────────────────────────────────────────────────────────── */

  app.get("/api/textbooks", staff, async (req, res) => {
    try {
      const list = await col().find({}, { projection: { pdf: 0 } }).sort({ createdAt: -1 }).toArray();
      res.json({ ok: true, items: list.map(meta) });
    } catch (e) {
      fail(res, e, req);
    }
  });

  app.get("/api/textbooks/:id", staff, async (req, res) => {
    try {
      const id = safeId(req.params.id);
      if (!id) return res.status(400).json({ ok: false, error: "id yaroqsiz" });
      const d = await col().findOne({ _id: id }, { projection: { pdf: 0 } });
      if (!d) return res.status(404).json({ ok: false, error: "Darslik topilmadi" });
      res.json({ ok: true, item: { ...meta(d), lessons: d.lessons || [] } });
    } catch (e) {
      fail(res, e, req);
    }
  });

  app.get("/api/textbooks/:id/pdf", staff, async (req, res) => {
    try {
      const id = safeId(req.params.id);
      if (!id) return res.status(400).json({ ok: false, error: "id yaroqsiz" });
      const d = await col().findOne({ _id: id }, { projection: { pdf: 1, fileName: 1 } });
      if (!d || !d.pdf) return res.status(404).json({ ok: false, error: "Fayl topilmadi" });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "inline; filename*=UTF-8''" + encodeURIComponent(d.fileName || "darslik.pdf"));
      res.setHeader("Cache-Control", "private, max-age=600");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.send(Buffer.from(d.pdf.buffer));
    } catch (e) {
      fail(res, e, req);
    }
  });

  app.post("/api/textbooks", admin, writeLimiter, async (req, res) => {
    try {
      const course = clip(req.body?.course, 200).trim();
      const fileName = clip(req.body?.fileName, 200).trim() || "darslik.pdf";
      const title = clip(req.body?.title, 200).trim() || fileName.replace(/\.pdf$/i, "");
      let data = String(req.body?.data || "");
      data = data.replace(/^data:[^,]*,/, "");
      if (!course) return res.status(400).json({ ok: false, error: "Kursni tanlang" });
      if (!data || !/^[A-Za-z0-9+/=\s]+$/.test(data.slice(0, 2000))) return res.status(400).json({ ok: false, error: "PDF fayl kerak" });
      const buf = Buffer.from(data, "base64");
      if (buf.length > MAX_PDF_BYTES) return res.status(413).json({ ok: false, error: "PDF 15 MB dan katta" });
      if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") return res.status(415).json({ ok: false, error: "Bu PDF fayl emas" });
      const id = randomUUID();
      const now = new Date();
      await col().insertOne({
        _id: id,
        course,
        title,
        fileName,
        size: buf.length,
        pdf: new Binary(buf),
        status: "processing",
        progress: { stage: "outline", done: 0, total: 0 },
        lessons: [],
        createdAt: now,
        updatedAt: now,
        by: req.user?.login || req.user?.username || "",
      });
      await audit("textbook.upload", { req, actor: req.user, target: { id, course }, meta: { size: buf.length } }).catch(() => {});
      res.json({ ok: true, id });
      parseBook(id); // fonda: AI darslarga ajratadi
    } catch (e) {
      fail(res, e, req);
    }
  });

  app.post("/api/textbooks/:id/reparse", admin, writeLimiter, async (req, res) => {
    try {
      const id = safeId(req.params.id);
      if (!id) return res.status(400).json({ ok: false, error: "id yaroqsiz" });
      if (running.has(id)) return res.json({ ok: true, already: true });
      const d = await col().findOne({ _id: id }, { projection: { _id: 1 } });
      if (!d) return res.status(404).json({ ok: false, error: "Darslik topilmadi" });
      await setProgress(id, { status: "processing", error: "", progress: { stage: "outline", done: 0, total: 0 } });
      res.json({ ok: true });
      parseBook(id);
    } catch (e) {
      fail(res, e, req);
    }
  });

  // Admin darsni qo'lda tuzatishi (yoki o'zi yozishi) mumkin
  app.put("/api/textbooks/:id", admin, writeLimiter, async (req, res) => {
    try {
      const id = safeId(req.params.id);
      if (!id) return res.status(400).json({ ok: false, error: "id yaroqsiz" });
      const set = {};
      if (req.body?.course != null) set.course = clip(req.body.course, 200).trim();
      if (req.body?.title != null) set.title = clip(req.body.title, 200).trim();
      if (Array.isArray(req.body?.lessons)) set.lessons = req.body.lessons.slice(0, 400).map((l, i) => cleanLesson({ ...l, detailed: true }, i));
      if (!Object.keys(set).length) return res.status(400).json({ ok: false, error: "O'zgarish yo'q" });
      const r = await col().updateOne({ _id: id }, { $set: { ...set, updatedAt: new Date() } });
      if (!r.matchedCount) return res.status(404).json({ ok: false, error: "Darslik topilmadi" });
      res.json({ ok: true });
    } catch (e) {
      fail(res, e, req);
    }
  });

  app.delete("/api/textbooks/:id", admin, writeLimiter, async (req, res) => {
    try {
      const id = safeId(req.params.id);
      if (!id) return res.status(400).json({ ok: false, error: "id yaroqsiz" });
      await audit("textbook.delete", { req, actor: req.user, target: { id } }).catch(() => {});
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
      left.forEach((d) => parseBook(d._id));
    } catch (e) {}
  }, 15000);

  return { parseBook };
}
