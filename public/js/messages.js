let activeChatUser = '';
let messageInterval = null;

function stopMessagePolling() {
    if (messageInterval) {
        clearInterval(messageInterval);
        messageInterval = null;
    }
}

function renderMessagesView(container, targetUser = null) {
    container.innerHTML = `
        <div class="space-y-3">
            <div class="wap-card rounded-xl p-3 text-xs space-y-2">
                <h3 class="font-bold text-amber-400 border-b border-[#222228] pb-1"><i class="fa-solid fa-envelope mr-1 text-pink-400"></i> Hộp thư & Nhắn tin riêng</h3>
                <div>
                    <label class="block text-slate-400 mb-1">Nhắn với thành viên (Tên hiển thị):</label>
                    <div class="flex space-x-2">
                        <input type="text" id="chat-target" value="${targetUser ? escapeHtml(targetUser) : ''}" placeholder="Nhập tên người nhận..." class="flex-grow px-2.5 py-1.5 rounded-lg wap-input">
                        <button onclick="openChatBox()" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-semibold">Mở chat</button>
                    </div>
                </div>
            </div>

            <div id="private-chat-box" class="wap-card rounded-xl p-3 hidden space-y-3">
                <div class="flex justify-between items-center border-b border-[#222228] pb-2">
                    <span class="font-bold text-xs text-emerald-400" id="chat-with-title">Đang chat với: --</span>
                    <button onclick="closeChatBox()" class="text-rose-400 text-[11px] hover:underline">Đóng</button>
                </div>
                <div id="private-messages-list" class="h-48 overflow-y-auto space-y-2 bg-[#08080a] p-2 rounded-lg border border-[#1f1f23] text-xs">
                    <div class="text-center text-slate-500 py-4">Chưa có tin nhắn nào.</div>
                </div>
                <div class="flex space-x-2">
                    <input type="text" id="private-input" placeholder="Nhập tin nhắn..." class="flex-grow px-2.5 py-2 rounded-lg wap-input" onkeypress="if(event.key==='Enter') sendPrivateMessage()">
                    <button onclick="sendPrivateMessage()" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-lg font-semibold shadow">Gửi</button>
                </div>
            </div>
        </div>
    `;
    if (targetUser) openChatBox();
}

function openChatBox() {
    const user = getCurrentUser();
    const targetInput = document.getElementById('chat-target');
    if (!targetInput) return;
    const target = targetInput.value.trim();
    if (!target) return alert('Vui lòng nhập tên người nhận!');
    if (user && target === user.ten_hien_thi) return alert('Không thể tự nhắn cho chính mình!');

    activeChatUser = target;
    const titleEl = document.getElementById('chat-with-title');
    const chatBoxEl = document.getElementById('private-chat-box');
    if (titleEl) titleEl.innerText = 'Đang chat với: ' + target;
    if (chatBoxEl) chatBoxEl.classList.remove('hidden');

    fetchPrivateMessages();
    stopMessagePolling();
    messageInterval = setInterval(fetchPrivateMessages, 2000);
}

function closeChatBox() {
    const chatBoxEl = document.getElementById('private-chat-box');
    if (chatBoxEl) chatBoxEl.classList.add('hidden');
    activeChatUser = '';
    stopMessagePolling();
}

async function fetchPrivateMessages() {
    const user = getCurrentUser();
    if (!activeChatUser || !user) return;
    try {
        const res = await fetch(`/api/messages/get?user1=${encodeURIComponent(user.ten_hien_thi)}&user2=${encodeURIComponent(activeChatUser)}`);
        if (res.ok) {
            const msgs = await res.json();
            const listDiv = document.getElementById('private-messages-list');
            if (!listDiv) return;
            if (msgs.length === 0) {
                listDiv.innerHTML = '<div class="text-center text-slate-500 py-4">Chưa có tin nhắn nào.</div>';
                return;
            }
            listDiv.innerHTML = msgs.map(m => {
                const isMe = m.nguoi_gui === user.ten_hien_thi;
                return `
                    <div class="flex flex-col ${isMe ? 'items-end' : 'items-start'}">
                        <span class="text-[9px] text-slate-500 mb-0.5">${escapeHtml(m.nguoi_gui)}</span>
                        <div class="max-w-[80%] px-3 py-1.5 rounded-lg text-xs ${isMe ? 'bg-blue-600 text-white rounded-br-none' : 'bg-[#1a1a1e] text-slate-200 border border-[#2e2e36] rounded-bl-none'}">
                            ${escapeHtml(m.noi_dung)}
                        </div>
                    </div>
                `;
            }).join('');
            listDiv.scrollTop = listDiv.scrollHeight;
        }
    } catch (e) {}
}

async function sendPrivateMessage() {
    const user = getCurrentUser();
    const input = document.getElementById('private-input');
    if (!input) return;
    const noi_dung = input.value.trim();
    if (!noi_dung || !activeChatUser || !user) return;

    try {
        const res = await fetch('/api/messages/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nguoi_gui: user.ten_hien_thi, nguoi_nhan: activeChatUser, noi_dung })
        });
        if (res.ok) {
            input.value = '';
            fetchPrivateMessages();
        }
    } catch (e) {
        alert('Không thể gửi tin nhắn.');
    }
}
