import { renderUser } from '../utils/userStyle.js';

export async function handleMailBox(request, env, user, renderLayout) {
    let partners = { results: [] };
    try {
        // Lấy danh sách những người đã từng nhắn tin với user hiện tại
        partners = await env.DB.prepare(`
            SELECT DISTINCT u.id, u.display_name, u.avatar, u.role, u.level, u.name_color, u.name_glow, u.name_border, u.name_border_glow, u.border_color, u.avatar_glow
            FROM users u
            JOIN messages m ON (u.id = m.sender_id OR u.id = m.receiver_id)
            WHERE (m.sender_id = ? OR m.receiver_id = ?) AND u.id != ?
        `).bind(user.id, user.id, user.id).all();
    } catch (e) {}

    const content = `
    <div class="box">
        <div class="box-title">✉️ Hộp thư tin nhắn</div>
        <div class="box-content" style="padding: 4px;">
            ${partners.results.length === 0 ? '<div style="text-align: center; color: #888; padding: 20px;">Hộp thư trống. Hãy tìm bạn bè để nhắn tin!</div>' :
                partners.results.map(p => {
                    const pUI = renderUser(p);
                    return `
                    <div style="border-bottom: 1px solid #222; padding: 8px; display: flex; align-items: center; justify-content: space-between;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="width: 32px; height: 32px;">
                                <img src="${p.avatar && !p.avatar.includes('7gXvS6v') ? p.avatar : 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\'><rect width=\'100\' height=\'100\' fill=\'%231a1a1a\'/><circle cx=\'50\' cy=\'38\' r=\'18\' fill=\'%2300ff00\'/></svg>'}" width="32" height="32" style="${pUI.avatarStyle} display:block;">
                            </div>
                            <div>
                                <a href="/profile?user=${p.id}" style="${pUI.nameStyle}">${p.display_name}</a> <span style="color:#ffcc00; font-size:10px;">[Lv.${p.level}]</span>
                            </div>
                        </div>
                        <div>
                            <a href="/mail/chat?user=${p.id}" class="btn" style="background: #0055ff; color: #fff; padding: 3px 8px; font-size: 10px;">Mở chat 💬</a>
                        </div>
                    </div>`;
                }).join('')}
        </div>
    </div>
    <div style="text-align: center; margin-top: 10px;"><a href="/">⬅️ Về trang chủ</a></div>
    `;

    return new Response(renderLayout('Hộp thư', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
