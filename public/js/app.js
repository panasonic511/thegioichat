// Thay thế dòng import renderMenuView cũ bằng:
import { renderOnlineView, renderNotificationsView } from './online.js';
import { renderMenuView } from './menu.js';
import { renderLoginView, renderRegisterView } from './auth.js';
import { renderHomeView } from './home.js';
import { renderPostsView } from './posts.js';
import { renderMessagesView, stopMessagePolling } from './messages.js';
import { renderOnlineView, renderNotificationsView, renderMenuView } from './online.js';

export function getCurrentUser() {
    return JSON.parse(localStorage.getItem('tgc_user_obj')) || null;
}

export function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderTopNav() {
    const nav = document.getElementById('top-nav');
    const user = getCurrentUser();
    if (user) {
        nav.innerHTML = `
            <a href="#" data-tab="home" class="nav-link hover:text-blue-400 transition flex items-center"><i class="fa-solid fa-house text-[10px] text-amber-400 mr-1"></i>Home</a>
            <span class="text-slate-600">·</span>
            <a href="#" data-tab="online" class="nav-link hover:text-blue-400 transition flex items-center"><i class="fa-solid fa-users text-[10px] text-emerald-400 mr-1"></i>Trực tuyến</a>
            <span class="text-slate-600">·</span>
            <a href="#" data-tab="posts" class="nav-link hover:text-blue-400 transition flex items-center"><i class="fa-solid fa-newspaper text-[10px] text-blue-400 mr-1"></i>Bảng tin</a>
            <span class="text-slate-600">·</span>
            <a href="#" data-tab="notifications" class="nav-link hover:text-blue-400 transition flex items-center"><i class="fa-solid fa-bell text-[10px] text-yellow-400 mr-1"></i>Thông báo</a>
            <span class="text-slate-600">·</span>
            <a href="#" data-tab="messages" class="nav-link hover:text-blue-400 transition flex items-center"><i class="fa-solid fa-envelope text-[10px] text-pink-400 mr-1"></i>Tin nhắn</a>
            <span class="text-slate-600">·</span>
            <a href="#" data-tab="menu" class="nav-link hover:text-blue-400 transition flex items-center"><i class="fa-solid fa-bars text-[10px] text-purple-400 mr-1"></i>Menu</a>
        `;
    } else {
        nav.innerHTML = `
            <a href="#" data-tab="login" class="nav-link hover:text-blue-400 transition flex items-center"><i class="fa-solid fa-house text-[10px] text-amber-400 mr-0.5"></i>Trang chủ</a>
            <span class="text-slate-600">·</span>
            <a href="#" data-tab="login" class="nav-link hover:text-blue-400 transition flex items-center"><i class="fa-solid fa-right-to-bracket text-[10px] text-emerald-400 mr-0.5"></i>Đăng nhập</a>
            <span class="text-slate-600">·</span>
            <a href="#" data-tab="register" class="nav-link hover:text-blue-400 transition flex items-center"><i class="fa-solid fa-user-plus text-[10px] text-pink-400 mr-0.5"></i>Đăng ký</a>
        `;
    }

    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab(link.getAttribute('data-tab'));
        });
    });
}

export function switchTab(tab, extraData = null) {
    stopMessagePolling(); // Dừng tải ngầm tin nhắn khi chuyển sang tab khác
    const container = document.getElementById('main-content');
    const user = getCurrentUser();

    if (!user && tab !== 'login' && tab !== 'register') {
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

document.addEventListener('DOMContentLoaded', () => {
    renderTopNav();
    if (getCurrentUser()) {
        switchTab('home');
    } else {
        switchTab('login');
    }
});
