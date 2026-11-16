let currentUser = JSON.parse(localStorage.getItem('tgc_user_obj')) || null;

function getCurrentUser() { return currentUser; }
function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

document.addEventListener('DOMContentLoaded', async () => {
    if (currentUser && currentUser.ten_dang_nhap) {
        try {
            const res = await fetch(`/api/user/info?ten_dang_nhap=${encodeURIComponent(currentUser.ten_dang_nhap)}`);
            if (res.ok) {
                currentUser = await res.json();
                localStorage.setItem('tgc_user_obj', JSON.stringify(currentUser));
            }
        } catch (e) {}
    }

    renderTopNav();
    updateLiveClock();
    setInterval(updateLiveClock, 1000);
    handleRouting();

    window.addEventListener('popstate', () => {
        handleRouting();
    });
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
        let adminNav = '';
        if (currentUser.vai_tro === 'Chủ Wap' || currentUser.vai_tro === 'Admin' || currentUser.vai_tro === 'Mods') {
            adminNav = `<a href="/admin" onclick="navigate(event, 'admin')" class="hover:text-blue-400 transition flex items-center text-amber-400"><i class="fa-solid fa-shield-halved text-[10px] mr-1"></i>Quản trị</a><span class="text-slate-600">·</span>`;
        }
        nav.innerHTML = `
            <a href="/home" onclick="navigate(event, 'home')" class="hover:text-blue-400 transition flex items-center"><i class="fa-solid fa-house text-[10px] text-amber-400 mr-1"></i>Home</a>
            <span class="text-slate-600">·</span>
            <a href="/online" onclick="navigate(event, 'online')" class="hover:text-blue-400 transition flex items-center"><i class="fa-solid fa-users text-[10px] text-emerald-400 mr-1"></i>Trực tuyến</a>
            <span class="text-slate-600">·</span>
            <a href="/posts" onclick="navigate(event, 'posts')" class="hover:text-blue-400 transition flex items-center"><i class="fa-solid fa-newspaper text-[10px] text-blue-400 mr-1"></i>Bảng tin</a>
            <span class="text-slate-600">·</span>
            <a href="/messages" onclick="navigate(event, 'messages')" class="hover:text-blue-400 transition flex items-center"><i class="fa-solid fa-envelope text-[10px] text-pink-400 mr-1"></i>Tin nhắn</a>
            <span class="text-slate-600">·</span>
            <a href="/shop" onclick="navigate(event, 'shop')" class="hover:text-blue-400 transition flex items-center"><i class="fa-solid fa-cart-shopping text-[10px] text-yellow-400 mr-1"></i>Cửa hàng</a>
            <span class="text-slate-600">·</span>
            ${adminNav}
            <a href="/menu" onclick="navigate(event, 'menu')" class="hover:text-blue-400 transition flex items-center"><i class="fa-solid fa-bars text-[10px] text-purple-400 mr-1"></i>Menu</a>
        `;
    } else {
        nav.innerHTML = `
            <a href="/login" onclick="navigate(event, 'login')" class="hover:text-blue-400 transition flex items-center"><i class="fa-solid fa-house text-[10px] text-amber-400 mr-0.5"></i>Trang chủ</a>
            <span class="text-slate-600">·</span>
            <a href="/login" onclick="navigate(event, 'login')" class="hover:text-blue-400 transition flex items-center"><i class="fa-solid fa-right-to-bracket text-[10px] text-emerald-400 mr-0.5"></i>Đăng nhập</a>
            <span class="text-slate-600">·</span>
            <a href="/register" onclick="navigate(event, 'register')" class="hover:text-blue-400 transition flex items-center"><i class="fa-solid fa-user-plus text-[10px] text-pink-400 mr-0.5"></i>Đăng ký</a>
        `;
    }
}

function navigate(event, tab, extraData = null) {
    if (event) event.preventDefault();
    const path = tab === 'login' && !currentUser ? '/login' : `/${tab}`;
    window.history.pushState({ tab, extraData }, '', path);
    switchTab(tab, extraData);
}

function handleRouting() {
    const pathname = window.location.pathname.replace(/^\/|\/$/g, '') || 'home';
    const validTabs = ['home', 'online', 'posts', 'notifications', 'messages', 'menu', 'login', 'register', 'search', 'ranking', 'friends', 'levels', 'settings', 'stats', 'games', 'admin', 'shop', 'inventory', 'deposit-coins', 'deposit-gold'];
    const currentTab = validTabs.includes(pathname) ? pathname : 'home';

    if (!currentUser && currentTab !== 'login' && currentTab !== 'register') {
        navigate(null, 'login');
        return;
    }
    switchTab(currentTab);
}

function switchTab(tab, extraData = null) {
    if (typeof stopMessagePolling === 'function') stopMessagePolling();
    const container = document.getElementById('main-content');
    if (!container) return;

    if (!currentUser && tab !== 'login' && tab !== 'register') {
        if (typeof renderLoginView === 'function') renderLoginView(container);
        return;
    }

    switch (tab) {
        case 'login': if (typeof renderLoginView === 'function') renderLoginView(container); break;
        case 'register': if (typeof renderRegisterView === 'function') renderRegisterView(container); break;
        case 'home': if (typeof renderHomeView === 'function') renderHomeView(container); break;
        case 'posts': if (typeof renderPostsView === 'function') renderPostsView(container); break;
        case 'messages': if (typeof renderMessagesView === 'function') renderMessagesView(container, extraData); break;
        case 'online': if (typeof renderOnlineView === 'function') renderOnlineView(container); break;
        case 'notifications': if (typeof renderNotificationsView === 'function') renderNotificationsView(container); break;
        case 'menu': if (typeof renderMenuView === 'function') renderMenuView(container); break;
        case 'admin': if (typeof renderAdminView === 'function') renderAdminView(container); break;
        case 'shop': if (typeof renderShopView === 'function') renderShopView(container); break;
        case 'inventory': if (typeof renderInventoryView === 'function') renderInventoryView(container); break;
        case 'deposit-coins': if (typeof renderDepositCoinsView === 'function') renderDepositCoinsView(container); break;
        case 'deposit-gold': if (typeof renderDepositGoldView === 'function') renderDepositGoldView(container); break;
        case 'search': if (typeof renderSearchView === 'function') renderSearchView(container); break;
        case 'ranking': if (typeof renderRankingView === 'function') renderRankingView(container); break;
        case 'friends': if (typeof renderFriendsView === 'function') renderFriendsView(container); break;
        case 'levels': if (typeof renderLevelsView === 'function') renderLevelsView(container); break;
        case 'settings': if (typeof renderSettingsView === 'function') renderSettingsView(container); break;
        case 'stats': if (typeof renderStatsView === 'function') renderStatsView(container); break;
        case 'games': if (typeof renderGamesView === 'function') renderGamesView(container); break;
        default: if (typeof renderHomeView === 'function') renderHomeView(container);
    }
}
