// ===================== GRADING SYSTEM =====================
let _gradesGroupId = null;
let _gradesEditCritId = null;
// 2. Mentor Panel > Baholash — butunlay qayta ishlab chiqilgan, sodda tizim.
// 'simple': har talaba uchun alohida baho yozuvlari (tarix + izoh) — YANGI, standart rejim.
// 'criteria': eski og'irlikli mezon tizimi — mentor ilgari sozlagan bo'lsa, yo'qolib ketmasin
// deb "Kengaytirilgan" rejim sifatida saqlab qolindi.
let _gradesMode = 'simple';
let _simpleGradesGroupFilter = '';
let _simpleGradesSearch = '';

function renderGradesPanel() {
  const wrap = document.getElementById('grades-wrap');
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="grades-mode-switch">
      <button class="grades-mode-btn ${_gradesMode==='simple'?'active':''}" onclick="_gradesMode='simple';renderGradesPanel()">📊 ${t('simple_grading')}</button>
      <button class="grades-mode-btn ${_gradesMode==='criteria'?'active':''}" onclick="_gradesMode='criteria';renderGradesPanel()">⚙️ ${t('criteria_grading')}</button>
    </div>
    <div id="grades-subwrap"></div>`;
  if (_gradesMode === 'criteria') renderGradesPanelCriteria();
  else renderSimpleGradesTable();
}

// ---- Rang kodlash: 86-100 yashil, 71-85 ko'k, 56-70 sariq, 0-55 qizil ----
function _gradePill(score) {
  if (score === null || score === undefined) return `<span class="grade-pill grade-pill-empty">—</span>`;
  let cls = 'grade-pill-red';
  if (score >= 86) cls = 'grade-pill-green';
  else if (score >= 71) cls = 'grade-pill-blue';
  else if (score >= 56) cls = 'grade-pill-yellow';
  return `<span class="grade-pill ${cls}">${score}</span>`;
}
function calcStudentSimpleGradeStats(studentId) {
  const arr = (D.simpleGrades && D.simpleGrades[studentId]) || [];
  if (!arr.length) return { last: null, avg: null, count: 0 };
  const sorted = arr.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  const last = sorted[0].score;
  const avg = Math.round(arr.reduce((s, g) => s + g.score, 0) / arr.length);
  return { last, avg, count: arr.length };
}

function renderSimpleGradesTable() {
  const sub = document.getElementById('grades-subwrap');
  if (!sub) return;
  const isMentor = isMentorRole();
  const cu = getCurrentUser();
  let accessGroups = D.groups;
  if (isMentor) {
    const mName = cu.mentorName || cu.name;
    accessGroups = D.groups.filter(g => g.mentor === mName);
  }
  if (!accessGroups.length) {
    sub.innerHTML = `<div class="empty"><div class="empty-ic">🏅</div><div class="empty-txt">${t('no_groups_found')}</div></div>`;
    return;
  }
  const groupIds = accessGroups.map(g => g.id);
  let students = D.students.filter(s => groupIds.includes(s.groupId) && s.status !== 'Arxiv');
  if (_simpleGradesGroupFilter) students = students.filter(s => String(s.groupId) === String(_simpleGradesGroupFilter));
  if (_simpleGradesSearch) {
    const q = _simpleGradesSearch.toLowerCase();
    students = students.filter(s => s.name.toLowerCase().includes(q));
  }
  students = students.slice().sort((a, b) => a.name.localeCompare(b.name));
  const groupOptHtml = `<option value="">${t('all_groups_opt')}</option>` + accessGroups.map(g => `<option value="${g.id}" ${String(_simpleGradesGroupFilter) === String(g.id) ? 'selected' : ''}>${g.name}</option>`).join('');

  const rows = students.map((s, i) => {
    const stats = calcStudentSimpleGradeStats(s.id);
    const grp = D.groups.find(g => g.id === s.groupId);
    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:10px 12px;cursor:pointer" onclick="openGradeHistory(${s.id})"><div style="display:flex;align-items:center;gap:8px"><div class="av ${AV_CLS[i % 5]}" style="width:30px;height:30px;font-size:11px;flex-shrink:0">${ini(s.name)}</div><span style="font-weight:600;font-size:13px">${s.name}</span></div></td>
      <td style="padding:10px 12px;font-size:12px;color:var(--text2)">${grp ? grp.name : '—'}</td>
      <td style="padding:10px 12px;text-align:center">${_gradePill(stats.last)}</td>
      <td style="padding:10px 12px;text-align:center">${_gradePill(stats.avg)}</td>
      <td style="padding:10px 12px;text-align:right;white-space:nowrap">
        <button class="btn btn-sm btn-primary" onclick="openAddGradeModal(${s.id})">➕ ${t('add_grade_btn')}</button>
        <button class="btn btn-sm" onclick="openGradeHistory(${s.id})">🕐 ${t('history_btn')}${stats.count ? ` (${stats.count})` : ''}</button>
      </td>
    </tr>`;
  }).join('');

  sub.innerHTML = `
    <div class="grade-top-row">
      <div class="fg" style="flex:0 0 220px"><label style="font-size:12px;font-weight:700;color:var(--text2)">👥 ${t('group_label')}</label><select onchange="_simpleGradesGroupFilter=this.value;renderSimpleGradesTable()">${groupOptHtml}</select></div>
      <div class="fg" style="flex:1;min-width:160px"><label style="font-size:12px;font-weight:700;color:var(--text2)">🔍 ${t('search_label')}</label><input id="grades-search-inp" value="${_simpleGradesSearch}" placeholder="${t('search_student_ph')}" oninput="_simpleGradesSearch=this.value;_rerenderPreservingFocus(renderSimpleGradesTable)"></div>
    </div>
    <div class="grade-color-legend">
      <span class="gcl-item"><i style="background:var(--teal)"></i>86–100</span>
      <span class="gcl-item"><i style="background:var(--accent)"></i>71–85</span>
      <span class="gcl-item"><i style="background:var(--amber)"></i>56–70</span>
      <span class="gcl-item"><i style="background:var(--orange)"></i>0–55</span>
    </div>
    ${!students.length ? `<div class="empty"><div class="empty-ic">🧑‍💻</div><div class="empty-txt">${t('no_students_found')}</div></div>` : `
    <div style="overflow-x:auto;margin-top:8px">
      <table style="width:100%;border-collapse:collapse;background:var(--bg2);border-radius:var(--r-lg);overflow:hidden;box-shadow:var(--shadow-sm)">
        <thead><tr>
          <th style="padding:10px 12px;text-align:left;font-size:12px;background:var(--bg3);color:var(--text2);font-weight:700;border-bottom:2px solid var(--border2)">${t('col_student')}</th>
          <th style="padding:10px 12px;text-align:left;font-size:12px;background:var(--bg3);color:var(--text2);font-weight:700;border-bottom:2px solid var(--border2)">${t('col_group')}</th>
          <th style="padding:10px 12px;text-align:center;font-size:12px;background:var(--bg3);color:var(--text2);font-weight:700;border-bottom:2px solid var(--border2)">${t('col_last_grade')}</th>
          <th style="padding:10px 12px;text-align:center;font-size:12px;background:var(--bg3);color:var(--text2);font-weight:700;border-bottom:2px solid var(--border2)">${t('col_avg_grade')}</th>
          <th style="padding:10px 12px;text-align:right;font-size:12px;background:var(--bg3);color:var(--text2);font-weight:700;border-bottom:2px solid var(--border2)">${t('col_actions')}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`}`;
}

