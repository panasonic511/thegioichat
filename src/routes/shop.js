import { renderUser } from '../worker.js';

export async function handleShop(request, env, user, renderLayout) {
    const rUser = renderUser(user);

    // Đồng bộ chính xác màu sắc huy hiệu bên góc phải giống hệt Trang chủ (index.js)
    function getRoleBadgeStyle(role) {
        const r = String(role || 'Thành Viên').trim();
        if (r === 'Chủ Wap') {
            return 'background: #1a1500; color: #ffcc00; border: 1px solid #665200; font-weight: bold; padding: 3px 10px; font-size: 11px; border-radius: 4px; display: inline-block;';
        } else if (r === 'Admin') {
            return 'background: #2a0800; color: #ff3300; border: 1px solid #ff3300; text-shadow: 0 0 6px #ff0000; font-weight: bold; padding: 3px 10px; font-size: 11px; border-radius: 4px; display: inline-block;';
        } else if (r === 'Mod') {
            return 'background: #001a2a; color: #00ffff; border: 1px solid #00ffff; text-shadow: 0 0 6px #00ffff; font-weight: bold; padding: 3px 10px; font-size: 11px; border-radius: 4px; display: inline-block;';
        } else {
            return 'background: #141414; color: #00ff00; border: 1px solid #444; font-weight: bold; padding: 3px 10px; font-size: 11px; border-radius: 4px; display: inline-block;';
        }
    }

    // Giữ nguyên viền avatar và hiệu ứng sáng (avatar_glow) từ renderUser
    const styledAvatarHtml = rUser.avatarHtml.replace('style="', 'style="width: 44px; height: 44px; ');

    const content = `
    <!-- Header thông tin tài khoản đồng bộ 100% với Trang chủ -->
    <div class="box" style="margin-bottom: 12px;">
        <div class="box-content" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; background: #0c0c0c;">
            <div style="display: flex; align-items: center; gap: 12px; overflow: hidden;">
                <div style="width: 44px; height: 44px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
                    ${styledAvatarHtml}
                </div>
                <div style="overflow: hidden;">
                    <div style="font-size: 14px; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${rUser.nameHtml} <span style="color: #ffcc00; font-size: 12px; font-weight: bold;">[Lv.${user.level || 1}]</span>
                    </div>
                    <div style="font-size: 11px; color: #ccc; margin-top: 3px;">
                        🪙 ${(user.coins || 0).toLocaleString()} Xu | 👑 ${(user.gold || 0).toLocaleString()} Vàng
                    </div>
                </div>
            </div>
            <div style="flex-shrink: 0; margin-left: 8px;">
                <span style="${getRoleBadgeStyle(user.role)}">${user.role || 'Thành viên'}</span>
            </div>
        </div>
    </div>

    <div class="box">
        <div class="box-title" style="justify-content: space-between;">
            <span>🛒 Cửa hàng vật phẩm</span>
            <a href="/shop/inventory" style="font-size: 12px; color: #ffcc00; font-weight: normal;">📦 Túi đồ của tôi</a>
        </div>
        <div class="box-content" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <a href="#" onclick="alert('Tính năng Nạp xu đang phát triển!'); return false;" class="btn" style="text-align: center; padding: 10px;">
                <div style="font-size: 16px; margin-bottom: 2px;">📥</div>
                <div style="font-weight: bold; color: #00ff00;">Nạp Xu</div>
                <div style="font-size: 11px; color: #aaa; font-weight: normal;">Dùng cho game và tiện ích</div>
            </a>
            <a href="#" onclick="alert('Tính năng Nạp vàng đang phát triển!'); return false;" class="btn" style="text-align: center; padding: 10px;">
                <div style="font-size: 16px; margin-bottom: 2px;">👑</div>
                <div style="font-weight: bold; color: #ffcc00;">Nạp Vàng</div>
                <div style="font-size: 11px; color: #aaa; font-weight: normal;">Mua vật phẩm đặc biệt</div>
            </a>
        </div>
    </div>

    <div class="box">
        <div class="box-title">⭐ Nâng cấp tài khoản</div>
        <div class="box-content">
            <a href="/profile/level" style="display: block; background: #121212; border: 1px solid #2c2c2c; border-radius: 6px; padding: 10px; text-decoration: none;">
                <div style="font-weight: bold; color: #ffcc00; font-size: 13px;">✨ Nâng cấp tài khoản</div>
                <div style="color: #aaa; font-size: 11px; margin-top: 2px;">Khám phá tài khoản Plus và Pro</div>
            </a>
        </div>
    </div>

    <div class="box">
        <div class="box-title">🎁 Vật phẩm và trang trí</div>
        <div class="box-content" style="display: flex; flex-direction: column; gap: 8px;">
            <a href="/shop/avatar-frames" class="btn" style="text-align: left; padding: 10px; display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 20px;">🖼️</span>
                <div>
                    <div style="color: #00ff00; font-weight: bold;">Khung avatar</div>
                    <div style="font-size: 11px; color: #aaa; font-weight: normal;">Làm nổi bật ảnh đại diện</div>
                </div>
            </a>
            <a href="/shop/buyicon" class="btn" style="text-align: left; padding: 10px; display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 20px;">👑</span>
                <div>
                    <div style="color: #00ff00; font-weight: bold;">Icon trước nick</div>
                    <div style="font-size: 11px; color: #aaa; font-weight: normal;">Biểu tượng nhỏ cạnh tên</div>
                </div>
            </a>
            <a href="/shop/buycolor" class="btn" style="text-align: left; padding: 10px; display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 20px;">🎨</span>
                <div>
                    <div style="color: #00ff00; font-weight: bold;">Trang trí màu sắc</div>
                    <div style="font-size: 11px; color: #aaa; font-weight: normal;">Màu tên, viền và hiệu ứng sáng</div>
                </div>
            </a>
        </div>
    </div>
    <div style="text-align: center; margin-top: 10px; font-size: 13px;">
        <a href="/">🏠 Về trang chủ</a>
    </div>
    `;

    return new Response(renderLayout('Cửa hàng', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
