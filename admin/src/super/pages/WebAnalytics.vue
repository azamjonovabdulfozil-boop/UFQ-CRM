<template>
  <div class="stack">
    <div class="page-head">
      <div>
        <p>Saytlaringizga necha kishi kirgani, qayerdan kelgani va nima qilgani. Statistika saytga kuzatuv kodi qo'yilgan paytdan boshlab yig'iladi.</p>
        <div class="row" style="margin-top: 8px">
          <button class="btn pri" @click="adding = true"><Icon name="plus" :size="15" /> Sayt qo'shish</button>
          <select v-if="d?.sites?.length" v-model="siteFilter" class="sel" style="max-width: 260px" aria-label="Sayt">
            <option value="">Barcha saytlar birga</option>
            <option v-for="s in d?.sites || []" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
          <router-link v-if="siteFilter" class="btn" :to="'/web/' + siteFilter">Shu sayt haqida batafsil <Icon name="right" :size="14" /></router-link>
        </div>
      </div>
      <WaPeriod :label="d?.range?.label" :prev-label="prevLabel" />
    </div>

    <State :loading="loading && !d" :error="error" :retry="reload">
      <template v-if="d">
        <div v-if="!d.sites.length" class="card empty-hero">
          <div class="eh-ic"><Icon name="chart" :size="30" /></div>
          <h3>Hali sayt qo'shilmagan</h3>
          <p class="muted">3 ta oddiy qadam:</p>
          <ol class="eh-steps">
            <li><b>Sayt manzilini yozing</b><span>masalan, ufq.uz</span></li>
            <li><b>Kichik kodni saytga qo'ying</b><span>WordPress, Tilda, Wix uchun ko'rsatma bor</span></li>
            <li><b>Statistikani kuzating</b><span>kim, qayerdan, qachon kirdi</span></li>
          </ol>
          <button class="btn pri" @click="adding = true"><Icon name="plus" :size="15" /> Birinchi saytni qo'shish</button>
        </div>

        <template v-else>
          <div v-if="waiting.length" class="note info">
            <b>{{ waiting.map((s) => s.name).join(", ") }}</b> — kuzatuv kodi hali o'rnatilmagan, shuning uchun statistika yo'q.
            <router-link :to="'/web/' + waiting[0].id">Kodni o'rnatish →</router-link>
          </div>

          <div class="kpis">
            <KpiCard label="Ulangan saytlar" :value="num(d.totals.sites)" :sub="d.totals.activeSites + ' tasidan oxirgi 24 soatda ma\'lumot keldi'" />
            <KpiCard label="Bugun kirishlar" :value="num(d.totals.todaySessions)" :sub="num(d.totals.todayVisitors) + ' kishi'" />
            <KpiCard label="Hozir saytlarda" :value="num(d.totals.activeNow)" sub="oxirgi 5 daqiqada" live />
            <KpiCard label="Tashriflar" desc="Saytga necha marta kirishgan" :value="num(k.cur.sessions)" :delta="change(k.cur.sessions, k.prev.sessions)" :prev-text="num(k.prev.sessions)" :spark="k.spark.sessions" />
            <KpiCard label="Kelgan odamlar" desc="Har bir qurilma bir kishi deb sanaladi" :value="num(k.cur.visitors)" :delta="change(k.cur.visitors, k.prev.visitors)" :prev-text="num(k.prev.visitors)" :spark="k.spark.visitors" />
            <KpiCard label="Ochilgan sahifalar" desc="Jami nechta sahifa ko'rilgan" :value="num(k.cur.pageviews)" :delta="change(k.cur.pageviews, k.prev.pageviews)" :prev-text="num(k.prev.pageviews)" :spark="k.spark.pageviews" />
            <KpiCard label="Saytda o'rtacha vaqt" desc="Bir kirishda qancha qolishgan" :value="dur(k.cur.avgDuration)" :delta="change(k.cur.avgDuration, k.prev.avgDuration)" :prev-text="dur(k.prev.avgDuration)" />
            <KpiCard label="Darhol chiqib ketganlar" desc="1 sahifani ko'rib, 10 soniyada chiqqanlar. Qancha kam — shuncha yaxshi" :value="pct(k.cur.bounceRate)" :delta="change(k.cur.bounceRate, k.prev.bounceRate)" :prev-text="pct(k.prev.bounceRate)" :up-is-good="false" />
            <KpiCard label="Natijalar" desc="Ariza, xarid, qo'ng'iroq va boshqa maqsadlar" :value="num(k.cur.conversions)" :delta="change(k.cur.conversions, k.prev.conversions)" :prev-text="num(k.prev.conversions)" :spark="k.spark.conversions" />
            <KpiCard label="Arizalar" desc="Qoldirilgan arizalar soni" :value="num(k.cur.leads)" :delta="change(k.cur.leads, k.prev.leads)" :prev-text="num(k.prev.leads)" />
            <KpiCard label="Sotuvdan tushum" :value="k.cur.revenue > 0 || k.prev.revenue > 0 ? money(k.cur.revenue) : '—'" :delta="k.cur.revenue > 0 ? change(k.cur.revenue, k.prev.revenue) : null" :sub="k.cur.revenue > 0 ? '' : 'saytdan xarid ma\'lumoti kelmagan'" />
          </div>

          <div class="card">
            <div class="card-h"><h3>Kunlar bo'yicha kirishlar</h3><span class="card-sub">{{ d.range.label }}{{ siteFilter ? " · " + siteName : " · barcha saytlar" }}</span></div>
            <div class="card-b">
              <LineChart :labels="tsLabels" :tip-labels="d.timeseries.labels" :series="[{ name: 'Tashriflar', values: d.timeseries.sessions }, { name: 'Kelgan odamlar', values: d.timeseries.visitors }]" aria-label="Kirishlar dinamikasi" />
              <p class="muted small chart-note">Birinchi chiziq — saytga necha marta kirilgani, ikkinchisi — necha xil odam kirgani. Aniq sonni ko'rish uchun grafik ustiga sichqonchani olib boring.</p>
            </div>
          </div>

          <div class="grid g2">
            <div class="card">
              <div class="card-h"><h3>Hozir nima bo'lyapti <span class="badge b-good" title="Har 15 soniyada yangilanadi">● jonli</span></h3><span class="card-sub">yangilandi: {{ fmt.ago(d.realtime.at) }}</span></div>
              <div class="card-b">
                <div v-if="!d.realtime.recent.length" class="muted small">Oxirgi 30 daqiqada saytlarga hech kim kirmadi</div>
                <div v-for="(e, i) in d.realtime.recent.slice(0, 10)" :key="i" class="list-row rt-row">
                  <span class="badge" :class="convType(e.type) ? 'b-good' : 'b-info'">{{ EVENT_LABEL[e.type] || e.type }}</span>
                  <span class="mono small rt-path">{{ e.path }}</span>
                  <span class="small muted">{{ siteNameOf(e.siteId) }}</span>
                  <span class="small muted rt-t">{{ fmt.ago(e.t) }}</span>
                </div>
              </div>
            </div>
            <div class="card">
              <div class="card-h"><h3>Diqqat qilish kerak</h3><span class="card-sub">{{ d.alerts.length ? d.alerts.length + " ta" : "" }}</span></div>
              <div class="card-b stack" style="gap: 8px">
                <div v-if="!d.alerts.length" class="note good small"><Icon name="check" :size="14" /> Hammasi joyida — muammo topilmadi</div>
                <AlertItem v-for="(a, i) in d.alerts.slice(0, 6)" :key="i" :a="a" show-site />
                <div v-if="d.silentSites.length" class="note warn">
                  Bu saytlardan ma'lumot kelmayapti: <b>{{ d.silentSites.map((s) => s.name).join(", ") }}</b>
                </div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-h"><h3>Saytlar</h3><span class="card-sub">batafsil ko'rish uchun saytni bosing</span></div>
            <div class="card-b">
              <DataTable :columns="cols" :rows="d.sites" clickable default-sort="sessions" @row="(r) => router.push('/web/' + r.id)">
                <template #name="{ row }">
                  <div class="site-cell">
                    <b>{{ row.name }}</b>
                    <span class="small muted">{{ row.host }}</span>
                  </div>
                </template>
                <template #tracking="{ row }"><TrackBadge :site="row" /></template>
                <template #health="{ row }"><HealthBadge :h="row.health" /></template>
                <template #spark="{ row }"><Spark :values="row.spark" :label="row.name + ' trendi'" /></template>
                <template #change="{ value }">
                  <span v-if="value != null" :class="value > 0 ? 'up' : value < 0 ? 'down' : 'muted'">{{ value > 0 ? "▲" : value < 0 ? "▼" : "" }} {{ Math.abs(value) }}%</span>
                  <span v-else class="muted">—</span>
                </template>
              </DataTable>
            </div>
          </div>
        </template>
      </template>
    </State>

    <SiteForm v-if="adding" :categories="cats" @close="adding = false" @saved="onAdded" />
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api.js";
import { fmt, toast } from "../store.js";
import { useLoad } from "../useLoad.js";
import { waQuery, num, pct, dur, money, change, EVENT_LABEL } from "../wa.js";
import State from "../components/State.vue";
import Icon from "../components/Icon.vue";
import KpiCard from "../components/KpiCard.vue";
import LineChart from "../components/LineChart.vue";
import DataTable from "../components/DataTable.vue";
import Spark from "../components/Spark.vue";
import WaPeriod from "../components/WaPeriod.vue";
import SiteForm from "../components/SiteForm.vue";
import { AlertItem, TrackBadge, HealthBadge } from "../components/waBits.js";

