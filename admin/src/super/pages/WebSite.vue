<template>
  <div class="stack">
    <State :loading="loading && !d" :error="error" :retry="reload">
      <template v-if="d">
        <!-- ── Sarlavha ── -->
        <div class="card ws-head">
          <div class="ws-head-l">
            <router-link to="/web" class="small muted"><Icon name="left" :size="13" /> Barcha saytlar</router-link>
            <h2>{{ site.name }}</h2>
            <div class="row small">
              <a :href="site.url" target="_blank" rel="noopener noreferrer" class="mono">{{ site.host }} <Icon name="external" :size="12" /></a>
              <TrackBadge :site="site" />
              <HealthBadge :h="site.health" />
            </div>
          </div>
          <div class="ws-head-r">
            <div class="row">
              <button class="btn sm" :disabled="loading" @click="reload()"><Icon name="refresh" :size="14" /> Yangilash</button>
              <button class="btn sm" @click="editing = true"><Icon name="gear" :size="14" /> Sozlamalar</button>
              <select v-model="exportKind" class="sel sm-sel" aria-label="Excel uchun yuklab olish" @change="doExport">
                <option value="">Yuklab olish (Excel/CSV)…</option>
                <option value="sessions">Barcha tashriflar</option>
                <option value="pageviews">Ochilgan sahifalar</option>
                <option value="events">Barcha harakatlar</option>
                <option value="pages">Sahifalar jadvali</option>
                <option value="sources">Qayerdan kelganlar jadvali</option>
                <option value="campaigns">Reklama jadvali</option>
              </select>
            </div>
            <WaPeriod :label="d.range.label" :prev-label="prevLabel" />
          </div>
        </div>

        <!-- ── Kod hali o'rnatilmagan ── -->
        <div v-if="!site.firstEventAt" class="card install">
          <div class="card-h"><h3><Icon name="info" :size="16" /> Statistika hali yig'ilmayapti — saytga kuzatuv kodini qo'ying</h3></div>
          <div class="card-b">
            <InstallGuide :site="site" :checking="checking" @check="checkNow" />
          </div>
        </div>

        <!-- ── Qisqa xulosa ── -->
        <div v-if="site.firstEventAt" class="card summary">
          <div class="card-h"><h3><Icon name="spark" :size="16" /> Qisqa xulosa</h3><span class="card-sub">{{ d.range.label }}{{ anyFilter ? " · filtr bilan" : "" }}</span></div>
          <div class="card-b">
            <ul class="sum-list">
              <li v-for="(x, i) in summary" :key="i" :class="x.tone">
                <span class="sum-ic"><Icon :name="x.icon" :size="15" /></span>
                <span v-html="x.html"></span>
              </li>
            </ul>
          </div>
        </div>

        <!-- ── Filtrlar ── -->
        <div class="card ws-filters">
          <div class="row">
            <b class="small">Faqat shularni ko'rsatish:</b>
            <select v-model="flt.source" class="sel" aria-label="Qayerdan kelgan"><option value="">Qayerdan: hammasi</option><option v-for="x in opt.sources" :key="x">{{ x }}</option></select>
            <select v-model="flt.campaign" class="sel" aria-label="Reklama"><option value="">Reklama: hammasi</option><option v-for="x in opt.campaigns" :key="x">{{ x }}</option></select>
            <select v-model="flt.device" class="sel" aria-label="Qurilma"><option value="">Qurilma: hammasi</option><option v-for="x in opt.devices" :key="x">{{ x }}</option></select>
            <select v-model="flt.page" class="sel" aria-label="Sahifa"><option value="">Sahifa: hammasi</option><option v-for="x in opt.pages" :key="x">{{ x }}</option></select>
            <select v-model="flt.event" class="sel" aria-label="Harakat"><option value="">Harakat: hammasi</option><option v-for="x in opt.events" :key="x" :value="x">{{ EVENT_LABEL[x] || x }}</option></select>
            <button v-if="anyFilter" class="btn sm ghost" @click="clearFilters"><Icon name="x" :size="13" /> Filtrni olib tashlash</button>
            <span v-if="loading" class="spin" style="width: 16px; height: 16px"></span>
          </div>
          <nav class="ws-nav" aria-label="Bo'limlar">
            <a v-for="[sid, l] in SECTIONS" :key="sid" :href="'#' + sid" class="chip" @click.prevent="jump(sid)">{{ l }}</a>
          </nav>
        </div>
        <div v-if="d.truncated" class="note warn">Tanlangan davr juda katta — hisobot birinchi 300 000 yozuv bo'yicha. Aniqroq natija uchun qisqaroq davr tanlang.</div>

        <!-- 1. Asosiy ko'rsatkichlar -->
        <section id="s-overview" class="stack">
          <div>
            <h3 class="ws-sec">Asosiy ko'rsatkichlar</h3>
            <p class="ws-desc">Kichik rangli belgi — oldingi shunday davrga nisbatan o'zgarish (yashil — yaxshi, qizil — yomon).</p>
          </div>
          <div class="kpis">
            <KpiCard label="Tashriflar" desc="Saytga necha marta kirishgan" :value="num(c.sessions)" :delta="ch('sessions')" :prev-text="num(p.sessions)" :spark="d.kpis.spark.sessions" />
            <KpiCard label="Kelgan odamlar" desc="Har bir qurilma bir kishi deb sanaladi" :value="num(c.visitors)" :delta="ch('visitors')" :prev-text="num(p.visitors)" :spark="d.kpis.spark.visitors" />
            <KpiCard label="Hozir saytda" desc="Oxirgi 5 daqiqada faol bo'lganlar" :value="num(rt?.activeSessions)" live />
            <KpiCard label="Saytda o'rtacha vaqt" desc="Bir kirishda qancha qolishgan" :value="dur(c.avgDuration)" :delta="ch('avgDuration')" :prev-text="dur(p.avgDuration)" />
            <KpiCard label="Darhol chiqib ketganlar" desc="1 sahifani ko'rib, 10 soniyada chiqqanlar. Qancha kam — shuncha yaxshi" :value="pct(c.bounceRate)" :delta="ch('bounceRate')" :prev-text="pct(p.bounceRate)" :up-is-good="false" />
            <KpiCard label="Natijalar" desc="Ariza, xarid, qo'ng'iroq va boshqa maqsadlar" :value="num(c.conversions)" :delta="ch('conversions')" :prev-text="num(p.conversions)" :spark="d.kpis.spark.conversions" />
            <template v-if="showMore">
              <KpiCard label="Ochilgan sahifalar" desc="Jami nechta sahifa ko'rilgan" :value="num(c.pageviews)" :delta="ch('pageviews')" :prev-text="num(p.pageviews)" :spark="d.kpis.spark.pageviews" />
              <KpiCard label="Birinchi marta kelganlar" desc="Saytga ilk bor kirganlar" :value="num(c.newSessions)" :delta="ch('newSessions')" :prev-text="num(p.newSessions)" />
              <KpiCard label="Qaytib kelganlar" desc="Avval ham kirgan odamlar" :value="num(c.returningSessions)" :delta="ch('returningSessions')" :prev-text="num(p.returningSessions)" />
              <KpiCard label="Bir kirishda sahifalar" desc="O'rtacha nechta sahifa ko'rishgan" :value="c.pagesPerSession ?? '—'" :delta="ch('pagesPerSession')" :prev-text="String(p.pagesPerSession ?? '—')" />
              <KpiCard label="Natija foizi" desc="100 tashrifdan nechtasi natija berdi" :value="pct(c.conversionRate)" :delta="ch('conversionRate')" :prev-text="pct(p.conversionRate)" />
              <KpiCard label="Arizalar" desc="Qoldirilgan arizalar soni" :value="num(c.leads)" :delta="ch('leads')" :prev-text="num(p.leads)" />
              <KpiCard label="Sotuvdan tushum" desc="Saytda qilingan xaridlar summasi" :value="c.revenue > 0 || p.revenue > 0 ? money(c.revenue) : '—'" :delta="c.revenue > 0 ? ch('revenue') : null" :sub="c.revenue > 0 ? '' : 'xarid ma\'lumoti kelmagan'" />
            </template>
          </div>
          <div class="row">
            <button class="btn sm ghost" @click="toggleMore">{{ showMore ? "Kamroq ko'rsatish" : "Yana 7 ta ko'rsatkich" }} <Icon :name="showMore ? 'up' : 'down'" :size="13" /></button>
            <span v-if="c.sessions && c.estimatedEnd" class="muted small">{{ num(c.estimatedEnd) }} ta tashrifda odam brauzerni yopib chiqib ketdi — ularning vaqti taxminan hisoblandi.</span>
          </div>
        </section>

        <!-- 2. Kirishlar dinamikasi -->
        <section id="s-traffic" class="stack">
          <div>
            <h3 class="ws-sec">Kirishlar qanday o'zgardi</h3>
            <p class="ws-desc">Aniq sonni ko'rish uchun grafik ustiga sichqonchani olib boring (telefonda — barmoq bilan bosing).</p>
          </div>
          <div class="card">
            <div class="card-h"><h3>{{ d.timeseries.hourly ? "Soatlar" : "Kunlar" }} bo'yicha kirishlar</h3></div>
            <div class="card-b"><LineChart :labels="tsLabels" :tip-labels="d.timeseries.labels" :series="[{ name: 'Tashriflar', values: d.timeseries.sessions }, { name: 'Kelgan odamlar', values: d.timeseries.visitors }]" aria-label="Kirishlar" /></div>
          </div>
          <div class="grid g2">
            <div class="card">
              <div class="card-h"><h3>Yangi va qaytib kelganlar</h3></div>
              <div class="card-b">
                <LineChart :labels="tsLabels" :tip-labels="d.timeseries.labels" :series="[{ name: 'Birinchi marta kelganlar', values: d.timeseries.newSessions }, { name: 'Qaytib kelganlar', values: d.timeseries.returningSessions }]" :height="200" aria-label="Yangi va qaytgan" />
                <p class="muted small chart-note">Qaytib kelganlar ko'p bo'lsa — sayt odamlarga yoqyapti.</p>
              </div>
            </div>
            <div class="card">
              <div class="card-h"><h3>Kunning qaysi soatida ko'p kirishadi</h3><span class="card-sub">{{ site.timezone }} vaqti</span></div>
              <div class="card-b">
                <ColumnChart :labels="HOURS" :tip-labels="HOUR_TIPS" :values="d.hourly" name="Tashriflar" :height="200" aria-label="Soatlar bo'yicha" />
                <p class="muted small chart-note">Eng baland ustun — reklama yoki post joylash uchun eng yaxshi vaqt.</p>
              </div>
            </div>
          </div>
        </section>

        <!-- 3. Qayerdan keldi -->
        <section id="s-sources" class="stack">
          <div>
            <h3 class="ws-sec">Odamlar qayerdan keldi</h3>
            <p class="ws-desc">Qatorni bossangiz — butun sahifa faqat shu manba bo'yicha ko'rsatiladi.</p>
          </div>
          <div class="grid g2">
            <div class="card">
              <div class="card-h"><h3>Manbalar</h3><span class="card-sub">Instagram, Telegram, Google…</span></div>
              <div class="card-b"><BarList :items="bars(d.sources, 'source')" /></div>
            </div>
            <div class="card">
              <div class="card-h"><h3>Guruhlab</h3><span class="card-sub">ijtimoiy tarmoq, qidiruv, reklama…</span></div>
              <div class="card-b"><BarList :items="bars(d.channels)" /></div>
            </div>
          </div>
          <div class="card">
            <div class="card-h"><h3>Batafsil jadval</h3></div>
            <div class="card-b"><DataTable :columns="srcCols" :rows="rowsKey(d.sources)" default-sort="sessions" empty-text="Bu davrda tashrif yo'q" /></div>
          </div>
          <p class="muted small">«To'g'ridan-to'g'ri» — manzilni o'zi yozgan yoki saqlangan havoladan kirgan. «Noma'lum» — qayerdan kelgani aniqlanmagan. Taxmin qilinmaydi.</p>
        </section>

        <!-- 4. Sahifalar -->
        <section id="s-pages" class="stack">
          <div>
            <h3 class="ws-sec">Sahifalar</h3>
            <p class="ws-desc">Qaysi sahifalar ko'p ochiladi va qaysilarida odamlar saytni tark etadi.</p>
          </div>
          <div class="grid g3">
            <div class="card">
              <div class="card-h"><h3>Birinchi ochilgan sahifalar</h3></div>
              <div class="card-b"><BarList :items="d.landing.slice(0, 8).map((x) => ({ label: x.key, value: x.sessions, sub: 'darhol chiqqan: ' + pct(x.bounceRate), onClick: () => (flt.page = x.key) }))" /></div>
            </div>
            <div class="card">
              <div class="card-h"><h3>Saytdan chiqib ketilgan sahifalar</h3></div>
              <div class="card-b"><BarList :items="exitPages.slice(0, 8).map((x) => ({ label: x.path, value: x.exits, sub: 'ochganlarning ' + pct(x.exitRate) + ' shu yerda chiqdi' }))" /></div>
            </div>
            <div class="card">
              <div class="card-h"><h3>Muammoli sahifalar</h3><span class="card-sub">ko'pchilik shu yerda chiqib ketadi</span></div>
              <div class="card-b"><BarList :items="highExit.map((x) => ({ label: x.path, value: x.exitRate, text: pct(x.exitRate), sub: x.sessions + ' ta tashrifdan' }))" :max="100" /></div>
            </div>
          </div>
          <div class="card">
            <div class="card-h"><h3>Barcha sahifalar</h3><span class="card-sub">batafsil ko'rish uchun qatorni bosing</span></div>
            <div class="card-b">
              <DataTable :columns="pageCols" :rows="pageRows" clickable default-sort="views" searchable search-placeholder="Sahifa qidirish…" @row="(r) => (pageSel = r)" empty-text="Hali sahifa ochilmagan">
                <template #path="{ row }"><span class="mono">{{ row.path }}</span><div v-if="row.title" class="small muted ell">{{ row.title }}</div></template>
              </DataTable>
            </div>
          </div>
        </section>

        <!-- 5. Saytdagi yo'l -->
        <section id="s-journey" class="stack">
          <div>
            <h3 class="ws-sec">Odamlar saytda qanday yurdi</h3>
            <p class="ws-desc">Chapdan o'ngga: qayerdan keldi → qaysi sahifalarni ochdi → natija berdimi yoki chiqib ketdimi. Chiziq qancha qalin bo'lsa, shuncha ko'p odam o'tgan.</p>
          </div>
          <div class="card">
            <div class="card-b">
              <JourneyFlow :flow="d.journey" @select="onNode" />
              <div v-if="nodeSel" class="note info" style="margin-top: 10px">
                <b>{{ nodeSel.label }}</b> — {{ nodeSel.value }} ta tashrif.
                <template v-if="nodePage">
                  Ochilgan: <b>{{ num(nodePage.views) }}</b> marta · birinchi sahifa bo'lgan: <b>{{ num(nodePage.entries) }}</b> · shu yerda chiqib ketgan: <b>{{ num(nodePage.exits) }}</b> ({{ pct(nodePage.exitRate) }}) · o'rtacha vaqt: <b>{{ dur(nodePage.avgTime) }}</b>
                  <button class="btn sm" style="margin-left: 8px" @click="pageSel = nodePage">Batafsil</button>
                </template>
              </div>
            </div>
          </div>
          <div class="card">
            <div class="card-h"><h3>Eng ko'p takrorlangan yo'llar</h3></div>
            <div class="card-b">
              <div v-if="!d.journey.topPaths.length" class="muted small">Ma'lumot hali yetarli emas</div>
              <div v-for="(x, i) in d.journey.topPaths" :key="i" class="list-row jp">
                <span class="mono small">{{ x.path }}</span>
                <b class="small">{{ x.n }} ta <span class="muted">({{ pct(x.share) }})</span></b>
              </div>
            </div>
          </div>
        </section>

        <!-- 6. Reklama -->
        <section id="s-campaigns" class="stack">
          <div>
            <h3 class="ws-sec">Reklama samaradorligi</h3>
            <p class="ws-desc">
              Reklama havolasiga <code>?utm_campaign=nomi</code> qo'shilsa, o'sha reklamadan kelganlar shu yerda alohida ko'rinadi. Masalan: <code>{{ site.host }}/?utm_source=instagram&amp;utm_campaign=kuz_aksiya</code>
            </p>
          </div>
          <div class="kpis">
            <KpiCard label="Reklamaga sarflangan" desc="Siz kiritgan xarajatlar" :value="d.spend.rows ? money(d.spend.total) : '—'" :delta="d.spend.rows ? change(d.spend.total, d.spend.prev) : null" :up-is-good="false" :sub="d.spend.rows ? '' : 'xarajat hali kiritilmagan'" />
            <KpiCard label="Reklamalar soni" desc="Odam olib kelgan reklamalar" :value="num(d.campaigns.filter((x) => x.sessions).length)" />
            <KpiCard label="Reklamadan natijalar" desc="Reklama orqali kelib natija berganlar" :value="num(campConv)" />
            <KpiCard label="Reklama qaytimi" desc="Reklamaga 1 so'm sarflab, necha so'm tushum olindi" :value="totalRoas == null ? '—' : totalRoas + ' so\'m'" />
          </div>
          <div class="card">
            <div class="card-h"><h3>Har bir reklama bo'yicha</h3><button class="btn sm" @click="spendOpen = true"><Icon name="plus" :size="13" /> Reklama xarajatini kiritish</button></div>
            <div class="card-b">
              <DataTable :columns="campCols" :rows="d.campaigns.map((x, i) => ({ ...x, id: i }))" default-sort="sessions" empty-text="Reklama belgili (utm_campaign) havoladan hali hech kim kirmagan" />
              <p class="muted small" style="margin-top: 8px">
                <b>Natija foizi</b> — 100 tashrifdan nechtasi natija berdi. <b>1 natija narxi</b> — xarajat ÷ natijalar soni. <b>Qaytim</b> — tushum ÷ xarajat (1 dan katta bo'lsa, reklama o'zini oqlagan).
                Xarajat, ko'rishlar va bosishlar faqat siz kiritgan ma'lumotdan olinadi; bo'lmasa «—».
              </p>
            </div>
          </div>
          <div v-if="roasBars.length" class="card">
            <div class="card-h"><h3>Reklamalardan tushum</h3></div>
            <div class="card-b"><BarList :items="roasBars" /></div>
          </div>
        </section>

        <!-- 7. Natijalar -->
        <section id="s-conv" class="stack">
          <div>
            <h3 class="ws-sec">Natijalar va arizalar</h3>
            <p class="ws-desc">Natija — tashrif buyuruvchi siz kutgan ishni qilgani: ariza qoldirdi, xarid qildi, qo'ng'iroq tugmasini bosdi.</p>
          </div>
          <div class="grid g2">
            <div class="card">
              <div class="card-h"><h3>Kirgandan natijagacha</h3><span class="card-sub">har bosqichda nechta odam qoldi</span></div>
              <div class="card-b">
                <div v-for="(f, i) in d.funnel" :key="i" class="fn-row">
                  <div class="fn-l"><b>{{ f.label }}</b><span class="small muted">{{ i ? "oldingi bosqichdan " + pct(f.ofPrev) + " o'tdi" : "hamma tashriflar" }}</span></div>
                  <div class="fn-bar"><i :style="{ width: Math.max(1.5, f.ofTotal || 0) + '%' }"></i></div>
                  <div class="fn-v">{{ num(f.value) }} <span class="small muted">{{ pct(f.ofTotal) }}</span></div>
                </div>
              </div>
            </div>
            <div class="card">
              <div class="card-h"><h3>Natijalar {{ d.timeseries.hourly ? "soatlar" : "kunlar" }} bo'yicha</h3></div>
              <div class="card-b"><ColumnChart :labels="tsLabels" :tip-labels="d.timeseries.labels" :values="d.timeseries.conversions" name="Natijalar" :height="190" color="var(--s3)" empty-text="Bu davrda natija bo'lmadi" /></div>
            </div>
          </div>
          <div class="card">
            <div class="card-h"><h3>Siz belgilagan natijalar</h3><button class="btn sm" @click="editing = true"><Icon name="gear" :size="13" /> Natijalarni sozlash</button></div>
            <div class="card-b">
              <div v-if="!d.goals.length" class="note info small">
                Hali belgilanmagan. «Natijalarni sozlash» tugmasini bosing va masalan «Ariza formasi yuborilsa»ni tanlang — shunda qaysi reklama va sahifa ariza keltirayotgani ko'rinadi.
              </div>
              <BarList :items="d.goals.map((g) => ({ label: g.name, sub: goalText(g), value: g.sessions, text: g.sessions + ' ta' }))" />
            </div>
          </div>
          <div class="card">
            <div class="card-h"><h3>Natija bergan sahifalar</h3><span class="card-sub">natijadan oldin qaysi sahifalar ochilgan</span></div>
            <div class="card-b"><BarList :items="convPages" /></div>
          </div>
        </section>

        <!-- 8. Qurilmalar -->
        <section id="s-devices" class="stack">
          <div>
            <h3 class="ws-sec">Qurilmalar va brauzerlar</h3>
            <p class="ws-desc">Telefondan kirganlar ko'p bo'lsa, saytni avvalo telefonda tekshirib turing.</p>
          </div>
          <div class="grid g3">
            <div class="card"><div class="card-h"><h3>Qurilma</h3></div><div class="card-b"><BarList :items="bars(d.devices, 'device')" /></div></div>
            <div class="card"><div class="card-h"><h3>Brauzer</h3></div><div class="card-b"><BarList :items="bars(d.browsers)" /></div></div>
            <div class="card"><div class="card-h"><h3>Operatsion tizim</h3></div><div class="card-b"><BarList :items="bars(d.os)" /></div></div>
          </div>
        </section>

        <!-- 9. Hududlar -->
        <section id="s-geo" class="stack">
          <h3 class="ws-sec">Mamlakat va til</h3>
          <div class="grid g2">
            <div class="card">
              <div class="card-h"><h3>Mamlakatlar</h3></div>
              <div class="card-b">
                <BarList :items="bars(d.countries)" />
                <p class="muted small" style="margin-top: 8px">Mamlakat hosting (masalan Cloudflare) xabar bergan bo'lsagina aniqlanadi, aks holda «Noma'lum». IP manzil saqlanmaydi.</p>
              </div>
            </div>
            <div class="card">
              <div class="card-h"><h3>Brauzer tili</h3></div>
              <div class="card-b"><BarList :items="bars(d.languages).map((x) => ({ ...x, label: LANG[x.label] || x.label }))" /></div>
            </div>
          </div>
        </section>

        <!-- 10. Hozir -->
        <section id="s-realtime" class="stack">
          <h3 class="ws-sec">Hozir saytda <span class="badge b-good" title="Har 15 soniyada yangilanadi">● jonli</span></h3>
          <div class="grid g3">
            <div class="card">
              <div class="card-h"><h3>Hozir {{ num(rt?.activeSessions) }} kishi</h3><span class="card-sub">qaysi sahifada</span></div>
              <div class="card-b"><BarList :items="(rt?.activePages || []).map((x) => ({ label: x.path, value: x.n }))" /></div>
            </div>
            <div class="card">
              <div class="card-h"><h3>Oxirgi 30 daqiqada ochilgan sahifalar</h3></div>
              <div class="card-b"><BarList :items="(rt?.topPages30 || []).map((x) => ({ label: x.path, value: x.n }))" /></div>
            </div>
            <div class="card">
              <div class="card-h"><h3>So'nggi harakatlar</h3><span class="card-sub">{{ rt ? "yangilandi " + fmt.ago(rt.at) : "" }}</span></div>
              <div class="card-b rt-list">
                <div v-if="!rt?.recent?.length" class="muted small">Oxirgi 30 daqiqada hech kim kirmadi</div>
                <div v-for="(e, i) in (rt?.recent || []).slice(0, 12)" :key="i" class="rt-row">
                  <span class="badge" :class="['lead', 'purchase', 'conversion'].includes(e.type) ? 'b-good' : 'b-info'">{{ EVENT_LABEL[e.type] || e.type }}</span>
                  <span class="mono small ell">{{ e.path }}</span>
                  <span class="small muted">{{ fmt.ago(e.t) }}</span>
                </div>
              </div>
            </div>
          </div>
          <div class="card">
            <div class="card-h">
              <h3>Barcha harakatlar ro'yxati</h3>
              <select v-model="evType" class="sel sm-sel" aria-label="Harakat turi"><option value="">Barcha harakatlar</option><option v-for="x in opt.events" :key="x" :value="x">{{ EVENT_LABEL[x] || x }}</option></select>
            </div>
            <div class="card-b">
              <DataTable :columns="evCols" :rows="(ev?.events || []).map((x, i) => ({ ...x, id: x.eid || i }))" server :total="ev?.total || 0" :page="evPage" @page="(pg) => (evPage = pg)" empty-text="Hali harakat yo'q" />
            </div>
          </div>
        </section>

        <!-- 11. Sayt holati -->
        <section id="s-health" class="stack">
          <div>
            <h3 class="ws-sec">Sayt ishlayaptimi</h3>
            <p class="ws-desc">Sayt har 15 daqiqada avtomatik tekshiriladi.</p>
          </div>
          <div class="card">
            <div class="card-b ws-health">
              <div><span class="muted small">Sayt</span><HealthBadge :h="site.health" /></div>
              <div><span class="muted small">Ochilish tezligi</span><b>{{ site.health?.ms != null ? speedText(site.health.ms) : "—" }}</b></div>
              <div><span class="muted small">Kuzatuv kodi saytda</span><b>{{ site.health?.snippetFound == null ? "—" : site.health.snippetFound ? "bor ✓" : "topilmadi" }}</b></div>
              <div><span class="muted small">Ma'lumot kelishi</span><TrackBadge :site="site" /></div>
              <div><span class="muted small">Saytdan oxirgi ma'lumot</span><b>{{ site.lastEventAt ? fmt.dt(site.lastEventAt) : "—" }}</b></div>
              <div><span class="muted small">Oxirgi tekshiruv</span><b>{{ site.health?.at ? fmt.dt(site.health.at) : "—" }}</b></div>
              <div v-if="site.health?.error"><span class="muted small">Xato</span><b>{{ site.health.error }}</b></div>
              <div v-if="site.health?.status"><span class="muted small">Server javobi (texnik)</span><b>HTTP {{ site.health.status }}</b></div>
              <div><button class="btn sm" :disabled="checking" @click="checkNow"><Icon name="refresh" :size="13" /> Hozir tekshirish</button></div>
            </div>
          </div>
        </section>

        <!-- 12. Ogohlantirishlar -->
        <section id="s-alerts" class="stack">
          <div>
            <h3 class="ws-sec">Diqqat qilish kerak</h3>
            <p class="ws-desc">Tizim raqamlardagi keskin o'zgarishlarni o'zi topadi va nima qilish kerakligini aytadi.</p>
          </div>
          <div class="card">
            <div class="card-b stack" style="gap: 8px">
              <div v-if="!d.alerts.length" class="note good small"><Icon name="check" :size="14" /> Tanlangan davrda muammo topilmadi.</div>
              <AlertItem v-for="(a, i) in d.alerts" :key="i" :a="a" />
            </div>
          </div>
          <details class="card al-hist">
            <summary class="card-h"><h3>Avvalgi ogohlantirishlar</h3><span class="card-sub">{{ al?.total || 0 }} ta</span></summary>
            <div class="card-b stack" style="gap: 8px">
              <div v-if="!al?.alerts?.length" class="muted small">Hali yo'q</div>
              <AlertItem v-for="(a, i) in al?.alerts || []" :key="i" :a="a" />
              <Pager :page="alPage" :pages="Math.max(1, Math.ceil((al?.total || 0) / 10))" :total="al?.total || 0" @go="(pg) => (alPage = pg)" />
            </div>
          </details>
        </section>

        <!-- 13. Kuzatuv kodi -->
        <section id="s-setup" class="stack">
          <h3 class="ws-sec">Kuzatuv kodi va boshqaruv</h3>
          <div class="card">
            <div class="card-b stack" style="gap: 12px">
              <InstallGuide v-if="site.firstEventAt" :site="site" :checking="checking" @check="checkNow" />
              <div class="row">
                <button class="btn sm" @click="editing = true"><Icon name="gear" :size="13" /> Sozlamalar va natijalar</button>
                <button class="btn sm" @click="toggleStatus">{{ site.status === "paused" ? "Kuzatuvni qayta yoqish" : "Kuzatuvni vaqtincha to'xtatish" }}</button>
                <button class="btn sm danger" @click="removeSite"><Icon name="x" :size="13" /> Saytni o'chirish</button>
              </div>
            </div>
          </div>
        </section>
      </template>
    </State>

    <SiteForm v-if="editing && d" :edit="site" :categories="cats" @close="editing = false" @saved="onSaved" />

    <Modal v-if="pageSel" :title="pageSel.path" @close="pageSel = null">
      <dl class="kv">
        <dt>Sarlavha</dt><dd>{{ pageSel.title || "—" }}</dd>
        <dt>Necha marta ochilgan</dt><dd>{{ num(pageSel.views) }}</dd>
        <dt>Necha tashrifda ochilgan</dt><dd>{{ num(pageSel.sessions) }}</dd>
        <dt>Birinchi sahifa bo'lgan</dt><dd>{{ num(pageSel.entries) }}</dd>
        <dt>Shu yerda saytdan chiqqan</dt><dd>{{ num(pageSel.exits) }} ({{ pct(pageSel.exitRate) }})</dd>
        <dt>Sahifada o'rtacha vaqt</dt><dd>{{ dur(pageSel.avgTime) }}</dd>
        <dt>Natija bergan tashriflar</dt><dd>{{ num(pageSel.convSessions) }}</dd>
      </dl>
      <h4 style="margin: 12px 0 6px">Bu sahifadan keyin qayerga o'tishgan</h4>
      <BarList :items="(pageSel.next || []).map((x) => ({ label: x.path, value: x.n }))" />
      <template #foot><button class="btn" @click="(flt.page = pageSel.path), (pageSel = null)">Faqat shu sahifani ko'rsatish</button></template>
    </Modal>

    <Modal v-if="spendOpen" title="Reklama xarajatini kiritish" wide @close="spendOpen = false">
      <p class="small muted">
        Instagram, Facebook, Google yoki Yandex reklama kabinetidan xarajatni ko'chirib qo'ying — har bir qator alohida kun. Tartib:
        <code>sana, reklama nomi, xarajat, tushum, ko'rishlar, bosishlar, manba</code>. Oxirgi to'rttasi ixtiyoriy.
        Reklama nomi havoladagi <code>utm_campaign</code> bilan bir xil bo'lishi kerak.
      </p>
      <textarea v-model="spendText" class="inp mono" rows="8" placeholder="2026-10-01, kuz_aksiya, 250000, , 12000, 340, instagram"></textarea>
      <div v-if="spendErr" class="note bad" style="margin-top: 8px">{{ spendErr }}</div>
      <h4 style="margin: 14px 0 6px">Kiritilgan xarajatlar</h4>
      <DataTable :columns="spendCols" :rows="spendList" empty-text="Hali kiritilmagan">
        <template #del="{ row }"><button class="btn ghost icon sm" aria-label="O'chirish" @click="delSpend(row.id)"><Icon name="x" :size="13" /></button></template>
      </DataTable>
      <template #foot>
        <button class="btn" @click="spendOpen = false">Yopish</button>
        <button class="btn pri" :disabled="!spendText.trim()" @click="importSpend">Saqlash</button>
      </template>
    </Modal>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, download } from "../api.js";
