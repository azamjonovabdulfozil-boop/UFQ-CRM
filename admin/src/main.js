import { createApp } from 'vue'
import App from './App.vue'
import router from './router/index.js'
import { useAuthStore } from './stores/auth.js'

// ─── Backend manzilini AVTOMATIK aniqlash ────────────────────────────────────
// Bitta kod — ikkala muhitda ham ishlaydi, hech narsa o'zgartirish shart emas:
//
//   • Localhost (vite dev yoki `node backend/server.js`)
//       → lokal backend: http://localhost:3000
//   • Vercel / Render (push qilingandan keyin)
//       → prod backend: __API_BASE__ (VITE_API_URL yoki standart onrender)
//
// Oddiy /api/... so'rovlari PROD da nisbiy qoladi (Vercel ularni backend'ga
// proxy qiladi — hozir ishlab turgan yo'l buzilmasin). LOCAL da esa to'g'ridan
// to'g'ri lokal backend'ga boradi.
//
// SSE (realtime oqim) HAR DOIM to'liq manzil bilan ulanadi — proxy'lar
// uzluksiz oqimni buferlab/uzib qo'yishi mumkin.
const PROD_API =
  typeof __API_BASE__ !== 'undefined' && __API_BASE__ ? __API_BASE__ : ''
const LOCAL_API_PORT =
  typeof __LOCAL_API_PORT__ !== 'undefined' ? String(__LOCAL_API_PORT__) : '3000'

function resolveBackend() {
  const { hostname, protocol, port } = window.location
  const isLocal =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.local') ||
    /^192\.168\./.test(hostname) ||
    /^10\./.test(hostname)

  if (!isLocal) return { api: '', sse: PROD_API }

  // Backend sahifani o'zi bergan bo'lsa (localhost:3000/student) — o'sha origin
  // Backend panelni o'zi bergan bo'lsa (istalgan PORT) — API ham o'sha manzilda.
  // Boshqa portga faqat Vite dev/preview serveridan murojaat qilinadi.
  const base =
    port === LOCAL_API_PORT || !/^(5173|5174|5175|5176|5177|5178|4173)$/.test(port) ? '' : `${protocol}//${hostname}:${LOCAL_API_PORT}`
  return { api: base, sse: base }
}

// Super Admin oddiy CRM panelini ochmoqchi (?crm=1) — router /dashboard ga
// yo'naltirganda query yo'qoladi, shuning uchun belgini oldindan saqlaymiz.
try {
  if (new URLSearchParams(window.location.search).get('crm') === '1')
    sessionStorage.setItem('edu_super_crm', '1')
} catch (e) {}

const backend = resolveBackend()
// core/*.js skriptlari shu global'larni o'qiydi
window.__API_BASE__ = backend.api
window.__SSE_BASE__ = backend.sse

const app = createApp(App)
app.use(router)

// Auth state ni tiklash
const auth = useAuthStore()
auth.init()

app.mount('#app')
