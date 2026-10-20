<template>
          <div class="settings-card">
            <div class="settings-card-header">
              <div class="settings-card-ic">🎨</div>
              <div>
                <div class="settings-card-title" data-t="sett_theme_title">
                  Fon va Rang Sxemasi
                </div>
                <div class="settings-card-sub" data-t="sett_theme_sub">
                  Yorug' yoki qorong'i rejim tanlang
                </div>
              </div>
            </div>
            <div class="settings-card-body">
              <div class="theme-grid">
                <div
                  class="theme-opt"
                  id="theme-light"
                  onclick="setTheme('light')"
                >
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
                  <div class="theme-label" data-t="theme_light">☀️ Yorug'</div>
                </div>
                <div
                  class="theme-opt"
                  id="theme-auto"
                  onclick="setTheme('auto')"
                >
                  <div class="theme-preview theme-preview-auto">
                    <div
                      style="width: 50%; height: 100%; background: #f0f4f8"
                    ></div>
                    <div
                      style="width: 50%; height: 100%; background: #0d1520"
                    ></div>
                  </div>
                  <div class="theme-label" data-t="theme_auto">
                    🔄 Avtomatik
                  </div>
                </div>
                <div
                  class="theme-opt"
                  id="theme-black"
                  onclick="setTheme('black')"
                >
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
                  <div class="theme-label" data-t="theme_black">⚫ Qora</div>
                </div>
              </div>
            </div>
          </div>
</template>
