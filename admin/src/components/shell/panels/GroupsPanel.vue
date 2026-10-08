<template>
      <!-- GROUPS -->
      <div id="panel-groups" class="panel">
        <div class="toolbar">
          <div class="search-box">
            <input
              type="text"
              id="s-group"
              placeholder=""
              oninput="
                resetGroupPage();
                renderGroups();
              "
              data-ph="search_group"
            />
          </div>
          <button
            class="btn btn-primary"
            onclick="openModal('group')"
            data-t="add_group"
          >
            + Guruh qo'shish
          </button>
        </div>
        <div class="toolbar-row2">
          <select
            class="fsel"
            id="fg-course"
            onchange="
              resetGroupPage();
              renderGroups();
            "
          >
            <option value="" data-t="all_courses">Barcha kurslar</option>
          </select>
          <select
            class="fsel"
            id="fg-mentor"
            onchange="
              resetGroupPage();
              renderGroups();
            "
          >
            <option value="" data-t="all_mentors">Barcha mentorlar</option>
          </select>
          <select
            class="fsel"
            id="fg-duration"
            onchange="
              resetGroupPage();
              renderGroups();
            "
          >
            <option value="" data-t="all_duration">Barcha davomiylik</option>
            <option value="1-5">1 – 5 oy</option>
            <option value="5-12">5 – 12 oy</option>
          </select>
          <select
            class="fsel"
            id="fg-days"
            onchange="
              resetGroupPage();
              renderGroups();
            "
          >
            <option value="" data-t="all_days">Barcha kunlar</option>
            <option value="Du">Dushanba</option>
            <option value="Se">Seshanba</option>
            <option value="Ch">Chorshanba</option>
            <option value="Pa">Payshanba</option>
            <option value="Ju">Juma</option>
            <option value="Sh">Shanba</option>
          </select>
          <select
            class="fsel"
            id="fg-status"
            onchange="
              resetGroupPage();
              renderGroups();
            "
          >
            <option value="" data-t="all_status">Barcha holat</option>
            <option value="Faol">✅ Faol</option>
            <option value="Arxiv">📦 Arxiv</option>
            <option value="Man etilgan">🚫 Man etilgan</option>
          </select>
        </div>
        <div class="card-grid" id="group-grid"></div>
        <div class="pagination" id="group-pagination"></div>
      </div>
</template>
