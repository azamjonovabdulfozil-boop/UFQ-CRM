<template>
  <div class="stack">
    <State :loading="loading && !d" :error="error" :retry="reload">
      <template v-if="d">
        <!-- ── Sarlavha ── -->
        <div class="card ws-head">
          <div class="ws-head-l">
            <router-link to="/web" class="small muted"><Icon name="left" :size="13" /> Saytlar analitikasi</router-link>
            <h2>{{ site.name }}</h2>
            <div class="row small">
              <a :href="site.url" target="_blank" rel="noopener noreferrer" class="mono">{{ site.host }} <Icon name="external" :size="12" /></a>
              <TrackBadge :site="site" />
              <HealthBadge :h="site.health" />
              <span class="muted">Oxirgi hodisa: {{ site.lastEventAt ? fmt.ago(site.lastEventAt) : "hali yo'q" }}</span>
            </div>
          </div>
          <div class="ws-head-r">
            <div class="row">
              <button class="btn sm" :disabled="loading" @click="reload()"><Icon name="refresh" :size="14" /> Yangilash</button>
              <button class="btn sm" @click="editing = true"><Icon name="gear" :size="14" /> Sozlamalar</button>
              <select v-model="exportKind" class="sel sm-sel" aria-label="CSV eksport" @change="doExport">
                <option value="">CSV eksport…</option>
                <option value="sessions">Sessiyalar</option>
                <option value="pageviews">Sahifa ko'rishlari</option>
                <option value="events">Barcha hodisalar</option>
                <option value="pages">Sahifalar jadvali</option>
                <option value="sources">Manbalar jadvali</option>
                <option value="campaigns">Kampaniyalar jadvali</option>
              </select>
            </div>
            <WaPeriod :label="d.range.label" :prev-label="prevLabel" />
          </div>
        </div>

        <!-- ── Tracking hali ishlamayapti ── -->
        <div v-if="!site.firstEventAt" class="card install">
          <div class="card-h"><h3><Icon name="info" :size="16" /> Analitika hali ma'lumot yig'ishni boshlamagan.</h3></div>
          <div class="card-b stack" style="gap: 10px">
            <TrackingBox :site="site" :checking="checking" @check="checkNow" />
          </div>
        </div>

        <!-- ── Filtrlar ── -->
        <div class="card ws-filters">
          <div class="row">
            <b class="small">Filtrlar:</b>
            <select v-model="flt.source" class="sel" aria-label="Manba"><option value="">Barcha manbalar</option><option v-for="x in opt.sources" :key="x">{{ x }}</option></select>
            <select v-model="flt.campaign" class="sel" aria-label="Kampaniya"><option value="">Barcha kampaniyalar</option><option v-for="x in opt.campaigns" :key="x">{{ x }}</option></select>
            <select v-model="flt.device" class="sel" aria-label="Qurilma"><option value="">Barcha qurilmalar</option><option v-for="x in opt.devices" :key="x">{{ x }}</option></select>
            <select v-model="flt.page" class="sel" aria-label="Sahifa"><option value="">Barcha sahifalar</option><option v-for="x in opt.pages" :key="x">{{ x }}</option></select>
            <select v-model="flt.event" class="sel" aria-label="Hodisa turi"><option value="">Barcha hodisalar</option><option v-for="x in opt.events" :key="x" :value="x">{{ EVENT_LABEL[x] || x }}</option></select>
            <button v-if="anyFilter" class="btn sm ghost" @click="clearFilters"><Icon name="x" :size="13" /> Tozalash</button>
            <span v-if="loading" class="spin" style="width: 16px; height: 16px"></span>
          </div>
          <nav class="ws-nav" aria-label="Bo'limlar">
            <a v-for="[id, l] in SECTIONS" :key="id" :href="'#' + id" class="chip" @click.prevent="jump(id)">{{ l }}</a>
          </nav>
        </div>
        <div v-if="d.truncated" class="note warn">Davr juda katta — hisobot birinchi 300 000 yozuv asosida. Qisqaroq davr tanlang.</div>

        <!-- 1. Umumiy statistika -->
        <section id="s-overview" class="stack">
          <h3 class="ws-sec">Umumiy statistika</h3>
          <div class="kpis">
            <KpiCard label="Sessiyalar (tashriflar)" :value="num(c.sessions)" :delta="ch('sessions')" :prev-text="num(p.sessions)" :spark="d.kpis.spark.sessions" />
            <KpiCard label="Noyob tashrif buyuruvchilar" :value="num(c.visitors)" :delta="ch('visitors')" :prev-text="num(p.visitors)" :spark="d.kpis.spark.visitors" hint="Brauzer psevdonimi; turli qurilmalar alohida sanaladi" />
            <KpiCard label="Sahifa ko'rishlari" :value="num(c.pageviews)" :delta="ch('pageviews')" :prev-text="num(p.pageviews)" :spark="d.kpis.spark.pageviews" />
            <KpiCard label="Yangi tashriflar" :value="num(c.newSessions)" :delta="ch('newSessions')" :prev-text="num(p.newSessions)" />
            <KpiCard label="Qaytgan tashriflar" :value="num(c.returningSessions)" :delta="ch('returningSessions')" :prev-text="num(p.returningSessions)" />
            <KpiCard label="Hozir faol" :value="num(rt?.activeSessions)" sub="oxirgi 5 daqiqa" live />
            <KpiCard label="Sahifa / sessiya" :value="c.pagesPerSession ?? '—'" :delta="ch('pagesPerSession')" :prev-text="String(p.pagesPerSession ?? '—')" />
            <KpiCard label="O'rtacha sessiya" :value="dur(c.avgDuration)" :delta="ch('avgDuration')" :prev-text="dur(p.avgDuration)" :hint="c.estimatedEnd + ' ta sessiyada chiqish hodisasi kelmagan — davomiylik oxirgi hodisagacha (taxminiy)'" />
            <KpiCard label="Bounce rate" :value="pct(c.bounceRate)" :delta="ch('bounceRate')" :prev-text="pct(p.bounceRate)" :up-is-good="false" hint="1 sahifa, 10 soniyadan kam va konversiyasiz sessiyalar ulushi" />
            <KpiCard label="Konversiyalar" :value="num(c.conversions)" :delta="ch('conversions')" :prev-text="num(p.conversions)" :spark="d.kpis.spark.conversions" />
            <KpiCard label="Konversiya foizi" :value="pct(c.conversionRate)" :delta="ch('conversionRate')" :prev-text="pct(p.conversionRate)" hint="Konversiyali sessiyalar / sessiyalar × 100" />
            <KpiCard label="Leadlar" :value="num(c.leads)" :delta="ch('leads')" :prev-text="num(p.leads)" />
            <KpiCard label="Daromad (kuzatilgan)" :value="c.revenue > 0 || p.revenue > 0 ? money(c.revenue) : '—'" :delta="c.revenue > 0 ? ch('revenue') : null" :sub="c.revenue > 0 ? '' : 'purchase hodisasi kelmagan'" />
          </div>
          <p v-if="c.sessions && c.estimatedEnd" class="muted small">
            {{ num(c.estimatedEnd) }} ta sessiyada brauzer yopilgani sababli chiqish hodisasi kelmadi — ularning davomiyligi oxirgi qayd etilgan hodisagacha hisoblandi (taxminiy).
          </p>
        </section>

        <!-- 2. Tashriflar dinamikasi -->
        <section id="s-traffic" class="stack">
          <h3 class="ws-sec">Tashriflar dinamikasi</h3>
          <div class="card">
            <div class="card-h"><h3>Tashriflar va noyob tashrif buyuruvchilar</h3><span class="card-sub">{{ d.timeseries.hourly ? "soatlar bo'yicha" : "kunlar bo'yicha" }}</span></div>
            <div class="card-b"><LineChart :labels="tsLabels" :tip-labels="d.timeseries.labels" :series="[{ name: 'Sessiyalar', values: d.timeseries.sessions }, { name: 'Noyob tashrif buyuruvchilar', values: d.timeseries.visitors }]" aria-label="Tashriflar" /></div>
          </div>
          <div class="grid g2">
            <div class="card">
              <div class="card-h"><h3>Yangi va qaytgan tashriflar</h3></div>
              <div class="card-b"><LineChart :labels="tsLabels" :tip-labels="d.timeseries.labels" :series="[{ name: 'Yangi', values: d.timeseries.newSessions }, { name: 'Qaytgan', values: d.timeseries.returningSessions }]" :height="200" aria-label="Yangi va qaytgan" /></div>
            </div>
            <div class="card">
              <div class="card-h"><h3>Soatlar bo'yicha trafik</h3><span class="card-sub">{{ site.timezone }}</span></div>
              <div class="card-b"><ColumnChart :labels="HOURS" :values="d.hourly" name="Sessiyalar" :height="200" aria-label="Soatlar bo'yicha" /></div>
            </div>
          </div>
        </section>

        <!-- 3. Trafik manbalari -->
        <section id="s-sources" class="stack">
          <h3 class="ws-sec">Trafik manbalari</h3>
          <div class="grid g2">
            <div class="card">
              <div class="card-h"><h3>Manbalar</h3><span class="card-sub">bosing — filtr</span></div>
              <div class="card-b"><BarList :items="bars(d.sources, 'source')" /></div>
            </div>
            <div class="card">
              <div class="card-h"><h3>Kanallar</h3><span class="card-sub">organik, ijtimoiy, pulli, email…</span></div>
              <div class="card-b"><BarList :items="bars(d.channels)" /></div>
            </div>
          </div>
          <div class="card">
            <div class="card-b"><DataTable :columns="srcCols" :rows="rowsKey(d.sources)" default-sort="sessions" empty-text="Bu davrda tashrif yo'q" /></div>
          </div>
          <p class="muted small">Manba faqat referrer yoki UTM belgilaridan aniqlanadi. Ikkalasi ham bo'lmasa — «To'g'ridan-to'g'ri»; aniqlab bo'lmasa — «Noma'lum». Taxmin qilinmaydi.</p>
        </section>

        <!-- 4. Sahifalar -->
        <section id="s-pages" class="stack">
          <h3 class="ws-sec">Sahifalar analitikasi</h3>
          <div class="grid g3">
            <div class="card">
              <div class="card-h"><h3>Kirish sahifalari</h3></div>
              <div class="card-b"><BarList :items="d.landing.slice(0, 8).map((x) => ({ label: x.key, value: x.sessions, sub: 'bounce ' + pct(x.bounceRate), onClick: () => (flt.page = x.key) }))" /></div>
            </div>
            <div class="card">
              <div class="card-h"><h3>Chiqish sahifalari</h3></div>
              <div class="card-b"><BarList :items="exitPages.slice(0, 8).map((x) => ({ label: x.path, value: x.exits, sub: 'chiqish ' + pct(x.exitRate) }))" /></div>
            </div>
            <div class="card">
              <div class="card-h"><h3>Chiqish darajasi yuqori</h3><span class="card-sub">kamida 5 sessiya</span></div>
              <div class="card-b"><BarList :items="highExit.map((x) => ({ label: x.path, value: x.exitRate, text: pct(x.exitRate), sub: x.sessions + ' sessiya' }))" :max="100" /></div>
            </div>
          </div>
          <div class="card">
            <div class="card-h"><h3>Barcha sahifalar</h3><span class="card-sub">qatorni bosing — batafsil</span></div>
            <div class="card-b">
              <DataTable :columns="pageCols" :rows="pageRows" clickable default-sort="views" searchable search-placeholder="Sahifa qidirish…" @row="(r) => (pageSel = r)" empty-text="Sahifa ko'rishlari yo'q">
                <template #path="{ row }"><span class="mono">{{ row.path }}</span><div v-if="row.title" class="small muted ell">{{ row.title }}</div></template>
              </DataTable>
            </div>
          </div>
        </section>

        <!-- 5. Foydalanuvchi yo'li -->
        <section id="s-journey" class="stack">
          <h3 class="ws-sec">Foydalanuvchi yo'li</h3>
          <div class="card">
            <div class="card-h"><h3>Manba → sahifalar → natija</h3><span class="card-sub">elementni bosing — tafsilot</span></div>
            <div class="card-b">
              <JourneyFlow :flow="d.journey" @select="onNode" />
              <div v-if="nodeSel" class="note info" style="margin-top: 10px">
                <b>{{ nodeSel.label }}</b> — {{ nodeSel.value }} sessiya.
                <template v-if="nodePage">
                  Ko'rishlar: <b>{{ num(nodePage.views) }}</b> · kirishlar: <b>{{ num(nodePage.entries) }}</b> · chiqishlar: <b>{{ num(nodePage.exits) }}</b> ({{ pct(nodePage.exitRate) }}) · o'rtacha vaqt: <b>{{ dur(nodePage.avgTime) }}</b>
                  <button class="btn sm" style="margin-left: 8px" @click="pageSel = nodePage">Batafsil</button>
                </template>
              </div>
              <p class="muted small" style="margin-top: 8px">Faqat sayt ichidagi navigatsiya ko'rsatiladi. Saytdan chiqqandan keyingi faoliyat kuzatilmaydi.</p>
            </div>
          </div>
          <div class="card">
            <div class="card-h"><h3>Eng ko'p takrorlangan yo'llar</h3></div>
            <div class="card-b">
              <div v-if="!d.journey.topPaths.length" class="muted small">Ma'lumot yo'q</div>
              <div v-for="(x, i) in d.journey.topPaths" :key="i" class="list-row jp">
                <span class="mono small">{{ x.path }}</span>
                <b class="small">{{ x.n }} <span class="muted">({{ pct(x.share) }})</span></b>
              </div>
            </div>
          </div>
        </section>

        <!-- 6. Reklama kampaniyalari -->
        <section id="s-campaigns" class="stack">
          <h3 class="ws-sec">Reklama kampaniyalari</h3>
          <div class="kpis">
            <KpiCard label="Reklama xarajati (import)" :value="d.spend.rows ? money(d.spend.total) : '—'" :delta="d.spend.rows ? change(d.spend.total, d.spend.prev) : null" :up-is-good="false" :sub="d.spend.rows ? '' : 'xarajat import qilinmagan'" />
            <KpiCard label="UTM kampaniyalari" :value="num(d.campaigns.filter((x) => x.sessions).length)" sub="tashrif keltirgan" />
            <KpiCard label="Kampaniya konversiyalari" :value="num(campConv)" />
            <KpiCard label="Umumiy ROAS" :value="totalRoas == null ? '—' : totalRoas + '×'" hint="Kampaniyalarga biriktirilgan daromad / xarajat" />
          </div>
          <div class="card">
            <div class="card-h"><h3>Kampaniyalar samaradorligi</h3><button class="btn sm" @click="spendOpen = true"><Icon name="plus" :size="13" /> Xarajat import</button></div>
            <div class="card-b">
              <DataTable :columns="campCols" :rows="d.campaigns.map((x, i) => ({ ...x, id: i }))" default-sort="sessions" empty-text="UTM belgili tashrif yo'q (utm_campaign)" />
              <p class="muted small" style="margin-top: 8px">
                Konversiya foizi = konversiyali sessiyalar / sessiyalar × 100 · CPA = xarajat / konversiyalar · ROAS = daromad / xarajat. Xarajat, ko'rishlar va bosishlar faqat import qilingan ma'lumotdan olinadi; mavjud bo'lmasa «—».
                Daromad — saytdan kelgan <code>purchase</code> hodisalari (kuzatilgan), bo'lmasa import qilingan qiymat.
              </p>
            </div>
          </div>
          <div class="card">
            <div class="card-h"><h3>Daromad va ROAS</h3></div>
            <div class="card-b"><BarList :items="roasBars" /></div>
          </div>
        </section>

        <!-- 7. Konversiyalar -->
        <section id="s-conv" class="stack">
          <h3 class="ws-sec">Konversiyalar va leadlar</h3>
          <div class="grid g2">
            <div class="card">
              <div class="card-h"><h3>Konversiya voronkasi</h3></div>
              <div class="card-b">
                <div v-for="(f, i) in d.funnel" :key="i" class="fn-row">
                  <div class="fn-l"><b>{{ f.label }}</b><span class="small muted">{{ i ? pct(f.ofPrev) + " oldingi bosqichdan" : "" }}</span></div>
                  <div class="fn-bar"><i :style="{ width: Math.max(1.5, f.ofTotal || 0) + '%' }"></i></div>
                  <div class="fn-v">{{ num(f.value) }} <span class="small muted">{{ pct(f.ofTotal) }}</span></div>
                </div>
              </div>
            </div>
            <div class="card">
              <div class="card-h"><h3>Konversiyalar dinamikasi</h3></div>
              <div class="card-b"><ColumnChart :labels="tsLabels" :tip-labels="d.timeseries.labels" :values="d.timeseries.conversions" name="Konversiyalar" :height="190" color="var(--s3)" empty-text="Bu davrda konversiya yo'q" /></div>
            </div>
          </div>
          <div class="card">
            <div class="card-h"><h3>Maqsadlar</h3><button class="btn sm" @click="editing = true">Maqsadlarni sozlash</button></div>
            <div class="card-b">
              <div v-if="!d.goals.length" class="muted small">Maqsad qo'shilmagan. <code>lead</code>, <code>purchase</code> va <code>conversion</code> hodisalari baribir konversiya sifatida hisoblanadi.</div>
              <BarList :items="d.goals.map((g) => ({ label: g.name, sub: g.type + ': ' + (g.match || 'har qanday'), value: g.sessions }))" />
            </div>
          </div>
          <div class="card">
            <div class="card-h"><h3>Konversiyaga olib kelgan sahifalar</h3></div>
            <div class="card-b"><BarList :items="convPages" /></div>
          </div>
        </section>

        <!-- 8. Qurilmalar -->
        <section id="s-devices" class="stack">
          <h3 class="ws-sec">Qurilmalar va brauzerlar</h3>
          <div class="grid g3">
            <div class="card"><div class="card-h"><h3>Qurilmalar</h3></div><div class="card-b"><BarList :items="bars(d.devices, 'device')" /></div></div>
            <div class="card"><div class="card-h"><h3>Brauzerlar</h3></div><div class="card-b"><BarList :items="bars(d.browsers)" /></div></div>
            <div class="card"><div class="card-h"><h3>Operatsion tizimlar</h3></div><div class="card-b"><BarList :items="bars(d.os)" /></div></div>
          </div>
        </section>

        <!-- 9. Hududiy -->
        <section id="s-geo" class="stack">
          <h3 class="ws-sec">Hududiy statistika</h3>
          <div class="grid g2">
            <div class="card">
              <div class="card-h"><h3>Mamlakatlar</h3></div>
              <div class="card-b">
                <BarList :items="bars(d.countries)" />
                <p class="muted small" style="margin-top: 8px">Mamlakat IP manzildan emas, hosting (masalan Cloudflare) yuborgan sarlavhadan olinadi; sarlavha bo'lmasa — «Noma'lum». IP manzil saqlanmaydi.</p>
              </div>
            </div>
            <div class="card">
              <div class="card-h"><h3>Brauzer tili</h3></div>
              <div class="card-b"><BarList :items="bars(d.languages)" /></div>
            </div>
          </div>
        </section>

        <!-- 10. Real vaqt -->
        <section id="s-realtime" class="stack">
          <h3 class="ws-sec">Real vaqt monitoringi <span class="badge b-good" title="Har 15 soniyada serverdan so'raladi">● har 15 s yangilanadi</span></h3>
          <div class="grid g3">
            <div class="card">
              <div class="card-h"><h3>Hozir faol: {{ num(rt?.activeSessions) }}</h3><span class="card-sub">oxirgi 5 daqiqa</span></div>
              <div class="card-b"><BarList :items="(rt?.activePages || []).map((x) => ({ label: x.path, value: x.n }))" /></div>
            </div>
            <div class="card">
              <div class="card-h"><h3>Oxirgi 30 daqiqa — sahifalar</h3></div>
              <div class="card-b"><BarList :items="(rt?.topPages30 || []).map((x) => ({ label: x.path, value: x.n }))" /></div>
            </div>
            <div class="card">
              <div class="card-h"><h3>So'nggi hodisalar</h3><span class="card-sub">{{ rt ? "yangilandi " + fmt.ago(rt.at) : "" }}</span></div>
              <div class="card-b rt-list">
                <div v-if="!rt?.recent?.length" class="muted small">Oxirgi 30 daqiqada hodisa yo'q</div>
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
              <h3>Hodisalar jurnali</h3>
              <select v-model="evType" class="sel sm-sel" aria-label="Hodisa turi"><option value="">Barcha turlar</option><option v-for="x in opt.events" :key="x" :value="x">{{ EVENT_LABEL[x] }}</option></select>
            </div>
            <div class="card-b">
              <DataTable :columns="evCols" :rows="(ev?.events || []).map((x, i) => ({ ...x, id: x.eid || i }))" server :total="ev?.total || 0" :page="evPage" @page="(pg) => (evPage = pg)" empty-text="Hodisa yo'q" />
            </div>
          </div>
        </section>

        <!-- 11. Texnik holat -->
        <section id="s-health" class="stack">
          <h3 class="ws-sec">Sayt texnik holati</h3>
          <div class="card">
            <div class="card-b ws-health">
              <div><span class="muted small">Ulanish</span><HealthBadge :h="site.health" /></div>
              <div><span class="muted small">HTTP javob kodi</span><b>{{ site.health?.status ?? "—" }}</b></div>
              <div><span class="muted small">Javob vaqti</span><b>{{ site.health?.ms != null ? site.health.ms + " ms" : "—" }}</b></div>
              <div><span class="muted small">Tracking kodi sahifada</span><b>{{ site.health?.snippetFound == null ? "—" : site.health.snippetFound ? "topildi" : "topilmadi" }}</b></div>
              <div><span class="muted small">Tracking</span><TrackBadge :site="site" /></div>
              <div><span class="muted small">Oxirgi muvaffaqiyatli hodisa</span><b>{{ site.lastEventAt ? fmt.dt(site.lastEventAt) : "—" }}</b></div>
              <div><span class="muted small">Oxirgi tekshiruv</span><b>{{ site.health?.at ? fmt.dt(site.health.at) : "—" }}</b></div>
              <div><span class="muted small">Xato</span><b>{{ site.health?.error || "yo'q" }}</b></div>
              <div><button class="btn sm" :disabled="checking" @click="checkNow"><Icon name="refresh" :size="13" /> Hozir tekshirish</button></div>
            </div>
            <p class="muted small" style="padding: 0 18px 14px">Tekshiruv har 15 daqiqada avtomatik bajariladi. Xavfsizlik: faqat ommaviy manzillarga so'rov yuboriladi — localhost va ichki tarmoq manzillari bloklanadi.</p>
          </div>
        </section>

        <!-- 12. Ogohlantirishlar -->
        <section id="s-alerts" class="stack">
          <h3 class="ws-sec">Ogohlantirishlar</h3>
          <div class="card">
            <div class="card-b stack" style="gap: 8px">
              <div v-if="!d.alerts.length" class="muted small"><Icon name="check" :size="14" /> Tanlangan davrda muammo aniqlanmadi (kichik hajmdagi tebranishlar ogohlantirish bermaydi).</div>
              <AlertItem v-for="(a, i) in d.alerts" :key="i" :a="a" />
            </div>
          </div>
          <div class="card">
            <div class="card-h"><h3>Ogohlantirishlar tarixi</h3></div>
            <div class="card-b stack" style="gap: 8px">
              <div v-if="!al?.alerts?.length" class="muted small">Tarix bo'sh</div>
              <AlertItem v-for="(a, i) in al?.alerts || []" :key="i" :a="a" />
              <Pager :page="alPage" :pages="Math.max(1, Math.ceil((al?.total || 0) / 10))" :total="al?.total || 0" @go="(pg) => (alPage = pg)" />
            </div>
          </div>
        </section>

        <!-- 13. Tracking sozlamalari -->
        <section id="s-setup" class="stack">
          <h3 class="ws-sec">Tracking sozlamalari</h3>
          <div class="card">
            <div class="card-b stack" style="gap: 10px">
              <TrackingBox :site="site" :checking="checking" @check="checkNow" />
              <div class="row">
                <button class="btn sm" @click="editing = true"><Icon name="gear" :size="13" /> Sozlamalar va maqsadlar</button>
                <button class="btn sm" @click="toggleStatus">{{ site.status === "paused" ? "Kuzatuvni qayta yoqish" : "Kuzatuvni to'xtatish" }}</button>
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
        <dt>Ko'rishlar</dt><dd>{{ num(pageSel.views) }}</dd>
        <dt>Sessiyalar (tashriflar)</dt><dd>{{ num(pageSel.sessions) }}</dd>
        <dt>Kirishlar</dt><dd>{{ num(pageSel.entries) }}</dd>
        <dt>Chiqishlar</dt><dd>{{ num(pageSel.exits) }} ({{ pct(pageSel.exitRate) }})</dd>
        <dt>O'rtacha qolish vaqti</dt><dd>{{ dur(pageSel.avgTime) }}</dd>
        <dt>Konversiyali sessiyalar</dt><dd>{{ num(pageSel.convSessions) }}</dd>
      </dl>
      <h4 style="margin: 12px 0 6px">Keyingi o'tishlar</h4>
      <BarList :items="(pageSel.next || []).map((x) => ({ label: x.path, value: x.n }))" />
      <template #foot><button class="btn" @click="(flt.page = pageSel.path), (pageSel = null)">Shu sahifa bo'yicha filtrlash</button></template>
    </Modal>

    <Modal v-if="spendOpen" title="Reklama xarajatlarini import qilish" wide @close="spendOpen = false">
      <p class="small muted">
        Reklama platformasidan (Meta, Google Ads, Yandex) eksport qilingan ma'lumotni CSV ko'rinishida joylang. Ustunlar:
        <code>sana, kampaniya, xarajat, daromad, ko'rishlar, bosishlar, manba</code> — oxirgi to'rttasi ixtiyoriy. Kampaniya nomi <code>utm_campaign</code> bilan bir xil bo'lsin.
      </p>
      <textarea v-model="spendText" class="inp mono" rows="8" placeholder="2026-10-01, kuz_aksiya, 250000, , 12000, 340, instagram"></textarea>
      <div v-if="spendErr" class="note bad" style="margin-top: 8px">{{ spendErr }}</div>
      <h4 style="margin: 14px 0 6px">Import qilingan qatorlar</h4>
      <DataTable :columns="spendCols" :rows="spendList" empty-text="Hali import yo'q">
        <template #del="{ row }"><button class="btn ghost icon sm" aria-label="O'chirish" @click="delSpend(row.id)"><Icon name="x" :size="13" /></button></template>
      </DataTable>
      <template #foot>
        <button class="btn" @click="spendOpen = false">Yopish</button>
        <button class="btn pri" :disabled="!spendText.trim()" @click="importSpend">Import qilish</button>
      </template>
    </Modal>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, defineComponent, h } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, download } from "../api.js";
