export async function handleAdminSql(request, env, user, renderLayout) {
    // Bảo mật tuyệt đối: CHỈ "Chủ Wap" mới được quyền truy cập vào đây
    if (!user || user.role !== 'Chủ Wap') {
        return new Response("Truy cập bị từ chối! Chỉ có Chủ Wap mới có quyền truy cập trang quản trị dữ liệu này.", { status: 403 });
    }

    const url = new URL(request.url);
    const table = url.searchParams.get('table') || 'users';
    let message = "";

    // Xử lý cập nhật nhanh dữ liệu nếu có POST request từ form chỉnh sửa
    if (request.method === 'POST') {
        const formData = await request.formData();
        const action = formData.get('action');
        
        if (action === 'update') {
            const id = formData.get('id');
            const coins = formData.get('coins');
            const role = formData.get('role');
            const level = formData.get('level');
            
            try {
                await env.DB.prepare("UPDATE users SET coins = ?, role = ?, level = ? WHERE id = ?")
                    .bind(coins, role, level, id)
                    .run();
                message = `<div style="color: #00ff00; padding: 5px; margin-bottom: 8px;">✅ Cập nhật thành công cho User ID: ${id}</div>`;
            } catch (e) {
                message = `<div style="color: #ff5555; padding: 5px; margin-bottom: 8px;">❌ Lỗi cập nhật: ${e.message}</div>`;
            }
        }
    }

    // Lấy danh sách các bảng trong database (SQLite master)
    let tablesList = [];
    try {
        const tQuery = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';").all();
        tablesList = tQuery.results || [];
    } catch (e) {
        tablesList = [{ name: 'users' }];
    }

    // Lấy dữ liệu của bảng đang chọn
    let tableData = [];
    let tableColumns = [];
    try {
        const dataQuery = await env.DB.prepare(`SELECT * FROM ${table} LIMIT 50;`).all();
        tableData = dataQuery.results || [];
        if (tableData.length > 0) {
            tableColumns = Object.keys(tableData[0]);
        } else {
            // Nếu bảng trống, lấy tên cột qua PRAGMA
            const colQuery = await env.DB.prepare(`PRAGMA table_info(${table});`).all();
            tableColumns = (colQuery.results || []).map(c => c.name);
        }
    } catch (e) {
        tableData = [];
    }

    const content = `
    <div style="display: flex; gap: 8px; align-items: flex-start;">
        
        <!-- Sidebar danh sách bảng (Giống Cloudflare Studio) -->
        <div style="width: 140px; background: #0a0a0a; border: 1px solid #333; padding: 6px; flex-shrink: 0;">
            <div style="font-weight: bold; color: #ffcc00; font-size: 11px; border-bottom: 1px solid #333; padding-bottom: 4px; margin-bottom: 6px;">
                📁 Danh sách bảng
            </div>
            ${tablesList.map(t => `
                <div style="margin-bottom: 4px;">
                    <a href="/myadminsql?table=${t.name}" style="display: block; padding: 4px 6px; font-size: 11px; background: ${table === t.name ? '#1a1a1a' : 'transparent'}; color: ${table === t.name ? '#00ff00' : '#aaa'}; border: 1px solid ${table === t.name ? '#444' : 'transparent'};">
                        🗃️ ${t.name}
                    </a>
                </div>
            `).join('')}
        </div>

        <!-- Khu vực hiển thị dữ liệu bảng (Giống khung Studio bên phải) -->
        <div style="flex-grow: 1; overflow: hidden;">
            <div class="box" style="margin-bottom: 0;">
                <div class="box-title" style="display: flex; justify-content: space-between; align-items: center;">
                    <span>📊 Đang xem bảng: <b style="color: #ffcc00;">${table}</b></span>
                    <a href="/myadminsql?table=${table}" style="font-size: 10px; color: #ffcc00;">🔄 Làm mới</a>
                </div>
                <div class="box-content" style="padding: 6px;">
                    ${message}
                    
                    <div style="overflow-x: auto; max-height: 400px;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 11px; color: #fff; white-space: nowrap;">
                            <thead>
                                <tr style="background: #151515; border-bottom: 1px solid #444;">
                                    ${tableColumns.map(col => `<th style="padding: 6px; border: 1px solid #333; text-align: left; color: #ffcc00;">${col}</th>`).join('')}
                                    ${table === 'users' ? '<th style="padding: 6px; border: 1px solid #333; text-align: center;">Thao tác</th>' : ''}
                                </tr>
                            </thead>
                            <tbody>
                                ${tableData.length === 0 ? `
                                    <tr><td colspan="${tableColumns.length + 1}" style="text-align: center; color: #888; padding: 20px;">Bảng trống không có dữ liệu!</td></tr>
                                ` : tableData.map(row => `
                                    <tr style="border-bottom: 1px solid #222;">
                                        ${tableColumns.map(col => `<td style="padding: 5px 6px; border: 1px solid #333; max-width: 150px; overflow: hidden; text-overflow: ellipsis;">${row[col] !== null ? row[col] : 'NULL'}</td>`).join('')}
                                        
                                        ${table === 'users' ? `
                                            <td style="padding: 4px; border: 1px solid #333; text-align: center;">
                                                <form method="POST" action="/myadminsql?table=users" style="display: inline-block; margin: 0;">
                                                    <input type="hidden" name="action" value="update">
                                                    <input type="hidden" name="id" value="${row.id}">
                                                    <input type="hidden" name="coins" value="${row.coins}">
                                                    <input type="hidden" name="role" value="${row.role}">
                                                    <input type="hidden" name="level" value="${row.level}">
                                                    <button type="submit" class="btn" style="padding: 2px 6px; font-size: 10px; background: #0055ff; color: #fff;">Lưu</button>
                                                </form>
                                            </td>
                                        ` : ''}
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>

                    <div style="margin-top: 8px; font-size: 10px; color: #888; text-align: right;">
                        Hiển thị tối đa 50 bản ghi gần nhất. Truy vấn nâng cao vui lòng dùng Cloudflare Studio.
                    </div>
                </div>
            </div>
        </div>

    </div>
    
    <div style="text-align: center; margin-top: 15px;"><a href="/admin">⬅️ Quay lại trang Quản lý</a> · <a href="/">Trang chủ</a></div>
    `;

    return new Response(renderLayout(`SQL Admin - ${table}`, content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
