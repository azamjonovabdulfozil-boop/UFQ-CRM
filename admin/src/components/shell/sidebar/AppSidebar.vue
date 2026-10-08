<template>
  <aside class="sidebar" id="sidebar">
    <SidebarBrand />
    <NavMain />
    <NavMentor />
    <NavStudent />
    <NavExtra />

    <SidebarFooter />
  </aside>
</template>

<script setup>
import SidebarBrand from "./SidebarBrand.vue";
import NavMain from "./NavMain.vue";
import NavMentor from "./NavMentor.vue";
import NavStudent from "./NavStudent.vue";
import NavExtra from "./NavExtra.vue";
import SidebarFooter from "./SidebarFooter.vue";
</script>
