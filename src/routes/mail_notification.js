import { renderUser } from '../utils/userStyle.js';

export async function handleMailNotification(request, env, user, renderLayout) {
    // Tự động tạo bảng thông báo (notifications) nếu chưa có trong D1
    try {
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                sender_id INTEGER,
                content TEXT NOT NULL,
                is_read INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
        `).run();
    } catch (e) {}

    // Nếu có yêu cầu API kiểm tra ngầm (AJAX) để trả về JSON không cần load lại trang
    const url = new URL(request.url);
    if (url.searchParams.get('format') === 'json') {
        let notifs = { results: [] };
        try {
            notifs = await env.DB.prepare(`
                n.*, u.display_name, u.avatar, u.role, u.level, u.name_color, u.name_glow, u.name_border, u.name_border_glow, u.border_color, u.avatar_glow
                FROM notifications n
                LEFT JOIN users u ON n.sender_id = u.id
                WHERE n.user_id = ?
                ORDER BY n.id DESC
                LIMIT 20
            `).bind(user.id).all();
        } catch (e) {
            // Fallback nếu bảng chưa join kịp
            try {
                notifs = await env.DB.prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 20").bind(user.id).all();
            } catch(err) {}
        }
        return new Response(JSON.stringify(notifs.results || []), {
            headers: { 'Content-Type': 'application/json;charset=UTF-8' }
        });
    }

    // Lấy danh sách thông tin ban đầu
    let notifications = { results: [] };
    try {
        notifications = await env.DB.prepare(`
            SELECT n.*, u.display_name, u.avatar, u.role, u.level, u.name_color, u.name_glow, u.name_border, u.name_border_glow, u.border_color, u.avatar_glow 
            FROM notifications n
            LEFT JOIN users u ON n.sender_id = u.id
            WHERE n.user_id = ?
            ORDER BY n.id DESC
            LIMIT 20
        `).bind(user.id).all();
    } catch (e) {
        notifications = { results: [] };
    }

    const content = `
    <div class="box">
        <div class="box-title" style="display: flex; justify-content: space-between; align-items: center;">
            <span>🔔 Thông báo hệ thống & Tương tác</span>
            <span style="font-size: 10px; color: #00ff00;" id="realtime-status">🟢 Đang cập nhật tự động...</span>
        </div>
        <div class="box-content" id="notification-list" style="padding: 4px;">
            ${notifications.results.length === 0 ? '<div style="text-align: center; color: #888; padding: 20px;" id="empty-notif">Chưa có thông báo nào!</div>' : 
                notifications.results.map(n => renderNotificationItem(n)).join('')}
        </div>
    </div>

    <div style="text-align: center; margin-top: 10px;"><a href="/">⬅️ Về trang chủ</a></div>

    <!-- Script tự động fetch ngầm mỗi 3 giây để cập nhật thông tin mượt mà không cần load lại trang -->
    <script>
        async function fetchNewNotifications() {
            try {
                const response = await fetch('/mail/notification?format=json');
                if (response.ok) {
                    const data = await response.json();
                    const listEl = document.getElementById('notification-list');
                    if (data.length === 0) {
                        listEl.innerHTML = '<div style="text-align: center; color: #888; padding: 20px;">Chưa có thông báo nào!</div>';
                        return;
                    }
                    
                    let html = '';
                    data.forEach(n => {
                        const avatarUrl = (n.avatar && !n.avatar.includes('7gXvS6v')) ? n.avatar : "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100' height='100' fill='%231a1a1a'/><circle cx='50' cy='38' r='18' fill='%2300ff00'/></svg>";
                        html += \`
                        <div style="border-bottom: 1px solid #222; padding: 8px 4px; margin-bottom: 6px; display: flex; align-items: flex-start; gap: 8px; background: \${n.is_read ? 'transparent' : '#0a1a0a'};">
                            <img src="\${avatarUrl}" width="32" height="32" style="border-radius: 50%; object-fit: cover; border: 1px solid #00ff00;">
                            <div style="flex: 1; font-size: 11px;">
                                <div style="color: #fff;">\${n.content}</div>
                                <div style="color: #888; font-size: 9px; margin-top: 2px;">\${n.created_at || 'Vừa xong'}</div>
                            </div>
                        5div>\`;
                    });
                    listEl.innerHTML = html;
                }
            } catch (err) {
                console.error('Lỗi đồng bộ thông báo:', err);
            }
        }

        // Tự động gọi lại mỗi 3 giây
        setInterval(fetchNewNotifications, 3000);
    </script>
    `;

    return new Response(renderLayout('Thông báo', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}

function renderNotificationItem(n) {
    const defaultAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100' height='100' fill='%231a1a1a'/><circle cx='50' cy='38' r='18' fill='%2300ff00'/></svg>";
    const avatarUrl = (n.avatar && !n.avatar.includes('7gXvS6v')) ? n.avatar : defaultAvatar;
    
    return `
    <div style="border-bottom: 1px solid #222; padding: 8px 4px; margin-bottom: 6px; display: flex; align-items: flex-start; gap: 8px; background: ${n.is_read ? 'transparent' : '#0a1a0a'};">
        <img src="${avatarUrl}" width="32" height="32" style="border-radius: 50%; object-fit: cover; border: 1px solid #00ff00;">
        <div style="flex: 1; font-size: 11px;">
            <div style="color: #fff;">${n.content}</div>
            <div style="color: #888; font-size: 9px; margin-top: 2px;">${n.created_at || 'Vừa xong'}</div>
        </div>
    </div>
    `;
}
