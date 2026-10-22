<template>
  <div class="bl">
    <div v-if="!items.length" class="muted small" style="padding: 12px 0">Ma'lumot yetarli emas</div>
    <div
      v-for="it in items"
      :key="it.key || it.label"
      class="bl-row"
      :class="{ click: !!it.onClick }"
      :title="it.title || ''"
      @click="it.onClick && it.onClick()"
    >
      <div class="bl-l">
        <span class="bl-name">{{ it.label }}</span>
        <span v-if="it.sub" class="bl-sub">{{ it.sub }}</span>
      </div>
      <div class="bl-bar">
        <i v-if="it.value != null" :style="{ width: Math.max(1.5, (Math.max(0, it.value) / scale) * 100) + '%', background: it.color || 'var(--s1)' }"></i>
      </div>
      <div class="bl-v">{{ it.value == null ? "—" : it.text != null ? it.text : it.value + unit }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
const props = defineProps({
  items: { type: Array, default: () => [] },
  max: { type: Number, default: null },
  unit: { type: String, default: "" },
});
const scale = computed(() => props.max || Math.max(1, ...props.items.map((x) => x.value || 0)));
</script>

<style scoped>
.bl { display: grid; gap: 9px; }
.bl-row { display: grid; grid-template-columns: minmax(110px, 38%) 1fr 64px; gap: 10px; align-items: center; font-size: 13px; }
.bl-row.click { cursor: pointer; }
.bl-row.click:hover .bl-name { color: var(--accent-text); }
.bl-l { min-width: 0; display: flex; flex-direction: column; }
.bl-name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bl-sub { font-size: 11.5px; color: var(--text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bl-bar { height: 10px; background: var(--surface-3); border-radius: 4px; overflow: hidden; }
.bl-bar i { display: block; height: 100%; border-radius: 4px; }
.bl-v { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
</style>
