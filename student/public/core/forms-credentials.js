// ===================== FORMS =====================
function setupFileUpload() {
  const dz = document.getElementById("resume-drop");
  const fi = document.getElementById("resume-file-input");
  if (!dz || !fi) return;
  dz.addEventListener("click", () => fi.click());
  dz.addEventListener("dragover", (e) => {
    e.preventDefault();
    dz.style.borderColor = "var(--accent)";
  });
  dz.addEventListener("dragleave", () => {
    dz.style.borderColor = "";
  });
  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    dz.style.borderColor = "";
    handleFile(e.dataTransfer.files[0]);
  });
  fi.addEventListener("change", () => handleFile(fi.files[0]));
  const pi = document.getElementById("mentor-photo-input");
  if (!pi) return;
  pi.addEventListener("change", () => handlePhotoFile(pi.files[0]));
}
function handleFile(file) {
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    crmAlert("Fayl 5MB dan kichik bo'lishi kerak!");
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    const b64 = e.target.result.split(",")[1];
    _uploadedFile = {
      name: file.name,
      type: file.type,
      size: file.size,
      data: b64,
    };
    renderFilePreview();
  };
  reader.readAsDataURL(file);
}
function handlePhotoFile(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    crmAlert("Faqat rasm fayli!");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    crmAlert("Rasm 5MB dan kichik bo'lishi kerak!");
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    const b64 = e.target.result.split(",")[1];
    _uploadedPhoto = {
      name: file.name,
      type: file.type,
      size: file.size,
      data: b64,
    };
    renderPhotoPreview();
  };
  reader.readAsDataURL(file);
}
function renderPhotoPreview() {
  const wrap = document.getElementById("mentor-photo-preview-wrap");
  if (!wrap) return;
  if (_uploadedPhoto) {
    const src = `data:${_uploadedPhoto.type};base64,${_uploadedPhoto.data}`;
    wrap.innerHTML = `<div class="mentor-photo-upload" style="border-style:solid;border-color:var(--accent)"><div class="mentor-photo-preview"><img src="${src}" alt="preview"></div><div class="mentor-photo-info"><p>✅ ${_uploadedPhoto.name}</p><span>${formatBytes(_uploadedPhoto.size)}</span></div><div style="display:flex;flex-direction:column;gap:6px"><button type="button" class="mentor-photo-btn" onclick="openLightbox('${src}')">🔍 Ko'rish</button><button type="button" class="mentor-photo-btn" style="border-color:var(--orange);color:var(--orange-text);background:var(--orange-light)" onclick="removePhoto()">✕ O'chirish</button></div></div><input type="file" id="mentor-photo-input" accept="image/*" style="display:none">`;
    const pi = document.getElementById("mentor-photo-input");
    if (pi) pi.addEventListener("change", () => handlePhotoFile(pi.files[0]));
  } else {
    wrap.innerHTML = `<div class="mentor-photo-upload" onclick="document.getElementById('mentor-photo-input').click()" style="cursor:pointer"><div class="mentor-photo-preview">📷</div><div class="mentor-photo-info"><p>Rasm yuklash uchun bosing</p><span>JPG, PNG, WEBP · Max 5MB</span></div><button type="button" class="mentor-photo-btn">+ Rasm</button></div><input type="file" id="mentor-photo-input" accept="image/*" style="display:none">`;
    const pi = document.getElementById("mentor-photo-input");
    if (pi) pi.addEventListener("change", () => handlePhotoFile(pi.files[0]));
  }
}
function removePhoto() {
  _uploadedPhoto = null;
  renderPhotoPreview();
}
function renderFilePreview() {
  const prev = document.getElementById("file-preview-area");
  if (!prev) return;
  if (_uploadedFile) {
    const isImg = _uploadedFile.type && _uploadedFile.type.startsWith("image/");
    prev.innerHTML = `<div class="file-preview"><span style="font-size:18px">${isImg ? "🖼" : "📄"}</span><span class="file-preview-name">${_uploadedFile.name}</span><span class="file-preview-size">${formatBytes(_uploadedFile.size)}</span><button class="file-remove" onclick="removeFile()">✕</button></div>`;
  } else {
    prev.innerHTML = "";
  }
}
function removeFile() {
  _uploadedFile = null;
  const fi = document.getElementById("resume-file-input");
  if (fi) fi.value = "";
  renderFilePreview();
}
function validateRequired(fields) {
  let ok = true;
  fields.forEach((f) => {
    const el = document.getElementById(f.id);
    if (!el) return;
    const val = (el.tagName === "SELECT" ? el.value : el.value || "").trim();
    if (!val) {
      el.classList.add("field-error");
      ok = false;
      el.addEventListener(
        "input",
        function rem() {
          el.classList.remove("field-error");
          el.removeEventListener("input", rem);
        },
        { once: true },
      );
      el.addEventListener(
        "change",
        function rem() {
          el.classList.remove("field-error");
          el.removeEventListener("change", rem);
        },
        { once: true },
      );
    } else {
      el.classList.remove("field-error");
    }
  });
  return ok;
}

