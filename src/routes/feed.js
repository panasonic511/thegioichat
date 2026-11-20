import { renderUser } from '../worker.js';
import {
    ROLE_TIERS,
    getRoleTier,
    getRoleConfig
} from '../roles_system.js';
import {
    saveMediaAsset,
    saveMediaChunk,
    mergeMediaChunkBatch,
    deleteMediaAsset,
    normalizeMediaUrl
} from '../media_store.js';

const STORY_TTL_SECONDS = 24 * 60 * 60;
const MAX_ACTIVE_STORIES = 10;

function escapeAttr(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function getCanonicalRoleLabel(uLike) {
    if (!uLike) return 'Thành Viên';
    const tier = getRoleTier(uLike);
    if (tier === ROLE_TIERS.FOUNDER) return 'Người Sáng Lập';
    if (tier === ROLE_TIERS.SUPER_ADMIN) return 'Super Admin';
    if (tier === ROLE_TIERS.ADMIN) return 'Admin';
    if (tier === ROLE_TIERS.MOD) return 'Mod';
    const cfg = getRoleConfig(uLike);
    return (cfg && cfg.label) ? cfg.label : (uLike.role || 'Thành Viên');
}

function renderFeedUser(uLike) {
    const normalizedRole = getCanonicalRoleLabel(uLike);
    const tier = getRoleTier(uLike);
    const enrichedUser = {
        ...uLike,
        role: normalizedRole,
        is_admin: tier >= ROLE_TIERS.ADMIN ? 1 : Number(uLike && uLike.is_admin ? uLike.is_admin : 0)
    };
    const rendered = renderUser(enrichedUser) || {};
    let nameHtml = String(rendered.nameHtml || '');

    const badgeLabel = tier === ROLE_TIERS.FOUNDER
        ? 'FOUNDER'
        : (tier === ROLE_TIERS.SUPER_ADMIN
            ? 'S.ADMIN'
            : (tier === ROLE_TIERS.ADMIN
                ? 'ADMIN'
                : (tier === ROLE_TIERS.MOD ? 'MOD' : '')));

    if (badgeLabel) {
        if (/<span\b[^>]*class="[^"]*(?:role|badge|staff)[^"]*"[^>]*>[\s\S]*?<\/span>/i.test(nameHtml)) {
            nameHtml = nameHtml.replace(
                /(<span\b[^>]*class="[^"]*(?:role|badge|staff)[^"]*"[^>]*>)[\s\S]*?(<\/span>)/i,
                `$1${escapeAttr(badgeLabel)}$2`
            );
        } else {
            nameHtml = nameHtml.replace(/\b(MOD|ADMIN|S\.ADMIN|SUPER ADMIN|FOUNDER)\b/gi, badgeLabel);
        }
    }

    return {
        ...rendered,
        nameHtml,
        tier,
        roleLabel: normalizedRole
    };
}

function isStoryExpired(createdAtStr) {
    if (!createdAtStr) return false;
    const normalized = String(createdAtStr).trim().replace(' ', 'T') + (String(createdAtStr).includes('Z') || String(createdAtStr).includes('+') ? '' : 'Z');
    const ts = Date.parse(normalized);
    if (isNaN(ts)) return false;
    return (Date.now() - ts) >= STORY_TTL_SECONDS * 1000;
}

async function ensureFeedSchema(env) {
    if (!env || !env.DB) return;
    await env.DB.batch([
        env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                content TEXT,
                image_url TEXT,
                created_at TEXT
            )
        `),
        env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS post_likes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                post_id INTEGER,
                user_id INTEGER,
                reaction TEXT DEFAULT '❤️'
            )
        `),
        env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS post_comments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                post_id INTEGER,
                user_id INTEGER,
                comment TEXT,
                created_at TEXT
            )
        `),
        env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS stories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                image_url TEXT,
                media_url TEXT,
                thumb_url TEXT,
                media_type TEXT DEFAULT 'image',
                caption TEXT,
                created_at TEXT
            )
        `),
        env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS media_assets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                owner_type TEXT,
                owner_id INTEGER,
                media_type TEXT DEFAULT 'image',
                media_url TEXT,
                thumb_url TEXT,
                duration_sec REAL DEFAULT 0,
                created_at TEXT
            )
        `),
        env.DB.prepare(`
            CREATE INDEX IF NOT EXISTS idx_media_assets_owner ON media_assets(owner_type, owner_id)
        `),
        env.DB.prepare(`
            CREATE INDEX IF NOT EXISTS idx_stories_id_desc ON stories(id DESC)
        `),
        env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS follows (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                follower_id INTEGER,
                following_id INTEGER
            )
        `)
    ]);

    try { await env.DB.prepare("ALTER TABLE posts ADD COLUMN image_url TEXT").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE stories ADD COLUMN image_url TEXT").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE stories ADD COLUMN media_url TEXT").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE stories ADD COLUMN thumb_url TEXT").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE stories ADD COLUMN media_type TEXT DEFAULT 'image'").run(); } catch (e) {}
}

