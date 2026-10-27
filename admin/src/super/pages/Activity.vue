<template>
  <div class="stack">
    <div class="page-head">
      <p>
        Adminlar va mentorlar: kim, qachon tizimga kirgani va nima qilgani. Xodim kartasini bosing — uning kirgan vaqtlari, qurilmalari va
        barcha amallari ochiladi. Yozuvlarni hech kim o'zgartira olmaydi<span v-if="d">, ular {{ d.retentionDays }} kun saqlanadi</span>.
      </p>
      <PeriodPicker :label="rangeLabel" />
    </div>

    <div class="chips" role="group" aria-label="Kimlar">
      <button v-for="[k, l] in SCOPES" :key="k" class="chip" :class="{ on: scope === k }" @click="setScope(k)">{{ l }}</button>
    </div>

    <State :loading="loading && !d" :error="error" :retry="reload">
      <template v-if="d">
        <!-- Xodimlar -->
        <div class="card">
          <div class="card-h">
            <h3>Xodimlar</h3>
            <span class="card-sub">{{ activePeople.length }} kishi · {{ online }} tasi hozir tizimda</span>
          </div>
          <div class="card-b">
            <div v-if="!activePeople.length" class="muted small">Bu bo'limda hali hech kim yo'q.</div>
            <div class="people">
              <button v-for="p in shownPeople" :key="p.id" class="person" :class="{ sel: person === p.id, gone: p.deleted }" @click="openPerson(p)">
                <div class="p-top">
                  <span class="p-av" :class="p.role">{{ initials(p) }}</span>
                  <div class="p-who">
                    <b>{{ p.name || p.username }}</b>
                    <span class="small muted">{{ p.name ? p.username : "ism-familiya kiritilmagan" }}</span>
                  </div>
                  <span class="badge" :class="p.role === 'admin' ? 'b-acc' : p.role === 'mentor' ? 'b-info' : 'b-mute'">{{ p.roleText }}</span>
                </div>
                <div class="p-state">
                  <span v-if="p.deleted" class="st bad">O'chirilgan</span>
                  <span v-else-if="p.status === 'disabled'" class="st bad">Bloklangan</span>
                  <span v-else-if="p.activeSessions" class="st good"><i></i>Hozir tizimda</span>
                  <span v-else class="st">Tizimda emas</span>
                </div>
                <div class="p-line"><Icon name="clock" :size="13" /> Oxirgi kirish: <b>{{ p.lastLoginAt || p.lastLoginInRange ? fmt.dt(p.lastLoginInRange || p.lastLoginAt) : "hech qachon" }}</b></div>
                <div class="p-nums">
                  <span><b>{{ p.logins }}</b> marta kirdi</span>
                  <span><b>{{ p.actions }}</b> ta amal</span>
                  <span v-if="p.failed" class="down"><b>{{ p.failed }}</b> xato urinish</span>
                </div>
              </button>
            </div>
            <button v-if="deletedPeople.length" class="btn ghost sm more" @click="showDeleted = !showDeleted">
              <Icon :name="showDeleted ? 'up' : 'down'" :size="14" />
              {{ showDeleted ? "O'chirilgan hisoblarni yashirish" : `O'chirilgan hisoblar (${deletedPeople.length}) — shu davrda harakati bo'lgan` }}
            </button>
          </div>
        </div>

        <!-- Harakatlar -->
        <div class="card">
          <div class="card-h">
            <h3>{{ personName ? personName + " — harakatlari" : "Barcha harakatlar" }}</h3>
            <span class="card-sub">{{ d.total }} ta yozuv</span>
          </div>
          <div class="card-b stack">
            <div class="row">
              <div class="chips" role="group" aria-label="Turi">
                <button v-for="[k, l] in KINDS" :key="k" class="chip" :class="{ on: kind === k }" @click="kind = k">{{ l }}</button>
              </div>
              <span class="grow"></span>
              <button v-if="person" class="btn sm" @click="person = ''"><Icon name="close" :size="13" /> Hamma xodimlar</button>
              <input v-model="q" class="inp" style="width: 210px" placeholder="Qidirish (login, IP…)" aria-label="Qidirish" />
            </div>

            <div v-if="!d.events.length" class="muted small empty">Tanlangan davrda bunday yozuv yo'q.</div>
            <ul class="feed">
              <li v-for="e in d.events" :key="e.id" class="ev" :class="e.kind">
                <span class="ev-ic"><Icon :name="ICON[e.kind]" :size="14" /></span>
                <div class="ev-main">
                  <div class="ev-head">
                    <button class="ev-who" @click="filterPerson(e.person)">{{ e.person.name || e.person.username || "—" }}</button>
                    <span class="badge" :class="e.person.role === 'admin' ? 'b-acc' : e.person.role === 'mentor' ? 'b-info' : 'b-mute'">{{ e.person.roleText || roleName(e.person.role) }}</span>
                    <span v-if="e.person.name" class="small muted">{{ e.person.username }}</span>
                    <span class="grow"></span>
                    <span class="small muted nowrap" :title="fmt.dt(e.at)">{{ when(e.at) }}</span>
                  </div>
                  <div class="ev-title">{{ e.title }}</div>
                  <ul v-if="e.details.length" class="ev-det">
                    <li v-for="(x, i) in e.details" :key="i">{{ x }}</li>
                  </ul>
                  <div v-if="e.device || e.ip" class="small muted">{{ [e.device, e.ip ? "IP " + e.ip : ""].filter(Boolean).join(" · ") }}</div>
                </div>
              </li>
            </ul>
            <Pager :page="page" :pages="Math.ceil(d.total / LIMIT)" :total="d.total" @go="(p) => (page = p)" />
          </div>
        </div>
      </template>
    </State>

    <!-- Bitta xodim: hamma ma'lumot -->
    <Modal v-if="det" :title="(det.p.name || det.p.username) + ' — batafsil'" wide @close="det = null">
      <State :loading="det.loading" :error="det.err">
        <template v-if="det.data">
          <div class="det-head">
            <span class="p-av lg" :class="det.p.role">{{ initials(det.p) }}</span>
            <div>
              <div class="det-name">{{ det.p.name || "Ism-familiya kiritilmagan" }}</div>
              <div class="small muted">
                Login: <b class="mono">{{ det.p.username }}</b> · {{ det.p.roleText }}
                <template v-if="det.p.deleted"> · <span class="down">o'chirilgan</span></template>
                <template v-else-if="det.p.status === 'disabled'"> · <span class="down">bloklangan</span></template>
              </div>
            </div>
          </div>
          <div class="mini-stats">
            <div><b>{{ det.data.logins.filter((x) => x.event === "auth.login.success").length }}</b><span>marta kirdi</span></div>
            <div><b>{{ det.data.actions.length }}</b><span>ta amal</span></div>
            <div><b :class="{ down: failedOf(det.data) }">{{ failedOf(det.data) }}</b><span>xato urinish</span></div>
            <div><b>{{ det.data.sessions.length }}</b><span>ochiq qurilma</span></div>
          </div>
          <div class="small muted" style="margin: 6px 0 12px">Davr: {{ rangeLabel }}</div>

          <div class="section-t">Hozir ochiq qurilmalar</div>
          <div v-if="!det.data.sessions.length" class="muted small" style="margin: 6px 0 14px">Hozir hech qaysi qurilmada tizimga kirmagan.</div>
          <div v-for="s in det.data.sessions" :key="s.id" class="list-row">
            <Icon name="phone" :size="16" />
            <div style="flex: 1; min-width: 0">
              <div class="small" style="font-weight: 600">{{ s.device || "Noma'lum qurilma" }}</div>
              <div class="small muted">Kirgan: {{ fmt.dt(s.createdAt) }} · oxirgi faollik: {{ fmt.ago(s.lastUsedAt) }} · IP {{ s.ip || "—" }}</div>
            </div>
          </div>

          <div class="tabs" style="margin-top: 16px">
            <button :class="{ on: det.tab === 'actions' }" @click="det.tab = 'actions'">Nima qilgan ({{ det.data.actions.length }})</button>
            <button :class="{ on: det.tab === 'logins' }" @click="det.tab = 'logins'">Qachon kirgan ({{ det.data.logins.length }})</button>
          </div>

          <template v-if="det.tab === 'logins'">
            <div v-if="!det.data.logins.length" class="muted small">Bu davrda tizimga kirmagan.</div>
            <div v-else class="tw">
              <table class="t">
                <thead><tr><th>Sana</th><th>Soat</th><th>Nima bo'ldi</th><th>Qurilma</th><th>IP</th></tr></thead>
                <tbody>
                  <tr v-for="x in det.data.logins" :key="x.id">
                    <td class="nowrap">{{ dayOf(x.at) }}</td>
                    <td class="nowrap mono">{{ timeOf(x.at) }}</td>
                    <td :class="{ down: x.kind === 'warn' }">{{ x.title }}</td>
                    <td class="small">{{ x.device || "—" }}</td>
                    <td class="small mono">{{ x.ip || "—" }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
          <template v-else>
            <div v-if="!det.data.actions.length" class="muted small">Bu davrda hech narsani o'zgartirmagan.</div>
            <ul class="feed">
              <li v-for="e in det.data.actions" :key="e.id" class="ev" :class="e.kind">
                <span class="ev-ic"><Icon :name="ICON[e.kind]" :size="14" /></span>
                <div class="ev-main">
                  <div class="ev-head"><span class="small muted nowrap">{{ fmt.dt(e.at) }}</span></div>
                  <div class="ev-title">{{ e.title }}</div>
                  <ul v-if="e.details.length" class="ev-det"><li v-for="(x, i) in e.details" :key="i">{{ x }}</li></ul>
                  <div v-if="e.device || e.ip" class="small muted">{{ [e.device, e.ip ? "IP " + e.ip : ""].filter(Boolean).join(" · ") }}</div>
                </div>
              </li>
            </ul>
          </template>
        </template>
      </State>
    </Modal>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { api } from "../api.js";
import { period, periodQuery, fmt, roleName } from "../store.js";
import { useLoad } from "../useLoad.js";
import State from "../components/State.vue";
import Modal from "../components/Modal.vue";
import Pager from "../components/Pager.vue";
import PeriodPicker from "../components/PeriodPicker.vue";
import Icon from "../components/Icon.vue";

const SCOPES = [["staff", "Admin va mentorlar"], ["admin", "Faqat adminlar"], ["mentor", "Faqat mentorlar"]];
const KINDS = [["", "Hammasi"], ["login", "Kirish va chiqish"], ["data", "O'zgarishlar"], ["warn", "Ogohlantirishlar"]];
const ICON = { login: "user", logout: "logout", data: "edit", warn: "alert", action: "dot" };
const LIMIT = 15;

const scope = ref("staff");
const kind = ref("");
const person = ref("");
const q = ref("");
const page = ref(1);

// Tanlangan davr → aniq vaqt oralig'i (brauzer vaqti bo'yicha)
const iso = computed(() => {
  const p = periodQuery.value;
  if (p.period === "custom" && p.from && p.to) {
    return { from: new Date(p.from + "T00:00:00").toISOString(), to: new Date(p.to + "T23:59:59.999").toISOString(), label: `${fmt.day(p.from)} — ${fmt.day(p.to)}` };
  }
  const n = p.period === "today" ? 1 : Number(p.period) || 30;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (n - 1));
  return { from: start.toISOString(), to: new Date().toISOString(), label: n === 1 ? "Bugun" : `Oxirgi ${n} kun` };
});
const rangeLabel = computed(() => iso.value.label);

