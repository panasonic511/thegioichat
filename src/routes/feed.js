import { renderUser } from '../worker.js';

export async function handleProfile(request, env, user, renderLayout, url) {
    const targetId = url.searchParams.get('user') || user.id;
    let targetUser = user;

    if (String(targetId) !== String(user.id)) {
        try {
            const found = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(targetId).first();
            if (found) targetUser = found;
        } catch (e) {}
    }

    const rUser = renderUser(targetUser);

    function getRoleBadgeStyle(role) {
        const r = String(role || 'Thành Viên').trim();
        if (r === 'Chủ Wap') {
            return 'background: #2a0800; color: #ff3300; border: 1px solid #ff3300; text-shadow: 0 0 6px #ff0000; font-weight: bold; padding: 2px 8px; font-size: 11px; border-radius: 4px; display: inline-block;';
        } else if (r === 'Admin') {
            return 'background: #2a1a00; color: #ffcc00; border: 1px solid #ffcc00; text-shadow: 0 0 6px #ffcc00; font-weight: bold; padding: 2px 8px; font-size: 11px; border-radius: 4px; display: inline-block;';
        } else if (r === 'Mod') {
            return 'background: #001a2a; color: #00ffff; border: 1px solid #00ffff; text-shadow: 0 0 6px #00ffff; font-weight: bold; padding: 2px 8px; font-size: 11px; border-radius: 4px; display: inline-block;';
        } else {
            return 'background: #141414; color: #00ff00; border: 1px solid #444; font-weight: bold; padding: 2px 8px; font-size: 11px; border-radius: 4px; display: inline-block;';
        }
    }

    const content = `
    <div class="box">
        <div class="box-title">👤 Thông tin tài khoản cá nhân</div>
        <div class="box-content" style="text-align: center;">
            <div style="margin: 0 auto 12px auto; width: 80px; height: 80px;">${rUser.avatarHtml}</div>
            <div style="font-size: 16px; margin-bottom: 6px;">${rUser.nameHtml}</div>
            <div style="margin-bottom: 12px;"><span style="${getRoleBadgeStyle(targetUser.role)}">${targetUser.role || 'Thành viên'}</span></div>
            
            <div style="background: #121212; border: 1px solid #2a2a2a; padding: 10px; border-radius: 6px; text-align: left; font-size: 13px; max-width: 400px; margin: 0 auto;">
                <div style="padding: 6px 0; border-bottom: 1px solid #222;">⭐ Cấp độ: <strong>${targetUser.level || 1}</strong></div>
                <div style="padding: 6px 0; border-bottom: 1px solid #222;">👑 Vàng: <strong style="color: #ffcc00;">${(targetUser.gold || 0).toLocaleString()}</strong></div>
                <div style="padding: 6px 0; border-bottom: 1px solid #222;">🪙 Xu: <strong style="color: #38bdf8;">${(targetUser.coins || 0).toLocaleString()}</strong></div>
                <div style="padding: 6px 0;">🚻 Giới tính: <strong>${targetUser.gender === 'female' ? 'Nữ' : 'Nam'}</strong></div>
            </div>
        </div>
    </div>
    <div style="text-align: center; margin-top: 10px; font-size: 13px;">
        <a href="/shop">🛒 Ghé cửa hàng trang trí</a> · <a href="/">🏠 Về trang chủ</a>
    </div>
    `;

    return new Response(renderLayout('Trang cá nhân', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
