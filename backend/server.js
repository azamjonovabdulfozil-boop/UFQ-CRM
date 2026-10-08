/**
 * EduManage CRM — Backend (MongoDB versiyasi)
 * Barcha ma'lumotlar MongoDB'da saqlanadi
 *
 * Ishga tushirish: cd backend && npm install && npm start
 */

import express from "express";
import { fileURLToPath } from "url";
import { dirname, join, resolve, sep } from "path";
import { readFileSync, existsSync, statSync } from "fs";
import { MongoClient, ObjectId } from "mongodb";
import {
  initDavomatBot,
  sendAttendanceReport,
  discoverChats,
  botStatus,
  startTelegramPolling,
  sendGroupMessage,
} from "./davomatBot.js";
// Qarzdorga xabar ikki kanal orqali ketadi: ota-onalar Telegram guruhiga
// (yuqoridagi bot) yoki telefon raqamiga SMS (quyidagi modul).
import { sendSms, smsStatus, smsReady, normalizePhone } from "./smsSender.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── .env FAYLNI XAVFSIZLIK QATLAMIDAN OLDIN o'qiymiz ────────────────────────
// security/config.js modul yuklanishi bilanoq AUTH_SECRET ni tekshiradi, shuning
// uchun .env undan OLDIN process.env ga tushishi shart.
loadDotEnv();

const {
  installSecurity,
  initSecurityStore,
  bodyErrorHandler,
  errorHandler,
  CONFIG: SEC,
  ROLES,
  requireAuth,
  optionalAuth,
  requireRole,
  requireCsrf,
  blockUntilPasswordChanged,
  audit,
  writeLimiter,
  expensiveLimiter,
  publicLookupLimiter,
  safeFetch,
  syncPortalAccounts,
  canWriteKvKey,
  filterKvForRole,
  applyCrmWritePolicy,
  checkCoinWrite,
  checkPurchaseWrite,
  safeKvKey,
  safeBlobId,
  safeObjectIdHex,
  escapeHtml,
  byteLength,
  safeLog,
} = await import("./security/index.js");

const requireAdmin = [requireAuth, requireRole(ROLES.ADMIN)];
const requireStaff = [requireAuth, requireRole(ROLES.ADMIN, ROLES.MENTOR)];

// ─── .env o'qish ──────────────────────────────────────────────────────────────
function loadDotEnv() {
  const envPath = join(__dirname, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    // Qiymatni qo'shtirnoqdan tozalaymiz — "abc" va 'abc' ham to'g'ri o'qilsin
    const v = t.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (k && !(k in process.env)) process.env[k] = v;
  }
}

const app = express();

// ⚠️ Xavfsizlik middleware'lari ENG BOSHIDA — sarlavhalar, CORS oq ro'yxati,
// cookie o'qish. Marshrutlar ulardan keyin ro'yxatdan o'tadi.
const security = installSecurity(app);
// 🔧 BUG FIX: video/PDF fayllar base64 shaklida ~33% kattaroq bo'ladi,
// shuning uchun limitni oshirdik (video-file-upload va test-pdf-upload
// funksiyalari uchun kerak). Katta video fayllar uchun baribir YouTube
// havolasidan foydalanish tavsiya etiladi.
app.use(express.json({ limit: SEC.jsonLimit }));
// JSON buzuq yoki juda katta bo'lsa — HTML sahifa emas, tushunarli JSON xato
app.use(bodyErrorHandler);
// Tozalash (NoSQL injection), so'rov limiti, CSRF Origin tekshiruvi,
// va /api/auth/* marshrutlari
security.afterBodyParser(app);

// ─── Static fayl cache headers (tezlik uchun) ────────────────────────────────
// ⚠️ BUG FIX: core/*.js va portal CSS fayllari nomi o'zgarmaydi (hash yo'q),
// shuning uchun ularni uzoq keshlash mumkin emas — kod yangilansa ham brauzer
// bir kun davomida ESKI nusxani ishlatib turardi. Endi ular har safar
// tekshiriladi (no-cache), qolgan (hash nomli) fayllar esa keshlanadi.
app.use((req, res, next) => {
  const ext = (req.path.split(".").pop() || "").toLowerCase();
  const noCache =
    req.path.includes("/core/") || ext === "css" || req.path.endsWith(".html");
  if (noCache) {
    res.setHeader("Cache-Control", "no-cache, must-revalidate");
  } else if (
    ["js", "css", "ico", "png", "jpg", "webp", "woff2", "woff", "svg"].includes(
      ext,
    )
  ) {
    res.setHeader("Cache-Control", "public, max-age=86400");
  }
  next();
});

// ─── CORS ─────────────────────────────────────────────────────────────────────
// ⚠️ XAVFSIZLIK TUZATISHI: ilgari `Access-Control-Allow-Origin: *` edi — ya'ni
// INTERNETDAGI HAR QANDAY sayt bu API ga so'rov yuborib, ma'lumotni o'qiy va
// o'zgartira olardi. Endi security/cors.js dagi oq ro'yxat ishlaydi
// (ALLOWED_ORIGINS muhit o'zgaruvchisi) va u `credentials: true` ni qo'llab
// quvvatlaydi — sessiya cookie'lari uchun shart.

// ─── REALTIME (SSE) — o'zgarishlarni DARHOL yetkazish ─────────────────────────
// Har qanday yozuv (kv / crm_data / coins / users) sodir bo'lganda, ochiq
// turgan BARCHA brauzerlarga shu zahoti xabar yuboriladi. Shu tufayli mentor
// talabaga coin qo'yganda yoki admin do'konga mahsulot qo'shganda, talaba
// sahifani YANGILAMASDAN (F5 siz) o'zgarishni darhol ko'radi.
//
// Nega SSE (Server-Sent Events)?  — bir tomonlama (server → brauzer) oqim
// uchun WebSocket'dan sodda, oddiy HTTP ustida ishlaydi, proxy/Render bilan
// muammosiz va brauzer uzilishda o'zi qayta ulanadi.
const sseClients = new Set();
let revision = Date.now();

function sseSend(res, payload) {
  try {
    res.write("data: " + JSON.stringify(payload) + "\n\n");
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * O'zgarish haqida barcha ulangan mijozlarga xabar beradi.
 * @param {string[]} keys   O'zgargan localStorage/KV kalitlari ("*" = hammasi)
 * @param {string|null} origin  O'zgarishni kim qildi (client id) — o'sha
 *                              brauzer o'z yozuvini qayta yuklamasligi uchun.
 */
function broadcast(keys, origin) {
  revision++;
  // Ma'lumot o'zgardi — keshdagi nusxa endi eskirgan
  invalidateKvCache();
  const payload = {
    rev: revision,
    keys: Array.isArray(keys) ? keys : [keys],
    origin: origin || null,
    ts: Date.now(),
  };
  for (const res of [...sseClients]) {
    if (!sseSend(res, payload)) sseClients.delete(res);
  }
}

// So'rovni yuborgan brauzerning identifikatori (echo'ni to'sish uchun)
const originOf = (req) => req.get("x-client-id") || null;

// SSE oqimi ham himoyalangan. EventSource sarlavha qo'sha olmaydi, shuning
// uchun token `?access_token=` orqali keladi — u qisqa umrli (15 daqiqa) va
// javob keshlanmaydi, shu sabab manzilda ketishi maqbul.
app.get("/api/events", requireAuth, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // Nginx/Render proxy oqimni buferlamasligi uchun
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  // Uzilib qolsa brauzer 3 soniyada qayta ulanadi
  res.write("retry: 3000\n\n");
  sseSend(res, { rev: revision, keys: [], hello: true, ts: Date.now() });
  sseClients.add(res);

  // Ba'zi proxy'lar jim turgan ulanishni yopadi — 25s da bir "ping"
  const ping = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch (e) {
      clearInterval(ping);
      sseClients.delete(res);
    }
  }, 25000);

  req.on("close", () => {
    clearInterval(ping);
    sseClients.delete(res);
    try {
      res.end();
    } catch (e) {}
  });
});

// Yengil holat tekshiruvi — SSE ishlamagan brauzerlar uchun zaxira (fallback)
app.get("/api/rev", requireAuth, (_req, res) => {
  res.json({ ok: true, rev: revision, clients: sseClients.size });
});

// ─── MongoDB Ulanish ──────────────────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/CRM";
let db = null;
let mongoClient = null;

async function connectMongo() {
  try {
    // ⚙️ TEZLIK: Atlas boshqa mintaqada bo'lsa har bir so'rov ~200 ms. Shuning
    // uchun ulanish imkon qadar tejamli sozlanadi:
    //   • pul (pool) — parallel so'rovlar navbatda turmaydi
    //   • zlib siqish — katta hujjatlar (CRM ma'lumoti) tarmoqdan tez o'tadi
    //   • retry — bir martalik uzilishda so'rov o'zi qaytadan bajariladi
    mongoClient = new MongoClient(MONGODB_URI, {
      maxPoolSize: 20,
      minPoolSize: 3,          // ulanish "issiq" turadi — qo'l qo'yishga vaqt ketmaydi
      maxIdleTimeMS: 300000,
      compressors: ["zlib"],
      zlibCompressionLevel: 4,
      retryReads: true,
      retryWrites: true,
      serverSelectionTimeoutMS: 10000,
      // Har so'rovda serverni qayta tekshirib o'tirmaslik uchun
      heartbeatFrequencyMS: 30000,
    });
    await mongoClient.connect();
    db = mongoClient.db();
    console.log("✅ MongoDB ulandi:", db.databaseName);

    // Indekslar yaratish
    await db.collection("kv").createIndex({ key: 1 }, { unique: true });
    await db.collection("users").createIndex({ login: 1 }, { unique: true });
    await db.collection("blobs").createIndex({ id: 1 }, { unique: true });

    return true;
  } catch (err) {
    console.error("❌ MongoDB ulanmadi:", err.message);
    return false;
  }
}

// ─── DB Helper ────────────────────────────────────────────────────────────────
function getDb() {
  if (!db) throw new Error("MongoDB ulanmagan");
  return db;
}

// Davomat boti xabar id larini `telegram_reports` kolleksiyasida saqlaydi —
// shu orqali bir dars uchun yangi xabar tashlamay, borini tahrirlaydi.
initDavomatBot({ getDb });


