export async function handleFeed(request, env, user, renderLayout) {
    // 1. Tự động khởi tạo bảng posts, likes, comments và stories nếu chưa có
    try {
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                content TEXT,
                image_url TEXT,
                created_at TEXT
            )
        `).run();

        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS post_likes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                post_id INTEGER,
                user_id INTEGER
            )
        `).run();

        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS post_comments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                post_id INTEGER,
                user_id INTEGER,
                comment TEXT,
                created_at TEXT
            )
        `).run();

        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS stories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                image_url TEXT,
                caption TEXT,
                created_at TEXT
            )
        `).run();
    } catch (e) {}

    // 2. Xử lý các hành động POST (Đăng bài, Thả tim, Bình luận, Đăng story)
    let message = '';
    if (request.method === 'POST') {
        try {
            const formData = await request.formData();
            const action = formData.get('action');

            if (action === 'create_post') {
                const content = formData.get('content');
                const imageUrl = formData.get('image_url');
                if ((content && content.trim() !== '') || (imageUrl && imageUrl.trim() !== '')) {
                    await env.DB.prepare(
                        "INSERT INTO posts (user_id, content, image_url, created_at) VALUES (?, ?, ?, datetime('now'))"
                    ).bind(user.id, content || '', imageUrl || '').run();
                    message = '<div style="color: #00ff80; text-align: center; margin-bottom: 8px; font-weight: bold;">Đăng bài thành công!</div>';
                }
            } else if (action === 'like_post') {
                const postId = formData.get('post_id');
                const existing = await env.DB.prepare("SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?").bind(postId, user.id).first();
                if (existing) {
                    await env.DB.prepare("DELETE FROM post_likes WHERE post_id = ? AND user_id = ?").bind(postId, user.id).run();
                } else {
                    await env.DB.prepare("INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)").bind(postId, user.id).run();
                }
            } else if (action === 'add_comment') {
                const postId = formData.get('post_id');
                const commentText = formData.get('comment');
                if (commentText && commentText.trim() !== '') {
                    await env.DB.prepare(
                        "INSERT INTO post_comments (post_id, user_id, comment, created_at) VALUES (?, ?, ?, datetime('now'))"
                    ).bind(postId, user.id, commentText.trim()).run();
                }
            } else if (action === 'create_story') {
                const imageUrl = formData.get('image_url');
                const caption = formData.get('caption');
                if (imageUrl && imageUrl.trim() !== '') {
                    await env.DB.prepare(
                        "INSERT INTO stories (user_id, image_url, caption, created_at) VALUES (?, ?, ?, datetime('now'))"
                    ).bind(user.id, imageUrl.trim(), caption || '').run();
                }
            }
        } catch (e) {
            message = `<div style="color: #ff3333; text-align: center; margin-bottom: 8px;">Lỗi: ${e.message}</div>`;
        }
    }

    // 3. Lấy dữ liệu Stories
    let storiesHtml = '';
    try {
        const storyRes = await env.DB.prepare(`
            SELECT stories.*, users.username, users.display_name, users.avatar 
            FROM stories 
            LEFT JOIN users ON stories.user_id = users.id 
            ORDER BY stories.id DESC LIMIT 10
        `).all();
        const stories = storyRes.results || [];

        storiesHtml = `
            <div style="display: flex; gap: 8px; overflow-x: auto; padding: 6px 0; margin-bottom: 10px; scrollbar-width: none;">
                <!-- Nút thêm story cá nhân -->
                <div onclick="openStoryModal()" style="min-width: 65px; height: 100px; background: #1a1a1a; border: 1px dashed #00ff00; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;">
                    <div style="width: 26px; height: 26px; background: #00ff00; color: #000; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 16px; margin-bottom: 4px;">+</div>
                    <div style="font-size: 9px; color: #aaa; text-align: center;">Thêm Story</div>
                </div>
        `;

        stories.forEach(s => {
            const sName = s.display_name || s.username || 'Thành viên';
            const sAvatar = s.avatar || 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'50\' height=\'50\'><rect width=\'50\' height=\'50\' fill=\'%23333\'/></svg>';
            storiesHtml += `
                <div style="min-width: 65px; height: 100px; background: url('${s.image_url}') center/cover no-repeat; border-radius: 8px; position: relative; border: 1px solid #444; flex-shrink: 0; overflow: hidden; padding: 4px; display: flex; flex-direction: column; justify-content: space-between;">
                    <img src="${sAvatar}" style="width: 20px; height: 20px; border-radius: 50%; border: 1px solid #00ff00; object-fit: cover;">
                    <div style="font-size: 8px; color: #fff; background: rgba(0,0,0,0.6); padding: 2px; border-radius: 3px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${sName}</div>
                </div>
            `;
        });
        storiesHtml += `</div>`;
    } catch (e) {
        storiesHtml = '';
    }

    // 4. Lấy danh sách Bài viết, kèm số lượt thích và bình luận
    let postsHtml = '';
    try {
        const postRes = await env.DB.prepare(`
            SELECT posts.*, users.username, users.display_name, users.avatar, users.name_color, users.active_icon 
            FROM posts 
            LEFT JOIN users ON posts.user_id = users.id 
            ORDER BY posts.id DESC LIMIT 20
        `).all();
        const posts = postRes.results || [];

        if (posts.length === 0) {
            postsHtml = '<div style="text-align: center; color: #aaa; font-size: 11px; padding: 15px;">Chưa có bài viết nào trên bảng tin.</div>';
        } else {
            for (let p of posts) {
                const displayName = p.display_name || p.username || 'Thành viên';
                const nameColor = p.name_color || '#00ff00';
                const avatarUrl = p.avatar || 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\'><rect width=\'100\' height=\'100\' fill=\'%23333\'/></svg>';
                const activeIcon = p.active_icon ? `<img src="${p.active_icon}" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 2px;">` : '';

                // Đếm số tim
                const likeCountRes = await env.DB.prepare("SELECT COUNT(*) as cnt FROM post_likes WHERE post_id = ?").bind(p.id).first();
                const likeCount = likeCountRes ? likeCountRes.cnt : 0;

                // Kiểm tra xem user hiện tại đã thả tim chưa
                const userLiked = await env.DB.prepare("SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?").bind(p.id, user.id).first();
                const heartColor = userLiked ? '#ff3333' : '#888';

                // Lấy danh sách bình luận của bài viết
                const commRes = await env.DB.prepare(`
                    SELECT post_comments.*, users.username, users.display_name, users.name_color 
                    FROM post_comments 
                    LEFT JOIN users ON post_comments.user_id = users.id 
                    WHERE post_id = ? ORDER BY post_comments.id ASC
                `).bind(p.id).all();
                const comments = commRes.results || [];

                let commentsHtml = '';
                comments.forEach(c => {
                    const cName = c.display_name || c.username || 'Thành viên';
                    const cColor = c.name_color || '#00ff00';
                    commentsHtml += `
                        <div style="font-size: 11px; margin-top: 4px; border-top: 1px solid #222; padding-top: 4px;">
                            <span style="color: ${cColor}; font-weight: bold;">${cName}:</span> <span style="color: #ddd;">${c.comment}</span>
                        </div>
                    `;
                });

                const imageTag = p.image_url ? `<div style="margin-top: 6px;"><img src="${p.image_url}" style="width: 100%; max-height: 300px; object-fit: cover; border-radius: 4px;"></div>` : '';

                postsHtml += `
                    <div class="box" style="max-width: 600px; margin: 0 auto 8px auto; padding: 8px; background: #141414; border: 1px solid #333;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                            <img src="${avatarUrl}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 1px solid #444;">
                            <div>
                                <div style="font-size: 12px;">${activeIcon}<a href="/profile?user=${p.user_id}" style="color: ${nameColor}; text-decoration: none; font-weight: bold;">${displayName}</a></div>
                                <div style="font-size: 9px; color: #aaa;">${p.created_at} • 🌍 Công khai</div>
                            </div>
                        </div>
                        <div style="font-size: 11px; word-break: break-word; color: #eee; line-height: 1.4; margin-bottom: 6px;">
                            ${p.content || ''}
                        </div>
                        ${imageTag}
                        
                        <!-- Thanh Thả tim & Thống kê -->
                        <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid #222; margin-top: 8px; padding-top: 6px;">
                            <form method="POST" style="margin: 0;">
                                <input type="hidden" name="action" value="like_post">
                                <input type="hidden" name="post_id" value="${p.id}">
                                <button type="submit" style="background: none; border: none; color: ${heartColor}; cursor: pointer; font-size: 14px;">
                                    ❤️ <span style="font-size: 11px; color: #ccc;">${likeCount}</span>
                                </button>
                            </form>
                            <span style="font-size: 10px; color: #888;">💬 ${comments.length} bình luận</span>
                        </div>

                        <!-- Khung danh sách bình luận -->
                        <div style="margin-top: 6px;">
                            ${commentsHtml}
                        </div>

                        <!-- Form gửi bình luận nhanh -->
                        <form method="POST" style="margin-top: 6px; display: flex; gap: 4px;">
                            <input type="hidden" name="action" value="add_comment">
                            <input type="hidden" name="post_id" value="${p.id}">
                            <input type="text" name="comment" placeholder="Viết bình luận..." style="flex: 1; background: #0a0a0a; color: #fff; border: 1px solid #333; padding: 4px; font-size: 10px; border-radius: 3px;" required>
                            <button type="submit" style="background: #0055ff; color: #fff; border: none; padding: 4px 8px; font-size: 10px; border-radius: 3px; cursor: pointer;">Gửi</button>
                        </form>
                    </div>
                `;
            }
        }
    } catch (e) {
        postsHtml = `<div style="color: #ff3333; text-align: center; font-size: 11px;">Không thể tải bảng tin.</div>`;
    }

    // 5. Giao diện toàn trang hoàn chỉnh
    const html = `
        <div class="box" style="max-width: 600px; margin: 0 auto 8px auto;">
            <div class="box-title" style="display: flex; justify-content: space-between; align-items: center;">
                <span>📰 Bảng tin</span>
                <div style="font-size: 10px;">
                    <a href="#" style="color: #00ff00; margin-right: 6px;">Đề xuất</a>
                    <a href="#" style="color: #aaa; margin-right: 6px;">Mới nhất</a>
                    <a href="#" style="color: #aaa;">Theo dõi</a>
                </div>
            </div>
            <div class="box-content" style="padding: 6px;">
                ${storiesHtml}
                ${message}
                <!-- Form Đăng bài viết & Ảnh -->
                <form method="POST">
                    <input type="hidden" name="action" value="create_post">
                    <textarea name="content" placeholder="Bạn đang nghĩ gì thế..." rows="2" style="width: 100%; background: #111; color: #fff; border: 1px solid #444; padding: 6px; box-sizing: border-box; font-size: 11px; border-radius: 4px; resize: none;"></textarea>
                    <input type="text" name="image_url" placeholder="Dán link ảnh đính kèm (tuỳ chọn)..." style="width: 100%; background: #111; color: #fff; border: 1px solid #444; padding: 4px; box-sizing: border-box; font-size: 10px; border-radius: 4px; margin-top: 4px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
                        <span style="font-size: 9px; color: #888;">📷 Hỗ trợ đăng ảnh & văn bản</span>
                        <button type="submit" class="btn" style="background: #00cc66; color: #fff; padding: 4px 12px; font-size: 11px; border: none; border-radius: 3px; cursor: pointer;">Đăng bài</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Popup Modal Đăng Story -->
        <div id="story-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.88); z-index: 999; justify-content: center; align-items: center; padding: 10px; box-sizing: border-box;">
            <div style="background: #111; border: 1px solid #444; width: 100%; max-width: 350px; padding: 12px; box-sizing: border-box;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 6px; margin-bottom: 8px;">
                    <b style="color: #00ff00; font-size: 12px;">📸 Đăng Story mới</b>
                    <button type="button" onclick="closeStoryModal()" style="background:none; border:none; color:#ff5555; font-weight:bold; cursor:pointer;">✕</button>
                </div>
                <form method="POST">
                    <input type="hidden" name="action" value="create_story">
                    <label style="color: #ccc; font-size: 10px; display: block; margin-bottom: 2px;">Link hình ảnh Story:</label>
                    <input type="text" name="image_url" placeholder="https://..." required style="width: 100%; background: #000; color: #fff; border: 1px solid #444; padding: 6px; box-sizing: border-box; margin-bottom: 8px; font-size: 11px;">
                    <label style="color: #ccc; font-size: 10px; display: block; margin-bottom: 2px;">Chú thích (Caption):</label>
                    <input type="text" name="caption" placeholder="Khoảnh khắc hôm nay..." style="width: 100%; background: #000; color: #fff; border: 1px solid #444; padding: 6px; box-sizing: border-box; margin-bottom: 8px; font-size: 11px;">
                    <button type="submit" class="btn" style="width: 100%; background: #0055ff; color: #fff; padding: 6px; font-size: 11px; border: none; border-radius: 3px;">Đăng Story</button>
                </form>
            </div>
        </div>

        <script>
            function openStoryModal() { document.getElementById('story-modal').style.display = 'flex'; }
            function closeStoryModal() { document.getElementById('story-modal').style.display = 'none'; }
        </script>

        ${postsHtml}
    `;

    return renderLayout(html, 'Bảng tin', user, request);
}
