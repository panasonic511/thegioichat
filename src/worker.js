import { handleLogin, handleRegister, handleLogout } from './routes/auth.js';
import { handleProfile } from './routes/profile.js';
import { handleShop } from './routes/shop.js';
import { handleGame } from './routes/game.js';
import { handleFeed } from './routes/feed.js';
import { handleMailBox, handleNotifications, apiSendNotification, apiSendMessage } from './routes/chat.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Định tuyến theo yêu cầu của bạn
    if (path === '/' || path === '/index') {
      return handleHome(request, env);
    } else if (path === '/login') {
      return handleLogin(request, env);
    } else if (path === '/register') {
      return handleRegister(request, env);
    } else if (path === '/logout') {
      return handleLogout(request, env);
    } else if (path.startsWith('/profile')) {
      return handleProfile(request, env);
    } else if (path === '/shop') {
      return handleShop(request, env);
    } else if (path === '/game') {
      return handleGame(request, env);
    } else if (path === '/users/feed') {
      return handleFeed(request, env);
    } else if (path === '/mail/box') {
      return handleMailBox(request, env);
    } else if (path === '/mail/notification') {
      return handleNotifications(request, env);
    } 
    // API Endpoints cho Realtime không cần load lại trang
    else if (path === '/api/send-notification' && request.method === 'POST') {
      return apiSendNotification(request, env);
    } else if (path === '/api/send-message' && request.method === 'POST') {
      return apiSendMessage(request, env);
    }

    return new Response('404 - Không tìm thấy trang', { status: 404 });
  }
};

