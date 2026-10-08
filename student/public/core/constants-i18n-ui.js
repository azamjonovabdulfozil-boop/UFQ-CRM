// ===================== CONSTANTS =====================
const MONTHS_UZ=['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];
const MONTHS_FULL_UZ=['yanvar','fevral','mart','aprel','may','iyun','iyul','avgust','sentabr','oktabr','noyabr','dekabr'];
const MONTHS_FULL_RU=['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
const MONTHS_FULL_EN=['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_RU=['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
const MONTHS_EN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const SOURCES=["Qayerdan kelgan","Ko'chadan","Instagram","Telegram","Do'stdan","Reklama","YouTube","Boshqa"];
const AV_CLS=['av-a','av-b','av-c','av-d','av-e'];
const SUBJECTS=['Frontend','Backend','UI/UX Design','Python/Django','Mobile Development','Data Science','DevOps','Grafik Dizayn','Digital Marketing','Ingliz tili','Boshqa'];
const COURSE_COLORS=['b-blue','b-teal','b-purple','b-orange','b-pink','b-amber','b-green'];
const COURSE_TOP=['card-course-0','card-course-1','card-course-2','card-course-3','card-course-4'];
const DAYS=['Du','Se','Ch','Pa','Ju','Sh'];
const PER_PAGE=20;
const STUDENT_PER_PAGE=10; // 1.1: talabalar ro'yxati sahifasida ko'rsatiladigan maksimal talaba soni
const LESSON_COUNT=12;
const MENTOR_SALARY_PCT=0.20;

// ===================== I18N (FIX #2) =====================
// Full translations for all languages

function t(key){ return (TRANSLATIONS[LANG]||TRANSLATIONS['uz'])[key]||key; }

// Get localized month names array
function getMonthNames(short=false){
  if(LANG==='ru') return short?MONTHS_RU:MONTHS_FULL_RU.map(m=>m.charAt(0).toUpperCase()+m.slice(1));
  if(LANG==='en') return short?MONTHS_EN:MONTHS_FULL_EN;
  return short?MONTHS_UZ:MONTHS_FULL_UZ.map(m=>m.charAt(0).toUpperCase()+m.slice(1));
}
function getMonthName(idx, short=false){ return getMonthNames(short)[idx]||''; }

// Format date with locale
function fmtDate(d){
  if(!d)return '—';
  const dt=new Date(d+'T00:00:00');
  if(isNaN(dt))return '—';
  const day=dt.getDate(), mon=dt.getMonth(), yr=dt.getFullYear();
  if(LANG==='ru') return day+' '+MONTHS_FULL_RU[mon]+' '+yr+' г.';
  if(LANG==='en') return MONTHS_FULL_EN[mon]+' '+day+', '+yr;
  return day+'-'+MONTHS_FULL_UZ[mon]+', '+yr+'-yil';
}

// FIX #3 - Attendance date formatting: "12 aprel", "12 April", "12 апреля"
function fmtAttDate(day, monthIdx, year){
  if(LANG==='ru') return day+' '+MONTHS_FULL_RU[monthIdx]+' '+year;
  if(LANG==='en') return MONTHS_FULL_EN[monthIdx]+' '+day+', '+year;
  return day+'-'+MONTHS_FULL_UZ[monthIdx]+', '+year+'-yil';
}

let LANG='uz',currentTab='dashboard';
// L is a live alias for LANG (used throughout for i18n shorthand)
Object.defineProperty(window,'L',{get:()=>LANG,configurable:true});
let groupPage=1,studentPage=1,pendingDelCb=null,pendingDelName='',_uploadedFile=null,_uploadedPhoto=null,_expFilter='';
const TRANSLATIONS = {
  uz: {
    menu:'Menyu', dashboard:'Dashboard', courses:'Kurslar', groups:'Guruhlar',
    mentors:'Mentorlar', students:'Talabalar', finance:'Moliya', settings:'Sozlamalar',
    super_admin:'Super Admin', logout:'Chiqish',
    add_course:'+ Kurs qo\'shish', add_group:'+ Guruh qo\'shish',
    add_mentor:'+ Mentor qo\'shish', add_student:'+ Talaba qo\'shish',
    search_course:'Kurs qidirish...', search_group:'Guruh qidirish...',
    search_mentor:'Mentor qidirish...', search_student:'Talaba qidirish...',
    all_courses:'Barcha kurslar', all_mentors:'Barcha mentorlar',
    all_duration:'Barcha davomiylik', all_days:'Barcha kunlar',
    all_status:'Barcha holat', all_payment:'Barcha to\'lov',
    all_direction:'Barcha yo\'nalish', all_exp:'Barchasi',
    debtor:LANG==='ru'?'💸 Должник':LANG==='en'?'💸 Debtor':'💸 Qarzdor', paid:'✅ To\'lagan',
    exp_filter:'Tajriba:', exp_5plus:'5+ yil',
    cancel:'Bekor', save:'💾 Saqlash', close:'Yopish', edit_btn:'✏️ Tahrirlash',
    sett_name_title:'CRM Nomi', sett_name_sub:'Tizim nomini o\'zgartiring',
    sett_crm_name_label:'CRM Nomi', sett_preview:'Ko\'rinish:',
    sett_save:'💾 Saqlash', sett_logo_title:'CRM Logotipi',
    sett_logo_sub:'Sidebar va login ekranidagi rasm',
    sett_logo_current:'Joriy logotip',
    sett_logo_hint:'JPG, PNG, WEBP · Max 2MB · 64×64 tavsiya',
    sett_upload_click:'Bosib yuklang', sett_logo_remove:'🗑 Logotipni o\'chirish',
    sett_theme_title:'Fon va Rang Sxemasi', sett_theme_sub:'Yorug\' yoki qorong\'i rejim tanlang',
    theme_light:'☀️ Yorug\'', theme_dark:'🌙 Qorong\'i', theme_auto:'🔄 Avtomatik',
    sett_font_title:'Matn o\'lchami', sett_font_sub:'Interfeys yozuvlari katta-kichikligini sozlang',
    font_sm:'Kichik', font_md:'O\'rta', font_lg:'Katta', font_xl:'Juda katta',
    sett_accent_title:'Asosiy rang', sett_accent_sub:'Tugmalar va belgilar rangi',
    sett_data_title:'Ma\'lumotlar', sett_data_sub:'Export, import va tozalash',
    dashboard_title:'Dashboard', dashboard_sub:'Umumiy ko\'rinish',
    courses_title:'Kurslar', courses_sub:'Barcha kurslar',
    groups_title:'Guruhlar', groups_sub:LANG==='ru'?'Все группы':LANG==='en'?'All groups':'Barcha guruhlar',
    mentors_title:'Mentorlar', mentors_sub:'Barcha mentorlar',
    students_title:'Talabalar', students_sub:'Barcha talabalar',
    finance_title:'💰 Moliya', finance_sub:'Kirim · Chiqim · Mentor oylik',
    settings_title:'Sozlamalar', settings_sub:'Tizim sozlamalari',
    // Attendance days
    att_monday:'Du', att_tuesday:'Se', att_wednesday:'Ch',
    att_thursday:'Pa', att_friday:'Ju', att_saturday:'Sh',
    came:'Keldi', absent_word:'Yo\'q', excused:'Sababli',
    // Months
    jan:'Yanvar', feb:'Fevral', mar:'Mart', apr:'Aprel', may_:'May',
    jun:'Iyun', jul:'Iyul', aug:'Avgust', sep:'Sentabr',
    oct:'Oktabr', nov:'Noyabr', dec:'Dekabr',
    // Finance
    income:'Kirim', expense:'Chiqim', salary:'Mentor oylik',
    all_:'Barchasi',
    goals:'Maqsadlar', goals_title:'Maqsadlarim', goals_sub:'O\'quv maqsadlaringizni belgilang',
    theme_snow:'❄️ Qor',
    nav_mentor_dash:'Dashboard', nav_mentor_groups:'Guruhlar', nav_my_schedule:'Mening jadvalim', nav_chat:'Chat',
    nav_tests:'Testlar', nav_grades:'Baholash',
    nav_student_dash:'Dashboard', nav_schedule:'Dars jadvali', nav_rating:'Guruh reytingi',
    // ---- YANGI (2026 yangilanish): pagination, kredensiallar, baholash, dashboard analytics, chat, maqsadlar ----
    prev:'Oldingi', next:'Keyingi', edit_btn:'Tahrirlash', delete_btn:'O\'chirish',
    no_students_found:'Talaba topilmadi', no_groups_found:'Guruh topilmadi', no_history:'Tarix yo\'q',
    status_Aktiv:'Aktiv', status_Faolsiz:'Faolsiz', status_Muzlatilgan:'Muzlatilgan', status_Probatsiya:'Probatsiya', status_Arxiv:'Arxiv',
    paid:'To\'lagan', courses:'Kurslar', groups:'Guruhlar', students:'Talabalar',
    dashboard_sub:'Umumiy ko\'rsatkichlar', courses_sub:'Kurslar ro\'yxati', groups_sub:'Guruhlar ro\'yxati',
    mentors_sub:'Mentorlar ro\'yxati', students_sub:'Talabalar ro\'yxati', finance_sub:'Moliyaviy hisobot', settings_sub:'Tizim sozlamalari',
    all_mentors:'Barcha mentorlar', salary:'Oylik', expense:'Xarajat', income:'Daromad', clear:'Tozalash', placeholder:'Xabar yozing...',
    welcome_mentor:'Xush kelibsiz, Mentor', welcome_student:'Xush kelibsiz, Talaba', title_mentor:'Mentor Panel', title_student:'Talaba Panel',
    login_credentials_title:'Login va parol (Student Panel)', login_credentials_hint:'Ushbu login va parol orqali talaba Student Panelga kira oladi.',
    login_label:'Login', password_label:'Parol', pass_keep_current:'Bo\'sh qoldiring — o\'zgarmaydi', pass_min_chars:'Kamida 5 belgi',
    suggest_btn:'Taklif qilish', generate_btn:'Yaratish', login_too_short:'Login kamida 3 belgidan iborat bo\'lsin!',
    pass_too_short:'Parol kamida 5 belgidan iborat bo\'lsin!', login_taken:'Bu login band! Boshqasini tanlang.',
    cred_saved_title:'Kirish ma\'lumotlari saqlandi!', cred_saved_warning:'Parol xesh qilib saqlanadi va qayta ko\'rsatilmaydi — hozir nusxalab oling!',
    copy_btn:'Nusxalash', ok_btn:'Tushunarli', copied_msg:'Nusxalandi!',
    simple_grading:'Oddiy baholash', criteria_grading:'Mezonlar bo\'yicha', group_label:'Guruh', search_label:'Qidiruv',
    search_student_ph:'Talaba ismi...', all_groups_opt:'Barcha guruhlar',
    col_student:'Talaba', col_group:'Guruh', col_last_grade:'Oxirgi baho', col_avg_grade:'O\'rtacha baho', col_actions:'Amallar',
    add_grade_btn:'Baho qo\'yish', history_btn:'Tarix', new_grade_title:'Yangi baho qo\'yish', score_label:'Ball',
    comment_label:'Izoh', comment_ph:'Ixtiyoriy izoh yozing...', cancel:'Bekor qilish', save:'Saqlash',
    score_range_error:'Ball 0 dan 100 gacha bo\'lishi kerak!', grade_saved_msg:'Baho saqlandi!', grade_history_title:'Baholar tarixi',
    no_grades_yet:'Hali baho yo\'q', confirm_delete_grade:'Ushbu bahoni o\'chirishga ishonchingiz komilmi?', grade_deleted_msg:'Baho o\'chirildi', close:'Yopish',
    today_lessons:'Bugungi darslar', week_lessons:'Shu hafta darslar', attendance_pct:'Davomat foizi', avg_grade:'O\'rtacha baho',
    monthly_growth:'Oylik o\'sish', chart_weekly_att:'Haftalik davomat', chart_monthly_grades:'Oylik baholar',
    chart_student_activity:'Talabalar faolligi', chart_lesson_stats:'Darslar statistikasi', present_lbl:'Keldi', absent_lbl:'Kelmadi',
    most_active_students:'Eng faol talabalar', low_performers:'Past natijali talabalar', recent_activity:'Oxirgi faoliyatlar',
    no_data_yet:'Hali ma\'lumot yo\'q', all_good_msg:'Hammasi yaxshi!',
    attach_file:'Fayl biriktirish', file_too_big:'Fayl juda katta (2MB dan kichik bo\'lsin)', photo_lbl:'rasm', file_lbl:'fayl',
    online_status:'Onlayn', offline_status:'Oflayn', last_seen_min:'{n} daqiqa oldin', last_seen_hour:'{n} soat oldin', last_seen_days:'{n} kun oldin',
    lessons_done:'O\'qilgan darslar', lessons_left:'Qolgan darslar', goals_done_pct:'Maqsad bajarilishi', monthly_progress:'Oylik progress',
    chart_grades:'Baholar grafigi', chart_attendance:'Davomat grafigi', chart_progress:'Progress grafigi', overall_rating:'Umumiy reyting', current_month:'Joriy oy',
    goal_deadline_label:'Muddat', goal_overdue:'Muddati o\'tgan', goal_due_today:'Bugun tugaydi', goal_days_left:'{n} kun qoldi', goal_remaining_pct:'{n}% qoldi',
  },
  ru: {
    menu:'Меню', dashboard:'Главная', courses:'Курсы', groups:'Группы',
    mentors:'Менторы', students:'Студенты', finance:'Финансы', settings:'Настройки',
    super_admin:'Супер Админ', logout:'Выйти',
    add_course:'+ Добавить курс', add_group:'+ Добавить группу',
    add_mentor:'+ Добавить ментора', add_student:'+ Добавить студента',
    search_course:'Поиск курса...', search_group:'Поиск группы...',
    search_mentor:'Поиск ментора...', search_student:'Поиск студента...',
    all_courses:'Все курсы', all_mentors:'Все менторы',
    all_duration:'Все длительности', all_days:'Все дни',
    all_status:'Все статусы', all_payment:'Все оплаты',
    all_direction:'Все направления', all_exp:'Все',
    debtor:'💸 Должник', paid:'✅ Оплатил',
    exp_filter:'Опыт:', exp_5plus:'5+ лет',
    cancel:'Отмена', save:'💾 Сохранить', close:'Закрыть', edit_btn:'✏️ Редактировать',
    sett_name_title:'Название CRM', sett_name_sub:'Изменить название системы',
    sett_crm_name_label:'Название CRM', sett_preview:'Вид:',
    sett_save:'💾 Сохранить', sett_logo_title:'Логотип CRM',
    sett_logo_sub:'Изображение в сайдбаре и на экране входа',
    sett_logo_current:'Текущий логотип',
    sett_logo_hint:'JPG, PNG, WEBP · Макс 2MB · 64×64 рекомендуется',
    sett_upload_click:'Нажмите для загрузки', sett_logo_remove:'🗑 Удалить логотип',
    sett_theme_title:'Фон и цветовая схема', sett_theme_sub:'Выберите светлый или тёмный режим',
    theme_light:'☀️ Светлый', theme_dark:'🌙 Тёмный', theme_auto:'🔄 Авто',
    sett_font_title:'Размер текста', sett_font_sub:'Настройте размер шрифта интерфейса',
    font_sm:'Мелкий', font_md:'Средний', font_lg:'Крупный', font_xl:'Очень крупный',
    sett_accent_title:'Основной цвет', sett_accent_sub:'Цвет кнопок и значков',
    sett_data_title:'Данные', sett_data_sub:'Экспорт, импорт и очистка',
    dashboard_title:'Главная', dashboard_sub:'Общий обзор',
    courses_title:'Курсы', courses_sub:'Все курсы',
    groups_title:'Группы', groups_sub:'Все группы',
    mentors_title:'Менторы', mentors_sub:'Все менторы',
    students_title:'Студенты', students_sub:'Все студенты',
    finance_title:'💰 Финансы', finance_sub:'Доход · Расход · Зарплаты',
    settings_title:'Настройки', settings_sub:'Системные настройки',
    att_monday:'Пн', att_tuesday:'Вт', att_wednesday:'Ср',
    att_thursday:'Чт', att_friday:'Пт', att_saturday:'Сб',
    came:'Пришёл', absent_word:'Отсутствует', excused:'Уважит.',
    jan:'Янв', feb:'Фев', mar:'Мар', apr:'Апр', may_:'Май',
    jun:'Июн', jul:'Июл', aug:'Авг', sep:'Сен',
    oct:'Окт', nov:'Ноя', dec:'Дек',
    income:'Доход', expense:'Расход', salary:'Зарплата',
    all_:'Все',
    goals:'Цели', goals_title:'Мои цели', goals_sub:'Установите свои учебные цели',
    theme_snow:'❄️ Снег',
    nav_mentor_dash:'Дашборд', nav_mentor_groups:'Группы', nav_my_schedule:'Моё расписание', nav_chat:'Чат',
    nav_tests:'Тесты', nav_grades:'Оценки',
    nav_student_dash:'Дашборд', nav_schedule:'Расписание', nav_rating:'Рейтинг группы',
    // ---- НОВОЕ (обновление 2026): пагинация, учётные данные, оценки, аналитика, чат, цели ----
    prev:'Пред.', next:'След.', edit_btn:'Изменить', delete_btn:'Удалить',
    no_students_found:'Студенты не найдены', no_groups_found:'Группы не найдены', no_history:'Истории нет',
    status_Aktiv:'Активен', status_Faolsiz:'Неактивен', status_Muzlatilgan:'Заморожен', status_Probatsiya:'Испытательный', status_Arxiv:'Архив',
    paid:'Оплачено', courses:'Курсы', groups:'Группы', students:'Студенты',
    dashboard_sub:'Общая статистика', courses_sub:'Список курсов', groups_sub:'Список групп',
    mentors_sub:'Список менторов', students_sub:'Список студентов', finance_sub:'Финансовый отчёт', settings_sub:'Настройки системы',
    all_mentors:'Все менторы', salary:'Зарплата', expense:'Расход', income:'Доход', clear:'Очистить', placeholder:'Напишите сообщение...',
    welcome_mentor:'Добро пожаловать, Ментор', welcome_student:'Добро пожаловать, Ученик', title_mentor:'Панель ментора', title_student:'Панель ученика',
    login_credentials_title:'Логин и пароль (Панель ученика)', login_credentials_hint:'С помощью этого логина и пароля ученик сможет войти в Панель ученика.',
    login_label:'Логин', password_label:'Пароль', pass_keep_current:'Оставьте пустым — не изменится', pass_min_chars:'Минимум 5 символов',
    suggest_btn:'Предложить', generate_btn:'Создать', login_too_short:'Логин должен содержать минимум 3 символа!',
    pass_too_short:'Пароль должен содержать минимум 5 символов!', login_taken:'Этот логин занят! Выберите другой.',
    cred_saved_title:'Данные для входа сохранены!', cred_saved_warning:'Пароль хранится в виде хеша и больше не будет показан — скопируйте сейчас!',
    copy_btn:'Копировать', ok_btn:'Понятно', copied_msg:'Скопировано!',
    simple_grading:'Простая оценка', criteria_grading:'По критериям', group_label:'Группа', search_label:'Поиск',
    search_student_ph:'Имя ученика...', all_groups_opt:'Все группы',
    col_student:'Ученик', col_group:'Группа', col_last_grade:'Последняя оценка', col_avg_grade:'Средняя оценка', col_actions:'Действия',
    add_grade_btn:'Поставить оценку', history_btn:'История', new_grade_title:'Новая оценка', score_label:'Балл',
    comment_label:'Комментарий', comment_ph:'Необязательный комментарий...', cancel:'Отмена', save:'Сохранить',
    score_range_error:'Балл должен быть от 0 до 100!', grade_saved_msg:'Оценка сохранена!', grade_history_title:'История оценок',
    no_grades_yet:'Пока нет оценок', confirm_delete_grade:'Удалить эту оценку?', grade_deleted_msg:'Оценка удалена', close:'Закрыть',
    today_lessons:'Уроки сегодня', week_lessons:'Уроки на неделе', attendance_pct:'Посещаемость', avg_grade:'Средняя оценка',
    monthly_growth:'Рост за месяц', chart_weekly_att:'Посещаемость по дням', chart_monthly_grades:'Оценки по месяцам',
    chart_student_activity:'Активность учеников', chart_lesson_stats:'Статистика уроков', present_lbl:'Пришли', absent_lbl:'Отсутствовали',
    most_active_students:'Самые активные ученики', low_performers:'Ученики с низким результатом', recent_activity:'Последние действия',
    no_data_yet:'Пока нет данных', all_good_msg:'Всё отлично!',
    attach_file:'Прикрепить файл', file_too_big:'Файл слишком большой (макс. 2МБ)', photo_lbl:'фото', file_lbl:'файл',
    online_status:'В сети', offline_status:'Не в сети', last_seen_min:'{n} мин. назад', last_seen_hour:'{n} ч. назад', last_seen_days:'{n} дн. назад',
    lessons_done:'Пройдено уроков', lessons_left:'Осталось уроков', goals_done_pct:'Выполнение целей', monthly_progress:'Прогресс за месяц',
    chart_grades:'График оценок', chart_attendance:'График посещаемости', chart_progress:'График прогресса', overall_rating:'Общий рейтинг', current_month:'Текущий месяц',
    goal_deadline_label:'Срок', goal_overdue:'Просрочено', goal_due_today:'Сегодня срок', goal_days_left:'Осталось {n} дн.', goal_remaining_pct:'{n}% осталось',
  },
  en: {
    menu:'Menu', dashboard:'Dashboard', courses:'Courses', groups:'Groups',
    mentors:'Mentors', students:'Students', finance:'Finance', settings:'Settings',
    super_admin:'Super Admin', logout:'Logout',
    add_course:'+ Add Course', add_group:'+ Add Group',
    add_mentor:'+ Add Mentor', add_student:'+ Add Student',
    search_course:'Search course...', search_group:'Search group...',
    search_mentor:'Search mentor...', search_student:'Search student...',
    all_courses:'All courses', all_mentors:'All mentors',
    all_duration:'All durations', all_days:'All days',
    all_status:'All statuses', all_payment:'All payments',
    all_direction:'All directions', all_exp:'All',
    debtor:'💸 Debtor', paid:'✅ Paid',
    exp_filter:'Experience:', exp_5plus:'5+ yrs',
    cancel:'Cancel', save:'💾 Save', close:'Close', edit_btn:'✏️ Edit',
    sett_name_title:'CRM Name', sett_name_sub:'Change system name',
    sett_crm_name_label:'CRM Name', sett_preview:'Preview:',
    sett_save:'💾 Save', sett_logo_title:'CRM Logo',
    sett_logo_sub:'Image in sidebar and login screen',
    sett_logo_current:'Current logo',
    sett_logo_hint:'JPG, PNG, WEBP · Max 2MB · 64×64 recommended',
    sett_upload_click:'Click to upload', sett_logo_remove:'🗑 Remove logo',
    sett_theme_title:'Background & Color Scheme', sett_theme_sub:'Choose light or dark mode',
    theme_light:'☀️ Light', theme_dark:'🌙 Dark', theme_auto:'🔄 Auto',
    sett_font_title:'Text Size', sett_font_sub:'Adjust interface font size',
    font_sm:'Small', font_md:'Medium', font_lg:'Large', font_xl:'Extra Large',
    sett_accent_title:'Accent Color', sett_accent_sub:'Color of buttons and icons',
    sett_data_title:'Data', sett_data_sub:'Export, import and reset',
    dashboard_title:'Dashboard', dashboard_sub:'General overview',
    courses_title:'Courses', courses_sub:'All courses',
    groups_title:'Groups', groups_sub:'All groups',
    mentors_title:'Mentors', mentors_sub:'All mentors',
    students_title:'Students', students_sub:'All students',
    finance_title:'💰 Finance', finance_sub:'Income · Expense · Mentor salary',
    settings_title:'Settings', settings_sub:'System settings',
    att_monday:'Mon', att_tuesday:'Tue', att_wednesday:'Wed',
    att_thursday:'Thu', att_friday:'Fri', att_saturday:'Sat',
    came:'Present', absent_word:'Absent', excused:'Excused',
    jan:'Jan', feb:'Feb', mar:'Mar', apr:'Apr', may_:'May',
    jun:'Jun', jul:'Jul', aug:'Aug', sep:'Sep',
    oct:'Oct', nov:'Nov', dec:'Dec',
    income:'Income', expense:'Expense', salary:'Mentor salary',
    all_:'All',
    goals:'Goals', goals_title:'My Goals', goals_sub:'Set your learning goals',
    theme_snow:'❄️ Snow',
    nav_mentor_dash:'Dashboard', nav_mentor_groups:'Groups', nav_my_schedule:'My Schedule', nav_chat:'Chat',
    nav_tests:'Tests', nav_grades:'Grades',
    nav_student_dash:'Dashboard', nav_schedule:'Schedule', nav_rating:'Group Rating',
    // ---- NEW (2026 update): pagination, credentials, grading, dashboard analytics, chat, goals ----
    prev:'Prev', next:'Next', edit_btn:'Edit', delete_btn:'Delete',
    no_students_found:'No students found', no_groups_found:'No groups found', no_history:'No history',
    status_Aktiv:'Active', status_Faolsiz:'Inactive', status_Muzlatilgan:'Frozen', status_Probatsiya:'Probation', status_Arxiv:'Archive',
    paid:'Paid', courses:'Courses', groups:'Groups', students:'Students',
    dashboard_sub:'Overview', courses_sub:'Course list', groups_sub:'Group list',
    mentors_sub:'Mentor list', students_sub:'Student list', finance_sub:'Financial report', settings_sub:'System settings',
    all_mentors:'All mentors', salary:'Salary', expense:'Expense', income:'Income', clear:'Clear', placeholder:'Type a message...',
    welcome_mentor:'Welcome, Mentor', welcome_student:'Welcome, Student', title_mentor:'Mentor Panel', title_student:'Student Panel',
    login_credentials_title:'Login & Password (Student Panel)', login_credentials_hint:'The student can log into the Student Panel using this login and password.',
    login_label:'Login', password_label:'Password', pass_keep_current:'Leave blank to keep current', pass_min_chars:'At least 5 characters',
    suggest_btn:'Suggest', generate_btn:'Generate', login_too_short:'Login must be at least 3 characters!',
    pass_too_short:'Password must be at least 5 characters!', login_taken:'This login is taken! Choose another.',
    cred_saved_title:'Login credentials saved!', cred_saved_warning:'The password is stored hashed and won\'t be shown again — copy it now!',
    copy_btn:'Copy', ok_btn:'Got it', copied_msg:'Copied!',
    simple_grading:'Simple grading', criteria_grading:'By criteria', group_label:'Group', search_label:'Search',
    search_student_ph:'Student name...', all_groups_opt:'All groups',
    col_student:'Student', col_group:'Group', col_last_grade:'Last grade', col_avg_grade:'Average grade', col_actions:'Actions',
    add_grade_btn:'Add grade', history_btn:'History', new_grade_title:'New grade', score_label:'Score',
    comment_label:'Comment', comment_ph:'Optional comment...', cancel:'Cancel', save:'Save',
    score_range_error:'Score must be between 0 and 100!', grade_saved_msg:'Grade saved!', grade_history_title:'Grade history',
    no_grades_yet:'No grades yet', confirm_delete_grade:'Delete this grade?', grade_deleted_msg:'Grade deleted', close:'Close',
    today_lessons:'Today\'s lessons', week_lessons:'This week\'s lessons', attendance_pct:'Attendance rate', avg_grade:'Average grade',
    monthly_growth:'Monthly growth', chart_weekly_att:'Weekly attendance', chart_monthly_grades:'Monthly grades',
    chart_student_activity:'Student activity', chart_lesson_stats:'Lesson statistics', present_lbl:'Present', absent_lbl:'Absent',
    most_active_students:'Most active students', low_performers:'Low performers', recent_activity:'Recent activity',
    no_data_yet:'No data yet', all_good_msg:'All good!',
    attach_file:'Attach file', file_too_big:'File too big (max 2MB)', photo_lbl:'photo', file_lbl:'file',
    online_status:'Online', offline_status:'Offline', last_seen_min:'{n} min ago', last_seen_hour:'{n}h ago', last_seen_days:'{n}d ago',
    lessons_done:'Lessons done', lessons_left:'Lessons left', goals_done_pct:'Goals completed', monthly_progress:'Monthly progress',
    chart_grades:'Grades chart', chart_attendance:'Attendance chart', chart_progress:'Progress chart', overall_rating:'Overall rating', current_month:'Current month',
    goal_deadline_label:'Deadline', goal_overdue:'Overdue', goal_due_today:'Due today', goal_days_left:'{n} days left', goal_remaining_pct:'{n}% remaining',
  }
};
let _finModal_type=null,_finModal_editId=null;
let _finMonth=new Date().getMonth(),_finYear=new Date().getFullYear();

const UI_KEY='edumanage_ui_v8';
// FIX: CRM nomi va logotipi endi ALOHIDA, backend bilan sinxron kalitda saqlanadi
// (edumanage_ui_v8 — har user/qurilma uchun shaxsiy, backendga yozilmaydi;
//  edumanage_branding_v1 — umumiy, backend KV orqali barcha panellarga (admin/mentor/student) tarqaladi)
const BRAND_KEY='edumanage_branding_v1';
let _uiSettings={lang:'uz',tab:'dashboard',theme:'auto',fontSize:'md',accent:'blue'};
let _brandSettings={crmName:'EduManage',crmLogo:null};

// Helper functions
function fmtMoney(n){return Math.round(n).toLocaleString('uz-UZ');}
function fmtDateTime(iso){
  if(!iso)return '—';
  const dt=new Date(iso);
  const d=dt.getDate(), m=dt.getMonth(), h=dt.getHours(), min=dt.getMinutes();
  const monthNames=getMonthNames(true);
  return d+' '+monthNames[m]+' '+dt.getHours().toString().padStart(2,'0')+':'+dt.getMinutes().toString().padStart(2,'0');
}
// ===================== CHAT: umumiy infratuzilma =====================
// Online status uchun "heartbeat": foydalanuvchi ilova ochiq bo'lganda
// har 20s da o'z holatini yozib turadi. Boshqa tomon buni o'qib "Onlayn"
// yoki "oxirgi faollik" ko'rsata oladi.
let _presenceTimer = null;
function _presenceKeyFor(role, idOrName) {
  if (role === 'mentor') return 'presence_mentor_' + btoa(unescape(encodeURIComponent(String(idOrName)))).replace(/=/g, '');
  return 'presence_student_' + idOrName;
}
function startPresenceHeartbeat() {
  if (_presenceTimer) return;
  try {
    const cu = getCurrentUser();
    if (!cu || !cu.loggedIn) return;
    let key = null;
    if (cu.role === 'Mentor') key = _presenceKeyFor('mentor', cu.mentorName || cu.name);
    else if (cu.role === 'Talaba') key = _presenceKeyFor('student', cu.studentId);
    if (!key) return;
    const beat = () => { try { localStorage.setItem(key, String(Date.now())); } catch (e) {} };
    beat();
    _presenceTimer = setInterval(beat, 20000);
  } catch (e) {}
}
function isPresenceOnline(tsStr) {
  if (!tsStr) return false;
  const ts = parseInt(tsStr);
  if (isNaN(ts)) return false;
  return (Date.now() - ts) < 35000;
}
function presenceLastSeenLabel(tsStr) {
  if (!tsStr) return t('offline_status');
  const ts = parseInt(tsStr);
  if (isNaN(ts)) return t('offline_status');
  const diffMin = Math.floor((Date.now() - ts) / 60000);
  if (diffMin < 1) return t('online_status');
  if (diffMin < 60) return t('last_seen_min').replace('{n}', diffMin);
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return t('last_seen_hour').replace('{n}', diffH);
  return t('last_seen_days').replace('{n}', Math.floor(diffH / 24));
}
// Chat (va boshqa) real-time yangilanishlar uchun: backend KV'dan to'g'ridan-to'g'ri
// yangi holatni o'qib, mos localStorage kalitlarini yangilaydi. Bu MUHIM tuzatish —
// avvalgi 3s polling faqat brauzerning O'ZINING eski localStorage nusxasini qayta
// o'qir edi va boshqa qurilmada yozilgan yangi xabarlarni umuman ko'rmas edi.
async function _chatPollRemoteAll(prefixes) {
  try {
    const API = (typeof __API_BASE__ !== 'undefined' && __API_BASE__) ? __API_BASE__ : '';
    const res = await fetch(API + '/api/kv');
    if (!res.ok) return false;
    const j = await res.json();
    if (!j || !j.ok || !j.data) return false;
    let changed = false;
    Object.keys(j.data).forEach(k => {
      if (prefixes.some(p => k.indexOf(p) === 0)) {
        const cur = Storage.prototype.getItem.call(localStorage, k);
        if (cur !== j.data[k]) { Storage.prototype.setItem.call(localStorage, k, j.data[k]); changed = true; }
      }
    });
    return changed;
  } catch (e) { return false; }
}
// Fayl/rasm biriktirmalarni kichik base64 data-URL sifatida o'qiydi (2MB chegara)
function _fileToDataURL(file, maxBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('no file'));
    if (file.size > maxBytes) return reject(new Error('too_big'));
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
const CHAT_EMOJIS = ['😀','😂','🥰','😎','👍','🙏','🎉','❤️','😢','😮','🔥','✅','❓','👏','💪','📚'];

// ===================== Fokusni saqlagan holda qayta chizish =====================
// BUG TUZATISH: qidiruv maydonlariga harf yozilganda butun panel innerHTML orqali
// qayta chizilardi — bu ESKI input elementini yo'q qilib, YANGISINI yaratardi,
// natijada input FOKUSNI yo'qotar edi (har harfdan keyin qayta bosish kerak bo'lardi).
// Bu funksiya: qaysi element fokusda ekanini va kursor pozitsiyasini eslab qoladi,
// qayta chizadi, so'ng xuddi shu ID'li (endi YANGI) elementga fokusni qaytaradi.
function _rerenderPreservingFocus(renderFn){
  const active=document.activeElement;
  const id=active&&active.id;
  const selStart=(active&&typeof active.selectionStart==='number')?active.selectionStart:null;
  const selEnd=(active&&typeof active.selectionEnd==='number')?active.selectionEnd:null;
  renderFn();
  if(id){
    const el=document.getElementById(id);
    if(el){
      el.focus();
      if(selStart!==null&&el.setSelectionRange){
        try{el.setSelectionRange(selStart,selEnd);}catch(e){}
      }
    }
  }
}
let _debounceTimers={};
// Tez-tez chaqiriladigan amallarni (masalan har harfda) kechiktiradi — ortiqcha
// qayta chizish/tarmoq so'rovlarining oldini oladi (masalan chat qidiruvda polling qayta ishga tushishi)
function _debounce(key, fn, ms=250){
  clearTimeout(_debounceTimers[key]);
  _debounceTimers[key]=setTimeout(fn, ms);
}

function todayStr(){return new Date().toISOString().slice(0,10);}
function toast(msg){const el=document.getElementById('toast');el.textContent=msg;el.classList.add('on');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('on'),2800);}
const ini=n=>n.trim().split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase();

// ===================== PASSWORD HASHING (secure credential storage) =====================
// Talaba/mentor parollari endi ochiq matnda emas, SHA-256 xesh sifatida saqlanadi.
// Login tekshiruvida ham eski (oldindan yaratilgan, hali xeshlanmagan) parollar
// bilan orqaga moslik saqlanadi (bkwd-compat tekshiruvi auth.js'da amalga oshadi).
async function sha256Hex(str){
  try{
    const buf=await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(str)));
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }catch(e){
    // crypto.subtle mavjud bo'lmagan muhitlarda (juda kamdan-kam) - oddiy fallback
    let h=0; const s=String(str);
    for(let i=0;i<s.length;i++){h=(h<<5)-h+s.charCodeAt(i);h|=0;}
    return 'fb'+Math.abs(h).toString(16);
  }
}
// Barcha login'lar (admin + mentor + student) orasida takrorlanmaslikni tekshiradi.
// excludeKind/excludeId — tahrirlanayotgan foydalanuvchining o'zini istisno qilish uchun.
function isLoginTaken(login, excludeKind, excludeId){
  if(!login) return false;
  const lo=String(login).trim().toLowerCase();
  if(!lo) return false;
  try{
    const adminCred=JSON.parse(localStorage.getItem('edumanage_admin_cred_v1')||'null');
    if(adminCred && String(adminCred.login||'').toLowerCase()===lo && excludeKind!=='admin') return true;
  }catch(e){}
  try{
    const mentors=JSON.parse(localStorage.getItem('edumanage_mentor_users_v8')||'[]');
    if(mentors.some(m=>String(m.login||'').toLowerCase()===lo && !(excludeKind==='mentor'&&String(m.mentorId)===String(excludeId)))) return true;
  }catch(e){}
  try{
    const students=JSON.parse(localStorage.getItem('edumanage_student_users_v9')||'[]');
    if(students.some(s=>String(s.login||'').toLowerCase()===lo && !(excludeKind==='student'&&String(s.studentId)===String(excludeId)))) return true;
  }catch(e){}
  return false;
}
// Ism asosida taklif qilinadigan login yaratadi (lotin harflarga o'tkazadi, band bo'lsa raqam qo'shadi)
function suggestLogin(fullName, excludeKind, excludeId){
  const translit={'ў':'u','қ':'q','ғ':'g','ҳ':'h','ё':'yo','ю':'yu','я':'ya','ж':'j','ш':'sh','ч':'ch','ц':'ts','х':'x','й':'y','щ':'sh'};
  let base=(fullName||'student').toLowerCase().trim();
  base=base.split('').map(ch=>translit[ch]||ch).join('');
  base=base.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  base=base.replace(/[^a-z0-9\s]/g,'').trim().split(/\s+/).filter(Boolean).join('.');
  if(!base) base='student';
  let login=base, i=1;
  while(isLoginTaken(login, excludeKind, excludeId)){ i++; login=base+i; }
  return login;
}
function genPassword(len=8){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out='';
  const arr=new Uint32Array(len); crypto.getRandomValues(arr);
  for(let i=0;i<len;i++) out+=chars[arr[i]%chars.length];
  return out;
}

