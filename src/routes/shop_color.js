export async function handleShopColor(request, env, user, renderLayout) {
    // Tự động bổ sung các cột lưu trữ hiệu ứng màu sắc và viền vào bảng users nếu chưa có
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN name_color TEXT DEFAULT '#00ff00'").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN name_glow TEXT DEFAULT '#000000'").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN name_border TEXT DEFAULT '#000000'").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN name_border_glow TEXT DEFAULT '#000000'").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN border_color TEXT DEFAULT '#ffcc00'").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN avatar_glow TEXT DEFAULT '#000000'").run(); } catch (e) {}

    let message = '';
    if (request.method === 'POST') {
        try {
            const formData = await request.formData();
            const action = formData.get('action');

            if (action === 'update_color') {
                const targetType = formData.get('target_type'); 
                const colorVal = formData.get('color_val') || '#000000';

                let sqlField = 'name_color';
                if (targetType === 'glow') sqlField = 'name_glow';
                else if (targetType === 'border') sqlField = 'name_border';
                else if (targetType === 'border_glow') sqlField = 'name_border_glow';
                else if (targetType === 'avt_border') sqlField = 'border_color';
                else if (targetType === 'avt_glow') sqlField = 'avatar_glow';

                await env.DB.prepare(`UPDATE users SET ${sqlField} = ? WHERE id = ?`).bind(colorVal, user.id).run();
                user[sqlField] = colorVal;
                message = '<div style="color: #00ff00; text-align: center; margin-bottom: 10px; font-weight: bold;">Đã cập nhật trang trí màu sắc thành công!</div>';
            } else if (action === 'reset_all') {
                await env.DB.prepare("UPDATE users SET name_color = '#00ff00', name_glow = '#000000', name_border = '#000000', name_border_glow = '#000000', border_color = '#ffcc00', avatar_glow = '#000000' WHERE id = ?").bind(user.id).run();
                user.name_color = '#00ff00'; user.name_glow = '#000000'; user.name_border = '#000000'; user.name_border_glow = '#000000'; user.border_color = '#ffcc00'; user.avatar_glow = '#000000';
                message = '<div style="color: #ffcc00; text-align: center; margin-bottom: 10px; font-weight: bold;">Đã khôi phục toàn bộ màu mặc định!</div>';
            }
        } catch (e) {
            message = `<div style="color: #ff3333; text-align: center; margin-bottom: 10px;">Lỗi: ${e.message}</div>`;
        }
    }

    const defaultAvatarMale = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><rect width='120' height='120' fill='%230f172a'/><circle cx='60' cy='45' r='22' fill='%2338bdf8'/><path d='M20 105 C20 80, 100 80, 100 105' fill='%2338bdf8'/></svg>";
    const avt = (user.avatar && !String(user.avatar).includes('7gXvS6v')) ? user.avatar : defaultAvatarMale;
    const activeIcon = user.active_icon ? `${user.active_icon} ` : '';
    const displayName = user.display_name || user.username || 'Thành viên';

    let previewStyle = `color: ${user.name_color || '#00ff00'}; font-weight: bold;`;
    let shadows = [];
    if (user.name_glow && user.name_glow !== '#000000') shadows.push(`0 0 6px ${user.name_glow}`);
    if (user.name_border_glow && user.name_border_glow !== '#000000') shadows.push(`0 0 4px ${user.name_border_glow}`);
    if (shadows.length > 0) previewStyle += ` text-shadow: ${shadows.join(', ')};`;
    if (user.name_border && user.name_border !== '#000000') previewStyle += ` -webkit-text-stroke: 0.5px ${user.name_border};`;

    let avtStyle = `width: 50px; height: 50px; border-radius: 50%; object-fit: cover; border: 2px solid ${user.border_color || '#ffcc00'};`;
    if (user.avatar_glow && user.avatar_glow !== '#000000') avtStyle += ` box-shadow: 0 0 10px ${user.avatar_glow};`;

    const content = `
    <div class="box">
        <div class="box-title" style="justify-content: space-between;">
            <span>🎨 Trang trí màu sắc nick</span>
            <a href="/shop" style="font-size: 12px; color: #ffcc00; font-weight: normal;">🛒 Cửa hàng</a>
        </div>
        <div class="box-content">
            ${message}
            <div style="background: #141414; border: 1px solid #2a2a2a; padding: 12px; margin-bottom: 15px; border-radius: 6px; text-align: center;">
                <div style="font-size: 12px; color: #aaa; margin-bottom: 8px;">Xem trước thay đổi:</div>
                <div style="display: flex; align-items: center; justify-content: center; gap: 12px;">
                    <img src="${avt}" style="${avtStyle}">
                    <span style="font-size: 16px;"><a href="#" onclick="return false;" style="${previewStyle}">${activeIcon}${displayName}</a></span>
                </div>
            </div>

            <form method="POST" style="background: #121212; border: 1px solid #2c2c2c; padding: 12px; border-radius: 6px; margin-bottom: 12px;">
                <input type="hidden" name="action" value="update_color">
                <div style="font-weight: bold; color: #00ff00; margin-bottom: 8px; font-size: 13px;">⚙️ Tùy chỉnh màu sắc chuyên sâu:</div>
                
                <div style="margin-bottom: 10px;">
                    <label style="font-size: 12px; color: #ccc; display: block; margin-bottom: 4px;">Loại tùy chỉnh:</label>
                    <select name="target_type" style="width: 100%; background: #1c1c1c; color: #00ff00; border: 1px solid #444; padding: 8px; border-radius: 4px; font-size: 13px;">
                        <option value="color">Màu tên tài khoản</option>
                        <option value="glow">Hiệu ứng sáng tên (Glow)</option>
                        <option value="border">Viền tên tài khoản</option>
                        <option value="border_glow">Hiệu ứng sáng viền tên</option>
                        <option value="avt_border">Viền ảnh đại diện</option>
                        <option value="avt_glow">Hiệu ứng sáng ảnh đại diện</option>
                    </select>
                </div>

                <div style="margin-bottom: 12px; display: flex; align-items: center; gap: 10px;">
                    <div style="flex: 1;">
                        <label style="font-size: 12px; color: #ccc; display: block; margin-bottom: 4px;">Chọn mã màu (Hex):</label>
                        <input type="text" name="color_val" value="#00ff00" placeholder="#00ff00" style="width: 100%; background: #1c1c1c; color: #fff; border: 1px solid #444; padding: 8px; border-radius: 4px; box-sizing: border-box; font-size: 13px;">
                    </div>
                    <div>
                        <label style="font-size: 12px; color: #ccc; display: block; margin-bottom: 4px;">Bảng màu:</label>
                        <input type="color" value="#00ff00" onchange="this.form.color_val.value=this.value" style="width: 38px; height: 38px; background: none; border: 1px solid #444; cursor: pointer; border-radius: 4px;">
                    </div>
                </div>

                <div style="display: flex; gap: 8px;">
                    <button type="submit" class="btn" style="background: #0055ff; color: #fff; flex: 1; padding: 8px; border-radius: 4px;">💾 Lưu màu</button>
                </div>
            </form>

            <div style="background: #121212; border: 1px solid #2c2c2c; padding: 12px; border-radius: 6px;">
                <div style="font-weight: bold; color: #ffcc00; margin-bottom: 8px; font-size: 13px;">🌟 Bộ màu phối sẵn nhanh:</div>
                <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                    <a href="/shop/buycolor" onclick="event.preventDefault(); document.querySelector('[name=target_type]').value='color'; document.querySelector('[name=color_val]').value='#00ffff'; alert('Đã chọn Đại dương! Bấm Lưu màu.');" class="btn" style="background: #0d1b2a; color: #00ffff; border: 1px solid #00ffff; font-size: 11px; padding: 4px 8px;">🌊 Đại dương</a>
                    <a href="/shop/buycolor" onclick="event.preventDefault(); document.querySelector('[name=target_type]').value='color'; document.querySelector('[name=color_val]').value='#ffcc00'; alert('Đã chọn Hoàng gia! Bấm Lưu màu.');" class="btn" style="background: #2b180a; color: #ffcc00; border: 1px solid #ffcc00; font-size: 11px; padding: 4px 8px;">👑 Hoàng gia</a>
                    <a href="/shop/buycolor" onclick="event.preventDefault(); document.querySelector('[name=target_type]').value='color'; document.querySelector('[name=color_val]').value='#ff66b2'; alert('Đã chọn Hồng neon! Bấm Lưu màu.');" class="btn" style="background: #2a001a; color: #ff66b2; border: 1px solid #ff66b2; font-size: 11px; padding: 4px 8px;">💖 Hồng neon</a>
                    <a href="/shop/buycolor" onclick="event.preventDefault(); document.querySelector('[name=target_type]').value='color'; document.querySelector('[name=color_val]').value='#ff3300'; alert('Đã chọn Rực lửa! Bấm Lưu màu.');" class="btn" style="background: #2a0800; color: #ff3300; border: 1px solid #ff3300; font-size: 11px; padding: 4px 8px;">🔥 Rực lửa</a>
                </div>

                <form method="POST" style="margin-top: 12px; border-top: 1px solid #222; padding-top: 10px;">
                    <input type="hidden" name="action" value="reset_all">
                    <button type="submit" class="btn" style="background: #550000; color: #fff; width: 100%; padding: 6px; border-radius: 4px; font-size: 12px;">🗑️ Khôi phục màu mặc định tất cả</button>
                </form>
            </div>
        </div>
    </div>
    <div style="text-align: center; margin-top: 10px; font-size: 13px;">
        <a href="/shop">⬅ Quay lại Cửa hàng</a> · <a href="/">🏠 Về trang chủ</a>
    </div>
    `;

    return new Response(renderLayout('Trang trí màu sắc', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
