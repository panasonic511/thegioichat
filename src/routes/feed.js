export async function handleFeed(request, env, user, renderLayout) {
    let message = "";

    if (request.method === 'POST') {
        const formData = await request.formData();
        const action = formData.get('action');

        // Đăng bài viết mới kèm ảnh
        if (action === 'post') {
            const contentText = formData.get('content');
            const imageUrl = formData.get('image_url');

            if (!contentText && !imageUrl) {
                message = `<div style="color: #ff5555; text-align: center; margin-bottom: 6px;">❌ Vui lòng nhập nội dung hoặc đính kèm ảnh!</div>`;
            } else {
                try {
                    // Tự động thêm cột image_url nếu chưa có
                    try { await env.DB.prepare("ALTER TABLE feeds ADD COLUMN image_url TEXT;").run(); } catch(e) {}

                    await env.DB.prepare("INSERT INTO feeds (user_id, content, image_url) VALUES (?, ?, ?)")
                        .bind(user.id, contentText || '', imageUrl || '')
                        .run();
                    message = `<div style="color: #00ff00; text-align: center; margin-bottom: 6px;">✅ Đăng bài lên bảng tin thành công!</div>`;
                } catch (e) {
                    message = `<div style="color: #ff5555; text-align: center; margin-bottom: 6px;">❌ Lỗi: ${e.message}</div>`;
                }
            }
        } 
        // Quản trị viên xóa bài viết
        else if (action === 'delete') {
            const feedId = formData.get('feed_id');
            // Kiểm tra quyền (Chủ Wap, Admin, Mod hoặc chính chủ bài viết)
            const post = await env.DB.prepare("SELECT * FROM feeds WHERE id = ?").bind(feedId).first();
            
            if (post && (user.role === 'Chủ Wap' || user.role === 'Admin' || user.role === 'Mod' || post.user_id === user.id)) {
                await env.DB.prepare("DELETE FROM feeds WHERE id = ?").bind(feedId).run();
                message = `<div style="color: #ffcc00; text-align: center; margin-bottom: 6px;">⚠️ Đã xóa bài viết thành công!</div>`;
            } else {
                message = `<div style="color: #ff5555; text-align: center; margin-bottom: 6px;">❌ Bạn không có quyền xóa bài này!</div>`;
            }
        }
    }

    // Lấy danh sách bài viết từ database kèm thông tin user
    let feeds = { results: [] };
    try {
        feeds = await env.DB.prepare(`
            SELECT f.*, u.display_name, u.avatar, u.role, u.level 
            FROM feeds f 
            JOIN users u ON f.user_id = u.id 
            ORDER BY f.id DESC 
            LIMIT 20
        `).all();
    } catch (e) {
        feeds = { results: [] };
    }

    const isAdminOrMod = (user.role === 'Chủ Wap' || user.role === 'Admin' || user.role === 'Mod');

    const content = `
    <!-- Form đăng bài viết mới -->
    <div class="box">
        <div class="box-title">📝 Đăng lên Bảng tin</div>
        <div class="box-content">
            ${message}
            <form method="POST">
                <input type="hidden" name="action" value="post">
                <textarea name="content" rows="2" placeholder="Bạn đang nghĩ gì thế..." style="width: 100%; background: #000; color: #00ff00; border: 1px solid #444; padding: 6px; box-sizing: border-box; font-family: Arial; font-size: 11px; margin-bottom: 6px;"></textarea>
                
                <input type="text" name="image_url" placeholder="🔗 Dán link ảnh đính kèm (Tuỳ chọn: https://...)" style="width: 100%; background: #000; color: #00ff00; border: 1px solid #444; padding: 6px; box-sizing: border-box; font-size: 11px; margin-bottom: 6px;">
                
                <button type="submit" class="btn" style="width: 100%; background: #0055ff; color: #fff;">Đăng bài</button>
            </form>
        </div>
    </div>

    <!-- Danh sách bảng tin -->
    <div class="box">
        <div class="box-title">📋 Bảng tin hoạt động</div>
        <div class="box-content" style="padding: 4px;">
            ${feeds.results.length === 0 ? '<div style="text-align: center; color: #888; padding: 15px;">Chưa có bài viết nào trên bảng tin!</div>' : 
                feeds.results.map(f => `
                <div style="border-bottom: 1px solid #222; padding: 8px 4px; margin-bottom: 6px;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                        <div style="display: flex; align-items: center;">
                            <img src="${f.avatar || 'https://i.imgur.com/7gXvS6v.png'}" width="28" height="28" style="border-radius: 50%; margin-right: 6px;">
                            <div>
                                <b style="color: #00ff00;">${f.display_name}</b> <span style="color: #ffcc00; font-size: 10px;">[Lv.${f.level}]</span> 
                                <span style="color: yellow; font-size: 10px;">(${f.role})</span>
                            </div>
                        </div>
                        ${(isAdminOrMod || f.user_id === user.id) ? `
                        <form method="POST" style="margin: 0;" onsubmit="return confirm('Bạn có chắc muốn xóa bài này không?');">
                            <input type="hidden" name="action" value="delete">
                            <input type="hidden" name="feed_id" value="${f.id}">
                            <button type="submit" style="background: none; border: none; color: #ff5555; cursor: pointer; font-size: 11px;">[Xóa]</button>
                        </form>` : ''}
                    </div>
                    
                    ${f.content ? `<div style="font-size: 12px; color: #fff; margin-bottom: 6px; word-break: break-all;">${f.content}</div>` : ''}
                    
                    ${f.image_url ? `
                    <div style="margin-top: 4px; text-align: center; background: #000; padding: 4px; border: 1px solid #333;">
                        <img src="${f.image_url}" style="max-width: 100%; max-height: 250px; border-radius: 2px;">
                    </div>` : ''}
                </div>
            `).join('')}
        </div>
    </div>
    <div style="text-align: center;"><a href="/">⬅️ Về trang chủ</a></div>
    `;

    return new Response(renderLayout('Bảng tin', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