// ─── Xato javobi ──────────────────────────────────────────────────────────────
// ⚠️ Ilgari har bir `catch` bloki `e.message` ni to'g'ridan-to'g'ri qaytarardi.
// MongoDB xatolari ichida kolleksiya nomlari, so'rov shakli, ba'zan ulanish
// satri ham bo'ladi — bu hujumchi uchun tayyor xarita. Endi foydalanuvchi
// umumiy xabar va so'rov identifikatorini oladi; batafsili faqat serverda.
function fail(res, e, req) {
  const id = req?.id || "-";
  console.error(`❌ [${id}]`, e?.stack || e);
  if (res.headersSent) return;
  return res.status(500).json({
    ok: false,
    code: "internal-error",
    error: SEC.isProd ? "Ichki xatolik yuz berdi" : String(e?.message || e),
    requestId: id,
  });
}

// ─── Users API ────────────────────────────────────────────────────────────────
// ⚠️ ENG JIDDIY TUZATISH: bu endpoint ILGARI hech qanday tekshiruvsiz BARCHA
// foydalanuvchilarni PAROLI BILAN qaytarardi. Ya'ni saytni ochgan istalgan
// odam `/api/users` ga kirib admin parolini o'qib olardi.
// Endi: (1) faqat admin/mentor ko'ra oladi, (2) parol maydoni javobga
// UMUMAN tushmaydi (kirish serverda — /api/auth/login orqali tekshiriladi).
const stripSecrets = ({ _id, _role, pass, password, passwordHash, ...u }) => u;

app.get("/api/users", requireStaff, async (req, res) => {
  try {
    const allUsers = await readAllUsers();
    const mentors = allUsers.filter((u) => u._role === "mentor").map(stripSecrets);
    const students = allUsers.filter((u) => u._role === "student").map(stripSecrets);
    res.json({ ok: true, mentors, students });
  } catch (e) {
    fail(res, e, req);
  }
});

app.post("/api/users/save", requireAdmin, writeLimiter, async (req, res) => {
  try {
    const { mentors, students } = req.body || {};
    if (!Array.isArray(mentors) && !Array.isArray(students))
      return res
        .status(400)
        .json({ ok: false, error: "mentors yoki students massivi kerak" });

    const col = getDb().collection("users");

    // ⚠️ Parol `users` kolleksiyasiga ENDI YOZILMAYDI. U faqat `accounts` da,
    // scrypt xeshi ko'rinishida yashaydi (quyidagi syncPortalAccounts).
    const profileOnly = (u, role) => {
      const { pass, password, passwordHash, ...rest } = u || {};
      return { ...rest, _role: role };
    };

    if (Array.isArray(mentors)) {
      await col.deleteMany({ _role: "mentor" });
      if (mentors.length > 0)
        await col.insertMany(mentors.map((u) => profileOnly(u, "mentor")));
    }
    if (Array.isArray(students)) {
      await col.deleteMany({ _role: "student" });
      if (students.length > 0)
        await col.insertMany(students.map((u) => profileOnly(u, "student")));
    }
    // Loginlar `accounts` omboriga ham yoziladi — kirish tekshiruvi FAQAT
    // o'sha yerdan bo'ladi. Parol scrypt bilan xeshlanadi.
    const synced = [];
    if (Array.isArray(mentors))
      synced.push(...(await syncPortalAccounts(mentors, ROLES.MENTOR, req.user, req)));
    if (Array.isArray(students))
      synced.push(...(await syncPortalAccounts(students, ROLES.STUDENT, req.user, req)));

    broadcast(["__users__"], originOf(req));
    res.json({ ok: true, accounts: synced });
  } catch (e) {
    fail(res, e, req);
  }
});

// ─── CRM Ma'lumotlari API ─────────────────────────────────────────────────────
app.get("/api/data", requireAuth, async (req, res) => {
  try {
    const doc = await readCrmData();
    if (doc) {
      const { _id, _type, _migratedAt, ...data } = doc;
      res.json({ ok: true, data });
    } else {
      res.json({ ok: false, data: null });
    }
  } catch (e) {
    fail(res, e, req);
  }
});

// ⚠️ MUHIM BUG FIX (ma'lumot yo'qolishi) ────────────────────────────────────
// Ilgari bu endpoint kelgan HAR QANDAY obyektni so'zsiz yozib qo'yardi. Agar
// brauzer boshlanishida `/api/kv` (yoki `/api/data`) so'rovi bajarilmasa —
// masalan Render'dagi backend uyquda bo'lib javob bermasa, internet uzilsa
// yoki localStorage to'lib qolsa — frontend'da `D` BO'SH holatda qolardi.
// Foydalanuvchi shu holatda biror narsani o'zgartirsa, `saveData()` bo'sh
// ro'yxatlarni serverga yuborib, BUTUN BAZANI o'chirib tashlardi.
//
// Endi ikkita himoya bor:
//   1) "Bo'shatib yuborish" (bazada yozuv bor edi — kelgan payload bo'sh)
//      RAD ETILADI. Chindan tozalash kerak bo'lsa `force: true` yuboriladi
//      (Sozlamalar → "Barcha ma'lumotlarni o'chirish" tugmasi shunday qiladi).
//   2) Har bir yozuvdan OLDIN eski nusxa `crm_data_backups` ga saqlanadi —
//      shu orqali /api/data/backups va /api/data/restore bilan tiklash mumkin.
const DATA_LIST_KEYS = ["courses", "groups", "mentors", "students", "finance", "tests"];
const DATA_MAP_KEYS = ["attendance", "grades", "gradingCriteria", "simpleGrades", "testResults"];

/** Ma'lumot "og'irligi" — nechta haqiqiy yozuv bor. 0 = butunlay bo'sh. */
function dataWeight(d) {
  if (!d || typeof d !== "object") return 0;
  let n = 0;
  for (const k of DATA_LIST_KEYS) if (Array.isArray(d[k])) n += d[k].length;
  for (const k of DATA_MAP_KEYS)
    if (d[k] && typeof d[k] === "object") n += Object.keys(d[k]).length;
  return n;
}

const BACKUP_COL = "crm_data_backups";
const BACKUP_KEEP = 40;
const BACKUP_MIN_GAP_MS = 10 * 60 * 1000; // har 10 daqiqada bir nusxa yetarli

async function snapshotCrmData(prev, reason) {
  if (!prev || dataWeight(prev) === 0) return;
  try {
    const col = getDb().collection(BACKUP_COL);
    if (reason !== "shrink") {
      const last = await col.findOne({}, { sort: { createdAt: -1 } });
      if (last && Date.now() - new Date(last.createdAt).getTime() < BACKUP_MIN_GAP_MS)
        return;
    }
    const { _id, ...body } = prev;
    await col.insertOne({
      createdAt: new Date(),
      reason: reason || "auto",
      weight: dataWeight(prev),
      data: body,
    });
    // Faqat oxirgi BACKUP_KEEP ta nusxa qoladi
    const old = await col
      .find({}, { projection: { _id: 1 } })
      .sort({ createdAt: -1 })
      .skip(BACKUP_KEEP)
      .toArray();
    if (old.length)
      await col.deleteMany({ _id: { $in: old.map((d) => d._id) } });
  } catch (e) {
    console.warn("⚠️ crm_data zaxira nusxasi saqlanmadi:", e.message);
  }
}

app.post("/api/data", requireAuth, blockUntilPasswordChanged, writeLimiter, async (req, res) => {
  try {
    const payload = req.body;
    if (!payload || typeof payload !== "object")
      return res.status(400).json({ ok: false, error: "data obyekti kerak" });

    // "Hammasini o'chirish" — faqat admin
    const force =
      (payload.force === true || req.query.force === "1") && req.user.role === ROLES.ADMIN;
    const { force: _f, ...raw } = payload;

    const prev = await getDb().collection("crm_data").findOne({ _type: "main" });

    // ⚠️ MAYDON DARAJASIDAGI RUXSAT: talaba faqat o'z natijalari bo'limini,
    // mentor moliya/sertifikatdan tashqarini o'zgartira oladi. Ruxsat
    // etilmagan bo'limlar SERVERDAGI nusxadan tiklanadi — ya'ni bitta
    // so'rov bilan butun bazani qayta yozib bo'lmaydi.
    const { data: clean, rejected } = applyCrmWritePolicy(req.user.role, raw, prev || {});
    if (rejected.length)
      await audit("data.write.partial_denied", {
        req,
        actor: req.user,
        meta: { sections: rejected.slice(0, 20) },
        severity: "warn",
      });
    const prevW = dataWeight(prev);
    const nextW = dataWeight(clean);

    if (!force && prevW > 0 && nextW === 0) {
      console.warn(
        `🛑 /api/data: bo'sh ma'lumot bilan yozishga urinish rad etildi ` +
          `(bazada ${prevW} ta yozuv bor). origin=${originOf(req) || "?"}`,
      );
      return res.status(409).json({
        ok: false,
        code: "empty-overwrite-blocked",
        error:
          "Bo'sh ma'lumot bazadagi mavjud yozuvlarni o'chirib yuborardi — " +
          "yozuv rad etildi. Sahifani yangilab, qaytadan urinib ko'ring.",
        serverWeight: prevW,
      });
    }

    // Yozuvdan oldin zaxira. Yozuvlar soni keskin kamaygan bo'lsa — albatta.
    await snapshotCrmData(prev, nextW < prevW ? "shrink" : "auto");

    await getDb()
      .collection("crm_data")
      .updateOne(
        { _type: "main" },
        { $set: { ...clean, _type: "main", _updatedAt: new Date() } },
        { upsert: true },
      );
    // CRM ma'lumoti ayni shu kalit ostida KV'ga ham yoziladi — mijozlar
    // o'zgarishni shu nom orqali taniydi.
    broadcast(["edumanage_crm_v8"], originOf(req));
    res.json({ ok: true, rejectedSections: rejected });
  } catch (e) {
    fail(res, e, req);
  }
});

// ─── Zaxira nusxalar: ro'yxat va tiklash ──────────────────────────────────────
// Zaxira ma'lumot butun bazaning nusxasi — faqat administrator.
app.get("/api/data/backups", requireAdmin, async (req, res) => {
  try {
    const docs = await getDb()
      .collection(BACKUP_COL)
      .find({}, { projection: { data: 0 } })
      .sort({ createdAt: -1 })
      .limit(BACKUP_KEEP)
      .toArray();
    res.json({
      ok: true,
      backups: docs.map((d) => ({
        id: String(d._id),
        createdAt: d.createdAt,
        reason: d.reason,
        weight: d.weight,
      })),
    });
  } catch (e) {
    fail(res, e, req);
  }
});

