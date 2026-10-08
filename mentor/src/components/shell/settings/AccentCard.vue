<template>
          <div class="settings-card">
            <div class="settings-card-header">
              <div class="settings-card-ic">🌈</div>
              <div>
                <div class="settings-card-title" data-t="sett_accent_title">
                  Asosiy rang
                </div>
                <div class="settings-card-sub" data-t="sett_accent_sub">
                  Tugmalar va belgilar rangi
                </div>
              </div>
            </div>
            <div class="settings-card-body">
              <div class="accent-grid">
                <div
                  class="accent-swatch"
                  data-color="blue"
                  style="background: linear-gradient(135deg, #3b82f6, #6366f1)"
                  onclick="setAccent('blue', this)"
                ></div>
                <div
                  class="accent-swatch"
                  data-color="teal"
                  style="background: linear-gradient(135deg, #0d9488, #0ea5e9)"
                  onclick="setAccent('teal', this)"
                ></div>
                <div
                  class="accent-swatch"
                  data-color="purple"
                  style="background: linear-gradient(135deg, #7c3aed, #6366f1)"
                  onclick="setAccent('purple', this)"
                ></div>
                <div
                  class="accent-swatch"
                  data-color="orange"
                  style="background: linear-gradient(135deg, #ea580c, #d97706)"
                  onclick="setAccent('orange', this)"
                ></div>
                <div
                  class="accent-swatch"
                  data-color="rose"
                  style="background: linear-gradient(135deg, #e11d48, #ec4899)"
                  onclick="setAccent('rose', this)"
                ></div>
                <div
                  class="accent-swatch"
                  data-color="green"
                  style="background: linear-gradient(135deg, #059669, #10b981)"
                  onclick="setAccent('green', this)"
                ></div>
              </div>
            </div>
          </div>
</template>
