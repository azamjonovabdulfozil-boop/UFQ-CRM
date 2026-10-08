import { createRouter, createWebHistory } from 'vue-router'

const StudentLayout = () => import('../layouts/StudentLayout.vue')
const BlankPage     = { template: '<div></div>' }

const routes = [
  {
    path: '/',
    component: StudentLayout,
    children: [
      { path: '', redirect: '/dashboard' },
      { path: 'dashboard', name: 'StudentDashboard', component: BlankPage },
      { path: ':pathMatch(.*)*', redirect: '/dashboard' },
    ],
  },
]

/**
 * Router bazasi — QURISH paytida emas, sahifa ochilganda aniqlanadi.
 *
 * 🔧 BUG FIX: portallar `base: "/"` bilan build qilinadi, chunki Vercel'da
 * har biri O'Z domenining ildizida turadi. Backend esa uchalasini bitta
 * domen ostida beradi (`/admin`, `/mentor`, `/student`). Baza "/" bo'lib
 * qolganda router `/dashboard` ga o'tardi va sahifa YANGILANGANDA (yoki
 * chiqishdan keyingi `location.reload()` da) server o'sha manzilni topa
 * olmay **404** qaytarardi — ilova ochilmay qolardi.
 * Endi manzilda portal prefiksi bo'lsa, baza ham o'shanga tenglashadi.
 */
function resolveBase() {
  const built = import.meta.env.BASE_URL || '/'
  if (built !== '/') return built
  const m = window.location.pathname.match(/^\/(admin|mentor|student)(\/|$)/)
  return m ? `/${m[1]}/` : '/'
}

const base = resolveBase()
const router = createRouter({ history: createWebHistory(base), routes })
router.afterEach(() => { document.title = 'EduManage — Talaba' })
export default router
