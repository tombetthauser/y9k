// LLM THUMBNAILS: BEGIN generated frontend prefetch tests.
import { readFile } from 'node:fs/promises';
import { helpers } from './helpers-module.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const { createImageOriginalPrefetcher } = helpers;
const sourceURL = new URL('../public/helpers.js', import.meta.url);
const source = (await readFile(sourceURL, 'utf8'))
    .replace(/^import \* as THREE from [^\n]+;/m, 'const THREE = globalThis.__imageTestThree;')
    .replaceAll('import.meta.url', JSON.stringify(sourceURL.href));
class TestMesh {
    constructor(geometry, material) {
        this.geometry = geometry;
        this.material = material;
        this.position = { set() {} };
        this.rotation = { y: 0 };
        this.userData = {};
    }
}
globalThis.__imageTestThree = {
    Mesh: TestMesh,
    PlaneGeometry: class {},
    MeshStandardMaterial: class { constructor(options) { Object.assign(this, options); } },
    SRGBColorSpace: 'srgb',
    NearestFilter: 'nearest',
};
const wallImageHelpers = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
delete globalThis.__imageTestThree;
const tick = () => new Promise(resolve => setImmediate(resolve));
const response = (size, contentLength = String(size)) => ({
    ok: true,
    headers: { get: name => name === 'content-length' ? contentLength : null },
    body: new ReadableStream({
        start(controller) {
            if (size) controller.enqueue(new Uint8Array(size));
            controller.close();
        },
    }),
});

test('original-image prefetch uses bounded concurrency and caches fetched bytes', async () => {
    const requests = [];
    const revoked = [];
    const pending = new Map();
    const prefetcher = createImageOriginalPrefetcher({
        concurrency: 2,
        fetchImpl: (url, { signal }) => new Promise(resolve => {
            requests.push(url);
            pending.set(url, resolve);
            signal.addEventListener('abort', () => resolve({ ok: false, status: 0 }), { once: true });
        }),
        createObjectURL: (() => { let id = 0; return () => `blob:cached-${++id}`; })(),
        revokeObjectURL: url => revoked.push(url),
        eventTarget: null,
    });

    const results = [
        prefetcher.enqueue('a', '/original/a.jpg'),
        prefetcher.enqueue('b', '/original/b.jpg'),
        prefetcher.enqueue('c', '/original/c.jpg'),
    ];
    await tick();
    assert.deepEqual(requests, ['/original/a.jpg', '/original/b.jpg']);

    pending.get('/original/a.jpg')(response(4));
    await tick();
    assert.deepEqual(requests, ['/original/a.jpg', '/original/b.jpg', '/original/c.jpg']);
    pending.get('/original/b.jpg')(response(4));
    pending.get('/original/c.jpg')(response(4));
    assert.deepEqual(await Promise.all(results), ['blob:cached-1', 'blob:cached-2', 'blob:cached-3']);
    assert.equal(prefetcher.get('c'), 'blob:cached-3');

    prefetcher.dispose();
    assert.deepEqual(revoked.sort(), ['blob:cached-1', 'blob:cached-2', 'blob:cached-3']);
});

test('deleting a pending original image ignores its late fetch result', async () => {
    let finish;
    let created = 0;
    const prefetcher = createImageOriginalPrefetcher({
        fetchImpl: () => new Promise(resolve => { finish = resolve; }),
        createObjectURL: () => { created++; return 'blob:stale'; },
        revokeObjectURL: () => {},
        eventTarget: null,
    });
    const pending = prefetcher.enqueue('image-1', '/original/1.jpg');
    await tick();
    prefetcher.remove('image-1');
    finish(response(8));

    assert.equal(await pending, null);
    assert.equal(created, 0);
    assert.equal(prefetcher.get('image-1'), null);
    prefetcher.dispose();
});

test('original-image cache evicts least-recently-used entries but retains a pinned image', async () => {
    const revoked = [];
    let next = 0;
    const prefetcher = createImageOriginalPrefetcher({
        maxEntries: 2,
        fetchImpl: async () => response(1),
        createObjectURL: () => `blob:${++next}`,
        revokeObjectURL: url => revoked.push(url),
        eventTarget: null,
    });

    assert.equal(await prefetcher.enqueue('one', '/one'), 'blob:1');
    assert.equal(await prefetcher.enqueue('two', '/two'), 'blob:2');
    assert.equal(prefetcher.pin('two'), 'blob:2');
    assert.equal(await prefetcher.enqueue('three', '/three'), 'blob:3');
    assert.equal(prefetcher.get('one'), null);

    prefetcher.unpin('two');
    assert.equal(await prefetcher.enqueue('four', '/four'), 'blob:4');
    assert.equal(prefetcher.get('two'), null);
    assert.ok(revoked.includes('blob:2'));
    prefetcher.dispose();
});

