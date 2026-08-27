// ===== טאב אימונים: אקורדיון, צ'קליסט, השלמת אימון =====

function showWorkout(workoutId) {
    document.querySelectorAll('.workout-container').forEach(container => {
        container.style.display = 'none';
    });
    const selected = document.getElementById('workout-' + workoutId);
    if (selected) {
        selected.style.display = 'block';
    }
    document.querySelectorAll('.workout-nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('onclick').includes(`'${workoutId}'`)) {
            btn.classList.add('active');
        }
    });
    initWorkoutTableWeights(_exerciseTargets);
}

function _cweLetterForDay(day) {
    return Object.entries(CLIENT.workoutDays || {}).find(([, days]) => days.includes(day))?.[0] || null;
}

// בורר הימים עובד לפי יום בשבוע (לא לפי אות אימון), כדי שימי אירובי-בלבד יהיו נגישים גם הם
function showWorkoutDay(day) {
    window._selectedWorkoutDay = day;
    const letter = _cweLetterForDay(day);

    document.querySelectorAll('.workout-container').forEach(c => { c.style.display = 'none'; });
    if (letter) {
        const container = document.getElementById('workout-' + letter);
        if (container) container.style.display = 'block';
    }
    document.querySelectorAll('.workout-nav-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.day, 10) === day);
    });
    initWorkoutTableWeights(_exerciseTargets);

    const emptyMsg = document.getElementById('workout-empty-day-msg');
    const hasCardio = !!CLIENT.cardioSchedule?.[day];
    if (emptyMsg) emptyMsg.style.display = (!letter && !hasCardio) ? 'block' : 'none';

    if (typeof renderCardioSection === 'function') renderCardioSection();
    if (typeof buildWorkoutAccordions === 'function') buildWorkoutAccordions(_exerciseTargets || {});
}

function _ensureWorkoutCache() {
    if (!window._workoutDataCache) window._workoutDataCache = { exercises: {}, tasks: [], exercise_weights: {} };
    return window._workoutDataCache;
}

// ===== אירובי self-serve: לוח שבועי + ביצוע יומי + התקדמות =====

function _cardioDoneKey(dateStr) {
    return 'cardio_done_' + (getActiveUserId() || 'default') + '_' + dateStr;
}

function renderCardioSection() {
    const container = document.getElementById('cardio-section');
    if (!container) return;
    container.innerHTML = '';

    const day = window._selectedWorkoutDay ?? new Date().getDay();
    const letter = _cweLetterForDay(day);
    const scheduled = CLIENT.cardioSchedule?.[day];

    // יום בלי אימון כוח: האירובי הוא כל מה שיש להיום, אז הוא מקבל כרטיס "הירו" בראש המסך
    if (scheduled && !letter) {
        const isToday = day === new Date().getDay();
        container.appendChild(_buildCardioHeroCard(scheduled, isToday));
    }

    const goal = CLIENT.cardioWeeklyGoalMinutes ?? 150;
    if (goal > 0) container.appendChild(_buildCardioProgressCard(goal));
}

function _wireCardioDoneToggle(btn, entry, dateStr) {
    btn.addEventListener('click', async () => {
        const nowDone = !btn.classList.contains('checked');
        btn.classList.toggle('checked', nowDone);
        if (nowDone) {
            localStorage.setItem(_cardioDoneKey(dateStr), '1');
            if (typeof logCardioDone === 'function') await logCardioDone(entry.type, entry.minutes);
            if (typeof refreshWorkoutStreak === 'function') refreshWorkoutStreak();
        } else {
            localStorage.removeItem(_cardioDoneKey(dateStr));
        }
        _refreshCardioProgress();
    });
}

// כרטיס בולט בראש המסך ליום שבו האירובי הוא כל מה שיש (אין אימון כוח) — כדי שלא יתפספס
function _buildCardioHeroCard(entry, interactive = true) {
    const dateStr = localDateStr();
    const isDone = interactive && !!localStorage.getItem(_cardioDoneKey(dateStr));
    const typeInfo = (typeof CARDIO_TYPES !== 'undefined' && CARDIO_TYPES[entry.type]) || { label: 'אירובי', icon: '' };

    const card = document.createElement('div');
    card.className = 'cardio-hero-card' + (interactive ? '' : ' readonly');
    card.innerHTML = `
        <div class="cardio-hero-icon">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l2-4 3 8 2-5.5 1.5 3h5.5"/></svg>
        </div>
        <div class="cardio-hero-body">
            <div class="cardio-hero-eyebrow">${interactive ? 'האימון שלך היום' : 'מתוכנן ליום זה'}</div>
            <div class="cardio-hero-title">${typeInfo.label} · ${entry.minutes} דק׳</div>
            ${interactive ? '<div class="cardio-hero-sub">זה כל מה שיש להיום, בואו נסמן</div>' : ''}
        </div>
        <button type="button" class="cardio-hero-check${isDone ? ' checked' : ''}" aria-label="סמן אירובי כבוצע" ${interactive ? '' : 'disabled'}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>
        </button>
    `;
    if (interactive) {
        _wireCardioDoneToggle(card.querySelector('.cardio-hero-check'), entry, dateStr);
    }
    return card;
}

// interactive=false מציג את הכרטיס לצפייה בלבד (יום שאינו היום האמיתי) — אי אפשר לסמן ביצוע
// ליום שלא באמת קורה עכשיו, בדיוק כמו שאי אפשר לסמן תרגיל כוח מיום אחר
function _buildCardioExecCard(entry, interactive = true) {
    const dateStr = localDateStr();
    const isDone = interactive && !!localStorage.getItem(_cardioDoneKey(dateStr));
    const typeInfo = (typeof CARDIO_TYPES !== 'undefined' && CARDIO_TYPES[entry.type]) || { label: 'אירובי', icon: '' };

    const card = document.createElement('div');
    card.className = 'card cardio-exec-card' + (interactive ? '' : ' readonly');
    card.innerHTML = `
        <div class="cardio-exec-row">
            <button type="button" class="cardio-exec-check${isDone ? ' checked' : ''}" aria-label="סמן אירובי כבוצע" ${interactive ? '' : 'disabled'}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>
            </button>
            <div class="cardio-exec-body">
                <div class="cardio-exec-title">${typeInfo.label} · ${entry.minutes} דק׳</div>
                <div class="cardio-exec-sub">${interactive ? 'מתוזמן להיום' : 'מתוזמן ליום זה'}</div>
            </div>
            <span class="cardio-exec-icon">${typeInfo.icon}</span>
        </div>
    `;
    if (interactive) {
        _wireCardioDoneToggle(card.querySelector('.cardio-exec-check'), entry, dateStr);
    }
    return card;
}

function _buildCardioProgressCard(goal) {
    const card = document.createElement('div');
    card.className = 'card cardio-progress-card';
    card.innerHTML = `
        <div class="cardio-progress-row">
            <span class="cardio-progress-label">דקות אירובי השבוע</span>
            <span class="cardio-progress-count" id="cardio-progress-count">– / ${goal}</span>
        </div>
        <div class="cardio-progress-track"><div class="cardio-progress-fill" id="cardio-progress-fill" style="width:0%"></div></div>
    `;
    _refreshCardioProgress();
    return card;
}

async function _refreshCardioProgress() {
    const uid = getActiveUserId();
    if (!uid || typeof getWeeklyCardioMinutes !== 'function') return;
    const goal = CLIENT.cardioWeeklyGoalMinutes ?? 150;
    const countEl = document.getElementById('cardio-progress-count');
    const fillEl  = document.getElementById('cardio-progress-fill');
    if (!countEl || !fillEl) return;
    const done = await getWeeklyCardioMinutes(uid);
    countEl.textContent = `${done} / ${goal}`;
    const pct = goal > 0 ? Math.min(100, Math.round((done / goal) * 100)) : 0;
    fillEl.style.width = pct + '%';
}

    // פונקציה לניהול הצ'קליסט של האימונים
