/**
 * security/bootstrap.js — Eski hisoblarni ko'chirish va boshlang'ich admin.
 *
 * Bu fayl bir marta (server ko'tarilganda) ishlaydi va mavjud tizimni yangi
 * xavfsiz modelga OG'RIQSIZ o'tkazadi:
 *
 *   1) `users` kolleksiyasidagi mentor/talaba loginlari → `accounts`
 *      (parollar ochiq matnda saqlanmaydi; sha256 ko'rinishida "legacy"
 *       maydonga yoziladi va birinchi kirishda scrypt'ga aylanadi)
 *   2) KV dagi `edumanage_admin_cred_v1` → admin hisobi
 *   3) Hech qanday admin bo'lmasa — yangi admin yaratiladi va paroli
 *      konsolga BIR MARTA chiqariladi
 *   4) `users` kolleksiyasidagi ochiq parollar O'CHIRILADI
 */
import { CONFIG } from "./config.js";
import { upsertAccount, countAdmins, ROLES, fromLegacyRole, COL as ACCOUNTS_COL } from "./accounts.js";
import { randomToken } from "./crypto.js";
import { audit } from "./audit.js";
import { safeUsername } from "./sanitize.js";

const ADMIN_CRED_KEY = "edumanage_admin_cred_v1";

export async function bootstrapSecurity(getDb) {
  const db = getDb();
  const report = { migrated: 0, skipped: 0, adminCreated: false, scrubbed: 0 };

  // ── 1. Eski admin credential (KV) ────────────────────────────────────────
  try {
    // Admin allaqachon bo'lsa ko'chirmaymiz — aks holda admin loginini
    // o'zgartirgandan keyin eski login qayta tiklanib qolardi.
    const kv = (await countAdmins()) === 0 ? await db.collection("kv").findOne({ key: ADMIN_CRED_KEY }) : null;
    if (kv?.value) {
      const c = JSON.parse(String(kv.value));
      if (c?.login && c?.pass) {
        const u = safeUsername(c.login);
        if (u) {
          const exists = await db.collection(ACCOUNTS_COL).findOne({ username: u });
          if (!exists) {
            const r = await upsertAccount({
              username: u,
              role: ROLES.ADMIN,
              name: "Administrator",
              legacyPassword: String(c.pass),
            });
            if (r.ok) report.migrated++;
          }
        }
      }
    }
  } catch (e) {
    console.warn("⚠️  Admin credential ko'chirilmadi:", e.message);
  }

  // ── 2. users kolleksiyasi (mentor / talaba) ──────────────────────────────
  try {
    const legacy = await db.collection("users").find({}).toArray();
    for (const u of legacy) {
      const username = safeUsername(u.login);
      if (!username) {
        report.skipped++;
        continue;
      }
      const role = fromLegacyRole(u.role) || (u._role === "mentor" ? ROLES.MENTOR : ROLES.STUDENT);
      const exists = await db.collection(ACCOUNTS_COL).findOne({ username });
      if (exists) {
        report.skipped++;
        continue;
      }
      const r = await upsertAccount({
        username,
        role,
        name: u.name || username,
        mentorName: u.mentorName || null,
        studentId: u.studentId ?? null,
        studentName: u.studentName || null,
        legacyPassword: u.pass ? String(u.pass) : randomToken(24), // parolsiz hisob — kirib bo'lmaydi
      });
      if (r.ok) report.migrated++;
      else report.skipped++;
    }
  } catch (e) {
    console.warn("⚠️  Foydalanuvchilar ko'chirilmadi:", e.message);
  }

  // ── 3. Admin bormi? ──────────────────────────────────────────────────────
  if ((await countAdmins()) === 0) {
    const username = safeUsername(CONFIG.bootstrapAdminUser) || "admin";
    const password = CONFIG.bootstrapAdminPassword || randomToken(12);
    const r = await upsertAccount({
      username,
      role: ROLES.ADMIN,
      name: "Administrator",
      password,
      mustChangePassword: !CONFIG.bootstrapAdminPassword,
    });
    if (r.ok) {
      report.adminCreated = true;
      if (!CONFIG.bootstrapAdminPassword) {
        console.log(
          "\n" +
            "═".repeat(66) + "\n" +
            "🔐  BOSHLANG'ICH ADMIN HISOBI YARATILDI\n" +
            "    Login: " + username + "\n" +
            "    Parol: " + password + "\n" +
            "    Bu parol FAQAT SHU YERDA ko'rsatiladi. Birinchi kirishda\n" +
            "    uni almashtirish talab qilinadi.\n" +
            "═".repeat(66) + "\n",
        );
      } else {
        console.log(`🔐  Admin hisobi yaratildi: ${username} (parol ENV dan)`);
      }
      await audit("bootstrap.admin_created", { meta: { username }, severity: "warn" });
    } else {
      console.error("🛑 Admin hisobi yaratilmadi:", r.error);
    }
  }

  // ── 4. Eski ochiq parollarni bazadan olib tashlash ───────────────────────
  // Hisoblar `accounts` ga ko'chgach, `users` dagi `pass` maydoni faqat xavf.
  try {
    const r = await db.collection("users").updateMany(
      { pass: { $exists: true } },
      { $unset: { pass: "" }, $set: { _passwordMovedAt: new Date() } },
    );
    report.scrubbed = r.modifiedCount || 0;
  } catch (e) {
    console.warn("⚠️  Eski parollar tozalanmadi:", e.message);
  }

  // KV dagi admin parolini ham olib tashlaymiz
  try {
    await db.collection("kv").deleteOne({ key: ADMIN_CRED_KEY });
  } catch {}

  if (report.migrated || report.scrubbed || report.adminCreated) {
    console.log(
      `🔐  Xavfsizlik ko'chirishi: ${report.migrated} hisob ko'chirildi, ` +
        `${report.scrubbed} ochiq parol o'chirildi.`,
    );
  }
  return report;
}
