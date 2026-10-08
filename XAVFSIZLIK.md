# 🔐 Xavfsizlik — EduManage CRM

Bu hujjat tizimning xavfsizlik modelini, oldin qanday bo'lganini va endi qanday
ishlashini tushuntiradi. Serverga chiqarishdan oldin **"Ishga tushirish"**
bo'limini albatta o'qing.

---

## 1. Eng muhim: nima xavf ostida edi

Oldingi holatda tizimda **hech qanday server tomonidagi autentifikatsiya yo'q edi**.
Kirish tekshiruvi to'liq brauzerda bajarilardi. Amalda bu quyidagini anglatardi:

| # | Zaiflik | Oqibati |
|---|---------|---------|
| 1 | `GET /api/users` **barcha loginlarni parollari bilan** hech kimdan so'ramasdan qaytarardi | Saytni ochgan **istalgan odam** admin, mentor va talabalar parolini o'qib olardi |
| 2 | Barcha API endpointlari ochiq edi | Har kim `POST /api/data` bilan **butun bazani o'chirib** yoki o'zgartirib yuborishi mumkin edi |
| 3 | Rol faqat `localStorage` da saqlanardi | Brauzer konsolida bir qator kod bilan **admin bo'lib olish** mumkin edi |
| 4 | `Access-Control-Allow-Origin: *` | **Internetdagi istalgan sayt** foydalanuvchi nomidan API'ga so'rov yubora olardi |
| 5 | Admin paroli `admin/admin123` va u `localStorage` da **ochiq matnda** turardi | Standart parol bilan qolib ketish |
| 6 | Coin balansi hech kim tomonidan tekshirilmasdi | Talaba o'ziga **cheksiz coin** yozib olardi |
| 7 | `/api/img-proxy` istalgan manzilni server nomidan ochardi (SSRF) | `169.254.169.254` orqali **bulut hisob ma'lumotlari**, `localhost:27017` orqali **MongoDB** |
| 8 | Sertifikat sahifasida raqam JS ichiga ekranlanmasdan tushardi | **XSS** — QR havola orqali begona kod ishga tushirish |
| 9 | So'rov tanasi MongoDB filtriga to'g'ridan-to'g'ri o'tardi | **NoSQL injection** (`{"login":{"$ne":null}}`) |
| 10 | Xatolar `e.message` bilan qaytarilardi | Baza tuzilishi va ichki yo'llar oshkor bo'lardi |
| 11 | Chastota cheklovi yo'q edi | Parolni **cheksiz tanlash**, SMS/AI byudjetini sarflab yuborish |

**Barchasi yopildi.** Quyida qanday qilib.

---

## 2. Endi qanday ishlaydi

### 2.1 Kirish va sessiya

```
Brauzer                          Server
   │  POST /api/auth/login          │
   │  {username, password}          │
   │───────────────────────────────>│  scrypt bilan tekshiradi
   │                                │  (parol hech qachon ochiq saqlanmaydi)
   │  <── access token (15 daqiqa)  │
   │  <── refresh cookie (httpOnly) │
   │                                │
   │  Har bir /api/ so'rovi:        │
   │  Authorization: Bearer <token> │
   │───────────────────────────────>│  imzo + muddat + rol tekshiriladi
```

| Nima | Qayerda | Nega |
|------|---------|------|
| **Access token** | Faqat brauzer **xotirasida** | `localStorage` da bo'lsa XSS uni o'sha zahoti o'g'irlagan bo'lardi |
| **Refresh token** | `httpOnly` cookie | JavaScript uni **umuman ko'ra olmaydi** |
| **Parol** | Serverda, `scrypt` xeshi | Baza sizib ketsa ham parollar tiklanmaydi |

### 2.2 Parol xeshlash

