<template>
          <div class="settings-card" id="mentor-creds-card">
            <div class="settings-card-header">
              <div class="settings-card-ic">🔑</div>
              <div>
                <div class="settings-card-title">Mentor login / parol</div>
                <div class="settings-card-sub">
                  Mentorlarga alohida kirish hisoblari bering
                </div>
              </div>
            </div>
            <div class="settings-card-body">
              <div
                style="
                  display: flex;
                  flex-direction: column;
                  gap: 10px;
                  margin-bottom: 16px;
                "
              >
                <div class="fg">
                  <label
                    style="
                      font-size: 12px;
                      font-weight: 600;
                      color: var(--text3);
                    "
                    >Mentor tanlang</label
                  >
                  <select
                    id="sett-mentor-select"
                    class="fsel"
                    style="width: 100%; margin-top: 4px"
                    onchange="renderMentorCredsList()"
                  >
                    <option value="">— Mentor tanlang —</option>
                  </select>
                </div>
                <div class="fg">
                  <label
                    style="
                      font-size: 12px;
                      font-weight: 600;
                      color: var(--text3);
                    "
                    >Login</label
                  >
                  <input
                    type="text"
                    id="sett-mentor-login"
                    placeholder="mentor_login"
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
                    >Parol</label
                  >
                  <input
                    type="password"
                    id="sett-mentor-pass"
                    placeholder="••••••••"
                    autocomplete="new-password"
                    style="margin-top: 4px"
                  />
                </div>
                <button
                  class="btn btn-primary"
                  onclick="saveMentorCredentials()"
                  style="margin-top: 4px"
                >
                  🔑 Saqlash
                </button>
              </div>
              <div id="mentor-creds-list"></div>
            </div>
          </div>
</template>
