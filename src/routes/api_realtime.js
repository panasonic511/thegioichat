export async function handleRealtimeApi(request, env) {
    try {
        const cookie = request.headers.get('Cookie') || '';
        const match = cookie.match(/user_id=(\d+)/);
        if (!match) {
            return new Response(JSON.stringify({ unread_messages: 0, unread_notifications: 0 }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
        const userId = match[1];

        let unreadMessages = 0;
        let unreadNotifications = 0;

        // Kiểm tra an toàn hộp thư tin nhắn (Hỗ trợ cả cột is_read hoặc status)
        try {
            const msgCheck = await env.DB.prepare(
                "SELECT COUNT(*) as total FROM mail_box WHERE receiver_id = ? AND (is_read = 0 OR is_read IS NULL)"
            ).bind(userId).first();
            unreadMessages = msgCheck?.total || 0;
        } catch (err) {
            try {
                // Fallback nếu bảng dùng tên cột khác
                const msgCheck2 = await env.DB.prepare(
                    "SELECT COUNT(*) as total FROM mail_box WHERE receiver_id = ?"
                ).bind(userId).first();
                unreadMessages = msgCheck2?.total || 0;
            } catch (e) {}
        }

        // Kiểm tra an toàn bảng thông báo hệ thống
        try {
            const notiCheck = await env.DB.prepare(
                "SELECT COUNT(*) as total FROM notifications WHERE user_id = ? AND (is_read = 0 OR is_read IS NULL)"
            ).bind(userId).first();
            unreadNotifications = notiCheck?.total || 0;
        } catch (err) {}

        return new Response(JSON.stringify({
            unread_messages: unreadMessages,
            unread_notifications: unreadNotifications
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        return new Response(JSON.stringify({ unread_messages: 0, unread_notifications: 0 }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
