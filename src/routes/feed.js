export async function handleFeed(request, env, user, renderLayout) {
    let message = "";

    if (request.method === 'POST') {
        const formData = await request.formData();
        const action = formData.get('action');
        if (action === 'post') {
            const contentText = formData.get('content');
            const imageUrl = formData.get('image_url');
            if (contentText || imageUrl) {
                try {
                    await env.DB.prepare("INSERT INTO feeds (user_id, content, image_url) VALUES (?, ?, ?)").bind(user.id, contentText || '', imageUrl || '').run();
                    message = `<div style="color: #00ff00; text-align: center; margin-bottom: 6px;">✅ Đăng bài thành công!</div>`;
                } catch (e) {}
            }
        } else if (action === 'delete') {
            const feedId = formData.get('feed_id');
            const post = await env.DB.prepare("SELECT * FROM feeds WHERE id = ?").bind(feedId).first();
            if (post && (user.role === 'Chủ Wap' || user.role === 'Admin' || user.role === 'Mod' || post.user_id === user.id)) {
                await env.DB.prepare("DELETE FROM feeds WHERE id = ?").bind(feedId).run();
            }
        }
    }

    let feeds = { results: [] };
    try {
        feeds = await env.DB.prepare(`
            SELECT f.*, u.display_name, u.avatar, u.role, u.level, u.name_color, u.name_glow, u.name_border, u.name_border_glow, u.border_color, u.avatar_glow
            FROM feeds f 
            JOIN users u ON f.user_id = u.id 
            ORDER BY f.id DESC 
            LIMIT 20
        `).all();
    } catch (e) {}

    const isAdminOrMod = (user.role === 'Chủ Wap' || user.role === 'Admin' || user.role === 'Mod');
    const defaultAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100' height='100' fill='%231a1a1a'/><circle cx='50' cy='38' r='18' fill='%2300ff00'/><path d='M20 88 C20 65, 80 65, 80 88' fill='%2300ff00'/></svg>";

    const content = `
    <div class="box">
        <div class="box-title">📝 Đăng lên Bảng tin</div>
        <div class="box-content">
            ${message}
            <form method="POST">
                <input type="hidden" name="action" value="post">
                <textarea name="content" rows="2" placeholder="Bạn đang nghĩ gì thế..." style="width: 100%; background: #000; color: #00ff00; border: 1px solid #444; padding: 6px; box-sizing: border-box; font-size: 11px; margin-bottom: 6px;"></textarea>
                <input type="text" name="image_url" placeholder="🔗 Link ảnh đính kèm (https://...)" style="width: 100%; background: #000; color: #00ff00; border: 1px solid #444; padding: 6px; box-sizing: border-box; font-size: 11px; margin-bottom: 6px;">
                <button type="submit" class="btn" style="width: 100%; background: #0055ff; color: #fff;">Đăng bài</button>
            </form>
        </div>
    </div>

    <div class="box">
        <div class="box-title">📋 Bảng tin hoạt động</div>
        <div class="box-content" style="padding: 4px;">
            ${feeds.results.length === 0 ? '<div style="text-align: center; color: #888; padding: 15px;">Chưa có bài viết nào!</div>' : 
                feeds.results.map(f => {
                    const userAvt = (f.avatar && !f.avatar.includes('7gXvS6v')) ? f.avatar : defaultAvatar;
                    
                    // Render style cho tên và avatar trên bảng tin
                    const nameColor = f.name_color || '#00ff00';
                    let nStyle = `color: ${nameColor}; font-weight: bold;`;
                    let sh = [];
                    if (f.name_glow && f.name_glow !== '#000000') sh.push(`0 0 6px ${f.name_glow}`);
                    if (f.name_border_glow && f.name_border_glow !== '#000000') sh.push(`0 0 4px ${f.name_border_glow}`);
                    if (sh.length > 0) nStyle += ` text-shadow: ${sh.join(', ')};`;
                    if (f.name_border && f.name_border !== '#000000') nStyle += ` -webkit-text-stroke: 0.5px ${f.name_border};`;

                    const bColor = f.border_color || '#ffcc00';
                    let aStyle = `border-radius: 50%; object-fit: cover; border: 2px solid ${bColor};`;
                    if (f.avatar_glow && f.avatar_glow !== '#000000') aStyle += ` box-shadow: 0 0 10px ${f.avatar_glow};`;

                    return `
                    <div style="border-bottom: 1px solid #222; padding: 8px 4px; margin-bottom: 6px;">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                            <div style="display: flex; align-items: center;">
                                <a href="/profile?user=${f.user_id}"><img src="${userAvt}" width="28" height="28" style="${aStyle} margin-right: 6px;"></a>
                                <div>
                                    <a href="/profile?user=${f.user_id}" style="${nStyle}">${f.display_name}</a> <span style="color: #ffcc00; font-size: 10px;">[Lv.${f.level}]</span> 
                                    <span style="color: yellow; font-size: 10px;">(${f.role})</span>
                                </div>
                            </div>
                            ${(isAdminOrMod || f.user_id === user.id) ? `
                            <form method="POST" style="margin: 0;" onsubmit="return confirm('Xóa bài này?');">
                                <input type="hidden" name="action" value="delete">
                                <input type="hidden" name="feed_id" value="${f.id}">
                                <button type="submit" style="background: none; border: none; color: #ff5555; cursor: pointer; font-size: 11px;">[Xóa]</button>
                            </form>` : ''}
                        </div>
                        ${f.content ? `<div style="font-size: 12px; color: #fff; margin-bottom: 6px; word-break: break-all;">${f.content}</div>` : ''}
                        ${f.image_url ? `<div style="margin-top: 4px; text-align: center; background: #000; padding: 4px; border: 1px solid #333;"><img src="${f.image_url}" style="max-width: 100%; max-height: 250px;"></div>` : ''}
                    </div>
                `}).join('')}
        </div>
    </div>
    <div style="text-align: center;"><a href="/">⬅️ Về trang chủ</a></div>
    `;

    return new Response(renderLayout('Bảng tin', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
