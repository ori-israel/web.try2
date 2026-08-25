// מפעיל טאב לפי מזהה (כמו לחיצה על כפתור הטאב, אבל מהקוד)
function _activateTab(tabId) {
    document.querySelectorAll('.tab-btn, .tab-content').forEach(el => el.classList.remove('active'));
    document.querySelector(`.tab-btn[data-tab="${tabId}"]`)?.classList.add('active');
    document.getElementById(tabId)?.classList.add('active');
}

// אתחול הצ'אט: טעינת היסטוריה מהשרת (פעם אחת לסשן) + הודעת פתיחה אם השיחה ריקה.
// נקרא בכל כניסה לטאב המאמן; הטעינה מ-DB קורית רק בפעם הראשונה.
async function initAIChat() {
    _aiChipsDismissed = false; // כניסה חדשה לטאב — הצ'יפים רלוונטים שוב עד שנשלחת הודעה
    if (!_aiHistoryLoaded) {
        _aiHistoryLoaded = true;
        try {
            const uid = getActiveUserId();
            if (uid) {
                const { data } = await db.from('ai_chat_history')
                    .select('role, content')
                    .eq('user_id', uid)
                    .order('created_at', { ascending: true })
                    .limit(40); // מציגים עד 40 אחרונות; למודל נשלחות 20 (ב-sendAIMessage)
                aiChatHistory = (data || []).map(r => ({ role: r.role, content: r.content }));
            }
        } catch (e) { /* לא מחובר/אופליין — מתחילים ריק */ }
    }
    loadChatHistory();
    if (aiChatHistory.length === 0) {
        // הודעת פתיחה — תצוגה בלבד, לא נשמרת ל-DB ולא נכנסת להיסטוריה שנשלחת למודל
        addChatMessage(`היי ${CLIENT.nickname}! אני המאמן AI שלך, כאן איתך לאורך כל הדרך. אפשר לשאול אותי כל שאלה על תזונה, אימונים והתאוששות. במה נתחיל?`, 'assistant');
    }
    _wireAiSendBtn();
    _loadQuickChips();
}

// ── צ'יפים לשאלות נפוצות: מוצגים רק כשהצ'אט ריק, נעלמים ברגע שיש שיחה ──────
// מחושבים ע"י AI לפי כל המידע על המשתמש (אותו הקשר שכבר נאסף לכל הודעה), פעם אחת
// לכל "חלון זמן" ביום (בוקר/צהריים/ערב) — נשמר במטמון המכשיר, לא מחושב בכל פתיחה.
function _aiQuickChipsFallback() {
    const isMale = CLIENT.gender === 'male';
    return [
        isMale ? 'אני תקוע כבר כמה שבועות, מה לעשות?' : 'אני תקועה כבר כמה שבועות, מה לעשות?',
        'יש לי אירוע הערב, איך מתכננים סביב זה?',
        'תעודד אותי, אין לי כוח היום'
    ];
}

function _quickChipsBucket() {
    const h = new Date().getHours();
    return h < 11 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}

function _quickChipsCacheKey() {
    const uid = getActiveUserId();
    const dateStr = typeof localDateStr === 'function' ? localDateStr() : new Date().toISOString().slice(0, 10);
    return `ai_quick_chips_${uid}_${dateStr}_${_quickChipsBucket()}`;
}

let _aiChipsDismissed = false; // true ברגע שנשלחה הודעה בכניסה הנוכחית לטאב — לא קשור להיסטוריה השמורה
function _renderQuickChips(chips) {
    const row = document.getElementById('ai-quick-chips');
    if (!row) return;
    if (!chips || !chips.length || _aiChipsDismissed) {
        row.style.display = 'none';
        row.innerHTML = '';
        return;
    }
    row.innerHTML = '';
    chips.forEach(text => {
        const btn = document.createElement('button');
        btn.className = 'ai-quick-chip';
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg><span>' + _esc(text) + '</span>';
        btn.onclick = () => {
            row.style.display = 'none';
            document.getElementById('ai-chat-input').value = text;
            sendAIMessage();
        };
        row.appendChild(btn);
    });
    row.style.display = 'flex';
    // חלק מזרימת הגלילה של השיחה עצמה — תמיד מוזז לסוף כדי שיופיע אחרי ההודעה האחרונה, גם אם כבר היה בפנים במיקום ישן
    const container = document.getElementById('ai-chat-messages');
    if (container) {
        container.appendChild(row);
        container.scrollTop = container.scrollHeight;
    }
}

// קריאת AI קטנה ונפרדת (לא חלק מהצ'אט) שמציעה 3 שאלות לפי כל המידע על המשתמש.
// לא נכשלת בקול — אם משהו משתבש, פשוט נשארים עם הצ'יפים הקבועים.
async function _fetchQuickChips() {
    try {
        const { data: { session } } = await db.auth.getSession();
        if (!session) return null;

        const instruction = `\n\nמתוך כל המידע שלמעלה על המשתמש, הצע בדיוק 3 שאלות קצרות (עד 8 מילים כל אחת) שהכי הגיוני שהוא ישאל אותך עכשיו, ברגע הזה — משהו אמיתי ורלוונטי למצב שלו כרגע (משהו שחסר לו היום, הזדמנות טובה, או דבר ששווה לדבר עליו). כל שאלה בגוף ראשון, כאילו המשתמש עצמו כותב אותה — לנסח בלשון הזכר/נקבה שמתאימה למגדר שלו כפי שצוין למעלה, לא בלשון ניטרלית. החזר אך ורק מערך JSON של 3 מחרוזות, בלי שום טקסט נוסף. לדוגמה: ["שאלה אחת", "שאלה שנייה", "שאלה שלישית"]`;

        const response = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify({
                model: 'gemini-3.5-flash-lite',
                kind: 'quick_chips',
                payload: {
                    generation_config: { response_modalities: ["TEXT"] },
                    contents: [{ role: 'user', parts: [{ text: (await buildSystemPrompt()) + instruction }] }]
                }
            })
        });
        if (!response.ok) return null;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '', fullText = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const jsonStr = line.slice(6).trim();
                if (!jsonStr || jsonStr === '[DONE]') continue;
                try {
                    const parsed = JSON.parse(jsonStr);
                    const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (text) fullText += text;
                } catch {}
            }
        }

        const match = fullText.match(/\[[\s\S]*\]/);
        if (!match) return null;
        const arr = JSON.parse(match[0]);
        if (!Array.isArray(arr) || !arr.length) return null;
        return arr.filter(s => typeof s === 'string').slice(0, 3);
    } catch (e) { return null; }
}

async function _loadQuickChips() {
    if (_aiChipsDismissed) return; // כבר נשלחה הודעה בכניסה הנוכחית — לא רלוונטי
    _renderQuickChips(_aiQuickChipsFallback()); // ברירת מחדל מיידית, בלי לחכות לרשת
    const uid = getActiveUserId();
    if (!uid) return;

    const cacheKey = _quickChipsCacheKey();
    try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
        if (Array.isArray(cached) && cached.length) { _renderQuickChips(cached); return; }
    } catch (e) {}

    const chips = await _fetchQuickChips();
    if (chips && chips.length && !_aiChipsDismissed) {
        try { localStorage.setItem(cacheKey, JSON.stringify(chips)); } catch (e) {}
        _renderQuickChips(chips);
    }
}

// תוקן: כשהמקלדת פתוחה במובייל, הקשה ראשונה על "שליחה" רק סגרה מקלדת (בלי לשלוח) בגלל
// שינוי הפריסה שקורה תוך כדי המגע (הפאנל מתכווץ כשהמקלדת נסגרת). touchstart קורה
// לפני שהפריסה זזה, אז הוא תופס את הכוונה לפני שמשהו זז מתחת לאצבע.
let _aiSendBtnWired = false;
function _wireAiSendBtn() {
    if (_aiSendBtnWired) return;
    const btn = document.getElementById('ai-send-btn');
    if (!btn) return;
    _aiSendBtnWired = true;
    btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (typeof btn.onclick === 'function') btn.onclick();
    }, { passive: false });
}

