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
      // API ĐĂNG KÝ
      if (path === "/api/register" && request.method === "POST") {
        const { username, display_name, password, gender } = await request.json();
        
        if (!username || !password || !display_name) {
          return new Response(JSON.stringify({ error: "Vui lòng nhập đầy đủ các thông tin bắt buộc!" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        // Kiểm tra tài khoản đã tồn tại chưa
        const existing = await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
        if (existing) {
          return new Response(JSON.stringify({ error: "Tên đăng nhập này đã có người sử dụng!" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        // Lưu vào database
        await env.DB.prepare(
          "INSERT INTO users (username, display_name, password, gender) VALUES (?, ?, ?, ?)"
        ).bind(username, display_name, password, gender || "Nam").run();

        return new Response(JSON.stringify({ success: true, message: "Đăng ký thành công!" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // API ĐĂNG NHẬP (Hỗ trợ cả Đăng nhập bằng tài khoản hoặc bằng ID)
      if (path === "/api/login" && request.method === "POST") {
        const { loginType, identifier, password } = await request.json();
        let user;

        if (loginType === "id") {
          user = await env.DB.prepare("SELECT * FROM users WHERE id = ? AND password = ?").bind(identifier, password).first();
        } else {
          user = await env.DB.prepare("SELECT * FROM users WHERE username = ? AND password = ?").bind(identifier, password).first();
        }

        if (!user) {
          return new Response(JSON.stringify({ error: "Sai thông tin tài khoản, ID hoặc mật khẩu!" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        return new Response(JSON.stringify({ 
          success: true, 
          user: { 
            id: user.id, 
            username: user.username, 
            display_name: user.display_name,
            gender: user.gender 
          } 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // API BẢNG TIN
      if (path === "/api/posts" && request.method === "GET") {
        const { results } = await env.DB.prepare("SELECT * FROM posts ORDER BY id DESC LIMIT 20").all();
        return new Response(JSON.stringify(results), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (path === "/api/posts" && request.method === "POST") {
        const { username, content } = await request.json();
        if (!content) {
          return new Response(JSON.stringify({ error: "Nội dung trống" }), { status: 400, headers: corsHeaders });
        }
        await env.DB.prepare("INSERT INTO posts (username, content) VALUES (?, ?)").bind(username || "Thành viên", content).run();
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
