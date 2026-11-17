export async function handleRegister(request, env) {
    if (request.method === 'GET') {
        return new Response(`<!DOCTYPE html>
        <html lang="vi">
        <head>
            <meta charset="UTF-8">
            <title>Thế Giới Chat - Đăng ký tài khoản</title>
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
                input[type="text"], input[type="password"], input[type="email"], select { background: #000; color: #00ff00; border: 1px solid #444; padding: 8px; width: 100%; box-sizing: border-box; margin-bottom: 10px; }
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
                <div class="box-title">📝 Đăng ký tài khoản</div>
                <div class="box-body">
                    <form method="POST" action="/register">
                        <label style="color:#00ff00;">Tên đăng nhập:<span style="color:red">*</span></label>
                        <input type="text" name="username" required placeholder="Gồm 5 - 32 ký tự (a-z, 0-9, _, -)">

                        <label style="color:#00ff00;">Tên hiển thị:<span style="color:red">*</span></label>
                        <input type="text" name="display_name" required placeholder="Tên mọi người nhìn thấy trên wap...">

                        <label style="color:#00ff00;">E-mail:<span style="color:red">*</span></label>
                        <input type="email" name="email" required placeholder="Email dùng để lấy lại mật khẩu...">

                        <label style="color:#00ff00;">Mật khẩu:<span style="color:red">*</span></label>
                        <input type="password" name="password" required placeholder="Từ 6 đến 32 ký tự...">

                        <label style="color:#00ff00;">Chọn giới tính:<span style="color:red">*</span></label>
                        <select name="gender">
                            <option value="Nam">Nam</option>
                            <option value="Nữ">Nữ</option>
                            <option value="Khác">Khác</option>
                        </select>

                        <button type="submit" style="margin-top: 10px;">Đăng ký</button>
                    </form>
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
        const displayName = formData.get('display_name');
        const email = formData.get('email');
        const password = formData.get('password');
        const gender = formData.get('gender');

        try {
            // Mặc định tài khoản mới đăng ký có Level 1 và 1000 Xu
            await env.DB.prepare(
                "INSERT INTO users (username, display_name, email, password, gender, role, level, coins) VALUES (?, ?, ?, ?, ?, 'Thành Viên', 1, 1000)"
            ).bind(username, displayName, email, password, gender).run();

            return new Response(`Đăng ký thành công! <a href="/login">Bấm vào đây để đăng nhập</a>`, {
                headers: { 'Content-Type': 'text/html;charset=UTF-8' }
            });
        } catch (e) {
            return new Response(`Tên đăng nhập hoặc Email đã tồn tại! <a href="/register">Quay lại đăng ký</a>`, {
                status: 400,
                headers: { 'Content-Type': 'text/html;charset=UTF-8' }
            });
        }
    }
}
