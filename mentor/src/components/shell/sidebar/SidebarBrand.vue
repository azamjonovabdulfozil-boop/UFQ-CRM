<template>
    <div class="logo">
      <div class="logo-mark logo-default" id="sidebar-logo-mark"><img :src="ufqLogo" alt="UFQ CRM" style="width:100%;height:100%;object-fit:contain;display:block"></div>
      <div>
        <div class="logo-name" id="sidebar-crm-name">UFQ CRM</div>
        <div class="logo-tag">v8.0 • CRM</div>
      </div>
    </div>
    <div class="lang-row">
      <button class="lang-btn" id="lb-uz" onclick="setLang('uz', this)">
        O'Z
      </button>
      <button class="lang-btn" id="lb-ru" onclick="setLang('ru', this)">
        РУ
      </button>
      <button class="lang-btn" id="lb-en" onclick="setLang('en', this)">
        EN
      </button>
    </div>
    <div class="nav-label" data-t="menu">Menyu</div>
</template>

<script setup>
// Standart logo — Sozlamalarda boshqa logo yuklansa, applyLogo() almashtiradi
import ufqLogo from "../../../assets/ufq-logo.png";
</script>
