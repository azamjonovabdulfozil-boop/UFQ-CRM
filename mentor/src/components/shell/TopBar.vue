<template>
    <div class="topbar">
      <button
        class="hamburger-btn"
        id="hamburger-btn"
        onclick="toggleSidebar()"
      >
        ☰
      </button>
      <div>
        <div class="topbar-title" id="tb-title">Dashboard</div>
        <div class="topbar-sub" id="tb-sub">Umumiy ko'rinish</div>
      </div>
      <div class="topbar-right">
        <!-- Mentor coin topbar o'chirildi -->
        <!-- Talaba coin balans (faqat talaba ko'radi) -->
        <div
          id="student-coin-topbar"
          style="
            display: none;
            align-items: center;
            gap: 8px;
            background: linear-gradient(135deg, #1a2540, #243060);
            border: 2px solid rgba(34, 211, 238, 0.4);
            border-radius: 18px;
            padding: 4px 12px 4px 8px;
            box-shadow: 0 2px 18px rgba(34, 211, 238, 0.2);
          "
        >
          <span
            style="
              font-size: 22px;
              line-height: 1;
              filter: drop-shadow(0 2px 6px rgba(34, 211, 238, 0.5));
            "
            >🪙</span
          >
          <div style="display: flex; flex-direction: column; line-height: 1.1">
            <span
              id="student-coin-amount"
              style="
                font-size: 24px;
                font-weight: 900;
                color: #22d3ee;
                letter-spacing: 0.01em;
              "
              >0</span
            >
            <span
              style="
                font-size: 10px;
                font-weight: 700;
                color: #67e8f9;
                opacity: 0.8;
              "
              id="student-coin-label"
              >Talaba</span
            >
          </div>
        </div>
        <button
          class="btn btn-sm btn-warning"
          onclick="resetData()"
          id="btn-reset"
        >
          🔄 Reset
        </button>
        <button class="btn btn-sm" onclick="exportData()" id="btn-export">
          ⬇ Export
        </button>
      </div>
    </div>
</template>