import { fmt, toast } from "../store.js";
import { useLoad } from "../useLoad.js";
import { waQuery, num, pct, dur, money, change, EVENT_LABEL, GOAL_TYPES, plainSummary } from "../wa.js";
import State from "../components/State.vue";
import Icon from "../components/Icon.vue";
import KpiCard from "../components/KpiCard.vue";
import LineChart from "../components/LineChart.vue";
import ColumnChart from "../components/ColumnChart.vue";
import BarList from "../components/BarList.vue";
import DataTable from "../components/DataTable.vue";
import Modal from "../components/Modal.vue";
import Pager from "../components/Pager.vue";
import WaPeriod from "../components/WaPeriod.vue";
import SiteForm from "../components/SiteForm.vue";
import JourneyFlow from "../components/JourneyFlow.vue";
import InstallGuide from "../components/InstallGuide.vue";
import { AlertItem, TrackBadge, HealthBadge } from "../components/waBits.js";

const route = useRoute();
const router = useRouter();
const id = computed(() => String(route.params.id));
const SECTIONS = [
  ["s-overview", "Asosiy"], ["s-traffic", "Kirishlar"], ["s-sources", "Qayerdan keldi"], ["s-pages", "Sahifalar"], ["s-journey", "Saytdagi yo'l"],
  ["s-campaigns", "Reklama"], ["s-conv", "Natijalar"], ["s-devices", "Qurilmalar"], ["s-geo", "Mamlakat"], ["s-realtime", "Hozir"],
  ["s-health", "Sayt holati"], ["s-alerts", "Ogohlantirishlar"], ["s-setup", "Kod"],
];
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const HOUR_TIPS = HOURS.map((h, i) => `${h}:00 – ${String((i + 1) % 24).padStart(2, "0")}:00`);
const LANG = { uz: "O'zbek", ru: "Rus", en: "Ingliz", kk: "Qozoq", ky: "Qirg'iz", tg: "Tojik", tr: "Turk", de: "Nemis", ar: "Arab", fr: "Fransuz", tk: "Turkman", zh: "Xitoy", ko: "Koreys" };
const cats = ref(["Biznes", "Ta'lim", "Internet do'kon", "Xizmatlar", "Blog / Media", "Portfolio", "Davlat / Jamiyat", "Boshqa"]);