function openAddGradeModal(studentId) {
  const s = D.students.find(x => x.id === studentId);
  if (!s) return;
  const old = document.getElementById('grade-modal-overlay');
  if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'grade-modal-overlay';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(2px)';
  div.innerHTML = `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r-lg);max-width:380px;width:100%;padding:22px;box-shadow:0 20px 50px rgba(0,0,0,.35)">
    <div style="font-weight:700;font-size:16px;margin-bottom:2px">🏅 ${t('new_grade_title')}</div>
    <div style="font-size:13px;color:var(--text3);margin-bottom:16px">${s.name}</div>
    <div class="fg" style="margin-bottom:12px"><label>${t('score_label')} (0–100) <span class="req">*</span></label><input type="number" id="ng-score" min="0" max="100" placeholder="85" style="font-size:20px;font-weight:800;text-align:center"></div>
    <div class="fg" style="margin-bottom:16px"><label>💬 ${t('comment_label')}</label><textarea id="ng-comment" rows="3" placeholder="${t('comment_ph')}"></textarea></div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-sm" style="flex:1;justify-content:center" onclick="document.getElementById('grade-modal-overlay').remove()">${t('cancel')}</button>
      <button class="btn btn-sm btn-primary" style="flex:1;justify-content:center" onclick="saveSimpleGrade(${studentId})">💾 ${t('save')}</button>
    </div>
  </div>`;
  document.body.appendChild(div);
  setTimeout(() => document.getElementById('ng-score')?.focus(), 80);
}
function saveSimpleGrade(studentId) {
  const scoreEl = document.getElementById('ng-score');
  const score = parseInt(scoreEl.value);
  if (isNaN(score) || score < 0 || score > 100) {
    toast('⚠️ ' + t('score_range_error'));
    scoreEl.focus();
    return;
  }
  const comment = (document.getElementById('ng-comment').value || '').trim();
  if (!D.simpleGrades) D.simpleGrades = {};
  if (!D.simpleGrades[studentId]) D.simpleGrades[studentId] = [];
  const cu = getCurrentUser();
  D.simpleGrades[studentId].push({
    id: 'g' + Date.now() + Math.random().toString(36).slice(2, 6),
    score, comment,
    date: new Date().toISOString(),
    mentorName: cu.mentorName || cu.name || '',
  });
  saveData();
  document.getElementById('grade-modal-overlay')?.remove();
  toast('✅ ' + t('grade_saved_msg'));
  renderSimpleGradesTable();
}
function openGradeHistory(studentId) {
  const s = D.students.find(x => x.id === studentId);
  if (!s) return;
  const arr = ((D.simpleGrades && D.simpleGrades[studentId]) || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  const old = document.getElementById('grade-modal-overlay');
  if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'grade-modal-overlay';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(2px)';
  const rowsHtml = arr.length ? arr.map(g => `<div class="grade-hist-item">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        ${_gradePill(g.score)}
        <span style="font-size:11px;color:var(--text3);flex:1">${fmtDateTime(g.date)}</span>
        <button class="btn btn-sm btn-del-outline" style="padding:2px 8px;font-size:11px" onclick="deleteSimpleGrade(${studentId},'${g.id}')">🗑</button>
      </div>
      ${g.comment ? `<div style="font-size:12.5px;color:var(--text2);margin-top:6px">💬 ${g.comment}</div>` : ''}
    </div>`).join('') : `<div style="color:var(--text3);font-size:13px;padding:16px 0;text-align:center">${t('no_grades_yet')}</div>`;
  div.innerHTML = `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r-lg);max-width:400px;width:100%;max-height:80vh;overflow-y:auto;padding:22px;box-shadow:0 20px 50px rgba(0,0,0,.35)">
    <div style="font-weight:700;font-size:16px;margin-bottom:2px">🕐 ${t('grade_history_title')}</div>
    <div style="font-size:13px;color:var(--text3);margin-bottom:16px">${s.name}</div>
    <div style="display:flex;flex-direction:column;gap:8px">${rowsHtml}</div>
    <button class="btn btn-sm" style="width:100%;justify-content:center;margin-top:16px" onclick="document.getElementById('grade-modal-overlay').remove()">${t('close')}</button>
  </div>`;
  document.body.appendChild(div);
}
async function deleteSimpleGrade(studentId, gradeId) {
  if (!(await crmConfirm(t('confirm_delete_grade'), { danger: true }))) return;
  if (D.simpleGrades && D.simpleGrades[studentId]) {
    D.simpleGrades[studentId] = D.simpleGrades[studentId].filter(g => g.id !== gradeId);
    saveData();
    toast('🗑 ' + t('grade_deleted_msg'));
    openGradeHistory(studentId);
    renderSimpleGradesTable();
  }
}

// ---- Eski (mezon/og'irlik asosidagi) tizim — "Kengaytirilgan" rejim sifatida saqlanmoqda ----
function renderGradesPanelCriteria() {
  const wrap = document.getElementById('grades-subwrap');
  if (!wrap) return;
  const isMentor = isMentorRole();
  const cu = getCurrentUser();
  let accessGroups = D.groups;
  if (isMentor) {
    const mName = cu.mentorName || cu.name;
    accessGroups = D.groups.filter(g => g.mentor === mName);
  }
  if (!accessGroups.length) {
    wrap.innerHTML = `<div class="empty"><div class="empty-ic">🏅</div><div class="empty-txt">Guruh topilmadi</div></div>`;
    return;
  }
  const selGroupId = _gradesGroupId || accessGroups[0].id;
  const groupOptHtml = accessGroups.map(g => `<option value="${g.id}" ${g.id===selGroupId?'selected':''}>${g.name} — ${g.course}</option>`).join('');
  const selGroup = D.groups.find(x => x.id === selGroupId);
  if (selGroup) _gradesGroupId = selGroup.id;
  const criteriaArr = (D.gradingCriteria && D.gradingCriteria[selGroupId]) || [];
  const students = D.students.filter(s => s.groupId === selGroupId && s.status !== 'Arxiv');

  // Criteria table
  let critHtml = '';
  if (criteriaArr.length) {
    critHtml = `<div class="grade-crit-list">${criteriaArr.map(c => {
      const warnColor = c.weight > 100 ? 'var(--orange-text)' : 'var(--teal-text)';
      return `<div class="grade-crit-item">
        <div class="grade-crit-name">${c.name}</div>
        <div class="grade-crit-meta">Max: <b>${c.maxScore}</b> ball &nbsp;·&nbsp; Og\'irlik: <b style="color:${warnColor}">${c.weight}%</b></div>
        <div class="grade-crit-actions">
          <button class="btn btn-sm" onclick="openEditCriteria(${selGroupId},'${c.id}')">✏️</button>
          <button class="btn btn-sm btn-del-outline" onclick="deleteCriteria(${selGroupId},'${c.id}')">🗑</button>
        </div>
      </div>`;
    }).join('')}</div>`;
    const totalWeight = criteriaArr.reduce((s,c) => s+c.weight, 0);
    const weightStatus = totalWeight === 100 ? `<span style="color:var(--teal-text);font-weight:700">✅ Jami: ${totalWeight}%</span>` : `<span style="color:var(--orange-text);font-weight:700">⚠️ ${L==='ru'?'Итого':L==='en'?'Total':'Jami'}: ${totalWeight}% ${L==='ru'?'(должно быть 100%)':L==='en'?'(must be 100%)':"(100% bo'lishi kerak)"}</span>`;
    critHtml = `<div class="grade-weight-status">${weightStatus}</div>` + critHtml;
  } else {
    critHtml = `<div style="color:var(--text3);font-size:13px;padding:12px 0">${L==='ru'?'Критерии не добавлены':L==='en'?'No criteria added yet':'Hali mezon qo\'shilmagan'}</div>`;
  }

  // Add criteria form
  const editC = _gradesEditCritId ? criteriaArr.find(x=>x.id===_gradesEditCritId) : null;
  const critFormHtml = `<div class="grade-add-crit-form">
    <div class="form-row">
      <div class="fg"><label>${L==='ru'?'Mezon nomi':L==='en'?'Criterion':'Mezon nomi'}</label><input id="gc-name" value="${editC?editC.name:''}" placeholder="Uy vazifasi / Imtihon / Faollik..."></div>
      <div class="fg"><label>${L==='ru'?'Макс балл':L==='en'?'Max score':'Max ball'}</label><input type="number" id="gc-max" value="${editC?editC.maxScore:100}" min="1" max="1000" style="width:90px"></div>
      <div class="fg"><label>${L==='ru'?'Вес (%)':L==='en'?'Weight (%)':'Og\'irlik (%)'}</label><input type="number" id="gc-weight" value="${editC?editC.weight:30}" min="1" max="100" style="width:90px"></div>
    </div>
    <button class="btn btn-primary btn-sm" onclick="saveCriteria(${selGroupId})">${editC?L==='ru'?'✅ Обновить':L==='en'?'✅ Update':'✅ Yangilash':L==='ru'?'➕ Добавить критерий':L==='en'?'➕ Add Criterion':'➕ Mezon qo\'shish'}</button>
    ${editC?`<button class="btn btn-sm" onclick="_gradesEditCritId=null;renderGradesPanel()" style="margin-left:8px">${L==='ru'?'Отмена':L==='en'?'Cancel':'Bekor'}</button>`:''}
  </div>`;

  // Student grades table
  let gradeTableHtml = '';
  if (criteriaArr.length && students.length) {
    const headerCols = criteriaArr.map(c => `<th style="white-space:nowrap;font-size:12px;padding:8px 12px;background:var(--bg3);color:var(--text2);font-weight:700">${c.name}<br><span style="font-size:10px;font-weight:500;color:var(--text3)">max ${c.maxScore}</span></th>`).join('');
    const gradeRows = students.map((s,i) => {
      const sg = (D.grades[selGroupId] && D.grades[selGroupId][s.id]) || {};
      const cellsHtml = criteriaArr.map(c => {
        const val = sg[c.id] !== undefined ? sg[c.id] : '';
        return `<td style="padding:4px 6px;text-align:center"><input type="number" class="grade-input" value="${val}" min="0" max="${c.maxScore}" placeholder="—" onchange="saveStudentGrade(${selGroupId},${s.id},'${c.id}',this.value,${c.maxScore})" style="width:60px;text-align:center;padding:5px;border:1px solid var(--border2);border-radius:6px;background:var(--bg2);color:var(--text);font-size:13px;font-weight:600"></td>`;
      }).join('');
      const totalData = calcStudentWeightedScore(s.id, selGroupId);
      const scoreColor = totalData.score >= 85 ? 'var(--teal-text)' : totalData.score >= 70 ? 'var(--accent-text)' : totalData.score >= 55 ? 'var(--amber-text)' : 'var(--orange-text)';
      const letter = getGradeLetter(totalData.score);
      return `<tr style="border-bottom:1px solid var(--border)" data-grade-student="${s.id}">
        <td style="padding:8px 12px;font-weight:600;font-size:13px;white-space:nowrap">
          <div style="display:flex;align-items:center;gap:8px">
            <div class="av ${AV_CLS[i%5]}" style="width:28px;height:28px;font-size:10px;flex-shrink:0">${ini(s.name)}</div>
            <div>
              <div style="font-size:12px;color:var(--text)">${s.firstName||s.name.split(' ')[0]} <b>${s.lastName||s.name.split(' ').slice(1).join(' ')}</b></div>
              <div style="font-size:10px;color:var(--text3)">${groupLabel(s.groupId)}</div>
            </div>
          </div>
        </td>
        ${cellsHtml}
        <td style="padding:8px 12px;text-align:center;font-weight:800;font-size:15px" class="grade-total-score" style="color:${scoreColor}">${totalData.filled?totalData.score+'%':'-'}</td>
        <td style="padding:8px 12px;text-align:center" class="grade-letter-cell"><span class="grade-letter-badge grade-${letter.toLowerCase()}">${letter}</span></td>
      </tr>`;
    }).join('');

    gradeTableHtml = `<div style="overflow-x:auto;margin-top:20px">
      <table style="width:100%;border-collapse:collapse;background:var(--bg2);border-radius:var(--r-lg);overflow:hidden;box-shadow:var(--shadow-sm)">
        <thead>
          <tr>
            <th style="padding:10px 12px;text-align:left;font-size:12px;background:var(--bg3);color:var(--text2);font-weight:700;border-bottom:2px solid var(--border2)">${L==='ru'?'Студент':L==='en'?'Student':'Talaba'}</th>
            ${headerCols}
            <th style="padding:10px 12px;font-size:12px;background:var(--bg3);color:var(--text2);font-weight:700;text-align:center;border-bottom:2px solid var(--border2)">Umumiy</th>
            <th style="padding:10px 12px;font-size:12px;background:var(--bg3);color:var(--text2);font-weight:700;text-align:center;border-bottom:2px solid var(--border2)">Baho</th>
          </tr>
        </thead>
        <tbody>${gradeRows}</tbody>
      </table>
    </div>`;
  } else if (!criteriaArr.length) {
    gradeTableHtml = '';
  } else {
    gradeTableHtml = `<div class="empty" style="margin-top:16px"><div class="empty-ic">🧑‍💻</div><div class="empty-txt">Bu guruhda talaba yo'q</div></div>`;
  }

  wrap.innerHTML = `
    <div class="grade-panel-wrap">
      <div class="grade-top-row">
        <div class="fg" style="flex:0 0 300px">
          <label style="font-size:12px;font-weight:700;color:var(--text2)">👥 Guruh tanlang</label>
          <select onchange="_gradesGroupId=parseInt(this.value);_gradesEditCritId=null;renderGradesPanel()" style="width:100%">${groupOptHtml}</select>
        </div>
        <div style="flex:1"></div>
        <button class="btn btn-sm" onclick="exportGrades(${selGroupId})" style="background:var(--teal-light);color:var(--teal-text);border-color:rgba(13,148,136,.3)">📥 CSV yuklash</button>
      </div>

      <div class="grade-section">
        <div class="grade-section-title">⚙️ Baholash mezonlari — ${selGroup?selGroup.name:''}</div>
        <div style="font-size:12px;color:var(--text3);margin-bottom:14px">Har bir guruh uchun alohida mezonlar belgilanadi. Og'irliklar yig'indisi 100% bo'lishi kerak.</div>
        ${critHtml}
        <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:16px">
          <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:12px">${editC?'✏️ Mezonni tahrirlash':'➕ Yangi mezon qo\'shish'}</div>
          ${critFormHtml}
        </div>
      </div>

      ${criteriaArr.length ? `<div class="grade-section">
        <div class="grade-section-title">📊 Talabalar baholari — ${selGroup?selGroup.name:''}</div>
        <div style="font-size:12px;color:var(--text3);margin-bottom:8px">Ball kiriting · Umumiy og'irlik bo'yicha hisoblash avtomatik</div>
        ${gradeTableHtml}
      </div>` : ''}
    </div>`;
}

function selectGradeGroup(groupId) {
  _gradesGroupId = groupId;
  _gradesEditCritId = null;
  renderGradesPanel();
}

function saveCriteria(groupId) {
  const name = (document.getElementById('gc-name').value || '').trim();
  const maxScore = parseInt(document.getElementById('gc-max').value) || 100;
  const weight = parseInt(document.getElementById('gc-weight').value) || 0;
  if (!name) { toast('⚠️ Mezon nomini kiriting!'); return; }
  if (weight < 1 || weight > 100) { toast('⚠️ Og\'irlik 1—100 orasida!'); return; }
  if (!D.gradingCriteria[groupId]) D.gradingCriteria[groupId] = [];
  if (_gradesEditCritId) {
    const c = D.gradingCriteria[groupId].find(x => x.id === _gradesEditCritId);
    if (c) { c.name = name; c.maxScore = maxScore; c.weight = weight; }
    _gradesEditCritId = null;
    toast('✅ Mezon yangilandi!');
  } else {
    const newId = 'c_' + Date.now();
    D.gradingCriteria[groupId].push({ id: newId, name, maxScore, weight });
    toast('✅ Mezon qo\'shildi!');
  }
  saveData();
  renderGradesPanel();
}

function openEditCriteria(groupId, critId) {
  _gradesEditCritId = critId;
  _gradesGroupId = groupId;
  renderGradesPanel();
  setTimeout(() => {
    const el = document.getElementById('gc-name');
    if (el) el.focus();
  }, 100);
}

async function deleteCriteria(groupId, critId) {
  if (!(await crmConfirm('Bu mezon o\'chirilsinmi? Unga tegishli barcha baholar ham o\'chadi!', { danger: true })))
    return;
  if (D.gradingCriteria[groupId]) {
    D.gradingCriteria[groupId] = D.gradingCriteria[groupId].filter(x => x.id !== critId);
  }
  if (D.grades[groupId]) {
    Object.values(D.grades[groupId]).forEach(sg => { delete sg[critId]; });
  }
  saveData();
  toast('🗑 Mezon o\'chirildi');
  renderGradesPanel();
}

function saveStudentGrade(groupId, studentId, criteriaId, val, maxScore) {
  const score = Math.min(maxScore, Math.max(0, parseFloat(val) || 0));
  if (!D.grades[groupId]) D.grades[groupId] = {};
  if (!D.grades[groupId][studentId]) D.grades[groupId][studentId] = {};
  if (val === '' || val === null || val === undefined) {
    delete D.grades[groupId][studentId][criteriaId];
  } else {
    D.grades[groupId][studentId][criteriaId] = score;
  }
  saveData();
  // Update this student's total score & letter badge inline (no full re-render)
  const total = calcStudentWeightedScore(studentId, groupId);
  const letter = getGradeLetter(total.score);
  const scoreColor = total.score >= 85 ? 'var(--teal-text)' : total.score >= 70 ? 'var(--accent-text)' : total.score >= 55 ? 'var(--amber-text)' : 'var(--orange-text)';
  // Find all rows and update the matching student row
  document.querySelectorAll('[data-grade-student]').forEach(row => {
    if (parseInt(row.dataset.gradeStudent) === studentId) {
      const scoreCell = row.querySelector('.grade-total-score');
      const letterCell = row.querySelector('.grade-letter-cell');
      if (scoreCell) { scoreCell.textContent = total.filled ? total.score+'%' : '-'; scoreCell.style.color = scoreColor; }
      if (letterCell) {
        letterCell.innerHTML = `<span class="grade-letter-badge grade-${letter.toLowerCase()}">${letter}</span>`;
      }
    }
  });
}

function calcStudentWeightedScore(studentId, groupId) {
  const criteriaArr = (D.gradingCriteria && D.gradingCriteria[groupId]) || [];
  const maxScore = criteriaArr.reduce((s,c) => s + (c.maxScore||0), 0);
  if (!criteriaArr.length) return { score: 0, maxScore: 0, letter: '—', filled: false };
  const sg = (D.grades[groupId] && D.grades[groupId][studentId]) || {};
  let totalWeight = 0, weightedSum = 0, hasAny = false;
  let rawScore = 0;
  criteriaArr.forEach(c => {
    if (sg[c.id] !== undefined) {
      const pct = Math.min(100, (sg[c.id] / c.maxScore) * 100);
      weightedSum += pct * c.weight;
      totalWeight += c.weight;
      rawScore += sg[c.id];
      hasAny = true;
    }
  });
  if (!hasAny || totalWeight === 0) return { score: 0, maxScore, letter: '—', filled: false };
  const score = Math.round(weightedSum / totalWeight);
  return { score, maxScore, rawScore, letter: getGradeLetter(score), filled: true };
}

function getGradeLetter(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 55) return 'D';
  return 'F';
}

