// Kho icon động dùng chung toàn wap (bộ Vịt con - Cute Ducks từ blog.uhm.vn/emo/vitcon/)
// Nếu bộ này có N icon, bạn chỉ cần thêm/sửa hoặc dán kết quả từ Console vào mảng dưới đây.
export const ANIMATED_ICONS = Array.from({ length: 24 }, (_, idx) => ({
    group: 'Vịt con',
    name: `Vịt con ${idx + 1}`,
    url: `https://blog.uhm.vn/emo/vitcon/${idx + 1}.gif`
}));

function escapeBasic(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function renderRichTextHtml(text, extraStyle = '') {
    const raw = String(text ?? '');
    const urlRegex = /(https?:\/\/[^\s"'<>]+\.(?:gif|webp|png|jpe?g)(?:\?[^\s"'<>]*)?)/gi;
    const parts = raw.split(urlRegex);

    const htmlParts = parts.map((part) => {
        if (!part) return '';
        if (urlRegex.test(part)) {
            urlRegex.lastIndex = 0;
            const safeUrl = escapeBasic(part);
            return `<img src="${safeUrl}" alt="icon" style="height:24px;width:auto;vertical-align:middle;display:inline-block;margin:0 2px;">`;
        }
        urlRegex.lastIndex = 0;
        return escapeBasic(part);
    });

    const styleAttr = extraStyle ? ` style="${escapeBasic(extraStyle)}"` : '';
    return `<span${styleAttr}>${htmlParts.join('')}</span>`;
}
