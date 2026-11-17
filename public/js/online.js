import { getCurrentUser, escapeHtml } from './app.js';

let activeChatUser = '';
let messageInterval = null;

export function stopMessagePolling() {
    if (messageInterval) {
        clearInterval(messageInterval);
        messageInterval = null;
    }
}

export function renderMessagesView(container, targetUser = null) {
    container.innerHTML = `
        <div class="space-y-3">
            <div class="wap-card rounded-xl p-3 text-xs space-y-2">
                <h3 class="font-bold text-amber-400 border-b border-[#222228] pb-1"><i class="fa-solid fa-envelope mr-1 text-pink-400"></i> Hộp thư & Nhắn tin riêng</h3>
                <div>
                    <label class="block text-slate-400 mb-1">Nhắn với thành viên (Tên hiển thị):</label>
                    <div class="flex space-x-2">
                        <input type="text" id="chat-target" value="${targetUser ? escapeHtml(targetUser) : ''}" placeholder="Nhập tên người nhận..." class="flex-grow px-2.5 py-1.5 rounded-lg wap-input">
                        <button id="btn-open-chat" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-semibold">Mở chat</button>
                    </div>
                </div>
            </div>

            <div id="private-chat-box" class="wap-card rounded-xl p-3 hidden space-y-3">
                <div class="flex justify-between items-center border-b border-[#222228] pb-2">
                    <span class="font-bold text-xs text-emerald-400" id="chat-with-title">Đang chat với: --</span>
                    <button id="btn-close-chat" class="text-rose-400 text-[11px] hover:underline">Đóng</button>
                </div>
                <div id="private-messages-list" class="h-48 overflow-y-auto space-y-2 bg-[#08080a] p-2 rounded-lg border border-[#1f1f23] text-xs">
                    <div class="text-center text-slate-500 py-4">Chưa có tin nhắn nào.</div>
                </div>
                <div class="flex space-x-2">
                    <input type="text" id="private-input" placeholder="Nhập tin nhắn..." class="flex-grow px-2.5 py-2 rounded-lg wap-input">
                    <button id="btn-send-msg" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-lg font-semibold shadow">Gửi</button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('btn-open-chat').onclick = openChatBox;
    document.getElementById('btn-close-chat').onclick = closeChatBox;
    document.getElementById('btn-send-msg').onclick = sendPrivateMessage;
    document.getElementById('private-input').onkeypress = (e) => { if (e.key === 'Enter') sendPrivateMessage(); };

    if (targetUser) openChatBox();
}

function openChatBox() {
    const user = getCurrentUser();
    const target = document.getElementById('chat-target').value.trim();
    if (!target) return alert('Vui lòng nhập tên người nhận!');
    if (target === user.display_name) return alert('Không thể tự nhắn cho chính mình!');

    activeChatUser = target;
    document.getElementById('chat-with-title').innerText = 'Đang chat với: ' + target;
    document.getElementById('private-chat-box').classList.remove('hidden');

    fetchPrivateMessages();
    stopMessagePolling();
    messageInterval = setInterval(fetchPrivateMessages, 2000);
}

function closeChatBox() {
    document.getElementById('private-chat-box').classList.add('hidden');
    activeChatUser = '';
    stopMessagePolling();
}

async function fetchPrivateMessages() {
    const user = getCurrentUser();
    if (!activeChatUser || !user) return;
    try {
        const res = await fetch(`/api/messages/get?user1=${encodeURIComponent(user.display_name)}&user2=${encodeURIComponent(activeChatUser)}`);
        if (res.ok) {
            const msgs = await res.json();
            const listDiv = document.getElementById('private-messages-list');
            if (!listDiv) return;
            if (msgs.length === 0) {
                listDiv.innerHTML = '<div class="text-center text-slate-500 py-4">Chưa có tin nhắn nào. Hãy bắt đầu trò chuyện!</div>';
                return;
            }
            listDiv.innerHTML = msgs.map(m => {
                const isMe = m.sender === user.display_name;
                return `
                    <div class="flex flex-col ${isMe ? 'items-end' : 'items-start'}">
                        <span class="text-[9px] text-slate-500 mb-0.5">${escapeHtml(m.sender)}</span>
                        <div class="max-w-[80%] px-3 py-1.5 rounded-lg text-xs ${isMe ? 'bg-blue-600 text-white rounded-br-none' : 'bg-[#1a1a1e] text-slate-200 border border-[#2e2e36] rounded-bl-none'}">
                            ${escapeHtml(m.content)}
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
    const content = input.value.trim();
    if (!content || !activeChatUser) return;

    try {
        const res = await fetch('/api/messages/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sender: user.display_name, receiver: activeChatUser, content })
        });
        if (res.ok) {
            input.value = '';
            fetchPrivateMessages();
        }
    } catch (e) {
        alert('Không thể gửi tin nhắn.');
    }
}