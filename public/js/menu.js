import { getCurrentUser, switchTab } from './app.js';
import { handleLogout } from './auth.js';

export async function renderMenuView(container) {
    const user = getCurrentUser();
    
    // Lấy số liệu thống kê thực tế để hiển thị trong menu
    let totalUsers = 0;
    let totalPosts = 0;
    try {
        const res = await fetch('/api/stats');
        if (res.ok) {
            const data = await res.json();
            totalUsers = data.totalUsers;
            totalPosts = data.totalPosts;
        }
    } catch (e) {}

    container.innerHTML = `
        <div class="space-y-3">
            <!-- Header Menu -->
            <div class="wap-card rounded-xl p-3 text-xs space-y-1">
                <h3 class="font-bold text-amber-400 text-sm border-b border-[#222228] pb-1.5 flex items-center">
                    <i class="fa-solid fa-bars mr-1.5 text-purple-400"></i> Menu hệ thống GAUBONG.US
                </h3>
                <p class="text-[11px] text-slate-400">Xin chào, <span class="text-amber-400 font-semibold">${user ? user.display_name : 'Khách'}</span>. Chọn một chức năng bên dưới để tiếp tục:</p>
            </div>

            <!-- Lưới danh mục menu -->
            <div class="wap-card rounded-xl overflow-hidden text-xs">
                <div class="grid grid-cols-1 divide-y divide-[#222228] text-[11px]">
                    
                    <a href="#" data-tab="home" class="menu-link p-3 hover:bg-[#18181c] transition flex items-center justify-between text-slate-300">
                        <span class="flex items-center"><i class="fa-solid fa-user text-amber-400 w-5 text-center mr-2"></i> Trang chủ cá nhân</span>
                        <i class="fa-solid fa-chevron-right text-[10px] text-slate-600"></i>
                    </a>

                    <a href="#" data-tab="online" class="menu-link p-3 hover:bg-[#18181c] transition flex items-center justify-between text-slate-300">
                        <span class="flex items-center"><i class="fa-solid fa-magnifying-glass text-blue-400 w-5 text-center mr-2"></i> Tìm kiếm ID thành viên</span>
                        <i class="fa-solid fa-chevron-right text-[10px] text-slate-600"></i>
                    </a>

                    <a href="#" data-tab="online" class="menu-link p-3 hover:bg-[#18181c] transition flex items-center justify-between text-slate-300">
                        <span class="flex items-center"><i class="fa-solid fa-trophy text-yellow-400 w-5 text-center mr-2"></i> Bảng xếp hạng</span>
                        <i class="fa-solid fa-chevron-right text-[10px] text-slate-600"></i>
                    </a>

                    <a href="#" data-tab="posts" class="menu-link p-3 hover:bg-[#18181c] transition flex items-center justify-between text-slate-300">
                        <span class="flex items-center"><i class="fa-solid fa-comments text-pink-400 w-5 text-center mr-2"></i> Diễn đàn / Bảng tin</span>
                        <span class="bg-pink-500/20 text-pink-400 px-2 py-0.5 rounded text-[10px]">${totalPosts} bài</span>
                    </a>

                    <a href="#" data-tab="online" class="menu-link p-3 hover:bg-[#18181c] transition flex items-center justify-between text-slate-300">
                        <span class="flex items-center"><i class="fa-solid fa-user-group text-emerald-400 w-5 text-center mr-2"></i> Thành viên trực tuyến</span>
                        <span class="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded text-[10px]">${totalUsers} thành viên</span>
                    </a>

                    <a href="#" data-action="coming-soon" class="p-3 hover:bg-[#18181c] transition flex items-center justify-between text-slate-300">
                        <span class="flex items-center"><i class="fa-solid fa-chart-line text-purple-400 w-5 text-center mr-2"></i> Bảng cấp độ</span>
                        <span class="text-[10px] text-slate-500">Sắp ra mắt</span>
                    </a>

                    <a href="#" data-action="coming-soon" class="p-3 hover:bg-[#18181c] transition flex items-center justify-between text-slate-300">
                        <span class="flex items-center"><i class="fa-solid fa-gear text-slate-400 w-5 text-center mr-2"></i> Cài đặt tài khoản</span>
                        <i class="fa-solid fa-chevron-right text-[10px] text-slate-600"></i>
                    </a>

                    <a href="#" data-action="coming-soon" class="p-3 hover:bg-[#18181c] transition flex items-center justify-between text-slate-300">
                        <span class="flex items-center"><i class="fa-solid fa-gamepad text-rose-400 w-5 text-center mr-2"></i> Khu giải trí <span class="text-amber-400 ml-1">[26]</span></span>
                        <span class="text-[10px] text-amber-400 font-semibold">Hot</span>
                    </a>

                </div>
            </div>

            <!-- Nút đăng xuất nhanh -->
            <div class="wap-card rounded-xl p-3 text-center">
                <button id="btn-menu-logout" class="w-full bg-rose-500/20 text-rose-400 border border-rose-500/30 py-2 rounded-lg text-xs font-semibold hover:bg-rose-500/30 transition">
                    <i class="fa-solid fa-right-from-bracket mr-1.5"></i> Đăng xuất khỏi tài khoản
                </button>
            </div>
        </div>
    `;

    // Gắn sự kiện chuyển tab cho các mục trong menu
    container.querySelectorAll('.menu-link').forEach(link => {
        link.onclick = (e) => {
            e.preventDefault();
            switchTab(link.getAttribute('data-tab'));
        };
    });

    // Thông báo cho các tính năng đang phát triển
    container.querySelectorAll('[data-action="coming-soon"]').forEach(el => {
        el.onclick = (e) => {
            e.preventDefault();
            alert('Tính năng này đang được phát triển và sẽ sớm ra mắt trong bản cập nhật tới!');
        };
    });

    document.getElementById('btn-menu-logout').onclick = handleLogout;
}
