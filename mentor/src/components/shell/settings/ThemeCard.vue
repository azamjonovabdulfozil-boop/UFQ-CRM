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
                  id="theme-snow"
                  onclick="setTheme('snow')"
                >
                  <div
                    class="theme-preview"
                    style="
                      background: linear-gradient(135deg, #e8f4fd, #f0f8ff);
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      font-size: 28px;
                    "
                  >
                    ❄️
                  </div>
                  <div class="theme-label" data-t="theme_snow">❄️ Qor</div>
                </div>
              </div>
            </div>
          </div>
</template>
