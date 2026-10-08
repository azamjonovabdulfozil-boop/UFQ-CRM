/**
 * check-admin.js — FAQAT O'QISH. Admin hisoblari va blok holatini ko'rsatadi.
 * Hech narsani o'zgartirmaydi.
 *     node --env-file=.env check-admin.js
 */
import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/CRM";
const client = new MongoClient(MONGODB_URI);

try {
  await client.connect();
  const db = client.db();
  console.log("🗄️  Baza:", MONGODB_URI.replace(/\/\/[^@]*@/, "//***@"));

  const admins = await db.collection("accounts")
    .find({ role: "admin" })
    .project({ username: 1, status: 1, failedAttempts: 1, lockedUntil: 1, passwordHash: 1, legacyPassword: 1, mustChangePassword: 1 })
    .toArray();

  console.log(`\n👤  Admin hisoblar: ${admins.length} ta`);
  for (const a of admins) {
    console.log("   • username:", a.username,
      "| status:", a.status || "active",
      "| parol turi:", a.passwordHash ? "scrypt" : a.legacyPassword ? "legacy" : "YO'Q",
      "| mustChange:", !!a.mustChangePassword,
      "| failed:", a.failedAttempts || 0,
      "| lockedUntil:", a.lockedUntil || "yo'q");
  }

  const blocks = await db.collection("auth_device_blocks").countDocuments({});
  console.log(`\n🔒  Qurilma bloklari (bazada): ${blocks} ta`);
  console.log("\nℹ️  429 ko'rsatilsa — u server XOTIRASIDA, bazada ko'rinmaydi.");
  console.log("   Uni faqat serverni qayta ishga tushirish tozalaydi.\n");
} catch (e) {
  console.error("🛑 Xatolik:", e.message);
  process.exit(1);
} finally {
  await client.close();
}
