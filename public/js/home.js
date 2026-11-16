async function renderHomeView(container) {
    const user = getCurrentUser();
    container.innerHTML = `
        <div class="space-y-3">
            <div class="wap-card rounded-xl p-2.5 flex items-center justify-between text-xs">
                <div class="flex items-center space-x-2.5">
                    <div class="relative">
                        <div class="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-500 to-pink-500 flex items-center justify-center text-white font-bold text-sm shadow">
                            ${user.ten_hien_thi.charAt(0).toUpperCase()}
                        </div>
                        <div class="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-[#121214] rounded-full"></div>
                    </div>
                    <div>
                        <div class="flex items-center space-x-1">
                            <span class="font-bold text-amber-400 text-sm">${user.ten_hien_thi}</span>
                            <span class="text-slate-400 text-[10px]">(ID: ${user.id})</span>
                        </div>
                        <div class="flex items-center space-x-3 mt-0.5 text-[11px]">
                            <span class="flex items-center text-amber-300"><i class="fa-solid fa-coins text-[10px] mr-1 text-yellow-400"></i>${user.tien_xu || 0} xu</span>
                            <span class="flex items-center text-yellow-400"><i class="fa-solid fa-circle text-[8px] mr-1 text-amber-500"></i>${user.tien_vang || 0} vàng</span>
                            <span class="flex items-center text-purple-400 font-bold"><i class="fa-solid fa-shield-halved text-[10px] mr-1"></i>Lv.${user.cap_do || 1}/130</span>
                        </div>
                    </div>
                </div>
                <div class="text-right flex flex-col items-end space-y-1">
                    <span class="bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded text-[10px] font-semibold">${user.vai_tro || 'Thành Viên'}</span>
                    <button onclick="handleLogout()" class="text-rose-400 text-[10px] hover:underline">Đăng xuất</button>
                </div>
            </div>

            <!-- Phòng chat -->
            <div class="space-y-1.5">
                <h3 class="text-xs font-bold text-emerald-400 flex items-center px-1"><i class="fa-solid fa-door-open mr-1.5"></i> Phòng chat</h3>
                <div class="grid grid-cols-2 gap-2">
                    <div onclick="navigate(null, 'online')" class="wap-card rounded-xl p-3 text-center cursor-pointer hover:border-emerald-500/50 transition space-y-1">
                        <i class="fa-solid fa-house text-amber-400 text-base"></i>
                        <div class="font-bold text-xs text-slate-200">Bữa tiệc</div>
                        <div class="text-[10px] text-slate-400"><i class="fa-solid fa-user text-[9px] text-emerald-400"></i> <span id="home-online-count">1</span></div>
                    </div>
                    <div onclick="navigate(null, 'games')" class="wap-card rounded-xl p-3 text-center cursor-pointer hover:border-emerald-500/50 transition space-y-1">
                        <i class="fa-solid fa-gamepad text-blue-400 text-base"></i>
                        <div class="font-bold text-xs text-slate-200">Trò chơi</div>
                        <div class="text-[10px] text-slate-400"><i class="fa-solid fa-user text-[9px] text-slate-500"></i> 0</div>
                    </div>
                    <div onclick="navigate(null, 'online')" class="wap-card rounded-xl p-3 text-center cursor-pointer hover:border-emerald-500/50 transition space-y-1">
                        <i class="fa-solid fa-comments text-pink-400 text-base"></i>
                        <div class="font-bold text-xs text-slate-200">Giao lưu</div>
                        <div class="text-[10px] text-slate-400"><i class="fa-solid fa-user text-[9px] text-slate-500"></i> 0</div>
                    </div>
                    <div onclick="navigate(null, 'messages')" class="wap-card rounded-xl p-3 text-center cursor-pointer hover:border-emerald-500/50 transition space-y-1">
                        <i class="fa-solid fa-comments text-amber-400 text-base"></i>
                        <div class="font-bold text-xs text-slate-200">Chat room</div>
                        <div class="text-[10px] text-slate-400"><i class="fa-solid fa-user text-[9px] text-emerald-400"></i> 2</div>
                    </div>
                </div>
            </div>

            <!-- Menu nhanh có Cửa hàng -->
            <div class="wap-card rounded-xl overflow-hidden text-xs">
                <div class="bg-[#18181c] px-3 py-2 border-b border-[#27272a] font-bold text-emerald-400 flex items-center justify-between">
                    <span><i class="fa-solid fa-bars mr-1.5"></i> Menu hệ thống</span>
                    <a href="/shop" onclick="navigate(event, 'shop')" class="text-yellow-400 hover:underline font-bold"><i class="fa-solid fa-cart-shopping mr-1"></i> Cửa hàng</a>
                </div>
                <div class="grid grid-cols-2 divide-x divide-y divide-[#222228] text-[11px]">
                    <a href="/posts" onclick="navigate(event, 'posts')" class="p-2.5 hover:bg-[#18181c] transition flex items-center space-x-2 text-slate-300"><i class="fa-solid fa-comments text-pink-400 w-4 text-center"></i> <span>Diễn đàn (<span id="home-total-posts">0</span>)</span></a>
                    <a href="/online" onclick="navigate(event, 'online')" class="p-2.5 hover:bg-[#18181c] transition flex items-center space-x-2 text-slate-300"><i class="fa-solid fa-user-group text-emerald-400 w-4 text-center"></i> <span>Thành viên</span></a>
                    <a href="/messages" onclick="navigate(event, 'messages')" class="p-2.5 hover:bg-[#18181c] transition flex items-center space-x-2 text-slate-300"><i class="fa-solid fa-envelope text-blue-400 w-4 text-center"></i> <span>Tin nhắn riêng</span></a>
                    <a href="/menu" onclick="navigate(event, 'menu')" class="p-2.5 hover:bg-[#18181c] transition flex items-center space-x-2 text-slate-300"><i class="fa-solid fa-gear text-slate-400 w-4 text-center"></i> <span>Cài đặt</span></a>
                </div>
            </div>

            <!-- Thông báo banner -->
            <div class="wap-card rounded-xl overflow-hidden text-xs">
                <div class="bg-[#18181c] px-3 py-2 border-b border-[#27272a] font-bold text-emerald-400 flex items-center justify-between">
                    <span><i class="fa-solid fa-bullhorn mr-1.5"></i> Thông báo</span>
                </div>
                <div class="p-4 text-center space-y-2 bg-[#0a0a0c]">
                    <div class="text-pink-400 tracking-wider text-xs">💖 ✨ 💖 ✨ 💖 ✨ 💖</div>
                    <div class="text-[11px] font-semibold text-slate-300" id="live-clock-banner">Đang tải...</div>
                    <div class="text-xs font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-pink-400 to-amber-400 pt-1">
                        CHÀO MỪNG ĐẾN VỚI THẾ GIỚI CHAT<br>CHÚC M.N ONLINE VUI VẺ
                    </div>
                </div>
            </div>
        </div>
    `;

    try {
        const res = await fetch('/api/stats');
        if (res.ok) {
            const data = await res.json();
            const uElem = document.getElementById('home-total-users');
            const pElem = document.getElementById('home-total-posts');
            const oElem = document.getElementById('home-online-count');
            if (uElem) uElem.innerText = data.tongThanhVien;
            if (pElem) pElem.innerText = data.tongBaiViet;
            if (oElem) oElem.innerText = data.thanhVienOnline;
        }
    } catch (e) {}
}
