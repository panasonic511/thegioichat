// Kiểm tra tin nhắn và thông báo ngầm mỗi 5 giây
setInterval(async () => {
    try {
        const res = await fetch('/api/realtime-check');
        if (res.ok) {
            const data = await res.json();
            // Cập nhật số liệu hiển thị trên menu nếu có thay đổi mà không cần load lại trang
            if (data.unread_messages > 0) {
                // Cập nhật badge tin nhắn
            }
        }
    } catch (e) {}
}, 5000);
