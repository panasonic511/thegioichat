import { renderUser } from '../worker.js';

export async function handleGameLudo(request, env, user, renderLayout, url) {
    const path = url.pathname;

    // Khởi tạo bảng cơ sở dữ liệu cho Ludo (Phòng chơi & Chat phòng)
    try {
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS ludo_rooms (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                room_name TEXT,
                host_id INTEGER,
                host_name TEXT,
                bet_amount INTEGER DEFAULT 0,
                status TEXT DEFAULT 'waiting',
                created_at TEXT
            )
        `).run();

        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS ludo_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                room_id INTEGER,
                user_id INTEGER,
                username TEXT,
                message TEXT,
                created_at TEXT
            )
        `).run();
    } catch (e) {}

    // 1. Xử lý tạo phòng mới (POST /game/ludo/create)
    if (path === '/game/ludo/create' && request.method === 'POST') {
        try {
            const formData = await request.formData();
            const roomName = formData.get('room_name') || `Phòng của ${user.display_name || user.username}`;
            const betAmount = parseInt(formData.get('bet_amount') || '0', 10);

            const res = await env.DB.prepare(
                "INSERT INTO ludo_rooms (room_name, host_id, host_name, bet_amount, status, created_at) VALUES (?, ?, ?, ?, 'waiting', datetime('now'))"
            ).bind(roomName, user.id, user.display_name || user.username, betAmount).run();

            const roomId = res.meta.last_row_id;
            return Response.redirect(new URL(`/game/ludo/room?id=${roomId}`, request.url), 302);
        } catch (e) {
            return Response.redirect(new URL('/game/ludo', request.url), 302);
        }
    }

    // 2. Giao diện bên trong phòng chơi (GET /game/ludo/room?id=...)
    if (path === '/game/ludo/room') {
        const roomId = url.searchParams.get('id');
        if (!roomId) return Response.redirect(new URL('/game/ludo', request.url), 302);

        let room = null;
        try {
            room = await env.DB.prepare("SELECT * FROM ludo_rooms WHERE id = ?").bind(roomId).first();
        } catch (e) {}

        if (!room) {
            return new Response("Phòng chơi không tồn tại hoặc đã bị giải tán.", { status: 404 });
        }

        // Xử lý gửi tin nhắn chat trong phòng
        if (request.method === 'POST') {
            try {
                const formData = await request.formData();
                const chatMsg = formData.get('chat_message');
                if (chatMsg && chatMsg.trim() !== '') {
                    await env.DB.prepare(
                        "INSERT INTO ludo_messages (room_id, user_id, username, message, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
                    ).bind(roomId, user.id, user.display_name || user.username, chatMsg.trim()).run();
                }
                if (request.headers.get('X-Requested-With') === 'XMLHttpRequest') {
                    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
                }
            } catch (e) {}
            return Response.redirect(new URL(`/game/ludo/room?id=${roomId}`, request.url), 302);
        }

        // Lấy lịch sử chat trong phòng
        let roomMessages = [];
        try {
            const msgs = await env.DB.prepare("SELECT * FROM ludo_messages WHERE room_id = ? ORDER BY id ASC LIMIT 50").bind(roomId).all();
            roomMessages = msgs.results || [];
        } catch (e) {}

        const content = `
        <div class="box">
            <div class="box-title" style="display: flex; justify-content: space-between; align-items: center;">
                <span>🎲 Phòng Ludo: ${room.room_name}</span>
                <span style="font-size: 11px; color: #ffcc00;">Cược: ${room.bet_amount.toLocaleString()} xu</span>
            </div>
            <div class="box-content" style="padding: 10px; text-align: center;">
                <div style="font-size: 13px; color: #aaa; margin-bottom: 8px;">
                    👑 Chủ phòng: <b style="color: #00ff00;">${room.host_name}</b> | Trạng thái: <span style="color: #00ff00;">Đang chơi</span>
                </div>

                <!-- Giao diện Bàn cờ Ludo tiêu chuẩn 4 góc màu (Đỏ, Xanh lá, Vàng, Xanh dương) -->
                <div style="display: inline-block; background: #051c05; border: 3px solid #333; padding: 6px; border-radius: 6px; max-width: 100%; overflow-x: auto;">
                    <svg viewBox="0 0 500 500" style="width: 320px; height: 320px; max-width: 100%; display: block; margin: 0 auto; background: #fff;">
                        <!-- Khu vực 4 nhà màu -->
                        <rect x="0" y="0" width="200" height="200" fill="#cc0000" />
                        <rect x="300" y="0" width="200" height="200" fill="#00aa00" />
                        <rect x="0" y="300" width="200" height="200" fill="#0033cc" />
                        <rect x="300" y="300" width="200" height="200" fill="#ffcc00" />

                        <!-- Các ô chuồng trắng bên trong nhà -->
                        <circle cx="70" cy="70" r="18" fill="#fff" /><circle cx="130" cy="70" r="18" fill="#fff" />
                        <circle cx="70" cy="130" r="18" fill="#fff" /><circle cx="130" cy="130" r="18" fill="#fff" />

                        <circle cx="370" cy="70" r="18" fill="#fff" /><circle cx="430" cy="70" r="18" fill="#fff" />
                        <circle cx="370" cy="130" r="18" fill="#fff" /><circle cx="430" cy="130" r="18" fill="#fff" />

                        <circle cx="70" cy="370" r="18" fill="#fff" /><circle cx="130" cy="370" r="18" fill="#fff" />
                        <circle cx="70" cy="430" r="18" fill="#fff" /><circle cx="130" cy="430" r="18" fill="#fff" />

                        <circle cx="370" cy="370" r="18" fill="#fff" /><circle cx="430" cy="370" r="18" fill="#fff" />
                        <circle cx="370" cy="430" r="18" fill="#fff" /><circle cx="430" cy="430" r="18" fill="#fff" />

                        <!-- Lộ trình đường đi chữ thập -->
                        <!-- Đường ngang trái & phải -->
                        <rect x="0" y="200" width="200" height="100" fill="#eee" stroke="#ccc" />
                        <rect x="300" y="200" width="200" height="100" fill="#eee" stroke="#ccc" />
                        <!-- Đường dọc trên & dưới -->
                        <rect x="200" y="0" width="100" height="200" fill="#eee" stroke="#ccc" />
                        <rect x="200" y="300" width="100" height="200" fill="#eee" stroke="#ccc" />

                        <!-- Vạch kẻ ô đường đi -->
                        <line x1="0" y1="233" x2="200" y2="233" stroke="#ccc" stroke-dasharray="5,5"/>
                        <line x1="0" y1="266" x2="200" y2="266" stroke="#ccc" stroke-dasharray="5,5"/>
                        <line x1="300" y1="233" x2="500" y2="233" stroke="#ccc" stroke-dasharray="5,5"/>
                        <line x1="300" y1="266" x2="500" y2="266" stroke="#ccc" stroke-dasharray="5,5"/>

                        <line x1="233" y1="0" x2="233" y2="200" stroke="#ccc" stroke-dasharray="5,5"/>
                        <line x1="266" y1="0" x2="266" y2="200" stroke="#ccc" stroke-dasharray="5,5"/>
                        <line x1="233" y1="300" x2="233" y2="500" stroke="#ccc" stroke-dasharray="5,5"/>
                        <line x1="266" y1="300" x2="266" y2="500" stroke="#ccc" stroke-dasharray="5,5"/>

                        <!-- Tam giác trung tâm đích đến -->
                        <polygon points="250,250 200,200 200,300" fill="#cc0000" />
                        <polygon points="250,250 200,200 300,200" fill="#00aa00" />
                        <polygon points="250,250 300,200 300,300" fill="#ffcc00" />
                        <polygon points="250,250 200,300 300,300" fill="#0033cc" />
                    </svg>
                </div>

                <!-- Bảng tung xúc xắc & điều khiển -->
                <div style="margin-top: 12px; background: #111; padding: 10px; border-radius: 6px; border: 1px solid #333;">
                    <div id="diceResult" style="font-size: 24px; font-weight: bold; color: #ffcc00; margin-bottom: 6px;">🎲 [ ⚀ ]</div>
                    <button onclick="rollDice()" class="btn" style="background: #0055ff; padding: 8px 16px; font-size: 14px; font-weight: bold; cursor: pointer;">Tung Xúc Xắc</button>
                </div>

                <!-- Khung Chat trong phòng -->
                <div style="margin-top: 12px; text-align: left;">
                    <div style="font-size: 12px; color: #888; margin-bottom: 4px;">💬 Trò chuyện phòng:</div>
                    <div id="roomChatBox" style="height: 120px; overflow-y: scroll; background: #000; border: 1px solid #333; padding: 8px; font-size: 12px; display: flex; flex-direction: column; gap: 4px; margin-bottom: 6px;">
                        ${roomMessages.length === 0 ? '<div style="color: #555; text-align: center; margin-top: 40px;">Chưa có tin nhắn nào trong phòng.</div>' : 
                            roomMessages.map(m => `<div><b style="color: #00ff00;">${m.username}:</b> <span style="color: #fff;">${m.message}</span></div>`).join('')}
                    </div>
                    <form id="roomChatForm" onsubmit="sendRoomChat(event)" style="display: flex; gap: 6px;">
                        <input type="text" name="chat_message" id="chatInput" placeholder="Nhập chat..." autocomplete="off" style="flex: 1; background: #000; color: #fff; border: 1px solid #444; padding: 6px; font-size: 12px; border-radius: 4px;" required>
                        <button type="submit" class="btn" style="background: #00aa00; padding: 6px 12px; font-size: 12px;">Gửi</button>
                    </form>
                </div>

                <div style="margin-top: 12px;">
                    <a href="/game/ludo" class="btn" style="background: #aa0000; padding: 6px 12px; font-size: 12px;">⬅ Thoát phòng</a>
                </div>
            </div>
        </div>

        <script>
            const chatBox = document.getElementById('roomChatBox');
            chatBox.scrollTop = chatBox.scrollHeight;

            function rollDice() {
                const dices = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
                const rand = Math.floor(Math.random() * 6);
                document.getElementById('diceResult').innerText = '🎲 [ ' + dices[rand] + ' ] (Số ' + (rand + 1) + ')';
            }

            async function sendRoomChat(event) {
                event.preventDefault();
                const input = document.getElementById('chatInput');
                if (!input.value.trim()) return;

                const formData = new FormData(document.getElementById('roomChatForm'));
                try {
                    const res = await fetch(window.location.href, {
                        method: 'POST',
                        headers: { 'X-Requested-With': 'XMLHttpRequest' },
                        body: formData
                    });
                    if (res.ok) {
                        input.value = '';
                        // Tải lại nhanh danh sách chat
                        location.reload();
                    }
                } catch (e) {
                    document.getElementById('roomChatForm').submit();
                }
            }
        </script>
        `;

        return new Response(renderLayout(`Phòng Ludo: ${room.room_name}`, content, user), {
            headers: { 'Content-Type': 'text/html;charset=UTF-8' }
        });
    }

    // 3. Sảnh danh sách phòng Ludo (GET /game/ludo)
    let rooms = [];
    try {
        const r = await env.DB.prepare("SELECT * FROM ludo_rooms ORDER BY id DESC LIMIT 20").all();
        rooms = r.results || [];
    } catch (e) {}

    const content = `
    <div class="box">
        <div class="box-title" style="display: flex; justify-content: space-between; align-items: center;">
            <span>🎲 Game Ludo (Cờ cá ngựa)</span>
            <a href="#createRoomModal" onclick="document.getElementById('createRoomForm').style.display='block'" class="btn" style="background: #00aa00; font-size: 11px; padding: 4px 8px;">➕ Tạo phòng</a>
        </div>
        <div class="box-content" style="padding: 10px;">
            
            <!-- Form ẩn để tạo phòng -->
            <div id="createRoomForm" style="display: none; background: #111; border: 1px solid #444; padding: 10px; border-radius: 6px; margin-bottom: 12px;">
                <h4 style="margin-bottom: 8px; font-size: 13px; color: #ffcc00;">Tạo Phòng Ludo Mới</h4>
                <form action="/game/ludo/create" method="POST" style="display: flex; flex-direction: column; gap: 8px;">
                    <div>
                        <label style="font-size: 11px; color: #aaa;">Tên phòng:</label>
                        <input type="text" name="room_name" value="Phòng của ${user.display_name || user.username}" style="width: 100%; background: #000; color: #fff; border: 1px solid #444; padding: 6px; font-size: 12px; border-radius: 4px;" required>
                    </div>
                    <div>
                        <label style="font-size: 11px; color: #aaa;">Tiền cược (Xu):</label>
                        <input type="number" name="bet_amount" value="0" min="0" style="width: 100%; background: #000; color: #fff; border: 1px solid #444; padding: 6px; font-size: 12px; border-radius: 4px;" required>
                    </div>
                    <div style="display: flex; gap: 6px;">
                        <button type="submit" class="btn" style="background: #0055ff; padding: 6px 12px; font-size: 12px;">Tạo ngay</button>
                        <button type="button" onclick="document.getElementById('createRoomForm').style.display='none'" class="btn" style="background: #444; padding: 6px 12px; font-size: 12px;">Hủy</button>
                    </div>
                </form>
            </div>

            <!-- Danh sách phòng chơi -->
            <div style="display: flex; flex-direction: column; gap: 6px;">
                ${rooms.length === 0 ? '<div style="color: #777; text-align: center; padding: 30px;">Chưa có phòng Ludo nào được tạo. Hãy tạo phòng mới để bắt đầu!</div>' : 
                    rooms.map(room => `
                    <div style="background: #111; border: 1px solid #333; padding: 10px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-size: 14px; font-weight: bold; color: #ffcc00; margin-bottom: 2px;">🔒 ${room.room_name}</div>
                            <div style="font-size: 11px; color: #888;">Chủ phòng: <span style="color: #00ff00;">${room.host_name}</span> | Cược: ${room.bet_amount.toLocaleString()} xu</div>
                        </div>
                        <div>
                            <a href="/game/ludo/room?id=${room.id}" class="btn" style="background: #0055ff; padding: 6px 14px; font-size: 12px; font-weight: bold;">Vào chơi</a>
                        </div>
                    </div>
                `).join('')}
            </div>

            <div style="text-align: center; margin-top: 15px;">
                <a href="/game">⬅️ Quay lại Khu giải trí</a>
            </div>
        </div>
    </div>
    `;

    return new Response(renderLayout('Game Ludo - Sảnh chờ', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
