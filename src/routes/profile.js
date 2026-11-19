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

function isSafeColor(val) {
    return /^#[0-9a-fA-F]{3,8}$/.test(String(val || '').trim());
}

function formatCommentUserStyle(row) {
    const uObj = {
        id: row.user_id,
        username: row.username,
        display_name: row.display_name,
        role: row.role,
        is_admin: row.is_admin,
        active_icon: row.active_icon,
        name_color: row.name_color,
        name_glow: row.name_glow,
        name_border: row.name_border,
        name_border_glow: row.name_border_glow,
        border_color: row.border_color,
        avatar_glow: row.avatar_glow,
        avatar: row.avatar
    };
    const rendered = renderUser(uObj);
    const av = (row.avatar && !String(row.avatar).includes('7gXvS6v'))
        ? row.avatar
        : "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100' height='100' fill='%231a1a1a'/><circle cx='50' cy='38' r='18' fill='%2300ff00'/></svg>";
    return {
        nameHtml: rendered.nameHtml,
        avatarSrc: av,
        avatarStyle: rendered.avatarStyle || 'border-radius: 50%; object-fit: cover;'
    };
}

export async function handleProfile(request, env, user, renderLayout, url) {
    let message = "";
    const targetId = parseInt(url.searchParams.get('user') || user.id);

    const cols = ['name_color', 'name_glow', 'name_border', 'name_border_glow', 'border_color', 'avatar_glow', 'active_icon', 'role', 'is_admin', 'cover_photo', 'gender', 'relationship', 'province', 'birthday', 'online_minutes', 'created_at'];
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
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS wall_post_comments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                post_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                content TEXT NOT NULL,
                created_at INTEGER DEFAULT 0
            );
        `).run();
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS wall_post_likes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                post_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                created_at INTEGER DEFAULT 0,
                UNIQUE(post_id, user_id)
            );
        `).run();
    } catch(e) {}

    let profileUser = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(targetId).first();
    if (!profileUser) {
        return new Response("Không tìm thấy thành viên!", { status: 404 });
    }

    const isOwner = (targetId === user.id);
    const canModerate = isStaffOrAdmin(user);

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
        const isAjax = request.headers.get('X-Requested-With') === 'XMLHttpRequest' || formData.get('ajax') === '1';

        try {
            if (action === 'wall_post') {
                const rawText = (formData.get('content') || '').trim();
                const textColor = isSafeColor(formData.get('text_color')) ? String(formData.get('text_color')).trim() : '';
                const bgColor = isSafeColor(formData.get('bg_color')) ? String(formData.get('bg_color')).trim() : '';
                const textGlow = isSafeColor(formData.get('text_glow')) ? String(formData.get('text_glow')).trim() : '';
                if (!rawText) throw new Error("Vui lòng nhập nội dung trước khi đăng bài!");

                const styleMeta = (textColor || bgColor || textGlow)
                    ? `[style=${encodeURIComponent(JSON.stringify({ c: textColor, b: bgColor, g: textGlow }))}]\n`
                    : '';
                const postContent = `${styleMeta}${rawText}`;

                const nowSec = Math.floor(Date.now() / 1000);
                try {
                    await env.DB.prepare(
                        `INSERT INTO ${feedTable} (user_id, content, created_at) VALUES (?, ?, ?)`
                    ).bind(user.id, postContent, nowSec).run();
                } catch (eInsert) {
                    await env.DB.prepare(
                        `INSERT INTO ${feedTable} (user_id, content) VALUES (?, ?)`
                    ).bind(user.id, postContent).run();
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
                try {
                    await env.DB.prepare(`DELETE FROM wall_post_comments WHERE post_id = ?`).bind(postId).run();
                    await env.DB.prepare(`DELETE FROM wall_post_likes WHERE post_id = ?`).bind(postId).run();
                } catch (eDelMeta) {}
                message = `<div style="color: #ffcc00; background: #1a1500; border: 1px solid #665500; padding: 6px; text-align: center; margin-bottom: 8px;">🗑️ Đã xóa bài viết #${postId}!</div>`;
            } else if (action === 'like_post') {
                const postId = parseInt(formData.get('post_id') || '0');
                if (!postId) throw new Error("ID bài viết không hợp lệ!");

                const existingLike = await env.DB.prepare(
                    `SELECT id FROM wall_post_likes WHERE post_id = ? AND user_id = ?`
                ).bind(postId, user.id).first();

                if (existingLike) {
                    await env.DB.prepare(
                        `DELETE FROM wall_post_likes WHERE post_id = ? AND user_id = ?`
                    ).bind(postId, user.id).run();
                    try {
                        await env.DB.prepare(`UPDATE ${feedTable} SET likes_count = MAX(0, COALESCE(likes_count, 0) - 1) WHERE id = ?`).bind(postId).run();
                    } catch (eLikeDec) {
                        try {
                            await env.DB.prepare(`UPDATE ${feedTable} SET likes = MAX(0, COALESCE(likes, 0) - 1) WHERE id = ?`).bind(postId).run();
                        } catch (eLikeDec2) {}
                    }
                } else {
                    const nowSec = Math.floor(Date.now() / 1000);
                    await env.DB.prepare(
                        `INSERT INTO wall_post_likes (post_id, user_id, created_at) VALUES (?, ?, ?)`
                    ).bind(postId, user.id, nowSec).run();
                    try {
                        await env.DB.prepare(`UPDATE ${feedTable} SET likes_count = COALESCE(likes_count, 0) + 1 WHERE id = ?`).bind(postId).run();
                    } catch (eLikeInc) {
                        try {
                            await env.DB.prepare(`UPDATE ${feedTable} SET likes = COALESCE(likes, 0) + 1 WHERE id = ?`).bind(postId).run();
                        } catch (eLikeInc2) {}
                    }
                }
            } else if (action === 'comment_post') {
                const postId = parseInt(formData.get('post_id') || '0');
                const commentText = (formData.get('comment_content') || '').trim();
                if (!postId) throw new Error("ID bài viết không hợp lệ!");
                if (!commentText) throw new Error("Vui lòng nhập nội dung bình luận!");

                const nowSec = Math.floor(Date.now() / 1000);
                const insRes = await env.DB.prepare(
                    `INSERT INTO wall_post_comments (post_id, user_id, content, created_at) VALUES (?, ?, ?, ?)`
                ).bind(postId, user.id, commentText, nowSec).run();

                try {
                    await env.DB.prepare(`UPDATE ${feedTable} SET comments_count = COALESCE(comments_count, 0) + 1 WHERE id = ?`).bind(postId).run();
                } catch (eCmtUpd) {
                    try {
                        await env.DB.prepare(`UPDATE ${feedTable} SET comments = COALESCE(comments, 0) + 1 WHERE id = ?`).bind(postId).run();
                    } catch (eCmtUpd2) {}
                }

                if (isAjax) {
                    const cntRow = await env.DB.prepare(`SELECT COUNT(*) as total FROM wall_post_comments WHERE post_id = ?`).bind(postId).first();
                    const styleInfo = formatCommentUserStyle({
                        ...user,
                        user_id: user.id
                    });
                    return new Response(JSON.stringify({
                        ok: true,
                        postId,
                        totalComments: Number(cntRow?.total || 0),
                        comment: {
                            id: Number(insRes?.meta?.last_row_id || Date.now()),
                            userId: Number(user.id),
                            nameHtml: styleInfo.nameHtml,
                            avatarSrc: styleInfo.avatarSrc,
                            avatarStyle: styleInfo.avatarStyle,
                            content: commentText,
                            timeAgo: 'Vừa xong'
                        }
                    }), {
                        headers: { 'Content-Type': 'application/json;charset=UTF-8' }
                    });
                }

                message = `<div style="color: #00ff00; background: #001a00; border: 1px solid #005500; padding: 6px; text-align: center; margin-bottom: 8px;">💬 Đã gửi bình luận!</div>`;
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
            if (isAjax) {
                return new Response(JSON.stringify({ ok: false, error: e.message || "Lỗi gửi bình luận!" }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json;charset=UTF-8' }
                });
            }
            message = `<div style="color: #ff5555; background: #1a0000; border: 1px solid #550000; padding: 6px; text-align: center; margin-bottom: 8px;">❌ Lỗi: ${escapeHtml(e.message)}</div>`;
        }
    }

    const rProfile = renderUser(profileUser);
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
    let commentsByPost = {};
    let likesCountByPost = {};
    let likedByMeSet = new Set();
    try {
        const pRow = await env.DB.prepare(`SELECT COUNT(*) as total FROM ${feedTable} WHERE user_id = ?`).bind(targetId).first();
        postCount = pRow?.total || 0;

        const pList = await env.DB.prepare(`SELECT * FROM ${feedTable} WHERE user_id = ? ORDER BY id DESC LIMIT 20`).bind(targetId).all();
        userPosts = pList.results || [];

        const postIds = userPosts.map(p => Number(p.id || 0)).filter(id => id > 0);
        if (postIds.length > 0) {
            const placeholders = postIds.map(() => '?').join(',');
            const cRows = await env.DB.prepare(`
                SELECT c.*, u.username, u.display_name, u.avatar, u.role, u.is_admin, u.active_icon,
                       u.name_color, u.name_glow, u.name_border, u.name_border_glow, u.border_color, u.avatar_glow
                FROM wall_post_comments c
                LEFT JOIN users u ON u.id = c.user_id
                WHERE c.post_id IN (${placeholders})
                ORDER BY c.id DESC
            `).bind(...postIds).all();
            for (const c of (cRows.results || [])) {
                const pid = Number(c.post_id);
                if (!commentsByPost[pid]) commentsByPost[pid] = [];
                const styleInfo = formatCommentUserStyle(c);
                commentsByPost[pid].push({
                    id: Number(c.id || 0),
                    userId: Number(c.user_id || 0),
                    nameHtml: styleInfo.nameHtml,
                    avatarSrc: styleInfo.avatarSrc,
                    avatarStyle: styleInfo.avatarStyle,
                    content: c.content || '',
                    timeAgo: formatTimeAgo(c.created_at)
                });
            }

            const lRows = await env.DB.prepare(`
                SELECT post_id, COUNT(*) as cnt, SUM(CASE WHEN user_id = ? THEN 1 ELSE 0 END) as mine
                FROM wall_post_likes
                WHERE post_id IN (${placeholders})
                GROUP BY post_id
            `).bind(user.id, ...postIds).all();
            for (const l of (lRows.results || [])) {
                const pid = Number(l.post_id);
                likesCountByPost[pid] = Number(l.cnt || 0);
                if (Number(l.mine || 0) > 0) likedByMeSet.add(pid);
            }
        }
    } catch(e) {}

    const hasCover = (profileUser.cover_photo && !profileUser.cover_photo.includes('7gXvS6v'));
    const coverStyle = hasCover ? `background: url('${profileUser.cover_photo}') center/cover no-repeat;` : `background: linear-gradient(135deg, #0a1f0a 0%, #151515 50%, #051428 100%);`;
    const avatarSrc = profileUser.avatar && !profileUser.avatar.includes('7gXvS6v')
        ? profileUser.avatar
        : "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100' height='100' fill='%231a1a1a'/><circle cx='50' cy='38' r='18' fill='%2300ff00'/></svg>";

    const commentsJsonSafe = JSON.stringify(commentsByPost).replace(/</g, '\\u003c');

    const wallPostsHtml = userPosts.length === 0
        ? `<div style="color: #888; text-align: center; padding: 14px; font-size: 12px;">Chưa có bài đăng nào.</div>`
        : userPosts.map((post) => {
            const postId = Number(post.id || 0);
            let rawText = post.content || post.body || post.caption || '';
            let postStyle = '';
            const styleMatch = rawText.match(/^\[style=([^\]]+)\]\r?\n/);
            if (styleMatch) {
                rawText = rawText.slice(styleMatch[0].length);
                try {
                    const st = JSON.parse(decodeURIComponent(styleMatch[1]));
                    const rules = [];
                    if (isSafeColor(st.c)) rules.push(`color: ${st.c}`);
                    if (isSafeColor(st.b)) rules.push(`background: ${st.b}; padding: 6px 8px; border-radius: 4px; display: inline-block`);
                    if (isSafeColor(st.g)) rules.push(`text-shadow: 0 0 8px ${st.g}`);
                    if (rules.length) postStyle = rules.join('; ') + ';';
                } catch (e) {}
            }

            const imgUrl = post.image_url || post.image || post.media_url || '';
            const timeAgo = formatTimeAgo(post.created_at || post.time || post.createdAt);
            const postComments = commentsByPost[postId] || [];
            const dbLikes = Number(post.likes_count ?? post.likes ?? 0);
            const tableLikes = Number(likesCountByPost[postId] ?? 0);
            const likesCount = Math.max(dbLikes, tableLikes);
            const isLikedByMe = likedByMeSet.has(postId);
            const commentsCount = Math.max(Number(post.comments_count ?? post.comments ?? 0), postComments.length);
            const canDeleteThisPost = canModerate || Number(post.user_id) === Number(user.id);

            return `
            <div style="background: #141414; border: 1px solid #2b2b2b; border-radius: 4px; padding: 10px; margin-top: 8px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <img src="${avatarSrc}" width="34" height="34" style="${rProfile.avatarStyle} display: block;">
                        <div>
                            <div style="font-size: 13px; line-height: 1.2;">${rProfile.nameHtml}</div>
                            <div style="font-size: 11px; color: #999; margin-top: 2px;">🕒 ${escapeHtml(timeAgo)}</div>
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

                ${rawText ? `<div style="font-size: 13px; color: #f2f2f2; line-height: 1.6; white-space: pre-wrap; text-align: center; margin-bottom: ${imgUrl ? '10px' : '8px'}; ${escapeHtml(postStyle)}">${escapeHtml(rawText)}</div>` : ''}

                ${imgUrl ? `
                <div style="text-align: center; background: #080808; border: 1px solid #222; border-radius: 4px; overflow: hidden; margin-bottom: 8px;">
                    <img src="${escapeHtml(imgUrl)}" alt="Ảnh bài đăng" style="max-width: 100%; max-height: 380px; object-fit: contain; display: block; margin: 0 auto;">
                </div>
                ` : ''}

                <div style="display: flex; align-items: center; gap: 10px; border-top: 1px solid #242424; padding-top: 8px; flex-wrap: wrap;">
                    <form method="POST" style="margin: 0; display: inline-flex; align-items: center;">
                        <input type="hidden" name="action" value="like_post">
                        <input type="hidden" name="post_id" value="${postId}">
                        <button type="submit" title="${isLikedByMe ? 'Bỏ thích bài viết' : 'Thích bài viết'}" style="background: ${isLikedByMe ? '#33121b' : '#1e1014'}; border: 1px solid ${isLikedByMe ? '#ff4d6d' : '#4a1c28'}; border-radius: 6px; color: #ff4d6d; font-size: 15px; font-weight: bold; cursor: pointer; padding: 6px 12px; display: inline-flex; align-items: center; gap: 6px; min-width: 64px; justify-content: center;">
                            <span style="font-size: 16px; line-height: 1;">❤️</span>
                            <span style="color: #fff; font-size: 13px; font-weight: bold;">${likesCount}</span>
                        </button>
                    </form>

                    <button type="button" onclick="openCommentPopup(${postId})" title="Bình luận bài viết" style="background: #121824; border: 1px solid #263654; border-radius: 6px; color: #60a5fa; font-size: 15px; font-weight: bold; cursor: pointer; padding: 6px 12px; display: inline-flex; align-items: center; gap: 6px; min-width: 64px; justify-content: center;">
                        <span style="font-size: 16px; line-height: 1;">💬</span>
                        <span id="post-comment-count-${postId}" style="color: #fff; font-size: 13px; font-weight: bold;">${commentsCount}</span>
                    </button>
                </div>
            </div>`;
        }).join('');

    const content = `
    <div class="box" style="margin-bottom: 8px; border: 1px solid #333;">
        <div class="box-title" style="display: flex; justify-content: space-between; align-items: center;">
            <span>📁 ${isOwner ? 'Hồ sơ của tôi' : 'Hồ sơ thành viên'}</span>
            ${isOwner ? `<button type="button" onclick="openSettingsModal()" style="background: #1c1c1c; color: #ffcc00; border: 1px solid #444; padding: 2px 6px; font-size: 10px; cursor: pointer;">⚙️ Cài đặt thông tin</button>` : ''}
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

            <div style="position: relative; margin-top: -35px; margin-bottom: 4px; display: inline-block;">
                <img src="${avatarSrc}" width="66" height="66" style="${rProfile.avatarStyle} display: block;">
                ${isOwner ? `<button type="button" onclick="openAvatarModal()" title="Đổi ảnh đại diện" style="position: absolute; bottom: -2px; right: -2px; background: #111; color: #00ff00; border: 1px solid #00ff00; border-radius: 50%; width: 22px; height: 22px; font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; box-shadow: 0 0 4px #000;">📷</button>` : ''}
            </div>
            
            <div style="font-size: 13px; margin: 4px 0 10px 0;">
                ${rProfile.nameHtml}
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

    <div class="box" style="max-width: 654px; margin: 0 auto 8px auto;">
        <div class="box-title" style="display: flex; justify-content: space-between; align-items: center;">
            <span>Thông tin chi tiết</span>
            ${isOwner ? `<a href="javascript:void(0)" onclick="openSettingsModal()" style="font-size: 10px; color: #ffcc00;">[Chỉnh sửa]</a>` : ''}
        </div>
        <div class="box-content" style="font-size: 13px; line-height: 1.8; padding: 8px;">
            <div>❤️ Hẹn hò: <b>${profileUser.relationships || profileUser.relationship || 'Đang độc thân'}</b></div>
            <div>👤 Giới tính: <b>${profileUser.gender || 'Chưa cập nhật'}</b></div>
            <div>⭐ Cấp độ: <b style="color: #ffcc00;">${profileUser.level || 1}</b> - <a href="/profile/level" style="color: #00ff00;">Kiểm tra</a></div>
            <div>🪙 Xu: <b style="color: #00ff00;">${(profileUser.coins || 0).toLocaleString()} Xu</b></div>
            <div>💰 Vàng: <b style="color: #ffcc00;">${(profileUser.gold || 0).toLocaleString()} Vàng</b></div>
            <div>📝 Bài viết: <b>${postCount}</b></div>
            <div>🏙️ Tỉnh thành: <b>${profileUser.province || 'Chưa cập nhật'}</b></div>
            <div>🎂 Sinh nhật: <b>${profileUser.birthday || 'Chưa cập nhật'}</b></div>
            <div>📅 Ngày đăng ký: <b>${profileUser.created_at || 'Thành viên hệ thống'}</b></div>
        </div>
    </div>

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
            </div>

            <div id="wall-post-form" style="display: none; background: #101010; border: 1px solid #333; border-radius: 4px; padding: 8px; margin-top: 8px; position: relative;">
                <form method="POST" id="wall-post-submit-form">
                    <input type="hidden" name="action" value="wall_post">
                    <input type="hidden" name="text_color" id="wall-text-color" value="">
                    <input type="hidden" name="bg_color" id="wall-bg-color" value="">
                    <input type="hidden" name="text_glow" id="wall-text-glow" value="">

                    <textarea id="wall-content-textarea" name="content" rows="3" placeholder="${isOwner ? 'Bạn đang nghĩ gì?' : `Viết gì đó lên tường của ${escapeHtml(profileUser.display_name || profileUser.username || 'thành viên')}...`}" style="width: 100%; background: #000; color: #fff; border: 1px solid #444; border-radius: 4px; padding: 8px; box-sizing: border-box; font-size: 13px; margin-bottom: 8px; resize: vertical;"></textarea>

                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
                        <div style="display: flex; align-items: center; gap: 6px; position: relative;">
                            <button type="button" onclick="toggleWallPicker('emoji')" title="Chèn icon biểu tượng" style="background: #1b1b1b; color: #ffcc00; border: 1px solid #3d3d3d; border-radius: 4px; padding: 4px 8px; font-size: 13px; cursor: pointer; line-height: 1.2;">😀</button>
                            <button type="button" onclick="toggleWallPicker('color')" title="Chỉnh màu chữ / nền / bóng mờ" style="background: #1b1b1b; color: #fff; border: 1px solid #3d3d3d; border-radius: 4px; padding: 4px 8px; font-size: 12px; font-weight: bold; cursor: pointer; line-height: 1.2; display: inline-flex; align-items: center; gap: 4px;">
                                <span style="color: #ffcc00;">Bb</span>
                                <span>🎨</span>
                            </button>
                            <span id="wall-color-preview-badge" style="font-size: 11px; color: #999;"></span>
                        </div>

                        <div style="display: flex; gap: 6px;">
                            <button type="button" onclick="toggleWallForm()" class="btn" style="background: #2b2b2b; color: #ccc; padding: 5px 10px; font-size: 11px;">Hủy</button>
                            <button type="submit" class="btn" style="background: #0055ff; color: #fff; padding: 5px 12px; font-size: 11px; font-weight: bold;">Đăng bài</button>
                        </div>
                    </div>

                    <div id="wall-emoji-picker" style="display: none; background: #161616; border: 1px solid #444; border-radius: 4px; padding: 6px; margin-top: 8px;">
                        <div style="font-size: 11px; color: #ffcc00; margin-bottom: 5px;">Chọn biểu tượng cảm xúc</div>
                        <div id="wall-emoji-list" style="display: flex; flex-wrap: wrap; gap: 4px;"></div>
                    </div>

                    <div id="wall-color-picker" style="display: none; background: #161616; border: 1px solid #444; border-radius: 4px; padding: 6px; margin-top: 8px;">
                        <div style="display: flex; gap: 4px; margin-bottom: 6px; border-bottom: 1px solid #2b2b2b; padding-bottom: 5px; flex-wrap: wrap;">
                            <button type="button" id="tab-color-fg" onclick="switchWallColorTab('fg')" style="background: #0055ff; color: #fff; border: 1px solid #3b7bff; border-radius: 3px; padding: 3px 8px; font-size: 11px; cursor: pointer;">Màu chữ</button>
                            <button type="button" id="tab-color-bg" onclick="switchWallColorTab('bg')" style="background: #222; color: #ccc; border: 1px solid #3a3a3a; border-radius: 3px; padding: 3px 8px; font-size: 11px; cursor: pointer;">Màu nền</button>
                            <button type="button" id="tab-color-glow" onclick="switchWallColorTab('glow')" style="background: #222; color: #ccc; border: 1px solid #3a3a3a; border-radius: 3px; padding: 3px 8px; font-size: 11px; cursor: pointer;">Bóng mờ</button>
                            <button type="button" onclick="resetWallColors()" style="margin-left: auto; background: #2a1212; color: #ff7777; border: 1px solid #552222; border-radius: 3px; padding: 3px 7px; font-size: 10px; cursor: pointer;">Mặc định</button>
                        </div>
                        <div id="wall-palette-grid" style="display: grid; grid-template-columns: repeat(8, 1fr); gap: 4px;"></div>
                    </div>
                </form>
            </div>

            <div style="margin-top: 4px;">
                ${wallPostsHtml}
            </div>
        </div>
    </div>

    <div id="comment-popup-modal" onclick="if(event.target===this) closeCommentPopup();" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.75); z-index: 1000; justify-content: center; align-items: center; padding: 12px; box-sizing: border-box;">
        <div style="background: #141414; border: 1px solid #383838; border-radius: 10px; width: 100%; max-width: 460px; max-height: 82vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.85);">
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: #1a1a1a; border-bottom: 1px solid #2d2d2d;">
                <div style="display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: bold; color: #fff;">
                    <span>Bình luận</span>
                    <span id="comment-popup-count" style="background: #2b2b2b; color: #e5e7eb; font-size: 12px; padding: 1px 8px; border-radius: 10px;">0</span>
                </div>
                <button type="button" onclick="closeCommentPopup()" title="Đóng" style="background: none; border: none; color: #aaa; font-size: 18px; line-height: 1; cursor: pointer; padding: 0 4px;">✕</button>
            </div>

            <div style="padding: 10px 12px; border-bottom: 1px solid #262626; background: #141414;">
                <form method="POST" id="comment-popup-form" onsubmit="submitCommentAjax(event)" style="display: flex; align-items: center; gap: 8px; margin: 0;">
                    <input type="hidden" name="action" value="comment_post">
                    <input type="hidden" name="post_id" id="comment-popup-post-id" value="">
                    <button type="button" onclick="toggleCommentEmojiBar()" title="Chèn biểu tượng" style="background: #1f1f1f; border: 1px solid #3a3a3a; border-radius: 50%; width: 32px; height: 32px; color: #ccc; font-size: 15px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;">☺</button>
                    <input type="text" id="comment-popup-input" name="comment_content" placeholder="Viết bình luận.." required style="flex: 1; background: #0d0d0d; color: #fff; border: 1px solid #363636; border-radius: 6px; padding: 7px 10px; font-size: 13px; box-sizing: border-box;">
                    <button type="submit" id="comment-popup-submit-btn" style="background: #2563eb; color: #fff; border: none; border-radius: 6px; padding: 7px 12px; font-size: 12px; font-weight: bold; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0;">
                        <span>💬</span>
                        <span>Bình luận</span>
                    </button>
                </form>
                <div id="comment-popup-error" style="display: none; color: #ff6666; font-size: 11px; margin-top: 6px;"></div>
                <div id="comment-popup-emoji-bar" style="display: none; flex-wrap: wrap; gap: 5px; margin-top: 8px; padding-top: 8px; border-top: 1px solid #252525;"></div>
            </div>

            <div id="comment-popup-list" style="padding: 12px; overflow-y: auto; flex: 1; background: #111111;"></div>
        </div>
    </div>

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

    <script>
        const WALL_COMMENTS_DATA = ${commentsJsonSafe};
        const FALLBACK_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100' height='100' fill='%231a1a1a'/><circle cx='50' cy='38' r='18' fill='%2300ff00'/></svg>";
        let activeCommentPostId = 0;

        function escapeJsHtml(str) {
            return String(str ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        function renderCommentListInPopup(postId) {
            const listEl = document.getElementById('comment-popup-list');
            const countBadge = document.getElementById('comment-popup-count');
            const postCountSpan = document.getElementById('post-comment-count-' + postId);
            if (!listEl) return;

            const list = WALL_COMMENTS_DATA[postId] || [];
            const currentPostCount = postCountSpan ? Number(postCountSpan.textContent || 0) : list.length;
            const total = Math.max(currentPostCount, list.length);

            if (countBadge) countBadge.textContent = String(total);
            if (postCountSpan) postCountSpan.textContent = String(total);

            if (list.length === 0) {
                listEl.innerHTML = '<div style="text-align:center;color:#777;font-size:12px;padding:18px 8px;">Chưa có bình luận nào.</div>';
                return;
            }

            listEl.innerHTML = list.map(c => {
                const av = (c.avatarSrc && !String(c.avatarSrc).includes('7gXvS6v')) ? c.avatarSrc : FALLBACK_AVATAR;
                const avStyle = c.avatarStyle || 'border-radius: 50%; object-fit: cover;';
                const nameMarkup = c.nameHtml || escapeJsHtml(c.name || ('ID #' + c.userId));
                return \`
                <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:10px;">
                    <img src="\${escapeJsHtml(av)}" width="32" height="32" style="\${escapeJsHtml(avStyle)} flex-shrink:0;margin-top:2px;">
                    <div style="flex:1;min-width:0;">
                        <div style="background:#1c1c1c;border:1px solid #2b2b2b;border-radius:8px;padding:6px 10px;">
                            <div style="font-size:12px;line-height:1.3;margin-bottom:2px;">\${nameMarkup}</div>
                            <div style="font-size:13px;color:#e5e7eb;white-space:pre-wrap;word-break:break-word;">\${escapeJsHtml(c.content)}</div>
                        </div>
                        <div style="font-size:11px;color:#888;margin-top:3px;padding-left:4px;">\${escapeJsHtml(c.timeAgo || 'Vừa xong')}</div>
                    </div>
                </div>\`;
            }).join('');
        }

        function openCommentPopup(postId) {
            activeCommentPostId = Number(postId || 0);
            const modal = document.getElementById('comment-popup-modal');
            const postIdInput = document.getElementById('comment-popup-post-id');
            const inputEl = document.getElementById('comment-popup-input');
            const errEl = document.getElementById('comment-popup-error');
            if (!modal || !postIdInput) return;

            postIdInput.value = String(activeCommentPostId);
            if (errEl) {
                errEl.style.display = 'none';
                errEl.textContent = '';
            }
            if (!Array.isArray(WALL_COMMENTS_DATA[activeCommentPostId])) {
                WALL_COMMENTS_DATA[activeCommentPostId] = [];
            }

            renderCommentListInPopup(activeCommentPostId);
            modal.style.display = 'flex';
            if (inputEl) {
                inputEl.value = '';
                setTimeout(() => inputEl.focus(), 50);
            }
        }

        async function submitCommentAjax(ev) {
            ev.preventDefault();
            const postId = Number(document.getElementById('comment-popup-post-id')?.value || activeCommentPostId || 0);
            const inputEl = document.getElementById('comment-popup-input');
            const btnEl = document.getElementById('comment-popup-submit-btn');
            const errEl = document.getElementById('comment-popup-error');
            const text = (inputEl?.value || '').trim();

            if (!postId || !text) return;
            if (errEl) {
                errEl.style.display = 'none';
                errEl.textContent = '';
            }
            if (btnEl) btnEl.disabled = true;

            try {
                const body = new URLSearchParams();
                body.set('action', 'comment_post');
                body.set('post_id', String(postId));
                body.set('comment_content', text);
                body.set('ajax', '1');

                const res = await fetch(window.location.href, {
                    method: 'POST',
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest',
                        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
                    },
                    body: body.toString()
                });

                const data = await res.json();
                if (!res.ok || !data.ok) {
                    throw new Error(data.error || 'Không thể gửi bình luận!');
                }

                if (!Array.isArray(WALL_COMMENTS_DATA[postId])) {
                    WALL_COMMENTS_DATA[postId] = [];
                }
                WALL_COMMENTS_DATA[postId].unshift(data.comment);

                const postCountSpan = document.getElementById('post-comment-count-' + postId);
                if (postCountSpan && typeof data.totalComments === 'number') {
                    postCountSpan.textContent = String(data.totalComments);
                }

                if (inputEl) {
                    inputEl.value = '';
                    inputEl.focus();
                }
                renderCommentListInPopup(postId);
            } catch (err) {
                if (errEl) {
                    errEl.textContent = '❌ ' + (err.message || 'Lỗi gửi bình luận');
                    errEl.style.display = 'block';
                }
            } finally {
                if (btnEl) btnEl.disabled = false;
            }
        }

        function closeCommentPopup() {
            const modal = document.getElementById('comment-popup-modal');
            const emojiBar = document.getElementById('comment-popup-emoji-bar');
            if (modal) modal.style.display = 'none';
            if (emojiBar) emojiBar.style.display = 'none';
        }

        function toggleCommentEmojiBar() {
            const bar = document.getElementById('comment-popup-emoji-bar');
            if (!bar) return;
            const show = (bar.style.display === 'none' || !bar.style.display);
            bar.style.display = show ? 'flex' : 'none';
            if (show && !bar.dataset.loaded) {
                const icons = ['😀','😂','😍','😘','😎','😭','😡','👍','❤️','💖','🔥','✨','🎉','🌸'];
                bar.innerHTML = icons.map(ic =>
                    \`<button type="button" onclick="insertCommentEmoji('\${ic}')" style="background:#222;border:1px solid #383838;border-radius:4px;padding:2px 6px;font-size:13px;cursor:pointer;">\${ic}</button>\`
                ).join('');
                bar.dataset.loaded = '1';
            }
        }

        function insertCommentEmoji(ic) {
            const inp = document.getElementById('comment-popup-input');
            if (!inp) return;
            inp.value = (inp.value || '') + ic;
            inp.focus();
        }

        function toggleWallForm() {
            const formBox = document.getElementById('wall-post-form');
            if (!formBox) return;
            formBox.style.display = (formBox.style.display === 'none' || !formBox.style.display) ? 'block' : 'none';
        }

        const WALL_EMOJIS = ['😀','😁','😂','🤣','😊','😍','😘','😎','🤩','🥳','😭','😡','🥺','🤔','👍','👎','❤️','💖','🔥','✨','🎉','💯','🌸','🌹','🎵','🎶','⭐','👑','💍','🎁'];
        const WALL_COLORS = [
            '#ffffff','#ffeb3b','#ffc107','#ff9800','#ff5722','#f44336','#e91e63','#9c27b0',
            '#673ab7','#3f51b5','#2196f3','#03a9f4','#00bcd4','#009688','#4caf50','#8bc34a',
            '#cddc39','#ff77aa','#ff99cc','#a3e635','#38bdf8','#c084fc','#fb7185','#111111'
        ];
        let wallColorMode = 'fg';
        let wallSelectedColors = { fg: '', bg: '', glow: '' };

        function toggleWallPicker(type) {
            const emojiBox = document.getElementById('wall-emoji-picker');
            const colorBox = document.getElementById('wall-color-picker');
            if (!emojiBox || !colorBox) return;
            if (type === 'emoji') {
                const show = emojiBox.style.display === 'none';
                emojiBox.style.display = show ? 'block' : 'none';
                colorBox.style.display = 'none';
                if (show) renderWallEmojis();
            } else {
                const show = colorBox.style.display === 'none';
                colorBox.style.display = show ? 'block' : 'none';
                emojiBox.style.display = 'none';
                if (show) renderWallPalette();
            }
        }

        function renderWallEmojis() {
            const el = document.getElementById('wall-emoji-list');
            if (!el) return;
            el.innerHTML = WALL_EMOJIS.map(em =>
                \`<button type="button" onclick="insertWallEmoji('\${em}')" style="background:#222;border:1px solid #383838;border-radius:3px;padding:3px 6px;font-size:14px;cursor:pointer;">\${em}</button>\`
            ).join('');
        }

        function insertWallEmoji(emoji) {
            const ta = document.getElementById('wall-content-textarea');
            if (!ta) return;
            const start = ta.selectionStart ?? ta.value.length;
            const end = ta.selectionEnd ?? ta.value.length;
            ta.value = ta.value.slice(0, start) + emoji + ta.value.slice(end);
            ta.focus();
            ta.selectionStart = ta.selectionEnd = start + emoji.length;
        }

        function switchWallColorTab(mode) {
            wallColorMode = mode;
            ['fg', 'bg', 'glow'].forEach(m => {
                const btn = document.getElementById('tab-color-' + m);
                if (!btn) return;
                const active = (m === mode);
                btn.style.background = active ? '#0055ff' : '#222';
                btn.style.color = active ? '#fff' : '#ccc';
                btn.style.borderColor = active ? '#3b7bff' : '#3a3a3a';
            });
            renderWallPalette();
        }

        function renderWallPalette() {
            const grid = document.getElementById('wall-palette-grid');
            if (!grid) return;
            grid.innerHTML = WALL_COLORS.map(hex =>
                \`<button type="button" onclick="applyWallColor('\${hex}')" title="\${hex}" style="height:22px;background:\${hex};border:1px solid #555;border-radius:3px;cursor:pointer;"></button>\`
            ).join('');
        }

        function applyWallColor(hex) {
            if (!hex) return;
            wallSelectedColors[wallColorMode] = hex;
            document.getElementById('wall-text-color').value = wallSelectedColors.fg;
            document.getElementById('wall-bg-color').value = wallSelectedColors.bg;
            document.getElementById('wall-text-glow').value = wallSelectedColors.glow;

            const ta = document.getElementById('wall-content-textarea');
            const badge = document.getElementById('wall-color-preview-badge');
            if (ta) {
                ta.style.color = wallSelectedColors.fg || '#fff';
                ta.style.backgroundColor = wallSelectedColors.bg || '#000';
                ta.style.textShadow = wallSelectedColors.glow ? \`0 0 8px \${wallSelectedColors.glow}\` : 'none';
            }
            if (badge) {
                const parts = [];
                if (wallSelectedColors.fg) parts.push('Chữ');
                if (wallSelectedColors.bg) parts.push('Nền');
                if (wallSelectedColors.glow) parts.push('Bóng');
                badge.textContent = parts.length ? \`Đã chọn: \${parts.join(' + ')}\` : '';
            }
        }

        function resetWallColors() {
            wallSelectedColors = { fg: '', bg: '', glow: '' };
            document.getElementById('wall-text-color').value = '';
            document.getElementById('wall-bg-color').value = '';
            document.getElementById('wall-text-glow').value = '';
            const ta = document.getElementById('wall-content-textarea');
            const badge = document.getElementById('wall-color-preview-badge');
            if (ta) {
                ta.style.color = '#fff';
                ta.style.backgroundColor = '#000';
                ta.style.textShadow = 'none';
            }
            if (badge) badge.textContent = '';
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
```[cite: 21, 27]

