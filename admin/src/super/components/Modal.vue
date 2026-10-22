<template>
  <Teleport to="body">
    <div class="modal-bg" @mousedown.self="$emit('close')" @keydown.esc="$emit('close')">
      <div class="modal" :class="{ wide }" role="dialog" aria-modal="true" :aria-label="title" ref="box" tabindex="-1">
        <div class="modal-h">
          <h3>{{ title }}</h3>
          <button class="btn ghost icon" aria-label="Yopish" @click="$emit('close')"><Icon name="close" /></button>
        </div>
        <div class="modal-b"><slot /></div>
        <div v-if="$slots.foot" class="modal-f"><slot name="foot" /></div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, onMounted } from "vue";
import Icon from "./Icon.vue";
defineProps({ title: String, wide: Boolean });
defineEmits(["close"]);
const box = ref(null);
onMounted(() => box.value && box.value.focus());
</script>
