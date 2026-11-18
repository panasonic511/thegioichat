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
        const url = new URL(request.url);
        const chatPartnerId = url.searchParams.get('partner_id');

        let unreadMessages = 0;
        let unreadNotifications = 0;
        let chatMessages = [];

        // Đếm tổng tin nhắn chưa đọc
        try {
            const msgCheck = await env.DB.prepare(
                "SELECT COUNT(*) as total FROM mail_box WHERE receiver_id = ? AND (is_read = 0 OR is_read IS NULL)"
            ).bind(userId).first();
            unreadMessages = msgCheck?.total || 0;
        } catch (e) {}

        // Đếm thông báo chưa đọc
        try {
            const notiCheck = await env.DB.prepare(
                "SELECT COUNT(*) as total FROM notifications WHERE user_id = ? AND (is_read = 0 OR is_read IS NULL)"
            ).bind(userId).first();
            unreadNotifications = notiCheck?.total || 0;
        } catch (e) {}

        // Nếu đang ở trang chat với 1 partner cụ thể, lấy danh sách tin nhắn mới nhất
        if (chatPartnerId) {
            try {
                const query = `
                    SELECT * FROM mail_box 
                    WHERE (sender_id = ? AND receiver_id = ?) 
                       OR (sender_id = ? AND receiver_id = ?) 
                    ORDER BY id ASC
                `;
                const res = await env.DB.prepare(query).bind(userId, chatPartnerId, chatPartnerId, userId).all();
                chatMessages = res.results || [];
            } catch (e) {}
        }

        return new Response(JSON.stringify({
            unread_messages: unreadMessages,
            unread_notifications: unreadNotifications,
            chat_messages: chatMessages
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        return new Response(JSON.stringify({ unread_messages: 0, unread_notifications: 0, chat_messages: [] }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