function exportGrades(groupId) {
  const group = D.groups.find(x => x.id === groupId);
  const criteriaArr = (D.gradingCriteria && D.gradingCriteria[groupId]) || [];
  const students = D.students.filter(s => s.groupId === groupId);
  let csv = 'Ism,Familiya,Telefon,' + criteriaArr.map(c => c.name).join(',') + ',Umumiy (%),Baho\n';
  students.forEach(s => {
    const sg = (D.grades[groupId] && D.grades[groupId][s.id]) || {};
    const scores = criteriaArr.map(c => sg[c.id] !== undefined ? sg[c.id] : '').join(',');
    const total = calcStudentWeightedScore(s.id, groupId);
    csv += `${s.firstName||''},${s.lastName||''},${s.phone||''},${scores},${total.filled?total.score:''},${total.filled?getGradeLetter(total.score):''}\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (group ? group.name : 'group') + '_baholar.csv';
  a.click();
  toast('📥 CSV yuklandi!');
}

// ===================== TEST SYSTEM =====================
let _testsPanelGroupFilter = null;
let _activeTestId = null;
let _testTimer = null;
let _testAnswers = {};
let _testTimeLeft = 0;
let _editTestId = null;
let _testQuestions = [];

function renderTestsPanel() {
  const wrap = document.getElementById('tests-wrap');
  if (!wrap) return;
  const L=LANG;
  const isMentor = isMentorRole();
  const cu = getCurrentUser();

  let accessGroups = D.groups;
  if (isMentor) {
    const mName = cu.mentorName || cu.name;
    accessGroups = D.groups.filter(g => g.mentor === mName);
  }

  const gFilterVal = _testsPanelGroupFilter || '';
  const groupFilterOpts = `<option value="">Barcha guruhlar</option>` + accessGroups.map(g => `<option value="${g.id}" ${gFilterVal==g.id?'selected':''}>${g.name} — ${g.course}</option>`).join('');

  const visibleTests = D.tests.filter(t => {
    if (gFilterVal && t.groupId && String(t.groupId) !== String(gFilterVal)) return false;
    if (isMentor) {
      const mName = cu.mentorName || cu.name;
      const accessGroupIds = D.groups.filter(g => g.mentor === mName).map(g => g.id);
      if (t.groupId && !accessGroupIds.includes(t.groupId)) return false;
    }
    return true;
  });

  const testsListHtml = visibleTests.length ? visibleTests.map(t => {
    const grp = t.groupId ? D.groups.find(g => g.id === t.groupId) : null;
    const qCount = (t.questions || []).length;
    const resultCount = D.testResults[t.id] ? Object.keys(D.testResults[t.id]).length : 0;
    return `<div class="test-card">
      <div class="test-card-top">
        <div>
          <div class="test-card-title">${t.title}</div>
          <div class="test-card-meta">
            <span class="badge b-blue">👥 ${grp ? grp.name : L==='ru'?'Все группы':L==='en'?'All groups':'Barcha guruhlar'}</span>
            <span class="badge b-purple">❓ ${qCount} ${L==='ru'?'вопросов':L==='en'?'questions':'ta savol'}</span>
            <span class="badge b-amber">⏱ ${t.timeLimit || 30} daqiqa</span>
            <span class="badge b-teal">📊 ${resultCount} ${L==='ru'?'результатов':L==='en'?'results':'ta natija'}</span>
            ${t.pdfName ? `<span class="badge b-gray" style="cursor:pointer" onclick="downloadTestPdf(${t.id})">📎 PDF</span>` : ''}
          </div>
        </div>
        <div class="test-card-actions">
          <button class="btn btn-sm" onclick="openTestResults(${t.id})">📊 Natijalar</button>
          <button class="btn btn-sm" onclick="openEditTest(${t.id})">✏️ Tahrirlash</button>
          <button class="btn btn-sm btn-del-outline" onclick="deleteTest(${t.id})">🗑</button>
        </div>
      </div>
    </div>`;
  }).join('') : `<div class="empty"><div class="empty-ic">📝</div><div class="empty-txt">${L==='ru'?'Тестов ещё нет':L==='en'?'No tests yet':"Hali test yo'q"}</div></div>`;

  wrap.innerHTML = `
    <div class="tests-panel-wrap">
      <div class="tests-top-bar">
        <select class="fsel" onchange="_testsPanelGroupFilter=this.value?parseInt(this.value)||this.value:null;renderTestsPanel()" style="min-width:220px">${groupFilterOpts}</select>
        <button class="btn btn-primary" onclick="openCreateTestModal()">${L==='ru'?'➕ Создать тест':L==='en'?'➕ Create test':L==='ru'?'➕ Создать тест':L==='en'?'➕ Create test':'➕ Yangi test yaratish'}</button>
      </div>
      <div class="tests-list">${testsListHtml}</div>
    </div>
    <div id="test-modal-overlay" class="overlay" onclick="if(event.target===this)closeTestModal()">
      <div class="modal" id="test-modal" style="max-width:700px;max-height:90vh;overflow-y:auto">
        <div class="modal-head"><div class="modal-title" id="test-modal-title">Yangi test</div><button class="m-close" onclick="closeTestModal()">✕</button></div>
        <div class="modal-body" id="test-modal-body"></div>
        <div class="modal-foot"><button class="btn" onclick="closeTestModal()">${L==='ru'?'Отмена':L==='en'?'Cancel':'Bekor'}</button><button class="btn btn-primary" onclick="saveTest()">${L==='ru'?'💾 Сохранить':L==='en'?'💾 Save':'💾 Saqlash'}</button></div>
      </div>
    </div>
    <div id="test-results-overlay" class="overlay" onclick="if(event.target===this)closeTestResultsModal()">
      <div class="modal" style="max-width:700px;max-height:90vh;overflow-y:auto">
        <div class="modal-head"><div class="modal-title" id="test-results-title">Test natijalari</div><button class="m-close" onclick="closeTestResultsModal()">✕</button></div>
        <div class="modal-body" id="test-results-body"></div>
        <div class="modal-foot"><button class="btn" onclick="closeTestResultsModal()">${L==='ru'?'Закрыть':L==='en'?'Close':'Yopish'}</button></div>
      </div>
    </div>`;
}

function filterTestsByGroup(groupId) {
  _testsPanelGroupFilter = groupId;
  renderTestsPanel();
}

function openCreateTestModal() {
  _editTestId = null;
  _testQuestions = [];
  _testPdfData = null; _testPdfName = null; _testPdfRemoved = false;
  renderTestFormModal({});
}

function openEditTest(id) {
  _editTestId = id;
  const t = D.tests.find(x => x.id === id);
  if (!t) return;
  _testQuestions = JSON.parse(JSON.stringify(t.questions || []));
  _testPdfData = null; _testPdfName = null; _testPdfRemoved = false;
  renderTestFormModal(t);
}

function renderTestFormModal(t) {
  const isMentor = isMentorRole();
  const cu = getCurrentUser();
  let availableGroups = D.groups;
  if (isMentor) {
    const mName = cu.mentorName || cu.name;
    availableGroups = D.groups.filter(g => g.mentor === mName);
  }
  const groupOpts = (!isMentor ? `<option value="">Barcha guruhlar</option>` : '') + availableGroups.map(g => `<option value="${g.id}" ${t.groupId==g.id?'selected':''}>${g.name} — ${g.course}</option>`).join('');
  const qHtml = _testQuestions.map((q, qi) => renderQuestionEdit(q, qi)).join('');
  document.getElementById('test-modal-title').textContent = _editTestId ? (LANG==='ru'?'✏️ Редактировать тест':LANG==='en'?'✏️ Edit test':'✏️ Testni tahrirlash') : (LANG==='ru'?'➕ Создать тест':LANG==='en'?'➕ Create test':'➕ Yangi test yaratish')
  document.getElementById('test-modal-body').innerHTML = `
    <div class="modal-section-label">📋 Test ma'lumoti</div>
    <div class="fg"><label>${L==='ru'?'Название теста':L==='en'?'Test title':'Test nomi'} <span class="req">*</span></label><input id="tf-title" value="${t.title||''}" placeholder="JavaScript asoslari testi"></div>
    <div class="form-row">
      <div class="fg"><label>${L==='ru'?'Группа':L==='en'?'Group':'Guruh'}</label><select id="tf-group">${groupOpts}</select></div>
      <div class="fg"><label>${L==='ru'?'⏱ Время (мин.)':L==='en'?'⏱ Time (min.)':'⏱ Vaqt (daqiqa)'}</label><input type="number" id="tf-time" value="${t.timeLimit||30}" min="5" max="180" style="width:100px"></div>
    </div>
    <div class="modal-section-label" id="tf-qcount-label" style="margin-top:16px">❓ Savollar (${_testQuestions.length} ${L==='ru'?'кол-во':L==='en'?'count':'ta'})</div>
    <div id="test-questions-list">${qHtml}</div>
    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-sm" onclick="addQuestion()" style="background:var(--teal-light);color:var(--teal-text);border-color:rgba(13,148,136,.3)">${L==='ru'?'➕ Добавить вопрос':L==='en'?'➕ Add question':"➕ Savol qo'shish"}</button>
      <button class="btn btn-sm" onclick="importTestFromFile()" style="background:var(--purple-light);color:var(--purple-text);border-color:rgba(124,58,237,.3)">${L==='ru'?'📤 Загрузить из файла':L==='en'?'📤 Upload from file':'📤 Fayldan yuklash (JSON)'}</button>
      <input type="file" id="tf-file-input" accept=".json,.txt" style="display:none" onchange="handleTestFileImport(this)">
    </div>
    <div class="modal-section-label" style="margin-top:16px">📎 ${L==='ru'?'PDF файл (необязательно)':L==='en'?'PDF file (optional)':'PDF fayl (ixtiyoriy)'}</div>
    <div id="tf-pdf-wrap">${_renderTestPdfBox(t)}</div>
    <input type="file" id="tf-pdf-input" accept="application/pdf,.pdf" style="display:none" onchange="handleTestPdfAttach(this)">`;
  document.getElementById('test-modal-overlay').classList.add('open');
}

function renderQuestionEdit(q, qi) {
  const opts = ['A','B','C','D'];
  const optsHtml = opts.map((lbl, oi) => `
    <div class="q-option-row">
      <input type="radio" name="q${qi}_correct" value="${oi}" ${q.correct===oi?'checked':''} onchange="_testQuestions[${qi}].correct=${oi}" id="qo_${qi}_${oi}">
      <label for="qo_${qi}_${oi}" style="font-weight:600;color:var(--text2);min-width:20px">${lbl})</label>
      <input class="q-opt-input" id="qopt_${qi}_${oi}" value="${(q.options&&q.options[oi])||''}" placeholder="Variant ${lbl}..." oninput="_testQuestions[${qi}].options=_testQuestions[${qi}].options||['','','',''];_testQuestions[${qi}].options[${oi}]=this.value">
    </div>`).join('');
  return `<div class="question-edit-card" id="qcard_${qi}">
    <div class="qcard-header">
      <span class="qcard-num">❓ ${qi+1}-savol</span>
      <button class="qcard-remove-btn" onclick="removeQuestion(${qi})" title="${t('delete_btn')}">✕</button>
    </div>
    <div class="fg" style="margin-bottom:10px">
      <input id="qtxt_${qi}" value="${q.text||''}" placeholder="Savol matnini kiriting..." oninput="_testQuestions[${qi}].text=this.value" style="font-weight:600">
    </div>
    <div class="q-options">${optsHtml}</div>
  </div>`;
}

function _updateQCountLabel() {
  const el = document.getElementById('tf-qcount-label');
  if (el) el.textContent = `❓ Savollar (${_testQuestions.length} ${LANG==='ru'?'кол-во':LANG==='en'?'count':'ta'})`;
}

function addQuestion() {
  _testQuestions.push({ id: 'q_'+Date.now()+'_'+_testQuestions.length, text: '', options: ['','','',''], correct: _testQuestions.length % 4 });
  document.getElementById('test-questions-list').innerHTML = _testQuestions.map((q,qi) => renderQuestionEdit(q,qi)).join('');
  _updateQCountLabel();
}

function removeQuestion(qi) {
  _testQuestions.splice(qi, 1);
  document.getElementById('test-questions-list').innerHTML = _testQuestions.map((q,i) => renderQuestionEdit(q,i)).join('');
  _updateQCountLabel();
}

// 🆕 PDF'dan savollarni AVTOMATIK chiqarish. Mentor test uchun PDF tashlasa,
// undan matnni o'qib, quyidagi formatga mos savollarni avtomatik topib,
// savollar ro'yxatiga qo'shadi (mentor keyin ko'rib chiqib, kerak bo'lsa
// tahrirlaydi). Format topilmasa — mentor savollarni qo'lda kiritishi yoki
// JSON orqali yuklashi mumkin (bu imkoniyatlar baribir ochiq qoladi).
//
// Kutilgan PDF matni formati (har savol uchun):
//   1. Savol matni?
//   A) variant 1
//   B) variant 2
//   C) variant 3
//   D) variant 4
//   Javob: B
function _loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (window.__pdfJsLoadingPromise) return window.__pdfJsLoadingPromise;
  window.__pdfJsLoadingPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = () => {
      try {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve(window.pdfjsLib);
      } catch (e) { reject(e); }
    };
    s.onerror = () => reject(new Error("PDF o'qish kutubxonasi yuklanmadi (internetni tekshiring)"));
    document.head.appendChild(s);
  });
  return window.__pdfJsLoadingPromise;
}

function _dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1] || '';
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function _extractTextFromPdf(dataUrl) {
  const pdfjsLib = await _loadPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: _dataUrlToBytes(dataUrl) }).promise;
  let fullText = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    let lastY = null, lineText = '';
    for (const item of content.items) {
      if (lastY !== null && Math.abs(item.transform[5] - lastY) > 2) {
        fullText += lineText.trim() + '\n';
        lineText = '';
      }
      lineText += item.str + ' ';
      lastY = item.transform[5];
    }
    fullText += lineText.trim() + '\n';
  }
  return fullText;
}

function _parseQuestionsFromText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const qRe = /^(\d{1,3})[\.\)]\s*(.+)/;
  const oRe = /^([A-Da-d])[\.\)]\s*(.+)/;
  const aRe = /^(javob|to'g'ri javob|to‘g‘ri javob|to‘g‘risi|answer|correct answer|ответ|правильный ответ)\s*[:\-–]?\s*([A-Da-d])\b/i;
  const out = [];
  let cur = null;
  for (const line of lines) {
    const am = aRe.exec(line);
    if (am && cur) { cur.correct = am[2].toUpperCase().charCodeAt(0) - 65; continue; }
    const om = oRe.exec(line);
    const qm = qRe.exec(line);
    if (om && cur && !(qm && cur.options.length === 0)) {
      if (cur.options.length < 4) cur.options.push(om[2].trim());
      continue;
    }
    if (qm && (!cur || cur.options.length >= 2)) {
      if (cur && cur.text && cur.options.length >= 2) out.push(cur);
      cur = { text: qm[2].trim(), options: [], correct: 0 };
      continue;
    }
    if (cur && cur.options.length === 0) cur.text += ' ' + line; // ko'p qatorli savol matni
  }
  if (cur && cur.text && cur.options.length >= 2) out.push(cur);
  return out
    .filter(q => q.options.length >= 2)
    .map((q, i) => ({
      id: 'q_pdf_' + Date.now() + '_' + i,
      text: q.text,
      options: [q.options[0] || '', q.options[1] || '', q.options[2] || '', q.options[3] || ''],
      correct: Math.min(q.correct, q.options.length - 1),
    }));
}

async function autoExtractTestQuestions(dataUrl) {
  toast('⏳ PDF ichidan savollar qidirilmoqda...');
  let extracted = [];
  try {
    const text = await _extractTextFromPdf(dataUrl);
    extracted = _parseQuestionsFromText(text);
  } catch (e) {
    toast("⚠️ PDF o'qib bo'lmadi: " + e.message + ". Savollarni qo'lda kiriting yoki JSON orqali yuklang.");
    return;
  }
  if (!extracted.length) {
    toast("ℹ️ PDF'dan savollar avtomatik aniqlanmadi (format mos kelmadi). Savollarni qo'lda kiriting yoki JSON orqali yuklang.");
    return;
  }
  if (
    _testQuestions.length &&
    !(await crmConfirm(
      `PDF'dan ${extracted.length} ta savol topildi. Mavjud ${_testQuestions.length} ta savol almashtirilsinmi?`,
    ))
  ) {
    return;
  }
  _testQuestions = extracted;
  const list = document.getElementById('test-questions-list');
  if (list) list.innerHTML = _testQuestions.map((q, qi) => renderQuestionEdit(q, qi)).join('');
  _updateQCountLabel();
  toast(`✅ ${extracted.length} ta savol PDF'dan avtomatik chiqarildi! Tekshirib, kerak bo'lsa tahrirlang.`);
}

let _testPdfData = null; // yangi tanlangan (hali yuklanmagan) PDF base64
let _testPdfName = null;
let _testPdfRemoved = false; // mavjud PDF olib tashlanishi belgilandimi

// 🔧 Test PDF fayllari ham video fayllar kabi backend'da (blobs collection)
// alohida saqlanadi, D.tests massivi (localStorage/kv) ichida emas —
// aks holda katta PDF fayllar umumiy ma'lumot hajmini limitdan oshirib yuborardi.
function _testApiBase() {
  if (typeof __API_BASE__ !== 'undefined' && __API_BASE__) return __API_BASE__;
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return window.location.protocol + '//' + window.location.hostname + ':' + (window.location.port || 3000);
  }
  return window.location.origin;
}
function _uploadTestPdf(testId, dataUrl, name) {
  return fetch(_testApiBase() + '/api/blob', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'testpdf_' + testId, data: dataUrl, name: name || '' }),
  }).then(r => r.json());
}
function _fetchTestPdf(testId) {
  return fetch(_testApiBase() + '/api/blob/' + encodeURIComponent('testpdf_' + testId))
    .then(r => r.ok ? r.json() : null).catch(() => null);
}
function _deleteTestPdf(testId) {
  return fetch(_testApiBase() + '/api/blob/delete', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'testpdf_' + testId }),
  }).catch(() => {});
}

function _renderTestPdfBox(t) {
  const L = LANG;
  const hint = `<div style="font-size:11.5px;color:var(--text3);margin-top:6px;line-height:1.5">${L==='ru'?'Формат для автоматического извлечения вопросов из PDF':L==='en'?'Format for automatic question extraction from PDF':"Savollarni PDF'dan avtomatik chiqarish uchun format"}: <code>1. Savol matni? / A) ... / B) ... / C) ... / D) ... / Javob: B</code></div>`;
  if (t && t.pdfName && !_testPdfRemoved && !_testPdfData) {
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg2);border:1.5px solid var(--border);border-radius:10px">
      <span style="font-size:20px">📄</span>
      <span style="flex:1;font-size:13px;font-weight:600;word-break:break-all">${t.pdfName}</span>
      <button type="button" class="btn btn-sm" onclick="downloadTestPdf(${t.id})">👁 ${L==='ru'?'Открыть':L==='en'?'Open':"Ko'rish"}</button>
      <button type="button" class="btn btn-sm btn-del-outline" onclick="removeTestPdfAttach()">✕</button>
    </div>`;
  }
  if (_testPdfData) {
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg2);border:1.5px solid var(--border);border-radius:10px">
      <span style="font-size:20px">📄</span>
      <span style="flex:1;font-size:13px;font-weight:600;word-break:break-all">${_testPdfName}</span>
      <button type="button" class="btn btn-sm" onclick="autoExtractTestQuestions(_testPdfData)">🤖 ${L==='ru'?'Извлечь вопросы':L==='en'?'Extract questions':'Savollarni chiqarish'}</button>
      <button type="button" class="btn btn-sm btn-del-outline" onclick="removeTestPdfAttach()">✕</button>
    </div>${hint}`;
  }
  return `<div style="border:2px dashed var(--border2);border-radius:10px;padding:16px;text-align:center;cursor:pointer;background:var(--bg2)" onclick="document.getElementById('tf-pdf-input').click()">
    <div style="font-size:26px;margin-bottom:4px">📎</div>
    <div style="font-size:12.5px;font-weight:600;color:var(--text2)">${L==='ru'?'PDF файл выбрать (вопросы извлекутся автоматически)':L==='en'?'Choose PDF file (questions will be extracted automatically)':'PDF fayl tanlash (savollar avtomatik chiqariladi)'}</div>
  </div>${hint}`;
}

function handleTestPdfAttach(inp) {
  const file = inp.files[0];
  if (!file) return;
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    toast('⚠️ Faqat PDF fayl tanlang!');
    inp.value = '';
    return;
  }
  const maxBytes = 12 * 1024 * 1024; // 12MB
  if (file.size > maxBytes) {
    toast('⚠️ PDF fayl juda katta (max 12MB).');
    inp.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    _testPdfData = e.target.result;
    _testPdfName = file.name;
    _testPdfRemoved = false;
    const wrap = document.getElementById('tf-pdf-wrap');
    if (wrap) wrap.innerHTML = _renderTestPdfBox(_editTestId ? D.tests.find(x => x.id === _editTestId) : {});
    toast('✅ PDF tanlandi!');
    // 🆕 PDF tashlanganda avtomatik ravishda undan savollarni chiqarishga urinamiz
    autoExtractTestQuestions(_testPdfData);
  };
  reader.onerror = () => toast('⚠️ Faylni o\'qib bo\'lmadi.');
  reader.readAsDataURL(file);
}

function removeTestPdfAttach() {
  _testPdfData = null;
  _testPdfName = null;
  _testPdfRemoved = true;
  const wrap = document.getElementById('tf-pdf-wrap');
  if (wrap) wrap.innerHTML = _renderTestPdfBox({});
}

async function downloadTestPdf(testId) {
  const t = D.tests.find(x => x.id === testId);
  if (!t || !t.pdfName) return;
  toast('⏳ Yuklanmoqda...');
  const res = await _fetchTestPdf(testId);
  if (!res || !res.ok) { toast('⚠️ PDF topilmadi.'); return; }
  const a = document.createElement('a');
  a.href = res.data;
  a.download = t.pdfName || 'test.pdf';
  a.target = '_blank';
  a.click();
}

function importTestFromFile() {
  document.getElementById('tf-file-input').click();
}