function initWorkoutsChecklist() {
    const savedState = _ensureWorkoutCache().exercises || {};
    document.querySelectorAll('.workout-checkbox').forEach(cb => {
        const id = cb.getAttribute('data-id');
        if (savedState[id]) cb.checked = true;
    });

    document.addEventListener('change', (e) => {
        if (!e.target.classList.contains('workout-checkbox')) return;
        const cb = e.target;
        const id = cb.getAttribute('data-id');
        _ensureWorkoutCache().exercises[id] = cb.checked;
        if (typeof scheduleSyncWorkoutProgress === 'function') scheduleSyncWorkoutProgress();
        checkWorkoutCompletion(cb);
    });
}

function checkWorkoutCompletion(clickedCheckbox) {
    const id = clickedCheckbox.getAttribute('data-id');
    if (!id) return;
    const letter = id.split('_')[0];
    const checkboxes = document.querySelectorAll(`[data-id^="${letter}_"]`);
    if (checkboxes.length === 0) return;

    const allChecked = Array.from(checkboxes).every(cb => cb.checked);


    if (allChecked) {
        const today = localDateStr();
        const isScheduledToday = CLIENT.workoutDays?.[letter]?.includes(new Date().getDay());
        completeWorkoutStreak(letter);
        const _popupKey = 'workout_popup_shown_date_' + (getActiveUserId() || 'default');
        if (localStorage.getItem(_popupKey) !== today && isScheduledToday) {
            localStorage.setItem(_popupKey, today);
            const msg = document.getElementById('workout-complete-msg');
            if (msg) msg.style.cssText = "display:flex; position:fixed; top:0; left:0; width:100vw; height:100vh; z-index:9999; align-items:center; justify-content:center;";
        }
    }
}

