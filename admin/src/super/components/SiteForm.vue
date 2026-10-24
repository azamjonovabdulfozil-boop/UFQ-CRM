<template>
  <Modal :title="edit ? 'Sayt sozlamalari' : 'Yangi sayt qo\'shish'" wide @close="close">
    <!-- Bosqichlar (faqat yangi sayt qo'shishda) -->
    <ol v-if="!edit" class="sf-steps">
      <li :class="{ on: step === 1, done: step > 1 }"><span>{{ step > 1 ? "✓" : "1" }}</span> Sayt haqida</li>
      <li :class="{ on: step === 2 }"><span>2</span> Kodni o'rnatish va tekshirish</li>
    </ol>

    <!-- ── 1-bosqich: sayt ma'lumotlari ── -->
    <form v-if="step === 1" class="sf" @submit.prevent="submit">
      <div class="sf-grid">
        <label class="fld">
          <span>Sayt nomi *</span>
          <input v-model.trim="f.name" class="inp" maxlength="80" required placeholder="Masalan: UFQ o'quv markazi" />
          <small class="sf-help">Faqat siz uchun — ro'yxatda shu nom ko'rinadi.</small>
        </label>
        <label class="fld">
          <span>Sayt manzili *</span>
          <input v-model.trim="f.url" class="inp" :disabled="!!edit" required placeholder="ufq.uz" inputmode="url" />
          <small v-if="urlErr" class="sf-err">{{ urlErr }}</small>
          <small v-else class="sf-help">{{ edit ? "Manzilni o'zgartirib bo'lmaydi." : "Brauzerda qanday ochilsa, shunday yozing (https:// shart emas)." }}</small>
        </label>
        <label class="fld">
          <span>Sayt turi</span>
          <select v-model="f.category" class="sel">
            <option v-for="c in categories" :key="c">{{ c }}</option>
          </select>
        </label>
        <label class="fld">
          <span>Qisqa izoh</span>
          <input v-model="f.description" class="inp" maxlength="500" placeholder="Ixtiyoriy" />
        </label>
      </div>

      <!-- Natija (maqsad) -->
      <details class="sf-sec" :open="!!edit || f.goals.length > 0">
        <summary>
          <b>Nimani «natija» deb hisoblaymiz?</b> <span class="muted small">(ixtiyoriy, keyin ham qo'shsa bo'ladi)</span>
        </summary>
        <p class="muted small">
          Natija — tashrif buyuruvchi siz kutgan ishni qilgani: ariza qoldirdi, «Rahmat» sahifasiga yetdi, qo'ng'iroq tugmasini bosdi. Shu orqali qaysi reklama va sahifa foyda keltirayotgani ko'rinadi.
        </p>
        <div class="sf-presets">
          <span class="small muted">Tez qo'shish:</span>
          <button v-for="pr in PRESETS" :key="pr.name" type="button" class="chip" @click="addGoal(pr)"><Icon name="plus" :size="12" /> {{ pr.label }}</button>
          <button type="button" class="chip" @click="addGoal()"><Icon name="plus" :size="12" /> Boshqa</button>
        </div>
        <div v-for="(g, i) in f.goals" :key="g.id || i" class="sf-goal">
          <div class="sf-goal-top">
            <input v-model.trim="g.name" class="inp" placeholder="Nomi, masalan: Ariza" maxlength="60" aria-label="Natija nomi" />
            <select v-model="g.type" class="sel" aria-label="Qachon hisoblansin">
              <option v-for="[k, l] in GOAL_TYPES" :key="k" :value="k">{{ l }}</option>
            </select>
            <button type="button" class="btn ghost icon sm" aria-label="O'chirish" @click="f.goals.splice(i, 1)"><Icon name="x" :size="14" /></button>
          </div>
          <div class="sf-goal-bot">
            <label class="fld">
              <span>{{ HELP[g.type].label }}</span>
              <input v-model.trim="g.match" class="inp" :placeholder="HELP[g.type].ph" maxlength="120" @blur="g.type === 'page' && (g.match = cleanPath(g.match))" />
              <small class="sf-help" v-html="HELP[g.type].help"></small>
            </label>
            <label class="sf-chk"><input v-model="g.lead" type="checkbox" /> Ariza sifatida ham sanash</label>
          </div>
          <small v-if="g.type !== 'form' && !g.match" class="sf-err">Bu maydonni to'ldiring — aks holda natija saqlanmaydi.</small>
        </div>
      </details>

      <details class="sf-sec">
        <summary><b>Qo'shimcha sozlamalar</b> <span class="muted small">(odatda o'zgartirish shart emas)</span></summary>
        <div class="sf-grid" style="margin-top: 10px">
          <label class="fld">
            <span>Vaqt zonasi</span>
            <select v-model="f.timezone" class="sel">
              <option v-for="z in TZS" :key="z" :value="z">{{ z }}</option>
            </select>
            <small class="sf-help">Grafiklardagi soatlar shu bo'yicha ko'rsatiladi.</small>
          </label>
          <label class="fld">
            <span>Tashrif necha daqiqa harakatsizlikdan keyin tugaydi</span>
            <input v-model.number="f.settings.sessionTimeoutMin" type="number" min="5" max="120" class="inp" />
            <small class="sf-help">Odatiy qiymat — 30 daqiqa.</small>
          </label>
          <label class="sf-chk sf-wide"><input v-model="f.settings.strictOrigin" type="checkbox" /> Faqat shu saytdan kelgan ma'lumotni qabul qilish (tavsiya etiladi)</label>
          <label class="sf-chk sf-wide"><input v-model="f.settings.respectDnt" type="checkbox" /> Brauzerida «meni kuzatmang» yoqilgan odamlarni sanamaslik</label>
          <label class="sf-chk sf-wide"><input v-model="f.settings.consentRequired" type="checkbox" /> Faqat tashrif buyuruvchi rozilik bergandan keyin sanash (saytda rozilik oynasi bo'lsa)</label>
          <label class="fld">
            <span>Sayt boshqa manzillarda ham ochiladimi?</span>
            <input v-model.trim="allowed" class="inp" placeholder="shop.ufq.uz, ufq.com" />
            <small class="sf-help">Vergul bilan yozing. Bo'sh qoldirsa bo'ladi.</small>
          </label>
          <label class="fld">
            <span>Qo'shimcha kuzatiladigan tugmalar (dasturchi uchun)</span>
            <input v-model.trim="f.settings.clickSelectors" class="inp" placeholder=".btn-order, #call" maxlength="200" />
            <small class="sf-help">CSS selektor. Bo'sh qoldirsa bo'ladi.</small>
          </label>
        </div>
      </details>

      <div v-if="err" class="note bad">{{ err }}</div>
    </form>

    <!-- ── 2-bosqich: kodni o'rnatish ── -->
    <div v-else class="stack" style="gap: 12px">
      <div class="note good small"><b>«{{ created.name }}»</b> qo'shildi. Endi statistika yig'ilishi uchun saytga kichik kod qo'yish kerak — atigi 2 daqiqa.</div>
      <InstallGuide :site="created" :checking="checking" @check="checkNow" />
    </div>

    <template #foot>
      <template v-if="step === 1">
        <button class="btn" type="button" @click="close">Bekor qilish</button>
        <button class="btn pri" type="button" :disabled="saving" @click="submit">
          <span v-if="saving" class="spin" style="width: 14px; height: 14px"></span>
          {{ edit ? "Saqlash" : "Davom etish →" }}
        </button>
      </template>
      <template v-else>
        <button class="btn" type="button" @click="finish">Keyinroq o'rnataman</button>
        <button class="btn pri" type="button" @click="finish">Statistikani ochish →</button>
      </template>
    </template>
  </Modal>
</template>

<script setup>
import { reactive, ref, computed, onBeforeUnmount } from "vue";
import { api } from "../api.js";
import { toast } from "../store.js";
import { GOAL_TYPES } from "../wa.js";
import Modal from "./Modal.vue";
import Icon from "./Icon.vue";
import InstallGuide from "./InstallGuide.vue";

const props = defineProps({ edit: { type: Object, default: null }, categories: { type: Array, default: () => ["Boshqa"] } });
const emit = defineEmits(["close", "saved"]);
const TZS = ["Asia/Tashkent", "Asia/Samarkand", "Asia/Almaty", "Asia/Bishkek", "Asia/Dushanbe", "Europe/Moscow", "Europe/Istanbul", "Asia/Dubai", "Europe/London", "UTC", "America/New_York"];
const PRESETS = [
  { label: "Ariza formasi yuborilsa", name: "Ariza", type: "form", match: "", lead: true },
  { label: "«Rahmat» sahifasi ochilsa", name: "Rahmat sahifasi", type: "page", match: "/rahmat", lead: true },
  { label: "Qo'ng'iroq tugmasi", name: "Qo'ng'iroq", type: "click", match: "qongiroq", lead: true },
  { label: "Telegram tugmasi", name: "Telegram", type: "click", match: "telegram", lead: false },
];
const HELP = {
  page: { label: "Qaysi sahifa?", ph: "/rahmat", help: "Sahifa manzilining domendan keyingi qismi. Masalan <code>ufq.uz/rahmat</code> → <code>/rahmat</code>. Bir nechta sahifa uchun oxiriga * qo'ying: <code>/kurslar/*</code>" },
  form: { label: "Qaysi forma? (bo'sh — istalgan forma)", ph: "bo'sh qoldiring", help: "Bo'sh qoldirsangiz, saytdagi istalgan forma yuborilganda hisoblanadi." },
  click: { label: "Tugma nomi", ph: "qongiroq", help: "Tugma kodiga <code>data-ufq-event=\"qongiroq\"</code> yozilgan bo'lishi kerak (dasturchi qo'shadi). Shu yerdagi nom bilan bir xil bo'lsin." },
  event: { label: "Hodisa nomi", ph: "lead", help: "Dasturchi saytda <code>ufq('track','nomi')</code> chaqirganda hisoblanadi." },
};
const e = props.edit;
const f = reactive({
  name: e?.name || "",
  url: e?.url || "",
  description: e?.description || "",
  category: e?.category || "Boshqa",
  timezone: e?.timezone || "Asia/Tashkent",
  goals: JSON.parse(JSON.stringify(e?.goals || [])),
  settings: {
    respectDnt: e?.settings?.respectDnt !== false,
    consentRequired: !!e?.settings?.consentRequired,
    strictOrigin: e?.settings?.strictOrigin !== false,
    sessionTimeoutMin: e?.settings?.sessionTimeoutMin || 30,
    clickSelectors: e?.settings?.clickSelectors || "",
  },
});
const allowed = ref((e?.settings?.allowedHosts || []).join(", "));
const saving = ref(false);
const err = ref("");
const step = ref(1);
const created = ref(null);
const checking = ref(false);

const urlErr = computed(() => {
  if (!f.url || e) return "";
  const s = /^[a-z]+:\/\//i.test(f.url) ? f.url : "https://" + f.url;
  try {
    const u = new URL(s);
    if (!/^https?:$/.test(u.protocol)) return "Manzil http yoki https bilan boshlanishi kerak";
    if (!u.hostname.includes(".")) return "To'liq manzil kiriting (masalan: ufq.uz)";
  } catch {
    return "Manzil noto'g'ri yozilgan";
  }
  return "";
});

function cleanPath(v) {
  let s = String(v || "").trim();
  if (!s) return s;
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s.replace(/\*$/, ""));
      s = u.pathname + (s.endsWith("*") ? "*" : "");
    } catch {}
  }
  return s.startsWith("/") ? s : "/" + s;
}
function addGoal(pr) {
  f.goals.push(pr ? { name: pr.name, type: pr.type, match: pr.match, lead: pr.lead } : { name: "", type: "page", match: "", lead: false });
}

