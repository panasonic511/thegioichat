
// ============================================================
// THE GIOI CHAT - LUDO GAME
// Cloudflare Workers + D1
// Server-authoritative game
// Real coin betting: DISABLED
// ============================================================

const MAX_PLAYERS = 4;
const MIN_PLAYERS = 2;
const MAX_CHAT_LENGTH = 300;

const COLORS = ["Đỏ", "Xanh dương", "Vàng", "Xanh lá"];
const COLOR_HEX = ["#e53935", "#1e88e5", "#fdd835", "#43a047"];

// ============================================================
// COMMON HELPERS
// ============================================================

function html(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[c]);
}

function int(value, min, max) {
    const n = Number(value);
    return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json; charset=UTF-8",
            "Cache-Control": "no-store"
        }
    });
}

function isAjax(request) {
    return request.headers.get("X-Requested-With") === "XMLHttpRequest" ||
        (request.headers.get("Accept") || "").includes("application/json");
}

function randomDie() {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    return (bytes[0] % 6) + 1;
}

// ============================================================
// GAME STATE
// ============================================================

function initialState(players) {
    const ordered = [...players].sort(
        (a, b) => Number(a.seat_index) - Number(b.seat_index)
    );

    return {
        version: 1,
        current: 0,
        dice: null,
        status: "playing",
        winner_id: null,

        players: ordered.map(p => ({
            user_id: Number(p.user_id),
            seat_index: Number(p.seat_index),
            name: p.display_name || p.username || "Người chơi",
            color: COLORS[Number(p.seat_index)],
            pieces: [-1, -1, -1, -1]
        }))
    };
}

function validGameState(state) {
    if (!state || typeof state !== "object") return false;
    if (!Array.isArray(state.players)) return false;
    if (state.players.length < MIN_PLAYERS || state.players.length > MAX_PLAYERS) return false;
    if (!Number.isInteger(state.current)) return false;
    if (state.current < 0 || state.current >= state.players.length) return false;

    return state.players.every(p =>
        Number.isInteger(Number(p.user_id)) &&
        Number.isInteger(Number(p.seat_index)) &&
        Array.isArray(p.pieces) &&
        p.pieces.length === 4
    );
}

// -1: Trong chuồng
// 0..51: Đường chạy
// 52..57: Đường về đích

function legalPieces(player, dice) {
    const result = [];

    player.pieces.forEach((position, index) => {
        if (position === -1 && dice === 6) {
            result.push(index);
        } else if (
            position >= 0 &&
            position < 57 &&
            position + dice <= 57
        ) {
            result.push(index);
        }
    });

    return result;
}

function nextPlayer(state) {
    state.current = (state.current + 1) % state.players.length;
    state.dice = null;
}

function applyMove(state, playerIndex, pieceIndex, dice) {
    const player = state.players[playerIndex];

    const oldPosition = player.pieces[pieceIndex];
    const newPosition = oldPosition === -1 ? 0 : oldPosition + dice;

    player.pieces[pieceIndex] = newPosition;

    // Các ô an toàn
    const safe = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

    // Ăn quân đối phương trên đường chạy chung
    if (newPosition <= 51) {
        const absolute = (
            Number(player.seat_index) * 13 + newPosition
        ) % 52;

        if (!safe.has(absolute)) {
            for (const opponent of state.players) {
                if (opponent.user_id === player.user_id) continue;

                opponent.pieces = opponent.pieces.map(pos => {
                    if (pos < 0 || pos > 51) return pos;

                    const opponentAbsolute = (
                        Number(opponent.seat_index) * 13 + pos
                    ) % 52;

                    return opponentAbsolute === absolute ? -1 : pos;
                });
            }
        }
    }

    const won = player.pieces.every(pos => pos === 57);

    if (won) {
        state.status = "finished";
        state.winner_id = player.user_id;
        state.dice = null;
    } else if (dice !== 6) {
        nextPlayer(state);
    } else {
        // Tung được 6 thì được thêm lượt
        state.dice = null;
    }

    return {
        oldPosition,
        newPosition,
        won
    };
}

// ============================================================
// DATABASE
// ============================================================

