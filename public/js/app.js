let currentUser = JSON.parse(localStorage.getItem('tgc_user_obj')) || null;
let currentLoginType = 'username';
let activeChatUser = '';
let messageInterval = null;

document.addEventListener('DOMContentLoaded', () => {
    renderTopNav();
    updateLiveClock();
    setInterval(updateLiveClock, 1000);
    fetchStats();

    if (currentUser) {
        switchTab('home');
    } else {
        switchTab('login');
    }
});

async function fetchStats() {
    try {
        const res = await fetch('/api/stats');
        if (res.ok) {
            const data = await res.json();
            document.getElementById('stat-total-users-badge').innerText = data.totalUsers;
            document.getElementById('stat-users-count').innerText = data.totalUsers;
            document.getElementById('stat-posts-count').innerText = data.totalPosts;
            document.getElementById('online-count-1').innerText = data.onlineCount;
        }
    } catch (e) {}
}

function updateLiveClock() {
    const now = new Date();
    const days = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
    const dayName = days[now.getDay()];
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const date = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();

    const clockStr = `${hours}:${minutes} - ${dayName} ••••• ${date}/${month}/${year} •••••`;
    const el = document.getElementById('live-clock-banner');
    if (el) el.innerText = clockStr;
}

function renderTopNav() {
    const nav = document.getElementById('top-nav');
    if (currentUser) {
        nav.innerHTML = `
            <a href="#" onclick="switchTab('home')" class="hover:text-blue-400 transition flex items-center"><i class="fa-solid fa-house text-[10px] text-amber-400 mr-1"></i>Home</a>
            <span class="text-slate-600">·</span>
            <a href="#" onclick="switchTab('online')" class="hover:text-blue-400 transition flex items-center"><i class="fa-solid fa-users text-[10px] text-emerald-400 mr-1"></i>Trực tuyến</a>
            <span class="text-slate-600">·</span>
            <a href="#" onclick="switchTab('posts')" class="hover:text-blue-400 transition flex items-center"><i class="fa-solid fa-newspaper text-[10px] text-blue-400 mr-1"></i>Bảng tin</a>
            <span class="text-slate-600">·</span>
            <a href="#" onclick="switchTab('notifications')" class="hover:text-blue-400 transition flex items-center"><i class="fa-solid fa-bell text-[10px] text-yellow-400 mr-1"></i>Thông báo</a>
            <span class="text-slate-600">·</span>
            <a href="#" onclick="switchTab('messages')" class="hover:text-blue-400 transition flex items-center"><i class="fa-solid fa-envelope text-[10px] text-pink-400 mr-1"></i>Tin nhắn</a>
            <span class="text-slate-600">·</span>
            <a href="#" onclick="switchTab('menu')" class="hover:text-blue-400 transition flex items-center"><i class="fa-solid fa-bars text-[10px] text-purple-400 mr-1"></i>Menu</a>
        `;
    } else {
        nav.innerHTML = `
            <a href="#" onclick="switchTab('login')" class="hover:text-blue-400 transition flex items-center"><i class="fa-solid fa-house text-[10px] text-amber-400 mr-0.5"></i>Trang chủ</a>
            <span class="text-slate-600">·</span>
            <a href="#" onclick="switchTab('login')" class="hover:text-blue-400 transition flex items-center"><i class="fa-solid fa-right-to-bracket text-[10px] text-emerald-400 mr-0.5"></i>Đăng nhập</a>
            <span class="text-slate-600">·</span>
            <a href="#" onclick="switchTab('register')" class="hover:text-blue-400 transition flex items-center"><i class="fa-solid fa-user-plus text-[10px] text-pink-400 mr-0.5"></i>Đăng ký</a>
        `;
    }
}

function setLoginType(type) {
    currentLoginType = type;
    const label = document.getElementById('login-label-text');
    const input = document.getElementById('login-identifier');
    const btnUsername = document.getElementById('btn-type-username');
    const btnId = document.getElementById('btn-type-id');

    if (type === 'id') {
        label.innerText = 'ID tài khoản (Số):';
        input.placeholder = 'Nhập ID số của bạn...';
        input.type = 'number';
        btnId.className = 'py-1.5 bg-blue-600 text-white rounded-lg font-semibold transition';
        btnUsername.className = 'py-1.5 bg-[#1a1a1e] text-slate-400 rounded-lg font-semibold border border-[#2e2e36] transition';
    } else {
        label.innerText = 'Tên tài khoản:';
        input.placeholder = 'Nhập tên tài khoản...';
        input.type = 'text';
        btnUsername.className = 'py-1.5 bg-blue-600 text-white rounded-lg font-semibold transition';
        btnId.className = 'py-1.5 bg-[#1a1a1e] text-slate-400 rounded-lg font-semibold border border-[#2e2e36] transition';
    }
}

function switchTab(tab) {
    ['view-login', 'view-register', 'view-home', 'view-online', 'view-posts', 'view-notifications', 'view-messages', 'view-menu'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    if (tab === 'home') {
        if (!currentUser) { switchTab('login'); return; }
        document.getElementById('view-home').classList.remove('hidden');
        document.getElementById('profile-name').innerText = currentUser.display_name;
        document.getElementById('profile-id-tag').innerText = `(ID: ${currentUser.id})`;
        document.getElementById('avatar-initial').innerText = currentUser.display_name.charAt(0).toUpperCase();
        fetchStats();
        loadPosts();
    } else {
        const target = document.getElementById(`view-${tab}`);
        if (target) target.classList.remove('hidden');
        if (tab === 'posts') loadPosts();
    }
}

async function handleRegister() {
    const username = document.getElementById('reg-username').value.trim();
    const display_name = document.getElementById('reg-displayname').value.trim();
    const password = document.getElementById('reg-password').value.trim();
    const repassword = document.getElementById('reg-repassword').value.trim();
    const gender = document.getElementById('reg-gender').value;

    if (!username || !display_name || !password || !repassword) {
        alert('Vui lòng điền đầy đủ tất cả các ô!');
        return;
    }
    if (password !== repassword) {
        alert('Mật khẩu nhập lại không khớp!');
        return;
    }

    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, display_name, password, gender })
        });
        const data = await res.json();
        if (res.ok) {
            alert('Đăng ký thành công! Hãy tiến hành đăng nhập.');
            switchTab('login');
        } else {
            alert(data.error || 'Đăng ký thất bại.');
        }
    } catch (e) {
        alert('Lỗi kết nối máy chủ.');
    }
}

