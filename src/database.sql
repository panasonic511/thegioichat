-- =====================================================================
-- 1. BẢNG QUẢN LÝ NGƯỜI DÙNG (USERS)
-- =====================================================================
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,       -- Tên đăng nhập (ví dụ: chuwap)
    display_name TEXT NOT NULL,         -- Tên hiển thị trên wap (ví dụ: Chủ Wap)
    password TEXT NOT NULL,             -- Mật khẩu tài khoản
    email TEXT UNIQUE NOT NULL,         -- Địa chỉ email
    gender TEXT DEFAULT 'Nam',          -- Giới tính (Nam, Nữ, Khác)
    role TEXT DEFAULT 'Thành Viên',     -- Chức vụ: Chủ Wap, Admin, Mod, Thành Viên
    level INTEGER DEFAULT 1,            -- Level cấp độ từ 1 đến 130
    coins INTEGER DEFAULT 1000,         -- Tiền xu (dùng trong game và tiện ích)
    gold INTEGER DEFAULT 0,             -- Tiền vàng (mua vật phẩm đặc biệt)
    online_time INTEGER DEFAULT 0,      -- Thời gian online (phút)
    avatar TEXT DEFAULT 'https://i.imgur.com/7gXvS6v.png', -- Ảnh đại diện mặc định
    cover TEXT DEFAULT 'https://i.imgur.com/J33K48a.jpg',  -- Ảnh bìa mặc định
    status_text TEXT DEFAULT 'Đang online tại Thế Giới Chat...', -- Trạng thái cá nhân
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================================
-- 2. KHỞI TẠO SẴN TÀI KHOẢN CHỦ WAP VÀ CÁC QUẢN TRỊ VIÊN
-- =====================================================================
-- Tài khoản Chủ Wap (Level 130 - Quyền tối cao)
INSERT OR IGNORE INTO users (id, username, display_name, password, email, role, level, coins, gold, status_text) 
VALUES (1, 'chuwap', 'Chủ Wap', '123456', 'chuwap@thegioichat.vn', 'Chủ Wap', 130, 999999, 5000, 'Chào mừng đến với Thế Giới Chat!');

-- Tài khoản Admin (Level 125)
INSERT OR IGNORE INTO users (id, username, display_name, password, email, role, level, coins, gold, status_text) 
VALUES (2, 'admin', 'Tổng Quản Trị', '123456', 'admin@thegioichat.vn', 'Admin', 125, 500000, 2000, 'Hệ thống vận hành ổn định.');

-- Tài khoản Mod (Level 120)
INSERT OR IGNORE INTO users (id, username, display_name, password, email, role, level, coins, gold, status_text) 
VALUES (3, 'mod', 'Kiểm Duyệt Viên', '123456', 'mod@thegioichat.vn', 'Mod', 120, 100000, 500, 'Hỗ trợ và kiểm duyệt thành viên.');


-- =====================================================================
-- 3. BẢNG THÔNG BÁO HỆ THỐNG (ANNOUNCEMENTS) - Level >= 50 được đăng
-- =====================================================================
CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Thêm một thông báo chào mừng mẫu từ Chủ Wap
INSERT OR IGNORE INTO announcements (id, user_id, content) 
VALUES (1, 1, '✨ Chào mừng mọi người đến với wap mxh Thế Giới Chat! Chúc các bạn online vui vẻ. ✨');


-- =====================================================================
-- 4. BẢNG TIN NHẮN HỘP THOẠI (MESSAGES - HỖ TRỢ REALTIME)
-- =====================================================================
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


-- =====================================================================
-- 5. BẢNG THÔNG BÁO CÁ NHÂN (NOTIFICATIONS)
-- =====================================================================
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    content TEXT NOT NULL,
    url TEXT,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);


-- =====================================================================
-- 6. BẢNG BẢNG TIN XÃ HỘI (FEEDS / STATUS UPDATES)
-- =====================================================================
CREATE TABLE IF NOT EXISTS feeds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    content TEXT,
    media_url TEXT,
    media_type TEXT DEFAULT 'text', -- text, image, video, audio
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Thêm bài viết mẫu trên bảng tin
INSERT OR IGNORE INTO feeds (id, user_id, content) 
VALUES (1, 1, 'Hệ thống Thế Giới Chat chạy mượt mà trên Cloudflare Workers và D1 Database!');
