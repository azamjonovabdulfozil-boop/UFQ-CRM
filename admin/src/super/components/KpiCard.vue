<template>
  <div class="kpi card" :title="hint || undefined">
    <div class="kpi-top">
      <span class="kpi-l">{{ label }}</span>
      <span v-if="live" class="kpi-live" title="Har 15 soniyada yangilanadi"><i></i> jonli</span>
    </div>
    <div class="kpi-v">{{ value }}</div>
    <div v-if="desc" class="kpi-desc">{{ desc }}</div>
    <div class="kpi-f">
      <span v-if="delta != null" class="kpi-d" :class="tone" :title="deltaTitle">
        {{ delta > 0 ? "▲" : delta < 0 ? "▼" : "•" }} {{ Math.abs(delta) }}%
      </span>
      <span v-else-if="prevText" class="muted small">—</span>
      <span v-if="prevText" class="muted small">oldingi davr: {{ prevText }}</span>
      <span v-else-if="sub" class="muted small">{{ sub }}</span>
      <Spark v-if="spark && spark.length" class="kpi-s" :values="spark" :label="label + ' trendi'" />
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import Spark from "./Spark.vue";
const props = defineProps({
  label: String,
  value: [String, Number],
  delta: { type: Number, default: null }, // foiz
  prevText: { type: String, default: "" },
  sub: { type: String, default: "" },
  spark: { type: Array, default: null },
  upIsGood: { type: Boolean, default: true },
  live: Boolean,
  hint: String,
  desc: String, // ko'rsatkich nima ekanini oddiy tilda tushuntiradi (doim ko'rinadi)
});
const deltaTitle = computed(() =>
  "Oldingi shunday davrga nisbatan " + (props.delta > 0 ? "ko'paydi" : props.delta < 0 ? "kamaydi" : "o'zgarmadi"),
);
const tone = computed(() => {
  if (!props.delta) return "flat";
  return props.delta > 0 === props.upIsGood ? "good" : "bad";
});
</script>

<style scoped>
.kpi { padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; min-width: 0; transition: border-color 0.15s, transform 0.15s; }
.kpi:hover { border-color: var(--border-2); transform: translateY(-1px); }
.kpi-top { display: flex; align-items: center; gap: 8px; }
.kpi-l { font-size: 12.5px; font-weight: 600; color: var(--text-2); flex: 1; line-height: 1.3; }
.kpi-v { font-size: 25px; font-weight: 800; letter-spacing: -0.5px; font-variant-numeric: tabular-nums; line-height: 1.15; }
.kpi-desc { font-size: 11.5px; line-height: 1.35; color: var(--text-3); }
.kpi-f { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-height: 28px; }
.kpi-d { font-size: 12px; font-weight: 700; padding: 1px 7px; border-radius: 999px; font-variant-numeric: tabular-nums; }
.kpi-d.good { color: var(--good); background: var(--good-soft); }
.kpi-d.bad { color: var(--bad); background: var(--bad-soft); }
.kpi-d.flat { color: var(--text-3); background: var(--surface-3); }
.kpi-s { margin-left: auto; }
.kpi-live { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 700; color: var(--good); }
.kpi-live i { width: 7px; height: 7px; border-radius: 50%; background: var(--good); animation: pulse 1.6s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
</style>
