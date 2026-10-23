# 👑 Super Admin paneli

CRM ichida ikkita alohida boshqaruv paneli bor:

| | Oddiy Admin | Super Admin |
|---|---|---|
| Kirish | `/admin/` (Vercel: admin domeni) | o'sha login sahifasi → avtomatik `/admin/super-admin/` (Vercel: `/super-admin/`) |
| Bazadagi rol | `admin` | `superadmin` |
| Imkoniyat | mavjud CRM (Super Admin cheklovlari doirasida) | analitika, reyting, monitoring, jurnal, hisobotlar, zaxira, sozlamalar + CRM paneli (`?crm=1`) |

Ikkala panel bitta backend va bazadan foydalanadi. Barcha tekshiruvlar **serverda**: `/api/super/*` har so'rovda bazadagi hisob roli bo'yicha tekshiriladi; oddiy admin token bilan kelsa — `403` va jurnalga `authz.super_denied`.

## Hisoblar va muhit o'zgaruvchilari

Parollar kodda ham, gitda ham yo'q. Render → Environment (lokal: `backend/.env`):

| O'zgaruvchi | Ma'nosi |
|---|---|
| `ADMIN_LOGIN`, `ADMIN_PASSWORD` | oddiy admin |
| `SUPER_ADMIN_LOGIN`, `SUPER_ADMIN_PASSWORD` | Super Admin (parol ≥ 10 belgi) |
| `SUPER_ADMIN_IDLE_TIMEOUT` | Super Admin sessiyasi harakatsizlik chegarasi, soniya (sukut 7200) |
| `PASSWORD_RESET_TTL` | tiklash havolasi muddati, soniya (sukut 1800) |
| `AUTH_SECRET`, `MONGODB_URI` | avvalgidek |

Parol **faqat ENV qiymati o'zgarganda** keyingi ishga tushishda bir marta qo'llanadi (barmoq izi `system_settings.env_credentials` da). Hisob mavjud bo'lsa, uning ma'lumotlari saqlanadi — faqat rol (Super Admin uchun) va parol yangilanadi.

**Super Admin hisobini tiklash:** `node --env-file=.env superadmin-reset.js abdulfozil [--reset-2fa]` — bir martalik havola chiqaradi; yoki `SUPER_ADMIN_PASSWORD` ni almashtirib serverni qayta ishga tushiring.

## Bo'limlar

