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

function getFallbackAvatar(seed = '#00ff00') {
    const safeFill = encodeURIComponent(String(seed || '#00ff00'));
    return `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100' height='100' fill='%23181818'/><circle cx='50' cy='38' r='18' fill='${safeFill}'/><path d='M20 84c4-16 18-24 30-24s26 8 30 24' fill='${safeFill}'/></svg>`;
}

function buildPartnerVisual(pObj) {
    const rendered = renderUser(pObj || {});
    const rawAv = pObj && pObj.avatar ? String(pObj.avatar).trim() : '';
    const avatarSrc = (rawAv && !rawAv.includes('7gXvS6v'))
        ? rawAv
        : getFallbackAvatar(pObj && pObj.name_color ? pObj.name_color : '#00ff00');

    const avatarStyle = rendered.avatarStyle
        ? `${rendered.avatarStyle}; width: 38px; height: 38px; border-radius: 50%; object-fit: cover; display: block;`
        : 'width: 38px; height: 38px; border-radius: 50%; object-fit: cover; border: 1px solid #00ff00; display: block;';

    return {
        nameHtml: rendered.nameHtml || escapeHtml((pObj && (pObj.display_name || pObj.username)) || 'Thành viên'),
        avatarSrc,
        avatarStyle
    };
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

        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS mail_typing_status (
                user_id INTEGER NOT NULL,
                target_user_id INTEGER NOT NULL,
                is_typing INTEGER DEFAULT 0,
                updated_at INTEGER DEFAULT 0,
                PRIMARY KEY (user_id, target_user_id)
            )
        `).run();
    } catch (e) {}

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

    const nowSec = Math.floor(Date.now() / 1000);
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
                           name_color, name_glow, name_border, name_border_glow, active_icon, role, is_admin, coins
                    FROM users WHERE id = ?
                `).bind(pid).first();
            } catch (e) {
                try {
                    partner = await env.DB.prepare(`
                        SELECT id, username, display_name, avatar, border_color, avatar_glow,
                               name_color, name_glow, name_border, name_border_glow, active_icon, role, is_admin
                        FROM users WHERE id = ?
                    `).bind(pid).first();
                } catch (e2) {}
            }

            if (!partner) continue;

            let lastMsgRow = null;
            let unreadCount = 0;
            let isTypingToMe = false;

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

                const typingRow = await env.DB.prepare(`
                    SELECT is_typing, updated_at
                    FROM mail_typing_status
                    WHERE user_id = ? AND target_user_id = ?
                    LIMIT 1
                `).bind(pid, user.id).first();

                if (typingRow && Number(typingRow.is_typing) === 1 && (nowSec - Number(typingRow.updated_at || 0)) <= 10) {
                    isTypingToMe = true;
                }
            } catch (err) {}

            partnersData.push({
                partner,
                lastMsgText: isTypingToMe ? 'Đang soạn tin nhắn...' : formatPreviewMessage(lastMsgRow, user.id),
                isTypingToMe,
                unreadCount,
                lastMsgId: Number(c.last_msg_id || 0)
            });
        }

        partnersData.sort((a, b) => b.lastMsgId - a.lastMsgId);

        if (partnersData.length === 0) {
            listHtml = '<div style="text-align: center; color: #777; padding: 20px;">Hộp thư trống.</div>';
        } else {
            listHtml = partnersData.map((item, index) => {
                const p = item.partner;
                const pId = Number(p.id);
                const visual = buildPartnerVisual(p);

                const unreadBadgeHtml = item.unreadCount > 0
                    ? `<span data-partner-badge="${pId}" style="background: #ff0000; color: #fff; font-size: 9px; padding: 1px 6px; border-radius: 10px; font-weight: bold;">Mới (${item.unreadCount})</span>`
                    : '';

                const previewColor = item.isTypingToMe
                    ? '#00ff88'
                    : (item.unreadCount > 0 ? '#eee' : '#aaa');

                return `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px; border-bottom: 1px solid #222; background: ${index % 2 === 0 ? '#080808' : '#030303'};">
                    <div style="display: flex; align-items: center; gap: 10px; overflow: hidden;">
                        <img src="${escapeHtml(visual.avatarSrc)}" alt="${escapeHtml(p.display_name || p.username || '')}" style="${escapeHtml(visual.avatarStyle)}">
                        <div style="overflow: hidden;">
                            <div style="font-size: 13px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                                <a href="/profile?user=${pId}" style="text-decoration: none;">${visual.nameHtml}</a>
                                ${unreadBadgeHtml}
                            </div>
                            <div style="color: ${previewColor}; font-weight: ${(item.unreadCount > 0 || item.isTypingToMe) ? 'bold' : 'normal'}; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 240px; margin-top: 2px;">
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
