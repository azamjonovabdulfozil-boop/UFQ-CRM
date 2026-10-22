import { createRouter, createWebHashHistory } from "vue-router";

export const NAV = [
  { group: "Asosiy" },
  { path: "/dashboard", name: "Bosh sahifa", icon: "home", comp: () => import("./pages/Dashboard.vue") },
  { path: "/analytics", name: "CRM analitikasi", icon: "chart", comp: () => import("./pages/Analytics.vue") },
  { path: "/teachers", name: "Eng yaxshi o'qituvchilar", icon: "trophy", comp: () => import("./pages/Teachers.vue") },
  { path: "/insights", name: "Aqlli tavsiyalar", icon: "spark", comp: () => import("./pages/Insights.vue") },
  { path: "/data", name: "Markaziy ma'lumotlar", icon: "db", comp: () => import("./pages/DataCenter.vue") },
  { group: "Boshqaruv" },
  { path: "/admins", name: "Administratorlar", icon: "users", comp: () => import("./pages/Admins.vue") },
  { path: "/menu", name: "Menyu boshqaruvi", icon: "menu", comp: () => import("./pages/MenuControl.vue") },
  { path: "/settings", name: "Tizim sozlamalari", icon: "gear", comp: () => import("./pages/Settings.vue") },
  { group: "Nazorat" },
  { path: "/monitoring", name: "Tizim monitoringi", icon: "pulse", comp: () => import("./pages/Monitoring.vue") },
  { path: "/activity", name: "Faoliyat tarixi", icon: "list", comp: () => import("./pages/Activity.vue") },
  { path: "/reports", name: "Hisobotlar", icon: "file", comp: () => import("./pages/Reports.vue") },
  { path: "/backups", name: "Zaxira nusxalari", icon: "archive", comp: () => import("./pages/Backups.vue") },
  { group: "Hisob" },
  { path: "/profile", name: "Profil va xavfsizlik", icon: "shield", comp: () => import("./pages/Profile.vue") },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", redirect: "/dashboard" },
    ...NAV.filter((n) => n.path).map((n) => ({ path: n.path, component: n.comp, meta: { title: n.name } })),
    { path: "/:p(.*)*", redirect: "/dashboard" },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
router.afterEach((to) => {
  document.title = (to.meta.title ? to.meta.title + " — " : "") + "Super Admin";
});
