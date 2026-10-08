# 📨 Xabarnoma kanallari

CRM tashqariga uch xil xabar yuboradi:

| Nima | Qayerga | Fayl | Sozlama |
|---|---|---|---|
| 📊 Davomat hisoboti | ota-onalar Telegram **guruhiga** | `backend/davomatBot.js` | `TELEGRAM_BOT_TOKEN` |
| 💸 Qarzdorlik xabari | **o'sha guruhga** | `backend/davomatBot.js` | `TELEGRAM_BOT_TOKEN` |
| 📱 Qarzdorlik **SMS** | talaba/ota-onaning **telefoniga** | `backend/smsSender.js` | `ESKIZ_EMAIL` + `ESKIZ_PASSWORD` |

Telegram transporti (navbat, 429 da qayta urinish, long-polling) —
`backend/telegramClient.js`.

> **Nega talabaning shaxsiy Telegramiga yozilmaydi?** Telegram boti
> foydalanuvchiga **birinchi bo'lib yoza olmaydi** — u avval botni o'zi ishga
> tushirishi ("Start") shart, aks holda Telegram
> `bot can't initiate conversation with a user` deb rad etadi. Bu Telegramning
> spam-himoyasi; chat ID ni qo'lda kiritish ham yordam bermaydi va yangi bot
> ochish ham. Talabadan hech narsa talab qilmaydigan yagona shaxsiy kanal —
> SMS.

---

# 📊 Davomat boti

Mentor yoki admin **K / Y / S** bosgan zahoti ota-onalar Telegram guruhiga
davomat hisoboti yuboriladi. Bir dars uchun **bitta xabar** bo'ladi: keyingi
belgilashda o'sha xabar tahrirlanadi, yangi xabar tashlanmaydi.

Bot **CRM ning o'zida** — `backend/davomatBot.js`. Tashqi servis yo'q.

---

## 1. Sozlash (bir marta, ~3 daqiqa)

### 1.1. Bot yaratish

