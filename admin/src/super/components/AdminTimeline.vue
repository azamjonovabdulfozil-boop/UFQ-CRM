<template>
  <div class="tl">
    <!-- Davr va qidiruv -->
    <div class="tl-bar">
      <div class="chips">
        <button v-for="p in PERIODS" :key="p.key" class="chip" :class="{ on: period === p.key }" @click="setPeriod(p.key)">{{ p.label }}</button>
      </div>
      <label class="tl-search">
        <Icon name="search" :size="15" />
        <input v-model="q" class="inp" placeholder="Qidirish: talaba, guruh, summa…" @input="debouncedLoad" />
      </label>
    </div>

    <State :loading="loading && !data" :error="error" :retry="load">
      <template v-if="data">
        <!-- Xulosa -->
        <div class="tl-stats">
          <div class="tl-stat">
            <span class="tl-stat-ic ic-acc"><Icon name="list" :size="18" /></span>
            <div><b>{{ fmt.int(data.summary.total) }}</b><small>ta amal · {{ data.summary.days }} kunda</small></div>
          </div>
          <div class="tl-stat">
            <span class="tl-stat-ic ic-good"><Icon name="wallet" :size="18" /></span>
            <div><b>{{ money(data.summary.payments.sum) }}</b><small>{{ data.summary.payments.count }} ta to'lov olgan</small></div>
          </div>
          <div class="tl-stat">
            <span class="tl-stat-ic ic-warn"><Icon name="down" :size="18" /></span>
            <div><b>{{ money(data.summary.expenses.sum) }}</b><small>{{ data.summary.expenses.count }} ta chiqim / oylik</small></div>
          </div>
          <div class="tl-stat">
            <span class="tl-stat-ic ic-bad"><Icon name="trash" :size="18" /></span>
            <div><b>{{ data.summary.deleted }}</b><small>ta narsani o'chirgan</small></div>
          </div>
        </div>

        <!-- Turlar -->
        <div class="chips tl-cats">
          <button class="chip" :class="{ on: !cat }" @click="setCat('')">Hammasi <span class="cnt">{{ data.summary.total }}</span></button>
          <button v-for="(label, key) in data.cats" v-show="data.summary.byCat[key]" :key="key" class="chip" :class="{ on: cat === key }" @click="setCat(key)">
            {{ label }} <span class="cnt">{{ data.summary.byCat[key] || 0 }}</span>
          </button>
        </div>

        <div v-if="!data.items.length" class="tl-empty">
          <Icon name="info" :size="22" />
          <div>Bu davrda {{ cat ? "bu turdagi " : "" }}amal yo'q.</div>
        </div>

        <!-- Lenta: kunlar bo'yicha -->
        <div v-for="g in days" :key="g.day" class="tl-day">
          <div class="tl-day-h">
            <span>{{ dayTitle(g.day) }}</span>
            <span class="muted small">{{ g.items.length }} ta</span>
          </div>
          <div v-for="it in g.items" :key="it.id" class="tl-item" :class="'c-' + it.cat">
            <span class="tl-time mono">{{ hm(it.at) }}</span>
            <span class="tl-dot"><Icon :name="CAT_ICON[it.cat] || 'dot'" :size="14" /></span>
            <div class="tl-body">
              <div class="tl-text">{{ it.text }}</div>
              <div class="tl-tags">
                <span class="badge b-mute">{{ data.cats[it.cat] || "Boshqa" }}</span>
                <span v-if="it.deleted" class="badge b-bad"><Icon name="trash" :size="11" /> savatga tushdi</span>
                <span v-if="it.auto" class="badge b-mute">avtomatik</span>
                <span v-if="it.warn" class="badge b-warn">ogohlantirish</span>
                <span v-if="it.txDate && differs(it.txDate, it.at)" class="small muted">to'lov sanasi: {{ fmt.dt(it.txDate) }}</span>
              </div>
            </div>
            <span v-if="it.amount != null && it.type.startsWith('pay.')" class="tl-amt" :class="it.type === 'pay.income' ? 'up' : 'down'">
              {{ it.type === "pay.income" ? "+" : it.type === "pay.delete" ? "×" : "−" }}{{ money(it.amount) }}
            </span>
          </div>
        </div>

        <Pager :page="data.page" :pages="data.pages" :total="data.total" @go="go" />
        <div v-if="data.truncated" class="note small">Davr juda katta — oxirgi 4000 ta yozuv ko'rsatildi. Davrni qisqartiring.</div>
      </template>
    </State>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { api } from "../api.js";
import { fmt } from "../store.js";
import State from "./State.vue";
import Icon from "./Icon.vue";
import Pager from "./Pager.vue";

const props = defineProps({ adminId: { type: String, required: true } });

const PERIODS = [
  { key: "today", label: "Bugun" },
  { key: "7", label: "7 kun" },
  { key: "30", label: "30 kun" },
  { key: "90", label: "3 oy" },
  { key: "365", label: "1 yil" },
];
const CAT_ICON = {
  groups: "layers",
  students: "user",
  finance: "wallet",
  attendance: "check",
  grades: "trophy",
  mentors: "school",
  courses: "book",
  auth: "key",
  other: "dot",
};
const WEEK = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];
const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];

