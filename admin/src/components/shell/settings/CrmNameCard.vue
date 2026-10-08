<template>
          <div class="settings-card" id="sett-name-card">
            <div class="settings-card-header">
              <div class="settings-card-ic">🏷️</div>
              <div>
                <div class="settings-card-title" data-t="sett_name_title">
                  CRM Nomi
                </div>
                <div class="settings-card-sub" data-t="sett_name_sub">
                  Tizim nomini o'zgartiring
                </div>
              </div>
            </div>
            <div class="settings-card-body">
              <div class="fg">
                <label data-t="sett_crm_name_label">CRM Nomi</label>
                <input
                  type="text"
                  id="sett-crm-name"
                  placeholder="EduManage"
                  oninput="previewCrmName()"
                />
              </div>
              <div
                style="
                  display: flex;
                  align-items: center;
                  gap: 10px;
                  margin-top: 8px;
                "
              >
                <div
                  style="font-size: 12px; color: var(--text2)"
                  data-t="sett_preview"
                >
                  Ko'rinish:
                </div>
                <div
                  style="
                    font-size: 18px;
                    font-weight: 800;
                    letter-spacing: -0.6px;
                    background: linear-gradient(
                      135deg,
                      var(--accent),
                      var(--teal)
                    );
                    -webkit-background-clip: text;
                    background-clip: text;
                    color: transparent;
                  "
                  id="sett-name-preview"
                >
                  EduManage
                </div>
              </div>
              <button
                class="btn btn-primary sett-save-btn"
                onclick="saveCrmName()"
                style="margin-top: 14px"
                data-t="sett_save"
              >
                💾 Saqlash
              </button>
            </div>
          </div>
</template>
