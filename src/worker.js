export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Phục vụ file tĩnh nếu không phải API
    if (!path.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    const corsHeaders = {
      'Content-Type': 'application/json;charset=UTF-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: corsHeaders });

    // Hàm băm mật khẩu SHA-256
    async function hashPassword(pw) {
      const msgBuffer = new TextEncoder().encode(pw);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }

    // Lấy thông tin người dùng hiện tại qua Header Authorization (ID:TokenHash)
    async function getCurrentUser() {
      const auth = request.headers.get('Authorization');
      if (!auth) return null;
      const [userId, passHash] = auth.split(':');
      if (!userId || !passHash) return null;

      const user = await env.DB.prepare(
        'SELECT * FROM users WHERE id = ? AND password_hash = ?'
      ).bind(userId, passHash).first();

      if (user && !user.is_banned) {
        // Cập nhật trạng thái đang trực tuyến
        const now = Math.floor(Date.now() / 1000);
        await env.DB.prepare('UPDATE users SET last_active = ? WHERE id = ?')
          .bind(now, user.id)
          .run();
      }
      return user;
    }

    try {
      // ================= 1. XÁC THỰC (ĐĂNG KÝ / ĐĂNG NHẬP) =================
      if (path === '/api/register' && request.method === 'POST') {
        const { username, display_name, password } = await request.json();
        if (!username || !display_name || !password) {
          return json({ error: 'Vui lòng nhập đầy đủ thông tin!' }, 400);
        }
        const cleanUser = username.trim().toLowerCase();
        if (!/^[a-z0-9_]{3,20}$/.test(cleanUser)) {
          return json({ error: 'Tên tài khoản chỉ gồm chữ thường, số (3-20 ký tự)!' }, 400);
        }
        const exists = await env.DB.prepare('SELECT id FROM users WHERE username = ?')
          .bind(cleanUser).first();
        if (exists) return json({ error: 'Tên tài khoản này đã có người sử dụng!' }, 400);

        const hash = await hashPassword(password);
        const now = Math.floor(Date.now() / 1000);
        const res = await env.DB.prepare(
          `INSERT INTO users (username, display_name, password_hash, role, level, coins, last_active)
           VALUES (?, ?, ?, 'Thành Viên', 1, 1000, ?)`
        ).bind(cleanUser, display_name.trim(), hash, now).run();

        const newId = res.meta.last_row_id;
        // Tạo thông báo chào mừng
        await env.DB.prepare('INSERT INTO notifications (user_id, content) VALUES (?, ?)')
          .bind(newId, `Chào mừng ${display_name}! ID tài khoản của bạn là #${newId}. Bạn được tặng 1,000 Xu.`)
          .run();

        return json({
          success: true,
          message: `Đăng ký thành công! ID đăng nhập của bạn là: ${newId}`,
          id: newId
        });
      }

      if (path === '/api/login' && request.method === 'POST') {
        const { account, password, loginType } = await request.json();
        if (!account || !password) {
          return json({ error: 'Vui lòng nhập tài khoản và mật khẩu!' }, 400);
        }
        const hash = await hashPassword(password);
        let user;

        if (loginType === 'id') {
          user = await env.DB.prepare(
            'SELECT * FROM users WHERE id = ? AND password_hash = ?'
          ).bind(parseInt(account, 10) || 0, hash).first();
        } else {
          user = await env.DB.prepare(
            'SELECT * FROM users WHERE username = ? AND password_hash = ?'
          ).bind(account.trim().toLowerCase(), hash).first();
        }

        if (!user) return json({ error: 'Sai thông tin đăng nhập hoặc mật khẩu!' }, 401);
        if (user.is_banned) return json({ error: 'Tài khoản của bạn đã bị khóa bởi BQT!' }, 403);

        return json({
          success: true,
          token: `${user.id}:${user.password_hash}`,
          user: {
            id: user.id,
            username: user.username,
            display_name: user.display_name,
            role: user.role,
            level: user.level,
            coins: user.coins,
            avatar: user.avatar
          }
        });
      }

      // ================= 2. DỮ LIỆU TRANG CHỦ & THÔNG BÁO BQT =================
      if (path === '/api/home' && request.method === 'GET') {
        const currentUser = await getCurrentUser();
        const now = Math.floor(Date.now() / 1000);

        const announcements = await env.DB.prepare(`
          SELECT a.*, u.display_name, u.role, u.level 
          FROM announcements a JOIN users u ON a.author_id = u.id 
          ORDER BY a.is_pinned DESC, a.id DESC LIMIT 10
        `).all();

        const posts = await env.DB.prepare(`
          SELECT p.*, u.display_name, u.role, u.level, u.avatar 
          FROM posts p JOIN users u ON p.user_id = u.id 
          WHERE p.category = 'bangtin'
          ORDER BY p.id DESC LIMIT 20
        `).all();

        const onlineCount = await env.DB.prepare(
          'SELECT COUNT(*) as total FROM users WHERE last_active > ?'
        ).bind(now - 300).first();

        const totalUsers = await env.DB.prepare('SELECT COUNT(*) as total FROM users').first();
        const totalPosts = await env.DB.prepare('SELECT COUNT(*) as total FROM posts').first();

        return json({
          user: currentUser ? {
            id: currentUser.id,
            username: currentUser.username,
            display_name: currentUser.display_name,
            role: currentUser.role,
            level: currentUser.level,
            coins: currentUser.coins,
            avatar: currentUser.avatar
          } : null,
          announcements: announcements.results,
          posts: posts.results,
          stats: {
            online: onlineCount.total,
            users: totalUsers.total,
            posts: totalPosts.total
          }
        });
      }

      // Đăng / Sửa Thông báo BQT (Yêu cầu Level >= 50)
      if (path === '/api/announcements' && request.method === 'POST') {
        const user = await getCurrentUser();
        if (!user || user.level < 50) {
          return json({ error: 'Bạn cần đạt Cấp độ 50 trở lên mới có quyền đăng thông báo!' }, 403);
        }
        const { id, title, content, is_pinned } = await request.json();
        if (!title || !content) return json({ error: 'Thiếu tiêu đề hoặc nội dung!' }, 400);

        if (id) {
          // Chỉnh sửa thông báo đã có
          await env.DB.prepare(
            'UPDATE announcements SET title = ?, content = ?, is_pinned = ? WHERE id = ?'
          ).bind(title, content, is_pinned ? 1 : 0, id).run();
          return json({ success: true, message: 'Đã cập nhật thông báo!' });
        } else {
          // Đăng thông báo mới
          await env.DB.prepare(
            'INSERT INTO announcements (author_id, title, content, is_pinned) VALUES (?, ?, ?, ?)'
          ).bind(user.id, title, content, is_pinned ? 1 : 0).run();
          return json({ success: true, message: 'Đã đăng thông báo lên trang chủ!' });
        }
      }

      if (path.startsWith('/api/announcements/') && request.method === 'DELETE') {
        const user = await getCurrentUser();
        if (!user || user.level < 50) return json({ error: 'Không đủ cấp độ (Cần Level 50+)!' }, 403);
        const id = path.split('/').pop();
        await env.DB.prepare('DELETE FROM announcements WHERE id = ?').bind(id).run();
        return json({ success: true });
      }

      // ================= 3. BẢNG TIN & DIỄN ĐÀN =================
      if (path === '/api/posts' && request.method === 'GET') {
        const category = url.searchParams.get('category') || 'bangtin';
        const res = await env.DB.prepare(`
          SELECT p.*, u.display_name, u.role, u.level, u.avatar 
          FROM posts p JOIN users u ON p.user_id = u.id 
          WHERE p.category = ? ORDER BY p.id DESC LIMIT 30
        `).bind(category).all();
        return json({ posts: res.results });
      }

      if (path === '/api/posts' && request.method === 'POST') {
        const user = await getCurrentUser();
        if (!user) return json({ error: 'Vui lòng đăng nhập để đăng bài!' }, 401);
        const { category, title, content } = await request.json();
        if (!content || !content.trim()) return json({ error: 'Nội dung không được để trống!' }, 400);

        await env.DB.prepare(
          'INSERT INTO posts (user_id, category, title, content) VALUES (?, ?, ?, ?)'
        ).bind(user.id, category || 'bangtin', title || '', content.trim()).run();

        // Thưởng +10 Xu mỗi lần đăng bài
        await env.DB.prepare('UPDATE users SET coins = coins + 10 WHERE id = ?').bind(user.id).run();
        return json({ success: true, message: 'Đăng bài thành công (+10 Xu)!' });
      }

      // ================= 4. REAL-TIME POLLING (TIN NHẮN + THÔNG BÁO) =================
      if (path === '/api/realtime' && request.method === 'GET') {
        const user = await getCurrentUser();
        if (!user) return json({ unread_msg: 0, unread_notif: 0 });

        const chatWith = parseInt(url.searchParams.get('chat_with') || '0', 10);
        const lastMsgId = parseInt(url.searchParams.get('last_msg_id') || '0', 10);

        // Đếm tin nhắn chưa đọc
        const unreadMsg = await env.DB.prepare(
          'SELECT COUNT(*) as c FROM messages WHERE receiver_id = ? AND is_read = 0'
        ).bind(user.id).first();

        // Đếm thông báo chưa đọc
        const unreadNotif = await env.DB.prepare(
          'SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0'
        ).bind(user.id).first();

        let newMessages = [];
        if (chatWith > 0) {
          // Đánh dấu đã đọc khi đang mở khung chat với người này
          await env.DB.prepare(
            'UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0'
          ).bind(chatWith, user.id).run();

          const msgs = await env.DB.prepare(`
            SELECT m.*, u.display_name, u.role, u.level 
            FROM messages m JOIN users u ON m.sender_id = u.id
            WHERE ((m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?))
              AND m.id > ?
            ORDER BY m.id ASC LIMIT 50
          `).bind(user.id, chatWith, chatWith, user.id, lastMsgId).all();
          newMessages = msgs.results;
        }

        return json({
          unread_msg: unreadMsg.c,
          unread_notif: unreadNotif.c,
          new_messages: newMessages,
          coins: user.coins,
          level: user.level,
          role: user.role
        });
      }

      // Gửi tin nhắn riêng tư
      if (path === '/api/messages' && request.method === 'POST') {
        const user = await getCurrentUser();
        if (!user) return json({ error: 'Chưa đăng nhập!' }, 401);
        const { receiver_id, content } = await request.json();
        if (!receiver_id || !content || !content.trim()) {
          return json({ error: 'Thiếu người nhận hoặc nội dung!' }, 400);
        }
        const target = await env.DB.prepare('SELECT id, display_name FROM users WHERE id = ?')
          .bind(receiver_id).first();
        if (!target) return json({ error: 'Không tìm thấy ID người nhận!' }, 404);

        const res = await env.DB.prepare(
          'INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)'
        ).bind(user.id, target.id, content.trim()).run();

        return json({ success: true, id: res.meta.last_row_id });
      }

      // Lấy danh sách hộp thư đến
      if (path === '/api/conversations' && request.method === 'GET') {
        const user = await getCurrentUser();
        if (!user) return json({ error: 'Chưa đăng nhập!' }, 401);

        const convs = await env.DB.prepare(`
          SELECT u.id, u.display_name, u.role, u.level, u.avatar,
                 (SELECT content FROM messages m2 
                  WHERE (m2.sender_id = u.id AND m2.receiver_id = ?) OR (m2.sender_id = ? AND m2.receiver_id = u.id)
                  ORDER BY m2.id DESC LIMIT 1) as last_msg,
                 (SELECT COUNT(*) FROM messages m3 
                  WHERE m3.sender_id = u.id AND m3.receiver_id = ? AND m3.is_read = 0) as unread
          FROM users u
          WHERE u.id != ? AND u.id IN (
            SELECT sender_id FROM messages WHERE receiver_id = ?
            UNION
            SELECT receiver_id FROM messages WHERE sender_id = ?
          )
        `).bind(user.id, user.id, user.id, user.id, user.id, user.id).all();

        return json({ conversations: convs.results });
      }

      // Lấy danh sách thông báo cá nhân & đánh dấu đã đọc
      if (path === '/api/notifications' && request.method === 'GET') {
        const user = await getCurrentUser();
        if (!user) return json({ error: 'Chưa đăng nhập!' }, 401);
        const notifs = await env.DB.prepare(
          'SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 30'
        ).bind(user.id).all();
        await env.DB.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?')
          .bind(user.id).run();
        return json({ notifications: notifs.results });
      }

      // ================= 5. NGƯỜI TRỰC TUYẾN, TÌM KIẾM, BXH, BẠN BÈ =================
      if (path === '/api/users' && request.method === 'GET') {
        const mode = url.searchParams.get('mode') || 'online';
        const q = (url.searchParams.get('q') || '').trim();
        const now = Math.floor(Date.now() / 1000);

        if (mode === 'online') {
          const res = await env.DB.prepare(
            'SELECT id, username, display_name, role, level, coins, avatar FROM users WHERE last_active > ? ORDER BY level DESC'
          ).bind(now - 300).all();
          return json({ users: res.results });
        }
        if (mode === 'ranking') {
          const res = await env.DB.prepare(
            'SELECT id, username, display_name, role, level, coins, avatar FROM users ORDER BY level DESC, coins DESC LIMIT 20'
          ).all();
          return json({ users: res.results });
        }
        if (mode === 'search') {
          const idSearch = parseInt(q, 10) || -1;
          const res = await env.DB.prepare(
            'SELECT id, username, display_name, role, level, coins, avatar FROM users WHERE id = ? OR username LIKE ? OR display_name LIKE ? LIMIT 20'
          ).bind(idSearch, `%${q}%`, `%${q}%`).all();
          return json({ users: res.results });
        }
      }

      // ================= 6. KHU VỰC QUẢN LÝ ADMIN / MOD / CHỦ WAP =================
      if (path === '/api/admin/users' && request.method === 'GET') {
        const user = await getCurrentUser();
        if (!user || user.role === 'Thành Viên') {
          return json({ error: 'Khu vực cấm! Chỉ Mod, Admin và Chủ Wap mới được truy cập.' }, 403);
        }
        const res = await env.DB.prepare(
          'SELECT id, username, display_name, role, level, coins, is_banned FROM users ORDER BY id ASC LIMIT 100'
        ).all();
        return json({ users: res.results, currentRole: user.role });
      }

      if (path === '/api/admin/update-user' && request.method === 'POST') {
        const actor = await getCurrentUser();
        if (!actor || actor.role === 'Thành Viên') {
          return json({ error: 'Bạn không có quyền thực hiện thao tác này!' }, 403);
        }

        const { target_id, new_role, new_level, coins_delta, is_banned } = await request.json();
        const target = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(target_id).first();
        if (!target) return json({ error: 'Không tìm thấy thành viên!' }, 404);

        // Không ai được chỉnh sửa Chủ Wap (trừ chính Chủ Wap)
        if (target.role === 'Chủ Wap' && actor.role !== 'Chủ Wap') {
          return json({ error: 'Bạn không thể tác động lên tài khoản Chủ Wap!' }, 403);
        }
        // Mod không được chỉnh sửa Admin hoặc Mod khác
        if (actor.role === 'Mod' && (target.role === 'Admin' || target.role === 'Mod')) {
          return json({ error: 'Mod chỉ có thể quản lý Thành Viên!' }, 403);
        }

        let finalRole = target.role;
        let finalLevel = target.level;

        // Phân quyền set chức vụ & Level chuẩn xác
        if (new_role) {
          if (new_role === 'Chủ Wap' && actor.role !== 'Chủ Wap') {
            return json({ error: 'Chỉ Chủ Wap mới có thể bổ nhiệm Chủ Wap!' }, 403);
          }
          if (new_role === 'Admin' && actor.role !== 'Chủ Wap') {
            return json({ error: 'Chỉ Chủ Wap mới có thể bổ nhiệm Admin!' }, 403);
          }
          if (new_role === 'Mod' && actor.role === 'Mod') {
            return json({ error: 'Mod không thể bổ nhiệm Mod!' }, 403);
          }

          finalRole = new_role;
          if (new_role === 'Chủ Wap') finalLevel = 130;
          else if (new_role === 'Admin') finalLevel = 125;
          else if (new_role === 'Mod') finalLevel = 120;
          else if (new_role === 'Thành Viên' && finalLevel >= 120) finalLevel = 10;
        }

        // Cho phép Admin/Chủ Wap chỉnh sửa trực tiếp Level thành viên (tối đa 119 cho Thành Viên)
        if (new_level !== undefined && new_level !== null && new_level !== '') {
          let parsedLv = parseInt(new_level, 10);
          if (finalRole === 'Thành Viên' && parsedLv > 119) parsedLv = 119;
          if (parsedLv < 1) parsedLv = 1;
          finalLevel = parsedLv;
        }

        const addCoins = parseInt(coins_delta || '0', 10);
        const banStatus = is_banned !== undefined ? (is_banned ? 1 : 0) : target.is_banned;

        await env.DB.prepare(
          'UPDATE users SET role = ?, level = ?, coins = coins + ?, is_banned = ? WHERE id = ?'
        ).bind(finalRole, finalLevel, addCoins, banStatus, target.id).run();

        // Gửi thông báo tự động cho người bị/được cập nhật
        await env.DB.prepare('INSERT INTO notifications (user_id, content) VALUES (?, ?)')
          .bind(
            target.id,
            `BQT (${actor.display_name}) đã cập nhật tài khoản của bạn: Chức vụ [${finalRole}], Level ${finalLevel}, Xu ${addCoins >= 0 ? '+' + addCoins : addCoins}.`
          ).run();

        return json({ success: true, message: `Đã cập nhật thành công cho ${target.display_name}!` });
      }

      // ================= 7. CỬA HÀNG & KHU GIẢI TRÍ (TÀI XỈU / QUAY XU) =================
      if (path === '/api/shop/buy' && request.method === 'POST') {
        const user = await getCurrentUser();
        if (!user) return json({ error: 'Vui lòng đăng nhập!' }, 401);
        const { item, price } = await request.json();
        if (user.coins < price) return json({ error: 'Bạn không đủ Xu để mua vật phẩm này!' }, 400);

        await env.DB.prepare('UPDATE users SET coins = coins - ?, avatar = ? WHERE id = ?')
          .bind(price, item, user.id).run();
        return json({ success: true, message: `Đã trang bị biểu tượng ${item} (-${price} Xu)!` });
      }

      if (path === '/api/game/dice' && request.method === 'POST') {
        const user = await getCurrentUser();
        if (!user) return json({ error: 'Vui lòng đăng nhập!' }, 401);
        const { choice, bet } = await request.json();
        const betAmount = parseInt(bet, 10);
        if (betAmount < 10 || user.coins < betAmount) {
          return json({ error: 'Số Xu cược không hợp lệ hoặc không đủ Xu!' }, 400);
        }

        const d1 = Math.floor(Math.random() * 6) + 1;
        const d2 = Math.floor(Math.random() * 6) + 1;
        const d3 = Math.floor(Math.random() * 6) + 1;
        const sum = d1 + d2 + d3;
        const result = sum >= 11 ? 'tai' : 'xiu';
        const win = choice === result;
        const delta = win ? betAmount : -betAmount;

        await env.DB.prepare('UPDATE users SET coins = coins + ? WHERE id = ?')
          .bind(delta, user.id).run();

        return json({
          success: true,
          dice: [d1, d2, d3],
          sum,
          win,
          message: win
            ? `🎉 Kết quả ${sum} nút (${result.toUpperCase()})! Bạn thắng +${betAmount} Xu!`
            : `💸 Kết quả ${sum} nút (${result.toUpperCase()})! Bạn thua -${betAmount} Xu!`
        });
      }

      return json({ error: 'API không tồn tại' }, 404);
    } catch (err) {
      return json({ error: 'Lỗi hệ thống: ' + err.message }, 500);
    }
  }
};