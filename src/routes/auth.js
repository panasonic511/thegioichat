// Phân cấp bậc và chức vụ chuẩn yêu cầu:
// Chủ Wap: Level 130
// Admin: Level 125
// Mod: Level 120
// Thành Viên: < 120 (Chỉ thành viên không dùng được tính năng quản lý cấp cao)

export async function handleLogin(request, env) {
  if (request.method === 'POST') {
    // Xử lý logic đăng nhập (hỗ trợ ID, Username, Gmail)
    return new Response(JSON.stringify({ success: true, redirect: '/' }), { headers: { 'Content-Type': 'application/json' } });
  }

  const html = `<!DOCTYPE html>
  <html lang="vi">
  <head>
      <meta charset="UTF-8"><title>Đăng nhập - Thế Giới Chat</title>
      <style>body { background: #000; color: #fff; font-family: Tahoma; padding: 20px; }</style>
  </head>
  <body>
      <h2 style="color: #ffcc00; text-align: center;">Đăng Nhập Hệ Thống</h2>
      <div style="max-width: 300px; margin: 0 auto; background: #111; padding: 15px; border: 1px solid #333;">
          <form method="POST">
              <label>Tên tài khoản / ID / Gmail:</label><br>
              <input type="text" name="login_identity" style="width: 100%; background: #000; color: #fff; border: 1px solid #444; margin: 5px 0 10px 0; padding: 5px;"><br>
              <label>Mật khẩu:</label><br>
              <input type="password" name="password" style="width: 100%; background: #000; color: #fff; border: 1px solid #444; margin: 5px 0 10px 0; padding: 5px;"><br>
              <button type="submit" style="width: 100%; background: #0055ff; color: #fff; padding: 8px; border: none; font-weight: bold;">Đăng nhập</button>
          </form>
          <div style="text-align: center; margin-top: 10px; font-size: 11px;">
              <a href="/register">Chưa có tài khoản? Đăng ký ngay</a>
          </div>
      </div>
  </body>
  </html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

export async function handleRegister(request, env) {
  const html = `<!DOCTYPE html>
  <html lang="vi">
  <head><meta charset="UTF-8"><title>Đăng ký tài khoản</title>
  <style>body { background: #000; color: #fff; font-family: Tahoma; padding: 20px; }</style>
  </head>
  <body>
      <h2 style="color: #00ff00; text-align: center;">Đăng ký tài khoản mới</h2>
      <div style="max-width: 320px; margin: 0 auto; background: #111; padding: 15px; border: 1px solid #333;">
          <form method="POST">
              <label>Tên đăng nhập:*</label><br><input type="text" name="username" style="width: 100%; background: #000; color: #fff; border: 1px solid #444; margin-bottom: 8px;"><br>
              <label>Tên hiển thị:*</label><br><input type="text" name="display_name" style="width: 100%; background: #000; color: #fff; border: 1px solid #444; margin-bottom: 8px;"><br>
              <label>E-mail:*</label><br><input type="email" name="email" style="width: 100%; background: #000; color: #fff; border: 1px solid #444; margin-bottom: 8px;"><br>
              <label>Mật khẩu:*</label><br><input type="password" name="password" style="width: 100%; background: #000; color: #fff; border: 1px solid #444; margin-bottom: 8px;"><br>
              <button type="submit" style="width: 100%; background: #0055ff; color: #fff; padding: 8px; border: none; font-weight: bold;">Đăng ký</button>
          </form>
      </div>
  </body>
  </html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

export async function handleLogout(request, env) {
  return Response.redirect(new URL('/', request.url), 302);
}
