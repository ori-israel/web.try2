const { createClient } = require('@supabase/supabase-js');

// ============================================================
// Cron יומי: מעדכן את "פתק הזיכרון" של כל משתמש שדיבר עם המאמן AI
// מאז הסיכום האחרון. מדחיס שיחות לתקציר קצר שנכנס לכל שיחה עתידית.
// ============================================================

const MODEL = 'gemini-3.5-flash-lite';
const LOOKBACK_DAYS = 8;   // חלון שליפת הודעות (ה-cron רץ יומי, מרווח ביטחון)
const MAX_MSGS = 40;       // תקרת הודעות חדשות לסיכום בודד (עלות/גודל)
const CLEANUP_DAYS = 60;   // מחיקת הודעות ישנות מ-60 יום (הפתק שומר את הזיכרון ארוך-הטווח)

async function summarize(apiKey, currentSummary, msgs) {
    const convo = msgs.map(m => (m.role === 'user' ? 'משתמש' : 'מאמן') + ': ' + m.content).join('\n');
    const prompt = `אתה מתחזק "פתק זיכרון" קצר על מתאמן, לשימוש מאמן כושר AI כדי להכיר אותו אישית.

הפתק הנוכחי:
"${currentSummary || '(ריק, אין עדיין)'}"

הודעות חדשות מהשיחה מאז הסיכום האחרון:
${convo}

עדכן את הפתק כך שישקף רק עובדות אישיות קבועות ומשמעותיות: העדפות, מגבלות, פציעות, מטרות, נסיבות חיים, סגנון. הסר עובדות שהמשתמש ביטל או שכבר לא רלוונטיות (למשל אם אמר שכאב חלף). התעלם מפרטים חולפים או מידע שכבר קיים ממילא בנתוני המערכת (משקל/מאקרו/אימונים). שמור אותו קצר מאוד — עד 5 משפטים, בגוף שלישי, בעברית. אם אין שום דבר קבוע ששווה לזכור, החזר את הפתק הקיים כמו שהוא. החזר אך ורק את טקסט הפתק המעודכן, בלי הקדמה או הסבר.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generation_config: { temperature: 0.3, max_output_tokens: 400, thinking_config: { thinking_budget: 0 } }
        })
    });
    if (!res.ok) throw new Error('gemini ' + res.status);
    const data = await res.json();
    return (data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const secret = process.env.CRON_SECRET;
    const auth = req.headers.authorization || '';
    if (!secret || auth !== `Bearer ${secret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ error: 'server misconfigured' });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    // מפת הפתקים הקיימים (summary + last_summarized_at לכל משתמש)
    const { data: mems } = await supabase.from('ai_memory').select('user_id, summary, last_summarized_at');
    const memMap = {};
    (mems || []).forEach(m => { memMap[m.user_id] = m; });

    // הודעות מהחלון האחרון, ממוינות לפי זמן
    const lookback = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: allMsgs, error: msgErr } = await supabase
        .from('ai_chat_history')
        .select('user_id, role, content, created_at')
        .gte('created_at', lookback)
        .order('created_at', { ascending: true });
    if (msgErr) return res.status(500).json({ error: msgErr.message });

    // קיבוץ לפי משתמש
    const byUser = {};
    (allMsgs || []).forEach(m => { (byUser[m.user_id] = byUser[m.user_id] || []).push(m); });

    const results = [];
    for (const uid of Object.keys(byUser)) {
        const mem = memMap[uid] || { summary: '', last_summarized_at: null };
        const newMsgs = byUser[uid].filter(m => !mem.last_summarized_at || m.created_at > mem.last_summarized_at);
        if (!newMsgs.length) continue;

        try {
            const newSummary = await summarize(apiKey, mem.summary, newMsgs.slice(-MAX_MSGS));
            if (newSummary) {
                const nowIso = new Date().toISOString();
                const { error: upErr } = await supabase.from('ai_memory').upsert(
                    { user_id: uid, summary: newSummary.slice(0, 1500), last_summarized_at: nowIso, updated_at: nowIso },
                    { onConflict: 'user_id' }
                );
                if (upErr) results.push({ uid, error: upErr.message });
                else results.push({ uid, updated: true });
            }
        } catch (e) {
            results.push({ uid, error: e.message });
        }
    }

    // ניקוי הודעות ישנות — הפתק כבר מחזיק את הזיכרון ארוך-הטווח
    try {
        const cutoff = new Date(Date.now() - CLEANUP_DAYS * 24 * 60 * 60 * 1000).toISOString();
        await supabase.from('ai_chat_history').delete().lt('created_at', cutoff);
    } catch (e) { /* ניקוי נכשל בשקט */ }

    return res.status(200).json({ processed: results.filter(r => r.updated).length, results });
};
