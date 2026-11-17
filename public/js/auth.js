let currentLoginType = 'username';

function renderLoginView(container) {
    currentLoginType = 'username';
    container.innerHTML = `
        <div class="wap-card rounded-xl p-4 shadow-xl">
            <div class="text-center border-b border-[#222228] pb-2 mb-3">
                <h3 class="text-sm font-bold text-slate-200"><i class="fa-solid fa-lock text-amber-400 mr-1"></i> Đăng nhập hệ thống</h3>
            </div>
            <div class="grid grid-cols-2 gap-2 mb-3 text-xs">
                <button type="button" onclick="setLoginType('username')" id="btn-type-username" class="py-1.5 bg-blue-600 text-white rounded-lg font-semibold transition">Bằng tài khoản</button>
                <button type="button" onclick="setLoginType('id')" id="btn-type-id" class="py-1.5 bg-[#1a1a1e] text-slate-400 rounded-lg font-semibold border border-[#2e2e36] transition">Bằng ID</button>
            </div>
            <div class="space-y-3 text-xs">
                <div>
                    <label class="block font-medium text-slate-300 mb-1" id="login-label-text">Tên tài khoản:</label>
                    <input type="text" id="login-identifier" placeholder="Nhập tên tài khoản..." class="w-full px-3 py-2 rounded-lg wap-input">
                </div>
                <div>
                    <label class="block font-medium text-slate-300 mb-1">Mật khẩu:</label>
                    <input type="password" id="login-password" placeholder="••••••••" class="w-full px-3 py-2 rounded-lg wap-input">
                </div>
                <button onclick="handleLogin()" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition shadow">Đăng nhập</button>
            </div>
            <div class="text-center text-xs mt-3 pt-2 border-t border-[#222228]">
                <span class="text-slate-400">Chưa có tài khoản?</span> 
                <a href="/register" onclick="navigate(event, 'register')" class="text-emerald-400 font-semibold hover:underline ml-1">Đăng ký ngay</a>
            </div>
        </div>
    `;
}

function setLoginType(type) {
    currentLoginType = type;
    const label = document.getElementById('login-label-text');
    const input = document.getElementById('login-identifier');
    const btnUser = document.getElementById('btn-type-username');
    const btnId = document.getElementById('btn-type-id');

    if (type === 'id') {
        if (label) label.innerText = 'ID tài khoản (Số):';
        if (input) { input.placeholder = 'Nhập ID số của bạn...'; input.type = 'number'; }
        if (btnId) btnId.className = 'py-1.5 bg-blue-600 text-white rounded-lg font-semibold transition';
        if (btnUser) btnUser.className = 'py-1.5 bg-[#1a1a1e] text-slate-400 rounded-lg font-semibold border border-[#2e2e36] transition';
    } else {
        if (label) label.innerText = 'Tên tài khoản:';
        if (input) { input.placeholder = 'Nhập tên tài khoản...'; input.type = 'text'; }
        if (btnUser) btnUser.className = 'py-1.5 bg-blue-600 text-white rounded-lg font-semibold transition';
        if (btnId) btnId.className = 'py-1.5 bg-[#1a1a1e] text-slate-400 rounded-lg font-semibold border border-[#2e2e36] transition';
    }
}

async function handleLogin() {
    const dinhDanh = document.getElementById('login-identifier').value.trim();
    const mat_khau = document.getElementById('login-password').value.trim();
    if (!dinhDanh || !mat_khau) return alert('Vui lòng điền thông tin!');

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ loaiDangNhap: currentLoginType, dinhDanh, mat_khau })
        });
        const data = await res.json();
        if (res.ok) {
            currentUser = data.user;
            localStorage.setItem('tgc_user_obj', JSON.stringify(currentUser));
            renderTopNav();
            alert('Đăng nhập thành công!');
            navigate(null, 'home');
        } else {
            alert(data.error || 'Đăng nhập thất bại.');
        }
    } catch (e) {
        alert('Lỗi kết nối máy chủ.');
    }
}

function renderRegisterView(container) {
    container.innerHTML = `
        <div class="wap-card rounded-xl p-4 shadow-xl">
            <div class="text-center border-b border-[#222228] pb-2 mb-3">
                <h3 class="text-sm font-bold text-slate-200"><i class="fa-solid fa-user-plus text-pink-400 mr-1"></i> Đăng ký thành viên (Level 1 + 100 xu)</h3>
            </div>
            <div class="space-y-3 text-xs">
                <div>
                    <label class="block font-medium text-slate-300 mb-1">Tên đăng nhập:</label>
                    <input type="text" id="reg-username" placeholder="Nhập tên đăng nhập..." class="w-full px-3 py-2 rounded-lg wap-input">
                </div>
                <div>
                    <label class="block font-medium text-slate-300 mb-1">Tên hiển thị trong wap:</label>
                    <input type="text" id="reg-displayname" placeholder="Tên hiển thị công khai..." class="w-full px-3 py-2 rounded-lg wap-input">
                </div>
                <div>
                    <label class="block font-medium text-slate-300 mb-1">Mật khẩu:</label>
                    <input type="password" id="reg-password" placeholder="••••••••" class="w-full px-3 py-2 rounded-lg wap-input">
                </div>
                <div>
                    <label class="block font-medium text-slate-300 mb-1">Nhập lại mật khẩu:</label>
                    <input type="password" id="reg-repassword" placeholder="••••••••" class="w-full px-3 py-2 rounded-lg wap-input">
                </div>
                <div>
                    <label class="block font-medium text-slate-300 mb-1">Chọn giới tính:</label>
                    <select id="reg-gender" class="w-full px-3 py-2 rounded-lg wap-input">
                        <option value="Nam">Nam</option>
                        <option value="Nữ">Nữ</option>
                        <option value="Khác">Khác</option>
                    </select>
                </div>
                <button onclick="handleRegister()" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-lg transition shadow">Đăng ký thành viên</button>
            </div>
            <div class="text-center text-xs mt-3 pt-2 border-t border-[#222228]">
                <span class="text-slate-400">Đã có tài khoản?</span> 
                <a href="/login" onclick="navigate(event, 'login')" class="text-blue-400 font-semibold hover:underline ml-1">Đăng nhập ngay</a>
            </div>
        </div>
    `;
}

async function handleRegister() {
    const ten_dang_nhap = document.getElementById('reg-username').value.trim();
    const ten_hien_thi = document.getElementById('reg-displayname').value.trim();
    const mat_khau = document.getElementById('reg-password').value.trim();
    const repassword = document.getElementById('reg-repassword').value.trim();
    const gioi_tinh = document.getElementById('reg-gender').value;

    if (!ten_dang_nhap || !ten_hien_thi || !mat_khau || !repassword) return alert('Vui lòng điền đủ ô!');
    if (mat_khau !== repassword) return alert('Mật khẩu không khớp!');

    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ten_dang_nhap, ten_hien_thi, mat_khau, gioi_tinh })
        });
        const data = await res.json();
        if (res.ok) {
            alert('Đăng ký thành công! Bạn bắt đầu ở Level 1 với 100 xu.');
            navigate(null, 'login');
        } else {
            alert(data.error || 'Thất bại.');
        }
    } catch (e) {
        alert('Lỗi kết nối.');
    }
}

function handleLogout() {
    currentUser = null;
    localStorage.removeItem('tgc_user_obj');
    renderTopNav();
    navigate(null, 'login');
    alert('Đã đăng xuất!');
}