// פתיחת המאמן AI מבחוץ (כרטיס "רעיון לארוחה", מדריך) — עובר לטאב המאמן ומאתחל
function openAIChat() {
    _activateTab('tab5');
    window.scrollTo({ top: 0 });
    initAIChat();
}

// נשמר לתאימות אחורה — אין יותר overlay לסגור, הצ'אט הוא טאב קבוע
function closeAIChat() {}

let aiChatHistory = [];              // מקור האמת: טבלת ai_chat_history בסופאבייס
let _aiHistoryLoaded = false;        // נטען פעם אחת לכל סשן, ואז נשמר בזיכרון
let _aiStableCtx = { userId: null, loaded: false, text: '' };
let _aiStreaming = false;            // תשובה בתהליך כתיבה כרגע — מונע שליחה כפולה
let _aiAbortController = null;       // מאפשר לעצור תשובה באמצע (כפתור "עצירה")

// מחליף בין מצב "שליחה" ל"עצירה" בכפתור השליחה בזמן שתשובה נכתבת
function _setAiSendBtnStopping(stopping) {
    const btn = document.getElementById('ai-send-btn');
    if (!btn) return;
    if (stopping) {
        btn.textContent = 'עצירה';
        btn.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
        btn.onclick = () => { if (_aiAbortController) _aiAbortController.abort(); };
    } else {
        btn.textContent = 'שליחה';
        btn.style.background = '';
        btn.onclick = sendAIMessage;
    }
}

// Gemini דורש שההיסטוריה תתחיל בתור המשתמש ותתחלף בדיוק user/model, בלי שני תורות רצופים
// מאותו צד. אם היסטוריה שלנו נפגמת (למשל הודעה שנכשלה/נעצרה בלי תשובה) — Gemini מחזיר 400
// על כל הודעה הבאה, כולל למודל הגיבוי (זו בעיית מבנה בקשה, לא בעיית מודל ספציפי).
// שכבת הגנה: תמיד לשלוח רק רצף חוקי, בלי קשר למה שקרה קודם בשיחה.
function _sanitizeHistoryForGemini(history) {
    const out = [];
    for (const m of history) {
        if (out.length && out[out.length - 1].role === m.role) {
            out[out.length - 1] = m; // שני תורות רצופים מאותו צד — משאירים רק את האחרון
        } else {
            out.push(m);
        }
    }
    while (out.length && out[0].role === 'assistant') out.shift(); // חייב להתחיל בתור המשתמש
    return out;
}

// מציג/מסתיר רמז עדין כשמתקרבים למכסת ההודעות היומית (לא מציג מספר, רק כשקרוב לסוף)
function _updateAiQuotaHint(response) {
    const hint = document.getElementById('ai-quota-hint');
    if (!hint) return;
    const remaining = parseInt(response.headers.get('X-Messages-Remaining'), 10);
    hint.style.display = (!isNaN(remaining) && remaining <= 10) ? 'flex' : 'none';
}

// שמירת הודעה בודדת להיסטוריה המתמשכת (fire-and-forget, לא חוסם את הצ'אט)
function _sbSaveAiMsg(role, content) {
    try {
        const uid = getActiveUserId();
        if (!uid || !content) return;
        db.from('ai_chat_history').insert({ user_id: uid, role, content }).then(() => {}, () => {});
    } catch (e) {}
}

// שמירת הודעה שלא מצאה שום התאמה בבסיס הידע — כדי לגלות בעתיד חורים אמיתיים
// לפי שימוש בפועל, במקום לנחש נושאים. fire-and-forget, לא חוסם את הצ'אט.
function _sbLogKnowledgeGap(message) {
    try {
        const uid = getActiveUserId();
        if (!uid || !message) return;
        db.from('ai_knowledge_gaps').insert({ user_id: uid, message }).then(() => {}, () => {});
    } catch (e) {}
}

// הופך טקסט תשובה (עם ** לבולד, שורות בולטים עם •/-/* ופסקאות מופרדות בשורה ריקה)
// ל-HTML קריא: פסקאות עם רווח ביניהן, ורשימות אמיתיות (<ul><li>) במקום בלוק טקסט אחד.
// כל טקסט עובר escaping לפני שמוסיפים תגיות, כדי שלא יהיה אפשר להזריק HTML.
function _formatAiReplyHtml(text) {
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const inlineFormat = s => esc(s).split(/\*\*(.*?)\*\*/g).map((part, i) => i % 2 === 1 ? `<strong>${part}</strong>` : part).join('');

    const lines = String(text).split('\n');
    let html = '', inList = false, paraBuffer = [];

    const flushPara = () => {
        if (paraBuffer.length) { html += '<p class="ai-reply-p">' + paraBuffer.join('<br>') + '</p>'; paraBuffer = []; }
    };
    const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };

    for (const raw of lines) {
        const line = raw.trim();
        if (!line) { closeList(); flushPara(); continue; }
        const bulletMatch = line.match(/^[•\-*]\s+(.*)$/);
        if (bulletMatch) {
            flushPara();
            if (!inList) { html += '<ul class="ai-reply-list">'; inList = true; }
            html += '<li>' + inlineFormat(bulletMatch[1]) + '</li>';
        } else {
            closeList();
            paraBuffer.push(inlineFormat(line));
        }
    }
    closeList();
    flushPara();
    return html;
}

// שמירת דיווח משתמש שתשובה מסוימת לא הייתה טובה (כפתור 👎) — לסקירה תקופתית של המנהל
function _sbSaveAiFeedback(question, answer) {
    try {
        const uid = getActiveUserId();
        if (!uid || !question || !answer) return;
        db.from('ai_feedback').insert({ user_id: uid, question, answer }).then(() => {}, () => {});
    } catch (e) {}
}

// עדכון פתק הזיכרון ארוך-הטווח (מה-MEMORY_UPDATE של הסוכן)
function _sbSaveAiMemory(summary) {
    try {
        const uid = getActiveUserId();
        if (!uid) return;
        db.from('ai_memory').upsert({ user_id: uid, summary, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }).then(() => {}, () => {});
    } catch (e) {}
}

// מצב חיפוש באינטרנט — כבוי כברירת מחדל
window.aiWebSearch = false;
function _buildUSDAContext(text) {
    if (typeof USDA_TABLE === 'undefined') return '';
    const t = text.toLowerCase();
    // מילות ההודעה (אורך > 2) — בסיס לחיפוש לפי מילה בודדת
    const msgWords = text.replace(/[()״׳,.?!]/g, ' ').split(/\s+/).filter(w => w.length > 2);
    const msgWordsLow = msgWords.map(w => w.toLowerCase());
    // נקד כל שורה: כמה ממילות השם מופיעות בהודעה
    const scored = [];
    for (const r of USDA_TABLE) {
        let score = 0;
        // התאמה מלאה של שם (עברית/אנגלית) — משקל גבוה
        if (text.includes(r.name) || t.includes(r.name_en.toLowerCase())) score += 100;
        // התאמה לפי מילים בודדות משם המאכל
        const nameWords = r.name.replace(/[()״׳,.]/g, ' ').split(/\s+/).filter(w => w.length > 2);
        const enWords = r.name_en.toLowerCase().replace(/[(),.]/g, ' ').split(/\s+/).filter(w => w.length > 2);
        for (const nw of nameWords) if (msgWords.includes(nw)) score += 10;
        for (const ew of enWords) if (msgWordsLow.includes(ew)) score += 5;
        if (score > 0) scored.push({ r, score });
    }
    if (!scored.length) return '';
    scored.sort((a, b) => b.score - a.score);
    // קבץ לפי המילה הראשונה בשם — שמור רק את ההתאמה הטובה ביותר לכל מאכל
    const seen = {};
    const hits = [];
    for (const { r } of scored) {
        const key = r.name.split(' ')[0];
        if (seen[key]) continue;
        seen[key] = true;
        hits.push(r);
    }
    return hits.slice(0, 5).map(r => `${r.name} — חלבון ${r.protein}g שומן ${r.fat}g פחמימות ${r.carbs}g ל-100ג`).join(' | ');
}