app.post("/api/data/restore", requireAdmin, writeLimiter, async (req, res) => {
  try {
    const id = safeObjectIdHex(req.body?.id);
    if (!id) return res.status(400).json({ ok: false, error: "id kerak (24 belgili hex)" });
    await audit("data.restore", { req, actor: req.user, target: { backupId: id }, severity: "critical" });
    const doc = await getDb()
      .collection(BACKUP_COL)
      .findOne({ _id: new ObjectId(id) });
    if (!doc) return res.status(404).json({ ok: false, error: "nusxa topilmadi" });

    const prev = await getDb().collection("crm_data").findOne({ _type: "main" });
    await snapshotCrmData(prev, "pre-restore");

    const { _type, _updatedAt, ...body } = doc.data || {};
    await getDb()
      .collection("crm_data")
      .updateOne(
        { _type: "main" },
        { $set: { ...body, _type: "main", _updatedAt: new Date() } },
        { upsert: true },
      );
    broadcast(["edumanage_crm_v8"], originOf(req));
    res.json({ ok: true, weight: dataWeight(body) });
  } catch (e) {
    fail(res, e, req);
  }
});

// ─── Coin Tizimi API ──────────────────────────────────────────────────────────
app.get("/api/coins", requireAuth, async (req, res) => {
  try {
    // Birinchi: KV dan o'qiymiz (frontend shim shu yerga yozadi)
    const COIN_KEY = "edu_mentor_coins_v1";
    const SHOP_KEY = "edu_shop_v1";
    const PURCHASE_KEY = "edu_purchases_v1";

    const wanted = new Set([COIN_KEY, SHOP_KEY, PURCHASE_KEY]);
    const kvMap = {};
    for (const doc of await readAllKv()) if (wanted.has(doc.key)) kvMap[doc.key] = doc.value;

    let coins = {},
      shop = [],
      purchases = [];

    if (kvMap[COIN_KEY]) {
      try {
        coins = JSON.parse(kvMap[COIN_KEY]);
      } catch (e) {}
    }
    if (kvMap[SHOP_KEY]) {
      try {
        shop = JSON.parse(kvMap[SHOP_KEY]);
      } catch (e) {}
    }
    if (kvMap[PURCHASE_KEY]) {
      try {
        purchases = JSON.parse(kvMap[PURCHASE_KEY]);
      } catch (e) {}
    }

    // KV bo'sh bo'lsa fallback: dedicated coins collection
    if (!Object.keys(coins).length) {
      const doc = await readCoins();
      if (doc) {
        const { _id, _type, _migratedAt, _updatedAt, ...rest } = doc;
        if (rest.coins) coins = rest.coins;
        if (Array.isArray(rest.shop) && rest.shop.length) shop = rest.shop;
        if (Array.isArray(rest.purchases) && rest.purchases.length)
          purchases = rest.purchases;
      }
    }

    res.json({ ok: true, coins, shop, purchases });
  } catch (e) {
    fail(res, e, req);
  }
});

app.post("/api/coins", requireAuth, blockUntilPasswordChanged, writeLimiter, async (req, res) => {
  try {
    const { coins, shop, purchases } = req.body || {};
    const prev = (await getDb().collection("coins").findOne({ _type: "main" })) || {};

    // ⚠️ Talaba o'z balansini OSHIRA olmaydi, mentor esa faqat o'z hisobidan
    // yecha oladi. Ilgari bu endpoint ochiq edi va istalgan odam o'ziga
    // cheksiz coin yozib qo'yishi mumkin edi.
    if (coins && typeof coins === "object") {
      const chk = checkCoinWrite(req.user, coins, prev.coins || {});
      if (!chk.ok) {
        await audit("coins.write.denied", { req, actor: req.user, meta: { reason: chk.error }, severity: "warn" });
        return res.status(403).json({ ok: false, code: "forbidden", error: chk.error });
      }
    }
    // Do'kon mahsulotlari — faqat xodimlar
    if (Array.isArray(shop) && req.user.role === ROLES.STUDENT)
      return res.status(403).json({ ok: false, code: "forbidden", error: "Do'konni o'zgartirish uchun ruxsat yo'q" });

    if (Array.isArray(purchases)) {
      const chk = checkPurchaseWrite(req.user, purchases, prev.purchases || []);
      if (!chk.ok) return res.status(403).json({ ok: false, code: "forbidden", error: chk.error });
    }

    const update = { _type: "main", _updatedAt: new Date() };
    if (coins && typeof coins === "object") update.coins = coins;
    if (Array.isArray(shop)) update.shop = shop;
    if (Array.isArray(purchases)) update.purchases = purchases;

    await getDb()
      .collection("coins")
      .updateOne({ _type: "main" }, { $set: update }, { upsert: true });
    broadcast(
      ["edu_mentor_coins_v1", "edu_shop_v1", "edu_purchases_v1"],
      originOf(req),
    );
    res.json({ ok: true });
  } catch (e) {
    fail(res, e, req);
  }
});

// Mentorga coin ajratish — pul ekvivalenti, faqat administrator.
app.post("/api/coins/send-mentor", requireAdmin, writeLimiter, async (req, res) => {
  try {
    const { mentorName, amount } = req.body || {};
    const amt = Number(amount);
    if (typeof mentorName !== "string" || !mentorName.trim() || !Number.isFinite(amt) || amt <= 0 || amt > 1e7)
      return res
        .status(400)
        .json({ ok: false, error: "mentorName va musbat amount kerak" });
    await audit("coins.send_mentor", { req, actor: req.user, target: { mentorName, amount: amt }, severity: "warn" });

    const doc = (await getDb()
      .collection("coins")
      .findOne({ _type: "main" })) || { coins: {} };
    const updatedCoins = { ...(doc.coins || {}), ["m_" + mentorName]: amt };

    await getDb()
      .collection("coins")
      .updateOne(
        { _type: "main" },
        { $set: { coins: updatedCoins, _updatedAt: new Date() } },
        { upsert: true },
      );
    broadcast(["edu_mentor_coins_v1"], originOf(req));
    res.json({ ok: true, coins: updatedCoins });
  } catch (e) {
    fail(res, e, req);
  }
});

// ─── Katta fayllar (Blob) API — video fayllar, test PDF'lari ────────────────
// 🔧 BUG FIX: bu fayllar avval "edumanage_videos_v1" massivi ichida, ya'ni
// localStorage/kv orqali saqlanardi. localStorage odatda ~5-10MB bilan
// cheklangan va bu limit boshqa barcha CRM ma'lumotlari bilan baham
// ko'rilardi — shu sabab video fayl yuklash "sukut bo'yicha" ishlamay
// qolardi. Endi har bir katta fayl alohida MongoDB hujjatida saqlanadi.
// ─── Rasm proxy ───────────────────────────────────────────────────────────────
// Tashqi saytdagi rasmni brauzer canvas orqali o'qiy olmaydi (CORS / "tainted
// canvas") — Coin Shop mahsulot rasmining orqa fonini olib tashlash uchun esa
// aynan piksellarni o'qish kerak. Shu sabab rasm shu server orqali olinadi.
// ⚠️ SSRF TUZATISHI: bu endpoint foydalanuvchi bergan manzilni SERVER nomidan
// ochadi. Himoyasiz holda u bilan ichki tarmoqni skanerlash mumkin edi
// (http://169.254.169.254/ — bulut metama'lumotlari, http://localhost:27017 —
// MongoDB). Endi security/ssrf.js ichki IP larni, DNS orqali yashiringan ichki
// manzillarni va zanjirli redirectlarni bloklaydi; hajm/vaqt ham cheklangan.
app.get("/api/img-proxy", requireAuth, expensiveLimiter, async (req, res) => {
  const url = String(req.query.url || "");
  const out = await safeFetch(url, { maxBytes: 12 * 1024 * 1024, timeoutMs: 10000 });
  if (!out.ok) {
    if (out.status === 400)
      await audit("proxy.blocked", { req, actor: req.user, meta: { url: safeLog(url, 200), reason: out.error }, severity: "warn" });
    return res.status(out.status).json({ ok: false, error: out.error });
  }
  res.setHeader("Content-Type", out.mime);
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.send(out.buffer);
});

app.get("/api/blob/:id", requireAuth, async (req, res) => {
  try {
    const id = safeBlobId(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "id yaroqsiz" });
    const doc = await getDb()
      .collection("blobs")
      .findOne({ id });
    if (!doc) return res.status(404).json({ ok: false, error: "topilmadi" });
    res.json({ ok: true, data: doc.data, mime: doc.mime, name: doc.name });
  } catch (e) {
    fail(res, e, req);
  }
});

// Fayl yuklash — faqat xodimlar (talaba katta fayl yuklab bazani to'ldira olmaydi).
const ALLOWED_BLOB_MIME =
  /^(image\/(png|jpe?g|gif|webp|svg\+xml|avif)|video\/(mp4|webm|ogg|quicktime)|audio\/(mpeg|ogg|wav|webm)|application\/pdf)$/i;

app.post("/api/blob", requireStaff, blockUntilPasswordChanged, writeLimiter, async (req, res) => {
  try {
    const { data, mime, name } = req.body || {};
    const id = safeBlobId(req.body?.id);
    if (!id || typeof data !== "string" || !data)
      return res.status(400).json({ ok: false, error: "id va data (matn) kerak" });
    if (byteLength(data) > SEC.maxBlobBytes)
      return res.status(413).json({ ok: false, code: "payload-too-large", error: "Fayl juda katta" });
    if (mime && !ALLOWED_BLOB_MIME.test(String(mime)))
      return res.status(415).json({ ok: false, error: "Bu fayl turi ruxsat etilmagan: " + safeLog(mime, 60) });
    // data: URI ichidagi turni ham tekshiramiz — sarlavhada yolg'on bo'lishi mumkin
    const inline = /^data:([^;,]+)[;,]/.exec(data);
    if (inline && !ALLOWED_BLOB_MIME.test(inline[1]))
      return res.status(415).json({ ok: false, error: "Fayl mazmuni ruxsat etilmagan turda" });

    await getDb()
      .collection("blobs")
      .updateOne(
        { id },
        {
          $set: {
            id,
            data,
            mime: mime || "",
            name: name || "",
            _updatedAt: new Date(),
          },
        },
        { upsert: true },
      );
    broadcast(["__blob__"], originOf(req));
    res.json({ ok: true });
  } catch (e) {
    fail(res, e, req);
  }
});

