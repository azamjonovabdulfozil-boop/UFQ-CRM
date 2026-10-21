<template>
      <div id="panel-settings" class="panel">
        <div class="sett-page">
          <!-- Bo'limlarga tez o'tish -->
          <nav class="sett-jump" aria-label="Sozlamalar bo'limlari">
            <button v-for="s in sections" :key="s.id" type="button" class="sett-jump-btn" @click="jump(s.id)">
              <span :data-t="s.t">{{ s.label }}</span>
            </button>
          </nav>

          <section class="sett-section" id="sett-sec-look">
            <header class="sett-sec-head">
              <h2 data-t="sett_sec_look">Ko'rinish</h2>
              <p data-t="sett_sec_look_sub">Mavzu, asosiy rang va matn o'lchami — faqat sizning qurilmangizda</p>
            </header>
            <AppearanceCard />
          </section>

          <section class="sett-section" id="sett-sec-brand">
            <header class="sett-sec-head">
              <h2 data-t="sett_sec_brand">Brending</h2>
              <p data-t="sett_sec_brand_sub">CRM nomi va logotipi — hamma foydalanuvchilarga ko'rinadi</p>
            </header>
            <div class="sett-grid">
              <CrmNameCard />
              <LogoCard />
            </div>
          </section>

          <section class="sett-section" id="sett-sec-access">
            <header class="sett-sec-head">
              <h2 data-t="sett_sec_access">Hisoblar va xavfsizlik</h2>
              <p data-t="sett_sec_access_sub">Kirish loginlari, parollar va bloklangan qurilmalar</p>
            </header>
            <div class="sett-grid sett-grid-3">
              <AdminCredsCard />
              <MentorCredsCard />
              <StudentCredsCard />
            </div>
            <div class="sett-stack">
              <BlockedDevicesCard />
            </div>
          </section>

          <section class="sett-section" id="sett-sec-data">
            <header class="sett-sec-head">
              <h2 data-t="sett_sec_data">Ma'lumotlar</h2>
              <p data-t="sett_sec_data_sub">Zaxira nusxa olish va tozalash</p>
            </header>
            <DataCard />
          </section>

          <section class="sett-section" id="sett-sec-menu">
            <header class="sett-sec-head">
              <h2 data-t="sett_sec_menu">Menyu bo'limlari</h2>
              <p data-t="sett_sec_menu_sub">Chap menyuda qaysi bo'limlar ko'rinishini tanlang</p>
            </header>
            <NavVisibilityCard />
          </section>

          <!-- Talaba uchun eski karta — core skriptlar uni topishi uchun DOM'da qoladi -->
          <div hidden><StudentMotivationCard /></div>
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

const sections = [
  { id: "sett-sec-look", t: "sett_sec_look", label: "Ko'rinish" },
  { id: "sett-sec-brand", t: "sett_sec_brand", label: "Brending" },
  { id: "sett-sec-access", t: "sett_sec_access", label: "Hisoblar va xavfsizlik" },
  { id: "sett-sec-data", t: "sett_sec_data", label: "Ma'lumotlar" },
  { id: "sett-sec-menu", t: "sett_sec_menu", label: "Menyu bo'limlari" },
];

function jump(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}
</script>
