import { renderUser } from '../worker.js';

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getFallbackAvatar(seed = '#00ff00') {
    const safeFill = encodeURIComponent(String(seed || '#00ff00'));
    return `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100' height='100' fill='%23181818'/><circle cx='50' cy='38' r='18' fill='${safeFill}'/><path d='M20 84c4-16 18-24 30-24s26 8 30 24' fill='${safeFill}'/></svg>`;
}

function formatGenderLabel(genderRaw) {
    const g = String(genderRaw || '').trim().toLowerCase();
    if (g === 'female' || g === 'nu' || g === 'nữ' || g === '2' || g === 'girl') return 'Nữ';
    if (g === 'male' || g === 'nam' || g === '1' || g === 'boy') return 'Nam';
    return 'Nam';
}

function isFemaleGender(genderRaw) {
    return formatGenderLabel(genderRaw) === 'Nữ';
}

function isMaleGender(genderRaw) {
    return formatGenderLabel(genderRaw) === 'Nam';
}

function formatLocationLabel(row) {
    const loc = String(row.current_location || row.last_page || row.location || '').trim();
    if (loc) return loc;
    return 'Trang chủ';
}

// Cấp bậc càng cao số càng lớn: Admin (3) > SMOD (2) > MOD (1) > Thành viên (0)
function getRoleRankTier(u) {
    if (!u) return 0;
    const roleRaw = String(u.role || '').trim().toLowerCase();

    if (
        roleRaw === 'admin' ||
        roleRaw === 'chủ wap' ||
        roleRaw === 'quản trị' ||
        roleRaw === 'quản lý' ||
        roleRaw === 'bqt' ||
        Number(u.is_admin || 0) === 1 ||
        Number(u.id || 0) === 1
    ) {
        return 3;
    }

    if (roleRaw === 'smod') {
        return 2;
    }

    if (roleRaw === 'mod' || roleRaw === 'điều hành viên') {
        return 1;
    }

    return 0;
}

function getUserLevelValue(u) {
    if (!u) return 0;
    const lvl = Number(u.level ?? u.user_level ?? 0);
    if (!Number.isNaN(lvl) && lvl > 0) return lvl;
    return 0;
}

function compareUsersByRankAndLevel(a, b) {
    const rankA = getRoleRankTier(a);
    const rankB = getRoleRankTier(b);
    if (rankB !== rankA) {
        return rankB - rankA;
    }

    const lvlA = getUserLevelValue(a);
    const lvlB = getUserLevelValue(b);
    if (lvlB !== lvlA) {
        return lvlB - lvlA;
    }

    return Number(b.id || 0) - Number(a.id || 0);
}

function parseTimestampToSeconds(raw) {
    if (raw === null || raw === undefined || raw === '') return 0;
    const num = Number(raw);
    if (!Number.isNaN(num) && num > 0) {
        return num > 100000000000 ? Math.floor(num / 1000) : Math.floor(num);
    }
    const parsedMs = Date.parse(String(raw));
    if (!Number.isNaN(parsedMs)) {
        return Math.floor(parsedMs / 1000);
    }
    return 0;
}

function isUserCurrentlyOnline(u, nowSec, activeSessionUserIds, currentUserId) {
    const uid = Number(u.id || 0);
    if (!uid) return false;

    if (currentUserId && uid === Number(currentUserId)) {
        return true;
    }

    if (activeSessionUserIds && activeSessionUserIds.has(uid)) {
        return true;
    }

    if (u.is_online !== undefined && u.is_online !== null && String(u.is_online).trim() !== '') {
        const flag = Number(u.is_online);
        if (flag === 0 || String(u.is_online).toLowerCase() === 'false' || String(u.is_online).toLowerCase() === 'off') {
            return false;
        }
    }

    const lastSeenSec = Math.max(
        parseTimestampToSeconds(u.last_seen),
        parseTimestampToSeconds(u.last_active),
        parseTimestampToSeconds(u.updated_at)
    );

    if (lastSeenSec > 0) {
        return (nowSec - lastSeenSec) <= 300; // Hoạt động trong 5 phút gần nhất mới tính là đang ON
    }

    return false;
}

