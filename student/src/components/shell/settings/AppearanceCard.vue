<template>
          <!-- KO'RINISH — mavzu, asosiy rang va matn o'lchami bitta panelda.
               id / class / onclick'lar core skriptlar (setTheme, setAccent,
               setFontSize, renderSettingsPanel) bilan bog'langan — o'zgartirmang. -->
          <div class="settings-card sett-appearance">
            <div class="sa-row">
              <div class="sa-label">
                <div class="sa-title" data-t="sett_theme_title">Fon va Rang Sxemasi</div>
                <div class="sa-sub" data-t="sett_theme_sub">Yorug' yoki qorong'i rejim tanlang</div>
              </div>
              <div class="sa-control">
                <div class="theme-grid">
                  <div class="theme-opt" id="theme-light" onclick="setTheme('light')">
                    <div class="theme-preview theme-preview-light">
                      <div class="tp-sidebar"></div>
                      <div class="tp-main">
                        <div class="tp-bar"></div>
                        <div class="tp-cards">
                          <div class="tp-card"></div>
                          <div class="tp-card"></div>
                        </div>
                      </div>
                    </div>
                    <div class="theme-label" data-t="theme_light">Yorug'</div>
                  </div>
                  <div class="theme-opt" id="theme-auto" onclick="setTheme('auto')">
                    <div class="theme-preview theme-preview-auto">
                      <div style="width: 50%; height: 100%; background: #f0f4f8"></div>
                      <div style="width: 50%; height: 100%; background: #0d1520"></div>
                    </div>
                    <div class="theme-label" data-t="theme_auto">Avtomatik</div>
                  </div>
                  <div class="theme-opt" id="theme-black" onclick="setTheme('black')">
                    <div class="theme-preview" style="background: #000; display: flex; overflow: hidden">
                      <div style="width: 30%; height: 100%; background: #0d0d0f; border-right: 1px solid #222"></div>
                      <div style="flex: 1; padding: 8px; display: flex; flex-direction: column; gap: 6px">
                        <div style="height: 8px; border-radius: 4px; background: #1c1c20"></div>
                        <div style="display: flex; gap: 6px; flex: 1">
                          <div style="flex: 1; border-radius: 6px; background: #141416"></div>
                          <div style="flex: 1; border-radius: 6px; background: #141416"></div>
                        </div>
                      </div>
                    </div>
                    <div class="theme-label" data-t="theme_black">Qora</div>
                  </div>
                </div>
              </div>
            </div>

            <div class="sa-row">
              <div class="sa-label">
                <div class="sa-title" data-t="sett_accent_title">Asosiy rang</div>
                <div class="sa-sub" data-t="sett_accent_sub">Tugmalar va belgilar rangi</div>
              </div>
              <div class="sa-control">
                <div class="accent-grid">
                  <div class="acc-opt" role="button" tabindex="0" onclick="setAccent('blue', this)">
                    <div class="accent-swatch" data-color="blue" style="background: linear-gradient(135deg, #3b82f6, #6366f1)"></div>
                    <span data-t="acc_blue">Ko'k</span>
                  </div>
                  <div class="acc-opt" role="button" tabindex="0" onclick="setAccent('teal', this)">
                    <div class="accent-swatch" data-color="teal" style="background: linear-gradient(135deg, #0d9488, #0ea5e9)"></div>
                    <span data-t="acc_teal">Moviy</span>
                  </div>
                  <div class="acc-opt" role="button" tabindex="0" onclick="setAccent('purple', this)">
                    <div class="accent-swatch" data-color="purple" style="background: linear-gradient(135deg, #7c3aed, #a855f7)"></div>
                    <span data-t="acc_purple">Binafsha</span>
                  </div>
                  <div class="acc-opt" role="button" tabindex="0" onclick="setAccent('orange', this)">
                    <div class="accent-swatch" data-color="orange" style="background: linear-gradient(135deg, #ea580c, #f59e0b)"></div>
                    <span data-t="acc_orange">To'q sariq</span>
                  </div>
                  <div class="acc-opt" role="button" tabindex="0" onclick="setAccent('rose', this)">
                    <div class="accent-swatch" data-color="rose" style="background: linear-gradient(135deg, #e11d48, #ec4899)"></div>
                    <span data-t="acc_rose">Pushti</span>
                  </div>
                  <div class="acc-opt" role="button" tabindex="0" onclick="setAccent('green', this)">
                    <div class="accent-swatch" data-color="green" style="background: linear-gradient(135deg, #059669, #22c55e)"></div>
                    <span data-t="acc_green">Yashil</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="sa-row">
              <div class="sa-label">
                <div class="sa-title" data-t="sett_font_title">Matn o'lchami</div>
                <div class="sa-sub" data-t="sett_font_sub">Interfeys yozuvlari katta-kichikligini sozlang</div>
              </div>
              <div class="sa-control">
                <div class="font-size-row">
                  <button class="font-size-btn" id="fs-sm" onclick="setFontSize('sm')">
                    <span class="fs-a" style="font-size: 12px">A</span><span data-t="font_sm">Kichik</span>
                  </button>
                  <button class="font-size-btn" id="fs-md" onclick="setFontSize('md')">
                    <span class="fs-a" style="font-size: 15px">A</span><span data-t="font_md">O'rta</span>
                  </button>
                  <button class="font-size-btn" id="fs-lg" onclick="setFontSize('lg')">
                    <span class="fs-a" style="font-size: 19px">A</span><span data-t="font_lg">Katta</span>
                  </button>
                  <button class="font-size-btn" id="fs-xl" onclick="setFontSize('xl')">
                    <span class="fs-a" style="font-size: 23px">A</span><span data-t="font_xl">Juda katta</span>
                  </button>
                </div>
                <div id="font-preview" class="sa-preview">
                  <div class="sa-preview-title">Namuna matn</div>
                  Bugun 5-dars — Kasrlar. Uyga vazifa: 25-bet, 3–7-mashqlar.
                </div>
              </div>
            </div>
          </div>
</template>
