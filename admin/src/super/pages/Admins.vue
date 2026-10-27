<template>
  <div class="stack">
    <div class="page-head">
      <p>
        Administratorlar ro'yxati: ism-familiyasi, holati va oxirgi kirish vaqti. Parol hech qachon ko'rsatilmaydi — tiklash uchun bir
        martalik havola yaratiladi. Har bir admin nima qilgani «Faoliyat tarixi» bo'limida ko'rinadi.
      </p>
      <button class="btn pri" @click="newOpen = true"><Icon name="plus" :size="15" /> Yangi administrator</button>
    </div>
    <div class="card">
      <div class="card-b">
        <State :loading="loading && !d" :error="error" :retry="reload" :empty="d && !d.admins.length">
          <div v-if="d" class="admins">
            <div v-for="a in d.admins" :key="a.id" class="adm" :class="{ off: a.status === 'disabled' }">
              <div class="adm-top">
                <span class="adm-av" :class="{ sup: a.isSuper }">{{ initials(a) }}</span>
                <div class="adm-who">
                  <b v-if="a.fullName">{{ a.fullName }}</b>
                  <b v-else class="muted">Ism-familiya kiritilmagan</b>
                  <span class="small muted">login: <span class="mono">{{ a.username }}</span></span>
                </div>
                <span class="badge" :class="a.isSuper ? 'b-acc' : 'b-mute'"><Icon v-if="a.isSuper" name="crown" :size="12" />{{ a.isSuper ? "Super Admin" : "Admin" }}</span>
                <span class="badge" :class="a.status === 'disabled' ? 'b-bad' : 'b-good'">
                  <Icon :name="a.status === 'disabled' ? 'lock' : 'check'" :size="12" />{{ a.status === "disabled" ? "Bloklangan" : "Faol" }}
                </span>
              </div>
              <div class="adm-facts">
                <span><Icon name="clock" :size="13" /> Oxirgi kirish: <b :title="fmt.dt(a.lastLoginAt)">{{ fmt.ago(a.lastLoginAt) }}</b></span>
                <span>Ochiq qurilmalar: <b>{{ a.activeSessions }}</b></span>
                <span :class="{ down: a.failedAttempts >= 5 }">Xato urinishlar: <b>{{ a.failedAttempts }}</b></span>
                <span>2 bosqichli himoya: <b>{{ a.twoFactor ? "yoqilgan" : "yo'q" }}</b></span>
                <span v-if="!a.isSuper">Cheklovlar: <b>{{ restrictText(a) }}</b></span>
              </div>
              <div class="adm-acts">
                <button class="btn sm" @click="openDetail(a)"><Icon name="eye" :size="13" /> Batafsil</button>
                <template v-if="!a.isSuper">
                  <button class="btn sm" @click="openName(a)"><Icon name="edit" :size="13" /> Ism-familiya</button>
                  <button class="btn sm" @click="perm = { a, mods: modsOf(a) }"><Icon name="key" :size="13" /> Ruxsatlar</button>
                  <button class="btn sm" @click="askReset = a"><Icon name="lock" :size="13" /> Parolni tiklash</button>
                  <span class="grow"></span>
                  <button class="btn sm" :class="a.status === 'disabled' ? '' : 'danger'" @click="askStatus = a">
                    {{ a.status === "disabled" ? "Faollashtirish" : "Bloklash" }}
                  </button>
                  <button class="btn sm danger" @click="askDelete = a"><Icon name="close" :size="13" /> O'chirish</button>
                </template>
              </div>
            </div>
          </div>
        </State>
      </div>
    </div>

    <!-- Batafsil: sessiyalar va faoliyat -->
    <Modal v-if="det" :title="(det.a.fullName || det.a.username) + ' — batafsil'" wide @close="det = null">
      <State :loading="det.loading" :error="det.err">
        <template v-if="det.data">
          <dl class="kv" style="margin-bottom: 14px">
            <dt>Ism familiya</dt><dd>{{ det.a.fullName || "kiritilmagan" }}</dd>
            <dt>Login</dt><dd class="mono">{{ det.data.account.username }}</dd>
            <dt>Rol</dt><dd>{{ det.data.account.isSuper ? "Super Admin" : "Admin" }}</dd>
            <dt>Yaratilgan</dt><dd>{{ fmt.dt(det.data.account.createdAt) }}</dd>
            <dt>Oxirgi kirish</dt><dd>{{ fmt.dt(det.data.account.lastLoginAt) }}</dd>
          </dl>
          <div class="row between"><div class="section-t">Faol sessiyalar ({{ det.data.sessions.length }})</div>
            <button v-if="det.data.sessions.length && !det.data.account.isSuper" class="btn sm danger" @click="revoke(null)">Hammasini bekor qilish</button>
          </div>
          <div v-if="!det.data.sessions.length" class="muted small" style="margin: 8px 0 14px">Faol sessiya yo'q.</div>
          <div v-for="s in det.data.sessions" :key="s.id" class="list-row">
            <Icon name="user" :size="16" />
            <div style="flex: 1; min-width: 0">
              <div class="small" style="font-weight: 600">{{ s.ua || "Noma'lum qurilma" }}</div>
              <div class="small muted">IP {{ s.ip || "—" }} · oxirgi faollik {{ fmt.ago(s.lastUsedAt) }} · ochilgan {{ fmt.dt(s.createdAt) }}</div>
            </div>
            <button v-if="!det.data.account.isSuper" class="btn sm" @click="revoke(s.id)">Bekor qilish</button>
          </div>
          <div class="section-t" style="margin-top: 16px">Faoliyat tarixi (oxirgi 100)</div>
          <DataTable :columns="actCols" :rows="det.data.activity.map((x, i) => ({ ...x, id: i }))">
            <template #severity="{ value }"><span class="badge" :class="value === 'info' ? 'b-good' : value === 'critical' ? 'b-bad' : 'b-warn'">{{ value === "info" ? "ok" : value }}</span></template>
          </DataTable>
        </template>
      </State>
    </Modal>

    <!-- Ruxsatlar -->
    <Modal v-if="perm" :title="perm.a.username + ' — ruxsatlar'" @close="perm = null">
      <div class="stack">
        <div class="note">
          Bu shaxsiy cheklovlar umumiy «Menyu boshqaruvi» sozlamasiga QO'SHIMCHA qo'llanadi. «API» o'chirilsa — bo'limga oid ma'lumotlar
          serverda ham yopiladi; «Menyu» o'chirilsa — faqat chap menyuda ko'rinmaydi. Ma'lumotlar o'chirilmaydi.
        </div>
        <div class="tw">
          <table class="t">
            <thead><tr><th>Bo'lim</th><th>Menyuda</th><th>API / ma'lumot</th></tr></thead>
            <tbody>
              <tr v-for="m in d.modules" :key="m.key">
                <td>{{ m.label }}</td>
                <td><button class="sw" :class="{ on: perm.mods[m.key].menu }" :disabled="!perm.mods[m.key].api" role="switch" :aria-checked="perm.mods[m.key].menu" @click="perm.mods[m.key].menu = !perm.mods[m.key].menu"></button></td>
                <td><button class="sw" :class="{ on: perm.mods[m.key].api }" role="switch" :aria-checked="perm.mods[m.key].api" @click="toggleApi(perm.mods[m.key])"></button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <template #foot>
        <button class="btn" @click="perm = null">Bekor qilish</button>
        <button class="btn pri" :disabled="busy" @click="savePerm">Saqlash</button>
      </template>
    </Modal>

    <!-- Holat -->
    <Modal v-if="askStatus" :title="askStatus.status === 'disabled' ? 'Hisobni faollashtirish' : 'Hisobni vaqtincha bloklash'" @close="askStatus = null">
      <p v-if="askStatus.status !== 'disabled'"><b>{{ askStatus.username }}</b> bloklanadi va barcha faol sessiyalari darhol yopiladi. Ma'lumotlari o'chirilmaydi.</p>
      <p v-else><b>{{ askStatus.username }}</b> yana tizimga kira oladi.</p>
      <template #foot>
        <button class="btn" @click="askStatus = null">Bekor qilish</button>
        <button class="btn" :class="askStatus.status === 'disabled' ? 'pri' : 'danger'" :disabled="busy" @click="setStatus">Tasdiqlash</button>
      </template>
    </Modal>

    <!-- Tiklash havolasi -->
    <Modal v-if="askReset" title="Parolni tiklash" @close="closeReset">
      <div v-if="!resetLink" class="stack">
        <p><b>{{ askReset.username }}</b> uchun bir martalik tiklash havolasi yaratiladi. Eski parol ko'rsatilmaydi va o'zgarmaydi — administrator havolani ochib yangi parol o'rnatgandagina almashadi (shundan so'ng barcha sessiyalari yopiladi).</p>
        <div class="note">Havolani faqat administratorning o'ziga xavfsiz kanal orqali bering. U {{ 30 }} daqiqa amal qiladi va bir marta ishlaydi.</div>
      </div>
      <div v-else class="stack">
        <div class="note warn">Bu havola faqat HOZIR ko'rsatiladi. Nusxa olib, administratorga yuboring.</div>
        <div class="linkbox mono">{{ resetLink.url }}</div>
        <div class="small muted">Amal qilish muddati: {{ fmt.dt(resetLink.expiresAt) }}</div>
      </div>
      <template #foot>
        <button class="btn" @click="closeReset">Yopish</button>
        <button v-if="!resetLink" class="btn pri" :disabled="busy" @click="makeReset">Havola yaratish</button>
        <button v-else class="btn pri" @click="copy(resetLink.url)"><Icon name="copy" :size="14" /> Nusxa olish</button>
      </template>
    </Modal>

    <!-- Ism-familiyani o'zgartirish -->
    <Modal v-if="nameEdit" :title="nameEdit.a.username + ' — ism familiya'" @close="nameEdit = null">
      <div class="stack">
        <label class="fld">Ism<input v-model="nameEdit.firstName" class="inp" autocomplete="off" /></label>
        <label class="fld">Familiya<input v-model="nameEdit.lastName" class="inp" autocomplete="off" /></label>
        <div class="note">Ism-familiya «Faoliyat tarixi» va hisobotlarda shu admin nomi bilan ko'rinadi (eski yozuvlarda ham).</div>
      </div>
      <template #foot>
        <button class="btn" @click="nameEdit = null">Bekor qilish</button>
        <button class="btn pri" :disabled="busy || nameEdit.firstName.trim().length < 2 || nameEdit.lastName.trim().length < 2" @click="saveName">Saqlash</button>
      </template>
    </Modal>

    <!-- O'chirish -->
    <ReauthDialog
      v-if="askDelete"
      title="Administratorni o'chirish"
      ok-text="Butunlay o'chirish"
      danger
      confirm-word="O'CHIRISH"
      :need-otp="!!me?.twoFactor"
      :warning="`${askDelete.fullName || askDelete.username} (login: ${askDelete.username}) butunlay o'chiriladi: u endi tizimga kira olmaydi, ochiq sessiyalari darhol yopiladi. Uning faoliyat tarixi saqlanib qoladi. Buni qaytarib bo'lmaydi.`"
      :action="doDelete"
      @close="askDelete = null"
      @done="afterDelete"
    />

    <!-- Yangi admin -->
    <Modal v-if="newOpen" title="Yangi administrator" @close="closeNew">
      <div v-if="!created" class="stack">
        <label class="fld">Ism<input v-model="nu.firstName" class="inp" placeholder="masalan: Aziz" autocomplete="off" /></label>
        <label class="fld">Familiya<input v-model="nu.lastName" class="inp" placeholder="masalan: Karimov" autocomplete="off" /></label>
        <label class="fld">Login (kirish uchun)<input v-model="nu.username" class="inp" placeholder="masalan: aziz" autocomplete="off" /></label>
        <div class="note">Parolni administratorning o'zi bir martalik havola orqali o'rnatadi — hech kim uni bilmaydi.</div>
      </div>
      <div v-else class="stack">
        <div class="note warn">Administrator yaratildi. Parol o'rnatish havolasi faqat hozir ko'rsatiladi:</div>
        <div class="linkbox mono">{{ created.url }}</div>
      </div>
      <template #foot>
        <button class="btn" @click="closeNew">Yopish</button>
        <button v-if="!created" class="btn pri" :disabled="busy || !nu.username.trim() || nu.firstName.trim().length < 2 || nu.lastName.trim().length < 2" @click="createAdmin">Yaratish</button>
        <button v-else class="btn pri" @click="copy(created.url)"><Icon name="copy" :size="14" /> Nusxa olish</button>
      </template>
    </Modal>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from "vue";
