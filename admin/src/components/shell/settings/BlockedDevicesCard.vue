<template>
  <!--
    Bloklangan qurilmalar.

    Parolni bir necha marta xato kiritgan QURILMA vaqtincha bloklanadi
    (internet/Wi-Fi emas — yonidagi boshqa telefon bemalol kiraveradi).
    Admin bu yerdan blokni muddatidan oldin ochib bera oladi.
  -->
  <div class="settings-card" id="blocked-devices-card">
    <div class="settings-card-header">
      <div class="settings-card-ic">🔒</div>
      <div>
        <div class="settings-card-title">Bloklangan qurilmalar</div>
        <div class="settings-card-sub">
          Parolni ko'p marta xato kiritgan qurilmalar. Blok faqat o'sha
          qurilmaga tegadi — internet yoki hisobga emas.
        </div>
      </div>
    </div>
    <div class="settings-card-body">
      <div id="blocked-devices-list" style="display: flex; flex-direction: column; gap: 8px">
        <div style="font-size: 12px; color: var(--text3)">Yuklanmoqda…</div>
      </div>
      <button
        class="btn btn-sm"
        style="margin-top: 10px"
        onclick="renderBlockedDevices()"
      >
        🔄 Yangilash
      </button>
    </div>
  </div>
</template>
