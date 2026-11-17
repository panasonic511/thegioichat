let currentUser = JSON.parse(localStorage.getItem('tgc_user') || 'null');
let idxLoginMethod = 'user';

function getAuthToken() {
  return localStorage.getItem('tgc_token') || '';
}

async function apiFetch(url, options = {}) {
  const headers = options.headers || {};
  headers['Content-Type'] = 'application/json';
  const token = getAuthToken();
  if (token) headers['Authorization'] = token;

  const res = await fetch(url, { ...options, headers });
  return res.json();
}

function renderRoleBadge(role, level) {
  let cls = 'role-member';
  if (role === 'Chủ Wap') cls = 'role-chu-wap';
  else if (role === 'Admin') cls = 'role-admin';
  else if (role === 'Mod') cls = 'role-mod';
  return `<span class="role-badge ${cls}">${role}</span><span class="lv-tag">[Lv.${level}]</span>`;
}

// Chuyển đổi phương thức đăng nhập trên trang chủ (Tài khoản / ID / Gmail)
function setIdxLoginMethod(method) {
  idxLoginMethod = method;
  const tabUser = document.getElementById('idx-tab-user');
  const tabId = document.getElementById('idx-tab-id');
  const tabGmail = document.getElementById('idx-tab-gmail');
  
  if (tabUser) tabUser.classList.toggle('active', method === 'user');
  if (tabId) tabId.classList.toggle('active', method === 'id');
  if (tabGmail) tabGmail.classList.toggle('active', method === 'gmail');

  const label = document.getElementById('idx-account-label');
  const input = document.getElementById('idx-login-account');
  if (!label || !input) return;

  if (method === 'id') {
    label.textContent = 'Nhập ID tài khoản:';
    input.type = 'number';
    input.placeholder = 'Ví dụ: 1';
  } else if (method === 'gmail') {
    label.textContent = 'Địa chỉ Gmail:';
    input.type = 'email';
    input.placeholder = 'Ví dụ: tenban@gmail.com';
  } else {
    label.textContent = 'Tên tài khoản:';
    input.type = 'text';
    input.placeholder = '';
  }
}

function toggleIdxPasswordVis() {
  const pwInput = document.getElementById('idx-login-password');
  if (pwInput) {
    pwInput.type = pwInput.type === 'password' ? 'text' : 'password';
  }
}

// Xử lý sự kiện submit form đăng nhập ngay tại trang chủ
async function submitIndexLogin(e) {
  e.preventDefault();
  const statusBox = document.getElementById('idx-login-status');
  const btn = document.getElementById('idx-btn-login');
  if (statusBox) statusBox.classList.add('hidden');

  const accountInput = document.getElementById('idx-login-account');
  const passwordInput = document.getElementById('idx-login-password');
  if (!accountInput || !passwordInput) return;

  const account = accountInput.value.trim();
  const password = passwordInput.value;

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Đang kiểm tra...';
  }

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account, password, loginType: idxLoginMethod })
    });
    const data = await res.json();
    
    if (!res.ok || data.error) {
      if (statusBox) {
        statusBox.textContent = data.error || 'Sai thông tin đăng nhập!';
        statusBox.classList.remove('hidden');
      }
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Đăng nhập';
      }
      return;
    }

    // Lưu phiên đăng nhập thành công
    localStorage.setItem('tgc_token', data.token);
    localStorage.setItem('tgc_user', JSON.stringify(data.user));
    currentUser = data.user;

    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Đăng nhập';
    }

    // Cập nhật giao diện lập tức sang phần thành viên mà không reload lại trang
    updateUserUI();
    if (typeof navigate === 'function') navigate('home');
  } catch (err) {
    if (statusBox) {
      statusBox.textContent = 'Lỗi kết nối máy chủ!';
      statusBox.classList.remove('hidden');
    }
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Đăng nhập';
    }
  }
}

// Quản lý hiển thị linh hoạt giữa giao diện Khách và giao diện Thành viên
function updateUserUI() {
  const guestView = document.getElementById('guest-view');
  const memberView = document.getElementById('member-view');
  const miniBar = document.getElementById('user-mini-bar');
  const adminLink = document.getElementById('menu-admin-link');
  const logoutLink = document.getElementById('menu-logout-link');
  const btnAddAnn = document.getElementById('btn-add-announcement');

  if (currentUser) {
    // KHI ĐÃ ĐĂNG NHẬP: Ẩn form đăng nhập khách, hiển thị mạng xã hội WAP
    if (guestView) guestView.classList.add('hidden');
    if (memberView) memberView.classList.remove('hidden');

    if (miniBar) {
      miniBar.innerHTML = `
        <div>
          ${currentUser.avatar || '👤'} <b style="color:#facc15;">${currentUser.display_name}</b> <span class="muted">(ID:${currentUser.id})</span>
          ${renderRoleBadge(currentUser.role, currentUser.level)}
        </div>
        <div style="color:#22c55e; font-weight:bold;">
          💰 ${Number(currentUser.coins || 0).toLocaleString()} Xu
        </div>
      `;
    }
    
    if (logoutLink) logoutLink.classList.remove('hidden');

    if (adminLink) {
      if (currentUser.role && currentUser.role !== 'Thành Viên') {
        adminLink.classList.remove('hidden');
      } else {
        adminLink.classList.add('hidden');
      }
    }

    if (btnAddAnn) {
      if (Number(currentUser.level || 0) >= 50) {
        btnAddAnn.classList.remove('hidden');
      } else {
        btnAddAnn.classList.add('hidden');
      }
    }
  } else {
    // KHI CHƯA ĐĂNG NHẬP: Hiển thị form đăng nhập chuyên nghiệp, ẩn khung thành viên
    if (guestView) guestView.classList.remove('hidden');
    if (memberView) memberView.classList.add('hidden');
    
    if (adminLink) adminLink.classList.add('hidden');
    if (logoutLink) logoutLink.classList.add('hidden');
    if (btnAddAnn) btnAddAnn.classList.add('hidden');
  }
}

function openAuthModal() {
  window.location.href = '/login';
}

function logout() {
  localStorage.removeItem('tgc_token');
  localStorage.removeItem('tgc_user');
  currentUser = null;
  updateUserUI();
}

// Tự động kích hoạt kiểm tra trạng thái ngay khi DOM tải xong
document.addEventListener('DOMContentLoaded', () => {
  updateUserUI();
});
