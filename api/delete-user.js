const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ error: 'server misconfigured' });
    }

    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    // Verify caller is admin
    let callerId;
    try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        callerId = payload.sub;
        if (!callerId) throw new Error('no sub');
    } catch {
        return res.status(401).json({ error: 'Invalid token' });
    }

    const { data: caller, error: callerErr } = await db
        .from('profiles')
        .select('is_admin')
        .eq('id', callerId)
        .single();

    if (callerErr || !caller?.is_admin) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId required' });

    // Prevent self-deletion
    if (userId === callerId) return res.status(400).json({ error: 'cannot delete self' });

    const { error: deleteErr } = await db.auth.admin.deleteUser(userId);
    if (deleteErr) return res.status(400).json({ error: deleteErr.message });

    return res.status(200).json({ ok: true });
};
