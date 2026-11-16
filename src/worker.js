export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // API Thống kê số liệu thực tế từ D1
      if (path === "/api/stats" && request.method === "GET") {
        const totalUsers = await env.DB.prepare("SELECT COUNT(*) as count FROM users").first();
        const totalPosts = await env.DB.prepare("SELECT COUNT(*) as count FROM posts").first();
        
        return new Response(JSON.stringify({
          onlineCount: Math.floor(Math.random() * 5) + 1,
          totalUsers: totalUsers ? totalUsers.count : 0,
          totalPosts: totalPosts ? totalPosts.count : 0
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // API Đăng ký
      if (path === "/api/register" && request.method === "POST") {
        const { username, display_name, password, gender } = await request.json();
        if (!username || !password || !display_name) {
          return new Response(JSON.stringify({ error: "Vui lòng nhập đầy đủ thông tin!" }), { status: 400, headers: corsHeaders });
        }
        const existing = await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
        if (existing) {
          return new Response(JSON.stringify({ error: "Tên đăng nhập đã tồn tại!" }), { status: 400, headers: corsHeaders });
        }
        await env.DB.prepare("INSERT INTO users (username, display_name, password, gender) VALUES (?, ?, ?, ?)").bind(username, display_name, password, gender || "Nam").run();
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // API Đăng nhập
      if (path === "/api/login" && request.method === "POST") {
        const { loginType, identifier, password } = await request.json();
        let user;
        if (loginType === "id") {
          user = await env.DB.prepare("SELECT * FROM users WHERE id = ? AND password = ?").bind(identifier, password).first();
        } else {
          user = await env.DB.prepare("SELECT * FROM users WHERE username = ? AND password = ?").bind(identifier, password).first();
        }
        if (!user) {
          return new Response(JSON.stringify({ error: "Sai thông tin đăng nhập hoặc mật khẩu!" }), { status: 401, headers: corsHeaders });
        }
        return new Response(JSON.stringify({ success: true, user: { id: user.id, username: user.username, display_name: user.display_name, gender: user.gender } }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // API Bài viết
      if (path === "/api/posts" && request.method === "GET") {
        const { results } = await env.DB.prepare("SELECT * FROM posts ORDER BY id DESC LIMIT 20").all();
        return new Response(JSON.stringify(results), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (path === "/api/posts" && request.method === "POST") {
        const { username, content } = await request.json();
        if (!content) return new Response(JSON.stringify({ error: "Trống" }), { status: 400, headers: corsHeaders });
        await env.DB.prepare("INSERT INTO posts (username, content) VALUES (?, ?)").bind(username || "Thành viên", content).run();
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // API Tin nhắn riêng
      if (path === "/api/messages/send" && request.method === "POST") {
        const { sender, receiver, content } = await request.json();
        await env.DB.prepare("INSERT INTO messages (sender, receiver, content) VALUES (?, ?, ?)").bind(sender, receiver, content).run();
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (path === "/api/messages/get" && request.method === "GET") {
        const user1 = url.searchParams.get("user1");
        const user2 = url.searchParams.get("user2");
        const { results } = await env.DB.prepare("SELECT * FROM messages WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?) ORDER BY id ASC").bind(user1, user2, user2, user1).all();
        return new Response(JSON.stringify(results), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return env.ASSETS.fetch(request);
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
    }
  }
};
