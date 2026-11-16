function renderOnlineView(container) {
    const user = getCurrentUser();
    container.innerHTML = `
        <div class="wap-card rounded-xl p-3 text-xs space-y-2">
            <h3 class="font-bold text-emerald-400 border-b border-[#222228] pb-1"><i class="fa-solid fa-users mr-1"></i> Thành viên trực tuyến</h3>
            <div class="space-y-2">
                <div class="flex items-center justify-between p-2 bg-[#18181c] rounded-lg">
                    <div class="flex items-center space-x-2">
                        <div class="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">${user.ten_hien_thi.charAt(0).toUpperCase()}</div>
                        <div>
                            <span class="font-bold text-amber-400">${user.ten_hien_thi}</span>
                            <span class="text-[10px] text-slate-400 block">ID: ${user.id} · Đang hoạt động</span>
                        </div>
                    </div>
                    <span class="text-[10px] text-emerald-400 font-semibold">● Online</span>
                </div>
            </div>
        </div>
    `;
}

function renderNotificationsView(container) {
    container.innerHTML = `
        <div class="wap-card rounded-xl p-4 text-xs space-y-3">
            <h3 class="font-bold text-amber-400 border-b border-[#222228] pb-1"><i class="fa-solid fa-bell mr-1"></i> Thông báo hệ thống</h3>
            <div class="p-2.5 bg-[#18181c] rounded-lg border border-[#27272a] space-y-1">
                <div class="font-bold text-emerald-400">🎉 Chào mừng đến với GAUBONG.US!</div>
                <p class="text-[11px] text-slate-400">Hệ thống hoạt động ổn định. Chúc bạn giao lưu vui vẻ!</p>
            </div>
        </div>
    `;
}

