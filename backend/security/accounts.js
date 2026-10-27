/**
 * security/accounts.js — Hisoblar ombori (yagona haqiqat manbai).
 *
 * ⚠️ Eng katta o'zgarish: ILGARI parollar `users` kolleksiyasida OCHIQ MATNDA
 * turardi va `GET /api/users` ularni ISTALGAN ODAMGA qaytarardi. Ya'ni saytni
 * ochgan har kim admin parolini o'qib olardi. Endi:
 *
 *   • Parol faqat scrypt xeshi ko'rinishida `accounts` kolleksiyasida turadi.
 *   • Hech bir API parol yoki xeshni tashqariga chiqarmaydi.
 *   • Kirish faqat serverda tekshiriladi (`/api/auth/login`).
 *   • Eski hisoblar birinchi muvaffaqiyatli kirishda avtomatik ko'chiriladi.
 */
import { ObjectId } from "mongodb";
import {
  hashPassword,
  verifyPassword,
  verifyLegacyPassword,
  fakeVerify,
  checkPasswordStrength,
  sha256,
} from "./crypto.js";
import { CONFIG } from "./config.js";
import { safeUsername } from "./sanitize.js";
import { audit } from "./audit.js";
import { cacheGet, cacheSet, invalidateAccount } from "./cache.js";

export const COL = "accounts";

/** Portal rollari ↔ ichki rol nomlari. */
export const ROLES = { ADMIN: "admin", MENTOR: "mentor", STUDENT: "student" };
/**
 * Super Admin — alohida rol. Bazada `role: "superadmin"` bo'lib turadi, lekin
 * so'rovda (`req.user`) u admin huquqlarini ham oladi (`role: "admin"`,
 * `isSuper: true`) — mavjud admin tekshiruvlari buzilmaydi, Super Admin
 * API'lari esa faqat `isSuper` ni tekshiradi. ROLES ichiga QO'SHILMAGAN:
 * oddiy marshrutlar bu rolni bilmasligi kerak.
 */
export const SUPERADMIN_ROLE = "superadmin";
export const isAdminLike = (role) => role === ROLES.ADMIN || role === SUPERADMIN_ROLE;
const LEGACY_ROLE_TO_ROLE = {
  "Super Admin": ROLES.ADMIN,
  Admin: ROLES.ADMIN,
  Mentor: ROLES.MENTOR,
  Talaba: ROLES.STUDENT,
  Student: ROLES.STUDENT,
};
const ROLE_TO_LEGACY = {
  [ROLES.ADMIN]: "Super Admin",
  // Portal kodi "Super Admin" ni admin deb biladi (tarixiy nom). Super Admin
  // ham admin portalini ocha oladi — farqi `role`/`isSuper` da.
  [SUPERADMIN_ROLE]: "Super Admin",
  [ROLES.MENTOR]: "Mentor",
  [ROLES.STUDENT]: "Talaba",
};
export const toLegacyRole = (role) => ROLE_TO_LEGACY[role] || "Talaba";
export const fromLegacyRole = (r) => LEGACY_ROLE_TO_ROLE[String(r || "").trim()] || null;

let _getDb = null;
export function initAccounts(getDb) {
  _getDb = getDb;
}
const db = () => _getDb();

/**
 * Bazada qolgan eski parollarni (tuzsiz sha256 yoki ochiq matn) scrypt ichiga
 * o'raydi. Foydalanuvchi paroli o'zgarmaydi — u avvalgidek kiraveradi, lekin
 * bazada zaif xesh qolmaydi. Har ishga tushishda chaqiriladi; ishi bo'lmasa
 * hech narsa qilmaydi.
 */
export async function wrapLegacyHashes() {
  const col = db().collection(COL);
  const list = await col
    .find({ legacyPassword: { $nin: [null, ""] } }, { projection: { _id: 1, username: 1, legacyPassword: 1, passwordHash: 1 } })
    .toArray();
  let n = 0;
  for (const a of list) {
    const s = String(a.legacyPassword);
    const set = { legacyPassword: null };
    // Haqiqiy scrypt paroli bor bo'lsa — eski nusxa shunchaki o'chiriladi
    if (!a.passwordHash) set.wrappedHash = await hashPassword(/^[a-f0-9]{64}$/i.test(s) ? s.toLowerCase() : sha256(s));
    await col.updateOne({ _id: a._id, legacyPassword: a.legacyPassword }, { $set: set });
    invalidateAccount(String(a._id), a.username);
    n++;
  }
  if (n) console.log(`🔐  ${n} ta eski parol scrypt ichiga o'raldi`);
  return n;
}

