export async function handleProfile(request, env, user, renderLayout, url) {
    let message = "";
    const targetId = url.searchParams.get('user') || user.id;
    
    let profileUser = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(targetId).first();
    if (!profileUser) {
        return new Response("Không tìm thấy thành viên!", { status: 404 });
    }

    if (request.method === 'POST' && targetId == user.id) {
        const formData = await request.formData();
        const action = formData.get('action');

        try {
            try { await env.DB.prepare("ALTER TABLE users ADD COLUMN cover_photo TEXT;").run(); } catch(e) {}

            if (action === 'update_cover') {
                const coverPhoto = formData.get('cover_photo');
                await env.DB.prepare("UPDATE users SET cover_photo = ? WHERE id = ?").bind(coverPhoto, user.id).run();
                message = `<div style="color: #00ff00; background: #001a00; padding: 6px; text-align: center; margin-bottom: 8px;">✅ Cập nhật ảnh bìa thành công!</div>`;
            } else if (action === 'delete_cover') {
                await env.DB.prepare("UPDATE users SET cover_photo = NULL WHERE id = ?").bind(user.id).run();
                message = `<div style="color: #ffcc00; background: #1a1a00; padding: 6px; text-align: center; margin-bottom: 8px;">⚠️ Đã xóa ảnh bìa thành công!</div>`;
            } else if (action === 'update_profile') {
                const avatar = formData.get('avatar');
                const gender = formData.get('gender');
                await env.DB.prepare("UPDATE users SET avatar = ?, gender = ? WHERE id = ?").bind(avatar, gender, user.id).run();
                message = `<div style="color: #00ff00; background: #001a00; padding: 6px; text-align: center; margin-bottom: 8px;">✅ Cập nhật hồ sơ thành công!</div>`;
            }
            
            profileUser = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first();
        } catch (e) {
            message = `<div style="color: #ff5555; text-align: center; margin-bottom: 8px;">❌ Lỗi: ${e.message}</div>`;
        }
    }

    const isOwner = (targetId == user.id);

    const content = `
    <div class="box" style="margin-bottom: 8px; border: 1px solid #333;">
        <div class="box-title" style="display: flex; justify-content: space-between; align-items: center;">
            <span>📁 Hồ sơ của tôi</span>
            <span style="font-size: 10px; color: #aaa;">MENU ≡</span>
        </div>
        
        <div style="position: relative; background: #111; border-bottom: 1px solid #333; text-align: center;">
            <div style="height: 120px; background: url('${profileUser.cover_photo || 'https://i.imgur.com/7gXvS6v.png'}') center/cover no-repeat;"></div>
            
            ${isOwner ? `
            <div style="position: absolute; right: 8px; bottom: 8px; display: flex; gap: 4px;">
                <button onclick="document.getElementById('cover-modal').style.display='flex'" class="btn" style="background: rgba(0,0,0,0.8); color: #fff; border: 1px solid #555; padding: 3px 6px; font-size: 10px; cursor: pointer;">📷 Đổi ảnh bìa</button>
                ${profileUser.cover_photo ? `
                <form method="POST" style="margin: 0;" onsubmit="return confirm('Bạn có chắc muốn xóa ảnh bìa không?');">
                    <input type="hidden" name="action" value="delete_cover">
                    <button type="submit" class="btn" style="background: rgba(100,0,0,0.9); color: #fff; border: 1px solid #700; padding: 3px 6px; font-size: 10px; cursor: pointer;">🗑️ Xóa</button>
                </form>` : ''}
            </div>
            ` : ''}

            <div style="position: relative; margin-top: -35px; margin-bottom: 4px; display: inline-block;">
                <img src="${profileUser.avatar || 'https://i.imgur.com/7gXvS6v.png'}" width="64" height="64" style="border-radius: 50%; border: 3px solid #00ff00; background: #000; object-fit: cover;">
            </div>
            
            <div style="font-size: 13px; font-weight: bold; color: #fff; margin-bottom: 2px;">${profileUser.display_name} <span style="color: #ffcc00; font-size: 11px;">[Lv.${profileUser.level}]</span></div>
            <div style="font-size: 10px; color: #aaa; margin-bottom: 8px;">ID: ${profileUser.id} · <span style="color: yellow;">${profileUser.role}</span></div>
        </div>

        ${message}

        ${isOwner ? `
        <div style="background: #151515; padding: 6px; text-align: center; border-bottom: 1px solid #333; display: flex; justify-content: center; gap: 8px;">
            <button onclick="document.getElementById('edit-profile-box').style.display = document.getElementById('edit-profile-box').style.display === 'none' ? 'block' : 'none';" class="btn" style="background: #222; color: #00ff00; border: 1px solid #444; font-size: 11px; padding: 4px 12px;">⚙️ Cài đặt & Chỉnh sửa</button>
        </div>
        ` : ''}
    </div>

    ${isOwner ? `
    <div id="edit-profile-box" class="box" style="display: none; margin-bottom: 8px;">
        <div class="box-title">✏️ Chỉnh sửa thông tin tài khoản</div>
        <div class="box-content">
            <form method="POST">
                <input type="hidden" name="action" value="update_profile">
                
                <label style="color: #00ff00; display: block; margin-bottom: 2px; font-size: 11px;">Chọn ảnh từ thiết bị hoặc dán URL Avatar:</label>
                <input type="file" accept="image/*" onchange="convertFileToBase64(this, 'avatar-input-val')" style="width: 100%; font-size: 10px; color: #ccc; margin-bottom: 6px; background: #000; border: 1px solid #444; padding: 4px;">
                <input type="text" id="avatar-input-val" name="avatar" value="${profileUser.avatar || ''}" placeholder="https://..." style="width: 100%; background: #000; color: #00ff00; border: 1px solid #444; padding: 6px; box-sizing: border-box; margin-bottom: 8px; font-size: 11px;">

                <label style="color: #00ff00; display: block; margin-bottom: 2px; font-size: 11px;">Giới tính:</label>
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

    <div id="cover-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 999; justify-content: center; align-items: center;">
        <div style="background: #111; border: 1px solid #444; width: 90%; max-width: 400px; padding: 12px; box-sizing: border-box; margin: 50px auto;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 6px; margin-bottom: 10px;">
                <b style="color: #ffcc00; font-size: 12px;">🖼️ Tải lên ảnh bìa từ thiết bị</b>
                <button onclick="document.getElementById('cover-modal').style.display='none'" style="background:none; border:none; color:#ff5555; font-weight:bold; cursor:pointer;">✕</button>
            </div>
            <form method="POST">
                <input type="hidden" name="action" value="update_cover">
                
                <label style="color: #00ff00; display: block; margin-bottom: 4px; font-size: 11px;">Chọn ảnh từ album thiết bị:</label>
                <input type="file" accept="image/*" onchange="convertFileToBase64(this, 'cover-input-val')" style="width: 100%; font-size: 11px; color: #ccc; margin-bottom: 8px; background: #000; border: 1px solid #444; padding: 4px;">

                <label style="color: #00ff00; display: block; margin-bottom: 2px; font-size: 11px;">Hoặc dán URL ảnh bìa:</label>
                <input type="text" id="cover-input-val" name="cover_photo" value="${profileUser.cover_photo || ''}" placeholder="https://..." required style="width: 100%; background: #000; color: #00ff00; border: 1px solid #444; padding: 6px; box-sizing: border-box; margin-bottom: 10px; font-size: 11px;">
                
                <div style="display: flex; gap: 6px;">
                    <button type="submit" class="btn" style="background: #0055ff; color: #fff; flex: 1;">Cập nhật</button>
                    <button type="button" onclick="document.getElementById('cover-modal').style.display='none'" class="btn" style="background: #333; color: #ccc; flex: 1;">Đóng</button>
                </div>
            </form>
        </div>
    </div>

    <script>
        function convertFileToBase64(inputElement, targetInputId) {
            const file = inputElement.files[0];
            if (file) {
                if (file.size > 2 * 1024 * 1024) {
                    alert('Kích thước ảnh quá lớn! Vui lòng chọn ảnh dưới 2MB để hệ thống chạy mượt mà.');
                    inputElement.value = '';
                    return;
                }
                const reader = new FileReader();
                reader.onload = function(e) {
                    document.getElementById(targetInputId).value = e.target.result;
                };
                reader.readAsDataURL(file);
            }
        }
    </script>

    <div class="box">
        <div class="box-title">📊 Thông tin chi tiết</div>
        <div class="box-content" style="font-size: 11px; line-height: 1.6;">
            <div>💖 Hẹn hò: <b>Đang độc thân</b></div>
            <div>🚻 Giới tính: <b>${profileUser.gender || 'Chưa cập nhật'}</b></div>
            <div>📊 Level: <b style="color: #ffcc00;">${profileUser.level}</b> · <a href="/profile/level" style="color: #00ff00;">Kiểm tra</a></div>
            <div>🪙 Xu: <b style="color: #00ff00;">${profileUser.coins ? profileUser.coins.toLocaleString() : 0} Xu</b></div>
            <div>👑 Vàng: <b style="color: #ffcc00;">${profileUser.gold ? profileUser.gold.toLocaleString() : 0} Vàng</b></div>
        </div>
    </div>

    <div style="text-align: center;"><a href="/">⬅️ Về trang chủ</a></div>
    `;

    return new Response(renderLayout('Trang cá nhân', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
