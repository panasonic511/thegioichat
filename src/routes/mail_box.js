import { renderUser } from '../worker.js';

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatPreviewMessage(msgRow, currentUserId) {
    if (!msgRow) return 'Nhấn để trò chuyện...';

    const senderId = msgRow.sender_id !== undefined && msgRow.sender_id !== null
        ? Number(msgRow.sender_id)
        : Number(msgRow.user_id);
    const isMe = senderId === Number(currentUserId);
    const prefix = isMe ? 'Bạn: ' : '';

    const rawText = (msgRow.message || '').trim();
    const hasImage = Boolean(msgRow.image_url && String(msgRow.image_url).trim() !== '');
    const isGif = /^https?:\/\//i.test(rawText) &&
        (rawText.includes('.gif') || rawText.includes('giphy') || rawText.includes('tenor'));

    if (isGif) {
        return `${prefix}[GIF]`;
    }
    if (hasImage && !rawText) {
        return `${prefix}[Hình ảnh]`;
    }
    if (hasImage && rawText) {
        return `${prefix}[Ảnh] ${rawText}`;
    }
    return `${prefix}${rawText || 'Nhấn để trò chuyện...'}`;
}

export async function handleMailBox(request, env, user, renderLayout) {
    // Tự động tạo bảng mail_box chuẩn hóa nếu chưa có
    try {
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS mail_box (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sender_id INTEGER,
                receiver_id INTEGER,
                message TEXT,
                image_url TEXT,
                is_read INTEGER DEFAULT 0,
                created_at TEXT
            )
        `).run();

        try {
            await env.DB.prepare("ALTER TABLE mail_box ADD COLUMN image_url TEXT").run();
        } catch (e) {}

        try {
            await env.DB.prepare("ALTER TABLE mail_box ADD COLUMN is_read INTEGER DEFAULT 0").run();
        } catch (e) {}
    } catch (e) {}

    // Xác định schema cột đang dùng trong mail_box
    let useLegacyCols = false;
    let conversations = [];

    try {
        const query = `
            SELECT
                CASE
                    WHEN sender_id = ? THEN receiver_id
                    ELSE sender_id
                END as partner_id,
                MAX(id) as last_msg_id
            FROM mail_box
            WHERE sender_id = ? OR receiver_id = ?
            GROUP BY partner_id
            ORDER BY last_msg_id DESC
        `;
        const res = await env.DB.prepare(query).bind(user.id, user.id, user.id).all();
        if (res && Array.isArray(res.results)) {
            conversations = res.results;
        }
    } catch (e) {
        useLegacyCols = true;
    }

    if (useLegacyCols || conversations.length === 0) {
        try {
            const query2 = `
                SELECT
                    CASE
                        WHEN user_id = ? THEN partner_id
                        ELSE user_id
                    END as partner_id,
                    MAX(id) as last_msg_id
                FROM mail_box
                WHERE user_id = ? OR partner_id = ?
                GROUP BY partner_id
                ORDER BY last_msg_id DESC
            `;
            const res2 = await env.DB.prepare(query2).bind(user.id, user.id, user.id).all();
            if (res2 && Array.isArray(res2.results) && res2.results.length > 0) {
                conversations = res2.results;
                useLegacyCols = true;
            }
        } catch (err) {}
    }

    let listHtml = '';

    if (!conversations || conversations.length === 0) {
        listHtml = '<div style="text-align: center; color: #777; padding: 20px;">Hộp thư trống. Chưa có cuộc trò chuyện nào.</div>';
    } else {
        const partnersData = [];

        for (const c of conversations) {
            const pid = Number(c.partner_id);
            if (!pid || Number.isNaN(pid) || pid === Number(user.id)) continue;

            let partner = null;
            try {
                partner = await env.DB.prepare(`
                    SELECT id, username, display_name, avatar, border_color, avatar_glow,
                           name_color, name_glow, name_border, name_border_glow, active_icon, role
                    FROM users WHERE id = ?
                `).bind(pid).first();
            } catch (e) {}

            if (!partner) continue;

            let lastMsgRow = null;
            let unreadCount = 0;

            try {
                if (!useLegacyCols) {
                    lastMsgRow = await env.DB.prepare(`
                        SELECT sender_id, message, image_url, is_read
                        FROM mail_box
                        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
                        ORDER BY id DESC LIMIT 1
                    `).bind(user.id, pid, pid, user.id).first();

                    const unreadRes = await env.DB.prepare(`
                        SELECT COUNT(*) as cnt
                        FROM mail_box
                        WHERE receiver_id = ? AND sender_id = ? AND (is_read IS NULL OR is_read = 0)
                    `).bind(user.id, pid).first();

                    unreadCount = unreadRes ? Number(unreadRes.cnt || 0) : 0;
                } else {
                    lastMsgRow = await env.DB.prepare(`
                        SELECT user_id, partner_id, message, image_url, is_read
                        FROM mail_box
                        WHERE (user_id = ? AND partner_id = ?) OR (user_id = ? AND partner_id = ?)
                        ORDER BY id DESC LIMIT 1
                    `).bind(user.id, pid, pid, user.id).first();

                    const unreadRes = await env.DB.prepare(`
                        SELECT COUNT(*) as cnt
                        FROM mail_box
                        WHERE user_id = ? AND partner_id = ? AND (is_read IS NULL OR is_read = 0)
                    `).bind(user.id, pid).first();

                    unreadCount = unreadRes ? Number(unreadRes.cnt || 0) : 0;
                }
            } catch (err) {}

            partnersData.push({
                partner,
                lastMsgText: formatPreviewMessage(lastMsgRow, user.id),
                unreadCount,
                lastMsgId: Number(c.last_msg_id || 0)
            });
        }

        // Sắp xếp lại lần nữa theo tin nhắn mới nhất lên đầu
        partnersData.sort((a, b) => b.lastMsgId - a.lastMsgId);

        if (partnersData.length === 0) {
            listHtml = '<div style="text-align: center; color: #777; padding: 20px;">Hộp thư trống.</div>';
        } else {
            listHtml = partnersData.map((item, index) => {
                const p = item.partner;
                const pId = Number(p.id);
                const rUser = renderUser(p);

                const roleName = p.role || 'Thành viên';
                const roleDisplayHtml = (roleName && roleName !== 'Thành Viên' && roleName !== 'Thành viên') ? `
                    <span style="display: inline-block; background: #1a1a1a; border: 1px solid #444; color: #ffcc00; font-size: 9px; font-weight: bold; padding: 1px 5px; border-radius: 4px; text-shadow: 0 0 4px rgba(255,204,0,0.4); margin-top: 2px;">
                        ${escapeHtml(roleName)}
                    </span>
                ` : `
                    <span style="color: #888; font-size: 10px; margin-top: 2px;">${escapeHtml(roleName)}</span>
                `;

                const unreadBadgeHtml = item.unreadCount > 0
                    ? `<span data-partner-badge="${pId}" style="background: #ff0000; color: #fff; font-size: 9px; padding: 1px 6px; border-radius: 10px; font-weight: bold;">Mới (${item.unreadCount})</span>`
                    : '';

                return `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px; border-bottom: 1px solid #222; background: ${index % 2 === 0 ? '#080808' : '#030303'};">
                    <div style="display: flex; align-items: center; gap: 10px; overflow: hidden;">
                        <div style="width: 38px; height: 38px; min-width: 38px; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center;">
                            ${rUser.avatarHtml.replace(/style="[^"]*"/gi, 'style="width: 38px; height: 38px; border-radius: 50%; object-fit: cover;"')}
                        </div>
                        <div style="overflow: hidden;">
                            <div style="font-size: 13px; display: flex; align-items: center; gap: 6px;">
                                <a href="/profile?user=${pId}" style="text-decoration: none;">${rUser.nameHtml}</a>
                                ${unreadBadgeHtml}
                            </div>
                            <div>
                                ${roleDisplayHtml}
                            </div>
                            <div style="color: ${item.unreadCount > 0 ? '#eee' : '#aaa'}; font-weight: ${item.unreadCount > 0 ? 'bold' : 'normal'}; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 240px; margin-top: 2px;">
                                ${escapeHtml(item.lastMsgText)}
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
