<template>
  <svg v-if="pts.length > 1" class="spark" :width="width" :height="height" :viewBox="`0 0 ${width} ${height}`" role="img" :aria-label="label">
    <path :d="area" class="spark-a" />
    <path :d="line" class="spark-l" fill="none" />
    <circle :cx="last[0]" :cy="last[1]" r="2.5" class="spark-d" />
  </svg>
  <span v-else class="spark-none muted small">—</span>
</template>

<script setup>
import { computed } from "vue";
const props = defineProps({
  values: { type: Array, default: () => [] },
  width: { type: Number, default: 96 },
  height: { type: Number, default: 28 },
  label: { type: String, default: "Trend" },
});
const pts = computed(() => {
  const v = props.values.map((x) => (x == null || !isFinite(x) ? 0 : x));
  if (v.length < 2) return [];
  const max = Math.max(1, ...v);
  const p = 3;
  return v.map((x, i) => [p + (i * (props.width - 2 * p)) / (v.length - 1), props.height - p - (x / max) * (props.height - 2 * p)]);
});
const line = computed(() => pts.value.map((q, i) => (i ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1)).join(" "));
const area = computed(() =>
  pts.value.length ? line.value + ` L${pts.value.at(-1)[0].toFixed(1)} ${props.height} L${pts.value[0][0].toFixed(1)} ${props.height} Z` : "",
);
const last = computed(() => pts.value.at(-1) || [0, 0]);
</script>

<style scoped>
.spark { display: block; overflow: visible; }
.spark-l { stroke: var(--s1); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.spark-a { fill: var(--s1); opacity: 0.1; }
.spark-d { fill: var(--s1); stroke: var(--surface); stroke-width: 1.5; }
</style>
