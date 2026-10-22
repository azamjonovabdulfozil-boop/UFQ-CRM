<template>
  <div class="stack">
    <div class="page-head">
      <p>
        Oddiy admin panelidagi bo'limlarni yoqish va o'chirish. <b>Menyu</b> — chap menyuda ko'rinishi; <b>API / ma'lumot</b> — serverdagi kirish
        huquqi (o'chirilsa, to'g'ridan-to'g'ri URL yoki so'rov orqali ham ochilmaydi). Ma'lumotlar bazadan o'chirilmaydi — qayta yoqilsa hammasi joyida.
        Cheklovlar faqat oddiy adminga ta'sir qiladi: Super Admin, mentor va talabalar ishlashi o'zgarmaydi.
      </p>
    </div>
    <State :loading="loading && !d" :error="error" :retry="reload">
      <template v-if="d">
        <div class="card">
          <div class="card-b">
            <div class="tw">
              <table class="t">
                <thead><tr><th>Bo'lim</th><th>Menyuda ko'rinadi</th><th>API / ma'lumotga kirish</th><th>Serverda nima yopiladi</th></tr></thead>
                <tbody>
                  <tr v-for="m in d.modules" :key="m.key">
                    <td><b>{{ m.label }}</b><div class="small muted mono">{{ m.nav }}</div></td>
                    <td><button class="sw" :class="{ on: st[m.key].menu }" role="switch" :aria-checked="st[m.key].menu" :aria-label="m.label + ' menyu'" :disabled="!st[m.key].api" @click="st[m.key].menu = !st[m.key].menu"></button></td>
                    <td><button class="sw" :class="{ on: st[m.key].api }" role="switch" :aria-checked="st[m.key].api" :aria-label="m.label + ' API'" @click="toggleApi(m.key)"></button></td>
                    <td class="small muted">{{ affects(m) }}</td>
                  </tr>
                  <tr v-for="l in d.locked" :key="l.key">
                    <td><b>{{ l.label }}</b></td>
                    <td colspan="2"><span class="badge b-mute"><Icon name="lock" :size="12" /> har doim yoqilgan</span></td>
                    <td class="small muted">{{ l.reason }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="row" style="margin-top: 14px">
              <button class="btn pri" :disabled="!dirty || saving" @click="save">Saqlash</button>
              <button class="btn" :disabled="!dirty" @click="resetSt">Bekor qilish</button>
              <span v-if="dirty" class="small muted">Saqlanmagan o'zgarishlar bor</span>
            </div>
          </div>
        </div>
        <div class="note info">
          Ochiq admin panellari o'zgarishni bir daqiqa ichida (yoki oyna faollashganda) oladi. Har bir o'zgarish faoliyat tarixiga yoziladi.
          Alohida administratorlarga qo'shimcha cheklov — <router-link to="/admins">Administratorlar → Ruxsatlar</router-link>.
        </div>
      </template>
    </State>
  </div>
</template>

<script setup>
import { reactive, computed, watch, ref } from "vue";
import { api } from "../api.js";
import { toast } from "../store.js";
import { useLoad } from "../useLoad.js";
import State from "../components/State.vue";
import Icon from "../components/Icon.vue";

const { data: d, loading, error, reload } = useLoad(() => api("/api/super/modules"));
const st = reactive({});
const saving = ref(false);
function resetSt() {
  for (const m of d.value?.modules || []) st[m.key] = { ...m.state };
}
watch(d, resetSt);
const dirty = computed(() => (d.value?.modules || []).some((m) => st[m.key] && (st[m.key].menu !== m.state.menu || st[m.key].api !== m.state.api)));
function toggleApi(k) {
  st[k].api = !st[k].api;
  st[k].menu = st[k].api;
}
function affects(m) {
  const p = [];
  if (m.affects.write.length) p.push("yozish: " + m.affects.write.join(", "));
  if (m.affects.read.length) p.push("o'qish: " + m.affects.read.join(", "));
  if (m.affects.endpoints.length) p.push(m.affects.endpoints.join(", "));
  return p.join(" · ") || "faqat menyu (alohida API yo'q)";
}
async function save() {
  saving.value = true;
  try {
    await api("/api/super/modules", { method: "POST", body: { modules: JSON.parse(JSON.stringify(st)) } });
    toast("Menyu sozlamalari saqlandi");
    await reload();
  } catch (e) {
    toast(e.message, "error");
  } finally {
    saving.value = false;
  }
}
</script>
