export const ROLE_TIERS = {
    FOUNDER: 5,      // Người Sáng Lập
    SUPER_ADMIN: 4,  // Super Admin
    ADMIN: 3,        // Admin
    MOD: 2,          // Mod
    MEMBER: 1        // Thành Viên
};

export const ROLE_LIMITS = {
    [ROLE_TIERS.FOUNDER]: {
        key: 'founder',
        label: 'Người Sáng Lập',
        badge: 'FOUNDER',
        maxLevel: Infinity,
        maxCoin: Number.MAX_SAFE_INTEGER,
        maxGold: Number.MAX_SAFE_INTEGER,
        maxOnlineMinutes: Number.MAX_SAFE_INTEGER,
        canEditHigherOrEqual: true,
        canChangeRoles: true,
        canAssignFounderOrSuperAdmin: true,
        canEditAllDbFields: true,
        canBan: true
    },
    [ROLE_TIERS.SUPER_ADMIN]: {
        key: 'super_admin',
        label: 'Super Admin',
        badge: 'S.ADMIN',
        maxLevel: 129,
        maxCoin: 9999999,
        maxGold: 999999,
        maxOnlineMinutes: 10000,
        canEditHigherOrEqual: false,
        canChangeRoles: true,
        canAssignFounderOrSuperAdmin: false,
        canEditAllDbFields: true,
        canBan: true
    },
    [ROLE_TIERS.ADMIN]: {
        key: 'admin',
        label: 'Admin',
        badge: 'ADMIN',
        maxLevel: 125,
        maxCoin: 1000000,
        maxGold: 200000,
        maxOnlineMinutes: 5000,
        canEditHigherOrEqual: false,
        canChangeRoles: false,
        canAssignFounderOrSuperAdmin: false,
        canEditAllDbFields: true,
        canBan: true
    },
    [ROLE_TIERS.MOD]: {
        key: 'mod',
        label: 'Mod',
        badge: 'MOD',
        maxLevel: 120,
        maxCoin: 3000000,
        maxGold: 99999,
        maxOnlineMinutes: 1000,
        canEditHigherOrEqual: false,
        canChangeRoles: false,
        canAssignFounderOrSuperAdmin: false,
        canEditAllDbFields: true,
        canBan: true
    },
    [ROLE_TIERS.MEMBER]: {
        key: 'member',
        label: 'Thành Viên',
        badge: '',
        maxLevel: 99,
        maxCoin: 0,
        maxGold: 0,
        maxOnlineMinutes: 0,
        canEditHigherOrEqual: false,
        canChangeRoles: false,
        canAssignFounderOrSuperAdmin: false,
        canEditAllDbFields: false,
        canBan: false
    }
};

export function normalizeRoleKey(roleInput, isAdminFlag = 0, userId = 0) {
    const uid = Number(userId || 0);
    const raw = String(roleInput || '').trim().toLowerCase();

    if (
        uid === 1 ||
        raw === 'người sáng lập' ||
        raw === 'nguoi sang lap' ||
        raw === 'founder' ||
        raw === 'chủ wap' ||
        raw === 'chu wap'
    ) {
        return 'founder';
    }

    if (
        raw === 'super admin' ||
        raw === 'super_admin' ||
        raw === 'superadmin' ||
        raw === 's.admin' ||
        raw === 'sadmin' ||
        raw === 'smod'
    ) {
        return 'super_admin';
    }

    if (
        raw === 'admin' ||
        raw === 'quản trị' ||
        raw === 'quan tri' ||
        raw === 'quản lý' ||
        raw === 'quan ly' ||
        raw === 'bqt' ||
        Number(isAdminFlag || 0) === 1
    ) {
        return 'admin';
    }

    if (
        raw === 'mod' ||
        raw === 'điều hành viên' ||
        raw === 'dieu hanh vien'
    ) {
        return 'mod';
    }

    return 'member';
}

export function getRoleTier(userObj) {
    if (!userObj) return ROLE_TIERS.MEMBER;
    const uid = Number(userObj.id || userObj.user_id || 0);
    const key = normalizeRoleKey(userObj.role, userObj.is_admin, uid);
    if (key === 'founder') return ROLE_TIERS.FOUNDER;
    if (key === 'super_admin') return ROLE_TIERS.SUPER_ADMIN;
    if (key === 'admin') return ROLE_TIERS.ADMIN;
    if (key === 'mod') return ROLE_TIERS.MOD;
    return ROLE_TIERS.MEMBER;
}

export function getRoleConfig(userObj) {
    const tier = getRoleTier(userObj);
    return ROLE_LIMITS[tier] || ROLE_LIMITS[ROLE_TIERS.MEMBER];
}

export function isStaffRole(userObj) {
    return getRoleTier(userObj) >= ROLE_TIERS.MOD;
}

/**
 * Tính level theo thời gian online:
 * - Mới tạo (0 phút): Level 1
 * - 10 phút: Level 10 (+9 level mỗi 10 phút)
 * - Thành viên tối đa: Level 99
 */
