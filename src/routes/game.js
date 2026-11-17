export async function handleGame(request, env) {
  const html = `<!DOCTYPE html>
  <html lang="vi">
  <head><meta charset="UTF-8"><title>Khu giải trí - Thế Giới Chat</title>
  <style>body { background: #000; color: #fff; font-family: Tahoma; padding: 8px; font-size: 12px; }</style>
  </head>
  <body>
      <h2 style="color: #00ff00; text-align: center;">🎮 Khu Giải Trí & Mini Game</h2>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; text-align: center;">
          <div style="background: #111; border: 1px solid #333; padding: 10px;">🎲 Ludo</div>
          <div style="background: #111; border: 1px solid #333; padding: 10px;">♟️ Cờ tướng</div>
          <div style="background: #111; border: 1px solid #333; padding: 10px;">🌾 Nông trại</div>
      </div>
      <div style="text-align: center; margin-top: 15px;"><a href="/">[ Về trang chủ ]</a></div>
  </body>
  </html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}