// פונקציה לסגירת הודעת הסיום
function closeCompleteMsg() {
    const msg = document.getElementById('workout-complete-msg');
    if (msg) msg.style.display = 'none';
}

    // --- לוגיקה של מעקב תזונה יומי בגרמים ואיפוס ---
    let dailyGrams = { protein: 0, carbs: 0, fat: 0, alcohol: 0 };
    function _portionsKey()         { return 'daily_grams_v1_'   + (getActiveUserId() || 'default'); }

    function _resetKey() {
        const uid = typeof getActiveUserId === 'function' ? getActiveUserId() : null;
        return 'last_reset_v4_' + (uid || 'default');
    }

    // מעקב פעילות משתמש — לאיפוס יומי חכם
    let _lastUserActivity = Date.now();
    ['click', 'keydown', 'touchstart', 'scroll'].forEach(evt =>
        document.addEventListener(evt, () => { _lastUserActivity = Date.now(); }, { passive: true })
    );

    function manageDailyReset() {
        // אדמין צופה בלקוח — לא לאפס
        if (typeof SB_VIEW_ID !== 'undefined' && SB_VIEW_ID && typeof SB_USER !== 'undefined' && SB_USER && SB_VIEW_ID !== SB_USER.id) return;
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
        const lastReset = localStorage.getItem(_resetKey());
        if (lastReset === todayStr) return;
        // לא לרענן אם המשתמש פעיל ב-3 הדקות האחרונות — לחכות עד שיפסיק
        const IDLE_MS = 3 * 60 * 1000;
        if (Date.now() - _lastUserActivity < IDLE_MS) return;
        localStorage.removeItem(_portionsKey());
        window._workoutDataCache = { exercises: {}, tasks: [], exercise_weights: {} };
        const _resetUid = typeof getActiveUserId === 'function' ? getActiveUserId() : null;
        localStorage.removeItem('workout_popup_shown_date_' + (_resetUid || 'default'));
        if (_resetUid) localStorage.removeItem('workout_streak_incremented_date_' + _resetUid);
        sessionStorage.removeItem('ai_chat_history');
        localStorage.setItem(_resetKey(), todayStr);
        location.reload();
    }
    setInterval(() => manageDailyReset(), 60 * 1000);

    const _KCAL_STATUS_ICONS = {
        under: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg>',
        in:    '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>',
        over:  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M18 13l-6 6-6-6"/></svg>'
    };

    // חיווי צבעוני חי: האם הקלוריות של היום עד כה בטווח היעד לפי המטרה (חיטוב/מסה/שמירה).
    // לא קשור להערכת רצף התזונה (שרצה רק בסוף היום) — זה רק משוב ויזואלי מיידי.
    function updateKcalStatus(kcal) {
        const statusEl = document.getElementById('kcal-status');
        if (!statusEl) return;
        const targets = typeof window._getGramTargets === 'function' ? window._getGramTargets() : null;
        if (!targets || !(targets.totalCalories > 0) || typeof _calorieRangeForGoal !== 'function') {
            statusEl.style.display = 'none';
            return;
        }
        const { min, max } = _calorieRangeForGoal(CLIENT.goal, targets.totalCalories);
        let state, text;
        if (kcal < min)      { state = 'under'; text = 'עוד לא הגעת לטווח'; }
        else if (kcal <= max) { state = 'in';    text = 'בטווח היעד'; }
        else                  { state = 'over';  text = 'חריגה מהיעד'; }
        statusEl.className = 'daily-kcal-status status-' + state;
        statusEl.innerHTML = _KCAL_STATUS_ICONS[state] + text;
        statusEl.style.display = '';
    }

    function updateKcalDisplay() {
        const alcoholKcal = Math.round(dailyGrams.alcohol * 7);
        // הסכום היומי: אם נשמר סכום קלוריות מדויק מפריטים עם תווית (dailyGrams.kcal) — משתמשים בו.
        // אחרת חישוב מהמאקרו כמו קודם (תאימות לאחור אם משום מה אין את הערך)
        const kcal = (dailyGrams.kcal != null)
            ? Math.round(dailyGrams.kcal)
            : Math.round(dailyGrams.protein * 4 + dailyGrams.carbs * 4 + dailyGrams.fat * 9) + alcoholKcal;
        const el = document.getElementById('kcal-val');
        if (el) el.innerText = kcal;
        const noteEl = document.getElementById('kcal-alcohol-note');
        if (noteEl) {
            if (alcoholKcal > 0) {
                document.getElementById('kcal-alcohol-note-val').innerText = alcoholKcal;
                noteEl.style.display = '';
            } else {
                noteEl.style.display = 'none';
            }
        }
        updateKcalStatus(kcal);
    }

    // מחשב מחדש את סך המאקרו היומי ישירות מרשימת הפריטים שבפועל שמורים ביומן המזון -
    // מקור אמת יחיד. נקרא (בלי פרמטרים) אחרי כל הוספה/מחיקה/עריכה של פריט ביומן,
    // כדי שהסכום למעלה תמיד יהיה זהה בדיוק לרשימת הפריטים ולא יוכל להתפספס/להצטבר לא נכון
    function addFoodMacros() {
        // אדמין שצופה בלקוח: אין ליומן המקומי במכשיר הזה שום קשר לאמת (זה יומן מקומי ריק/ישן,
        // האמת היא בסופאבייס). לא לחשב מקומי בכלל - רק לגרום לרענון מהמקור הנכון
        const isAdminViewingOther = typeof SB_VIEW_ID !== 'undefined' && SB_VIEW_ID && typeof SB_USER !== 'undefined' && SB_USER && SB_VIEW_ID !== SB_USER.id;
        if (isAdminViewingOther) {
            if (typeof renderFoodLog === 'function') renderFoodLog();
            return;
        }
        const entries = typeof loadFoodLogEntries === 'function' ? loadFoodLogEntries() : [];
        dailyGrams = entries.reduce((sum, e) => ({
            protein: Math.round((sum.protein + (e.protein_g || 0)) * 10) / 10,
            carbs:   Math.round((sum.carbs   + (e.carbs_g   || 0)) * 10) / 10,
            fat:     Math.round((sum.fat     + (e.fat_g     || 0)) * 10) / 10,
            alcohol: Math.round((sum.alcohol + (e.alcohol_g || 0)) * 10) / 10,
            kcal:    sum.kcal + (typeof entryKcal === 'function' ? entryKcal(e) : ((e.protein_g||0)*4 + (e.carbs_g||0)*4 + (e.fat_g||0)*9 + (e.alcohol_g||0)*7)),
        }), { protein: 0, carbs: 0, fat: 0, alcohol: 0, kcal: 0 });
        document.getElementById('protein-val').innerText = dailyGrams.protein;
        document.getElementById('carbs-val').innerText   = dailyGrams.carbs;
        document.getElementById('fat-val').innerText     = dailyGrams.fat;
        localStorage.setItem(_portionsKey(), JSON.stringify(dailyGrams));
        updateAllMacroProgress();
        updateKcalDisplay();
        const uid = typeof getActiveUserId === 'function' ? getActiveUserId() : null;
        if (uid) {
            if (typeof sbQueueNutritionSync === 'function') {
                sbQueueNutritionSync(uid, dailyGrams.protein, dailyGrams.carbs, dailyGrams.fat, dailyGrams.alcohol);
            } else if (typeof sbSaveNutrition === 'function') {
                sbSaveNutrition(uid, dailyGrams.protein, dailyGrams.carbs, dailyGrams.fat, dailyGrams.alcohol).catch(() => {});
            }
        }
    }
    window.addFoodMacros = addFoodMacros;
    window._getUserPortions = () => ({ ...dailyGrams }); // שם נשמר לתאימות עם קוד קורא קיים (ai.js) - התוכן הוא גרמים

    function updateMacroProgress(type) {
        // קורא מה-DOM (מה-val שכבר מוצג) ולא מ-dailyGrams - כי dailyGrams לא מתעדכן כשצופים
        // בלקוח אחר כאדמין (הערך האמיתי שם מגיע מסופאבייס ונכתב ישירות ל-DOM)
        const valText = document.getElementById(type + '-val')?.innerText || '0';
        const val = parseFloat(valText) || 0;
        const targetText = document.getElementById(type + '-target').innerText.replace('/ ', '');
        const target = parseFloat(targetText);
        if (!target) return;
        const percent = Math.min(100, Math.round((val / target) * 100));
        const bar = document.getElementById(type + '-progress-bar');
        const label = document.getElementById(type + '-percent');
        if (bar) {
            bar.style.width = percent + '%';
            bar.classList.toggle('complete', percent >= 100);
        }
        if (label) {
            label.textContent = percent + '%';
            label.classList.toggle('complete', percent >= 100);
        }
        // חלבון: הנקודה הכחולה ליד "חלבון" הופכת ירוקה עם שאר הבר כשמגיעים ליעד
        if (type === 'protein') {
            const dot = document.getElementById('protein-dot');
            if (dot) dot.classList.toggle('complete', percent >= 100);
        }
    }

    function updateAllMacroProgress() {
        ['protein', 'carbs', 'fat'].forEach(updateMacroProgress);
    }
    // חשיפה לשימוש מ-app-nutrition-journal.js (מצב אדמין הצופה בלקוח, ב-_pdRefreshTodayTotals)
    window.updateAllMacroProgress = updateAllMacroProgress;
    window.updateKcalStatus = updateKcalStatus;

    function loadDailyNutrition() {
        // אדמין שצופה בלקוח: אין יומן מקומי אמיתי במכשיר האדמין. renderFoodLog/_renderFoodLogPastDay
        // (שרץ מיד אחרי זה באותו onload) הוא כבר מקור האמת שמחשב את זה ישירות מיומן המזון בסופאבייס -
        // לא לשלוף פה שוב בנפרד, כי שתי שליפות מקבילות לאותם אלמנטים = מרוץ שמנצח בו מי שמסיים אחרון,
        // ולפעמים זה הנתון הישן. רק לאפס תצוגה שקטה שלא תישאר תקועה עד שהשליפה השנייה תסיים.
        const isAdminViewingOther = typeof SB_VIEW_ID !== 'undefined' && SB_VIEW_ID && typeof SB_USER !== 'undefined' && SB_USER && SB_VIEW_ID !== SB_USER.id;
        if (isAdminViewingOther) {
            dailyGrams = { protein: 0, carbs: 0, fat: 0, alcohol: 0 };
            return;
        }
        // משתמש רגיל: מקור האמת היחיד הוא היומן המקומי בפועל - מחושב תמיד מחדש, לא נטען ממונה נפרד
        addFoodMacros();
        setTimeout(updateAllMacroProgress, 50);
    }

    function toggleTask(el, event) {
        const checkbox = el.querySelector('input');
        const evt = event || null;
        if (!evt || evt.target !== checkbox) checkbox.checked = !checkbox.checked;
        el.classList.toggle('done', checkbox.checked);
        updateDailyProgress(); 
        saveChecklist();
    }

    function updateDailyProgress() {
        const total = document.querySelectorAll('.checklist-item').length;
        const checked = document.querySelectorAll('.checklist-item input:checked').length;
        const percent = total > 0 ? Math.round((checked / total) * 100) : 0;
        const bar = document.getElementById('daily-bar');
        if (bar) bar.style.width = percent + '%';
        const text = document.getElementById('daily-text');
        if (text) text.innerText = percent + '% הושלם היום';
    }

    function saveChecklist() {
        const states = Array.from(document.querySelectorAll('.checklist-item input')).map(i => i.checked);
        _ensureWorkoutCache().tasks = states;
        if (typeof scheduleSyncWorkoutProgress === 'function') scheduleSyncWorkoutProgress();
    }

    function loadChecklist() {
        const savedTasks = _ensureWorkoutCache().tasks;
        if (savedTasks) {
            document.querySelectorAll('.checklist-item').forEach((el, i) => {
                const checkbox = el.querySelector('input');
                if (checkbox && savedTasks[i] !== undefined) {
                    checkbox.checked = savedTasks[i]; 
                    if(savedTasks[i]) el.classList.add('done');
                }
            });
            updateDailyProgress();
        }
    }

    function openSurvey() {
        document.getElementById('survey-overlay').style.display = 'block';
    }
    function closeSurvey() {
        document.getElementById('survey-overlay').style.display = 'none';
    }

    const surveyForm = document.getElementById('coaching-survey');
    if (surveyForm) {
        surveyForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const btn = document.getElementById('submit-survey-btn');
            btn.innerText = "שולח..."; btn.disabled = true;
            const formData = new FormData(surveyForm);
            try {
                const uid = getActiveUserId();
                if (uid) {
                    await sbSaveWeeklyQuestionnaire(
                        uid,
                        formData.get('victory'),
                        formData.get('obstacle'),
                        parseInt(formData.get('compliance_rating')) || null,
                        formData.get('q4_topic')
                    );
                }
                const _surveyUid = typeof getActiveUserId === 'function' ? getActiveUserId() : null;
                if (_surveyUid) localStorage.setItem('survey_submitted_' + _surveyUid + '_' + _surveyWeekKey(), '1');
                await showAlert("השאלון נשלח בהצלחה!"); surveyForm.reset(); closeSurvey();
            } catch (error) {
                console.warn('[SB] questionnaire save:', error.message);
                await showAlert("שגיאה בשליחה.");
            } finally { btn.innerText = "שלח שאלון וחזור לאתר"; btn.disabled = false; }
        });
    }

    function updateCounter() {
        const diffInDays = Math.floor((new Date() - new Date(CLIENT.startDate)) / (1000 * 60 * 60 * 24)) + 1;
        const counterEl = document.getElementById('day-counter');
        if (counterEl) counterEl.innerText = diffInDays > 0 ? "יום " + diffInDays : "מתחילים בקרוב!";
    }

    document.querySelectorAll('.tab-btn').forEach(button => {
        button.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            document.querySelectorAll('.tab-btn, .tab-content').forEach(el => el.classList.remove('active'));
            this.classList.add('active');
            document.getElementById(tabId).classList.add('active');
            window.scrollTo({top: 0, behavior: 'smooth'});
            if (tabId === 'tab4') {
                const uid = getActiveUserId();
                if (uid) {
                    delete _trackingWidgetCache['weekly_' + uid];
                    delete _trackingWidgetCache['history_' + uid];
                    renderWeeklyScore(uid);
                    renderScoreHistory(uid);
                }
                loadProgressPhotos();
}
            if (tabId === 'tab2') {
    initWorkoutsFromClient();
    initWorkoutJournal();
}
            if (tabId === 'tab5' && typeof initAIChat === 'function') {
    initAIChat();
}
        });
    });