export function calculateOnlineLevel(onlineMinutes, userObj = null) {
    const mins = Math.max(0, Number(onlineMinutes || 0));
    const blocksOfTen = Math.floor(mins / 10);
    const calculated = 1 + blocksOfTen * 9;

    const tier = userObj ? getRoleTier(userObj) : ROLE_TIERS.MEMBER;
    if (tier === ROLE_TIERS.MEMBER) {
        return Math.min(99, calculated);
    }
    return calculated;
}

export async function syncUserOnlineAndLevel(env, userObj, deltaMinutes = 0) {
    if (!env || !env.DB || !userObj || !userObj.id) return userObj;
    const uid = Number(userObj.id);
    const addMins = Math.max(0, Number(deltaMinutes || 0));
    const nowSec = Math.floor(Date.now() / 1000);

    try {
        await env.DB.prepare(`ALTER TABLE users ADD COLUMN online_minutes INTEGER DEFAULT 0`).run();
    } catch (e) {}
    try {
        await env.DB.prepare(`ALTER TABLE users ADD COLUMN last_seen INTEGER DEFAULT 0`).run();
    } catch (e) {}
    try {
        await env.DB.prepare(`ALTER TABLE users ADD COLUMN is_banned INTEGER DEFAULT 0`).run();
    } catch (e) {}
    try {
        await env.DB.prepare(`ALTER TABLE users ADD COLUMN ban_reason TEXT DEFAULT ''`).run();
    } catch (e) {}
    try {
        await env.DB.prepare(`ALTER TABLE users ADD COLUMN banned_by INTEGER DEFAULT 0`).run();
    } catch (e) {}
    try {
        await env.DB.prepare(`ALTER TABLE users ADD COLUMN banned_at INTEGER DEFAULT 0`).run();
    } catch (e) {}

    let currentMinutes = Number(userObj.online_minutes || 0);
    const prevLastSeen = Number(userObj.last_seen || 0);

    if (addMins > 0) {
        currentMinutes += addMins;
    } else if (prevLastSeen > 0 && nowSec > prevLastSeen) {
        const diffMins = Math.floor((nowSec - prevLastSeen) / 60);
        if (diffMins > 0 && diffMins <= 30) {
            currentMinutes += diffMins;
        }
    }

    const tier = getRoleTier(userObj);
    const canonicalRoleLabel = getRoleConfig(userObj).label;
    const currentDbLevel = Number(userObj.level || 1);
    const autoLevel = calculateOnlineLevel(currentMinutes, userObj);

    let nextLevel = currentDbLevel;
    if (tier === ROLE_TIERS.MEMBER) {
        nextLevel = Math.min(99, Math.max(1, currentDbLevel >= 100 ? currentDbLevel : autoLevel));
    } else {
        nextLevel = Math.max(1, currentDbLevel, autoLevel);
    }

    try {
        await env.DB.prepare(`
            UPDATE users
            SET online_minutes = ?, level = ?, last_seen = ?
            WHERE id = ?
        `).bind(currentMinutes, nextLevel, nowSec, uid).run();
    } catch (e) {}

    return {
        ...userObj,
        role: userObj.role || canonicalRoleLabel,
        online_minutes: currentMinutes,
        level: nextLevel,
        last_seen: nowSec
    };
}

/**
 * Kiểm tra quyền thao tác của actor lên targetUser
 */
export function canManageTargetUser(actor, targetUser) {
    const actorTier = getRoleTier(actor);
    if (actorTier < ROLE_TIERS.MOD) {
        return { allowed: false, reason: 'Bạn không có quyền quản trị.' };
    }
    if (actorTier === ROLE_TIERS.FOUNDER) {
        return { allowed: true, reason: '' };
    }
    const targetTier = getRoleTier(targetUser);
    if (targetTier >= actorTier) {
        return { allowed: false, reason: 'Bạn không thể thao tác trên người có cấp bậc cao hơn hoặc ngang hàng.' };
    }
    return { allowed: true, reason: '' };
}

/**
 * Chuẩn hóa & giới hạn giá trị chỉnh sửa theo quyền của actor
 */
