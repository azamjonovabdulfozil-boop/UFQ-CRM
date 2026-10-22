<template>
  <div class="stack">
    <div class="page-head">
      <p>Davomat, darslar, natijalar, faollik, tizim xatolari va to'liq kiritilmagan ma'lumotlar bo'yicha avtomatik aniqlangan holatlar.</p>
      <PeriodPicker :label="d?.range?.label" />
    </div>
    <div v-if="d" class="note info">
      <b>Qoidaviy tahlil (AI emas).</b> {{ d.ai.note }}
    </div>
    <State :loading="loading && !d" :error="error" :retry="reload" :empty="d && !d.insights.length" empty-title="Hozircha tavsiya yo'q">
      <template v-if="d">
        <div class="chips">
          <button v-for="[k, l] in LEVELS" :key="k" class="chip" :class="{ on: level === k }" @click="level = k">
            {{ l }} ({{ k === "all" ? d.insights.length : d.insights.filter((i) => i.level === k).length }})
          </button>
        </div>
        <div class="grid g2">
          <article v-for="(i, k) in shown" :key="k" class="card ins" :class="i.level">
            <div class="card-b stack" style="gap: 10px">
              <div class="row between">
                <span class="badge" :class="BADGE[i.level][0]"><Icon :name="BADGE[i.level][1]" :size="12" /> {{ BADGE[i.level][2] }}</span>
                <router-link v-if="i.link" :to="linkOf(i.link)" class="small">Ochish <Icon name="right" :size="13" /></router-link>
              </div>
              <h3 style="font-size: 15px">{{ i.title }}</h3>
              <dl class="kv">
                <dt>Raqamlar</dt><dd>{{ i.numbers }}</dd>
                <dt>Tahlil davri</dt><dd>{{ i.period }}</dd>
                <dt>Xulosa sababi</dt><dd class="muted">{{ i.reason }}</dd>
                <dt>Keyingi qadam</dt><dd>{{ i.next }}</dd>
              </dl>
            </div>
          </article>
        </div>
      </template>
    </State>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { api } from "../api.js";
import { periodQuery } from "../store.js";
import { useLoad } from "../useLoad.js";
import State from "../components/State.vue";
import PeriodPicker from "../components/PeriodPicker.vue";
import Icon from "../components/Icon.vue";

const LEVELS = [["all", "Hammasi"], ["alert", "Jiddiy"], ["warn", "Diqqat"], ["info", "Ma'lumot"], ["good", "Ijobiy"]];
const BADGE = {
  alert: ["b-bad", "x", "Jiddiy"],
  warn: ["b-warn", "alert", "Diqqat"],
  info: ["b-info", "info", "Ma'lumot"],
  good: ["b-good", "check", "Ijobiy"],
};
const level = ref("all");
const { data: d, loading, error, reload } = useLoad(() => api("/api/super/insights", { query: periodQuery.value }), { deps: periodQuery });
const shown = computed(() => (d.value?.insights || []).filter((i) => level.value === "all" || i.level === level.value));
function linkOf(l) {
  const q = {};
  if (l.tab) q.tab = l.tab;
  if (l.category) q.category = l.category;
  return { path: "/" + l.page, query: q };
}
</script>

<style scoped>
.ins { border-left: 4px solid var(--border-2); }
.ins.alert { border-left-color: var(--bad); }
.ins.warn { border-left-color: var(--warn); }
.ins.info { border-left-color: var(--info); }
.ins.good { border-left-color: var(--good); }
</style>
