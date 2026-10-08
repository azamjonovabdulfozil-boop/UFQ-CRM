// ===================== STUDENT DASHBOARD =====================
function calcStudentRating(studentId, groupId){
  // Barcha oylardagi davomat bo'yicha reyting hisoblash (0-100)
  if(!D.attendance)return 0;
  let totalPresent=0,totalMarked=0;
  const keys=Object.keys(D.attendance).filter(k=>k.startsWith('att_'+groupId+'_'));
  keys.forEach(attKey=>{
    const sKey='s'+studentId;
    const sAtt=D.attendance[attKey]?.[sKey]||{};
    for(let l=1;l<=LESSON_COUNT;l++){
      const v=sAtt['l'+l]||'';
      if(v==='K'){totalPresent++;totalMarked++;}
      else if(v==='Y'||v==='S'){totalMarked++;}
    }
  });
  if(!totalMarked)return 0;
  return Math.round(totalPresent/totalMarked*100);
}

function calcGroupRating(groupId){
  // Guruh ichidagi barcha talabalar reytingini hisoblash
  const students=D.students.filter(s=>s.groupId===groupId);
  return students.map(s=>({
    id:s.id,name:s.name,status:s.status,isDebtor:s.isDebtor,
    rating:calcStudentRating(s.id,groupId)
  })).sort((a,b)=>b.rating-a.rating);
}

