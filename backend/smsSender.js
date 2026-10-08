/**
 * EduManage CRM — SMS yuborish (Eskiz.uz)
 * ============================================================================
 * Qarzdorlar sahifasidagi "📱 SMS" tugmasi shu modul orqali ishlaydi.
 *
 * Nega SMS?
 * ---------
 * Telegram BOTI foydalanuvchiga birinchi bo'lib yoza OLMAYDI — talaba botni
 * o'zi ishga tushirmaguncha Telegram xabarni rad etadi ("bot can't initiate
 * conversation with a user"). Talabadan hech narsa talab qilmasdan xabar
 * yetkazishning yagona yo'li — uning CRM da allaqachon turgan telefon
 * raqamiga SMS yuborish.
 *
 * Sozlash (bir marta)
 * -------------------
 *   1. eskiz.uz da hisob oching, "SMS" bo'limidan API uchun login/parol oling.
 *   2. `backend/.env` (Render da — Environment) ga yozing:
 *
 *          ESKIZ_EMAIL=sizning@email.uz
 *          ESKIZ_PASSWORD=api_paroli
 *          ESKIZ_FROM=4546          # ixtiyoriy, standart nashr etuvchi nomi
 *
 *      ESKIZ_FROM — bu erkin matn EMAS, Eskiz tasdiqlagan nickname. 4546 —
 *      hammaga ochiq test raqami. O'z nomingiz (masalan UFQ) bilan yuborish
 *      uchun kabinetdagi "Nikneymlar" bo'limida ro'yxatdan o'tkazing va
 *      tasdiqlangach shu yerga yozing; tasdiqlanmagan nom bilan SMS ketmaydi.
 *
 *   3. Serverni qayta ishga tushiring. Holat: GET /api/notify/status.
 *
 * ⚠️ ESKIZ MODERATSIYASI. Eskiz ixtiyoriy matnni yubormaydi: xabar matni
 * oldindan tasdiqlangan SHABLONGA mos bo'lishi shart (kabinetdagi "SMS
 * shablonlari" bo'limi). Shuning uchun Qarzdorlar sahifasidagi standart matn
 * o'zgaruvchi qismlarni `{ism}` / `{guruh}` / `{qarz}` bilan almashtiradi —
 * shu matnni Eskiz kabinetida bir marta tasdiqlatib oling. Tasdiqlanmagan
 * matn `message is not found in template` xatosi bilan qaytadi va biz uni
 * yashirmaymiz — javobda o'sha xato ko'rinadi.
 *
 * Token 30 kun amal qiladi va shu yerda keshlanadi; 401 qaytsa avtomatik
 * qayta login qilinadi (bir marta — cheksiz halqaga tushib qolmaslik uchun).
 */

const BASE = "https://notify.eskiz.uz/api";
const MIN_INTERVAL_MS = 120; // provayderni bo'g'ib qo'ymaslik uchun

let cachedToken = "";
let tokenAt = 0;
let queueTail = Promise.resolve();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const creds = () => ({
  email: (process.env.ESKIZ_EMAIL || "").trim(),
  password: (process.env.ESKIZ_PASSWORD || "").trim(),
  from: (process.env.ESKIZ_FROM || "4546").trim(),
});

export function smsReady() {
  const c = creds();
  return !!c.email && !!c.password && !c.password.includes("your_");
}

/**
 * Telefon raqamini Eskiz kutgan ko'rinishga keltiradi: 998XXXXXXXXX.
 * CRM da raqamlar "+998 90 123 45 67" kabi turli ko'rinishda saqlangan,
 * shuning uchun raqamlardan boshqasi tashlab yuboriladi.
 */
export function normalizePhone(raw) {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("998")) return d;
  if (d.length === 9) return "998" + d; // "901234567"
  if (d.length === 13 && d.startsWith("9998")) return d.slice(1); // "+9 998..."
  return null;
}

async function login() {
  const c = creds();
  const fd = new FormData();
  fd.append("email", c.email);
  fd.append("password", c.password);
  const r = await fetch(`${BASE}/auth/login`, { method: "POST", body: fd });
  const data = await r.json().catch(() => ({}));
  const tok = data?.data?.token;
  if (!tok)
    throw new Error(
      `Eskiz login xatosi: ${data?.message || `HTTP ${r.status}`}`,
    );
  cachedToken = tok;
  tokenAt = Date.now();
  return tok;
}

async function token(force) {
  if (!smsReady()) throw new Error("ESKIZ_EMAIL / ESKIZ_PASSWORD sozlanmagan");
  // 25 kun — Eskiz tokeni 30 kun yashaydi, muddati tugashini kutib
  // o'tirmaymiz.
  if (force || !cachedToken || Date.now() - tokenAt > 25 * 864e5)
    return await login();
  return cachedToken;
}

