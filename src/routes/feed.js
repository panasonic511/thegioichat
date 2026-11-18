import { renderUser } from '../worker.js';

export async function handleFeed(request, env, user, renderLayout) {
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
                message = '<div style="color: #00ff00; text-align: center; margin-bottom: 10px; font-weight: bold;">Đăng bài thành công!</div>';
            }
        } catch (e) {
            message = `<div style="color: #ff3333; text-align: center; margin-bottom: 10px;">Lỗi: ${e.message}</div>`;
        }
    }

    let posts = [];
    try {
        const res = await env.DB.prepare(`
            SELECT posts.*, users.username, users.display_name, users.avatar, users.border_color, users.avatar_glow, 
                   users.name_color, users.name_glow, users.name_border, users.name_border_glow, users.active_icon, users.role
            FROM posts 
            JOIN users ON posts.user_id = users.id 
            ORDER BY posts.id DESC LIMIT 20
        `).all();
        if (res.results) posts = res.results;
    } catch (e) {}

    let postsHtml = '';
    if (posts.length === 0) {
        postsHtml = '<div style="text-align: center; color: #777; padding: 20px;">Chưa có bài viết nào trên bảng tin.</div>';
    } else {
        postsHtml = posts.map(p => {
            const rUser = renderUser(p);
            return `
            <div style="background: #121212; border: 1px solid #2c2c2c; border-radius: 6px; padding: 12px; margin-bottom: 10px;">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                    <div style="width: 36px; height: 36px;">${rUser.avatarHtml}</div>
                    <div>
                        <div>${rUser.nameHtml} <span style="font-size: 10px; color: #888; margin-left: 6px;">${p.created_at || ''}</span></div>
                        <div style="font-size: 11px; color: #ffcc00;">${p.role || 'Thành viên'}</div>
                    </div>
                </div>
                <div style="color: #ddd; font-size: 13px; word-break: break-word; white-space: pre-wrap; padding-left: 46px;">${p.content}</div>
            </div>`;
        }).join('');
    }

    const content = `
    <div class="box">
        <div class="box-title">📋 Đăng bài lên bảng tin</div>
        <div class="box-content">
            ${message}
            <form method="POST">
                <textarea name="content" rows="3" placeholder="Bạn đang nghĩ gì thế..." style="width: 100%; background: #141414; color: #00ff00; border: 1px solid #444; padding: 8px; border-radius: 4px; box-sizing: border-box; font-size: 13px; resize: vertical;"></textarea>
                <div style="text-align: right; margin-top: 6px;">
                    <button type="submit" class="btn" style="background: #00aa00; color: #fff; padding: 6px 16px; border-radius: 4px;">Đăng bài</button>
                </div>
            </form>
        </div>
    </div>

    <div class="box">
        <div class="box-title">📰 Bảng tin cộng đồng</div>
        <div class="box-content">
            ${postsHtml}
        </div>
    </div>
    `;

    return new Response(renderLayout('Bảng tin', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
