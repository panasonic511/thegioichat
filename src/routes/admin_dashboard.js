export async function handleAdminDashboard(request, env, user, renderLayout) {
    // Chỉ Chủ Wap, Admin và Mod mới được vào trang quản lý
    if (!user || (user.role !== 'Chủ Wap' && user.role !== 'Admin' && user.role !== 'Mod')) {
        return new Response("Truy cập bị từ chối! Bạn không có quyền quản trị viên.", { status: 403 });
    }

    let message = "";

    // Xử lý cập nhật thông tin thành viên
    if (request.method === 'POST') {
        const formData = await request.formData();
        const targetUserId = formData.get('user_id');
        const newRole = formData.get('role');
        const newCoins = formData.get('coins');
        const newLevel = formData.get('level');

        try {
            // Mod không được quyền set chức vụ Chủ Wap hoặc Admin
            if (user.role === 'Mod' && (newRole === 'Chủ Wap' || newRole === 'Admin')) {
                throw new Error("Mod không có quyền cấp bậc cao hơn!");
            }

            await env.DB.prepare("UPDATE users SET role = ?, coins = ?, level = ? WHERE id = ?")
                .bind(newRole, newCoins, newLevel, targetUserId)
                .run();
            message = `<div style="color: #00ff00; background: #001a00; padding: 6px; text-align: center; margin-bottom: 8px;">✅ Cập nhật thành viên thành công!</div>`;
        } catch (e) {
            message = `<div style="color: #ff5555; background: #1a0000; padding: 6px; text-align: center; margin-bottom: 8px;">❌ Lỗi: ${e.message}</div>`;
        }
    }

    // Lấy danh sách toàn bộ thành viên
    let usersList = { results: [] };
    try {
        usersList = await env.DB.prepare("SELECT id, username, display_name, role, coins, level FROM users ORDER BY id DESC LIMIT 50").all();
    } catch (e) {
        usersList = { results: [] };
    }

    const content = `
    <div class="box">
        <div class="box-title">⚙️ Bảng Quản Trị Hệ Thống (Ban Quản Trị)</div>
        <div class="box-content">
            <div style="background: #151515; padding: 8px; font-size: 11px; margin-bottom: 8px; color: #ffcc00;">
                💡 Chào quản trị viên <b>${user.display_name}</b> (${user.role}). Bạn có quyền chỉnh sửa thành viên và kiểm duyệt bảng tin.
            </div>

            ${message}

            <div style="font-weight: bold; color: #00ff00; margin-bottom: 6px;">👥 Danh sách thành viên hệ thống:</div>
            
            ${usersList.results.map(u => `
                <div style="background: #141414; border: 1px solid #333; padding: 8px; margin-bottom: 6px; font-size: 11px;">
                    <form method="POST" style="margin: 0;">
                        <input type="hidden" name="user_id" value="${u.id}">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                            <div><b>ID: ${u.id}</b> - ${u.display_name} (${u.username})</div>
                            <div>Lv: <input type="number" name="level" value="${u.level}" style="width: 40px; background: #000; color: #fff; border: 1px solid #444; text-align: center;"></div>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; gap: 4px;">
                            <div>Xu: <input type="number" name="coins" value="${u.coins}" style="width: 80px; background: #000; color: #00ff00; border: 1px solid #444;"></div>
                            <div>
                                Chức vụ: 
                                <select name="role" style="background: #000; color: #ffcc00; border: 1px solid #444; font-size: 10px;">
                                    <option value="Thành Viên" ${u.role === 'Thành Viên' ? 'selected' : ''}>Thành Viên</option>
                                    <option value="Mod" ${u.role === 'Mod' ? 'selected' : ''}>Mod</option>
                                    <option value="Admin" ${u.role === 'Admin' ? 'selected' : ''}>Admin</option>
                                    ${user.role === 'Chủ Wap' ? `<option value="Chủ Wap" ${u.role === 'Chủ Wap' ? 'selected' : ''}>Chủ Wap</option>` : ''}
                                </select>
                            </div>
                            <button type="submit" class="btn" style="background: #0055ff; color: #fff; padding: 2px 8px; font-size: 10px;">Lưu</button>
                        </div>
                    </form>
                </div>
            `).join('')}
        </div>
    </div>
    <div style="text-align: center;"><a href="/">⬅️ Về trang chủ</a></div>
    `;

    return new Response(renderLayout('Quản trị viên', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
