<template>
  <div class="stack">
    <div class="page-head">
      <p>
        O'quvchilar, sinflar (guruhlar), darslar va uy vazifalari bo'yicha tahlil. O'zgarishlar oldingi teng davr bilan bir xil formula
        asosida taqqoslanadi<span v-if="d"> ({{ d.prevRange.label }})</span>.
      </p>
      <PeriodPicker :label="d?.range?.label" />
    </div>
    <div class="tabs" role="tablist">
      <button v-for="[k, l] in TABS" :key="k" role="tab" :aria-selected="tab === k" :class="{ on: tab === k }" @click="setTab(k)">{{ l }}</button>
    </div>

    <State :loading="loading && !d" :error="error" :retry="reload">
      <template v-if="d">
        <!-- ══════ O'QUVCHILAR ══════ -->
        <template v-if="tab === 'students'">
          <div class="stats">
            <StatCard label="Jami o'quvchilar" icon="users" :value="fmt.int(d.students.total)" :sub="statusText" />
            <StatCard label="Yangi qo'shilganlar" icon="plus" :value="fmt.int(d.students.newInPeriod)" :sub="`oldingi davr: ${d.students.newPrev}`"
              :delta="fmt.delta(d.students.newInPeriod - d.students.newPrev)" />
            <StatCard label="Faolligi pasaygan" icon="alert" :value="fmt.int(d.students.inactive.length)" tone="warn" sub="Faolsiz/Muzlatilgan yoki 0% davomat" />
            <StatCard label="Davomat" icon="check" :value="d.att.pct == null ? null : fmt.n(d.att.pct)" unit="%"
              :delta="d.att.pct != null && d.prevAtt.pct != null ? fmt.delta(d.att.pct - d.prevAtt.pct, ' p.p.') : ''" :sub="`${d.att.marked} ta belgi`" />
            <StatCard label="O'rtacha baho" icon="trophy" :value="d.grades.avg == null ? null : fmt.n(d.grades.avg)"
              :delta="d.grades.avg != null && d.grades.prevAvg != null ? fmt.delta(d.grades.avg - d.grades.prevAvg) : ''" :sub="`${d.grades.n} ta baho`" />
            <StatCard label="Uy vazifalarini bajarish" icon="book" value="Mavjud emas" tone="warn" sub="CRM'da modul yo'q" />
          </div>
          <div class="grid g2">
            <div class="card">
              <div class="card-h"><h3>O'quvchilar soni (vaqt bo'yicha)</h3></div>
              <div class="card-b">
                <LineChart :labels="d.growth.points.map((p) => p.label)" :series="[{ name: 'Jami', values: d.growth.points.map((p) => p.total) }]" />
              </div>
            </div>
            <div class="card">
              <div class="card-h"><h3>Yangi qo'shilgan o'quvchilar</h3></div>
              <div class="card-b"><ColumnChart :labels="labels" :tip-labels="tipLabels" :values="d.series.map((x) => x.newStudents)" name="Yangi o'quvchi" /></div>
            </div>
          </div>
          <div class="card">
            <div class="card-h"><h3>Qo'shimcha e'tibor kerak bo'lgan o'quvchilar</h3><span class="card-sub">davomat &lt; 60%, baho &lt; 60 yoki keskin pasayish</span></div>
            <div class="card-b">
              <DataTable :columns="helpCols" :rows="needHelp" searchable clickable default-sort="attendance" default-dir="asc" @row="openStudent" empty-text="Bunday o'quvchi aniqlanmadi">
                <template #reasons="{ value }"><span class="small">{{ value.join("; ") }}</span></template>
              </DataTable>
            </div>
          </div>
          <div class="card">
            <div class="card-h"><h3>Faolligi pasaygan o'quvchilar</h3></div>
            <div class="card-b">
              <DataTable :columns="inactCols" :rows="inactive" searchable clickable @row="openStudent" empty-text="Yo'q" />
            </div>
          </div>
          <div class="card">
            <div class="card-h"><h3>Barcha o'quvchilar (davr natijalari)</h3><span class="card-sub">qatorni bosing — o'quv dinamikasi</span></div>
            <div class="card-b">
              <DataTable :columns="allCols" :rows="allMembers" searchable clickable default-sort="name" default-dir="asc" @row="openStudent" />
            </div>
          </div>
        </template>

        <!-- ══════ SINFLAR ══════ -->
        <template v-if="tab === 'groups'">
          <div class="grid g2">
            <div class="card">
              <div class="card-h"><h3>Davomat — guruhlar bo'yicha</h3><span class="card-sub">K/(K+Y+S)</span></div>
              <div class="card-b">
                <BarList :items="groupsActive.filter((g) => g.att.marked).sort((a, b) => b.att.pct - a.att.pct).map((g) => ({ key: g.id, label: g.name, sub: g.mentorName, value: g.att.pct, text: fmt.pct(g.att.pct), onClick: () => (openGroup = g) }))" :max="100" />
              </div>
            </div>
            <div class="card">
              <div class="card-h"><h3>O'rtacha baho — guruhlar bo'yicha</h3></div>
              <div class="card-b">
                <BarList :items="groupsActive.filter((g) => g.avgGrade != null).sort((a, b) => b.avgGrade - a.avgGrade).map((g) => ({ key: g.id, label: g.name, sub: g.gradeN + ' ta baho', value: g.avgGrade, text: fmt.n(g.avgGrade), color: 'var(--s3)', onClick: () => (openGroup = g) }))" :max="100" />
              </div>
            </div>
            <div class="card">
              <div class="card-h"><h3><Icon name="up" :size="16" /> Natijasi yaxshilanayotgan guruhlar</h3></div>
              <div class="card-b">
                <div v-if="!improving.length" class="muted small">Oldingi davr bilan solishtirish uchun ma'lumot yetarli emas yoki yaxshilanish yo'q.</div>
                <div v-for="g in improving" :key="g.id" class="list-row click" @click="openGroup = g">
                  <div style="flex: 1"><b>{{ g.name }}</b><div class="small muted">{{ g.mentorName }}</div></div>
                  <span v-if="g.attDelta > 0" class="up small">davomat {{ fmt.delta(g.attDelta, " p.p.") }}</span>
                  <span v-if="g.gradeDelta > 0" class="up small">baho {{ fmt.delta(g.gradeDelta) }}</span>
                </div>
              </div>
            </div>
            <div class="card">
              <div class="card-h"><h3><Icon name="alert" :size="16" /> Qo'shimcha yordamga muhtoj guruhlar</h3></div>
              <div class="card-b">
                <div v-if="!needy.length" class="muted small">Aniqlanmadi.</div>
                <div v-for="g in needy" :key="g.id" class="list-row click" @click="openGroup = g">
                  <div style="flex: 1"><b>{{ g.name }}</b><div class="small muted">{{ g.why.join(" · ") }}</div></div>
                  <Icon name="right" :size="15" />
                </div>
              </div>
            </div>
          </div>
          <div class="card">
            <div class="card-h"><h3>Sinflarni taqqoslash</h3><span class="card-sub">qatorni bosing — guruh tafsilotlari</span></div>
            <div class="card-b">
              <DataTable :columns="groupCols" :rows="groupRows" searchable clickable default-sort="att" @row="(r) => (openGroup = d.groups.find((g) => g.id === r.id))" />
            </div>
          </div>
        </template>

        <!-- ══════ DARSLAR ══════ -->
        <template v-if="tab === 'lessons'">
          <div class="stats">
            <StatCard label="Rejalashtirilgan (o'tgan)" icon="calendar" :value="fmt.int(d.lessons.plannedPast)" :sub="`keyingi: ${d.lessons.plannedFuture}`" />
            <StatCard label="O'tilgan darslar" icon="check" :value="fmt.int(d.lessons.held)" :delta="fmt.delta(d.lessons.held - d.prevLessons.held)" sub="kamida bitta davomat belgisi" />
            <StatCard label="Qoldirilgan / belgilanmagan" icon="alert" :value="fmt.int(d.lessons.missed)" :tone="d.lessons.missed ? 'warn' : 'good'"
              :sub="d.lessons.marking == null ? '' : `reja bajarilishi ${fmt.pct(d.lessons.marking)}`" />
            <StatCard label="O'z vaqtida belgilangan" icon="clock" :value="d.lessons.onTimePct == null ? null : fmt.n(d.lessons.onTimePct)" unit="%"
              :sub="d.lessons.logged ? `${d.lessons.logged} ta dars bo'yicha` : 'jurnalda ma\'lumot yetarli emas'" />
          </div>
          <div class="note info">
            «O'z vaqtida» — dars kuni yoki ertasi davomat belgilangan darslar ulushi. CRM ilgari belgilash vaqtini saqlamagan; bu jurnal
            {{ d.marksLogSince ? fmt.dt(d.marksLogSince) + " dan" : "endi" }} yuritiladi. Undan oldingi darslar bu ko'rsatkichga kirmaydi.
            {{ d.lessons.undated ? `${d.lessons.undated} ta o'tilgan darsning sanasi noma'lum (guruh jadvali yo'q) — oy bo'yicha hisoblandi.` : "" }}
          </div>
          <div class="card">
            <div class="card-h"><h3>Reja va bajarilish dinamikasi</h3></div>
            <div class="card-b">
              <LineChart :labels="labels" :tip-labels="tipLabels" :series="[{ name: 'Rejadagi', values: d.series.map((x) => x.planned) }, { name: 'O\'tilgan', values: d.series.map((x) => x.held) }]" />
            </div>
          </div>
          <div class="grid g2">
            <div class="card">
              <div class="card-h"><h3>O'qituvchilar bo'yicha</h3></div>
              <div class="card-b"><DataTable :columns="lessonTeacherCols" :rows="d.lessonsByTeacher" default-sort="held" :per-page="10" /></div>
            </div>
            <div class="card">
              <div class="card-h"><h3>Guruhlar bo'yicha</h3></div>
              <div class="card-b"><DataTable :columns="lessonGroupCols" :rows="d.lessonsByGroup.filter((g) => !g.archived)" default-sort="missed" :per-page="10" /></div>
            </div>
          </div>
          <div class="card">
            <div class="card-h"><h3>Belgilanmagan (qoldirilgan) darslar</h3><span class="card-sub">jadval bo'yicha sanasi o'tgan, davomat yo'q</span></div>
            <div class="card-b">
              <DataTable :columns="missedCols" :rows="d.missedLessons.map((x, i) => ({ ...x, id: i }))" searchable default-sort="day" empty-text="Qoldirilgan dars yo'q" />
            </div>
          </div>
        </template>

        <!-- ══════ UY VAZIFALARI ══════ -->
        <template v-if="tab === 'homework'">
          <div class="card">
            <div class="card-h"><h3><Icon name="info" :size="16" /> {{ d.homework.title }}</h3><span class="badge b-warn"><Icon name="alert" :size="12" /> Hisoblanmaydi</span></div>
            <div class="card-b stack">
              <p>{{ d.homework.reason }}</p>
              <p class="muted small">
                Berilgan / bajarilgan / kechiktirilgan / tekshirilmagan topshiriqlar, o'qituvchilarning tekshirish tezligi va sinflar bo'yicha
                bajarilish foizi shu sababli ko'rsatilmaydi. Soxta raqam qo'yilmaydi.
              </p>
              <div>
                <div class="section-t" style="margin-bottom: 8px">Modulni xavfsiz qo'shish rejasi</div>
                <ol class="plan">
                  <li v-for="(p, i) in d.homework.plan" :key="i">{{ p }}</li>
                </ol>
              </div>
            </div>
          </div>
        </template>
      </template>
    </State>

    <!-- O'quvchi dinamikasi -->
    <Modal v-if="student" :title="student.student?.name || 'O\'quvchi'" wide @close="student = null">
      <State :loading="!student.dynamics && !student.err" :error="student.err">
        <template v-if="student.dynamics">
          <div class="row small muted" style="margin-bottom: 10px">
            <span>Guruh: <b>{{ student.student.group }}</b></span><span>Holat: <b>{{ student.student.status }}</b></span>
            <span>Qo'shilgan: <b>{{ fmt.day(student.student.joinDate) }}</b></span>
          </div>
          <div class="grid g2">
            <div>
              <div class="section-t">Oylik davomat</div>
              <LineChart :labels="student.dynamics.months.map((m) => m.month)" :series="[{ name: 'Davomat', values: student.dynamics.months.map((m) => m.attendance) }]" unit="%" :max="100" :height="180" />
            </div>
            <div>
              <div class="section-t">Oylik o'rtacha baho</div>
              <LineChart :labels="student.dynamics.months.map((m) => m.month)" :series="[{ name: 'Baho', values: student.dynamics.months.map((m) => m.avgGrade) }]" :max="100" :height="180" />
            </div>
          </div>
          <div class="note" style="margin: 12px 0">
            Tendensiya (birinchi va oxirgi ma'lumotli oy): davomat
            <b>{{ student.dynamics.trend.attendance == null ? "ma'lumot yetarli emas" : fmt.delta(student.dynamics.trend.attendance, " p.p.") }}</b>, baho
            <b>{{ student.dynamics.trend.grade == null ? "ma'lumot yetarli emas" : fmt.delta(student.dynamics.trend.grade) }}</b>.
          </div>
          <DataTable :columns="dynCols" :rows="student.dynamics.months.map((m) => ({ ...m, id: m.month }))" :per-page="12" />
        </template>
      </State>
    </Modal>

    <!-- Guruh tafsilotlari -->
    <Modal v-if="openGroup" :title="openGroup.name" wide @close="openGroup = null">
      <div class="row small muted" style="margin-bottom: 10px">
        <span>O'qituvchi: <b>{{ openGroup.mentorName }}</b></span><span>Kurs: <b>{{ openGroup.course || "—" }}</b></span>
        <span>Dars kunlari: <b>{{ openGroup.days.join(", ") || "kiritilmagan" }}</b></span>
      </div>
      <div class="stats" style="margin-bottom: 14px">
        <StatCard label="Davomat" icon="check" :value="openGroup.att.pct == null ? null : fmt.n(openGroup.att.pct)" unit="%" :delta="openGroup.attDelta == null ? '' : fmt.delta(openGroup.attDelta, ' p.p.')" />
        <StatCard label="O'rtacha baho" icon="trophy" :value="openGroup.avgGrade == null ? null : fmt.n(openGroup.avgGrade)" :delta="openGroup.gradeDelta == null ? '' : fmt.delta(openGroup.gradeDelta)" />
        <StatCard label="Darslar" icon="book" :value="`${openGroup.lessons.held} / ${openGroup.lessons.plannedPast}`" sub="o'tilgan / rejadagi" />
      </div>
      <DataTable :columns="memberCols" :rows="openGroup.members" clickable @row="openStudent" default-sort="name" default-dir="asc">
        <template #reasons="{ value }"><span class="small">{{ value.join("; ") || "—" }}</span></template>
      </DataTable>
    </Modal>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "../api.js";
import { periodQuery, fmt } from "../store.js";
import { useLoad } from "../useLoad.js";
import State from "../components/State.vue";
import StatCard from "../components/StatCard.vue";
import LineChart from "../components/LineChart.vue";
import ColumnChart from "../components/ColumnChart.vue";
import BarList from "../components/BarList.vue";
import DataTable from "../components/DataTable.vue";
import PeriodPicker from "../components/PeriodPicker.vue";
import Modal from "../components/Modal.vue";
import Icon from "../components/Icon.vue";

const TABS = [["students", "O'quvchilar"], ["groups", "Sinflar (guruhlar)"], ["lessons", "Darslar"], ["homework", "Uy vazifalari"]];
const route = useRoute();
const router = useRouter();
const tab = ref(TABS.some((t) => t[0] === route.query.tab) ? route.query.tab : "students");
watch(() => route.query.tab, (t) => t && TABS.some((x) => x[0] === t) && (tab.value = t));
const setTab = (k) => router.replace({ query: { ...route.query, tab: k } });

const { data: d, loading, error, reload } = useLoad(() => api("/api/super/analytics", { query: periodQuery.value }), { deps: periodQuery });
const labels = computed(() => (d.value?.series || []).map((x) => x.label));
const tipLabels = computed(() => (d.value?.series || []).map((x) => (x.from === x.to ? fmt.day(x.from) : `${fmt.day(x.from)} — ${fmt.day(x.to)}`)));
const statusText = computed(() =>
  Object.entries(d.value?.students.statusCount || {}).map(([k, v]) => `${k}: ${v}`).join(" · "),
);
const groupsActive = computed(() => (d.value?.groups || []).filter((g) => !g.archived));
const groupName = (id) => (d.value?.groups.find((g) => g.id === String(id)) || {}).name || "—";

const allMembers = computed(() =>
  groupsActive.value.flatMap((g) =>
    g.members.map((m) => ({ id: m.id, name: m.name, group: g.name, status: m.status, attendance: m.att.pct, attDelta: m.attDelta, avgGrade: m.avgGrade, gradeDelta: m.gradeDelta, avgTest: m.avgTest, reasons: m.reasons })),
  ),
);
const needHelp = computed(() => allMembers.value.filter((m) => m.reasons.length));
const inactive = computed(() => (d.value?.students.inactive || []).map((s) => ({ ...s, group: groupName(s.groupId) })));
const pctFmt = (v) => fmt.pct(v);
const nFmt = (v) => fmt.n(v);
const dFmt = (unit) => (v) => (v == null ? "—" : fmt.delta(v, unit));
const helpCols = [
  { key: "name", label: "O'quvchi" }, { key: "group", label: "Guruh" },
  { key: "attendance", label: "Davomat", align: "r", fmt: pctFmt }, { key: "avgGrade", label: "O'rt. baho", align: "r", fmt: nFmt },
  { key: "reasons", label: "Sabab", sortable: false },
];
const inactCols = [{ key: "name", label: "O'quvchi" }, { key: "group", label: "Guruh" }, { key: "status", label: "Holat" }];
const allCols = [
  { key: "name", label: "O'quvchi" }, { key: "group", label: "Guruh" }, { key: "status", label: "Holat" },
  { key: "attendance", label: "Davomat", align: "r", fmt: pctFmt }, { key: "attDelta", label: "O'zgarish", align: "r", fmt: dFmt(" p.p.") },
  { key: "avgGrade", label: "O'rt. baho", align: "r", fmt: nFmt }, { key: "gradeDelta", label: "Baho o'zg.", align: "r", fmt: dFmt("") },
  { key: "avgTest", label: "Test %", align: "r", fmt: pctFmt },
];
const groupRows = computed(() =>
  (d.value?.groups || []).map((g) => ({
    id: g.id, name: g.name + (g.archived ? " (arxiv)" : ""), mentor: g.mentorName, size: g.size, att: g.att.pct, attDelta: g.attDelta,
    avgGrade: g.avgGrade, gradeDelta: g.gradeDelta, avgTest: g.avgTest, held: g.lessons.held, missed: g.lessons.missed, help: g.needHelp.length,
  })),
);
const groupCols = [
  { key: "name", label: "Guruh" }, { key: "mentor", label: "O'qituvchi" }, { key: "size", label: "O'quvchi", align: "r" },
  { key: "att", label: "Davomat", align: "r", fmt: pctFmt }, { key: "attDelta", label: "Δ davomat", align: "r", fmt: dFmt(" p.p.") },
  { key: "avgGrade", label: "O'rt. baho", align: "r", fmt: nFmt }, { key: "gradeDelta", label: "Δ baho", align: "r", fmt: dFmt("") },
  { key: "avgTest", label: "Test %", align: "r", fmt: pctFmt }, { key: "held", label: "O'tilgan", align: "r" },
  { key: "missed", label: "Qoldirilgan", align: "r" }, { key: "help", label: "Yordam kerak", align: "r" },
];
const improving = computed(() => groupsActive.value.filter((g) => (g.attDelta != null && g.attDelta >= 5) || (g.gradeDelta != null && g.gradeDelta >= 5)).slice(0, 8));
const needy = computed(() =>
  groupsActive.value
    .map((g) => {
      const why = [];
      if (g.att.marked >= 10 && g.att.pct < 70) why.push(`davomat ${fmt.pct(g.att.pct)}`);
      if (g.attDelta != null && g.attDelta <= -10) why.push(`davomat ${fmt.delta(g.attDelta, " p.p.")}`);
      if (g.gradeDelta != null && g.gradeDelta <= -10) why.push(`baho ${fmt.delta(g.gradeDelta)}`);
      if (g.needHelp.length >= 2) why.push(`${g.needHelp.length} o'quvchiga e'tibor kerak`);
      if (g.lessons.marking != null && g.lessons.marking < 75 && g.lessons.plannedPast >= 3) why.push(`reja ${fmt.pct(g.lessons.marking)} bajarilgan`);
      return { ...g, why };
    })
    .filter((g) => g.why.length),
);
const lessonTeacherCols = [
  { key: "name", label: "O'qituvchi" }, { key: "plannedPast", label: "Reja", align: "r" }, { key: "held", label: "O'tilgan", align: "r" },
  { key: "missed", label: "Qoldirilgan", align: "r" }, { key: "marking", label: "Bajarilish", align: "r", fmt: pctFmt },
  { key: "onTimePct", label: "O'z vaqtida", align: "r", fmt: pctFmt },
];
const lessonGroupCols = [
  { key: "name", label: "Guruh" }, { key: "mentorName", label: "O'qituvchi" }, { key: "plannedPast", label: "Reja", align: "r" },
  { key: "held", label: "O'tilgan", align: "r" }, { key: "missed", label: "Qoldirilgan", align: "r" }, { key: "marking", label: "Bajarilish", align: "r", fmt: pctFmt },
];
const missedCols = [{ key: "day", label: "Sana", fmt: (v) => fmt.day(v) }, { key: "group", label: "Guruh" }, { key: "mentor", label: "O'qituvchi" }, { key: "lesson", label: "Dars №", align: "r" }];
const memberCols = [
  { key: "name", label: "O'quvchi" }, { key: "status", label: "Holat" },
  { key: "att", label: "Davomat", align: "r", fmt: (v) => fmt.pct(v?.pct) }, { key: "avgGrade", label: "O'rt. baho", align: "r", fmt: nFmt },
  { key: "avgTest", label: "Test %", align: "r", fmt: pctFmt }, { key: "reasons", label: "E'tibor sababi", sortable: false },
];
const dynCols = [
  { key: "month", label: "Oy" }, { key: "K", label: "Keldi", align: "r" }, { key: "Y", label: "Kelmadi", align: "r" }, { key: "S", label: "Sababli", align: "r" },
  { key: "attendance", label: "Davomat", align: "r", fmt: pctFmt }, { key: "avgGrade", label: "O'rt. baho", align: "r", fmt: nFmt },
  { key: "grades", label: "Baholar", align: "r" }, { key: "avgTest", label: "Test %", align: "r", fmt: pctFmt },
];

const student = ref(null);
const openGroup = ref(null);
async function openStudent(row) {
  student.value = { student: { name: row.name }, dynamics: null, err: "" };
  try {
    const r = await api("/api/super/analytics/student/" + encodeURIComponent(row.id), { query: periodQuery.value });
    student.value = { ...r, err: "" };
  } catch (e) {
    student.value = { student: { name: row.name }, dynamics: null, err: e.message };
  }
}
</script>

<style scoped>
.plan { padding-left: 20px; display: grid; gap: 6px; font-size: 13.5px; }
.list-row.click { cursor: pointer; }
.list-row.click:hover b { color: var(--accent-text); }
</style>
