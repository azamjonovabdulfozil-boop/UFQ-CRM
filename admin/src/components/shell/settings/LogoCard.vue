<template>
          <div class="settings-card" id="sett-logo-card">
            <div class="settings-card-header">
              <div class="settings-card-ic">🖼️</div>
              <div>
                <div class="settings-card-title" data-t="sett_logo_title">
                  CRM Logotipi
                </div>
                <div class="settings-card-sub" data-t="sett_logo_sub">
                  Sidebar va login ekranidagi rasm
                </div>
              </div>
            </div>
            <div class="settings-card-body">
              <div
                style="
                  display: flex;
                  align-items: center;
                  gap: 20px;
                  margin-bottom: 16px;
                "
              >
                <div
                  id="sett-logo-preview"
                  style="
                    width: 64px;
                    height: 64px;
                    border-radius: 16px;
                    background: linear-gradient(
                      135deg,
                      var(--accent),
                      var(--teal)
                    );
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #fff;
                    font-weight: 800;
                    font-size: 26px;
                    flex-shrink: 0;
                    overflow: hidden;
                    border: 2px solid var(--border2);
                  "
                >
                  E
                </div>
                <div>
                  <div
                    style="
                      font-size: 13px;
                      font-weight: 600;
                      color: var(--text);
                    "
                    data-t="sett_logo_current"
                  >
                    Joriy logotip
                  </div>
                  <div
                    style="
                      font-size: 11px;
                      color: var(--text3);
                      margin-top: 3px;
                    "
                    data-t="sett_logo_hint"
                  >
                    JPG, PNG, WEBP · Max 2MB · 64×64 tavsiya
                  </div>
                </div>
              </div>
              <div
                class="sett-upload-zone"
                onclick="document.getElementById('sett-logo-input').click()"
              >
                <input
                  type="file"
                  id="sett-logo-input"
                  accept="image/*"
                  style="display: none"
                  onchange="handleLogoUpload(this)"
                />
                <div style="font-size: 28px; margin-bottom: 6px">📁</div>
                <div
                  style="font-size: 13px; font-weight: 600; color: var(--text)"
                  data-t="sett_upload_click"
                >
                  Bosib yuklang
                </div>
                <div
                  style="font-size: 11px; color: var(--text3); margin-top: 3px"
                >
                  yoki sudrab tashlang
                </div>
              </div>
              <button
                class="btn btn-del-outline sett-save-btn"
                onclick="removeLogo()"
                style="margin-top: 10px; font-size: 12px"
                data-t="sett_logo_remove"
              >
                🗑 Logotipni o'chirish
              </button>
            </div>
          </div>
</template>