const flt = reactive({ source: "", campaign: "", device: "", page: "", event: "" });
const anyFilter = computed(() => Object.values(flt).some(Boolean));
const clearFilters = () => Object.keys(flt).forEach((k) => (flt[k] = ""));

// «Yana ko'rsatkichlar» holati eslab qolinadi
const MORE_KEY = "sa_wa_more";
const showMore = ref(false);
try {
  showMore.value = localStorage.getItem(MORE_KEY) === "1";
} catch {}
function toggleMore() {
  showMore.value = !showMore.value;
  try {
    localStorage.setItem(MORE_KEY, showMore.value ? "1" : "0");
  } catch {}
}

const { data: d, loading, error, reload } = useLoad(() => api(`/api/super/wa/sites/${encodeURIComponent(id.value)}/stats`, { query: { ...waQuery.value, ...flt } }), {
  deps: computed(() => [id.value, waQuery.value, { ...flt }]),
  pollMs: 60000,
});
const { data: rt } = useLoad(() => api(`/api/super/wa/sites/${encodeURIComponent(id.value)}/realtime`), { deps: id, pollMs: 15000 });
const evType = ref("");
const evPage = ref(1);
watch(evType, () => (evPage.value = 1));
const { data: ev } = useLoad(
  () => api(`/api/super/wa/sites/${encodeURIComponent(id.value)}/events`, { query: { ...waQuery.value, type: evType.value, page: evPage.value, limit: 10 } }),
  { deps: computed(() => [id.value, waQuery.value, evType.value, evPage.value]), pollMs: 30000 },
);
const alPage = ref(1);
const { data: al } = useLoad(() => api("/api/super/wa/alerts", { query: { site: id.value, page: alPage.value, limit: 10 } }), {
  deps: computed(() => [id.value, alPage.value]),
});

