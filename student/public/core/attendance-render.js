// ===================== ATTENDANCE (FIX #3) =====================
let _attGid=null,_attMonth=null,_attYear=null;
function showGroupStudents(gid){
  const g=D.groups.find(x=>x.id===gid);if(!g)return;
  _attGid=gid;window._attGid=gid;
  if(_attMonth===null){const now=new Date();_attYear=now.getFullYear();_attMonth=now.getMonth();}
  document.getElementById('stat-modal-title').textContent=g.name+' — 📋 Davomat';
  const cnt=D.students.filter(s=>s.groupId===gid).length;
  document.getElementById('att-group-info').textContent=g.course+' · 🎓 '+g.mentor+' · 🚪 Xona '+g.room+' · 👥 '+cnt+' ta talaba';
  _renderAttMonthNav();_renderAttTable(gid,_attMonth,_attYear);
  document.getElementById('stat-overlay').classList.add('open');
}

function _renderAttMonthNav(){
  const nav=document.getElementById('att-month-nav');
  const monthNames=getMonthNames(true);
  // FIX #5: Support multiple years in attendance too
  const curYear=_attYear||new Date().getFullYear();
  const years=[2025, 2026, new Date().getFullYear()].filter((v,i,a)=>a.indexOf(v)===i).sort();

  let html='';
  // Year selector
  html+=`<div style="display:flex;align-items:center;gap:4px;padding:4px 8px;border-right:1px solid var(--border);flex-shrink:0">`;
  years.forEach(y=>{
    html+=`<button class="att-month-btn ${y===curYear?'att-month-active':''}" onclick="_setAttYear(${y})" style="font-weight:800">${y}</button>`;
  });
  html+=`</div>`;
  // Month buttons
  monthNames.forEach((m,idx)=>{
    html+=`<button class="att-month-btn ${idx===_attMonth&&curYear===_attYear?'att-month-active':''}" onclick="_setAttMonth(${idx},${curYear})">${m}</button>`;
  });

  nav.innerHTML=html;
  setTimeout(()=>{const a=nav.querySelector('.att-month-active');if(a)a.scrollIntoView({block:'nearest',inline:'center',behavior:'smooth'});},50);
}

window._setAttYear=function(y){_attYear=y;_renderAttMonthNav();_renderAttTable(_attGid,_attMonth,_attYear);};
function _setAttMonth(month,year){_attMonth=month;_attYear=year;_renderAttMonthNav();_renderAttTable(_attGid,_attMonth,_attYear);}

function _renderAttTable(gid,month,year){
  if(!D.attendance)D.attendance={};
  const attKey='att_'+gid+'_'+year+'_'+month;
  if(!D.attendance[attKey])D.attendance[attKey]={};
  const students=D.students.filter(s=>s.groupId===gid);
  const grp=D.groups.find(x=>x.id===gid);

  // FIX #3: Show full date in month label e.g. "1-yanvar, 2026-yil"
  const monthLabel=getMonthName(month,false)+' '+year;
  const coursePrice=grp?getCoursePrice(grp.course):0;
  const lessonPrice=coursePrice>0?Math.round(coursePrice/LESSON_COUNT):0;

  if(!students.length){document.getElementById('att-table-wrap').innerHTML=`<div class="empty"><div class="empty-ic">🧑‍💻</div><div class="empty-txt">Ma'lumot yo'q</div></div>`;return;}

  const statusBadge={Aktiv:'b-teal',Faolsiz:'b-gray',Muzlatilgan:'b-blue',Probatsiya:'b-amber',Arxiv:'b-purple'};
  const COL_W=46,NAME_W=180,RESULT_W=240,COIN_W=160;
  const minW=NAME_W+LESSON_COUNT*COL_W+COIN_W+RESULT_W;
  // Coin system — har guruh uchun ALOHIDA balans ko'rsatamiz
  const _cs=window.coinShop||{getMentorBal:function(){return 0;},getMentorGroupBal:function(){return 0;},getStudentBal:function(){return 0;},setMentorBal:function(){},setStudentBal:function(){}};
  const _cu2=window.getCurrentUser?window.getCurrentUser():{};
  const _mName=_cu2.mentorName||_cu2.name||'';
  const _mNameJs=_mName.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const _mBal=_cs.getMentorGroupBal?_cs.getMentorGroupBal(_mName,gid):_cs.getMentorBal(_mName);
  const _grpName=grp?grp.name:'';

  // FIX #3: Generate lesson column headers with dates
  // Calculate dates for each lesson based on group's schedule days and month
  function getLessonDates(groupDays, yr, mon){
    const dayMap={Du:1,Se:2,Ch:3,Pa:4,Ju:5,Sh:6}; // 0=Sun,1=Mon...6=Sat
    const days=(groupDays||[]).map(d=>dayMap[d]||0).filter(d=>d>0);
    if(!days.length) return Array.from({length:LESSON_COUNT},(_,i)=>null);
    const dates=[];
    const daysInMonth=new Date(yr,mon+1,0).getDate();
    for(let day=1;day<=daysInMonth&&dates.length<LESSON_COUNT;day++){
      const dt=new Date(yr,mon,day);
      if(days.includes(dt.getDay())) dates.push(day);
    }
    // Pad if needed
    while(dates.length<LESSON_COUNT) dates.push(null);
    return dates;
  }

  const lessonDates=getLessonDates(grp?grp.days:[],year,month);

  let th=`<th style="min-width:${NAME_W}px;text-align:left;padding:10px 14px;font-size:12px;font-weight:700;color:var(--text2);border-bottom:2px solid var(--border2);position:sticky;left:0;background:var(--bg2);z-index:3;white-space:nowrap;box-shadow:2px 0 4px rgba(0,0,0,.06)">Talaba <span style="font-weight:400;color:var(--text3)">(${monthLabel})</span></th>`;
  for(let l=1;l<=LESSON_COUNT;l++){
    const d=lessonDates[l-1];
    // FIX #3: Show date under lesson number
    const dateStr=d?`<div style="font-size:9px;color:var(--text3);margin-top:2px">${d}-${getMonthName(month,true).slice(0,3)}</div>`:'';
    th+=`<th style="min-width:${COL_W}px;text-align:center;padding:6px 3px;font-size:12px;font-weight:700;color:var(--text2);border-bottom:2px solid var(--border2)">${l}${dateStr}</th>`;
  }
  // Coin ustuni — 12-darsdan keyin, Natijadan oldin
  th+=`<th style="min-width:${COIN_W}px;text-align:center;padding:8px 6px;font-size:11px;font-weight:700;color:var(--text2);border-bottom:2px solid var(--border);background:linear-gradient(135deg,rgba(245,158,11,0.12),rgba(217,119,6,0.08));letter-spacing:.04em"><div style="font-size:12px;font-weight:800;color:#d97706">🪙 Coin</div><div style="font-size:10px;font-weight:700;color:#f59e0b;margin-top:2px" title="Faqat shu guruh balansi">📚 ${_grpName}: <span id="att-mentor-bal-hdr">${_mBal}</span>🪙</div></th>`;
  th+=`<th style="min-width:${RESULT_W}px;text-align:center;padding:8px 6px;font-size:11px;font-weight:700;color:var(--text2);border-bottom:2px solid var(--border2);position:sticky;right:0;background:var(--bg2);z-index:3;box-shadow:-2px 0 4px rgba(0,0,0,.06)">Natija · To'lov</th>`;

  let rows='';
  students.forEach((s,idx)=>{
    const sKey='s'+s.id;
    if(!D.attendance[attKey][sKey])D.attendance[attKey][sKey]={};
    const sAtt=D.attendance[attKey][sKey];
    let present=0,absent=0,excused=0;
    for(let l=1;l<=LESSON_COUNT;l++){const v=sAtt['l'+l]||'';if(v==='K')present++;else if(v==='Y')absent++;else if(v==='S')excused++;}
    const marked=present+absent+excused;const payLessons=present+absent+excused;// K, Y va S — uchalasi ham to'lovga kiradi
    const pct=marked>0?Math.round(present/marked*100):0;
    const pctColor=pct>=80?'var(--teal-text)':pct>=60?'var(--amber-text)':'var(--orange-text)';
    const toPay=payLessons*lessonPrice;const isFullAtt=(marked>=LESSON_COUNT);
    let cells='';
    for(let l=1;l<=LESSON_COUNT;l++){
      const v=sAtt['l'+l]||'';
      const styleMap={'':'background:var(--bg3);border-color:var(--border2);color:var(--text3)','K':'background:var(--teal-light);border-color:var(--teal);color:var(--teal-text)','Y':'background:var(--amber-light);border-color:var(--amber);color:var(--amber-text)','S':'background:var(--purple-light);border-color:var(--purple);color:var(--purple-text)'};
      const labelMap={'':'·','K':'K','Y':'Y','S':'S'};
      // FIX #3: Show date tooltip on hover
      const dateD=lessonDates[l-1];
      const dateTip=dateD?fmtAttDate(dateD,month,year):'';

      const _coinSection = ''; // Coin faqat alohida ustunda
      const tooltipHtml=`<div class="att-tip" id="tip-${attKey}-${sKey}-l${l}"><div class="att-tip-row"><button class="att-tip-btn att-tip-k" onclick="event.stopPropagation();setAtt('${attKey}','${sKey}','l${l}','K')">K</button><button class="att-tip-btn att-tip-y" onclick="event.stopPropagation();setAtt('${attKey}','${sKey}','l${l}','Y')">Y</button><button class="att-tip-btn att-tip-s" onclick="event.stopPropagation();setAtt('${attKey}','${sKey}','l${l}','S')">S</button><button class="att-tip-btn att-tip-clear" onclick="event.stopPropagation();setAtt('${attKey}','${sKey}','l${l}','')">✕</button>${dateTip?`<span style="font-size:10px;color:var(--text3);margin-left:4px">${dateTip}</span>`:''}</div>${_coinSection}</div>`;
      cells+=`<td style="text-align:center;padding:5px 3px;border-bottom:1px solid var(--border)"><div class="att-cell-wrap" onclick="event.stopPropagation();toggleAttTip('tip-${attKey}-${sKey}-l${l}')"><button style="${styleMap[v]||styleMap['']};display:inline-flex;align-items:center;justify-content:center;width:34px;height:30px;border-radius:6px;border:1.5px solid;cursor:pointer;font-size:12px;font-weight:700;font-family:'JetBrains Mono',monospace;transition:all .12s;" title="${dateTip}">${labelMap[v]||'·'}</button>${tooltipHtml}</div></td>`;
    }
    const resultHtml=`<div style="font-size:12px;font-weight:800;color:${pctColor};margin-bottom:4px">${pct}% davomat</div><div style="display:flex;justify-content:center;gap:4px;margin-bottom:5px;flex-wrap:wrap"><span style="font-size:10px;padding:2px 6px;border-radius:10px;background:var(--teal-light);color:var(--teal-text);font-weight:700">K:${present}</span><span style="font-size:10px;padding:2px 6px;border-radius:10px;background:var(--amber-light);color:var(--amber-text);font-weight:700">Y:${absent}</span><span style="font-size:10px;padding:2px 6px;border-radius:10px;background:var(--purple-light);color:var(--purple-text);font-weight:700">S:${excused}</span><span style="font-size:10px;padding:2px 6px;border-radius:10px;background:var(--bg4);color:var(--text2);font-weight:700">📚${marked}/${LESSON_COUNT}</span></div>${isFullAtt?`<div style="font-size:10px;padding:3px 8px;border-radius:10px;background:var(--orange-light);color:var(--orange-text);font-weight:700;margin-bottom:5px">💸 Qarzdor</div>`:''}${lessonPrice>0?`<div style="font-size:10px;color:var(--text3);font-weight:500;margin-bottom:2px">${payLessons} dars × ${fmtMoney(lessonPrice)} so'm</div><div style="font-size:13px;font-weight:800;color:${toPay>0?'var(--orange-text)':'var(--teal-text)'}">💰 ${fmtMoney(toPay)} so'm</div>`:''}`;
    const _sBalRow = _cs.getStudentBal(s.id);
    const _coinBg = idx%2===0 ? 'var(--bg2)' : 'var(--bg3)';
    // Compact coin cell — faqat bitta joy: balans + input + tugma
    const coinCellHtml = `<td style="text-align:center;padding:5px 8px;border-bottom:1px solid var(--border);background:${_coinBg};min-width:150px">
        <div style="display:flex;align-items:center;gap:5px;justify-content:center">
          <div style="display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:10px;background:linear-gradient(135deg,rgba(245,158,11,0.18),rgba(217,119,6,0.12));border:1.5px solid rgba(251,191,36,0.5);color:#d97706;font-weight:800;font-size:13px;min-width:44px;justify-content:center" title="Talaba coini">🪙<span id="sc-bal-${s.id}">${_sBalRow}</span></div>
          <input id="sc-inp-${s.id}-row" type="number" step="1" placeholder="±" title="Musbat son — coin berish, manfiy son (masalan -50) — qaytarib olish" onclick="event.stopPropagation()" style="width:54px;padding:3px 4px;border:1.5px solid rgba(245,158,11,0.45);border-radius:6px;font-size:12px;font-weight:700;text-align:center;outline:none;background:var(--bg3);color:var(--text)">
          <button class="cs-mini-btn" onclick="event.stopPropagation();window.csGiveCoinFromCell(${s.id},'${_mNameJs}','${s.id}-row',1)" title="Coin berish" style="padding:3px 8px;border-radius:6px;border:none;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;font-size:13px;font-weight:900;cursor:pointer;box-shadow:0 2px 6px rgba(245,158,11,0.3);line-height:1">✓</button>
          <button class="cs-mini-btn" onclick="event.stopPropagation();window.csTakeCoinFromCell(${s.id},'${_mNameJs}','${s.id}-row')" title="Coinni qaytarib olish (minus)" style="padding:3px 8px;border-radius:6px;border:none;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;font-size:14px;font-weight:900;cursor:pointer;box-shadow:0 2px 6px rgba(234,88,12,0.3);line-height:1">−</button>
        </div>
      </td>`;
    const rowBg=idx%2===0?'background:var(--bg2)':'background:var(--bg3)';
    rows+=(() => {
      return `<tr style="${rowBg};transition:background .15s" onmouseover="this.style.background='var(--accent-light)'" onmouseout="this.style.background='${idx%2===0?'var(--bg2)':'var(--bg3)'}'"><td style="padding:8px 14px;border-bottom:1px solid var(--border);position:sticky;left:0;${rowBg};z-index:1;box-shadow:2px 0 4px rgba(0,0,0,.04)"><div style="display:flex;align-items:center;gap:8px"><div class="av ${AV_CLS[idx%5]}" style="width:30px;height:30px;font-size:10px;flex-shrink:0">${ini(s.name)}</div><div style="min-width:0"><div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:115px">${s.name}</div><span class="badge ${statusBadge[s.status]||'b-gray'}" style="font-size:9px;padding:2px 5px;margin-top:2px;display:inline-block">${s.status}</span>${isFullAtt?`<span class="badge b-orange" style="font-size:9px;padding:2px 5px;margin-top:2px;display:inline-block">💸</span>`:''}</div></div></td>${cells}${coinCellHtml}<td style="text-align:center;padding:6px 10px;border-bottom:1px solid var(--border);position:sticky;right:0;${rowBg};z-index:1;box-shadow:-2px 0 4px rgba(0,0,0,.04)">${resultHtml}</td></tr>`;
    })();
  });

  let footTotalToPay=0;
  students.forEach(s=>{const sKey='s'+s.id;const sAtt=(D.attendance[attKey][sKey])||{};let pay=0;for(let l=1;l<=LESSON_COUNT;l++){const v=sAtt['l'+l]||'';if(v==='K'||v==='Y'||v==='S')pay++;}footTotalToPay+=pay*lessonPrice;});
  const footRow=lessonPrice>0?`<tr style="background:var(--bg3)"><td colspan="${LESSON_COUNT+4}" style="padding:10px 14px;font-size:12px;font-weight:600;color:var(--text2);border-top:2px solid var(--border2)">📊 ${monthLabel} · 1 dars = <b style="color:var(--accent-text)">${fmtMoney(lessonPrice)} so'm</b> · Jami: <b style="color:var(--orange-text)">${fmtMoney(footTotalToPay)} so'm</b></td></tr>`:'';
  document.getElementById('att-table-wrap').innerHTML=`<div class="att-table-scroll"><table style="width:100%;border-collapse:collapse;min-width:${minW}px;background:var(--bg2)"><thead style="position:sticky;top:0;z-index:4;background:var(--bg2)"><tr>${th}</tr></thead><tbody>${rows}${footRow}</tbody></table></div>`;
}

