const CACHE_NAME = 'webtry2-v2';
const ASSETS = [
    '/',
    '/index.html',
    '/app.js',
    '/auth.js',
    '/ai.js',
    '/profile.js',
    '/data.js',
    '/supabase-db.js',
    '/achievements.js',
    '/styles.css',
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async cache => {
            try { await cache.addAll(ASSETS); } catch (e) { console.warn('[SW] cache install error:', e); }
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    if (!event.request.url.startsWith(self.location.origin)) return;
    event.respondWith(
        fetch(event.request)
            .then(res => {
                const clone = res.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                return res;
            })
            .catch(() => caches.match(event.request).then(cached => {
                if (cached) return cached;
                if (event.request.mode === 'navigate') return caches.match('/index.html');
                return new Response('', { status: 404, statusText: 'Not Found' });
            }))
    );
});
