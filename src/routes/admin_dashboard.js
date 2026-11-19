import { renderUser } from '../worker.js';
import {
    ROLE_TIERS,
    getRoleTier,
    getRoleConfig,
    canManageTargetUser,
    sanitizeManagementUpdates,
    applyBanIdAction
} from '../roles_system.js';

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getRoleBadgeStyle(tier) {
    if (tier === ROLE_TIERS.FOUNDER) {
        return 'background: rgba(250, 204, 21, 0.16); color: #facc15; border: 1px solid rgba(250, 204, 21, 0.45);';
    }
    if (tier === ROLE_TIERS.SUPER_ADMIN) {
        return 'background: rgba(244, 63, 94, 0.16); color: #fb7185; border: 1px solid rgba(244, 63, 94, 0.45);';
    }
    if (tier === ROLE_TIERS.ADMIN) {
        return 'background: rgba(168, 85, 247, 0.16); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.45);';
    }
    if (tier === ROLE_TIERS.MOD) {
        return 'background: rgba(56, 189, 248, 0.16); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.45);';
    }
    return 'background: rgba(74, 222, 128, 0.12); color: #4ade80; border: 1px solid rgba(74, 222, 128, 0.3);';
}

function renderStyledNickWithoutStaffBadge(uItem) {
    const rendered = renderUser(uItem);
    const rawHtml = String(rendered.nameHtml || '');
    return rawHtml.replace(/<span class="staff-nick-badge[^"]*"[\s\S]*?<\/span>/gi, '');
}

async function isBannedByFounder(env, targetUser) {
    const bannedById = Number(targetUser && targetUser.banned_by ? targetUser.banned_by : 0);
    if (bannedById === 1) return true;
    if (bannedById > 0) {
        try {
            const bannerUser = await env.DB.prepare("SELECT id, role, is_admin FROM users WHERE id = ?").bind(bannedById).first();
            if (bannerUser && getRoleTier(bannerUser) === ROLE_TIERS.FOUNDER) {
                return true;
            }
        } catch (e) {}
    }
    return false;
}

async function canActorUnbanTarget(env, actor, targetUser) {
    const actorTier = getRoleTier(actor);
    if (actorTier === ROLE_TIERS.FOUNDER) {
        return canManageTargetUser(actor, targetUser).allowed;
    }
    if (actorTier === ROLE_TIERS.SUPER_ADMIN) {
        const check = canManageTargetUser(actor, targetUser);
        if (!check.allowed) return false;
        const blockedByFounder = await isBannedByFounder(env, targetUser);
        if (blockedByFounder) return false;
        return true;
    }
    return false;
}

async function ensureAdminSchemaColumns(env) {
    const alterStatements = [
        "ALTER TABLE users ADD COLUMN gold INTEGER DEFAULT 0",
        "ALTER TABLE users ADD COLUMN online_minutes INTEGER DEFAULT 0",
        "ALTER TABLE users ADD COLUMN is_banned INTEGER DEFAULT 0",
        "ALTER TABLE users ADD COLUMN ban_reason TEXT DEFAULT ''",
        "ALTER TABLE users ADD COLUMN banned_by INTEGER DEFAULT 0",
        "ALTER TABLE users ADD COLUMN banned_at INTEGER DEFAULT 0",
        "ALTER TABLE users ADD COLUMN gender TEXT DEFAULT 'male'",
        "ALTER TABLE users ADD COLUMN mood TEXT DEFAULT ''",
        "ALTER TABLE users ADD COLUMN current_location TEXT DEFAULT 'Trang chủ'",
        "ALTER TABLE users ADD COLUMN name_color TEXT DEFAULT '#00ff00'",
        "ALTER TABLE users ADD COLUMN name_glow TEXT DEFAULT '#000000'",
        "ALTER TABLE users ADD COLUMN name_border TEXT DEFAULT '#000000'",
        "ALTER TABLE users ADD COLUMN name_border_glow TEXT DEFAULT '#000000'",
        "ALTER TABLE users ADD COLUMN border_color TEXT DEFAULT '#ffcc00'",
        "ALTER TABLE users ADD COLUMN avatar_glow TEXT DEFAULT '#000000'",
        "ALTER TABLE users ADD COLUMN active_icon TEXT DEFAULT ''"
    ];
    for (const sql of alterStatements) {
        try {
            await env.DB.prepare(sql).run();
        } catch (e) {}
    }
}

