const MEDIA_ROUTE_PREFIX = '/media/';
const CHUNK_STORE_PREFIX = '/__media_chunk__/';
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

function sanitizeUploadId(rawId) {
    return String(rawId || '').replace(/[^a-zA-Z0-9_-]/g, '');
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

async function writeBytesToStorage(request, env, key, bytes, mimeType, ttlSeconds) {
    const cleanKey = sanitizeKey(key);
    const publicUrl = `${MEDIA_ROUTE_PREFIX}${cleanKey}`;
    const bucket = getBucket(env);

    if (bucket && typeof bucket.put === 'function') {
        await bucket.put(cleanKey, bytes, {
            httpMetadata: {
                contentType: mimeType,
                cacheControl: `public, max-age=${ttlSeconds}`
            },
            customMetadata: {
                uploadedAt: String(Date.now()),
                ttlSeconds: String(ttlSeconds)
            }
        });
        return { url: publicUrl, mimeType, size: bytes.byteLength, storage: 'r2' };
    }

    if (typeof caches !== 'undefined' && caches.default && request) {
        const origin = new URL(request.url).origin;
        const cacheReq = new Request(`${origin}${publicUrl}`, { method: 'GET' });
        const cacheRes = new Response(bytes, {
            status: 200,
            headers: {
                'Content-Type': mimeType,
                'Content-Length': String(bytes.byteLength),
                'Cache-Control': `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}`,
                'Accept-Ranges': 'bytes'
            }
        });
        await caches.default.put(cacheReq, cacheRes);
        return { url: publicUrl, mimeType, size: bytes.byteLength, storage: 'cache' };
    }

    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return {
        url: `data:${mimeType};base64,${btoa(binary)}`,
        mimeType,
        size: bytes.byteLength,
        storage: 'inline'
    };
}

async function readStoredKeyBytes(request, env, key) {
    const cleanKey = sanitizeKey(key);
    const bucket = getBucket(env);
    if (bucket && typeof bucket.get === 'function') {
        const obj = await bucket.get(cleanKey);
        if (!obj) return null;
        return new Uint8Array(await obj.arrayBuffer());
    }
    if (typeof caches !== 'undefined' && caches.default && request) {
        const origin = new URL(request.url).origin;
        const cacheKey = new Request(`${origin}${MEDIA_ROUTE_PREFIX}${cleanKey}`, { method: 'GET' });
        const cached = await caches.default.match(cacheKey);
        if (!cached) return null;
        return new Uint8Array(await cached.arrayBuffer());
    }
    return null;
}

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

    return await writeBytesToStorage(request, env, key, bytes, resolvedMime, ttlSeconds);
}

export async function saveMediaChunk(request, env, {
    uploadId,
    chunkIndex,
    chunkBlob,
    ttlSeconds = 3600
}) {
    const safeId = sanitizeUploadId(uploadId);
    const idx = parseInt(chunkIndex, 10);
    if (!safeId || isNaN(idx) || idx < 0 || !chunkBlob || typeof chunkBlob.arrayBuffer !== 'function') {
        throw new Error('Dữ liệu mảnh tải lên không hợp lệ.');
    }

    const buf = await chunkBlob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const bucket = getBucket(env);

    if (bucket && typeof bucket.put === 'function') {
        const chunkKey = sanitizeKey(`_chunks/${safeId}/${String(idx).padStart(6, '0')}.part`);
        await bucket.put(chunkKey, bytes, {
            httpMetadata: {
                contentType: 'application/octet-stream',
                cacheControl: `public, max-age=${ttlSeconds}`
            }
        });
        return { ok: true, chunkIndex: idx, size: bytes.byteLength, storage: 'r2' };
    }

    if (typeof caches !== 'undefined' && caches.default && request) {
        const origin = new URL(request.url).origin;
        const req = new Request(`${origin}${CHUNK_STORE_PREFIX}${safeId}/${idx}`, { method: 'GET' });
        const res = new Response(bytes, {
            status: 200,
            headers: {
                'Content-Type': 'application/octet-stream',
                'Content-Length': String(bytes.byteLength),
                'Cache-Control': `public, max-age=${ttlSeconds}`
            }
        });
        await caches.default.put(req, res);
        return { ok: true, chunkIndex: idx, size: bytes.byteLength, storage: 'cache' };
    }

    throw new Error('Không có bộ nhớ tạm cho chunk upload.');
}

async function getChunkBytes(request, env, safeId, idx) {
    const bucket = getBucket(env);
    if (bucket && typeof bucket.get === 'function') {
        const chunkKey = sanitizeKey(`_chunks/${safeId}/${String(idx).padStart(6, '0')}.part`);
        const obj = await bucket.get(chunkKey);
        if (!obj) return null;
        return new Uint8Array(await obj.arrayBuffer());
    }
    if (typeof caches !== 'undefined' && caches.default && request) {
        const origin = new URL(request.url).origin;
        const req = new Request(`${origin}${CHUNK_STORE_PREFIX}${safeId}/${idx}`, { method: 'GET' });
        const cached = await caches.default.match(req);
        if (!cached) return null;
        return new Uint8Array(await cached.arrayBuffer());
    }
    return null;
}

