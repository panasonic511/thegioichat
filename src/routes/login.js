export async function handleLogin(request, env) {
    if (request.method === 'GET') {
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
        const username = formData.get('username');
        const password = formData.get('password');

        // Truy vấn kiểm tra cơ sở dữ liệu D1
        const user = await env.DB.prepare("SELECT * FROM users WHERE (username = ? OR email = ?) AND password = ?")
            .bind(username, username, password)
            .first();

        if (!user) {
            return new Response(`Sai tài khoản hoặc mật khẩu! <a href="/login">Quay lại đăng nhập</a>`, {
                status: 400,
                headers: { 'Content-Type': 'text/html;charset=UTF-8' }
            });
        }

        // Đăng nhập thành công, thiết lập Cookie phiên làm việc
        return new Response("Đăng nhập thành công!", {
            status: 302,
            headers: {
                'Location': '/',
                'Set-Cookie': `user_id=${user.id}; Path=/; HttpOnly; Max-Age=2592000`
            }
        });
    }
}