function buildWorkoutAccordions(targets = {}) {
    if (window.innerWidth > 600) return;
    // remove stale accordions so we can rebuild with fresh targets
    document.querySelectorAll('.workout-accordion').forEach(a => a.remove());
    const _viewDow = window._selectedWorkoutDay ?? new Date().getDay();
    const _isViewingToday = _viewDow === new Date().getDay();
    const _todayCardioLetter = _cweLetterForDay(_viewDow);
    const _cardioTodayEntry = CLIENT.cardioSchedule?.[_viewDow] || null;
    const canReorder = (typeof _canReorderWorkout === 'function' ? _canReorderWorkout() : (CLIENT.workoutSource && CLIENT.workoutSource !== 'admin')) && (typeof _workoutReorderMode !== 'undefined' ? _workoutReorderMode : true);
    document.querySelectorAll('.workout-table').forEach(table => {
        const wrapper = table.closest('.table-wrapper');
        if (!wrapper) return;
        const workoutContainer = wrapper.closest('[id^="workout-"]');
        const letter = workoutContainer?.id?.replace('workout-', '');
        const accordion = document.createElement('div');
        accordion.className = 'workout-accordion';
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach((row, i) => {
            const cells = row.querySelectorAll('td');
            const checkbox = cells[0]?.querySelector('input[type="checkbox"]');
            const name = cells[1]?.textContent.trim();
            const warmup = cells[2]?.textContent.trim();
            const work = cells[3]?.textContent.trim();
            const bankUrl = exerciseBank[name];
            const item = document.createElement('div');
            const isChecked = checkbox?.checked;
            item.className = 'workout-accord-item' + (isChecked ? ' checked' : '');
            const exId = checkbox?.getAttribute('data-id') || '';

            const t = targets[name];
            let weightHtml, repsDisplay, hintHtml = '';
            if (t) {
                weightHtml = t.suggest_increase ? `${t.target_weight} <span style="color:#22c55e;font-size:0.9em;">↑</span>` : String(t.target_weight);
                repsDisplay = String(t.target_reps);
                if (t.suggest_increase) hintHtml = `<span class="accord-hint-badge">מומלץ להוסיף קצת משקל</span>`;
            } else {
                const savedWeights = _ensureWorkoutCache().exercise_weights || {};
                weightHtml = savedWeights[exId] || '—';
                repsDisplay = cells[4]?.textContent.trim() || '—';
            }

            const exNote = (CLIENT.exerciseNotes?.[name] || '');

            item.innerHTML = `
                <div class="workout-accord-header ${isChecked ? 'checked' : ''}">
                    <span class="accord-num">${isChecked ? '✓' : i + 1}</span>
                    <span class="accord-name">${name}</span>
                    ${canReorder ? `<div class="accord-order-btns">
                        <button class="accord-order-btn" ${i === 0 ? 'disabled' : ''} onclick="event.stopPropagation(); moveWorkoutExercise('${letter}', ${i}, -1)" aria-label="הזז למעלה">${_CWE_UP_ICON}</button>
                        <button class="accord-order-btn" ${i === rows.length - 1 ? 'disabled' : ''} onclick="event.stopPropagation(); moveWorkoutExercise('${letter}', ${i}, 1)" aria-label="הזז למטה">${_CWE_DOWN_ICON}</button>
                    </div>` : ''}
                    <input type="checkbox" class="accord-checkbox" ${isChecked ? 'checked' : ''} ${_isViewingToday ? '' : 'disabled'}>
                    <span class="accord-toggle">▾</span>
                </div>
                <div class="workout-accord-body">
                    <div class="workout-accord-details">
                        <div class="accord-detail">
                            <span class="accord-detail-label">סטים לחימום</span>
                            <span class="accord-detail-value">${warmup}</span>
                        </div>
                        <div class="accord-detail">
                            <span class="accord-detail-label">סטים לעבודה</span>
                            <span class="accord-detail-value">${work}</span>
                        </div>
                        <div class="accord-detail weight-detail" data-ex-id="${exId}">
                            <span class="accord-detail-label">משקל</span>
                            <span class="accord-detail-value accord-weight-val">${weightHtml}</span>
                        </div>
                        <div class="accord-detail">
                            <span class="accord-detail-label">חזרות</span>
                            <span class="accord-detail-value">${repsDisplay}</span>
                        </div>
                    </div>
                    ${hintHtml ? `<div class="accord-hint-row">${hintHtml}</div>` : ''}
                    <div class="accord-note-wrap">
                        <input type="text" class="accord-note-input" maxlength="100" placeholder="הערות לאימון..." data-ex-name="${name.replace(/"/g, '&quot;')}" value="${exNote.replace(/"/g, '&quot;')}">
                    </div>
                    ${bankUrl ? `<div class="accord-video-link"><button class="accord-video-btn" data-video-url="${encodeURIComponent(bankUrl)}">▶ צפייה בסרטון</button></div>` : ''}
                </div>
            `;
            const videoBtn = item.querySelector('.accord-video-btn');
            if (videoBtn) {
                videoBtn.addEventListener('click', () => openVideoModal(decodeURIComponent(videoBtn.dataset.videoUrl)));
            }
            const accordCheckbox = item.querySelector('.accord-checkbox');
            const header = item.querySelector('.workout-accord-header');
            const numBadge = item.querySelector('.accord-num');
            accordCheckbox.addEventListener('change', () => {
                const id = checkbox.getAttribute('data-id');
                const freshCb = document.querySelector(`.workout-checkbox[data-id="${id}"]`);
                if (freshCb) freshCb.checked = accordCheckbox.checked;
                _ensureWorkoutCache().exercises[id] = accordCheckbox.checked;
                if (typeof scheduleSyncWorkoutProgress === 'function') scheduleSyncWorkoutProgress();
                header.classList.toggle('checked', accordCheckbox.checked);
                item.classList.toggle('checked', accordCheckbox.checked);
                if (numBadge) numBadge.textContent = accordCheckbox.checked ? '✓' : (i + 1);
                checkWorkoutCompletion(freshCb || checkbox);
            });
            header.addEventListener('click', (e) => {
                if (e.target.classList.contains('accord-checkbox')) return;
                item.classList.toggle('open');
            });
            const noteInput = item.querySelector('.accord-note-input');
            if (noteInput) {
                noteInput.addEventListener('click', e => e.stopPropagation());
                let _noteTimer = null;
                noteInput.addEventListener('input', () => {
                    clearTimeout(_noteTimer);
                    _noteTimer = setTimeout(async () => {
                        const userId = getActiveUserId();
                        if (!userId) return;
                        try {
                            if (!CLIENT.exerciseNotes) CLIENT.exerciseNotes = {};
                            CLIENT.exerciseNotes[name] = noteInput.value;
                            // sync all other inputs for the same exercise
                            document.querySelectorAll(`.accord-note-input[data-ex-name="${name}"]`).forEach(el => {
                                if (el !== noteInput) el.value = noteInput.value;
                            });
                            await sbUpsertProfile(userId, { exercise_notes: CLIENT.exerciseNotes });
                        } catch(e) {
                            console.error('[note save]', e);
                        }
                    }, 1500);
                });
            }
            const weightCell = item.querySelector('.weight-detail');
            accordion.appendChild(item);
        });

        // אירובי self-serve: מוצג בסוף רשימת התרגילים רק אם היום מתוזמן וזו אות האימון של היום
        if (letter && letter === _todayCardioLetter && _cardioTodayEntry && typeof _buildCardioExecCard === 'function') {
            accordion.appendChild(_buildCardioExecCard(_cardioTodayEntry, _isViewingToday));
        }

        wrapper.appendChild(accordion);
    });
}

   function _surveyWeekKey() {
        const today = new Date();
        const sun = new Date(today);
        sun.setDate(today.getDate() - today.getDay()); // back to Sunday (week starts Sunday)
        return `${sun.getFullYear()}-${String(sun.getMonth()+1).padStart(2,'0')}-${String(sun.getDate()).padStart(2,'0')}`;
    }

    async function checkThursdayBanner() {
        // מנויים לא מקבלים שאלון שבועי
        if (CLIENT.isSubscriber) return;
        const now = new Date();
        const day  = now.getDay();
        const hour = now.getHours();
        // Thu(4) only after 19:00, Fri(5) and Sat(6) any time
        if (day < 4) return;
        if (day === 4 && hour < 19) return;
        // localStorage fast-check (set after successful submission)
        const uid = typeof SB_USER !== 'undefined' && SB_USER?.id;
        if (!uid) return;
        if (localStorage.getItem('survey_submitted_' + uid + '_' + _surveyWeekKey())) return;
        try {
            const hasRow = await sbCheckThisWeekQuestionnaire(uid);
            if (hasRow) {
                localStorage.setItem('survey_submitted_' + uid + '_' + _surveyWeekKey(), '1');
                return;
            }
            const banner = document.getElementById('weekly-survey-banner');
            if (banner) banner.style.display = 'flex';
        } catch(e) { console.warn('[SB] thursday banner:', e.message); }
    }

