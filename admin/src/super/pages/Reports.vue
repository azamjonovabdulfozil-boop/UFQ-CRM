<template>
  <div class="stack">
    <div class="page-head">
      <p>
        Hisobot sana oralig'i, o'qituvchi va sinf bo'yicha tayyorlanadi. Fayl serverda quriladi; har bir eksport ruxsat bilan tekshiriladi va
        faoliyat tarixiga yoziladi. Faylda davr, ma'lumot manbasi, hisoblash usuli va eksport vaqti ko'rsatiladi.
      </p>
      <PeriodPicker :label="rep?.period" />
    </div>
    <div class="card">
      <div class="card-b stack">
        <div class="chips">
          <button v-for="r in REPORTS" :key="r[0]" class="chip" :class="{ on: kind === r[0] }" @click="kind = r[0]">{{ r[1] }}</button>
        </div>
        <div class="row">
          <select v-if="usesFilters" v-model="group" class="sel" aria-label="Sinf">
            <option value="">Barcha sinflar</option>
            <option v-for="g in opts.groups" :key="g.id" :value="g.id">{{ g.name }}</option>
          </select>
          <select v-if="usesFilters" v-model="teacher" class="sel" aria-label="O'qituvchi">
            <option value="">Barcha o'qituvchilar</option>
            <option v-for="m in opts.mentors" :key="m.id" :value="m.id">{{ m.name }}</option>
          </select>
          <span class="grow"></span>
          <button class="btn" :disabled="busy" @click="get('csv')"><Icon name="download" :size="14" /> CSV</button>
          <button class="btn" :disabled="busy" @click="get('xlsx')"><Icon name="download" :size="14" /> Excel</button>
          <button class="btn pri" :disabled="busy" @click="get('pdf')"><Icon name="download" :size="14" /> PDF</button>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-h"><h3>{{ rep?.title || "Ko'rib chiqish" }}</h3><span class="card-sub">{{ rep ? rep.rows.length + " qator" : "" }}</span></div>
      <div class="card-b">
        <State :loading="loading" :error="error" :retry="load">
          <template v-if="rep">
            <dl class="kv" style="margin-bottom: 12px">
              <dt>Davr</dt><dd>{{ rep.period }}</dd>
              <dt>Filtrlar</dt><dd>{{ rep.filters || "yo'q" }}</dd>
              <dt>Ma'lumot manbasi</dt><dd>{{ rep.source }}</dd>
              <dt>Hisoblash usuli</dt><dd>{{ rep.method }}</dd>
            </dl>
            <div class="tw" style="max-height: 520px; overflow: auto">
              <table class="t">
                <thead><tr><th v-for="c in rep.columns" :key="c">{{ c }}</th></tr></thead>
                <tbody>
                  <tr v-if="!rep.rows.length"><td :colspan="rep.columns.length" class="muted" style="text-align: center; padding: 20px">Ma'lumot yo'q</td></tr>
                  <tr v-for="(r, i) in rep.rows.slice(0, 200)" :key="i">
                    <td v-for="(v, j) in r" :key="j" :class="{ r: typeof v === 'number' }">{{ v == null || v === "" ? "—" : typeof v === "number" ? fmt.n(v) : v }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-if="rep.rows.length > 200" class="small muted" style="margin-top: 8px">Bu yerda birinchi 200 qator — faylda hammasi bo'ladi.</div>
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
  ["overview", "Umumiy CRM"], ["teachers", "O'qituvchilar samaradorligi"], ["groups", "Sinflar natijalari"], ["attendance", "Davomat"],
  ["homework", "Uy vazifalari"], ["students", "O'quvchilar natijalari"], ["admins", "Administratorlar faoliyati"], ["system", "Tizim monitoringi"],
];
const kind = ref("overview");
const group = ref("");
const teacher = ref("");
const rep = ref(null);
const loading = ref(false);
const error = ref("");
const busy = ref(false);
const opts = ref({ groups: [], mentors: [] });
const usesFilters = computed(() => ["teachers", "groups", "attendance", "students"].includes(kind.value));
const q = (format) => ({ ...periodQuery.value, group: usesFilters.value ? group.value : "", teacher: usesFilters.value ? teacher.value : "", format });
async function load() {
  loading.value = true;
  error.value = "";
  try {
    rep.value = (await api("/api/super/reports/" + kind.value, { query: q("json") })).report;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
async function get(format) {
  busy.value = true;
  try {
    await download("/api/super/reports/" + kind.value, { query: q(format) });
    toast("Hisobot yuklab olindi va jurnalga yozildi");
  } catch (e) {
    toast(e.message, "error");
  } finally {
    busy.value = false;
  }
}
watch([kind, group, teacher, periodQuery], load);
onMounted(async () => {
  load();
  try {
    const r = await api("/api/super/data/groups", { query: { limit: 5 } });
    opts.value = r.options;
  } catch {}
});
</script>

<style scoped>
.grow { flex: 1; }
</style>
