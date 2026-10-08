
// ===================== TALABA ALOHIDA SAHIFALAR =====================

// Helper: joriy talaba ma'lumotlarini olish
function getCurrentStudentInfo(){
  const cu=getCurrentUser();
  const studentId=cu.studentId?parseInt(cu.studentId):null;
  const s=studentId?D.students.find(x=>x.id===studentId):null;
  const grp=s?D.groups.find(x=>x.id===s.groupId):null;
  return {cu,studentId,s,grp};
}

// ===================== DARS JADVALI SAHIFASI =====================
function renderStudentSchedulePage(){
  const wrap=document.getElementById('student-schedule-wrap');if(!wrap)return;
  const {s,grp}=getCurrentStudentInfo();
  const notFoundLbl=LANG==='ru'?'Студент не найден':LANG==='en'?'Student not found':'Talaba topilmadi';
  const noGroupLbl=LANG==='ru'?'Группа не назначена':LANG==='en'?'No group assigned':'Guruh biriktirilmagan';
  if(!s){wrap.innerHTML=`<div style="text-align:center;padding:60px 20px;color:var(--text3)"><div style="font-size:48px">📅</div><div style="font-size:15px;font-weight:600;margin-top:12px">${notFoundLbl}</div></div>`;return;}
  if(!grp){wrap.innerHTML=`<div style="text-align:center;padding:60px 20px;color:var(--text3)"><div style="font-size:48px">👥</div><div style="font-size:15px;font-weight:600;margin-top:12px">${noGroupLbl}</div></div>`;return;}

  const DAY_SHORT_UZ={Du:'Du',Se:'Se',Ch:'Ch',Pa:'Pa',Ju:'Ju',Sh:'Sh'};
  const DAY_SHORT_RU={Du:'Пн',Se:'Вт',Ch:'Ср',Pa:'Чт',Ju:'Пт',Sh:'Сб'};
  const DAY_SHORT_EN={Du:'Mon',Se:'Tue',Ch:'Wed',Pa:'Thu',Ju:'Fri',Sh:'Sat'};
  const DAY_LONG_UZ={Du:'Dushanba',Se:'Seshanba',Ch:'Chorshanba',Pa:'Payshanba',Ju:'Juma',Sh:'Shanba'};
  const DAY_LONG_RU={Du:'Понедельник',Se:'Вторник',Ch:'Среда',Pa:'Четверг',Ju:'Пятница',Sh:'Суббота'};
  const DAY_LONG_EN={Du:'Monday',Se:'Tuesday',Ch:'Wednesday',Pa:'Thursday',Ju:'Friday',Sh:'Saturday'};
  const DAY_SHORT=LANG==='ru'?DAY_SHORT_RU:LANG==='en'?DAY_SHORT_EN:DAY_SHORT_UZ;
  const DAY_LONG=LANG==='ru'?DAY_LONG_RU:LANG==='en'?DAY_LONG_EN:DAY_LONG_UZ;

  const today=new Date();
  const todayDay=['Yak','Du','Se','Ch','Pa','Ju','Sh'][today.getDay()];
  const days=grp.days||[];
  const dayOrder=['Du','Se','Ch','Pa','Ju','Sh','Yak'];
  const todayIdx=dayOrder.indexOf(todayDay);
  let nextDay=null,daysUntil=999;
  days.forEach(d=>{
    const idx=dayOrder.indexOf(d);
    const diff=idx>=todayIdx?idx-todayIdx:7-(todayIdx-idx);
    if(diff<daysUntil){daysUntil=diff;nextDay=d;}
  });

  const todayLbl=LANG==='ru'?'Сегодня 🟢':LANG==='en'?'Today 🟢':'Bugun 🟢';
  const nextLbl=LANG==='ru'?'Следующий →':LANG==='en'?'Next →':'Keyingi →';
  const daysHtml=dayOrder.filter(d=>d!=='Yak').map(d=>{
    const active=days.includes(d);
    const isToday=d===todayDay&&active;
    const isNext=d===nextDay&&daysUntil>0;
    return `<div style="flex:1;min-width:72px;border-radius:var(--r-lg);border:2px solid ${isToday?'var(--teal)':isNext?'var(--accent)':'var(--border2)'};background:${isToday?'var(--teal-light)':isNext?'var(--accent-light)':active?'var(--bg2)':'var(--bg3)'};padding:14px 8px;text-align:center;opacity:${active?1:0.35}">
      <div style="font-size:11px;font-weight:700;color:${isToday?'var(--teal-text)':isNext?'var(--accent-text)':'var(--text3)'};text-transform:uppercase;letter-spacing:.5px">${DAY_SHORT[d]||d}</div>
      <div style="font-size:12px;font-weight:800;color:${isToday?'var(--teal-text)':isNext?'var(--accent-text)':'var(--text)'};margin-top:4px">${DAY_LONG[d]||d}</div>
      ${isToday?`<div style="font-size:10px;color:var(--teal-text);margin-top:4px;font-weight:700">${todayLbl}</div>`:''}
      ${isNext&&!isToday?`<div style="font-size:10px;color:var(--accent-text);margin-top:4px;font-weight:700">${nextLbl}</div>`:''}
      ${active&&!isToday&&!isNext?`<div style="font-size:18px;margin-top:4px">📚</div>`:''}
    </div>`;
  }).join('');

  const attStats=[];
  if(D.attendance){
    const keys=Object.keys(D.attendance).filter(k=>k.startsWith('att_'+grp.id+'_')).sort();
    const monthNames=getMonthNames(true);
    keys.forEach(k=>{
      const parts=k.split('_');const yr=parseInt(parts[3]),mn=parseInt(parts[4]);
      const sAtt=D.attendance[k]?.['s'+s.id]||{};
      let p=0,a=0,e=0;
      for(let l=1;l<=LESSON_COUNT;l++){const v=sAtt['l'+l]||'';if(v==='K')p++;else if(v==='Y')a++;else if(v==='S')e++;}
      if(p+a+e>0) attStats.push({yr,mn,p,a,e,pct:Math.round(p/(p+a+e)*100),label:(monthNames[mn]||mn)+' '+yr});
    });
  }

  const noAttLbl=LANG==='ru'?'Посещаемость ещё не отмечена':LANG==='en'?'No attendance recorded yet':'Hali davomat belgilanmagan';
  const attHtml=attStats.length?attStats.map(x=>{
    const c=x.pct>=80?'var(--teal-text)':x.pct>=60?'var(--amber-text)':'var(--orange-text)';
    const bc=x.pct>=80?'var(--teal-light)':x.pct>=60?'var(--amber-light)':'rgba(234,88,12,.08)';
    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:${bc};border-radius:var(--r-md);border:1px solid var(--border)">
      <div style="font-size:12px;font-weight:700;color:var(--text2);min-width:100px">${x.label}</div>
      <div style="flex:1;height:10px;background:var(--bg4);border-radius:5px;overflow:hidden"><div style="height:100%;width:${x.pct}%;background:${c};border-radius:5px;transition:width .4s"></div></div>
      <span style="font-size:13px;font-weight:800;color:${c};min-width:40px;text-align:right">${x.pct}%</span>
      <span style="font-size:11px;color:var(--text3)">K:${x.p} Y:${x.a} S:${x.e}</span>
    </div>`;
  }).join(''):`<div style="text-align:center;padding:30px;color:var(--text3);font-size:13px">${noAttLbl}</div>`;

  const schedLbl=LANG==='ru'?'Расписание занятий':LANG==='en'?'Class Schedule':'Dars jadvali';
  const groupWord=LANG==='ru'?'группа':LANG==='en'?'group':'guruhi';
  const weekLbl=LANG==='ru'?'📆 Расписание недели':LANG==='en'?'📆 Weekly Schedule':'📆 Haftalik jadval';
  const groupInfoLbl=LANG==='ru'?'ℹ️ О группе':LANG==='en'?'ℹ️ Group Info':'ℹ️ Guruh ma\'lumotlari';
  const mentorLbl=LANG==='ru'?'🎓 Ментор':LANG==='en'?'🎓 Mentor':'🎓 Mentor';
  const mentorRoleLbl=LANG==='ru'?'Ментор группы':LANG==='en'?'Group mentor':'Guruh mentori';
  const writeLbl=LANG==='ru'?'💬 Написать ментору →':LANG==='en'?'💬 Write to mentor →':'💬 Mentorga yozish →';
  const attHistLbl=LANG==='ru'?'📊 История посещаемости':LANG==='en'?'📊 Attendance History':'📊 Davomat tarixi';
  const todayClassLbl=LANG==='ru'?'🟢 Урок сегодня!':LANG==='en'?'🟢 Class today!':'🟢 Bugun dars bor!';
  const nextClassLbl=LANG==='ru'?`⏳ Следующий урок через ${daysUntil} дн.`:LANG==='en'?`⏳ Next class in ${daysUntil} day(s)`:`⏳ Keyingi dars: ${daysUntil} kundan`;
  const roomXona=LANG==='ru'?'-каб.':LANG==='en'?'-room':'-xona';
  const crsLbl=LANG==='ru'?'📚 Курс':LANG==='en'?'📚 Course':'📚 Kurs';
  const strtLbl=LANG==='ru'?'📋 Начало':LANG==='en'?'📋 Start':'📋 Boshlanish';
  const durLbl=LANG==='ru'?'⏱ Длит.':LANG==='en'?'⏱ Duration':'⏱ Davomiylik';
  const roomLabel=LANG==='ru'?'🚪 Кабинет':LANG==='en'?'🚪 Room':'🚪 Xona';
  const timeLabel=LANG==='ru'?'⏰ Время':LANG==='en'?'⏰ Time':'⏰ Vaqt';

  wrap.innerHTML=`<div style="padding:0 0 32px">
    <div style="background:linear-gradient(135deg,var(--teal),var(--accent));border-radius:var(--r-lg);padding:22px 26px;color:#fff;margin-bottom:20px;position:relative;overflow:hidden">
      <div style="position:absolute;right:-10px;top:-10px;font-size:100px;opacity:.08">📅</div>
      <div style="font-size:13px;opacity:.85">${schedLbl}</div>
      <div style="font-size:22px;font-weight:800;margin:4px 0">${grp.name} ${groupWord}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">
        <span style="background:rgba(255,255,255,.2);padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700">⏰ ${grp.timeStart||'—'} – ${grp.timeEnd||'—'}</span>
        <span style="background:rgba(255,255,255,.2);padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700">🚪 ${grp.room||'—'}${roomXona}</span>
        <span style="background:rgba(255,255,255,.2);padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700">🎓 ${grp.mentor||'—'}</span>
        ${nextDay&&daysUntil===0?`<span style="background:rgba(255,255,255,.3);padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700">${todayClassLbl}</span>`:''}
        ${nextDay&&daysUntil>0?`<span style="background:rgba(255,255,255,.2);padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700">${nextClassLbl}</span>`:''}
      </div>
    </div>
    <div style="background:var(--bg);border:1.5px solid var(--border2);border-radius:var(--r-lg);padding:20px 22px;margin-bottom:20px;box-shadow:var(--shadow-sm)">
      <div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:14px">${weekLbl}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${daysHtml}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
      <div style="background:var(--bg);border:1.5px solid var(--border2);border-radius:var(--r-lg);padding:18px 20px;box-shadow:var(--shadow-sm)">
        <div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:14px">${groupInfoLbl}</div>
        <div style="display:flex;flex-direction:column;gap:9px;font-size:13px">
          <div style="display:flex;gap:8px"><span style="color:var(--text3);min-width:100px">${crsLbl}</span><span style="font-weight:600">${grp.course||'—'}</span></div>
          <div style="display:flex;gap:8px"><span style="color:var(--text3);min-width:100px">${strtLbl}</span><span style="font-weight:600">${fmtDate(grp.startDate)}</span></div>
          <div style="display:flex;gap:8px"><span style="color:var(--text3);min-width:100px">${durLbl}</span><span style="font-weight:600">${grp.duration||'—'}</span></div>
          <div style="display:flex;gap:8px"><span style="color:var(--text3);min-width:100px">${roomLabel}</span><span style="font-weight:600;color:var(--teal-text)">${grp.room||'—'}</span></div>
          <div style="display:flex;gap:8px"><span style="color:var(--text3);min-width:100px">${timeLabel}</span><span style="font-weight:700;color:var(--accent)">${grp.timeStart||'—'} – ${grp.timeEnd||'—'}</span></div>
        </div>
      </div>
      <div style="background:var(--bg);border:1.5px solid var(--border2);border-radius:var(--r-lg);padding:18px 20px;box-shadow:var(--shadow-sm)">
        <div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:14px">${mentorLbl}</div>
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
          <div class="av av-0" style="width:48px;height:48px;font-size:18px;flex-shrink:0">${ini(grp.mentor||'M')}</div>
          <div>
            <div style="font-size:16px;font-weight:800;color:var(--text)">${grp.mentor||'—'}</div>
            <div style="font-size:12px;color:var(--text3);margin-top:2px">${mentorRoleLbl}</div>
          </div>
        </div>
        <button class="btn btn-primary btn-sm" style="width:100%" onclick="go('student-chat',document.getElementById('nav-student-chat'))">${writeLbl}</button>
      </div>
    </div>
    <div style="background:var(--bg);border:1.5px solid var(--border2);border-radius:var(--r-lg);padding:20px 22px;box-shadow:var(--shadow-sm)">
      <div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:16px">${attHistLbl}</div>
      <div style="display:flex;flex-direction:column;gap:8px">${attHtml}</div>
    </div>
  </div>`;
}
// ===================== GURUH REYTINGI SAHIFASI =====================
function renderStudentRatingPage(){
  const wrap=document.getElementById('student-rating-wrap');if(!wrap)return;
  const {s,grp}=getCurrentStudentInfo();
  const noDataLbl=LANG==='ru'?'Данные не найдены':LANG==='en'?'Data not found':'Ma\'lumot topilmadi';
  if(!s||!grp){wrap.innerHTML=`<div style="text-align:center;padding:60px;color:var(--text3)"><div style="font-size:48px">🏆</div><div style="font-size:15px;font-weight:600;margin-top:12px">${noDataLbl}</div></div>`;return;}

  const ratings=calcGroupRating(grp.id);
  const myRank=ratings.findIndex(x=>x.id===s.id)+1;
  const myRating=calcStudentRating(s.id,grp.id);
  const statusBadge={Aktiv:'b-teal',Faolsiz:'b-gray',Muzlatilgan:'b-blue',Probatsiya:'b-amber',Arxiv:'b-purple'};

  const topHtml=ratings.slice(0,3).map((r,idx)=>{
    const medal=['🥇','🥈','🥉'][idx];
    const isMe=r.id===s.id;
    const c=r.rating>=80?'var(--teal-text)':r.rating>=60?'var(--amber-text)':'var(--orange-text)';
    const heights=['80px','64px','52px'];
    const rAvg=calcStudentSimpleGradeStats(r.id).avg;
    const isFirst=idx===0;
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;flex:1;min-width:0">
      <div class="av ${AV_CLS[idx%5]}" style="width:${isFirst?'60px':'52px'};height:${isFirst?'60px':'52px'};font-size:${isFirst?'20px':'18px'};border:3px solid ${isMe?'var(--accent)':isFirst?'#f5b301':'transparent'};box-shadow:${isFirst?'0 0 0 4px rgba(245,179,1,.25), 0 4px 16px rgba(245,179,1,.35)':'none'};flex-shrink:0">${ini(r.name)}</div>
      <div style="font-size:12px;font-weight:700;color:${isMe?'var(--accent-text)':'var(--text)'};text-align:center;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.name}${isMe?' 👈':''}</div>
      <div style="font-size:11px;font-weight:800;color:${c};white-space:nowrap">${r.rating}%${rAvg!==null?` · 🏅${rAvg}`:''}</div>
      <div style="font-size:18px;line-height:1">${medal}</div>
      <div style="width:100%;height:${heights[idx]};background:${isFirst?'linear-gradient(180deg,#fbbf24,#f5b301)':c};border-radius:var(--r-md) var(--r-md) 0 0;opacity:${isFirst?1:.8}"></div>
    </div>`;
  }).join('');

  const youLbl=LANG==='ru'?'(Вы)':LANG==='en'?'(You)':'(Siz)';
  const listHtml=ratings.map((r,idx)=>{
    const isMe=r.id===s.id;
    const rc=r.rating>=80?'var(--teal-text)':r.rating>=60?'var(--amber-text)':'var(--orange-text)';
    const rgBg=r.rating>=80?'var(--teal)':r.rating>=60?'var(--amber)':'var(--orange)';
    const medal=idx===0?'🥇':idx===1?'🥈':idx===2?'🥉':`${idx+1}`;
    const rAvg=calcStudentSimpleGradeStats(r.id).avg;
    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:var(--r-md);border:${isMe?'2px solid var(--accent)':'1.5px solid var(--border)'};background:${isMe?'var(--accent-light)':'var(--bg2)'};margin-bottom:6px;transition:.2s">
      <span style="font-size:${idx<3?'16px':'13px'};min-width:30px;text-align:center;font-weight:800">${medal}</span>
      <div class="av ${AV_CLS[idx%5]}" style="width:34px;height:34px;font-size:12px;flex-shrink:0;border:${isMe?'2px solid var(--accent)':'2px solid transparent'}">${ini(r.name)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:${isMe?700:500};color:${isMe?'var(--accent-text)':'var(--text)'}">${r.name}${isMe?' '+youLbl:''}</div>
        <div style="height:4px;background:var(--bg4);border-radius:2px;margin-top:4px;overflow:hidden"><div style="height:100%;width:${r.rating}%;background:${rgBg};border-radius:2px"></div></div>
      </div>
      ${rAvg!==null?_gradePill(rAvg):`<span style="font-size:10px;color:var(--text3)">—</span>`}
      ${r.isDebtor?`<span style="font-size:11px;color:var(--orange-text);font-weight:700">💸</span>`:''}
      <span style="font-size:14px;font-weight:800;color:${rc};min-width:46px;text-align:right">${r.rating}%</span>
    </div>`;
  }).join('');

  const ratingColor=myRating>=80?'var(--teal-text)':myRating>=60?'var(--amber-text)':'var(--orange-text)';
  const ratingTitle=LANG==='ru'?'Рейтинг группы':LANG==='en'?'Group Rating':'Guruh reytingi';
  const groupWord=LANG==='ru'?'группа':LANG==='en'?'group':'guruhi';
  const myRankLbl=LANG==='ru'?`Ваше место: ${myRank}/${ratings.length}`:LANG==='en'?`Your rank: ${myRank}/${ratings.length}`:`Sizning o'rningiz: ${myRank}/${ratings.length}`;
  const myRatingLbl=LANG==='ru'?`Ваш рейтинг: ${myRating}%`:LANG==='en'?`Your rating: ${myRating}%`:`Reytingiz: ${myRating}%`;
  const top3Lbl=LANG==='ru'?'🏅 Топ 3 студента':LANG==='en'?'🏅 Top 3 Students':'🏅 Top 3 talaba';
  const fullListLbl=LANG==='ru'?'📋 Полный рейтинг':LANG==='en'?'📋 Full Ranking':'📋 To\'liq reyting';
  const byAttLbl=LANG==='ru'?'(по посещаемости)':LANG==='en'?'(by attendance)':'(davomat foizi bo\'yicha)';

  wrap.innerHTML=`<div style="padding:0 0 32px">
    <div style="background:linear-gradient(135deg,var(--accent),#7c3aed);border-radius:var(--r-lg);padding:22px 26px;color:#fff;margin-bottom:20px;position:relative;overflow:hidden">
      <div style="position:absolute;right:-10px;top:-10px;font-size:100px;opacity:.08">🏆</div>
      <div style="font-size:13px;opacity:.85">${ratingTitle}</div>
      <div style="font-size:22px;font-weight:800;margin:4px 0">${grp.name} ${groupWord}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">
        <span style="background:rgba(255,255,255,.2);padding:4px 14px;border-radius:20px;font-size:13px;font-weight:700">${myRankLbl}</span>
        <span style="background:rgba(255,255,255,.2);padding:4px 14px;border-radius:20px;font-size:13px;font-weight:700">${myRatingLbl}</span>
      </div>
    </div>
    ${ratings.length>=2?`<div style="background:var(--bg);border:1.5px solid var(--border2);border-radius:var(--r-lg);padding:24px 22px 0;margin-bottom:20px;box-shadow:var(--shadow-sm)">
      <div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:20px">${top3Lbl}</div>
      <div style="display:flex;align-items:flex-end;gap:12px;padding-top:32px">${topHtml}</div>
    </div>`:''}
    <div style="background:var(--bg);border:1.5px solid var(--border2);border-radius:var(--r-lg);padding:20px 22px;box-shadow:var(--shadow-sm)">
      <div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:14px">${fullListLbl} <span style="font-size:12px;font-weight:500;color:var(--text3)">${byAttLbl}</span></div>
      <div>${listHtml}</div>
    </div>
  </div>`;
}
// ===================== BAHOLASH SAHIFASI (TALABA) =====================
function renderStudentGradesPage(){
  const wrap=document.getElementById('student-grades-wrap');if(!wrap)return;
  const {s,grp}=getCurrentStudentInfo();
  const noDataLbl = LANG==='ru'?'Данные не найдены':LANG==='en'?'Data not found':'Ma\'lumot topilmadi';
  if(!s||!grp){wrap.innerHTML=`<div style="text-align:center;padding:60px;color:var(--text3)"><div style="font-size:48px">🏅</div><div style="font-size:15px;font-weight:600;margin-top:12px">${noDataLbl}</div></div>`;return;}

  const weightedData=calcStudentWeightedScore(s.id,grp.id);
  const score=weightedData.score; // already percentage (weighted)
  const letter=weightedData.letter;
  const filled=weightedData.filled;
  const criteria=D.gradingCriteria?.[grp.id]||[];
  const grades=D.grades?.[grp.id]?.[s.id]||{};
  const gradeColor=score>=90?'var(--teal-text)':score>=80?'var(--accent-text)':score>=70?'var(--amber-text)':'var(--orange-text)';

  const noCriteriaLbl = LANG==='ru'?'Критерии оценки не добавлены':LANG==='en'?'No grading criteria added':'Baholash mezonlari qo\'shilmagan';
  const criteriaLbl = LANG==='ru'?'Результаты по критериям':LANG==='en'?'Results by Criteria':'Mezonlar bo\'yicha natijalar';
  const weightLbl = LANG==='ru'?'Вес':LANG==='en'?'Weight':'Og\'irlik';
  const scoreLbl = LANG==='ru'?'Балл':LANG==='en'?'Score':'Ball';
  const notEnteredLbl = LANG==='ru'?'Не введено':LANG==='en'?'Not entered':'Kiritilmagan';
  const finalGradeLbl = LANG==='ru'?'Итоговая оценка':LANG==='en'?'Final Grade':'Yakuniy baho';
  const totalPctLbl = LANG==='ru'?'Общий процент':LANG==='en'?'Total Percent':'Umumiy foiz';
  const gradingResultsLbl = LANG==='ru'?'Результаты оценки':LANG==='en'?'Grading Results':'Baholash natijalari';
  const noCriteriaYetLbl = LANG==='ru'?'Ещё нет критериев. Ментор добавит их.':LANG==='en'?'No criteria yet. Mentor will add them.':'Hali mezon yo\'q. Mentor qo\'shganda ko\'rinadi.';

  const criteriaHtml=criteria.length?criteria.map(c=>{
    const val=grades[c.id];
    const hasVal = val !== undefined && val !== null;
    const pct2=hasVal && c.maxScore>0?Math.round(val/c.maxScore*100):0;
    const cc=!hasVal?'var(--text3)':pct2>=80?'var(--teal-text)':pct2>=60?'var(--amber-text)':'var(--orange-text)';
    const barBg=!hasVal?'var(--bg4)':pct2>=80?'var(--teal)':pct2>=60?'var(--amber)':'var(--orange)';
    return `<div style="background:var(--bg2);border:1.5px solid var(--border);border-radius:var(--r-md);padding:16px 18px;transition:.15s" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--text)">${c.name}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">${weightLbl}: <b>${c.weight}%</b></div>
        </div>
        <div style="text-align:right">
          <div style="font-size:20px;font-weight:900;color:${cc}">${hasVal?val:'—'}<span style="font-size:11px;font-weight:500;color:var(--text3)">/${c.maxScore}</span></div>
          <div style="font-size:11px;font-weight:700;color:${cc}">${hasVal?pct2+'%':notEnteredLbl}</div>
        </div>
      </div>
      <div style="height:10px;background:var(--bg4);border-radius:6px;overflow:hidden"><div style="height:100%;width:${pct2}%;background:${barBg};border-radius:6px;transition:width .6s ease"></div></div>
    </div>`;
  }).join(''):`<div style="text-align:center;padding:40px 20px;color:var(--text3)"><div style="font-size:40px;margin-bottom:10px">📋</div><div style="font-size:13px;font-weight:600">${noCriteriaYetLbl}</div></div>`;

  wrap.innerHTML=`<div style="padding:0 0 32px">
    <!-- Banner -->
    <div style="background:linear-gradient(135deg,var(--amber),var(--accent));border-radius:var(--r-lg);padding:22px 26px;color:#fff;margin-bottom:20px;position:relative;overflow:hidden">
      <div style="position:absolute;right:-10px;top:-10px;font-size:100px;opacity:.08">🏅</div>
      <div style="font-size:13px;opacity:.85">${gradingResultsLbl}</div>
      <div style="font-size:22px;font-weight:800;margin:4px 0">${s.name}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">
        <span style="background:rgba(255,255,255,.25);padding:4px 14px;border-radius:20px;font-size:13px;font-weight:700">📚 ${grp.name}</span>
        <span style="background:rgba(255,255,255,.25);padding:4px 14px;border-radius:20px;font-size:13px;font-weight:700">🎓 ${grp.mentor||'—'}</span>
        ${filled?`<span style="background:rgba(255,255,255,.3);padding:4px 14px;border-radius:20px;font-size:14px;font-weight:800">🏅 ${letter} · ${score}%</span>`:''}
      </div>
    </div>

    <!-- Umumiy natija -->
    ${filled?`<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
      <div style="background:var(--bg);border:2px solid ${gradeColor};border-radius:var(--r-lg);padding:20px;text-align:center;box-shadow:var(--shadow-sm)">
        <div style="font-size:56px;font-weight:900;color:${gradeColor}">${letter}</div>
        <div style="font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-top:4px">${finalGradeLbl}</div>
      </div>
      <div style="background:var(--bg);border:1.5px solid var(--border2);border-radius:var(--r-lg);padding:20px;text-align:center;box-shadow:var(--shadow-sm)">
        <div style="font-size:40px;font-weight:900;color:${gradeColor}">${score}%</div>
        <div style="font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-top:4px">${totalPctLbl}</div>
        <div style="width:100%;height:10px;background:var(--bg4);border-radius:6px;margin-top:10px;overflow:hidden"><div style="height:100%;width:${score}%;background:${gradeColor};border-radius:6px;transition:width .6s"></div></div>
      </div>
    </div>`:''}

    <!-- Mezonlar bo'yicha tafsilot -->
    <div style="background:var(--bg);border:1.5px solid var(--border2);border-radius:var(--r-lg);padding:20px 22px;box-shadow:var(--shadow-sm)">
      <div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:16px">📋 ${criteriaLbl}</div>
      <div style="display:flex;flex-direction:column;gap:10px">${criteriaHtml}</div>
    </div>

  </div>`;
}

// ===================== TESTLAR SAHIFASI (TALABA) =====================
function renderStudentTestsPage(){
  const wrap=document.getElementById('student-tests-wrap');if(!wrap)return;
  const {s,grp}=getCurrentStudentInfo();
  if(!s||!grp){wrap.innerHTML=`<div style="text-align:center;padding:60px;color:var(--text3)"><div style="font-size:48px">📝</div><div style="font-size:15px;font-weight:600;margin-top:12px">Ma'lumot topilmadi</div></div>`;return;}

  const tests=(D.tests||[]).filter(t=>t.groupId===grp.id);

  if(!tests.length){
    wrap.innerHTML=`<div style="text-align:center;padding:60px;color:var(--text3)"><div style="font-size:48px">📝</div><div style="font-size:15px;font-weight:600;margin-top:12px">Hozircha testlar yo'q</div><div style="font-size:13px;margin-top:8px">Mentor test qo'shganda bu yerda ko'rinadi</div></div>`;
    return;
  }

  const testsHtml=tests.map(t=>{
    const result=D.testResults?.[t.id]?.[s.id];
    const done=!!result;
    // 🔧 BUG FIX: result.score allaqachon FOIZ (0-100) sifatida saqlanadi
    // (submitStudentTest'da `Math.round(correct/total*100)` bilan hisoblanadi).
    // Bu yerda esa uni yana `t.questions.length`ga bo'lib, yana 100'ga
    // ko'paytirilardi — natijada 100% o'rniga 10000% chiqib qolardi (masalan,
    // score=100, questions.length=1 bo'lsa: 100/1*100=10000).
    const pct=done?result.score:null;
    const pc=done?(pct>=80?'var(--teal-text)':pct>=60?'var(--amber-text)':'var(--orange-text)'):null;
    const startLbl=LANG==='ru'?'▶ Начать тест':LANG==='en'?'▶ Start Test':'▶ Testni boshlash';
    const doneLbl=LANG==='ru'?'Завершён ✅':LANG==='en'?'Completed ✅':'Yakunlandi ✅';
    const newLbl=LANG==='ru'?'Новый 🆕':LANG==='en'?'New 🆕':'Yangi 🆕';
    const qLbl=LANG==='ru'?'вопросов':LANG==='en'?'questions':'ta savol';
    const minLbl=LANG==='ru'?'мин':LANG==='en'?'min':'daqiqa';
    return `<div style="background:var(--bg);border:2px solid ${done?'var(--border2)':'var(--accent)'};border-radius:var(--r-lg);padding:18px 20px;box-shadow:var(--shadow-sm);cursor:${done?'default':'pointer'};transition:.15s"
      ${!done?`onclick="startStudentTest(${t.id},${s.id})"
      onmouseover="if(!${done})this.style.transform='translateY(-2px)';this.style.boxShadow='var(--shadow)'"
      onmouseout="this.style.transform='';this.style.boxShadow='var(--shadow-sm)'"`:''}>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
        <div style="flex:1">
          <div style="font-size:15px;font-weight:800;color:var(--text)">${t.title}</div>
          <div style="font-size:12px;color:var(--text3);margin-top:4px">📚 ${grp.course} · ${t.questions.length} ${qLbl}${t.timeLimit?` · ⏱ ${t.timeLimit} ${minLbl}`:''}</div>
        </div>
        ${done?`<div style="text-align:center;background:var(--bg2);border-radius:var(--r-md);padding:10px 16px;border:1px solid var(--border)">
          <div style="font-size:20px;font-weight:900;color:${pc}">${pct}%</div>
          <div style="font-size:10px;color:var(--text3);">${result.correct}/${result.total}</div>
        </div>`:`<span style="background:var(--accent-light);color:var(--accent-text);padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap;border:1px solid var(--accent)">${newLbl}</span>`}
      </div>
      <div style="margin-top:14px">
        ${done?`<div style="display:flex;gap:8px;align-items:center">
          <div style="flex:1;height:8px;background:var(--bg4);border-radius:4px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${pc};border-radius:4px"></div></div>
          <span style="font-size:12px;font-weight:700;color:var(--text3)">${doneLbl}</span>
        </div>`
        :`<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--accent-light);border-radius:var(--r-md);border:1px dashed var(--accent)">
          <span style="font-size:13px;color:var(--accent-text);font-weight:700">👆 ${startLbl}</span>
        </div>`}
      </div>
    </div>`;
  }).join('');

  const done=tests.filter(t=>D.testResults?.[t.id]?.[s.id]).length;
  wrap.innerHTML=`<div style="padding:0 0 32px">
    <!-- Banner -->
    <div style="background:linear-gradient(135deg,#0d9488,#0ea5e9);border-radius:var(--r-lg);padding:22px 26px;color:#fff;margin-bottom:20px;position:relative;overflow:hidden">
      <div style="position:absolute;right:-10px;top:-10px;font-size:100px;opacity:.08">📝</div>
      <div style="font-size:13px;opacity:.85">Testlar</div>
      <div style="font-size:22px;font-weight:800;margin:4px 0">${grp.name} guruhi</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">
        <span style="background:rgba(255,255,255,.2);padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700">📝 ${tests.length} ta test</span>
        <span style="background:rgba(255,255,255,.2);padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700">✅ ${done} ta yakunlangan</span>
        <span style="background:rgba(255,255,255,.2);padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700">⏳ ${tests.length-done} ta qolgan</span>
      </div>
    </div>
    <div id="student-test-taking-wrap"></div>
    <div style="display:flex;flex-direction:column;gap:12px">${testsHtml}</div>
  </div>`;
}

// ===================== CHAT SAHIFASI (ALOHIDA) =====================
let _studentChatPollTimer=null;
let _studentChatLastHash='';

function _studChatHash(msgs){ return msgs.length+'|'+((msgs[msgs.length-1]||{}).ts||(msgs[msgs.length-1]||{}).time||0)+'|'+msgs.filter(m=>m.from==='student'&&m.read).length; }

function _buildStudentChatMsgsHtml(msgs, mentorName, L){
  if(!msgs.length) return `<div style="text-align:center;padding:40px;color:var(--text3)"><div style="font-size:48px;margin-bottom:12px">💬</div><div style="font-size:14px;font-weight:600">Hali xabar yo'q</div><div style="font-size:12px;margin-top:6px">Mentorga savol yuboring!</div></div>`;
  return msgs.map(m=>{
    const isMe=m.from==='student';
    const ts=m.ts||(m.time?new Date(m.time).getTime():0);
    const d=ts?new Date(ts):null;
    const time=d?d.toLocaleTimeString('uz',{hour:'2-digit',minute:'2-digit'}):'';
    const date=d?d.toLocaleDateString('uz',{day:'2-digit',month:'short'}):'';
    return `<div style="display:flex;justify-content:${isMe?'flex-end':'flex-start'};margin-bottom:10px">
      <div style="max-width:72%;padding:10px 14px;border-radius:${isMe?'16px 4px 16px 16px':'4px 16px 16px 16px'};background:${isMe?'var(--accent)':'var(--bg3)'};color:${isMe?'#fff':'var(--text)'};font-size:13px;line-height:1.5;box-shadow:var(--shadow-sm)">
        <div style="font-size:10px;opacity:.7;margin-bottom:4px;font-weight:600">${isMe?'Siz':'🎓 '+mentorName}${date?' · '+date+' '+time:''}</div>
        ${typeof _chatAttachmentHtml==='function'?_chatAttachmentHtml(m):''}
        ${m.text?`<span data-emoji-ok>${m.text.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>`:''}
        ${isMe?`<div style="text-align:right;margin-top:3px;font-size:10px">${m.read?`<span style="color:#cfe8ff;font-weight:700">✓✓</span>`:'<span style="opacity:.7">✓</span>'}</div>`:''}
      </div>
    </div>`;
  }).join('');
}

function renderStudentChatPage(){
  if(_studentChatPollTimer){ clearInterval(_studentChatPollTimer); _studentChatPollTimer=null; }
  const wrap=document.getElementById('student-chat-wrap');if(!wrap)return;
  const {s,grp}=getCurrentStudentInfo();
  if(!s||!grp){
    wrap.innerHTML=`<div style="flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;color:var(--text3)"><div style="font-size:48px">💬</div><div style="font-size:15px;font-weight:600">Ma'lumot topilmadi</div></div>`;
    return;
  }
  const mentorName=grp.mentor||'';
  let msgs=getMentorChatMessages(mentorName,s.id)||[];
  // Mentordan kelgan xabarlarni "o'qildi" deb belgilaymiz (talaba chatni ochdi)
  if(msgs.some(m=>m.from==='mentor'&&!m.read)){
    msgs=msgs.map(m=>m.from==='mentor'?{...m,read:true}:m);
    saveMentorChatMessages(mentorName,s.id,msgs);
  }
  _studentChatLastHash=_studChatHash(msgs);
  const msgsHtml=_buildStudentChatMsgsHtml(msgs,mentorName,LANG);
  const onlineNow=typeof isPresenceOnline==='function'&&isPresenceOnline(localStorage.getItem(_presenceKeyFor('mentor',mentorName)));

  wrap.innerHTML=`
    <div style="padding:16px 20px;border-bottom:1px solid var(--border);background:var(--bg2);flex-shrink:0;display:flex;align-items:center;gap:12px">
      <div style="position:relative;flex-shrink:0"><div class="av av-0" style="width:40px;height:40px;font-size:14px">${ini(mentorName||'M')}</div><span style="position:absolute;bottom:-1px;right:-1px;width:11px;height:11px;border-radius:50%;background:${onlineNow?'#22c55e':'transparent'};border:2px solid ${onlineNow?'var(--bg2)':'transparent'}"></span></div>
      <div style="flex:1">
        <div style="font-size:15px;font-weight:800;color:var(--text)">${mentorName||'—'}</div>
        <div id="student-chat-header-status" style="font-size:11px;color:${onlineNow?'var(--teal-text)':'var(--text3)'}">${onlineNow?'🟢 '+t('online_status'):t('offline_status')}</div>
      </div>
    </div>
    <div id="student-chat-page-msgs" style="flex:1;overflow-y:auto;padding:16px 20px;background:var(--bg)">${msgsHtml}</div>
    <div id="student-chat-emoji-picker" data-emoji-ok style="display:none;padding:10px 20px;border-top:1px solid var(--border);background:var(--bg2);flex-wrap:wrap;gap:6px">
      ${CHAT_EMOJIS.map(e=>`<span onclick="insertChatEmoji('${e}')" style="font-size:20px;cursor:pointer;padding:4px">${e}</span>`).join('')}
    </div>
    <div style="padding:12px 16px;border-top:1px solid var(--border);background:var(--bg2);flex-shrink:0;display:flex;gap:8px">
      <input type="file" id="student-chat-file-input" style="display:none" accept="image/*,.pdf,.doc,.docx,.zip" onchange="_studentChatPageFileSelected(this)">
      <button class="btn btn-sm" onclick="document.getElementById('student-chat-file-input').click()" title="${t('attach_file')}">📎</button>
      <button class="btn btn-sm" onclick="const p=document.getElementById('student-chat-emoji-picker');p.style.display=p.style.display==='none'?'flex':'none'" title="Emoji">😊</button>
      <input type="text" id="student-chat-page-inp" placeholder="${LANG==='ru'?'Написать сообщение...':LANG==='en'?'Type a message...':'Xabar yozing...'}" style="flex:1;padding:10px 14px;border:1.5px solid var(--border2);border-radius:12px;background:var(--bg);color:var(--text);font-size:13px" onkeydown="if(event.key==='Enter')sendStudentChatPageMsg()">
      <button class="btn btn-primary" onclick="sendStudentChatPageMsg()" style="padding:10px 18px">➤</button>
    </div>`;

  setTimeout(()=>{const m=document.getElementById('student-chat-page-msgs');if(m)m.scrollTop=m.scrollHeight;},50);

  // Real-time polling — endi backend KV'dan ham tekshiradi (boshqa qurilma bo'lsa ham ko'radi)
  _studentChatPollTimer=setInterval(async ()=>{
    if(typeof _chatPollRemoteAll==='function') await _chatPollRemoteAll(['mchat_','presence_']);
    const fresh=getMentorChatMessages(mentorName,s.id)||[];
    const h=_studChatHash(fresh);
    if(h!==_studentChatLastHash){
      _studentChatLastHash=h;
      const box=document.getElementById('student-chat-page-msgs');
      if(!box) return;
      const atBottom=box.scrollHeight-box.scrollTop-box.clientHeight<60;
      box.innerHTML=_buildStudentChatMsgsHtml(fresh,mentorName,LANG);
      if(atBottom) box.scrollTop=box.scrollHeight;
    }
    const statusEl=document.getElementById('student-chat-header-status');
    if(statusEl&&typeof isPresenceOnline==='function'){
      const on=isPresenceOnline(localStorage.getItem(_presenceKeyFor('mentor',mentorName)));
      statusEl.textContent=on?'🟢 '+t('online_status'):'⚪ '+presenceLastSeenLabel(localStorage.getItem(_presenceKeyFor('mentor',mentorName)));
      statusEl.style.color=on?'var(--teal-text)':'var(--text3)';
    }
  },3000);
}

async function _studentChatPageFileSelected(input){
  const file=input.files&&input.files[0];
  if(!file) return;
  const {s,grp}=getCurrentStudentInfo();
  if(!s||!grp) return;
  try{
    const dataUrl=await _fileToDataURL(file);
    const mentorName=grp.mentor||'';
    const msgs=getMentorChatMessages(mentorName,s.id)||[];
    const ts=Date.now();
    msgs.push({from:'student',text:'',ts,time:new Date(ts).toISOString(),read:false,file:{name:file.name,data:dataUrl,isImage:file.type.startsWith('image/')}});
    saveMentorChatMessages(mentorName,s.id,msgs);
    _studentChatLastHash=_studChatHash(msgs);
    const box=document.getElementById('student-chat-page-msgs');
    if(box){ box.innerHTML=_buildStudentChatMsgsHtml(msgs,mentorName,LANG); box.scrollTop=box.scrollHeight; }
  }catch(e){ toast('⚠️ '+t('file_too_big')); }
  input.value='';
}

function sendStudentChatPageMsg(){
  const {s,grp}=getCurrentStudentInfo();
  if(!s||!grp)return;
  const inp=document.getElementById('student-chat-page-inp');
  const text=(inp?.value||'').trim();
  if(!text)return;
  const mentorName=grp.mentor||'';
  const msgs=getMentorChatMessages(mentorName,s.id)||[];
  const ts=Date.now();
  msgs.push({from:'student',text,ts,time:new Date(ts).toISOString(),read:false});
  saveMentorChatMessages(mentorName,s.id,msgs);
  inp.value='';
  const picker=document.getElementById('student-chat-emoji-picker'); if(picker) picker.style.display='none';
  _studentChatLastHash=_studChatHash(msgs);
  const box=document.getElementById('student-chat-page-msgs');
  if(box){ box.innerHTML=_buildStudentChatMsgsHtml(msgs,mentorName,LANG); box.scrollTop=box.scrollHeight; }
}

// Dashboard da click qilinganda tafsilot ko'rsatish (talaba)
function showStudentDetailPopup(field){
  const {s,grp}=getCurrentStudentInfo();
  if(!s)return;
  const DAY_FULL={Du:'Dushanba',Se:'Seshanba',Ch:'Chorshanba',Pa:'Payshanba',Ju:'Juma',Sh:'Shanba'};

  let html='',title='';
  if(field==='rating'){
    title='🏆 Reyting tafsiloti';
    const ratings=grp?calcGroupRating(grp.id):[];
    const myRank=ratings.findIndex(x=>x.id===s.id)+1;
    const statusBadge={Aktiv:'b-teal',Faolsiz:'b-gray',Muzlatilgan:'b-blue',Probatsiya:'b-amber',Arxiv:'b-purple'};
    const listHtml=ratings.map((r,idx)=>{
      const isMe=r.id===s.id;
      const rc=r.rating>=80?'var(--teal-text)':r.rating>=60?'var(--amber-text)':'var(--orange-text)';
      const medal=idx===0?'🥇':idx===1?'🥈':idx===2?'🥉':`${idx+1}.`;
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:var(--r-md);border:1.5px solid ${isMe?'var(--accent)':'var(--border)'};background:${isMe?'var(--accent-light)':'var(--bg2)'};margin-bottom:5px">
        <span style="font-size:14px;min-width:28px;text-align:center">${medal}</span>
        <div class="av ${AV_CLS[idx%5]}" style="width:28px;height:28px;font-size:10px;flex-shrink:0">${ini(r.name)}</div>
        <span style="flex:1;font-size:13px;font-weight:${isMe?700:400};color:${isMe?'var(--accent-text)':'var(--text)'}">${r.name}${isMe?' (Siz)':''}</span>
        <span class="badge ${statusBadge[r.status]||'b-gray'}" style="font-size:10px">${r.status}</span>
        <span style="font-size:14px;font-weight:800;color:${rc}">${r.rating}%</span>
      </div>`;
    }).join('');
    html=`<div style="margin-bottom:12px;background:var(--accent-light);border-radius:var(--r-md);padding:12px 16px;border:1px solid var(--accent)"><span style="font-size:13px;font-weight:700;color:var(--accent-text)">Sizning o'rningiz: ${myRank}/${ratings.length} · Reyting: ${calcStudentRating(s.id,grp?.id)}%</span></div>${listHtml}`;
  } else if(field==='schedule'){
    title='📅 Dars jadvali';
    html=grp?`<div style="display:flex;flex-direction:column;gap:10px;font-size:14px">
      <div style="display:flex;gap:10px;align-items:center"><span style="color:var(--text3);min-width:100px">⏰ Vaqt</span><span style="font-weight:700;color:var(--accent);font-size:16px">${grp.timeStart||'—'} – ${grp.timeEnd||'—'}</span></div>
      <div style="display:flex;gap:10px;align-items:center"><span style="color:var(--text3);min-width:100px">🚪 Xona</span><span style="font-weight:700;color:var(--teal-text);font-size:16px">${grp.room||'—'}-xona</span></div>
      <div style="display:flex;gap:10px;align-items:flex-start"><span style="color:var(--text3);min-width:100px">📆 Kunlar</span><div style="display:flex;flex-wrap:wrap;gap:6px">${(grp.days||[]).map(d=>`<span style="background:var(--accent-light);color:var(--accent-text);padding:4px 12px;border-radius:12px;font-size:12px;font-weight:700;border:1px solid var(--accent)">${DAY_FULL[d]||d}</span>`).join('')}</div></div>
      <div style="display:flex;gap:10px;align-items:center"><span style="color:var(--text3);min-width:100px">🎓 Mentor</span><span style="font-weight:600">${grp.mentor||'—'}</span></div>
      <div style="display:flex;gap:10px;align-items:center"><span style="color:var(--text3);min-width:100px">📚 Kurs</span><span style="font-weight:600">${grp.course||'—'}</span></div>
      <div style="display:flex;gap:10px;align-items:center"><span style="color:var(--text3);min-width:100px">📋 Boshlanish</span><span style="font-weight:600">${fmtDate(grp.startDate)}</span></div>
    </div>`:'<div style="color:var(--text3)">Guruh topilmadi</div>';
  } else if(field==='debt'){
    title='💸 To\'lov holati';
    html=`<div style="text-align:center;padding:20px 0">
      <div style="font-size:56px">${s.isDebtor?'💸':'✅'}</div>
      <div style="font-size:20px;font-weight:800;margin-top:12px;color:${s.isDebtor?'var(--orange-text)':'var(--teal-text)'}">${s.isDebtor?'Qarzdor':'To\'lov qilingan'}</div>
      ${s.isDebtor?`<div style="font-size:13px;color:var(--text3);margin-top:8px">12 ta darsdan keyin avtomatik ravishda qarzdor sifatida belgilanadi</div>`:`<div style="font-size:13px;color:var(--text3);margin-top:8px">Barcha to'lovlar amalga oshirilgan</div>`}
      <div style="margin-top:16px;background:var(--bg2);border-radius:var(--r-md);padding:12px 16px;text-align:left">
        <div style="font-size:12px;color:var(--text3);margin-bottom:6px;font-weight:600">Talaba ma'lumotlari:</div>
        <div style="font-size:13px;display:flex;gap:8px"><span style="color:var(--text3)">Holat:</span><span class="badge ${s.status==='Aktiv'?'b-teal':'b-gray'}">${s.status}</span></div>
        ${s.phone?`<div style="font-size:13px;margin-top:6px;display:flex;gap:8px"><span style="color:var(--text3)">Telefon:</span><span style="font-weight:600">${s.phone}</span></div>`:''}
      </div>
    </div>`;
  } else if(field==='attendance'){
    title='📊 Davomat tafsiloti';
    const now=new Date();const cm=now.getMonth(),cy=now.getFullYear();
    const attKey='att_'+(s.groupId)+'_'+cy+'_'+cm;
    const sAtt=(D.attendance&&D.attendance[attKey]&&D.attendance[attKey]['s'+s.id])||{};
    let present=0,absent=0,excused=0;
    for(let l=1;l<=LESSON_COUNT;l++){const v=sAtt['l'+l]||'';if(v==='K')present++;else if(v==='Y')absent++;else if(v==='S')excused++;}
    const marked=present+absent+excused;
    const pct=marked>0?Math.round(present/marked*100):0;
    html=`<div>
      <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
        <span style="background:var(--teal-light);color:var(--teal-text);padding:6px 14px;border-radius:12px;font-weight:700;font-size:13px">✅ Keldi: ${present}</span>
        <span style="background:var(--amber-light);color:var(--amber-text);padding:6px 14px;border-radius:12px;font-weight:700;font-size:13px">❌ Yo'q: ${absent}</span>
        <span style="background:var(--purple-light);color:var(--purple-text);padding:6px 14px;border-radius:12px;font-weight:700;font-size:13px">📝 Sababli: ${excused}</span>
      </div>
      <div style="font-size:13px;font-weight:600;color:var(--text3);margin-bottom:8px">Bu oy (har bir dars):</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${Array.from({length:LESSON_COUNT},(_,i)=>{
          const v=sAtt['l'+(i+1)]||'';
          const styleMap={'':'background:var(--bg3);border-color:var(--border2);color:var(--text3)','K':'background:var(--teal-light);border-color:var(--teal);color:var(--teal-text)','Y':'background:var(--amber-light);border-color:var(--amber);color:var(--amber-text)','S':'background:var(--purple-light);border-color:var(--purple);color:var(--purple-text)'};
          return `<div style="display:flex;flex-direction:column;align-items:center;gap:3px"><span style="font-size:9px;color:var(--text3)">${i+1}</span><div style="${styleMap[v]||styleMap['']};width:32px;height:28px;border-radius:6px;border:1.5px solid;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;font-family:'JetBrains Mono',monospace">${v||'·'}</div></div>`;
        }).join('')}
      </div>
      <div style="margin-top:14px;font-size:16px;font-weight:800;color:${pct>=80?'var(--teal-text)':pct>=60?'var(--amber-text)':'var(--orange-text)'};text-align:center">${pct}% davomat</div>
    </div>`;
  }

  // Show in detail modal
  document.getElementById('detail-title').textContent=title;
  document.getElementById('detail-body').innerHTML=html;
  document.getElementById('detail-foot').innerHTML=`<button class="btn" onclick="closeDetail()">${L==='ru'?'Закрыть':L==='en'?'Close':'Yopish'}</button>`;
  document.getElementById('detail-overlay').classList.add('open');
}


// ===================== MENTOR DASHBOARD POPUP FUNKSIYALAR =====================

function showMentorStatDetail(type) {
  const cu = getCurrentUser();
  const mentorName = cu.mentorName || cu.name;
  const myGroups = D.groups.filter(g => g.mentor === mentorName);
  const myStudents = D.students.filter(s => myGroups.some(g => g.id === s.groupId));
  const activeStudents = myStudents.filter(s => s.status === 'Aktiv');
  const debtors = myStudents.filter(s => s.isDebtor);
  const DAY_FULL = {Du:'Du',Se:'Se',Ch:'Ch',Pa:'Pa',Ju:'Ju',Sh:'Sh'};
  const statusBadge = {Aktiv:'b-teal',Faolsiz:'b-gray',Muzlatilgan:'b-blue',Probatsiya:'b-amber',Arxiv:'b-purple'};
  let title = '', html = '';

  if (type === 'groups') {
    title = '🗂 Mening guruhlarim';
    html = myGroups.length ? myGroups.map(g => {
      const cnt = D.students.filter(s => s.groupId === g.id).length;
      const active = D.students.filter(s => s.groupId === g.id && s.status === 'Aktiv').length;
      const daysStr = (g.days||[]).map(d => DAY_FULL[d]||d).join(', ');
      return `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r-md);padding:14px 16px;margin-bottom:8px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="font-size:14px;font-weight:800;color:var(--text)">${g.name}</div>
          <span class="badge ${g.status==='Faol'?'b-teal':'b-gray'}">${g.status}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px">
          <div><span style="color:var(--text3)">📚 Kurs: </span><b>${g.course}</b></div>
          <div><span style="color:var(--text3)">⏰ Vaqt: </span><b style="color:var(--accent)">${g.timeStart||'—'}–${g.timeEnd||'—'}</b></div>
          <div><span style="color:var(--text3)">🚪 Xona: </span><b>${g.room||'—'}</b></div>
          <div><span style="color:var(--text3)">📆 Kun: </span><b>${daysStr||'—'}</b></div>
          <div><span style="color:var(--text3)">👥 Talaba: </span><b>${cnt} ta (${active} aktiv)</b></div>
          <div><span style="color:var(--text3)">📋 Boshl: </span><b>${fmtDate(g.startDate)}</b></div>
        </div>
        <div style="margin-top:10px;display:flex;gap:6px">
          <button class="btn btn-sm btn-primary" style="font-size:11px" onclick="closeDetail();_attMonth=null;showGroupStudents(${g.id})">${L==='ru'?'📋 Посещаемость':L==='en'?'📋 Attendance':'📋 Davomat'}</button>
          <button class="btn btn-sm" style="font-size:11px;background:var(--purple-light);color:var(--purple-text)" onclick="closeDetail();showMentorGroupRating(${g.id})">🏆 Reyting</button>
        </div>
      </div>`;
    }).join('') : '<div style="color:var(--text3);padding:16px 0;text-align:center">Guruhlar yo\'q</div>';

  } else if (type === 'active') {
    title = '✅ Aktiv talabalar';
    html = activeStudents.length ? `<div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="border-bottom:2px solid var(--border2)">
          <th style="text-align:left;padding:7px 10px;font-size:11px;color:var(--text3)">${L==='ru'?'Студент':L==='en'?'Student':'Talaba'}</th>
          <th style="text-align:left;padding:7px 10px;font-size:11px;color:var(--text3)">${L==='ru'?'Группа':L==='en'?'Group':'Guruh'}</th>
          <th style="text-align:right;padding:7px 10px;font-size:11px;color:var(--text3)">${L==='ru'?'Оплата':L==='en'?'Payment':"To'lov"}</th>
        </tr></thead>
        <tbody>${activeStudents.map((s,i) => {
          const grp = myGroups.find(g => g.id === s.groupId);
          return `<tr style="border-bottom:1px solid var(--border);cursor:pointer;transition:.12s" onclick="closeDetail();setTimeout(()=>showMentorStudentDetail(${s.id}),200)" onmouseover="this.style.background='var(--bg2)'" onmouseout="this.style.background=''">
            <td style="padding:7px 10px"><div style="display:flex;align-items:center;gap:7px"><div class="av ${AV_CLS[i%5]}" style="width:24px;height:24px;font-size:9px;flex-shrink:0">${ini(s.name)}</div><span style="font-size:12px;font-weight:600">${s.name}</span></div></td>
            <td style="padding:7px 10px;font-size:12px;color:var(--text2)">${grp?grp.name:'—'}</td>
            <td style="padding:7px 10px;text-align:right"><span class="${s.isDebtor?'badge b-orange':'badge b-teal'}" style="font-size:10px">${s.isDebtor?'💸':'✅'}</span></td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>` : '<div style="color:var(--text3);padding:16px 0;text-align:center">Aktiv talabalar yo\'q</div>';

  } else if (type === 'all') {
    title = '👥 Barcha talabalar';
    const statusIcon = {Aktiv:'✅',Faolsiz:'⛔',Muzlatilgan:'❄️',Probatsiya:'🔶',Arxiv:'📦'};
    html = myStudents.length ? `<div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="border-bottom:2px solid var(--border2)">
          <th style="text-align:left;padding:7px 10px;font-size:11px;color:var(--text3)">${L==='ru'?'Студент':L==='en'?'Student':'Talaba'}</th>
          <th style="text-align:left;padding:7px 10px;font-size:11px;color:var(--text3)">${L==='ru'?'Статус':L==='en'?'Status':'Holat'}</th>
          <th style="text-align:right;padding:7px 10px;font-size:11px;color:var(--text3)">${L==='ru'?'Оплата':L==='en'?'Payment':"To'lov"}</th>
        </tr></thead>
        <tbody>${myStudents.map((s,i) => {
          const grp = myGroups.find(g => g.id === s.groupId);
          const rating = calcStudentRating(s.id, s.groupId);
          return `<tr style="border-bottom:1px solid var(--border);cursor:pointer;transition:.12s" onclick="closeDetail();setTimeout(()=>showMentorStudentDetail(${s.id}),200)" onmouseover="this.style.background='var(--bg2)'" onmouseout="this.style.background=''">
            <td style="padding:7px 10px"><div style="display:flex;align-items:center;gap:7px"><div class="av ${AV_CLS[i%5]}" style="width:24px;height:24px;font-size:9px;flex-shrink:0">${ini(s.name)}</div><div><div style="font-size:12px;font-weight:600">${s.name}</div><div style="font-size:10px;color:var(--text3)">${grp?grp.name:'—'}</div></div></div></td>
            <td style="padding:7px 10px"><span class="badge ${statusBadge[s.status]||'b-gray'}" style="font-size:10px">${statusIcon[s.status]||''} ${s.status}</span></td>
            <td style="padding:7px 10px;text-align:right"><span style="font-size:12px;font-weight:700;color:${rating>=80?'var(--teal-text)':rating>=60?'var(--amber-text)':'var(--orange-text)'}">${rating}%</span></td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>` : '<div style="color:var(--text3);padding:16px 0;text-align:center">Talabalar yo\'q</div>';

  } else if (type === 'debtors') {
    title = '💸 Qarzdor talabalar';
    html = debtors.length ? debtors.map((s,i) => {
      const grp = myGroups.find(g => g.id === s.groupId);
      const absences = calcAbsences(s.id, s.groupId);
      return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(234,88,12,.06);border:1px solid rgba(234,88,12,.2);border-radius:var(--r-md);margin-bottom:7px;cursor:pointer" onclick="closeDetail();setTimeout(()=>showMentorStudentDetail(${s.id}),200)">
        <div class="av av-2" style="width:34px;height:34px;font-size:12px;flex-shrink:0">${ini(s.name)}</div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:700;color:var(--text)">${s.name}</div>
          <div style="font-size:11px;color:var(--text3)">${grp?grp.name:'—'} · 📞 ${s.phone||'—'}</div>
          <div style="font-size:11px;color:var(--orange-text);margin-top:2px">⚠️ ${absences} ta dars o'tkazilgan</div>
        </div>
        <span style="font-size:22px">💸</span>
      </div>`;
    }).join('') : '<div style="text-align:center;padding:30px;color:var(--teal-text)"><div style="font-size:36px">✅</div><div style="font-size:14px;font-weight:600;margin-top:8px">Qarzdor yo\'q!</div></div>';
  }

  document.getElementById('detail-title').textContent = title;
  document.getElementById('detail-body').innerHTML = html;
  document.getElementById('detail-foot').innerHTML = `<button class="btn" onclick="closeDetail()">${L==='ru'?'Закрыть':L==='en'?'Close':'Yopish'}</button>`;
  document.getElementById('detail-overlay').classList.add('open');
}

// Mentor uchun: bitta talabaning to'liq ma'lumoti popup
function showMentorStudentDetail(studentId) {
  const s = D.students.find(x => x.id === studentId);
  if (!s) return;
  const grp = D.groups.find(g => g.id === s.groupId);
  const rating = calcStudentRating(s.id, s.groupId);
  const ratingColor = rating>=80?'var(--teal-text)':rating>=60?'var(--amber-text)':'var(--orange-text)';
  const statusBadge = {Aktiv:'b-teal',Faolsiz:'b-gray',Muzlatilgan:'b-blue',Probatsiya:'b-amber',Arxiv:'b-purple'};
  const statusIcon = {Aktiv:'✅',Faolsiz:'⛔',Muzlatilgan:'❄️',Probatsiya:'🔶',Arxiv:'📦'};

  // Joriy oy davomati
  const now = new Date(); const cm = now.getMonth(), cy = now.getFullYear();
  const attKey = 'att_'+(s.groupId)+'_'+cy+'_'+cm;
  const sAtt = (D.attendance&&D.attendance[attKey]&&D.attendance[attKey]['s'+s.id])||{};
  let present=0,absent=0,excused=0;
  for(let l=1;l<=LESSON_COUNT;l++){const v=sAtt['l'+l]||'';if(v==='K')present++;else if(v==='Y')absent++;else if(v==='S')excused++;}
  const marked=present+absent+excused;
  const pct=marked>0?Math.round(present/marked*100):0;
  const pctColor=pct>=80?'var(--teal-text)':pct>=60?'var(--amber-text)':'var(--orange-text)';

  // Davomat kataklari
  const cellsHtml = Array.from({length:LESSON_COUNT},(_,i)=>{
    const v=sAtt['l'+(i+1)]||'';
    const styleMap={'':'background:var(--bg3);border-color:var(--border2);color:var(--text3)','K':'background:var(--teal-light);border-color:var(--teal);color:var(--teal-text)','Y':'background:var(--amber-light);border-color:var(--amber);color:var(--amber-text)','S':'background:var(--purple-light);border-color:var(--purple);color:var(--purple-text)'};
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:2px"><span style="font-size:9px;color:var(--text3)">${i+1}</span><div style="${styleMap[v]||styleMap['']};width:28px;height:24px;border-radius:5px;border:1.5px solid;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;font-family:'JetBrains Mono',monospace">${v||'·'}</div></div>`;
  }).join('');

  // Guruh reytingidagi o'rni
  const ratings = grp ? calcGroupRating(grp.id) : [];
  const myRank = ratings.findIndex(x=>x.id===s.id)+1;

  // Baholash natijalari
  const {score, maxScore, letter} = calcStudentWeightedScore(s.id, s.groupId);

  const html = `<div>
    <!-- Shaxsiy banner -->
    <div style="background:linear-gradient(135deg,var(--accent),var(--teal));border-radius:var(--r-lg);padding:16px 18px;color:#fff;margin-bottom:16px;display:flex;align-items:center;gap:14px">
      <div class="av av-0" style="width:52px;height:52px;font-size:18px;flex-shrink:0;border:2px solid rgba(255,255,255,.4)">${ini(s.name)}</div>
      <div>
        <div style="font-size:18px;font-weight:800">${s.name}</div>
        <div style="font-size:12px;opacity:.85;margin-top:3px">${grp?grp.name:'—'} · ${grp?grp.course:'—'}</div>
        <span class="badge ${statusBadge[s.status]||'b-gray'}" style="font-size:10px;margin-top:4px">${statusIcon[s.status]||''} ${s.status}</span>
      </div>
    </div>

    <!-- Stat'lar -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">
      <div style="background:var(--bg2);border-radius:var(--r-md);padding:10px;text-align:center;border:1px solid var(--border)">
        <div style="font-size:20px;font-weight:900;color:${ratingColor}">${rating}%</div>
        <div style="font-size:10px;color:var(--text3);font-weight:700;margin-top:2px">Reyting</div>
      </div>
      <div style="background:var(--bg2);border-radius:var(--r-md);padding:10px;text-align:center;border:1px solid var(--border)">
        <div style="font-size:20px;font-weight:900;color:${pctColor}">${pct}%</div>
        <div style="font-size:10px;color:var(--text3);font-weight:700;margin-top:2px">Bu oy davomat</div>
      </div>
      <div style="background:var(--bg2);border-radius:var(--r-md);padding:10px;text-align:center;border:1px solid ${s.isDebtor?'var(--orange)':'var(--teal)'}">
        <div style="font-size:16px;font-weight:900;color:${s.isDebtor?'var(--orange-text)':'var(--teal-text)'}">${s.isDebtor?'💸':'✅'}</div>
        <div style="font-size:10px;color:var(--text3);font-weight:700;margin-top:2px">To'lov</div>
      </div>
    </div>

    <!-- Ma'lumotlar -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;margin-bottom:14px">
      ${s.phone?`<div style="display:flex;gap:6px"><span style="color:var(--text3)">📱</span><b>${s.phone}</b></div>`:''}
      ${s.birthDate?`<div style="display:flex;gap:6px"><span style="color:var(--text3)">🎂</span><b>${fmtDate(s.birthDate)}</b></div>`:''}
      ${s.parentName?`<div style="display:flex;gap:6px"><span style="color:var(--text3)">👪</span><b>${s.parentName}</b></div>`:''}
      ${s.parentPhone?`<div style="display:flex;gap:6px"><span style="color:var(--text3)">📞</span><b>${s.parentPhone}</b></div>`:''}
      <div style="display:flex;gap:6px"><span style="color:var(--text3)">🏆</span><b>O'rin: ${myRank?myRank+'/'+ratings.length:'—'}</b></div>
      <div style="display:flex;gap:6px"><span style="color:var(--text3)">🏅</span><b>Baho: ${letter} (${score}/${maxScore})</b></div>
    </div>

    <!-- Bu oy davomat kataklari -->
    <div style="background:var(--bg2);border-radius:var(--r-md);padding:12px;border:1px solid var(--border);margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:8px">📋 Bu oy davomati</div>
      <div style="display:flex;gap:5px;flex-wrap:wrap">${cellsHtml}</div>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
        <span style="background:var(--teal-light);color:var(--teal-text);padding:3px 8px;border-radius:8px;font-size:11px;font-weight:700">K:${present}</span>
        <span style="background:var(--amber-light);color:var(--amber-text);padding:3px 8px;border-radius:8px;font-size:11px;font-weight:700">Y:${absent}</span>
        <span style="background:var(--purple-light);color:var(--purple-text);padding:3px 8px;border-radius:8px;font-size:11px;font-weight:700">S:${excused}</span>
        <span style="font-size:11px;font-weight:700;color:${pctColor};padding:3px 8px">${pct}%</span>
      </div>
    </div>

    <!-- Harakatlar -->
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-primary btn-sm" onclick="closeDetail();_attMonth=null;showGroupStudents(${s.groupId})" style="font-size:11px">${L==='ru'?'📋 Посещаемость':L==='en'?'📋 Attendance':'📋 Davomat'}</button>
      <button class="btn btn-sm" style="font-size:11px;background:var(--purple-light);color:var(--purple-text)" onclick="closeDetail();showMentorGroupRating(${s.groupId})">🏆 Reyting</button>
      ${s.phone?`<a href="tel:${s.phone}" class="btn btn-sm" style="font-size:11px;text-decoration:none">📱 Qo'ng'iroq</a>`:''}
    </div>
  </div>`;

  document.getElementById('detail-title').textContent = '👤 ' + s.name;
  document.getElementById('detail-body').innerHTML = html;
  document.getElementById('detail-foot').innerHTML = `<button class="btn" onclick="closeDetail()">${L==='ru'?'Закрыть':L==='en'?'Close':'Yopish'}</button>`;
  document.getElementById('detail-overlay').classList.add('open');
}

// Talabaning umumiy yo'qlamalar soni
function calcAbsences(studentId, groupId) {
  if (!D.attendance) return 0;
  let total = 0;
  Object.keys(D.attendance).filter(k => k.startsWith('att_'+groupId+'_')).forEach(k => {
    const sAtt = D.attendance[k]?.['s'+studentId] || {};
    for (let l=1; l<=LESSON_COUNT; l++) {
      if (sAtt['l'+l]==='Y') total++;
    }
  });
  return total;
} 
// ===================== VIDEO DARSLIKLAR =====================
const VIDEO_BLOB_CACHE = {};

// 🔧 BUG FIX: video fayllar endi backend (MongoDB "blobs" collection)da
// alohida saqlanadi — localStorage/kv orqali emas (u yerda ~5-10MB limit bor
// va boshqa CRM ma'lumotlari bilan baham ko'riladi, shu sabab kattaroq video
// fayllar sukut bo'yicha saqlanmay qolardi).
function _videoApiBase() {
  if (typeof __API_BASE__ !== 'undefined' && __API_BASE__) return __API_BASE__;
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return window.location.protocol + '//' + window.location.hostname + ':' + (window.location.port || 3000);
  }
  return window.location.origin;
}
const VIDEO_MAX_FILE_MB = 15; // base64'ga o'tganda ~20MB bo'ladi (backend limiti 25mb)

function _uploadVideoBlob(id, dataUrl, name) {
  return fetch(_videoApiBase() + '/api/blob', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'video_' + id, data: dataUrl, name: name || '' }),
  }).then(r => r.json());
}

function _fetchVideoBlob(id) {
  return fetch(_videoApiBase() + '/api/blob/' + encodeURIComponent('video_' + id))
    .then(r => r.ok ? r.json() : null)
    .then(d => (d && d.ok) ? d.data : null)
    .catch(() => null);
}

function _deleteVideoBlob(id) {
  return fetch(_videoApiBase() + '/api/blob/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'video_' + id }),
  }).catch(() => {});
}

