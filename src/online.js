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

function formatMoodLabel(row) {
    const mood = String(row.mood || row.status_text || row.bio_status || '').trim();
    return mood;
}

export async function handleOnline(request, env, user, renderLayout, url) {
    const tabParam = String(url.searchParams.get('tab') || 'all').trim().toLowerCase();
    const moodFilter = String(url.searchParams.get('mood') || '').trim();
    const pageParam = parseInt(url.searchParams.get('page') || '1', 10);
    const currentPage = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
    const perPage = 10;

    let allUsers = [];
    try {
        const res = await env.DB.prepare(`
            SELECT id, username, display_name, avatar, border_color, avatar_glow,
                   name_color, name_glow, name_border, name_border_glow,
                   active_icon, role, is_admin, gender, last_seen, current_location, mood
            FROM users
            ORDER BY id DESC
            LIMIT 200
        `).all();
        allUsers = (res && Array.isArray(res.results)) ? res.results : [];
    } catch (e) {
        try {
            const res2 = await env.DB.prepare(`
                SELECT id, username, display_name, avatar, border_color, avatar_glow,
                       name_color, name_glow, name_border, name_border_glow,
                       active_icon, role, is_admin
                FROM users
                ORDER BY id DESC
                LIMIT 200
            `).all();
            allUsers = (res2 && Array.isArray(res2.results)) ? res2.results : [];
        } catch (e2) {
            allUsers = [];
        }
    }

    // Lọc danh sách người trực tuyến (nếu có last_seen thì ưu tiên người hoạt động gần đây, nếu cột chưa có thì lấy danh sách thành viên)
    const nowSec = Math.floor(Date.now() / 1000);
    const hasLastSeen = allUsers.some(u => u.last_seen !== undefined && u.last_seen !== null && String(u.last_seen).trim() !== '');

    let onlineList = allUsers;
    if (hasLastSeen) {
        const activeRecent = allUsers.filter(u => {
            const raw = u.last_seen;
            if (!raw) return false;
            const num = Number(raw);
            if (!Number.isNaN(num) && num > 1000000000) {
                const sec = num > 100000000000 ? Math.floor(num / 1000) : num;
                return (nowSec - sec) <= 900;
            }
            const parsedMs = Date.parse(String(raw));
            if (!Number.isNaN(parsedMs)) {
                return (Date.now() - parsedMs) <= 900 * 1000;
            }
            return false;
        });
        if (activeRecent.length > 0) {
            onlineList = activeRecent;
        }
    }

    // Nếu người dùng hiện tại đang đăng nhập thì đảm bảo có mặt đầu danh sách
    if (user && user.id && !onlineList.some(u => Number(u.id) === Number(user.id))) {
        onlineList = [user, ...onlineList];
    }

    const totalOnlineCount = onlineList.length;

    // Thu thập danh sách tâm trạng nếu có
    const moodOptions = Array.from(new Set(
        onlineList
            .map(u => formatMoodLabel(u))
            .filter(Boolean)
    ));

    // Áp dụng bộ lọc tab / tâm trạng
    let filteredList = onlineList.slice();
    if (tabParam === 'male') {
        filteredList = filteredList.filter(u => isMaleGender(u.gender));
    } else if (tabParam === 'female') {
        filteredList = filteredList.filter(u => isFemaleGender(u.gender));
    } else if (tabParam === 'friends') {
        filteredList = filteredList.filter(u => Number(u.id) !== Number(user && user.id ? user.id : 0));
    } else if (tabParam === 'mood') {
        if (moodFilter) {
            filteredList = filteredList.filter(u => formatMoodLabel(u) === moodFilter);
        } else {
            filteredList = filteredList.filter(u => Boolean(formatMoodLabel(u)));
        }
    }

    const totalFiltered = filteredList.length;
    const totalPages = Math.max(1, Math.ceil(totalFiltered / perPage));
    const safePage = Math.min(currentPage, totalPages);
    const startIdx = (safePage - 1) * perPage;
    const pageItems = filteredList.slice(startIdx, startIdx + perPage);

    const buildTabUrl = (tabName, moodVal = '') => {
        const params = new URLSearchParams();
        if (tabName && tabName !== 'all') params.set('tab', tabName);
        if (moodVal) params.set('mood', moodVal);
        const qs = params.toString();
        return '/online' + (qs ? '?' + qs : '');
    };

    const buildPageUrl = (pageNum) => {
        const params = new URLSearchParams();
        if (tabParam && tabParam !== 'all') params.set('tab', tabParam);
        if (moodFilter) params.set('mood', moodFilter);
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
        rowsHtml = `<div class="online-empty">Không có người dùng nào phù hợp với bộ lọc hiện tại.</div>`;
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
            const moodText = formatMoodLabel(uItem);

            const moodLineHtml = moodText
                ? `<div class="online-meta-line online-mood-line">💬 ${escapeHtml(moodText)}</div>`
                : '';

            const isSelf = Number(user && user.id ? user.id : 0) === uid;
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
                            ${moodLineHtml}
                            <div class="online-meta-line">▸ Giới tính: <span class="online-val-white">${escapeHtml(genderText)}</span></div>
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
            padding: 6px 12px;
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
        .online-mood-select {
            background: #10141a;
            color: #e2e8f0;
            border: 1px solid #2c3440;
            border-radius: 4px;
            padding: 4px 8px;
            font-size: 12px;
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
        .online-mood-line {
            color: #cbd5e1;
            margin-bottom: 1px;
        }
        .online-val-white {
            color: #e2e8f0;
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
                <a href="${escapeHtml(buildTabUrl('mood', moodFilter))}" class="online-tab-link ${tabParam === 'mood' ? 'active' : ''}">Tâm trạng ▾</a>
            </div>

            ${tabParam === 'mood' && moodOptions.length > 0 ? `
                <select class="online-mood-select" onchange="if(this.value){window.location.href='/online?tab=mood&mood='+encodeURIComponent(this.value);}else{window.location.href='/online?tab=mood';}">
                    <option value="">-- Tất cả tâm trạng --</option>
                    ${moodOptions.map(m => `<option value="${escapeHtml(m)}" ${moodFilter === m ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}
                </select>
            ` : ''}
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