async function ensureTables(db) {
    await db.prepare(`
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

    await db.prepare(`
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

    await db.prepare(`
        CREATE TABLE IF NOT EXISTS ludo_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id INTEGER,
            user_id INTEGER,
            username TEXT,
            message TEXT,
            created_at TEXT
        )
    `).run();

    await db.prepare(`
        CREATE TABLE IF NOT EXISTS ludo_game_states (
            room_id INTEGER PRIMARY KEY,
            current_seat INTEGER DEFAULT 0,
            dice_value INTEGER DEFAULT 0,
            dice_rolled INTEGER DEFAULT 0,
            game_state TEXT NOT NULL,
            winner_id INTEGER,
            turn_number INTEGER DEFAULT 0,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `).run();

    await db.prepare(`
        CREATE TABLE IF NOT EXISTS ludo_moves (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            seat_index INTEGER NOT NULL,
            piece_index INTEGER NOT NULL,
            dice_value INTEGER NOT NULL,
            old_position INTEGER NOT NULL,
            new_position INTEGER NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `).run();
}

async function getRoom(db, roomId) {
    return db.prepare(
        "SELECT * FROM ludo_rooms WHERE id = ?"
    ).bind(roomId).first();
}

async function getPlayers(db, roomId) {
    const result = await db.prepare(`
        SELECT * FROM ludo_players
        WHERE room_id = ?
        ORDER BY seat_index
    `).bind(roomId).all();

    return result.results || [];
}

async function getGameState(db, roomId) {
    return db.prepare(`
        SELECT * FROM ludo_game_states
        WHERE room_id = ?
    `).bind(roomId).first();
}

// ============================================================
// SAVE GAME STATE
// ============================================================

async function saveState(db, roomId, oldJson, state, move) {
    const newJson = JSON.stringify(state);

    const statements = [
        db.prepare(`
            UPDATE ludo_game_states
            SET
                game_state = ?,
                current_seat = ?,
                dice_value = ?,
                dice_rolled = ?,
                winner_id = ?,
                turn_number = turn_number + 1,
                updated_at = datetime('now')
            WHERE room_id = ?
            AND game_state = ?
        `).bind(
            newJson,
            state.players[state.current]?.seat_index ?? 0,
            state.dice || 0,
            state.dice === null ? 0 : 1,
            state.winner_id,
            roomId,
            oldJson
        )
    ];

    if (move) {
        statements.push(
            db.prepare(`
                INSERT INTO ludo_moves (
                    room_id,
                    user_id,
                    seat_index,
                    piece_index,
                    dice_value,
                    old_position,
                    new_position,
                    created_at
                )
                SELECT ?, ?, ?, ?, ?, ?, ?, datetime('now')
                WHERE EXISTS (
                    SELECT 1
                    FROM ludo_game_states
                    WHERE room_id = ?
                    AND game_state = ?
                )
            `).bind(
                roomId,
                move.user_id,
                move.seat_index,
                move.piece_index,
                move.dice,
                move.oldPosition,
                move.newPosition,
                roomId,
                newJson
            )
        );
    }

    const results = await db.batch(statements);

    return Number(results?.[0]?.meta?.changes || 0) === 1;
}

// ============================================================
// START OR REPAIR GAME
// ============================================================

async function startOrRepairGame(db, roomId, players) {
    if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
        return {
            success: false,
            error: "Cần từ 2 đến 4 người để bắt đầu."
        };
    }

    let existing = await getGameState(db, roomId);

    // Nếu đã có trạng thái hợp lệ thì không ghi đè.
    if (existing && existing.game_state) {
        try {
            const parsed = JSON.parse(existing.game_state);

            if (validGameState(parsed)) {
                await db.prepare(`
                    UPDATE ludo_rooms
                    SET status = 'playing'
                    WHERE id = ?
                    AND status IN ('waiting', 'playing')
                `).bind(roomId).run();

                return {
                    success: true,
                    repaired: true
                };
            }
        } catch (e) {
            return {
                success: false,
                error: "Dữ liệu bàn cờ hiện tại bị lỗi. Không tự ý ghi đè dữ liệu."
            };
        }

        return {
            success: false,
            error: "Dữ liệu bàn cờ không hợp lệ. Cần kiểm tra trước khi khôi phục."
        };
    }

    const state = initialState(players);
    const stateJson = JSON.stringify(state);

    // Chỉ tạo khi chưa tồn tại trạng thái.
    await db.prepare(`
        INSERT OR IGNORE INTO ludo_game_states (
            room_id,
            current_seat,
            dice_value,
            dice_rolled,
            game_state,
            winner_id,
            turn_number
        )
        SELECT ?, ?, 0, 0, ?, NULL, 0
        WHERE EXISTS (
            SELECT 1 FROM ludo_rooms
            WHERE id = ?
            AND status IN ('waiting', 'playing')
        )
    `).bind(
        roomId,
        state.players[0].seat_index,
        stateJson,
        roomId
    ).run();

    // Đọc lại để xác nhận dữ liệu đã được lưu.
    existing = await getGameState(db, roomId);

    if (!existing || !existing.game_state) {
        return {
            success: false,
            error: "Không thể tạo bàn cờ trong D1."
        };
    }

    let saved;

    try {
        saved = JSON.parse(existing.game_state);
    } catch (e) {
        return {
            success: false,
            error: "Dữ liệu bàn cờ trong D1 không hợp lệ."
        };
    }

    if (!validGameState(saved)) {
        return {
            success: false,
            error: "Dữ liệu bàn cờ không hợp lệ."
        };
    }

    // Chỉ chuyển phòng sang playing sau khi xác nhận có bàn cờ.
    await db.prepare(`
        UPDATE ludo_rooms
        SET status = 'playing'
        WHERE id = ?
        AND status IN ('waiting', 'playing')
    `).bind(roomId).run();

    const fresh = await getRoom(db, roomId);

    if (!fresh || fresh.status !== "playing") {
        return {
            success: false,
            error: "Không thể cập nhật trạng thái phòng."
        };
    }

    return {
        success: true,
        repaired: true
    };
}

