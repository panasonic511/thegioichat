import { renderUser } from '../worker.js';

export default async function handleFeed(request, env, user, renderLayout) {
    try {
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                content TEXT,
                created_at TEXT
            )
        `).run();
    } catch (e) {}

    let message = '';
    if (request.method === 'POST') {
        try {
            const formData = await request.formData();
            const postContent = formData.get('content');
            if (postContent && postContent.trim() !== '') {
                await env.DB.prepare(
                    "INSERT INTO posts (user_id, content, created_at) VALUES (?, ?, datetime('now'))"
                ).bind(user.id, postContent.trim()).run();
                message = '<div style="color: #00ff80; text-align: center; margin-bottom: 10px; font-weight: bold;">Đăng bài thành công</div>';
            }
        } catch (e) {
            message = `<div style="color: #ff3333; text-align: center; margin-bottom: 10px;">Lỗi: ${e.message}</div>`;
        }
    }

    let postsHtml = '';
    try {
        const res = await env.DB.prepare(`
            SELECT posts.*, users.username, users.display_name, users.avatar, users.border_color, users.avatar_glow,
                   users.name_color, users.name_glow, users.name_border, users.name_border_glow, users.active_icon, users.role
            FROM posts
            JOIN users ON posts.user_id = users.id
            ORDER BY posts.id DESC LIMIT 20
        `).all();
        
        const posts = res.results || [];

        if (posts.length === 0) {
            postsHtml = '<div style="text-align: center; color: #aaa; font-size: 11px; padding: 10px;">Chưa có bài viết nào trên bảng tin.</div>';
        } else {
            posts.forEach(post => {
                const authorUI = renderUser(post);
                const picon = post.active_icon ? `<img src="${post.active_icon}" style="width: 14px; height: 14px; vertical-align: middle; display: inline-block; margin-right: 2px;">` : '';
                
                postsHtml += `
                    <div class="box" style="max-width: 600px; margin: 0 auto 8px auto; padding: 8px; background: #141414; border: 1px solid #333;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                            <div style="display: inline-block; position: relative;">
                                <img src="${post.avatar && post.avatar.includes('7gKvS6v') ? post.avatar : 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\'><rect width=\'100\' height=\'100\' fill=\'%23333\'/></svg>'}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 2px solid ${post.border_color || '#444'};">
                            </div>
                            <div>
                                <div style="font-size: 12px; margin-bottom: 2px;">
                                    ${picon}${authorUI.nameHtml}
                                    <span style="color: #ffcc00; font-size: 10px;">[Lv.${post.level || 1}]</span>
                                </div>
                                <div style="font-size: 9px; color: #aaa;">${post.created_at}</div>
                            </div>
                        </div>
                        <div style="font-size: 11px; word-break: break-word; color: #eee; line-height: 1.4;">
                            ${post.content}
                        </div>
                    </div>
                `;
            });
        }
    } catch (e) {
        postsHtml = `<div style="color: #ff3333; text-align: center; font-size: 11px;">Không thể tải bảng tin: ${e.message}</div>`;
    }

    const html = `
        <div class="box" style="max-width: 600px; margin: 0 auto 8px auto;">
            <div class="box-title">📝 Đăng bài lên bảng tin</div>
            <div class="box-content" style="padding: 8px;">
                ${message}
                <form method="POST">
                    <textarea name="content" placeholder="Bạn đang nghĩ gì thế..." rows="3" style="width: 100%; background: #111; color: #fff; border: 1px solid #444; padding: 6px; box-sizing: border-box; font-size: 11px; border-radius: 4px; resize: none;"></textarea>
                    <div style="text-align: right; margin-top: 6px;">
                        <button type="submit" class="btn" style="background: #00cc66; color: #fff; padding: 4px 12px; font-size: 11px; border: none; border-radius: 3px; cursor: pointer;">Đăng bài</button>
                    </div>
                </form>
            </div>
        </div>

        <div class="box" style="max-width: 600px; margin: 0 auto 8px auto;">
            <div class="box-title">📰 Bảng tin cộng đồng</div>
        </div>

        ${postsHtml}
    `;

    return renderLayout(html, 'Bảng tin', user, request);
}