import { api, portalUrl } from "../api.js";
import { fmt, toast } from "../store.js";
import { useLoad } from "../useLoad.js";
import State from "../components/State.vue";
import Modal from "../components/Modal.vue";
import DataTable from "../components/DataTable.vue";
import Icon from "../components/Icon.vue";
import ReauthDialog from "../components/ReauthDialog.vue";

const { data: d, loading, error, reload } = useLoad(() => api("/api/super/admins"));
function initials(a) {
  const p = String(a.fullName || a.username || "?").trim().split(/s+/);
  return ((p[0] || "")[0] || "?").toUpperCase() + ((p[1] || "")[0] || "").toUpperCase();
}
const me = computed(() => (d.value ? d.value.admins.find((a) => a.self) : null));

// Ism-familiya
const nameEdit = ref(null);
function openName(a) {
  const parts = String(a.fullName || "").split(" ");
  nameEdit.value = { a, firstName: a.firstName || parts[0] || "", lastName: a.lastName || parts.slice(1).join(" ") || "" };
}
async function saveName() {
  busy.value = true;
  try {
    await api(`/api/super/admins/${nameEdit.value.a.id}/profile`, {
      method: "POST",
      body: { firstName: nameEdit.value.firstName.trim(), lastName: nameEdit.value.lastName.trim() },
    });
    toast("Ism-familiya saqlandi");
    nameEdit.value = null;
    reload();
  } catch (e) {
    toast(e.message, "error");
  } finally {
    busy.value = false;
  }
}