async function cleanupExpiredAndOverflowMedia(request, env) {
    if (!env || !env.DB) return;
    try {
        const staleRows = await env.DB.prepare(`
            SELECT stories.id,
                   stories.image_url, stories.media_url, stories.thumb_url,
                   ma.media_url AS ma_media_url, ma.thumb_url AS ma_thumb_url
            FROM stories
            LEFT JOIN media_assets ma ON ma.owner_type = 'story' AND ma.owner_id = stories.id
            WHERE datetime(stories.created_at, '+24 hours') <= datetime('now')
               OR stories.id NOT IN (
                   SELECT id FROM stories ORDER BY id DESC LIMIT ${MAX_ACTIVE_STORIES}
               )
        `).all();

        const urlsToDelete = new Set();
        for (const r of ((staleRows && staleRows.results) || [])) {
            [r.image_url, r.media_url, r.thumb_url, r.ma_media_url, r.ma_thumb_url].forEach(u => {
                const norm = normalizeMediaUrl(u);
                if (norm.startsWith('/media/')) urlsToDelete.add(norm);
            });
        }

        for (const u of urlsToDelete) {
            await deleteMediaAsset(request, env, u);
        }

        await env.DB.batch([
            env.DB.prepare(`
                DELETE FROM media_assets
                WHERE owner_type = 'story'
                  AND owner_id IN (
                      SELECT id FROM stories
                      WHERE datetime(stories.created_at, '+24 hours') <= datetime('now')
                  )
            `),
            env.DB.prepare(`
                DELETE FROM stories
                WHERE datetime(stories.created_at, '+24 hours') <= datetime('now')
            `),
            env.DB.prepare(`
                DELETE FROM media_assets
                WHERE owner_type = 'story'
                  AND owner_id NOT IN (
                      SELECT id FROM stories ORDER BY id DESC LIMIT ${MAX_ACTIVE_STORIES}
                  )
            `),
            env.DB.prepare(`
                DELETE FROM stories
                WHERE id NOT IN (
                    SELECT id FROM stories ORDER BY id DESC LIMIT ${MAX_ACTIVE_STORIES}
                )
            `)
        ]);
    } catch (e) {}
}

function scheduleRetention(request, env, ctx) {
    const task = cleanupExpiredAndOverflowMedia(request, env);
    if (ctx && typeof ctx.waitUntil === 'function') {
        ctx.waitUntil(task);
        return Promise.resolve();
    }
    return task;
}

