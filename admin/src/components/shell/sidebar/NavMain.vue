<template>
    <button class="nav-btn" id="nav-dashboard" onclick="go('dashboard', this)">
      <span class="nav-ic">📊</span><span data-t="dashboard">Dashboard</span>
    </button>
    <button class="nav-btn" id="nav-courses" onclick="go('courses', this)">
      <span class="nav-ic">📚</span><span data-t="courses">Kurslar</span>
      <span class="nav-count" id="nc-courses">0</span>
    </button>
    <button class="nav-btn" id="nav-groups" onclick="go('groups', this)">
      <span class="nav-ic">👥</span><span data-t="groups">Guruhlar</span>
      <span class="nav-count" id="nc-groups">0</span>
    </button>
    <button class="nav-btn" id="nav-mentors" onclick="go('mentors', this)">
      <span class="nav-ic">🎓</span><span data-t="mentors">Mentorlar</span>
      <span class="nav-count" id="nc-mentors">0</span>
    </button>
</template>