// O'chirish (Super Admin paroli bilan tasdiqlanadi)
const askDelete = ref(null);
async function doDelete({ password, otp }) {
  return api(`/api/super/admins/${askDelete.value.id}/delete`, {
    method: "POST",
    body: { password, otp, confirm: askDelete.value.username },
  });
}
function afterDelete() {
  toast("Administrator o'chirildi");
  askDelete.value = null;
  reload();
}
const busy = ref(false);
const actCols = [
  { key: "at", label: "Vaqt", fmt: (v) => fmt.dt(v), nowrap: true }, { key: "category", label: "Toifa" }, { key: "text", label: "Amal" },
  { key: "severity", label: "Natija" }, { key: "ip", label: "IP" },
];
function restrictText(a) {
  const m = a.restrictions?.modules;
  if (!m) return a.isSuper ? "cheklanmaydi" : "—";
  const lab = (k) => (d.value.modules.find((x) => x.key === k) || {}).label || k;
  return Object.entries(m).map(([k, v]) => lab(k) + (v.api ? " (menyu)" : " (yopiq)")).join(", ");
}
function modsOf(a) {
  const out = {};
  for (const m of d.value.modules) {
    const r = a.restrictions?.modules?.[m.key];
    out[m.key] = reactive({ menu: r ? r.menu : true, api: r ? r.api : true });
  }
  return reactive(out);
}
function toggleApi(x) {
  x.api = !x.api;
  if (!x.api) x.menu = false;
  else x.menu = true;
}

