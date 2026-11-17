export async function handleShopColor(request, env, user, renderLayout) {
    let message = "";

    // Tự động thêm cột nếu chưa có trong DB
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN name_color TEXT;").run(); } catch(e) {}
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN border_color TEXT;").run(); } catch(e) {}
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN name_effect TEXT;").run(); } catch(e) {}

    if (request.method === 'POST') {
        const formData = await request.formData();
        const action = formData.get('action');

        try {
            if (action === 'update_color') {
                const colorType = formData.get('color_type'); // 'name_color' hoặc 'border_color'
                const colorValue = formData.get('color_value');

                if (colorType === 'name_color') {
                    await env.DB.prepare("UPDATE users SET name_color = ? WHERE id = ?").bind(colorValue, user.id).run();
                } else if (colorType === 'border_color') {
                    await env.DB.prepare("UPDATE users SET border_color = ? WHERE id = ?").bind(colorValue, user.id).run();
                }
                message = `<div style="color: #00ff00; background: #001a00; border: 1px solid #005500; padding: 6px; text-align: center; margin-bottom: 8px;">✅ Cập nhật màu sắc thành công!</div>`;
            } else if (action === 'apply_preset') {
                const preset = formData.get('preset');
                let nColor = '#00ff00', bColor = '#ffcc00';
                if (preset === 'ocean') { nColor = '#00ffff'; bColor = '#0055ff'; }
                else if (preset === 'royal') { nColor = '#ffcc00'; bColor = '#ff8800'; }
                else if (preset === 'neon') { nColor = '#ff55ff'; bColor = '#aa00aa'; }
                else if (preset === 'fire') { nColor = '#ff3300'; bColor = '#ff9900'; }

                await env.DB.prepare("UPDATE users SET name_color = ?, border_color = ? WHERE id = ?").bind(nColor, bColor, user.id).run();
                message = `<div style="color: #00ff00; background: #001a00; border: 1px solid #005500; padding: 6px; text-align: center; margin-bottom: 8px;">✅ Đã áp dụng bộ phối màu sẵn có!</div>`;
            } else if (action === 'reset_all') {
                await env.DB.prepare("UPDATE users SET name_color = NULL, border_color = NULL, name_effect = NULL WHERE id = ?").bind(user.id).run();
                message = `<div style="color: #ffcc00; background: #1a1a00; border: 1px solid #555500; padding: 6px; text-align: center; margin-bottom: 8px;">⚠️ Đã khôi phục mặc định toàn bộ màu sắc!</div>`;
            }
            user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first();
        } catch (e) {
            message = `<div style="color: #ff5555; background: #1a0000; border: 1px solid #550000; padding: 6px; text-align: center; margin-bottom: 8px;">❌ Lỗi: ${e.message}</div>`;
        }
    }

    const defaultAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100' height='100' fill='%231a1a1a'/><circle cx='50' cy='38' r='18' fill='%2300ff00'/><path d='M20 88 C20 65, 80 65, 80 88' fill='%2300ff00'/></svg>";
    const currentAvatar = (user.avatar && !user.avatar.includes('7gXvS6v')) ? user.avatar : defaultAvatar;
    const nameStyle = user.name_color ? `color: ${user.name_color}; font-weight: bold;` : `color: #00ff00; font-weight: bold;`;
    const borderStyle = user.border_color ? `border: 2px solid ${user.border_color};` : `border: 2px solid #ffcc00;`;

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
            <span style="${nameStyle}">${user.display_name}</span> <span style="color: #ffcc00; font-size: 10px;">[Lv.${user.level || 1}]</span>
        </div>
        <div style="margin-top: 6px;">
            <img src="${currentAvatar}" width="48" height="48" style="border-radius: 50%; ${borderStyle} object-fit: cover;">
        </div>
    </div>

    <!-- Tùy chỉnh màu sắc -->
    <div class="box" style="margin-bottom: 8px;">
        <div class="box-title">🎨 Tùy chỉnh màu sắc</div>
        <div class="box-content" style="font-size: 11px;">
            <form method="POST">
                <input type="hidden" name="action" value="update_color">
                
                <div style="margin-bottom: 6px;">
                    <label style="color: #00ff00; display: block; margin-bottom: 2px;">Loại tùy chỉnh:</label>
                    <select name="color_type" style="width: 100%; background: #000; color: #fff; border: 1px solid #444; padding: 6px; font-size: 11px;">
                        <option value="name_color">Màu tên tài khoản</option>
                        <option value="border_color">Màu viền avatar</option>
                    </select>
                </div>

                <div style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                    <label style="color: #00ff00;">Mã màu:</label>
                    <input type="color" name="color_value" value="${user.name_color || '#00ff00'}" style="background: #000; border: 1px solid #444; width: 40px; height: 30px; cursor: pointer;">
                    <span style="color: #aaa; font-size: 10px;">Chọn màu tùy ý trên bảng màu</span>
                </div>

                <div style="display: flex; gap: 6px;">
                    <button type="submit" class="btn" style="background: #0055ff; color: #fff; flex: 1;">Lưu màu</button>
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

            <form method="POST" onsubmit="return confirm('Bạn có chắc muốn khôi phục mặc định không?');">
                <input type="hidden" name="action" value="reset_all">
                <button type="submit" class="btn" style="background: #333; color: #ffcc00; width: 100%; font-size: 11px;">🔄 Khôi phục màu mặc định</button>
            </form>
        </div>
    </div>

    <div style="text-align: center; margin-top: 10px;"><a href="/shop">⬅️ Quay lại Cửa hàng</a> · <a href="/">Trang chủ</a></div>
    `;

    return new Response(renderLayout('Trang trí màu sắc', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