function renderStudentDashboard(){
  const wrap=document.getElementById('student-my-wrap');if(!wrap)return;
  const cu=getCurrentUser();
  const studentId=cu.studentId?parseInt(cu.studentId):null;
  const s=studentId?D.students.find(x=>x.id===studentId):null;

  if(!s){
    const notFoundLbl=LANG==='ru'?'Студент не найден':LANG==='en'?'Student not found':'Talaba topilmadi';
    const addLbl=LANG==='ru'?'Администратор должен добавить вас в систему':LANG==='en'?'Admin needs to add you to the system':'Admin sizni tizimga qo\'shishi kerak';
    wrap.innerHTML=`<div style="text-align:center;padding:60px 20px;color:var(--text3)"><div style="font-size:48px;margin-bottom:16px">🧑‍💻</div><div style="font-size:16px;font-weight:600">${notFoundLbl}</div><div style="font-size:13px;margin-top:8px">${addLbl}</div></div>`;
    return;
  }

  // Use custom display name if set
  const displayName = _uiSettings['studentDisplayName_'+studentId] || s.name;

  const grp=D.groups.find(x=>x.id===s.groupId);
  const mentorName=grp?grp.mentor:'—';
  const rating=calcStudentRating(s.id,s.groupId);
  const groupRatings=grp?calcGroupRating(s.groupId):[];
  const myRank=groupRatings.findIndex(x=>x.id===s.id)+1;
  const totalStudents=groupRatings.length;

  // Davomat statistikasi (joriy oy)
  const now=new Date();const cm=now.getMonth(),cy=now.getFullYear();
  const attKey='att_'+(s.groupId)+'_'+cy+'_'+cm;
  const sKey='s'+s.id;
  const sAtt=(D.attendance&&D.attendance[attKey]&&D.attendance[attKey][sKey])||{};
  let present=0,absent=0,excused=0;
  for(let l=1;l<=LESSON_COUNT;l++){const v=sAtt['l'+l]||'';if(v==='K')present++;else if(v==='Y')absent++;else if(v==='S')excused++;}
  const marked=present+absent+excused;
  const pct=marked>0?Math.round(present/marked*100):0;

  // Reyting badge rangi
  const ratingColor=rating>=80?'var(--teal-text)':rating>=60?'var(--amber-text)':'var(--orange-text)';
  const ratingEmoji=rating>=80?'🏆':rating>=60?'📈':'📉';
  const statusBadge={Aktiv:'b-teal',Faolsiz:'b-gray',Muzlatilgan:'b-blue',Probatsiya:'b-amber',Arxiv:'b-purple'};
  const statusIcon={Aktiv:'✅',Faolsiz:'⛔',Muzlatilgan:'❄️',Probatsiya:'🔶',Arxiv:'📦'};
  const DAY_FULL={Du:'Dushanba',Se:'Seshanba',Ch:'Chorshanba',Pa:'Payshanba',Ju:'Juma',Sh:'Shanba'};

  // ---- YANGI ANALYTICS (3.1-band: Student Dashboard) ----
  const simpleGradeArr=((D.simpleGrades&&D.simpleGrades[s.id])||[]).slice().sort((a,b)=>new Date(b.date)-new Date(a.date));
  const avgGrade=simpleGradeArr.length?Math.round(simpleGradeArr.reduce((sum,g)=>sum+g.score,0)/simpleGradeArr.length):null;
  let lifetimePresent=0,lifetimeMarked=0;
  if(grp&&D.attendance){
    Object.keys(D.attendance).filter(k=>k.startsWith('att_'+s.groupId+'_')).forEach(k=>{
      const sa=D.attendance[k][sKey]||{};
      for(let l=1;l<=LESSON_COUNT;l++){const v=sa['l'+l]||'';if(v==='K'){lifetimePresent++;lifetimeMarked++;}else if(v==='Y'||v==='S')lifetimeMarked++;}
    });
  }
  const courseObj = grp ? D.courses.find(c=>c.name===grp.course) : null;
  const totalCourseLessons = courseObj && parseInt(courseObj.duration) ? parseInt(courseObj.duration)*LESSON_COUNT : null;
  const lessonsRemaining = totalCourseLessons!==null ? Math.max(totalCourseLessons-lifetimePresent,0) : null;
  const myGoals=typeof getStudentGoals==='function'?getStudentGoals():[];
  const goalsDone=myGoals.filter(g=>g.done).length;
  const goalsPct=myGoals.length?Math.round(goalsDone/myGoals.length*100):0;
  const overallProgress=Math.round((rating+pct+goalsPct)/3);
  const monthlyAttData=[];
  for(let i=4;i>=0;i--){
    const dt=new Date(cy,cm-i,1);const y=dt.getFullYear(),m=dt.getMonth();
    const ak='att_'+s.groupId+'_'+y+'_'+m;
    const sa2=(D.attendance&&D.attendance[ak]&&D.attendance[ak][sKey])||{};
    let p2=0,mk2=0;for(let l=1;l<=LESSON_COUNT;l++){const v=sa2['l'+l]||'';if(v==='K'){p2++;mk2++;}else if(v==='Y'||v==='S')mk2++;}
    monthlyAttData.push({label:getMonthName(m,true),val:mk2>0?Math.round(p2/mk2*100):0});
  }
  const gradesChartData=simpleGradeArr.slice(0,6).reverse().map((g,i)=>({label:'#'+(i+1),val:g.score,color:g.score>=86?'#0d9488':g.score>=71?'#3b82f6':g.score>=56?'#f59e0b':'#ea580c'}));
  const progressDonutData=[
    {val:rating,color:'#3b82f6'},
    {val:pct,color:'#0d9488'},
    {val:goalsPct,color:'#f59e0b'},
  ];

  // Barcha oylar bo'yicha davomat
  let allMonthsHtml='';
  if(grp&&D.attendance){
    const keys=Object.keys(D.attendance).filter(k=>k.startsWith('att_'+s.groupId+'_')).sort();
    const monthNames=getMonthNames(true);
    keys.forEach(attKey=>{
      const parts=attKey.split('_');const yr=parseInt(parts[3]),mn=parseInt(parts[4]);
      const sAtt2=D.attendance[attKey]?.[sKey]||{};
      let p=0,a=0,e=0;
      for(let l=1;l<=LESSON_COUNT;l++){const v=sAtt2['l'+l]||'';if(v==='K')p++;else if(v==='Y')a++;else if(v==='S')e++;}
      const m2=p+a+e;if(!m2)return;
      const pct2=Math.round(p/m2*100);
      const c2=pct2>=80?'var(--teal-text)':pct2>=60?'var(--amber-text)':'var(--orange-text)';
      allMonthsHtml+=`<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--bg2);border-radius:var(--r-md);border:1px solid var(--border);margin-bottom:6px">
        <div style="font-size:12px;font-weight:700;color:var(--text2);min-width:90px">${monthNames[mn]||mn} ${yr}</div>
        <div style="flex:1;height:8px;background:var(--bg4);border-radius:4px;overflow:hidden"><div style="height:100%;width:${pct2}%;background:${c2};border-radius:4px;transition:width .4s"></div></div>
        <span style="font-size:12px;font-weight:800;color:${c2};min-width:36px;text-align:right">${pct2}%</span>
        <span style="font-size:10px;color:var(--text3)">K:${p} Y:${a} S:${e}</span>
      </div>`;
    });
  }

  // (Guruh reytingi ro'yxati endi bu yerda QAYTA chizilmaydi — u faqat o'ziga
  //  alohida ajratilgan "Guruh reytingi" sahifasida ko'rsatiladi, takrorlanmasin uchun.
  //  myRank/totalStudents statistik kartochka va tezkor navigatsiya tugmasida ishlatiladi.)

  wrap.innerHTML=`
  <div style="padding:0 0 24px">
    <!-- Salom banner -->
    <div style="background:linear-gradient(135deg,var(--accent),var(--teal));border-radius:var(--r-lg);padding:22px 24px;color:#fff;margin-bottom:20px;position:relative;overflow:hidden">
      <div style="position:absolute;right:-20px;top:-20px;font-size:120px;opacity:.08;pointer-events:none">🎓</div>
      <div style="font-size:13px;opacity:.85;font-weight:500">${LANG==='ru'?'Добро пожаловать,':LANG==='en'?'Welcome,':'Xush kelibsiz,'}</div>
      <div style="font-size:24px;font-weight:800;letter-spacing:-.5px;margin:4px 0">${displayName}</div>
      <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">
        <span style="background:rgba(255,255,255,.2);padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700">📚 ${grp?grp.course:'—'}</span>
        <span style="background:rgba(255,255,255,.2);padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700">👥 ${grp?grp.name:'—'} ${LANG==='ru'?'группа':LANG==='en'?'group':'guruhi'}</span>
        <span style="background:rgba(255,255,255,.2);padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700">🎓 ${mentorName}</span>
      </div>
    </div>

    <!-- Asosiy kartochkalar -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px">
      <div style="background:var(--bg);border:1.5px solid var(--border2);border-radius:var(--r-lg);padding:16px 18px;text-align:center;box-shadow:var(--shadow-sm);cursor:pointer;transition:.15s" onclick="showStudentDetailPopup('rating')" onmouseover="this.style.transform='translateY(-2px)';this.style.borderColor='var(--accent)'" onmouseout="this.style.transform='';this.style.borderColor='var(--border2)'">
        <div style="font-size:32px;font-weight:900;color:${ratingColor}">${ratingEmoji} ${rating}%</div>
        <div style="font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-top:4px">${LANG==='ru'?'Общий рейтинг':LANG==='en'?'Overall Rating':'Umumiy reyting'}</div>
        <div style="font-size:10px;color:var(--accent-text);margin-top:3px">${LANG==='ru'?'Нажмите →':LANG==='en'?'Click →':'Bosing →'}</div>
      </div>
      <div style="background:var(--bg);border:1.5px solid var(--border2);border-radius:var(--r-lg);padding:16px 18px;text-align:center;box-shadow:var(--shadow-sm);cursor:pointer;transition:.15s" onclick="go('student-rating',document.getElementById('nav-student-rating'))" onmouseover="this.style.transform='translateY(-2px)';this.style.borderColor='var(--accent)'" onmouseout="this.style.transform='';this.style.borderColor='var(--border2)'">
        <div style="font-size:32px;font-weight:900;color:var(--accent)">${myRank?myRank+'/'+(totalStudents):'—'}</div>
        <div style="font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-top:4px">${LANG==='ru'?'Место в группе':LANG==='en'?'Group Rank':"Guruh o'rni"}</div>
        <div style="font-size:10px;color:var(--accent-text);margin-top:3px">${LANG==='ru'?'Нажмите →':LANG==='en'?'Click →':'Bosing →'}</div>
      </div>
      <div style="background:var(--bg);border:1.5px solid var(--border2);border-radius:var(--r-lg);padding:16px 18px;text-align:center;box-shadow:var(--shadow-sm);cursor:pointer;transition:.15s" onclick="showStudentDetailPopup('attendance')" onmouseover="this.style.transform='translateY(-2px)';this.style.borderColor='var(--accent)'" onmouseout="this.style.transform='';this.style.borderColor='var(--border2)'">
        <div style="font-size:32px;font-weight:900;color:${pct>=80?'var(--teal-text)':pct>=60?'var(--amber-text)':'var(--orange-text)'}">${pct}%</div>
        <div style="font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-top:4px">${LANG==='ru'?'Посещаемость':LANG==='en'?'This Month Att.':'Bu oy davomat'}</div>
        <div style="font-size:10px;color:var(--accent-text);margin-top:3px">${LANG==='ru'?'Нажмите →':LANG==='en'?'Click →':'Bosing →'}</div>
      </div>
      <div style="background:var(--bg);border:1.5px solid ${s.isDebtor?'var(--orange)':'var(--teal)'};border-radius:var(--r-lg);padding:16px 18px;text-align:center;box-shadow:var(--shadow-sm);cursor:pointer;transition:.15s" onclick="showStudentDetailPopup('debt')" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
        <div style="font-size:28px;font-weight:900;color:${s.isDebtor?'var(--orange-text)':'var(--teal-text)'}">${s.isDebtor?(LANG==='ru'?'💸 Должник':LANG==='en'?'💸 Debtor':'💸 Qarzdor'):(LANG==='ru'?"✅ Оплачено":LANG==='en'?"✅ Paid":"✅ To'lagan")}</div>
        <div style="font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-top:4px">${LANG==='ru'?'Статус оплаты':LANG==='en'?'Payment Status':"To'lov holati"}</div>
        <div style="font-size:10px;color:var(--accent-text);margin-top:3px">Bosing →</div>
      </div>
    </div>

        <!-- Shaxsiy ma'lumotlar + dars jadvali -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
      <div style="background:var(--bg);border:1.5px solid var(--border2);border-radius:var(--r-lg);padding:18px 20px;box-shadow:var(--shadow-sm)">
        <div style="font-size:14px;font-weight:800;margin-bottom:14px;color:var(--text)">${LANG==='ru'?'👤 Личные данные':LANG==='en'?'👤 Personal Info':"👤 Shaxsiy ma'lumotlar"}</div>
        <div style="display:flex;flex-direction:column;gap:8px;font-size:13px">
          <div style="display:flex;gap:8px"><span style="color:var(--text3);min-width:110px">${LANG==='ru'?'📱 Телефон':LANG==='en'?'📱 Phone':'📱 Telefon'}</span><span style="font-weight:600;color:var(--text)">${s.phone||'—'}</span></div>
          <div style="display:flex;gap:8px"><span style="color:var(--text3);min-width:110px">${LANG==='ru'?'🎂 Дата рожд.':LANG==='en'?'🎂 Birthday':"🎂 Tug'ilgan"}</span><span style="font-weight:600;color:var(--text)">${fmtDate(s.birthDate)}</span></div>
          <div style="display:flex;gap:8px"><span style="color:var(--text3);min-width:110px">${LANG==='ru'?'📅 Добавлен':LANG==='en'?'📅 Joined':"📅 Qo'shilgan"}</span><span style="font-weight:600;color:var(--text)">${fmtDate(s.joinDate)}</span></div>
          <div style="display:flex;gap:8px"><span style="color:var(--text3);min-width:110px">${LANG==='ru'?'📊 Статус':LANG==='en'?'📊 Status':'📊 Holat'}</span><span class="badge ${statusBadge[s.status]||'b-gray'}">${statusIcon[s.status]||''} ${s.status}</span></div>
          ${s.parentName?`<div style="display:flex;gap:8px"><span style="color:var(--text3);min-width:110px">${LANG==='ru'?'👪 Родители':LANG==='en'?'👪 Parent':"👪 Ota-ona"}</span><span style="font-weight:600;color:var(--text)">${s.parentName}</span></div>`:''}
          ${s.parentPhone?`<div style="display:flex;gap:8px"><span style="color:var(--text3);min-width:110px">${LANG==='ru'?'📞 Тел. родит.':LANG==='en'?'📞 Parent tel.':"📞 Ota tel."}</span><span style="font-weight:600;color:var(--text)">${s.parentPhone}</span></div>`:''}
        </div>
      </div>
      <div style="background:var(--bg);border:1.5px solid var(--border2);border-radius:var(--r-lg);padding:18px 20px;box-shadow:var(--shadow-sm)">
        <div style="font-size:14px;font-weight:800;margin-bottom:14px;color:var(--text)">${LANG==='ru'?'📅 Расписание':LANG==='en'?'📅 Schedule':'📅 Dars jadvali'}</div>
        ${grp?`
        <div style="display:flex;flex-direction:column;gap:8px;font-size:13px">
          <div style="display:flex;gap:8px"><span style="color:var(--text3);min-width:80px">${LANG==='ru'?'⏰ Время':LANG==='en'?'⏰ Time':'⏰ Vaqt'}</span><span style="font-weight:700;color:var(--accent)">${grp.timeStart||'—'} – ${grp.timeEnd||'—'}</span></div>
          <div style="display:flex;gap:8px"><span style="color:var(--text3);min-width:80px">${LANG==='ru'?'🚪 Кабинет':LANG==='en'?'🚪 Room':'🚪 Xona'}</span><span style="font-weight:700;color:var(--teal-text)">${grp.room||'—'}-xona</span></div>
          <div style="display:flex;gap:8px;align-items:flex-start"><span style="color:var(--text3);min-width:80px">${LANG==='ru'?'📆 Дни':LANG==='en'?'📆 Days':'📆 Kunlar'}</span><div style="display:flex;flex-wrap:wrap;gap:4px">${(grp.days||[]).map(d=>`<span style="background:var(--accent-light);color:var(--accent-text);padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;border:1px solid var(--accent)">${DAY_FULL[d]||d}</span>`).join('')}</div></div>
          <div style="display:flex;gap:8px"><span style="color:var(--text3);min-width:80px">${LANG==='ru'?'🎓 Ментор':LANG==='en'?'🎓 Mentor':'🎓 Mentor'}</span><span style="font-weight:600;color:var(--text)">${grp.mentor||'—'}</span></div>
          <div style="display:flex;gap:8px"><span style="color:var(--text3);min-width:80px">${LANG==='ru'?'📋 Начало':LANG==='en'?'📋 Start':'📋 Boshlanish'}</span><span style="font-weight:600;color:var(--text)">${fmtDate(grp.startDate)}</span></div>
        </div>`:'<div style="color:var(--text3);font-size:13px">Guruh topilmadi</div>'}
      </div>
    </div>

    <!-- Bu oy davomat tafsiloti -->
    <div style="background:var(--bg);border:1.5px solid var(--border2);border-radius:var(--r-lg);padding:18px 20px;box-shadow:var(--shadow-sm);margin-bottom:20px">
      <div style="font-size:14px;font-weight:800;margin-bottom:14px;color:var(--text)">${LANG==='ru'?'📋 Посещаемость в этом месяце':LANG==='en'?'📋 This Month Attendance':'📋 Bu oy davomati'} · <span style="color:var(--text3);font-weight:500;font-size:12px">${LANG==='ru'?'П=Пришёл, Н=Нет, У=Уважит.':LANG==='en'?'P=Present, A=Absent, E=Excused':"K=Keldi, Y=Yo'q, S=Sababli"}</span></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
        ${Array.from({length:LESSON_COUNT},(_,i)=>{
          const v=sAtt['l'+(i+1)]||'';
          const styleMap={'':'background:var(--bg3);border-color:var(--border2);color:var(--text3)','K':'background:var(--teal-light);border-color:var(--teal);color:var(--teal-text)','Y':'background:var(--amber-light);border-color:var(--amber);color:var(--amber-text)','S':'background:var(--purple-light);border-color:var(--purple);color:var(--purple-text)'};
          return `<div style="display:flex;flex-direction:column;align-items:center;gap:3px"><span style="font-size:9px;color:var(--text3)">${i+1}</span><div style="${styleMap[v]||styleMap['']};width:32px;height:28px;border-radius:6px;border:1.5px solid;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;font-family:'JetBrains Mono',monospace">${v||'·'}</div></div>`;
        }).join('')}
      </div>
      <div style="display:flex;gap:10px;font-size:12px">
        <span style="background:var(--teal-light);color:var(--teal-text);padding:4px 10px;border-radius:10px;font-weight:700">${LANG==='ru'?'✅ Пришёл':LANG==='en'?'✅ Present':'✅ Keldi'}: ${present}</span>
        <span style="background:var(--amber-light);color:var(--amber-text);padding:4px 10px;border-radius:10px;font-weight:700">${LANG==='ru'?'❌ Отсутствует':LANG==='en'?'❌ Absent':"❌ Yo'q"}: ${absent}</span>
        <span style="background:var(--purple-light);color:var(--purple-text);padding:4px 10px;border-radius:10px;font-weight:700">${LANG==='ru'?'📝 Уважит.':LANG==='en'?'📝 Excused':'📝 Sababli'}: ${excused}</span>
        <span style="background:var(--bg4);color:var(--text2);padding:4px 10px;border-radius:10px;font-weight:700">${LANG==='ru'?'📊 Посещ.':LANG==='en'?'📊 Attend.':'📊 Davomat'}: ${pct}%</span>
      </div>
    </div>

    <!-- Oylar bo'yicha davomat -->
    ${allMonthsHtml?`<div style="background:var(--bg);border:1.5px solid var(--border2);border-radius:var(--r-lg);padding:18px 20px;box-shadow:var(--shadow-sm);margin-bottom:20px">
      <div style="font-size:14px;font-weight:800;margin-bottom:14px;color:var(--text)">${LANG==='ru'?'📈 Посещаемость по месяцам':LANG==='en'?'📈 Monthly Attendance':'📈 Barcha oylar davomati'}</div>
      ${allMonthsHtml}
    </div>`:''}

    <!-- YANGI: qo'shimcha analytics kartalari -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px">
      <div class="mdash-mini-card">
        <div class="mdash-mini-ic">🏅</div>
        <div class="mdash-mini-num">${avgGrade!==null?avgGrade:'—'}</div>
        <div class="mdash-mini-lbl">${t('avg_grade')}</div>
      </div>
      <div class="mdash-mini-card">
        <div class="mdash-mini-ic">📗</div>
        <div class="mdash-mini-num">${lifetimePresent}</div>
        <div class="mdash-mini-lbl">${t('lessons_done')}</div>
      </div>
      <div class="mdash-mini-card">
        <div class="mdash-mini-ic">📘</div>
        <div class="mdash-mini-num">${lessonsRemaining!==null?lessonsRemaining:'—'}</div>
        <div class="mdash-mini-lbl">${t('lessons_left')}</div>
      </div>
      <div class="mdash-mini-card">
        <div class="mdash-mini-ic">🎯</div>
        <div class="mdash-mini-num" style="color:${goalsPct>=70?'var(--teal-text)':goalsPct>=40?'var(--amber-text)':'var(--orange-text)'}">${goalsPct}%</div>
        <div class="mdash-mini-lbl">${t('goals_done_pct')}</div>
      </div>
      <div class="mdash-mini-card">
        <div class="mdash-mini-ic">📈</div>
        <div class="mdash-mini-num">${overallProgress}%</div>
        <div class="mdash-mini-lbl">${t('monthly_progress')}</div>
      </div>
    </div>

    <!-- Grafiklar -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-bottom:20px">
      <div class="mdash-chart-card">
        <div class="mdash-chart-title">🏅 ${t('chart_grades')}</div>
        ${gradesChartData.length?_buildBarSVG(gradesChartData,260,110,'var(--purple)'):`<div class="mdash-empty-mini">${t('no_grades_yet')}</div>`}
      </div>
      <div class="mdash-chart-card">
        <div class="mdash-chart-title">📊 ${t('chart_attendance')}</div>
        ${_buildBarSVG(monthlyAttData,260,110,'var(--accent)')}
      </div>
      <div class="mdash-chart-card">
        <div class="mdash-chart-title">📈 ${t('chart_progress')}</div>
        <div style="display:flex;align-items:center;gap:14px">
          ${_buildDonutSVG(progressDonutData,100)}
          <div style="display:flex;flex-direction:column;gap:5px">
            <div style="display:flex;align-items:center;gap:6px;font-size:11px"><span style="width:9px;height:9px;border-radius:3px;background:#3b82f6;display:inline-block"></span>${t('overall_rating')}: <b>${rating}%</b></div>
            <div style="display:flex;align-items:center;gap:6px;font-size:11px"><span style="width:9px;height:9px;border-radius:3px;background:#0d9488;display:inline-block"></span>${t('attendance_pct')}: <b>${pct}%</b></div>
            <div style="display:flex;align-items:center;gap:6px;font-size:11px"><span style="width:9px;height:9px;border-radius:3px;background:#f59e0b;display:inline-block"></span>${t('goals_done_pct')}: <b>${goalsPct}%</b></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Tezkor navigatsiya -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:20px">
      <button class="btn" onclick="go('student-schedule',document.getElementById('nav-student-schedule'))" style="padding:14px 10px;display:flex;flex-direction:column;align-items:center;gap:6px;background:var(--bg2);border:1.5px solid var(--border2);border-radius:var(--r-lg);cursor:pointer;font-size:13px;font-weight:700;color:var(--text)"><span style="font-size:22px">📅</span>${LANG==='ru'?'Расписание':LANG==='en'?'Schedule':'Dars jadvali'}</button>
      <button class="btn" onclick="go('student-rating',document.getElementById('nav-student-rating'))" style="padding:14px 10px;display:flex;flex-direction:column;align-items:center;gap:6px;background:var(--bg2);border:1.5px solid var(--border2);border-radius:var(--r-lg);cursor:pointer;font-size:13px;font-weight:700;color:var(--text)"><span style="font-size:22px">🏆</span>${LANG==='ru'?'Рейтинг':LANG==='en'?'Rating':'Reyting'}</button>
      <button class="btn" onclick="go('student-grades',document.getElementById('nav-student-grades'))" style="padding:14px 10px;display:flex;flex-direction:column;align-items:center;gap:6px;background:var(--bg2);border:1.5px solid var(--border2);border-radius:var(--r-lg);cursor:pointer;font-size:13px;font-weight:700;color:var(--text)"><span style="font-size:22px">🏅</span>${LANG==='ru'?'Оценки':LANG==='en'?'Grades':'Baholash'}</button>
      <button class="btn" onclick="go('student-tests',document.getElementById('nav-student-tests'))" style="padding:14px 10px;display:flex;flex-direction:column;align-items:center;gap:6px;background:var(--bg2);border:1.5px solid var(--border2);border-radius:var(--r-lg);cursor:pointer;font-size:13px;font-weight:700;color:var(--text)"><span style="font-size:22px">📝</span>${LANG==='ru'?'Тесты':LANG==='en'?'Tests':'Testlar'}</button>
      <button class="btn" onclick="go('student-chat',document.getElementById('nav-student-chat'))" style="padding:14px 10px;display:flex;flex-direction:column;align-items:center;gap:6px;background:var(--bg2);border:1.5px solid var(--border2);border-radius:var(--r-lg);cursor:pointer;font-size:13px;font-weight:700;color:var(--text)"><span style="font-size:22px">💬</span>${LANG==='ru'?'Чат':LANG==='en'?'Chat':'Chat'}</button>
      <button class="btn" onclick="go('student-goals',document.getElementById('nav-student-goals'))" style="padding:14px 10px;display:flex;flex-direction:column;align-items:center;gap:6px;background:var(--accent-light);border:1.5px solid var(--accent);border-radius:var(--r-lg);cursor:pointer;font-size:13px;font-weight:700;color:var(--accent-text)"><span style="font-size:22px">🎯</span>${LANG==='ru'?'Цели':LANG==='en'?'Goals':'Maqsadlar'}</button>
    </div>

    ${renderStudentFunFeatures(s, grp, pct, rating, myRank, totalStudents)}
  </div>`;
}

