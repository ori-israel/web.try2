const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
        console.error('[create-user] missing env vars');
        return res.status(500).json({ error: 'server misconfigured' });
    }

    console.log('[create-user] url_len:', process.env.SUPABASE_URL?.length, 'key_len:', process.env.SUPABASE_SERVICE_KEY?.length);

    let callerId;
    try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        callerId = payload.sub;
        if (!callerId) throw new Error('no sub');
    } catch (e) {
        console.error('[create-user] JWT decode error:', e.message);
        return res.status(401).json({ error: 'Invalid token' });
    }

    let db;
    try {
        db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
            auth: { autoRefreshToken: false, persistSession: false }
        });
    } catch (e) {
        console.error('[create-user] createClient error:', e.message);
        return res.status(500).json({ error: 'db init failed: ' + e.message });
    }

    const { data: caller, error: callerErr } = await db
        .from('profiles')
        .select('is_admin')
        .eq('id', callerId)
        .single();

    if (callerErr) {
        console.error('[create-user] caller lookup error:', callerErr.message);
        return res.status(403).json({ error: 'Forbidden' });
    }
    if (!caller?.is_admin) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const { email, password, name, startDate, birthDate, startWeight, goalWeight, height, gender, goal } = req.body || {};
    if (!email || !password || !name) {
        return res.status(400).json({ error: 'email, password, name required' });
    }

    console.log('[create-user] creating auth user:', email);

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
        console.log('[create-user] auth create status:', createResp.status, 'body keys:', Object.keys(createData));
        if (!createResp.ok) {
            return res.status(400).json({ error: createData.msg || createData.message || 'Failed to create user' });
        }
        uid = createData.id;
    } catch (e) {
        console.error('[create-user] fetch error:', e.message);
        return res.status(500).json({ error: 'fetch failed: ' + e.message });
    }

    if (!uid) {
        console.error('[create-user] no uid returned');
        return res.status(500).json({ error: 'no user id returned from Supabase' });
    }

    await new Promise(r => setTimeout(r, 500));

    const profileData = {
        name,
        nickname:          name.split(' ')[0],
        start_date:        startDate   || new Date().toISOString().slice(0, 10),
        is_admin:          false,
        workouts_per_week: 3,
        birth_date:        birthDate    || null,
        start_weight:      startWeight  || null,
        goal_weight:       goalWeight   || null,
        height:            height       || null,
        gender:            gender       || 'male',
        goal:              goal         || 'cut',
    };

    const { error: updateErr } = await db
        .from('profiles')
        .update(profileData)
        .eq('id', uid);

    if (updateErr) {
        console.error('[create-user] profile update error:', updateErr.message);
        return res.status(500).json({ error: 'user created but profile update failed: ' + updateErr.message });
    }

    console.log('[create-user] done, uid:', uid);
    return res.status(200).json({ ok: true, userId: uid });
};
