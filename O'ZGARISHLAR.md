# CRM — Amalga oshirilgan o'zgarishlar

Ushbu hujjat sizning vazifalar ro'yxatingiz (CRM Tizimini Takomillashtirish) bo'yicha nima qilinganini tushuntiradi.

## ⚠️ Muhim: ishga tushirishdan oldin

Yuklab olingan zip **`node_modules`siz**. Har bir papkada (`admin`, `mentor`, `student`, `backend`) terminalda quyidagini bajaring:

```
npm install
```

Boshqa hech narsa o'zgartirilmagan (`.env`, `package.json`, backend/server.js — barchasi asl holicha qoldirilgan).

---

## 1. Admin Panel

### 1.1 Talabalar ro'yxati — Pagination ✅
Guruhlar ro'yxatidagi mavjud pagination uslubi asosida, Talabalar ro'yxati endi **10 tadan** sahifalarga bo'lingan (Oldingi/Keyingi + sahifa raqamlari). To'liq responsive.

### 1.2 Talabaga Login va Parol berish ✅
- Talaba qo'shish/tahrirlash oynasiga **Login** va **Parol** maydonlari qo'shildi.
- Yangi talaba uchun login ism-familiyadan avtomatik taklif qilinadi, parol avtomatik yaratiladi (ikkalasi ham tahrirlanadi).
- Login butun tizim bo'yicha (admin/mentor/talaba) takrorlanmasligi tekshiriladi.
- **Parol endi SHA-256 xesh sifatida saqlanadi** — bazada ochiq matnda saqlanmaydi. Xeshlangani uchun, saqlangandan keyin parolni qayta ko'rsatib bo'lmaydi — shu sabab saqlangach, login/parolni nusxalab olish uchun bir martalik oyna chiqadi.
- Eski (standart admin/mentor) hisoblar bilan orqaga moslik saqlangan — ular hali ham ishlayveradi.

