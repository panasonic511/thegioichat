import { Router } from 'itty-router';

const router = Router();

// Middleware kiểm tra đăng nhập giả lập qua Cookie / Session đơn giản
async function checkAuth(request, env) {
    const cookie = request.headers.get('Cookie') || '';
    const match = cookie.match(/user_id=(\d+)/);
    if (!match) return null;
    const userId = match[1];
    const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first();
    return user || null;
}

// Helper trả về HTML chuẩn giao diện Thế Giới Chat (Màu đen, phong cách Wap)
function renderLayout(title, content, user) {
    return `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - Thế Giới Chat</title>
    <style>
        body { background-color: #000; color: #00ff00; font-family: monospace, sans-serif; margin: 0; padding: 0; }
        .header { background: linear-gradient(to bottom, #222, #000); text-align: center; padding: 10px; border-bottom: 2px solid #333; }
        .header h1 { color: #fff; margin: 0; font-size: 22px; text-shadow: 0 0 10px #00ff00; }
        .slogan { color: #00ff00; font-size: 11px; }
        .nav-bar { background: #111; display: flex; justify-content: space-around; padding: 8px 0; border-bottom: 1px solid #333; }
        .nav-bar a { color: #fff; text-decoration: none; font-size: 12px; text-align: center; }
        .nav-bar a:hover { color: #00ff00; }
        .user-info { background: #0a0a0a; padding: 8px; border-bottom: 1px solid #222; display: flex; align-items: center; justify-content: space-between; font-size: 13px; }
        .container { padding: 10px; max-width: 600px; margin: 0 auto; }
        .box { background: #111; border: 1px solid #333; margin-bottom: 10px; border-radius: 4px; overflow: hidden; }
        .box-title { background: #1a1a1a; color: #00ff00; padding: 6px 10px; font-weight: bold; border-bottom: 1px solid #333; font-size: 13px; }
        .box-content { padding: 10px; font-size: 13px; }
        input, select, textarea { background: #000; color: #00ff00; border: 1px solid #444; padding: 6px; width: 100%; box-sizing: border-box; margin-bottom: 8px; }
        button, .btn { background: #0055ff; color: #fff; border: none; padding: 8px 15px; cursor: pointer; font-weight: bold; border-radius: 3px; text-decoration: none; display: inline-block; text-align: center; }
        button:hover, .btn:hover { background: #0033cc; }
        a { color: #00ff00; text-decoration: none; }
        a:hover { text-decoration: underline; }
        .footer { text-align: center; padding: 15px; font-size: 11px; color: #666; border-top: 1px solid #222; background: #050505; }
        .menu-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; padding: 8px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>THẾ GIỚI CHAT</h1>
        <div class="slogan">Wap chát - Kết bạn - Giải trí</div>
    </div>
    
    ${user ? `
    <div class="user-info">
        <div><img src="${user.avatar}" width="24" height="24" style="vertical-align:middle; border-radius:50%;"> <b>${user.display_name}</b> [Lv.${user.level}]</div>
        <div>🪙 ${user.coins.toLocaleString()} Xu | 🛡️ <span style="color:yellow">${user.role}</span></div>
    </div>
    <div class="nav-bar">
        <a href="/">🏠 Home</a>
        <a href="/users/online">👥 Trực tuyến</a>
        <a href="/users/feed">📋 Bảng tin</a>
        <a href="/mail/notification">🔔 Thông báo</a>
        <a href="/mail/box">✉️ Tin nhắn</a>
        <a href="#" onclick="toggleMenu()">≡ Menu</a>
    </div>
    ` : `
    <div class="nav-bar">
        <a href="/">Trang chủ</a> | <a href="/login">Đăng nhập</a> | <a href="/register">Đăng ký</a>
    </div>
    `}

    <div class="container">
        ${content}
    </div>

    <div class="footer">
        <div><a href="/">Home</a> · <a href="/terms">Điều khoản</a> · <a href="/contact">Liên hệ</a> ${user ? '· <a href="/logout">Đăng xuất</a>' : ''}</div>
        <div style="color: #00ff00; margin-top: 5px;">Copyright © 2026 - Thế Giới Chat</div>
        <div>Giao diện: <select style="width: auto; padding: 2px;"><option>Dark</option></select></div>
        <div style="color: #888; margin-top: 5px;">Version: 3.0.0</div>
    </div>

    <script>
        // Realtime Polling cho Tin nhắn và Thông báo không cần load lại trang
        if (${user ? 'true' : 'false'}) {
            setInterval(async () => {
                try {
                    let res = await fetch('/api/realtime-check');
                    let data = await res.json();
                    if (data.unread_messages > 0) {
                        // Cập nhật huy hiệu tin nhắn realtime nếu cần
                    }
                } catch(e) {}
            }, 5000);
        }
        function toggleMenu() {
            alert("Mở Menu: Bạn có thể chọn Trang cá nhân, Tìm kiếm nick, Bạn bè, Cửa hàng, Diễn đàn, Khu giải trí, Cài đặt.");
        }
    </script>
</body>
</html>`;
}

