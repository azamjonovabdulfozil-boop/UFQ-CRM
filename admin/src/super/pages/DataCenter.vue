<template>
  <div class="stack">
    <div class="page-head">
      <p>
        CRM'dagi barcha asosiy yozuvlar bitta joyda. Ro'yxatlarda telefon raqamlari qisman yashirilgan; to'liq shaxsiy ma'lumot faqat yozuv
        ochilganda ko'rsatiladi va bu jurnalga yoziladi. Murakkab tahrirlar uchun
        <a :href="portalUrl('?crm=1')">CRM boshqaruv panelidan</a> foydalaning.
      </p>
      <PeriodPicker v-if="['lessons', 'grades'].includes(entity)" :label="res?.range?.label" />
    </div>
    <div class="tabs">
      <button v-for="[k, l] in ENTITIES" :key="k" :class="{ on: entity === k }" @click="setEntity(k)">{{ l }}</button>
    </div>

    <div class="row">
      <div class="srch">
        <Icon name="search" :size="15" />
        <input v-model="q" class="inp" placeholder="Qidirish…" aria-label="Qidirish" @keydown.enter="page = 1" />
      </div>
      <select v-if="entity === 'students'" v-model="status" class="sel" aria-label="Holat">
        <option value="">Barcha holatlar</option>
        <option v-for="s in res?.options?.statuses || []" :key="s" :value="s">{{ s }}</option>
      </select>
      <select v-if="entity === 'students'" v-model="groupId" class="sel" aria-label="Guruh">
        <option value="">Barcha guruhlar</option>
        <option v-for="g in res?.options?.groups || []" :key="g.id" :value="g.id">{{ g.name }}</option>
      </select>
      <select v-if="entity === 'groups'" v-model="mentorId" class="sel" aria-label="O'qituvchi">
        <option value="">Barcha o'qituvchilar</option>
        <option v-for="m in res?.options?.mentors || []" :key="m.id" :value="m.id">{{ m.name }}</option>
      </select>
      <select v-if="entity === 'lessons'" v-model="state" class="sel" aria-label="Holat">
        <option value="">Barcha darslar</option>
        <option value="o'tilgan">O'tilgan</option>
        <option value="belgilanmagan">Belgilanmagan</option>
        <option value="rejada">Rejada</option>
      </select>
      <span class="grow"></span>
      <button class="btn sm" @click="exp('csv')"><Icon name="download" :size="14" /> CSV</button>
      <button class="btn sm" @click="exp('xlsx')"><Icon name="download" :size="14" /> Excel</button>
    </div>

    <div class="card">
      <div class="card-b">
        <State :loading="loading && !res" :error="error" :retry="reload">
          <template v-if="res">
            <div class="small muted" style="margin-bottom: 8px">Jami: <b>{{ res.total }}</b> ta yozuv <span v-if="loading" class="spin" style="width: 12px; height: 12px; display: inline-block; vertical-align: middle"></span></div>
            <DataTable
              :columns="COLS[entity]"
              :rows="res.rows"
              server
              :total="res.total"
              :page="page"
              :per-page="limit"
              :clickable="DETAIL.includes(entity)"
              @row="openRow"
              @page="(p) => (page = p)"
              @sort="(s) => ((sort = s.sort), (dir = s.dir))"
            >
              <template #status="{ value }"><span class="badge" :class="statusClass(value)">{{ value }}</span></template>
              <template #state="{ value }"><span class="badge" :class="value === 'o\'tilgan' ? 'b-good' : value === 'belgilanmagan' ? 'b-warn' : 'b-mute'">{{ value }}</span></template>
            </DataTable>
          </template>
        </State>
      </div>
    </div>

    <Modal v-if="detail" :title="detail.title" wide @close="detail = null">
      <State :loading="detail.loading" :error="detail.err">
        <template v-if="detail.data">
          <div class="tabs">
            <button :class="{ on: dtab === 'info' }" @click="dtab = 'info'">Ma'lumotlar</button>
            <button v-if="detail.data.editable.length" :class="{ on: dtab === 'edit' }" @click="dtab = 'edit'">Tahrirlash</button>
            <button :class="{ on: dtab === 'hist' }" @click="dtab = 'hist'">O'zgarishlar tarixi ({{ detail.data.history.length }})</button>
          </div>
          <div v-if="dtab === 'info'" class="stack">
            <dl class="kv">
              <template v-for="(v, k) in shownFields" :key="k">
                <dt>{{ LABELS[k] || k }}</dt>
                <dd>{{ show(v) }}</dd>
              </template>
            </dl>
            <template v-if="detail.data.extra?.dynamics">
              <div class="section-t">Oylik dinamika</div>
              <LineChart :labels="detail.data.extra.dynamics.months.map((m) => m.month)" :series="[{ name: 'Davomat', values: detail.data.extra.dynamics.months.map((m) => m.attendance) }, { name: 'O\'rtacha baho', values: detail.data.extra.dynamics.months.map((m) => m.avgGrade) }]" :max="100" :height="180" />
            </template>
            <template v-if="detail.data.extra?.members">
              <div class="section-t">Guruh a'zolari (davr: {{ periodLabel }})</div>
              <DataTable :columns="[{ key: 'name', label: 'O\'quvchi' }, { key: 'status', label: 'Holat' }, { key: 'att', label: 'Davomat', align: 'r', fmt: (v) => fmt.pct(v?.pct) }, { key: 'avgGrade', label: 'Baho', align: 'r', fmt: (v) => fmt.n(v) }]" :rows="detail.data.extra.members" />
            </template>
            <template v-if="detail.data.extra?.stats && entity === 'mentors'">
              <div class="note">Reyting balli: <b>{{ fmt.n(detail.data.extra.stats.score) }}</b> · o'tilgan darslar: <b>{{ detail.data.extra.stats.lessons.held }}</b> · davomat: <b>{{ fmt.pct(detail.data.extra.stats.att.pct) }}</b> — <router-link to="/teachers">reyting sahifasi</router-link></div>
            </template>
          </div>
          <div v-if="dtab === 'edit'" class="stack">
            <div class="note info">O'zgarish CRM bazasiga darhol yoziladi, ochiq panellar avtomatik yangilanadi. Saqlashdan oldin zaxira nusxa olinadi va amal jurnalga yoziladi.</div>
            <label v-for="f in detail.data.editable" :key="f" class="fld">
              {{ LABELS[f] || f }}
              <select v-if="f === 'status' && entity === 'students'" v-model="form[f]" class="inp">
                <option v-for="s in res.options.statuses" :key="s">{{ s }}</option>
              </select>
              <select v-else-if="f === 'status' && entity === 'groups'" v-model="form[f]" class="inp">
                <option v-for="s in ['Faol', 'Kutilmoqda', 'Man etilgan', 'Arxiv']" :key="s">{{ s }}</option>
              </select>
              <select v-else-if="f === 'groupId'" v-model="form[f]" class="inp">
                <option v-for="g in res.options.groups" :key="g.id" :value="g.id">{{ g.name }}</option>
              </select>
              <select v-else-if="f === 'mentorId'" v-model="form[f]" class="inp">
                <option value="">— biriktirilmagan —</option>
                <option v-for="m in res.options.mentors" :key="m.id" :value="m.id">{{ m.name }}</option>
              </select>
              <div v-else-if="f === 'days'" class="chips">
                <button v-for="dd in ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya']" :key="dd" type="button" class="chip" :class="{ on: (form.days || []).includes(dd) }" @click="toggleDay(dd)">{{ dd }}</button>
              </div>
              <textarea v-else-if="f === 'notes'" v-model="form[f]" class="inp" rows="3"></textarea>
              <input v-else v-model="form[f]" class="inp" :type="f === 'price' ? 'number' : 'text'" />
            </label>
            <div class="row"><button class="btn pri" :disabled="saving" @click="save">Saqlash</button></div>
          </div>
          <div v-if="dtab === 'hist'">
            <div v-if="!detail.data.history.length" class="muted small">Bu yozuv bo'yicha o'zgarish jurnalda yo'q (jurnal {{ 180 }} kun saqlanadi; tizim yangilanishidan oldingi o'zgarishlar yozilmagan).</div>
            <div v-for="(h, i) in detail.data.history" :key="i" class="list-row">
              <span class="dot" style="background: var(--s1)"></span>
              <div>
                <div class="small" style="font-weight: 600">{{ h.text }}</div>
                <div class="small muted">{{ fmt.dt(h.at) }} · {{ h.actor || "—" }} ({{ roleName(h.role) }})</div>
              </div>
            </div>
          </div>
        </template>
      </State>
    </Modal>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, download, portalUrl } from "../api.js";
