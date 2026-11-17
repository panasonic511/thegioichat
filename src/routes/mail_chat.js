import { renderUser } from '../utils/userStyle.js';

export async function handleMailChat(request, env, user, renderLayout, url) {
    const partnerId = parseInt(url.searchParams.get('user'));
    if (!partnerId || partnerId === user.id) {
        return new Response("Người dùng không hợp lệ!", { status: 400 });
    }

    // Tự động tạo bảng tin nhắn (messages) nếu chưa có
    try {
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sender_id INTEGER NOT NULL,
                receiver_id INTEGER NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
        `).run();
    } catch (e) {}

    let partner = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(partnerId).first();
    if (!partner) return new Response("Không tìm thấy thành viên này!", { status: 404 });

    // Xử lý gửi tin nhắn POST
    if (request.method === 'POST') {
        const formData = await request.formData();
        const contentText = (formData.get('content') || '').trim();
        if (contentText) {
            await env.DB.prepare("INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)")
                .bind(user.id, partnerId, contentText)
                .run();
            
            // Nếu là gọi API AJAX trả về JSON
            if (request.headers.get('X-Requested-With') === 'XMLHttpRequest' || url.searchParams.get('format') === 'json') {
                return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
            }
        }
    }

    // Nếu gọi API fetch ngầm lấy danh sách tin nhắn mới dạng JSON
    if (url.searchParams.get('format') === 'json') {
        let msgs = { results: [] };
        try {
            msgs = await env.DB.prepare(`
                SELECT * FROM messages 
                WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
                ORDER BY id ASC
            `).bind(user.id, partnerId, partnerId, user.id).all();
        } catch (e) {}
        return new Response(JSON.stringify(msgs.results || []), {
            headers: { 'Content-Type': 'application/json;charset=UTF-8' }
        });
    }

    // Lấy tin nhắn ban đầu
    let messages = { results: [] };
    try {
        messages = await env.DB.prepare(`
            SELECT * FROM messages 
            WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
            ORDER BY id ASC
        `).bind(user.id, partnerId, partnerId, user.id).all();
    } catch (e) {}

    const partnerUI = renderUser(partner);

    const content = `
    <div class="box">
        <div class="box-title" style="display: flex; align-items: center; gap: 6px;">
            <a href="/profile?user=${partner.id}"><img src="${partner.avatar && !partner.avatar.includes('7gXvS6v') ? partner.avatar : 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\'><rect width=\'100\' height=\'100\' fill=\'%231a1a1a\'/><circle cx=\'50\' cy=\'38\' r=\'18\' fill=\'%2300ff00\'/></svg>'}" width="24" height="24" style="${partnerUI.avatarStyle}"></a>
            <span>💬 Trò chuyện với <a href="/profile?user=${partner.id}" style="${partnerUI.nameStyle}">${partner.display_name}</a></span>
        </div>
        
        <!-- Khung chứa tin nhắn tự động trượt xuống và cập nhật ngầm -->
        <div class="box-content" id="chat-messages-box" style="height: 300px; overflow-y: scroll; background: #000; border: 1px solid #222; padding: 6px; display: flex; flex-direction: column; gap: 6px;">
            ${messages.results.length === 0 ? '<div style="text-align: center; color: #888; margin: auto;">Chưa có tin nhắn nào. Hãy gửi lời chào!</div>' : 
                messages.results.map(m => renderMessageBubble(m, user.id, partner)).join('')}
        </div>

        <!-- Form gửi tin nhắn mượt mà không reload -->
        <div style="padding: 6px; background: #111; border-top: 1px solid #333;">
            <form id="chat-form" onsubmit="sendChatMessage(event, ${partnerId})" style="display: flex; gap: 6px; margin: 0;">
                <input type="text" id="chat-input-text" name="content" placeholder="Nhập nội dung chát..." required autocomplete="off" style="flex: 1; background: #000; color: #00ff00; border: 1px solid #444; padding: 6px; font-size: 11px;">
                <button type="submit" class="btn" style="background: #0055ff; color: #fff; padding: 0 12px;">Gửi</button>
            </form>
        </div>
    </div>

    <div style="text-align: center; margin-top: 10px;"><a href="/mail/box">⬅️ Hộp thư tin nhắn</a></div>

    <!-- Script Realtime Polling cho Chat -->
    <script>
        const currentUserId = ${user.id};
        const partnerId = ${partnerId};

        function scrollToBottom() {
            const box = document.getElementById('chat-messages-box');
            box.scrollTop = box.scrollHeight;
        }
        window.onload = scrollToBottom;

        async function sendChatMessage(e, pId) {
            e.preventDefault();
            const input = document.getElementById('chat-input-text');
            const text = input.value.trim();
            if (!text) return;

            const formData = new FormData();
            formData.append('content', text);

            try {
                const res = await fetch('/mail/chat?user=' + pId, {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: formData
                });
                if (res.ok) {
                    input.value = '';
                    fetchNewMessages();
                }
            } catch (err) {
                console.error('Lỗi gửi tin nhắn:', err);
            }
        }

        async function fetchNewMessages() {
            try {
                const res = await fetch('/mail/chat?user=' + partnerId + '&format=json');
                if (res.ok) {
                    const data = await res.json();
                    const box = document.getElementById('chat-messages-box');
                    if (data.length === 0) return;

                    let html = '';
                    data.forEach(m => {
                        const isMe = m.sender_id === currentUserId;
                        const align = isMe ? 'text-align: right;' : 'text-align: left;';
                        const bg = isMe ? '#001a33' : '#1a1a1a';
                        const borderCol = isMe ? '#0055ff' : '#444';
                        
                        html += \`
                        <div style="\${align} margin-bottom: 4px;">
                            <div style="display: inline-block; background: \${bg}; border: 1px solid \${borderCol}; padding: 6px 10px; border-radius: 4px; max-width: 80%; text-align: left; word-break: break-all; font-size: 11px; color: #fff;">
                                \${m.content}
                            </div>
                        </div>\`;
                    });
                    
                    const isAtBottom = box.scrollHeight - box.scrollTop <= box.clientHeight + 60;
                    box.innerHTML = html;
                    if (isAtBottom) scrollToBottom();
                }
            } catch (err) {
                console.error('Lỗi tải tin nhắn ngầm:', err);
            }
        }

        // Tự động kiểm tra tin nhắn mới mỗi 3 giây
        setInterval(fetchNewMessages, 3000);
    </script>
    `;

    return new Response(renderLayout('Tin nhắn', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}

function renderMessageBubble(m, currentUserId, partner) {
    const isMe = m.sender_id === currentUserId;
    const align = isMe ? 'text-align: right;' : 'text-align: left;';
    const bg = isMe ? '#001a33' : '#1a1a1a';
    const borderCol = isMe ? '#0055ff' : '#444';

    return `
    <div style="${align} margin-bottom: 4px;">
        <div style="display: inline-block; background: ${bg}; border: 1px solid ${borderCol}; padding: 6px 10px; border-radius: 4px; max-width: 80%; text-align: left; word-break: break-all; font-size: 11px; color: #fff;">
            ${m.content}
        </div>
    </div>
    `;
}