window.toggleAttTip=function(tipId){const tip=document.getElementById(tipId);if(!tip)return;const isOpen=tip.classList.contains('open');document.querySelectorAll('.att-tip.open').forEach(t_=>t_.classList.remove('open'));if(!isOpen)tip.classList.add('open');};
document.addEventListener('click',function(){document.querySelectorAll('.att-tip.open').forEach(t_=>t_.classList.remove('open'));});
window.setAtt=function(attKey,sKey,lKey,val){
  if(!D.attendance)D.attendance={};
  if(!D.attendance[attKey])D.attendance[attKey]={};
  if(!D.attendance[attKey][sKey])D.attendance[attKey][sKey]={};
  if(!val)delete D.attendance[attKey][sKey][lKey];else D.attendance[attKey][sKey][lKey]=val;
  saveData();
  const studentId=parseInt(sKey.replace('s',''));if(!isNaN(studentId))checkAndMarkDebtorIfFullAttendance(studentId);
  const ind=document.getElementById('att-save-indicator');if(ind){ind.textContent='✅ Saqlandi';clearTimeout(ind._t);ind._t=setTimeout(()=>ind.textContent='',2000);}
  _renderAttTable(_attGid,_attMonth,_attYear);
};

function calcStudentMonthStats(studentId,groupId,year,month){
  const attKey='att_'+groupId+'_'+year+'_'+month;
  const sKey='s'+studentId;
  const sAtt=(D.attendance[attKey]&&D.attendance[attKey][sKey])||{};
  let present=0,absent=0,excused=0;
  for(let l=1;l<=LESSON_COUNT;l++){const v=sAtt['l'+l]||'';if(v==='K')present++;else if(v==='Y')absent++;else if(v==='S')excused++;}
  const marked=present+absent+excused;const payLessons=present+absent+excused;// S ham yechiladi
  return{present,absent,excused,marked,payLessons};
}
function calcStudentAllMonthsDebt(studentId,groupId){
  const results=[];
  const grp=D.groups.find(x=>x.id===groupId);if(!grp)return results;
  const coursePrice=getCoursePrice(grp.course);
  const lessonPrice=coursePrice>0?Math.round(coursePrice/LESSON_COUNT):0;
  for(let yr=2025;yr<=new Date().getFullYear()+1;yr++){
    for(let m=0;m<12;m++){
      const stats=calcStudentMonthStats(studentId,groupId,yr,m);
      if(stats.marked>0){
        const toPay=stats.payLessons*lessonPrice;
        const isFullMonth=(stats.marked>=LESSON_COUNT);
        results.push({month:m,year:yr,label:getMonthName(m,false)+' '+yr,...stats,coursePrice,lessonPrice,toPay,isFullMonth});
      }
    }
  }
  return results;
}
// Bitta talaba uchun "12 dars to'lgan" holatini D.attendance asosida tekshiradi.
// isDebtor doim shu funksiya orqali HISOBLANADI (saqlangan flagga ishonib qolinmaydi),
// shu sababli mentor/admin/student panellari orasida holat hech qachon farq qilmaydi.
function _studentHasFullAttendanceMonth(studentId,groupId){
  if(!groupId)return false;
  for(let yr=2025;yr<=new Date().getFullYear()+1;yr++){
    for(let month=0;month<12;month++){
      const stats=calcStudentMonthStats(studentId,groupId,yr,month);
      if(stats.marked>=LESSON_COUNT)return true;
    }
  }
  return false;
}
// Barcha talabalar uchun isDebtor/status ni D.attendance asosida qayta hisoblaydi
// va D ichidagi saqlangan qiymatlar bilan solishtirib, kerak bo'lsagina saveData() qiladi.
// Bu funksiya har bir render (renderStudents, renderDashboard, syncFromBackend, jadval)
// chaqirilishidan OLDIN ishga tushishi kerak — shunda mentor tarafda belgilangan
// 12-darslik to'liq davomat ADMIN va STUDENT panellarida ham bir xil ko'rinadi,
// va bu hech qachon eskirgan (stale) lokal flagga bog'liq bo'lib qolmaydi.
function recomputeAllDebtStatuses(opts){
  if(!D||!D.students||!D.students.length)return false;
  const silent=opts&&opts.silent;
  let anyChanged=false;
  const newlyDebted=[];
  D.students.forEach(s=>{
    if(!s.groupId)return;
    const shouldBeDebtor=_studentHasFullAttendanceMonth(s.id,s.groupId);
    if(shouldBeDebtor&&!s.isDebtor){
      s.isDebtor=true;anyChanged=true;newlyDebted.push(s.name);
      if(s.status==='Aktiv'){s.status='Probatsiya';}
    }
    // Eslatma: isDebtor=true → false ga avtomatik qaytarilmaydi — buni faqat
    // markStudentPaid() (qo'lda "To'landi" tugmasi) orqali yopamiz, chunki
    // to'lov qabul qilingani har doim inson tasdig'ini talab qiladi.
  });
  if(anyChanged){
    saveData();
    if(typeof updateCounts==='function')updateCounts();
    if(typeof renderStudents==='function')renderStudents();
    if(typeof renderDashboard==='function')renderDashboard();
    if(!silent&&newlyDebted.length&&typeof toast==='function'){
      toast('💸 '+newlyDebted.join(', ')+' — Probatsiya + Qarzdor belgilandi!');
    }
  }
  return anyChanged;
}
function checkAndMarkDebtorIfFullAttendance(studentId){
  // Bitta talaba uchun chaqirilganda ham, butun ro'yxat bo'yicha qayta hisoblaymiz —
  // shunda boshqa joyda (masalan boshqa oy/guruh) qarzdor bo'lib qolgan talabalar ham
  // o'tkazib yuborilmaydi.
  recomputeAllDebtStatuses();
}
function markStudentPaid(studentId){
  const s=D.students.find(x=>x.id===studentId);if(!s)return;
  const grp=D.groups.find(x=>x.id===s.groupId);
  if(grp){
    const totalToPay=calcStudentAllMonthsDebt(s.id,s.groupId).reduce((sum,m)=>sum+m.toPay,0);
    if(totalToPay>0&&!D.finance)D.finance=[];
    if(totalToPay>0){
      D.finance.push({
        id:newId(),type:'income',
        title:s.name+' — To\'lov',
        description:grp.name+' guruhi · '+grp.course,
        amount:totalToPay,
        date:new Date().toISOString(),
        studentId:s.id,
        createdAt:new Date().toISOString()
      });
    }
  }
  for(let yr=2025;yr<=new Date().getFullYear()+1;yr++){
    for(let month=0;month<12;month++){
      const attKey='att_'+s.groupId+'_'+yr+'_'+month;const sKey='s'+studentId;
      if(!D.attendance[attKey]||!D.attendance[attKey][sKey])continue;
      const stats=calcStudentMonthStats(studentId,s.groupId,yr,month);
      if(stats.marked>=LESSON_COUNT)D.attendance[attKey][sKey]={};
    }
  }
  s.isDebtor=false;s.status='Aktiv';
  saveData();updateCounts();renderStudents();renderDashboard();
  // Davomat (attendance) jadvali ochiq bo'lsa — statusni shu yerda ham darhol
  // yangilaymiz, shunda "To'lov -> Aktiv" o'zgarishi davomatda ham ko'rinadi.
  if(_attGid===s.groupId&&typeof _renderAttTable==='function'){
    _renderAttTable(_attGid,_attMonth,_attYear);
  }
  toast('✅ '+s.name+' — To\'lov qabul qilindi!');
  openDetailStudent(studentId);
}

