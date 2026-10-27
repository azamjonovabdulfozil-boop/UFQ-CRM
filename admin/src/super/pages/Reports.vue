<template>
  <div class="stack">
    <div class="page-head">
      <p>
        1) Kerakli hisobotni tanlang. 2) Davrni belgilang. Natija shu sahifada pastda chiqadi. Faylga saqlash yoki chop etish uchun
        <b>Excel</b> yoki <b>PDF</b> tugmasini bosing.
      </p>
      <PeriodPicker :label="rep?.period" />
    </div>

    <!-- 1. Hisobot turi -->
    <div class="kinds" role="group" aria-label="Hisobot turi">
      <button v-for="r in REPORTS" :key="r.key" class="kind" :class="{ on: kind === r.key }" @click="kind = r.key">
        <span class="k-ic"><Icon :name="r.icon" :size="18" /></span>
        <span class="k-t">
          <b>{{ r.title }}</b>
          <small>{{ r.desc }}</small>
        </span>
      </button>
    </div>

    <!-- 2. Natija -->
    <div class="card">
      <div class="card-h">
        <h3>{{ current.title }}</h3>
        <span class="card-sub">{{ rep ? countText : "" }}</span>
      </div>
      <div class="card-b stack">
        <div class="row">
          <label v-if="usesFilters" class="fld inline">
            Guruh
            <select v-model="group" class="sel" aria-label="Guruh">
              <option value="">Barcha guruhlar</option>
              <option v-for="g in opts.groups" :key="g.id" :value="g.id">{{ g.name }}</option>
            </select>
          </label>
          <label v-if="usesFilters" class="fld inline">
            Mentor
            <select v-model="teacher" class="sel" aria-label="Mentor">
              <option value="">Barcha mentorlar</option>
              <option v-for="m in opts.mentors" :key="m.id" :value="m.id">{{ m.name }}</option>
            </select>
          </label>
          <span class="grow"></span>
          <span class="small muted dl-label">Yuklab olish:</span>
          <button class="btn" :disabled="busy || !rep" @click="get('xlsx')"><Icon name="download" :size="14" /> Excel</button>
          <button class="btn pri" :disabled="busy || !rep" @click="get('pdf')"><Icon name="download" :size="14" /> PDF</button>
          <button class="btn ghost sm" :disabled="busy || !rep" title="Boshqa dasturlar uchun oddiy jadval fayli" @click="get('csv')">CSV</button>
        </div>

        <State :loading="loading" :error="error" :retry="load">
          <template v-if="rep">
            <!-- Umumiy hisobot — kartalar ko'rinishida -->
            <div v-if="kind === 'overview'" class="tiles">
              <div v-for="(r, i) in rep.rows" :key="i" class="tile">
                <div class="t-label">{{ r[0] }}</div>
                <div class="t-val">{{ show(r[1], r[0]) }}</div>
                <div class="t-prev">
                  <template v-if="r[2] != null && r[2] !== ''">
                    Oldingi davrda: <b>{{ show(r[2], r[0]) }}</b>
                    <span v-if="typeof r[1] === 'number' && typeof r[2] === 'number'" class="chg">
                      {{ r[1] === r[2] ? "o'zgarmagan" : (r[1] > r[2] ? "▲ " : "▼ ") + fmt.n(Math.abs(r[1] - r[2])) }}
                    </span>
                  </template>
                </div>
                <div class="t-note">{{ r[3] }}</div>
              </div>
            </div>

            <!-- Qolgan hisobotlar — jadval -->
            <template v-else>
              <div v-if="!rep.rows.length" class="empty muted">Tanlangan davrda bu hisobot uchun ma'lumot yo'q. Davrni kattaroq qilib ko'ring.</div>
              <div v-else class="tw" style="max-height: 560px; overflow: auto">
                <table class="t">
                  <thead><tr><th v-for="c in rep.columns" :key="c">{{ c }}</th></tr></thead>
                  <tbody>
                    <tr v-for="(r, i) in rep.rows.slice(0, 300)" :key="i">
                      <td v-for="(v, j) in r" :key="j" :class="{ r: typeof v === 'number', wrap: typeof v === 'string' && v.length > 40 }">{{ show(v, rep.columns[j]) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div v-if="rep.rows.length > 300" class="small muted">Bu yerda birinchi 300 qator ko'rsatildi — yuklab olingan faylda hammasi bor.</div>
            </template>

            <details class="how">
              <summary>Bu hisobot qanday tuzilgan?</summary>
              <dl class="kv">
                <dt>Davr</dt><dd>{{ rep.period }}</dd>
                <dt>Tanlangan filtr</dt><dd>{{ rep.filters || "yo'q — hamma ma'lumot" }}</dd>
                <dt>Ma'lumot qayerdan</dt><dd>{{ rep.source }}</dd>
                <dt>Izoh</dt><dd>{{ rep.method }}</dd>
              </dl>
            </details>
          </template>
        </State>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from "vue";
import { api, download } from "../api.js";
import { periodQuery, fmt, toast } from "../store.js";
import State from "../components/State.vue";
import PeriodPicker from "../components/PeriodPicker.vue";
import Icon from "../components/Icon.vue";

const REPORTS = [
  { key: "overview", title: "Umumiy holat", icon: "home", desc: "Talabalar, darslar, davomat va baholar — bitta qarashda" },
  { key: "teachers", title: "Mentorlar ishi", icon: "trophy", desc: "Har bir mentor: darslar, davomat, baholar va umumiy ball" },
  { key: "groups", title: "Guruhlar", icon: "layers", desc: "Har bir guruh: talabalar soni, davomat, o'rtacha baho" },
  { key: "attendance", title: "Davomat", icon: "check", desc: "Har bir talaba nechta darsga kelgan va kelmagan" },
  { key: "students", title: "Talabalar natijasi", icon: "users", desc: "Har bir talabaning baholari, testlari va davomati" },
  { key: "admins", title: "Admin va mentorlar faoliyati", icon: "list", desc: "Kim qachon tizimga kirgani va nima qilgani" },
];
const kind = ref("overview");
const group = ref("");
const teacher = ref("");
const rep = ref(null);
const loading = ref(false);
const error = ref("");
const busy = ref(false);
const opts = ref({ groups: [], mentors: [] });
const current = computed(() => REPORTS.find((r) => r.key === kind.value) || REPORTS[0]);
const usesFilters = computed(() => ["teachers", "groups", "attendance", "students"].includes(kind.value));
const countText = computed(() => {
  if (!rep.value) return "";
  const n = rep.value.rows.length;
  if (kind.value === "overview") return rep.value.period;
  return `${n} ta ${{ teachers: "mentor", groups: "guruh", attendance: "talaba", students: "talaba", admins: "yozuv" }[kind.value] || "qator"}`;
});

/** Qiymatni ko'rsatish: bo'sh — «—», foiz ustunlarida «%» */
function show(v, col) {
  if (v == null || v === "") return "—";
  if (typeof v !== "number") return v;
  const pct = /%/.test(String(col || ""));
  return fmt.n(v) + (pct ? "%" : "");
}

const q = (format) => ({ ...periodQuery.value, group: usesFilters.value ? group.value : "", teacher: usesFilters.value ? teacher.value : "", format });
let seq = 0;
async function load() {
  const my = ++seq;
  loading.value = true;
  error.value = "";
  try {
    const r = (await api("/api/super/reports/" + kind.value, { query: q("json") })).report;
    if (my === seq) rep.value = r;
  } catch (e) {
    if (my === seq) error.value = e.message;
  } finally {
    if (my === seq) loading.value = false;
  }
}
async function get(format) {
  busy.value = true;
  try {
    await download("/api/super/reports/" + kind.value, { query: q(format) });
    toast("Hisobot yuklab olindi");
  } catch (e) {
    toast(e.message, "error");
  } finally {
    busy.value = false;
  }
}
watch(kind, () => (rep.value = null));
watch([kind, group, teacher, periodQuery], load);
onMounted(async () => {
  load();
  try {
    const r = await api("/api/super/data/groups", { query: { limit: 5 } });
    opts.value = r.options || { groups: [], mentors: [] };
  } catch {}
});
</script>

<style scoped>
.grow { flex: 1; }
.kinds { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); }
.kind {
  display: flex; align-items: flex-start; gap: 12px; text-align: left; font: inherit; color: inherit; cursor: pointer;
  padding: 14px; border: 1px solid var(--border); border-radius: var(--r); background: var(--surface);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.kind:hover { border-color: var(--border-2); box-shadow: var(--shadow); }
.kind.on { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.k-ic { width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0; display: grid; place-items: center; background: var(--surface-3); color: var(--text-2); }
.kind.on .k-ic { background: var(--accent); color: #fff; }
.k-t { display: grid; gap: 3px; min-width: 0; }
.k-t b { font-size: 14px; }
.k-t small { font-size: 12px; color: var(--text-3); line-height: 1.4; }
.fld.inline { display: flex; align-items: center; gap: 8px; }
.dl-label { margin-right: -2px; }
.tiles { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); }
.tile { padding: 14px; border: 1px solid var(--border); border-radius: var(--r-sm); background: var(--surface-2); display: grid; gap: 4px; align-content: start; }
.t-label { font-size: 12.5px; font-weight: 700; color: var(--text-2); }
.t-val { font-size: 26px; font-weight: 800; line-height: 1.15; }
.t-prev { font-size: 12px; color: var(--text-3); min-height: 16px; display: flex; gap: 6px; flex-wrap: wrap; }
.t-prev .chg { color: var(--text-2); font-weight: 700; }
.t-note { font-size: 12px; color: var(--text-3); }
.empty { padding: 26px 10px; text-align: center; }
td.wrap { white-space: normal; min-width: 260px; }
.how { border-top: 1px solid var(--border); padding-top: 10px; }
.how summary { cursor: pointer; font-size: 13px; font-weight: 700; color: var(--text-2); }
.how .kv { margin-top: 10px; }
@media (max-width: 640px) {
  .kinds { grid-template-columns: 1fr; }
  .fld.inline { width: 100%; }
  .fld.inline .sel { flex: 1; }
}
</style>
