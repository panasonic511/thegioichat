-- Bảng Người Dùng (Users)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,       -- Tên đăng nhập
    display_name TEXT NOT NULL,         -- Tên hiển thị
    password TEXT NOT NULL,             -- Mật khẩu
    email TEXT UNIQUE NOT NULL,         -- Email
    gender TEXT DEFAULT 'Nam',          -- Giới tính
    role TEXT DEFAULT 'Thành Viên',     -- Chức vụ: Chủ Wap, Admin, Mod, Thành Viên
    level INTEGER DEFAULT 1,            -- Level từ 1 đến 130
    coins INTEGER DEFAULT 0,            -- Tiền xu
    gold INTEGER DEFAULT 0,             -- Tiền vàng
    online_time INTEGER DEFAULT 0,      -- Thời gian online (phút)
    avatar TEXT DEFAULT '/images/default-avatar.png',
    cover TEXT DEFAULT '/images/default-cover.png',
    status_text TEXT DEFAULT 'Đang online...',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Khởi tạo sẵn tài khoản CHỦ WAP (Level 130), Admin (Level 125) và Mod (Level 120)
INSERT OR IGNORE INTO users (id, username, display_name, password, email, role, level, coins, gold, status_text) 
VALUES 
(1, 'chuwap', 'Chủ Wap', '123456', 'chuwap@thegioichat.vn', 'Chủ Wap', 130, 999999, 5000, 'Quyền lực tối cao Thế Giới Chat'),
(2, 'admin', 'Tổng Quản Trị', '123456', 'admin@thegioichat.vn', 'Admin', 125, 500000, 2000, 'Quản lý hệ thống'),
(3, 'mod', 'Kiểm Duyệt', '123456', 'mod@thegioichat.vn', 'Mod', 120, 100000, 500, 'Hỗ trợ thành viên');

-- Bảng Thông Báo Hệ Thống (Yêu cầu Level >= 50 được đăng)
CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Bảng Tin Nhắn Hộp Thoại (Messages - Realtime)
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER,
    receiver_id INTEGER,
    message TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (receiver_id) REFERENCES users(id)
);

-- Bảng Thông Báo Cá Nhân (Notifications)
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    content TEXT NOT NULL,
    url TEXT,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Bảng Bảng Tin Xã Hội (Feeds)
CREATE TABLE IF NOT EXISTS feeds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    content TEXT,
    media_url TEXT,
    media_type TEXT DEFAULT 'text',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- =====================================================================
-- CÁC CÂU LỆNH SQL THƯỜNG DÙNG ĐỂ QUẢN LÝ
-- =====================================================================
-- Xem danh sách user: SELECT * FROM users;
-- Thăng cấp Admin: UPDATE users SET role = 'Admin', level = 125 WHERE id = X;
-- Cộng xu: UPDATE users SET coins = coins + 10000 WHERE id = X;
