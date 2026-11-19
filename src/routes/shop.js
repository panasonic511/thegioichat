import { renderUser } from '../worker.js';

export async function handleShop(request, env, user, renderLayout) {
    const rUser = renderUser(user);

    const styledAvatarHtml = String(rUser.avatarHtml || '').replace(
        'style="',
        'style="width: 44px; height: 44px; '
    );

    const coins = Number(user?.coins || 0).toLocaleString('en-US');
    const gold = Number(user?.gold || 0).toLocaleString('en-US');

    const content = `
    <style>
        .shop-wrap { display: flex; flex-direction: column; gap: 12px; }
        .shop-card {
            background: #101010;
            border: 1px solid #242424;
            border-radius: 8px;
            overflow: hidden;
        }
        .shop-card-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 9px 12px;
            background: #151515;
            border-bottom: 1px solid #222;
            font-size: 13px;
            font-weight: bold;
            color: #e5e5e5;
        }
        .shop-card-body {
            padding: 10px;
        }
        .shop-top-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
        }
        .shop-top-btn {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 14px;
            border-radius: 8px;
            text-decoration: none;
            transition: transform 0.12s ease, border-color 0.15s ease, filter 0.15s ease;
        }
        .shop-top-btn:hover {
            transform: translateY(-1px);
            filter: brightness(1.08);
        }
        .shop-top-xu {
            background: linear-gradient(135deg, #0b192c 0%, #0d131d 100%);
            border: 1px solid #1e426e;
        }
        .shop-top-vang {
            background: linear-gradient(135deg, #241706 0%, #16110a 100%);
            border: 1px solid #6b4410;
        }
        .shop-top-icon {
            width: 34px;
            height: 34px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            flex-shrink: 0;
        }
        .shop-top-xu .shop-top-icon {
            background: radial-gradient(circle at 30% 30%, #e5e7eb, #6b7280);
            box-shadow: 0 0 10px rgba(59, 130, 246, 0.25);
        }
        .shop-top-vang .shop-top-icon {
            background: radial-gradient(circle at 30% 30%, #fde047, #b45309);
            box-shadow: 0 0 10px rgba(245, 158, 11, 0.25);
        }
        .shop-item-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .shop-item-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
        }
        .shop-row-btn {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            padding: 11px 12px;
            background: #141414;
            border: 1px solid #262626;
            border-radius: 7px;
            text-decoration: none;
            transition: background 0.15s ease, border-color 0.15s ease;
        }
        .shop-row-btn:hover {
            background: #191919;
            border-color: #3a3a3a;
        }
        .shop-row-left {
            display: flex;
            align-items: center;
            gap: 11px;
            min-width: 0;
        }
        .shop-badge-icon {
            width: 30px;
            height: 30px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 15px;
            flex-shrink: 0;
        }
        .shop-title-txt {
            font-size: 13px;
            font-weight: bold;
            color: #f3f4f6;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .shop-sub-txt {
            font-size: 11px;
            color: #9ca3af;
            margin-top: 2px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .shop-arrow {
            color: #71717a;
            font-size: 15px;
            flex-shrink: 0;
        }
        @media (max-width: 640px) {
            .shop-top-grid,
            .shop-item-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>

    <div class="shop-wrap">
        <!-- Header thông tin tài khoản -->
        <div class="shop-card">
            <div style="display: flex; align-items: center; padding: 12px 14px; background: #0c0c0c;">
                <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
                    <div style="width: 44px; height: 44px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
                        ${styledAvatarHtml}
                    </div>
                    <div style="min-width: 0;">
                        <div style="font-size: 14px; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${rUser.nameHtml}
                        </div>
                        <div style="font-size: 11px; color: #ccc; margin-top: 3px;">
                            🪙 ${coins} Xu | 👑 ${gold} Vàng
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Mục 1: Cửa hàng -->
        <div class="shop-card">
            <div class="shop-card-head">
                <span style="display: inline-flex; align-items: center; gap: 6px;">
                    <span style="color: #22c55e;">🛒</span>
                    <span>Cửa hàng</span>
                </span>
                <a href="/shop/inventory" style="font-size: 12px; color: #60a5fa; font-weight: normal; text-decoration: none;">
                    🧳 Túi đồ của tôi
                </a>
            </div>
            <div class="shop-card-body">
                <div class="shop-top-grid">
                    <a href="#" onclick="alert('Tính năng Nạp xu đang phát triển!'); return false;" class="shop-top-btn shop-top-xu">
                        <div class="shop-top-icon">⚪</div>
                        <div style="min-width: 0;">
                            <div class="shop-title-txt" style="color: #e5e7eb;">Nạp Xu</div>
                            <div class="shop-sub-txt">Dùng cho game và tiện ích</div>
                        </div>
                    </a>
                    <a href="#" onclick="alert('Tính năng Nạp vàng đang phát triển!'); return false;" class="shop-top-btn shop-top-vang">
                        <div class="shop-top-icon">🪙</div>
                        <div style="min-width: 0;">
                            <div class="shop-title-txt" style="color: #fbbf24;">Nạp Vàng</div>
                            <div class="shop-sub-txt">Mua vật phẩm đặc biệt</div>
                        </div>
                    </a>
                </div>
            </div>
        </div>

        <!-- Mục 2: Nâng cấp tài khoản -->
        <div class="shop-card">
            <div class="shop-card-head">
                <span style="display: inline-flex; align-items: center; gap: 6px;">
                    <span style="color: #facc15;">★</span>
                    <span>Nâng cấp tài khoản</span>
                </span>
            </div>
            <div class="shop-card-body">
                <div class="shop-item-list">
                    <a href="/profile/level" class="shop-row-btn">
                        <div class="shop-row-left">
                            <div class="shop-badge-icon" style="background: rgba(250, 204, 21, 0.12); color: #facc15;">★</div>
                            <div style="min-width: 0;">
                                <div class="shop-title-txt">Nâng cấp tài khoản</div>
                                <div class="shop-sub-txt">Khám phá tài khoản Plus và Pro</div>
                            </div>
                        </div>
                        <span class="shop-arrow">›</span>
                    </a>
                </div>
            </div>
        </div>

        <!-- Mục 3: Vật phẩm và trang trí -->
        <div class="shop-card">
            <div class="shop-card-head">
                <span style="display: inline-flex; align-items: center; gap: 6px;">
                    <span style="color: #4ade80;">★</span>
                    <span>Vật phẩm và trang trí</span>
                </span>
            </div>
            <div class="shop-card-body">
                <div class="shop-item-grid">
                    <a href="/shop/avatar-frames" class="shop-row-btn">
                        <div class="shop-row-left">
                            <div class="shop-badge-icon" style="background: rgba(250, 204, 21, 0.14); color: #facc15;">🖼️</div>
                            <div style="min-width: 0;">
                                <div class="shop-title-txt">Khung avatar</div>
                                <div class="shop-sub-txt">Làm nổi bật ảnh đại diện</div>
                            </div>
                        </div>
                        <span class="shop-arrow">›</span>
                    </a>

                    <a href="/shop/name-effects" class="shop-row-btn">
                        <div class="shop-row-left">
                            <div class="shop-badge-icon" style="background: rgba(168, 85, 247, 0.16); color: #c084fc;">🎨</div>
                            <div style="min-width: 0;">
                                <div class="shop-title-txt">Hiệu ứng tên</div>
                                <div class="shop-sub-txt">Gradient, cầu vồng và ánh vàng</div>
                            </div>
                        </div>
                        <span class="shop-arrow">›</span>
                    </a>

                    <a href="/shop/buyicon" class="shop-row-btn">
                        <div class="shop-row-left">
                            <div class="shop-badge-icon" style="background: rgba(59, 130, 246, 0.16); color: #60a5fa;">★</div>
                            <div style="min-width: 0;">
                                <div class="shop-title-txt">Icon trước nick</div>
                                <div class="shop-sub-txt">Biểu tượng nhỏ cạnh tên</div>
                            </div>
                        </div>
                        <span class="shop-arrow">›</span>
                    </a>

                    <a href="/shop/under-nick" class="shop-row-btn">
                        <div class="shop-row-left">
                            <div class="shop-badge-icon" style="background: rgba(34, 197, 94, 0.16); color: #4ade80;">🌄</div>
                            <div style="min-width: 0;">
                                <div class="shop-title-txt">Ảnh nền dưới nick</div>
                                <div class="shop-sub-txt">Trang trí phần tên tài khoản</div>
                            </div>
                        </div>
                        <span class="shop-arrow">›</span>
                    </a>

                    <a href="/shop/buycolor" class="shop-row-btn">
                        <div class="shop-row-left">
                            <div class="shop-badge-icon" style="background: rgba(244, 63, 94, 0.16); color: #fb7185;">🖌️</div>
                            <div style="min-width: 0;">
                                <div class="shop-title-txt">Trang trí màu sắc</div>
                                <div class="shop-sub-txt">Màu tên, viền và hiệu ứng sáng</div>
                            </div>
                        </div>
                        <span class="shop-arrow">›</span>
                    </a>
                </div>
            </div>
        </div>

        <div style="text-align: center; margin-top: 2px; font-size: 13px;">
            <a href="/">🏠 Về trang chủ</a>
        </div>
    </div>
    `;

    return new Response(renderLayout('Cửa hàng', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
```[cite: 10]

Nếu ở Trang chủ (`index.js`) hoặc các trang khác vẫn còn hiển thị `[Lv.xx]` hoặc badge góc phải, bạn gửi thêm file đó để mình dọn sạch cho đồng bộ toàn wap nhé!
