export async function handleLevel(request, env, user, renderLayout) {
    // Tự động kiểm tra nếu bảng users trống thì tạo vài tài khoản mẫu để hiển thị
    try {
        const check = await env.DB.prepare("SELECT COUNT(*) as total FROM users").first();
        if (!check || check.total === 0) {
            await env.DB.prepare(`
                INSERT INTO users (username, display_name, role, level, coins, gold, name_color, name_glow, border_color) 
                VALUES ('admin', 'Chủ Wap Master', 'Chủ Wap', 99, 500000, 1000, '#ff3300', '#ff0000', '#ff3300')
            `).run();
            await env.DB.prepare(`
                INSERT INTO users (username, display_name, role, level, coins, gold, name_color, name_glow, border_color) 
                VALUES ('mod01', 'Kiểm Duyệt Viên', 'Mod', 50, 100000, 200, '#00ffff', '#0099ff', '#00ffff')
            `).run();
        }
    } catch (e) {}

    let users = { results: [] };
    try {
        users = await env.DB.prepare(`
            SELECT id, user_id, display_name, username, role, level, coins, gold,
                   name_color, name_glow, name_border, name_border_glow, border_color, avatar_glow, avatar 
            FROM users 
            ORDER BY level DESC, coins DESC 
            LIMIT 50
        `).all();
    } catch (e) {}

    // Hàm render hiệu ứng màu sắc và khung WAP cho tên người dùng
    function safeRenderUser(u) {
        const safe = u || {};
        const defaultAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100' height='100' fill='%231a1a1a'/><circle cx='50' cy='38' r='18' fill='%2300ff00'/></svg>";
        const avt = (safe.avatar && !String(safe.avatar).includes('7gXvS6v')) ? safe.avatar : defaultAvatar;
        
        const borderColor = safe.border_color || '#ffcc00';
        let avtStyle = `border-radius: 50%; object-fit: cover; border: 2px solid ${borderColor};`;
        if (safe.avatar_glow && safe.avatar_glow !== '#000000') avtStyle += ` box-shadow: 0 0 10px ${safe.avatar_glow};`;

        const nameColor = safe.name_color || '#00ff00';
        let nameStyle = `color: ${nameColor}; font-weight: bold;`;
        let shadows = [];
        if (safe.name_glow && safe.name_glow !== '#000000') shadows.push(`0 0 6px ${safe.name_glow}`);
        if (safe.name_border_glow && safe.name_border_glow !== '#000000') shadows.push(`0 0 4px ${safe.name_border_glow}`);
        if (shadows.length > 0) nameStyle += ` text-shadow: ${shadows.join(', ')};`;
        if (safe.name_border && safe.name_border !== '#000000') nameStyle += ` -webkit-text-stroke: 0.5px ${safe.name_border};`;

        const name = safe.display_name || safe.username || 'Thành viên';
        const uid = safe.user_id || safe.id || '';

        return {
            avatarUrl: avt,
            avatarStyle: avtStyle,
            nameHtml: `<a href="/profile?user=${uid}" style="${nameStyle}">${name}</a>`
        };
    }

    // Hàm hiệu ứng chức vụ chuẩn WAP
    function getRoleBadgeStyle(role) {
        const r = String(role || 'Thành Viên').trim();
        if (r === 'Chủ Wap') {
            return 'background: #2a0800; color: #ff3300; border: 1px solid #ff3300; text-shadow: 0 0 6px #ff0000; font-weight: bold; padding: 1px 6px; font-size: 10px; border-radius: 3px; display: inline-block;';
        } else if (r === 'Admin') {
            return 'background: #2a1a00; color: #ffcc00; border: 1px solid #ffcc00; text-shadow: 0 0 6px #ffcc00; font-weight: bold; padding: 1px 6px; font-size: 10px; border-radius: 3px; display: inline-block;';
        } else if (r === 'Mod') {
            return 'background: #001a2a; color: #00ffff; border: 1px solid #00ffff; text-shadow: 0 0 6px #00ffff; font-weight: bold; padding: 1px 6px; font-size: 10px; border-radius: 3px; display: inline-block;';
        } else {
            return 'background: #141414; color: #00ff00; border: 1px solid #444; font-weight: bold; padding: 1px 6px; font-size: 10px; border-radius: 3px; display: inline-block;';
        }
    }

    let rankListHtml = '';
    if (!users.results || users.results.length === 0) {
        rankListHtml = '<div style="text-align: center; color: #777; padding: 10px;">Chưa có dữ liệu thành viên.</div>';
    } else {
        rankListHtml = users.results.map((u, index) => {
            const uUI = safeRenderUser(u);
            const roleStyle = getRoleBadgeStyle(u.role);
            let rankNum = index + 1;
            let rankColor = '#fff';
            if (rankNum === 1) rankColor = '#ff3333';
            else if (rankNum === 2) rankColor = '#ffcc00';
            else if (rankNum === 3) rankColor = '#00ffff';

            return `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border-bottom: 1px solid #222; background: ${index % 2 === 0 ? '#080808' : '#030303'};">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-weight: bold; width: 24px; text-align: center; color: ${rankColor};">#${rankNum}</span>
                    <img src="${uUI.avatarUrl}" width="36" height="36" style="${uUI.avatarStyle} display:block;">
                    <div>
                        <div style="font-size: 14px;">
                            ${uUI.nameHtml} 
                            <span style="margin-left: 4px;">${u.role ? `<span style="${roleStyle}">${u.role}</span>` : ''}</span>
                        </div>
                        <div style="color: #aaa; font-size: 12px; margin-top: 2px;">
                            Cấp độ: <span style="color: #ffcc00; font-weight: bold;">${u.level || 1}</span>
                        </div>
                    </div>
                </div>
                <div style="text-align: right; font-size: 12px;">
                    <div style="color: #00ff00;">🪙 ${(u.coins || 0).toLocaleString()}</div>
                    ${u.gold ? `<div style="color: #ffcc00;">👑 ${u.gold.toLocaleString()}</div>` : ''}
                </div>
            </div>`;
        }).join('');
    }

    const content = `
    <div class="box">
        <div class="box-title">📊 Bảng cấp độ & Phân cấp chức vụ</div>
        <div class="box-content" style="padding: 0;">
            ${rankListHtml}
        </div>
    </div>
    <div style="text-align: center; margin-top: 10px; font-size: 13px;">
        <a href="/">⬅ Quay lại trang chủ</a>
    </div>
    `;

    return new Response(renderLayout('Bảng cấp độ', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
