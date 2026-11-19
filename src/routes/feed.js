import { renderUser } from '../worker.js';

function escapeAttr(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

export async function handleFeed(request, env, user, renderLayout) {
    // 1. Tự động khởi tạo bảng dữ liệu & bảng quản lý media tập trung (ảnh + video)
    try {
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
    } catch (e) {}

    const urlObj = new URL(request.url);
    const tab = urlObj.searchParams.get('tab') || 'new';
    const page = parseInt(urlObj.searchParams.get('page')) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;

    // Endpoint nhẹ lấy media đầy đủ của 1 Story khi người dùng mở xem toàn màn hình (giảm nặng khi load trang)
    if (request.method === 'GET' && urlObj.searchParams.get('story_media_id')) {
        const storyMediaId = parseInt(urlObj.searchParams.get('story_media_id'), 10);
        if (!isNaN(storyMediaId) && storyMediaId > 0) {
            try {
                const row = await env.DB.prepare(`
                    SELECT stories.id,
                           COALESCE(ma.media_url, stories.media_url, stories.image_url) AS media_url,
                           COALESCE(ma.thumb_url, stories.thumb_url, stories.image_url) AS thumb_url,
                           COALESCE(ma.media_type, stories.media_type, 'image') AS media_type
                    FROM stories
                    LEFT JOIN media_assets ma ON ma.owner_type = 'story' AND ma.owner_id = stories.id
                    WHERE stories.id = ?
                    LIMIT 1
                `).bind(storyMediaId).first();

                return new Response(JSON.stringify({
                    success: Boolean(row),
                    id: storyMediaId,
                    mediaUrl: row ? (row.media_url || '') : '',
                    thumbUrl: row ? (row.thumb_url || '') : '',
                    mediaType: row ? (row.media_type || 'image') : 'image'
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

    // 2. Xử lý các yêu cầu POST
    if (request.method === 'POST') {
        try {
            const formData = await request.formData();
            const action = formData.get('action');

            if (action === 'create_post') {
                const content = String(formData.get('content') || '');
                const imageUrl = String(formData.get('image_url') || '');
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
                const mediaUrl = String(formData.get('image_url') || formData.get('media_url') || '').trim();
                const rawThumb = String(formData.get('thumb_url') || '').trim();
                const rawType = String(formData.get('media_type') || 'image').toLowerCase();
                const mediaType = rawType === 'video' ? 'video' : 'image';
                const durationSec = Math.min(30, Math.max(0, parseFloat(formData.get('duration_sec') || '0') || 0));

                if (mediaUrl !== '') {
                    const thumbFinal = rawThumb || (mediaType === 'image' ? mediaUrl : '');
                    const imageColVal = mediaType === 'image' ? mediaUrl : thumbFinal;

                    const insertedStory = await env.DB.prepare(
                        "INSERT INTO stories (user_id, image_url, media_url, thumb_url, media_type, caption, created_at) VALUES (?, ?, ?, ?, ?, '', datetime('now')) RETURNING id"
                    ).bind(user.id, imageColVal, mediaUrl, thumbFinal, mediaType).first();

                    if (insertedStory && insertedStory.id) {
                        await env.DB.prepare(
                            "INSERT INTO media_assets (user_id, owner_type, owner_id, media_type, media_url, thumb_url, duration_sec, created_at) VALUES (?, 'story', ?, ?, ?, ?, ?, datetime('now'))"
                        ).bind(user.id, insertedStory.id, mediaType, mediaUrl, thumbFinal, durationSec).run();
                    }
                }
            } else if (action === 'delete_story') {
                const storyId = formData.get('story_id');
                const targetStory = await env.DB.prepare("SELECT user_id FROM stories WHERE id = ?").bind(storyId).first();
                const isManager = (user.role && user.role !== 'Thành Viên');
                if (targetStory && (isManager || targetStory.user_id === user.id)) {
                    await env.DB.batch([
                        env.DB.prepare("DELETE FROM media_assets WHERE owner_type = 'story' AND owner_id = ?").bind(storyId),
                        env.DB.prepare("DELETE FROM stories WHERE id = ?").bind(storyId)
                    ]);
                }
            } else if (action === 'delete_post') {
                const postId = formData.get('post_id');
                const targetPost = await env.DB.prepare("SELECT user_id FROM posts WHERE id = ?").bind(postId).first();
                const isManager = (user.role && user.role !== 'Thành Viên');

                if (targetPost && (isManager || targetPost.user_id === user.id)) {
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
                    headers: { 'Content-Type': 'application/json;charset=UTF-8' }
                });
            }
        }
    }

    // 3. Lấy danh sách Stories nhẹ (chỉ lấy thumb_url cho danh sách ngang; video tải khi mở toàn màn hình)
    let storiesHtml = '';
    let storyViewerDataJson = '[]';
    try {
        const storyRes = await env.DB.prepare(`
            SELECT stories.id, stories.user_id, stories.created_at,
                   COALESCE(ma.thumb_url, stories.thumb_url, stories.image_url) AS resolved_thumb_url,
                   COALESCE(ma.media_type, stories.media_type, 'image') AS resolved_media_type,
                   CASE WHEN COALESCE(ma.media_type, stories.media_type, 'image') = 'image'
                        THEN COALESCE(ma.media_url, stories.media_url, stories.image_url)
                        ELSE ''
                   END AS inline_image_url,
                   users.username, users.display_name, users.avatar, users.role
            FROM stories
            LEFT JOIN media_assets ma ON ma.owner_type = 'story' AND ma.owner_id = stories.id
            LEFT JOIN users ON stories.user_id = users.id
            ORDER BY stories.id DESC LIMIT 15
        `).all();
        const stories = storyRes.results || [];
        const isManager = (user.role && user.role !== 'Thành Viên');
        const fallbackAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='50' height='50'><rect width='50' height='50' fill='%23333'/></svg>";
        const fallbackVideoThumb = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='180'><rect width='120' height='180' fill='%23101820'/><text x='60' y='95' fill='%2300ff00' font-size='28' text-anchor='middle'>▶</text></svg>";

        const viewerItems = stories.map((s, idx) => {
            const detectedType = s.resolved_media_type === 'video' ? 'video' : 'image';
            const sName = s.display_name || s.username || 'Thành viên';
            const sAvatar = s.avatar || fallbackAvatar;
            return {
                index: idx,
                id: s.id,
                userId: s.user_id || 0,
                name: sName,
                avatar: sAvatar,
                mediaUrl: detectedType === 'image' ? (s.inline_image_url || '') : '',
                mediaType: detectedType,
                createdAt: s.created_at || 'Vừa xong',
                role: s.role || 'Thành Viên',
                canDelete: Boolean(isManager || (s.user_id && s.user_id === user.id))
            };
        });
        storyViewerDataJson = JSON.stringify(viewerItems).replace(/</g, '\\u003c');

        storiesHtml = `
            <div style="display: flex; gap: 8px; overflow-x: auto; padding: 6px 0; margin-bottom: 10px; scrollbar-width: none;">
                <div onclick="openStoryModal()" style="min-width: 68px; height: 110px; background: #1a1a1a; border: 1px dashed #00ff00; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;">
                    <div style="width: 28px; height: 28px; background: #00ff00; color: #000; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 16px; margin-bottom: 4px;">+</div>
                    <div style="font-size: 9px; color: #aaa; text-align: center;">Thêm Story</div>
                </div>
        `;

        stories.forEach((s, idx) => {
            const isVid = s.resolved_media_type === 'video';
            const thumbSrc = s.resolved_thumb_url || (isVid ? fallbackVideoThumb : '');
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

    // 4. Truy vấn bài viết & tổng số trang tối ưu bằng batch
    let postsQuery = '';
    if (tab === 'trending') {
        postsQuery = `
            SELECT posts.*, users.username, users.display_name, users.avatar, users.border_color, users.avatar_glow,
                   users.name_color, users.name_glow, users.name_border, users.name_border_glow, users.active_icon, users.role,
                   (SELECT COUNT(*) FROM post_likes WHERE post_id = posts.id) +
                   (SELECT COUNT(*) FROM post_comments WHERE post_id = posts.id) as total_interactions
            FROM posts
            JOIN users ON posts.user_id = users.id
            ORDER BY total_interactions DESC, posts.id DESC LIMIT ? OFFSET ?
        `;
    } else if (tab === 'following') {
        postsQuery = `
            SELECT posts.*, users.username, users.display_name, users.avatar, users.border_color, users.avatar_glow,
                   users.name_color, users.name_glow, users.name_border, users.name_border_glow, users.active_icon, users.role
            FROM posts
            JOIN users ON posts.user_id = users.id
            WHERE posts.user_id IN (SELECT following_id FROM follows WHERE follower_id = ?)
            ORDER BY posts.id DESC LIMIT ? OFFSET ?
        `;
    } else {
        postsQuery = `
            SELECT posts.*, users.username, users.display_name, users.avatar, users.border_color, users.avatar_glow,
                   users.name_color, users.name_glow, users.name_border, users.name_border_glow, users.active_icon, users.role
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

    // 5. Lấy likes & comments theo batch cho toàn bộ bài viết trên trang (tránh N+1 query)
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
                               users.name_color, users.name_glow, users.name_border, users.name_border_glow, users.active_icon, users.role
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

                const imageTag = p.image_url
                    ? `<div style="margin-top: 8px; background: #000; text-align: center; border-radius: 4px; overflow: hidden;"><img src="${p.image_url}" loading="lazy" style="width: 100%; max-height: 450px; object-fit: contain; display: block; margin: 0 auto;"></div>`
                    : '';

                const roleDisplayHtml = (p.role && p.role !== 'Thành Viên') ? `
                    <span style="display: inline-block; background: #1a1a1a; border: 1px solid #444; color: #ffcc00; font-size: 10px; font-weight: bold; padding: 1px 6px; border-radius: 4px; text-shadow: 0 0 4px rgba(255,204,0,0.4);">
                        ${p.role}
                    </span>
                ` : `
                    <span style="color: #888; font-size: 11px;">${p.role || 'Thành viên'}</span>
                `;

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
                                <div>${rUser.nameHtml} <span style="font-size: 10px; color: #888; margin-left: 6px;">${p.created_at || ''}</span></div>
                                <div style="font-size: 11px; margin-top: 2px; display: flex; align-items: center; gap: 4px;">
                                    ${roleDisplayHtml} <span style="color: #666;">•</span> <span style="color: #aaa;">🌍 Công khai</span>
                                </div>
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

    // 6. Giao diện Phân trang
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

    // 7. Giao diện hoàn chỉnh
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
                        <input type="file" accept="image/*" onchange="compressAndSetImage(this, '#post-image-val')" style="display: none;">
                    </label>
                    <input type="hidden" id="post-image-val" name="image_url">
                    <div id="post-compress-status" style="font-size: 10px; color: #aaa;"></div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                    <span style="font-size: 10px; color: #888;">✨ Tự động nén tối ưu dung lượng</span>
                    <button type="submit" class="btn" style="background: #00aa00; color: #fff; padding: 6px 16px; border-radius: 4px; cursor: pointer;">Đăng bài</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Popup Modal Đăng Story (Ảnh hoặc Video tối đa 30s) -->
    <div id="story-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.88); z-index: 999; justify-content: center; align-items: center; padding: 10px; box-sizing: border-box;">
        <div style="background: #111; border: 1px solid #444; width: 100%; max-width: 360px; padding: 12px; box-sizing: border-box; border-radius: 6px; max-height: 92vh; overflow-y: auto;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 6px; margin-bottom: 10px;">
                <b style="color: #00ff00; font-size: 12px;">📸 Đăng Story mới (Ảnh / Video ≤ 30s)</b>
                <button type="button" onclick="closeStoryModal()" style="background:none; border:none; color:#ff5555; font-weight:bold; cursor:pointer;">✕</button>
            </div>
            <form method="POST" onsubmit="return validateStorySubmit(event)">
                <input type="hidden" name="action" value="create_story">
                <input type="hidden" id="story-image-val" name="image_url">
                <input type="hidden" id="story-thumb-val" name="thumb_url">
                <input type="hidden" id="story-media-type-val" name="media_type" value="image">
                <input type="hidden" id="story-duration-val" name="duration_sec" value="0">

                <label style="color: #ccc; font-size: 11px; display: block; margin-bottom: 6px;">Chọn ảnh hoặc video Story (video tối đa 30 giây):</label>
                <div style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <label style="display: inline-flex; align-items: center; gap: 6px; background: #1a1a1a; border: 1px solid #444; color: #00ff00; padding: 6px 12px; border-radius: 4px; font-size: 11px; font-weight: bold; cursor: pointer;">
                        🎬 Chọn ảnh hoặc video
                        <input type="file" id="story-file-input" accept="image/*,video/*" onchange="handleStoryMediaSelect(this)" style="display: none;">
                    </label>
                    <div id="story-compress-status" style="font-size: 10px; color: #aaa;"></div>
                </div>

                <!-- Khung cắt video khi video dài hơn 30 giây -->
                <div id="video-trim-panel" style="display: none; background: #161006; border: 1px solid #ff9900; border-radius: 5px; padding: 8px; margin-bottom: 10px; font-size: 11px;">
                    <div style="color: #ffcc00; font-weight: bold; margin-bottom: 6px;">
                        ✂️ Video dài hơn 30 giây (<span id="vt-total-sec">0</span>s) — hãy cắt còn tối đa 30s:
                    </div>
                    <video id="vt-preview-video" controls playsinline style="width: 100%; max-height: 180px; background: #000; border-radius: 4px; margin-bottom: 8px; display: block;"></video>

                    <div style="margin-bottom: 6px; color: #ddd;">
                        Bắt đầu từ giây thứ: <b id="vt-start-label" style="color:#00ff00;">0.0s</b>
                        <input type="range" id="vt-start-range" min="0" max="0" step="0.5" value="0" oninput="updateTrimRange()" style="width: 100%; margin-top: 4px;">
                    </div>

                    <div style="margin-bottom: 8px; color: #ddd;">
                        Độ dài đoạn cắt (tối đa 30s): <b id="vt-dur-label" style="color:#00ff00;">30.0s</b>
                        <input type="range" id="vt-dur-range" min="1" max="30" step="0.5" value="30" oninput="updateTrimRange()" style="width: 100%; margin-top: 4px;">
                    </div>

                    <button type="button" id="vt-cut-btn" onclick="trimVideoToStory()" style="width: 100%; background: #ff8800; color: #000; font-weight: bold; border: none; padding: 7px 10px; border-radius: 4px; font-size: 11px; cursor: pointer;">
                        ✂️ Cắt video ngắn hơn (≤ 30s)
                    </button>
                </div>

                <button type="submit" id="story-submit-btn" class="btn" style="width: 100%; background: #0055ff; color: #fff; padding: 8px; font-size: 12px; border: none; border-radius: 4px; cursor: pointer;">Đăng Story</button>
            </form>
        </div>
    </div>

    <!-- Modal Xem Story Toàn Màn Hình -->
    <div id="story-viewer-modal" onclick="handleStoryBackdropClick(event)" style="display: none; position: fixed; inset: 0; background: #0b0b0d; z-index: 10000; flex-direction: column; justify-content: space-between; user-select: none;">
        <div style="position: relative; z-index: 3; display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: linear-gradient(to bottom, rgba(0,0,0,0.82), rgba(0,0,0,0));">
            <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
                <img id="sv-avatar" src="" style="width: 38px; height: 38px; border-radius: 50%; border: 2px solid #00ff00; object-fit: cover; flex-shrink: 0;">
                <div style="min-width: 0;">
                    <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                        <span id="sv-name" style="color: #fff; font-weight: bold; font-size: 14px; text-shadow: 0 1px 4px #000;"></span>
                        <span id="sv-role-badge" style="display: none; background: rgba(255,204,0,0.18); border: 1px solid #ffcc00; color: #ffcc00; font-size: 10px; font-weight: bold; padding: 1px 6px; border-radius: 4px;"></span>
                    </div>
                    <div style="font-size: 11px; color: #ccc; text-shadow: 0 1px 3px #000;">
                        <span id="sv-time"></span> · 🌍 Công khai
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
            <img id="sv-image" src="" alt="Story" style="display: none; max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain;">
            <video id="sv-video" controls autoplay playsinline loop style="display: none; max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain;"></video>
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
        const MAX_STORY_VIDEO_SEC = 30;
        const MAX_DIRECT_VIDEO_BYTES = 2.5 * 1024 * 1024; // 2.5MB: dùng trực tiếp không cần ghi lại tốn thời gian
        let currentStoryIndex = -1;
        let pendingVideoFile = null;
        let pendingVideoObjectUrl = '';
        let pendingVideoDuration = 0;
        let videoNeedsTrim = false;
        let isProcessingStoryMedia = false;

        function blobToDataUrl(blob) {
            return new Promise((resolve, reject) => {
                const r = new FileReader();
                r.onload = () => resolve(r.result || '');
                r.onerror = () => reject(new Error('Không thể đọc dữ liệu media.'));
                r.readAsDataURL(blob);
            });
        }

        function extractVideoThumbnailFromUrl(srcUrl) {
            return new Promise((resolve) => {
                try {
                    const v = document.createElement('video');
                    v.muted = true;
                    v.playsInline = true;
                    v.preload = 'auto';
                    v.src = srcUrl;
                    let settled = false;
                    const done = (val) => {
                        if (!settled) {
                            settled = true;
                            resolve(val || '');
                        }
                    };
                    const timer = setTimeout(() => done(''), 1800);

                    v.onloadeddata = function() {
                        try {
                            v.currentTime = Math.min(0.15, Math.max(0, (v.duration || 1) * 0.05));
                        } catch (e) {
                            clearTimeout(timer);
                            done('');
                        }
                    };
                    v.onseeked = function() {
                        clearTimeout(timer);
                        try {
                            const c = document.createElement('canvas');
                            c.width = 120;
                            c.height = 180;
                            const ctx = c.getContext('2d');
                            ctx.drawImage(v, 0, 0, c.width, c.height);
                            done(c.toDataURL('image/jpeg', 0.55));
                        } catch (e) {
                            done('');
                        }
                    };
                    v.onerror = () => {
                        clearTimeout(timer);
                        done('');
                    };
                } catch (e) {
                    resolve('');
                }
            });
        }

        function recordFastVideoTrim(srcUrl, startSec, cutSec) {
            return new Promise((resolve, reject) => {
                const workVideo = document.createElement('video');
                workVideo.src = srcUrl;
                workVideo.muted = true;
                workVideo.playsInline = true;
                workVideo.preload = 'auto';

                const safeCutSec = Math.min(MAX_STORY_VIDEO_SEC, Math.max(0.5, cutSec));
                const timeoutMs = Math.min(22000, Math.round(safeCutSec * 1000) + 4000);
                let finished = false;
                let rafId = null;
                let recorder = null;

                const cleanupAndFail = (msg) => {
                    if (finished) return;
                    finished = true;
                    if (rafId) cancelAnimationFrame(rafId);
                    try { workVideo.pause(); } catch (e) {}
                    try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch (e) {}
                    reject(new Error(msg));
                };

                const guardTimer = setTimeout(() => cleanupAndFail('Cắt video quá thời gian cho phép.'), timeoutMs);

                workVideo.onloadedmetadata = function() {
                    const safeDur = Math.max(0.5, Number(workVideo.duration || safeCutSec));
                    const targetStart = Math.min(Math.max(0, startSec), Math.max(0, safeDur - 0.5));
                    workVideo.currentTime = targetStart;
                };

                workVideo.onseeked = function() {
                    if (finished) return;
                    const origW = workVideo.videoWidth || 320;
                    const origH = workVideo.videoHeight || 480;
                    const maxDim = 320;
                    let w = origW;
                    let h = origH;
                    if (w > maxDim || h > maxDim) {
                        if (w >= h) {
                            h = Math.max(96, Math.round((h * maxDim) / w));
                            w = maxDim;
                        } else {
                            w = Math.max(96, Math.round((w * maxDim) / h));
                            h = maxDim;
                        }
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');

                    const stream = canvas.captureStream ? canvas.captureStream(18) : null;
                    if (!stream || typeof MediaRecorder === 'undefined') {
                        clearTimeout(guardTimer);
                        cleanupAndFail('Trình duyệt không hỗ trợ cắt video trực tiếp.');
                        return;
                    }

                    const mimeOptions = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
                    let chosenMime = '';
                    for (const m of mimeOptions) {
                        if (MediaRecorder.isTypeSupported(m)) {
                            chosenMime = m;
                            break;
                        }
                    }

                    recorder = chosenMime
                        ? new MediaRecorder(stream, { mimeType: chosenMime, videoBitsPerSecond: 420000 })
                        : new MediaRecorder(stream);

                    const chunks = [];
                    recorder.ondataavailable = function(ev) {
                        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
                    };

                    const startTimeMs = performance.now();
                    const targetMs = safeCutSec * 1000;
                    let thumbData = '';

                    function drawFrame() {
                        if (finished) return;
                        ctx.drawImage(workVideo, 0, 0, canvas.width, canvas.height);
                        if (!thumbData) {
                            try { thumbData = canvas.toDataURL('image/jpeg', 0.55); } catch (e) {}
                        }
                        if (performance.now() - startTimeMs < targetMs && !workVideo.ended) {
                            rafId = requestAnimationFrame(drawFrame);
                        } else {
                            if (rafId) cancelAnimationFrame(rafId);
                            workVideo.pause();
                            if (recorder.state !== 'inactive') recorder.stop();
                        }
                    }

                    recorder.onstop = async function() {
                        clearTimeout(guardTimer);
                        if (finished) return;
                        finished = true;
                        try {
                            const blob = new Blob(chunks, { type: chosenMime || 'video/webm' });
                            const dataUrl = await blobToDataUrl(blob);
                            resolve({ videoDataUrl: dataUrl, thumbDataUrl: thumbData });
                        } catch (e) {
                            reject(e);
                        }
                    };

                    recorder.start();
                    workVideo.play().catch(() => {});
                    drawFrame();
                };

                workVideo.onerror = () => {
                    clearTimeout(guardTimer);
                    cleanupAndFail('Không thể mở file video.');
                };
            });
        }

        async function openStoryViewer(idx) {
            if (!Array.isArray(STORY_VIEWER_LIST) || idx < 0 || idx >= STORY_VIEWER_LIST.length) return;
            currentStoryIndex = idx;
            const item = STORY_VIEWER_LIST[idx];

            document.getElementById('sv-avatar').src = item.avatar || '';
            document.getElementById('sv-name').innerText = item.name || 'Thành viên';
            document.getElementById('sv-time').innerText = item.createdAt || 'Vừa xong';
            document.getElementById('sv-feedback').innerText = '';
            document.getElementById('sv-msg-input').value = '';

            const roleBadge = document.getElementById('sv-role-badge');
            if (item.role && item.role !== 'Thành Viên') {
                roleBadge.innerText = item.role;
                roleBadge.style.display = 'inline-block';
            } else {
                roleBadge.style.display = 'none';
            }

            const imgEl = document.getElementById('sv-image');
            const vidEl = document.getElementById('sv-video');
            const delBtn = document.getElementById('sv-delete-btn');
            delBtn.style.display = item.canDelete ? 'flex' : 'none';

            document.getElementById('story-viewer-modal').style.display = 'flex';

            if (item.mediaType === 'video') {
                imgEl.style.display = 'none';
                imgEl.src = '';
                vidEl.style.display = 'block';
                vidEl.src = '';

                let resolvedUrl = item.mediaUrl || STORY_MEDIA_CACHE[item.id] || '';
                if (!resolvedUrl && item.id) {
                    document.getElementById('sv-feedback').innerText = '⏳ Đang tải video...';
                    try {
                        const res = await fetch('?story_media_id=' + encodeURIComponent(item.id));
                        const data = await res.json();
                        if (data && data.success && data.mediaUrl) {
                            resolvedUrl = data.mediaUrl;
                            STORY_MEDIA_CACHE[item.id] = resolvedUrl;
                            item.mediaUrl = resolvedUrl;
                        }
                    } catch (e) {}
                    document.getElementById('sv-feedback').innerText = '';
                }

                if (currentStoryIndex === idx && resolvedUrl) {
                    vidEl.src = resolvedUrl;
                    vidEl.play().catch(() => {});
                }
            } else {
                vidEl.pause();
                vidEl.style.display = 'none';
                vidEl.src = '';
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
            const pv = document.getElementById('vt-preview-video');
            if (pv) pv.pause();
            if (pendingVideoObjectUrl) {
                try { URL.revokeObjectURL(pendingVideoObjectUrl); } catch (e) {}
                pendingVideoObjectUrl = '';
            }
            document.getElementById('story-modal').style.display = 'none';
        }

        function resetStoryForm() {
            pendingVideoFile = null;
            if (pendingVideoObjectUrl) {
                try { URL.revokeObjectURL(pendingVideoObjectUrl); } catch (e) {}
                pendingVideoObjectUrl = '';
            }
            pendingVideoDuration = 0;
            videoNeedsTrim = false;
            isProcessingStoryMedia = false;
            document.getElementById('story-image-val').value = '';
            document.getElementById('story-thumb-val').value = '';
            document.getElementById('story-media-type-val').value = 'image';
            document.getElementById('story-duration-val').value = '0';
            document.getElementById('story-compress-status').innerText = '';
            document.getElementById('story-compress-status').style.color = '#aaa';
            document.getElementById('video-trim-panel').style.display = 'none';
            const fi = document.getElementById('story-file-input');
            if (fi) fi.value = '';
        }

        function handleStoryMediaSelect(fileInput) {
            const file = fileInput.files && fileInput.files[0];
            const statusEl = document.getElementById('story-compress-status');
            const trimPanel = document.getElementById('video-trim-panel');
            if (!file) return;

            if (pendingVideoObjectUrl) {
                try { URL.revokeObjectURL(pendingVideoObjectUrl); } catch (e) {}
                pendingVideoObjectUrl = '';
            }

            if (file.type && file.type.startsWith('video/')) {
                pendingVideoFile = file;
                document.getElementById('story-media-type-val').value = 'video';
                document.getElementById('story-image-val').value = '';
                document.getElementById('story-thumb-val').value = '';
                isProcessingStoryMedia = true;
                statusEl.innerText = '⚡ Đang đọc thông tin video...';
                statusEl.style.color = '#ffcc00';

                const objUrl = URL.createObjectURL(file);
                pendingVideoObjectUrl = objUrl;

                const probeVideo = document.createElement('video');
                probeVideo.preload = 'metadata';
                probeVideo.onloadedmetadata = async function() {
                    const dur = Number(probeVideo.duration || 0);
                    pendingVideoDuration = dur;
                    document.getElementById('vt-total-sec').innerText = dur.toFixed(1);

                    // Trích thumbnail nhanh song song
                    const thumbPromise = extractVideoThumbnailFromUrl(objUrl);

                    if (dur > MAX_STORY_VIDEO_SEC) {
                        const thumb = await thumbPromise;
                        if (thumb) document.getElementById('story-thumb-val').value = thumb;
                        videoNeedsTrim = true;
                        isProcessingStoryMedia = false;
                        trimPanel.style.display = 'block';
                        statusEl.innerText = '⚠️ Video dài ' + dur.toFixed(1) + 's (> 30s). Hãy cắt ngắn hơn!';
                        statusEl.style.color = '#ff9900';

                        const pv = document.getElementById('vt-preview-video');
                        pv.src = objUrl;

                        const maxStart = Math.max(0, dur - 1);
                        const startRange = document.getElementById('vt-start-range');
                        startRange.max = maxStart.toFixed(1);
                        startRange.value = '0';

                        const durRange = document.getElementById('vt-dur-range');
                        const initDur = Math.min(MAX_STORY_VIDEO_SEC, Math.max(1, dur));
                        durRange.max = Math.min(MAX_STORY_VIDEO_SEC, Math.max(1, dur)).toFixed(1);
                        durRange.value = initDur.toFixed(1);
                        updateTrimRange();
                    } else {
                        // Video <= 30s: không phát lại 30s để ghi; chuyển trực tiếp Blob/File thành DataURL tức thì
                        videoNeedsTrim = false;
                        trimPanel.style.display = 'none';
                        document.getElementById('story-duration-val').value = dur.toFixed(1);

                        try {
                            const [thumb, dataUrl] = await Promise.all([thumbPromise, blobToDataUrl(file)]);
                            if (thumb) document.getElementById('story-thumb-val').value = thumb;
                            document.getElementById('story-image-val').value = dataUrl || '';
                            isProcessingStoryMedia = false;
                            if (file.size > MAX_DIRECT_VIDEO_BYTES) {
                                statusEl.innerText = '✅ Video ' + dur.toFixed(1) + 's sẵn sàng (dung lượng lớn, có thể mất vài giây gửi)';
                            } else {
                                statusEl.innerText = '✅ Video ' + dur.toFixed(1) + 's sẵn sàng đăng ngay!';
                            }
                            statusEl.style.color = '#00ff00';
                        } catch (err) {
                            isProcessingStoryMedia = false;
                            statusEl.innerText = '❌ Không thể đọc file video.';
                            statusEl.style.color = '#ff5555';
                        }
                    }
                };
                probeVideo.onerror = function() {
                    isProcessingStoryMedia = false;
                    statusEl.innerText = '❌ File video không hỗ trợ hoặc bị lỗi.';
                    statusEl.style.color = '#ff5555';
                };
                probeVideo.src = objUrl;
            } else {
                pendingVideoFile = null;
                videoNeedsTrim = false;
                isProcessingStoryMedia = false;
                trimPanel.style.display = 'none';
                document.getElementById('story-media-type-val').value = 'image';
                document.getElementById('story-duration-val').value = '0';
                compressAndSetImage(fileInput, '#story-image-val');
            }
        }

        function updateTrimRange() {
            const startVal = parseFloat(document.getElementById('vt-start-range').value || '0');
            const maxAllowedDur = Math.min(MAX_STORY_VIDEO_SEC, Math.max(1, pendingVideoDuration - startVal));
            const durRange = document.getElementById('vt-dur-range');
            durRange.max = maxAllowedDur.toFixed(1);
            let durVal = parseFloat(durRange.value || String(maxAllowedDur));
            if (durVal > maxAllowedDur) {
                durVal = maxAllowedDur;
                durRange.value = durVal.toFixed(1);
            }

            document.getElementById('vt-start-label').innerText = startVal.toFixed(1) + 's';
            document.getElementById('vt-dur-label').innerText = durVal.toFixed(1) + 's';

            const pv = document.getElementById('vt-preview-video');
            if (pv && !isNaN(startVal)) {
                pv.currentTime = startVal;
            }
        }

        async function trimVideoToStory() {
            const statusEl = document.getElementById('story-compress-status');
            const cutBtn = document.getElementById('vt-cut-btn');
            if (!pendingVideoObjectUrl && !pendingVideoFile) return;

            const srcUrl = pendingVideoObjectUrl || URL.createObjectURL(pendingVideoFile);
            const startSec = parseFloat(document.getElementById('vt-start-range').value || '0');
            const cutSec = Math.min(MAX_STORY_VIDEO_SEC, parseFloat(document.getElementById('vt-dur-range').value || '30'));

            cutBtn.disabled = true;
            isProcessingStoryMedia = true;
            cutBtn.innerText = '⚡ Đang cắt video (' + cutSec.toFixed(1) + 's)...';
            statusEl.innerText = '⚡ Đang cắt đoạn video ' + cutSec.toFixed(1) + 's...';
            statusEl.style.color = '#ffcc00';

            try {
                const compact = await recordFastVideoTrim(srcUrl, startSec, cutSec);
                document.getElementById('story-image-val').value = compact.videoDataUrl || '';
                if (compact.thumbDataUrl) document.getElementById('story-thumb-val').value = compact.thumbDataUrl;
                document.getElementById('story-duration-val').value = cutSec.toFixed(1);
                videoNeedsTrim = false;
                isProcessingStoryMedia = false;
                cutBtn.disabled = false;
                cutBtn.innerText = '✂️ Cắt lại đoạn khác';
                statusEl.innerText = '✅ Đã cắt video còn ' + cutSec.toFixed(1) + 's! Bấm Đăng Story ngay.';
                statusEl.style.color = '#00ff00';
            } catch (err) {
                videoNeedsTrim = false;
                isProcessingStoryMedia = false;
                cutBtn.disabled = false;
                cutBtn.innerText = '✂️ Cắt video ngắn hơn (≤ 30s)';
                statusEl.innerText = '⚠️ ' + (err && err.message ? err.message : 'Không thể cắt video, hãy chọn video ≤ 30s.');
                statusEl.style.color = '#ff5555';
            }
        }

        function validateStorySubmit(e) {
            const val = document.getElementById('story-image-val').value.trim();
            const type = document.getElementById('story-media-type-val').value;
            const statusEl = document.getElementById('story-compress-status');

            if (isProcessingStoryMedia) {
                e.preventDefault();
                statusEl.innerText = '⚡ Đang hoàn tất xử lý media, vui lòng đợi 1–2 giây rồi bấm Đăng Story.';
                statusEl.style.color = '#ffcc00';
                return false;
            }

            if (type === 'video' && (videoNeedsTrim || pendingVideoDuration > MAX_STORY_VIDEO_SEC) && !val) {
                e.preventDefault();
                statusEl.innerText = '⚠️ Video dài hơn 30 giây! Vui lòng bấm "Cắt video ngắn hơn" trước khi đăng.';
                statusEl.style.color = '#ff5555';
                return false;
            }

            if (!val) {
                e.preventDefault();
                statusEl.innerText = '⚠️ Vui lòng chọn ảnh hoặc video trước khi đăng!';
                statusEl.style.color = '#ff5555';
                return false;
            }
            return true;
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

        function compressAndSetImage(fileInput, targetInputSelector) {
            const file = fileInput.files[0];
            const statusId = targetInputSelector.includes('post') ? 'post-compress-status' : 'story-compress-status';
            const statusEl = document.getElementById(statusId);

            if (!file) return;
            statusEl.innerText = "⚡ Đang nén: " + file.name;

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
                    document.querySelector(targetInputSelector).value = compressedBase64;
                    if (targetInputSelector === '#story-image-val') {
                        document.getElementById('story-thumb-val').value = compressedBase64;
                    }
                    statusEl.innerText = "✅ Đã nén thành công!";
                    statusEl.style.color = "#00ff00";
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
