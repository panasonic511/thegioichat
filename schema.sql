-- Bảng người dùng (Users)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    gender TEXT DEFAULT 'Nam',
    level INTEGER DEFAULT 1,
    role TEXT DEFAULT 'Thành Viên', -- 'Chủ Wap', 'Admin', 'Mod', 'Thành Viên'
    coins BIGINT DEFAULT 0,
    online_minutes INTEGER DEFAULT 0,
    avatar TEXT DEFAULT '/images/default-avatar.png',
    cover TEXT DEFAULT '/images/default-cover.png',
    bio TEXT DEFAULT 'Chưa có thông tin',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Bảng thông báo hệ thống (Notifications - Cấp độ >= 50 được đăng)
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Bảng tin nhắn (Messages - Realtime)
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER,
    receiver_id INTEGER,
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (receiver_id) REFERENCES users(id)
);

-- Bảng bảng tin/feed (Users Feed)
CREATE TABLE IF NOT EXISTS feeds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