// מסיר עד 2 אותיות יחס/חיבור בתחילת מילה (ו,ה,ב,ל,מ,ש,כ) כדי שצורות כמו
// "ולחלבון"/"בפחמימות" יתאימו למילת המפתח הבסיסית "חלבון"/"פחמימות".
// לא נוגע בהתאמת הביטוי המדויק (score+10) — רק בשכבות ההתאמה החלקית, כדי לא להגדיל סיכון להתאמות שווא.
const _HE_PREFIXES = ['ו', 'ה', 'ב', 'ל', 'מ', 'ש', 'כ'];
function _stripHePrefixes(w) {
    for (let i = 0; i < 2 && w.length >= 4 && _HE_PREFIXES.includes(w[0]); i++) {
        w = w.slice(1);
    }
    return w;
}

// חיפוש בבסיס הידע המקצועי (6 קבצי knowledge-*.js) — התאמת מילות מפתח מקומית, בלי קריאת AI נוספת.
// מזריק רק את הרשומות הרלוונטיות ביותר להודעה, בדיוק בשיטת _buildUSDAContext.
function _buildKnowledgeContext(text) {
    let all = [];
    if (typeof KNOWLEDGE_NUTRITION  !== 'undefined') all = all.concat(KNOWLEDGE_NUTRITION);
    if (typeof KNOWLEDGE_SLEEP      !== 'undefined') all = all.concat(KNOWLEDGE_SLEEP);
    if (typeof KNOWLEDGE_WORKOUTS   !== 'undefined') all = all.concat(KNOWLEDGE_WORKOUTS);
    if (typeof KNOWLEDGE_RECOVERY   !== 'undefined') all = all.concat(KNOWLEDGE_RECOVERY);
    if (typeof KNOWLEDGE_PSYCHOLOGY !== 'undefined') all = all.concat(KNOWLEDGE_PSYCHOLOGY);
    if (typeof KNOWLEDGE_HABITS     !== 'undefined') all = all.concat(KNOWLEDGE_HABITS);
    if (!all.length) return '';

    const t = text;
    const msgWords = text.replace(/[()"'״׳,.?!\-]/g, ' ').split(/\s+/).filter(w => w.length > 1);
    const msgWordsNorm = msgWords.map(_stripHePrefixes);

    const scored = [];
    for (const e of all) {
        let score = 0;
        for (const kw of (e.keywords || [])) {
            if (t.includes(kw)) { score += 10; continue; }              // ביטוי מילת מפתח שלם מופיע בהודעה
            const kwWords = kw.split(/\s+/).filter(w => w.length > 1);
            if (kwWords.length > 1 && kwWords.every(w => msgWordsNorm.includes(_stripHePrefixes(w)))) score += 6; // כל מילות הביטוי מופיעות (אחרי הסרת קידומות)
        }
        const titleWords = e.title.replace(/[()\-—״׳,.]/g, ' ').split(/\s+/).filter(w => w.length > 2);
        for (const tw of titleWords) if (msgWordsNorm.includes(_stripHePrefixes(tw))) score += 3;
        if (score > 0) scored.push({ e, score });
    }
    if (!scored.length) return '';
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 3).map(x => `${x.e.title}: ${x.e.content}`).join('\n\n');
}

function toggleWebSearch(btn) {
    window.aiWebSearch = !window.aiWebSearch;
    if (window.aiWebSearch) {
        btn.style.background = 'var(--accent)';
        btn.style.color = '#fff';
        btn.title = 'חיפוש באינטרנט: פעיל';
    } else {
        btn.style.background = 'var(--bg-card-alt)';
        btn.style.color = '';
        btn.title = 'חיפוש באינטרנט: כבוי';
    }
}

async function sendAIMessage() {
    if (_aiStreaming) return; // כבר יש תשובה בכתיבה — Enter לא ישלח הודעה נוספת
    const input = document.getElementById('ai-chat-input');
    const msg = input.value.trim();
    if (!msg) return;

    _aiChipsDismissed = true;
    _renderQuickChips(null); // מוסתר ברגע ששולחים הודעה, גם אם לא דרך צ'יפ

    // הגבלת 6 שניות בין הודעות — נשלח מיד ומחכים ברקע (בלי הודעת "המתן")
    const now = Date.now();
    const _sinceLast = now - (parseInt(sessionStorage.getItem('ai_last_msg_time') || '0'));
    const _waitMs = _sinceLast < 6000 ? 6000 - _sinceLast : 0;
    sessionStorage.setItem('ai_last_msg_time', now + _waitMs); // שומר תור גם להודעות מהירות רצופות

    input.value = '';
    addChatMessage(msg, 'user');
    aiChatHistory.push({ role: 'user', content: msg });
    _sbSaveAiMsg('user', msg);
    const usdaCtx = _buildUSDAContext(msg);
    const knowledgeCtx = _buildKnowledgeContext(msg);
    let msgWithUSDA = msg;
    if (usdaCtx)      msgWithUSDA += `\n\n[נתוני USDA: ${usdaCtx}]`;
    if (knowledgeCtx) msgWithUSDA += `\n\n[ידע מקצועי רלוונטי, בסיס להתבסס עליו בתשובה. אל תצטט אותו כמו שהוא, נסח בשפה פשוטה ובקצרה מה שרלוונטי לשאלה בלבד: ${knowledgeCtx}]`;
    else if (!usdaCtx) _sbLogKnowledgeGap(msg); // לא נמצאה שום התאמה בבסיס הידע — שווה לבדוק בעתיד

    const loadingId = addLoadingMessage();

    if (_waitMs) await new Promise(r => setTimeout(r, _waitMs));

    const bubbleStyle = `
        padding: 10px 15px;
        margin: 8px 0;
        border-radius: 12px 12px 12px 4px;
        max-width: 75%;
        font-size: 18px;
        line-height: 1.5;
        background: var(--bg-card-alt);
        border: 1px solid var(--border);
        margin-left: 0;
        margin-right: auto;
        color: var(--text-primary);
        display: flex;
        align-items: flex-start;
        gap: 8px;
    `;

    try {
        const historySlice = _sanitizeHistoryForGemini(aiChatHistory.slice(-20));
        const messages = historySlice.map((m, i) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: (i === historySlice.length - 1 && m.role === 'user') ? msgWithUSDA : m.content }]
        }));

        const { data: { session: _aiSession } } = await db.auth.getSession();
        if (!_aiSession) throw new Error('לא מחובר');

        _aiStreaming = true;
        _aiAbortController = new AbortController();
        _setAiSendBtnStopping(true); // כפתור "עצירה" זמין כבר משלב ה"חושב", לא רק אחרי שמתחילים לראות טקסט

        let response;
        try {
            response = await fetch('/api/gemini', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${_aiSession.access_token}`,
                },
                signal: _aiAbortController.signal,
                body: JSON.stringify({
                    model: 'gemini-3.5-flash-lite',
                    raw_message: msg, // ההודעה המקורית שהמשתמש הקליד (בלי הקשר מוזרק) — לבדיקת אורך 500 תווים בשרת
                    payload: {
                        system_instruction: { parts: [{ text: await buildSystemPrompt() }] },
                        generation_config: { response_modalities: ["TEXT"] },
                        contents: messages,
                        ...(window.aiWebSearch ? { tools: [{ google_search: {} }] } : {})
                    }
                })
            });
        } catch (fetchErr) {
            if (fetchErr.name === 'AbortError') {
                // נעצר לפני שהגיע בכלל מענה — מוחקים את בועת "חושב" בלי הודעת שגיאה
                const loadingEl = document.getElementById(loadingId);
                if (loadingEl) loadingEl.remove();
                return;
            }
            throw fetchErr;
        }

        if (!response.ok) {
            let _msg = 'שגיאה בחיבור, נסה שוב.';
            const _e = await response.json().catch(() => ({}));
            if (response.status === 429) {
                _msg = _e.error || 'הגעת למגבלה היומית. נסה שוב מחר.';
            } else {
                console.error('AI request failed:', response.status, _e); // לצורך אבחון תקלות
            }
            const loadingEl = document.getElementById(loadingId);
            if (loadingEl) {
                loadingEl.className = '';
                loadingEl.style.cssText = bubbleStyle;
                loadingEl.innerHTML = `<span style="display:inline-flex;"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 3.5V16H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 10.5h.01"/><path d="M12 10.5h.01"/><path d="M16 10.5h.01"/></svg></span><span>${_msg}</span>`;
            }
            return;
        }

        _updateAiQuotaHint(response);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        const loadingEl = document.getElementById(loadingId);
        let replyTextDiv = null;
        if (loadingEl) {
            loadingEl.className = '';
            loadingEl.style.cssText = bubbleStyle;
            const icon = document.createElement('span');
            icon.style.cssText = 'font-size: 16px; flex-shrink: 0; margin-top: 2px;';
            icon.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 3.5V16H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 10.5h.01"/><path d="M12 10.5h.01"/><path d="M16 10.5h.01"/></svg>';
            replyTextDiv = document.createElement('div');
            loadingEl.innerHTML = '';
            loadingEl.appendChild(icon);
            loadingEl.appendChild(replyTextDiv);
        }

        let fullText = '';
        let buffer = '';
        let lastGrounding = null;

        while (true) {
            let _readResult;
            try {
                _readResult = await reader.read();
            } catch (readErr) {
                if (readErr.name === 'AbortError') break; // המשתמש לחץ "עצירה" — ממשיכים עם מה שכבר התקבל
                throw readErr;
            }
            const { done, value } = _readResult;
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const jsonStr = line.slice(6).trim();
                if (!jsonStr || jsonStr === '[DONE]') continue;
                try {
                    const parsed = JSON.parse(jsonStr);
                    const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (text) {
                        fullText += text;
                        if (replyTextDiv) replyTextDiv.textContent = fullText;
                    }
                    const gm = parsed.candidates?.[0]?.groundingMetadata;
                    if (gm) lastGrounding = gm;
                } catch {}
            }
        }

        // זיהוי כל FOOD_ADD והסרתם מהטקסט המוצג
        const foodAddMatches = [...fullText.matchAll(/FOOD_ADD:(\{[\s\S]*?\})/g)];
        // זיהוי עדכון זיכרון (הפתק ארוך-הטווח) — הסוכן מעדכן כשמשתמש חולק/מתקן עובדה אישית
        const memoryMatch = fullText.match(/MEMORY_UPDATE:(\{[\s\S]*?\})/);
        const displayText = fullText
            .replace(/FOOD_ADD:\{[\s\S]*?\}/g, '')
            .replace(/MEMORY_UPDATE:\{[\s\S]*?\}/g, '')
            .replace(/THOUGHT:[\s\S]*?(?=\n\n|$)/gi, '') // רשת ביטחון: הסרת מחשבה פנימית שדלפה
            .trim();

        // עדכון פתק הזיכרון אם הסוכן ביקש (בלתי נראה למשתמש)
        if (memoryMatch) {
            try {
                const memData = JSON.parse(memoryMatch[1]);
                if (typeof memData.summary === 'string') _sbSaveAiMemory(memData.summary.slice(0, 1500));
            } catch (e) { console.warn('MEMORY_UPDATE parse error:', e); }
        }

        if (replyTextDiv) {
            // בניית HTML בטוח — הטקסט עובר escaping, ומעוצב לפסקאות + רשימות אמיתיות
            replyTextDiv.innerHTML = _formatAiReplyHtml(displayText);

            // הצגת מקורות (חובה לפי תנאי Google כשמשתמשים בחיפוש)
            const chunks = lastGrounding?.groundingChunks || [];
            const links = chunks
                .filter(c => c.web?.uri)
                .map(c => {
                    const safeTitle = (c.web.title || 'מקור').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                    const safeUri   = c.web.uri.replace(/"/g, '%22');
                    return `<a href="${safeUri}" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:underline;"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/></svg> ${safeTitle}</a>`;
                })
                .join(' · ');
            if (links) {
                const sourcesDiv = document.createElement('div');
                sourcesDiv.style.cssText = 'font-size:12px;margin-top:8px;color:var(--text-muted);';
                sourcesDiv.innerHTML = `מקורות: ${links}`;
                replyTextDiv.appendChild(sourcesDiv);
            }

            // הוספה ליומן אם יש FOOD_ADD
            if (foodAddMatches.length > 0) {
                try {
                    for (const foodAddMatch of foodAddMatches) {
                    const foodData = JSON.parse(foodAddMatch[1]);
                    const protein_g = foodData.protein_g || 0;
                    const carbs_g   = foodData.carbs_g   || 0;
                    const fat_g     = foodData.fat_g     || 0;
                    const alcohol_g = foodData.alcohol_g || 0;
                    await addFoodLogEntry({
                        name:      foodData.name,
                        grams:     Math.round(foodData.grams || 0),
                        protein_g: protein_g || null,
                        carbs_g:   carbs_g   || null,
                        fat_g:     fat_g     || null,
                        alcohol_g: alcohol_g || null
                    });
                    }
                    if (typeof addFoodMacros === 'function') addFoodMacros();
                    const addedDiv = document.createElement('div');
                    addedDiv.style.cssText = 'margin-top:8px;padding:6px 10px;background:var(--accent);color:#fff;border-radius:8px;font-size:14px;display:inline-block;';
                    addedDiv.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M5 13l4 4L19 7"/></svg> נוסף ליומן';
                    replyTextDiv.appendChild(addedDiv);
                } catch (e) {
                    console.warn('FOOD_ADD parse error:', e);
                }
            }

            // כפתור 👎 — דיווח שהתשובה לא הייתה טובה (נשמר רק בלחיצה בפועל, לא אוטומטי)
            const fbRow = document.createElement('div');
            fbRow.style.cssText = 'display:flex;justify-content:flex-end;margin-top:6px;';
            const fbBtn = document.createElement('button');
            fbBtn.title = 'דווח שהתשובה לא הייתה טובה';
            fbBtn.style.cssText = 'border:none;background:transparent;color:var(--text-muted);cursor:pointer;padding:4px;border-radius:8px;display:flex;align-items:center;justify-content:center;transition:color .15s,background .15s,transform .15s cubic-bezier(0.16,1,0.3,1);';
            fbBtn.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14V2"/><path d="M9 18.12L10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88z"/></svg>';
            fbBtn.onclick = () => {
                if (fbBtn.disabled) return;
                fbBtn.disabled = true;
                fbBtn.style.color = '#ef4444';
                fbBtn.style.transform = 'scale(0.9)';
                fbBtn.title = 'דיווחת שהתשובה לא הייתה טובה';
                _sbSaveAiFeedback(msg, displayText);
            };
            fbRow.appendChild(fbBtn);
            replyTextDiv.appendChild(fbRow);
        }

        aiChatHistory.push({ role: 'assistant', content: displayText });
        _sbSaveAiMsg('assistant', displayText);

    } catch (err) {
        console.error('AI error:', err);
        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) {
            loadingEl.className = '';
            loadingEl.style.cssText = bubbleStyle;
            loadingEl.innerHTML = '<span style="display:inline-flex;"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 3.5V16H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 10.5h.01"/><path d="M12 10.5h.01"/><path d="M16 10.5h.01"/></svg></span><span>שגיאה בחיבור, נסה שוב.</span>';
        }
    } finally {
        _aiStreaming = false;
        _aiAbortController = null;
        _setAiSendBtnStopping(false);
    }
}

