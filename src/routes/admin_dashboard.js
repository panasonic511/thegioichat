function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function isWapOwner(user) {
    if (!user) return false;
    if (Number(user.is_owner) === 1 || Number(user.id) === 1) return true;
    const role = String(user.role || '').trim().toLowerCase();
    return role === 'chủ wap' || role === 'chu wap' || role === 'owner';
}

async function getMaintenanceConfig(env) {
    let enabled = false;
    let message = 'Hệ thống đang bảo trì nâng cấp để phục vụ bạn tốt hơn. Vui lòng quay lại sau!';
    try {
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS site_settings (
                setting_key TEXT PRIMARY KEY,
                setting_value TEXT
            )
        `).run();

        const rows = await env.DB.prepare(`
            SELECT setting_key, setting_value
            FROM site_settings
            WHERE setting_key IN ('maintenance_mode', 'maintenance_message')
        `).all();

        for (const r of (rows.results || [])) {
            if (r.setting_key === 'maintenance_mode') {
                enabled = String(r.setting_value || '0') === '1';
            } else if (r.setting_key === 'maintenance_message' && r.setting_value) {
                message = String(r.setting_value);
            }
        }
    } catch (e) {}
    return { enabled, message };
}

async function setMaintenanceMode(env, enabled, message = null) {
    await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS site_settings (
            setting_key TEXT PRIMARY KEY,
            setting_value TEXT
        )
    `).run();

    const modeVal = enabled ? '1' : '0';
    await env.DB.prepare(`
        INSERT INTO site_settings (setting_key, setting_value)
        VALUES ('maintenance_mode', ?)
        ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value
    `).bind(modeVal).run();

    if (message !== null && String(message).trim() !== '') {
        await env.DB.prepare(`
            INSERT INTO site_settings (setting_key, setting_value)
            VALUES ('maintenance_message', ?)
            ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value
        `).bind(String(message).trim()).run();
    }
}

