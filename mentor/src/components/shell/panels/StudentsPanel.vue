<template>
      <!-- STUDENTS -->
      <div id="panel-students" class="panel">
        <div class="toolbar">
          <div class="search-box">
            <input
              type="text"
              id="s-student"
              placeholder=""
              oninput="renderStudents()"
              data-ph="search_student"
            />
          </div>
          <select
            class="fsel"
            id="filter-student-status"
            onchange="renderStudents()"
          >
            <option value="" data-t="all_status">Barcha holat</option>
            <option value="Aktiv">✅ Aktiv</option>
            <option value="Faolsiz">⛔ Faolsiz</option>
            <option value="Muzlatilgan">❄️ Muzlatilgan</option>
            <option value="Probatsiya">🔶 Probatsiya</option>
            <option value="Arxiv">📦 Arxiv</option>
          </select>
          <select
            class="fsel"
            id="filter-student-debt"
            onchange="renderStudents()"
          >
            <option value="" data-t="all_payment">Barcha to'lov</option>
            <option value="1" data-t="debtor">💸 Qarzdor</option>
            <option value="0" data-t="paid">✅ To'lagan</option>
          </select>
          <select
            class="fsel"
            id="filter-student-course"
            onchange="renderStudents()"
          >
            <option value="" data-t="all_direction">Barcha yo'nalish</option>
          </select>
          <button
            class="btn btn-primary"
            onclick="openModal('student')"
            data-t="add_student"
          >
            + Talaba qo'shish
          </button>
        </div>
        <div class="list-box" id="student-list"></div>
        <div class="pagination" id="student-pagination"></div>
      </div>
</template>
