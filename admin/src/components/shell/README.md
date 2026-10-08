# `components/shell/` — CRM interfeysi

Ilgari butun interfeys `public/app-shell.html` da (bitta ~1740 qatorlik fayl) edi
va `innerHTML` bilan sahifaga tiqilardi. Endi u to'liq Vue komponentlariga
ko'chirilgan — HTML fayl ham, uni yuklovchi kod ham qolmadi.

```
CrmShell.vue                  ildiz
├── ImageLightbox.vue
├── LoginScreen.vue
├── AppLayout.vue             .layout > sidebar + main
│   ├── sidebar/AppSidebar.vue
│   │     SidebarBrand, NavMain, NavMentor, NavStudent,
│   │     NavExtra, SidebarFooter
│   ├── TopBar.vue
│   └── panels/PanelsArea.vue
│         Dashboard, Courses, Groups, MentorPanels, StudentPanels,
│         Mentors, Students, Tests, Grades, Finance, ShopPanels,
│         StudentGoals, AiPanels
│         └── settings/SettingsPanel.vue
│               CrmNameCard, LogoCard, ThemeCard, FontCard, AccentCard,
│               DataCard, AdminCredsCard, MentorCredsCard,
│               StudentCredsCard, StudentMotivationCard
├── modals/AppModals.vue
│         MainModal, DetailModal, AttendanceModal, DeleteModal,
│         FinanceModal, SalaryModal
└── AppToast.vue
```

## Muhim qoidalar

Bu komponentlar **ataylab statik** — hech qanday `ref`, `props` yoki reaktiv
holat yo'q. Sabab: butun mantiq `public/core/*.js` dagi vanilla skriptlarda va
ular DOM ga to'g'ridan-to'g'ri tegadi.

1. **`id` larni o'zgartirmang.** Core skriptlar `document.getElementById()`
   bilan aynan shu nomlarni qidiradi.
2. **`onclick="..."` larni `@click` ga aylantirmang.** Ular global funksiyalarni
   (`go()`, `doLogin()`, `renderCourses()` …) chaqiradi; Vue satr qiymatli
   `onclick` ni `setAttribute` orqali qo'yadi, shuning uchun ular ishlaydi.
3. **Reaktiv holat qo'shmang.** Komponentlar statik bo'lgani uchun Vue ularni
   bir marta chizadi va boshqa qayta chizmaydi — core skriptlar `innerHTML`
   bilan kiritgan narsalar joyida qoladi. Reaktivlik qo'shilsa, qayta render
   ularni o'chirib yuboradi.
4. **Element tartibini saqlang.** Ba'zi CSS qoidalari qo'shni selektorlarga
   tayanadi.

Bo'shliqlar `vite.config.js` da `whitespace: "preserve"` bilan xom HTML dagidek
saqlanadi — DOM eski `app-shell.html` bilan bir xil chiqishi uchun.