// ============================================================
// ROOM ACTIONS
// ============================================================

async function handleRoomAction(request, env, user, roomId) {
    const form = await request.formData();
    const action = String(form.get("action") || "");
    const db = env.DB;

    const room = await getRoom(db, roomId);

    if (!room) {
        return json({
            success: false,
            error: "Phòng không tồn tại."
        }, 404);
    }

    const players = await getPlayers(db, roomId);

    const me = players.find(
        p => Number(p.user_id) === Number(user.id)
    );

    // --------------------------------------------------------
    // SIT
    // --------------------------------------------------------

    if (action === "sit") {
        if (room.status !== "waiting") {
            return json({
                success: false,
                error: "Trận đấu đã bắt đầu."
            }, 409);
        }

        if (me) {
            return json({
                success: true,
                message: "Bạn đã có ghế."
            });
        }

        if (players.length >= MAX_PLAYERS) {
            return json({
                success: false,
                error: "Phòng đã đủ 4 người."
            }, 409);
        }

        const seat = int(form.get("seat_index"), 0, 3);

        if (seat === null) {
            return json({
                success: false,
                error: "Ghế không hợp lệ."
            }, 400);
        }

        if (players.some(p => Number(p.seat_index) === seat)) {
            return json({
                success: false,
                error: "Ghế này đã có người."
            }, 409);
        }

        try {
            await db.prepare(`
                INSERT INTO ludo_players (
                    room_id,
                    seat_index,
                    user_id,
                    username,
                    display_name,
                    avatar
                )
                SELECT ?, ?, ?, ?, ?, ?
                WHERE EXISTS (
                    SELECT 1 FROM ludo_rooms
                    WHERE id = ?
                    AND status = 'waiting'
                )
                AND (
                    SELECT COUNT(*)
                    FROM ludo_players
                    WHERE room_id = ?
                ) < 4
            `).bind(
                roomId,
                seat,
                user.id,
                user.username,
                user.display_name || user.username,
                user.avatar || "",
                roomId,
                roomId
            ).run();

            const check = await db.prepare(`
                SELECT id FROM ludo_players
                WHERE room_id = ?
                AND user_id = ?
            `).bind(roomId, user.id).first();

            return check
                ? json({
                    success: true,
                    message: "Đã vào ghế."
                })
                : json({
                    success: false,
                    error: "Không thể chiếm ghế. Hãy tải lại phòng."
                }, 409);

        } catch (e) {
            return json({
                success: false,
                error: "Ghế đã có người hoặc bạn đã ở trong phòng."
            }, 409);
        }
    }

    // --------------------------------------------------------
    // LEAVE
    // --------------------------------------------------------

    if (action === "leave") {
        if (room.status !== "waiting") {
            return json({
                success: false,
                error: "Trận đã bắt đầu; không thể tự rời ghế."
            }, 409);
        }

        if (!me) {
            return json({
                success: false,
                error: "Bạn chưa ngồi trong phòng."
            }, 400);
        }

        await db.prepare(`
            DELETE FROM ludo_players
            WHERE room_id = ?
            AND user_id = ?
        `).bind(roomId, user.id).run();

        if (Number(room.host_id) === Number(user.id)) {
            const remaining = await getPlayers(db, roomId);

            if (remaining.length) {
                await db.prepare(`
                    UPDATE ludo_rooms
                    SET host_id = ?, host_name = ?
                    WHERE id = ?
                `).bind(
                    remaining[0].user_id,
                    remaining[0].display_name || remaining[0].username,
                    roomId
                ).run();
            } else {
                await db.prepare(`
                    DELETE FROM ludo_rooms
                    WHERE id = ?
                `).bind(roomId).run();
            }
        }

        return json({
            success: true,
            message: "Đã rời phòng."
        });
    }

    // --------------------------------------------------------
    // START / REPAIR
    // --------------------------------------------------------

    if (action === "start") {
        if (Number(room.host_id) !== Number(user.id)) {
            return json({
                success: false,
                error: "Chỉ chủ phòng mới được bắt đầu."
            }, 403);
        }

        if (room.status !== "waiting" && room.status !== "playing") {
            return json({
                success: false,
                error: "Phòng không thể bắt đầu ở trạng thái hiện tại."
            }, 409);
        }

        const result = await startOrRepairGame(db, roomId, players);

        if (!result.success) {
            return json({
                success: false,
                error: result.error
            }, 500);
        }

        return json({
            success: true,
            message: "Bàn cờ đã được khởi tạo thành công!"
        });
    }

    // --------------------------------------------------------
    // ROLL / MOVE
    // --------------------------------------------------------

    if (action === "roll" || action === "move") {
        if (room.status !== "playing") {
            return json({
                success: false,
                error: "Trận chưa bắt đầu hoặc đã kết thúc."
            }, 409);
        }

        if (!me) {
            return json({
                success: false,
                error: "Bạn không ở trong phòng."
            }, 403);
        }

        const record = await db.prepare(`
            SELECT game_state
            FROM ludo_game_states
            WHERE room_id = ?
        `).bind(roomId).first();

        if (!record || !record.game_state) {
            return json({
                success: false,
                error: "Chưa có trạng thái trận đấu."
            }, 409);
        }

        let state;

        try {
            state = JSON.parse(record.game_state);
        } catch (e) {
            return json({
                success: false,
                error: "Dữ liệu trận đấu bị lỗi."
            }, 500);
        }

        if (!validGameState(state)) {
            return json({
                success: false,
                error: "Cấu trúc bàn cờ không hợp lệ."
            }, 500);
        }

        const playerIndex = state.players.findIndex(
            p => Number(p.user_id) === Number(user.id)
        );

        if (playerIndex < 0) {
            return json({
                success: false,
                error: "Bạn không có trong trận."
            }, 403);
        }

        if (state.status !== "playing") {
            return json({
                success: false,
                error: "Trận đấu đã kết thúc."
            }, 409);
        }

        if (state.current !== playerIndex) {
            return json({
                success: false,
                error: "Chưa đến lượt của bạn."
            }, 409);
        }

        // TUNG XÚC XẮC
        if (action === "roll") {
            if (state.dice !== null) {
                return json({
                    success: false,
                    error: "Bạn phải đi quân trước."
                }, 409);
            }

            const dice = randomDie();

            state.dice = dice;

            const legal = legalPieces(
                state.players[playerIndex],
                dice
            );

            if (!legal.length) {
                nextPlayer(state);
            }

            const saved = await saveState(
                db,
                roomId,
                record.game_state,
                state,
                null
            );

            if (!saved) {
                return json({
                    success: false,
                    error: "Lượt đã thay đổi. Hãy tải lại."
                }, 409);
            }

            return json({
                success: true,
                dice,
                legal,
                state
            });
        }

        // DI CHUYỂN QUÂN
        if (state.dice === null) {
            return json({
                success: false,
                error: "Bạn cần gieo xúc xắc trước."
            }, 409);
        }

        const piece = int(form.get("piece_index"), 0, 3);

        if (piece === null) {
            return json({
                success: false,
                error: "Quân cờ không hợp lệ."
            }, 400);
        }

        const legal = legalPieces(
            state.players[playerIndex],
            state.dice
        );

        if (!legal.includes(piece)) {
            return json({
                success: false,
                error: "Quân này không thể di chuyển."
            }, 400);
        }

        const dice = state.dice;

        const result = applyMove(
            state,
            playerIndex,
            piece,
            dice
        );

        const move = {
            user_id: Number(user.id),
            seat_index: Number(state.players[playerIndex].seat_index),
            piece_index: piece,
            dice,
            oldPosition: result.oldPosition,
            newPosition: result.newPosition
        };

        const saved = await saveState(
            db,
            roomId,
            record.game_state,
            state,
            move
        );

        if (!saved) {
            return json({
                success: false,
                error: "Nước đi bị trùng hoặc lượt đã đổi."
            }, 409);
        }

        if (result.won) {
            await db.prepare(`
                UPDATE ludo_rooms
                SET status = 'finished'
                WHERE id = ?
                AND status = 'playing'
            `).bind(roomId).run();
        }

        return json({
            success: true,
            result,
            state
        });
    }

    // --------------------------------------------------------
    // CHAT
    // --------------------------------------------------------

    if (action === "chat") {
        if (!me) {
            return json({
                success: false,
                error: "Bạn chưa ở trong phòng."
            }, 403);
        }

        const message = String(
            form.get("chat_message") || ""
        ).trim().slice(0, MAX_CHAT_LENGTH);

        if (!message) {
            return json({
                success: false,
                error: "Tin nhắn không được để trống."
            }, 400);
        }

        await db.prepare(`
            INSERT INTO ludo_messages (
                room_id,
                user_id,
                username,
                message,
                created_at
            )
            VALUES (?, ?, ?, ?, datetime('now'))
        `).bind(
            roomId,
            user.id,
            user.username || "Người chơi",
            message
        ).run();

        return json({
            success: true,
            message: "Đã gửi tin nhắn."
        });
    }

    return json({
        success: false,
        error: "Hành động không hợp lệ."
    }, 400);
}

