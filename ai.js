function openAIChat() {
    _aiStableCtx = { userId: null, loaded: false, text: '' };
    document.getElementById('ai-chat-overlay').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    loadChatHistory();
    if (aiChatHistory.length === 0) {
        addChatMessage(`היי ${CLIENT.nickname}! 👋 אני המאמן AI של אורי. אפשר לשאול אותי כל שאלה על תזונה, אימונים והתאוששות. במה אוכל לעזור?`, 'assistant');
    }
}

function closeAIChat() {
    document.getElementById('ai-chat-overlay').style.display = 'none';
    document.body.style.overflow = 'auto';
}

let aiChatHistory = JSON.parse(sessionStorage.getItem('ai_chat_history') || '[]');
let _aiStableCtx = { userId: null, loaded: false, text: '' };

// מצב חיפוש באינטרנט — כבוי כברירת מחדל
window.aiWebSearch = false;
function _buildUSDAContext(text) {
    if (typeof USDA_TABLE === 'undefined') return '';
    const t = text.toLowerCase();
    const allHits = USDA_TABLE.filter(r => {
        if (text.includes(r.name)) return true;
        if (t.includes(r.name_en.toLowerCase())) return true;
        const firstTwo = r.name.split(' ').slice(0, 2).join(' ');
        return firstTwo.length > 3 && text.includes(firstTwo);
    });
    if (!allHits.length) return '';
    // קבץ לפי שתי המילים הראשונות — שמור רק את ההתאמה הטובה ביותר לכל שם
    const seen = {};
    const hits = allHits.filter(r => {
        const key = r.name.split(' ').slice(0, 2).join(' ');
        if (seen[key]) return false;
        seen[key] = true;
        return true;
    });
    return hits.slice(0, 5).map(r => `${r.name} — חלבון ${r.protein}g שומן ${r.fat}g פחמימות ${r.carbs}g ל-100ג`).join(' | ');
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
    const input = document.getElementById('ai-chat-input');
    const msg = input.value.trim();
    if (!msg) return;

    // הגבלת 6 שניות בין הודעות — נשלח מיד ומחכים ברקע (בלי הודעת "המתן")
    const now = Date.now();
    const _sinceLast = now - (parseInt(sessionStorage.getItem('ai_last_msg_time') || '0'));
    const _waitMs = _sinceLast < 6000 ? 6000 - _sinceLast : 0;
    sessionStorage.setItem('ai_last_msg_time', now + _waitMs); // שומר תור גם להודעות מהירות רצופות

    input.value = '';
    addChatMessage(msg, 'user');
    aiChatHistory.push({ role: 'user', content: msg });
    const usdaCtx = _buildUSDAContext(msg);
    const msgWithUSDA = usdaCtx ? `${msg}\n\n[נתוני USDA: ${usdaCtx}]` : msg;

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
        const historySlice = aiChatHistory.slice(-6).filter((m, i) => !(i === 0 && m.role === 'assistant'));
        const messages = historySlice.map((m, i) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: (i === historySlice.length - 1 && m.role === 'user') ? msgWithUSDA : m.content }]
        }));

        const { data: { session: _aiSession } } = await db.auth.getSession();
        if (!_aiSession) throw new Error('לא מחובר');

        const response = await fetch('/api/gemini', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${_aiSession.access_token}`,
            },
            body: JSON.stringify({
                model: 'gemini-2.5-flash',
                payload: {
                    system_instruction: { parts: [{ text: await buildSystemPrompt() }] },
                    generation_config: { response_modalities: ["TEXT"], thinking_config: { thinking_budget: 0 } },
                    contents: messages,
                    ...(window.aiWebSearch ? { tools: [{ google_search: {} }] } : {})
                }
            })
        });

        if (!response.ok) {
            let _msg = 'שגיאה בחיבור, נסה שוב.';
            if (response.status === 429) {
                const _e = await response.json().catch(() => ({}));
                _msg = _e.error || 'הגעת למגבלה היומית. נסה שוב מחר.';
            }
            const loadingEl = document.getElementById(loadingId);
            if (loadingEl) {
                loadingEl.className = '';
                loadingEl.style.cssText = bubbleStyle;
                loadingEl.innerHTML = `<span style="font-size:16px;">🤖</span><span>${_msg}</span>`;
            }
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        const loadingEl = document.getElementById(loadingId);
        let replyTextDiv = null;
        if (loadingEl) {
            loadingEl.className = '';
            loadingEl.style.cssText = bubbleStyle;
            const icon = document.createElement('span');
            icon.style.cssText = 'font-size: 16px; flex-shrink: 0; margin-top: 2px;';
            icon.innerText = '🤖';
            replyTextDiv = document.createElement('div');
            loadingEl.innerHTML = '';
            loadingEl.appendChild(icon);
            loadingEl.appendChild(replyTextDiv);
        }

        let fullText = '';
        let buffer = '';
        let lastGrounding = null;

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
        const displayText = fullText
            .replace(/FOOD_ADD:\{[\s\S]*?\}/g, '')
            .replace(/THOUGHT:[\s\S]*?(?=\n\n|$)/gi, '') // רשת ביטחון: הסרת מחשבה פנימית שדלפה
            .trim();

        if (replyTextDiv) {
            // בניית HTML בטוח — הטקסט עובר escaping, רק bold ושורות מותרים
            const safeHtml = displayText
                .split(/\*\*(.*?)\*\*/g)
                .map((part, i) => {
                    const escaped = part.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                    return i % 2 === 1 ? `<strong>${escaped}</strong>` : escaped.replace(/\n/g, '<br>');
                })
                .join('');
            replyTextDiv.innerHTML = safeHtml;

            // הצגת מקורות (חובה לפי תנאי Google כשמשתמשים בחיפוש)
            const chunks = lastGrounding?.groundingChunks || [];
            const links = chunks
                .filter(c => c.web?.uri)
                .map(c => {
                    const safeTitle = (c.web.title || 'מקור').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                    const safeUri   = c.web.uri.replace(/"/g, '%22');
                    return `<a href="${safeUri}" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:underline;">🔗 ${safeTitle}</a>`;
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
                    const portions = _calcPortionsFromMacros(foodData.protein_g || 0, foodData.carbs_g || 0, foodData.fat_g || 0);
                    addFoodLogEntry({
                        name:             foodData.name,
                        grams:            Math.round(foodData.grams || 0),
                        portions_protein: portions.protein || null,
                        portions_carbs:   portions.carbs   || null,
                        portions_fat:     portions.fat     || null
                    });
                    if (portions.protein) modifyPortion('protein', portions.protein);
                    if (portions.carbs)   modifyPortion('carbs',   portions.carbs);
                    if (portions.fat)     modifyPortion('fat',     portions.fat);
                    }
                    const addedDiv = document.createElement('div');
                    addedDiv.style.cssText = 'margin-top:8px;padding:6px 10px;background:var(--accent);color:#fff;border-radius:8px;font-size:14px;display:inline-block;';
                    addedDiv.textContent = '✅ נוסף ליומן';
                    replyTextDiv.appendChild(addedDiv);
                } catch (e) {
                    console.warn('FOOD_ADD parse error:', e);
                }
            }
        }

        aiChatHistory.push({ role: 'assistant', content: displayText });
        sessionStorage.setItem('ai_chat_history', JSON.stringify(aiChatHistory));

    } catch (err) {
        console.error('AI error:', err);
        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) {
            loadingEl.className = '';
            loadingEl.style.cssText = bubbleStyle;
            loadingEl.innerHTML = '<span style="font-size:16px;">🤖</span><span>שגיאה בחיבור, נסה שוב.</span>';
        }
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
    div.innerHTML = '<span style="font-size:16px;">🤖</span><span class="typing-dots"><span></span><span></span><span></span></span>';
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
    icon.innerText = role === 'user' ? '👤' : '🤖';
    const textDiv = document.createElement('div');
    textDiv.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    div.appendChild(icon);
    div.appendChild(textDiv);
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return id;
}