app.post("/api/blob/delete", requireStaff, writeLimiter, async (req, res) => {
  try {
    const id = safeBlobId(req.body?.id);
    if (!id) return res.status(400).json({ ok: false, error: "id kerak" });
    await audit("blob.delete", { req, actor: req.user, target: { id } });
    await getDb().collection("blobs").deleteOne({ id });
    res.json({ ok: true });
  } catch (e) {
    fail(res, e, req);
  }
});

// ─── Universal KV Store API ───────────────────────────────────────────────────
//
// ⚙️ TEZLIK: bu eng ko'p so'raladigan endpoint (realtime qatlami ham, sahifa
// yuklanishi ham shu yerga keladi) va u butun CRM omborini qaytaradi — bir
// necha megabayt. Har safar Atlas'dan qayta o'qish ~1.5 soniya edi.
//
// Yechim: natijani xotirada keshlaymiz. Kesh HAR QANDAY yozuvda (broadcast)
// darhol bekor qilinadi, ustiga qisqa TTL ham bor — ya'ni ma'lumot eskirib
// qolmaydi. Kesh faqat shu jarayonda, foydalanuvchiga bog'liq emas: rol
// bo'yicha filtr keshdan KEYIN qo'llanadi.
const READ_CACHE = new Map(); // nom → { at:number, value:any }
const READ_CACHE_TTL = 5000;

/** Har qanday yozuvdan keyin (broadcast) chaqiriladi. */
function invalidateKvCache() {
  READ_CACHE.clear();
}

/**
 * Bazadan o'qishni keshlab beradi.
 * Kesh HAR QANDAY yozuvda tozalanadi, ustiga 5 soniyalik TTL ham bor —
 * ya'ni eskirgan ma'lumot qaytishi mumkin emas.
 */
async function cachedRead(name, loader) {
  const hit = READ_CACHE.get(name);
  if (hit && Date.now() - hit.at < READ_CACHE_TTL) return hit.value;
  const value = await loader();
  READ_CACHE.set(name, { at: Date.now(), value });
  return value;
}

const readAllKv = () => cachedRead("kv", () => getDb().collection("kv").find({}).toArray());
const readCrmData = () =>
  cachedRead("crm_data", () => getDb().collection("crm_data").findOne({ _type: "main" }));
const readAllUsers = () => cachedRead("users", () => getDb().collection("users").find({}).toArray());
const readCoins = () =>
  cachedRead("coins", () => getDb().collection("coins").findOne({ _type: "main" }));

app.get("/api/kv", requireAuth, async (req, res) => {
  try {
    // ?keys=a,b — faqat kerakli kalitlar. Realtime yangilanishda butun
    // do'konni qayta yuklamaslik uchun (tarmoqni tejaydi).
    const want = String(req.query.keys || "")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    const all = await readAllKv();
    const wanted = want.length && !want.includes("*") ? new Set(want) : null;
    const data = {};
    for (const doc of all) if (!wanted || wanted.has(doc.key)) data[doc.key] = doc.value;
    // Hisob ma'lumotlari va sozlamalar talaba/mentor javobiga tushmaydi
    res.json({ ok: true, data: filterKvForRole(req.user.role, data), rev: revision });
  } catch (e) {
    fail(res, e, req);
  }
});

// CRM ning asosiy ma'lumoti localStorage orqali ham shu kalitga ko'chiriladi.
// /api/data dagi bilan bir xil himoya shu yerda ham kerak — aks holda bo'sh
// nusxa KV orqali kirib kelib, keyingi yuklashda hammani bo'shatib qo'yardi.
const CRM_KV_KEY = "edumanage_crm_v8";

function kvCrmWipe(key, value) {
  if (key !== CRM_KV_KEY) return false;
  try {
    return dataWeight(JSON.parse(String(value))) === 0;
  } catch (e) {
    return false;
  }
}

async function kvCrmHasData() {
  try {
    const doc = await getDb().collection("kv").findOne({ key: CRM_KV_KEY });
    return doc ? dataWeight(JSON.parse(String(doc.value))) > 0 : false;
  } catch (e) {
    return false;
  }
}

app.post("/api/kv", requireAuth, blockUntilPasswordChanged, writeLimiter, async (req, res) => {
  try {
    const value = req.body?.value;
    const key = safeKvKey(req.body?.key);
    if (!key)
      return res.status(400).json({ ok: false, error: "key kerak (harf/raqam/._:- , 200 belgigacha)" });

    // Kalit darajasidagi ruxsat — kim qaysi kalitni yoza oladi
    const perm = canWriteKvKey(req.user.role, key);
    if (!perm.ok) {
      await audit("kv.write.denied", { req, actor: req.user, meta: { key }, severity: "warn" });
      return res.status(403).json({ ok: false, code: "forbidden", error: perm.error });
    }
    if (value != null && byteLength(value) > SEC.maxKvValueBytes)
      return res.status(413).json({ ok: false, code: "payload-too-large", error: "Qiymat juda katta" });

    // CRM obyekti KV orqali ham kelishi mumkin — maydon siyosati shu yerda ham
    let outValue = value;
    if (key === "edumanage_crm_v8" && req.user.role !== ROLES.ADMIN && value != null) {
      try {
        const cur = await getDb().collection("kv").findOne({ key });
        const currentObj = cur ? JSON.parse(String(cur.value)) : {};
        const { data: filtered, rejected } = applyCrmWritePolicy(
          req.user.role,
          JSON.parse(String(value)),
          currentObj,
        );
        outValue = JSON.stringify(filtered);
        if (rejected.length)
          await audit("kv.crm.partial_denied", {
            req, actor: req.user, meta: { sections: rejected.slice(0, 20) }, severity: "warn",
          });
      } catch (e) {
        return res.status(400).json({ ok: false, error: "CRM ma'lumoti JSON formatida emas" });
      }
    }

    if (kvCrmWipe(key, value) && (await kvCrmHasData())) {
      console.warn("🛑 /api/kv: bo'sh CRM ma'lumoti rad etildi");
      return res.status(409).json({
        ok: false,
        code: "empty-overwrite-blocked",
        error: "Bo'sh CRM ma'lumoti mavjud yozuvlarni o'chirib yuborardi",
      });
    }

    if (outValue === null || outValue === undefined) {
      await getDb().collection("kv").deleteOne({ key });
    } else {
      await getDb()
        .collection("kv")
        .updateOne(
          { key },
          { $set: { key, value: String(outValue), _updatedAt: new Date() } },
          { upsert: true },
        );
    }
    broadcast([key], originOf(req));
    res.json({ ok: true });
  } catch (e) {
    fail(res, e, req);
  }
});

app.post("/api/kv/bulk", requireAuth, blockUntilPasswordChanged, writeLimiter, async (req, res) => {
  try {
    const { pairs } = req.body || {};
    if (!Array.isArray(pairs))
      return res.status(400).json({ ok: false, error: "pairs massivi kerak" });
    if (pairs.length > 500)
      return res.status(400).json({ ok: false, error: "Bir so'rovda 500 tadan ko'p kalit bo'lmasin" });

    // Har bir kalit alohida tekshiriladi — bittasi ham ruxsatsiz bo'lsa,
    // BUTUN so'rov rad etiladi (qisman yozuv ma'lumotni buzishi mumkin).
    for (const p of pairs) {
      const k = safeKvKey(p?.key);
      if (!k) return res.status(400).json({ ok: false, error: "Kalit yaroqsiz: " + safeLog(p?.key, 60) });
      const perm = canWriteKvKey(req.user.role, k);
      if (!perm.ok) {
        await audit("kv.bulk.denied", { req, actor: req.user, meta: { key: k }, severity: "warn" });
        return res.status(403).json({ ok: false, code: "forbidden", error: perm.error });
      }
      if (p.value != null && byteLength(p.value) > SEC.maxKvValueBytes)
        return res.status(413).json({ ok: false, code: "payload-too-large", error: "Qiymat juda katta: " + k });
      if (k === "edumanage_crm_v8" && req.user.role !== ROLES.ADMIN) {
        try {
          const cur = await getDb().collection("kv").findOne({ key: k });
          const { data: filtered } = applyCrmWritePolicy(
            req.user.role,
            JSON.parse(String(p.value)),
            cur ? JSON.parse(String(cur.value)) : {},
          );
          p.value = JSON.stringify(filtered);
        } catch (e) {
          return res.status(400).json({ ok: false, error: "CRM ma'lumoti JSON formatida emas" });
        }
      }
    }

    if (await kvCrmHasData()) {
      const bad = pairs.find((p) => p && kvCrmWipe(p.key, p.value));
      if (bad) {
        console.warn("🛑 /api/kv/bulk: bo'sh CRM ma'lumoti rad etildi");
        return res.status(409).json({
          ok: false,
          code: "empty-overwrite-blocked",
          error: "Bo'sh CRM ma'lumoti mavjud yozuvlarni o'chirib yuborardi",
        });
      }
    }

    const ops = pairs.map(({ key, value }) => ({
      updateOne: {
        filter: { key },
        update: { $set: { key, value: String(value), _updatedAt: new Date() } },
        upsert: true,
      },
    }));
    if (ops.length > 0) await getDb().collection("kv").bulkWrite(ops);
    broadcast(pairs.map((p) => p.key).filter(Boolean), originOf(req));
    res.json({ ok: true });
  } catch (e) {
    fail(res, e, req);
  }
});

app.post("/api/kv/clear", requireAdmin, requireCsrf, async (req, res) => {
  try {
    // ⚠️ Bu amal BUTUN KV omborini (brending, foydalanuvchilar, coinlar,
    // chatlar…) o'chiradi. Tasodifiy chaqiruvdan himoya: `force: true` shart.
    if (!(req.body && req.body.force === true) && req.query.force !== "1") {
      return res.status(409).json({
        ok: false,
        code: "force-required",
        error: "Butun KV omborini tozalash uchun force: true kerak",
      });
    }
    await audit("kv.clear", { req, actor: req.user, severity: "critical" });
    await getDb().collection("kv").deleteMany({});
    broadcast(["*"], originOf(req));
    res.json({ ok: true });
  } catch (e) {
    fail(res, e, req);
  }
});