import { periodQuery, period, fmt, roleName, toast } from "../store.js";
import { useLoad } from "../useLoad.js";
import State from "../components/State.vue";
import DataTable from "../components/DataTable.vue";
import Modal from "../components/Modal.vue";
import LineChart from "../components/LineChart.vue";
import PeriodPicker from "../components/PeriodPicker.vue";
import Icon from "../components/Icon.vue";

const ENTITIES = [
  ["students", "O'quvchilar"], ["groups", "Sinflar va guruhlar"], ["mentors", "O'qituvchilar"], ["courses", "Kurslar"],
  ["lessons", "Darslar"], ["grades", "Baholar"], ["tests", "Testlar"], ["admins", "Administratorlar"],
];
const DETAIL = ["students", "groups", "mentors", "courses"];
const pct = (v) => fmt.pct(v), n1 = (v) => fmt.n(v);
const COLS = {
  students: [
    { key: "name", label: "F.I.Sh." }, { key: "group", label: "Guruh" }, { key: "status", label: "Holat" }, { key: "phone", label: "Telefon", sortable: false, nowrap: true },
    { key: "joinDate", label: "Qo'shilgan", fmt: (v) => fmt.day(v) }, { key: "attendance", label: "Davomat", align: "r", fmt: pct },
    { key: "avgGrade", label: "O'rt. baho", align: "r", fmt: n1 }, { key: "isDebtor", label: "Qarzdor", fmt: (v) => (v ? "ha" : "—") },
  ],
  groups: [
    { key: "name", label: "Guruh" }, { key: "course", label: "Kurs" }, { key: "mentor", label: "O'qituvchi" }, { key: "status", label: "Holat" },
    { key: "days", label: "Kunlar" }, { key: "size", label: "O'quvchi", align: "r" }, { key: "attendance", label: "Davomat", align: "r", fmt: pct },
    { key: "avgGrade", label: "Baho", align: "r", fmt: n1 }, { key: "held", label: "Darslar", align: "r" },
  ],
  mentors: [
    { key: "name", label: "F.I.Sh." }, { key: "subject", label: "Yo'nalish" }, { key: "phone", label: "Telefon", sortable: false, nowrap: true },
    { key: "groups", label: "Guruh", align: "r" }, { key: "students", label: "O'quvchi", align: "r" }, { key: "held", label: "Darslar", align: "r" },
    { key: "score", label: "Reyting", align: "r", fmt: n1 },
  ],
  courses: [{ key: "name", label: "Kurs" }, { key: "price", label: "Narx", align: "r", fmt: (v) => fmt.int(v) }, { key: "duration", label: "Davomiyligi" }, { key: "groups", label: "Guruhlar", align: "r" }],
  lessons: [
    { key: "day", label: "Sana", fmt: (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? fmt.day(v) : v) }, { key: "group", label: "Guruh" }, { key: "mentor", label: "O'qituvchi" },
    { key: "lesson", label: "№", align: "r" }, { key: "state", label: "Holat" }, { key: "present", label: "Keldi", align: "r" }, { key: "absent", label: "Kelmadi", align: "r" },
    { key: "excused", label: "Sababli", align: "r" }, { key: "markedDay", label: "Belgilangan", fmt: (v) => (v ? fmt.day(v) : "—") },
  ],
  grades: [{ key: "day", label: "Sana", fmt: (v) => fmt.day(v) }, { key: "student", label: "O'quvchi" }, { key: "group", label: "Guruh" }, { key: "score", label: "Baho", align: "r" }, { key: "mentor", label: "Qo'ygan" }],
  tests: [{ key: "title", label: "Test" }, { key: "group", label: "Guruh" }, { key: "questions", label: "Savollar", align: "r" }, { key: "results", label: "Topshirgan", align: "r" }, { key: "avgScore", label: "O'rtacha %", align: "r", fmt: pct }],
  admins: [
    { key: "username", label: "Login" }, { key: "name", label: "Ism" }, { key: "role", label: "Rol" }, { key: "status", label: "Holat" },
    { key: "lastLoginAt", label: "Oxirgi kirish", fmt: (v) => fmt.ago(v) }, { key: "createdAt", label: "Yaratilgan", fmt: (v) => fmt.dt(v) },
  ],
};
const LABELS = {
  name: "Ism / nom", status: "Holat", groupId: "Guruh", phone: "Telefon", parentName: "Ota-ona", parentPhone: "Ota-ona telefoni", notes: "Izoh",
  joinDate: "Qo'shilgan sana", birthDate: "Tug'ilgan sana", mentorId: "O'qituvchi", mentor: "O'qituvchi", course: "Kurs", days: "Dars kunlari",
  time: "Vaqt", startDate: "Boshlangan", telegram: "Telegram", email: "Email", price: "Narx", subject: "Yo'nalish", experience: "Tajriba",
  address: "Manzil", login: "Login", isDebtor: "Qarzdor", source: "Manba", id: "ID", room: "Xona", age: "Yosh", duration: "Davomiyligi",
};

