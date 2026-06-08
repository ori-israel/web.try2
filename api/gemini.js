import { createClient } from '@supabase/supabase-js';

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

const ALLOWED_MODELS = new Set([
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
]);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'Gemini API key not configured' });
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ error: 'server misconfigured' });
    }

    // Verify user is authenticated
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: { user }, error: authErr } = await db.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Unauthorized' });

    const { model = 'gemini-2.5-flash-lite', payload } = req.body || {};

    if (!ALLOWED_MODELS.has(model)) {
        return res.status(400).json({ error: 'Invalid model' });
    }

    if (!payload || typeof payload !== 'object') {
        return res.status(400).json({ error: 'Missing payload' });
    }

    // סריקת תמונה מזוהה לפי inline_data בתוכן; צ'אט טקסט — לא
    const isScan = JSON.stringify(payload.contents || '').includes('inline_data');

    // Global rate limit: max 12 requests/min across ALL users (Gemini free tier = 15/min)
    const minAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const { count: globalCount } = await db.from('ai_global_log')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', minAgo);
    if (globalCount >= 12) {
        return res.status(429).json({ error: 'המערכת עמוסה כרגע, נסה שוב בעוד דקה 🙏' });
    }
    await db.from('ai_global_log').insert({ created_at: new Date().toISOString() });
    // ניקוי שורות ישנות כדי שהטבלה תישאר קטנה (לא חוסם את התשובה)
    db.from('ai_global_log').delete()
        .lt('created_at', new Date(Date.now() - 2 * 60 * 1000).toISOString())
        .then(() => {}, () => {});

    // Rate limit: 10 סריקות תמונה בשעה למשתמש (לא חל על צ'אט)
    if (isScan) {
        const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { count } = await db.from('scan_logs').select('*', { count: 'exact', head: true })
            .eq('user_id', user.id).gte('created_at', hourAgo);
        if (count >= 10) return res.status(429).json({ error: 'הגעת למגבלת 10 סריקות בשעה. נסה שוב מאוחר יותר.' });
        await db.from('scan_logs').insert({ user_id: user.id });
    }

    // ── מגבלות צ'אט יומיות (אכיפה בשרת, מתאפס בחצות ישראל) ──────
    // צ'אט בלבד (לא סריקת תמונה). 50 הודעות/יום, 20 חיפושים/יום.
    let isSearch = false;
    if (!isScan) {
        isSearch = Array.isArray(payload.tools)
            && payload.tools.some(t => t && (t.google_search || t.googleSearch));

        // תאריך לפי שעון ישראל → איפוס אוטומטי בחצות מקומית
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });

        const { data: usage } = await db.from('daily_usage')
            .select('messages, searches').eq('user_id', user.id).eq('date', today).maybeSingle();
        const curMsg = usage?.messages || 0;
        const curSearch = usage?.searches || 0;

        if (curMsg >= 50)
            return res.status(429).json({ error: 'הגעת למגבלת ההודעות היומית (50). נסה שוב מחר.' });
        if (isSearch && curSearch >= 20)
            return res.status(429).json({ error: 'הגעת למגבלת החיפושים היומית (20). נסה שוב מחר.' });

        await db.from('daily_usage').upsert({
            user_id: user.id,
            date: today,
            messages: curMsg + 1,
            searches: curSearch + (isSearch ? 1 : 0),
        }, { onConflict: 'user_id,date' });

        // ניקוי שורות ישנות ברקע (לא חוסם תשובה) — שומר רק היום + אתמול
        const cutoff = new Date(Date.now() - 36 * 60 * 60 * 1000)
            .toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
        db.from('daily_usage').delete().lt('date', cutoff).then(() => {}, () => {});
    }

    if (!payload.contents) {
        return res.status(400).json({ error: 'Missing contents in payload' });
    }

    // Only forward known-safe fields — block safetySettings overrides
    // tools: רק google_search מותר (חוסם הזרקת tools אחרים)
    const safeTools = isSearch ? [{ google_search: {} }] : null;
    const safePayload = {
        contents: payload.contents,
        ...(payload.system_instruction ? { system_instruction: payload.system_instruction } : {}),
        ...(payload.generation_config  ? { generation_config:  payload.generation_config  } : {}),
        ...(safeTools ? { tools: safeTools } : {}),
    };

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

    let geminiRes;
    for (let attempt = 0; attempt < 3; attempt++) {
        geminiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(safePayload)
        });
        if (geminiRes.status !== 503 || attempt === 2) break;
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }

    if (!geminiRes.ok) {
        const errData = await geminiRes.json().catch(() => ({}));
        return res.status(geminiRes.status).json(errData);
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = geminiRes.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
    }
    res.end();
}
