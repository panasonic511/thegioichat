export async function handleShop(request, env, user, renderLayout) {
    const content = `
    <!-- Tiêu đề & Túi đồ -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; padding: 0 2px;">
        <span style="font-weight: bold; color: #00ff00;">🛒 Cửa hàng Thế Giới Chat</span>
        <a href="#" style="font-size: 11px; color: #ffcc00;">🛍️ Túi đồ của tôi</a>
    </div>

    <!-- Nạp Xu & Nạp Vàng -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 8px;">
        <a href="#" style="background: #0d0d0d; border: 1px solid #333; padding: 10px; display: block; text-decoration: none; color: inherit;">
            <div style="font-weight: bold; color: #fff; font-size: 12px; margin-bottom: 2px;">⚪ Nạp Xu</div>
            <div style="font-size: 10px; color: #888;">Dùng cho game và tiện ích</div>
        </a>
        <a href="#" style="background: #0d0d0d; border: 1px solid #333; padding: 10px; display: block; text-decoration: none; color: inherit;">
            <div style="font-weight: bold; color: #ffcc00; font-size: 12px; margin-bottom: 2px;">👑 Nạp Vàng</div>
            <div style="font-size: 10px; color: #888;">Mua vật phẩm đặc biệt</div>
        </a>
    </div>

    <!-- Nâng cấp tài khoản -->
    <div class="box" style="margin-bottom: 8px;">
        <div class="box-title">⭐ Nâng cấp tài khoản</div>
        <div class="box-content" style="padding: 6px;">
            <a href="#" style="background: #141414; border: 1px solid #333; padding: 8px 10px; display: flex; justify-content: space-between; align-items: center; color: #fff; text-decoration: none;">
                <div>
                    <div style="font-weight: bold; font-size: 12px;">⭐ Nâng cấp tài khoản</div>
                    <div style="font-size: 10px; color: #888; margin-top: 2px;">Khám phá tài khoản Plus và Pro</div>
                </div>
                <span style="color: #666; font-size: 14px;">›</span>
            </a>
        </div>
    </div>

    <!-- Vật phẩm và trang trí (Lưới 2 cột giống hệt Gaubong) -->
    <div class="box">
        <div class="box-title">✨ Vật phẩm và trang trí</div>
        <div class="box-content" style="padding: 6px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                
                <a href="#" style="background: #141414; border: 1px solid #333; padding: 8px; display: flex; justify-content: space-between; align-items: center; text-decoration: none; color: inherit;">
                    <div>
                        <div style="font-weight: bold; font-size: 11px; color: #fff;">🖼️ Khung avatar</div>
                        <div style="font-size: 9px; color: #888; margin-top: 1px;">Làm nổi bật ảnh đại diện</div>
                    </div>
                    <span style="color: #555; font-size: 12px;">›</span>
                </a>

                <a href="#" style="background: #141414; border: 1px solid #333; padding: 8px; display: flex; justify-content: space-between; align-items: center; text-decoration: none; color: inherit;">
                    <div>
                        <div style="font-weight: bold; font-size: 11px; color: #fff;">🎨 Hiệu ứng tên</div>
                        <div style="font-size: 9px; color: #888; margin-top: 1px;">Gradient, cầu vồng và ánh vàng</div>
                    </div>
                    <span style="color: #555; font-size: 12px;">›</span>
                </a>

                <a href="#" style="background: #141414; border: 1px solid #333; padding: 8px; display: flex; justify-content: space-between; align-items: center; text-decoration: none; color: inherit;">
                    <div>
                        <div style="font-weight: bold; font-size: 11px; color: #fff;">⭐ Icon trước nick</div>
                        <div style="font-size: 9px; color: #888; margin-top: 1px;">Biểu tượng nhỏ cạnh tên</div>
                    </div>
                    <span style="color: #555; font-size: 12px;">›</span>
                </a>

                <a href="#" style="background: #141414; border: 1px solid #333; padding: 8px; display: flex; justify-content: space-between; align-items: center; text-decoration: none; color: inherit;">
                    <div>
                        <div style="font-weight: bold; font-size: 11px; color: #fff;">🖼️ Ảnh nền dưới nick</div>
                        <div style="font-size: 9px; color: #888; margin-top: 1px;">Trang trí phần tên tài khoản</div>
                    </div>
                    <span style="color: #555; font-size: 12px;">›</span>
                </a>

                <a href="#" style="background: #141414; border: 1px solid #333; padding: 8px; display: flex; justify-content: space-between; align-items: center; text-decoration: none; color: inherit; grid-column: span 2;">
                    <div>
                        <div style="font-weight: bold; font-size: 11px; color: #fff;">🎨 Trang trí màu sắc</div>
                        <div style="font-size: 9px; color: #888; margin-top: 1px;">Màu tên, viền và hiệu ứng sáng</div>
                    </div>
                    <span style="color: #555; font-size: 12px;">›</span>
                </a>

            </div>
        </div>
    </div>

    <div style="text-align: center; margin-top: 10px;"><a href="/">⬅️ Về trang chủ</a></div>
    `;

    return new Response(renderLayout('Cửa hàng', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
