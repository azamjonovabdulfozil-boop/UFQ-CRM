<template>
  <div class="stack">
    <div class="page-head">
      <p>
        Davomat belgilari talabaning to'lovini qanday hisoblashini shu yerda belgilaysiz. O'zgarish darhol barcha panellarga — adminning
        «Qarzdorlar» va to'lov hisobiga, talabaning to'lov sahifasiga va mentor daromadiga ta'sir qiladi.
      </p>
    </div>

    <State :loading="loading && !d" :error="error" :retry="reload">
      <template v-if="d">
        <!-- Asosiy kalit -->
        <div class="card">
          <div class="card-b">
            <div class="rule">
              <span class="r-ic" :class="{ on: charge }">S</span>
              <div class="r-main">
                <h3>Sababli kelmagan dars uchun pul yechilsinmi?</h3>
                <p class="muted small">
                  Mentor davomatda talabaga <b>«S» — sababli</b> belgisini qo'ysa (kasal bo'ldi, oilaviy sabab va h.k.), o'sha dars to'lovga
                  kiradimi yoki yo'qmi.
                </p>
                <div class="r-state" :class="charge ? 'on' : 'off'">
                  <Icon :name="charge ? 'check' : 'x'" :size="15" />
                  <span v-if="charge"><b>Yoqilgan</b> — sababli dars uchun ham pul yechiladi</span>
                  <span v-else><b>O'chirilgan</b> — sababli dars uchun pul yechilmaydi</span>
                </div>
              </div>
              <button
                class="sw big"
                :class="{ on: charge }"
                role="switch"
                :aria-checked="charge"
                aria-label="Sababli dars uchun pul yechilsin"
                :disabled="busy"
                @click="toggle"
              ></button>
            </div>
          </div>
        </div>

        <!-- Belgilar va misol -->
        <div class="grid g2">
          <div class="card">
            <div class="card-h"><h3>Davomat belgilari</h3></div>
            <div class="card-b">
              <div class="marks">
                <div class="mk"><span class="m k">K</span><div><b>Keldi</b><small>Pul yechiladi</small></div></div>
                <div class="mk"><span class="m y">Y</span><div><b>Kelmadi (sababsiz)</b><small>Pul yechiladi</small></div></div>
                <div class="mk">
                  <span class="m s">S</span>
                  <div><b>Sababli kelmadi</b><small :class="charge ? '' : 'good'">{{ charge ? "Pul yechiladi" : "Pul yechilmaydi" }}</small></div>
                </div>
              </div>
            </div>
          </div>
          <div class="card">
            <div class="card-h"><h3>Misol</h3></div>
            <div class="card-b ex">
              <p>Kurs narxi <b>600 000 so'm</b>, oyda <b>12 dars</b> → 1 dars = <b>50 000 so'm</b>.</p>
              <p>Talaba oy davomida 9 marta keldi (K), 1 marta sababsiz kelmadi (Y), 2 marta sababli kelmadi (S).</p>
              <div class="ex-res">
                <div :class="{ cur: charge }"><span>Yoqilgan bo'lsa</span><b>12 dars × 50 000 = 600 000 so'm</b></div>
                <div :class="{ cur: !charge }"><span>O'chirilgan bo'lsa</span><b>10 dars × 50 000 = 500 000 so'm</b></div>
              </div>
            </div>
          </div>
        </div>

        <div class="note">
          Qoida hisob-kitobga qo'llanadi, davomat belgilarining o'ziga tegmaydi: kalitni istalgan vaqtda qayta yoqib-o'chirsangiz, qarzlar shunga
          ko'ra qayta hisoblanadi. Har bir o'zgarish «Faoliyat tarixi»ga yoziladi.
        </div>
      </template>
    </State>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { api } from "../api.js";
import { toast } from "../store.js";
import { useLoad } from "../useLoad.js";
import State from "../components/State.vue";
import Icon from "../components/Icon.vue";

const { data: d, loading, error, reload } = useLoad(() => api("/api/super/settings"));
const busy = ref(false);
const charge = computed(() => d.value?.settings?.attendance?.chargeExcused !== false);

async function toggle() {
  const next = !charge.value;
  busy.value = true;
  try {
    const r = await api("/api/super/settings/attendance", { method: "POST", body: { chargeExcused: next } });
    d.value.settings.attendance = r.value;
    toast(next ? "Sababli dars uchun pul yechiladi" : "Sababli dars uchun pul yechilmaydi");
  } catch (e) {
    toast(e.message, "error");
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.rule { display: flex; align-items: center; gap: 16px; }
.r-ic {
  width: 52px; height: 52px; border-radius: 14px; flex-shrink: 0; display: grid; place-items: center;
  font-size: 22px; font-weight: 800; background: var(--surface-3); color: var(--text-3);
}
.r-ic.on { background: var(--accent-soft); color: var(--accent-text); }
.r-main { flex: 1; min-width: 0; display: grid; gap: 6px; }
.r-main h3 { margin: 0; font-size: 17px; }
.r-main p { margin: 0; line-height: 1.5; }
.r-state { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; padding: 7px 11px; border-radius: 9px; width: fit-content; }
.r-state.on { background: var(--warn-soft); color: var(--warn); }
.r-state.off { background: var(--good-soft); color: var(--good); }
.sw.big { width: 58px; height: 32px; border-radius: 16px; flex-shrink: 0; }
.sw.big::after { width: 26px; height: 26px; }
.sw.big.on::after { transform: translateX(26px); }
.marks { display: grid; gap: 10px; }
.mk { display: flex; align-items: center; gap: 12px; }
.mk div { display: grid; }
.mk small { color: var(--text-3); font-size: 12px; }
.mk small.good { color: var(--good); font-weight: 700; }
.m { width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center; font-weight: 800; }
.m.k { background: var(--good-soft); color: var(--good); }
.m.y { background: var(--warn-soft); color: var(--warn); }
.m.s { background: var(--info-soft); color: var(--info); }
.ex p { margin: 0 0 8px; font-size: 13.5px; line-height: 1.5; }
.ex-res { display: grid; gap: 8px; margin-top: 6px; }
.ex-res > div { display: grid; gap: 2px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 9px; opacity: 0.6; }
.ex-res > div.cur { opacity: 1; border-color: var(--accent); background: var(--accent-soft); }
.ex-res span { font-size: 12px; color: var(--text-3); }
@media (max-width: 560px) {
  .rule { flex-wrap: wrap; }
}
</style>
