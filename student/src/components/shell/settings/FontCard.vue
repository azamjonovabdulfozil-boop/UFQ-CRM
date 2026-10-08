<template>
          <div class="settings-card">
            <div class="settings-card-header">
              <div class="settings-card-ic">🔤</div>
              <div>
                <div class="settings-card-title" data-t="sett_font_title">
                  Matn o'lchami
                </div>
                <div class="settings-card-sub" data-t="sett_font_sub">
                  Interfeys yozuvlari katta-kichikligini sozlang
                </div>
              </div>
            </div>
            <div class="settings-card-body">
              <div class="font-size-row">
                <button
                  class="font-size-btn"
                  id="fs-sm"
                  onclick="setFontSize('sm')"
                >
                  <span style="font-size: 11px; font-weight: 700">A</span
                  ><span
                    style="font-size: 11px; color: var(--text2)"
                    data-t="font_sm"
                    >Kichik</span
                  >
                </button>
                <button
                  class="font-size-btn"
                  id="fs-md"
                  onclick="setFontSize('md')"
                >
                  <span style="font-size: 15px; font-weight: 700">A</span
                  ><span
                    style="font-size: 11px; color: var(--text2)"
                    data-t="font_md"
                    >O'rta</span
                  >
                </button>
                <button
                  class="font-size-btn"
                  id="fs-lg"
                  onclick="setFontSize('lg')"
                >
                  <span style="font-size: 20px; font-weight: 700">A</span
                  ><span
                    style="font-size: 11px; color: var(--text2)"
                    data-t="font_lg"
                    >Katta</span
                  >
                </button>
                <button
                  class="font-size-btn"
                  id="fs-xl"
                  onclick="setFontSize('xl')"
                >
                  <span style="font-size: 26px; font-weight: 700">A</span
                  ><span
                    style="font-size: 11px; color: var(--text2)"
                    data-t="font_xl"
                    >Juda katta</span
                  >
                </button>
              </div>
            </div>
          </div>
</template>
