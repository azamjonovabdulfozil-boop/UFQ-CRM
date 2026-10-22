<template>
  <div class="stack">
    <div class="page-head">
      <div>
        <p>
          Barcha ko'rsatkichlar CRM bazasidagi haqiqiy yozuvlardan hisoblanadi. Ma'lumot yetarli bo'lmasa «—» ko'rsatiladi
          (nol bilan almashtirilmaydi). Kartani bosing — batafsil sahifa ochiladi.
        </p>
        <p v-if="d" class="small muted" style="margin-top: 4px">
          Vaqt mintaqasi: {{ d.timezone }} · Ma'lumot oxirgi o'zgargan: {{ fmt.dt(d.dataUpdatedAt) }} · Yangilangan:
          {{ updatedAt ? fmt.dt(updatedAt) : "—" }}
          <button class="btn ghost sm" @click="reload()" aria-label="Yangilash"><Icon name="refresh" :size="13" /></button>
        </p>
      </div>
      <PeriodPicker :label="d?.range?.label" />
    </div>

    <State :loading="loading && !d" :error="error" :retry="reload">
      <template v-if="d">
        <!-- Statistik kartalar -->
        <div class="stats">
          <StatCard label="Jami o'quvchilar" icon="users" :value="fmt.int(s.students.total)" :sub="`aktiv: ${s.students.active}`"
            :delta="s.students.newInPeriod ? `+${s.students.newInPeriod} yangi` : ''" to="/analytics?tab=students" />
          <StatCard label="O'qituvchilar" icon="school" :value="fmt.int(s.teachers.total)" :sub="`guruhi bor: ${s.teachers.withGroups}`" to="/teachers" />
          <StatCard label="Sinflar / guruhlar" icon="layers" :value="fmt.int(s.groups.total)" :sub="`faol: ${s.groups.active} · kurslar: ${s.courses}`" to="/analytics?tab=groups" />
          <StatCard label="Administratorlar" icon="shield" :value="fmt.int(s.accounts.admins)" sub="Super Admin bilan birga" to="/admins" />
          <StatCard label="Bugun qo'shilganlar" icon="plus" :value="fmt.int(s.students.newToday + s.accounts.newToday)"
            :sub="`talaba: ${s.students.newToday} · hisob: ${s.accounts.newToday}`" to="/data?entity=students" />
          <StatCard label="Faol / nofaol foydalanuvchilar" icon="user" :value="`${s.accounts.active30} / ${s.accounts.inactive}`"
            sub="oxirgi 30 kunda tizimga kirganlar / kirmaganlar" to="/admins" />
          <StatCard label="O'tilgan darslar" icon="book" :value="fmt.int(s.lessons.held)"
            :sub="`rejadagi (o'tgan): ${s.lessons.plannedPast} · keyingi: ${s.lessons.plannedFuture}`"
            :delta="fmt.delta(s.lessons.held - s.prevLessons.held)" to="/analytics?tab=lessons" />
          <StatCard label="Belgilanmagan darslar" icon="alert" :value="fmt.int(s.lessons.missed)"
            :tone="s.lessons.missed > 0 ? 'warn' : 'good'" :sub="s.lessons.marking == null ? 'jadval yo\'q' : `rejaning ${fmt.pct(s.lessons.marking)} bajarilgan`"
            to="/analytics?tab=lessons" />
          <StatCard label="Davomat" icon="check" :value="s.att.pct == null ? null : fmt.n(s.att.pct)" unit="%"
            :sub="s.att.marked ? `${s.att.marked} ta belgi` : 'belgilar yo\'q'"
            :delta="s.att.pct != null && s.prevAtt.pct != null ? fmt.delta(s.att.pct - s.prevAtt.pct, ' p.p.') : ''" to="/analytics?tab=groups" />
          <StatCard label="O'rtacha baho" icon="trophy" :value="s.grades.avg == null ? null : fmt.n(s.grades.avg)"
            :sub="s.grades.n ? `${s.grades.n} ta baho (0–100)` : 'davrda baho yo\'q'"
            :delta="s.grades.avg != null && s.grades.prevAvg != null ? fmt.delta(s.grades.avg - s.grades.prevAvg) : ''" to="/analytics?tab=students" />
          <StatCard label="Test natijalari" icon="file" :value="s.tests.avg == null ? null : fmt.n(s.tests.avg)" unit="%"
            :sub="s.tests.n ? `${s.tests.n} ta natija` : 'davrda test yo\'q'" to="/analytics?tab=students" />
          <StatCard label="Uy vazifalari" icon="book" value="Mavjud emas" sub="CRM'da modul yo'q — batafsil" tone="warn" to="/analytics?tab=homework" />
          <StatCard label="Server xatolari (24 soat)" icon="server" :value="fmt.int(d.system.serverErrors24h)"
            :tone="d.system.serverErrors24h ? 'bad' : 'good'" :sub="`5xx (60 daq): ${d.system.errorRate60.err} / ${d.system.errorRate60.n}`" to="/monitoring" />
          <StatCard label="Backend va baza" icon="pulse" :value="d.system.db.ok ? 'Ishlayapti' : 'Muammo'" :tone="d.system.db.ok ? 'good' : 'bad'"
            :sub="d.system.db.ok ? `baza ping ${d.system.db.pingMs} ms · ish vaqti ${fmt.dur(d.system.uptimeSec)}` : d.system.db.error" to="/monitoring" />
        </div>

        <!-- Grafiklar -->
        <div class="grid g2">
          <div class="card">
            <div class="card-h"><h3>Davomat dinamikasi</h3><span class="card-sub">K / (K+Y+S), {{ bucketWord }}</span></div>
            <div class="card-b">
              <LineChart :labels="labels" :tip-labels="tipLabels" :series="[{ name: 'Davomat', values: d.series.map((x) => x.attendance) }]" unit="%" :max="100" aria-label="Davomat dinamikasi" />
            </div>
          </div>
          <div class="card">
            <div class="card-h"><h3>Darslar: reja va bajarilishi</h3><span class="card-sub">{{ bucketWord }}</span></div>
            <div class="card-b">
              <ColumnChart
                :labels="labels"
                :tip-labels="tipLabels"
                :values="d.series.map((x) => x.planned)"
                :extra="d.series.map((x) => 'O\'tilgan (davomat bor): ' + x.held)"
                name="Rejadagi darslar"
                aria-label="Darslar"
              />
              <div class="small muted" style="margin-top: 6px">
                Davrda: rejada {{ s.lessons.plannedPast + s.lessons.plannedFuture }} ta, o'tilgan {{ s.lessons.held }} ta. Ustun ustiga olib boring — kunlik tafsilot.
              </div>
            </div>
          </div>
          <div class="card">
            <div class="card-h"><h3>O'quvchilar soni o'sishi</h3><span class="card-sub">qo'shilgan sana bo'yicha jami</span></div>
            <div class="card-b">
              <LineChart :labels="d.growth.points.map((p) => p.label)" :series="[{ name: 'Jami o\'quvchilar', values: d.growth.points.map((p) => p.total) }]" aria-label="O'quvchilar o'sishi" />
              <div v-if="d.growth.unknownJoinDate" class="note" style="margin-top: 8px">
                {{ d.growth.unknownJoinDate }} ta talabaning qo'shilgan sanasi yo'q — grafikda hisoblanmagan.
              </div>
            </div>
          </div>
          <div class="card">
            <div class="card-h"><h3>O'rtacha baho</h3><span class="card-sub">baholar jurnali, {{ bucketWord }}</span></div>
            <div class="card-b">
              <LineChart :labels="labels" :tip-labels="tipLabels" :series="[{ name: 'O\'rtacha baho', values: d.series.map((x) => x.avgGrade) }]" :max="100" aria-label="O'rtacha baho" />
            </div>
          </div>
        </div>

        <div class="grid g3">
          <!-- Muhim ogohlantirishlar -->
          <div class="card">
            <div class="card-h"><h3><Icon name="alert" :size="16" /> Muhim ogohlantirishlar</h3><router-link to="/insights" class="small">Hammasi</router-link></div>
            <div class="card-b">
              <div v-if="!d.insights.length" class="muted small">Hozircha jiddiy muammo aniqlanmadi.</div>
              <router-link v-for="(i, k) in d.insights" :key="k" :to="'/insights'" class="list-row ins">
                <span class="badge" :class="i.level === 'alert' ? 'b-bad' : 'b-warn'">
                  <Icon :name="i.level === 'alert' ? 'x' : 'alert'" :size="12" />{{ i.level === "alert" ? "Jiddiy" : "Diqqat" }}
                </span>
                <div style="min-width: 0">
                  <div style="font-weight: 650; color: var(--text)">{{ i.title }}</div>
                  <div class="small muted">{{ i.numbers }}</div>
                </div>
              </router-link>
            </div>
          </div>
          <!-- Xavfsizlik -->
          <div class="card">
            <div class="card-h"><h3><Icon name="shield" :size="16" /> Xavfsizlik ogohlantirishlari</h3><router-link to="/activity" class="small">Jurnal</router-link></div>
            <div class="card-b">
              <div class="row" style="margin-bottom: 8px">
                <span class="badge" :class="d.security.failedLogins ? 'b-warn' : 'b-good'">
                  <Icon :name="d.security.failedLogins ? 'alert' : 'check'" :size="12" /> Xato kirishlar: {{ d.security.failedLogins }}
                </span>
              </div>
              <div v-if="!d.security.byEvent.length" class="muted small">Davrda ogohlantirish yo'q.</div>
              <div v-for="e in d.security.byEvent.slice(0, 6)" :key="e.event" class="list-row">
                <div style="flex: 1; min-width: 0">
                  <div style="font-weight: 600">{{ e.text }}</div>
                  <div class="small muted">oxirgisi: {{ fmt.ago(e.last) }}</div>
                </div>
                <b>{{ e.n }}</b>
              </div>
              <div v-if="d.security.critical.length" class="note bad" style="margin-top: 8px">
                <b>Jiddiy hodisalar:</b>
                <div v-for="(c, k) in d.security.critical.slice(0, 3)" :key="k">{{ fmt.dt(c.at) }} — {{ c.text }} ({{ c.actor || "noma'lum" }})</div>
              </div>
            </div>
          </div>
          <!-- Admin faoliyati -->
          <div class="card">
            <div class="card-h"><h3><Icon name="list" :size="16" /> Oxirgi administratorlar faoliyati</h3><router-link to="/activity" class="small">Hammasi</router-link></div>
            <div class="card-b">
              <div v-if="!d.recentActivity.length" class="muted small">Yozuv yo'q.</div>
              <div v-for="(a, k) in d.recentActivity.slice(0, 8)" :key="k" class="list-row">
                <span class="dot" :style="{ background: a.severity === 'info' ? 'var(--s3)' : a.severity === 'critical' ? 'var(--bad)' : 'var(--warn)' }"></span>
                <div style="min-width: 0; flex: 1">
                  <div class="small" style="font-weight: 600; color: var(--text)">{{ a.text }}</div>
                  <div class="small muted">{{ a.actor }} · {{ roleName(a.role) }} · {{ fmt.ago(a.at) }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="grid g2">
          <div class="card">
            <div class="card-h"><h3><Icon name="trophy" :size="16" /> Reyting yetakchilari</h3><router-link to="/teachers" class="small">To'liq reyting</router-link></div>
            <div class="card-b">
              <BarList
                :items="d.topTeachers.map((t) => ({ key: t.id, label: t.name, sub: t.confidence === 'high' ? 'ishonchli' : 'taxminiy', value: t.score, text: fmt.n(t.score) }))"
                :max="100"
              />
              <div class="note" style="margin-top: 10px">Reyting faqat tahlil uchun — kadrlar bo'yicha qaror avtomatik qabul qilinmaydi.</div>
            </div>
          </div>
          <div class="card">
            <div class="card-h"><h3><Icon name="server" :size="16" /> Oxirgi tizim xatolari</h3><router-link to="/monitoring" class="small">Monitoring</router-link></div>
            <div class="card-b">
              <div v-if="!d.system.lastErrors.length" class="row muted small"><Icon name="check" :size="15" /> Jurnalda server xatosi yo'q.</div>
              <div v-for="(e, k) in d.system.lastErrors" :key="k" class="list-row">
                <span class="dot" style="background: var(--bad)"></span>
                <div style="min-width: 0">
                  <div class="small mono">{{ e.method }} {{ e.path }}</div>
                  <div class="small muted">{{ fmt.dt(e.at) }} — {{ e.message }}</div>
                </div>
              </div>
              <div class="small muted" style="margin-top: 8px">
                Faol foydalanuvchilar (5 daq): <b>{{ d.system.activeUsers.total }}</b> · Oxirgi zaxira:
                <b>{{ d.system.lastBackup ? fmt.ago(d.system.lastBackup.at) : "yo'q" }}</b>
              </div>
            </div>
          </div>
        </div>
      </template>
    </State>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { api } from "../api.js";
import { periodQuery, fmt, roleName } from "../store.js";
import { useLoad } from "../useLoad.js";
import State from "../components/State.vue";
import StatCard from "../components/StatCard.vue";
import LineChart from "../components/LineChart.vue";
import BarList from "../components/BarList.vue";
import ColumnChart from "../components/ColumnChart.vue";
import PeriodPicker from "../components/PeriodPicker.vue";
import Icon from "../components/Icon.vue";

const { data: d, loading, error, reload, updatedAt } = useLoad(() => api("/api/super/overview", { query: periodQuery.value }), {
  deps: periodQuery,
  pollMs: 60000,
});
const s = computed(() => d.value?.stats);
const labels = computed(() => (d.value?.series || []).map((x) => x.label));
const tipLabels = computed(() => (d.value?.series || []).map((x) => (x.from === x.to ? fmt.day(x.from) : `${fmt.day(x.from)} — ${fmt.day(x.to)}`)));
const bucketWord = computed(() => {
  const n = d.value?.range?.days || 30;
  return n <= 31 ? "kunlar bo'yicha" : n <= 120 ? "haftalar bo'yicha" : "oylar bo'yicha";
});
</script>

<style scoped>
.ins { text-decoration: none !important; }
.ins:hover > div > div:first-child { color: var(--accent-text) !important; }
</style>