export async function ensureAccountIndexes() {
  const col = db().collection(COL);
  await col.createIndex({ username: 1 }, { unique: true, name: "username_unique" });
  await col.createIndex({ role: 1 });
  await col.createIndex({ studentId: 1 }, { sparse: true });
  await col.createIndex({ mentorName: 1 }, { sparse: true });
  await col.createIndex({ "resetToken.hash": 1 }, { sparse: true });
}

/** Tashqariga chiqadigan xavfsiz ko'rinish — parol/xesh hech qachon yo'q. */
export function publicView(acc) {
  if (!acc) return null;
  return {
    id: String(acc._id),
    username: acc.username,
    name: acc.name || acc.username,
    role: acc.role,
    legacyRole: toLegacyRole(acc.role),
    mentorName: acc.mentorName || null,
    studentId: acc.studentId ?? null,
    studentName: acc.studentName || null,
    status: acc.status || "active",
    isSuper: acc.role === SUPERADMIN_ROLE,
    twoFactor: !!(acc.totp && acc.totp.enabled),
    mustChangePassword: !!acc.mustChangePassword,
    passwordIsLegacy: !!(acc.legacyPassword || acc.wrappedHash),
    lastLoginAt: acc.lastLoginAt || null,
    createdAt: acc.createdAt || null,
  };
}

export async function findByUsername(username) {
  const u = safeUsername(username);
  if (!u) return null;
  return db().collection(COL).findOne({ username: u });
}

export async function findById(id) {
  if (typeof id !== "string" || !/^[a-f0-9]{24}$/i.test(id)) return null;
  return db().collection(COL).findOne({ _id: new ObjectId(id) });
}

/**
 * findById ning keshlangan varianti — `requireAuth` har so'rovda shuni
 * chaqiradi. Hisob o'zgarganda kesh darhol tozalanadi (invalidate), shuning
 * uchun bloklangan foydalanuvchi keshdan foyda ko'rmaydi.
 */
export async function findByIdCached(id) {
  if (typeof id !== "string" || !/^[a-f0-9]{24}$/i.test(id)) return null;
  const key = "acc:" + id;
  const hit = cacheGet(key);
  if (hit !== undefined) return hit;
  const acc = await db().collection(COL).findOne({ _id: new ObjectId(id) });
  cacheSet(key, acc);
  return acc;
}

/**
 * Hisob yaratish yoki yangilash.
 * @param {object} p
 * @param {string} p.username
 * @param {string} p.role
 * @param {string} [p.password]        Berilmasa — parol o'zgarmaydi
 * @param {string} [p.legacyPassword]  Ko'chirish uchun eski ochiq/sha256 parol
 */
