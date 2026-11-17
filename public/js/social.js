let activeChatPartnerId = 0;
let lastChatMessageId = 0;

// 1. HỘP THƯ & KHUNG CHAT KHÔNG TẢI LẠI TRANG
async function renderMessagesPage() {
  activeChatPartnerId = 0;
  const view = document.getElementById('main-view');
  if (!currentUser) {
    view.innerHTML = `<div class="box-content">Vui lòng <a href="javascript:void(0)" onclick="openAuthModal('login')">Đăng nhập</a> để xem tin nhắn.</div>`;
    return;
  }

  const data = await apiFetch('/api/conversations');
  const convHtml = (data.conversations || []).map((c) => `
    <div class="list-row" style="cursor:pointer;" onclick="openChatWith(${c.id}, '${c.display_name}')">
      <div>
        ${c.avatar} <b>${c.display_name}</b> ${renderRoleBadge(c.role, c.level)}
        ${c.unread > 0 ? `<span class="badge">${c.unread} mới</span>` : ''}
      </div>
      <div class="muted">${c.last_msg || '...'}</div>
    </div>
  `).join('') || '<div class="muted">Chưa có cuộc trò chuyện nào. Hãy nhập ID người nhận bên dưới để nhắn tin!</div>';

  view.innerHTML = `
    <div class="box-header"><span>✉️ TIN NHẮN RIÊNG TƯ (REAL-TIME)</span></div>
    <div class="box-content">
      <div class="chat-input-row" style="margin-bottom:10px;">
        <input type="number" id="quick-chat-id" placeholder="Nhập ID người muốn nhắn tin..." />
        <button class="btn-primary" onclick="startChatById()">Chat ngay</button>
      </div>
      ${convHtml}
    </div>
  `;
}

function startChatById() {
  const id = parseInt(document.getElementById('quick-chat-id').value, 10);
  if (id > 0) openChatWith(id, `Thành viên #${id}`);
}

async function openChatWith(partnerId, partnerName) {
  if (!currentUser) return openAuthModal('login');
  activeChatPartnerId = partnerId;
  lastChatMessageId = 0;

  const view = document.getElementById('main-view');
  view.innerHTML = `
    <div class="box-header">
      <span>💬 Chat với: ${partnerName} (ID: ${partnerId})</span>
      <button class="btn-xs" onclick="renderMessagesPage()">Danh sách</button>
    </div>
    <div class="box-content">
      <div id="chat-history" class="chat-history"></div>
      <form onsubmit="sendDirectMessage(event)" class="chat-input-row">
        <input type="text" id="chat-msg-input" required placeholder="Nhập tin nhắn..." autocomplete="off" />
        <button type="submit" class="btn-primary">Gửi</button>
      </form>
    </div>
  `;
  await pollRealtimeNow();
}

function appendChatMessages(messages) {
  const box = document.getElementById('chat-history');
  if (!box || !messages.length) return;

  messages.forEach((m) => {
    if (m.id > lastChatMessageId) {
      lastChatMessageId = m.id;
      const isMine = currentUser && m.sender_id === currentUser.id;
      const div = document.createElement('div');
      div.className = `chat-bubble ${isMine ? 'mine' : ''}`;
      div.innerHTML = `
        <div class="muted" style="font-size:10.5px;">${m.display_name} • ${m.created_at}</div>
        <div>${m.content}</div>
      `;
      box.appendChild(div);
    }
  });
  box.scrollTop = box.scrollHeight;
}

async function sendDirectMessage(e) {
  e.preventDefault();
  const input = document.getElementById('chat-msg-input');
  const content = input.value.trim();
  if (!content || !activeChatPartnerId) return;

  input.value = '';
  const res = await apiFetch('/api/messages', {
    method: 'POST',
    body: JSON.stringify({ receiver_id: activeChatPartnerId, content })
  });
  if (res.error) return alert(res.error);
  await pollRealtimeNow();
}

// 2. THÔNG BÁO CÁ NHÂN
async function renderNotificationsPage() {
  const view = document.getElementById('main-view');
  if (!currentUser) {
    view.innerHTML = `<div class="box-content">Vui lòng đăng nhập để xem thông báo cá nhân.</div>`;
    return;
  }
  const data = await apiFetch('/api/notifications');
  document.getElementById('badge-notif').classList.add('hidden');

  const html = (data.notifications || []).map((n) => `
    <div class="list-row">
      <div>🔔 ${n.content}</div>
      <div class="muted">${n.created_at}</div>
    </div>
  `).join('') || '<div class="muted">Bạn chưa có thông báo cá nhân nào.</div>';

  view.innerHTML = `<div class="box-header"><span>🔔 THÔNG BÁO CỦA BẠN</span></div><div class="box-content">${html}</div>`;
}

// 3. TRỰC TUYẾN / TÌM KIẾM NICK & ID / BẢNG XẾP HẠNG
async function renderUserDirectory(mode) {
  const view = document.getElementById('main-view');
  const titles = {
    online: '🟢 THÀNH VIÊN ĐANG TRỰC TUYẾN',
    ranking: '🏆 BẢNG XẾP HẠNG CAO THỦ & ĐẠI GIA',
    search: '🔍 TÌM KIẾM THÀNH VIÊN THEO TÊN HOẶC ID'
  };

  let searchBar = '';
  if (mode === 'search') {
    searchBar = `
      <div class="chat-input-row" style="margin-bottom:10px;">
        <input type="text" id="user-search-q" placeholder="Nhập ID (số) hoặc tên nick..." />
        <button class="btn-primary" onclick="executeUserSearch()">Tìm</button>
      </div>
    `;
  }

  view.innerHTML = `<div class="box-header"><span>${titles[mode]}</span></div><div class="box-content">${searchBar}<div id="user-dir-list">Đang tải...</div></div>`;
  if (mode !== 'search') {
    const data = await apiFetch(`/api/users?mode=${mode}`);
    renderUserRows(data.users || []);
  } else {
    document.getElementById('user-dir-list').innerHTML = '<div class="muted">Nhập từ khóa hoặc ID rồi bấm Tìm.</div>';
  }
}

