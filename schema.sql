-- Xóa bảng cũ nếu tồn tại để tạo mới sạch sẽ
DROP TABLE IF EXISTS tui_do;
DROP TABLE IF EXISTS tin_nhan;
DROP TABLE IF EXISTS bai_viet;
DROP TABLE IF EXISTS nguoi_dung;

-- 1. BẢNG QUẢN LÝ NGƯỜI DÙNG & TÀI KHOẢN
CREATE TABLE nguoi_dung (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ten_dang_nhap TEXT UNIQUE NOT NULL,      -- Tên tài khoản đăng nhập
    ten_hien_thi TEXT NOT NULL,             -- Tên hiển thị công khai trên Wap
    mat_khau TEXT NOT NULL,                 -- Mật khẩu tài khoản
    gioi_tinh TEXT DEFAULT 'Nam',           -- Giới tính (Nam, Nữ, Khác)
    vai_tro TEXT DEFAULT 'Thành Viên',      -- Chức vụ: 'Chủ Wap', 'Admin', 'Mods', 'Thành Viên'
    cap_do INTEGER DEFAULT 1,               -- Cấp độ thành viên (Mới đăng ký là Level 1, Max 130)
    tien_xu INTEGER DEFAULT 100,            -- Tiền xu khởi điểm (100 xu)
    tien_vang INTEGER DEFAULT 0,            -- Tiền vàng mua vật phẩm đặc biệt
    ngay_tao DATETIME DEFAULT CURRENT_TIMESTAMP -- Thời gian đăng ký
);

-- 2. BẢNG QUẢN LÝ BÀI VIẾT (DIỄN ĐÀN / BẢNG TIN)
CREATE TABLE bai_viet (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nguoi_dang TEXT NOT NULL,               -- Tên hiển thị người đăng bài
    noi_dung TEXT NOT NULL,                 -- Nội dung bài viết
    ngay_tao DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. BẢNG QUẢN LÝ TIN NHẮN RIÊNG
CREATE TABLE tin_nhan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nguoi_gui TEXT NOT NULL,                -- Người gửi
    nguoi_nhan TEXT NOT NULL,               -- Người nhận
    noi_dung TEXT NOT NULL,                 -- Nội dung tin nhắn
    ngay_tao DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. BẢNG QUẢN LÝ TÚI ĐỒ & VẬT PHẨM CỬA HÀNG
CREATE TABLE tui_do (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ten_dang_nhap TEXT NOT NULL,            -- Tài khoản sở hữu vật phẩm
    ten_vat_pham TEXT NOT NULL,             -- Tên vật phẩm đã mua
    loai_vat_pham TEXT NOT NULL,            -- Phân loại ('vip', 'vat_pham')
    ngay_mua DATETIME DEFAULT CURRENT_TIMESTAMP
);
