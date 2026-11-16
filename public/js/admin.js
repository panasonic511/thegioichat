async function renderAdminView(container) {
    const user = getCurrentUser();
    if (!user || (user.vai_tro !== 'Chủ Wap' && user.vai_tro !== 'Admin' && user.vai_tro !== 'Mods')) {
        container.innerHTML = `
            <div class="wap-card rounded-xl p-6 text-center text-xs space-y-3">
                <i class="fa-solid fa-triangle-exclamation text-rose-500 text-3xl"></i>
                <div class="font-bold text-rose-400 text-sm">Truy cập bị từ chối!</div>
                <p class="text-slate-400">Bạn không có quyền quản trị để truy cập trang này.</p>
                <button onclick="navigate(event, 'home')" class="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold">Về trang chủ</button>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="space-y-3">
            <div class="wap-card rounded-xl p-3 text-xs space-y-2">
                <h3 class="font-bold text-amber-400 border-b border-[#222228] pb-1.5 flex items-center">
                    <i class="fa-solid fa-shield-halved mr-1.5 text-amber-400"></i> Bảng Quản Trị Hệ Thống (Admin Panel)
                </h3>
                <p class="text-[11px] text-slate-400">Quản lý chức vụ, cấp độ thành viên (Tối đa Level 130) và số dư xu/vàng.</p>
            </div>

            <div class="wap-card rounded-xl p-3 text-xs space-y-3">
                <h4 class="font-bold text-emerald-400"><i class="fa-solid fa-users-gear mr-1"></i> Danh sách thành viên trong hệ thống</h4>
                <div id="admin-users-list" class="space-y-2 max-h-96 overflow-y-auto">
                    <div class="text-center text-slate-500 py-4">Đang tải danh sách thành viên...</div>
                </div>
            </div>
        </div>
    `;

    loadAdminUsers();
}

async function loadAdminUsers() {
    const listDiv = document.getElementById('admin-users-list');
    if (!listDiv) return;

    try {
        const res = await fetch('/api/admin/users');
        if (res.ok) {
            const users = await res.json();
            if (users.length === 0) {
                listDiv.innerHTML = '<div class="text-center text-slate-500 py-4">Không có thành viên nào.</div>';
                return;
            }

            listDiv.innerHTML = users.map(u => `
                <div class="p-3 bg-[#18181c] rounded-lg border border-[#27272a] space-y-2 text-xs">
                    <div class="flex justify-between items-center">
                        <span class="font-bold text-amber-400">${escapeHtml(u.ten_hien_thi)} <span class="text-[10px] text-slate-400">(@${escapeHtml(u.ten_dang_nhap)} - ID: ${u.id})</span></span>
                        <span class="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30 font-semibold">${u.vai_tro || 'Thành Viên'}</span>
                    </div>
                    <div class="grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                            <label class="block text-slate-400 text-[10px]">Chức vụ:</label>
                            <select id="role-${u.id}" class="w-full px-2 py-1 rounded wap-input text-[11px]">
                                <option value="Chủ Wap" ${u.vai_tro === 'Chủ Wap' ? 'selected' : ''}>Chủ Wap</option>
                                <option value="Admin" ${u.vai_tro === 'Admin' ? 'selected' : ''}>Admin</option>
                                <option value="Mods" ${u.vai_tro === 'Mods' ? 'selected' : ''}>Mods</option>
                                <option value="Thành Viên" ${u.vai_tro === 'Thành Viên' ? 'selected' : ''}>Thành Viên</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-slate-400 text-[10px]">Cấp độ (Max 130):</label>
                            <input type="number" id="level-${u.id}" value="${u.cap_do || 1}" min="1" max="130" class="w-full px-2 py-1 rounded wap-input text-[11px]">
                        </div>
                        <div>
                            <label class="block text-slate-400 text-[10px]">Tiền xu:</label>
                            <input type="number" id="coins-${u.id}" value="${u.tien_xu || 0}" min="0" class="w-full px-2 py-1 rounded wap-input text-[11px]">
                        </div>
                        <div>
                            <label class="block text-slate-400 text-[10px]">Tiền vàng:</label>
                            <input type="number" id="gold-${u.id}" value="${u.tien_vang || 0}" min="0" class="w-full px-2 py-1 rounded wap-input text-[11px]">
                        </div>
                    </div>
                    <div class="flex justify-end pt-1">
                        <button onclick="saveUserAdmin(${u.id})" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-[11px] font-semibold transition">Lưu thay đổi</button>
                    </div>
                </div>
            `).join('');
        }
    } catch (e) {
        listDiv.innerHTML = '<div class="text-center text-rose-400 py-4">Không thể tải danh sách thành viên.</div>';
    }
}

async function saveUserAdmin(userId) {
    const roleSelect = document.getElementById(`role-${userId}`);
    const levelInput = document.getElementById(`level-${userId}`);
    const coinsInput = document.getElementById(`coins-${userId}`);
    const goldInput = document.getElementById(`gold-${userId}`);

    if (!roleSelect || !levelInput || !coinsInput || !goldInput) return;

    let vai_tro = roleSelect.value;
    let cap_do = parseInt(levelInput.value) || 1;
    let tien_xu = parseInt(coinsInput.value) || 0;
    let tien_vang = parseInt(goldInput.value) || 0;

    if (cap_do > 130) {
        alert('Cấp độ tối đa của wap là 130!');
        cap_do = 130;
        levelInput.value = 130;
    }
    if (cap_do < 1) cap_do = 1;

    try {
        const res = await fetch('/api/admin/update-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: userId, vai_tro, cap_do, tien_xu, tien_vang })
        });
        const data = await res.json();
        if (res.ok) {
            alert('Đã cập nhật thông tin thành viên thành công!');
            loadAdminUsers();
        } else {
            alert(data.error || 'Cập nhật thất bại.');
        }
    } catch (e) {
        alert('Lỗi kết nối máy chủ.');
    }
}