function formCourse(d = {}) {
  return `<div class="fg"><label>Kurs nomi <span class="req">*</span></label><input id="f-name" value="${d.name || ""}" placeholder="Masalan: Frontend Development"></div><div class="form-row"><div class="fg"><label>Davomiyligi <span class="req">*</span></label><input id="f-dur" value="${d.duration || ""}" placeholder="11 oy"></div><div class="fg"><label>Narxi (so'm/oy) <span class="req">*</span></label><input id="f-price" value="${d.price || ""}" placeholder="1 200 000"></div></div><div class="fg" style="background:var(--accent-light);border-radius:var(--r-md);padding:10px 12px;font-size:12px;color:var(--accent-text)">💡 1 dars narxi = oylik narx ÷ ${LESSON_COUNT} · K/Y/S — uchalasi ham yechiladi · 12 dars = Qarzdor</div><div class="fg"><label>Holat</label><select id="f-status"><option ${!d.status || d.status === "Faol" ? "selected" : ""}>Faol</option><option ${d.status === "Arxiv" ? "selected" : ""}>Arxiv</option></select></div>`;
}
function formGroup(d = {}) {
  const firstCourseId = d.courseId ?? D.courses[0]?.id ?? "";
  const selectedCourse = getCourseById(firstCourseId);
  const suggestedName = d.name || autoGroupName(firstCourseId);
  const dur = selectedCourse ? selectedCourse.duration : "—";
  const today = todayStr();
  return `<div class="conflict-warn" id="room-conflict-warn"></div><div class="form-row"><div class="fg"><label>Guruh nomi <span class="req">*</span></label><input id="f-name" value="${suggestedName}" placeholder="FE-1"></div><div class="fg"><label>Holat</label><select id="f-status"><option ${!d.status || d.status === "Faol" ? "selected" : ""}>Faol</option><option ${d.status === "Arxiv" ? "selected" : ""}>Arxiv</option><option ${d.status === "Man etilgan" ? "selected" : ""}>Man etilgan</option></select></div></div><div class="fg"><label>Kurs <span class="req">*</span></label><select id="f-course" onchange="updateGroupNameFromCourse(${d.id || 0});updateGroupDuration()"><option value="">Barcha kurslar</option>${D.courses.map((c) => `<option value="${c.id}" ${String(d.courseId ?? firstCourseId) === String(c.id) ? "selected" : ""}>${c.name}</option>`).join("")}</select></div><div class="fg"><label>Mentor <span class="req">*</span></label><select id="f-mentor">${D.mentors.map((m) => `<option value="${m.id}" ${String(d.mentorId) === String(m.id) ? "selected" : ""}>${m.name}</option>`).join("")}</select></div><div class="fg"><label>📆 Kurs davomiyligi (avtomatik)</label><input id="f-dur-display" value="${dur}" readonly style="background:var(--bg3);cursor:default;opacity:.75"></div><div class="section-divider">Jadval</div><div class="form-row"><div class="fg"><label>Boshlanish sanasi <span class="req">*</span></label><input type="date" id="f-start" value="${d.startDate || today}"></div></div><div class="form-row3"><div class="fg"><label>🚪 Xona raqami</label><input id="f-room" value="${d.room || ""}" placeholder="12" oninput="liveCheckConflict(${d.id || 0})"></div><div class="fg"><label>⏰ Boshlanish vaqti</label><input type="time" id="f-timestart" value="${d.timeStart || "09:00"}" onchange="liveCheckConflict(${d.id || 0})"></div><div class="fg"><label>⏰ Tugash vaqti</label><input type="time" id="f-timeend" value="${d.timeEnd || "11:00"}" onchange="liveCheckConflict(${d.id || 0})"></div></div><div class="fg"><label>Dars kunlari</label><div class="days-pick">${DAYS.map((day, i) => `<input class="day-cb" type="checkbox" id="d${i}" value="${day}" ${(d.days || []).includes(day) ? "checked" : ""}><label class="day-lb" for="d${i}">${day}</label>`).join("")}</div></div><div class="section-divider">📨 Telegram davomat boti</div><div class="fg"><label>Ota-onalar guruhi chat ID</label><div style="display:flex;gap:6px"><input id="f-tgchat" list="tg-chat-list" value="${d.telegramChatId || ''}" placeholder="-1001234567890" style="flex:1;font-family:'JetBrains Mono',monospace"><button type="button" class="btn btn-sm" onclick="detectTelegramChats()" title="Bot qo'shilgan guruhlarni aniqlash" style="white-space:nowrap">🔍 Aniqlash</button></div><datalist id="tg-chat-list"></datalist><div id="f-tgchat-hint" style="font-size:11px;color:var(--text3);margin-top:5px"></div></div><div class="fg" style="background:var(--accent-light);border-radius:var(--r-md);padding:10px 12px;font-size:12px;color:var(--accent-text)">💡 <b>1)</b> Botni ota-onalar guruhiga qo'shing · <b>2)</b> guruhga <code>/id</code> deb yozing (oddiy xabarni bot ko'rmaydi — Telegram cheklovi) · <b>3)</b> <b>🔍 Aniqlash</b> ni bosing · <b>4)</b> pastdagi <b>Saqlash</b> ni bosing. ID ni qo'lda ham kiritsa bo'ladi. Saqlangach davomat belgilansa hisobot o'sha guruhga o'zi yuboriladi.</div>`;
}
function updateGroupNameFromCourse(editId) {
  const sel = document.getElementById("f-course");
  if (!sel || editId) return;
  const ni = document.getElementById("f-name");
  if (ni) ni.value = autoGroupName(parseInt(sel.value) || null);
  updateGroupDuration();
}
function updateGroupDuration() {
  const sel = document.getElementById("f-course");
  if (!sel) return;
  const di = document.getElementById("f-dur-display");
  const c = getCourseById(parseInt(sel.value) || null);
  if (di) di.value = (c && c.duration) || "—";
}
function formMentor(d = {}) {
  _uploadedFile = d.resumeFile ? { ...d.resumeFile } : null;
  _uploadedPhoto = d.photo ? { ...d.photo } : null;
  return `<div class="section-divider" style="padding-top:0;margin-top:0">📸 Mentor rasmi</div><div id="mentor-photo-preview-wrap"></div><div class="fg"><label>Ism Familiya <span class="req">*</span></label><input id="f-name" value="${d.name || ""}" placeholder="Alisher Karimov"></div><div class="form-row"><div class="fg"><label>Telefon <span class="req">*</span></label><input id="f-phone" value="${d.phone || ""}" placeholder="+998 90 111 22 33" oninput="phoneOnlyDigits(this)" inputmode="numeric"></div><div class="fg"><label>Yoshi <span class="req">*</span></label><input id="f-age" value="${d.age || ""}" placeholder="27" type="number" min="18" max="70"></div></div><div class="form-row"><div class="fg"><label>Yo'nalish <span class="req">*</span></label><select id="f-subj">${SUBJECTS.map((s) => `<option value="${s}" ${(d.subject || "") === s ? "selected" : ""}>${s}</option>`).join("")}</select></div><div class="fg"><label>Tajriba <span class="req">*</span></label><input id="f-exp" value="${d.experience || ""}" placeholder="2 yil"></div></div><div class="section-divider">Aloqa</div><div class="form-row"><div class="fg"><label>Email <span class="req">*</span></label><input id="f-email" value="${d.email || ""}" placeholder="email@edu.uz" type="email"></div><div class="fg"><label>Telegram <span class="req">*</span></label><input id="f-tg" value="${d.telegram || ""}" placeholder="@username"></div></div><div class="fg"><label>Yashash joyi <span class="req">*</span></label><input id="f-addr" value="${d.address || ""}" placeholder="Toshkent, Yunusobod"></div><div class="fg"><label>Ishga kirgan sana <span class="req">*</span></label><input type="date" id="f-join" value="${d.joinDate || todayStr()}"></div><div class="fg"><label>Bio / Matn rezyume <span class="req">*</span></label><textarea id="f-resume" rows="2" placeholder="Mentor haqida qisqacha...">${d.resume || ""}</textarea></div><div class="section-divider">📎 Rezyume fayl (PDF yoki rasm)</div><div class="fg"><div class="file-drop" id="resume-drop"><input type="file" id="resume-file-input" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"><div class="file-drop-ic">📂</div><div class="file-drop-txt">Faylni bu yerga tashlang yoki bosing<br><span style="font-size:11px;color:var(--text3)">PDF, JPG, PNG, DOC · Max 5MB</span></div></div><div id="file-preview-area"></div></div>`;
}
function formStudent(d = {}) {
  if (!D.groups.length)
    return `<div class="del-warning">⚠️ Avval guruh qo'shing!</div>`;
  const groupOpts = (D.groups || [])
    .map(
      (g) =>
        `<option value="${g.id}" ${d.groupId === g.id ? "selected" : ""}>${g.name} — ${g.course} (${fmtDate(g.startDate)})</option>`,
    )
    .join("");
  const srcOpts = SOURCES.map(
    (s) =>
      `<option value="${s}" ${(d.source || SOURCES[0]) === s ? "selected" : ""}>${s}</option>`,
  ).join("");
  const existFirst = d.firstName || (d.name ? d.name.split(" ")[0] || "" : "");
  const existLast =
    d.lastName || (d.name ? d.name.split(" ").slice(1).join(" ") || "" : "");
  // ---- 1.2: Login va parol (Student Panelga kirish uchun) ----
  const existingCred = d.id ? getStudentUsers().find(u => String(u.studentId) === String(d.id)) : null;
  const loginVal = existingCred ? existingCred.login : suggestLogin(d.name || "", "student", d.id || null);
  const passPlaceholder = d.id ? t("pass_keep_current") : t("pass_min_chars");
  const passVal = d.id ? "" : genPassword();
  return `<div class="modal-section-label">👤 Shaxsiy ma'lumot</div><div class="form-row"><div class="fg"><label>Ism <span class="req">*</span></label><input id="f-firstname" value="${existFirst}" placeholder="Jasur" oninput="_autoFillStudentLogin()"></div><div class="fg"><label>Familiya <span class="req">*</span></label><input id="f-lastname" value="${existLast}" placeholder="Mirzayev" oninput="_autoFillStudentLogin()"></div></div><div class="form-row"><div class="fg"><label>📱 Tel raqami <span class="req">*</span></label><input id="f-phone" value="${d.phone || ""}" placeholder="+998 90 123 45 67" oninput="phoneOnlyDigits(this)" inputmode="numeric"></div><div class="fg"><label>🎂 Tug'ilgan sana <span class="req">*</span></label><input type="date" id="f-birth" value="${d.birthDate || ""}"></div></div><div class="fg"><label>👥 Guruh <span class="req">*</span></label><select id="f-group">${groupOpts}</select></div><div class="modal-section-label">🔐 ${t("login_credentials_title")}</div><div class="form-row"><div class="fg"><label>Login <span class="req">*</span></label><div style="display:flex;gap:6px"><input id="f-login" value="${loginVal}" placeholder="jasur.mirzayev" style="flex:1;font-family:'JetBrains Mono',monospace" oninput="this.dataset.touched='1';this.value=this.value.toLowerCase().replace(/[^a-z0-9._-]/g,'')"><button type="button" class="btn btn-sm" onclick="_autoFillStudentLogin(true)" title="${t("suggest_btn")}">🔄</button></div></div><div class="fg"><label>${t("password_label")} ${d.id ? "" : '<span class="req">*</span>'}</label><div style="display:flex;gap:6px"><input id="f-pass" value="${passVal}" placeholder="${passPlaceholder}" style="flex:1;font-family:'JetBrains Mono',monospace" autocomplete="new-password"><button type="button" class="btn btn-sm" onclick="document.getElementById('f-pass').value=genPassword()" title="${t("generate_btn")}">🔄</button></div></div></div><div style="font-size:12px;color:var(--text3);margin:-6px 0 4px">💡 ${t("login_credentials_hint")}</div><div class="modal-section-label">👨‍👩‍👦 Ota-ona</div><div class="form-row"><div class="fg"><label>Ota-ona ismi</label><input id="f-parent" value="${d.parentName || ""}" placeholder="Kamoliddin Mirzayev"></div><div class="fg"><label>📞 Ota-ona tel raqami</label><input id="f-pphone" value="${d.parentPhone || ""}" placeholder="+998 90 000 00 00" oninput="phoneOnlyDigits(this)" inputmode="numeric"></div></div><div class="modal-section-label">⚙️ Holat va manba</div><div class="form-row"><div class="fg"><label>Faollik holati</label><select id="f-status"><option value="Aktiv" ${!d.status || d.status === "Aktiv" ? "selected" : ""}>✅ Aktiv</option><option value="Faolsiz" ${d.status === "Faolsiz" ? "selected" : ""}>⛔ Faolsiz</option><option value="Muzlatilgan" ${d.status === "Muzlatilgan" ? "selected" : ""}>❄️ Muzlatilgan</option><option value="Probatsiya" ${d.status === "Probatsiya" ? "selected" : ""}>🔶 Probatsiya</option><option value="Arxiv" ${d.status === "Arxiv" ? "selected" : ""}>📦 Arxiv</option></select></div><div class="fg"><label>To'lov holati</label><select id="f-debt"><option value="0" ${!d.isDebtor ? "selected" : ""}>✅ To'lagan</option><option value="1" ${d.isDebtor ? "selected" : ""}>💸 Qarzdor</option></select></div></div><div class="form-row"><div class="fg"><label>📍 Manba</label><select id="f-src">${srcOpts}</select></div><div class="fg"><label>📅 Qo'shilgan sana</label><input type="date" id="f-join" value="${d.joinDate || todayStr()}"></div></div><div class="fg"><label>💬 Izohlar</label><textarea id="f-notes" rows="3" placeholder="Talaba haqida izoh...">${d.notes || ""}</textarea></div>`;
}
// Ism/familiya kiritilayotganda login maydonini avtomatik taklif qiladi
// (agar admin login maydonini o'zi qo'lda o'zgartirmagan bo'lsa, yoki "force" true bo'lsa)
function _autoFillStudentLogin(force) {
  const loginEl = document.getElementById("f-login");
  if (!loginEl) return;
  if (loginEl.dataset.touched === "1" && !force) return;
  const fn = (document.getElementById("f-firstname")?.value || "").trim();
  const ln = (document.getElementById("f-lastname")?.value || "").trim();
  const full = (fn + " " + ln).trim();
  if (!full) { if (force) loginEl.value = ""; return; }
  loginEl.value = suggestLogin(full, "student", _editId);
  if (force) loginEl.dataset.touched = "0";
}