let _msgIdCounter = 0;
function _uniqueMsgId() { return 'msg-' + Date.now() + '-' + (++_msgIdCounter); }

function addLoadingMessage() {
    const container = document.getElementById('ai-chat-messages');
    const id = _uniqueMsgId();
    const div = document.createElement('div');
    div.id = id;
    div.className = 'typing-indicator';
    div.style.cssText = `
        padding: 10px 15px;
        margin: 8px 0;
        border-radius: 12px 12px 12px 4px;
        max-width: 80%;
        font-size: 20px;
        line-height: 1.5;
        background: var(--bg-card-alt);
        border: 1px solid var(--border);
        margin-left: auto;
        margin-right: 20px;
        color: #888;
        display: flex;
        align-items: center;
        gap: 8px;
    `;
    div.innerHTML = '<span style="display:inline-flex;"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 3.5V16H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 10.5h.01"/><path d="M12 10.5h.01"/><path d="M16 10.5h.01"/></svg></span><span class="typing-dots"><span></span><span></span><span></span></span>';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return id;
}

function addChatMessage(text, role, isLoading = false) {
    const container = document.getElementById('ai-chat-messages');
    const id = _uniqueMsgId();
    const div = document.createElement('div');
    div.id = id;
    div.style.cssText = `
        padding: 10px 15px;
        margin: 8px 0;
        border-radius: 12px;
        max-width: 75%;
        font-size: 17px;
        line-height: 1.5;
        display: flex;
        align-items: flex-start;
        gap: 8px;
        direction: rtl;
        ${role === 'user'
            ? 'background: var(--accent); color: white; align-self: flex-start; border-radius: 12px 12px 4px 12px; flex-direction: row-reverse;'
            : 'background: var(--bg-card-alt); border: 1px solid var(--border); align-self: flex-end; color: var(--text-primary); border-radius: 12px 12px 12px 4px;'}
    `;
    const icon = document.createElement('span');
    icon.style.cssText = 'font-size: 16px; flex-shrink: 0; margin-top: 2px;';
    icon.innerHTML = role === 'user' ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>' : '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 3.5V16H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 10.5h.01"/><path d="M12 10.5h.01"/><path d="M16 10.5h.01"/></svg>';
    const textDiv = document.createElement('div');
    textDiv.innerHTML = _formatAiReplyHtml(text);
    div.appendChild(icon);
    div.appendChild(textDiv);
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return id;
}

