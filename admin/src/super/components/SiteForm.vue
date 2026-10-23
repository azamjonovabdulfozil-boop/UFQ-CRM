<template>
  <Modal :title="edit ? 'Sayt sozlamalari' : '+ Sayt qo\'shish'" wide @close="$emit('close')">
    <form class="sf" @submit.prevent="submit">
      <div class="sf-grid">
        <label class="fld">
          <span>Sayt nomi *</span>
          <input v-model.trim="f.name" class="inp" maxlength="80" required placeholder="Masalan: UFQ o'quv markazi" />
        </label>
        <label class="fld">
          <span>To'liq URL manzil *</span>
          <input v-model.trim="f.url" class="inp" :disabled="!!edit" required placeholder="https://example.uz" inputmode="url" />
          <small v-if="urlErr" class="sf-err">{{ urlErr }}</small>
        </label>
        <label class="fld sf-wide">
          <span>Tavsif</span>
          <textarea v-model="f.description" class="inp" rows="2" maxlength="500" placeholder="Sayt nima haqida (ixtiyoriy)"></textarea>
        </label>
        <label class="fld">
          <span>Kategoriya</span>
          <select v-model="f.category" class="sel">
            <option v-for="c in categories" :key="c">{{ c }}</option>
          </select>
        </label>
        <label class="fld">
          <span>Vaqt zonasi</span>
          <select v-model="f.timezone" class="sel">
            <option v-for="z in TZS" :key="z" :value="z">{{ z }}</option>
          </select>
        </label>
      </div>

      <div class="sf-sec">
        <div class="row between">
          <b>Konversiya maqsadlari</b>
          <button type="button" class="btn sm" @click="addGoal"><Icon name="plus" :size="13" /> Maqsad</button>
        </div>
        <p class="muted small">Masalan: «/rahmat» sahifasiga kirish, «ariza» formasi yuborilishi yoki <code>data-ufq-event="qongiroq"</code> tugmasi bosilishi. <code>lead</code>, <code>purchase</code>, <code>conversion</code> hodisalari avtomatik hisoblanadi.</p>
        <div v-for="(g, i) in f.goals" :key="g.id || i" class="sf-goal">
          <input v-model.trim="g.name" class="inp" placeholder="Nomi" maxlength="60" />
          <select v-model="g.type" class="sel">
            <option v-for="[k, l] in GOAL_TYPES" :key="k" :value="k">{{ l }}</option>
          </select>
          <input v-model.trim="g.match" class="inp" :placeholder="ph(g.type)" maxlength="120" />
          <label class="sf-chk" title="Bu maqsad lead hisoblansin"><input v-model="g.lead" type="checkbox" /> lead</label>
          <button type="button" class="btn ghost icon sm" aria-label="O'chirish" @click="f.goals.splice(i, 1)"><Icon name="x" :size="14" /></button>
        </div>
      </div>

      <details class="sf-sec" :open="!!edit">
        <summary><b>Qo'shimcha sozlamalar</b></summary>
        <div class="sf-grid" style="margin-top: 10px">
          <label class="sf-chk"><input v-model="f.settings.respectDnt" type="checkbox" /> «Do Not Track» va GPC ni hurmat qilish</label>
          <label class="sf-chk"><input v-model="f.settings.consentRequired" type="checkbox" /> Rozilik talab qilinsin (<code>ufq('consent', true)</code> chaqirilmaguncha yig'ilmaydi)</label>
          <label class="sf-chk"><input v-model="f.settings.strictOrigin" type="checkbox" /> Faqat sayt domenidan kelgan hodisalarni qabul qilish</label>
          <label class="fld">
            <span>Sessiya tugashi (faoliyatsizlik, daqiqa)</span>
            <input v-model.number="f.settings.sessionTimeoutMin" type="number" min="5" max="120" class="inp" />
          </label>
          <label class="fld">
            <span>Kuzatiladigan tugmalar (CSS selektor)</span>
            <input v-model.trim="f.settings.clickSelectors" class="inp" placeholder=".btn-order, #call" maxlength="200" />
          </label>
          <label class="fld">
            <span>Qo'shimcha ruxsat etilgan domenlar</span>
            <input v-model.trim="allowed" class="inp" placeholder="shop.example.uz, example.com" />
          </label>
        </div>
      </details>

      <div v-if="err" class="note bad">{{ err }}</div>
    </form>
    <template #foot>
      <button class="btn" type="button" @click="$emit('close')">Bekor qilish</button>
      <button class="btn pri" type="button" :disabled="saving" @click="submit">
        <span v-if="saving" class="spin" style="width: 14px; height: 14px"></span>
        {{ edit ? "Saqlash" : "Qo'shish va ochish" }}
      </button>
    </template>
  </Modal>
</template>

<script setup>
import { reactive, ref, computed } from "vue";
import { api } from "../api.js";
import { GOAL_TYPES } from "../wa.js";
import Modal from "./Modal.vue";
import Icon from "./Icon.vue";

const props = defineProps({ edit: { type: Object, default: null }, categories: { type: Array, default: () => ["Boshqa"] } });
const emit = defineEmits(["close", "saved"]);
const TZS = ["Asia/Tashkent", "Asia/Samarkand", "Asia/Almaty", "Asia/Bishkek", "Asia/Dushanbe", "Europe/Moscow", "Europe/Istanbul", "Asia/Dubai", "Europe/London", "UTC", "America/New_York"];
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
const urlErr = computed(() => {
  if (!f.url || e) return "";
  const s = /^[a-z]+:\/\//i.test(f.url) ? f.url : "https://" + f.url;
  try {
    const u = new URL(s);
    if (!/^https?:$/.test(u.protocol)) return "Faqat http yoki https";
    if (!u.hostname.includes(".")) return "To'liq domen kiriting (masalan: example.uz)";
  } catch {
    return "URL noto'g'ri";
  }
  return "";
});
const ph = (t) => ({ page: "/rahmat yoki /blog/*", event: "lead, purchase yoki nomi", click: "qongiroq", form: "forma nomi (bo'sh — har qanday)" })[t];
function addGoal() {
  f.goals.push({ name: "", type: "page", match: "", lead: false });
}
async function submit() {
  err.value = "";
  if (!f.name || !f.url || urlErr.value) {
    err.value = urlErr.value || "Nom va URL majburiy";
    return;
  }
  saving.value = true;
  try {
    const body = { ...f, settings: { ...f.settings, allowedHosts: allowed.value } };
    const d = e
      ? await api("/api/super/wa/sites/" + e.id, { method: "POST", body })
      : await api("/api/super/wa/sites", { method: "POST", body });
    emit("saved", d.site);
  } catch (x) {
    err.value = x.message;
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.sf { display: grid; gap: 14px; }
.sf-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.sf-wide { grid-column: 1 / -1; }
.fld { display: grid; gap: 5px; font-size: 12.5px; font-weight: 600; color: var(--text-2); }
.sf-sec { border: 1px solid var(--border); border-radius: var(--r-sm); padding: 12px; display: grid; gap: 8px; }
.sf-sec summary { cursor: pointer; }
.sf-goal { display: grid; grid-template-columns: 1.1fr 1.2fr 1.4fr auto auto; gap: 6px; align-items: center; }
.sf-chk { display: flex; gap: 6px; align-items: center; font-size: 12.5px; color: var(--text-2); }
.sf-err { color: var(--bad); font-weight: 600; }
code { font-size: 11.5px; background: var(--surface-3); padding: 1px 4px; border-radius: 4px; }
@media (max-width: 700px) {
  .sf-grid { grid-template-columns: 1fr; }
  .sf-goal { grid-template-columns: 1fr 1fr; }
}
</style>
