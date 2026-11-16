let currentUser = JSON.parse(localStorage.getItem('tgc_user_obj')) || null;

function getCurrentUser() { return currentUser; }
function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

document.addEventListener('DOMContentLoaded', () => {
    renderTopNav();
    updateLiveClock();
    setInterval(updateLiveClock, 1000);

    if (currentUser) {
        switchTab('home');
    } else {
        switchTab('login');
    }
});

function updateLiveClock() {
    const now = new Date();
    const days = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} - ${days[now.getDay()]} ••••• ${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} •••••`;
    const el = document.getElementById('live-clock-banner');
    if (el) el.innerText = timeStr;
}

function renderTopNav() {
    const nav = document.getElementById('top-nav');
    if (!nav) return;
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

function switchTab(tab, extraData = null) {
    stopMessagePolling();
    const container = document.getElementById('main-content');
    if (!container) return;

    if (!currentUser && tab !== 'login' && tab !== 'register') {
        renderLoginView(container);
        return;
    }

    switch (tab) {
        case 'login': renderLoginView(container); break;
        case 'register': renderRegisterView(container); break;
        case 'home': renderHomeView(container); break;
        case 'posts': renderPostsView(container); break;
        case 'messages': renderMessagesView(container, extraData); break;
        case 'online': renderOnlineView(container); break;
        case 'notifications': renderNotificationsView(container); break;
        case 'menu': renderMenuView(container); break;
        default: renderHomeView(container);
    }
}
