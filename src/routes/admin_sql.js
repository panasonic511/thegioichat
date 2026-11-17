export async function handleAdminSql(request, env, user, renderLayout) {
    // Bảo mật tuyệt đối: Chỉ Chủ Wap hoặc Admin mới được truy cập
    if (!user || (user.role !== 'Chủ Wap' && user.role !== 'Admin')) {
        return new Response("Truy cập bị từ chối! Bạn không có quyền quản trị cơ sở dữ liệu.", { status: 403 });
    }

    let message = "";
    let resultTable = "";
    let query = request.method === 'POST' ? (await request.formData()).get('query') : "SELECT * FROM users;";

    if (request.method === 'POST' && query) {
        try {
            const trimmedQuery = query.trim();
            const upperQuery = trimmedQuery.toUpperCase();

            // Nếu là câu lệnh truy vấn dữ liệu (SELECT)
            if (upperQuery.startsWith('SELECT')) {
                const data = await env.DB.prepare(trimmedQuery).all();
                if (data.results && data.results.length > 0) {
                    const keys = Object.keys(data.results[0]);
                    resultTable = `
                    <div style="overflow-x: auto; margin-top: 10px;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 11px; color: #fff;">
                            <thead>
                                <tr style="background: #222; border-bottom: 1px solid #444;">
                                    ${keys.map(k => `<th style="padding: 6px; border: 1px solid #333; text-align: left; color: #ffcc00;">${k}</th>`).join('')}
                                </tr>
                            </thead>
                            <tbody>
                                ${data.results.map(row => `
                                    <tr style="border-bottom: 1px solid #222;">
                                        ${keys.map(k => `<td style="padding: 6px; border: 1px solid #333; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${row[k] !== null ? row[k] : 'NULL'}</td>`).join('')}
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>`;
                } else {
                    message = `<div style="color: #ffcc00; margin-top: 10px;">⚠️ Câu lệnh thực thi thành công nhưng không có dữ liệu trả về.</div>`;
                }
            } else {
                // Các câu lệnh chỉnh sửa/xóa/thêm (UPDATE, INSERT, DELETE, DROP...)
                const res = await env.DB.prepare(trimmedQuery).run();
                message = `<div style="color: #00ff00; margin-top: 10px;">✅ Thực thi câu lệnh SQL thành công! (Thay đổi: ${res.meta.changes || 0} dòng)</div>`;
            }
        } catch (e) {
            message = `<div style="color: #ff5555; margin-top: 10px;">❌ Lỗi SQL: ${e.message}</div>`;
        }
    }

    const content = `
    <div class="box">
        <div class="box-title">🗄️ Quản lý Cơ sở dữ liệu (D1 SQL Admin)</div>
        <div class="box-content">
            <div style="background: #151515; padding: 8px; border: 1px solid #333; font-size: 11px; margin-bottom: 10px; color: #aaa;">
                💡 Bạn có thể viết các câu lệnh SQL trực tiếp tại đây để truy vấn hoặc chỉnh sửa dữ liệu hệ thống mà không cần vào Cloudflare Dashboard.
            </div>

            <form method="POST" action="/myadminsql">
                <label style="color: #00ff00; display: block; margin-bottom: 4px; font-weight: bold;">Nhập câu lệnh SQL:</label>
                <textarea name="query" rows="5" required style="width: 100%; background: #000; color: #00ff00; border: 1px solid #444; padding: 8px; box-sizing: border-box; font-family: monospace; font-size: 12px; margin-bottom: 8px;">${query}</textarea>
                
                <div style="display: flex; gap: 8px;">
                    <button type="submit" class="btn" style="background: #0055ff; color: #fff; flex: 1;">⚡ Thực thi SQL</button>
                    <a href="/myadminsql" class="btn" style="background: #333; text-align: center; padding-top: 6px;">Làm mới</a>
                </div>
            </form>

            ${message}
            ${resultTable}
        </div>
    </div>

    <div class="box">
        <div class="box-title">📋 Gợi ý câu lệnh nhanh</div>
        <div class="box-content" style="font-size: 11px; line-height: 1.6;">
            <div>• Xem danh sách thành viên: <code style="color:#ffcc00;">SELECT * FROM users;</code></div>
            <div>• Cấp quyền Admin cho user ID 1: <code style="color:#ffcc00;">UPDATE users SET role = 'Admin' WHERE id = 1;</code></div>
            <div>• Tăng 1000 Xu cho user ID 1: <code style="color:#ffcc00;">UPDATE users SET coins = coins + 1000 WHERE id = 1;</code></div>
            <div>• Xóa thông báo cũ: <code style="color:#ffcc00;">DELETE FROM announcements;</code></div>
        </div>
    </div>

    <div style="text-align: center;"><a href="/admin">⬅️ Quay lại trang Quản lý</a> · <a href="/">Trang chủ</a></div>
    `;

    return new Response(renderLayout('SQL Admin', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