function handleTestFileImport(inp) {
  const file = inp.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (data.title) document.getElementById('tf-title').value = data.title;
      if (data.timeLimit) document.getElementById('tf-time').value = data.timeLimit;
      if (Array.isArray(data.questions)) {
        _testQuestions = data.questions.map((q,i) => ({
          id: q.id || 'q_'+Date.now()+'_'+i,
          text: q.text || '',
          options: q.options || ['','','',''],
          correct: typeof q.correct === 'number' ? q.correct : 0
        }));
        document.getElementById('test-questions-list').innerHTML = _testQuestions.map((q,qi) => renderQuestionEdit(q,qi)).join('');
        _updateQCountLabel();
        toast('✅ ' + _testQuestions.length + ' ta savol yuklandi!');
      }
    } catch(err) {
      toast('❌ Fayl formatida xato! JSON bo\'lishi kerak.');
    }
  };
  reader.readAsText(file);
  inp.value = '';
}

async function saveTest() {
  const title = (document.getElementById('tf-title').value || '').trim();
  if (!title) { toast('⚠️ Test nomini kiriting!'); return; }
  if (!_testQuestions.length) { toast('⚠️ Kamida 1 ta savol qo\'shing!'); return; }
  const invalid = _testQuestions.find(q => !q.text.trim() || (q.options||[]).some(o => !o.trim()));
  if (invalid) { toast('⚠️ Barcha savol va variantlarni to\'ldiring!'); return; }
  const groupIdVal = document.getElementById('tf-group').value;
  const groupId = groupIdVal ? parseInt(groupIdVal) : null;
  const cu = getCurrentUser();
  // Mentor faqat o'z guruhiga test qo'sha oladi
  if (isMentorRole() && groupId) {
    const mName = cu.mentorName || cu.name;
    const myGroup = D.groups.find(g => g.id === groupId && g.mentor === mName);
    if (!myGroup) { toast('⚠️ Siz faqat o\'z guruhingizga test qo\'sha olasiz!'); return; }
  }
  if (isMentorRole() && !groupId) { toast('⚠️ Guruhni tanlang!'); return; }
  const timeLimit = parseInt(document.getElementById('tf-time').value) || 30;
  const testData = { title, groupId, timeLimit, questions: _testQuestions, createdBy: cu.name || cu.role, createdAt: todayStr() };
  const testId = _editTestId || newId();

  // 🔧 PDF fayl backend'ga (blobs collection) yuklanadi — D.tests massivi
  // (localStorage/kv) ichida emas, aks holda katta PDF fayllar CRM
  // ma'lumotlarining umumiy hajm chegarasiga urib qolardi.
  if (_testPdfData) {
    toast('⏳ PDF yuklanmoqda...');
    try {
      const res = await _uploadTestPdf(testId, _testPdfData, _testPdfName);
      if (!res || !res.ok) { toast('❌ PDF yuklashda xatolik!'); return; }
      testData.pdfName = _testPdfName;
    } catch (e) {
      toast('❌ PDF yuklashda xatolik. Internetni tekshiring.');
      return;
    }
  } else if (_testPdfRemoved) {
    _deleteTestPdf(testId);
    testData.pdfName = null;
  } else if (_editTestId) {
    const existing = D.tests.find(x => x.id === _editTestId);
    if (existing && existing.pdfName) testData.pdfName = existing.pdfName;
  }

  if (_editTestId) {
    Object.assign(D.tests.find(x => x.id === _editTestId), testData);
    toast('✅ Test yangilandi!');
  } else {
    testData.id = testId;
    D.tests.push(testData);
    toast('✅ Test yaratildi!');
  }
  saveData();
  const ncTests = document.getElementById('nc-tests');
  if (ncTests) ncTests.textContent = D.tests.length;
  closeTestModal();
  renderTestsPanel();
}

async function deleteTest(id) {
  if (!(await crmConfirm('Bu test o\'chirilsinmi? Barcha natijalar ham o\'chadi!', { danger: true })))
    return;
  const t = D.tests.find(x => x.id === id);
  if (t && t.pdfName) _deleteTestPdf(id); // 🔧 biriktirilgan PDF ham backend'dan o'chiriladi
  D.tests = D.tests.filter(x => x.id !== id);
  if (D.testResults[id]) delete D.testResults[id];
  saveData();
  const ncTests = document.getElementById('nc-tests');
  if (ncTests) ncTests.textContent = D.tests.length;
  toast('🗑 Test o\'chirildi');
  renderTestsPanel();
}

function openTestResults(testId) {
  const t = D.tests.find(x => x.id === testId);
  if (!t) return;
  const results = D.testResults[testId] || {};
  document.getElementById('test-results-title').textContent = '📊 ' + t.title + ' — Natijalar';
  const resultEntries = Object.entries(results).map(([sid, r]) => {
    const s = D.students.find(x => String(x.id) === String(sid));
    return { student: s, result: r };
  }).filter(x => x.student).sort((a,b) => b.result.score - a.result.score);

  if (!resultEntries.length) {
    document.getElementById('test-results-body').innerHTML = `<div class="empty"><div class="empty-ic">📊</div><div class="empty-txt">Hali hech kim test topshirmagan</div></div>`;
  } else {
    const rows = resultEntries.map((e, i) => {
      const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':'';
      const sc = e.result.score;
      const clr = sc>=85?'var(--teal-text)':sc>=70?'var(--accent-text)':sc>=55?'var(--amber-text)':'var(--orange-text)';
      const date = e.result.completedAt ? new Date(e.result.completedAt).toLocaleString('uz') : '—';
      return `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:var(--r-md);background:var(--bg2);border:1px solid var(--border);margin-bottom:5px">
        <span style="font-size:16px;min-width:24px">${medal||''}</span>
        <div style="flex:1"><div style="font-weight:700;font-size:13px">${e.student.firstName||''} ${e.student.lastName||e.student.name}</div><div style="font-size:11px;color:var(--text3)">${date}</div></div>
        <span style="font-size:18px;font-weight:800;color:${clr}">${sc}%</span>
        <span class="grade-letter-badge grade-${getGradeLetter(sc).toLowerCase()}">${getGradeLetter(sc)}</span>
      </div>`;
    }).join('');
    const avg = Math.round(resultEntries.reduce((s,e) => s+e.result.score, 0) / resultEntries.length);
    document.getElementById('test-results-body').innerHTML = `
      <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap">
        <div style="background:var(--teal-light);border-radius:var(--r-md);padding:10px 18px;text-align:center"><div style="font-size:20px;font-weight:800;color:var(--teal-text)">${resultEntries.length}</div><div style="font-size:11px;color:var(--text3)">Topshirdi</div></div>
        <div style="background:var(--accent-light);border-radius:var(--r-md);padding:10px 18px;text-align:center"><div style="font-size:20px;font-weight:800;color:var(--accent-text)">${avg}%</div><div style="font-size:11px;color:var(--text3)">O'rtacha</div></div>
        <div style="background:var(--purple-light);border-radius:var(--r-md);padding:10px 18px;text-align:center"><div style="font-size:20px;font-weight:800;color:var(--purple-text)">${(t.questions||[]).length}</div><div style="font-size:11px;color:var(--text3)">Savollar</div></div>
      </div>
      ${rows}`;
  }
  document.getElementById('test-results-overlay').classList.add('open');
}

function closeTestModal() { document.getElementById('test-modal-overlay').classList.remove('open'); _editTestId=null; _testQuestions=[]; _testPdfData=null; _testPdfName=null; _testPdfRemoved=false; }
function closeTestResultsModal() { document.getElementById('test-results-overlay').classList.remove('open'); }

// ===================== STUDENT TEST TAKING =====================
function renderStudentTests(studentId, groupId) {
  if (!groupId) return '';
  const myTests = D.tests.filter(t => !t.groupId || t.groupId === groupId);
  if (!myTests.length) return `<div style="color:var(--text3);font-size:13px;padding:16px 0">Hozircha test yo'q.</div>`;
  return myTests.map(t => {
    const result = (D.testResults[t.id] && D.testResults[t.id][studentId]);
    const done = !!result;
    const scoreClr = done ? (result.score>=85?'var(--teal-text)':result.score>=55?'var(--amber-text)':'var(--orange-text)') : 'var(--text3)';
    return `<div class="student-test-card">
      <div style="flex:1">
        <div style="font-weight:700;font-size:14px;color:var(--text)">${t.title}</div>
        <div style="font-size:12px;color:var(--text3);margin-top:4px">❓ ${(t.questions||[]).length} savol · ⏱ ${t.timeLimit||30} daqiqa${t.pdfName ? ` · <span style="color:var(--accent);cursor:pointer;font-weight:600" onclick="downloadTestPdf(${t.id})">📎 PDF</span>` : ''}</div>
        ${done ? `<div style="font-size:12px;color:${scoreClr};font-weight:700;margin-top:6px">✅ Natija: ${result.score}% — ${getGradeLetter(result.score)}</div>` : ''}
      </div>
      <div>
        ${done ? `<span class="badge b-teal" style="font-size:12px">✅ Bajarildi</span>` : `<button class="btn btn-primary btn-sm" onclick="startStudentTest(${t.id},${studentId})">▶️ Boshlash</button>`}
      </div>
    </div>`;
  }).join('');
}

function renderStudentGrades(studentId, groupId) {
  if (!groupId) return '';
  const criteriaArr = (D.gradingCriteria && D.gradingCriteria[groupId]) || [];
  if (!criteriaArr.length) return `<div style="color:var(--text3);font-size:13px;padding:16px 0">Hozircha baholash mezonlari kiritilmagan.</div>`;
  const sg = (D.grades[groupId] && D.grades[groupId][studentId]) || {};
  const rows = criteriaArr.map(c => {
    const score = sg[c.id];
    const pct = score !== undefined ? Math.round((score/c.maxScore)*100) : null;
    const barClr = pct===null?'var(--border2)':pct>=85?'var(--teal)':pct>=70?'var(--accent)':pct>=55?'var(--amber)':'var(--orange)';
    return `<div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span style="font-size:13px;font-weight:600;color:var(--text)">${c.name}</span>
        <span style="font-size:13px;font-weight:800;color:${barClr}">${score!==undefined?score+'/'+c.maxScore:'—'}</span>
      </div>
      <div style="height:7px;background:var(--bg4);border-radius:10px;overflow:hidden">
        <div style="height:100%;width:${pct||0}%;background:${barClr};border-radius:10px;transition:width .4s"></div>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:3px">Og'irlik: ${c.weight}% · ${pct!==null?pct+'%':'Kiritilmagan'}</div>
    </div>`;
  }).join('');
  const total = calcStudentWeightedScore(studentId, groupId);
  const letter = total.filled ? getGradeLetter(total.score) : '—';
  const letterClr = total.score>=85?'var(--teal-text)':total.score>=70?'var(--accent-text)':total.score>=55?'var(--amber-text)':'var(--orange-text)';
  return `<div>${rows}</div>
    ${total.filled ? `<div style="display:flex;align-items:center;gap:12px;background:var(--bg3);border-radius:var(--r-md);padding:12px 16px;margin-top:8px;border:1px solid var(--border2)">
      <div style="font-size:13px;color:var(--text2);font-weight:600">Yakuniy ball:</div>
      <div style="font-size:22px;font-weight:900;color:${letterClr}">${total.score}%</div>
      <span class="grade-letter-badge grade-${letter.toLowerCase()}" style="font-size:16px;padding:4px 14px">${letter}</span>
    </div>` : ''}`;
}

function startStudentTest(testId, studentId) {
  const t = D.tests.find(x => x.id === testId);
  if (!t || !t.questions || !t.questions.length) { toast(LANG==='ru'?'⚠️ В тесте нет вопросов!':LANG==='en'?'⚠️ No questions in test!':'⚠️ Test savolsiz!'); return; }
  const existResult = D.testResults[testId] && D.testResults[testId][studentId];
  if (existResult) { toast(LANG==='ru'?'Вы уже сдали этот тест!':LANG==='en'?'You have already taken this test!':'Bu testni allaqachon topshirgansiz!'); return; }
  _activeTestId = testId;
  _testAnswers = {};
  _testTimeLeft = (t.timeLimit || 30) * 60;
  renderTestTakingUI(testId, studentId);
}

