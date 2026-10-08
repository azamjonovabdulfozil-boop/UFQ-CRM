<template>
      <div id="panel-settings" class="panel">
        <div class="settings-wrap">
          <CrmNameCard />
          <LogoCard />
          <ThemeCard />
          <FontCard />
          <AccentCard />
          <DataCard />
          <!-- ADMIN SELF CREDENTIALS CARD - faqat admin ko'radi -->
          <AdminCredsCard />
          <!-- MENTOR CREDENTIALS CARD - faqat admin ko'radi -->
          <MentorCredsCard />
          <!-- STUDENT CREDENTIALS CARD - faqat admin ko'radi -->
          <StudentCredsCard />
          <!-- STUDENT PROFILE CARD - faqat talaba ko'radi -->
          <!-- STUDENT MOTIVATION CARD - faqat talaba ko'radi -->
          <StudentMotivationCard />
        </div>
      </div>
</template>

<script setup>
import CrmNameCard from "./CrmNameCard.vue";
import LogoCard from "./LogoCard.vue";
import ThemeCard from "./ThemeCard.vue";
import FontCard from "./FontCard.vue";
import AccentCard from "./AccentCard.vue";
import DataCard from "./DataCard.vue";
import AdminCredsCard from "./AdminCredsCard.vue";
import MentorCredsCard from "./MentorCredsCard.vue";
import StudentCredsCard from "./StudentCredsCard.vue";
import StudentMotivationCard from "./StudentMotivationCard.vue";
</script>
