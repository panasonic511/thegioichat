import { renderUser } from '../worker.js';

export async function handleIndex(request, env, user, renderLayout) {
    let onlineUsers = [];
    try {
        const res = await env.DB.prepare("SELECT * FROM users ORDER BY id DESC LIMIT 10").all();
        if (res.results) onlineUsers = res.results;
    } catch (e) {}

    let onlineListHtml = '';
    if (onlineUsers.length === 0) {
        onlineListHtml = '<div style="color: #777; text-align: center; padding: 10px;">Chưa có thành viên nào online.</div>';
    } else {
        onlineListHtml = onlineUsers.map(u => {
            const rUser = renderUser(u);
            return `
            <div style="display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px dashed #222;">
                <div style="width: 32px; height: 32px;">${rUser.avatarHtml}</div>
                <div>
                    <div>${rUser.nameHtml}</div>
                    <div style="font-size: 11px; color: #aaa;">Cấp độ: ${u.level || 1} · Xu: ${(u.coins || 0).toLocaleString()}</div>
                </div>
            </div>`;
        }).join('');
    }

    const content = `
    <div class="box">
        <div class="box-title">📢 Thông báo hệ thống</div>
        <div class="box-content">
            <div style="color: #00ff00; font-weight: bold; margin-bottom: 6px;">Chào mừng bạn đến với Thế Giới Chat!</div>
            <p style="margin: 0; color: #ccc; font-size: 13px;">Hệ thống WAP MXH hoàn chỉnh với đầy đủ tính năng tủ đồ, trang trí màu sắc, khung avatar và icon độc quyền.</p>
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
