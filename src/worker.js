export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        };

        if (method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

        try {
            // 1. ĐĂNG KÝ TÀI KHOẢN (Mặc định Level 1, 100 Xu)
            if (path === '/api/register' && method === 'POST') {
                const { ten_dang_nhap, ten_hien_thi, mat_khau, gioi_tinh } = await request.json();
                if (!ten_dang_nhap || !ten_hien_thi || !mat_khau) {
                    return new Response(JSON.stringify({ error: 'Vui lòng điền đủ thông tin!' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
                }
                try {
                    await env.DB.prepare(
                        `INSERT INTO nguoi_dung (ten_dang_nhap, ten_hien_thi, mat_khau, gioi_tinh, vai_tro, cap_do, tien_xu, tien_vang) VALUES (?, ?, ?, ?, 'Thành Viên', 1, 100, 0)`
                    ).bind(ten_dang_nhap, ten_hien_thi, mat_khau, gioi_tinh || 'Nam').run();
                    return new Response(JSON.stringify({ success: true, message: 'Đăng ký thành công!' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
                } catch (e) {
                    return new Response(JSON.stringify({ error: 'Tên đăng nhập đã tồn tại!' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
                }
            }

            // 2. ĐĂNG NHẬP (Hỗ trợ bằng Tên tài khoản hoặc ID số)
            if (path === '/api/login' && method === 'POST') {
                const { loaiDangNhap, dinhDanh, mat_khau } = await request.json();
                let user = loaiDangNhap === 'id' 
                    ? await env.DB.prepare(`SELECT * FROM nguoi_dung WHERE id = ? AND mat_khau = ?`).bind(dinhDanh, mat_khau).first()
                    : await env.DB.prepare(`SELECT * FROM nguoi_dung WHERE ten_dang_nhap = ? AND mat_khau = ?`).bind(dinhDanh, mat_khau).first();

                if (!user) return new Response(JSON.stringify({ error: 'Tài khoản hoặc mật khẩu không đúng!' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
                return new Response(JSON.stringify({ success: true, user }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }

            // 3. LẤY THÔNG TIN NGƯỜI DÙNG
            if (path === '/api/user/info' && method === 'GET') {
                const ten_dang_nhap = url.searchParams.get('ten_dang_nhap');
                const user = await env.DB.prepare(`SELECT * FROM nguoi_dung WHERE ten_dang_nhap = ?`).bind(ten_dang_nhap).first();
                return new Response(JSON.stringify(user), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }

            // 4. THỐNG KÊ WAP
            if (path === '/api/stats' && method === 'GET') {
                const usersCount = await env.DB.prepare(`SELECT COUNT(*) as total FROM nguoi_dung`).first();
                const postsCount = await env.DB.prepare(`SELECT COUNT(*) as total FROM bai_viet`).first();
                return new Response(JSON.stringify({
                    tongThanhVien: usersCount.total,
                    tongBaiViet: postsCount.total,
                    thanhVienOnline: 1 + Math.floor(Math.random() * 5)
                }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }

            // 5. BÀI VIẾT / DIỄN ĐÀN
            if (path === '/api/posts' && method === 'GET') {
                const { results } = await env.DB.prepare(`SELECT * FROM bai_viet ORDER BY id DESC LIMIT 50`).all();
                return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }

            if (path === '/api/posts' && method === 'POST') {
                const { nguoi_dang, noi_dung } = await request.json();
                if (!noi_dung) return new Response(JSON.stringify({ error: 'Nội dung trống' }), { status: 400, headers: corsHeaders });
                await env.DB.prepare(`INSERT INTO bai_viet (nguoi_dang, noi_dung) VALUES (?, ?)`).bind(nguoi_dang || 'Thành viên', noi_dung).run();
                return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }

            // 6. TIN NHẮN RIÊNG
            if (path === '/api/messages/get' && method === 'GET') {
                const user1 = url.searchParams.get('user1');
                const user2 = url.searchParams.get('user2');
                const { results } = await env.DB.prepare(
                    `SELECT * FROM tin_nhan WHERE (nguoi_gui = ? AND nguoi_nhan = ?) OR (nguoi_gui = ? AND nguoi_nhan = ?) ORDER BY id ASC`
                ).bind(user1, user2, user2, user1).all();
                return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }

            if (path === '/api/messages/send' && method === 'POST') {
                const { nguoi_gui, nguoi_nhan, noi_dung } = await request.json();
                if (!noi_dung || !nguoi_nhan) return new Response(JSON.stringify({ error: 'Thiếu thông tin' }), { status: 400, headers: corsHeaders });
                await env.DB.prepare(`INSERT INTO tin_nhan (nguoi_gui, nguoi_nhan, noi_dung) VALUES (?, ?, ?)`).bind(nguoi_gui, nguoi_nhan, noi_dung).run();
                return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }

            // 7. CỬA HÀNG & MUA VẬT PHẨM
            if (path === '/api/shop/buy' && method === 'POST') {
                const { ten_dang_nhap, ten_vat_pham, loai_vat_pham, gia_xu, gia_vang } = await request.json();
                const user = await env.DB.prepare(`SELECT * FROM nguoi_dung WHERE ten_dang_nhap = ?`).bind(ten_dang_nhap).first();
                
                if (gia_xu && user.tien_xu < gia_xu) return new Response(JSON.stringify({ error: 'Bạn không đủ Xu!' }), { status: 400, headers: corsHeaders });
                if (gia_vang && user.tien_vang < gia_vang) return new Response(JSON.stringify({ error: 'Bạn không đủ Vàng!' }), { status: 400, headers: corsHeaders });

                let xuMoi = user.tien_xu - (gia_xu || 0);
                let vangMoi = user.tien_vang - (gia_vang || 0);
                
                await env.DB.prepare(`UPDATE nguoi_dung SET tien_xu = ?, tien_vang = ? WHERE ten_dang_nhap = ?`).bind(xuMoi, vangMoi, ten_dang_nhap).run();
                await env.DB.prepare(`INSERT INTO tui_do (ten_dang_nhap, ten_vat_pham, loai_vat_pham) VALUES (?, ?, ?)`).bind(ten_dang_nhap, ten_vat_pham, loai_vat_pham).run();

                const updatedUser = await env.DB.prepare(`SELECT * FROM nguoi_dung WHERE ten_dang_nhap = ?`).bind(ten_dang_nhap).first();
                return new Response(JSON.stringify({ success: true, user: updatedUser }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }

            // 8. NẠP TIỀN XU / VÀNG
            if (path === '/api/shop/deposit' && method === 'POST') {
                const { ten_dang_nhap, so_xu, so_vang } = await request.json();
                const user = await env.DB.prepare(`SELECT * FROM nguoi_dung WHERE ten_dang_nhap = ?`).bind(ten_dang_nhap).first();
                
                let xuMoi = user.tien_xu + (so_xu || 0);
                let vangMoi = user.tien_vang + (so_vang || 0);
                await env.DB.prepare(`UPDATE nguoi_dung SET tien_xu = ?, tien_vang = ? WHERE ten_dang_nhap = ?`).bind(xuMoi, vangMoi, ten_dang_nhap).run();

                const updatedUser = await env.DB.prepare(`SELECT * FROM nguoi_dung WHERE ten_dang_nhap = ?`).bind(ten_dang_nhap).first();
                return new Response(JSON.stringify({ success: true, user: updatedUser }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }

            // 9. TÚI ĐỒ
            if (path === '/api/shop/inventory' && method === 'GET') {
                const ten_dang_nhap = url.searchParams.get('ten_dang_nhap');
                const { results } = await env.DB.prepare(`SELECT * FROM tui_do WHERE ten_dang_nhap = ? ORDER BY id DESC`).bind(ten_dang_nhap).all();
                return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }

            // 10. QUẢN TRỊ ADMIN (Danh sách người dùng)
            if (path === '/api/admin/users' && method === 'GET') {
                const { results } = await env.DB.prepare(`SELECT id, ten_dang_nhap, ten_hien_thi, vai_tro, cap_do, tien_xu, tien_vang, ngay_tao FROM nguoi_dung ORDER BY id ASC`).all();
                return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }

            // 11. CẬP NHẬT THÀNH VIÊN TỪ ADMIN PANEL (Max Level 130)
            if (path === '/api/admin/update-user' && method === 'POST') {
                const { id, vai_tro, cap_do, tien_xu, tien_vang } = await request.json();
                let capDoMoi = parseInt(cap_do) || 1;
                if (capDoMoi > 130) capDoMoi = 130;
                if (capDoMoi < 1) capDoMoi = 1;

                await env.DB.prepare(
                    `UPDATE nguoi_dung SET vai_tro = ?, cap_do = ?, tien_xu = ?, tien_vang = ? WHERE id = ?`
                ).bind(vai_tro, capDoMoi, parseInt(tien_xu) || 0, parseInt(tien_vang) || 0, id).run();

                return new Response(JSON.stringify({ success: true, message: 'Cập nhật thành công!' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }

            return new Response(JSON.stringify({ error: 'Không tìm thấy API' }), { status: 404, headers: corsHeaders });
        } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
        }
    }
};