// Apply i18n translations to DOM
function applyTranslations(){
  // Topbar lang tugmalarini yangilash
  ['uz','ru','en'].forEach(l=>{
    const btn=document.getElementById('lb-'+l);
    if(btn){btn.classList.toggle('active',LANG===l);}
  });
  // Nav labels
  document.querySelectorAll('[data-t]').forEach(el=>{
    const key=el.getAttribute('data-t');
    const val=t(key);
    if(val!==key) el.textContent=val;
  });
  // Placeholders
  document.querySelectorAll('[data-ph]').forEach(el=>{
    const key=el.getAttribute('data-ph');
    const val=t(key);
    if(val!==key) el.placeholder=val;
  });
  // Select options with data-t
  document.querySelectorAll('option[data-t]').forEach(el=>{
    const key=el.getAttribute('data-t');
    const val=t(key);
    if(val!==key) el.textContent=val;
  });
}

// ===================== BRANDING (CRM nomi + logotip) =====================
// Bu sozlamalar backend KV orqali saqlanadi (backend-storage.js shim'i tufayli
// localStorage.setItem(BRAND_KEY,...) avtomatik backend'ga ham yoziladi),
// shuning uchun admin o'zgartirsa — mentor va student panellarida ham ko'rinadi.
function loadBranding(){
  try{
    const b=JSON.parse(localStorage.getItem(BRAND_KEY)||'{}');
    _brandSettings=Object.assign({crmName:'EduManage',crmLogo:null},b);
  }catch(e){}
}
function saveBranding(){
  try{localStorage.setItem(BRAND_KEY,JSON.stringify(_brandSettings));}catch(e){}
}
// Boshqa panel (masalan admin)da o'zgargan branding'ni jonli olib turish:
// sahifa fokusga qaytganda va har 15 soniyada backend'dagi eng so'nggi
// edumanage_branding_v1 qiymatini tekshirib, o'zgargan bo'lsa darhol qo'llaymiz.
function refreshBrandingFromBackend(){
  try{
    if(document.hidden) return;
    var ae=document.activeElement;
    // CRM nomi inputiga yozayotgan bo'lsa — bosib qolmaymiz, keyingi tikda urinamiz
    if(ae&&ae.id==='sett-crm-name') return;
    var _API=typeof __API_BASE__!=='undefined'&&__API_BASE__?__API_BASE__:'';
    fetch(_API+'/api/kv').then(function(r){return r.json();}).then(function(r){
      if(r&&r.ok&&r.data&&typeof r.data[BRAND_KEY]==='string'){
        var fresh=r.data[BRAND_KEY];
        if(fresh!==localStorage.getItem(BRAND_KEY)){
          Storage.prototype.setItem.call(localStorage,BRAND_KEY,fresh);
          loadBranding();
          applyLogo();
          const name=_brandSettings.crmName||'EduManage';
          const slm=document.getElementById('sidebar-crm-name');if(slm)slm.textContent=name;
          const llm=document.getElementById('login-crm-name');if(llm)llm.textContent=name;
          document.title=name+' CRM';
        }
      }
    }).catch(function(){});
  }catch(e){}
}
setInterval(refreshBrandingFromBackend,15000);
window.addEventListener('focus',refreshBrandingFromBackend);
document.addEventListener('visibilitychange',function(){if(!document.hidden)refreshBrandingFromBackend();});

