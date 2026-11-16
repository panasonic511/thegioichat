import { getCurrentUser, escapeHtml } from './app.js';

export function renderPostsView(container) {
    container.innerHTML = `
        <div class="space-y-3">
            <div class="wap-card rounded-xl p-3 space-y-2">
                <h3 class="font-bold text-xs text-blue-400"><i class="fa-solid fa-newspaper mr-1"></i> Đăng bài lên bảng tin</h3>
                <textarea id="post-content" rows="2" placeholder="Bạn đang nghĩ gì? Chia sẻ cùng cộng đồng..." class="w-full p-2.5 text-xs rounded-lg wap-input resize-none"></textarea>
                <div class="flex justify-end">
                    <button id="btn-submit-post" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow">Đăng bài</button>
                </div>
            </div>
            <div class="space-y-2" id="feed-container">
                <div class="wap-card rounded-xl p-3 text-center text-xs text-slate-400">Đang tải bài viết...</div>
            </div>
        </div>
    `;

    document.getElementById('btn-submit-post').onclick = createPost;
    loadPosts();
}

async function loadPosts() {
    const feed = document.getElementById('feed-container');
    try {
        const res = await fetch('/api/posts');
        if (res.ok) {
            const posts = await res.json();
            if (posts.length === 0) {
                feed.innerHTML = '<div class="wap-card rounded-xl p-3 text-center text-xs text-slate-400">Chưa có bài viết nào.</div>';
                return;
            }
            feed.innerHTML = posts.map(p => `
                <div class="wap-card rounded-xl p-3 space-y-1.5">
                    <div class="flex items-center space-x-2">
                        <div class="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-[10px]">${(p.username || 'A').charAt(0).toUpperCase()}</div>
                        <span class="font-bold text-xs text-slate-200">${escapeHtml(p.username)}</span>
                    </div>
                    <p class="text-xs text-slate-300 whitespace-pre-line">${escapeHtml(p.content)}</p>
                </div>
            `).join('');
        }
    } catch (e) {}
}

async function createPost() {
    const input = document.getElementById('post-content');
    const content = input.value.trim();
    if (!content) return;

    const user = getCurrentUser();
    try {
        const res = await fetch('/api/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user.display_name, content })
        });
        if (res.ok) {
            input.value = '';
            loadPosts();
        }
    } catch (e) {
        alert('Không thể đăng bài.');
    }
}
