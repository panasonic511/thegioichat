export async function handleLogin(request, env) {
    let error = '';
    if (request.method === 'POST') {
        try {
            const formData = await request.formData();
            const username = formData.get('username')?.trim();
            const password = formData.get('password')?.trim();

            if (!username || !password) {
                error = 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.';
            } else {
                const user = await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
                if (!user || user.password !== password) {
                    error = 'Tên đăng nhập hoặc mật khẩu không chính xác.';
                } else {
                    // Đăng nhập thành công, lưu cookie user_id
                    return new Response(null, {
                        status: 302,
                        headers: {
                            'Location': '/',
                            'Set-Cookie': `user_id=${user.id}; Path=/; HttpOnly; Max-Age=2592000`
                        }
                    });
                }
            }
        } catch (e) {
            error = 'Lỗi hệ thống đăng nhập.';
        }
    }

    const content = `
    <div class="box" style="max-width: 400px; margin: 30px auto;">
        <div class="box-title">🔑 Đăng nhập tài khoản</div>
        <div class="box-content">
            ${error ? `<div style="color: #ff3333; margin-bottom: 10px; font-weight: bold; text-align: center;">${error}</div>` : ''}
            <form method="POST" style="display: flex; flex-direction: column; gap: 10px;">
                <div>
                    <label style="font-size: 13px; color: #aaa;">Tên đăng nhập:</label>
                    <input type="text" name="username" required style="width: 100%; background: #000; color: #fff; border: 1px solid #444; padding: 8px; box-sizing: border-box; margin-top: 4px;">
                </div>
                <div>
                    <label style="font-size: 13px; color: #aaa;">Mật khẩu:</label>
                    <input type="password" name="password" required style="width: 100%; background: #000; color: #fff; border: 1px solid #444; padding: 8px; box-sizing: border-box; margin-top: 4px;">
                </div>
                <button type="submit" class="btn" style="background: #0055ff; color: #fff; padding: 10px; margin-top: 6px; font-size: 14px;">Đăng nhập</button>
            </form>
            <div style="text-align: center; margin-top: 15px; font-size: 13px;">
                Chưa có tài khoản? <a href="/register">Đăng ký ngay</a>
            </div>
        </div>
    </div>
    `;

    return new Response(`<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Đăng nhập - Thế Giới Chat</title>
    <style>
        body { background: #000; color: #00ff00; font-family: Arial, sans-serif; margin: 0; padding: 12px; }
        .box { background: #080808; border: 1px solid #333; margin-bottom: 12px; }
        .box-title { background: #141414; color: #00ff00; padding: 10px 12px; font-weight: bold; border-bottom: 1px solid #333; }
        .box-content { padding: 12px; }
        a { color: #00ff00; text-decoration: none; }
        a:hover { text-decoration: underline; color: #fff; }
        .btn { border: 1px solid #444; cursor: pointer; font-weight: bold; text-align: center; }
    </style>
</head>
<body>
    <div style="text-align: center; padding: 20px 0;"><h1 style="color:#fff; text-shadow:0 0 10px #00ff00; margin:0;">THẾ GIỚI CHAT</h1></div>
    ${content}
</body>
</html>`, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

export async function handleRegister(request, env) {
    let error = '';
    if (request.method === 'POST') {
        try {
            const formData = await request.formData();
            const username = formData.get('username')?.trim();
            const password = formData.get('password')?.trim();
            const displayName = formData.get('display_name')?.trim() || username;
            const gender = formData.get('gender') || 'male';

            if (!username || !password) {
                error = 'Vui lòng điền đầy đủ tên đăng nhập và mật khẩu.';
            } else {
                // Kiểm tra tài khoản đã tồn tại chưa
                const existing = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
                if (existing) {
                    error = 'Tên đăng nhập này đã tồn tại, vui lòng chọn tên khác.';
                } else {
                    // Tạo Avatar mặc định riêng biệt cho Nam và Nữ bằng SVG siêu nhẹ
                    const defaultAvatarMale = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><rect width='120' height='120' fill='%230f172a'/><circle cx='60' cy='45' r='22' fill='%2338bdf8'/><path d='M20 105 C20 80, 100 80, 100 105' fill='%2338bdf8'/></svg>";
                    const defaultAvatarFemale = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><rect width='120' height='120' fill='%231f1025'/><circle cx='60' cy='45' r='22' fill='%23f472b6'/><path d='M20 105 C20 80, 100 80, 100 105' fill='%23f472b6'/></svg>";
                    
                    const userAvatar = gender === 'female' ? defaultAvatarFemale : defaultAvatarMale;

                    // Tự động tạo bảng users nếu chưa có cột gender
                    try {
                        await env.DB.prepare("ALTER TABLE users ADD COLUMN gender TEXT DEFAULT 'male'").run();
                    } catch (e) {}

                    // Lưu vào Database
                    await env.DB.prepare(`
                        INSERT INTO users (username, password, display_name, gender, avatar, role, level, coins, gold, created_at) 
                        VALUES (?, ?, ?, ?, ?, 'Thành Viên', 1, 1000, 0, datetime('now'))
                    `).bind(username, password, displayName, gender, userAvatar).run();

                    return new Response(null, {
                        status: 302,
                        headers: { 'Location': '/login' }
                    });
                }
            }
        } catch (e) {
            error = 'Lỗi hệ thống đăng ký: ' + e.message;
        }
    }

    const content = `
    <div class="box" style="max-width: 400px; margin: 30px auto;">
        <div class="box-title">📝 Đăng ký thành viên mới</div>
        <div class="box-content">
            ${error ? `<div style="color: #ff3333; margin-bottom: 10px; font-weight: bold; text-align: center;">${error}</div>` : ''}
            <form method="POST" style="display: flex; flex-direction: column; gap: 10px;">
                <div>
                    <label style="font-size: 13px; color: #aaa;">Tên tài khoản:</label>
                    <input type="text" name="username" required style="width: 100%; background: #000; color: #fff; border: 1px solid #444; padding: 8px; box-sizing: border-box; margin-top: 4px;">
                </div>
                <div>
                    <label style="font-size: 13px; color: #aaa;">Mật khẩu:</label>
                    <input type="password" name="password" required style="width: 100%; background: #000; color: #fff; border: 1px solid #444; padding: 8px; box-sizing: border-box; margin-top: 4px;">
                </div>
                <div>
                    <label style="font-size: 13px; color: #aaa;">Tên hiển thị (Nickname):</label>
                    <input type="text" name="display_name" placeholder="Tên hiển thị trên Wap" style="width: 100%; background: #000; color: #fff; border: 1px solid #444; padding: 8px; box-sizing: border-box; margin-top: 4px;">
                </div>
                <div>
                    <label style="font-size: 13px; color: #aaa;">Giới tính:</label>
                    <select name="gender" style="width: 100%; background: #000; color: #fff; border: 1px solid #444; padding: 8px; box-sizing: border-box; margin-top: 4px;">
                        <option value="male">👦 Nam (Avatar xanh nam tính)</option>
                        <option value="female">👧 Nữ (Avatar hồng nữ tính)</option>
                    </select>
                </div>
                <button type="submit" class="btn" style="background: #00aa00; color: #000; padding: 10px; margin-top: 6px; font-size: 14px;">Đăng ký ngay</button>
            </form>
            <div style="text-align: center; margin-top: 15px; font-size: 13px;">
                Đã có tài khoản? <a href="/login">Đăng nhập ngay</a>
            </div>
        </div>
    </div>
    `;

    return new Response(`<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Đăng ký - Thế Giới Chat</title>
    <style>
        body { background: #000; color: #00ff00; font-family: Arial, sans-serif; margin: 0; padding: 12px; }
        .box { background: #080808; border: 1px solid #333; margin-bottom: 12px; }
        .box-title { background: #141414; color: #00ff00; padding: 10px 12px; font-weight: bold; border-bottom: 1px solid #333; }
        .box-content { padding: 12px; }
        a { color: #00ff00; text-decoration: none; }
        a:hover { text-decoration: underline; color: #fff; }
        .btn { border: 1px solid #444; cursor: pointer; font-weight: bold; text-align: center; }
    </style>
</head>
<body>
    <div style="text-align: center; padding: 20px 0;"><h1 style="color:#fff; text-shadow:0 0 10px #00ff00; margin:0;">THẾ GIỚI CHAT</h1></div>
    ${content}
</body>
</html>`, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}
