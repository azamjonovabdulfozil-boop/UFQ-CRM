/**
 * Super Admin integratsion sinovi — ishlab turgan serverga so'rov yuboradi.
 *
 *   SA_TEST_URL=http://localhost:3000 \
 *   SA_ADMIN_USER=admin SA_ADMIN_PASS=... SA_SUPER_USER=Abdulfozil SA_SUPER_PASS=... \
 *   node tests/superadmin.itest.mjs
 *
 * Mavjud CRM ma'lumotini o'zgartirmaydi. Sinov uchun o'zgartirilgan sozlamalar
 * (modullar, 2FA) oxirida asl holatiga qaytariladi; yaratilgan sinov admini o'chiriladi.
 */
import { totpNow } from "../security/totp.js";

const BASE = process.env.SA_TEST_URL || "http://localhost:3000";
const A = { u: process.env.SA_ADMIN_USER || "admin", p: process.env.SA_ADMIN_PASS };
const S = { u: process.env.SA_SUPER_USER || "Abdulfozil", p: process.env.SA_SUPER_PASS };
if (!A.p || !S.p) {
  console.error("SA_ADMIN_PASS va SA_SUPER_PASS kerak");
  process.exit(2);
}

let pass = 0, fail = 0;
const results = [];
function check(name, cond, extra = "") {
  if (cond) pass++;
  else fail++;
  results.push(`${cond ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`);
}

class Client {
  constructor() {
    this.jar = {};
    this.token = null;
    this.csrf = null;
  }
  cookies() {
    return Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join("; ");
  }
  store(res) {
    for (const c of res.headers.getSetCookie?.() || []) {
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      const k = kv.slice(0, i).trim(), v = kv.slice(i + 1).trim();
      if (v === "") delete this.jar[k];
      else this.jar[k] = v;
    }
  }
  async req(path, { method = "GET", body, raw = false, headers = {} } = {}) {
    const h = { Origin: BASE, "X-Device-Id": "d_itest_superadmin_0001", Cookie: this.cookies(), ...headers };
    if (this.token) h.Authorization = "Bearer " + this.token;
    if (this.csrf) h["X-CSRF-Token"] = this.csrf;
    if (body !== undefined) h["Content-Type"] = "application/json";
    const r = await fetch(BASE + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: "manual" });
    this.store(r);
    if (raw) return r;
    let d = null;
    try { d = await r.json(); } catch {}
    return { status: r.status, d };
  }
  async login(u, p, otp) {
    const r = await this.req("/api/auth/login", { method: "POST", body: { username: u, password: p, otp } });
    if (r.d?.ok) {
      this.token = r.d.accessToken;
      this.csrf = r.d.csrfToken;
    }
    return r;
  }
}

const admin = new Client();
const sup = new Client();

// 1–2. Kirish va yo'naltirish uchun rollar
const la = await admin.login(A.u, A.p);
check("1. admin hisobi kiradi (oddiy admin roli)", la.d?.ok && la.d.user.role === "admin" && !la.d.user.isSuper, la.d?.user?.role || la.d?.error);
const ls = await sup.login(S.u, S.p);
check("2. Abdulfozil kiradi — Super Admin roli", ls.d?.ok && ls.d.user.role === "superadmin" && ls.d.user.isSuper, ls.d?.user?.role || ls.d?.error);

// 3. Super Admin sahifasi: HTML beriladi, lekin ma'lumot faqat API dan; admin uchun API 403
const page = await admin.req("/admin/super-admin/", { raw: true });
check("3. /super-admin sahifasi mavjud (ma'lumotsiz qobiq)", page.status === 200);
const legacy = await admin.req("/super-admin", { raw: true });
check("3. /super-admin → /admin/super-admin/ ga yo'naltiriladi", legacy.status === 302);