function getVideos() {
  try { return JSON.parse(localStorage.getItem('edumanage_videos_v1') || '[]'); } catch(e) { return []; }
}
function saveVideos(arr) {
  // Base64 fayl ma'lumotlarini localStorage da saqlaymiz
  localStorage.setItem('edumanage_videos_v1', JSON.stringify(arr));
}

function getMentorVideosForUser() {
  const cu = getCurrentUser();
  const all = getVideos();
  return all.filter(v => v.mentorName === (cu.mentorName || cu.name));
}

// ---- MENTOR VIDEO RENDER ----
function renderMentorVideos() {
  const wrap = document.getElementById('mentor-videos-wrap');
  if (!wrap) return;
  const cu = getCurrentUser();
  const vids = getMentorVideosForUser();
  const L = LANG;

  const addLbl = L==='ru'?'+ Добавить урок':L==='en'?'+ Add Lesson':'+ Darslik qo\'shish';
  const emptyLbl = L==='ru'?'Нет уроков. Добавьте первый!':L==='en'?'No lessons yet. Add the first!':'Hali darslik yo\'q. Birinchisini qo\'shing!';
  const countLbl = L==='ru'?'Всего уроков':L==='en'?'Total lessons':'Jami darslik';

  wrap.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px">
      <div style="font-size:14px;color:var(--text2)">
        ${countLbl}: <b style="color:var(--accent-text);font-size:16px">${vids.length}</b>
      </div>
      <button class="btn btn-primary" onclick="openVideoModal(null)" style="padding:10px 20px;font-size:14px;font-weight:700;border-radius:12px">
        🎬 ${addLbl}
      </button>
    </div>
    <div id="video-card-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px"></div>
  `;

  const grid = document.getElementById('video-card-grid');
  if (!vids.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:80px 20px;color:var(--text3)">
      <div style="font-size:64px;margin-bottom:16px">🎬</div>
      <div style="font-size:18px;font-weight:700;margin-bottom:8px">${emptyLbl}</div>
    </div>`;
    return;
  }
  grid.innerHTML = vids.map(v => renderVideoCard(v, true)).join('');

  // Badge count
  const nc = document.getElementById('nc-mentor-videos');
  if (nc) { nc.textContent = vids.length; nc.style.display = vids.length ? 'flex' : 'none'; }
}

