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

function isSafeColor(color) {
    const c = String(color || '').trim();
    if (/^#[0-9a-fA-F]{3,8}$/.test(c)) return c;
    if (/^[a-zA-Z]{3,20}$/.test(c)) return c;
    return '#4ade80';
}

function renderBbcodeAndIcons(rawText) {
    let text = String(rawText ?? '');
    const iconMap = {
        '[smile]': '<span class="wap-anim-ico ico-bounce" title="Vui vẻ">😄</span>',
        '[lol]': '<span class="wap-anim-ico ico-shake" title="Cười lớn">😂</span>',
        '[love]': '<span class="wap-anim-ico ico-pulse" title="Yêu thích">😍</span>',
        '[heart]': '<span class="wap-anim-ico ico-beat" title="Trái tim">❤️</span>',
        '[fire]': '<span class="wap-anim-ico ico-flicker" title="Bùng nổ">🔥</span>',
        '[cool]': '<span class="wap-anim-ico ico-tilt" title="Ngầu">😎</span>',
        '[cry]': '<span class="wap-anim-ico ico-drop" title="Khóc">😭</span>',
        '[angry]': '<span class="wap-anim-ico ico-shake" title="Tức giận">😡</span>',
        '[party]': '<span class="wap-anim-ico ico-spin" title="Tiệc tùng">🎉</span>',
        '[star]': '<span class="wap-anim-ico ico-pulse" title="Ngôi sao">🌟</span>',
        '[wink]': '<span class="wap-anim-ico ico-tilt" title="Nháy mắt">😉</span>',
        '[hug]': '<span class="wap-anim-ico ico-beat" title="Thả tim">🥰</span>'
    };

    const placeholders = [];
    for (const [code, html] of Object.entries(iconMap)) {
        const idx = placeholders.length;
        placeholders.push(html);
        text = text.split(code).join(`@@WAPICO_${idx}@@`);
    }

    text = escapeHtml(text);

    text = text.replace(/\[color=([^\]]+)\]([\s\S]*?)\[\/color\]/gi, function(_, col, inner) {
        const safeCol = isSafeColor(col);
        return `<span style="color:${safeCol};font-weight:bold;">${inner}</span>`;
    });

    text = text.replace(/\n/g, '<br>');

    text = text.replace(/@@WAPICO_(\d+)@@/g, function(_, idx) {
        return placeholders[Number(idx)] || '';
    });

    return text;
}

async function ensureChatTable(db) {
    try {
        await db.prepare(`
            CREATE TABLE IF NOT EXISTS community_chat (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                content TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )
        `).run();
    } catch (e) {}
}

async function fetchChatMessages(db, afterId = 0, limit = 25) {
    await ensureChatTable(db);
    try {
        if (afterId > 0) {
            const rows = await db.prepare(`
                SELECT c.id, c.user_id, c.content, c.created_at,
                       u.display_name, u.username, u.role, u.is_admin, u.active_icon,
                       u.name_color, u.name_glow, u.name_border, u.name_border_glow,
                       u.border_color, u.avatar_glow, u.avatar, u.gender, u.level, u.coins, u.status_text
                FROM community_chat c
                LEFT JOIN users u ON c.user_id = u.id
                WHERE c.id > ?
                ORDER BY c.id ASC
                LIMIT ?
            `).bind(afterId, limit).all();
            return rows?.results || [];
        }

        const rows = await db.prepare(`
            SELECT c.id, c.user_id, c.content, c.created_at,
                   u.display_name, u.username, u.role, u.is_admin, u.active_icon,
                   u.name_color, u.name_glow, u.name_border, u.name_border_glow,
                   u.border_color, u.avatar_glow, u.avatar, u.gender, u.level, u.coins, u.status_text
            FROM community_chat c
            LEFT JOIN users u ON c.user_id = u.id
            ORDER BY c.id DESC
            LIMIT ?
        `).bind(limit).all();
        return (rows?.results || []).reverse();
    } catch (e) {
        return [];
    }
}