let _modalType = null,
  _editId = null;
function openModal(type, data = {}) {
  _modalType = type;
  _editId = data.id || null;
  const isEdit = !!data.id;
  const titles = {
    course: isEdit ? "Kursni tahrirlash" : "Yangi kurs",
    group: isEdit ? "Guruhni tahrirlash" : "Yangi guruh",
    mentor: isEdit ? "Mentorni tahrirlash" : "Yangi mentor",
    student: isEdit ? "Talabani tahrirlash" : "Yangi talaba",
  };
  document.getElementById("m-title").textContent = titles[type];
  const fns = {
    course: formCourse,
    group: formGroup,
    mentor: formMentor,
    student: formStudent,
  };
  document.getElementById("m-body").innerHTML = fns[type](data);
  document.getElementById("overlay").classList.add("open");
  if (type === "mentor") {
    setTimeout(() => {
      setupFileUpload();
      renderFilePreview();
      renderPhotoPreview();
    }, 80);
  }
  if (type === "group" && data.id) {
    setTimeout(() => liveCheckConflict(data.id), 80);
  }
  setTimeout(() => document.getElementById("f-name")?.focus(), 120);
}
function closeModal() {
  document.getElementById("overlay").classList.remove("open");
  _uploadedFile = null;
  _uploadedPhoto = null;
}
async function saveModal() {
  const type = _modalType,
    isEdit = !!_editId;
  let req = [];
  if (type === "course")
    req = [{ id: "f-name" }, { id: "f-dur" }, { id: "f-price" }];
  else if (type === "group")
    req = [{ id: "f-name" }, { id: "f-course" }, { id: "f-start" }];
  else if (type === "mentor")
    req = [
      { id: "f-name" },
      { id: "f-phone" },
      { id: "f-age" },
      { id: "f-subj" },
      { id: "f-exp" },
      { id: "f-email" },
      { id: "f-tg" },
      { id: "f-addr" },
      { id: "f-join" },
      { id: "f-resume" },
    ];
  else if (type === "student") {
    req = [
      { id: "f-firstname" },
      { id: "f-lastname" },
      { id: "f-phone" },
      { id: "f-group" },
      { id: "f-login" },
    ];
    if (!isEdit) req.push({ id: "f-pass" });
  }
  if (!validateRequired(req)) {
    toast("⚠️ Majburiy maydonlarni to'ldiring!");
    return;
  }
  const nameEl = document.getElementById("f-name");
  const name = nameEl ? nameEl.value.trim() : "";
  if (type === "group") {
    const ts = document.getElementById("f-timestart").value || "";
    const te = document.getElementById("f-timeend").value || "";
    const room = (document.getElementById("f-room").value || "").trim();
    if (ts && te && timeToMin(te) <= timeToMin(ts)) {
      toast("⚠️ Tugash vaqti boshlanish vaqtidan katta bo'lishi kerak!");
      return;
    }
    if (room && ts && te) {
      const conflict = checkRoomConflict(room, ts, te, isEdit ? _editId : null);
      if (conflict) {
        toast("🚫 Xona band!");
        return;
      }
    }
    const days = DAYS.filter(
      (_, i) => document.getElementById("d" + i)?.checked,
    );
    // Telegram chat ID — xato ID jimgina "ishlamaydigan" integratsiyaga olib
    // keladi: bot davomatni qabul qiladi, lekin Telegramga yubora olmaydi va
    // CRM tomonda hech qanday xato ko'rinmaydi. Shuning uchun shu yerda
    // to'xtatamiz (backend'da ham xuddi shu tekshiruv bor).
    // Oddiy guruh id si "-100..." bo'lmasligi mumkin (masalan -5158624661) —
    // shuning uchun faqat "manfiy butun son"ligini tekshiramiz.
    const tgChat = (document.getElementById("f-tgchat")?.value || "").trim();
    if (tgChat && !/^-\d{6,15}$/.test(tgChat)) {
      toast(
        "🚫 Chat ID noto'g'ri — guruh id si minus bilan boshlangan son bo'ladi (-1001234567890)",
      );
      return;
    }
    const d = {
      name,
      courseId: parseInt(document.getElementById("f-course").value) || null,
      mentorId: parseInt(document.getElementById("f-mentor").value) || null,
      status: "Faol",
      startDate: document.getElementById("f-start").value,
      days,
      room,
      timeStart: ts,
      timeEnd: te,
      // Telegram davomat boti: ota-onalar guruhining chat ID si
      telegramChatId: tgChat,
    };
    if (isEdit)
      Object.assign(
        D.groups.find((x) => x.id === _editId),
        d,
      );
    else {
      d.id = newId();
      D.groups.push(d);
    }
    const savedGid = isEdit ? _editId : d.id;
    syncGroupRelations(D);
    updateGroupFilters();
    renderGroups();
    closeModal();
    saveData();
    updateCounts();
    if (document.getElementById("panel-dashboard").classList.contains("active"))
      renderDashboard();
    toast(isEdit ? "✅ Yangilandi!" : "✅ Qo'shildi!");
    // Telegram chat ID jimgina yo'qolib qolmasin — backend'dan tasdiqlaymiz
    if (tgChat && typeof window.verifyTelegramChatSaved === "function")
      window.verifyTelegramChatSaved(savedGid, tgChat);
    return;
  }
  if (type === "course") {
    const d = {
      name,
      duration: document.getElementById("f-dur").value.trim(),
      price: document.getElementById("f-price").value.trim(),
      status: document.getElementById("f-status").value,
    };
    if (isEdit)
      Object.assign(
        D.courses.find((x) => x.id === _editId),
        d,
      );
    else {
      d.id = newId();
      D.courses.push(d);
    }
    syncGroupRelations(D);
    updateGroupFilters();
    updateStudentCourseFilter();
    renderCourses();
    closeModal();
    saveData();
    updateCounts();
    if (document.getElementById("panel-dashboard").classList.contains("active"))
      renderDashboard();
    toast(isEdit ? "✅ Yangilandi!" : "✅ Qo'shildi!");
    return;
  }
  if (type === "mentor") {
    const age = parseInt(
      (document.getElementById("f-age").value || "0").trim(),
    );
    if (!age || age < 18) {
      toast("⚠️ Mentor yoshi 18 dan katta bo'lishi kerak!");
      document.getElementById("f-age").focus();
      return;
    }
    const tg = (document.getElementById("f-tg").value || "").trim();
    if (!tg.startsWith("@")) {
      toast("⚠️ Telegram username @ belgisi bilan boshlanishi kerak!");
      document.getElementById("f-tg").focus();
      return;
    }
    const d = {
      name,
      phone: document.getElementById("f-phone").value.trim(),
      subject: document.getElementById("f-subj").value,
      experience: document.getElementById("f-exp").value.trim(),
      age: String(age),
      email: document.getElementById("f-email").value.trim(),
      telegram: tg,
      address: document.getElementById("f-addr").value.trim(),
      joinDate: document.getElementById("f-join").value,
      resume: document.getElementById("f-resume").value.trim(),
      resumeFile: _uploadedFile,
      photo: _uploadedPhoto,
    };
    if (isEdit)
      Object.assign(
        D.mentors.find((x) => x.id === _editId),
        d,
      );
    else {
      d.id = newId();
      D.mentors.push(d);
    }
    syncGroupRelations(D);
    updateGroupFilters();
    renderMentors();
    closeModal();
    saveData();
    updateCounts();
    if (document.getElementById("panel-dashboard").classList.contains("active"))
      renderDashboard();
    toast(isEdit ? "✅ Yangilandi!" : "✅ Qo'shildi!");
    return;
  }
  if (type === "student") {
    const birth = document.getElementById("f-birth").value || "";
    if (!birth) {
      toast("⚠️ Tug'ilgan sanani kiriting!");
      document.getElementById("f-birth").focus();
      return;
    }
    const firstName = (
      document.getElementById("f-firstname").value || ""
    ).trim();
    const lastName = (document.getElementById("f-lastname").value || "").trim();
    const fullName = firstName + (lastName ? " " + lastName : "");
    const groupId = parseInt(document.getElementById("f-group").value);
    // ---- 1.2: Login va parol tekshiruvi (Student Panelga kirish uchun) ----
    const loginVal = (document.getElementById("f-login").value || "").trim().toLowerCase();
    const passVal = (document.getElementById("f-pass").value || "").trim();
    if (loginVal.length < 3) {
      toast("⚠️ " + t("login_too_short"));
      document.getElementById("f-login").focus();
      return;
    }
    if (passVal && passVal.length < 5) {
      toast("⚠️ " + t("pass_too_short"));
      document.getElementById("f-pass").focus();
      return;
    }
    if (isLoginTaken(loginVal, "student", isEdit ? _editId : null)) {
      toast("⚠️ " + t("login_taken"));
      document.getElementById("f-login").focus();
      return;
    }
    const d = {
      firstName,
      lastName,
      name: fullName,
      phone: document.getElementById("f-phone").value.trim(),
      joinDate: document.getElementById("f-join").value,
      birthDate: birth,
      parentName: document.getElementById("f-parent").value.trim(),
      parentPhone: document.getElementById("f-pphone").value.trim(),
      groupId,
      status: document.getElementById("f-status").value,
      isDebtor: document.getElementById("f-debt").value === "1",
      source: document.getElementById("f-src").value,
      notes: document.getElementById("f-notes").value.trim(),
    };
    let studentId;
    if (isEdit) {
      Object.assign(
        D.students.find((x) => x.id === _editId),
        d,
      );
      studentId = _editId;
    } else {
      d.id = newId();
      D.students.push(d);
      studentId = d.id;
    }
    // ---- Login/parolni saqlash: parol hech qachon ochiq matnda saqlanmaydi (SHA-256 hash) ----
    let credToShow = null;
    try {
      const existingCred = getStudentUsers().find(
        (u) => String(u.studentId) === String(studentId),
      );
      let passHash = existingCred ? existingCred.pass : null;
      if (passVal) {
        passHash = await sha256Hex(passVal);
        credToShow = { login: loginVal, pass: passVal };
      }
      if (passHash) {
        const filtered = getStudentUsers().filter(
          (u) => String(u.studentId) !== String(studentId),
        );
        filtered.push({
          login: loginVal,
          pass: passHash,
          name: fullName,
          role: "Talaba",
          studentId: studentId,
          studentName: fullName,
          hashed: true,
        });
        saveStudentUsers(filtered);
        renderStudentCredsList();
      }
    } catch (e) {}
    renderStudents();
    renderGroups();
    renderCourses();
    closeModal();
    saveData();
    updateCounts();
    if (document.getElementById("panel-dashboard").classList.contains("active"))
      renderDashboard();
    toast(isEdit ? "✅ Yangilandi!" : "✅ Qo'shildi!");
    if (credToShow) showCredentialsAlert(fullName, credToShow.login, credToShow.pass);
    return;
  }
}
// ---- 1.2: Login/parol yaratilgach, admin uchun bir martalik ko'rsatish oynasi ----
// (parol xesh qilib saqlangani uchun, buni keyinroq qayta ko'rsatib bo'lmaydi —
//  shu sabab admin uni shu yerda darhol nusxalab olishi kerak)
function showCredentialsAlert(name, login, pass) {
  const old = document.getElementById("cred-alert-overlay");
  if (old) old.remove();
  const div = document.createElement("div");
  div.id = "cred-alert-overlay";
  div.style.cssText =
    "position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(2px);animation:fadeIn .2s ease";
  div.innerHTML = `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r-lg);max-width:380px;width:100%;padding:24px;box-shadow:0 20px 50px rgba(0,0,0,.35)">
    <div style="font-size:34px;text-align:center;margin-bottom:8px">🔐</div>
    <div style="font-weight:700;font-size:16px;text-align:center;margin-bottom:4px">${t("cred_saved_title")}</div>
    <div style="font-size:13px;color:var(--text3);text-align:center;margin-bottom:18px">${name}</div>
    <div style="background:var(--bg);border:1px dashed var(--border2);border-radius:var(--r-md);padding:14px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span style="font-size:12px;color:var(--text3)">${t("login_label")}</span>
        <b style="font-family:'JetBrains Mono',monospace;font-size:14.5px" id="cred-alert-login">${login}</b>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:12px;color:var(--text3)">${t("password_label")}</span>
        <b style="font-family:'JetBrains Mono',monospace;font-size:14.5px" id="cred-alert-pass">${pass}</b>
      </div>
    </div>
    <div style="font-size:11.5px;color:var(--amber-text);background:var(--amber-light);border-radius:var(--r-sm);padding:8px 10px;margin-bottom:16px">⚠️ ${t("cred_saved_warning")}</div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-sm" style="flex:1;justify-content:center" onclick="_copyCreds('${login.replace(/'/g, "\\'")}','${pass.replace(/'/g, "\\'")}')">📋 ${t("copy_btn")}</button>
      <button class="btn btn-sm btn-primary" style="flex:1;justify-content:center" onclick="document.getElementById('cred-alert-overlay').remove()">${t("ok_btn")}</button>
    </div>
  </div>`;
  document.body.appendChild(div);
}
function _copyCreds(login, pass) {
  const text = t("login_label") + ": " + login + "\n" + t("password_label") + ": " + pass;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(() => toast("📋 " + t("copied_msg")))
      .catch(() => toast(text));
  } else {
    toast(text);
  }
}
function editItem(type, id) {
  const map = {
    course: D.courses,
    group: D.groups,
    mentor: D.mentors,
    student: D.students,
  };
  openModal(
    type,
    map[type].find((x) => x.id === id),
  );
}
function delItem(type, id) {
  const map = {
    course: D.courses,
    group: D.groups,
    mentor: D.mentors,
    student: D.students,
  };
  const item = map[type].find((x) => x.id === id);
  if (!item) return;
  const displayName =
    item.name ||
    (item.firstName
      ? item.firstName + (item.lastName ? " " + item.lastName : "")
      : "");
  showDelModal(displayName, () => {
    const key = {
      course: "courses",
      group: "groups",
      mentor: "mentors",
      student: "students",
    }[type];
    D[key] = D[key].filter((x) => x.id !== id);
    const rnds = {
      course: renderCourses,
      group: renderGroups,
      mentor: renderMentors,
      student: renderStudents,
    };
    rnds[type]();
    if (type === "student" || type === "group") {
      renderGroups();
      renderCourses();
    }
    if (type === "mentor") updateGroupFilters();
    syncGroupRelations(D);
    saveData();
    updateCounts();
    if (document.getElementById("panel-dashboard").classList.contains("active"))
      renderDashboard();
    toast("\u{1F5D1} O'chirildi");
  });
}
function showDelModal(name, cb) {
  pendingDelName = name;
  pendingDelCb = cb;
  document.getElementById("del-target-name").textContent = name;
  document.getElementById("del-input").value = "";
  const btn = document.getElementById("del-confirm-btn");
  btn.disabled = true;
  btn.style.opacity = ".4";
  btn.style.cursor = "not-allowed";
  document.getElementById("del-overlay").classList.add("open");
  setTimeout(() => document.getElementById("del-input").focus(), 120);
}
function closeDelModal() {
  document.getElementById("del-overlay").classList.remove("open");
  pendingDelCb = null;
  pendingDelName = "";
}
function checkDelInput() {
  const val = document.getElementById("del-input").value;
  const btn = document.getElementById("del-confirm-btn");
  const inp = document.getElementById("del-input");
  const match = val === pendingDelName;
  btn.disabled = !match;
  btn.style.opacity = match ? "1" : ".4";
  btn.style.cursor = match ? "pointer" : "not-allowed";
  inp.classList.toggle("valid", match && val.length > 0);
}
function executeDelete() {
  if (pendingDelCb) pendingDelCb();
  closeDelModal();
}
function execDelCourse(id) {
  D.courses = D.courses.filter((x) => x.id !== id);
  renderCourses();
  saveData();
  updateCounts();
  toast("🗑 O'chirildi");
}