const router = useRouter();
const siteFilter = ref("");
const adding = ref(false);
const cats = ref(["Biznes", "Ta'lim", "Internet do'kon", "Xizmatlar", "Blog / Media", "Portfolio", "Davlat / Jamiyat", "Boshqa"]);
const { data: d, loading, error, reload } = useLoad(() => api("/api/super/wa/overview", { query: { ...waQuery.value, site: siteFilter.value } }), {
  deps: computed(() => [waQuery.value, siteFilter.value]),
  pollMs: 15000,
});
const k = computed(() => d.value.kpis);
const prevLabel = computed(() => {
  const p = d.value?.range?.prev;
  return p ? (p.from === p.to ? fmt.day(p.from) : fmt.day(p.from) + " — " + fmt.day(p.to)) : "";
});
const tsLabels = computed(() => (d.value.timeseries.hourly ? d.value.timeseries.labels : d.value.timeseries.labels.map((x) => fmt.day(x).replace(/ \d{4}$/, ""))));
const siteName = computed(() => d.value?.sites.find((s) => s.id === siteFilter.value)?.name || "");
const siteNameOf = (id) => d.value?.sites.find((s) => s.id === id)?.name || "";
const convType = (t) => ["lead", "purchase", "conversion"].includes(t);
const cols = [
  { key: "name", label: "Sayt" },
  { key: "tracking", label: "Kuzatuv kodi", sortable: false },
  { key: "health", label: "Sayt holati", sortable: false },
  { key: "todaySessions", label: "Bugun", align: "r" },
  { key: "sessions", label: "Tashriflar", align: "r", fmt: num },
  { key: "change", label: "O'zgarish", align: "r" },
  { key: "visitors", label: "Odamlar", align: "r", fmt: num },
  { key: "bounceRate", label: "Darhol chiqqan", align: "r", fmt: pct },
  { key: "conversions", label: "Natijalar", align: "r", fmt: num },
  { key: "spark", label: "So'nggi kunlar", sortable: false },
];
const waiting = computed(() => (d.value?.sites || []).filter((s) => s.tracking === "waiting" && s.status !== "paused"));
function onAdded(site) {
  adding.value = false;
  toast("Sayt qo'shildi");
  router.push("/web/" + site.id);
}
</script>

<style scoped>
.kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
.empty-hero { padding: 40px 20px; text-align: center; display: grid; justify-items: center; gap: 10px; }
.eh-ic { width: 60px; height: 60px; border-radius: 18px; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent-text); }
.eh-steps { list-style: none; counter-reset: s; margin: 4px 0 8px; padding: 0; display: grid; gap: 8px; text-align: left; }
.eh-steps li { counter-increment: s; display: grid; grid-template-columns: 28px 1fr; column-gap: 10px; }
.eh-steps li::before { content: counter(s); grid-row: span 2; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent-text); font-weight: 800; }
.eh-steps span { font-size: 12.5px; color: var(--text-3); }
.chart-note { margin-top: 8px; }
.rt-row { display: grid; grid-template-columns: auto 1fr auto auto; gap: 8px; align-items: center; }
.rt-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rt-t { white-space: nowrap; }
.site-cell { display: flex; flex-direction: column; }
.up { color: var(--good); font-weight: 700; }
.down { color: var(--bad); font-weight: 700; }
</style>