// ─── Health Check ─────────────────────────────────────────────────────────────
// ⚠️ Ilgari bu ochiq endpoint bazaning nomi, hajmi, qaysi AI/bot sozlanganini
// oshkor qilardi — bu razvedka uchun tayyor ma'lumot. Endi ochiq javob
// minimal, batafsil holat esa faqat administratorga.
app.get("/api/health", async (_req, res) => {
  let mongoOk = false;
  try {
    await db.admin().ping();
    mongoOk = true;
  } catch (e) {}
  res.json({ ok: mongoOk, service: "EduManage CRM", status: mongoOk ? "up" : "degraded" });
});

app.get("/api/health/full", requireAdmin, async (_req, res) => {
  const aiOk =
    !!process.env.ANTHROPIC_API_KEY &&
    !process.env.ANTHROPIC_API_KEY.includes("your_");
  let mongoOk = false;
  let mongoInfo = {};
  try {
    await db.admin().ping();
    const stats = await db.stats();
    mongoOk = true;
    mongoInfo = { collections: stats.collections, dataSize: stats.dataSize };
  } catch (e) {}

  res.json({
    ok: true,
    service: "EduManage CRM",
    version: "3.0.0-mongodb",
    davomatBot: await botStatus(),
    sms: await smsStatus(),
    anthropic: aiOk ? "✅ Anthropic" : "➡️ Pollinations (bepul)",
    mongodb: mongoOk ? `✅ ulangan (${db.databaseName})` : "❌ ulanmagan",
    mongoInfo,
    security: {
      prod: SEC.isProd,
      legacyPasswords: SEC.allowLegacyPasswords,
      crossSite: SEC.crossSite,
      accessTtlSec: SEC.accessTtlSec,
    },
  });
});

// ─── MongoDB Stats ────────────────────────────────────────────────────────────
app.get("/api/db/stats", requireAdmin, async (req, res) => {
  try {
    const cols = ["crm_data", "users", "coins", "kv"];
    const stats = {};
    for (const col of cols) {
      stats[col] = await getDb().collection(col).countDocuments();
    }
    res.json({ ok: true, stats });
  } catch (e) {
    fail(res, e, req);
  }
});

// ─── Davomat Telegram boti ────────────────────────────────────────────────────
// Bot CRM ning O'ZIDA (backend/davomatBot.js). Hisobot shu yerdagi ma'lumotdan
// quriladi — tashqi servis ham, guruh/talaba nusxasi ham yo'q.

// Mentor/admin bitta katakni belgilaganda chaqiriladi. Bot ichida debounce bor:
// ketma-ket belgilashlar Telegramda BITTA xabarga birlashadi va o'sha xabar
// tahrirlanadi.
app.post("/api/telegram/attendance", requireStaff, expensiveLimiter, async (req, res) => {
  const { groupId, year, month, lesson } = req.body || {};
  if (
    !Number.isInteger(groupId) ||
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(lesson)
  )
    return res.status(400).json({
      ok: false,
      error: "Majburiy (butun son): groupId, year, month, lesson",
    });

  try {
    // Ma'lumot debounce tugagach o'qiladi (davomatBot.js dagi izohga qarang) —
    // shuning uchun tayyor obyekt emas, o'qish funksiyasi uzatiladi.
    const loadD = () =>
      getDb().collection("crm_data").findOne({ _type: "main" });

    const out = await sendAttendanceReport(loadD, groupId, year, month, lesson);
    // Chat ID kiritilmagan guruh — integratsiya o'sha guruh uchun o'chiq,
    // bu xato emas.
    if (out.skipped) return res.json({ ok: true, skipped: out.skipped });
    if (!out.ok) return res.status(502).json(out);
    return res.json(out);
  } catch (e) {
    return fail(res, e, req);
  }
});

// Botni guruhga qo'shgach chat ID ni qo'lda qidirmaslik uchun.
app.get("/api/telegram/chats", requireAdmin, async (_req, res) => {
  res.json(await discoverChats());
});

// Bot holati (token ishlaydimi, qaysi bot).
app.get("/api/telegram/status", requireStaff, async (_req, res) => {
  res.json({ ok: true, status: await botStatus() });
});

// ─── Qarzdorga xabar: 2 ta kanal ─────────────────────────────────────────────
//
// 1) 📨 OTA-ONALAR GURUHI — xabar guruhning Telegram chatiga tushadi (davomat
//    hisoboti ketadigan o'sha chat). Bepul, hech kim hech narsa bosmaydi.
// 2) 📱 SMS — talabaning (yoki ota-onasining) telefon raqamiga SMS ketadi.
//    Talabadan hech qanday harakat talab qilinmaydi.
//
// Nega talabaning shaxsiy Telegramiga yuborilmaydi? Chunki Telegram BOTI
// foydalanuvchiga birinchi bo'lib yoza olmaydi — u avval botni o'zi ishga
// tushirishi shart. Bu Telegramning cheklovi, kodniki emas.
//
// Har ikkala endpoint bir xil so'rov shaklini oladi:
//     { messages: [{ studentId, text }, ...] }   — matn har talabaga alohida
//     { studentIds: [...], text }                — hammaga bir xil matn
// va har talaba uchun ALOHIDA natija qaytaradi ("yuborildi" deb aldab
// qo'yilmaydi).

/**
 * So'rov tanasini { studentId | groupId, text } ro'yxatiga keltiradi.
 *
 * `groupId` — ota-onalar guruhiga BITTA umumiy xabar yuborish uchun: bir
 * guruhda 5 ta qarzdor bo'lsa, guruh chatiga 5 ta bir xilga o'xshash xabar
 * emas, ro'yxat ko'rinishidagi bitta xabar tushadi.
 */
function parseNotifyBody(body) {
  const raw = Array.isArray(body?.messages)
    ? body.messages
    : Array.isArray(body?.studentIds)
      ? body.studentIds.map((studentId) => ({ studentId, text: body.text }))
      : null;
  if (!raw || !raw.length)
    return { error: "messages yoki studentIds ro'yxati kerak" };

  const items = [];
  for (const m of raw.slice(0, 200)) {
    const byGroup = m && m.groupId != null;
    const id = Number(byGroup ? m.groupId : m?.studentId);
    const text = String(m?.text || "").trim();
    if (!Number.isFinite(id))
      return { error: byGroup ? "groupId noto'g'ri" : "studentId noto'g'ri" };
    if (!text) return { error: "Xabar matni bo'sh" };
    if (text.length > 4000)
      return { error: "Xabar 4000 belgidan uzun bo'lmasin" };
    items.push(byGroup ? { groupId: id, text } : { studentId: id, text });
  }
  return { items };
}

const notifySummary = (results) => ({
  ok: true,
  sent: results.filter((r) => r.ok).length,
  failed: results.filter((r) => !r.ok).length,
  results,
});

/** 📨 Ota-onalar Telegram guruhiga. */
app.post("/api/notify/parents", requireStaff, expensiveLimiter, async (req, res) => {
  const { items, error } = parseNotifyBody(req.body);
  if (error) return res.status(400).json({ ok: false, error });

  try {
    const D = (await getDb().collection("crm_data").findOne({ _type: "main" })) || {};
    const results = [];
    for (const { studentId, groupId, text } of items) {
      // Manzil ikki xil ko'rsatilishi mumkin: talaba orqali (uning guruhi
      // topiladi) yoki to'g'ridan-to'g'ri guruh orqali.
      let gr, st, tag;
      if (groupId != null) {
        gr = (D.groups || []).find((x) => x.id === groupId);
        tag = { groupId };
        if (!gr) {
          results.push({ ...tag, ok: false, error: "Guruh topilmadi" });
          continue;
        }
      } else {
        st = (D.students || []).find((x) => x.id === studentId);
        gr = (D.groups || []).find((x) => x.id === st?.groupId);
        tag = { studentId };
        if (!st) {
          results.push({ ...tag, ok: false, error: "Talaba topilmadi" });
          continue;
        }
      }
      const chatId = String(gr?.telegramChatId || "").trim();
      if (!chatId) {
        // Guruhga chat ID biriktirilmagan — buni aniq aytamiz, chunki
        // tuzatish joyi boshqa sahifada (Guruhlar → tahrirlash).
        results.push({
          ...tag,
          ok: false,
          code: "no-group-chat",
          error: `"${gr?.name || "Guruhsiz"}" guruhiga Telegram chat ID biriktirilmagan`,
        });
        continue;
      }
      results.push({ ...tag, ...(await sendGroupMessage(chatId, text)) });
    }
    await audit("notify.parents", {
      req, actor: req.user,
      meta: { total: results.length, sent: results.filter((r) => r.ok).length },
    });
    res.json(notifySummary(results));
  } catch (e) {
    fail(res, e, req);
  }
});

/** 📱 SMS — ota-onaning raqami bo'lsa o'shanga, bo'lmasa talabanikiga. */
app.post("/api/notify/sms", requireStaff, expensiveLimiter, async (req, res) => {
  const { items, error } = parseNotifyBody(req.body);
  if (error) return res.status(400).json({ ok: false, error });

  try {
    const D = (await getDb().collection("crm_data").findOne({ _type: "main" })) || {};
    const results = [];
    for (const { studentId, groupId, text } of items) {
      // SMS shaxsiy raqamga ketadi — guruh manzili bu kanalda ma'nosiz.
      if (groupId != null) {
        results.push({ groupId, ok: false, error: "SMS uchun studentId kerak" });
        continue;
      }
      const st = (D.students || []).find((x) => x.id === studentId);
      if (!st) {
        results.push({ studentId, ok: false, error: "Talaba topilmadi" });
        continue;
      }
      // To'lovni ota-ona qiladi — raqami bo'lsa birinchi navbatda o'shanga.
      const phone = st.parentPhone || st.phone;
      const out = await sendSms(phone, text);
      results.push({ studentId, phone, ...out });
    }
    await audit("notify.sms", {
      req, actor: req.user,
      meta: { total: results.length, sent: results.filter((r) => r.ok).length },
      severity: "warn",
    });
    res.json(notifySummary(results));
  } catch (e) {
    fail(res, e, req);
  }
});

/** Ikkala kanalning holati — Qarzdorlar sahifasi shuni ko'rsatadi. */
app.get("/api/notify/status", requireStaff, async (_req, res) => {
  res.json({
    ok: true,
    telegram: { status: await botStatus(), envKey: "TELEGRAM_BOT_TOKEN" },
    sms: {
      status: await smsStatus(),
      ready: smsReady(),
      envKey: "ESKIZ_EMAIL / ESKIZ_PASSWORD",
    },
  });
});