export async function upsertAccount(p) {
  const username = safeUsername(p.username);
  if (!username) return { ok: false, error: "Login yaroqsiz (3–64 belgi: a-z 0-9 . _ - @ +)" };
  // Super Admin rolini faqat server ichidagi bootstrap beradi (allowSuper)
  const role =
    p.role === SUPERADMIN_ROLE && p.allowSuper === true
      ? SUPERADMIN_ROLE
      : Object.values(ROLES).includes(p.role)
        ? p.role
        : fromLegacyRole(p.role);
  if (!role) return { ok: false, error: "Rol noto'g'ri" };

  // Mavjud Super Admin hisobini oddiy yo'l bilan (admin panelidan) qayta
  // yozib, rolini tushirib yuborish yoki parolini almashtirish mumkin emas.
  const existing = await db().collection(COL).findOne({ username }, { projection: { role: 1 } });
  if (existing && existing.role === SUPERADMIN_ROLE && p.allowSuper !== true)
    return { ok: false, code: "protected-account", error: "Bu hisob himoyalangan" };
  if (existing && existing.role !== SUPERADMIN_ROLE && existing.role !== role && role !== SUPERADMIN_ROLE && p.allowRoleChange !== true && isAdminLike(existing.role) !== isAdminLike(role))
    return { ok: false, code: "role-conflict", error: "Bu login boshqa rol uchun band" };

  const now = new Date();
  const set = {
    username,
    role,
    name: String(p.name || username).slice(0, 200),
    mentorName: p.mentorName ? String(p.mentorName).slice(0, 200) : null,
    studentId: Number.isFinite(Number(p.studentId)) ? Number(p.studentId) : null,
    studentName: p.studentName ? String(p.studentName).slice(0, 200) : null,
    status: p.status === "disabled" ? "disabled" : "active",
    updatedAt: now,
  };

  if (p.password) {
    const strength = checkPasswordStrength(p.password, {
      minLength: CONFIG.passwordMinLength,
      username,
      name: set.name,
    });
    if (!strength.ok) return { ok: false, error: strength.error, code: "weak-password" };
    set.passwordHash = await hashPassword(p.password);
    set.passwordChangedAt = now;
    set.legacyPassword = null;
    set.wrappedHash = null;
    set.mustChangePassword = p.mustChangePassword === true;
  } else if (p.legacyPassword) {
    // Ko'chirish rejimi: eski parol ochiq yoki tuzsiz sha256 ko'rinishida
    // kelgan. U bazada shu holicha saqlanmaydi: sha256 ham scrypt ichiga
    // o'raladi (wrappedHash = scrypt(sha256(parol))). Baza sizib ketsa ham
    // parolni tez tanlab bo'lmaydi; birinchi kirishda oddiy scrypt'ga o'tadi.
    const legacyHex = /^[a-f0-9]{64}$/i.test(p.legacyPassword)
      ? String(p.legacyPassword).toLowerCase()
      : sha256(p.legacyPassword);
    set.wrappedHash = await hashPassword(legacyHex);
    set.legacyPassword = null;
    // Admin yangi parol berdi — eski scrypt xeshi o'chiriladi, aks holda
    // ESKI parol ham ishlayverardi.
    set.passwordHash = null;
    // Faqat o'zi parolini almashtira oladigan rol uchun majburiy almashtirish.
    set.mustChangePassword = CONFIG.selfPasswordChangeRoles.includes(role);
  }

  // Yangi parol berildi — oldingi xato urinishlar va blok ham tozalanadi,
  // aks holda foydalanuvchi to'g'ri parol bilan ham kira olmay turardi.
  if (p.password || p.legacyPassword) {
    set.failedAttempts = 0;
    set.lockedUntil = null;
  }
  const onInsert = { createdAt: now, tokenVersion: 1, passwordHistory: [] };
  if (!("failedAttempts" in set)) Object.assign(onInsert, { failedAttempts: 0, lockedUntil: null });

  invalidateAccount(null, username);
  const r = await db()
    .collection(COL)
    .findOneAndUpdate(
      { username },
      {
        $set: set,
        $setOnInsert: onInsert,
      },
      { upsert: true, returnDocument: "after" },
    );
  return { ok: true, account: r.value || r };
}

/**
 * Hisob loginini almashtirish — paroli (xeshi) o'zgarmay qoladi.
 * Admin mentor/talabaning loginini yangi parol kiritmasdan o'zgartirganda
 * kerak: ilgari yangi login PAROLSIZ yaratilib, eskisi o'chirilardi va
 * foydalanuvchi umuman kira olmay qolardi.
 */
export async function renameAccount(oldUsername, newUsername, role) {
  const from = safeUsername(oldUsername);
  const to = safeUsername(newUsername);
  if (!from || !to || from === to) return { ok: false, error: "Login yaroqsiz" };
  const col = db().collection(COL);
  const old = await col.findOne({ username: from });
  if (!old || (role && old.role !== role)) return { ok: false, error: "Eski hisob topilmadi" };
  if (await col.findOne({ username: to })) return { ok: false, code: "username-taken", error: "Bu login band" };
  await col.updateOne({ _id: old._id }, { $set: { username: to, updatedAt: new Date() } });
  invalidateAccount(String(old._id), from);
  invalidateAccount(String(old._id), to);
  return { ok: true };
}

export async function listAccounts(filter = {}) {
  const q = {};
  if (filter.role && Object.values(ROLES).includes(filter.role)) q.role = filter.role;
  const docs = await db().collection(COL).find(q).sort({ role: 1, username: 1 }).toArray();
  return docs.map(publicView);
}

