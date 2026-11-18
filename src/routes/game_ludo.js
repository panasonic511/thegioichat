import { renderUser } from '../worker.js';

export async function handleGameLudo(request, env, user, renderLayout, url) {
    const path = url.pathname;

    // Khởi tạo cơ sở dữ liệu D1 cho phòng game, người chơi và chat
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
                score INTEGER DEFAULT 0
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
            const roomName = formData.get('room_name') || `Phòng Ludo của ${user.display_name || user.username}`;
            const betAmount = parseInt(formData.get('bet_amount') || '0', 10);

            const res = await env.DB.prepare(
                "INSERT INTO ludo_rooms (room_name, host_id, host_name, bet_amount, status, created_at) VALUES (?, ?, ?, ?, 'waiting', datetime('now'))"
            ).bind(roomName, user.id, user.display_name || user.username, betAmount).run();

            const roomId = res.meta.last_row_id;

            // Tự động đưa chủ phòng vào ghế 0 (Đỏ)
            await env.DB.prepare(
                "INSERT INTO ludo_players (room_id, seat_index, user_id, username, display_name, avatar) VALUES (?, 0, ?, ?, ?, ?)"
            ).bind(roomId, user.id, user.username, user.display_name || user.username, user.avatar || '').run();

            return Response.redirect(new URL(`/game/ludo/room?id=${roomId}`, request.url), 302);
        } catch (e) {
            return Response.redirect(new URL('/game/ludo', request.url), 302);
        }
    }

    // 2. Giao diện phòng chơi chính thức (GET /game/ludo/room?id=...)
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

        // Xử lý các yêu cầu tương tác Ajax (Ngồi ghế, Rời phòng, Bắt đầu, Chat)
        if (request.method === 'POST') {
            try {
                const formData = await request.formData();
                const action = formData.get('action');

                if (action === 'sit') {
                    const seatIndex = parseInt(formData.get('seat_index'), 10);
                    const existing = await env.DB.prepare("SELECT * FROM ludo_players WHERE room_id = ? AND seat_index = ?").bind(roomId, seatIndex).first();
                    const mySeat = await env.DB.prepare("SELECT * FROM ludo_players WHERE room_id = ? AND user_id = ?").bind(roomId, user.id).first();

                    if (!existing && !mySeat) {
                        await env.DB.prepare(
                            "INSERT INTO ludo_players (room_id, seat_index, user_id, username, display_name, avatar) VALUES (?, ?, ?, ?, ?, ?)"
                        ).bind(roomId, seatIndex, user.id, user.username, user.display_name || user.username, user.avatar || '').run();
                    }
                }

                if (action === 'leave') {
                    await env.DB.prepare("DELETE FROM ludo_players WHERE room_id = ? AND user_id = ?").bind(roomId, user.id).run();
                }

                if (action === 'start') {
                    await env.DB.prepare("UPDATE ludo_rooms SET status = 'playing' WHERE id = ?").bind(roomId).run();
                }

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

        let players = [];
        let roomMessages = [];
        try {
            const pRes = await env.DB.prepare("SELECT * FROM ludo_players WHERE room_id = ?").bind(roomId).all();
            players = pRes.results || [];

            const mRes = await env.DB.prepare("SELECT * FROM ludo_messages WHERE room_id = ? ORDER BY id ASC LIMIT 50").bind(roomId).all();
            roomMessages = mRes.results || [];
        } catch (e) {}

        const isHost = Number(room.host_id) === Number(user.id);
        const seats = [0, 1, 2, 3].map(index => players.find(item => item.seat_index === index));

        const content = `
        <div class="box">
            <div class="box-title" style="display: flex; justify-content: space-between; align-items: center;">
                <span>🎲 LudoVerse: ${room.room_name}</span>
                <span style="font-size: 11px; color: #ffcc00;">Cược: ${room.bet_amount.toLocaleString()} xu</span>
            </div>
            <div class="box-content" style="padding: 8px; text-align: center;">
                <div style="font-size: 12px; color: #aaa; margin-bottom: 6px;">
                    👑 Chủ phòng: <b style="color: #00ff00;">${room.host_name}</b> | Trạng thái: <span style="color: #00ff00;" id="roomStatusText">${room.status === 'playing' ? 'Đang tranh tài' : 'Đang chờ người chơi'}</span>
                </div>

                <!-- CÁC HIỆU ỨNG ÂM THANH SỐNG ĐỘNG (GITHUB RAW ASSETS) -->
                <audio id="diceSound" src="https://raw.githubusercontent.com/jamalihassan0307/LudoVerse/main/assets/sounds/roll_the_dice.mp3" preload="auto"></audio>
                <audio id="moveSound" src="https://raw.githubusercontent.com/jamalihassan0307/LudoVerse/main/assets/sounds/move.wav" preload="auto"></audio>
                <audio id="laughSound" src="https://raw.githubusercontent.com/jamalihassan0307/LudoVerse/main/assets/sounds/laugh.mp3" preload="auto"></audio>

                <!-- KHUNG GIAO DIỆN PHÒNG & GHẾ NGỒI 4 HƯỚNG -->
                <div style="background: #051c05; border: 2px solid #333; padding: 8px; border-radius: 8px; display: inline-block; max-width: 100%;">
                    
                    <!-- Ghế Đỏ (Trên) -->
                    <div style="margin-bottom: 4px;">
                        ${seats[0] ? `
                            <div style="display: inline-flex; align-items: center; gap: 6px; background: #1a1a1a; border: 1px solid #cc0000; padding: 3px 8px; border-radius: 4px;">
                                <img src="${seats[0].avatar || ''}" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover;">
                                <span style="font-size: 11px; color: #ff5555; font-weight: bold;">🔴 ${seats[0].display_name}</span>
                                ${Number(seats[0].user_id) === Number(user.id) ? `<button onclick="actionSeat('leave')" style="background: #aa0000; color:#fff; border:none; padding:1px 4px; font-size:9px; border-radius:3px; cursor:pointer;">Rời</button>` : ''}
                            </div>
                        ` : `
                            <button onclick="actionSeat('sit', 0)" class="btn" style="background: #222; color: #ffcc00; font-size: 10px; padding: 3px 10px; border: 1px dashed #666;">+ Ghế Đỏ (1)</button>
                        `}
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 4px;">
                        <!-- Ghế Xanh Dương (Trái) -->
                        <div style="width: 80px; text-align: center;">
                            ${seats[1] ? `
                                <div style="display: inline-flex; flex-direction: column; align-items: center; gap: 2px; background: #1a1a1a; border: 1px solid #0033cc; padding: 4px; border-radius: 4px;">
                                    <img src="${seats[1].avatar || ''}" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover;">
                                    <span style="font-size: 10px; color: #3399ff; font-weight: bold; word-break: break-all;">🔵 ${seats[1].display_name}</span>
                                    ${Number(seats[1].user_id) === Number(user.id) ? `<button onclick="actionSeat('leave')" style="background: #aa0000; color:#fff; border:none; padding:1px 3px; font-size:8px; border-radius:3px; cursor:pointer;">Rời</button>` : ''}
                                </div>
                            ` : `
                                <button onclick="actionSeat('sit', 1)" class="btn" style="background: #222; color: #ffcc00; font-size: 9px; padding: 4px 2px; border: 1px dashed #666;">+ Ghế Xanh Dương</button>
                            `}
                        </div>

                        <!-- BÀN CỜ LUDO SVG CHI TIẾT (CÓ Ô DI CHUYỂN, Ô AN TOÀN SAO ⭐, VÀ NGỰA DI CHUYỂN) -->
                        <svg viewBox="0 0 500 500" style="width: 280px; height: 280px; background: #fff; border-radius: 4px; box-shadow: 0 0 10px rgba(0,0,0,0.5);">
                            <!-- 4 Khu nhà chính -->
                            <rect x="0" y="0" width="200" height="200" fill="#cc0000" />
                            <circle cx="70" cy="70" r="16" fill="#fff" /><text x="70" y="75" font-size="14" text-anchor="middle">🐴</text>
                            <circle cx="130" cy="70" r="16" fill="#fff" /><text x="130" y="75" font-size="14" text-anchor="middle">🐴</text>
                            <circle cx="70" cy="130" r="16" fill="#fff" /><text x="70" y="135" font-size="14" text-anchor="middle">🐴</text>
                            <circle cx="130" cy="130" r="16" fill="#fff" /><text x="130" y="135" font-size="14" text-anchor="middle">🐴</text>

                            <rect x="300" y="0" width="200" height="200" fill="#00aa00" />
                            <circle cx="370" cy="70" r="16" fill="#fff" /><text x="370" y="75" font-size="14" text-anchor="middle">🐴</text>
                            <circle cx="430" cy="70" r="16" fill="#fff" /><text x="430" y="75" font-size="14" text-anchor="middle">🐴</text>
                            <circle cx="370" cy="130" r="16" fill="#fff" /><text x="370" y="135" font-size="14" text-anchor="middle">🐴</text>
                            <circle cx="430" cy="130" r="16" fill="#fff" /><text x="430" y="135" font-size="14" text-anchor="middle">🐴</text>

                            <rect x="0" y="300" width="200" height="200" fill="#0033cc" />
                            <circle cx="70" cy="370" r="16" fill="#fff" /><text x="70" y="375" font-size="14" text-anchor="middle">🐴</text>
                            <circle cx="130" cy="370" r="16" fill="#fff" /><text x="130" y="375" font-size="14" text-anchor="middle">🐴</text>
                            <circle cx="70" cy="430" r="16" fill="#fff" /><text x="70" y="435" font-size="14" text-anchor="middle">🐴</text>
                            <circle cx="130" cy="430" r="16" fill="#fff" /><text x="130" y="435" font-size="14" text-anchor="middle">🐴</text>

                            <rect x="300" y="300" width="200" height="200" fill="#ffcc00" />
                            <circle cx="370" cy="370" r="16" fill="#fff" /><text x="370" y="375" font-size="14" text-anchor="middle">🐴</text>
                            <circle cx="430" cy="370" r="16" fill="#fff" /><text x="430" y="375" font-size="14" text-anchor="middle">🐴</text>
                            <circle cx="370" cy="430" r="16" fill="#fff" /><text x="370" y="435" font-size="14" text-anchor="middle">🐴</text>
                            <circle cx="430" cy="430" r="16" fill="#fff" /><text x="430" y="435" font-size="14" text-anchor="middle">🐴</text>

                            <!-- Đường đi chữ thập & Lưới ô vuông nhỏ (Grid cells) -->
                            <!-- Trục ngang trái -->
                            <g fill="#fff" stroke="#ccc">
                                <rect x="0" y="200" width="33.3" height="33.3"/><rect x="33.3" y="200" width="33.3" height="33.3"/><rect x="66.6" y="200" width="33.3" height="33.3"/><rect x="99.9" y="200" width="33.3" height="33.3"/><rect x="133.2" y="200" width="33.3" height="33.3"/><rect x="166.5" y="200" width="33.3" height="33.3"/>
                                <rect x="0" y="233.3" width="33.3" height="33.3" fill="#ffcccc"/><rect x="33.3" y="233.3" width="33.3" height="33.3"/><rect x="66.6" y="233.3" width="33.3" height="33.3"/><rect x="99.9" y="233.3" width="33.3" height="33.3"/><rect x="133.2" y="233.3" width="33.3" height="33.3"/><rect x="166.5" y="233.3" width="33.3" height="33.3"/>
                                <rect x="0" y="266.6" width="33.3" height="33.3"/><rect x="33.3" y="266.6" width="33.3" height="33.3"/><rect x="66.6" y="266.6" width="33.3" height="33.3"/><rect x="99.9" y="266.6" width="33.3" height="33.3"/><rect x="133.2" y="266.6" width="33.3" height="33.3"/><rect x="166.5" y="266.6" width="33.3" height="33.3"/>

                                <!-- Trục ngang phải -->
                                <rect x="300" y="200" width="33.3" height="33.3"/><rect x="333.3" y="200" width="33.3" height="33.3"/><rect x="366.6" y="200" width="33.3" height="33.3"/><rect x="399.9" y="200" width="33.3" height="33.3"/><rect x="433.2" y="200" width="33.3" height="33.3"/><rect x="466.5" y="200" width="33.3" height="33.3"/>
                                <rect x="300" y="233.3" width="33.3" height="33.3"/><rect x="333.3" y="233.3" width="33.3" height="33.3"/><rect x="366.6" y="233.3" width="33.3" height="33.3"/><rect x="399.9" y="233.3" width="33.3" height="33.3"/><rect x="433.2" y="233.3" width="33.3" height="33.3"/><rect x="466.5" y="233.3" width="33.3" height="33.3" fill="#ffffcc"/>
                                <rect x="300" y="266.6" width="33.3" height="33.3"/><rect x="333.3" y="266.6" width="33.3" height="33.3"/><rect x="366.6" y="266.6" width="33.3" height="33.3"/><rect x="399.9" y="266.6" width="33.3" height="33.3"/><rect x="433.2" y="266.6" width="33.3" height="33.3"/><rect x="466.5" y="266.6" width="33.3" height="33.3"/>

                                <!-- Trục dọc trên -->
                                <rect x="200" y="0" width="33.3" height="33.3"/><rect x="233.3" y="0" width="33.3" height="33.3" fill="#ccffcc"/><rect x="266.6" y="0" width="33.3" height="33.3"/>
                                <rect x="200" y="33.3" width="33.3" height="33.3"/><rect x="233.3" y="33.3" width="33.3" height="33.3"/><rect x="266.6" y="33.3" width="33.3" height="33.3"/>
                                <rect x="200" y="66.6" width="33.3" height="33.3"/><rect x="233.3" y="66.6" width="33.3" height="33.3"/><rect x="266.6" y="66.6" width="33.3" height="33.3"/>
                                <rect x="200" y="99.9" width="33.3" height="33.3"/><rect x="233.3" y="99.9" width="33.3" height="33.3"/><rect x="266.6" y="99.9" width="33.3" height="33.3"/>
                                <rect x="200" y="133.2" width="33.3" height="33.3"/><rect x="233.3" y="133.2" width="33.3" height="33.3"/><rect x="266.6" y="133.2" width="33.3" height="33.3"/>
                                <rect x="200" y="166.5" width="33.3" height="33.3"/><rect x="233.3" y="166.5" width="33.3" height="33.3"/><rect x="266.6" y="166.5" width="33.3" height="33.3"/>

                                <!-- Trục dọc dưới -->
                                <rect x="200" y="300" width="33.3" height="33.3"/><rect x="233.3" y="300" width="33.3" height="33.3"/><rect x="266.6" y="300" width="33.3" height="33.3"/>
                                <rect x="200" y="333.3" width="33.3" height="33.3"/><rect x="233.3" y="333.3" width="33.3" height="33.3"/><rect x="266.6" y="333.3" width="33.3" height="33.3"/>
                                <rect x="200" y="366.6" width="33.3" height="33.3"/><rect x="233.3" y="366.6" width="33.3" height="33.3"/><rect x="266.6" y="366.6" width="33.3" height="33.3"/>
                                <rect x="200" y="399.9" width="33.3" height="33.3"/><rect x="233.3" y="399.9" width="33.3" height="33.3" fill="#cce6ff"/><rect x="266.6" y="399.9" width="33.3" height="33.3"/>
                                <rect x="200" y="433.2" width="33.3" height="33.3"/><rect x="233.3" y="433.2" width="33.3" height="33.3"/><rect x="266.6" y="433.2" width="33.3" height="33.3"/>
                                <rect x="200" y="466.5" width="33.3" height="33.3"/><rect x="233.3" y="466.5" width="33.3" height="33.3"/><rect x="266.6" y="466.5" width="33.3" height="33.3"/>
                            </g>

                            <!-- Các ô an toàn (⭐) -->
                            <text x="50" y="222" font-size="12" text-anchor="middle">⭐</text>
                            <text x="216" y="55" font-size="12" text-anchor="middle">⭐</text>
                            <text x="450" y="285" font-size="12" text-anchor="middle">⭐</text>
                            <text x="283" y="452" font-size="12" text-anchor="middle">⭐</text>

                            <!-- Tâm nhà chung & Mũi tên chỉ hướng -->
                            <polygon points="250,250 200,200 200,300" fill="#cc0000" />
                            <polygon points="250,250 200,200 300,200" fill="#00aa00" />
                            <polygon points="250,250 300,200 300,300" fill="#ffcc00" />
                            <polygon points="250,250 200,300 300,300" fill="#0033cc" />

                            <!-- QUÂN NGỰA ĐANG DI CHUYỂN TRÊN BÀN CỜ (ĐỘNG) -->
                            <g id="gamePieces">
                                <circle id="horseRed" cx="70" cy="70" r="14" fill="#ff0000" stroke="#fff" stroke-width="2" style="transition: all 0.5s ease; cursor: pointer;" />
                                <text id="textRed" x="70" y="75" font-size="12" text-anchor="middle" fill="#fff" font-weight="bold">1</text>

                                <circle id="horseBlue" cx="70" cy="370" r="14" fill="#0033cc" stroke="#fff" stroke-width="2" style="transition: all 0.5s ease; cursor: pointer;" />
                                <text id="textBlue" x="70" y="375" font-size="12" text-anchor="middle" fill="#fff" font-weight="bold">2</text>
                            </g>
                        </svg>

                        <!-- Ghế Vàng (Phải) -->
                        <div style="width: 80px; text-align: center;">
                            ${seats[2] ? `
                                <div style="display: inline-flex; flex-direction: column; align-items: center; gap: 2px; background: #1a1a1a; border: 1px solid #ffcc00; padding: 4px; border-radius: 4px;">
                                    <img src="${seats[2].avatar || ''}" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover;">
                                    <span style="font-size: 10px; color: #ffcc00; font-weight: bold; word-break: break-all;">🟡 ${seats[2].display_name}</span>
                                    ${Number(seats[2].user_id) === Number(user.id) ? `<button onclick="actionSeat('leave')" style="background: #aa0000; color:#fff; border:none; padding:1px 3px; font-size:8px; border-radius:3px; cursor:pointer;">Rời</button>` : ''}
                                </div>
                            ` : `
                                <button onclick="actionSeat('sit', 2)" class="btn" style="background: #222; color: #ffcc00; font-size: 9px; padding: 4px 2px; border: 1px dashed #666;">+ Ghế Vàng</button>
                            `}
                        </div>
                    </div>

                    <!-- Ghế Xanh Lá (Dưới) -->
                    <div style="margin-top: 4px;">
                        ${seats[3] ? `
                            <div style="display: inline-flex; align-items: center; gap: 6px; background: #1a1a1a; border: 1px solid #00aa00; padding: 3px 8px; border-radius: 4px;">
                                <img src="${seats[3].avatar || ''}" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover;">
                                <span style="font-size: 11px; color: #00ff00; font-weight: bold;">🟢 ${seats[3].display_name}</span>
                                ${Number(seats[3].user_id) === Number(user.id) ? `<button onclick="actionSeat('leave')" style="background: #aa0000; color:#fff; border:none; padding:1px 4px; font-size:9px; border-radius:3px; cursor:pointer;">Rời</button>` : ''}
                            </div>
                        ` : `
                            <button onclick="actionSeat('sit', 3)" class="btn" style="background: #222; color: #ffcc00; font-size: 10px; padding: 3px 10px; border: 1px dashed #666;">+ Ghế Xanh Lá (4)</button>
                        `}
                    </div>
                </div>

                <!-- BẢNG ĐIỀU KHIỂN XÚC XẮC & DI CHUYỂN NGỰA -->
                <div style="margin-top: 10px; background: #111; padding: 10px; border-radius: 6px; border: 1px solid #333;">
                    <div id="turnInfo" style="font-size: 12px; color: #00ff00; font-weight: bold; margin-bottom: 4px;">🎯 Lượt đi: Sẵn sàng tranh tài</div>
                    
                    <div id="diceResult" style="font-size: 26px; font-weight: bold; color: #ffcc00; margin-bottom: 4px; transition: transform 0.2s;">🎲 [ ⚀ ]</div>
                    
                    <div style="font-size: 11px; color: #ff5555; margin-bottom: 8px;">
                        💡 <b>Luật Ludo: Ra số 6 (⚅) xuất quân ra ô xuất phát và phi nước đại!</b>
                    </div>

                    <div style="display: flex; justify-content: center; gap: 8px;">
                        <button id="rollBtn" onclick="rollDiceAndMove()" class="btn" style="background: #0055ff; padding: 6px 14px; font-size: 13px; font-weight: bold; cursor: pointer;">🎲 Tung Xúc Xắc</button>
                        
                        ${isHost && room.status !== 'playing' ? `
                            <button onclick="startGame()" class="btn" style="background: #00aa00; padding: 6px 14px; font-size: 13px; font-weight: bold; cursor: pointer;">🚀 Bắt đầu trận đấu</button>
                        ` : ''}
                    </div>
                    <div id="gameNotice" style="font-size: 11px; color: #ffcc00; margin-top: 4px;"></div>
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

            let horsePosition = 0; // 0 nằm trong chuồng, >0 là các tọa độ ô trên bàn cờ
            const trackCoordinates = [
                {cx: 70, cy: 70},   // Vị trí chuồng Đỏ
                {cx: 50, cy: 216},  // Ô xuất phát
                {cx: 83, cy: 216},
                {cx: 116, cy: 216},
                {cx: 149, cy: 216},
                {cx: 182, cy: 216},
                {cx: 216, cy: 182},  // Quẹo lên trên
                {cx: 216, cy: 149},
                {cx: 216, cy: 116},
                {cx: 216, cy: 83},
                {cx: 216, cy: 50},
                {cx: 250, cy: 50},   // Đỉnh bàn cờ
                {cx: 283, cy: 50},
                {cx: 283, cy: 83},
                {cx: 283, cy: 116},
                {cx: 283, cy: 149},
                {cx: 283, cy: 182},
                {cx: 316, cy: 216},  // Quẹo sang phải
                {cx: 349, cy: 216},
                {cx: 382, cy: 216},
                {cx: 415, cy: 216},
                {cx: 448, cy: 216},
                {cx: 481, cy: 216}
            ];

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
                    if (res.ok) location.reload();
                } catch (e) {
                    location.reload();
                }
            }

            async function startGame() {
                const formData = new FormData();
                formData.append('action', 'start');
                try {
                    await fetch(window.location.href, {
                        method: 'POST',
                        headers: { 'X-Requested-With': 'XMLHttpRequest' },
                        body: formData
                    });
                    location.reload();
                } catch (e) {
                    location.reload();
                }
            }

            function rollDiceAndMove() {
                // Phát âm thanh lắc xúc xắc
                const diceAudio = document.getElementById('diceSound');
                if (diceAudio) {
                    diceAudio.currentTime = 0;
                    diceAudio.play().catch(e => {});
                }

                const dices = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
                const diceEl = document.getElementById('diceResult');
                
                let count = 0;
                diceEl.style.transform = 'scale(1.2) rotate(15deg)';

                const interval = setInterval(() => {
                    const randTemp = Math.floor(Math.random() * 6);
                    diceEl.innerText = '🎲 [ ' + dices[randTemp] + ' ]';
                    count++;
                    if (count > 8) {
                        clearInterval(interval);
                        const finalRand = Math.floor(Math.random() * 6);
                        const resultNum = finalRand + 1;
                        diceEl.innerText = '🎲 [ ' + dices[finalRand] + ' ] (Ra số ' + resultNum + ')';
                        diceEl.style.transform = 'scale(1) rotate(0deg)';

                        // Xử lý di chuyển ngựa trên bàn cờ
                        if (horsePosition === 0) {
                            if (resultNum === 6) {
                                horsePosition = 1; // Ra quân xuất phát
                                document.getElementById('gameNotice').innerText = '🎉 Tung được số 6! Ngựa đã xuất chuồng ra ô xuất phát!';
                                moveHorseToStep(horsePosition);
                            } else {
                                document.getElementById('gameNotice').innerText = '⚠️ Cần tung được số 6 (⚅) để xuất quân!';
                            }
                        } else {
                            horsePosition = (horsePosition + resultNum) % trackCoordinates.length;
                            if (horsePosition === 0) horsePosition = 1;
                            document.getElementById('gameNotice').innerText = '🐎 Ngựa phi nước đại tiến lên ' + resultNum + ' bước!';
                            moveHorseToStep(horsePosition);
                        }

                        // Phát âm thanh di chuyển quân cờ
                        const moveAudio = document.getElementById('moveSound');
                        if (moveAudio) {
                            moveAudio.currentTime = 0;
                            moveAudio.play().catch(e => {});
                        }
                    }
                }, 50);
            }

            function moveHorseToStep(stepIndex) {
                const target = trackCoordinates[stepIndex] || trackCoordinates[1];
                const horse = document.getElementById('horseRed');
                const label = document.getElementById('textRed');
                
                if (horse && label) {
                    horse.setAttribute('cx', target.cx);
                    horse.setAttribute('cy', target.cy);
                    label.setAttribute('x', target.cx);
                    label.setAttribute('y', target.cy + 4);
                }
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
            <span>🎲 Sảnh LudoVerse - Đỉnh Cao Cờ Cá Ngựa</span>
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