/** Raqam SMS uchun yaroqlimi — ro'yxatda belgi ko'rsatish uchun. */
app.post("/api/notify/check-phones", requireStaff, (req, res) => {
  const phones = Array.isArray(req.body?.phones) ? req.body.phones : [];
  res.json({
    ok: true,
    phones: phones.slice(0, 500).map((p) => ({ phone: p, valid: !!normalizePhone(p) })),
  });
});

// ─── AI Yordamchi ─────────────────────────────────────────────────────────────
// Helper: fetch with timeout (504 oldini olish uchun)
async function fetchWithTimeout(url, opts = {}, timeoutMs = 45000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

app.post("/api/ai-chat", requireAuth, expensiveLimiter, async (req, res) => {
  // Klient uzilib qolsa serverda ham to'xtaymiz
  let clientAborted = false;
  req.on("close", () => { clientAborted = true; });

  const { messages, system } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 50)
    return res.status(400).json({ ok: false, error: "messages massivi kerak (1–50 ta)" });
  // Prompt orqali servisni suiiste'mol qilishga qarshi hajm cheklovi
  const totalChars = messages.reduce((n, m) => n + String(m?.content || "").length, 0);
  if (totalChars > 40000)
    return res.status(413).json({ ok: false, error: "Savol juda uzun" });

  const key = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  let lastErr = null;

  // -1) Lovable AI Gateway (PRIMARY — eng ishonchli, Gemini Flash modeli)
  if (lovableKey && !lovableKey.includes("your_")) {
    try {
      const msgs = [];
      if (system) msgs.push({ role: "system", content: system });
      for (const m of messages)
        msgs.push({
          role: m.role === "assistant" ? "assistant" : "user",
          content: String(m.content || ""),
        });
      const r = await fetchWithTimeout(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Lovable-API-Key": lovableKey,
          },
          body: JSON.stringify({
            model: process.env.LOVABLE_AI_MODEL || "google/gemini-3-flash-preview",
            messages: msgs,
          }),
        },
        20000,
      );
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        const text = data.choices?.[0]?.message?.content || "";
        if (text) return res.json({ ok: true, text });
        lastErr = "Lovable AI bo'sh javob qaytardi";
      } else {
        lastErr = data?.error?.message || `Lovable AI xato: HTTP ${r.status}`;
      }
    } catch (e) {
      lastErr =
        e?.name === "AbortError"
          ? "Lovable AI javob bermadi (timeout)"
          : e?.message || "Lovable AI ulanib bo'lmadi";
    }
  }

  if (clientAborted) return;


  // 0) Google Gemini (PRIMARY — agar GEMINI_API_KEY bor bo'lsa)
  if (geminiKey && !geminiKey.includes("your_")) {
    try {
      // Convert messages to Gemini format
      const contents = messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: String(m.content || "") }],
      }));
      const body = { contents };
      if (system) body.systemInstruction = { parts: [{ text: system }] };
      const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
      const r = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        15000,
      );
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        const text =
          data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ||
          "";
        if (text) return res.json({ ok: true, text });
        lastErr = "Gemini bo'sh javob qaytardi";
      } else {
        lastErr =
          data?.error?.message || `Gemini xato: HTTP ${r.status}`;
      }
    } catch (e) {
      lastErr =
        e?.name === "AbortError"
          ? "Gemini javob bermadi (timeout)"
          : e?.message || "Gemini ulanib bo'lmadi";
    }
  }

  if (clientAborted) return;



  // 1) Anthropic Claude (agar key bor bo'lsa)
  if (key && !key.includes("your_")) {
    try {
      const r = await fetchWithTimeout(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            // Tezroq model — Haiku (Sonnet 4'dan ancha tez)
            model: "claude-3-5-haiku-20241022",
            max_tokens: 512,
            system: system || "",
            messages,
          }),
        },
        15000,
      );
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        const text = data.content?.[0]?.text || "";
        if (text) return res.json({ ok: true, text });
        lastErr = "Anthropic bo'sh javob qaytardi";
      } else {
        lastErr =
          data?.error?.message || `Anthropic xato: HTTP ${r.status}`;
      }
    } catch (e) {
      lastErr =
        e?.name === "AbortError"
          ? "Anthropic javob bermadi (timeout)"
          : e?.message || "Anthropic ulanib bo'lmadi";
    }
  }

  if (clientAborted) return;

  // 2) Pollinations fallback (bepul, tezkor)
  try {
    const msgs = [];
    if (system) msgs.push({ role: "system", content: system });
    for (const m of messages)
      msgs.push({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || ""),
      });

    const r = await fetchWithTimeout(
      "https://text.pollinations.ai/openai",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "openai",
          messages: msgs,
          private: true,
        }),
      },
      14000,
    );
    const raw = await r.text();
    if (!r.ok) {
      return res.status(200).json({
        ok: true,
        text:
          "⚠️ AI xizmati hozir band (HTTP " +
          r.status +
          "). Iltimos, biroz kutib qaytadan urinib ko'ring." +
          (lastErr ? "\n\n_" + lastErr + "_" : ""),
      });
    }
    let text = "";
    try {
      const p = JSON.parse(raw);
      text = p.choices?.[0]?.message?.content || p.text || raw;
    } catch {
      text = raw;
    }
    if (!text || !text.trim()) {
      text = "⚠️ AI bo'sh javob qaytardi. Iltimos, qaytadan urinib ko'ring.";
    }
    return res.json({ ok: true, text });
  } catch (e) {
    const isTimeout = e?.name === "AbortError";
    // Hech qachon 504 chiqarmaymiz — 200 + xabar bilan qaytaramiz
    return res.status(200).json({
      ok: true,
      text:
        (isTimeout
          ? "⏱ AI javob bermadi (timeout). Server band bo'lishi mumkin."
          : "⚠️ AI xizmatiga ulanib bo'lmadi.") +
        " Iltimos, biroz kutib qaytadan urinib ko'ring." +
        (lastErr ? "\n\n_" + lastErr + "_" : ""),
    });
  }
});

// ─── Frontend static — Render uchun BITTA PORT, path orqali ajratilgan ─────────
//
//   /admin/*   → admin portal
//   /mentor/*  → mentor portal
//   /student/* → talaba portal
//   /api/*     → REST API
//   /          → sahifa tanlash (redirect)
//
// Mahalliy ishlatishda PORT=3000 — hammasi shu portda.
// Render.com da PORT avtomatik beriladi.

// 🔧 Payload juda katta bo'lsa (masalan, video fayl limitdan oshsa),
// JSON formatida tushunarli xato qaytaramiz (Express default HTML sahifa
// o'rniga), shunda frontend buni to'g'ri ushlab, foydalanuvchiga tushunarli
// xabar ko'rsata oladi.
// ─── SERTIFIKATLAR: ochiq (login talab qilmaydigan) tekshiruv ────────────────
// Sertifikatdagi QR kod `{backend}/sert/{raqam}` ga olib keladi. Bu sahifa
// AYNAN o'sha raqamli sertifikatni bazadan topib, portal bilan bir xil
// shablonda chizib beradi — ya'ni skaner qilingan qog'oz bilan ekrandagi
// ma'lumot bir xil bo'ladi. Topilmasa — "haqiqiy emas" deb ogohlantiradi.
//
// Javobda FAQAT sertifikatning o'zidagi ma'lumot bo'ladi (ism, kurs, raqam,
// davr, sana) — talabaning telefoni, guruhi, to'lovi va boshqa hech narsa
// tashqariga chiqmaydi.

async function _certFindByNo(no) {
  const target = String(no || "").trim().toLowerCase();
  if (!target) return null;

  const pick = (list) =>
    (Array.isArray(list) ? list : []).find(
      (c) => String(c && c.no ? c.no : "").trim().toLowerCase() === target,
    ) || null;

  const doc = await getDb()
    .collection("crm_data")
    .findOne({ _type: "main" }, { projection: { certificates: 1 } });
  let found = pick(doc && doc.certificates);

  // Zaxira yo'l: CRM ma'lumoti KV nusxasida ham turadi (localStorage sinxroni).
  if (!found) {
    try {
      const kv = await getDb().collection("kv").findOne({ key: CRM_KV_KEY });
      if (kv) found = pick(JSON.parse(String(kv.value)).certificates);
    } catch (e) {}
  }
  return found;
}

/** Sertifikat shabloni (joylashuv) va uning blanka rasmi. */
async function _certTemplateFor(cert) {
  const empty = { tpl: null, image: "" };
  if (!cert || !cert.templateId) return empty;

  const readList = async () => {
    const doc = await getDb()
      .collection("crm_data")
      .findOne({ _type: "main" }, { projection: { certTemplates: 1 } });
    if (doc && Array.isArray(doc.certTemplates)) return doc.certTemplates;
    try {
      const kv = await getDb().collection("kv").findOne({ key: CRM_KV_KEY });
      if (kv) return JSON.parse(String(kv.value)).certTemplates || [];
    } catch (e) {}
    return [];
  };

  const tpl = (await readList()).find(
    (t) => String(t && t.id) === String(cert.templateId),
  );
  if (!tpl) return empty;

  let image = "";
  if (tpl.blobId) {
    const blob = await getDb().collection("blobs").findOne({ id: tpl.blobId });
    if (blob && blob.data) image = blob.data;
  }
  return { tpl, image };
}

async function _certBranding() {
  try {
    const kv = await getDb()
      .collection("kv")
      .findOne({ key: "edumanage_branding_v1" });
    const b = kv ? JSON.parse(String(kv.value)) : {};
    return { name: b.crmName || "EduManage", logo: b.crmLogo || "" };
  } catch (e) {
    return { name: "EduManage", logo: "" };
  }
}

