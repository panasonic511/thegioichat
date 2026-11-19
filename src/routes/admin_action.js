import {
    ROLE_TIERS,
    getRoleTier,
    getRoleConfig,
    normalizeRoleKey,
    canManageTargetUser,
    sanitizeManagementUpdates,
    applyBanIdAction
} from '../roles_system.js';

export async function handleAdminAction(request, env, user) {
    const actorTier = getRoleTier(user);
    if (!user || actorTier < ROLE_TIERS.MOD) {
        return new Response("Bạn không có quyền thực hiện hành động này!", { status: 403 });
    }

    const formData = await request.formData();
    const actionType = String(formData.get('action_type') || 'update_user').trim();
    const targetUserId = parseInt(formData.get('user_id') || '0', 10);

    if (!targetUserId || Number.isNaN(targetUserId)) {
        return new Response("Dữ liệu không hợp lệ! <a href='/admin'>Quay lại</a>", { status: 400 });
    }

    const targetUser = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(targetUserId).first();
    if (!targetUser) {
        return new Response("Không tìm thấy thành viên! <a href='/admin'>Quay lại</a>", { status: 404 });
    }

    if (actionType === 'ban_user' || actionType === 'unban_user') {
        const isBan = actionType === 'ban_user';
        const reason = String(formData.get('ban_reason') || '').trim();
        const banRes = await applyBanIdAction(env, user, targetUser, isBan, reason);
        if (!banRes.ok) {
            return new Response(`${banRes.error} <a href='/admin'>Quay lại</a>`, { status: 403 });
        }
        return Response.redirect(new URL('/admin', request.url), 302);
    }

    const check = canManageTargetUser(user, targetUser);
    if (!check.allowed) {
        return new Response(`${check.reason} <a href='/admin'>Quay lại</a>`, { status: 403 });
    }

    const newRoleRaw = formData.get('new_role') ?? formData.get('role');
    let nextRole = targetUser.role || 'Thành Viên';
    let defaultRoleLevel = null;

    if (newRoleRaw !== null && String(newRoleRaw).trim() !== '') {
        const actorCfg = getRoleConfig(user);
        const roleKey = normalizeRoleKey(newRoleRaw);
        if (!actorCfg.canChangeRoles) {
            return new Response("Cấp bậc hiện tại không được thay đổi chức vụ! <a href='/admin'>Quay lại</a>", { status: 403 });
        }
        if ((roleKey === 'founder' || roleKey === 'super_admin') && !actorCfg.canAssignFounderOrSuperAdmin) {
            return new Response("Không được gán cấp bậc Người Sáng Lập hoặc Super Admin! <a href='/admin'>Quay lại</a>", { status: 403 });
        }

        if (roleKey === 'founder') {
            nextRole = 'Người Sáng Lập';
            defaultRoleLevel = 135;
        } else if (roleKey === 'super_admin') {
            nextRole = 'Super Admin';
            defaultRoleLevel = 129;
        } else if (roleKey === 'admin') {
            nextRole = 'Admin';
            defaultRoleLevel = 125;
        } else if (roleKey === 'mod') {
            nextRole = 'Mod';
            defaultRoleLevel = 120;
        } else {
            nextRole = 'Thành Viên';
            defaultRoleLevel = 1;
        }
    }

    const rawLevel = formData.get('level');
    const chosenLevel = (rawLevel !== null && String(rawLevel).trim() !== '')
        ? rawLevel
        : (defaultRoleLevel !== null ? defaultRoleLevel : targetUser.level);

    const sanitized = sanitizeManagementUpdates(user, targetUser, {
        role: nextRole,
        level: chosenLevel,
        coins: formData.get('coins'),
        gold: formData.get('gold'),
        online_minutes: formData.get('online_minutes')
    });

    if (!sanitized.ok) {
        return new Response(`${sanitized.error} <a href='/admin'>Quay lại</a>`, { status: 403 });
    }

    const u = sanitized.updates;
    const finalRole = u.role ?? targetUser.role;
    const finalLevel = u.level ?? Number(targetUser.level || 1);
    const finalCoins = u.coins ?? Number(targetUser.coins || 0);
    const finalGold = u.gold ?? Number(targetUser.gold || 0);
    const finalOnlineMins = u.online_minutes ?? Number(targetUser.online_minutes || 0);

    try {
        await env.DB.prepare("ALTER TABLE users ADD COLUMN gold INTEGER DEFAULT 0").run();
    } catch (e) {}
    try {
        await env.DB.prepare("ALTER TABLE users ADD COLUMN online_minutes INTEGER DEFAULT 0").run();
    } catch (e) {}

    try {
        await env.DB.prepare(`
            UPDATE users
            SET role = ?, level = ?, coins = ?, gold = ?, online_minutes = ?
            WHERE id = ?
        `).bind(finalRole, finalLevel, finalCoins, finalGold, finalOnlineMins, targetUserId).run();
    } catch (e) {
        await env.DB.prepare(`
            UPDATE users
            SET role = ?, level = ?, coins = ?
            WHERE id = ?
        `).bind(finalRole, finalLevel, finalCoins, targetUserId).run();
    }

    return Response.redirect(new URL('/admin', request.url), 302);
}