// 4. Oddiy admin Super Admin API'lariga kira olmaydi
const superPaths = ["/api/super/overview", "/api/super/analytics", "/api/super/teachers", "/api/super/admins", "/api/super/monitor", "/api/super/activity", "/api/super/backups", "/api/super/modules", "/api/super/me", "/api/super/reports/overview?format=csv", "/api/super/data/students"];
let denied = 0;
for (const p of superPaths) if ((await admin.req(p)).status === 403) denied++;
check("4. admin → barcha Super Admin GET API'lari 403", denied === superPaths.length, `${denied}/${superPaths.length}`);
const w1 = await admin.req("/api/super/modules", { method: "POST", body: { modules: { finance: { menu: false, api: false } } } });
const w2 = await admin.req("/api/super/backups/create", { method: "POST" });
check("4. admin → Super Admin yozish API'lari 403", w1.status === 403 && w2.status === 403);
const anon = new Client();
check("4. kirmagan foydalanuvchi → 401", (await anon.req("/api/super/overview")).status === 401);
// Oddiy admin Super Admin hisobini ko'rmaydi va unga tega olmaydi
const accs = await admin.req("/api/admin/accounts");
check("4. admin ro'yxatida Super Admin ko'rinmaydi", accs.d?.ok && !accs.d.accounts.some((a) => a.isSuper));
const supId = ls.d?.user?.id;
const touch = await admin.req("/api/admin/accounts/password", { method: "POST", body: { id: supId, password: "hackhack123" } });
check("4. admin Super Admin parolini o'zgartira olmaydi", touch.status === 403);
const touch2 = await admin.req("/api/admin/accounts", { method: "POST", body: { username: "abdulfozil", role: "admin", password: "x12345678" } });
check("4. admin Super Admin hisobini qayta yoza olmaydi", touch2.status === 400 && touch2.d?.code === "protected-account");

// 5–8. Analitika
const ov = await sup.req("/api/super/overview?period=30");
check("5. Super Admin dashboard statistikasi", ov.d?.ok && ov.d.stats.students.total >= 0 && Array.isArray(ov.d.series), ov.d?.error);
const an = await sup.req("/api/super/analytics?period=90");
check("5. CRM analitikasi (o'quvchi/sinf/dars/uy vazifasi)", an.d?.ok && Array.isArray(an.d.groups) && an.d.homework && an.d.homework.available === false, an.d?.error);
const te = await sup.req("/api/super/teachers?period=90");
const tOk = te.d?.ok && te.d.teachers.every((t) => t.score == null || (t.score >= 0 && t.score <= 100 && t.parts.length >= 2));
check("6. O'qituvchilar reytingi hisoblanadi (ball 0–100, formula qismlari bilan)", tOk, `${te.d?.teachers?.length} ta o'qituvchi, ${te.d?.teachers?.filter((t) => t.score != null).length} tasi reytingda`);
// 7. Mustaqil qayta hisob: guruh davomati = K/(K+Y+S)
const g0 = an.d?.groups?.find((g) => g.att.marked > 0);
check("7. Sinf davomati formulasi to'g'ri (K/(K+Y+S))", !g0 || Math.abs(g0.att.pct - Math.round((g0.att.K / g0.att.marked) * 1000) / 10) < 0.051, g0 ? `${g0.name}: ${g0.att.pct}%` : "belgili guruh yo'q");
const sumMembersMarked = g0 ? g0.members.reduce((s, m) => s + m.att.marked, 0) : 0;
check("7. Guruh belgilari a'zolar yig'indisiga teng (takror hisob yo'q)", !g0 || sumMembersMarked <= g0.att.marked, g0 ? `${sumMembersMarked} ≤ ${g0.att.marked}` : "");
const s7 = await sup.req("/api/super/overview?period=7");
const sT = await sup.req("/api/super/overview?period=today");
const sC = await sup.req("/api/super/overview?period=custom&from=2026-09-01&to=2026-09-30");
check("8. Sana filtri: 7/30 kun turli davr va qator uzunligi", s7.d?.range.days === 7 && s7.d.series.length === 7 && ov.d.series.length === 30);
check("8. Sana filtri: bugun va maxsus oraliq", sT.d?.range.days === 1 && sC.d?.range.from === "2026-09-01" && sC.d.range.to === "2026-09-30");
check("8. Oldingi davr bir xil uzunlikda", ov.d?.prevRange.days === 30 && s7.d?.prevRange.days === 7);