// ---- STUDENT VIDEO RENDER ----
function renderStudentVideos() {
  const wrap = document.getElementById('student-videos-wrap');
  if (!wrap) return;
  const cu = getCurrentUser();
  const L = LANG;
  const studentId = cu.studentId ? parseInt(cu.studentId) : null;
  const s = studentId ? D.students.find(x => x.id === studentId) : null;
  const grp = s ? D.groups.find(x => x.id === s.groupId) : null;
  const mentorName = grp ? grp.mentor : null;

  const all = getVideos();
  const vids = all.filter(v => {
    if (!mentorName) return false;
    if (v.mentorName !== mentorName) return false;
    if (v.groupIds && v.groupIds.length > 0) {
      return grp && v.groupIds.includes(grp.id);
    }
    return true;
  });

  const countLbl = L==='ru'?'Доступно уроков':L==='en'?'Available lessons':'Mavjud darsliklar';
  const emptyLbl = L==='ru'?'Ментор ещё не добавил уроки':L==='en'?'Your mentor hasn\'t added lessons yet':'Mentoringiz hali darslik qo\'shmagan';

  wrap.innerHTML = `
    <div style="margin-bottom:24px;font-size:14px;color:var(--text2)">
      ${countLbl}: <b style="color:var(--accent-text);font-size:16px">${vids.length}</b>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px">
      ${vids.length ? vids.map(v => renderVideoCard(v, false)).join('') : `
        <div style="grid-column:1/-1;text-align:center;padding:80px 20px;color:var(--text3)">
          <div style="font-size:64px;margin-bottom:16px">🎬</div>
          <div style="font-size:18px;font-weight:700">${emptyLbl}</div>
        </div>`}
    </div>
  `;
}