function updateTopbar(tab) {
  const L = LANG;
  const titles = {
    dashboard: t("dashboard_title"),
    courses: t("courses_title"),
    groups: t("groups_title"),
    mentors: t("mentors_title"),
    students: t("students_title"),
    finance: t("finance_title"),
    certificates:
      L === "ru" ? "🎖 Сертификаты" : L === "en" ? "🎖 Certificates" : "🎖 Sertifikatlar",
    "student-certificates":
      L === "ru"
        ? "🎖 Мои сертификаты"
        : L === "en"
          ? "🎖 My Certificates"
          : "🎖 Sertifikatlarim",
    settings: t("settings_title"),
    "mentor-dash":
      L === "ru"
        ? "📊 Дашборд ментора"
        : L === "en"
          ? "📊 Mentor Dashboard"
          : "📊 Mentor Dashboard",
    "mentor-groups":
      L === "ru"
        ? "👥 Мои группы"
        : L === "en"
          ? "👥 My Groups"
          : "👥 Guruhlarim",
    "mentors-my":
      L === "ru"
        ? "📅 Моё расписание"
        : L === "en"
          ? "📅 My Schedule"
          : "📅 Mening jadvalim",
    "mentor-chat":
      L === "ru"
        ? "💬 Чат со студентами"
        : L === "en"
          ? "💬 Student Chat"
          : "💬 Talabalar bilan chat",
    "student-my":
      L === "ru"
        ? "🏠 Моя панель"
        : L === "en"
          ? "🏠 My Dashboard"
          : "🏠 Dashboard",
    tests: L === "ru" ? "📝 Тесты" : L === "en" ? "📝 Tests" : "📝 Testlar",
    grades: L === "ru" ? "🏅 Оценки" : L === "en" ? "🏅 Grades" : "🏅 Baholash",
    "student-schedule":
      L === "ru"
        ? "📅 Расписание"
        : L === "en"
          ? "📅 Schedule"
          : "📅 Dars jadvali",
    "student-rating":
      L === "ru"
        ? "🏆 Рейтинг группы"
        : L === "en"
          ? "🏆 Group Rating"
          : "🏆 Guruh reytingi",
    "student-grades":
      L === "ru"
        ? "🏅 Мои оценки"
        : L === "en"
          ? "🏅 My Grades"
          : "🏅 Baholash",
    "student-tests":
      L === "ru" ? "📝 Тесты" : L === "en" ? "📝 Tests" : "📝 Testlar",
    "student-chat": L === "ru" ? "💬 Чат" : L === "en" ? "💬 Chat" : "💬 Chat",
    "student-goals":
      L === "ru"
        ? "🎯 Мои цели"
        : L === "en"
          ? "🎯 My Goals"
          : "🎯 Maqsadlarim",
    "mentor-videos":
      L === "ru"
        ? "🎬 Видеоуроки"
        : L === "en"
          ? "🎬 Video Lessons"
          : "🎬 Video Darsliklar",
    "student-videos":
      L === "ru"
        ? "🎬 Видеоуроки"
        : L === "en"
          ? "🎬 Video Lessons"
          : "🎬 Video Darsliklar",
    "coin-shop":
      L === "ru"
        ? "🪙 Монетный магазин"
        : L === "en"
          ? "🪙 Coin Shop"
          : "🪙 Coin Shop",
    "student-coin-shop":
      L === "ru"
        ? "🛍️ Монетный магазин"
        : L === "en"
          ? "🛍️ Coin Shop"
          : "🛍️ Coin Shop",
  };
  const subs = {
    dashboard: t("dashboard_sub"),
    courses: t("courses_sub"),
    groups: t("groups_sub"),
    mentors: t("mentors_sub"),
    students: t("students_sub"),
    finance: t("finance_sub"),
    settings: t("settings_sub"),
    "mentor-dash":
      L === "ru"
        ? "Личные данные · Группы · Зарплата · Активные студенты"
        : L === "en"
          ? "Personal · Groups · Salary · Active Students"
          : "Shaxsiy ma'lumotlar · Guruhlar · Oylik · Aktiv talabalar",
    "mentor-groups":
      L === "ru"
        ? "Выберите группу и отметьте посещаемость"
        : L === "en"
          ? "Pick a group and take attendance"
          : "Guruhni tanlang va davomat qiling",
    "mentors-my":
      L === "ru"
        ? "Дни уроков · Время · Номер кабинета"
        : L === "en"
          ? "Lesson days · Time · Room"
          : "Dars kunlari · vaqti · xona raqami",
    "mentor-chat":
      L === "ru"
        ? "Прямое общение со студентами"
        : L === "en"
          ? "Direct messaging with students"
          : "Talabalar bilan to'g'ridan-to'g'ri yozishuv",
    "student-my":
      L === "ru"
        ? "Посещаемость · Рейтинг · Оплата"
        : L === "en"
          ? "Attendance · Rating · Payment"
          : "Davomat · Reyting · To'lov holati",
    tests:
      L === "ru"
        ? "Тесты по группам — загружает ментор"
        : L === "en"
          ? "Group tests — uploaded by mentor"
          : "Guruh bo'yicha testlar — mentor yuklaydi",
    grades:
      L === "ru"
        ? "Критерии оценки для каждой группы"
        : L === "en"
          ? "Grading criteria per group"
          : "Har bir guruh uchun alohida baholash mezonlari",
    "student-schedule":
      L === "ru"
        ? "Время · Кабинет · Дни занятий"
        : L === "en"
          ? "Time · Room · Lesson days"
          : "Vaqt · Xona · Dars kunlari",
    "student-rating":
      L === "ru"
        ? "Ваше место в группе · % посещаемости"
        : L === "en"
          ? "Your rank · Attendance %"
          : "Guruh ichida o'rningiz · Davomat foizi",
    "student-grades":
      L === "ru"
        ? "Критерии · Итоговая оценка"
        : L === "en"
          ? "Criteria · Final Grade"
          : "Baholash mezonlari · Yakuniy ball",
    "student-tests":
      L === "ru"
        ? "Тесты группы · Результаты"
        : L === "en"
          ? "Group tests · Results"
          : "Guruh testlari · Natijalar",
    "student-chat":
      L === "ru"
        ? "Общение с ментором"
        : L === "en"
          ? "Chat with mentor"
          : "Mentor bilan yozishuv",
    certificates:
      L === "ru"
        ? "Шаблон · QR-код · Печать"
        : L === "en"
          ? "Template · QR code · Print"
          : "Shablon · QR kod · Chop etish",
    "student-certificates":
      L === "ru"
        ? "Ваши сертификаты · Скачать"
        : L === "en"
          ? "Your certificates · Download"
          : "Sizning sertifikatlaringiz · Yuklab olish",
    "student-goals":
      L === "ru"
        ? "Цели · Достижения · Мотивация"
        : L === "en"
          ? "Goals · Achievements · Motivation"
          : "Maqsadlar · Yutuqlar · Motivatsiya",
  };
  if (tab === "coin-shop") {
    document.getElementById("tb-sub").textContent =
      L === "ru"
        ? "Магазин · Баланс менторов · Покупки"
        : L === "en"
          ? "Shop · Mentor balances · Purchases"
          : "Dokon · Mentor balanslari · Xaridlar";
  }
  document.getElementById("tb-title").textContent = titles[tab] || tab;
  document.getElementById("tb-sub").textContent = subs[tab] || "";
}
function go(tab, el) {
  if (tab !== 'mentor-chat' && typeof stopChatPolling === 'function') stopChatPolling();
  if (tab !== 'student-chat' && typeof _studentChatPollTimer !== 'undefined' && _studentChatPollTimer) {
    clearInterval(_studentChatPollTimer); window._studentChatPollTimer = null;
  }
  const _sb = document.getElementById("sidebar");
  const _ov = document.getElementById("sidebar-overlay");
  if (_sb) _sb.classList.remove("open");
  if (_ov) _ov.classList.remove("open");
  document
    .querySelectorAll(".nav-btn")
    .forEach((b) => b.classList.remove("active"));
  document
    .querySelectorAll(".panel")
    .forEach((p) => p.classList.remove("active"));
  if (el) el.classList.add("active");
  const panelEl = document.getElementById("panel-" + tab);
  if (panelEl) panelEl.classList.add("active");
  currentTab = tab;
  saveUI();
  updateTopbar(tab);
  if (tab === "dashboard") renderDashboard();
  if (tab === "finance") renderFinance();
  if (tab === "settings") {
    setTimeout(() => {
      renderSettingsPanel();
      if (typeof isMentorRole === "function" && isMentorRole()) {
        [
          "nav-dashboard",
          "nav-courses",
          "nav-groups",
          "nav-mentors",
          "nav-students",
          "nav-finance",
          "nav-certificates",
          "nav-admin-chats",
        ].forEach(function (id) {
          var el = document.getElementById(id);
          if (el) el.style.display = "none";
        });
      }
      if (typeof isStudentRole === "function" && isStudentRole()) {
        [
          "nav-dashboard",
          "nav-courses",
          "nav-groups",
          "nav-mentors",
          "nav-students",
          "nav-finance",
          "nav-certificates",
          "nav-admin-chats",
          "nav-mentor-dash",
          "nav-mentor-groups",
          "nav-mentors-my",
          "nav-mentor-chat",
          "nav-tests-mentor",
          "nav-grades-mentor",
          "nav-tests",
          "nav-grades",
        ].forEach(function (id) {
          var el = document.getElementById(id);
          if (el) el.style.display = "none";
        });
      }
    }, 50);
  }
  if (tab === "mentor-dash") renderMentorDashboard();
  if (tab === "mentor-ai" && typeof renderMentorAI === "function")
    renderMentorAI();
  if (tab === "mentor-students-ai" && typeof renderMentorStudentsAI === "function")
    renderMentorStudentsAI();
  if (tab === "student-ai" && typeof renderStudentAI === "function")
    renderStudentAI();
  if (tab === "mentor-groups" && typeof renderMentorGroups === "function")
    renderMentorGroups();
  if (tab === "mentors-my") renderMySchedule();
  if (tab === "mentor-chat") renderMentorChat();
  if (tab === "student-my") renderStudentDashboard();
  if (tab === "tests") renderTestsPanel();
  if (tab === "grades") renderGradesPanel();
  if (tab === "student-schedule") renderStudentSchedulePage();
  if (tab === "student-rating") renderStudentRatingPage();
  if (tab === "student-grades") renderStudentGradesPage();
  if (tab === "student-tests") renderStudentTestsPage();
  if (tab === "student-chat") renderStudentChatPage();
  if (tab === "student-goals") renderStudentGoalsPage();
  if (tab === "certificates" && typeof renderCertificates === "function")
    renderCertificates();
  if (
    tab === "student-certificates" &&
    typeof renderStudentCertificates === "function"
  )
    renderStudentCertificates();
  if (tab === "mentor-videos") renderMentorVideos();
  if (tab === "student-videos") renderStudentVideos();
  if (tab === "coin-shop" && typeof renderAdminCoinShop === "function")
    renderAdminCoinShop();
  if (
    tab === "student-coin-shop" &&
    typeof renderStudentCoinShop === "function"
  )
    renderStudentCoinShop();
  if (tab === "admin-chats" && typeof renderAdminChatMonitor === "function")
    renderAdminChatMonitor();
  if (tab !== "admin-chats" && typeof stopAdminChatMonitor === "function")
    stopAdminChatMonitor();
  document.getElementById("scroll").scrollTop = 0;
}
function renderAll() {
  if (!isMentorRole() && !isStudentRole()) {
    renderCourses();
    renderGroups();
    renderMentors();
    renderStudents();
    renderDashboard();
  }
  applyTranslations();
}
function exportData() {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          courses: D.courses,
          groups: D.groups,
          mentors: D.mentors,
          students: D.students,
          attendance: D.attendance,
          finance: D.finance,
          certificates: D.certificates || [],
          certTemplates: D.certTemplates || [],
        },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "edumanage_" + todayStr() + ".json";
  a.click();
  toast("📥 Yuklab olindi!");
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeModal();
    closeDetail();
    closeDelModal();
    closeStatModal();
    closeLightbox();
    closeFinModal();
    closeMentorSalaryModal();
  }
});