function renderTestTakingUI(testId, studentId) {
  const t = D.tests.find(x => x.id === testId);
  if (!t) return;
  const wrap = document.getElementById('student-tests-wrap');
  if (!wrap) return;
  const optLabels = ['A','B','C','D'];
  const qHtml = t.questions.map((q,qi) => {
    // Shuffle option indices so answers appear in random order each time
    const shuffledIdx = [0,1,2,3].sort(() => Math.random() - 0.5);
    const optsHtml = shuffledIdx.map((origIdx, newPos) => {
      const opt = (q.options||[])[origIdx] || '';
      return `
      <label class="test-option-label" id="topt_${qi}_${origIdx}">
        <input type="radio" name="tq${qi}" value="${origIdx}" onchange="_testAnswers[${qi}]=${origIdx};highlightTestOption(${qi},${origIdx})">
        <span class="test-option-badge">${optLabels[origIdx]}</span>
        <span class="test-option-text">${opt}</span>
      </label>`;
    }).join('');
    return `<div class="test-q-card">
      <div class="test-q-num">${LANG==='ru'?`Вопрос ${qi+1}/${t.questions.length}`:LANG==='en'?`Question ${qi+1}/${t.questions.length}`:`Savol ${qi+1}/${t.questions.length}`}</div>
      <div class="test-q-text">${q.text}</div>
      <div class="test-q-options">${optsHtml}</div>
    </div>`;
  }).join('');
  wrap.innerHTML = `
    <div class="test-taking-wrap">
      <div class="test-taking-header">
        <div>
          <div style="font-size:18px;font-weight:800;color:var(--text)">${t.title}</div>
          <div style="font-size:12px;color:var(--text3);margin-top:2px">${t.questions.length} ${LANG==='ru'?'вопросов':LANG==='en'?'questions':'savol'}</div>
        </div>
        <div class="test-timer" id="test-timer-display">⏱ --:--</div>
      </div>
      <div class="test-questions-scroll">${qHtml}</div>
      <div class="test-submit-bar">
        <span style="font-size:13px;color:var(--text3)" id="test-answered-count">${LANG==='ru'?`0/${t.questions.length} ответов`:LANG==='en'?`0/${t.questions.length} answered`:`0/${t.questions.length} javob berildi`}</span>
        <button class="btn btn-primary" onclick="submitStudentTest(${testId},${studentId})">${LANG==='ru'?'✅ Завершить тест':LANG==='en'?'✅ Submit test':'✅ Testni yakunlash'}</button>
      </div>
    </div>`;

  // Start timer
  if (_testTimer) clearInterval(_testTimer);
  _testTimer = setInterval(() => {
    _testTimeLeft--;
    const m = Math.floor(_testTimeLeft/60), s = _testTimeLeft%60;
    const disp = document.getElementById('test-timer-display');
    if (disp) {
      disp.textContent = `⏱ ${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      if (_testTimeLeft <= 60) disp.style.color = 'var(--orange-text)';
      if (_testTimeLeft <= 10) disp.style.background = 'var(--orange-light)';
    }
    if (_testTimeLeft <= 0) {
      clearInterval(_testTimer);
      toast('⏰ Vaqt tugadi! Avtomatik topshirildi.');
      submitStudentTest(testId, studentId, true);
    }
  }, 1000);
}

function highlightTestOption(qi, oi) {
  // Update answered count
  const t = D.tests.find(x => x.id === _activeTestId);
  if (!t) return;
  const cnt = document.getElementById('test-answered-count');
  if (cnt) cnt.textContent = Object.keys(_testAnswers).length + '/' + t.questions.length + ' javob berildi';
  // Highlight selected
  for (let i = 0; i < 4; i++) {
    const el = document.getElementById('topt_'+qi+'_'+i);
    if (el) el.classList.toggle('selected', i === oi);
  }
}

async function submitStudentTest(testId, studentId, autoSubmit) {
  if (_testTimer) { clearInterval(_testTimer); _testTimer = null; }
  const t = D.tests.find(x => x.id === testId);
  if (!t) return;
  const answered = Object.keys(_testAnswers).length;
  if (!autoSubmit && answered < t.questions.length) {
    if (!(await crmConfirm(`${t.questions.length - answered} ta savol javobsiz. Baribir topshirasizmi?`)))
      return;
  }
  // Calculate score
  let correct = 0;
  t.questions.forEach((q, qi) => {
    if (_testAnswers[qi] === q.correct) correct++;
  });
  const score = Math.round((correct / t.questions.length) * 100);
  if (!D.testResults[testId]) D.testResults[testId] = {};
  D.testResults[testId][studentId] = {
    score,
    correct,
    total: t.questions.length,
    answers: { ..._testAnswers },
    completedAt: new Date().toISOString()
  };
  saveData();
  _activeTestId = null;
  _testAnswers = {};
  // Show result
  renderStudentTestResult(testId, studentId, score, correct, t.questions.length);
}

function renderStudentTestResult(testId, studentId, score, correct, total) {
  const wrap = document.getElementById('student-tests-wrap');
  if (!wrap) return;
  const t = D.tests.find(x => x.id === testId);
  const letter = getGradeLetter(score);
  const clr = score>=85?'var(--teal-text)':score>=70?'var(--accent-text)':score>=55?'var(--amber-text)':'var(--orange-text)';
  const emoji = score>=85?'🏆':score>=70?'🎉':score>=55?'👍':'💪';
  wrap.innerHTML = `
    <div style="text-align:center;padding:40px 20px;max-width:500px;margin:0 auto">
      <div style="font-size:64px;margin-bottom:16px">${emoji}</div>
      <div style="font-size:28px;font-weight:900;color:${clr}">${score}%</div>
      <div style="font-size:14px;color:var(--text2);margin-top:8px">${correct}/${total} to'g'ri javob</div>
      <span class="grade-letter-badge grade-${letter.toLowerCase()}" style="font-size:20px;padding:6px 20px;margin:16px auto;display:inline-block">${letter}</span>
      <div style="font-size:16px;font-weight:700;color:var(--text);margin-top:8px">${t?t.title:''}</div>
      <div style="margin-top:24px">
        <button class="btn btn-primary" onclick="renderStudentTestsPage()" style="padding:10px 28px;font-size:14px">⬅️ Testlarga qaytish</button>
      </div>
    </div>`;
}

// Patch renderStudentDashboard to include grades, tests and chat at bottom
const _origRenderStudentDashboard = renderStudentDashboard;
renderStudentDashboard = function() {
  _origRenderStudentDashboard();
  setTimeout(() => {
    const wrap = document.getElementById('student-my-wrap');
    if (!wrap) return;
    const cu = getCurrentUser();
    const studentId = cu.studentId ? parseInt(cu.studentId) : null;
    const s = studentId ? D.students.find(x => x.id === studentId) : null;
    if (!s) return;
    const groupId = s.groupId;
    const chatSectionHtml = typeof renderStudentChatSection === 'function'
      ? `<div id="stud-chat-section">${renderStudentChatSection(studentId)}</div>` : '';
    const simpleGradeArr=((D.simpleGrades&&D.simpleGrades[studentId])||[]).slice().sort((a,b)=>new Date(b.date)-new Date(a.date));
    const simpleGradesHtml=simpleGradeArr.length?`<div style="display:flex;flex-direction:column;gap:8px">${simpleGradeArr.slice(0,8).map(g=>`<div class="grade-hist-item"><div style="display:flex;align-items:center;justify-content:space-between;gap:8px">${_gradePill(g.score)}<span style="font-size:11px;color:var(--text3);flex:1">${fmtDateTime(g.date)}</span></div>${g.comment?`<div style="font-size:12.5px;color:var(--text2);margin-top:6px">💬 ${g.comment.replace(/</g,'&lt;')}</div>`:''}</div>`).join('')}</div>`:`<div style="color:var(--text3);font-size:13px;padding:8px 0">${t('no_grades_yet')}</div>`;
    const hasCriteria = D.gradingCriteria && D.gradingCriteria[groupId] && D.gradingCriteria[groupId].length;
    const extraHtml = `
      <div style="margin-top:24px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r-lg);padding:20px 22px;box-shadow:var(--shadow-sm)">
        <div style="font-size:15px;font-weight:800;color:var(--text);margin-bottom:4px">🏅 Mening baholarim</div>
        <div style="font-size:12px;color:var(--text3);margin-bottom:14px">${t('grade_history_title')}</div>
        ${simpleGradesHtml}
        ${hasCriteria?`<details style="margin-top:14px"><summary style="cursor:pointer;font-size:12px;color:var(--text3);font-weight:600">⚙️ ${t('criteria_grading')}</summary><div style="margin-top:10px">${renderStudentGrades(studentId, groupId)}</div></details>`:''}
      </div>
      <div style="margin-top:18px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r-lg);padding:20px 22px;box-shadow:var(--shadow-sm)">
        <div style="font-size:15px;font-weight:800;color:var(--text);margin-bottom:4px">📝 Mening testlarim</div>
        <div style="font-size:12px;color:var(--text3);margin-bottom:14px">Guruhingiz uchun testlar</div>
        ${renderStudentTests(studentId, groupId)}
      </div>
      ${chatSectionHtml}`;
    wrap.insertAdjacentHTML('beforeend', extraHtml);
    // scroll chat to bottom
    setTimeout(()=>{const a=document.getElementById('stud-chat-msgs');if(a)a.scrollTop=a.scrollHeight;},60);
  }, 50);
};

// ===================== MENTOR DASHBOARD =====================
function renderMentorDashboard(){
  const wrap=document.getElementById('mentor-dash-wrap');if(!wrap)return;
  const cu=getCurrentUser();
  const mentorName=cu.mentorName||cu.name;
  const mentor=D.mentors.find(m=>m.name===mentorName);
  const myGroups=D.groups.filter(g=>g.mentor===mentorName);
  const myStudents=D.students.filter(s=>myGroups.some(g=>g.id===s.groupId));
  const activeStudents=myStudents.filter(s=>s.status==='Aktiv');
  const debtors=myStudents.filter(s=>s.isDebtor);

  // Oylik — admin o'zi yozib jo'natadi. Bu yerda faqat JO'NATILGAN summa ko'rsatiladi.
  const now=new Date();
  const curMonth=now.getMonth();const curYear=now.getFullYear();
  const myStudentIds=myStudents.map(s=>s.id);
  const salaryTx=(D.finance||[]).find(tx=>{
    if(tx.type!=='salary')return false;
    const d=new Date(tx.date);
    if(d.getFullYear()!==curYear||d.getMonth()!==curMonth)return false;
    return mentor?tx.mentorId===mentor.id:false;
  })||null;
  const mySalary=salaryTx?salaryTx.amount:0;
  const salarySent=!!salaryTx;

  // ---- YANGI ANALYTICS (2-band: Dashboard) ----
  const DAY_MAP_BY_JS=['Yak','Du','Se','Ch','Pa','Ju','Sh']; // 0..6 -> kod
  const todayCode=DAY_MAP_BY_JS[now.getDay()];
  const todayLessons=myGroups.filter(g=>(g.days||[]).includes(todayCode)).length;
  const weekLessons=myGroups.reduce((s,g)=>s+((g.days||[]).length),0);
  // Davomat foizi (joriy oy, barcha guruhlar)
  let attPresent=0,attMarked=0;
  myGroups.forEach(g=>{
    const attKey='att_'+g.id+'_'+curYear+'_'+curMonth;
    const groupAtt=D.attendance[attKey]||{};
    D.students.filter(s=>s.groupId===g.id).forEach(s=>{
      const sAtt=groupAtt['s'+s.id]||{};
      for(let l=1;l<=LESSON_COUNT;l++){const v=sAtt['l'+l]||'';if(v==='K'){attPresent++;attMarked++;}else if(v==='Y'){attMarked++;}}
    });
  });
  const attendancePct=attMarked>0?Math.round(attPresent/attMarked*100):0;
  // O'rtacha baho (barcha vaqt, mening talabalarim)
  let gradeSum=0,gradeCnt=0;
  const studentAvgGrades=[];
  myStudentIds.forEach(sid=>{
    const arr=(D.simpleGrades&&D.simpleGrades[sid])||[];
    if(arr.length){const avg=arr.reduce((s,g)=>s+g.score,0)/arr.length;gradeSum+=avg;gradeCnt++;studentAvgGrades.push({id:sid,avg:Math.round(avg)});}
  });
  const avgGradeAll=gradeCnt>0?Math.round(gradeSum/gradeCnt):null;
  // Har talaba uchun shu oylik davomat % (eng faol / past natijali uchun)
  const studentAttPct=myStudents.map(s=>{
    const grp=myGroups.find(g=>g.id===s.groupId);
    const attKey=grp?'att_'+grp.id+'_'+curYear+'_'+curMonth:null;
    const sAtt=(attKey&&D.attendance[attKey]&&D.attendance[attKey]['s'+s.id])||{};
    let p=0,mk=0;for(let l=1;l<=LESSON_COUNT;l++){const v=sAtt['l'+l]||'';if(v==='K'){p++;mk++;}else if(v==='Y')mk++;}
    return {id:s.id,name:s.name,groupId:s.groupId,pct:mk>0?Math.round(p/mk*100):null,marked:mk};
  });
  const mostActive=studentAttPct.filter(x=>x.marked>=2).sort((a,b)=>b.pct-a.pct).slice(0,4);
  const lowPerformers=studentAttPct.filter(x=>x.marked>=2).sort((a,b)=>a.pct-b.pct).slice(0,4).filter(x=>x.pct<80);
  // Oylik o'sish: shu oy va o'tgan oy qo'shilgan talabalar soni
  const prevMonthDt=new Date(curYear,curMonth-1,1);
  const newThisMonth=myStudents.filter(s=>{const jd=new Date(s.joinDate);return jd.getFullYear()===curYear&&jd.getMonth()===curMonth;}).length;
  const newPrevMonth=myStudents.filter(s=>{const jd=new Date(s.joinDate);return jd.getFullYear()===prevMonthDt.getFullYear()&&jd.getMonth()===prevMonthDt.getMonth();}).length;
  const growthDelta=newThisMonth-newPrevMonth;
  // Oxirgi faoliyatlar: so'nggi baholar + yangi qo'shilgan talabalar
  let activityFeed=[];
  myStudentIds.forEach(sid=>{
    ((D.simpleGrades&&D.simpleGrades[sid])||[]).forEach(g=>{
      const st=D.students.find(x=>x.id===sid);
      activityFeed.push({type:'grade',date:g.date,text:(st?st.name:'?')+' — '+g.score+' '+(L==='ru'?'балл':L==='en'?'pts':'ball'),icon:g.score>=71?'🟢':g.score>=56?'🟡':'🔴'});
    });
  });
  myStudents.forEach(s=>{
    const jd=new Date(s.joinDate);const daysSince=(now-jd)/86400000;
    if(daysSince>=0&&daysSince<=14)activityFeed.push({type:'join',date:s.joinDate,text:s.name+' — '+(L==='ru'?'новый студент':L==='en'?'new student':'yangi talaba'),icon:'✨'});
  });
  activityFeed.sort((a,b)=>new Date(b.date)-new Date(a.date));
  activityFeed=activityFeed.slice(0,6);
  // ---- Grafiklar uchun data ----
  const DAY_SHORT=L==='ru'?{Du:'Пн',Se:'Вт',Ch:'Ср',Pa:'Чт',Ju:'Пт',Sh:'Сб'}:L==='en'?{Du:'Mon',Se:'Tue',Ch:'Wed',Pa:'Thu',Ju:'Fri',Sh:'Sat'}:{Du:'Du',Se:'Se',Ch:'Ch',Pa:'Pa',Ju:'Ju',Sh:'Sh'};
  const weekAttData=['Du','Se','Ch','Pa','Ju','Sh'].map(dk=>{
    let p=0,mk=0;
    myGroups.filter(g=>(g.days||[]).includes(dk)).forEach(g=>{
      const attKey='att_'+g.id+'_'+curYear+'_'+curMonth;const groupAtt=D.attendance[attKey]||{};
      D.students.filter(s=>s.groupId===g.id).forEach(s=>{
        const sAtt=groupAtt['s'+s.id]||{};
        for(let l=1;l<=LESSON_COUNT;l++){const v=sAtt['l'+l]||'';if(v==='K'){p++;mk++;}else if(v==='Y')mk++;}
      });
    });
    return {label:DAY_SHORT[dk],val:mk>0?Math.round(p/mk*100):0};
  });
  const monthlyGradesData=[];
  for(let i=4;i>=0;i--){
    const dt=new Date(curYear,curMonth-i,1);const y=dt.getFullYear(),m=dt.getMonth();
    let sum=0,cnt=0;
    myStudentIds.forEach(sid=>{((D.simpleGrades&&D.simpleGrades[sid])||[]).forEach(g=>{const gd=new Date(g.date);if(gd.getFullYear()===y&&gd.getMonth()===m){sum+=g.score;cnt++;}});});
    monthlyGradesData.push({label:getMonthName(m,true),val:cnt?Math.round(sum/cnt):0});
  }
  const activityBuckets=[
    {val:studentAttPct.filter(x=>x.pct!==null&&x.pct>=80).length,color:'#0d9488',lbl:L==='ru'?'Высокая':L==='en'?'High':'Yuqori'},
    {val:studentAttPct.filter(x=>x.pct!==null&&x.pct>=50&&x.pct<80).length,color:'#f59e0b',lbl:L==='ru'?'Средняя':L==='en'?'Average':"O'rtacha"},
    {val:studentAttPct.filter(x=>x.pct!==null&&x.pct<50).length,color:'#ea580c',lbl:L==='ru'?'Низкая':L==='en'?'Low':'Past'},
  ];
  const lessonStatsData=[
    {val:attPresent,color:'#0d9488',lbl:'K'},
    {val:Math.max(attMarked-attPresent,0),color:'#ea580c',lbl:'Y'},
  ];

  // Mentor profil qismi
  const photoHtml=mentor?mentorAvatarHtml(mentor,0,'lg'):`<div class="detail-av av-a" style="font-size:24px;width:68px;height:68px;border-radius:50%">${(mentorName||'M').substring(0,2).toUpperCase()}</div>`;
  const monthNames=L==='ru'?['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']:L==='en'?['January','February','March','April','May','June','July','August','September','October','November','December']:['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];

  // Guruh kartochkalari (qisqacha)
  const groupCardsHtml=myGroups.map((g,i)=>{
    const gStudents=D.students.filter(s=>s.groupId===g.id);
    const gActive=gStudents.filter(s=>s.status==='Aktiv').length;
    const gDebtors=gStudents.filter(s=>s.isDebtor).length;
    const DAY_FULL={Du:'Du',Se:'Se',Ch:'Ch',Pa:'Pa',Ju:'Ju',Sh:'Sh'};
    const daysStr=(g.days||[]).map(d=>DAY_FULL[d]||d).join(', ');
    return `<div style="background:var(--bg);border:1.5px solid var(--border2);border-radius:var(--r-lg);padding:16px 18px;box-shadow:var(--shadow-sm)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div>
          <div style="font-size:15px;font-weight:800;color:var(--text)">${g.name}</div>
          <div style="font-size:11px;color:var(--text2);margin-top:2px">📚 ${g.course}</div>
        </div>
        <span class="badge ${g.status==='Faol'?'b-teal':'b-gray'}">${g.status}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">
        <div style="background:var(--bg2);border-radius:var(--r-md);padding:8px 10px;border:1px solid var(--border)">
          <div style="color:var(--text3);font-size:10px;font-weight:700;text-transform:uppercase">⏰ Vaqt</div>
          <div style="font-weight:700;color:var(--accent);margin-top:2px">${g.timeStart||'—'}–${g.timeEnd||'—'}</div>
          <div style="color:var(--text3);font-size:11px">${daysStr}</div>
        </div>
        <div style="background:var(--bg2);border-radius:var(--r-md);padding:8px 10px;border:1px solid var(--border)">
          <div style="color:var(--text3);font-size:10px;font-weight:700;text-transform:uppercase">👥 Talabalar</div>
          <div style="font-weight:700;color:var(--purple);margin-top:2px;font-size:15px">${gStudents.length} <span style="font-size:11px;color:var(--text3)">ta</span></div>
          <div style="color:var(--teal-text);font-size:11px">✅ ${gActive} aktiv${gDebtors>0?` · 💸 ${gDebtors} qarzdor`:''}</div>
        </div>
      </div>
      <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-sm btn-primary" onclick="go('mentors-my',document.getElementById('nav-mentors-my'))" style="font-size:11px;padding:5px 10px">${L==='ru'?'📅 Расписание':L==='en'?'📅 Schedule':'📅 Jadval'}</button>
        <button class="btn btn-sm" onclick="_attMonth=null;showGroupStudents(${g.id})" style="font-size:11px;padding:5px 10px">${L==='ru'?'📋 Посещаемость':L==='en'?'📋 Attendance':'📋 Davomat'}</button>
        <button class="btn btn-sm" onclick="go('grades',document.getElementById('nav-grades-mentor'));setTimeout(()=>selectGradeGroup(${g.id}),150)" style="font-size:11px;padding:5px 10px;background:var(--amber-light);color:var(--amber-text)">${L==='ru'?'🏅 Оценки':L==='en'?'🏅 Grades':'🏅 Baholar'}</button>
        <button class="btn btn-sm" onclick="go('tests',document.getElementById('nav-tests-mentor'));setTimeout(()=>filterTestsByGroup(${g.id}),150)" style="font-size:11px;padding:5px 10px;background:var(--teal-light);color:var(--teal-text)">${L==='ru'?'📝 Тесты':L==='en'?'📝 Tests':'📝 Testlar'}</button>
      </div>
    </div>`;
  }).join('');

  // Aktiv talabalar jadvali (top 8)
  const topStudents=activeStudents.slice(0,8);
  const studTableHtml=topStudents.length?`
    <div style="overflow-x:auto;margin-top:4px">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="border-bottom:2px solid var(--border2)">
          <th style="text-align:left;padding:8px 10px;font-size:11px;color:var(--text3);font-weight:700">${L==='ru'?'Студент':L==='en'?'Student':'Talaba'}</th>
          <th style="text-align:left;padding:8px 10px;font-size:11px;color:var(--text3);font-weight:700">${L==='ru'?'Группа':L==='en'?'Group':'Guruh'}</th>
          <th style="text-align:center;padding:8px 10px;font-size:11px;color:var(--text3);font-weight:700">${L==='ru'?'Статус':L==='en'?'Status':'Holat'}</th>
          <th style="text-align:right;padding:8px 10px;font-size:11px;color:var(--text3);font-weight:700">${L==='ru'?'Оплата':L==='en'?'Payment':"To'lov"}</th>
        </tr></thead>
        <tbody>${topStudents.map((s,i)=>{
          const grp=myGroups.find(g=>g.id===s.groupId);
          return `<tr style="border-bottom:1px solid var(--border);cursor:pointer;transition:.12s" onclick="showMentorStudentDetail(${s.id})" onmouseover="this.style.background='var(--accent-light)'" onmouseout="this.style.background=''">
            <td style="padding:8px 10px;font-size:13px;font-weight:600"><div style="display:flex;align-items:center;gap:8px"><div class="av ${AV_CLS[i%5]}" style="width:26px;height:26px;font-size:9px;flex-shrink:0">${ini(s.name)}</div>${s.name}</div></td>
            <td style="padding:8px 10px;font-size:12px;color:var(--text2)">${grp?grp.name:'—'}</td>
            <td style="padding:8px 10px;text-align:center"><span class="badge b-teal" style="font-size:10px">${L==='ru'?'✅ Актив':L==='en'?'✅ Active':'✅ Aktiv'}</span></td>
            <td style="padding:8px 10px;text-align:right"><span class="${s.isDebtor?'badge b-orange':'badge b-teal'}" style="font-size:10px">${s.isDebtor?L==='ru'?'💸 Должник':L==='en'?'💸 Debtor':'💸 Qarzdor':L==='ru'?'✅ Оплачен':L==='en'?'✅ Paid':"✅ To'lagan"}</span></td>
          </tr>`;
        }).join('')}</tbody>
      </table>
      ${activeStudents.length>8?`<div style="font-size:12px;color:var(--text3);padding:8px 10px">${L==='ru'?`+ ещё ${activeStudents.length-8} активных студентов`:L==='en'?`+ ${activeStudents.length-8} more active students`:`+ yana ${activeStudents.length-8} ta aktiv talaba`}</div>`:''}
    </div>`:'<div style="color:var(--text3);font-size:13px;padding:12px 0">Aktiv talabalar yo\'q</div>';

  const isDark=_uiSettings&&_uiSettings.theme==='dark';
  const curLang=LANG||'uz';
  const curAccent=_uiSettings.accent||'blue';
  const curFs=_uiSettings.fontSize||'md';
  const themeLabel=LANG==='ru'?'Тема':LANG==='en'?'Theme':'Mavzu';
  const langLabel=LANG==='ru'?'Язык':LANG==='en'?'Language':'Til';
  const colorLabel=LANG==='ru'?'Цвет':LANG==='en'?'Color':'Rang';
  const fontLabel=LANG==='ru'?'Шрифт':LANG==='en'?'Font':'Shrift';
  const accentColors=[
    {k:'blue',  c:'#3b82f6'},
    {k:'teal',  c:'#0d9488'},
    {k:'purple',c:'#7c3aed'},
    {k:'orange',c:'#ea580c'},
    {k:'rose',  c:'#e11d48'},
    {k:'green', c:'#059669'},
  ];
  wrap.innerHTML=`<div style="padding:0 0 24px">
    <!-- Profil banner -->
    <div style="background:linear-gradient(135deg,var(--accent),var(--teal));border-radius:var(--r-lg);padding:22px 24px;color:#fff;margin-bottom:22px;position:relative;overflow:hidden">
      <div style="position:absolute;right:-10px;top:-10px;font-size:110px;opacity:.07;pointer-events:none">🎓</div>
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <div style="width:64px;height:64px;border-radius:50%;overflow:hidden;border:3px solid rgba(255,255,255,.4);flex-shrink:0;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;color:#fff">${mentor&&mentorPhotoSrc(mentor)?`<img src="${mentorPhotoSrc(mentor)}" style="width:100%;height:100%;object-fit:cover">`:(mentorName||'M').substring(0,2).toUpperCase()}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;opacity:.8">Xush kelibsiz,</div>
          <div style="font-size:24px;font-weight:800;letter-spacing:-.5px">${mentorName}</div>
          ${mentor?`<div style="font-size:13px;opacity:.85;margin-top:3px">📚 ${mentor.subject} · 💼 ${mentor.experience||'—'}</div>`:''}
        </div>
      </div>
      ${mentor?`<div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
        ${mentor.phone?`<span style="background:rgba(255,255,255,.2);padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600">📱 ${mentor.phone}</span>`:''}
        ${mentor.email?`<span style="background:rgba(255,255,255,.2);padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600">✉️ ${mentor.email}</span>`:''}
        ${mentor.telegram?`<span style="background:rgba(255,255,255,.2);padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600">💬 ${mentor.telegram}</span>`:''}
      </div>`:''}
    </div>

    <!-- Statistika kartochkalar -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:22px">
      <div style="background:var(--bg);border:1.5px solid var(--border2);border-radius:var(--r-lg);padding:16px 18px;text-align:center;box-shadow:var(--shadow-sm);cursor:pointer;transition:.15s" onclick="showMentorStatDetail('groups')" onmouseover="this.style.transform='translateY(-2px)';this.style.borderColor='var(--accent)'" onmouseout="this.style.transform='';this.style.borderColor='var(--border2)'">
        <div style="font-size:32px;font-weight:900;color:var(--accent)">${myGroups.length}</div>
        <div style="font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-top:4px">${L==='ru'?'Группы':L==='en'?'Groups':'Guruhlar'}</div>
        <div style="font-size:10px;color:var(--accent-text);margin-top:3px">${L==='ru'?'Нажмите →':L==='en'?'Click →':'Bosing →'}</div>
      </div>
      <div style="background:var(--bg);border:1.5px solid var(--border2);border-radius:var(--r-lg);padding:16px 18px;text-align:center;box-shadow:var(--shadow-sm);cursor:pointer;transition:.15s" onclick="showMentorStatDetail('active')" onmouseover="this.style.transform='translateY(-2px)';this.style.borderColor='var(--teal)'" onmouseout="this.style.transform='';this.style.borderColor='var(--border2)'">
        <div style="font-size:32px;font-weight:900;color:var(--teal-text)">${activeStudents.length}</div>
        <div style="font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-top:4px">${L==='ru'?'Активные студенты':L==='en'?'Active students':'Aktiv talabalar'}</div>
        <div style="font-size:10px;color:var(--teal-text);margin-top:3px">${L==='ru'?'Нажмите →':L==='en'?'Click →':'Bosing →'}</div>
      </div>
      <div style="background:var(--bg);border:1.5px solid var(--border2);border-radius:var(--r-lg);padding:16px 18px;text-align:center;box-shadow:var(--shadow-sm);cursor:pointer;transition:.15s" onclick="showMentorStatDetail('all')" onmouseover="this.style.transform='translateY(-2px)';this.style.borderColor='var(--purple)'" onmouseout="this.style.transform='';this.style.borderColor='var(--border2)'">
        <div style="font-size:32px;font-weight:900;color:var(--purple-text)">${myStudents.length}</div>
        <div style="font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-top:4px">${L==='ru'?'Всего студентов':L==='en'?'Total students':'Jami talabalar'}</div>
        <div style="font-size:10px;color:var(--purple-text);margin-top:3px">${L==='ru'?'Нажмите →':L==='en'?'Click →':'Bosing →'}</div>
      </div>
      <div style="background:var(--bg);border:1.5px solid ${debtors.length>0?'var(--orange)':'var(--teal)'};border-radius:var(--r-lg);padding:16px 18px;text-align:center;box-shadow:var(--shadow-sm);cursor:pointer;transition:.15s" onclick="showMentorStatDetail('debtors')" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
        <div style="font-size:28px;font-weight:900;color:${debtors.length>0?'var(--orange-text)':'var(--teal-text)'}">${debtors.length>0?'💸 '+debtors.length:'✅ 0'}</div>
        <div style="font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-top:4px">${L==='ru'?'Должники':L==='en'?'Debtors':'Qarzdorlar'}</div>
        <div style="font-size:10px;color:var(--accent-text);margin-top:3px">${L==='ru'?'Нажмите →':L==='en'?'Click →':'Bosing →'}</div>
      </div>
      <div style="background:var(--bg);border:1.5px solid ${salarySent?'var(--purple)':'var(--border2)'};border-radius:var(--r-lg);padding:16px 18px;text-align:center;box-shadow:var(--shadow-sm)">
        <div style="font-size:22px;font-weight:900;color:${salarySent?'var(--purple-text)':'var(--text3)'}">${salarySent?fmtMoney(mySalary)+'<span style="font-size:13px"> so\'m</span>':'⏳'}</div>
        <div style="font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-top:4px">${monthNames[curMonth]} ${L==='ru'?'зарплата':L==='en'?'salary':'oyligi'}</div>
        <div style="font-size:10px;margin-top:3px;color:${salarySent?'var(--teal-text)':'var(--amber-text)'}">${salarySent?(L==='ru'?'✅ Отправлено админом':L==='en'?'✅ Sent by admin':'✅ Admin jo\'natgan'):(L==='ru'?'⏳ Ожидается':L==='en'?'⏳ Pending':'⏳ Hali jo\'natilmagan')}</div>
        ${salarySent&&salaryTx.note?`<div style="font-size:10px;color:var(--text3);margin-top:3px;font-style:italic">💬 ${salaryTx.note}</div>`:''}
      </div>
    </div>

    <!-- YANGI: qo'shimcha analytics kartalari -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:22px">
      <div class="mdash-mini-card">
        <div class="mdash-mini-ic">📅</div>
        <div class="mdash-mini-num">${todayLessons}</div>
        <div class="mdash-mini-lbl">${t('today_lessons')}</div>
      </div>
      <div class="mdash-mini-card">
        <div class="mdash-mini-ic">🗓️</div>
        <div class="mdash-mini-num">${weekLessons}</div>
        <div class="mdash-mini-lbl">${t('week_lessons')}</div>
      </div>
      <div class="mdash-mini-card">
        <div class="mdash-mini-ic">📊</div>
        <div class="mdash-mini-num" style="color:${attendancePct>=80?'var(--teal-text)':attendancePct>=50?'var(--amber-text)':'var(--orange-text)'}">${attendancePct}%</div>
        <div class="mdash-mini-lbl">${t('attendance_pct')}</div>
      </div>
      <div class="mdash-mini-card">
        <div class="mdash-mini-ic">🏅</div>
        <div class="mdash-mini-num">${avgGradeAll!==null?avgGradeAll:'—'}</div>
        <div class="mdash-mini-lbl">${t('avg_grade')}</div>
      </div>
      <div class="mdash-mini-card">
        <div class="mdash-mini-ic">${growthDelta>=0?'📈':'📉'}</div>
        <div class="mdash-mini-num" style="color:${growthDelta>=0?'var(--teal-text)':'var(--orange-text)'}">${growthDelta>=0?'+':''}${growthDelta}</div>
        <div class="mdash-mini-lbl">${t('monthly_growth')}</div>
      </div>
    </div>

    <!-- Grafiklar: 4ta -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-bottom:22px">
      <div class="mdash-chart-card">
        <div class="mdash-chart-title">📈 ${t('chart_weekly_att')}</div>
        ${_buildBarSVG(weekAttData,260,120,'var(--accent)')}
      </div>
      <div class="mdash-chart-card">
        <div class="mdash-chart-title">🏅 ${t('chart_monthly_grades')}</div>
        ${_buildBarSVG(monthlyGradesData,260,120,'var(--purple)')}
      </div>
      <div class="mdash-chart-card">
        <div class="mdash-chart-title">⚡ ${t('chart_student_activity')}</div>
        <div style="display:flex;align-items:center;gap:14px">
          ${_buildDonutSVG(activityBuckets,100)}
          <div style="display:flex;flex-direction:column;gap:5px">
            ${activityBuckets.map(b=>`<div style="display:flex;align-items:center;gap:6px;font-size:11px"><span style="width:9px;height:9px;border-radius:3px;background:${b.color};display:inline-block"></span>${b.lbl}: <b>${b.val}</b></div>`).join('')}
          </div>
        </div>
      </div>
      <div class="mdash-chart-card">
        <div class="mdash-chart-title">📚 ${t('chart_lesson_stats')}</div>
        <div style="display:flex;align-items:center;gap:14px">
          ${_buildDonutSVG(lessonStatsData,100)}
          <div style="display:flex;flex-direction:column;gap:5px">
            <div style="display:flex;align-items:center;gap:6px;font-size:11px"><span style="width:9px;height:9px;border-radius:3px;background:#0d9488;display:inline-block"></span>✅ ${t('present_lbl')}: <b>${attPresent}</b></div>
            <div style="display:flex;align-items:center;gap:6px;font-size:11px"><span style="width:9px;height:9px;border-radius:3px;background:#ea580c;display:inline-block"></span>⚠️ ${t('absent_lbl')}: <b>${Math.max(attMarked-attPresent,0)}</b></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Eng faol / Past natijali + Oxirgi faoliyatlar -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:22px">
      <div class="mdash-chart-card">
        <div class="mdash-chart-title">🌟 ${t('most_active_students')}</div>
        ${mostActive.length?mostActive.map((x,i)=>`<div class="mdash-rank-row"><span class="mdash-rank-num">${i+1}</span><span class="mdash-rank-name">${x.name}</span><span class="mdash-rank-val" style="color:var(--teal-text)">${x.pct}%</span></div>`).join(''):`<div class="mdash-empty-mini">${t('no_data_yet')}</div>`}
      </div>
      <div class="mdash-chart-card">
        <div class="mdash-chart-title">⚠️ ${t('low_performers')}</div>
        ${lowPerformers.length?lowPerformers.map((x,i)=>`<div class="mdash-rank-row"><span class="mdash-rank-num" style="background:var(--orange-light);color:var(--orange-text)">${i+1}</span><span class="mdash-rank-name">${x.name}</span><span class="mdash-rank-val" style="color:var(--orange-text)">${x.pct}%</span></div>`).join(''):`<div class="mdash-empty-mini">👍 ${t('all_good_msg')}</div>`}
      </div>
      <div class="mdash-chart-card">
        <div class="mdash-chart-title">🕐 ${t('recent_activity')}</div>
        ${activityFeed.length?activityFeed.map(a=>`<div class="mdash-activity-row"><span>${a.icon}</span><span class="mdash-activity-text">${a.text}</span><span class="mdash-activity-time">${fmtDate(a.date)}</span></div>`).join(''):`<div class="mdash-empty-mini">${t('no_data_yet')}</div>`}
      </div>
    </div>

    <!-- Ikki ustun: Guruhlar + Aktiv talabalar -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
      <div>
        <div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:12px">${L==='ru'?'🗂 Мои группы':L==='en'?'🗂 My Groups':'🗂 Mening guruhlarim'}</div>
        ${myGroups.length?groupCardsHtml:`<div style="color:var(--text3);font-size:13px;padding:12px 0">${L==='ru'?'Группы не назначены':L==='en'?'No groups assigned':'Sizga guruh biriktirilmagan'}</div>`}
      </div>
      <div>
        <div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:12px">${L==='ru'?'✅ Активные студенты':L==='en'?'✅ Active students':'✅ Aktiv talabalar'}</div>
        <div style="background:var(--bg);border:1.5px solid var(--border2);border-radius:var(--r-lg);padding:16px;box-shadow:var(--shadow-sm)">
          ${studTableHtml}
        </div>
      </div>
    </div>
  </div>`;
}

// ===================== MENTOR CHAT =====================
// Chat storage key: mchat_<base64mentor>_<studentId>
// REAL-TIME: 4s polling — mentor yoki talaba yangi xabar ko'radi

function getMentorChatKey(mentorName, studentId){ return 'mchat_'+btoa(unescape(encodeURIComponent(mentorName))).replace(/=/g,'')+'_'+studentId; }
function getMentorChats(mentorName){
  try{ return JSON.parse(localStorage.getItem('mchat_list_'+btoa(unescape(encodeURIComponent(mentorName))).replace(/=/g,''))||'{}'); }catch(e){return{};}
}
function saveMentorChats(mentorName, obj){ localStorage.setItem('mchat_list_'+btoa(unescape(encodeURIComponent(mentorName))).replace(/=/g,''), JSON.stringify(obj)); }
function getMentorChatMessages(mentorName, studentId){
  try{ return JSON.parse(localStorage.getItem(getMentorChatKey(mentorName, studentId))||'[]'); }catch(e){return[];}
}
function saveMentorChatMessages(mentorName, studentId, msgs){ localStorage.setItem(getMentorChatKey(mentorName, studentId), JSON.stringify(msgs)); }

// Vaqtni normalize qilish — ts (unix) yoki time (ISO) bo'lishi mumkin
function _chatTs(m){ return m.ts || (m.time ? new Date(m.time).getTime() : 0); }
function _chatFmtTime(m){
  const ts = _chatTs(m);
  if(!ts) return '';
  const d = new Date(ts);
  if(isNaN(d)) return '';
  const hh=String(d.getHours()).padStart(2,'0');
  const mm=String(d.getMinutes()).padStart(2,'0');
  const today=new Date();
  const sameDay=d.toDateString()===today.toDateString();
  if(sameDay) return hh+':'+mm;
  return d.toLocaleDateString('uz-UZ',{day:'2-digit',month:'short'})+' '+hh+':'+mm;
}
// O'qilgan belgisi: ✓ = yuborildi (hali o'qilmagan), ✓✓ (accent rangda) = o'qildi
function _chatTicks(m){
  if(!m || m.from!=='mentor') return '';
  return m.read ? `<span style="color:#8ecbff;font-weight:700">✓✓</span>` : `<span style="opacity:.65">✓</span>`;
}
function _chatAttachmentHtml(m){
  if(!m.file) return '';
  if(m.file.isImage){
    return `<a href="${m.file.data}" target="_blank" rel="noopener"><img src="${m.file.data}" style="max-width:220px;max-height:220px;border-radius:10px;display:block;margin-bottom:${m.text?'6px':'0'};object-fit:cover"></a>`;
  }
  return `<a href="${m.file.data}" download="${(m.file.name||'file').replace(/"/g,'')}" style="display:flex;align-items:center;gap:8px;background:rgba(0,0,0,.12);border-radius:10px;padding:8px 10px;margin-bottom:${m.text?'6px':'0'};text-decoration:none;color:inherit">
    <span style="font-size:20px">📎</span><span style="font-size:12px;word-break:break-all">${(m.file.name||'fayl').replace(/</g,'&lt;')}</span>
  </a>`;
}

let _chatSelectedStudent=null;
let _chatMobileConvOpen=false; // mobil: ro'yxat yoki suhbat ko'rinishi — renderMentorChat() qayta chizilganda saqlanishi kerak
let _chatPollTimer=null;
let _chatLastHash='';
let _chatSearchQuery='';

function _chatHash(msgs){ return msgs.length+'|'+(_chatTs(msgs[msgs.length-1]||{})||0)+'|'+msgs.filter(m=>m.from==='mentor'&&m.read).length; }

function startChatPolling(mentorName, studentId){
  stopChatPolling();
  _chatPollTimer = setInterval(async ()=>{
    // Boshqa qurilmada yozilgan yangi xabarlar/o'qilgan-belgisini backend'dan tortib olamiz
    await _chatPollRemoteAll(['mchat_','presence_']);
    const fresh = getMentorChatMessages(mentorName, studentId);
    const h = _chatHash(fresh);
    if(h !== _chatLastHash){
      _chatLastHash = h;
      _refreshChatMessages(mentorName, studentId, fresh);
    }
    _refreshStudentListUnread(mentorName);
    _refreshChatHeaderStatus(studentId);
  }, 3000);
}

function stopChatPolling(){
  if(_chatPollTimer){ clearInterval(_chatPollTimer); _chatPollTimer=null; }
  _chatLastHash='';
}

function _refreshChatMessages(mentorName, studentId, msgs){
  const area = document.getElementById('chat-msgs-area');
  if(!area) return;
  const L=LANG;
  const atBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 60;
  const msgsHtml = _buildMentorMsgsHtml(msgs, L);
  area.innerHTML = msgsHtml;
  if(atBottom) area.scrollTop = area.scrollHeight;
  // Faqat talaba yuborgan xabarlarni "o'qildi" deb belgilaymiz — mentorning
  // o'z xabari faqat TALABA ko'rgandan keyin o'qilgan hisoblanishi kerak.
  const updated = msgs.map(m=> m.from==='student' ? {...m, read:true} : m);
  saveMentorChatMessages(mentorName, studentId, updated);
}

function _buildMentorMsgsHtml(msgs, L){
  if(!msgs.length) return `<div style="text-align:center;padding:40px 20px;color:var(--text3)"><div style="font-size:40px;margin-bottom:10px">💬</div><div>${L==='ru'?'Нет сообщений. Напишите первым!':L==='en'?'No messages yet. Say hello!':"Hali xabar yo'q. Birinchi xabarni yuboring!"}</div></div>`;
  return msgs.map(m=>{
    const isMentor=m.from==='mentor';
    const time=_chatFmtTime(m);
    return `<div style="display:flex;justify-content:${isMentor?'flex-end':'flex-start'};margin-bottom:10px">
      <div style="max-width:70%;background:${isMentor?'var(--accent)':'var(--bg2)'};color:${isMentor?'#fff':'var(--text)'};padding:10px 14px;border-radius:${isMentor?'14px 14px 4px 14px':'14px 14px 14px 4px'};font-size:13px;line-height:1.5;box-shadow:var(--shadow-sm)">
        ${_chatAttachmentHtml(m)}
        ${m.text?`<span data-emoji-ok>${m.text.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>`:''}
        <div style="font-size:10px;opacity:.7;margin-top:4px;text-align:right;display:flex;gap:4px;justify-content:flex-end;align-items:center">${time}${isMentor?' '+_chatTicks(m):''}</div>
      </div>
    </div>`;
  }).join('');
}

function _refreshStudentListUnread(mentorName){
  const myGroups=D.groups.filter(g=>g.mentor===mentorName);
  const myStudents=D.students.filter(s=>myGroups.some(g=>g.id===s.groupId)&&s.status!=='Arxiv');
  myStudents.forEach(s=>{
    const msgs=getMentorChatMessages(mentorName,s.id);
    const unread=msgs.filter(m=>!m.read&&m.from==='student').length;
    const badge=document.getElementById('chat-unread-'+s.id);
    if(badge){ badge.textContent=unread; badge.style.display=unread>0?'inline':'none'; }
    const last=msgs.length?msgs[msgs.length-1]:null;
    const timeEl=document.getElementById('chat-lasttime-'+s.id);
    if(timeEl) timeEl.textContent=last?_chatFmtTime(last):'';
    const dot=document.getElementById('chat-online-dot-'+s.id);
    if(dot){
      const online=isPresenceOnline(localStorage.getItem(_presenceKeyFor('student',s.id)));
      dot.style.background=online?'#22c55e':'transparent';
      dot.style.border=online?'none':'none';
    }
  });
  // update nav badge
  const allUnread=myStudents.reduce((n,s)=>{
    return n+getMentorChatMessages(mentorName,s.id).filter(m=>!m.read&&m.from==='student').length;
  },0);
  const navBadge=document.getElementById('nc-chat');
  if(navBadge){ navBadge.textContent=allUnread; navBadge.style.display=allUnread>0?'inline':'none'; }
}
function _refreshChatHeaderStatus(studentId){
  const el=document.getElementById('chat-header-status');
  if(!el) return;
  const online=isPresenceOnline(localStorage.getItem(_presenceKeyFor('student',studentId)));
  el.textContent = online ? '🟢 '+t('online_status') : '⚪ '+presenceLastSeenLabel(localStorage.getItem(_presenceKeyFor('student',studentId)));
  el.style.color = online ? 'var(--teal-text)' : 'var(--text3)';
}

function renderMentorChat(){
  stopChatPolling();
  const wrap=document.getElementById('mentor-chat-wrap');if(!wrap)return;
  const L=LANG;
  const cu=getCurrentUser();
  const mentorName=cu.mentorName||cu.name;
  const myGroups=D.groups.filter(g=>g.mentor===mentorName);
  let myStudents=D.students.filter(s=>myGroups.some(g=>g.id===s.groupId)&&s.status!=='Arxiv');

  if(!myStudents.length){
    wrap.innerHTML=`<div style="text-align:center;padding:60px 20px;color:var(--text3)"><div style="font-size:48px;margin-bottom:16px">💬</div><div style="font-size:16px;font-weight:600">${L==='ru'?'Нет студентов':L==='en'?'No students':"Talabalar yo'q"}</div><div style="font-size:13px;margin-top:8px">${L==='ru'?'В ваших группах пока нет студентов':L==='en'?"No students in your groups yet":"Sizning guruhlaringizda hali talabalar yo'q"}</div></div>`;
    return;
  }

  if(!_chatSelectedStudent) _chatSelectedStudent=myStudents[0].id;
  const selSt=myStudents.find(s=>s.id===_chatSelectedStudent)||myStudents[0];
  const msgs=getMentorChatMessages(mentorName, selSt.id);
  _chatLastHash = _chatHash(msgs);

  // Qidiruv filtri (ism bo'yicha) — ro'yxatni kamaytiradi, lekin tanlangan talaba har doim ko'rinadi
  const filteredStudents = _chatSearchQuery ? myStudents.filter(s=>s.name.toLowerCase().includes(_chatSearchQuery.toLowerCase())) : myStudents;

  const studentListHtml=(filteredStudents.length?filteredStudents:myStudents).map((s)=>{
    const i = myStudents.indexOf(s);
    const grp=myGroups.find(g=>g.id===s.groupId);
    const lastMsgs=getMentorChatMessages(mentorName,s.id);
    const last=lastMsgs.length?lastMsgs[lastMsgs.length-1]:null;
    const isActive=s.id===selSt.id;
    const unread=lastMsgs.filter(m=>!m.read&&m.from==='student').length;
    const lastPrefix = last ? (last.from==='mentor'?(L==='ru'?'Вы: ':L==='en'?'You: ':'Siz: '):'') : '';
    const lastBody = last ? (last.text ? last.text.substring(0,20) : (last.file?(last.file.isImage?'📷 '+t('photo_lbl'):'📎 '+t('file_lbl')):'')) : (L==='ru'?'Нет сообщений':L==='en'?'No messages':"Xabar yo'q");
    const online=isPresenceOnline(localStorage.getItem(_presenceKeyFor('student',s.id)));
    return `<div class="chat-list-row" onclick="_chatSelectedStudent=${s.id};_chatMobileConvOpen=true;renderMentorChat()" style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);background:${isActive?'var(--accent-light)':'var(--bg)'};transition:background .15s">
      <div style="position:relative;flex-shrink:0"><div class="av ${AV_CLS[i%5]}" style="width:36px;height:36px;font-size:12px">${ini(s.name)}</div><span id="chat-online-dot-${s.id}" style="position:absolute;bottom:-1px;right:-1px;width:10px;height:10px;border-radius:50%;background:${online?'#22c55e':'transparent'};border:2px solid ${online?'var(--bg2)':'transparent'}"></span></div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
          <span style="font-size:13px;font-weight:700;color:${isActive?'var(--accent-text)':'var(--text)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.name}</span>
          <span id="chat-lasttime-${s.id}" style="font-size:10px;color:var(--text3);flex-shrink:0">${last?_chatFmtTime(last):''}</span>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:2px">
          <div style="font-size:11px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${grp?grp.name+' · ':''}${lastPrefix}${lastBody}</div>
          <span id="chat-unread-${s.id}" style="background:var(--accent);color:#fff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px;flex-shrink:0;display:${unread>0?'inline':'none'}">${unread}</span>
        </div>
      </div>
    </div>`;
  }).join('');

  const msgsHtml = _buildMentorMsgsHtml(msgs, L);
  const mname = mentorName.replace(/'/g,"\\'");
  const onlineNow=isPresenceOnline(localStorage.getItem(_presenceKeyFor('student',selSt.id)));

  wrap.innerHTML=`<div class="chat-shell ${_chatMobileConvOpen?'chat-mobile-conv-open':''}" id="chat-shell">
    <div id="mentor-chat-sidebar" class="chat-sidebar">
      <div style="padding:12px 14px;border-bottom:1px solid var(--border2)">
        <div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:8px">${L==='ru'?'💬 Студенты':L==='en'?'💬 Students':'💬 Talabalar'}</div>
        <input id="chat-search-inp" value="${_chatSearchQuery.replace(/"/g,'&quot;')}" placeholder="🔍 ${t('search_label')}..." style="width:100%;padding:7px 10px;border:1.5px solid var(--border2);border-radius:10px;background:var(--bg);color:var(--text);font-size:12.5px" oninput="_chatSearchQuery=this.value;_debounce('chatSearch',()=>_rerenderPreservingFocus(renderMentorChat),200)">
      </div>
      <div style="overflow-y:auto">${studentListHtml}</div>
    </div>
    <div class="chat-conv" id="chat-conv">
      <div style="padding:12px 16px;border-bottom:1px solid var(--border2);background:var(--bg2);display:flex;align-items:center;gap:10px;flex-shrink:0">
        <button onclick="_chatMobileBack()" class="btn btn-sm chat-back-btn" id="chat-back-btn">◀</button>
        <div style="position:relative;flex-shrink:0"><div class="av ${AV_CLS[myStudents.findIndex(s=>s.id===selSt.id)%5]}" style="width:36px;height:36px;font-size:12px">${ini(selSt.name)}</div><span style="position:absolute;bottom:-1px;right:-1px;width:10px;height:10px;border-radius:50%;background:${onlineNow?'#22c55e':'transparent'};border:2px solid ${onlineNow?'var(--bg2)':'transparent'}"></span></div>
        <div style="min-width:0;flex:1">
          <div style="font-size:14px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${selSt.name}</div>
          <div id="chat-header-status" style="font-size:11px;color:${onlineNow?'var(--teal-text)':'var(--text3)'}">${onlineNow?'🟢 '+t('online_status'):'⚪ '+presenceLastSeenLabel(localStorage.getItem(_presenceKeyFor('student',selSt.id)))}</div>
        </div>
      </div>
      <div id="chat-msgs-area" class="chat-msgs-area">
        ${msgsHtml}
      </div>
      <div id="chat-emoji-picker" data-emoji-ok style="display:none;padding:10px 14px;border-top:1px solid var(--border2);background:var(--bg2);flex-wrap:wrap;gap:6px">
        ${CHAT_EMOJIS.map(e=>`<span onclick="insertChatEmoji('${e}')" style="font-size:20px;cursor:pointer;padding:4px">${e}</span>`).join('')}
      </div>
      <div style="padding:10px 14px;border-top:1px solid var(--border2);background:var(--bg2);display:flex;gap:8px;align-items:flex-end;flex-shrink:0">
        <input type="file" id="chat-file-input" style="display:none" accept="image/*,.pdf,.doc,.docx,.zip" onchange="_chatFileSelected(this,${selSt.id})">
        <button class="btn btn-sm" title="${t('attach_file')}" onclick="document.getElementById('chat-file-input').click()" style="flex-shrink:0;padding:9px 11px">📎</button>
        <button class="btn btn-sm" title="Emoji" onclick="const p=document.getElementById('chat-emoji-picker');p.style.display=p.style.display==='none'?'flex':'none'" style="flex-shrink:0;padding:9px 11px">😊</button>
        <textarea id="chat-input-text" placeholder="${L==='ru'?'Написать сообщение...':L==='en'?'Type a message...':'Xabar yozing...'}" rows="1" style="flex:1;resize:none;padding:10px 14px;border:1.5px solid var(--border2);border-radius:12px;background:var(--bg);color:var(--text);font-size:13px;font-family:inherit;outline:none" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendMentorMessage('${mname}',${selSt.id});}"></textarea>
        <button class="btn btn-primary" onclick="sendMentorMessage('${mname}',${selSt.id})" style="padding:10px 18px;align-self:stretch;flex-shrink:0">${L==='ru'?'➤':L==='en'?'➤':'➤'}</button>
      </div>
    </div>
  </div>`;

  setTimeout(()=>{const area=document.getElementById('chat-msgs-area');if(area)area.scrollTop=area.scrollHeight;},50);
  const updated=msgs.map(m=> m.from==='student' ? {...m,read:true} : m);
  saveMentorChatMessages(mentorName, selSt.id, updated);
  startChatPolling(mentorName, selSt.id);
}
// Mobil: talaba tanlanganda suhbat oynasini ko'rsatish, ro'yxatni yashirish
function _chatMobileBack(){ _chatMobileConvOpen=false; renderMentorChat(); }

function insertChatEmoji(e){
  const inp=document.getElementById('chat-input-text')||document.getElementById('student-chat-page-inp');
  if(!inp) return;
  inp.value=(inp.value||'')+e;
  inp.focus();
}
async function _chatFileSelected(input, studentId){
  const file=input.files&&input.files[0];
  if(!file) return;
  const cu=getCurrentUser();
  const mentorName=cu.mentorName||cu.name;
  try{
    const dataUrl=await _fileToDataURL(file);
    sendMentorMessage(mentorName, studentId, {name:file.name, data:dataUrl, isImage:file.type.startsWith('image/')});
  }catch(e){
    toast('⚠️ '+t('file_too_big'));
  }
  input.value='';
}
function sendMentorMessage(mentorName, studentId, fileObj){
  const inp=document.getElementById('chat-input-text');
  const text=inp?(inp.value||'').trim():'';
  if(!text && !fileObj) return;
  const msgs=getMentorChatMessages(mentorName, studentId);
  const ts=Date.now();
  const msg={from:'mentor',text,ts,time:new Date(ts).toISOString(),read:false};
  if(fileObj) msg.file=fileObj;
  msgs.push(msg);
  saveMentorChatMessages(mentorName, studentId, msgs);
  if(inp) inp.value='';
  const picker=document.getElementById('chat-emoji-picker'); if(picker) picker.style.display='none';
  _chatLastHash = _chatHash(msgs);
  _refreshChatMessages(mentorName, studentId, msgs);
}

// Also allow students to see/reply chat from their dashboard
function renderStudentChatSection(studentId){
  const cu=getCurrentUser();
  const s=D.students.find(x=>x.id===studentId);if(!s)return '';
  const grp=D.groups.find(g=>g.id===s.groupId);if(!grp||!grp.mentor)return '';
  const mentorName=grp.mentor;
  const msgs=getMentorChatMessages(mentorName, studentId);
  const onlineNow=isPresenceOnline(localStorage.getItem(_presenceKeyFor('mentor',mentorName)));
  const msgsHtml=msgs.length?msgs.map(m=>{
    const isMentor=m.from==='mentor';
    const isMe=m.from==='student';
    const time=_chatFmtTime(m);
    return `<div style="display:flex;justify-content:${isMentor?'flex-start':'flex-end'};margin-bottom:8px">
      <div style="max-width:75%;background:${isMentor?'var(--bg3)':'var(--accent)'};color:${isMentor?'var(--text)':'#fff'};padding:8px 12px;border-radius:${isMentor?'12px 12px 12px 4px':'12px 12px 4px 12px'};font-size:13px;line-height:1.5;box-shadow:var(--shadow-sm)">
        ${isMentor?`<div style="font-size:10px;font-weight:700;opacity:.7;margin-bottom:3px">🎓 ${mentorName}</div>`:''}
        ${_chatAttachmentHtml(m)}
        ${m.text?`<span data-emoji-ok>${m.text.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>`:''}
        <div style="font-size:10px;opacity:.6;text-align:right;margin-top:3px">${time}${isMe?' '+(m.read?`<span style="color:#cfe8ff;font-weight:700">✓✓</span>`:'<span style="opacity:.7">✓</span>'):''}</div>
      </div>
    </div>`;
  }).join(''):`<div style="text-align:center;padding:20px;color:var(--text3);font-size:13px">Xabar yo'q. Mentorga savol yuboring!</div>`;

  const mname=mentorName.replace(/'/g,"\\'");
  // Mentor yuborgan xabarlarni "o'qildi" deb belgilaymiz (talaba ko'rdi)
  if(msgs.some(m=>m.from==='mentor'&&!m.read)){
    const updated=msgs.map(m=>m.from==='mentor'?{...m,read:true}:m);
    saveMentorChatMessages(mentorName, studentId, updated);
  }
  return `<div style="margin-top:20px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r-lg);padding:20px 22px;box-shadow:var(--shadow-sm)">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
      <div style="font-size:15px;font-weight:800;color:var(--text)">💬 Mentor bilan chat</div>
      <span style="font-size:11px;color:${onlineNow?'var(--teal-text)':'var(--text3)'}">${onlineNow?'🟢 '+t('online_status'):''}</span>
    </div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:14px">🎓 ${mentorName}</div>
    <div id="stud-chat-msgs" style="max-height:240px;overflow-y:auto;margin-bottom:12px;padding:4px 0">${msgsHtml}</div>
    <div style="display:flex;gap:8px">
      <input type="file" id="stud-chat-file-input" style="display:none" accept="image/*,.pdf,.doc,.docx,.zip" onchange="_studentChatSectionFileSelected(this,${studentId})">
      <button class="btn btn-sm" onclick="document.getElementById('stud-chat-file-input').click()" title="${t('attach_file')}">📎</button>
      <input type="text" id="stud-chat-inp" placeholder="Savolingizni yozing..." style="flex:1;padding:9px 14px;border:1.5px solid var(--border2);border-radius:10px;background:var(--bg);color:var(--text);font-size:13px" onkeydown="if(event.key==='Enter')sendStudentMessage('${mname}',${studentId})">
      <button class="btn btn-primary btn-sm" onclick="sendStudentMessage('${mname}',${studentId})">➤</button>
    </div>
  </div>`;
}
async function _studentChatSectionFileSelected(input, studentId){
  const file=input.files&&input.files[0];
  if(!file) return;
  const cu=getCurrentUser();
  const s=D.students.find(x=>x.id===studentId);
  const grp=s?D.groups.find(g=>g.id===s.groupId):null;
  if(!grp||!grp.mentor) return;
  try{
    const dataUrl=await _fileToDataURL(file);
    const msgs=getMentorChatMessages(grp.mentor, studentId);
    const ts=Date.now();
    msgs.push({from:'student',text:'',ts,time:new Date(ts).toISOString(),read:false,file:{name:file.name,data:dataUrl,isImage:file.type.startsWith('image/')}});
    saveMentorChatMessages(grp.mentor, studentId, msgs);
    const chatWrap=document.getElementById('stud-chat-section');
    if(chatWrap){chatWrap.innerHTML=renderStudentChatSection(studentId);}
  }catch(e){ toast('⚠️ '+t('file_too_big')); }
  input.value='';
}

