import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    // אימות שהמשתמש מחובר (כמו בשאר ה-API) — מונע גישה אנונימית
    const authHeader = req.headers.authorization || '';
    const authToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!authToken) return res.status(401).json({ error: 'Unauthorized' });

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ error: 'server misconfigured' });
    }

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data: { user }, error: authErr } = await sb.auth.getUser(authToken);
    if (authErr || !user) return res.status(401).json({ error: 'Unauthorized' });

    const { eventUri } = req.body || {};
    if (!eventUri || !eventUri.startsWith('https://api.calendly.com/scheduled_events/')) {
        return res.status(400).json({ error: 'invalid eventUri' });
    }

    const token = process.env.CALENDLY_TOKEN;
    if (!token) return res.status(500).json({ error: 'token not configured' });

    try {
        const response = await fetch(eventUri, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok) return res.status(502).json({ error: 'calendly error' });

        const data = await response.json();
        const startTime = data?.resource?.start_time;
        if (!startTime) return res.status(404).json({ error: 'no start_time' });

        res.json({ startTime });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}
