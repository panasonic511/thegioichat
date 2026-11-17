// Đồng hồ thời gian thực trên thanh phụ
function startLiveClock() {
  const el = document.getElementById('live-clock');
  const update = () => {
    const now = new Date();
    el.textContent = '⏰ ' + now.toLocaleTimeString('vi-VN') + ' - ' + now.toLocaleDateString('vi-VN');
  };
  update();
  setInterval(update, 1000);
}

function toggleMainMenu() {
  document.getElementById('main-dropdown').classList.toggle('hidden');
}

// Đóng dropdown khi bấm ra ngoài
document.addEventListener('click', (e) => {
  if (!e.target.closest('.menu-dropdown-wrap')) {
    document.getElementById('main-dropdown').classList.add('hidden');
  }
});

// Điều hướng giữa các trang mà không làm phình file index.html
async function navigate(page) {
  document.getElementById('main-dropdown').classList.add('hidden');
  document.querySelectorAll('.top-nav > a').forEach((a) => a.classList.remove('active'));
  const activeNav = document.getElementById(`nav-${page}`);
  if (activeNav) activeNav.classList.add('active');

  if (page !== 'messages') activeChatPartnerId = 0;

  switch (page) {
    case 'home':
      await renderHomePage();
      break;
    case 'online':
      await renderUserDirectory('online');
      break;
    case 'ranking':
      await renderUserDirectory('ranking');
      break;
    case 'search':
      await renderUserDirectory('search');
      break;
    case 'feed':
      await renderFeedPage('bangtin');
      break;
    case 'forum':
      await renderFeedPage('diendan');
      break;
    case 'notifications':
      await renderNotificationsPage();
      break;
    case 'messages':
      await renderMessagesPage();
      break;
    case 'levels':
      renderLevelsPage();
      break;
    case 'shop':
      renderShopPage();
      break;
    case 'games':
      renderGamesPage();
      break;
    case 'admin':
      await renderAdminPage();
      break;
    case 'profile':
    case 'settings':
      renderProfileSettingsPage();
      break;
    case 'friends':
      await renderUserDirectory('online');
      break;
    case 'stats':
      await renderHomePage(true);
      break;
  }
}

async function renderHomePage(focusStats = false) {
  const data = await apiFetch('/api/home');
  if (data.user) {
    currentUser = data.user;
    localStorage.setItem('tgc_user', JSON.stringify(currentUser));
    updateUserUI();
  }
  renderAnnouncements(data.announcements || []);

  const view = document.getElementById('main-view');
  const postsHtml = (data.posts || []).slice(0, 8).map((p) => `
    <div class="list-row">
      <div>${p.avatar} <b>${p.display_name}</b> ${renderRoleBadge(p.role, p.level)}</div>
      <div style="margin:3px 0;">${p.content}</div>
      <div class="muted">${p.created_at} • <a href="javascript:void(0)" onclick="openChatWith(${p.user_id}, '${p.display_name}')">Nhắn tin</a></div>
    </div>
  `).join('') || '<div class="muted">Chưa có hoạt động mới.</div>';

  view.innerHTML = `
    <div class="box-header">
      <span>${focusStats ? '📈 THỐNG KÊ HỆ THỐNG THẾ GIỚI CHAT' : '🔥 HOẠT ĐỘNG MỚI NHẤT'}</span>
      <a href="javascript:void(0)" onclick="navigate('feed')" style="font-size:11px;">Xem tất cả »</a>
    </div>
    <div class="box-content">
      <div style="background:#0d1017;padding:8px;border:1px solid #262b3d;margin-bottom:8px;font-size:12px;">
        🟢 Đang trực tuyến: <b>${data.stats.online}</b> • 👥 Tổng thành viên: <b>${data.stats.users}</b> • 📝 Tổng bài viết: <b>${data.stats.posts}</b>
      </div>
      ${postsHtml}
    </div>
  `;
}

function renderProfileSettingsPage() {
  const view = document.getElementById('main-view');
  if (!currentUser) {
    view.innerHTML = `<div class="box-content">Vui lòng <a href="javascript:void(0)" onclick="openAuthModal('login')">Đăng nhập</a> để xem trang cá nhân.</div>`;
    return;
  }
  view.innerHTML = `
    <div class="box-header"><span>👤 TRANG CÁ NHÂN & CÀI ĐẶT</span></div>
    <div class="box-content">
      <div class="list-row">🆔 <b>ID Đăng nhập:</b> #${currentUser.id}</div>
      <div class="list-row">📛 <b>Tên tài khoản:</b> ${currentUser.username}</div>
      <div class="list-row">✨ <b>Tên hiển thị:</b> ${currentUser.avatar} ${currentUser.display_name}</div>
      <div class="list-row">🎖️ <b>Chức vụ & Cấp độ:</b> ${renderRoleBadge(currentUser.role, currentUser.level)}</div>
      <div class="list-row">💰 <b>Tài sản hiện có:</b> <span style="color:#fbbf24;">${currentUser.coins.toLocaleString()} Xu</span></div>
      <div style="margin-top:10px;">
        <button class="btn-danger" onclick="logout()">🚪 Đăng xuất tài khoản</button>
      </div>
    </div>
  `;
}

// CƠ CHẾ REAL-TIME POLLING (TỰ ĐỘNG CẬP NHẬT TIN NHẮN & THÔNG BÁO MỖI 3 GIÂY)
async function pollRealtimeNow() {
  if (!currentUser) return;
  const query = activeChatPartnerId > 0
    ? `?chat_with=${activeChatPartnerId}&last_msg_id=${lastChatMessageId}`
    : '';
  const data = await apiFetch('/api/realtime' + query);

  const badgeMsg = document.getElementById('badge-msg');
  const badgeNotif = document.getElementById('badge-notif');

  if (data.unread_msg > 0) {
    badgeMsg.textContent = data.unread_msg;
    badgeMsg.classList.remove('hidden');
  } else {
    badgeMsg.classList.add('hidden');
  }

  if (data.unread_notif > 0) {
    badgeNotif.textContent = data.unread_notif;
    badgeNotif.classList.remove('hidden');
  } else {
    badgeNotif.classList.add('hidden');
  }

  if (data.new_messages && data.new_messages.length > 0) {
    appendChatMessages(data.new_messages);
  }

  if (data.coins !== undefined && currentUser) {
    currentUser.coins = data.coins;
    currentUser.level = data.level;
    currentUser.role = data.role;
    updateUserUI();
  }
}

// Khởi chạy ứng dụng
window.addEventListener('DOMContentLoaded', () => {
  startLiveClock();
  updateUserUI();
  navigate('home');
  setInterval(pollRealtimeNow, 3000);
});