// ===================== UI SETTINGS =====================
function loadUI(){
  try{
    const u=JSON.parse(localStorage.getItem(UI_KEY)||'{}');
    _uiSettings=Object.assign({},_uiSettings,u);
    loadBranding();
    LANG=_uiSettings.lang||'uz';
    const savedTab=_uiSettings.tab||'dashboard';
    // Rolga qarab to'g'ri tabni yuklash
    const role=(()=>{try{return JSON.parse(localStorage.getItem('edumanage_auth_v10')||'{}').role||'';}catch(e){return '';}})();
    if(role==='Mentor'){
      const ok=['mentor-dash','mentor-groups','mentors-my','mentor-chat','mentor-ai','tests-mentor','grades-mentor','mentor-videos','settings'];
      currentTab=ok.includes(savedTab)?savedTab:'mentor-dash';
    } else if(role==='Talaba'){
      const ok=['student-my','student-schedule','student-rating','student-grades','student-tests','student-chat','student-ai','student-videos','student-goals','student-coin-shop','settings'];
      currentTab=ok.includes(savedTab)?savedTab:'student-my';
    } else {
      const ok=['dashboard','courses','groups','mentors','students','finance','settings','coin-shop'];
      currentTab=ok.includes(savedTab)?savedTab:'dashboard';
    }
  }catch(e){}
}
function saveUI(){
  _uiSettings.lang=LANG;_uiSettings.tab=currentTab;
  try{localStorage.setItem(UI_KEY,JSON.stringify(_uiSettings));}catch(e){}
}