const { data: d, loading, error, reload } = useLoad(
  () =>
    api("/api/super/activity", {
      query: { from: iso.value.from, to: iso.value.to, scope: scope.value, kind: kind.value, person: person.value, q: q.value.trim(), page: page.value, limit: LIMIT },
    }),
  { deps: computed(() => [iso.value.from, iso.value.to, scope.value, kind.value, person.value, page.value]), pollMs: 60000 },
);
let t;
watch(q, () => {
  clearTimeout(t);
  t = setTimeout(() => (page.value === 1 ? reload() : (page.value = 1)), 400);
});
watch(() => [scope.value, kind.value, person.value, period.period, period.from, period.to], () => (page.value = 1));

const showDeleted = ref(false);
const activePeople = computed(() => (d.value ? d.value.people.filter((p) => !p.deleted) : []));
const deletedPeople = computed(() => (d.value ? d.value.people.filter((p) => p.deleted) : []));
const shownPeople = computed(() => (showDeleted.value ? [...activePeople.value, ...deletedPeople.value] : activePeople.value));
const online = computed(() => (d.value ? d.value.people.filter((p) => p.activeSessions && !p.deleted).length : 0));
const personName = computed(() => {
  if (!person.value || !d.value) return "";
  const p = d.value.people.find((x) => x.id === person.value);
  return p ? p.name || p.username : "";
});
function setScope(k) {
  scope.value = k;
  person.value = "";
}
function filterPerson(p) {
  if (p && p.id) person.value = p.id;
}
function initials(p) {
  const s = String(p.name || p.username || "?").trim().split(/\s+/);
  return ((s[0] || "")[0] || "?").toUpperCase() + ((s[1] || "")[0] || "").toUpperCase();
}
const pad = (n) => String(n).padStart(2, "0");
const timeOf = (v) => {
  const x = new Date(v);
  return `${pad(x.getHours())}:${pad(x.getMinutes())}`;
};
const dayOf = (v) => fmt.dt(v).split(",")[0];
function when(v) {
  const x = new Date(v);
  const today = new Date();
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (x.toDateString() === today.toDateString()) return "Bugun, " + timeOf(v);
  if (x.toDateString() === y.toDateString()) return "Kecha, " + timeOf(v);
  return fmt.dt(v);
}
const failedOf = (data) => data.logins.filter((x) => x.event === "auth.login.failed").length;

