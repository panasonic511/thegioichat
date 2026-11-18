export function renderUser(u) {
    // Sử dụng Proxy để bọc, nếu truy cập bất cứ thuộc tính nào của null/undefined cũng trả về chuỗi rỗng thay vì văng lỗi
    const safeUser = new Proxy(u || {}, {
        get(target, prop) {
            if (prop === 'id' || prop === 'user_id') return target[prop] || 0;
            return target[prop] !== undefined && target[prop] !== null ? target[prop] : '';
        }
    });

    const defaultAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100' height='100' fill='%231a1a1a'/><circle cx='50' cy='38' r='18' fill='%2300ff00'/><path d='M20 88 C20 65, 80 65, 80 88' fill='%2300ff00'/></svg>";
    
    const avatarVal = String(safeUser.avatar || '');
    const avatarUrl = (avatarVal && !avatarVal.includes('7gXvS6v')) ? avatarVal : defaultAvatar;

    const borderColor = String(safeUser.border_color || '#ffcc00');
    let avatarStyle = `border-radius: 50%; object-fit: cover; border: 2px solid ${borderColor};`;
    if (safeUser.avatar_glow && safeUser.avatar_glow !== '#000000') {
        avatarStyle += ` box-shadow: 0 0 10px ${safeUser.avatar_glow};`;
    }

    const nameColor = String(safeUser.name_color || '#00ff00');
    let nameStyle = `color: ${nameColor}; font-weight: bold;`;
    let shadows = [];
    if (safeUser.name_glow && safeUser.name_glow !== '#000000') shadows.push(`0 0 6px ${safeUser.name_glow}`);
    if (safeUser.name_border_glow && safeUser.name_border_glow !== '#000000') shadows.push(`0 0 4px ${safeUser.name_border_glow}`);
    if (shadows.length > 0) nameStyle += ` text-shadow: ${shadows.join(', ')};`;
    if (safeUser.name_border && safeUser.name_border !== '#000000') nameStyle += ` -webkit-text-stroke: 0.5px ${safeUser.name_border};`;

    const displayName = safeUser.display_name || safeUser.username || 'Thành viên';
    const userId = safeUser.user_id || safeUser.id || 0;

    return {
        nameStyle,
        avatarStyle,
        nameHtml: `<a href="/profile?user=${userId}" style="${nameStyle}">${displayName}</a>`,
        avatarHtml: `<a href="/profile?user=${userId}"><img src="${avatarUrl}" style="${avatarStyle}"></a>`
    };
}