// ---- VIDEO CARD ----
function renderVideoCard(v, isOwner) {
  const L = LANG;
  const isYt = v.type === 'youtube';
  const editLbl = L==='ru'?'Изменить':L==='en'?'Edit':'Tahrirlash';
  const delLbl = L==='ru'?'Удалить':L==='en'?'Delete':'O\'chirish';
  const watchLbl = L==='ru'?'Смотреть':L==='en'?'Watch':'Ko\'rish';
  const allGroupsLbl = L==='ru'?'Все группы':L==='en'?'All groups':L==='ru'?'Все группы':L==='en'?'All groups':'Barcha guruhlar';

  const groupNames = v.groupIds && v.groupIds.length
    ? v.groupIds.map(gid => { const g = D.groups.find(x => x.id === gid); return g ? g.name : ''; }).filter(Boolean).join(', ')
    : allGroupsLbl;

  let thumbHtml = '';
  if (isYt) {
    const ytId = extractYouTubeId(v.url);
    const thumb = ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : '';
    thumbHtml = `<div style="position:relative;padding-bottom:56.25%;background:#000;border-radius:12px 12px 0 0;overflow:hidden;cursor:pointer" onclick="playYoutube('${v.url}','${v.id}')">
      ${thumb ? `<img src="${thumb}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">` : ''}
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.3)">
        <div style="width:56px;height:56px;background:#ff0000;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px">▶</div>
      </div>
    </div>`;
  } else {
    thumbHtml = `<div style="background:linear-gradient(135deg,var(--accent),#7c3aed);border-radius:12px 12px 0 0;padding:36px;text-align:center;cursor:pointer" onclick="playUploadedVideo(${v.id})">
      <div style="font-size:52px">▶️</div>
      <div style="color:#fff;font-size:13px;margin-top:8px;font-weight:600;opacity:0.9">${v.fileName||'video.mp4'}</div>
    </div>`;
  }

  return `<div style="background:var(--bg2);border:1.5px solid var(--border2);border-radius:14px;overflow:hidden;transition:box-shadow .2s;box-shadow:0 2px 8px rgba(0,0,0,.08)" onmouseover="this.style.boxShadow='0 8px 24px rgba(0,0,0,.15)'" onmouseout="this.style.boxShadow='0 2px 8px rgba(0,0,0,.08)'">
    ${thumbHtml}
    <div style="padding:14px">
      <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:6px;line-height:1.4">${v.title}</div>
      ${v.desc ? `<div style="font-size:12px;color:var(--text2);margin-bottom:8px;line-height:1.5">${v.desc}</div>` : ''}
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
        <span style="font-size:11px;padding:3px 10px;border-radius:20px;background:${isYt?'#fee2e2':'#ede9fe'};color:${isYt?'#dc2626':'#7c3aed'};font-weight:700">
          ${isYt ? '▶ YouTube' : '📁 Video'}
        </span>
        <span style="font-size:11px;padding:3px 10px;border-radius:20px;background:var(--bg3);color:var(--text3);font-weight:600">👥 ${groupNames}</span>
      </div>
      ${isOwner ? `<div style="display:flex;gap:8px">
        <button class="btn" style="flex:1;font-size:12px;padding:7px" onclick="openVideoModal(${v.id})">✏️ ${editLbl}</button>
        <button class="btn btn-del-outline" style="font-size:12px;padding:7px 12px" onclick="deleteVideo(${v.id})">🗑</button>
      </div>` : `<button class="btn btn-primary" style="width:100%;font-size:13px;padding:8px" onclick="${isYt ? `playYoutube('${v.url}','${v.id}')` : `playUploadedVideo(${v.id})`}">▶ ${watchLbl}</button>`}
    </div>
  </div>`;
}

function extractYouTubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com(?:\/embed\/|\/v\/|\/watch\?v=|\/shorts\/))([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function playYoutube(url, id) {
  const ytId = extractYouTubeId(url);
  if (!ytId) { toast('⚠️ YouTube URL noto\'g\'ri!'); return; }
  const ex = document.getElementById('video-player-overlay');
  if (ex) ex.remove();
  const overlay = document.createElement('div');
  overlay.id = 'video-player-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `
    <div style="position:relative;max-width:860px;width:95%;background:#000;border-radius:14px;overflow:hidden">
      <button onclick="document.getElementById('video-player-overlay').remove()" style="position:absolute;top:10px;right:12px;z-index:1;background:rgba(255,255,255,.2);border:none;color:#fff;font-size:20px;width:38px;height:38px;border-radius:50%;cursor:pointer;font-weight:700">✕</button>
      <div style="padding-bottom:56.25%;position:relative">
        <iframe src="https://www.youtube.com/embed/${ytId}?autoplay=1" style="position:absolute;inset:0;width:100%;height:100%;border:0" allowfullscreen allow="autoplay"></iframe>
      </div>
    </div>`;
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
}

async function playUploadedVideo(videoId) {
  const vids = getVideos();
  const v = vids.find(x => x.id === videoId);
  if (!v) return;
  let src = VIDEO_BLOB_CACHE[videoId] || v.fileData || null;
  // 🔧 BUG FIX: fayl backend'da (blobs collection) saqlangan bo'lsa,
  // kerak bo'lganda shu yerdan olib kelamiz (avval faqat brauzer xotirasida
  // — VIDEO_BLOB_CACHE — bo'lardi, boshqa qurilma/sessiyada video topilmasdi).
  if (!src && v.hasFile) {
    toast('⏳ Video yuklanmoqda...');
    src = await _fetchVideoBlob(videoId);
    if (src) VIDEO_BLOB_CACHE[videoId] = src;
  }
  if (!src) { toast('⚠️ Video topilmadi. Qayta yuklang.'); return; }
  const ex = document.getElementById('video-player-overlay');
  if (ex) ex.remove();
  const overlay = document.createElement('div');
  overlay.id = 'video-player-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `
    <div style="position:relative;max-width:860px;width:95%;background:#000;border-radius:14px;overflow:hidden">
      <button onclick="document.getElementById('video-player-overlay').remove()" style="position:absolute;top:10px;right:12px;z-index:1;background:rgba(255,255,255,.2);border:none;color:#fff;font-size:20px;width:38px;height:38px;border-radius:50%;cursor:pointer;font-weight:700">✕</button>
      <video controls autoplay style="width:100%;display:block;max-height:75vh" src="${src}"></video>
    </div>`;
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
}

// ---- VIDEO MODAL ----
let _editVideoId = null;

function openVideoModal(editId) {
  _editVideoId = editId;
  const cu = getCurrentUser();
  const v = editId ? getVideos().find(x => x.id === editId) : null;
  const L = LANG;

  const titleLbl = editId ? (L==='ru'?'Редактировать урок':L==='en'?'Edit Lesson':'Darslikni tahrirlash') : (L==='ru'?'Новый видеоурок':L==='en'?'New Video Lesson':'Yangi Video Darslik');
  const saveLbl = L==='ru'?'Сохранить':L==='en'?'Save':'Saqlash';
  const cancelLbl = L==='ru'?'Отмена':L==='en'?'Cancel':'Bekor qilish';
  const ytLbl = L==='ru'?'YouTube ссылка':L==='en'?'YouTube Link':'YouTube havola';
  const fileLbl = L==='ru'?'Видеофайл (MP4, WebM)':L==='en'?'Video file (MP4, WebM)':'Video fayl (MP4, WebM)';
  const nameLbl = L==='ru'?'Название урока':L==='en'?'Lesson Title':'Darslik nomi';
  const descLbl = L==='ru'?'Описание (необязательно)':L==='en'?'Description (optional)':'Tavsif (ixtiyoriy)';
  const groupLbl = L==='ru'?'Группы (пусто = все)':L==='en'?'Groups (empty = all)':'Guruhlar (bo\'sh = hammasi)';

  const mName = cu.mentorName || cu.name;
  const myGroups = D.groups.filter(g => g.mentor === mName);

  const groupOptions = myGroups.map(g =>
    `<label style="display:flex;align-items:center;gap:8px;padding:6px;border-radius:8px;cursor:pointer;background:var(--bg3);margin-bottom:4px">
      <input type="checkbox" value="${g.id}" ${v && v.groupIds && v.groupIds.includes(g.id) ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--accent)">
      <span style="font-size:13px;font-weight:600">${g.name}</span>
    </label>`
  ).join('');

  const modal = document.createElement('div');
  modal.id = 'video-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML = `
    <div style="background:var(--bg);border-radius:20px;padding:28px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
        <h2 style="font-size:18px;font-weight:800;color:var(--text);margin:0">🎬 ${titleLbl}</h2>
        <button onclick="closeVideoModal()" style="background:var(--bg3);border:none;color:var(--text2);font-size:20px;width:36px;height:36px;border-radius:50%;cursor:pointer">✕</button>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:20px;background:var(--bg2);border-radius:12px;padding:4px">
        <button id="vtab-yt" onclick="switchVideoTab('yt')" style="flex:1;padding:10px;border:none;border-radius:10px;cursor:pointer;font-weight:700;font-size:13px;background:${!v||v.type==='youtube'?'var(--accent)':'transparent'};color:${!v||v.type==='youtube'?'#fff':'var(--text2)'}">▶ YouTube</button>
        <button id="vtab-file" onclick="switchVideoTab('file')" style="flex:1;padding:10px;border:none;border-radius:10px;cursor:pointer;font-weight:700;font-size:13px;background:${v&&v.type==='file'?'var(--accent)':'transparent'};color:${v&&v.type==='file'?'#fff':'var(--text2)'}">📁 ${fileLbl}</button>
      </div>

      <div id="vtab-yt-body" style="display:${v&&v.type==='file'?'none':'block'}">
        <div class="fg" style="margin-bottom:16px">
          <label style="font-size:12px;font-weight:700;color:var(--text3);display:block;margin-bottom:6px">${ytLbl}</label>
          <input type="text" id="v-url" value="${v&&v.url?v.url:''}" placeholder="https://youtu.be/..." style="width:100%;padding:10px 14px;border-radius:10px;border:1.5px solid var(--border);background:var(--bg2);color:var(--text);font-size:14px">
        </div>
      </div>

      <div id="vtab-file-body" style="display:${v&&v.type==='file'?'block':'none'}">
        <div style="border:2px dashed var(--border2);border-radius:12px;padding:24px;text-align:center;cursor:pointer;background:var(--bg2);margin-bottom:16px" onclick="document.getElementById('v-file-input').click()">
          <div style="font-size:36px;margin-bottom:8px">📁</div>
          <div id="v-file-label" style="font-size:13px;font-weight:600;color:var(--text2)">${v&&v.fileName?v.fileName:'MP4 yoki WebM fayl tanlang'}</div>
          <input type="file" id="v-file-input" accept="video/mp4,video/webm,video/*" style="display:none" onchange="handleVideoFile(this)">
        </div>
      </div>

      <div class="fg" style="margin-bottom:16px">
        <label style="font-size:12px;font-weight:700;color:var(--text3);display:block;margin-bottom:6px">${nameLbl} *</label>
        <input type="text" id="v-title" value="${v?v.title:''}" placeholder="${L==='ru'?'Урок 1 — Введение':L==='en'?'Lesson 1 — Introduction':'1-dars — Kirish'}" style="width:100%;padding:10px 14px;border-radius:10px;border:1.5px solid var(--border);background:var(--bg2);color:var(--text);font-size:14px">
      </div>

      <div class="fg" style="margin-bottom:16px">
        <label style="font-size:12px;font-weight:700;color:var(--text3);display:block;margin-bottom:6px">${descLbl}</label>
        <textarea id="v-desc" rows="2" placeholder="..." style="width:100%;padding:10px 14px;border-radius:10px;border:1.5px solid var(--border);background:var(--bg2);color:var(--text);font-size:14px;resize:vertical">${v?v.desc||'':''}</textarea>
      </div>

      ${myGroups.length ? `<div class="fg" style="margin-bottom:20px">
        <label style="font-size:12px;font-weight:700;color:var(--text3);display:block;margin-bottom:8px">${groupLbl}</label>
        <div id="v-groups">${groupOptions}</div>
      </div>` : ''}

      <div style="display:flex;gap:12px">
        <button onclick="closeVideoModal()" style="flex:1;padding:12px;border:1.5px solid var(--border);background:transparent;border-radius:12px;cursor:pointer;font-weight:700;color:var(--text2)">${cancelLbl}</button>
        <button onclick="saveVideo()" style="flex:2;padding:12px;background:var(--accent);color:#fff;border:none;border-radius:12px;cursor:pointer;font-weight:800;font-size:15px">💾 ${saveLbl}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.onclick = e => { if (e.target === modal) closeVideoModal(); };
}

function switchVideoTab(tab) {
  const ytBody = document.getElementById('vtab-yt-body');
  const fileBody = document.getElementById('vtab-file-body');
  const ytBtn = document.getElementById('vtab-yt');
  const fileBtn = document.getElementById('vtab-file');
  if (tab === 'yt') {
    ytBody.style.display = 'block'; fileBody.style.display = 'none';
    ytBtn.style.background = 'var(--accent)'; ytBtn.style.color = '#fff';
    fileBtn.style.background = 'transparent'; fileBtn.style.color = 'var(--text2)';
  } else {
    ytBody.style.display = 'none'; fileBody.style.display = 'block';
    fileBtn.style.background = 'var(--accent)'; fileBtn.style.color = '#fff';
    ytBtn.style.background = 'transparent'; ytBtn.style.color = 'var(--text2)';
  }
}

let _vFileData = null;
let _vFileName = null;

function handleVideoFile(inp) {
  const file = inp.files[0];
  if (!file) return;
  // 🔧 BUG FIX: avval hajm tekshirilmasdi — katta fayl localStorage limitiga
  // urilib, hech qanday xabarsiz "ishlamay" qolardi. Endi oldindan ogohlantiramiz.
  const maxBytes = VIDEO_MAX_FILE_MB * 1024 * 1024;
  if (file.size > maxBytes) {
    toast(`⚠️ Video fayl juda katta (max ${VIDEO_MAX_FILE_MB}MB). Katta videolar uchun YouTube havolasidan foydalaning.`);
    inp.value = '';
    return;
  }
  const lbl = document.getElementById('v-file-label');
  if (lbl) lbl.textContent = file.name + ' (' + (file.size / 1024 / 1024).toFixed(1) + ' MB)';
  _vFileName = file.name;
  const reader = new FileReader();
  reader.onload = e => {
    _vFileData = e.target.result;
    const vid = document.createElement('video');
    vid.src = _vFileData;
    VIDEO_BLOB_CACHE['preview'] = _vFileData;
    toast('✅ Fayl tanlandi! Saqlash uchun "Saqlash" tugmasini bosing.');
  };
  reader.onerror = () => toast('⚠️ Faylni o\'qib bo\'lmadi, qayta urinib ko\'ring.');
  reader.readAsDataURL(file);
}

function closeVideoModal() {
  const m = document.getElementById('video-modal');
  if (m) m.remove();
  _vFileData = null;
  _vFileName = null;
}

async function saveVideo() {
  const cu = getCurrentUser();
  const title = (document.getElementById('v-title')?.value || '').trim();
  if (!title) { toast('⚠️ ' + (LANG==='ru'?'Введите название!':LANG==='en'?'Enter title!':'Nomi kiriting!')); return; }

  const isFileTab = document.getElementById('vtab-file-body')?.style.display !== 'none';
  const type = isFileTab ? 'file' : 'youtube';
  const url = document.getElementById('v-url')?.value?.trim() || '';

  if (type === 'youtube' && !url) { toast('⚠️ YouTube URL kiriting!'); return; }

  const groupCheckboxes = document.querySelectorAll('#v-groups input[type=checkbox]:checked');
  const groupIds = Array.from(groupCheckboxes).map(c => parseInt(c.value));
  const desc = document.getElementById('v-desc')?.value?.trim() || '';

  const vids = getVideos();
  const mName = cu.mentorName || cu.name;
  const videoId = _editVideoId || Date.now();

  // 🔧 BUG FIX: video fayl mavjud bo'lsa, uni AVVAL backend'ga (MongoDB
  // blobs collection) yuklaymiz — localStorage/kv ga emas. Shu tufayli
  // katta fayllar ham to'g'ri saqlanadi va bir nechta videolar bo'lsa ham
  // umumiy hajm chegarasiga urilmaydi.
  if (type === 'file' && _vFileData) {
    toast('⏳ Video yuklanmoqda...');
    try {
      const res = await _uploadVideoBlob(videoId, _vFileData, _vFileName);
      if (!res || !res.ok) {
        toast('❌ Video yuklashda xatolik: ' + (res && res.error ? res.error : 'noma\'lum xato'));
        return;
      }
      VIDEO_BLOB_CACHE[videoId] = _vFileData;
    } catch (e) {
      toast('❌ Video yuklashda xatolik. Internetni tekshiring yoki kichikroq fayl tanlang.');
      return;
    }
  }

  if (_editVideoId) {
    const idx = vids.findIndex(x => x.id === _editVideoId);
    if (idx !== -1) {
      vids[idx].title = title;
      vids[idx].desc = desc;
      vids[idx].groupIds = groupIds;
      vids[idx].type = type;
      if (type === 'youtube') { vids[idx].url = url; delete vids[idx].fileName; if (vids[idx].hasFile) { _deleteVideoBlob(_editVideoId); delete vids[idx].hasFile; } }
      if (type === 'file' && _vFileData) { vids[idx].fileName = _vFileName; vids[idx].hasFile = true; delete vids[idx].url; }
    }
  } else {
    const newV = {
      id: videoId,
      type, title, desc, groupIds,
      mentorName: mName,
      createdAt: new Date().toLocaleDateString('uz-UZ')
    };
    if (type === 'youtube') newV.url = url;
    if (type === 'file' && _vFileData) { newV.fileName = _vFileName; newV.hasFile = true; }
    vids.push(newV);
  }

  saveVideos(vids);
  closeVideoModal();
  toast('✅ ' + (LANG==='ru'?'Сохранено!':LANG==='en'?'Saved!':'Saqlandi!'));
  renderMentorVideos();

  // Badge yangilash
  const nc = document.getElementById('nc-mentor-videos');
  if (nc) { const cnt = getMentorVideosForUser().length; nc.textContent = cnt; nc.style.display = cnt ? 'flex' : 'none'; }
}

async function deleteVideo(id) {
  const L = LANG;
  const confirmMsg = L==='ru'?'Удалить этот урок?':L==='en'?'Delete this lesson?':'Bu darslikni o\'chirasizmi?';
  if (!(await crmConfirm(confirmMsg, { danger: true }))) return;
  const v = getVideos().find(x => x.id === id);
  const vids = getVideos().filter(x => x.id !== id);
  saveVideos(vids);
  delete VIDEO_BLOB_CACHE[id];
  if (v && v.hasFile) _deleteVideoBlob(id); // 🔧 backend'dagi fayl ham o'chiriladi
  toast('🗑 ' + (L==='ru'?'Удалено':L==='en'?'Deleted':'O\'chirildi'));
  renderMentorVideos();
}

// nav label tarjima
function updateVideoNavLabels() {
  const L = LANG;
  const ml = document.getElementById('nav-mentor-videos-lbl');
  const sl = document.getElementById('nav-student-videos-lbl');
  const lbl = L==='ru'?'Видеоуроки':L==='en'?'Video Lessons':'Darsliklar';
  if (ml) ml.textContent = lbl;
  if (sl) sl.textContent = lbl;
}

window.toggleSidebar = function() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebar-overlay');
  if (!sb) return;
  const isOpen = sb.classList.contains('open');
  sb.classList.toggle('open', !isOpen);
  if (ov) ov.classList.toggle('open', !isOpen);
};
