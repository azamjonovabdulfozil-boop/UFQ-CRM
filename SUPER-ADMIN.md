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
