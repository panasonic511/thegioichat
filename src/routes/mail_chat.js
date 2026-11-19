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
    } catch (e) {}

    // Hàm hỗ trợ đánh dấu toàn bộ tin nhắn từ partnerId gửi tới user là đã đọc
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

    // Xử lý yêu cầu POST (Gửi tin nhắn - hỗ trợ cả AJAX lẫn Form truyền thống)
    if (request.method === 'POST') {
        try {
            const formData = await request.formData();
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

                // Khi đang trong đoạn chat với đối phương, các tin cũ từ đối phương tới mình cũng được xác nhận đã đọc
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

    // Lấy thông tin đối phương kèm đầy đủ style và role
    let partner = null;
    try {
        partner = await env.DB.prepare(`
            SELECT id, username, display_name, avatar, border_color, avatar_glow,
                   name_color, name_glow, name_border, name_border_glow, active_icon, role
            FROM users WHERE id = ?
        `).bind(partnerId).first();
    } catch (e) {}

    if (!partner) {
        return new Response("Không tìm thấy thành viên này.", { status: 404 });
    }

    // Đánh dấu toàn bộ tin nhắn từ đối phương này thành đã đọc ngay khi mở phòng chat
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

    const rPartnerHeader = renderUser(partner);

    const renderMessageHtml = (m, currentUserObj, partnerObj) => {
        const sender = m.sender_id || m.user_id;
        const isMe = Number(sender) === Number(currentUserObj.id);
        const isRead = Number(m.is_read || 0) === 1;

        const msgUser = isMe ? currentUserObj : partnerObj;
        const rMsgUser = renderUser(msgUser);

        const roleName = msgUser.role || 'Thành viên';
        const isManager = roleName !== 'Thành Viên' && roleName !== 'Thành viên';
        const roleHtml = isManager ? `
            <span style="display: inline-block; background: #1a1a1a; border: 1px solid #444; color: #ffcc00; font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 4px; text-shadow: 0 0 4px rgba(255,204,0,0.4); margin-left: 6px;">
                ${escapeHtml(roleName)}
            </span>
        ` : '';

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
                <div style="width: 36px; height: 36px; min-width: 36px; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center;">
                    ${rMsgUser.avatarHtml.replace(/style="[^"]*"/gi, 'style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover;"')}
                </div>
                <div style="font-size: 13px; display: flex; align-items: center; font-weight: bold;">
                    ${rMsgUser.nameHtml} ${roleHtml}
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
        avatar: user.avatar,
        name_color: user.name_color,
        role: user.role
    }).replace(/</g, '\\u003c');

    const safePartnerJson = JSON.stringify({
        id: partner.id,
        username: partner.username,
        display_name: partner.display_name,
        avatar: partner.avatar,
        name_color: partner.name_color,
        role: partner.role
    }).replace(/</g, '\\u003c');

    const content = `
    <div class="box" style="position: relative;">
        <div class="box-title" style="display: flex; align-items: center; gap: 8px; font-size: 15px;">
            <span>🟢 Trò chuyện với</span> ${rPartnerHeader.nameHtml}
        </div>
        <div class="box-content" style="padding: 10px;">

            <div id="chatMessageBox" style="height: 420px; overflow-y: scroll; background: #000; border: 1px solid #333; padding: 12px; display: flex; flex-direction: column; gap: 14px; margin-bottom: 12px;">
                ${messages.length === 0
                    ? '<div id="no-msg" style="color: #777; text-align: center; margin-top: 170px; font-size: 14px;">Chưa có tin nhắn nào. Hãy gửi tin nhắn mở lời!</div>'
                    : messages.map(m => renderMessageHtml(m, user, partner)).join('')}
            </div>

            <!-- Form Gửi tin nhắn qua Ajax không load lại trang -->
            <form id="chatForm" onsubmit="sendChatMessage(event)" style="display: flex; flex-direction: column; gap: 8px; position: relative;">
                <div style="display: flex; gap: 8px; align-items: center;">
                    <label style="display: inline-flex; align-items: center; justify-content: center; background: #1a1a1a; border: 1px solid #444; color: #00ff00; width: 40px; height: 40px; border-radius: 6px; cursor: pointer; font-size: 20px;" title="Gửi ảnh">
                        📷
                        <input type="file" accept="image/*" onchange="compressAndSetChatImage(this)" style="display: none;">
                    </label>
                    <input type="hidden" id="chat-image-val" name="image_url">

                    <input type="text" name="message" id="messageInput" placeholder="Nhập nội dung chát..." autocomplete="off" style="flex: 1; background: #000; color: #fff; border: 1px solid #444; padding: 10px 12px; font-size: 14px; box-sizing: border-box; border-radius: 6px;" required>

                    <!-- Nút mở Popup bộ sưu tập GIF Meme -->
                    <button type="button" onclick="toggleGifPopup()" class="btn" style="background: #333; color: #ffcc00; padding: 10px 12px; font-size: 14px; border-radius: 6px; cursor: pointer; border: 1px solid #551a8b;" title="Kho Sticker GIF Meme">🎁 GIF</button>

                    <button type="submit" id="sendBtn" class="btn" style="background: #0055ff; color: #fff; padding: 10px 18px; font-size: 14px; border-radius: 6px; cursor: pointer; font-weight: bold;">Gửi</button>
                </div>

                <!-- Popup chứa bộ sưu tập Icon GIF Meme hài hước & dễ thương -->
                <div id="gifPopup" style="display: none; position: absolute; bottom: 55px; right: 0; background: #111; border: 1px solid #444; padding: 10px; border-radius: 8px; width: 300px; max-height: 220px; overflow-y: auto; box-shadow: 0 4px 15px rgba(0,0,0,0.8); z-index: 999; grid-template-columns: repeat(3, 1fr); gap: 8px;">
                    <div style="grid-column: span 3; font-size: 12px; color: #ffcc00; font-weight: bold; border-bottom: 1px solid #333; padding-bottom: 4px; display: flex; justify-content: space-between; align-items: center;">
                        <span>😂 Kho GIF Meme & Đáng Yêu</span>
                        <span onclick="toggleGifPopup()" style="cursor: pointer; color: #ff5555; padding: 0 4px;">✕</span>
                    </div>
                    <img src="https://media.giphy.com/media/26vUDlO9wK7fyOpls/giphy.gif" onclick="sendGifIcon('https://media.giphy.com/media/26vUDlO9wK7fyOpls/giphy.gif')" style="width: 100%; height: 70px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #333;">
                    <img src="https://media.giphy.com/media/3o7TKoWXm3okO1kgHC/giphy.gif" onclick="sendGifIcon('https://media.giphy.com/media/3o7TKoWXm3okO1kgHC/giphy.gif')" style="width: 100%; height: 70px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #333;">
                    <img src="https://media.giphy.com/media/l0HlvcHy69b5H9e9i/giphy.gif" onclick="sendGifIcon('https://media.giphy.com/media/l0HlvcHy69b5H9e9i/giphy.gif')" style="width: 100%; height: 70px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #333;">
                    <img src="https://media.giphy.com/media/3oKIPnAiaMCws8nOsE/giphy.gif" onclick="sendGifIcon('https://media.giphy.com/media/3oKIPnAiaMCws8nOsE/giphy.gif')" style="width: 100%; height: 70px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #333;">
                    <img src="https://media.giphy.com/media/xT5LMFZDsj0AKUDYTS/giphy.gif" onclick="sendGifIcon('https://media.giphy.com/media/xT5LMFZDsj0AKUDYTS/giphy.gif')" style="width: 100%; height: 70px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #333;">
                    <img src="https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif" onclick="sendGifIcon('https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif')" style="width: 100%; height: 70px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #333;">
                    <img src="https://media.giphy.com/media/5GoVL4DAbWw1gTWrdh/giphy.gif" onclick="sendGifIcon('https://media.giphy.com/media/5GoVL4DAbWw1gTWrdh/giphy.gif')" style="width: 100%; height: 70px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #333;">
                    <img src="https://media.giphy.com/media/26u4lOMA8JKSnL9Uk/giphy.gif" onclick="sendGifIcon('https://media.giphy.com/media/26u4lOMA8JKSnL9Uk/giphy.gif')" style="width: 100%; height: 70px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #333;">
                    <img src="https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif" onclick="sendGifIcon('https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif')" style="width: 100%; height: 70px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #333;">
                    <img src="https://media.giphy.com/media/9uIW81bE27zV6/giphy.gif" onclick="sendGifIcon('https://media.giphy.com/media/9uIW81bE27zV6/giphy.gif')" style="width: 100%; height: 70px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #333;">
                    <img src="https://media.giphy.com/media/10ECejnDra1Dbq/giphy.gif" onclick="sendGifIcon('https://media.giphy.com/media/10ECejnDra1Dbq/giphy.gif')" style="width: 100%; height: 70px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #333;">
                    <img src="https://media.giphy.com/media/jpbnoe3UIa8TU8LM13/giphy.gif" onclick="sendGifIcon('https://media.giphy.com/media/jpbnoe3UIa8TU8LM13/giphy.gif')" style="width: 100%; height: 70px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #333;">
                </div>

                <div id="chat-compress-status" style="font-size: 11px; color: #00ff00; text-align: right;"></div>
            </form>

            <div style="text-align: center; margin-top: 12px; font-size: 13px;">
                <a href="/mail/box">⬅ Hộp thư tin nhắn</a>
            </div>
        </div>
    </div>

    <script>
        const currentUserId = ${Number(user.id)};
        const partnerId = ${Number(partnerId)};
        const currentUserData = ${safeCurrentUserJson};
        const partnerData = ${safePartnerJson};
        const chatBox = document.getElementById('chatMessageBox');

        function escapeJsHtml(str) {
            if (str === null || str === undefined) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function scrollToBottom() {
            chatBox.scrollTop = chatBox.scrollHeight;
        }
        scrollToBottom();

        function toggleGifPopup() {
            const popup = document.getElementById('gifPopup');
            if (!popup) return;
            if (popup.style.display === 'none' || popup.style.display === '') {
                popup.style.display = 'grid';
            } else {
                popup.style.display = 'none';
            }
        }

        // Ẩn thông báo/badge/popup thuộc về cuộc trò chuyện hiện tại (partnerId)
        // hoặc ẩn toàn bộ badge mail khi đang ở trong đúng phòng chat của partnerId và không có tin từ người khác
        function syncChatNotifications(otherUnreadCount) {
            const safeOtherUnread = typeof otherUnreadCount === 'number' ? otherUnreadCount : 0;

            // 1. Ẩn mọi badge / chấm đỏ gắn với link chứa partnerId
            document.querySelectorAll('a[href*="user=' + partnerId + '"], a[href*="/mail/chat"]').forEach(function(link) {
                const href = link.getAttribute('href') || '';
                const isThisPartner = href.indexOf('user=' + partnerId) !== -1;

                link.querySelectorAll('span, .badge, .mail-badge, [class*="badge"], [class*="count"]').forEach(function(el) {
                    const txt = (el.textContent || '').trim();
                    if (isThisPartner) {
                        el.style.display = 'none';
                    } else if (href.indexOf('/mail') !== -1 && safeOtherUnread === 0 && /^\\d+$/.test(txt)) {
                        el.style.display = 'none';
                    }
                });
            });

            // 2. Xử lý badge trên thanh điều hướng "Tin nhắn" và nút popup nổi (nếu không còn tin chưa đọc từ người khác)
            if (safeOtherUnread === 0) {
                document.querySelectorAll('a[href*="/mail"]').forEach(function(mailLink) {
                    const parent = mailLink.parentElement || mailLink;
                    parent.querySelectorAll('span, .badge, .popup-badge, [style*="background"][style*="red"], [style*="background:#ff"], [style*="background: #ff"], [style*="background: #e"], [style*="background:#e"], [style*="background: #c"], [style*="background:#c"]').forEach(function(badge) {
                        const txt = (badge.textContent || '').trim();
                        if (/^\\d+$/.test(txt) || txt === '') {
                            badge.style.display = 'none';
                        }
                    });
                });

                // Ẩn popup nổi tin nhắn mới nếu nội dung popup chỉ liên quan đến partnerId hiện tại hoặc không còn tin từ người khác
                document.querySelectorAll('[id*="mail-popup"], [id*="chat-popup"], [class*="mail-popup"], [class*="chat-popup"], [class*="floating-mail"], [class*="toast-mail"]').forEach(function(popup) {
                    const popupText = popup.textContent || '';
                    const partnerName = partnerData.display_name || partnerData.username || '';
                    if (!partnerName || popupText.indexOf(partnerName) !== -1 || safeOtherUnread === 0) {
                        popup.style.display = 'none';
                    }
                });
            }
        }

        async function markCurrentConversationRead() {
            try {
                await fetch('/api/mark-read?partner_id=' + partnerId, {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' }
                });
            } catch (e) {
                try {
                    await fetch('/api/mark-read?partner_id=' + partnerId);
                } catch (e2) {}
            }
        }

        async function sendGifIcon(gifUrl) {
            const popup = document.getElementById('gifPopup');
            if (popup) popup.style.display = 'none';

            const formData = new FormData();
            formData.append('message', gifUrl);

            try {
                const res = await fetch(window.location.href, {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: formData
                });

                if (res.ok) {
                    await markCurrentConversationRead();
                    await fetchRealtimeMessages();
                    scrollToBottom();
                }
            } catch (e) {}
        }

        async function sendChatMessage(event) {
            event.preventDefault();
            const form = document.getElementById('chatForm');
            const input = document.getElementById('messageInput');
            const imgVal = document.getElementById('chat-image-val');

            if (!input.value.trim() && !imgVal.value) return;

            const formData = new FormData(form);

            try {
                const res = await fetch(window.location.href, {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: formData
                });

                if (res.ok) {
                    input.value = '';
                    imgVal.value = '';
                    document.getElementById('chat-compress-status').innerText = '';
                    await markCurrentConversationRead();
                    await fetchRealtimeMessages();
                    scrollToBottom();
                }
            } catch (e) {
                form.submit();
            }
        }

        function compressAndSetChatImage(fileInput) {
            const file = fileInput.files[0];
            const statusEl = document.getElementById('chat-compress-status');
            if (!file) return;
            statusEl.innerText = "⏳ Đang nén ảnh...";

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
                    document.getElementById('chat-image-val').value = compressedBase64;
                    statusEl.innerText = "✅ Đã đính kèm ảnh!";
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }

        async function fetchRealtimeMessages() {
            try {
                await markCurrentConversationRead();
                const res = await fetch('/api/realtime-check?partner_id=' + partnerId + '&in_chat_with=' + partnerId + '&_t=' + Date.now());
                if (res.ok) {
                    const data = await res.json();

                    let otherUnread = 0;
                    if (typeof data.other_unread_count === 'number') {
                        otherUnread = data.other_unread_count;
                    } else if (Array.isArray(data.unread_senders)) {
                        otherUnread = data.unread_senders.filter(function(id) {
                            return Number(id) !== partnerId;
                        }).length;
                    }

                    syncChatNotifications(otherUnread);

                    if (Array.isArray(data.chat_messages) && data.chat_messages.length > 0) {
                        let html = '';
                        data.chat_messages.forEach(function(m) {
                            const sender = m.sender_id || m.user_id;
                            const isMe = Number(sender) === currentUserId;
                            // Nếu đang trong đoạn chat với partnerId, tin từ partnerId đã được đánh dấu đọc
                            const isRead = Number(m.is_read || 0) === 1 || (!isMe && Number(sender) === partnerId);
                            const msgUser = isMe ? currentUserData : partnerData;

                            const roleName = msgUser.role || 'Thành viên';
                            const isManager = roleName !== 'Thành Viên' && roleName !== 'Thành viên';
                            const roleHtml = isManager
                                ? '<span style="display: inline-block; background: #1a1a1a; border: 1px solid #444; color: #ffcc00; font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 4px; text-shadow: 0 0 4px rgba(255,204,0,0.4); margin-left: 6px;">' + escapeJsHtml(roleName) + '</span>'
                                : '';

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

                            html += '<div style="display: flex; flex-direction: column; align-items: ' + alignment + ';">' +
                                '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">' +
                                    '<div style="width: 36px; height: 36px; min-width: 36px; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center;">' +
                                        '<img src="' + escapeJsHtml(msgUser.avatar || '') + '" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover;">' +
                                    '</div>' +
                                    '<div style="font-size: 13px; display: flex; align-items: center; font-weight: bold;">' +
                                        '<span style="color: ' + escapeJsHtml(msgUser.name_color || '#00ff00') + ';">' + escapeJsHtml(msgUser.display_name || msgUser.username) + '</span> ' + roleHtml +
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
                            const isAtBottom = chatBox.scrollHeight - chatBox.scrollTop <= chatBox.clientHeight + 60;
                            chatBox.innerHTML = html;
                            if (isAtBottom) {
                                scrollToBottom();
                            }
                        }
                    }
                }
            } catch (e) {}
        }

        // Chạy ngay khi vào trang và lặp lại định kỳ
        markCurrentConversationRead().then(function() {
            syncChatNotifications(0);
            fetchRealtimeMessages();
        });
        setInterval(fetchRealtimeMessages, 2500);
    </script>
    `;

    return new Response(renderLayout(`Trò chuyện với ${partner.display_name || partner.username}`, content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
