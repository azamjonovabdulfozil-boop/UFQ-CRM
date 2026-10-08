/* ============================================================
   EduManage AI Yordamchi — mentor va talaba uchun
   Tez ishlaydi: Gemini Flash → Anthropic Haiku → Pollinations
   ============================================================ */
(function () {
  const L = () => (typeof LANG !== 'undefined' ? LANG : 'uz');

  const T = {
    uz: {
      title_mentor: '🤖 AI Yordamchi (Mentor)',
      title_student: '🤖 AI Yordamchi (Talaba)',
      title_students_ai: '👁 Talabalar AI Suhbatlari',
      placeholder: 'Savol yozing...',
      send: 'Yuborish',
      thinking: '⏳ Javob yozilmoqda...',
      clear: '🗑 Tozalash',
      no_history: "Talaba hali AI bilan suhbat qilmagan",
      welcome_mentor: `Salom! Men mentor uchun AI yordamchiman.\n\n• 📊 Talabalar progressini tahlil\n• 📝 Dars rejasi va metodika\n• 💡 O'qitish strategiyalari\n• 🎯 Guruh boshqaruvi\n\nNima yordam kerak?`,
      welcome_student: `Salom! Men talaba uchun AI yordamchiman.\n\n• 📚 Dars mavzularini tushuntirish\n• 💡 Masalalar yechishda ko'mak\n• 🎯 O'quv maqsadlarini rejalashtirish\n• 📖 Qiyin tushunchalarni soddalashtirish\n\nNima so'rashni xohlaysiz?`,
    },
    ru: {
      title_mentor: '🤖 AI Ассистент (Ментор)',
      title_student: '🤖 AI Ассистент (Студент)',
      title_students_ai: '👁 AI Разговоры студентов',
      placeholder: 'Введите вопрос...',
      send: 'Отправить',
      thinking: '⏳ Генерируется ответ...',
      clear: '🗑 Очистить',
      no_history: 'Студент ещё не общался с AI',
      welcome_mentor: `Привет! Я AI-ассистент для менторов.\n\n• 📊 Анализ прогресса студентов\n• 📝 Планирование уроков\n• 💡 Стратегии обучения\n• 🎯 Управление группой\n\nЧем могу помочь?`,
      welcome_student: `Привет! Я AI-ассистент для студентов.\n\n• 📚 Объяснение тем\n• 💡 Решение задач\n• 🎯 Планирование учёбы\n• 📖 Упрощение сложных понятий\n\nЧто хотите спросить?`,
    },
    en: {
      title_mentor: '🤖 AI Assistant (Mentor)',
      title_student: '🤖 AI Assistant (Student)',
      title_students_ai: '👁 Students AI Chats',
      placeholder: 'Type your question...',
      send: 'Send',
      thinking: '⏳ Generating answer...',
      clear: '🗑 Clear',
      no_history: 'Student has not chatted with AI yet',
      welcome_mentor: `Hello! I'm the AI assistant for mentors.\n\n• 📊 Analyzing student progress\n• 📝 Lesson planning & methodology\n• 💡 Teaching strategies\n• 🎯 Group management tips\n\nWhat do you need help with?`,
      welcome_student: `Hello! I'm the AI assistant for students.\n\n• 📚 Explaining lesson topics\n• 💡 Solving problems\n• 🎯 Planning your studies\n• 📖 Simplifying difficult concepts\n\nWhat would you like to ask?`,
    },
  };

  function t(key) {
    const lang = L();
    return (T[lang] || T.uz)[key] || T.uz[key];
  }

  // ── History storage — per-student keys ───────────────────
  const STORAGE_KEY_MENTOR = 'ai_history_mentor';

  function _aiStudentKey(studentId) {
    return 'ai_history_student_' + (studentId || 'me');
  }

  function loadHistory(role, studentId) {
    try {
      const key = role === 'mentor' ? STORAGE_KEY_MENTOR : _aiStudentKey(studentId);
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch { return []; }
  }
  function saveHistory(role, history, studentId) {
    try {
      const key = role === 'mentor' ? STORAGE_KEY_MENTOR : _aiStudentKey(studentId);
      localStorage.setItem(key, JSON.stringify(history.slice(-40)));
    } catch {}
  }

  // ── System prompts ────────────────────────────────────────
  function getSystemPrompt(role) {
    const lang = L();
    if (role === 'mentor') {
      if (lang === 'ru') return 'Ты AI-ассистент для ментора образовательного центра. Помогай с планированием уроков, анализом студентов, стратегиями обучения. Отвечай кратко и по делу. Используй эмодзи для структуры.';
      if (lang === 'en') return 'You are an AI assistant for an education center mentor. Help with lesson planning, student analysis, and teaching strategies. Be concise and use emojis for structure.';
      return "Siz ta'lim markazi mentori uchun AI yordamchisiz. Dars rejalashtirish, talabalar tahlili, o'qitish strategiyalarida yordam bering. Qisqa va aniq javob bering. Emojilardan foydalaning.";
    } else {
      if (lang === 'ru') return "Ты AI-помощник для студента образовательного центра. Объясняй темы, помогай с задачами, мотивируй учиться. Отвечай кратко, понятно, с примерами. Используй эмодзи.";
      if (lang === 'en') return 'You are an AI assistant for a student at an education center. Explain topics, help with problems, and motivate learning. Be concise, clear, and use examples. Use emojis.';
      return "Siz ta'lim markazi talabasi uchun AI yordamchisiz. Mavzularni tushuntiring, masalalar yechishda yordam bering, o'qishga undang. Qisqa, tushunarli va misollar bilan javob bering. Emojilardan foydalaning.";
    }
  }

  // ── API call ──────────────────────────────────────────────
  async function askClaude(role, messages) {
    const API_BASE = (typeof __API_BASE__ !== 'undefined' && __API_BASE__) ? __API_BASE__ : (window.__API_BASE__ || '');
    const res = await fetch(API_BASE + '/api/ai-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: getSystemPrompt(role),
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || 'Server xato: ' + res.status);
    return data.text || '...';
  }

  // ── Markdown renderer ─────────────────────────────────────
  function md(text) {
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code style="background:var(--bg4);padding:1px 5px;border-radius:4px;font-size:.9em">$1</code>')
      .replace(/\n/g, '<br>');
  }

  // ── Render AI panel ───────────────────────────────────────
  function renderAIPanel(wrapId, role, studentId) {
    const wrap = document.getElementById(wrapId);
    if (!wrap) return;

    let history = loadHistory(role, studentId);

    wrap.innerHTML = `
      <div class="ai-panel-container">
        <div class="ai-panel-header">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--teal));display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">🤖</div>
            <div>
              <div style="font-size:15px;font-weight:800;color:var(--text)">${t(role === 'mentor' ? 'title_mentor' : 'title_student')}</div>
              <div style="font-size:11px;color:var(--text3)">AI · ${L() === 'ru' ? 'Онлайн' : L() === 'en' ? 'Online' : 'Onlayn'}</div>
            </div>
          </div>
          <button onclick="window.clearAIHistory('${role}',${studentId||'null'})" style="font-size:11px;padding:5px 10px;border-radius:7px;border:1.5px solid var(--border2);background:var(--bg3);color:var(--text3);cursor:pointer;font-weight:600">${t('clear')}</button>
        </div>
        <div class="ai-messages" id="ai-msgs-${role}"></div>
        <div class="ai-input-row">
          <textarea id="ai-input-${role}" class="ai-textarea" placeholder="${t('placeholder')}" rows="1"
            onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();window.sendAIMsg('${role}',${studentId||'null'})}"
            oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,120)+'px'"></textarea>
          <button class="ai-send-btn" id="ai-send-${role}" onclick="window.sendAIMsg('${role}',${studentId||'null'})">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </button>
        </div>
      </div>
    `;

    renderMessages(role, history);
  }

  function renderMessages(role, history) {
    const box = document.getElementById('ai-msgs-' + role);
    if (!box) return;
    const welcomeText = t(role === 'mentor' ? 'welcome_mentor' : 'welcome_student');

    let html = `<div class="ai-bubble ai-bubble-bot">
      <div class="ai-avatar">🤖</div>
      <div class="ai-bubble-text">${md(welcomeText)}</div>
    </div>`;

    history.forEach(m => {
      if (m.role === 'user') {
        html += `<div class="ai-bubble ai-bubble-user"><div class="ai-bubble-text">${md(m.content)}</div></div>`;
      } else {
        html += `<div class="ai-bubble ai-bubble-bot"><div class="ai-avatar">🤖</div><div class="ai-bubble-text">${md(m.content)}</div></div>`;
      }
    });

    box.innerHTML = html;
    box.scrollTop = box.scrollHeight;
  }

  // ── Send message ──────────────────────────────────────────
  window.sendAIMsg = async function (role, studentId) {
    const inp = document.getElementById('ai-input-' + role);
    const btn = document.getElementById('ai-send-' + role);
    const box = document.getElementById('ai-msgs-' + role);
    if (!inp || !box) return;

    const text = inp.value.trim();
    if (!text) return;

    inp.value = '';
    inp.style.height = 'auto';
    if (btn) { btn.disabled = true; btn.style.opacity = '.4'; }

    const userBubble = document.createElement('div');
    userBubble.className = 'ai-bubble ai-bubble-user';
    userBubble.innerHTML = `<div class="ai-bubble-text">${md(text)}</div>`;
    box.appendChild(userBubble);
    box.scrollTop = box.scrollHeight;

    const typing = document.createElement('div');
    typing.className = 'ai-bubble ai-bubble-bot ai-typing';
    typing.innerHTML = `<div class="ai-avatar">🤖</div><div class="ai-bubble-text"><span class="ai-dots"><span></span><span></span><span></span></span></div>`;
    box.appendChild(typing);
    box.scrollTop = box.scrollHeight;

    let history = loadHistory(role, studentId);
    history.push({ role: 'user', content: text });

    try {
      const reply = await askClaude(role, history);
      history.push({ role: 'assistant', content: reply });
      saveHistory(role, history, studentId);

      typing.remove();
      const botBubble = document.createElement('div');
      botBubble.className = 'ai-bubble ai-bubble-bot';
      botBubble.innerHTML = `<div class="ai-avatar">🤖</div><div class="ai-bubble-text">${md(reply)}</div>`;
      box.appendChild(botBubble);
    } catch (e) {
      typing.remove();
      const errBubble = document.createElement('div');
      errBubble.className = 'ai-bubble ai-bubble-bot';
      errBubble.innerHTML = `<div class="ai-avatar">🤖</div><div class="ai-bubble-text" style="color:var(--orange-text)">⚠️ Xato: ${e.message}</div>`;
      box.appendChild(errBubble);
    } finally {
      box.scrollTop = box.scrollHeight;
      if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
      inp.focus();
    }
  };

  window.clearAIHistory = function (role, studentId) {
    saveHistory(role, [], studentId);
    const wrapId = role === 'mentor' ? 'mentor-ai-wrap' : 'student-ai-wrap';
    renderAIPanel(wrapId, role, studentId);
  };

  // ── Mentor: talabalar AI suhbatlarini ko'rish ─────────────
  window.renderMentorStudentsAI = function () {
    const wrap = document.getElementById('mentor-students-ai-wrap');
    if (!wrap) return;
    const cu = typeof getCurrentUser === 'function' ? getCurrentUser() : {};
    const mentorName = cu.mentorName || cu.name || '';
    if (!mentorName || typeof D === 'undefined') {
      wrap.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text3)">${t('no_history')}</div>`;
      return;
    }
    const myGroups = D.groups.filter(g => g.mentor === mentorName);
    const myStudents = D.students.filter(s => myGroups.some(g => g.id === s.groupId) && s.status !== 'Arxiv');

    if (!myStudents.length) {
      wrap.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text3)">Talabalar yo'q</div>`;
      return;
    }

    // Default: first student
    const firstSel = wrap.dataset.selected ? parseInt(wrap.dataset.selected) : myStudents[0].id;
    const selSt = myStudents.find(s => s.id === firstSel) || myStudents[0];
    const selHistory = loadHistory('student', selSt.id);

    const listHtml = myStudents.map((s, i) => {
      const h = loadHistory('student', s.id);
      const isActive = s.id === selSt.id;
      const last = h.length ? h[h.length - 1] : null;
      return `<div onclick="window._selMentorStudAI=${s.id};window.renderMentorStudentsAI()" style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);background:${isActive ? 'var(--accent-light)' : 'transparent'};transition:background .15s">
        <div class="av ${(typeof AV_CLS !== 'undefined' ? AV_CLS : ['av-0'])[i % 5]}" style="width:34px;height:34px;font-size:11px;flex-shrink:0">${typeof ini === 'function' ? ini(s.name) : s.name.slice(0, 2)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:${isActive ? 700 : 500};color:${isActive ? 'var(--accent-text)' : 'var(--text)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.name}</div>
          <div style="font-size:11px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${h.length ? h.length + ' xabar' : "Suhbat yo'q"}</div>
        </div>
      </div>`;
    }).join('');

    const msgsHtml = selHistory.length
      ? selHistory.map(m => m.role === 'user'
        ? `<div class="ai-bubble ai-bubble-user"><div class="ai-bubble-text">${md(m.content)}</div></div>`
        : `<div class="ai-bubble ai-bubble-bot"><div class="ai-avatar">🤖</div><div class="ai-bubble-text">${md(m.content)}</div></div>`
      ).join('')
      : `<div style="text-align:center;padding:40px;color:var(--text3)"><div style="font-size:40px;margin-bottom:10px">💬</div><div style="font-size:14px">${t('no_history')}</div></div>`;

    wrap.innerHTML = `<div style="display:flex;height:calc(100dvh - 120px);min-height:300px;border:1px solid var(--border2);border-radius:var(--r-lg);overflow:hidden">
      <div style="width:240px;flex-shrink:0;border-right:1px solid var(--border2);overflow-y:auto;background:var(--bg2)">
        <div style="padding:12px 14px;border-bottom:1px solid var(--border2);font-size:13px;font-weight:800;color:var(--text)">👥 Talabalar</div>
        ${listHtml}
      </div>
      <div style="flex:1;display:flex;flex-direction:column;min-width:0;background:var(--bg)">
        <div style="padding:12px 16px;border-bottom:1px solid var(--border2);background:var(--bg2);display:flex;align-items:center;gap:10px;flex-shrink:0">
          <div style="font-size:14px;font-weight:700;color:var(--text)">${selSt.name}</div>
          <div style="font-size:11px;color:var(--text3);margin-left:auto">${selHistory.length} xabar · faqat o'qish</div>
        </div>
        <div class="ai-messages" style="flex:1;overflow-y:auto;padding:16px">${msgsHtml}</div>
      </div>
    </div>`;

    // Store selection
    if (wrap) wrap.dataset.selected = selSt.id;
    setTimeout(() => {
      const box = wrap.querySelector('.ai-messages');
      if (box) box.scrollTop = box.scrollHeight;
    }, 50);
  };

  // Track selection across re-renders
  window._selMentorStudAI = null;
  const _origRenderMentorStudentsAI = window.renderMentorStudentsAI;
  window.renderMentorStudentsAI = function () {
    const wrap = document.getElementById('mentor-students-ai-wrap');
    if (wrap && window._selMentorStudAI) wrap.dataset.selected = window._selMentorStudAI;
    _origRenderMentorStudentsAI();
  };

  // ── Public render functions ───────────────────────────────
  window.renderMentorAI = function () { renderAIPanel('mentor-ai-wrap', 'mentor', null); };
  window.renderStudentAI = function () {
    // Get current student ID
    let sid = null;
    if (typeof getCurrentStudentInfo === 'function') {
      const { s } = getCurrentStudentInfo();
      if (s) sid = s.id;
    }
    renderAIPanel('student-ai-wrap', 'student', sid);
  };

  console.log('[ai-assistant] loaded');
})();
