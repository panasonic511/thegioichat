export async function handleInventory(request, env, user, renderLayout) {
    // Đảm bảo bảng users có cột active_icon
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN active_icon TEXT DEFAULT ''").run(); } catch (e) {}

    let message = '';
    if (request.method === 'POST') {
        try {
            const formData = await request.formData();
            const action = formData.get('action');
            const itemType = formData.get('item_type');
            const itemVal = formData.get('item_val') || '';

            if (action === 'equip_item') {
                if (itemType === 'icon') {
                    // Cập nhật trực tiếp vào database
                    await env.DB.prepare("UPDATE users SET active_icon = ? WHERE id = ?").bind(itemVal, user.id).run();
                    user.active_icon = itemVal;
                    message = '<div style="color: #00ff00; text-align: center; margin-bottom: 10px; font-weight: bold;">Đã kích hoạt Icon trước nick thành công!</div>';
                }
            } else if (action === 'unequip_item') {
                if (itemType === 'icon') {
                    await env.DB.prepare("UPDATE users SET active_icon = '' WHERE id = ?").bind(user.id).run();
                    user.active_icon = '';
                    message = '<div style="color: #ffcc00; text-align: center; margin-bottom: 10px; font-weight: bold;">Đã gỡ bỏ Icon trước nick!</div>';
                }
            }
        } catch (e) {
            message = `<div style="color: #ff3333; text-align: center; margin-bottom: 10px;">Lỗi: ${e.message}</div>`;
        }
    }

    // Lấy toàn bộ kho đồ của user
    let inventoryItems = [];
    try {
        const res = await env.DB.prepare("SELECT * FROM user_items WHERE user_id = ? ORDER BY id DESC").bind(user.id).all();
        if (res.results) inventoryItems = res.results;
    } catch (e) {}

    let inventoryHtml = '';
    if (inventoryItems.length === 0) {
        inventoryHtml = '<div style="text-align: center; color: #777; padding: 20px; font-size: 13px;">Túi đồ của bạn đang trống. <a href="/shop/buyicon">Mua icon ngay!</a></div>';
    } else {
        inventoryHtml = inventoryItems.map(item => {
            const type = item.item_type || 'icon';
            const val = item.item_value || '';
            const isEquipped = (type === 'icon' && user.active_icon === val);

            return `
            <div style="background: #121212; border: 1px solid ${isEquipped ? '#00ff00' : '#2c2c2c'}; border-radius: 6px; padding: 10px 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 28px;">${val}</span>
                    <div>
                        <div style="font-weight: bold; color: #fff; font-size: 13px;">Biểu tượng Icon trước nick</div>
                        <div style="color: ${isEquipped ? '#00ff00' : '#aaa'}; font-size: 11px; margin-top: 2px;">
                            ${isEquipped ? '🟢 Đang sử dụng' : '📦 Trong kho'}
                        </div>
                    </div>
                </div>
                <form method="POST">
                    <input type="hidden" name="action" value="${isEquipped ? 'unequip_item' : 'equip_item'}">
                    <input type="hidden" name="item_type" value="${type}">
                    <input type="hidden" name="item_val" value="${val}">
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
            <span>📦 Túi đồ & Kho vật phẩm của bạn</span>
            <a href="/shop" style="font-size: 12px; color: #ffcc00; font-weight: normal;">🛒 Cửa hàng</a>
        </div>
        <div class="box-content">
            ${message}
            <div style="font-weight: bold; margin-bottom: 10px; color: #00ff00; font-size: 13px;">✨ Danh sách biểu tượng Icon sở hữu:</div>
            ${inventoryHtml}
        </div>
    </div>
    <div style="text-align: center; margin-top: 10px; font-size: 13px;">
        <a href="/shop">⬅ Quay lại Cửa hàng</a> · <a href="/">🏠 Về trang chủ</a>
    </div>
    `;

    return new Response(renderLayout('Túi đồ cá nhân', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