import { fmt, toast } from "../store.js";
import { useLoad } from "../useLoad.js";
import { waQuery, num, pct, dur, money, change, EVENT_LABEL } from "../wa.js";
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
import { AlertItem, TrackBadge, HealthBadge } from "../components/waBits.js";

const route = useRoute();
const router = useRouter();
const id = computed(() => String(route.params.id));
const SECTIONS = [
  ["s-overview", "Umumiy"], ["s-traffic", "Dinamika"], ["s-sources", "Manbalar"], ["s-pages", "Sahifalar"], ["s-journey", "Yo'l"],
  ["s-campaigns", "Reklama"], ["s-conv", "Konversiyalar"], ["s-devices", "Qurilmalar"], ["s-geo", "Hududlar"], ["s-realtime", "Real vaqt"],
  ["s-health", "Texnik holat"], ["s-alerts", "Ogohlantirishlar"], ["s-setup", "Tracking"],
];
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const cats = ref(["Biznes", "Ta'lim", "Internet do'kon", "Xizmatlar", "Blog / Media", "Portfolio", "Davlat / Jamiyat", "Boshqa"]);

const flt = reactive({ source: "", campaign: "", device: "", page: "", event: "" });
const anyFilter = computed(() => Object.values(flt).some(Boolean));
const clearFilters = () => Object.keys(flt).forEach((k) => (flt[k] = ""));

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
const prevLabel = computed(() => {
  const x = d.value?.range?.prev;
  return x ? (x.from === x.to ? fmt.day(x.from) : fmt.day(x.from) + " — " + fmt.day(x.to)) : "";
});
const tsLabels = computed(() => (d.value.timeseries.hourly ? d.value.timeseries.labels : d.value.timeseries.labels.map((x) => fmt.day(x).replace(/ \d{4}$/, ""))));

