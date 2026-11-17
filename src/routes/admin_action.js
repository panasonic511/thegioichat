export async function handleAdminAction(request, env, user) {
    // Kiểm tra quyền hạn tối thiểu (Chỉ Chủ Wap và Admin mới được thay đổi chức vụ người khác)
    if (!user || (user.role !== 'Chủ Wap' && user.role !== 'Admin')) {
        return new Response("Bạn không có quyền thực hiện hành động này!", { status: 403 });
    }

    const formData = await request.formData();
    const targetUserId = formData.get('user_id');
    const newRole = formData.get('new_role');

    if (!targetUserId || !newRole) {
        return new Response("Dữ liệu không hợp lệ! <a href='/admin'>Quay lại</a>", { status: 400 });
    }

    // Tự động gán Level chuẩn theo phân cấp yêu cầu của bạn
    let newLevel = 1;
    if (newRole === 'Chủ Wap') {
        newLevel = 130;
    } else if (newRole === 'Admin') {
        newLevel = 125;
    } else if (newRole === 'Mod') {
        newLevel = 120;
    } else {
        newLevel = 1; // Thành viên thông thường
    }

    // Thực thi câu lệnh SQL cập nhật trong cơ sở dữ liệu D1
    await env.DB.prepare("UPDATE users SET role = ?, level = ? WHERE id = ?")
        .bind(newRole, newLevel, targetUserId)
        .run();

    // Chuyển hướng trở lại trang quản lý
    return new Response("Cập nhật phân quyền thành công!", {
        status: 302,
        headers: {
            'Location': '/admin'
        }
    });
}
