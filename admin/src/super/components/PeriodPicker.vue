<template>
  <div class="pp">
    <div class="chips" role="group" aria-label="Davr">
      <button v-for="[k, l] in PERIODS" :key="k" class="chip" :class="{ on: period.period === k }" @click="pick(k)">{{ l }}</button>
    </div>
    <div v-if="period.period === 'custom'" class="row pp-custom">
      <input v-model="from" type="date" class="inp" aria-label="Boshlanish sanasi" :max="to || undefined" />
      <span class="muted">—</span>
      <input v-model="to" type="date" class="inp" aria-label="Tugash sanasi" :min="from || undefined" />
      <button class="btn sm pri" :disabled="!from || !to || from > to" @click="apply">Qo'llash</button>
    </div>
    <div v-if="label" class="pp-label muted small"><Icon name="calendar" :size="13" /> {{ label }}</div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { period, PERIODS } from "../store.js";
import Icon from "./Icon.vue";
defineProps({ label: String });
const from = ref(period.from);
const to = ref(period.to);
function pick(k) {
  if (k === "custom") {
    period.period = "custom";
    return;
  }
  period.period = k;
}
function apply() {
  period.from = from.value;
  period.to = to.value;
  period.period = "custom";
}
</script>

<style scoped>
.pp { display: grid; gap: 8px; justify-items: end; }
.pp-custom .inp { width: 150px; }
.pp-label { display: flex; align-items: center; gap: 5px; }
@media (max-width: 720px) { .pp { justify-items: start; } }
</style>
