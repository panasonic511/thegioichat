export async function handleMailChat(request, env, user, renderLayout, url) {
    const partnerId = url.searchParams.get('user');
    if (!partnerId) {
        return Response.redirect(new URL('/mail/box', request.url), 302);
    }

    // Tự động kiểm tra và tạo bảng mail_box nếu chưa tồn tại để chống lỗi không gửi được tin nhắn
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

    // Xử lý gửi tin nhắn mới (POST)
    if (request.method === 'POST') {
        try {
            const formData = await request.formData();
            const message = formData.get('message');
            if (message && message.trim() !== '') {
                await env.DB.prepare(
                    "INSERT INTO mail_box (sender_id, receiver_id, message, is_read, created_at) VALUES (?, ?, ?, 0, datetime('now'))"
                ).bind(user.id, partnerId, message.trim()).run();
            }
        } catch (err) {
            // Trường hợp bảng cũ dùng cột user_id / partner_id thay vì sender_id / receiver_id
            try {
                const formData = await request.formData();
                const message = formData.get('message');
                if (message && message.trim() !== '') {
                    await env.DB.prepare(
                        "INSERT INTO mail_box (user_id, partner_id, message, is_read, created_at) VALUES (?, ?, ?, 0, datetime('now'))"
                    ).bind(user.id, partnerId, message.trim()).run();
                }
            } catch (e) {}
        }
        return Response.redirect(new URL(`/mail/chat?user=${partnerId}`, request.url), 302);
    }

    // Lấy thông tin đối phương
    let partner = null;
    try {
        partner = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(partnerId).first();
    } catch (e) {}

    if (!partner) {
        return new Response("Không tìm thấy thành viên này.", { status: 404 });
    }

    // Đánh dấu đã đọc tin nhắn
    try {
        await env.DB.prepare(
            "UPDATE mail_box SET is_read = 1 WHERE (receiver_id = ? AND sender_id = ?) OR (partner_id = ? AND user_id = ?)"
        ).bind(user.id, partnerId, user.id, partnerId).run();
    } catch (e) {}

    // Lấy lịch sử tin nhắn
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

    const content = `
    <div class="box">
        <div class="box-title">🟢 Trò chuyện với ${partner.display_name || partner.username}</div>
        <div class="box-content" style="padding: 8px;">
            
            <!-- Khung chứa tin nhắn -->
            <div id="chatMessageBox" style="height: 350px; overflow-y: scroll; background: #000; border: 1px solid #333; padding: 10px; display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px;">
                ${messages.length === 0 ? '<div style="color: #777; text-align: center; margin-top: 140px;">Chưa có tin nhắn nào. Hãy gửi tin nhắn mở lời!</div>' : 
                    messages.map(m => {
                        const sender = m.sender_id || m.user_id;
                        const isMe = Number(sender) === Number(user.id);
                        return `
                        <div style="display: flex; justify-content: ${isMe ? 'flex-end' : 'flex-start'};">
                            <div style="max-width: 75%; background: ${isMe ? '#1a3300' : '#1a1a1a'}; border: 1px solid ${isMe ? '#339900' : '#333'}; padding: 8px 12px; border-radius: 6px; color: #fff; font-size: 14px; word-break: break-word;">
                                ${m.message}
                            </div>
                        </div>`;
                    }).join('')}
            </div>

            <!-- Form gửi tin nhắn -->
            <form method="POST" id="chatForm" style="display: flex; gap: 6px;">
                <input type="text" name="message" id="messageInput" placeholder="Nhập nội dung chát..." required autocomplete="off" style="flex: 1; background: #000; color: #fff; border: 1px solid #444; padding: 8px; font-size: 14px; box-sizing: border-box;">
                <button type="submit" class="btn" style="background: #0055ff; color: #fff; padding: 8px 14px; font-size: 14px;">Gửi</button>
            </form>
            
            <div style="text-align: center; margin-top: 10px; font-size: 13px;">
                <a href="/mail/box">⬅ Hộp thư tin nhắn</a>
            </div>
        </div>
    </div>

    <!-- Script tự động cập nhật tin nhắn ngầm -->
    <script>
        const currentUserId = ${user.id};
        const partnerId = ${partnerId};
        const chatBox = document.getElementById('chatMessageBox');

        function scrollToBottom() {
            chatBox.scrollTop = chatBox.scrollHeight;
        }
        scrollToBottom();

        setInterval(async () => {
            try {
                const res = await fetch('/api/realtime-check?partner_id=' + partnerId);
                if (res.ok) {
                    const data = await res.json();
                    if (data.chat_messages && data.chat_messages.length > 0) {
                        let html = '';
                        data.chat_messages.forEach(m => {
                            const sender = m.sender_id || m.user_id;
                            const isMe = Number(sender) === currentUserId;
                            html += \`
                            <div style="display: flex; justify-content: \${isMe ? 'flex-end' : 'flex-start'};">
                                <div style="max-width: 75%; background: \${isMe ? '#1a3300' : '#1a1a1a'}; border: 1px solid \${isMe ? '#339900' : '#333'}; padding: 8px 12px; border-radius: 6px; color: #fff; font-size: 14px; word-break: break-word;">
                                    \${m.message}
                                </div>
                            </div>\`;
                        });
                        
                        if (chatBox.innerHTML !== html) {
                            const isAtBottom = chatBox.scrollHeight - chatBox.scrollTop <= chatBox.clientHeight + 50;
                            chatBox.innerHTML = html;
                            if (isAtBottom) {
                                scrollToBottom();
                            }
                        }
                    }
                }
            } catch (e) {}
        }, 3000);
    </script>
    `;

    return new Response(renderLayout(`Trò chuyện với ${partner.display_name || partner.username}`, content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
