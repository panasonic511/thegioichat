export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      return Response.json({ ok: true, app: "The Gioi Chat", message: "API đang hoạt động" });
    }
    if (url.pathname === "/api/posts" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT id, nickname, body, created_at FROM posts ORDER BY id DESC LIMIT 50"
      ).all();
      return Response.json(results);
    }
    if (url.pathname === "/api/posts" && request.method === "POST") {
      let data;
      try { data = await request.json(); } catch { return Response.json({ error: "JSON không hợp lệ" }, { status: 400 }); }
      const nickname = String(data.nickname || "Thành viên").trim().slice(0, 30);
      const body = String(data.body || "").trim().slice(0, 1000);
      if (!body) return Response.json({ error: "Nội dung không được để trống" }, { status: 400 });
      await env.DB.prepare("INSERT INTO posts (nickname, body) VALUES (?, ?)").bind(nickname, body).run();
      return Response.json({ ok: true }, { status: 201 });
    }
    return new Response("Thế Giới Chat API. Mở /api/health để kiểm tra.", {
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  }
};