async function submit() {
  err.value = "";
  if (!f.name || !f.url || urlErr.value) {
    err.value = urlErr.value || "Sayt nomi va manzilini kiriting";
    return;
  }
  saving.value = true;
  try {
    const goals = f.goals.map((g) => ({ ...g, name: g.name || "Natija", match: g.type === "page" ? cleanPath(g.match) : g.match }));
    const body = { ...f, goals, settings: { ...f.settings, allowedHosts: allowed.value } };
    if (e) {
      const d = await api("/api/super/wa/sites/" + e.id, { method: "POST", body });
      emit("saved", d.site);
    } else {
      const d = await api("/api/super/wa/sites", { method: "POST", body });
      created.value = d.site;
      step.value = 2;
      startPoll();
    }
  } catch (x) {
    err.value = x.message;
  } finally {
    saving.value = false;
  }
}

// 2-bosqich: sayt holatini kuzatib turamiz — ma'lumot kela boshlasa darhol ko'rinadi
let timer = null;
function startPoll() {
  stopPoll();
  timer = setInterval(async () => {
    if (!created.value) return;
    try {
      const d = await api("/api/super/wa/sites/" + encodeURIComponent(created.value.id));
      created.value = d.site;
    } catch {}
  }, 8000);
}
function stopPoll() {
  if (timer) clearInterval(timer);
  timer = null;
}
onBeforeUnmount(stopPoll);

