<template>
    <button
      class="nav-btn"
      id="nav-student-my"
      onclick="go('student-my', this)"
      style="display: none"
    >
      <span class="nav-ic">🏠</span
      ><span data-t="nav_student_dash">Dashboard</span>
    </button>
    <button
      class="nav-btn"
      id="nav-student-schedule"
      onclick="go('student-schedule', this)"
      style="display: none"
    >
      <span class="nav-ic">📅</span
      ><span data-t="nav_schedule">Dars jadvali</span>
    </button>
    <button
      class="nav-btn"
      id="nav-student-rating"
      onclick="go('student-rating', this)"
      style="display: none"
    >
      <span class="nav-ic">🏆</span
      ><span data-t="nav_rating">Guruh reytingi</span>
    </button>
    <button
      class="nav-btn"
      id="nav-student-grades"
      onclick="go('student-grades', this)"
      style="display: none"
    >
      <span class="nav-ic">🏅</span><span data-t="nav_grades">Baholash</span>
    </button>
    <button
      class="nav-btn"
      id="nav-student-tests"
      onclick="go('student-tests', this)"
      style="display: none"
    >
      <span class="nav-ic">📝</span><span data-t="nav_tests">Testlar</span>
      <span class="nav-count" id="nc-student-tests" style="display: none"
        >0</span
      >
    </button>
    <button
      class="nav-btn"
      id="nav-student-chat"
      onclick="go('student-chat', this)"
      style="display: none"
    >
      <span class="nav-ic">💬</span><span data-t="nav_chat">Chat</span>
    </button>
    <button
      class="nav-btn"
      id="nav-student-ai"
      onclick="go('student-ai', this)"
      style="display: none"
    >
      <span class="nav-ic">🤖</span><span>AI Yordamchi</span>
    </button>
    <button
      class="nav-btn"
      id="nav-student-videos"
      onclick="go('student-videos', this)"
      style="display: none"
    >
      <span class="nav-ic">🎬</span
      ><span id="nav-student-videos-lbl">Darsliklar</span>
    </button>
    <button
      class="nav-btn"
      id="nav-student-goals"
      onclick="go('student-goals', this)"
      style="display: none"
    >
      <span class="nav-ic">🎯</span><span data-t="goals">Maqsadlar</span>
    </button>
</template>
