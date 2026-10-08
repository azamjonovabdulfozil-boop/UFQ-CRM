<template>
<ImageLightbox />
<LoginScreen />
<AppLayout />

<AppModals />
<AppToast />
</template>

<script setup>
import ImageLightbox from "./ImageLightbox.vue";
import LoginScreen from "./LoginScreen.vue";
import AppLayout from "./AppLayout.vue";
import AppModals from "./modals/AppModals.vue";
import AppToast from "./AppToast.vue";
</script>