Bosh sahifa · CRM analitikasi (o'quvchilar, sinflar, darslar, uy vazifalari) · Eng yaxshi o'qituvchilar · Aqlli tavsiyalar · Markaziy ma'lumotlar · Administratorlar · Menyu boshqaruvi · Tizim sozlamalari · Tizim monitoringi · Faoliyat tarixi · Hisobotlar (CSV/Excel/PDF) · Zaxira nusxalari · Profil va xavfsizlik (parol, 2FA/TOTP).

## Formulalar

- **Davomat** = K / (K + Y + S) × 100 (S — sababli, lekin qatnashmagan).
- **Rejadagi dars** — guruh jadvalidagi kun (guruh boshlangan, arxivda emas); **o'tilgan** — kamida bitta davomat belgisi bor.
- **O'z vaqtida** — dars kuni yoki ertasi belgilangan (yangi `lesson_marks` jurnali; avvalgi darslar uchun ma'lumot yo'q).
- **Reyting** — 6 mezonning og'irlikli o'rtachasi (og'irliklar sozlanadi); hisoblanmagan mezon tashlab ketiladi; ma'lumot kam bo'lsa reytingga kiritilmaydi. Reyting kadrlar bo'yicha qarorni avtomatik qabul qilmaydi.
- Taqqoslash — oldingi teng davr bilan; ma'lumot yetarli bo'lmasa `—` (nol emas).
- Vaqt mintaqasi — Sozlamalarda (sukut `Asia/Tashkent`).

## Mavjud bo'lmagan ma'lumot

**Uy vazifalari** — CRM'da saqlanmaydi, shuning uchun hisoblanmaydi. Qo'shish rejasi panelda (Analitika → Uy vazifalari). **CPU/disk** — hosting bermaydi, ko'rsatilmaydi. **AI** — tavsiyalar qoidaviy statistik tahlil; AI ulangan deb ko'rsatilmaydi.

## Bazadagi qo'shimchalar (mavjud ma'lumot o'zgarmaydi)

- `accounts`: `role: "superadmin"`, `totp`, `resetToken` (xesh), `restrictions` maydonlari
- `system_settings`: modullar, umumiy, bildirishnomalar, reyting, ENV barmoq izlari
- `lesson_marks`: dars birinchi belgilangan vaqt
- `crm_data_backups`: qo'lda olingan nusxalar alohida saqlanadi (`manual`, `pre-restore`)
- `security_audit`: yangi hodisalar (`data.change`, `super.*`, `report.export`, `module.*`, `backup.*`)

## Testlar

```
cd backend
npm test                               # analitika, eksport, TOTP (bazasiz)
SA_ADMIN_PASS=... SA_SUPER_PASS=... npm run test:integration   # ishlab turgan serverga
```

---

## 🤖 AI yordamchi (Super Admin → «AI yordamchi»)

Super Admin oddiy tilda yozadi — AI o'zi bajaradi:

- **Ma'lumot:** «qarzdor o'quvchilarni ko'rsat», «FE-1 guruhi davomati qanday?»
- **Hisobot:** «oxirgi 30 kunlik davomat hisobotini Excel qil» → chatda «Yuklab olish» tugmasi chiqadi (xlsx / pdf / csv)
- **O'zgartirish:** o'quvchi, guruh, mentor, kurs, moliya yozuvini qo'shish / tahrirlash / o'chirish;
  adminlarni boshqarish, modullar va «Menyu bo'limlari», tizim sozlamalari, zaxira nusxa olish

Xavfsizlik: AI Super Admin API'larini **shu foydalanuvchi huquqi bilan** chaqiradi (barcha tekshiruvlar va
faoliyat jurnali o'z kuchida). O'chirish, adminni bloklash, sessiyalarni yopish — faqat chatda «ha» deb
tasdiqlangandan keyin. Parol/2FA va zaxiradan tiklash AI ga berilmagan.

Dvigatel: asosiy — Claude (`ANTHROPIC_API_KEY`, model `claude-opus-5-5`). Claude ishlamasa (kredit tugagan,
xizmat band) — avtomatik **Lovable AI** (`LOVABLE_API_KEY`), so'ng **Gemini** (`GEMINI_API_KEY`).
Sinov (haqiqiy bazaga tegmaydi): `cd backend && npm run test:ai`.

## «Menyu bo'limlari» ni boshqarish (Super Admin → «Menyu boshqaruvi»)

Pastdagi «Sozlamalardagi «Menyu bo'limlari»» jadvalida Admin / Mentor / Talaba uchun kalit bor.
O'chirilsa — o'sha rol Sozlamalarida «Menyu bo'limlari» umuman chiqmaydi va u oldin yashirgan bo'limlar
yana ko'rinadi. Ochiq panellar o'zgarishni bir daqiqa ichida (yoki oyna faollashganda) oladi.

---

## 📈 Saytlar analitikasi (Super Admin → «Saytlar analitikasi»)

**Sayt qo'shish:** «+ Sayt qo'shish» → nom, URL, tavsif, kategoriya, vaqt zonasi, konversiya maqsadlari.
URL tekshiriladi (faqat ommaviy http/https; localhost va ichki tarmoq rad etiladi), takror sayt
aniqlanadi (`www` va oxiridagi `/` farq qilmaydi), noyob `site_id` va `tracking_id` beriladi va
**sayt sahifasi avtomatik ochiladi**. Hodisa kelmaguncha sahifada o'rnatish kodi va yo'riqnoma turadi.

**O'rnatish:** saytning `<head>` qismiga:

```html
<script defer src="https://<backend>/api/wa/t.js?id=UFQ-XXXXXXXX"></script>
```

Avtomatik: `session_start`, `page_view` (SPA ham), `page_exit` (sahifadagi vaqt), `scroll` (25/50/75/100%),
`form_submit` (faqat forma nomi — maydon qiymatlari o'qilmaydi). Qo'lda: `ufq('track','lead')`,
`ufq('track','purchase',{value:150000})`, `ufq('track','conversion')`; tugma — `data-ufq-event="nomi"`,
lead formasi — `data-ufq-lead`. Rozilik talab qilinsa: `ufq('consent', true)`.

**Maxfiylik:** cookie yo'q; tashrif buyuruvchi — saytning o'z brauzer xotirasidagi tasodifiy psevdonim
(turli qurilmalar alohida sanaladi). IP, to'liq User-Agent, so'rov parametrlari va forma qiymatlari
saqlanmaydi. Do Not Track / GPC hurmat qilinadi. Xom ma'lumot `WA_RETENTION_DAYS` (standart 400) kundan
keyin avtomatik o'chadi.

**Hisoblar:** sessiya 30 daqiqa faoliyatsizlikda tugaydi (sozlanadi); chiqish hodisasi kelmagan
sessiyalar davomiyligi "taxminiy" deb alohida ko'rsatiladi. Manba faqat referrer/UTM dan — taxmin
qilinmaydi. Bounce = 1 sahifa, < 10 s, konversiyasiz. Konversiya foizi = konversiyali sessiyalar /
sessiyalar × 100; CPA = xarajat / konversiyalar; ROAS = daromad / xarajat (nolga bo'lish — «—»).
Reklama xarajati, ko'rishlar va bosishlar faqat import qilingan ma'lumotdan (CSV) olinadi.

**Xavfsizlik:** tracking endpoint'lari (`/api/wa/t.js`, `/api/wa/collect`) umumiy CORS/CSRF qatlamidan
oldin ulanadi va o'z himoyasiga ega: tracking ID, Origin va sahifa domeni sayt domeniga mosligi, botlar
filtri, 16 KB hajm va IP bo'yicha limit, takroriy hodisalar rad etiladi. Super Admin API
(`/api/super/wa/*`) — faqat Super Admin. Sayt holati tekshiruvi SSRF himoyali (`security/ssrf.js`),
har 15 daqiqada avtomatik.

**Kolleksiyalar** (indekslar ishga tushganda yaratiladi): `wa_sites`, `wa_events`, `wa_sessions`,
`wa_visitors`, `wa_spend`, `wa_alerts`, `wa_checks`.

**Testlar:** `npm test` (sof hisob-kitoblar) · `WA_TEST_MONGO=mongodb://127.0.0.1:27017 npm run test:wa`
(haqiqiy MongoDB, har safar vaqtinchalik baza; bulutdagi bazada ishlamaydi).
