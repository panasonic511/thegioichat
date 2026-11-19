const MEDIA_ROUTE_PREFIX = '/media/';
const DEFAULT_MEDIA_TTL_SEC = 24 * 60 * 60;

function getBucket(env) {
    if (!env) return null;
    return env.MEDIA_BUCKET || env.R2_BUCKET || env.R2 || null;
}

function sanitizeKey(rawKey) {
    return String(rawKey || '')
        .replace(/^\/+/, '')
        .replace(/[^a-zA-Z0-9._/-]/g, '_');
}

function extensionFromMime(mimeType, fallback = 'bin') {
    const clean = String(mimeType || '').toLowerCase().split(';')[0].trim();
    const map = {
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif',
        'video/mp4': 'mp4',
        'video/quicktime': 'mov',
        'video/webm': 'webm',
        'video/x-matroska': 'mkv',
        'video/3gpp': '3gp',
        'video/ogg': 'ogv'
    };
    return map[clean] || fallback;
}

export function dataUrlToBytesAndMime(dataUrl, fallbackMime = 'application/octet-stream') {
    const str = String(dataUrl || '').trim();
    if (!str.startsWith('data:')) {
        return { bytes: null, mimeType: fallbackMime };
    }
    const commaIdx = str.indexOf(',');
    if (commaIdx === -1) {
        return { bytes: null, mimeType: fallbackMime };
    }
    const meta = str.slice(5, commaIdx);
    const body = str.slice(commaIdx + 1);
    const isBase64 = meta.includes(';base64');
    const mimeType = meta.split(';')[0].trim() || fallbackMime;

    if (isBase64) {
        const binary = atob(body.replace(/\s+/g, ''));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return { bytes, mimeType };
    }

    const decoded = decodeURIComponent(body);
    const bytes = new TextEncoder().encode(decoded);
    return { bytes, mimeType };
}

export function isStoredMediaRef(val) {
    const s = String(val || '').trim();
    return s.startsWith(MEDIA_ROUTE_PREFIX) || s.startsWith('r2://') || s.startsWith('cache://');
}

export function normalizeMediaUrl(val) {
    const s = String(val || '').trim();
    if (!s) return '';
    if (s.startsWith('r2://')) return MEDIA_ROUTE_PREFIX + s.slice(5);
    if (s.startsWith('cache://')) return MEDIA_ROUTE_PREFIX + s.slice(8);
    return s;
}

/**
 * Lưu file hoặc DataURL ra R2 (nếu có) hoặc Cache API, trả về URL nội bộ (/media/...)
 */
export async function saveMediaAsset(request, env, {
    folder = 'stories',
    userId = 0,
    file = null,
    dataUrl = '',
    mimeType = '',
    ttlSeconds = DEFAULT_MEDIA_TTL_SEC
}) {
    let bytes = null;
    let resolvedMime = String(mimeType || '').trim();

    if (file && typeof file === 'object' && typeof file.arrayBuffer === 'function' && file.size > 0) {
        const buf = await file.arrayBuffer();
        bytes = new Uint8Array(buf);
        resolvedMime = resolvedMime || file.type || 'application/octet-stream';
    } else if (dataUrl && String(dataUrl).trim() !== '') {
        const trimmed = String(dataUrl).trim();
        if (isStoredMediaRef(trimmed)) {
            return { url: normalizeMediaUrl(trimmed), mimeType: resolvedMime || 'application/octet-stream', size: 0 };
        }
        if (!trimmed.startsWith('data:')) {
            return { url: trimmed, mimeType: resolvedMime || 'application/octet-stream', size: trimmed.length };
        }
        const parsed = dataUrlToBytesAndMime(trimmed, resolvedMime || 'application/octet-stream');
        bytes = parsed.bytes;
        resolvedMime = resolvedMime || parsed.mimeType;
    }

    if (!bytes || bytes.byteLength === 0) {
        return { url: '', mimeType: resolvedMime, size: 0 };
    }

    const ext = extensionFromMime(resolvedMime, resolvedMime.startsWith('video/') ? 'mp4' : 'jpg');
    const rand = Math.random().toString(36).slice(2, 10);
    const key = sanitizeKey(`${folder}/${userId || 0}/${Date.now()}_${rand}.${ext}`);
    const publicUrl = `${MEDIA_ROUTE_PREFIX}${key}`;

    const bucket = getBucket(env);
    if (bucket && typeof bucket.put === 'function') {
        await bucket.put(key, bytes, {
            httpMetadata: {
                contentType: resolvedMime,
                cacheControl: `public, max-age=${ttlSeconds}`
            },
            customMetadata: {
                uploadedAt: String(Date.now()),
                ttlSeconds: String(ttlSeconds)
            }
        });
        return { url: publicUrl, mimeType: resolvedMime, size: bytes.byteLength, storage: 'r2' };
    }

    // Dự phòng bằng Cache API của Cloudflare Worker (không lưu nặng vào D1)
    if (typeof caches !== 'undefined' && caches.default && request) {
        const origin = new URL(request.url).origin;
        const cacheReq = new Request(`${origin}${publicUrl}`, { method: 'GET' });
        const cacheRes = new Response(bytes, {
            status: 200,
            headers: {
                'Content-Type': resolvedMime,
                'Content-Length': String(bytes.byteLength),
                'Cache-Control': `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}`,
                'Accept-Ranges': 'bytes'
            }
        });
        await caches.default.put(cacheReq, cacheRes);
        return { url: publicUrl, mimeType: resolvedMime, size: bytes.byteLength, storage: 'cache' };
    }

    // Fallback cuối cùng nếu môi trường local không có R2 lẫn Cache API
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return {
        url: `data:${resolvedMime};base64,${btoa(binary)}`,
        mimeType: resolvedMime,
        size: bytes.byteLength,
        storage: 'inline'
    };
}