export async function handleAdminDashboard(request, env, user, renderLayout) {
    const actorTier = getRoleTier(user);
    if (!user || actorTier < ROLE_TIERS.MOD) {
        return new Response("Truy cập bị từ chối! Bạn không có quyền quản trị viên.", { status: 403 });
    }

    const actorCfg = getRoleConfig(user);
    const isFounder = actorTier === ROLE_TIERS.FOUNDER;
    const isSuperAdmin = actorTier === ROLE_TIERS.SUPER_ADMIN;
    const currentUserId = Number(user.id || 0);
    let message = "";

    await ensureAdminSchemaColumns(env);

    if (request.method === 'POST') {
        const formData = await request.formData();
        const actionType = String(formData.get('action_type') || 'update_user').trim();
        const targetUserId = parseInt(formData.get('user_id') || '0', 10);

        try {
            if (!targetUserId || Number.isNaN(targetUserId)) {
                throw new Error("ID thành viên không hợp lệ!");
            }

            const targetUser = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(targetUserId).first();
            if (!targetUser) {
                throw new Error("Không tìm thấy thành viên!");
            }

            if (actionType === 'ban_user' || actionType === 'unban_user') {
                const isBan = actionType === 'ban_user';
                const reason = String(formData.get('ban_reason') || '').trim();

                if (!isBan) {
                    const allowedUnban = await canActorUnbanTarget(env, user, targetUser);
                    if (!allowedUnban) {
                        throw new Error(
                            isSuperAdmin && await isBannedByFounder(env, targetUser)
                                ? "Tài khoản này bị Người Sáng Lập Ban ID nên Super Admin không có quyền gỡ Ban!"
                                : "Bạn không có quyền gỡ Ban ID cho tài khoản này!"
                        );
                    }
                    await env.DB.prepare(`
                        UPDATE users
                        SET is_banned = 0, ban_reason = '', banned_by = 0, banned_at = 0
                        WHERE id = ?
                    `).bind(targetUserId).run();
                } else if (isFounder) {
                    const check = canManageTargetUser(user, targetUser);
                    if (!check.allowed) throw new Error(check.reason);
                    const cleanReason = reason || 'Vi phạm quy định hệ thống';
                    const nowSec = Math.floor(Date.now() / 1000);
                    await env.DB.prepare(`
                        UPDATE users
                        SET is_banned = 1, ban_reason = ?, banned_by = ?, banned_at = ?
                        WHERE id = ?
                    `).bind(cleanReason, currentUserId, nowSec, targetUserId).run();
                } else {
                    const banRes = await applyBanIdAction(env, user, targetUser, true, reason);
                    if (!banRes.ok) throw new Error(banRes.error);
                }

                message = `<div class="adm-alert adm-alert-ok">✅ ${isBan ? `Đã Ban ID #${targetUserId}` : `Đã gỡ Ban ID #${targetUserId}`} thành công!</div>`;
            } else if (actionType === 'delete_user_account') {
                if (!isFounder) {
                    throw new Error("Chỉ Người Sáng Lập mới có quyền xóa tài khoản người dùng!");
                }
                if (targetUserId === currentUserId) {
                    throw new Error("Không thể tự xóa tài khoản của chính bạn!");
                }
                try {
                    await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(targetUserId).run();
                } catch (e) {}
                try {
                    await env.DB.prepare("DELETE FROM mail_box WHERE sender_id = ? OR receiver_id = ?").bind(targetUserId, targetUserId).run();
                } catch (e) {}
                try {
                    await env.DB.prepare("DELETE FROM posts WHERE user_id = ?").bind(targetUserId).run();
                } catch (e) {}
                await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(targetUserId).run();

                message = `<div class="adm-alert adm-alert-ok">✅ Đã xóa vĩnh viễn tài khoản ID #${targetUserId} (${escapeHtml(targetUser.display_name || '')})!</div>`;
            } else if (actionType === 'delete_user_content') {
                const check = canManageTargetUser(user, targetUser);
                if (!check.allowed) {
                    throw new Error(check.reason);
                }
                const targetScope = String(formData.get('delete_scope') || 'all').trim();
                if (targetScope === 'mail' || targetScope === 'all') {
                    try {
                        await env.DB.prepare("DELETE FROM mail_box WHERE sender_id = ? OR receiver_id = ?").bind(targetUserId, targetUserId).run();
                    } catch (e) {}
                }
                if (targetScope === 'feed' || targetScope === 'all') {
                    try {
                        await env.DB.prepare("DELETE FROM posts WHERE user_id = ?").bind(targetUserId).run();
                    } catch (e) {}
                }
                message = `<div class="adm-alert adm-alert-ok">✅ Đã xóa dữ liệu mục đã chọn của ID #${targetUserId}!</div>`;
            } else {
                const extraFields = isFounder ? {
                    display_name: String(formData.get('display_name') ?? targetUser.display_name ?? '').trim(),
                    gender: String(formData.get('gender') ?? targetUser.gender ?? 'male').trim(),
                    mood: String(formData.get('mood') ?? targetUser.mood ?? '').trim(),
                    current_location: String(formData.get('current_location') ?? targetUser.current_location ?? 'Trang chủ').trim(),
                    name_color: String(formData.get('name_color') ?? targetUser.name_color ?? '#00ff00').trim(),
                    name_glow: String(formData.get('name_glow') ?? targetUser.name_glow ?? '#000000').trim(),
                    name_border: String(formData.get('name_border') ?? targetUser.name_border ?? '#000000').trim(),
                    name_border_glow: String(formData.get('name_border_glow') ?? targetUser.name_border_glow ?? '#000000').trim(),
                    border_color: String(formData.get('border_color') ?? targetUser.border_color ?? '#ffcc00').trim(),
                    avatar_glow: String(formData.get('avatar_glow') ?? targetUser.avatar_glow ?? '#000000').trim(),
                    active_icon: String(formData.get('active_icon') ?? targetUser.active_icon ?? '').trim()
                } : undefined;

                const sanitized = sanitizeManagementUpdates(user, targetUser, {
                    role: formData.get('role'),
                    level: formData.get('level'),
                    coins: formData.get('coins'),
                    gold: formData.get('gold'),
                    online_minutes: formData.get('online_minutes'),
                    extraFields
                });

                if (!sanitized.ok) {
                    throw new Error(sanitized.error);
                }

                const u = sanitized.updates;
                const finalRole = u.role ?? targetUser.role;
                const finalLevel = u.level ?? Number(targetUser.level || 1);
                const finalCoins = u.coins ?? Number(targetUser.coins || 0);
                const finalGold = u.gold ?? Number(targetUser.gold || 0);
                const finalOnlineMins = u.online_minutes ?? Number(targetUser.online_minutes || 0);

                if (isFounder) {
                    await env.DB.prepare(`
                        UPDATE users
                        SET role = ?, level = ?, coins = ?, gold = ?, online_minutes = ?,
                            display_name = ?, gender = ?, mood = ?, current_location = ?,
                            name_color = ?, name_glow = ?, name_border = ?, name_border_glow = ?,
                            border_color = ?, avatar_glow = ?, active_icon = ?
                        WHERE id = ?
                    `).bind(
                        finalRole,
                        finalLevel,
                        finalCoins,
                        finalGold,
                        finalOnlineMins,
                        u.display_name || targetUser.display_name || '',
                        u.gender || 'male',
                        u.mood || '',
                        u.current_location || 'Trang chủ',
                        u.name_color || '#00ff00',
                        u.name_glow || '#000000',
                        u.name_border || '#000000',
                        u.name_border_glow || '#000000',
                        u.border_color || '#ffcc00',
                        u.avatar_glow || '#000000',
                        u.active_icon || '',
                        targetUserId
                    ).run();
                } else {
                    await env.DB.prepare(`
                        UPDATE users
                        SET role = ?, level = ?, coins = ?, gold = ?, online_minutes = ?
                        WHERE id = ?
                    `).bind(finalRole, finalLevel, finalCoins, finalGold, finalOnlineMins, targetUserId).run();
                }

                message = `<div class="adm-alert adm-alert-ok">✅ Đã cập nhật thông tin cho ID #${targetUserId} — Lv: <b>${finalLevel}</b> · Xu: <b>${finalCoins.toLocaleString('en-US')}</b> · Vàng: <b>${finalGold.toLocaleString('en-US')}</b> · Online: <b>${finalOnlineMins}p</b></div>`;
            }
        } catch (e) {
            message = `<div class="adm-alert adm-alert-err">❌ Lỗi: ${escapeHtml(e.message)}</div>`;
        }
    }

    let usersList = [];
    try {
        const res = await env.DB.prepare(`
            SELECT id, username, display_name, role, is_admin, coins, gold, level, online_minutes,
                   is_banned, ban_reason, banned_by, gender, mood, current_location,
                   name_color, name_glow, name_border, name_border_glow,
                   border_color, avatar_glow, active_icon
            FROM users
            ORDER BY id DESC
            LIMIT 120
        `).all();
        usersList = (res && Array.isArray(res.results)) ? res.results : [];
    } catch (e) {
        try {
            const res2 = await env.DB.prepare(`
                SELECT id, username, display_name, role, is_admin, coins, gold, level, online_minutes, is_banned, ban_reason
                FROM users
                ORDER BY id DESC
                LIMIT 120
            `).all();
            usersList = (res2 && Array.isArray(res2.results)) ? res2.results : [];
        } catch (e2) {
            usersList = [];
        }
    }

    usersList.sort((a, b) => {
        const tierDiff = getRoleTier(b) - getRoleTier(a);
        if (tierDiff !== 0) return tierDiff;
        const lvlDiff = Number(b.level || 1) - Number(a.level || 1);
        if (lvlDiff !== 0) return lvlDiff;
        return Number(b.id || 0) - Number(a.id || 0);
    });

    const founderIds = new Set(
        usersList.filter(u => getRoleTier(u) === ROLE_TIERS.FOUNDER).map(u => Number(u.id || 0))
    );
    founderIds.add(1);

    const totalUsers = usersList.length;
    const totalBanned = usersList.filter(u => Number(u.is_banned || 0) === 1).length;
    const totalStaff = usersList.filter(u => getRoleTier(u) >= ROLE_TIERS.MOD).length;

    const maxLvlDisplay = Number.isFinite(actorCfg.maxLevel) ? `Max Lv.${actorCfg.maxLevel}` : 'Không giới hạn';
    const maxCoinDisplay = actorCfg.maxCoin === Number.MAX_SAFE_INTEGER ? 'Không giới hạn' : actorCfg.maxCoin.toLocaleString('en-US');
    const maxGoldDisplay = actorCfg.maxGold === Number.MAX_SAFE_INTEGER ? 'Không giới hạn' : actorCfg.maxGold.toLocaleString('en-US');
    const maxOnlineDisplay = actorCfg.maxOnlineMinutes === Number.MAX_SAFE_INTEGER ? 'Không giới hạn' : `${actorCfg.maxOnlineMinutes.toLocaleString('en-US')} phút`;

    const roleOptionsHtml = (currentRole) => {
        const choices = ['Thành Viên', 'Mod', 'Admin'];
        if (actorCfg.canAssignFounderOrSuperAdmin) {
            choices.push('Super Admin', 'Người Sáng Lập');
        }
        return choices.map(r =>
            `<option value="${escapeHtml(r)}" ${String(currentRole || 'Thành Viên') === r ? 'selected' : ''}>${escapeHtml(r)}</option>`
        ).join('');
    };

    const content = `
    <style>
        .adm-shell {
            background: #090c10;
            border: 1px solid #262f3d;
            border-radius: 8px;
            overflow: hidden;
            font-size: 14px;
            color: #e2e8f0;
        }
        .adm-header {
            background: linear-gradient(90deg, #111827, #1e293b);
            padding: 14px 16px;
            border-bottom: 1px solid #2d3748;
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            align-items: center;
            gap: 10px;
        }
        .adm-title {
            font-size: 17px;
            font-weight: bold;
            color: #4ade80;
            margin: 0;
        }
        .adm-role-pill {
            padding: 4px 10px;
            border-radius: 999px;
            font-size: 12px;
            font-weight: bold;
            background: rgba(250, 204, 21, 0.15);
            color: #facc15;
            border: 1px solid rgba(250, 204, 21, 0.4);
        }
        .adm-body {
            padding: 14px;
        }
        .adm-stats-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            margin-bottom: 14px;
        }
        .adm-stat-card {
            background: #11161f;
            border: 1px solid #242d3b;
            border-radius: 6px;
            padding: 10px 12px;
        }
        .adm-stat-label {
            font-size: 12px;
            color: #94a3b8;
        }
        .adm-stat-val {
            font-size: 18px;
            font-weight: bold;
            color: #f8fafc;
            margin-top: 2px;
        }
        .adm-quota-box {
            background: #0f1520;
            border: 1px solid #263244;
            border-radius: 6px;
            padding: 11px 13px;
            margin-bottom: 14px;
            font-size: 13px;
            line-height: 1.65;
        }
        .adm-quota-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 6px;
        }
        .adm-qtag {
            background: #161f2e;
            border: 1px solid #2c3b52;
            border-radius: 5px;
            padding: 4px 9px;
            font-size: 12.5px;
        }
        .adm-alert {
            padding: 10px 12px;
            border-radius: 6px;
            font-size: 13.5px;
            font-weight: bold;
            margin-bottom: 14px;
            text-align: center;
        }
        .adm-alert-ok {
            background: rgba(22, 163, 74, 0.16);
            color: #4ade80;
            border: 1px solid rgba(74, 222, 128, 0.45);
        }
        .adm-alert-err {
            background: rgba(220, 38, 38, 0.18);
            color: #fca5a5;
            border: 1px solid rgba(248, 113, 113, 0.45);
        }
        .adm-toolbar {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 14px;
        }
        .adm-search-input {
            flex: 1;
            min-width: 200px;
            background: #06080b;
            color: #f8fafc;
            border: 1px solid #334155;
            border-radius: 6px;
            padding: 8px 11px;
            font-size: 13.5px;
        }
        .adm-search-input:focus {
            outline: none;
            border-color: #4ade80;
        }
        .adm-toggle-self-btn {
            background: #161f2e;
            color: #e2e8f0;
            border: 1px solid #334155;
            border-radius: 6px;
            padding: 8px 11px;
            font-size: 12.5px;
            font-weight: bold;
            cursor: pointer;
        }
        .adm-toggle-self-btn:hover {
            border-color: #4ade80;
            color: #4ade80;
        }
        .adm-user-card {
            background: #10151d;
            border: 1px solid #263040;
            border-radius: 8px;
            padding: 13px;
            margin-bottom: 12px;
            transition: border-color 0.15s ease;
        }
        .adm-user-card:hover {
            border-color: #3b4b63;
        }
        .adm-user-card.is-banned {
            background: #190b0e;
            border-color: #7f1d1d;
        }
        .adm-user-card.is-self-hidden {
            display: none;
        }
        .adm-user-top {
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
            padding-bottom: 10px;
            margin-bottom: 11px;
            border-bottom: 1px solid #1e2736;
        }
        .adm-user-identity {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 7px;
            font-size: 14.5px;
        }
        .adm-uid {
            color: #38bdf8;
            font-weight: bold;
        }
        .adm-styled-nick {
            font-size: 15px;
            display: inline-flex;
            align-items: center;
        }
        .adm-styled-nick a {
            text-decoration: none;
        }
        .adm-role-badge {
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
        }
        .adm-ban-badge {
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 11.5px;
            font-weight: bold;
            background: #dc2626;
            color: #fff;
        }
        .adm-online-pill {
            font-size: 13px;
            color: #38bdf8;
            font-weight: bold;
            background: rgba(56, 189, 248, 0.1);
            padding: 3px 8px;
            border-radius: 5px;
        }
        .adm-fields-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
            margin-bottom: 10px;
        }
        .adm-extra-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            margin-bottom: 10px;
            padding: 9px;
            background: #0c1017;
            border: 1px dashed #253042;
            border-radius: 6px;
        }
        @media (max-width: 600px) {
            .adm-stats-grid { grid-template-columns: 1fr; }
            .adm-fields-grid { grid-template-columns: repeat(2, 1fr); }
            .adm-extra-grid { grid-template-columns: 1fr; }
        }
        .adm-field {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .adm-field label {
            font-size: 12.5px;
            color: #cbd5e1;
            font-weight: bold;
        }
        .adm-input, .adm-select {
            width: 100%;
            box-sizing: border-box;
            background: #06080c;
            border: 1px solid #334155;
            border-radius: 5px;
            padding: 7px 8px;
            font-size: 13.5px;
            font-weight: bold;
        }
        .adm-input:focus, .adm-select:focus {
            outline: none;
            border-color: #38bdf8;
        }
        .adm-row-actions {
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
            margin-bottom: 10px;
        }
        .adm-role-group {
            display: flex;
            align-items: center;
            gap: 8px;
            flex: 1;
            min-width: 210px;
        }
        .adm-role-group span {
            font-size: 13px;
            color: #cbd5e1;
            font-weight: bold;
            white-space: nowrap;
        }
        .adm-btn {
            border: none;
            border-radius: 5px;
            padding: 8px 13px;
            font-size: 13px;
            font-weight: bold;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 5px;
        }
        .adm-btn-save {
            background: #2563eb;
            color: #ffffff;
        }
        .adm-btn-save:hover {
            background: #3b82f6;
        }
        .adm-ban-panel {
            background: #151015;
            border: 1px solid #382636;
            border-radius: 6px;
            padding: 10px;
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
        }
        .adm-ban-form {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 7px;
            flex: 1;
            min-width: 240px;
            margin: 0;
        }
        .adm-ban-reason {
            flex: 1;
            min-width: 150px;
            background: #090608;
            color: #fecaca;
            border: 1px solid #6b2121;
            border-radius: 5px;
            padding: 7px 9px;
            font-size: 13px;
        }
        .adm-btn-ban {
            background: #dc2626;
            color: #ffffff;
        }
        .adm-btn-ban:hover {
            background: #ef4444;
        }
        .adm-btn-unban {
            background: #16a34a;
            color: #ffffff;
        }
        .adm-btn-unban:hover {
            background: #22c55e;
        }
        .adm-ban-locked {
            font-size: 12.5px;
            color: #fca5a5;
            font-weight: bold;
        }
        .adm-del-form {
            display: inline-flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 6px;
            margin: 0;
        }
        .adm-btn-del {
            background: #451a1a;
            color: #fca5a5;
            border: 1px solid #991b1b;
        }
        .adm-btn-del:hover {
            background: #7f1d1d;
            color: #ffffff;
        }
        .adm-btn-del-acc {
            background: #7f1d1d;
            color: #ffffff;
            border: 1px solid #ef4444;
        }
        .adm-btn-del-acc:hover {
            background: #b91c1c;
        }
    </style>

    <div class="adm-shell">
        <div class="adm-header">
            <h2 class="adm-title">⚙️ Bảng Quản Trị Hệ Thống</h2>
            <span class="adm-role-pill">${escapeHtml(actorCfg.label)}</span>
        </div>

        <div class="adm-body">
            <div class="adm-stats-grid">
                <div class="adm-stat-card">
                    <div class="adm-stat-label">Tổng thành viên</div>
                    <div class="adm-stat-val">${totalUsers}</div>
                </div>
                <div class="adm-stat-card">
                    <div class="adm-stat-label">Ban quản trị</div>
                    <div class="adm-stat-val" style="color:#facc15;">${totalStaff}</div>
                </div>
                <div class="adm-stat-card">
                    <div class="adm-stat-label">Đang bị Ban ID</div>
                    <div class="adm-stat-val" style="color:#f87171;">${totalBanned}</div>
                </div>
            </div>

            <div class="adm-quota-box">
                <div>Xin chào <b>${escapeHtml(user.display_name || user.username)}</b> — Hạn mức quyền của cấp bậc <b>${escapeHtml(actorCfg.label)}</b>:</div>
                <div class="adm-quota-tags">
                    <span class="adm-qtag">Level: <b style="color:#4ade80;">${escapeHtml(maxLvlDisplay)}</b></span>
                    <span class="adm-qtag">Max Xu: <b style="color:#4ade80;">${escapeHtml(maxCoinDisplay)}</b></span>
                    <span class="adm-qtag">Max Vàng: <b style="color:#fbbf24;">${escapeHtml(maxGoldDisplay)}</b></span>
                    <span class="adm-qtag">Max Online: <b style="color:#38bdf8;">${escapeHtml(maxOnlineDisplay)}</b></span>
                </div>
                <div style="margin-top:6px;font-size:12.5px;color:#94a3b8;">Auto Level theo online: Tạo nick Lv.1 · 10 phút lên Lv.10 · Thành viên tối đa Lv.99.</div>
            </div>

            ${message}

            <div class="adm-toolbar">
                <input type="text" id="admSearchInput" class="adm-search-input" placeholder="🔍 Tìm theo ID, tên nick hoặc cấp bậc..." oninput="filterAdminUsers()">
                ${isFounder ? `<button type="button" id="admToggleSelfBtn" class="adm-toggle-self-btn" onclick="toggleSelfCard()">👁 Hiện nick của tôi</button>` : ''}
            </div>

            <div id="admUsersContainer">
                ${usersList.map(u => {
                    const uid = Number(u.id || 0);
                    const isSelf = uid === currentUserId;
                    const uTier = getRoleTier(u);
                    const uRoleLabel = getRoleConfig(u).label;
                    const uCoins = Number(u.coins || 0);
                    const uGold = Number(u.gold || 0);
                    const uLevel = Number(u.level || 1);
                    const uOnlineMins = Number(u.online_minutes || 0);
                    const isBanned = Number(u.is_banned || 0) === 1;
                    const perm = canManageTargetUser(user, u);
                    const showBanControls = actorCfg.canBan || isFounder;
                    const bannedByFounderFlag = founderIds.has(Number(u.banned_by || 0));
                    const canUnbanThis = isFounder ? perm.allowed : (isSuperAdmin ? (perm.allowed && !bannedByFounderFlag) : false);
                    const styledNickHtml = renderStyledNickWithoutStaffBadge(u);
                    const searchBlob = `${uid} ${u.display_name || ''} ${uRoleLabel}`.toLowerCase();
                    const hideSelfClass = (isFounder && isSelf) ? 'is-self-hidden adm-self-card' : '';

                    return `
                    <div class="adm-user-card ${isBanned ? 'is-banned' : ''} ${hideSelfClass}" data-search="${escapeHtml(searchBlob)}">
                        <div class="adm-user-top">
                            <div class="adm-user-identity">
                                <span class="adm-uid">ID #${uid}</span>
                                <span class="adm-styled-nick">${styledNickHtml}</span>
                                <span class="adm-role-badge" style="${getRoleBadgeStyle(uTier)}">${escapeHtml(uRoleLabel)}</span>
                                ${isBanned ? `<span class="adm-ban-badge">⛔ ĐÃ BAN ID</span>` : ''}
                            </div>
                            <span class="adm-online-pill">⏱ Online: ${uOnlineMins} phút</span>
                        </div>

                        ${isBanned && u.ban_reason ? `
                            <div style="background:rgba(220,38,38,0.14);border-left:3px solid #ef4444;padding:7px 10px;border-radius:4px;margin-bottom:10px;font-size:13px;color:#fca5a5;">
                                Lý do Ban ID: <b>${escapeHtml(u.ban_reason)}</b>
                            </div>
                        ` : ''}

                        ${perm.allowed ? `
                            <form method="POST" style="margin:0;">
                                <input type="hidden" name="action_type" value="update_user">
                                <input type="hidden" name="user_id" value="${uid}">

                                <div class="adm-fields-grid">
                                    <div class="adm-field">
                                        <label>Level</label>
                                        <input type="number" name="level" value="${uLevel}" min="1" class="adm-input" style="color:#ffffff;">
                                    </div>
                                    <div class="adm-field">
                                        <label>Xu</label>
                                        <input type="number" name="coins" value="${uCoins}" min="0" class="adm-input" style="color:#4ade80;">
                                    </div>
                                    <div class="adm-field">
                                        <label>Vàng</label>
                                        <input type="number" name="gold" value="${uGold}" min="0" class="adm-input" style="color:#fbbf24;">
                                    </div>
                                    <div class="adm-field">
                                        <label>Online (phút)</label>
                                        <input type="number" name="online_minutes" value="${uOnlineMins}" min="0" class="adm-input" style="color:#38bdf8;">
                                    </div>
                                </div>

                                ${isFounder ? `
                                    <div class="adm-extra-grid">
                                        <div class="adm-field">
                                            <label>Tên hiển thị (DB)</label>
                                            <input type="text" name="display_name" value="${escapeHtml(u.display_name || '')}" class="adm-input" style="color:#f8fafc;">
                                        </div>
                                        <div class="adm-field">
                                            <label>Giới tính (DB)</label>
                                            <select name="gender" class="adm-select" style="color:#e2e8f0;">
                                                <option value="male" ${String(u.gender || 'male').toLowerCase() === 'male' || String(u.gender || '').toLowerCase() === 'nam' ? 'selected' : ''}>Nam (male)</option>
                                                <option value="female" ${String(u.gender || '').toLowerCase() === 'female' || String(u.gender || '').toLowerCase() === 'nữ' || String(u.gender || '').toLowerCase() === 'nu' ? 'selected' : ''}>Nữ (female)</option>
                                            </select>
                                        </div>
                                        <div class="adm-field">
                                            <label>Vị trí hiện tại (DB)</label>
                                            <input type="text" name="current_location" value="${escapeHtml(u.current_location || 'Trang chủ')}" class="adm-input" style="color:#fbbf24;">
                                        </div>
                                        <div class="adm-field">
                                            <label>Tâm trạng (DB)</label>
                                            <input type="text" name="mood" value="${escapeHtml(u.mood || '')}" class="adm-input" style="color:#cbd5e1;">
                                        </div>
                                        <div class="adm-field">
                                            <label>Màu tên &amp; Glow tên</label>
                                            <div style="display:flex;gap:4px;">
                                                <input type="text" name="name_color" value="${escapeHtml(u.name_color || '#00ff00')}" placeholder="#00ff00" class="adm-input" style="color:#4ade80;">
                                                <input type="text" name="name_glow" value="${escapeHtml(u.name_glow || '#000000')}" placeholder="Glow" class="adm-input" style="color:#f472b6;">
                                            </div>
                                        </div>
                                        <div class="adm-field">
                                            <label>Viền tên / Glow viền / Icon</label>
                                            <div style="display:flex;gap:4px;">
                                                <input type="text" name="name_border" value="${escapeHtml(u.name_border || '#000000')}" placeholder="Viền tên" class="adm-input" style="color:#38bdf8;">
                                                <input type="text" name="name_border_glow" value="${escapeHtml(u.name_border_glow || '#000000')}" placeholder="Glow viền" class="adm-input" style="color:#c084fc;">
                                                <input type="text" name="active_icon" value="${escapeHtml(u.active_icon || '')}" placeholder="Icon" class="adm-input" style="color:#fff;">
                                            </div>
                                        </div>
                                    </div>
                                    <input type="hidden" name="border_color" value="${escapeHtml(u.border_color || '#ffcc00')}">
                                    <input type="hidden" name="avatar_glow" value="${escapeHtml(u.avatar_glow || '#000000')}">
                                ` : ''}

                                <div class="adm-row-actions">
                                    <div class="adm-role-group">
                                        <span>Cấp bậc:</span>
                                        <select name="role" class="adm-select" style="color:#facc15;" ${actorCfg.canChangeRoles ? '' : 'disabled'}>
                                            ${roleOptionsHtml(uRoleLabel)}
                                        </select>
                                    </div>
                                    <button type="submit" class="adm-btn adm-btn-save">💾 Lưu thay đổi</button>
                                </div>
                            </form>

                            <div class="adm-ban-panel">
                                ${showBanControls ? `
                                    ${isBanned ? (
                                        canUnbanThis ? `
                                            <form method="POST" class="adm-ban-form">
                                                <input type="hidden" name="user_id" value="${uid}">
                                                <input type="hidden" name="action_type" value="unban_user">
                                                <button type="submit" class="adm-btn adm-btn-unban">🔓 Gỡ Ban ID</button>
                                            </form>
                                        ` : `
                                            <span class="adm-ban-locked">🔒 Bị Người Sáng Lập Ban — không thể gỡ Ban</span>
                                        `
                                    ) : `
                                        <form method="POST" class="adm-ban-form">
                                            <input type="hidden" name="user_id" value="${uid}">
                                            <input type="hidden" name="action_type" value="ban_user">
                                            <input type="text" name="ban_reason" value="${escapeHtml(u.ban_reason || '')}" placeholder="Nhập lý do Ban ID..." class="adm-ban-reason">
                                            <button type="submit" class="adm-btn adm-btn-ban">⛔ Ban ID</button>
                                        </form>
                                    `}
                                ` : ''}

                                <form method="POST" onsubmit="return confirm('Xóa dữ liệu đã chọn của ID #${uid}?');" class="adm-del-form">
                                    <input type="hidden" name="user_id" value="${uid}">
                                    <input type="hidden" name="action_type" value="delete_user_content">
                                    <select name="delete_scope" class="adm-select" style="width:auto;color:#e2e8f0;padding:6px 8px;">
                                        <option value="all">Tin nhắn &amp; Bảng tin</option>
                                        <option value="mail">Chỉ Tin nhắn</option>
                                        <option value="feed">Chỉ Bảng tin</option>
                                    </select>
                                    <button type="submit" class="adm-btn adm-btn-del">🗑 Xóa mục</button>
                                </form>

                                ${isFounder && !isSelf ? `
                                    <form method="POST" onsubmit="return confirm('CẢNH BÁO: Xóa vĩnh viễn tài khoản ID #${uid} khỏi DB?');" class="adm-del-form">
                                        <input type="hidden" name="user_id" value="${uid}">
                                        <input type="hidden" name="action_type" value="delete_user_account">
                                        <button type="submit" class="adm-btn adm-btn-del-acc">❌ Xóa tài khoản</button>
                                    </form>
                                ` : ''}
                            </div>
                        ` : `
                            <div style="color:#94a3b8;font-size:13px;padding:6px 0;">🔒 Tài khoản có cấp bậc cao hơn hoặc ngang hàng — bạn chỉ có thể xem.</div>
                        `}
                    </div>
                    `;
                }).join('')}
            </div>
        </div>
    </div>

    <script>
        var __showSelfCard = false;

        function applyFilters() {
            var q = (document.getElementById('admSearchInput').value || '').trim().toLowerCase();
            var cards = document.querySelectorAll('#admUsersContainer .adm-user-card');
            for (var i = 0; i < cards.length; i++) {
                var card = cards[i];
                var isSelf = card.classList.contains('adm-self-card');
                if (isSelf && !__showSelfCard) {
                    card.style.display = 'none';
                    continue;
                }
                var hay = card.getAttribute('data-search') || '';
                card.style.display = (!q || hay.indexOf(q) !== -1) ? '' : 'none';
            }
        }

        function filterAdminUsers() {
            applyFilters();
        }

        function toggleSelfCard() {
            __showSelfCard = !__showSelfCard;
            var btn = document.getElementById('admToggleSelfBtn');
            if (btn) {
                btn.textContent = __showSelfCard ? '🙈 Ẩn nick của tôi' : '👁 Hiện nick của tôi';
            }
            applyFilters();
        }
    </script>

    <div style="text-align: center; margin-top: 14px;"><a href="/">⬅️ Về trang chủ</a></div>
    `;

    return new Response(renderLayout('Quản trị viên', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
