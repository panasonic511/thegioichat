export async function apiSendNotification(request, env) {
  try {
    const { content, user_id } = await request.json();
    
    // Kiểm tra phân cấp độ: Yêu cầu cấp độ >= 50 mới được đăng thông báo
    const user = await env.DB.prepare("SELECT level FROM users WHERE id = ?").bind(user_id).first();
    
    if (!user || user.level < 50) {
      return new Response(JSON.stringify({ success: false, error: 'Chỉ thành viên từ cấp độ 50 trở lên mới được đăng thông báo!' }), { 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    await env.DB.prepare("INSERT INTO notifications (user_id, content) VALUES (?, ?)").bind(user_id, content).run();
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { headers: { 'Content-Type': 'application/json' } });
  }
}

export async function apiSendMessage(request, env) {
  // Logic gửi tin nhắn realtime
  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
}

export async function handleMailBox(request, env) {
  return new Response("<h2>Hộp thư tin nhắn</h2><a href='/'>[Trang chủ]</a>", { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

export async function handleNotifications(request, env) {
  return new Response("<h2>Trang thông báo chi tiết</h2><a href='/'>[Trang chủ]</a>", { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

export async function handleFeed(request, env) {
  return new Response("<h2>Bảng tin mạng xã hội</h2><a href='/'>[Trang chủ]</a>", { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}
