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

function buildUserVisual(uObj) {
    const rendered = renderUser(uObj || {});
    const rawAv = uObj && uObj.avatar ? String(uObj.avatar).trim() : '';
    const avatarSrc = (rawAv && !rawAv.includes('7gXvS6v'))
        ? rawAv
        : getFallbackAvatar(uObj && uObj.name_color ? uObj.name_color : '#00ff00');

    const avatarStyle = rendered.avatarStyle
        ? `${rendered.avatarStyle}; width: 36px; height: 36px; border-radius: 50%; object-fit: cover; display: block;`
        : 'width: 36px; height: 36px; border-radius: 50%; object-fit: cover; border: 1px solid #00ff00; display: block;';

    return {
        nameHtml: rendered.nameHtml || escapeHtml((uObj && (uObj.display_name || uObj.username)) || 'Thành viên'),
        avatarSrc,
        avatarStyle
    };
}

export async function handleMailChat(request, env, user, renderLayout, url) {
    const partnerIdParam = url.searchParams.get('user');
    if (!partnerIdParam) {
        return Response.redirect(new URL('/mail/box', request.url), 302);
    }

    const partnerId = parseInt(partnerIdParam, 10);
    if (!partnerId || Number.isNaN(partnerId)) {
        return Response.redirect(new URL('/mail/box', request.url), 302);
    }

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

    const markPartnerMessagesRead = async () => {
        try {
            await env.DB.prepare(
                "UPDATE mail_box SET is_read = 1 WHERE receiver_id = ? AND sender_id = ? AND (is_read IS NULL OR is_read = 0)"
            ).bind(user.id, partnerId).run();
        } catch (err1) {
            try {
                await env.DB.prepare(
                    "UPDATE mail_box SET is_read = 1 WHERE user_id = ? AND partner_id = ? AND (is_read IS NULL OR is_read = 0)"
                ).bind(user.id, partnerId).run();
            } catch (err2) {}
        }
    };

    const countOtherUnreadSenders = async () => {
        try {
            const res = await env.DB.prepare(`
                SELECT COUNT(DISTINCT sender_id) as cnt
                FROM mail_box
                WHERE receiver_id = ?
                  AND sender_id != ?
                  AND (is_read IS NULL OR is_read = 0)
            `).bind(user.id, partnerId).first();
            return res ? Number(res.cnt || 0) : 0;
        } catch (err1) {
            try {
                const res2 = await env.DB.prepare(`
                    SELECT COUNT(DISTINCT partner_id) as cnt
                    FROM mail_box
                    WHERE user_id = ?
                      AND partner_id != ?
                      AND (is_read IS NULL OR is_read = 0)
                `).bind(user.id, partnerId).first();
                return res2 ? Number(res2.cnt || 0) : 0;
            } catch (err2) {
                return 0;
            }
        }
    };

    const setMyTypingState = async (isTyping) => {
        try {
            const nowSec = Math.floor(Date.now() / 1000);
            await env.DB.prepare(`
                INSERT INTO mail_typing_status (user_id, target_user_id, is_typing, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id, target_user_id)
                DO UPDATE SET is_typing = excluded.is_typing, updated_at = excluded.updated_at
            `).bind(user.id, partnerId, isTyping ? 1 : 0, nowSec).run();
        } catch (e) {}
    };

    const checkPartnerTypingFromDb = async () => {
        try {
            const nowSec = Math.floor(Date.now() / 1000);
            const row = await env.DB.prepare(`
                SELECT is_typing, updated_at
                FROM mail_typing_status
                WHERE user_id = ? AND target_user_id = ?
                LIMIT 1
            `).bind(partnerId, user.id).first();

            return Boolean(row && Number(row.is_typing) === 1 && (nowSec - Number(row.updated_at || 0)) <= 12);
        } catch (e) {
            return false;
        }
    };

    if (request.method === 'POST') {
        try {
            const formData = await request.formData();
            const action = String(formData.get('action') || '').trim();

            if (action === 'typing_status') {
                const typingFlag = String(formData.get('is_typing') || '0') === '1';
                await setMyTypingState(typingFlag);
                return new Response(JSON.stringify({ success: true, is_typing: typingFlag ? 1 : 0 }), {
                    headers: { 'Content-Type': 'application/json;charset=UTF-8' }
                });
            }

            if (action === 'check_typing') {
                const partnerTyping = await checkPartnerTypingFromDb();
                const otherUnreadCount = await countOtherUnreadSenders();
                return new Response(JSON.stringify({
                    success: true,
                    partner_typing: partnerTyping ? 1 : 0,
                    other_unread_count: otherUnreadCount
                }), {
                    headers: { 'Content-Type': 'application/json;charset=UTF-8' }
                });
            }

            const rawMessage = formData.get('message');
            const rawImageUrl = formData.get('image_url');

            const message = rawMessage ? String(rawMessage).trim() : '';
            const imageUrl = rawImageUrl ? String(rawImageUrl).trim() : '';

            if (message !== '' || imageUrl !== '') {
                try {
                    await env.DB.prepare(
                        "INSERT INTO mail_box (sender_id, receiver_id, message, image_url, is_read, created_at) VALUES (?, ?, ?, ?, 0, datetime('now'))"
                    ).bind(user.id, partnerId, message, imageUrl).run();
                } catch (err) {
                    await env.DB.prepare(
                        "INSERT INTO mail_box (user_id, partner_id, message, image_url, is_read, created_at) VALUES (?, ?, ?, ?, 0, datetime('now'))"
                    ).bind(user.id, partnerId, message, imageUrl).run();
                }

                await setMyTypingState(false);
                await markPartnerMessagesRead();
            }

            if (request.headers.get('X-Requested-With') === 'XMLHttpRequest') {
                return new Response(JSON.stringify({ success: true }), {
                    headers: { 'Content-Type': 'application/json;charset=UTF-8' }
                });
            }
        } catch (e) {
            if (request.headers.get('X-Requested-With') === 'XMLHttpRequest') {
                return new Response(JSON.stringify({ success: false }), {
                    headers: { 'Content-Type': 'application/json;charset=UTF-8' }
                });
            }
        }
        return Response.redirect(new URL(`/mail/chat?user=${partnerId}`, request.url), 302);
    }

    let partner = null;
    try {
        partner = await env.DB.prepare(`
            SELECT id, username, display_name, avatar, border_color, avatar_glow,
                   name_color, name_glow, name_border, name_border_glow, active_icon, role, is_admin, coins
            FROM users WHERE id = ?
        `).bind(partnerId).first();
    } catch (e) {
        try {
            partner = await env.DB.prepare(`
                SELECT id, username, display_name, avatar, border_color, avatar_glow,
                       name_color, name_glow, name_border, name_border_glow, active_icon, role, is_admin
                FROM users WHERE id = ?
            `).bind(partnerId).first();
        } catch (e2) {}
    }

    if (!partner) {
        return new Response("Không tìm thấy thành viên này.", { status: 404 });
    }

    await markPartnerMessagesRead();

    let messages = [];
    try {
        const history = await env.DB.prepare(`
            SELECT * FROM mail_box
            WHERE (sender_id = ? AND receiver_id = ?)
               OR (sender_id = ? AND receiver_id = ?)
            ORDER BY id ASC
        `).bind(user.id, partnerId, partnerId, user.id).all();

        if (history.results && history.results.length > 0) {
            messages = history.results;
        } else {
            const history2 = await env.DB.prepare(`
                SELECT * FROM mail_box
                WHERE (user_id = ? AND partner_id = ?)
                   OR (user_id = ? AND partner_id = ?)
                ORDER BY id ASC
            `).bind(user.id, partnerId, partnerId, user.id).all();
            messages = history2.results || [];
        }
    } catch (e) {}

    const partnerVisual = buildUserVisual(partner);
    const currentUserVisual = buildUserVisual(user);

    const renderMessageHtml = (m, currentUserObj, partnerObj) => {
        const sender = m.sender_id || m.user_id;
        const isMe = Number(sender) === Number(currentUserObj.id);
        const isRead = Number(m.is_read || 0) === 1;

        const msgUser = isMe ? currentUserObj : partnerObj;
        const vUser = isMe ? currentUserVisual : partnerVisual;

        const rawMsg = m.message || '';
        const isGifLink = /^https?:\/\//i.test(rawMsg) &&
            (rawMsg.includes('.gif') || rawMsg.includes('giphy') || rawMsg.includes('tenor'));

        const messageBodyHtml = isGifLink
            ? `<img src="${escapeHtml(rawMsg)}" style="max-width: 140px; max-height: 140px; border-radius: 6px; display: block;" />`
            : `<div>${escapeHtml(rawMsg)}</div>`;

        const imageTag = m.image_url
            ? `<div style="margin-top: 8px;"><img src="${escapeHtml(m.image_url)}" style="max-width: 100%; max-height: 300px; border-radius: 6px; object-fit: contain; display: block;"></div>`
            : '';

        const readReceiptHtml = isMe
            ? `<div style="font-size: 11px; margin-top: 3px; color: ${isRead ? '#00ff88' : '#888'}; font-weight: ${isRead ? 'bold' : 'normal'};">${isRead ? '✓✓ Đã xem' : '✓ Đã gửi'}</div>`
            : '';

        return `
        <div style="display: flex; flex-direction: column; align-items: ${isMe ? 'flex-end' : 'flex-start'};">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
                <img src="${escapeHtml(vUser.avatarSrc)}" alt="${escapeHtml(msgUser.display_name || msgUser.username || '')}" style="${escapeHtml(vUser.avatarStyle)}">
                <div style="font-size: 13px; display: flex; align-items: center; flex-wrap: wrap; font-weight: bold;">
                    ${vUser.nameHtml}
                </div>
            </div>
            <div style="max-width: 80%; background: ${isMe ? '#1a3300' : '#1a1a1a'}; border: 1px solid ${isMe ? '#339900' : '#333'}; padding: 10px 14px; border-radius: 8px; color: #fff; font-size: 15px; word-break: break-word; line-height: 1.4;">
                ${messageBodyHtml}
                ${imageTag}
            </div>
            ${readReceiptHtml}
        </div>`;
    };

    const safeCurrentUserJson = JSON.stringify({
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        avatar: currentUserVisual.avatarSrc,
        avatarStyle: currentUserVisual.avatarStyle,
        nameHtml: currentUserVisual.nameHtml,
        border_color: user.border_color,
        avatar_glow: user.avatar_glow,
        name_color: user.name_color,
        name_glow: user.name_glow,
        name_border: user.name_border,
        name_border_glow: user.name_border_glow,
        active_icon: user.active_icon,
        role: user.role,
        is_admin: user.is_admin
    }).replace(/</g, '\\u003c');

    const safePartnerJson = JSON.stringify({
        id: partner.id,
        username: partner.username,
        display_name: partner.display_name,
        avatar: partnerVisual.avatarSrc,
        avatarStyle: partnerVisual.avatarStyle,
        nameHtml: partnerVisual.nameHtml,
        border_color: partner.border_color,
        avatar_glow: partner.avatar_glow,
        name_color: partner.name_color,
        name_glow: partner.name_glow,
        name_border: partner.name_border,
        name_border_glow: partner.name_border_glow,
        active_icon: partner.active_icon,
        role: partner.role,
        is_admin: partner.is_admin
    }).replace(/</g, '\\u003c');

    const chatUrlSafe = `/mail/chat?user=${Number(partnerId)}`;

    const content = `
    <div id="pjax-main-content" data-pjax-url="${escapeHtml(chatUrlSafe)}">
        <div class="box" id="mailChatRoot" style="position: relative;">
            <div class="box-title" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 15px; flex-wrap: wrap;">
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span>🟢 Trò chuyện với</span>
                    ${partnerVisual.nameHtml}
                </div>
            </div>
            <div class="box-content" style="padding: 10px;">

                <div id="chatMessageBox" style="height: 420px; overflow-y: scroll; background: #000; border: 1px solid #333; padding: 12px; display: flex; flex-direction: column; gap: 14px; margin-bottom: 8px;">
                    ${messages.length === 0
                        ? '<div id="no-msg" style="color: #777; text-align: center; margin-top: 170px; font-size: 14px;">Chưa có tin nhắn nào. Hãy gửi tin nhắn mở lời!</div>'
                        : messages.map(m => renderMessageHtml(m, user, partner)).join('')}
                </div>

                <div id="partnerTypingIndicator" style="display: none; align-items: center; gap: 6px; font-size: 12px; color: #00ff88; padding: 2px 4px 8px 4px; min-height: 18px; font-weight: bold;">
                    <span style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #00ff88;"></span>
                    <span id="partnerTypingText">${escapeHtml(partner.display_name || partner.username || 'Đối phương')} đang nhập nội dung...</span>
                </div>

                <form id="chatForm" style="display: flex; flex-direction: column; gap: 8px; position: relative;">
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <label style="display: inline-flex; align-items: center; justify-content: center; background: #1a1a1a; border: 1px solid #444; color: #00ff00; width: 40px; height: 40px; border-radius: 6px; cursor: pointer; font-size: 20px;" title="Gửi ảnh">
                            📷
                            <input type="file" id="chatImageInput" accept="image/*" style="display: none;">
                        </label>
                        <input type="hidden" id="chat-image-val" name="image_url">

                        <input type="text" name="message" id="messageInput" placeholder="Nhập nội dung chát..." autocomplete="off" style="flex: 1; background: #000; color: #fff; border: 1px solid #444; padding: 10px 12px; font-size: 14px; box-sizing: border-box; border-radius: 6px;">

                        <button type="button" id="gifToggleBtn" class="btn" style="background: #333; color: #ffcc00; padding: 10px 12px; font-size: 14px; border-radius: 6px; cursor: pointer; border: 1px solid #551a8b;" title="Kho Sticker GIF Meme">🎁 GIF</button>

                        <button type="submit" id="sendBtn" class="btn" style="background: #0055ff; color: #fff; padding: 10px 18px; font-size: 14px; border-radius: 6px; cursor: pointer; font-weight: bold;">Gửi</button>
                    </div>

                    <div id="gifPopup" style="display: none; position: absolute; bottom: 55px; right: 0; background: #111; border: 1px solid #444; padding: 10px; border-radius: 8px; width: 300px; max-height: 220px; overflow-y: auto; box-shadow: 0 4px 15px rgba(0,0,0,0.8); z-index: 999; grid-template-columns: repeat(3, 1fr); gap: 8px;">
                        <div style="grid-column: span 3; font-size: 12px; color: #ffcc00; font-weight: bold; border-bottom: 1px solid #333; padding-bottom: 4px; display: flex; justify-content: space-between; align-items: center;">
                            <span>😂 Kho GIF Meme & Đáng Yêu</span>
                            <span id="gifCloseBtn" style="cursor: pointer; color: #ff5555; padding: 0 4px;">✕</span>
                        </div>
                        <img src="https://media.giphy.com/media/26vUDlO9wK7fyOpls/giphy.gif" data-gif-url="https://media.giphy.com/media/26vUDlO9wK7fyOpls/giphy.gif" style="width: 100%; height: 70px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #333;">
                        <img src="https://media.giphy.com/media/3o7TKoWXm3okO1kgHC/giphy.gif" data-gif-url="https://media.giphy.com/media/3o7TKoWXm3okO1kgHC/giphy.gif" style="width: 100%; height: 70px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #333;">
                        <img src="https://media.giphy.com/media/l0HlvcHy69b5H9e9i/giphy.gif" data-gif-url="https://media.giphy.com/media/l0HlvcHy69b5H9e9i/giphy.gif" style="width: 100%; height: 70px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #333;">
                        <img src="https://media.giphy.com/media/3oKIPnAiaMCws8nOsE/giphy.gif" data-gif-url="https://media.giphy.com/media/3oKIPnAiaMCws8nOsE/giphy.gif" style="width: 100%; height: 70px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #333;">
                        <img src="https://media.giphy.com/media/xT5LMFZDsj0AKUDYTS/giphy.gif" data-gif-url="https://media.giphy.com/media/xT5LMFZDsj0AKUDYTS/giphy.gif" style="width: 100%; height: 70px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #333;">
                        <img src="https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif" data-gif-url="https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif" style="width: 100%; height: 70px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #333;">
                        <img src="https://media.giphy.com/media/5GoVL4DAbWw1gTWrdh/giphy.gif" data-gif-url="https://media.giphy.com/media/5GoVL4DAbWw1gTWrdh/giphy.gif" style="width: 100%; height: 70px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #333;">
                        <img src="https://media.giphy.com/media/26u4lOMA8JKSnL9Uk/giphy.gif" data-gif-url="https://media.giphy.com/media/26u4lOMA8JKSnL9Uk/giphy.gif" style="width: 100%; height: 70px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #333;">
                        <img src="https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif" data-gif-url="https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif" style="width: 100%; height: 70px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #333;">
                        <img src="https://media.giphy.com/media/9uIW81bE27zV6/giphy.gif" data-gif-url="https://media.giphy.com/media/9uIW81bE27zV6/giphy.gif" style="width: 100%; height: 70px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #333;">
                        <img src="https://media.giphy.com/media/10ECejnDra1Dbq/giphy.gif" data-gif-url="https://media.giphy.com/media/10ECejnDra1Dbq/giphy.gif" style="width: 100%; height: 70px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #333;">
                        <img src="https://media.giphy.com/media/jpbnoe3UIa8TU8LM13/giphy.gif" data-gif-url="https://media.giphy.com/media/jpbnoe3UIa8TU8LM13/giphy.gif" style="width: 100%; height: 70px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #333;">
                    </div>

                    <div id="chat-compress-status" style="font-size: 11px; color: #00ff00; text-align: right;"></div>
                </form>

                <div style="text-align: center; margin-top: 12px; font-size: 13px;">
                    <a href="/mail/box">⬅ Hộp thư tin nhắn</a>
                </div>
            </div>
        </div>

        <script>
            (function mountPrivateMailChat() {
                const rootEl = document.getElementById('mailChatRoot');
                const chatBox = document.getElementById('chatMessageBox');
                const chatForm = document.getElementById('chatForm');
                const messageInput = document.getElementById('messageInput');
                const imageInput = document.getElementById('chatImageInput');
                const imgVal = document.getElementById('chat-image-val');
                const compressStatus = document.getElementById('chat-compress-status');
                const gifToggleBtn = document.getElementById('gifToggleBtn');
                const gifCloseBtn = document.getElementById('gifCloseBtn');
                const gifPopup = document.getElementById('gifPopup');

                if (!rootEl || !chatBox || !chatForm) return;

                const currentUserId = ${Number(user.id)};
                const partnerId = ${Number(partnerId)};
                const currentUserData = ${safeCurrentUserJson};
                const partnerData = ${safePartnerJson};
                const endpointUrl = '/mail/chat?user=' + partnerId;

                window.__ACTIVE_CHAT_PARTNER_ID__ = partnerId;
                window.__OTHER_UNREAD_COUNT__ = 0;

                let destroyed = false;
                let lastTypingSentState = false;
                let typingIdleTimer = null;
                let typingHeartbeatTimer = null;
                let lastTypingPulseTs = 0;

                function registerCleanup(fn) {
                    window.__wapPjaxCleanups = window.__wapPjaxCleanups || [];
                    window.__wapPjaxCleanups.push(fn);
                }

                function escapeJsHtml(str) {
                    if (str === null || str === undefined) return '';
                    return String(str)
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/"/g, '&quot;')
                        .replace(/'/g, '&#39;');
                }

                function getSafeAvatarSrc(uObj) {
                    const av = uObj && uObj.avatar ? String(uObj.avatar).trim() : '';
                    if (av && av.indexOf('7gXvS6v') === -1) return av;
                    return "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100' height='100' fill='%23181818'/><circle cx='50' cy='38' r='18' fill='%2300ff00'/></svg>";
                }

                function buildClientNameHtml(uObj) {
                    if (uObj && uObj.nameHtml) return uObj.nameHtml;
                    const iconPrefix = (uObj && uObj.active_icon) ? (escapeJsHtml(uObj.active_icon) + ' ') : '';
                    const color = (uObj && uObj.name_color) ? escapeJsHtml(uObj.name_color) : '#00ff00';
                    const glow = (uObj && uObj.name_glow) ? ('text-shadow: 0 0 6px ' + escapeJsHtml(uObj.name_glow) + ';') : '';
                    const border = (uObj && uObj.name_border) ? ('border: 1px solid ' + escapeJsHtml(uObj.name_border) + '; border-radius: 4px; padding: 0 4px;') : '';
                    const label = escapeJsHtml((uObj && (uObj.display_name || uObj.username)) || 'Thành viên');
                    return '<span style="color: ' + color + '; ' + glow + border + '">' + iconPrefix + label + '</span>';
                }

                function scrollToBottom() {
                    if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
                }
                scrollToBottom();

                function setPartnerTypingUi(isTyping) {
                    const el = document.getElementById('partnerTypingIndicator');
                    const txtEl = document.getElementById('partnerTypingText');
                    if (!el) return;
                    if (isTyping && !destroyed) {
                        const pName = partnerData.display_name || partnerData.username || 'Đối phương';
                        if (txtEl) txtEl.textContent = pName + ' đang nhập nội dung...';
                        el.style.display = 'flex';
                    } else {
                        el.style.display = 'none';
                    }
                }

                function hideAllMailPopupsAndBadges(otherUnreadCount) {
                    const safeOtherUnread = typeof otherUnreadCount === 'number' ? otherUnreadCount : 0;
                    window.__OTHER_UNREAD_COUNT__ = safeOtherUnread;

                    if (safeOtherUnread === 0) {
                        document.querySelectorAll('a[href*="/mail"]').forEach(function(mailLink) {
                            const container = mailLink.closest('li, div, td, span') || mailLink.parentElement || mailLink;
                            container.querySelectorAll('span, sup, .badge, .mail-badge, .popup-badge, [class*="badge"], [class*="count"]').forEach(function(badge) {
                                if (badge.contains(mailLink)) return;
                                const txt = (badge.textContent || '').trim();
                                if (/^\\d+$/.test(txt) || txt === '!' || txt === '') {
                                    badge.style.setProperty('display', 'none', 'important');
                                }
                            });
                        });

                        document.querySelectorAll('[id*="mail-popup"], [id*="chat-popup"], [id*="msg-popup"], [class*="mail-popup"], [class*="chat-popup"], [class*="msg-popup"], [class*="floating-mail"], [class*="toast-mail"]').forEach(function(popup) {
                            popup.style.setProperty('display', 'none', 'important');
                        });
                    }
                }

                async function pushTypingState(isTyping, force) {
                    const desired = Boolean(isTyping);
                    const now = Date.now();
                    if (!force && !desired && !lastTypingSentState) return;
                    if (!force && desired && lastTypingSentState && (now - lastTypingPulseTs < 1500)) return;

                    lastTypingSentState = desired;
                    lastTypingPulseTs = now;

                    try {
                        const body = new URLSearchParams();
                        body.set('action', 'typing_status');
                        body.set('target_user_id', String(partnerId));
                        body.set('partner_id', String(partnerId));
                        body.set('is_typing', desired ? '1' : '0');

                        await fetch(endpointUrl, {
                            method: 'POST',
                            headers: {
                                'X-Requested-With': 'XMLHttpRequest',
                                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
                            },
                            body: body.toString()
                        });
                    } catch (e) {}
                }

                function handleChatInputTyping() {
                    if (destroyed) return;
                    const hasText = Boolean(messageInput && messageInput.value && messageInput.value.trim().length > 0);

                    if (typingIdleTimer) {
                        clearTimeout(typingIdleTimer);
                        typingIdleTimer = null;
                    }
                    if (typingHeartbeatTimer) {
                        clearInterval(typingHeartbeatTimer);
                        typingHeartbeatTimer = null;
                    }

                    if (hasText) {
                        pushTypingState(true, true);
                        typingHeartbeatTimer = setInterval(function() {
                            if (destroyed) return;
                            if (messageInput && messageInput.value && messageInput.value.trim().length > 0) {
                                pushTypingState(true, true);
                            } else {
                                stopChatInputTyping(true);
                            }
                        }, 2000);

                        typingIdleTimer = setTimeout(function() {
                            stopChatInputTyping(true);
                        }, 5000);
                    } else {
                        stopChatInputTyping(true);
                    }
                }

                function stopChatInputTyping(forceSend) {
                    if (typingIdleTimer) {
                        clearTimeout(typingIdleTimer);
                        typingIdleTimer = null;
                    }
                    if (typingHeartbeatTimer) {
                        clearInterval(typingHeartbeatTimer);
                        typingHeartbeatTimer = null;
                    }
                    if (forceSend || lastTypingSentState) {
                        lastTypingSentState = false;
                        pushTypingState(false, true);
                    }
                }

                async function pollPartnerTypingAndUnread() {
                    try {
                        const body = new URLSearchParams();
                        body.set('action', 'check_typing');
                        body.set('partner_id', String(partnerId));

                        const res = await fetch(endpointUrl, {
                            method: 'POST',
                            headers: {
                                'X-Requested-With': 'XMLHttpRequest',
                                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
                            },
                            body: body.toString()
                        });
                        if (res.ok) {
                            const d = await res.json();
                            return {
                                typing: Boolean(d && (d.partner_typing === 1 || d.partner_typing === true)),
                                otherUnread: typeof d.other_unread_count === 'number' ? d.other_unread_count : 0
                            };
                        }
                    } catch (e) {}
                    return { typing: false, otherUnread: 0 };
                }

                function toggleGifPopup() {
                    if (!gifPopup) return;
                    if (gifPopup.style.display === 'none' || gifPopup.style.display === '') {
                        gifPopup.style.display = 'grid';
                    } else {
                        gifPopup.style.display = 'none';
                    }
                }

                async function markCurrentConversationRead() {
                    try {
                        await fetch('/api/mark-read?partner_id=' + partnerId + '&in_chat_with=' + partnerId, {
                            method: 'POST',
                            headers: { 'X-Requested-With': 'XMLHttpRequest' }
                        });
                    } catch (e) {
                        try {
                            await fetch('/api/mark-read?partner_id=' + partnerId + '&in_chat_with=' + partnerId);
                        } catch (e2) {}
                    }
                }

                async function fetchRealtimeMessages() {
                    if (destroyed || !chatBox) return;
                    try {
                        await markCurrentConversationRead();
                        const fallbackState = await pollPartnerTypingAndUnread();

                        let otherUnread = fallbackState.otherUnread;
                        let partnerIsTyping = fallbackState.typing;

                        const res = await fetch('/api/realtime-check?partner_id=' + partnerId + '&in_chat_with=' + partnerId + '&_t=' + Date.now());
                        if (res.ok && !destroyed) {
                            const data = await res.json();

                            if (typeof data.other_unread_count === 'number') {
                                otherUnread = data.other_unread_count;
                            } else if (Array.isArray(data.unread_senders)) {
                                otherUnread = data.unread_senders.filter(function(id) {
                                    return Number(id) !== partnerId;
                                }).length;
                            }

                            const apiTyping = Boolean(
                                data.partner_typing === true ||
                                data.partner_typing === 1 ||
                                data.is_typing === true ||
                                data.is_typing === 1 ||
                                (Array.isArray(data.typing_users) && data.typing_users.some(function(id) { return Number(id) === partnerId; }))
                            );
                            partnerIsTyping = partnerIsTyping || apiTyping;

                            if (Array.isArray(data.chat_messages) && data.chat_messages.length > 0) {
                                let html = '';
                                data.chat_messages.forEach(function(m) {
                                    const sender = m.sender_id || m.user_id;
                                    const isMe = Number(sender) === currentUserId;
                                    const isRead = Number(m.is_read || 0) === 1 || (!isMe && Number(sender) === partnerId);
                                    const msgUser = isMe ? currentUserData : partnerData;

                                    const imageTag = m.image_url
                                        ? '<div style="margin-top: 8px;"><img src="' + escapeJsHtml(m.image_url) + '" style="max-width: 100%; max-height: 300px; border-radius: 6px; object-fit: contain; display: block;"></div>'
                                        : '';

                                    const rawMsg = m.message || '';
                                    const isGifLink = /^https?:\\/\\//i.test(rawMsg) &&
                                        (rawMsg.indexOf('.gif') !== -1 || rawMsg.indexOf('giphy') !== -1 || rawMsg.indexOf('tenor') !== -1);

                                    const messageText = isGifLink
                                        ? '<img src="' + escapeJsHtml(rawMsg) + '" style="max-width: 140px; max-height: 140px; border-radius: 6px; display: block;" />'
                                        : '<div>' + escapeJsHtml(rawMsg) + '</div>';

                                    const readReceiptHtml = isMe
                                        ? '<div style="font-size: 11px; margin-top: 3px; color: ' + (isRead ? '#00ff88' : '#888') + '; font-weight: ' + (isRead ? 'bold' : 'normal') + ';">' + (isRead ? '✓✓ Đã xem' : '✓ Đã gửi') + '</div>'
                                        : '';

                                    const alignment = isMe ? 'flex-end' : 'flex-start';
                                    const bubbleBg = isMe ? '#1a3300' : '#1a1a1a';
                                    const bubbleBorder = isMe ? '#339900' : '#333';
                                    const avSrc = getSafeAvatarSrc(msgUser);
                                    const avStyle = (msgUser && msgUser.avatarStyle)
                                        ? (escapeJsHtml(msgUser.avatarStyle) + '; width: 36px; height: 36px; border-radius: 50%; object-fit: cover; display: block;')
                                        : 'width: 36px; height: 36px; border-radius: 50%; object-fit: cover; border: 1px solid #00ff00; display: block;';

                                    html += '<div style="display: flex; flex-direction: column; align-items: ' + alignment + ';">' +
                                        '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">' +
                                            '<img src="' + escapeJsHtml(avSrc) + '" style="' + avStyle + '">' +
                                            '<div style="font-size: 13px; display: flex; align-items: center; flex-wrap: wrap; font-weight: bold;">' +
                                                buildClientNameHtml(msgUser) +
                                            '</div>' +
                                        '</div>' +
                                        '<div style="max-width: 80%; background: ' + bubbleBg + '; border: 1px solid ' + bubbleBorder + '; padding: 10px 14px; border-radius: 8px; color: #fff; font-size: 15px; word-break: break-word; line-height: 1.4;">' +
                                            messageText +
                                            imageTag +
                                        '</div>' +
                                        readReceiptHtml +
                                    '</div>';
                                });

                                if (chatBox.innerHTML !== html) {
                                    const isAtBottom = chatBox.scrollHeight - chatBox.scrollTop <= chatBox.clientHeight + 80;
                                    chatBox.innerHTML = html;
                                    partnerIsTyping = false;
                                    if (isAtBottom) {
                                        scrollToBottom();
                                    }
                                }
                            }
                        }

                        if (!destroyed) {
                            hideAllMailPopupsAndBadges(otherUnread);
                            setPartnerTypingUi(partnerIsTyping);
                        }
                    } catch (e) {}
                }

                async function sendGifIcon(gifUrl) {
                    if (destroyed) return;
                    if (gifPopup) gifPopup.style.display = 'none';

                    await stopChatInputTyping(true);
                    hideAllMailPopupsAndBadges(window.__OTHER_UNREAD_COUNT__ || 0);

                    const formData = new FormData();
                    formData.append('message', gifUrl);

                    try {
                        const res = await fetch(endpointUrl, {
                            method: 'POST',
                            headers: { 'X-Requested-With': 'XMLHttpRequest' },
                            body: formData
                        });

                        if (res.ok && !destroyed) {
                            setPartnerTypingUi(false);
                            await markCurrentConversationRead();
                            await fetchRealtimeMessages();
                            hideAllMailPopupsAndBadges(window.__OTHER_UNREAD_COUNT__ || 0);
                            scrollToBottom();
                        }
                    } catch (e) {}
                }

                async function sendChatMessage(event) {
                    event.preventDefault();
                    if (destroyed) return;

                    const msgText = messageInput ? messageInput.value.trim() : '';
                    const imgBase64 = imgVal ? imgVal.value.trim() : '';
                    if (!msgText && !imgBase64) return;

                    await stopChatInputTyping(true);
                    hideAllMailPopupsAndBadges(window.__OTHER_UNREAD_COUNT__ || 0);

                    const formData = new FormData();
                    formData.append('message', msgText);
                    formData.append('image_url', imgBase64);

                    try {
                        const res = await fetch(endpointUrl, {
                            method: 'POST',
                            headers: { 'X-Requested-With': 'XMLHttpRequest' },
                            body: formData
                        });

                        if (res.ok && !destroyed) {
                            if (messageInput) messageInput.value = '';
                            if (imgVal) imgVal.value = '';
                            if (imageInput) imageInput.value = '';
                            if (compressStatus) compressStatus.innerText = '';
                            setPartnerTypingUi(false);
                            await markCurrentConversationRead();
                            await fetchRealtimeMessages();
                            hideAllMailPopupsAndBadges(window.__OTHER_UNREAD_COUNT__ || 0);
                            scrollToBottom();
                        }
                    } catch (e) {
                        chatForm.submit();
                    }
                }

                function handleImageFileChange() {
                    if (!imageInput || !imageInput.files || !imageInput.files[0]) return;
                    const file = imageInput.files[0];
                    if (compressStatus) compressStatus.innerText = '⏳ Đang nén ảnh...';

                    const reader = new FileReader();
                    reader.onload = function(e) {
                        const img = new Image();
                        img.onload = function() {
                            const MAX_WIDTH = 1000;
                            let width = img.width;
                            let height = img.height;

                            if (width > MAX_WIDTH) {
                                height *= MAX_WIDTH / width;
                                width = MAX_WIDTH;
                            }

                            const canvas = document.createElement('canvas');
                            canvas.width = width;
                            canvas.height = height;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0, width, height);

                            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.80);
                            if (imgVal) imgVal.value = compressedBase64;
                            if (compressStatus) compressStatus.innerText = '✅ Đã đính kèm ảnh!';
                            handleChatInputTyping();
                        };
                        img.src = e.target.result;
                    };
                    reader.readAsDataURL(file);
                }

                chatForm.addEventListener('submit', sendChatMessage);
                if (messageInput) {
                    messageInput.addEventListener('input', handleChatInputTyping);
                    messageInput.addEventListener('blur', function() { stopChatInputTyping(true); });
                }
                if (imageInput) {
                    imageInput.addEventListener('change', handleImageFileChange);
                }
                if (gifToggleBtn) {
                    gifToggleBtn.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleGifPopup();
                    });
                }
                if (gifCloseBtn) {
                    gifCloseBtn.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleGifPopup();
                    });
                }
                if (gifPopup) {
                    gifPopup.addEventListener('click', function(e) {
                        const gifImg = e.target && e.target.closest ? e.target.closest('img[data-gif-url]') : null;
                        if (gifImg) {
                            e.preventDefault();
                            sendGifIcon(gifImg.getAttribute('data-gif-url'));
                        }
                    });
                }

                const onBeforeUnload = function() {
                    stopChatInputTyping(true);
                };
                window.addEventListener('beforeunload', onBeforeUnload);

                markCurrentConversationRead().then(function() {
                    if (destroyed) return;
                    hideAllMailPopupsAndBadges(0);
                    fetchRealtimeMessages();
                });

                const msgTimer = setInterval(fetchRealtimeMessages, 1200);
                const badgeTimer = setInterval(function() {
                    if (destroyed) return;
                    hideAllMailPopupsAndBadges(window.__OTHER_UNREAD_COUNT__ || 0);
                }, 400);

                registerCleanup(function() {
                    destroyed = true;
                    stopChatInputTyping(true);
                    clearInterval(msgTimer);
                    clearInterval(badgeTimer);
                    window.removeEventListener('beforeunload', onBeforeUnload);
                    if (window.__ACTIVE_CHAT_PARTNER_ID__ === partnerId) {
                        window.__ACTIVE_CHAT_PARTNER_ID__ = null;
                    }
                });
            })();
        </script>
    </div>
    `;

    return new Response(renderLayout(`Trò chuyện với ${partner.display_name || partner.username}`, content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
