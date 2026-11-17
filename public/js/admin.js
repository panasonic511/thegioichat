async function renderAdminPage() {
  const view = document.getElementById('main-view');
  if (!currentUser || currentUser.role === 'Thành Viên') {
    view.innerHTML = `<div class="box-content error-text">⛔ Bạn là Thành Viên nên không có quyền truy cập khu vực quản lý!</div>`;
    return;
  }

  view.innerHTML = `<div class="box-header"><span>🛡️ BẢNG ĐIỀU KHIỂN QUẢN TRỊ (${currentUser.role.toUpperCase()} - LV.${currentUser.level})</span></div><div class="box-content">Đang tải danh sách thành viên...</div>`;
  const data = await apiFetch('/api/admin/users');
  if (data.error) {
    view.innerHTML = `<div class="box-content error-text">${data.error}</div>`;
    return;
  }

  const rows = data.users.map((u) => `
    <div class="list-row">
      <div>
        <b>ID #${u.id}: ${u.display_name}</b> (@${u.username}) ${u.is_banned ? '<span style="color:#ef4444;">[ĐÃ KHÓA]</span>' : ''}
      </div>
      <div class="muted" style="margin-bottom:5px;">
        Hiện tại: ${renderRoleBadge(u.role, u.level)} • 💰 ${u.coins.toLocaleString()} Xu
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:4px;">
        <select id="adm-role-${u.id}">
          <option value="">-- Chức vụ --</option>
          ${currentUser.role === 'Chủ Wap' ? `<option value="Chủ Wap">Chủ Wap (Lv.130)</option>` : ''}
          ${currentUser.role === 'Chủ Wap' ? `<option value="Admin">Admin (Lv.125)</option>` : ''}
          ${currentUser.role !== 'Mod' ? `<option value="Mod">Mod (Lv.120)</option>` : ''}
          <option value="Thành Viên">Thành Viên</option>
        </select>
        <input type="number" id="adm-lv-${u.id}" placeholder="Level mới" />
        <input type="number" id="adm-coins-${u.id}" placeholder="+/- Xu" />
        <button class="btn-xs btn-primary" onclick="adminSaveUser(${u.id}, ${u.is_banned})">Lưu</button>
      </div>
      <div style="margin-top:4px;">
        <button class="btn-xs ${u.is_banned ? 'btn-gold' : 'btn-danger'}" onclick="adminToggleBan(${u.id}, ${u.is_banned ? 0 : 1})">
          ${u.is_banned ? '🔓 Mở khóa nick' : '🔒 Khóa nick này'}
        </button>
      </div>
    </div>
  `).join('');

  view.innerHTML = `
    <div class="box-header"><span>🛡️ QUẢN LÝ THÀNH VIÊN & PHÂN QUYỀN (${currentUser.role})</span></div>
    <div class="box-content">
      <div class="muted" style="margin-bottom:8px;">
        Quy tắc cấp độ: <b>Chủ Wap = 130</b> | <b>Admin = 125</b> | <b>Mod = 120</b> | <b>Thành Viên = 1 - 119</b> (Từ Lv.50 được đăng thông báo).
      </div>
      ${rows}
    </div>
  `;
}

async function adminSaveUser(targetId, currentBan) {
  const new_role = document.getElementById(`adm-role-${targetId}`).value;
  const new_level = document.getElementById(`adm-lv-${targetId}`).value;
  const coins_delta = document.getElementById(`adm-coins-${targetId}`).value;

  const res = await apiFetch('/api/admin/update-user', {
    method: 'POST',
    body: JSON.stringify({ target_id: targetId, new_role, new_level, coins_delta, is_banned: currentBan })
  });
  if (res.error) return alert(res.error);
  alert(res.message);
  renderAdminPage();
}

async function adminToggleBan(targetId, banState) {
  const res = await apiFetch('/api/admin/update-user', {
    method: 'POST',
    body: JSON.stringify({ target_id: targetId, is_banned: banState })
  });
  if (res.error) return alert(res.error);
  alert(res.message);
  renderAdminPage();
}
