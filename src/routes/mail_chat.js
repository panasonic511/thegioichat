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
        } catch (e) {}
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

    const content = `
    <div class="box">
        <div class="box-title" style="display: flex; align-items: center; gap: 6px;">
            <span>🟢 Trò chuyện với</span> ${rPartnerHeader.nameHtml}
        </div>
        <div class="box-content" style="padding: 8px;">
            
            <div id="chatMessageBox" style="height: 380px; overflow-y: scroll; background: #000; border: 1px solid #333; padding: 10px; display: flex; flex-direction: column; gap: 12px; margin-bottom: 10px;">
                ${messages.length === 0 ? '<div style="color: #777; text-align: center; margin-top: 150px;">Chưa có tin nhắn nào. Hãy gửi tin nhắn mở lời!</div>' : 
                    messages.map(m => {
                        const sender = m.sender_id || m.user_id;
                        const isMe = Number(sender) === Number(user.id);
                        
                        // Lấy đúng thông tin người gửi tin nhắn (Mình hoặc đối phương)
                        const msgUser = isMe ? user : partner;
                        const rMsgUser = renderUser(msgUser);

                        // Chỉ hiện khung chức vụ nếu là Quản lý / Chủ Wap (khác 'Thành Viên' hoặc 'Thành viên')
                        const roleName = msgUser.role || 'Thành viên';
                        const isManager = roleName !== 'Thành Viên' && roleName !== 'Thành viên';
                        const roleHtml = isManager ? `
                            <span style="display: inline-block; background: #1a1a1a; border: 1px solid #444; color: #ffcc00; font-size: 9px; font-weight: bold; padding: 1px 5px; border-radius: 4px; text-shadow: 0 0 4px rgba(255,204,0,0.4); margin-left: 4px;">
                                ${roleName}
                            </span>
                        ` : '';

                        const imageTag = m.image_url ? `<div style="margin-top: 6px;"><img src="${m.image_url}" style="max-width: 100%; max-height: 250px; border-radius: 4px; object-fit: contain; display: block;"></div>` : '';

                        return `
                        <div style="display: flex; flex-direction: column; align-items: ${isMe ? 'flex-end' : 'flex-start'};">
                            <!-- Thông tin người gửi: Avatar và Style Tên nằm ở trên -->
                            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                                <div style="width: 26px; height: 26px; min-width: 26px; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center;">
                                    ${rMsgUser.avatarHtml.replace(/style="[^"]*"/gi, 'style="width: 26px; height: 26px; border-radius: 50%; object-fit: cover;"')}
                                </div>
                                <div style="font-size: 12px; display: flex; align-items: center;">
                                    ${rMsgUser.nameHtml} ${roleHtml}
                                </div>
                            </div>

                            <!-- Nội dung tin nhắn nằm ở dưới -->
                            <div style="max-width: 75%; background: ${isMe ? '#1a3300' : '#1a1a1a'}; border: 1px solid ${isMe ? '#339900' : '#333'}; padding: 8px 12px; border-radius: 8px; color: #fff; font-size: 13px; word-break: break-word;">
                                <div>${m.message || ''}</div>
                                ${imageTag}
                            </div>
                        </div>`;
                    }).join('')}
            </div>

            <!-- Form Nhập tin nhắn, chọn ảnh và biểu cảm -->
            <form method="POST" id="chatForm" style="display: flex; flex-direction: column; gap: 6px;">
                <div style="display: flex; gap: 6px; align-items: center;">
                    <!-- Nút icon máy ảnh chọn ảnh -->
                    <label style="display: inline-flex; align-items: center; justify-content: center; background: #1a1a1a; border: 1px solid #444; color: #00ff00; width: 34px; height: 34px; border-radius: 4px; cursor: pointer; font-size: 16px;" title="Gửi ảnh">
                        📷
                        <input type="file" accept="image/*" onchange="compressAndSetChatImage(this)" style="display: none;">
                    </label>
                    <input type="hidden" id="chat-image-val" name="image_url">

                    <!-- Ô nhập nội dung -->
                    <input type="text" name="message" id="messageInput" placeholder="Nhập nội dung chát..." autocomplete="off" style="flex: 1; background: #000; color: #fff; border: 1px solid #444; padding: 8px; font-size: 13px; box-sizing: border-box; border-radius: 4px;">
                    
                    <button type="submit" class="btn" style="background: #0055ff; color: #fff; padding: 8px 14px; font-size: 13px; border-radius: 4px; cursor: pointer;">Gửi</button>
                </div>

                <!-- Bảng chọn nhanh icon biểu cảm (Emoji) -->
                <div style="display: flex; gap: 6px; align-items: center; background: #0d0d0d; padding: 4px; border: 1px solid #222; border-radius: 4px;">
                    <span style="font-size: 10px; color: #888; padding-left: 4px;">Biểu cảm:</span>
                    <button type="button" onclick="insertEmoji('😀')" style="background:none; border:none; cursor:pointer; font-size:14px;">😀</button>
                    <button type="button" onclick="insertEmoji('😂')" style="background:none; border:none; cursor:pointer; font-size:14px;">😂</button>
                    <button type="button" onclick="insertEmoji('❤️')" style="background:none; border:none; cursor:pointer; font-size:14px;">❤️</button>
                    <button type="button" onclick="insertEmoji('👍')" style="background:none; border:none; cursor:pointer; font-size:14px;">👍</button>
                    <button type="button" onclick="insertEmoji('🔥')" style="background:none; border:none; cursor:pointer; font-size:14px;">🔥</button>
                    <button type="button" onclick="insertEmoji('🎉')" style="background:none; border:none; cursor:pointer; font-size:14px;">🎉</button>
                    <button type="button" onclick="insertEmoji('😍')" style="background:none; border:none; cursor:pointer; font-size:14px;">😍</button>
                    <button type="button" onclick="insertEmoji('😎')" style="background:none; border:none; cursor:pointer; font-size:14px;">😎</button>
                    <div id="chat-compress-status" style="font-size: 10px; color: #00ff00; margin-left: auto;"></div>
                </div>
            </form>
            
            <div style="text-align: center; margin-top: 10px; font-size: 13px;">
                <a href="/mail/box">⬅ Hộp thư tin nhắn</a>
            </div>
        </div>
    </div>

    <script>
        const chatBox = document.getElementById('chatMessageBox');
        function scrollToBottom() {
            chatBox.scrollTop = chatBox.scrollHeight;
        }
        scrollToBottom();

        // Chèn emoji vào ô input
        function insertEmoji(emoji) {
            const input = document.getElementById('messageInput');
            input.value += emoji;
            input.focus();
        }

        // Tự động nén ảnh khi chọn qua nút máy ảnh
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
    </script>
    `;

    return new Response(renderLayout(`Trò chuyện với ${partner.display_name || partner.username}`, content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
