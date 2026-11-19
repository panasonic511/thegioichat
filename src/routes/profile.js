import { renderUser } from '../worker.js';

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatTimeAgo(val) {
    if (!val) return 'Vừa xong';
    const num = Number(val);
    let ts = 0;
    if (!Number.isNaN(num) && num > 0) {
        ts = num > 1e12 ? num : num * 1000;
    } else {
        const parsed = Date.parse(val);
        if (!Number.isNaN(parsed)) ts = parsed;
    }
    if (!ts) return String(val);

    const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (diffSec < 60) return 'Vừa xong';
    const mins = Math.floor(diffSec / 60);
    if (mins < 60) return `${mins} phút trước`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} giờ trước`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} ngày trước`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} tháng trước`;
    return `${Math.floor(months / 12)} năm trước`;
}

function isStaffOrAdmin(u) {
    if (!u) return false;
    if (Number(u.is_admin) === 1 || Number(u.id) === 1) return true;
    const roleStr = String(u.role || '').trim().toLowerCase();
    return ['admin', 'chủ wap', 'chu wap', 'quản trị', 'quan tri', 'quản lý', 'quan ly', 'smod', 'mod'].some(
        (r) => roleStr === r || roleStr.includes(r)
    );
}

export async function handleProfile(request, env, user, renderLayout, url) {
    let message = "";
    const targetId = parseInt(url.searchParams.get('user') || user.id);

    const cols = ['name_color', 'name_glow', 'name_border', 'name_border_glow', 'border_color', 'avatar_glow', 'cover_photo', 'gender', 'relationship', 'province', 'birthday', 'online_minutes', 'created_at'];
    for (const col of cols) {
        try { await env.DB.prepare(`ALTER TABLE users ADD COLUMN ${col} TEXT;`).run(); } catch(e) {}
    }

    try {
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS follows (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                follower_id INTEGER NOT NULL,
                following_id INTEGER NOT NULL,
                UNIQUE(follower_id, following_id)
            );
        `).run();
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS friends (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                friend_id INTEGER NOT NULL,
                status TEXT DEFAULT 'accepted',
                UNIQUE(user_id, friend_id)
            );
        `).run();
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS user_gifts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sender_id INTEGER NOT NULL,
                receiver_id INTEGER NOT NULL,
                gift_type TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
        `).run();
    } catch(e) {}

    let profileUser = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(targetId).first();
    if (!profileUser) {
        return new Response("Không tìm thấy thành viên!", { status: 404 });
    }

    const isOwner = (targetId === user.id);
    const canModerate = isStaffOrAdmin(user);

    // Xác định bảng bài viết đang dùng (ưu tiên `feeds`, fallback `posts`)
    let feedTable = 'feeds';
    try {
        await env.DB.prepare("SELECT 1 FROM feeds LIMIT 1").first();
    } catch (e) {
        try {
            await env.DB.prepare("SELECT 1 FROM posts LIMIT 1").first();
            feedTable = 'posts';
        } catch (e2) {}
    }

    if (request.method === 'POST') {
        const formData = await request.formData();
        const action = formData.get('action');

        try {
            if (action === 'wall_post') {
                const postContent = (formData.get('content') || '').trim();
                const postImage = (formData.get('image_url') || '').trim();
                if (!postContent && !postImage) throw new Error("Vui lòng nhập nội dung hoặc ảnh trước khi đăng bài!");

                const nowSec = Math.floor(Date.now() / 1000);
                try {
                    await env.DB.prepare(
                        `INSERT INTO ${feedTable} (user_id, content, image_url, created_at) VALUES (?, ?, ?, ?)`
                    ).bind(user.id, postContent, postImage || null, nowSec).run();
                } catch (eInsert) {
                    try {
                        await env.DB.prepare(
                            `INSERT INTO ${feedTable} (user_id, content, created_at) VALUES (?, ?, ?)`
                        ).bind(user.id, postContent, nowSec).run();
                    } catch (eInsert2) {
                        await env.DB.prepare(
                            `INSERT INTO ${feedTable} (user_id, content) VALUES (?, ?)`
                        ).bind(user.id, postContent).run();
                    }
                }
                message = `<div style="color: #00ff00; background: #001a00; border: 1px solid #005500; padding: 6px; text-align: center; margin-bottom: 8px;">✅ Đăng bài lên tường nhà thành công!</div>`;
            } else if (action === 'delete_post') {
                const postId = parseInt(formData.get('post_id') || '0');
                if (!postId) throw new Error("ID bài viết không hợp lệ!");
                const postRow = await env.DB.prepare(`SELECT id, user_id FROM ${feedTable} WHERE id = ?`).bind(postId).first();
                if (!postRow) throw new Error("Bài viết không tồn tại hoặc đã bị xóa!");
                if (!canModerate && Number(postRow.user_id) !== Number(user.id)) {
                    throw new Error("Bạn không có quyền quản lý xóa bài viết này!");
                }
                await env.DB.prepare(`DELETE FROM ${feedTable} WHERE id = ?`).bind(postId).run();
                message = `<div style="color: #ffcc00; background: #1a1500; border: 1px solid #665500; padding: 6px; text-align: center; margin-bottom: 8px;">🗑️ Đã xóa bài viết #${postId}!</div>`;
            } else if (action === 'like_post') {
                const postId = parseInt(formData.get('post_id') || '0');
                if (!postId) throw new Error("ID bài viết không hợp lệ!");
                try {
                    await env.DB.prepare(`UPDATE ${feedTable} SET likes_count = COALESCE(likes_count, 0) + 1 WHERE id = ?`).bind(postId).run();
                } catch (eLike) {
                    try {
                        await env.DB.prepare(`UPDATE ${feedTable} SET likes = COALESCE(likes, 0) + 1 WHERE id = ?`).bind(postId).run();
                    } catch (eLike2) {}
                }
            } else if (isOwner) {
                if (action === 'update_cover') {
                    const coverPhoto = formData.get('cover_photo');
                    if (!coverPhoto) throw new Error("Vui lòng chọn ảnh bìa hợp lệ!");
                    await env.DB.prepare("UPDATE users SET cover_photo = ? WHERE id = ?").bind(coverPhoto.trim(), user.id).run();
                    message = `<div style="color: #00ff00; background: #001a00; border: 1px solid #005500; padding: 6px; text-align: center; margin-bottom: 8px;">✅ Cập nhật ảnh bìa thành công!</div>`;
                } else if (action === 'delete_cover') {
                    await env.DB.prepare("UPDATE users SET cover_photo = NULL WHERE id = ?").bind(user.id).run();
                    message = `<div style="color: #ffcc00; background: #1a1a00; border: 1px solid #555500; padding: 6px; text-align: center; margin-bottom: 8px;">⚠️ Đã xóa ảnh bìa!</div>`;
                } else if (action === 'update_avatar') {
                    const avatar = formData.get('avatar');
                    if (!avatar) throw new Error("Vui lòng chọn ảnh đại diện hợp lệ!");
                    await env.DB.prepare("UPDATE users SET avatar = ? WHERE id = ?").bind(avatar.trim(), user.id).run();
                    message = `<div style="color: #00ff00; background: #001a00; border: 1px solid #005500; padding: 6px; text-align: center; margin-bottom: 8px;">✅ Cập nhật ảnh đại diện thành công!</div>`;
                } else if (action === 'update_info') {
                    const displayName = (formData.get('display_name') || '').trim();
                    const gender = formData.get('gender') || 'Chưa cập nhật';
                    const relationship = formData.get('relationship') || 'Đang độc thân';
                    const province = (formData.get('province') || '').trim();
                    const birthday = (formData.get('birthday') || '').trim();
                    const newPassword = (formData.get('new_password') || '').trim();

                    if (!displayName) throw new Error("Tên hiển thị không được để trống!");

                    if (newPassword) {
                        await env.DB.prepare("UPDATE users SET display_name = ?, gender = ?, relationship = ?, province = ?, birthday = ?, password = ? WHERE id = ?")
                            .bind(displayName, gender, relationship, province, birthday, newPassword, user.id).run();
                    } else {
                        await env.DB.prepare("UPDATE users SET display_name = ?, gender = ?, relationship = ?, province = ?, birthday = ? WHERE id = ?")
                            .bind(displayName, gender, relationship, province, birthday, user.id).run();
                    }
                    message = `<div style="color: #00ff00; background: #001a00; border: 1px solid #005500; padding: 6px; text-align: center; margin-bottom: 8px;">✅ Đã lưu cài đặt thông tin cá nhân!</div>`;
                }
            } else {
                if (action === 'toggle_follow') {
                    const exists = await env.DB.prepare("SELECT id FROM follows WHERE follower_id = ? AND following_id = ?").bind(user.id, targetId).first();
                    if (exists) {
                        await env.DB.prepare("DELETE FROM follows WHERE follower_id = ? AND following_id = ?").bind(user.id, targetId).run();
                    } else {
                        await env.DB.prepare("INSERT INTO follows (follower_id, following_id) VALUES (?, ?)").bind(user.id, targetId).run();
                    }
                } else if (action === 'toggle_friend') {
                    const exists = await env.DB.prepare("SELECT id FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)").bind(user.id, targetId, targetId, user.id).first();
                    if (exists) {
                        await env.DB.prepare("DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)").bind(user.id, targetId, targetId, user.id).run();
                    } else {
                        await env.DB.prepare("INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, 'accepted')").bind(user.id, targetId).run();
                    }
                } else if (action === 'send_gift') {
                    const giftType = formData.get('gift_type');
                    if ((user.coins || 0) < 100) throw new Error("Bạn không đủ 100 Xu để tặng quà!");
                    await env.DB.prepare("UPDATE users SET coins = coins - 100 WHERE id = ?").bind(user.id).run();
                    await env.DB.prepare("INSERT INTO user_gifts (sender_id, receiver_id, gift_type) VALUES (?, ?, ?)").bind(user.id, targetId, giftType).run();
                    message = `<div style="color: #00ff00; text-align: center; margin-bottom: 6px;">🎁 Tặng quà thành công (-100 Xu)!</div>`;
                }
            }
            profileUser = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(targetId).first();
        } catch (e) {
            message = `<div style="color: #ff5555; background: #1a0000; border: 1px solid #550000; padding: 6px; text-align: center; margin-bottom: 8px;">❌ Lỗi: ${escapeHtml(e.message)}</div>`;
        }
    }

    const rProfile = renderUser(profileUser);
    const pIcon = profileUser.active_icon ? `${profileUser.active_icon} ` : '';
    const followingRow = await env.DB.prepare("SELECT COUNT(*) as total FROM follows WHERE follower_id = ?").bind(targetId).first();
    const followerRow = await env.DB.prepare("SELECT COUNT(*) as total FROM follows WHERE following_id = ?").bind(targetId).first();
    const friendsRow = await env.DB.prepare("SELECT COUNT(*) as total FROM friends WHERE user_id = ? OR friend_id = ?").bind(targetId, targetId).first();

    let isFollowing = false, isFriend = false;
    if (!isOwner) {
        const fCheck = await env.DB.prepare("SELECT id FROM follows WHERE follower_id = ? AND following_id = ?").bind(user.id, targetId).first();
        const frCheck = await env.DB.prepare("SELECT id FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)").bind(user.id, targetId, targetId, user.id).first();
        isFollowing = !!fCheck;
        isFriend = !!frCheck;
    }

    const giftRows = await env.DB.prepare("SELECT gift_type, COUNT(*) as cnt FROM user_gifts WHERE receiver_id = ? GROUP BY gift_type").bind(targetId).all();
    const giftCounts = { love: 0, kiss: 0, ring: 0, flower: 0 };
    let totalGifts = 0;
    for (const r of (giftRows.results || [])) {
        if (giftCounts[r.gift_type] !== undefined) giftCounts[r.gift_type] = r.cnt;
        totalGifts += r.cnt;
    }

    let postCount = 0;
    let userPosts = [];
    try {
        const pRow = await env.DB.prepare(`SELECT COUNT(*) as total FROM ${feedTable} WHERE user_id = ?`).bind(targetId).first();
        postCount = pRow?.total || 0;

        const pList = await env.DB.prepare(`SELECT * FROM ${feedTable} WHERE user_id = ? ORDER BY id DESC LIMIT 20`).bind(targetId).all();
        userPosts = pList.results || [];
    } catch(e) {}

    const hasCover = (profileUser.cover_photo && !profileUser.cover_photo.includes('7gXvS6v'));
    const coverStyle = hasCover ? `background: url('${profileUser.cover_photo}') center/cover no-repeat;` : `background: linear-gradient(135deg, #0a1f0a 0%, #151515 50%, #051428 100%);`;
    const avatarSrc = profileUser.avatar && !profileUser.avatar.includes('7gXvS6v')
        ? profileUser.avatar
        : "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100' height='100' fill='%231a1a1a'/><circle cx='50' cy='38' r='18' fill='%2300ff00'/></svg>";

    const wallPostsHtml = userPosts.length === 0
        ? `<div style="color: #888; text-align: center; padding: 14px; font-size: 12px;">Chưa có bài đăng nào.</div>`
        : userPosts.map((post) => {
            const postId = Number(post.id || 0);
            const rawText = post.content || post.body || post.caption || '';
            const imgUrl = post.image_url || post.image || post.media_url || '';
            const timeAgo = formatTimeAgo(post.created_at || post.time || post.createdAt);
            const likesCount = Number(post.likes_count ?? post.likes ?? 0);
            const commentsCount = Number(post.comments_count ?? post.comments ?? 0);
            const canDeleteThisPost = canModerate || Number(post.user_id) === Number(user.id);

            return `
            <div style="background: #141414; border: 1px solid #2b2b2b; border-radius: 4px; padding: 10px; margin-top: 8px;">
                <!-- Header bài đăng -->
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <img src="${avatarSrc}" width="34" height="34" style="${rProfile.avatarStyle} display: block;">
                        <div>
                            <div style="font-size: 13px; line-height: 1.2;">${rProfile.nameHtml}</div>
                            <div style="font-size: 11px; color: #999; margin-top: 2px;">🕒 ${escapeHtml(timeAgo)} · 🌐 Công khai</div>
                        </div>
                    </div>

                    ${canDeleteThisPost ? `
                    <form method="POST" style="margin: 0;" onsubmit="return confirm('Xóa bài đăng này khỏi hệ thống?');">
                        <input type="hidden" name="action" value="delete_post">
                        <input type="hidden" name="post_id" value="${postId}">
                        <button type="submit" style="background: #2b0909; color: #ff6666; border: 1px solid #661a1a; border-radius: 3px; padding: 2px 7px; font-size: 10px; font-weight: bold; cursor: pointer;">🗑️ Xóa bài</button>
                    </form>
                    ` : `<span style="color: #666; font-size: 12px;">⋮</span>`}
                </div>

                <!-- Nội dung bài đăng -->
                ${rawText ? `<div style="font-size: 13px; color: #f2f2f2; line-height: 1.6; white-space: pre-wrap; text-align: center; margin-bottom: ${imgUrl ? '10px' : '6px'};">${escapeHtml(rawText)}</div>` : ''}

                <!-- Ảnh bài đăng -->
                ${imgUrl ? `
                <div style="text-align: center; background: #080808; border: 1px solid #222; border-radius: 4px; overflow: hidden; margin-bottom: 8px;">
                    <img src="${escapeHtml(imgUrl)}" alt="Ảnh bài đăng" style="max-width: 100%; max-height: 380px; object-fit: contain; display: block; margin: 0 auto;">
                </div>
                ` : ''}

                <!-- Hàng dưới: Icon tim và icon bình luận kế bên nhau -->
                <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid #242424; padding-top: 7px; font-size: 12px;">
                    <div style="display: flex; align-items: center; gap: 14px;">
                        <form method="POST" style="margin: 0; display: inline-flex; align-items: center;">
                            <input type="hidden" name="action" value="like_post">
                            <input type="hidden" name="post_id" value="${postId}">
                            <button type="submit" title="Thích bài viết" style="background: none; border: none; color: #ff3b5c; font-size: 13px; font-weight: bold; cursor: pointer; padding: 0; display: inline-flex; align-items: center; gap: 4px;">
                                <span>❤️</span>
                                <span style="color: #ddd; font-size: 12px;">${likesCount}</span>
                            </button>
                        </form>

                        <a href="/users/feed?post=${postId}#comment" title="Bình luận bài viết" style="color: #ccc; text-decoration: none; font-size: 13px; display: inline-flex; align-items: center; gap: 4px;">
                            <span>💬</span>
                            <span style="color: #ddd; font-size: 12px;">${commentsCount}</span>
                        </a>
                    </div>

                    ${canModerate ? `<span style="font-size: 10px; color: #ffcc00;">[Quản lý #${postId}]</span>` : ''}
                </div>
            </div>`;
        }).join('');

    const content = `
    <div class="box" style="margin-bottom: 8px; border: 1px solid #333;">
        <div class="box-title" style="display: flex; justify-content: space-between; align-items: center;">
            <span>📁 ${isOwner ? 'Hồ sơ của tôi' : 'Hồ sơ thành viên'}</span>
            ${isOwner ? `<button type="button" onclick="openSettingsModal()" style="background: #1c1c1c; color: #ffcc00; border: 1px solid #444; padding: 2px 6px; font-size: 10px; cursor: pointer;">⚙️ Cài đặt thông tin</button>` : `<span style="font-size: 10px; color: #aaa;">ID: ${profileUser.id}</span>`}
        </div>
        
        <div style="position: relative; background: #111; border-bottom: 1px solid #333; text-align: center;">
            <div style="height: 120px; ${coverStyle}"></div>
            
            ${isOwner ? `
            <div style="position: absolute; right: 6px; bottom: 6px; display: flex; gap: 4px;">
                <button type="button" onclick="openCoverModal()" class="btn" style="background: rgba(0,0,0,0.85); color: #fff; border: 1px solid #555; padding: 3px 7px; font-size: 10px; cursor: pointer;">📷 Đổi ảnh bìa</button>
                ${hasCover ? `
                <form method="POST" style="margin: 0;" onsubmit="return confirm('Xóa ảnh bìa?');">
                    <input type="hidden" name="action" value="delete_cover">
                    <button type="submit" class="btn" style="background: rgba(120,0,0,0.9); color: #fff; padding: 3px 7px; font-size: 10px;">🗑️ Xóa</button>
                </form>` : ''}
            </div>
            ` : ''}

            <!-- Avatar kèm nút icon máy ảnh mở modal -->
            <div style="position: relative; margin-top: -35px; margin-bottom: 4px; display: inline-block;">
                <img src="${avatarSrc}" width="66" height="66" style="${rProfile.avatarStyle} display: block;">
                ${isOwner ? `<button type="button" onclick="openAvatarModal()" title="Đổi ảnh đại diện" style="position: absolute; bottom: -2px; right: -2px; background: #111; color: #00ff00; border: 1px solid #00ff00; border-radius: 50%; width: 22px; height: 22px; font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; box-shadow: 0 0 4px #000;">📷</button>` : ''}
            </div>
            
            <div style="font-size: 13px; margin-bottom: 2px;">
                ${rProfile.nameHtml}
                <span style="color: #ffcc00; font-size: 11px;">[Lv.${profileUser.level || 1}]</span>
            </div>

            <!-- Hiển thị phân biệt: Quản lý có khung, Thành viên hiển thị chữ bình thường -->
            <div style="text-align: center; font-size: 13px; margin: 6px 0 10px 0;">
                <span style="color: #aaa; font-size: 11px;">ID ${profileUser.id}</span> 
                <span style="margin: 0 4px; color: #666;">·</span> 
                ${(profileUser.role && profileUser.role !== 'Thành Viên') ? `
                    <span style="display: inline-block; background: #1a1a1a; border: 1px solid #444; color: #ffcc00; font-size: 11px; font-weight: bold; padding: 2px 8px; border-radius: 4px; text-shadow: 0 0 4px rgba(255,204,0,0.4);">
                        ${profileUser.role}
                    </span>
                ` : `
                    <span style="color: #00ff00; font-size: 12px;">${profileUser.role || 'Thành Viên'}</span>
                `}
            </div>
            ${!isOwner ? `
            <div style="padding-bottom: 8px; display: flex; justify-content: center; gap: 6px;">
                <form method="POST" style="margin: 0;"><input type="hidden" name="action" value="toggle_follow"><button type="submit" class="btn" style="font-size: 10px; padding: 3px 8px; background: ${isFollowing ? '#333' : '#0055ff'}; color: #fff;">${isFollowing ? '✓ Đang Follow' : '+ Follow'}</button></form>
                <form method="POST" style="margin: 0;"><input type="hidden" name="action" value="toggle_friend"><button type="submit" class="btn" style="font-size: 10px; padding: 3px 8px; background: ${isFriend ? '#333' : '#008800'}; color: #fff;">${isFriend ? '👥 Bạn bè' : '+ Kết bạn'}</button></form>
                <a href="/mail/chat?user=${profileUser.id}" class="btn" style="font-size: 10px; padding: 3px 8px;">✉️ Nhắn tin</a>
            </div>
            ` : ''}
        </div>

        ${message}

        <div style="background: #141414; padding: 6px; text-align: center; border-bottom: 1px solid #333; font-size: 11px;">
            <span style="color: #ffcc00; margin: 0 8px;">Đang Follow <b>${followingRow?.total || 0}</b></span> · 
            <span style="color: #ffcc00; margin: 0 8px;">Follower <b>${followerRow?.total || 0}</b></span> · 
            <span style="color: #ffcc00; margin: 0 8px;">Bạn bè <b>${friendsRow?.total || 0}</b></span>
        </div>
    </div>

    <!-- Hộp Quà tặng -->
    ${(() => {
        const activeGifts = [];
        if (giftCounts.love > 0) {
            activeGifts.push(`
                <div>
                    <div style="font-size: 16px;">🎁</div>
                    <div style="font-size: 11px; color: #ff55ff;">${giftCounts.love}</div>
                    <div>Lời tỏ tình</div>
                    ${isOwner ? `<form method="POST" style="margin: 0;"><input type="hidden" name="action" value="return_gift"><input type="hidden" name="gift_type" value="love"><button type="submit" style="background: none; border: none; color: #ff55ff; font-size: 9px; cursor: pointer; text-decoration: underline;">Trả về</button></form>` : ''}
                </div>
            `);
        }
        if (giftCounts.ring > 0) {
            activeGifts.push(`
                <div>
                    <div style="font-size: 16px;">💍</div>
                    <div style="font-size: 11px; color: #ff55ff;">${giftCounts.ring}</div>
                    <div>Nụ hôn</div>
                    ${isOwner ? `<form method="POST" style="margin: 0;"><input type="hidden" name="action" value="return_gift"><input type="hidden" name="gift_type" value="ring"><button type="submit" style="background: none; border: none; color: #ff55ff; font-size: 9px; cursor: pointer; text-decoration: underline;">Trả về</button></form>` : ''}
                </div>
            `);
        }
        if (giftCounts.flower > 0) {
            activeGifts.push(`
                <div>
                    <div style="font-size: 16px;">🌹</div>
                    <div style="font-size: 11px; color: #ff55ff;">${giftCounts.flower}</div>
                    <div>Lố tình yêu</div>
                    ${isOwner ? `<form method="POST" style="margin: 0;"><input type="hidden" name="action" value="return_gift"><input type="hidden" name="gift_type" value="flower"><button type="submit" style="background: none; border: none; color: #ff55ff; font-size: 9px; cursor: pointer; text-decoration: underline;">Trả về</button></form>` : ''}
                </div>
            `);
        }
        if (giftCounts.rose > 0) {
            activeGifts.push(`
                <div>
                    <div style="font-size: 16px;">🌸</div>
                    <div style="font-size: 11px; color: #ff55ff;">${giftCounts.rose}</div>
                    <div>Thích bạn</div>
                    ${isOwner ? `<form method="POST" style="margin: 0;"><input type="hidden" name="action" value="return_gift"><input type="hidden" name="gift_type" value="rose"><button type="submit" style="background: none; border: none; color: #ff55ff; font-size: 9px; cursor: pointer; text-decoration: underline;">Trả về</button></form>` : ''}
                </div>
            `);
        }

        if (activeGifts.length === 0) return '';

        return `
            <div class="box" style="max-width: 600px; margin: 0 auto 8px auto;">
                <div class="box-title" style="display: flex; justify-content: space-between; align-items: center;">
                    <span>Quà tặng</span>
                    <span style="font-size: 10px; color: #ffcc00;">Tổng: ${totalGifts}</span>
                </div>
                <div class="box-content" style="display: flex; justify-content: space-around; text-align: center; font-size: 10px; color: #aaa;">
                    ${activeGifts.join('')}
                </div>
            </div>
        `;
    })()}

    <!-- Thông tin chi tiết -->
    <div class="box" style="max-width: 654px; margin: 0 auto 8px auto;">
        <div class="box-title" style="display: flex; justify-content: space-between; align-items: center;">
            <span>Thông tin chi tiết</span>
            ${isOwner ? `<a href="javascript:void(0)" onclick="openSettingsModal()" style="font-size: 10px; color: #ffcc00;">[Chỉnh sửa]</a>` : ''}
        </div>
        <div class="box-content" style="font-size: 13px; line-height: 1.8; padding: 8px;">
            <div>❤️ Hẹn hò: <b>${profileUser.relationships || profileUser.relationship || 'Đang độc thân'}</b></div>
            <div>👤 Giới tính: <b>${profileUser.gender || 'Chưa cập nhật'}</b></div>
            <div>⭐ Level: <b style="color: #ffcc00;">${profileUser.level || 1}</b> - <a href="/profile/level" style="color: #00ff00;">Kiểm tra</a></div>
            <div>🪙 Xu: <b style="color: #00ff00;">${(profileUser.coins || 0).toLocaleString()} Xu</b></div>
            <div>💰 Vàng: <b style="color: #ffcc00;">${(profileUser.gold || 0).toLocaleString()} Vàng</b></div>
            <div>📝 Bài viết: <b>${postCount}</b></div>
            <div>🏙️ Tỉnh thành: <b>${profileUser.province || 'Chưa cập nhật'}</b></div>
            <div>🎂 Sinh nhật: <b>${profileUser.birthday || 'Chưa cập nhật'}</b></div>
            <div>📅 Ngày đăng ký: <b>${profileUser.created_at || 'Thành viên hệ thống'}</b></div>
        </div>
    </div>

    <!-- Tường nhà & Bài đã đăng -->
    <div class="box" style="max-width: 654px; margin: 0 auto 8px auto;">
        <div class="box-title" style="display: flex; justify-content: space-between; align-items: center;">
            <span>🏠 Tường nhà</span>
            <span style="font-size: 11px; color: #ccc;">${postCount} bài đăng</span>
        </div>
        <div class="box-content" style="padding: 8px;">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <button type="button" onclick="toggleWallForm()" style="background: #1a1a1a; color: #fff; border: 1px solid #444; border-radius: 4px; padding: 5px 10px; font-size: 12px; font-weight: bold; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;">
                    <span>📝</span> Đăng bài
                </button>
                ${canModerate ?  : ''}
            </div>

            <!-- Form đăng bài (ẩn/hiện khi bấm nút Đăng bài) -->
            <div id="wall-post-form" style="display: none; background: #101010; border: 1px solid #333; border-radius: 4px; padding: 8px; margin-top: 8px;">
                <form method="POST">
                    <input type="hidden" name="action" value="wall_post">
                    <textarea name="content" rows="3" placeholder="${isOwner ? 'Bạn đang nghĩ gì?' : `Viết gì đó lên tường của ${escapeHtml(profileUser.display_name || profileUser.username || 'thành viên')}...`}" style="width: 100%; background: #000; color: #fff; border: 1px solid #444; border-radius: 4px; padding: 6px; box-sizing: border-box; font-size: 12px; margin-bottom: 6px; resize: vertical;"></textarea>
                    <input type="text" name="image_url" placeholder="Link ảnh đính kèm (tùy chọn, https://...)" style="width: 100%; background: #000; color: #fff; border: 1px solid #444; border-radius: 4px; padding: 6px; box-sizing: border-box; font-size: 12px; margin-bottom: 8px;">
                    <div style="display: flex; gap: 6px; justify-content: flex-end;">
                        <button type="button" onclick="toggleWallForm()" class="btn" style="background: #2b2b2b; color: #ccc; padding: 4px 10px; font-size: 11px;">Hủy</button>
                        <button type="submit" class="btn" style="background: #0055ff; color: #fff; padding: 4px 12px; font-size: 11px; font-weight: bold;">Đăng ngay</button>
                    </div>
                </form>
            </div>

            <!-- Danh sách bài đã đăng -->
            <div style="margin-top: 4px;">
                ${wallPostsHtml}
            </div>
        </div>
    </div>

    <!-- Popup Modal Cài đặt thông tin -->
    ${isOwner ? `
    <div id="settings-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.88); z-index: 999; justify-content: center; align-items: center; padding: 10px; box-sizing: border-box;">
        <div style="background: #111; border: 1px solid #444; width: 100%; max-width: 400px; padding: 12px; box-sizing: border-box; max-height: 90vh; overflow-y: auto;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 6px; margin-bottom: 10px;">
                <b style="color: #00ff00; font-size: 12px;">⚙️ Cài đặt thông tin cá nhân</b>
                <button type="button" onclick="closeSettingsModal()" style="background:none; border:none; color:#ff5555; font-weight:bold; cursor:pointer;">✕</button>
            </div>
            <form method="POST">
                <input type="hidden" name="action" value="update_info">
                <label style="color: #00ff00; display: block; margin-bottom: 2px; font-size: 11px;">Tên hiển thị:</label>
                <input type="text" name="display_name" value="${escapeHtml(profileUser.display_name || '')}" required style="width: 100%; background: #000; color: #fff; border: 1px solid #444; padding: 6px; box-sizing: border-box; margin-bottom: 8px; font-size: 11px;">
                <label style="color: #00ff00; display: block; margin-bottom: 2px; font-size: 11px;">Giới tính:</label>
                <select name="gender" style="width: 100%; background: #000; color: #fff; border: 1px solid #444; padding: 6px; box-sizing: border-box; margin-bottom: 8px; font-size: 11px;">
                    <option value="Nam" ${profileUser.gender === 'Nam' ? 'selected' : ''}>Nam</option>
                    <option value="Nữ" ${profileUser.gender === 'Nữ' ? 'selected' : ''}>Nữ</option>
                    <option value="Khác" ${profileUser.gender === 'Khác' ? 'selected' : ''}>Khác</option>
                </select>
                <label style="color: #00ff00; display: block; margin-bottom: 2px; font-size: 11px;">Hẹn hò:</label>
                <select name="relationship" style="width: 100%; background: #000; color: #fff; border: 1px solid #444; padding: 6px; box-sizing: border-box; margin-bottom: 8px; font-size: 11px;">
                    <option value="Đang độc thân" ${profileUser.relationship === 'Đang độc thân' ? 'selected' : ''}>Đang độc thân</option>
                    <option value="Đang hẹn hò" ${profileUser.relationship === 'Đang hẹn hò' ? 'selected' : ''}>Đang hẹn hò</option>
                    <option value="Đã kết hôn" ${profileUser.relationship === 'Đã kết hôn' ? 'selected' : ''}>Đã kết hôn</option>
                </select>
                <label style="color: #00ff00; display: block; margin-bottom: 2px; font-size: 11px;">Tỉnh thành:</label>
                <input type="text" name="province" value="${escapeHtml(profileUser.province || '')}" style="width: 100%; background: #000; color: #fff; border: 1px solid #444; padding: 6px; box-sizing: border-box; margin-bottom: 8px; font-size: 11px;">
                <label style="color: #00ff00; display: block; margin-bottom: 2px; font-size: 11px;">Sinh nhật:</label>
                <input type="text" name="birthday" value="${escapeHtml(profileUser.birthday || '')}" style="width: 100%; background: #000; color: #fff; border: 1px solid #444; padding: 6px; box-sizing: border-box; margin-bottom: 8px; font-size: 11px;">
                <button type="submit" class="btn" style="width: 100%; background: #0055ff; color: #fff; padding: 6px;">Lưu cài đặt</button>
            </form>
        </div>
    </div>
    ` : ''}

    <!-- Popup Modal Đổi Avatar (Có kéo/zoom) -->
    <div id="avatar-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.88); z-index: 999; justify-content: center; align-items: center; padding: 10px; box-sizing: border-box;">
        <div style="background: #111; border: 1px solid #444; width: 100%; max-width: 380px; padding: 12px; box-sizing: border-box; text-align: center;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 6px; margin-bottom: 8px;">
                <b style="color: #00ff00; font-size: 12px;">📷 Tùy chỉnh Ảnh đại diện</b>
                <button type="button" onclick="closeAvatarModal()" style="background:none; border:none; color:#ff5555; font-weight:bold; cursor:pointer;">✕</button>
            </div>
            <input type="file" accept="image/*" onchange="initImageEditor(this, 'avatar-editor-container', 200, 200)" style="width: 100%; font-size: 11px; color: #ccc; margin-bottom: 8px; background: #000; border: 1px solid #444; padding: 4px;">
            <div id="avatar-editor-container" style="position: relative; width: 200px; height: 200px; margin: 0 auto 8px auto; background: #000; border: 2px dashed #00ff00; overflow: hidden; cursor: grab; display: none;">
                <img id="avatar-edit-img" style="position: absolute; top: 0; left: 0; transform-origin: top left; pointer-events: none;">
            </div>
            <form method="POST">
                <input type="hidden" name="action" value="update_avatar">
                <input type="hidden" id="avatar-input-val" name="avatar" required>
                <div style="display: flex; gap: 6px;">
                    <button type="submit" id="btn-save-avatar" class="btn" style="background: #0055ff; color: #fff; flex: 1; display: none;">Lưu Avatar</button>
                    <button type="button" onclick="closeAvatarModal()" class="btn" style="background: #333; color: #ccc; flex: 1;">Đóng</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Popup Modal Đổi Ảnh bìa -->
    <div id="cover-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.88); z-index: 999; justify-content: center; align-items: center; padding: 10px; box-sizing: border-box;">
        <div style="background: #111; border: 1px solid #444; width: 100%; max-width: 380px; padding: 12px; box-sizing: border-box; text-align: center;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 6px; margin-bottom: 8px;">
                <b style="color: #ffcc00; font-size: 12px;">🖼️ Tùy chỉnh Ảnh bìa</b>
                <button type="button" onclick="closeCoverModal()" style="background:none; border:none; color:#ff5555; font-weight:bold; cursor:pointer;">✕</button>
            </div>
            <input type="file" accept="image/*" onchange="initImageEditor(this, 'cover-editor-container', 320, 120)" style="width: 100%; font-size: 11px; color: #ccc; margin-bottom: 8px; background: #000; border: 1px solid #444; padding: 4px;">
            <div id="cover-editor-container" style="position: relative; width: 320px; height: 120px; margin: 0 auto 8px auto; background: #000; border: 2px dashed #ffcc00; overflow: hidden; cursor: grab; display: none;">
                <img id="cover-edit-img" style="position: absolute; top: 0; left: 0; transform-origin: top left; pointer-events: none;">
            </div>
            <form method="POST">
                <input type="hidden" name="action" value="update_cover">
                <input type="hidden" id="cover-input-val" name="cover_photo" required>
                <div style="display: flex; gap: 6px;">
                    <button type="submit" id="btn-save-cover" class="btn" style="background: #0055ff; color: #fff; flex: 1; display: none;">Lưu Ảnh Bìa</button>
                    <button type="button" onclick="closeCoverModal()" class="btn" style="background: #333; color: #ccc; flex: 1;">Đóng</button>
                </div>
            </form>
        </div>
    </div>

    <!-- JavaScript kích hoạt Modal, Tường nhà và Cắt/Kéo ảnh -->
    <script>
        function toggleWallForm() {
            const formBox = document.getElementById('wall-post-form');
            if (!formBox) return;
            formBox.style.display = (formBox.style.display === 'none' || !formBox.style.display) ? 'block' : 'none';
        }

        function openSettingsModal() { document.getElementById('settings-modal').style.display = 'flex'; }
        function closeSettingsModal() { document.getElementById('settings-modal').style.display = 'none'; }
        
        function openAvatarModal() { document.getElementById('avatar-modal').style.display = 'flex'; }
        function closeAvatarModal() { document.getElementById('avatar-modal').style.display = 'none'; }
        
        function openCoverModal() { document.getElementById('cover-modal').style.display = 'flex'; }
        function closeCoverModal() { document.getElementById('cover-modal').style.display = 'none'; }

        let editorState = { prefix: '', container: null, imgEl: null, inputVal: null, btnSave: null, boxW: 0, boxH: 0, natW: 0, natH: 0, posX: 0, posY: 0, scale: 1, isDragging: false, startX: 0, startY: 0 };

        function initImageEditor(fileInput, containerId, boxW, boxH) {
            const file = fileInput.files[0];
            if (!file) return;
            const prefix = containerId.includes('avatar') ? 'avatar' : 'cover';
            editorState.prefix = prefix;
            editorState.boxW = boxW;
            editorState.boxH = boxH;
            editorState.container = document.getElementById(containerId);
            editorState.imgEl = document.getElementById(prefix + '-edit-img');
            editorState.inputVal = document.getElementById(prefix + '-input-val');
            editorState.btnSave = document.getElementById('btn-save-' + prefix);

            const reader = new FileReader();
            reader.onload = function(e) {
                const img = new Image();
                img.onload = function() {
                    editorState.natW = img.width;
                    editorState.natH = img.height;
                    editorState.imgEl.src = img.src;
                    const scaleX = boxW / img.width;
                    const scaleY = boxH / img.height;
                    editorState.scale = Math.max(scaleX, scaleY);
                    editorState.posX = (boxW - img.width * editorState.scale) / 2;
                    editorState.posY = (boxH - img.height * editorState.scale) / 2;
                    updateTransform();
                    editorState.container.style.display = 'block';
                    editorState.btnSave.style.display = 'block';
                    setupDragEvents();
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }

        function updateTransform() {
            editorState.imgEl.style.width = editorState.natW + 'px';
            editorState.imgEl.style.height = editorState.natH + 'px';
            editorState.imgEl.style.transform = \`translate(\${editorState.posX}px, \${editorState.posY}px) scale(\${editorState.scale})\`;
            
            const canvas = document.createElement('canvas');
            canvas.width = editorState.boxW;
            canvas.height = editorState.boxH;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.save();
            ctx.translate(editorState.posX, editorState.posY);
            ctx.scale(editorState.scale, editorState.scale);
            ctx.drawImage(editorState.imgEl, 0, 0);
            ctx.restore();
            editorState.inputVal.value = canvas.toDataURL('image/jpeg', 0.85);
        }

        function setupDragEvents() {
            const el = editorState.container;
            el.onmousedown = function(e) {
                editorState.isDragging = true;
                editorState.startX = e.clientX - editorState.posX;
                editorState.startY = e.clientY - editorState.posY;
            };
            window.onmousemove = function(e) {
                if (!editorState.isDragging) return;
                editorState.posX = e.clientX - editorState.startX;
                editorState.posY = e.clientY - editorState.startY;
                updateTransform();
            };
            window.onmouseup = function() { editorState.isDragging = false; };
            el.ontouchstart = function(e) {
                if (e.touches.length === 1) {
                    editorState.isDragging = true;
                    editorState.startX = e.touches[0].clientX - editorState.posX;
                    editorState.startY = e.touches[0].clientY - editorState.posY;
                }
            };
            window.ontouchmove = function(e) {
                if (!editorState.isDragging || e.touches.length !== 1) return;
                editorState.posX = e.touches[0].clientX - editorState.startX;
                editorState.posY = e.touches[0].clientY - editorState.startY;
                updateTransform();
            };
            window.ontouchend = function() { editorState.isDragging = false; };
        }
    </script>
    `;

    return new Response(renderLayout(isOwner ? 'Trang cá nhân' : `Hồ sơ ${profileUser.display_name || profileUser.username || ''}`, content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