const period = ref("7");
const cat = ref("");
const q = ref("");
const page = ref(1);
const data = ref(null);
const loading = ref(false);
const error = ref("");

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const p = new URLSearchParams({ page: String(page.value), limit: "60" });
    if (period.value === "today") {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      p.set("from", d.toISOString());
    } else p.set("days", period.value);
    if (cat.value) p.set("cat", cat.value);
    if (q.value.trim()) p.set("q", q.value.trim());
    data.value = await api(`/api/super/admins/${props.adminId}/actions?${p}`);
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
let t = null;
function debouncedLoad() {
  clearTimeout(t);
  t = setTimeout(() => {
    page.value = 1;
    load();
  }, 350);
}
function setPeriod(k) {
  period.value = k;
  page.value = 1;
  load();
}
function setCat(k) {
  cat.value = k;
  page.value = 1;
  load();
}
function go(p) {
  page.value = p;
  load();
}
watch(() => props.adminId, () => {
  page.value = 1;
  cat.value = "";
  load();
}, { immediate: true });

const days = computed(() => {
  const out = [];
  for (const it of data.value?.items || []) {
    const last = out[out.length - 1];
    if (last && last.day === it.day) last.items.push(it);
    else out.push({ day: it.day, items: [it] });
  }
  return out;
});
function dayTitle(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day || "");
  if (!m) return day || "";
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - d) / 86400000);
  const base = `${+m[3]}-${MONTHS[+m[2] - 1]} ${m[1]}, ${WEEK[d.getDay()]}`;
  return diff === 0 ? "Bugun · " + base : diff === 1 ? "Kecha · " + base : base;
}
const hm = (v) => {
  const d = new Date(v);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const money = (n) => fmt.int(n) + " so'm";
// To'lov sanasi saqlangan vaqtdan farq qilsa (orqa sana bilan kiritilgan) ko'rsatamiz
const differs = (a, b) => Math.abs(new Date(a) - new Date(b)) > 30 * 60 * 1000;
</script>

<style scoped>
.tl { display: grid; gap: 14px; }
.tl-bar { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; justify-content: space-between; }
.tl-search { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 200px; max-width: 340px; position: relative; }
.tl-search .sa-ic { position: absolute; left: 10px; color: var(--text-3); }
.tl-search .inp { padding-left: 32px; }
.tl-stats { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
.tl-stat { display: flex; gap: 10px; align-items: center; padding: 12px; border: 1px solid var(--border); border-radius: var(--r); background: var(--surface-2); }
.tl-stat b { display: block; font-size: 16px; }
.tl-stat small { color: var(--text-3); font-size: 12px; }
.tl-stat-ic { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; flex-shrink: 0; }
.ic-acc { background: var(--accent-soft); color: var(--accent-text); }
.ic-good { background: var(--good-soft); color: var(--good); }
.ic-warn { background: var(--warn-soft); color: var(--warn); }
.ic-bad { background: var(--bad-soft); color: var(--bad); }
.tl-cats .cnt { opacity: 0.7; font-weight: 700; margin-left: 2px; }
.tl-empty { display: flex; gap: 10px; align-items: center; justify-content: center; padding: 26px; color: var(--text-3); border: 1px dashed var(--border-2); border-radius: var(--r); }
.tl-day { border: 1px solid var(--border); border-radius: var(--r); overflow: hidden; }
.tl-day-h { display: flex; justify-content: space-between; align-items: center; padding: 9px 14px; background: var(--surface-2); font-weight: 700; font-size: 13px; border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 1; }
.tl-item { display: grid; grid-template-columns: 46px 28px 1fr auto; gap: 10px; align-items: start; padding: 10px 14px; border-bottom: 1px solid var(--border); }
.tl-item:last-child { border-bottom: 0; }
.tl-time { color: var(--text-3); padding-top: 4px; }
.tl-dot { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: var(--surface-3); color: var(--text-2); }
.c-groups .tl-dot { background: var(--info-soft); color: var(--info); }
.c-students .tl-dot { background: var(--accent-soft); color: var(--accent-text); }
.c-finance .tl-dot { background: var(--good-soft); color: var(--good); }
.c-attendance .tl-dot { background: var(--warn-soft); color: var(--warn); }
.c-auth .tl-dot { background: var(--surface-3); color: var(--text-3); }
.tl-text { font-size: 13.5px; line-height: 1.45; word-break: break-word; }
.tl-tags { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 4px; }
.tl-tags .badge { font-size: 11px; }
.tl-amt { font-weight: 750; white-space: nowrap; padding-top: 3px; font-size: 13.5px; }
@media (max-width: 560px) {
  .tl-item { grid-template-columns: 40px 1fr; }
  .tl-dot { display: none; }
  .tl-amt { grid-column: 2; padding-top: 0; }
}
</style>
