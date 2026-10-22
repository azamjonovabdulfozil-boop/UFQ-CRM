<template>
  <div class="stack">
    <div class="page-head">
      <p>
        O'qituvchilar bir nechta ko'rsatkich bo'yicha baholanadi — bitta raqam bilan emas. Dars yuklamasi, guruhlar soni, boshlang'ich natijalar
        (oldingi davr) va ma'lumot yetarliligi hisobga olinadi. Ma'lumot kam bo'lsa — reytingga kiritilmaydi.
      </p>
      <PeriodPicker :label="d?.range?.label" />
    </div>

    <div class="note warn"><b>Muhim:</b> {{ d?.note || "Reyting tahlil va inson tomonidan ko'rib chiqish uchun xizmat qiladi. U ishga qabul qilish, ishdan bo'shatish yoki jazolash qarorini avtomatik qabul qilmaydi." }}</div>

    <State :loading="loading && !d" :error="error" :retry="reload">
      <template v-if="d">
        <div class="card">
          <div class="card-h">
            <h3><Icon name="gear" :size="16" /> Reyting mezonlari va formulasi</h3>
            <button class="btn sm" @click="editW = !editW">{{ editW ? "Yopish" : "Og'irliklarni sozlash" }}</button>
          </div>
          <div class="card-b stack">
            <div class="small">
              <b>Umumiy ball (0–100)</b> = Σ (mezon qiymati × og'irlik) / Σ og'irlik — faqat hisoblangan mezonlar bo'yicha.
              Hisoblanmagan mezon tashlab ketiladi va og'irligi qolganlariga taqsimlanadi. Davr: <b>{{ d.range.label }}</b>; taqqoslash:
              <b>{{ d.prevRange.label }}</b>.
            </div>
            <div class="crit">
              <div v-for="c in d.criteria" :key="c.key" class="crit-i">
                <div class="row between">
                  <b>{{ c.label }}</b>
                  <span class="badge b-acc">{{ weights[c.key] }}</span>
                </div>
                <div class="small muted">{{ c.formula }}</div>
                <input v-if="editW" v-model.number="weights[c.key]" type="range" min="0" max="100" step="5" :aria-label="c.label + ' og\'irligi'" />
              </div>
            </div>
            <div class="small muted">
              Ishonchlilik: <span class="badge b-good">ishonchli</span> — ≥ {{ d.ranking.minMarksHigh }} davomat belgisi va ≥ 3 mezon;
              <span class="badge b-warn">taxminiy</span> — ≥ {{ d.ranking.minMarks }} belgi va ≥ 2 mezon; qolganlar reytingga kirmaydi.
              {{ d.homeworkNote }}
            </div>
            <div v-if="editW" class="row">
              <label class="fld" style="width: 160px">Min. belgi (taxminiy)<input v-model.number="minMarks" type="number" min="1" class="inp" /></label>
              <label class="fld" style="width: 160px">Min. belgi (ishonchli)<input v-model.number="minMarksHigh" type="number" min="1" class="inp" /></label>
              <button class="btn pri" :disabled="saving" @click="saveWeights">Saqlash va qayta hisoblash</button>
              <button class="btn" @click="resetW">Bekor qilish</button>
            </div>
          </div>
        </div>

        <div class="row between">
          <div class="chips">
            <button v-for="[k, l] in SORTS" :key="k" class="chip" :class="{ on: sort === k }" @click="sort = k">{{ l }}</button>
          </div>
          <span class="small muted">{{ ranked.length }} ta o'qituvchi reytingda · {{ unranked.length }} tasida ma'lumot yetarli emas</span>
        </div>

        <div class="card">
          <div class="card-b">
            <div class="tw">
              <table class="t">
                <thead>
                  <tr>
                    <th>#</th><th>O'qituvchi</th><th class="r">Ball</th><th>Ishonch</th><th class="r">Guruh</th><th class="r">O'quvchi</th>
                    <th class="r">O'tilgan dars</th><th class="r">Reja bajarilishi</th><th class="r">O'z vaqtida</th><th class="r">Davomat</th>
                    <th class="r">Baho o'zg.</th><th class="r">Barqarorlik</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="(t, i) in sorted" :key="t.id">
                    <tr class="click" @click="open = open === t.id ? null : t.id">
                      <td><span class="rank" :class="'r' + (t.rank || 0)">{{ t.rank || "—" }}</span></td>
                      <td><b>{{ t.name }}</b><div class="small muted">{{ t.subject }}</div></td>
                      <td class="r"><b>{{ t.score == null ? "—" : fmt.n(t.score) }}</b></td>
                      <td>
                        <span class="badge" :class="t.confidence === 'high' ? 'b-good' : t.confidence === 'low' ? 'b-warn' : 'b-mute'">
                          {{ t.confidence === "high" ? "ishonchli" : t.confidence === "low" ? "taxminiy" : "ma'lumot kam" }}
                        </span>
                      </td>
                      <td class="r">{{ t.activeGroups }}</td>
                      <td class="r">{{ t.students }}</td>
                      <td class="r">{{ t.lessons.held }}</td>
                      <td class="r">{{ fmt.pct(t.metrics.marking) }}</td>
                      <td class="r">{{ fmt.pct(t.metrics.ontime) }}</td>
                      <td class="r">{{ fmt.pct(t.metrics.attendance) }}</td>
                      <td class="r" :class="t.trend > 0 ? 'up' : t.trend < 0 ? 'down' : ''">{{ t.trend == null ? "—" : fmt.delta(t.trend) }}</td>
                      <td class="r">{{ fmt.pct(t.metrics.stability) }}</td>
                      <td><Icon :name="open === t.id ? 'up' : 'down'" :size="15" /></td>
                    </tr>
                    <tr v-if="open === t.id">
                      <td colspan="13" class="detail">
                        <div class="grid g3">
                          <div>
                            <div class="section-t">Ball tarkibi</div>
                            <div v-if="!t.parts.length" class="small muted" style="margin-top: 8px">Hisoblangan mezon yo'q.</div>
                            <div v-for="p in t.parts" :key="p.key" class="part">
                              <span>{{ critLabel(p.key) }}</span>
                              <div class="meter"><i :style="{ width: p.value + '%' }"></i></div>
                              <span class="small">{{ fmt.n(p.value) }} × {{ p.share }}%</span>
                            </div>
                          </div>
                          <div>
                            <div class="section-t">Yuklama va kontekst</div>
                            <dl class="kv" style="margin-top: 8px">
                              <dt>Biriktirilgan guruhlar</dt><dd>{{ t.groups.map((g) => g.name + (g.archived ? " (arxiv)" : "")).join(", ") || "—" }}</dd>
                              <dt>Rejadagi / o'tilgan</dt><dd>{{ t.lessons.plannedPast }} / {{ t.lessons.held }} (qoldirilgan: {{ t.lessons.missed }})</dd>
                              <dt>O'z vaqtida belgilangan</dt><dd>{{ t.lessons.logged ? `${t.lessons.onTime} / ${t.lessons.logged}, o'rtacha kechikish ${fmt.n(t.lessons.avgLateDays)} kun` : "jurnalda ma'lumot yetarli emas" }}</dd>
                              <dt>Davomat belgilari</dt><dd>{{ t.sample }} (K {{ t.att.K }}, Y {{ t.att.Y }}, S {{ t.att.S }})</dd>
                              <dt>Faol haftalar</dt><dd>{{ t.weeksHeld }} / {{ t.weeksPlanned }}</dd>
                            </dl>
                          </div>
                          <div>
                            <div class="section-t">Natijalar dinamikasi</div>
                            <dl class="kv" style="margin-top: 8px">
                              <dt>O'rtacha baho</dt><dd>{{ fmt.n(t.avgGrade) }} (oldingi davr: {{ fmt.n(t.prevAvgGrade) }})</dd>
                              <dt>Baholar soni</dt><dd>{{ t.gradeN }} (o'zi qo'ygan: {{ t.gradesGiven }})</dd>
                              <dt>Davomat o'zgarishi</dt><dd>{{ t.attDelta == null ? "ma'lumot yetarli emas" : fmt.delta(t.attDelta, " p.p.") }}</dd>
                              <dt>Test o'rtacha</dt><dd>{{ fmt.pct(t.avgTest) }}</dd>
                              <dt>Uy vazifalari</dt><dd class="muted">modul yo'q</dd>
                            </dl>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </template>
                  <tr v-if="!sorted.length"><td colspan="13" class="muted" style="text-align: center; padding: 24px">O'qituvchilar yo'q</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </template>
    </State>
  </div>
</template>

<script setup>
import { ref, computed, reactive, watch } from "vue";
import { api } from "../api.js";
import { periodQuery, fmt, toast } from "../store.js";
import { useLoad } from "../useLoad.js";
import State from "../components/State.vue";
import PeriodPicker from "../components/PeriodPicker.vue";
import Icon from "../components/Icon.vue";

const SORTS = [
  ["score", "Umumiy ball"],
  ["attendance", "Davomat yuqori"],
  ["held", "Eng ko'p dars o'tgan"],
  ["ontime", "Darsni tez belgilaydi"],
  ["trend", "Natijasi ko'p yaxshilangan"],
  ["stability", "Barqaror ishlaydi"],
];
const sort = ref("score");
const open = ref(null);
const editW = ref(false);
const saving = ref(false);
const weights = reactive({});
const minMarks = ref(10);
const minMarksHigh = ref(30);

const { data: d, loading, error, reload } = useLoad(() => api("/api/super/teachers", { query: periodQuery.value }), { deps: periodQuery });
function resetW() {
  if (!d.value) return;
  Object.assign(weights, d.value.ranking.weights);
  minMarks.value = d.value.ranking.minMarks;
  minMarksHigh.value = d.value.ranking.minMarksHigh;
  editW.value = false;
}
watch(d, () => !editW.value && resetW());
const critLabel = (k) => (d.value?.criteria.find((c) => c.key === k) || {}).label || k;
const val = (t) =>
  ({
    score: t.score,
    attendance: t.metrics.attendance,
    held: t.lessons.held,
    ontime: t.metrics.ontime,
    trend: t.trend,
    stability: t.metrics.stability,
  })[sort.value];
const sorted = computed(() =>
  (d.value?.teachers || []).slice().sort((a, b) => {
    const x = val(a), y = val(b);
    if (x == null && y == null) return a.name.localeCompare(b.name);
    if (x == null) return 1;
    if (y == null) return -1;
    return y - x;
  }),
);
const ranked = computed(() => (d.value?.teachers || []).filter((t) => t.score != null));
const unranked = computed(() => (d.value?.teachers || []).filter((t) => t.score == null));
async function saveWeights() {
  saving.value = true;
  try {
    await api("/api/super/teachers/criteria", { method: "POST", body: { weights: { ...weights }, minMarks: minMarks.value, minMarksHigh: minMarksHigh.value } });
    toast("Mezonlar saqlandi — reyting qayta hisoblandi");
    editW.value = false;
    await reload();
  } catch (e) {
    toast(e.message, "error");
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.crit { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; }
.crit-i { border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; display: grid; gap: 4px; background: var(--surface-2); }
.crit-i input[type="range"] { width: 100%; accent-color: var(--accent); }
.rank { display: inline-grid; place-items: center; width: 26px; height: 26px; border-radius: 8px; background: var(--surface-3); font-weight: 800; font-size: 12px; }
.rank.r1 { background: #f5c542; color: #4a3500; }
.rank.r2 { background: #cfd5df; color: #2b3240; }
.rank.r3 { background: #e0a46f; color: #3d2208; }
td.detail { background: var(--surface-2); padding: 16px; }
.part { display: grid; grid-template-columns: 1fr 80px 90px; gap: 8px; align-items: center; font-size: 12.5px; margin-top: 8px; }
</style>
