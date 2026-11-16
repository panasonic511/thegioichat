function renderOnlineView(container) {
    const user = getCurrentUser();
    container.innerHTML = `
        <div class="wap-card rounded-xl p-3 text-xs space-y-2">
            <h3 class="font-bold text-emerald-400 border-b border-[#222228] pb-1"><i class="fa-solid fa-users mr-1"></i> Thành viên trực tuyến</h3>
            <div class="space-y-2">
                <div class="flex items-center justify-between p-2 bg-[#18181c] rounded-lg">
                    <div class="flex items-center space-x-2">
                        <div class="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">${user.display_name.charAt(0).toUpperCase()}</div>
                        <div>
                            <span class="font-bold text-amber-400">${user.display_name}</span>
                            <span class="text-[10px] text-slate-400 block">ID: ${user.id} · Hoạt động</span>
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
                <div class="font-bold text-emerald-400">🎉 Chào mừng đến với Thế Giới Chat!</div>
                <p class="text-[11px] text-slate-400">Hệ thống hoạt động ổn định. Chúc bạn giao lưu vui vẻ!</p>
            </div>
        </div>
    `;
}

function renderMenuView(container) {
    const user = getCurrentUser();
    container.innerHTML = `
        <div class="space-y-3">
            <div class="wap-card rounded-xl p-3 text-xs space-y-1">
                <h3 class="font-bold text-amber-400 text-sm border-b border-[#222228] pb-1.5 flex items-center">
                    <i class="fa-solid fa-bars mr-1.5 text-purple-400"></i> Menu hệ thống GAUBONG.US
                </h3>
                <p class="text-[11px] text-slate-400">Xin chào, <span class="text-amber-400 font-semibold">${user ? user.display_name : 'Khách'}</span>.</p>
            </div>
            <div class="wap-card rounded-xl overflow-hidden text-xs">
                <div class="grid grid-cols-1 divide-y divide-[#222228] text-[11px]">
                    <a href="#" onclick="switchTab('home')" class="p-3 hover:bg-[#18181c] transition flex items-center justify-between text-slate-300">
                        <span class="flex items-center"><i class="fa-solid fa-user text-amber-400 w-5 text-center mr-2"></i> Trang chủ cá nhân</span>
                        <i class="fa-solid fa-chevron-right text-[10px] text-slate-600"></i>
                    </a>
                    <a href="#" onclick="switchTab('online')" class="p-3 hover:bg-[#18181c] transition flex items-center justify-between text-slate-300">
                        <span class="flex items-center"><i class="fa-solid fa-users text-emerald-400 w-5 text-center mr-2"></i> Thành viên trực tuyến</span>
                        <i class="fa-solid fa-chevron-right text-[10px] text-slate-600"></i>
                    </a>
                    <a href="#" onclick="switchTab('posts')" class="p-3 hover:bg-[#18181c] transition flex items-center justify-between text-slate-300">
                        <span class="flex items-center"><i class="fa-solid fa-newspaper text-blue-400 w-5 text-center mr-2"></i> Bảng tin cộng đồng</span>
                        <i class="fa-solid fa-chevron-right text-[10px] text-slate-600"></i>
                    </a>
                    <a href="#" onclick="switchTab('notifications')" class="p-3 hover:bg-[#18181c] transition flex items-center justify-between text-slate-300">
                        <span class="flex items-center"><i class="fa-solid fa-bell text-yellow-400 w-5 text-center mr-2"></i> Thông báo hệ thống</span>
                        <i class="fa-solid fa-chevron-right text-[10px] text-slate-600"></i>
                    </a>
                    <a href="#" onclick="switchTab('messages')" class="p-3 hover:bg-[#18181c] transition flex items-center justify-between text-slate-300">
                        <span class="flex items-center"><i class="fa-solid fa-envelope text-pink-400 w-5 text-center mr-2"></i> Tin nhắn riêng</span>
                        <i class="fa-solid fa-chevron-right text-[10px] text-slate-600"></i>
                    </a>
                </div>
            </div>
        </div>
    `;
}
