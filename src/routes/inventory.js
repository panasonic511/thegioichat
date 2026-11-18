export async function handleInventory(request, env, user, renderLayout) {
    // Tự động kiểm tra và thêm cột active_icon nếu chưa có
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN active_icon TEXT DEFAULT ''").run(); } catch (e) {}
    try {
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS user_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                item_type TEXT,
                item_value TEXT,
                created_at TEXT
            )
        `).run();
    } catch (e) {}

    let message = '';
    if (request.method === 'POST') {
        try {
            const formData = await request.formData();
            const action = formData.get('action');

            if (action === 'equip_icon') {
                const iconVal = formData.get('icon_val') || '';
                await env.DB.prepare("UPDATE users SET active_icon = ? WHERE id = ?").bind(iconVal, user.id).run();
                user.active_icon = iconVal;
                message = '<div style="color: #00ff00; text-align: center; margin-bottom: 10px; font-weight: bold;">Đã cập nhật biểu tượng trước nick thành công!</div>';
            }
        } catch (e) {
            message = `<div style="color: #ff3333; text-align: center; margin-bottom: 10px;">Lỗi: ${e.message}</div>`;
        }
    }

    // Lấy danh sách Icon đã mua trong kho đồ của user
    let myIcons = [];
    try {
        const res = await env.DB.prepare("SELECT * FROM user_items WHERE user_id = ? AND item_type = 'icon'").bind(user.id).all();
        if (res.results) myIcons = res.results;
    } catch (e) {}

    let iconsHtml = '';
    if (myIcons.length === 0) {
        iconsHtml = '<div style="text-align: center; color: #777; padding: 12px; font-size: 13px;">Bạn chưa sở hữu Icon nào. <a href="/shop/buyicon">Ghé cửa hàng ngay</a></div>';
    } else {
        iconsHtml = myIcons.map(item => {
            const isEquipped = user.active_icon === item.item_value;
            return `
            <div style="background: #121212; border: 1px solid ${isEquipped ? '#00ff00' : '#2c2c2c'}; border-radius: 6px; padding: 10px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 28px;">${item.item_value}</span>
                    <div>
                        <div style="font-weight: bold; color: #fff; font-size: 13px;">Biểu tượng Icon VIP</div>
                        <div style="color: ${isEquipped ? '#00ff00' : '#aaa'}; font-size: 11px; margin-top: 2px;">
                            ${isEquipped ? '🟢 Đang sử dụng' : '📦 Trong kho'}
                        </div>
                    </div>
                </div>
                <form method="POST">
                    <input type="hidden" name="action" value="equip_icon">
                    <input type="hidden" name="icon_val" value="${isEquipped ? '' : item.item_value}">
                    <button type="submit" class="btn" style="background: ${isEquipped ? '#550000' : '#00aa00'}; color: #fff; padding: 6px 12px; border-radius: 4px; font-size: 12px;">
                        ${isEquipped ? 'Gỡ bỏ' : 'Sử dụng'}
                    </button>
                </form>
            </div>`;
        }).join('');
    }

    const content = `
    <div class="box">
        <div class="box-title" style="justify-content: space-between;">
            <span>📦 Tủ đồ & Vật phẩm của bạn</span>
            <a href="/shop" style="font-size: 12px; color: #ffcc00; font-weight: normal;">🛒 Cửa hàng</a>
        </div>
        <div class="box-content">
            ${message}
            <div style="font-weight: bold; margin-bottom: 8px; color: #00ff00; font-size: 13px;">⭐ Biểu tượng (Icon) trước nick sở hữu:</div>
            ${iconsHtml}
        </div>
    </div>
    <div style="text-align: center; margin-top: 10px; font-size: 13px;">
        <a href="/shop">⬅ Quay lại Cửa hàng</a> · <a href="/">🏠 Về trang chủ</a>
    </div>
    `;

    return new Response(renderLayout('Tủ đồ cá nhân', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