1. Telegramda [@BotFather](https://t.me/BotFather) → `/newbot`
2. Nom va username bering
3. BotFather bergan **tokenni** nusxalang (`123456:ABC-...` ko'rinishida)

### 1.2. Tokenni CRM ga qo'yish

| Qayerda | Nima qilinadi |
|---|---|
| Lokal | `backend/.env` → `TELEGRAM_BOT_TOKEN=<token>` |
| Render | `edumanage-crm` → Environment → `TELEGRAM_BOT_TOKEN` |

Tekshirish: `GET /api/health` → `davomatBot` maydoni.

| Javob | Ma'nosi |
|---|---|
| `✅ @sizning_bot` | Token ishlayapti |
| `❌ Unauthorized` | Token noto'g'ri yoki bekor qilingan |
| `⚠️ sozlanmagan` | Token kiritilmagan |

> Bu tekshiruv env to'ldirilganini emas, tokenning **haqiqatan ishlashini**
> tekshiradi (`getMe`). Shuning uchun bekor qilingan token bilan "✅" chiqmaydi.

### 1.3. Botni ota-onalar guruhiga qo'shish

Botni guruhga qo'shing va **admin** qiling, so'ng guruhga bitta xabar yozing.

### 1.4. Guruhga chat ID biriktirish

1. CRM → **Guruhlar** → guruhni tahrirlash (✏️)
2. **📨 Telegram davomat boti** bo'limida **🔍 Aniqlash** tugmasini bosing
3. Bot ko'rgan guruhlar ro'yxatdan chiqadi — kerakligini tanlang → Saqlash

Tamom. Boshqa hech narsa sozlash kerak emas.

> **Nega qo'lda ID yozilmaydi?** Chat ID ni qo'lda topish (`getUpdates` ni
> brauzerda ochish, `-100` prefiksi bormi-yo'qmi deb boshqotirish) eng ko'p
> xatoga sabab bo'lgan qadam edi — noto'g'ri ID bilan hech qanday xato
> ko'rinmasdi, xabar ham kelmasdi. Endi bot o'zi ko'rgan guruhlarni beradi.
>
> Ro'yxat bo'sh chiqsa: bot guruhga qo'shilmagan, yoki guruhga hali xabar
> yozilmagan. ID ni qo'lda ham kiritsa bo'ladi — maydon ochiq.

---

## 2. Ishlash sxemasi

```
CRM (brauzer)                    CRM backend                    Telegram
  mentor K/Y/S bosdi
        │
        └─ setAtt() ──► POST /api/telegram/attendance
                          {groupId, year, month, lesson}
                                    │
                                    ├─ 1500ms debounce
                                    ├─ crm_data dan hisobot quriladi
                                    └─ sendMessage / editMessageText ──►
```

**Nima yuborilmaydi:** faqat `groupId`, `year`, `month`, `lesson`. Talabalar
ro'yxati, ismlar, belgilar — hech biri. Hisobot backend'da CRM ning o'z
ma'lumotidan quriladi, shuning uchun **ro'yxatni hech qayerga nusxalash va
sinxronlash kerak emas**. Talaba qo'shsangiz yoki ism o'zgartirsangiz —
keyingi hisobotda o'zi to'g'ri chiqadi.

---

## 3. Hisobot ko'rinishi

```
📊 Davomat hisoboti

👥 Guruh: PN-1
📅 Sana: 17-avgust, 2026 (7-dars)
⏰ Yangilandi: 12:41

1. Jalmoliddin Anvarov ✅
2. Faridun Xolmurodov ❌
3. Farodis Xolmurodov 📝

✅ Keldi: 1  ·  ❌ Kelmadi: 1  ·  📝 Sababli: 1

Farzandingiz kech qolayotgan bo'lishi mumkin ⚠️
```

| CRM | Telegramda |
|---|---|
| **K** — Keldi | ✅ |
| **Y** — Yo'q | ❌ |
| **S** — Sababli | 📝 |
| belgilanmagan | ⚪️ |

> **S endi alohida belgi.** Eski tashqi bot faqat `came`/`not_came` ni bilardi
> va S ham ❌ bo'lib ko'rinardi. Bot o'zimizniki bo'lgani uchun bu cheklov yo'q.

---

## 4. Sana qanday aniqlanadi

CRM davomati dars **raqami** bo'yicha (1–12). Sana guruhning dars kunlaridan
hisoblanadi: oy ichidagi Du/Se/Ch/Pa/Ju/Sh kunlari ketma-ket sanaladi,
1-dars = birinchi shunday kun.

> ⚠️ **Dars kunlari belgilanmagan guruhda** sana aniqlanmaydi va hisobot
> yuborilmaydi — mentorga aniq xato chiqadi.

O'tgan darsni tuzatsangiz — hisobot ham **o'sha darsning** xabarida tuzatiladi.
Belgini **tozalasangiz** ham xabar yangilanadi (talaba ⚪️ ga qaytadi).

---

## 5. Ketma-ket belgilash

Mentor 12 ta katakni tez bossa, har biriga alohida xabar ketmaydi:
**1500 ms debounce** ularni bitta xabarga birlashtiradi. Chiquvchi so'rovlar
bitta navbatdan o'tadi (~25 so'rov/s) va Telegram 429 qaytarsa, u aytgan
muddat kutilib **o'sha xabar qayta yuboriladi** — hisobot yo'qolmaydi.

---

## 6. Nima yuborilmaydi

- Chat ID biriktirilmagan guruhlar (integratsiya o'sha guruh uchun o'chiq)
- Dars kunlari belgilanmagan guruhlar
- Talabasi yo'q guruhlar
- Talaba panelidan

Birinchisi jimgina o'tadi (bu "o'chirilgan" holat, xato emas). Qolganlarida
mentorga **aniq sabab** toast bo'lib chiqadi va brauzer console'iga
`[telegram]` prefiksi bilan yoziladi. Bir xil xato 60 soniyada bir martadan
ko'p qalqib chiqmaydi.

---

## 7. Diagnostika

| Endpoint | Nima qiladi |
|---|---|
| `GET /api/health` | `davomatBot` — token ishlayaptimi |
| `GET /api/telegram/status` | Botning username i |
| `GET /api/telegram/chats` | Bot ko'rgan guruhlar |
| `POST /api/telegram/attendance` | Hisobotni yuborish/tahrirlash |

Telegram xatolari mentorga **asl matni bilan** ko'rsatiladi:

| Xato | Sababi |
|---|---|
| `bot was kicked from the group chat` | Bot guruhdan chiqarilgan |
| `bot is not a member of the group chat` | Bot guruhga qo'shilmagan |
| `chat not found` | Chat ID xato |
| `not enough rights to send text messages` | Bot admin emas |
| `Unauthorized` | Token noto'g'ri/bekor qilingan |

---

## 8. Saqlanadigan holat

Yagona narsa — Telegram xabar id si, `telegram_reports` kolleksiyasida:

```
_id: "<groupId>:<year>:<month>:<lesson>"   →   { chatId, messageId, updatedAt }
```

Shu orqali bir dars uchun yangi xabar tashlanmay, bori tahrirlanadi. Yozuv
yo'qolsa ham tizim buzilmaydi — shunchaki yangi xabar yuboriladi.

---

# 💸 Qarzdorga xabar (Admin → Qarzdorlar sahifasi)

Admin panelidagi **💸 Qarzdorlar** sahifasida faqat qarzdor talabalar
ko'rinadi. Har bir qatorda va pastdagi tanlov panelida **ikkita alohida
tugma** bor:

| Tugma | Qayerga boradi | Sharti | Narxi |
|---|---|---|---|
| 📨 **Ota-onalar guruhiga** | guruhning Telegram chatiga (davomat hisoboti ketadigan o'sha chat) | guruhga chat ID biriktirilgan bo'lsin | bepul |
| 📱 **SMS jo'natish** | ota-onaning raqamiga (yo'q bo'lsa — talabanikiga) | serverda Eskiz sozlangan + raqam to'g'ri | har SMS pullik |

Qaysi tugma bosilsa, xabar **faqat o'sha kanal** orqali ketadi — ikkalasiga
birdan yuborilmaydi. Har bir talaba uchun natija alohida ko'rsatiladi
("yuborildi" deb aldab qo'yilmaydi).

Ro'yxatdagi belgilar kanal ishlashini oldindan aytadi:
**📨 Guruh ulangan / ⚠️ Guruh ulanmagan** va **📱 <raqam> / ⚠️ Raqam yo'q**.
Yuqoridagi filtrdan "kanal" bo'yicha saralash ham mumkin.

## 1. 📨 Ota-onalar guruhi kanali

Qo'shimcha sozlash kerak emas — davomat boti allaqachon o'sha guruhda.
Guruhga chat ID biriktirilmagan bo'lsa: **Guruhlar → ✏️ → 📨 Telegram
davomat boti → 🔍 Aniqlash**.

Xabar guruhga **yangi xabar** sifatida tushadi (davomat hisobotidan farqli —
u tahrirlanadi), shunda eslatmalar tarixi ko'rinib turadi.

> ⚠️ Guruhdagi hamma ko'radi — qarz summasi ommaviy bo'ladi. Maxfiy bo'lishi
> kerak bo'lsa SMS kanalidan foydalaning.

## 2. 📱 SMS kanali (Eskiz.uz)

### Sozlash

1. [eskiz.uz](https://eskiz.uz) da hisob oching, kabinetdan **API uchun
   login/parol** oling.
2. Yozing:

   | Qayerda | Nima qilinadi |
   |---|---|
   | Lokal | `backend/.env` → `ESKIZ_EMAIL`, `ESKIZ_PASSWORD` |
   | Render | `edumanage-crm` → Environment → o'sha ikkitasi |

   `ESKIZ_FROM` ixtiyoriy (standart `4546` — Eskizning umumiy nashr etuvchisi).

3. Serverni qayta ishga tushiring.

Tekshirish: `GET /api/notify/status` yoki `GET /api/health` → `sms` maydoni.
Sozlanmagan bo'lsa Qarzdorlar sahifasining tepasida qizil ogohlantirish
chiqadi va sababi yoziladi.

Token 30 kun amal qiladi, `smsSender.js` uni keshlaydi va muddati tugasa
avtomatik qayta login qiladi.

### ⚠️ Eskiz TEST rejimi

Yangi Eskiz hisobi **test rejimida** ochiladi — faqat uchta belgilangan matnni
yuborishga ruxsat beradi (`Bu Eskiz dan test`, `Это тест от Eskiz`,
`This is test from Eskiz`). Boshqa matn `test-mode` xatosi bilan qaytadi.
Haqiqiy xabar yuborish uchun kabinetda hisobni faollashtirish kerak.

### ⚠️ Eskiz moderatsiyasi

Eskiz **ixtiyoriy matnni yubormaydi**: matn kabinetdagi *"SMS shablonlari"*
bo'limida oldindan tasdiqlangan bo'lishi shart. Shuning uchun standart matn
qisqa va rasmiy qilib berilgan:

```
Hurmatli ota-ona, {ism} ({guruh}) uchun {qarz} som tolov muddati keldi. Oquv markazi.
```

Shu matnni Eskiz kabinetida bir marta tasdiqlatib oling. Tasdiqlanmagan matn
`message is not found in template` xatosi bilan qaytadi — CRM buni yashirmaydi,
javobda o'sha xato ko'rinadi.

### Raqam formati

CRM dagi raqam qanday yozilgan bo'lsa ham (`+998 90 123 45 67`,
`998901234567`, `901234567`) avtomatik `998XXXXXXXXX` ga keltiriladi.
Keltirib bo'lmasa — talaba ro'yxatda **⚠️ Raqam yo'q** deb belgilanadi va
unga yuborilmaydi.

### Narx

Har bir SMS pullik. Matn **70 belgidan** oshsa bitta o'rniga bir nechta SMS
yechiladi — shuning uchun xabar oynasida belgilar soni va taxminiy SMS soni
ko'rsatib turiladi.

## Xabar shabloni

Matn ichida quyidagilar avtomatik almashtiriladi:

| Belgi      | Ma'nosi              |
|------------|----------------------|
| `{ism}`    | talabaning ismi      |
| `{guruh}`  | guruh nomi           |
| `{qarz}`   | qarz summasi (so'm)  |

Har bir kanalning matni **alohida** saqlanadi (Telegram uchun uzunroq va
emojili, SMS uchun qisqa) va keyingi safar avtomatik chiqadi.

## API

| Endpoint | Tavsif |
|----------|--------|
| `GET  /api/notify/status`  | ikkala kanalning holati |
| `POST /api/notify/parents` | ota-onalar guruhiga |
| `POST /api/notify/sms`     | SMS |

So'rov tanasi ikki xil bo'lishi mumkin:

```json
{ "messages": [{ "studentId": 106, "text": "..." }] }   // har kimga o'z matni
{ "studentIds": [106, 148], "text": "..." }             // hammaga bir xil
```

Javob — har talaba uchun alohida natija:

```json
{ "ok": true, "sent": 1, "failed": 1,
  "results": [
    { "studentId": 106, "ok": true, "messageId": "123" },
    { "studentId": 148, "ok": false, "code": "no-group-chat",
      "error": "\"FD-1\" guruhiga Telegram chat ID biriktirilmagan" }
  ] }
```

Xato kodlari: `no-group-chat`, `bad-phone`, `no-config`, `test-mode`,
`not-template`, `blocked`, `provider`.