export async function setStatus(id, status) {
  const acc = await findById(id);
  if (!acc) return { ok: false, error: "Hisob topilmadi" };
  await db()
    .collection(COL)
    .updateOne(
      { _id: acc._id },
      {
        $set: { status: status === "disabled" ? "disabled" : "active", updatedAt: new Date() },
        // O'chirilgan hisobning barcha tokenlari darhol kuchini yo'qotadi
        $inc: { tokenVersion: status === "disabled" ? 1 : 0 },
      },
    );
  invalidateAccount(id, acc.username);
  return { ok: true };
}

export async function deleteAccount(id) {
  const acc = await findById(id);
  if (!acc) return { ok: false, error: "Hisob topilmadi" };
  if (acc.role === SUPERADMIN_ROLE) return { ok: false, code: "protected-account", error: "Super Admin hisobini o'chirib bo'lmaydi" };
  if (acc.role === ROLES.ADMIN) {
    const admins = await db().collection(COL).countDocuments({ role: { $in: [ROLES.ADMIN, SUPERADMIN_ROLE] }, status: { $ne: "disabled" } });
    if (admins <= 1) return { ok: false, error: "Oxirgi admin hisobini o'chirib bo'lmaydi" };
  }
  await db().collection(COL).deleteOne({ _id: acc._id });
  invalidateAccount(id, acc.username);
  return { ok: true, account: publicView(acc) };
}

// ─── Kirish ───────────────────────────────────────────────────────────────────

const LOCK_MSG = (sec) =>
  `Hisob vaqtincha bloklandi. ${Math.ceil(sec / 60)} daqiqadan keyin urinib ko'ring.`;

/**
 * Parolni tekshiradi. Foydalanuvchi topilmasa ham bir xil vaqt ketadi
 * (user enumeration'ga qarshi) va xato matni bir xil bo'ladi.
 *
 * @returns {Promise<{ok:true, account:object, upgraded?:boolean} |
 *                   {ok:false, error:string, code:string, retryAfter?:number}>}
 */
