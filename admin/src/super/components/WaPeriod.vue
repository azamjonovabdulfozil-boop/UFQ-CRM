<template>
  <div class="wp">
    <div class="chips" role="group" aria-label="Davr">
      <button v-for="[k, l] in WA_PERIODS" :key="k" class="chip" :class="{ on: waPeriod.period === k }" @click="pick(k)">{{ l }}</button>
    </div>
    <div v-if="waPeriod.period === 'custom'" class="row wp-c">
      <input v-model="from" type="date" class="inp" aria-label="Boshlanish" :max="to || undefined" />
      <span class="muted">—</span>
      <input v-model="to" type="date" class="inp" aria-label="Tugash" :min="from || undefined" />
      <button class="btn sm pri" :disabled="!from || !to || from > to" @click="apply">Qo'llash</button>
    </div>
    <div v-if="label" class="muted small wp-l">{{ label }}<template v-if="prevLabel"> · solishtirish: {{ prevLabel }}</template></div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { waPeriod, WA_PERIODS } from "../wa.js";
defineProps({ label: String, prevLabel: String });
const from = ref(waPeriod.from);
const to = ref(waPeriod.to);
function pick(k) {
  waPeriod.period = k;
}
function apply() {
  waPeriod.from = from.value;
  waPeriod.to = to.value;
  waPeriod.period = "custom";
}
</script>

<style scoped>
.wp { display: grid; gap: 8px; justify-items: end; }
.wp-c .inp { width: 150px; }
@media (max-width: 720px) { .wp { justify-items: start; } }
</style>
