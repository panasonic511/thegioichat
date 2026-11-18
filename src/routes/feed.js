import { renderUser } from '../worker.js';

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

        try { await env.DB.prepare("ALTER TABLE posts ADD COLUMN image_url TEXT").run(); } catch (e) {}

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
    } catch (e) {}

    // 2. Xử lý các yêu cầu POST siêu tốc (Hỗ trợ cả AJAX fetch request)
    if (request.method === 'POST') {
        try {
            const formData = await request.formData();
            const action = formData.get('action');

            if (action === 'create_post') {
                const content = formData.get('content');
                const imageUrl = formData.get('image_url');
                if ((content && content.trim() !== '') || (imageUrl && imageUrl.trim() !== '')) {
                    await env.DB.prepare(
                        "INSERT INTO posts (user_id, content, image_url, created_at) VALUES (?, ?, ?, datetime('now'))"
                    ).bind(user.id, content || '', imageUrl || '').run();
                }
            } else if (action === 'like_post') {
                const postId = formData.get('post_id');
                const existing = await env.DB.prepare("SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?").bind(postId, user.id).first();
                if (existing) {
                    await env.DB.prepare("DELETE FROM post_likes WHERE post_id = ? AND user_id = ?").bind(postId, user.id).run();
                } else {
                    await env.DB.prepare("INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)").bind(postId, user.id).run();
                }
            } else if (action === 'add_comment') {
                const postId = formData.get('post_id');
                const commentText = formData.get('comment');
                if (commentText && commentText.trim() !== '') {
                    await env.DB.prepare(
                        "INSERT INTO post_comments (post_id, user_id, comment, created_at) VALUES (?, ?, ?, datetime('now'))"
                    ).bind(postId, user.id, commentText.trim()).run();
                }
            } else if (action === 'create_story') {
                const imageUrl = formData.get('image_url');
                const caption = formData.get('caption');
                if (imageUrl && imageUrl.trim() !== '') {
                    await env.DB.prepare(
                        "INSERT INTO stories (user_id, image_url, caption, created_at) VALUES (?, ?, ?, datetime('now'))"
                    ).bind(user.id, imageUrl.trim(), caption || '').run();
                }
            }

            // Nếu là gọi ngầm AJAX thì trả về kết quả JSON siêu tốc không load trang
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

        stories.forEach(s => {
            const sName = s.display_name || s.username || 'Thành viên';
            const sAvatar = s.avatar || 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'50\' height=\'50\'><rect width=\'50\' height=\'50\' fill=\'%23333\'/></svg>';
            storiesHtml += `
                <div style="min-width: 68px; height: 110px; background: url('${s.image_url}') center/cover no-repeat; border-radius: 8px; position: relative; border: 1px solid #444; flex-shrink: 0; overflow: hidden; padding: 4px; display: flex; flex-direction: column; justify-content: space-between;">
                    <img src="${sAvatar}" style="width: 22px; height: 22px; border-radius: 50%; border: 1px solid #00ff00; object-fit: cover;">
                    <div style="font-size: 8px; color: #fff; background: rgba(0,0,0,0.6); padding: 2px; border-radius: 3px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${sName}</div>
                </div>
            `;
        });
        storiesHtml += `</div>`;
    } catch (e) {
        storiesHtml = '';
    }

    // 4. Lấy danh sách Bài viết, Thả tim & Bình luận
    let postsHtml = '';
    try {
        const res = await env.DB.prepare(`
            SELECT posts.*, users.username, users.display_name, users.avatar, users.border_color, users.avatar_glow, 
                   users.name_color, users.name_glow, users.name_border, users.name_border_glow, users.active_icon, users.role
            FROM posts 
            JOIN users ON posts.user_id = users.id 
            ORDER BY posts.id DESC LIMIT 20
        `).all();
        const posts = res.results || [];

        if (posts.length === 0) {
            postsHtml = '<div style="text-align: center; color: #777; padding: 20px;">Chưa có bài viết nào trên bảng tin.</div>';
        } else {
            for (let p of posts) {
                const rUser = renderUser(p);

                const likeCountRes = await env.DB.prepare("SELECT COUNT(*) as cnt FROM post_likes WHERE post_id = ?").bind(p.id).first();
                const likeCount = likeCountRes ? likeCountRes.cnt : 0;

                const userLiked = await env.DB.prepare("SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?").bind(p.id, user.id).first();
                const heartColor = userLiked ? '#ff3333' : '#888';

                const commRes = await env.DB.prepare(`
                    SELECT post_comments.*, users.username, users.display_name, users.name_color 
                    FROM post_comments 
                    LEFT JOIN users ON post_comments.user_id = users.id 
                    WHERE post_id = ? ORDER BY post_comments.id ASC
                `).bind(p.id).all();
                const comments = commRes.results || [];

                let commentsHtml = '';
                comments.forEach(c => {
                    const cName = c.display_name || c.username || 'Thành viên';
                    commentsHtml += `
                        <div style="font-size: 11px; margin-top: 4px; border-top: 1px solid #222; padding-top: 4px;">
                            <span style="color: #00ff00; font-weight: bold;">${cName}:</span> <span style="color: #ddd;">${c.comment}</span>
                        </div>
                    `;
                });

                const imageTag = p.image_url ? `<div style="margin-top: 8px;"><img src="${p.image_url}" style="width: 100%; max-height: 320px; object-fit: cover; border-radius: 4px;"></div>` : '';

                postsHtml += `
                <div style="background: #121212; border: 1px solid #2c2c2c; border-radius: 6px; padding: 12px; margin-bottom: 12px;">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                        <div style="width: 36px; height: 36px; min-width: 36px; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center;">
                            ${rUser.avatarHtml.replace(/style="[^"]*"/gi, 'style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover;"')}
                        </div>
                        <div>
                            <div>${rUser.nameHtml} <span style="font-size: 10px; color: #888; margin-left: 6px;">${p.created_at || ''}</span></div>
                            <div style="font-size: 11px; color: #ffcc00;">${p.role || 'Thành viên'} • 🌍 Công khai</div>
                        </div>
                    </div>
                    <div style="color: #ddd; font-size: 13px; word-break: break-word; white-space: pre-wrap; margin-bottom: 6px;">${p.content || ''}</div>
                    ${imageTag}

                    <!-- Thanh Tương tác Thả tim & Nút Mở khung Bình luận gọn gàng -->
                    <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid #222; margin-top: 10px; padding-top: 8px;">
                        <div style="display: flex; align-items: center; gap: 14px;">
                            <!-- Nút Thả tim AJAX -->
                            <form onsubmit="submitAjax(event, this)" style="margin: 0;">
                                <input type="hidden" name="action" value="like_post">
                                <input type="hidden" name="post_id" value="${p.id}">
                                <button type="submit" style="background: none; border: none; color: ${heartColor}; cursor: pointer; font-size: 14px; padding: 0;">
                                    ❤️ <span style="font-size: 11px; color: #ccc;" id="like-count-${p.id}">${likeCount}</span>
                                </button>
                            </form>
                            
                            <!-- Nút Icon Bình luận để bật/tắt khung soạn thảo -->
                            <button type="button" onclick="toggleCommentBox(${p.id})" style="background: none; border: none; color: #aaa; cursor: pointer; font-size: 13px; padding: 0; display: flex; align-items: center; gap: 4px;">
                                💬 <span style="font-size: 11px;" id="comm-count-${p.id}">${comments.length}</span> bình luận
                            </button>
                        </div>
                        <span style="font-size: 10px; color: #666;">Tương tác</span>
                    </div>

                    <!-- Khung hiển thị danh sách bình luận -->
                    <div style="margin-top: 6px;" id="comment-list-${p.id}">
                        ${commentsHtml}
                    </div>

                    <!-- Form gửi bình luận (Ẩn mặc định, chỉ hiện khi bấm icon 💬) -->
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

    // 5. Giao diện hoàn chỉnh kèm Script AJAX & Tự động nén ảnh siêu tốc
    const content = `
    <div class="box">
        <div class="box-title" style="display: flex; justify-content: space-between; align-items: center;">
            <span>📰 Bảng tin cộng đồng</span>
            <div style="font-size: 10px;">
                <a href="#" style="color: #00ff00; margin-right: 6px;">Đề xuất</a>
                <a href="#" style="color: #aaa; margin-right: 6px;">Mới nhất</a>
                <a href="#" style="color: #aaa;">Theo dõi</a>
            </div>
        </div>
        <div class="box-content">
            ${storiesHtml}
            <form onsubmit="submitPostAjax(event, this)">
                <input type="hidden" name="action" value="create_post">
                <textarea name="content" rows="2" placeholder="Bạn đang nghĩ gì thế..." style="width: 100%; background: #141414; color: #00ff00; border: 1px solid #444; padding: 8px; border-radius: 4px; box-sizing: border-box; font-size: 13px; resize: vertical;"></textarea>
                
                <!-- Input chọn ảnh từ máy thay thế cho việc nhập link thủ công -->
                <div style="margin-top: 6px;">
                    <input type="file" accept="image/*" onchange="compressAndSetImage(this, '#post-image-val')" style="width: 100%; font-size: 11px; color: #ccc; background: #0a0a0a; border: 1px solid #444; padding: 4px; box-sizing: border-box;">
                    <input type="hidden" id="post-image-val" name="image_url">
                    <div id="post-compress-status" style="font-size: 10px; color: #00ff00; margin-top: 2px;"></div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                    <span style="font-size: 10px; color: #888;">📷 Tự động nén tối ưu dung lượng</span>
                    <button type="submit" class="btn" style="background: #00aa00; color: #fff; padding: 6px 16px; border-radius: 4px; cursor: pointer;">Đăng bài</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Popup Modal Đăng Story -->
    <div id="story-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.88); z-index: 999; justify-content: center; align-items: center; padding: 10px; box-sizing: border-box;">
        <div style="background: #111; border: 1px solid #444; width: 100%; max-width: 350px; padding: 12px; box-sizing: border-box;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 6px; margin-bottom: 8px;">
                <b style="color: #00ff00; font-size: 12px;">📸 Đăng Story mới</b>
                <button type="button" onclick="closeStoryModal()" style="background:none; border:none; color:#ff5555; font-weight:bold; cursor:pointer;">✕</button>
            </div>
            <form method="POST">
                <input type="hidden" name="action" value="create_story">
                <label style="color: #ccc; font-size: 10px; display: block; margin-bottom: 2px;">Chọn hình ảnh Story:</label>
                <input type="file" accept="image/*" onchange="compressAndSetImage(this, '#story-image-val')" style="width: 100%; font-size: 11px; color: #ccc; background: #000; border: 1px solid #444; padding: 4px; box-sizing: border-box; margin-bottom: 6px;">
                <input type="hidden" id="story-image-val" name="image_url" required>
                <div id="story-compress-status" style="font-size: 10px; color: #00ff00; margin-bottom: 6px;"></div>

                <label style="color: #ccc; font-size: 10px; display: block; margin-bottom: 2px;">Chú thích (Caption):</label>
                <input type="text" name="caption" placeholder="Khoảnh khắc hôm nay..." style="width: 100%; background: #000; color: #fff; border: 1px solid #444; padding: 6px; box-sizing: border-box; margin-bottom: 8px; font-size: 11px;">
                <button type="submit" class="btn" style="width: 100%; background: #0055ff; color: #fff; padding: 6px; font-size: 11px; border: none; border-radius: 3px; cursor: pointer;">Đăng Story</button>
            </form>
        </div>
    </div>

    <script>
        function openStoryModal() { document.getElementById('story-modal').style.display = 'flex'; }
        function closeStoryModal() { document.getElementById('story-modal').style.display = 'none'; }

        // Hàm ẩn/hiện khung viết bình luận khi bấm vào icon 💬
        function toggleCommentBox(postId) {
            const box = document.getElementById('comment-box-' + postId);
            if (box.style.display === 'none' || box.style.display === '') {
                box.style.display = 'block';
                document.getElementById('comment-input-' + postId).focus();
            } else {
                box.style.display = 'none';
            }
        }

        // Hàm tự động nén ảnh độc lập (MaxWidth 600px, Quality 0.65)
        function compressAndSetImage(fileInput, targetInputSelector) {
            const file = fileInput.files[0];
            const statusId = targetInputSelector.includes('post') ? 'post-compress-status' : 'story-compress-status';
            const statusEl = document.getElementById(statusId);
            
            if (!file) return;
            statusEl.innerText = "⏳ Đang nén ảnh tối ưu...";

            const reader = new FileReader();
            reader.onload = function(e) {
                const img = new Image();
                img.onload = function() {
                    const MAX_WIDTH = 600;
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

                    const compressedBase64 = canvas.toDataURL('image/jpeg', 0.65);
                    document.querySelector(targetInputSelector).value = compressedBase64;
                    statusEl.innerText = "✅ Đã nén ảnh thành công!";
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }

        // Xử lý Thả tim mượt mà không load trang
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

        // Xử lý Gửi bình luận mượt mà
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
                    const list = document.getElementById('comment-list-' + postId);
                    list.innerHTML += \`<div style="font-size: 11px; margin-top: 4px; border-top: 1px solid #222; padding-top: 4px;"><span style="color: #00ff00; font-weight: bold;">Bạn:</span> <span style="color: #ddd;">\${text}</span></div>\`;
                    input.value = '';
                    
                    // Cập nhật lại số lượng bình luận hiển thị trên nút 💬
                    const commCountSpan = document.querySelector('#comm-count-' + postId);
                    if (commCountSpan) {
                        let currentCount = parseInt(commCountSpan.innerText) || 0;
                        commCountSpan.innerText = currentCount + 1;
                    }
                }
            } catch (e) {
                window.location.reload();
            }
        }

        // Xử lý Đăng bài viết siêu tốc
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
        </div>
    </div>
    `;

    return new Response(renderLayout('Bảng tin', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
