export async function handleMailChat(request, env, user, renderLayout, url) {
    const partnerId = url.searchParams.get('with');
    if (!partnerId) return Response.redirect(302, '/mail/box');

    const partner = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(partnerId).first();
    if (!partner) return new Response("Không tìm thấy người dùng này!", { status: 404 });

    // Xử lý gửi tin nhắn mới (POST)
    if (request.method === 'POST') {
        const formData = await request.formData();
        const message = formData.get('message');
        if (message && message.trim() !== '') {
            await env.DB.prepare("INSERT INTO messages (sender_id, receiver_id, message) VALUES (?, ?, ?)")
                .bind(user.id, partner.id, message).run();
        }
        return Response.redirect(302, `/mail/chat?with=${partner.id}`);
    }

    // Lấy lịch sử tin nhắn giữa 2 người
    const chatHistory = await env.DB.prepare(`
        SELECT * FROM messages 
        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
        ORDER BY id ASC
    `).bind(user.id, partner.id, partner.id, user.id).all();

    const content = `
    <div class="box">
        <div class="box-title">💬 Trò chuyện với: ${partner.display_name} [Lv.${partner.level}]</div>
        <div class="box-content">
            <div id="chat-box" style="height: 300px; overflow-y: scroll; background: #050505; border: 1px solid #333; padding: 10px; margin-bottom: 10px; font-size: 13px;">
                ${chatHistory.results.map(c => `
                    <div style="margin-bottom: 8px; ${c.sender_id === user.id ? 'text-align: right;' : 'text-align: left;'}">
                        <span style="font-size: 10px; color: #888;">${c.created_at}</span><br>
                        <span style="display: inline-block; padding: 6px 10px; border-radius: 6px; background: ${c.sender_id === user.id ? '#0033cc' : '#222'}; color: #fff; text-align: left;">
                            ${c.message}
                        </span>
                    </div>
                `).join('')}
            </div>

            <form method="POST" action="/mail/chat?with=${partner.id}" style="display: flex; gap: 5px;">
                <input type="text" name="message" required placeholder="Nhập tin nhắn..." style="flex-grow: 1; margin: 0;">
                <button type="submit" class="btn">Gửi</button>
            </form>
        </div>
    </div>
    <div style="text-align: center;"><a href="/mail/box">⬅️ Quay lại hộp thư</a></div>

    <script>
        // Tự động cuộn xuống tin nhắn mới nhất
        const chatBox = document.getElementById('chat-box');
        chatBox.scrollTop = chatBox.scrollHeight;

        // Realtime tự động kiểm tra tin nhắn mới trong phòng chat này
        setInterval(async () => {
            try {
                let res = await fetch('/api/realtime-check');
                let data = await res.json();
                if (data.has_new_message) {
                    location.reload();
                }
            } catch(e) {}
        }, 3000);
    </script>
    `;

    return new Response(renderLayout(`Chat với ${partner.display_name}`, content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