export async function handleFeed(request, env, user, renderLayout, ctx) {
    const urlObj = new URL(request.url);
    const tab = urlObj.searchParams.get('tab') || 'new';
    const page = parseInt(urlObj.searchParams.get('page')) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;
    const currentUserTier = getRoleTier(user);
    const isCurrentStaffOrAdmin = currentUserTier >= ROLE_TIERS.MOD;

    if (request.method === 'POST') {
        try {
            const formData = await request.formData();
            const action = formData.get('action');

            if (action === 'upload_media_chunk') {
                const uploadId = String(formData.get('upload_id') || '');
                const chunkIndex = parseInt(formData.get('chunk_index') || '0', 10);
                const chunkBlob = formData.get('chunk');
                const savedChunk = await saveMediaChunk(request, env, {
                    uploadId,
                    chunkIndex,
                    chunkBlob,
                    ttlSeconds: 3600
                });
                return new Response(JSON.stringify({ success: true, ...savedChunk }), {
                    headers: { 'Content-Type': 'application/json;charset=UTF-8' }
                });
            }

            if (action === 'finalize_media_upload') {
                const uploadId = String(formData.get('upload_id') || '');
                const startChunk = parseInt(formData.get('start_chunk') || '0', 10);
                const batchSize = parseInt(formData.get('batch_size') || '6', 10);
                const totalChunks = parseInt(formData.get('total_chunks') || '0', 10);
                const existingUrl = String(formData.get('existing_url') || '');
                const folder = String(formData.get('folder') || 'stories');
                const mimeType = String(formData.get('mime_type') || 'video/mp4');
                const ttl = folder === 'posts' ? 30 * 24 * 60 * 60 : STORY_TTL_SECONDS;

                const mergedStep = await mergeMediaChunkBatch(request, env, {
                    uploadId,
                    startChunk,
                    batchSize,
                    totalChunks,
                    existingUrl,
                    folder,
                    userId: user.id,
                    mimeType,
                    ttlSeconds: ttl
                });

                return new Response(JSON.stringify({
                    success: true,
                    ...mergedStep
                }), {
                    headers: { 'Content-Type': 'application/json;charset=UTF-8' }
                });
            }

            try { await ensureFeedSchema(env); } catch (e) {}

            if (action === 'create_post') {
                const content = String(formData.get('content') || '');
                const postFile = formData.get('post_file');
                const rawImageUrl = String(formData.get('image_url') || '').trim();
                let imageUrl = rawImageUrl;

                if (postFile && typeof postFile === 'object' && postFile.size > 0) {
                    const saved = await saveMediaAsset(request, env, {
                        folder: 'posts',
                        userId: user.id,
                        file: postFile,
                        ttlSeconds: 30 * 24 * 60 * 60
                    });
                    if (saved.url) imageUrl = saved.url;
                } else if (rawImageUrl.startsWith('data:')) {
                    const saved = await saveMediaAsset(request, env, {
                        folder: 'posts',
                        userId: user.id,
                        dataUrl: rawImageUrl,
                        ttlSeconds: 30 * 24 * 60 * 60
                    });
                    if (saved.url) imageUrl = saved.url;
                }

                if (content.trim() !== '' || imageUrl.trim() !== '') {
                    const insertedPost = await env.DB.prepare(
                        "INSERT INTO posts (user_id, content, image_url, created_at) VALUES (?, ?, ?, datetime('now')) RETURNING id"
                    ).bind(user.id, content, imageUrl).first();

                    if (imageUrl.trim() !== '' && insertedPost && insertedPost.id) {
                        await env.DB.prepare(
                            "INSERT INTO media_assets (user_id, owner_type, owner_id, media_type, media_url, thumb_url, duration_sec, created_at) VALUES (?, 'post', ?, 'image', ?, ?, 0, datetime('now'))"
                        ).bind(user.id, insertedPost.id, imageUrl.trim(), imageUrl.trim()).run();
                    }
                }
            } else if (action === 'like_post') {
                const postId = formData.get('post_id');
                const existing = await env.DB.prepare(
                    "SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?"
                ).bind(postId, user.id).first();

                if (existing) {
                    await env.DB.prepare("DELETE FROM post_likes WHERE id = ?").bind(existing.id).run();
                } else {
                    await env.DB.prepare(
                        "INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)"
                    ).bind(postId, user.id).run();
                }
            } else if (action === 'add_comment') {
                const postId = formData.get('post_id');
                const commentText = String(formData.get('comment') || '').trim();
                if (commentText !== '') {
                    await env.DB.prepare(
                        "INSERT INTO post_comments (post_id, user_id, comment, created_at) VALUES (?, ?, ?, datetime('now'))"
                    ).bind(postId, user.id, commentText).run();
                }
            } else if (action === 'create_story') {
                const uploadedFile = formData.get('story_file');
                const rawMediaUrl = String(formData.get('image_url') || formData.get('media_url') || '').trim();
                const rawThumb = String(formData.get('thumb_url') || '').trim();
                const rawType = String(formData.get('media_type') || 'image').toLowerCase();
                const hasFile = uploadedFile && typeof uploadedFile === 'object' && uploadedFile.size > 0;

                let mediaUrl = '';
                let detectedType = rawType === 'video' ? 'video' : 'image';

                if (hasFile) {
                    const saved = await saveMediaAsset(request, env, {
                        folder: 'stories',
                        userId: user.id,
                        file: uploadedFile,
                        ttlSeconds: STORY_TTL_SECONDS
                    });
                    mediaUrl = saved.url;
                    if (String(saved.mimeType || uploadedFile.type || '').toLowerCase().startsWith('video/')) {
                        detectedType = 'video';
                    }
                } else if (rawMediaUrl) {
                    if (rawMediaUrl.startsWith('data:')) {
                        const saved = await saveMediaAsset(request, env, {
                            folder: 'stories',
                            userId: user.id,
                            dataUrl: rawMediaUrl,
                            ttlSeconds: STORY_TTL_SECONDS
                        });
                        mediaUrl = saved.url;
                        if (String(saved.mimeType || '').toLowerCase().startsWith('video/')) {
                            detectedType = 'video';
                        }
                    } else {
                        mediaUrl = normalizeMediaUrl(rawMediaUrl);
                    }
                }

                let thumbFinal = '';
                if (rawThumb) {
                    if (rawThumb.startsWith('data:')) {
                        const savedThumb = await saveMediaAsset(request, env, {
                            folder: 'story_thumbs',
                            userId: user.id,
                            dataUrl: rawThumb,
                            ttlSeconds: STORY_TTL_SECONDS
                        });
                        thumbFinal = savedThumb.url;
                    } else {
                        thumbFinal = normalizeMediaUrl(rawThumb);
                    }
                } else if (detectedType === 'image') {
                    thumbFinal = mediaUrl;
                }

                const durationSec = Math.min(30, Math.max(0, parseFloat(formData.get('duration_sec') || '0') || 0));

                if (mediaUrl !== '') {
                    const imageColVal = detectedType === 'image' ? mediaUrl : thumbFinal;

                    const insertedStory = await env.DB.prepare(
                        "INSERT INTO stories (user_id, image_url, media_url, thumb_url, media_type, caption, created_at) VALUES (?, ?, ?, ?, ?, '', datetime('now')) RETURNING id"
                    ).bind(user.id, imageColVal, mediaUrl, thumbFinal, detectedType).first();

                    if (insertedStory && insertedStory.id) {
                        await env.DB.prepare(
                            "INSERT INTO media_assets (user_id, owner_type, owner_id, media_type, media_url, thumb_url, duration_sec, created_at) VALUES (?, 'story', ?, ?, ?, ?, ?, datetime('now'))"
                        ).bind(user.id, insertedStory.id, detectedType, mediaUrl, thumbFinal, durationSec).run();
                    }

                    await scheduleRetention(request, env, ctx);
                }
            } else if (action === 'delete_story') {
                const storyId = formData.get('story_id');
                const targetStory = await env.DB.prepare(`
                    SELECT stories.user_id, stories.image_url, stories.media_url, stories.thumb_url,
                           ma.media_url AS ma_media_url, ma.thumb_url AS ma_thumb_url
                    FROM stories
                    LEFT JOIN media_assets ma ON ma.owner_type = 'story' AND ma.owner_id = stories.id
                    WHERE stories.id = ?
                `).bind(storyId).first();

                if (targetStory && (isCurrentStaffOrAdmin || Number(targetStory.user_id) === Number(user.id))) {
                    for (const u of [
                        targetStory.image_url, targetStory.media_url, targetStory.thumb_url,
                        targetStory.ma_media_url, targetStory.ma_thumb_url
                    ]) {
                        await deleteMediaAsset(request, env, u);
                    }
                    await env.DB.batch([
                        env.DB.prepare("DELETE FROM media_assets WHERE owner_type = 'story' AND owner_id = ?").bind(storyId),
                        env.DB.prepare("DELETE FROM stories WHERE id = ?").bind(storyId)
                    ]);
                }
            } else if (action === 'delete_post') {
                const postId = formData.get('post_id');
                const targetPost = await env.DB.prepare(`
                    SELECT posts.user_id, posts.image_url, ma.media_url AS ma_media_url
                    FROM posts
                    LEFT JOIN media_assets ma ON ma.owner_type = 'post' AND ma.owner_id = posts.id
                    WHERE posts.id = ?
                `).bind(postId).first();

                if (targetPost && (isCurrentStaffOrAdmin || Number(targetPost.user_id) === Number(user.id))) {
                    await deleteMediaAsset(request, env, targetPost.image_url);
                    await deleteMediaAsset(request, env, targetPost.ma_media_url);
                    await env.DB.batch([
                        env.DB.prepare("DELETE FROM media_assets WHERE owner_type = 'post' AND owner_id = ?").bind(postId),
                        env.DB.prepare("DELETE FROM post_likes WHERE post_id = ?").bind(postId),
                        env.DB.prepare("DELETE FROM post_comments WHERE post_id = ?").bind(postId),
                        env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(postId)
                    ]);
                }
            }

            if (request.headers.get('X-Requested-With') === 'XMLHttpRequest') {
                return new Response(JSON.stringify({ success: true }), {
                    headers: { 'Content-Type': 'application/json;charset=UTF-8' }
                });
            }
        } catch (e) {
            if (request.headers.get('X-Requested-With') === 'XMLHttpRequest') {
                return new Response(JSON.stringify({ success: false, error: e.message }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json;charset=UTF-8' }
                });
            }
        }
    } else {
        try { await ensureFeedSchema(env); } catch (e) {}
        if (urlObj.searchParams.get('story_media_id')) {
            const storyMediaId = parseInt(urlObj.searchParams.get('story_media_id'), 10);
            if (!isNaN(storyMediaId) && storyMediaId > 0) {
                try {
                    const row = await env.DB.prepare(`
                        SELECT stories.id, stories.created_at,
                               COALESCE(ma.media_url, stories.media_url, stories.image_url) AS media_url,
                               COALESCE(ma.thumb_url, stories.thumb_url, stories.image_url) AS thumb_url,
                               COALESCE(ma.media_type, stories.media_type, 'image') AS media_type
                        FROM stories
                        LEFT JOIN media_assets ma ON ma.owner_type = 'story' AND ma.owner_id = stories.id
                        WHERE stories.id = ?
                        LIMIT 1
                    `).bind(storyMediaId).first();

                    if (!row || isStoryExpired(row.created_at)) {
                        await scheduleRetention(request, env, ctx);
                        return new Response(JSON.stringify({ success: false, expired: true }), {
                            status: 404,
                            headers: { 'Content-Type': 'application/json;charset=UTF-8' }
                        });
                    }

                    return new Response(JSON.stringify({
                        success: true,
                        id: storyMediaId,
                        mediaUrl: normalizeMediaUrl(row.media_url || ''),
                        thumbUrl: normalizeMediaUrl(row.thumb_url || ''),
                        mediaType: row.media_type || 'image'
                    }), {
                        headers: {
                            'Content-Type': 'application/json;charset=UTF-8',
                            'Cache-Control': 'private, max-age=120'
                        }
                    });
                } catch (e) {
                    return new Response(JSON.stringify({ success: false, error: e.message }), {
                        status: 500,
                        headers: { 'Content-Type': 'application/json;charset=UTF-8' }
                    });
                }
            }
        }
        await scheduleRetention(request, env, ctx);
    }

    let storiesHtml = '';
    let storyViewerDataJson = '[]';
    try {
        const storyRes = await env.DB.prepare(`
            SELECT stories.id, stories.user_id, stories.created_at,
                   COALESCE(ma.thumb_url, stories.thumb_url, stories.image_url) AS resolved_thumb_url,
                   COALESCE(ma.media_type, stories.media_type, 'image') AS resolved_media_type,
                   COALESCE(ma.media_url, stories.media_url, stories.image_url) AS resolved_media_url,
                   users.username, users.display_name, users.avatar, users.role, users.is_admin, users.active_icon,
                   users.name_color, users.name_glow, users.name_border, users.name_border_glow, users.border_color, users.avatar_glow
            FROM stories
            LEFT JOIN media_assets ma ON ma.owner_type = 'story' AND ma.owner_id = stories.id
            LEFT JOIN users ON stories.user_id = users.id
            WHERE datetime(stories.created_at, '+24 hours') > datetime('now')
            ORDER BY stories.id DESC LIMIT ${MAX_ACTIVE_STORIES}
        `).all();
        const stories = storyRes.results || [];
        const fallbackAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='50' height='50'><rect width='50' height='50' fill='%23333'/></svg>";
        const fallbackVideoThumb = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='180'><rect width='120' height='180' fill='%23101820'/><text x='60' y='95' fill='%2300ff00' font-size='28' text-anchor='middle'>▶</text></svg>";

        const viewerItems = stories.map((s, idx) => {
            const detectedType = s.resolved_media_type === 'video' ? 'video' : 'image';
            const rStoryUser = renderFeedUser({
                id: s.user_id,
                username: s.username,
                display_name: s.display_name,
                avatar: s.avatar,
                role: s.role,
                is_admin: s.is_admin,
                active_icon: s.active_icon,
                name_color: s.name_color,
                name_glow: s.name_glow,
                name_border: s.name_border,
                name_border_glow: s.name_border_glow,
                border_color: s.border_color,
                avatar_glow: s.avatar_glow
            });
            const sName = s.display_name || s.username || 'Thành viên';
            const sAvatar = s.avatar || fallbackAvatar;
            return {
                index: idx,
                id: s.id,
                userId: s.user_id || 0,
                name: sName,
                nameHtml: rStoryUser.nameHtml,
                avatar: sAvatar,
                avatarStyle: rStoryUser.avatarStyle || 'border-radius: 50%; border: 2px solid #00ff00; object-fit: cover;',
                mediaUrl: normalizeMediaUrl(s.resolved_media_url || ''),
                mediaType: detectedType,
                createdAt: s.created_at || 'Vừa xong',
                canDelete: Boolean(isCurrentStaffOrAdmin || (s.user_id && Number(s.user_id) === Number(user.id)))
            };
        });
        storyViewerDataJson = JSON.stringify(viewerItems).replace(/</g, '\\u003c');

        storiesHtml = `
            <div style="display: flex; gap: 8px; overflow-x: auto; padding: 6px 0; margin-bottom: 10px; scrollbar-width: none;">
                <div onclick="openStoryModal()" style="min-width: 68px; height: 110px; background: #1a1a1a; border: 1px dashed #00ff00; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;">
                    <div style="width: 28px; height: 28px; background: #00ff00; color: #000; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 16px; margin-bottom: 4px;">+</div>
                    <div style="font-size: 9px; color: #aaa; text-align: center;">Thêm Story</div>
                    <div style="font-size: 8px; color: #777; margin-top: 2px;">${stories.length}/10 · 24h</div>
                </div>
        `;

        stories.forEach((s, idx) => {
            const isVid = s.resolved_media_type === 'video';
            const thumbSrc = normalizeMediaUrl(s.resolved_thumb_url) || (isVid ? fallbackVideoThumb : '');
            const sName = s.display_name || s.username || 'Thành viên';
            const sAvatar = s.avatar || fallbackAvatar;
            const bgStyle = thumbSrc
                ? `background: url('${escapeAttr(thumbSrc)}') center/cover no-repeat;`
                : 'background: #141414;';

            storiesHtml += `
                <div onclick="openStoryViewer(${idx})" style="min-width: 68px; height: 110px; ${bgStyle} border-radius: 8px; position: relative; border: 1px solid #444; flex-shrink: 0; overflow: hidden; padding: 4px; display: flex; flex-direction: column; justify-content: space-between; cursor: pointer;">
                    <img src="${escapeAttr(sAvatar)}" loading="lazy" style="position:relative;z-index:2;width: 22px; height: 22px; border-radius: 50%; border: 1px solid #00ff00; object-fit: cover;">
                    <div style="position:relative;z-index:2;font-size: 8px; color: #fff; background: rgba(0,0,0,0.68); padding: 2px; border-radius: 3px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${isVid ? '🎬 ' : ''}${escapeAttr(sName)}</div>
                </div>
            `;
        });
        storiesHtml += `</div>`;
    } catch (e) {
        storiesHtml = '';
    }

    let postsQuery = '';
    if (tab === 'trending') {
        postsQuery = `
            SELECT posts.*, users.username, users.display_name, users.avatar, users.border_color, users.avatar_glow,
                   users.name_color, users.name_glow, users.name_border, users.name_border_glow, users.active_icon, users.role, users.is_admin,
                   (SELECT COUNT(*) FROM post_likes WHERE post_id = posts.id) +
                   (SELECT COUNT(*) FROM post_comments WHERE post_id = posts.id) as total_interactions
            FROM posts
            JOIN users ON posts.user_id = users.id
            ORDER BY total_interactions DESC, posts.id DESC LIMIT ? OFFSET ?
        `;
    } else if (tab === 'following') {
        postsQuery = `
            SELECT posts.*, users.username, users.display_name, users.avatar, users.border_color, users.avatar_glow,
                   users.name_color, users.name_glow, users.name_border, users.name_border_glow, users.active_icon, users.role, users.is_admin
            FROM posts
            JOIN users ON posts.user_id = users.id
            WHERE posts.user_id IN (SELECT following_id FROM follows WHERE follower_id = ?)
            ORDER BY posts.id DESC LIMIT ? OFFSET ?
        `;
    } else {
        postsQuery = `
            SELECT posts.*, users.username, users.display_name, users.avatar, users.border_color, users.avatar_glow,
                   users.name_color, users.name_glow, users.name_border, users.name_border_glow, users.active_icon, users.role, users.is_admin
            FROM posts
            JOIN users ON posts.user_id = users.id
            ORDER BY posts.id DESC LIMIT ? OFFSET ?
        `;
    }

    let totalPosts = 0;
    let posts = [];
    try {
        const countStmt = tab === 'following'
            ? env.DB.prepare("SELECT COUNT(*) as total FROM posts WHERE user_id IN (SELECT following_id FROM follows WHERE follower_id = ?)").bind(user.id)
            : env.DB.prepare("SELECT COUNT(*) as total FROM posts");

        const postsStmt = tab === 'following'
            ? env.DB.prepare(postsQuery).bind(user.id, limit, offset)
            : env.DB.prepare(postsQuery).bind(limit, offset);

        const [countRes, postsRes] = await env.DB.batch([countStmt, postsStmt]);
        const firstCount = countRes && countRes.results && countRes.results[0];
        totalPosts = firstCount ? firstCount.total : 0;
        posts = (postsRes && postsRes.results) || [];
    } catch (e) {}

    const totalPages = Math.ceil(totalPosts / limit) || 1;

    let postsHtml = '';
    try {
        if (posts.length === 0) {
            postsHtml = '<div style="text-align: center; color: #777; padding: 20px;">Chưa có bài viết nào trong mục này.</div>';
        } else {
            const postIds = posts.map(p => p.id).filter(id => id !== undefined && id !== null);
            const likeCountMap = new Map();
            const likedByMeSet = new Set();
            const commentsByPostMap = new Map();

            if (postIds.length > 0) {
                const placeholders = postIds.map(() => '?').join(',');
                const [likesRes, commentsRes] = await env.DB.batch([
                    env.DB.prepare(`SELECT post_id, user_id FROM post_likes WHERE post_id IN (${placeholders})`).bind(...postIds),
                    env.DB.prepare(`
                        SELECT post_comments.*, users.username, users.display_name, users.avatar, users.border_color, users.avatar_glow,
                               users.name_color, users.name_glow, users.name_border, users.name_border_glow, users.active_icon, users.role, users.is_admin
                        FROM post_comments
                        LEFT JOIN users ON post_comments.user_id = users.id
                        WHERE post_id IN (${placeholders})
                        ORDER BY post_comments.id ASC
                    `).bind(...postIds)
                ]);

                for (const lk of ((likesRes && likesRes.results) || [])) {
                    likeCountMap.set(lk.post_id, (likeCountMap.get(lk.post_id) || 0) + 1);
                    if (Number(lk.user_id) === Number(user.id)) {
                        likedByMeSet.add(lk.post_id);
                    }
                }

                for (const cm of ((commentsRes && commentsRes.results) || [])) {
                    if (!commentsByPostMap.has(cm.post_id)) commentsByPostMap.set(cm.post_id, []);
                    commentsByPostMap.get(cm.post_id).push(cm);
                }
            }

            for (let p of posts) {
                const rUser = renderFeedUser({
                    ...p,
                    id: p.user_id
                });
                const likeCount = likeCountMap.get(p.id) || 0;
                const heartColor = likedByMeSet.has(p.id) ? '#ff3333' : '#888';
                const comments = commentsByPostMap.get(p.id) || [];

                let commentsHtml = '';
                comments.forEach(c => {
                    const rCommentUser = renderFeedUser({
                        ...c,
                        id: c.user_id
                    });
                    commentsHtml += `
                        <div style="font-size: 11px; margin-top: 4px; border-top: 1px solid #222; padding-top: 4px;">
                            ${rCommentUser.nameHtml}: <span style="color: #ddd;">${c.comment}</span>
                        </div>
                    `;
                });

                const imgSrc = normalizeMediaUrl(p.image_url);
                const imageTag = imgSrc
                    ? `<div style="margin-top: 8px; background: #000; text-align: center; border-radius: 4px; overflow: hidden;"><img src="${escapeAttr(imgSrc)}" loading="lazy" style="width: 100%; max-height: 450px; object-fit: contain; display: block; margin: 0 auto;"></div>`
                    : '';

                const canDelete = isCurrentStaffOrAdmin || Number(p.user_id) === Number(user.id);
                const deleteBtnHtml = canDelete ? `
                    <form onsubmit="deletePostAjax(event, ${p.id})" style="margin: 0;">
                        <input type="hidden" name="action" value="delete_post">
                        <input type="hidden" name="post_id" value="${p.id}">
                        <button type="submit" style="background: none; border: none; color: #ff5555; cursor: pointer; font-size: 11px;" title="Xóa bài viết">🗑️ Xóa</button>
                    </form>
                ` : '';

                postsHtml += `
                <div id="post-card-${p.id}" style="background: #121212; border: 1px solid #2c2c2c; border-radius: 6px; padding: 12px; margin-bottom: 12px;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div style="width: 36px; height: 36px; min-width: 36px; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center;">
                                ${rUser.avatarHtml.replace(/style="[^"]*"/gi, 'style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover;"')}
                            </div>
                            <div>
                                <div>${rUser.nameHtml}</div>
                                <div style="font-size: 10px; color: #888; margin-top: 2px;">${p.created_at || ''}</div>
                            </div>
                        </div>
                        ${deleteBtnHtml}
                    </div>
                    <div style="color: #ddd; font-size: 13px; word-break: break-word; white-space: pre-wrap; margin-bottom: 6px;">${p.content || ''}</div>
                    ${imageTag}

                    <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid #222; margin-top: 10px; padding-top: 8px;">
                        <div style="display: flex; align-items: center; gap: 14px;">
                            <form onsubmit="submitAjax(event, this)" style="margin: 0;">
                                <input type="hidden" name="action" value="like_post">
                                <input type="hidden" name="post_id" value="${p.id}">
                                <button type="submit" style="background: none; border: none; color: ${heartColor}; cursor: pointer; font-size: 14px; padding: 0;">
                                    ❤️ <span style="font-size: 11px; color: #ccc;" id="like-count-${p.id}">${likeCount}</span>
                                </button>
                            </form>

                            <button type="button" onclick="toggleCommentBox(${p.id})" style="background: none; border: none; color: #aaa; cursor: pointer; font-size: 13px; padding: 0; display: flex; align-items: center; gap: 4px;">
                                💬 <span style="font-size: 11px;" id="comm-count-${p.id}">${comments.length}</span> bình luận
                            </button>
                        </div>
                        <span style="font-size: 10px; color: #666;">Tương tác</span>
                    </div>

                    <div style="margin-top: 6px;" id="comment-list-${p.id}">
                        ${commentsHtml}
                    </div>

                    <div id="comment-box-${p.id}" style="display: none; margin-top: 8px;">
                        <form onsubmit="submitCommentAjax(event, ${p.id})" style="display: flex; gap: 6px;">
                            <input type="hidden" name="action" value="add_comment">
                            <input type="hidden" name="post_id" value="${p.id}">
                            <input type="text" name="comment" id="comment-input-${p.id}" placeholder="Viết bình luận của bạn..." style="flex: 1; background: #0a0a0a; color: #fff; border: 1px solid #333; padding: 6px; font-size: 11px; border-radius: 4px;" required>
                            <button type="submit" style="background: #0055ff; color: #fff; border: none; padding: 6px 12px; font-size: 11px; border-radius: 4px; cursor: pointer;">Gửi</button>
                        </form>
                    </div>
                </div>`;
            }
        }
    } catch (e) {}
