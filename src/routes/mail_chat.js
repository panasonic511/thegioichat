export async function handleMailChat(request, env, user, renderLayout, url) {
    const partnerId = url.searchParams.get('user');
    if (!partnerId) {
        return Response.redirect(new URL('/mail/box', request.url), 302);
    }

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
        } catch (e) {}
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

    // Đánh dấu đã đọc tin nhắn từ partner này
    try {
        await env.DB.prepare(
            "UPDATE mail_box SET is_read = 1 WHERE receiver_id = ? AND sender_id = ?"
        ).bind(user.id, partnerId).run();
    } catch (e) {}

    // Lấy lịch sử tin nhắn
    let messages = [];
    try {
        const history = await env.DB.prepare(`
            SELECT * FROM mail_box 
            WHERE (sender_id = ? AND receiver_id = ?) 
               OR (sender_id = ? AND receiver_id = ?) 
            ORDER BY id ASC
        `).bind(user.id, partnerId, partnerId, user.id).all();
        messages = history.results || [];
    } catch (e) {}

    const content = `
    <div class="box">
        <div class="box-title">🟢 Trò chuyện với ${partner.display_name || partner.username}</div>
        <div class="box-content" style="padding: 8px;">
            
            <!-- Khung chứa tin nhắn -->
            <div id="chatMessageBox" style="height: 350px; overflow-y: scroll; background: #000; border: 1px solid #333; padding: 10px; display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px;">
                ${messages.length === 0 ? '<div style="color: #777; text-align: center; margin-top: 140px;">Chưa có tin nhắn nào. Hãy bắt đầu cuộc trò chuyện!</div>' : 
                    messages.map(m => {
                        const isMe = Number(m.sender_id) === Number(user.id);
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

    <!-- Script tự động cập nhật tin nhắn ngầm (Realtime Polling) -->
    <script>
        const currentUserId = ${user.id};
        const partnerId = ${partnerId};
        const chatBox = document.getElementById('chatMessageBox');

        // Tự động cuộn xuống tin nhắn mới nhất khi mới vào trang
        function scrollToBottom() {
            chatBox.scrollTop = chatBox.scrollHeight;
        }
        scrollToBottom();

        // Kiểm tra tin nhắn mới mỗi 3 giây mà không cần F5 trang
        setInterval(async () => {
            try {
                const res = await fetch('/api/realtime-check?partner_id=' + partnerId);
                if (res.ok) {
                    const data = await res.json();
                    if (data.chat_messages && data.chat_messages.length > 0) {
                        let html = '';
                        data.chat_messages.forEach(m => {
                            const isMe = Number(m.sender_id) === currentUserId;
                            html += \`
                            <div style="display: flex; justify-content: \${isMe ? 'flex-end' : 'flex-start'};">
                                <div style="max-width: 75%; background: \${isMe ? '#1a3300' : '#1a1a1a'}; border: 1px solid \${isMe ? '#339900' : '#333'}; padding: 8px 12px; border-radius: 6px; color: #fff; font-size: 14px; word-break: break-word;">
                                    \${m.message}
                                </div>
                            </div>\`;
                        });
                        
                        // Chỉ cập nhật nếu có thay đổi nội dung để tránh giật khung cuộn
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
