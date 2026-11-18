export async function handleShopColor(request, env, user, renderLayout) {
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN name_color TEXT DEFAULT '#00ff00'").run(); } catch (e) {}
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

            if (action === 'buy_color') {
                const colorVal = formData.get('color_val');
                const price = parseInt(formData.get('price') || '10000');

                if ((user.coins || 0) < price) {
                    message = '<div style="color: #ff3333; text-align: center; margin-bottom: 10px; font-weight: bold;">Bạn không đủ xu để mua màu này!</div>';
                } else {
                    await env.DB.prepare("UPDATE users SET coins = coins - ? WHERE id = ?").bind(price, user.id).run();
                    await env.DB.prepare(
                        "INSERT INTO user_items (user_id, item_type, item_value, created_at) VALUES (?, 'color', ?, datetime('now'))"
                    ).bind(user.id, colorVal).run();
                    message = '<div style="color: #00ff00; text-align: center; margin-bottom: 10px; font-weight: bold;">Mua màu thành công! Hãy vào Túi đồ để sử dụng.</div>';
                    user.coins -= price;
                }
            }
        } catch (e) {
            message = `<div style="color: #ff3333; text-align: center; margin-bottom: 10px;">Lỗi: ${e.message}</div>`;
        }
    }

    const shopColors = [
        { name: 'Đỏ Rực Cháy', val: '#ff0000', price: 10000 },
        { name: 'Vàng Kim Hoàng Gia', val: '#ffcc00', price: 10000 },
        { name: 'Xanh Dương Cyber', val: '#00ffff', price: 10000 },
        { name: 'Hồng Phấn Mộng Mơ', val: '#ff66b2', price: 10000 },
        { name: 'Tím Huyền Bí', val: '#9900ff', price: 12000 }
    ];

    let itemsHtml = shopColors.map(item => `
        <div style="background: #121212; border: 1px solid #2c2c2c; border-radius: 6px; padding: 10px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 12px;">
                <div style="width: 32px; height: 32px; border-radius: 4px; background: ${item.val}; border: 1px solid #555;"></div>
                <div>
                    <div style="font-weight: bold; color: #fff; font-size: 13px;">${item.name}</div>
                    <div style="color: #ffcc00; font-size: 12px; margin-top: 2px;">🪙 ${item.price.toLocaleString()} Xu</div>
                </div>
            </div>
            <form method="POST">
                <input type="hidden" name="action" value="buy_color">
                <input type="hidden" name="color_val" value="${item.val}">
                <input type="hidden" name="price" value="${item.price}">
                <button type="submit" class="btn" style="background: #0055ff; color: #fff; padding: 6px 12px; border-radius: 4px;">Mua ngay</button>
            </form>
        </div>
    `).join('');

    const content = `
    <div class="box">
        <div class="box-title" style="justify-content: space-between;">
            <span>🎨 Cửa hàng màu sắc tên nick</span>
            <a href="/shop/inventory" style="font-size: 12px; color: #ffcc00; font-weight: normal;">📦 Túi đồ</a>
        </div>
        <div class="box-content">
            <div style="margin-bottom: 12px; background: #141414; padding: 8px 12px; border: 1px solid #2a2a2a; border-radius: 4px; font-size: 13px;">
                Số dư: <strong style="color: #00ff00;">🪙 ${(user.coins || 0).toLocaleString()} Xu</strong>
            </div>
            ${message}
            ${itemsHtml}
        </div>
    </div>
    <div style="text-align: center; margin-top: 10px; font-size: 13px;">
        <a href="/shop">⬅ Quay lại Cửa hàng</a>
    </div>
    `;

    return new Response(renderLayout('Cửa hàng màu sắc', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
