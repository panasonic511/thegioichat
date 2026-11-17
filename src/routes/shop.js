export async function handleShopRoute(request, env, path, user, renderLayout) {
    if (path === '/shop') {
        const content = `
        <div class="box">
            <div class="box-title">🛒 Cửa hàng Thế Giới Chat</div>
            <div class="box-content">
                <div style="display:flex; gap:10px; margin-bottom:15px;">
                    <div style="background:#1a1a1a; padding:10px; flex:1; text-align:center;"><b>Nạp Xu</b><br>Dùng cho game</div>
                    <div style="background:#1a1a1a; padding:10px; flex:1; text-align:center;"><b>Nạp Vàng</b><br>Vật phẩm đặc biệt</div>
                </div>
                <h3>Vật phẩm trang trí</h3>
                <ul>
                    <li>🖼️ Khung avatar độc quyền (5,000 Xu)</li>
                    <li>🎨 Hiệu ứng tên Gradient (10,000 Xu)</li>
                    <li>⭐ Icon trước nick (3,000 Xu)</li>
                </ul>
            </div>
        </div>`;
        return new Response(renderLayout('Cửa hàng', content, user), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
    }
    return null;
}
