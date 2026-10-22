<template>
  <div class="stack">
    <State :loading="loading && !d" :error="error" :retry="reload">
      <template v-if="d">
        <div v-if="d.security.passwordFromEnv" class="note warn">
          <b>Boshlang'ich parol ishlatilmoqda.</b> Hisob parolni server sozlamasidan (ENV) olgan. Xavfsizlik uchun pastda o'z parolingizni o'rnating
          va 2 bosqichli tasdiqlashni yoqing.
        </div>
        <div class="grid g2">
          <div class="card">
            <div class="card-h"><h3><Icon name="user" :size="16" /> Hisob</h3></div>
            <div class="card-b">
              <dl class="kv">
                <dt>Login</dt><dd class="mono">{{ d.user.username }}</dd>
                <dt>Ism</dt><dd>{{ d.user.name }}</dd>
                <dt>Rol</dt><dd><span class="badge b-acc"><Icon name="crown" :size="12" /> Super Admin</span></dd>
                <dt>Oxirgi kirish</dt><dd>{{ fmt.dt(d.user.lastLoginAt) }}</dd>
                <dt>Parol o'zgargan</dt><dd>{{ fmt.dt(d.security.passwordChangedAt) }}</dd>
                <dt>Sessiya muddati</dt><dd>{{ d.security.idleTimeoutMin }} daqiqa harakatsizlikdan keyin yopiladi</dd>
                <dt>2 bosqichli tasdiqlash</dt>
                <dd>
                  <span class="badge" :class="d.security.twoFactor ? 'b-good' : 'b-warn'">
                    <Icon :name="d.security.twoFactor ? 'check' : 'alert'" :size="12" />{{ d.security.twoFactor ? "Yoqilgan" : "O'chiq" }}
                  </span>
                </dd>
              </dl>
            </div>
          </div>

          <div class="card">
            <div class="card-h"><h3><Icon name="key" :size="16" /> Parolni almashtirish</h3></div>
            <div class="card-b stack">
              <label class="fld">Joriy parol<input v-model="pw.password" type="password" class="inp" autocomplete="current-password" /></label>
              <label class="fld">Yangi parol (kamida 10 belgi)<input v-model="pw.newPassword" type="password" class="inp" autocomplete="new-password" /></label>
              <label class="fld">Yangi parolni takrorlang<input v-model="pw.again" type="password" class="inp" autocomplete="new-password" /></label>
              <label v-if="d.security.twoFactor" class="fld">Authenticator kodi<input v-model="pw.otp" class="inp" inputmode="numeric" maxlength="7" /></label>
              <div v-if="pwErr" class="note bad">{{ pwErr }}</div>
              <div class="row"><button class="btn pri" :disabled="busy || !pw.password || !pw.newPassword" @click="changePw">Parolni almashtirish</button></div>
              <div class="small muted">Almashtirilgach barcha qurilmalardagi sessiyalar yopiladi va qaytadan kirish so'raladi.</div>
            </div>
          </div>

          <div class="card">
            <div class="card-h"><h3><Icon name="shield" :size="16" /> 2 bosqichli tasdiqlash (TOTP)</h3></div>
            <div class="card-b stack">
              <p class="small">
                Kirishda paroldan tashqari telefoningizdagi Authenticator ilovasi (Google Authenticator, Microsoft Authenticator, Authy) beradigan
                6 xonali kod so'raladi. Parol sizib chiqsa ham hisobga kirib bo'lmaydi.
              </p>
              <template v-if="!d.security.twoFactor">
                <template v-if="!setup">
                  <label class="fld">Parolingiz<input v-model="tf.password" type="password" class="inp" autocomplete="current-password" /></label>
                  <div class="row"><button class="btn pri" :disabled="busy || !tf.password" @click="startSetup">Sozlashni boshlash</button></div>
                </template>
                <template v-else>
                  <div class="note info">
                    1) Ilovada «Hisob qo'shish → Kalitni kiritish» ni tanlang va quyidagi kalitni kiriting (yoki telefonda havolani bosing).<br />
                    2) Ilova ko'rsatgan 6 xonali kodni pastga yozing.
                  </div>
                  <div class="secret mono">{{ setup.secret.match(/.{1,4}/g).join(" ") }}</div>
                  <a :href="setup.uri" class="small">Telefonda ochish (otpauth havola)</a>
                  <label class="fld">Ilovadagi kod<input v-model="tf.code" class="inp" inputmode="numeric" maxlength="7" @keydown.enter="enable" /></label>
                  <div class="row">
                    <button class="btn pri" :disabled="busy || !tf.code" @click="enable">Yoqish</button>
                    <button class="btn" @click="setup = null">Bekor qilish</button>
                  </div>
                </template>
              </template>
              <template v-else>
                <button class="btn danger" style="justify-self: start" @click="askDisable = true">2 bosqichli tasdiqlashni o'chirish</button>
              </template>
              <div v-if="tfErr" class="note bad">{{ tfErr }}</div>
            </div>
          </div>

          <div class="card">
            <div class="card-h"><h3><Icon name="layers" :size="16" /> Faol sessiyalar</h3></div>
            <div class="card-b">
              <div v-if="!sessions.length" class="muted small">Ma'lumot yo'q.</div>
              <div v-for="s in sessions" :key="s.id" class="list-row">
                <Icon name="user" :size="16" />
                <div style="min-width: 0">
                  <div class="small" style="font-weight: 600">{{ s.ua || "Noma'lum qurilma" }}</div>
                  <div class="small muted">IP {{ s.ip || "—" }} · {{ fmt.ago(s.lastUsedAt) }}</div>
                </div>
              </div>
              <div class="note" style="margin-top: 10px">
                Hisobni tiklash: parol yoki telefon yo'qolsa, server egasi <span class="mono">node superadmin-reset.js {{ d.user.username }}</span> buyrug'i
                bilan bir martalik havola oladi yoki ENV dagi <span class="mono">SUPER_ADMIN_PASSWORD</span> ni almashtiradi.
              </div>
            </div>
          </div>
        </div>
      </template>
    </State>
    <ReauthDialog
      v-if="askDisable"
      title="2 bosqichli tasdiqlashni o'chirish"
      ok-text="O'chirish"
      danger
      need-otp
      warning="Himoya darajasi pasayadi. Bu amal jurnalga «jiddiy» deb yoziladi."
      :action="(x) => api('/api/super/me/2fa/disable', { method: 'POST', body: x })"
      @close="askDisable = false"
      @done="disabled"
    />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from "vue";