function renderMenuView(container) {
    const user = getCurrentUser();
    const isAdmin = user && (user.vai_tro === 'Chủ Wap' || user.vai_tro === 'Admin' || user.vai_tro === 'Mods');

    container.innerHTML = `
        <div class="space-y-3">
            <div class="wap-card rounded-xl p-3 text-xs space-y-1">
                <h3 class="font-bold text-amber-400 text-sm border-b border-[#222228] pb-1.5 flex items-center">
                    <i class="fa-solid fa-bars mr-1.5 text-purple-400"></i> Menu hệ thống GAUBONG.US
                </h3>
                <p class="text-[11px] text-slate-400">Xin chào, <span class="text-amber-400 font-semibold">${user ? user.ten_hien_thi : 'Khách'}</span> (ID: ${user ? user.id : '--'})</p>
                <div class="flex items-center space-x-3 pt-1 text-[11px]">
                    <span class="text-amber-300"><i class="fa-solid fa-coins mr-1 text-yellow-400"></i>${user ? user.tien_xu : 0} xu</span>
                    <span class="text-yellow-400"><i class="fa-solid fa-circle text-[8px] mr-1 text-amber-500"></i>${user ? user.tien_vang : 0} vàng</span>
                    <span class="text-purple-400"><i class="fa-solid fa-shield-halved mr-1"></i>Lv.${user ? user.cap_do : 1}/130</span>
                </div>
            </div>

            <div class="wap-card rounded-xl overflow-hidden text-xs">
                <div class="grid grid-cols-1 divide-y divide-[#222228] text-[11px]">
                    ${isAdmin ? `
                    <a href="/admin" onclick="navigate(event, 'admin')" class="p-3 bg-amber-500/10 hover:bg-amber-500/20 transition flex items-center justify-between text-amber-400 font-bold">
                        <span class="flex items-center"><i class="fa-solid fa-shield-halved w-5 text-center mr-2"></i> Quản trị Admin (Cấp bậc & Xu)</span>
                        <i class="fa-solid fa-chevron-right text-[10px]"></i>
                    </a>` : ''}
                    <a href="/shop" onclick="navigate(event, 'shop')" class="p-3 bg-yellow-500/10 hover:bg-yellow-500/20 transition flex items-center justify-between text-yellow-400 font-bold">
                        <span class="flex items-center"><i class="fa-solid fa-cart-shopping w-5 text-center mr-2"></i> Cửa hàng vật phẩm & Nạp tiền</span>
                        <i class="fa-solid fa-chevron-right text-[10px]"></i>
                    </a>
                    <a href="/home" onclick="navigate(event, 'home')" class="p-3 hover:bg-[#18181c] transition flex items-center justify-between text-slate-300">
                        <span class="flex items-center"><i class="fa-solid fa-user text-amber-400 w-5 text-center mr-2"></i> Trang cá nhân</span>
                        <i class="fa-solid fa-chevron-right text-[10px] text-slate-600"></i>
                    </a>
                    <a href="/search" onclick="navigate(event, 'search')" class="p-3 hover:bg-[#18181c] transition flex items-center justify-between text-slate-300">
                        <span class="flex items-center"><i class="fa-solid fa-magnifying-glass text-blue-400 w-5 text-center mr-2"></i> Tìm kiếm ID</span>
                        <i class="fa-solid fa-chevron-right text-[10px] text-slate-600"></i>
                    </a>
                    <a href="/ranking" onclick="navigate(event, 'ranking')" class="p-3 hover:bg-[#18181c] transition flex items-center justify-between text-slate-300">
                        <span class="flex items-center"><i class="fa-solid fa-trophy text-yellow-400 w-5 text-center mr-2"></i> Bảng xếp hạng</span>
                        <i class="fa-solid fa-chevron-right text-[10px] text-slate-600"></i>
                    </a>
                    <a href="/posts" onclick="navigate(event, 'posts')" class="p-3 hover:bg-[#18181c] transition flex items-center justify-between text-slate-300">
                        <span class="flex items-center"><i class="fa-solid fa-comments text-pink-400 w-5 text-center mr-2"></i> Diễn đàn / Bảng tin</span>
                        <i class="fa-solid fa-chevron-right text-[10px] text-slate-600"></i>
                    </a>
                    <a href="/friends" onclick="navigate(event, 'friends')" class="p-3 hover:bg-[#18181c] transition flex items-center justify-between text-slate-300">
                        <span class="flex items-center"><i class="fa-solid fa-user-group text-emerald-400 w-5 text-center mr-2"></i> Bạn bè</span>
                        <i class="fa-solid fa-chevron-right text-[10px] text-slate-600"></i>
                    </a>
                    <a href="/levels" onclick="navigate(event, 'levels')" class="p-3 hover:bg-[#18181c] transition flex items-center justify-between text-slate-300">
                        <span class="flex items-center"><i class="fa-solid fa-chart-line text-purple-400 w-5 text-center mr-2"></i> Bảng cấp độ (Max 130)</span>
                        <i class="fa-solid fa-chevron-right text-[10px] text-slate-600"></i>
                    </a>
                    <a href="/settings" onclick="navigate(event, 'settings')" class="p-3 hover:bg-[#18181c] transition flex items-center justify-between text-slate-300">
                        <span class="flex items-center"><i class="fa-solid fa-gear text-slate-400 w-5 text-center mr-2"></i> Cài đặt tài khoản</span>
                        <i class="fa-solid fa-chevron-right text-[10px] text-slate-600"></i>
                    </a>
                    <a href="/stats" onclick="navigate(event, 'stats')" class="p-3 hover:bg-[#18181c] transition flex items-center justify-between text-slate-300">
                        <span class="flex items-center"><i class="fa-solid fa-chart-pie text-cyan-400 w-5 text-center mr-2"></i> Thống kê hệ thống</span>
                        <i class="fa-solid fa-chevron-right text-[10px] text-slate-600"></i>
                    </a>
                    <a href="/games" onclick="navigate(event, 'games')" class="p-3 hover:bg-[#18181c] transition flex items-center justify-between text-slate-300">
                        <span class="flex items-center"><i class="fa-solid fa-gamepad text-rose-400 w-5 text-center mr-2"></i> Khu giải trí <span class="text-amber-400 ml-1">[26]</span></span>
                        <span class="text-[10px] text-amber-400 font-semibold">Hot</span>
                    </a>
                </div>
            </div>

            <div class="wap-card rounded-xl p-3 text-center">
                <button onclick="handleLogout()" class="w-full bg-rose-500/20 text-rose-400 border border-rose-500/30 py-2 rounded-lg text-xs font-semibold hover:bg-rose-500/30 transition">
                    <i class="fa-solid fa-right-from-bracket mr-1.5"></i> Đăng xuất khỏi tài khoản
                </button>
            </div>
        </div>
    `;
}

