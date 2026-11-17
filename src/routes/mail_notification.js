export async function handleMailNotification(request, env, user, renderLayout) {
    // Đánh dấu toàn bộ thông báo là đã đọc
    await env.DB.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?").bind(user.id).run();

    // Lấy danh sách thông báo
    const notifs = await env.DB.prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC").bind(user.id).all();

    const content = `
    <div class="box">
        <div class="box-title" style="display: flex; justify-content: space-between; align-items: center;">
            <span>🔔 Thông báo (${notifs.results.length})</span>
            <a href="/mail/notification" style="font-size: 11px; color: #ffcc00;">Làm mới</a>
        </div>
        <div class="box-content">
            ${notifs.results.length === 0 ? '<div style="text-align: center; color: #888; padding: 20px;">Danh sách trống!</div>' : 
                notifs.results.map(n => `
                <div style="padding: 8px 0; border-bottom: 1px solid #222; font-size: 13px;">
                    <div>${n.content}</div>
                    <div style="font-size: 10px; color: #888; margin-top: 2px;">${n.created_at}</div>
                </div>
            `).join('')}
        </div>
    </div>
    `;

    return new Response(renderLayout('Thông báo', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
