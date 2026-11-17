export async function handleFeedRoutes(request, env, path, user, renderLayout) {
    if (path === '/users/feed' && request.method === 'GET') {
        const feeds = await env.DB.prepare("SELECT feeds.*, users.display_name, users.avatar, users.role, users.level FROM feeds JOIN users ON feeds.user_id = users.id ORDER BY id DESC LIMIT 20").all();
        const content = `
        <div class="box">
            <div class="box-title">📋 Bảng tin xã hội</div>
            <div class="box-content">
                <form method="POST" action="/users/feed">
                    <textarea name="content" placeholder="Bạn đang nghĩ gì?" rows="3" required style="width:100%;background:#000;color:#00ff00;"></textarea>
                    <button type="submit">Đăng bài</button>
                </form>
            </div>
        </div>
        <div class="box"><div class="box-content">
            ${feeds.results.map(f => `<div style="border-bottom:1px solid #333;margin-bottom:8px;padding-bottom:8px;"><b>${f.display_name} [Lv.${f.level}]</b>: ${f.content}</div>`).join('')}
        </div></div>`;
        return new Response(renderLayout('Bảng tin', content, user), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
    }

    if (path === '/users/feed' && request.method === 'POST') {
        const formData = await request.formData();
        await env.DB.prepare("INSERT INTO feeds (user_id, content) VALUES (?, ?)").bind(user.id, formData.get('content')).run();
        return Response.redirect(302, '/users/feed');
    }

    return null;
}