test('original-image cache enforces its byte budget and skips oversized originals', async () => {
    const revoked = [];
    let next = 0;
    let oversizedBodyRead = false;
    const prefetcher = createImageOriginalPrefetcher({
        maxBytes: 5,
        fetchImpl: async url => url.endsWith('large') ? {
            ok: true,
            headers: { get: () => '6' },
            body: { getReader() { oversizedBodyRead = true; throw new Error('must not read'); } },
        } : response(4),
        createObjectURL: () => `blob:${++next}`,
        revokeObjectURL: url => revoked.push(url),
        eventTarget: null,
    });

    assert.equal(await prefetcher.enqueue('first', '/first'), 'blob:1');
    assert.equal(await prefetcher.enqueue('second', '/second'), 'blob:2');
    assert.equal(prefetcher.get('first'), null);
    assert.equal(await prefetcher.enqueue('oversized', '/large'), null);
    assert.equal(next, 2);
    assert.equal(oversizedBodyRead, false);
    assert.deepEqual(revoked, ['blob:1']);
    prefetcher.dispose();
});

test('concurrent and misleading-length streams stay within the shared byte budget', async () => {
    const controllers = new Map();
    let created = 0;
    const prefetcher = createImageOriginalPrefetcher({
        concurrency: 2,
        maxBytes: 5,
        fetchImpl: url => Promise.resolve({
            ok: true,
            headers: { get: () => null },
            body: new ReadableStream({ start(controller) { controllers.set(url, controller); } }),
        }),
        createObjectURL: () => `blob:${++created}`,
        revokeObjectURL: () => {},
        eventTarget: null,
    });
    const first = prefetcher.enqueue('first', '/first');
    const second = prefetcher.enqueue('second', '/second');
    await tick();
    controllers.get('/first').enqueue(new Uint8Array(4));
    controllers.get('/second').enqueue(new Uint8Array(4));
    controllers.get('/first').close();
    controllers.get('/second').close();
    assert.deepEqual(await Promise.all([first, second]), ['blob:1', null]);

    const misleading = createImageOriginalPrefetcher({
        maxBytes: 5,
        fetchImpl: async () => response(6, '1'),
        createObjectURL: () => { created++; return 'blob:unexpected'; },
        revokeObjectURL: () => {},
        eventTarget: null,
    });
    assert.equal(await misleading.enqueue('large', '/large'), null);
    assert.equal(created, 1);
    misleading.dispose();
    prefetcher.dispose();
});

test('prefetch failures warn and can be retried, while limits and aborts stay quiet', async () => {
    const warnings = [], previousWarn = console.warn;
    console.warn = (...args) => warnings.push(args);
    let attempts = 0, finishAbort;
    const prefetcher = createImageOriginalPrefetcher({
        maxBytes: 5,
        fetchImpl: async url => {
            if (url === '/failure') {
                if (++attempts === 1) return { ok: false, status: 503 };
                return response(2);
            }
            if (url === '/limit') return response(6);
            return new Promise(resolve => { finishAbort = resolve; });
        },
        createObjectURL: () => 'blob:retry',
        revokeObjectURL: () => {},
        eventTarget: null,
    });
    try {
        assert.equal(await prefetcher.enqueue('failed', '/failure'), null);
        assert.equal(warnings.length, 1);
        assert.match(warnings[0][0], /prefetch failed/i);
        assert.equal(warnings[0][1], '/failure');
        assert.match(warnings[0][2].message, /503/);
        assert.equal(await prefetcher.enqueue('failed', '/failure'), 'blob:retry');
        assert.equal(attempts, 2);
        assert.equal(await prefetcher.enqueue('limit', '/limit'), null);
        const aborted = prefetcher.enqueue('abort', '/abort');
        await tick();
        prefetcher.remove('abort');
        finishAbort({ ok: false, status: 0 });
        assert.equal(await aborted, null);
        await tick();
        assert.equal(warnings.length, 1);
    } finally {
        prefetcher.dispose();
        console.warn = previousWarn;
    }
});

test('default cache keeps more than three small original images', async () => {
    let next = 0;
    const prefetcher = createImageOriginalPrefetcher({
        fetchImpl: async () => response(1),
        createObjectURL: () => `blob:${++next}`,
        revokeObjectURL: () => {},
        eventTarget: null,
    });
    try {
        for (let i = 0; i < 10; i++)
            await prefetcher.enqueue(i, `/image-${i}`);
        for (let i = 0; i < 10; i++)
            assert.equal(prefetcher.get(i), `blob:${i + 1}`);
    } finally {
        prefetcher.dispose();
    }
});