// FIX #6 - Font size must affect ALL elements via CSS variable
function applyUISettings(){
  const body=document.body;
  body.classList.remove('theme-light','theme-dark','theme-snow');
  if(_uiSettings.theme==='light')body.classList.add('theme-light');
  else if(_uiSettings.theme==='dark')body.classList.add('theme-dark');
  else if(_uiSettings.theme==='snow')body.classList.add('theme-snow');

  // FIX #6: Remove all font size classes and re-apply properly
  body.classList.remove('fs-sm','fs-md','fs-lg','fs-xl');
  const fs=_uiSettings.fontSize||'md';
  body.classList.add('fs-'+fs);
  // Also set --ui-font-size CSS variable explicitly on :root
  const fsMap={sm:'12px',md:'14px',lg:'16px',xl:'19px'};
  document.documentElement.style.setProperty('--ui-font-size', fsMap[fs]||'14px');
  document.documentElement.style.fontSize = fsMap[fs]||'14px';

  body.classList.remove('accent-teal','accent-purple','accent-orange','accent-rose','accent-green');
  if(_uiSettings.accent&&_uiSettings.accent!=='blue')body.classList.add('accent-'+_uiSettings.accent);

  const name=_brandSettings.crmName||'EduManage';
  document.getElementById('sidebar-crm-name').textContent=name;

  // FIX #1: Login screen title must use saved CRM name
  const loginCrmName=document.getElementById('login-crm-name');
  if(loginCrmName) loginCrmName.textContent=name;

  document.title=name+' CRM';
  applyLogo();
  applyTranslations();
}

