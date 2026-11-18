import { handleLogin } from './auth.js';

export async function handleIndex(request, env, user, renderLayout) {
    if (!user) {
        if (request.method === 'POST') return await handleLogin(request, env);
        
        const loginContent = `
        <div class="box">
            <div class="box-title">🔑 Đăng nhập hệ thống</div>
            <div class="box-content">
                <form method="POST">
                    <label style="color: #00ff00; display: block; margin-bottom: 4px; font-size: 14px;">Tên đăng nhập / ID:</label>
                    <input type="text" name="username" required style="width: 100%; background: #000; color: #fff; border: 1px solid #444; padding: 8px; box-sizing: border-box; margin-bottom: 10px; font-size: 14px;">
                    <label style="color: #00ff00; display: block; margin-bottom: 4px; font-size: 14px;">Mật khẩu:</label>
                    <input type="password" name="password" required style="width: 100%; background: #000; color: #fff; border: 1px solid #444; padding: 8px; box-sizing: border-box; margin-bottom: 12px; font-size: 14px;">
                    <button type="submit" class="btn" style="width: 100%; background: #0055ff; color: #fff; padding: 8px; font-size: 14px;">Đăng nhập</button>
                </form>
                <div style="text-align: center; margin-top: 10px; font-size: 13px;">
                    Chưa có tài khoản? <a href="/register">Đăng ký ngay</a>
                </div>
            </div>
        </div>`;
        return new Response(renderLayout('Đăng nhập', loginContent, null), {
            headers: { 'Content-Type': 'text/html;charset=UTF-8' }
        });
    }

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
    <div class="box" style="margin-bottom: 12px; background: #080808; border: 1px solid #333;">
        <div class="box-content" style="display: flex; align-items: center; justify-content: space-between; padding: 12px;">
            <div style="display: flex; align-items: center;">
                <div style="width: 44px; height: 44px; margin-right: 12px;">
                    <a href="/profile"><img src="${currentUserUI.avatarUrl}" width="44" height="44" style="${currentUserUI.avatarStyle} display:block;"></a>
                </div>
                <div>
                    <div style="font-size: 15px;">
                        ${currentUserUI.nameHtml} 
                        <span style="color: #ffcc00; font-size: 13px;">[Lv.${user.level || 1}]</span>
                    </div>
                    <div style="font-size: 13px; color: #ccc; margin-top: 3px;">
                        🪙 ${(user.coins || 0).toLocaleString()} Xu 
                        ${user.gold ? `| 👑 ${user.gold.toLocaleString()} Vàng` : ''}
                    </div>
                </div>
            </div>
            <div>
                <span style="background: #1a1a1a; color: #ffcc00; padding: 4px 10px; border: 1px solid #444; font-size: 12px; font-weight: bold;">
                    ${user.role || 'Thành Viên'}
                </span>
            </div>
        </div>
    </div>

    <!-- Phòng chát -->
    <div class="box">
        <div class="box-title">🟢 Phòng chát</div>
        <div class="box-content" style="padding: 10px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <a href="/users/feed" class="btn" style="text-align: left; padding: 10px; background: #141414; border: 1px solid #333; font-size: 14px;">🎉 Bữa tiệc (1)</a>
                <a href="/game" class="btn" style="text-align: left; padding: 10px; background: #141414; border: 1px solid #333; font-size: 14px;">🎮 Trò chơi (0)</a>
            </div>
        </div>
    </div>

    <!-- Menu hệ thống (Cân đối 2 cột, chữ to rõ giống Gaubong) -->
    <div class="box">
        <div class="box-title">≡ Menu</div>
        <div class="box-content" style="padding: 10px 14px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 14px;">
                <!-- Cột bên trái -->
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <div>💬 <a href="/users/feed" style="font-size: 14px; font-weight: bold;">Diễn đàn</a></div>
                    <div>📊 <a href="/profile/level" style="font-size: 14px; font-weight: bold;">Bảng cấp độ</a></div>
                    <div>📈 <a href="/shop" style="font-size: 14px; font-weight: bold;">Thống kê</a></div>
                </div>
                <!-- Cột bên phải -->
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <div>👥 <a href="/profile" style="font-size: 14px; font-weight: bold;">Bạn bè</a></div>
                    <div>⚙️ <a href="/profile" style="font-size: 14px; font-weight: bold;">Cài đặt</a></div>
                    <div>🎮 <a href="/game" style="font-size: 14px; font-weight: bold;">Khu giải trí [29]</a></div>
                </div>
            </div>
        </div>
    </div>

    <!-- Danh sách thành viên thật -->
    <div class="box">
        <div class="box-title">👥 Thành viên thật (${totalUsers})</div>
        <div class="box-content" style="font-size: 14px;">
            ${recentUsers.map(u => {
                const uUI = safeRenderUser(u);
                return `<span style="display:inline-block; margin-right:10px; margin-bottom:6px;">${uUI.nameHtml} <span style="color:#ffcc00;">[Lv.${u.level || 1}]</span></span>`;
            }).join(' · ')}
        </div>
    </div>

    <!-- Thông báo hệ thống -->
    <div class="box">
        <div class="box-title">📢 Thông báo</div>
        <div class="box-content" style="font-size: 14px;">
            ${announcements.results.length === 0 ? '<div style="color: #888; text-align: center; padding: 6px;">Chưa có thông báo nào.</div>' : 
                announcements.results.map(item => {
                    const itemUI = safeRenderUser(item);
                    return `
                    <div style="margin-bottom: 8px; line-height: 1.6;">
                        <span style="color: #ffcc00;">[Lv.${item.level || 1}]</span> ${itemUI.nameHtml} <span style="color: yellow;">(${item.role || 'Thành Viên'})</span>
                        <div style="color: #fff; margin-top: 3px;">${item.content || ''}</div>
                    </div>`;
                }).join('')}
        </div>
    </div>
    `;

    return new Response(renderLayout('Trang chủ', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
