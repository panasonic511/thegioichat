import { renderUser } from '../worker.js';

export async function handleMailChat(request, env, user, renderLayout, url) {
    const partnerId = url.searchParams.get('user');
    if (!partnerId) {
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
        
        try { await env.DB.prepare("ALTER TABLE mail_box ADD COLUMN image_url TEXT").run(); } catch (e) {}
    } catch (e) {}

    // Xử lý yêu cầu POST (Hỗ trợ cả Ajax lẫn Submit truyền thống)
    if (request.method === 'POST') {
        try {
            const formData = await request.formData();
            const message = formData.get('message');
            const imageUrl = formData.get('image_url');
            
            if ((message && message.trim() !== '') || (imageUrl && imageUrl.trim() !== '')) {
                try {
                    await env.DB.prepare(
                        "INSERT INTO mail_box (sender_id, receiver_id, message, image_url, is_read, created_at) VALUES (?, ?, ?, ?, 0, datetime('now'))"
                    ).bind(user.id, partnerId, message || '', imageUrl || '').run();
                } catch (err) {
                    await env.DB.prepare(
                        "INSERT INTO mail_box (user_id, partner_id, message, image_url, is_read, created_at) VALUES (?, ?, ?, ?, 0, datetime('now'))"
                    ).bind(user.id, partnerId, message || '', imageUrl || '').run();
                }
            }

            // Nếu là gọi từ Ajax thì trả về JSON thành công
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

    try {
        await env.DB.prepare(
            "UPDATE mail_box SET is_read = 1 WHERE receiver_id = ? AND sender_id = ?"
        ).bind(user.id, partnerId).run();
    } catch (e) {}
    try {
        await env.DB.prepare(
            "UPDATE mail_box SET is_read = 1 WHERE partner_id = ? AND user_id = ?"
        ).bind(user.id, partnerId).run();
    } catch (e) {}

    let messages = [];
    try {
        let history = await env.DB.prepare(`
            SELECT * FROM mail_box 
            WHERE (sender_id = ? AND receiver_id = ?) 
               OR (sender_id = ? AND receiver_id = ?) 
            ORDER BY id ASC
        `).bind(user.id, partnerId, partnerId, user.id).all();
        
        if (history.results && history.results.length > 0) {
            messages = history.results;
        } else {
            let history2 = await env.DB.prepare(`
                SELECT * FROM mail_box 
                WHERE (user_id = ? AND partner_id = ?) 
                   OR (user_id = ? AND partner_id = ?) 
                ORDER BY id ASC
            `).bind(user.id, partnerId, partnerId, user.id).all();
            messages = history2.results || [];
        }
    } catch (e) {}

    // Render style tên đối phương ở tiêu đề
    const rPartnerHeader = renderUser(partner);

    // Hàm phụ trợ tạo HTML từng tin nhắn để dùng chung cho cả SSR lẫn Client Realtime JS
    const renderMessageHtml = (m) => {
        const sender = m.sender_id || m.user_id;
        const isMe = Number(sender) === Number(user.id);
        
        const msgUser = isMe ? user : partner;
        const rMsgUser = renderUser(msgUser);

        const roleName = msgUser.role || 'Thành viên';
        const isManager = roleName !== 'Thành Viên' && roleName !== 'Thành viên';
        const roleHtml = isManager ? `
            <span style="display: inline-block; background: #1a1a1a; border: 1px solid #444; color: #ffcc00; font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 4px; text-shadow: 0 0 4px rgba(255,204,0,0.4); margin-left: 6px;">
                ${roleName}
            </span>
        ` : '';

        const imageTag = m.image_url ? `<div style="margin-top: 8px;"><img src="${m.image_url}" style="max-width: 100%; max-height: 300px; border-radius: 6px; object-fit: contain; display: block;"></div>` : '';
        const messageText = m.message ? `<div>${m.message}</div>` : '';

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
                ${messageText}
                ${imageTag}
            </div>
        </div>`;
    };

    const content = `
    <div class="box">
        <div class="box-title" style="display: flex; align-items: center; gap: 8px; font-size: 15px;">
            <span>🟢 Trò chuyện với</span> ${rPartnerHeader.nameHtml}
        </div>
        <div class="box-content" style="padding: 10px;">
            
            <div id="chatMessageBox" style="height: 420px; overflow-y: scroll; background: #000; border: 1px solid #333; padding: 12px; display: flex; flex-direction: column; gap: 14px; margin-bottom: 12px;">
                ${messages.length === 0 ? '<div id="no-msg" style="color: #777; text-align: center; margin-top: 170px; font-size: 14px;">Chưa có tin nhắn nào. Hãy gửi tin nhắn mở lời!</div>' : 
                    messages.map(m => renderMessageHtml(m)).join('')}
            </div>

            <!-- Form Gửi tin nhắn qua Ajax không load lại trang -->
            <form id="chatForm" onsubmit="sendChatMessage(event)" style="display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; gap: 8px; align-items: center;">
                    <label style="display: inline-flex; align-items: center; justify-content: center; background: #1a1a1a; border: 1px solid #444; color: #00ff00; width: 40px; height: 40px; border-radius: 6px; cursor: pointer; font-size: 20px;" title="Gửi ảnh">
                        📷
                        <input type="file" accept="image/*" onchange="compressAndSetChatImage(this)" style="display: none;">
                    </label>
                    <input type="hidden" id="chat-image-val" name="image_url">

                    <input type="text" name="message" id="messageInput" placeholder="Nhập nội dung chát..." autocomplete="off" style="flex: 1; background: #000; color: #fff; border: 1px solid #444; padding: 10px 12px; font-size: 14px; box-sizing: border-box; border-radius: 6px;" required>
                    
                    <button type="submit" id="sendBtn" class="btn" style="background: #0055ff; color: #fff; padding: 10px 18px; font-size: 14px; border-radius: 6px; cursor: pointer; font-weight: bold;">Gửi</button>
                </div>

                <!-- Bảng chọn nhanh icon biểu cảm (Emoji) -->
                <div style="display: flex; gap: 8px; align-items: center; background: #0d0d0d; padding: 6px 8px; border: 1px solid #222; border-radius: 6px;">
                    <span style="font-size: 11px; color: #888;">Biểu cảm:</span>
                    <button type="button" onclick="insertEmoji('😀')" style="background:none; border:none; cursor:pointer; font-size:16px;">😀</button>
                    <button type="button" onclick="insertEmoji('😂')" style="background:none; border:none; cursor:pointer; font-size:16px;">😂</button>
                    <button type="button" onclick="insertEmoji('❤️')" style="background:none; border:none; cursor:pointer; font-size:16px;">❤️</button>
                    <button type="button" onclick="insertEmoji('👍')" style="background:none; border:none; cursor:pointer; font-size:16px;">👍</button>
                    <button type="button" onclick="insertEmoji('🔥')" style="background:none; border:none; cursor:pointer; font-size:16px;">🔥</button>
                    <button type="button" onclick="insertEmoji('🎉')" style="background:none; border:none; cursor:pointer; font-size:16px;">🎉</button>
                    <button type="button" onclick="insertEmoji('😍')" style="background:none; border:none; cursor:pointer; font-size:16px;">😍</button>
                    <button type="button" onclick="insertEmoji('😎')" style="background:none; border:none; cursor:pointer; font-size:16px;">😎</button>
                    <div id="chat-compress-status" style="font-size: 11px; color: #00ff00; margin-left: auto;"></div>
                </div>
            </form>
            
            <div style="text-align: center; margin-top: 12px; font-size: 13px;">
                <a href="/mail/box">⬅ Hộp thư tin nhắn</a>
            </div>
        </div>
    </div>

    <script>
        const currentUserId = ${user.id};
        const partnerId = ${partnerId};
        const chatBox = document.getElementById('chatMessageBox');

        function scrollToBottom() {
            chatBox.scrollTop = chatBox.scrollHeight;
        }
        scrollToBottom();

        function insertEmoji(emoji) {
            const input = document.getElementById('messageInput');
            input.value += emoji;
            input.focus();
        }

        // Gửi tin nhắn bằng Ajax không load lại trang
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
                    fetchRealtimeMessages(); // Cập nhật tin nhắn ngay lập tức sau khi gửi
                }
            } catch (e) {
                form.submit(); // Fallback nếu lỗi mạng
            }
        }

        // Tự động nén ảnh
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

        // Hàm gọi ngầm kiểm tra và cập nhật tin nhắn mới liên tục mỗi 2.5 giây
        async function fetchRealtimeMessages() {
            try {
                const res = await fetch('/api/realtime-check?partner_id=' + partnerId);
                if (res.ok) {
                    const data = await res.json();
                    if (data.chat_messages && data.chat_messages.length > 0) {
                        let html = '';
                        data.chat_messages.forEach(m => {
                            const sender = m.sender_id || m.user_id;
                            const isMe = Number(sender) === currentUserId;
                            const msgUser = isMe ? ${JSON.stringify(user)} : ${JSON.stringify(partner)};
                            
                            // Tái tạo lại giao diện tin nhắn realtime giống phía server
                            const roleName = msgUser.role || 'Thành viên';
                            const isManager = roleName !== 'Thành Viên' && roleName !== 'Thành viên';
                            const roleHtml = isManager ? \`<span style="display: inline-block; background: #1a1a1a; border: 1px solid #444; color: #ffcc00; font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 4px; text-shadow: 0 0 4px rgba(255,204,0,0.4); margin-left: 6px;">\${roleName}</span>\` : '';
                            const imageTag = m.image_url ? \`<div style="margin-top: 8px;"><img src="\${m.image_url}" style="max-width: 100%; max-height: 300px; border-radius: 6px; object-fit: contain; display: block;"></div>\` : '';
                            const messageText = m.message ? \`<div>\${m.message}</div>\` : '';

                            html += \`
                            <div style="display: flex; flex-direction: column; align-items: \${isMe ? 'flex-end' : 'flex-start'};">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
                                    <div style="width: 36px; height: 36px; min-width: 36px; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center;">
                                        <img src="\${msgUser.avatar || ''}" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover;">
                                    </div>
                                    <div style="font-size: 13px; display: flex; align-items: center; font-weight: bold;">
                                        <span style="color: \${msgUser.name_color || '#00ff00'};">\${msgUser.display_name || msgUser.username}</span> \${roleHtml}
                                    </div>
                                </div>
                                <div style="max-width: 80%; background: \${isMe ? '#1a3300' : '#1a1a1a'}; border: 1px solid \${isMe ? '#339900' : '#333'}; padding: 10px 14px; border-radius: 8px; color: #fff; font-size: 15px; word-break: break-word; line-height: 1.4;">
                                    \${messageText}
                                    \${imageTag}
                                </div>
                            </div>\`;
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

        setInterval(fetchRealtimeMessages, 2500);
    </script>
    `;

    return new Response(renderLayout(`Trò chuyện với ${partner.display_name || partner.username}`, content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
