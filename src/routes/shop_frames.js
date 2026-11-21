export const AVATAR_FRAMES = [
    // 6 KHUNG TĨNH (hiển thị trước từ trái qua phải)
    {
        id: 'frame_1',
        num: 1,
        kind: 'static',
        badge: 'TĨNH',
        name: 'Khung Ngọc Bích',
        price: 10,
        ringClass: 'avt-frame-static-1'
    },
    {
        id: 'frame_2',
        num: 2,
        kind: 'static',
        badge: 'TĨNH',
        name: 'Khung Hoàng Kim',
        price: 15,
        ringClass: 'avt-frame-static-2'
    },
    {
        id: 'frame_3',
        num: 3,
        kind: 'static',
        badge: 'TĨNH',
        name: 'Khung Hồng Ngọc',
        price: 15,
        ringClass: 'avt-frame-static-3'
    },
    {
        id: 'frame_4',
        num: 4,
        kind: 'static',
        badge: 'TĨNH',
        name: 'Khung Băng Lam',
        price: 20,
        ringClass: 'avt-frame-static-4'
    },
    {
        id: 'frame_5',
        num: 5,
        kind: 'static',
        badge: 'TĨNH',
        name: 'Khung Tím Thạch Anh',
        price: 20,
        ringClass: 'avt-frame-static-5'
    },
    {
        id: 'frame_6',
        num: 6,
        kind: 'static',
        badge: 'TĨNH',
        name: 'Khung Bạch Kim',
        price: 25,
        ringClass: 'avt-frame-static-6'
    },

    // 6 KHUNG ĐỘNG (hiển thị sau từ trái qua phải)
    {
        id: 'frame_7',
        num: 7,
        kind: 'animated',
        badge: 'ĐỘNG',
        name: 'Khung Lửa Phượng',
        price: 35,
        ringClass: 'avt-frame-anim-7'
    },
    {
        id: 'frame_8',
        num: 8,
        kind: 'animated',
        badge: 'ĐỘNG',
        name: 'Khung Cầu Vồng',
        price: 40,
        ringClass: 'avt-frame-anim-8'
    },
    {
        id: 'frame_9',
        num: 9,
        kind: 'animated',
        badge: 'ĐỘNG',
        name: 'Khung Sấm Sét',
        price: 40,
        ringClass: 'avt-frame-anim-9'
    },
    {
        id: 'frame_10',
        num: 10,
        kind: 'animated',
        badge: 'ĐỘNG',
        name: 'Khung Hào Quang',
        price: 45,
        ringClass: 'avt-frame-anim-10'
    },
    {
        id: 'frame_11',
        num: 11,
        kind: 'animated',
        badge: 'ĐỘNG',
        name: 'Khung Thiên Thạch',
        price: 50,
        ringClass: 'avt-frame-anim-11'
    },
    {
        id: 'frame_12',
        num: 12,
        kind: 'animated',
        badge: 'ĐỘNG',
        name: 'Khung Chí Tôn',
        price: 60,
        ringClass: 'avt-frame-anim-12'
    }
];

export function getFrameById(frameId) {
    const raw = String(frameId || '').trim();
    if (!raw) return null;
    const normalized = /^\d+$/.test(raw) ? `frame_${Number(raw)}` : raw;
    return AVATAR_FRAMES.find(f => f.id === normalized || String(f.num) === raw) || null;
}

export function renderAvatarFrameHtml(avatarUrl, frameId, sizePx = 48, extraImgStyle = '') {
    const frame = getFrameById(frameId);
    const safeUrl = String(avatarUrl || '');
    const px = Number(sizePx) || 48;
    const innerSize = frame ? Math.max(24, px - 8) : px;

    if (!frame) {
        return `<img src="${safeUrl}" width="${px}" height="${px}" style="width:${px}px;height:${px}px;border-radius:50%;object-fit:cover;${extraImgStyle}">`;
    }

    return `
    <span class="wap-avt-frame ${frame.ringClass}" style="width:${px}px;height:${px}px;" title="${frame.name}">
        <span class="wap-avt-frame-ring"></span>
        <img src="${safeUrl}" width="${innerSize}" height="${innerSize}" class="wap-avt-frame-img" style="width:${innerSize}px;height:${innerSize}px;${extraImgStyle}">
    </span>`;
}

