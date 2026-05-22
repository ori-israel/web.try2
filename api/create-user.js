const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
    try { return await _handler(req, res); }
    catch (e) { return res.status(500).json({ error: e.message || String(e) }); }
};

async function _handler(req, res) {
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

    const { email, password, name, startDate, birthDate, startWeight, goalWeight, height, gender, goal } = req.body || {};
    if (!email || !password || !name) {
        return res.status(400).json({ error: 'email, password, name required' });
    }

    // Create auth user
    const { data: newUser, error: createErr } = await db.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
    });

    if (createErr) {
        return res.status(400).json({ error: createErr.message });
    }

    const uid = newUser.user.id;

    // Wait briefly for the DB trigger to create the profile row
    await new Promise(r => setTimeout(r, 300));

    // Update profile row with all provided data
    const profileData = {
        name,
        nickname:      name.split(' ')[0],
        start_date:    startDate  || new Date().toISOString().slice(0, 10),
        is_admin:      false,
        workouts_per_week: 3,
        birth_date:    birthDate    || null,
        start_weight:  startWeight  || null,
        goal_weight:   goalWeight   || null,
        height:        height       || null,
        gender:        gender       || 'male',
        goal:          goal         || 'cut',
    };

    const { error: updateErr } = await db
        .from('profiles')
        .update(profileData)
        .eq('id', uid);

    if (updateErr) {
        console.error('[create-user] profile update error:', updateErr.message);
        return res.status(500).json({ error: 'user created but profile update failed: ' + updateErr.message });
    }

    return res.status(200).json({ ok: true, userId: uid });
};