const det = ref(null);
async function openPerson(p) {
  person.value = p.id;
  det.value = { p, loading: true, err: "", data: null, tab: "actions" };
  try {
    const data = await api("/api/super/activity/person/" + p.id, { query: { from: iso.value.from, to: iso.value.to } });
    det.value = { p: { ...p, ...data.person, roleText: data.person.roleText || p.roleText }, loading: false, err: "", data, tab: "actions" };
  } catch (e) {
    det.value = { p, loading: false, err: e.message, data: null, tab: "actions" };
  }
}
</script>

<style scoped>
.grow { flex: 1; }
.empty { padding: 18px 0; text-align: center; }
.people { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); }
.person {
  display: grid; gap: 8px; text-align: left; font: inherit; color: inherit; cursor: pointer;
  padding: 14px; border: 1px solid var(--border); border-radius: var(--r); background: var(--surface-2);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.person:hover { border-color: var(--border-2); box-shadow: var(--shadow); }
.person.sel { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.person.gone { opacity: 0.7; }
.p-top { display: flex; align-items: center; gap: 10px; }
.p-who { flex: 1; min-width: 0; display: grid; }
.p-who b { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.p-av {
  width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center;
  font-size: 13px; font-weight: 800; color: #fff; background: var(--text-3);
}
.p-av.admin { background: var(--accent); }
.p-av.mentor { background: var(--info); }
.p-av.lg { width: 52px; height: 52px; font-size: 17px; }
.p-state .st { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: var(--text-3); }
.p-state .st.good { color: var(--good); }
.p-state .st.bad { color: var(--bad); }
.p-state .st i { width: 8px; height: 8px; border-radius: 50%; background: var(--good); box-shadow: 0 0 0 3px var(--good-soft); }
.p-line { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--text-2); }
.p-nums { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 12.5px; color: var(--text-2); }
.more { margin-top: 12px; }
.feed { list-style: none; margin: 0; padding: 0; display: grid; }
.ev { display: flex; gap: 12px; padding: 12px 2px; border-bottom: 1px solid var(--border); }
.ev:last-child { border-bottom: 0; }
.ev-ic {
  width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center;
  background: var(--surface-3); color: var(--text-2);
}
.ev.login .ev-ic { background: var(--good-soft); color: var(--good); }
.ev.logout .ev-ic { background: var(--surface-3); color: var(--text-3); }
.ev.data .ev-ic { background: var(--info-soft); color: var(--info); }
.ev.warn .ev-ic { background: var(--warn-soft); color: var(--warn); }
.ev-main { flex: 1; min-width: 0; display: grid; gap: 3px; }
.ev-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ev-who { border: 0; background: none; padding: 0; font: inherit; font-weight: 700; color: var(--text); cursor: pointer; }
.ev-who:hover { color: var(--accent-text); text-decoration: underline; }
.ev-title { font-size: 14px; color: var(--text); }
.ev.warn .ev-title { color: var(--warn); }
.ev-det { margin: 0; padding-left: 18px; font-size: 13px; color: var(--text-2); }
.det-head { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
.det-name { font-size: 18px; font-weight: 800; }
.mini-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.mini-stats > div { padding: 12px; border: 1px solid var(--border); border-radius: var(--r-sm); background: var(--surface-2); display: grid; gap: 2px; }
.mini-stats b { font-size: 20px; }
.mini-stats span { font-size: 12px; color: var(--text-3); }
@media (max-width: 640px) {
  .mini-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .people { grid-template-columns: 1fr; }
}
</style>
