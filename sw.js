const CACHE_NAME = 'oi-fitness-v1';
const PRECACHE = [
    '/', '/index.html', '/styles.css', '/app.js', '/auth.js',
    '/supabase-db.js', '/client.js', '/data.js', '/profile.js',
    '/ai.js', '/achievements.js',
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(PRECACHE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    const url = new URL(e.request.url);
    // Always network for API, Supabase, external services
    if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase.co') || url.hostname.includes('googleapis.com')) {
        e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
        return;
    }
    // Cache-first for static assets
    e.respondWith(
        caches.match(e.request).then(cached => {
            if (cached) return cached;
            return fetch(e.request).then(res => {
                if (res && res.status === 200 && res.type === 'basic') {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
                }
                return res;
            });
        })
    );
});
