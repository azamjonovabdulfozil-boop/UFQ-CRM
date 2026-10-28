<template>
  <div class="stack">
    <div class="page-head">
      <p>
        CRM'da o'chirilgan hamma narsa — talaba, guruh, to'lov, mentor, kurs — shu yerga tushadi. Adminlar buni ko'rmaydi va bilmaydi.
        Kerak bo'lsa bir tugma bilan CRM'ga qaytaring yoki butunlay o'chiring.
      </p>
      <button v-if="d && d.total" class="btn danger" @click="askEmpty = true"><Icon name="trash" :size="15" /> Savatni tozalash</button>
    </div>

    <div class="card">
      <div class="card-b stack">
        <div class="tr-bar">
          <div class="chips">
            <button class="chip" :class="{ on: !kind }" @click="setKind('')">Hammasi <span class="cnt">{{ allCount }}</span></button>
            <button v-for="(label, k) in d?.kinds || {}" v-show="d && d.counts[k]" :key="k" class="chip" :class="{ on: kind === k }" @click="setKind(k)">
              {{ label }} <span class="cnt">{{ d.counts[k] || 0 }}</span>
            </button>
          </div>
          <div class="row">
            <select v-model="by" class="inp sel" @change="reload1">
              <option value="">Kim o'chirgan: hammasi</option>
              <option v-for="p in d?.people || []" :key="p.id" :value="p.id">{{ p.name }} ({{ p.n }})</option>
            </select>
            <input v-model="q" class="inp tr-q" placeholder="Nomi bo'yicha qidirish…" @input="debounced" />
          </div>
        </div>

        <State :loading="loading && !d" :error="error" :retry="load" :empty="d && !d.items.length" empty-text="Savat bo'sh — hech narsa o'chirilmagan.">
          <div v-if="d" class="tr-list">
            <div v-for="x in d.items" :key="x.id" class="tr-item">
              <span class="tr-ic" :class="'k-' + x.kind"><Icon :name="KIND_ICON[x.kind] || 'file'" :size="17" /></span>
              <div class="tr-main">
                <div class="tr-name">
                  <b>{{ x.name || "—" }}</b>
                  <span class="badge b-mute">{{ x.kindText }}</span>
                </div>
                <div v-if="x.sub" class="small muted">{{ x.sub }}</div>
                <div class="small tr-who">
                  <Icon name="trash" :size="12" />
                  <b>{{ x.by.name || x.by.username || "Noma'lum" }}</b>
                  <span v-if="x.by.roleText" class="muted">({{ x.by.roleText }})</span>
                  o'chirgan · {{ fmt.dt(x.deletedAt) }}
                </div>
                <button class="tr-more" @click="open[x.id] = !open[x.id]">{{ open[x.id] ? "Yopish" : "Batafsil" }}</button>
                <dl v-if="open[x.id]" class="kv tr-kv">
                  <template v-for="(v, k) in shown(x.item)" :key="k">
                    <dt>{{ label(k) }}</dt><dd>{{ v }}</dd>
                  </template>
                </dl>
              </div>
              <div class="tr-acts">
                <button class="btn sm pri" :disabled="busy === x.id" @click="restore(x)"><Icon name="undo" :size="13" /> Tiklash</button>
                <button class="btn sm danger" :disabled="busy === x.id" @click="askPurge = x"><Icon name="close" :size="13" /> Butunlay</button>
              </div>
            </div>
          </div>
          <Pager v-if="d" :page="d.page" :pages="d.pages" :total="d.total" @go="go" />
        </State>
      </div>
    </div>

    <Modal v-if="askPurge" title="Butunlay o'chirish" @close="askPurge = null">
      <p><b>{{ askPurge.name }}</b> ({{ askPurge.kindText }}) savatdan butunlay o'chiriladi. Keyin uni tiklab bo'lmaydi.</p>
      <template #foot>
        <button class="btn" @click="askPurge = null">Bekor qilish</button>
        <button class="btn danger" :disabled="!!busy" @click="purge(askPurge)">Butunlay o'chirish</button>
      </template>
    </Modal>

    <ReauthDialog
      v-if="askEmpty"
      title="Savatni tozalash"
      ok-text="Hammasini o'chirish"
      danger
      confirm-word="TOZALASH"
      :warning="`Savatdagi ${allCount} ta yozuv butunlay o'chiriladi va ularni tiklab bo'lmaydi.`"
      :action="doEmpty"
      @close="askEmpty = false"
      @done="afterEmpty"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from "vue";
import { api } from "../api.js";
import { fmt, toast } from "../store.js";
import State from "../components/State.vue";
import Modal from "../components/Modal.vue";
import Icon from "../components/Icon.vue";
import Pager from "../components/Pager.vue";
import ReauthDialog from "../components/ReauthDialog.vue";