const det = ref(null);
async function openDetail(a) {
  det.value = { a, loading: true, err: "", data: null };
  try {
    det.value = { a, loading: false, err: "", data: await api("/api/super/admins/" + a.id) };
  } catch (e) {
    det.value = { a, loading: false, err: e.message, data: null };
  }
}
async function revoke(sessionId) {
  try {
    const r = await api(`/api/super/admins/${det.value.a.id}/sessions/revoke`, { method: "POST", body: sessionId ? { sessionId } : { all: true } });
    toast(`${r.revoked} ta sessiya bekor qilindi`);
    await openDetail(det.value.a);
    reload();
  } catch (e) {
    toast(e.message, "error");
  }
}

const perm = ref(null);
async function savePerm() {
  busy.value = true;
  try {
    await api(`/api/super/admins/${perm.value.a.id}/restrictions`, { method: "POST", body: { modules: JSON.parse(JSON.stringify(perm.value.mods)) } });
    toast("Ruxsatlar saqlandi");
    perm.value = null;
    reload();
  } catch (e) {
    toast(e.message, "error");
  } finally {
    busy.value = false;
  }
}

const askStatus = ref(null);
async function setStatus() {
  busy.value = true;
  try {
    const next = askStatus.value.status === "disabled" ? "active" : "disabled";
    await api(`/api/super/admins/${askStatus.value.id}/status`, { method: "POST", body: { status: next } });
    toast(next === "disabled" ? "Hisob bloklandi, sessiyalar yopildi" : "Hisob faollashtirildi");
    askStatus.value = null;
    reload();
  } catch (e) {
    toast(e.message, "error");
  } finally {
    busy.value = false;
  }
}