export async function handleAdminDashboard(request, env, user, renderLayout) {
    if (!user || (user.role !== 'Chủ Wap' && user.role !== 'Admin' && user.role !== 'Mod')) {
        return new Response("Truy cập bị từ chối! Bạn không có quyền quản trị viên.", { status: 403 });
    }

    const ownerCanToggleMaint = isWapOwner(user);
    let message = "";

    if (request.method === 'POST') {
        const formData = await request.formData();
        const action = formData.get('action');

        if (action === 'toggle_maintenance') {
            if (!ownerCanToggleMaint) {
                message = `<div style="color: #ff5555; background: #1a0000; padding: 6px; text-align: center; margin-bottom: 8px;">❌ Chỉ Chủ Wap mới có quyền bật/tắt chế độ bảo trì!</div>`;
            } else {
                try {
                    const enableMaint = String(formData.get('enable_maintenance')) === '1';
                    const maintMsg = String(formData.get('maintenance_message') || '');
                    await setMaintenanceMode(env, enableMaint, maintMsg);
                    message = `<div style="color: #00ff00; background: #001a00; padding: 6px; text-align: center; margin-bottom: 8px;">✅ Đã ${enableMaint ? 'BẬT' : 'TẮT'} chế độ bảo trì WAP thành công!</div>`;
                } catch (e) {
                    message = `<div style="color: #ff5555; background: #1a0000; padding: 6px; text-align: center; margin-bottom: 8px;">❌ Lỗi cập nhật bảo trì: ${escapeHtml(e.message)}</div>`;
                }
            }
        } else {
            const targetUserId = formData.get('user_id');
            const newRole = formData.get('role');
            const newCoins = formData.get('coins');
            const newLevel = formData.get('level');

            try {
                if (user.role === 'Mod' && (newRole === 'Chủ Wap' || newRole === 'Admin')) {
                    throw new Error("Mod không có quyền cấp bậc cao hơn!");
                }

                await env.DB.prepare("UPDATE users SET role = ?, coins = ?, level = ? WHERE id = ?")
                    .bind(newRole, newCoins, newLevel, targetUserId)
                    .run();
                message = `<div style="color: #00ff00; background: #001a00; padding: 6px; text-align: center; margin-bottom: 8px;">✅ Cập nhật thành viên thành công!</div>`;
            } catch (e) {
                message = `<div style="color: #ff5555; background: #1a0000; padding: 6px; text-align: center; margin-bottom: 8px;">❌ Lỗi: ${escapeHtml(e.message)}</div>`;
            }
        }
    }

    const maintConfig = await getMaintenanceConfig(env);

    const maintenanceSectionHtml = ownerCanToggleMaint ? `
        <div style="background: #121212; border: 1px solid #444; border-radius: 4px; padding: 10px; margin-bottom: 12px; font-size: 12px;">
            <div style="font-weight: bold; color: #ffcc00; margin-bottom: 6px;">
                🛠️ Bảo trì WAP (Chỉ tài khoản Chủ Wap mới đăng nhập & chỉnh sửa được)
            </div>
            <div style="margin-bottom: 8px; font-size: 11px; color: #ccc;">
                Trạng thái hiện tại:
                ${maintConfig.enabled
                    ? '<b style="color:#ff9900;">ĐANG BẬT BẢO TRÌ</b>'
                    : '<b style="color:#00ff00;">ĐANG HOẠT ĐỘNG BÌNH THƯỜNG</b>'}
            </div>
            <form method="POST" style="margin: 0; display: flex; flex-direction: column; gap: 6px;">
                <input type="hidden" name="action" value="toggle_maintenance">
                <input type="text" name="maintenance_message" value="${escapeHtml(maintConfig.message)}" placeholder="Thông báo bảo trì..." style="width: 100%; box-sizing: border-box; background: #000; color: #fff; border: 1px solid #444; padding: 6px; font-size: 11px; border-radius: 3px;">
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button type="submit" name="enable_maintenance" value="1" class="btn" style="background: #994400; color: #fff; border-color: #ff9900; padding: 6px 12px; font-size: 11px;">
                        🔒 Bật bảo trì
                    </button>
                    <button type="submit" name="enable_maintenance" value="0" class="btn" style="background: #006600; color: #fff; border-color: #00ff00; padding: 6px 12px; font-size: 11px;">
                        🔓 Tắt bảo trì
                    </button>
                </div>
            </form>
        </div>
    ` : '';

    let usersList = { results: [] };
    try {
        usersList = await env.DB.prepare("SELECT id, username, display_name, role, coins, level FROM users ORDER BY id DESC LIMIT 50").all();
    } catch (e) {
        usersList = { results: [] };
    }

    const content = `
    <div class="box">
        <div class="box-title">⚙️ Bảng Quản Trị Hệ Thống (Ban Quản Trị)</div>
        <div class="box-content">
            <div style="background: #151515; padding: 8px; font-size: 11px; margin-bottom: 8px; color: #ffcc00;">
                💡 Chào quản trị viên <b>${escapeHtml(user.display_name)}</b> (${escapeHtml(user.role)}). Bạn có toàn quyền quản lý thành viên và kiểm duyệt nội dung.
            </div>

            ${message}
            ${maintenanceSectionHtml}

            <div style="font-weight: bold; color: #00ff00; margin-bottom: 6px;">👥 Danh sách thành viên hệ thống:</div>

            ${usersList.results.map(u => `
                <div style="background: #141414; border: 1px solid #333; padding: 8px; margin-bottom: 6px; font-size: 11px;">
                    <form method="POST" style="margin: 0;">
                        <input type="hidden" name="user_id" value="${u.id}">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                            <div><b>ID: ${u.id}</b> - ${escapeHtml(u.display_name)} (${escapeHtml(u.username)})</div>
                            <div>Lv: <input type="number" name="level" value="${u.level}" style="width: 40px; background: #000; color: #fff; border: 1px solid #444; text-align: center;"></div>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; gap: 4px;">
                            <div>Xu: <input type="number" name="coins" value="${u.coins}" style="width: 80px; background: #000; color: #00ff00; border: 1px solid #444;"></div>
                            <div>
                                Chức vụ:
                                <select name="role" style="background: #000; color: #ffcc00; border: 1px solid #444; font-size: 10px;">
                                    <option value="Thành Viên" ${u.role === 'Thành Viên' ? 'selected' : ''}>Thành Viên</option>
                                    <option value="Mod" ${u.role === 'Mod' ? 'selected' : ''}>Mod</option>
                                    <option value="Admin" ${u.role === 'Admin' ? 'selected' : ''}>Admin</option>
                                    ${user.role === 'Chủ Wap' ? `<option value="Chủ Wap" ${u.role === 'Chủ Wap' ? 'selected' : ''}>Chủ Wap</option>` : ''}
                                </select>
                            </div>
                            <button type="submit" class="btn" style="background: #0055ff; color: #fff; padding: 2px 8px; font-size: 10px;">Lưu</button>
                        </div>
                    </form>
                </div>
            `).join('')}
        </div>
    </div>
    <div style="text-align: center;"><a href="/">⬅️ Về trang chủ</a></div>
    `;

    return new Response(renderLayout('Quản trị viên', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
