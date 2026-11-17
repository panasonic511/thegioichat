export async function handleProfile(request, env, user, renderLayout, url) {
    let message = "";
    const targetId = url.searchParams.get('user') || user.id;
    
    let profileUser = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(targetId).first();
    if (!profileUser) {
        return new Response("Không tìm thấy thành viên!", { status: 404 });
    }

    if (request.method === 'POST' && targetId == user.id) {
        const formData = await request.formData();
        const action = formData.get('action');

        try {
            try { await env.DB.prepare("ALTER TABLE users ADD COLUMN cover_photo TEXT;").run(); } catch(e) {}
            try { await env.DB.prepare("ALTER TABLE users ADD COLUMN gender TEXT;").run(); } catch(e) {}

            if (action === 'update_cover') {
                const coverPhoto = formData.get('cover_photo');
                if (!coverPhoto || coverPhoto.trim() === '') {
                    throw new Error("Vui lòng chọn ảnh hoặc nhập đường dẫn hợp lệ!");
                }
                await env.DB.prepare("UPDATE users SET cover_photo = ? WHERE id = ?").bind(coverPhoto.trim(), user.id).run();
                message = `<div style="color: #00ff00; background: #001a00; border: 1px solid #005500; padding: 6px; text-align: center; margin-bottom: 8px;">✅ Cập nhật ảnh bìa thành công!</div>`;
            } else if (action === 'delete_cover') {
                await env.DB.prepare("UPDATE users SET cover_photo = NULL WHERE id = ?").bind(user.id).run();
                message = `<div style="color: #ffcc00; background: #1a1a00; border: 1px solid #555500; padding: 6px; text-align: center; margin-bottom: 8px;">⚠️ Đã xóa ảnh bìa thành công!</div>`;
            } else if (action === 'update_avatar') {
                const avatar = formData.get('avatar');
                if (!avatar || avatar.trim() === '') {
                    throw new Error("Vui lòng chọn ảnh hoặc nhập đường dẫn hợp lệ!");
                }
                await env.DB.prepare("UPDATE users SET avatar = ? WHERE id = ?").bind(avatar.trim(), user.id).run();
                message = `<div style="color: #00ff00; background: #001a00; border: 1px solid #005500; padding: 6px; text-align: center; margin-bottom: 8px;">✅ Cập nhật ảnh đại diện thành công!</div>`;
            }
            
            profileUser = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(targetId).first();
        } catch (e) {
            message = `<div style="color: #ff5555; background: #1a0000; border: 1px solid #550000; padding: 6px; text-align: center; margin-bottom: 8px;">❌ Lỗi: ${e.message}</div>`;
        }
    }

    const isOwner = (targetId == user.id);
    const defaultAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100' height='100' fill='%231a1a1a'/><circle cx='50' cy='38' r='18' fill='%2300ff00'/><path d='M20 88 C20 65, 80 65, 80 88' fill='%2300ff00'/></svg>";
    const currentAvatar = (profileUser.avatar && !profileUser.avatar.includes('7gXvS6v')) ? profileUser.avatar : defaultAvatar;
    const hasCover = (profileUser.cover_photo && !profileUser.cover_photo.includes('7gXvS6v'));
    const coverStyle = hasCover 
        ? `background: url('${profileUser.cover_photo}') center/cover no-repeat;` 
        : `background: linear-gradient(135deg, #0a1f0a 0%, #151515 50%, #051428 100%);`;

    const content = `
    <div class="box" style="margin-bottom: 8px; border: 1px solid #333;">
        <div class="box-title" style="display: flex; justify-content: space-between; align-items: center;">
            <span>📁 Hồ sơ của tôi</span>
            <span style="font-size: 10px; color: #aaa;">MENU ≡</span>
        </div>
        
        <div style="position: relative; background: #111; border-bottom: 1px solid #333; text-align: center;">
            <div style="height: 120px; ${coverStyle}"></div>
            
            ${isOwner ? `
            <div style="position: absolute; right: 6px; bottom: 6px; display: flex; gap: 4px;">
                <button type="button" onclick="openCoverModal()" class="btn" style="background: rgba(0,0,0,0.85); color: #fff; border: 1px solid #555; padding: 3px 7px; font-size: 10px; cursor: pointer;">📷 Đổi ảnh bìa</button>
                ${hasCover ? `
                <form method="POST" style="margin: 0;" onsubmit="return confirm('Bạn có chắc muốn xóa ảnh bìa không?');">
                    <input type="hidden" name="action" value="delete_cover">
                    <button type="submit" class="btn" style="background: rgba(120,0,0,0.9); color: #fff; border: 1px solid #800; padding: 3px 7px; font-size: 10px; cursor: pointer;">🗑️ Xóa</button>
                </form>` : ''}
            </div>
            ` : ''}

            <div style="position: relative; margin-top: -35px; margin-bottom: 4px; display: inline-block;">
                <img src="${currentAvatar}" width="66" height="66" style="border-radius: 50%; border: 3px solid #00ff00; background: #000; object-fit: cover; display: block;">
                
                ${isOwner ? `
                <button type="button" onclick="openAvatarModal()" title="Đổi ảnh đại diện" style="position: absolute; bottom: -2px; right: -2px; background: #111; color: #00ff00; border: 1px solid #00ff00; border-radius: 50%; width: 22px; height: 22px; font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; box-shadow: 0 0 4px #000;">📷</button>
                ` : ''}
            </div>
            
            <div style="font-size: 13px; font-weight: bold; color: #fff; margin-bottom: 2px;">
                <a href="/profile?user=${profileUser.id}" style="color: #00ff00;">${profileUser.display_name}</a> 
                <span style="color: #ffcc00; font-size: 11px;">[Lv.${profileUser.level}]</span>
            </div>
            <div style="font-size: 10px; color: #aaa; margin-bottom: 8px;">
                Nơi?: Hồ sơ của tôi · ID ${profileUser.id} · <span style="color: yellow;">${profileUser.role}</span>
            </div>
        </div>

        ${message}

        <div style="background: #141414; padding: 6px; text-align: center; border-bottom: 1px solid #333; font-size: 11px;">
            <a href="#" style="color: #ffcc00; margin: 0 8px;">Đang Follow 5</a> · 
            <a href="#" style="color: #ffcc00; margin: 0 8px;">Follower 2</a> · 
            <a href="#" style="color: #ffcc00; margin: 0 8px;">Bạn bè 2</a>
        </div>
    </div>

    <!-- Hộp Quà tặng -->
    <div class="box">
        <div class="box-title" style="display: flex; justify-content: space-between; align-items: center;">
            <span>🎁 Quà tặng</span>
            <span style="font-size: 10px; color: #ffcc00;">Tổng: X450</span>
        </div>
        <div class="box-content" style="display: flex; justify-content: space-around; text-align: center; font-size: 10px; color: #aaa;">
            <div><div style="font-size: 16px;">💌</div><div style="color: #ff55ff;">X100</div><div>Lời tỏ tình</div></div>
            <div><div style="font-size: 16px;">💋</div><div style="color: #ff55ff;">X100</div><div>Nụ hôn</div></div>
            <div><div style="font-size: 16px;">💍</div><div style="color: #ff55ff;">X100</div><div>Lộ tình yêu</div></div>
            <div><div style="font-size: 16px;">🌸</div><div style="color: #ff55ff;">X150</div><div>Thích bạn</div></div>
        </div>
    </div>

    <!-- Thông tin chi tiết -->
    <div class="box">
        <div class="box-title">🟢 Thông tin</div>
        <div class="box-content" style="font-size: 11px; line-height: 1.8;">
            <div>💖 Hẹn hò: <b>Đang độc thân</b></div>
            <div>🚻 Giới tính: <b>${profileUser.gender || 'Nam'}</b></div>
            <div>📊 Level: <b style="color: #ffcc00;">${profileUser.level}</b> · <a href="/profile/level" style="color: #00ff00;">Kiểm tra</a></div>
            <div>🪙 Xu: <b style="color: #00ff00;">${profileUser.coins ? profileUser.coins.toLocaleString() : '999,999'} Xu</b></div>
            <div>👑 Vàng: <b style="color: #ffcc00;">${profileUser.gold ? profileUser.gold.toLocaleString() : '4,970'} Vàng</b></div>
            <div>⏰ Online: <b>97,381 phút</b></div>
            <div>💬 Chattop: <b>35</b></div>
            <div>🌍 Tỉnh thành: <b>Hồ Chí Minh</b></div>
            <div>🎂 Sinh nhật: <b>01-01-2003</b></div>
            <div>📅 Ngày đăng ký: <b>18.11.2026 / 04:30</b></div>
        </div>
    </div>

    <!-- Popup Modal Đổi Avatar có hỗ trợ Kéo/Zoom/Cắt ảnh -->
    <div id="avatar-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.88); z-index: 999; justify-content: center; align-items: center; padding: 10px; box-sizing: border-box;">
        <div style="background: #111; border: 1px solid #444; width: 100%; max-width: 380px; padding: 12px; box-sizing: border-box; text-align: center;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 6px; margin-bottom: 8px;">
                <b style="color: #00ff00; font-size: 12px;">📷 Tùy chỉnh Ảnh đại diện</b>
                <button type="button" onclick="closeAvatarModal()" style="background:none; border:none; color:#ff5555; font-weight:bold; cursor:pointer;">✕</button>
            </div>
            
            <input type="file" id="avatar-file-picker" accept="image/*" onchange="initImageEditor(this, 'avatar-editor-container', 200, 200)" style="width: 100%; font-size: 11px; color: #ccc; margin-bottom: 8px; background: #000; border: 1px solid #444; padding: 4px; box-sizing: border-box;">
            
            <!-- Vung khung thao tác kéo/zoom -->
            <div id="avatar-editor-container" style="position: relative; width: 200px; height: 200px; margin: 0 auto 8px auto; background: #000; border: 2px dashed #00ff00; overflow: hidden; cursor: grab; touch-action: none; display: none;">
                <img id="avatar-edit-img" style="position: absolute; top: 0; left: 0; transform-origin: top left; user-select: none; pointer-events: none;">
            </div>
            <div style="font-size: 10px; color: #aaa; margin-bottom: 8px;">💡 Dùng chuột hoặc ngón tay để kéo thả di chuyển vị trí ảnh.</div>

            <!-- Thanh trượt phóng to thu nhỏ (Zoom) -->
            <div id="avatar-zoom-wrapper" style="display: none; margin-bottom: 8px; font-size: 11px; color: #ffcc00;">
                Zoom: <input type="range" id="avatar-zoom-range" min="0.5" max="3" step="0.05" value="1" oninput="adjustZoom('avatar')" style="width: 70%; vertical-align: middle;">
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

    <!-- Popup Modal Đổi Ảnh bìa có hỗ trợ Kéo/Zoom/Cắt ảnh -->
    <div id="cover-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.88); z-index: 999; justify-content: center; align-items: center; padding: 10px; box-sizing: border-box;">
        <div style="background: #111; border: 1px solid #444; width: 100%; max-width: 380px; padding: 12px; box-sizing: border-box; text-align: center;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 6px; margin-bottom: 8px;">
                <b style="color: #ffcc00; font-size: 12px;">🖼️ Tùy chỉnh Ảnh bìa</b>
                <button type="button" onclick="closeCoverModal()" style="background:none; border:none; color:#ff5555; font-weight:bold; cursor:pointer;">✕</button>
            </div>
            
            <input type="file" id="cover-file-picker" accept="image/*" onchange="initImageEditor(this, 'cover-editor-container', 320, 120)" style="width: 100%; font-size: 11px; color: #ccc; margin-bottom: 8px; background: #000; border: 1px solid #444; padding: 4px; box-sizing: border-box;">
            
            <!-- Vùng khung thao tác kéo/zoom ảnh bìa -->
            <div id="cover-editor-container" style="position: relative; width: 320px; height: 120px; margin: 0 auto 8px auto; background: #000; border: 2px dashed #ffcc00; overflow: hidden; cursor: grab; touch-action: none; display: none;">
                <img id="cover-edit-img" style="position: absolute; top: 0; left: 0; transform-origin: top left; user-select: none; pointer-events: none;">
            </div>
            <div style="font-size: 10px; color: #aaa; margin-bottom: 8px;">💡 Dùng chuột hoặc ngón tay để kéo thả di chuyển vị trí ảnh.</div>

            <!-- Thanh trượt phóng to thu nhỏ (Zoom) -->
            <div id="cover-zoom-wrapper" style="display: none; margin-bottom: 8px; font-size: 11px; color: #ffcc00;">
                Zoom: <input type="range" id="cover-zoom-range" min="0.5" max="3" step="0.05" value="1" oninput="adjustZoom('cover')" style="width: 70%; vertical-align: middle;">
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

    <!-- Hệ thống JavaScript xử lý Kéo, Zoom và Cắt ảnh (Crop) thuần mượt mà -->
    <script>
        let editorState = {
            prefix: '',
            img: null,
            container: null,
            imgEl: null,
            inputVal: null,
            btnSave: null,
            zoomRange: null,
            zoomWrapper: null,
            boxW: 0,
            boxH: 0,
            natW: 0,
            natH: 0,
            posX: 0,
            posY: 0,
            scale: 1,
            minScale: 1,
            isDragging: false,
            startX: 0,
            startY: 0
        };

        function openAvatarModal() {
            document.getElementById('avatar-modal').style.display = 'flex';
        }
        function closeAvatarModal() {
            document.getElementById('avatar-modal').style.display = 'none';
        }
        function openCoverModal() {
            document.getElementById('cover-modal').style.display = 'flex';
        }
        function closeCoverModal() {
            document.getElementById('cover-modal').style.display = 'none';
        }

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
            editorState.zoomRange = document.getElementById(prefix + '-zoom-range');
            editorState.zoomWrapper = document.getElementById(prefix + '-zoom-wrapper');

            const reader = new FileReader();
            reader.onload = function(e) {
                const img = new Image();
                img.onload = function() {
                    editorState.natW = img.width;
                    editorState.natH = img.height;
                    editorState.imgEl.src = img.src;

                    // Tính tỷ lệ scale vừa vặn khung
                    const scaleX = boxW / img.width;
                    const scaleY = boxH / img.height;
                    editorState.minScale = Math.max(scaleX, scaleY);
                    editorState.scale = editorState.minScale;

                    editorState.zoomRange.min = editorState.minScale;
                    editorState.zoomRange.max = editorState.minScale * 3;
                    editorState.zoomRange.value = editorState.scale;

                    // Căn giữa ảnh ban đầu
                    editorState.posX = (boxW - img.width * editorState.scale) / 2;
                    editorState.posY = (boxH - img.height * editorState.scale) / 2;

                    updateTransform();

                    editorState.container.style.display = 'block';
                    editorState.zoomWrapper.style.display = 'block';
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
            generateCroppedResult();
        }

        function adjustZoom(prefix) {
            if (editorState.prefix !== prefix) return;
            const newScale = parseFloat(editorState.zoomRange.value);
            
            // Giữ tâm khi zoom
            const centerX = editorState.boxW / 2;
            const centerY = editorState.boxH / 2;
            
            editorState.posX = centerX - (centerX - editorState.posX) * (newScale / editorState.scale);
            editorState.posY = centerY - (centerY - editorState.posY) * (newScale / editorState.scale);
            editorState.scale = newScale;

            updateTransform();
        }

        function setupDragEvents() {
            const el = editorState.container;
            
            // Xóa sự kiện cũ nếu có để tránh lặp
            el.onmousedown = null;
            el.onttouchstart = null;

            el.onmousedown = function(e) {
                editorState.isDragging = true;
                editorState.startX = e.clientX - editorState.posX;
                editorState.startY = e.clientY - editorState.posY;
                el.style.cursor = 'grabbing';
            };

            window.onmousemove = function(e) {
                if (!editorState.isDragging) return;
                editorState.posX = e.clientX - editorState.startX;
                editorState.posY = e.clientY - editorState.startY;
                updateTransform();
            };

            window.onmouseup = function() {
                editorState.isDragging = false;
                if (editorState.container) editorState.container.style.cursor = 'grab';
            };

            // Hỗ trợ cảm ứng điện thoại (Touch events)
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

            window.ontouchend = function() {
                editorState.isDragging = false;
            };
        }

        function generateCroppedResult() {
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

            // Xuất ra chuỗi Base64 JPEG chất lượng cao
            editorState.inputVal.value = canvas.toDataURL('image/jpeg', 0.85);
        }
    </script>

    <div style="text-align: center; margin-top: 10px;"><a href="/">⬅️ Về trang chủ</a></div>
    `;

    return new Response(renderLayout('Trang cá nhân', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