const askReset = ref(null);
const resetLink = ref(null);
async function makeReset() {
  busy.value = true;
  try {
    const r = await api(`/api/super/admins/${askReset.value.id}/reset-link`, { method: "POST" });
    resetLink.value = { url: portalUrl(r.reset.path), expiresAt: r.reset.expiresAt };
    reload();
  } catch (e) {
    toast(e.message, "error");
  } finally {
    busy.value = false;
  }
}
function closeReset() {
  askReset.value = null;
  resetLink.value = null;
}

const newOpen = ref(false);
const nu = reactive({ username: "", firstName: "", lastName: "" });
const created = ref(null);
async function createAdmin() {
  busy.value = true;
  try {
    const r = await api("/api/super/admins", { method: "POST", body: { ...nu } });
    created.value = { url: portalUrl(r.reset.path) };
    reload();
  } catch (e) {
    toast(e.message, "error");
  } finally {
    busy.value = false;
  }
}
function closeNew() {
  newOpen.value = false;
  created.value = null;
  nu.username = nu.firstName = nu.lastName = "";
}
async function copy(t) {
  try {
    await navigator.clipboard.writeText(t);
    toast("Nusxa olindi");
  } catch {
    toast("Nusxa olinmadi — qo'lda belgilang", "warn");
  }
}
</script>

<style scoped>
.admins { display: grid; gap: 12px; }
.adm { border: 1px solid var(--border); border-radius: var(--r); background: var(--surface-2); padding: 14px; display: grid; gap: 12px; }
.adm.off { opacity: 0.85; }
.adm-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.adm-who { flex: 1; min-width: 160px; display: grid; }
.adm-av { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; font-weight: 800; color: #fff; background: var(--info); flex-shrink: 0; }
.adm-av.sup { background: var(--accent); }
.adm-facts { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 12.5px; color: var(--text-2); }
.adm-facts span { display: inline-flex; align-items: center; gap: 5px; }
.adm-acts { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; border-top: 1px solid var(--border); padding-top: 10px; }
.grow { flex: 1; }
.linkbox { padding: 10px 12px; border: 1px solid var(--border-2); border-radius: 9px; background: var(--surface-2); word-break: break-all; user-select: all; }
</style>