// FIX #1: Apply logo to login screen too
function applyLogo(){
  const logo=_brandSettings.crmLogo;
  const name=_brandSettings.crmName||'EduManage';
  const fl=name[0]||'E';

  // Sidebar logo
  const slm=document.getElementById('sidebar-logo-mark');
  if(slm){
    if(logo) slm.innerHTML=`<img src="${logo}" style="width:38px;height:38px;object-fit:cover;border-radius:var(--r-lg)">`;
    else slm.innerHTML=`<span style="color:#fff;font-weight:700;font-size:18px">${fl}</span>`;
  }

  // FIX #1: Login logo - use saved logo and name
  const llm=document.getElementById('login-logo-img-wrap');
  if(llm){
    if(logo) llm.innerHTML=`<img src="${logo}" style="width:52px;height:52px;object-fit:cover;border-radius:var(--r-lg)">`;
    else llm.innerHTML=`<span style="color:#fff;font-weight:800;font-size:22px">${fl}</span>`;
  }

  // FIX #1: Login CRM name
  const loginName=document.getElementById('login-crm-name');
  if(loginName) loginName.textContent=name;

  // Settings logo preview
  const sp=document.getElementById('sett-logo-preview');
  if(sp){
    if(logo) sp.innerHTML=`<img src="${logo}" style="width:64px;height:64px;object-fit:cover;border-radius:16px">`;
    else{sp.innerHTML=`<span style="color:#fff;font-weight:800;font-size:26px">${fl}</span>`;sp.style.background='linear-gradient(135deg,var(--accent),var(--teal))';}
  }
}

