<template>
<div
  class="overlay"
  id="del-overlay"
  onclick="if (event.target === this) closeDelModal();"
>
  <div class="modal del-modal" onclick="event.stopPropagation()">
    <div class="modal-head">
      <div class="modal-title" style="color: var(--text)">
        🗑 O'chirishni tasdiqlang
      </div>
      <button class="m-close" onclick="closeDelModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="del-warning">
        <b>Diqqat!</b> Bu amalni qaytarib bo'lmaydi. O'chirish uchun nomni aniq
        yozing:<br /><br />
        <code
          id="del-target-name"
          style="
            background: var(--bg4);
            padding: 4px 10px;
            border-radius: 6px;
            font-family: &quot;JetBrains Mono&quot;, monospace;
            font-size: 13px;
            color: var(--text);
          "
        ></code>
      </div>
      <div style="margin-top: 12px">
        <label
          style="
            font-size: 12px;
            font-weight: 600;
            color: var(--text3);
            display: block;
            margin-bottom: 6px;
          "
          >Nomni yozing</label
        >
        <input
          class="del-confirm-input"
          id="del-input"
          type="text"
          placeholder="Nomni kiriting..."
          oninput="checkDelInput()"
        />
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="closeDelModal()">Bekor qilish</button>
      <button
        class="btn btn-del-confirm"
        id="del-confirm-btn"
        disabled
        onclick="executeDelete()"
        style="opacity: 0.4; cursor: not-allowed"
      >
        O'chirish
      </button>
    </div>
  </div>
</div>
</template>