`scrypt` (N=32768, r=8, p=1) — xotira-og'ir algoritm. Video-karta yoki maxsus
qurilma bilan parol tanlash tezligi keskin pasayadi. Har parolda o'ziga xos
tasodifiy "salt", solishtiruv esa doimiy vaqtda (timing attack'ga qarshi).

### 2.3 Refresh rotatsiyasi va o'g'irlikni aniqlash

Har `refresh` da token **yangisiga almashtiriladi**. Agar o'g'irlangan eski token
ishlatilsa, server buni sezadi va **o'sha qurilmaning barcha sessiyalarini
yopadi** — ya'ni o'g'irlik sezilmay qolmaydi. Bir necha tab bir vaqtda
yangilaganda noto'g'ri ishlamasligi uchun 15 soniyalik oyna qoldirilgan.

### 2.4 Rollar va maydon darajasidagi ruxsat

Faqat "yozishga ruxsat bor/yo'q" yetarli emas edi: bu CRM da butun ma'lumot
bitta obyektda yashaydi, ya'ni talaba o'z bahosini yozayotganda ayni so'rov
bilan moliyaviy bo'limni ham o'zgartirib yuborishi mumkin edi.

Endi server kelgan obyektni **rolga qarab kesib oladi** — ruxsat etilmagan
bo'limlar serverdagi nusxadan tiklanadi:

| Bo'lim | Admin | Mentor | Talaba |
|--------|:-----:|:------:|:------:|
| `finance`, `certificates`, `certTemplates`, `settings` | ✅ | ❌ | ❌ |
| `courses`, `groups`, `students`, `mentors`, `attendance`, `grades`, `tests` | ✅ | ✅ | ❌ |
| `testResults`, `simpleGrades`, `chats`, `notifications` | ✅ | ✅ | ✅ |

**Coin balansi** alohida qoidalar bilan:

- Talaba — faqat **o'z** balansini va faqat **kamaytira** oladi (xarid)
- Mentor — talabalarga bera oladi, o'z balansini faqat kamaytira oladi
- Mentorga coin ajratish (`/api/coins/send-mentor`) — faqat admin

**KV kalitlari** rol bo'yicha cheklangan: hisob ma'lumotlari va sozlamalar
faqat adminga, o'quv ma'lumotlari admin+mentorga, talabaga esa faqat o'z
natijalari va chat kalitlari.

### 2.5 Boshqa himoyalar

| Himoya | Tafsilot |
|--------|----------|
| **Brute-force** | 8 ta noto'g'ri urinishdan keyin **qurilma** 15 daqiqaga bloklanadi (2.6-bo'lim). Chastota cheklovi ham qurilma bo'yicha — IP bo'yicha emas |
| **Parol siyosati** | Kamida 10 belgi, ommabop parollar lug'ati, login/ism bilan bir xil bo'lmaslik, oxirgi 5 ta parolni qayta ishlatmaslik. Parolni **faqat admin** o'zgartiradi (2.7-bo'lim) |
| **CORS** | `*` o'rniga `ALLOWED_ORIGINS` oq ro'yxati |
| **CSRF** | Origin tekshiruvi + `SameSite` cookie + double-submit token (xavfli amallarda) |
| **CSP** | `script-src 'self' 'nonce-…'` — begona va inline skript ishlamaydi |
| **HSTS, X-Frame-Options, nosniff, Permissions-Policy** | Barcha javoblarda |
| **NoSQL injection** | `$`-operatorlar va nuqtali yo'llar so'rov tanasidan olib tashlanadi |
| **SSRF** | Ichki IP, ichki domen, DNS orqali yashiringan ichki manzil va zanjirli redirect bloklanadi |
| **Path traversal** | Normallashtirilgan yo'l tekshiruvi; `.env`, `.git`, yashirin fayllar hech qachon berilmaydi |
| **XSS** | Sertifikat sahifasida `</script>` ekranlanadi, ma'lumot `innerHTML` emas, DOM orqali chiziladi |
| **Fayl yuklash** | MIME oq ro'yxati (rasm/video/audio/PDF), hajm cheklovi, `data:` URI ichidagi tur ham tekshiriladi |
| **Xato javoblari** | Ichki xato matni chiqmaydi — faqat umumiy xabar va `requestId` |
| **Audit jurnali** | Kim, qachon, qayerdan, nima qildi. `security_audit` kolleksiyasi, 180 kun (TTL) |


### 2.6 Brute-force: blok QURILMAGA qo'yiladi, internetga emas

Ilgari noto'g'ri parol urinishlari **IP manzil** va **hisob nomi** bo'yicha
hisoblanardi. Ikkalasi ham amalda zarar keltirardi:

* **IP bo'yicha blok** — o'quv markazida hamma bitta Wi-Fi orqali chiqadi.
  Bitta talaba parolni 8 marta xato yozsa, **butun bino** 15 daqiqaga tizimga
  kira olmay qolardi.
* **Hisob bo'yicha blok** — begona odam faqat sizning **loginingizni** bilsa
  kifoya edi: ataylab xato parol yozib, haqiqiy egasini tizimdan uzib qo'ya
  olardi (DoS).

Endi hisoblagich **qurilmaga** bog'langan:

| Qurilma qanday aniqlanadi | Izoh |
|---------------------------|------|
| `edu_did` cookie | Server qo'yadigan, 1 yil yashaydigan tasodifiy id (asosiy yo'l) |
| `X-Device-Id` sarlavhasi | Mijoz `localStorage` da saqlaydi — cookie o'chirilgan yoki cross-site rejimda kelmasa |
| UA + til + platforma barmoq izi | Eng zaif zaxira. **IP qatnashmaydi** |

