<template>
  <div class="stack">
    <div class="page-head">
      <p>
        Backend, ma'lumotlar bazasi va API holati. So'rov hisoblagichlari server xotirasida yuritiladi va server qayta ishga tushganda
        nollanadi<span v-if="d"> (hisob {{ fmt.dt(d.requests.since) }} dan beri)</span>. Yangilanish faqat sahifa ochiq turganda ishlaydi.
      </p>
      <div class="row">
        <span class="small muted">Avtoyangilash:</span>
        <div class="chips">
          <button v-for="s in [0, 15, 30, 60]" :key="s" class="chip" :class="{ on: poll === s }" @click="setPoll(s)">{{ s ? s + " s" : "o'chiq" }}</button>
        </div>
        <button class="btn sm" @click="reload()"><Icon name="refresh" :size="14" /> Hozir</button>
      </div>
    </div>
    <State :loading="loading && !d" :error="error" :retry="reload">
      <template v-if="d">
        <div class="small muted">Oxirgi yangilanish: {{ updatedAt ? fmt.dt(updatedAt) : "—" }}</div>
        <div class="stats">
          <StatCard label="Backend" icon="server" value="Ishlayapti" tone="good" :sub="`ish vaqti ${fmt.dur(d.server.uptimeSec)} · ${d.server.node}`" />
          <StatCard label="Ma'lumotlar bazasi" icon="db" :value="d.db.ok ? d.db.pingMs + ' ms' : 'Ulanmagan'" :tone="d.db.ok ? (d.db.pingMs > 500 ? 'warn' : 'good') : 'bad'"
            :sub="d.db.ok ? `ping · hajm ${fmt.n(d.db.dataSizeMb)} MB · ${d.db.collections} kolleksiya` : d.db.error" />
          <StatCard label="So'rovlar (60 daqiqa)" icon="pulse" :value="fmt.int(d.requests.last60.n)" :sub="`oxirgi daqiqa: ${d.requests.lastMinute.n}`" />
          <StatCard label="API xatolari (5xx, 60 daq)" icon="alert" :value="fmt.int(d.requests.last60.err)" :tone="d.requests.last60.err ? 'bad' : 'good'"
            :sub="d.requests.last60.n ? `ulush ${fmt.pct((d.requests.last60.err / d.requests.last60.n) * 100)}` : ''" />
          <StatCard label="Javob vaqti" icon="clock" :value="d.requests.p50 == null ? null : d.requests.p50" unit=" ms" :sub="`median · p95: ${d.requests.p95 ?? '—'} ms`" />
          <StatCard label="Server xatolari (24 soat)" icon="x" :value="fmt.int(d.serverErrors24h)" :tone="d.serverErrors24h ? 'warn' : 'good'" sub="jurnaldan (restartdan keyin ham saqlanadi)" />
          <StatCard label="Faol foydalanuvchilar" icon="users" :value="fmt.int(d.activeUsers.total)" :sub="activeText" />
          <StatCard label="Ochiq real-vaqt ulanishlar" icon="layers" :value="fmt.int(d.server.sseClients)" sub="SSE (brauzerlar)" />
          <StatCard label="Xotira (jarayon)" icon="server" :value="d.server.memoryMb" unit=" MB" :sub="`heap ${d.server.heapMb} MB · event loop p99 ${d.server.eventLoopMs.p99} ms`" />
          <StatCard label="Oxirgi ma'lumot yangilanishi" icon="refresh" :value="fmt.ago(d.lastDataUpdate)" :sub="fmt.dt(d.lastDataUpdate)" />
          <StatCard label="Oxirgi zaxira nusxa" icon="archive" :value="d.lastBackup ? fmt.ago(d.lastBackup.at) : 'yo\'q'" :sub="d.lastBackup?.reason || ''" to="/backups" />
        </div>
        <div class="grid g2">
          <div class="card">
            <div class="card-h"><h3>So'rovlar va xatolar (daqiqalar bo'yicha)</h3></div>
            <div class="card-b">
              <LineChart :labels="mins" :series="[{ name: 'So\'rovlar', values: d.requests.series.map((x) => x.n) }, { name: '5xx xatolar', values: d.requests.series.map((x) => x.err) }]" :height="200" />
            </div>
          </div>
          <div class="card">
            <div class="card-h"><h3>O'rtacha javob vaqti, ms</h3></div>
            <div class="card-b">
              <LineChart :labels="mins" :series="[{ name: 'O\'rtacha', values: d.requests.series.map((x) => x.avgMs) }]" unit=" ms" :height="200" />
            </div>
          </div>
        </div>
        <div class="grid g2">
          <div class="card">
            <div class="card-h"><h3>Xato qaytarayotgan endpointlar</h3></div>
            <div class="card-b"><DataTable :columns="epCols" :rows="d.requests.topByErrors.map((e) => ({ ...e, id: e.key }))" empty-text="Xato yo'q" /></div>
          </div>
          <div class="card">
            <div class="card-h"><h3>Eng sekin endpointlar</h3></div>
            <div class="card-b"><DataTable :columns="slowCols" :rows="d.requests.topBySlow.map((e) => ({ ...e, id: e.key }))" /></div>
          </div>
          <div class="card">
            <div class="card-h"><h3>Oxirgi API xatolari (xotira)</h3></div>
            <div class="card-b"><DataTable :columns="recCols" :rows="d.requests.recentErrors.map((e, i) => ({ ...e, id: i }))" empty-text="Xato yo'q" /></div>
          </div>
          <div class="card">
            <div class="card-h"><h3>Oxirgi server xatolari (jurnal)</h3></div>
            <div class="card-b"><DataTable :columns="logCols" :rows="(d.lastErrors || []).map((e, i) => ({ ...e, id: i }))" empty-text="Xato yo'q" /></div>
          </div>
        </div>
        <div class="note">
          <b>Ko'rsatilmaydigan resurslar:</b>
          <span v-for="(x, i) in d.notAvailable" :key="i"> {{ x.name }}{{ i < d.notAvailable.length - 1 ? "," : "" }}</span> — {{ d.notAvailable[0]?.reason }}
        </div>
      </template>
    </State>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { api } from "../api.js";
