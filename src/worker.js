import { handleOnline } from './routes/online.js';
import { handleMediaRequest } from './media_store.js';
import { handleLogin, handleRegister } from './routes/auth.js';
import { handleLogout } from './routes/logout.js';
import { handleIndex } from './routes/index.js';
import { handleProfile } from './routes/profile.js';
import { handleLevel } from './routes/level.js';
import { handleShop } from './routes/shop.js';
import { handleShopIcon } from './routes/shop_icon.js';
import { handleShopFrames, renderAvatarFrameHtml } from './routes/shop_frames.js';
import { handleShopColor } from './routes/shop_color.js';
import { handleInventory } from './routes/inventory.js';
import { handleMailBox } from './routes/mail_box.js';
import { handleMailChat } from './routes/mail_chat.js';
import { handleMailNotification } from './routes/mail_notification.js';
import { handleRealtimeApi } from './routes/api_realtime.js';
import { handleFeed } from './routes/feed.js';
import { handleGame } from './routes/game.js';
import { handleAdminDashboard } from './routes/admin_dashboard.js';
import { handleAdminAction } from './routes/admin_action.js';
import { createSession, destroySession, getSessionUser, readSessionToken, buildSessionCookie, buildLegacyClearCookie, buildClearCookies } from './session.js';
import { isStaffRole, normalizeRoleKey, syncUserOnlineAndLevel } from './roles_system.js';