// ===================== RENDER COURSES (FIX #3) =====================
function renderCourses(){
  const q=(document.getElementById('s-course').value||'').toLowerCase();
  const items=D.courses.filter(c=>c.name.toLowerCase().includes(q));
  const g=document.getElementById('course-grid');
  if(!items.length){g.innerHTML=`<div class="empty"><div class="empty-ic">📚</div><div class="empty-txt">Kurs topilmadi</div></div>`;return;}
  g.innerHTML=items.map((c,i)=>{
    const grps=D.groups.filter(gr=>gr.course===c.name).length;
    const stds=D.students.filter(s=>studentCourse(s)===c.name).length;
    const lp=getLessonPrice(c.name);
    // FIX #3: Show full course info - duration, price, lesson price, rule
    return `<div class="card ${COURSE_TOP[i%5]}">
      <div class="card-head">
        <div class="card-title">${c.name}</div>
        <span class="badge ${c.status==='Faol'?COURSE_COLORS[i%7]:'b-gray'}">${c.status}</span>
      </div>
      <div class="card-body">
        <div><span>⏱ Davomiyligi:</span><b>${c.duration}</b></div>
        <div><span>💰 Kurs narxi:</span><b>${c.price} so'm</b></div>
        <div><span>📐 1 dars narxi:</span><b>${fmtMoney(lp)} so'm</b></div>
        <div><span>👥 Guruhlar:</span><b>${grps} ta guruh</b></div>
        <div><span>🧑‍💻 Talabalar:</span><b>${stds} ta talaba</b></div>
        <div style="margin-top:8px;padding:8px 10px;background:var(--accent-light);border-radius:var(--r-sm);font-size:11px;color:var(--accent-text);line-height:1.6">
          💡 <b>To'lov qoidasi:</b> K va Y — yechiladi · S — yechilmaydi · 12 dars = Qarzdor
        </div>
      </div>
      <div class="card-foot">
        <button class="btn btn-sm" onclick="editItem('course',${c.id})">✏️ Tahrirlash</button>
        <button class="btn btn-sm btn-del-outline" onclick="showDelModal('${c.name.replace(/'/g,"\\'")}',()=>execDelCourse(${c.id}))">🗑 O'chirish</button>
      </div>
    </div>`;
  }).join('');
}

// ===================== RENDER GROUPS =====================
function resetGroupPage(){groupPage=1;}
function renderGroups(){
  const q=(document.getElementById('s-group').value||'').toLowerCase();
  const fc=(document.getElementById('fg-course')?.value||'');
  const fm=(document.getElementById('fg-mentor')?.value||'');
  const fd=(document.getElementById('fg-duration')?.value||'');
  const fday=(document.getElementById('fg-days')?.value||'');
  const fst=(document.getElementById('fg-status')?.value||'');
  let items=D.groups.filter(g=>{
    const mQ=!q||g.name.toLowerCase().includes(q)||g.course.toLowerCase().includes(q)||g.mentor.toLowerCase().includes(q);
    const mC=!fc||g.course===fc;const mM=!fm||g.mentor===fm;
    const dur=getCourseDuration(g.course);const durNum=parseInt(dur)||0;
    let mD=true;if(fd==='1-5')mD=durNum>=1&&durNum<=5;else if(fd==='5-12')mD=durNum>5&&durNum<=12;
    const mDay=!fday||(g.days||[]).includes(fday);const mSt=!fst||g.status===fst;
    return mQ&&mC&&mM&&mD&&mDay&&mSt;
  });
  items.sort((a,b)=>a.name.localeCompare(b.name));
  const total=items.length;const pages=Math.max(1,Math.ceil(total/PER_PAGE));
  if(groupPage>pages)groupPage=pages;
  const start=(groupPage-1)*PER_PAGE;const paged=items.slice(start,start+PER_PAGE);
  const grid=document.getElementById('group-grid');
  if(!total){grid.innerHTML=`<div class="empty"><div class="empty-ic">👥</div><div class="empty-txt">Guruh topilmadi</div></div>`;document.getElementById('group-pagination').innerHTML='';return;}
  grid.innerHTML=paged.map(g=>{
    const cnt=groupStudentCount(g.id);
    const dur=getCourseDuration(g.course);
    const timeStr=(g.timeStart&&g.timeEnd)?g.timeStart+'–'+g.timeEnd:'—';
    const daysHtml=(g.days||[]).map(d=>`<span class="day-pill">${d}</span>`).join('');
    const statusBadge=g.status==='Man etilgan'?'b-orange':g.status==='Faol'?'b-teal':'b-gray';
    return `<div class="card"><div class="card-head"><div class="card-title">${g.name}</div><span class="badge ${statusBadge}">${g.status}</span></div><div class="card-body"><div><span>📚 Kurs:</span><b>${g.course}</b></div><div><span>🎓 Mentor:</span><b>${g.mentor}</b></div><div><span>🧑‍💻 Talabalar:</span><b><span class="badge b-blue" onclick="showGroupStudents(${g.id})" style="cursor:pointer;font-size:12px">${cnt} ta →</span></b></div><div><span>📅 Boshlanish:</span><b>${fmtDate(g.startDate)}</b></div><div><span>📆 Davomiylik:</span><b>${dur}</b></div><div><span>🚪 Xona:</span><b>${g.room||'—'}</b><span style="margin-left:8px">⏰</span><b>${timeStr}</b></div><div class="days-badges" style="margin-top:10px">${daysHtml}</div><div style="margin-top:8px"><span>📨 Telegram:</span><b>${g.telegramChatId?`<span class="badge b-teal" style="font-size:11px">✅ ulangan</span>`:`<span class="badge b-gray" style="font-size:11px">— sozlanmagan</span>`}</b></div></div><div class="card-foot"><button class="btn btn-sm" onclick="showGroupStudents(${g.id})" style="background:var(--teal-light);color:var(--teal-text);border-color:rgba(13,148,136,.3)">${L==='ru'?'📋 Посещаемость':L==='en'?'📋 Attendance':'📋 Davomat'}</button><button class="btn btn-sm" onclick="showMentorGroupRating(${g.id})" style="background:var(--purple-light);color:var(--purple-text);border-color:rgba(124,58,237,.3)">🏆 Reyting</button><button class="btn btn-sm" onclick="go('grades',document.getElementById('nav-grades'));setTimeout(()=>selectGradeGroup(${g.id}),150)" style="background:var(--amber-light);color:var(--amber-text);border-color:rgba(217,119,6,.3)">🏅 Baholash</button><button class="btn btn-sm" onclick="go('tests',document.getElementById('nav-tests'));setTimeout(()=>filterTestsByGroup(${g.id}),150)" style="background:var(--teal-light);color:var(--teal-text);border-color:rgba(13,148,136,.3)">${L==='ru'?'📝 Тесты':L==='en'?'📝 Tests':'📝 Testlar'}</button><button class="btn btn-sm" onclick="editItem('group',${g.id})">✏️</button><button class="btn btn-sm btn-del-outline" onclick="delItem('group',${g.id})">🗑</button></div></div>`;
  }).join('');
  let pgHtml=`<button class="pg-btn" onclick="setGroupPage(${groupPage-1})" ${groupPage===1?'disabled':''}>‹ Oldingi</button>`;
  const maxBtns=7;let pStart=Math.max(1,groupPage-3);let pEnd=Math.min(pages,pStart+maxBtns-1);
  if(pEnd-pStart<maxBtns-1)pStart=Math.max(1,pEnd-maxBtns+1);
  for(let i=pStart;i<=pEnd;i++)pgHtml+=`<button class="pg-btn ${i===groupPage?'active':''}" onclick="setGroupPage(${i})">${i}</button>`;
  pgHtml+=`<button class="pg-btn" onclick="setGroupPage(${groupPage+1})" ${groupPage===pages?'disabled':''}>Keyingi ›</button>`;
  pgHtml+=`<span class="pg-info">${start+1}–${Math.min(start+PER_PAGE,total)} / ${total}</span>`;
  document.getElementById('group-pagination').innerHTML=pgHtml;
}
function setGroupPage(p){groupPage=p;renderGroups();document.getElementById('scroll').scrollTop=0;}

// ===================== RENDER MENTORS =====================
function renderMentors(){
  const q=(document.getElementById('s-mentor').value||'').toLowerCase();
  let items=D.mentors.filter(m=>{
    const mQ=m.name.toLowerCase().includes(q)||m.subject.toLowerCase().includes(q);if(!mQ)return false;
    if(!_expFilter)return true;const yrs=getExpYears(m.experience);
    if(_expFilter==='5+')return yrs>=5;return yrs===parseInt(_expFilter);
  });
  items.sort((a,b)=>a.name.localeCompare(b.name));
  const el=document.getElementById('mentor-list');
  if(!items.length){el.innerHTML=`<div class="empty"><div class="empty-ic">🎓</div><div class="empty-txt">Mentor topilmadi</div></div>`;return;}
  el.innerHTML=items.map((m,i)=>{
    const gc=D.groups.filter(g=>g.mentor===m.name).length;
    const sc=D.students.filter(s=>D.groups.some(g=>g.id===s.groupId&&g.mentor===m.name)).length;
    return `<div class="list-item" onclick="openDetailMentor(${m.id})">${mentorAvatarHtml(m,i,'sm')}<div class="li-info"><div class="li-name">${m.name}</div><div class="li-sub">📱 ${m.phone} · ${m.subject}${m.experience?' · '+m.experience:''}</div><div class="li-tags"><span class="badge b-purple">${gc} guruh</span><span class="badge b-teal">${sc} talaba</span><span class="badge b-gray">📅 ${fmtDate(m.joinDate)}</span></div></div><div class="li-right" onclick="event.stopPropagation()"><button class="btn btn-sm" onclick="editItem('mentor',${m.id})">✏️ Tahrirlash</button><button class="btn btn-sm btn-del-outline" onclick="delItem('mentor',${m.id})">🗑 O'chirish</button></div></div>`;
  }).join('');
}