/** Chiquvchi SMS lar ketma-ket ketadi — provayder limitiga urilmaslik uchun. */
function enqueue(fn) {
  const result = queueTail.then(async () => {
    try {
      return await fn();
    } finally {
      await sleep(MIN_INTERVAL_MS);
    }
  });
  queueTail = result.catch(() => {});
  return result;
}

async function post(path, fields, tok) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
  const r = await fetch(BASE + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + tok },
    body: fd,
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

/**
 * Bitta raqamga SMS yuboradi.
 * Natija ROSTAKAM qaytariladi — provayder rad etsa, sababi bilan.
 */
export async function sendSms(phone, text) {
  if (!smsReady())
    return {
      ok: false,
      code: "no-config",
      error: "SMS xizmati sozlanmagan (ESKIZ_EMAIL / ESKIZ_PASSWORD)",
    };

  const mobile = normalizePhone(phone);
  if (!mobile)
    return {
      ok: false,
      code: "bad-phone",
      error: `Telefon raqami noto'g'ri yoki kiritilmagan${phone ? ` ("${phone}")` : ""}`,
    };

  const body = String(text || "").trim();
  if (!body) return { ok: false, error: "Xabar matni bo'sh" };

  const c = creds();
  return await enqueue(async () => {
    try {
      let tok = await token();
      let res = await post(
        "/message/sms/send",
        { mobile_phone: mobile, message: body, from: c.from },
        tok,
      );

      // Token muddati tugagan bo'lsa — bir marta qayta login qilib ko'ramiz.
      if (res.status === 401) {
        tok = await token(true);
        res = await post(
          "/message/sms/send",
          { mobile_phone: mobile, message: body, from: c.from },
          tok,
        );
      }

      const d = res.data || {};
      // Eskiz muvaffaqiyatda {id, status:"waiting"} qaytaradi.
      if (res.status >= 200 && res.status < 300 && d.id)
        return { ok: true, messageId: String(d.id), phone: mobile, status: d.status };

      // Moderatsiyadan o'tmagan matn eng ko'p uchraydigan sabab — uni
      // alohida belgilaymiz, admin nima qilishni bilsin.
      const msg =
        (typeof d.message === "string" && d.message) ||
        JSON.stringify(d.message || d) ||
        `HTTP ${res.status}`;
      // Eskiz yangi hisobni TEST rejimida ochadi: faqat uchta belgilangan
      // matnni yuborishga ruxsat beradi. Bu eng ko'p uchraydigan "nega
      // ketmadi" sababi, shuning uchun alohida tushuntiriladi.
      if (/для теста|test.{0,20}(matn|text|текст)/i.test(msg))
        return {
          ok: false,
          code: "test-mode",
          error:
            "Eskiz hisobingiz hali TEST rejimida — ixtiyoriy matn yuborilmaydi. " +
            "Kabinetda hisobni faollashtiring va matnni \"SMS shablonlari\" " +
            "bo'limida tasdiqlatib oling. (Eskiz javobi: " + msg + ")",
        };

      // Tasdiqlanmagan "from" (nickname) — ESKIZ_FROM o'zgartirilganda eng
      // ko'p uchraydigan xato. Umumiy provayder xatosi ostida yashirinib
      // qolmasin: nima qilish kerakligi darrov ko'rinsin.
      if (/nick|отправител|sender/i.test(msg))
        return {
          ok: false,
          code: "bad-from",
          error:
            `"${c.from}" nickname Eskiz da tasdiqlanmagan. Kabinetdagi ` +
            `"Nikneymlar" bo'limida uni ro'yxatdan o'tkazing yoki ESKIZ_FROM ` +
            `ni 4546 ga qaytaring. (Eskiz javobi: ${msg})`,
        };

      const notTemplate = /template|moder|шаблон/i.test(msg);
      return {
        ok: false,
        code: notTemplate ? "not-template" : "provider",
        error: notTemplate
          ? `Eskiz matnni tasdiqlamagan: ${msg}. Kabinetdagi "SMS shablonlari" bo'limida shu matnni tasdiqlatib oling.`
          : msg,
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
}

/** Hisobdagi qolgan balans — statusda ko'rsatiladi. */
async function balance(tok) {
  try {
    const r = await fetch(`${BASE}/user/get-limit`, {
      headers: { Authorization: "Bearer " + tok },
    });
    const d = await r.json().catch(() => ({}));
    return d?.data?.balance ?? null;
  } catch (e) {
    return null;
  }
}

/** Sozlanganmi va login ishlaydimi — /api/notify/status uchun. */
export async function smsStatus() {
  if (!smsReady()) return "⚠️ sozlanmagan (ESKIZ_EMAIL / ESKIZ_PASSWORD)";
  try {
    const tok = await token();
    const b = await balance(tok);
    return b == null ? "✅ ulangan" : `✅ ulangan (balans: ${b})`;
  } catch (e) {
    return `❌ ${e.message}`;
  }
}
