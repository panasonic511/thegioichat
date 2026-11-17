import { handleLogin } from './auth.js';
import { renderUser } from '../utils/userStyle.js';

export async function handleIndex(request, env, user, renderLayout) {
    if (!user) {
        if (request.method === 'POST') return await handleLogin(request, env);
        // ... (phần form đăng nhập giữ nguyên như trước)
    }

    let announcements = { results: [] };
    try {
        announcements = await env.DB.prepare(`
            SELECT announcements.*, users.display_name, users.role, users.level, 
                   users.name_color, users.name_glow, users.name_border, users.name_border_glow, users.border_color, users.avatar_glow 
            FROM announcements 
            JOIN users ON announcements.user_id = users.id 
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
        const rUsers = await env.DB.prepare("SELECT id, display_name, role, level, name_color, name_glow, name_border, name_border_glow, border_color, avatar_glow FROM users ORDER BY id DESC LIMIT 5").all();
        recentUsers = rUsers.results || [];
    } catch (e) {}

    const currentUserUI = renderUser(user);

    const content = `
    <!-- Khung thông tin cá nhân ngoài Trang chủ -->
    <div class="box" style="margin-bottom: 8px; background: #0d0d0d; border: 1px solid #333;">
        <div class="box-content" style="display: flex; align-items: center; justify-content: space-between; padding: 8px;">
            <div style="display: flex; align-items: center;">
                <div style="width: 38px; height: 38px; margin-right: 8px;">
                    <a href="/profile"><img src="${user.avatar && !user.avatar.includes('7gXvS6v') ? user.avatar : 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\'><rect width=\'100\' height=\'100\' fill=\'%231a1a1a\'/><circle cx=\'50\' cy=\'38\' r=\'18\' fill=\'%2300ff00\'/></svg>'}" width="38" height="38" style="${currentUserUI.avatarStyle} display:block;"></a>
                </div>
                <div>
                    <div>
                        <a href="/profile" style="${currentUserUI.nameStyle}">${user.display_name}</a> 
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
                const uUI = renderUser(u);
                return `<span style="display:inline-block; margin-right:8px; margin-bottom:4px;"><a href="/profile?user=${u.id}" style="${uUI.nameStyle}">${u.display_name}</a> <span style="color:#ffcc00;">[Lv.${u.level || 1}]</span></span>`;
            }).join(' · ')}
        </div>
    </div>

    <!-- Thông báo hệ thống -->
    <div class="box">
        <div class="box-title">📢 Thông báo</div>
        <div class="box-content" style="font-size: 11px;">
            ${announcements.results.length === 0 ? '<div style="color: #888; text-align: center;">Chưa có thông báo nào.</div>' : 
                announcements.results.map(item => {
                    const itemUI = renderUser(item);
                    return `
                    <div style="margin-bottom: 6px;">
                        <span style="color: #ffcc00;">[Lv.${item.level}]</span> <a href="/profile?user=${item.user_id}" style="${itemUI.nameStyle}">${item.display_name}</a> <span style="color: yellow;">(${item.role})</span>
                        <div style="color: #fff; margin-top: 2px;">${item.content}</div>
                    </div>`;
                }).join('')}
        </div>
    </div>
    `;

    return new Response(renderLayout('Trang chủ', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
