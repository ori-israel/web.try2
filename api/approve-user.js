const { createClient } = require('@supabase/supabase-js');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ error: 'server misconfigured' });
    }

    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    // אימות שהקורא הוא אדמין אמיתי (לא רק לפי JS)
    const { data: { user }, error: authErr } = await db.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Unauthorized' });

    const { data: caller, error: callerErr } = await db
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();

    if (callerErr || !caller?.is_admin) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const { userId } = req.body || {};
    if (!userId || !UUID_RE.test(userId)) return res.status(400).json({ error: 'Invalid userId' });

    // אישור: הסרת החסימה + אימות מייל אוטומטי (כדי שיוכל להתחבר תמיד)
    const { error: unbanErr } = await db.auth.admin.updateUserById(userId, {
        ban_duration: 'none',
        email_confirm: true,
    });
    if (unbanErr) return res.status(400).json({ error: 'Unban failed' });

    const { error: profileErr } = await db
        .from('profiles')
        .update({ status: 'approved' })
        .eq('id', userId);
    if (profileErr) return res.status(400).json({ error: 'Profile update failed' });

    return res.status(200).json({ ok: true });
};
