<template>
<div
  class="overlay"
  id="salary-overlay"
  onclick="if (event.target === this) closeMentorSalaryModal();"
>
  <div class="modal modal-wide" onclick="event.stopPropagation()">
    <div class="modal-head">
      <div class="modal-title">🎓 Mentor oylik</div>
      <button class="m-close" onclick="closeMentorSalaryModal()">✕</button>
    </div>
    <div class="modal-body" id="salary-modal-body"></div>
    <div class="modal-foot">
      <button class="btn" onclick="closeMentorSalaryModal()">Yopish</button>
    </div>
  </div>
</div>
</template>
