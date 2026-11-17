let currentAuthMode = 'login';
let currentUser = JSON.parse(localStorage.getItem('tgc_user') || 'null');

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

function updateUserUI() {
  const miniBar = document.getElementById('user-mini-bar');
  const adminLink = document.getElementById('menu-admin-link');
  const logoutLink = document.getElementById('menu-logout-link');
  const btnAddAnn = document.getElementById('btn-add-announcement');

  if (currentUser) {
    miniBar.innerHTML = `
      <span>${currentUser.avatar} <b>${currentUser.display_name}</b> (ID:${currentUser.id})</span>
      <span style="color:#fbbf24;margin-left:6px;">💰${currentUser.coins.toLocaleString()}</span>
    `;
    logoutLink.classList.remove('hidden');

    // Chỉ Mod, Admin, Chủ Wap mới thấy mục Quản Trị
    if (currentUser.role !== 'Thành Viên') {
      adminLink.classList.remove('hidden');
    } else {
      adminLink.classList.add('hidden');
    }

    // Chỉ Level >= 50 mới thấy nút Đăng/Sửa Thông Báo BQT
    if (currentUser.level >= 50) {
      btnAddAnn.classList.remove('hidden');
    } else {
      btnAddAnn.classList.add('hidden');
    }
  } else {
    miniBar.innerHTML = `
      <button class="btn-xs btn-primary" onclick="openAuthModal('login')">Đăng nhập</button>
      <button class="btn-xs" onclick="openAuthModal('register')">Đăng ký</button>
    `;
    adminLink.classList.add('hidden');
    logoutLink.classList.add('hidden');
    btnAddAnn.classList.add('hidden');
  }
}

function openAuthModal(mode = 'login') {
  document.getElementById('auth-modal').classList.remove('hidden');
  switchAuthTab(mode);
}

function closeAuthModal() {
  document.getElementById('auth-modal').classList.add('hidden');
}

function switchAuthTab(mode) {
  currentAuthMode = mode;
  document.getElementById('auth-error').classList.add('hidden');
  document.getElementById('tab-login-user').classList.toggle('active', mode === 'login');
  document.getElementById('tab-login-id').classList.toggle('active', mode === 'id');
  document.getElementById('tab-register').classList.toggle('active', mode === 'register');

  const fieldDisplay = document.getElementById('field-display-name');
  const labelAccount = document.getElementById('label-account');
  const inputAccount = document.getElementById('auth-account');
  const btnSubmit = document.getElementById('auth-submit-btn');

  if (mode === 'register') {
    fieldDisplay.classList.remove('hidden');
    labelAccount.textContent = 'Tên đăng nhập (viết liền không dấu):';
    inputAccount.placeholder = 'Ví dụ: nguyenvana';
    btnSubmit.textContent = 'Tạo Tài Khoản Mới';
  } else if (mode === 'id') {
    fieldDisplay.classList.add('hidden');
    labelAccount.textContent = 'Nhập ID tài khoản (Số):';
    inputAccount.placeholder = 'Ví dụ: 1';
    btnSubmit.textContent = 'Đăng Nhập Bằng ID';
  } else {
    fieldDisplay.classList.add('hidden');
    labelAccount.textContent = 'Tên đăng nhập:';
    inputAccount.placeholder = 'Nhập tên tài khoản...';
    btnSubmit.textContent = 'Đăng Nhập';
  }
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const errBox = document.getElementById('auth-error');
  errBox.classList.add('hidden');

  const account = document.getElementById('auth-account').value;
  const password = document.getElementById('auth-password').value;
  const displayName = document.getElementById('auth-display-name').value;

  if (currentAuthMode === 'register') {
    const res = await apiFetch('/api/register', {
      method: 'POST',
      body: JSON.stringify({ username: account, display_name: displayName, password })
    });
    if (res.error) {
      errBox.textContent = res.error;
      errBox.classList.remove('hidden');
      return;
    }
    alert(res.message);
    switchAuthTab('id');
    document.getElementById('auth-account').value = res.id;
  } else {
    const res = await apiFetch('/api/login', {
      method: 'POST',
      body: JSON.stringify({ account, password, loginType: currentAuthMode })
    });
    if (res.error) {
      errBox.textContent = res.error;
      errBox.classList.remove('hidden');
      return;
    }
    localStorage.setItem('tgc_token', res.token);
    localStorage.setItem('tgc_user', JSON.stringify(res.user));
    currentUser = res.user;
    closeAuthModal();
    updateUserUI();
    navigate('home');
  }
}

function logout() {
  localStorage.removeItem('tgc_token');
  localStorage.removeItem('tgc_user');
  currentUser = null;
  updateUserUI();
  navigate('home');
}
