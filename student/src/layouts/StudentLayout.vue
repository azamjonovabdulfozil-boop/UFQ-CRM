<template>
  <div id="crm-root">
    <BootScreen
      v-if="booting || bootError"
      :error="bootError || ''"
      @retry="reload"
    />
    <!-- CRM belgilashi — to'liq Vue komponentlarida -->
    <div v-show="!booting && !bootError">
      <CrmShell />
    </div>
  </div>
</template>

<script setup>
import BootScreen from "../components/BootScreen.vue";
import CrmShell from "../components/shell/CrmShell.vue";
import { useCrmBoot } from "../lib/crmBoot.js";

const { booting, bootError, reload } = useCrmBoot({
  role: "Talaba",
  portalLabel: "Talaba",
  logTag: "Student",
});
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
html,
body {
  height: 100%;
  max-width: 100%;
  overflow-x: hidden;
}
#crm-root {
  --boot-accent: #f59e0b;
  min-height: 100vh;
  min-height: 100dvh;
  max-width: 100%;
  overflow-x: hidden;
}
</style>
