const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false });

    const { pin } = req.body || {};
    if (typeof pin !== 'string' || !pin) return res.status(400).json({ ok: false });

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
        console.error('[verify-pin] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars');
        return res.status(500).json({ ok: false, error: 'server misconfigured' });
    }

    // Verify token and get user ID
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    console.error('[verify-pin] token_preview:', token?.slice(0,30), 'url:', process.env.SUPABASE_URL?.slice(0,30));
    const { data: { user }, error: authErr } = await db.auth.getUser(token);
    if (authErr) console.error('[verify-pin] Auth error full:', JSON.stringify(authErr));
    if (authErr || !user) {
        console.error('[verify-pin] Auth error:', authErr?.message);
        return res.status(401).json({ ok: false });
    }

    // Look up the PIN stored in the profile row (never sent to client)
    const { data: profile, error: profErr } = await db
        .from('profiles')
        .select('coach_pin')
        .eq('id', user.id)
        .single();

    if (profErr) {
        console.error('[verify-pin] Profile fetch error for', user.id, ':', profErr.message);
        return res.status(404).json({ ok: false });
    }
    if (!profile) {
        console.error('[verify-pin] No profile row found for', user.id);
        return res.status(404).json({ ok: false });
    }

    const storedPin = profile.coach_pin;
    console.log('[verify-pin] user:', user.id, 'pin_set:', storedPin != null, 'match:', storedPin === pin);
    const ok = typeof storedPin === 'string' && storedPin === pin;
    return res.status(200).json({ ok });
};