import { fmt } from "../store.js";
import { useLoad } from "../useLoad.js";
import State from "../components/State.vue";
import StatCard from "../components/StatCard.vue";
import LineChart from "../components/LineChart.vue";
import DataTable from "../components/DataTable.vue";
import Icon from "../components/Icon.vue";

const poll = ref(Number(localStorage.getItem("sa_poll") ?? 30) || 0);
const { data: d, loading, error, reload, updatedAt, restartPoll } = useLoad(() => api("/api/super/monitor"), { pollMs: () => (poll.value || 3600) * 1000 });
function setPoll(s) {
  poll.value = s;
  try { localStorage.setItem("sa_poll", String(s)); } catch {}
  restartPoll();
}
const mins = computed(() => (d.value?.requests.series || []).map((x) => new Date(x.t).toTimeString().slice(0, 5)));
const activeText = computed(() => {
  const r = d.value?.activeUsers.byRole || {};
  const names = { admin: "admin", superadmin: "super", mentor: "mentor", student: "talaba" };
  return Object.entries(r).map(([k, v]) => `${names[k] || k}: ${v}`).join(" · ") || "oxirgi 5 daqiqa";
});
const epCols = [{ key: "key", label: "Endpoint" }, { key: "n", label: "So'rov", align: "r" }, { key: "e4", label: "4xx", align: "r" }, { key: "e5", label: "5xx", align: "r" }, { key: "lastErrorAt", label: "Oxirgi xato", fmt: (v) => fmt.ago(v) }];
const slowCols = [{ key: "key", label: "Endpoint" }, { key: "n", label: "So'rov", align: "r" }, { key: "avgMs", label: "O'rtacha ms", align: "r" }, { key: "maxMs", label: "Maks ms", align: "r" }];
const recCols = [{ key: "at", label: "Vaqt", fmt: (v) => fmt.dt(v) }, { key: "method", label: "Usul" }, { key: "path", label: "Manzil" }, { key: "status", label: "Kod", align: "r" }, { key: "ms", label: "ms", align: "r" }];
const logCols = [{ key: "at", label: "Vaqt", fmt: (v) => fmt.dt(v) }, { key: "path", label: "Manzil" }, { key: "message", label: "Xabar" }];
</script>