// ============================================================
// BOARD DISPLAY
// ============================================================

function boardMarkup(state, myId) {
    if (!state) {
        return `
            <div class="notice">
                Trận đấu chưa bắt đầu hoặc bàn cờ chưa được khởi tạo.
            </div>
        `;
    }

    if (!validGameState(state)) {
        return `
            <div class="notice">
                Dữ liệu bàn cờ không hợp lệ.
            </div>
        `;
    }

    const active = state.players[state.current];

    const rows = state.players.map(p => `
        <div class="player-row">
            <b style="color:${COLOR_HEX[p.seat_index]}">
                ${html(p.color)} — ${html(p.name)}
            </b>

            ${Number(p.user_id) === Number(myId) ? " (Bạn)" : ""}

            <span>
                ${p.pieces.map((v, i) => `
                    Q${i + 1}:
                    ${v === -1
                        ? "Trong chuồng"
                        : v === 57
                            ? "Về đích"
                            : `Ô ${v + 1}`}
                `).join(" · ")}
            </span>
        </div>
    `).join("");

    const canRoll =
        active &&
        Number(active.user_id) === Number(myId) &&
        state.dice === null &&
        state.status === "playing";

    const canMove =
        active &&
        Number(active.user_id) === Number(myId) &&
        state.dice !== null &&
        state.status === "playing";

    const legal = canMove
        ? legalPieces(active, state.dice)
        : [];

    return `
        <div class="game-panel">
            <div class="dice">
                ${state.dice === null
                    ? "🎲 Chưa tung"
                    : `🎲 Kết quả: ${state.dice}`}
            </div>

            <p>
                ${state.status === "finished"
                    ? `🏆 Người chiến thắng: ${
                        html(
                            state.players.find(
                                p => Number(p.user_id) === Number(state.winner_id)
                            )?.name || "Không rõ"
                        )
                    }`
                    : `Đến lượt: ${html(active?.name || "")}`}
            </p>

            ${canRoll
                ? `<button class="btn" onclick="ludoAction('roll')">
                    🎲 Tung xúc xắc
                   </button>`
                : ""}

            ${canMove
                ? `<div class="piece-buttons">
                    ${legal.map(i => `
                        <button class="btn" onclick="ludoMove(${i})">
                            Di chuyển quân ${i + 1}
                        </button>
                    `).join("") || "Không có quân hợp lệ."}
                   </div>`
                : ""}
        </div>

        <div class="players">
            ${rows}
        </div>
    `;
}