export function sanitizeManagementUpdates(actor, targetUser, payload = {}) {
    const check = canManageTargetUser(actor, targetUser);
    if (!check.allowed) {
        return { ok: false, error: check.reason, updates: {} };
    }

    const actorCfg = getRoleConfig(actor);
    const targetCfg = getRoleConfig(targetUser);
    const updates = {};

    // 1. Cấp bậc (role)
    if (payload.role !== undefined && String(payload.role).trim() !== '') {
        if (!actorCfg.canChangeRoles) {
            return { ok: false, error: 'Cấp bậc hiện tại của bạn không được đổi cấp bậc thành viên.', updates: {} };
        }
        const nextRoleKey = normalizeRoleKey(payload.role);
        if ((nextRoleKey === 'founder' || nextRoleKey === 'super_admin') && !actorCfg.canAssignFounderOrSuperAdmin) {
            return { ok: false, error: 'Bạn không thể gán cấp bậc Người Sáng Lập hoặc Super Admin.', updates: {} };
        }
        updates.role = ROLE_LIMITS[
            nextRoleKey === 'founder' ? ROLE_TIERS.FOUNDER :
            nextRoleKey === 'super_admin' ? ROLE_TIERS.SUPER_ADMIN :
            nextRoleKey === 'admin' ? ROLE_TIERS.ADMIN :
            nextRoleKey === 'mod' ? ROLE_TIERS.MOD :
            ROLE_TIERS.MEMBER
        ].label;
    }

    // 2. Level
    if (payload.level !== undefined && payload.level !== '') {
        let lvl = parseInt(payload.level, 10);
        if (!Number.isNaN(lvl)) {
            lvl = Math.max(1, lvl);
            const cap = Number.isFinite(actorCfg.maxLevel) ? actorCfg.maxLevel : Infinity;
            if (lvl > cap) lvl = cap;
            updates.level = lvl;
        }
    }

    // 3. Coin (Xu wap)
    if (payload.coins !== undefined && payload.coins !== '') {
        let coins = parseInt(payload.coins, 10);
        if (!Number.isNaN(coins)) {
            coins = Math.max(0, coins);
            if (coins > actorCfg.maxCoin) coins = actorCfg.maxCoin;
            updates.coins = coins;
        }
    }

    // 4. Gold (Vàng wap)
    if (payload.gold !== undefined && payload.gold !== '') {
        let gold = parseInt(payload.gold, 10);
        if (!Number.isNaN(gold)) {
            gold = Math.max(0, gold);
            if (gold > actorCfg.maxGold) gold = actorCfg.maxGold;
            updates.gold = gold;
        }
    }

    // 5. Thời gian online (phút)
    if (payload.online_minutes !== undefined && payload.online_minutes !== '') {
        let mins = parseInt(payload.online_minutes, 10);
        if (!Number.isNaN(mins)) {
            mins = Math.max(0, mins);
            if (mins > actorCfg.maxOnlineMinutes) mins = actorCfg.maxOnlineMinutes;
            updates.online_minutes = mins;
            if (updates.level === undefined) {
                const autoLvl = calculateOnlineLevel(mins, targetUser);
                const cap = Number.isFinite(actorCfg.maxLevel) ? actorCfg.maxLevel : Infinity;
                updates.level = Math.min(cap, Math.max(Number(targetUser.level || 1), autoLvl));
            }
        }
    }

    // 6. Các trường khác trong DB người dùng / mục của wap
    if (actorCfg.canEditAllDbFields && payload.extraFields && typeof payload.extraFields === 'object') {
        for (const [k, v] of Object.entries(payload.extraFields)) {
            if (v !== undefined) {
                updates[k] = v;
            }
        }
    }

    const effectiveTargetTier = updates.role
        ? getRoleTier({ ...targetUser, role: updates.role })
        : getRoleTier(targetUser);
    if (targetCfg && effectiveTargetTier >= getRoleTier(actor) && getRoleTier(actor) !== ROLE_TIERS.FOUNDER) {
        return { ok: false, error: 'Không thể hạ/nâng cấp bậc vượt quyền hạn.', updates: {} };
    }

    return { ok: true, error: '', updates };
}

/**
 * Thực thi Ban ID / Unban ID theo quyền của actor
 */
export async function applyBanIdAction(env, actor, targetUser, isBanned, reason = '') {
    const actorCfg = getRoleConfig(actor);
    if (!actorCfg.canBan) {
        return { ok: false, error: 'Cấp bậc của bạn không có quyền Ban ID.' };
    }

    const check = canManageTargetUser(actor, targetUser);
    if (!check.allowed) {
        return { ok: false, error: check.reason };
    }

    const banFlag = isBanned ? 1 : 0;
    const cleanReason = String(reason || (banFlag ? 'Vi phạm quy định cộng đồng' : '')).trim().slice(0, 255);
    const nowSec = Math.floor(Date.now() / 1000);

    try {
        await env.DB.prepare(`ALTER TABLE users ADD COLUMN is_banned INTEGER DEFAULT 0`).run();
    } catch (e) {}
    try {
        await env.DB.prepare(`ALTER TABLE users ADD COLUMN ban_reason TEXT DEFAULT ''`).run();
    } catch (e) {}
    try {
        await env.DB.prepare(`ALTER TABLE users ADD COLUMN banned_by INTEGER DEFAULT 0`).run();
    } catch (e) {}
    try {
        await env.DB.prepare(`ALTER TABLE users ADD COLUMN banned_at INTEGER DEFAULT 0`).run();
    } catch (e) {}

    await env.DB.prepare(`
        UPDATE users
        SET is_banned = ?, ban_reason = ?, banned_by = ?, banned_at = ?
        WHERE id = ?
    `).bind(
        banFlag,
        banFlag ? cleanReason : '',
        banFlag ? Number(actor.id || 0) : 0,
        banFlag ? nowSec : 0,
        Number(targetUser.id)
    ).run();

    return {
        ok: true,
        is_banned: banFlag,
        ban_reason: banFlag ? cleanReason : ''
    };
}
