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

    // Create profile row
    const profileData = {
        id: uid,
        email,
        name,
        nickname: name.split(' ')[0],
        start_date:   startDate  || new Date().toISOString().slice(0, 10),
        is_admin:     false,
    };
    if (birthDate)   profileData.birth_date    = birthDate;
    if (startWeight) profileData.start_weight  = startWeight;
    if (goalWeight)  profileData.goal_weight   = goalWeight;
    if (height)      profileData.height        = height;
    if (gender)      profileData.gender        = gender;
    if (goal)        profileData.goal          = goal;

    await db.from('profiles').upsert(profileData);

    return res.status(200).json({ ok: true, userId: uid });
};