// Settings panel
// Settings panel
function renderSettingsPanel(){
  const inp=document.getElementById('sett-crm-name');if(inp)inp.value=_brandSettings.crmName||'EduManage';
  const prev=document.getElementById('sett-name-preview');if(prev)prev.textContent=_brandSettings.crmName||'EduManage';
  applyLogo();
  ['light','auto','snow'].forEach(th=>{const el=document.getElementById('theme-'+th);if(el)el.classList.toggle('selected',_uiSettings.theme===th);});
  ['sm','md','lg','xl'].forEach(s=>{const el=document.getElementById('fs-'+s);if(el)el.classList.toggle('selected',(_uiSettings.fontSize||'md')===s);});
  document.querySelectorAll('.accent-swatch').forEach(sw=>sw.classList.toggle('selected',sw.dataset.color===(_uiSettings.accent||'blue')));
  // Mentor/Student creds kartochkasi faqat adminga ko'rsatiladi
  const credsCard=document.getElementById('mentor-creds-card');
  if(credsCard)credsCard.style.display=(isMentorRole()||isStudentRole())?'none':'';
  const stuCredsCard=document.getElementById('student-creds-card');
  if(stuCredsCard)stuCredsCard.style.display=(isMentorRole()||isStudentRole())?'none':'';
  // Admin o'z login/parolini o'zgartirish kartochkasi — faqat admin
  const adminCredsCard=document.getElementById('admin-creds-card');
  if(adminCredsCard){
    adminCredsCard.style.display=(isMentorRole()||isStudentRole())?'none':'';
    if(!isMentorRole()&&!isStudentRole()){
      // Login serverdagi sessiyadan olinadi (localStorage'da parol saqlanmaydi).
      const _me=(window.CRMAuth&&window.CRMAuth.user())||{};
      const _login=_me.username||getCurrentUser().username||'admin';
      const li=document.getElementById('sett-admin-login');
      if(li){li.value=_login;li.readOnly=false;li.title='';}
      const pi=document.getElementById('sett-admin-pass');if(pi)pi.value='';
      const pi2=document.getElementById('sett-admin-pass2');if(pi2)pi2.value='';
      const cur=document.getElementById('sett-admin-current');if(cur)cur.textContent=_login;
    }
  }
  // CRM nom va logotip kartochkalari faqat adminga ko'rsatiladi
  const nameCard=document.getElementById('sett-name-card');
  if(nameCard)nameCard.style.display=(isMentorRole()||isStudentRole())?'none':'';
  const logoCard=document.getElementById('sett-logo-card');
  if(logoCard)logoCard.style.display=(isMentorRole()||isStudentRole())?'none':'';
  // Student profile & motivation cards
  const profileCard=document.getElementById('student-profile-card');
  const motivCard=document.getElementById('student-motivation-card');
  if(profileCard) profileCard.style.display=isStudentRole()?'flex':'none';
  // Motivation card sozlamalardan olib tashlandi — alohida "Maqsadlar" menusida
  if(motivCard) motivCard.style.display='none';
  if(isStudentRole()){
    renderStudentProfileCard();
  }
  // Also hide admin-only cards from students/mentors
  ['sett-name-title','sett-logo-title','mentor-creds-card','student-creds-card'].forEach(id=>{
    const el=document.getElementById(id);
  });
  applyTranslations();
  // Render mentor credentials section if in settings
  setTimeout(()=>{renderMentorCredsList();renderStudentCredsList();},10);
}

function renderStudentProfileCard(){
  const cu=getCurrentUser();
  const studentId=cu.studentId?parseInt(cu.studentId):null;
  const s=studentId?D.students.find(x=>x.id===studentId):null;
  const body=document.getElementById('student-profile-card-body');
  if(!body)return;
  // Update header
  const title=document.getElementById('spc-title');
  const sub=document.getElementById('spc-sub');
  const L=LANG;
  if(title)title.textContent=L==='ru'?'Mening profilim':L==='en'?'My Profile':'Mening profilim';
  if(sub)sub.textContent=L==='ru'?'Sozlamalar':L==='en'?'Settings':'Sozlamalar';

  const savedDisplay=_uiSettings['studentDisplayName_'+(studentId||'')];
  const currentDisplay=savedDisplay||(s?s.name:'');
  const nameLbl=L==='ru'?'Ko\'rsatma ism':L==='en'?'Display name':'Ko\'rsatma ism';
  const saveLbl=L==='ru'?'Saqlash':L==='en'?'Save':'Saqlash';
  const hintLbl=L==='ru'?'Faqat sizga ko\'rinadi':L==='en'?'Only visible to you':'Faqat sizga ko\'rinadi';

  // Theme / lang / accent / font — same as mentor dash but student style
  const isDark=_uiSettings&&_uiSettings.theme==='dark';
  const curLang=LANG||'uz';
  const curAccent=_uiSettings.accent||'blue';
  const curFs=_uiSettings.fontSize||'md';
  const accentColors=[{k:'blue',c:'#3b82f6'},{k:'teal',c:'#0d9488'},{k:'purple',c:'#7c3aed'},{k:'orange',c:'#ea580c'},{k:'rose',c:'#e11d48'},{k:'green',c:'#059669'}];

  body.innerHTML=`
    <!-- Avatar + name block -->
    <div style="display:flex;align-items:center;gap:16px;padding:18px;background:linear-gradient(135deg,var(--accent-light),var(--bg2));border-radius:14px;margin-bottom:20px;border:1.5px solid var(--accent)">
      <div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--teal));display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:900;color:#fff;flex-shrink:0;border:3px solid rgba(255,255,255,.3)">${ini(currentDisplay||'?')}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:17px;font-weight:900;color:var(--text);letter-spacing:-.3px">${currentDisplay||'—'}</div>
        <div style="font-size:11px;color:var(--accent-text);font-weight:700;margin-top:2px">🎓 ${s?(D.groups.find(g=>g.id===s.groupId)||{name:'—'}).name:'—'}</div>
      </div>
    </div>

    <!-- Name edit -->
    <div style="margin-bottom:20px">
      <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">${nameLbl}</div>
      <div style="display:flex;gap:8px">
        <input type="text" id="student-display-name-inp" value="${currentDisplay.replace(/"/g,'&quot;')}" placeholder="${nameLbl}" style="flex:1;border-radius:10px;border:1.5px solid var(--border2);padding:9px 13px;font-size:14px;font-weight:600;background:var(--bg);color:var(--text)">
        <button onclick="saveStudentDisplayName()" style="background:var(--accent);color:#fff;border:none;border-radius:10px;padding:9px 16px;font-size:13px;font-weight:700;cursor:pointer">${saveLbl}</button>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:5px">ℹ️ ${hintLbl}</div>
    </div>

    <div style="height:1px;background:var(--border);margin-bottom:20px"></div>

    <!-- Theme -->
    <div style="margin-bottom:16px">
      <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">${L==='ru'?'Mavzu':L==='en'?'Theme':'Mavzu'}</div>
      <div style="display:flex;gap:8px">
        <button onclick="setTheme('light');renderStudentProfileCard()" style="flex:1;padding:8px;border-radius:10px;border:2px solid ${!isDark?'var(--accent)':'var(--border2)'};background:${!isDark?'var(--accent-light)':'var(--bg3)'};color:${!isDark?'var(--accent-text)':'var(--text2)'};font-size:13px;font-weight:700;cursor:pointer">☀️ Yorug'</button>
        <button onclick="setTheme('dark');renderStudentProfileCard()" style="flex:1;padding:8px;border-radius:10px;border:2px solid ${isDark?'var(--accent)':'var(--border2)'};background:${isDark?'var(--accent-light)':'var(--bg3)'};color:${isDark?'var(--accent-text)':'var(--text2)'};font-size:13px;font-weight:700;cursor:pointer">🌙 Qorong'i</button>
      </div>
    </div>

    <!-- Language -->
    <div style="margin-bottom:16px">
      <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">${L==='ru'?'Til':L==='en'?'Language':'Til'}</div>
      <div style="display:flex;gap:8px">
        ${['uz','ru','en'].map(l=>`<button onclick="setLang('${l}',this);renderStudentProfileCard()" class="lang-btn${curLang===l?' active':''}" style="flex:1;padding:8px;border-radius:10px;border:2px solid ${curLang===l?'var(--accent)':'var(--border2)'};background:${curLang===l?'var(--accent-light)':'var(--bg3)'};color:${curLang===l?'var(--accent-text)':'var(--text2)'};font-size:13px;font-weight:700;cursor:pointer">${l==='uz'?'🇺🇿 UZ':l==='ru'?'🇷🇺 РУ':'🇬🇧 EN'}</button>`).join('')}
      </div>
    </div>

    <!-- Accent color -->
    <div style="margin-bottom:16px">
      <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">${L==='ru'?'Rang':L==='en'?'Color':'Rang'}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${accentColors.map(a=>`<button onclick="setAccent('${a.k}',this);renderStudentProfileCard()" title="${a.k}" style="width:36px;height:36px;border-radius:50%;background:${a.c};border:3px solid ${curAccent===a.k?'#fff':'transparent'};outline:3px solid ${curAccent===a.k?a.c:'transparent'};cursor:pointer;transition:.15s"></button>`).join('')}
      </div>
    </div>

    <!-- Font size -->
    <div>
      <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">${L==='ru'?'Shrift':L==='en'?'Font size':'Shrift'}</div>
      <div style="display:flex;gap:8px">
        ${[['sm','S — Kichik'],['md','M — O\'rta'],['lg','L — Katta'],['xl','XL — Juda katta']].map(([k,lbl])=>`<button onclick="setFontSize('${k}');renderStudentProfileCard()" style="flex:1;padding:7px 4px;border-radius:10px;border:2px solid ${curFs===k?'var(--accent)':'var(--border2)'};background:${curFs===k?'var(--accent-light)':'var(--bg3)'};color:${curFs===k?'var(--accent-text)':'var(--text2)'};font-size:11px;font-weight:700;cursor:pointer">${lbl}</button>`).join('')}
      </div>
    </div>
  `;
}

function saveStudentDisplayName(){
  const inp=document.getElementById('student-display-name-inp');
  if(!inp)return;
  const val=inp.value.trim();
  if(!val){toast('⚠️ Ism bo\'sh bo\'lmasin!');return;}
  const cu=getCurrentUser();
  const studentId=cu.studentId?parseInt(cu.studentId):null;
  _uiSettings['studentDisplayName_'+(studentId||'')]=val;
  saveUI();
  // Update sidebar username display
  const uname=document.querySelector('.u-name');
  if(uname) uname.textContent=val;
  toast('✅ Ism saqlandi: '+val);
  renderStudentProfileCard();
}

