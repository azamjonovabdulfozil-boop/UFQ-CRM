<template>
<div
  class="overlay"
  id="detail-overlay"
  onclick="if (event.target === this) closeDetail();"
>
  <div class="modal modal-wide" onclick="event.stopPropagation()">
    <div class="modal-head">
      <div class="modal-title" id="detail-title">Ma'lumot</div>
      <button class="m-close" onclick="closeDetail()">✕</button>
    </div>
    <div class="modal-body" id="detail-body"></div>
    <div class="modal-foot" id="detail-foot">
      <button class="btn" onclick="closeDetail()" data-t="close">Yopish</button>
      <button class="btn btn-primary" id="detail-edit-btn" data-t="edit_btn">
        ✏️ Tahrirlash
      </button>
    </div>
  </div>
</div>
</template>
