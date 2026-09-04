import { createClient } from '@supabase/supabase-js';

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

const ALLOWED_MODELS = new Set([
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
]);

// גיבוי: אם המודל המבוקש נכשל (לא עומס זמני שכבר יש לו ניסיון חוזר), מנסים פעם אחת עם מודל חזק יותר
const FALLBACK_MODEL = 'gemini-3.5-flash';

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

    const { model = 'gemini-3.5-flash-lite', payload, kind, raw_message } = req.body || {};

    if (!ALLOWED_MODELS.has(model)) {
        return res.status(400).json({ error: 'Invalid model' });
    }

    if (!payload || typeof payload !== 'object') {
        return res.status(400).json({ error: 'Missing payload' });
    }

    // סריקת תמונה מזוהה לפי inline_data בתוכן; צ'אט טקסט — לא
    const isScan = JSON.stringify(payload.contents || '').includes('inline_data');

    // הגבלת אורך הודעה — מקסימום 500 תווים (רק בצ'אט; פרומפט הסריקה קבוע וארוך יותר)
    // בודקים את raw_message (מה שהמשתמש בפועל הקליד) אם נשלח — לא את ה-contents שנשלחים ל-Gemini,
    // כי אלה כוללים גם הקשר מוזרק (בסיס ידע/USDA) שיכול להיות ארוך בהרבה מההודעה עצמה.
    // אם raw_message לא נשלח (למשל קריאות ישנות/אחרות) — נופלים חזרה לבדיקה הישנה על ה-contents.
    if (!isScan && kind !== 'quick_chips') {
        let lastText;
        if (typeof raw_message === 'string') {
            lastText = raw_message;
        } else {
            const contents = payload.contents || [];
            const lastContent = contents[contents.length - 1];
            lastText = lastContent?.parts?.find(p => p.text)?.text || '';
        }
        if (lastText.length > 500) {
            return res.status(400).json({ error: 'ההודעה ארוכה מדי (מקסימום 500 תווים).' });
        }
    }

    // Rate limit (billing פעיל, לא free tier): 15 בקשות/דקה למשתמש בודד + 100 בקשות/דקה גלובלית לכל האתר
    const minAgo = new Date(Date.now() - 60 * 1000).toISOString();

    const { count: userCount } = await db.from('ai_global_log')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', minAgo);
    if (userCount >= 15) {
        return res.status(429).json({ error: 'הגעת למגבלת הבקשות שלך (15 לדקה). נסה שוב בעוד דקה' });
    }

    const { count: globalCount } = await db.from('ai_global_log')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', minAgo);
    if (globalCount >= 100) {
        return res.status(429).json({ error: 'המערכת עמוסה כרגע, נסה שוב בעוד דקה' });
    }

    await db.from('ai_global_log').insert({ created_at: new Date().toISOString(), user_id: user.id });
    // ניקוי שורות ישנות כדי שהטבלה תישאר קטנה (לא חוסם את התשובה)
    db.from('ai_global_log').delete()
        .lt('created_at', new Date(Date.now() - 2 * 60 * 1000).toISOString())
        .then(() => {}, () => {});

    // האם הלקוח ביקש שהכלי יהיה זמין (לא אומר שבפועל יחפש — זו החלטה של המודל עצמו)
    let wantsSearchTool = Array.isArray(payload.tools)
        && payload.tools.some(t => t && (t.google_search || t.googleSearch));

    // Rate limit: 10 סריקות תמונה בשעה למשתמש (לא חל על צ'אט)
    if (isScan) {
        const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { count } = await db.from('scan_logs').select('*', { count: 'exact', head: true })
            .eq('user_id', user.id).eq('type', 'scan').gte('created_at', hourAgo);
        if (count >= 10) return res.status(429).json({ error: 'הגעת למגבלת 10 סריקות בשעה. נסה שוב מאוחר יותר.' });
        await db.from('scan_logs').insert({ user_id: user.id, type: 'scan' });
    }

    // Rate limit: 50 בירורי מאקרו בשעה למשתמש (הזנה בכתב — לא נספר במכסת הצ'אט)
    if (kind === 'macro') {
        const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { count } = await db.from('scan_logs').select('*', { count: 'exact', head: true })
            .eq('user_id', user.id).eq('type', 'macro').gte('created_at', hourAgo);
        if (count >= 50) return res.status(429).json({ error: 'הגעת למגבלת 50 בירורי מאקרו בשעה. נסה שוב מאוחר יותר.' });
        await db.from('scan_logs').insert({ user_id: user.id, type: 'macro' });
    }

    // Rate limit: 10 הצעות צ'יפים ביום למשתמש (רשת ביטחון — הלקוח ממילא שומר מטמון ולא קורא לזה בכל פתיחה)
    if (kind === 'quick_chips') {
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { count } = await db.from('scan_logs').select('*', { count: 'exact', head: true })
            .eq('user_id', user.id).eq('type', 'quick_chips').gte('created_at', dayAgo);
        if (count >= 10) return res.status(429).json({ error: 'הגעת למגבלת ההצעות היומית.' });
        await db.from('scan_logs').insert({ user_id: user.id, type: 'quick_chips' });
    }

    // ── מגבלות צ'אט יומיות (אכיפה בשרת, מתאפס בחצות ישראל) ──────
    // צ'אט בלבד (לא סריקת תמונה, לא בירור מאקרו, לא הצעות צ'יפים). 50 הודעות/יום, 20 חיפושים אמיתיים/יום.
    let messagesRemaining = null; // מועבר ללקוח בכותרת התשובה, כדי שאפשר להראות רמז לפני שנגמר לגמרי
    let today = null, curSearch = 0; // נדרשים אחרי הסטרימינג כדי לעדכן searches רק אם באמת חיפש
    if (!isScan && kind !== 'macro' && kind !== 'quick_chips') {
        // תאריך לפי שעון ישראל → איפוס אוטומטי בחצות מקומית
        today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });

        const { data: usage } = await db.from('daily_usage')
            .select('messages, searches').eq('user_id', user.id).eq('date', today).maybeSingle();
        const curMsg = usage?.messages || 0;
        curSearch = usage?.searches || 0;

        if (curMsg >= 50)
            return res.status(429).json({ error: 'הגעת למגבלת ההודעות היומית (50). נסה שוב מחר.' });
        // מגבלת החיפושים היומית לא חוסמת את הצ'אט — רק שוללת מהמאמן את אפשרות החיפוש להודעה הזו
        if (curSearch >= 20) wantsSearchTool = false;

        await db.from('daily_usage').upsert({
            user_id: user.id,
            date: today,
            messages: curMsg + 1,
            searches: curSearch,
        }, { onConflict: 'user_id,date' });
        messagesRemaining = 50 - (curMsg + 1);

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
    const safeTools = wantsSearchTool ? [{ google_search: {} }] : null;
    const safePayload = {
        contents: payload.contents,
        ...(payload.system_instruction ? { system_instruction: payload.system_instruction } : {}),
        ...(payload.generation_config  ? { generation_config:  payload.generation_config  } : {}),
        ...(safeTools ? { tools: safeTools } : {}),
    };

    async function callGemini(modelName) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse&key=${apiKey}`;
        let r;
        for (let attempt = 0; attempt < 3; attempt++) {
            r = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(safePayload)
            });
            if (r.status !== 503 || attempt === 2) break;
            await new Promise(res2 => setTimeout(res2, 1000 * Math.pow(2, attempt)));
        }
        return r;
    }

    let geminiRes = await callGemini(model);

    // המודל הראשי נכשל (לא עומס זמני שכבר טופל למעלה) — ניסיון יחיד עם מודל גיבוי חזק יותר
    if (!geminiRes.ok && model !== FALLBACK_MODEL) {
        geminiRes = await callGemini(FALLBACK_MODEL);
    }

    if (!geminiRes.ok) {
        const errData = await geminiRes.json().catch(() => ({}));
        return res.status(geminiRes.status).json(errData);
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (messagesRemaining !== null) res.setHeader('X-Messages-Remaining', String(messagesRemaining));

    const reader = geminiRes.body.getReader();
    const decoder = new TextDecoder();
    let usedSearch = false;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (!usedSearch && chunk.includes('groundingMetadata')) usedSearch = true;
        res.write(chunk);
    }
    res.end();

    // עדכון מונה החיפושים היומי — רק אם המאמן באמת חיפש בפועל (לא כי הכלי היה זמין לו).
    // update() ולא upsert() — השורה כבר קיימת מהעדכון למעלה, וכך לא נוגעים בעמודת messages.
    if (usedSearch && today) {
        db.from('daily_usage').update({ searches: curSearch + 1 })
            .eq('user_id', user.id).eq('date', today)
            .then(() => {}, () => {});
    }
}