export async function authenticate(username, password, req) {
  const u = safeUsername(username);
  const pw = String(password ?? "");
  const GENERIC = { ok: false, code: "invalid-credentials", error: "Login yoki parol noto'g'ri" };

  if (!u || !pw) {
    await fakeVerify();
    return GENERIC;
  }

  const acc = await db().collection(COL).findOne({ username: u });
  if (!acc) {
    await fakeVerify(); // vaqt bo'yicha farq bo'lmasin
    await audit("auth.login.unknown_user", { req, meta: { username: u }, severity: "warn" });
    return GENERIC;
  }

  if (acc.status === "disabled") {
    await fakeVerify();
    await audit("auth.login.disabled", { req, actor: { sub: String(acc._id), username: u }, severity: "warn" });
    return { ok: false, code: "account-disabled", error: "Hisob faol emas. Administratorga murojaat qiling." };
  }

  const now = Date.now();
  if (acc.lockedUntil && new Date(acc.lockedUntil).getTime() > now) {
    const retryAfter = Math.ceil((new Date(acc.lockedUntil).getTime() - now) / 1000);
    await audit("auth.login.locked", { req, actor: { sub: String(acc._id), username: u }, severity: "warn" });
    return { ok: false, code: "account-locked", error: LOCK_MSG(retryAfter), retryAfter };
  }

  let ok = false;
  let upgraded = false;

  if (acc.passwordHash) ok = await verifyPassword(pw, acc.passwordHash);

  // Eski parol scrypt ichiga o'ralgan: scrypt(sha256(parol))
  if (!ok && !acc.passwordHash && acc.wrappedHash) {
    ok = await verifyPassword(sha256(pw), acc.wrappedHash);
    if (ok) {
      upgraded = true;
      (async () => {
        try {
          const hash = await hashPassword(pw);
          await db()
            .collection(COL)
            .updateOne(
              { _id: acc._id, wrappedHash: acc.wrappedHash },
              { $set: { passwordHash: hash, wrappedHash: null, legacyPassword: null, passwordChangedAt: new Date() } },
            );
          invalidateAccount(String(acc._id), acc.username);
        } catch (e) {
          console.warn("⚠️  Parolni ko'chirish bajarilmadi:", e.message);
        }
      })();
      audit("auth.password.upgraded", { req, actor: { sub: String(acc._id), username: u } });
    }
  }

  if (!ok && acc.legacyPassword && CONFIG.allowLegacyPasswords) {
    ok = verifyLegacyPassword(pw, acc.legacyPassword);
    if (ok) {
      // Muvaffaqiyatli kirish — parol scrypt'ga ko'chiriladi. Bu FONDA
      // bajariladi: foydalanuvchi xeshlash va yozishni kutib turmasin.
      // Ko'chirish bajarilmay qolsa ham eski parol ishlayveradi, keyingi
      // kirishda yana urinib ko'riladi.
      upgraded = true;
      (async () => {
        try {
          const hash = await hashPassword(pw);
          await db()
            .collection(COL)
            .updateOne(
              { _id: acc._id },
              { $set: { passwordHash: hash, legacyPassword: null, passwordChangedAt: new Date() } },
            );
          invalidateAccount(String(acc._id), acc.username);
        } catch (e) {
          console.warn("⚠️  Parolni ko'chirish bajarilmadi:", e.message);
        }
      })();
      audit("auth.password.upgraded", { req, actor: { sub: String(acc._id), username: u } });
    }
  }

  if (!ok) {
    const failed = (acc.failedAttempts || 0) + 1;
    // ⚠️ Hisobni bloklash sukut bo'yicha O'CHIQ (CONFIG.lockAccountOnFailures).
    // Sabab: begona odam faqat sizning loginingizni bilsa kifoya edi — xato
    // parolni bir necha marta yozib, HAQIQIY egasini tizimdan uzib qo'yardi.
    // Endi blok noto'g'ri parol kiritgan QURILMAGA qo'yiladi (devices.js).
    const shouldLock = CONFIG.lockAccountOnFailures && failed >= CONFIG.maxFailedAttempts;
    invalidateAccount(String(acc._id), acc.username);
    // Hisoblagichni yozishni kutmaymiz — javob baribir "noto'g'ri parol".
    // (Yozuv fonda ketadi; bloklash mantiqi keyingi urinishda kuchga kiradi.)
    db()
      .collection(COL)
      .updateOne(
        { _id: acc._id },
        {
          $set: {
            failedAttempts: shouldLock ? 0 : failed,
            lockedUntil: shouldLock ? new Date(now + CONFIG.lockoutSec * 1000) : acc.lockedUntil || null,
            lastFailedAt: new Date(),
          },
        },
      )
      .catch((e) => console.warn("⚠️  Urinishlar hisoblagichi yozilmadi:", e.message));
    audit("auth.login.failed", {
      req,
      actor: { sub: String(acc._id), username: u, role: acc.role },
      meta: { attempt: failed, locked: shouldLock },
      severity: shouldLock ? "critical" : "warn",
    });
    if (shouldLock)
      return { ok: false, code: "account-locked", error: LOCK_MSG(CONFIG.lockoutSec), retryAfter: CONFIG.lockoutSec };
    return GENERIC;
  }

  // ⚙️ TEZLIK: ilgari bu yerda updateOne, keyin findOne — ikkita alohida
  // Atlas murojaati (~440 ms). findOneAndUpdate ikkalasini bitta murojaatda
  // bajaradi va yangilangan hujjatni qaytaradi.
  invalidateAccount(String(acc._id), acc.username);
  const r = await db()
    .collection(COL)
    .findOneAndUpdate(
      { _id: acc._id },
      { $set: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() } },
      { returnDocument: "after" },
    );
  const fresh = r?.value || r || acc;
  return { ok: true, account: fresh, upgraded };
}

/**
 * Admin o'z login va/yoki parolini yangilaydi — joriy parol so'ralmaydi
 * (so'rov baribir faqat kirgan admin sessiyasi bilan keladi).
 */