function sendStudentMessage(mentorName, studentId){
  const inp=document.getElementById('stud-chat-inp');if(!inp)return;
  const text=(inp.value||'').trim();if(!text)return;
  const msgs=getMentorChatMessages(mentorName, studentId);
  const ts=Date.now();
  msgs.push({from:'student',text,ts,time:new Date(ts).toISOString(),read:false});
  saveMentorChatMessages(mentorName, studentId, msgs);
  inp.value='';
  const chatWrap=document.getElementById('stud-chat-section');
  if(chatWrap){chatWrap.innerHTML=renderStudentChatSection(studentId);}
  setTimeout(()=>{const a=document.getElementById('stud-chat-msgs');if(a)a.scrollTop=a.scrollHeight;},30);
}

// ===================== MENTOR — GURUHLAR SAHIFASI =====================
// Mentor o'ziga tegishli guruhlarni ko'radi va keraklisini tanlab
// to'g'ridan-to'g'ri davomat qiladi (showGroupStudents → davomat jadvali).
let _mgQuery='',_mgStatus='';
function setMentorGroupSearch(v){_mgQuery=(v||'').toLowerCase();renderMentorGroupsList();}
function setMentorGroupStatus(v){_mgStatus=v||'';renderMentorGroupsList();}

function _mentorOwnGroups(){
  const cu=getCurrentUser();
  const mentorName=cu.mentorName||cu.name||'';
  return (D.groups||[]).filter(g=>g.mentor===mentorName);
}

