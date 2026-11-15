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
      // API Đăng ký tài khoản
      if (path === "/api/register" && request.method === "POST") {
        const { username, password } = await request.json();
        if (!username || !password) {
          return new Response(JSON.stringify({ error: "Vui lòng nhập đầy đủ tên tài khoản và mật khẩu!" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        // Kiểm tra xem user đã tồn tại chưa
        const existing = await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
        if (existing) {
          return new Response(JSON.stringify({ error: "Tên tài khoản này đã tồn tại, vui lòng chọn tên khác!" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        // Lưu vào database D1
        await env.DB.prepare("INSERT INTO users (username, password) VALUES (?, ?)").bind(username, password).run();
        return new Response(JSON.stringify({ success: true, message: "Đăng ký thành công!" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // API Đăng nhập tài khoản
      if (path === "/api/login" && request.method === "POST") {
        const { username, password } = await request.json();
        const user = await env.DB.prepare("SELECT * FROM users WHERE username = ? AND password = ?").bind(username, password).first();
        
        if (!user) {
          return new Response(JSON.stringify({ error: "Sai tên tài khoản hoặc mật khẩu!" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        return new Response(JSON.stringify({ success: true, user: { id: user.id, username: user.username } }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // API Lấy danh sách bài viết
      if (path === "/api/posts" && request.method === "GET") {
        const { results } = await env.DB.prepare("SELECT * FROM posts ORDER BY id DESC LIMIT 20").all();
        return new Response(JSON.stringify(results), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // API Đăng bài viết mới
      if (path === "/api/posts" && request.method === "POST") {
        const { username, content } = await request.json();
        if (!content) {
          return new Response(JSON.stringify({ error: "Nội dung bài viết trống" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        await env.DB.prepare("INSERT INTO posts (username, content) VALUES (?, ?)").bind(username || "Thành viên", content).run();
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      return env.ASSETS.fetch(request);
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};
