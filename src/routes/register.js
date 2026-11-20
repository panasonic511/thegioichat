function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

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
        const username = String(formData.get('username') ?? '').trim();
        const displayName = String(formData.get('display_name') ?? '').trim();
        const email = String(formData.get('email') ?? '').trim().toLowerCase();
        const password = String(formData.get('password') ?? '');
        const gender = String(formData.get('gender') ?? 'Nam').trim() || 'Nam';

        if (!username || !displayName || !email || !password) {
            return new Response(`Vui lòng nhập đầy đủ các trường bắt buộc! <a href="/register">Quay lại đăng ký</a>`, {
                status: 400,
                headers: { 'Content-Type': 'text/html;charset=UTF-8' }
            });
        }

        try {
            // Mặc định tài khoản mới đăng ký có Level 1 và 1000 Xu
            await env.DB.prepare(
                "INSERT INTO users (username, display_name, email, password, gender, role, level, coins) VALUES (?, ?, ?, ?, ?, 'Thành Viên', 1, 1000)"
            ).bind(username, displayName, email, password, gender).run();

            return new Response(`Đăng ký thành công! <a href="/login">Bấm vào đây để đăng nhập</a>`, {
                headers: { 'Content-Type': 'text/html;charset=UTF-8' }
            });
        } catch (e) {
            const errMsg = String(e?.message || e || '');
            if (errMsg.includes('UNIQUE constraint failed') || errMsg.includes('SQLITE_CONSTRAINT_UNIQUE')) {
                return new Response(`Tên đăng nhập hoặc Email đã tồn tại! <a href="/register">Quay lại đăng ký</a>`, {
                    status: 400,
                    headers: { 'Content-Type': 'text/html;charset=UTF-8' }
                });
            }

            return new Response(`Lỗi đăng ký (${escapeHtml(errMsg)}). <a href="/register">Quay lại đăng ký</a>`, {
                status: 500,
                headers: { 'Content-Type': 'text/html;charset=UTF-8' }
            });
        }
    }
}
```[cite: 24]

### Kiểm tra sau khi cập nhật
* Thử submit form `/register` với đầy đủ thông tin và thử cố tình bỏ trống `email` (qua curl/POST trực tiếp)[cite: 24].
* **Dấu hiệu thành công:** khi có `email` hợp lệ và chưa trùng thì tạo tài khoản thành công; khi thiếu `email` thì trả về thông báo nhập thiếu trường thay vì văng lỗi `D1_ERROR: NOT NULL constraint failed: users.email`[cite: 23].

Lưu ý thêm: trong ảnh stack trace có dòng `at async handleRegister (worker.js:1139:22)`[cite: 23]—nếu bạn đang gộp `handleRegister` chung vào file `worker.js` thay vì tách ở `routes/register.js`, hãy nhớ thay đúng hàm `handleRegister` tại `worker.js` nhé. Bạn có đang đặt `handleRegister` trực tiếp trong `worker.js` không?