function renderMentorGroups(){
  const wrap=document.getElementById('mentor-groups-wrap');if(!wrap)return;
  const L=LANG;
  const cu=getCurrentUser();
  const mentorName=cu.mentorName||cu.name||'';
  const all=_mentorOwnGroups();
  const totalStudents=(D.students||[]).filter(s=>all.some(g=>g.id===s.groupId)).length;
  const activeCnt=all.filter(g=>g.status==='Faol').length;

  wrap.innerHTML=`
    <div style="background:linear-gradient(135deg,var(--accent),#1d4ed8);border-radius:18px;padding:22px 24px;color:#fff;margin-bottom:20px;position:relative;overflow:hidden">
      <div style="position:absolute;right:-18px;top:-18px;font-size:100px;opacity:.12;pointer-events:none">👥</div>
      <div style="font-size:22px;font-weight:900;margin-bottom:4px">👥 ${L==='ru'?'Мои группы':L==='en'?'My Groups':'Mening guruhlarim'}</div>
      <div style="font-size:13px;opacity:.9">🎓 ${mentorName||'—'} · ${all.length} ${L==='ru'?'групп':L==='en'?'groups':'ta guruh'} · 🧑‍💻 ${totalStudents} ${L==='ru'?'студентов':L==='en'?'students':'ta talaba'} · ✅ ${activeCnt} ${L==='ru'?'активных':L==='en'?'active':'faol'}</div>
    </div>
    <div class="toolbar">
      <div class="search-box">
        <input type="text" id="s-mentor-group" placeholder="${L==='ru'?'Поиск группы...':L==='en'?'Search group...':'Guruh qidirish...'}" oninput="setMentorGroupSearch(this.value)">
      </div>
      <select class="fsel" id="fmg-status" onchange="setMentorGroupStatus(this.value)">
        <option value="">${L==='ru'?'Все статусы':L==='en'?'All status':'Barcha holat'}</option>
        <option value="Faol">✅ Faol</option>
        <option value="Arxiv">📦 Arxiv</option>
        <option value="Man etilgan">🚫 Man etilgan</option>
      </select>
    </div>
    <div class="card-grid" id="mentor-group-grid"></div>`;
  const sInp=document.getElementById('s-mentor-group');
  if(sInp&&_mgQuery)sInp.value=_mgQuery;
  const stSel=document.getElementById('fmg-status');
  if(stSel&&_mgStatus)stSel.value=_mgStatus;
  renderMentorGroupsList();
}

