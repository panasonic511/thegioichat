import { renderUser } from '../worker.js';



function escapeHtml(str) {

return String(str ?? '')

.replace(/&/g, '&amp;')

.replace(/</g, '&lt;')

.replace(/>/g, '&gt;')

.replace(/"/g, '&quot;');

}



function formatTimeAgo(val) {

if (!val) return 'Vừa xong';

const num = Number(val);

let ts = 0;

if (!Number.isNaN(num) && num > 0) {

ts = num > 1e12 ? num : num * 1000;

} else {

const parsed = Date.parse(val);

if (!Number.isNaN(parsed)) ts = parsed;

}

if (!ts) return String(val);



const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));

if (diffSec < 60) return 'Vừa xong';

const mins = Math.floor(diffSec / 60);

if (mins < 60) return `${mins} phút trước`;

const hours = Math.floor(mins / 60);

if (hours < 24) return `${hours} giờ trước`;

const days = Math.floor(hours / 24);

if (days < 30) return `${days} ngày trước`;

const months = Math.floor(days / 30);

if (months < 12) return `${months} tháng trước`;

return `${Math.floor(months / 12)} năm trước`;

}



function isStaffOrAdmin(u) {

if (!u) return false;

if (Number(u.is_admin) === 1 || Number(u.id) === 1) return true;

const roleStr = String(u.role || '').trim().toLowerCase();

return ['admin', 'chủ wap', 'chu wap', 'quản trị', 'quan tri', 'quản lý', 'quan ly', 'smod', 'mod'].some(

(r) => roleStr === r || roleStr.includes(r)

);

}



function isSafeColor(val) {

return /^#[0-9a-fA-F]{3,8}$/.test(String(val || '').trim());

}



function formatCommentUserStyle(row) {

const uObj = {

id: row.user_id,

username: row.username,

display_name: row.display_name,

role: row.role,

is_admin: row.is_admin,

active_icon: row.active_icon,

name_color: row.name_color,

name_glow: row.name_glow,

name_border: row.name_border,

name_border_glow: row.name_border_glow,

border_color: row.border_color,

avatar_glow: row.avatar_glow,

avatar: row.avatar

};

const rendered = renderUser(uObj);

const av = (row.avatar && !String(row.avatar).includes('7gXvS6v'))

? row.avatar

: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100' height='100' fill='%231a1a1a'/><circle cx='50' cy='38' r='18' fill='%2300ff00'/></svg>";

return {

nameHtml: rendered.nameHtml,

avatarSrc: av,

avatarStyle: rendered.avatarStyle || 'border-radius: 50%; object-fit: cover;'

};

}



