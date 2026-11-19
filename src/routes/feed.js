import { renderUser } from '../worker.js';
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

                const isManager = (user.role && user.role !== 'Thành Viên');
                if (targetStory && (isManager || targetStory.user_id === user.id)) {
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
                const isManager = (user.role && user.role !== 'Thành Viên');

                if (targetPost && (isManager || targetPost.user_id === user.id)) {
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
        const isManager = (user.role && user.role !== 'Thành Viên');
        const fallbackAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='50' height='50'><rect width='50' height='50' fill='%23333'/></svg>";
        const fallbackVideoThumb = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='180'><rect width='120' height='180' fill='%23101820'/><text x='60' y='95' fill='%2300ff00' font-size='28' text-anchor='middle'>▶</text></svg>";

        const viewerItems = stories.map((s, idx) => {
            const detectedType = s.resolved_media_type === 'video' ? 'video' : 'image';
            const rStoryUser = renderUser({
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
                canDelete: Boolean(isManager || (s.user_id && s.user_id === user.id))
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

            const isUserAdmin = (user.role && user.role !== 'Thành Viên');

            for (let p of posts) {
                const rUser = renderUser(p);
                const likeCount = likeCountMap.get(p.id) || 0;
                const heartColor = likedByMeSet.has(p.id) ? '#ff3333' : '#888';
                const comments = commentsByPostMap.get(p.id) || [];

                let commentsHtml = '';
                comments.forEach(c => {
                    const rCommentUser = renderUser(c);
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

                const canDelete = isUserAdmin || p.user_id === user.id;
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

    let paginationHtml = '';
    if (totalPages > 1) {
        paginationHtml = `<div style="display: flex; justify-content: center; align-items: center; gap: 6px; margin: 15px 0; font-size: 12px;">`;
        if (page > 1) {
            paginationHtml += `<a href="?tab=${tab}&page=${page - 1}" style="background: #1a1a1a; color: #00ff00; border: 1px solid #444; padding: 4px 10px; border-radius: 4px; text-decoration: none;">« Trước</a>`;
        }
        for (let i = 1; i <= totalPages; i++) {
            if (i === page) {
                paginationHtml += `<span style="background: #00ff00; color: #000; font-weight: bold; padding: 4px 10px; border-radius: 4px;">${i}</span>`;
            } else {
                paginationHtml += `<a href="?tab=${tab}&page=${i}" style="background: #1a1a1a; color: #ccc; border: 1px solid #444; padding: 4px 10px; border-radius: 4px; text-decoration: none;">${i}</a>`;
            }
        }
        if (page < totalPages) {
            paginationHtml += `<a href="?tab=${tab}&page=${page + 1}" style="background: #1a1a1a; color: #00ff00; border: 1px solid #444; padding: 4px 10px; border-radius: 4px; text-decoration: none;">Sau »</a>`;
        }
        paginationHtml += `</div>`;
    }

    const newColor = (tab === 'new') ? '#00ff00' : '#aaa';
    const trendingColor = (tab === 'trending') ? '#00ff00' : '#aaa';
    const followingColor = (tab === 'following') ? '#00ff00' : '#aaa';

    const content = `
    <div class="box">
        <div class="box-title" style="display: flex; justify-content: space-between; align-items: center;">
            <span>📰 Bảng tin cộng đồng</span>
            <div style="font-size: 10px;">
                <a href="?tab=new" style="color: ${newColor}; margin-right: 6px; text-decoration: none; font-weight: ${tab==='new'?'bold':'normal'};">Mới nhất</a>
                <a href="?tab=trending" style="color: ${trendingColor}; margin-right: 6px; text-decoration: none; font-weight: ${tab==='trending'?'bold':'normal'};">Đề xuất</a>
                <a href="?tab=following" style="color: ${followingColor}; text-decoration: none; font-weight: ${tab==='following'?'bold':'normal'};">Theo dõi</a>
            </div>
        </div>
        <div class="box-content">
            ${storiesHtml}
            <form onsubmit="submitPostAjax(event, this)">
                <input type="hidden" name="action" value="create_post">
                <textarea name="content" rows="2" placeholder="Bạn đang nghĩ gì thế..." style="width: 100%; background: #141414; color: #00ff00; border: 1px solid #444; padding: 8px; border-radius: 4px; box-sizing: border-box; font-size: 13px; resize: vertical;"></textarea>

                <div style="margin-top: 6px; display: flex; align-items: center; gap: 8px;">
                    <label style="display: inline-flex; align-items: center; gap: 6px; background: #1a1a1a; border: 1px solid #444; color: #00ff00; padding: 5px 12px; border-radius: 4px; font-size: 11px; font-weight: bold; cursor: pointer;">
                        📷 Thêm ảnh
                        <input type="file" name="post_file" accept="image/*" onchange="compressAndSetImage(this, '#post-image-val')" style="display: none;">
                    </label>
                    <input type="hidden" id="post-image-val" name="image_url">
                    <div id="post-compress-status" style="font-size: 10px; color: #aaa;"></div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                    <button type="submit" class="btn" style="background: #00aa00; color: #fff; padding: 6px 16px; border-radius: 4px; cursor: pointer;">Đăng bài</button>
                </div>
            </form>
        </div>
    </div>

    <div id="story-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.88); z-index: 999; justify-content: center; align-items: center; padding: 10px; box-sizing: border-box;">
        <div style="background: #111; border: 1px solid #444; width: 100%; max-width: 360px; padding: 12px; box-sizing: border-box; border-radius: 6px; max-height: 92vh; overflow-y: auto;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 6px; margin-bottom: 10px;">
                <b style="color: #00ff00; font-size: 12px;">📸 Đăng Story</b>
                <button type="button" onclick="closeStoryModal()" style="background:none; border:none; color:#ff5555; font-weight:bold; cursor:pointer;">✕</button>
            </div>
            <form id="story-create-form" method="POST" enctype="multipart/form-data" onsubmit="return handleStoryFormSubmit(event)">
                <input type="hidden" name="action" value="create_story">
                <input type="hidden" id="story-image-val" name="image_url">
                <input type="hidden" id="story-thumb-val" name="thumb_url">
                <input type="hidden" id="story-media-type-val" name="media_type" value="image">
                <input type="hidden" id="story-duration-val" name="duration_sec" value="0">
                <div style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px; flex-wrap: nowrap;">
                    <label style="display: inline-flex; align-items: center; gap: 6px; background: #1a1a1a; border: 1px solid #444; color: #00ff00; padding: 6px 12px; border-radius: 4px; font-size: 11px; font-weight: bold; cursor: pointer; flex-shrink: 0;">
                        🎬 Chọn ảnh hoặc video
                        <input type="file" id="story-file-input" name="story_file" accept="image/*,video/*" onchange="handleStoryMediaSelect(this)" style="display: none;">
                    </label>
                    <div id="story-compress-status" style="font-size: 11px; color: #00ff00; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"></div>
                </div>

                <div id="story-progress-wrap" style="display: none; margin-bottom: 10px; background: #181818; border: 1px solid #333; border-radius: 5px; padding: 6px 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #ccc; margin-bottom: 4px;">
                        <span id="story-progress-label">Đang đăng tải</span>
                        <span id="story-progress-pct" style="color: #00ff00; font-weight: bold;">0%</span>
                    </div>
                    <div style="width: 100%; height: 7px; background: #090909; border-radius: 4px; overflow: hidden;">
                        <div id="story-progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #00aa00, #00ff88); transition: width 0.18s ease;"></div>
                    </div>
                </div>

                <button type="submit" id="story-submit-btn" class="btn" style="width: 100%; background: #0055ff; color: #fff; padding: 8px; font-size: 12px; border: none; border-radius: 4px; cursor: pointer;">Đăng Story</button>
            </form>
        </div>
    </div>

    <div id="story-viewer-modal" onclick="handleStoryBackdropClick(event)" style="display: none; position: fixed; inset: 0; background: #0b0b0d; z-index: 10000; flex-direction: column; justify-content: space-between; user-select: none;">
        <div style="position: relative; z-index: 3; display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: linear-gradient(to bottom, rgba(0,0,0,0.82), rgba(0,0,0,0));">
            <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
                <img id="sv-avatar" src="" style="width: 38px; height: 38px; border-radius: 50%; border: 2px solid #00ff00; object-fit: cover; flex-shrink: 0;">
                <div style="min-width: 0;">
                    <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                        <span id="sv-name" style="color: #fff; font-weight: bold; font-size: 14px; text-shadow: 0 1px 4px #000;"></span>
                    </div>
                    <div style="font-size: 11px; color: #ccc; text-shadow: 0 1px 3px #000;">
                        <span id="sv-time"></span>
                    </div>
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                <button type="button" id="sv-delete-btn" onclick="deleteCurrentStory()" style="display: none; background: rgba(255, 68, 68, 0.22); border: 1px solid #ff5555; color: #ff8888; border-radius: 50%; width: 32px; height: 32px; font-size: 13px; cursor: pointer; align-items: center; justify-content: center;" title="Xóa Story">🗑</button>
                <button type="button" onclick="closeStoryViewer()" style="background: rgba(255,255,255,0.14); border: 1px solid rgba(255,255,255,0.25); color: #fff; border-radius: 50%; width: 32px; height: 32px; font-size: 16px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center;" title="Đóng">✕</button>
            </div>
        </div>

        <div style="position: relative; flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 8px 0;">
            <button type="button" onclick="prevStory()" style="position: absolute; left: 8px; top: 50%; transform: translateY(-50%); z-index: 3; background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.2); color: #fff; width: 32px; height: 48px; border-radius: 8px; font-size: 18px; cursor: pointer;">‹</button>
            <img id="sv-image" src="" alt="Story" style="display: none; max-width: 82vw; max-height: 44vh; width: auto; height: auto; object-fit: contain; border-radius: 8px;">
            <video id="sv-video" controls autoplay playsinline loop style="display: none; max-width: 300px; width: 78vw; max-height: 40vh; height: auto; object-fit: contain; border-radius: 8px; background: #000;"></video>
            <button type="button" onclick="nextStory()" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); z-index: 3; background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.2); color: #fff; width: 32px; height: 48px; border-radius: 8px; font-size: 18px; cursor: pointer;">›</button>
        </div>

        <div style="position: relative; z-index: 3; padding: 10px 12px 16px; background: linear-gradient(to top, rgba(0,0,0,0.92), rgba(0,0,0,0));">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; max-width: 640px; margin: 0 auto;">
                <div style="display: flex; align-items: center; gap: 4px; background: rgba(24,24,28,0.9); border: 1px solid #333; padding: 5px 8px; border-radius: 22px; flex-shrink: 0;">
                    <button type="button" onclick="sendStoryReaction('👍')" style="background:none;border:none;font-size:17px;cursor:pointer;padding:0 2px;">👍</button>
                    <button type="button" onclick="sendStoryReaction('❤️')" style="background:none;border:none;font-size:17px;cursor:pointer;padding:0 2px;">❤️</button>
                    <button type="button" onclick="sendStoryReaction('😂')" style="background:none;border:none;font-size:17px;cursor:pointer;padding:0 2px;">😂</button>
                    <button type="button" onclick="sendStoryReaction('😮')" style="background:none;border:none;font-size:17px;cursor:pointer;padding:0 2px;">😮</button>
                    <button type="button" onclick="sendStoryReaction('😢')" style="background:none;border:none;font-size:17px;cursor:pointer;padding:0 2px;">😢</button>
                    <button type="button" onclick="sendStoryReaction('😡')" style="background:none;border:none;font-size:17px;cursor:pointer;padding:0 2px;">😡</button>
                </div>

                <form onsubmit="sendStoryMessage(event)" style="display: flex; align-items: center; flex: 1; background: rgba(32,34,42,0.92); border: 1px solid #3a3d4a; border-radius: 22px; padding: 3px 6px 3px 12px; min-width: 0;">
                    <input type="text" id="sv-msg-input" placeholder="Gửi tin nhắn..." style="flex: 1; min-width: 0; background: transparent; border: none; color: #fff; font-size: 13px; outline: none; padding: 6px 4px;">
                    <button type="submit" style="background: rgba(255,255,255,0.12); border: none; color: #7aa2ff; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;" title="Gửi tin nhắn">➤</button>
                </form>
            </div>
            <div id="sv-feedback" style="text-align: center; font-size: 11px; color: #00ff00; margin-top: 6px; min-height: 14px;"></div>
        </div>
    </div>

    <script>
        const STORY_VIEWER_LIST = ${storyViewerDataJson};
        const STORY_MEDIA_CACHE = {};
        const MAX_STORY_BYTES = 3 * 1024 * 1024;
        const CHUNK_SIZE_BYTES = 1048576;
        const MERGE_BATCH_SIZE = 4;
        let currentStoryIndex = -1;
        let isSubmittingStory = false;
        let preparedStoryBlob = null;

        function setStoryProgress(pct, labelText) {
            const wrap = document.getElementById('story-progress-wrap');
            const bar = document.getElementById('story-progress-bar');
            const pctEl = document.getElementById('story-progress-pct');
            const lblEl = document.getElementById('story-progress-label');
            const clamped = Math.max(0, Math.min(100, Math.round(pct || 0)));

            if (wrap) wrap.style.display = 'block';
            if (bar) bar.style.width = clamped + '%';
            if (pctEl) pctEl.innerText = clamped + '%';
            if (lblEl && labelText) lblEl.innerText = labelText;
        }

        function hideStoryProgress() {
            const wrap = document.getElementById('story-progress-wrap');
            const bar = document.getElementById('story-progress-bar');
            const pctEl = document.getElementById('story-progress-pct');
            if (wrap) wrap.style.display = 'none';
            if (bar) bar.style.width = '0%';
            if (pctEl) pctEl.innerText = '0%';
        }

        function formatKb(bytes) {
            if (!bytes || bytes <= 0) return '';
            return bytes >= 1048576
                ? (bytes / 1048576).toFixed(2) + 'MB'
                : Math.max(1, Math.round(bytes / 1024)) + 'KB';
        }

        function setStoryReadyText(blobOrFile, hasAudio) {
            const statusEl = document.getElementById('story-compress-status');
            if (statusEl) {
                const sz = blobOrFile && blobOrFile.size ? ' (' + formatKb(blobOrFile.size) + ')' : '';
                statusEl.innerText = (hasAudio ? 'Sẵn sàng · có tiếng' : 'Sẵn sàng') + sz;
                statusEl.style.color = '#00ff00';
            }
        }

        function extractQuickThumbnail(file) {
            return new Promise((resolve) => {
                let objUrl = '';
                try {
                    objUrl = URL.createObjectURL(file);
                    const v = document.createElement('video');
                    v.muted = true;
                    v.playsInline = true;
                    v.preload = 'metadata';
                    v.src = objUrl;
                    let settled = false;
                    const finish = (val) => {
                        if (!settled) {
                            settled = true;
                            try { URL.revokeObjectURL(objUrl); } catch (e) {}
                            resolve(val || '');
                        }
                    };
                    const timer = setTimeout(() => finish(''), 400);

                    v.onloadeddata = function() {
                        try { v.currentTime = 0.01; } catch (e) { clearTimeout(timer); finish(''); }
                    };
                    v.onseeked = function() {
                        clearTimeout(timer);
                        try {
                            const c = document.createElement('canvas');
                            c.width = 80;
                            c.height = 120;
                            const ctx = c.getContext('2d');
                            ctx.drawImage(v, 0, 0, c.width, c.height);
                            finish(c.toDataURL('image/jpeg', 0.25));
                        } catch (e) {
                            finish('');
                        }
                    };
                    v.onerror = () => {
                        clearTimeout(timer);
                        finish('');
                    };
                } catch (e) {
                    if (objUrl) { try { URL.revokeObjectURL(objUrl); } catch (err) {} }
                    resolve('');
                }
            });
        }

        async function recordVideoPass(file, opts, onProgress) {
            if (!file || typeof MediaRecorder === 'undefined' || typeof document.createElement('canvas').captureStream !== 'function') {
                return null;
            }
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return null;

            const candidateMimes = [
                'video/webm;codecs=vp8,opus',
                'video/webm;codecs=vp9,opus',
                'video/mp4;codecs=avc1,mp4a.40.2',
                'video/webm'
            ];
            const supportedMime = candidateMimes.find(m => {
                try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; }
            });
            if (!supportedMime) return null;

            let objUrl = '';
            let audioCtx = null;
            try {
                objUrl = URL.createObjectURL(file);
                const video = document.createElement('video');
                video.muted = false;
                video.volume = 1;
                video.playsInline = true;
                video.preload = 'auto';
                video.src = objUrl;

                await new Promise((resolve, reject) => {
                    const t = setTimeout(() => reject(new Error('timeout')), 3000);
                    video.onloadedmetadata = () => { clearTimeout(t); resolve(); };
                    video.onerror = () => { clearTimeout(t); reject(new Error('load error')); };
                });

                audioCtx = new AudioCtx();
                if (audioCtx.state === 'suspended') {
                    await audioCtx.resume().catch(() => {});
                }
                const sourceNode = audioCtx.createMediaElementSource(video);
                const destNode = audioCtx.createMediaStreamDestination();
                sourceNode.connect(destNode);

                const audioTracks = destNode.stream.getAudioTracks();
                if (!audioTracks || audioTracks.length === 0) {
                    try { await audioCtx.close(); } catch (e) {}
                    try { URL.revokeObjectURL(objUrl); } catch (e) {}
                    return null;
                }

                const maxDim = opts.maxDim || 320;
                const fps = opts.fps || 14;
                const maxRecordMs = opts.maxRecordMs || 15000;

                let w = video.videoWidth || 240;
                let h = video.videoHeight || 320;
                if (w > maxDim || h > maxDim) {
                    if (w >= h) {
                        h = Math.max(80, Math.round((h * maxDim) / w));
                        w = maxDim;
                    } else {
                        w = Math.max(80, Math.round((w * maxDim) / h));
                        h = maxDim;
                    }
                }
                if (w % 2 !== 0) w -= 1;
                if (h % 2 !== 0) h -= 1;

                const rawDurationSec = (video.duration && isFinite(video.duration) && video.duration > 0)
                    ? Math.min(video.duration, maxRecordMs / 1000)
                    : (maxRecordMs / 1000);
                const safeDurationSec = Math.max(1.5, rawDurationSec);

                const budgetBytes = MAX_STORY_BYTES * 0.90;
                const audioBps = opts.audioBps || 32000;
                const totalBitsBudget = budgetBytes * 8;
                const videoBps = Math.max(
                    120000,
                    Math.min(opts.maxVideoBps || 600000, Math.floor((totalBitsBudget / safeDurationSec) - audioBps))
                );

                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                const canvasStream = canvas.captureStream(fps);

                const combinedStream = new MediaStream([
                    ...canvasStream.getVideoTracks(),
                    ...audioTracks
                ]);

                const chunks = [];
                let recorder;
                try {
                    recorder = new MediaRecorder(combinedStream, {
                        mimeType: supportedMime,
                        videoBitsPerSecond: videoBps,
                        audioBitsPerSecond: audioBps
                    });
                } catch (e) {
                    recorder = new MediaRecorder(combinedStream, { mimeType: supportedMime });
                }

                recorder.ondataavailable = (ev) => {
                    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
                };

                let stopped = false;
                let rafId = null;

                const stopRecording = () => {
                    if (stopped) return;
                    stopped = true;
                    if (rafId) cancelAnimationFrame(rafId);
                    try { if (recorder.state !== 'inactive') recorder.stop(); } catch (e) {}
                    try { video.pause(); } catch (e) {}
                };

                const hardTimeout = setTimeout(stopRecording, Math.min(maxRecordMs, safeDurationSec * 1000 + 500));

                const donePromise = new Promise((resolve) => {
                    recorder.onstop = () => {
                        clearTimeout(hardTimeout);
                        resolve(new Blob(chunks, { type: supportedMime }));
                    };
                });

                recorder.start(250);
                video.currentTime = 0;
                await video.play().catch(() => {});

                const drawFrame = () => {
                    if (stopped || video.ended || video.paused) {
                        stopRecording();
                        return;
                    }
                    try {
                        ctx.drawImage(video, 0, 0, w, h);
                        if (onProgress) {
                            const ratio = (video.duration && isFinite(video.duration) && video.duration > 0)
                                ? Math.min(1, video.currentTime / video.duration)
                                : Math.min(1, (video.currentTime * 1000) / maxRecordMs);
                            onProgress(ratio);
                        }
                    } catch (e) {}
                    rafId = requestAnimationFrame(drawFrame);
                };

                video.onended = stopRecording;
                rafId = requestAnimationFrame(drawFrame);

                const outBlob = await donePromise;
                try { if (audioCtx) await audioCtx.close(); } catch (e) {}
                try { URL.revokeObjectURL(objUrl); } catch (e) {}

                return outBlob && outBlob.size > 256 ? outBlob : null;
            } catch (e) {
                try { if (audioCtx) await audioCtx.close(); } catch (err) {}
                if (objUrl) { try { URL.revokeObjectURL(objUrl); } catch (err) {} }
                return null;
            }
        }

        async function enforceUnder3MBVideo(file, onProgress) {
            let bestBlob = await recordVideoPass(file, {
                maxDim: 320,
                fps: 14,
                maxVideoBps: 550000,
                audioBps: 32000,
                maxRecordMs: 15000
            }, (ratio) => {
                if (onProgress) onProgress(Math.min(0.75, ratio * 0.75));
            });

            if (!bestBlob || bestBlob.size > MAX_STORY_BYTES) {
                const sourceForPass2 = (bestBlob && bestBlob.size > 256) ? bestBlob : file;
                const pass2Blob = await recordVideoPass(sourceForPass2, {
                    maxDim: 240,
                    fps: 10,
                    maxVideoBps: 260000,
                    audioBps: 24000,
                    maxRecordMs: 10000
                }, (ratio) => {
                    if (onProgress) onProgress(0.75 + Math.min(0.25, ratio * 0.25));
                });

                if (pass2Blob && (!bestBlob || pass2Blob.size < bestBlob.size)) {
                    bestBlob = pass2Blob;
                }
            }

            if (bestBlob && bestBlob.size > 0 && bestBlob.size <= MAX_STORY_BYTES) {
                return bestBlob;
            }
            if (bestBlob && file.size > 0 && bestBlob.size < file.size) {
                return bestBlob;
            }
            return file.size <= MAX_STORY_BYTES ? file : (bestBlob || file);
        }

        async function fetchWithRetry(url, options, maxRetries = 5) {
            let lastError = null;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    const res = await fetch(url, options);
                    if (res.ok) {
                        const data = await res.json().catch(() => null);
                        if (data && data.success !== false) {
                            return data;
                        }
                        lastError = new Error((data && data.error) || 'Phản hồi máy chủ không thành công');
                    } else {
                        const errData = await res.json().catch(() => null);
                        lastError = new Error((errData && errData.error) || ('HTTP ' + res.status));
                    }
                } catch (err) {
                    lastError = err;
                }
                if (attempt < maxRetries) {
                    await new Promise(r => setTimeout(r, 400 * attempt));
                }
            }
            throw lastError || new Error('Tải lên thất bại sau nhiều lần thử.');
        }

        async function uploadBlobInChunks(blob, folder, mimeType, statusEl) {
            const totalChunks = Math.max(1, Math.ceil(blob.size / CHUNK_SIZE_BYTES));
            const uploadId = 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);

            for (let i = 0; i < totalChunks; i++) {
                const start = i * CHUNK_SIZE_BYTES;
                const end = Math.min(blob.size, start + CHUNK_SIZE_BYTES);
                const chunkBlob = blob.slice(start, end);
                const pct = 35 + Math.round(((i + 1) / totalChunks) * 50);

                if (statusEl) {
                    statusEl.innerText = 'Đang tải ' + pct + '%';
                    statusEl.style.color = '#ffcc00';
                }
                setStoryProgress(pct, 'Đang tải lên (' + (i + 1) + '/' + totalChunks + ')');

                const fd = new FormData();
                fd.append('action', 'upload_media_chunk');
                fd.append('upload_id', uploadId);
                fd.append('chunk_index', String(i));
                fd.append('chunk', chunkBlob);

                await fetchWithRetry(window.location.href, {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: fd
                }, 5);
            }

            let cursor = 0;
            let currentUrl = '';
            while (cursor < totalChunks) {
                const mergePct = 85 + Math.round((cursor / totalChunks) * 10);
                if (statusEl) {
                    statusEl.innerText = 'Đang ghép ' + mergePct + '%';
                    statusEl.style.color = '#ffcc00';
                }
                setStoryProgress(mergePct, 'Đang ghép video');

                const finFd = new FormData();
                finFd.append('action', 'finalize_media_upload');
                finFd.append('upload_id', uploadId);
                finFd.append('start_chunk', String(cursor));
                finFd.append('batch_size', String(MERGE_BATCH_SIZE));
                finFd.append('total_chunks', String(totalChunks));
                finFd.append('existing_url', currentUrl);
                finFd.append('folder', folder);
                finFd.append('mime_type', mimeType || blob.type || 'video/mp4');

                const stepRes = await fetchWithRetry(window.location.href, {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: finFd
                }, 5);

                if (!stepRes || !stepRes.url) {
                    throw new Error('Không nhận được đường dẫn media khi ghép.');
                }
                currentUrl = stepRes.url;
                cursor = typeof stepRes.nextChunk === 'number' ? stepRes.nextChunk : (cursor + MERGE_BATCH_SIZE);
                if (stepRes.done) break;
            }

            return currentUrl;
        }

        function updateSoundButtonState() {
            const vidEl = document.getElementById('sv-video');
            const soundBtn = document.getElementById('sv-sound-btn');
            if (!vidEl || !soundBtn || vidEl.style.display === 'none') {
                if (soundBtn) soundBtn.style.display = 'none';
                return;
            }
        }

        function toggleStorySound() {
            const vidEl = document.getElementById('sv-video');
            if (!vidEl) return;
            vidEl.muted = !vidEl.muted;
            vidEl.volume = 1;
            vidEl.play().catch(() => {});
            updateSoundButtonState();
        }

        async function openStoryViewer(idx) {
            if (!Array.isArray(STORY_VIEWER_LIST) || idx < 0 || idx >= STORY_VIEWER_LIST.length) return;
            currentStoryIndex = idx;
            const item = STORY_VIEWER_LIST[idx];

            const avEl = document.getElementById('sv-avatar');
            avEl.src = item.avatar || '';
            if (item.avatarStyle) {
                avEl.setAttribute('style', item.avatarStyle + ' width: 38px; height: 38px; flex-shrink: 0;');
            }
            const nameEl = document.getElementById('sv-name');
            if (item.nameHtml) {
                nameEl.innerHTML = item.nameHtml;
            } else {
                nameEl.innerText = item.name || 'Thành viên';
            }
            document.getElementById('sv-time').innerText = item.createdAt || 'Vừa xong';
            document.getElementById('sv-feedback').innerText = '';
            document.getElementById('sv-msg-input').value = '';

            const imgEl = document.getElementById('sv-image');
            const vidEl = document.getElementById('sv-video');
            const delBtn = document.getElementById('sv-delete-btn');
            const soundBtn = document.getElementById('sv-sound-btn');
            delBtn.style.display = item.canDelete ? 'flex' : 'none';

            document.getElementById('story-viewer-modal').style.display = 'flex';

            if (item.mediaType === 'video') {
                imgEl.style.display = 'none';
                imgEl.src = '';
                vidEl.style.display = 'block';
                vidEl.muted = false;
                vidEl.volume = 1;
                vidEl.src = '';
                if (soundBtn) soundBtn.style.display = 'inline-flex';

                const resolvedUrl = item.mediaUrl || STORY_MEDIA_CACHE[item.id] || '';
                if (currentStoryIndex === idx && resolvedUrl) {
                    vidEl.src = resolvedUrl;
                    vidEl.play().then(() => {
                        updateSoundButtonState();
                    }).catch(() => {
                        vidEl.muted = true;
                        vidEl.play().catch(() => {});
                        updateSoundButtonState();
                    });
                }
            } else {
                vidEl.pause();
                vidEl.style.display = 'none';
                vidEl.src = '';
                if (soundBtn) soundBtn.style.display = 'none';
                imgEl.src = item.mediaUrl || '';
                imgEl.style.display = 'block';
            }
        }

        function closeStoryViewer() {
            const vidEl = document.getElementById('sv-video');
            if (vidEl) {
                vidEl.pause();
                vidEl.src = '';
            }
            document.getElementById('story-viewer-modal').style.display = 'none';
            currentStoryIndex = -1;
        }

        function handleStoryBackdropClick(e) {
            if (e.target && e.target.id === 'story-viewer-modal') {
                closeStoryViewer();
            }
        }

        function prevStory() {
            if (!STORY_VIEWER_LIST.length) return;
            const nextIdx = currentStoryIndex > 0 ? currentStoryIndex - 1 : STORY_VIEWER_LIST.length - 1;
            openStoryViewer(nextIdx);
        }

        function nextStory() {
            if (!STORY_VIEWER_LIST.length) return;
            const nextIdx = currentStoryIndex < STORY_VIEWER_LIST.length - 1 ? currentStoryIndex + 1 : 0;
            openStoryViewer(nextIdx);
        }

        function sendStoryReaction(emoji) {
            const item = STORY_VIEWER_LIST[currentStoryIndex];
            if (!item) return;
            const fb = document.getElementById('sv-feedback');
            fb.innerText = 'Đã thả ' + emoji + ' cho Story của ' + item.name;
        }

        function sendStoryMessage(e) {
            e.preventDefault();
            const item = STORY_VIEWER_LIST[currentStoryIndex];
            const input = document.getElementById('sv-msg-input');
            const text = (input.value || '').trim();
            if (!item || !text) return;

            if (item.userId) {
                window.location.href = '/mail/chat?user=' + encodeURIComponent(item.userId) + '&msg=' + encodeURIComponent('[Story] ' + text);
            } else {
                document.getElementById('sv-feedback').innerText = 'Đã chuẩn bị tin nhắn: ' + text;
                input.value = '';
            }
        }

        async function deleteCurrentStory() {
            const item = STORY_VIEWER_LIST[currentStoryIndex];
            if (!item || !item.id) return;
            if (!confirm('Xóa Story này?')) return;

            const formData = new FormData();
            formData.append('action', 'delete_story');
            formData.append('story_id', item.id);

            try {
                await fetch(window.location.href, {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: formData
                });
                window.location.reload();
            } catch (e) {
                window.location.reload();
            }
        }

        function openStoryModal() {
            resetStoryForm();
            document.getElementById('story-modal').style.display = 'flex';
        }

        function closeStoryModal() {
            document.getElementById('story-modal').style.display = 'none';
        }

        function resetStoryForm() {
            isSubmittingStory = false;
            preparedStoryBlob = null;
            hideStoryProgress();
            const submitBtn = document.getElementById('story-submit-btn');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = 'Đăng Story';
            }
            document.getElementById('story-image-val').value = '';
            document.getElementById('story-thumb-val').value = '';
            document.getElementById('story-media-type-val').value = 'image';
            document.getElementById('story-duration-val').value = '0';
            document.getElementById('story-compress-status').innerText = '';
            document.getElementById('story-compress-status').style.color = '#00ff00';
            const fi = document.getElementById('story-file-input');
            if (fi) fi.value = '';
        }

        async function handleStoryMediaSelect(fileInput) {
            const file = fileInput.files && fileInput.files[0];
            const statusEl = document.getElementById('story-compress-status');
            if (!file) return;

            preparedStoryBlob = null;
            hideStoryProgress();

            const isVideoFile = (file.type && file.type.startsWith('video/')) ||
                /\.(mp4|mov|webm|mkv|avi|m4v|3gp|ogg|ogv|ts|mts)$/i.test(file.name || '');

            if (isVideoFile) {
                document.getElementById('story-media-type-val').value = 'video';
                document.getElementById('story-image-val').value = '';
                document.getElementById('story-thumb-val').value = '';

                extractQuickThumbnail(file).then((thumb) => {
                    if (thumb && !document.getElementById('story-thumb-val').value) {
                        document.getElementById('story-thumb-val').value = thumb;
                    }
                });

                if (statusEl) {
                    statusEl.innerText = 'Đăng đi nà!';
                    statusEl.style.color = '#ffcc00';
                }

                preparedStoryBlob = await enforceUnder3MBVideo(file);
                setStoryReadyText(preparedStoryBlob, true);
            } else {
                document.getElementById('story-media-type-val').value = 'image';
                document.getElementById('story-duration-val').value = '0';
                compressAndSetImage(fileInput, '#story-image-val', 480, 0.55);
            }
        }

        async function handleStoryFormSubmit(e) {
            e.preventDefault();
            if (isSubmittingStory) return false;

            const statusEl = document.getElementById('story-compress-status');
            const submitBtn = document.getElementById('story-submit-btn');
            const fileInput = document.getElementById('story-file-input');
            const file = fileInput && fileInput.files && fileInput.files[0];
            let val = document.getElementById('story-image-val').value.trim();

            if (!file && !preparedStoryBlob && !val) {
                statusEl.innerText = 'Chưa chọn file';
                statusEl.style.color = '#ff5555';
                return false;
            }

            isSubmittingStory = true;
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerText = 'Đang đăng...';
            }
            setStoryProgress(5, 'Đang bắt đầu đăng Story');

            try {
                let payloadBlob = preparedStoryBlob || file;
                const isVideoFile = (payloadBlob && payloadBlob.type && payloadBlob.type.startsWith('video/')) ||
                    (file && /\.(mp4|mov|webm|mkv|avi|m4v|3gp|ogg|ogv|ts|mts)$/i.test(file.name || ''));

                if (isVideoFile && !val) {
                    if (!preparedStoryBlob || payloadBlob.size > MAX_STORY_BYTES) {
                        payloadBlob = await enforceUnder3MBVideo(payloadBlob || file, (ratio) => {
                            setStoryProgress(5 + Math.round(ratio * 30), '');
                        });
                        preparedStoryBlob = payloadBlob;
                    } else {
                        setStoryProgress(35, 'Đã nén xong (' + formatKb(payloadBlob.size) + ')');
                    }
                } else {
                    setStoryProgress(35, 'Đang chuẩn bị tải lên');
                }

                if (payloadBlob && !val) {
                    const mimeToUse = payloadBlob.type || (file && file.type) || (isVideoFile ? 'video/mp4' : 'image/jpeg');
                    val = await uploadBlobInChunks(payloadBlob, 'stories', mimeToUse, statusEl);
                    document.getElementById('story-image-val').value = val;
                }

                if (statusEl) {
                    statusEl.innerText = 'Đang lưu 98%';
                    statusEl.style.color = '#ffcc00';
                }
                setStoryProgress(98, 'Đang lưu Story');

                const form = document.getElementById('story-create-form');
                const formData = new FormData(form);
                if (val) {
                    formData.delete('story_file');
                }

                await fetchWithRetry(window.location.href, {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: formData
                }, 5);

                setStoryProgress(100, 'Hoàn tất 100%');
                if (statusEl) {
                    statusEl.innerText = 'Hoàn tất 100%';
                    statusEl.style.color = '#00ff00';
                }

                window.location.reload();
                return false;
            } catch (err) {
                if (statusEl) {
                    statusEl.innerText = err && err.message ? err.message : 'Lỗi tải lên';
                    statusEl.style.color = '#ff5555';
                }
                setStoryProgress(0, 'Lỗi tải lên');
            }

            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = 'Đăng Story';
            }
            isSubmittingStory = false;
            return false;
        }

        function toggleCommentBox(postId) {
            const box = document.getElementById('comment-box-' + postId);
            if (box.style.display === 'none' || box.style.display === '') {
                box.style.display = 'block';
                document.getElementById('comment-input-' + postId).focus();
            } else {
                box.style.display = 'none';
            }
        }

        function compressAndSetImage(fileInput, targetInputSelector, maxDim = 900, quality = 0.72) {
            const file = fileInput.files[0];
            const statusId = targetInputSelector.includes('post') ? 'post-compress-status' : 'story-compress-status';
            const statusEl = document.getElementById(statusId);

            if (!file) return;
            statusEl.innerText = targetInputSelector === '#story-image-val' ? 'Đang giảm dung lượng...' : ("⚡ Đang giảm dung lượng: " + file.name);

            const reader = new FileReader();
            reader.onload = function(e) {
                const img = new Image();
                img.onload = function() {
                    let width = img.width;
                    let height = img.height;

                    if (width > maxDim || height > maxDim) {
                        if (width >= height) {
                            height = Math.round((height * maxDim) / width);
                            width = maxDim;
                        } else {
                            width = Math.round((width * maxDim) / height);
                            height = maxDim;
                        }
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
                    document.querySelector(targetInputSelector).value = compressedBase64;
                    if (targetInputSelector === '#story-image-val') {
                        document.getElementById('story-thumb-val').value = compressedBase64;
                        const approxBytes = Math.round((compressedBase64.length * 3) / 4);
                        setStoryReadyText({ size: approxBytes }, false);
                    } else {
                        statusEl.innerText = "✅ Đã giảm dung lượng (" + width + "x" + height + ")";
                        statusEl.style.color = "#00ff00";
                    }
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }

        async function submitAjax(event, form) {
            event.preventDefault();
            const formData = new FormData(form);
            const btn = form.querySelector('button');
            try {
                const res = await fetch(window.location.href, {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: formData
                });
                if (res.ok) {
                    const spanCount = btn.querySelector('span:nth-child(2)');
                    let count = parseInt(spanCount.innerText);
                    if (btn.style.color === 'rgb(255, 51, 51)') {
                        btn.style.color = '#888';
                        spanCount.innerText = count - 1;
                    } else {
                        btn.style.color = '#ff3333';
                        spanCount.innerText = count + 1;
                    }
                }
            } catch (e) {
                window.location.reload();
            }
        }

        async function submitCommentAjax(event, postId) {
            event.preventDefault();
            const input = document.getElementById('comment-input-' + postId);
            const text = input.value.trim();
            if (!text) return;

            const formData = new FormData();
            formData.append('action', 'add_comment');
            formData.append('post_id', postId);
            formData.append('comment', text);

            try {
                const res = await fetch(window.location.href, {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: formData
                });
                if (res.ok) {
                    window.location.reload();
                }
            } catch (e) {
                window.location.reload();
            }
        }

        async function deletePostAjax(event, postId) {
            event.preventDefault();
            if (!confirm("Bạn có chắc chắn muốn xóa vĩnh viễn bài viết này không?")) return;

            const formData = new FormData(event.target);
            try {
                const res = await fetch(window.location.href, {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: formData
                });
                if (res.ok) {
                    const card = document.getElementById('post-card-' + postId);
                    if (card) {
                        card.style.transition = 'opacity 0.3s ease';
                        card.style.opacity = '0';
                        setTimeout(() => card.remove(), 300);
                    } else {
                        window.location.reload();
                    }
                }
            } catch (e) {
                window.location.reload();
            }
        }

        async function submitPostAjax(event, form) {
            event.preventDefault();
            const formData = new FormData(form);
            try {
                const res = await fetch(window.location.href, {
                    method: 'POST',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    body: formData
                });
                if (res.ok) {
                    window.location.reload();
                }
            } catch (e) {
                window.location.reload();
            }
        }
    </script>

    <div class="box">
        <div class="box-title">📰 Bảng tin cộng đồng</div>
        <div class="box-content">
            ${postsHtml}
            ${paginationHtml}
        </div>
    </div>
    `;

    return new Response(renderLayout('Bảng tin', content, user), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
}
