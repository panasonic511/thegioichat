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
            try { await env.DB.prepare("ALTER TABLE users ADD COLUMN gender TEXT;").run(); } catch(e) {}

            if (action === 'update_cover') {
                const coverPhoto = formData.get('cover_photo');
                if (!coverPhoto || coverPhoto.trim() === '') {
                    throw new Error("Vui lòng chọn ảnh hoặc nhập đường dẫn hợp lệ!");
                }
                await env.DB.prepare("UPDATE users SET cover_photo = ? WHERE id = ?").bind(coverPhoto.trim(), user.id).run();
                message = `<div style="color: #00ff00; background: #001a00; border: 1px solid #005500; padding: 6px; text-align: center; margin-bottom: 8px;">✅ Cập nhật ảnh bìa thành công!</div>`;
            } else if (action === 'delete_cover') {
                await env.DB.prepare("UPDATE users SET cover_photo = NULL WHERE id = ?").bind(user.id).run();
                message = `<div style="color: #ffcc00; background: #1a1a00; border: 1px solid #555500; padding: 6px; text-align: center; margin-bottom: 8px;">⚠️ Đã xóa ảnh bìa thành công!</div>`;
            } else if (action === 'update_avatar') {
                const avatar = formData.get('avatar');
                if (!avatar || avatar.trim() === '') {
                    throw new Error("Vui lòng chọn ảnh hoặc nhập đường dẫn hợp lệ!");
                }
                await env.DB.prepare("UPDATE users SET avatar = ? WHERE id = ?").bind(avatar.trim(), user.id).run();
                message = `<div style="color: #00ff00; background: #001a00; border: 1px solid #005500; padding: 6px; text-align: center; margin-bottom: 8px;">✅ Cập nhật ảnh đại diện thành công!</div>`;
            }
            
            profileUser = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(targetId).first();
        } catch (e) {
            message = `<div style="color: #ff5555; background: #1a0000; border: 1px solid #550000; padding: 6px; text-align: center; margin-bottom: 8px;">❌ Lỗi: ${e.message}</div>`;
        }
    }

    const isOwner = (targetId == user.id);
    // Ảnh đại diện mặc định dạng SVG nội tuyến sắc nét, không bao giờ lỗi link
    const defaultAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100' height='100' fill='%231a1a1a'/><circle cx='50' cy='38' r='18' fill='%2300ff00'/><path d='M20 88 C20 65, 80 65, 80 88' fill='%2300ff00'/></svg>";
    const currentAvatar = (profileUser.avatar && !profileUser.avatar.includes('7gXvS6v')) ? profileUser.avatar : defaultAvatar;
    const hasCover = (profileUser.cover_photo && !profileUser.cover_photo.includes('7gXvS6v'));
    const coverStyle = hasCover 
        ? `background: url('${profileUser.cover_photo}') center/cover no-repeat;` 
        : `background: linear-gradient(135deg, #0a1f0a 0%, #151515 50%, #051428 100%);`;

    const content = `
    <div class="box" style="margin-bottom: 8px; border: 1px solid #333;">
        <div class="box-title" style="display: flex; justify-content: space-between; align-items: center;">
            <span>📁 Hồ sơ của tôi</span>
            <span style="font-size: 10px; color: #aaa;">MENU ≡</span>
        </div>
        
        <div style="position: relative; background: #111; border-bottom: 1px solid #333; text-align: center;">
            <div style="height: 120px; ${coverStyle}"></div>
            
            ${isOwner ? `
            <div style="position: absolute; right: 6px; bottom: 6px; display: flex; gap: 4px;">
                <button type="button" onclick="document.getElementById('cover-modal').style.display='flex'" class="btn" style="background: rgba(0,0,0,0.85); color: #fff; border: 1px solid #555; padding: 3px 7px; font-size: 10px; cursor: pointer;">📷 Đổi ảnh bìa</button>
                ${hasCover ? `
                <form method="POST" style="margin: 0;" onsubmit="return confirm('Bạn có chắc muốn xóa ảnh bìa không?');">
                    <input type="hidden" name="action" value="delete_cover">
                    <button type="submit" class="btn" style="background: rgba(120,0,0,0.9); color: #fff; border: 1px solid #800; padding: 3px 7px; font-size: 10px; cursor: pointer;">🗑️ Xóa</button>
                </form>` : ''}
            </div>
            ` : ''}

            <!-- Avatar kèm icon máy ảnh nhỏ gọn ngay góc dưới -->
            <div style="position: relative; margin-top: -35px; margin-bottom: 4px; display: inline-block;">
                <img src="${currentAvatar}" width="66" height="66" style="border-radius: 50%; border: 3px solid #00ff00; background: #000; object-fit: cover; display: block;">
                
                ${isOwner ? `
                <button type="button" onclick="document.getElementById('avatar-modal').style.display='flex'" title="Đổi ảnh đại diện" style="position: absolute; bottom: -2px; right: -2px; background: #111; color: #00ff00; border: 1px solid #00ff00; border-radius: 50%; width: 22px; height: 22px; font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; box-shadow: 0 0 4px #000;">📷</button>
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
            <div><div style="font-size: 16px;">💌</div><div style="color: #ff55ff;">X100</div><div>Lời tỏ tình</div></div>
            <div><div style="font-size: 16px;">💋</div><div style="color: #ff55ff;">X100</div><div>Nụ hôn</div></div>
            <div><div style="font-size: 16px;">💍</div><div style="color: #ff55ff;">X100</div><div>Lộ tình yêu</div></div>
            <div><div style="font-size: 16px;">🌸</div><div style="color: #ff55ff;">X150</div><div>Thích bạn</div></div>
        </div>
    </div>

    <!-- Thông tin chi tiết -->
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

    <!-- Popup Modal Thay đổi Avatar (Có xem trước + Nén ảnh tự động) -->
    <div id="avatar-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 999; justify-content: center; align-items: center;">
        <div style="background: #111; border: 1px solid #444; width: 92%; max-width: 380px; padding: 12px; box-sizing: border-box;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 6px; margin-bottom: 10px;">
                <b style="color: #00ff00; font-size: 12px;">📷 Đổi ảnh đại diện (Avatar)</b>
                <button type="button" onclick="document.getElementById('avatar-modal').style.display='none'" style="background:none; border:none; color:#ff5555; font-weight:bold; cursor:pointer;">✕</button>
            </div>
            <form method="POST">
                <input type="hidden" name="action" value="update_avatar">
                
                <div style="text-align: center; margin-bottom: 8px;">
                    <img id="avatar-preview" src="${currentAvatar}" width="64" height="64" style="border-radius: 50%; border: 2px solid #00ff00; object-fit: cover;">
                    <div id="avatar-status" style="font-size: 10px; color: #ffcc00; margin-top: 3px;"></div>
                </div>

                <label style="color: #00ff00; display: block; margin-bottom: 4px; font-size: 11px;">1. Chọn ảnh từ album thiết bị (Tự động nén nhẹ):</label>
                <input type="file" accept="image/*" onchange="processAndCompressImage(this, 'avatar-input-val', 'avatar-preview', 'avatar-status', 200, 200)" style="width: 100%; font-size: 11px; color: #ccc; margin-bottom: 8px; background: #000; border: 1px solid #444; padding: 4px; box-sizing: border-box;">

                <label style="color: #00ff00; display: block; margin-bottom: 2px; font-size: 11px;">2. Hoặc dán đường dẫn URL ảnh:</label>
                <input type="text" id="avatar-input-val" name="avatar" value="${hasCover || !profileUser.avatar?.includes('7gXvS6v') ? (profileUser.avatar || '') : ''}" placeholder="https://..." required oninput="document.getElementById('avatar-preview').src=this.value" style="width: 100%; background: #000; color: #00ff00; border: 1px solid #444; padding: 6px; box-sizing: border-box; margin-bottom: 10px; font-size: 11px;">
                
                <div style="display: flex; gap: 6px;">
                    <button type="submit" id="btn-save-avatar" class="btn" style="background: #0055ff; color: #fff; flex: 1;">Lưu Avatar</button>
                    <button type="button" onclick="document.getElementById('avatar-modal').style.display='none'" class="btn" style="background: #333; color: #ccc; flex: 1;">Đóng</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Popup Modal Thay đổi Ảnh bìa (Có xem trước + Nén ảnh tự động) -->
    <div id="cover-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 999; justify-content: center; align-items: center;">
        <div style="background: #111; border: 1px solid #444; width: 92%; max-width: 380px; padding: 12px; box-sizing: border-box;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 6px; margin-bottom: 10px;">
                <b style="color: #ffcc00; font-size: 12px;">🖼️ Đổi ảnh bìa (Cover Photo)</b>
                <button type="button" onclick="document.getElementById('cover-modal').style.display='none'" style="background:none; border:none; color:#ff5555; font-weight:bold; cursor:pointer;">✕</button>
            </div>
            <form method="POST">
                <input type="hidden" name="action" value="update_cover">
                
                <div style="text-align: center; margin-bottom: 8px;">
                    <img id="cover-preview" src="${hasCover ? profileUser.cover_photo : defaultAvatar}" style="width: 100%; height: 80px; object-fit: cover; border: 1px solid #444; background: #000;">
                    <div id="cover-status" style="font-size: 10px; color: #ffcc00; margin-top: 3px;"></div>
                </div>

                <label style="color: #00ff00; display: block; margin-bottom: 4px; font-size: 11px;">1. Chọn ảnh từ album thiết bị (Tự động nén nhẹ):</label>
                <input type="file" accept="image/*" onchange="processAndCompressImage(this, 'cover-input-val', 'cover-preview', 'cover-status', 800, 300)" style="width: 100%; font-size: 11px; color: #ccc; margin-bottom: 8px; background: #000; border: 1px solid #444; padding: 4px; box-sizing: border-box;">

                <label style="color: #00ff00; display: block; margin-bottom: 2px; font-size: 11px;">2. Hoặc dán URL ảnh bìa:</label>
                <input type="text" id="cover-input-val" name="cover_photo" value="${hasCover ? profileUser.cover_photo : ''}" placeholder="https://..." required oninput="document.getElementById('cover-preview').src=this.value" style="width: 100%; background: #000; color: #00ff00; border: 1px solid #444; padding: 6px; box-sizing: border-box; margin-bottom: 10px; font-size: 11px;">
                
                <div style="display: flex; gap: 6px;">
                    <button type="submit" id="btn-save-cover" class="btn" style="background: #0055ff; color: #fff; flex: 1;">Lưu Ảnh Bìa</button>
                    <button type="button" onclick="document.getElementById('cover-modal').style.display='none'" class="btn" style="background: #333; color: #ccc; flex: 1;">Đóng</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Bộ nén ảnh tự động bằng HTML5 Canvas giúp lưu D1 Database 100% không bao giờ lỗi -->
    <script>
        function processAndCompressImage(inputEl, targetInputId, previewImgId, statusId, maxWidth, maxHeight) {
            const file = inputEl.files[0];
            if (!file) return;

            const statusEl = document.getElementById(statusId);
            statusEl.innerText = "⏳ Đang xử lý và nén ảnh...";

            const reader = new FileReader();
            reader.onload = function(event) {
                const img = new Image();
                img.onload = function() {
                    let width = img.width;
                    let height = img.height;

                    if (width > maxWidth || height > maxHeight) {
                        const ratio = Math.min(maxWidth / width, maxHeight / height);
                        width = Math.round(width * ratio);
                        height = Math.round(height * ratio);
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    // Xuất ra JPEG chất lượng 0.8 siêu nhẹ (~20KB)
                    const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
                    
                    document.getElementById(targetInputId).value = compressedBase64;
                    document.getElementById(previewImgId).src = compressedBase64;
                    statusEl.innerText = "✅ Ảnh đã sẵn sàng! Hãy bấm nút Lưu bên dưới.";
                };
                img.onerror = function() {
                    statusEl.innerText = "❌ File ảnh không hợp lệ!";
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    </script>

    <div style="text-align: center; margin-top: 10px;"><a href="/">⬅️ Về trang chủ</a></div>
    `;

    return new Response(renderLayout('Trang cá nhân', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
