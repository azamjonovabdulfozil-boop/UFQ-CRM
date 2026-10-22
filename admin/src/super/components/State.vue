<template>
  <div v-if="loading" class="state" role="status" aria-live="polite">
    <div class="spin"></div>
    <div class="small">{{ loadingText }}</div>
  </div>
  <div v-else-if="error" class="state err" role="alert">
    <Icon name="alert" :size="26" />
    <div class="ttl">Ma'lumot yuklanmadi</div>
    <div class="small">{{ error }}</div>
    <button v-if="retry" class="btn sm" @click="retry"><Icon name="refresh" :size="14" /> Qayta urinish</button>
  </div>
  <div v-else-if="empty" class="state">
    <Icon name="info" :size="26" />
    <div class="ttl">{{ emptyTitle }}</div>
    <div v-if="emptyText" class="small">{{ emptyText }}</div>
  </div>
  <slot v-else />
</template>

<script setup>
import Icon from "./Icon.vue";
defineProps({
  loading: Boolean,
  error: { type: String, default: "" },
  empty: Boolean,
  emptyTitle: { type: String, default: "Ma'lumot yo'q" },
  emptyText: { type: String, default: "" },
  loadingText: { type: String, default: "Yuklanmoqda…" },
  retry: { type: Function, default: null },
});
</script>
