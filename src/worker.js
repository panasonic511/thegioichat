import { handleLogin, handleRegister } from './routes/auth.js';
import { handleLogout } from './routes/logout.js';
import { handleIndex } from './routes/index.js';
import { handleProfile } from './routes/profile.js';
import { handleLevel } from './routes/level.js';
import { handleShop } from './routes/shop.js';
import { handleMailBox } from './routes/mail_box.js';
import { handleMailChat } from './routes/mail_chat.js';
import { handleMailNotification } from './routes/mail_notification.js';
import { handleRealtimeApi } from './routes/api_realtime.js';
import { handleFeed } from './routes/feed.js';
import { handleGame } from './routes/game.js';
import { handleAdminDashboard } from './routes/admin_dashboard.js';
import { handleAdminAction } from './routes/admin_action.js';

// Hàm kiểm tra xác thực đăng nhập qua Cookie
async function checkAuth(request, env) {
    const cookie = request.headers.get('Cookie') || '';
    const match = cookie.match(/user_id=(\d+)/);
    if (!match) return null;
    return await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(match[1]).first() || null;
}

// Khung Layout chuẩn giao diện tông màu đen đặc trưng của Thế Giới Chat
function renderLayout(title, content, user) {
    return `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - Thế Giới Chat</title>
    <style>
        body { background: #000; color: #00ff00; font-family: monospace, sans-serif; margin: 0; padding: 0; }
        .header { background: linear-gradient(to bottom, #222, #000); text-align: center; padding: 12px; border-bottom: 2px solid #333; }
        .header h1 { color: #fff; margin: 0; font-size: 22px; text-shadow: 0 0 10px #00ff00; }
        .slogan { color: #00ff00; font-size: 11px; }
        .nav-bar { background: #111; display: flex; justify-content: space-around; padding: 8px 0; border-bottom: 1px solid #333; font-size: 12px; }
        .nav-bar a { color: #fff; text-decoration: none; text-align: center; }
        .nav-bar a:hover { color: #00ff00; }
        .user-panel { background: #0a0a0a; padding: 8px 12px; border-bottom: 1px solid #222; display: flex; align-items: center; justify-content: space-between; font-size: 13px; }
        .container { padding: 10px; max-width: 600px; margin: 0 auto; }
        .box { background: #111; border: 1px solid #333; margin-bottom: 10px; border-radius: 4px; overflow: hidden; }
        .box-title { background: #1a1a1a; color: #00ff00; padding: 6px 10px; font-weight: bold; border-bottom: 1px solid #333; font-size: 13px; }
        .box-content { padding: 10px; font-size: 13px; }
        a { color: #00ff00; text-decoration: none; }
        a:hover { text-decoration: underline; }
        .btn { background: #0055ff; color: #fff; border: none; padding: 6px 12px; cursor: pointer; border-radius: 3px; display: inline-block; font-weight: bold; text-decoration: none; text-align: center; }
        .btn:hover { background: #0033cc; }
        .footer { text-align: center; padding: 15px; font-size: 11px; color: #666; border-top: 1px solid #222; background: #050505; }
    </style>
</head>
<body>
    <div class="header">
        <h1>THẾ GIỚI CHAT</h1>
        <div class="slogan">Wap chát - Kết bạn - Giải trí</div>
    </div>
    
    ${user ? `
    <div class="user-panel">
        <div><b>${user.display_name}</b> <span style="color:#ffcc00;">[Lv.${user.level}]</span></div>
        <div>🪙 ${user.coins.toLocaleString()} Xu | <span style="color:yellow">${user.role}</span></div>
    </div>
    <div class="nav-bar">
        <a href="/">🏠 Home</a>
        <a href="/users/feed">📋 Bảng tin</a>
        <a href="/mail/notification">🔔 Thông báo</a>
        <a href="/mail/box">✉️ Tin nhắn</a>
        <a href="/shop">🛒 Cửa hàng</a>
        ${user.role !== 'Thành Viên' ? '<a href="/admin" style="color:yellow;">🛠️ Quản lý</a>' : ''}
    </div>
    ` : `
    <div class="nav-bar">
        <a href="/">Trang chủ</a> · <a href="/login">Đăng nhập</a> · <a href="/register">Đăng ký</a>
    </div>
    `}

    <div class="container">
        ${content}
    </div>

    <div class="footer">
        <div><a href="/">Home</a> · <a href="/terms">Điều khoản</a> · <a href="/contact">Liên hệ</a> ${user ? '· <a href="/logout">Đăng xuất</a>' : ''}</div>
        <div style="color: #00ff00; margin-top: 5px;">Copyright © 2026 - Thế Giới Chat</div>
        <div style="color: #888; margin-top: 5px;">Version: 3.0.0</div>
    </div>
</body>
</html>`;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const user = await checkAuth(request, env);

    // 1. Các route không bắt buộc đăng nhập
    if (path === '/login' || path === '/register' && request.method === 'GET') {
        return path === '/login' ? await handleLogin(request, env) : await handleRegister(request, env);
    }
    if (path === '/login' || path === '/register' && request.method === 'POST') {
        return path === '/login' ? await handleLogin(request, env) : await handleRegister(request, env);
    }
    if (path === '/logout') {
        return await handleLogout(request, env);
    }
    if (path === '/api/realtime-check') {
        return await handleRealtimeApi(request, env);
    }

    // 2. Kiểm tra bảo mật: Nếu chưa đăng nhập mà truy cập trang khác -> Chuyển về /login
    if (!user && path !== '/') {
        return Response.redirect(new URL('/login', request.url), 302);
    }

    // 3. Phân phối các route đã phân tách file
    if (path === '/') return await handleIndex(request, env, user, renderLayout);
    if (path === '/profile') return await handleProfile(request, env, user, renderLayout, url);
    if (path === '/profile/level') return await handleLevel(request, env, user, renderLayout);
    if (path === '/shop') return await handleShop(request, env, user, renderLayout);
    if (path === '/mail/box') return await handleMailBox(request, env, user, renderLayout);
    if (path === '/mail/chat') return await handleMailChat(request, env, user, renderLayout, url);
    if (path === '/mail/notification') return await handleMailNotification(request, env, user, renderLayout);
    if (path === '/users/feed') return await handleFeed(request, env, user, renderLayout);
    if (path === '/game') return await handleGame(request, env, user, renderLayout);
    if (path === '/admin') return await handleAdminDashboard(request, env, user, renderLayout);
    if (path === '/admin/update-role') return await handleAdminAction(request, env, user);

    return new Response("Không tìm thấy trang (404)", { status: 404 });
  }
};
