<template>
  <!-- Sessiya tekshirilmoqda -->
  <div v-if="!session.ready" class="gate">
    <div class="spin"></div>
    <div class="muted small">Sessiya tekshirilmoqda…</div>
  </div>

  <!-- Xato -->
  <div v-else-if="session.error" class="gate">
    <Icon name="alert" :size="32" />
    <h2>Panel yuklanmadi</h2>
    <p class="muted">{{ session.error }}</p>
    <button class="btn pri" @click="reload">Qayta urinish</button>
  </div>

  <!-- Ruxsat yo'q (oddiy admin URL orqali kirmoqchi bo'lsa) -->
  <div v-else-if="session.forbidden" class="gate">
    <div class="gate-ic bad"><Icon name="lock" :size="30" /></div>
    <h2>Ruxsat yo'q</h2>
    <p class="muted">
      Bu bo'lim faqat Super Admin uchun. Siz
      <b>{{ session.user?.username }}</b> sifatida kirgansiz. Urinish xavfsizlik jurnaliga yozildi.
    </p>
    <div class="row" style="justify-content: center">
      <a class="btn" :href="portalUrl()">Admin paneliga qaytish</a>
      <button class="btn danger" @click="logout">Chiqish</button>
    </div>
  </div>

  <!-- Panel -->
  <div v-else class="sa-shell">
    <div class="sa-backdrop" :class="{ open: ui.navOpen }" @click="ui.navOpen = false"></div>
    <aside class="sa-side" :class="{ open: ui.navOpen, collapsed: ui.collapsed }" aria-label="Asosiy menyu">
      <div class="sa-brand">
        <div class="sa-brand-mark"><Icon name="crown" :size="20" /></div>
        <div class="sa-brand-txt">
          <div class="sa-brand-t">{{ brandName }}</div>
          <div class="sa-brand-s">Super Admin</div>
        </div>
      </div>
      <nav class="sa-nav">
        <template v-for="(n, i) in NAV" :key="i">
          <div v-if="n.group" class="sa-nav-g">{{ n.group }}</div>
          <router-link v-else :to="n.path" :title="ui.collapsed ? n.name : undefined" @click="ui.navOpen = false">
            <Icon :name="n.icon" :size="18" /><span class="sa-lbl">{{ n.name }}</span>
          </router-link>
        </template>
      </nav>
      <div class="sa-side-foot">
        <a class="sa-side-btn" :href="portalUrl('?crm=1')" title="Oddiy CRM paneli (tahrirlash uchun)">
          <Icon name="external" :size="17" /><span class="sa-lbl">CRM boshqaruv paneli</span>
        </a>
        <button class="sa-side-btn sa-collapse-btn" @click="ui.collapsed = !ui.collapsed" :aria-label="ui.collapsed ? 'Menyuni ochish' : 'Menyuni yig\'ish'">
          <Icon :name="ui.collapsed ? 'right' : 'left'" :size="17" /><span class="sa-lbl">Menyuni yig'ish</span>
        </button>
      </div>
    </aside>

    <div class="sa-main">
      <header class="sa-top">
        <button class="btn ghost icon sa-burger" aria-label="Menyu" @click="ui.navOpen = true"><Icon name="burger" /></button>
        <div class="grow"><h1>{{ $route.meta.title || "Super Admin" }}</h1></div>
        <button class="btn ghost icon" :title="themeTitle" :aria-label="themeTitle" @click="cycleTheme">
          <Icon :name="ui.theme === 'dark' ? 'moon' : ui.theme === 'light' ? 'sun' : 'auto'" />
        </button>
        <div class="sa-user">
          <router-link to="/profile" class="sa-av" :title="session.user?.username">{{ initials }}</router-link>
          <div class="sa-user-txt">
            <div style="font-weight: 700; font-size: 13px; line-height: 1.2">{{ session.user?.name || session.user?.username }}</div>
            <div class="muted" style="font-size: 11.5px">Super Admin · {{ session.user?.username }}</div>
          </div>
          <button class="btn ghost icon" title="Chiqish" aria-label="Chiqish" @click="askLogout = true"><Icon name="logout" /></button>
        </div>
      </header>
      <main class="sa-content">
        <router-view v-slot="{ Component }">
          <component :is="Component" />
        </router-view>
      </main>
    </div>

    <Modal v-if="askLogout" title="Tizimdan chiqish" @close="askLogout = false">
      <p>Sessiya serverda ham yopiladi. Davom etasizmi?</p>
      <template #foot>
        <button class="btn" @click="askLogout = false">Bekor qilish</button>
        <button class="btn pri" @click="logout">Chiqish</button>
      </template>
    </Modal>
  </div>

  <div class="toasts" aria-live="polite">
    <div v-for="t in toasts" :key="t.id" class="toast" :class="t.kind">{{ t.text }}</div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from "vue";
import { session, boot, logout, portalUrl, api } from "./api.js";
import { ui, toasts } from "./store.js";
import { NAV } from "./router.js";
import Icon from "./components/Icon.vue";
import Modal from "./components/Modal.vue";

const askLogout = ref(false);
const brandName = ref("EduManage");
const initials = computed(() => (session.user?.name || session.user?.username || "SA").slice(0, 2).toUpperCase());
const themeTitle = computed(() => ({ auto: "Mavzu: avtomatik", light: "Mavzu: yorug'", dark: "Mavzu: qorong'i" })[ui.theme]);
function cycleTheme() {
  ui.theme = ui.theme === "auto" ? "light" : ui.theme === "light" ? "dark" : "auto";
}
const reload = () => location.reload();

onMounted(async () => {
  await boot();
  if (session.user && !session.forbidden) {
    try {
      const s = await api("/api/super/settings");
      brandName.value = s.branding?.crmName || "EduManage";
    } catch {}
  }
});
</script>

<style>
.gate { min-height: 100vh; min-height: 100dvh; display: grid; place-content: center; justify-items: center; gap: 12px; text-align: center; padding: 24px; max-width: 520px; margin: 0 auto; }
.gate h2 { font-size: 22px; }
.gate-ic { width: 64px; height: 64px; border-radius: 18px; display: grid; place-items: center; }
.gate-ic.bad { background: var(--bad-soft); color: var(--bad); }
</style>
