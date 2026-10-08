<template>
<div id="login-screen" style="display: none">
  <div class="ls-wrap">
    <!-- LEFT -->
    <div class="ls-left">
      <div class="ls-orb ls-orb1"></div>
      <div class="ls-orb ls-orb2"></div>
      <div class="ls-orb ls-orb3"></div>
      <div class="ls-grid"></div>
      <div class="ls-left-body">
        <div class="ls-brand">
          <div class="login-logo-mark" id="login-logo-img-wrap"></div>
          <div>
            <div class="login-logo-name" id="login-crm-name">EduManage</div>
            <div class="login-logo-tag">v8.0 • Zamonaviy CRM</div>
          </div>
        </div>
        <div class="ls-hl">
          <span class="ls-hl-w">Ta'limni</span>
          <span class="ls-hl-g">boshqaring</span>
          <span class="ls-hl-w">aqlli bilan.</span>
        </div>
        <div class="ls-stats">
          <div class="ls-stat"><b>2,400+</b><span>Talabalar</span></div>
          <div class="ls-stat"><b>180+</b><span>Kurslar</span></div>
          <div class="ls-stat"><b>98%</b><span>Mamnunlik</span></div>
        </div>
        <div class="ls-pills">
          <div class="ls-pill">📊 Dashboard</div>
          <div class="ls-pill">🎓 Mentorlar</div>
          <div class="ls-pill ls-pill-hi">🤖 AI Yordamchi</div>
          <div class="ls-pill">💰 To'lovlar</div>
          <div class="ls-pill">📈 Statistika</div>
          <div class="ls-pill">📝 Testlar</div>
        </div>
        <div class="ls-quote">
          <div class="ls-qbar"></div>
          <div class="ls-qtext">
            "Zamonaviy ta'lim — zamonaviy boshqaruv bilan boshlanadi"
          </div>
        </div>
      </div>
    </div>
    <!-- RIGHT -->
    <div class="ls-right">
      <div class="ls-form">
        <div class="ls-title">Xush kelibsiz 👋</div>
        <div class="ls-sub">Hisobingizga kiring</div>
        <div class="login-err" id="login-err">Login yoki parol noto'g'ri!</div>
        <div class="login-fg">
          <label>Login</label>
          <div class="ls-inp-wrap">
            <span class="ls-ico">👤</span>
            <input
              type="text"
              id="login-user"
              placeholder="loginni kiriting"
              autocomplete="username"
              onkeydown="if (event.key === 'Enter') doLogin();"
            />
          </div>
        </div>
        <div class="login-fg">
          <label>Parol</label>
          <div class="ls-inp-wrap">
            <span class="ls-ico">🔑</span>
            <input
              type="password"
              id="login-pass"
              placeholder="••••••••"
              autocomplete="current-password"
              onkeydown="if (event.key === 'Enter') doLogin();"
            />
          </div>
        </div>
        <button class="login-btn" onclick="doLogin()">
          <span>Kirish</span>
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
            <path
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2.5"
              d="M5 12h14M13 6l6 6-6 6"
            />
          </svg>
        </button>
        <div class="login-hint"></div>
      </div>
    </div>
  </div>
</div>
</template>
