export async function handleLogin(request, env) {
    if (request.method === 'POST') {
        const formData = await request.formData();
        const usernameInput = (formData.get('username') || '').trim();
        const passwordInput = (formData.get('password') || '').trim();

        const user = await env.DB.prepare("SELECT * FROM users WHERE (username = ? OR email = ? OR CAST(id AS TEXT) = ?) AND password = ?")
            .bind(usernameInput, usernameInput, usernameInput, passwordInput)
            .first();

        if (user) {
            return new Response(null, {
                status: 302,
                headers: {
                    'Location': '/',
                    'Set-Cookie': `user_id=${user.id}; Path=/; HttpOnly; Max-Age=2592000`
                }
            });
        }
        return new Response("Sai thông tin đăng nhập hoặc mật khẩu! <a href='/'>Quay lại</a>", {
            status: 401,
            headers: { 'Content-Type': 'text/html;charset=UTF-8' }
        });
    }
    return Response.redirect(new URL('/', request.url), 302);
}

export async function handleRegister(request, env) {
    let errorMsg = "";
    if (request.method === 'POST') {
        const formData = await request.formData();
        const username = (formData.get('username') || '').trim();
        const display_name = (formData.get('display_name') || username).trim();
        const email = (formData.get('email') || '').trim();
        const password = (formData.get('password') || '').trim();

        if (!username || !password) {
            errorMsg = "Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu!";
        } else {
            try {
                try { await env.DB.prepare("ALTER TABLE users ADD COLUMN created_at TEXT;").run(); } catch(e) {}
                const exists = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
                if (exists) {
                    errorMsg = "Tên tài khoản này đã tồn tại!";
                } else {
                    const now = new Date(Date.now() + 7 * 3600 * 1000);
                    const createdAt = `${String(now.getUTCDate()).padStart(2, '0')}.${String(now.getUTCMonth() + 1).padStart(2, '0')}.${now.getUTCFullYear()} / ${now.toISOString().substr(11, 5)}`;

                    const res = await env.DB.prepare("INSERT INTO users (username, display_name, email, password, role, level, coins, gold, created_at) VALUES (?, ?, ?, ?, 'Thành Viên', 1, 1000, 0, ?)")
                        .bind(username, display_name, email, password, createdAt)
                        .run();

                    const newUser = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
                    return new Response(null, {
                        status: 302,
                        headers: {
                            'Location': '/',
                            'Set-Cookie': `user_id=${newUser.id}; Path=/; HttpOnly; Max-Age=2592000`
                        }
                    });
                }
            } catch (e) {
                errorMsg = "Lỗi đăng ký: " + e.message;
            }
        }
    }

    const html = `<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Đăng ký - Thế Giới Chat</title></head>
<body style="background:#000; color:#00ff00; font-family:Arial,sans-serif; font-size:12px; padding:15px;">
    <div style="max-width:420px; margin:0 auto; background:#0d0d0d; border:1px solid #333; padding:12px;">
        <div style="font-weight:bold; border-bottom:1px solid #333; padding-bottom:6px; margin-bottom:10px;">📝 Đăng ký tài khoản mới</div>
        ${errorMsg ? `<div style="color:#ff5555; margin-bottom:8px;">❌ ${errorMsg}</div>` : ''}
        <form method="POST">
            <label>Tên đăng nhập:</label><br>
            <input type="text" name="username" required style="width:100%; background:#000; color:#00ff00; border:1px solid #444; padding:6px; box-sizing:border-box; margin:4px 0 8px 0;">
            <label>Tên hiển thị (Nickname):</label><br>
            <input type="text" name="display_name" required style="width:100%; background:#000; color:#00ff00; border:1px solid #444; padding:6px; box-sizing:border-box; margin:4px 0 8px 0;">
            <label>Email:</label><br>
            <input type="email" name="email" style="width:100%; background:#000; color:#00ff00; border:1px solid #444; padding:6px; box-sizing:border-box; margin:4px 0 8px 0;">
            <label>Mật khẩu:</label><br>
            <input type="password" name="password" required style="width:100%; background:#000; color:#00ff00; border:1px solid #444; padding:6px; box-sizing:border-box; margin:4px 0 10px 0;">
            <button type="submit" style="width:100%; background:#0055ff; color:#fff; border:none; padding:8px; font-weight:bold; cursor:pointer;">Hoàn tất đăng ký</button>
        </form>
        <div style="text-align:center; margin-top:10px;"><a href="/" style="color:#ffcc00;">⬅️ Quay lại đăng nhập</a></div>
    </div>
</body>
</html>`;
    return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}