export async function handleProfile(request, env, user, renderLayout, url) {

let message = "";

const targetId = parseInt(url.searchParams.get('user') || user.id);



const cols = ['name_color', 'name_glow', 'name_border', 'name_border_glow', 'border_color', 'avatar_glow', 'active_icon', 'role', 'is_admin', 'cover_photo', 'gender', 'relationship', 'province', 'birthday', 'online_minutes', 'created_at'];

for (const col of cols) {

try { await env.DB.prepare(`ALTER TABLE users ADD COLUMN ${col} TEXT;`).run(); } catch(e) {}

}



try {

await env.DB.prepare(`

CREATE TABLE IF NOT EXISTS follows (

id INTEGER PRIMARY KEY AUTOINCREMENT,

follower_id INTEGER NOT NULL,

following_id INTEGER NOT NULL,

UNIQUE(follower_id, following_id)

);

`).run();

await env.DB.prepare(`

CREATE TABLE IF NOT EXISTS friends (

id INTEGER PRIMARY KEY AUTOINCREMENT,

user_id INTEGER NOT NULL,

friend_id INTEGER NOT NULL,

status TEXT DEFAULT 'accepted',

UNIQUE(user_id, friend_id)

);

`).run();

await env.DB.prepare(`

CREATE TABLE IF NOT EXISTS user_gifts (

id INTEGER PRIMARY KEY AUTOINCREMENT,

sender_id INTEGER NOT NULL,

receiver_id INTEGER NOT NULL,

gift_type TEXT NOT NULL,

created_at TEXT DEFAULT CURRENT_TIMESTAMP

);

`).run();

await env.DB.prepare(`

CREATE TABLE IF NOT EXISTS wall_post_comments (

id INTEGER PRIMARY KEY AUTOINCREMENT,

post_id INTEGER NOT NULL,

user_id INTEGER NOT NULL,

content TEXT NOT NULL,

created_at INTEGER DEFAULT 0

);

`).run();

await env.DB.prepare(`

CREATE TABLE IF NOT EXISTS wall_post_likes (

id INTEGER PRIMARY KEY AUTOINCREMENT,

post_id INTEGER NOT NULL,

user_id INTEGER NOT NULL,

created_at INTEGER DEFAULT 0,

UNIQUE(post_id, user_id)

);

`).run();

} catch(e) {}



let profileUser = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(targetId).first();

if (!profileUser) {

return new Response("Không tìm thấy thành viên!", { status: 404 });

}



const isOwner = (targetId === user.id);

const canModerate = isStaffOrAdmin(user);



// Xác định bảng bài viết đang dùng (ưu tiên `feeds`, fallback `posts`)

let feedTable = 'feeds';

try {

await env.DB.prepare("SELECT 1 FROM feeds LIMIT 1").first();

} catch (e) {

try {

await env.DB.prepare("SELECT 1 FROM posts LIMIT 1").first();

feedTable = 'posts';

} catch (e2) {}

}



if (request.method === 'POST') {

const formData = await request.formData();

const action = formData.get('action');

const isAjax = request.headers.get('X-Requested-With') === 'XMLHttpRequest' || formData.get('ajax') === '1';



try {

if (action === 'wall_post') {

const rawText = (formData.get('content') || '').trim();

const textColor = isSafeColor(formData.get('text_color')) ? String(formData.get('text_color')).trim() : '';

const bgColor = isSafeColor(formData.get('bg_color')) ? String(formData.get('bg_color')).trim() : '';

const textGlow = isSafeColor(formData.get('text_glow')) ? String(formData.get('text_glow')).trim() : '';

if (!rawText) throw new Error("Vui lòng nhập nội dung trước khi đăng bài!");



const styleMeta = (textColor || bgColor || textGlow)

? `[style=${encodeURIComponent(JSON.stringify({ c: textColor, b: bgColor, g: textGlow }))}]\n`

: '';

const postContent = `${styleMeta}${rawText}`;



const nowSec = Math.floor(Date.now() / 1000);

try {

await env.DB.prepare(

`INSERT INTO ${feedTable} (user_id, content, created_at) VALUES (?, ?, ?)`

).bind(user.id, postContent, nowSec).run();

} catch (eInsert) {

await env.DB.prepare(

`INSERT INTO ${feedTable} (user_id, content) VALUES (?, ?)`

).bind(user.id, postContent).run();

}

message = `<div style="color: #00ff00; background: #001a00; border: 1px solid #005500; padding: 6px; text-align: center; margin-bottom: 8px;">✅ Đăng bài lên tường nhà thành công!</div>`;

} else if (action === 'delete_post') {

const postId = parseInt(formData.get('post_id') || '0');

if (!postId) throw new Error("ID bài viết không hợp lệ!");

const postRow = await env.DB.prepare(`SELECT id, user_id FROM ${feedTable} WHERE id = ?`).bind(postId).first();

if (!postRow) throw new Error("Bài viết không tồn tại hoặc đã bị xóa!");

if (!canModerate && Number(postRow.user_id) !== Number(user.id)) {

throw new Error("Bạn không có quyền quản lý xóa bài viết này!");

}

await env.DB.prepare(`DELETE FROM ${feedTable} WHERE id = ?`).bind(postId).run();

try {

await env.DB.prepare(`DELETE FROM wall_post_comments WHERE post_id = ?`).bind(postId).run();

await env.DB.prepare(`DELETE FROM wall_post_likes WHERE post_id = ?`).bind(postId).run();

} catch (eDelMeta) {}

message = `<div style="color: #ffcc00; background: #1a1500; border: 1px solid #665500; padding: 6px; text-align: center; margin-bottom: 8px;">🗑️ Đã xóa bài viết #${postId}!</div>`;

} else if (action === 'like_post') {

const postId = parseInt(formData.get('post_id') || '0');

if (!postId) throw new Error("ID bài viết không hợp lệ!");



const existingLike = await env.DB.prepare(

`SELECT id FROM wall_post_likes WHERE post_id = ? AND user_id = ?`

).bind(postId, user.id).first();



if (existingLike) {

await env.DB.prepare(

`DELETE FROM wall_post_likes WHERE post_id = ? AND user_id = ?`

).bind(postId, user.id).run();

try {

await env.DB.prepare(`UPDATE ${feedTable} SET likes_count = MAX(0, COALESCE(likes_count, 0) - 1) WHERE id = ?`).bind(postId).run();

} catch (eLikeDec) {

try {

await env.DB.prepare(`UPDATE ${feedTable} SET likes = MAX(0, COALESCE(likes, 0) - 1) WHERE id = ?`).bind(postId).run();

} catch (eLikeDec2) {}

}

} else {

const nowSec = Math.floor(Date.now() / 1000);

await env.DB.prepare(

`INSERT INTO wall_post_likes (post_id, user_id, created_at) VALUES (?, ?, ?)`

).bind(postId, user.id, nowSec).run();

try {

await env.DB.prepare(`UPDATE ${feedTable} SET likes_count = COALESCE(likes_count, 0) + 1 WHERE id = ?`).bind(postId).run();

} catch (eLikeInc) {

try {

await env.DB.prepare(`UPDATE ${feedTable} SET likes = COALESCE(likes, 0) + 1 WHERE id = ?`).bind(postId).run();

} catch (eLikeInc2) {}

}

}

} else if (action === 'comment_post') {

const postId = parseInt(formData.get('post_id') || '0');

const commentText = (formData.get('comment_content') || '').trim();

if (!postId) throw new Error("ID bài viết không hợp lệ!");

if (!commentText) throw new Error("Vui lòng nhập nội dung bình luận!");



const nowSec = Math.floor(Date.now() / 1000);

const insRes = await env.DB.prepare(

`INSERT INTO wall_post_comments (post_id, user_id, content, created_at) VALUES (?, ?, ?, ?)`

).bind(postId, user.id, commentText, nowSec).run();



try {

await env.DB.prepare(`UPDATE ${feedTable} SET comments_count = COALESCE(comments_count, 0) + 1 WHERE id = ?`).bind(postId).run();

} catch (eCmtUpd) {

try {

await env.DB.prepare(`UPDATE ${feedTable} SET comments = COALESCE(comments, 0) + 1 WHERE id = ?`).bind(postId).run();

} catch (eCmtUpd2) {}

}



if (isAjax) {

const cntRow = await env.DB.prepare(`SELECT COUNT(*) as total FROM wall_post_comments WHERE post_id = ?`).bind(postId).first();

const styleInfo = formatCommentUserStyle({

...user,

user_id: user.id

});

return new Response(JSON.stringify({

ok: true,

postId,

totalComments: Number(cntRow?.total || 0),

comment: {

id: Number(insRes?.meta?.last_row_id || Date.now()),

userId: Number(user.id),

nameHtml: styleInfo.nameHtml,

avatarSrc: styleInfo.avatarSrc,

avatarStyle: styleInfo.avatarStyle,

content: commentText,

timeAgo: 'Vừa xong'

}

}), {

headers: { 'Content-Type': 'application/json;charset=UTF-8' }

});

}



message = `<div style="color: #00ff00; background: #001a00; border: 1px solid #005500; padding: 6px; text-align: center; margin-bottom: 8px;">💬 Đã gửi bình luận!</div>`;

} else if (isOwner) {

if (action === 'update_cover') {

const coverPhoto = formData.get('cover_photo');

if (!coverPhoto) throw new Error("Vui lòng chọn ảnh bìa hợp lệ!");

await env.DB.prepare("UPDATE users SET cover_photo = ? WHERE id = ?").bind(coverPhoto.trim(), user.id).run();

message = `<div style="color: #00ff00; background: #001a00; border: 1px solid #005500; padding: 6px; text-align: center; margin-bottom: 8px;">✅ Cập nhật ảnh bìa thành công!</div>`;

} else if (action === 'delete_cover') {

await env.DB.prepare("UPDATE users SET cover_photo = NULL WHERE id = ?").bind(user.id).run();

message = `<div style="color: #ffcc00; background: #1a1a00; border: 1px solid #555500; padding: 6px; text-align: center; margin-bottom: 8px;">⚠️ Đã xóa ảnh bìa!</div>`;

} else if (action === 'update_avatar') {

const avatar = formData.get('avatar');

if (!avatar) throw new Error("Vui lòng chọn ảnh đại diện hợp lệ!");

await env.DB.prepare("UPDATE users SET avatar = ? WHERE id = ?").bind(avatar.trim(), user.id).run();

message = `<div style="color: #00ff00; background: #001a00; border: 1px solid #005500; padding: 6px; text-align: center; margin-bottom: 8px;">✅ Cập nhật ảnh đại diện thành công!</div>`;

} else if (action === 'update_info') {

const displayName = (formData.get('display_name') || '').trim();

const gender = formData.get('gender') || 'Chưa cập nhật';

const relationship = formData.get('relationship') || 'Đang độc thân';

const province = (formData.get('province') || '').trim();

const birthday = (formData.get('birthday') || '').trim();

const newPassword = (formData.get('new_password') || '').trim();



if (!displayName) throw new Error("Tên hiển thị không được để trống!");



if (newPassword) {

await env.DB.prepare("UPDATE users SET display_name = ?, gender = ?, relationship = ?, province = ?, birthday = ?, password = ? WHERE id = ?")

.bind(displayName, gender, relationship, province, birthday, newPassword, user.id).run();

} else {

await env.DB.prepare("UPDATE users SET display_name = ?, gender = ?, relationship = ?, province = ?, birthday = ? WHERE id = ?")

.bind(displayName, gender, relationship, province, birthday, user.id).run();

}

message = `<div style="color: #00ff00; background: #001a00; border: 1px solid #005500; padding: 6px; text-align: center; margin-bottom: 8px;">✅ Đã lưu cài đặt thông tin cá nhân!</div>`;

}

} else {

if (action === 'toggle_follow') {

const exists = await env.DB.prepare("SELECT id FROM follows WHERE follower_id = ? AND following_id = ?").bind(user.id, targetId).first();

if (exists) {

await env.DB.prepare("DELETE FROM follows WHERE follower_id = ? AND following_id = ?").bind(user.id, targetId).run();

} else {

await env.DB.prepare("INSERT INTO follows (follower_id, following_id) VALUES (?, ?)").bind(user.id, targetId).run();

}

} else if (action === 'toggle_friend') {

const exists = await env.DB.prepare("SELECT id FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)").bind(user.id, targetId, targetId, user.id).first();

if (exists) {

await env.DB.prepare("DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)").bind(user.id, targetId, targetId, user.id).run();

} else {

await env.DB.prepare("INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, 'accepted')").bind(user.id, targetId).run();

}

} else if (action === 'send_gift') {

const giftType = formData.get('gift_type');

if ((user.coins || 0) < 100) throw new Error("Bạn không đủ 100 Xu để tặng quà!");

await env.DB.prepare("UPDATE users SET coins = coins - 100 WHERE id = ?").bind(user.id).run();

await env.DB.prepare("INSERT INTO user_gifts (sender_id, receiver_id, gift_type) VALUES (?, ?, ?)").bind(user.id, targetId, giftType).run();

message = `<div style="color: #00ff00; text-align: center; margin-bottom: 6px;">🎁 Tặng quà thành công (-100 Xu)!</div>`;

}

}

profileUser = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(targetId).first();

} catch (e) {

if (isAjax) {

return new Response(JSON.stringify({ ok: false, error: e.message || "Lỗi gửi bình luận!" }), {

status: 400,

headers: { 'Content-Type': 'application/json;charset=UTF-8' }

});

}

message = `<div style="color: #ff5555; background: #1a0000; border: 1px solid #550000; padding: 6px; text-align: center; margin-bottom: 8px;">❌ Lỗi: ${escapeHtml(e.message)}</div>`;

}

}



const rProfile = renderUser(profileUser);

const pIcon = profileUser.active_icon ? `${profileUser.active_icon} ` : '';

const followingRow = await env.DB.prepare("SELECT COUNT(*) as total FROM follows WHERE follower_id = ?").bind(targetId).first();

const followerRow = await env.DB.prepare("SELECT COUNT(*) as total FROM follows WHERE following_id = ?").bind(targetId).first();

const friendsRow = await env.DB.prepare("SELECT COUNT(*) as total FROM friends WHERE user_id = ? OR friend_id = ?").bind(targetId, targetId).first();



let isFollowing = false, isFriend = false;

if (!isOwner) {

const fCheck = await env.DB.prepare("SELECT id FROM follows WHERE follower_id = ? AND following_id = ?").bind(user.id, targetId).first();

const frCheck = await env.DB.prepare("SELECT id FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)").bind(user.id, targetId, targetId, user.id).first();

isFollowing = !!fCheck;

isFriend = !!frCheck;

}



const giftRows = await env.DB.prepare("SELECT gift_type, COUNT(*) as cnt FROM user_gifts WHERE receiver_id = ? GROUP BY gift_type").bind(targetId).all();

const giftCounts = { love: 0, kiss: 0, ring: 0, flower: 0 };

let totalGifts = 0;

for (const r of (giftRows.results || [])) {

if (giftCounts[r.gift_type] !== undefined) giftCounts[r.gift_type] = r.cnt;

totalGifts += r.cnt;

}



let postCount = 0;

let userPosts = [];

let commentsByPost = {};

let likesCountByPost = {};

let likedByMeSet = new Set();

try {

const pRow = await env.DB.prepare(`SELECT COUNT(*) as total FROM ${feedTable} WHERE user_id = ?`).bind(targetId).first();

postCount = pRow?.total || 0;



const pList = await env.DB.prepare(`SELECT * FROM ${feedTable} WHERE user_id = ? ORDER BY id DESC LIMIT 20`).bind(targetId).all();

userPosts = pList.results || [];



const postIds = userPosts.map(p => Number(p.id || 0)).filter(id => id > 0);

if (postIds.length > 0) {

const placeholders = postIds.map(() => '?').join(',');

const cRows = await env.DB.prepare(`

SELECT c.*, u.username, u.display_name, u.avatar, u.role, u.is_admin, u.active_icon,

u.name_color, u.name_glow, u.name_border, u.name_border_glow, u.border_color, u.avatar_glow

FROM wall_post_comments c

LEFT JOIN users u ON u.id = c.user_id

WHERE c.post_id IN (${placeholders})

ORDER BY c.id DESC

`).bind(...postIds).all();

for (const c of (cRows.results || [])) {

const pid = Number(c.post_id);

if (!commentsByPost[pid]) commentsByPost[pid] = [];

const styleInfo = formatCommentUserStyle(c);

commentsByPost[pid].push({

id: Number(c.id || 0),

userId: Number(c.user_id || 0),

nameHtml: styleInfo.nameHtml,

avatarSrc: styleInfo.avatarSrc,

avatarStyle: styleInfo.avatarStyle,

content: c.content || '',

timeAgo: formatTimeAgo(c.created_at)

});

}



const lRows = await env.DB.prepare(`

SELECT post_id, COUNT(*) as cnt, SUM(CASE WHEN user_id = ? THEN 1 ELSE 0 END) as mine

FROM wall_post_likes

WHERE post_id IN (${placeholders})

GROUP BY post_id

`).bind(user.id, ...postIds).all();

for (const l of (lRows.results || [])) {

const pid = Number(l.post_id);

likesCountByPost[pid] = Number(l.cnt || 0);

if (Number(l.mine || 0) > 0) likedByMeSet.add(pid);

}

}

} catch(e) {}



const hasCover = (profileUser.cover_photo && !profileUser.cover_photo.includes('7gXvS6v'));

const coverStyle = hasCover ? `background: url('${profileUser.cover_photo}') center/cover no-repeat;` : `background: linear-gradient(135deg, #0a1f0a 0%, #151515 50%, #051428 100%);`;

const avatarSrc = profileUser.avatar && !profileUser.avatar.includes('7gXvS6v')

? profileUser.avatar

: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100' height='100' fill='%231a1a1a'/><circle cx='50' cy='38' r='18' fill='%2300ff00'/></svg>";



const commentsJsonSafe = JSON.stringify(commentsByPost).replace(/</g, '\\u003c');



const wallPostsHtml = userPosts.length === 0

? `<div style="color: #888; text-align: center; padding: 14px; font-size: 12px;">Chưa có bài đăng nào.</div>`

: userPosts.map((post) => {

const postId = Number(post.id || 0);

let rawText = post.content || post.body || post.caption || '';

let postStyle = '';

const styleMatch = rawText.match(/^\[style=([^\]]+)\]\r?\n/);

if (styleMatch) {

rawText = rawText.slice(styleMatch[0].length);

try {

const st = JSON.parse(decodeURIComponent(styleMatch[1]));

const rules = [];

if (isSafeColor(st.c)) rules.push(`color: ${st.c}`);

if (isSafeColor(st.b)) rules.push(`background: ${st.b}; padding: 6px 8px; border-radius: 4px; display: inline-block`);

if (isSafeColor(st.g)) rules.push(`text-shadow: 0 0 8px ${st.g}`);

if (rules.length) postStyle = rules.join('; ') + ';';

} catch (e) {}

}



const imgUrl = post.image_url || post.image || post.media_url || '';

const timeAgo = formatTimeAgo(post.created_at || post.time || post.createdAt);

const postComments = commentsByPost[postId] || [];

const dbLikes = Number(post.likes_count ?? post.likes ?? 0);

const tableLikes = Number(likesCountByPost[postId] ?? 0);

const likesCount = Math.max(dbLikes, tableLikes);

const isLikedByMe = likedByMeSet.has(postId);

const commentsCount = Math.max(Number(post.comments_count ?? post.comments ?? 0), postComments.length);

const canDeleteThisPost = canModerate || Number(post.user_id) === Number(user.id);



return `

<div style="background: #141414; border: 1px solid #2b2b2b; border-radius: 4px; padding: 10px; margin-top: 8px;">

<!-- Header bài đăng -->

<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">

<div style="display: flex; align-items: center; gap: 8px;">

<img src="${avatarSrc}" width="34" height="34" style="${rProfile.avatarStyle} display: block;">

<div>

<div style="font-size: 13px; line-height: 1.2;">${rProfile.nameHtml}</div>

<div style="font-size: 11px; color: #999; margin-top: 2px;">🕒 ${escapeHtml(timeAgo)} · 🌐 Công khai</div>

</div>

</div>



${canDeleteThisPost ? `

<form method="POST" style="margin: 0;" onsubmit="return confirm('Xóa bài đăng này khỏi hệ thống?');">

<input type="hidden" name="action" value="delete_post">

<input type="hidden" name="post_id" value="${postId}">

<button type="submit" style="background: #2b0909; color: #ff6666; border: 1px solid #661a1a; border-radius: 3px; padding: 2px 7px; font-size: 10px; font-weight: bold; cursor: pointer;">🗑️ Xóa bài</button>

</form>

` : `<span style="color: #666; font-size: 12px;">⋮</span>`}

</div>



<!-- Nội dung bài đăng -->

${rawText ? `<div style="font-size: 13px; color: #f2f2f2; line-height: 1.6; white-space: pre-wrap; text-align: center; margin-bottom: ${imgUrl ? '10px' : '8px'}; ${escapeHtml(postStyle)}">${escapeHtml(rawText)}</div>` : ''}



<!-- Ảnh bài đăng -->

${imgUrl ? `

<div style="text-align: center; background: #080808; border: 1px solid #222; border-radius: 4px; overflow: hidden; margin-bottom: 8px;">

<img src="${escapeHtml(imgUrl)}" alt="Ảnh bài đăng" style="max-width: 100%; max-height: 380px; object-fit: contain; display: block; margin: 0 auto;">

</div>

` : ''}



<!-- Hàng dưới: Ô icon tim và ô icon bình luận mở Popup -->

<div style="display: flex; align-items: center; gap: 10px; border-top: 1px solid #242424; padding-top: 8px; flex-wrap: wrap;">

<form method="POST" style="margin: 0; display: inline-flex; align-items: center;">

<input type="hidden" name="action" value="like_post">

<input type="hidden" name="post_id" value="${postId}">

<button type="submit" title="${isLikedByMe ? 'Bỏ thích bài viết' : 'Thích bài viết'}" style="background: ${isLikedByMe ? '#33121b' : '#1e1014'}; border: 1px solid ${isLikedByMe ? '#ff4d6d' : '#4a1c28'}; border-radius: 6px; color: #ff4d6d; font-size: 15px; font-weight: bold; cursor: pointer; padding: 6px 12px; display: inline-flex; align-items: center; gap: 6px; min-width: 64px; justify-content: center;">

<span style="font-size: 16px; line-height: 1;">❤️</span>

<span style="color: #fff; font-size: 13px; font-weight: bold;">${likesCount}</span>

</button>

</form>



<button type="button" onclick="openCommentPopup(${postId})" title="Bình luận bài viết" style="background: #121824; border: 1px solid #263654; border-radius: 6px; color: #60a5fa; font-size: 15px; font-weight: bold; cursor: pointer; padding: 6px 12px; display: inline-flex; align-items: center; gap: 6px; min-width: 64px; justify-content: center;">

<span style="font-size: 16px; line-height: 1;">💬</span>

<span id="post-comment-count-${postId}" style="color: #fff; font-size: 13px; font-weight: bold;">${commentsCount}</span>

</button>

</div>

</div>`;

}).join('');