function renderStudentFunFeatures(s, grp, pct, rating, myRank, totalStudents){
  // 1. Streak (consecutive days present this month based on attendance)
  const streakDays = calcStudentStreak(s.id, s.groupId);

  // 2. Next lesson countdown
  const nextLessonInfo = getNextLessonInfo(grp);

  // 3. Motivational quote
  const quotes = {
    uz: [
      {q:"Muvaffaqiyat — bu tasodif emas, balki izchil harakat natijasidir.", a:"Albert Einstein"},
      {q:"Bugun o'rganmagan narsa — ertaga imkoniyat bo'ladi.", a:"EduManage"},
      {q:"Bilim — eng yaxshi investitsiyadir.", a:"Benjamin Franklin"},
      {q:"Har bir dars seni maqsadingga bir qadam yaqinlashtiradi.", a:"EduManage"},
      {q:"Qiyin yo'l ko'pincha to'g'ri yo'ldir.", a:"EduManage"},
    ],
    ru: [
      {q:"Успех — это не случайность, а результат последовательных усилий.", a:"Альберт Эйнштейн"},
      {q:"То, чего ты не узнал сегодня — станет возможностью завтра.", a:"EduManage"},
      {q:"Знание — лучшая инвестиция.", a:"Бенджамин Франклин"},
      {q:"Каждый урок приближает тебя к цели на один шаг.", a:"EduManage"},
      {q:"Трудный путь — зачастую правильный путь.", a:"EduManage"},
    ],
    en: [
      {q:"Success is not an accident — it's the result of consistent effort.", a:"Albert Einstein"},
      {q:"What you don't learn today becomes an opportunity tomorrow.", a:"EduManage"},
      {q:"Knowledge is the best investment.", a:"Benjamin Franklin"},
      {q:"Every lesson brings you one step closer to your goal.", a:"EduManage"},
      {q:"The hard path is often the right path.", a:"EduManage"},
    ]
  };
  const qArr = quotes[LANG]||quotes.uz;
  const qDay = new Date().getDate() % qArr.length;
  const quote = qArr[qDay];

  // 4. Achievements
  const achievements = calcStudentAchievements(s.id, s.groupId, pct, rating, myRank, totalStudents);

  // 5. Goal from settings
  const goal = _uiSettings.studentGoal||'';

  const streakLbl=LANG==='ru'?'Серия посещений':LANG==='en'?'Attendance Streak':'Davomat seriyasi';
  const streakDayLbl=LANG==='ru'?'дн.':LANG==='en'?'days':'kun';
  const nextLsnLbl=LANG==='ru'?'Следующий урок':LANG==='en'?'Next Lesson':'Keyingi dars';
  const todayLbl=LANG==='ru'?'Сегодня!':LANG==='en'?'Today!':'Bugun!';
  const achLbl=LANG==='ru'?'Мои достижения':LANG==='en'?'My Achievements':'Mening yutuqlarim';
  const myGoalLbl=LANG==='ru'?'Моя цель':LANG==='en'?'My Goal':'Mening maqsadim';
  const setGoalLbl=LANG==='ru'?'Установить в целях →':LANG==='en'?'Set in Goals →':'Maqsadlarda belgilash →';
  const motiveLbl=LANG==='ru'?'Мотивация дня':LANG==='en'?'Quote of the Day':'Kunlik ilhom';

  const achieveHtml = achievements.map((a,ai)=>{
    const tipId='ach-tip-'+ai;
    const howToUz=['Davomat reytingingizni 80%+ ga yetkazing. Darslarga muntazam keling, dars o\'tkazmang.','Oyda 90% va undan ko\'proq darslarga keling. Sababsiz dars o\'tkazmaslik kerak.','Guruhda davomat bo\'yicha 1-o\'ringa chiqing. Barcha guruh o\'rtoqlaridan yuqori bo\'ling.','100% davomat — birorta ham dars o\'tkazmaslik. Har bir darsga kelib turing!','"Maqsadlarim" bo\'limiga o\'tib birinchi o\'quv maqsadingizni qo\'shing.','"Maqsadlarim" bo\'limida kamida 1 ta maqsadni "Bajarildi" deb belgilang.'];
    const howToRu=['Набери рейтинг 80%+. Ходи на уроки регулярно, не пропускай занятия.','Посещай 90%+ уроков в месяц. Не пропускай занятия без уважительной причины.','Стань лучшим в группе по посещаемости. Обгони всех одногруппников.','100% посещаемость — ни одного пропуска. Приходи на каждый урок!','Перейди в "Мои цели" и добавь первую учебную цель.','В разделе "Мои цели" отметь хотя бы 1 цель как выполненную.'];
    const howToEn=['Get your rating to 80%+. Come to lessons regularly, don\'t skip classes.','Attend 90%+ lessons per month. Don\'t skip without a valid reason.','Become #1 in your group by attendance. Outperform all your groupmates.','100% attendance — not a single skip. Show up to every lesson!','Go to "My Goals" and add your first learning goal.','In "My Goals", mark at least 1 goal as completed.'];
    const howArr=LANG==='ru'?howToRu:LANG==='en'?howToEn:howToUz;
    const howTo=howArr[ai]||a.desc;
    const earnedLabel=LANG==='ru'?'\u2705 Bajarildi!':LANG==='en'?'\u2705 Achieved!':'\u2705 Erishildi!';
    const howLabel=LANG==='ru'?'\ud83d\udca1 Qanday olish mumkin?':LANG==='en'?'\ud83d\udca1 How to earn?':'\ud83d\udca1 Qanday olish mumkin?';
    const detailLabel=LANG==='ru'?'batafsil':LANG==='en'?'details':'batafsil';
    const congratsText=LANG==='ru'?'Tabriklaymiz! Siz bu yutuqni qo\'lga kiritdingiz.':LANG==='en'?'Congratulations! You earned this badge.':'Tabriklaymiz! Siz bu yutuqni qo\'lga kiritdingiz.';
    const bg=a.earned?'linear-gradient(135deg,var(--teal-light),var(--bg2))':'var(--bg3)';
    const border=a.earned?'var(--teal)':'var(--border2)';
    const iconBg=a.earned?'var(--teal)':'var(--bg4)';
    const shadow=a.earned?'0 2px 12px rgba(13,148,136,.13)':'none';
    const nameClr=a.earned?'var(--teal-text)':'var(--text2)';
    const tipBorder=a.earned?'var(--teal)':'var(--border2)';
    const tipBg=a.earned?'rgba(13,148,136,.07)':'var(--bg4)';
    const labelClr=a.earned?'var(--teal-text)':'var(--accent-text)';
    const statusIco=a.earned?'<span style="font-size:20px">\u2705</span>':'<span style="font-size:18px;opacity:.4">\ud83d\udd12</span>';
    return '<div onclick="(function(){var t=document.getElementById(\''+tipId+'\');if(t)t.style.display=t.style.display===\'none\'?\'block\':\'none\';})()" style="cursor:pointer;background:'+bg+';border:2px solid '+border+';border-radius:14px;overflow:hidden;transition:box-shadow .2s;box-shadow:'+shadow+'" onmouseover="this.style.boxShadow=\'0 4px 18px rgba(0,0,0,.13)\'" onmouseout="this.style.boxShadow=\''+shadow+'\'">'
    +'<div style="display:flex;align-items:center;gap:12px;padding:13px 16px">'
    +'<div style="width:44px;height:44px;border-radius:12px;background:'+iconBg+';display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;opacity:'+(a.earned?1:.45)+'">'+a.icon+'</div>'
    +'<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:800;color:'+nameClr+'">'+a.name+'</div><div style="font-size:11px;color:var(--text3);margin-top:2px">'+a.desc+'</div></div>'
    +'<div style="display:flex;flex-direction:column;align-items:center;gap:3px;flex-shrink:0">'+statusIco+'<span style="font-size:9px;color:var(--text3);font-weight:700">'+detailLabel+' \u25be</span></div>'
    +'</div>'
    +'<div id="'+tipId+'" style="display:none;padding:10px 16px 14px;border-top:1.5px dashed '+tipBorder+';background:'+tipBg+'">'
    +'<div style="font-size:11px;font-weight:700;color:'+labelClr+';text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">'+(a.earned?earnedLabel:howLabel)+'</div>'
    +'<div style="font-size:12px;color:var(--text2);line-height:1.7">'+(a.earned?congratsText:howTo)+'</div>'
    +'</div>'
    +'</div>';
  }).join('');

  return `
  <!-- Fun Features Block -->
  <div style="margin-top:20px;display:flex;flex-direction:column;gap:16px">

    <!-- Row 1: Streak + Next Lesson -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <!-- Streak -->
      <div style="background:var(--bg);border:1.5px solid var(--border2);border-radius:var(--r-lg);padding:16px 18px;box-shadow:var(--shadow-sm);text-align:center">
        <div style="font-size:36px;margin-bottom:4px">🔥</div>
        <div style="font-size:32px;font-weight:900;color:var(--orange-text)">${streakDays}</div>
        <div style="font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.5px">${streakLbl}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:3px">${streakDays} ${streakDayLbl} ketma-ket</div>
      </div>
      <!-- Next Lesson -->
      <div style="background:var(--bg);border:1.5px solid var(--border2);border-radius:var(--r-lg);padding:16px 18px;box-shadow:var(--shadow-sm);text-align:center">
        <div style="font-size:36px;margin-bottom:4px">⏰</div>
        <div style="font-size:18px;font-weight:800;color:var(--accent-text)">${nextLessonInfo.label}</div>
        <div style="font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-top:4px">${nextLsnLbl}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:3px">${nextLessonInfo.detail}</div>
      </div>
    </div>

    <!-- Motivational Quote -->
    <div style="background:linear-gradient(135deg,var(--purple-light),var(--bg2));border:1.5px solid var(--purple);border-radius:var(--r-lg);padding:18px 20px;position:relative;overflow:hidden">
      <div style="position:absolute;right:10px;top:10px;font-size:60px;opacity:.06">💬</div>
      <div style="font-size:11px;font-weight:700;color:var(--purple-text);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">✨ ${motiveLbl}</div>
      <div style="font-size:14px;font-weight:600;color:var(--text);line-height:1.6;font-style:italic">"${quote.q}"</div>
      <div style="font-size:11px;color:var(--text3);margin-top:8px;font-weight:600">— ${quote.a}</div>
    </div>

    <!-- Goal -->
    <div style="background:var(--bg);border:1.5px solid var(--border2);border-radius:var(--r-lg);padding:16px 20px;box-shadow:var(--shadow-sm);display:flex;align-items:center;gap:14px;cursor:pointer" onclick="go('student-goals',document.getElementById('nav-student-goals'))">
      <div style="font-size:32px">🎯</div>
      <div style="flex:1">
        <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">${myGoalLbl}</div>
        <div style="font-size:14px;font-weight:600;color:${goal?'var(--text)':'var(--text3)'};margin-top:3px">${goal||`<span style="color:var(--accent-text);font-size:12px">${setGoalLbl}</span>`}</div>
      </div>
      <span style="color:var(--text3);font-size:16px">→</span>
    </div>


  </div>`;
}

