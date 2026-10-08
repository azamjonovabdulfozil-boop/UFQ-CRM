/**
 * seed-admin.js — admin hisobini tiklash va qurilma blokini ochish.
 *
 * Nima qiladi:
 *   1) auth_device_blocks ni tozalaydi       → "qurilma bloklandi" yo'qoladi
 *   2) admin (default: toxir) hisobini yaratadi/yangilaydi — KUCHLI parol bilan
 *   3) admin lockout/failedAttempts ni nolga tushiradi, mustChangePassword=off
 *
 * ⚠️ Parol tizimning kuch-sinovidan o'tishi SHART (kamida 10 belgi, ommabop
 * bo'lmasin, login/ism bilan bir xil bo'lmasin). Jonli serverda zaif parol
 * (masalan "toxir" yoki "admin123") ataylab RAD etiladi — bu panel internetda
 * ochiq va ichida real foydalanuvchilar ma'lumoti bor.
 *
 * ── LOKAL baza uchun:
 *       node seed-admin.js
 * ── JONLI (prod) baza uchun — Atlas ulanish satrini bering:
 *       MONGODB_URI="mongodb+srv://...." node seed-admin.js
 * ── Login/parolni o'zgartirish:
 *       ADMIN_USER=toxir ADMIN_PASS="O'zingizning-Kuchli-Parolingiz-2026" MONGODB_URI="..." node seed-admin.js
 *
 * Skriptdan keyin Render'da servisni RESTART qiling (xotiradagi 429 tozalanadi).
 */
import { MongoClient } from "mongodb";
import { readFileSync, existsSync } from "node:fs";
import { initAccounts, upsertAccount, findByUsername, ROLES } from "./security/accounts.js";

// .env ni o'zimiz o'qiymiz — `--env-file` bayrog'i (eski Node) kerak bo'lmasin.
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
}

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/CRM";
const USER = (process.env.ADMIN_USER || "toxir").trim();
// Kuchli standart parol — login "toxir" ni o'z ichiga OLMAYDI (siyosat talabi).
const PASS = process.env.ADMIN_PASS || "UFQ-maktab-2026!";

const client = new MongoClient(MONGODB_URI);

try {
  await client.connect();
  const db = client.db();
  initAccounts(() => db);

  const where = /localhost|127\.0\.0\.1/.test(MONGODB_URI) ? "LOKAL" : "JONLI (prod)";
  console.log(`🗄️  Baza: ${where} — ${MONGODB_URI.replace(/\/\/[^@]*@/, "//***@")}`);

  // ── 1. Qurilma bloklarini tozalash ─────────────────────────────────────
  const delBlocks = await db.collection("auth_device_blocks").deleteMany({});
  console.log(`🔓  Qurilma bloklari tozalandi: ${delBlocks.deletedCount} ta`);

  // ── 2. Admin hisobini yaratish/yangilash (KUCHLI parol — kuch-sinovli) ──
  const r = await upsertAccount({
    username: USER,
    role: ROLES.ADMIN,
    name: "Administrator",
    password: PASS, // ← strength check shu yerda ishlaydi; zaif parol rad etiladi
    mustChangePassword: false,
  });
  if (!r.ok) {
    console.error("🛑 Hisob yaratilmadi:", r.error);
    if (r.code === "weak-password")
      console.error("   → Kuchliroq parol bering: ADMIN_PASS=\"...\" (10+ belgi, login/ismni o'z ichiga olmasin).");
    process.exit(1);
  }

  // ── 3. Lockout'ni tozalash ──────────────────────────────────────────────
  await db.collection("accounts").updateOne(
    { username: USER },
    { $set: { status: "active", failedAttempts: 0, lockedUntil: null } },
  );

  const acc = await findByUsername(USER);
  console.log(
    "\n" + "═".repeat(54) + "\n" +
    "✅  TAYYOR — endi kira olasiz\n" +
    "    Login: " + USER + "\n" +
    "    Parol: " + PASS + "\n" +
    "    Rol:   " + (acc?.role || "admin") + "\n" +
    "═".repeat(54) + "\n" +
    "ℹ️  Jonli bo'lsa: Render → servis → Manual Deploy / Restart qiling\n" +
    "    (xotiradagi 429 va blok shunda tozalanadi).\n"
  );
} catch (e) {
  console.error("🛑 Xatolik:", e.message);
  process.exit(1);
} finally {
  await client.close();
}