async function checkNow() {
  checking.value = true;
  try {
    const r = await api(`/api/super/wa/sites/${encodeURIComponent(created.value.id)}/check`, { method: "POST" });
    created.value = r.site;
    toast(r.health.ok ? (r.health.snippetFound ? "Sayt ochildi va kod topildi" : "Sayt ochildi, lekin kod hali topilmadi") : "Sayt ochilmadi: " + r.health.error, r.health.ok && r.health.snippetFound ? "ok" : "error");
  } catch (x) {
    toast(x.message, "error");
  } finally {
    checking.value = false;
  }
}
function finish() {
  stopPoll();
  emit("saved", created.value);
}
function close() {
  // Sayt allaqachon yaratilgan bo'lsa — yopilganda ham uning sahifasiga o'tamiz
  if (created.value) return finish();
  emit("close");
}
</script>

<style scoped>
.sf { display: grid; gap: 14px; }
.sf-steps { list-style: none; margin: 0 0 14px; padding: 0; display: flex; gap: 8px; flex-wrap: wrap; }
.sf-steps li { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: var(--text-3); padding: 6px 12px 6px 6px; border-radius: 999px; background: var(--surface-3); }
.sf-steps li span { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: var(--surface); font-size: 12px; }
.sf-steps li.on { color: var(--accent-text); background: var(--accent-soft); }
.sf-steps li.on span { background: var(--accent); color: #fff; }
.sf-steps li.done { color: var(--good); }
.sf-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.sf-wide { grid-column: 1 / -1; }
.fld { display: grid; gap: 5px; font-size: 12.5px; font-weight: 600; color: var(--text-2); }
.sf-help { font-weight: 400; color: var(--text-3); font-size: 11.5px; line-height: 1.4; }
.sf-sec { border: 1px solid var(--border); border-radius: var(--r-sm); padding: 12px; display: grid; gap: 10px; }
.sf-sec summary { cursor: pointer; }
.sf-presets { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.sf-goal { border: 1px solid var(--border); border-radius: var(--r-sm); padding: 10px; display: grid; gap: 8px; background: var(--surface-2); }
.sf-goal-top { display: grid; grid-template-columns: 1fr 1fr auto; gap: 6px; align-items: center; }
.sf-goal-bot { display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: start; }
.sf-chk { display: flex; gap: 6px; align-items: center; font-size: 12.5px; color: var(--text-2); }
.sf-goal-bot .sf-chk { padding-top: 24px; white-space: nowrap; }
.sf-err { color: var(--bad); font-weight: 600; font-size: 11.5px; }
:deep(code) { font-size: 11.5px; background: var(--surface-3); padding: 1px 4px; border-radius: 4px; }
@media (max-width: 700px) {
  .sf-grid { grid-template-columns: 1fr; }
  .sf-goal-top { grid-template-columns: 1fr auto; }
  .sf-goal-top .sel { grid-column: 1 / -1; grid-row: 2; }
  .sf-goal-bot { grid-template-columns: 1fr; }
  .sf-goal-bot .sf-chk { padding-top: 0; }
}
</style>
