<template>
    <button class="nav-btn" id="nav-students" onclick="go('students', this)">
      <span class="nav-ic">🧑‍💻</span><span data-t="students">Talabalar</span>
      <span class="nav-count" id="nc-students">0</span>
    </button>
    <button class="nav-btn" id="nav-finance" onclick="go('finance', this)">
      <span class="nav-ic">💰</span><span data-t="finance">Moliya</span>
    </button>
    <button class="nav-btn" id="nav-coin-shop" onclick="go('coin-shop', this)">
      <span class="nav-ic">🪙</span
      ><span data-t="nav_coin_shop">Coin Shop</span>
    </button>
    <button
      class="nav-btn"
      id="nav-student-coin-shop"
      onclick="go('student-coin-shop', this)"
      style="display: none"
    >
      <span class="nav-ic">🛍️</span><span>Coin Shop</span>
    </button>
    <button class="nav-btn" id="nav-settings" onclick="go('settings', this)">
      <span class="nav-ic">⚙️</span><span data-t="settings">Sozlamalar</span>
    </button>
</template>
