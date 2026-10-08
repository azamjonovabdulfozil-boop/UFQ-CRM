/**
 * stores/auth.js — Markaziy autentifikatsiya store
 *
 * ⚠️ XAVFSIZLIK QAYTA QURILDI
 * Ilgari bu store `/api/users` dan barcha loginlarni PAROLI BILAN yuklab,
 * parolni brauzerda solishtirardi va standart `admin/admin123` ni kodda
 * saqlardi. Bu quyidagilarni anglatardi:
 *   • istalgan odam `/api/users` ga kirib admin parolini o'qib olardi;
 *   • `localStorage.edumanage_auth_v10` ni tahrirlab admin bo'lib olish mumkin edi.
 *
 * Endi kirish va rol tekshiruvi FAQAT serverda. Bu store server bilan
 * `window.CRMAuth` (core/secure-auth.js) orqali gaplashadi va faqat UI holatini
 * saqlaydi — bu yerdagi qiymatlarni o'zgartirish hech qanday huquq bermaydi,
 * chunki API har so'rovda serverdagi tokenni tekshiradi.
 *
 * Role: 'Super Admin' | 'Mentor' | 'Talaba'
 */
import { reactive, computed } from 'vue'

const AUTH_KEY = 'edumanage_auth_v10'
const MENTOR_USERS_KEY = 'edumanage_mentor_users_v8'
const STUDENT_USERS_KEY = 'edumanage_student_users_v9'

function _authRead() {
  try {
    const ls = localStorage.getItem(AUTH_KEY)
    if (ls) return JSON.parse(ls)
    const ss = sessionStorage.getItem(AUTH_KEY)
    if (ss) return JSON.parse(ss)
  } catch (e) {}
  return {}
}

function _authDelete() {
  try { Storage.prototype.removeItem.call(localStorage, AUTH_KEY) } catch (e) {}
  try { sessionStorage.removeItem(AUTH_KEY) } catch (e) {}
}

/** core/secure-auth.js yuklanganini kutamiz (crmBoot uni birinchi guruhda yuklaydi). */
function crmAuth() {
  return typeof window !== 'undefined' ? window.CRMAuth : null
}

// Singleton store (reactive object, Pinia o'rniga yengil variant)
const state = reactive({
  loggedIn: false,
  ready: false,        // sessiya server bilan tekshirib bo'lindimi
  name: '',
  role: '',            // 'Super Admin' | 'Mentor' | 'Talaba'
  username: '',
  mentorName: null,
  studentId: null,
  studentName: null,
  mustChangePassword: false,
})

function applyUser(user) {
  Object.assign(state, {
    loggedIn: !!user,
    name: user?.name || '',
    role: user?.legacyRole || '',
    username: user?.username || '',
    mentorName: user?.mentorName || null,
    studentId: user?.studentId ?? null,
    studentName: user?.studentName || null,
    mustChangePassword: !!user?.mustChangePassword,
  })
  return user
}

export function useAuthStore() {
  const isAdmin   = computed(() => state.role === 'Super Admin')
  const isMentor  = computed(() => state.role === 'Mentor')
  const isStudent = computed(() => state.role === 'Talaba')
  const isLoggedIn = computed(() => state.loggedIn)

  /**
   * Sessiyani SERVERDAN tiklaydi (httpOnly cookie orqali).
   * localStorage faqat sahifa "sakramasligi" uchun boshlang'ich ko'rinish beradi;
   * yakuniy qaror serverniki.
   */
  async function init() {
    const cached = _authRead()
    if (cached.loggedIn) {
      state.name = cached.name || ''
      state.role = cached.role || ''
      state.mentorName = cached.mentorName || null
      state.studentId = cached.studentId ?? null
      state.studentName = cached.studentName || null
    }

    const A = crmAuth()
    if (!A) {
      // Sessiya qatlami yuklanmagan — kirgan deb hisoblamaymiz.
      applyUser(null)
      state.ready = true
      return null
    }

    A.onExpired(() => {
      applyUser(null)
      _authDelete()
    })

    const user = await A.restore()
    applyUser(user)
    if (!user) _authDelete()
    state.ready = true
    return user
  }

  /**
   * Kirish — parol SERVERDA tekshiriladi.
   * @returns {Promise<{ok:boolean, error?:string, code?:string, role?:string}>}
   */
  async function login(username, password) {
    const A = crmAuth()
    if (!A) return { ok: false, error: 'Sessiya qatlami yuklanmadi. Sahifani yangilang.' }

    const out = await A.login(username, password)
    if (!out.ok) return { ok: false, error: out.error, code: out.code, retryAfter: out.retryAfter }

    applyUser(out.user)
    return {
      ok: true,
      role: state.role,
      mustChangePassword: state.mustChangePassword,
    }
  }

  /** Parolni almashtirish (majburiy holatda ham shu ishlatiladi). */
  async function changePassword(currentPassword, newPassword) {
    const A = crmAuth()
    if (!A) return { ok: false, error: 'Sessiya qatlami yuklanmadi' }
    const r = await A.changePassword(currentPassword, newPassword)
    if (r?.ok) applyUser(r.user || A.user())
    return r
  }

  /** Chiqish — serverdagi sessiya ham yopiladi. */
  async function logout() {
    const A = crmAuth()
    try { if (A) await A.logout() } catch (e) {}
    _authDelete()
    applyUser(null)
  }

  /**
   * Foydalanuvchilar ro'yxati — PAROLSIZ (server uni bermaydi).
   * Faqat ro'yxat ko'rsatish uchun.
   */
  async function getAllUsers() {
    try {
      const r = await fetch('/api/users')
      if (r.ok) {
        const data = await r.json()
        if (Array.isArray(data.mentors))
          localStorage.setItem(MENTOR_USERS_KEY, JSON.stringify(data.mentors))
        if (Array.isArray(data.students))
          localStorage.setItem(STUDENT_USERS_KEY, JSON.stringify(data.students))
        return [...(data.mentors || []), ...(data.students || [])]
      }
    } catch (e) {}
    try {
      return [
        ...JSON.parse(localStorage.getItem(MENTOR_USERS_KEY) || '[]'),
        ...JSON.parse(localStorage.getItem(STUDENT_USERS_KEY) || '[]'),
      ]
    } catch (e) { return [] }
  }

  return {
    state,
    isAdmin,
    isMentor,
    isStudent,
    isLoggedIn,
    init,
    login,
    logout,
    changePassword,
    getAllUsers,
  }
}