function calcStudentStreak(studentId, groupId){
  if(!D.attendance) return 0;
  let streak=0;
  const now=new Date();
  // Check last 30 days for streak
  for(let d=0;d<30;d++){
    const dd=new Date(now);dd.setDate(now.getDate()-d);
    const key='att_'+groupId+'_'+dd.getFullYear()+'_'+dd.getMonth();
    const dayAtt=D.attendance[key];
    if(!dayAtt) continue;
    const sk='s'+studentId;
    const sAtt=dayAtt[sk]||{};
    const hasPresent=Object.values(sAtt).some(v=>v==='K');
    if(hasPresent) streak++;
    else if(d>0) break;
  }
  return streak;
}

function getNextLessonInfo(grp){
  if(!grp) return {label:'—',detail:'—'};
  const DAY_MAP={Du:1,Se:2,Ch:3,Pa:4,Ju:5,Sh:6};
  const DAY_NAMES_UZ={Du:'Dushanba',Se:'Seshanba',Ch:'Chorshanba',Pa:'Payshanba',Ju:'Juma',Sh:'Shanba'};
  const DAY_NAMES_RU={Du:'Пн',Se:'Вт',Ch:'Ср',Pa:'Чт',Ju:'Пт',Sh:'Сб'};
  const DAY_NAMES_EN={Du:'Mon',Se:'Tue',Ch:'Wed',Pa:'Thu',Ju:'Fri',Sh:'Sat'};
  const now=new Date();
  const today=now.getDay(); // 0=Sun,1=Mon
  if(!grp.days||!grp.days.length) return {label:'—',detail:grp.timeStart||'—'};
  let minDiff=7;
  let nextDay=null;
  grp.days.forEach(d=>{
    const num=DAY_MAP[d]||0;
    let diff=num-today;
    if(diff<0) diff+=7;
    if(diff===0){
      // Check if lesson time hasn't passed today
      const [h,m]=(grp.timeStart||'09:00').split(':').map(Number);
      const lessonMin=h*60+m;
      const nowMin=now.getHours()*60+now.getMinutes();
      if(nowMin<=lessonMin) diff=0;
      else diff=7;
    }
    if(diff<minDiff){minDiff=diff;nextDay=d;}
  });
  if(!nextDay) return {label:'—',detail:grp.timeStart||'—'};
  const dayName=LANG==='ru'?DAY_NAMES_RU[nextDay]:LANG==='en'?DAY_NAMES_EN[nextDay]:DAY_NAMES_UZ[nextDay];
  if(minDiff===0){
    const todayLbl=LANG==='ru'?'Сегодня':LANG==='en'?'Today':'Bugun';
    return {label:todayLbl+' 🎉',detail:grp.timeStart+' · '+grp.room+'-xona'};
  }
  if(minDiff===1){
    const tomorrowLbl=LANG==='ru'?'Завтра':LANG==='en'?'Tomorrow':'Ertaga';
    return {label:tomorrowLbl+' 📅',detail:dayName+' · '+grp.timeStart};
  }
  const inLbl=LANG==='ru'?'Через '+minDiff+' дн.':LANG==='en'?'In '+minDiff+' days':''+minDiff+' kundan';
  return {label:inLbl,detail:dayName+' · '+grp.timeStart};
}