// 9. Menyu va modullar
const modsBefore = (await sup.req("/api/super/modules")).d.modules;
const original = Object.fromEntries(modsBefore.map((m) => [m.key, m.state]));
const off = await sup.req("/api/super/modules", { method: "POST", body: { modules: { ...original, finance: { menu: false, api: false }, methodology: { menu: false, api: false } } } });
const me1 = await admin.req("/api/modules/me");
const fin = me1.d?.modules.find((m) => m.key === "finance");
check("9. Modul o'chirildi — admin uchun menyu/API yopiq", off.d?.ok && fin && !fin.menu && !fin.api);
const dataA = await admin.req("/api/data");
check("9. O'chirilgan «Moliya» ma'lumoti admin javobida yo'q", dataA.d?.ok && !("finance" in (dataA.d.data || {})));
const metA = await admin.req("/api/methodology");
check("9. O'chirilgan «Metodologiya» API → 403 (URL orqali ham)", metA.status === 403 && metA.d?.code === "module-disabled");
const meS = await sup.req("/api/modules/me");
check("9. Super Admin o'zini bloklamaydi (unda hammasi ochiq)", meS.d?.modules.every((m) => m.api && m.menu));
const dataS = await sup.req("/api/data");
check("9. Ma'lumot o'chirilmagan (Super Admin moliyani ko'radi)", dataS.d?.ok && "finance" in (dataS.d.data || {}));
await sup.req("/api/super/modules", { method: "POST", body: { modules: original } });
const me2 = await admin.req("/api/modules/me");
check("9. Qayta yoqildi — asl holat tiklandi", me2.d?.modules.every((m) => JSON.stringify({ menu: m.menu, api: m.api }) === JSON.stringify(original[m.key])));

// 10. Admin yaratish (login+parolni Super Admin beradi) va parolni almashtirish
const tUser = "itest_admin_" + Date.now().toString(36);
const noPw = await sup.req("/api/super/admins", { method: "POST", body: { username: tUser, firstName: "Sinov", lastName: "Admin" } });
check("10. Parolsiz admin yaratilmaydi", noPw.status === 400);
const cr = await sup.req("/api/super/admins", { method: "POST", body: { username: tUser, firstName: "Sinov", lastName: "Admin", password: "BoshParol2026" } });
check("10. Yangi admin login+parol bilan yaratildi (havolasiz)", cr.d?.ok && !cr.d.reset && !JSON.stringify(cr.d).includes("BoshParol2026"), cr.d?.error);
const tc0 = new Client();
check("10. Berilgan parol bilan kirish ishlaydi", (await tc0.login(tUser, "BoshParol2026")).d?.ok);
const tid = cr.d?.account?.id;
const sp = await sup.req(`/api/super/admins/${tid}/password`, { method: "POST", body: { password: "YangiParol2026" } });
check("10. Super Admin parolni almashtirdi", sp.d?.ok, sp.d?.error);
check("10. Eski sessiya yopildi", (await tc0.req("/api/kv?keys=x")).status === 401);
check("10. Eski parol ishlamaydi", !(await new Client().login(tUser, "BoshParol2026")).d?.ok);
const tc = new Client();
check("10. Yangi parol bilan kirish ishlaydi", (await tc.login(tUser, "YangiParol2026")).d?.ok);
// Bloklash sessiyani darhol bekor qiladi
await sup.req(`/api/super/admins/${tid}/status`, { method: "POST", body: { status: "disabled" } });
check("10. Bloklangan admin sessiyasi darhol yopildi", (await tc.req("/api/kv?keys=x")).status === 401);
const del = await sup.req("/api/admin/accounts/delete", { method: "POST", body: { id: tid } });
check("10. Sinov admini o'chirildi (tozalash)", del.d?.ok);

// 2FA (Super Admin) — yoqib, kod bilan kirib, o'chiramiz
const st = await sup.req("/api/super/me/2fa/setup", { method: "POST", body: { password: S.p } });
const en = st.d?.ok && (await sup.req("/api/super/me/2fa/enable", { method: "POST", body: { code: totpNow(st.d.secret) } }));
check("2FA. yoqildi", en?.d?.ok, en?.d?.error || st.d?.error);
const c2 = new Client();
const noOtp = await c2.login(S.u, S.p);
check("2FA. kodsiz kirish → otp-required", noOtp.status === 401 && noOtp.d?.code === "otp-required");
const wrongOtp = await c2.login(S.u, S.p, "000000");
check("2FA. xato kod → otp-invalid", wrongOtp.d?.code === "otp-invalid");
const withOtp = await c2.login(S.u, S.p, totpNow(st.d.secret, Date.now() + 30000));
check("2FA. to'g'ri kod bilan kiradi", withOtp.d?.ok);
// Bir kod qayta ishlatilmaydi — keyingi 30 soniyalik qadamni kutamiz
await new Promise((r) => setTimeout(r, 31000));
const dis = await sup.req("/api/super/me/2fa/disable", { method: "POST", body: { password: S.p, otp: totpNow(st.d.secret, Date.now() + 30000) } });
check("2FA. qayta tasdiqlash bilan o'chirildi", dis.d?.ok, dis.d?.error);
await c2.req("/api/auth/logout", { method: "POST", body: {} });