const KIND_ICON = { students: "user", groups: "layers", mentors: "school", courses: "book", finance: "wallet", tests: "doc", certificates: "trophy" };
const LABELS = {
  name: "Nomi", firstName: "Ism", lastName: "Familiya", phone: "Telefon", parentPhone: "Ota-ona telefoni", status: "Holat", source: "Manba",
  joinDate: "Qo'shilgan sana", course: "Kurs", mentor: "Mentor", room: "Xona", timeStart: "Boshlanish", timeEnd: "Tugash", days: "Dars kunlari",
  startDate: "Boshlanish sanasi", price: "Narx", title: "Nomi", amount: "Summa", date: "Sana", description: "Izoh", type: "Turi",
  createdBy: "Kiritgan", birthDate: "Tug'ilgan sana", address: "Manzil", duration: "Davomiylik", id: "ID",
};
const HIDE = new Set(["photo", "avatar", "questions", "password", "pass", "newPassword", "groupHistory", "createdByLogin"]);

const kind = ref("");
const by = ref("");
const q = ref("");
const page = ref(1);
const d = ref(null);
const loading = ref(false);
const error = ref("");
const busy = ref("");
const open = reactive({});
const askPurge = ref(null);
const askEmpty = ref(false);

const allCount = computed(() => Object.values(d.value?.counts || {}).reduce((a, b) => a + b, 0));

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const p = new URLSearchParams({ page: String(page.value) });
    if (kind.value) p.set("kind", kind.value);
    if (by.value) p.set("by", by.value);
    if (q.value.trim()) p.set("q", q.value.trim());
    d.value = await api("/api/super/trash?" + p);
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
function reload1() {
  page.value = 1;
  load();
}
let t = null;
function debounced() {
  clearTimeout(t);
  t = setTimeout(reload1, 350);
}
function setKind(k) {
  kind.value = k;
  reload1();
}
function go(p) {
  page.value = p;
  load();
}
onMounted(load);

function shown(item) {
  const out = {};
  for (const [k, v] of Object.entries(item || {})) {
    if (HIDE.has(k) || v == null || v === "" || typeof v === "object" && !Array.isArray(v)) continue;
    if (Array.isArray(v) && !v.every((x) => typeof x !== "object")) continue;
    let val = Array.isArray(v) ? v.join(", ") : v;
    if (k === "amount" || k === "price") val = fmt.int(v) + " so'm";
    if ((k === "date" || k === "createdAt") && !isNaN(new Date(v))) val = fmt.dt(v);
    if (k === "type") val = { income: "Kirim", expense: "Chiqim", salary: "Mentor oyligi" }[v] || v;
    out[k] = String(val).slice(0, 200);
  }
  return out;
}
const label = (k) => LABELS[k] || k;

async function restore(x) {
  busy.value = x.id;
  try {
    const r = await api(`/api/super/trash/${x.id}/restore`, { method: "POST" });
    toast(`${x.name} CRM'ga qaytarildi`);
    for (const w of r.warnings || []) toast(w, "warn");
    await load();
  } catch (e) {
    toast(e.message, "error");
  } finally {
    busy.value = "";
  }
}
async function purge(x) {
  busy.value = x.id;
  try {
    await api(`/api/super/trash/${x.id}/purge`, { method: "POST" });
    toast("Butunlay o'chirildi");
    askPurge.value = null;
    await load();
  } catch (e) {
    toast(e.message, "error");
  } finally {
    busy.value = "";
  }
}
async function doEmpty({ password, otp }) {
  return api("/api/super/trash/empty", { method: "POST", body: { password, otp } });
}
function afterEmpty(r) {
  askEmpty.value = false;
  toast(`Savat tozalandi (${r?.deleted ?? 0} ta)`);
  reload1();
}
</script>

<style scoped>
.tr-bar { display: flex; gap: 10px; flex-wrap: wrap; justify-content: space-between; align-items: center; }
.tr-bar .cnt { opacity: 0.7; font-weight: 700; margin-left: 2px; }
.tr-q { width: 240px; max-width: 100%; }
.tr-list { display: grid; gap: 10px; }
.tr-item { display: grid; grid-template-columns: 38px 1fr auto; gap: 12px; padding: 12px 14px; border: 1px solid var(--border); border-radius: var(--r); background: var(--surface-2); align-items: start; }
.tr-ic { width: 38px; height: 38px; border-radius: 10px; display: grid; place-items: center; background: var(--surface-3); color: var(--text-2); }
.k-students { background: var(--accent-soft); color: var(--accent-text); }
.k-groups { background: var(--info-soft); color: var(--info); }
.k-finance { background: var(--good-soft); color: var(--good); }
.k-mentors, .k-courses { background: var(--warn-soft); color: var(--warn); }
.tr-main { min-width: 0; display: grid; gap: 3px; }
.tr-name { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.tr-who { display: flex; gap: 5px; align-items: center; flex-wrap: wrap; color: var(--text-2); }
.tr-more { background: none; border: 0; padding: 0; color: var(--accent-text); font-weight: 600; font-size: 12.5px; cursor: pointer; justify-self: start; }
.tr-kv { margin-top: 6px; font-size: 12.5px; }
.tr-acts { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
@media (max-width: 600px) {
  .tr-item { grid-template-columns: 38px 1fr; }
  .tr-acts { grid-column: 1 / -1; justify-content: flex-start; }
}
</style>