// 1. TRANG CHỦ (HOME)
router.get('/', async (request, env) => {
    const user = await checkAuth(request, env);
    
    // Lấy thông báo mới nhất từ DB
    const announcements = await env.DB.prepare("SELECT announcements.*, users.display_name, users.role, users.level FROM announcements JOIN users ON announcements.user_id = users.id ORDER BY id DESC LIMIT 5").all();
    
    const content = `
    <div class="box">
        <div class="box-title">🏠 Phòng chát</div>
        <div class="box-content menu-grid">
            <a href="/game" class="btn" style="background:#222; border:1px solid #444;">🎉 Bữa tiệc (2)</a>
            <a href="/game" class="btn" style="background:#222; border:1px solid #444;">🎮 Trò chơi (6)</a>
            <a href="/game" class="btn" style="background:#222; border:1px solid #444;">💬 Giao lưu (0)</a>
            <a href="/game" class="btn" style="background:#222; border:1px solid #444;">🔥 Chát room (0)</a>
        </div>
    </div>

    <div class="box">
        <div class="box-title">🧭 Menu Tiện Ích</div>
        <div class="box-content" style="display:flex; justify-content:space-between; align-items:center;">
            <div id="live-clock" style="font-size:14px; font-weight:bold; color:#00ff00;">03:17 - Thứ Tư</div>
            <div>
                <a href="/profile">Trang cá nhân</a> | 
                <a href="/users/search">Tìm kiếm ID</a> | 
                <a href="/profile/level">Bảng xếp hạng</a>
            </div>
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; border-top:1px solid #333;">
            <div style="padding:8px; border-right:1px solid #333;">
                <a href="/forum">📌 Diễn đàn</a><br>
                <a href="/profile/level">📊 Bảng cấp độ</a><br>
                <a href="/stats">📈 Thống kê</a>
            </div>
            <div style="padding:8px;">
                <a href="/friends">👥 Bạn bè</a><br>
                <a href="/settings">⚙️ Cài đặt</a><br>
                <a href="/game">🎮 Khu giải trí [24]</a>
            </div>
        </div>
    </div>

    <div class="box">
        <div class="box-title" style="display:flex; justify-content:space-between; align-items:center;">
            <span>📢 Thông báo hệ thống</span>
            ${user && user.level >= 50 ? `<a href="/announcement/new" style="font-size:11px; background:#00aa00; color:#000; padding:2px 6px; border-radius:3px; font-weight:bold;">Đăng thông báo</a>` : ''}
        </div>
        <div class="box-content">
            ${announcements.results.map(item => `
                <div style="border-bottom:1px dashed #333; margin-bottom:8px; padding-bottom:8px;">
                    <div style="color:#ffcc00; font-size:11px;">[Lv.${item.level}] <span style="color:#ff5555">${item.role}</span> <b>${item.display_name}</b> · ${item.created_at}</div>
                    <div style="margin-top:4px;">${item.content}</div>
                </div>
            `).join('')}
        </div>
    </div>`;

    return new Response(renderLayout('Trang chủ', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
});

// 2. TRANG ĐĂNG NHẬP (`/login`)
router.get('/login', async (request, env) => {
    const content = `
    <div class="box">
        <div class="box-title">🔒 Đăng nhập hệ thống</div>
        <div class="box-content">
            <form method="POST" action="/login">
                <label>Tên tài khoản / ID / Gmail:</label>
                <input type="text" name="username" required placeholder="Nhập tài khoản...">
                <label>Mật khẩu:</label>
                <input type="password" name="password" required placeholder="Nhập mật khẩu...">
                <div style="margin: 10px 0; font-size:12px;">
                    <input type="checkbox" style="width:auto;"> Ghi nhớ đăng nhập | <a href="/forgot">Quên mật khẩu?</a>
                </div>
                <button type="submit" style="width:100%;">Đăng Nhập</button>
            </form>
            <div style="text-align:center; margin-top:15px; font-size:12px;">
                Chưa có tài khoản? <a href="/register">Đăng kí ngay</a>
            </div>
        </div>
    </div>`;
    return new Response(renderLayout('Đăng nhập', content, null), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
});

router.post('/login', async (request, env) => {
    const formData = await request.formData();
    const username = formData.get('username');
    const password = formData.get('password');

    const user = await env.DB.prepare("SELECT * FROM users WHERE (username = ? OR email = ?) AND password = ?").bind(username, username, password).first();
    
    if (!user) {
        return new Response("Sai tài khoản hoặc mật khẩu! <a href='/login'>Quay lại</a>", { status: 400, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
    }

    // Set Cookie đăng nhập
    return new Response("Đăng nhập thành công! Đang chuyển hướng...", {
        status: 302,
        headers: {
            'Location': '/',
            'Set-Cookie': `user_id=${user.id}; Path=/; HttpOnly; Max-Age=2592000`
        }
    });
});

// 3. TRANG ĐĂNG KÝ (`/register`)
router.get('/register', async (request, env) => {
    const content = `
    <div class="box">
        <div class="box-title">📝 Đăng ký tài khoản mới</div>
        <div class="box-content">
            <form method="POST" action="/register">
                <label>Tên đăng nhập:* (5 - 32 ký tự)</label>
                <input type="text" name="username" required pattern="[a-zA-Z0-9_]{5,32}">
                <label>Tên hiển thị:* (3 - 32 ký tự)</label>
                <input type="text" name="display_name" required>
                <label>E-mail:*</label>
                <input type="email" name="email" required>
                <label>Mật khẩu:*</label>
                <input type="password" name="password" required minlength="6">
                <label>Chọn giới tính:*</label>
                <select name="gender">
                    <option value="Nam">Nam</option>
                    <option value="Nữ">Nữ</option>
                    <option value="Khác">Khác</option>
                </select>
                <button type="submit" style="width:100%; margin-top:10px;">Đăng Ký</button>
            </form>
        </div>
    </div>`;
    return new Response(renderLayout('Đăng ký', content, null), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
});

router.post('/register', async (request, env) => {
    const formData = await request.formData();
    const username = formData.get('username');
    const displayName = formData.get('display_name');
    const email = formData.get('email');
    const password = formData.get('password');
    const gender = formData.get('gender');

    try {
        await env.DB.prepare("INSERT INTO users (username, display_name, email, password, gender, role, level, coins) VALUES (?, ?, ?, ?, ?, 'Thành Viên', 1, 1000)")
            .bind(username, displayName, email, password, gender).run();
        return new Response("Đăng ký thành công! <a href='/login'>Đăng nhập ngay</a>", { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
    } catch (e) {
        return new Response("Tên đăng nhập hoặc Email đã tồn tại! <a href='/register'>Thử lại</a>", { status: 400, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
    }
});

// 4. ĐĂNG XUẤT (`/logout`)
router.get('/logout', () => {
    return new Response("Đã đăng xuất!", {
        status: 302,
        headers: {
            'Location': '/login',
            'Set-Cookie': 'user_id=; Path=/; Max-Age=0'
        }
    });
});

// 5. TRANG CÁ NHÂN (`/profile` hoặc `/profile/?user=ID`)
router.get('/profile', async (request, env) => {
    const currentUser = await checkAuth(request, env);
    if (!currentUser) return Response.redirect(302, '/login');

    const url = new URL(request.url);
    const targetId = url.searchParams.get('user') || currentUser.id;
    
    const profileUser = targetId == currentUser.id ? currentUser : await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(targetId).first();

    if (!profileUser) return new Response("Không tìm thấy người dùng!", { status: 404 });

    const content = `
    <div class="box">
        <div class="box-title">Hồ sơ cá nhân: ${profileUser.display_name}</div>
        <div style="background: url('${profileUser.cover}') center/cover; height: 120px; position: relative;">
            <div style="position: absolute; bottom: -20px; left: 15px;">
                <img src="${profileUser.avatar}" width="60" height="60" style="border-radius: 50%; border: 2px solid #00ff00;">
            </div>
        </div>
        <div style="padding: 25px 15px 15px 15px; background: #111;">
            <div style="font-size: 16px; font-weight: bold; color: #fff;">${profileUser.display_name} [Lv.${profileUser.level}]</div>
            <div style="color: #888; font-size: 12px;">ID: ${profileUser.id} · Chức vụ: <span style="color:yellow">${profileUser.role}</span></div>
            <div style="margin-top: 10px; font-size: 13px;">${profileUser.status_text}</div>
            
            <div style="margin-top: 15px; display: flex; gap: 10px;">
                <a href="/settings" class="btn" style="padding: 5px 10px; font-size: 12px;">⚙️ Cài đặt</a>
                ${currentUser.id == profileUser.id ? `<a href="/profile/edit" class="btn" style="padding: 5px 10px; font-size: 12px; background:#444;">✏️ Chỉnh sửa</a>` : `<a href="/mail/send?to=${profileUser.id}" class="btn" style="padding: 5px 10px; font-size: 12px;">✉️ Nhắn tin</a>`}
            </div>
        </div>
        <div class="box-content" style="border-top:1px solid #333;">
            <div><b>Giới tính:</b> ${profileUser.gender}</div>
            <div><b>Level:</b> ${profileUser.level} (Cấp độ)</div>
            <div><b>Xu:</b> 🪙 ${profileUser.coins.toLocaleString()}</div>
            <div><b>Thời gian Online:</b> ⏱️ ${profileUser.online_time} phút</div>
        </div>
    </div>`;

    return new Response(renderLayout(`Hồ sơ ${profileUser.display_name}`, content, currentUser), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
});

// 6. CỬA HÀNG (`/shop`)
router.get('/shop', async (request, env) => {
    const user = await checkAuth(request, env);
    if (!user) return Response.redirect(302, '/login');

    const content = `
    <div class="box">
        <div class="box-title">🛒 Cửa hàng Thế Giới Chat</div>
        <div class="box-content">
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
                <div style="background:#1a1a1a; padding:10px; text-align:center; border:1px solid #333;">
                    <div style="font-weight:bold; color:#00ff00;">Nạp Xu</div>
                    <div style="font-size:11px; color:#aaa;">Dùng cho game và tiện ích</div>
                </div>
                <div style="background:#1a1a1a; padding:10px; text-align:center; border:1px solid #333;">
                    <div style="font-weight:bold; color:#ffcc00;">Nạp Vàng</div>
                    <div style="font-size:11px; color:#aaa;">Mua vật phẩm đặc biệt</div>
                </div>
            </div>
            <h3>Vật phẩm & Trang trí</h3>
            <ul>
                <li>🖼️ <b>Khung avatar độc quyền:</b> Làm nổi bật ảnh đại diện (Giá: 5,000 Xu)</li>
                <li>🎨 <b>Hiệu ứng tên Gradient:</b> Cầu vồng và ánh vàng (Giá: 10,000 Xu)</li>
                <li>⭐ <b>Icon trước nick:</b> Biểu tượng nhỏ cạnh tên (Giá: 3,000 Xu)</li>
            </ul>
        </div>
    </div>`;
    return new Response(renderLayout('Cửa hàng', content, user), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
});

// 7. HỘP THOẠI TIN NHẮN (`/mail/box`) & REALTIME
router.get('/mail/box', async (request, env) => {
    const user = await checkAuth(request, env);
    if (!user) return Response.redirect(302, '/login');

    const messages = await env.DB.prepare(`
        SELECT m.*, u.display_name, u.avatar, u.role, u.level 
        FROM messages m 
        JOIN users u ON (m.sender_id = u.id OR m.receiver_id = u.id) 
        WHERE (m.sender_id = ? OR m.receiver_id = ?) AND u.id != ?
        ORDER BY m.id DESC
    `).bind(user.id, user.id, user.id).all();

    const content = `
    <div class="box">
        <div class="box-title">✉️ Hộp thoại chính (Tin nhắn Realtime)</div>
        <div class="box-content" id="message-container">
            ${messages.results.length === 0 ? '<div style="text-align:center; color:#888;">Chưa có tin nhắn nào!</div>' : 
                messages.results.map(msg => `
                <div style="display:flex; align-items:center; border-bottom:1px solid #222; padding:8px 0;">
                    <img src="${msg.avatar}" width="36" height="36" style="border-radius:50%; margin-right:10px;">
                    <div style="flex-grow:1;">
                        <div><b>${msg.display_name}</b> <span style="font-size:11px; color:#888;">· ${msg.created_at}</span></div>
                        <div style="font-size:13px; color:#ccc;">${msg.message}</div>
                    </div>
                    <a href="/mail/chat?with=${msg.sender_id === user.id ? msg.receiver_id : msg.sender_id}" class="btn" style="padding:4px 8px; font-size:11px;">Chat</a>
                </div>
            `).join('')}
        </div>
    </div>`;

    return new Response(renderLayout('Hộp thư', content, user), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
});

// 8. THÔNG BÁO HOẠT ĐỘNG (`/mail/notification`)
router.get('/mail/notification', async (request, env) => {
    const user = await checkAuth(request, env);
    if (!user) return Response.redirect(302, '/login');

    const notifs = await env.DB.prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC").bind(user.id).all();

    const content = `
    <div class="box">
        <div class="box-title">🔔 Thông báo cá nhân</div>
        <div class="box-content">
            ${notifs.results.length === 0 ? '<div style="text-align:center; color:#888;">Danh sách trống!</div>' : 
                notifs.results.map(n => `<div style="padding:6px 0; border-bottom:1px solid #222;">${n.content} <span style="font-size:10px; color:#888;">(${n.created_at})</span></div>`).join('')}
        </div>
    </div>`;

    return new Response(renderLayout('Thông báo', content, user), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
});

// 9. BẢNG TIN (`/users/feed`)
router.get('/users/feed', async (request, env) => {
    const user = await checkAuth(request, env);
    if (!user) return Response.redirect(302, '/login');

    const feeds = await env.DB.prepare("SELECT feeds.*, users.display_name, users.avatar, users.role, users.level FROM feeds JOIN users ON feeds.user_id = users.id ORDER BY id DESC LIMIT 20").all();

    const content = `
    <div class="box">
        <div class="box-title">📋 Bảng tin xã hội</div>
        <div class="box-content">
            <form method="POST" action="/users/feed">
                <textarea name="content" placeholder="Bạn đang nghĩ gì?" rows="3" required></textarea>
                <button type="submit">Đăng bài</button>
            </form>
        </div>
    </div>
    <div class="box">
        <div class="box-content">
            ${feeds.results.map(f => `
                <div style="border-bottom:1px solid #333; margin-bottom:10px; padding-bottom:10px;">
                    <div style="display:flex; align-items:center; margin-bottom:5px;">
                        <img src="${f.avatar}" width="30" height="30" style="border-radius:50%; margin-right:8px;">
                        <div><b>${f.display_name}</b> <span style="font-size:11px; color:#ffcc00;">[Lv.${f.level}]</span> <span style="font-size:10px; color:#888;">· ${f.created_at}</span></div>
                    </div>
                    <div>${f.content}</div>
                </div>
            `).join('')}
        </div>
    </div>`;

    return new Response(renderLayout('Bảng tin', content, user), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
});

router.post('/users/feed', async (request, env) => {
    const user = await checkAuth(request, env);
    if (!user) return Response.redirect(302, '/login');
    const formData = await request.formData();
    const content = formData.get('content');

    await env.DB.prepare("INSERT INTO feeds (user_id, content) VALUES (?, ?)").bind(user.id, content).run();
    return Response.redirect(302, '/users/feed');
});

// 10. BẢNG CẤP ĐỘ / XẾP HẠNG (`/profile/level`)
router.get('/profile/level', async (request, env) => {
    const user = await checkAuth(request, env);
    if (!user) return Response.redirect(302, '/login');

    const topUsers = await env.DB.prepare("SELECT id, display_name, role, level, coins FROM users ORDER BY level DESC, coins DESC LIMIT 20").all();

    const content = `
    <div class="box">
        <div class="box-title">📊 Bảng Cấp Độ & Xếp Hạng Wap</div>
        <div class="box-content">
            <p>Hệ thống phân cấp chức vụ & level:</p>
            <ul>
                <li>👑 <b>Chủ Wap:</b> Level 130 (Quyền tối cao)</li>
                <li>🛡️ <b>Admin:</b> Level 125 (Quản trị hệ thống)</li>
                <li>⚔️ <b>Mod:</b> Level 120 (Kiểm duyệt viên)</li>
                <li>👤 <b>Thành Viên:</b> Level 1 đến 119</li>
                <li>📢 <b>Đăng thông báo:</b> Yêu cầu từ Level 50 trở lên.</li>
            </ul>
            <h3>Top Thành Viên Dẫn Đầu</h3>
            <table style="width:100%; font-size:12px; border-collapse:collapse;">
                <tr style="border-bottom:1px solid #333; color:#00ff00;">
                    <th style="text-align:left;">Thành viên</th>
                    <th>Chức vụ</th>
                    <th>Level</th>
                    <th>Xu</th>
                </tr>
                ${topUsers.results.map((u, idx) => `
                <tr style="border-bottom:1px solid #222;">
                    <td style="padding:6px 0;">#${idx+1} <a href="/profile?user=${u.id}">${u.display_name}</a></td>
                    <td style="text-align:center; color:yellow;">${u.role}</td>
                    <td style="text-align:center;">${u.level}</td>
                    <td style="text-align:right;">🪙 ${u.coins.toLocaleString()}</td>
                </tr>
                `).join('')}
            </table>
        </div>
    </div>`;

    return new Response(renderLayout('Bảng cấp độ', content, user), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
});

// 11. KHU GIẢI TRÍ (`/game`)
router.get('/game', async (request, env) => {
    const user = await checkAuth(request, env);
    if (!user) return Response.redirect(302, '/login');

    const content = `
    <div class="box">
        <div class="box-title">🎮 Khu Giải Trí & Mini Game</div>
        <div class="box-content" style="text-align:center; padding: 20px;">
            <h3>Chào mừng bạn đến với Khu Giải Trí Thế Giới Chat</h3>
            <p>Tham gia các trò chơi may rủi, đập hũ, tài xỉu và vòng quay may mắn để nhận xu thưởng mỗi ngày!</p>
            <a href="#" class="btn">🎲 Chơi Tài Xỉu</a> <a href="#" class="btn" style="background:#aa0000;">🎯 Vòng Quay May Mắn</a>
        </div>
    </div>`;

    return new Response(renderLayout('Khu giải trí', content, user), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
});

// 12. KHU VỰC QUẢN LÝ DÀNH CHO ADMIN / CHỦ WAP (`/admin`)
router.get('/admin', async (request, env) => {
    const user = await checkAuth(request, env);
    if (!user || (user.role !== 'Chủ Wap' && user.role !== 'Admin' && user.role !== 'Mod')) {
        return new Response("Bạn không có quyền truy cập khu vực quản lý này! Chỉ Chủ Wap, Admin và Mod mới được sử dụng.", { status: 403 });
    }

    const usersList = await env.DB.prepare("SELECT id, username, display_name, role, level, coins FROM users ORDER BY id DESC LIMIT 50").all();

    const content = `
    <div class="box">
        <div class="box-title">🛠️ Khu Vực Quản Lý Hệ Thống</div>
        <div class="box-content">
            <p>Chào quản trị viên: <b>${user.display_name}</b> (${user.role} - Lv.${user.level})</p>
            <h3>Danh sách thành viên & Phân quyền</h3>
            <table style="width:100%; font-size:11px; border-collapse:collapse;">
                <tr style="border-bottom:1px solid #333; color:#00ff00;">
                    <th>ID</th>
                    <th>Tên</th>
                    <th>Chức vụ</th>
                    <th>Level</th>
                    <th>Hành động</th>
                </tr>
                ${usersList.results.map(u => `
                <tr style="border-bottom:1px solid #222;">
                    <td>${u.id}</td>
                    <td><a href="/profile?user=${u.id}">${u.display_name}</a></td>
                    <td style="color:yellow;">${u.role}</td>
                    <td>${u.level}</td>
                    <td>
                        <form method="POST" action="/admin/update-role" style="display:inline;">
                            <input type="hidden" name="user_id" value="${u.id}">
                            <select name="role" style="width:auto; padding:2px; font-size:10px;">
                                <option value="Thành Viên" ${u.role==='Thành Viên'?'selected':''}>Thành Viên</option>
                                <option value="Mod" ${u.role==='Mod'?'selected':''}>Mod (120)</option>
                                <option value="Admin" ${u.role==='Admin'?'selected':''}>Admin (125)</option>
                                <option value="Chủ Wap" ${u.role==='Chủ Wap'?'selected':''}>Chủ Wap (130)</option>
                            </select>
                            <button type="submit" style="padding:2px 5px; font-size:10px;">Lưu</button>
                        </form>
                    </td>
                </tr>
                `).join('')}
            </table>
        </div>
    </div>`;

    return new Response(renderLayout('Quản lý hệ thống', content, user), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
});

router.post('/admin/update-role', async (request, env) => {
    const user = await checkAuth(request, env);
    if (!user || (user.role !== 'Chủ Wap' && user.role !== 'Admin')) {
        return new Response("Không có quyền!", { status: 403 });
    }
    const formData = await request.formData();
    const targetUserId = formData.get('user_id');
    const newRole = formData.get('role');
    
    let newLevel = 1;
    if (newRole === 'Chủ Wap') newLevel = 130;
    else if (newRole === 'Admin') newLevel = 125;
    else if (newRole === 'Mod') newLevel = 120;

    await env.DB.prepare("UPDATE users SET role = ?, level = ? WHERE id = ?").bind(newRole, newLevel, targetUserId).run();
    return Response.redirect(302, '/admin');
});

// API Realtime Check
router.get('/api/realtime-check', async (request, env) => {
    const user = await checkAuth(request, env);
    if (!user) return new Response(JSON.stringify({ unread_messages: 0 }));
    
    const unreadMsg = await env.DB.prepare("SELECT COUNT(*) as count FROM messages WHERE receiver_id = ? AND is_read = 0").bind(user.id).first();
    return new Response(JSON.stringify({ unread_messages: unreadMsg.count }), { headers: { 'Content-Type': 'application/json' } });
});

export default {
  async fetch(request, env, ctx) {
    return router.handle(request, env, ctx);
  }
};
