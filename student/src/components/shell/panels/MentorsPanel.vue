<template>
      <!-- MENTORS -->
      <div id="panel-mentors" class="panel">
        <div class="toolbar">
          <div class="search-box">
            <input
              type="text"
              id="s-mentor"
              placeholder=""
              oninput="renderMentors()"
              data-ph="search_mentor"
            />
          </div>
          <button
            class="btn btn-primary"
            onclick="openModal('mentor')"
            data-t="add_mentor"
          >
            + Mentor qo'shish
          </button>
        </div>
        <div class="exp-filter-group" id="exp-filter-row">
          <span
            style="font-size: 12px; color: var(--text3); font-weight: 600"
            data-t="exp_filter"
            >Tajriba:</span
          >
          <button
            class="exp-pill active"
            onclick="setExpFilter('', this)"
            data-t="all_exp"
          >
            Barchasi
          </button>
          <button class="exp-pill" onclick="setExpFilter('1', this)">
            1 yil
          </button>
          <button class="exp-pill" onclick="setExpFilter('2', this)">
            2 yil
          </button>
          <button class="exp-pill" onclick="setExpFilter('3', this)">
            3 yil
          </button>
          <button class="exp-pill" onclick="setExpFilter('4', this)">
            4 yil
          </button>
          <button
            class="exp-pill"
            onclick="setExpFilter('5+', this)"
            data-t="exp_5plus"
          >
            5+ yil
          </button>
        </div>
        <div class="list-box" id="mentor-list"></div>
      </div>
</template>
