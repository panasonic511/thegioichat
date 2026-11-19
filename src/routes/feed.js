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

function escapeCssUrl(urlStr) {
    if (!urlStr) return '';
    return String(urlStr)
        .replace(/'/g, '%27')
        .replace(/"/g, '%22')
        .replace(/\(/g, '%28')
        .replace(/\)/g, '%29');
}

export async function handleFeed(request, env, user, renderLayout) {
    // 1. Tự động khởi tạo và kiểm tra cấu trúc bảng dữ liệu an toàn
    try {
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                content TEXT,
                image_url TEXT,
                created_at TEXT
            )
        `).run();

        try {
            await env.DB.prepare("ALTER TABLE posts ADD COLUMN image_url TEXT").run();
        } catch (e) {}

        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS post_likes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                post_id INTEGER,
                user_id INTEGER,
                reaction TEXT DEFAULT '❤️'
            )
        `).run();

        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS post_comments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                post_id INTEGER,
                user_id INTEGER,
                comment TEXT,
                created_at TEXT
            )
        `).run();

        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS stories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                media_url TEXT,
                media_type TEXT DEFAULT 'image',
                caption TEXT,
                created_at TEXT
            )
        `).run();

        // Bảng lưu thông tin Theo dõi (Follows) để phục vụ tab Theo dõi
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS follows (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                follower_id INTEGER,
                following_id INTEGER
            )
        `).run();
    } catch (e) {}

    // Lấy thông tin tab và số trang từ URL
    const urlObj = new URL(request.url);
    const tab = urlObj.searchParams.get('tab') || 'new'; // Mặc định là 'new' (Mới nhất)
    const page = Math.max(1, parseInt(urlObj.searchParams.get('page'), 10) || 1);
    const limit = 10; // Giới hạn 10 bài viết mỗi trang
    const offset = (page - 1) * limit;
    const isAjax = request.headers.get('X-Requested-With') === 'XMLHttpRequest';

    // 2. Xử lý các yêu cầu POST
    if (request.method === 'POST') {
        try {
            const formData = await request.formData();
            const action = formData.get('action');

            if (action === 'create_post') {
                const postContent = String(formData.get('content') || '').trim();
                const imageUrl = String(formData.get('image_url') || '').trim();
                if (postContent !== '' || imageUrl !== '') {
                    await env.DB.prepare(
                        "INSERT INTO posts (user_id, content, image_url, created_at) VALUES (?, ?, ?, datetime('now'))"
                    ).bind(user.id, postContent, imageUrl).run();
                }
            } else if (action === 'like_post') {
                const postId = parseInt(formData.get('post_id'), 10);
                if (postId) {
                    const existing = await env.DB.prepare(
                        "SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?"
                    ).bind(postId, user.id).first();

                    if (existing) {
                        await env.DB.prepare(
                            "DELETE FROM post_likes WHERE post_id = ? AND user_id = ?"
                        ).bind(postId, user.id).run();
                    } else {
                        await env.DB.prepare(
                            "INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)"
                        ).bind(postId, user.id).run();
                    }
                }
            } else if (action === 'add_comment') {
                const postId = parseInt(formData.get('post_id'), 10);
                const commentText = String(formData.get('comment') || '').trim();
                if (postId && commentText !== '') {
                    await env.DB.prepare(
                        "INSERT INTO post_comments (post_id, user_id, comment, created_at) VALUES (?, ?, ?, datetime('now'))"
                    ).bind(postId, user.id, commentText).run();
                }
            } else if (action === 'create_story') {
                const mediaUrl = String(formData.get('image_url') || formData.get('media_url') || '').trim();
                const caption = String(formData.get('caption') || '').trim();
                if (mediaUrl !== '') {
                    await env.DB.prepare(
                        "INSERT INTO stories (user_id, media_url, media_type, caption, created_at) VALUES (?, ?, 'image', ?, datetime('now'))"
                    ).bind(user.id, mediaUrl, caption).run();
                }
            } else if (action === 'delete_post') {
                const postId = parseInt(formData.get('post_id'), 10);
                if (postId) {
                    const targetPost = await env.DB.prepare(
                        "SELECT user_id FROM posts WHERE id = ?"
                    ).bind(postId).first();
                    const isManager = Boolean(user.role && user.role !== 'Thành Viên' && user.role !== 'Thành viên');

                    if (targetPost && (isManager || Number(targetPost.user_id) === Number(user.id))) {
                        await env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(postId).run();
                        await env.DB.prepare("DELETE FROM post_likes WHERE post_id = ?").bind(postId).run();
                        await env.DB.prepare("DELETE FROM post_comments WHERE post_id = ?").bind(postId).run();
                    }
                }
            }

            if (isAjax) {
                return new Response(JSON.stringify({ success: true }), {
                    headers: { 'Content-Type': 'application/json;charset=UTF-8' }
                });
            }
        } catch (e) {
            if (isAjax) {
                return new Response(JSON.stringify({ success: false, error: e.message }), {
                    headers: { 'Content-Type': 'application/json;charset=UTF-8' }
                });
            }
        }

        // Mô hình Post -> Redirect (302) -> Get để tránh trình duyệt hỏi gửi lại mẫu khi F5
        const redirectTarget = new URL(urlObj.pathname + urlObj.search, request.url);
        return Response.redirect(redirectTarget, 302);
    }

    // 3. Lấy danh sách Stories
    let storiesHtml = '';
    try {
        const storyRes = await env.DB.prepare(`
            SELECT stories.*, users.username, users.display_name, users.avatar
            FROM stories
            LEFT JOIN users ON stories.user_id = users.id
            ORDER BY stories.id DESC LIMIT 10
        `).all();
        const stories = storyRes.results || [];

        storiesHtml = `
            <div style="display: flex; gap: 8px; overflow-x: auto; padding: 6px 0; margin-bottom: 10px; scrollbar-width: none;">
                <div onclick="openStoryModal()" style="min-width: 68px; height: 110px; background: #1a1a1a; border: 1px dashed #00ff00; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;">
                    <div style="width: 28px; height: 28px; background: #00ff00; color: #000; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 16px; margin-bottom: 4px;">+</div>
                    <div style="font-size: 9px; color: #aaa; text-align: center;">Thêm Story</div>
                </div>
        `;

        const defaultAvatarSvg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='50' height='50'><rect width='50' height='50' fill='%23333'/></svg>";

        stories.forEach(s => {
            const sName = escapeHtml(s.display_name || s.username || 'Thành viên');
            const rawMedia = s.media_url || '';
            const safeBgUrl = escapeCssUrl(rawMedia);
            const sAvatar = escapeHtml(s.avatar || defaultAvatarSvg);
            const captionTitle = s.caption ? ` title="${escapeHtml(s.caption)}"` : '';

            storiesHtml += `
                <div${captionTitle} style="min-width: 68px; height: 110px; background: url('${safeBgUrl}') center/cover no-repeat; border-radius: 8px; position: relative; border: 1px solid #444; flex-shrink: 0; overflow: hidden; padding: 4px; display: flex; flex-direction: column; justify-content: space-between;">
                    <img src="${sAvatar}" style="width: 22px; height: 22px; border-radius: 50%; border: 1px solid #00ff00; object-fit: cover;">
                    <div style="font-size: 8px; color: #fff; background: rgba(0,0,0,0.6); padding: 2px; border-radius: 3px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${sName}</div>
                </div>
            `;
        });
        storiesHtml += `</div>`;
    } catch (e) {
        storiesHtml = '';
    }

    // 4. Xây dựng câu truy vấn theo từng tab (Mới nhất, Đề xuất, Theo dõi)
    let postsQuery = '';
    let countQuery = '';

    if (tab === 'trending') {
        countQuery = "SELECT COUNT(*) as total FROM posts";
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
        countQuery = `
            SELECT COUNT(*) as total FROM posts
            WHERE user_id IN (SELECT following_id FROM follows WHERE follower_id = ?)
        `;
        postsQuery = `
            SELECT posts.*, users.username, users.display_name, users.avatar, users.border_color, users.avatar_glow,
                   users.name_color, users.name_glow, users.name_border, users.name_border_glow, users.active_icon, users.role
            FROM posts
            JOIN users ON posts.user_id = users.id
            WHERE posts.user_id IN (SELECT following_id FROM follows WHERE follower_id = ?)
            ORDER BY posts.id DESC LIMIT ? OFFSET ?
        `;
    } else {
        countQuery = "SELECT COUNT(*) as total FROM posts";
        postsQuery = `
            SELECT posts.*, users.username, users.display_name, users.avatar, users.border_color, users.avatar_glow,
                   users.name_color, users.name_glow, users.name_border, users.name_border_glow, users.active_icon, users.role
            FROM posts
            JOIN users ON posts.user_id = users.id
            ORDER BY posts.id DESC LIMIT ? OFFSET ?
        `;
    }

    let totalPosts = 0;
    try {
        const countRes = tab === 'following'
            ? await env.DB.prepare(countQuery).bind(user.id).first()
            : await env.DB.prepare(countQuery).first();
        totalPosts = countRes ? Number(countRes.total || 0) : 0;
    } catch (e) {}
    const totalPages = Math.ceil(totalPosts / limit) || 1;

    let postsHtml = '';
    try {
        const stmt = env.DB.prepare(postsQuery);
        const res = tab === 'following'
            ? await stmt.bind(user.id, limit, offset).all()
            : await stmt.bind(limit, offset).all();

        const posts = res.results || [];

        if (posts.length === 0) {
            postsHtml = '<div style="text-align: center; color: #777; padding: 20px;">Chưa có bài viết nào trong mục này.</div>';
        } else {
            const isUserAdmin = Boolean(user.role && user.role !== 'Thành Viên' && user.role !== 'Thành viên');

            for (const p of posts) {
                const rUser = renderUser(p);

                const likeCountRes = await env.DB.prepare(
                    "SELECT COUNT(*) as cnt FROM post_likes WHERE post_id = ?"
                ).bind(p.id).first();
                const likeCount = likeCountRes ? Number(likeCountRes.cnt || 0) : 0;

                const userLiked = await env.DB.prepare(
                    "SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?"
                ).bind(p.id, user.id).first();
                const heartColor = userLiked ? '#ff3333' : '#888';

                const commRes = await env.DB.prepare(`
                    SELECT post_comments.*, users.username, users.display_name, users.avatar, users.border_color, users.avatar_glow,
                           users.name_color, users.name_glow, users.name_border, users.name_border_glow, users.active_icon, users.role
                    FROM post_comments
                    LEFT JOIN users ON post_comments.user_id = users.id
                    WHERE post_id = ? ORDER BY post_comments.id ASC
                `).bind(p.id).all();
                const comments = commRes.results || [];

                let commentsHtml = '';
                comments.forEach(c => {
                    const rCommentUser = renderUser(c);
                    commentsHtml += `
                        <div style="font-size: 11px; margin-top: 4px; border-top: 1px solid #222; padding-top: 4px;">
                            ${rCommentUser.nameHtml}: <span style="color: #ddd;">${escapeHtml(c.comment)}</span>
                        </div>
                    `;
                });

                const imageTag = p.image_url
                    ? `<div style="margin-top: 8px; background: #000; text-align: center; border-radius: 4px; overflow: hidden;"><img src="${escapeHtml(p.image_url)}" style="width: 100%; max-height: 450px; object-fit: contain; display: block; margin: 0 auto;"></div>`
                    : '';

                const roleName = p.role || 'Thành viên';
                const roleDisplayHtml = (roleName !== 'Thành Viên' && roleName !== 'Thành viên') ? `
                    <span style="display: inline-block; background: #1a1a1a; border: 1px solid #444; color: #ffcc00; font-size: 10px; font-weight: bold; padding: 1px 6px; border-radius: 4px; text-shadow: 0 0 4px rgba(255,204,0,0.4);">
                        ${escapeHtml(roleName)}
                    </span>
                ` : `
                    <span style="color: #888; font-size: 11px;">${escapeHtml(roleName)}</span>
                `;

                const canDelete = isUserAdmin || Number(p.user_id) === Number(user.id);
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
                                <div>${rUser.nameHtml} <span style="font-size: 10px; color: #888; margin-left: 6px;">${escapeHtml(p.created_at || '')}</span></div>
                                <div style="font-size: 11px; margin-top: 2px; display: flex; align-items: center; gap: 4px;">
                                    ${roleDisplayHtml} <span style="color: #666;">•</span> <span style="color: #aaa;">🌍 Công khai</span>
                                </div>
                            </div>
                        </div>
                        ${deleteBtnHtml}
                    </div>
                    <div style="color: #ddd; font-size: 13px; word-break: break-word; white-space: pre-wrap; margin-bottom: 6px;">${escapeHtml(p.content || '')}</div>
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

    // 5. Giao diện Phân trang (Giữ lại tab đang chọn)
    let paginationHtml = '';
    if (totalPages > 1) {
        paginationHtml = `<div style="display: flex; justify-content: center; align-items: center; gap: 6px; margin: 15px 0; font-size: 12px;">`;
        if (page > 1) {
            paginationHtml += `<a href="?tab=${encodeURIComponent(tab)}&page=${page - 1}" style="background: #1a1a1a; color: #00ff00; border: 1px solid #444; padding: 4px 10px; border-radius: 4px; text-decoration: none;">« Trước</a>`;
        }
        for (let i = 1; i <= totalPages; i++) {
            if (i === page) {
                paginationHtml += `<span style="background: #00ff00; color: #000; font-weight: bold; padding: 4px 10px; border-radius: 4px;">${i}</span>`;
            } else {
                paginationHtml += `<a href="?tab=${encodeURIComponent(tab)}&page=${i}" style="background: #1a1a1a; color: #ccc; border: 1px solid #444; padding: 4px 10px; border-radius: 4px; text-decoration: none;">${i}</a>`;
            }
        }
        if (page < totalPages) {
            paginationHtml += `<a href="?tab=${encodeURIComponent(tab)}&page=${page + 1}" style="background: #1a1a1a; color: #00ff00; border: 1px solid #444; padding: 4px 10px; border-radius: 4px; text-decoration: none;">Sau »</a>`;
        }
        paginationHtml += `</div>`;
    }

    const newColor = (tab === 'new') ? '#00ff00' : '#aaa';
    const trendingColor = (tab === 'trending') ? '#00ff00' : '#aaa';
    const followingColor = (tab === 'following') ? '#00ff00' : '#aaa';

    // 6. Giao diện hoàn chỉnh
    const content = `
    <div class="box">
        <div class="box-title" style="display: flex; justify-content: space-between; align-items: center;">
            <span>📰 Bảng tin cộng đồng</span>
            <div style="font-size: 10px;">
                <a href="?tab=new" style="color: ${newColor}; margin-right: 6px; text-decoration: none; font-weight: ${tab === 'new' ? 'bold' : 'normal'};">Mới nhất</a>
                <a href="?tab=trending" style="color: ${trendingColor}; margin-right: 6px; text-decoration: none; font-weight: ${tab === 'trending' ? 'bold' : 'normal'};">Đề xuất</a>
                <a href="?tab=following" style="color: ${followingColor}; text-decoration: none; font-weight: ${tab === 'following' ? 'bold' : 'normal'};">Theo dõi</a>
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

    <!-- Popup Modal Đăng Story -->
    <div id="story-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.88); z-index: 999; justify-content: center; align-items: center; padding: 10px; box-sizing: border-box;">
        <div style="background: #111; border: 1px solid #444; width: 100%; max-width: 350px; padding: 12px; box-sizing: border-box; border-radius: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 6px; margin-bottom: 8px;">
                <b style="color: #00ff00; font-size: 12px;">📸 Đăng Story mới</b>
                <button type="button" onclick="closeStoryModal()" style="background:none; border:none; color:#ff5555; font-weight:bold; cursor:pointer;">✕</button>
            </div>
            <form id="story-form" onsubmit="submitStoryAjax(event, this)">
                <input type="hidden" name="action" value="create_story">

                <label style="color: #ccc; font-size: 10px; display: block; margin-bottom: 2px;">Chọn hình ảnh Story:</label>
                <div style="margin-bottom: 6px; display: flex; align-items: center; gap: 8px;">
                    <label style="display: inline-flex; align-items: center; gap: 6px; background: #1a1a1a; border: 1px solid #444; color: #00ff00; padding: 5px 12px; border-radius: 4px; font-size: 11px; font-weight: bold; cursor: pointer;">
                        📷 Chọn ảnh Story
                        <input id="story-file-input" type="file" accept="image/*" onchange="compressAndSetImage(this, '#story-image-val')" style="display: none;">
                    </label>
                    <input type="hidden" id="story-image-val" name="image_url">
                    <div id="story-compress-status" style="font-size: 10px; color: #aaa;"></div>
                </div>

                <label style="color: #ccc; font-size: 10px; display: block; margin-bottom: 2px;">Chú thích (Caption):</label>
                <input id="story-caption-input" type="text" name="caption" placeholder="Khoảnh khắc hôm nay..." style="width: 100%; background: #000; color: #fff; border: 1px solid #444; padding: 6px; box-sizing: border-box; margin-bottom: 8px; font-size: 11px; border-radius: 3px;">
                <button id="story-submit-btn" type="submit" class="btn" style="width: 100%; background: #0055ff; color: #fff; padding: 6px; font-size: 11px; border: none; border-radius: 3px; cursor: pointer;">Đăng Story</button>
            </form>
        </div>
    </div>

    <script>
        let isSubmittingStory = false;
        let isSubmittingPost = false;

        function openStoryModal() {
            document.getElementById('story-modal').style.display = 'flex';
        }

        function closeStoryModal() {
            document.getElementById('story-modal').style.display = 'none';
        }

        function reloadCleanPage() {
            const cleanUrl = window.location.pathname + window.location.search;
            try {
                window.location.replace(cleanUrl);
            } catch (e) {
                window.location.reload();
            }
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
            statusEl.innerText = "⏳ Đang nén: " + file.name;
            statusEl.style.color = "#ffcc00";

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
                    statusEl.innerText = "✅ Đã nén thành công!";
                    statusEl.style.color = "#00ff00";
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }

        async function submitStoryAjax(event, form) {
            event.preventDefault();
            if (isSubmittingStory) return;

            const imgInput = document.getElementById('story-image-val');
            const statusEl = document.getElementById('story-compress-status');
            const submitBtn = document.getElementById('story-submit-btn');

            if (!imgInput || !imgInput.value.trim()) {
                if (statusEl) {
                    statusEl.innerText = "⚠️ Vui lòng chọn ảnh Story trước khi đăng!";
                    statusEl.style.color = "#ff5555";
                }
                return;
            }

            isSubmittingStory = true;
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerText = "Đang đăng...";
            }

            const formData = new FormData(form);

            try {
                const res = await fetch(window.location.href, {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: formData
                });

                if (res.ok) {
                    const data = await res.json().catch(() => ({ success: true }));
                    if (data.success !== false) {
                        form.reset();
                        imgInput.value = '';
                        if (statusEl) statusEl.innerText = '';
                        closeStoryModal();
                        reloadCleanPage();
                        return;
                    }
                }
                isSubmittingStory = false;
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerText = "Đăng Story";
                }
            } catch (e) {
                isSubmittingStory = false;
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerText = "Đăng Story";
                }
                reloadCleanPage();
            }
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
                    let count = parseInt(spanCount.innerText, 10) || 0;
                    if (btn.style.color === 'rgb(255, 51, 51)') {
                        btn.style.color = '#888';
                        spanCount.innerText = Math.max(0, count - 1);
                    } else {
                        btn.style.color = '#ff3333';
                        spanCount.innerText = count + 1;
                    }
                }
            } catch (e) {
                reloadCleanPage();
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
                    reloadCleanPage();
                }
            } catch (e) {
                reloadCleanPage();
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
                        reloadCleanPage();
                    }
                }
            } catch (e) {
                reloadCleanPage();
            }
        }

        async function submitPostAjax(event, form) {
            event.preventDefault();
            if (isSubmittingPost) return;

            const textarea = form.querySelector('textarea[name="content"]');
            const imgInput = form.querySelector('input[name="image_url"]');
            const hasText = textarea && textarea.value.trim() !== '';
            const hasImg = imgInput && imgInput.value.trim() !== '';
            if (!hasText && !hasImg) return;

            isSubmittingPost = true;
            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerText = "Đang đăng...";
            }

            const formData = new FormData(form);
            try {
                const res = await fetch(window.location.href, {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: formData
                });
                if (res.ok) {
                    reloadCleanPage();
                    return;
                }
                isSubmittingPost = false;
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerText = "Đăng bài";
                }
            } catch (e) {
                isSubmittingPost = false;
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerText = "Đăng bài";
                }
                reloadCleanPage();
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
