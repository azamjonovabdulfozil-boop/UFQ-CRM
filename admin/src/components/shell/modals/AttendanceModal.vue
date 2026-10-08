<template>
<div
  class="overlay"
  id="stat-overlay"
  onclick="if (event.target === this) closeStatModal();"
>
  <div
    class="modal modal-att-fullscreen"
    id="stat-modal-inner"
    onclick="event.stopPropagation()"
  >
    <div class="att-header">
      <div
        style="
          display: flex;
          align-items: center;
          gap: 14px;
          flex: 1;
          min-width: 0;
        "
      >
        <div>
          <div
            style="font-size: 18px; font-weight: 800; letter-spacing: -0.5px"
            id="stat-modal-title"
          >
            Davomat
          </div>
          <div
            style="font-size: 12px; color: var(--text2); margin-top: 2px"
            id="att-group-info"
          ></div>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0">
        <div
          style="
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            color: var(--text2);
          "
        >
          <span
            style="
              display: inline-flex;
              align-items: center;
              justify-content: center;
              width: 26px;
              height: 22px;
              border-radius: 5px;
              border: 1.5px solid var(--teal);
              background: var(--teal-light);
              color: var(--teal-text);
              font-size: 11px;
              font-weight: 700;
              font-family: &quot;JetBrains Mono&quot;, monospace;
            "
            >K</span
          >Keldi
          <span
            style="
              display: inline-flex;
              align-items: center;
              justify-content: center;
              width: 26px;
              height: 22px;
              border-radius: 5px;
              border: 1.5px solid var(--amber);
              background: var(--amber-light);
              color: var(--amber-text);
              font-size: 11px;
              font-weight: 700;
              font-family: &quot;JetBrains Mono&quot;, monospace;
              margin-left: 8px;
            "
            >Y</span
          >Yo'q
          <span
            style="
              display: inline-flex;
              align-items: center;
              justify-content: center;
              width: 26px;
              height: 22px;
              border-radius: 5px;
              border: 1.5px solid var(--purple);
              background: var(--purple-light);
              color: var(--purple-text);
              font-size: 11px;
              font-weight: 700;
              font-family: &quot;JetBrains Mono&quot;, monospace;
              margin-left: 8px;
            "
            >S</span
          >Sababli
        </div>
        <button
          class="m-close"
          onclick="closeStatModal()"
          style="margin-left: 8px"
        >
          ✕
        </button>
      </div>
    </div>
    <div class="att-month-nav" id="att-month-nav"></div>
    <div class="att-body"><div id="att-table-wrap"></div></div>
    <div
      style="
        padding: 10px 20px;
        border-top: 1px solid var(--border);
        font-size: 11px;
        color: var(--text3);
        background: var(--bg2);
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: 16px;
      "
    >
      <span
        >💾 O'zgarishlar avtomatik saqlanadi · K=keldi · Y=yo'q · S=sababli ·
        K/Y/S — uchalasi ham to'lovga kiradi · 12 dars = Qarzdor</span
      >
      <span
        id="att-save-indicator"
        style="color: var(--teal-text); font-weight: 600"
      ></span>
    </div>
  </div>
</div>
</template>