// Ochiq (loginsiz) tekshiruv — QR kod uchun. Sertifikat raqamlarini
// ketma-ket sanab chiqib ma'lumot yig'ishga qarshi chastota cheklovi bor.
app.get("/api/cert/:no", publicLookupLimiter, async (req, res) => {
  try {
    const c = await _certFindByNo(req.params.no);
    if (!c) return res.status(404).json({ ok: false, error: "not-found" });
    const brand = await _certBranding();
    const { tpl, image } = await _certTemplateFor(c);
    res.json({
      ok: true,
      cert: {
        no: c.no,
        name: c.name,
        course: c.course,
        periodFrom: c.periodFrom || "",
        periodTo: c.periodTo || "",
        period: c.period || "",
        issueDate: c.issueDate || "",
        templateId: c.templateId || null,
        // Tekshiruv sahifasida QR qayta chizilmaydi
        qr: false,
      },
      // Shablon: blanka rasmi + maydonlar joylashuvi. Portal bilan bir xil
      // modul chizgani uchun sahifa qog'ozdagi ko'rinishdan farq qilmaydi.
      tpl: tpl || null,
      tplImage: image || "",
      brand,
    });
  } catch (e) {
    fail(res, e, req);
  }
});

// Shablonlarni chizadigan modul — portaldagi bilan AYNAN bitta fayl, shuning
// uchun tekshiruv sahifasi qog'ozdagi ko'rinishdan farq qilmaydi.
app.get("/api/cert-render.js", (_req, res) => {
  const f = join(__dirname, "..", "admin", "public", "core", "certificates.js");
  if (!existsSync(f)) return res.status(404).send("// topilmadi");
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, must-revalidate");
  res.sendFile(f);
});

