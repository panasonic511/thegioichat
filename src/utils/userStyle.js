export function renderUser(u) {
    // Nếu u không tồn tại hoặc không phải object, tự động dùng giá trị mặc định an toàn
    if (!u || typeof u !== 'object') {
        const defaultAvt = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100' height='100' fill='%231a1a1a'/><circle cx='50' cy='38' r='18' fill='%2300ff00'/></svg>";
        return {
            nameStyle: 'color: #00ff00; font-weight: bold;',
            avatarStyle: 'border-radius: 50%; object-fit: cover; border: 2px solid #ffcc00;',
            nameHtml: `<span style="color: #00ff00;">Thành viên</span>`,
            avatarHtml: `<img src="${defaultAvt}" style="border-radius: 50%; width: 32px; height: 32px; object-fit: cover;">`
        };
    }

    const defaultAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100' height='100' fill='%231a1a1a'/><circle cx='50' cy='38' r='18' fill='%2300ff00'/><path d='M20 88 C20 65, 80 65, 80 88' fill='%2300ff00'/></svg>";
    const avatarUrl = (u.avatar && typeof u.avatar === 'string' && !u.avatar.includes('7gXvS6v')) ? u.avatar : defaultAvatar;

    const borderColor = u.border_color || '#ffcc00';
    let avatarStyle = `border-radius: 50%; object-fit: cover; border: 2px solid ${borderColor};`;
    if (u.avatar_glow && u.avatar_glow !== '#000000') {
        avatarStyle += ` box-shadow: 0 0 10px ${u.avatar_glow};`;
    }

    const nameColor = u.name_color || '#00ff00';
    let nameStyle = `color: ${nameColor}; font-weight: bold;`;
    let shadows = [];
    if (u.name_glow && u.name_glow !== '#000000') shadows.push(`0 0 6px ${u.name_glow}`);
    if (u.name_border_glow && u.name_border_glow !== '#000000') shadows.push(`0 0 4px ${u.name_border_glow}`);
    if (shadows.length > 0) nameStyle += ` text-shadow: ${shadows.join(', ')};`;
    if (u.name_border && u.name_border !== '#000000') nameStyle += ` -webkit-text-stroke: 0.5px ${u.name_border};`;

    const displayName = u.display_name || u.username || 'Thành viên';
    const userId = u.user_id || u.id || '';

    return {
        nameStyle,
        avatarStyle,
        nameHtml: `<a href="/profile?user=${userId}" style="${nameStyle}">${displayName}</a>`,
        avatarHtml: `<a href="/profile?user=${userId}"><img src="${avatarUrl}" style="${avatarStyle}"></a>`
    };
}