const site = computed(() => d.value.site);
const c = computed(() => d.value.kpis.cur);
const p = computed(() => d.value.kpis.prev);
const opt = computed(() => d.value?.options || { sources: [], campaigns: [], devices: [], pages: [], events: [] });
const ch = (k) => change(c.value[k], p.value[k]);
const summary = computed(() => (d.value ? plainSummary(d.value, d.value.range?.label) : []));
const prevLabel = computed(() => {
  const x = d.value?.range?.prev;
  return x ? (x.from === x.to ? fmt.day(x.from) : fmt.day(x.from) + " — " + fmt.day(x.to)) : "";
});
const tsLabels = computed(() => (d.value.timeseries.hourly ? d.value.timeseries.labels : d.value.timeseries.labels.map((x) => fmt.day(x).replace(/ \d{4}$/, ""))));
const speedText = (ms) => {
  const s = Math.round(ms / 100) / 10 + " soniya";
  return ms < 1000 ? s + " — tez" : ms < 3000 ? s + " — o'rtacha" : s + " — sekin";
};
const goalText = (g) => {
  const t = (GOAL_TYPES.find(([k]) => k === g.type) || [])[1] || g.type;
  return t + (g.match ? ": " + g.match : g.type === "form" ? ": istalgan forma" : "");
};