### 1.3 Talaba profili — Oylik to'lov mantiqiy tuzatildi ✅
Profilda endi **faqat**: joriy oy (jarayonda bo'lsa ham) + hali to'lanmagan ("qarzdor") oy(lar) ko'rsatiladi. To'langan yoki eskirgan oylar ro'yxatda ketma-ket chiqib, chalg'itmaydi. Jarayon avtomatik (kalendar sanaga asoslangan).

---

## 2. Mentor Panel

### Dashboard — kengaytirildi ✅
Yangi qo'shildi: Bugungi darslar, Shu haftadagi darslar, Davomat foizi, O'rtacha baho, Oylik o'sish, **Eng faol talabalar**, **Past natijali talabalar**, **Oxirgi faoliyatlar** ro'yxati va **4 ta grafik** (Haftalik davomat, Oylik baholar, Talabalar faolligi, Darslar statistikasi).

### Baholash (Rating) — butunlay qayta qurildi ✅
Eski tizim (og'irlikli mezonlar) juda murakkab edi. Endi standart ko'rinish — **sodda, bir qarashda tushunarli jadval**: Ism, Guruh, Oxirgi baho, O'rtacha baho, "Baho qo'yish" va "Tarix" tugmalari. Baholar so'ralganidek rang bilan ajratilgan (86–100 yashil, 71–85 ko'k, 56–70 sariq, 0–55 qizil). Eski mezon tizimi yo'qolib ketmadi — "Mezonlar bo'yicha" rejimida hali ham mavjud.

### Chat — zamonaviy Messenger uslubiga o'tkazildi ✅
Qo'shildi: oxirgi xabar vaqti, **onlayn holat** (yashil nuqta), haqiqiy **o'qilgan belgisi** (✓/✓✓), **fayl/rasm yuborish**, **emoji**, **qidiruv**, to'liq mobil-responsive (orqaga tugmasi bilan). Shuningdek muhim tuzatish: avval xabarlar faqat bitta brauzerda "real-time" edi — endi boshqa qurilmada yozilgan xabarlar ham 3 soniyada ko'rinadi.

---

## 3. Student Panel

### Dashboard — takrorlangan widget olib tashlandi, Analytics qo'shildi ✅
Dashboardda **to'liq Guruh reytingi ro'yxati ikki marta** chiqayotgan edi (bir marta Dashboardda, yana alohida sahifada) — bu takrorlanish olib tashlandi. O'rniga: O'rtacha baho, O'qilgan/Qolgan darslar, Maqsad bajarilishi, Oylik progress kartalari + **3 ta grafik** (Baholar, Davomat, Progress).

### Guruh Reytingi ✅
Har bir qatorga **O'rtacha baho** ustuni qo'shildi, Top-3 dizayni yanada ajratildi (oltin nur effekti bilan).

### Maqsadlar ✅
Har bir maqsadga **Muddat** (deadline) qo'shish imkoniyati, muddati yaqinlashganda/o'tganda ogohlantirish belgisi, va umumiy progress yonida "qolgan foiz" ko'rsatkichi qo'shildi.

---

## 4. Til funksiyasi (Localization)

- **~130 ta yangi matn** uz/ru/en tarjimalari bilan qo'shildi — yuqoridagi barcha yangi funksiyalar (pagination, kredensiallar, baholash, dashboard analytics, chat, maqsadlar) to'liq 3 tilda ishlaydi.
- Muhim bug tuzatildi: til almashtirilganda ba'zi panellar (funksiya nomlari mos kelmagani sababli) yangilanmay qolar edi — endi barcha panel to'g'ri yangilanadi.
- **Ochiqchasига aytish kerak**: butun tizimda (masalan Kurslar, To'lovlar, Sozlamalar kabi ushbu vazifalar ro'yxatida aytilmagan eski bo'limlarda) juda kam sonli joylarda hali ham qattiq kodlangan matn qolgan bo'lishi mumkin — bu vazifalar ro'yxatida so'ralgan barcha bo'limlar (yuqorida sanab o'tilgan) to'liq tarjima qilingan.

---

## Texnik eslatmalar

- Barcha o'zgarishlar 3 panelning (`admin`, `mentor`, `student`) `public/core/*.js`, `public/app-shell.html`, `public/edu-styles.css` fayllarida amalga oshirilgan.
- Backend (`server.js`) o'zgartirilmagan — yangi ma'lumotlar (masalan baholar tarixi) mavjud umumiy `/api/data` orqali avtomatik saqlanadi.
- Barcha JS fayllar sintaksis xatosiz ekanligi tekshirildi (`node --check`), HTML fayllar teglar balansi tekshirildi.
- Kodni jonli serverda (MongoDB ulanishi bilan) sinab ko'rish ushbu muhitda imkonsiz edi (baza yo'q) — shuning uchun ishga tushirgach asosiy oqimlarni (talaba qo'shish, baho qo'yish, chat, til almashtirish) qo'lda tekshirib chiqishni tavsiya qilamiz.

---

## 🛑 Ma'lumot o'chib ketishi (2026-09-05) — sabab va yechim

**Nima bo'lgan.** `crm_data` hujjatidagi kurslar / guruhlar / mentorlar /
talabalar / davomat / to'lovlar ro'yxatlari bo'shab qolgan
(`_updatedAt: 2026-09-05T12:54`).

**Sabab (zanjir).**

1. Brauzer ochilganda `backend-storage.js` sinxron `GET /api/kv` bilan
   ma'lumotni localStorage ga tortadi. Bu so'rov muvaffaqiyatsiz bo'lsa
   (Render backend uyquda, tarmoq uzilgan, localStorage to'lgan) xato
   **jimgina yutilardi**.
2. `loadData()` localStorage ni bo'sh ko'rib, **bo'sh** `D` qaytarardi.
3. Foydalanuvchining istalgan harakati `saveData()` ni chaqirardi va u
   bo'sh ro'yxatlarni `POST /api/data` orqali serverga yozardi.
4. Server hech qanday tekshiruvsiz qabul qilardi → baza bo'shab qolardi.
5. Bo'sh nusxa `/api/kv` va live-sync orqali boshqa brauzerlarga ham
   tarqalardi.

**Qo'yilgan himoyalar.**

| Qatlam | Himoya |
|--------|--------|
| `backend-storage.js` | Boshlang'ich yuklash natijasi `window.__CRM_KV_LOADED__` ga yoziladi. Yuklanmagan bo'lsa CRM kaliti serverga YOZILMAYDI. Serverdagi nusxa bo'sh, brauzerdagisi to'la bo'lsa — brauzerdagisi saqlanib qoladi. |
| `data-finance.js` | `saveData()` yuklanmagan yoki bo'sh holatda saqlashni rad etadi va ekran tepasida ogohlantirish chiqaradi. `syncFromBackend()` serverdagi bo'sh nusxani qabul qilmaydi — aksincha brauzerdagi to'la nusxani serverga QAYTARADI. |
| `live-sync.js` | Serverdan kelgan bo'sh CRM nusxasi brauzerdagi to'la nusxani bosib ketmaydi. |
| `server.js` | `POST /api/data` — bazada yozuv bor, kelgan payload bo'sh bo'lsa `409 empty-overwrite-blocked`. Chindan tozalash uchun `force: true`. Xuddi shu himoya `POST /api/kv` va `/api/kv/bulk` da `edumanage_crm_v8` kaliti uchun. `/api/kv/clear` endi `force: true` talab qiladi. |
| `server.js` | Har bir yozuvdan oldin eski nusxa `crm_data_backups` kolleksiyasiga saqlanadi (oxirgi 40 ta). Yozuvlar soni kamaygan bo'lsa — albatta nusxa olinadi. |

**Zaxiradan tiklash.**

```bash
curl -s https://<backend>/api/data/backups          # nusxalar ro'yxati
curl -s -X POST https://<backend>/api/data/restore \
     -H 'Content-Type: application/json' -d '{"id":"<nusxa_id>"}'
```

**Muhim.** Zaxira tizimi ayni shu tuzatishdan keyin ishlay boshladi —
2026-09-05 dagi yo'qotish uchun nusxa mavjud emas. Agar biror brauzerda
(boshqa kompyuter/telefon) CRM hali ochilmagan bo'lsa, o'sha brauzerdagi
localStorage nusxasi hali ham to'la bo'lishi mumkin: shu brauzerda CRM ni
ochish kifoya — yangi kod uni avtomatik serverga qaytaradi.

---

## 💸 Yangi sahifa: Qarzdorlar (admin)

- Yon menyuda **💸 Qarzdorlar** (faqat admin), yonida qarzdorlar soni.
- Sahifada FAQAT `isDebtor === true` talabalar.
- Yuqorida: qarzdorlar soni, jami qarz summasi, nechtasi Telegramga ulangan.
- Qidiruv, guruh bo'yicha va "Telegram ulangan/ulanmagan" filtri.
- Har bir qatorda: qarz summasi, Telegram holati, **🔗 Telegram**,
  **📨 Xabar**, **✅ To'landi** tugmalari.
- Bir nechta talabani belgilab birdaniga xabar yuborish mumkin.
- Fayllar: `admin/public/core/debtors.js`,
  `admin/src/components/shell/panels/DebtorsPanel.vue`,
  `edu-styles.css` oxiridagi `.debt-*` uslublari.

Telegram tomoni: `TELEGRAM-INTEGRATSIYA.md` ga qarang.

---

## Sertifikatlar (yangi) ✅

Talaba uchun sertifikat tizimi qo'shildi. **Mentor bilan hech qanday bog'liqligi yo'q** —
sertifikatni faqat admin yaratadi, faqat talaba ko'radi.

### Shablon = admin yuklagan RASM (dastur o'zi o'qiydi)
Dizayn kodda yozilmagan. Admin **🎨 Shablonlar** bo'limida sertifikat blankasini
rasm (PNG/JPG) qilib yuklaydi — boshqa hech narsa qilmaydi. Dastur rasmni tahlil qiladi:

1. **Yozuvlarni o'qiydi** (OCR, tesseract.js): «Ism Familiya», «Kurs nomi»,
   «O'qish muddati», «Sana», «DD.MM.YYYY», «Sertifikatni tekshirish» kabi
   yorliq va namunalarni topadi.
2. **Chiziqlarni topadi** — qiymat yoziladigan joylar odatda shu chiziqlarda
   bo'ladi (chiziqning qaysi tomoni bo'shligiga qarab ustiga yoki ostiga qo'yiladi).
3. **QR namunasini topadi** — blankadagi QR kvadratini aniqlaydi (zichlik va
   oq↔qora o'tishlar bo'yicha; muhr yoki to'q bezakni QR deb olmaydi).
4. Har bir maydonni o'z joyiga qo'yadi: shrift o'lchami, rangi blankadagi
   namunadan olinadi, matn joyiga sig'masa shrift avtomatik kichrayadi.
5. Blankadagi namunaviy yozuv («Ism Familiya», «DD.MM.YYYY», QR namunasi)
   ustiga fon rangida yamoq tushadi — ikkita matn ustma-ust chiqmaydi.

Ya'ni yuklagandan keyin **qo'lda joylashtirish shart emas**. Xohlasa, admin
«🎯 Maydonlarni joylash» oynasida har bir maydonni sudrab tuzatishi, shrift,
o'lcham, rang, qalin/qiya va koordinatasini o'zgartirishi mumkin; «🪄 Avtomatik
joylashtirish» tugmasi tahlilni qaytadan bajaradi. Internet bo'lmasa (OCR
yuklanmasa) — rasmning bo'sh yo'laklariga asoslangan zaxira joylashuv ishlatiladi.

Joylashuv **foizda** saqlanadi, shuning uchun ekranda, chop etishda va QR sahifasida
bir xil chiqadi. Rasm CRM ma'lumoti ichida emas, backend'dagi `blobs` omborida
saqlanadi (video va test PDF fayllari kabi) — baza og'irlashmaydi.

### Sertifikat ma'lumoti ham avtomatik
Hech narsa qo'lda yozilmaydi — hammasi CRM da boridan hisoblanadi:
- **ism** ← talabaning ismi
- **kurs** ← guruhining kursi
- **o'qish davri** ← guruh boshlangan sana + kursning davomiyligi («11 oy» kabi matndan
  o'qiladi; davomiylik ko'rsatilmagan bo'lsa — davomatdagi oxirgi dars sanasi)
- **raqam** ← `SERT-{yil}-{ketma-ket}` avtomatik
- **berilgan sana** ← bugungi sana

**🎓 Guruhga sertifikat berish** — guruhni tanlaysiz, guruhdagi HAR BIR talabaga bittadan
sertifikat bir bosishda yaratiladi (raqamlar ketma-ket, sertifikati bor talabalar avtomatik
o'tkazib yuboriladi). Yaratishdan oldin kimga tushishi ro'yxatda ko'rinadi.

**+ Bitta sertifikat** — bitta talabaga: ro'yxatdan talabani tanlaysiz va yuqoridagi
maydonlarning hammasi o'zi to'ladi, ko'rinish darrov shablon rasmida ko'rsatiladi.

### Talaba panel → 🎖 Sertifikatlarim
Talaba faqat **o'ziga berilgan** sertifikatlarni ko'radi. Sahifa alohida dizayn qilingan:
yuqorida qisqa tushuntirish va sertifikatlar soni, ostida kartochkalar to'ri (grid).
Har bir kartochkada sertifikatning o'z ko'rinishi (blanka rasmi bilan), «✓ Tasdiqlangan»
belgisi, sana, raqam va o'qish davri, hamda uchta amal: **Ko'rish**, **Yuklab olish**
(chop etish / PDF) va **🔗** (tekshirish havolasini nusxalash). Kartochka ustiga
kelinganda ko'tariladi va «Kattalashtirib ko'rish» chiqadi.

«Ko'rish» oynasida sertifikat kattalashadi, pastida ism, kurs, o'qish davri, sana va
raqam alohida kataklarda, hamda QR ochadigan havola ko'rinadi.

⚠️ Bu sahifa ilgari `settings-wrap` ichida edi — u 440px li grid bo'lgani uchun matn
va kartochka ikki ustunga bo'linib, kartochka chetga surilib qolardi. Endi o'z
konteyneri va uslublari bor (`core/certificates.js` ichidagi `cert-*` klasslari).

### QR kod — haqiqiylikni tekshirish
QR ichida `{backend}/sert/{raqam}` havolasi turadi. Skaner qilinganda ochiladigan sahifa
o'sha raqamdagi sertifikatni **bazadan** topib, aynan o'sha shablon rasmi va maydon
joylashuvi bilan chizib beradi, pastida ma'lumot jadvali va "✅ Sertifikat haqiqiy" yozuvi
turadi. Raqam bazada bo'lmasa — "🚫 bu hujjat haqiqiy emas".

### Texnik jihatlar
- `core/certificates.js` — shablon rasmi bilan chizish, maydonlarni sudrab joylashtirish
  muharriri, admin ro'yxati/formasi, talaba sahifasi, QR (bitta fayl: ochiq tekshiruv
  sahifasi ham shuni ishlatadi, shuning uchun ko'rinish farq qilmaydi).
- Ma'lumot: `D.certificates` (sertifikatlar) va `D.certTemplates` (shablon: rasm id si +
  maydonlar joylashuvi) — boshqa CRM ma'lumotlari bilan birga saqlanadi.
- Backend: `GET /sert/:raqam` (ochiq sahifa), `GET /api/cert/:raqam` (sertifikat + shablon +
  blanka rasmi; talabaning telefoni, guruhi va boshqasi chiqmaydi),
  `GET /api/cert-render.js` (chizish moduli), rasm uchun mavjud `POST /api/blob`.
- QR kod `cdnjs` dagi `qrcodejs` bilan chiziladi; internet bo'lmasa sertifikat baribir
  yaratiladi — QR o'rniga havola matni chiqadi.

---

## Oxirgi tuzatishlar (bug fix)

### A. Konsoldagi `401 (Unauthorized)` shovqini va o'z-o'zini bloklash ✅
Sahifa ochilganda konsolda ketma-ket `POST /api/auth/refresh 401` va
`GET /api/kv 401` chiqardi. Sababi: login qilinmagan holatda ham har bir
modul (coin-system, backend-storage, live-sync…) mustaqil ravishda token
so'rardi va har biri serverga alohida so'rov yuborardi. Bu nafaqat shovqin
edi — o'sha so'rovlar login cheklovini yeb, foydalanuvchini 15 daqiqaga
bloklab qo'yishi ham mumkin edi.

Nima qilindi (`*/public/core/secure-auth.js`):
- server bir marta "sessiya yo'q" desa, `noSession` bayrog'i yoqiladi va
  keyingi so'rovlar **tarmoqqa umuman chiqmaydi** (ichki 401 qaytariladi);
- server refresh cookie bilan birga oddiy (sirsiz) `edu_has_session` belgisini
  ham qo'yadi — u yo'q bo'lsa mijoz serverga **umuman bormaydi**. Natijada
  login ekranida konsol butunlay toza;
- tarmoq uzilishi "sessiya yo'q" deb hisoblanmaydi (internet qaytganda ilova
  o'zi tiklanadi).

### B. Kirgandan keyin saqlash to'silib qolishi ✅
`backend-storage.js` dagi `hydrateFromServer()` ichki bayroqni yangilardi,
lekin `window.__CRM_KV_LOADED__` sahifa ochilgandagi `false` qiymatida qolib
ketardi. Login ekranida yuklash tabiiy ravishda muvaffaqiyatsiz bo'lgani
uchun, **kirgandan keyin ham** "SAQLASH o'chirildi" chizig'i chiqib,
o'zgarishlar serverga ketmasdi. Bayroq endi yuklash natijasi bilan birga
yangilanadi.

### C. Chiqishdan keyin 404 ✅
Portallar `base: "/"` bilan build qilinadi (Vercel uchun), backend esa
ularni `/admin`, `/mentor`, `/student` ostida beradi. Router `/dashboard` ga
o'tgani uchun sahifa yangilanganda (yoki chiqishdan keyingi `reload` da)
server manzilni topa olmay **404** qaytarardi. Router bazasi endi ochilgan
manzildan aniqlanadi (`*/src/router/index.js`).

### D. Blok Wi-Fi ga emas, QURILMAGA qo'yiladi ✅
Ilgari noto'g'ri parol urinishlari **IP** va **hisob** bo'yicha hisoblanardi:
bitta talabaning xatosi butun o'quv markazini (bitta Wi-Fi) tizimdan uzardi,
begona odam esa faqat loginingizni bilib sizni bloklab qo'ya olardi.

Endi (`backend/security/devices.js`): 8 ta xato urinishdan keyin **faqat
o'sha qurilma** 15 daqiqaga bloklanadi. Qurilma `edu_did` cookie va
`X-Device-Id` sarlavhasi bilan aniqlanadi — IP qatnashmaydi. Login oynasida
"yana N ta urinish qoldi" va blok sababi aniq yoziladi. Admin
**Sozlamalar → Bloklangan qurilmalar** kartochkasidan blokni ochib bera oladi.

### E. Parolni faqat admin o'zgartiradi ✅
Talaba/mentor portalidan parolni almashtirish olib tashlandi. Admin o'z
parolini admin panelidagi *Sozlamalar* bo'limidan almashtiradi, boshqalarniki
esa mentor/talaba login-parol kartochkalaridan beriladi. Himoya UI da emas,
**serverda**: `/api/auth/change-password` admin bo'lmagan rolga `403`
qaytaradi.

### F. `alert` / `confirm` / `prompt` olib tashlandi ✅
Brauzerning oynalari sahifani qotirib qo'yar, sayt uslubiga mos kelmas va
telefonda foydalanuvchi "oyna chiqarmasin" tugmasini bossa `confirm()` doim
`false` qaytarar edi — o'chirish/tasdiqlash amallari jimgina ishlamay
qolardi. Hammasi `*/public/core/ui-dialog.js` dagi CRM modaliga ko'chirildi:
`crmAlert()`, `crmConfirm()`, `crmPrompt()`.