async function getFriendUserIds(env, currentUserId) {
    const friendIds = new Set();
    if (!currentUserId) return friendIds;

    const queries = [
        {
            sql: `SELECT friend_id AS fid FROM friends WHERE user_id = ? UNION SELECT user_id AS fid FROM friends WHERE friend_id = ?`,
            binds: [currentUserId, currentUserId]
        },
        {
            sql: `SELECT user_id_2 AS fid FROM friendships WHERE user_id_1 = ? AND status = 'accepted' UNION SELECT user_id_1 AS fid FROM friendships WHERE user_id_2 = ? AND status = 'accepted'`,
            binds: [currentUserId, currentUserId]
        },
        {
            sql: `SELECT target_id AS fid FROM user_friends WHERE user_id = ?`,
            binds: [currentUserId]
        }
    ];

    for (const q of queries) {
        try {
            const res = await env.DB.prepare(q.sql).bind(...q.binds).all();
            if (res && Array.isArray(res.results)) {
                for (const row of res.results) {
                    const fid = Number(row.fid || 0);
                    if (fid > 0 && fid !== Number(currentUserId)) {
                        friendIds.add(fid);
                    }
                }
                if (friendIds.size > 0) break;
            }
        } catch (e) {}
    }

    return friendIds;
}

async function getActiveSessionUserIds(env, nowSec) {
    const ids = new Set();
    try {
        const res = await env.DB.prepare(`SELECT user_id, expires_at, created_at FROM sessions`).all();
        if (res && Array.isArray(res.results)) {
            for (const s of res.results) {
                const uid = Number(s.user_id || 0);
                if (!uid) continue;
                const expSec = parseTimestampToSeconds(s.expires_at);
                if (expSec > 0 && expSec < nowSec) continue;
                ids.add(uid);
            }
        }
    } catch (e) {}
    return ids;
}

export async function getOnlineUsers(env, currentUser) {
    const nowSec = Math.floor(Date.now() / 1000);
    const currentUserId = Number(currentUser && currentUser.id ? currentUser.id : 0);

    // Cập nhật last_seen cho người đang truy cập nếu cột tồn tại
    if (currentUserId > 0) {
        try {
            await env.DB.prepare(`UPDATE users SET last_seen = ? WHERE id = ?`).bind(nowSec, currentUserId).run();
        } catch (e) {}
    }

    let rawUsers = [];
    try {
        const res = await env.DB.prepare(`
            SELECT id, username, display_name, avatar, border_color, avatar_glow,
                   name_color, name_glow, name_border, name_border_glow,
                   active_icon, role, is_admin, gender, level, last_seen, current_location
            FROM users
            LIMIT 500
        `).all();
        rawUsers = (res && Array.isArray(res.results)) ? res.results : [];
    } catch (e) {
        try {
            const res2 = await env.DB.prepare(`
                SELECT id, username, display_name, avatar, border_color, avatar_glow,
                       name_color, name_glow, name_border, name_border_glow,
                       active_icon, role, is_admin, gender, level
                FROM users
                LIMIT 500
            `).all();
            rawUsers = (res2 && Array.isArray(res2.results)) ? res2.results : [];
        } catch (e2) {
            rawUsers = [];
        }
    }

    const activeSessionUserIds = await getActiveSessionUserIds(env, nowSec);

    const onlineUsers = rawUsers.filter(u =>
        isUserCurrentlyOnline(u, nowSec, activeSessionUserIds, currentUserId)
    );

    if (currentUser && currentUser.id && !onlineUsers.some(u => Number(u.id) === currentUserId)) {
        onlineUsers.push(currentUser);
    }

    onlineUsers.sort(compareUsersByRankAndLevel);
    return onlineUsers;
}