// Hàmrender trang Chủ (Home) chuẩn giao diện WAP nền đen
async function handleHome(request, env) {
  // Lấy danh sách thông báo từ DB
  const { results: notifs } = await env.DB.prepare("SELECT notifications.*, users.display_name, users.role FROM notifications JOIN users ON notifications.user_id = users.id ORDER BY id DESC LIMIT 5").all();
  
  let notifHtml = notifs.map(n => `
    <div style="border-bottom: 1px dashed #333; padding: 6px 0; font-size: 13px;">
      <span style="color: #ffcc00; font-weight: bold;">[${n.role}]</span> 
      <a href="/profile?user=${n.user_id}" style="color: #00ffcc; text-decoration: none;">${n.display_name}</a>: 
      <span style="color: #fff;">${n.content}</span>
      <div style="font-size: 10px; color: #888; text-align: right;">${n.created_at}</div>
    </div>
  `).join('');

  const html = `<!DOCTYPE html>
  <html lang="vi">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Thế Giới Chat - Wap chat, Kết bạn, Giải trí</title>
      <style>
          body { background-color: #000; color: #fff; font-family: Tahoma, Arial, sans-serif; margin: 0; padding: 0; font-size: 12px; }
          a { color: #00ffcc; text-decoration: none; }
          .header { background: linear-gradient(to bottom, #222, #000); text-align: center; padding: 10px; border-bottom: 2px solid #444; }
          .nav-bar { display: flex; justify-content: space-around; background: #111; padding: 8px 0; border-bottom: 1px solid #333; }
          .nav-bar a { color: #fff; font-weight: bold; text-align: center; font-size: 11px; }
          .container { padding: 8px; }
          .box { background: #111; border: 1px solid #333; margin-bottom: 8px; border-radius: 4px; overflow: hidden; }
          .box-header { background: #1a1a1a; color: #00ff00; padding: 6px 8px; font-weight: bold; border-bottom: 1px solid #333; }
          .box-content { padding: 8px; }
          .menu-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 6px; }
          .btn-action { background: #222; color: #fff; border: 1px solid #444; padding: 6px; text-align: center; display: block; border-radius: 3px; }
          .btn-action:hover { background: #333; }
      </style>
  </head>
  <body>
      <div class="header">
          <h2 style="margin: 0; color: #ffcc00; text-shadow: 1px 1px #333;">THẾ GIỚI CHAT</h2>
          <div style="font-size: 10px; color: #00ffcc;">Wap chat - Kết bạn - Giải trí</div>
      </div>

      <!-- Menu chính trên cùng -->
      <div class="nav-bar">
          <a href="/">🏠<br>Home</a>
          <a href="/users/online">👥<br>Trực tuyến</a>
          <a href="/users/feed">📰<br>Bảng tin</a>
          <a href="/mail/notification">🔔<br>Thông báo</a>
          <a href="/mail/box">✉️<br>Tin nhắn</a>
          <a href="#" onclick="toggleMenu()">≡<br>Menu</a>
      </div>

      <!-- Dropdown Menu -->
      <div id="sub-menu" style="display: none; background: #151515; border-bottom: 1px solid #444; padding: 8px;">
          <a href="/profile" class="btn-action" style="margin-bottom: 4px;">Trang cá nhân</a>
          <a href="/search" class="btn-action" style="margin-bottom: 4px;">Tìm kiếm nick</a>
          <a href="/friends" class="btn-action" style="margin-bottom: 4px;">Bạn bè</a>
          <a href="/shop" class="btn-action" style="margin-bottom: 4px;">Cửa hàng</a>
          <a href="/forum" class="btn-action" style="margin-bottom: 4px;">Diễn đàn</a>
          <a href="/game" class="btn-action" style="margin-bottom: 4px;">Khu giải trí</a>
          <a href="/settings" class="btn-action" style="margin-bottom: 4px;">Cài đặt</a>
          <a href="/logout" class="btn-action" style="color: #ff4444;">Đăng xuất</a>
      </div>

      <div class="container">
          <!-- Thông tin User nhanh -->
          <div class="box">
              <div class="box-content" style="display: flex; align-items: center; justify-content: space-between;">
                  <div>
                      <span style="color: #ffcc00; font-weight: bold;">👑 Long!</span> 
                      <span style="background: #222; border: 1px solid #00ff00; padding: 1px 4px; font-size: 10px; color: #00ff00;">Thành viên</span>
                  </div>
                  <div>
                      <span style="color: #ffcc00;">🪙 29,021,591</span>
                  </div>
              </div>
          </div>

          <!-- Đồng hồ & Thống kê nhanh -->
          <div class="box">
              <div class="box-content" style="text-align: center;">
                  <div id="clock" style="font-size: 18px; font-weight: bold; color: #00ffcc;">02:45 - Thứ Tư</div>
                  <div style="font-size: 10px; color: #aaa;">18/11/2026</div>
              </div>
          </div>

          <!-- Các mục theo yêu cầu giao diện -->
          <div style="display: flex; gap: 4px; margin-bottom: 8px;">
              <div class="box" style="flex: 1; margin: 0;">
                  <div class="box-content">
                      <a href="/forum">📁 Diễn đàn</a><br>
                      <a href="/profile/level">📊 Bảng cấp độ</a><br>
                      <a href="/stats">📈 Thống kê</a>
                  </div>
              </div>
              <div class="box" style="flex: 1; margin: 0;">
                  <div class="box-content">
                      <a href="/friends">👥 Bạn bè</a><br>
                      <a href="/settings">⚙️ Cài đặt</a><br>
                      <a href="/game">🎮 Khu giải trí [20]</a>
                  </div>
              </div>
          </div>

          <!-- Bảng Thông báo (Cấp độ >= 50 được đăng) -->
          <div class="box">
              <div class="box-header">📢 Thông báo hệ thống</div>
              <div class="box-content" id="notification-box">
                  ${notifHtml || 'Chưa có thông báo nào.'}
              </div>
              <div style="padding: 6px; background: #0a0a0a; border-top: 1px solid #333;">
                  <input type="text" id="notif-input" placeholder="Nhập thông báo (Yêu cầu cấp độ >= 50)..." style="width: 75%; background: #000; border: 1px solid #444; color: #fff; padding: 4px;">
                  <button onclick="postNotification()" style="width: 20%; background: #222; color: #00ffcc; border: 1px solid #444; padding: 4px;">Đăng</button>
              </div>
          </div>
      </div>

      <script>
          // Đồng hồ thời gian thực
          setInterval(() => {
              const now = new Date();
              document.getElementById('clock').innerText = now.toLocaleTimeString() + ' - ' + now.toLocaleDateString();
          }, 1000);

          function toggleMenu() {
              const menu = document.getElementById('sub-menu');
              menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
          }

          // Realtime thông báo không cần load lại trang dùng Fetch API
          async function postNotification() {
              const content = document.getElementById('notif-input').value;
              if(!content) return alert('Vui lòng nhập nội dung!');
              
              const res = await fetch('/api/send-notification', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ content, user_id: 1 }) // ID mẫu cho demo
              });
              const data = await res.json();
              if(data.success) {
                  document.getElementById('notif-input').value = '';
                  location.reload(); // Hoặc cập nhật DOM trực tiếp
              } else {
                  alert(data.error || 'Bạn không đủ quyền (Yêu cầu Level >= 50)!');
              }
          }
      </script>
  </body>
  </html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}
