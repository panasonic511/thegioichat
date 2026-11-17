export async function handleLogout(request, env) {
    // Xóa Cookie user_id bằng cách thiết lập Max-Age=0
    return new Response("Đang đăng xuất khỏi hệ thống...", {
        status: 302,
        headers: {
            'Location': '/login',
            'Set-Cookie': 'user_id=; Path=/; Max-Age=0; HttpOnly'
        }
    });
}
