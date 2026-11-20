import { handleLogin } from './auth.js';
import { renderUser } from '../worker.js';

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function safeCount(db, sql, params = []) {
    try {
        const row = await db.prepare(sql).bind(...params).first();
        return { ok: true, count: Number(row?.total ?? 0) };
    } catch (e) {
        return { ok: false, count: 0 };
    }
}

export async function handleIndex(request, env, user, renderLayout) {
    if (!user) {
        if (request.method === 'POST') return await handleLogin(request, env);

        const loginContent = `
        <div class="box">
            <div class="box-title">🔑 Đăng nhập hệ thống</div>
            <div class="box-content">
                <form method="POST" action="/login">
                    <label style="color: #00ff00; display: block; margin-bottom: 4px; font-size: 14px;">Tên đăng nhập / ID:</label>
                    <input type="text" name="username" required style="width: 100%; background: #000; color: #fff; border: 1px solid #444; padding: 8px; box-sizing: border-box; margin-bottom: 10px; font-size: 14px;">
                    <label style="color: #00ff00; display: block; margin-bottom: 4px; font-size: 14px;">Mật khẩu:</label>
                    <input type="password" name="password" required style="width: 100%; background: #000; color: #fff; border: 1px solid #444; padding: 8px; box-sizing: border-box; margin-bottom: 12px; font-size: 14px;">
                    <button type="submit" class="btn" style="width: 100%; background: #0055ff; color: #fff; padding: 8px; font-size: 14px;">Đăng nhập</button>
                </form>
                <div style="text-align: center; margin-top: 10px; font-size: 13px;">
                    Chưa có tài khoản? <a href="/register">Đăng ký ngay</a>
                </div>
            </div>
        </div>`;
        return new Response(renderLayout('Đăng nhập', loginContent, null), {
            headers: { 'Content-Type': 'text/html;charset=UTF-8' }
        });
    }

    let announcements = { results: [] };
    try {
        announcements = await env.DB.prepare(`
            SELECT announcements.*, users.display_name, users.username, users.role, users.is_admin, users.active_icon,
                   users.name_color, users.name_glow, users.name_border, users.name_border_glow, users.border_color, users.avatar_glow, users.avatar
            FROM announcements
            LEFT JOIN users ON announcements.user_id = users.id
            ORDER BY announcements.id DESC
            LIMIT 5
        `).all();
    } catch (e) {}

    let recentFeeds = [];
    try {
        const fRows = await env.DB.prepare(`
            SELECT feeds.id, feeds.user_id, feeds.content, feeds.created_at,
                   users.display_name, users.username, users.role, users.is_admin, users.active_icon,
                   users.name_color, users.name_glow, users.name_border, users.name_border_glow, users.border_color, users.avatar_glow, users.avatar
            FROM feeds
            LEFT JOIN users ON feeds.user_id = users.id
            ORDER BY feeds.id DESC
            LIMIT 3
        `).all();
        recentFeeds = fRows?.results || [];
    } catch (e) {}

    let totalFeeds = 0;
    try {
        const fCount = await env.DB.prepare("SELECT COUNT(*) as total FROM feeds").first();
        totalFeeds = fCount?.total || 0;
    } catch (e) {}

    const nowSec = Math.floor(Date.now() / 1000);
    let partyCount = 0;
    const partyTable = await safeCount(
        env.DB,
        "SELECT COUNT(*) as total FROM parties WHERE (status IS NULL OR status IN ('active', 'open', 'live')) AND (expires_at IS NULL OR expires_at > ?)",
        [nowSec]
    );
    if (partyTable.ok) {
        partyCount = partyTable.count;
    } else {
        partyCount = totalFeeds;
    }

    let entertainmentCount = 0;
    const zoneTable = await safeCount(
        env.DB,
        "SELECT COUNT(*) as total FROM entertainment_zones WHERE (is_active IS NULL OR is_active = 1)"
    );
    if (zoneTable.ok) {
        entertainmentCount = zoneTable.count;
    } else {
        const gameTable = await safeCount(
            env.DB,
            "SELECT COUNT(*) as total FROM games WHERE (is_active IS NULL OR is_active = 1)"
        );
        entertainmentCount = gameTable.ok ? gameTable.count : 0;
    }

    const currentUserUI = renderUser(user);
    const styledCurrentAvatar = String(currentUserUI.avatarHtml || '').replace(
        'style="',
        'style="width: 44px; height: 44px; display: block; '
    );

    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const vnTime = new Date(utc + (3600000 * 7));
    const hours = String(vnTime.getHours()).padStart(2, '0');
    const minutes = String(vnTime.getMinutes()).padStart(2, '0');
    const days = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    const dayName = days[vnTime.getDay()];
    const dateStr = `${String(vnTime.getDate()).padStart(2, '0')}/${String(vnTime.getMonth() + 1).padStart(2, '0')}/${vnTime.getFullYear()}`;
    const timeDisplay = `${hours}:${minutes}`;
    const dateDisplay = `${dayName} - ${dateStr}`;

    const announcementList = announcements?.results || [];
    const announcementHtml = announcementList.length > 0
        ? announcementList.map(item => {
            const itemUI = renderUser(item);
            return `
            <div style="padding: 8px 6px; border-bottom: 1px dashed #222; text-align: center;">
                <div style="color: #ffcc66; font-weight: bold; margin-bottom: 4px;">${escapeHtml(item.content || '')}</div>
                <div style="font-size: 12px; color: #999;">${itemUI.nameHtml}</div>
            </div>`;
        }).join('')
        : `
        <div style="padding: 8px 6px; text-align: center;">
            <div style="color: #e5e7eb; font-weight: bold; margin-bottom: 3px;">${timeDisplay} - ${dayName}</div>
            <div style="color: #9ca3af; font-size: 12px; margin-bottom: 6px;">••••• ${dateStr} •••••</div>
            <div style="font-weight: bold; font-size: 13px; letter-spacing: 0.3px;">
                <span style="color: #ff9933;">CHÀO MỪNG ĐẾN VỚI</span>
                <span style="color: #38bdf8;">THẾ GIỚI CHAT</span>
            </div>
            <div style="color: #4ade80; font-weight: bold; font-size: 12px; margin-top: 2px;">CHÚC MỌI NGƯỜI ONLINE VUI VẺ</div>
        </div>`;

    const memberFeedHtml = recentFeeds.length > 0
        ? recentFeeds.map(f => {
            const fUI = renderUser(f);
            const isSelf = Number(f.user_id) === Number(user.id);
            return `
            <div style="padding: 8px 6px; border-top: 1px solid #222; text-align: center;">
                <div style="color: #ff80bf; font-weight: bold; margin-bottom: 3px;">${escapeHtml(f.content || '')}</div>
                <div style="font-size: 12px; color: #aaa;">
                    ${fUI.nameHtml}
                    ${isSelf ? ` · <a href="/users/feed" style="color: #ffcc00;">Thay đổi</a>` : ''}
                </div>
            </div>`;
        }).join('')
        : `
        <div style="padding: 8px 6px; border-top: 1px solid #222; text-align: center;">
            <div style="color: #f472b6; font-weight: bold; margin-bottom: 3px;">Chia sẻ trạng thái đầu tiên của bạn trên bảng tin!</div>
            <div style="font-size: 12px; color: #aaa;">
                ${currentUserUI.nameHtml} · <a href="/users/feed" style="color: #ffcc00;">Đăng bảng tin</a>
            </div>
        </div>`;

    const content = `
    <!-- Khung thông tin cá nhân ngoài Trang chủ -->
    <div class="box" style="margin-bottom: 12px; background: #080808; border: 1px solid #333;">
        <div class="box-content" style="display: flex; align-items: center; padding: 12px;">
            <div style="display: flex; align-items: center; min-width: 0;">
                <div style="width: 44px; height: 44px; margin-right: 12px; flex-shrink: 0;">
                    ${styledCurrentAvatar}
                </div>
                <div style="min-width: 0;">
                    <div style="font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${currentUserUI.nameHtml}
                    </div>
                    <div style="font-size: 13px; color: #ccc; margin-top: 3px;">
                        🪙 ${(user.coins || 0).toLocaleString()} Xu
                        ${user.gold ? `| 👑 ${user.gold.toLocaleString()} Vàng` : ''}
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Phòng chát -->
    <div class="box">
        <div class="box-title">🟢 Phòng chát</div>
        <div class="box-content" style="padding: 10px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <a href="/users/feed" class="btn" style="text-align: left; padding: 10px; background: #141414; border: 1px solid #333; font-size: 14px;">🎉 Bữa tiệc (${partyCount})</a>
                <a href="/game" class="btn" style="text-align: left; padding: 10px; background: #141414; border: 1px solid #333; font-size: 14px;">🎮 Trò chơi (0)</a>
            </div>
        </div>
    </div>

    <!-- Menu hệ thống -->
    <div class="box">
        <div class="box-title">≡ Menu</div>
        <div class="box-content" style="padding: 10px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; align-items: stretch;">
                <div style="background: #121212; border: 1px solid #333; padding: 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;">
                    <div style="font-size: 28px; font-weight: bold; color: #fff; letter-spacing: 2px; text-shadow: 0 0 8px #00ff00;">${timeDisplay}</div>
                    <div style="font-size: 13px; color: #ffcc00; margin-top: 4px;">${dateDisplay}</div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 6px;">
                    <a href="/profile" style="background: #121212; border: 1px solid #333; padding: 7px 10px; display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: bold; color: #ff3333; text-decoration: none;">
                        <span>👤</span> Trang cá nhân
                    </a>
                    <a href="/profile" style="background: #121212; border: 1px solid #333; padding: 7px 10px; display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: bold; color: #ff3333; text-decoration: none;">
                        <span>🔍</span> Tìm kiếm ID
                    </a>
                    <a href="/profile/level" style="background: #121212; border: 1px solid #333; padding: 7px 10px; display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: bold; color: #ff3333; text-decoration: none;">
                        <span>📊</span> Bảng xếp hạng
                    </a>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px;">
                <div style="display: flex; flex-direction: column; gap: 6px;">
                    <a href="/users/feed" style="background: #121212; border: 1px solid #333; padding: 8px 10px; display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: bold; color: #ff66cc; text-decoration: none;">
                        <span>💬</span> Diễn đàn
                    </a>
                    <a href="/profile/level" style="background: #121212; border: 1px solid #333; padding: 8px 10px; display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: bold; color: #ff66cc; text-decoration: none;">
                        <span>📊</span> Bảng cấp độ
                    </a>
                    <a href="/shop" style="background: #121212; border: 1px solid #333; padding: 8px 10px; display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: bold; color: #ff66cc; text-decoration: none;">
                        <span>📈</span> Thống kê
                    </a>
                </div>
                <div style="display: flex; flex-direction: column; gap: 6px;">
                    <a href="/profile" style="background: #121212; border: 1px solid #333; padding: 8px 10px; display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: bold; color: #ff66cc; text-decoration: none;">
                        <span>👥</span> Bạn bè
                    </a>
                    <a href="/profile" style="background: #121212; border: 1px solid #333; padding: 8px 10px; display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: bold; color: #ff66cc; text-decoration: none;">
                        <span>⚙️</span> Cài đặt
                    </a>
                    <a href="/game" style="background: #121212; border: 1px solid #333; padding: 8px 10px; display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: bold; color: #ff66cc; text-decoration: none;">
                        <span>🎮</span> Khu giải trí [${entertainmentCount}]
                    </a>
                </div>
            </div>
        </div>
    </div>

    <!-- Thông báo hệ thống -->
    <div class="box">
        <div class="box-title" style="justify-content: space-between;">
            <span>📢 Thông báo</span>
            <a href="/" style="font-size: 12px; color: #ff9933; font-weight: bold; text-decoration: none;">↻ Làm mới</a>
        </div>
        <div class="box-content" style="font-size: 13px; padding: 8px 10px;">
            ${announcementHtml}
            ${memberFeedHtml}
        </div>
    </div>
    `;

    return new Response(renderLayout('Trang chủ', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
