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

        // Ví dụ: API kiểm tra kết nối Database hoặc trạng thái hệ thống
        if (path === '/api/status' && method === 'GET') {
          // Thử truy vấn nhanh vào D1 để kiểm tra kết nối
          const dbCheck = await env.DB.prepare("SELECT 1").first();
          return new Response(JSON.stringify({ 
            success: true, 
            message: "API Thế Giới Chat đang hoạt động!",
            dbConnected: !!dbCheck 
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }

        // --- BẠN CÓ THỂ BỔ SUNG CÁC ROUTE API KHÁC Ở ĐÂY ---
        // Ví dụ: Đăng ký, Đăng nhập, Đăng bài, Chat...
        
        // Nếu gọi sai hoặc không khớp route API nào:
        return new Response(JSON.stringify({ error: "Không tìm thấy API" }), {
          status: 404,
          headers: { "Content-Type": "application/json" }
        });

      } catch (err) {
        // Bắt lỗi hệ thống hoặc lỗi cơ sở dữ liệu D1
        return new Response(JSON.stringify({ error: "Lỗi Server: " + err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // ==========================================
    // 2. PHỤC VỤ GIAO DIỆN TĨNH (HTML, CSS, JS, Ảnh)
    // ==========================================
    // Mọi truy cập thông thường hoặc khi F5 tải lại trang sẽ đi qua đây 
    // và trả về file index.html từ thư mục public một cách mượt mà.
    return env.ASSETS.fetch(request);
  }
};
