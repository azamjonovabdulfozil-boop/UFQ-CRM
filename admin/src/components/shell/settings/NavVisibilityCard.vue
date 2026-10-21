<template>
          <!-- BO'LIMLAR — kerak bo'lmagan bo'limni menyudan yashirish.
               Ro'yxatni core/nav-visibility.js rolga qarab to'ldiradi. -->
          <div class="settings-card" id="sett-nav-card">
            <div class="settings-card-header">
              <div class="settings-card-ic"><span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 17.5h7M17.5 14v7"/></svg></span></div>
              <div>
                <div class="settings-card-title" id="sett-nav-title">Bo'limlar</div>
                <div class="settings-card-sub" id="sett-nav-sub">
                  Kerak bo'lmagan bo'limni o'chiring — u menyudan yo'qoladi
                </div>
              </div>
            </div>
            <div class="settings-card-body">
              <div class="navvis-list" id="sett-nav-list"></div>
            </div>
          </div>
</template>
