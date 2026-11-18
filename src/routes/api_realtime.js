export async function handleRealtimeApi(request, env) {
    const cookie = request.headers.get('Cookie') || '';
    const match = cookie.match(/user_id=(\d+)/);
    if (!match) {
        return new Response(JSON.stringify({ unread_messages: 0, unread_notifications: 0 }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const userId = match[1];
    const url = new URL(request.url);
    const partnerId = url.searchParams.get('partner_id');

    let unreadMessages = 0;
    let unreadNotifications = 0;
    let chatMessages = [];

    try {
        // Đếm số tin nhắn chưa đọc
        const msgRes = await env.DB.prepare(`
            SELECT COUNT(*) as cnt FROM mail_box 
            WHERE receiver_id = ? AND is_read = 0
        `).bind(userId).first();
        if (msgRes) unreadMessages = msgRes.cnt || 0;
    } catch (e) {
        try {
            const msgRes2 = await env.DB.prepare(`
                SELECT COUNT(*) as cnt FROM mail_box 
                WHERE partner_id = ? AND is_read = 0
            `).bind(userId).first();
            if (msgRes2) unreadMessages = msgRes2.cnt || 0;
        } catch (err) {}
    }

    try {
        // Đếm thông báo chưa đọc (nếu có bảng notifications)
        const notiRes = await env.DB.prepare(`
            SELECT COUNT(*) as cnt FROM notifications 
            WHERE user_id = ? AND is_read = 0
        `).bind(userId).first();
        if (notiRes) unreadNotifications = notiRes.cnt || 0;
    } catch (e) {}

    // Nếu đang trong trang chat với 1 partner cụ thể, trả về lịch sử tin nhắn mới nhất
    if (partnerId) {
        try {
            let history = await env.DB.prepare(`
                SELECT * FROM mail_box 
                WHERE (sender_id = ? AND receiver_id = ?) 
                   OR (sender_id = ? AND receiver_id = ?) 
                ORDER BY id ASC
            `).bind(userId, partnerId, partnerId, userId).all();

            if (history.results && history.results.length > 0) {
                chatMessages = history.results;
            } else {
                let history2 = await env.DB.prepare(`
                    SELECT * FROM mail_box 
                    WHERE (user_id = ? AND partner_id = ?) 
                       OR (user_id = ? AND partner_id = ?) 
                    ORDER BY id ASC
                `).bind(userId, partnerId, partnerId, userId).all();
                chatMessages = history2.results || [];
            }
        } catch (e) {}
    }

    return new Response(JSON.stringify({
        unread_messages: unreadMessages,
        unread_notifications: unreadNotifications,
        chat_messages: chatMessages
    }), {
        headers: { 'Content-Type': 'application/json' }
    });
}
