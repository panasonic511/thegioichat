export async function handleMailBox(request, env, user, renderLayout) {
    // Tự động tạo bảng mail_box chuẩn hóa nếu chưa có
    try {
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS mail_box (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sender_id INTEGER,
                receiver_id INTEGER,
                message TEXT,
                is_read INTEGER DEFAULT 0,
                created_at TEXT
            )
        `).run();
    } catch (e) {}

    // Lấy danh sách những người mà user đã từng nhắn tin hoặc nhắn đến user
    let conversations = [];
    try {
        const query = `
            SELECT DISTINCT 
                CASE 
                    WHEN sender_id = ? THEN receiver_id 
                    ELSE sender_id 
                END as partner_id
            FROM mail_box 
            WHERE sender_id = ? OR receiver_id = ?
        `;
        const res = await env.DB.prepare(query).bind(user.id, user.id, user.id).all();
        if (res.results) {
            conversations = res.results;
        }
    } catch (e) {
        // Fallback tương thích với cấu trúc cũ user_id / partner_id nếu có
        try {
            const query2 = `
                SELECT DISTINCT 
                    CASE 
                        WHEN user_id = ? THEN partner_id 
                        ELSE user_id 
                    END as partner_id
                FROM mail_box 
                WHERE user_id = ? OR partner_id = ?
            `;
            const res2 = await env.DB.prepare(query2).bind(user.id, user.id, user.id).all();
            if (res2.results) conversations = res2.results;
        } catch (err) {}
    }

    let listHtml = '';
    if (conversations.length === 0) {
        listHtml = '<div style="text-align: center; color: #777; padding: 20px;">Hộp thư trống. Chưa có cuộc trò chuyện nào.</div>';
    } else {
        let partnersData = [];
        for (let c of conversations) {
            const pid = c.partner_id;
            if (!pid || Number(pid) === Number(user.id)) continue;

            let partner = null;
            try {
                partner = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(pid).first();
            } catch (e) {}

            if (!partner) continue;

            // Lấy tin nhắn mới nhất và kiểm tra xem có tin chưa đọc từ đối phương không
            let lastMsg = '';
            let unreadCount = 0;
            try {
                const msgRes = await env.DB.prepare(`
                    SELECT message, is_read, sender_id FROM mail_box 
                    WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
                    ORDER BY id DESC LIMIT 1
                `).bind(user.id, pid, pid, user.id).first();
                if (msgRes) {
                    lastMsg = msgRes.message || '';
                }

                const unreadRes = await env.DB.prepare(`
                    SELECT COUNT(*) as cnt FROM mail_box 
                    WHERE receiver_id = ? AND sender_id = ? AND is_read = 0
                `).bind(user.id, pid).first();
                if (unreadRes) {
                    unreadCount = unreadRes.cnt || 0;
                }
            } catch (err) {}

            partnersData.push({
                partner,
                lastMsg,
                unreadCount
            });
        }

        if (partnersData.length === 0) {
            listHtml = '<div style="text-align: center; color: #777; padding: 20px;">Hộp thư trống.</div>';
        } else {
            listHtml = partnersData.map((item, index) => {
                const p = item.partner;
                const pName = p.display_name || p.username || 'Thành viên';
                const pId = p.id;
                const defaultAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100' height='100' fill='%231a1a1a'/><circle cx='50' cy='38' r='18' fill='%2300ff00'/></svg>";
                const pAvatar = (p.avatar && !String(p.avatar).includes('7gXvS6v')) ? p.avatar : defaultAvatar;

                return `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px; border-bottom: 1px solid #222; background: ${index % 2 === 0 ? '#080808' : '#030303'};">
                    <div style="display: flex; align-items: center; gap: 10px; overflow: hidden;">
                        <img src="${pAvatar}" width="38" height="38" style="border-radius: 50%; object-fit: cover; border: 1px solid #444; flex-shrink: 0;">
                        <div style="overflow: hidden;">
                            <div style="font-weight: bold; font-size: 14px;">
                                <a href="/profile?user=${pId}" style="color: ${p.name_color || '#00ff00'};">${pName}</a>
                                ${item.unreadCount > 0 ? `<span style="background: #ff0000; color: #fff; font-size: 10px; padding: 1px 5px; border-radius: 10px; margin-left: 6px;">Mới (${item.unreadCount})</span>` : ''}
                            </div>
                            <div style="color: #aaa; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 260px; margin-top: 2px;">
                                ${item.lastMsg ? item.lastMsg : 'Nhấn để trò chuyện...'}
                            </div>
                        </div>
                    </div>
                    <div>
                        <a href="/mail/chat?user=${pId}" class="btn" style="background: #0044cc; color: #fff; padding: 6px 12px; font-size: 12px; border-radius: 4px; text-decoration: none;">Nhắn tin</a>
                    </div>
                </div>`;
            }).join('');
        }
    }

    const content = `
    <div class="box">
        <div class="box-title">✉️ Hộp thư tin nhắn</div>
        <div class="box-content" style="padding: 0;">
            ${listHtml}
        </div>
    </div>
    <div style="text-align: center; margin-top: 12px; font-size: 13px;">
        <a href="/">⬅ Về trang chủ</a>
    </div>
    `;

    return new Response(renderLayout('Hộp thư tin nhắn', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
