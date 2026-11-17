export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ==========================================
    // 1. XỬ LÝ CÁC ĐƯỜNG DẪN API (/api/*)
    // ==========================================
    if (url.pathname.startsWith('/api/')) {
      try {
        const path = url.pathname;
        const method = request.method;

                // Xử lý API ĐĂNG NHẬP (Login) - Siêu linh hoạt
        if (path === '/api/login' && method === 'POST') {
          let username = "";
          let password = "";

          try {
            // Thử đọc dưới dạng JSON
            const contentType = request.headers.get("content-type") || "";
            if (contentType.includes("application/json")) {
              const body = await request.json();
              username = body?.username || body?.user || body?.account || body?.u || "";
              password = body?.password || body?.pass || body?.p || "";
            } else {
              // Hoặc đọc dưới dạng Form Data / URL encoded
              const formData = await request.formData();
              username = formData.get("username") || formData.get("user") || formData.get("account") || "";
              password = formData.get("password") || formData.get("pass") || "";
            }
          } catch (e) {
            // Nếu đọc trực tiếp lỗi, thử lấy từ URL searchParams nếu có gửi dạng GET/POST query
            username = url.searchParams.get("username") || url.searchParams.get("user") || "";
            password = url.searchParams.get("password") || url.searchParams.get("pass") || "";
          }

          // Fallback cuối cùng nếu vẫn rỗng: đọc trực tiếp text/json thô
          if (!username || !password) {
            try {
              const text = await request.text();
              const params = new URLSearchParams(text);
              username = username || params.get("username") || params.get("user") || params.get("account") || "";
              password = password || params.get("password") || params.get("pass") || "";
            } catch (err) {}
          }

          // Kiểm tra nếu vẫn chưa có dữ liệu
          if (!username || !password) {
            return new Response(JSON.stringify({ 
              error: "Vui lòng nhập đầy đủ tên tài khoản và mật khẩu!",
              received: { username, password } 
            }), {
              status: 400,
              headers: { "Content-Type": "application/json" }
            });
          }

          // Kiểm tra tài khoản trong cơ sở dữ liệu D1
          const user = await env.DB.prepare(
            "SELECT * FROM users WHERE username = ? AND password = ?"
          ).bind(username, password).first();

          if (!user) {
            return new Response(JSON.stringify({ error: "Tên tài khoản hoặc mật khẩu không đúng!" }), {
              status: 400,
              headers: { "Content-Type": "application/json" }
            });
          }

          return new Response(JSON.stringify({ 
            success: true, 
            message: "Đăng nhập thành công!",
            user: { username: user.username, level: user.level, coins: user.coins } 
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }



        // Xử lý API ĐĂNG KÝ (Register)
        if (path === '/api/register' && method === 'POST') {
          let body;
          try {
            body = await request.json();
          } catch (e) {
            return new Response(JSON.stringify({ error: "Dữ liệu gửi lên không hợp lệ!" }), {
              status: 400,
              headers: { "Content-Type": "application/json" }
            });
          }

          const username = body?.username;
          const password = body?.password;

          if (!username || !password) {
            return new Response(JSON.stringify({ error: "Vui lòng nhập đầy đủ tên tài khoản và mật khẩu!" }), {
              status: 400,
              headers: { "Content-Type": "application/json" }
            });
          }

          // Kiểm tra tồn tại user
          const existing = await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
          if (existing) {
            return new Response(JSON.stringify({ error: "Tài khoản đã tồn tại!" }), {
              status: 400,
              headers: { "Content-Type": "application/json" }
            });
          }

          // Thêm mới vào D1 (mặc định level 1, 100 xu)
          await env.DB.prepare(
            "INSERT INTO users (username, password, level, coins) VALUES (?, ?, 1, 100)"
          ).bind(username, password).run();

          return new Response(JSON.stringify({ success: true, message: "Đăng ký thành công!" }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Nếu gọi sai hoặc không khớp route API nào:
        return new Response(JSON.stringify({ error: "Không tìm thấy API" }), {
          status: 404,
          headers: { "Content-Type": "application/json" }
        });

      } catch (err) {
        return new Response(JSON.stringify({ error: "Lỗi Server: " + err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // ==========================================
    // 2. PHỤC VỤ GIAO DIỆN TĨNH
    // ==========================================
    return env.ASSETS.fetch(request);
  }
};
