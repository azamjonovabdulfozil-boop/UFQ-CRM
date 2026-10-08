<template>
  <!-- Xatolik -->
  <div v-if="error" class="boot-error">
    <span>
      <svg class="boot-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
      {{ error }}
    </span>
    <button @click="$emit('retry')">
      <svg class="boot-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/></svg>
      Qayta yuklash
    </button>
  </div>

  <!-- Yuklanmoqda -->
  <div v-else class="boot-screen">
    <div class="boot-spinner"></div>
    <p class="boot-text">EduManage yuklanmoqda…</p>
  </div>
</template>

<script setup>
defineProps({
  // Bo'sh bo'lsa — yuklanish ekrani, aks holda xato ekrani.
  error: { type: String, default: "" },
});
defineEmits(["retry"]);
</script>

<style scoped>
/* Urg'u rangini har bir portal #crm-root da --boot-accent orqali beradi. */
.boot-screen,
.boot-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100dvh;
  gap: 1rem;
  background: #0f172a;
  font-family: system-ui, sans-serif;
}
.boot-spinner {
  width: 48px;
  height: 48px;
  border: 4px solid #1e293b;
  border-top-color: var(--boot-accent, #6366f1);
  border-radius: 50%;
  animation: bspin 0.8s linear infinite;
}
@keyframes bspin {
  to {
    transform: rotate(360deg);
  }
}
.boot-text {
  color: #94a3b8;
  font-size: 0.95rem;
}
.boot-error {
  color: #ef4444;
}
.boot-error button {
  padding: 0.5rem 1.25rem;
  background: var(--boot-accent, #6366f1);
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
}
.boot-ic {
  width: 1.1em;
  height: 1.1em;
  flex: 0 0 auto;
  vertical-align: -0.16em;
}
</style>