function loadChatHistory() {
    const container = document.getElementById('ai-chat-messages');
    const chipsRow = document.getElementById('ai-quick-chips'); // ייתכן שכבר בפנים מהצגה קודמת — שומרים כדי לא לאבד אותו בניקוי
    container.innerHTML = '';
    aiChatHistory.forEach(msg => {
        addChatMessage(msg.content, msg.role);
    });
    if (chipsRow) container.appendChild(chipsRow);
}

async function buildSystemPrompt() {
    const weight = sessionStorage.getItem('current_weight') || CLIENT.currentWeight;
    const workoutStreak = localStorage.getItem('workout_streak') || '0';
    const nutritionStreak = sessionStorage.getItem('nutrition_streak') || '0';
    const dayNumber = Math.floor((new Date() - new Date(CLIENT.startDate)) / (1000 * 60 * 60 * 24)) + 1;
    const todayDay = new Date().getDay();
    const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    const todayWorkout = Object.entries(CLIENT.workoutDays || {}).find(([letter, days]) => days.includes(todayDay));
    const todayWorkoutInfo = todayWorkout
        ? `אימון יום ${dayNames[todayDay]} (${(CLIENT['workout'+todayWorkout[0]] || []).map(e => e.name).join(', ')})`
        : 'יום מנוחה';

    const p = JSON.parse(localStorage.getItem('profile_data_v1') || '{}');
    const nickname      = p.nickname      !== undefined ? p.nickname      : CLIENT.nickname;
    const allergies     = p.allergies     !== undefined ? p.allergies     : CLIENT.allergies;
    const dislikedFoods = p.dislikedFoods !== undefined ? p.dislikedFoods : CLIENT.dislikedFoods;
    const likedFoods    = p.likedFoods    !== undefined ? p.likedFoods    : CLIENT.likedFoods;
    const goalWeight    = p.goalWeight    !== undefined ? p.goalWeight    : CLIENT.goalWeight;
    const goal          = p.goal          !== undefined ? p.goal          : CLIENT.goal;
    const gender        = p.gender        !== undefined ? p.gender        : CLIENT.gender;
    const height        = p.height        !== undefined ? p.height        : CLIENT.height;
    const activityLevel = p.activityLevel !== undefined ? p.activityLevel : CLIENT.activityLevel;
    const birthDate     = p.birthDate     !== undefined ? p.birthDate     : CLIENT.birthDate;
    const startDate     = p.startDate     !== undefined ? p.startDate     : CLIENT.startDate;
    const fullName      = p.name          !== undefined ? p.name          : CLIENT.name;

    const age = birthDate ? Math.floor((new Date() - new Date(birthDate)) / (365.25 * 24 * 60 * 60 * 1000)) : null;
    const isMale = gender === 'male';
    const genderNote = isMale
        ? 'המתאמן הוא גבר — פנה אליו בלשון זכר (לדוגמה: "עשית", "אכלת", "הגעת")'
        : 'המתאמנת היא אישה — פנה אליה בלשון נקבה (לדוגמה: "עשית", "אכלת", "הגעת" בנקבה)';
    const activityDesc = activityLevel >= 1.725 ? 'פעילות אינטנסיבית יומיומית' : activityLevel >= 1.55 ? '6 אימונים בשבוע' : activityLevel >= 1.465 ? '4-5 אימונים בשבוע' : activityLevel >= 1.375 ? '1-3 אימונים בשבוע' : 'לא עושה פעילות';

    // חישוב קלוריות יעד
    const ageCalc = age || 25;
    const { tdee, totalCalories: targetCalories } = calcNutritionTargets({
        weight: parseFloat(weight) || 80, height: parseFloat(height) || 170, age: ageCalc,
        gender: isMale ? 'male' : 'female', activityLevel: parseFloat(activityLevel) || 1.375, goal
    });

    const todayShort = new Date().toLocaleDateString('he-IL', {weekday:'short', day:'numeric', month:'numeric'});
    const nextMeetingStr = CLIENT.nextMeetingDate ? new Date(CLIENT.nextMeetingDate).toLocaleDateString('he-IL', {weekday:'short', day:'numeric', month:'numeric', hour:'2-digit', minute:'2-digit'}) : 'טרם נקבעה';
    // _up/_tgt מכילים גרמים (שם _getUserPortions נשמר לתאימות, התוכן הוא גרמים מאז המעבר)
    const _up  = (typeof window._getUserPortions === 'function') ? window._getUserPortions() : {};
    const _tgt = (typeof window._getGramTargets  === 'function') ? window._getGramTargets()  : {};
    const pVal = String(_up.protein  ?? document.getElementById('protein-val')?.innerText  ?? '0');
    const cVal = String(_up.carbs    ?? document.getElementById('carbs-val')?.innerText    ?? '0');
    const fVal = String(_up.fat      ?? document.getElementById('fat-val')?.innerText      ?? '0');
    const aVal = String(_up.alcohol  ?? '0');
    const pTgt = String(_tgt.protein ?? document.getElementById('protein-target')?.innerText?.replace('/ ','') ?? '0');
    const cTgt = String(_tgt.carbs   ?? document.getElementById('carbs-target')?.innerText?.replace('/ ','')  ?? '0');
    const fTgt = String(_tgt.fat     ?? document.getElementById('fat-target')?.innerText?.replace('/ ','')    ?? '0');
    const workoutTargets = (typeof _exerciseTargets !== 'undefined') ? _exerciseTargets : {};

    // בניית לוח אימונים לפי ימים (ללא אותיות)
    const workoutsCompact = Object.entries(CLIENT.workoutDays || {}).map(([l, days]) => {
        const exs = (CLIENT['workout'+l] || []).map(e => {
            const note = CLIENT.exerciseNotes?.[e.name] ? `(${CLIENT.exerciseNotes[e.name]})` : '';
            const t = workoutTargets[e.name];
            const repsInfo = t
                ? t.suggest_increase ? `הגיע הזמן להעלות משקל — עשה כמה שאפשר חזרות` : `${t.target_reps} חזרות עם ${t.target_weight}`
                : '';
            return `${e.name}${repsInfo ? ' ' + repsInfo : ''}${note}`;
        }).join(', ');
        return `${days.map(d => dayNames[d]).join('+')} — ${exs}`;
    }).join(' | ');

    // אימון מחר מחושב ישירות
    const tomorrowDay = (todayDay + 1) % 7;
    const tomorrowWorkout = Object.entries(CLIENT.workoutDays || {}).find(([l, days]) => days.includes(tomorrowDay));
    const tomorrowDate = new Date(); tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowShort = tomorrowDate.toLocaleDateString('he-IL', {weekday:'short', day:'numeric', month:'numeric'});
    const tomorrowInfo = tomorrowWorkout
        ? `${tomorrowShort} — ${(CLIENT['workout'+tomorrowWorkout[0]] || []).map(e => {
            const t = workoutTargets[e.name];
            return t ? t.suggest_increase ? `${e.name} — הגיע הזמן להעלות משקל, עשה כמה שאפשר חזרות` : `${e.name} ${t.target_reps} חזרות עם ${t.target_weight}` : e.name;
          }).join(', ')}`
        : `${tomorrowShort} — יום מנוחה`;

    let prompt = `מאמן כושר: אורי ישראל. עברית בלבד. ${isMale ? 'פנה בזכר' : 'פנה בנקבה'}.
לקוח: ${fullName}(${nickname}), ${isMale?'גבר':'אישה'}, ${age||'?'}י (ת.לידה: ${birthDate||'לא ידוע'}), ${height}ס"מ
ליווי: יום ${dayNumber}/${CLIENT.coachingDurationMonths ? CLIENT.coachingDurationMonths*30 : '?'} | התחלה: ${startDate} | היום: ${todayShort} | ${todayWorkoutInfo}
מחר: ${tomorrowInfo}
משקל: נוכחי ${weight} | התחלה ${CLIENT.startWeight} | יעד ${goalWeight} ק"ג
מטרה: ${goal==='cut'?'חיטוב':goal==='maintain'?'שמירה על המשקל הנוכחי':'מסה'} | TDEE: ${tdee} | יעד קלורי: ${targetCalories} (${goal==='cut'?'-250':goal==='maintain'?'0':'+250'})
פעילות: מכפיל ${activityLevel} | ${CLIENT.workoutsPerWeek||3} אימונים/שבוע
סטריקים: אימון ${workoutStreak} | תזונה ${nutritionStreak}
יעד פגישה: ${CLIENT.coachingGoal} | זום הבא: ${nextMeetingStr}
אלרגיות: ${allergies} | לא אוהב: ${dislikedFoods} | אוהב: ${likedFoods}
לוח אימונים: ${workoutsCompact}
כללים: שאלות_רפואיות/פציעה_חמורה/מצוקה_נפשית→המלץ_בעדינות_לפנות_לאיש_מקצוע_מתאים_לפי_ההקשר_(רופא/אורתופד/תזונאי/פסיכולוג/פיזיותרפיסט_או_כל_בעל_מקצוע_רלוונטי_אחר_שאינו_מאמן_כושר)_ולא_להסתמך_עליי_בלבד | לעולם_אל_תפנה_את_המשתמש_לאורי_או_לוואטסאפ_ואל_תזכיר_את_אורי_בשום_הקשר | ללא_ייעוץ_רפואי | שפה_פשוטה_מאוד: כשבאמת מסבירים משהו - הסבר כאילו למישהו בן 10 שלא מכיר מונחים, בלי ז'רגון מקצועי מפחיד, ואם חייב מונח מקצועי תרגם אותו מיד למילים פשוטות | ענה_רק_על_מה_שנשאל: תשובה ממוקדת לשאלה, בלי להוסיף הסבר על מונח בסיסי (כמו מה זה חזרה/סט/חלבון) שלא התבקש ובלי לסטות לנושא לא קשור - אבל זה לא אומר לענות ביובש, הטון עצמו נשאר חם ואכפתי, רק בלי תוספות מיותרות | עידוד_מתון: הטון תומך, חם ומתעניין באמת במה שקורה עם המשתמש - אבל בלי סיסמאות נלהגות מוגזמות ("בוא נביא אש", "יאללה כאילו קרב") ובלי לדחוף עידוד/מוטיבציה לתוך כל תשובה בכוח כשלא התבקש וזה לא טבעי להקשר | תאריך_מהנתונים_בלבד | תשובות_קצרות | מבנה_תשובה_ארוכה: כשהתשובה יותר מ2-3 משפטים - לחלק אותה לפסקאות קצרות עם שורה ריקה ביניהן, ולהשתמש בשורות שמתחילות ב-• לרשימה כשמתאים, כדי שהתשובה תיקרא בנוחות ולא כגוש טקסט אחד | אל_תשתמש_בסימן_@ | אימון_מחר_לפי_שדה_מחר_בלבד_אל_תחשב_לבד | שאלה_על_ערכי_מוצר→רק_קלוריות+חלבון+פחמימה+שומן_ל-100ג_בלי_פירוט_נוסף | המלצת_חלבון_תמיד_1.8_עד_2.2_גרם_לק״ג_גוף | טון_שיתופי: הלקוח לא לבד, אתה מלווה אותו — כשמתאים העדף ניסוח כמו "נעשה", "נעקוב", "בוא נראה" על פני ניסוח מרוחק כמו "אתה יכול", בלי להגזים או לחזור על זה בכל משפט
הוספה_ליומן: כשמשתמש מבקש להוסיף מאכל ליומן — קודם שאל לאישור בפורמט הזה בדיוק (כל מאכל בשורה נפרדת):
"אוסיף:
• [שם] [כמות] — חלבון Xג, פחמימות Xג, שומן Xג
• [שם] [כמות] — חלבון Xג, פחמימות Xג, שומן Xג
להוסיף?"
רק אחרי שהמשתמש אישר — כתוב "מעולה! הוספתי." ואחריה בשורות נפרדות: FOOD_ADD:{"name":"שם (כמות יחידה)","grams":X,"protein_g":X,"fat_g":X,"carbs_g":X,"alcohol_g":X} | אם המאכל/משקה מכיל אלכוהול טהור כלול alcohol_g (גרם אלכוהול, לא נפח המשקה), אחרת 0 | FOOD_ADD הוא קוד מערכת בלתי נראה — אל תסביר אותו, רק כתוב אותו בשורה נפרדת | אם תיקן — עדכן ושאל שוב | אל תוסיף FOOD_ADD ללא אישור
הצעת_ארוחה: כשמשתמש מבקש רעיון/הצעה לארוחה — קודם שאל לפחות 3 שאלות קצרות (מקסימום 4), בניסוח טבעי ולא קבוע לפי המצב, מתוך: (1) כמה מאמץ/זמן הכנה יש לו כרגע (מהיר בלי בישול, או מוכן להשקיע במטבח), (2) אילו מצרכים יש/אין לו בבית, (3) האם זו הארוחה האחרונה שלו היום או יש עוד ארוחות אחריה, (4) לפי הקשר — חשק (מתוק/מלוח/חם/קר) | שאל שאלה אחת בכל הודעה, לא את כולן ביחד, ואל תתקדם להמלצה לפני שאלת לפחות 3 | אחרי שיש מספיק מידע — תן המלצה אחת מדויקת בלבד (לא רשימת אפשרויות): שם הארוחה והמרכיבים בכמות, הסבר קצר (משפט אחד) למה נבחרה בדיוק היא (מתאימה למה שנשאר לו/למצרכים שיש לו/להעדפות שלו), וסיכום מאקרו של הארוחה כולה (קלוריות, חלבון, פחמימה, שומן) | בשלב הזה בלי שלבי הכנה — בסוף ההמלצה תמיד שאל אם הוא רוצה את המתכון המדויק, ותן שלבי הכנה פשוטים רק אם הוא מאשר | אחרי זה אפשר להמשיך ולכוונן ביחד (למשל להחליף מרכיב) כשיחה רגילה | אם המשתמש כבר חרג מהיעד היום — ציין את זה בעדינות ואפשר להציע כיוון קליל יותר, אבל לעולם אל תגיד לו לא לאכול או תשפוט אותו על זה, זו בחירה שלו | כלל בטיחות קשיח וללא פשרות: לעולם אל תמליץ על מאכל שמכיל אלרגן שלו, גם אם הוא מבקש או מתעקש
זיכרון_אישי: יש לך פתק זיכרון קצר על המשתמש (מופיע למטה תחת "זיכרון על המשתמש") שנשמר בין שיחות — הוא עוזר לך להיות מאמן אישי שמכיר אותו. כשהמשתמש חולק עובדה אישית קבועה ששווה לזכור לטווח ארוך (העדפה, מגבלה, פציעה, מטרה, נסיבות חיים), או מתקן/מבטל עובדה קיימת (למשל "כבר לא כואב לי הברך") — עדכן את הפתק: כתוב בשורה נפרדת בסוף התשובה MEMORY_UPDATE:{"summary":"הפתק המלא והמעודכן — כל מה שכבר היה ועדיין רלוונטי, בתוספת/פחות השינוי"} | זהו קוד מערכת בלתי נראה, אל תסביר אותו ואל תזכיר אותו, פשוט כתוב אותו בשורה נפרדת | עדכן רק על עובדות קבועות ומשמעותיות, לא על כל דבר חולף | שמור את הפתק קצר (עד כמה משפטים), בגוף שלישי`;

    // בלוק משתנה — מתעדכן תוך כדי שיחה (מאקרו חי + ציון נוכחי). מצורף בסוף כדי לא לשבור מטמון.
    // השעה המדויקת נכנסת כאן (לא בבלוק הקבוע למעלה) כי היא משתנה כל דקה — שם היא הייתה שוברת את מטמון הפרומפט בכל הודעה
    let volatile = `\n\nהשעה עכשיו: ${new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;

    const userId = getActiveUserId();

    // פתק הזיכרון ארוך-הטווח — נטען טרי בכל הודעה (עשוי להתעדכן תוך כדי שיחה דרך MEMORY_UPDATE)
    let _aiMemoryNote = '';
    try {
        const { data: _mem } = await db.from('ai_memory').select('summary').eq('user_id', userId).maybeSingle();
        if (_mem && _mem.summary) _aiMemoryNote = _mem.summary;
    } catch (e) {}

    const { monStr, sunStr } = typeof getWeekRange === 'function' ? getWeekRange() : (() => {
        const now = new Date();
        const sun = new Date(now); sun.setDate(now.getDate() - now.getDay()); // back to Sunday
        const sat = new Date(sun); sat.setDate(sun.getDate() + 6);
        const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        return { monStr: fmt(sun), sunStr: fmt(sat) };
    })();

    // קבוצה משתנה — תמיד חיה
    const [curWorkoutRes, curNutRes, curWeightRes, curCardioRes] = await Promise.allSettled([
        db.from('workout_performance_log').select('date').eq('client_id', userId).gte('date', monStr).lte('date', sunStr),
        db.from('daily_nutrition').select('date, protein:protein_g, carbs:carbs_g, fat:fat_g').eq('user_id', userId).gte('date', monStr).lte('date', sunStr),
        db.from('weight_history').select('date').eq('user_id', userId).gte('date', monStr).lte('date', sunStr).limit(1),
        db.from('cardio_log').select('date, minutes').eq('user_id', userId).gte('date', monStr).lte('date', sunStr),
    ]);

    // ציון שבועי נוכחי
    const curWorkoutData = curWorkoutRes.status === 'fulfilled' ? curWorkoutRes.value.data : null;
    const curNutData     = curNutRes.status     === 'fulfilled' ? curNutRes.value.data     : null;
    const curWeightData  = curWeightRes.status  === 'fulfilled' ? curWeightRes.value.data  : null;
    const curCardioData  = curCardioRes.status  === 'fulfilled' ? curCardioRes.value.data  : null;

    // אירובי: לוח שבועי (CLIENT.cardioSchedule), יעד דקות, וכמה בפועל נעשה השבוע/היום
    if (curCardioData !== null) {
        const cardioGoal = CLIENT.cardioWeeklyGoalMinutes ?? 150;
        const cardioDoneMinutes = curCardioData.reduce((sum, r) => sum + (r.minutes || 0), 0);
        const todayStr = typeof localDateStr === 'function' ? localDateStr() : new Date().toLocaleDateString('en-CA');
        const cardioScheduledToday = CLIENT.cardioSchedule?.[todayDay];
        const cardioDoneToday = curCardioData.some(r => r.date === todayStr);
        const todayCardioNote = cardioScheduledToday
            ? `היום מתוכנן אירובי (${cardioScheduledToday.minutes} דק') — ${cardioDoneToday ? 'כבר בוצע' : 'עדיין לא בוצע'}`
            : 'אין אירובי מתוכנן היום';
        volatile += `\n\nאירובי השבוע (${monStr} – ${sunStr}): ${cardioDoneMinutes}/${cardioGoal} דקות | ${todayCardioNote}`;
    }
    if (curWorkoutData !== null) {
        const weeklyTarget  = Object.values(CLIENT.workoutDays || {}).reduce((s, days) => s + days.length, 0) || CLIENT.workoutsPerWeek || 3;
        const workoutCount  = new Set((curWorkoutData || []).map(r => r.date)).size;

        // יעדי גרמים אישיים — נוסחה זהה ל-calcPortionTargets()/cron/auth.js
        const _w   = CLIENT.currentWeight || CLIENT.startWeight || 80;
        const _age = CLIENT.birthDate ? Math.floor((new Date() - new Date(CLIENT.birthDate)) / (1000*60*60*24*365.25)) : 30;
        const { proteinGrams: tgProtein, carbsGrams: tgCarbs, fatGrams: tgFat } = calcNutritionTargets({
            weight: _w, height: CLIENT.height || 170, age: _age, gender: CLIENT.gender || 'male',
            activityLevel: CLIENT.activityLevel || 1.4, goal: CLIENT.goal,
            proteinRatio: CLIENT.proteinRatio, carbRatio: CLIENT.carbRatio
        });

        let nutritionMet = 0;
        (curNutData || []).forEach(r => {
            if (r.protein >= tgProtein && r.carbs >= tgCarbs && r.fat >= tgFat) nutritionMet++;
        });
        const hasWeightThisWeek = curWeightData && curWeightData.length > 0;
        const ws = Math.min(workoutCount / weeklyTarget, 1);
        const ns = Math.min(nutritionMet / 7, 1);
        const hs = hasWeightThisWeek ? 1 : 0;
        const curScore = Math.round((ws * 0.4 + ns * 0.4 + hs * 0.2) * 100);
        volatile += `\n\nציון שבועי נוכחי (${monStr} – ${sunStr}): ${curScore}% | אימונים: ${workoutCount}/${weeklyTarget} | תזונה: ${nutritionMet}/7 ימים | שקילה: ${hasWeightThisWeek ? 'כן' : 'לא'}`;
    }

    // קבוצה יציבה — ממטמון או שליפה חד-פעמית
    let stableText = '';
    if (_aiStableCtx.loaded && _aiStableCtx.userId === userId) {
        stableText = _aiStableCtx.text;
    } else {
        const [logsRes, scoresRes, qRes, weightRes] = await Promise.allSettled([
            db.from('workout_performance_log').select('exercise_name, date, weight_kg, reps').eq('client_id', userId).order('date', { ascending: false }),
            db.from('weekly_scores').select('week_start, score, workouts_score, nutrition_score, habits_score').eq('client_id', userId).order('week_start', { ascending: false }),
            db.from('weekly_questionnaire').select('submitted_at, q1_win, q2_challenge, q3_score, q4_topic').eq('client_id', userId).order('submitted_at', { ascending: false }).limit(1).maybeSingle(),
            db.from('weight_history').select('date, weight').eq('user_id', userId).order('date', { ascending: false }).limit(10),
        ]);

        const logs      = logsRes.status   === 'fulfilled' ? logsRes.value.data   : null;
        const scoreRows = scoresRes.status === 'fulfilled' ? scoresRes.value.data : null;
        const qRow      = qRes.status      === 'fulfilled' ? qRes.value.data      : null;
        const wRows     = weightRes.status === 'fulfilled' ? weightRes.value.data : null;

        if (logs && logs.length) {
            const byExercise = {};
            logs.forEach(r => {
                if (!byExercise[r.exercise_name]) byExercise[r.exercise_name] = [];
                byExercise[r.exercise_name].push(r);
            });
            const lines = Object.entries(byExercise).map(([name, rows]) => {
                const latest = rows[0];
                const bestWeight = Math.max(...rows.map(r => r.weight_kg));
                return `• ${name}: אחרון ${latest.date} — ${latest.weight_kg} x ${latest.reps} חזרות. שיא: ${bestWeight}`;
            });
            stableText += '\n\nנתוני ביצועי אימון אחרונים:\n' + lines.join('\n');
        }

        if (scoreRows && scoreRows.length) {
            stableText += '\n\nהיסטוריית ציונים שבועיים (8 אחרונים):\n' + scoreRows.slice(0, 8).map(r => `• ${r.week_start}: ${Math.round(r.score)} נק׳ | אימונים: ${Math.round(r.workouts_score)} | תזונה: ${Math.round(r.nutrition_score)} | הרגלים: ${Math.round(r.habits_score)}`).join('\n');
        }

        if (qRow) {
            stableText += `\n\nשאלון שבועי אחרון (${new Date(qRow.submitted_at).toLocaleDateString('he-IL')}):\n- ניצחון: ${qRow.q1_win}\n- אתגר: ${qRow.q2_challenge}\n- ציון עמידה: ${qRow.q3_score}/10\n- הערות: ${qRow.q4_topic}`;
        }

        if (wRows && wRows.length) {
            stableText += '\n\nהיסטוריית משקל גוף (10 אחרונים):\n' + wRows.map(r => `• ${r.date}: ${r.weight} ק״ג`).join('\n');
        }

        _aiStableCtx = { userId, loaded: true, text: stableText };
    }

    prompt += stableText;

    // יומן מאכלים — נשלף פעם אחת מתחילת הליווי, ומשמש גם לפירוט 7 ימים אחרונים וגם למאכלים השכיחים ביותר
    if (typeof sbFetchFoodLogRange === 'function') {
        try {
            const _fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            const allFoodRows = await sbFetchFoodLogRange(userId, startDate || _fmt(new Date()));
            if (allFoodRows && allFoodRows.length) {
                const sevenDaysAgo = new Date();
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
                const sevenDaysAgoStr = _fmt(sevenDaysAgo);
                const foodRows = allFoodRows.filter(r => r.date >= sevenDaysAgoStr);

                const byDay = {};
                foodRows.forEach(r => {
                    (byDay[r.date] = byDay[r.date] || []).push(r);
                });
                const dayLines = Object.keys(byDay).sort().map(date => {
                    const items = byDay[date].map(r => {
                        const macros = [];
                        if (r.protein_g) macros.push(`ח${r.protein_g}g`);
                        if (r.carbs_g)   macros.push(`פ${r.carbs_g}g`);
                        if (r.fat_g)     macros.push(`ש${r.fat_g}g`);
                        const m = macros.length ? ` (${macros.join('/')})` : '';
                        return `${r.time || '--:--'} ${r.food}${r.grams ? ` ${r.grams}g` : ''}${m}`;
                    }).join(', ');
                    return `• ${date}: ${items}`;
                });
                if (dayLines.length) {
                    prompt += '\n\nיומן מאכלים (7 ימים, בגרמים מדויקים; ח=חלבון פ=פחמימה ש=שומן):\n' + dayLines.join('\n');
                    prompt += '\nהמאקרו כאן מדויק כפי שנרשם — אל תעגל ואל תמיר, השתמש בערכים כמו שהם.';
                }

                const freqCount = {};
                allFoodRows.forEach(r => { freqCount[r.food] = (freqCount[r.food] || 0) + 1; });
                const topFoods = Object.entries(freqCount).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name]) => name);
                if (topFoods.length) {
                    prompt += `\n\nמאכלים שהמשתמש הכי הרבה מזין ביומן (מכל ההיסטוריה, מהשכיח לפחות שכיח): ${topFoods.join(', ')} — אפשר להיעזר בזה כשמציעים ארוחה, זה מה שהוא כנראה אוהב/רגיל לאכול.`;
                }
            }
        } catch (e) { /* נכשל בשקט */ }
    }

    // מאקרו חי של היום (בגרמים) — משתנה תוך כדי שיחה, לכן בבלוק המשתנה בסוף
    const _p = parseFloat(pVal) || 0;
    const _c = parseFloat(cVal) || 0;
    const _f = parseFloat(fVal) || 0;
    const _a = parseFloat(aVal) || 0;
    const _pKcal = Math.round(_p * 4);
    const _cKcal = Math.round(_c * 4);
    const _fKcal = Math.round(_f * 9);
    const _aKcal = Math.round(_a * 7);
    const _total = _pKcal + _cKcal + _fKcal + _aKcal;
    const _ptgt = parseFloat(pTgt) || 0;
    const _ctgt = parseFloat(cTgt) || 0;
    const _ftgt = parseFloat(fTgt) || 0;
    const _pRem = Math.round((_ptgt - _p) * 10) / 10;
    const _cRem = Math.round((_ctgt - _c) * 10) / 10;
    const _fRem = Math.round((_ftgt - _f) * 10) / 10;
    volatile += `\n\nתזונה היום: חלבון ${_p}/${_ptgt} גרם (נשאר: ${_pRem}) | פחמימה ${_c}/${_ctgt} גרם (נשאר: ${_cRem}) | שומן ${_f}/${_ftgt} גרם (נשאר: ${_fRem})${_a > 0 ? ` | אלכוהול ${_a} גרם (${_aKcal} קק"ל)` : ''} | סה"כ ${_total} קק"ל (יעד: ${targetCalories} קק"ל)`;
    volatile += `\nכשנשאלים "כמה נשאר" — תן תשובה ישירה בלי חישובים: "נשאר Xג חלבון, Yג פחמימה, Zג שומן" בלבד.`;
    volatile += `\nכשנשאלים כמה קלוריות/חלבון/פחמימה/שומן נאכלו היום — תמיד השתמש בערכים המוכנים משורת "תזונה היום" (כולל ה-סה"כ) בדיוק כפי שהם, אל תחשב בעצמך מפריטי יומן המאכלים.`;

    // פתק הזיכרון ארוך-הטווח על המשתמש — בבלוק המשתנה כדי שעדכונים ייכנסו מיד
    volatile += `\n\nזיכרון על המשתמש (מה שאתה זוכר עליו מהיכרות והשיחות הקודמות — השתמש בזה כדי להיות אישי ורלוונטי, בלי להזכיר שיש לך "פתק"): ${_aiMemoryNote || 'עדיין אין, זו ההיכרות הראשונית'}`;

    // קבוע (נשמר במטמון) + משתנה (בסוף) = אותו מידע בדיוק, סדר ממוטב למטמון
    return prompt + volatile;
}

