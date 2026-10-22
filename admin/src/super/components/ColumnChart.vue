<template>
  <div class="cc" ref="wrap">
    <div v-if="!hasData" class="cc-empty" :style="{ height: height + 'px' }">{{ emptyText }}</div>
    <svg v-else :width="w" :height="height" :viewBox="`0 0 ${w} ${height}`" role="img" :aria-label="ariaLabel" @mouseleave="hover = -1">
      <g class="cc-grid">
        <line v-for="t in ticks" :key="t" :x1="padL" :x2="w - padR" :y1="y(t)" :y2="y(t)" />
      </g>
      <g class="cc-axis">
        <text v-for="t in ticks" :key="'t' + t" :x="padL - 8" :y="y(t) + 4" text-anchor="end">{{ t }}</text>
        <text v-for="(l, i) in labels" v-show="i % step === 0" :key="'x' + i" :x="cx(i)" :y="height - 6" text-anchor="middle">{{ l }}</text>
      </g>
      <g v-for="(v, i) in values" :key="i">
        <path v-if="v > 0" :d="bar(i, v)" :fill="hover === i ? 'var(--accent)' : color" />
        <rect :x="cx(i) - slot / 2" :y="padT" :width="slot" :height="height - padT - padB" fill="transparent" @mouseenter="hover = i" @touchstart.passive="hover = i" />
      </g>
    </svg>
    <div v-if="hover >= 0" class="cc-tip" :style="{ left: Math.min(cx(hover) + 10, w - 170) + 'px' }">
      <b>{{ tipLabels[hover] || labels[hover] }}</b><br />{{ name }}: <b>{{ values[hover] == null ? "—" : values[hover] }}</b>
      <template v-if="extra && extra[hover]"><br /><span class="muted">{{ extra[hover] }}</span></template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
const props = defineProps({
  labels: { type: Array, default: () => [] },
  tipLabels: { type: Array, default: () => [] },
  values: { type: Array, default: () => [] },
  extra: { type: Array, default: null },
  name: { type: String, default: "Soni" },
  height: { type: Number, default: 200 },
  color: { type: String, default: "var(--s1)" },
  ariaLabel: { type: String, default: "Ustunli grafik" },
  emptyText: { type: String, default: "Bu davrda yozuv yo'q" },
});
const wrap = ref(null);
const w = ref(600);
const hover = ref(-1);
const padL = 36, padR = 10, padT = 10, padB = 24;
let ro;
onMounted(() => {
  ro = new ResizeObserver(() => wrap.value && (w.value = Math.max(240, wrap.value.clientWidth)));
  ro.observe(wrap.value);
});
onBeforeUnmount(() => ro && ro.disconnect());
const hasData = computed(() => props.values.some((v) => v > 0));
const top = computed(() => {
  const m = Math.max(1, ...props.values.filter((v) => v != null));
  if (m <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(m));
  return Math.ceil(m / p) * p;
});
const ticks = computed(() => [0, 1, 2, 3, 4].map((i) => Math.round((top.value / 4) * i)));
const slot = computed(() => (w.value - padL - padR) / Math.max(1, props.values.length));
const cx = (i) => padL + slot.value * (i + 0.5);
const y = (v) => padT + (1 - v / top.value) * (props.height - padT - padB);
const step = computed(() => Math.max(1, Math.ceil(props.labels.length / Math.max(2, Math.floor(w.value / 60)))));
// 4px yumaloq uch, asos chizig'iga tayangan; ustunlar orasida 2px oraliq
function bar(i, v) {
  const bw = Math.max(2, Math.min(36, slot.value - 2));
  const x0 = cx(i) - bw / 2, x1 = x0 + bw;
  const yb = y(0), yt = y(v);
  const r = Math.min(4, bw / 2, yb - yt);
  return `M${x0},${yb} L${x0},${yt + r} Q${x0},${yt} ${x0 + r},${yt} L${x1 - r},${yt} Q${x1},${yt} ${x1},${yt + r} L${x1},${yb} Z`;
}
</script>

<style scoped>
.cc { position: relative; width: 100%; }
.cc svg { display: block; }
.cc-grid line { stroke: var(--grid); }
.cc-axis text { fill: var(--text-3); font-size: 11px; }
.cc-tip { position: absolute; top: 6px; pointer-events: none; background: var(--surface); border: 1px solid var(--border-2); border-radius: 10px; padding: 7px 10px; font-size: 12px; box-shadow: var(--shadow-lg); min-width: 140px; z-index: 5; }
.cc-empty { display: grid; place-items: center; color: var(--text-3); font-size: 13px; border: 1px dashed var(--border-2); border-radius: 10px; }
</style>
