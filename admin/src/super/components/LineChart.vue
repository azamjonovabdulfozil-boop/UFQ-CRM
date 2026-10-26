<template>
  <div class="lc" ref="wrap">
    <div v-if="series.length > 1" class="lc-legend">
      <span v-for="(s, i) in series" :key="s.name" class="lc-leg">
        <i :style="{ background: color(i) }"></i>{{ s.name }}
      </span>
    </div>
    <div v-if="!hasData" class="lc-empty" :style="{ height: height + 'px' }">Ma'lumot yetarli emas</div>
    <svg
      v-else
      :width="w"
      :height="height"
      :viewBox="`0 0 ${w} ${height}`"
      role="img"
      :aria-label="ariaLabel"
      @mousemove="onMove"
      @mouseleave="hover = -1"
      @touchstart.passive="onMove($event.touches[0])"
    >
      <g class="lc-grid">
        <line v-for="t in ticks" :key="'g' + t" :x1="padL" :x2="w - padR" :y1="y(t)" :y2="y(t)" />
      </g>
      <g class="lc-axis">
        <text v-for="t in ticks" :key="'t' + t" :x="padL - 8" :y="y(t) + 4" text-anchor="end">{{ fmtTick(t) }}</text>
        <text
          v-for="(l, i) in labels"
          v-show="showLabel(i)"
          :key="'x' + i"
          :x="x(i)"
          :y="height - 6"
          text-anchor="middle"
        >{{ l }}</text>
      </g>
      <g v-for="(s, si) in series" :key="s.name">
        <path :d="pathOf(s.values)" fill="none" :stroke="color(si)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
        <template v-for="(v, i) in s.values" :key="i">
          <circle
            v-if="v != null && (isolated(s.values, i) || hover === i)"
            :cx="x(i)"
            :cy="y(v)"
            r="4"
            :fill="color(si)"
            stroke="var(--surface)"
            stroke-width="2"
          />
        </template>
      </g>
      <line v-if="hover >= 0" class="lc-cross" :x1="x(hover)" :x2="x(hover)" :y1="padT" :y2="height - padB" />
    </svg>
    <div v-if="hover >= 0 && hasData" class="lc-tip" :style="tipStyle">
      <div class="lc-tip-t">{{ tipLabels[hover] || labels[hover] }}</div>
      <div v-for="(s, si) in series" :key="s.name" class="lc-tip-r">
        <i :style="{ background: color(si) }"></i>
        <span>{{ s.name }}</span>
        <b>{{ s.values[hover] == null ? "ma'lumot yo'q" : fmtVal(s.values[hover]) }}</b>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";

const props = defineProps({
  labels: { type: Array, default: () => [] },
  tipLabels: { type: Array, default: () => [] },
  series: { type: Array, default: () => [] }, // [{name, values:[number|null]}]
  height: { type: Number, default: 220 },
  unit: { type: String, default: "" },
  max: { type: Number, default: null }, // masalan 100 (foiz)
  ariaLabel: { type: String, default: "Grafik" },
});
const COLORS = ["var(--s1)", "var(--s2)", "var(--s3)"];
const color = (i) => props.series[i]?.color || COLORS[i % COLORS.length];
const wrap = ref(null);
const w = ref(600);
const hover = ref(-1);
const padL = 42, padR = 14, padT = 12, padB = 26;
let ro;
onMounted(() => {
  ro = new ResizeObserver(() => {
    if (wrap.value) w.value = Math.max(260, wrap.value.clientWidth);
  });
  ro.observe(wrap.value);
});
onBeforeUnmount(() => ro && ro.disconnect());

const all = computed(() => props.series.flatMap((s) => s.values).filter((v) => v != null && isFinite(v)));
const hasData = computed(() => all.value.length > 0);
const top = computed(() => {
  const m = Math.max(0, ...all.value);
  if (props.max != null) return props.max;
  if (m <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(m));
  return Math.ceil(m / p) * p;
});
const ticks = computed(() => {
  const n = 4;
  return Array.from({ length: n + 1 }, (_, i) => Math.round((top.value / n) * i * 100) / 100);
});
const x = (i) => {
  const n = props.labels.length;
  return n <= 1 ? (padL + w.value - padR) / 2 : padL + (i * (w.value - padL - padR)) / (n - 1);
};
const y = (v) => padT + (1 - v / top.value) * (props.height - padT - padB);
const fmtTick = (t) => (Number.isInteger(t) ? t : t.toFixed(1)) + (props.unit === "%" ? "%" : "");
const fmtVal = (v) => (Math.round(v * 10) / 10).toString() + props.unit;
const step = computed(() => Math.max(1, Math.ceil(props.labels.length / Math.max(2, Math.floor(w.value / 70)))));
const showLabel = (i) => i % step.value === 0;
// Bo'sh qiymat (null) — chiziq uziladi, nol deb chizilmaydi
function pathOf(vals) {
  let d = "";
  let pen = false;
  vals.forEach((v, i) => {
    if (v == null || !isFinite(v)) return (pen = false);
    d += (pen ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1) + " ";
    pen = true;
  });
  return d;
}
const isolated = (vals, i) => vals[i] != null && vals[i - 1] == null && vals[i + 1] == null;
function onMove(e) {
  if (!wrap.value || !e) return;
  const r = wrap.value.querySelector("svg").getBoundingClientRect();
  // ekran pikseli → grafik koordinatasi (katta ekranda interfeys zoom qilingan bo'lishi mumkin)
  const px = r.width ? ((e.clientX - r.left) * w.value) / r.width : 0;
  const n = props.labels.length;
  if (!n) return;
  const i = Math.round(((px - padL) / (w.value - padL - padR)) * (n - 1));
  hover.value = Math.max(0, Math.min(n - 1, i));
}
const tipStyle = computed(() => {
  const px = x(hover.value);
  const left = Math.min(Math.max(px + 12, 0), w.value - 190);
  return { left: (px > w.value - 210 ? px - 200 : left) + "px", top: "18px" };
});
</script>

<style scoped>
.lc { position: relative; width: 100%; }
.lc svg { display: block; overflow: visible; }
.lc-grid line { stroke: var(--grid); stroke-width: 1; }
.lc-axis text { fill: var(--text-3); font-size: 11px; font-variant-numeric: tabular-nums; }
.lc-cross { stroke: var(--text-3); stroke-dasharray: 3 3; stroke-width: 1; }
.lc-legend { display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 8px; font-size: 12px; color: var(--text-2); }
.lc-leg { display: inline-flex; align-items: center; gap: 6px; }
.lc-leg i, .lc-tip-r i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
.lc-tip {
  position: absolute; pointer-events: none; background: var(--surface); border: 1px solid var(--border-2); border-radius: 10px;
  padding: 8px 10px; box-shadow: var(--shadow-lg); font-size: 12px; min-width: 170px; z-index: 5;
}
.lc-tip-t { font-weight: 700; margin-bottom: 4px; color: var(--text); }
.lc-tip-r { display: flex; align-items: center; gap: 6px; color: var(--text-2); }
.lc-tip-r b { margin-left: auto; color: var(--text); font-variant-numeric: tabular-nums; }
.lc-empty { display: grid; place-items: center; color: var(--text-3); font-size: 13px; border: 1px dashed var(--border-2); border-radius: 10px; }
</style>
