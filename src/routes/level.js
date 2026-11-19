import { renderUser } from '../worker.js';

export async function handleLevel(request, env, user, renderLayout) {
    let users = { results: [] };
    try {
        users = await env.DB.prepare(`
            SELECT * FROM users 
            ORDER BY COALESCE(level, 1) DESC, COALESCE(coins, 0) DESC, id ASC
            LIMIT 50
        `).all();
    } catch (e) {}

    let rankListHtml = '';
    if (!users.results || users.results.length === 0) {
        rankListHtml = '<div style="text-align: center; color: #777; padding: 10px;">Chưa có dữ liệu thành viên.</div>';
    } else {
        rankListHtml = users.results.map((u, index) => {
            const uUI = renderUser(u);
            const styledAvt = String(uUI.avatarHtml || '').replace(
                'style="',
                'style="width: 36px; height: 36px; display: block; '
            );
            let rankNum = index + 1;
            let rankColor = '#fff';
            if (rankNum === 1) rankColor = '#ff3333';
            else if (rankNum === 2) rankColor = '#ffcc00';
            else if (rankNum === 3) rankColor = '#00ffff';

            return `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border-bottom: 1px solid #222; background: ${index % 2 === 0 ? '#080808' : '#030303'};">
                <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                    <span style="font-weight: bold; width: 24px; text-align: center; color: ${rankColor}; flex-shrink: 0;">#${rankNum}</span>
                    <div style="width: 36px; height: 36px; flex-shrink: 0;">${styledAvt}</div>
                    <div style="min-width: 0;">
                        <div style="font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${uUI.nameHtml}
                        </div>
                        <div style="color: #aaa; font-size: 12px; margin-top: 2px;">
                            Cấp độ: <span style="color: #ffcc00; font-weight: bold;">${u.level || 1}</span>
                        </div>
                    </div>
                </div>
                <div style="text-align: right; font-size: 12px; flex-shrink: 0;">
                    <div style="color: #00ff00;">🪙 ${(u.coins || 0).toLocaleString()}</div>
                    ${u.gold ? `<div style="color: #ffcc00;">👑 ${u.gold.toLocaleString()}</div>` : ''}
                </div>
            </div>`;
        }).join('');
    }

    const content = `
    <div class="box">
        <div class="box-title">📊 Bảng cấp độ</div>
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