async function ensureUserItemsTable(db) {
    try {
        await db.prepare(`
            CREATE TABLE IF NOT EXISTS user_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                item_type TEXT NOT NULL,
                item_value TEXT NOT NULL,
                created_at INTEGER DEFAULT 0
            )
        `).run();
    } catch (e) {}
}

export async function handleShopFrames(request, env, user, renderLayout) {
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN active_frame TEXT DEFAULT ''").run(); } catch (e) {}
    await ensureUserItemsTable(env.DB);

    let message = '';

    if (request.method === 'POST') {
        const formData = await request.formData();
        const action = String(formData.get('action') || '');
        const frameId = String(formData.get('frame_id') || '');
        const frame = getFrameById(frameId);

        if (!frame) {
            message = `<div style="color: #ff5555; background: #1a0000; border: 1px solid #550000; padding: 6px; margin-bottom: 8px; text-align: center;">❌ Khung avatar không hợp lệ!</div>`;
        } else if (action === 'buy') {
            const existing = await env.DB.prepare(
                "SELECT id FROM user_items WHERE user_id = ? AND item_type = 'frame' AND item_value = ? LIMIT 1"
            ).bind(user.id, frame.id).first();

            if (existing) {
                message = `<div style="color: #ffcc00; background: #1f1900; border: 1px solid #665200; padding: 6px; margin-bottom: 8px; text-align: center;">ℹ️ Bạn đã sở hữu <b>${frame.name}</b> trong <a href="/shop/inventory" style="color:yellow; text-decoration:underline;">Túi đồ</a>.</div>`;
            } else if ((user.gold || 0) < frame.price) {
                message = `<div style="color: #ff5555; background: #1a0000; border: 1px solid #550000; padding: 6px; margin-bottom: 8px; text-align: center;">❌ Bạn không đủ Vàng để mua <b>${frame.name}</b> (cần ${frame.price} Vàng)!</div>`;
            } else {
                try {
                    await env.DB.prepare("UPDATE users SET gold = gold - ? WHERE id = ? AND gold >= ?").bind(frame.price, user.id, frame.price).run();
                    await env.DB.prepare(
                        "INSERT INTO user_items (user_id, item_type, item_value, created_at) VALUES (?, 'frame', ?, ?)"
                    ).bind(user.id, frame.id, Math.floor(Date.now() / 1000)).run();

                    const freshUser = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first();
                    if (freshUser) Object.assign(user, freshUser);

                    message = `<div style="color: #00ff00; background: #001a00; border: 1px solid #005500; padding: 6px; margin-bottom: 8px; text-align: center;">✅ Mua thành công <b>${frame.name}</b>! Vào <a href="/shop/inventory" style="color:yellow; text-decoration:underline;">Túi đồ</a> để sử dụng hoặc gỡ bỏ.</div>`;
                } catch (e) {
                    message = `<div style="color: #ff5555; text-align: center; margin-bottom: 8px;">❌ Lỗi: ${e.message}</div>`;
                }
            }
        }
    }

    let ownedFrameSet = new Set();
    try {
        const ownedRows = await env.DB.prepare(
            "SELECT item_value FROM user_items WHERE user_id = ? AND item_type = 'frame'"
        ).bind(user.id).all();
        (ownedRows?.results || []).forEach(r => ownedFrameSet.add(String(r.item_value || '')));
    } catch (e) {}

    const defaultAvatarMale = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><rect width='120' height='120' fill='%230f172a'/><circle cx='60' cy='45' r='22' fill='%2338bdf8'/><path d='M20 105 C20 80, 100 80, 100 105' fill='%2338bdf8'/></svg>";
    const avtUrl = (user.avatar && !String(user.avatar).includes('7gXvS6v')) ? user.avatar : defaultAvatarMale;

    const staticFrames = AVATAR_FRAMES.filter(f => f.kind === 'static');
    const animatedFrames = AVATAR_FRAMES.filter(f => f.kind === 'animated');

    function renderFrameCards(list) {
        return list.map(f => {
            const isOwned = ownedFrameSet.has(f.id);
            const isEquipped = String(user.active_frame || '') === f.id;
            const badgeColor = f.kind === 'animated' ? '#f472b6' : '#4ade80';
            const badgeBg = f.kind === 'animated' ? '#2b0d20' : '#0d2618';

            return `
            <div style="background: #0d0d0d; border: 1px solid ${isEquipped ? '#00ff00' : '#333'}; border-radius: 6px; padding: 8px; text-align: center; display: flex; flex-direction: column; justify-content: space-between;">
                <div>
                    <div style="font-size: 9px; font-weight: bold; color: ${badgeColor}; background: ${badgeBg}; border: 1px solid ${badgeColor}; display: inline-block; padding: 1px 6px; border-radius: 999px; margin-bottom: 6px;">
                        ${f.badge} #${f.num}
                    </div>
                    <div style="display: flex; justify-content: center; align-items: center; min-height: 54px; margin-bottom: 6px;">
                        ${renderAvatarFrameHtml(avtUrl, f.id, 48)}
                    </div>
                    <div style="font-size: 11px; color: #fff; font-weight: bold; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${f.name}</div>
                    <div style="font-size: 10px; color: #ffcc00; margin-bottom: 6px;">👑 ${f.price} Vàng</div>
                </div>
                ${
                    isEquipped
                        ? `<a href="/shop/inventory" class="btn" style="width: 100%; padding: 4px 0; font-size: 10px; background: #14532d; color: #86efac; border: 1px solid #22c55e; border-radius: 4px;">🟢 Đang dùng</a>`
                        : isOwned
                            ? `<a href="/shop/inventory" class="btn" style="width: 100%; padding: 4px 0; font-size: 10px; background: #1e293b; color: #fde047; border: 1px solid #ca8a04; border-radius: 4px;">📦 Trong túi đồ</a>`
                            : `<form method="POST" style="margin:0;">
                                <input type="hidden" name="action" value="buy">
                                <input type="hidden" name="frame_id" value="${f.id}">
                                <button type="submit" class="btn" style="width: 100%; padding: 4px 0; font-size: 10px; background: #0055ff; color: #fff; border: none; border-radius: 4px;">Mua khung</button>
                               </form>`
                }
            </div>`;
        }).join('');
    }

    const content = `
    <div style="background: #111; border: 1px solid #333; padding: 8px 10px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; border-radius: 4px;">
        <span style="color: #00ff00; font-weight: bold;">🛒 Cửa hàng khung avatar (12 mẫu)</span>
        <div>👑 <b style="color: #ffcc00;">${Number(user.gold || 0).toLocaleString()}</b> | <a href="/shop/inventory" style="color: #ffcc00;">🛍️ Túi đồ</a></div>
    </div>

    <div style="font-size: 11px; color: #9ca3af; text-align: center; margin-bottom: 10px;">
        6 khung tĩnh hiển thị trước, 6 khung động hiển thị sau · Mua 1 lần dùng vĩnh viễn.
    </div>

    ${message}

    <div class="box" style="margin-bottom: 10px;">
        <div class="box-title" style="padding: 7px 10px; font-size: 12px; color: #4ade80;">✨ Khung avatar hiệu ứng tĩnh (1 → 6)</div>
        <div class="box-content" style="padding: 8px;">
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
                ${renderFrameCards(staticFrames)}
            </div>
        </div>
    </div>

    <div class="box" style="margin-bottom: 12px;">
        <div class="box-title" style="padding: 7px 10px; font-size: 12px; color: #f472b6;">⚡ Khung avatar hiệu ứng động (7 → 12)</div>
        <div class="box-content" style="padding: 8px;">
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
                ${renderFrameCards(animatedFrames)}
            </div>
        </div>
    </div>

    <div style="text-align: center; margin-top: 10px;"><a href="/shop">⬅️ Quay lại Cửa hàng</a> · <a href="/shop/inventory">🛍️ Túi đồ</a> · <a href="/">Trang chủ</a></div>
    `;

    return new Response(renderLayout('Cửa hàng khung avatar', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