// ============================================================
// MAIN ROUTER
// ============================================================

export async function handleGameLudo(
    request,
    env,
    user,
    renderLayout,
    url
) {
    const path = url.pathname;

    try {
        await ensureTables(env.DB);
    } catch (e) {
        return new Response(
            "Không thể khởi tạo dữ liệu Ludo. Vui lòng kiểm tra cấu trúc D1.",
            { status: 500 }
        );
    }

    // ========================================================
    // CREATE ROOM
    // ========================================================

    if (path === "/game/ludo/create" && request.method === "POST") {
        const form = await request.formData();

        const roomName = String(
            form.get("room_name") ||
            `Bàn đấu của ${user.display_name || user.username}`
        ).trim().slice(0, 60) || "Phòng Ludo";

        const bet = int(
            form.get("bet_amount") || 0,
            0,
            100000000
        );

        if (bet === null) {
            return new Response(
                "Mức cược không hợp lệ.",
                { status: 400 }
            );
        }

        try {
            const result = await env.DB.prepare(`
                INSERT INTO ludo_rooms (
                    room_name,
                    host_id,
                    host_name,
                    bet_amount,
                    status,
                    created_at
                )
                VALUES (?, ?, ?, ?, 'waiting', datetime('now'))
            `).bind(
                roomName,
                user.id,
                user.display_name || user.username,
                bet
            ).run();

            const roomId = result.meta.last_row_id;

            await env.DB.prepare(`
                INSERT INTO ludo_players (
                    room_id,
                    seat_index,
                    user_id,
                    username,
                    display_name,
                    avatar
                )
                VALUES (?, 0, ?, ?, ?, ?)
            `).bind(
                roomId,
                user.id,
                user.username,
                user.display_name || user.username,
                user.avatar || ""
            ).run();

            return Response.redirect(
                new URL(`/game/ludo/room?id=${roomId}`, request.url),
                302
            );

        } catch (e) {
            return new Response(
                "Không thể tạo phòng Ludo. Vui lòng thử lại.",
                { status: 500 }
            );
        }
    }

    // ========================================================
    // ROOM PAGE
    // ========================================================

    if (path === "/game/ludo/room") {
        const roomId = int(
            url.searchParams.get("id"),
            1,
            2147483647
        );

        if (!roomId) {
            return Response.redirect(
                new URL("/game/ludo", request.url),
                302
            );
        }

        // POST ACTION
        if (request.method === "POST") {
            try {
                const result = await handleRoomAction(
                    request,
                    env,
                    user,
                    roomId
                );

                if (isAjax(request)) return result;

                if (!result.ok) return result;

                return Response.redirect(
                    new URL(`/game/ludo/room?id=${roomId}`, request.url),
                    302
                );

            } catch (e) {
                return isAjax(request)
                    ? json({
                        success: false,
                        error: "Máy chủ không xử lý được yêu cầu."
                    }, 500)
                    : new Response(
                        "Không xử lý được yêu cầu Ludo.",
                        { status: 500 }
                    );
            }
        }

        // GET ROOM
        const room = await getRoom(env.DB, roomId);

        if (!room) {
            return new Response(
                "Phòng chơi không tồn tại hoặc đã bị giải tán.",
                { status: 404 }
            );
        }

        const players = await getPlayers(env.DB, roomId);

        const mySeat = players.find(
            p => Number(p.user_id) === Number(user.id)
        );

        const stateRow = await getGameState(env.DB, roomId);

        let state = null;

        if (stateRow?.game_state) {
            try {
                const parsed = JSON.parse(stateRow.game_state);

                if (validGameState(parsed)) {
                    state = parsed;
                }
            } catch (e) {
                state = null;
            }
        }

        // Phòng playing nhưng không có bàn cờ.
        const needsStateRepair =
            room.status === "playing" && !state;

        // STATE API
        if (url.searchParams.get("state") === "1") {
            const messages = await env.DB.prepare(`
                SELECT id, username, message, created_at
                FROM ludo_messages
                WHERE room_id = ?
                ORDER BY id DESC
                LIMIT 30
            `).bind(roomId).all();

            return json({
                success: true,
                room,
                players,
                state,
                needsStateRepair,
                messages: (messages.results || []).reverse()
            });
        }

        // CHAT HISTORY
        const messageResult = await env.DB.prepare(`
            SELECT id, username, message, created_at
            FROM ludo_messages
            WHERE room_id = ?
            ORDER BY id DESC
            LIMIT 30
        `).bind(roomId).all();

        const messages = (messageResult.results || []).reverse();

        const isHost =
            Number(room.host_id) === Number(user.id);

        const seats = [0, 1, 2, 3].map(i =>
            players.find(p => Number(p.seat_index) === i)
        );

        const seatsHtml = seats.map((p, i) => {
            if (p) {
                return `
                    <div class="seat" style="border-color:${COLOR_HEX[i]}">
                        <b style="color:${COLOR_HEX[i]}">${COLORS[i]}</b>
                        <br>
                        ${html(p.display_name || p.username)}

                        ${Number(p.user_id) === Number(user.id)
                            && room.status === "waiting"
                            ? `<br>
                               <button class="btn small"
                                   onclick="ludoAction('leave')">
                                   Rời ghế
                               </button>`
                            : ""}
                    </div>
                `;
            }

            return `
                <div class="seat empty">
                    <b>${COLORS[i]}</b>
                    <br>
                    ${room.status === "waiting"
                        ? `<button class="btn small"
                            onclick="ludoAction('sit', ${i})">
                            + Chọn ghế
                           </button>`
                        : "Trống"}
                </div>
            `;
        }).join("");

        // ====================================================
        // ROOM HTML
        // ====================================================

        const content = `
        <style>
            .ludo-wrap {
                background: #101510;
                color: #eee;
                padding: 12px;
                border-radius: 8px;
            }

            .ludo-head {
                display: flex;
                justify-content: space-between;
                gap: 8px;
                flex-wrap: wrap;
                color: #ffd54f;
            }

            .seat-grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 7px;
                margin: 12px 0;
            }

            .seat {
                background: #080b08;
                border: 2px solid #555;
                border-radius: 7px;
                padding: 9px;
                text-align: center;
                overflow-wrap: anywhere;
            }

            .seat.empty {
                border-style: dashed;
                color: #aaa;
            }

            .btn {
                background: #1565c0;
                color: #fff;
                border: 0;
                border-radius: 5px;
                padding: 8px 12px;
                margin: 3px;
                cursor: pointer;
            }

            .btn:disabled {
                opacity: .5;
                cursor: not-allowed;
            }

            .btn.small {
                padding: 4px 7px;
                font-size: 11px;
            }

            .game-panel {
                background: #080b08;
                border: 1px solid #444;
                border-radius: 7px;
                padding: 12px;
                text-align: center;
                margin: 10px 0;
            }

            .dice {
                font-size: 23px;
                color: #ffd54f;
                font-weight: bold;
                margin-bottom: 8px;
            }

            .players {
                display: grid;
                gap: 6px;
                margin-top: 10px;
            }

            .player-row {
                background: #080b08;
                padding: 8px;
                border-radius: 5px;
                font-size: 12px;
            }

            .player-row span {
                display: block;
                color: #bbb;
                margin-top: 4px;
            }

            .chat-box {
                height: 150px;
                overflow: auto;
                background: #050505;
                border: 1px solid #444;
                padding: 8px;
                font-size: 12px;
            }

            .chat-line {
                margin: 4px 0;
                overflow-wrap: anywhere;
            }

            .chat-line b {
                color: #80cbc4;
            }

            .notice {
                padding: 12px;
                background: #222;
                border-radius: 6px;
            }

            #chatForm {
                display: flex;
                gap: 5px;
                margin-top: 6px;
            }

            #chatInput {
                min-width: 0;
                flex: 1;
                background: #000;
                color: #fff;
                border: 1px solid #555;
                padding: 8px;
            }
        </style>

        <div class="ludo-wrap">

            <div class="ludo-head">
                <b>🎲 Ludo — ${html(room.room_name)}</b>

                <b>
                    Cược hiển thị:
                    ${Number(room.bet_amount || 0).toLocaleString("vi-VN")} xu
                </b>
            </div>

            <p style="font-size:12px;color:#bbb">
                Chủ phòng: ${html(room.host_name)}
                · Trạng thái: ${html(room.status)}
            </p>

            <p style="font-size:11px;color:#ffcc80">
                Bản thử nghiệm: cược xu thật đang bị khóa.
                Không có xu nào bị trừ hoặc cộng.
            </p>

            <div class="seat-grid">
                ${seatsHtml}
            </div>

            ${
                isHost &&
                (room.status === "waiting" || needsStateRepair)
                ? `
                    <button class="btn"
                        onclick="ludoAction('start')"
                        ${
                            room.status === "waiting" &&
                            players.length < MIN_PLAYERS
                            ? "disabled"
                            : ""
                        }>
                        ${
                            needsStateRepair
                            ? "🛠 Khôi phục bàn cờ"
                            : `🚀 Bắt đầu (${players.length}/4)`
                        }
                    </button>
                `
                : ""
            }

            <div id="gameArea">
                ${boardMarkup(state, user.id)}
            </div>

            <h4>💬 Chat phòng</h4>

            <div class="chat-box" id="chatBox">
                ${
                    messages.map(m => `
                        <div class="chat-line">
                            <b>${html(m.username)}:</b>
                            ${html(m.message)}
                        </div>
                    `).join("")
                    || "Chưa có tin nhắn."
                }
            </div>

            ${
                mySeat
                ? `
                    <form id="chatForm" onsubmit="sendLudoChat(event)">
                        <input
                            id="chatInput"
                            name="chat_message"
                            maxlength="${MAX_CHAT_LENGTH}"
                            placeholder="Nhập tin nhắn..."
                            required
                        >
                        <button class="btn">Gửi</button>
                    </form>
                `
                : `
                    <p style="font-size:11px;color:#aaa">
                        Hãy chọn ghế để chat.
                    </p>
                `
            }

            <p>
                <a href="/game/ludo" style="color:#8ab4f8">
                    ⬅ Về sảnh Ludo
                </a>
            </p>

        </div>

        <script>
        const roomId = ${roomId};
        const myId = ${Number(user.id)};

        async function postLudo(data) {
            const fd = new FormData();

            Object.entries(data).forEach(([k, v]) => {
                fd.append(k, v);
            });

            const r = await fetch(
                location.pathname + location.search,
                {
                    method: "POST",
                    body: fd,
                    headers: {
                        "X-Requested-With": "XMLHttpRequest",
                        "Accept": "application/json"
                    }
                }
            );

            const d = await r.json().catch(() => ({
                success: false,
                error: "Phản hồi máy chủ không hợp lệ."
            }));

            if (!r.ok || !d.success) {
                alert(d.error || "Thao tác thất bại.");
            }

            return d;
        }

        async function ludoAction(action, seat) {
            const data = { action };

            if (seat !== undefined) {
                data.seat_index = seat;
            }

            const result = await postLudo(data);

            if (result.success) {
                location.reload();
            }
        }

        async function ludoMove(piece) {
            const result = await postLudo({
                action: "move",
                piece_index: piece
            });

            if (result.success) {
                location.reload();
            }
        }

        async function sendLudoChat(e) {
            e.preventDefault();

            const input = document.getElementById("chatInput");

            const result = await postLudo({
                action: "chat",
                chat_message: input.value
            });

            if (result.success) {
                input.value = "";
                location.reload();
            }
        }

        function escapeText(s) {
            return String(s ?? "").replace(/[&<>"']/g, c => ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            })[c]);
        }

        async function refreshLudo() {
            try {
                const r = await fetch(
                    location.pathname + location.search + "&state=1",
                    {
                        headers: {
                            "Accept": "application/json"
                        }
                    }
                );

                if (!r.ok) return;

                const d = await r.json();

                if (!d.success) return;

                // Cập nhật tin nhắn
                const box = document.getElementById("chatBox");

                const next = d.messages.map(m =>
                    '<div class="chat-line"><b>' +
                    escapeText(m.username) +
                    ':</b> ' +
                    escapeText(m.message) +
                    '</div>'
                ).join("") || "Chưa có tin nhắn.";

                if (box.innerHTML !== next) {
                    box.innerHTML = next;
                }

                // Đồng bộ trạng thái trận đấu
                const signature = JSON.stringify({
                    state: d.state,
                    status: d.room.status,
                    players: d.players
                });

                if (
                    window.__ludoSignature &&
                    window.__ludoSignature !== signature
                ) {
                    location.reload();
                    return;
                }

                window.__ludoSignature = signature;

            } catch (e) {
                // Giữ nguyên giao diện nếu mạng tạm thời gián đoạn.
            }
        }

        setInterval(refreshLudo, 2500);
        </script>
        `;

        return new Response(
            renderLayout(`Phòng Ludo: ${room.room_name}`, content, user),
            {
                headers: {
                    "Content-Type": "text/html; charset=UTF-8",
                    "Cache-Control": "no-store"
                }
            }
        );
    }

    // ========================================================
    // LOBBY
    // ========================================================

    const result = await env.DB.prepare(`
        SELECT *
        FROM ludo_rooms
        ORDER BY id DESC
        LIMIT 20
    `).all();

    const rooms = result.results || [];

    const content = `
        <div class="box">
            <div class="box-title">
                🎲 Sảnh Ludo
            </div>

            <div class="box-content" style="padding:10px">

                <p style="font-size:11px;color:#c90">
                    Bản thử nghiệm — cược xu thật đang bị khóa.
                </p>

                <button class="btn"
                    onclick="document.getElementById('createForm').style.display='block'">
                    ➕ Tạo bàn
                </button>

                <div id="createForm"
                    style="display:none;background:#111;padding:10px;margin:10px 0">

                    <form action="/game/ludo/create" method="POST">

                        <label>Tên phòng</label>

                        <input
                            name="room_name"
                            maxlength="60"
                            value="Bàn đấu của ${html(user.display_name || user.username)}"
                            required
                            style="width:100%;padding:7px;margin:5px 0"
                        >

                        <label>Mức cược hiển thị (chưa trừ xu)</label>

                        <input
                            type="number"
                            name="bet_amount"
                            value="0"
                            min="0"
                            max="100000000"
                            required
                            style="width:100%;padding:7px;margin:5px 0"
                        >

                        <button class="btn" type="submit">
                            Tạo phòng
                        </button>

                    </form>
                </div>

                ${
                    rooms.length
                    ? rooms.map(r => `
                        <div style="
                            background:#111;
                            border:1px solid #444;
                            padding:10px;
                            margin:7px 0;
                            border-radius:6px
                        ">
                            <b>${html(r.room_name)}</b>
                            <br>

                            <small>
                                Chủ phòng: ${html(r.host_name)}
                                · ${Number(r.bet_amount || 0).toLocaleString("vi-VN")} xu
                                · ${html(r.status)}
                            </small>
                            <br>

                            <a class="btn"
                                href="/game/ludo/room?id=${Number(r.id)}">
                                Vào bàn
                            </a>
                        </div>
                    `).join("")
                    : `
                        <p style="text-align:center;color:#888;padding:20px">
                            Chưa có phòng nào.
                        </p>
                    `
                }

                <p>
                    <a href="/game">
                        ⬅ Quay lại Khu giải trí
                    </a>
                </p>

            </div>
        </div>
    `;

    return new Response(
        renderLayout("Sảnh Ludo", content, user),
        {
            headers: {
                "Content-Type": "text/html; charset=UTF-8",
                "Cache-Control": "no-store"
            }
        }
    );
}
