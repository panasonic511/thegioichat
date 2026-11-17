export async function handleInventory(request, env, user, renderLayout) {
    let message = "";

    // Xử lý logic trang bị hoặc tháo vật phẩm
    if (request.method === 'POST') {
        const formData = await request.formData();
        const action = formData.get('action');
        const itemType = formData.get('item_type');
        const itemValue = formData.get('item_value');

        try {
            if (action === 'equip') {
                if (itemType === 'frame') {
                    await env.DB.prepare("UPDATE users SET avatar_frame = ? WHERE id = ?").bind(itemValue, user.id).run();
                } else if (itemType === 'effect') {
                    await env.DB.prepare("UPDATE users SET name_effect = ? WHERE id = ?").bind(itemValue, user.id).run();
                }
                message = `<div style="color: #00ff00; background: #001a00; padding: 6px; text-align: center; margin-bottom: 8px;">✅ Đã trang bị vật phẩm thành công!</div>`;
            } else if (action === 'unequip') {
                if (itemType === 'frame') {
                    await env.DB.prepare("UPDATE users SET avatar_frame = NULL WHERE id = ?").bind(user.id).run();
                } else if (itemType === 'effect') {
                    await env.DB.prepare("UPDATE users SET name_effect = NULL WHERE id = ?").bind(user.id).run();
                }
                message = `<div style="color: #ffcc00; background: #1a1a00; padding: 6px; text-align: center; margin-bottom: 8px;">⚠️ Đã tháo vật phẩm!</div>`;
            }
            // Làm mới lại thông tin user
            user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first();
        } catch (e) {
            message = `<div style="color: #ff5555; text-align: center; margin-bottom: 8px;">❌ Lỗi: ${e.message}</div>`;
        }
    }

    const content = `
    <div class="box">
        <div class="box-title">🛍️ Túi đồ và Vật phẩm của tôi</div>
        <div class="box-content">
            <div style="background: #151515; padding: 8px; font-size: 11px; margin-bottom: 8px; color: #aaa;">
                💡 Nơi lưu trữ các khung avatar, hình ảnh Photoshop, chữ hiệu ứng và các vật phẩm bạn đã mua từ cửa hàng để gắn vào nick.
            </div>

            ${message}

            <div style="font-size: 12px; font-weight: bold; color: #ffcc00; margin-bottom: 6px;">🖼️ Khung Avatar đang sở hữu:</div>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; margin-bottom: 12px;">
                <div style="background: #141414; border: 1px solid #333; padding: 8px; text-align: center;">
                    <img src="${user.avatar || 'https://i.imgur.com/7gXvS6v.png'}" width="40" height="40" style="border-radius: 50%; border: 2px solid #ffcc00; margin-bottom: 4px;">
                    <div style="font-size: 11px; color: #fff;">Khung Mặc định</div>
                    <form method="POST" style="margin-top: 6px;">
                        <input type="hidden" name="action" value="equip">
                        <input type="hidden" name="item_type" value="frame">
                        <input type="hidden" name="item_value" value="/images/users/default_frame.png">
                        <button type="submit" class="btn" style="font-size: 10px; padding: 2px 8px; background: #0055ff; color: #fff;">Dùng</button>
                    </form>
                </div>
                <div style="background: #141414; border: 1px solid #333; padding: 8px; text-align: center;">
                    <img src="https://i.imgur.com/7gXvS6v.png" width="40" height="40" style="border-radius: 50%; border: 2px solid #00ff00; margin-bottom: 4px;">
                    <div style="font-size: 11px; color: #fff;">Khung Photoshop VIP</div>
                    <form method="POST" style="margin-top: 6px;">
                        <input type="hidden" name="action" value="equip">
                        <input type="hidden" name="item_type" value="frame">
                        <input type="hidden" name="item_value" value="/images/users/vip_frame.png">
                        <button type="submit" class="btn" style="font-size: 10px; padding: 2px 8px; background: #0055ff; color: #fff;">Dùng</button>
                    </form>
                </div>
            </div>

            <div style="font-size: 12px; font-weight: bold; color: #ffcc00; margin-bottom: 6px;">✨ Hiệu ứng chữ & Hình ảnh cá nhân:</div>
            <div style="background: #141414; border: 1px solid #333; padding: 8px; margin-bottom: 8px; font-size: 11px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <span style="color: #ff55ff; font-weight: bold;">Chữ động Gradient / Lấp lánh</span>
                    <div style="font-size: 9px; color: #888;">Nguồn: /images/users/effect_1.gif</div>
                </div>
                <form method="POST" style="margin: 0;">
                    <input type="hidden" name="action" value="equip">
                    <input type="hidden" name="item_type" value="effect">
                    <input type="hidden" name="item_value" value="/images/users/effect_1.gif">
                    <button type="submit" class="btn" style="font-size: 10px; padding: 2px 6px; background: #0055ff; color: #fff;">Trang bị</button>
                </form>
            </div>
        </div>
    </div>
    <div style="text-align: center;"><a href="/shop">🛒 Quay lại Cửa hàng</a> · <a href="/">Trang chủ</a></div>
    `;

    return new Response(renderLayout('Túi đồ cá nhân', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
