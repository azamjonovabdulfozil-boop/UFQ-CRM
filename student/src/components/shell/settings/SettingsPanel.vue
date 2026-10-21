<template>
      <div id="panel-settings" class="panel">
        <div class="sett-page">
          <section class="sett-section" id="sett-sec-look">
            <header class="sett-sec-head">
              <h2 data-t="sett_sec_look">Ko'rinish</h2>
              <p data-t="sett_sec_look_sub">Mavzu, asosiy rang va matn o'lchami — faqat sizning qurilmangizda</p>
            </header>
            <AppearanceCard />
          </section>

          <section class="sett-section" id="sett-sec-menu">
            <header class="sett-sec-head">
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
</script>