function renderSearchView(container) {
    container.innerHTML = `
        <div class="wap-card rounded-xl p-4 text-xs space-y-3">
            <h3 class="font-bold text-blue-400 border-b border-[#222228] pb-1.5"><i class="fa-solid fa-magnifying-glass mr-1"></i> Tìm kiếm ID thành viên</h3>
            <div class="space-y-2">
                <label class="block text-slate-300">Nhập ID số của thành viên cần tìm:</label>
                <div class="flex space-x-2">
                    <input type="number" id="search-id-input" placeholder="Ví dụ: 1, 2, 3..." class="flex-grow px-3 py-2 rounded-lg wap-input">
                    <button onclick="alert('Tính năng tra cứu theo ID đang kết nối với cơ sở dữ liệu D1.')" class="bg-blue-600 px-3 py-2 rounded-lg font-semibold text-white">Tìm</button>
                </div>
            </div>
            <div class="pt-2 text-center text-slate-400">Nhập ID để xem thông tin chi tiết thành viên.</div>
        </div>
    `;
}

function renderRankingView(container) {
    container.innerHTML = `
        <div class="wap-card rounded-xl p-4 text-xs space-y-3">
            <h3 class="font-bold text-yellow-400 border-b border-[#222228] pb-1.5"><i class="fa-solid fa-trophy mr-1"></i> Bảng xếp hạng thành viên</h3>
            <div class="space-y-2">
                <div class="p-2.5 bg-[#18181c] rounded-lg flex items-center justify-between">
                    <span class="font-bold text-amber-400">🥇 Top 1: Hệ thống GAUBONG</span>
                    <span class="text-[10px] text-slate-400">Cấp độ 130</span>
                </div>
            </div>
        </div>
    `;
}

function renderFriendsView(container) {
    container.innerHTML = `
        <div class="wap-card rounded-xl p-4 text-xs space-y-3">
            <h3 class="font-bold text-emerald-400 border-b border-[#222228] pb-1.5"><i class="fa-solid fa-user-group mr-1"></i> Danh sách bạn bè</h3>
            <div class="text-center py-6 text-slate-400">
                <i class="fa-solid fa-users text-3xl mb-2 text-slate-600"></i>
                <p>Bạn chưa kết bạn với thành viên nào.</p>
            </div>
        </div>
    `;
}

function renderLevelsView(container) {
    container.innerHTML = `
        <div class="wap-card rounded-xl p-4 text-xs space-y-3">
            <h3 class="font-bold text-purple-400 border-b border-[#222228] pb-1.5"><i class="fa-solid fa-chart-line mr-1"></i> Bảng cấp độ thành viên (Max 130)</h3>
            <div class="space-y-2 text-slate-300">
                <div class="p-2 bg-[#18181c] rounded flex justify-between"><span>Thành viên mới (Đăng ký)</span> <span class="text-amber-400 font-bold">Level 1</span></div>
                <div class="p-2 bg-[#18181c] rounded flex justify-between"><span>Thành viên tích cực</span> <span>Level 2 - 50</span></div>
                <div class="p-2 bg-[#18181c] rounded flex justify-between"><span>Cán bộ / Mods</span> <span>Level 51 - 100</span></div>
                <div class="p-2 bg-[#18181c] rounded flex justify-between"><span>Quản trị tối cao (Chủ Wap)</span> <span class="text-emerald-400 font-bold">Level 101 - 130</span></div>
            </div>
        </div>
    `;
}

