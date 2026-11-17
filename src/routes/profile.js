export async function handleProfile(request, env, user, renderLayout, url) {
    let message = "";
    const targetId = url.searchParams.get('user') || user.id;
    
    // Lấy thông tin user cần xem/sửa
    let profileUser = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(targetId).first();
    if (!profileUser) {
        return new Response("Không tìm thấy thành viên!", { status: 404 });
    }

    // Xử lý cập nhật thông tin qua POST
    if (request.method === 'POST' && targetId == user.id) {
        const formData = await request.formData();
        const action = formData.get('action');

        try {
            // Đảm bảo có đủ các cột mở rộng trong DB
            try { await env.DB.prepare("ALTER TABLE users ADD COLUMN cover_photo TEXT;").run(); } catch(e) {}
            try { await env.DB.prepare("ALTER TABLE users ADD COLUMN gender TEXT;").run(); } catch(e) {}
            try { await env.DB.prepare("ALTER TABLE users ADD COLUMN province TEXT;").run(); } catch(e) {}
            try { await env.DB.prepare("ALTER TABLE users ADD COLUMN birthday TEXT;").run(); } catch(e) {}

            if (action === 'update_cover') {
                const coverPhoto = formData.get('cover_photo');
                await env.DB.prepare("UPDATE users SET cover_photo = ? WHERE id = ?").bind(coverPhoto, user.id).run();
                message = `<div style="color: #00ff00; background: #001a00; padding: 6px; text-align: center; margin-bottom: 8px;">✅ Cập nhật ảnh bìa thành công!</div>`;
            } else if (action === 'delete_cover') {
                await env.DB.prepare("UPDATE users SET cover_photo = NULL WHERE id = ?").bind(user.id).run();
                message = `<div style="color: #ffcc00; background: #1a1a00; padding: 6px; text-align: center; margin-bottom: 8px;">⚠️ Đã xóa ảnh bìa thành công!</div>`;
            } else if (action === 'update_avatar') {
                const avatar = formData.get('avatar');
                await env.DB.prepare("UPDATE users SET avatar = ? WHERE id = ?").bind(avatar, user.id).run();
                message = `<div style="color: #00ff00; background: #001a00; padding: 6px; text-align: center; margin-bottom: 8px;">✅ Cập nhật ảnh đại diện thành công!</div>`;
            }
            
            profileUser = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(targetId).first();
        } catch (e) {
            message = `<div style="color: #ff5555; text-align: center; margin-bottom: 8px;">❌ Lỗi: ${e.message}</div>`;
        }
    }

    const isOwner = (targetId == user.id);

    const content = `
    <!-- Khung Hồ sơ cá nhân giống hệt Gaubong -->
    <div class="box" style="margin-bottom: 8px; border: 1px solid #333;">
        <div class="box-title" style="display: flex; justify-content: space-between; align-items: center;">
            <span>📁 Hồ sơ của tôi</span>
            <span style="font-size: 10px; color: #aaa;">MENU ≡</span>
        </div>
        
        <!-- Ảnh bìa (Cover Photo) -->
        <div style="position: relative; background: #111; border-bottom: 1px solid #333; text-align: center;">
            <div style="height: 120px; background: url('${profileUser.cover_photo || 'https://i.imgur.com/7gXvS6v.png'}') center/cover no-repeat;"></div>
            
            ${isOwner ? `
            <div style="position: absolute; right: 6px; bottom: 6px; display: flex; gap: 4px;">
                <button onclick="document.getElementById('cover-modal').style.display='flex'" class="btn" style="background: rgba(0,0,0,0.8); color: #fff; border: 1px solid #555; padding: 2px 6px; font-size: 10px; cursor: pointer;">📷 Đổi ảnh bìa</button>
                ${profileUser.cover_photo ? `
                <form method="POST" style="margin: 0;" onsubmit="return confirm('Bạn có chắc muốn xóa ảnh bìa không?');">
                    <input type="hidden" name="action" value="delete_cover">
                    <button type="submit" class="btn" style="background: rgba(100,0,0,0.9); color: #fff; border: 1px solid #700; padding: 2px 6px; font-size: 10px; cursor: pointer;">🗑️ Xóa</button>
                </form>` : ''}
            </div>
            ` : ''}

            <!-- Avatar kèm nút icon máy ảnh nhỏ gọn ngay góc avatar (giống hệt Gaubong) -->
            <div style="position: relative; margin-top: -35px; margin-bottom: 4px; display: inline-block;">
                <img src="${profileUser.avatar || 'https://i.imgur.com/7gXvS6v.png'}" width="64" height="64" style="border-radius: 50%; border: 3px solid #00ff00; background: #000; object-fit: cover;">
                
                ${isOwner ? `
                <button onclick="document.getElementById('avatar-modal').style.display='flex'" title="Đổi ảnh đại diện" style="position: absolute; bottom: 0; right: 0; background: #111; color: #00ff00; border: 1px solid #444; border-radius: 50%; width: 22px; height: 22px; font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;">📷</button>
                ` : ''}
            </div>
            
            <div style="font-size: 13px; font-weight: bold; color: #fff; margin-bottom: 2px;">
                <a href="/profile?user=${profileUser.id}" style="color: #00ff00;">${profileUser.display_name}</a> 
                <span style="color: #ffcc00; font-size: 11px;">[Lv.${profileUser.level}]</span>
            </div>
            <div style="font-size: 10px; color: #aaa; margin-bottom: 8px;">
                Nơi?: Hồ sơ của tôi · ID ${profileUser.id} · <span style="color: yellow;">${profileUser.role}</span>
            </div>
        </div>

        ${message}

        <!-- Thanh thống kê Follow / Bạn bè giống Gaubong -->
        <div style="background: #141414; padding: 6px; text-align: center; border-bottom: 1px solid #333; font-size: 11px;">
            <a href="#" style="color: #ffcc00; margin: 0 8px;">Đang Follow 5</a> · 
            <a href="#" style="color: #ffcc00; margin: 0 8px;">Follower 2</a> · 
            <a href="#" style="color: #ffcc00; margin: 0 8px;">Bạn bè 2</a>
        </div>
    </div>

    <!-- Hộp Quà tặng -->
    <div class="box">
        <div class="box-title" style="display: flex; justify-content: space-between; align-items: center;">
            <span>🎁 Quà tặng</span>
            <span style="font-size: 10px; color: #ffcc00;">Tổng: X450</span>
        </div>
        <div class="box-content" style="display: flex; justify-content: space-around; text-align: center; font-size: 10px; color: #aaa;">
            <div>
                <div style="font-size: 16px;">💌</div>
                <div style="color: #ff55ff;">X100</div>
                <div>Lơi tỏ tình</div>
            </div>
            <div>
                <div style="font-size: 16px;">💋</div>
                <div style="color: #ff55ff;">X100</div>
                <div>Nụ hôn</div>
            </div>
            <div>
                <div style="font-size: 16px;">💍</div>
                <div style="color: #ff55ff;">X100</div>
                <div>Lộ tình yêu</div>
            </div>
            <div>
                <div style="font-size: 16px;">🌸</div>
                <div style="color: #ff55ff;">X150</div>
                <div>Thích bạn</div>
            </div>
        </div>
    </div>

    <!-- Thông tin chi tiết chuẩn Gaubong -->
    <div class="box">
        <div class="box-title">🟢 Thông tin</div>
        <div class="box-content" style="font-size: 11px; line-height: 1.8;">
            <div>💖 Hẹn hò: <b>Đang độc thân</b></div>
            <div>🚻 Giới tính: <b>${profileUser.gender || 'Nam'}</b></div>
            <div>📊 Level: <b style="color: #ffcc00;">${profileUser.level}</b> · <a href="/profile/level" style="color: #00ff00;">Kiểm tra</a></div>
            <div>🪙 Xu: <b style="color: #00ff00;">${profileUser.coins ? profileUser.coins.toLocaleString() : '999,999'} Xu</b></div>
            <div>👑 Vàng: <b style="color: #ffcc00;">${profileUser.gold ? profileUser.gold.toLocaleString() : '4,970'} Vàng</b></div>
            <div>⏰ Online: <b>97,381 phút</b></div>
            <div>💬 Chattop: <b>35</b></div>
            <div>🌍 Tỉnh thành: <b>Hồ Chí Minh</b></div>
            <div>🎂 Sinh nhật: <b>01-01-2003</b></div>
            <div>📅 Ngày đăng ký: <b>18.11.2026 / 04:30</b></div>
        </div>
    </div>

    <!-- Popup Modal Thay đổi Avatar nhanh gọn -->
    <div id="avatar-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 999; justify-content: center; align-items: center;">
        <div style="background: #111; border: 1px solid #444; width: 90%; max-width: 380px; padding: 12px; box-sizing: border-box; margin: 50px auto;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 6px; margin-bottom: 10px;">
                <b style="color: #00ff00; font-size: 12px;">📷 Đổi ảnh đại diện (Avatar)</b>
                <button onclick="document.getElementById('avatar-modal').style.display='none'" style="background:none; border:none; color:#ff5555; font-weight:bold; cursor:pointer;">✕</button>
            </div>
            <form method="POST">
                <input type="hidden" name="action" value="update_avatar">
                
                <label style="color: #00ff00; display: block; margin-bottom: 4px; font-size: 11px;">Chọn ảnh từ album thiết bị:</label>
                <input type="file" accept="image/*" onchange="convertFileToBase64(this, 'avatar-input-val')" style="width: 100%; font-size: 11px; color: #ccc; margin-bottom: 8px; background: #000; border: 1px solid #444; padding: 4px;">

                <label style="color: #00ff00; display: block; margin-bottom: 2px; font-size: 11px;">Hoặc dán URL hình ảnh:</label>
                <input type="text" id="avatar-input-val" name="avatar" value="${profileUser.avatar || ''}" placeholder="https://..." required style="width: 100%; background: #000; color: #00ff00; border: 1px solid #444; padding: 6px; box-sizing: border-box; margin-bottom: 10px; font-size: 11px;">
                
                <div style="display: flex; gap: 6px;">
                    <button type="submit" class="btn" style="background: #0055ff; color: #fff; flex: 1;">Cập nhật</button>
                    <button type="button" onclick="document.getElementById('avatar-modal').style.display='none'" class="btn" style="background: #333; color: #ccc; flex: 1;">Đóng</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Popup Modal Thay đổi Ảnh bìa -->
    <div id="cover-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 999; justify-content: center; align-items: center;">
        <div style="background: #111; border: 1px solid #444; width: 90%; max-width: 380px; padding: 12px; box-sizing: border-box; margin: 50px auto;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 6px; margin-bottom: 10px;">
                <b style="color: #ffcc00; font-size: 12px;">🖼️ Đổi ảnh bìa (Cover Photo)</b>
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

    <!-- Script mã hóa ảnh từ thiết bị sang Base64 tự động -->
    <script>
        function convertFileToBase64(inputElement, targetInputId) {
            const file = inputElement.files[0];
            if (file) {
                if (file.size > 2 * 1024 * 1024) {
                    alert('Kích thước ảnh quá lớn! Vui lòng chọn ảnh dưới 2MB để hệ thống hoạt động mượt mà.');
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

    <div style="text-align: center; margin-top: 10px;"><a href="/">⬅️ Về trang chủ</a></div>
    `;

    return new Response(renderLayout('Trang cá nhân', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