const bars = (list, filterKey) =>
  (list || []).slice(0, 10).map((x) => ({
    key: x.key,
    label: x.key,
    value: x.sessions,
    text: num(x.sessions) + " · " + pct(x.share),
    sub: `natija ${pct(x.conversionRate)} · darhol chiqqan ${pct(x.bounceRate)}`,
    title: `${x.key}: ${num(x.sessions)} ta tashrif (${pct(x.share)}). 100 tashrifdan ${pct(x.conversionRate)} natija berdi, ${pct(x.bounceRate)} darhol chiqib ketdi.`,
    onClick: filterKey ? () => (flt[filterKey] = x.key) : null,
  }));
const rowsKey = (list) => (list || []).map((x) => ({ ...x, id: x.key }));
const srcCols = [
  { key: "key", label: "Qayerdan" },
  { key: "sessions", label: "Tashriflar", align: "r", fmt: num },
  { key: "visitors", label: "Odamlar", align: "r", fmt: num },
  { key: "pageviews", label: "Ochilgan sahifalar", align: "r", fmt: num },
  { key: "avgDuration", label: "O'rtacha vaqt", align: "r", fmt: dur },
  { key: "bounceRate", label: "Darhol chiqqan", align: "r", fmt: pct },
  { key: "conversions", label: "Natijalar", align: "r", fmt: num },
  { key: "conversionRate", label: "Natija foizi", align: "r", fmt: pct },
];
const pageRows = computed(() => (d.value?.pages || []).map((x) => ({ ...x, id: x.path })));
const pageCols = [
  { key: "path", label: "Sahifa" },
  { key: "views", label: "Ochilgan", align: "r", fmt: num },
  { key: "sessions", label: "Tashriflar", align: "r", fmt: num },
  { key: "entries", label: "Birinchi sahifa", align: "r", fmt: num },
  { key: "exits", label: "Shu yerda chiqqan", align: "r", fmt: num },
  { key: "exitRate", label: "Chiqish %", align: "r", fmt: pct },
  { key: "avgTime", label: "O'rtacha vaqt", align: "r", fmt: dur },
  { key: "convSessions", label: "Natija bergan", align: "r", fmt: num },
];
const exitPages = computed(() => (d.value?.pages || []).slice().sort((a, b) => b.exits - a.exits).filter((x) => x.exits > 0));
const highExit = computed(() => (d.value?.pages || []).filter((x) => x.sessions >= 5).sort((a, b) => b.exitRate - a.exitRate).slice(0, 8));
const convPages = computed(() =>
  (d.value?.pages || []).filter((x) => x.convSessions > 0).sort((a, b) => b.convSessions - a.convSessions).slice(0, 8).map((x) => ({ label: x.path, value: x.convSessions, text: x.convSessions + " ta", sub: "natija bergan tashriflar" })),
);
const campCols = [
  { key: "campaign", label: "Reklama" },
  { key: "source", label: "Qayerda" },
  { key: "medium", label: "Turi" },
  { key: "sessions", label: "Tashriflar", align: "r", fmt: num },
  { key: "impressions", label: "Ko'rganlar", align: "r", fmt: num },
  { key: "clicks", label: "Bosganlar", align: "r", fmt: num },
  { key: "conversions", label: "Natijalar", align: "r", fmt: num },
  { key: "leads", label: "Arizalar", align: "r", fmt: num },
  { key: "conversionRate", label: "Natija foizi", align: "r", fmt: pct },
  { key: "spend", label: "Xarajat", align: "r", fmt: money },
  { key: "revenue", label: "Tushum", align: "r", fmt: (v, r) => (v == null ? "—" : money(v) + (r.revenueSource === "import" ? " (kiritilgan)" : "")) },
  { key: "cpa", label: "1 natija narxi", align: "r", fmt: money },
  { key: "roas", label: "Qaytim", align: "r", fmt: (v) => (v == null ? "—" : v + " so'm") },
];
const campConv = computed(() => (d.value?.campaigns || []).reduce((a, x) => a + (x.conversions || 0), 0));
const totalRoas = computed(() => {
  const rows = (d.value?.campaigns || []).filter((x) => x.spend > 0 && x.revenue != null);
  const sp = rows.reduce((a, x) => a + x.spend, 0);
  return sp > 0 ? Math.round((rows.reduce((a, x) => a + x.revenue, 0) / sp) * 100) / 100 : null;
});
const roasBars = computed(() =>
  (d.value?.campaigns || [])
    .filter((x) => x.revenue != null || x.spend != null)
    .slice(0, 10)
    .map((x) => ({ label: x.campaign, value: x.revenue || 0, text: money(x.revenue), sub: `xarajat ${money(x.spend)} · 1 so'mga ${x.roas == null ? "—" : x.roas + " so'm"} qaytdi` })),
);
const evCols = [
  { key: "t", label: "Vaqt", fmt: (v) => fmt.dt(v), nowrap: true, sortable: false },
  { key: "type", label: "Harakat", fmt: (v) => EVENT_LABEL[v] || v, sortable: false },
  { key: "path", label: "Sahifa", sortable: false },
  { key: "name", label: "Tafsilot", sortable: false, fmt: (v, r) => [v, r.value != null ? money(r.value) : null, r.refHost ? "kelgan joyi: " + r.refHost : null, r.dur != null ? dur(r.dur / 1000) : null].filter(Boolean).join(" · ") || "—" },
];

