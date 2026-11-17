export async function handleProfile(request, env, user, renderLayout, url) {
    const targetId = url.searchParams.get('user') || user.id;
    
    // Truy vấn thông tin người dùng cần xem (nếu xem ID khác hoặc xem chính mình)
    let profileUser = user;
    if (targetId != user.id) {
        profileUser = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(targetId).first();
    }

    if (!profileUser) {
        return new Response("Không tìm thấy người dùng này!", { status: 404 });
    }

    const content = `
    <div class="box">
        <div class="box-title">👤 Hồ sơ của tôi: ${profileUser.display_name}</div>
        
        <!-- Ảnh bìa & Avatar -->
        <div style="background: url('${profileUser.cover}') center/cover; height: 120px; position: relative; border-bottom: 1px solid #333;">
            <div style="position: absolute; bottom: -20px; left: 15px;">
                <img src="${profileUser.avatar}" width="60" height="60" style="border-radius: 50%; border: 2px solid #00ff00; background: #000;">
            </div>
        </div>

        <div style="padding: 25px 15px 15px 15px; background: #111;">
            <div style="font-size: 16px; font-weight: bold; color: #fff;">
                ${profileUser.display_name} <span style="color: #ffcc00; font-size: 13px;">[Lv.${profileUser.level}]</span>
            </div>
            <div style="color: #888; font-size: 12px; margin-top: 3px;">
                ID: ${profileUser.id} · Chức vụ: <span style="color: yellow;">${profileUser.role}</span>
            </div>
            <div style="margin-top: 10px; font-size: 13px; color: #00ff00; background: #000; padding: 6px; border: 1px dashed #333;">
                💬 "${profileUser.status_text}"
            </div>
            
            <div style="margin-top: 15px; display: flex; gap: 8px;">
                <a href="/settings" class="btn" style="padding: 5px 10px; font-size: 12px;">⚙️ Cài đặt</a>
                ${user.id == profileUser.id ? `
                    <a href="/profile/edit" class="btn" style="padding: 5px 10px; font-size: 12px; background: #333;">✏️ Chỉnh sửa</a>
                ` : `
                    <a href="/mail/chat?with=${profileUser.id}" class="btn" style="padding: 5px 10px; font-size: 12px;">✉️ Nhắn tin</a>
                `}
            </div>
        </div>

        <div class="box-content" style="border-top: 1px solid #333; font-size: 13px;">
            <div style="padding: 4px 0;">🚻 <b>Giới tính:</b> ${profileUser.gender}</div>
            <div style="padding: 4px 0;">📊 <b>Level (Cấp độ):</b> ${profileUser.level}</div>
            <div style="padding: 4px 0;">🪙 <b>Xu sở hữu:</b> ${profileUser.coins.toLocaleString()} Xu</div>
            <div style="padding: 4px 0;">⏱️ <b>Thời gian Online:</b> ${profileUser.online_time} phút</div>
        </div>
    </div>
    <div style="text-align: center;"><a href="/">⬅️ Về trang chủ</a></div>
    `;

    return new Response(renderLayout(`Hồ sơ ${profileUser.display_name}`, content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
