-- Bảng Người Dùng (Users)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,       -- Tên đăng nhập
    display_name TEXT NOT NULL,         -- Tên hiển thị
    password TEXT NOT NULL,             -- Mật khẩu mã hóa (hoặc hash)
    email TEXT UNIQUE NOT NULL,         -- Email
    gender TEXT DEFAULT 'Nam',          -- Giới tính (Nam, Nữ, Khác)
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

-- Dữ liệu mẫu khởi tạo tài khoản Chủ Wap (Level 130) và Admin (Level 125)
INSERT OR IGNORE INTO users (id, username, display_name, password, email, role, level, coins, gold) 
VALUES 
(1, 'chuwap', 'Chủ Wap', '123456', 'chuwap@thegioichat.vn', 'Chủ Wap', 130, 999999, 5000),
(2, 'admin', 'Admin Tổng', '123456', 'admin@thegioichat.vn', 'Admin', 125, 500000, 2000);

-- Bảng Thông Báo Hệ Thống / Thành Viên (Level >= 50 được đăng)
CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Bảng Tin Nhắn Hộp Thoại (Messages) - Realtime
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER,
    receiver_id INTEGER,
    message TEXT NOT NULL,
    is_read INTEGER DEFAULT 0, -- 0: Chưa đọc, 1: Đã đọc
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (receiver_id) REFERENCES users(id)
);

-- Bảng Thông Báo Hoạt Động (Notifications) - Realtime
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    content TEXT NOT NULL,
    url TEXT,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Bảng Bảng Tin (Feed / Status updates)
CREATE TABLE IF NOT EXISTS feeds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    content TEXT,
    media_url TEXT,
    media_type TEXT DEFAULT 'text', -- text, image, video, audio
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