function renderSettingsView(container) {
    const user = getCurrentUser();
    container.innerHTML = `
        <div class="wap-card rounded-xl p-4 text-xs space-y-3">
            <h3 class="font-bold text-slate-200 border-b border-[#222228] pb-1.5"><i class="fa-solid fa-gear mr-1 text-slate-400"></i> Cài đặt tài khoản</h3>
            <div class="space-y-2.5">
                <div>
                    <label class="block text-slate-400 mb-1">Tên hiển thị hiện tại:</label>
                    <input type="text" value="${user ? user.ten_hien_thi : ''}" class="w-full px-3 py-2 rounded-lg wap-input" disabled>
                </div>
                <div>
                    <label class="block text-slate-400 mb-1">Tài nguyên & Cấp độ:</label>
                    <div class="p-2 bg-[#18181c] rounded space-y-1">
                        <div class="flex justify-between"><span>Cấp độ:</span> <strong class="text-purple-400">Lv.${user ? user.cap_do : 1}/130</strong></div>
                        <div class="flex justify-between"><span>Số dư xu:</span> <strong class="text-amber-400">${user ? user.tien_xu : 0} xu</strong></div>
                        <div class="flex justify-between"><span>Số dư vàng:</span> <strong class="text-yellow-400">${user ? user.tien_vang : 0} vàng</strong></div>
                    </div>
                </div>
                <div>
                    <label class="block text-slate-400 mb-1">Đổi mật khẩu mới:</label>
                    <input type="password" placeholder="Mật khẩu mới..." class="w-full px-3 py-2 rounded-lg wap-input">
                </div>
                <button onclick="alert('Đã lưu thay đổi cài đặt tài khoản!')" class="w-full bg-blue-600 text-white font-semibold py-2 rounded-lg">Lưu cài đặt</button>
            </div>
        </div>
    `;
}

function renderStatsView(container) {
    container.innerHTML = `
        <div class="wap-card rounded-xl p-4 text-xs space-y-3">
            <h3 class="font-bold text-cyan-400 border-b border-[#222228] pb-1.5"><i class="fa-solid fa-chart-pie mr-1"></i> Thống kê hệ thống</h3>
            <div class="space-y-2 text-slate-300">
                <div class="p-2 bg-[#18181c] rounded flex justify-between"><span>Nền tảng hạ tầng:</span> <span class="text-emerald-400">Cloudflare Pages & D1</span></div>
                <div class="p-2 bg-[#18181c] rounded flex justify-between"><span>Cấp độ tối đa Wap:</span> <span class="text-purple-400">Level 130</span></div>
                <div class="p-2 bg-[#18181c] rounded flex justify-between"><span>Trạng thái hoạt động:</span> <span class="text-amber-400">Ổn định 100%</span></div>
            </div>
        </div>
    `;
}

function renderGamesView(container) {
    container.innerHTML = `
        <div class="wap-card rounded-xl p-4 text-xs space-y-3">
            <h3 class="font-bold text-rose-400 border-b border-[#222228] pb-1.5"><i class="fa-solid fa-gamepad mr-1"></i> Khu giải trí <span class="text-amber-400">[26]</span></h3>
            <div class="grid grid-cols-2 gap-2">
                <div onclick="alert('Đang mở trò chơi Tài Xỉu Wap...')" class="p-3 bg-[#18181c] rounded-lg text-center cursor-pointer hover:border-rose-500/50 border border-[#27272a]">
                    <i class="fa-solid fa-dice text-amber-400 text-lg mb-1"></i>
                    <div class="font-bold">Tài Xỉu Online</div>
                </div>
                <div onclick="alert('Đang mở trò chơi Đào Vàng...')" class="p-3 bg-[#18181c] rounded-lg text-center cursor-pointer hover:border-rose-500/50 border border-[#27272a]">
                    <i class="fa-solid fa-gem text-blue-400 text-lg mb-1"></i>
                    <div class="font-bold">Đào Vàng Wap</div>
                </div>
            </div>
        </div>
    `;
}