import { api, logout } from "../api.js";
import { fmt, toast } from "../store.js";
import { useLoad } from "../useLoad.js";
import State from "../components/State.vue";
import ReauthDialog from "../components/ReauthDialog.vue";
import Icon from "../components/Icon.vue";

const { data: d, loading, error, reload } = useLoad(() => api("/api/super/me"));
const sessions = ref([]);
onMounted(async () => {
  try {
    sessions.value = (await api("/api/super/me/sessions")).sessions;
  } catch {}
});
const busy = ref(false);
const pw = reactive({ password: "", newPassword: "", again: "", otp: "" });
const pwErr = ref("");
async function changePw() {
  pwErr.value = "";
  if (pw.newPassword.length < 10) return (pwErr.value = "Yangi parol kamida 10 belgi bo'lsin");
  if (pw.newPassword !== pw.again) return (pwErr.value = "Yangi parollar bir xil emas");
  busy.value = true;
  try {
    await api("/api/super/me/password", { method: "POST", body: { password: pw.password, newPassword: pw.newPassword, otp: pw.otp } });
    toast("Parol almashtirildi — qaytadan kiring");
    setTimeout(logout, 1200);
  } catch (e) {
    pwErr.value = e.message;
  } finally {
    busy.value = false;
    pw.password = "";
  }
}
const tf = reactive({ password: "", code: "" });
const setup = ref(null);
const tfErr = ref("");
const askDisable = ref(false);
async function startSetup() {
  tfErr.value = "";
  busy.value = true;
  try {
    setup.value = await api("/api/super/me/2fa/setup", { method: "POST", body: { password: tf.password } });
  } catch (e) {
    tfErr.value = e.message;
  } finally {
    busy.value = false;
    tf.password = "";
  }
}
async function enable() {
  tfErr.value = "";
  busy.value = true;
  try {
    await api("/api/super/me/2fa/enable", { method: "POST", body: { code: tf.code } });
    toast("2 bosqichli tasdiqlash yoqildi");
    setup.value = null;
    tf.code = "";
    reload();
  } catch (e) {
    tfErr.value = e.message;
  } finally {
    busy.value = false;
  }
}
function disabled() {
  askDisable.value = false;
  toast("2 bosqichli tasdiqlash o'chirildi", "warn");
  reload();
}
</script>

<style scoped>
.secret { font-size: 17px; letter-spacing: 1.5px; padding: 12px 14px; border: 1px dashed var(--accent); border-radius: 10px; background: var(--accent-soft); color: var(--accent-text); word-break: break-all; user-select: all; }
</style>
