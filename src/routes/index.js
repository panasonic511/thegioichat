import { handleLogin } from './auth.js';

export async function handleIndex(request, env, user, renderLayout) {
    // Nếu người dùng chưa đăng nhập, hiển thị form đăng nhập trực tiếp ngay tại trang chủ
    if (!user) {
        // Xử lý nếu người dùng bấm nút gửi form đăng nhập (POST ngay tại trang chủ)
        if (request.method === 'POST') {
            return await handleLogin(request, env);
        }

        const loginContent = `
        <div class="box" style="max-width: 450px; margin: 15px auto;">
            <div class="box-title">🔒 Đăng nhập hệ thống</div>
            <div class="box-content">
                <form method="POST" action="/">
                    <label style="color:#00ff00; display:block; margin-bottom:4px;">Tên tài khoản / ID / Gmail:</label>
                    <input type="text" name="username" required placeholder="Nhập tên đăng nhập hoặc email..." style="background: #000; color: #00ff00; border: 1px solid #444; padding: 8px; width: 100%; box-sizing: border-box; margin-bottom: 10px; font-family: Arial, sans-serif;">
                    
                    <label style="color:#00ff00; display:block; margin-bottom:4px;">Nhập mật khẩu:</label>
                    <input type="password" name="password" required placeholder="Nhập mật khẩu..." style="background: #000; color: #00ff00; border: 1px solid #444; padding: 8px; width: 100%; box-sizing: border-box; margin-bottom: 10px; font-family: Arial, sans-serif;">
                    
                    <div style="margin-bottom: 12px; font-size: 11px;">
                        <input type="checkbox" name="remember" style="width: auto;"> Ghi nhớ | <a href="/forgot" style="color:#ffcc00;">Quên mật khẩu</a>
                    </div>
                    
                    <button type="submit" class="btn" style="width: 100%; padding: 8px; background: #0055ff; color: #fff; border: none; font-weight: bold; cursor: pointer;">Đăng nhập</button>
                </form>
                <div style="text-align: center; margin-top: 12px; font-size: 11px;">
                    Hoặc chưa có tài khoản? <a href="/register" style="color: #ff5555; font-weight: bold;">Đăng kí ngay</a>
                </div>
            </div>
        </div>
        `;
        return new Response(renderLayout('Đăng nhập', loginContent, user), {
            headers: { 'Content-Type': 'text/html;charset=UTF-8' }
        });
    }

    // Nếu ĐÃ ĐĂNG NHẬP: Hiển thị giao diện phòng chat và menu đầy đủ bên trong
    let announcements = { results: [] };
    try {
        announcements = await env.DB.prepare(`
            SELECT announcements.*, users.display_name, users.role, users.level 
            FROM announcements 
            JOIN users ON announcements.user_id = users.id 
            ORDER BY announcements.id DESC 
            LIMIT 5
        `).all();
    } catch (e) {
        announcements = { results: [] };
    }

    const content = `
    <!-- Phòng chát -->
    <div class="box">
        <div class="box-title">🟢 Phòng chát</div>
        <div class="box-content" style="padding: 6px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                <a href="#" class="btn" style="text-align: left; padding: 8px; background: #141414; border: 1px solid #333;">🎉 Bữa tiệc <span style="color:#888;">(2)</span></a>
                <a href="#" class="btn" style="text-align: left; padding: 8px; background: #141414; border: 1px solid #333;">🎮 Trò chơi <span style="color:#888;">(6)</span></a>
                <a href="#" class="btn" style="text-align: left; padding: 8px; background: #141414; border: 1px solid #333;">💬 Giao lưu <span style="color:#888;">(0)</span></a>
                <a href="#" class="btn" style="text-align: left; padding: 8px; background: #141414; border: 1px solid #333;">🔥 Chát room <span style="color:#888;">(0)</span></a>
            </div>
        </div>
    </div>

    <!-- Menu hệ thống -->
    <div class="box">
        <div class="box-title">≡ Menu</div>
        <div class="box-content">
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #222; padding-bottom: 6px; margin-bottom: 6px; font-size: 11px; color: #aaa;">
                <div>
                    <b style="color: #fff; font-size: 13px;">04:24</b><br>
                    Thứ Tư - 18/11/2026
                </div>
                <div style="text-align: right; line-height: 1.6;">
                    👤 <a href="/profile">Trang cá nhân</a><br>
                    🔍 <a href="#">Tìm kiếm ID</a><br>
                    📊 <a href="#">Bảng xếp hạng</a>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px;">
                <div>💬 <a href="#">Diễn đàn</a></div>
                <div>👥 <a href="#">Bạn bè</a></div>
                <div>📊 <a href="/profile/level">Bảng cấp độ</a></div>
                <div>⚙️ <a href="#">Cài đặt</a></div>
                <div>📈 <a href="#">Thống kê</a></div>
                <div>🎮 <a href="/game">Khu giải trí [24]</a></div>
            </div>
        </div>
    </div>

    <!-- Thông báo hệ thống -->
    <div class="box">
        <div class="box-title" style="display: flex; justify-content: space-between; align-items: center;">
            <span>📢 Thông báo</span>
            <a href="/" style="font-size: 10px; color: #ffcc00;">🔄 Làm mới</a>
        </div>
        <div class="box-content" style="font-size: 11px;">
            <div style="text-align: center; color: #ff55ff; margin-bottom: 8px; font-weight: bold;">
                ✨ ═══════ • 💖 • ═══════ ✨<br>
                CHÀO MỪNG ĐẾN VỚI WAP THẾ GIỚI CHAT<br>
                CHÚC M.N ONLINE VUI VẺ
            </div>
            <hr style="border: 0; border-top: 1px dashed #333; margin: 6px 0;">
            
            ${announcements.results.length === 0 ? '<div style="color: #888; text-align: center;">Chưa có thông báo nào từ quản trị viên.</div>' : 
                announcements.results.map(item => `
                <div style="margin-bottom: 6px;">
                    <span style="color: #ffcc00;">[Lv.${item.level}]</span> <b style="color: #ff5555;">${item.display_name}</b> <span style="color: yellow;">(${item.role})</span> · <span style="color: #888; font-size: 10px;">Vừa xong</span>
                    <div style="color: #fff; margin-top: 2px;">${item.content}</div>
                </div>
            `).join('')}
        </div>
    </div>
    <div style="text-align: center;"><a href="/logout" style="color: #ff5555;">🚪 Đăng xuất tài khoản</a></div>
    `;

    return new Response(renderLayout('Trang chủ', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