function initApp() {
  Object.assign(D, loadData());
  loadUI();
  // Backend dan yangi ma'lumotlar yuklanadi (barcha panellar sinxron bo'lishi uchun)
  syncFromBackend();
  if (!D.attendance) D.attendance = {};
  if (!D.finance) D.finance = [];
  if (!D.gradingCriteria) D.gradingCriteria = {};
  if (!D.grades) D.grades = {};
  if (!D.simpleGrades) D.simpleGrades = {};
  if (!D.tests) D.tests = [];
  if (!D.testResults) D.testResults = {};
  if (!D.certificates) D.certificates = [];
  if (!D.certTemplates) D.certTemplates = [];
  D.mentors.forEach((m) => {
    if (!("photo" in m)) m.photo = null;
  });
  D.students.forEach((s) => {
    if (!s.firstName) {
      const parts = (s.name || "").split(" ");
      s.firstName = parts[0] || "";
      s.lastName = parts.slice(1).join(" ") || "";
    }
  });

  // FIX #1: Apply logo/name BEFORE showing app
  applyUISettings();

  // Init finance month to current
  const now = new Date();
  _finMonth = now.getMonth();
  _finYear = now.getFullYear();

  document
    .querySelectorAll(".lang-btn")
    .forEach((b) => b.classList.remove("active"));
  const lb = document.getElementById("lb-" + LANG);
  if (lb) lb.classList.add("active");

  // Mentor bo'lsa FAQAT kerakli ma'lumotlarni yuklaymiz, admin panellarini render qilmaymiz
  // currentTab loadUI() da allaqachon to'g'ri o'rnatilgan (rolga qarab)
  if (isMentorRole()) {
    updateCounts();
    startPresenceHeartbeat();
  } else if (isStudentRole()) {
    updateCounts();
    startPresenceHeartbeat();
  } else {
    // Admin uchun to'liq init - tests/grades nav yashirin (faqat mentor uchun)
    [
      "nav-tests",
      "nav-grades",
      "nav-mentor-dash",
      "nav-mentor-groups",
      "nav-mentors-my",
      "nav-mentor-chat",
      "nav-mentor-ai",
      "nav-mentor-students-ai",
      "nav-admin-chats",
      "nav-tests-mentor",
      "nav-grades-mentor",
      "nav-student-my",
      "nav-student-schedule",
      "nav-student-rating",
      "nav-student-grades",
      "nav-student-tests",
      "nav-student-chat",
      "nav-student-ai",
      "nav-student-goals",
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    });
    updateCounts();
    updateGroupFilters();
    updateStudentCourseFilter();
    renderCourses();
    renderGroups();
    renderMentors();
    renderStudents();
    renderDashboard();
    const navEl = document.getElementById("nav-" + currentTab);
    go(currentTab, navEl || document.getElementById("nav-dashboard"));
  }
  updateStorageBadge(true);
  applyTranslations();
}

