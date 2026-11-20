function renderAuthLayout(title, content) {
    const menuBarHtml = `
        <a href="/login" class="top-menu-item"><span class="top-menu-icon">🔑</span>Đăng nhập</a>
        <a href="/register" class="top-menu-item"><span class="top-menu-icon">📝</span>Đăng ký</a>
    `;

    return `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - Thế Giới Chat</title>
    <style>
        body { background: #000; color: #00ff00; font-family: Arial, sans-serif; margin: 0; padding: 0; font-size: 14px; line-height: 1.6; }
        .header { background: #000; text-align: center; padding: 16px 0; border-bottom: 2px solid #222; }
        .header h1 { color: #fff; margin: 0; font-size: 24px; font-weight: bold; text-shadow: 0 0 12px #00ff00; letter-spacing: 1px; }
        @keyframes rainbowGlow {
            0% { color: #ff0000; text-shadow: 0 0 6px #ff0000; }
            14% { color: #ff7700; text-shadow: 0 0 6px #ff7700; }
            28% { color: #ffff00; text-shadow: 0 0 6px #ffff00; }
            42% { color: #00ff00; text-shadow: 0 0 6px #00ff00; }
            57% { color: #00ffff; text-shadow: 0 0 6px #00ffff; }
            71% { color: #0000ff; text-shadow: 0 0 6px #0000ff; }
            85% { color: #ff00ff; text-shadow: 0 0 6px #ff00ff; }
            100% { color: #ff0000; text-shadow: 0 0 6px #ff0000; }
        }
        .slogan { font-size: 13px; font-weight: bold; margin-top: 6px; animation: rainbowGlow 4s infinite linear; }
        .top-menu-wrapper { background: #111; border-bottom: 2px solid #222; padding: 10px 0; }
        .top-menu-bar { max-width: 680px; margin: 0 auto; display: flex; justify-content: space-around; align-items: center; text-align: center; padding: 0 10px; box-sizing: border-box; }
        .top-menu-item { color: #00ff00; text-decoration: none; font-size: 13px; display: flex; flex-direction: column; align-items: center; font-weight: bold; flex: 1; position: relative; }
        .top-menu-item:hover { color: #fff; text-decoration: underline; }
        .top-menu-icon { font-size: 20px; margin-bottom: 3px; }
        .container { padding: 12px; max-width: 680px; margin: 0 auto; box-sizing: border-box; }
        .box { background: #080808; border: 1px solid #333; margin-bottom: 12px; box-sizing: border-box; }
        .box-title { background: linear-gradient(to right, #141414, #222); color: #00ff00; padding: 10px 12px; font-weight: bold; border-bottom: 1px solid #333; font-size: 14px; display: flex; align-items: center; gap: 8px; }
        .box-content { padding: 12px; }
        a { color: #00ff00; text-decoration: none; }
        a:hover { text-decoration: underline; color: #fff; }
        .btn { background: #1c1c1c; color: #00ff00; border: 1px solid #444; padding: 8px 14px; cursor: pointer; font-size: 13px; font-weight: bold; display: inline-block; text-align: center; box-sizing: border-box; }
        .btn:hover { background: #333; border-color: #00ff00; color: #fff; }
        .form-label { display: block; color: #00ff00; font-weight: bold; margin-bottom: 6px; font-size: 13px; }
        .form-input { background: #000; color: #fff; border: 1px solid #444; border-radius: 4px; padding: 10px; width: 100%; box-sizing: border-box; margin-bottom: 12px; font-family: Arial, sans-serif; font-size: 14px; }
        .form-input:focus { outline: none; border-color: #00ff00; }
        .footer { text-align: center; padding: 16px; font-size: 13px; color: #777; border-top: 1px solid #222; background: #050505; margin-bottom: 40px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>THẾ GIỚI CHAT</h1>
        <div class="slogan">Wap chát - Kết bạn - Giải trí</div>
    </div>
    <div class="top-menu-wrapper"><div class="top-menu-bar">${menuBarHtml}</div></div>
    <div class="container">${content}</div>
    <div class="footer">
        <div><a href="/">Home</a> · <a href="/terms">Điều khoản</a> · <a href="/contact">Liên hệ</a></div>
        <div style="color: #00ff00; margin-top: 8px;">Copyright © 2026 - Thế Giới Chat</div>
    </div>
</body>
</html>`;
}