export async function handleOnline(request, env, user, renderLayout, url) {
    const tabParam = String(url.searchParams.get('tab') || 'all').trim().toLowerCase();
    const pageParam = parseInt(url.searchParams.get('page') || '1', 10);
    const currentPage = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
    const perPage = 10;

    const currentUserId = Number(user && user.id ? user.id : 0);
    const onlineList = await getOnlineUsers(env, user);
    const totalOnlineCount = onlineList.length;

    let filteredList = onlineList.slice();
    if (tabParam === 'male') {
        filteredList = filteredList.filter(u => isMaleGender(u.gender));
    } else if (tabParam === 'female') {
        filteredList = filteredList.filter(u => isFemaleGender(u.gender));
    } else if (tabParam === 'friends') {
        const friendIds = await getFriendUserIds(env, currentUserId);
        filteredList = filteredList.filter(u => friendIds.has(Number(u.id || 0)));
    }

    filteredList.sort(compareUsersByRankAndLevel);

    const totalFiltered = filteredList.length;
    const totalPages = Math.max(1, Math.ceil(totalFiltered / perPage));
    const safePage = Math.min(currentPage, totalPages);
    const startIdx = (safePage - 1) * perPage;
    const pageItems = filteredList.slice(startIdx, startIdx + perPage);

    const buildTabUrl = (tabName) => {
        const params = new URLSearchParams();
        if (tabName && tabName !== 'all') params.set('tab', tabName);
        const qs = params.toString();
        return '/online' + (qs ? '?' + qs : '');
    };

    const buildPageUrl = (pageNum) => {
        const params = new URLSearchParams();
        if (tabParam && tabParam !== 'all') params.set('tab', tabParam);
        if (pageNum > 1) params.set('page', String(pageNum));
        const qs = params.toString();
        return '/online' + (qs ? '?' + qs : '');
    };

    let paginationHtml = '';
    if (totalFiltered > 0) {
        const prevPage = Math.max(1, safePage - 1);
        const nextPage = Math.min(totalPages, safePage + 1);
        let pageButtons = '';
        for (let p = 1; p <= totalPages; p++) {
            const isActive = p === safePage;
            pageButtons += `
                <a href="${escapeHtml(buildPageUrl(p))}" class="online-page-btn ${isActive ? 'active' : ''}">${p}</a>
            `;
        }
        paginationHtml = `
            <div class="online-pagination">
                <a href="${escapeHtml(buildPageUrl(prevPage))}" class="online-page-btn">&lt;</a>
                ${pageButtons}
                <a href="${escapeHtml(buildPageUrl(nextPage))}" class="online-page-btn">&gt;</a>
            </div>
        `;
    }

    let rowsHtml = '';
    if (pageItems.length === 0) {
        const emptyMsg = tabParam === 'friends'
            ? 'Hiện chưa có bạn bè nào đang trực tuyến.'
            : 'Không có người dùng nào đang trực tuyến trong mục này.';
        rowsHtml = `<div class="online-empty">${escapeHtml(emptyMsg)}</div>`;
    } else {
        rowsHtml = pageItems.map((uItem, idx) => {
            const uid = Number(uItem.id || 0);
            const rendered = renderUser(uItem);
            const rawAv = uItem.avatar ? String(uItem.avatar).trim() : '';
            const avSrc = (rawAv && !rawAv.includes('7gXvS6v'))
                ? rawAv
                : getFallbackAvatar(uItem.name_color || '#00ff00');

            const avStyle = rendered.avatarStyle
                ? `${rendered.avatarStyle}; width: 42px; height: 42px; display: block;`
                : 'width: 42px; height: 42px; border-radius: 50%; object-fit: cover; border: 2px solid #00ff00; display: block;';

            const genderText = formatGenderLabel(uItem.gender);
            const locationText = formatLocationLabel(uItem);
            const levelText = getUserLevelValue(uItem);
            const isSelf = currentUserId === uid;
            const mailHref = isSelf ? '/mail/box' : `/mail/chat?user=${uid}`;

            return `
                <div class="online-user-row ${idx % 2 === 0 ? 'even' : 'odd'}">
                    <div class="online-user-left">
                        <a href="/profile?user=${uid}" class="online-avatar-link">
                            <img src="${escapeHtml(avSrc)}" alt="${escapeHtml(uItem.display_name || uItem.username || '')}" style="${escapeHtml(avStyle)}">
                        </a>
                        <div class="online-user-info">
                            <div class="online-name-row">
                                ${rendered.nameHtml}
                                <span class="online-on-badge">ON</span>
                            </div>
                            <div class="online-meta-line">▸ Giới tính: <span class="online-val-white">${escapeHtml(genderText)}</span> · Level: <span class="online-val-green">${levelText}</span></div>
                            <div class="online-meta-line">▸ Vị trí: <span class="online-val-gold">${escapeHtml(locationText)}</span></div>
                        </div>
                    </div>
                    <a href="${escapeHtml(mailHref)}" class="online-mail-btn" title="Nhắn tin">✉️</a>
                </div>
            `;
        }).join('');
    }

    const content = `
    <style>
        .online-wrap {
            background: #07090c;
            border: 1px solid #262c36;
            border-radius: 4px;
            overflow: hidden;
        }
        .online-top-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 9px 12px;
            background: #0e1218;
            border-bottom: 1px solid #222832;
            font-size: 13px;
            font-weight: bold;
        }
        .online-top-title {
            color: #4ade80;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }
        .online-refresh-btn {
            color: #f59e0b;
            text-decoration: none;
            font-size: 12px;
            font-weight: bold;
        }
        .online-refresh-btn:hover {
            color: #fbbf24;
            text-decoration: underline;
        }
        .online-filter-box {
            padding: 10px 12px 6px 12px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
        }
        .online-tabs {
            display: inline-flex;
            flex-wrap: wrap;
            justify-content: center;
            background: #10141a;
            border: 1px solid #252b35;
            border-radius: 4px;
            overflow: hidden;
        }
        .online-tab-link {
            padding: 6px 14px;
            font-size: 12px;
            font-weight: bold;
            color: #cbd5e1;
            text-decoration: none;
            border-right: 1px solid #252b35;
        }
        .online-tab-link:last-child {
            border-right: none;
        }
        .online-tab-link:hover {
            background: #19202a;
            color: #fff;
            text-decoration: none;
        }
        .online-tab-link.active {
            background: #1f2937;
            color: #fff;
        }
        .online-pagination {
            display: flex;
            align-items: center;
            justify-content: center;
            flex-wrap: wrap;
            gap: 4px;
            padding: 8px 10px 12px 10px;
        }
        .online-page-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 24px;
            height: 24px;
            padding: 0 6px;
            background: #11161d;
            border: 1px solid #2a323e;
            border-radius: 3px;
            color: #cbd5e1;
            font-size: 12px;
            font-weight: bold;
            text-decoration: none;
            box-sizing: border-box;
        }
        .online-page-btn:hover {
            border-color: #4ade80;
            color: #fff;
            text-decoration: none;
        }
        .online-page-btn.active {
            background: #2563eb;
            border-color: #3b82f6;
            color: #fff;
        }
        .online-list {
            border-top: 1px solid #1e242d;
        }
        .online-user-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            padding: 10px 12px;
            border-bottom: 1px solid #1b2028;
        }
        .online-user-row.even {
            background: #080a0e;
        }
        .online-user-row.odd {
            background: #050709;
        }
        .online-user-left {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            min-width: 0;
            flex: 1;
        }
        .online-user-info {
            min-width: 0;
            flex: 1;
        }
        .online-name-row {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
            font-size: 13px;
            margin-bottom: 2px;
        }
        .online-on-badge {
            background: #16a34a;
            color: #fff;
            font-size: 9px;
            font-weight: bold;
            padding: 1px 4px;
            border-radius: 3px;
            line-height: 1.2;
            letter-spacing: 0.3px;
        }
        .online-meta-line {
            font-size: 12px;
            color: #94a3b8;
            line-height: 1.45;
        }
        .online-val-white {
            color: #e2e8f0;
            font-weight: bold;
        }
        .online-val-green {
            color: #4ade80;
            font-weight: bold;
        }
        .online-val-gold {
            color: #eab308;
            font-weight: bold;
        }
        .online-mail-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 34px;
            height: 28px;
            background: #11151c;
            border: 1px solid #2b3340;
            border-radius: 4px;
            color: #cbd5e1;
            font-size: 14px;
            text-decoration: none;
            flex-shrink: 0;
        }
        .online-mail-btn:hover {
            background: #1a212c;
            border-color: #4ade80;
            color: #fff;
            text-decoration: none;
        }
        .online-empty {
            padding: 24px 12px;
            text-align: center;
            color: #64748b;
            font-size: 13px;
        }
    </style>

    <div class="online-wrap">
        <div class="online-top-bar">
            <div class="online-top-title">
                <span>👥</span>
                <span>${totalOnlineCount} | Người dùng trực tuyến</span>
            </div>
            <a href="${escapeHtml(buildPageUrl(safePage))}" class="online-refresh-btn">↻ Làm mới</a>
        </div>

        <div class="online-filter-box">
            <div class="online-tabs">
                <a href="${escapeHtml(buildTabUrl('all'))}" class="online-tab-link ${tabParam === 'all' ? 'active' : ''}">Tất cả</a>
                <a href="${escapeHtml(buildTabUrl('male'))}" class="online-tab-link ${tabParam === 'male' ? 'active' : ''}">Nam</a>
                <a href="${escapeHtml(buildTabUrl('female'))}" class="online-tab-link ${tabParam === 'female' ? 'active' : ''}">Nữ</a>
                <a href="${escapeHtml(buildTabUrl('friends'))}" class="online-tab-link ${tabParam === 'friends' ? 'active' : ''}">Bạn bè</a>
            </div>
        </div>

        ${paginationHtml}

        <div class="online-list">
            ${rowsHtml}
        </div>

        ${paginationHtml}
    </div>
    `;

    return new Response(renderLayout('Người dùng trực tuyến', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
