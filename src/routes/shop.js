export async function handleShop(request, env, user, renderLayout) {
    const defaultAvatarMale = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><rect width='120' height='120' fill='%230f172a'/><circle cx='60' cy='45' r='22' fill='%2338bdf8'/><path d='M20 105 C20 80, 100 80, 100 105' fill='%2338bdf8'/></svg>";
    const defaultAvatarFemale = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><rect width='120' height='120' fill='%231f1025'/><circle cx='60' cy='45' r='22' fill='%23f472b6'/><path d='M20 105 C20 80, 100 80, 100 105' fill='%23f472b6'/></svg>";
    const sysAvt = user.gender === 'female' ? defaultAvatarFemale : defaultAvatarMale;
    const avt = (user.avatar && !String(user.avatar).includes('7gXvS6v')) ? user.avatar : sysAvt;

    // Lấy icon đang được kích hoạt từ cột active_icon của user
    const activeIcon = user.active_icon ? `${user.active_icon} ` : '';
    const displayName = user.display_name || user.username || 'Thành viên';
    
    // Tạo phong cách hiệu ứng tên nick
    const nameColor = user.name_color || '#00ff00';
    let nameStyle = `color: ${nameColor}; font-weight: bold;`;
    let shadows = [];
    if (user.name_glow && user.name_glow !== '#000000') shadows.push(`0 0 6px ${user.name_glow}`);
    if (user.name_border_glow && user.name_border_glow !== '#000000') shadows.push(`0 0 4px ${user.name_border_glow}`);
    if (shadows.length > 0) nameStyle += ` text-shadow: ${shadows.join(', ')};`;
    if (user.name_border && user.name_border !== '#000000') nameStyle += ` -webkit-text-stroke: 0.5px ${user.name_border};`;

    // Hàm hiệu ứng chức vụ
    function getRoleBadgeStyle(role) {
        const r = String(role || 'Thành Viên').trim();
        if (r === 'Chủ Wap') {
            return 'background: #2a0800; color: #ff3300; border: 1px solid #ff3300; text-shadow: 0 0 6px #ff0000; font-weight: bold; padding: 2px 8px; font-size: 11px; border-radius: 4px; display: inline-block;';
        } else if (r === 'Admin') {
            return 'background: #2a1a00; color: #ffcc00; border: 1px solid #ffcc00; text-shadow: 0 0 6px #ffcc00; font-weight: bold; padding: 2px 8px; font-size: 11px; border-radius: 4px; display: inline-block;';
        } else if (r === 'Mod') {
            return 'background: #001a2a; color: #00ffff; border: 1px solid #00ffff; text-shadow: 0 0 6px #00ffff; font-weight: bold; padding: 2px 8px; font-size: 11px; border-radius: 4px; display: inline-block;';
        } else {
            return 'background: #141414; color: #00ff00; border: 1px solid #444; font-weight: bold; padding: 2px 8px; font-size: 11px; border-radius: 4px; display: inline-block;';
        }
    }

    const roleBadge = user.role ? `<span style="${getRoleBadgeStyle(user.role)}">${user.role}</span>` : '';

    const content = `
    <style>
        .shop-user-bar { background: #141414; border: 1px solid #2a2a2a; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-radius: 4px; }
        .shop-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        @media (max-width: 480px) { .shop-grid-2 { grid-template-columns: 1fr; } }
        .shop-card { background: #121212; border: 1px solid #2c2c2c; border-radius: 6px; padding: 12px; display: flex; align-items: center; justify-content: space-between; text-decoration: none !important; transition: 0.2s; }
        .shop-card:hover { border-color: #00ff00; background: #1a1a1a; }
        .shop-card-left { display: flex; align-items: center; gap: 12px; }
        .shop-icon-circle { width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
        .shop-card-title { color: #ffffff; font-weight: bold; font-size: 13px; margin-bottom: 2px; }
        .shop-card-desc { color: #888888; font-size: 11px; }
        .shop-arrow { color: #666; font-weight: bold; font-size: 14px; }
        .topup-xu { background: linear-gradient(135deg, #0d1b2a 0%, #162a40 100%); border: 1px solid #1f3b5c; }
        .topup-vang { background: linear-gradient(135deg, #2b180a 0%, #42240e 100%); border: 1px solid #5e3414; }
    </style>

    <div class="shop-user-bar">
        <div style="display: flex; align-items: center; gap: 10px;">
            <img src="${avt}" width="40" height="40" style="border-radius: 6px; object-fit: cover; border: 1px solid ${user.border_color || '#ffcc00'};">
            <div>
                <div style="font-size: 14px;"><a href="/profile?user=${user.id}" style="${nameStyle}">${activeIcon}${displayName}</a></div>
                <div style="font-size: 12px; margin-top: 2px;">
                    <span style="color: #ffcc00;">👑 ${(user.gold || 0).toLocaleString()}</span>
                    <span style="color: #aaa; margin-left: 8px;">🪙 ${(user.coins || 0).toLocaleString()}</span>
                    <a href="/shop/topup" style="color: #00ff00; font-weight: bold; margin-left: 4px;">+</a>
                </div>
            </div>
        </div>
        <div>${roleBadge}</div>
    </div>

    <div class="box">
        <div class="box-title" style="justify-content: space-between;">
            <span>🛒 Cửa hàng</span>
            <a href="/shop/inventory" style="font-size: 12px; color: #aaa; font-weight: normal;">📦 Tủ đồ của tôi</a>
        </div>
        <div class="box-content">
            <div class="shop-grid-2">
                <a href="/shop/topup-xu" class="shop-card topup-xu">
                    <div class="shop-card-left">
                        <div class="shop-icon-circle" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8;">🪙</div>
                        <div>
                            <div class="shop-card-title">Nạp Xu</div>
                            <div class="shop-card-desc">Dùng cho game và tiện ích</div>
                        </div>
                    </div>
                </a>
                <a href="/shop/topup-gold" class="shop-card topup-vang">
                    <div class="shop-card-left">
                        <div class="shop-icon-circle" style="background: rgba(251, 191, 36, 0.15); color: #fbbf24;">👑</div>
                        <div>
                            <div class="shop-card-title">Nạp Vàng</div>
                            <div class="shop-card-desc">Mua vật phẩm đặc biệt</div>
                        </div>
                    </div>
                </a>
            </div>
        </div>
    </div>

    <div class="box">
        <div class="box-title">⭐ Nâng cấp tài khoản</div>
        <div class="box-content">
            <a href="/shop/vip" class="shop-card">
                <div class="shop-card-left">
                    <div class="shop-icon-circle" style="background: rgba(250, 204, 21, 0.15); color: #facc15;">⭐</div>
                    <div>
                        <div class="shop-card-title">Nâng cấp tài khoản</div>
                        <div class="shop-card-desc">Khám phá tài khoản Plus và Pro</div>
                    </div>
                </div>
                <span class="shop-arrow">&gt;</span>
            </a>
        </div>
    </div>

    <div class="box">
        <div class="box-title">★ Vật phẩm và trang trí</div>
        <div class="box-content">
            <div class="shop-grid-2">
                <a href="/shop/avatar-frames" class="shop-card">
                    <div class="shop-card-left">
                        <div class="shop-icon-circle" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b;">🖼️</div>
                        <div>
                            <div class="shop-card-title">Khung avatar</div>
                            <div class="shop-card-desc">Làm nổi bật ảnh đại diện</div>
                        </div>
                    </div>
                    <span class="shop-arrow">&gt;</span>
                </a>

                <a href="/shop/name-effects" class="shop-card">
                    <div class="shop-card-left">
                        <div class="shop-icon-circle" style="background: rgba(168, 85, 247, 0.15); color: #a855f7;">✨</div>
                        <div>
                            <div class="shop-card-title">Hiệu ứng tên</div>
                            <div class="shop-card-desc">Gradient, cầu vồng và ánh vàng</div>
                        </div>
                    </div>
                    <span class="shop-arrow">&gt;</span>
                </a>

                <a href="/shop/buyicon" class="shop-card">
                    <div class="shop-card-left">
                        <div class="shop-icon-circle" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6;">⭐</div>
                        <div>
                            <div class="shop-card-title">Icon trước nick</div>
                            <div class="shop-card-desc">Biểu tượng nhỏ cạnh tên</div>
                        </div>
                    </div>
                    <span class="shop-arrow">&gt;</span>
                </a>

                <a href="/shop/name-bg" class="shop-card">
                    <div class="shop-card-left">
                        <div class="shop-icon-circle" style="background: rgba(34, 197, 94, 0.15); color: #22c55e;">🏞️</div>
                        <div>
                            <div class="shop-card-title">Ảnh nền dưới nick</div>
                            <div class="shop-card-desc">Trang trí phần tên tài khoản</div>
                        </div>
                    </div>
                    <span class="shop-arrow">&gt;</span>
                </a>

                <a href="/shop/buycolor" class="shop-card">
                    <div class="shop-card-left">
                        <div class="shop-icon-circle" style="background: rgba(244, 63, 94, 0.15); color: #f43f5e;">🎨</div>
                        <div>
                            <div class="shop-card-title">Trang trí màu sắc</div>
                            <div class="shop-card-desc">Màu tên, viền và hiệu ứng sáng</div>
                        </div>
                    </div>
                    <span class="shop-arrow">&gt;</span>
                </a>
            </div>
        </div>
    </div>
    `;

    return new Response(renderLayout('Cửa hàng', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
