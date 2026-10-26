<template>
  <nav v-if="total > 0" class="sa-pager" aria-label="Sahifalash">
    <button type="button" class="sa-pg-btn" :disabled="page <= 1" @click="$emit('go', page - 1)">
      <span aria-hidden="true">←</span> Orqaga
    </button>
    <span class="sa-pg-info"><b>{{ page }}</b> / {{ pages }}</span>
    <button type="button" class="sa-pg-btn" :disabled="page >= pages" @click="$emit('go', page + 1)">
      Keyingi <span aria-hidden="true">→</span>
    </button>
  </nav>
</template>

<script setup>
// Butun Super Admin paneli uchun yagona sahifalash: [← Orqaga] 1 / N [Keyingi →]
defineProps({
  page: { type: Number, default: 1 },
  pages: { type: Number, default: 1 },
  total: { type: Number, default: 0 },
});
defineEmits(["go"]);
</script>

<style scoped>
.sa-pager {
  display: grid; grid-template-columns: minmax(0, 1fr) 88px minmax(0, 1fr);
  align-items: center; column-gap: 14px; margin-top: 16px; width: 100%;
}
.sa-pager > .sa-pg-btn:first-child { justify-self: end; }
.sa-pager > .sa-pg-btn:last-child { justify-self: start; }
.sa-pg-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  min-width: 112px; height: 38px; padding: 0 18px;
  border: 1px solid var(--border-2); border-radius: 999px;
  background: var(--surface); color: var(--text);
  font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer;
  transition: background 0.18s, color 0.18s, border-color 0.18s, transform 0.12s;
}
.sa-pg-btn:hover:not(:disabled) { background: var(--accent); border-color: var(--accent); color: #fff; }
.sa-pg-btn:active:not(:disabled) { transform: scale(0.97); }
.sa-pg-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.sa-pg-info { width: 100%; min-width: 0; text-align: center; font-size: 14px; color: var(--text-3); font-variant-numeric: tabular-nums; white-space: nowrap; }
.sa-pg-info b { color: var(--text); }
@media (max-width: 600px) {
  .sa-pager { grid-template-columns: minmax(0, 1fr) 72px minmax(0, 1fr); column-gap: 10px; }
  .sa-pg-btn { min-width: 0; width: 100%; max-width: 150px; padding: 0 10px; font-size: 13px; }
}
</style>
