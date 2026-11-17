import { renderUser } from '../utils/userStyle.js';

export async function handleProfile(request, env, user, renderLayout, url) {
    let message = "";
    const targetId = parseInt(url.searchParams.get('user') || user.id);

    let profileUser = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(targetId).first();
    if (!profileUser) return new Response("Không tìm thấy thành viên!", { status: 404 });

    const isOwner = (targetId === user.id);
    // ... (phần xử lý POST giữ nguyên)

    const profileUI = renderUser(profileUser);
    const hasCover = (profileUser.cover_photo && !profileUser.cover_photo.includes('7gXvS6v'));
    const coverStyle = hasCover ? `background: url('${profileUser.cover_photo}') center/cover no-repeat;` : `background: linear-gradient(135deg, #0a1f0a 0%, #151515 50%, #051428 100%);`;

    const content = `
    <div class="box" style="margin-bottom: 8px; border: 1px solid #333;">
        <div class="box-title" style="display: flex; justify-content: space-between; align-items: center;">
            <span>📁 ${isOwner ? 'Hồ sơ của tôi' : 'Hồ sơ thành viên'}</span>
            ${isOwner ? `<button type="button" onclick="openSettingsModal()" style="background: #1c1c1c; color: #ffcc00; border: 1px solid #444; padding: 2px 6px; font-size: 10px; cursor: pointer;">⚙️ Cài đặt thông tin</button>` : ''}
        </div>
        
        <div style="position: relative; background: #111; border-bottom: 1px solid #333; text-align: center;">
            <div style="height: 120px; ${coverStyle}"></div>
            
            <div style="position: relative; margin-top: -35px; margin-bottom: 4px; display: inline-block; width: 66px; height: 66px;">
                <img src="${profileUser.avatar && !profileUser.avatar.includes('7gXvS6v') ? profileUser.avatar : 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\'><rect width=\'100\' height=\'100\' fill=\'%231a1a1a\'/><circle cx=\'50\' cy=\'38\' r=\'18\' fill=\'%2300ff00\'/></svg>'}" width="66" height="66" style="${profileUI.avatarStyle} display: block;">
                ${isOwner ? `<button type="button" onclick="openAvatarModal()" style="position: absolute; bottom: -2px; right: -2px; background: #111; color: #00ff00; border: 1px solid #00ff00; border-radius: 50%; width: 22px; height: 22px; font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;">📷</button>` : ''}
            </div>
            
            <div style="font-size: 13px; margin-bottom: 2px;">
                <a href="/profile?user=${profileUser.id}" style="${profileUI.nameStyle}">${profileUser.display_name}</a> 
                <span style="color: #ffcc00; font-size: 11px;">[Lv.${profileUser.level || 1}]</span>
            </div>
            <div style="font-size: 10px; color: #aaa; margin-bottom: 8px;">ID ${profileUser.id} · <span style="color: yellow;">${profileUser.role}</span></div>
        </div>
    </div>
    <div style="text-align: center;"><a href="/">⬅️ Về trang chủ</a></div>
    `;

    return new Response(renderLayout('Trang cá nhân', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
