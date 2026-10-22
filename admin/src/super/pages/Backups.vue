<template>
  <div class="stack">
    <div class="page-head">
      <p>
        CRM asosiy ma'lumotining zaxira nusxalari. Tiklash va yuklab olish parol bilan qayta tasdiqlashni talab qiladi va jurnalga yoziladi.
        Tiklashdan oldin joriy holat ham avtomatik nusxalanadi — xato tiklashni ortga qaytarish mumkin.
      </p>
      <button class="btn pri" :disabled="busy" @click="create"><Icon name="plus" :size="15" /> Hozir zaxira olish</button>
    </div>
    <State :loading="loading && !d" :error="error" :retry="reload">
      <template v-if="d">
        <div class="stats">
          <StatCard label="Oxirgi muvaffaqiyatli zaxira" icon="archive" :value="d.lastSuccess ? fmt.ago(d.lastSuccess) : 'yo\'q'" :sub="fmt.dt(d.lastSuccess)"
            :tone="!d.lastSuccess ? 'bad' : Date.now() - new Date(d.lastSuccess) > 7 * 864e5 ? 'warn' : 'good'" />
          <StatCard label="Saqlangan nusxalar" icon="layers" :value="d.backups.length" :sub="`avto ${auto} · qo'lda ${manual}`" />
          <StatCard label="Joriy ma'lumot" icon="db" :value="fmt.int(d.current.weight)" sub="yozuvlar soni (talaba, guruh, davomat…)" />
          <StatCard label="Xatoliklar (14 kun)" icon="alert" :value="d.failures.length" :tone="d.failures.length ? 'bad' : 'good'" sub="zaxira yaratilmagan holatlar" />
        </div>
        <div v-if="d.failures.length" class="note bad">
          <b>Zaxira xatolari:</b>
          <div v-for="(f, i) in d.failures" :key="i">{{ fmt.dt(f.at) }} — {{ f.message }}</div>
        </div>
        <div class="card">
          <div class="card-h"><h3>Siyosat va cheklovlar</h3></div>
          <div class="card-b stack small">
            <div><b>Avtomatik:</b> {{ d.policy.auto }}. Saqlanadi: avto — {{ d.policy.keepAuto }} ta, qo'lda — {{ d.policy.keepManual }} ta.</div>
            <div><b>Qamrov:</b> {{ d.policy.scope }}.</div>
            <div class="note warn"><div v-for="(l, i) in d.policy.limits" :key="i">• {{ l }}</div></div>
          </div>
        </div>
        <div class="card">
          <div class="card-b">
            <DataTable :columns="cols" :rows="d.backups" default-sort="createdAt">
              <template #reason="{ value }"><span class="badge" :class="REASON[value]?.[1] || 'b-mute'">{{ REASON[value]?.[0] || value }}</span></template>
              <template #actions="{ row }">
                <div class="row" style="gap: 6px; flex-wrap: nowrap">
                  <button class="btn sm" @click="askDl = row">Yuklab olish</button>
                  <button class="btn sm danger" @click="askRestore = row">Tiklash</button>
                </div>
              </template>
            </DataTable>
          </div>
        </div>
      </template>
    </State>

    <ReauthDialog
      v-if="askRestore"
      title="Zaxira nusxadan tiklash"
      ok-text="Tiklash"
      danger
      confirm-word="TIKLASH"
      :need-otp="twoFactor"
      :warning="`Joriy CRM ma'lumoti ${fmt.dt(askRestore.createdAt)} holatiga qaytariladi (${askRestore.weight} ta yozuv). Undan keyingi o'zgarishlar yo'qoladi, lekin joriy holat oldin alohida nusxalanadi.`"
      :action="doRestore"
      @close="askRestore = null"
      @done="restored"
    />
    <ReauthDialog
      v-if="askDl"
      title="Zaxira nusxani yuklab olish"
      ok-text="Yuklab olish"
      :need-otp="twoFactor"
      warning="Faylda barcha o'quvchilar, telefon raqamlari va moliyaviy yozuvlar bor. Uni xavfsiz joyda saqlang."
      :action="doDownload"
      @close="askDl = null"
      @done="askDl = null"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { api, download } from "../api.js";
import { fmt, toast } from "../store.js";
import { useLoad } from "../useLoad.js";
import State from "../components/State.vue";
import StatCard from "../components/StatCard.vue";
import DataTable from "../components/DataTable.vue";
import ReauthDialog from "../components/ReauthDialog.vue";
import Icon from "../components/Icon.vue";

const REASON = {
  auto: ["avtomatik", "b-mute"],
  shrink: ["yozuvlar kamayganda", "b-warn"],
  manual: ["qo'lda", "b-acc"],
  "pre-restore": ["tiklashdan oldin", "b-info"],
  "pre-super-edit": ["tahrirdan oldin", "b-mute"],
};
const { data: d, loading, error, reload } = useLoad(() => api("/api/super/backups"));
const busy = ref(false);
const askRestore = ref(null);
const askDl = ref(null);
const twoFactor = ref(false);
onMounted(async () => {
  try {
    twoFactor.value = (await api("/api/super/me")).security.twoFactor;
  } catch {}
});
const auto = computed(() => (d.value?.backups || []).filter((b) => !["manual", "pre-restore"].includes(b.reason)).length);
const manual = computed(() => (d.value?.backups || []).length - auto.value);
const cols = [
  { key: "createdAt", label: "Vaqt", fmt: (v) => fmt.dt(v), nowrap: true },
  { key: "reason", label: "Turi" },
  { key: "weight", label: "Yozuvlar", align: "r" },
  { key: "createdBy", label: "Kim", fmt: (v) => v || "tizim" },
  { key: "actions", label: "", sortable: false },
];
async function create() {
  busy.value = true;
  try {
    await api("/api/super/backups/create", { method: "POST" });
    toast("Zaxira nusxa yaratildi");
    reload();
  } catch (e) {
    toast(e.message, "error");
  } finally {
    busy.value = false;
  }
}
const doRestore = ({ password, otp, confirm }) =>
  api("/api/super/backups/restore", { method: "POST", body: { id: askRestore.value.id, password, otp, confirm } });
function restored(r) {
  askRestore.value = null;
  toast(`Tiklandi (${r.weight} ta yozuv). Oldingi holat ham nusxalandi.`);
  reload();
}
const doDownload = ({ password, otp }) => download(`/api/super/backups/${askDl.value.id}/download`, { method: "POST", body: { password, otp } });
</script>
