const { createClient } = require('@supabase/supabase-js');

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

    // Verify JWT signature via Supabase (not manual decode)
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

    const { email, password, name, startDate, birthDate, startWeight, goalWeight, height, gender, goal } = req.body || {};
    if (!email || !password || !name) {
        return res.status(400).json({ error: 'email, password, name required' });
    }

    let uid;
    try {
        const createResp = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': process.env.SUPABASE_SERVICE_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
            },
            body: JSON.stringify({ email, password, email_confirm: true }),
        });
        const createData = await createResp.json();
        if (!createResp.ok) {
            return res.status(400).json({ error: createData.msg || createData.message || 'Failed to create user' });
        }
        uid = createData.id;
    } catch (e) {
        console.error('[create-user] fetch error:', e.message);
        return res.status(500).json({ error: 'Failed to create user' });
    }

    if (!uid) {
        return res.status(500).json({ error: 'Failed to create user' });
    }

    await new Promise(r => setTimeout(r, 500));

    const profileData = {
        name,
        nickname:          name.split(' ')[0],
        start_date:        startDate   || new Date().toISOString().slice(0, 10),
        is_admin:          false,
        workouts_per_week: 3,
        birth_date:        birthDate   || null,
        start_weight:      startWeight || null,
        goal_weight:       goalWeight  || null,
        height:            height      || null,
        gender:            gender      || 'male',
        goal:              goal        || 'cut',
    };

    const { error: updateErr } = await db
        .from('profiles')
        .update(profileData)
        .eq('id', uid);

    if (updateErr) {
        console.error('[create-user] profile update error:', updateErr.message);
        return res.status(500).json({ error: 'User created but profile update failed' });
    }

    console.log('[create-user] done, uid:', uid);
    return res.status(200).json({ ok: true, userId: uid });
};