// ===================== ADMIN SELF CREDENTIALS =====================
// Admin o'z login va parolini serverda (/api/auth/change-password) yangilaydi.
// Joriy parol so'ralmaydi — so'rov baribir faqat kirgan admin sessiyasi bilan boradi.
async function saveAdminCredentials() {
  const loginEl = document.getElementById("sett-admin-login");
  const passEl = document.getElementById("sett-admin-pass");
  const pass2El = document.getElementById("sett-admin-pass2");
  const me = (window.CRMAuth && window.CRMAuth.user()) || {};
  const login = (loginEl?.value || "").trim().toLowerCase();
  const pass = (passEl?.value || "").trim();
  const pass2 = (pass2El?.value || "").trim();
  const loginChanged = !!login && login !== String(me.username || "").toLowerCase();

  if (!loginChanged && !pass) {
    toast("⚠️ Yangi login yoki parol kiriting");
    return;
  }
  if (loginChanged && login.length < 3) {
    toast("⚠️ Login kamida 3 ta belgi bo'lsin!");
    return;
  }
  if (pass && pass.length < 5) {
    toast("⚠️ Parol kamida 5 ta belgi bo'lsin!");
    return;
  }
  if (pass && pass !== pass2) {
    toast("⚠️ Parollar bir xil emas!");
    return;
  }

  // ⚠️ Faqat ADMIN o'zgartira oladi (server ham shuni talab qiladi).
  if (!(window.CRMAuth && window.CRMAuth.role() === "admin")) {
    toast("🔒 Login/parolni faqat administrator o'zgartiradi");
    return;
  }

  const r = await window.CRMAuth.updateCredentials(loginChanged ? login : null, pass || null);
  if (!r || !r.ok) {
    toast("⚠️ " + ((r && r.error) || "Saqlanmadi"));
    return;
  }

  const newLogin = (r.user && r.user.username) || login;
  const cur = document.getElementById("sett-admin-current");
  if (cur) cur.textContent = newLogin;
  if (loginEl) loginEl.value = newLogin;
  if (passEl) passEl.value = "";
  if (pass2El) pass2El.value = "";
  const what = loginChanged && pass ? "Login va parol yangilandi" : loginChanged ? "Login yangilandi" : "Parol yangilandi";
  toast("✅ " + what + ". Boshqa qurilmalardagi sessiyalar yopildi.");
}

// ===================== MENTOR CREDENTIALS (ADMIN) =====================
function saveMentorCredentials() {
  const sel = document.getElementById("sett-mentor-select");
  const login = (
    document.getElementById("sett-mentor-login").value || ""
  ).trim();
  const pass = (document.getElementById("sett-mentor-pass").value || "").trim();
  const mentorName = sel.options[sel.selectedIndex]?.text || "";
  if (!sel.value) {
    toast("⚠️ Mentor tanlang!");
    return;
  }
  if (!login || login.length < 2) {
    toast("⚠️ Login kamida 2 ta belgi!");
    return;
  }
  if (!pass || pass.length < 5) {
    toast("⚠️ Parol kamida 5 ta belgi!");
    return;
  }
  // Login boshqa foydalanuvchida bormi?
  const existing = getMentorUsers();
  const conflict = existing.find(
    (u) => u.login === login && u.mentorId !== sel.value,
  );
  if (conflict) {
    toast("⚠️ Bu login allaqachon band!");
    return;
  }
  // Eski yozuvni o'chirib yangi qo'sh
  const filtered = existing.filter((u) => u.mentorId !== sel.value);
  filtered.push({
    login,
    pass,
    name: mentorName,
    role: "Mentor",
    mentorId: sel.value,
    mentorName: mentorName,
  });
  saveMentorUsers(filtered);
  toast("✅ " + mentorName + " uchun login/parol saqlandi!");
  renderMentorCredsList();
  document.getElementById("sett-mentor-login").value = "";
  document.getElementById("sett-mentor-pass").value = "";
}

