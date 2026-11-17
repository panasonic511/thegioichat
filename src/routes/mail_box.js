export async function handleMailBox(request, env, user, renderLayout) {
    // Lấy danh sách các cuộc trò chuyện gần đây của người dùng
    const messages = await env.DB.prepare(`
        SELECT m.*, u.display_name, u.avatar, u.role, u.level 
        FROM messages m 
        JOIN users u ON (m.sender_id = u.id OR m.receiver_id = u.id) 
        WHERE (m.sender_id = ? OR m.receiver_id = ?) AND u.id != ?
        ORDER BY m.id DESC
    `).bind(user.id, user.id, user.id).all();

    const content = `
    <div class="box">
        <div class="box-title">✉️ Hộp thoại chính</div>
        <div class="box-content" style="padding: 5px;">
            <div style="background: #1a1a1a; padding: 8px; border-bottom: 1px solid #333; font-size: 11px; color: #ffcc00; margin-bottom: 8px;">
                💡 Bật thông báo để biết có tin nhắn mới, ngay cả khi đã thoát Thế Giới Chat.
            </div>

            <div id="conversation-list">
                ${messages.results.length === 0 ? '<div style="text-align: center; color: #888; padding: 15px;">Chưa có tin nhắn nào!</div>' : 
                    messages.results.map(msg => `
                    <div style="display: flex; align-items: center; border-bottom: 1px solid #222; padding: 8px 5px;">
                        <img src="${msg.avatar}" width="36" height="36" style="border-radius: 50%; margin-right: 10px;">
                        <div style="flex-grow: 1; overflow: hidden;">
                            <div><b>${msg.display_name}</b> <span style="font-size: 10px; color: #888;">· ${msg.created_at}</span></div>
                            <div style="font-size: 12px; color: #ccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${msg.message}</div>
                        </div>
                        <a href="/mail/chat?with=${msg.sender_id === user.id ? msg.receiver_id : msg.sender_id}" class="btn" style="padding: 4px 10px; font-size: 11px;">Hộp thoại</a>
                    </div>
                `).join('')}
            </div>
        </div>
    </div>

    <script>
        // Realtime tự động cập nhật hộp thoại mà không cần load lại trang
        setInterval(async () => {
            try {
                let res = await fetch('/api/realtime-check');
                let data = await res.json();
                if (data.has_new_message) {
                    location.reload(); // Tự động làm mới khi có tin nhắn mới thực tế
                }
            } catch(e) {}
        }, 4000);
    </script>
    `;

    return new Response(renderLayout('Hộp thoại chính', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