async function executeUserSearch() {
  const q = document.getElementById('user-search-q').value;
  const data = await apiFetch(`/api/users?mode=search&q=${encodeURIComponent(q)}`);
  renderUserRows(data.users || []);
}

function renderUserRows(users) {
  const container = document.getElementById('user-dir-list');
  container.innerHTML = users.map((u) => `
    <div class="list-row" style="display:flex;justify-content:space-between;align-items:center;">
      <div>
        ${u.avatar} <b>${u.display_name}</b> <span class="muted">(ID: ${u.id})</span><br/>
        ${renderRoleBadge(u.role, u.level)} • <span style="color:#fbbf24;">💰 ${u.coins.toLocaleString()} Xu</span>
      </div>
      <button class="btn-xs btn-primary" onclick="openChatWith(${u.id}, '${u.display_name}')">✉️ Nhắn tin</button>
    </div>
  `).join('') || '<div class="muted">Không tìm thấy thành viên phù hợp.</div>';
}

// 4. BẢNG CẤP ĐỘ, CỬA HÀNG & KHU GIẢI TRÍ
function renderLevelsPage() {
  document.getElementById('main-view').innerHTML = `
    <div class="box-header"><span>📊 HỆ THỐNG PHÂN CẤP ĐỘ & CHỨC VỤ</span></div>
    <div class="box-content">
      <div class="list-row">👑 <span class="role-badge role-chu-wap">Chủ Wap</span> — <b>Cấp độ 130 (Cao nhất)</b>: Toàn quyền quản trị hệ thống, bổ nhiệm Admin/Mod, chỉnh sửa thông báo và dữ liệu.</div>
      <div class="list-row">🛡️ <span class="role-badge role-admin">Admin</span> — <b>Cấp độ 125</b>: Quản lý thành viên, bổ nhiệm Mod, cấp phát Xu, khóa tài khoản vi phạm, đăng thông báo BQT.</div>
      <div class="list-row">⚔️ <span class="role-badge role-mod">Mod</span> — <b>Cấp độ 120</b>: Kiểm duyệt bài viết, khóa nick thành viên vi phạm, hỗ trợ giải đáp và đăng thông báo BQT.</div>
      <div class="list-row">👤 <span class="role-badge role-member">Thành Viên</span> — <b>Cấp độ 1 đến 119</b>: Tham gia bảng tin, diễn đàn, kết bạn, nhắn tin real-time, chơi game giải trí. Khi đạt <b>Level 50+</b> được mở khóa quyền đăng/sửa thông báo!</div>
    </div>
  `;
}

function renderShopPage() {
  const items = [
    { icon: '🐉', name: 'Rồng Lửa Huyền Thoại', price: 500 },
    { icon: '💎', name: 'Kim Cương Đại Gia', price: 1000 },
    { icon: '🔥', name: 'Ngọn Lửa Bất Diệt', price: 300 },
    { icon: '🚀', name: 'Phi Thuyền Không Gian', price: 800 }
  ];
  document.getElementById('main-view').innerHTML = `
    <div class="box-header"><span>🛒 CỬA HÀNG BIỂU TƯỢNG VIP</span></div>
    <div class="box-content">
      ${items.map((it) => `
        <div class="list-row" style="display:flex;justify-content:space-between;align-items:center;">
          <span>${it.icon} <b>${it.name}</b> — <span style="color:#fbbf24;">${it.price} Xu</span></span>
          <button class="btn-xs btn-gold" onclick="buyShopItem('${it.icon}', ${it.price})">Mua & Đeo</button>
        </div>
      `).join('')}
    </div>
  `;
}

async function buyShopItem(item, price) {
  const res = await apiFetch('/api/shop/buy', {
    method: 'POST',
    body: JSON.stringify({ item, price })
  });
  if (res.error) return alert(res.error);
  alert(res.message);
  if (currentUser) {
    currentUser.avatar = item;
    currentUser.coins -= price;
    localStorage.setItem('tgc_user', JSON.stringify(currentUser));
    updateUserUI();
  }
}

function renderGamesPage() {
  document.getElementById('main-view').innerHTML = `
    <div class="box-header"><span>🎮 KHU GIẢI TRÍ — TÀI XỈU MAY MẮN</span></div>
    <div class="box-content">
      <div class="wap-form">
        <div class="form-group">
          <label>Chọn cửa đặt:</label>
          <select id="dice-choice">
            <option value="tai">TÀI (11 - 18 nút)</option>
            <option value="xiu">XỈU (3 - 10 nút)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Số Xu cược (Tối thiểu 10 Xu):</label>
          <input type="number" id="dice-bet" value="100" min="10" />
        </div>
        <button class="btn-block btn-primary" onclick="playDiceGame()">🎲 Lắc Xí Ngầu</button>
      </div>
      <div id="dice-result" style="margin-top:10px;font-weight:bold;"></div>
    </div>
  `;
}

async function playDiceGame() {
  const choice = document.getElementById('dice-choice').value;
  const bet = document.getElementById('dice-bet').value;
  const res = await apiFetch('/api/game/dice', {
    method: 'POST',
    body: JSON.stringify({ choice, bet })
  });
  if (res.error) return alert(res.error);
  document.getElementById('dice-result').innerHTML = `🎲 Xí ngầu: [${res.dice.join(' - ')}] → ${res.message}`;
  await pollRealtimeNow();
}
