-- Xóa bảng cũ nếu cần làm mới hoàn toàn
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS announcements;
DROP TABLE IF EXISTS posts;
DROP TABLE IF EXISTS friends;
DROP TABLE IF EXISTS users;

-- 1. BẢNG THÀNH VIÊN (Phân cấp chức vụ, Level, Tiền xu)
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- ID tài khoản tự động tăng (dùng đăng nhập bằng ID)
    username TEXT UNIQUE NOT NULL,        -- Tên đăng nhập viết liền không dấu
    display_name TEXT NOT NULL,           -- Tên hiển thị tiếng Việt có dấu
    password_hash TEXT NOT NULL,          -- Mật khẩu đã mã hóa SHA-256
    role TEXT DEFAULT 'Thành Viên',       -- Chức vụ: 'Chủ Wap', 'Admin', 'Mod', 'Thành Viên'
    level INTEGER DEFAULT 1,              -- Cấp độ (Chủ Wap: 130, Admin: 125, Mod: 120, TV: 1-119)
    coins INTEGER DEFAULT 1000,           -- Tiền xu trong Wap
    avatar TEXT DEFAULT '👤',             -- Biểu tượng đại diện
    is_banned INTEGER DEFAULT 0,          -- Trạng thái khóa nick (0: Hoạt động, 1: Bị khóa)
    last_active INTEGER DEFAULT 0,        -- Dấu thời gian hoạt động cuối (tính người trực tuyến)
    created_at TEXT DEFAULT (datetime('now', '+7 hours'))
);

-- 2. BẢNG THÔNG BÁO HỆ THỐNG / BQT (Chỉ Level >= 50 mới được đăng và sửa)
CREATE TABLE announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author_id INTEGER NOT NULL,
    title TEXT NOT NULL,                  -- Tiêu đề thông báo
    content TEXT NOT NULL,                -- Nội dung chi tiết
    is_pinned INTEGER DEFAULT 0,          -- Ghim lên đầu (1: Có, 0: Không)
    created_at TEXT DEFAULT (datetime('now', '+7 hours')),
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. BẢNG TIN & DIỄN ĐÀN
CREATE TABLE posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    category TEXT DEFAULT 'bangtin',      -- 'bangtin' (Bảng tin) hoặc 'diendan' (Diễn đàn)
    title TEXT DEFAULT '',                -- Tiêu đề (dành cho diễn đàn)
    content TEXT NOT NULL,                -- Nội dung bài viết
    likes INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', '+7 hours')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 4. BẢNG TIN NHẮN RIÊNG TƯ (Cập nhật thời gian thực)
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,            -- 0: Chưa đọc, 1: Đã đọc
    created_at TEXT DEFAULT (datetime('now', '+7 hours')),
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 5. BẢNG THÔNG BÁO CÁ NHÂN (Chuông báo đỏ)
CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,             -- Người nhận thông báo
    content TEXT NOT NULL,                -- Nội dung thông báo
    is_read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', '+7 hours')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 6. BẢNG BẠN BÈ
CREATE TABLE friends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    friend_id INTEGER NOT NULL,
    status TEXT DEFAULT 'accepted',
    created_at TEXT DEFAULT (datetime('now', '+7 hours'))
);

-- TẠO SẴN TÀI KHOẢN CHỦ WAP MẶC ĐỊNH (Mật khẩu mặc định: 123456)
INSERT INTO users (id, username, display_name, password_hash, role, level, coins, avatar)
VALUES (
    1, 
    'admin', 
    'Chủ Wap Thế Giới Chat', 
    '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', 
    'Chủ Wap', 
    130, 
    9999999, 
    '👑'
);

-- DỮ LIỆU MẪU THÔNG BÁO BQT
INSERT INTO announcements (author_id, title, content, is_pinned)
VALUES (1, 'Chào mừng đến với Thế Giới Chat!', 'Hệ thống WAP mạng xã hội thế hệ mới đã chính thức mở cửa. Chúc các bạn online vui vẻ!', 1);
