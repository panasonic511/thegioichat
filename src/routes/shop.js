export async function handleShop(request, env, user, renderLayout) {
    // Tự động kiểm tra và thêm các cột cần thiết vào bảng users nếu chưa có
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN active_icon TEXT DEFAULT ''").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN border_color TEXT DEFAULT '#ffcc00'").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN avatar_glow TEXT DEFAULT '#000000'").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN name_color TEXT DEFAULT '#00ff00'").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN name_glow TEXT DEFAULT '#000000'").run(); } catch (e) {}
    
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
    const url = new URL(request.url);
    const tab = url.searchParams.get('tab') || 'icon';

    if (request.method === 'POST') {
        try {
            const formData = await request.formData();
            const action = formData.get('action');

            if (action === 'buy_item') {
                const itemType = formData.get('item_type'); // icon, frame, color
                const itemVal = formData.get('item_val');
                const price = parseInt(formData.get('price') || '5000');

                if ((user.coins || 0) < price) {
                    message = '<div style="color: #ff3333; text-align: center; margin-bottom: 10px; font-weight: bold;">Bạn không đủ xu để mua vật phẩm này!</div>';
                } else {
                    await env.DB.prepare("UPDATE users SET coins = coins - ? WHERE id = ?").bind(price, user.id).run();
                    await env.DB.prepare(
                        "INSERT INTO user_items (user_id, item_type, item_value, created_at) VALUES (?, ?, ?, datetime('now'))"
                    ).bind(user.id, itemType, itemVal).run();
                    
                    message = '<div style="color: #00ff00; text-align: center; margin-bottom: 10px; font-weight: bold;">Mua vật phẩm thành công! Hãy vào Tủ đồ để kích hoạt.</div>';
                    user.coins -= price;
                }
            }
        } catch (e) {
            message = `<div style="color: #ff3333; text-align: center; margin-bottom: 10px;">Lỗi: ${e.message}</div>`;
        }
    }

    // Danh mục vật phẩm trong cửa hàng
    const shopIcons = [
        { name: 'Vương miện Hoàng gia', val: '👑', price: 10000, type: 'icon' },
        { name: 'Ngôi sao Lấp lánh', val: '⭐', price: 5000, type: 'icon' },
        { name: 'Ngọn lửa Rực cháy', val: '🔥', price: 7000, type: 'icon' },
        { name: 'Kim cương Đắt giá', val: '💎', price: 15000, type: 'icon' },
        { name: 'Trái tim Tình yêu', val: '💖', price: 4000, type: 'icon' },
        { name: 'Cỏ 4 lá May mắn', val: '🍀', price: 6000, type: 'icon' }
    ];

    const shopFrames = [
        { name: 'Khung Vàng Hoàng Kim', val: '#ffcc00', price: 20000, type: 'frame' },
        { name: 'Khung Xanh Cyber', val: '#00ffff', price: 18000, type: 'frame' },
        { name: 'Khung Đỏ Hỏa Long', val: '#ff0000', price: 25000, type: 'frame' },
        { name: 'Khung Tím Huyền Bí', val: '#9900ff', price: 22000, type: 'frame' }
    ];

    const shopColors = [
        { name: 'Màu Đỏ Rực Cháy', val: '#ff0000', price: 10000, type: 'color' },
        { name: 'Màu Vàng Kim', val: '#ffcc00', price: 10000, type: 'color' },
        { name: 'Màu Xanh Dương', val: '#00ffff', price: 10000, type: 'color' },
        { name: 'Màu Hồng Phấn', val: '#ff66b2', price: 10000, type: 'color' }
    ];

    let currentItems = shopIcons;
    if (tab === 'frames') currentItems = shopFrames;
    if (tab === 'colors') currentItems = shopColors;

    let itemsHtml = currentItems.map(item => `
        <div style="background: #080808; border: 1px solid #333; padding: 10px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 12px;">
                ${tab === 'icon' ? `<span style="font-size: 26px;">${item.val}</span>` : `<div style="width: 30px; height: 30px; border-radius: 50%; background: ${item.val}; border: 2px solid #fff;"></div>`}
                <div>
                    <div style="font-weight: bold; color: #fff;">${item.name}</div>
                    <div style="color: #ffcc00; font-size: 12px; margin-top: 2px;">🪙 ${item.price.toLocaleString()} Xu</div>
                </div>
            </div>
            <form method="POST">
                <input type="hidden" name="action" value="buy_item">
                <input type="hidden" name="item_type" value="${item.type}">
                <input type="hidden" name="item_val" value="${item.val}">
                <input type="hidden" name="price" value="${item.price}">
                <button type="submit" class="btn" style="background: #0055ff; color: #fff; padding: 6px 12px; border-radius: 4px;">Mua ngay</button>
            </form>
        </div>
    `).join('');

    const content = `
    <div class="box">
        <div class="box-title">🛒 Cửa hàng vật phẩm Wap</div>
        <div class="box-content">
            <div style="margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center; background: #111; padding: 8px 12px; border: 1px solid #333;">
                <span>Ví của bạn: <strong style="color: #00ff00;">🪙 ${(user.coins || 0).toLocaleString()} Xu</strong></span>
                <a href="/shop/inventory" class="btn" style="background: #222; color: #ffcc00; padding: 4px 10px; font-size: 12px; text-decoration: none;">📦 Tủ đồ của tôi</a>
            </div>

            <!-- Thanh Tabs chuyển đổi danh mục -->
            <div style="display: flex; gap: 4px; margin-bottom: 15px; border-bottom: 1px solid #333; padding-bottom: 8px;">
                <a href="/shop?tab=icon" class="btn" style="flex: 1; text-align: center; background: ${tab === 'icon' ? '#0055ff' : '#1c1c1c'}; color: #fff; text-decoration: none; padding: 6px; font-size: 12px;">✨ Biểu tượng Icon</a>
                <a href="/shop?tab=frames" class="btn" style="flex: 1; text-align: center; background: ${tab === 'frames' ? '#0055ff' : '#1c1c1c'}; color: #fff; text-decoration: none; padding: 6px; font-size: 12px;">🖼️ Khung Avatar</a>
                <a href="/shop?tab=colors" class="btn" style="flex: 1; text-align: center; background: ${tab === 'colors' ? '#0055ff' : '#1c1c1c'}; color: #fff; text-decoration: none; padding: 6px; font-size: 12px;">🎨 Màu Tên Nick</a>
            </div>

            ${message}
            <div style="font-weight: bold; margin-bottom: 8px; color: #00ff00;">Danh sách vật phẩm:</div>
            ${itemsHtml}
        </div>
    </div>
    <div style="text-align: center; margin-top: 10px; font-size: 13px;">
        <a href="/">🏠 Về trang chủ</a>
    </div>
    `;

    return new Response(renderLayout('Cửa hàng vật phẩm', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
