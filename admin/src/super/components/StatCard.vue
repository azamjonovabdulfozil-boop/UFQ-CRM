<template>
  <component
    :is="to ? 'router-link' : 'div'"
    :to="to || undefined"
    class="stat card"
    :class="{ link: !!to, [tone]: !!tone }"
  >
    <div class="stat-top">
      <span class="stat-ic"><Icon :name="icon" :size="17" /></span>
      <span class="stat-label">{{ label }}</span>
      <Icon v-if="to" name="right" :size="15" class="stat-go" />
    </div>
    <div class="stat-val" :class="{ na: value == null || value === '—' }">
      {{ value == null ? "—" : value }}<small v-if="unit && value != null && value !== '—'">{{ unit }}</small>
    </div>
    <div class="stat-foot">
      <span v-if="delta" :class="deltaClass">{{ delta }}</span>
      <span class="muted">{{ sub }}</span>
    </div>
  </component>
</template>

<script setup>
import { computed } from "vue";
import Icon from "./Icon.vue";
const props = defineProps({
  label: String,
  value: [String, Number],
  unit: String,
  sub: String,
  delta: String,
  deltaGood: { type: Boolean, default: true }, // o'sish yaxshimi
  icon: { type: String, default: "chart" },
  to: { type: [String, Object], default: null },
  tone: { type: String, default: "" }, // good | warn | bad
});
const deltaClass = computed(() => {
  if (!props.delta) return "";
  const pos = props.delta.startsWith("+");
  const neg = props.delta.startsWith("−");
  if (!pos && !neg) return "muted";
  return pos === props.deltaGood ? "up" : "down";
});
</script>

<style scoped>
.stat { padding: 15px 16px 14px; display: flex; flex-direction: column; gap: 6px; color: var(--text); text-decoration: none !important; transition: border-color .15s, transform .15s; min-height: 118px; }
.stat.link:hover { border-color: var(--accent); transform: translateY(-1px); }
.stat-top { display: flex; align-items: center; gap: 8px; }
.stat-ic { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent-text); }
.stat.good .stat-ic { background: var(--good-soft); color: var(--good); }
.stat.warn .stat-ic { background: var(--warn-soft); color: var(--warn); }
.stat.bad .stat-ic { background: var(--bad-soft); color: var(--bad); }
.stat-label { font-size: 12.5px; font-weight: 600; color: var(--text-2); flex: 1; line-height: 1.3; }
.stat-go { color: var(--text-3); }
.stat-val { font-size: 26px; font-weight: 800; letter-spacing: -.6px; font-variant-numeric: tabular-nums; line-height: 1.15; }
.stat-val small { font-size: 15px; font-weight: 700; margin-left: 2px; color: var(--text-2); }
.stat-val.na { color: var(--text-3); font-size: 18px; }
.stat-foot { font-size: 12px; display: flex; gap: 6px; flex-wrap: wrap; line-height: 1.35; }
</style>
