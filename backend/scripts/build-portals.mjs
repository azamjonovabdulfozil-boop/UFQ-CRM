/**
 * Render'da portallarni (admin + Super Admin, mentor, talaba) avtomatik build qiladi.
 *
 * Nega: Render servisining "Build Command" i panelda `npm install` bo'lib qolsa,
 * `build.sh` ishlamaydi va /admin, /mentor, /student "Portal topilmadi" qaytaradi.
 * Bu skript backend'ning `postinstall` bosqichida ishga tushadi, shuning uchun
 * build buyrug'i qanday bo'lishidan qat'i nazar portallar tayyor bo'ladi.
 *
 * Faqat Render'da ishlaydi (RENDER=true). Lokal kompyuterda `npm install`
 * sekinlashmasin deb o'tkazib yuboriladi; majburlash: UFQ_BUILD_PORTALS=1.
 * build.sh o'zi build qilgan bo'lsa (UFQ_PORTALS_BUILT=1) — qayta qilinmaydi.
 * Portal build xatosi backend deployini to'xtatmaydi — xato logga yoziladi.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const env = process.env;
if (env.UFQ_PORTALS_BUILT === "1") process.exit(0);
if (!env.RENDER && env.UFQ_BUILD_PORTALS !== "1") process.exit(0);

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const childEnv = { ...env, UFQ_PORTALS_BUILT: "1" };
let failed = 0;

for (const p of ["admin", "mentor", "student"]) {
  const dir = join(root, p);
  if (!existsSync(join(dir, "package.json"))) continue;
  console.log(`\n📦 [portallar] ${p} build qilinmoqda...`);
  try {
    // Vite va plugin `dependencies` da — production rejimida ham o'rnatiladi
    execSync("npm install --no-audit --no-fund", { cwd: dir, stdio: "inherit", env: childEnv });
    execSync("npm run build", { cwd: dir, stdio: "inherit", env: { ...childEnv, VITE_BASE_PATH: `/${p}/` } });
    console.log(`✅ [portallar] ${p} tayyor: ${join(dir, "dist")}`);
  } catch (e) {
    failed++;
    console.error(`❌ [portallar] ${p} build bo'lmadi: ${e?.message || e}`);
  }
}
console.log(failed ? `\n⚠️ [portallar] ${failed} ta portal build bo'lmadi` : "\n🎉 [portallar] hammasi tayyor");
