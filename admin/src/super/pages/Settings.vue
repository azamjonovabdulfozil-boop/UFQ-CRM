<template>
  <div class="stack">
    <div class="page-head">
      <p>
        Bu sozlamalar bazada saqlanadi va uchala panelga (admin, mentor, talaba) tatbiq qilinadi. Har bir o'zgarish faoliyat tarixiga yoziladi.
        Menyu va modullar — <router-link to="/menu">Menyu boshqaruvi</router-link>; ruxsatlar — <router-link to="/admins">Administratorlar</router-link>;
        reyting mezonlari — <router-link to="/teachers">O'qituvchilar reytingi</router-link>.
      </p>
    </div>
    <State :loading="loading && !d" :error="error" :retry="reload">
      <template v-if="d">
        <div class="grid g2">
          <!-- Brending -->
          <div class="card">
            <div class="card-h"><h3><Icon name="crown" :size="16" /> CRM nomi va logotipi</h3></div>
            <div class="card-b stack">
              <label class="fld">CRM nomi<input v-model="b.crmName" class="inp" maxlength="40" /></label>
              <div class="fld">
                Logotip
                <div class="row">
                  <div class="logo">
                    <img v-if="b.crmLogo" :src="b.crmLogo" alt="Logotip" />
                    <span v-else>{{ (b.crmName || "E").slice(0, 1) }}</span>
                  </div>
                  <label class="btn sm">Rasm tanlash<input type="file" accept="image/png,image/jpeg,image/webp" hidden @change="pickLogo" /></label>
                  <button v-if="b.crmLogo" class="btn sm danger" @click="b.crmLogo = null">Olib tashlash</button>
                </div>
                <span class="small muted">PNG/JPG/WEBP, 300 KB gacha. Kvadrat rasm tavsiya etiladi.</span>
              </div>
              <div class="fld">
                Standart asosiy rang (foydalanuvchi o'zi tanlamagan bo'lsa)
                <div class="row">
                  <button v-for="c in ACCENTS" :key="c[0]" class="swatch" :class="{ on: b.defaultAccent === c[0] }" :style="{ background: c[1] }" :title="c[2]" :aria-label="c[2]" @click="b.defaultAccent = c[0]"></button>
                </div>
              </div>
              <label class="fld">
                Standart ko'rinish
                <select v-model="b.defaultTheme" class="inp">
                  <option value="auto">Qurilma sozlamasi bo'yicha</option>
                  <option value="light">Yorug'</option>
                  <option value="dark">Qorong'i</option>
                </select>
              </label>
              <div class="row"><button class="btn pri" :disabled="busy" @click="saveBrand">Saqlash</button></div>
            </div>
          </div>

          <div class="stack">
            <!-- Umumiy -->
            <div class="card">
              <div class="card-h"><h3><Icon name="clock" :size="16" /> Sana va vaqt mintaqasi</h3></div>
              <div class="card-b stack">
                <label class="fld">
                  Vaqt mintaqasi (analitikada «bugun», dars kunlari va hisobot sanalari shu bo'yicha)
                  <select v-model="g.timezone" class="inp">
                    <option v-for="tz in d.timezones" :key="tz">{{ tz }}</option>
                  </select>
                </label>
                <div class="row"><button class="btn pri" :disabled="busy" @click="save('general', g)">Saqlash</button></div>
              </div>
            </div>
            <!-- Bildirishnomalar -->
            <div class="card">
              <div class="card-h"><h3><Icon name="alert" :size="16" /> Bildirishnomalar</h3></div>
              <div class="card-b stack">
                <div class="row between">
                  <div><b>Davomat hisoboti (Telegram)</b><div class="small muted">Dars belgilanganda ota-onalar guruhiga hisobot</div></div>
                  <button class="sw" :class="{ on: n.telegramAttendance }" role="switch" :aria-checked="n.telegramAttendance" @click="n.telegramAttendance = !n.telegramAttendance"></button>
                </div>
                <div class="row between">
                  <div><b>Qarzdorlarga xabar (Telegram/SMS)</b><div class="small muted">O'chirilsa — «Qarzdorlar» bo'limidan xabar yuborilmaydi</div></div>
                  <button class="sw" :class="{ on: n.debtorMessages }" role="switch" :aria-checked="n.debtorMessages" @click="n.debtorMessages = !n.debtorMessages"></button>
                </div>
                <div class="row">
                  <label class="fld" style="width: 200px">Xato kirishlar ogohlantirishi (davrda)<input v-model.number="n.failedLoginAlert" type="number" min="1" class="inp" /></label>
                  <label class="fld" style="width: 200px">Server xatolari ogohlantirishi (24 soat)<input v-model.number="n.serverErrorAlert" type="number" min="1" class="inp" /></label>
                </div>
                <div class="row"><button class="btn pri" :disabled="busy" @click="save('notifications', n)">Saqlash</button></div>
              </div>
            </div>
          </div>
        </div>
        <div class="note">
          Rang va ko'rinish — foydalanuvchi o'z panelida (Sozlamalar → Ko'rinish) tanlamagan bo'lsa qo'llanadi. Ochiq panellar o'zgarishni ~15 soniyada oladi.
        </div>
      </template>
    </State>
  </div>
</template>

<script setup>
import { reactive, ref, watch } from "vue";
import { api } from "../api.js";
import { toast } from "../store.js";
import { useLoad } from "../useLoad.js";
import State from "../components/State.vue";
import Icon from "../components/Icon.vue";

const ACCENTS = [
  ["blue", "linear-gradient(135deg,#3b82f6,#6366f1)", "Ko'k"],
  ["teal", "linear-gradient(135deg,#0d9488,#0ea5e9)", "Firuza"],
  ["purple", "linear-gradient(135deg,#7c3aed,#a855f7)", "Binafsha"],
  ["orange", "linear-gradient(135deg,#ea580c,#f59e0b)", "To'q sariq"],
  ["rose", "linear-gradient(135deg,#e11d48,#ec4899)", "Pushti"],
  ["green", "linear-gradient(135deg,#059669,#22c55e)", "Yashil"],
];
const { data: d, loading, error, reload } = useLoad(() => api("/api/super/settings"));
const b = reactive({});
const g = reactive({});
const n = reactive({});
const busy = ref(false);
watch(d, (v) => {
  if (!v) return;
  Object.assign(b, v.branding);
  Object.assign(g, v.settings.general);
  Object.assign(n, v.settings.notifications);
});
function pickLogo(e) {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  if (f.size > 300 * 1024) return toast("Rasm 300 KB dan kichik bo'lsin", "error");
  const r = new FileReader();
  r.onload = () => (b.crmLogo = r.result);
  r.readAsDataURL(f);
}
async function saveBrand() {
  busy.value = true;
  try {
    await api("/api/super/branding", { method: "POST", body: { ...b } });
    toast("Brending saqlandi — barcha panellarga tarqatildi");
    reload();
  } catch (e) {
    toast(e.message, "error");
  } finally {
    busy.value = false;
  }
}
async function save(section, val) {
  busy.value = true;
  try {
    await api("/api/super/settings/" + section, { method: "POST", body: { ...val } });
    toast("Saqlandi");
    reload();
  } catch (e) {
    toast(e.message, "error");
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.logo { width: 52px; height: 52px; border-radius: 13px; background: linear-gradient(135deg, var(--accent), #5a3fe0); color: #fff; display: grid; place-items: center; font-weight: 800; font-size: 22px; overflow: hidden; }
.logo img { width: 100%; height: 100%; object-fit: cover; }
.swatch { width: 34px; height: 34px; border-radius: 50%; border: 3px solid transparent; cursor: pointer; }
.swatch.on { border-color: var(--surface); outline: 3px solid var(--accent); }
</style>
