<template>
      <!-- COURSES -->
      <div id="panel-courses" class="panel">
        <div class="toolbar">
          <div class="search-box">
            <input
              type="text"
              id="s-course"
              placeholder=""
              oninput="renderCourses()"
              data-ph="search_course"
            />
          </div>
          <button
            class="btn btn-primary"
            onclick="openModal('course')"
            data-t="add_course"
          >
            + Kurs qo'shish
          </button>
        </div>
        <div class="card-grid" id="course-grid"></div>
      </div>
</template>
