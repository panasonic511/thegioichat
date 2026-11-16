function renderShopView(container) {
    const user = getCurrentUser();
    container.innerHTML = `
        <div class="space-y-3 text-xs">
            <div class="flex items-center justify-between">
                <h3 class="font-bold text-emerald-400 text-sm flex items-center">
                    <i class="fa-solid fa-cart-shopping mr-1.5 text-yellow-400"></i> Cửa hàng vật phẩm
                </h3>
                <a href="/inventory" onclick="navigate(event, 'inventory')" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-semibold flex items-center shadow">
                    <i class="fa-solid fa-bag-shopping mr-1"></i> Túi đồ của tôi
                </a>
            </div>

            <div class="wap-card rounded-xl p-2.5 flex justify-between items-center bg-[#18181c]">
                <div class="flex items-center space-x-1 text-amber-300 font-semibold">
                    <i class="fa-solid fa-coins text-yellow-400 mr-1"></i> ${user ? user.tien_xu : 0} Xu
                </div>
                <div class="flex items-center space-x-1 text-yellow-400 font-semibold">
                    <i class="fa-solid fa-circle text-[8px] text-amber-500 mr-1"></i> ${user ? user.tien_vang : 0} Vàng
                </div>
            </div>

            <div class="grid grid-cols-2 gap-2">
                <div onclick="navigate(event, 'deposit-coins')" class="wap-card rounded-xl p-3 cursor-pointer hover:border-blue-500 transition space-y-1 bg-gradient-to-br from-[#121214] to-[#1a1a24]">
                    <div class="flex items-center space-x-2 text-blue-400 font-bold">
                        <i class="fa-solid fa-coins text-base text-slate-300"></i>
                        <span>Nạp Xu</span>
                    </div>
                    <p class="text-[10px] text-slate-400">Dùng cho game và tiện ích</p>
                </div>
                <div onclick="navigate(event, 'deposit-gold')" class="wap-card rounded-xl p-3 cursor-pointer hover:border-yellow-500 transition space-y-1 bg-gradient-to-br from-[#121214] to-[#241e12]">
                    <div class="flex items-center space-x-2 text-yellow-400 font-bold">
                        <i class="fa-solid fa-coins text-base text-amber-400"></i>
                        <span>Nạp Vàng</span>
                    </div>
                    <p class="text-[10px] text-slate-400">Mua vật phẩm đặc biệt</p>
                </div>
            </div>

            <div class="space-y-1.5">
                <div class="text-[11px] font-bold text-emerald-400 flex items-center px-1">
                    <i class="fa-solid fa-star mr-1"></i> Năng cấp tài khoản
                </div>
                <div onclick="buyShopItem('Tài khoản Plus (30 ngày)', 'vip', 500, 0)" class="wap-card rounded-xl p-3 cursor-pointer hover:border-purple-500 transition flex items-center justify-between">
                    <div class="flex items-center space-x-2.5">
                        <div class="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold"><i class="fa-solid fa-star"></i></div>
                        <div>
                            <div class="font-bold text-slate-200">Năng cấp tài khoản</div>
                            <div class="text-[10px] text-slate-400">Khám phá tài khoản Plus và Pro (500 xu)</div>
                        </div>
                    </div>
                    <i class="fa-solid fa-chevron-right text-slate-600"></i>
                </div>
            </div>

            <div class="space-y-1.5">
                <div class="text-[11px] font-bold text-emerald-400 flex items-center px-1">
                    <i class="fa-solid fa-star mr-1"></i> Vật phẩm và trang trí
                </div>
                
                <div onclick="buyShopItem('Khung Avatar Rồng Vàng', 'vat_pham', 200, 0)" class="wap-card rounded-xl p-3 cursor-pointer hover:border-blue-500 transition flex items-center justify-between">
                    <div class="flex items-center space-x-2.5">
                        <div class="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold"><i class="fa-solid fa-image"></i></div>
                        <div>
                            <div class="font-bold text-slate-200">Khung avatar</div>
                            <div class="text-[10px] text-slate-400">Làm nổi bật ảnh đại diện (200 xu)</div>
                        </div>
                    </div>
                    <i class="fa-solid fa-chevron-right text-slate-600"></i>
                </div>

                <div onclick="buyShopItem('Hiệu ứng tên Cầu Vồng', 'vat_pham', 0, 50)" class="wap-card rounded-xl p-3 cursor-pointer hover:border-pink-500 transition flex items-center justify-between">
                    <div class="flex items-center space-x-2.5">
                        <div class="w-8 h-8 rounded-lg bg-pink-500/20 text-pink-400 flex items-center justify-center font-bold"><i class="fa-solid fa-palette"></i></div>
                        <div>
                            <div class="font-bold text-slate-200">Hiệu ứng tên</div>
                            <div class="text-[10px] text-slate-400">Gradient, cầu vồng và ánh vàng (50 Vàng)</div>
                        </div>
                    </div>
                    <i class="fa-solid fa-chevron-right text-slate-600"></i>
                </div>

                <div onclick="buyShopItem('Icon Ngôi sao trước nick', 'vat_pham', 150, 0)" class="wap-card rounded-xl p-3 cursor-pointer hover:border-yellow-500 transition flex items-center justify-between">
                    <div class="flex items-center space-x-2.5">
                        <div class="w-8 h-8 rounded-lg bg-yellow-500/20 text-yellow-400 flex items-center justify-center font-bold"><i class="fa-solid fa-star"></i></div>
                        <div>
                            <div class="font-bold text-slate-200">Icon trước nick</div>
                            <div class="text-[10px] text-slate-400">Biểu tượng nhỏ cạnh tên (150 xu)</div>
                        </div>
                    </div>
                    <i class="fa-solid fa-chevron-right text-slate-600"></i>
                </div>

                <div onclick="buyShopItem('Ảnh nền dưới nick Đen Vàng', 'vat_pham', 300, 0)" class="wap-card rounded-xl p-3 cursor-pointer hover:border-emerald-500 transition flex items-center justify-between">
                    <div class="flex items-center space-x-2.5">
                        <div class="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold"><i class="fa-solid fa-panorama"></i></div>
                        <div>
                            <div class="font-bold text-slate-200">Ảnh nền dưới nick</div>
                            <div class="text-[10px] text-slate-400">Trang trí phần tên tài khoản (300 xu)</div>
                        </div>
                    </div>
                    <i class="fa-solid fa-chevron-right text-slate-600"></i>
                </div>

                <div onclick="buyShopItem('Trang trí màu sắc VIP', 'vat_pham', 0, 30)" class="wap-card rounded-xl p-3 cursor-pointer hover:border-purple-500 transition flex items-center justify-between">
                    <div class="flex items-center space-x-2.5">
                        <div class="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold"><i class="fa-solid fa-wand-magic-sparkles"></i></div>
                        <div>
                            <div class="font-bold text-slate-200">Trang trí màu sắc</div>
                            <div class="text-[10px] text-slate-400">Màu tên, viền và hiệu ứng sáng (30 Vàng)</div>
                        </div>
                    </div>
                    <i class="fa-solid fa-chevron-right text-slate-600"></i>
                </div>
            </div>
        </div>
    `;
}

