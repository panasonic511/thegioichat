export async function handleProfile(request, env, user, renderLayout, url) {
    let message = "";
    const targetId = url.searchParams.get('user') || user.id;
    
    // Lấy thông tin user cần xem/sửa
    let profileUser = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(targetId).first();
    if (!profileUser) {
        return new Response("Không tìm thấy thành viên!", { status: 404 });
    }

    // Xử lý cập nhật thông tin cá nhân (Avatar, Ảnh bìa, Giới tính...)
    if (request.method === 'POST' && targetId == user.id) {
        const formData = await request.formData();
        const avatar = formData.get('avatar');
        const cover_photo = formData.get('cover_photo');
        const gender = formData.get('gender');

        try {
            // Kiểm tra xem bảng đã có cột cover_photo chưa, nếu chưa tự động tạo
            try { await env.DB.prepare("ALTER TABLE users ADD COLUMN cover_photo TEXT;").run(); } catch(e) {}

            await env.DB.prepare("UPDATE users SET avatar = ?, cover_photo = ?, gender = ? WHERE id = ?")
                .bind(avatar, cover_photo, gender, user.id)
                .run();
            
            profileUser = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first();
            message = `<div style="color: #00ff00; background: #001a00; padding: 6px; text-align: center; margin-bottom: 8px;">✅ Cập nhật hồ sơ thành công!</div>`;
        } catch (e) {
            message = `<div style="color: #ff5555; text-align: center; margin-bottom: 8px;">❌ Lỗi: ${e.message}</div>`;
        }
    }

    const isOwner = (targetId == user.id);

    const content = `
    <!-- Ảnh bìa (Cover Photo) -->
    <div style="background: #111; border: 1px solid #333; margin-bottom: 8px; text-align: center; position: relative;">
        <div style="height: 100px; background: url('${profileUser.cover_photo || 'https://i.imgur.com/7gXvS6v.png'}') center/cover no-repeat; border-bottom: 1px solid #333;"></div>
        
        <!-- Avatar đè lên ảnh bìa -->
        <div style="position: relative; margin-top: -30px; margin-bottom: 6px;">
            <img src="${profileUser.avatar || 'https://i.imgur.com/7gXvS6v.png'}" width="64" height="64" style="border-radius: 50%; border: 3px solid #00ff00; background: #000;">
        </div>
        
        <div style="font-size: 14px; font-weight: bold; color: #fff;">${profileUser.display_name}</div>
        <div style="font-size: 11px; color: #ffcc00; margin-bottom: 8px;">[Lv.${profileUser.level}] · <span style="color: yellow;">${profileUser.role}</span></div>
    </div>

    ${message}

    <div class="box">
        <div class="box-title">👤 Thông tin tài khoản</div>
        <div class="box-content" style="font-size: 11px;">
            <div>Tên đăng nhập: <b>${profileUser.username}</b></div>
            <div>Email: <b>${profileUser.email || 'Chưa cập nhật'}</b></div>
            <div>Giới tính: <b>${profileUser.gender || 'Chưa cập nhật'}</b></div>
            <div>Số dư: <b style="color: #00ff00;">${profileUser.coins || 0} Xu</b> | <b style="color: #ffcc00;">${profileUser.gold || 0} Vàng</b></div>
        </div>
    </div>

    ${isOwner ? `
    <div class="box">
        <div class="box-title">✏️ Chỉnh sửa Avatar & Ảnh bìa</div>
        <div class="box-content">
            <form method="POST">
                <label style="color: #00ff00; display: block; margin-bottom: 2px;">URL Ảnh đại diện (Avatar):</label>
                <input type="text" name="avatar" value="${profileUser.avatar || ''}" placeholder="https://..." style="width: 100%; background: #000; color: #00ff00; border: 1px solid #444; padding: 6px; box-sizing: border-box; margin-bottom: 8px; font-size: 11px;">
                
                <label style="color: #00ff00; display: block; margin-bottom: 2px;">URL Ảnh bìa (Cover Photo):</label>
                <input type="text" name="cover_photo" value="${profileUser.cover_photo || ''}" placeholder="https://..." style="width: 100%; background: #000; color: #00ff00; border: 1px solid #444; padding: 6px; box-sizing: border-box; margin-bottom: 8px; font-size: 11px;">

                <label style="color: #00ff00; display: block; margin-bottom: 2px;">Giới tính:</label>
                <select name="gender" style="width: 100%; background: #000; color: #00ff00; border: 1px solid #444; padding: 6px; margin-bottom: 10px; font-size: 11px;">
                    <option value="Nam" ${profileUser.gender === 'Nam' ? 'selected' : ''}>Nam</option>
                    <option value="Nữ" ${profileUser.gender === 'Nữ' ? 'selected' : ''}>Nữ</option>
                    <option value="Khác" ${profileUser.gender === 'Khác' ? 'selected' : ''}>Khác</option>
                </select>

                <button type="submit" class="btn" style="width: 100%; background: #0055ff; color: #fff;">Lưu thay đổi</button>
            </form>
        </div>
    </div>
    ` : ''}

    <div style="text-align: center;"><a href="/">⬅️ Về trang chủ</a></div>
    `;

    return new Response(renderLayout('Trang cá nhân', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