const bars = (list, filterKey) =>
  (list || []).slice(0, 10).map((x) => ({
    key: x.key,
    label: x.key,
    value: x.sessions,
    text: num(x.sessions) + " · " + pct(x.share),
    sub: `konv. ${pct(x.conversionRate)} · bounce ${pct(x.bounceRate)}`,
    onClick: filterKey ? () => (flt[filterKey] = x.key) : null,
  }));
const rowsKey = (list) => (list || []).map((x) => ({ ...x, id: x.key }));
const srcCols = [
  { key: "key", label: "Manba" },
  { key: "sessions", label: "Tashriflar", align: "r", fmt: num },
  { key: "visitors", label: "Noyob", align: "r", fmt: num },
  { key: "pageviews", label: "Ko'rishlar", align: "r", fmt: num },
  { key: "avgDuration", label: "O'rt. sessiya", align: "r", fmt: dur },
  { key: "bounceRate", label: "Bounce", align: "r", fmt: pct },
  { key: "conversions", label: "Konv.", align: "r", fmt: num },
  { key: "conversionRate", label: "Konv. %", align: "r", fmt: pct },
];
const pageRows = computed(() => (d.value?.pages || []).map((x) => ({ ...x, id: x.path })));
const pageCols = [
  { key: "path", label: "Sahifa" },
  { key: "views", label: "Ko'rishlar", align: "r", fmt: num },
  { key: "sessions", label: "Tashriflar", align: "r", fmt: num },
  { key: "entries", label: "Kirishlar", align: "r", fmt: num },
  { key: "exits", label: "Chiqishlar", align: "r", fmt: num },
  { key: "exitRate", label: "Chiqish %", align: "r", fmt: pct },
  { key: "avgTime", label: "O'rt. vaqt", align: "r", fmt: dur },
  { key: "convSessions", label: "Konv. sessiya", align: "r", fmt: num },
];
const exitPages = computed(() => (d.value?.pages || []).slice().sort((a, b) => b.exits - a.exits).filter((x) => x.exits > 0));
const highExit = computed(() => (d.value?.pages || []).filter((x) => x.sessions >= 5).sort((a, b) => b.exitRate - a.exitRate).slice(0, 8));
const convPages = computed(() =>
  (d.value?.pages || []).filter((x) => x.convSessions > 0).sort((a, b) => b.convSessions - a.convSessions).slice(0, 8).map((x) => ({ label: x.path, value: x.convSessions, sub: "konversiyali sessiyalar" })),
);
const campCols = [
  { key: "campaign", label: "Kampaniya" },
  { key: "source", label: "Manba" },
  { key: "medium", label: "Turi" },
  { key: "sessions", label: "Tashriflar", align: "r", fmt: num },
  { key: "impressions", label: "Ko'rishlar", align: "r", fmt: num },
  { key: "clicks", label: "Bosishlar", align: "r", fmt: num },
  { key: "conversions", label: "Konv.", align: "r", fmt: num },
  { key: "leads", label: "Leadlar", align: "r", fmt: num },
  { key: "conversionRate", label: "Konv. %", align: "r", fmt: pct },
  { key: "spend", label: "Xarajat", align: "r", fmt: money },
  { key: "revenue", label: "Daromad", align: "r", fmt: (v, r) => (v == null ? "—" : money(v) + (r.revenueSource === "import" ? " (import)" : "")) },
  { key: "cpa", label: "CPA", align: "r", fmt: money },
  { key: "roas", label: "ROAS", align: "r", fmt: (v) => (v == null ? "—" : v + "×") },
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
    .map((x) => ({ label: x.campaign, value: x.revenue || 0, text: money(x.revenue), sub: `xarajat ${money(x.spend)} · ROAS ${x.roas == null ? "—" : x.roas + "×"}` })),
);
const evCols = [
  { key: "t", label: "Vaqt", fmt: (v) => fmt.dt(v), nowrap: true, sortable: false },
  { key: "type", label: "Hodisa", fmt: (v) => EVENT_LABEL[v] || v, sortable: false },
  { key: "path", label: "Sahifa", sortable: false },
  { key: "name", label: "Nomi / qiymat", sortable: false, fmt: (v, r) => [v, r.value != null ? money(r.value) : null, r.refHost ? "← " + r.refHost : null, r.dur != null ? dur(r.dur / 1000) : null].filter(Boolean).join(" · ") || "—" },
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
    toast(r.health.ok ? `Sayt javob berdi: HTTP ${r.health.status}, ${r.health.ms} ms` : "Sayt javob bermadi: " + r.health.error, r.health.ok ? "ok" : "error");
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
  const v = prompt(`Sayt va UNING BARCHA statistikasi butunlay o'chiriladi.\nTasdiqlash uchun domenni yozing: ${site.value.host}`);
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

// Reklama xarajati importi
const spendOpen = ref(false);
const spendText = ref("");
const spendErr = ref("");
const spendList = ref([]);
const spendCols = [
  { key: "date", label: "Sana" },
  { key: "campaign", label: "Kampaniya" },
  { key: "source", label: "Manba" },
  { key: "spend", label: "Xarajat", align: "r", fmt: money },
  { key: "revenue", label: "Daromad", align: "r", fmt: money },
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
    toast(`${r.added} ta qator qo'shildi` + (r.skipped.length ? `, ${r.skipped.length} ta noto'g'ri qator o'tkazib yuborildi (${r.skipped.slice(0, 5).join(", ")})` : ""));
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

// Tracking kodi bloki
const TrackingBox = defineComponent({
  props: { site: Object, checking: Boolean },
  emits: ["check"],
  setup(props, { emit }) {
    const copy = async (text) => {
      try {
        await navigator.clipboard.writeText(text);
        toast("Nusxalandi");
      } catch {
        toast("Nusxalab bo'lmadi — kodni qo'lda belgilang", "error");
      }
    };
    return () => {
      const s = props.site;
      return h("div", { class: "tb" }, [
        h("div", { class: "tb-row" }, [h("span", { class: "muted small" }, "Tracking ID"), h("b", { class: "mono" }, s.trackingId), h(TrackBadge, { site: s }), h("span", { class: "small muted" }, "Oxirgi hodisa: " + (s.lastEventAt ? fmt.dt(s.lastEventAt) : "hali yo'q"))]),
        h("div", { class: "tb-code" }, [h("pre", { class: "mono" }, s.snippet), h("button", { class: "btn sm pri", onClick: () => copy(s.snippet) }, "Nusxalash")]),
        h("ol", { class: "small tb-steps" }, [
          h("li", null, "Kodni saytning barcha sahifalaridagi <head> qismiga joylang (CMS bo'lsa — «Header scripts» bo'limiga)."),
          h("li", null, "Saytni brauzerda oching va bir-ikki sahifani ko'ring."),
          h("li", null, "«Ulanishni tekshirish» tugmasini bosing — hodisalar kela boshlasa, holat «Ishlayapti» bo'ladi va statistika avtomatik yangilanadi."),
          h("li", null, [
            "Lead va xaridlarni yuborish: ",
            h("code", null, "ufq('track','lead')"),
            ", ",
            h("code", null, "ufq('track','purchase',{value:150000})"),
            "; tugma uchun ",
            h("code", null, 'data-ufq-event="nomi"'),
            ", forma uchun ",
            h("code", null, "data-ufq-lead"),
            " atributi.",
          ]),
        ]),
        h("div", { class: "row" }, [
          h("button", { class: "btn sm", disabled: props.checking, onClick: () => emit("check") }, props.checking ? "Tekshirilmoqda…" : "Ulanishni tekshirish"),
          s.health?.snippetFound === true ? h("span", { class: "badge b-good" }, "Kod sahifada topildi") : s.health?.snippetFound === false ? h("span", { class: "badge b-warn" }, "Kod bosh sahifada topilmadi") : null,
        ]),
        h("p", { class: "muted small" }, "Sayt qo'shilishining o'zi oldingi tashriflar tarixini bermaydi — ma'lumot kod o'rnatilgandan keyin yig'iladi. Cookie ishlatilmaydi; maydon qiymatlari, IP va to'liq User-Agent saqlanmaydi."),
      ]);
    };
  },
});
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
.ws-sec { font-size: 16px; display: flex; align-items: center; gap: 8px; scroll-margin-top: 150px; }
section { scroll-margin-top: 150px; }
.kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(185px, 1fr)); gap: 12px; }
.install { border-color: color-mix(in srgb, var(--info) 45%, var(--border)); }
.ell { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 360px; }
.jp { justify-content: space-between; }
.fn-row { display: grid; grid-template-columns: minmax(130px, 34%) 1fr 90px; gap: 10px; align-items: center; margin-bottom: 10px; }
.fn-l { display: flex; flex-direction: column; font-size: 13px; }
.fn-bar { height: 12px; background: var(--surface-3); border-radius: 4px; overflow: hidden; }
.fn-bar i { display: block; height: 100%; background: var(--s3); border-radius: 4px; transition: width 0.4s; }
.fn-v { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
.rt-list { display: grid; gap: 7px; }
.rt-row { display: grid; grid-template-columns: auto 1fr auto; gap: 8px; align-items: center; }
.ws-health { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 14px; }
.ws-health > div { display: grid; gap: 4px; justify-items: start; }
:deep(.tb) { display: grid; gap: 10px; }
:deep(.tb-row) { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
:deep(.tb-code) { display: flex; gap: 8px; align-items: flex-start; }
:deep(.tb-code pre) { flex: 1; margin: 0; padding: 10px 12px; background: var(--surface-3); border-radius: var(--r-sm); white-space: pre-wrap; word-break: break-all; font-size: 12px; }
:deep(.tb-steps) { margin: 0; padding-left: 20px; display: grid; gap: 4px; color: var(--text-2); }
code { font-size: 11.5px; background: var(--surface-3); padding: 1px 4px; border-radius: 4px; }
@media (max-width: 720px) {
  .ws-head-r { justify-items: start; }
  .ws-filters { position: static; }
  .fn-row { grid-template-columns: 1fr 70px; }
  .fn-bar { grid-column: 1 / -1; grid-row: 2; }
}
</style>
