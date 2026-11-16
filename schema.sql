DROP TABLE IF EXISTS nguoi_dung;
DROP TABLE IF EXISTS bai_viet;
DROP TABLE IF EXISTS tin_nhan;
DROP TABLE IF EXISTS tui_do;

CREATE TABLE nguoi_dung (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ten_dang_nhap TEXT UNIQUE,
    ten_hien_thi TEXT,
    mat_khau TEXT,
    gioi_tinh TEXT,
    vai_tro TEXT DEFAULT 'Thành Viên', -- 'Chủ Wap', 'Admin', 'Mods', 'Thành Viên'
    cap_do INTEGER DEFAULT 1,          -- Max 130, mới đăng ký là Level 1
    tien_xu INTEGER DEFAULT 100,       -- 100 xu khởi điểm
    tien_vang INTEGER DEFAULT 0,       -- Vàng mua vật phẩm đặc biệt
    ngay_tao DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE bai_viet (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nguoi_dang TEXT,
    noi_dung TEXT,
    ngay_tao DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tin_nhan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nguoi_gui TEXT,
    nguoi_nhan TEXT,
    noi_dung TEXT,
    ngay_tao DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tui_do (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ten_dang_nhap TEXT,
    ten_vat_pham TEXT,
    loai_vat_pham TEXT,
    ngay_mua DATETIME DEFAULT CURRENT_TIMESTAMP
);
