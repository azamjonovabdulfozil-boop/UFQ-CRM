<template>
  <div>
    <div v-if="searchable && !server" class="dt-search">
      <Icon name="search" :size="15" />
      <input v-model="q" class="inp" :placeholder="searchPlaceholder" aria-label="Qidirish" />
    </div>
    <div class="tw">
      <table class="t">
        <thead>
          <tr>
            <th
              v-for="c in columns"
              :key="c.key"
              :class="{ sort: c.sortable !== false, r: c.align === 'r' }"
              :aria-sort="sortKey === c.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'"
              @click="c.sortable !== false && toggle(c.key)"
            >
              {{ c.label }}
              <span v-if="sortKey === c.key">{{ sortDir === "asc" ? "↑" : "↓" }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!pageRows.length">
            <td :colspan="columns.length" class="muted" style="text-align: center; padding: 26px">{{ emptyText }}</td>
          </tr>
          <tr v-for="(r, i) in pageRows" :key="r[rowKey] ?? i" :class="{ click: clickable }" @click="clickable && $emit('row', r)">
            <td v-for="c in columns" :key="c.key" :class="{ r: c.align === 'r', nowrap: c.nowrap }">
              <slot :name="c.key" :row="r" :value="r[c.key]">{{ c.fmt ? c.fmt(r[c.key], r) : r[c.key] == null || r[c.key] === "" ? "—" : r[c.key] }}</slot>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <Pager :page="curPage" :pages="pages" :total="totalRows" @go="go" />
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import Icon from "./Icon.vue";
import Pager from "./Pager.vue";

const props = defineProps({
  columns: { type: Array, required: true },
  rows: { type: Array, default: () => [] },
  rowKey: { type: String, default: "id" },
  perPage: { type: Number, default: 10 },
  searchable: { type: Boolean, default: false },
  searchPlaceholder: { type: String, default: "Qidirish…" },
  clickable: { type: Boolean, default: false },
  emptyText: { type: String, default: "Ma'lumot yo'q" },
  defaultSort: { type: String, default: "" },
  defaultDir: { type: String, default: "desc" },
  // server = true: saralash/sahifalash serverda (total, page beriladi)
  server: { type: Boolean, default: false },
  total: { type: Number, default: 0 },
  page: { type: Number, default: 1 },
});
const emit = defineEmits(["row", "sort", "page"]);
const q = ref("");
const sortKey = ref(props.defaultSort);
const sortDir = ref(props.defaultDir);
const localPage = ref(1);
watch(q, () => (localPage.value = 1));
watch(() => props.rows, () => { if (!props.server) localPage.value = Math.min(localPage.value, Math.max(1, Math.ceil(filtered.value.length / props.perPage))); });

function toggle(k) {
  if (sortKey.value === k) sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  else { sortKey.value = k; sortDir.value = "desc"; }
  if (props.server) emit("sort", { sort: sortKey.value, dir: sortDir.value });
}
const filtered = computed(() => {
  if (props.server) return props.rows;
  let r = props.rows;
  const t = q.value.trim().toLowerCase();
  if (t) r = r.filter((x) => props.columns.some((c) => x[c.key] != null && String(x[c.key]).toLowerCase().includes(t)));
  if (sortKey.value) {
    const k = sortKey.value, d = sortDir.value === "asc" ? 1 : -1;
    r = r.slice().sort((a, b) => {
      const x = a[k], y = b[k];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "uz")) * d;
    });
  }
  return r;
});
const totalRows = computed(() => (props.server ? props.total : filtered.value.length));
const curPage = computed(() => (props.server ? props.page : localPage.value));
const pages = computed(() => Math.max(1, Math.ceil(totalRows.value / props.perPage)));
const pageRows = computed(() =>
  props.server ? props.rows : filtered.value.slice((localPage.value - 1) * props.perPage, localPage.value * props.perPage),
);
function go(p) {
  p = Math.max(1, Math.min(pages.value, p));
  if (props.server) emit("page", p);
  else localPage.value = p;
}
// Yozuv o'chirilib, joriy sahifa yo'qolib qolsa — oxirgi mavjud sahifaga qaytamiz
watch(
  () => [props.server, props.total, props.page],
  () => {
    if (props.server && props.total > 0 && props.page > pages.value) emit("page", pages.value);
  },
);
</script>

<style scoped>
.dt-search { position: relative; margin-bottom: 10px; max-width: 320px; }
.dt-search .sa-ic { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-3); }
.dt-search .inp { padding-left: 32px; }
</style>
