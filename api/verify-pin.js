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
        return res.status(500).json({ ok: false, error: 'server misconfigured' });
    }

    // Decode JWT to get user ID without calling getUser
    let userId;
    try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        userId = payload.sub;
        if (!userId) throw new Error('no sub');
    } catch (e) {
        console.error('[verify-pin] JWT decode error:', e.message);
        return res.status(401).json({ ok: false });
    }

    console.log('[verify-pin] url_full:', process.env.SUPABASE_URL, 'key_len:', process.env.SUPABASE_SERVICE_KEY?.length);
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    const { data: profile, error: profErr } = await db
        .from('profiles')
        .select('coach_pin')
        .eq('id', userId)
        .single();

    if (profErr || !profile) {
        console.error('[verify-pin] Profile error:', profErr?.message);
        return res.status(404).json({ ok: false });
    }

    const ok = typeof profile.coach_pin === 'string' && profile.coach_pin === pin;
    console.log('[verify-pin] userId:', userId, 'match:', ok);
    return res.status(200).json({ ok });
};
