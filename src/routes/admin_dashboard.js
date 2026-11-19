import {
    ROLE_TIERS,
    ROLE_LIMITS,
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

export async function handleAdminDashboard(request, env, user, renderLayout) {
    const actorTier = getRoleTier(user);
    if (!user || actorTier < ROLE_TIERS.MOD) {
        return new Response("Truy cập bị từ chối! Bạn không có quyền quản trị viên.", { status: 403 });
    }

    const actorCfg = getRoleConfig(user);
    let message = "";

    try {
        await env.DB.prepare("ALTER TABLE users ADD COLUMN gold INTEGER DEFAULT 0").run();
    } catch (e) {}
    try {
        await env.DB.prepare("ALTER TABLE users ADD COLUMN online_minutes INTEGER DEFAULT 0").run();
    } catch (e) {}
    try {
        await env.DB.prepare("ALTER TABLE users ADD COLUMN is_banned INTEGER DEFAULT 0").run();
    } catch (e) {}
    try {
        await env.DB.prepare("ALTER TABLE users ADD COLUMN ban_reason TEXT DEFAULT ''").run();
    } catch (e) {}

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
                const banRes = await applyBanIdAction(env, user, targetUser, isBan, reason);
                if (!banRes.ok) {
                    throw new Error(banRes.error);
                }
                message = `<div style="color: #00ff00; background: #001a00; padding: 8px; text-align: center; margin-bottom: 8px; border: 1px solid #006600;">✅ ${isBan ? `Đã Ban ID #${targetUserId}` : `Đã mở khóa ID #${targetUserId}`} thành công!</div>`;
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
                message = `<div style="color: #00ff00; background: #001a00; padding: 8px; text-align: center; margin-bottom: 8px; border: 1px solid #006600;">✅ Đã xóa dữ liệu mục chọn của ID #${targetUserId}!</div>`;
            } else {
                const sanitized = sanitizeManagementUpdates(user, targetUser, {
                    role: formData.get('role'),
                    level: formData.get('level'),
                    coins: formData.get('coins'),
                    gold: formData.get('gold'),
                    online_minutes: formData.get('online_minutes')
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

                await env.DB.prepare(`
                    UPDATE users
                    SET role = ?, level = ?, coins = ?, gold = ?, online_minutes = ?
                    WHERE id = ?
                `).bind(finalRole, finalLevel, finalCoins, finalGold, finalOnlineMins, targetUserId).run();

                message = `<div style="color: #00ff00; background: #001a00; padding: 8px; text-align: center; margin-bottom: 8px; border: 1px solid #006600;">✅ Đã cập nhật ID #${targetUserId} (Lv: ${finalLevel} | Xu: ${finalCoins} | Vàng: ${finalGold} | Online: ${finalOnlineMins}p)!</div>`;
            }
        } catch (e) {
            message = `<div style="color: #ff5555; background: #1a0000; padding: 8px; text-align: center; margin-bottom: 8px; border: 1px solid #660000;">❌ Lỗi: ${escapeHtml(e.message)}</div>`;
        }
    }

    let usersList = [];
    try {
        const res = await env.DB.prepare(`
            SELECT id, username, display_name, role, is_admin, coins, gold, level, online_minutes, is_banned, ban_reason
            FROM users
            ORDER BY id DESC
            LIMIT 80
        `).all();
        usersList = (res && Array.isArray(res.results)) ? res.results : [];
    } catch (e) {
        try {
            const res2 = await env.DB.prepare(`
                SELECT id, username, display_name, role, is_admin, coins, level
                FROM users
                ORDER BY id DESC
                LIMIT 80
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

    const maxLvlDisplay = Number.isFinite(actorCfg.maxLevel) ? actorCfg.maxLevel : 'Không giới hạn';
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
    <div class="box">
        <div class="box-title">⚙️ Bảng Quản Trị Hệ Thống (${escapeHtml(actorCfg.label)})</div>
        <div class="box-content">
            <div style="background: #12151b; border: 1px solid #2a313d; padding: 9px; font-size: 11px; margin-bottom: 10px; color: #e2e8f0; line-height: 1.6;">
                <div>💡 Xin chào <b>${escapeHtml(user.display_name || user.username)}</b> — Cấp bậc: <span style="color:#ffcc00;font-weight:bold;">${escapeHtml(actorCfg.label)}</span></div>
                <div>• Giới hạn Level: <b style="color:#4ade80;">${escapeHtml(String(maxLvlDisplay))}</b> | Max Xu: <b style="color:#4ade80;">${escapeHtml(maxCoinDisplay)}</b> | Max Vàng: <b style="color:#fbbf24;">${escapeHtml(maxGoldDisplay)}</b> | Max Online: <b style="color:#38bdf8;">${escapeHtml(maxOnlineDisplay)}</b></div>
                <div>• Tự động tăng Level theo online: Mới tạo Lv 1 · 10 phút lên Lv 10 · Thành viên tối đa Lv 99.</div>
            </div>

            ${message}

            <div style="font-weight: bold; color: #00ff00; margin-bottom: 8px; font-size: 12px;">👥 Danh sách thành viên (xếp từ cấp bậc & Level cao xuống thấp):</div>

            ${usersList.map(u => {
                const uid = Number(u.id || 0);
                const uRoleLabel = getRoleConfig(u).label;
                const uCoins = Number(u.coins || 0);
                const uGold = Number(u.gold || 0);
                const uLevel = Number(u.level || 1);
                const uOnlineMins = Number(u.online_minutes || 0);
                const isBanned = Number(u.is_banned || 0) === 1;
                const perm = canManageTargetUser(user, u);

                return `
                <div style="background: ${isBanned ? '#1b090c' : '#121212'}; border: 1px solid ${isBanned ? '#7f1d1d' : '#2d2d2d'}; border-radius: 4px; padding: 9px; margin-bottom: 8px; font-size: 11px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px; margin-bottom: 6px; flex-wrap: wrap;">
                        <div>
                            <b>ID #${uid}</b> - <span style="color:#fff;font-weight:bold;">${escapeHtml(u.display_name || u.username)}</span>
                            <span style="color:#94a3b8;">(${escapeHtml(u.username)})</span>
                            · <span style="color:#ffcc00;font-weight:bold;">${escapeHtml(uRoleLabel)}</span>
                            ${isBanned ? `<span style="background:#dc2626;color:#fff;padding:1px 5px;border-radius:3px;font-size:9px;font-weight:bold;margin-left:4px;">BANNED</span>` : ''}
                        </div>
                        <div style="color:#94a3b8;">Online: <b style="color:#38bdf8;">${uOnlineMins}p</b></div>
                    </div>

                    ${perm.allowed ? `
                        <form method="POST" style="margin: 0 0 6px 0; display: flex; flex-direction: column; gap: 6px;">
                            <input type="hidden" name="action_type" value="update_user">
                            <input type="hidden" name="user_id" value="${uid}">

                            <div style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center;">
                                <label>Level: <input type="number" name="level" value="${uLevel}" min="1" style="width: 58px; background: #000; color: #fff; border: 1px solid #444; padding: 2px 4px; border-radius: 3px;"></label>
                                <label>Xu: <input type="number" name="coins" value="${uCoins}" min="0" style="width: 82px; background: #000; color: #00ff00; border: 1px solid #444; padding: 2px 4px; border-radius: 3px;"></label>
                                <label>Vàng: <input type="number" name="gold" value="${uGold}" min="0" style="width: 74px; background: #000; color: #fbbf24; border: 1px solid #444; padding: 2px 4px; border-radius: 3px;"></label>
                                <label>Online (phút): <input type="number" name="online_minutes" value="${uOnlineMins}" min="0" style="width: 68px; background: #000; color: #38bdf8; border: 1px solid #444; padding: 2px 4px; border-radius: 3px;"></label>
                            </div>

                            <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 6px;">
                                <label>Cấp bậc:
                                    <select name="role" style="background: #000; color: #ffcc00; border: 1px solid #444; padding: 3px 5px; border-radius: 3px; font-size: 11px;" ${actorCfg.canChangeRoles ? '' : 'disabled'}>
                                        ${roleOptionsHtml(uRoleLabel)}
                                    </select>
                                </label>
                                <button type="submit" class="btn" style="background: #0055ff; color: #fff; padding: 3px 10px; font-size: 11px; border-radius: 3px;">Lưu thay đổi</button>
                            </div>
                        </form>

                        <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 6px; padding-top: 6px; border-top: 1px dashed #2a2a2a;">
                            ${actorCfg.canBan ? `
                                <form method="POST" style="margin: 0; display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px;">
                                    <input type="hidden" name="user_id" value="${uid}">
                                    <input type="hidden" name="action_type" value="${isBanned ? 'unban_user' : 'ban_user'}">
                                    ${!isBanned ? `<input type="text" name="ban_reason" value="${escapeHtml(u.ban_reason || '')}" placeholder="Lý do ban ID..." style="width: 120px; background: #000; color: #fca5a5; border: 1px solid #552222; padding: 2px 5px; border-radius: 3px; font-size: 10px;">` : ''}
                                    <button type="submit" class="btn" style="background: ${isBanned ? '#15803d' : '#991b1b'}; color: #fff; padding: 2px 8px; font-size: 10px; border-radius: 3px;">
                                        ${isBanned ? '🔓 Mở Ban ID' : '⛔ Ban ID'}
                                    </button>
                                </form>
                            ` : `<span style="color:#64748b;font-size:10px;">(Cấp bậc hiện tại không dùng Ban ID)</span>`}

                            <form method="POST" onsubmit="return confirm('Xóa dữ liệu mục đã chọn của ID #${uid}?');" style="margin: 0; display: inline-flex; align-items: center; gap: 4px;">
                                <input type="hidden" name="user_id" value="${uid}">
                                <input type="hidden" name="action_type" value="delete_user_content">
                                <select name="delete_scope" style="background: #000; color: #cbd5e1; border: 1px solid #444; padding: 2px 4px; border-radius: 3px; font-size: 10px;">
                                    <option value="all">Xóa tin nhắn & bảng tin</option>
                                    <option value="mail">Chỉ xóa tin nhắn</option>
                                    <option value="feed">Chỉ xóa bảng tin</option>
                                </select>
                                <button type="submit" class="btn" style="background: #3f1d1d; color: #fca5a5; border-color: #7f1d1d; padding: 2px 8px; font-size: 10px; border-radius: 3px;">🗑 Xóa mục</button>
                            </form>
                        </div>
                    ` : `
                        <div style="color: #64748b; font-size: 10px; font-style: italic;">🔒 Bạn không có quyền chỉnh sửa tài khoản cấp bậc cao hơn hoặc ngang hàng.</div>
                    `}
                </div>
                `;
            }).join('')}
        </div>
    </div>
    <div style="text-align: center;"><a href="/">⬅️ Về trang chủ</a></div>
    `;

    return new Response(renderLayout('Quản trị viên', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
