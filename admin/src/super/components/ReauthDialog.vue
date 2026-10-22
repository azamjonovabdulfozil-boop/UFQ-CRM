<template>
  <Modal :title="title" @close="$emit('close')">
    <div class="stack">
      <div v-if="warning" class="note warn">{{ warning }}</div>
      <slot />
      <label v-if="confirmWord" class="fld">
        Tasdiqlash uchun <b class="mono">{{ confirmWord }}</b> deb yozing
        <input v-model="word" class="inp" autocomplete="off" />
      </label>
      <label class="fld">
        Parolingiz (qayta tasdiqlash)
        <input v-model="password" type="password" class="inp" autocomplete="current-password" @keydown.enter="submit" />
      </label>
      <label v-if="needOtp" class="fld">
        Authenticator kodi
        <input v-model="otp" class="inp" inputmode="numeric" maxlength="7" autocomplete="one-time-code" @keydown.enter="submit" />
      </label>
      <div v-if="err" class="note bad">{{ err }}</div>
    </div>
    <template #foot>
      <button class="btn" @click="$emit('close')">Bekor qilish</button>
      <button class="btn" :class="danger ? 'danger' : 'pri'" :disabled="busy || !password || (confirmWord && word.trim().toUpperCase() !== confirmWord)" @click="submit">
        <span v-if="busy" class="spin" style="width: 14px; height: 14px"></span>{{ okText }}
      </button>
    </template>
  </Modal>
</template>

<script setup>
import { ref } from "vue";
import Modal from "./Modal.vue";
const props = defineProps({
  title: { type: String, default: "Qayta tasdiqlash" },
  okText: { type: String, default: "Tasdiqlash" },
  warning: String,
  confirmWord: String,
  needOtp: Boolean,
  danger: Boolean,
  action: { type: Function, required: true }, // async ({password, otp, confirm}) => any
});
const emit = defineEmits(["close", "done"]);
const password = ref("");
const otp = ref("");
const word = ref("");
const err = ref("");
const busy = ref(false);
async function submit() {
  if (busy.value || !password.value) return;
  busy.value = true;
  err.value = "";
  try {
    const out = await props.action({ password: password.value, otp: otp.value, confirm: word.value });
    emit("done", out);
  } catch (e) {
    err.value = e.message || String(e);
  } finally {
    busy.value = false;
    password.value = "";
  }
}
</script>
