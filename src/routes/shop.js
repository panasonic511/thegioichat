export async function handleShop(request, env) {
  const html = `<!DOCTYPE html>
  <html lang="vi">
  <head><meta charset="UTF-8"><title>Cửa hàng - Thế Giới Chat</title>
  <style>body { background: #000; color: #fff; font-family: Tahoma; padding: 8px; font-size: 12px; }
  .shop-item { background: #111; border: 1px solid #333; padding: 8px; margin-bottom: 6px; }</style>
  </head>
  <body>
      <h2 style="color: #ffcc00; text-align: center;">Cửa Hàng Vật Phẩm</h2>
      <div class="shop-item">🪙 <b>Nạp Xu:</b> Dùng cho game và tiện ích</div>
      <div class="shop-item">🖼️ <b>Khung avatar:</b> Làm nổi bật ảnh đại diện</div>
      <div class="shop-item">✨ <b>Hiệu ứng tên:</b> Gradient, cầu vồng và ánh vàng</div>
      <div style="text-align: center; margin-top: 15px;"><a href="/">[ Quay lại trang chủ ]</a></div>
  </body>
  </html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}
