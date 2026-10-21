<template>
      <div id="panel-settings" class="panel">
        <div class="sett-shell">
          <!-- Chap: sozlamalar menyusi -->
          <nav class="sett-nav" aria-label="Sozlamalar">
            <div class="sett-nav-cap" data-t="settings">Sozlamalar</div>
            <button
              v-for="s in sections"
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

          <div class="sett-content">
            <section v-show="tab === 'look'" class="sett-pane">
              <header class="sett-pane-head">
                <h2 data-t="sett_sec_look">Ko'rinish</h2>
                <p data-t="sett_sec_look_sub">Mavzu, asosiy rang va matn o'lchami — faqat sizning qurilmangizda</p>
              </header>
              <AppearanceCard />
            </section>

            <section v-show="tab === 'menu'" class="sett-pane">
              <header class="sett-pane-head">
                <h2 data-t="sett_sec_menu">Menyu bo'limlari</h2>
                <p data-t="sett_sec_menu_sub">Chap menyuda qaysi bo'limlar ko'rinishini tanlang</p>
              </header>
              <NavVisibilityCard />
            </section>

            <!-- Faqat admin uchun kartalar — bu portalda ko'rsatilmaydi, lekin core
                 skriptlar ularni getElementById bilan qidirgani uchun DOM'da qoladi -->
            <div hidden>
              <CrmNameCard />
              <LogoCard />
              <DataCard />
              <AdminCredsCard />
              <MentorCredsCard />
              <StudentCredsCard />
              <StudentMotivationCard />
            </div>
          </div>
        </div>
      </div>
</template>

<script setup>
import AppearanceCard from "./AppearanceCard.vue";
import NavVisibilityCard from "./NavVisibilityCard.vue";
import CrmNameCard from "./CrmNameCard.vue";
import LogoCard from "./LogoCard.vue";
import DataCard from "./DataCard.vue";
import AdminCredsCard from "./AdminCredsCard.vue";
import MentorCredsCard from "./MentorCredsCard.vue";
import StudentCredsCard from "./StudentCredsCard.vue";
import StudentMotivationCard from "./StudentMotivationCard.vue";
import { SETT_ICONS, useSettingsTab } from "./settingsNav.js";

const sections = [
  { id: "look", t: "sett_sec_look", label: "Ko'rinish", sub: "Mavzu, rang, matn", icon: SETT_ICONS.look },
  { id: "menu", t: "sett_sec_menu", label: "Menyu bo'limlari", sub: "Menyuni sozlash", icon: SETT_ICONS.menu },
];

const { tab, open } = useSettingsTab(sections.map((s) => s.id));
</script>
