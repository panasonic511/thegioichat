import { getCurrentUser, switchTab } from './app.js';
import { handleLogout } from './auth.js';

export async function renderHomeView(container) {
    const user = getCurrentUser();
    const now = new Date();
    const days = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} - ${days[now.getDay()]} ••••• ${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} •••••`;

    container.innerHTML = `
        <div class="space-y-3">
            <!-- Thông tin thành viên -->
            <div class="wap-card rounded-xl p-2.5 flex items-center justify-between text-xs">
                <div class="flex items-center space-x-2.5">
                    <div class="relative">
                        <div class="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-500 to-pink-500 flex items-center justify-center text-white font-bold text-sm shadow">
                            ${user.display_name.charAt(0).toUpperCase()}
                        </div>
                        <div class="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-[#121214] rounded-full"></div>
                    </div>
                    <div>
                        <div class="flex items-center space-x-1">
                            <span class="font-bold text-amber-400 text-sm">${user.display_name}</span>
                            <span class="text-slate-400 text-[10px]">(ID: ${user.id})</span>
                        </div>
                        <div class="flex items-center space-x-2 mt-0.5 text-[11px]">
                            <span class="flex items-center text-amber-300"><i class="fa-solid fa-coins text-[10px] mr-1 text-yellow-400"></i>0</span>
                            <span class="flex items-center text-emerald-400 font-bold"><i class="fa-solid fa-users text-[10px] mr-1"></i><span id="home-total-users">...</span> thành viên</span>
                        </div>
                    </div>
                </div>
                <div class="text-right flex flex-col items-end space-y-1">
                    <span class="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] font-semibold">Thành viên</span>
                    <button id="btn-home-logout" class="text-rose-400 text-[10px] hover:underline">Đăng xuất</button>
                </div>
            </div>

            <!-- Phòng chat -->
            <div class="space-y-1.5">
                <h3 class="text-xs font-bold text-emerald-400 flex items-center px-1"><i class="fa-solid fa-door-open mr-1.5"></i> Phòng chat</h3>
                <div class="grid grid-cols-2 gap-2">
                    <div data-go="online" class="home-nav-card wap-card rounded-xl p-3 text-center cursor-pointer hover:border-emerald-500/50 transition space-y-1">
                        <i class="fa-solid fa-house text-amber-400 text-base"></i>
                        <div class="font-bold text-xs text-slate-200">Bữa tiệc</div>
                        <div class="text-[10px] text-slate-400"><i class="fa-solid fa-user text-[9px] text-emerald-400"></i> <span id="home-online-count">1</span></div>
                    </div>
                    <div data-go="online" class="home-nav-card wap-card rounded-xl p-3 text-center cursor-pointer hover:border-emerald-500/50 transition space-y-1">
                        <i class="fa-solid fa-gamepad text-blue-400 text-base"></i>
                        <div class="font-bold text-xs text-slate-200">Trò chơi</div>
                        <div class="text-[10px] text-slate-400"><i class="fa-solid fa-user text-[9px] text-slate-500"></i> 0</div>
                    </div>
                    <div data-go="online" class="home-nav-card wap-card rounded-xl p-3 text-center cursor-pointer hover:border-emerald-500/50 transition space-y-1">
                        <i class="fa-solid fa-comments text-pink-400 text-base"></i>
                        <div class="font-bold text-xs text-slate-200">Giao lưu</div>
                        <div class="text-[10px] text-slate-400"><i class="fa-solid fa-user text-[9px] text-slate-500"></i> 0</div>
                    </div>
                    <div data-go="messages" class="home-nav-card wap-card rounded-xl p-3 text-center cursor-pointer hover:border-emerald-500/50 transition space-y-1">
                        <i class="fa-solid fa-comments text-amber-400 text-base"></i>
                        <div class="font-bold text-xs text-slate-200">Chat room</div>
                        <div class="text-[10px] text-slate-400"><i class="fa-solid fa-user text-[9px] text-emerald-400"></i> 2</div>
                    </div>
                </div>
            </div>

            <!-- Menu nhanh -->
            <div class="wap-card rounded-xl overflow-hidden text-xs">
                <div class="bg-[#18181c] px-3 py-2 border-b border-[#27272a] font-bold text-emerald-400 flex items-center">
                    <i class="fa-solid fa-bars mr-1.5"></i> Menu hệ thống
                </div>
                <div class="grid grid-cols-2 divide-x divide-y divide-[#222228] text-[11px]">
                    <a href="#" data-go="posts" class="home-nav-card p-2.5 hover:bg-[#18181c] transition flex items-center space-x-2 text-slate-300"><i class="fa-solid fa-comments text-pink-400 w-4 text-center"></i> <span>Diễn đàn (<span id="home-total-posts">0</span>)</span></a>
                    <a href="#" data-go="online" class="home-nav-card p-2.5 hover:bg-[#18181c] transition flex items-center space-x-2 text-slate-300"><i class="fa-solid fa-user-group text-emerald-400 w-4 text-center"></i> <span>Thành viên</span></a>
                    <a href="#" data-go="messages" class="home-nav-card p-2.5 hover:bg-[#18181c] transition flex items-center space-x-2 text-slate-300"><i class="fa-solid fa-envelope text-blue-400 w-4 text-center"></i> <span>Tin nhắn riêng</span></a>
                    <a href="#" data-go="menu" class="home-nav-card p-2.5 hover:bg-[#18181c] transition flex items-center space-x-2 text-slate-300"><i class="fa-solid fa-gear text-slate-400 w-4 text-center"></i> <span>Cài đặt</span></a>
                </div>
            </div>

            <!-- Thông báo hệ thống -->
            <div class="wap-card rounded-xl overflow-hidden text-xs">
                <div class="bg-[#18181c] px-3 py-2 border-b border-[#27272a] font-bold text-emerald-400 flex items-center justify-between">
                    <span><i class="fa-solid fa-bullhorn mr-1.5"></i> Thông báo</span>
                </div>
                <div class="p-4 text-center space-y-2 bg-[#0a0a0c]">
                    <div class="text-pink-400 tracking-wider text-xs">💖 ✨ 💖 ✨ 💖 ✨ 💖</div>
                    <div class="text-[11px] font-semibold text-slate-300">${timeStr}</div>
                    <div class="text-xs font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-pink-400 to-amber-400 pt-1">
                        CHÀO MỪNG ĐẾN VỚI THẾ GIỚI CHAT<br>CHÚC M.N ONLINE VUI VẺ
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('btn-home-logout').onclick = handleLogout;
    document.querySelectorAll('.home-nav-card').forEach(el => {
        el.onclick = (e) => { e.preventDefault(); switchTab(el.getAttribute('data-go')); };
    });

    // Tải số liệu thực tế từ Database D1
    try {
        const res = await fetch('/api/stats');
        if (res.ok) {
            const data = await res.json();
            document.getElementById('home-total-users').innerText = data.totalUsers;
            document.getElementById('home-total-posts').innerText = data.totalPosts;
            document.getElementById('home-online-count').innerText = data.onlineCount;
        }
    } catch (e) {}
}
