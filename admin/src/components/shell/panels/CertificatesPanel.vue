<template>
  <!-- SERTIFIKATLAR — admin yaratadi, talaba panelida ko'rinadi.
       Shablon = admin yuklagan blanka RASMI, maydonlar rasm ustiga
       joylashtiriladi (core/certificates.js chizadi). -->
  <div id="panel-certificates" class="panel">
    <div class="toolbar">
      <button
        class="btn btn-primary"
        id="cert-tabbtn-list"
        onclick="certSwitchTab('list')"
      >
        🎖 Sertifikatlar
      </button>
      <button class="btn" id="cert-tabbtn-tpl" onclick="certSwitchTab('tpl')">
        🎨 Shablonlar
      </button>
    </div>

    <!-- ── Sertifikatlar ro'yxati ── -->
    <div id="cert-tab-list">
      <div class="toolbar">
        <div class="search-box">
          <input
            type="text"
            id="s-cert"
            placeholder="Ism, kurs yoki raqam bo'yicha qidirish..."
            oninput="renderCertificates()"
          />
        </div>
        <select class="fsel" id="filter-cert-tpl" onchange="renderCertificates()">
          <option value="">Barcha shablonlar</option>
        </select>
        <button class="btn btn-primary" onclick="certOpenBulk()">
          🎓 Guruhga sertifikat berish
        </button>
        <button class="btn" onclick="openCertModal()">
          + Bitta sertifikat
        </button>
      </div>
      <div class="list-box" id="cert-list"></div>
    </div>

    <!-- ── Shablonlar (rasm yuklash + maydonlarni joylashtirish) ── -->
    <div id="cert-tab-tpl" style="display: none">
      <div class="toolbar">
        <div
          style="
            flex: 1;
            font-size: 12.5px;
            color: var(--text3);
            line-height: 1.6;
          "
        >
          Sertifikat blankasini rasm (PNG/JPG) qilib yuklang — dastur rasmni
          o'zi o'qib, ism, kurs, o'qish davri, sana va QR kodni blankadagi
          o'z joyiga qo'yadi. Kerak bo'lsagina qo'lda tuzatasiz.
        </div>
        <button class="btn btn-primary" onclick="certOpenTplUpload()">
          🖼 Shablon yuklash
        </button>
      </div>
      <div
        id="cert-tpl-grid"
        style="
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 16px;
        "
      ></div>
    </div>
  </div>
</template>
