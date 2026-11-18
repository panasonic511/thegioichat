import { handleLogin } from './auth.js';

export async function handleIndex(request, env, user, renderLayout) {
    if (!user) {
        if (request.method === 'POST') return await handleLogin(request, env);
        
        const loginContent = `
        <div class="box">
            <div class="box-title">🔑 Đăng nhập hệ thống</div>
            <div class="box-content">
                <form method="POST">
                    <label style="color: #00ff00; display: block; margin-bottom: 2px;">Tên đăng nhập / ID:</label>
                    <input type="text" name="username" required style="width: 100%; background: #000; color: #fff; border: 1px solid #444; padding: 6px; box-sizing: border-box; margin-bottom: 8px;">
                    <label style="color: #00ff00; display: block; margin-bottom: 2px;">Mật khẩu:</label>
                    <input type="password" name="password" required style="width: 100%; background: #000; color: #fff; border: 1px solid #444; padding: 6px; box-sizing: border-box; margin-bottom: 8px;">
                    <button type="submit" class="btn" style="width: 100%; background: #0055ff; color: #fff; padding: 6px;">Đăng nhập</button>
                </form>
                <div style="text-align: center; margin-top: 8px; font-size: 11px;">
                    Chưa có tài khoản? <a href="/register">Đăng ký ngay</a>
                </div>
            </div>
        </div>`;
        return new Response(renderLayout('Đăng nhập', loginContent, null), {
            headers: { 'Content-Type': 'text/html;charset=UTF-8' }
        });
    }

    // Lấy thông báo an toàn tuyệt đối
    let announcements = { results: [] };
    try {
        announcements = await env.DB.prepare(`
            SELECT announcements.*, users.display_name, users.role, users.level, 
                   users.name_color, users.name_glow, users.name_border, users.name_border_glow, users.border_color, users.avatar_glow, users.avatar 
            FROM announcements 
            LEFT JOIN users ON announcements.user_id = users.id 
            ORDER BY announcements.id DESC 
            LIMIT 5
        `).all();
    } catch (e) {}

    let totalUsers = 1, totalFeeds = 0, recentUsers = [];
    try {
        const uCount = await env.DB.prepare("SELECT COUNT(*) as total FROM users").first();
        totalUsers = uCount?.total || 1;
        const fCount = await env.DB.prepare("SELECT COUNT(*) as total FROM feeds").first();
        totalFeeds = fCount?.total || 0;
        const rUsers = await env.DB.prepare("SELECT id, display_name, role, level, name_color, name_glow, name_border, name_border_glow, border_color, avatar_glow, avatar FROM users ORDER BY id DESC LIMIT 5").all();
        recentUsers = rUsers.results || [];
    } catch (e) {}

    // Hàm render cục bộ cực kỳ an toàn bên trong index.js để chống lỗi null
    function safeRenderUser(u) {
        const safe = u || {};
        const defaultAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100' height='100' fill='%231a1a1a'/><circle cx='50' cy='38' r='18' fill='%2300ff00'/></svg>";
        const avt = (safe.avatar && !String(safe.avatar).includes('7gXvS6v')) ? safe.avatar : defaultAvatar;
        
        const borderColor = safe.border_color || '#ffcc00';
        let avtStyle = `border-radius: 50%; object-fit: cover; border: 2px solid ${borderColor};`;
        if (safe.avatar_glow && safe.avatar_glow !== '#000000') avtStyle += ` box-shadow: 0 0 10px ${safe.avatar_glow};`;

        const nameColor = safe.name_color || '#00ff00';
        let nameStyle = `color: ${nameColor}; font-weight: bold;`;
        let shadows = [];
        if (safe.name_glow && safe.name_glow !== '#000000') shadows.push(`0 0 6px ${safe.name_glow}`);
        if (safe.name_border_glow && safe.name_border_glow !== '#000000') shadows.push(`0 0 4px ${safe.name_border_glow}`);
        if (shadows.length > 0) nameStyle += ` text-shadow: ${shadows.join(', ')};`;
        if (safe.name_border && safe.name_border !== '#000000') nameStyle += ` -webkit-text-stroke: 0.5px ${safe.name_border};`;

        const name = safe.display_name || 'Thành viên';
        const uid = safe.user_id || safe.id || '';

        return {
            avatarStyle: avtStyle,
            avatarUrl: avt,
            nameStyle,
            nameHtml: `<a href="/profile?user=${uid}" style="${nameStyle}">${name}</a>`
        };
    }

    const currentUserUI = safeRenderUser(user);

    const content = `
    <!-- Khung thông tin cá nhân ngoài Trang chủ -->
    <div class="box" style="margin-bottom: 8px; background: #0d0d0d; border: 1px solid #333;">
        <div class="box-content" style="display: flex; align-items: center; justify-content: space-between; padding: 8px;">
            <div style="display: flex; align-items: center;">
                <div style="width: 38px; height: 38px; margin-right: 8px;">
                    <a href="/profile"><img src="${currentUserUI.avatarUrl}" width="38" height="38" style="${currentUserUI.avatarStyle} display:block;"></a>
                </div>
                <div>
                    <div>
                        ${currentUserUI.nameHtml} 
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
                    ${user.role || 'Thành Viên'}
                </span>
            </div>
        </div>
    </div>

    <!-- Phòng chát -->
    <div class="box">
        <div class="box-title">🟢 Phòng chát</div>
        <div class="box-content" style="padding: 6px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                <a href="/users/feed" class="btn" style="text-align: left; padding: 8px; background: #141414; border: 1px solid #333;">🎉 Bữa tiệc</a>
                <a href="/game" class="btn" style="text-align: left; padding: 8px; background: #141414; border: 1px solid #333;">🎮 Trò chơi</a>
            </div>
        </div>
    </div>

    <!-- Menu hệ thống -->
    <div class="box">
        <div class="box-title">≡ Menu</div>
        <div class="box-content">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px;">
                <div>📋 <a href="/users/feed">Bảng tin (${totalFeeds})</a></div>
                <div>👥 <a href="/profile">Thành viên (${totalUsers})</a></div>
                <div>🛒 <a href="/shop">Cửa hàng</a></div>
                <div>🎮 <a href="/game">Khu giải trí</a></div>
            </div>
        </div>
    </div>

    <!-- Danh sách thành viên thật -->
    <div class="box">
        <div class="box-title">👥 Thành viên thật (${totalUsers})</div>
        <div class="box-content" style="font-size: 11px;">
            ${recentUsers.map(u => {
                const uUI = safeRenderUser(u);
                return `<span style="display:inline-block; margin-right:8px; margin-bottom:4px;">${uUI.nameHtml} <span style="color:#ffcc00;">[Lv.${u.level || 1}]</span></span>`;
            }).join(' · ')}
        </div>
    </div>

    <!-- Thông báo hệ thống -->
    <div class="box">
        <div class="box-title">📢 Thông báo</div>
        <div class="box-content" style="font-size: 11px;">
            ${announcements.results.length === 0 ? '<div style="color: #888; text-align: center;">Chưa có thông báo nào.</div>' : 
                announcements.results.map(item => {
                    const itemUI = safeRenderUser(item);
                    return `
                    <div style="margin-bottom: 6px;">
                        <span style="color: #ffcc00;">[Lv.${item.level || 1}]</span> ${itemUI.nameHtml} <span style="color: yellow;">(${item.role || 'Thành Viên'})</span>
                        <div style="color: #fff; margin-top: 2px;">${item.content || ''}</div>
                    </div>`;
                }).join('')}
        </div>
    </div>
    `;

    return new Response(renderLayout('Trang chủ', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