Natijada:

* bloklangan telefon 15 daqiqa kira olmaydi;
* **xuddi shu Wi-Fi dagi boshqa qurilma bemalol kiraveradi**;
* hisob egasi boshqa qurilmadan kira oladi;
* internet/mobil tarmoqni almashtirish blokni ochmaydi (blok qurilmada).

Bloklar `auth_device_blocks` kolleksiyasida (TTL bilan o'zi tozalanadi).
Admin **Sozlamalar → Bloklangan qurilmalar** bo'limidan blokni muddatidan
oldin ocha oladi (`POST /api/admin/devices/unblock`).

Sozlamalar: `DEVICE_MAX_FAILED_ATTEMPTS` (8), `DEVICE_BLOCK_SECONDS` (900),
`DEVICE_FAIL_WINDOW_SECONDS` (1800). Hisobning o'zini bloklash
`LOCK_ACCOUNT_ON_FAILURES` bilan yoqiladi — sukut bo'yicha **o'chiq**.

### 2.7 Parolni faqat admin o'zgartiradi

Parolni almashtirish saytning o'zidan (talaba/mentor portalidan) olib
tashlandi:

* **admin** — admin panelidagi *Sozlamalar → Admin login/parol* bo'limidan
  o'z parolini almashtiradi (joriy parolni bilishi shart);
* **mentor / talaba** — o'zi almashtira olmaydi. Yangi parolni admin
  *Sozlamalar → Mentor/Talaba login-parollari* bo'limidan beradi.

Himoya UI da emas, **serverda**: `POST /api/auth/change-password` admin
bo'lmagan rolga `403 self-change-disabled` qaytaradi, ya'ni so'rovni qo'lda
yuborish ham ish bermaydi. Rollar ro'yxati `SELF_PASSWORD_CHANGE_ROLES` bilan
sozlanadi (sukut: `admin`).

Shu sababli admin parolni tiklaganda `mustChangePassword` bayrog'i faqat
o'zi almashtira oladigan rolga qo'yiladi — aks holda talaba tizimga umuman
kira olmasdi.

### 2.8 Brauzer oynalari (`alert` / `confirm` / `prompt`) olib tashlandi

Sayt bo'ylab brauzerning tayyor oynalari ishlatilardi. Ular sahifani
qotirib qo'yadi, sayt uslubiga umuman mos kelmaydi va — eng yomoni —
telefon brauzerlarida foydalanuvchi "bu sayt boshqa oyna chiqarmasin"
tugmasini bossa, `confirm()` **doim `false`** qaytaradi: o'chirish va
tasdiqlash amallari jimgina ishlamay qoladi.

Hammasi `*/public/core/ui-dialog.js` dagi CRM uslubidagi modalga ko'chirildi:
`crmAlert()`, `crmConfirm()`, `crmPrompt()` — Promise qaytaradi, `await`
bilan chaqiriladi. Qolib ketgan `alert/confirm/prompt` chaqiruvlari ham
avtomatik shu oynalarga yo'naltiriladi.

---

## 3. Ishga tushirish

### 3.1 Majburiy muhit o'zgaruvchilari

```bash
# Sessiya tokenlarini imzolash kaliti — PRODUCTION'DA MAJBURIY.
# Bo'lmasa server ishga tushmaydi.
AUTH_SECRET=<64+ belgili tasodifiy satr>
```

Kalit yaratish:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Render'da `render.yaml` buni `generateValue: true` bilan avtomatik yaratadi.

> ⚠️ `AUTH_SECRET` ni almashtirish — barcha foydalanuvchilarni tizimdan
> chiqarib yuboradi (bu ba'zan aynan kerak bo'ladi: hisob buzilgan deb
> gumon qilinsa).

### 3.2 Portallar boshqa domenda bo'lsa (Vercel)

```bash
ALLOWED_ORIGINS=https://admin.example.com,https://mentor.example.com,https://student.example.com
CROSS_SITE_AUTH=1     # cookie SameSite=None; Secure — HTTPS shart
```

Bitta domen (Render backend portallarni o'zi beradi) bo'lsa — ikkalasi ham
kerak emas.

### 3.3 Birinchi ishga tushirish

Server o'zi quyidagilarni bajaradi:

1. Eski `users` kolleksiyasidagi loginlarni `accounts` ga ko'chiradi
2. Ochiq matndagi parollarni bazadan **o'chiradi**
3. Admin bo'lmasa — yangi admin yaratadi va parolni **logga bir marta** yozadi

```
══════════════════════════════════════════════════════════════════
🔐  BOSHLANG'ICH ADMIN HISOBI YARATILDI
    Login: admin
    Parol: UjO_7mVs9sf3U_Ax
    Bu parol FAQAT SHU YERDA ko'rsatiladi.
══════════════════════════════════════════════════════════════════
```

Parolni oldindan belgilash uchun: `BOOTSTRAP_ADMIN_PASSWORD=<parol>`.

### 3.4 Eski parollar bilan kirish

`ALLOW_LEGACY_PASSWORDS=1` (standart) — mavjud foydalanuvchilar **eski
parollari bilan kira oladi**, va birinchi muvaffaqiyatli kirishda parol
avtomatik `scrypt` ga ko'chadi. Hech kim tizimdan chiqib qolmaydi.

Barcha foydalanuvchi bir marta kirib bo'lgach:

```bash
ALLOW_LEGACY_PASSWORDS=0
```

---

## 4. API

### Autentifikatsiya

| Metod | Yo'l | Kim |
|-------|------|-----|
| POST | `/api/auth/login` | ochiq |
| POST | `/api/auth/refresh` | cookie |
| POST | `/api/auth/logout` | har kim |
| GET | `/api/auth/me` | kirgan |
| POST | `/api/auth/change-password` | **faqat admin** (`SELF_PASSWORD_CHANGE_ROLES`) |
| GET | `/api/auth/sessions` | kirgan (o'z qurilmalari) |
| POST | `/api/auth/revoke-all` | kirgan |

### Administratsiya

| Metod | Yo'l | Vazifa |
|-------|------|--------|
| GET | `/api/admin/accounts` | hisoblar ro'yxati (**parolsiz**) |
| POST | `/api/admin/accounts` | yaratish / yangilash |
| POST | `/api/admin/accounts/password` | parolni tiklash |
| POST | `/api/admin/accounts/status` | bloklash / ochish |
| POST | `/api/admin/accounts/delete` | o'chirish |
| GET | `/api/admin/devices` | bloklangan qurilmalar |
| POST | `/api/admin/devices/unblock` | qurilma blokini ochish |
| GET | `/api/admin/audit` | xavfsizlik jurnali |
| GET | `/api/health/full` | to'liq holat |

### Ruxsat darajalari

| Yo'l | Admin | Mentor | Talaba | Ochiq |
|------|:-----:|:------:|:------:|:-----:|
| `/api/health` | | | | ✅ |
| `/api/cert/:no`, `/sert/:no` | | | | ✅ (chastota cheklangan) |
| `GET /api/data`, `/api/kv`, `/api/coins`, `/api/events` | ✅ | ✅ | ✅ | ❌ |
| `POST /api/data`, `/api/kv` | ✅ | ✅¹ | ✅¹ | ❌ |
| `/api/blob` (yuklash) | ✅ | ✅ | ❌ | ❌ |
| `/api/notify/*`, `/api/telegram/attendance` | ✅ | ✅ | ❌ | ❌ |
| `/api/users/save`, `/api/data/restore`, `/api/kv/clear`, `/api/db/stats` | ✅ | ❌ | ❌ | ❌ |

¹ maydon darajasidagi siyosat bilan (2.4-bo'limga qarang)

---

## 5. Doimiy amallar

- **Har chorakda** `AUTH_SECRET` ni almashtiring (barcha sessiyalar yopiladi)
- **Har oy** `/api/admin/audit` dan `auth.login.failed` va
  `auth.session.reuse_detected` hodisalarini ko'rib chiqing
- Xodim ishdan bo'shasa — hisobni **o'chirmang, bloklang**
  (`/api/admin/accounts/status`): audit tarixi saqlanib qoladi
- `.env` faylni **hech qachon** git'ga qo'shmang (`.gitignore` da bor)
- MongoDB Atlas'da IP oq ro'yxatini yoqing

---

## 6. Tezlik

Xavfsizlik qatlami qo'shilgach backend sekinlashdi, sabablari o'lchab
aniqlandi va tuzatildi. Asosiy muammo: **MongoDB Atlas boshqa mintaqada**,
har bir baza murojaati ~220 ms. Ilgari har so'rovda bir nechta murojaat
bo'lardi.

### Nima qilindi

| Muammo | Yechim | Fayl |
|---|---|---|
| `requireAuth` **har so'rovda** hisobni bazadan o'qirdi (+220 ms) | 30 soniyalik xotira keshi; hisob o'zgarganda (parol, blok, o'chirish) kesh **darhol** tozalanadi | `security/cache.js` |
| Audit yozuvi javobni kuttirardi (+220 ms) | Yozuvlar buferga to'planib, fonda to'plam bo'lib yoziladi | `security/audit.js` |
| `/api/kv` butun CRM omborini har safar qayta o'qirdi (~1.5 s) | O'qish keshi + brotli/gzip siqish. Kesh har yozuvda bekor qilinadi | `server.js`, `security/compress.js` |
| Kirishda 5 ta baza murojaati | `findOneAndUpdate` bilan birlashtirildi; hisoblagich va sessiya limiti fonda | `security/accounts.js`, `sessions.js` |
| `sanitizeDeep` butun ma'lumot daraxtini qayta qurardi | Tez yo'l: xavfli kalit bo'lmasa obyekt umuman nusxalanmaydi | `security/sanitize.js` |
| Ruxsat siyosati har bo'limni ikki marta `JSON.stringify` qilardi | Faqat kichik bo'limlar aniq solishtiriladi | `security/policy.js` |
| ETag o'chirilgan edi — statik fayllar har safar qayta yuklanardi | Statik fayllar uchun qaytarildi (API baribir `no-store`) | `security/index.js` |
| MongoDB ulanishi sozlanmagan edi | Pool, zlib siqish, retry, issiq ulanish | `server.js` |

### Natija (real Atlas bazasida o'lchangan)

| Endpoint | Oldin | Keyin |
|---|---:|---:|
| `GET /api/kv` | 1560 ms | **12 ms** |
| `GET /api/data` | 510 ms | **3 ms** |
| `GET /api/users` | 443 ms | **2 ms** |
| `GET /api/rev` | 221 ms | **3 ms** |
| `GET /api/coins` | — | **10 ms** |
| `POST /api/auth/login` | 1470 ms | **850 ms** |

Kirish qasddan sekinroq qoldirilgan: vaqtning katta qismi `scrypt` parol
xeshlashiga ketadi va aynan shu parolni tanlab olishni qiyinlashtiradi.

### Kesh xavfsizmi?

Ha. Uch qatlamli himoya:

1. **Yozuvda darhol bekor qilinadi** — har qanday o'zgarish `broadcast()` ni
   chaqiradi, u esa keshni tozalaydi.
2. **Qisqa TTL** (hisob 30 s, ma'lumot 5 s) — tashqi omil ta'sir qilsa ham
   eskirish shu vaqt bilan cheklangan.
3. **Ruxsat keshdan KEYIN qo'llanadi** — rol bo'yicha filtrlash har so'rovda
   qayta bajariladi, ya'ni kesh hech kimga ortiqcha ma'lumot bermaydi.

Bloklangan hisobning **darhol** rad etilishi test bilan tasdiqlangan.

---

## 7. Fayl tuzilishi

```
backend/security/
├── index.js        # ilovaga ulash (installSecurity / initSecurityStore)
├── config.js       # sozlamalar + muhit tekshiruvi
├── crypto.js       # scrypt parol, HS256 token, parol siyosati
├── accounts.js     # hisoblar ombori, kirish tekshiruvi
├── sessions.js     # refresh rotatsiyasi, o'g'irlikni aniqlash
├── devices.js      # qurilma bo'yicha bloklash (IP emas)
├── middleware.js   # requireAuth / requireRole / CSRF / cookie
├── policy.js       # maydon darajasidagi ruxsatlar (CRM, KV, coin)
├── routes.js       # /api/auth/* va /api/admin/*
├── rateLimit.js    # chastota cheklovi
├── headers.js      # CSP, HSTS va boshqa sarlavhalar
├── cors.js         # origin oq ro'yxati
├── sanitize.js     # NoSQL injection, XSS, validatsiya
├── ssrf.js         # tashqi so'rovlar himoyasi
├── audit.js        # xavfsizlik jurnali (to'plamli yozish)
├── cache.js        # hisoblar keshi (tezlik)
├── compress.js     # javoblarni siqish (tezlik)
└── bootstrap.js    # eski hisoblarni ko'chirish

*/public/core/
├── secure-auth.js  # mijoz tomonidagi sessiya qatlami
└── ui-dialog.js    # crmAlert / crmConfirm / crmPrompt modallari
```

Tashqi kutubxona ishlatilmagan — hammasi Node.js ning o'z `node:crypto`
moduli ustida. Bu ta'minot zanjiri (supply chain) hujum yuzasini
kengaytirmaydi va `npm install` muammolari bo'lmaydi.
