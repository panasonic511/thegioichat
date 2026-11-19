// session.js - Quản lý phiên đăng nhập an toàn bằng session token ngẫu nhiên lưu trong D1.
// Cookie chỉ chứa token ngẫu nhiên 64 ký tự hex. D1 chỉ lưu bản băm SHA-256 của token,
// nên dù lộ database cũng không dùng lại được token để đăng nhập.

const SESSION_COOKIE = 'sid';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 ngày

function bytesToHex(bytes) {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(text) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return bytesToHex(new Uint8Array(digest));
}

function generateToken() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return bytesToHex(bytes);
}

// Đọc session token từ cookie của request (null nếu không có hoặc sai định dạng)
export function readSessionToken(request) {
    const cookie = request.headers.get('Cookie') || '';
    const match = cookie.match(/(?:^|;\s*)sid=([a-f0-9]{64})(?=;|$)/);
    return match ? match[1] : null;
}

// Tạo session mới cho user, trả về token để đặt vào cookie
export async function createSession(env, userId) {
    const token = generateToken();
    const tokenHash = await sha256Hex(token);
    const now = Math.floor(Date.now() / 1000);

    // Dọn các session đã hết hạn mỗi lần có người đăng nhập
    await env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now).run();
    await env.DB.prepare(
        "INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)"
    ).bind(tokenHash, userId, now + SESSION_TTL_SECONDS, now).run();

    return token;
}

// Lấy user từ session token trong cookie (1 truy vấn, thay cho SELECT * FROM users cũ)
export async function getSessionUser(request, env) {
    const token = readSessionToken(request);
    if (!token) return null;

    const tokenHash = await sha256Hex(token);
    const now = Math.floor(Date.now() / 1000);

    const user = await env.DB.prepare(
        "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?"
    ).bind(tokenHash, now).first();

    return user || null;
}

// Huỷ session hiện tại (dùng khi đăng xuất)
export async function destroySession(request, env) {
    const token = readSessionToken(request);
    if (!token) return;
    const tokenHash = await sha256Hex(token);
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
}

// Huỷ toàn bộ session của một user (dùng khi đổi mật khẩu, khoá tài khoản, đổi quyền)
export async function destroyUserSessions(env, userId) {
    await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();
}

export function buildSessionCookie(token) {
    return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

// Xoá cookie user_id kiểu cũ trên trình duyệt người dùng
export function buildLegacyClearCookie() {
    return 'user_id=; Path=/; Max-Age=0';
}

export function buildClearCookies() {
    return [
        `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
        buildLegacyClearCookie()
    ];
}
