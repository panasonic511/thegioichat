export async function handleIndex(request, env, user, renderLayout) {
    // Lấy danh sách thông báo hệ thống mới nhất từ CSDL D1
    let announcements = { results: [] };
    try {
        announcements = await env.DB.prepare(`
            SELECT announcements.*, users.display_name, users.role, users.level 
            FROM announcements 
            JOIN users ON announcements.user_id = users.id 
            ORDER BY announcements.id DESC LIMIT 5
        `).all();
    } catch (e) {
        // Trường hợp bảng chưa khởi tạo dữ liệu
    }

    const content = `
    <!-- Phòng chát -->
    <div class="box">
        <div class="box-title" style="color: #00ff00;">🟢 Phòng chát</div>
        <div class="box-content" style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; text-align: center;">
            <a href="/game" class="chat-room-btn">🎉 Bữa tiệc <span style="color:#aaa; font-size:11px;">(2)</span></a>
            <a href="/game" class="chat-room-btn">🎮 Trò chơi <span style="color:#aaa; font-size:11px;">(6)</span></a>
            <a href="/game" class="chat-room-btn">💬 Giao lưu <span style="color:#aaa; font-size:11px;">(0)</span></a>
            <a href="/game" class="chat-room-btn">🔥 Chát room <span style="color:#aaa; font-size:11px;">(0)</span></a>
        </div>
    </div>

    <!-- Menu hệ thống & Đồng hồ -->
    <div class="box">
        <div class="box-title">≡ Menu</div>
        <div class="box-content" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #222; padding-bottom: 8px; margin-bottom: 8px;">
            <div>
                <div id="live-clock" style="font-size: 16px; font-weight: bold; color: #fff;">03:17</div>
                <div id="live-date" style="font-size: 11px; color: #888;">Thứ Tư - 18/11/2026</div>
            </div>
            <div style="text-align: right; font-size: 12px;">
                <a href="/profile">👤 Trang cá nhân</a><br>
                <a href="/users/search">🔍 Tìm kiếm ID</a><br>
                <a href="/profile/level">📊 Bảng xếp hạng</a>
            </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; font-size: 13px;">
            <div>
                <div style="margin-bottom: 5px;"><a href="/forum">💬 Diễn đàn</a></div>
                <div style="margin-bottom: 5px;"><a href="/profile/level">📊 Bảng cấp độ</a></div>
                <div><a href="/stats">📊 Thống kê</a></div>
            </div>
            <div>
                <div style="margin-bottom: 5px;"><a href="/friends">👥 Bạn bè</a></div>
                <div style="margin-bottom: 5px;"><a href="/settings">⚙️ Cài đặt</a></div>
                <div><a href="/game">🎮 Khu giải trí [24]</a></div>
            </div>
        </div>
    </div>

    <!-- Thông báo hệ thống -->
    <div class="box">
        <div class="box-title" style="display: flex; justify-content: space-between; align-items: center;">
            <span>📢 Thông báo</span>
            <a href="/" style="font-size: 11px; color: #ffcc00;">🔄 Làm mới</a>
        </div>
        <div class="box-content" style="text-align: center; font-size: 12px;">
            <div style="color: #ff55ff; margin-bottom: 8px; font-weight: bold;">
                ✨ ═══════ •💖• ═══════ ✨<br>
                CHÀO MỪNG ĐẾN VỚI WAP THẾ GIỚI CHAT<br>
                CHÚC M.N ONLINE VUI VẺ
            </div>
            
            ${announcements.results.length === 0 ? `
                <div style="border-top: 1px dashed #333; padding-top: 8px; margin-top: 8px; text-align: left;">
                    <span style="color: #ffcc00;">[Lv.130] <span style="color: #ff5555;">Chủ Wap</span> <b>Chủ Wap</b> · Vừa xong</span>
                    <div style="color: #fff; margin-top: 3px;">Hệ thống Thế Giới Chat đã hoạt động ổn định. Chúc mọi người tham gia vui vẻ!</div>
                </div>
            ` : announcements.results.map(a => `
                <div style="border-top: 1px dashed #333; padding-top: 8px; margin-top: 8px; text-align: left;">
                    <span style="color: #ffcc00;">[Lv.${a.level}] <span style="color: #ff5555;">${a.role}</span> <b>${a.display_name}</b> · ${a.created_at}</span>
                    <div style="color: #fff; margin-top: 3px;">${a.content}</div>
                </div>
            `).join('')}
        </div>
    </div>

    <style>
        .chat-room-btn {
            background: #1a1a1a;
            border: 1px solid #333;
            color: #00ff00;
            padding: 8px;
            text-decoration: none;
            border-radius: 3px;
            font-size: 13px;
            display: block;
        }
        .chat-room-btn:hover {
            background: #222;
            border-color: #00ff00;
        }
    </style>

    <script>
        // Đồng hồ thời gian thực giống mẫu
        function updateClock() {
            const now = new Date();
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            document.getElementById('live-clock').innerText = hours + ':' + minutes;
        }
        setInterval(updateClock, 1000);
    </script>
    `;

    return new Response(renderLayout('Trang chủ', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
