const { createClient } = require('@supabase/supabase-js');

const PLAN_MONTHS = { monthly: 1, yearly: 12 };

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const secret = req.headers['x-webhook-secret'];
    if (!process.env.GROW_WEBHOOK_SECRET) {
        return res.status(500).json({ error: 'server misconfigured' });
    }
    if (!secret || secret !== process.env.GROW_WEBHOOK_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ error: 'server misconfigured' });
    }
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    const { email, phone, plan, first_or_renewal } = req.body || {};

    const months = PLAN_MONTHS[plan];
    if (!months) return res.status(400).json({ error: 'invalid plan, expected "monthly" or "yearly"' });
    if (first_or_renewal !== 'first' && first_or_renewal !== 'renewal') {
        return res.status(400).json({ error: 'invalid first_or_renewal, expected "first" or "renewal"' });
    }
    if (!email && !phone) return res.status(400).json({ error: 'email or phone required' });

    // איתור הלקוח — קודם לפי אימייל, אחר כך לפי טלפון כגיבוי
    let client = null;
    if (email) {
        const { data } = await db.from('profiles')
            .select('id, subscription_duration_months')
            .ilike('email', email)
            .maybeSingle();
        client = data || null;
    }
    if (!client && phone) {
        const { data } = await db.from('profiles')
            .select('id, subscription_duration_months')
            .eq('phone', phone)
            .maybeSingle();
        client = data || null;
    }

    if (!client) {
        console.error('[grow-webhook] client not found — email:', email, 'phone:', phone);
        return res.status(404).json({ error: 'client not found' });
    }

    const newDuration = (client.subscription_duration_months || 0) + months;

    const update = { subscription_duration_months: newDuration };
    if (first_or_renewal === 'first') {
        update.subscription_type = 'paid';
        update.auto_billing = true;
        update.is_subscriber = true;
    }

    const { error: updateErr } = await db.from('profiles').update(update).eq('id', client.id);
    if (updateErr) {
        console.error('[grow-webhook] update failed for client', client.id, updateErr.message);
        return res.status(500).json({ error: 'update failed' });
    }

    return res.status(200).json({ ok: true });
};