// Yo'l diagrammasi — tanlangan element
const nodeSel = ref(null);
const pageSel = ref(null);
const nodePage = computed(() => (nodeSel.value ? (d.value?.pages || []).find((x) => x.path === nodeSel.value.label) : null));
const onNode = (n) => (nodeSel.value = n);

function jump(sid) {
  document.getElementById(sid)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Amallar
const editing = ref(false);
const checking = ref(false);
async function checkNow() {
  checking.value = true;
  try {
    const r = await api(`/api/super/wa/sites/${encodeURIComponent(id.value)}/check`, { method: "POST" });
    d.value.site = r.site;
    toast(
      r.health.ok ? (r.health.snippetFound === false ? "Sayt ochildi, lekin kuzatuv kodi topilmadi" : `Sayt ochildi (${Math.round(r.health.ms / 100) / 10} soniya)`) : "Sayt ochilmadi: " + r.health.error,
      r.health.ok ? "ok" : "error",
    );
    reload(true);
  } catch (e) {
    toast(e.message, "error");
  } finally {
    checking.value = false;
  }
}
function onSaved(s) {
  editing.value = false;
  d.value.site = s;
  toast("Saqlandi");
  reload(true);
}
async function toggleStatus() {
  const r = await api(`/api/super/wa/sites/${encodeURIComponent(id.value)}`, { method: "POST", body: { status: site.value.status === "paused" ? "active" : "paused" } }).catch((e) => toast(e.message, "error"));
  if (r) (d.value.site = r.site), toast(r.site.status === "paused" ? "Kuzatuv to'xtatildi" : "Kuzatuv yoqildi");
}
async function removeSite() {
  const v = prompt(`Sayt va uning BARCHA statistikasi butunlay o'chiriladi, qaytarib bo'lmaydi.\nTasdiqlash uchun sayt manzilini yozing: ${site.value.host}`);
  if (v == null) return;
  try {
    await api(`/api/super/wa/sites/${encodeURIComponent(id.value)}`, { method: "DELETE", query: { confirm: v.trim() } });
    toast("Sayt o'chirildi");
    router.push("/web");
  } catch (e) {
    toast(e.message, "error");
  }
}
const exportKind = ref("");
async function doExport() {
  const kind = exportKind.value;
  exportKind.value = "";
  if (!kind) return;
  try {
    await download(`/api/super/wa/sites/${encodeURIComponent(id.value)}/export`, { query: { ...waQuery.value, ...flt, kind } });
  } catch (e) {
    toast(e.message, "error");
  }
}

// Reklama xarajatini kiritish
const spendOpen = ref(false);
const spendText = ref("");
const spendErr = ref("");
const spendList = ref([]);
const spendCols = [
  { key: "date", label: "Sana" },
  { key: "campaign", label: "Reklama" },
  { key: "source", label: "Qayerda" },
  { key: "spend", label: "Xarajat", align: "r", fmt: money },
  { key: "revenue", label: "Tushum", align: "r", fmt: money },
  { key: "del", label: "", sortable: false },
];
async function loadSpend() {
  const r = await api(`/api/super/wa/sites/${encodeURIComponent(id.value)}/spend`).catch(() => null);
  spendList.value = r?.rows || [];
}
watch(spendOpen, (o) => o && loadSpend());
async function importSpend() {
  spendErr.value = "";
  const rows = spendText.value
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^sana\b/i.test(l))
    .map((l) => {
      const x = l.split(/[;,\t]/).map((s) => s.trim());
      return { date: x[0], campaign: x[1], spend: x[2], revenue: x[3], impressions: x[4], clicks: x[5], source: x[6] };
    });
  try {
    const r = await api(`/api/super/wa/sites/${encodeURIComponent(id.value)}/spend`, { method: "POST", body: { rows } });
    toast(`${r.added} ta qator saqlandi` + (r.skipped.length ? `, ${r.skipped.length} ta qator noto'g'ri yozilgani uchun o'tkazib yuborildi (${r.skipped.slice(0, 5).join(", ")})` : ""));
    spendText.value = "";
    loadSpend();
    reload(true);
  } catch (e) {
    spendErr.value = e.message;
  }
}
async function delSpend(rowId) {
  await api(`/api/super/wa/sites/${encodeURIComponent(id.value)}/spend`, { method: "DELETE", query: { row: rowId } }).catch((e) => toast(e.message, "error"));
  loadSpend();
  reload(true);
}
</script>

