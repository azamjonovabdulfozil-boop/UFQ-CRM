<template>
<div class="layout" id="crm-app" style="display: none">
  <AppSidebar />
  <div
    class="sidebar-overlay"
    id="sidebar-overlay"
    onclick="toggleSidebar()"
  ></div>

  <div class="main">
    <TopBar />
    <div class="scroll" id="scroll">
      <PanelsArea />
    </div>
  </div>
</div>
</template>

<script setup>
import AppSidebar from "./sidebar/AppSidebar.vue";
import TopBar from "./TopBar.vue";
import PanelsArea from "./panels/PanelsArea.vue";
</script>