app.get("/sert/:no", publicLookupLimiter, (req, res) => {
  // Sertifikat raqami — faqat harf/raqam/tire/pastki chiziq/slash.
  const no = String(req.params.no || "").slice(0, 64).replace(/[^A-Za-z0-9._\/\-]/g, "");
  const safe = escapeHtml(no);
  // ⚠️ XSS TUZATISHI: JSON.stringify `</script>` ni EKRANLAMAYDI — raqamga
  // `</script><script>...` yozilsa sahifada begona kod ishga tushardi.
  const noJs = JSON.stringify(no).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  // Inline skript CSP nonce bilan belgilanadi — XSS orqali qo'shilgan
  // <script> teg brauzerda ishga tushmaydi.
  const nonce = res.locals.cspNonce || "";
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sertifikat ${safe}</title>
<style>
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{
    background:#0b0c0e;color:#f5f7fa;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,system-ui,sans-serif;
    -webkit-font-smoothing:antialiased;
    padding:14px 16px 34px;
  }
  .wrap{max-width:720px;margin:0 auto}

  /* ── Yuqori panel: logo + til tanlash ── */
  .top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:34px}
  .logo{
    width:58px;height:58px;border-radius:14px;background:#fff;
    display:flex;align-items:center;justify-content:center;overflow:hidden;
    box-shadow:0 6px 18px rgba(0,0,0,.5);flex:none;
  }
  .logo img{width:100%;height:100%;object-fit:contain;padding:5px}
  .logo span{font-weight:800;font-size:17px;color:#0b0c0e;letter-spacing:.5px}
  .langs{display:flex;gap:6px}
  .lang{
    border:0;cursor:pointer;background:transparent;color:#9aa3ad;
    font:700 17px/1 inherit;padding:11px 15px;border-radius:10px;transition:.15s;
  }
  .lang.on{background:#2c3138;color:#fff}

  /* ── Holat banneri ── */
  .status{
    border-radius:16px;padding:18px 20px;margin-bottom:22px;
    display:flex;gap:16px;align-items:center;font-weight:800;font-size:20px;
    min-height:86px;
  }
  .status .ic{
    width:52px;height:52px;border-radius:50%;flex:none;
    display:flex;align-items:center;justify-content:center;
    font-size:26px;font-weight:900;line-height:1;
  }
  .ok{background:#08221a;border:1px solid #1f7a55;color:#3ddc97}
  .ok .ic{background:#2ecc8f;color:#06231a}
  .bad{background:#2a1113;border:1px solid #a13030;color:#ff8b8b}
  .bad .ic{background:#e05555;color:#2a1113}
  .wait{background:#16181c;border:1px solid #2c3138;color:#9aa3ad;font-size:17px}
  .wait .ic{background:#2c3138;color:#9aa3ad;font-size:20px}

  /* ── Sertifikat rasmi ── */
  .sheet{background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.55)}

  /* ── Ma'lumotlar jadvali ── */
  table{
    width:100%;border-collapse:collapse;margin-top:22px;
    background:#17191d;border-radius:16px;overflow:hidden;font-size:16px;
  }
  td{padding:18px 20px;border-bottom:1px solid #24272c;vertical-align:middle}
  td:first-child{color:#8b939d;font-weight:500;white-space:nowrap}
  td:last-child{text-align:right;font-weight:700;color:#fff}
  tr:last-child td{border-bottom:none}

  /* ── PDF tugmasi ── */
  .btn{
    display:block;width:100%;margin-top:24px;border:0;cursor:pointer;
    background:#fff;color:#0b0c0e;font:800 20px/1 inherit;
    padding:22px 16px;border-radius:14px;transition:.15s;
  }
  .btn:active{transform:scale(.99)}
  .btn[disabled]{opacity:.35;cursor:default}

  .foot{margin-top:30px;font-size:15px;color:#4d545c;text-align:center;line-height:1.6}

  @media (max-width:420px){
    .status{font-size:18px}
    td{padding:15px 14px;font-size:15px}
    .btn{font-size:18px;padding:19px 14px}
  }
  @media print{
    body{background:#fff;padding:0}
    .top,.status,table,.btn,.foot{display:none!important}
    .sheet{box-shadow:none;border-radius:0}
  }
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div class="logo" id="logo"><span>UFQ</span></div>
    <div class="langs">
      <button class="lang on" data-l="uz">UZ</button>
      <button class="lang" data-l="ru">RU</button>
    </div>
  </div>

  <div class="status wait" id="st"><div class="ic">⏳</div><div id="stx">Tekshirilmoqda...</div></div>
  <div class="sheet" id="sheet" style="display:none"></div>
  <table id="info" style="display:none"></table>
  <button class="btn" id="pdf" disabled>PDF yuklab olish</button>
  <div class="foot" id="foot"></div>
</div>
<script src="/api/cert-render.js"><\/script>
<script nonce="${nonce}">
(function () {
  var no = ${noJs};
  var st = document.getElementById("st");
  var stx = document.getElementById("stx");
  var sheet = document.getElementById("sheet");
  var lang = (localStorage.getItem("certLang") === "ru") ? "ru" : "uz";
  var data = null;

  var T = {
    uz: {
      wait: "Tekshirilmoqda...",
      ok: "Sertifikat haqiqiy",
      bad: "Sertifikat topilmadi",
      err: "Serverga ulanib bo'lmadi",
      student: "Talaba", course: "Kurs", no: "Raqam",
      period: "O'qish davri", issued: "Berilgan sana",
      pdf: "PDF yuklab olish",
      foot: "UFQ school sertifikatlarini tekshirish sahifasi"
    },
    ru: {
      wait: "Проверяется...",
      ok: "Сертификат подлинный",
      bad: "Сертификат не найден",
      err: "Не удалось подключиться к серверу",
      student: "Студент", course: "Курс", no: "Номер",
      period: "Период обучения", issued: "Дата выдачи",
      pdf: "Скачать PDF",
      foot: "Страница проверки сертификатов UFQ school"
    }
  };

  function fit() {
    var inner = sheet.firstElementChild;
    if (!inner) return;
    var s = sheet.clientWidth / 1000;
    inner.style.transformOrigin = "top left";
    inner.style.transform = "scale(" + s + ")";
    sheet.style.height = ((inner.offsetHeight || 707) * s) + "px";
  }
  window.addEventListener("resize", fit);

  function render() {
    var t = T[lang];
    document.documentElement.lang = lang;
    document.getElementById("pdf").textContent = t.pdf;
    document.getElementById("foot").textContent = t.foot;

    if (data === null) { stx.textContent = t.wait; return; }
    if (data === false) {
      st.className = "status bad";
      st.firstElementChild.textContent = "✕";
      stx.textContent = t.bad + " — " + no;
      return;
    }
    if (data === "err") {
      st.className = "status bad";
      st.firstElementChild.textContent = "!";
      stx.textContent = t.err;
      return;
    }

    var c = data.cert;
    st.className = "status ok";
    st.firstElementChild.textContent = "✓";
    stx.textContent = t.ok;

    var rows = [
      [t.student, c.name],
      [t.course, c.course],
      [t.no, c.no],
      [t.period, certPeriodText(c)],
      [t.issued, (typeof _certDate === "function" ? _certDate(c.issueDate) : c.issueDate)]
    ];
    var info = document.getElementById("info");
    // innerHTML o'rniga DOM — ma'lumotdagi HTML kod sifatida ishlamaydi
    info.textContent = "";
    rows.forEach(function (r) {
      var tr = document.createElement("tr");
      var td1 = document.createElement("td"); td1.textContent = r[0];
      var td2 = document.createElement("td"); td2.textContent = r[1] || "—";
      tr.appendChild(td1); tr.appendChild(td2); info.appendChild(tr);
    });
    info.style.display = "";
  }

  Array.prototype.forEach.call(document.querySelectorAll(".lang"), function (b) {
    b.addEventListener("click", function () {
      lang = b.getAttribute("data-l");
      try { localStorage.setItem("certLang", lang); } catch (e) {}
      Array.prototype.forEach.call(document.querySelectorAll(".lang"), function (x) {
        x.classList.toggle("on", x === b);
      });
      render();
    });
    if (b.getAttribute("data-l") === lang) {
      Array.prototype.forEach.call(document.querySelectorAll(".lang"), function (x) {
        x.classList.toggle("on", x === b);
      });
    }
  });

  document.getElementById("pdf").addEventListener("click", function () {
    if (!data || data === true) return;
    window.print();
  });

  render();

  fetch("/api/cert/" + encodeURIComponent(no))
    .then(function (r) { return r.json().then(function (d) { return { s: r.status, d: d }; }); })
    .then(function (res) {
      if (res.s === 404 || !res.d.ok) { data = false; render(); return; }
      data = res.d;

      if (res.d.brand && res.d.brand.logo) {
        // Atributni matn sifatida yopishtirish o'rniga xususiyat orqali —
        // logo manzilidagi qo'shtirnoq bilan atributdan chiqib bo'lmaydi.
        var _img = document.createElement("img");
        _img.alt = "logo";
        if (/^(https?:|data:image\/)/i.test(res.d.brand.logo)) _img.src = res.d.brand.logo;
        var _lg = document.getElementById("logo");
        _lg.textContent = "";
        _lg.appendChild(_img);
      }

      var c = res.d.cert;
      c.brand = res.d.brand.name;
      c.logo = res.d.brand.logo;

      sheet.style.display = "";
      sheet.style.overflow = "hidden";
      sheet.innerHTML = certRenderHtml(c, "", res.d.tpl, res.d.tplImage);
      fit();
      setTimeout(fit, 300);

      document.getElementById("pdf").disabled = false;
      render();
    })
    .catch(function () { data = "err"; render(); });
})();
<\/script>
</body>
</html>`);
});

app.use((err, _req, res, next) => {
  if (err && err.type === "entity.too.large") {
    return res
      .status(413)
      .json({ ok: false, error: "Fayl juda katta (limit oshib ketdi)" });
  }
  next(err);
});

const PORT = parseInt(process.env.PORT || "3000");

// ── Static fayllar yo'llari ─────────────────────────────────────────────────
const adminPublic = join(__dirname, "..", "admin", "public");
const mentorPublic = join(__dirname, "..", "mentor", "public");
const studentPublic = join(__dirname, "..", "student", "public");
const adminDist = join(__dirname, "..", "admin", "dist");
const mentorDist = join(__dirname, "..", "mentor", "dist");
const studentDist = join(__dirname, "..", "student", "dist");

// ── Portaller: /admin, /mentor, /student ────────────────────────────────────
// Vite build qilinsa dist/ papkasi ishlatiladi.
// dist/ papkasida public/ ichidagi fayllar ham bo'ladi (Vite avtomatik ko'chiradi).
// Agar dist/ yo'q bo'lsa — public/ dan ishlaydi.

const portals = [
  { prefix: "/admin", dist: adminDist, pub: adminPublic },
  { prefix: "/mentor", dist: mentorDist, pub: mentorPublic },
  { prefix: "/student", dist: studentDist, pub: studentPublic },
];

for (const { prefix, dist, pub } of portals) {
  // dist/ bor bo'lsa ishlatamiz, yo'q bo'lsa public/ dan
  const root = existsSync(dist) ? dist : existsSync(pub) ? pub : null;

  if (!root) {
    app.get(prefix, (_req, res) =>
      res.status(503).send("Portal build qilinmagan"),
    );
    app.get(prefix + "/*", (_req, res) =>
      res.status(503).send("Portal build qilinmagan"),
    );
    continue;
  }

  // Static fayllar
  app.use(prefix, express.static(root, { index: false }));

  // dist/ yo'q bo'lsa public/core ni ham serve qil
  if (!existsSync(dist) && existsSync(join(pub, "core"))) {
    app.use(prefix + "/core", express.static(join(pub, "core")));
  }

  // SPA fallback — index.html
  const indexFile = join(root, "index.html");
  app.get(prefix, (_req, res) => {
    existsSync(indexFile)
      ? res.sendFile(indexFile)
      : res.status(404).send("Portal topilmadi");
  });
  app.get(prefix + "/*", (_req, res) => {
    existsSync(indexFile)
      ? res.sendFile(indexFile)
      : res.status(404).send("Portal topilmadi");
  });
}

// ── ROOT ga tushgan portal fayllari ────────────────────────────────────────
// 🔧 BUG FIX: portallar Vite bilan `base: "/"` qilib build qilinadi, chunki
// Vercel'da har bir portal O'Z domenining ildizida turadi. Backend esa
// uchalasini bitta domen ostida (/admin, /mentor, /student) beradi — natijada
// index.html ichidagi `/assets/index-xxx.js` va crmBoot'ning `/core/*.js`
// manzillari ILDIZGA tushib, 404 qaytarardi. Ya'ni backend orqali ochilganda
// ilova umuman yuklanmasdi (console'da o'nlab 404).
//
// Yechim: ildizga tushgan bunday so'rovni Referer bo'yicha kerakli portalga
// yo'naltiramiz (Referer bo'lmasa — uchalasidan qidiramiz). Vercel'dagi
// ishlash tartibiga bu umuman tegmaydi.
const PORTAL_NAMES = portals.map((p) => p.prefix.slice(1));
const portalDirs = portals.map(({ prefix, dist, pub }) => ({
  name: prefix.slice(1),
  dirs: [existsSync(dist) ? dist : null, existsSync(pub) ? pub : null].filter(
    Boolean,
  ),
}));

app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();

  let p;
  try {
    p = decodeURIComponent(req.path);
  } catch (e) {
    return next();
  }
  if (p === "/" || p.startsWith("/api/")) return next();
  // Allaqachon portal prefiksi bilan kelgan bo'lsa — express.static ishlagan
  if (new RegExp("^/(" + PORTAL_NAMES.join("|") + ")(/|$)").test(p)) {
    return next();
  }

  // Qaysi portaldan so'ralganini Referer aytib beradi
  const ref = req.get("referer") || "";
  const m = ref.match(new RegExp("/(" + PORTAL_NAMES.join("|") + ")(?:[/?#]|$)"));
  const order = m
    ? [m[1], ...PORTAL_NAMES.filter((n) => n !== m[1])]
    : PORTAL_NAMES;

  for (const name of order) {
    const entry = portalDirs.find((x) => x.name === name);
    if (!entry) continue;
    for (const dir of entry.dirs) {
      // ⚠️ TUZATISH: `startsWith(dir)` yetarli emas — "/app/dist" tekshiruvidan
      // "/app/dist-maxfiy/..." ham o'tib ketardi. Endi normallashtirilgan yo'l
      // va ajratgich bilan solishtiramiz, ".." bo'g'inlari esa oldindan rad
      // etiladi.
      if (p.split("/").includes("..")) continue;
      const base = resolve(dir);
      const file = resolve(base, "." + (p.startsWith("/") ? p : "/" + p));
      if (file !== base && !file.startsWith(base + sep)) continue;
      // Yashirin fayllar (.env, .git, .auth-secret) hech qachon berilmaydi
      if (p.split("/").some((seg) => seg.startsWith("."))) continue;
      try {
        if (existsSync(file) && statSync(file).isFile()) {
          return res.sendFile(file);
        }
      } catch (e) {}
    }
  }
  next();
});

// ── Bosh sahifa — portallar ro'yxati ────────────────────────────────────────
app.get("/", (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>EduManage CRM</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;background:#0f172a;color:#f1f5f9;min-height:100vh;display:flex;align-items:center;justify-content:center}
  .wrap{text-align:center;padding:40px 20px}
  h1{font-size:2rem;font-weight:800;margin-bottom:8px}
  p{color:#94a3b8;margin-bottom:40px}
  .cards{display:flex;gap:20px;flex-wrap:wrap;justify-content:center}
  .card{background:#1e293b;border:1px solid #334155;border-radius:16px;padding:32px 40px;text-decoration:none;color:inherit;transition:.2s;min-width:180px}
  .card:hover{background:#273449;border-color:#64748b;transform:translateY(-3px)}
  .icon{font-size:2.5rem;margin-bottom:12px}
  .label{font-weight:700;font-size:1.1rem}
  .sub{color:#64748b;font-size:.85rem;margin-top:4px}
</style>
</head>
<body>
<div class="wrap">
  <h1>🎓 EduManage CRM</h1>
  <p>Portalingizni tanlang</p>
  <div class="cards">
    <a class="card" href="/admin">
      <div class="icon">🔵</div>
      <div class="label">Admin</div>
      <div class="sub">Boshqaruv paneli</div>
    </a>
    <a class="card" href="/mentor">
      <div class="icon">🟢</div>
      <div class="label">Mentor</div>
      <div class="sub">Mentor kabineti</div>
    </a>
    <a class="card" href="/student">
      <div class="icon">🟡</div>
      <div class="label">Talaba</div>
      <div class="sub">Talaba kabineti</div>
    </a>
  </div>
</div>
</body>
</html>`);
});

// ─── Xato ushlagich (barcha marshrutlardan KEYIN) ────────────────────────────
// Ichki xato matni, stack trace va baza xabarlari tashqariga chiqmaydi.
app.use(errorHandler);

// ─── Serverni ishga tushirish ─────────────────────────────────────────────────
async function start() {
  const mongoOk = await connectMongo();

  // Xavfsizlik ombori: indekslar, eski hisoblarni ko'chirish, boshlang'ich admin.
  // Baza bo'lmasa autentifikatsiya ishlamaydi — bunday holatda ochiq (himoyasiz)
  // rejimda ishlashdan ko'ra to'xtagan ma'qul.
  if (mongoOk) {
    try {
      await initSecurityStore(getDb);
    } catch (e) {
      console.error("🛑 Xavfsizlik qatlami ishga tushmadi:", e.message);
      if (SEC.isProd) process.exit(1);
    }
  } else if (SEC.isProd) {
    console.error("🛑 MongoDB yo'q — autentifikatsiya ishlamaydi, server to'xtatildi.");
    process.exit(1);
  }

  // Telegram yangilanishlarini kuzatish — talabalar "/start s<id>" bosganda
  // ularning chat id si shu halqa orqali yozib olinadi.
  startTelegramPolling();

  app.listen(PORT, "0.0.0.0", () => {
    const base = `http://localhost:${PORT}`;
    console.log(`\n✅ Server ishga tushdi: ${base}`);
    console.log(`   🔵 Admin:   ${base}/admin`);
    console.log(`   🟢 Mentor:  ${base}/mentor`);
    console.log(`   🟡 Talaba:  ${base}/student`);
    console.log(`   🔧 API:     ${base}/api`);
  });

  const envOk = (k) => !!process.env[k] && !process.env[k].includes("your_");
  const tgOk = envOk("TELEGRAM_BOT_TOKEN");
  const aiOk =
    !!process.env.ANTHROPIC_API_KEY &&
    !process.env.ANTHROPIC_API_KEY.includes("your_");
  console.log(`\n   MongoDB:   ${db ? "✅ ulangan" : "❌ ulanmagan"}`);
  console.log(`   Telegram:  ${tgOk ? "✅ sozlangan" : "⚠️  sozlanmagan"}`);
  console.log(
    `   SMS:       ${smsReady() ? "✅ sozlangan (Eskiz)" : "⚠️  sozlanmagan (ESKIZ_EMAIL/PASSWORD)"}`,
  );
  console.log(
    `   AI:        ${aiOk ? "✅ Anthropic" : "➡️  Pollinations (bepul)"}\n`,
  );
}

start().catch(console.error);