// 11. Audit jurnali (yozuvlar 2 soniyalik bufer bilan yoziladi)
await new Promise((r) => setTimeout(r, 2500));
const act = await sup.req(`/api/super/activity?from=${new Date(Date.now() - 3600_000).toISOString()}&limit=200`);
const evs = new Set((act.d?.events || []).map((e) => e.event));
check(
  "11. Audit: kirish, modul, admin, parol, ruxsatsiz urinish yozilgan",
  ["auth.login.success", "super.modules.update", "super.admin.create", "auth.password.reset_completed", "authz.super_denied", "super.2fa.enabled", "module.api_denied"].every((e) => evs.has(e)),
  [...evs].slice(0, 12).join(", "),
);
const leak = JSON.stringify(act.d || {});
check("11. Jurnalda parol/token yo'q", !leak.includes(S.p) && !leak.includes(A.p) && !leak.includes(token));

// 12. Eksport
const csv = await sup.req("/api/super/reports/teachers?period=30&format=csv", { raw: true });
const csvTxt = await csv.text();
check("12. CSV eksport (davr, manba, usul, vaqt bilan)", csv.status === 200 && /Davr/.test(csvTxt) && /manbasi/.test(csvTxt) && /usuli/.test(csvTxt) && /Eksport qilingan vaqt/.test(csvTxt));
const xl = await sup.req("/api/super/reports/groups?period=90&format=xlsx", { raw: true });
const xlb = Buffer.from(await xl.arrayBuffer());
check("12. Excel (XLSX) eksport — ZIP fayl", xl.status === 200 && xlb[0] === 0x50 && xlb[1] === 0x4b, `${xlb.length} bayt`);
const pdf = await sup.req("/api/super/reports/overview?period=30&format=pdf", { raw: true });
const pdfb = Buffer.from(await pdf.arrayBuffer());
check("12. PDF eksport", pdf.status === 200 && pdfb.slice(0, 5).toString() === "%PDF-" && pdfb.slice(-6).toString().includes("%%EOF"), `${pdfb.length} bayt`);
await new Promise((r) => setTimeout(r, 2500));
const act2 = await sup.req(`/api/super/activity?from=${new Date(Date.now() - 600_000).toISOString()}&category=Eksport`);
check("12. Eksport jurnalga yozildi", (act2.d?.events || []).some((e) => e.event === "report.export"));
for (const k of ["attendance", "homework", "students", "admins", "system"]) {
  const r = await sup.req(`/api/super/reports/${k}?period=30&format=json`);
  check(`12. «${k}» hisoboti`, r.d?.ok && r.d.report.columns.length > 0);
}

// 14. Xatolarni boshqarish
check("14. Noma'lum bo'lim → 404 JSON", (await sup.req("/api/super/data/xyz")).status === 404);
check("14. Noto'g'ri id → 404", (await sup.req("/api/super/admins/zzz")).status === 404);
check("14. Noto'g'ri hisobot formati → 400", (await sup.req("/api/super/reports/overview?format=exe")).status === 400);
const ra = await sup.req("/api/super/backups/restore", { method: "POST", body: { id: "0".repeat(24), confirm: "TIKLASH", password: "noto'g'ri" } });
check("14. Tiklash xato parol bilan rad etildi (sessiya saqlanadi)", ra.status === 403 && ra.d?.code === "reauth-failed");
const mon = await sup.req("/api/super/monitor");
check("14. Monitoring: backend va baza holati", mon.d?.ok && mon.d.db.ok === true && typeof mon.d.db.pingMs === "number");

// 13. Chiqish sessiyani bekor qiladi
await admin.req("/api/auth/logout", { method: "POST", body: {} });
const ref = await admin.req("/api/auth/refresh", { method: "POST", body: {} });
check("13. Logout'dan keyin sessiya yangilanmaydi", ref.d?.ok === false);
await sup.req("/api/auth/logout", { method: "POST", body: {} });
const ref2 = await sup.req("/api/auth/refresh", { method: "POST", body: {} });
check("13. Super Admin logout ham sessiyani yopadi", ref2.d?.ok === false);

console.log(results.join("\n"));
console.log(`\nNatija: ${pass} o'tdi, ${fail} xato`);
process.exit(fail ? 1 : 0);
