<template>
      <!-- ===================== MOLIYA PANELI ===================== -->
      <div id="panel-finance" class="panel">
        <!-- Oy tanlash -->
        <div class="fin-month-nav" id="fin-month-nav"></div>

        <!-- Umumiy balans kartochkalar -->
        <div class="fin-summary-row" id="fin-summary-row"></div>

        <!-- Kirim/Chiqim qo'shish tugmalari -->
        <div class="fin-action-bar">
          <button class="btn btn-primary" onclick="openFinModal('income')">
            ➕ Kirim qo'shish
          </button>
          <button
            class="btn"
            style="
              background: var(--orange-light);
              color: var(--orange-text);
              border-color: rgba(234, 88, 12, 0.3);
            "
            onclick="openFinModal('expense')"
          >
            ➖ Chiqim qo'shish
          </button>
          <button
            class="btn"
            style="
              background: var(--purple-light);
              color: var(--purple-text);
              border-color: rgba(124, 58, 237, 0.3);
            "
            onclick="openMentorSalaryModal()"
          >
            🎓 Mentor oylik
          </button>
          <div style="flex: 1"></div>
          <select class="fsel" id="fin-filter-type" onchange="renderFinance()">
            <option value="">Barchasi</option>
            <option value="income">💚 Kirim</option>
            <option value="expense">🔴 Chiqim</option>
            <option value="salary">🎓 Mentor oylik</option>
          </select>
        </div>

        <!-- Tranzaksiyalar ro'yxati -->
        <div class="fin-transactions" id="fin-transactions"></div>
      </div>
</template>
