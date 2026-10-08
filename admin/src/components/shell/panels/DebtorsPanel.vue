<template>
  <!-- QARZDORLAR — faqat qarzdor talabalar (core/debtors.js chizadi) -->
  <div id="panel-debtors" class="panel">
    <div class="debt-stats" id="debtor-stats"></div>

    <div class="toolbar">
      <div class="search-box">
        <input
          type="text"
          id="s-debtor"
          placeholder="Qarzdor talabani qidirish..."
          oninput="renderDebtors()"
        />
      </div>
      <select class="fsel" id="filter-debtor-group" onchange="renderDebtors()">
        <option value="">Barcha guruh</option>
      </select>
      <select class="fsel" id="filter-debtor-tg" onchange="renderDebtors()">
        <option value="">Kanal — barchasi</option>
        <option value="tg">📨 Guruhi Telegramga ulangan</option>
        <option value="sms">📱 SMS uchun raqami bor</option>
        <option value="none">⚠️ Hech qaysi kanal ishlamaydi</option>
      </select>
      <label class="debt-selectall">
        <input
          type="checkbox"
          id="debtor-selectall"
          onchange="toggleAllDebtors(this.checked)"
        />
        Hammasini tanlash
      </label>
      <button class="btn" onclick="loadDebtorLinks()">🔄 Yangilash</button>
    </div>

    <div class="debt-actionbar" id="debtor-actionbar">
      <span class="debt-selcount" id="debtor-selcount">0 ta talaba tanlandi</span>
      <!-- Ikkita kanal — ikkita alohida tugma. Qaysi biri bosilsa, xabar
           faqat o'sha kanal orqali ketadi (ikkalasiga birdan emas). -->
      <button class="btn btn-primary" onclick="openDebtorMessage('parents')">
        📨 Ota-onalar guruhiga
      </button>
      <button class="btn btn-primary" onclick="openDebtorMessage('sms')">
        📱 SMS jo'natish
      </button>
      <button class="btn" onclick="toggleAllDebtors(false)">✕ Bekor qilish</button>
    </div>

    <div class="list-box" id="debtor-list"></div>
  </div>
</template>
