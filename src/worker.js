import { handleLogin, handleRegister } from './routes/auth.js';
import { handleLogout } from './routes/logout.js';
import { handleIndex } from './routes/index.js';
import { handleProfile } from './routes/profile.js';
import { handleLevel } from './routes/level.js';
import { handleShop } from './routes/shop.js';
import { handleShopIcon } from './routes/shop_icon.js';
import { handleShopFrames } from './routes/shop_frames.js';
import { handleShopColor } from './routes/shop_color.js';
import { handleInventory } from './routes/inventory.js';
import { handleMailBox } from './routes/mail_box.js';
import { handleMailChat } from './routes/mail_chat.js';
import { handleMailNotification } from './routes/mail_notification.js';
import { handleRealtimeApi } from './routes/api_realtime.js';
import { handleFeed } from './routes/feed.js';
import { handleGame } from './routes/game.js';
import { handleAdminDashboard } from './routes/admin_dashboard.js';
import { handleAdminAction } from './routes/admin_action.js';

export function renderUser(u) {
    const safeUser = new Proxy(u || {}, {
        get(target, prop) {
            if (prop === 'id' || prop === 'user_id') return target[prop] || 0;
            return target[prop] !== undefined && target[prop] !== null ? target[prop] : '';
        }
    });

    const defaultAvatarMale = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><rect width='120' height='120' fill='%230f172a'/><circle cx='60' cy='45' r='22' fill='%2338bdf8'/><path d='M20 105 C20 80, 100 80, 100 105' fill='%2338bdf8'/></svg>";
    const defaultAvatarFemale = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><rect width='120' height='120' fill='%231f1025'/><circle cx='60' cy='45' r='22' fill='%23f472b6'/><path d='M20 105 C20 80, 100 80, 100 105' fill='%23f472b6'/></svg>";

    const userGender = String(safeUser.gender || 'male');
    const systemDefaultAvatar = userGender === 'female' ? defaultAvatarFemale : defaultAvatarMale;

    const avatarVal = String(safeUser.avatar || '');
    const avatarUrl = (avatarVal && !avatarVal.includes('7gXvS6v')) ? avatarVal : systemDefaultAvatar;

    const borderColor = String(safeUser.border_color || '#ffcc00');
    let avatarStyle = `border-radius: 50%; object-fit: cover; border: 2px solid ${borderColor};`;
    if (safeUser.avatar_glow && safeUser.avatar_glow !== '#000000') {
        avatarStyle += ` box-shadow: 0 0 10px ${safeUser.avatar_glow};`;
    }

    const nameColor = String(safeUser.name_color || '#00ff00');
    let nameStyle = `color: ${nameColor}; font-weight: bold;`;
    let shadows = [];
    if (safeUser.name_glow && safeUser.name_glow !== '#000000') shadows.push(`0 0 6px ${safeUser.name_glow}`);
    if (safeUser.name_border_glow && safeUser.name_border_glow !== '#000000') shadows.push(`0 0 4px ${safeUser.name_border_glow}`);
    if (shadows.length > 0) nameStyle += ` text-shadow: ${shadows.join(', ')};`;
    if (safeUser.name_border && safeUser.name_border !== '#000000') nameStyle += ` -webkit-text-stroke: 0.5px ${safeUser.name_border};`;

    const displayName = safeUser.display_name || safeUser.username || 'Thành viên';
    const userId = safeUser.user_id || safeUser.id || 0;
    
    // Tự động gắn Icon trước tên người dùng trên toàn bộ hệ thống Wap
    const activeIcon = safeUser.active_icon ? `${safeUser.active_icon} ` : '';

    return {
        nameStyle,
        avatarStyle,
        nameHtml: `<a href="/profile?user=${userId}" style="${nameStyle}">${activeIcon}${displayName}</a>`,
        avatarHtml: `<a href="/profile?user=${userId}"><img src="${avatarUrl}" style="${avatarStyle}"></a>`
    };
}

async function checkAuth(request, env) {
    try {
        const cookie = request.headers.get('Cookie') || '';
        const match = cookie.match(/user_id=(\d+)/);
        if (!match) return null;
        
        // Đảm bảo luôn load đủ các cột cấu hình trang trí tài khoản từ DB
        try { await env.DB.prepare("ALTER TABLE users ADD COLUMN active_icon TEXT DEFAULT ''").run(); } catch (e) {}
        try { await env.DB.prepare("ALTER TABLE users ADD COLUMN name_color TEXT DEFAULT '#00ff00'").run(); } catch (e) {}
        try { await env.DB.prepare("ALTER TABLE users ADD COLUMN border_color TEXT DEFAULT '#ffcc00'").run(); } catch (e) {}

        return await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(match[1]).first() || null;
    } catch (e) {
        return null;
    }
}