function formatTimeAgoVn(tsSec) {
    const nowSec = Math.floor(Date.now() / 1000);
    const diff = Math.max(0, nowSec - Number(tsSec || nowSec));
    if (diff < 30) return 'Vừa xong';
    if (diff < 60) return `${diff} giây trước`;
    const mins = Math.floor(diff / 60);
    if (mins < 60) return `${mins} phút trước`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} giờ trước`;
    const days = Math.floor(hours / 24);
    return `${days} ngày trước`;
}

function buildChatItemHtml(msg) {
    const ui = renderUser(msg);
    const smallAvatar = String(ui.avatarHtml || '').replace(
        'style="',
        'style="width:36px;height:36px;display:block;'
    );
    const timeLabel = formatTimeAgoVn(msg.created_at);
    const formattedBody = renderBbcodeAndIcons(msg.content || '');
    const lvl = Number(msg.level || 1);
    const coins = Number(msg.coins || 0).toLocaleString();
    const moodStatus = msg.status_text ? `<div class="cchat-status">» Status: ${escapeHtml(msg.status_text)}</div>` : '';

    return `
    <div class="cchat-item" data-msg-id="${Number(msg.id || 0)}" data-username="${escapeHtml(msg.username || msg.display_name || '')}">
        <div class="cchat-row-top">
            <div class="cchat-user-meta">
                <div class="cchat-ava">${smallAvatar}</div>
                <div class="cchat-info">
                    <div class="cchat-nick-line">
                        ${ui.nameHtml}
                        <span class="cchat-time">· ${escapeHtml(timeLabel)}</span>
                    </div>
                    <div class="cchat-stats">C.top: <b>${lvl}</b> · Xu: <b>${coins}</b></div>
                </div>
            </div>
            <div class="cchat-actions">
                <button type="button" class="cchat-mini-btn" onclick="cchatMentionUser(this)" title="Tag thành viên">Tag</button>
            </div>
        </div>
        <div class="cchat-body">${formattedBody}</div>
        ${moodStatus}
    </div>`;
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

    const url = new URL(request.url);
    const isAjaxChat = url.searchParams.get('ajax_chat') === '1' || request.headers.get('X-Community-Chat') === '1';

    if (isAjaxChat && request.method === 'GET') {
        const afterId = Math.max(0, Number(url.searchParams.get('after_id') || 0));
        const mode = url.searchParams.get('mode') || 'poll';
        const list = mode === 'reload'
            ? await fetchChatMessages(env.DB, 0, 25)
            : await fetchChatMessages(env.DB, afterId, 25);

        const itemsHtml = list.map(buildChatItemHtml).join('');
        const maxId = list.reduce((acc, m) => Math.max(acc, Number(m.id || 0)), afterId);

        return new Response(JSON.stringify({
            ok: true,
            mode,
            last_id: maxId,
            items_html: itemsHtml
        }), {
            headers: { 'Content-Type': 'application/json;charset=UTF-8', 'Cache-Control': 'no-store' }
        });
    }

    if (isAjaxChat && request.method === 'POST') {
        let contentText = '';
        try {
            const body = await request.json();
            contentText = String(body?.content ?? '').trim();
        } catch (e) {
            try {
                const fd = await request.formData();
                contentText = String(fd.get('content') ?? '').trim();
            } catch (e2) {}
        }

        if (!contentText) {
            return new Response(JSON.stringify({ ok: false, error: 'Vui lòng nhập nội dung tin nhắn.' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json;charset=UTF-8' }
            });
        }

        if (contentText.length > 600) {
            contentText = contentText.slice(0, 600);
        }

        await ensureChatTable(env.DB);
        const nowSec = Math.floor(Date.now() / 1000);

        const inserted = await env.DB.prepare(
            "INSERT INTO community_chat (user_id, content, created_at) VALUES (?, ?, ?) RETURNING id, user_id, content, created_at"
        ).bind(Number(user.id), contentText, nowSec).first();

        const msgRecord = {
            id: inserted?.id || Date.now(),
            user_id: Number(user.id),
            content: contentText,
            created_at: nowSec,
            display_name: user.display_name,
            username: user.username,
            role: user.role,
            is_admin: user.is_admin,
            active_icon: user.active_icon,
            name_color: user.name_color,
            name_glow: user.name_glow,
            name_border: user.name_border,
            name_border_glow: user.name_border_glow,
            border_color: user.border_color,
            avatar_glow: user.avatar_glow,
            avatar: user.avatar,
            gender: user.gender,
            level: user.level,
            coins: user.coins,
            status_text: user.status_text
        };

        return new Response(JSON.stringify({
            ok: true,
            id: Number(msgRecord.id),
            item_html: buildChatItemHtml(msgRecord)
        }), {
            headers: { 'Content-Type': 'application/json;charset=UTF-8', 'Cache-Control': 'no-store' }
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

    const chatMessages = await fetchChatMessages(env.DB, 0, 20);
    const initialLastId = chatMessages.reduce((acc, m) => Math.max(acc, Number(m.id || 0)), 0);
    const initialChatHtml = chatMessages.length > 0
        ? chatMessages.map(buildChatItemHtml).join('')
        : `<div class="cchat-empty" id="cchatEmptyNote">Chưa có tin nhắn nào. Hãy là người mở màn chát cộng đồng!</div>`;

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
    <style>
        .cchat-box {
            background: linear-gradient(180deg, #0b1016 0%, #07090d 100%);
            border: 1px solid #2c3542;
            box-shadow: 0 4px 18px rgba(0, 0, 0, 0.75);
        }
        .cchat-header {
            background: linear-gradient(90deg, #112419 0%, #152238 55%, #1d142b 100%);
            border-bottom: 1px solid #2c3a4c;
            padding: 10px 12px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
        }
        .cchat-title-wrap {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: bold;
            font-size: 14px;
            color: #4ade80;
        }
        .cchat-live-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #22c55e;
            box-shadow: 0 0 8px #22c55e;
            display: inline-block;
            animation: cchatLivePulse 1.5s infinite ease-in-out;
        }
        @keyframes cchatLivePulse {
            0%, 100% { transform: scale(1); opacity: 0.75; }
            50% { transform: scale(1.3); opacity: 1; }
        }
        .cchat-subbar {
            background: #0d1117;
            border-bottom: 1px solid #1f2630;
            padding: 6px 10px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 8px;
            font-size: 12px;
        }
        .cchat-link-group {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }
        .cchat-sub-link {
            color: #fbbf24;
            font-weight: bold;
            text-decoration: none;
            cursor: pointer;
            background: none;
            border: none;
            padding: 0;
            font-family: inherit;
            font-size: 12px;
        }
        .cchat-sub-link:hover {
            color: #fff;
            text-decoration: underline;
        }
        .cchat-form-area {
            padding: 10px;
            background: #090c10;
            border-bottom: 1px solid #222934;
        }
        .cchat-label {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 12px;
            color: #9ca3af;
            margin-bottom: 5px;
        }
        .cchat-textarea {
            width: 100%;
            min-height: 62px;
            max-height: 150px;
            resize: vertical;
            background: #040608;
            color: #f3f4f6;
            border: 1px solid #303946;
            border-radius: 5px;
            padding: 8px 10px;
            box-sizing: border-box;
            font-family: Arial, sans-serif;
            font-size: 13px;
            line-height: 1.45;
        }
        .cchat-textarea:focus {
            outline: none;
            border-color: #38bdf8;
            box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.18);
        }
        .cchat-toolbar {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 6px;
            margin-top: 8px;
        }
        .cchat-send-btn {
            background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
            color: #fff;
            border: 1px solid #3b82f6;
            border-radius: 5px;
            padding: 7px 14px;
            font-size: 13px;
            font-weight: bold;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 5px;
        }
        .cchat-send-btn:hover {
            background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
        }
        .cchat-send-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
        .cchat-tool-btn {
            background: #141922;
            color: #e5e7eb;
            border: 1px solid #2d3644;
            border-radius: 5px;
            padding: 6px 10px;
            font-size: 12px;
            font-weight: bold;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 5px;
        }
        .cchat-tool-btn:hover, .cchat-tool-btn.active {
            border-color: #4ade80;
            color: #4ade80;
            background: #19222c;
        }
        .cchat-clear-btn {
            margin-left: auto;
            background: #181214;
            color: #fca5a5;
            border: 1px solid #3b2328;
            border-radius: 5px;
            padding: 6px 9px;
            font-size: 12px;
            cursor: pointer;
        }
        .cchat-clear-btn:hover {
            background: #2b171b;
            color: #fff;
        }
        .cchat-picker-panel {
            display: none;
            margin-top: 8px;
            padding: 8px;
            background: #0d1118;
            border: 1px solid #2a3342;
            border-radius: 5px;
        }
        .cchat-picker-panel.open {
            display: block;
            animation: cchatFadeIn 0.16s ease-out;
        }
        .cchat-picker-head {
            font-size: 11px;
            color: #9ca3af;
            margin-bottom: 6px;
            display: flex;
            justify-content: space-between;
        }
        .cchat-icon-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(42px, 1fr));
            gap: 5px;
        }
        .cchat-icon-choice {
            background: #141a24;
            border: 1px solid #283140;
            border-radius: 4px;
            padding: 5px 2px;
            font-size: 18px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .cchat-icon-choice:hover {
            border-color: #38bdf8;
            background: #1c2533;
            transform: translateY(-1px);
        }
        .cchat-color-grid {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }
        .cchat-color-chip {
            border: 1px solid rgba(255, 255, 255, 0.22);
            border-radius: 4px;
            padding: 4px 9px;
            font-size: 11px;
            font-weight: bold;
            cursor: pointer;
            color: #fff;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
        }
        .cchat-color-chip:hover {
            transform: scale(1.05);
            border-color: #fff;
        }
        .cchat-status-msg {
            font-size: 12px;
            margin-top: 6px;
            min-height: 16px;
        }
        .cchat-stream {
            max-height: 430px;
            overflow-y: auto;
            padding: 8px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .cchat-item {
            background: #0d1117;
            border: 1px solid #222934;
            border-left: 3px solid #22c55e;
            border-radius: 5px;
            padding: 8px 10px;
        }
        .cchat-item.is-new {
            animation: cchatSlideIn 0.25s ease-out;
            border-color: #38bdf8;
            border-left-color: #38bdf8;
        }
        @keyframes cchatSlideIn {
            0% { opacity: 0; transform: translateY(-6px); }
            100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes cchatFadeIn {
            0% { opacity: 0; transform: translateY(-3px); }
            100% { opacity: 1; transform: translateY(0); }
        }
        .cchat-row-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
        }
        .cchat-user-meta {
            display: flex;
            align-items: center;
            gap: 8px;
            min-width: 0;
        }
        .cchat-ava {
            width: 36px;
            height: 36px;
            flex-shrink: 0;
        }
        .cchat-info {
            min-width: 0;
        }
        .cchat-nick-line {
            font-size: 13px;
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 4px;
        }
        .cchat-time {
            font-size: 11px;
            color: #9ca3af;
        }
        .cchat-stats {
            font-size: 11px;
            color: #94a3b8;
        }
        .cchat-mini-btn {
            background: #161c26;
            color: #cbd5e1;
            border: 1px solid #2c3646;
            border-radius: 4px;
            padding: 2px 7px;
            font-size: 11px;
            font-weight: bold;
            cursor: pointer;
        }
        .cchat-mini-btn:hover {
            border-color: #38bdf8;
            color: #38bdf8;
        }
        .cchat-body {
            margin-top: 7px;
            padding-top: 6px;
            border-top: 1px dashed #1e2530;
            font-size: 13.5px;
            color: #f1f5f9;
            word-break: break-word;
        }
        .cchat-status {
            margin-top: 5px;
            font-size: 11.5px;
            color: #a3e635;
        }
        .cchat-empty {
            text-align: center;
            color: #888;
            padding: 16px 8px;
            font-size: 13px;
        }
        .wap-anim-ico {
            display: inline-block;
            font-size: 17px;
            line-height: 1;
            vertical-align: middle;
            margin: 0 1px;
        }
        .ico-bounce { animation: wapBounce 1.1s infinite ease-in-out; }
        .ico-shake { animation: wapShake 0.9s infinite ease-in-out; }
        .ico-pulse { animation: wapPulse 1.2s infinite ease-in-out; }
        .ico-beat { animation: wapBeat 0.85s infinite ease-in-out; }
        .ico-flicker { animation: wapFlicker 0.7s infinite alternate; }
        .ico-tilt { animation: wapTilt 1.4s infinite ease-in-out; }
        .ico-drop { animation: wapDrop 1.2s infinite ease-in-out; }
        .ico-spin { animation: wapSpin 2.2s infinite linear; }

        @keyframes wapBounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-4px); }
        }
        @keyframes wapShake {
            0%, 100% { transform: rotate(0deg); }
            25% { transform: rotate(-10deg); }
            75% { transform: rotate(10deg); }
        }
        @keyframes wapPulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.22); }
        }
        @keyframes wapBeat {
            0%, 100% { transform: scale(1); }
            30% { transform: scale(1.28); }
            60% { transform: scale(0.95); }
        }
        @keyframes wapFlicker {
            0% { opacity: 0.8; transform: scale(0.96); }
            100% { opacity: 1; transform: scale(1.15); }
        }
        @keyframes wapTilt {
            0%, 100% { transform: rotate(-6deg); }
            50% { transform: rotate(8deg); }
        }
        @keyframes wapDrop {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(3px); }
        }
        @keyframes wapSpin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>

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

    <!-- Chát cộng đồng -->
    <div class="box cchat-box" id="communityChatBox" data-last-id="${initialLastId}">
        <div class="cchat-header">
            <div class="cchat-title-wrap">
                <span class="cchat-live-dot"></span>
                <span>💬 Chát cộng đồng</span>
            </div>

        </div>

        <div class="cchat-subbar">
            <div class="cchat-link-group">
                <button type="button" class="cchat-sub-link" onclick="cchatReloadList()">↻ Làm mới</button>
            </div>

        </div>

        <div class="cchat-form-area">
            <form id="cchatForm" onsubmit="return cchatSubmitForm(event);">
                <div class="cchat-label">
                    <span>Nội dung tin nhắn:</span>
                    <span id="cchatCharCount">0 / 600</span>
                </div>
                <textarea id="cchatInput" class="cchat-textarea" placeholder="Nhập nội dung trò chuyện cùng mọi người..."></textarea>

                <div class="cchat-toolbar">
                    <button type="submit" id="cchatSendBtn" class="cchat-send-btn">
                        <span>➤</span>
                        <span>Gửi</span>
                    </button>
                    <button type="button" id="cchatIconBtn" class="cchat-tool-btn" onclick="cchatTogglePicker('icon')">
                        <span class="wap-anim-ico ico-bounce" style="font-size:15px;">😄</span>
                        <span>Icon cảm xúc</span>
                    </button>
                    <button type="button" id="cchatColorBtn" class="cchat-tool-btn" onclick="cchatTogglePicker('color')">
                        <span>🎨</span>
                        <span>BBCode Color</span>
                    </button>
                    
                </div>

                <div id="cchatIconPicker" class="cchat-picker-panel">
                    <div class="cchat-picker-head">
                        <span>✨ Icon động cảm xúc WAP</span>
                        <span>Bấm để chèn</span>
                    </div>
                    <div class="cchat-icon-grid" id="cchatIconGrid"></div>
                </div>

                <div id="cchatColorPicker" class="cchat-picker-panel">
                    <div class="cchat-picker-head">
                        <span>🎨 BBCode Color (chèn [color=#màu]chữ[/color])</span>
                        <span>Bấm để chèn</span>
                    </div>
                    <div class="cchat-color-grid" id="cchatColorGrid"></div>
                </div>

                <div id="cchatStatusMsg" class="cchat-status-msg"></div>
            </form>
        </div>

        <div class="cchat-stream" id="cchatStream">
            ${initialChatHtml}
        </div>
    </div>

    <script>
        (function() {
            const WAP_ICONS = [
                { code: '[smile]', emo: '😄', anim: 'ico-bounce', name: 'Vui vẻ' },
                { code: '[lol]', emo: '😂', anim: 'ico-shake', name: 'Cười lớn' },
                { code: '[love]', emo: '😍', anim: 'ico-pulse', name: 'Yêu thích' },
                { code: '[heart]', emo: '❤️', anim: 'ico-beat', name: 'Trái tim' },
                { code: '[fire]', emo: '🔥', anim: 'ico-flicker', name: 'Bùng nổ' },
                { code: '[cool]', emo: '😎', anim: 'ico-tilt', name: 'Ngầu' },
                { code: '[cry]', emo: '😭', anim: 'ico-drop', name: 'Khóc' },
                { code: '[angry]', emo: '😡', anim: 'ico-shake', name: 'Tức giận' },
                { code: '[party]', emo: '🎉', anim: 'ico-spin', name: 'Tiệc tùng' },
                { code: '[star]', emo: '🌟', anim: 'ico-pulse', name: 'Ngôi sao' },
                { code: '[wink]', emo: '😉', anim: 'ico-tilt', name: 'Nháy mắt' },
                { code: '[hug]', emo: '🥰', anim: 'ico-beat', name: 'Thương mến' }
            ];

            const BBCODE_COLORS = [
                { label: 'Đỏ rực', hex: '#ff3b30' },
                { label: 'Cam lửa', hex: '#ff9500' },
                { label: 'Vàng nắng', hex: '#facc15' },
                { label: 'Xanh lá', hex: '#4ade80' },
                { label: 'Xanh ngọc', hex: '#2dd4bf' },
                { label: 'Xanh dương', hex: '#38bdf8' },
                { label: 'Tím mộng', hex: '#c084fc' },
                { label: 'Hồng phấn', hex: '#f472b6' },
                { label: 'Trắng sáng', hex: '#ffffff' }
            ];

            const boxEl = document.getElementById('communityChatBox');
            const streamEl = document.getElementById('cchatStream');
            const inputEl = document.getElementById('cchatInput');
            const sendBtnEl = document.getElementById('cchatSendBtn');
            const statusEl = document.getElementById('cchatStatusMsg');
            const counterEl = document.getElementById('cchatCharCount');
            const iconPickerEl = document.getElementById('cchatIconPicker');
            const colorPickerEl = document.getElementById('cchatColorPicker');
            const iconBtnEl = document.getElementById('cchatIconBtn');
            const colorBtnEl = document.getElementById('cchatColorBtn');

            let isSending = false;
            let isPolling = false;

            function getLastId() {
                return Number(boxEl ? (boxEl.getAttribute('data-last-id') || 0) : 0);
            }

            function setLastId(val) {
                if (boxEl && Number(val) > getLastId()) {
                    boxEl.setAttribute('data-last-id', String(Number(val)));
                }
            }

            function setStatus(text, isErr) {
                if (!statusEl) return;
                statusEl.style.color = isErr ? '#f87171' : '#4ade80';
                statusEl.textContent = text || '';
            }

            function updateCounter() {
                if (!inputEl || !counterEl) return;
                counterEl.textContent = inputEl.value.length + ' / 600';
            }

            function insertAtCursor(snippet, selectOffsetStart, selectOffsetEnd) {
                if (!inputEl) return;
                const start = inputEl.selectionStart ?? inputEl.value.length;
                const end = inputEl.selectionEnd ?? inputEl.value.length;
                const before = inputEl.value.slice(0, start);
                const after = inputEl.value.slice(end);
                inputEl.value = before + snippet + after;
                inputEl.focus();
                if (typeof selectOffsetStart === 'number' && typeof selectOffsetEnd === 'number') {
                    inputEl.setSelectionRange(start + selectOffsetStart, start + selectOffsetEnd);
                } else {
                    const caret = start + snippet.length;
                    inputEl.setSelectionRange(caret, caret);
                }
                updateCounter();
            }

            function renderPickers() {
                const iconGrid = document.getElementById('cchatIconGrid');
                const colorGrid = document.getElementById('cchatColorGrid');

                if (iconGrid) {
                    iconGrid.innerHTML = '';
                    WAP_ICONS.forEach(function(item) {
                        const btn = document.createElement('button');
                        btn.type = 'button';
                        btn.className = 'cchat-icon-choice';
                        btn.title = item.name + ' ' + item.code;
                        btn.innerHTML = '<span class="wap-anim-ico ' + item.anim + '">' + item.emo + '</span>';
                        btn.addEventListener('click', function() {
                            insertAtCursor(item.code + ' ');
                        });
                        iconGrid.appendChild(btn);
                    });
                }

                if (colorGrid) {
                    colorGrid.innerHTML = '';
                    BBCODE_COLORS.forEach(function(c) {
                        const btn = document.createElement('button');
                        btn.type = 'button';
                        btn.className = 'cchat-color-chip';
                        btn.style.background = c.hex;
                        btn.textContent = c.label;
                        btn.addEventListener('click', function() {
                            const sample = 'nội dung';
                            const tag = '[color=' + c.hex + ']' + sample + '[/color]';
                            const openLen = ('[color=' + c.hex + ']').length;
                            insertAtCursor(tag, openLen, openLen + sample.length);
                        });
                        colorGrid.appendChild(btn);
                    });
                }
            }

            window.cchatTogglePicker = function(which) {
                const showIcon = which === 'icon' && !(iconPickerEl && iconPickerEl.classList.contains('open'));
                const showColor = which === 'color' && !(colorPickerEl && colorPickerEl.classList.contains('open'));

                if (iconPickerEl) iconPickerEl.classList.toggle('open', showIcon);
                if (colorPickerEl) colorPickerEl.classList.toggle('open', showColor);
                if (iconBtnEl) iconBtnEl.classList.toggle('active', showIcon);
                if (colorBtnEl) colorBtnEl.classList.toggle('active', showColor);
            };

            window.cchatClearInput = function() {
                if (!inputEl) return;
                inputEl.value = '';
                updateCounter();
                setStatus('', false);
                inputEl.focus();
            };

            window.cchatMentionUser = function(btnEl) {
                const row = btnEl ? btnEl.closest('.cchat-item') : null;
                const uname = row ? (row.getAttribute('data-username') || '') : '';
                if (!uname) return;
                insertAtCursor('@' + uname + ' ');
            };

            function appendItemsHtml(itemsHtml, highlightNew) {
                if (!itemsHtml || !streamEl) return;
                const emptyNote = document.getElementById('cchatEmptyNote');
                if (emptyNote) emptyNote.remove();

                const temp = document.createElement('div');
                temp.innerHTML = itemsHtml;
                const nodes = Array.from(temp.children);

                nodes.forEach(function(node) {
                    const idAttr = Number(node.getAttribute('data-msg-id') || 0);
                    if (idAttr > 0 && streamEl.querySelector('[data-msg-id="' + idAttr + '"]')) {
                        return;
                    }
                    if (highlightNew) node.classList.add('is-new');
                    streamEl.prepend(node);
                    if (idAttr > 0) setLastId(idAttr);
                });
            }

            window.cchatSubmitForm = async function(ev) {
                if (ev) ev.preventDefault();
                if (isSending || !inputEl) return false;

                const text = inputEl.value.trim();
                if (!text) {
                    setStatus('Hãy nhập nội dung trước khi gửi.', true);
                    inputEl.focus();
                    return false;
                }

                isSending = true;
                if (sendBtnEl) sendBtnEl.disabled = true;
                setStatus('Đang gửi...', false);

                try {
                    const res = await fetch('/?ajax_chat=1', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Community-Chat': '1'
                        },
                        body: JSON.stringify({ content: text })
                    });
                    const data = await res.json();
                    if (!res.ok || !data.ok) {
                        setStatus(data.error || 'Không thể gửi tin nhắn.', true);
                    } else {
                        appendItemsHtml(data.item_html, true);
                        if (data.id) setLastId(data.id);
                        inputEl.value = '';
                        updateCounter();
                        setStatus('Đã gửi tin nhắn!', false);
                        setTimeout(function() { setStatus('', false); }, 1800);
                    }
                } catch (err) {
                    setStatus('Lỗi kết nối khi gửi tin nhắn.', true);
                } finally {
                    isSending = false;
                    if (sendBtnEl) sendBtnEl.disabled = false;
                }
                return false;
            };

            window.cchatReloadList = async function() {
                if (isPolling || !streamEl) return;
                isPolling = true;
                setStatus('Đang cập nhật...', false);
                try {
                    const res = await fetch('/?ajax_chat=1&mode=reload&_t=' + Date.now(), {
                        headers: { 'X-Community-Chat': '1' }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        if (data.ok) {
                            streamEl.innerHTML = data.items_html || '<div class="cchat-empty" id="cchatEmptyNote">Chưa có tin nhắn nào.</div>';
                            if (data.last_id) setLastId(data.last_id);
                            setStatus('', false);
                        }
                    }
                } catch (e) {
                } finally {
                    isPolling = false;
                }
            };

            async function pollNewMessages() {
                if (isPolling || isSending) return;
                isPolling = true;
                try {
                    const lastId = getLastId();
                    const res = await fetch('/?ajax_chat=1&mode=poll&after_id=' + lastId + '&_t=' + Date.now(), {
                        headers: { 'X-Community-Chat': '1' }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        if (data.ok && data.items_html) {
                            appendItemsHtml(data.items_html, true);
                        }
                        if (data.last_id) setLastId(data.last_id);
                    }
                } catch (e) {
                } finally {
                    isPolling = false;
                }
            }

            if (inputEl) {
                inputEl.addEventListener('input', updateCounter);
                inputEl.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        cchatSubmitForm(e);
                    }
                });
            }

            renderPickers();
            setInterval(pollNewMessages, 4000);
        })();
    </script>
    `;

    return new Response(renderLayout('Trang chủ', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
