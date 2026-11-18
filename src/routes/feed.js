import { renderUser } from '../worker.js';

export async function handleFeed(request, env, user, renderLayout) {
    // 1. Tự động khởi tạo và cập nhật cấu trúc bảng an toàn tuyệt đối
    try {
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                content TEXT,
                image_url TEXT,
                created_at TEXT
            )
        `).run();

        // Tự động thêm cột image_url nếu bảng cũ chưa có
        try { await env.DB.prepare("ALTER TABLE posts ADD COLUMN image_url TEXT").run(); } catch (e) {}

        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS post_likes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                post_id INTEGER,
                user_id INTEGER,
                reaction TEXT DEFAULT '❤️'
            )
        `).run();

        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS post_comments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                post_id INTEGER,
                user_id INTEGER,
                comment TEXT,
                created_at TEXT
            )
        `).run();

        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS stories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                media_url TEXT,
                media_type TEXT DEFAULT 'image',
                caption TEXT,
                created_at TEXT
            )
        `).run();
    } catch (e) {}

    // 2. Xử lý các yêu cầu POST
    let message = '';
    if (request.method === 'POST') {
        try {
            const formData = await request.formData();
            const action = formData.get('action');

            if (action === 'create_post') {
                const content = formData.get('content');
                const imageUrl = formData.get('image_url');
                if ((content && content.trim() !== '') || (imageUrl && imageUrl.trim() !== '')) {
                    await env.DB.prepare(
                        "INSERT INTO posts (user_id, content, image_url, created_at) VALUES (?, ?, ?, datetime('now'))"
                    ).bind(user.id, content || '', imageUrl || '').run();
                    message = '<div style="color: #00ff00; text-align: center; margin-bottom: 10px; font-weight: bold;">Đăng bài thành công!</div>';
                }
            } else if (action === 'react_post') {
                const postId = formData.get('post_id');
                const reaction = formData.get('reaction') || '❤️';
                
                const existing = await env.DB.prepare("SELECT id, reaction FROM post_likes WHERE post_id = ? AND user_id = ?").bind(postId, user.id).first();
                if (existing) {
                    if (existing.reaction === reaction) {
                        await env.DB.prepare("DELETE FROM post_likes WHERE post_id = ? AND user_id = ?").bind(postId, user.id).run();
                    } else {
                        await env.DB.prepare
