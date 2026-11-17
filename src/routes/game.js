export async function handleGame(request, env, user, renderLayout) {
    const content = `
    <div class="box">
        <div class="box-title">🎮 Khu Giải Trí & Mini Game</div>
        <div class="box-content" style="text-align: center; padding: 25px 10px;">
            <h3>🎉 Chào mừng đến với Phòng Giải Trí</h3>
            <p style="font-size: 13px; color: #ccc; margin-bottom: 20px;">
                Thử vận may với các trò chơi trúng thưởng, đập hũ, tài xỉu và giao lưu cùng bạn bè trực tuyến!
            </p>
            <div style="display: flex; justify-content: center; gap: 10px; flex-wrap: wrap;">
                <a href="#" class="btn" style="background: #0055ff;">🎲 Chơi Tài Xỉu</a>
                <a href="#" class="btn" style="background: #aa0000;">🎯 Vòng Quay May Mắn</a>
                <a href="#" class="btn" style="background: #00aa00;">💰 Đập Hũ Xu</a>
            </div>
        </div>
    </div>
    <div style="text-align: center;"><a href="/">⬅️ Về trang chủ</a></div>
    `;

    return new Response(renderLayout('Khu giải trí', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