function escapeHtmlText(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function isStaffOrAdminUser(u) {
    return isStaffRole(u);
}

function resolveBadgeRoleKey(safeUser) {
    if (!safeUser) return '';
    const rawRole = String(safeUser.role || '').trim().toLowerCase();
    const uid = Number(safeUser.user_id || safeUser.id || 0);

    if (
        rawRole === 'người sáng lập' ||
        rawRole === 'nguoi sang lap' ||
        rawRole === 'founder' ||
        uid === 1
    ) {
        return 'founder';
    }

    if (
        rawRole === 'super admin' ||
        rawRole === 'super_admin' ||
        rawRole === 's.admin' ||
        rawRole === 'sadmin' ||
        rawRole === 'smod'
    ) {
        return 'super_admin';
    }

    if (
        rawRole === 'admin' ||
        rawRole === 'chủ wap' ||
        rawRole === 'quản trị' ||
        rawRole === 'quản lý' ||
        rawRole === 'bqt'
    ) {
        return 'admin';
    }

    if (
        rawRole === 'mod' ||
        rawRole === 'điều hành viên'
    ) {
        return 'mod';
    }

    const norm = String(normalizeRoleKey(safeUser.role, safeUser.is_admin, uid) || '').toLowerCase();
    if (norm === 'founder' || norm === 'super_admin' || norm === 'admin' || norm === 'mod') {
        return norm;
    }

    if (Number(safeUser.is_admin || 0) === 1) {
        return 'admin';
    }

    return '';
}

function getStaffAfterNickBadge(safeUser) {
    if (!safeUser) return '';
    const roleKey = resolveBadgeRoleKey(safeUser);

    if (roleKey === 'founder') {
        return `<span class="staff-nick-badge staff-badge-admin" title="Người Sáng Lập"><span class="badge-ico">👑</span>FOUNDER</span>`;
    }
    if (roleKey === 'super_admin') {
        return `<span class="staff-nick-badge staff-badge-admin" title="Super Admin"><span class="badge-ico">⚡</span>S.ADMIN</span>`;
    }
    if (roleKey === 'admin') {
        return `<span class="staff-nick-badge staff-badge-admin" title="Admin"><span class="badge-ico">👑</span>ADMIN</span>`;
    }
    if (roleKey === 'mod') {
        return `<span class="staff-nick-badge staff-badge-mod" title="Mod"><span class="badge-ico">🛡️</span>MOD</span>`;
    }

    return '';
}

function extractFrameSizePx(safeUser, styleStr) {
    const explicit = Number(safeUser.avatar_size || safeUser.avt_size || 0);
    if (explicit >= 20 && explicit <= 220) return explicit;
    const m = String(styleStr || '').match(/(?:^|;)\s*width\s*:\s*(\d+)px/i);
    if (m && Number(m[1]) >= 20 && Number(m[1]) <= 220) return Number(m[1]);
    return 44;
}

export function renderUser(u) {
    const safeUser = new Proxy(u || {}, {
        get(target, prop) {
            if (prop === 'id' || prop === 'user_id') return target[prop] || 0;
            return target[prop] !== undefined && target[prop] !== null ? target[prop] : '';
        }
    });

    const defaultAvatarMale = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><rect width='120' height='120' fill='%230f172a'/><circle cx='60' cy='45' r='22' fill='%2338bdf8'/><path d='M20 105 C20 80, 100 80, 100 105' fill='%2338bdf8'/></svg>";
    const defaultAvatarFemale = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><rect width='120' height='120' fill='%231f1025'/><circle cx='60' cy='45' r='22' fill='%23f472b6'/><path d='M20 105 C20 80, 100 80, 100 105' fill='%23f472b6'/></svg>";

    const userGender = String(safeUser.gender || 'male');
    const systemDefaultAvatar = userGender === 'female' ? defaultAvatarFemale : defaultAvatarMale;

    const avatarVal = String(safeUser.avatar || '');
    const avatarUrl = (avatarVal && !avatarVal.includes('7gXvS6v')) ? avatarVal : systemDefaultAvatar;

    const activeFrame = String(safeUser.active_frame || '').trim();
    const borderColor = String(safeUser.border_color || '#ffcc00');

    let avatarStyle = `border-radius: 50%; object-fit: cover; border: 2px solid ${borderColor};`;
    if (safeUser.avatar_glow && safeUser.avatar_glow !== '#000000') {
        avatarStyle += ` box-shadow: 0 0 10px ${safeUser.avatar_glow};`;
    }
    if (activeFrame) {
        avatarStyle = `border-radius: 50%; object-fit: cover; border: none; box-shadow: none;`;
    }

    const nameColor = String(safeUser.name_color || '#00ff00');
    let nameStyle = `color: ${nameColor}; font-weight: bold;`;
    let shadows = [];
    if (safeUser.name_glow && safeUser.name_glow !== '#000000') shadows.push(`0 0 6px ${safeUser.name_glow}`);
    if (safeUser.name_border_glow && safeUser.name_border_glow !== '#000000') shadows.push(`0 0 4px ${safeUser.name_border_glow}`);
    if (shadows.length > 0) nameStyle += ` text-shadow: ${shadows.join(', ')};`;
    if (safeUser.name_border && safeUser.name_border !== '#000000') nameStyle += ` -webkit-text-stroke: 0.5px ${safeUser.name_border};`;

    const displayName = escapeHtmlText(safeUser.display_name || safeUser.username || 'Thành viên');
    const userId = Number(safeUser.user_id || safeUser.id || 0);

    const activeIcon = safeUser.active_icon ? `${escapeHtmlText(safeUser.active_icon)} ` : '';
    const staffBadge = getStaffAfterNickBadge(safeUser);
    const frameSize = extractFrameSizePx(safeUser, safeUser.avatar_style || '');

    const avatarHtml = activeFrame
        ? `<a href="/profile?user=${userId}" class="wap-avt-link" style="display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;flex-shrink:0;">${renderAvatarFrameHtml(escapeHtmlText(avatarUrl), activeFrame, frameSize, avatarStyle)}</a>`
        : `<a href="/profile?user=${userId}" class="wap-avt-link" style="display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;flex-shrink:0;"><img src="${escapeHtmlText(avatarUrl)}" style="${avatarStyle}"></a>`;

    return {
        nameStyle,
        avatarStyle,
        nameHtml: `<span class="nick-inline-wrap"><a href="/profile?user=${userId}" style="${nameStyle}">${activeIcon}${displayName}</a>${staffBadge}</span>`,
        avatarHtml
    };
}

async function checkAuth(request, env) {
    try {
        if (!readSessionToken(request)) return null;
        const rawUser = await getSessionUser(request, env);
        if (!rawUser) return null;
        if (Number(rawUser.is_banned || 0) === 1) {
            return { ...rawUser, __banned__: true };
        }
        return await syncUserOnlineAndLevel(env, rawUser);
    } catch (e) {
        return null;
    }
}

function renderLayout(title, content, user) {
    const isStaff = isStaffOrAdminUser(user);
    const userId = Number(user && user.id ? user.id : 0);

    const menuBarHtml = user ? `
        <a href="/" class="top-menu-item"><span class="top-menu-icon">🏠</span><span>Home</span></a>
        <a href="/online" class="top-menu-item"><span class="top-menu-icon">👥</span><span>Trực tuyến</span><span id="onlineBadge" class="top-nav-badge" style="display:none;">0</span></a>
        <a href="/users/feed" class="top-menu-item"><span class="top-menu-icon">📋</span><span>Bảng tin</span></a>
        <a href="/mail/notification" class="top-menu-item"><span class="top-menu-icon">🔔</span><span>Thông báo</span><span id="notiBadge" class="top-nav-badge" style="display:none;">0</span></a>
        <a href="/mail/box" class="top-menu-item"><span class="top-menu-icon">✉️</span><span>Tin nhắn</span><span id="msgBadge" class="top-nav-badge" style="display:none;">0</span></a>
        ${isStaff ? '<a href="/admin" class="top-menu-item"><span class="top-menu-icon">⚙️</span><span>Quản lý</span></a>' : ''}
        <button type="button" class="top-menu-item top-menu-btn" id="topMenuBtn" onclick="toggleMainMenu(event)" aria-expanded="false">
            <span class="top-menu-icon" id="topMenuIcon">☰</span>
            <span>Menu</span>
        </button>

        <div class="nav-dropdown-panel" id="mainNavDropdown">
            <a href="/profile?user=${userId}" class="nav-dropdown-item">
                <span>👤</span>
                <span>Trang cá nhân</span>
            </a>
            <a href="/search" class="nav-dropdown-item">
                <span>🔍</span>
                <span>Tìm kiếm nick</span>
            </a>
            <a href="/friends" class="nav-dropdown-item">
                <span>👥</span>
                <span>Bạn bè</span>
            </a>

            <div class="nav-dropdown-divider"></div>

            <a href="/shop" class="nav-dropdown-item">
                <span>🛒</span>
                <span>Cửa hàng</span>
            </a>
            <a href="/forum" class="nav-dropdown-item">
                <span>💬</span>
                <span>Diễn đàn</span>
            </a>
            <a href="/entertainment" class="nav-dropdown-item">
                <span>🎮</span>
                <span>Khu giải trí</span>
            </a>

            <div class="nav-dropdown-divider"></div>

            <a href="/settings" class="nav-dropdown-item">
                <span>⚙️</span>
                <span>Cài đặt</span>
            </a>
            <a href="/logout" class="nav-dropdown-item">
                <span>↪️</span>
                <span>Đăng xuất</span>
            </a>
        </div>
    ` : `
        <a href="/login" class="top-menu-item"><span class="top-menu-icon">🔑</span><span>Đăng nhập</span></a>
        <a href="/register" class="top-menu-item"><span class="top-menu-icon">📝</span><span>Đăng ký</span></a>
    `;

    const optimisticHelperHtml = `
        <script>
        (function() {
            if (window.wapOptimistic) return;

            function escapeHtml(str) {
                return String(str ?? '')
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;');
            }

            async function prependOptimistic(opts) {
                const container = typeof opts.container === 'string'
                    ? document.querySelector(opts.container)
                    : opts.container;
                if (!container) return { ok: false, error: 'Không tìm thấy danh sách.' };

                const emptySelectors = Array.isArray(opts.hideEmptySelectors) ? opts.hideEmptySelectors : [];
                const hiddenEls = [];
                emptySelectors.forEach(function(sel) {
                    container.querySelectorAll(sel).forEach(function(el) {
                        if (el.style.display !== 'none') {
                            el.setAttribute('data-prev-display', el.style.display || '');
                            el.style.display = 'none';
                            hiddenEls.push(el);
                        }
                    });
                });

                const tempEl = document.createElement('div');
                tempEl.className = 'wap-opt-item is-optimistic';
                tempEl.setAttribute('data-optimistic', '1');
                tempEl.innerHTML = opts.tempHtml || '';

                container.prepend(tempEl);

                if (opts.maxItems && opts.maxItems > 0) {
                    const items = Array.from(container.children).filter(function(el) {
                        return el !== tempEl && !el.hasAttribute('data-prev-display');
                    });
                    for (let i = opts.maxItems - 1; i < items.length; i++) {
                        items[i].remove();
                    }
                }

                const restoreEmpty = function() {
                    hiddenEls.forEach(function(el) {
                        el.style.display = el.getAttribute('data-prev-display') || '';
                        el.removeAttribute('data-prev-display');
                    });
                };

                try {
                    const res = await fetch(opts.url, Object.assign({
                        method: 'POST'
                    }, opts.fetchOptions || {}));

                    let data = null;
                    try {
                        data = await res.json();
                    } catch (e) {
                        data = null;
                    }

                    if (!res.ok || !data || data.ok === false || data.success === false) {
                        tempEl.remove();
                        if (!container.querySelector('.wap-opt-item, [data-post-item], [id^="post-card-"]')) {
                            restoreEmpty();
                        }
                        if (typeof opts.onError === 'function') {
                            opts.onError(data || { error: 'Yêu cầu thất bại.' }, tempEl);
                        }
                        return { ok: false, data };
                    }

                    if (typeof opts.onSuccess === 'function') {
                        opts.onSuccess(data, tempEl);
                    } else {
                        tempEl.classList.remove('is-optimistic');
                        if (data.id) tempEl.setAttribute('data-id', String(data.id));
                    }

                    return { ok: true, data, element: tempEl };
                } catch (err) {
                    tempEl.remove();
                    if (!container.querySelector('.wap-opt-item, [data-post-item], [id^="post-card-"]')) {
                        restoreEmpty();
                    }
                    if (typeof opts.onError === 'function') {
                        opts.onError({ error: 'Lỗi kết nối mạng.' }, tempEl);
                    }
                    return { ok: false, error: err };
                }
            }

            window.wapOptimistic = {
                escapeHtml: escapeHtml,
                prepend: prependOptimistic
            };
        })();
        </script>
    `;

    const floatingBubbleHtml = user ? `
        <a href="/mail/box" id="floatingMsgBubble" style="position: fixed; bottom: 20px; right: 20px; width: 48px; height: 48px; background: #111; border: 2px solid #ff3333; border-radius: 50%; display: none; align-items: center; justify-content: center; text-decoration: none; box-shadow: 0 0 15px rgba(255, 51, 51, 0.7); z-index: 9999; animation: pulseBubble 1.5s infinite;">
            <span style="font-size: 22px;">✉️</span>
            <span id="floatingMsgCount" style="position: absolute; top: -4px; right: -4px; background: #ff0000; color: #fff; font-size: 11px; font-weight: bold; padding: 2px 6px; border-radius: 50%;">0</span>
        </a>
        <style>
            @keyframes pulseBubble {
                0% { transform: scale(1); box-shadow: 0 0 10px rgba(255, 51, 51, 0.7); }
                50% { transform: scale(1.08); box-shadow: 0 0 20px rgba(255, 51, 51, 1); }
                100% { transform: scale(1); box-shadow: 0 0 10px rgba(255, 51, 51, 0.7); }
            }
        </style>
        <script>
            function toggleMainMenu(event) {
                if (event) {
                    event.preventDefault();
                    event.stopPropagation();
                }
                const panel = document.getElementById('mainNavDropdown');
                const btn = document.getElementById('topMenuBtn');
                const icon = document.getElementById('topMenuIcon');
                if (!panel) return;
                const isOpen = panel.classList.toggle('open');
                if (btn) btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
                if (icon) icon.textContent = isOpen ? '✕' : '☰';
            }

            document.addEventListener('click', function(event) {
                const panel = document.getElementById('mainNavDropdown');
                const btn = document.getElementById('topMenuBtn');
                const icon = document.getElementById('topMenuIcon');
                if (!panel || !panel.classList.contains('open')) return;
                if (!panel.contains(event.target) && (!btn || !btn.contains(event.target))) {
                    panel.classList.remove('open');
                    if (btn) btn.setAttribute('aria-expanded', 'false');
                    if (icon) icon.textContent = '☰';
                }
            });

            async function checkRealtimeNotifications() {
                try {
                    const activeChatPartner = Number(window.__ACTIVE_CHAT_PARTNER_ID__ || 0);
                    const query = activeChatPartner > 0
                        ? ('/api/realtime-check?in_chat_with=' + activeChatPartner + '&partner_id=' + activeChatPartner + '&_t=' + Date.now())
                        : ('/api/realtime-check?_t=' + Date.now());

                    const res = await fetch(query);
                    if (!res.ok) return;
                    const data = await res.json();

                    const msgBadge = document.getElementById('msgBadge');
                    const notiBadge = document.getElementById('notiBadge');
                    const onlineBadge = document.getElementById('onlineBadge');
                    const floatBubble = document.getElementById('floatingMsgBubble');
                    const floatCount = document.getElementById('floatingMsgCount');

                    let unreadMsgs = Number(data.unread_messages || 0);
                    if (activeChatPartner > 0) {
                        if (typeof data.other_unread_count === 'number') {
                            unreadMsgs = data.other_unread_count;
                        } else if (Array.isArray(data.unread_senders)) {
                            unreadMsgs = data.unread_senders.filter(function(id) {
                                return Number(id) !== activeChatPartner;
                            }).length;
                        } else {
                            unreadMsgs = 0;
                        }
                    }

                    if (unreadMsgs > 0) {
                        if (msgBadge) { msgBadge.innerText = unreadMsgs; msgBadge.style.display = 'inline-block'; }
                        if (floatBubble && floatCount) { floatCount.innerText = unreadMsgs; floatBubble.style.display = 'flex'; }
                    } else {
                        if (msgBadge) msgBadge.style.display = 'none';
                        if (floatBubble) floatBubble.style.setProperty('display', 'none', 'important');
                    }

                    if (data.unread_notifications > 0) {
                        if (notiBadge) { notiBadge.innerText = data.unread_notifications; notiBadge.style.display = 'inline-block'; }
                    } else {
                        if (notiBadge) notiBadge.style.display = 'none';
                    }

                    if (typeof data.online_count === 'number' && data.online_count > 0 && onlineBadge) {
                        onlineBadge.innerText = data.online_count;
                        onlineBadge.style.display = 'inline-block';
                    }
                } catch (e) {}
            }
            checkRealtimeNotifications();
            setInterval(checkRealtimeNotifications, 5000);
        </script>
    ` : '';

    return `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtmlText(title)} - Thế Giới Chat</title>
    <style>
        body { background: #000; color: #00ff00; font-family: Arial, sans-serif; margin: 0; padding: 0; font-size: 14px; line-height: 1.6; }
        .header { background: #000; text-align: center; padding: 16px 0; border-bottom: 2px solid #222; }
        .header h1 { color: #fff; margin: 0; font-size: 24px; font-weight: bold; text-shadow: 0 0 12px #00ff00; letter-spacing: 1px; }
        @keyframes rainbowGlow {
            0% { color: #ff0000; text-shadow: 0 0 6px #ff0000; }
            14% { color: #ff7700; text-shadow: 0 0 6px #ff7700; }
            28% { color: #ffff00; text-shadow: 0 0 6px #ffff00; }
            42% { color: #00ff00; text-shadow: 0 0 6px #00ff00; }
            57% { color: #00ffff; text-shadow: 0 0 6px #00ffff; }
            71% { color: #0000ff; text-shadow: 0 0 6px #0000ff; }
            85% { color: #ff00ff; text-shadow: 0 0 6px #ff00ff; }
            100% { color: #ff0000; text-shadow: 0 0 6px #ff0000; }
        }
        .slogan { font-size: 13px; font-weight: bold; margin-top: 6px; animation: rainbowGlow 4s infinite linear; }
        .top-menu-wrapper { background: #111; border-bottom: 2px solid #222; padding: 10px 0; position: relative; z-index: 1000; }
        .top-menu-bar { max-width: 680px; margin: 0 auto; display: flex; justify-content: space-around; align-items: center; flex-wrap: wrap; text-align: center; padding: 0 10px; box-sizing: border-box; position: relative; }
        .top-menu-item { color: #00ff00; text-decoration: none; font-size: 12px; display: flex; flex-direction: column; align-items: center; font-weight: bold; flex: 1; min-width: 58px; position: relative; }
        .top-menu-item:hover { color: #fff; text-decoration: underline; }
        .top-menu-btn { background: transparent; border: none; cursor: pointer; font-family: inherit; padding: 0; }
        .top-menu-icon { font-size: 20px; margin-bottom: 3px; line-height: 1.1; }
        .top-nav-badge { position: absolute; top: -3px; right: 6px; background: #ff0000; color: #fff; font-size: 9px; padding: 1px 4px; border-radius: 10px; }

        .nav-dropdown-panel {
            display: none;
            position: absolute;
            top: calc(100% + 10px);
            right: 10px;
            width: 240px;
            background: #0b0d10;
            border: 1px solid #2d333d;
            border-radius: 6px;
            padding: 8px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.9);
            z-index: 1500;
            text-align: left;
        }
        .nav-dropdown-panel.open {
            display: block;
        }
        .nav-dropdown-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 11px;
            margin-bottom: 5px;
            background: #14181f;
            border: 1px solid #252b35;
            border-radius: 4px;
            color: #e6edf5;
            text-decoration: none;
            font-size: 13px;
            font-weight: normal;
        }
        .nav-dropdown-item:last-child {
            margin-bottom: 0;
        }
        .nav-dropdown-item:hover {
            background: #1d232d;
            border-color: #00ff00;
            color: #00ff00;
            text-decoration: none;
        }
        .nav-dropdown-divider {
            height: 1px;
            background: #222730;
            margin: 6px 0 8px 0;
        }

        .container { padding: 12px; max-width: 680px; margin: 0 auto; box-sizing: border-box; }
        .box { background: #080808; border: 1px solid #333; margin-bottom: 12px; box-sizing: border-box; }
        .box-title { background: linear-gradient(to right, #141414, #222); color: #00ff00; padding: 10px 12px; font-weight: bold; border-bottom: 1px solid #333; font-size: 14px; display: flex; align-items: center; gap: 8px; }
        .box-content { padding: 12px; }
        a { color: #00ff00; text-decoration: none; }
        a:hover { text-decoration: underline; color: #fff; }
        .btn { background: #1c1c1c; color: #00ff00; border: 1px solid #444; padding: 8px 14px; cursor: pointer; font-size: 13px; font-weight: bold; display: inline-block; text-align: center; box-sizing: border-box; }
        .btn:hover { background: #333; border-color: #00ff00; color: #fff; }
        .footer { text-align: center; padding: 16px; font-size: 13px; color: #777; border-top: 1px solid #222; background: #050505; margin-bottom: 40px; }

        .nick-inline-wrap {
            display: inline-flex !important;
            align-items: center !important;
            flex-wrap: nowrap !important;
            vertical-align: middle !important;
            max-width: 100%;
        }
        .staff-nick-badge {
            display: inline-flex !important;
            align-items: center !important;
            gap: 2px !important;
            margin-left: 4px !important;
            padding: 0 4px !important;
            border-radius: 3px !important;
            font-size: 8.5px !important;
            font-weight: 700 !important;
            letter-spacing: 0.25px !important;
            vertical-align: middle !important;
            line-height: 1.2 !important;
            text-transform: uppercase !important;
            user-select: none !important;
            flex-shrink: 0 !important;
            -webkit-text-stroke: 0 !important;
        }
        .staff-nick-badge .badge-ico {
            display: inline-block !important;
            font-size: 9px !important;
            line-height: 1 !important;
            animation: staffIconPulse 1.2s infinite ease-in-out !important;
        }
        .staff-badge-admin {
            background: linear-gradient(90deg, #3b0000, #8a0000, #3b0000) !important;
            background-size: 200% 100% !important;
            color: #fff200 !important;
            border: 1px solid rgba(255, 59, 48, 0.85) !important;
            box-shadow: 0 0 4px rgba(255, 59, 48, 0.65) !important;
            animation: adminNickBlink 1.3s infinite alternate, staffBadgeSlide 2.6s linear infinite !important;
        }
        .staff-badge-mod {
            background: linear-gradient(90deg, #002633, #006688, #002633) !important;
            background-size: 200% 100% !important;
            color: #7ef9ff !important;
            border: 1px solid rgba(0, 229, 255, 0.85) !important;
            box-shadow: 0 0 4px rgba(0, 229, 255, 0.6) !important;
            animation: modNickBlink 1.3s infinite alternate, staffBadgeSlide 2.6s linear infinite !important;
        }
        @keyframes adminNickBlink {
            0% {
                opacity: 0.78;
                box-shadow: 0 0 2px rgba(255, 59, 48, 0.35);
                text-shadow: 0 0 1px #ff3b30;
            }
            100% {
                opacity: 1;
                box-shadow: 0 0 7px rgba(255, 59, 48, 0.95), 0 0 11px rgba(255, 230, 0, 0.45);
                text-shadow: 0 0 4px #fff200;
            }
        }
        @keyframes modNickBlink {
            0% {
                opacity: 0.78;
                box-shadow: 0 0 2px rgba(0, 229, 255, 0.35);
                text-shadow: 0 0 1px #00e5ff;
            }
            100% {
                opacity: 1;
                box-shadow: 0 0 7px rgba(0, 229, 255, 0.95), 0 0 11px rgba(0, 255, 170, 0.4);
                text-shadow: 0 0 4px #7ef9ff;
            }
        }
        @keyframes staffIconPulse {
            0%, 100% { transform: scale(1) rotate(0deg); }
            50% { transform: scale(1.16) rotate(-5deg); }
        }
        @keyframes staffBadgeSlide {
            0% { background-position: 0% 50%; }
            100% { background-position: 200% 50%; }
        }

        /* KHUNG AVATAR (6 TĨNH + 6 ĐỘNG) - ĐỒNG BỘ MỌI TRANG & MỌI MỤC SHOP */
        .wap-avt-link {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            vertical-align: middle !important;
            flex-shrink: 0 !important;
            line-height: 0 !important;
        }
        .wap-avt-frame {
            position: relative !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            border-radius: 50% !important;
            vertical-align: middle !important;
            box-sizing: border-box !important;
            flex-shrink: 0 !important;
        }
        .wap-avt-frame-ring {
            position: absolute !important;
            inset: 0 !important;
            border-radius: 50% !important;
            pointer-events: none !important;
            box-sizing: border-box !important;
            z-index: 2 !important;
        }
        .wap-avt-frame-img {
            position: relative !important;
            z-index: 1 !important;
            border-radius: 50% !important;
            object-fit: cover !important;
            display: block !important;
            border: none !important;
            box-shadow: none !important;
            max-width: none !important;
        }

        /* 6 KHUNG TĨNH */
        .avt-frame-static-1 .wap-avt-frame-ring {
            border: 3px solid #10b981;
            box-shadow: inset 0 0 0 1px #a7f3d0, 0 0 6px rgba(16, 185, 129, 0.55);
        }
        .avt-frame-static-2 .wap-avt-frame-ring {
            border: 3px solid #f59e0b;
            box-shadow: inset 0 0 0 1px #fde68a, 0 0 7px rgba(245, 158, 11, 0.6);
        }
        .avt-frame-static-3 .wap-avt-frame-ring {
            border: 3px solid #f43f5e;
            box-shadow: inset 0 0 0 1px #fecdd3, 0 0 7px rgba(244, 63, 94, 0.6);
        }
        .avt-frame-static-4 .wap-avt-frame-ring {
            border: 3px solid #0ea5e9;
            box-shadow: inset 0 0 0 1px #bae6fd, 0 0 7px rgba(14, 165, 233, 0.6);
        }
        .avt-frame-static-5 .wap-avt-frame-ring {
            border: 3px solid #a855f7;
            box-shadow: inset 0 0 0 1px #e9d5ff, 0 0 7px rgba(168, 85, 247, 0.6);
        }
        .avt-frame-static-6 .wap-avt-frame-ring {
            border: 3px solid #e2e8f0;
            box-shadow: inset 0 0 0 1px #94a3b8, 0 0 6px rgba(226, 232, 240, 0.55);
        }

        /* 6 KHUNG ĐỘNG */
        .avt-frame-anim-7 .wap-avt-frame-ring {
            padding: 3px;
            background: conic-gradient(#ff2a00, #ff9900, #ffee00, #ff2a00);
            -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
            -webkit-mask-composite: xor;
            mask-composite: exclude;
            animation: frameSpin 2.2s linear infinite;
            box-shadow: 0 0 10px rgba(255, 85, 0, 0.75);
        }
        .avt-frame-anim-8 .wap-avt-frame-ring {
            padding: 3px;
            background: conic-gradient(#ff0055, #ffaa00, #22ff55, #00ddff, #9933ff, #ff0055);
            -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
            -webkit-mask-composite: xor;
            mask-composite: exclude;
            animation: frameSpin 2.6s linear infinite;
        }
        .avt-frame-anim-9 .wap-avt-frame-ring {
            border: 3px solid #38bdf8;
            animation: framePulseBolt 1.1s ease-in-out infinite alternate;
        }
        .avt-frame-anim-10 .wap-avt-frame-ring {
            border: 3px solid #facc15;
            animation: frameHaloGlow 1.5s ease-in-out infinite;
        }
        .avt-frame-anim-11 .wap-avt-frame-ring {
            padding: 3px;
            background: conic-gradient(#38bdf8, #818cf8, #c084fc, #38bdf8);
            -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
            -webkit-mask-composite: xor;
            mask-composite: exclude;
            animation: frameSpinReverse 3s linear infinite;
        }
        .avt-frame-anim-12 .wap-avt-frame-ring {
            padding: 3px;
            background: conic-gradient(#fde047, #ef4444, #ec4899, #fde047);
            -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
            -webkit-mask-composite: xor;
            mask-composite: exclude;
            animation: frameSpin 1.8s linear infinite;
            filter: drop-shadow(0 0 6px rgba(250, 204, 21, 0.8));
        }

        @keyframes frameSpin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        @keyframes frameSpinReverse {
            0% { transform: rotate(360deg); }
            100% { transform: rotate(0deg); }
        }
        @keyframes framePulseBolt {
            0% { border-color: #38bdf8; box-shadow: 0 0 4px #38bdf8; transform: scale(1); }
            100% { border-color: #e0f2fe; box-shadow: 0 0 12px #0284c7; transform: scale(1.03); }
        }
        @keyframes frameHaloGlow {
            0%, 100% { box-shadow: 0 0 5px rgba(250, 204, 21, 0.65); }
            50% { box-shadow: 0 0 14px rgba(250, 204, 21, 1); }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>THẾ GIỚI CHAT</h1>
        <div class="slogan">Wap chát - Kết bạn - Giải trí</div>
    </div>
    <div class="top-menu-wrapper"><div class="top-menu-bar">${menuBarHtml}</div></div>
    <div class="container">${content}</div>
    ${optimisticHelperHtml}
    ${floatingBubbleHtml}
    <div class="footer">
        <div><a href="/">Home</a> · <a href="/terms">Điều khoản</a> · <a href="/contact">Liên hệ</a> ${user ? '· <a href="/logout">Đăng xuất</a>' : ''}</div>
        <div style="color: #00ff00; margin-top: 8px;">Copyright © 2026 - Thế Giới Chat</div>
    </div>
</body>
</html>`;
}

// ===== Bảo mật phiên đăng nhập =====
function getSetCookies(headers) {
    if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
    const raw = headers.get('Set-Cookie');
    return raw ? [raw] : [];
}

function buildTrustedRequest(request, verifiedUserId) {
    const kept = (request.headers.get('Cookie') || '')
        .split(';')
        .map((c) => c.trim())
        .filter((c) => c && !c.includes('user_id=') && !c.startsWith('sid='));
    if (verifiedUserId) kept.unshift(`user_id=${verifiedUserId}`);

    const headers = new Headers(request.headers);
    if (kept.length > 0) headers.set('Cookie', kept.join('; '));
    else headers.delete('Cookie');
    return new Request(request, { headers });
}

async function upgradeAuthResponse(response, env) {
    const cookies = getSetCookies(response.headers);
    let userId = null;
    for (const c of cookies) {
        const m = c.match(/^\s*user_id=(\d+)/);
        if (m) userId = Number(m[1]);
    }
    if (!userId) return response;

    const token = await createSession(env, userId);
    const headers = new Headers(response.headers);
    headers.delete('Set-Cookie');
    for (const c of cookies) {
        if (!/^\s*user_id=/.test(c)) headers.append('Set-Cookie', c);
    }
    headers.append('Set-Cookie', buildSessionCookie(token));
    headers.append('Set-Cookie', buildLegacyClearCookie());
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function withClearedAuthCookies(response) {
    const headers = new Headers(response.headers);
    for (const c of buildClearCookies()) headers.append('Set-Cookie', c);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    try {
      const mediaRes = await handleMediaRequest(request, env);
      if (mediaRes) return mediaRes;
      const url = new URL(request.url);
      const path = url.pathname;
      const user = await checkAuth(request, env);

      if (path === '/logout') {
          await destroySession(request, env);
          return withClearedAuthCookies(await handleLogout(buildTrustedRequest(request, null), env));
      }

      if (user && user.__banned__ && path !== '/login' && path !== '/register') {
          const reasonText = escapeHtmlText(user.ban_reason || 'Tài khoản của bạn đã bị khóa bởi Ban Quản Trị.');
          const bannedHtml = renderLayout(
              'Tài khoản bị khóa',
              `<div class="box"><div class="box-title">⛔ Tài khoản đã bị Ban ID</div><div class="box-content" style="color:#fca5a5;">Lý do: <b>${reasonText}</b></div></div>`,
              null
          );
          return new Response(bannedHtml, { status: 403, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
      }

      request = buildTrustedRequest(request, user ? user.id : null);

      if (path === '/login' || path === '/register') {
          const authRes = path === '/login' ? await handleLogin(request, env) : await handleRegister(request, env);
          return await upgradeAuthResponse(authRes, env);
      }
      if (path === '/api/realtime-check') return await handleRealtimeApi(request, env);

      if (!user && path !== '/') {
          return Response.redirect(new URL('/login', request.url), 302);
      }

      if (path === '/') return await handleIndex(request, env, user, renderLayout);
      if (path === '/online' || path === '/onine') return await handleOnline(request, env, user, renderLayout, url);
      if (path === '/profile') return await handleProfile(request, env, user, renderLayout, url);
      if (path === '/profile/level') return await handleLevel(request, env, user, renderLayout);
      if (path === '/shop') return await handleShop(request, env, user, renderLayout);
      if (path === '/shop/buyicon') return await handleShopIcon(request, env, user, renderLayout);
      if (path === '/shop/avatar-frames') return await handleShopFrames(request, env, user, renderLayout);
      if (path === '/shop/buycolor') return await handleShopColor(request, env, user, renderLayout);
      if (path === '/shop/inventory') return await handleInventory(request, env, user, renderLayout);
      if (path === '/mail/box') return await handleMailBox(request, env, user, renderLayout);
      if (path === '/mail/chat') return await handleMailChat(request, env, user, renderLayout, url);
      if (path === '/mail/notification') return await handleMailNotification(request, env, user, renderLayout);
      if (path === '/users/feed') return await handleFeed(request, env, user, renderLayout, ctx);
      if (path === '/game') return await handleGame(request, env, user, renderLayout);
      if (path === '/admin') {
          if (!isStaffOrAdminUser(user)) {
              return new Response("Bạn không có quyền truy cập khu vực quản lý.", { status: 403 });
          }
          return await handleAdminDashboard(request, env, user, renderLayout);
      }
      if (path === '/admin/update-role') {
          if (!isStaffOrAdminUser(user)) {
              return new Response("Bạn không có quyền thực hiện thao tác này.", { status: 403 });
          }
          return await handleAdminAction(request, env, user);
      }

      return new Response("Không tìm thấy trang (404)", { status: 404 });
    } catch (err) {
      return new Response(`Lỗi hệ thống Worker: ${err.message} <br><pre>${err.stack}</pre>`, { 
        status: 500, 
        headers: { 'Content-Type': 'text/html;charset=UTF-8' } 
      });
    }
  }
};
