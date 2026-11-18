export async function handleShop(request, env, user, renderLayout) {
    // Tự động tạo bảng kho đồ và cột active_icon nếu chưa có
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

            if (action === 'buy_icon') {
                const iconVal = formData.get('icon_val');
                const price = parseInt(formData.get('price') || '5000');

                if ((user.coins || 0) < price) {
                    message = '<div style="color: #ff3333; text-align: center; margin-bottom: 10px; font-weight: bold;">Bạn không đủ xu để mua vật phẩm này!</div>';
                } else {
                    // Trừ xu và thêm vào kho đồ
                    await env.DB.prepare("UPDATE users SET coins = coins - ? WHERE id = ?").bind(price, user.id).run();
                    await env.DB.prepare(
                        "INSERT INTO user_items (user_id, item_type, item_value, created_at) VALUES (?, 'icon', ?, datetime('now'))"
                    ).bind(user.id, iconVal).run();
                    message = '<div style="color: #00ff00; text-align: center; margin-bottom: 10px; font-weight: bold;">Mua biểu tượng thành công! Hãy vào Tủ đồ để kích hoạt.</div>';
                    user.coins -= price;
                }
            }
        } catch (e) {
            message = `<div style="color: #ff3333; text-align: center; margin-bottom: 10px;">Lỗi: ${e.message}</div>`;
        }
    }

    // Danh sách Icon độc quyền trong cửa hàng
    const shopIcons = [
        { name: 'Vương miện Hoàng gia', val: '👑', price: 10000 },
        { name: 'Ngôi sao Lấp lánh', val: '⭐', price: 5000 },
        { name: 'Ngọn lửa Rực cháy', val: '🔥', price: 7000 },
        { name: 'Kim cương Đắt giá', val: '💎', price: 15000 },
        { name: 'Trái tim Tình yêu', val: '💖', price: 4000 },
        { name: 'Cỏ 4 lá May mắn', val: '🍀', price: 6000 }
    ];

    let itemsHtml = shopIcons.map(item => `
        <div style="background: #080808; border: 1px solid #333; padding: 10px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 12px;">
                <span style="font-size: 26px;">${item.val}</span>
                <div>
                    <div style="font-weight: bold; color: #fff;">${item.name}</div>
                    <div style="color: #ffcc00; font-size: 12px; margin-top: 2px;">🪙 ${item.price.toLocaleString()} Xu</div>
                </div>
            </div>
            <form method="POST">
                <input type="hidden" name="action" value="buy_icon">
                <input type="hidden" name="icon_val" value="${item.val}">
                <input type="hidden" name="price" value="${item.price}">
                <button type="submit" class="btn" style="background: #0055ff; color: #fff; padding: 6px 12px; border-radius: 4px;">Mua ngay</button>
            </form>
        </div>
    `).join('');

    const content = `
    <div class="box">
        <div class="box-title">🛒 Cửa hàng mua Icon gắn trước nick</div>
        <div class="box-content">
            <div style="margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center; background: #111; padding: 8px 12px; border: 1px solid #333;">
                <span>Ví của bạn: <strong style="color: #00ff00;">🪙 ${(user.coins || 0).toLocaleString()} Xu</strong></span>
                <div>
                    <a href="/shop/inventory" class="btn" style="background: #222; color: #ffcc00; padding: 4px 10px; font-size: 12px; text-decoration: none;">📦 Tủ đồ</a>
                </div>
            </div>
            ${message}
            <div style="font-weight: bold; margin-bottom: 8px; color: #00ff00;">✨ Chọn biểu tượng muốn sở hữu:</div>
            ${itemsHtml}
        </div>
    </div>
    <div style="text-align: center; margin-top: 10px; font-size: 13px;">
        <a href="/shop">🛒 Quay lại trang cửa hàng</a> · <a href="/">🏠 Về trang chủ</a>
    </div>
    `;

    return new Response(renderLayout('Mua Icon trước nick', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