function renderMentorCredsList() {
  const listEl = document.getElementById("mentor-creds-list");
  if (!listEl) return;
  const sel = document.getElementById("sett-mentor-select");
  // Populate mentor select
  if (sel) {
    const cur = sel.value;
    sel.innerHTML =
      '<option value="">— Mentor tanlang —</option>' +
      // 🔧 BUG FIX: ma'lumot hali yuklanmagan bo'lsa (masalan chiqilgan
      // holatda yoki birinchi sinxronlashdan oldin) D.mentors `undefined`
      // bo'lib, bu yer TypeError berardi va butun qayta chizish to'xtardi.
      (D.mentors || [])
        .map(
          (m) =>
            `<option value="${m.id}" ${String(m.id) === String(cur) ? "selected" : ""}>${m.name}</option>`,
        )
        .join("");
    // If selected mentor has creds, prefill
    if (cur) {
      const u = getMentorUsers().find(
        (u) => String(u.mentorId) === String(cur),
      );
      if (u) {
        document.getElementById("sett-mentor-login").value = u.login;
        document.getElementById("sett-mentor-pass").value = u.pass;
      }
    }
  }
  const users = getMentorUsers();
  if (!users.length) {
    listEl.innerHTML =
      '<div style="font-size:12px;color:var(--text3);padding:6px 0">Hali hech bir mentorga login berilmagan.</div>';
    return;
  }
  listEl.innerHTML =
    '<div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:8px">Hisob berilgan mentorlar:</div>' +
    users
      .map(
        (u) => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg2);border-radius:var(--r-md);border:1px solid var(--border);margin-bottom:6px">
      <span style="font-weight:600;font-size:13px;flex:1">${u.name}</span>
      <span style="font-size:12px;color:var(--text2);font-family:'JetBrains Mono',monospace">${u.login}</span>
      <button class="btn btn-sm btn-del-outline" style="padding:3px 8px;font-size:11px" onclick="deleteMentorCredential('${u.mentorId}')">✕ O'chirish</button>
    </div>`,
      )
      .join("");
}

async function deleteMentorCredential(mentorId) {
  if (!(await crmConfirm("Bu mentorning login/paroli o'chirilsinmi?", { danger: true }))) return;
  const filtered = getMentorUsers().filter(
    (u) => String(u.mentorId) !== String(mentorId),
  );
  saveMentorUsers(filtered);
  renderMentorCredsList();
  toast("🗑 Login/parol o'chirildi");
}

// ===================== STUDENT CREDENTIALS =====================
function saveStudentCredentials() {
  const sel = document.getElementById("sett-student-select");
  const login = (
    document.getElementById("sett-student-login").value || ""
  ).trim();
  const pass = (
    document.getElementById("sett-student-pass").value || ""
  ).trim();
  const studentName = sel.options[sel.selectedIndex]?.text || "";
  if (!sel.value) {
    toast("⚠️ Talaba tanlang!");
    return;
  }
  if (!login || login.length < 2) {
    toast("⚠️ Login kamida 2 ta belgi!");
    return;
  }
  if (!pass || pass.length < 5) {
    toast("⚠️ Parol kamida 5 ta belgi!");
    return;
  }
  const existing = getStudentUsers();
  const conflict = existing.find(
    (u) => u.login === login && String(u.studentId) !== String(sel.value),
  );
  if (conflict) {
    toast("⚠️ Bu login allaqachon band!");
    return;
  }
  // Mentor loginlari bilan to'qnashmasin (sync check)
  const mentorConflict = getMentorUsers().find((u) => u.login === login);
  if (mentorConflict) {
    toast("⚠️ Bu login mentor uchun band!");
    return;
  }
  const filtered = existing.filter(
    (u) => String(u.studentId) !== String(sel.value),
  );
  filtered.push({
    login,
    pass,
    name: studentName,
    role: "Talaba",
    studentId: sel.value,
    studentName: studentName,
  });
  saveStudentUsers(filtered);
  toast("✅ " + studentName + " uchun login/parol saqlandi!");
  renderStudentCredsList();
  document.getElementById("sett-student-login").value = "";
  document.getElementById("sett-student-pass").value = "";
}

function renderStudentCredsList() {
  const listEl = document.getElementById("student-creds-list");
  if (!listEl) return;
  const sel = document.getElementById("sett-student-select");
  if (sel) {
    const cur = sel.value;
    sel.innerHTML =
      '<option value="">— Talaba tanlang —</option>' +
      (D.students || [])
        .map(
          (s) =>
            `<option value="${s.id}" ${String(s.id) === String(cur) ? "selected" : ""}>${s.name} — ${groupLabel(s.groupId)}</option>`,
        )
        .join("");
    if (cur) {
      const u = getStudentUsers().find(
        (u) => String(u.studentId) === String(cur),
      );
      if (u) {
        document.getElementById("sett-student-login").value = u.login;
        document.getElementById("sett-student-pass").value = u.pass;
      }
    }
  }
  const users = getStudentUsers();
  if (!users.length) {
    listEl.innerHTML =
      '<div style="font-size:12px;color:var(--text3);padding:6px 0">Hali hech bir talabaga login berilmagan.</div>';
    return;
  }
  listEl.innerHTML =
    '<div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:8px">Login berilgan talabalar:</div>' +
    users
      .map(
        (u) => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg2);border-radius:var(--r-md);border:1px solid var(--border);margin-bottom:6px">
      <span style="font-weight:600;font-size:13px;flex:1">${u.name}</span>
      <span style="font-size:12px;color:var(--text2);font-family:'JetBrains Mono',monospace">${u.login}</span>
      <button class="btn btn-sm btn-del-outline" style="padding:3px 8px;font-size:11px" onclick="deleteStudentCredential('${u.studentId}')">✕ O'chirish</button>
    </div>`,
      )
      .join("");
}

async function deleteStudentCredential(studentId) {
  if (!(await crmConfirm("Bu talabaning login/paroli o'chirilsinmi?", { danger: true }))) return;
  const filtered = getStudentUsers().filter(
    (u) => String(u.studentId) !== String(studentId),
  );
  saveStudentUsers(filtered);
  renderStudentCredsList();
  toast("🗑 Talaba login/paroli o'chirildi");
}

