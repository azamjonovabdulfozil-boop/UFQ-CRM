<template>
  <div class="jf" ref="wrap">
    <div v-if="!flow.nodes.length" class="jf-empty">Bu davrda ma'lumot hali yetarli emas</div>
    <template v-else>
      <div class="jf-scroll">
        <svg :width="W" :height="H" :viewBox="`0 0 ${W} ${H}`" role="img" aria-label="Foydalanuvchi yo'li diagrammasi">
          <g>
            <path
              v-for="(l, i) in layout.links"
              :key="'l' + i"
              :d="l.d"
              class="jf-link"
              :class="{ dim: active && !l.on, conv: l.conv }"
              :stroke-width="l.w"
              @mouseenter="tip = { x: l.mx, y: l.my, text: `${l.from} → ${l.to}`, n: l.value }"
              @mouseleave="tip = null"
            />
          </g>
          <g v-for="n in layout.nodes" :key="n.id" class="jf-node" :class="{ on: active === n.id, dim: active && !n.on }" @click="pick(n)">
            <rect :x="n.x" :y="n.y" :width="NW" :height="n.h" rx="3" :class="n.kind" />
            <rect :x="n.lx - 4" :y="n.y" :width="labelW + 8" :height="Math.max(n.h, 16)" fill="transparent" />
            <text :x="n.lx" :y="n.y + Math.max(n.h, 14) / 2 + 4" :text-anchor="n.anchor">{{ short(n.label) }} · {{ n.value }}</text>
          </g>
        </svg>
      </div>
      <div v-if="tip" class="jf-tip" :style="{ left: Math.min(tip.x, W - 220) + 'px', top: tip.y + 'px' }">
        {{ tip.text }}<br /><b>{{ tip.n }}</b> ta tashrif
      </div>
      <div class="jf-cols muted small">
        <span v-for="c in flow.columns" :key="c">{{ colName(c - 1) }}</span>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";

const props = defineProps({ flow: { type: Object, required: true } });
const emit = defineEmits(["select"]);
const wrap = ref(null);
const width = ref(900);
const tip = ref(null);
const active = ref(null);
const NW = 10;
const labelW = 130;
let ro;
onMounted(() => {
  ro = new ResizeObserver(() => wrap.value && (width.value = wrap.value.clientWidth));
  ro.observe(wrap.value);
});
onBeforeUnmount(() => ro && ro.disconnect());

const W = computed(() => Math.max(760, width.value));
const H = computed(() => {
  const per = Math.max(...Array.from({ length: props.flow.columns || 1 }, (_, c) => props.flow.nodes.filter((n) => n.col === c).length), 1);
  return Math.max(260, per * 46 + 20);
});
const colName = (c) => (c === 0 ? "Manba" : c + "-qadam");
const short = (s) => (s.length > 22 ? s.slice(0, 21) + "…" : s);

const layout = computed(() => {
  const f = props.flow;
  const cols = f.columns;
  const pad = 10;
  const gap = 12;
  const usableX = W.value - labelW - 20;
  const colX = (c) => 10 + (c * (usableX - NW)) / Math.max(1, cols - 1);
  const total = Math.max(1, ...Array.from({ length: cols }, (_, c) => f.nodes.filter((n) => n.col === c).reduce((a, n) => a + n.value, 0)));
  const nodes = [];
  const pos = new Map();
  for (let c = 0; c < cols; c++) {
    const list = f.nodes.filter((n) => n.col === c).sort((a, b) => b.value - a.value);
    const avail = H.value - pad * 2 - gap * Math.max(0, list.length - 1);
    let y = pad;
    for (const n of list) {
      const h = Math.max(4, (n.value / total) * avail);
      const last = c === cols - 1;
      const node = {
        ...n, x: colX(c), y, h,
        lx: last ? colX(c) - 6 : colX(c) + NW + 6,
        anchor: last ? "end" : "start",
        kind: n.label.startsWith("✓") ? "conv" : n.label === "Saytdan chiqib ketdi" ? "exit" : c === 0 ? "src" : "page",
        inY: y, outY: y,
      };
      nodes.push(node);
      pos.set(n.id, node);
      y += h + gap;
    }
  }
  const sel = active.value;
  const links = f.links
    .slice()
    .sort((a, b) => b.value - a.value)
    .map((l) => {
      const a = pos.get(l.source);
      const b = pos.get(l.target);
      if (!a || !b) return null;
      const w = Math.max(1.5, (l.value / total) * (H.value - pad * 2 - gap * 6));
      const y1 = a.outY + w / 2;
      const y2 = b.inY + w / 2;
      a.outY += w;
      b.inY += w;
      const x1 = a.x + NW;
      const x2 = b.x;
      const mx = (x1 + x2) / 2;
      return {
        d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`,
        w, value: l.value, from: a.label, to: b.label, mx, my: (y1 + y2) / 2,
        on: !!sel && (l.source === sel || l.target === sel),
        conv: b.kind === "conv",
      };
    })
    .filter(Boolean);
  for (const n of nodes) n.on = !!sel && (n.id === sel || f.links.some((l) => (l.source === sel && l.target === n.id) || (l.target === sel && l.source === n.id)));
  return { nodes, links };
});

function pick(n) {
  active.value = active.value === n.id ? null : n.id;
  emit("select", active.value ? n : null);
}
</script>

<style scoped>
.jf { position: relative; }
.jf-scroll { overflow-x: auto; }
.jf svg { display: block; }
.jf-link { fill: none; stroke: var(--s1); opacity: 0.22; transition: opacity 0.15s; cursor: default; }
.jf-link.conv { stroke: var(--s3); opacity: 0.32; }
.jf-link:hover { opacity: 0.5; }
.jf-link.dim { opacity: 0.06; }
.jf-node { cursor: pointer; }
.jf-node rect.src { fill: var(--s2); }
.jf-node rect.page { fill: var(--s1); }
.jf-node rect.conv { fill: var(--s3); }
.jf-node rect.exit { fill: var(--text-3); }
.jf-node text { font-size: 11.5px; fill: var(--text); font-weight: 600; paint-order: stroke; stroke: var(--surface); stroke-width: 3px; }
.jf-node.dim { opacity: 0.35; }
.jf-node.on text { fill: var(--accent-text); }
.jf-tip { position: absolute; pointer-events: none; background: var(--surface); border: 1px solid var(--border-2); border-radius: 10px; padding: 7px 10px; font-size: 12px; box-shadow: var(--shadow-lg); max-width: 240px; z-index: 5; }
.jf-cols { display: flex; justify-content: space-between; margin-top: 6px; }
.jf-empty { display: grid; place-items: center; height: 180px; color: var(--text-3); font-size: 13px; border: 1px dashed var(--border-2); border-radius: 10px; }
</style>
