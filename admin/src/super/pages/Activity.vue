<template>
  <div class="stack">
    <div class="page-head">
      <p>
        Kirish/chiqish, muvaffaqiyatsiz urinishlar, ma'lumot o'zgarishlari, sozlama va ruxsat o'zgarishlari, parol tiklash, eksport va tizim
        xatolari. Jurnalga parol, token yoki cookie qiymatlari yozilmaydi. Yozuvlarni hech kim (Super Admin ham) panel orqali o'zgartira yoki
        o'chira olmaydi<span v-if="d">; ular {{ d.retentionDays }} kun saqlanadi</span>.
      </p>
      <PeriodPicker :label="rangeLabel" />
    </div>

    <div class="card">
      <div class="card-b row">
        <select v-model="f.category" class="sel" aria-label="Toifa">
          <option value="">Barcha toifalar</option>
          <option v-for="c in d?.categoryList || []" :key="c">{{ c }}</option>
        </select>
        <select v-model="f.role" class="sel" aria-label="Rol">
          <option value="">Barcha rollar</option>
          <option value="superadmin">Super Admin</option>
          <option value="admin">Admin</option>
          <option value="mentor">Mentor</option>
          <option value="student">Talaba</option>
        </select>
        <select v-model="f.severity" class="sel" aria-label="Natija">
          <option value="">Har qanday natija</option>
          <option value="info">Muvaffaqiyatli / oddiy</option>
          <option value="warn">Ogohlantirish</option>
          <option value="critical">Jiddiy</option>
        </select>
        <input v-model="f.actor" class="inp" style="width: 170px" placeholder="Foydalanuvchi (login)" aria-label="Foydalanuvchi" />
        <input v-model="f.q" class="inp" style="width: 220px" placeholder="Qidirish (hodisa, IP, manzil)" aria-label="Qidirish" />
        <button class="btn sm" @click="clear">Tozalash</button>
      </div>
    </div>

    <State :loading="loading && !d" :error="error" :retry="reload">
      <template v-if="d">
        <div class="grid g3">
          <div class="card" style="grid-column: span 2">
            <div class="card-h"><h3>Hodisalar kunlar bo'yicha</h3><span class="card-sub">jami {{ d.total }}</span></div>
            <div class="card-b">
              <LineChart :labels="d.byDay.map((x) => x.day.slice(5))" :tip-labels="d.byDay.map((x) => fmt.day(x.day))" :series="[{ name: 'Hammasi', values: d.byDay.map((x) => x.n) }, { name: 'Ogohlantirish/jiddiy', values: d.byDay.map((x) => x.warn) }]" :height="190" />
            </div>
          </div>
          <div class="card">
            <div class="card-h"><h3>Toifalar</h3></div>
            <div class="card-b">
              <BarList :items="Object.entries(d.categories).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, label: k, value: v, onClick: () => (f.category = k) }))" />
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-b">
            <DataTable :columns="cols" :rows="d.events" server :total="d.total" :page="page" :per-page="50" clickable @page="(p) => (page = p)" @row="(r) => (sel = r)">
              <template #severity="{ row }">
                <span class="badge" :class="row.severity === 'info' ? 'b-good' : row.severity === 'critical' ? 'b-bad' : 'b-warn'">
                  <Icon :name="row.severity === 'info' ? 'check' : 'alert'" :size="11" />{{ row.result }}
                </span>
              </template>
            </DataTable>
          </div>
        </div>
      </template>
    </State>

    <Modal v-if="sel" title="Jurnal yozuvi" @close="sel = null">
      <dl class="kv">
        <dt>Vaqt</dt><dd>{{ fmt.dt(sel.at) }}</dd>
        <dt>Hodisa</dt><dd>{{ sel.text }} <span class="mono muted">({{ sel.event }})</span></dd>
        <dt>Toifa</dt><dd>{{ sel.category }}</dd>
        <dt>Foydalanuvchi</dt><dd>{{ sel.actor || "—" }} ({{ roleName(sel.role) }})</dd>
        <dt>Natija</dt><dd>{{ sel.result }}</dd>
        <dt>IP</dt><dd class="mono">{{ sel.ip || "—" }}</dd>
        <dt>So'rov</dt><dd class="mono">{{ sel.method || "" }} {{ sel.path || "—" }}</dd>
        <dt>Obyekt</dt><dd class="mono">{{ sel.target ? JSON.stringify(sel.target) : "—" }}</dd>
      </dl>
      <div v-if="sel.meta" style="margin-top: 12px">
        <div class="section-t">Tafsilotlar</div>
        <pre class="pre">{{ JSON.stringify(sel.meta, null, 2) }}</pre>
      </div>
    </Modal>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from "vue";
import { useRoute } from "vue-router";
import { api } from "../api.js";
import { period, periodQuery, fmt, roleName } from "../store.js";
import { useLoad } from "../useLoad.js";
import State from "../components/State.vue";
import DataTable from "../components/DataTable.vue";
import LineChart from "../components/LineChart.vue";
import BarList from "../components/BarList.vue";
import Modal from "../components/Modal.vue";
import PeriodPicker from "../components/PeriodPicker.vue";
import Icon from "../components/Icon.vue";

const route = useRoute();
const f = reactive({ category: route.query.category || "", role: "", severity: "", actor: "", q: "" });
const page = ref(1);
const sel = ref(null);
// Tanlangan davrni ISO vaqtga aylantirish (brauzer vaqti bo'yicha kun boshi/oxiri)
const iso = computed(() => {
  const p = periodQuery.value;
  const end = new Date();
  let start;
  if (p.period === "custom") {
    start = new Date(p.from + "T00:00:00");
    const e = new Date(p.to + "T23:59:59.999");
    return { from: start.toISOString(), to: e.toISOString(), label: `${fmt.day(p.from)} — ${fmt.day(p.to)}` };
  }
  const n = p.period === "today" ? 1 : Number(p.period) || 30;
  start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (n - 1));
  return { from: start.toISOString(), to: end.toISOString(), label: n === 1 ? "Bugun" : `Oxirgi ${n} kun` };
});
const rangeLabel = computed(() => iso.value.label);
let t;
watch(() => [f.actor, f.q], () => {
  clearTimeout(t);
  t = setTimeout(() => ((page.value = 1), reload()), 400);
});
watch(() => [f.category, f.role, f.severity, period.period, period.from, period.to], () => (page.value = 1));
const { data: d, loading, error, reload } = useLoad(
  () => api("/api/super/activity", { query: { from: iso.value.from, to: iso.value.to, category: f.category, role: f.role, severity: f.severity, actor: f.actor.trim(), q: f.q.trim(), page: page.value, limit: 50 } }),
  { deps: computed(() => [iso.value.from, iso.value.to, f.category, f.role, f.severity, page.value]), pollMs: 60000 },
);
function clear() {
  Object.assign(f, { category: "", role: "", severity: "", actor: "", q: "" });
}
const cols = [
  { key: "at", label: "Vaqt", fmt: (v) => fmt.dt(v), nowrap: true, sortable: false },
  { key: "category", label: "Toifa", sortable: false },
  { key: "text", label: "Amal", sortable: false },
  { key: "actor", label: "Foydalanuvchi", sortable: false, fmt: (v, r) => (v ? `${v} (${roleName(r.role)})` : "—") },
  { key: "severity", label: "Natija", sortable: false },
  { key: "ip", label: "IP", sortable: false },
];
</script>

<style scoped>
.pre { font-family: var(--mono); font-size: 12px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 9px; padding: 10px; overflow: auto; max-height: 300px; white-space: pre-wrap; word-break: break-word; }
</style>
