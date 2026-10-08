<template>
    <div class="sidebar-foot">
      <div style="padding: 0 8px 12px">
        <div class="storage-badge" id="storage-status">💾 Saqlangan</div>
      </div>
      <div class="user-row">
        <div style="display: flex; align-items: center; gap: 12px">
          <div class="u-av">AD</div>
          <div>
            <div class="u-name">Admin</div>
            <div class="u-role" data-t="super_admin">Super Admin</div>
          </div>
        </div>
        <button class="logout-btn" onclick="doLogout()" data-t="logout">
          Chiqish
        </button>
      </div>
    </div>
</template>
