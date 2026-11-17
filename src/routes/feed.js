import { renderUser } from '../utils/userStyle.js';

export async function handleFeed(request, env, user, renderLayout) {
    // ... (phần xử lý POST đăng bài giữ nguyên)
    let feeds = { results: [] };
    try {
        feeds = await env.DB.prepare(`
            SELECT f.*, u.display_name, u.avatar, u.role, u.level, u.name_color, u.name_glow, u.name_border, u.name_border_glow, u.border_color, u.avatar_glow
            FROM feeds f 
            JOIN users u ON f.user_id = u.id 
            ORDER BY f.id DESC LIMIT 20
        `).all();
    } catch (e) {}

    const content = `
    <div class="box">
        <div class="box-title">📋 Bảng tin hoạt động</div>
        <div class="box-content" style="padding: 4px;">
            ${feeds.results.map(f => {
                const fUI = renderUser(f);
                return `
                <div style="border-bottom: 1px solid #222; padding: 8px 4px; margin-bottom: 6px;">
                    <div style="display: flex; align-items: center; margin-bottom: 4px;">
                        <div style="width: 28px; height: 28px; margin-right: 6px;">
                            <img src="${f.avatar && !f.avatar.includes('7gXvS6v') ? f.avatar : 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\'><rect width=\'100\' height=\'100\' fill=\'%231a1a1a\'/><circle cx=\'50\' cy=\'38\' r=\'18\' fill=\'%2300ff00\'/></svg>'}" width="28" height="28" style="${fUI.avatarStyle} display:block;">
                        </div>
                        <div>
                            <a href="/profile?user=${f.user_id}" style="${fUI.nameStyle}">${f.display_name}</a> 
                            <span style="color: #ffcc00; font-size: 10px;">[Lv.${f.level}]</span>
                        </div>
                    </div>
                    ${f.content ? `<div style="font-size: 12px; color: #fff; margin-bottom: 6px;">${f.content}</div>` : ''}
                </div>`;
            }).join('')}
        </div>
    </div>
    `;

    return new Response(renderLayout('Bảng tin', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
