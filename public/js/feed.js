let cachedAnnouncements = [];

function renderAnnouncements(list) {
  cachedAnnouncements = list || [];
  const box = document.getElementById('announcement-list');
  if (!cachedAnnouncements.length) {
    box.innerHTML = '<div class="muted">Chưa có thông báo nào từ BQT.</div>';
    return;
  }

  const canEdit = currentUser && currentUser.level >= 50;
  box.innerHTML = cachedAnnouncements.map((a) => `
    <div class="list-row">
      <div>
        ${a.is_pinned ? '📌 ' : '🔸 '}
        <b style="color:#fbbf24;">${a.title}</b>
        ${canEdit ? `
          <button class="btn-xs" onclick="openAnnouncementForm(${a.id})">Sửa</button>
          <button class="btn-xs btn-danger" onclick="deleteAnnouncement(${a.id})">Xóa</button>
        ` : ''}
      </div>
      <div style="margin:3px 0;">${a.content}</div>
      <div class="muted">Đăng bởi: ${renderRoleBadge(a.role, a.level)} ${a.display_name} • ${a.created_at}</div>
    </div>
  `).join('');
}

function openAnnouncementForm(editId = null) {
  if (!currentUser || currentUser.level < 50) {
    alert('Chỉ thành viên đạt Level 50 trở lên mới có quyền đăng/sửa thông báo!');
    return;
  }
  const existing = editId ? cachedAnnouncements.find((x) => x.id === editId) : null;
  const view = document.getElementById('main-view');
  view.innerHTML = `
    <div class="box-header">
      <span>${existing ? '✏️ CHỈNH SỬA THÔNG BÁO BQT' : '📢 ĐĂNG THÔNG BÁO MỚI (LEVEL 50+)'}</span>
      <button class="btn-xs" onclick="navigate('home')">Quay lại</button>
    </div>
    <div class="box-content">
      <form onsubmit="submitAnnouncement(event, ${existing ? existing.id : 'null'})" class="wap-form">
        <div class="form-group">
          <label>Tiêu đề thông báo:</label>
          <input type="text" id="ann-title" required value="${existing ? existing.title : ''}" />
        </div>
        <div class="form-group">
          <label>Nội dung thông báo:</label>
          <textarea id="ann-content" rows="4" required>${existing ? existing.content : ''}</textarea>
        </div>
        <div class="form-group">
          <label><input type="checkbox" id="ann-pin" style="width:auto;" ${existing && existing.is_pinned ? 'checked' : ''}/> Ghim thông báo lên đầu</label>
        </div>
        <button type="submit" class="btn-block btn-gold">${existing ? 'Lưu Chỉnh Sửa' : 'Đăng Thông Báo'}</button>
      </form>
    </div>
  `;
}

async function submitAnnouncement(e, id) {
  e.preventDefault();
  const title = document.getElementById('ann-title').value;
  const content = document.getElementById('ann-content').value;
  const is_pinned = document.getElementById('ann-pin').checked;

  const res = await apiFetch('/api/announcements', {
    method: 'POST',
    body: JSON.stringify({ id, title, content, is_pinned })
  });
  if (res.error) return alert(res.error);
  alert(res.message);
  navigate('home');
}

async function deleteAnnouncement(id) {
  if (!confirm('Xóa thông báo này?')) return;
  const res = await apiFetch(`/api/announcements/${id}`, { method: 'DELETE' });
  if (res.error) return alert(res.error);
  navigate('home');
}

async function renderFeedPage(category = 'bangtin') {
  const isForum = category === 'diendan';
  const view = document.getElementById('main-view');
  view.innerHTML = `<div class="box-header"><span>${isForum ? '💬 DIỄN ĐÀN THẢO LUẬN' : '📰 BẢNG TIN CỘNG ĐỒNG'}</span></div><div class="box-content">Đang tải...</div>`;

  const data = await apiFetch(`/api/posts?category=${category}`);
  const postForm = currentUser ? `
    <form onsubmit="submitPost(event, '${category}')" class="wap-form" style="margin-bottom:12px;border-bottom:1px solid #282e42;padding-bottom:10px;">
      ${isForum ? `<div class="form-group"><input type="text" id="post-title" required placeholder="Tiêu đề chủ đề diễn đàn..." /></div>` : ''}
      <div class="form-group">
        <textarea id="post-content" rows="2" required placeholder="${isForum ? 'Nội dung bài viết diễn đàn...' : 'Bạn đang nghĩ gì? Chia sẻ ngay (+10 Xu)...'}"></textarea>
      </div>
      <button type="submit" class="btn-primary">Đăng bài (+10 Xu)</button>
    </form>
  ` : `<div class="muted" style="margin-bottom:10px;">Vui lòng <a href="javascript:void(0)" onclick="openAuthModal('login')">Đăng nhập</a> để đăng bài viết.</div>`;

  const listHtml = (data.posts || []).map((p) => `
    <div class="list-row">
      <div>${p.avatar} <b>${p.display_name}</b> ${renderRoleBadge(p.role, p.level)} <span class="muted">• ID:${p.user_id}</span></div>
      ${p.title ? `<div style="color:#38bdf8;font-weight:bold;margin-top:3px;">📌 ${p.title}</div>` : ''}
      <div style="margin:4px 0;">${p.content}</div>
      <div class="muted">🕒 ${p.created_at} • <a href="javascript:void(0)" onclick="openChatWith(${p.user_id}, '${p.display_name}')">✉️ Nhắn tin</a></div>
    </div>
  `).join('') || '<div class="muted">Chưa có bài viết nào.</div>';

  view.innerHTML = `
    <div class="box-header"><span>${isForum ? '💬 DIỄN ĐÀN THẢO LUẬN' : '📰 BẢNG TIN CỘNG ĐỒNG'}</span></div>
    <div class="box-content">${postForm}${listHtml}</div>
  `;
}

async function submitPost(e, category) {
  e.preventDefault();
  const titleEl = document.getElementById('post-title');
  const content = document.getElementById('post-content').value;
  const res = await apiFetch('/api/posts', {
    method: 'POST',
    body: JSON.stringify({ category, title: titleEl ? titleEl.value : '', content })
  });
  if (res.error) return alert(res.error);
  renderFeedPage(category);
}