function renderStudentMotivationCard(){
  const body=document.getElementById('student-motivation-card-body');
  if(!body)return;
  const title=document.getElementById('smc-title');
  const sub=document.getElementById('smc-sub');
  const goalTitle=LANG==='ru'?'Моя цель':LANG==='en'?'My Goal':'Maqsadim';
  const goalSub=LANG==='ru'?'Установите учебную цель':LANG==='en'?'Set your study goal':'O\'quv maqsadingizni belgilang';
  if(title) title.textContent=goalTitle;
  if(sub) sub.textContent=goalSub;
  const saved=_uiSettings.studentGoal||'';
  const goalLbl=LANG==='ru'?'Моя цель на этот курс':LANG==='en'?'My goal for this course':'Bu kurs uchun maqsadim';
  const phLbl=LANG==='ru'?'Например: освоить React, найти работу...':LANG==='en'?'E.g.: Learn React, get a job...':'Masalan: React o\'rganish, ish topish...';
  const saveLbl=LANG==='ru'?'💾 Сохранить':LANG==='en'?'💾 Save':'💾 Saqlash';
  body.innerHTML=`
    <div class="fg">
      <label style="font-size:12px;font-weight:600;color:var(--text3)">${goalLbl}</label>
      <input type="text" id="student-goal-inp" value="${saved.replace(/"/g,'&quot;')}" placeholder="${phLbl}" style="margin-top:4px">
    </div>
    <button class="btn btn-primary sett-save-btn" onclick="saveStudentGoal()" style="margin-top:12px">${saveLbl}</button>`;
}

function getStudentGoals(){
  const list=_uiSettings.studentGoals;
  if(Array.isArray(list))return list;
  // migrate old single goal
  const old=_uiSettings.studentGoal||'';
  return old?[{id:Date.now(),text:old,done:false}]:[];
}
function saveStudentGoals(goals){
  _uiSettings.studentGoals=goals;
  _uiSettings.studentGoal=(goals.find(g=>!g.done)||goals[0]||{text:''}).text;
  saveUI();
}
function addStudentGoal(){
  const inp=document.getElementById('new-goal-inp');
  if(!inp)return;
  const text=inp.value.trim();
  if(!text){toast('⚠️ Maqsad matni bo\'sh bo\'lmasin!');return;}
  const deadlineInp=document.getElementById('new-goal-deadline');
  const deadline=deadlineInp&&deadlineInp.value?deadlineInp.value:null;
  const goals=getStudentGoals();
  goals.push({id:Date.now(),text,done:false,deadline});
  saveStudentGoals(goals);
  inp.value='';
  if(deadlineInp)deadlineInp.value='';
  renderStudentGoalsPage();
  toast('🎯 Maqsad qo\'shildi!');
}
function toggleStudentGoal(id){
  const goals=getStudentGoals();
  const g=goals.find(x=>x.id===id);
  if(g){g.done=!g.done;if(g.done)g.doneAt=new Date().toISOString();}
  saveStudentGoals(goals);
  renderStudentGoalsPage();
  if(g&&g.done)toast('🏆 Maqsadga yetdingiz!');
}
function deleteStudentGoal(id){
  let goals=getStudentGoals();
  goals=goals.filter(x=>x.id!==id);
  saveStudentGoals(goals);
  renderStudentGoalsPage();
  toast('🗑 Maqsad o\'chirildi');
}
// keep old saveStudentGoal for settings card compat
function saveStudentGoal(){
  const inp=document.getElementById('student-goal-inp');
  if(!inp)return;
  const text=inp.value.trim();
  if(!text)return;
  const goals=getStudentGoals();
  goals.push({id:Date.now(),text,done:false});
  saveStudentGoals(goals);
  toast('🎯 Maqsad saqlandi!');
}