async function buyShopItem(tenVatPham, loaiVatPham, giaXu, giaVang) {
    const user = getCurrentUser();
    if (!user) return alert('Vui lòng đăng nhập!');

    if (!confirm(`Bạn có muốn mua "${tenVatPham}" với giá ${giaXu > 0 ? giaXu + ' Xu' : giaVang + ' Vàng'} không?`)) return;

    try {
        const res = await fetch('/api/shop/buy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ten_dang_nhap: user.ten_dang_nhap, ten_vat_pham: tenVatPham, loai_vat_pham: loaiVatPham, gia_xu: giaXu, gia_vang: giaVang })
        });
        const data = await res.json();
        if (res.ok) {
            currentUser = data.user;
            localStorage.setItem('tgc_user_obj', JSON.stringify(currentUser));
            alert('🎉 Mua thành công! Vật phẩm đã được đưa vào Túi đồ của bạn.');
            renderShopView(document.getElementById('main-content'));
        } else {
            alert(data.error || 'Không thể mua vật phẩm.');
        }
    } catch (e) {
        alert('Lỗi kết nối.');
    }
}

function renderDepositCoinsView(container) {
    container.innerHTML = `
        <div class="wap-card rounded-xl p-4 text-xs space-y-3">
            <h3 class="font-bold text-blue-400 border-b border-[#222228] pb-1.5"><i class="fa-solid fa-coins mr-1"></i> Nạp Xu vào tài khoản</h3>
            <div class="grid grid-cols-2 gap-2">
                <button onclick="handleDeposit(1000, 0)" class="p-3 bg-[#18181c] rounded-lg border border-[#27272a] text-center font-bold text-amber-400">🎁 +1,000 Xu</button>
                <button onclick="handleDeposit(5000, 0)" class="p-3 bg-[#18181c] rounded-lg border border-[#27272a] text-center font-bold text-amber-400">🚀 +5,000 Xu</button>
            </div>
            <button onclick="navigate(event, 'shop')" class="w-full bg-[#1a1a1e] text-slate-300 py-2 rounded-lg font-semibold mt-2">Quay lại cửa hàng</button>
        </div>
    `;
}

