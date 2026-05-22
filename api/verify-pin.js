const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const PIN_MAX = 5;
const PIN_WINDOW_SEC = 15 * 60; // 15 minutes

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false });
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false });

    const { pin } = req.body || {};
    if (typeof pin !== 'string' || !pin) return res.status(400).json({ ok: false });

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ ok: false, error: 'server misconfigured' });
    }

    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    // Verify JWT signature via Supabase (not manual decode)
    const { data: { user }, error: authErr } = await db.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ ok: false });

    // Persistent rate limit check (works across all serverless instances)
    const now = new Date();
    const { data: rl } = await db
        .from('pin_rate_limit')
        .select('attempts, reset_at')
        .eq('user_id', user.id)
        .single();

    if (rl && new Date(rl.reset_at) > now) {
        if (rl.attempts >= PIN_MAX) {
            const minutesLeft = Math.ceil((new Date(rl.reset_at) - now) / 60000);
            return res.status(429).json({ ok: false, error: `יותר מדי ניסיונות — נסה שוב בעוד ${minutesLeft} דקות` });
        }
        // Increment attempt count
        await db
            .from('pin_rate_limit')
            .update({ attempts: rl.attempts + 1 })
            .eq('user_id', user.id);
    } else {
        // First attempt or window expired — create/reset record
        await db
            .from('pin_rate_limit')
            .upsert({
                user_id:  user.id,
                attempts: 1,
                reset_at: new Date(now.getTime() + PIN_WINDOW_SEC * 1000).toISOString(),
            });
    }

    const { data: profile, error: profErr } = await db
        .from('profiles')
        .select('coach_pin')
        .eq('id', user.id)
        .single();

    if (profErr || !profile) {
        return res.status(404).json({ ok: false });
    }

    // Constant-time comparison — prevents timing attacks
    const stored = typeof profile.coach_pin === 'string' ? profile.coach_pin : '';
    const pinBuf    = Buffer.alloc(256);
    const storedBuf = Buffer.alloc(256);
    Buffer.from(pin).copy(pinBuf);
    Buffer.from(stored).copy(storedBuf);
    const ok = stored.length > 0 && crypto.timingSafeEqual(pinBuf, storedBuf);

    if (ok) {
        // Clear rate limit on success
        await db.from('pin_rate_limit').delete().eq('user_id', user.id);
    }

    return res.status(200).json({ ok });
};
