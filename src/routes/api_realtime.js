export async function handleRealtimeApi(request, env) {
    const cookie = request.headers.get('Cookie') || '';
    const match = cookie.match(/user_id=(\d+)/);
    if (!match) return new Response(JSON.stringify({ has_new_message: false }), { headers: { 'Content-Type': 'application/json' } });
    
    const userId = match[1];
    const unread = await env.DB.prepare("SELECT COUNT(*) as count FROM messages WHERE receiver_id = ? AND is_read = 0").bind(userId).first();

    return new Response(JSON.stringify({ has_new_message: unread.count > 0 }), {
        headers: { 'Content-Type': 'application/json' }
    });
}
