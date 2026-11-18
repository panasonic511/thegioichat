import { renderUser } from '../worker.js';

export async function handleGameLudo(request, env, user, renderLayout, url) {
    const path = url.pathname;

    // Khởi tạo cơ sở dữ liệu cho Ludo
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
                avatar TEXT
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

    // 1. Tạo phòng mới
    if (path === '/game/ludo/create' && request.method === 'POST') {
        try {
            const formData = await request.formData();
            const roomName = formData.get('room_name') || `Bàn Ludo của ${user.display_name || user.username}`;
            const betAmount = parseInt(formData.get('bet_amount') || '0', 10);

            const res = await env.DB.prepare(
                "INSERT INTO ludo_rooms (room_name, host_id, host_name, bet_amount, status, created_at) VALUES (?, ?, ?, ?, 'waiting', datetime('now'))"
            ).bind(roomName, user.id, user.display_name || user.username, betAmount).run();

            const roomId = res.meta.last_row_id;

            // Tự động cho chủ phòng vào ghế 0 (Đỏ)
            await env.DB.prepare(
                "INSERT INTO ludo_players (room_id, seat_index, user_id, username, display_name, avatar) VALUES (?, 0, ?, ?, ?, ?)"
            ).bind(roomId, user.id, user.username, user.display_name || user.username, user.avatar || '').run();

            return Response.redirect(new URL(`/game/ludo/room?id=${roomId}`, request.url), 302);
        } catch (e) {
            return Response.redirect(new URL('/game/ludo', request.url), 302);
        }
    }

    // 2. Giao diện phòng chơi chính thức
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

        // Xử lý các thao tác hành động trong phòng (Ajax / Post)
        if (request.method === 'POST') {
            try {
                const formData = await request.formData();
                const action = formData.get('action');

                if (action === 'sit') {
                    const seatIndex = parseInt(formData.get('seat_index'), 10);
                    const occupied = await env.DB.prepare("SELECT * FROM ludo_players WHERE room_id = ? AND seat_index = ?").bind(roomId, seatIndex).first();
                    const joined = await env.DB.prepare("SELECT * FROM ludo_players WHERE room_id = ? AND user_id = ?").bind(roomId, user.id).first();

                    if (!occupied && !joined) {
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
        const seats = [0, 1, 2, 3].map(index => players.find(p => p.seat_index === index));

        const content = `
        <div class="box">
            <div class="box-title" style="display: flex; justify-content: space-between; align-items: center;">
                <span>🎲 Ludo Master: ${room.room_name}</span>
                <span style="font-size: 11px; color: #ffcc00;">Cược: ${room.bet_amount.toLocaleString()} xu</span>
            </div>
            <div class="box-content" style="padding: 8px; text-align: center;">
                <div style="font-size: 11px; color: #aaa; margin-bottom: 6px;">
                    👑 Chủ phòng: <b style="color: #00ff00;">${room.host_name}</b> | Trạng thái: <span style="color: #ffcc00;">${room.status === 'playing' ? 'Đang tranh tài' : 'Chờ người chơi'}</span>
                </div>

                <!-- GHẾ NGỒI 4 HƯỚNG (ĐỎ, XANH DƯƠNG, VÀNG, XANH LÁ) -->
                <div style="background: #061a06; border: 2px solid #333; padding: 6px; border-radius: 6px; display: inline-block; max-width: 100%;">
                    <!-- Ghế Đỏ (Trên) -->
                    <div style="margin-bottom: 4px;">
                        ${seats[0] ? `
                            <div style="display: inline-flex; align-items: center; gap: 6px; background: #111; border: 1px solid #cc0000; padding: 2px 8px; border-radius: 4px;">
                                <img src="${seats[0].avatar || ''}" style="width: 18px; height: 18px; border-radius: 50%; object-fit: cover;">
                                <span style="font-size: 11px; color: #ff5555; font-weight: bold;">🔴 ${seats[0].display_name}</span>
                                ${Number(seats[0].user_id) === Number(user.id) ? `<button onclick="seatAction('leave')" style="background: #aa0000; color:#fff; border:none; padding:1px 4px; font-size:9px; border-radius:3px;">Rời</button>` : ''}
                            </div>
                        ` : `<button onclick="seatAction('sit', 0)" class="btn" style="background: #222; color: #ffcc00; font-size: 9px; padding: 3px 8px; border: 1px dashed #666;">+ Ghế Đỏ</button>`}
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 4px;">
                        <!-- Ghế Xanh Dương (Trái) -->
                        <div style="width: 75px; text-align: center;">
                            ${seats[1] ? `
                                <div style="display: inline-flex; flex-direction: column; align-items: center; background: #111; border: 1px solid #0033cc; padding: 3px; border-radius: 4px;">
                                    <img src="${seats[1].avatar || ''}" style="width: 18px; height: 18px; border-radius: 50%; object-fit: cover;">
                                    <span style="font-size: 9px; color: #3399ff; font-weight: bold; word-break: break-all;">🔵 ${seats[1].display_name}</span>
                                    ${Number(seats[1].user_id) === Number(user.id) ? `<button onclick="seatAction('leave')" style="background: #aa0000; color:#fff; border:none; padding:1px 3px; font-size:8px;">Rời</button>` : ''}
                                </div>
                            ` : `<button onclick="seatAction('sit', 1)" class="btn" style="background: #222; color: #ffcc00; font-size: 8px; padding: 4px 2px; border: 1px dashed #666;">+ Ghế Xanh</button>`}
                        </div>

                        <!-- BÀN CỜ LUDO ĐỒ HỌA SVG CHUẨN XÁC -->
                        <svg viewBox="0 0 500 500" style="width: 260px; height: 260px; background: #fff; border-radius: 4px; box-shadow: 0 0 8px rgba(0,0,0,0.6);">
                            <!-- 4 Góc Nhà Cờ -->
                            <rect x="0" y="0" width="200" height="200" fill="#cc0000" />
                            <circle cx="70" cy="70" r="15" fill="#fff" /><text x="70" y="75" font-size="12" text-anchor="middle">🐴</text>
                            <circle cx="130" cy="70" r="15" fill="#fff" /><text x="130" y="75" font-size="12" text-anchor="middle">🐴</text>
                            <circle cx="70" cy="130" r="15" fill="#fff" /><text x="70" y="135" font-size="12" text-anchor="middle">🐴</text>
                            <circle cx="130" cy="130" r="15" fill="#fff" /><text x="130" y="135" font-size="12" text-anchor="middle">🐴</text>

                            <rect x="300" y="0" width="200" height="200" fill="#00aa00" />
                            <circle cx="370" cy="70" r="15" fill="#fff" /><text x="370" y="75" font-size="12" text-anchor="middle">🐴</text>
                            <circle cx="430" cy="70" r="15" fill="#fff" /><text x="430" y="75" font-size="12" text-anchor="middle">🐴</text>
                            <circle cx="370" cy="130" r="15" fill="#fff" /><text x="370" y="135" font-size="12" text-anchor="middle">🐴</text>
                            <circle cx="430" cy="130" r="15" fill="#fff" /><text x="430" y="135" font-size="12" text-anchor="middle">🐴</text>

                            <rect x="0" y="300" width="200" height="200" fill="#0033cc" />
                            <circle cx="70" cy="370" r="15" fill="#fff" /><text x="70" y="375" font-size="12" text-anchor="middle">🐴</text>
                            <circle cx="130" cy="370" r="15" fill="#fff" /><text x="130" y="375" font-size="12" text-anchor="middle">🐴</text>
                            <circle cx="70" cy="430" r="15" fill="#fff" /><text x="70" y="435" font-size="12" text-anchor="middle">🐴</text>
                            <circle cx="130" cy="430" r="15" fill="#fff" /><text x="130" y="435" font-size="12" text-anchor="middle">🐴</text>

                            <rect x="300" y="300" width="200" height="200" fill="#ffcc00" />
                            <circle cx="370" cy="370" r="15" fill="#fff" /><text x="370" y="375" font-size="12" text-anchor="middle">🐴</text>
                            <circle cx="430" cy="370" r="15" fill="#fff" /><text x="430" y="375" font-size="12" text-anchor="middle">🐴</text>
                            <circle cx="370" cy="430" r="15" fill="#fff" /><text x="370" y="435" font-size="12" text-anchor="middle">🐴</text>
                            <circle cx="430" cy="430" r="15" fill="#fff" /><text x="430" y="435" font-size="12" text-anchor="middle">🐴</text>

                            <!-- Đường đi chữ thập -->
                            <rect x="200" y="0" width="100" height="200" fill="#f8f9fa" stroke="#e9ecef" />
                            <rect x="0" y="200" width="200" height="100" fill="#f8f9fa" stroke="#e9ecef" />
                            <rect x="300" y="200" width="200" height="100" fill="#f8f9fa" stroke="#e9ecef" />
                            <rect x="200" y="300" width="100" height="200" fill="#f8f9fa" stroke="#e9ecef" />

                            <!-- Ô sao an toàn -->
                            <text x="50" y="222" font-size="10" text-anchor="middle">⭐</text>
                            <text x="216" y="55" font-size="10" text-anchor="middle">⭐</text>
                            <text x="450" y="285" font-size="10" text-anchor="middle">⭐</text>
                            <text x="283" y="452" font-size="10" text-anchor="middle">⭐</text>

                            <!-- Tâm nhà chung -->
                            <polygon points="250,250 200,200 200,300" fill="#cc0000" />
                            <polygon points="250,250 200,200 300,200" fill="#00aa00" />
                            <polygon points="250,250 300,200 300,300" fill="#ffcc00" />
                            <polygon points="250,250 200,300 300,300" fill="#0033cc" />

                            <!-- QUÂN NGỰA DI CHUYỂN -->
                            <g id="gameToken">
                                <circle id="tokenRed" cx="70" cy="70" r="13" fill="#ff0000" stroke="#fff" stroke-width="2" style="transition: all 0.4s ease;" />
                                <text id="tokenText" x="70" y="74" font-size="10" text-anchor="middle" fill="#fff" font-weight="bold">1</text>
                            </g>
                        </svg>

                        <!-- Ghế Vàng (Phải) -->
                        <div style="width: 75px; text-align: center;">
                            ${seats[2] ? `
                                <div style="display: inline-flex; flex-direction: column; align-items: center; background: #111; border: 1px solid #ffcc00; padding: 3px; border-radius: 4px;">
                                    <img src="${seats[2].avatar || ''}" style="width: 18px; height: 18px; border-radius: 50%; object-fit: cover;">
                                    <span style="font-size: 9px; color: #ffcc00; font-weight: bold; word-break: break-all;">🟡 ${seats[2].display_name}</span>
                                    ${Number(seats[2].user_id) === Number(user.id) ? `<button onclick="seatAction('leave')" style="background: #aa0000; color:#fff; border:none; padding:1px 3px; font-size:8px;">Rời</button>` : ''}
                                </div>
                            ` : `<button onclick="seatAction('sit', 2)" class="btn" style="background: #222; color: #ffcc00; font-size: 8px; padding: 4px 2px; border: 1px dashed #666;">+ Ghế Vàng</button>`}
                        </div>
                    </div>

                    <!-- Ghế Xanh Lá (Dưới) -->
                    <div style="margin-top: 4px;">
                        ${seats[3] ? `
                            <div style="display: inline-flex; align-items: center; gap: 6px; background: #111; border: 1px solid #00aa00; padding: 2px 8px; border-radius: 4px;">
                                <img src="${seats[3].avatar || ''}" style="width: 18px; height: 18px; border-radius: 50%; object-fit: cover;">
                                <span style="font-size: 11px; color: #00ff00; font-weight: bold;">🟢 ${seats[3].display_name}</span>
                                ${Number(seats[3].user_id) === Number(user.id) ? `<button onclick="seatAction('leave')" style="background: #aa0000; color:#fff; border:none; padding:1px 4px; font-size:9px;">Rời</button>` : ''}
                            </div>
                        ` : `<button onclick="seatAction('sit', 3)" class="btn" style="background: #222; color: #ffcc00; font-size: 9px; padding: 3px 8px; border: 1px dashed #666;">+ Ghế Lá</button>`}
                    </div>
                </div>

                <!-- BẢNG ĐIỀU KHIỂN & ÂM THANH WEB AUDIO -->
                <div style="margin-top: 10px; background: #111; padding: 8px; border-radius: 6px; border: 1px solid #333;">
                    <div id="diceBox" style="font-size: 24px; font-weight: bold; color: #ffcc00; margin-bottom: 4px;">🎲 [ ⚀ ]</div>
                    <div id="gameTip" style="font-size: 11px; color: #ff5555; margin-bottom: 6px;">💡 Tung ra số 6 (⚅) để xuất quân khởi hành!</div>
                    <div style="display: flex; justify-content: center; gap: 8px;">
                        <button onclick="rollDice()" class="btn" style="background: #0055ff; padding: 6px 14px; font-size: 12px; font-weight: bold;">🎲 Tung Xúc Xắc</button>
                        ${isHost && room.status !== 'playing' ? `<button onclick="startMatch()" class="btn" style="background: #00aa00; padding: 6px 14px; font-size: 12px; font-weight: bold;">🚀 Bắt đầu</button>` : ''}
                    </div>
                </div>

                <!-- KHUNG CHAT -->
                <div style="margin-top: 8px; text-align: left;">
                    <div style="font-size: 10px; color: #888; margin-bottom: 3px;">💬 Chat phòng:</div>
                    <div id="chatScrollBox" style="height: 90px; overflow-y: scroll; background: #000; border: 1px solid #333; padding: 5px; font-size: 11px; display: flex; flex-direction: column; gap: 3px; margin-bottom: 5px;">
                        ${roomMessages.length === 0 ? '<div style="color: #555; text-align: center; margin-top: 25px;">Chưa có tin nhắn nào.</div>' : 
                            roomMessages.map(m => `<div><b style="color: #00ff00;">${m.username}:</b> <span style="color: #fff;">${m.message}</span></div>`).join('')}
                    </div>
                    <form id="chatForm" onsubmit="sendChat(event)" style="display: flex; gap: 4px;">
                        <input type="text" name="chat_message" id="chatInput" placeholder="Nhập chat..." autocomplete="off" style="flex: 1; background: #000; color: #fff; border: 1px solid #444; padding: 5px; font-size: 11px; border-radius: 3px;" required>
                        <button type="submit" class="btn" style="background: #00aa00; padding: 5px 10px; font-size: 11px;">Gửi</button>
                    </form>
                </div>

                <div style="margin-top: 8px;">
                    <a href="/game/ludo" class="btn" style="background: #aa0000; padding: 5px 10px; font-size: 10px;">⬅ Rời phòng</a>
                </div>
            </div>
        </div>

        <script>
            const chatScroll = document.getElementById('chatScrollBox');
            chatScroll.scrollTop = chatScroll.scrollHeight;

            // HỆ THỐNG ÂM THANH WEB AUDIO CHUẨN XÁC (KHÔNG CẦN TẢI FILE NGOÀI)
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            function playSound(type) {
                if (!audioCtx) return;
                if (audioCtx.state === 'suspended') audioCtx.resume();
                
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain);
                gain.connect(audioCtx.destination);

                if (type === 'dice') {
                    osc.frequency.setValueAtTime(300, audioCtx.currentTime);
                    osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.15);
                    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
                    gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
                    osc.start();
                    osc.stop(audioCtx.currentTime + 0.15);
                } else if (type === 'move') {
                    osc.frequency.setValueAtTime(600, audioCtx.currentTime);
                    osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.1);
                    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
                    gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
                    osc.start();
                    osc.stop(audioCtx.currentTime + 0.1);
                }
            }

            let posIndex = 0;
            const pathCoords = [
                {cx: 70, cy: 70}, {cx: 50, cy: 216}, {cx: 83, cy: 216}, {cx: 116, cy: 216},
                {cx: 149, cy: 216}, {cx: 182, cy: 216}, {cx: 216, cy: 182}, {cx: 216, cy: 149},
                {cx: 216, cy: 116}, {cx: 216, cy: 83}, {cx: 216, cy: 50}, {cx: 250, cy: 50},
                {cx: 283, cy: 50}, {cx: 283, cy: 83}, {cx: 283, cy: 116}, {cx: 283, cy: 149},
                {cx: 283, cy: 182}, {cx: 316, cy: 216}, {cx: 349, cy: 216}, {cx: 382, cy: 216}
            ];

            async function seatAction(action, seatIndex = null) {
                const fd = new FormData();
                fd.append('action', action);
                if (seatIndex !== null) fd.append('seat_index', seatIndex);
                try {
                    const res = await fetch(window.location.href, { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' }, body: fd });
                    if (res.ok) location.reload();
                } catch(e) { location.reload(); }
            }

            async function startMatch() {
                const fd = new FormData();
                fd.append('action', 'start');
                await fetch(window.location.href, { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' }, body: fd });
                location.reload();
            }

            function rollDice() {
                playSound('dice');
                const faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
                const box = document.getElementById('diceBox');
                let count = 0;
                
                const timer = setInterval(() => {
                    box.innerText = '🎲 [ ' + faces[Math.floor(Math.random() * 6)] + ' ]';
                    count++;
                    if (count > 7) {
                        clearInterval(timer);
                        const finalVal = Math.floor(Math.random() * 6) + 1;
                        box.innerText = '🎲 [ ' + faces[finalVal - 1] + ' ] (Ra ' + finalVal + ')';
                        
                        if (posIndex === 0) {
                            if (finalVal === 6) {
                                posIndex = 1;
                                document.getElementById('gameTip').innerText = '🎉 Ra số 6! Ngựa đã xuất chuồng!';
                                moveTokenTo(posIndex);
                            } else {
                                document.getElementById('gameTip').innerText = '⚠️ Chưa ra số 6, chưa được xuất quân.';
                            }
                        } else {
                            posIndex = (posIndex + finalVal) % pathCoords.length;
                            if (posIndex === 0) posIndex = 1;
                            document.getElementById('gameTip').innerText = '🐎 Ngựa di chuyển ' + finalVal + ' bước!';
                            moveTokenTo(posIndex);
                        }
                        playSound('move');
                    }
                }, 40);
            }

            function moveTokenTo(idx) {
                const coord = pathCoords[idx] || pathCoords[1];
                const token = document.getElementById('tokenRed');
                const text = document.getElementById('tokenText');
                if (token && text) {
                    token.setAttribute('cx', coord.cx);
                    token.setAttribute('cy', coord.cy);
                    text.setAttribute('x', coord.cx);
                    text.setAttribute('y', coord.cy + 4);
                }
            }

            async function sendChat(e) {
                e.preventDefault();
                const inp = document.getElementById('chatInput');
                if (!inp.value.trim()) return;
                const fd = new FormData(document.getElementById('chatForm'));
                try {
                    const res = await fetch(window.location.href, { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' }, body: fd });
                    if (res.ok) { inp.value = ''; location.reload(); }
                } catch(e) { document.getElementById('chatForm').submit(); }
            }
        </script>
        `;

        return new Response(renderLayout(`Phòng Ludo: ${room.room_name}`, content, user), {
            headers: { 'Content-Type': 'text/html;charset=UTF-8' }
        });
    }

    // 3. Sảnh danh sách phòng Ludo
    let rooms = [];
    try {
        const r = await env.DB.prepare("SELECT * FROM ludo_rooms ORDER BY id DESC LIMIT 20").all();
        rooms = r.results || [];
    } catch (e) {}

    const content = `
    <div class="box">
        <div class="box-title" style="display: flex; justify-content: space-between; align-items: center;">
            <span>🎲 Sảnh Ludo Master</span>
            <a href="#createModal" onclick="document.getElementById('createForm').style.display='block'" class="btn" style="background: #00aa00; font-size: 11px; padding: 4px 8px;">➕ Tạo phòng</a>
        </div>
        <div class="box-content" style="padding: 10px;">
            <div id="createForm" style="display: none; background: #111; border: 1px solid #444; padding: 10px; border-radius: 6px; margin-bottom: 12px;">
                <h4 style="margin-bottom: 8px; font-size: 13px; color: #ffcc00;">Tạo Bàn Ludo Mới</h4>
                <form action="/game/ludo/create" method="POST" style="display: flex; flex-direction: column; gap: 8px;">
                    <div>
                        <label style="font-size: 11px; color: #aaa;">Tên phòng:</label>
                        <input type="text" name="room_name" value="Bàn của ${user.display_name || user.username}" style="width: 100%; background: #000; color: #fff; border: 1px solid #444; padding: 6px; font-size: 12px; border-radius: 4px;" required>
                    </div>
                    <div>
                        <label style="font-size: 11px; color: #aaa;">Tiền cược (Xu):</label>
                        <input type="number" name="bet_amount" value="0" min="0" style="width: 100%; background: #000; color: #fff; border: 1px solid #444; padding: 6px; font-size: 12px; border-radius: 4px;" required>
                    </div>
                    <div style="display: flex; gap: 6px;">
                        <button type="submit" class="btn" style="background: #0055ff; padding: 6px 12px; font-size: 12px;">Tạo ngay</button>
                        <button type="button" onclick="document.getElementById('createForm').style.display='none'" class="btn" style="background: #444; padding: 6px 12px; font-size: 12px;">Hủy</button>
                    </div>
                </form>
            </div>

            <div style="display: flex; flex-direction: column; gap: 6px;">
                ${rooms.length === 0 ? '<div style="color: #777; text-align: center; padding: 30px;">Chưa có bàn chơi nào được tạo.</div>' : 
                    rooms.map(room => `
                    <div style="background: #111; border: 1px solid #333; padding: 10px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-size: 13px; font-weight: bold; color: #ffcc00;">🔒 ${room.room_name}</div>
                            <div style="font-size: 11px; color: #888;">Chủ bàn: <span style="color: #00ff00;">${room.host_name}</span> | Cược: ${room.bet_amount.toLocaleString()} xu</div>
                        </div>
                        <div>
                            <a href="/game/ludo/room?id=${room.id}" class="btn" style="background: #0055ff; padding: 6px 12px; font-size: 11px; font-weight: bold;">Vào bàn</a>
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

    return new Response(renderLayout('Sảnh Ludo Master', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