function checkBirthday() {
    const today = new Date();
    const birth = new Date(CLIENT.birthDate);
    
    if (today.getMonth() === birth.getMonth() && today.getDate() === birth.getDate()) {
        const newAge = today.getFullYear() - birth.getFullYear();
        generatePortionGoals();
        document.getElementById('birthday-msg').innerHTML = `היי ${_esc(CLIENT.nickname)}! <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><rect x="4" y="13" width="16" height="7" rx="1.5"/><path d="M4 16h16"/><path d="M8 13v-2a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M12 10V7"/><path d="M12 7c-1-1-1-2 0-3 1 1 1 2 0 3z"/></svg> יום הולדת ${newAge} שמח! מאחלים לך המון בריאות, אושר וכושר, מזל טוב! <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M20.8 8.6c0 5.6-8.8 10.6-8.8 10.6S3.2 14.2 3.2 8.6a4.6 4.6 0 0 1 8.8-1.8 4.6 4.6 0 0 1 8.8 1.8z"/></svg>`;
        
        const todayStr = today.toISOString().split('T')[0];
if (localStorage.getItem('birthday_shown') !== todayStr) {
    localStorage.setItem('birthday_shown', todayStr);
    setTimeout(() => {
        document.getElementById('birthday-modal').style.display = 'block';
    }, 2000);
}
    }
}

// ניקוי שיחה: מוחק את היסטוריית הצ'אט (בזיכרון ובשרת), אך משאיר את פתק הזיכרון ארוך-הטווח
function resetAIChat() {
    _aiStableCtx = { userId: null, loaded: false, text: '' };
    aiChatHistory = [];
    try {
        const uid = getActiveUserId();
        if (uid) db.from('ai_chat_history').delete().eq('user_id', uid).then(() => {}, () => {});
    } catch (e) {}
    initAIChat(); // loadChatHistory (בתוכה) כבר מנקה את container ובונה מחדש
}