export async function handleLogin(request, env) {
    if (request.method === 'GET') {
        const content = `
        <div class="box">
            <div class="box-title">🔒 Đăng nhập hệ thống</div>
            <div class="box-content">
                <form method="POST" action="/login">
                    <label class="form-label">Tên tài khoản / ID:</label>
                    <input class="form-input" type="text" name="username" required placeholder="Nhập tên đăng nhập hoặc ID...">

                    <label class="form-label">Nhập mật khẩu:</label>
                    <input class="form-input" type="password" name="password" required placeholder="Nhập mật khẩu...">

                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;font-size:13px;flex-wrap:wrap;gap:8px;">
                        <label style="display:inline-flex;align-items:center;gap:6px;color:#ccc;cursor:pointer;margin:0;">
                            <input type="checkbox" name="remember"> Ghi nhớ
                        </label>
                        <a href="/forgot" style="color:#ffcc00;">Quên mật khẩu</a>
                    </div>

                    <button type="submit" class="btn" style="background:#0055ff;color:#fff;border-color:#0055ff;width:100%;padding:10px 14px;">Đăng nhập</button>
                </form>
                <div style="text-align:center;margin-top:14px;padding-top:12px;border-top:1px solid #222;font-size:13px;color:#ccc;">
                    Chưa có tài khoản? <a href="/register" style="color:#ff5555;font-weight:bold;">Đăng ký ngay</a>
                </div>
            </div>
        </div>`;

        return new Response(renderAuthLayout('Đăng nhập', content), {
            headers: { 'Content-Type': 'text/html;charset=UTF-8' }
        });
    }

    if (request.method === 'POST') {
        const formData = await request.formData();
        const username = String(formData.get('username') || '').trim();
        const password = String(formData.get('password') || '');

        const user = await env.DB.prepare(
            "SELECT * FROM users WHERE (username = ? OR CAST(id AS TEXT) = ?) AND password = ?"
        )
            .bind(username, username, password)
            .first();

        if (!user) {
            return new Response(`Sai tài khoản hoặc mật khẩu! <a href="/login">Quay lại đăng nhập</a>`, {
                status: 400,
                headers: { 'Content-Type': 'text/html;charset=UTF-8' }
            });
        }

        return new Response("Đăng nhập thành công!", {
            status: 302,
            headers: {
                'Location': '/',
                'Set-Cookie': `user_id=${user.id}; Path=/; HttpOnly; Max-Age=2592000`
            }
        });
    }
}

export async function handleRegister(request, env) {
    if (request.method === 'GET') {
        const content = `
        <div class="box">
            <div class="box-title">📝 Đăng ký tài khoản</div>
            <div class="box-content">
                <form method="POST" action="/register">
                    <label class="form-label">Tên đăng nhập:</label>
                    <input class="form-input" type="text" name="username" required placeholder="Nhập tên đăng nhập...">

                    <label class="form-label">Tên hiển thị:</label>
                    <input class="form-input" type="text" name="display_name" placeholder="Nhập tên hiển thị...">

                    <label class="form-label">Mật khẩu:</label>
                    <input class="form-input" type="password" name="password" required placeholder="Nhập mật khẩu...">

                    <button type="submit" class="btn" style="background:#007700;color:#fff;border-color:#00aa00;width:100%;padding:10px 14px;">Đăng ký</button>
                </form>
                <div style="text-align:center;margin-top:14px;padding-top:12px;border-top:1px solid #222;font-size:13px;color:#ccc;">
                    Đã có tài khoản? <a href="/login" style="font-weight:bold;">Đăng nhập ngay</a>
                </div>
            </div>
        </div>`;

        return new Response(renderAuthLayout('Đăng ký', content), {
            headers: { 'Content-Type': 'text/html;charset=UTF-8' }
        });
    }

    if (request.method === 'POST') {
        const formData = await request.formData();
        const username = String(formData.get('username') || '').trim();
        const displayName = String(formData.get('display_name') || '').trim() || username;
        const password = String(formData.get('password') || '');

        if (!username || !password) {
            return new Response(`Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu! <a href="/register">Quay lại</a>`, {
                status: 400,
                headers: { 'Content-Type': 'text/html;charset=UTF-8' }
            });
        }

        const existing = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
        if (existing) {
            return new Response(`Tên đăng nhập đã tồn tại! <a href="/register">Thử tên khác</a>`, {
                status: 400,
                headers: { 'Content-Type': 'text/html;charset=UTF-8' }
            });
        }

        const inserted = await env.DB.prepare(
            "INSERT INTO users (username, display_name, password, role, coins, level) VALUES (?, ?, ?, 'Thành Viên', 0, 1) RETURNING id"
        ).bind(username, displayName, password).first();

        const newUserId = inserted ? inserted.id : null;
        return new Response("Đăng ký thành công!", {
            status: 302,
            headers: {
                'Location': '/',
                ...(newUserId ? { 'Set-Cookie': `user_id=${newUserId}; Path=/; HttpOnly; Max-Age=2592000` } : {})
            }
        });
    }
}