---

### 2. `src/routes/feed.js`
```javascript
import { renderUser } from '../worker.js';
import {
    saveMediaAsset,
    saveMediaChunk,
    mergeMediaChunkBatch,
    deleteMediaAsset,
    normalizeMediaUrl
} from '../media_store.js';

const STORY_TTL_SECONDS = 24 * 60 * 60;
const MAX_ACTIVE_STORIES = 10;

function escapeAttr(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function isStoryExpired(createdAtStr) {
    if (!createdAtStr) return false;
    const normalized = String(createdAtStr).trim().replace(' ', 'T') + (String(createdAtStr).includes('Z') || String(createdAtStr).includes('+') ? '' : 'Z');
    const ts = Date.parse(normalized);
    if (isNaN(ts)) return false;
    return (Date.now() - ts) >= STORY_TTL_SECONDS * 1000;
}

async function ensureFeedSchema(env) {
    if (!env || !env.DB) return;
    await env.DB.batch([
        env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                content TEXT,
                image_url TEXT,
                created_at TEXT
            )
        `),
        env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS post_likes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                post_id INTEGER,
                user_id INTEGER,
                reaction TEXT DEFAULT '❤️'
            )
        `),
        env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS post_comments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                post_id INTEGER,
                user_id INTEGER,
                comment TEXT,
                created_at TEXT
            )
        `),
        env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS stories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                image_url TEXT,
                media_url TEXT,
                thumb_url TEXT,
                media_type TEXT DEFAULT 'image',
                caption TEXT,
                created_at TEXT
            )
        `),
        env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS media_assets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                owner_type TEXT,
                owner_id INTEGER,
                media_type TEXT DEFAULT 'image',
                media_url TEXT,
                thumb_url TEXT,
                duration_sec REAL DEFAULT 0,
                created_at TEXT
            )
        `),
        env.DB.prepare(`
            CREATE INDEX IF NOT EXISTS idx_media_assets_owner ON media_assets(owner_type, owner_id)
        `),
        env.DB.prepare(`
            CREATE INDEX IF NOT EXISTS idx_stories_id_desc ON stories(id DESC)
        `),
        env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS follows (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                follower_id INTEGER,
                following_id INTEGER
            )
        `)
    ]);

    try { await env.DB.prepare("ALTER TABLE posts ADD COLUMN image_url TEXT").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE stories ADD COLUMN image_url TEXT").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE stories ADD COLUMN media_url TEXT").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE stories ADD COLUMN thumb_url TEXT").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE stories ADD COLUMN media_type TEXT DEFAULT 'image'").run(); } catch (e) {}
}

async function cleanupExpiredAndOverflowMedia(request, env) {
    if (!env || !env.DB) return;
    try {
        const staleRows = await env.DB.prepare(`
            SELECT stories.id,
                   stories.image_url, stories.media_url, stories.thumb_url,
                   ma.media_url AS ma_media_url, ma.thumb_url AS ma_thumb_url
            FROM stories
            LEFT JOIN media_assets ma ON ma.owner_type = 'story' AND ma.owner_id = stories.id
            WHERE datetime(stories.created_at, '+24 hours') <= datetime('now')
               OR stories.id NOT IN (
                   SELECT id FROM stories ORDER BY id DESC LIMIT ${MAX_ACTIVE_STORIES}
               )
        `).all();

        const urlsToDelete = new Set();
        for (const r of ((staleRows && staleRows.results) || [])) {
            [r.image_url, r.media_url, r.thumb_url, r.ma_media_url, r.ma_thumb_url].forEach(u => {
                const norm = normalizeMediaUrl(u);
                if (norm.startsWith('/media/')) urlsToDelete.add(norm);
            });
        }

        for (const u of urlsToDelete) {
            await deleteMediaAsset(request, env, u);
        }

        await env.DB.batch([
            env.DB.prepare(`
                DELETE FROM media_assets
                WHERE owner_type = 'story'
                  AND owner_id IN (
                      SELECT id FROM stories
                      WHERE datetime(stories.created_at, '+24 hours') <= datetime('now')
                  )
            `),
            env.DB.prepare(`
                DELETE FROM stories
                WHERE datetime(stories.created_at, '+24 hours') <= datetime('now')
            `),
            env.DB.prepare(`
                DELETE FROM media_assets
                WHERE owner_type = 'story'
                  AND owner_id NOT IN (
                      SELECT id FROM stories ORDER BY id DESC LIMIT ${MAX_ACTIVE_STORIES}
                  )
            `),
            env.DB.prepare(`
                DELETE FROM stories
                WHERE id NOT IN (
                    SELECT id FROM stories ORDER BY id DESC LIMIT ${MAX_ACTIVE_STORIES}
                )
            `)
        ]);
    } catch (e) {}
}

function scheduleRetention(request, env, ctx) {
    const task = cleanupExpiredAndOverflowMedia(request, env);
    if (ctx && typeof ctx.waitUntil === 'function') {
        ctx.waitUntil(task);
        return Promise.resolve();
    }
    return task;
}

export async function handleFeed(request, env, user, renderLayout, ctx) {
    const urlObj = new URL(request.url);
    const tab = urlObj.searchParams.get('tab') || 'new';
    const page = parseInt(urlObj.searchParams.get('page')) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;

    if (request.method === 'POST') {
        try {
            const formData = await request.formData();
            const action = formData.get('action');

            if (action === 'upload_media_chunk') {
                const uploadId = String(formData.get('upload_id') || '');
                const chunkIndex = parseInt(formData.get('chunk_index') || '0', 10);
                const chunkBlob = formData.get('chunk');
                const savedChunk = await saveMediaChunk(request, env, {
                    uploadId,
                    chunkIndex,
                    chunkBlob,
                    ttlSeconds: 3600
                });
                return new Response(JSON.stringify({ success: true, ...savedChunk }), {
                    headers: { 'Content-Type': 'application/json;charset=UTF-8' }
                });
            }

            if (action === 'finalize_media_upload') {
                const uploadId = String(formData.get('upload_id') || '');
                const startChunk = parseInt(formData.get('start_chunk') || '0', 10);
                const batchSize = parseInt(formData.get('batch_size') || '6', 10);
                const totalChunks = parseInt(formData.get('total_chunks') || '0', 10);
                const existingUrl = String(formData.get('existing_url') || '');
                const folder = String(formData.get('folder') || 'stories');
                const mimeType = String(formData.get('mime_type') || 'video/mp4');
                const ttl = folder === 'posts' ? 30 * 24 * 60 * 60 : STORY_TTL_SECONDS;

                const mergedStep = await mergeMediaChunkBatch(request, env, {
                    uploadId,
                    startChunk,
                    batchSize,
                    totalChunks,
                    existingUrl,
                    folder,
                    userId: user.id,
                    mimeType,
                    ttlSeconds: ttl
                });

                return new Response(JSON.stringify({
                    success: true,
                    ...mergedStep
                }), {
                    headers: { 'Content-Type': 'application/json;charset=UTF-8' }
                });
            }

            try { await ensureFeedSchema(env); } catch (e) {}

            if (action === 'create_post') {
                const content = String(formData.get('content') || '');
                const postFile = formData.get('post_file');
                const rawImageUrl = String(formData.get('image_url') || '').trim();
                let imageUrl = rawImageUrl;

                if (postFile && typeof postFile === 'object' && postFile.size > 0) {
                    const saved = await saveMediaAsset(request, env, {
                        folder: 'posts',
                        userId: user.id,
                        file: postFile,
                        ttlSeconds: 30 * 24 * 60 * 60
                    });
                    if (saved.url) imageUrl = saved.url;
                } else if (rawImageUrl.startsWith('data:')) {
                    const saved = await saveMediaAsset(request, env, {
                        folder: 'posts',
                        userId: user.id,
                        dataUrl: rawImageUrl,
                        ttlSeconds: 30 * 24 * 60 * 60
                    });
                    if (saved.url) imageUrl = saved.url;
                }

                if (content.trim() !== '' || imageUrl.trim() !== '') {
                    const insertedPost = await env.DB.prepare(
                        "INSERT INTO posts (user_id, content, image_url, created_at) VALUES (?, ?, ?, datetime('now')) RETURNING id"
                    ).bind(user.id, content, imageUrl).first();

                    if (imageUrl.trim() !== '' && insertedPost && insertedPost.id) {
                        await env.DB.prepare(
                            "INSERT INTO media_assets (user_id, owner_type, owner_id, media_type, media_url, thumb_url, duration_sec, created_at) VALUES (?, 'post', ?, 'image', ?, ?, 0, datetime('now'))"
                        ).bind(user.id, insertedPost.id, imageUrl.trim(), imageUrl.trim()).run();
                    }
                }
            } else if (action === 'like_post') {
                const postId = formData.get('post_id');
                const existing = await env.DB.prepare(
                    "SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?"
                ).bind(postId, user.id).first();

                if (existing) {
                    await env.DB.prepare("DELETE FROM post_likes WHERE id = ?").bind(existing.id).run();
                } else {
                    await env.DB.prepare(
                        "INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)"
                    ).bind(postId, user.id).run();
                }
            } else if (action === 'add_comment') {
                const postId = formData.get('post_id');
                const commentText = String(formData.get('comment') || '').trim();
                if (commentText !== '') {
                    await env.DB.prepare(
                        "INSERT INTO post_comments (post_id, user_id, comment, created_at) VALUES (?, ?, ?, datetime('now'))"
                    ).bind(postId, user.id, commentText).run();
                }
            } else if (action === 'create_story') {
                const uploadedFile = formData.get('story_file');
                const rawMediaUrl = String(formData.get('image_url') || formData.get('media_url') || '').trim();
                const rawThumb = String(formData.get('thumb_url') || '').trim();
                const rawType = String(formData.get('media_type') || 'image').toLowerCase();
                const hasFile = uploadedFile && typeof uploadedFile === 'object' && uploadedFile.size > 0;

                let mediaUrl = '';
                let detectedType = rawType === 'video' ? 'video' : 'image';

                if (hasFile) {
                    const saved = await saveMediaAsset(request, env, {
                        folder: 'stories',
                        userId: user.id,
                        file: uploadedFile,
                        ttlSeconds: STORY_TTL_SECONDS
                    });
                    mediaUrl = saved.url;
                    if (String(saved.mimeType || uploadedFile.type || '').toLowerCase().startsWith('video/')) {
                        detectedType = 'video';
                    }
                } else if (rawMediaUrl) {
                    if (rawMediaUrl.startsWith('data:')) {
                        const saved = await saveMediaAsset(request, env, {
                            folder: 'stories',
                            userId: user.id,
                            dataUrl: rawMediaUrl,
                            ttlSeconds: STORY_TTL_SECONDS
                        });
                        mediaUrl = saved.url;
                        if (String(saved.mimeType || '').toLowerCase().startsWith('video/')) {
                            detectedType = 'video';
                        }
                    } else {
                        mediaUrl = normalizeMediaUrl(rawMediaUrl);
                    }
                }

                let thumbFinal = '';
                if (rawThumb) {
                    if (rawThumb.startsWith('data:')) {
                        const savedThumb = await saveMediaAsset(request, env, {
                            folder: 'story_thumbs',
                            userId: user.id,
                            dataUrl: rawThumb,
                            ttlSeconds: STORY_TTL_SECONDS
                        });
                        thumbFinal = savedThumb.url;
                    } else {
                        thumbFinal = normalizeMediaUrl(rawThumb);
                    }
                } else if (detectedType === 'image') {
                    thumbFinal = mediaUrl;
                }

                const durationSec = Math.min(30, Math.max(0, parseFloat(formData.get('duration_sec') || '0') || 0));

                if (mediaUrl !== '') {
                    const imageColVal = detectedType === 'image' ? mediaUrl : thumbFinal;

                    const insertedStory = await env.DB.prepare(
                        "INSERT INTO stories (user_id, image_url, media_url, thumb_url, media_type, caption, created_at) VALUES (?, ?, ?, ?, ?, '', datetime('now')) RETURNING id"
                    ).bind(user.id, imageColVal, mediaUrl, thumbFinal, detectedType).first();

                    if (insertedStory && insertedStory.id) {
                        await env.DB.prepare(
                            "INSERT INTO media_assets (user_id, owner_type, owner_id, media_type, media_url, thumb_url, duration_sec, created_at) VALUES (?, 'story', ?, ?, ?, ?, ?, datetime('now'))"
                        ).bind(user.id, insertedStory.id, detectedType, mediaUrl, thumbFinal, durationSec).run();
                    }

                    await scheduleRetention(request, env, ctx);
                }
            } else if (action === 'delete_story') {
                const storyId = formData.get('story_id');
                const targetStory = await env.DB.prepare(`
                    SELECT stories.user_id, stories.image_url, stories.media_url, stories.thumb_url,
                           ma.media_url AS ma_media_url, ma.thumb_url AS ma_thumb_url
                    FROM stories
                    LEFT JOIN media_assets ma ON ma.owner_type = 'story' AND ma.owner_id = stories.id
                    WHERE stories.id = ?
                `).bind(storyId).first();

                const isManager = (user.role && user.role !== 'Thành Viên');
                if (targetStory && (isManager || targetStory.user_id === user.id)) {
                    for (const u of [
                        targetStory.image_url, targetStory.media_url, targetStory.thumb_url,
                        targetStory.ma_media_url, targetStory.ma_thumb_url
                    ]) {
                        await deleteMediaAsset(request, env, u);
                    }
                    await env.DB.batch([
                        env.DB.prepare("DELETE FROM media_assets WHERE owner_type = 'story' AND owner_id = ?").bind(storyId),
                        env.DB.prepare("DELETE FROM stories WHERE id = ?").bind(storyId)
                    ]);
                }
            } else if (action === 'delete_post') {
                const postId = formData.get('post_id');
                const targetPost = await env.DB.prepare(`
                    SELECT posts.user_id, posts.image_url, ma.media_url AS ma_media_url
                    FROM posts
                    LEFT JOIN media_assets ma ON ma.owner_type = 'post' AND ma.owner_id = posts.id
                    WHERE posts.id = ?
                `).bind(postId).first();
                const isManager = (user.role && user.role !== 'Thành Viên');

                if (targetPost && (isManager || targetPost.user_id === user.id)) {
                    await deleteMediaAsset(request, env, targetPost.image_url);
                    await deleteMediaAsset(request, env, targetPost.ma_media_url);
                    await env.DB.batch([
                        env.DB.prepare("DELETE FROM media_assets WHERE owner_type = 'post' AND owner_id = ?").bind(postId),
                        env.DB.prepare("DELETE FROM post_likes WHERE post_id = ?").bind(postId),
                        env.DB.prepare("DELETE FROM post_comments WHERE post_id = ?").bind(postId),
                        env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(postId)
                    ]);
                }
            }

            if (request.headers.get('X-Requested-With') === 'XMLHttpRequest') {
                return new Response(JSON.stringify({ success: true }), {
                    headers: { 'Content-Type': 'application/json;charset=UTF-8' }
                });
            }
        } catch (e) {
            if (request.headers.get('X-Requested-With') === 'XMLHttpRequest') {
                return new Response(JSON.stringify({ success: false, error: e.message }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json;charset=UTF-8' }
                });
            }
        }
    } else {
        try { await ensureFeedSchema(env); } catch (e) {}
        if (urlObj.searchParams.get('story_media_id')) {
            const storyMediaId = parseInt(urlObj.searchParams.get('story_media_id'), 10);
            if (!isNaN(storyMediaId) && storyMediaId > 0) {
                try {
                    const row = await env.DB.prepare(`
                        SELECT stories.id, stories.created_at,
                               COALESCE(ma.media_url, stories.media_url, stories.image_url) AS media_url,
                               COALESCE(ma.thumb_url, stories.thumb_url, stories.image_url) AS thumb_url,
                               COALESCE(ma.media_type, stories.media_type, 'image') AS media_type
                        FROM stories
                        LEFT JOIN media_assets ma ON ma.owner_type = 'story' AND ma.owner_id = stories.id
                        WHERE stories.id = ?
                        LIMIT 1
                    `).bind(storyMediaId).first();

                    if (!row || isStoryExpired(row.created_at)) {
                        await scheduleRetention(request, env, ctx);
                        return new Response(JSON.stringify({ success: false, expired: true }), {
                            status: 404,
                            headers: { 'Content-Type': 'application/json;charset=UTF-8' }
                        });
                    }

                    return new Response(JSON.stringify({
                        success: true,
                        id: storyMediaId,
                        mediaUrl: normalizeMediaUrl(row.media_url || ''),
                        thumbUrl: normalizeMediaUrl(row.thumb_url || ''),
                        mediaType: row.media_type || 'image'
                    }), {
                        headers: {
                            'Content-Type': 'application/json;charset=UTF-8',
                            'Cache-Control': 'private, max-age=120'
                        }
                    });
                } catch (e) {
                    return new Response(JSON.stringify({ success: false, error: e.message }), {
                        status: 500,
                        headers: { 'Content-Type': 'application/json;charset=UTF-8' }
                    });
                }
            }
        }
        await scheduleRetention(request, env, ctx);
    }

    let storiesHtml = '';
    let storyViewerDataJson = '[]';
    try {
        const storyRes = await env.DB.prepare(`
            SELECT stories.id, stories.user_id, stories.created_at,
                   COALESCE(ma.thumb_url, stories.thumb_url, stories.image_url) AS resolved_thumb_url,
                   COALESCE(ma.media_type, stories.media_type, 'image') AS resolved_media_type,
                   COALESCE(ma.media_url, stories.media_url, stories.image_url) AS resolved_media_url,
                   users.username, users.display_name, users.avatar, users.role, users.is_admin, users.active_icon,
                   users.name_color, users.name_glow, users.name_border, users.name_border_glow, users.border_color, users.avatar_glow
            FROM stories
            LEFT JOIN media_assets ma ON ma.owner_type = 'story' AND ma.owner_id = stories.id
            LEFT JOIN users ON stories.user_id = users.id
            WHERE datetime(stories.created_at, '+24 hours') > datetime('now')
            ORDER BY stories.id DESC LIMIT ${MAX_ACTIVE_STORIES}
        `).all();
        const stories = storyRes.results || [];
        const isManager = (user.role && user.role !== 'Thành Viên');
        const fallbackAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='50' height='50'><rect width='50' height='50' fill='%23333'/></svg>";
        const fallbackVideoThumb = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='180'><rect width='120' height='180' fill='%23101820'/><text x='60' y='95' fill='%2300ff00' font-size='28' text-anchor='middle'>▶</text></svg>";

        const viewerItems = stories.map((s, idx) => {
            const detectedType = s.resolved_media_type === 'video' ? 'video' : 'image';
            const rStoryUser = renderUser({
                id: s.user_id,
                username: s.username,
                display_name: s.display_name,
                avatar: s.avatar,
                role: s.role,
                is_admin: s.is_admin,
                active_icon: s.active_icon,
                name_color: s.name_color,
                name_glow: s.name_glow,
                name_border: s.name_border,
                name_border_glow: s.name_border_glow,
                border_color: s.border_color,
                avatar_glow: s.avatar_glow
            });
            const sName = s.display_name || s.username || 'Thành viên';
            const sAvatar = s.avatar || fallbackAvatar;
            return {
                index: idx,
                id: s.id,
                userId: s.user_id || 0,
                name: sName,
                nameHtml: rStoryUser.nameHtml,
                avatar: sAvatar,
                avatarStyle: rStoryUser.avatarStyle || 'border-radius: 50%; border: 2px solid #00ff00; object-fit: cover;',
                mediaUrl: normalizeMediaUrl(s.resolved_media_url || ''),
                mediaType: detectedType,
                createdAt: s.created_at || 'Vừa xong',
                canDelete: Boolean(isManager || (s.user_id && s.user_id === user.id))
            };
        });
        storyViewerDataJson = JSON.stringify(viewerItems).replace(/</g, '\\u003c');

        storiesHtml = `
            <div style="display: flex; gap: 8px; overflow-x: auto; padding: 6px 0; margin-bottom: 10px; scrollbar-width: none;">
                <div onclick="openStoryModal()" style="min-width: 68px; height: 110px; background: #1a1a1a; border: 1px dashed #00ff00; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;">
                    <div style="width: 28px; height: 28px; background: #00ff00; color: #000; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 16px; margin-bottom: 4px;">+</div>
                    <div style="font-size: 9px; color: #aaa; text-align: center;">Thêm Story</div>
                    <div style="font-size: 8px; color: #777; margin-top: 2px;">${stories.length}/10 · 24h</div>
                </div>
        `;

        stories.forEach((s, idx) => {
            const isVid = s.resolved_media_type === 'video';
            const thumbSrc = normalizeMediaUrl(s.resolved_thumb_url) || (isVid ? fallbackVideoThumb : '');
            const sName = s.display_name || s.username || 'Thành viên';
            const sAvatar = s.avatar || fallbackAvatar;
            const bgStyle = thumbSrc
                ? `background: url('${escapeAttr(thumbSrc)}') center/cover no-repeat;`
                : 'background: #141414;';

            storiesHtml += `
                <div onclick="openStoryViewer(${idx})" style="min-width: 68px; height: 110px; ${bgStyle} border-radius: 8px; position: relative; border: 1px solid #444; flex-shrink: 0; overflow: hidden; padding: 4px; display: flex; flex-direction: column; justify-content: space-between; cursor: pointer;">
                    <img src="${escapeAttr(sAvatar)}" loading="lazy" style="position:relative;z-index:2;width: 22px; height: 22px; border-radius: 50%; border: 1px solid #00ff00; object-fit: cover;">
                    <div style="position:relative;z-index:2;font-size: 8px; color: #fff; background: rgba(0,0,0,0.68); padding: 2px; border-radius: 3px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${isVid ? '🎬 ' : ''}${escapeAttr(sName)}</div>
                </div>
            `;
        });
        storiesHtml += `</div>`;
    } catch (e) {
        storiesHtml = '';
    }

    let postsQuery = '';
    if (tab === 'trending') {
        postsQuery = `
            SELECT posts.*, users.username, users.display_name, users.avatar, users.border_color, users.avatar_glow,
                   users.name_color, users.name_glow, users.name_border, users.name_border_glow, users.active_icon, users.role, users.is_admin,
                   (SELECT COUNT(*) FROM post_likes WHERE post_id = posts.id) +
                   (SELECT COUNT(*) FROM post_comments WHERE post_id = posts.id) as total_interactions
            FROM posts
            JOIN users ON posts.user_id = users.id
            ORDER BY total_interactions DESC, posts.id DESC LIMIT ? OFFSET ?
        `;
    } else if (tab === 'following') {
        postsQuery = `
            SELECT posts.*, users.username, users.display_name, users.avatar, users.border_color, users.avatar_glow,
                   users.name_color, users.name_glow, users.name_border, users.name_border_glow, users.active_icon, users.role, users.is_admin
            FROM posts
            JOIN users ON posts.user_id = users.id
            WHERE posts.user_id IN (SELECT following_id FROM follows WHERE follower_id = ?)
            ORDER BY posts.id DESC LIMIT ? OFFSET ?
        `;
    } else {
        postsQuery = `
            SELECT posts.*, users.username, users.display_name, users.avatar, users.border_color, users.avatar_glow,
                   users.name_color, users.name_glow, users.name_border, users.name_border_glow, users.active_icon, users.role, users.is_admin
            FROM posts
            JOIN users ON posts.user_id = users.id
            ORDER BY posts.id DESC LIMIT ? OFFSET ?
        `;
    }

    let totalPosts = 0;
    let posts = [];
    try {
        const countStmt = tab === 'following'
            ? env.DB.prepare("SELECT COUNT(*) as total FROM posts WHERE user_id IN (SELECT following_id FROM follows WHERE follower_id = ?)").bind(user.id)
            : env.DB.prepare("SELECT COUNT(*) as total FROM posts");

        const postsStmt = tab === 'following'
            ? env.DB.prepare(postsQuery).bind(user.id, limit, offset)
            : env.DB.prepare(postsQuery).bind(limit, offset);

        const [countRes, postsRes] = await env.DB.batch([countStmt, postsStmt]);
        const firstCount = countRes && countRes.results && countRes.results[0];
        totalPosts = firstCount ? firstCount.total : 0;
        posts = (postsRes && postsRes.results) || [];
    } catch (e) {}

    const totalPages = Math.ceil(totalPosts / limit) || 1;

    let postsHtml = '';
    try {
        if (posts.length === 0) {
            postsHtml = '<div style="text-align: center; color: #777; padding: 20px;">Chưa có bài viết nào trong mục này.</div>';
        } else {
            const postIds = posts.map(p => p.id).filter(id => id !== undefined && id !== null);
            const likeCountMap = new Map();
            const likedByMeSet = new Set();
            const commentsByPostMap = new Map();

            if (postIds.length > 0) {
                const placeholders = postIds.map(() => '?').join(',');
                const [likesRes, commentsRes] = await env.DB.batch([
                    env.DB.prepare(`SELECT post_id, user_id FROM post_likes WHERE post_id IN (${placeholders})`).bind(...postIds),
                    env.DB.prepare(`
                        SELECT post_comments.*, users.username, users.display_name, users.avatar, users.border_color, users.avatar_glow,
                               users.name_color, users.name_glow, users.name_border, users.name_border_glow, users.active_icon, users.role, users.is_admin
                        FROM post_comments
                        LEFT JOIN users ON post_comments.user_id = users.id
                        WHERE post_id IN (${placeholders})
                        ORDER BY post_comments.id ASC
                    `).bind(...postIds)
                ]);

                for (const lk of ((likesRes && likesRes.results) || [])) {
                    likeCountMap.set(lk.post_id, (likeCountMap.get(lk.post_id) || 0) + 1);
                    if (Number(lk.user_id) === Number(user.id)) {
                        likedByMeSet.add(lk.post_id);
                    }
                }

                for (const cm of ((commentsRes && commentsRes.results) || [])) {
                    if (!commentsByPostMap.has(cm.post_id)) commentsByPostMap.set(cm.post_id, []);
                    commentsByPostMap.get(cm.post_id).push(cm);
                }
            }

            const isUserAdmin = (user.role && user.role !== 'Thành Viên');

            for (let p of posts) {
                const rUser = renderUser(p);
                const likeCount = likeCountMap.get(p.id) || 0;
                const heartColor = likedByMeSet.has(p.id) ? '#ff3333' : '#888';
                const comments = commentsByPostMap.get(p.id) || [];

                let commentsHtml = '';
                comments.forEach(c => {
                    const rCommentUser = renderUser(c);
                    commentsHtml += `
                        <div style="font-size: 11px; margin-top: 4px; border-top: 1px solid #222; padding-top: 4px;">
                            ${rCommentUser.nameHtml}: <span style="color: #ddd;">${c.comment}</span>
                        </div>
                    `;
                });

                const imgSrc = normalizeMediaUrl(p.image_url);
                const imageTag = imgSrc
                    ? `<div style="margin-top: 8px; background: #000; text-align: center; border-radius: 4px; overflow: hidden;"><img src="${escapeAttr(imgSrc)}" loading="lazy" style="width: 100%; max-height: 450px; object-fit: contain; display: block; margin: 0 auto;"></div>`
                    : '';

                const canDelete = isUserAdmin || p.user_id === user.id;
                const deleteBtnHtml = canDelete ? `
                    <form onsubmit="deletePostAjax(event, ${p.id})" style="margin: 0;">
                        <input type="hidden" name="action" value="delete_post">
                        <input type="hidden" name="post_id" value="${p.id}">
                        <button type="submit" style="background: none; border: none; color: #ff5555; cursor: pointer; font-size: 11px;" title="Xóa bài viết">🗑️ Xóa</button>
                    </form>
                ` : '';

                postsHtml += `
                <div id="post-card-${p.id}" style="background: #121212; border: 1px solid #2c2c2c; border-radius: 6px; padding: 12px; margin-bottom: 12px;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div style="width: 36px; height: 36px; min-width: 36px; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center;">
                                ${rUser.avatarHtml.replace(/style="[^"]*"/gi, 'style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover;"')}
                            </div>
                            <div>
                                <div>${rUser.nameHtml}</div>
                                <div style="font-size: 10px; color: #888; margin-top: 2px;">${p.created_at || ''}</div>
                            </div>
                        </div>
                        ${deleteBtnHtml}
                    </div>
                    <div style="color: #ddd; font-size: 13px; word-break: break-word; white-space: pre-wrap; margin-bottom: 6px;">${p.content || ''}</div>
                    ${imageTag}

                    <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid #222; margin-top: 10px; padding-top: 8px;">
                        <div style="display: flex; align-items: center; gap: 14px;">
                            <form onsubmit="submitAjax(event, this)" style="margin: 0;">
                                <input type="hidden" name="action" value="like_post">
                                <input type="hidden" name="post_id" value="${p.id}">
                                <button type="submit" style="background: none; border: none; color: ${heartColor}; cursor: pointer; font-size: 14px; padding: 0;">
                                    ❤️ <span style="font-size: 11px; color: #ccc;" id="like-count-${p.id}">${likeCount}</span>
                                </button>
                            </form>

                            <button type="button" onclick="toggleCommentBox(${p.id})" style="background: none; border: none; color: #aaa; cursor: pointer; font-size: 13px; padding: 0; display: flex; align-items: center; gap: 4px;">
                                💬 <span style="font-size: 11px;" id="comm-count-${p.id}">${comments.length}</span> bình luận
                            </button>
                        </div>
                        <span style="font-size: 10px; color: #666;">Tương tác</span>
                    </div>

                    <div style="margin-top: 6px;" id="comment-list-${p.id}">
                        ${commentsHtml}
                    </div>

                    <div id="comment-box-${p.id}" style="display: none; margin-top: 8px;">
                        <form onsubmit="submitCommentAjax(event, ${p.id})" style="display: flex; gap: 6px;">
                            <input type="hidden" name="action" value="add_comment">
                            <input type="hidden" name="post_id" value="${p.id}">
                            <input type="text" name="comment" id="comment-input-${p.id}" placeholder="Viết bình luận của bạn..." style="flex: 1; background: #0a0a0a; color: #fff; border: 1px solid #333; padding: 6px; font-size: 11px; border-radius: 4px;" required>
                            <button type="submit" style="background: #0055ff; color: #fff; border: none; padding: 6px 12px; font-size: 11px; border-radius: 4px; cursor: pointer;">Gửi</button>
                        </form>
                    </div>
                </div>`;
            }
        }
    } catch (e) {}

    let paginationHtml = '';
    if (totalPages > 1) {
        paginationHtml = `<div style="display: flex; justify-content: center; align-items: center; gap: 6px; margin: 15px 0; font-size: 12px;">`;
        if (page > 1) {
            paginationHtml += `<a href="?tab=${tab}&page=${page - 1}" style="background: #1a1a1a; color: #00ff00; border: 1px solid #444; padding: 4px 10px; border-radius: 4px; text-decoration: none;">« Trước</a>`;
        }
        for (let i = 1; i <= totalPages; i++) {
            if (i === page) {
                paginationHtml += `<span style="background: #00ff00; color: #000; font-weight: bold; padding: 4px 10px; border-radius: 4px;">${i}</span>`;
            } else {
                paginationHtml += `<a href="?tab=${tab}&page=${i}" style="background: #1a1a1a; color: #ccc; border: 1px solid #444; padding: 4px 10px; border-radius: 4px; text-decoration: none;">${i}</a>`;
            }
        }
        if (page < totalPages) {
            paginationHtml += `<a href="?tab=${tab}&page=${page + 1}" style="background: #1a1a1a; color: #00ff00; border: 1px solid #444; padding: 4px 10px; border-radius: 4px; text-decoration: none;">Sau »</a>`;
        }
        paginationHtml += `</div>`;
    }

    const newColor = (tab === 'new') ? '#00ff00' : '#aaa';
    const trendingColor = (tab === 'trending') ? '#00ff00' : '#aaa';
    const followingColor = (tab === 'following') ? '#00ff00' : '#aaa';

    const content = `
    <div class="box">
        <div class="box-title" style="display: flex; justify-content: space-between; align-items: center;">
            <span>📰 Bảng tin cộng đồng</span>
            <div style="font-size: 10px;">
                <a href="?tab=new" style="color: ${newColor}; margin-right: 6px; text-decoration: none; font-weight: ${tab==='new'?'bold':'normal'};">Mới nhất</a>
                <a href="?tab=trending" style="color: ${trendingColor}; margin-right: 6px; text-decoration: none; font-weight: ${tab==='trending'?'bold':'normal'};">Đề xuất</a>
                <a href="?tab=following" style="color: ${followingColor}; text-decoration: none; font-weight: ${tab==='following'?'bold':'normal'};">Theo dõi</a>
            </div>
        </div>
        <div class="box-content">
            ${storiesHtml}
            <form onsubmit="submitPostAjax(event, this)">
                <input type="hidden" name="action" value="create_post">
                <textarea name="content" rows="2" placeholder="Bạn đang nghĩ gì thế..." style="width: 100%; background: #141414; color: #00ff00; border: 1px solid #444; padding: 8px; border-radius: 4px; box-sizing: border-box; font-size: 13px; resize: vertical;"></textarea>

                <div style="margin-top: 6px; display: flex; align-items: center; gap: 8px;">
                    <label style="display: inline-flex; align-items: center; gap: 6px; background: #1a1a1a; border: 1px solid #444; color: #00ff00; padding: 5px 12px; border-radius: 4px; font-size: 11px; font-weight: bold; cursor: pointer;">
                        📷 Thêm ảnh
                        <input type="file" name="post_file" accept="image/*" onchange="compressAndSetImage(this, '#post-image-val')" style="display: none;">
                    </label>
                    <input type="hidden" id="post-image-val" name="image_url">
                    <div id="post-compress-status" style="font-size: 10px; color: #aaa;"></div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                    <button type="submit" class="btn" style="background: #00aa00; color: #fff; padding: 6px 16px; border-radius: 4px; cursor: pointer;">Đăng bài</button>
                </div>
            </form>
        </div>
    </div>

    <div id="story-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.88); z-index: 999; justify-content: center; align-items: center; padding: 10px; box-sizing: border-box;">
        <div style="background: #111; border: 1px solid #444; width: 100%; max-width: 360px; padding: 12px; box-sizing: border-box; border-radius: 6px; max-height: 92vh; overflow-y: auto;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 6px; margin-bottom: 10px;">
                <b style="color: #00ff00; font-size: 12px;">📸 Đăng Story</b>
                <button type="button" onclick="closeStoryModal()" style="background:none; border:none; color:#ff5555; font-weight:bold; cursor:pointer;">✕</button>
            </div>
            <form id="story-create-form" method="POST" enctype="multipart/form-data" onsubmit="return handleStoryFormSubmit(event)">
                <input type="hidden" name="action" value="create_story">
                <input type="hidden" id="story-image-val" name="image_url">
                <input type="hidden" id="story-thumb-val" name="thumb_url">
                <input type="hidden" id="story-media-type-val" name="media_type" value="image">
                <input type="hidden" id="story-duration-val" name="duration_sec" value="0">
                <div style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px; flex-wrap: nowrap;">
                    <label style="display: inline-flex; align-items: center; gap: 6px; background: #1a1a1a; border: 1px solid #444; color: #00ff00; padding: 6px 12px; border-radius: 4px; font-size: 11px; font-weight: bold; cursor: pointer; flex-shrink: 0;">
                        🎬 Chọn ảnh hoặc video
                        <input type="file" id="story-file-input" name="story_file" accept="image/*,video/*" onchange="handleStoryMediaSelect(this)" style="display: none;">
                    </label>
                    <div id="story-compress-status" style="font-size: 11px; color: #00ff00; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"></div>
                </div>

                <div id="story-progress-wrap" style="display: none; margin-bottom: 10px; background: #181818; border: 1px solid #333; border-radius: 5px; padding: 6px 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #ccc; margin-bottom: 4px;">
                        <span id="story-progress-label">Đang đăng tải</span>
                        <span id="story-progress-pct" style="color: #00ff00; font-weight: bold;">0%</span>
                    </div>
                    <div style="width: 100%; height: 7px; background: #090909; border-radius: 4px; overflow: hidden;">
                        <div id="story-progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #00aa00, #00ff88); transition: width 0.18s ease;"></div>
                    </div>
                </div>

                <button type="submit" id="story-submit-btn" class="btn" style="width: 100%; background: #0055ff; color: #fff; padding: 8px; font-size: 12px; border: none; border-radius: 4px; cursor: pointer;">Đăng Story</button>
            </form>
        </div>
    </div>

    <div id="story-viewer-modal" onclick="handleStoryBackdropClick(event)" style="display: none; position: fixed; inset: 0; background: #0b0b0d; z-index: 10000; flex-direction: column; justify-content: space-between; user-select: none;">
        <div style="position: relative; z-index: 3; display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: linear-gradient(to bottom, rgba(0,0,0,0.82), rgba(0,0,0,0));">
            <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
                <img id="sv-avatar" src="" style="width: 38px; height: 38px; border-radius: 50%; border: 2px solid #00ff00; object-fit: cover; flex-shrink: 0;">
                <div style="min-width: 0;">
                    <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                        <span id="sv-name" style="color: #fff; font-weight: bold; font-size: 14px; text-shadow: 0 1px 4px #000;"></span>
                    </div>
                    <div style="font-size: 11px; color: #ccc; text-shadow: 0 1px 3px #000;">
                        <span id="sv-time"></span>
                    </div>
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                <button type="button" id="sv-delete-btn" onclick="deleteCurrentStory()" style="display: none; background: rgba(255, 68, 68, 0.22); border: 1px solid #ff5555; color: #ff8888; border-radius: 50%; width: 32px; height: 32px; font-size: 13px; cursor: pointer; align-items: center; justify-content: center;" title="Xóa Story">🗑</button>
                <button type="button" onclick="closeStoryViewer()" style="background: rgba(255,255,255,0.14); border: 1px solid rgba(255,255,255,0.25); color: #fff; border-radius: 50%; width: 32px; height: 32px; font-size: 16px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center;" title="Đóng">✕</button>
            </div>
        </div>

        <div style="position: relative; flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 8px 0;">
            <button type="button" onclick="prevStory()" style="position: absolute; left: 8px; top: 50%; transform: translateY(-50%); z-index: 3; background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.2); color: #fff; width: 32px; height: 48px; border-radius: 8px; font-size: 18px; cursor: pointer;">‹</button>
            <img id="sv-image" src="" alt="Story" style="display: none; max-width: 82vw; max-height: 44vh; width: auto; height: auto; object-fit: contain; border-radius: 8px;">
            <video id="sv-video" controls autoplay playsinline loop style="display: none; max-width: 300px; width: 78vw; max-height: 40vh; height: auto; object-fit: contain; border-radius: 8px; background: #000;"></video>
            <button type="button" onclick="nextStory()" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); z-index: 3; background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.2); color: #fff; width: 32px; height: 48px; border-radius: 8px; font-size: 18px; cursor: pointer;">›</button>
        </div>

        <div style="position: relative; z-index: 3; padding: 10px 12px 16px; background: linear-gradient(to top, rgba(0,0,0,0.92), rgba(0,0,0,0));">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; max-width: 640px; margin: 0 auto;">
                <div style="display: flex; align-items: center; gap: 4px; background: rgba(24,24,28,0.9); border: 1px solid #333; padding: 5px 8px; border-radius: 22px; flex-shrink: 0;">
                    <button type="button" onclick="sendStoryReaction('👍')" style="background:none;border:none;font-size:17px;cursor:pointer;padding:0 2px;">👍</button>
                    <button type="button" onclick="sendStoryReaction('❤️')" style="background:none;border:none;font-size:17px;cursor:pointer;padding:0 2px;">❤️</button>
                    <button type="button" onclick="sendStoryReaction('😂')" style="background:none;border:none;font-size:17px;cursor:pointer;padding:0 2px;">😂</button>
                    <button type="button" onclick="sendStoryReaction('😮')" style="background:none;border:none;font-size:17px;cursor:pointer;padding:0 2px;">😮</button>
                    <button type="button" onclick="sendStoryReaction('😢')" style="background:none;border:none;font-size:17px;cursor:pointer;padding:0 2px;">😢</button>
                    <button type="button" onclick="sendStoryReaction('😡')" style="background:none;border:none;font-size:17px;cursor:pointer;padding:0 2px;">😡</button>
                </div>

                <form onsubmit="sendStoryMessage(event)" style="display: flex; align-items: center; flex: 1; background: rgba(32,34,42,0.92); border: 1px solid #3a3d4a; border-radius: 22px; padding: 3px 6px 3px 12px; min-width: 0;">
                    <input type="text" id="sv-msg-input" placeholder="Gửi tin nhắn..." style="flex: 1; min-width: 0; background: transparent; border: none; color: #fff; font-size: 13px; outline: none; padding: 6px 4px;">
                    <button type="submit" style="background: rgba(255,255,255,0.12); border: none; color: #7aa2ff; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;" title="Gửi tin nhắn">➤</button>
                </form>
            </div>
            <div id="sv-feedback" style="text-align: center; font-size: 11px; color: #00ff00; margin-top: 6px; min-height: 14px;"></div>
        </div>
    </div>

    <script>
        const STORY_VIEWER_LIST = ${storyViewerDataJson};
        const STORY_MEDIA_CACHE = {};
        const MAX_STORY_BYTES = 3 * 1024 * 1024;
        const CHUNK_SIZE_BYTES = 1048576;
        const MERGE_BATCH_SIZE = 4;
        let currentStoryIndex = -1;
        let isSubmittingStory = false;
        let preparedStoryBlob = null;

        function setStoryProgress(pct, labelText) {
            const wrap = document.getElementById('story-progress-wrap');
            const bar = document.getElementById('story-progress-bar');
            const pctEl = document.getElementById('story-progress-pct');
            const lblEl = document.getElementById('story-progress-label');
            const clamped = Math.max(0, Math.min(100, Math.round(pct || 0)));

            if (wrap) wrap.style.display = 'block';
            if (bar) bar.style.width = clamped + '%';
            if (pctEl) pctEl.innerText = clamped + '%';
            if (lblEl && labelText) lblEl.innerText = labelText;
        }

        function hideStoryProgress() {
            const wrap = document.getElementById('story-progress-wrap');
            const bar = document.getElementById('story-progress-bar');
            const pctEl = document.getElementById('story-progress-pct');
            if (wrap) wrap.style.display = 'none';
            if (bar) bar.style.width = '0%';
            if (pctEl) pctEl.innerText = '0%';
        }

        function formatKb(bytes) {
            if (!bytes || bytes <= 0) return '';
            return bytes >= 1048576
                ? (bytes / 1048576).toFixed(2) + 'MB'
                : Math.max(1, Math.round(bytes / 1024)) + 'KB';
        }

        function setStoryReadyText(blobOrFile, hasAudio) {
            const statusEl = document.getElementById('story-compress-status');
            if (statusEl) {
                const sz = blobOrFile && blobOrFile.size ? ' (' + formatKb(blobOrFile.size) + ')' : '';
                statusEl.innerText = (hasAudio ? 'Sẵn sàng · có tiếng' : 'Sẵn sàng') + sz;
                statusEl.style.color = '#00ff00';
            }
        }

        function extractQuickThumbnail(file) {
            return new Promise((resolve) => {
                let objUrl = '';
                try {
                    objUrl = URL.createObjectURL(file);
                    const v = document.createElement('video');
                    v.muted = true;
                    v.playsInline = true;
                    v.preload = 'metadata';
                    v.src = objUrl;
                    let settled = false;
                    const finish = (val) => {
                        if (!settled) {
                            settled = true;
                            try { URL.revokeObjectURL(objUrl); } catch (e) {}
                            resolve(val || '');
                        }
                    };
                    const timer = setTimeout(() => finish(''), 400);

                    v.onloadeddata = function() {
                        try { v.currentTime = 0.01; } catch (e) { clearTimeout(timer); finish(''); }
                    };
                    v.onseeked = function() {
                        clearTimeout(timer);
                        try {
                            const c = document.createElement('canvas');
                            c.width = 80;
                            c.height = 120;
                            const ctx = c.getContext('2d');
                            ctx.drawImage(v, 0, 0, c.width, c.height);
                            finish(c.toDataURL('image/jpeg', 0.25));
                        } catch (e) {
                            finish('');
                        }
                    };
                    v.onerror = () => {
                        clearTimeout(timer);
                        finish('');
                    };
                } catch (e) {
                    if (objUrl) { try { URL.revokeObjectURL(objUrl); } catch (err) {} }
                    resolve('');
                }
            });
        }

        async function recordVideoPass(file, opts, onProgress) {
            if (!file || typeof MediaRecorder === 'undefined' || typeof document.createElement('canvas').captureStream !== 'function') {
                return null;
            }
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return null;

            const candidateMimes = [
                'video/webm;codecs=vp8,opus',
                'video/webm;codecs=vp9,opus',
                'video/mp4;codecs=avc1,mp4a.40.2',
                'video/webm'
            ];
            const supportedMime = candidateMimes.find(m => {
                try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; }
            });
            if (!supportedMime) return null;

            let objUrl = '';
            let audioCtx = null;
            try {
                objUrl = URL.createObjectURL(file);
                const video = document.createElement('video');
                video.muted = false;
                video.volume = 1;
                video.playsInline = true;
                video.preload = 'auto';
                video.src = objUrl;

                await new Promise((resolve, reject) => {
                    const t = setTimeout(() => reject(new Error('timeout')), 3000);
                    video.onloadedmetadata = () => { clearTimeout(t); resolve(); };
                    video.onerror = () => { clearTimeout(t); reject(new Error('load error')); };
                });

                audioCtx = new AudioCtx();
                if (audioCtx.state === 'suspended') {
                    await audioCtx.resume().catch(() => {});
                }
                const sourceNode = audioCtx.createMediaElementSource(video);
                const destNode = audioCtx.createMediaStreamDestination();
                sourceNode.connect(destNode);

                const audioTracks = destNode.stream.getAudioTracks();
                if (!audioTracks || audioTracks.length === 0) {
                    try { await audioCtx.close(); } catch (e) {}
                    try { URL.revokeObjectURL(objUrl); } catch (e) {}
                    return null;
                }

                const maxDim = opts.maxDim || 320;
                const fps = opts.fps || 14;
                const maxRecordMs = opts.maxRecordMs || 15000;

                let w = video.videoWidth || 240;
                let h = video.videoHeight || 320;
                if (w > maxDim || h > maxDim) {
                    if (w >= h) {
                        h = Math.max(80, Math.round((h * maxDim) / w));
                        w = maxDim;
                    } else {
                        w = Math.max(80, Math.round((w * maxDim) / h));
                        h = maxDim;
                    }
                }
                if (w % 2 !== 0) w -= 1;
                if (h % 2 !== 0) h -= 1;

                const rawDurationSec = (video.duration && isFinite(video.duration) && video.duration > 0)
                    ? Math.min(video.duration, maxRecordMs / 1000)
                    : (maxRecordMs / 1000);
                const safeDurationSec = Math.max(1.5, rawDurationSec);

                const budgetBytes = MAX_STORY_BYTES * 0.90;
                const audioBps = opts.audioBps || 32000;
                const totalBitsBudget = budgetBytes * 8;
                const videoBps = Math.max(
                    120000,
                    Math.min(opts.maxVideoBps || 600000, Math.floor((totalBitsBudget / safeDurationSec) - audioBps))
                );

                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                const canvasStream = canvas.captureStream(fps);

                const combinedStream = new MediaStream([
                    ...canvasStream.getVideoTracks(),
                    ...audioTracks
                ]);

                const chunks = [];
                let recorder;
                try {
                    recorder = new MediaRecorder(combinedStream, {
                        mimeType: supportedMime,
                        videoBitsPerSecond: videoBps,
                        audioBitsPerSecond: audioBps
                    });
                } catch (e) {
                    recorder = new MediaRecorder(combinedStream, { mimeType: supportedMime });
                }

                recorder.ondataavailable = (ev) => {
                    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
                };

                let stopped = false;
                let rafId = null;

                const stopRecording = () => {
                    if (stopped) return;
                    stopped = true;
                    if (rafId) cancelAnimationFrame(rafId);
                    try { if (recorder.state !== 'inactive') recorder.stop(); } catch (e) {}
                    try { video.pause(); } catch (e) {}
                };

                const hardTimeout = setTimeout(stopRecording, Math.min(maxRecordMs, safeDurationSec * 1000 + 500));

                const donePromise = new Promise((resolve) => {
                    recorder.onstop = () => {
                        clearTimeout(hardTimeout);
                        resolve(new Blob(chunks, { type: supportedMime }));
                    };
                });

                recorder.start(250);
                video.currentTime = 0;
                await video.play().catch(() => {});

                const drawFrame = () => {
                    if (stopped || video.ended || video.paused) {
                        stopRecording();
                        return;
                    }
                    try {
                        ctx.drawImage(video, 0, 0, w, h);
                        if (onProgress) {
                            const ratio = (video.duration && isFinite(video.duration) && video.duration > 0)
                                ? Math.min(1, video.currentTime / video.duration)
                                : Math.min(1, (video.currentTime * 1000) / maxRecordMs);
                            onProgress(ratio);
                        }
                    } catch (e) {}
                    rafId = requestAnimationFrame(drawFrame);
                };

                video.onended = stopRecording;
                rafId = requestAnimationFrame(drawFrame);

                const outBlob = await donePromise;
                try { if (audioCtx) await audioCtx.close(); } catch (e) {}
                try { URL.revokeObjectURL(objUrl); } catch (e) {}

                return outBlob && outBlob.size > 256 ? outBlob : null;
            } catch (e) {
                try { if (audioCtx) await audioCtx.close(); } catch (err) {}
                if (objUrl) { try { URL.revokeObjectURL(objUrl); } catch (err) {} }
                return null;
            }
        }

        async function enforceUnder3MBVideo(file, onProgress) {
            let bestBlob = await recordVideoPass(file, {
                maxDim: 320,
                fps: 14,
                maxVideoBps: 550000,
                audioBps: 32000,
                maxRecordMs: 15000
            }, (ratio) => {
                if (onProgress) onProgress(Math.min(0.75, ratio * 0.75));
            });

            if (!bestBlob || bestBlob.size > MAX_STORY_BYTES) {
                const sourceForPass2 = (bestBlob && bestBlob.size > 256) ? bestBlob : file;
                const pass2Blob = await recordVideoPass(sourceForPass2, {
                    maxDim: 240,
                    fps: 10,
                    maxVideoBps: 260000,
                    audioBps: 24000,
                    maxRecordMs: 10000
                }, (ratio) => {
                    if (onProgress) onProgress(0.75 + Math.min(0.25, ratio * 0.25));
                });

                if (pass2Blob && (!bestBlob || pass2Blob.size < bestBlob.size)) {
                    bestBlob = pass2Blob;
                }
            }

            if (bestBlob && bestBlob.size > 0 && bestBlob.size <= MAX_STORY_BYTES) {
                return bestBlob;
            }
            if (bestBlob && file.size > 0 && bestBlob.size < file.size) {
                return bestBlob;
            }
            return file.size <= MAX_STORY_BYTES ? file : (bestBlob || file);
        }

        async function fetchWithRetry(url, options, maxRetries = 5) {
            let lastError = null;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    const res = await fetch(url, options);
                    if (res.ok) {
                        const data = await res.json().catch(() => null);
                        if (data && data.success !== false) {
                            return data;
                        }
                        lastError = new Error((data && data.error) || 'Phản hồi máy chủ không thành công');
                    } else {
                        const errData = await res.json().catch(() => null);
                        lastError = new Error((errData && errData.error) || ('HTTP ' + res.status));
                    }
                } catch (err) {
                    lastError = err;
                }
                if (attempt < maxRetries) {
                    await new Promise(r => setTimeout(r, 400 * attempt));
                }
            }
            throw lastError || new Error('Tải lên thất bại sau nhiều lần thử.');
        }

        async function uploadBlobInChunks(blob, folder, mimeType, statusEl) {
            const totalChunks = Math.max(1, Math.ceil(blob.size / CHUNK_SIZE_BYTES));
            const uploadId = 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);

            for (let i = 0; i < totalChunks; i++) {
                const start = i * CHUNK_SIZE_BYTES;
                const end = Math.min(blob.size, start + CHUNK_SIZE_BYTES);
                const chunkBlob = blob.slice(start, end);
                const pct = 35 + Math.round(((i + 1) / totalChunks) * 50);

                if (statusEl) {
                    statusEl.innerText = 'Đang tải ' + pct + '%';
                    statusEl.style.color = '#ffcc00';
                }
                setStoryProgress(pct, 'Đang tải lên (' + (i + 1) + '/' + totalChunks + ')');

                const fd = new FormData();
                fd.append('action', 'upload_media_chunk');
                fd.append('upload_id', uploadId);
                fd.append('chunk_index', String(i));
                fd.append('chunk', chunkBlob);

                await fetchWithRetry(window.location.href, {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: fd
                }, 5);
            }

            let cursor = 0;
            let currentUrl = '';
            while (cursor < totalChunks) {
                const mergePct = 85 + Math.round((cursor / totalChunks) * 10);
                if (statusEl) {
                    statusEl.innerText = 'Đang ghép ' + mergePct + '%';
                    statusEl.style.color = '#ffcc00';
                }
                setStoryProgress(mergePct, 'Đang ghép video');

                const finFd = new FormData();
                finFd.append('action', 'finalize_media_upload');
                finFd.append('upload_id', uploadId);
                finFd.append('start_chunk', String(cursor));
                finFd.append('batch_size', String(MERGE_BATCH_SIZE));
                finFd.append('total_chunks', String(totalChunks));
                finFd.append('existing_url', currentUrl);
                finFd.append('folder', folder);
                finFd.append('mime_type', mimeType || blob.type || 'video/mp4');

                const stepRes = await fetchWithRetry(window.location.href, {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: finFd
                }, 5);

                if (!stepRes || !stepRes.url) {
                    throw new Error('Không nhận được đường dẫn media khi ghép.');
                }
                currentUrl = stepRes.url;
                cursor = typeof stepRes.nextChunk === 'number' ? stepRes.nextChunk : (cursor + MERGE_BATCH_SIZE);
                if (stepRes.done) break;
            }

            return currentUrl;
        }

        function updateSoundButtonState() {
            const vidEl = document.getElementById('sv-video');
            const soundBtn = document.getElementById('sv-sound-btn');
            if (!vidEl || !soundBtn || vidEl.style.display === 'none') {
                if (soundBtn) soundBtn.style.display = 'none';
                return;
            }
        }

        function toggleStorySound() {
            const vidEl = document.getElementById('sv-video');
            if (!vidEl) return;
            vidEl.muted = !vidEl.muted;
            vidEl.volume = 1;
            vidEl.play().catch(() => {});
            updateSoundButtonState();
        }

        async function openStoryViewer(idx) {
            if (!Array.isArray(STORY_VIEWER_LIST) || idx < 0 || idx >= STORY_VIEWER_LIST.length) return;
            currentStoryIndex = idx;
            const item = STORY_VIEWER_LIST[idx];

            const avEl = document.getElementById('sv-avatar');
            avEl.src = item.avatar || '';
            if (item.avatarStyle) {
                avEl.setAttribute('style', item.avatarStyle + ' width: 38px; height: 38px; flex-shrink: 0;');
            }
            const nameEl = document.getElementById('sv-name');
            if (item.nameHtml) {
                nameEl.innerHTML = item.nameHtml;
            } else {
                nameEl.innerText = item.name || 'Thành viên';
            }
            document.getElementById('sv-time').innerText = item.createdAt || 'Vừa xong';
            document.getElementById('sv-feedback').innerText = '';
            document.getElementById('sv-msg-input').value = '';

            const imgEl = document.getElementById('sv-image');
            const vidEl = document.getElementById('sv-video');
            const delBtn = document.getElementById('sv-delete-btn');
            const soundBtn = document.getElementById('sv-sound-btn');
            delBtn.style.display = item.canDelete ? 'flex' : 'none';

            document.getElementById('story-viewer-modal').style.display = 'flex';

            if (item.mediaType === 'video') {
                imgEl.style.display = 'none';
                imgEl.src = '';
                vidEl.style.display = 'block';
                vidEl.muted = false;
                vidEl.volume = 1;
                vidEl.src = '';
                if (soundBtn) soundBtn.style.display = 'inline-flex';

                const resolvedUrl = item.mediaUrl || STORY_MEDIA_CACHE[item.id] || '';
                if (currentStoryIndex === idx && resolvedUrl) {
                    vidEl.src = resolvedUrl;
                    vidEl.play().then(() => {
                        updateSoundButtonState();
                    }).catch(() => {
                        vidEl.muted = true;
                        vidEl.play().catch(() => {});
                        updateSoundButtonState();
                    });
                }
            } else {
                vidEl.pause();
                vidEl.style.display = 'none';
                vidEl.src = '';
                if (soundBtn) soundBtn.style.display = 'none';
                imgEl.src = item.mediaUrl || '';
                imgEl.style.display = 'block';
            }
        }

        function closeStoryViewer() {
            const vidEl = document.getElementById('sv-video');
            if (vidEl) {
                vidEl.pause();
                vidEl.src = '';
            }
            document.getElementById('story-viewer-modal').style.display = 'none';
            currentStoryIndex = -1;
        }

        function handleStoryBackdropClick(e) {
            if (e.target && e.target.id === 'story-viewer-modal') {
                closeStoryViewer();
            }
        }

        function prevStory() {
            if (!STORY_VIEWER_LIST.length) return;
            const nextIdx = currentStoryIndex > 0 ? currentStoryIndex - 1 : STORY_VIEWER_LIST.length - 1;
            openStoryViewer(nextIdx);
        }

        function nextStory() {
            if (!STORY_VIEWER_LIST.length) return;
            const nextIdx = currentStoryIndex < STORY_VIEWER_LIST.length - 1 ? currentStoryIndex + 1 : 0;
            openStoryViewer(nextIdx);
        }

        function sendStoryReaction(emoji) {
            const item = STORY_VIEWER_LIST[currentStoryIndex];
            if (!item) return;
            const fb = document.getElementById('sv-feedback');
            fb.innerText = 'Đã thả ' + emoji + ' cho Story của ' + item.name;
        }

        function sendStoryMessage(e) {
            e.preventDefault();
            const item = STORY_VIEWER_LIST[currentStoryIndex];
            const input = document.getElementById('sv-msg-input');
            const text = (input.value || '').trim();
            if (!item || !text) return;

            if (item.userId) {
                window.location.href = '/mail/chat?user=' + encodeURIComponent(item.userId) + '&msg=' + encodeURIComponent('[Story] ' + text);
            } else {
                document.getElementById('sv-feedback').innerText = 'Đã chuẩn bị tin nhắn: ' + text;
                input.value = '';
            }
        }

        async function deleteCurrentStory() {
            const item = STORY_VIEWER_LIST[currentStoryIndex];
            if (!item || !item.id) return;
            if (!confirm('Xóa Story này?')) return;

            const formData = new FormData();
            formData.append('action', 'delete_story');
            formData.append('story_id', item.id);

            try {
                await fetch(window.location.href, {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: formData
                });
                window.location.reload();
            } catch (e) {
                window.location.reload();
            }
        }

        function openStoryModal() {
            resetStoryForm();
            document.getElementById('story-modal').style.display = 'flex';
        }

        function closeStoryModal() {
            document.getElementById('story-modal').style.display = 'none';
        }

        function resetStoryForm() {
            isSubmittingStory = false;
            preparedStoryBlob = null;
            hideStoryProgress();
            const submitBtn = document.getElementById('story-submit-btn');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = 'Đăng Story';
            }
            document.getElementById('story-image-val').value = '';
            document.getElementById('story-thumb-val').value = '';
            document.getElementById('story-media-type-val').value = 'image';
            document.getElementById('story-duration-val').value = '0';
            document.getElementById('story-compress-status').innerText = '';
            document.getElementById('story-compress-status').style.color = '#00ff00';
            const fi = document.getElementById('story-file-input');
            if (fi) fi.value = '';
        }

        async function handleStoryMediaSelect(fileInput) {
            const file = fileInput.files && fileInput.files[0];
            const statusEl = document.getElementById('story-compress-status');
            if (!file) return;

            preparedStoryBlob = null;
            hideStoryProgress();

            const isVideoFile = (file.type && file.type.startsWith('video/')) ||
                /\.(mp4|mov|webm|mkv|avi|m4v|3gp|ogg|ogv|ts|mts)$/i.test(file.name || '');

            if (isVideoFile) {
                document.getElementById('story-media-type-val').value = 'video';
                document.getElementById('story-image-val').value = '';
                document.getElementById('story-thumb-val').value = '';

                extractQuickThumbnail(file).then((thumb) => {
                    if (thumb && !document.getElementById('story-thumb-val').value) {
                        document.getElementById('story-thumb-val').value = thumb;
                    }
                });

                if (statusEl) {
                    statusEl.innerText = 'Đăng đi nà!';
                    statusEl.style.color = '#ffcc00';
                }

                preparedStoryBlob = await enforceUnder3MBVideo(file);
                setStoryReadyText(preparedStoryBlob, true);
            } else {
                document.getElementById('story-media-type-val').value = 'image';
                document.getElementById('story-duration-val').value = '0';
                compressAndSetImage(fileInput, '#story-image-val', 480, 0.55);
            }
        }

        async function handleStoryFormSubmit(e) {
            e.preventDefault();
            if (isSubmittingStory) return false;

            const statusEl = document.getElementById('story-compress-status');
            const submitBtn = document.getElementById('story-submit-btn');
            const fileInput = document.getElementById('story-file-input');
            const file = fileInput && fileInput.files && fileInput.files[0];
            let val = document.getElementById('story-image-val').value.trim();

            if (!file && !preparedStoryBlob && !val) {
                statusEl.innerText = 'Chưa chọn file';
                statusEl.style.color = '#ff5555';
                return false;
            }

            isSubmittingStory = true;
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerText = 'Đang đăng...';
            }
            setStoryProgress(5, 'Đang bắt đầu đăng Story');

            try {
                let payloadBlob = preparedStoryBlob || file;
                const isVideoFile = (payloadBlob && payloadBlob.type && payloadBlob.type.startsWith('video/')) ||
                    (file && /\.(mp4|mov|webm|mkv|avi|m4v|3gp|ogg|ogv|ts|mts)$/i.test(file.name || ''));

                if (isVideoFile && !val) {
                    if (!preparedStoryBlob || payloadBlob.size > MAX_STORY_BYTES) {
                        payloadBlob = await enforceUnder3MBVideo(payloadBlob || file, (ratio) => {
                            setStoryProgress(5 + Math.round(ratio * 30), '');
                        });
                        preparedStoryBlob = payloadBlob;
                    } else {
                        setStoryProgress(35, 'Đã nén xong (' + formatKb(payloadBlob.size) + ')');
                    }
                } else {
                    setStoryProgress(35, 'Đang chuẩn bị tải lên');
                }

                if (payloadBlob && !val) {
                    const mimeToUse = payloadBlob.type || (file && file.type) || (isVideoFile ? 'video/mp4' : 'image/jpeg');
                    val = await uploadBlobInChunks(payloadBlob, 'stories', mimeToUse, statusEl);
                    document.getElementById('story-image-val').value = val;
                }

                if (statusEl) {
                    statusEl.innerText = 'Đang lưu 98%';
                    statusEl.style.color = '#ffcc00';
                }
                setStoryProgress(98, 'Đang lưu Story');

                const form = document.getElementById('story-create-form');
                const formData = new FormData(form);
                if (val) {
                    formData.delete('story_file');
                }

                await fetchWithRetry(window.location.href, {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: formData
                }, 5);

                setStoryProgress(100, 'Hoàn tất 100%');
                if (statusEl) {
                    statusEl.innerText = 'Hoàn tất 100%';
                    statusEl.style.color = '#00ff00';
                }

                window.location.reload();
                return false;
            } catch (err) {
                if (statusEl) {
                    statusEl.innerText = err && err.message ? err.message : 'Lỗi tải lên';
                    statusEl.style.color = '#ff5555';
                }
                setStoryProgress(0, 'Lỗi tải lên');
            }

            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = 'Đăng Story';
            }
            isSubmittingStory = false;
            return false;
        }

        function toggleCommentBox(postId) {
            const box = document.getElementById('comment-box-' + postId);
            if (box.style.display === 'none' || box.style.display === '') {
                box.style.display = 'block';
                document.getElementById('comment-input-' + postId).focus();
            } else {
                box.style.display = 'none';
            }
        }

        function compressAndSetImage(fileInput, targetInputSelector, maxDim = 900, quality = 0.72) {
            const file = fileInput.files[0];
            const statusId = targetInputSelector.includes('post') ? 'post-compress-status' : 'story-compress-status';
            const statusEl = document.getElementById(statusId);

            if (!file) return;
            statusEl.innerText = targetInputSelector === '#story-image-val' ? 'Đang giảm dung lượng...' : ("⚡ Đang giảm dung lượng: " + file.name);

            const reader = new FileReader();
            reader.onload = function(e) {
                const img = new Image();
                img.onload = function() {
                    let width = img.width;
                    let height = img.height;

                    if (width > maxDim || height > maxDim) {
                        if (width >= height) {
                            height = Math.round((height * maxDim) / width);
                            width = maxDim;
                        } else {
                            width = Math.round((width * maxDim) / height);
                            height = maxDim;
                        }
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
                    document.querySelector(targetInputSelector).value = compressedBase64;
                    if (targetInputSelector === '#story-image-val') {
                        document.getElementById('story-thumb-val').value = compressedBase64;
                        const approxBytes = Math.round((compressedBase64.length * 3) / 4);
                        setStoryReadyText({ size: approxBytes }, false);
                    } else {
                        statusEl.innerText = "✅ Đã giảm dung lượng (" + width + "x" + height + ")";
                        statusEl.style.color = "#00ff00";
                    }
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }

        async function submitAjax(event, form) {
            event.preventDefault();
            const formData = new FormData(form);
            const btn = form.querySelector('button');
            try {
                const res = await fetch(window.location.href, {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: formData
                });
                if (res.ok) {
                    const spanCount = btn.querySelector('span:nth-child(2)');
                    let count = parseInt(spanCount.innerText);
                    if (btn.style.color === 'rgb(255, 51, 51)') {
                        btn.style.color = '#888';
                        spanCount.innerText = count - 1;
                    } else {
                        btn.style.color = '#ff3333';
                        spanCount.innerText = count + 1;
                    }
                }
            } catch (e) {
                window.location.reload();
            }
        }

        async function submitCommentAjax(event, postId) {
            event.preventDefault();
            const input = document.getElementById('comment-input-' + postId);
            const text = input.value.trim();
            if (!text) return;

            const formData = new FormData();
            formData.append('action', 'add_comment');
            formData.append('post_id', postId);
            formData.append('comment', text);

            try {
                const res = await fetch(window.location.href, {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: formData
                });
                if (res.ok) {
                    window.location.reload();
                }
            } catch (e) {
                window.location.reload();
            }
        }

        async function deletePostAjax(event, postId) {
            event.preventDefault();
            if (!confirm("Bạn có chắc chắn muốn xóa vĩnh viễn bài viết này không?")) return;

            const formData = new FormData(event.target);
            try {
                const res = await fetch(window.location.href, {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: formData
                });
                if (res.ok) {
                    const card = document.getElementById('post-card-' + postId);
                    if (card) {
                        card.style.transition = 'opacity 0.3s ease';
                        card.style.opacity = '0';
                        setTimeout(() => card.remove(), 300);
                    } else {
                        window.location.reload();
                    }
                }
            } catch (e) {
                window.location.reload();
            }
        }

        async function submitPostAjax(event, form) {
            event.preventDefault();
            const formData = new FormData(form);
            try {
                const res = await fetch(window.location.href, {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: formData
                });
                if (res.ok) {
                    window.location.reload();
                }
            } catch (e) {
                window.location.reload();
            }
        }
    </script>

    <div class="box">
        <div class="box-title">📰 Bảng tin cộng đồng</div>
        <div class="box-content">
            ${postsHtml}
            ${paginationHtml}
        </div>
    </div>
    `;

    return new Response(renderLayout('Bảng tin', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
```[cite: 22, 23, 30]

---

### 3. `src/routes/mail_box.js`
```javascript
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

function formatPreviewMessage(msgRow, currentUserId) {
    if (!msgRow) return 'Nhấn để trò chuyện...';

    const senderId = msgRow.sender_id !== undefined && msgRow.sender_id !== null
        ? Number(msgRow.sender_id)
        : Number(msgRow.user_id);
    const isMe = senderId === Number(currentUserId);
    const prefix = isMe ? 'Bạn: ' : '';

    const rawText = (msgRow.message || '').trim();
    const hasImage = Boolean(msgRow.image_url && String(msgRow.image_url).trim() !== '');
    const isGif = /^https?:\/\//i.test(rawText) &&
        (rawText.includes('.gif') || rawText.includes('giphy') || rawText.includes('tenor'));

    if (isGif) {
        return `${prefix}[GIF]`;
    }
    if (hasImage && !rawText) {
        return `${prefix}[Hình ảnh]`;
    }
    if (hasImage && rawText) {
        return `${prefix}[Ảnh] ${rawText}`;
    }
    return `${prefix}${rawText || 'Nhấn để trò chuyện...'}`;
}

export async function handleMailBox(request, env, user, renderLayout) {
    try {
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS mail_box (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sender_id INTEGER,
                receiver_id INTEGER,
                message TEXT,
                image_url TEXT,
                is_read INTEGER DEFAULT 0,
                created_at TEXT
            )
        `).run();

        try {
            await env.DB.prepare("ALTER TABLE mail_box ADD COLUMN image_url TEXT").run();
        } catch (e) {}

        try {
            await env.DB.prepare("ALTER TABLE mail_box ADD COLUMN is_read INTEGER DEFAULT 0").run();
        } catch (e) {}
    } catch (e) {}

    let useLegacyCols = false;
    let conversations = [];

    try {
        const query = `
            SELECT
                CASE
                    WHEN sender_id = ? THEN receiver_id
                    ELSE sender_id
                END as partner_id,
                MAX(id) as last_msg_id
            FROM mail_box
            WHERE sender_id = ? OR receiver_id = ?
            GROUP BY partner_id
            ORDER BY last_msg_id DESC
        `;
        const res = await env.DB.prepare(query).bind(user.id, user.id, user.id).all();
        if (res && Array.isArray(res.results)) {
            conversations = res.results;
        }
    } catch (e) {
        useLegacyCols = true;
    }

    if (useLegacyCols || conversations.length === 0) {
        try {
            const query2 = `
                SELECT
                    CASE
                        WHEN user_id = ? THEN partner_id
                        ELSE user_id
                    END as partner_id,
                    MAX(id) as last_msg_id
                FROM mail_box
                WHERE user_id = ? OR partner_id = ?
                GROUP BY partner_id
                ORDER BY last_msg_id DESC
            `;
            const res2 = await env.DB.prepare(query2).bind(user.id, user.id, user.id).all();
            if (res2 && Array.isArray(res2.results) && res2.results.length > 0) {
                conversations = res2.results;
                useLegacyCols = true;
            }
        } catch (err) {}
    }

    let listHtml = '';

    if (!conversations || conversations.length === 0) {
        listHtml = '<div style="text-align: center; color: #777; padding: 20px;">Hộp thư trống. Chưa có cuộc trò chuyện nào.</div>';
    } else {
        const partnersData = [];

        for (const c of conversations) {
            const pid = Number(c.partner_id);
            if (!pid || Number.isNaN(pid) || pid === Number(user.id)) continue;

            let partner = null;
            try {
                partner = await env.DB.prepare(`
                    SELECT id, username, display_name, avatar, border_color, avatar_glow,
                           name_color, name_glow, name_border, name_border_glow, active_icon, role, is_admin
                    FROM users WHERE id = ?
                `).bind(pid).first();
            } catch (e) {}

            if (!partner) continue;

            let lastMsgRow = null;
            let unreadCount = 0;

            try {
                if (!useLegacyCols) {
                    lastMsgRow = await env.DB.prepare(`
                        SELECT sender_id, message, image_url, is_read
                        FROM mail_box
                        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
                        ORDER BY id DESC LIMIT 1
                    `).bind(user.id, pid, pid, user.id).first();

                    const unreadRes = await env.DB.prepare(`
                        SELECT COUNT(*) as cnt
                        FROM mail_box
                        WHERE receiver_id = ? AND sender_id = ? AND (is_read IS NULL OR is_read = 0)
                    `).bind(user.id, pid).first();

                    unreadCount = unreadRes ? Number(unreadRes.cnt || 0) : 0;
                } else {
                    lastMsgRow = await env.DB.prepare(`
                        SELECT user_id, partner_id, message, image_url, is_read
                        FROM mail_box
                        WHERE (user_id = ? AND partner_id = ?) OR (user_id = ? AND partner_id = ?)
                        ORDER BY id DESC LIMIT 1
                    `).bind(user.id, pid, pid, user.id).first();

                    const unreadRes = await env.DB.prepare(`
                        SELECT COUNT(*) as cnt
                        FROM mail_box
                        WHERE user_id = ? AND partner_id = ? AND (is_read IS NULL OR is_read = 0)
                    `).bind(user.id, pid).first();

                    unreadCount = unreadRes ? Number(unreadRes.cnt || 0) : 0;
                }
            } catch (err) {}

            partnersData.push({
                partner,
                lastMsgText: formatPreviewMessage(lastMsgRow, user.id),
                unreadCount,
                lastMsgId: Number(c.last_msg_id || 0)
            });
        }

        partnersData.sort((a, b) => b.lastMsgId - a.lastMsgId);

        if (partnersData.length === 0) {
            listHtml = '<div style="text-align: center; color: #777; padding: 20px;">Hộp thư trống.</div>';
        } else {
            listHtml = partnersData.map((item, index) => {
                const p = item.partner;
                const pId = Number(p.id);
                const rUser = renderUser(p);

                const unreadBadgeHtml = item.unreadCount > 0
                    ? `<span data-partner-badge="${pId}" style="background: #ff0000; color: #fff; font-size: 9px; padding: 1px 6px; border-radius: 10px; font-weight: bold;">Mới (${item.unreadCount})</span>`
                    : '';

                return `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px; border-bottom: 1px solid #222; background: ${index % 2 === 0 ? '#080808' : '#030303'};">
                    <div style="display: flex; align-items: center; gap: 10px; overflow: hidden;">
                        <div style="width: 38px; height: 38px; min-width: 38px; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center;">
                            ${rUser.avatarHtml.replace(/style="[^"]*"/gi, 'style="width: 38px; height: 38px; border-radius: 50%; object-fit: cover;"')}
                        </div>
                        <div style="overflow: hidden;">
                            <div style="font-size: 13px; display: flex; align-items: center; gap: 6px;">
                                <a href="/profile?user=${pId}" style="text-decoration: none;">${rUser.nameHtml}</a>
                                ${unreadBadgeHtml}
                            </div>
                            <div style="color: ${item.unreadCount > 0 ? '#eee' : '#aaa'}; font-weight: ${item.unreadCount > 0 ? 'bold' : 'normal'}; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 240px; margin-top: 2px;">
                                ${escapeHtml(item.lastMsgText)}
                            </div>
                        </div>
                    </div>
                    <div>
                        <a href="/mail/chat?user=${pId}" class="btn" style="background: #0044cc; color: #fff; padding: 6px 12px; font-size: 12px; border-radius: 4px; text-decoration: none;">Nhắn tin</a>
                    </div>
                </div>`;
            }).join('');
        }
    }

    const content = `
    <div class="box">
        <div class="box-title">✉️ Hộp thư tin nhắn</div>
        <div class="box-content" style="padding: 0;">
            ${listHtml}
        </div>
    </div>
    <div style="text-align: center; margin-top: 12px; font-size: 13px;">
        <a href="/">⬅ Về trang chủ</a>
    </div>
    `;

    return new Response(renderLayout('Hộp thư tin nhắn', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
```[cite: 24, 29]

---

### 4. `src/routes/mail_chat.js`
```javascript
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

export async function handleMailChat(request, env, user, renderLayout, url) {
    const partnerIdParam = url.searchParams.get('user');
    if (!partnerIdParam) {
        return Response.redirect(new URL('/mail/box', request.url), 302);
    }

    const partnerId = parseInt(partnerIdParam, 10);
    if (!partnerId || Number.isNaN(partnerId)) {
        return Response.redirect(new URL('/mail/box', request.url), 302);
    }

    try {
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS mail_box (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sender_id INTEGER,
                receiver_id INTEGER,
                message TEXT,
                image_url TEXT,
                is_read INTEGER DEFAULT 0,
                created_at TEXT
            )
        `).run();

        try {
            await env.DB.prepare("ALTER TABLE mail_box ADD COLUMN image_url TEXT").run();
        } catch (e) {}

        try {
            await env.DB.prepare("ALTER TABLE mail_box ADD COLUMN is_read INTEGER DEFAULT 0").run();
        } catch (e) {}
    } catch (e) {}

    const markPartnerMessagesRead = async () => {
        try {
            await env.DB.prepare(
                "UPDATE mail_box SET is_read = 1 WHERE receiver_id = ? AND sender_id = ? AND (is_read IS NULL OR is_read = 0)"
            ).bind(user.id, partnerId).run();
        } catch (err1) {
            try {
                await env.DB.prepare(
                    "UPDATE mail_box SET is_read = 1 WHERE user_id = ? AND partner_id = ? AND (is_read IS NULL OR is_read = 0)"
                ).bind(user.id, partnerId).run();
            } catch (err2) {}
        }
    };

    if (request.method === 'POST') {
        try {
            const formData = await request.formData();
            const rawMessage = formData.get('message');
            const rawImageUrl = formData.get('image_url');

            const message = rawMessage ? String(rawMessage).trim() : '';
            const imageUrl = rawImageUrl ? String(rawImageUrl).trim() : '';

            if (message !== '' || imageUrl !== '') {
                try {
                    await env.DB.prepare(
                        "INSERT INTO mail_box (sender_id, receiver_id, message, image_url, is_read, created_at) VALUES (?, ?, ?, ?, 0, datetime('now'))"
                    ).bind(user.id, partnerId, message, imageUrl).run();
                } catch (err) {
                    await env.DB.prepare(
                        "INSERT INTO mail_box (user_id, partner_id, message, image_url, is_read, created_at) VALUES (?, ?, ?, ?, 0, datetime('now'))"
                    ).bind(user.id, partnerId, message, imageUrl).run();
                }

                await markPartnerMessagesRead();
            }

            if (request.headers.get('X-Requested-With') === 'XMLHttpRequest') {
                return new Response(JSON.stringify({ success: true }), {
                    headers: { 'Content-Type': 'application/json;charset=UTF-8' }
                });
            }
        } catch (e) {
            if (request.headers.get('X-Requested-With') === 'XMLHttpRequest') {
                return new Response(JSON.stringify({ success: false }), {
                    headers: { 'Content-Type': 'application/json;charset=UTF-8' }
                });
            }
        }
        return Response.redirect(new URL(`/mail/chat?user=${partnerId}`, request.url), 302);
    }

    let partner = null;
    try {
        partner = await env.DB.prepare(`
            SELECT id, username, display_name, avatar, border_color, avatar_glow,
                   name_color, name_glow, name_border, name_border_glow, active_icon, role, is_admin
            FROM users WHERE id = ?
        `).bind(partnerId).first();
    } catch (e) {}

    if (!partner) {
        return new Response("Không tìm thấy thành viên này.", { status: 404 });
    }

    await markPartnerMessagesRead();

    let messages = [];
    try {
        const history = await env.DB.prepare(`
            SELECT * FROM mail_box
            WHERE (sender_id = ? AND receiver_id = ?)
               OR (sender_id = ? AND receiver_id = ?)
            ORDER BY id ASC
        `).bind(user.id, partnerId, partnerId, user.id).all();

        if (history.results && history.results.length > 0) {
            messages = history.results;
        } else {
            const history2 = await env.DB.prepare(`
                SELECT * FROM mail_box
                WHERE (user_id = ? AND partner_id = ?)
                   OR (user_id = ? AND partner_id = ?)
                ORDER BY id ASC
            `).bind(user.id, partnerId, partnerId, user.id).all();
            messages = history2.results || [];
        }
    } catch (e) {}

    const rPartnerHeader = renderUser(partner);

    const renderMessageHtml = (m, currentUserObj, partnerObj) => {
        const sender = m.sender_id || m.user_id;
        const isMe = Number(sender) === Number(currentUserObj.id);
        const isRead = Number(m.is_read || 0) === 1;

        const msgUser = isMe ? currentUserObj : partnerObj;
        const rMsgUser = renderUser(msgUser);

        const rawMsg = m.message || '';
        const isGifLink = /^https?:\/\//i.test(rawMsg) &&
            (rawMsg.includes('.gif') || rawMsg.includes('giphy') || rawMsg.includes('tenor'));

        const messageBodyHtml = isGifLink
            ? `<img src="${escapeHtml(rawMsg)}" style="max-width: 140px; max-height: 140px; border-radius: 6px; display: block;" />`
            : `<div>${escapeHtml(rawMsg)}</div>`;

        const imageTag = m.image_url
            ? `<div style="margin-top: 8px;"><img src="${escapeHtml(m.image_url)}" style="max-width: 100%; max-height: 300px; border-radius: 6px; object-fit: contain; display: block;"></div>`
            : '';

        const readReceiptHtml = isMe
            ? `<div style="font-size: 11px; margin-top: 3px; color: ${isRead ? '#00ff88' : '#888'}; font-weight: ${isRead ? 'bold' : 'normal'};">${isRead ? '✓✓ Đã xem' : '✓ Đã gửi'}</div>`
            : '';

        return `
        <div style="display: flex; flex-direction: column; align-items: ${isMe ? 'flex-end' : 'flex-start'};">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
                <div style="width: 36px; height: 36px; min-width: 36px; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center;">
                    ${rMsgUser.avatarHtml.replace(/style="[^"]*"/gi, 'style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover;"')}
                </div>
                <div style="font-size: 13px; display: flex; align-items: center; font-weight: bold;">
                    ${rMsgUser.nameHtml}
                </div>
            </div>
            <div style="max-width: 80%; background: ${isMe ? '#1a3300' : '#1a1a1a'}; border: 1px solid ${isMe ? '#339900' : '#333'}; padding: 10px 14px; border-radius: 8px; color: #fff; font-size: 15px; word-break: break-word; line-height: 1.4;">
                ${messageBodyHtml}
                ${imageTag}
            </div>
            ${readReceiptHtml}
        </div>`;
    };

    const safeCurrentUserJson = JSON.stringify({
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        avatar: user.avatar,
        border_color: user.border_color,
        avatar_glow: user.avatar_glow,
        name_color: user.name_color,
        name_glow: user.name_glow,
        name_border: user.name_border,
        name_border_glow: user.name_border_glow,
        active_icon: user.active_icon,
        role: user.role,
        is_admin: user.is_admin
    }).replace(/</g, '\\u003c');

    const safePartnerJson = JSON.stringify({
        id: partner.id,
        username: partner.username,
        display_name: partner.display_name,
        avatar: partner.avatar,
        border_color: partner.border_color,
        avatar_glow: partner.avatar_glow,
        name_color: partner.name_color,
        name_glow: partner.name_glow,
        name_border: partner.name_border,
        name_border_glow: partner.name_border_glow,
        active_icon: partner.active_icon,
        role: partner.role,
        is_admin: partner.is_admin
    }).replace(/</g, '\\u003c');

    const content = `
    <div class="box" style="position: relative;">
        <div class="box-title" style="display: flex; align-items: center; gap: 8px; font-size: 15px;">
            <span>🟢 Trò chuyện với</span> ${rPartnerHeader.nameHtml}
        </div>
        <div class="box-content" style="padding: 10px;">

            <div id="chatMessageBox" style="height: 420px; overflow-y: scroll; background: #000; border: 1px solid #333; padding: 12px; display: flex; flex-direction: column; gap: 14px; margin-bottom: 12px;">
                ${messages.length === 0
                    ? '<div id="no-msg" style="color: #777; text-align: center; margin-top: 170px; font-size: 14px;">Chưa có tin nhắn nào. Hãy gửi tin nhắn mở lời!</div>'
                    : messages.map(m => renderMessageHtml(m, user, partner)).join('')}
            </div>

            <form id="chatForm" onsubmit="sendChatMessage(event)" style="display: flex; flex-direction: column; gap: 8px; position: relative;">
                <div style="display: flex; gap: 8px; align-items: center;">
                    <label style="display: inline-flex; align-items: center; justify-content: center; background: #1a1a1a; border: 1px solid #444; color: #00ff00; width: 40px; height: 40px; border-radius: 6px; cursor: pointer; font-size: 20px;" title="Gửi ảnh">
                        📷
                        <input type="file" accept="image/*" onchange="compressAndSetChatImage(this)" style="display: none;">
                    </label>
                    <input type="hidden" id="chat-image-val" name="image_url">

                    <input type="text" name="message" id="messageInput" placeholder="Nhập nội dung chát..." autocomplete="off" style="flex: 1; background: #000; color: #fff; border: 1px solid #444; padding: 10px 12px; font-size: 14px; box-sizing: border-box; border-radius: 6px;" required>

                    <button type="button" onclick="toggleGifPopup()" class="btn" style="background: #333; color: #ffcc00; padding: 10px 12px; font-size: 14px; border-radius: 6px; cursor: pointer; border: 1px solid #551a8b;" title="Kho Sticker GIF Meme">🎁 GIF</button>

                    <button type="submit" id="sendBtn" class="btn" style="background: #0055ff; color: #fff; padding: 10px 18px; font-size: 14px; border-radius: 6px; cursor: pointer; font-weight: bold;">Gửi</button>
                </div>

                <div id="gifPopup" style="display: none; position: absolute; bottom: 55px; right: 0; background: #111; border: 1px solid #444; padding: 10px; border-radius: 8px; width: 300px; max-height: 220px; overflow-y: auto; box-shadow: 0 4px 15px rgba(0,0,0,0.8); z-index: 999; grid-template-columns: repeat(3, 1fr); gap: 8px;">
                    <div style="grid-column: span 3; font-size: 12px; color: #ffcc00; font-weight: bold; border-bottom: 1px solid #333; padding-bottom: 4px; display: flex; justify-content: space-between; align-items: center;">
                        <span>😂 Kho GIF Meme & Đáng Yêu</span>
                        <span onclick="toggleGifPopup()" style="cursor: pointer; color: #ff5555; padding: 0 4px;">✕</span>
                    </div>
                    <img src="https://media.giphy.com/media/26vUDlO9wK7fyOpls/giphy.gif" onclick="sendGifIcon('https://media.giphy.com/media/26vUDlO9wK7fyOpls/giphy.gif')" style="width: 100%; height: 70px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #333;">
                    <img src="https://media.giphy.com/media/3o7TKoWXm3okO1kgHC/giphy.gif" onclick="sendGifIcon('https://media.giphy.com/media/3o7TKoWXm3okO1kgHC/giphy.gif')" style="width: 100%; height: 70px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #333;">
                    <img src="https://media.giphy.com/media/l0HlvcHy69b5H9e9i/giphy.gif" onclick="sendGifIcon('https://media.giphy.com/media/l0HlvcHy69b5H9e9i/giphy.gif')" style="width: 100%; height: 70px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #333;">
                    <img src="https://media.giphy.com/media/3oKIPnAiaMCws8nOsE/giphy.gif" onclick="sendGifIcon('https://media.giphy.com/media/3oKIPnAiaMCws8nOsE/giphy.gif')" style="width: 100%; height: 70px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #333;">
                    <img src="https://media.giphy.com/media/xT5LMFZDsj0AKUDYTS/giphy.gif" onclick="sendGifIcon('https://media.giphy.com/media/xT5LMFZDsj0AKUDYTS/giphy.gif')" style="width: 100%; height: 70px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #333;">
                    <img src="https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif" onclick="sendGifIcon('https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif')" style="width: 100%; height: 70px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #333;">
                    <img src="https://media.giphy.com/media/5GoVL4DAbWw1gTWrdh/giphy.gif" onclick="sendGifIcon('https://media.giphy.com/media/5GoVL4DAbWw1gTWrdh/giphy.gif')" style="width: 100%; height: 70px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #333;">
                    <img src="https://media.giphy.com/media/26u4lOMA8JKSnL9Uk/giphy.gif" onclick="sendGifIcon('https://media.giphy.com/media/26u4lOMA8JKSnL9Uk/giphy.gif')" style="width: 100%; height: 70px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #333;">
                    <img src="https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif" onclick="sendGifIcon('https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif')" style="width: 100%; height: 70px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #333;">
                    <img src="https://media.giphy.com/media/9uIW81bE27zV6/giphy.gif" onclick="sendGifIcon('https://media.giphy.com/media/9uIW81bE27zV6/giphy.gif')" style="width: 100%; height: 70px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #333;">
                    <img src="https://media.giphy.com/media/10ECejnDra1Dbq/giphy.gif" onclick="sendGifIcon('https://media.giphy.com/media/10ECejnDra1Dbq/giphy.gif')" style="width: 100%; height: 70px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #333;">
                    <img src="https://media.giphy.com/media/jpbnoe3UIa8TU8LM13/giphy.gif" onclick="sendGifIcon('https://media.giphy.com/media/jpbnoe3UIa8TU8LM13/giphy.gif')" style="width: 100%; height: 70px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #333;">
                </div>

                <div id="chat-compress-status" style="font-size: 11px; color: #00ff00; text-align: right;"></div>
            </form>

            <div style="text-align: center; margin-top: 12px; font-size: 13px;">
                <a href="/mail/box">⬅ Hộp thư tin nhắn</a>
            </div>
        </div>
    </div>

    <script>
        const currentUserId = ${Number(user.id)};
        const partnerId = ${Number(partnerId)};
        const currentUserData = ${safeCurrentUserJson};
        const partnerData = ${safePartnerJson};
        const chatBox = document.getElementById('chatMessageBox');

        function escapeJsHtml(str) {
            if (str === null || str === undefined) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function scrollToBottom() {
            chatBox.scrollTop = chatBox.scrollHeight;
        }
        scrollToBottom();

        function toggleGifPopup() {
            const popup = document.getElementById('gifPopup');
            if (!popup) return;
            if (popup.style.display === 'none' || popup.style.display === '') {
                popup.style.display = 'grid';
            } else {
                popup.style.display = 'none';
            }
        }

        function syncChatNotifications(otherUnreadCount) {
            const safeOtherUnread = typeof otherUnreadCount === 'number' ? otherUnreadCount : 0;

            document.querySelectorAll('a[href*="user=' + partnerId + '"], a[href*="/mail/chat"]').forEach(function(link) {
                const href = link.getAttribute('href') || '';
                const isThisPartner = href.indexOf('user=' + partnerId) !== -1;

                link.querySelectorAll('span, .badge, .mail-badge, [class*="badge"], [class*="count"]').forEach(function(el) {
                    const txt = (el.textContent || '').trim();
                    if (isThisPartner) {
                        el.style.display = 'none';
                    } else if (href.indexOf('/mail') !== -1 && safeOtherUnread === 0 && /^\\d+$/.test(txt)) {
                        el.style.display = 'none';
                    }
                });
            });

            if (safeOtherUnread === 0) {
                document.querySelectorAll('a[href*="/mail"]').forEach(function(mailLink) {
                    const parent = mailLink.parentElement || mailLink;
                    parent.querySelectorAll('span, .badge, .popup-badge, [style*="background"][style*="red"], [style*="background:#ff"], [style*="background: #ff"], [style*="background: #e"], [style*="background:#e"], [style*="background: #c"], [style*="background:#c"]').forEach(function(badge) {
                        const txt = (badge.textContent || '').trim();
                        if (/^\\d+$/.test(txt) || txt === '') {
                            badge.style.display = 'none';
                        }
                    });
                });

                document.querySelectorAll('[id*="mail-popup"], [id*="chat-popup"], [class*="mail-popup"], [class*="chat-popup"], [class*="floating-mail"], [class*="toast-mail"]').forEach(function(popup) {
                    const popupText = popup.textContent || '';
                    const partnerName = partnerData.display_name || partnerData.username || '';
                    if (!partnerName || popupText.indexOf(partnerName) !== -1 || safeOtherUnread === 0) {
                        popup.style.display = 'none';
                    }
                });
            }
        }

        async function markCurrentConversationRead() {
            try {
                await fetch('/api/mark-read?partner_id=' + partnerId, {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' }
                });
            } catch (e) {
                try {
                    await fetch('/api/mark-read?partner_id=' + partnerId);
                } catch (e2) {}
            }
        }

        async function sendGifIcon(gifUrl) {
            const popup = document.getElementById('gifPopup');
            if (popup) popup.style.display = 'none';

            const formData = new FormData();
            formData.append('message', gifUrl);

            try {
                const res = await fetch(window.location.href, {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: formData
                });

                if (res.ok) {
                    await markCurrentConversationRead();
                    await fetchRealtimeMessages();
                    scrollToBottom();
                }
            } catch (e) {}
        }

        async function sendChatMessage(event) {
            event.preventDefault();
            const form = document.getElementById('chatForm');
            const input = document.getElementById('messageInput');
            const imgVal = document.getElementById('chat-image-val');

            if (!input.value.trim() && !imgVal.value) return;

            const formData = new FormData(form);

            try {
                const res = await fetch(window.location.href, {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: formData
                });

                if (res.ok) {
                    input.value = '';
                    imgVal.value = '';
                    document.getElementById('chat-compress-status').innerText = '';
                    await markCurrentConversationRead();
                    await fetchRealtimeMessages();
                    scrollToBottom();
                }
            } catch (e) {
                form.submit();
            }
        }

        function compressAndSetChatImage(fileInput) {
            const file = fileInput.files[0];
            const statusEl = document.getElementById('chat-compress-status');
            if (!file) return;
            statusEl.innerText = "⏳ Đang nén ảnh...";

            const reader = new FileReader();
            reader.onload = function(e) {
                const img = new Image();
                img.onload = function() {
                    const MAX_WIDTH = 1000;
                    let width = img.width;
                    let height = img.height;

                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    const compressedBase64 = canvas.toDataURL('image/jpeg', 0.80);
                    document.getElementById('chat-image-val').value = compressedBase64;
                    statusEl.innerText = "✅ Đã đính kèm ảnh!";
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }

        async function fetchRealtimeMessages() {
            try {
                await markCurrentConversationRead();
                const res = await fetch('/api/realtime-check?partner_id=' + partnerId + '&in_chat_with=' + partnerId + '&_t=' + Date.now());
                if (res.ok) {
                    const data = await res.json();

                    let otherUnread = 0;
                    if (typeof data.other_unread_count === 'number') {
                        otherUnread = data.other_unread_count;
                    } else if (Array.isArray(data.unread_senders)) {
                        otherUnread = data.unread_senders.filter(function(id) {
                            return Number(id) !== partnerId;
                        }).length;
                    }

                    syncChatNotifications(otherUnread);

                    if (Array.isArray(data.chat_messages) && data.chat_messages.length > 0) {
                        let html = '';
                        data.chat_messages.forEach(function(m) {
                            const sender = m.sender_id || m.user_id;
                            const isMe = Number(sender) === currentUserId;
                            const isRead = Number(m.is_read || 0) === 1 || (!isMe && Number(sender) === partnerId);
                            const msgUser = isMe ? currentUserData : partnerData;

                            const imageTag = m.image_url
                                ? '<div style="margin-top: 8px;"><img src="' + escapeJsHtml(m.image_url) + '" style="max-width: 100%; max-height: 300px; border-radius: 6px; object-fit: contain; display: block;"></div>'
                                : '';

                            const rawMsg = m.message || '';
                            const isGifLink = /^https?:\\/\\//i.test(rawMsg) &&
                                (rawMsg.indexOf('.gif') !== -1 || rawMsg.indexOf('giphy') !== -1 || rawMsg.indexOf('tenor') !== -1);

                            const messageText = isGifLink
                                ? '<img src="' + escapeJsHtml(rawMsg) + '" style="max-width: 140px; max-height: 140px; border-radius: 6px; display: block;" />'
                                : '<div>' + escapeJsHtml(rawMsg) + '</div>';

                            const readReceiptHtml = isMe
                                ? '<div style="font-size: 11px; margin-top: 3px; color: ' + (isRead ? '#00ff88' : '#888') + '; font-weight: ' + (isRead ? 'bold' : 'normal') + ';">' + (isRead ? '✓✓ Đã xem' : '✓ Đã gửi') + '</div>'
                                : '';

                            const alignment = isMe ? 'flex-end' : 'flex-start';
                            const bubbleBg = isMe ? '#1a3300' : '#1a1a1a';
                            const bubbleBorder = isMe ? '#339900' : '#333';
                            const iconPrefix = msgUser.active_icon ? (escapeJsHtml(msgUser.active_icon) + ' ') : '';

                            html += '<div style="display: flex; flex-direction: column; align-items: ' + alignment + ';">' +
                                '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">' +
                                    '<div style="width: 36px; height: 36px; min-width: 36px; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center;">' +
                                        '<img src="' + escapeJsHtml(msgUser.avatar || '') + '" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover;">' +
                                    '</div>' +
                                    '<div style="font-size: 13px; display: flex; align-items: center; font-weight: bold;">' +
                                        '<span style="color: ' + escapeJsHtml(msgUser.name_color || '#00ff00') + ';">' + iconPrefix + escapeJsHtml(msgUser.display_name || msgUser.username) + '</span>' +
                                    '</div>' +
                                '</div>' +
                                '<div style="max-width: 80%; background: ' + bubbleBg + '; border: 1px solid ' + bubbleBorder + '; padding: 10px 14px; border-radius: 8px; color: #fff; font-size: 15px; word-break: break-word; line-height: 1.4;">' +
                                    messageText +
                                    imageTag +
                                '</div>' +
                                readReceiptHtml +
                            '</div>';
                        });

                        if (chatBox.innerHTML !== html) {
                            const isAtBottom = chatBox.scrollHeight - chatBox.scrollTop <= chatBox.clientHeight + 60;
                            chatBox.innerHTML = html;
                            if (isAtBottom) {
                                scrollToBottom();
                            }
                        }
                    }
                }
            } catch (e) {}
        }

        markCurrentConversationRead().then(function() {
            syncChatNotifications(0);
            fetchRealtimeMessages();
        });
        setInterval(fetchRealtimeMessages, 2500);
    </script>
    `;

    return new Response(renderLayout(`Trò chuyện với ${partner.display_name || partner.username}`, content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
```[cite: 25, 28]

---

### 5. `src/routes/level.js`
```javascript
import { renderUser } from '../worker.js';

export async function handleLevel(request, env, user, renderLayout) {
    let users = { results: [] };
    try {
        users = await env.DB.prepare(`
            SELECT * FROM users 
            ORDER BY COALESCE(level, 1) DESC, COALESCE(coins, 0) DESC, id ASC
            LIMIT 50
        `).all();
    } catch (e) {}

    let rankListHtml = '';
    if (!users.results || users.results.length === 0) {
        rankListHtml = '<div style="text-align: center; color: #777; padding: 10px;">Chưa có dữ liệu thành viên.</div>';
    } else {
        rankListHtml = users.results.map((u, index) => {
            const uUI = renderUser(u);
            const styledAvt = String(uUI.avatarHtml || '').replace(
                'style="',
                'style="width: 36px; height: 36px; display: block; '
            );
            let rankNum = index + 1;
            let rankColor = '#fff';
            if (rankNum === 1) rankColor = '#ff3333';
            else if (rankNum === 2) rankColor = '#ffcc00';
            else if (rankNum === 3) rankColor = '#00ffff';

            return `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border-bottom: 1px solid #222; background: ${index % 2 === 0 ? '#080808' : '#030303'};">
                <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                    <span style="font-weight: bold; width: 24px; text-align: center; color: ${rankColor}; flex-shrink: 0;">#${rankNum}</span>
                    <div style="width: 36px; height: 36px; flex-shrink: 0;">${styledAvt}</div>
                    <div style="min-width: 0;">
                        <div style="font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${uUI.nameHtml}
                        </div>
                        <div style="color: #aaa; font-size: 12px; margin-top: 2px;">
                            Cấp độ: <span style="color: #ffcc00; font-weight: bold;">${u.level || 1}</span>
                        </div>
                    </div>
                </div>
                <div style="text-align: right; font-size: 12px; flex-shrink: 0;">
                    <div style="color: #00ff00;">🪙 ${(u.coins || 0).toLocaleString()}</div>
                    ${u.gold ? `<div style="color: #ffcc00;">👑 ${u.gold.toLocaleString()}</div>` : ''}
                </div>
            </div>`;
        }).join('');
    }

    const content = `
    <div class="box">
        <div class="box-title">📊 Bảng cấp độ</div>
        <div class="box-content" style="padding: 0;">
            ${rankListHtml}
        </div>
    </div>
    <div style="text-align: center; margin-top: 10px; font-size: 13px;">
        <a href="/">⬅ Quay lại trang chủ</a>
    </div>
    `;

    return new Response(renderLayout('Bảng cấp độ', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
```[cite: 26]

Bạn dán đè các file này vào đúng đường dẫn trong project rồi deploy lại nhé!