const route = useRoute();
const router = useRouter();
const entity = ref(ENTITIES.some((e) => e[0] === route.query.entity) ? route.query.entity : "students");
const q = ref("");
const status = ref("");
const groupId = ref("");
const mentorId = ref("");
const state = ref("");
const sort = ref("");
const dir = ref("desc");
const page = ref(1);
const limit = 10;
function setEntity(k) {
  entity.value = k;
  q.value = status.value = groupId.value = mentorId.value = state.value = sort.value = "";
  page.value = 1;
  router.replace({ query: { entity: k } });
}
let qt;
watch(q, () => {
  clearTimeout(qt);
  qt = setTimeout(() => ((page.value = 1), reload()), 350);
});
const query = computed(() => ({ ...periodQuery.value, q: q.value, status: status.value, groupId: groupId.value, mentorId: mentorId.value, state: state.value, sort: sort.value, dir: dir.value, page: page.value, limit }));
const { data: res, loading, error, reload } = useLoad(() => api("/api/super/data/" + entity.value, { query: query.value }), {
  deps: computed(() => [entity.value, status.value, groupId.value, mentorId.value, state.value, sort.value, dir.value, page.value, periodQuery.value]),
});
const periodLabel = computed(() => res.value?.range?.label || "");
const statusClass = (v) =>
  ({ Aktiv: "b-good", active: "b-good", Faol: "b-good", Faolsiz: "b-mute", disabled: "b-bad", Muzlatilgan: "b-info", Probatsiya: "b-warn", Arxiv: "b-mute", "Man etilgan": "b-warn" })[v] || "b-mute";

