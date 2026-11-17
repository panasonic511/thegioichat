export async function handleShopFrames(request, env, user, renderLayout) {
    let message = "";
    
    // Xử lý logic Mua hoặc Tháo khung avatar khi người dùng bấm nút POST
    if (request.method === 'POST') {
        const formData = await request.formData();
        const action = formData.get('action');
        const frameId = formData.get('frame_id');

        // Giả lập dữ liệu giá khung (Ví dụ: 10 Vàng mỗi khung)
        const framePrice = 10; 

        if (action === 'buy') {
            if ((user.gold || 0) < framePrice) {
                message = `<div style="color: #ff5555; background: #1a0000; border: 1px solid #550000; padding: 6px; margin-bottom: 8px; text-align: center;">❌ Bạn không đủ Vàng để mua khung này!</div>`;
            } else {
                try {
                    // Trừ vàng của user và lưu khung đã mua (có thể lưu vào bảng inventory hoặc cập nhật trực tiếp)
                    await env.DB.prepare("UPDATE users SET gold = gold - ? WHERE id = ?")
                        .bind(framePrice, user.id)
                        .run();
                    
                    // Cập nhật lại thông tin user sau khi trừ tiền
                    user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first();
                    message = `<div style="color: #00ff00; background: #001a00; border: 1px solid #005500; padding: 6px; margin-bottom: 8px; text-align: center;">✅ Mua thành công Khung avatar ${frameId}!</div>`;
                } catch (e) {
                    message = `<div style="color: #ff5555; text-align: center; margin-bottom: 8px;">❌ Lỗi hệ thống: ${e.message}</div>`;
                }
            }
        } else if (action === 'unequip') {
            message = `<div style="color: #ffcc00; text-align: center; margin-bottom: 8px;">⚠️ Đã tháo khung avatar thành công!</div>`;
        }
    }

    // Danh sách 12 khung avatar mẫu giống hệt Gaubong
    const frames = Array.from({ length: 12 }, (_, i) => ({
        id: i + 1,
        name: `Khung avatar ${i + 1}`,
        price: 10,
        image: user.avatar || 'https://i.imgur.com/7gXvS6v.png'
    }));

    const content = `
    <!-- Header trang cửa hàng khung avatar -->
    <div style="background: #111; border: 1px solid #333; padding: 8px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 11px;">
        <span style="color: #00ff00; font-weight: bold;">🛒 Cửa hàng khung avatar</span>
        <div>👑 <b style="color: #ffcc00;">${user.gold || 0}</b></div>
    </div>

    <div style="font-size: 10px; color: #888; text-align: center; margin-bottom: 8px;">
        Mua một lần, sở hữu cả đời và đổi lại bất cứ lúc nào.
    </div>

    <div style="text-align: right; margin-bottom: 8px;">
        <form method="POST" style="display: inline;">
            <input type="hidden" name="action" value="unequip">
            <button type="submit" class="btn" style="background: #1c1c1c; color: #ffcc00; border: 1px solid #555; font-size: 10px; padding: 3px 8px;">Tháo khung</button>
        </form>
    </div>

    ${message}

    <!-- Lưới hiển thị khung avatar 3 cột giống hệt Gaubong -->
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 12px;">
        ${frames.map(f => `
            <div style="background: #0d0d0d; border: 1px solid #333; padding: 8px; text-align: center;">
                <!-- Ảnh đại diện lồng khung -->
                <div style="position: relative; width: 48px; height: 48px; margin: 0 auto 6px auto;">
                    <img src="${f.image}" width="48" height="48" style="border-radius: 50%; border: 2px solid #ffcc00;">
                </div>
                <div style="font-size: 11px; color: #fff; font-weight: bold; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${f.name}</div>
                <div style="font-size: 10px; color: #ffcc00; margin-bottom: 6px;">👑 ${f.price}</div>
                
                <form method="POST">
                    <input type="hidden" name="action" value="buy">
                    <input type="hidden" name="frame_id" value="${f.id}">
                    <button type="submit" class="btn" style="width: 100%; padding: 3px 0; font-size: 10px; background: #0055ff; color: #fff; border: none;">Mua khung</button>
                </form>
            </div>
        `).join('')}
    </div>

    <div style="text-align: center; margin-top: 10px;"><a href="/shop">⬅️ Quay lại Cửa hàng</a> · <a href="/">Trang chủ</a></div>
    `;

    return new Response(renderLayout('Cửa hàng khung avatar', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
