<template>
      <div id="panel-settings" class="panel">
        <div class="sett-shell">
          <!-- Chap: sozlamalar menyusi -->
          <nav class="sett-nav" aria-label="Sozlamalar">
            <div class="sett-nav-cap" data-t="settings">Sozlamalar</div>
            <button
              v-for="s in visibleSections"
              :key="s.id"
              type="button"
              class="sett-nav-item"
              :class="{ active: tab === s.id }"
              @click="open(s.id)"
            >
              <span class="sett-nav-ic" v-html="s.icon"></span>
              <span class="sett-nav-txt">
                <b :data-t="s.t">{{ s.label }}</b>
                <small :data-t="'sett_nav_' + s.id">{{ s.sub }}</small>
              </span>
            </button>
          </nav>

          <!-- O'ng: tanlangan bo'lim. Hamma kartalar DOM'da qoladi (v-show) —
               core skriptlar ularni id bo'yicha topadi. -->
          <div class="sett-content">
            <section v-show="tab === 'look'" class="sett-pane">
              <header class="sett-pane-head">
                <h2 data-t="sett_sec_look">Ko'rinish</h2>
                <p data-t="sett_sec_look_sub">Mavzu, asosiy rang va matn o'lchami — faqat sizning qurilmangizda</p>
              </header>
              <AppearanceCard />
            </section>

            <section v-show="tab === 'brand'" class="sett-pane">
              <header class="sett-pane-head">
                <h2 data-t="sett_sec_brand">Brending</h2>
                <p data-t="sett_sec_brand_sub">CRM nomi va logotipi — hamma foydalanuvchilarga ko'rinadi</p>
              </header>
              <CrmNameCard />
              <LogoCard />
            </section>

            <section v-show="tab === 'access'" class="sett-pane">
              <header class="sett-pane-head">
                <h2 data-t="sett_sec_access">Hisoblar</h2>
                <p data-t="sett_sec_access_sub">Admin, mentor va talabalarning kirish loginlari va parollari</p>
              </header>
              <AdminCredsCard />
              <MentorCredsCard />
              <StudentCredsCard />
            </section>

            <section v-show="tab === 'devices'" class="sett-pane">
              <header class="sett-pane-head">
                <h2 data-t="sett_sec_devices">Xavfsizlik</h2>
                <p data-t="sett_sec_devices_sub">Parol ko'p marta xato kiritilgani uchun bloklangan qurilmalar</p>
              </header>
              <BlockedDevicesCard />
            </section>

            <section v-show="tab === 'data'" class="sett-pane">
              <header class="sett-pane-head">
                <h2 data-t="sett_sec_data">Ma'lumotlar</h2>
                <p data-t="sett_sec_data_sub">Zaxira nusxa olish va tozalash</p>
              </header>
              <DataCard />
            </section>

            <section v-show="tab === 'menu' && settingsMenuAllowed" class="sett-pane">
              <header class="sett-pane-head">
                <h2 data-t="sett_sec_menu">Menyu bo'limlari</h2>
                <p data-t="sett_sec_menu_sub">Chap menyuda qaysi bo'limlar ko'rinishini tanlang</p>
              </header>
              <NavVisibilityCard />
            </section>

            <!-- Talaba uchun eski karta — core skriptlar uni topishi uchun DOM'da qoladi -->
            <div hidden><StudentMotivationCard /></div>
          </div>
        </div>
      </div>
</template>

<script setup>
import AppearanceCard from "./AppearanceCard.vue";
import CrmNameCard from "./CrmNameCard.vue";
import LogoCard from "./LogoCard.vue";
import DataCard from "./DataCard.vue";
import AdminCredsCard from "./AdminCredsCard.vue";
import MentorCredsCard from "./MentorCredsCard.vue";
import StudentCredsCard from "./StudentCredsCard.vue";
import BlockedDevicesCard from "./BlockedDevicesCard.vue";
import StudentMotivationCard from "./StudentMotivationCard.vue";
import NavVisibilityCard from "./NavVisibilityCard.vue";
import { computed, watch } from "vue";
import { SETT_ICONS, useSettingsTab, settingsMenuAllowed } from "./settingsNav.js";

const sections = [
  { id: "look", t: "sett_sec_look", label: "Ko'rinish", sub: "Mavzu, rang, matn", icon: SETT_ICONS.look },
  { id: "brand", t: "sett_sec_brand", label: "Brending", sub: "Nom va logotip", icon: SETT_ICONS.brand },
  { id: "access", t: "sett_sec_access", label: "Hisoblar", sub: "Login va parollar", icon: SETT_ICONS.access },
  { id: "devices", t: "sett_sec_devices", label: "Xavfsizlik", sub: "Bloklangan qurilmalar", icon: SETT_ICONS.devices },
  { id: "data", t: "sett_sec_data", label: "Ma'lumotlar", sub: "Zaxira va tozalash", icon: SETT_ICONS.data },
  { id: "menu", t: "sett_sec_menu", label: "Menyu bo'limlari", sub: "Menyuni sozlash", icon: SETT_ICONS.menu },
];

const { tab, open } = useSettingsTab(sections.map((s) => s.id));

// «Menyu bo'limlari» Super Admin tomonidan yopilgan bo'lsa — umuman ko'rinmaydi
const visibleSections = computed(() => sections.filter((s) => s.id !== "menu" || settingsMenuAllowed.value));
watch(
  settingsMenuAllowed,
  (ok) => {
    if (!ok && tab.value === "menu") open(sections[0].id);
  },
  { immediate: true },
);
</script>