export async function deleteMediaAsset(request, env, mediaUrl) {
    const norm = normalizeMediaUrl(mediaUrl);
    if (!norm.startsWith(MEDIA_ROUTE_PREFIX)) return;
    const key = sanitizeKey(norm.slice(MEDIA_ROUTE_PREFIX.length));
    if (!key) return;

    const bucket = getBucket(env);
    if (bucket && typeof bucket.delete === 'function') {
        try { await bucket.delete(key); } catch (e) {}
    }

    if (typeof caches !== 'undefined' && caches.default && request) {
        try {
            const origin = new URL(request.url).origin;
            await caches.default.delete(new Request(`${origin}${MEDIA_ROUTE_PREFIX}${key}`, { method: 'GET' }));
        } catch (e) {}
    }
}

/**
 * Phục vụ file ảnh / video từ R2 hoặc Cache API (hỗ trợ Range cho video)
 */
export async function handleMediaRequest(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(MEDIA_ROUTE_PREFIX)) return null;

    const key = sanitizeKey(url.pathname.slice(MEDIA_ROUTE_PREFIX.length));
    if (!key) {
        return new Response('Not found', { status: 404 });
    }

    const bucket = getBucket(env);
    if (bucket && typeof bucket.get === 'function') {
        const rangeHeader = request.headers.get('Range');
        let obj = null;

        if (rangeHeader && rangeHeader.startsWith('bytes=')) {
            const parts = rangeHeader.replace('bytes=', '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : undefined;
            if (!isNaN(start) && start >= 0) {
                const opts = end !== undefined && !isNaN(end) && end >= start
                    ? { range: { offset: start, length: end - start + 1 } }
                    : { range: { offset: start } };
                obj = await bucket.get(key, opts);
            }
        }

        if (!obj) {
            obj = await bucket.get(key);
        }

        if (!obj) {
            return new Response('Media not found', { status: 404 });
        }

        const contentType = (obj.httpMetadata && obj.httpMetadata.contentType) || 'application/octet-stream';
        const headers = new Headers();
        headers.set('Content-Type', contentType);
        headers.set('Accept-Ranges', 'bytes');
        headers.set('Cache-Control', 'public, max-age=86400');

        if (obj.range && typeof obj.range.offset === 'number') {
            const totalSize = obj.size || 0;
            const start = obj.range.offset;
            const end = obj.range.length ? Math.min(totalSize - 1, start + obj.range.length - 1) : Math.max(start, totalSize - 1);
            headers.set('Content-Range', `bytes ${start}-${end}/${totalSize}`);
            headers.set('Content-Length', String(Math.max(0, end - start + 1)));
            return new Response(obj.body, { status: 206, headers });
        }

        if (typeof obj.size === 'number') {
            headers.set('Content-Length', String(obj.size));
        }
        return new Response(obj.body, { status: 200, headers });
    }

    if (typeof caches !== 'undefined' && caches.default) {
        const cacheKey = new Request(`${url.origin}${MEDIA_ROUTE_PREFIX}${key}`, { method: 'GET' });
        const cached = await caches.default.match(cacheKey);
        if (cached) {
            return new Response(cached.body, {
                status: cached.status,
                headers: cached.headers
            });
        }
    }

    return new Response('Media not found', { status: 404 });
}
