/**
 * Admin Chat Monitor — barcha mentor↔talaba yozishmalarini real vaqtda
 * backend KV'dan tortib ko'rsatadi. Har 3 soniyada yangilanadi.
 */
(function () {
  var POLL_MS = 3000;
  var _timer = null;
  var _selectedKey = null;
  var _api = (typeof __API_BASE__ !== 'undefined' && __API_BASE__) ? __API_BASE__ : '';
  var _allChats = []; // {key, mentor, studentId, studentName, groupName, messages, last, unreadAdmin}

  function decodeMentor(b64) {
    try { return atob(b64 + '=='.slice(0, (4 - (b64.length % 4)) % 4)); }
    catch (e) { return b64; }
  }

  function fmtTime(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    if (isNaN(d)) return '';
    var today = new Date();
    var sameDay = d.toDateString() === today.toDateString();
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    if (sameDay) return hh + ':' + mm;
    return d.toLocaleDateString('uz-UZ', { day: '2-digit', month: 'short' }) + ' ' + hh + ':' + mm;
  }

  function loadFromKV() {
    return fetch(_api + '/api/kv', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok || !j.data) return [];
        var out = [];
        var students = (typeof D !== 'undefined' && D.students) ? D.students : [];
        var groups = (typeof D !== 'undefined' && D.groups) ? D.groups : [];
        Object.keys(j.data).forEach(function (k) {
          if (!/^mchat_[A-Za-z0-9+/]+_\d+$/.test(k)) return; // skip mchat_list_
          var parts = k.replace(/^mchat_/, '').split('_');
          if (parts.length < 2) return;
          var studentId = parseInt(parts[parts.length - 1], 10);
          var mentorB64 = parts.slice(0, -1).join('_');
          var mentor = decodeMentor(mentorB64);
          var msgs;
          try { msgs = JSON.parse(j.data[k] || '[]'); } catch (e) { msgs = []; }
          if (!Array.isArray(msgs) || !msgs.length) return;
          var st = students.find(function (s) { return s.id === studentId; }) || { name: '#' + studentId };
          var grp = groups.find(function (g) { return g.id === st.groupId; });
          var last = msgs[msgs.length - 1];
          out.push({
            key: k,
            mentor: mentor,
            studentId: studentId,
            studentName: st.name,
            groupName: grp ? grp.name : '—',
            messages: msgs,
            lastText: (last && last.text) ? last.text : '',
            lastTs: (last && (last.ts || last.time)) || 0,
            count: msgs.length,
          });
        });
        // sort by latest first
        out.sort(function (a, b) { return (b.lastTs || 0) - (a.lastTs || 0); });
        return out;
      })
      .catch(function () { return []; });
  }

  function renderListSide() {
    var list = document.getElementById('adm-chats-list');
    if (!list) return;
    if (!_allChats.length) {
      list.innerHTML = '<div style="padding:40px 16px;text-align:center;color:var(--text3);font-size:13px">💬 Hozircha yozishmalar yo\'q</div>';
      return;
    }
    list.innerHTML = _allChats.map(function (c) {
      var active = c.key === _selectedKey;
      var preview = (c.lastText || '').replace(/</g, '&lt;').slice(0, 40);
      return '<div onclick="selectAdminChat(\'' + c.key + '\')" style="display:flex;gap:10px;padding:12px 14px;cursor:pointer;border-bottom:1px solid var(--border);background:' + (active ? 'var(--accent-light)' : 'transparent') + ';transition:background .15s">'
        + '<div class="av av-' + (Math.abs(c.studentId) % 5) + '" style="width:38px;height:38px;flex-shrink:0;font-size:12px">' + (typeof ini === 'function' ? ini(c.studentName) : c.studentName.slice(0, 2).toUpperCase()) + '</div>'
        + '<div style="flex:1;min-width:0">'
        + '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center">'
        + '<div style="font-size:13px;font-weight:700;color:' + (active ? 'var(--accent-text)' : 'var(--text)') + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + c.studentName + '</div>'
        + '<div style="font-size:10px;color:var(--text3);flex-shrink:0">' + fmtTime(c.lastTs) + '</div>'
        + '</div>'
        + '<div style="font-size:11px;color:var(--text3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">🎓 ' + c.mentor + ' · ' + c.groupName + '</div>'
        + '<div style="font-size:11px;color:var(--text2);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + preview + '</div>'
        + '</div>'
        + '<div style="font-size:10px;color:var(--text3);align-self:flex-start;background:var(--bg3);padding:2px 7px;border-radius:10px">' + c.count + '</div>'
        + '</div>';
    }).join('');
  }

  function renderConversation() {
    var area = document.getElementById('adm-chats-msgs');
    var header = document.getElementById('adm-chats-header');
    if (!area || !header) return;
    var chat = _allChats.find(function (c) { return c.key === _selectedKey; });
    if (!chat) {
      header.innerHTML = '<div style="color:var(--text3);font-size:13px">Yozishmani tanlang</div>';
      area.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text3)"><div style="font-size:48px;margin-bottom:10px">👀</div><div style="font-size:14px">Chap tomondan yozishmani tanlang</div></div>';
      return;
    }
    header.innerHTML = '<div style="display:flex;align-items:center;gap:12px">'
      + '<div class="av av-' + (Math.abs(chat.studentId) % 5) + '" style="width:38px;height:38px;font-size:12px">' + (typeof ini === 'function' ? ini(chat.studentName) : chat.studentName.slice(0, 2).toUpperCase()) + '</div>'
      + '<div>'
      + '<div style="font-size:14px;font-weight:800;color:var(--text)">' + chat.studentName + '</div>'
      + '<div style="font-size:11px;color:var(--text3)">🎓 Mentor: <b>' + chat.mentor + '</b> · ' + chat.groupName + ' · ' + chat.count + ' xabar</div>'
      + '</div>'
      + '<div style="margin-left:auto;font-size:10px;color:var(--teal-text);background:var(--teal-light);padding:4px 10px;border-radius:20px;font-weight:700">🟢 LIVE</div>'
      + '</div>';
    var html = chat.messages.map(function (m) {
      var fromMentor = m.from === 'mentor';
      var who = fromMentor ? ('🎓 ' + chat.mentor) : ('👤 ' + chat.studentName);
      var time = fmtTime(m.ts || m.time);
      var txt = (m.text || '').replace(/</g, '&lt;');
      return '<div style="display:flex;justify-content:' + (fromMentor ? 'flex-end' : 'flex-start') + ';margin-bottom:10px">'
        + '<div style="max-width:72%;background:' + (fromMentor ? 'var(--accent)' : 'var(--bg3)') + ';color:' + (fromMentor ? '#fff' : 'var(--text)') + ';padding:10px 14px;border-radius:' + (fromMentor ? '14px 14px 4px 14px' : '14px 14px 14px 4px') + ';font-size:13px;line-height:1.5;box-shadow:var(--shadow-sm)">'
        + '<div style="font-size:10px;opacity:.75;margin-bottom:4px;font-weight:700">' + who + ' · ' + time + '</div>'
        + '<span data-emoji-ok>' + txt + '</span>'
        + '</div>'
        + '</div>';
    }).join('');
    area.innerHTML = html;
    setTimeout(function () { area.scrollTop = area.scrollHeight; }, 50);
  }

  function refresh() {
    loadFromKV().then(function (list) {
      _allChats = list;
      // total badge
      var nc = document.getElementById('nc-admin-chats');
      if (nc) {
        if (list.length) { nc.style.display = ''; nc.textContent = String(list.length); }
        else nc.style.display = 'none';
      }
      renderListSide();
      renderConversation();
    });
  }

  window.selectAdminChat = function (key) {
    _selectedKey = key;
    renderListSide();
    renderConversation();
  };

  window.renderAdminChatMonitor = function () {
    var wrap = document.getElementById('admin-chats-wrap');
    if (!wrap) return;
    wrap.innerHTML = ''
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px">'
      + '<div>'
      + '<h2 style="margin:0;font-size:22px;font-weight:800;color:var(--text)">💬 Foydalanuvchilar yozishmalari</h2>'
      + '<div style="font-size:12px;color:var(--text3);margin-top:4px">Mentor va talabalar o\'rtasidagi barcha chatlar — real vaqtda yangilanadi</div>'
      + '</div>'
      + '<button class="btn btn-ghost" onclick="refreshAdminChatMonitor()" style="font-size:12px">🔄 Yangilash</button>'
      + '</div>'
      + '<div id="adm-chats-grid" style="display:grid;grid-template-columns:340px 1fr;gap:0;border:1px solid var(--border2);border-radius:var(--r-lg);overflow:hidden;background:var(--bg);height:calc(100vh - 180px);min-height:480px">'
      + '<div style="border-right:1px solid var(--border2);overflow-y:auto;background:var(--bg2)">'
      + '<div style="padding:14px;border-bottom:1px solid var(--border2);font-size:13px;font-weight:800;color:var(--text);background:var(--bg2);position:sticky;top:0;z-index:1">📋 Yozishmalar</div>'
      + '<div id="adm-chats-list"></div>'
      + '</div>'
      + '<div style="display:flex;flex-direction:column;min-width:0">'
      + '<div id="adm-chats-header" style="padding:14px 18px;border-bottom:1px solid var(--border2);background:var(--bg2);flex-shrink:0"></div>'
      + '<div id="adm-chats-msgs" style="flex:1;overflow-y:auto;padding:18px;background:var(--bg)"></div>'
      + '</div>'
      + '</div>';

    refresh();
    if (_timer) clearInterval(_timer);
    _timer = setInterval(refresh, POLL_MS);
  };

  window.refreshAdminChatMonitor = refresh;

  window.stopAdminChatMonitor = function () {
    if (_timer) { clearInterval(_timer); _timer = null; }
  };

  // Inject responsive CSS once
  if (!document.getElementById('adm-chats-style')) {
    var st = document.createElement('style');
    st.id = 'adm-chats-style';
    st.textContent = '@media(max-width:820px){#adm-chats-grid{grid-template-columns:1fr !important;height:auto !important}#adm-chats-grid > div:first-child{max-height:40vh}}';
    document.head.appendChild(st);
  }

  console.log('[chat-monitor] loaded');
})();