const content = `

<div class="box" style="margin-bottom: 8px; border: 1px solid #333;">

<div class="box-title" style="display: flex; justify-content: space-between; align-items: center;">

<span>📁 ${isOwner ? 'Hồ sơ của tôi' : 'Hồ sơ thành viên'}</span>

${isOwner ? `<button type="button" onclick="openSettingsModal()" style="background: #1c1c1c; color: #ffcc00; border: 1px solid #444; padding: 2px 6px; font-size: 10px; cursor: pointer;">⚙️ Cài đặt thông tin</button>` : `<span style="font-size: 10px; color: #aaa;">ID: ${profileUser.id}</span>`}

</div>


<div style="position: relative; background: #111; border-bottom: 1px solid #333; text-align: center;">

<div style="height: 120px; ${coverStyle}"></div>


${isOwner ? `

<div style="position: absolute; right: 6px; bottom: 6px; display: flex; gap: 4px;">

<button type="button" onclick="openCoverModal()" class="btn" style="background: rgba(0,0,0,0.85); color: #fff; border: 1px solid #555; padding: 3px 7px; font-size: 10px; cursor: pointer;">📷 Đổi ảnh bìa</button>

${hasCover ? `

<form method="POST" style="margin: 0;" onsubmit="return confirm('Xóa ảnh bìa?');">

<input type="hidden" name="action" value="delete_cover">

<button type="submit" class="btn" style="background: rgba(120,0,0,0.9); color: #fff; padding: 3px 7px; font-size: 10px;">🗑️ Xóa</button>

</form>` : ''}