// ===== עריכת תוכנית אימונים ע"י הלקוח: גלריית תבניות + custom (premium, בהמשך) =====

const CWE_BASIC_UNLOCKED = 3; // כמות תבניות פתוחות לרמת בסיס (לא בשימוש כרגע — הכל פתוח עד שיהיו רמות מנוי אמיתיות)

const _CWE_LOCK_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

// כל עוד subscription_tier לא קיים ב-DB: כל הפיצ'רים פתוחים לכולם. TODO לחבר ל-tier אמיתי בעתיד.
function _getWorkoutTier() {
    return 'pro';
}

function _hasCustomBuilderAccess() {
    return true;
}

const _CWE_DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const _CWE_DAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

// ===== אירובי כתוספת לתוכנית (בתוך עורך תוכנית האימונים) =====
// _cweActiveCardioState מצביע על אובייקט ה-schedule הזמני של המסך הפתוח כרגע
// (התאמה אישית / פירוט תבנית), נשמר ל-CLIENT רק בלחיצת שמירה/בחירת התוכנית.
let _cweActiveCardioState = null;

function _cweCardioTotalMinutes(cardio) {
    return Object.values(cardio || {}).reduce((sum, e) => sum + (e?.minutes || 0), 0);
}

function _cweCardioTypeOptionsHtml(selected) {
    return Object.entries(CARDIO_TYPES).map(([key, t]) =>
        `<option value="${key}"${key === selected ? ' selected' : ''}>${t.label}</option>`
    ).join('');
}

function _cweCardioDetailsHtml(cardio) {
    return [0, 1, 2, 3, 4, 5, 6].filter(d => cardio[d]).map(d => `
        <div class="cwe-cardio-detail" data-day="${d}">
            <span class="cwe-cardio-detail-label">${_CWE_DAY_LETTERS[d]}׳</span>
            <select class="cwe-cardio-type-select" onchange="_cweCardioFieldChanged(this)">${_cweCardioTypeOptionsHtml(cardio[d].type)}</select>
            <span class="cwe-cardio-min-tap" onclick="openCardioMinutesSheet(${d})">${cardio[d].minutes}</span>
            <input type="hidden" class="cwe-cardio-min-input" value="${cardio[d].minutes}">
            <span class="cwe-cardio-min-unit">דק׳</span>
        </div>`).join('');
}

function _cweCardioSectionHtml(cardio) {
    const dayChips = [0, 1, 2, 3, 4, 5, 6].map(d => `
        <div class="cwe-cb-day-chip${cardio[d] ? ' active' : ''}" onclick="_cweToggleCardioDay(${d}, this)">${_CWE_DAY_NAMES[d]}</div>
    `).join('');
    return `
        <div class="cwe-cardio-section">
            <div class="cwe-cardio-head">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l2-4 3 8 2-5.5 1.5 3h5.5"/></svg>
                <span class="cwe-cardio-title">הוספת אירובי לתוכנית</span>
                <span class="cwe-cardio-optional">אופציונלי</span>
            </div>
            <div class="cwe-cardio-sub">אירובי הוא אופציונלי לגמרי, אפשר לבחור כל יום בלי קשר לימי הכוח</div>
            <div class="cwe-cb-day-row">${dayChips}</div>
            <div class="cwe-cardio-details">${_cweCardioDetailsHtml(cardio)}</div>
            <div class="cwe-cardio-total"><span class="count">${_cweCardioTotalMinutes(cardio)}</span><span class="lbl">דקות אירובי בשבוע</span></div>
        </div>`;
}

function _cweUpdateCardioTotal(section) {
    const countEl = section?.querySelector('.cwe-cardio-total .count');
    if (countEl) countEl.textContent = _cweCardioTotalMinutes(_cweActiveCardioState);
}

function _cweToggleCardioDay(d, btn) {
    if (!_cweActiveCardioState) return;
    const isActive = btn.classList.toggle('active');
    if (isActive) {
        _cweActiveCardioState[d] = _cweActiveCardioState[d] || { type: 'other', minutes: 30 };
    } else {
        delete _cweActiveCardioState[d];
    }
    const section = btn.closest('.cwe-cardio-section');
    if (!section) return;
    const detailsEl = section.querySelector('.cwe-cardio-details');
    if (detailsEl) detailsEl.innerHTML = _cweCardioDetailsHtml(_cweActiveCardioState);
    _cweUpdateCardioTotal(section);
}

function _cweCardioFieldChanged(el) {
    if (!_cweActiveCardioState) return;
    const row = el.closest('.cwe-cardio-detail');
    if (!row) return;
    const d = row.dataset.day;
    const type = row.querySelector('.cwe-cardio-type-select').value;
    const minutes = parseInt(row.querySelector('.cwe-cardio-min-input').value) || 0;
    _cweActiveCardioState[d] = { type, minutes };
    _cweUpdateCardioTotal(row.closest('.cwe-cardio-section'));
}

function openCardioMinutesSheet(d) {
    const row = document.querySelector(`.cwe-cardio-detail[data-day="${d}"]`);
    if (!row) return;
    const hidden = row.querySelector('.cwe-cardio-min-input');
    const disp = row.querySelector('.cwe-cardio-min-tap');
    openNumberRulerSheet({
        min: 1, max: 300, step: 5, labelStep: 30,
        title: 'דקות אירובי',
        value: parseInt(hidden.value) || 20,
        onSave: (val) => {
            hidden.value = val;
            disp.textContent = val;
            _cweCardioFieldChanged(hidden);
        }
    });
}

function openClientWorkoutEditor() {
    _renderWorkoutGallery();
    document.getElementById('client-workout-editor-modal').classList.remove('hidden');
}

function closeClientWorkoutEditor() {
    document.getElementById('client-workout-editor-modal').classList.add('hidden');
}

let _cweCurrentBack = null;

function cweHandleClose() {
    if (_cweCurrentBack) _cweCurrentBack();
    else closeClientWorkoutEditor();
}

function _setCweTitle(text) {
    const t = document.getElementById('cwe-modal-title');
    if (t) t.textContent = text;
}

function _cweTemplateLevel(tpl) {
    const level = (tpl.name || '').split(' · ')[0];
    return { level, levelClass: level === 'מתחילים' ? 'beginner' : 'advanced' };
}