async function deleteChunkKey(request, env, safeId, idx) {
    const bucket = getBucket(env);
    if (bucket && typeof bucket.delete === 'function') {
        const chunkKey = sanitizeKey(`_chunks/${safeId}/${String(idx).padStart(6, '0')}.part`);
        try { await bucket.delete(chunkKey); } catch (e) {}
        return;
    }
    if (typeof caches !== 'undefined' && caches.default && request) {
        const origin = new URL(request.url).origin;
        const req = new Request(`${origin}${CHUNK_STORE_PREFIX}${safeId}/${idx}`, { method: 'GET' });
        try { await caches.default.delete(req); } catch (e) {}
    }
}

export async function mergeMediaChunkBatch(request, env, {
    uploadId,
    startChunk = 0,
    batchSize = 6,
    totalChunks,
    existingUrl = '',
    folder = 'stories',
    userId = 0,
    mimeType = 'video/mp4',
    ttlSeconds = DEFAULT_MEDIA_TTL_SEC
}) {
    const safeId = sanitizeUploadId(uploadId);
    const total = parseInt(totalChunks, 10);
    const start = Math.max(0, parseInt(startChunk, 10) || 0);
    const limitBatch = Math.max(1, Math.min(6, parseInt(batchSize, 10) || 6));

    if (!safeId || isNaN(total) || total <= 0) {
        throw new Error('Thông tin ghép file không hợp lệ.');
    }

    const end = Math.min(total, start + limitBatch);
    const parts = [];
    let totalBytes = 0;

    const prevNorm = normalizeMediaUrl(existingUrl);
    if (prevNorm && prevNorm.startsWith(MEDIA_ROUTE_PREFIX)) {
        const prevKey = prevNorm.slice(MEDIA_ROUTE_PREFIX.length);
        const prevBytes = await readStoredKeyBytes(request, env, prevKey);
        if (prevBytes && prevBytes.byteLength > 0) {
            parts.push(prevBytes);
            totalBytes += prevBytes.byteLength;
        }
    }

    for (let i = start; i < end; i++) {
        const partBytes = await getChunkBytes(request, env, safeId, i);
        if (!partBytes) {
            throw new Error(`Thiếu mảnh video #${i + 1}/${total}.`);
        }
        parts.push(partBytes);
        totalBytes += partBytes.byteLength;
    }

    const merged = new Uint8Array(totalBytes);
    let offset = 0;
    for (const p of parts) {
        merged.set(p, offset);
        offset += p.byteLength;
    }

    const resolvedMime = String(mimeType || 'video/mp4').trim() || 'video/mp4';
    const ext = extensionFromMime(resolvedMime, resolvedMime.startsWith('video/') ? 'mp4' : 'jpg');
    const rand = Math.random().toString(36).slice(2, 10);
    const isFinal = end >= total;
    const targetFolder = isFinal ? folder : `_partial/${safeId}`;
    const finalKey = sanitizeKey(`${targetFolder}/${userId || 0}/${Date.now()}_${rand}.${ext}`);

    const saved = await writeBytesToStorage(request, env, finalKey, merged, resolvedMime, ttlSeconds);

    for (let i = start; i < end; i++) {
        await deleteChunkKey(request, env, safeId, i);
    }

    if (prevNorm && prevNorm.includes('/_partial/')) {
        await deleteMediaAsset(request, env, prevNorm);
    }

    return {
        done: isFinal,
        nextChunk: end,
        totalChunks: total,
        url: saved.url,
        mimeType: saved.mimeType,
        size: saved.size
    };
}

export async function finalizeMediaChunks(request, env, options = {}) {
    const total = parseInt(options.totalChunks || '0', 10);
    let cursor = parseInt(options.startChunk || '0', 10) || 0;
    let currentUrl = options.existingUrl || '';
    let lastResult = null;

    while (cursor < total) {
        lastResult = await mergeMediaChunkBatch(request, env, {
            ...options,
            startChunk: cursor,
            existingUrl: currentUrl
        });
        currentUrl = lastResult.url;
        cursor = typeof lastResult.nextChunk === 'number' ? lastResult.nextChunk : (cursor + 6);
        if (lastResult.done) break;
    }

    return lastResult || { url: currentUrl, mimeType: options.mimeType || 'video/mp4', size: 0 };
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
        if (!cached) {
            return new Response('Media not found', { status: 404 });
        }
        return new Response(cached.body, {
            status: cached.status,
            headers: cached.headers
        });
    }

    return new Response('Media not found', { status: 404 });
}
