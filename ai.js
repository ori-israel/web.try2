function openAIChat() {
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

async function sendAIMessage() {
    const input = document.getElementById('ai-chat-input');
    const msg = input.value.trim();
    if (!msg) return;

    const _countKey = 'ai_message_count_' + localDateStr();
    const _count = parseInt(localStorage.getItem(_countKey) || '0');
    if (_count >= 50) {
        addChatMessage('הגעת למגבלת ההודעות היומית (50)', 'assistant');
        return;
    }
    localStorage.setItem(_countKey, _count + 1);

    const now = Date.now();
    if (now - (window.lastMessageTime || 0) < 6000) {
        addChatMessage('נא להמתין כמה שניות בין הודעות 🙏', 'assistant');
        return;
    }
    window.lastMessageTime = now;

    input.value = '';
    addChatMessage(msg, 'user');
    aiChatHistory.push({ role: 'user', content: msg });

    const loadingId = addLoadingMessage();

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
        const messages = aiChatHistory
            .slice(-10)
            .filter((m, i) => !(i === 0 && m.role === 'assistant'))
            .map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
            }));

        const response = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'gemini-2.5-flash-lite',
                payload: {
                    system_instruction: { parts: [{ text: await buildSystemPrompt() }] },
                    generation_config: { response_modalities: ["TEXT"] },
                    contents: messages
                }
            })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

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
                } catch {}
            }
        }

        if (replyTextDiv) {
            replyTextDiv.innerHTML = fullText
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n/g, '<br>');
        }

        aiChatHistory.push({ role: 'assistant', content: fullText });
        sessionStorage.setItem('ai_chat_history', JSON.stringify(aiChatHistory));

    } catch (err) {
        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) {
            loadingEl.className = '';
            loadingEl.style.cssText = bubbleStyle;
            loadingEl.innerHTML = '<span style="font-size:16px;">🤖</span><span>שגיאה בחיבור, נסה שוב.</span>';
        }
    }
}

function addLoadingMessage() {
    const container = document.getElementById('ai-chat-messages');
    const id = 'msg-' + Date.now();
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
    div.innerHTML = '<span style="font-size:16px;">🤖</span><span></span>';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return id;
}

function addChatMessage(text, role, isLoading = false) {
    const container = document.getElementById('ai-chat-messages');
    const id = 'msg-' + Date.now();
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
        ? `יום אימון ${todayWorkout[0]} (${CLIENT['workout'+todayWorkout[0]].map(e => e.name).join(', ')})`
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

    let prompt = `אתה עוזר אישי של מאמן כושר בשם אורי ישראל. עונה בעברית בלבד, בסגנון חם וישיר.
${genderNote}.

נתוני לקוח:
- שם מלא: ${fullName} | כינוי: ${nickname}
- מין: ${isMale ? 'גבר' : 'אישה'} | גיל: ${age || 'לא ידוע'} | תאריך לידה: ${birthDate} | גובה: ${height} ס"מ
- יום ${dayNumber} מתחילת הליווי | התחלה: ${startDate} | התאריך המדויק: ${new Date().toLocaleDateString('he-IL', {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'})} — ${todayWorkoutInfo}
- משקל נוכחי: ${weight} ק"ג | משקל התחלתי: ${CLIENT.startWeight} ק"ג | יעד: ${goalWeight} ק"ג
- מטרה: ${goal === 'bulk' ? 'מסה' : 'חיטוב'} | רמת פעילות: ${activityDesc} (מכפיל ${activityLevel} — ${activityLevel <= 1.3 ? 'בישיבה, מעט פעילות' : activityLevel <= 1.4 ? 'פעילות קלה 1-2 ימים בשבוע' : activityLevel <= 1.55 ? 'פעילות מתונה 3-5 ימים בשבוע' : activityLevel <= 1.725 ? 'פעילות אינטנסיבית 6-7 ימים' : 'אתלט/עבודה פיזית'})
- סטריק אימונים: ${workoutStreak} | סטריק תזונה: ${nutritionStreak}
- יעד לפגישה: ${localStorage.getItem('coaching_goal') || CLIENT.coachingGoal}
- אלרגיות: ${allergies}
- לא אוהב: ${dislikedFoods}
- אוהב: ${likedFoods}

תזונה היום:
- חלבון: ${document.getElementById('protein-val')?.innerText}/${document.getElementById('protein-target')?.innerText?.replace('/ ','')} מנות
- פחמימה: ${document.getElementById('carbs-val')?.innerText}/${document.getElementById('carbs-target')?.innerText?.replace('/ ','')} מנות
- שומן: ${document.getElementById('fat-val')?.innerText}/${document.getElementById('fat-target')?.innerText?.replace('/ ','')} מנות

אימונים שבועיים:
${Object.entries(CLIENT.workoutDays || {}).map(([l, days]) =>
    `${days.map(d => dayNames[d]).join('+')}: ${CLIENT['workout'+l].map(e => e.name).join(', ')}`
).join('\n')}

מנות: חלבון=25-30גר | פחמימה=35-40גר | שומן=10-15גר

חוקים:
1. התאמה אישית מורכבת → "שלח לאורי בווטסאפ"
2. אסור ייעוץ רפואי
3. תמיד עודד
4. התאריך והיום שסופקו בנתוני הלקוח הם המדויקים — אל תסתמך על הידע שלך לגבי תאריכים.
5. תשובות קצרות וממוקדות — רק כמה משפטים. אם השאלה פשוטה, תשובה קצרה. רק אם השאלה מורכבת תרחיב.`;

    const userId = getActiveUserId();

    const [logsRes, scoresRes, qRes, weightRes] = await Promise.allSettled([
        db.from('workout_performance_log').select('exercise_name, date, weight_kg, reps').eq('client_id', userId).order('date', { ascending: false }),
        db.from('weekly_scores').select('week_start, score, workouts_score, nutrition_score, habits_score').eq('client_id', userId).order('week_start', { ascending: false }),
        db.from('weekly_questionnaire').select('submitted_at, q1_win, q2_challenge, q3_score, q4_topic').eq('client_id', userId).order('submitted_at', { ascending: false }).limit(1).single(),
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
        prompt += '\n\nנתוני ביצועי אימון אחרונים:\n' + lines.join('\n');
    }

    if (scoreRows && scoreRows.length) {
        prompt += '\n\nהיסטוריית ציונים שבועיים:\n' + scoreRows.map(r => `• ${r.week_start}: ${Math.round(r.score)} נק׳ | אימונים: ${Math.round(r.workouts_score)} | תזונה: ${Math.round(r.nutrition_score)} | הרגלים: ${Math.round(r.habits_score)}`).join('\n');
    }

    if (qRow) {
        prompt += `\n\nשאלון שבועי אחרון (${new Date(qRow.submitted_at).toLocaleDateString('he-IL')}):\n- ניצחון: ${qRow.q1_win}\n- אתגר: ${qRow.q2_challenge}\n- ציון עמידה: ${qRow.q3_score}/10\n- הערות: ${qRow.q4_topic}`;
    }

    if (wRows && wRows.length) {
        prompt += '\n\nהיסטוריית משקל גוף (10 אחרונים):\n' + wRows.map(r => `• ${r.date}: ${r.weight} ק״ג`).join('\n');
    }

    return prompt;
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
    aiChatHistory = [];
    sessionStorage.removeItem('ai_chat_history');
    const container = document.getElementById('ai-chat-messages');
    container.innerHTML = '';
    openAIChat();
}
