<template>
          <div class="settings-card">
            <div class="settings-card-header">
              <div class="settings-card-ic">💾</div>
              <div>
                <div class="settings-card-title" data-t="sett_data_title">
                  Ma'lumotlar
                </div>
                <div class="settings-card-sub" data-t="sett_data_sub">
                  Export, import va tozalash
                </div>
              </div>
            </div>
            <div class="settings-card-body">
              <div style="display: flex; flex-direction: column; gap: 10px">
                <button class="btn sett-action-btn" onclick="exportData()">
                  ⬇ Ma'lumotlarni export qilish (JSON)
                </button>
                <button
                  class="btn sett-action-btn btn-warning"
                  onclick="resetData()"
                >
                  🔄 Barcha ma'lumotlarni tiklash (Demo)
                </button>
              </div>
            </div>
          </div>
</template>
