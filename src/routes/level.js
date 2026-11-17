export async function handleLevel(request, env, user, renderLayout) {
    // Lấy top 20 thành viên có level và số xu cao nhất
    const topUsers = await env.DB.prepare(`
        SELECT id, display_name, role, level, coins 
        FROM users 
        ORDER BY level DESC, coins DESC 
        LIMIT 20
    `).all();

    const content = `
    <div class="box">
        <div class="box-title">📊 Bảng Cấp Độ & Phân Cấp Chức Vụ</div>
        <div class="box-content" style="font-size: 13px;">
            <p>Hệ thống phân cấp bậc và quyền hạn chi tiết tại <b>Thế Giới Chat</b>:</p>
            <ul style="line-height: 1.6; padding-left: 20px;">
                <li>👑 <span style="color: #ff5555; font-weight: bold;">Chủ Wap:</span> Level 130 (Quyền tối cao toàn hệ thống)</li>
                <li>🛡️ <span style="color: yellow; font-weight: bold;">Admin:</span> Level 125 (Quản lý cấp cao)</li>
                <li>⚔️ <span style="color: #00ffff; font-weight: bold;">Mod:</span> Level 120 (Kiểm duyệt viên)</li>
                <li>👤 <span style="color: #fff;">Thành Viên:</span> Level từ 1 đến 119</li>
            </ul>
            <div style="background: #1a1a1a; padding: 8px; border-left: 3px solid #00ff00; margin: 10px 0; font-size: 12px;">
                📢 <b>Quy định đăng thông báo:</b> Thành viên phải đạt từ <b style="color: #ffcc00;">Level 50</b> trở lên mới có quyền đăng hoặc chỉnh sửa thông báo hệ thống!
            </div>

            <h3 style="margin-top: 15px; border-bottom: 1px solid #333; padding-bottom: 5px;">🏆 Bảng Xếp Hạng Top Thành Viên</h3>
            
            <div style="overflow-x: auto;">
                <table style="width: 100%; font-size: 12px; border-collapse: collapse; margin-top: 8px;">
                    <tr style="border-bottom: 1px solid #333; color: #00ff00; text-align: left;">
                        <th style="padding: 6px;">Hạng</th>
                        <th style="padding: 6px;">Thành viên</th>
                        <th style="padding: 6px;">Chức vụ</th>
                        <th style="padding: 6px; text-align: center;">Level</th>
                        <th style="padding: 6px; text-align: right;">Xu</th>
                    </tr>
                    ${topUsers.results.map((u, index) => `
                    <tr style="border-bottom: 1px solid #222;">
                        <td style="padding: 6px; font-weight: bold; color: ${index === 0 ? '#ffcc00' : index === 1 ? '#c0c0c0' : index === 2 ? '#cd7f32' : '#888'};">#${index + 1}</td>
                        <td style="padding: 6px;"><a href="/profile?user=${u.id}">${u.display_name}</a></td>
                        <td style="padding: 6px; color: yellow;">${u.role}</td>
                        <td style="padding: 6px; text-align: center; font-weight: bold;">${u.level}</td>
                        <td style="padding: 6px; text-align: right; color: #00ff00;">🪙 ${u.coins.toLocaleString()}</td>
                    </tr>
                    `).join('')}
                </table>
            </div>
        </div>
    </div>
    <div style="text-align: center;"><a href="/">⬅️ Về trang chủ</a></div>
    `;

    return new Response(renderLayout('Bảng cấp độ & Xếp hạng', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
