export async function handleGameRoute(request, env, path, user, renderLayout) {
    if (path === '/game') {
        const content = `
        <div class="box">
            <div class="box-title">🎮 Khu Giải Trí & Mini Game</div>
            <div class="box-content" style="text-align:center;">
                <h3>Phòng giải trí trực tuyến Thế Giới Chat</h3>
                <p>Tham gia tài xỉu, đập hũ nhận xu mỗi ngày.</p>
                <a href="#" class="btn">🎲 Chơi Tài Xỉu</a>
            </div>
        </div>`;
        return new Response(renderLayout('Khu giải trí', content, user), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
    }
    return null;
}