// ===================== RENDER STUDENTS =====================
function renderStudents(){
  const q=(document.getElementById('s-student').value||'').toLowerCase();
  const sf=document.getElementById('filter-student-status').value;
  const df=document.getElementById('filter-student-debt').value;
  const cf=document.getElementById('filter-student-course')?.value||'';
  let items=D.students.filter(s=>{
    const gl=groupLabel(s.groupId).toLowerCase();
    const mQ=!q||s.name.toLowerCase().includes(q)||gl.includes(q)||(s.source||'').toLowerCase().includes(q);
    const mS=!sf||s.status===sf;const mD=df===''||(df==='1'&&s.isDebtor)||(df==='0'&&!s.isDebtor);
    const mC=!cf||studentCourse(s)===cf;return mQ&&mS&&mD&&mC;
  });
  items.sort((a,b)=>a.name.localeCompare(b.name));
  const el=document.getElementById('student-list');
  const pgEl=document.getElementById('student-pagination');
  if(!items.length){el.innerHTML=`<div class="empty"><div class="empty-ic">🧑‍💻</div><div class="empty-txt">${t('no_students_found')}</div></div>`;if(pgEl)pgEl.innerHTML='';return;}
  // ---- Pagination: 10 ta talaba / sahifa (1.1-band talabi) ----
  const total=items.length;const pages=Math.max(1,Math.ceil(total/STUDENT_PER_PAGE));
  if(studentPage>pages)studentPage=pages;
  if(studentPage<1)studentPage=1;
  const start=(studentPage-1)*STUDENT_PER_PAGE;
  const paged=items.slice(start,start+STUDENT_PER_PAGE);
  const sb=s=>{const m={Aktiv:'b-teal',Faolsiz:'b-gray',Muzlatilgan:'b-blue',Probatsiya:'b-amber',Arxiv:'b-purple'};const ic={Aktiv:'✅',Faolsiz:'⛔',Muzlatilgan:'❄️',Probatsiya:'🔶',Arxiv:'📦'};return `<span class="badge ${m[s.status]||'b-gray'}">${ic[s.status]||''} ${t('status_'+s.status)}</span>`;};
  el.innerHTML=paged.map((s,i)=>`<div class="list-item" onclick="openDetailStudent(${s.id})"><div class="av ${AV_CLS[i%5]}">${ini(s.name)}</div><div class="li-info"><div class="li-name">${s.name}</div><div class="li-sub">📱 ${s.phone} · ${groupLabel(s.groupId)}</div><div class="li-tags">${sb(s)}<span class="badge ${s.isDebtor?'b-orange':'b-teal'}">${s.isDebtor?t('debtor'):t('paid')}</span><span class="badge b-purple">📍 ${s.source||'—'}</span><span class="badge b-blue">📅 ${fmtDate(s.joinDate)}</span></div></div><div class="li-right" onclick="event.stopPropagation()"><button class="btn btn-sm" onclick="editItem('student',${s.id})">✏️ ${t('edit_btn')}</button><button class="btn btn-sm btn-del-outline" onclick="delItem('student',${s.id})">🗑 ${t('delete_btn')}</button></div></div>`).join('');
  if(pgEl){
    if(pages<=1){pgEl.innerHTML='';}
    else{
      let pgHtml=`<button class="pg-btn" onclick="setStudentPage(${studentPage-1})" ${studentPage===1?'disabled':''}>‹ ${t('prev')}</button>`;
      const maxBtns=7;let pStart=Math.max(1,studentPage-3);let pEnd=Math.min(pages,pStart+maxBtns-1);
      if(pEnd-pStart<maxBtns-1)pStart=Math.max(1,pEnd-maxBtns+1);
      for(let i=pStart;i<=pEnd;i++)pgHtml+=`<button class="pg-btn ${i===studentPage?'active':''}" onclick="setStudentPage(${i})">${i}</button>`;
      pgHtml+=`<button class="pg-btn" onclick="setStudentPage(${studentPage+1})" ${studentPage===pages?'disabled':''}>${t('next')} ›</button>`;
      pgHtml+=`<span class="pg-info">${start+1}–${Math.min(start+STUDENT_PER_PAGE,total)} / ${total}</span>`;
      pgEl.innerHTML=pgHtml;
    }
  }
}
function setStudentPage(p){
  studentPage=p;
  renderStudents();
  const sc=document.getElementById('scroll');
  if(sc)sc.scrollTop=0;
}

// ===================== DASHBOARD =====================
let activeStatChip=null;
let _dashClockInterval=null;

// SVG icons (no emoji)
const DASH_ICONS={
  courses:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
  groups:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  mentors:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/><path d="M12 12v9"/><path d="M9 18l3 3 3-3"/></svg>',
  students:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>',
  active:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  debtors:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  income:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>',
  expense:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>',
  net:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
  coins:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><line x1="12" y1="8" x2="12" y2="12"/><path d="M12 16h.01"/></svg>',
  trend:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>',
  bar:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>',
  pie:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>',
  coin2:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M14.8 9A2 2 0 0 0 13 8h-2a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-2a2 2 0 0 1-1.8-1"/><line x1="12" y1="6" x2="12" y2="8"/><line x1="12" y1="16" x2="12" y2="18"/></svg>',
  award:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>',
  send:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
  source:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
};

