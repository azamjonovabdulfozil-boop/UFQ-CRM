<template>
    <button
      class="nav-btn"
      id="nav-mentor-dash"
      onclick="go('mentor-dash', this)"
      style="display: none"
    >
      <span class="nav-ic">📊</span
      ><span data-t="nav_mentor_dash">Dashboard</span>
    </button>
    <button
      class="nav-btn"
      id="nav-mentor-groups"
      onclick="go('mentor-groups', this)"
      style="display: none"
    >
      <span class="nav-ic">👥</span
      ><span data-t="nav_mentor_groups">Guruhlar</span>
    </button>
    <button
      class="nav-btn"
      id="nav-mentors-my"
      onclick="go('mentors-my', this)"
      style="display: none"
    >
      <span class="nav-ic">📅</span
      ><span data-t="nav_my_schedule">Mening jadvalim</span>
    </button>
    <button
      class="nav-btn"
      id="nav-mentor-chat"
      onclick="go('mentor-chat', this)"
      style="display: none"
    >
      <span class="nav-ic">💬</span><span data-t="nav_chat">Chat</span>
      <span class="nav-count" id="nc-chat" style="display: none">0</span>
    </button>
    <button
      class="nav-btn"
      id="nav-mentor-ai"
      onclick="go('mentor-ai', this)"
      style="display: none"
    >
      <span class="nav-ic">🤖</span><span>AI Yordamchi</span>
    </button>
    <button
      class="nav-btn"
      id="nav-mentor-students-ai"
      onclick="go('mentor-students-ai', this)"
      style="display: none"
    >
      <span class="nav-ic">👁</span><span>Talabalar AI</span>
    </button>
    <button
      class="nav-btn"
      id="nav-tests-mentor"
      onclick="go('tests', this)"
      style="display: none"
    >
      <span class="nav-ic">📝</span><span data-t="nav_tests">Testlar</span>
      <span class="nav-count" id="nc-tests-mentor">0</span>
    </button>
    <button
      class="nav-btn"
      id="nav-grades-mentor"
      onclick="go('grades', this)"
      style="display: none"
    >
      <span class="nav-ic">🏅</span><span data-t="nav_grades">Baholash</span>
    </button>
    <button
      class="nav-btn"
      id="nav-mentor-videos"
      onclick="go('mentor-videos', this)"
      style="display: none"
    >
      <span class="nav-ic">🎬</span
      ><span id="nav-mentor-videos-lbl">Darsliklar</span>
      <span class="nav-count" id="nc-mentor-videos" style="display: none"
        >0</span
      >
    </button>
</template>
