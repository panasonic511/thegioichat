import { handleLogin } from './auth.js';

export async function handleIndex(request, env, user, renderLayout) {
    if (!user) {
        if (request.method === 'POST') {
            return await handleLogin(request, env);
        }

        const loginContent = `
        <div class="box" style="max-width: 450px; margin: 15px auto;">
            <div class="box-title">🔒 Đăng nhập hệ thống</div>
            <div class="box-content">
                <form method="POST" action="/">
                    <label style="color:#00ff00; display:block; margin-bottom:4px;">Tên tài khoản / ID / Gmail:</label>
                    <input type="text" name="username" required placeholder="Nhập tên đăng nhập hoặc email..." style="background: #000; color: #00ff00; border: 1px solid #444; padding: 8px; width: 100%; box-sizing: border-box; margin-bottom: 10px; font-family: Arial, sans-serif;">
                    
                    <label style="color:#00ff00; display:block; margin-bottom:4px;">Nhập mật khẩu:</label>
                    <input type="password" name="password" required placeholder="Nhập mật khẩu..." style="background: #000; color: #00ff00; border: 1px solid #444; padding: 8px; width: 100%; box-sizing: border-box; margin-bottom: 10px; font-family: Arial, sans-serif;">
                    
                    <div style="margin-bottom: 12px; font-size: 11px;">
                        <input type="checkbox" name="remember" style="width: auto;"> Ghi nhớ | <a href="/forgot" style="color:#ffcc00;">Quên mật khẩu</a>
                    </div>
                    
                    <button type="submit" class="btn" style="width: 100%; padding: 8px; background: #0055ff; color: #fff; border: none; font-weight: bold; cursor: pointer;">Đăng nhập</button>
                </form>
                <div style="text-align: center; margin-top: 12px; font-size: 11px;">
                    Hoặc chưa có tài khoản? <a href="/register" style="color: #ff5555; font-weight: bold;">Đăng kí ngay</a>
                </div>
            </div>
        </div>
        `;
        return new Response(renderLayout('Đăng nhập', loginContent, user), {
            headers: { 'Content-Type': 'text/html;charset=UTF-8' }
        });
    }

    // Truy vấn số liệu THẬT từ D1 Database
    let announcements = { results: [] };
    try {
        announcements = await env.DB.prepare(`
            SELECT announcements.*, users.display_name, users.role, users.level 
            FROM announcements 
            JOIN users ON announcements.user_id = users.id 
            ORDER BY announcements.id DESC 
            LIMIT 5
        `).all();
    } catch (e) {}

    let totalUsers = 1;
    let totalFeeds = 0;
    let recentUsers = [];
    try {
        const uCount = await env.DB.prepare("SELECT COUNT(*) as total FROM users").first();
        totalUsers = uCount?.total || 1;
        const fCount = await env.DB.prepare("SELECT COUNT(*) as total FROM feeds").first();
        totalFeeds = fCount?.total || 0;
        const rUsers = await env.DB.prepare("SELECT id, display_name, role, level FROM users ORDER BY id DESC LIMIT 5").all();
        recentUsers = rUsers.results || [];
    } catch (e) {}

    // Đếm tin nhắn thật trong từng phòng chat nếu có bảng room_messages
    let roomCounts = { party: 0, game: 0, social: 0, general: 0 };
    try {
        const rRows = await env.DB.prepare("SELECT room, COUNT(*) as cnt FROM room_messages GROUP BY room").all();
        for (const r of (rRows.results || [])) {
            if (roomCounts[r.room] !== undefined) roomCounts[r.room] = r.cnt;
        }
    } catch (e) {}

    // Thời gian thực tế tại Việt Nam (UTC+7)
    const now = new Date(Date.now() + 7 * 3600 * 1000);
    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const timeStr = now.toISOString().substr(11, 5);
    const dateStr = `${days[now.getUTCDay()]} - ${String(now.getUTCDate()).padStart(2, '0')}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${now.getUTCFullYear()}`;

    const defaultAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100' height='100' fill='%231a1a1a'/><circle cx='50' cy='38' r='18' fill='%2300ff00'/><path d='M20 88 C20 65, 80 65, 80 88' fill='%2300ff00'/></svg>";
    const currentAvatar = (user.avatar && !user.avatar.includes('7gXvS6v')) ? user.avatar : defaultAvatar;

    const content = `
    <div class="box" style="margin-bottom: 8px; background: #0d0d0d; border: 1px solid #333;">
        <div class="box-content" style="display: flex; align-items: center; justify-content: space-between; padding: 8px;">
            <div style="display: flex; align-items: center;">
                <a href="/profile"><img src="${currentAvatar}" width="38" height="38" style="border-radius: 50%; border: 1px solid #00ff00; margin-right: 8px; object-fit: cover; display: block;"></a>
                <div>
                    <div>
                        <a href="/profile" style="font-weight: bold; color: #00ff00;">${user.display_name}</a> 
                        <span style="color: #ffcc00; font-size: 11px;">[Lv.${user.level || 1}]</span>
                    </div>
                    <div style="font-size: 11px; color: #ccc; margin-top: 2px;">
                        🪙 ${(user.coins || 0).toLocaleString()} Xu 
                        ${user.gold ? `| 👑 ${user.gold.toLocaleString()} Vàng` : ''}
                    </div>
                </div>
            </div>
            <div>
                <span style="background: #1a1a1a; color: #ffcc00; padding: 3px 8px; border: 1px solid #444; font-size: 11px; font-weight: bold;">
                    ${user.role}
                </span>
            </div>
        </div>
    </div>

    <!-- Phòng chát (Số liệu thật 100%) -->
    <div class="box">
        <div class="box-title">🟢 Phòng chát</div>
        <div class="box-content" style="padding: 6px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                <a href="/users/feed" class="btn" style="text-align: left; padding: 8px; background: #141414; border: 1px solid #333;">🎉 Bữa tiệc <span style="color:#888;">(${roomCounts.party})</span></a>
                <a href="/game" class="btn" style="text-align: left; padding: 8px; background: #141414; border: 1px solid #333;">🎮 Trò chơi <span style="color:#888;">(${roomCounts.game})</span></a>
                <a href="/users/feed" class="btn" style="text-align: left; padding: 8px; background: #141414; border: 1px solid #333;">💬 Giao lưu <span style="color:#888;">(${roomCounts.social})</span></a>
                <a href="/users/feed" class="btn" style="text-align: left; padding: 8px; background: #141414; border: 1px solid #333;">🔥 Chát room <span style="color:#888;">(${roomCounts.general})</span></a>
            </div>
        </div>
    </div>

    <!-- Menu hệ thống (Thời gian thực & số liệu thật) -->
    <div class="box">
        <div class="box-title">≡ Menu</div>
        <div class="box-content">
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #222; padding-bottom: 6px; margin-bottom: 6px; font-size: 11px; color: #aaa;">
                <div>
                    <b style="color: #fff; font-size: 13px;">${timeStr}</b><br>
                    ${dateStr}
                </div>
                <div style="text-align: right; line-height: 1.6;">
                    👤 <a href="/profile">Trang cá nhân</a><br>
                    🛍️ <a href="/shop/inventory">Túi đồ của tôi</a><br>
                    📊 <a href="/profile/level">Bảng cấp độ</a>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px;">
                <div>📋 <a href="/users/feed">Bảng tin (${totalFeeds})</a></div>
                <div>👥 <a href="/profile">Thành viên (${totalUsers})</a></div>
                <div>🛒 <a href="/shop">Cửa hàng</a></div>
                <div>🎮 <a href="/game">Khu giải trí</a></div>
            </div>
        </div>
    </div>

    <!-- Danh sách thành viên thật mới tham gia -->
    <div class="box">
        <div class="box-title">👥 Thành viên thật (${totalUsers})</div>
        <div class="box-content" style="font-size: 11px;">
            ${recentUsers.map(u => `<a href="/profile?user=${u.id}" style="color: #00ff00; margin-right: 8px;">${u.display_name} <span style="color:#ffcc00;">[Lv.${u.level || 1}]</span></a>`).join('· ')}
        </div>
    </div>

    <!-- Thông báo hệ thống -->
    <div class="box">
        <div class="box-title" style="display: flex; justify-content: space-between; align-items: center;">
            <span>📢 Thông báo</span>
            <a href="/" style="font-size: 10px; color: #ffcc00;">🔄 Làm mới</a>
        </div>
        <div class="box-content" style="font-size: 11px;">
            <div style="text-align: center; color: #ff55ff; margin-bottom: 8px; font-weight: bold;">
                ✨ ═══════ • 💖 • ═══════ ✨<br>
                CHÀO MỪNG ĐẾN VỚI WAP THẾ GIỚI CHAT<br>
                CHÚC M.N ONLINE VUI VẺ
            </div>
            <hr style="border: 0; border-top: 1px dashed #333; margin: 6px 0;">
            
            ${announcements.results.length === 0 ? '<div style="color: #888; text-align: center;">Chưa có thông báo nào từ quản trị viên.</div>' : 
                announcements.results.map(item => `
                <div style="margin-bottom: 6px;">
                    <span style="color: #ffcc00;">[Lv.${item.level}]</span> <a href="/profile?user=${item.user_id}" style="font-weight:bold; color: #ff5555;">${item.display_name}</a> <span style="color: yellow;">(${item.role})</span>
                    <div style="color: #fff; margin-top: 2px;">${item.content}</div>
                </div>
            `).join('')}
        </div>
    </div>
    `;

    return new Response(renderLayout('Trang chủ', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