function _buildDonutSVG(data,size){
  const tot=data.reduce((s,x)=>s+x.val,0)||1;
  const cx=size/2,cy=size/2,r=size*0.4,inner=size*0.26;
  let angle=-Math.PI/2;
  const paths=data.map(x=>{
    const a=Math.max((x.val/tot)*2*Math.PI,0.01);
    const x1=cx+r*Math.cos(angle),y1=cy+r*Math.sin(angle);
    angle+=a;
    const x2=cx+r*Math.cos(angle),y2=cy+r*Math.sin(angle);
    const xi1=cx+inner*Math.cos(angle-a),yi1=cy+inner*Math.sin(angle-a);
    const xi2=cx+inner*Math.cos(angle),yi2=cy+inner*Math.sin(angle);
    const large=a>Math.PI?1:0;
    return `<path d="M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} L${xi2.toFixed(2)},${yi2.toFixed(2)} A${inner},${inner} 0 ${large} 0 ${xi1.toFixed(2)},${yi1.toFixed(2)} Z" fill="${x.color}"/>`;
  });
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${paths.join('')}<circle cx="${cx}" cy="${cy}" r="${inner*0.9}" fill="var(--bg2)"/></svg>`;
}

function _buildSparkSVG(vals,w,h,color){
  if(!vals||vals.length<2)return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"></svg>`;
  const mn=Math.min(...vals);const mx=Math.max(...vals,mn+1);const range=mx-mn;
  const pad=6;
  const pts=vals.map((v,i)=>{
    const x=pad+(i/(vals.length-1))*(w-pad*2);
    const y=pad+((mx-v)/range)*(h-pad*2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const first=pts[0].split(',');const last=pts[pts.length-1].split(',');
  const area=`${first[0]},${h} ${pts.join(' ')} ${last[0]},${h}`;
  const uid='sp'+Math.random().toString(36).slice(2,7);
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="none">
    <defs><linearGradient id="${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <polygon points="${area}" fill="url(#${uid})"/>
    <polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${last[0]}" cy="${last[1]}" r="3.5" fill="${color}"/>
  </svg>`;
}

function _buildBarSVG(data,w,h,color){
  if(!data||!data.length)return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"></svg>`;
  const max=Math.max(...data.map(d=>d.val),1);
  const padB=20,padT=10,padSide=6;
  const bw=(w-padSide*2)/data.length;
  const barW=Math.max(Math.min(bw*0.55,34),6);
  const bars=data.map((d,i)=>{
    const bh=Math.max(((h-padB-padT)*(d.val/max))||0,d.val>0?2:0);
    const x=padSide+i*bw+(bw-barW)/2;
    const y=h-padB-bh;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" rx="4" fill="${d.color||color}"><title>${d.label}: ${d.val}</title></rect><text x="${(x+barW/2).toFixed(1)}" y="${h-6}" font-size="9.5" fill="var(--text3)" text-anchor="middle">${d.label}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${bars}</svg>`;
}

function _getDashClock(){
  const n=new Date();const p=x=>String(x).padStart(2,'0');
  return `${p(n.getHours())}:${p(n.getMinutes())}:${p(n.getSeconds())}`;
}
function _getDashDate(){
  const n=new Date();
  const days=['Yakshanba','Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba'];
  const months=['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentyabr','Oktyabr','Noyabr','Dekabr'];
  return `${days[n.getDay()]}, ${n.getDate()} ${months[n.getMonth()]} ${n.getFullYear()}`;
}

function _ini(name){return (name||'?').split(' ').slice(0,2).map(w=>w[0]||'').join('').toUpperCase();}

function renderDashboard(){
  const active=D.students.filter(s=>s.status==='Aktiv').length;
  const debtors=D.students.filter(s=>s.isDebtor).length;
  const archived=D.students.filter(s=>s.status==='Arxiv').length;
  const inactive=D.students.filter(s=>s.status==='Faolsiz').length;
  const frozen=D.students.filter(s=>s.status==='Muzlatilgan').length;
  const probation=D.students.filter(s=>s.status==='Probatsiya').length;
  const now=new Date();const cm=now.getMonth(),cy=now.getFullYear();
  const txs=getFinanceForMonth(cm,cy);
  const monthIncome=txs.filter(tx=>tx.type==='income').reduce((s,tx)=>s+tx.amount,0);
  const monthExpense=txs.filter(tx=>tx.type==='expense'||tx.type==='salary').reduce((s,tx)=>s+tx.amount,0);
  const netCash=monthIncome-monthExpense;

  const finTrend=[];
  for(let i=5;i>=0;i--){let m=cm-i;let y=cy;if(m<0){m+=12;y--;}const mt=getFinanceForMonth(m,y);finTrend.push({inc:mt.filter(tx=>tx.type==='income').reduce((s,tx)=>s+tx.amount,0),exp:mt.filter(tx=>tx.type==='expense'||tx.type==='salary').reduce((s,tx)=>s+tx.amount,0)});}
  const incVals=finTrend.map(x=>x.inc);
  const expVals=finTrend.map(x=>x.exp);

  const _coins=(window.coinShop&&window.coinShop.getCoins)?window.coinShop.getCoins():{};
  let coinMentors=0,coinStudents=0;
  Object.keys(_coins).forEach(k=>{if(k.startsWith('mg_')||k.startsWith('m_'))coinMentors+=_coins[k]||0;else if(k.startsWith('s_'))coinStudents+=_coins[k]||0;});
  const _purchases=(function(){try{return JSON.parse(localStorage.getItem('edu_coin_purchases_v1')||'[]');}catch(e){return[];}}());
  const shopBuys=_purchases.filter(p=>p.type!=='admin-send');
  const adminSends=_purchases.filter(p=>p.type==='admin-send');
  const totalCoinsSpentInShop=shopBuys.reduce((s,p)=>s+(p.coinPrice||0),0);
  const totalCoinsGivenByAdmin=adminSends.reduce((s,p)=>s+(p.amount||0),0);

  // --- CHIPS (top horizontal scroll row) ---
  const chips=[
    {key:'courses',  val:D.courses.length,       label:'Kurslar',     icon:DASH_ICONS.courses, c1:'#3b82f6',c2:'#6366f1'},
    {key:'groups',   val:D.groups.length,         label:'Guruhlar',    icon:DASH_ICONS.groups,  c1:'#0d9488',c2:'#0ea5e9'},
    {key:'mentors',  val:D.mentors.length,        label:'Mentorlar',   icon:DASH_ICONS.mentors, c1:'#7c3aed',c2:'#a78bfa'},
    {key:'students', val:D.students.length,       label:'Talabalar',   icon:DASH_ICONS.students,c1:'#0ea5e9',c2:'#38bdf8'},
    {key:'active',   val:active,                  label:'Aktiv',       icon:DASH_ICONS.active,  c1:'#059669',c2:'#10b981'},
    {key:'debtors',  val:debtors,                 label:'Qarzdor',     icon:DASH_ICONS.debtors, c1:'#ea580c',c2:'#f97316'},
    {key:'income',   val:fmtMoney(monthIncome),   label:'Bu oy kirim', icon:DASH_ICONS.income,  c1:'#059669',c2:'#0d9488',sm:1},
    {key:'expense',  val:fmtMoney(monthExpense),  label:'Bu oy chiqim',icon:DASH_ICONS.expense, c1:'#dc2626',c2:'#ea580c',sm:1},
    {key:'net',      val:fmtMoney(Math.abs(netCash)),label:netCash>=0?'Sof foyda':'Zarar',icon:DASH_ICONS.net,c1:netCash>=0?'#059669':'#dc2626',c2:netCash>=0?'#10b981':'#ea580c',sm:1},
    {key:'coinStudents',val:coinStudents,         label:'Talaba coin', icon:DASH_ICONS.coins,   c1:'#d97706',c2:'#f59e0b'},
  ];

  // --- CHARTS DATA ---
  const srcCount={};SOURCES.slice(1).forEach(s=>srcCount[s]=0);
  D.students.forEach(s=>{if(srcCount[s.source]!==undefined)srcCount[s.source]++;});
  const srcMax=Math.max(...Object.values(srcCount),1);
  const COLS=['#3b82f6','#7c3aed','#0d9488','#6366f1','#d97706','#0ea5e9','#ea580c','#10b981'];

  const crsData=D.courses.map(c=>({name:c.name,count:D.students.filter(s=>studentCourse(s)===c.name).length})).sort((a,b)=>b.count-a.count);
  const crsMax=Math.max(...crsData.map(c=>c.count),1);

  const mentorStats=D.mentors.map((m,mi)=>{
    const grps=D.groups.filter(g=>g.mentor===m.name);
    const stus=D.students.filter(s=>grps.some(g=>g.id===s.groupId));
    return{name:m.name,photo:m.photo||null,mi,groups:grps.length,students:stus.length};
  }).sort((a,b)=>b.students-a.students).slice(0,6);
  const mentorMax=Math.max(...mentorStats.map(m=>m.students),1);

  const topStudents=D.students.map(s=>({name:s.name,id:s.id,coins:_coins['s_'+s.id]||0})).filter(s=>s.coins>0).sort((a,b)=>b.coins-a.coins).slice(0,5);
  const topStudMax=topStudents.length?topStudents[0].coins:1;

  const statusData=[
    {label:'Aktiv',val:active,color:'#0d9488'},
    {label:'Qarzdor',val:debtors,color:'#ea580c'},
    {label:'Faolsiz',val:inactive,color:'#d97706'},
    {label:'Muzlatilgan',val:frozen,color:'#0ea5e9'},
    {label:'Probatsiya',val:probation,color:'#7c3aed'},
    {label:'Arxiv',val:archived,color:'#94a3b8'},
  ].filter(x=>x.val>0);
  const stTot=statusData.reduce((s,x)=>s+x.val,0)||1;

  const recentSends=adminSends.slice(-5).reverse();
  const MONTH_SHORT=['Yan','Fev','Mar','Apr','May','Iyu','Iyu','Avg','Sen','Okt','Noy','Dek'];
  const trendLabels=[];for(let i=5;i>=0;i--){let m=cm-i;if(m<0)m+=12;trendLabels.push(MONTH_SHORT[m]);}

  // ---- RENDER ----
  document.getElementById('dash-stats-row').innerHTML=`
<style>
.dsh-wrap{font-family:inherit;}
/* HEADER */
.dsh-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;gap:12px;flex-wrap:wrap;width:100%;}
.dsh-title-block{}
.dsh-title{font-size:22px;font-weight:900;letter-spacing:-.7px;color:var(--text);}
.dsh-sub{font-size:12px;color:var(--text3);margin-top:2px;}
.dsh-clock-box{background:var(--bg2);border:1.5px solid var(--border);border-radius:14px;padding:10px 18px;text-align:right;box-shadow:var(--shadow-sm);}
.dsh-clock-time{font-size:24px;font-weight:900;letter-spacing:-1px;color:var(--accent);font-variant-numeric:tabular-nums;line-height:1.1;}
.dsh-clock-date{font-size:11px;color:var(--text3);font-weight:500;margin-top:2px;}
/* CHIPS SCROLL */
.dsh-chips-scroll{display:flex;gap:10px;overflow-x:auto;padding-bottom:6px;margin-bottom:0;width:100%;scrollbar-width:thin;scrollbar-color:var(--border) transparent;}
.dsh-chips-scroll::-webkit-scrollbar{height:4px;}
.dsh-chips-scroll::-webkit-scrollbar-track{background:transparent;}
.dsh-chips-scroll::-webkit-scrollbar-thumb{background:var(--border2);border-radius:2px;}
.dsh-chip{flex-shrink:0;width:130px;border-radius:14px;padding:13px 14px 11px;cursor:pointer;transition:transform .15s,box-shadow .15s;position:relative;overflow:hidden;border:none;outline:none;}
.dsh-chip:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,.18);}
.dsh-chip.act{box-shadow:0 0 0 3px rgba(255,255,255,.4) inset,0 8px 20px rgba(0,0,0,.2);}
.dsh-chip-icon{width:32px;height:32px;border-radius:9px;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;margin-bottom:8px;color:#fff;}
.dsh-chip-val{font-size:24px;font-weight:900;letter-spacing:-1.2px;color:#fff;line-height:1;}
.dsh-chip-val.sm{font-size:15px;letter-spacing:-.4px;margin-top:2px;}
.dsh-chip-lbl{font-size:10px;color:rgba(255,255,255,.78);margin-top:5px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;white-space:nowrap;}
.dsh-chip-glow{position:absolute;top:-20px;right:-20px;width:70px;height:70px;border-radius:50%;background:rgba(255,255,255,.1);}
/* CHART GRID */
.dsh-grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:14px;}
.dsh-grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;}
.dsh-grid1{display:grid;grid-template-columns:1fr;gap:14px;margin-bottom:14px;}
@media(max-width:960px){.dsh-grid3{grid-template-columns:1fr 1fr;}}
@media(max-width:640px){.dsh-grid3,.dsh-grid2{grid-template-columns:1fr;}}
/* CARD */
.dch{background:var(--bg2);border:1.5px solid var(--border);border-radius:16px;padding:18px 18px 14px;box-shadow:var(--shadow-sm);overflow:visible;}
.dch-title{font-size:12px;font-weight:700;color:var(--text2);margin-bottom:14px;display:flex;align-items:center;gap:7px;text-transform:uppercase;letter-spacing:.06em;}
.dch-title svg{color:var(--accent);flex-shrink:0;}
/* BAR */
.dch-bar{display:flex;align-items:center;gap:9px;margin-bottom:9px;position:relative;}
.dch-bar-name{font-size:12px;color:var(--text2);width:82px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.dch-bar-track{flex:1;height:9px;background:var(--bg3);border-radius:5px;overflow:hidden;}
.dch-bar-fill{height:100%;border-radius:5px;transition:width .5s cubic-bezier(.4,0,.2,1);}
.dch-bar-val{font-size:11px;font-weight:700;color:var(--text2);min-width:22px;text-align:right;flex-shrink:0;}
/* MENTOR BAR (with avatar + tooltip) */
.dch-mrow{display:flex;align-items:center;gap:9px;margin-bottom:9px;position:relative;}
.dch-mav{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:#fff;flex-shrink:0;cursor:default;}
.dch-mav img{width:100%;height:100%;object-fit:cover;border-radius:8px;}
.dch-mname{font-size:12px;color:var(--text2);width:70px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:default;}
.dch-tooltip{display:none;position:absolute;left:50%;bottom:calc(100% + 8px);transform:translateX(-50%);z-index:9999;background:var(--bg2);color:var(--text);font-size:12px;font-weight:600;padding:8px 12px;border-radius:10px;white-space:nowrap;pointer-events:none;box-shadow:0 12px 32px rgba(0,0,0,.25),0 0 0 1.5px var(--border2);min-width:160px;}.dch-tooltip::after{content:'';position:absolute;top:100%;left:50%;transform:translateX(-50%);border:6px solid transparent;border-top-color:var(--bg2);}
.dch-tooltip-title{font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px;}
.dch-tooltip-row{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text2);margin-top:2px;}
.dch-tooltip-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;}
.dch-has-tip{position:relative;}
.dch-has-tip:hover .dch-tooltip{display:block;}
/* old compat */
.dch-mtooltip{display:none;}
.dch-mrow:hover .dch-mtooltip{display:none;}
/* KPI mini */
.dch-kpi-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.dch-kpi{padding:11px 12px;border-radius:11px;border:1.5px solid var(--border);}
.dch-kpi-val{font-size:18px;font-weight:900;letter-spacing:-.6px;line-height:1.1;}
.dch-kpi-lbl{font-size:10px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-top:3px;}
/* DONUT */
.dch-donut-row{display:flex;align-items:center;gap:14px;}
.dch-donut-legend{flex:1;display:flex;flex-direction:column;gap:6px;}
.dch-donut-li{display:flex;align-items:center;gap:7px;font-size:12px;}
.dch-dot{width:9px;height:9px;border-radius:3px;flex-shrink:0;}
/* SPARK */
.dch-spark-row{display:flex;gap:12px;flex-wrap:wrap;}
.dch-spark-item{flex:1;min-width:140px;}
.dch-spark-lbl{font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px;display:flex;align-items:center;gap:5px;}
.dch-spark-val{font-size:18px;font-weight:900;letter-spacing:-.6px;margin-top:4px;}
.dch-trend-months{display:flex;justify-content:space-between;padding:0 2px;margin-top:2px;}
.dch-trend-m{font-size:9px;color:var(--text3);}
/* TOP student row */
.dch-srow{display:flex;align-items:center;gap:9px;margin-bottom:9px;position:relative;}
.dch-srank{font-size:13px;font-weight:900;width:20px;flex-shrink:0;text-align:center;color:var(--text3);}
.dch-sav{width:26px;height:26px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:#fff;flex-shrink:0;}
.dch-sname{flex:1;font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
/* ACTIVITY */
.dch-act-item{display:flex;align-items:center;gap:9px;padding:8px 0;border-bottom:1px solid var(--border);position:relative;}
.dch-act-item:last-child{border-bottom:none;}
.dch-act-dot{width:7px;height:7px;border-radius:50%;background:#d97706;flex-shrink:0;}
.dch-act-badge{background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;border-radius:7px;padding:2px 8px;font-size:11px;font-weight:700;white-space:nowrap;flex-shrink:0;}
/* EMPTY */
.dch-empty{padding:20px;text-align:center;color:var(--text3);font-size:12px;}
</style>
<div class="dsh-wrap" style="width:100%">
  <div class="dsh-header">
    <div class="dsh-title-block">
      <div class="dsh-title">Admin Dashboard</div>
      <div class="dsh-sub">Real vaqt tahlil &mdash; avtomatik yangilanadi</div>
    </div>
    <div class="dsh-clock-box">
      <div class="dsh-clock-time" id="dash-clock-el">${_getDashClock()}</div>
      <div class="dsh-clock-date">${_getDashDate()}</div>
    </div>
  </div>
  <div class="dsh-chips-scroll">
    ${chips.map(c=>`<button class="dsh-chip${activeStatChip===c.key?' act':''}" style="background:linear-gradient(135deg,${c.c1},${c.c2})" onclick="showStatDetail('${c.key}')">
      <div class="dsh-chip-glow"></div>
      <div class="dsh-chip-icon">${c.icon}</div>
      <div class="dsh-chip-val${c.sm?' sm':''}">${c.val}</div>
      <div class="dsh-chip-lbl">${c.label}</div>
    </button>`).join('')}
  </div>
</div>`;

  if(_dashClockInterval)clearInterval(_dashClockInterval);
  _dashClockInterval=setInterval(()=>{const el=document.getElementById('dash-clock-el');if(el)el.textContent=_getDashClock();else clearInterval(_dashClockInterval);},1000);

  if(activeStatChip)renderStatDetail(activeStatChip);

  // ---- CHARTS HTML ----
  const AVCOLS=['#3b82f6','#7c3aed','#0d9488','#ea580c','#d97706','#6366f1'];

  document.getElementById('dash-charts').innerHTML=`
<div class="dsh-grid3">
  <!-- STATUS DONUT -->
  <div class="dch">
    <div class="dch-title">${DASH_ICONS.pie} Talaba statuslari</div>
    <div class="dch-donut-row">
      ${_buildDonutSVG(statusData.map(x=>({val:x.val,color:x.color})),110)}
      <div class="dch-donut-legend">
        ${statusData.map(x=>`<div class="dch-donut-li"><div class="dch-dot" style="background:${x.color}"></div><span style="flex:1">${x.label}</span><b>${x.val}</b><span style="color:var(--text3);font-size:10px;margin-left:3px">${Math.round(x.val/stTot*100)}%</span></div>`).join('')}
      </div>
    </div>
  </div>
  <!-- MOLIYA KPI -->
  <div class="dch">
    <div class="dch-title">${DASH_ICONS.net} Moliya (bu oy)</div>
    <div class="dch-kpi-grid">
      <div class="dch-kpi" style="background:rgba(5,150,105,.07);border-color:rgba(5,150,105,.2)">
        <div class="dch-kpi-val" style="color:#059669">+${fmtMoney(monthIncome)}</div>
        <div class="dch-kpi-lbl">Kirim</div>
      </div>
      <div class="dch-kpi" style="background:rgba(220,38,38,.07);border-color:rgba(220,38,38,.2)">
        <div class="dch-kpi-val" style="color:#dc2626">-${fmtMoney(monthExpense)}</div>
        <div class="dch-kpi-lbl">Chiqim</div>
      </div>
      <div class="dch-kpi" style="grid-column:1/-1;background:${netCash>=0?'rgba(5,150,105,.07)':'rgba(220,38,38,.07)'};border-color:${netCash>=0?'rgba(5,150,105,.2)':'rgba(220,38,38,.2)'}">
        <div class="dch-kpi-val" style="color:${netCash>=0?'#059669':'#dc2626'}">${netCash>=0?'&#8679;':'&#8681;'} ${fmtMoney(Math.abs(netCash))}</div>
        <div class="dch-kpi-lbl">Sof foyda</div>
      </div>
    </div>
  </div>
  <!-- COIN KPI -->
  <div class="dch">
    <div class="dch-title">${DASH_ICONS.coin2} Coin iqtisodiyoti</div>
    <div class="dch-kpi-grid">
      <div class="dch-kpi" style="background:rgba(245,158,11,.07);border-color:rgba(245,158,11,.2)">
        <div class="dch-kpi-val" style="color:#d97706">${totalCoinsGivenByAdmin}</div>
        <div class="dch-kpi-lbl">Admin berdi</div>
      </div>
      <div class="dch-kpi" style="background:rgba(13,148,136,.07);border-color:rgba(13,148,136,.2)">
        <div class="dch-kpi-val" style="color:#0d9488">${coinMentors}</div>
        <div class="dch-kpi-lbl">Mentorlarda</div>
      </div>
      <div class="dch-kpi" style="background:rgba(99,102,241,.07);border-color:rgba(99,102,241,.2)">
        <div class="dch-kpi-val" style="color:#6366f1">${coinStudents}</div>
        <div class="dch-kpi-lbl">Talabalarda</div>
      </div>
      <div class="dch-kpi" style="background:rgba(168,85,247,.07);border-color:rgba(168,85,247,.2)">
        <div class="dch-kpi-val" style="color:#7c3aed">${shopBuys.length}</div>
        <div class="dch-kpi-lbl">Xaridlar</div>
      </div>
    </div>
  </div>
</div>

<!-- 6-OY TREND (full width) -->
<div class="dsh-grid1">
  <div class="dch">
    <div class="dch-title">${DASH_ICONS.trend} 6 oylik moliya trendi</div>
    <div class="dch-spark-row">
      <div class="dch-spark-item">
        <div class="dch-spark-lbl" style="color:#059669">${DASH_ICONS.income} Kirim</div>
        ${_buildSparkSVG(incVals,400,64,'#059669')}
        <div class="dch-trend-months">${trendLabels.map(l=>`<span class="dch-trend-m">${l}</span>`).join('')}</div>
        <div class="dch-spark-val" style="color:#059669">+${fmtMoney(incVals[incVals.length-1])}</div>
      </div>
      <div class="dch-spark-item">
        <div class="dch-spark-lbl" style="color:#dc2626">${DASH_ICONS.expense} Chiqim</div>
        ${_buildSparkSVG(expVals,400,64,'#dc2626')}
        <div class="dch-trend-months">${trendLabels.map(l=>`<span class="dch-trend-m">${l}</span>`).join('')}</div>
        <div class="dch-spark-val" style="color:#dc2626">-${fmtMoney(expVals[expVals.length-1])}</div>
      </div>
    </div>
    <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;border-top:1px solid var(--border);padding-top:10px">
      ${finTrend.map((x,i)=>`<div style="text-align:center;min-width:40px;flex:1">
        <div style="font-size:10px;font-weight:700;color:var(--text2)">${trendLabels[i]}</div>
        <div style="font-size:11px;color:#059669;font-weight:600">+${fmtMoney(x.inc)}</div>
        <div style="font-size:11px;color:#dc2626;font-weight:600">-${fmtMoney(x.exp)}</div>
      </div>`).join('')}
    </div>
  </div>
</div>

<div class="dsh-grid3">
  <!-- TOP MENTORLAR (hover → full name) -->
  <div class="dch">
    <div class="dch-title">${DASH_ICONS.mentors} TOP mentorlar</div>
    ${mentorStats.length?mentorStats.map((m,i)=>{
      const avBg=AVCOLS[m.mi%AVCOLS.length];
      const avHtml=m.photo?`<img src="${m.photo}" alt="">`:`<span>${_ini(m.name)}</span>`;
      return `<div class="dch-mrow dch-has-tip">
        <div class="dch-mav" style="background:${avBg}">${avHtml}</div>
        <div class="dch-mname" title="${m.name}">${m.name}</div>
        <div class="dch-bar-track"><div class="dch-bar-fill" style="width:${Math.round(m.students/mentorMax*100)}%;background:${COLS[i%COLS.length]}"></div></div>
        <div class="dch-bar-val">${m.students}</div>
        <div class="dch-tooltip"><div class="dch-tooltip-title">${m.name}</div><div class="dch-tooltip-row"><div class="dch-tooltip-dot" style="background:#0d9488"></div>${m.students} talaba</div><div class="dch-tooltip-row"><div class="dch-tooltip-dot" style="background:#6366f1"></div>${m.groups} guruh</div></div>
      </div>`;
    }).join(''):`<div class="dch-empty">Mentor yo'q</div>`}
  </div>

  <!-- KURS BO'YICHA -->
  <div class="dch">
    <div class="dch-title">${DASH_ICONS.courses} Kurs bo'yicha</div>
    ${crsData.map((c,i)=>`<div class="dch-bar dch-has-tip" style="cursor:default">
      <div class="dch-bar-name">${c.name}</div>
      <div class="dch-bar-track"><div class="dch-bar-fill" style="width:${Math.round(c.count/crsMax*100)}%;background:${COLS[i%COLS.length]}"></div></div>
      <div class="dch-bar-val">${c.count}</div>
      <div class="dch-tooltip"><div class="dch-tooltip-title">${c.name}</div><div class="dch-tooltip-row"><div class="dch-tooltip-dot" style="background:${COLS[i%COLS.length]}"></div>${c.count} talaba</div><div class="dch-tooltip-row"><div class="dch-tooltip-dot" style="background:#6366f1"></div>${Math.round(c.count/Math.max(D.students.length,1)*100)}% talabalar</div></div>
    </div>`).join('')}
  </div>

  <!-- MANBA BO'YICHA -->
  <div class="dch">
    <div class="dch-title">${DASH_ICONS.source} Manba bo'yicha</div>
    ${Object.entries(srcCount).filter(([,v])=>v>0).map(([s,v],i)=>`<div class="dch-bar dch-has-tip" style="cursor:default">
      <div class="dch-bar-name">${s}</div>
      <div class="dch-bar-track"><div class="dch-bar-fill" style="width:${Math.round(v/srcMax*100)}%;background:${COLS[i%COLS.length]}"></div></div>
      <div class="dch-bar-val">${v}</div>
      <div class="dch-tooltip"><div class="dch-tooltip-title">${s}</div><div class="dch-tooltip-row"><div class="dch-tooltip-dot" style="background:${COLS[i%COLS.length]}"></div>${v} talaba</div><div class="dch-tooltip-row"><div class="dch-tooltip-dot" style="background:#94a3b8"></div>${Math.round(v/Math.max(D.students.length,1)*100)}% hammadan</div></div>
    </div>`).join('')||`<div class="dch-empty">Ma'lumot yo'q</div>`}
  </div>
</div>

<div class="dsh-grid2">
  <!-- TOP TALABALAR (coin) -->
  <div class="dch">
    <div class="dch-title">${DASH_ICONS.award} TOP talabalar (coin)</div>
    ${topStudents.length?topStudents.map((s,i)=>{
      const rankColors=['#d97706','#94a3b8','#b45309','#64748b','#64748b'];
      return `<div class="dch-srow dch-has-tip" style="cursor:default">
        <div class="dch-srank" style="color:${rankColors[i]}">${i===0?'1':i===1?'2':i===2?'3':i+1}</div>
        <div class="dch-sav" style="background:${AVCOLS[i%AVCOLS.length]}">${_ini(s.name)}</div>
        <div class="dch-sname">${s.name}</div>
        <div class="dch-bar-track"><div class="dch-bar-fill" style="width:${Math.round(s.coins/topStudMax*100)}%;background:linear-gradient(90deg,#f59e0b,#d97706)"></div></div>
        <div class="dch-bar-val" style="color:#d97706;min-width:36px">${s.coins}</div>
        <div class="dch-tooltip"><div class="dch-tooltip-title">${s.name}</div><div class="dch-tooltip-row"><div class="dch-tooltip-dot" style="background:#f59e0b"></div>${s.coins} coin</div><div class="dch-tooltip-row"><div class="dch-tooltip-dot" style="background:#6366f1"></div>${i+1}-o'rin</div></div>
      </div>`;
    }).join(''):`<div class="dch-empty">Hali coin tarqatilmagan</div>`}
  </div>

  <!-- SO'NGGI COINLAR -->
  <div class="dch">
    <div class="dch-title">${DASH_ICONS.send} So'nggi coin yuborishlar</div>
    ${recentSends.length?recentSends.map(p=>`<div class="dch-act-item dch-has-tip" style="cursor:default">
      <div class="dch-act-dot"></div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.mentorName||'—'}</div>
        <div style="font-size:10px;color:var(--text3)">${p.reason||'Coin yuborildi'}</div>
      </div>
      <div class="dch-act-badge">${p.amount} coin</div>
      <div class="dch-tooltip"><div class="dch-tooltip-title">${p.mentorName||'—'}</div><div class="dch-tooltip-row"><div class="dch-tooltip-dot" style="background:#d97706"></div>${p.amount} coin yuborildi</div><div class="dch-tooltip-row"><div class="dch-tooltip-dot" style="background:#6366f1"></div>${p.groupCount||1} guruh</div>${p.reason?`<div class="dch-tooltip-row"><div class="dch-tooltip-dot" style="background:#94a3b8"></div>${p.reason}</div>`:''}</div>
    </div>`).join(''):`<div class="dch-empty">Hali yuborilmagan</div>`}
  </div>
</div>`;
}
function showStatDetail(key){activeStatChip=activeStatChip===key?null:key;renderDashboard();}
function renderStatDetail(key){
  let html='',title='';
  if(key==='income'||key==='expense'){
    const now=new Date();const cm=now.getMonth();const cy=now.getFullYear();
    const txs=getFinanceForMonth(cm,cy).filter(tx=>key==='income'?tx.type==='income':(tx.type==='expense'||tx.type==='salary'));
    title=key==='income'?'Bu oy kirimi':'Bu oy chiqimi';
    html=txs.length?txs.map(tx=>`<div class="stat-list-item"><span style="font-size:18px">${tx.type==='income'?'💚':'🔴'}</span><span style="flex:1;font-weight:600">${tx.title}</span><span style="font-size:12px;color:var(--text2)">${fmtDateTime(tx.date)}</span><span class="badge ${tx.type==='income'?'b-teal':'b-orange'}">${fmtMoney(tx.amount)} so'm</span></div>`).join(''):`<div class="empty"><div class="empty-ic">💰</div><div class="empty-txt">Ma'lumot yo'q</div></div>`;
  }else if(key==='courses'){
    title=t('courses');
    html=D.courses.map((c,i)=>`<div class="stat-list-item"><span class="badge ${COURSE_COLORS[i%7]}">${c.name.split(' ')[0]}</span><span style="flex:1;font-weight:600">${c.name}</span><span style="font-size:12px;color:var(--text2)">${c.duration} · ${c.price} so'm</span><span class="badge ${c.status==='Faol'?'b-teal':'b-gray'}">${c.status}</span></div>`).join('');
  }else if(key==='groups'){
    title=t('groups');
    html=D.groups.map(g=>`<div class="stat-list-item" onclick="closeStatDetail();setTimeout(()=>showGroupStudents(${g.id}),100)" style="cursor:pointer"><span class="badge b-blue">${g.name}</span><span style="flex:1;font-weight:600">${g.course}</span><span style="font-size:12px;color:var(--text2)">${g.mentor}</span><span class="badge b-teal" style="margin-left:6px">👥 ${groupStudentCount(g.id)}</span><span class="badge ${g.status==='Faol'?'b-teal':'b-gray'}" style="margin-left:6px">${g.status}</span></div>`).join('');
  }else if(key==='mentors'){
    title=t('mentors');
    html=D.mentors.map((m,i)=>`<div class="stat-list-item">${mentorAvatarHtml(m,i,'sm')}<span style="flex:1;font-weight:600">${m.name}</span><span style="font-size:12px;color:var(--text2)">${m.phone}</span><span class="badge b-purple" style="margin-left:8px">${m.subject}</span></div>`).join('');
  }else if(key==='net'){
    title='💰 Sof foyda (bu oy)';
    const now=new Date();const txs=getFinanceForMonth(now.getMonth(),now.getFullYear());
    const inc=txs.filter(tx=>tx.type==='income').reduce((s,tx)=>s+tx.amount,0);
    const exp=txs.filter(tx=>tx.type==='expense'||tx.type==='salary').reduce((s,tx)=>s+tx.amount,0);
    html=`<div style="padding:20px;display:grid;gap:12px"><div class="stat-list-item"><span>💚 Kirim</span><b style="color:var(--teal-text)">${fmtMoney(inc)} so'm</b></div><div class="stat-list-item"><span>🔴 Chiqim</span><b style="color:var(--orange-text)">${fmtMoney(exp)} so'm</b></div><div class="stat-list-item" style="border-top:2px solid var(--border);padding-top:12px"><span><b>Sof foyda</b></span><b style="color:${inc-exp>=0?'var(--teal-text)':'var(--orange-text)'};font-size:18px">${fmtMoney(inc-exp)} so'm</b></div></div>`;
  }else if(key==='coinMentors'||key==='coinStudents'||key==='coinShop'){
    const _c=(window.coinShop&&window.coinShop.getCoins)?window.coinShop.getCoins():{};
    const _p=(function(){try{return JSON.parse(localStorage.getItem('edu_coin_purchases_v1')||'[]');}catch(e){return[];}})();
    if(key==='coinMentors'){
      title='🪙 Mentor coinlari (guruh bo\'yicha)';
      const rows=[];
      D.mentors.forEach(m=>{
        const grps=D.groups.filter(g=>g.mentor===m.name);
        grps.forEach(g=>{const v=_c['mg_'+m.name+'_'+g.id]||0;if(v>0)rows.push({m:m.name,g:g.name,v});});
      });
      rows.sort((a,b)=>b.v-a.v);
      html=rows.length?rows.map(r=>`<div class="stat-list-item"><span style="font-size:18px">🎓</span><span style="flex:1"><b>${r.m}</b> <span style="color:var(--text3)">· ${r.g}</span></span><span class="badge b-orange">🪙 ${r.v}</span></div>`).join(''):`<div class="empty"><div class="empty-ic">🪙</div><div class="empty-txt">Hali coin tarqatilmagan</div></div>`;
    }else if(key==='coinStudents'){
      title='🪙 Talaba coinlari (TOP)';
      const rows=D.students.map(s=>({s,v:_c['s_'+s.id]||0})).filter(x=>x.v>0).sort((a,b)=>b.v-a.v);
      html=rows.length?rows.map(x=>`<div class="stat-list-item" onclick="closeStatDetail();goStudentDetail(${x.s.id})" style="cursor:pointer"><span style="font-size:18px">🧑‍💻</span><span style="flex:1"><b>${x.s.name}</b> <span style="color:var(--text3)">· ${groupLabel(x.s.groupId)}</span></span><span class="badge b-orange">🪙 ${x.v}</span></div>`).join(''):`<div class="empty"><div class="empty-ic">🪙</div><div class="empty-txt">Hali coin yo'q</div></div>`;
    }else{
      title='🛒 Shop xaridlari';
      const buys=_p.filter(p=>p.type!=='admin-send').reverse();
      html=buys.length?buys.map(b=>`<div class="stat-list-item"><span style="font-size:18px">🛒</span><span style="flex:1"><b>${b.studentName||'—'}</b> <span style="color:var(--text3)">· ${b.itemName||'—'}</span></span><span style="font-size:11px;color:var(--text3)">${fmtDateTime(b.date)}</span><span class="badge b-orange">🪙 ${b.coinPrice||0}</span></div>`).join(''):`<div class="empty"><div class="empty-ic">🛒</div><div class="empty-txt">Xarid yo'q</div></div>`;
    }
  }else{
    const titleMap={students:t('students'),active:'Aktiv talabalar',debtors:'Qarzdorlar',archived:'Arxiv',inactive:'Faolsizlar'};
    title=titleMap[key];
    let items=D.students;
    if(key==='active')items=items.filter(s=>s.status==='Aktiv');
    else if(key==='debtors')items=items.filter(s=>s.isDebtor);
    else if(key==='archived')items=items.filter(s=>s.status==='Arxiv');
    else if(key==='inactive')items=items.filter(s=>s.status==='Faolsiz');
    const sb=s=>{const m={Aktiv:'b-teal',Faolsiz:'b-gray',Muzlatilgan:'b-blue',Probatsiya:'b-amber',Arxiv:'b-purple'};return `<span class="badge ${m[s.status]||'b-gray'}">${s.status}</span>`;};
    html=items.map((s,i)=>`<div class="stat-list-item" onclick="closeStatDetail();goStudentDetail(${s.id})" style="cursor:pointer"><div class="av ${AV_CLS[i%5]}" style="width:32px;height:32px;font-size:11px">${ini(s.name)}</div><div style="flex:1;min-width:0"><div style="font-weight:600;font-size:13px">${s.name}</div><div style="font-size:11px;color:var(--text2)">${s.phone} · ${groupLabel(s.groupId)}</div></div>${sb(s)}<span class="badge ${s.isDebtor?'b-orange':'b-teal'}" style="margin-left:6px">${s.isDebtor?L==='ru'?'💸 Должник':L==='en'?'💸 Debtor':'💸 Qarzdor':'✅ To\'lagan'}</span></div>`).join('');
    if(!items.length)html=`<div class="empty"><div class="empty-ic">🧑‍💻</div><div class="empty-txt">Ma'lumot yo'q</div></div>`;
  }
  document.getElementById('dash-detail-area').innerHTML=`<div class="dash-detail-box"><div class="dash-detail-title">${title}</div><div class="list-box" style="box-shadow:none;border:none">${html}</div></div>`;
}
function closeStatDetail(){activeStatChip=null;document.getElementById('dash-detail-area').innerHTML='';}
function goStudentDetail(id){go('students',document.getElementById('nav-students'));setTimeout(()=>openDetailStudent(id),100);}

// ===================== MENTOR DETAIL =====================
function openDetailMentor(id){
  const m=D.mentors.find(x=>x.id===id);if(!m)return;
  const groups=D.groups.filter(g=>g.mentor===m.name);
  const students=D.students.filter(s=>groups.some(g=>g.id===s.groupId));
  const frozen=groups.filter(g=>g.status!=='Faol').length;
  const idx=D.mentors.indexOf(m);
  document.getElementById('detail-title').textContent='🎓 Mentor profili';
  document.getElementById('detail-foot').innerHTML=`<button class="btn" onclick="closeDetail()">${L==='ru'?'Закрыть':L==='en'?'Close':'Yopish'}</button><button class="btn btn-primary" onclick="closeDetail();editItem('mentor',${id})">✏️ Tahrirlash</button>`;
  const photoSrc=mentorPhotoSrc(m);
  let profileAvatarHtml=photoSrc?`<img class="av-photo-lg" src="${photoSrc}" alt="${m.name}" onclick="openLightbox('${photoSrc}')" style="cursor:zoom-in">`:`<div class="detail-av ${AV_CLS[idx%5]}" style="font-size:24px;width:68px;height:68px;border-radius:50%">${ini(m.name)}</div>`;
  let fileHtml='';
  if(m.resumeFile){
    const isImg=m.resumeFile.type&&m.resumeFile.type.startsWith('image/');
    // FIX #4: Clicking file/image opens lightbox (large view) for images, download for files
    if(isImg){
      const imgSrc=`data:${m.resumeFile.type};base64,${m.resumeFile.data}`;
      fileHtml=`<div class="detail-groups" style="margin-top:12px"><div class="dg-title">🖼 Yuklangan rasm</div><img src="${imgSrc}" class="detail-resume-img" onclick="openLightbox('${imgSrc}')" style="cursor:zoom-in;transition:transform .2s" onmouseover="this.style.transform='scale(1.01)'" onmouseout="this.style.transform='scale(1)'"><div style="font-size:11px;color:var(--text3);margin-top:6px;text-align:center">🔍 Rasmni kattalashtirish uchun bosing</div></div>`;
    } else {
      fileHtml=`<div class="detail-groups" style="margin-top:12px"><div class="dg-title">📎 Yuklangan fayl</div><div class="file-preview" style="cursor:pointer" onclick="downloadBase64('${m.resumeFile.data}','${m.resumeFile.name}','${m.resumeFile.type}')"><span style="font-size:20px">📄</span><span class="file-preview-name">${m.resumeFile.name}</span><span class="badge b-blue">⬇ Yuklab olish</span></div></div>`;
    }
  }
  const groupsHtml=groups.length?`<div class="detail-groups"><div class="dg-title">Guruhlar (${groups.length})</div>${groups.map(g=>{const sc=D.students.filter(s=>s.groupId===g.id).length;return `<div class="dg-item" onclick="closeDetail();_attMonth=null;setTimeout(()=>showGroupStudents(${g.id}),150)" style="cursor:pointer" onmouseover="this.style.background='var(--accent-light)'" onmouseout="this.style.background='var(--bg3)'"><span><b>${g.name}</b> <span style="color:var(--text2)">· ${g.course}</span></span><div style="display:flex;gap:6px"><span class="badge b-blue">👥 ${sc} ta</span><span class="badge b-teal">📋 Davomat →</span><span class="badge ${g.status==='Faol'?'b-teal':'b-gray'}">${g.status}</span></div></div>`;}).join('')}</div>`:'';
  document.getElementById('detail-body').innerHTML=`<div class="detail-profile">${profileAvatarHtml}<div><div class="detail-name">${m.name}</div><div class="detail-role">${m.subject}${m.experience?' · '+m.experience:''}</div><div class="detail-id">Qo'shilgan: ${fmtDate(m.joinDate)}</div></div></div><div class="detail-stats"><div class="detail-stat"><div class="ds-val" style="color:var(--accent)">${groups.length}</div><div class="ds-label">Guruhlar</div></div><div class="detail-stat"><div class="ds-val" style="color:var(--teal-text)">${students.length}</div><div class="ds-label">Talabalar</div></div><div class="detail-stat"><div class="ds-val" style="color:var(--purple)">0</div><div class="ds-label">Bitiruvchi</div></div><div class="detail-stat"><div class="ds-val" style="color:var(--amber-text)">${frozen}</div><div class="ds-label">Muzlatilgan</div></div></div><div class="detail-fields"><div class="df-item"><div class="df-label">📱 Telefon</div><div class="df-val">${m.phone||'—'}</div></div><div class="df-item"><div class="df-label">📧 Email</div><div class="df-val">${m.email||'—'}</div></div><div class="df-item"><div class="df-label">✈️ Telegram</div><div class="df-val">${m.telegram||'—'}</div></div><div class="df-item"><div class="df-label">📍 Yashash joyi</div><div class="df-val">${m.address||'—'}</div></div></div>${m.resume?`<div class="detail-groups" style="margin-top:12px"><div class="dg-title">📄 Bio / Rezyume</div><div class="history-box">${m.resume}</div></div>`:''}${fileHtml}${groupsHtml}`;
  document.getElementById('detail-overlay').classList.add('open');
}
function downloadBase64(data,name,type){const a=document.createElement('a');a.href=`data:${type};base64,${data}`;a.download=name;a.click();}
function formatBytes(b){if(!b)return '—';if(b<1024)return b+'B';if(b<1048576)return Math.round(b/1024)+'KB';return (b/1048576).toFixed(1)+'MB';}

// ===================== STUDENT DETAIL =====================
let _currentDetailStudentId=null;
function openDetailStudent(id){
  _currentDetailStudentId=id;
  const s=D.students.find(x=>x.id===id);if(!s)return;
  const idx=D.students.indexOf(s);
  const grp=D.groups.find(x=>x.id===s.groupId);
  const mentorName=grp?grp.mentor:null;
  const coursePrice=grp?getCoursePrice(grp.course):0;
  const lessonPrice=coursePrice>0?Math.round(coursePrice/LESSON_COUNT):0;
  const sm={Aktiv:'b-teal',Faolsiz:'b-gray',Muzlatilgan:'b-blue',Probatsiya:'b-amber',Arxiv:'b-purple'};
  const si={Aktiv:'✅',Faolsiz:'⛔',Muzlatilgan:'❄️',Probatsiya:'🔶',Arxiv:'📦'};
  document.getElementById('detail-title').textContent='🧑‍💻 Talaba profili';
  const footHtml=s.isDebtor
    ?`<button class="btn" onclick="closeDetail()">${L==='ru'?'Закрыть':L==='en'?'Close':'Yopish'}</button><button class="btn btn-pay-green" onclick="markStudentPaid(${id})">✅ To'landi</button><button class="btn btn-primary" onclick="closeDetail();editItem('student',${id})">✏️ Tahrirlash</button>`
    :`<button class="btn" onclick="closeDetail()">${L==='ru'?'Закрыть':L==='en'?'Close':'Yopish'}</button><button class="btn btn-primary" onclick="closeDetail();editItem('student',${id})">✏️ Tahrirlash</button>`;
  document.getElementById('detail-foot').innerHTML=footHtml;
  const monthData=grp?calcStudentAllMonthsDebt(s.id,s.groupId):[];
  // ---- 1.3: Faqat joriy oy + hali to'lanmagan (qarzdor) oylar ko'rsatiladi ----
  // Eski, to'langan yoki hech qachon "to'liq oy"ga yetmagan oylar ro'yxatda
  // ketma-ket chiqib, foydalanuvchini chalg'itmasligi uchun yashiriladi.
  const _now=new Date();const _curM=_now.getMonth(),_curY=_now.getFullYear();
  const visibleMonthData=monthData.filter(m=>(m.month===_curM&&m.year===_curY)||m.isFullMonth);
  let totalPresent=0,totalAbsent=0,totalExcused=0,totalKY=0,totalToPay=0;
  visibleMonthData.forEach(m=>{totalPresent+=m.present;totalAbsent+=m.absent;totalExcused+=m.excused;totalKY+=m.payLessons;totalToPay+=m.toPay;});
  let debtHtml='';
  if(grp&&coursePrice>0){
    const monthRows=visibleMonthData.map(m=>{
      const pct=m.marked>0?Math.round(m.present/m.marked*100):0;
      const isCurrent=(m.month===_curM&&m.year===_curY);
      const rowAccent=m.isFullMonth?'pay-row-full':m.payLessons>0?'pay-row-partial':'pay-row-empty';
      const monthBadge=m.isFullMonth?`<span class="pay-badge-debtor">💸 Qarzdor</span>`:isCurrent?`<span class="pay-badge-debtor" style="background:var(--accent-light);color:var(--accent)">📍 ${t('current_month')}</span>`:'';
      return `<div class="pay-month-card ${rowAccent}"><div class="pay-mc-top"><span class="pay-mc-month">📅 ${m.label}</span>${monthBadge}<span class="pay-mc-pct" style="color:${pct>=80?'var(--teal-text)':pct>=50?'var(--amber-text)':'var(--orange-text)'}">${pct}%</span></div><div class="pay-mc-pills"><span class="pay-pill-k">✅ K: <b>${m.present}</b></span><span class="pay-pill-y">⚠️ Y: <b>${m.absent}</b></span><span class="pay-pill-s">💬 S: <b>${m.excused}</b></span><span class="pay-pill-info">📚 ${m.marked}/${LESSON_COUNT}</span></div><div class="pay-mc-calc"><div class="pay-mc-formula"><span class="pay-formula-chip pay-fc-ky">${m.payLessons} dars (K+Y+S)</span><span style="font-size:13px;color:var(--text3)">×</span><span class="pay-formula-chip pay-fc-price">${fmtMoney(m.lessonPrice)} so'm</span><span style="font-size:13px;color:var(--text3)">=</span><span class="pay-formula-chip pay-fc-total" style="color:${m.toPay>0?'var(--orange-text)':'var(--teal-text)'}">💰 ${fmtMoney(m.toPay)} so'm</span></div></div></div>`;
    }).join('');
    debtHtml=`<div class="pay-block"><div class="pay-header"><div class="pay-header-left"><div class="pay-header-title">💰 To'lov hisobi</div><div class="pay-header-status ${s.isDebtor?'pay-status-debtor':'pay-status-paid'}">${s.isDebtor?L==='ru'?'💸 Должник':L==='en'?'💸 Debtor':'💸 Qarzdor':'✅ To\'lagan'}</div></div><div class="pay-header-rule"><div class="pay-rule-item">📚 ${LESSON_COUNT} dars/oy</div><div class="pay-rule-item">💵 ${fmtMoney(lessonPrice)} so'm/dars</div></div></div><div class="pay-formula-explain"><div class="pfe-item pfe-k"><div class="pfe-icon">✅</div><div><div class="pfe-title">K — Keldi</div><div class="pfe-desc">Yechiladi</div></div></div><div class="pfe-item pfe-y"><div class="pfe-icon">⚠️</div><div><div class="pfe-title">Y — Yo'q</div><div class="pfe-desc">Yechiladi</div></div></div><div class="pfe-item pfe-s"><div class="pfe-icon">💬</div><div><div class="pfe-title">S — Sababli</div><div class="pfe-desc">Yechiladi</div></div></div><div class="pfe-item pfe-full"><div class="pfe-icon">💸</div><div><div class="pfe-title">12 dars = Qarzdor</div><div class="pfe-desc">Probatsiya</div></div></div></div>${visibleMonthData.length>0?`<div class="pay-total-stats"><div class="pay-ts-item pay-ts-k"><div class="pay-ts-num">${totalPresent}</div><div class="pay-ts-lbl">✅ Keldi</div></div><div class="pay-ts-item pay-ts-y"><div class="pay-ts-num">${totalAbsent}</div><div class="pay-ts-lbl">⚠️ Yo'q</div></div><div class="pay-ts-item pay-ts-s"><div class="pay-ts-num">${totalExcused}</div><div class="pay-ts-lbl">💬 Sababli</div></div><div class="pay-ts-item pay-ts-ky"><div class="pay-ts-num">${totalKY}</div><div class="pay-ts-lbl">📚 To'lanadigan</div></div></div>`:''}<div class="pay-info-grid"><div class="pay-info-item"><div class="pay-info-lbl">🎓 Mentor</div><div class="pay-info-val">${mentorName||'—'}</div></div><div class="pay-info-item pay-info-accent"><div class="pay-info-lbl">👥 Guruh</div><div class="pay-info-val">${grp.name}</div></div><div class="pay-info-item pay-info-teal"><div class="pay-info-lbl">💰 Oylik</div><div class="pay-info-val">${fmtMoney(coursePrice)} so'm</div></div></div><div class="pay-months-wrap">${visibleMonthData.length===0?`<div class="pay-nodata">Hali davomat kiritilmagan</div>`:monthRows}</div>${visibleMonthData.length>0?`<div class="pay-summary-bar"><span>Jami (K+Y+S): <b style="color:var(--text)">${totalKY} dars</b></span><span>To'lash kerak: <b style="color:var(--orange-text)">${fmtMoney(totalToPay)} so'm</b></span></div>`:''} ${s.isDebtor?`<button class="pay-main-btn" onclick="markStudentPaid(${id})">✅ To'landi — Qarzdorlikni yopish</button>`:''}</div>`;
  }
  document.getElementById('detail-body').innerHTML=`<div class="detail-profile"><div class="detail-av ${AV_CLS[idx%5]}" style="font-size:24px;width:68px;height:68px">${ini(s.name)}</div><div><div class="detail-name">${s.name}</div><div class="detail-role">${grp?grp.name+' — '+grp.course:'—'}</div><div class="detail-id">${generateStudentId(s.id)}</div><div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap"><span class="badge ${sm[s.status]||'b-gray'}">${si[s.status]||''} ${s.status}</span><span class="badge ${s.isDebtor?'b-orange':'b-teal'}">${s.isDebtor?L==='ru'?'💸 Должник':L==='en'?'💸 Debtor':'💸 Qarzdor':'✅ To\'lagan'}</span></div></div></div><div class="detail-fields"><div class="df-item"><div class="df-label">📱 Telefon</div><div class="df-val">${s.phone||'—'}</div></div><div class="df-item"><div class="df-label">🎂 Tug'ilgan</div><div class="df-val">${s.birthDate?fmtDate(s.birthDate):'—'}</div></div><div class="df-item"><div class="df-label">👨‍👩‍👦 Ota-onasi</div><div class="df-val">${s.parentName||'—'}</div></div><div class="df-item"><div class="df-label">📞 Ota-ona tel</div><div class="df-val">${s.parentPhone||'—'}</div></div><div class="df-item"><div class="df-label">📍 Manba</div><div class="df-val">${s.source||'—'}</div></div><div class="df-item"><div class="df-label">📅 Qo'shilgan</div><div class="df-val">${fmtDate(s.joinDate)}</div></div>${grp?`<div class="df-item"><div class="df-label">👥 Guruh</div><div class="df-val">${grp.name}</div></div><div class="df-item"><div class="df-label">🎓 Mentor</div><div class="df-val">${grp.mentor||'—'}</div></div>`:''}</div>${debtHtml}<div class="detail-groups" style="margin-top:12px"><div class="dg-title">📋 Izohlar</div><div class="history-box">${s.notes||'Hozircha izoh yo\'q.'}</div></div>`;
  document.getElementById('detail-overlay').classList.add('open');
}
function closeDetail(){document.getElementById('detail-overlay').classList.remove('open');}
function closeStatModal(){document.getElementById('stat-overlay').classList.remove('open');_attGid=null;_attMonth=null;_attYear=null;}

