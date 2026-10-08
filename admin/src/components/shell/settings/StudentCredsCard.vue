<template>
          <div class="settings-card" id="student-creds-card">
            <div class="settings-card-header">
              <div class="settings-card-ic">🧑‍💻</div>
              <div>
                <div class="settings-card-title">Talaba login / parol</div>
                <div class="settings-card-sub">
                  Talabalarga alohida kirish hisoblari bering
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
                    >Talaba tanlang</label
                  >
                  <select
                    id="sett-student-select"
                    class="fsel"
                    style="width: 100%; margin-top: 4px"
                    onchange="renderStudentCredsList()"
                  >
                    <option value="">— Talaba tanlang —</option>
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
                    id="sett-student-login"
                    placeholder="student_login"
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
                  <div class="pass-wrap">
                    <input
                      type="password"
                      id="sett-student-pass"
                      placeholder="••••••••"
                      autocomplete="new-password"
                    />
                    <button
                      type="button"
                      class="pass-eye"
                      aria-label="Parolni ko'rsatish"
                      title="Parolni ko'rsatish / yashirish"
                      onclick="(function(b){var i=b.previousElementSibling;var show=i.type==='password';i.type=show?'text':'password';b.textContent=show?'🙈':'👁';i.focus();})(this)"
                    >👁</button>
                  </div>
                </div>
                <button
                  class="btn btn-primary"
                  onclick="saveStudentCredentials()"
                  style="margin-top: 4px"
                >
                  🔑 Saqlash
                </button>
              </div>
              <div id="student-creds-list"></div>
            </div>
          </div>
</template>
