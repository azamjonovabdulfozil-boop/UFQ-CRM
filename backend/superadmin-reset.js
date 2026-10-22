/**
 * superadmin-reset.js — Super Admin hisobini tiklash (faqat server konsolidan).
 *
 * Parol esdan chiqsa yoki telefon (Authenticator) yo'qolsa: server shellida
 * (Render → Shell yoki lokal) ishga tushiriladi va BIR MARTALIK havola
 * chiqaradi. Havola 30 daqiqa amal qiladi; ochilganda yangi parol so'raladi.
 *
 *   node --env-file=.env superadmin-reset.js abdulfozil            # faqat parol
 *   node --env-file=.env superadmin-reset.js abdulfozil --reset-2fa # parol + 2FA o'chiriladi
 *
 * Eski parol hech qachon ko'rsatilmaydi. Hodisa jurnalga yoziladi.
 * Muqobil yo'l: ENV dagi SUPER_ADMIN_PASSWORD ni yangi qiymatga almashtirib
 * serverni qayta ishga tushirish (yangi parol bir marta qo'llanadi).
 */
import crypto from "node:crypto";
import { MongoClient } from "mongodb";

const username = String(process.argv[2] || "").trim().toLowerCase();
const reset2fa = process.argv.includes("--reset-2fa");
if (!username) {
  console.error("Foydalanish: node --env-file=.env superadmin-reset.js <login> [--reset-2fa]");
  process.exit(1);
}

const client = new MongoClient(process.env.MONGODB_URI || "mongodb://localhost:27017/CRM");
try {
  await client.connect();
  const db = client.db();
  const acc = await db.collection("accounts").findOne({ username });
  if (!acc || acc.role !== "superadmin") {
    console.error("🛑 Bunday Super Admin hisobi topilmadi:", username);
    process.exit(1);
  }
  const token = crypto.randomBytes(32).toString("base64url");
  const ttl = Number(process.env.PASSWORD_RESET_TTL) || 1800;
  const expiresAt = new Date(Date.now() + ttl * 1000);
  await db.collection("accounts").updateOne(
    { _id: acc._id },
    {
      $set: {
        resetToken: {
          hash: crypto.createHash("sha256").update(token).digest("hex"),
          expiresAt,
          createdBy: "console",
          createdAt: new Date(),
          disable2fa: reset2fa,
        },
      },
    },
  );
  await db.collection("security_audit").insertOne({
    at: new Date(),
    event: "super.admin.reset_link",
    severity: "critical",
    actorName: "console",
    actorRole: "system",
    target: { username },
    meta: { via: "superadmin-reset.js", reset2fa },
  });
  console.log("\n🔐 Bir martalik tiklash havolasi (" + Math.round(ttl / 60) + " daqiqa amal qiladi):\n");
  console.log("   <ADMIN_PORTAL_MANZILI>/?reset=" + token);
  console.log("\n   Masalan: http://localhost:3000/admin/?reset=" + token + "\n");
  if (reset2fa) console.log("   ⚠️ Parol o'rnatilgach 2 bosqichli tasdiqlash o'chadi — panelda qaytadan yoqing.\n");
} catch (e) {
  console.error("🛑 Xatolik:", e.message);
  process.exit(1);
} finally {
  await client.close();
}