test('original-image preloads wait for idle time, open immediately on click, and restart after bfcache', async () => {
    const originalWindow = globalThis.window, originalFetch = globalThis.fetch;
    const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
    const events = new EventTarget(), pending = [], revoked = [];
    const idleCallbacks = new Map();
    let nextIdleCallbackId = 0;
    events.requestIdleCallback = callback => {
        const id = ++nextIdleCallbackId;
        idleCallbacks.set(id, callback);
        return id;
    };
    events.cancelIdleCallback = id => idleCallbacks.delete(id);
    globalThis.window = events;
    globalThis.fetch = url => new Promise(resolve => pending.push({ url, resolve }));
    let blobCount = 0;
    URL.createObjectURL = () => `blob:room-${++blobCount}`;
    URL.revokeObjectURL = url => revoked.push(url);
    const room = new helpers.Gallery();
    const art = { userData: { roomImageId: '1', imageFile: '/original', imageThumbnailUrl: '/thumbnail' } };
    const art2 = { userData: { roomImageId: '2', imageFile: '/second', imageThumbnailUrl: '/second-thumb' } };
    let shown = null, caption = null, current = null;
    room.images.set('1', art);
    room.images.set('2', art2);
    room.app = {
        music: { isSoundOn: () => false },
        lightbox: {
            open(url, _sound, _name, opts) { shown = url; caption = opts.captionUrl; current = opts.source; },
            setImageSource(url, source) { if (current === source) shown = url; },
        },
    };
    const dispatch = (type, persisted) => {
        const event = new Event(type);
        Object.defineProperty(event, 'persisted', { value: persisted });
        events.dispatchEvent(event);
    };
    const runIdleCallback = async () => {
        const [id, callback] = idleCallbacks.entries().next().value;
        idleCallbacks.delete(id);
        callback();
        await tick();
    };
    const flushPromises = async () => {
        for (let i = 0; i < 4; i++)
            await tick();
    };
    try {
        room._startOriginalImagePrefetch();
        assert.deepEqual(pending, []);
        assert.equal(idleCallbacks.size, 1);
        room._openArtwork(art2);
        assert.equal(shown, '/second');
        assert.equal(caption, '/second');

        await runIdleCallback();
        assert.deepEqual(pending.map(item => item.url), ['/original']);
        pending[0].resolve(response(2));
        await flushPromises();
        room._openArtwork(art);
        assert.equal(shown, 'blob:room-1');
        assert.equal(idleCallbacks.size, 0);

        dispatch('pagehide', true);
        assert.equal(shown, '/original');
        assert.deepEqual(revoked, ['blob:room-1']);
        assert.equal(idleCallbacks.size, 0);
        dispatch('pageshow', true);
        assert.equal(idleCallbacks.size, 1);
        await runIdleCallback();
        assert.deepEqual(pending.map(item => item.url), ['/original', '/original']);
        pending[1].resolve(response(2));
        await flushPromises();
        assert.equal(shown, 'blob:room-2');

        assert.equal(idleCallbacks.size, 1);
        await runIdleCallback();
        assert.deepEqual(pending.map(item => item.url), ['/original', '/original', '/second']);
        pending[2].resolve(response(2));
        await flushPromises();
        assert.equal(shown, 'blob:room-2');
        assert.equal(caption, '/original');
        assert.equal(room._lightboxPinnedId, '1');
        dispatch('pagehide', false);
        assert.equal(shown, '/original');
        assert.deepEqual(revoked.sort(), ['blob:room-1', 'blob:room-2', 'blob:room-3']);
    } finally {
        room._originalPrefetcher?.dispose();
        globalThis.window = originalWindow;
        globalThis.fetch = originalFetch;
        URL.createObjectURL = originalCreate;
        URL.revokeObjectURL = originalRevoke;
    }
});

test('wall images request thumbnails first and only request originals after thumbnail failure', async () => {
    const requests = [];
    const texture = { image: { width: 200, height: 100 }, dispose() {} };
    const textureLoader = {
        load(url, onLoad, _progress, onError) {
            requests.push(url);
            queueMicrotask(() => url === '/thumbnail'
                ? onError(new Error('thumbnail unavailable'))
                : onLoad(texture));
            return texture;
        },
    };
    const scene = { add() {} };
    const clickable = [];
    const addImage = wallImageHelpers.createAddUserWallImage({
        scene, textureLoader, roomHalfY: 5, floorY: -5, ceilingY: 5,
        clickable, bounds: { width: 10, depth: 10, minZ: -5, maxZ: 5 },
    });

    const art = await addImage('north', 0, {
        url: '/original', thumbnailUrl: '/thumbnail', displayName: 'art.jpg',
    }, 1, { heightFromFloor: 2 });

    assert.deepEqual(requests, ['/thumbnail', '/original']);
    assert.equal(art.userData.imageFile, '/original');
    assert.equal(art.userData.wallImageFile, '/original');
    assert.equal(art.userData.imageThumbnailUrl, '/thumbnail');
    assert.equal(art.userData.imageName, 'art.jpg');
    assert.deepEqual(clickable, [art]);

    requests.length = 0;
    const modernArt = await addImage('north', 0, {
        url: '/modern-original', thumbnailUrl: '/thumbnail-ok',
    }, 1, { heightFromFloor: 2 });
    assert.deepEqual(requests, ['/thumbnail-ok']);
    assert.equal(modernArt.userData.imageFile, '/modern-original');
    assert.equal(modernArt.userData.wallImageFile, '/thumbnail-ok');

    requests.length = 0;
    const legacyArt = await addImage('north', 0, '/legacy-original', 1, { heightFromFloor: 2 });
    assert.deepEqual(requests, ['/legacy-original']);
    assert.equal(legacyArt.userData.imageFile, '/legacy-original');
    assert.equal(legacyArt.userData.imageThumbnailUrl, null);
});
// LLM THUMBNAILS: END generated frontend prefetch tests.