<style scoped>
.ws-head { padding: 16px 18px; display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.ws-head h2 { font-size: 21px; margin: 4px 0 6px; }
.ws-head-l { display: grid; gap: 2px; min-width: 0; }
.ws-head-r { display: grid; gap: 8px; justify-items: end; }
.sm-sel { width: auto; min-height: 30px; padding-top: 4px; padding-bottom: 4px; font-size: 12.5px; }
.ws-filters { padding: 12px 14px; display: grid; gap: 10px; position: sticky; top: 60px; z-index: 10; }
.ws-filters .sel { width: auto; max-width: 200px; min-height: 32px; font-size: 12.5px; }
.ws-nav { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; }
.ws-nav .chip { white-space: nowrap; text-decoration: none; }
.ws-sec { font-size: 16px; display: flex; align-items: center; gap: 8px; }
.ws-desc { margin: 4px 0 0; font-size: 12.5px; color: var(--text-3); line-height: 1.45; }
section { scroll-margin-top: 150px; }
.kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
.install { border-color: color-mix(in srgb, var(--info) 45%, var(--border)); }
.summary { border-color: color-mix(in srgb, var(--accent) 35%, var(--border)); }
.sum-list { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr)); gap: 10px 18px; }
.sum-list li { display: grid; grid-template-columns: 28px 1fr; gap: 10px; align-items: start; font-size: 13.5px; line-height: 1.45; }
.sum-ic { width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; background: var(--info-soft); color: var(--info); }
.sum-list li.good .sum-ic { background: var(--good-soft); color: var(--good); }
.sum-list li.warn .sum-ic { background: var(--warn-soft); color: var(--warn); }
.sum-list li.mute .sum-ic { background: var(--surface-3); color: var(--text-3); }
.sum-list :deep(.up) { color: var(--good); }
.sum-list :deep(.down) { color: var(--bad); }
.chart-note { margin-top: 8px; }
.ell { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 360px; }
.jp { justify-content: space-between; }
.fn-row { display: grid; grid-template-columns: minmax(150px, 38%) 1fr 90px; gap: 10px; align-items: center; margin-bottom: 12px; }
.fn-l { display: flex; flex-direction: column; font-size: 13px; }
.fn-bar { height: 14px; background: var(--surface-3); border-radius: 4px; overflow: hidden; }
.fn-bar i { display: block; height: 100%; background: var(--s3); border-radius: 4px; transition: width 0.4s; }
.fn-v { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
.rt-list { display: grid; gap: 7px; }
.rt-row { display: grid; grid-template-columns: auto 1fr auto; gap: 8px; align-items: center; }
.ws-health { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 14px; }
.ws-health > div { display: grid; gap: 4px; justify-items: start; }
.al-hist > summary { cursor: pointer; list-style: none; }
.al-hist > summary::-webkit-details-marker { display: none; }
code { font-size: 11.5px; background: var(--surface-3); padding: 1px 4px; border-radius: 4px; word-break: break-all; }
@media (max-width: 720px) {
  .ws-head-r { justify-items: start; }
  .ws-filters { position: static; }
  .fn-row { grid-template-columns: 1fr 70px; }
  .fn-bar { grid-column: 1 / -1; grid-row: 2; }
  .sum-list { grid-template-columns: 1fr; }
}
</style>