function renderMentorGroupsList(){
  const grid=document.getElementById('mentor-group-grid');if(!grid)return;
  const L=LANG;
  const now=new Date();
  const curYear=now.getFullYear(),curMonth=now.getMonth();
  const DAY_JS=['Yak','Du','Se','Ch','Pa','Ju','Sh'];
  const todayCode=DAY_JS[now.getDay()];

  let items=_mentorOwnGroups().filter(g=>{
    const q=_mgQuery;
    const mQ=!q||(g.name||'').toLowerCase().includes(q)||(g.course||'').toLowerCase().includes(q);
    const mS=!_mgStatus||g.status===_mgStatus;
    return mQ&&mS;
  });
  // Bugun darsi bor guruhlar birinchi
  items.sort((a,b)=>{
    const at=(a.days||[]).includes(todayCode)?0:1;
    const bt=(b.days||[]).includes(todayCode)?0:1;
    if(at!==bt)return at-bt;
    return (a.name||'').localeCompare(b.name||'');
  });

  if(!items.length){
    grid.innerHTML=`<div class="empty"><div class="empty-ic">👥</div><div class="empty-txt">${L==='ru'?'Групп не найдено':L==='en'?'No groups found':'Guruh topilmadi'}</div></div>`;
    return;
  }

  grid.innerHTML=items.map(g=>{
    const gStudents=(D.students||[]).filter(s=>s.groupId===g.id);
    const gActive=gStudents.filter(s=>s.status==='Aktiv').length;
    const gDebtors=gStudents.filter(s=>s.isDebtor).length;
    const timeStr=(g.timeStart&&g.timeEnd)?g.timeStart+'–'+g.timeEnd:'—';
    const daysHtml=(g.days||[]).map(d=>`<span class="day-pill">${d}</span>`).join('');
    const isToday=(g.days||[]).includes(todayCode);
    const statusBadge=g.status==='Man etilgan'?'b-orange':g.status==='Faol'?'b-teal':'b-gray';
    // Shu oylik davomat foizi
    const attKey='att_'+g.id+'_'+curYear+'_'+curMonth;
    const groupAtt=(D.attendance&&D.attendance[attKey])||{};
    let p=0,mk=0,marked=0;
    gStudents.forEach(s=>{
      const sAtt=groupAtt['s'+s.id]||{};
      for(let l=1;l<=LESSON_COUNT;l++){const v=sAtt['l'+l]||'';if(v==='K'){p++;mk++;}else if(v==='Y')mk++;}
      if(Object.keys(sAtt).length)marked++;
    });
    const pct=mk>0?Math.round(p/mk*100):null;
    const pctColor=pct===null?'var(--text3)':pct>=80?'var(--teal-text)':pct>=50?'var(--amber-text)':'#ea580c';
    return `<div class="card">
      <div class="card-head">
        <div class="card-title">${g.name}${isToday?` <span class="badge b-blue" style="font-size:10px">${L==='ru'?'сегодня':L==='en'?'today':'bugun'}</span>`:''}</div>
        <span class="badge ${statusBadge}">${g.status}</span>
      </div>
      <div class="card-body">
        <div><span>📚 ${L==='ru'?'Курс:':L==='en'?'Course:':'Kurs:'}</span><b>${g.course||'—'}</b></div>
        <div><span>🧑‍💻 ${L==='ru'?'Студенты:':L==='en'?'Students:':'Talabalar:'}</span><b><span class="badge b-blue" onclick="_attMonth=null;showGroupStudents(${g.id})" style="cursor:pointer;font-size:12px">${gStudents.length} ta →</span></b></div>
        <div><span>✅ ${L==='ru'?'Активные:':L==='en'?'Active:':'Aktiv:'}</span><b>${gActive}${gDebtors>0?` · 💸 ${gDebtors} ${L==='ru'?'долж.':L==='en'?'debtors':'qarzdor'}`:''}</b></div>
        <div><span>📋 ${L==='ru'?'Посещаемость (мес):':L==='en'?'Attendance (month):':'Davomat (shu oy):'}</span><b style="color:${pctColor}">${pct===null?(L==='ru'?'ещё нет':L==='en'?'not marked':'belgilanmagan'):pct+'%'}</b></div>
        <div><span>🚪 ${L==='ru'?'Кабинет:':L==='en'?'Room:':'Xona:'}</span><b>${g.room||'—'}</b><span style="margin-left:8px">⏰</span><b>${timeStr}</b></div>
        <div class="days-badges" style="margin-top:10px">${daysHtml}</div>
      </div>
      <div class="card-foot">
        <button class="btn btn-sm btn-primary" onclick="_attMonth=null;showGroupStudents(${g.id})" style="font-weight:800">${L==='ru'?'📋 Отметить посещаемость':L==='en'?'📋 Take attendance':'📋 Davomat qilish'}</button>
        <button class="btn btn-sm" onclick="showMentorGroupRating(${g.id})" style="background:var(--purple-light);color:var(--purple-text);border-color:rgba(124,58,237,.3)">🏆 ${L==='ru'?'Рейтинг':L==='en'?'Rating':'Reyting'}</button>
        <button class="btn btn-sm" onclick="go('grades',document.getElementById('nav-grades-mentor'));setTimeout(()=>selectGradeGroup(${g.id}),150)" style="background:var(--amber-light);color:var(--amber-text);border-color:rgba(217,119,6,.3)">🏅 ${L==='ru'?'Оценки':L==='en'?'Grades':'Baholash'}</button>
        <button class="btn btn-sm" onclick="go('tests',document.getElementById('nav-tests-mentor'));setTimeout(()=>filterTestsByGroup(${g.id}),150)" style="background:var(--teal-light);color:var(--teal-text);border-color:rgba(13,148,136,.3)">${L==='ru'?'📝 Тесты':L==='en'?'📝 Tests':'📝 Testlar'}</button>
      </div>
    </div>`;
  }).join('');
}
window.renderMentorGroups=renderMentorGroups;
window.renderMentorGroupsList=renderMentorGroupsList;
window.setMentorGroupSearch=setMentorGroupSearch;
window.setMentorGroupStatus=setMentorGroupStatus;
