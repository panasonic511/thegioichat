export async function handleFeed(request, env, user, renderLayout) {
    // 1. Tự động tạo bảng posts nếu chưa tồn tại
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

    // 2. Xử lý khi người dùng gửi bài viết mới (POST)
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

    // 3. Truy vấn danh sách bài viết từ cơ sở dữ liệu D1 an toàn
    let postsHtml = '';
    try {
        const res = await env.DB.prepare(`
            SELECT posts.id, posts.user_id, posts.content, posts.created_at, 
                   users.username, users.display_name, users.avatar
            FROM posts
            LEFT JOIN users ON posts.user_id = users.id
            ORDER BY posts.id DESC LIMIT 20
        `).all();
        
        const posts = res.results || [];

        if (posts.length === 0) {
            postsHtml = '<div style="text-align: center; color: #aaa; font-size: 11px; padding: 10px;">Chưa có bài viết nào trên bảng tin.</div>';
        } else {
            posts.forEach(post => {
                const displayName = post.display_name || post.username || 'Thành viên';
                const avatarUrl = post.avatar || 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\'><rect width=\'100\' height=\'100\' fill=\'%23333\'/></svg>';
                
                postsHtml += `
                    <div class="box" style="max-width: 600px; margin: 0 auto 8px auto; padding: 8px; background: #141414; border: 1px solid #333;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                            <div>
                                <img src="${avatarUrl}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 2px solid #444;">
                            </div>
                            <div>
                                <div style="font-size: 12px; margin-bottom: 2px;">
                                    <a href="/profile?user=${post.user_id}" style="color: #00ff00; text-decoration: none; font-weight: bold;">${displayName}</a>
                                </div>
                                <div style="font-size: 9px; color: #aaa;">${post.created_at || ''}</div>
                            </div>
                        </div>
                        <div style="font-size: 11px; word-break: break-word; color: #eee; line-height: 1.4;">
                            ${post.content || ''}
                        </div>
                    </div>
                `;
            });
        }
    } catch (e) {
        postsHtml = `<div style="color: #ff3333; text-align: center; font-size: 11px; padding: 10px;">Không thể tải danh sách bài viết: ${e.message}</div>`;
    }

    // 4. Lắp ráp giao diện hoàn chỉnh
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