function _renderWorkoutGallery() {
    _cweCurrentBack = null;
    _setCweTitle('בחירת תוכנית אימונים');
    const body = document.getElementById('cwe-gallery-body');
    if (!body) return;
    const tier = _getWorkoutTier();
    const unlockedCount = tier === 'pro' ? workoutTemplates.length : Math.min(CWE_BASIC_UNLOCKED, workoutTemplates.length);

    const chevron = '<svg class="cwe-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>';

    let html = '<div class="cwe-list">';
    const customLocked = !_hasCustomBuilderAccess();
    const hasExistingPlan = Object.keys(CLIENT.workoutDays || {}).length > 0;
    if (hasExistingPlan) {
        html += `
            <button class="cwe-row${customLocked ? ' cwe-locked' : ''}" ${customLocked ? 'disabled' : 'onclick="openQuickEditor()"'}>
                <span class="cwe-row-stripe custom"></span>
                <span class="cwe-row-text">
                    <span class="cwe-row-name">עריכת התוכנית הנוכחית שלי${customLocked ? '' : '<span class="cwe-row-tag custom">מהיר</span>'}</span>
                    <span class="cwe-row-split">${customLocked ? 'פרימיום, בקרוב' : 'הוספה או הסרה של תרגיל בודד, בלי לבנות הכל מחדש'}</span>
                </span>
                <span class="cwe-row-meta">${customLocked ? `<span class="cwe-lock">${_CWE_LOCK_ICON}</span>` : chevron}</span>
            </button>`;
    }
    html += `
        <button class="cwe-row${customLocked ? ' cwe-locked' : ''}" ${customLocked ? 'disabled' : 'onclick="openCustomBuilder()"'}>
            <span class="cwe-row-stripe custom"></span>
            <span class="cwe-row-text">
                <span class="cwe-row-name">התאמה אישית<span class="cwe-row-tag custom">משלכם</span></span>
                <span class="cwe-row-split">${customLocked ? 'בונים תוכנית משלכם · פרימיום, בקרוב' : 'בונים תוכנית משלכם'}</span>
            </span>
            <span class="cwe-row-meta">${customLocked ? `<span class="cwe-lock">${_CWE_LOCK_ICON}</span>` : chevron}</span>
        </button>`;
    workoutTemplates.forEach((tpl, i) => {
        const locked = i >= unlockedCount;
        const { level, levelClass } = _cweTemplateLevel(tpl);
        html += `
            <button class="cwe-row${locked ? ' cwe-locked' : ''}" ${locked ? 'disabled' : `onclick="openTemplateDetail(${i})"`}>
                <span class="cwe-row-stripe ${levelClass}"></span>
                <span class="cwe-row-text">
                    <span class="cwe-row-name">${tpl.split || tpl.name}<span class="cwe-row-tag ${levelClass}">${level}</span></span>
                </span>
                <span class="cwe-row-meta">
                    ${locked ? `<span class="cwe-lock">${_CWE_LOCK_ICON}</span>` : `<span class="cwe-row-day-badge">${tpl.workoutsPerWeek} ימים</span>${chevron}`}
                </span>
            </button>`;
    });
    html += '</div>';
    body.innerHTML = html;
}

function openTemplateDetail(index) {
    const tpl = workoutTemplates[index];
    if (!tpl) return;
    _cweCurrentBack = _renderWorkoutGallery;
    _setCweTitle('פירוט תוכנית');
    const body = document.getElementById('cwe-gallery-body');
    if (!body) return;

    const { level, levelClass } = _cweTemplateLevel(tpl);
    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].filter(L => (tpl['workout' + L] || []).length);

    const tabs = letters.map((L, di) => {
        const day = tpl.workoutDays?.[L]?.[0];
        const label = (day !== undefined && day !== null) ? _CWE_DAY_NAMES[day] : 'אימון ' + L;
        return `<button class="cwe-day-tab${di === 0 ? ' active' : ''}" onclick="_cweSwitchDay(${index}, '${L}', this)">${label}</button>`;
    }).join('');

    const panels = letters.map((L, di) => {
        const cards = (tpl['workout' + L] || []).map((ex, ei) => `
            <div class="cwe-ex-card ${levelClass}">
                <span class="cwe-ex-num">${ei + 1}</span>
                <div class="cwe-ex-body">
                    <div class="cwe-ex-name">${ex.name}</div>
                    <div class="cwe-ex-pills">
                        <span class="cwe-ex-pill">חימום ${ex.warmupSets ?? 0}</span>
                        <span class="cwe-ex-pill">עבודה ${ex.workSets ?? 0}</span>
                        <span class="cwe-ex-pill">${ex.reps || ''} חזרות</span>
                    </div>
                </div>
            </div>`).join('');
        return `
            <div class="cwe-day-panel" data-day="${L}" style="display:${di === 0 ? 'block' : 'none'};">
                ${cards}
            </div>`;
    }).join('');

    _cweTemplateCardio = {};
    _cweActiveCardioState = _cweTemplateCardio;

    body.innerHTML = `
        <div class="cwe-detail">
            <div class="cwe-detail-header">
                <div class="cwe-detail-title-row">
                    <span class="cwe-detail-title">${tpl.split || tpl.name}</span>
                    <span class="cwe-row-tag ${levelClass}">${level}</span>
                </div>
                <div class="cwe-detail-sub">${tpl.workoutsPerWeek} ימים בשבוע</div>
                <div class="cwe-day-tabs">${tabs}</div>
            </div>
            ${panels}
            <div class="cwe-section-divider"><span>אירובי</span></div>
            ${_cweCardioSectionHtml(_cweTemplateCardio)}
            <div class="cwe-detail-actions">
                <button class="cwe-choose-btn" onclick="selectWorkoutTemplate(${index})">בחירת התוכנית</button>
                <button class="cwe-back-btn" onclick="_renderWorkoutGallery()">חזרה</button>
            </div>
        </div>`;
}

function _cweSwitchDay(index, letter, btn) {
    const detail = btn.closest('.cwe-detail');
    if (!detail) return;
    detail.querySelectorAll('.cwe-day-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    detail.querySelectorAll('.cwe-day-panel').forEach(p => {
        p.style.display = p.dataset.day === letter ? 'block' : 'none';
    });
}

async function selectWorkoutTemplate(index) {
    const tpl = workoutTemplates[index];
    if (!tpl) return;
    const confirmed = await showConfirmDanger('התוכנית הקיימת תוחלף בתוכנית שבחרת. להמשיך?');
    if (!confirmed) return;

    CLIENT.workoutsPerWeek = tpl.workoutsPerWeek || 3;
    CLIENT.workoutSource = 'template';
    ['A', 'B', 'C', 'D', 'E', 'F', 'G'].forEach(letter => {
        const src = tpl['workout' + letter];
        CLIENT['workout' + letter] = src ? JSON.parse(JSON.stringify(src)) : null;
    });
    CLIENT.workoutDays = tpl.workoutDays ? JSON.parse(JSON.stringify(tpl.workoutDays)) : {};
    CLIENT.cardioPlan  = tpl.cardioPlan  ? JSON.parse(JSON.stringify(tpl.cardioPlan))  : {};
    CLIENT.cardioSchedule = { ..._cweTemplateCardio };
    CLIENT.cardioWeeklyGoalMinutes = _cweCardioTotalMinutes(_cweTemplateCardio);

    await syncWorkoutPlanNow();
    if (typeof syncCardioScheduleNow === 'function') await syncCardioScheduleNow();
    await initWorkoutsFromClient();
    initWorkoutsChecklist();
    initVideos();
    closeClientWorkoutEditor();
}

// ===== התאמה אישית: בניית תוכנית אימונים מאפס =====

const _CWE_CATEGORIES = ['חזה', 'גב', 'כתפיים', 'רגליים', 'יד קדמית', 'יד אחורית', 'בטן', 'ישבן'];
const _CWE_DEL_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const _CWE_UP_ICON = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>';
const _CWE_DOWN_ICON = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
const _CWE_SWAP_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>';
// גרסאות גדולות יותר של אייקוני הסידור/מחיקה, לשורת תרגיל בעריכה בלבד — לא לגעת ב-_CWE_UP/DOWN/DEL_ICON
// המקוריים, הם משותפים גם עם כפתורי הסידור באקורדיון היומי (buildWorkoutAccordions)
const _CWE_UP_ICON_LG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>';
const _CWE_DOWN_ICON_LG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
const _CWE_DEL_ICON_LG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

let _cweCustomState  = null;
let _cweActiveWorkoutIdx = null;
let _cweSwapExIdx = null; // כשלא null — בחירת התרגיל הבאה מחליפה את התרגיל הזה במקום להוסיף חדש
let _cweQuickEditMode = false; // true = עורכים תוכנית קיימת (מולאה מראש), לא בונים מאפס
let _cweTemplateCardio = {};

function openCustomBuilder() {
    _cweCustomState = { workouts: [], cardio: {} };
    _cweQuickEditMode = false;
    _renderCustomBuilder();
}

// עריכה מהירה: אותו מסך בדיוק כמו "התאמה אישית", אבל מלא מראש בתוכנית הפעילה של המשתמש —
// כדי שאפשר יהיה להוסיף/להסיר/להחליף תרגיל בודד בלי לבנות הכל מחדש.
function openQuickEditor() {
    _cweCustomState = {
        workouts: Object.entries(CLIENT.workoutDays || {}).map(([letter, days]) => ({
            letter,
            days: [...days],
            exercises: (CLIENT['workout' + letter] || []).map(ex => ({ ...ex }))
        })),
        cardio: { ...(CLIENT.cardioSchedule || {}) }
    };
    _cweQuickEditMode = true;
    _renderCustomBuilder();
}

