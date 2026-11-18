import { renderUser } from '../worker.js';

export async function handleIndex(request, env, user, renderLayout) {
    let onlineUsers = [];
    let totalUsers = 1;
    let totalPosts = 0;

    try {
        const uCount = await env.DB.prepare("SELECT COUNT(*) as total FROM users").first();
        if (uCount && uCount.total !== undefined) totalUsers = uCount.total;
    } catch (e) {}

    try {
        const pCount = await env.DB.prepare("SELECT COUNT(*) as total FROM posts").first();
        if (pCount && pCount.total !== undefined) totalPosts = pCount.total;
    } catch (e) {}

    try {
        const res = await env.DB.prepare(`
            SELECT id, display_name, username, role, level, name_color, name_glow, name_border, name_border_glow, border_color, avatar_glow, avatar, active_icon 
            FROM users 
            ORDER BY id DESC 
            LIMIT 10
        `).all();
        if (res.results) onlineUsers = res.results;
    } catch (e) {}

    function safeRenderUser(u) {
        const safe = new Proxy(u || {}, {
            get(target, prop) {
                if (prop === 'id' || prop === 'user_id') return target[prop] || 0;
                return target[prop] !== undefined && target[prop] !== null ? target[prop] : '';
            }
        });

        const defaultAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100' height='100' fill='%230f172a'/><circle cx='50' cy='38' r='18' fill='%2338bdf8'/><path d='M15 88 C15 65, 85 65, 85 88' fill='%2338bdf8'/></svg>";
        const avt = (safe.avatar && !String(safe.avatar).includes('7gXvS6v')) ? safe.avatar : defaultAvatar;

        const borderColor = safe.border_color || '#ffcc00';
        let avtStyle = `border-radius: 50%; object-fit: cover; border: 2px solid ${borderColor};`;
        if (safe.avatar_glow && safe.avatar_glow !== '#000000') {
            avtStyle += ` box-shadow: 0 0 10px ${safe.avatar_glow};`;
        }

        const nameColor = safe.name_color || '#00ff00';
        let nameStyle = `color: ${nameColor}; font-weight: bold;`;
        let shadows = [];
        if (safe.name_glow && safe.name_glow !== '#000000') shadows.push(`0 0 6px ${safe.name_glow}`);
        if (safe.name_border_glow && safe.name_border_glow !== '#000000') shadows.push(`0 0 4px ${safe.name_border_glow}`);
        if (shadows.length > 0) nameStyle += ` text-shadow: ${shadows.join(', ')};`;
        if (safe.name_border && safe.name_border !== '#000000') nameStyle += ` -webkit-text-stroke: 0.5px ${safe.name_border};`;

        const name = safe.display_name || safe.username || 'Thành viên';
        const uid = safe.user_id || safe.id || '';
        const icon = safe.active_icon ? `${safe.active_icon} ` : '';

        return {
            avatarStyle: avtStyle,
            avatarUrl: avt,
            nameStyle,
            nameHtml: `<a href="/profile?user=${uid}" style="${nameStyle}">${icon}${name}</a>`
        };
    }

    let onlineListHtml = '';
    if (onlineUsers.length === 0) {
        onlineListHtml = '<div style="color: #777; text-align: center; padding: 10px;">Chưa có thành viên nào.</div>';
    } else {
        onlineListHtml = onlineUsers.map(u => {
            const rUser = safeRenderUser(u);
            return `
            <div style="display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px dashed #222;">
                <div style="width: 36px; height: 36px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
                    <a href="/profile?user=${u.id}"><img src="${rUser.avatarUrl}" style="width: 36px; height: 36px; ${rUser.avatarStyle}"></a>
                </div>
                <div style="flex-grow: 1; overflow: hidden;">
                    <div style="font-size: 13px; font-weight: bold;">${rUser.nameHtml}</div>
                    <div style="font-size: 11px; color: #aaa; margin-top: 1px;">Cấp độ: ${u.level || 1} · Xu: ${(u.coins || 0).toLocaleString()}</div>
                </div>
            </div>`;
        }).join('');
    }

    const content = `
    <div class="box">
        <div class="box-title">📢 Thông báo hệ thống & Giới thiệu</div>
        <div class="box-content">
            <div style="color: #00ff00; font-weight: bold; margin-bottom: 6px;">Chào mừng bạn đến với Thế Giới Chat (GAUBONG.US)!</div>
            <p style="margin: 0 0 10px 0; color: #ccc; font-size: 13px; line-height: 1.5;">
                Nền tảng mạng xã hội WAP đỉnh cao, nơi kết bạn, trò chuyện, giải trí và tùy chỉnh phong cách cá nhân hóa cực chất với hệ thống tủ đồ, khung avatar, icon và hiệu ứng màu sắc độc quyền.
            </p>
            ${!user ? `
            <div style="text-align: center; margin-top: 12px;">
                <a href="/login" class="btn" style="background: #00aa00; color: #fff; margin-right: 8px; padding: 6px 14px;">Đăng nhập</a>
                <a href="/register" class="btn" style="background: #1c1c1c; color: #00ff00; border: 1px solid #00ff00; padding: 6px 14px;">Đăng ký tài khoản</a>
            </div>
            ` : ''}
        </div>
    </div>

    <div class="box">
        <div class="box-title">📊 Thống kê mạng xã hội</div>
        <div class="box-content" style="font-size: 13px; color: #ccc;">
            <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #222;">
                <span>👥 Tổng thành viên đăng ký:</span>
                <strong style="color: #00ff00;">${totalUsers.toLocaleString()}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #222;">
                <span>📋 Tổng bài viết trên bảng tin:</span>
                <strong style="color: #ffcc00;">${totalPosts.toLocaleString()}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 6px 0;">
                <span>🟢 Trạng thái hệ thống:</span>
                <strong style="color: #00ff00;">Hoạt động ổn định (99.9%)</strong>
            </div>
        </div>
    </div>

    <div class="box">
        <div class="box-title">⚡ Tiện ích & Lối tắt nhanh</div>
        <div class="box-content" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <a href="/shop" class="btn" style="text-align: center; padding: 10px;">🛒 Cửa hàng vật phẩm</a>
            <a href="/shop/inventory" class="btn" style="text-align: center; padding: 10px;">📦 Túi đồ cá nhân</a>
            <a href="/users/feed" class="btn" style="text-align: center; padding: 10px;">📋 Xem bảng tin</a>
            <a href="/game" class="btn" style="text-align: center; padding: 10px;">🎮 Góc giải trí</a>
        </div>
    </div>

    <div class="box">
        <div class="box-title">🟢 Thành viên hoạt động gần đây</div>
        <div class="box-content">
            ${onlineListHtml}
        </div>
    </div>
    `;

    return new Response(renderLayout('Trang chủ', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