function calcStudentAchievements(studentId, groupId, pct, rating, myRank, totalStudents){
  const LANG_=LANG;
  const ach=[
    {
      icon:'⭐',
      name:LANG_==='ru'?'Отличник':LANG_==='en'?'Top Student':'A\'lochi',
      desc:LANG_==='ru'?'Рейтинг 80%+':LANG_==='en'?'Rating 80%+':'Reyting 80%+',
      earned:rating>=80
    },
    {
      icon:'🔥',
      name:LANG_==='ru'?'Активный':LANG_==='en'?'Active Learner':'Faol o\'quvchi',
      desc:LANG_==='ru'?'Посещаемость 90%+':LANG_==='en'?'Attendance 90%+':'Davomat 90%+',
      earned:pct>=90
    },
    {
      icon:'🥇',
      name:LANG_==='ru'?'Лидер группы':LANG_==='en'?'Group Leader':'Guruh lideri',
      desc:LANG_==='ru'?'1-е место в группе':LANG_==='en'?'1st place in group':'Guruhda 1-o\'rin',
      earned:myRank===1
    },
    {
      icon:'💯',
      name:LANG_==='ru'?'Идеальное посещение':LANG_==='en'?'Perfect Attendance':'Mukammal davomat',
      desc:LANG_==='ru'?'100% посещаемость':LANG_==='en'?'100% attendance':'100% davomat',
      earned:pct>=100
    },
    {
      icon:'🎯',
      name:LANG_==='ru'?'Целеустремлённый':LANG_==='en'?'Goal Setter':'Maqsadli',
      desc:LANG_==='ru'?'Цель установлена':LANG_==='en'?'Goal is set':'Maqsad belgilangan',
      earned:!!(_uiSettings.studentGoal)
    },
    {
      icon:'🏅',
      name:LANG_==='ru'?'Достигатель':LANG_==='en'?'Achiever':'Maqsadga yetuvchi',
      desc:LANG_==='ru'?'Выполнена 1 цель':LANG_==='en'?'1 goal completed':'1 maqsad bajarildi',
      earned:(()=>{try{const goals=JSON.parse(localStorage.getItem('edumanage_student_goals')||'[]');return goals.filter(g=>g.done).length>=1;}catch(e){return false;}})()
    },
  ];
  return ach;
}

