let selectedMethod = 'user'; // 'user' | 'id' | 'gmail'

function setLoginMethod(method) {
  selectedMethod = method;
  document.getElementById('m-tab-user').classList.toggle('active', method === 'user');
  document.getElementById('m-tab-id').classList.toggle('active', method === 'id');
  document.getElementById('m-tab-gmail').classList.toggle('active', method === 'gmail');

  const label = document.getElementById('dynamic-account-label');
  const input = document.getElementById('login-account');

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

function togglePasswordVis() {
  const pwInput = document.getElementById('login-password');
  pwInput.type = pwInput.type === 'password' ? 'text' : 'password';
}

async function submitLoginPage(e) {
  e.preventDefault();
  const statusBox = document.getElementById('login-status-msg');
  const btn = document.getElementById('btn-do-login');
  statusBox.classList.add('hidden');

  const account = document.getElementById('login-account').value.trim();
  const password = document.getElementById('login-password').value;

  btn.disabled = true;
  btn.textContent = 'Đang kiểm tra...';

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account,
        password,
        loginType: selectedMethod
      })
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      statusBox.textContent = data.error || 'Đăng nhập thất bại!';
      statusBox.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Đăng nhập';
      return;
    }

    // Lưu phiên đăng nhập và chuyển thẳng về trang chủ
    localStorage.setItem('tgc_token', data.token);
    localStorage.setItem('tgc_user', JSON.stringify(data.user));
    window.location.href = '/';
  } catch (err) {
    statusBox.textContent = 'Lỗi kết nối máy chủ, vui lòng thử lại!';
    statusBox.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = 'Đăng nhập';
  }
}

// Tự động chuyển về trang chủ nếu đã đăng nhập trước đó
window.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('tgc_token')) {
    window.location.href = '/';
  }
});
