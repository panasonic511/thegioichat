import { renderUser } from '../worker.js';

export async function handleGameLudo(request, env, user, renderLayout, url) {
    const path = url.pathname;

    // Khởi tạo bảng cơ sở dữ liệu cho Ludo (Phòng, Ghế ngồi, Chat)
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
            CREATE TABLE IF NOT EXISTS ludo_players (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                room_id INTEGER,
                seat_index INTEGER,
                user_id INTEGER,
                username TEXT,
                display_name TEXT,
                avatar TEXT,
                is_ready INTEGER DEFAULT 0
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

    // 1. Tạo phòng mới (POST /game/ludo/create)
    if (path === '/game/ludo/create' && request.method === 'POST') {
        try {
            const formData = await request.formData();
            const roomName = formData.get('room_name') || `Phòng của ${user.display_name || user.username}`;
            const betAmount = parseInt(formData.get('bet_amount') || '0', 10);

            const res = await env.DB.prepare(
                "INSERT INTO ludo_rooms (room_name, host_id, host_name, bet_amount, status, created_at) VALUES (?, ?, ?, ?, 'waiting', datetime('now'))"
            ).bind(roomName, user.id, user.display_name || user.username, betAmount).run();

            const roomId = res.meta.last_row_id;

            // Tự động cho chủ phòng ngồi vào ghế 0 (Đỏ)
            await env.DB.prepare(
                "INSERT INTO ludo_players (room_id, seat_index, user_id, username, display_name, avatar, is_ready) VALUES (?, 0, ?, ?, ?, ?, 1)"
            ).bind(roomId, user.id, user.username, user.display_name || user.username, user.avatar || '').run();

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

        // Xử lý các thao tác Ajax trong phòng (Ngồi ghế, Rời ghế, Tung xúc xắc, Chat)
        if (request.method === 'POST') {
            try {
                const formData = await request.formData();
                const action = formData.get('action');

                // Ngồi vào ghế trống
                if (action === 'sit') {
                    const seatIndex = parseInt(formData.get('seat_index'), 10);
                    // Kiểm tra xem ghế đã có ai ngồi chưa
                    const existing = await env.DB.prepare("SELECT * FROM ludo_players WHERE room_id = ? AND seat_index = ?").bind(roomId, seatIndex).first();
                    // Kiểm tra xem user đã ngồi ghế nào khác chưa
                    const mySeat = await env.DB.prepare("SELECT * FROM ludo_players WHERE room_id = ? AND user_id = ?").bind(roomId, user.id).first();

                    if (!existing && !mySeat) {
                        await env.DB.prepare(
                            "INSERT INTO ludo_players (room_id, seat_index, user_id, username, display_name, avatar, is_ready) VALUES (?, ?, ?, ?, ?, ?, 0)"
                        ).bind(roomId, seatIndex, user.id, user.username, user.display_name || user.username, user.avatar || '').run();
                    }
                }

                // Rời ghế / Thoát phòng
                if (action === 'leave') {
                    await env.DB.prepare("DELETE FROM ludo_players WHERE room_id = ? AND user_id = ?").bind(roomId, user.id).run();
                }

                // Bắt đầu game (Kiểm tra phải có từ 2 đến 4 người chơi)
                if (action === 'start') {
                    const playersCount = await env.DB.prepare("SELECT COUNT(*) as cnt FROM ludo_players WHERE room_id = ?").bind(roomId).first();
                    if (playersCount.cnt < 2) {
                        return new Response(JSON.stringify({ success: false, error: 'Phòng phải có từ 2 - 4 người chơi.' }), { headers: { 'Content-Type': 'application/json' } });
                    }
                    await env.DB.prepare("UPDATE ludo_rooms SET status = 'playing' WHERE id = ?").bind(roomId).run();
                }

                // Gửi tin nhắn chat
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

        // Lấy danh sách người chơi trong 4 ghế và tin nhắn chat
        let players = [];
        let roomMessages = [];
        try {
            const pRes = await env.DB.prepare("SELECT * FROM ludo_players WHERE room_id = ?").bind(roomId).all();
            players = pRes.results || [];

            const mRes = await env.DB.prepare("SELECT * FROM ludo_messages WHERE room_id = ? ORDER BY id ASC LIMIT 50").bind(roomId).all();
            roomMessages = mRes.results || [];
        } catch (e) {}

        const isHost = Number(room.host_id) === Number(user.id);
        const myPlayer = players.find(p => Number(p.user_id) === Number(user.id));

        // Tạo mảng 4 ghế ngồi cố định [0, 1, 2, 3] tương ứng 4 góc bàn cờ
        const seats = [0, 1, 2, 3].map(index => {
            const p = players.find(item => item.seat_index === index);
            return p;
        });

        const content = `
        <div class="box">
            <div class="box-title" style="display: flex; justify-content: space-between; align-items: center;">
                <span>🎲 Phòng Ludo: ${room.room_name}</span>
                <span style="font-size: 11px; color: #ffcc00;">Cược: ${room.bet_amount.toLocaleString()} xu</span>
            </div>
            <div class="box-content" style="padding: 10px; text-align: center;">
                <div style="font-size: 13px; color: #aaa; margin-bottom: 8px;">
                    👑 Chủ phòng: <b style="color: #00ff00;">${room.host_name}</b> | Trạng thái: <span style="color: #00ff00;">${room.status === 'playing' ? 'Đang chơi' : 'Đang chờ người chơi'}</span>
                </div>

                <!-- BÀN CỜ LUDO VÀ 4 GHẾ NGỒI XUNG QUANH CHUẨN XÁC NHƯ ẢNH -->
                <div style="position: relative; display: inline-block; background: #051c05; border: 3px solid #333; padding: 10px; border-radius: 8px; max-width: 100%;">
                    
                    <!-- Ghế ngồi số 0 (Góc trên) -->
                    <div style="margin-bottom: 6px;">
                        ${seats[0] ? `
                            <div style="display: inline-flex; align-items: center; gap: 6px; background: #1a1a1a; border: 1px solid #444; padding: 4px 10px; border-radius: 4px;">
                                <img src="${seats[0].avatar || ''}" style="width: 22px; height: 22px; border-radius: 50%; object-fit: cover;">
                                <span style="font-size: 12px; color: #00ff00; font-weight: bold;">${seats[0].display_name}</span>
                                ${Number(seats[0].user_id) === Number(user.id) ? `<button onclick="actionSeat('leave')" style="background: #aa0000; color:#fff; border:none; padding:2px 6px; font-size:10px; border-radius:3px; cursor:pointer;">Rời</button>` : ''}
                            </div>
                        ` : `
                            <button onclick="actionSeat('sit', 0)" class="btn" style="background: #333; color: #ffcc00; font-size: 11px; padding: 4px 12px; border: 1px dashed #666;">+ Ngồi ghế 1</button>
                        `}
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <!-- Ghế ngồi số 1 (Bên trái) -->
                        <div style="width: 80px; text-align: center;">
                            ${seats[1] ? `
                                <div style="display: inline-flex; flex-direction: column; align-items: center; gap: 4px; background: #1a1a1a; border: 1px solid #444; padding: 6px; border-radius: 4px;">
                                    <img src="${seats[1].avatar || ''}" style="width: 22px; height: 22px; border-radius: 50%; object-fit: cover;">
                                    <span style="font-size: 11px; color: #00ff00; font-weight: bold; word-break: break-all;">${seats[1].display_name}</span>
                                    ${Number(seats[1].user_id) === Number(user.id) ? `<button onclick="actionSeat('leave')" style="background: #aa0000; color:#fff; border:none; padding:2px 4px; font-size:9px; border-radius:3px; cursor:pointer;">Rời</button>` : ''}
                                </div>
                            ` : `
                                <button onclick="actionSeat('sit', 1)" class="btn" style="background: #333; color: #ffcc00; font-size: 10px; padding: 6px 4px; border: 1px dashed #666;">+ Ngồi ghế 2</button>
                            `}
                        </div>

                        <!-- Bàn cờ SVG trung tâm -->
                        <svg viewBox="0 0 500 500" style="width: 280px; height: 280px; background: #fff; border-radius: 4px;">
                            <rect x="0" y="0" width="200" height="200" fill="#cc0000" />
                            <rect x="300" y="0" width="200" height="200" fill="#00aa00" />
                            <rect x="0" y="300" width="200" height="200" fill="#0033cc" />
                            <rect x="300" y="300" width="200" height="200" fill="#ffcc00" />

                            <circle cx="70" cy="70" r="16" fill="#fff" /><circle cx="130" cy="70" r="16" fill="#fff" />
                            <circle cx="70" cy="130" r="16" fill="#fff" /><circle cx="130" cy="130" r="16" fill="#fff" />

                            <circle cx="370" cy="70" r="16" fill="#fff" /><circle cx="430" cy="70" r="16" fill="#fff" />
                            <circle cx="370" cy="130" r="16" fill="#fff" /><circle cx="430" cy="130" r="16" fill="#fff" />

                            <circle cx="70" cy="370" r="16" fill="#fff" /><circle cx="130" cy="370" r="16" fill="#fff" />
                            <circle cx="70" cy="430" r="16" fill="#fff" /><circle cx="130" cy="430" r="16" fill="#fff" />

                            <circle cx="370" cy="370" r="16" fill="#fff" /><circle cx="430" cy="370" r="16" fill="#fff" />
                            <circle cx="370" cy="430" r="16" fill="#fff" /><circle cx="430" cy="430" r="16" fill="#fff" />

                            <rect x="0" y="200" width="200" height="100" fill="#eee" stroke="#ccc" />
                            <rect x="300" y="200" width="200" height="100" fill="#eee" stroke="#ccc" />
                            <rect x="200" y="0" width="100" height="200" fill="#eee" stroke="#ccc" />
                            <rect x="200" y="300" width="100" height="200" fill="#eee" stroke="#ccc" />

                            <polygon points="250,250 200,200 200,300" fill="#cc0000" />
                            <polygon points="250,250 200,200 300,200" fill="#00aa00" />
                            <polygon points="250,250 300,200 300,300" fill="#ffcc00" />
                            <polygon points="250,250 200,300 300,300" fill="#0033cc" />
                        </svg>

                        <!-- Ghế ngồi số 2 (Bên phải) -->
                        <div style="width: 80px; text-align: center;">
                            ${seats[2] ? `
                                <div style="display: inline-flex; flex-direction: column; align-items: center; gap: 4px; background: #1a1a1a; border: 1px solid #444; padding: 6px; border-radius: 4px;">
                                    <img src="${seats[2].avatar || ''}" style="width: 22px; height: 22px; border-radius: 50%; object-fit: cover;">
                                    <span style="font-size: 11px; color: #00ff00; font-weight: bold; word-break: break-all;">${seats[2].display_name}</span>
                                    ${Number(seats[2].user_id) === Number(user.id) ? `<button onclick="actionSeat('leave')" style="background: #aa0000; color:#fff; border:none; padding:2px 4px; font-size:9px; border-radius:3px; cursor:pointer;">Rời</button>` : ''}
                                </div>
                            ` : `
                                <button onclick="actionSeat('sit', 2)" class="btn" style="background: #333; color: #ffcc00; font-size: 10px; padding: 6px 4px; border: 1px dashed #666;">+ Ngồi ghế 3</button>
                            `}
                        </div>
                    </div>

                    <!-- Ghế ngồi số 3 (Góc dưới) -->
                    <div style="margin-top: 6px;">
                        ${seats[3] ? `
                            <div style="display: inline-flex; align-items: center; gap: 6px; background: #1a1a1a; border: 1px solid #444; padding: 4px 10px; border-radius: 4px;">
                                <img src="${seats[3].avatar || ''}" style="width: 22px; height: 22px; border-radius: 50%; object-fit: cover;">
                                <span style="font-size: 12px; color: #00ff00; font-weight: bold;">${seats[3].display_name}</span>
                                ${Number(seats[3].user_id) === Number(user.id) ? `<button onclick="actionSeat('leave')" style="background: #aa0000; color:#fff; border:none; padding:2px 6px; font-size:10px; border-radius:3px; cursor:pointer;">Rời</button>` : ''}
                            </div>
                        ` : `
                            <button onclick="actionSeat('sit', 3)" class="btn" style="background: #333; color: #ffcc00; font-size: 11px; padding: 4px 12px; border: 1px dashed #666;">+ Ngồi ghế 4</button>
                        `}
                    </div>
                </div>

                <!-- BẢNG ĐIỀU KHIỂN & XÚC XẮC XOAY MƯỢT MÀ -->
                <div style="margin-top: 12px; background: #111; padding: 12px; border-radius: 6px; border: 1px solid #333;">
                    <div id="diceResult" style="font-size: 28px; font-weight: bold; color: #ffcc00; margin-bottom: 8px; transition: transform 0.2s;">🎲 [ ⚀ ]</div>
                    
                    <div style="display: flex; justify-content: center; gap: 8px;">
                        <button onclick="rollDice()" class="btn" style="background: #0055ff; padding: 8px 16px; font-size: 14px; font-weight: bold; cursor: pointer;">Tung Xúc Xắc</button>
                        
                        ${isHost && room.status !== 'playing' ? `
                            <button onclick="startGame()" class="btn" style="background: #00aa00; padding: 8px 16px; font-size: 14px; font-weight: bold; cursor: pointer;">Bắt đầu</button>
                        ` : ''}
                    </div>
                    <div id="gameNotice" style="font-size: 11px; color: #ff5555; margin-top: 6px;"></div>
                </div>

                <!-- KHUNG CHAT TRONG PHÒNG -->
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

            // Xử lý ngồi ghế hoặc rời ghế không cần load lại trang
            async function actionSeat(action, seatIndex = null) {
                const formData = new FormData();
                formData.append('action', action);
                if (seatIndex !== null) formData.append('seat_index', seatIndex);

                try {
                    const res = await fetch(window.location.href, {
                        method: 'POST',
                        headers: { 'X-Requested-With': 'XMLHttpRequest' },
                        body: formData
                    });
                    if (res.ok) {
                        location.reload();
                    }
                } catch (e) {
                    location.reload();
                }
            }

            // Xử lý bắt đầu game (Kiểm tra từ 2 người chơi)
            async function startGame() {
                const formData = new FormData();
                formData.append('action', 'start');

                try {
                    const res = await fetch(window.location.href, {
                        method: 'POST',
                        headers: { 'X-Requested-With': 'XMLHttpRequest' },
                        body: formData
                    });
                    const data = await res.json();
                    if (data.success === false) {
                        document.getElementById('gameNotice').innerText = data.error;
                    } else {
                        location.reload();
                    }
                } catch (e) {
                    location.reload();
                }
            }

            // Hiệu ứng xúc xắc xoay mượt mà không delay
            function rollDice() {
                const dices = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
                const diceEl = document.getElementById('diceResult');
                
                // Hiệu ứng xoay lắc
                let count = 0;
                diceEl.style.transform = 'scale(1.2) rotate(15deg)';
                
                const interval = setInterval(() => {
                    const randTemp = Math.floor(Math.random() * 6);
                    diceEl.innerText = '🎲 [ ' + dices[randTemp] + ' ]';
                    count++;
                    if (count > 8) {
                        clearInterval(interval);
                        const finalRand = Math.floor(Math.random() * 6);
                        diceEl.innerText = '🎲 [ ' + dices[finalRand] + ' ] (Số ' + (finalRand + 1) + ')';
                        diceEl.style.transform = 'scale(1) rotate(0deg)';
                    }
                }, 50);
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
            <span>🎲 Game Ludo (Cờ cá ngựa)</span>
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