</div>

` : ''}



<!-- Avatar kèm nút icon máy ảnh mở modal -->

<div style="position: relative; margin-top: -35px; margin-bottom: 4px; display: inline-block;">

<img src="${avatarSrc}" width="66" height="66" style="${rProfile.avatarStyle} display: block;">

${isOwner ? `<button type="button" onclick="openAvatarModal()" title="Đổi ảnh đại diện" style="position: absolute; bottom: -2px; right: -2px; background: #111; color: #00ff00; border: 1px solid #00ff00; border-radius: 50%; width: 22px; height: 22px; font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; box-shadow: 0 0 4px #000;">📷</button>` : ''}

</div>


<div style="font-size: 13px; margin-bottom: 2px;">

${rProfile.nameHtml}

<span style="color: #ffcc00; font-size: 11px;">[Lv.${profileUser.level || 1}]</span>

</div>



<!-- Hiển thị phân biệt: Quản lý có khung, Thành viên hiển thị chữ bình thường -->

<div style="text-align: center; font-size: 13px; margin: 6px 0 10px 0;">

<span style="color: #aaa; font-size: 11px;">ID ${profileUser.id}</span>

<span style="margin: 0 4px; color: #666;">·</span>

${(profileUser.role && profileUser.role !== 'Thành Viên') ? `

<span style="display: inline-block; background: #1a1a1a; border: 1px solid #444; color: #ffcc00; font-size: 11px; font-w
