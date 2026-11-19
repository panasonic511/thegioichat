function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function isOwnerAccount(u) {
    if (!u) return false;
    if (Number(u.is_owner) === 1 || Number(u.id) === 1) return true;
    const role = String(u.role || '').trim().toLowerCase();
    return role === 'chủ wap' || role === 'chu wap' || role === 'owner';
}

async function getMaintStatus(env) {
    let enabled = false;
    let message = 'Hệ thống đang bảo trì nâng cấp để phục vụ bạn tốt hơn. Vui lòng quay lại sau!';
    try {
        const rows = await env.DB.prepare(
            "SELECT setting_key, setting_value FROM site_settings WHERE setting_key IN ('maintenance_mode', 'maintenance_message')"
        ).all();
        for (const r of (rows.results || [])) {
            if (r.setting_key === 'maintenance_mode') enabled = String(r.setting_value || '0') === '1';
            if (r.setting_key === 'maintenance_message' && r.setting_value) message = String(r.setting_value);
        }
    } catch (e) {}
    return { enabled, message };
}

export async function handleLogin(request, env) {
    const maint = await getMaintStatus(env);

    if (request.method === 'GET') {
        const maintBannerHtml = maint.enabled ? `
            <div style="background:#261600;border:1px solid #ff9900;color:#ffcc00;padding:10px;border-radius:4px;font-size:12px;margin-bottom:12px;line-height:1.4;">
                <strong>🛠️ Đang bật chế độ bảo trì:</strong> ${escapeHtml(maint.message)}<br>
                <span style="color:#ffd699;font-size:11px;">Chỉ tài khoản Chủ Wap mới có thể đăng nhập lúc này.</span>
            </div>
        ` : '';

        return new Response(`<!DOCTYPE html>
        <html lang="vi">
        <head>
            <meta charset="UTF-8">
            <title>Thế Giới Chat - Đăng nhập</title>
            <style>
                body { background: #000; color: #00ff00; font-family: monospace; margin: 0; padding: 0; }
                .header { background: #111; text-align: center; padding: 12px; border-bottom: 2px solid #333; }
                .header h1 { color: #fff; margin: 0; font-size: 22px; text-shadow: 0 0 8px #00ff00; }
                .slogan { color: #00ff00; font-size: 11px; }
                .nav-top { background: #111; padding: 6px; text-align: center; border-bottom: 1px solid #333; font-size: 12px; }
                .nav-top a { color: #00ff00; text-decoration: none; margin: 0 5px; }
                .container { max-width: 500px; margin: 20px auto; background: #111; border: 1px solid #333; border-radius: 4px; overflow: hidden; }
                .box-title { background: #1a1a1a; color: #00ff00; padding: 8px 12px; font-weight: bold; border-bottom: 1px solid #333; }
                .box-body { padding: 15px; font-size: 13px; }
                input[type="text"], input[type="password"] { background: #000; color: #00ff00; border: 1px solid #444; padding: 8px; width: 100%; box-sizing: border-box; margin-bottom: 12px; }
                button { background: #0055ff; color: #fff; border: none; padding: 10px; width: 100%; font-weight: bold; cursor: pointer; border-radius: 3px; }
                button:hover { background: #0033cc; }
                .footer { text-align: center; padding: 15px; font-size: 11px; color: #666; border-top: 1px solid #222; background: #050505; margin-top: 30px; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>THẾ GIỚI CHAT</h1>
                <div class="slogan">Wap chát - Kết bạn - Giải trí</div>
            </div>
            <div class="nav-top">
                <a href="/">Trang chủ</a> · <a href="/login">Đăng nhập</a> · <a href="/register">Đăng ký</a>
            </div>

            <div class="container">
                <div class="box-title">🔒 Đăng nhập</div>
                <div class="box-body">
                    ${maintBannerHtml}
                    <form method="POST" action="/login">
                        <label style="color:#00ff00;">Tên tài khoản / ID / Gmail:</label>
                        <input type="text" name="username" required placeholder="Nhập tên đăng nhập hoặc email...">

                        <label style="color:#00ff00;">Nhập mật khẩu:</label>
                        <input type="password" name="password" required placeholder="Nhập mật khẩu...">

                        <div style="margin-bottom: 15px; font-size: 12px;">
                            <input type="checkbox" name="remember" style="width: auto;"> Ghi nhớ | <a href="/forgot" style="color:#ffcc00;">Quên mật khẩu</a>
                        </div>

                        <button type="submit">Đăng nhập</button>
                    </form>
                    <div style="text-align: center; margin-top: 15px; font-size: 12px;">
                        Hoặc<br>
                        Nếu chưa có tài khoản? <a href="/register" style="color: #ff5555; font-weight: bold;">Đăng kí ngay</a>
                    </div>
                </div>
            </div>

            <div class="footer">
                Copyright © 2026 - Thế Giới Chat<br>
                Chát kết bạn, Giải trí, Hẹn hò
            </div>
        </body>
        </html>`, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
    }

    if (request.method === 'POST') {
        const formData = await request.formData();
        const username = String(formData.get('username') || '').trim();
        const password = String(formData.get('password') || '');

        const user = await env.DB.prepare(
            "SELECT * FROM users WHERE (username = ? OR email = ? OR CAST(id AS TEXT) = ?) AND password = ?"
        )
            .bind(username, username, username, password)
            .first();

        if (!user) {
            return new Response(`Sai tài khoản hoặc mật khẩu! <a href="/login">Quay lại đăng nhập</a>`, {
                status: 400,
                headers: { 'Content-Type': 'text/html;charset=UTF-8' }
            });
        }

        if (maint.enabled && !isOwnerAccount(user)) {
            return new Response(`<!DOCTYPE html>
            <html lang="vi">
            <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Đang bảo trì</title></head>
            <body style="background:#000;color:#00ff00;font-family:Arial,sans-serif;text-align:center;padding:40px 16px;">
                <div style="max-width:420px;margin:0 auto;background:#111;border:1px solid #333;border-radius:8px;padding:20px;">
                    <h2 style="color:#ffcc00;margin-top:0;">🛠️ CHẾ ĐỘ BẢO TRÌ WAP</h2>
                    <p style="color:#ddd;">${escapeHtml(maint.message)}</p>
                    <p style="color:#ff8888;font-size:12px;">Chỉ tài khoản Chủ Wap mới được phép đăng nhập lúc này.</p>
                    <a href="/login" style="color:#00ff00;">Quay lại trang đăng nhập</a>
                </div>
            </body></html>`, {
                status: 503,
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
    const maint = await getMaintStatus(env);
    if (maint.enabled) {
        return new Response(`<!DOCTYPE html>
        <html lang="vi">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Đang bảo trì</title></head>
        <body style="background:#000;color:#00ff00;font-family:Arial,sans-serif;text-align:center;padding:40px 16px;">
            <div style="max-width:420px;margin:0 auto;background:#111;border:1px solid #333;border-radius:8px;padding:20px;">
                <h2 style="color:#ffcc00;margin-top:0;">🛠️ CHẾ ĐỘ BẢO TRÌ WAP</h2>
                <p style="color:#ddd;">${escapeHtml(maint.message)}</p>
                <p style="color:#ff8888;font-size:12px;">Đang bật chế độ bảo trì, tạm ngừng đăng ký tài khoản mới.</p>
                <a href="/login" style="color:#00ff00;">Đăng nhập tài khoản Chủ Wap</a>
            </div>
        </body></html>`, {
            status: 503,
            headers: { 'Content-Type': 'text/html;charset=UTF-8' }
        });
    }

    if (request.method === 'GET') {
        return new Response(`<!DOCTYPE html>
        <html lang="vi">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Thế Giới Chat - Đăng ký</title>
            <style>
                body { background: #000; color: #00ff00; font-family: monospace; margin: 0; padding: 0; }
                .header { background: #111; text-align: center; padding: 12px; border-bottom: 2px solid #333; }
                .header h1 { color: #fff; margin: 0; font-size: 22px; text-shadow: 0 0 8px #00ff00; }
                .slogan { color: #00ff00; font-size: 11px; }
                .nav-top { background: #111; padding: 6px; text-align: center; border-bottom: 1px solid #333; font-size: 12px; }
                .nav-top a { color: #00ff00; text-decoration: none; margin: 0 5px; }
                .container { max-width: 500px; margin: 20px auto; background: #111; border: 1px solid #333; border-radius: 4px; overflow: hidden; }
                .box-title { background: #1a1a1a; color: #00ff00; padding: 8px 12px; font-weight: bold; border-bottom: 1px solid #333; }
                .box-body { padding: 15px; font-size: 13px; }
                input[type="text"], input[type="password"] { background: #000; color: #00ff00; border: 1px solid #444; padding: 8px; width: 100%; box-sizing: border-box; margin-bottom: 12px; }
                button { background: #007700; color: #fff; border: none; padding: 10px; width: 100%; font-weight: bold; cursor: pointer; border-radius: 3px; }
                button:hover { background: #009900; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>THẾ GIỚI CHAT</h1>
                <div class="slogan">Wap chát - Kết bạn - Giải trí</div>
            </div>
            <div class="nav-top">
                <a href="/">Trang chủ</a> · <a href="/login">Đăng nhập</a> · <a href="/register">Đăng ký</a>
            </div>
            <div class="container">
                <div class="box-title">📝 Đăng ký tài khoản</div>
                <div class="box-body">
                    <form method="POST" action="/register">
                        <label>Tên đăng nhập:</label>
                        <input type="text" name="username" required placeholder="Nhập tên đăng nhập...">
                        <label>Tên hiển thị:</label>
                        <input type="text" name="display_name" placeholder="Nhập tên hiển thị...">
                        <label>Mật khẩu:</label>
                        <input type="password" name="password" required placeholder="Nhập mật khẩu...">
                        <button type="submit">Đăng ký</button>
                    </form>
                    <div style="text-align:center;margin-top:12px;font-size:12px;">
                        Đã có tài khoản? <a href="/login">Đăng nhập ngay</a>
                    </div>
                </div>
            </div>
        </body>
        </html>`, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
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
