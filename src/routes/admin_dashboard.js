export async function handleAdminDashboard(request, env, user, renderLayout) {
    // Kiểm tra bảo mật: Thành viên thông thường hoàn toàn không được sử dụng
    if (!user || (user.role !== 'Chủ Wap' && user.role !== 'Admin' && user.role !== 'Mod')) {
        return new Response(`<!DOCTYPE html>
        <html lang="vi"><head><meta charset="UTF-8"><title>Truy cập bị từ chối</title>
        <style>body{background:#000;color:#ff5555;font-family:monospace;padding:30px;text-align:center;}</style>
        </head><body>
            <h2>⛔ LỖI BẢO MẬT & PHÂN QUYỀN</h2>
            <p>Bạn không có quyền truy cập khu vực quản lý này! Chỉ Chủ Wap, Admin và Mod mới được phép sử dụng.</p>
            <p><a href="/" style="color:#00ff00;">⬅️ Quay lại trang chủ</a></p>
        </body></html>`, { status: 403, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
    }

    // Lấy danh sách thành viên từ cơ sở dữ liệu D1
    const usersList = await env.DB.prepare("SELECT id, username, display_name, role, level, coins, created_at FROM users ORDER BY id DESC LIMIT 50").all();

    const content = `
    <div class="box">
        <div class="box-title">🛠️ Khu Vực Quản Lý Hệ Thống</div>
        <div class="box-content">
            <div style="background: #1a1a1a; padding: 10px; border-left: 3px solid #ffcc00; margin-bottom: 12px; font-size: 12px;">
                👤 Xin chào quản trị viên: <b>${user.display_name}</b><br>
                🛡️ Chức vụ: <span style="color:yellow;">${user.role}</span> | Level: <b>${user.level}</b>
            </div>

            <h3>📋 Danh sách thành viên & Phân cấp chức vụ</h3>
            <p style="font-size: 11px; color: #888;">Hệ thống phân quyền chuẩn: Chủ Wap (Lv.130), Admin (Lv.125), Mod (Lv.120), Thành Viên (Lv.1-119).</p>

            <div style="overflow-x: auto;">
                <table style="width: 100%; font-size: 11px; border-collapse: collapse; margin-top: 10px;">
                    <tr style="border-bottom: 1px solid #333; color: #00ff00; text-align: left;">
                        <th style="padding: 6px;">ID</th>
                        <th style="padding: 6px;">Tên hiển thị</th>
                        <th style="padding: 6px;">Chức vụ hiện tại</th>
                        <th style="padding: 6px; text-align: center;">Level</th>
                        <th style="padding: 6px; text-align: right;">Hành động quản lý</th>
                    </tr>
                    ${usersList.results.map(u => `
                    <tr style="border-bottom: 1px solid #222;">
                        <td style="padding: 6px;">#${u.id}</td>
                        <td style="padding: 6px;"><a href="/profile?user=${u.id}">${u.display_name}</a></td>
                        <td style="padding: 6px; color: yellow; font-weight: bold;">${u.role}</td>
                        <td style="padding: 6px; text-align: center;">${u.level}</td>
                        <td style="padding: 6px; text-align: right;">
                            <form method="POST" action="/admin/update-role" style="display: inline-flex; gap: 4px; align-items: center;">
                                <input type="hidden" name="user_id" value="${u.id}">
                                <select name="new_role" style="background: #000; color: #00ff00; border: 1px solid #444; padding: 2px; font-size: 10px;">
                                    <option value="Thành Viên" ${u.role==='Thành Viên'?'selected':''}>Thành Viên</option>
                                    <option value="Mod" ${u.role==='Mod'?'selected':''}>Mod</option>
                                    <option value="Admin" ${u.role==='Admin'?'selected':''}>Admin</option>
                                    <option value="Chủ Wap" ${u.role==='Chủ Wap'?'selected':''}>Chủ Wap</option>
                                </select>
                                <button type="submit" class="btn" style="padding: 3px 6px; font-size: 10px;">Cập nhật</button>
                            </form>
                        </td>
                    </tr>
                    `).join('')}
                </table>
            </div>
        </div>
    </div>
    <div style="text-align: center; margin-top: 15px;"><a href="/">⬅️ Về trang chủ</a></div>
    `;

    return new Response(renderLayout('Quản lý hệ thống', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
