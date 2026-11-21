export async function handleShopColor(request, env, user, renderLayout) {
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN name_color TEXT DEFAULT '#00ff00'").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN name_glow TEXT DEFAULT '#000000'").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN name_border TEXT DEFAULT '#000000'").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN name_border_glow TEXT DEFAULT '#000000'").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN border_color TEXT DEFAULT '#ffcc00'").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN avatar_glow TEXT DEFAULT '#000000'").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN active_frame TEXT DEFAULT ''").run(); } catch (e) {}

    let message = '';
    let savedOk = false;
    let activeTargetType = 'color';

    let currentColors = {
        name_color: String(user.name_color || '#00ff00'),
        name_glow: String(user.name_glow || '#000000'),
        name_border: String(user.name_border || '#000000'),
        name_border_glow: String(user.name_border_glow || '#000000'),
        border_color: String(user.border_color || '#ffcc00'),
        avatar_glow: String(user.avatar_glow || '#000000')
    };
    let activeFrame = String(user.active_frame || '');

    try {
        const row = await env.DB.prepare(
            "SELECT name_color, name_glow, name_border, name_border_glow, border_color, avatar_glow, active_frame FROM users WHERE id = ?"
        ).bind(user.id).first();
        if (row) {
            currentColors = {
                name_color: String(row.name_color || currentColors.name_color || '#00ff00'),
                name_glow: String(row.name_glow || currentColors.name_glow || '#000000'),
                name_border: String(row.name_border || currentColors.name_border || '#000000'),
                name_border_glow: String(row.name_border_glow || currentColors.name_border_glow || '#000000'),
                border_color: String(row.border_color || currentColors.border_color || '#ffcc00'),
                avatar_glow: String(row.avatar_glow || currentColors.avatar_glow || '#000000')
            };
            activeFrame = String(row.active_frame || activeFrame || '');
        }
    } catch (e) {}

    function applyColorsToUserObj(obj) {
        user.name_color = obj.name_color;
        user.name_glow = obj.name_glow;
        user.name_border = obj.name_border;
        user.name_border_glow = obj.name_border_glow;
        user.border_color = obj.border_color;
        user.avatar_glow = obj.avatar_glow;
        user.active_frame = activeFrame;
    }

    if (request.method === 'POST') {
        try {
            const formData = await request.formData();
            const action = String(formData.get('action') || '');

            if (action === 'update_color') {
                const targetType = String(formData.get('target_type') || 'color');
                activeTargetType = targetType;
                const rawColor = String(formData.get('color_val') || '').trim();
                const colorVal = rawColor || '#000000';

                const nextColors = {
                    name_color: String(formData.get('state_name_color') || currentColors.name_color || '#00ff00'),
                    name_glow: String(formData.get('state_name_glow') || currentColors.name_glow || '#000000'),
                    name_border: String(formData.get('state_name_border') || currentColors.name_border || '#000000'),
                    name_border_glow: String(formData.get('state_name_border_glow') || currentColors.name_border_glow || '#000000'),
                    border_color: String(formData.get('state_border_color') || currentColors.border_color || '#ffcc00'),
                    avatar_glow: String(formData.get('state_avatar_glow') || currentColors.avatar_glow || '#000000')
                };

                if (targetType === 'glow') nextColors.name_glow = colorVal;
                else if (targetType === 'border') nextColors.name_border = colorVal;
                else if (targetType === 'border_glow') nextColors.name_border_glow = colorVal;
                else if (targetType === 'avt_border') nextColors.border_color = colorVal;
                else if (targetType === 'avt_glow') nextColors.avatar_glow = colorVal;
                else nextColors.name_color = colorVal;

                await env.DB.prepare(`
                    UPDATE users
                    SET name_color = ?, name_glow = ?, name_border = ?, name_border_glow = ?, border_color = ?, avatar_glow = ?
                    WHERE id = ?
                `).bind(
                    nextColors.name_color,
                    nextColors.name_glow,
                    nextColors.name_border,
                    nextColors.name_border_glow,
                    nextColors.border_color,
                    nextColors.avatar_glow,
                    user.id
                ).run();

                currentColors = nextColors;
                applyColorsToUserObj(currentColors);
                savedOk = true;
                message = `<div style="color: #00ff00; text-align: center; margin-bottom: 10px; font-weight: bold;">✅ Đã lưu trang trí màu sắc thành công (${colorVal})!</div>`;
            } else if (action === 'clear_field') {
                const targetType = String(formData.get('target_type') || 'color');
                activeTargetType = targetType;

                const nextColors = {
                    name_color: String(formData.get('state_name_color') || currentColors.name_color || '#00ff00'),
                    name_glow: String(formData.get('state_name_glow') || currentColors.name_glow || '#000000'),
                    name_border: String(formData.get('state_name_border') || currentColors.name_border || '#000000'),
                    name_border_glow: String(formData.get('state_name_border_glow') || currentColors.name_border_glow || '#000000'),
                    border_color: String(formData.get('state_border_color') || currentColors.border_color || '#ffcc00'),
                    avatar_glow: String(formData.get('state_avatar_glow') || currentColors.avatar_glow || '#000000')
                };

                if (targetType === 'glow') nextColors.name_glow = '#000000';
                else if (targetType === 'border') nextColors.name_border = '#000000';
                else if (targetType === 'border_glow') nextColors.name_border_glow = '#000000';
                else if (targetType === 'avt_glow') nextColors.avatar_glow = '#000000';
                else if (targetType === 'avt_border') nextColors.border_color = '#ffcc00';
                else if (targetType === 'color') nextColors.name_color = '#00ff00';

                await env.DB.prepare(`
                    UPDATE users
                    SET name_color = ?, name_glow = ?, name_border = ?, name_border_glow = ?, border_color = ?, avatar_glow = ?
                    WHERE id = ?
                `).bind(
                    nextColors.name_color,
                    nextColors.name_glow,
                    nextColors.name_border,
                    nextColors.name_border_glow,
                    nextColors.border_color,
                    nextColors.avatar_glow,
                    user.id
                ).run();

                currentColors = nextColors;
                applyColorsToUserObj(currentColors);
                savedOk = true;
                message = '<div style="color: #ffcc00; text-align: center; margin-bottom: 10px; font-weight: bold;">✅ Đã đặt lại mục đã chọn về mặc định!</div>';
            } else if (action === 'reset_all') {
                activeTargetType = 'color';
                const resetColors = {
                    name_color: '#00ff00',
                    name_glow: '#000000',
                    name_border: '#000000',
                    name_border_glow: '#000000',
                    border_color: '#ffcc00',
                    avatar_glow: '#000000'
                };
                await env.DB.prepare(`
                    UPDATE users
                    SET name_color = ?, name_glow = ?, name_border = ?, name_border_glow = ?, border_color = ?, avatar_glow = ?
                    WHERE id = ?
                `).bind(
                    resetColors.name_color,
                    resetColors.name_glow,
                    resetColors.name_border,
                    resetColors.name_border_glow,
                    resetColors.border_color,
                    resetColors.avatar_glow,
                    user.id
                ).run();

                currentColors = resetColors;
                applyColorsToUserObj(currentColors);
                savedOk = true;
                message = '<div style="color: #ffcc00; text-align: center; margin-bottom: 10px; font-weight: bold;">✅ Đã khôi phục toàn bộ màu mặc định!</div>';
            }
        } catch (e) {
            message = `<div style="color: #ff3333; text-align: center; margin-bottom: 10px;">Lỗi: ${e.message}</div>`;
        }
    }

    applyColorsToUserObj(currentColors);

    const defaultAvatarMale = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><rect width='120' height='120' fill='%230f172a'/><circle cx='60' cy='45' r='22' fill='%2338bdf8'/><path d='M20 105 C20 80, 100 80, 100 105' fill='%2338bdf8'/></svg>";
    const avt = (user.avatar && !String(user.avatar).includes('7gXvS6v')) ? user.avatar : defaultAvatarMale;
    const activeIcon = user.active_icon ? `${user.active_icon} ` : '';
    const displayName = user.display_name || user.username || 'Thành viên';
    const hasFrameEquipped = Boolean(activeFrame);

    const initState = { ...currentColors };
    const initStateJson = JSON.stringify(initState).replace(/</g, '\\u003c');
    const activeTargetJson = JSON.stringify(activeTargetType).replace(/</g, '\\u003c');
    const savedFlag = savedOk ? 'true' : 'false';
    const hasFrameFlag = hasFrameEquipped ? 'true' : 'false';

    const shadowsInit = [];
    if (initState.name_glow && initState.name_glow !== '#000000') shadowsInit.push(`0 0 6px ${initState.name_glow}`);
    if (initState.name_border_glow && initState.name_border_glow !== '#000000') shadowsInit.push(`0 0 4px ${initState.name_border_glow}`);
    let initNameStyle = `color: ${initState.name_color}; font-weight: bold;`;
    if (shadowsInit.length > 0) initNameStyle += ` text-shadow: ${shadowsInit.join(', ')};`;
    if (initState.name_border && initState.name_border !== '#000000') initNameStyle += ` -webkit-text-stroke: 0.5px ${initState.name_border};`;

    const initAvtStyle = hasFrameEquipped
        ? `width: 50px; height: 50px; border-radius: 50%; object-fit: cover; border: none; box-shadow: none;`
        : `width: 50px; height: 50px; border-radius: 50%; object-fit: cover; border: 2px solid ${initState.border_color}; ${initState.avatar_glow && initState.avatar_glow !== '#000000' ? `box-shadow: 0 0 10px ${initState.avatar_glow};` : ''}`;

    const frameNoticeHtml = hasFrameEquipped
        ? `<div style="background:#1c1917;border:1px solid #f59e0b;color:#fde68a;padding:7px 10px;border-radius:5px;font-size:11px;margin-bottom:10px;text-align:center;">
            🎭 Bạn đang đeo khung avatar (<b>${activeFrame}</b>) nên <b>Viền AVT</b> và <b>Sáng AVT</b> đang tự động ẩn. Vào <a href="/shop/inventory" style="color:#4ade80;text-decoration:underline;">Túi đồ</a> để gỡ khung nếu muốn hiển thị lại.
           </div>`
        : '';

    const content = `
    <div id="pjax-main-content" data-pjax-url="/shop/buycolor">
        <div class="box">
            <div class="box-title" style="justify-content: space-between;">
                <span>🎨 Trang trí màu sắc nick</span>
                <a href="/shop" style="font-size: 12px; color: #ffcc00; font-weight: normal;">🛒 Cửa hàng</a>
            </div>
            <div class="box-content">
                ${message}
                ${frameNoticeHtml}
                <div style="background: #141414; border: 1px solid #2a2a2a; padding: 12px; margin-bottom: 12px; border-radius: 6px; text-align: center;">
                    <div style="font-size: 12px; color: #aaa; margin-bottom: 8px;">Xem trước thay đổi (đồng bộ trực tiếp với nick):</div>
                    <div style="display: flex; align-items: center; justify-content: center; gap: 12px;">
                        <img id="previewAvt" src="${avt}" style="${initAvtStyle}">
                        <span style="font-size: 16px;">
                            <a id="previewName" href="#" onclick="return false;" style="${initNameStyle}">${activeIcon}${displayName}</a>
                        </span>
                    </div>
                    <div id="previewMetaSummary" style="margin-top: 10px; font-size: 11px; color: #9ca3af; display: flex; flex-wrap: wrap; justify-content: center; gap: 8px;">
                        <span>Màu tên: <b style="color:${initState.name_color}">${initState.name_color}</b></span>
                        <span>· Sáng tên: <b style="color:${initState.name_glow === '#000000' ? '#71717a' : initState.name_glow}">${initState.name_glow}</b></span>
                        <span>· Viền tên: <b style="color:${initState.name_border === '#000000' ? '#71717a' : initState.name_border}">${initState.name_border}</b></span>
                        <span>· Sáng viền tên: <b style="color:${initState.name_border_glow === '#000000' ? '#71717a' : initState.name_border_glow}">${initState.name_border_glow}</b></span>
                        ${hasFrameEquipped ? '' : `<span>· Viền AVT: <b style="color:${initState.border_color}">${initState.border_color}</b></span><span>· Sáng AVT: <b style="color:${initState.avatar_glow === '#000000' ? '#71717a' : initState.avatar_glow}">${initState.avatar_glow}</b></span>`}
                    </div>
                </div>

                <form id="shopColorForm" method="POST" action="/shop/buycolor" data-no-pjax="1" style="background: #121212; border: 1px solid #2c2c2c; padding: 12px; border-radius: 6px; margin-bottom: 12px;">
                    <input type="hidden" name="action" value="update_color">
                    <input type="hidden" id="hidNameColor" name="state_name_color" value="${initState.name_color}">
                    <input type="hidden" id="hidNameGlow" name="state_name_glow" value="${initState.name_glow}">
                    <input type="hidden" id="hidNameBorder" name="state_name_border" value="${initState.name_border}">
                    <input type="hidden" id="hidNameBorderGlow" name="state_name_border_glow" value="${initState.name_border_glow}">
                    <input type="hidden" id="hidBorderColor" name="state_border_color" value="${initState.border_color}">
                    <input type="hidden" id="hidAvatarGlow" name="state_avatar_glow" value="${initState.avatar_glow}">

                    <div style="font-weight: bold; color: #00ff00; margin-bottom: 8px; font-size: 13px;">⚙️ Tùy chỉnh màu sắc chuyên sâu:</div>

                    <div style="margin-bottom: 10px;">
                        <label style="font-size: 12px; color: #ccc; display: block; margin-bottom: 4px;">Loại tùy chỉnh:</label>
                        <select id="targetType" name="target_type" style="width: 100%; background: #1c1c1c; color: #00ff00; border: 1px solid #444; padding: 8px; border-radius: 4px; font-size: 13px;">
                            <option value="color">Màu tên tài khoản</option>
                            <option value="glow">Hiệu ứng sáng tên (Glow)</option>
                            <option value="border">Viền tên tài khoản</option>
                            <option value="border_glow">Hiệu ứng sáng viền tên</option>
                            ${hasFrameEquipped ? '' : `<option value="avt_border">Viền ảnh đại diện</option><option value="avt_glow">Hiệu ứng sáng ảnh đại diện</option>`}
                        </select>
                    </div>

                    <div style="margin-bottom: 12px; display: flex; align-items: center; gap: 10px;">
                        <div style="flex: 1;">
                            <label style="font-size: 12px; color: #ccc; display: block; margin-bottom: 4px;">Chọn mã màu (Hex):</label>
                            <input type="text" id="colorInput" name="color_val" value="${initState.name_color}" placeholder="#00ff00" style="width: 100%; background: #1c1c1c; color: #fff; border: 1px solid #444; padding: 8px; border-radius: 4px; box-sizing: border-box; font-size: 13px;">
                        </div>
                        <div>
                            <label style="font-size: 12px; color: #ccc; display: block; margin-bottom: 4px;">Bảng màu:</label>
                            <input type="color" id="colorPicker" value="${initState.name_color.startsWith('#') && initState.name_color.length === 7 ? initState.name_color : '#00ff00'}" style="width: 38px; height: 38px; background: none; border: 1px solid #444; cursor: pointer; border-radius: 4px;">
                        </div>
                    </div>

                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <button type="submit" class="btn" style="background: #0055ff; color: #fff; flex: 1; min-width: 140px; padding: 8px; border-radius: 4px;">💾 Lưu màu</button>
                        <button type="button" id="clearCurrentTypeBtn" class="btn" style="background: #27272a; color: #fbbf24; border: 1px solid #52525b; padding: 8px 10px; border-radius: 4px; font-size: 12px;">↩ Tắt / Mặc định mục này</button>
                    </div>
                </form>

                <div style="background: #121212; border: 1px solid #2c2c2c; padding: 12px; border-radius: 6px;">
                    <div style="font-weight: bold; color: #ffcc00; margin-bottom: 8px; font-size: 13px;">🌟 Bộ màu phối sẵn nhanh:</div>
                    <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                        <button type="button" data-preset="#00ffff" class="btn" style="background: #0d1b2a; color: #00ffff; border: 1px solid #00ffff; font-size: 11px; padding: 4px 8px;">🌊 Đại dương</button>
                        <button type="button" data-preset="#ffcc00" class="btn" style="background: #2b180a; color: #ffcc00; border: 1px solid #ffcc00; font-size: 11px; padding: 4px 8px;">👑 Hoàng gia</button>
                        <button type="button" data-preset="#ff66b2" class="btn" style="background: #2a001a; color: #ff66b2; border: 1px solid #ff66b2; font-size: 11px; padding: 4px 8px;">💖 Hồng neon</button>
                        <button type="button" data-preset="#ff3300" class="btn" style="background: #2a0800; color: #ff3300; border: 1px solid #ff3300; font-size: 11px; padding: 4px 8px;">🔥 Rực lửa</button>
                    </div>

                    <form method="POST" action="/shop/buycolor" data-no-pjax="1" style="margin-top: 12px; border-top: 1px solid #222; padding-top: 10px;">
                        <input type="hidden" name="action" value="reset_all">
                        <button type="submit" class="btn" style="background: #550000; color: #fff; width: 100%; padding: 6px; border-radius: 4px; font-size: 12px;">🗑️ Khôi phục màu mặc định tất cả</button>
                    </form>
                </div>
            </div>
        </div>

        <script>
            (function mountShopColor() {
                const container = document.getElementById('pjax-main-content');
                if (!container) return;

                if (${savedFlag} && typeof window.__wapInvalidatePjaxCache === 'function') {
                    window.__wapInvalidatePjaxCache('/');
                    window.__wapInvalidatePjaxCache('/shop');
                    window.__wapInvalidatePjaxCache('/shop/buycolor');
                }

                const formEl = container.querySelector('#shopColorForm');
                const colorInput = container.querySelector('#colorInput');
                const colorPicker = container.querySelector('#colorPicker');
                const targetType = container.querySelector('#targetType');
                const previewName = container.querySelector('#previewName');
                const previewAvt = container.querySelector('#previewAvt');
                const summaryEl = container.querySelector('#previewMetaSummary');
                const clearCurrentBtn = container.querySelector('#clearCurrentTypeBtn');
                if (!formEl || !colorInput || !colorPicker || !targetType || !previewName || !previewAvt) return;

                const hasFrame = ${hasFrameFlag};
                const state = Object.assign({
                    name_color: '#00ff00',
                    name_glow: '#000000',
                    name_border: '#000000',
                    name_border_glow: '#000000',
                    border_color: '#ffcc00',
                    avatar_glow: '#000000'
                }, ${initStateJson});

                const reqTarget = ${activeTargetJson} || 'color';
                if (hasFrame && (reqTarget === 'avt_border' || reqTarget === 'avt_glow')) {
                    targetType.value = 'color';
                } else {
                    targetType.value = reqTarget;
                }

                function syncHiddenInputs() {
                    const hNameColor = formEl.querySelector('#hidNameColor');
                    const hNameGlow = formEl.querySelector('#hidNameGlow');
                    const hNameBorder = formEl.querySelector('#hidNameBorder');
                    const hNameBorderGlow = formEl.querySelector('#hidNameBorderGlow');
                    const hBorderColor = formEl.querySelector('#hidBorderColor');
                    const hAvatarGlow = formEl.querySelector('#hidAvatarGlow');
                    if (hNameColor) hNameColor.value = state.name_color;
                    if (hNameGlow) hNameGlow.value = state.name_glow;
                    if (hNameBorder) hNameBorder.value = state.name_border;
                    if (hNameBorderGlow) hNameBorderGlow.value = state.name_border_glow;
                    if (hBorderColor) hBorderColor.value = state.border_color;
                    if (hAvatarGlow) hAvatarGlow.value = state.avatar_glow;
                }

                function getFieldForType(t) {
                    if (t === 'glow') return 'name_glow';
                    if (t === 'border') return 'name_border';
                    if (t === 'border_glow') return 'name_border_glow';
                    if (t === 'avt_border') return 'border_color';
                    if (t === 'avt_glow') return 'avatar_glow';
                    return 'name_color';
                }

                function getDefaultForType(t) {
                    if (t === 'color') return '#00ff00';
                    if (t === 'avt_border') return '#ffcc00';
                    return '#000000';
                }

                function renderSummary() {
                    if (!summaryEl) return;
                    const sColor = state.name_color || '#00ff00';
                    const sGlow = state.name_glow || '#000000';
                    const sBorder = state.name_border || '#000000';
                    const sBorderGlow = state.name_border_glow || '#000000';
                    const sAvtBorder = state.border_color || '#ffcc00';
                    const sAvtGlow = state.avatar_glow || '#000000';
                    let html =
                        '<span>Màu tên: <b style="color:' + sColor + '">' + sColor + '</b></span>' +
                        '<span>· Sáng tên: <b style="color:' + (sGlow === '#000000' ? '#71717a' : sGlow) + '">' + sGlow + '</b></span>' +
                        '<span>· Viền tên: <b style="color:' + (sBorder === '#000000' ? '#71717a' : sBorder) + '">' + sBorder + '</b></span>' +
                        '<span>· Sáng viền tên: <b style="color:' + (sBorderGlow === '#000000' ? '#71717a' : sBorderGlow) + '">' + sBorderGlow + '</b></span>';
                    if (!hasFrame) {
                        html +=
                            '<span>· Viền AVT: <b style="color:' + sAvtBorder + '">' + sAvtBorder + '</b></span>' +
                            '<span>· Sáng AVT: <b style="color:' + (sAvtGlow === '#000000' ? '#71717a' : sAvtGlow) + '">' + sAvtGlow + '</b></span>';
                    }
                    summaryEl.innerHTML = html;
                }

                function applyFullPreview() {
                    previewName.style.color = state.name_color || '#00ff00';
                    previewName.style.fontWeight = 'bold';

                    const shadows = [];
                    if (state.name_glow && state.name_glow !== '#000000') {
                        shadows.push('0 0 6px ' + state.name_glow);
                    }
                    if (state.name_border_glow && state.name_border_glow !== '#000000') {
                        shadows.push('0 0 4px ' + state.name_border_glow);
                    }
                    previewName.style.textShadow = shadows.length > 0 ? shadows.join(', ') : 'none';

                    if (state.name_border && state.name_border !== '#000000') {
                        previewName.style.webkitTextStroke = '0.5px ' + state.name_border;
                    } else {
                        previewName.style.webkitTextStroke = '0px';
                        previewName.style.webkitTextStrokeColor = 'transparent';
                    }

                    if (hasFrame) {
                        previewAvt.style.border = 'none';
                        previewAvt.style.boxShadow = 'none';
                    } else {
                        previewAvt.style.border = '2px solid ' + (state.border_color || '#ffcc00');
                        if (state.avatar_glow && state.avatar_glow !== '#000000') {
                            previewAvt.style.boxShadow = '0 0 10px ' + state.avatar_glow;
                        } else {
                            previewAvt.style.boxShadow = 'none';
                        }
                    }

                    syncHiddenInputs();
                    renderSummary();
                }

                function syncInputsFromType() {
                    const field = getFieldForType(targetType.value);
                    const curVal = state[field] || getDefaultForType(targetType.value);
                    colorInput.value = curVal;
                    colorPicker.value = (/^#[0-9a-fA-F]{6}$/.test(curVal)) ? curVal : '#00ff00';
                }

                function onColorInput() {
                    const val = colorInput.value.trim();
                    const field = getFieldForType(targetType.value);
                    state[field] = val || '#000000';
                    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                        colorPicker.value = val;
                    }
                    applyFullPreview();
                }

                function onPickerChange(e) {
                    const val = e.target.value;
                    colorInput.value = val;
                    const field = getFieldForType(targetType.value);
                    state[field] = val;
                    applyFullPreview();
                }

                function onTypeChange() {
                    syncInputsFromType();
                    applyFullPreview();
                }

                function onClearCurrentType() {
                    const t = targetType.value;
                    const defVal = getDefaultForType(t);
                    const field = getFieldForType(t);
                    state[field] = defVal;
                    colorInput.value = defVal;
                    colorPicker.value = (/^#[0-9a-fA-F]{6}$/.test(defVal)) ? defVal : '#00ff00';
                    applyFullPreview();

                    const actionInput = formEl.querySelector('input[name="action"]');
                    if (actionInput) actionInput.value = 'clear_field';
                    formEl.submit();
                }

                colorInput.addEventListener('input', onColorInput);
                colorPicker.addEventListener('input', onPickerChange);
                targetType.addEventListener('change', onTypeChange);
                if (clearCurrentBtn) clearCurrentBtn.addEventListener('click', onClearCurrentType);

                const presetButtons = Array.from(container.querySelectorAll('[data-preset]'));
                const presetHandlers = presetButtons.map(function(btn) {
                    const handler = function() {
                        const hex = btn.getAttribute('data-preset') || '#00ff00';
                        targetType.value = 'color';
                        colorInput.value = hex;
                        if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
                            colorPicker.value = hex;
                        }
                        state.name_color = hex;
                        applyFullPreview();
                    };
                    btn.addEventListener('click', handler);
                    return { btn, handler };
                });

                syncInputsFromType();
                applyFullPreview();

                window.__wapPjaxCleanups = window.__wapPjaxCleanups || [];
                window.__wapPjaxCleanups.push(function() {
                    colorInput.removeEventListener('input', onColorInput);
                    colorPicker.removeEventListener('input', onPickerChange);
                    targetType.removeEventListener('change', onTypeChange);
                    if (clearCurrentBtn) clearCurrentBtn.removeEventListener('click', onClearCurrentType);
                    presetHandlers.forEach(function(item) {
                        item.btn.removeEventListener('click', item.handler);
                    });
                });
            })();
        </script>

        <div style="text-align: center; margin-top: 10px; font-size: 13px;">
            <a href="/shop">⬅ Quay lại Cửa hàng</a> · <a href="/">🏠 Về trang chủ</a>
        </div>
    </div>
    `;

    return new Response(renderLayout('Trang trí màu sắc', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