async function handleLogin() {
    const identifier = document.getElementById('login-identifier').value.trim();
    const password = document.getElementById('login-password').value.trim();

    if (!identifier || !password) {
        alert('Vui lòng điền thông tin đăng nhập!');
        return;
    }

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ loginType: currentLoginType, identifier, password })
        });
        const data = await res.json();
        if (res.ok) {
            currentUser = data.user;
            localStorage.setItem('tgc_user_obj', JSON.stringify(currentUser));
            renderTopNav();
            alert('Đăng nhập thành công!');
            switchTab('home');
        } else {
            alert(data.error || 'Đăng nhập thất bại.');
        }
    } catch (e) {
        alert('Lỗi kết nối máy chủ.');
    }
}

function handleLogout() {
    currentUser = null;
    localStorage.removeItem('tgc_user_obj');
    renderTopNav();
    closePrivateChat();
    switchTab('login');
    alert('Đã đăng xuất!');
}

async function loadPosts() {
    const container = document.getElementById('feed-container');
    if (!container) return;
    try {
        const res = await fetch('/api/posts');
        if (res.ok) {
            const posts = await res.json();
            if (posts.length === 0) {
                container.innerHTML = '<div class="wap-card rounded-xl p-3 text-center text-xs text-slate-400">Chưa có bài viết nào.</div>';
                return;
            }
            container.innerHTML = posts.map(p => `
                <div class="wap-card rounded-xl p-3 space-y-1.5">
                    <div class="flex items-center space-x-2">
                        <div class="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-[10px]">${(p.username || 'A').charAt(0).toUpperCase()}</div>
                        <span class="font-bold text-xs text-slate-200">${p.username || 'Ẩn danh'}</span>
                    </div>
                    <p class="text-xs text-slate-300 whitespace-pre-line">${escapeHtml(p.content)}</p>
                </div>
            `).join('');
        }
    } catch (e) {}
}

async function createPost() {
    const content = document.getElementById('post-content').value.trim();
    if (!content) return;
    try {
        const res = await fetch('/api/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser.display_name, content })
        });
        if (res.ok) {
            document.getElementById('post-content').value = '';
            loadPosts();
            fetchStats();
        }
    } catch (e) {
        alert('Không thể đăng bài.');
    }
}

function openChatBox() {
    const target = document.getElementById('chat-target').value.trim();
    if (!target) {
        alert('Vui lòng nhập tên người cần nhắn tin!');
        return;
    }
    if (target === currentUser.display_name) {
        alert('Bạn không thể tự nhắn tin cho chính mình!');
        return;
    }
    activeChatUser = target;
    document.getElementById('chat-with-title').innerText = 'Đang chat với: ' + target;
    document.getElementById('private-chat-box').classList.remove('hidden');
    
    fetchPrivateMessages();
    if (messageInterval) clearInterval(messageInterval);
    messageInterval = setInterval(fetchPrivateMessages, 2000);
}

function closePrivateChat() {
    document.getElementById('private-chat-box').classList.add('hidden');
    activeChatUser = '';
    if (messageInterval) clearInterval(messageInterval);
}

async function fetchPrivateMessages() {
    if (!activeChatUser || !currentUser) return;
    try {
        const res = await fetch(`/api/messages/get?user1=${encodeURIComponent(currentUser.display_name)}&user2=${encodeURIComponent(activeChatUser)}`);
        if (res.ok) {
            const msgs = await res.json();
            const listDiv = document.getElementById('private-messages-list');
            if (msgs.length === 0) {
                listDiv.innerHTML = '<div class="text-center text-slate-500 py-4">Chưa có tin nhắn nào.</div>';
                return;
            }
            listDiv.innerHTML = msgs.map(m => {
                const isMe = m.sender === currentUser.display_name;
                return `
                    <div class="flex flex-col ${isMe ? 'items-end' : 'items-start'}">
                        <span class="text-[9px] text-slate-500 mb-0.5">${m.sender}</span>
                        <div class="max-w-[80%] px-3 py-1.5 rounded-lg text-xs ${isMe ? 'bg-blue-600 text-white rounded-br-none' : 'bg-[#1a1a1e] text-slate-200 border border-[#2e2e36] rounded-bl-none'}">
                            ${escapeHtml(m.content)}
                        </div>
                    </div>
                `;
            }).join('');
            listDiv.scrollTop = listDiv.scrollHeight;
        }
    } catch (e) {}
}

async function sendPrivateMessage() {
    const input = document.getElementById('private-input');
    const content = input.value.trim();
    if (!content || !activeChatUser) return;

    try {
        const res = await fetch('/api/messages/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sender: currentUser.display_name, receiver: activeChatUser, content })
        });
        if (res.ok) {
            input.value = '';
            fetchPrivateMessages();
        }
    } catch (e) {
        alert('Không thể gửi tin nhắn.');
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
