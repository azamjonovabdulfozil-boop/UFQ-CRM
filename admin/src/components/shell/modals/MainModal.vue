<template>
<div
  class="overlay"
  id="overlay"
  onclick="if (event.target === this) closeModal();"
>
  <div class="modal" id="modal-box" onclick="event.stopPropagation()">
    <div class="modal-head">
      <div class="modal-title" id="m-title">Qo'shish</div>
      <button class="m-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body" id="m-body"></div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal()" data-t="cancel">Bekor</button>
      <button class="btn btn-primary" onclick="saveModal()" data-t="save">
        💾 Saqlash
      </button>
    </div>
  </div>
</div>
</template>