function _cweNextLetter() {
    const used = _cweCustomState.workouts.map(w => w.letter);
    return 'ABCDEFG'.split('').find(L => !used.includes(L));
}

function addCustomWorkout() {
    if (_cweCustomState.workouts.length >= 7) return;
    _cweSyncCustomBuilderDom();
    const letter = _cweNextLetter();
    if (!letter) return;
    _cweCustomState.workouts.push({ letter, days: [], exercises: [] });
    _renderCustomBuilder();
}

function removeCustomWorkout(workoutIdx) {
    _cweSyncCustomBuilderDom();
    _cweCustomState.workouts.splice(workoutIdx, 1);
    _renderCustomBuilder();
}

function toggleCustomBuilderDay(workoutIdx, day, btn) {
    const w = _cweCustomState.workouts[workoutIdx];
    if (!w) return;
    const pos = w.days.indexOf(day);
    if (pos === -1) w.days.push(day); else w.days.splice(pos, 1);
    btn.classList.toggle('active');
    const addBtn = btn.closest('.cwe-cb-workout')?.querySelector('.cwe-cb-add-ex-btn');
    if (addBtn) addBtn.disabled = w.days.length === 0;
}

function removeExerciseFromCustomWorkout(workoutIdx, exIdx) {
    _cweSyncCustomBuilderDom();
    _cweCustomState.workouts[workoutIdx].exercises.splice(exIdx, 1);
    _renderCustomBuilder();
}

async function confirmRemoveExerciseFromCustomWorkout(workoutIdx, exIdx) {
    _cweSyncCustomBuilderDom();
    const ex = _cweCustomState.workouts[workoutIdx]?.exercises[exIdx];
    if (!ex) return;
    const confirmed = await _appDialog({
        message: `להסיר את "${ex.name}" מהתוכנית? אפשר להוסיף אותו בחזרה בכל שלב`,
        okLabel: 'הסרה', cancelLabel: 'ביטול'
    });
    if (!confirmed) return;
    removeExerciseFromCustomWorkout(workoutIdx, exIdx);
}

function moveExerciseInCustomWorkout(workoutIdx, exIdx, direction) {
    _cweSyncCustomBuilderDom();
    const exercises = _cweCustomState.workouts[workoutIdx].exercises;
    const newIdx = exIdx + direction;
    if (newIdx < 0 || newIdx >= exercises.length) return;

    const rowSel = (i) => `.cwe-cb-ex-row[data-workout-idx="${workoutIdx}"][data-ex-idx="${i}"]`;
    const beforeI = document.querySelector(rowSel(exIdx))?.getBoundingClientRect().top;
    const beforeJ = document.querySelector(rowSel(newIdx))?.getBoundingClientRect().top;

    [exercises[exIdx], exercises[newIdx]] = [exercises[newIdx], exercises[exIdx]];
    _renderCustomBuilder();

    const afterI = document.querySelector(rowSel(exIdx));
    const afterJ = document.querySelector(rowSel(newIdx));
    _slideSwapPair(beforeI, beforeJ, afterI, afterJ);
    [afterI, afterJ].forEach(el => {
        if (!el) return;
        el.classList.add('order-flash');
        setTimeout(() => el.classList.remove('order-flash'), 450);
    });
}

function openExercisePicker(workoutIdx) {
    _cweSyncCustomBuilderDom();
    _cweActiveWorkoutIdx = workoutIdx;
    _cweSwapExIdx = null;
    _renderCategoryChips();
}

// כמו openExercisePicker, אבל התרגיל שייבחר יחליף תרגיל קיים (לפי exIdx) במקום להתווסף
function swapExerciseInCustomWorkout(workoutIdx, exIdx) {
    _cweSyncCustomBuilderDom();
    _cweActiveWorkoutIdx = workoutIdx;
    _cweSwapExIdx = exIdx;
    _renderCategoryChips();
}

function _renderCategoryChips() {
    _cweCurrentBack = _renderCustomBuilder;
    _setCweTitle('בחירת קבוצת שרירים');
    const body = document.getElementById('cwe-gallery-body');
    if (!body) return;
    const rows = _CWE_CATEGORIES.map(cat => {
        const count = Object.keys(exerciseBank).filter(n => exerciseCategories[n] === cat).length;
        return `
        <button class="cwe-catpick-row" onclick="selectExerciseCategory('${cat}')">
            <span class="cwe-catpick-name">${cat}</span>
            <span class="cwe-catpick-pill">${count} תרגילים</span>
        </button>`;
    }).join('');
    body.innerHTML = `
        <div class="cwe-cb-picker">
            <p class="cwe-catpick-sub">לחצו על קבוצה כדי לבחור תרגיל להוספה לתוכנית</p>
            <div class="cwe-catpick-list">${rows}</div>
            <button class="cwe-catpick-btn" onclick="backToCustomBuilder()">חזרה לתוכנית</button>
        </div>`;
}

let _cweCategoryExerciseNames = [];

function selectExerciseCategory(cat) {
    _cweCurrentBack = _renderCategoryChips;
    _setCweTitle(cat);
    const body = document.getElementById('cwe-gallery-body');
    if (!body) return;
    _cweCategoryExerciseNames = Object.keys(exerciseBank).filter(n => exerciseCategories[n] === cat);
    const rows = _cweCategoryExerciseNames.map((name, i) => `
        <button class="cwe-cat-row" onclick="addExerciseToCustomWorkout(${i})">
            <span class="cwe-cat-row-name">${name}</span>
            <span class="cwe-cat-row-arrow">+</span>
        </button>`).join('');
    body.innerHTML = `
        <div class="cwe-cb-picker">
            <button class="cwe-cb-cat-back" onclick="_renderCategoryChips()">‹ חזרה לקבוצות שרירים</button>
            <div class="cwe-cat-list">${rows}</div>
        </div>`;
}

function addExerciseToCustomWorkout(idx) {
    const name = _cweCategoryExerciseNames[idx];
    const w = _cweCustomState.workouts[_cweActiveWorkoutIdx];
    if (!w || !name) return;
    if (_cweSwapExIdx != null) {
        const old = w.exercises[_cweSwapExIdx]; // שומרים על אותם סטים/חזרות, רק מחליפים את התרגיל עצמו
        w.exercises[_cweSwapExIdx] = { name, reps: old.reps, warmupSets: old.warmupSets, workSets: old.workSets };
        _cweSwapExIdx = null;
    } else {
        w.exercises.push({ name, reps: '10-15', warmupSets: 1, workSets: 3 });
    }
    _renderCustomBuilder();
}

function backToCustomBuilder() {
    _renderCustomBuilder();
}