function renderDepositGoldView(container) {
    container.innerHTML = `
        <div class="wap-card rounded-xl p-4 text-xs space-y-3">
            <h3 class="font-bold text-yellow-400 border-b border-[#222228] pb-1.5"><i class="fa-solid fa-coins mr-1"></i> Nạp Vàng vào tài khoản</h3>
            <div class="grid grid-cols-2 gap-2">
                <button onclick="handleDeposit(0, 100)" class="p-3 bg-[#18181c] rounded-lg border border-[#27272a] text-center font-bold text-yellow-400">🌟 +100 Vàng</button>
                <button onclick="handleDeposit(0, 500)" class="p-3 bg-[#18181c] rounded-lg border border-[#27272a] text-center font-bold text-yellow-400">👑 +500 Vàng</button>
            </div>
            <button onclick="navigate(event, 'shop')" class="w-full bg-[#1a1a1e] text-slate-300 py-2 rounded-lg font-semibold mt-2">Quay lại cửa hàng</button>
        </div>
    `;
}

async function handleDeposit(soXu, soVang) {
    const user = getCurrentUser();
    if (!user) return;
    try {
        const res = await fetch('/api/shop/deposit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ten_dang_nhap: user.ten_dang_nhap, so_xu: soXu, so_vang: soVang })
        });
        const data = await res.json();
        if (res.ok) {
            currentUser = data.user;
            localStorage.setItem('tgc_user_obj', JSON.stringify(currentUser));
            alert('✅ Nạp thành công!');
            navigate(null, 'shop');
        }
    } catch (e) {}
}

async function renderInventoryView(container) {
    const user = getCurrentUser();
    container.innerHTML = `
        <div class="space-y-3 text-xs">
            <div class="flex items-center justify-between">
                <h3 class="font-bold text-blue-400 text-sm flex items-center">
                    <i class="fa-solid fa-bag-shopping mr-1.5"></i> Túi đồ của tôi (${user.ten_hien_thi})
                </h3>
                <a href="/shop" onclick="navigate(event, 'shop')" class="text-amber-400 hover:underline font-semibold">‹ Cửa hàng</a>
            </div>
            <div id="inventory-items" class="space-y-2">
                <div class="wap-card rounded-xl p-4 text-center text-slate-400">Đang tải túi đồ...</div>
            </div>
        </div>
    `;

    try {
        const res = await fetch(`/api/shop/inventory?ten_dang_nhap=${encodeURIComponent(user.ten_dang_nhap)}`);
        if (res.ok) {
            const items = await res.json();
            const listDiv = document.getElementById('inventory-items');
            if (items.length === 0) {
                listDiv.innerHTML = `<div class="wap-card rounded-xl p-6 text-center text-slate-400">Túi đồ trống. Hãy mua vật phẩm tại cửa hàng!</div>`;
                return;
            }
            listDiv.innerHTML = items.map(i => `
                <div class="wap-card rounded-xl p-3 flex justify-between items-center bg-[#18181c]">
                    <div>
                        <div class="font-bold text-slate-200">${escapeHtml(i.ten_vat_pham)}</div>
                        <div class="text-[10px] text-slate-400">Loại: ${escapeHtml(i.loai_vat_pham)} · Mua lúc: ${i.ngay_mua}</div>
                    </div>
                    <span class="bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded text-[10px] font-semibold">Đang có</span>
                </div>
            `).join('');
        }
    } catch (e) {}
}
