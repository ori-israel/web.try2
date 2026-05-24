import { createClient } from '@supabase/supabase-js';

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Anthropic API key not configured' });

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY)
        return res.status(500).json({ error: 'server misconfigured' });

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: { user }, error: authErr } = await db.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Unauthorized' });

    const { prompt, imageBase64, imageMime } = req.body || {};
    const isMacroLookup = !imageBase64;
    const scanType = isMacroLookup ? 'macro' : 'scan';
    const rateLimit = isMacroLookup ? 50 : 10;
    const rateLimitMsg = isMacroLookup
        ? 'הגעת למגבלת 50 בירורי מאקרו בשעה. נסה שוב מאוחר יותר.'
        : 'הגעת למגבלת 10 סריקות בשעה. נסה שוב מאוחר יותר.';

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await db.from('scan_logs').select('*', { count: 'exact', head: true })
        .eq('user_id', user.id).eq('type', scanType).gte('created_at', hourAgo);
    if (count >= rateLimit) return res.status(429).json({ error: rateLimitMsg });

    const { error: insertErr } = await db.from('scan_logs').insert({ user_id: user.id, type: scanType });
    if (insertErr) console.error('scan_logs insert error:', JSON.stringify(insertErr));
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

    const messages = [{
        role: 'user',
        content: imageBase64 ? [
            { type: 'image', source: { type: 'base64', media_type: imageMime || 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: prompt }
        ] : [{ type: 'text', text: prompt }]
    }];

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-5',
            max_tokens: 1024,
            messages
        })
    });

    if (!claudeRes.ok) {
        const err = await claudeRes.json().catch(() => ({}));
        return res.status(claudeRes.status).json(err);
    }

    const data = await claudeRes.json();
    const text = data.content?.[0]?.text || '';
    return res.status(200).json({ text });
}