function renderLayout(title, content, user) {
    const menuBarHtml = user ? `
        <a href="/" class="top-menu-item"><span class="top-menu-icon">🏠</span>Home</a>
        <a href="/users/feed" class="top-menu-item"><span class="top-menu-icon">📋</span>Bảng tin</a>
        <a href="/mail/notification" class="top-menu-item"><span class="top-menu-icon">🔔</span>Thông báo <span id="notiBadge" style="background:#ff0000;color:#fff;font-size:9px;padding:1px 4px;border-radius:10px;display:none;">0</span></a>
        <a href="/mail/box" class="top-menu-item"><span class="top-menu-icon">✉️</span>Tin nhắn <span id="msgBadge" style="background:#ff0000;color:#fff;font-size:9px;padding:1px 4px;border-radius:10px;display:none;">0</span></a>
        <a href="/shop" class="top-menu-item"><span class="top-menu-icon">🛒</span>Cửa hàng</a>
        ${user.role && user.role !== 'Thành Viên' ? '<a href="/admin" class="top-menu-item"><span class="top-menu-icon">⚙️</span>Quản lý</a>' : ''}
    ` : `
        <a href="/login" class="top-menu-item"><span class="top-menu-icon">🔑</span>Đăng nhập</a>
        <a href="/register" class="top-menu-item"><span class="top-menu-icon">📝</span>Đăng ký</a>
    `;

    const floatingBubbleHtml = user ? `
        <a href="/mail/box" id="floatingMsgBubble" style="position: fixed; bottom: 20px; right: 20px; width: 48px; height: 48px; background: #111; border: 2px solid #ff3333; border-radius: 50%; display: none; align-items: center; justify-content: center; text-decoration: none; box-shadow: 0 0 15px rgba(255, 51, 51, 0.7); z-index: 9999; animation: pulseBubble 1.5s infinite;">
            <span style="font-size: 22px;">✉️</span>
            <span id="floatingMsgCount" style="position: absolute; top: -4px; right: -4px; background: #ff0000; color: #fff; font-size: 11px; font-weight: bold; padding: 2px 6px; border-radius: 50%;">0</span>
        </a>
        <style>
            @keyframes pulseBubble {
                0% { transform: scale(1); box-shadow: 0 0 10px rgba(255, 51, 51, 0.7); }
                50% { transform: scale(1.08); box-shadow: 0 0 20px rgba(255, 51, 51, 1); }
                100% { transform: scale(1); box-shadow: 0 0 10px rgba(255, 51, 51, 0.7); }
            }
        </style>
        <script>
            async function checkRealtimeNotifications() {
                try {
                    const res = await fetch('/api/realtime-check');
                    if (!res.ok) return;
                    const data = await res.json();
                    
                    const msgBadge = document.getElementById('msgBadge');
                    const notiBadge = document.getElementById('notiBadge');
                    const floatBubble = document.getElementById('floatingMsgBubble');
                    const floatCount = document.getElementById('floatingMsgCount');

                    if (data.unread_messages > 0) {
                        if (msgBadge) { msgBadge.innerText = data.unread_messages; msgBadge.style.display = 'inline-block'; }
                        if (floatBubble && floatCount) { floatCount.innerText = data.unread_messages; floatBubble.style.display = 'flex'; }
                    } else {
                        if (msgBadge) msgBadge.style.display = 'none';
                        if (floatBubble) floatBubble.style.display = 'none';
                    }

                    if (data.unread_notifications > 0) {
                        if (notiBadge) { notiBadge.innerText = data.unread_notifications; notiBadge.style.display = 'inline-block'; }
                    } else {
                        if (notiBadge) notiBadge.style.display = 'none';
                    }
                } catch (e) {}
            }
            checkRealtimeNotifications();
            setInterval(checkRealtimeNotifications, 5000);
        </script>
    ` : '';

    return `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - Thế Giới Chat</title>
    <style>
        body { background: #000; color: #00ff00; font-family: Arial, sans-serif; margin: 0; padding: 0; font-size: 14px; line-height: 1.6; }
        .header { background: #000; text-align: center; padding: 16px 0; border-bottom: 2px solid #222; }
        .header h1 { color: #fff; margin: 0; font-size: 24px; font-weight: bold; text-shadow: 0 0 12px #00ff00; letter-spacing: 1px; }
        @keyframes rainbowGlow {
            0% { color: #ff0000; text-shadow: 0 0 6px #ff0000; }
            14% { color: #ff7700; text-shadow: 0 0 6px #ff7700; }
            28% { color: #ffff00; text-shadow: 0 0 6px #ffff00; }
            42% { color: #00ff00; text-shadow: 0 0 6px #00ff00; }
            57% { color: #00ffff; text-shadow: 0 0 6px #00ffff; }
            71% { color: #0000ff; text-shadow: 0 0 6px #0000ff; }
            85% { color: #ff00ff; text-shadow: 0 0 6px #ff00ff; }
            100% { color: #ff0000; text-shadow: 0 0 6px #ff0000; }
        }
        .slogan { font-size: 13px; font-weight: bold; margin-top: 6px; animation: rainbowGlow 4s infinite linear; }
        .top-menu-wrapper { background: #111; border-bottom: 2px solid #222; padding: 10px 0; }
        .top-menu-bar { max-width: 680px; margin: 0 auto; display: flex; justify-content: space-around; align-items: center; text-align: center; padding: 0 10px; box-sizing: border-box; }
        .top-menu-item { color: #00ff00; text-decoration: none; font-size: 13px; display: flex; flex-direction: column; align-items: center; font-weight: bold; flex: 1; position: relative; }
        .top-menu-item:hover { color: #fff; text-decoration: underline; }
        .top-menu-icon { font-size: 20px; margin-bottom: 3px; }
        .container { padding: 12px; max-width: 680px; margin: 0 auto; box-sizing: border-box; }
        .box { background: #080808; border: 1px solid #333; margin-bottom: 12px; box-sizing: border-box; }
        .box-title { background: linear-gradient(to right, #141414, #222); color: #00ff00; padding: 10px 12px; font-weight: bold; border-bottom: 1px solid #333; font-size: 14px; display: flex; align-items: center; gap: 8px; }
        .box-content { padding: 12px; }
        a { color: #00ff00; text-decoration: none; }
        a:hover { text-decoration: underline; color: #fff; }
        .btn { background: #1c1c1c; color: #00ff00; border: 1px solid #444; padding: 8px 14px; cursor: pointer; font-size: 13px; font-weight: bold; display: inline-block; text-align: center; box-sizing: border-box; }
        .btn:hover { background: #333; border-color: #00ff00; color: #fff; }
        .footer { text-align: center; padding: 16px; font-size: 13px; color: #777; border-top: 1px solid #222; background: #050505; margin-bottom: 40px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>THẾ GIỚI CHAT</h1>
        <div class="slogan">Wap chát - Kết bạn - Giải trí</div>
    </div>
    <div class="top-menu-wrapper"><div class="top-menu-bar">${menuBarHtml}</div></div>
    <div class="container">${content}</div>
    ${floatingBubbleHtml}
    <div class="footer">
        <div><a href="/">Home</a> · <a href="/terms">Điều khoản</a> · <a href="/contact">Liên hệ</a> ${user ? '· <a href="/logout">Đăng xuất</a>' : ''}</div>
        <div style="color: #00ff00; margin-top: 8px;">Copyright © 2026 - Thế Giới Chat</div>
    </div>
</body>
</html>`;
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const user = await checkAuth(request, env);

      if (path === '/login' || path === '/register') {
          return path === '/login' ? await handleLogin(request, env) : await handleRegister(request, env);
      }
      if (path === '/logout') return await handleLogout(request, env);
      if (path === '/api/realtime-check') return await handleRealtimeApi(request, env);

      if (!user && path !== '/') {
          return Response.redirect(new URL('/login', request.url), 302);
      }
    
      if (path === '/') return await handleIndex(request, env, user, renderLayout);
      if (path === '/profile') return await handleProfile(request, env, user, renderLayout, url);
      if (path === '/profile/level') return await handleLevel(request, env, user, renderLayout);
      if (path === '/shop') return await handleShop(request, env, user, renderLayout);
      if (path === '/shop/buyicon') return await handleShopIcon(request, env, user, renderLayout);
      if (path === '/shop/avatar-frames') return await handleShopFrames(request, env, user, renderLayout);
      if (path === '/shop/buycolor') return await handleShopColor(request, env, user, renderLayout);
      if (path === '/shop/inventory') return await handleInventory(request, env, user, renderLayout);
      if (path === '/mail/box') return await handleMailBox(request, env, user, renderLayout);
      if (path === '/mail/chat') return await handleMailChat(request, env, user, renderLayout, url);
      if (path === '/mail/notification') return await handleMailNotification(request, env, user, renderLayout);
      if (path === '/users/feed') return await handleFeed(request, env, user, renderLayout);
      if (path === '/game') return await handleGame(request, env, user, renderLayout);
      if (path === '/admin') return await handleAdminDashboard(request, env, user, renderLayout);
      if (path === '/admin/update-role') return await handleAdminAction(request, env, user);

      return new Response("Không tìm thấy trang (404)", { status: 404 });
    } catch (err) {
      return new Response(`Lỗi hệ thống Worker: ${err.message} <br><pre>${err.stack}</pre>`, { 
        status: 500, 
        headers: { 'Content-Type': 'text/html;charset=UTF-8' } 
      });
    }
  }
};