async function exp(format) {
  try {
    await download(`/api/super/data/${entity.value}/export/${format}`, { query: query.value });
    toast("Eksport tayyor — jurnalga yozildi");
  } catch (e) {
    toast(e.message, "error");
  }
}

// ── Batafsil ──
const detail = ref(null);
const dtab = ref("info");
const form = reactive({});
const saving = ref(false);
async function openRow(row) {
  dtab.value = "info";
  detail.value = { title: row.name || row.username || row.title, loading: true, err: "", data: null };
  try {
    const d = await api(`/api/super/data/${entity.value}/${encodeURIComponent(row.id)}`, { query: periodQuery.value });
    detail.value = { title: d.record.name || row.name, loading: false, err: "", data: d };
    Object.keys(form).forEach((k) => delete form[k]);
    for (const f of d.editable) form[f] = Array.isArray(d.record[f]) ? [...d.record[f]] : d.record[f] == null ? "" : String(d.record[f]);
  } catch (e) {
    detail.value = { ...detail.value, loading: false, err: e.message };
  }
}
const shownFields = computed(() => {
  const r = detail.value?.data?.record || {};
  const out = {};
  for (const [k, v] of Object.entries(r)) {
    if (v == null || v === "" || (typeof v === "object" && !Array.isArray(v))) continue;
    if (/^_|Id$|^nextId$/.test(k) && k !== "groupId") continue;
    if (typeof v === "string" && v.startsWith("data:")) continue;
    out[k] = v;
  }
  return out;
});
function show(v) {
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "ha" : "yo'q";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return fmt.day(v);
  if (typeof v === "string" && v.length > 300) return v.slice(0, 300) + "…";
  return String(v);
}
function toggleDay(dd) {
  const a = form.days || (form.days = []);
  const i = a.indexOf(dd);
  i >= 0 ? a.splice(i, 1) : a.push(dd);
}
async function save() {
  saving.value = true;
  try {
    const r = await api(`/api/super/data/${entity.value}/${encodeURIComponent(detail.value.data.record.id)}`, { method: "POST", body: { fields: { ...form } } });
    toast(r.unchanged ? "O'zgarish yo'q" : "Saqlandi: " + r.changed.join(", "));
    const row = { id: detail.value.data.record.id, name: detail.value.title };
    reload();
    await openRow(row);
  } catch (e) {
    toast(e.message, "error");
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.srch { position: relative; width: min(320px, 100%); }
.srch .sa-ic { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-3); }
.srch .inp { padding-left: 32px; }
.grow { flex: 1; }
</style>
