export async function handleProfile(request, env) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('user') || '1'; // Mặc định hoặc theo ID truyền vào

  const html = `<!DOCTYPE html>
  <html lang="vi">
  <head><meta charset="UTF-8"><title>Hồ sơ cá nhân - ID: ${userId}</title>
  <style>body { background: #000; color: #fff; font-family: Tahoma; padding: 8px; font-size: 12px; }
  .profile-box { background: #111; border: 1px solid #333; padding: 10px; margin-bottom: 8px; }</style>
  </head>
  <body>
      <div style="text-align: right; margin-bottom: 5px;"><a href="/">[ Về trang chủ ]</a></div>
      <div class="profile-box">
          <h3 style="color: #00ffcc; margin-top: 0;">Hồ sơ của tôi (ID: ${userId})</h3>
          <p><b>Chức vụ:</b> Thành viên | <b>Level:</b> 126</p>
          <p><b>Tiền xu:</b> <span style="color: #ffcc00;">29,021,591 xu</span></p>
          <p><b>Tỉnh thành:</b> Hồ Chí Minh</p>
          <p><b>Ngày đăng ký:</b> 13.11.2018</p>
      </div>
  </body>
  </html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}
