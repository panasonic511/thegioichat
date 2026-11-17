export async function handleFeed(request, env, user, renderLayout) {
    if (request.method === 'POST') {
        const formData = await request.formData();
        const content = formData.get('content');
        
        if (content && content.trim() !== '') {
            await env.DB.prepare("INSERT INTO feeds (user_id, content) VALUES (?, ?)")
                .bind(user.id, content)
                .run();
        }
        return Response.redirect(302, '/users/feed');
    }

    const feeds = await env.DB.prepare(`
        SELECT feeds.*, users.display_name, users.avatar, users.role, users.level 
        FROM feeds 
        JOIN users ON feeds.user_id = users.id 
        ORDER BY feeds.id DESC 
        LIMIT 20
    `).all();

    const content = `
    <div class="box">
        <div class="box-title">📋 Bảng tin xã hội</div>
        <div class="box-content">
            <form method="POST" action="/users/feed">
                <textarea name="content" placeholder="Bạn đang nghĩ gì thế?" rows="3" required style="width: 100%; background: #000; color: #00ff00; border: 1px solid #444; padding: 8px; box-sizing: border-box; margin-bottom: 8px;"></textarea>
                <button type="submit" class="btn">Đăng bài</button>
            </form>
        </div>
    </div>

    <div class="box">
        <div class="box-title">📰 Bài viết gần đây</div>
        <div class="box-content">
            ${feeds.results.length === 0 ? '<div style="text-align: center; color: #888; padding: 15px;">Chưa có bài viết nào trên bảng tin!</div>' : 
                feeds.results.map(f => `
                <div style="border-bottom: 1px solid #333; margin-bottom: 12px; padding-bottom: 12px;">
                    <div style="display: flex; align-items: center; margin-bottom: 6px;">
                        <img src="${f.avatar}" width="32" height="32" style="border-radius: 50%; margin-right: 8px;">
                        <div>
                            <b>${f.display_name}</b> <span style="color: #ffcc00; font-size: 11px;">[Lv.${f.level}]</span> 
                            <span style="color: yellow; font-size: 11px;">(${f.role})</span>
                            <div style="font-size: 10px; color: #888;">${f.created_at}</div>
                        </div>
                    </div>
                    <div style="font-size: 13px; color: #fff; line-height: 1.4;">${f.content}</div>
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