// 3.3: Muddat (deadline) uchun holat yorlig'ini hisoblaydi — muddati o'tgan/yaqin/normal
function _goalDeadlineLabel(deadline, done){
  if(!deadline) return '';
  const today=new Date();today.setHours(0,0,0,0);
  const dl=new Date(deadline);dl.setHours(0,0,0,0);
  const diffDays=Math.round((dl-today)/86400000);
  const dateStr=fmtDate(deadline);
  if(done) return `<span style="color:var(--text3)">📅 ${dateStr}</span>`;
  if(diffDays<0) return `<span style="color:var(--orange-text);font-weight:700">⏰ ${t('goal_overdue')} (${dateStr})</span>`;
  if(diffDays===0) return `<span style="color:var(--amber-text);font-weight:700">⏰ ${t('goal_due_today')}</span>`;
  if(diffDays<=3) return `<span style="color:var(--amber-text);font-weight:700">⏰ ${t('goal_days_left').replace('{n}',diffDays)}</span>`;
  return `<span style="color:var(--text3)">📅 ${dateStr}</span>`;
}
function renderStudentGoalsPage(){
  const body=document.getElementById('student-goals-panel-body');
  if(!body)return;
  const goals=getStudentGoals();
  const doneGoals=goals.filter(g=>g.done).length;
  const progPct=goals.length?Math.round(doneGoals/goals.length*100):0;

  // Labels
  const L=LANG;
  const lbl={
    title:     L==='ru'?'Мои цели':L==='en'?'My Goals':'Mening maqsadlarim',
    addPh:     L==='ru'?'Yangi maqsad yozing...':L==='en'?'Write a new goal...':'Yangi maqsad yozing...',
    addBtn:    L==='ru'?'Qo\'shish':L==='en'?'Add':'Qo\'shish',
    emptyT:    L==='ru'?'Hali maqsad yo\'q':L==='en'?'No goals yet':'Hali maqsad yo\'q',
    emptySub:  L==='ru'?'Birinchi maqsadingizni qo\'shing':L==='en'?'Add your first goal':'Birinchi maqsadingizni qo\'shing',
    done:      L==='ru'?'Bajarildi':L==='en'?'Done':'Bajarildi',
    active:    L==='ru'?'Jarayonda':L==='en'?'In progress':'Jarayonda',
    del:       L==='ru'?'O\'chirish':L==='en'?'Delete':'O\'chirish',
    achTitle:  L==='ru'?'Yutuqlar':L==='en'?'Achievements':'Yutuqlar',
    achSub:    L==='ru'?'earned':L==='en'?'earned':'qo\'lga kiritildi',
    quote:     (()=>{const q={uz:['Har bir dars seni maqsadingga yaqinlashtiradi.','Bugungi mehnat, ertangi muvaffaqiyat.','Bilim — eng qimmatli boylik.'],ru:['Каждый урок — шаг к цели.','Сегодняшний труд — завтрашний успех.','Знание — самое ценное.'],en:['Every lesson is a step forward.','Today\'s effort is tomorrow\'s success.','Knowledge is priceless.']};const a=q[L]||q.uz;return a[Math.floor(Date.now()/86400000)%a.length];})(),
  };

  // Achievements data
  const cu=getCurrentUser();
  const studentId=cu.studentId?parseInt(cu.studentId):null;
  const s=studentId?D.students.find(x=>x.id===studentId):null;
  const grp=s?D.groups.find(g=>g.id===s.groupId):null;
  const allInGrp=grp?D.students.filter(st=>st.groupId===grp.id):[];
  const attData=D.attendance||{};
  function getAtt(sid){const sk='s'+sid;let pr=0,tot=0;Object.keys(attData).forEach(k=>{const d=attData[k];if(d&&d[sk])Object.values(d[sk]).forEach(v=>{if(v==='K'||v==='Y'||v==='S'){tot++;if(v==='K')pr++;}});});return tot?Math.round(pr/tot*100):0;}
  const attPct=s?getAtt(s.id):0;
  const ratings=allInGrp.map(st=>({id:st.id,p:getAtt(st.id)})).sort((a,b)=>b.p-a.p);
  const rank=ratings.findIndex(r=>r.id===(s?s.id:0))+1;
  const saved=goals.length>0;
  const howUz=['Darslarga muntazam keling, davomat 80%+ bo\'lsin.','Oyda 90%+ darslarga keling, sababsiz o\'tkazmang.','Guruhda davomat bo\'yicha 1-o\'ringa chiqing.','100% davomat — birorta ham o\'tkazmaslik!','Maqsadlar bo\'limiga birinchi maqsad qo\'shing.','Kamida 1 maqsadni bajarildi deb belgilang.'];
  const howRu=['Ходи регулярно, рейтинг 80%+.','Посещай 90%+ уроков в месяц.','Стань 1-м в группе по посещаемости.','100% посещаемость — ни одного пропуска!','Добавь первую цель в разделе Цели.','Отметь хотя бы 1 цель выполненной.'];
  const howEn=['Come regularly, rating 80%+.','Attend 90%+ lessons per month.','Be #1 in group by attendance.','100% attendance — zero skips!','Add your first goal here.','Mark at least 1 goal as done.'];
  const howArr=L==='ru'?howRu:L==='en'?howEn:howUz;
  const achList=[
    {icon:'🎓',name:L==='ru'?'A\'lochi':L==='en'?'Top Student':'A\'lochi',earned:attPct>=80},
    {icon:'⚡',name:L==='ru'?'Faol':L==='en'?'Active':'Faol o\'quvchi',earned:attPct>=90},
    {icon:'👑',name:L==='ru'?'Lider':L==='en'?'Leader':'Guruh lideri',earned:rank===1&&allInGrp.length>1},
    {icon:'💎',name:L==='ru'?'Ideal':L==='en'?'Perfect':'Mukammal',earned:attPct===100},
    {icon:'🎯',name:L==='ru'?'Maqsadli':L==='en'?'Goal Setter':'Maqsadli',earned:saved},
    {icon:'🏅',name:L==='ru'?'Yetuvchi':L==='en'?'Achiever':'Yetuvchi',earned:doneGoals>=1},
  ];
  const earnedCount=achList.filter(a=>a.earned).length;

  // Goals HTML
  const goalsHtml=goals.length?goals.map((g,gi)=>`
    <div style="position:relative;display:flex;align-items:center;gap:0;margin-bottom:10px">
      <div style="position:absolute;left:22px;top:0;bottom:0;width:2px;background:${g.done?'var(--teal)':'var(--accent)'};opacity:.25;z-index:0"></div>
      <div style="position:relative;z-index:1;width:46px;flex-shrink:0;display:flex;justify-content:center">
        <button onclick="toggleStudentGoal(${g.id})" style="width:36px;height:36px;border-radius:50%;border:3px solid ${g.done?'var(--teal)':'var(--accent)'};background:${g.done?'var(--teal)':'transparent'};cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:15px;color:${g.done?'#fff':'var(--accent)'};transition:.2s;flex-shrink:0">${g.done?'✓':'○'}</button>
      </div>
      <div style="flex:1;background:${g.done?'var(--bg3)':'var(--bg)'};border:1.5px solid ${g.done?'var(--border)':'var(--accent)'};border-radius:12px;padding:11px 14px;margin-left:6px;box-shadow:${g.done?'none':'0 2px 8px rgba(59,130,246,.1)'}">
        <div style="font-size:13px;font-weight:${g.done?500:700};color:${g.done?'var(--text3)':'var(--text)'};text-decoration:${g.done?'line-through':'none'}">${g.text}</div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:3px">
          <span style="font-size:11px;color:${g.done?'var(--teal-text)':'var(--accent-text)'};">${g.done?'🏆 '+lbl.done:'🔥 '+lbl.active}</span>
          ${g.deadline?`<span style="font-size:11px">${_goalDeadlineLabel(g.deadline,g.done)}</span>`:''}
        </div>
      </div>
      <button onclick="deleteStudentGoal(${g.id})" style="margin-left:8px;background:none;border:none;cursor:pointer;color:var(--text3);font-size:16px;padding:6px;border-radius:8px;flex-shrink:0" onmouseover="this.style.color='var(--orange-text)'" onmouseout="this.style.color='var(--text3)'" title="${lbl.del}">🗑</button>
    </div>`).join(''):`
    <div style="text-align:center;padding:48px 20px;display:flex;flex-direction:column;align-items:center;gap:10px">
      <div style="font-size:48px;opacity:.3">🎯</div>
      <div style="font-size:14px;font-weight:800;color:var(--text)">${lbl.emptyT}</div>
      <div style="font-size:12px;color:var(--text3)">${lbl.emptySub}</div>
    </div>`;

  // Achievements HTML — hexagonal badge grid
  const achHtml=achList.map((a,ai)=>`
    <div style="display:flex;flex-direction:column;align-items:center;gap:6px;min-width:80px" title="${howArr[ai]}">
      <div style="position:relative;width:60px;height:60px">
        <svg width="60" height="60" viewBox="0 0 60 60" style="position:absolute;top:0;left:0">
          <polygon points="30,3 55,16 55,44 30,57 5,44 5,16" fill="${a.earned?'var(--teal)':'var(--bg4)'}" stroke="${a.earned?'var(--teal-text)':'var(--border2)'}" stroke-width="2" opacity="${a.earned?1:.6}"/>
        </svg>
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:22px;opacity:${a.earned?1:.35}">${a.icon}</div>
        ${a.earned?'<div style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;background:#22c55e;border-radius:50%;border:2px solid var(--bg);display:flex;align-items:center;justify-content:center;font-size:9px">✓</div>':''}
      </div>
      <div style="font-size:10px;font-weight:700;color:${a.earned?'var(--teal-text)':'var(--text3)'};text-align:center;line-height:1.2">${a.name}</div>
    </div>`).join('');

  body.innerHTML=`
  <div style="max-width:720px;margin:0 auto;padding:4px 0 32px">

    <!-- TOP HERO BANNER -->
    <div style="background:linear-gradient(135deg,var(--accent) 0%,var(--teal) 100%);border-radius:20px;padding:24px 28px;margin-bottom:20px;position:relative;overflow:hidden;color:#fff">
      <div style="position:absolute;right:-20px;top:-20px;font-size:130px;opacity:.06;pointer-events:none">🎯</div>
      <div style="position:absolute;left:-10px;bottom:-20px;font-size:100px;opacity:.05;pointer-events:none">⭐</div>
      <div style="font-size:11px;font-weight:700;opacity:.75;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">${lbl.title}</div>
      <div style="font-size:28px;font-weight:900;letter-spacing:-.5px;margin-bottom:12px">${goals.length?progPct+'% bajarildi':'Hali maqsad yo\'q'}</div>
      ${goals.length?`
      <div style="background:rgba(255,255,255,.2);border-radius:99px;height:8px;overflow:hidden;margin-bottom:8px">
        <div style="background:#fff;height:100%;border-radius:99px;width:${progPct}%;transition:width .6s ease"></div>
      </div>
      <div style="font-size:12px;opacity:.85">${doneGoals} / ${goals.length} ta maqsad · ${t('goal_remaining_pct').replace('{n}',100-progPct)} · ${earnedCount}/6 yutuq</div>
      `:`<div style="font-size:13px;opacity:.75">Pastdagi maydonga birinchi maqsadingizni yozing</div>`}
    </div>

    <!-- ADD GOAL -->
    <div class="goal-add-row" style="background:var(--bg);border:2px dashed var(--accent);border-radius:16px;padding:16px 18px;margin-bottom:20px">
      <span style="font-size:22px;flex-shrink:0">✏️</span>
      <input type="text" id="new-goal-inp" placeholder="${lbl.addPh}" onkeydown="if(event.key==='Enter')addStudentGoal()" style="background:transparent;border:none;outline:none;font-size:14px;font-weight:600;color:var(--text)">
      <input type="date" id="new-goal-deadline" title="${t('goal_deadline_label')}" style="background:var(--bg2);border:1.5px solid var(--border2);border-radius:10px;padding:7px 10px;font-size:12.5px;color:var(--text)">
      <button onclick="addStudentGoal()" style="background:var(--accent);color:#fff;border:none;border-radius:10px;padding:8px 18px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap">+ ${lbl.addBtn}</button>
    </div>

    <!-- GOALS LIST -->
    <div style="margin-bottom:24px">
      ${goalsHtml}
    </div>

    <!-- QUOTE STRIPE -->
    <div style="background:var(--bg2);border-left:4px solid var(--accent);border-radius:0 12px 12px 0;padding:14px 18px;margin-bottom:24px;font-size:13px;font-style:italic;color:var(--text2);line-height:1.7">
      ✨ "${lbl.quote}"
    </div>

    <!-- ACHIEVEMENTS -->
    <div style="background:var(--bg);border:1.5px solid var(--border2);border-radius:18px;padding:20px 22px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
        <div>
          <div style="font-size:14px;font-weight:800;color:var(--text)">🏆 ${lbl.achTitle}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">${earnedCount}/6 ${lbl.achSub}</div>
        </div>
        <div style="background:var(--accent-light);color:var(--accent-text);border:1.5px solid var(--accent);border-radius:99px;padding:4px 14px;font-size:13px;font-weight:800">${earnedCount}/6</div>
      </div>
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px">
        ${achHtml}
      </div>
    </div>

  </div>`;
}

function previewCrmName(){const val=document.getElementById('sett-crm-name').value||'EduManage';const prev=document.getElementById('sett-name-preview');if(prev)prev.textContent=val;}
function saveCrmName(){
  const val=(document.getElementById('sett-crm-name').value||'').trim()||'EduManage';
  _brandSettings.crmName=val;saveBranding();applyUISettings();
  toast('✅ CRM nomi saqlandi: '+val);
}
function handleLogoUpload(input){
  const file=input.files[0];if(!file)return;
  if(!file.type.startsWith('image/')){toast('⚠️ Faqat rasm fayli!');return;}
  if(file.size>2*1024*1024){toast('⚠️ Rasm 2MB dan kichik bo\'lsin!');return;}
  const reader=new FileReader();
  reader.onload=e=>{_brandSettings.crmLogo=e.target.result;saveBranding();applyLogo();renderSettingsPanel();toast('✅ Logotip saqlandi!');};
  reader.readAsDataURL(file);
}
function removeLogo(){_brandSettings.crmLogo=null;saveBranding();applyLogo();renderSettingsPanel();toast('🗑 Logotip o\'chirildi');}
function setTheme(th){_uiSettings.theme=th;saveUI();applyUISettings();renderSettingsPanel();}

// FIX #6: Font size change must instantly affect everything
function setFontSize(s){
  _uiSettings.fontSize=s;
  saveUI();
  applyUISettings();
  renderSettingsPanel();
  // Re-render current panel so font size is applied to dynamic content too
  if(currentTab) updateTopbar(currentTab);
  toast('🔤 Shrift o\'zgartirildi');
}
function setAccent(color,el){_uiSettings.accent=color;saveUI();applyUISettings();renderSettingsPanel();toast('🌈 Rang o\'zgartirildi!');}

