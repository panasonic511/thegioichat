export async function handleInventory(request, env, user, renderLayout) {
    // Tự động kiểm tra và bổ sung đầy đủ các cột cấu hình trang trí tài khoản nếu chưa có
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN active_icon TEXT DEFAULT ''").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN border_color TEXT DEFAULT '#ffcc00'").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN avatar_glow TEXT DEFAULT '#000000'").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN name_color TEXT DEFAULT '#00ff00'").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN name_glow TEXT DEFAULT '#000000'").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN name_border TEXT DEFAULT '#000000'").run(); } catch (e) {}

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
            const itemType = formData.get('item_type');
            const itemVal = formData.get('item_val') || '';

            if (action === 'equip_item') {
                if (itemType === 'icon') {
                    await env.DB.prepare("UPDATE users SET active_icon = ? WHERE id = ?").bind(itemVal, user.id).run();
                    user.active_icon = itemVal;
                    message = '<div style="color: #00ff00; text-align: center; margin-bottom: 10px; font-weight: bold;">Đã cập nhật Icon trước nick thành công!</div>';
                } else if (itemType === 'frame') {
                    await env.DB.prepare("UPDATE users SET border_color = ? WHERE id = ?").bind(itemVal, user.id).run();
                    user.border_color = itemVal;
                    message = '<div style="color: #00ff00; text-align: center; margin-bottom: 10px; font-weight: bold;">Đã kích hoạt Khung Avatar thành công!</div>';
                } else if (itemType === 'color') {
                    await env.DB.prepare("UPDATE users SET name_color = ? WHERE id = ?").bind(itemVal, user.id).run();
                    user.name_color = itemVal;
                    message = '<div style="color: #00ff00; text-align: center; margin
