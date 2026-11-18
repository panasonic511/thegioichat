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

        // Đếm số tin nhắn chưa đọc trong hộp thư
        const msgCount = await env.DB.prepare(
            "SELECT COUNT(*) as total FROM mail_box WHERE receiver_id = ? AND is_read = 0"
        ).bind(userId).first();

        // Đếm số thông báo chưa đọc
        const notiCount = await env.DB.prepare(
            "SELECT COUNT(*) as total FROM notifications WHERE user_id = ? AND is_read = 0"
        ).bind(userId).first();

        return new Response(JSON.stringify({
            unread_messages: msgCount?.total || 0,
            unread_notifications: notiCount?.total || 0
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        return new Response(JSON.stringify({ unread_messages: 0, unread_notifications: 0 }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