export async function updateOwnCredentials(accountId, { username, password }, req) {
  const acc = await findById(accountId);
  if (!acc) return { ok: false, error: "Hisob topilmadi" };

  let newUsername = null;
  if (username != null && String(username).trim() !== "") {
    newUsername = safeUsername(username);
    if (!newUsername) return { ok: false, error: "Login yaroqsiz (3–64 belgi: a-z 0-9 . _ - @ +)" };
    if (newUsername === acc.username) newUsername = null;
    else if (await db().collection(COL).findOne({ username: newUsername }))
      return { ok: false, code: "username-taken", error: "Bu login band — boshqasini tanlang" };
  }
  if (!newUsername && !password) return { ok: false, error: "Yangi login yoki parol kiriting" };

  // Avval parolni tekshiramiz — login yarim yo'lda o'zgarib qolmasin
  if (password) {
    const strength = checkPasswordStrength(password, { minLength: CONFIG.passwordMinLength });
    if (!strength.ok) return { ok: false, code: "weak-password", error: strength.error };
  }

  if (newUsername) {
    await db()
      .collection(COL)
      .updateOne({ _id: acc._id }, { $set: { username: newUsername, updatedAt: new Date() } });
    invalidateAccount(String(acc._id), acc.username);
    invalidateAccount(String(acc._id), newUsername);
    await audit("auth.username.changed", {
      req,
      actor: { sub: String(acc._id), username: acc.username, role: acc.role },
      target: { username: newUsername },
      severity: "warn",
    });
    acc.username = newUsername;
  }

  if (password) {
    const out = await applyNewPassword(acc, password, req, "auth.password.changed");
    if (!out.ok) return out;
  }
  return { ok: true };
}

/**
 * Admin tomonidan parolni tiklash — joriy parolsiz.
 *
 * `mustChangePassword` faqat O'ZI parolini almashtira oladigan rollarga
 * qo'yiladi. Talaba/mentor parolni almashtira olmaydi (siyosat: parol faqat
 * admin panelida o'zgaradi) — ularga bu bayroqni qo'yish tizimga kirishni
 * butunlay to'sib qo'yardi.
 */
export async function adminResetPassword(accountId, newPassword, req, actor) {
  const acc = await findById(accountId);
  if (!acc) return { ok: false, error: "Hisob topilmadi" };
  const mustChange = CONFIG.selfPasswordChangeRoles.includes(acc.role);
  const out = await applyNewPassword(acc, newPassword, req, "auth.password.admin_reset", actor, mustChange);
  return out;
}

async function applyNewPassword(acc, newPassword, req, event, actor = null, mustChange = false) {
  const strength = checkPasswordStrength(newPassword, {
    minLength: CONFIG.passwordMinLength,
    username: acc.username,
    name: acc.name,
  });
  if (!strength.ok) return { ok: false, code: "weak-password", error: strength.error };

  const hash = await hashPassword(newPassword);
  const history = [acc.passwordHash, ...(acc.passwordHistory || [])]
    .filter(Boolean)
    .slice(0, CONFIG.passwordHistory);

  await db()
    .collection(COL)
    .updateOne(
      { _id: acc._id },
      {
        $set: {
          passwordHash: hash,
          legacyPassword: null,
          wrappedHash: null,
          passwordHistory: history,
          passwordChangedAt: new Date(),
          mustChangePassword: mustChange,
          failedAttempts: 0,
          lockedUntil: null,
        },
        // Parol o'zgardi → barcha eski access tokenlar kuchsizlanadi
        $inc: { tokenVersion: 1 },
      },
    );
  invalidateAccount(String(acc._id), acc.username);

  await audit(event, {
    req,
    actor: actor || { sub: String(acc._id), username: acc.username, role: acc.role },
    target: { username: acc.username },
    severity: "warn",
  });
  return { ok: true, tokenVersionBumped: true };
}

/** Barcha sessiyalarni bekor qilish uchun token versiyasini oshirish. */
export async function bumpTokenVersion(accountId) {
  const acc = await findById(accountId);
  if (!acc) return false;
  await db().collection(COL).updateOne({ _id: acc._id }, { $inc: { tokenVersion: 1 } });
  invalidateAccount(String(acc._id), acc.username);
  return true;
}

export async function countAdmins() {
  return db().collection(COL).countDocuments({ role: ROLES.ADMIN, status: { $ne: "disabled" } });
}

/** Faqat server ichida: hisobga parolni o'rnatish (bootstrap / tiklash havolasi). */
export async function setPasswordInternal(accountId, newPassword, req, event, actor = null) {
  const acc = await findById(accountId);
  if (!acc) return { ok: false, error: "Hisob topilmadi" };
  return applyNewPassword(acc, newPassword, req, event, actor, false);
}