function loadChatHistory() {
    const container = document.getElementById('ai-chat-messages');
    container.innerHTML = '';
    aiChatHistory.forEach(msg => {
        addChatMessage(msg.content, msg.role);
    });
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
    let bmr = (10 * (parseFloat(weight) || 80)) + (6.25 * (parseFloat(height) || 170)) - (5 * ageCalc);
    bmr = isMale ? bmr + 5 : bmr - 161;
    const tdee = Math.round(bmr * (parseFloat(activityLevel) || 1.375));
    const targetCalories = goal === 'cut' ? tdee - 250 : tdee + 250;

    const todayShort = new Date().toLocaleDateString('he-IL', {weekday:'short', day:'numeric', month:'numeric'});
    const nextMeetingStr = CLIENT.nextMeetingDate ? new Date(CLIENT.nextMeetingDate).toLocaleDateString('he-IL', {weekday:'short', day:'numeric', month:'numeric', hour:'2-digit', minute:'2-digit'}) : 'טרם נקבעה';
    const pVal = document.getElementById('protein-val')?.innerText || '0';
    const pTgt = document.getElementById('protein-target')?.innerText?.replace('/ ','') || '?';
    const cVal = document.getElementById('carbs-val')?.innerText || '0';
    const cTgt = document.getElementById('carbs-target')?.innerText?.replace('/ ','') || '?';
    const fVal = document.getElementById('fat-val')?.innerText || '0';
    const fTgt = document.getElementById('fat-target')?.innerText?.replace('/ ','') || '?';
    const pv   = typeof portionValues !== 'undefined' ? portionValues : { protein: 27.5, carbs: 37.5, fat: 12.5 };
    const workoutTargets = (typeof _exerciseTargets !== 'undefined') ? _exerciseTargets : {};

    // בניית לוח אימונים לפי ימים (ללא אותיות)
    const workoutsCompact = Object.entries(CLIENT.workoutDays || {}).map(([l, days]) => {
        const exs = (CLIENT['workout'+l] || []).map(e => {
            const note = CLIENT.exerciseNotes?.[e.name] ? `(${CLIENT.exerciseNotes[e.name]})` : '';
            const t = workoutTargets[e.name];
            const repsInfo = t
                ? t.suggest_increase ? `הגיע הזמן להעלות משקל — עשה כמה שאפשר` : `${t.target_reps} חזרות עם ${t.target_weight} ק"ג`
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
            return t ? t.suggest_increase ? `${e.name} — הגיע הזמן להעלות משקל, עשה כמה שאפשר` : `${e.name} ${t.target_reps} חזרות עם ${t.target_weight} ק"ג` : e.name;
          }).join(', ')}`
        : `${tomorrowShort} — יום מנוחה`;

    let prompt = `מאמן כושר: אורי ישראל. עברית בלבד. ${isMale ? 'פנה בזכר' : 'פנה בנקבה'}.
לקוח: ${fullName}(${nickname}), ${isMale?'גבר':'אישה'}, ${age||'?'}י (ת.לידה: ${birthDate||'לא ידוע'}), ${height}ס"מ
ליווי: יום ${dayNumber}/${CLIENT.coachingDurationMonths ? CLIENT.coachingDurationMonths*30 : '?'} | התחלה: ${startDate} | היום: ${todayShort} | ${todayWorkoutInfo}
מחר: ${tomorrowInfo}
משקל: נוכחי ${weight} | התחלה ${CLIENT.startWeight} | יעד ${goalWeight} ק"ג
מטרה: ${goal==='bulk'?'מסה':'חיטוב'} | TDEE: ${tdee} | יעד קלורי: ${targetCalories} (${goal==='cut'?'-250':'+250'})
פעילות: מכפיל ${activityLevel} | ${CLIENT.workoutsPerWeek||3} אימונים/שבוע
סטריקים: אימון ${workoutStreak} | תזונה ${nutritionStreak}
יעד פגישה: ${CLIENT.coachingGoal} | זום הבא: ${nextMeetingStr}
אלרגיות: ${allergies} | לא אוהב: ${dislikedFoods} | אוהב: ${likedFoods}
לוח אימונים: ${workoutsCompact}
כללים: שאלות_מורכבות→ווטסאפ_לאורי | ללא_ייעוץ_רפואי | עודד_תמיד | תאריך_מהנתונים_בלבד | תשובות_קצרות | אל_תשתמש_בסימן_@ | אימון_מחר_לפי_שדה_מחר_בלבד_אל_תחשב_לבד | שאלה_על_ערכי_מוצר→רק_קלוריות+חלבון+פחמימה+שומן_ל-100ג_בלי_פירוט_נוסף | המלצת_חלבון_תמיד_1.8_עד_2.2_גרם_לק״ג_גוף
הוספה_ליומן: כשמשתמש מבקש להוסיף מאכל ליומן — קודם שאל לאישור בפורמט הזה בדיוק (כל מאכל בשורה נפרדת):
"אוסיף:
• [שם] [כמות] — חלבון Xג, פחמימות Xג, שומן Xג
• [שם] [כמות] — חלבון Xג, פחמימות Xג, שומן Xג
להוסיף?"
רק אחרי שהמשתמש אישר — כתוב "מעולה! הוספתי." ואחריה בשורות נפרדות: FOOD_ADD:{"name":"שם (כמות יחידה)","grams":X,"protein_g":X,"fat_g":X,"carbs_g":X} | FOOD_ADD הוא קוד מערכת בלתי נראה — אל תסביר אותו, רק כתוב אותו בשורה נפרדת | אם תיקן — עדכן ושאל שוב | אל תוסיף FOOD_ADD ללא אישור`;

    // בלוק משתנה — מתעדכן תוך כדי שיחה (מאקרו חי + ציון נוכחי). מצורף בסוף כדי לא לשבור מטמון.
    let volatile = '';

    const userId = getActiveUserId();

    const { monStr, sunStr } = typeof getWeekRange === 'function' ? getWeekRange() : (() => {
        const now = new Date();
        const sun = new Date(now); sun.setDate(now.getDate() - now.getDay()); // back to Sunday
        const sat = new Date(sun); sat.setDate(sun.getDate() + 6);
        const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        return { monStr: fmt(sun), sunStr: fmt(sat) };
    })();

    // קבוצה משתנה — תמיד חיה
    const [curWorkoutRes, curNutRes, curWeightRes] = await Promise.allSettled([
        db.from('workout_performance_log').select('date').eq('client_id', userId).gte('date', monStr).lte('date', sunStr),
        db.from('daily_nutrition').select('date, protein, carbs, fat').eq('user_id', userId).gte('date', monStr).lte('date', sunStr),
        db.from('weight_history').select('date').eq('user_id', userId).gte('date', monStr).lte('date', sunStr).limit(1),
    ]);

    // ציון שבועי נוכחי
    const curWorkoutData = curWorkoutRes.status === 'fulfilled' ? curWorkoutRes.value.data : null;
    const curNutData     = curNutRes.status     === 'fulfilled' ? curNutRes.value.data     : null;
    const curWeightData  = curWeightRes.status  === 'fulfilled' ? curWeightRes.value.data  : null;
    if (curWorkoutData !== null) {
        const weeklyTarget  = Object.values(CLIENT.workoutDays || {}).reduce((s, days) => s + days.length, 0) || CLIENT.workoutsPerWeek || 3;
        const workoutCount  = new Set((curWorkoutData || []).map(r => r.date)).size;

        // יעדי מנות אישיים — נוסחה זהה ל-calcPortionTargets()/cron/auth.js
        const _w   = CLIENT.currentWeight || CLIENT.startWeight || 80;
        const _age = CLIENT.birthDate ? Math.floor((new Date() - new Date(CLIENT.birthDate)) / (1000*60*60*24*365.25)) : 30;
        let _bmr   = (10 * _w) + (6.25 * (CLIENT.height || 170)) - (5 * _age);
        _bmr       = (CLIENT.gender || 'male') === 'male' ? _bmr + 5 : _bmr - 161;
        const _tdee  = Math.round(_bmr * (CLIENT.activityLevel || 1.4));
        const _total = CLIENT.goal === 'cut' ? _tdee - 250 : _tdee + 250;
        const _pg    = _w * (CLIENT.proteinRatio || 2);
        const _rem   = _total - _pg * 4;
        const _cc    = CLIENT.goal === 'cut' ? _rem * 0.7 : _rem * 0.6;
        const _fc    = CLIENT.goal === 'cut' ? _rem * 0.3 : _rem * 0.4;
        const tgProtein = Math.round((_pg / pv.protein) * 2) / 2;
        const tgCarbs   = Math.round((_cc / 4 / pv.carbs) * 2) / 2;
        const tgFat     = Math.round((_fc / 9 / pv.fat) * 2) / 2;

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
                return `• ${name}: אחרון ${latest.date} — ${latest.weight_kg}ק״ג x ${latest.reps} חזרות. שיא: ${bestWeight}ק״ג`;
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

    // יומן מאכלים — מה/כמה/מתי אכל ב-7 הימים האחרונים (לתובנות תזונה מדויקות)
    if (typeof sbFetchFoodLogRange === 'function') {
        try {
            const fromDate = new Date();
            fromDate.setDate(fromDate.getDate() - 6); // היום + 6 ימים אחורה = 7 ימים
            const _fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            const foodRows = await sbFetchFoodLogRange(userId, _fmt(fromDate));
            if (foodRows && foodRows.length) {
                const byDay = {};
                foodRows.forEach(r => {
                    (byDay[r.date] = byDay[r.date] || []).push(r);
                });
                const dayLines = Object.keys(byDay).sort().map(date => {
                    const items = byDay[date].map(r => {
                        const macros = [];
                        if (r.portions_protein) macros.push(`ח${r.portions_protein}`);
                        if (r.portions_carbs)   macros.push(`פ${r.portions_carbs}`);
                        if (r.portions_fat)     macros.push(`ש${r.portions_fat}`);
                        const m = macros.length ? ` (${macros.join('/')})` : '';
                        return `${r.time || '--:--'} ${r.food}${m}`;
                    }).join(', ');
                    return `• ${date}: ${items}`;
                });
                prompt += '\n\nיומן מאכלים (7 ימים, במנות; ח=חלבון פ=פחמימה ש=שומן):\n' + dayLines.join('\n');
                prompt += '\nהמרה קבועה (אל תנחש): מנה=110/150/112.5 קל׳ (ח/פ/ש), או 27.5/37.5/12.5 גרם מאקרו.';
            }
        } catch (e) { /* נכשל בשקט */ }
    }

    // מאקרו חי של היום — משתנה תוך כדי שיחה, לכן בבלוק המשתנה בסוף
    const _p = parseFloat(pVal) || 0;
    const _c = parseFloat(cVal) || 0;
    const _f = parseFloat(fVal) || 0;
    const _pG    = Math.round(_p * pv.protein * 10) / 10;
    const _cG    = Math.round(_c * pv.carbs   * 10) / 10;
    const _fG    = Math.round(_f * pv.fat      * 10) / 10;
    const _pKcal = Math.round(_p * pv.protein * 4);
    const _cKcal = Math.round(_c * pv.carbs   * 4);
    const _fKcal = Math.round(_f * pv.fat      * 9);
    const _total = _pKcal + _cKcal + _fKcal;
    const _ptgt = parseFloat(pTgt) || 0;
    const _ctgt = parseFloat(cTgt) || 0;
    const _ftgt = parseFloat(fTgt) || 0;
    const _pRem = Math.round((_ptgt - _p) * 10) / 10;
    const _cRem = Math.round((_ctgt - _c) * 10) / 10;
    const _fRem = Math.round((_ftgt - _f) * 10) / 10;
    volatile += `\n\nתזונה היום: חלבון ${_p}/${_ptgt} מנות (נשאר: ${_pRem}) | פחמימה ${_c}/${_ctgt} מנות (נשאר: ${_cRem}) | שומן ${_f}/${_ftgt} מנות (נשאר: ${_fRem}) | סה"כ ${_total} קק"ל (יעד: ${targetCalories} קק"ל)`;
    volatile += `\nכשנשאלים "כמה נשאר" — תן תשובה ישירה בלי חישובים: "נשאר X מנות חלבון, Y פחמימה, Z שומן" בלבד.`;

    // קבוע (נשמר במטמון) + משתנה (בסוף) = אותו מידע בדיוק, סדר ממוטב למטמון
    return prompt + volatile;
}

function checkBirthday() {
    const today = new Date();
    const birth = new Date(CLIENT.birthDate);
    
    if (today.getMonth() === birth.getMonth() && today.getDate() === birth.getDate()) {
        const newAge = today.getFullYear() - birth.getFullYear();
        generatePortionGoals();
        document.getElementById('birthday-msg').innerText = `היי ${CLIENT.nickname}! 🎂 יום הולדת ${newAge} שמח! מאחלים לך המון בריאות, אושר וכושר, מזל טוב! ❤️`;
        
        const todayStr = today.toISOString().split('T')[0];
if (localStorage.getItem('birthday_shown') !== todayStr) {
    localStorage.setItem('birthday_shown', todayStr);
    setTimeout(() => {
        document.getElementById('birthday-modal').style.display = 'block';
    }, 2000);
}
    }
}

function resetAIChat() {
    _aiStableCtx = { userId: null, loaded: false, text: '' };
    aiChatHistory = [];
    sessionStorage.removeItem('ai_chat_history');
    const container = document.getElementById('ai-chat-messages');
    container.innerHTML = '';
    openAIChat();
}