// ===================== MENTOR MY SCHEDULE =====================
function showMentorGroupRating(gid) {
  const g = D.groups.find((x) => x.id === gid);
  if (!g) return;
  const ratings = calcGroupRating(gid);
  const AV_CLS_LOCAL = ["av-a", "av-b", "av-c", "av-d", "av-e"];
  let html = `<div style="font-size:13px;color:var(--text3);margin-bottom:14px">📚 ${g.course} · 👥 ${ratings.length} ta talaba</div>`;
  if (!ratings.length) {
    html +=
      '<div style="color:var(--text3);text-align:center;padding:20px">Talaba yo\'q</div>';
  } else {
    const statusBadge = {
      Aktiv: "b-teal",
      Faolsiz: "b-gray",
      Muzlatilgan: "b-blue",
      Probatsiya: "b-amber",
      Arxiv: "b-purple",
    };
    ratings.forEach((r, idx) => {
      const rc =
        r.rating >= 80
          ? "var(--teal-text)"
          : r.rating >= 60
            ? "var(--amber-text)"
            : "var(--orange-text)";
      const medal =
        idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}.`;
      html += `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:var(--r-md);border:1px solid var(--border);background:var(--bg2);margin-bottom:5px">
        <span style="font-size:16px;min-width:28px;text-align:center">${medal}</span>
        <div class="av ${AV_CLS_LOCAL[idx % 5]}" style="width:30px;height:30px;font-size:10px;flex-shrink:0">${ini(r.name)}</div>
        <span style="flex:1;font-size:13px;font-weight:600;color:var(--text)">${r.name}</span>
        <span class="badge ${statusBadge[r.status] || "b-gray"}" style="font-size:10px">${r.status}</span>
        ${r.isDebtor ? '<span class="badge b-orange" style="font-size:10px">💸</span>' : ""}
        <span style="font-size:15px;font-weight:800;color:${rc};min-width:42px;text-align:right">${r.rating}%</span>
      </div>`;
    });
  }
  document.getElementById("detail-title").textContent =
    "🏆 " + g.name + " — Guruh reytingi";
  document.getElementById("detail-body").innerHTML = html;
  document.getElementById("detail-foot").innerHTML =
    `<button class="btn" onclick="closeDetail()">${L === "ru" ? "Закрыть" : L === "en" ? "Close" : "Yopish"}</button>`;
  document.getElementById("detail-overlay").classList.add("open");
}
function renderMySchedule() {
  const wrap = document.getElementById("my-schedule-wrap");
  if (!wrap) return;
  const L = LANG;
  const cu = getCurrentUser();
  const mentorName = cu.mentorName || cu.name;
  // Mentorga tegishli guruhlarni topish
  const myGroups = D.groups.filter((g) => g.mentor === mentorName);
  const DAY_FULL =
    L === "ru"
      ? {
          Du: "Понедельник",
          Se: "Вторник",
          Ch: "Среда",
          Pa: "Четверг",
          Ju: "Пятница",
          Sh: "Суббота",
        }
      : L === "en"
        ? {
            Du: "Monday",
            Se: "Tuesday",
            Ch: "Wednesday",
            Pa: "Thursday",
            Ju: "Friday",
            Sh: "Saturday",
          }
        : {
            Du: "Dushanba",
            Se: "Seshanba",
            Ch: "Chorshanba",
            Pa: "Payshanba",
            Ju: "Juma",
            Sh: "Shanba",
          };
  const DAY_ORDER = { Du: 1, Se: 2, Ch: 3, Pa: 4, Ju: 5, Sh: 6 };
  const DAY_KEYS = ["Du", "Se", "Ch", "Pa", "Ju", "Sh"];

  if (!myGroups.length) {
    wrap.innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--text3)"><div style="font-size:48px;margin-bottom:16px">📅</div><div style="font-size:16px;font-weight:600">Sizga biriktirilgan guruh yo'q</div><div style="font-size:13px;margin-top:8px">Admin sizni guruhlarga biriktirishi kerak</div></div>`;
    return;
  }

  // Haftalik jadval qurilish
  const weekRows = DAY_KEYS.map((dayKey) => {
    const groupsOnDay = myGroups
      .filter((g) => (g.days || []).includes(dayKey))
      .sort((a, b) => (a.timeStart || "").localeCompare(b.timeStart || ""));
    if (!groupsOnDay.length) return "";
    const cells = groupsOnDay
      .map((g) => {
        const students = D.students.filter((s) => s.groupId === g.id);
        return `<div style="display:inline-flex;flex-direction:column;gap:4px;background:var(--accent-light);border:1.5px solid var(--accent);border-radius:var(--r-md);padding:8px 14px;min-width:160px">
        <div style="font-size:13px;font-weight:800;color:var(--text)">${g.name}</div>
        <div style="font-size:11px;color:var(--text2)">📚 ${g.course}</div>
        <div style="font-size:12px;font-weight:700;color:var(--accent)">⏰ ${g.timeStart || "—"} – ${g.timeEnd || "—"}</div>
        <div style="display:flex;gap:8px;align-items:center;font-size:11px;color:var(--text2)">
          <span>🚪 <b style="color:var(--teal-text)">${g.room || "—"}-${L === "ru" ? "кабинет" : L === "en" ? "room" : "xona"}</b></span>
          <span>👥 ${students.length} ta</span>
        </div>
      </div>`;
      })
      .join("");
    return `<tr>
      <td style="font-size:12px;font-weight:700;color:var(--text3);white-space:nowrap;padding:8px 14px 8px 0;vertical-align:top;border-right:2px solid var(--border2);width:90px">${DAY_FULL[dayKey]}</td>
      <td style="padding:8px 0 8px 14px"><div style="display:flex;flex-wrap:wrap;gap:8px">${cells}</div></td>
    </tr>`;
  })
    .filter(Boolean)
    .join("");

  // Sort groups by day order then time for card list
  const sorted = [...myGroups].sort((a, b) => {
    const da = Math.min(...(a.days || []).map((d) => DAY_ORDER[d] || 9));
    const db = Math.min(...(b.days || []).map((d) => DAY_ORDER[d] || 9));
    if (da !== db) return da - db;
    return (a.timeStart || "").localeCompare(b.timeStart || "");
  });

  let groupCards = sorted
    .map((g) => {
      const daysHtml = (g.days || [])
        .map(
          (d) =>
            `<span style="display:inline-flex;align-items:center;justify-content:center;padding:3px 12px;background:var(--accent-light);color:var(--accent-text);border-radius:20px;font-size:12px;font-weight:700;border:1px solid var(--accent)">${DAY_FULL[d] || d}</span>`,
        )
        .join("");
      const students = D.students.filter((s) => s.groupId === g.id);
      const activeStudents = students.filter(
        (s) => s.status === "Aktiv",
      ).length;
      const debtors = students.filter((s) => s.isDebtor).length;
      return `<div style="background:var(--bg);border:1.5px solid var(--border2);border-radius:var(--r-lg);padding:20px 22px;margin-bottom:16px;box-shadow:var(--shadow-sm)">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div>
          <div style="font-size:18px;font-weight:800;letter-spacing:-.4px;color:var(--text)">${g.name}</div>
          <div style="font-size:13px;color:var(--text2);margin-top:3px">📚 ${g.course}</div>
        </div>
        <span class="badge ${g.status === "Faol" ? "b-teal" : g.status === "Arxiv" ? "b-gray" : "b-orange"}">${g.status}</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin:14px 0 10px">
        ${daysHtml}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-top:10px">
        <div style="background:var(--bg2);border-radius:var(--r-md);padding:10px 14px;border:1px solid var(--border)">
          <div style="font-size:10px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.5px">⏰ Vaqt</div>
          <div style="font-size:16px;font-weight:800;color:var(--accent);margin-top:4px">${g.timeStart || "—"} – ${g.timeEnd || "—"}</div>
        </div>
        <div style="background:var(--bg2);border-radius:var(--r-md);padding:10px 14px;border:1px solid var(--border)">
          <div style="font-size:10px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.5px">🚪 Xona</div>
          <div style="font-size:22px;font-weight:800;color:var(--teal-text);margin-top:4px">${g.room || "—"}</div>
        </div>
        <div style="background:var(--bg2);border-radius:var(--r-md);padding:10px 14px;border:1px solid var(--border)">
          <div style="font-size:10px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.5px">🧑‍💻 Talabalar</div>
          <div style="font-size:22px;font-weight:800;color:var(--purple);margin-top:4px">${students.length} <span style="font-size:13px;font-weight:500;color:var(--text3)">ta</span></div>
          ${debtors > 0 ? `<div style="font-size:11px;color:var(--orange-text);margin-top:2px">💸 ${debtors} qarzdor</div>` : ""}
        </div>
        <div style="background:var(--bg2);border-radius:var(--r-md);padding:10px 14px;border:1px solid var(--border)">
          <div style="font-size:10px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.5px">📅 Boshlanish</div>
          <div style="font-size:13px;font-weight:700;color:var(--text);margin-top:4px">${fmtDate(g.startDate)}</div>
        </div>
      </div>
      <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" onclick="_attMonth=null;showGroupStudents(${g.id})" style="font-size:12px;padding:7px 14px">📋 Davomat qilish</button>
        <button class="btn btn-sm" onclick="showMentorGroupRating(${g.id})" style="font-size:12px;padding:7px 14px;background:var(--purple-light);color:var(--purple-text);border-color:rgba(124,58,237,.3)">🏆 Guruh reytingi</button>
        <button class="btn btn-sm" onclick="go('grades',document.getElementById('nav-grades-mentor'));setTimeout(()=>selectGradeGroup(${g.id}),150)" style="font-size:12px;padding:7px 14px;background:var(--amber-light);color:var(--amber-text);border-color:rgba(217,119,6,.3)">🏅 Baholash</button>
        <button class="btn btn-sm" onclick="go('tests',document.getElementById('nav-tests-mentor'));setTimeout(()=>filterTestsByGroup(${g.id}),150)" style="font-size:12px;padding:7px 14px;background:var(--teal-light);color:var(--teal-text);border-color:rgba(13,148,136,.3)">${L === "ru" ? "📝 Тесты" : L === "en" ? "📝 Tests" : "📝 Testlar"}</button>
      </div>
    </div>`;
    })
    .join("");

  wrap.innerHTML = `
    <div style="padding:0 0 20px">
      <div style="font-size:22px;font-weight:800;letter-spacing:-.5px;color:var(--text)">📅 Mening dars jadvalim</div>
      <div style="font-size:13px;color:var(--text2);margin-top:4px">Salom, <b>${mentorName}</b> — sizda <b>${myGroups.length}</b> ta guruh bor</div>
    </div>

    <!-- Haftalik jadval -->
    <div style="background:var(--bg);border:1.5px solid var(--border2);border-radius:var(--r-lg);padding:18px 20px;margin-bottom:24px;box-shadow:var(--shadow-sm)">
      <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:14px">📆 Haftalik jadval</div>
      <table style="width:100%;border-collapse:collapse">
        <tbody>${weekRows}</tbody>
      </table>
    </div>

    <!-- Guruh kartochkalari -->
    <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:14px">🗂 Guruhlar tafsiloti</div>
    ${groupCards}`;
}

// FIX #1: Also apply logo/name on login screen before login
(function () {
  loadUI();
  applyLogo();
  // Update login screen name
  const loginName = document.getElementById("login-crm-name");
  if (loginName) loginName.textContent = _brandSettings.crmName || "EduManage";
  // Login hint
  const hint = document.querySelector(".login-hint");
  if (hint) hint.textContent = "";
})();

// FIX: Boot tartibi — barcha skriptlar yuklangach loader chaqiradi.
// Aks holda mentor/talaba uchun render funksiyalari hali aniqlanmagan bo'ladi,
// natijada panel bo'sh chiqadi va admin nav tugmalari yashirilmaydi.
window.__crmBoot = function () {
  // ⚠️ XAVFSIZLIK: ilgari bu yerda faqat localStorage tekshirilardi — ya'ni
  // brauzerda `edumanage_auth_v10` ni qo'lda yozib, panelni ochib olish mumkin
  // edi. Endi sessiya SERVERDAN tiklanadi (httpOnly cookie orqali): server
  // tasdiqlamasa panel ochilmaydi va API baribir hech narsa bermaydi.
  const showLogin = () => {
    document.getElementById("login-screen").style.display = "flex";
    document.getElementById("crm-app").style.display = "none";
    setTimeout(() => {
      const u = document.getElementById("login-user");
      if (u) u.focus();
    }, 100);
  };

  if (window.CRMAuth && typeof window.CRMAuth.onExpired === "function") {
    window.CRMAuth.onExpired(function () {
      try { showLogin(); } catch (e) {}
    });
  }

  if (!window.CRMAuth) {
    console.error("[CRM Boot] secure-auth.js yuklanmagan — kirish bloklandi");
    return showLogin();
  }

  window.CRMAuth.restore()
    .then((user) => {
      if (!user) return showLogin();
      if (user.mustChangePassword && typeof promptPasswordChange === "function")
        return promptPasswordChange();
      // Sessiya tayyor — endi CRM ma'lumotini serverdan yuklaymiz.
      // (Ilgari bu login qilinmasdan oldin bajarilardi.)
      if (typeof window.__CRM_HYDRATE__ === "function") window.__CRM_HYDRATE__();
      showApp();
    })
    .catch(() => showLogin());
};

window.__crmBootLegacy = function () {
  try {
    if (checkAuth()) {
      showApp();
    } else {
      document.getElementById("login-screen").style.display = "flex";
      document.getElementById("crm-app").style.display = "none";
      setTimeout(() => {
        const u = document.getElementById("login-user");
        if (u) u.focus();
      }, 100);
    }
  } catch (e) {
    console.error("[CRM Boot]", e);
  }
};