function _renderCustomBuilder() {
    _cweCurrentBack = _renderWorkoutGallery;
    _setCweTitle(_cweQuickEditMode ? 'עריכת התוכנית שלי' : 'התאמה אישית');
    const body = document.getElementById('cwe-gallery-body');
    if (!body) return;
    if (!_cweCustomState.cardio) _cweCustomState.cardio = {};
    _cweActiveCardioState = _cweCustomState.cardio;

    const workoutsHtml = _cweCustomState.workouts.map((w, wi) => {
        const dayChips = [0, 1, 2, 3, 4, 5, 6].map(d => `
            <button class="cwe-cb-day-chip${w.days.includes(d) ? ' active' : ''}" onclick="toggleCustomBuilderDay(${wi}, ${d}, this)">${_CWE_DAY_NAMES[d]}</button>
        `).join('');

        const exRows = w.exercises.map((ex, ei) => `
            <div class="cwe-cb-ex-row" data-workout-idx="${wi}" data-ex-idx="${ei}">
                <div class="cwe-cb-ex-top">
                    <span class="cwe-cb-ex-title">
                        <span class="cwe-cb-ex-num">${ei + 1}</span>
                        <span class="cwe-cb-ex-name">${ex.name}</span>
                    </span>
                    <div class="cwe-cb-ex-actions">
                        <div class="cwe-cb-ex-move-group">
                            <button class="cwe-cb-ex-move-btn-lg" ${ei === 0 ? 'disabled' : ''} onclick="moveExerciseInCustomWorkout(${wi}, ${ei}, -1)" aria-label="הזז למעלה">${_CWE_UP_ICON_LG}</button>
                            <span class="cwe-cb-ex-move-sep"></span>
                            <button class="cwe-cb-ex-move-btn-lg" ${ei === w.exercises.length - 1 ? 'disabled' : ''} onclick="moveExerciseInCustomWorkout(${wi}, ${ei}, 1)" aria-label="הזז למטה">${_CWE_DOWN_ICON_LG}</button>
                        </div>
                        <button class="cwe-cb-ex-swap" onclick="swapExerciseInCustomWorkout(${wi}, ${ei})" aria-label="החלפת תרגיל">${_CWE_SWAP_ICON}</button>
                        <button class="cwe-cb-ex-del" onclick="confirmRemoveExerciseFromCustomWorkout(${wi}, ${ei})" aria-label="הסרת תרגיל">${_CWE_DEL_ICON_LG}</button>
                    </div>
                </div>
                <div class="cwe-cb-ex-fields">
                    <div class="cwe-cb-field cwe-cb-field-tap" onclick="openSetsSheet(${wi}, ${ei})">
                        <span class="cwe-cb-field-label">סטים</span>
                        <span class="cwe-cb-field-val">${ex.warmupSets} חימום · ${ex.workSets} עבודה</span>
                        <input type="hidden" data-field="warmupSets" value="${ex.warmupSets}">
                        <input type="hidden" data-field="workSets" value="${ex.workSets}">
                    </div>
                    <div class="cwe-cb-field">
                        <span class="cwe-cb-field-label">חזרות</span>
                        <input class="cwe-cb-input" type="text" value="${ex.reps}" data-field="reps" aria-label="טווח חזרות">
                    </div>
                </div>
            </div>`).join('');

        return `
            <div class="cwe-cb-workout">
                <div class="cwe-cb-workout-head">
                    <span class="cwe-cb-workout-badge">${w.letter}</span>
                    <span class="cwe-cb-workout-title">אימון ${w.letter}</span>
                    <button class="cwe-cb-workout-del" onclick="removeCustomWorkout(${wi})">${_CWE_DEL_ICON}</button>
                </div>
                <div class="cwe-cb-day-row">${dayChips}</div>
                ${exRows}
                <button class="cwe-cb-add-ex-btn" ${w.days.length === 0 ? 'disabled' : ''} onclick="openExercisePicker(${wi})">+ הוספת תרגיל</button>
            </div>`;
    }).join('');

    body.innerHTML = `
        <div class="cwe-cb">
            ${workoutsHtml}
            ${_cweCustomState.workouts.length < 7 ? '<button class="cwe-cb-add-workout-btn" onclick="addCustomWorkout()">+ הוספת אימון</button>' : ''}
            ${_cweCardioSectionHtml(_cweCustomState.cardio)}
            <div class="cwe-detail-actions">
                <button class="cwe-choose-btn" onclick="saveCustomWorkout()">${_cweQuickEditMode ? 'שמירת השינויים' : 'שמירת התוכנית'}</button>
                <button class="cwe-back-btn" onclick="_renderWorkoutGallery()">חזרה</button>
            </div>
        </div>`;
}

function _cweSyncCustomBuilderDom() {
    if (!_cweCustomState) return;
    document.querySelectorAll('.cwe-cb-ex-row').forEach(row => {
        const wi = parseInt(row.dataset.workoutIdx);
        const ei = parseInt(row.dataset.exIdx);
        const ex = _cweCustomState.workouts[wi]?.exercises[ei];
        if (!ex) return;
        const warm = row.querySelector('[data-field="warmupSets"]');
        const work = row.querySelector('[data-field="workSets"]');
        const reps = row.querySelector('[data-field="reps"]');
        if (warm) ex.warmupSets = parseInt(warm.value) || 0;
        if (work) ex.workSets   = parseInt(work.value) || 0;
        if (reps) ex.reps       = reps.value.trim() || '10-15';
    });
}

// ── בחירת סטים — בוטום שיט (במקום מקלדת) ──────────────────────
let _setsSheetWi = null, _setsSheetEi = null;

function openSetsSheet(wi, ei) {
    const ex = _cweCustomState?.workouts[wi]?.exercises[ei];
    if (!ex) return;
    _setsSheetWi = wi;
    _setsSheetEi = ei;
    document.getElementById('sets-sheet-ex-name').textContent = ex.name;
    document.querySelectorAll('#sets-sheet-warm .sets-big-chip').forEach(c => {
        c.classList.toggle('sel', parseInt(c.dataset.v) === ex.warmupSets);
    });
    document.querySelectorAll('#sets-sheet-work .sets-big-chip').forEach(c => {
        c.classList.toggle('sel', parseInt(c.dataset.v) === ex.workSets);
    });
    document.getElementById('sets-sheet-overlay').classList.add('open');
    window._dynamicOverlayOpen();
}

function closeSetsSheet() {
    const overlay = document.getElementById('sets-sheet-overlay');
    if (!overlay || !overlay.classList.contains('open')) return;
    overlay.classList.remove('open');
    window._dynamicOverlayClosed();
}

function _pickSetsChip(groupId, chip) {
    document.querySelectorAll('#' + groupId + ' .sets-big-chip').forEach(c => c.classList.remove('sel'));
    chip.classList.add('sel');
}

function saveSetsSheet() {
    if (_setsSheetWi == null || _setsSheetEi == null) return;
    const warmChip = document.querySelector('#sets-sheet-warm .sets-big-chip.sel');
    const workChip = document.querySelector('#sets-sheet-work .sets-big-chip.sel');
    const warm = warmChip ? parseInt(warmChip.dataset.v) : 0;
    const work = workChip ? parseInt(workChip.dataset.v) : 1;
    const row = document.querySelector(`.cwe-cb-ex-row[data-workout-idx="${_setsSheetWi}"][data-ex-idx="${_setsSheetEi}"]`);
    if (row) {
        row.querySelector('[data-field="warmupSets"]').value = warm;
        row.querySelector('[data-field="workSets"]').value = work;
        row.querySelector('.cwe-cb-field-val').textContent = `${warm} חימום · ${work} עבודה`;
    }
    closeSetsSheet();
}

async function saveCustomWorkout() {
    _cweSyncCustomBuilderDom();
    if (!_cweCustomState.workouts.length) { await showAlert('צריך להוסיף לפחות אימון אחד.'); return; }
    for (const w of _cweCustomState.workouts) {
        if (!w.days.length)      { await showAlert(`אימון ${w.letter} חייב יום בשבוע.`); return; }
        if (!w.exercises.length) { await showAlert(`אימון ${w.letter} חייב לפחות תרגיל אחד.`); return; }
    }

    if (!_cweQuickEditMode) {
        const confirmed = await showConfirmDanger('התוכנית הקיימת תוחלף בתוכנית שבנית. להמשיך?');
        if (!confirmed) return;
    }

    CLIENT.workoutsPerWeek = _cweCustomState.workouts.length;
    CLIENT.workoutSource = 'custom';
    ['A', 'B', 'C', 'D', 'E', 'F', 'G'].forEach(letter => { CLIENT['workout' + letter] = null; });
    CLIENT.workoutDays = {};
    CLIENT.cardioPlan  = {};
    _cweCustomState.workouts.forEach(w => {
        CLIENT['workout' + w.letter] = w.exercises.map(ex => ({ ...ex }));
        CLIENT.workoutDays[w.letter] = [...w.days];
    });
    CLIENT.cardioSchedule = { ..._cweCustomState.cardio };
    CLIENT.cardioWeeklyGoalMinutes = _cweCardioTotalMinutes(_cweCustomState.cardio);

    await syncWorkoutPlanNow();
    if (typeof syncCardioScheduleNow === 'function') await syncCardioScheduleNow();
    await initWorkoutsFromClient();
    initWorkoutsChecklist();
    initVideos();
    _cweQuickEditMode = false;
    closeClientWorkoutEditor();
}

