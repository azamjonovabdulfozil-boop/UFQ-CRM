<template>
          <div class="settings-card" id="admin-creds-card">
            <div class="settings-card-header">
              <div class="settings-card-ic">👑</div>
              <div>
                <div class="settings-card-title">Admin login / parol</div>
                <div class="settings-card-sub">
                  O'zingizning kirish ma'lumotlaringizni o'zgartiring
                </div>
              </div>
            </div>
            <div class="settings-card-body">
              <div
                style="
                  font-size: 12px;
                  color: var(--text3);
                  margin-bottom: 10px;
                "
              >
                Joriy login:
                <b
                  style="
                    color: var(--text);
                    font-family: &quot;JetBrains Mono&quot;, monospace;
                  "
                  id="sett-admin-current"
                  >admin</b
                >
              </div>
              <div style="display: flex; flex-direction: column; gap: 10px">
                <div class="fg">
                  <label
                    style="
                      font-size: 12px;
                      font-weight: 600;
                      color: var(--text3);
                    "
                    >Yangi login</label
                  >
                  <input
                    type="text"
                    id="sett-admin-login"
                    placeholder="admin"
                    autocomplete="off"
                    style="margin-top: 4px"
                  />
                </div>
                <div class="fg">
                  <label
                    style="
                      font-size: 12px;
                      font-weight: 600;
                      color: var(--text3);
                    "
                    >Yangi parol</label
                  >
                  <input
                    type="password"
                    id="sett-admin-pass"
                    placeholder="••••••••"
                    autocomplete="new-password"
                    style="margin-top: 4px"
                  />
                </div>
                <div class="fg">
                  <label
                    style="
                      font-size: 12px;
                      font-weight: 600;
                      color: var(--text3);
                    "
                    >Parolni qayta kiriting</label
                  >
                  <input
                    type="password"
                    id="sett-admin-pass2"
                    placeholder="••••••••"
                    autocomplete="new-password"
                    style="margin-top: 4px"
                  />
                </div>
                <button
                  class="btn btn-primary"
                  onclick="saveAdminCredentials()"
                  style="margin-top: 4px"
                >
                  👑 Saqlash
                </button>
                <div
                  style="
                    font-size: 11px;
                    color: var(--text3);
                    line-height: 1.5;
                    margin-top: 4px;
                  "
                >
                  ⚠️ Parolni faqat shu yerdan — admin panelidan — o'zgartirish
                  mumkin. Tasdiqlash uchun joriy parol so'raladi. Saqlangach
                  boshqa qurilmalardagi sessiyalar yopiladi va yangi parol
                  bilan qaytadan kirish kerak bo'ladi. Mentor va talabalarning
                  parolini quyidagi kartochkalardan siz belgilaysiz — ular
                  o'zi o'zgartira olmaydi.
                </div>
              </div>
            </div>
          </div>
</template>
