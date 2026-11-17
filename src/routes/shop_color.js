export async function handleShopColor(request, env, user, renderLayout) {
    let message = "";

    // Tự động kiểm tra và bổ sung cột nếu thiếu
    const cols = ['name_color', 'name_glow', 'name_border', 'name_border_glow', 'border_color', 'avatar_glow'];
    for (const col of cols) {
        try { await env.DB.prepare(`ALTER TABLE users ADD COLUMN ${col} TEXT;`).run(); } catch(e) {}
    }

    if (request.method === 'POST') {
        const formData = await request.formData();
        const action = formData.get('action');

        try {
            if (action === 'update_color') {
                const colorType = formData.get('color_type'); 
                const colorValue = formData.get('color_value');

                if (cols.includes(colorType)) {
                    await env.DB.prepare(`UPDATE users SET ${colorType} = ? WHERE id = ?`).bind(colorValue, user.id).run();
                    message = `<div style="color: #00ff00; background: #001a00; border: 1px solid #005500; padding: 6px; text-align: center; margin-bottom: 8px;">✅ Cập nhật hiệu ứng thành công!</div>`;
                }
            } else if (action === 'apply_preset') {
                const preset = formData.get('preset');
                let nColor = '#00ff00', nGlow = '#00ff00', bColor = '#ffcc00', aGlow = '#ffcc00';
                if (preset === 'ocean') { nColor = '#00ffff'; nGlow = '#0055ff'; bColor = '#00ffff'; aGlow = '#0055ff'; }
                else if (preset === 'royal') { nColor = '#ffcc00'; nGlow = '#ff8800'; bColor = '#ffcc00'; aGlow = '#ff8800'; }
                else if (preset === 'neon') { nColor = '#ff55ff'; nGlow = '#aa00aa'; bColor = '#ff55ff'; aGlow = '#aa00aa'; }
                else if (preset === 'fire') { nColor = '#ff3300'; nGlow = '#ff9900'; bColor = '#ff3300'; aGlow = '#ff9900'; }

                await env.DB.prepare("UPDATE users SET name_color = ?, name_glow = ?, border_color = ?, avatar_glow = ? WHERE id = ?")
                    .bind(nColor, nGlow, bColor, aGlow, user.id).run();
                message = `<div style="color: #00ff00; background: #001a00; border: 1px solid #005500; padding: 6px; text-align: center; margin-bottom: 8px;">✅ Đã áp dụng bộ phối màu sẵn có!</div>`;
            } else if (action === 'reset_all') {
                await env.DB.prepare("UPDATE users SET name_color = NULL, name_glow = NULL, name_border = NULL, name_border_glow = NULL, border_color = NULL, avatar_glow = NULL WHERE id = ?").bind(user.id).run();
                message = `<div style="color: #ffcc00; background: #1a1a00; border: 1px solid #555500; padding: 6px; text-align: center; margin-bottom: 8px;">⚠️ Đã khôi phục mặc định toàn bộ màu sắc!</div>`;
            }
            user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first();
        } catch (e) {
            message = `<div style="color: #ff5555; background: #1a0000; border: 1px solid #550000; padding: 6px; text-align: center; margin-bottom: 8px;">❌ Lỗi: ${e.message}</div>`;
        }
    }

    const defaultAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100' height='100' fill='%231a1a1a'/><circle cx='50' cy='38' r='18' fill='%2300ff00'/><path d='M20 88 C20 65, 80 65, 80 88' fill='%2300ff00'/></svg>";
    const currentAvatar = (user.avatar && !user.avatar.includes('7gXvS6v')) ? user.avatar : defaultAvatar;
    
    // Lưu các giá trị hiện tại để load vào form
    const savedColors = {
        name_color: user.name_color || '#00ff00',
        name_glow: user.name_glow || '#000000',
        name_border: user.name_border || '#000000',
        name_border_glow: user.name_border_glow || '#000000',
        border_color: user.border_color || '#ffcc00',
        avatar_glow: user.avatar_glow || '#000000'
    };

    // Tạo style xem trước
    const previewNameStyle = `color: ${savedColors.name_color}; text-shadow: ${savedColors.name_glow !== '#000000' ? `0 0 6px ${savedColors.name_glow}` : 'none'}; -webkit-text-stroke: ${savedColors.name_border !== '#000000' ? `0.5px ${savedColors.name_border}` : 'none'}; font-weight: bold;`;
    const previewAvatarStyle = `border-radius: 50%; border: 2px solid ${savedColors.border_color}; box-shadow: ${savedColors.avatar_glow !== '#000000' ? `0 0 10px ${savedColors.avatar_glow}` : 'none'}; object-fit: cover;`;

    const content = `
    <div style="background: #111; border: 1px solid #333; padding: 8px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 11px;">
        <span style="color: #00ff00; font-weight: bold;">🎨 Trang trí màu sắc nick</span>
        <div>👑 <b style="color: #ffcc00;">${(user.gold || 0).toLocaleString()} Vàng</b></div>
    </div>

    ${message}

    <!-- Xem trước thay đổi giống Gaubong -->
    <div class="box" style="margin-bottom: 8px; text-align: center; padding: 10px;">
        <div style="font-size: 10px; color: #888; margin-bottom: 4px;">Xem trước thay đổi</div>
        <div style="display: inline-block; padding: 6px 12px; background: #000; border: 1px solid #333;">
            <span id="preview-name" style="${previewNameStyle}">${user.display_name}</span> <span style="color: #ffcc00; font-size: 10px;">[Lv.${user.level || 1}]</span>
        </div>
        <div style="margin-top: 6px;">
            <img id="preview-avatar" src="${currentAvatar}" width="48" height="48" style="${previewAvatarStyle}">
        </div>
    </div>

    <!-- Tùy chỉnh màu sắc & Hiệu ứng đầy đủ 6 loại -->
    <div class="box" style="margin-bottom: 8px;">
        <div class="box-title" style="display: flex; justify-content: space-between; align-items: center;">
            <span>🎨 Tùy chỉnh màu sắc & Hiệu ứng</span>
            <span style="font-size: 10px; color: #00ff00;">✓ Đã mở khóa</span>
        </div>
        <div class="box-content" style="font-size: 11px;">
            <form method="POST">
                <input type="hidden" name="action" value="update_color">
                
                <div style="margin-bottom: 6px;">
                    <label style="color: #00ff00; display: block; margin-bottom: 2px;">Loại tùy chỉnh:</label>
                    <select id="color-type-select" name="color_type" onchange="updateColorPickerValue()" style="width: 100%; background: #000; color: #fff; border: 1px solid #444; padding: 6px; font-size: 11px;">
                        <option value="name_color">Màu tên tài khoản</option>
                        <option value="name_glow">Hiệu ứng sáng tên</option>
                        <option value="name_border">Viền tên tài khoản</option>
                        <option value="name_border_glow">Hiệu ứng sáng viền tên</option>
                        <option value="border_color">Viền ảnh đại diện</option>
                        <option value="avatar_glow">Hiệu ứng sáng ảnh đại diện</option>
                    </select>
                </div>

                <div style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                    <label style="color: #00ff00;">Mã màu:</label>
                    <input type="color" id="color-picker-input" name="color_value" value="${savedColors.name_color}" oninput="handleColorPreview(this.value)" style="background: #000; border: 1px solid #444; width: 40px; height: 30px; cursor: pointer;">
                    <span style="color: #aaa; font-size: 10px;">Bấm ô màu để chọn</span>
                </div>

                <div style="display: flex; gap: 6px;">
                    <button type="submit" class="btn" style="background: #0055ff; color: #fff; flex: 1;">Lưu thay đổi</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Tiện ích trang trí / Bộ phối màu sẵn có -->
    <div class="box" style="margin-bottom: 8px;">
        <div class="box-title">⚙️ Tiện ích trang trí</div>
        <div class="box-content" style="font-size: 11px;">
            <div style="margin-bottom: 6px; color: #aaa;">Bộ phối màu sẵn có:</div>
            <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px;">
                <form method="POST" style="margin:0;"><input type="hidden" name="action" value="apply_preset"><input type="hidden" name="preset" value="ocean"><button type="submit" class="btn" style="background:#0055ff; color:#fff; font-size:10px;">🔵 Đại dương</button></form>
                <form method="POST" style="margin:0;"><input type="hidden" name="action" value="apply_preset"><input type="hidden" name="preset" value="royal"><button type="submit" class="btn" style="background:#ff8800; color:#fff; font-size:10px;">🟡 Hoàng gia</button></form>
                <form method="POST" style="margin:0;"><input type="hidden" name="action" value="apply_preset"><input type="hidden" name="preset" value="neon"><button type="submit" class="btn" style="background:#aa00aa; color:#fff; font-size:10px;">🟣 Hồng neon</button></form>
                <form method="POST" style="margin:0;"><input type="hidden" name="action" value="apply_preset"><input type="hidden" name="preset" value="fire"><button type="submit" class="btn" style="background:#cc0000; color:#fff; font-size:10px;">🔴 Rực lửa</button></form>
            </div>

            <form method="POST" onsubmit="return confirm('Bạn có chắc muốn khôi phục mặc định toàn bộ màu sắc không?');">
                <input type="hidden" name="action" value="reset_all">
                <button type="submit" class="btn" style="background: #333; color: #ffcc00; width: 100%; font-size: 11px;" id="reset-all-btn">Reset tất cả</button>
            </form>
        </div>
    </div>

    <!-- Script JavaScript cập nhật xem trước trực tiếp theo thời gian thực -->
    <script>
        const userColors = {
            name_color: "${savedColors.name_color}",
            name_glow: "${savedColors.name_glow}",
            name_border: "${savedColors.name_border}",
            name_border_glow: "${savedColors.name_border_glow}",
            border_color: "${savedColors.border_color}",
            avatar_glow: "${savedColors.avatar_glow}"
        };

        function handleColorPreview(hexColor) {
            const type = document.getElementById('color-type-select').value;
            userColors[type] = hexColor;

            const nameEl = document.getElementById('preview-name');
            const avatarEl = document.getElementById('preview-avatar');

            // Cập nhật style tên
            let nameStyle = \`color: \${userColors.name_color}; font-weight: bold;\`;
            let shadows = [];
            if (userColors.name_glow && userColors.name_glow !== '#000000') {
                shadows.push(\`0 0 6px \${userColors.name_glow}\`);
            }
            if (userColors.name_border_glow && userColors.name_border_glow !== '#000000') {
                shadows.push(\`0 0 4px \${userColors.name_border_glow}\`);
            }
            if (shadows.length > 0) {
                nameStyle += \` text-shadow: \${shadows.join(', ')};\`;
            }
            if (userColors.name_border && userColors.name_border !== '#000000') {
                nameStyle += \` -webkit-text-stroke: 0.5px \${userColors.name_border};\`;
            }
            nameEl.style = nameStyle;

            // Cập nhật style viền avatar
            let avatarStyle = \`border-radius: 50%; object-fit: cover; border: 2px solid \${userColors.border_color};\`;
            let avtShadows = [];
            if (userColors.avatar_glow && userColors.avatar_glow !== '#000000') {
                avtShadows.push(\`0 0 10px \${userColors.avatar_glow}\`);
            }
            if (avtShadows.length > 0) {
                avatarStyle += \` box-shadow: \${avtShadows.join(', ')};\`;
            }
            avatarEl.style = avatarStyle;
        }

        function updateColorPickerValue() {
            const type = document.getElementById('color-type-select').value;
            document.getElementById('color-picker-input').value = userColors[type] || '#00ff00';
        }
    </script>

    <div style="text-align: center; margin-top: 10px;"><a href="/shop">⬅️ Quay lại Cửa hàng</a> · <a href="/">Trang chủ</a></div>
    `;

    return new Response(renderLayout('Trang trí màu sắc', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
