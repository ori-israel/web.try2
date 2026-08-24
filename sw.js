const CACHE_NAME = 'oi-fitness-v360';
const PRECACHE = [
    '/', '/index.html', '/styles.css',
    '/app-core.js', '/app-workouts.js', '/app-journal.js', '/app-workout-plan.js', '/app-weight-chart.js', '/app-nutrition.js', '/app-nutrition-journal.js', '/app-report.js',
    '/auth.js', '/admin.js', '/supabase-db.js', '/client.js', '/data.js', '/profile.js',
    '/ai.js', '/achievements.js', '/tour.js', '/ui-select.js', '/ui-date.js', '/bmr.js', '/app-myfoods.js', '/app-barcode.js',
    '/knowledge-nutrition.js', '/knowledge-sleep.js', '/knowledge-workouts.js', '/knowledge-recovery.js', '/knowledge-psychology.js', '/knowledge-habits.js',
];

const IDB_NAME  = 'pf-sw-db';
const IDB_STORE = 'pending-nutrition';

// ── IndexedDB helpers ────────────────────────────────────────

function _openIDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = e => {
            e.target.result.createObjectStore(IDB_STORE, { keyPath: 'id' });
        };
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = e => reject(e.target.error);
    });
}

function _idbGetAll(db) {
    return new Promise((resolve, reject) => {
        const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).getAll();
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = e => reject(e.target.error);
    });
}

function _idbClear(db) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).clear();
        tx.oncomplete = resolve;
        tx.onerror    = e => reject(e.target.error);
    });
}

// ── Sync nutrition to Supabase ───────────────────────────────

async function syncNutrition() {
    const db      = await _openIDB();
    const pending = await _idbGetAll(db);
    if (!pending.length) return;

    // Last write wins
    const item = pending[pending.length - 1];

    const res = await fetch(`${item.supabaseUrl}/rest/v1/daily_nutrition`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey':        item.anonKey,
            'Authorization': `Bearer ${item.token}`,
            'Prefer':        'resolution=merge-duplicates',
        },
        body: JSON.stringify([{
            user_id:    item.userId,
            date:       item.date,
            protein_g:  item.protein,
            carbs_g:    item.carbs,
            fat_g:      item.fat,
            alcohol_g:  item.alcohol || 0,
            updated_at: new Date().toISOString(),
        }]),
    });

    if (res.ok) await _idbClear(db);
}

// ── SW lifecycle ─────────────────────────────────────────────

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            // התקנה חסינה: כל קובץ נשמר בנפרד; כישלון בקובץ אחד לא מפיל את ההתקנה
            // cache:'no-store' — עוקף לגמרי את מטמון ה-HTTP של הדפדפן, כדי שלא יישמרו קבצים ישנים גם אם ה-headers של השרת מרשים מטמון ארוך
            .then(cache => Promise.all(
                PRECACHE.map(url => fetch(url, { cache: 'no-store' }).then(res => res.ok && cache.put(url, res)).catch(() => {}))
            ))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
            .then(() => self.clients.matchAll({ type: 'window' }))
            .then(clients => clients.forEach(c => c.navigate(c.url)))
    );
});

// ── Background Sync ──────────────────────────────────────────

self.addEventListener('sync', e => {
    if (e.tag === 'sync-nutrition') {
        e.waitUntil(syncNutrition());
    }
});

// ── Message from page (fallback for older iOS) ───────────────

self.addEventListener('message', e => {
    if (e.data && e.data.type === 'SYNC_NUTRITION') {
        syncNutrition().catch(() => {});
    }
});

// ── Fetch (caching) ──────────────────────────────────────────

self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    const url = new URL(e.request.url);

    // התעלם מבקשות שאינן http/https (למשל chrome-extension) — לא ניתן לשמור אותן במטמון
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

    if (url.hostname.includes('googleapis.com') || url.hostname.includes('gstatic.com') || url.hostname.includes('calendly.com')) {
        e.respondWith(fetch(e.request));
        return;
    }

    if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase.co')) {
        e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
        return;
    }

    // HTML — תמיד מהרשת כדי שעדכונים ייכנסו מיד
    // cache:'no-store' בכל fetch כאן עוקף את מטמון ה-HTTP של הדפדפן/הרשת, כדי שהגרסה הכי טרייה תמיד תגיע בפועל
    if (url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname === '') {
        e.respondWith(
            fetch(e.request, { cache: 'no-store' }).then(res => {
                if (res && res.status === 200) {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
                }
                return res;
            }).catch(() => caches.match(e.request))
        );
        return;
    }

    // CSS — תמיד מהרשת, כמו HTML/JS, כדי שעדכוני עיצוב ייכנסו מיד ולא יתקעו על גרסה ישנה
    if (url.pathname.endsWith('.css')) {
        e.respondWith(
            fetch(e.request, { cache: 'no-store' }).then(res => {
                if (res && res.status === 200) {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
                }
                return res;
            }).catch(() => caches.match(e.request))
        );
        return;
    }

    if (url.pathname.endsWith('.js')) {
        e.respondWith(
            fetch(e.request, { cache: 'no-store' }).then(res => {
                if (res && res.status === 200) {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
                }
                return res;
            }).catch(() => caches.match(e.request))
        );
        return;
    }

    e.respondWith(
        caches.match(e.request).then(cached => {
            if (cached) return cached;
            return fetch(e.request, { cache: 'no-store' }).then(res => {
                if (res && res.status === 200 && res.type === 'basic') {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
                }
                return res;
            });
        })
    );
});
