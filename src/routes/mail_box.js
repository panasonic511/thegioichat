import { renderUser } from '../worker.js';

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
                // Truy vấn đầy đủ tất cả các trường phong cách, icon và chức vụ của người dùng
                partner = await env.DB.prepare(`
                    SELECT id, username, display_name, avatar, border_color, avatar_glow, 
                           name_color, name_glow, name_border, name_border_glow, active_icon, role 
                    FROM users WHERE id = ?
                `).bind(pid).first();
            } catch (e) {}

            if (!partner) continue;

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
                const pId = p.id;

                // Sử dụng hàm renderUser để tự động tạo hiệu ứng tên, avatar, icon viền và hiệu ứng phát sáng chuẩn xác
                const rUser = renderUser(p);

                // Xây dựng logic hiển thị chức vụ: Ban quản trị (hoặc khác 'Thành Viên') có khung bo góc, Thành viên hiển thị chữ thanh lịch
                const roleDisplayHtml = (p.role && p.role !== 'Thành Viên') ? `
                    <span style="display: inline-block; background: #1a1a1a; border: 1px solid #444; color: #ffcc00; font-size: 9px; font-weight: bold; padding: 1px 5px; border-radius: 4px; text-shadow: 0 0 4px rgba(255,204,0,0.4); margin-top: 2px;">
                        ${p.role}
                    </span>
                ` : `
                    <span style="color: #888; font-size: 10px; margin-top: 2px;">${p.role || 'Thành viên'}</span>
                `;

                return `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px; border-bottom: 1px solid #222; background: ${index % 2 === 0 ? '#080808' : '#030303'};">
                    <div style="display: flex; align-items: center; gap: 10px; overflow: hidden;">
                        <div style="width: 38px; height: 38px; min-width: 38px; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center;">
                            ${rUser.avatarHtml.replace(/style="[^"]*"/gi, 'style="width: 38px; height: 38px; border-radius: 50%; object-fit: cover;"')}
                        </div>
                        <div style="overflow: hidden;">
                            <div style="font-size: 13px; display: flex; align-items: center; gap: 6px;">
                                <a href="/profile?user=${pId}" style="text-decoration: none;">${rUser.nameHtml}</a>
                                ${item.unreadCount > 0 ? `<span style="background: #ff0000; color: #fff; font-size: 9px; padding: 1px 5px; border-radius: 10px;">Mới (${item.unreadCount})</span>` : ''}
                            </div>
                            <div>
                                ${roleDisplayHtml}
                            </div>
                            <div style="color: #aaa; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 240px; margin-top: 2px;">
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
