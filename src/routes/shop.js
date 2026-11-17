export async function handleShop(request, env, user, renderLayout) {
    const content = `
    <div class="box">
        <div class="box-title">🛒 Cửa hàng Thế Giới Chat</div>
        <div class="box-content">
            <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                <div style="background: #1a1a1a; padding: 12px; flex: 1; text-align: center; border: 1px solid #333;">
                    <div style="font-weight: bold; color: #00ff00;">🪙 Nạp Xu</div>
                    <div style="font-size: 11px; color: #aaa; margin-top: 4px;">Dùng cho game và tiện ích wap</div>
                </div>
                <div style="background: #1a1a1a; padding: 12px; flex: 1; text-align: center; border: 1px solid #333;">
                    <div style="font-weight: bold; color: #ffcc00;">👑 Nạp Vàng</div>
                    <div style="font-size: 11px; color: #aaa; margin-top: 4px;">Mua vật phẩm đặc biệt & VIP</div>
                </div>
            </div>

            <h3 style="border-bottom: 1px solid #333; padding-bottom: 5px;">✨ Vật phẩm & Trang trí</h3>
            <ul style="line-height: 1.8; font-size: 13px; padding-left: 20px;">
                <li>🖼️ <b>Khung avatar độc quyền:</b> Làm nổi bật ảnh đại diện (Giá: 5,000 Xu)</li>
                <li>🎨 <b>Hiệu ứng tên Gradient:</b> Cầu vồng và ánh vàng rực rỡ (Giá: 10,000 Xu)</li>
                <li>⭐ <b>Icon trước nick:</b> Biểu tượng nhỏ uy quyền cạnh tên (Giá: 3,000 Xu)</li>
                <li>🌌 <b>Ảnh nền dưới tên tài khoản:</b> Tùy chỉnh phong cách cá nhân (Giá: 8,000 Xu)</li>
            </ul>
        </div>
    </div>
    <div style="text-align: center;"><a href="/">⬅️ Về trang chủ</a></div>
    `;

    return new Response(renderLayout('Cửa hàng', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
