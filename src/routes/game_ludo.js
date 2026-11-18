import { renderUser } from '../worker.js';

export async function handleGameLudo(request, env, user, renderLayout, url) {
    const path = url.pathname;

    // Khởi tạo cơ sở dữ liệu D1 cho phòng game và chat
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

    // 1. Tạo phòng game mới (POST /game/ludo/create)
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

    // 2. Giao diện phòng chơi (GET /game/ludo/room?id=...)
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
            <div class="box-content" style="padding: 6px; text-align: center;">
                <div style="font-size: 12px; color: #aaa; margin-bottom: 6px;">
                    👑 Chủ phòng: <b style="color: #00ff00;">${room.host_name}</b> | Đồ họa mượt mà & Âm thanh sống động
                </div>

                <!-- CÁC THẺ ÂM THANH HIỆU ỨNG CHUẨN -->
                <audio id="diceSound" src="https://raw.githubusercontent.com/jamalihassan0307/LudoVerse/main/assets/sounds/roll_the_dice.mp3" preload="auto"></audio>
                <audio id="moveSound" src="https://raw.githubusercontent.com/jamalihassan0307/LudoVerse/main/assets/sounds/move.wav" preload="auto"></audio>

                <!-- KHUNG CHƠI TRỰC TIẾP TƯƠNG THÍCH MỌI TRÌNH DUYỆT WAP -->
                <div style="width: 100%; max-width: 480px; margin: 0 auto; background: #0b2e13; border: 2px solid #444; border-radius: 6px; padding: 10px;">
                    <div style="background: #fff; border-radius: 4px; padding: 10px; text-align: center;">
                        <svg viewBox="0 0 500 500" style="width: 240px; height: 240px; background: #fff; border-radius: 4px; display: inline-block;">
                            <rect x="0" y="0" width="200" height="200" fill="#cc0000" />
                            <rect x="300" y="0" width="200" height="200" fill="#00aa00" />
                            <rect x="0" y="300" width="200" height="200" fill="#0033cc" />
                            <rect x="300" y="300" width="200" height="200" fill="#ffcc00" />
                            
                            <circle cx="70" cy="70" r="16" fill="#fff" /><text x="70" y="75" font-size="14" text-anchor="middle">🐴</text>
                            <circle cx="130" cy="70" r="16" fill="#fff" /><text x="130" y="75" font-size="14" text-anchor="middle">🐴</text>
                            <circle cx="70" cy="130" r="16" fill="#fff" /><text x="70" y="135" font-size="14" text-anchor="middle">🐴</text>
                            <circle cx="130" cy="130" r="16" fill="#fff" /><text x="130" y="135" font-size="14" text-anchor="middle">🐴</text>
                            
                            <rect x="0" y="200" width="200" height="100" fill="#eee" />
                            <rect x="300" y="200" width="200" height="100" fill="#eee" />
                            <rect x="200" y="0" width="100" height="200" fill="#eee" />
                            <rect x="200" y="300" width="100" height="200" fill="#eee" />
                        </svg>
                    </div>

                    <!-- BẢNG ĐIỀU KHIỂN XÚC XẮC & ÂM THANH -->
                    <div style="margin-top: 10px; background: #111; padding: 8px; border-radius: 4px;">
                        <div id="diceResult" style="font-size: 22px; color: #ffcc00; margin-bottom: 6px;">🎲 [ ⚀ ] (Sẵn sàng)</div>
                        <button onclick="rollDiceWithSound()" class="btn" style="background: #0055ff; padding: 6px 14px; font-size: 12px; font-weight: bold; cursor: pointer;">Tung Xúc Xắc</button>
                    </div>
                </div>

                <!-- KHUNG CHAT TRỰC TUYẾN TRONG PHÒNG -->
                <div style="margin-top: 10px; text-align: left;">
                    <div style="font-size: 11px; color: #888; margin-bottom: 4px;">💬 Trò chuyện phòng:</div>
                    <div id="roomChatBox" style="height: 100px; overflow-y: scroll; background: #000; border: 1px solid #333; padding: 6px; font-size: 11px; display: flex; flex-direction: column; gap: 4px; margin-bottom: 6px;">
                        ${roomMessages.length === 0 ? '<div style="color: #555; text-align: center; margin-top: 30px;">Chưa có tin nhắn nào trong phòng.</div>' : 
                            roomMessages.map(m => `<div><b style="color: #00ff00;">${m.username}:</b> <span style="color: #fff;">${m.message}</span></div>`).join('')}
                    </div>
                    <form id="roomChatForm" onsubmit="sendRoomChat(event)" style="display: flex; gap: 6px;">
                        <input type="text" name="chat_message" id="chatInput" placeholder="Nhập chat..." autocomplete="off" style="flex: 1; background: #000; color: #fff; border: 1px solid #444; padding: 6px; font-size: 11px; border-radius: 4px;" required>
                        <button type="submit" class="btn" style="background: #00aa00; padding: 6px 12px; font-size: 11px;">Gửi</button>
                    </form>
                </div>

                <div style="margin-top: 10px;">
                    <a href="/game/ludo" class="btn" style="background: #aa0000; padding: 6px 12px; font-size: 11px;">⬅ Rời phòng</a>
                </div>
            </div>
        </div>

        <script>
            const chatBox = document.getElementById('roomChatBox');
            chatBox.scrollTop = chatBox.scrollHeight;

            function rollDiceWithSound() {
                // Phát âm thanh lắc xúc xắc thực tế
                const sound = document.getElementById('diceSound');
                if (sound) {
                    sound.currentTime = 0;
                    sound.play().catch(err => console.log("Audio play error:", err));
                }

                const dices = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
                const rand = Math.floor(Math.random() * 6);
                document.getElementById('diceResult').innerText = '🎲 [ ' + dices[rand] + ' ] (Ra số ' + (rand + 1) + ')';
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
            <span>🎲 Sảnh Game Ludo</span>
            <a href="#createRoomModal" onclick="document.getElementById('createRoomForm').style.display='block'" class="btn" style="background: #00aa00; font-size: 11px; padding: 4px 8px;">➕ Tạo phòng</a>
        </div>
        <div class="box-content" style="padding: 10px;">
            
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
