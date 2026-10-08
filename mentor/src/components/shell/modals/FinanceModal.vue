<template>
<div
  class="overlay"
  id="fin-overlay"
  onclick="if (event.target === this) closeFinModal();"
>
  <div class="modal" onclick="event.stopPropagation()">
    <div class="modal-head">
      <div class="modal-title" id="fin-modal-title">Kirim qo'shish</div>
      <button class="m-close" onclick="closeFinModal()">✕</button>
    </div>
    <div class="modal-body" id="fin-modal-body"></div>
    <div class="modal-foot">
      <button class="btn" onclick="closeFinModal()">Bekor</button>
      <button class="btn btn-primary" onclick="saveFinTransaction()">
        💾 Saqlash
      </button>
    </div>
  </div>
</div>
</template>
