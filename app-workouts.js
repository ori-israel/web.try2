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

function _ensureWorkoutCache() {
    if (!window._workoutDataCache) window._workoutDataCache = { exercises: {}, tasks: [], exercise_weights: {} };
    return window._workoutDataCache;
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
            if (msg) {
                msg.style.cssText = "display:flex; position:fixed; top:0; left:0; width:100vw; height:100vh; z-index:9999; align-items:center; justify-content:center;";
                msg.onclick = (e) => { if (e.target === msg) closeCompleteMsg(); };
            }
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

    function updateKcalDisplay() {
        const alcoholKcal = Math.round(dailyGrams.alcohol * 7);
        const kcal = Math.round(dailyGrams.protein * 4 + dailyGrams.carbs * 4 + dailyGrams.fat * 9) + alcoholKcal;
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
        }), { protein: 0, carbs: 0, fat: 0, alcohol: 0 });
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
    }

    function updateAllMacroProgress() {
        ['protein', 'carbs', 'fat'].forEach(updateMacroProgress);
    }

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
        });
    });

    // פונקציות לפתיחה וסגירה של המחשבון
    function openCalc() {
        document.getElementById('calc-overlay').style.display = 'block';
    }
    function closeCalc() {
        document.getElementById('calc-overlay').style.display = 'none';
    }

    async function calculateStats() {
    const gender = document.querySelector('input[name="gender"]:checked').value;
    const age = parseFloat(document.getElementById('calc-age').value);
    const height = parseFloat(document.getElementById('calc-height').value);
    const weight = parseFloat(document.getElementById('calc-weight').value);
    const activityMultiplier = parseFloat(document.querySelector('input[name="activity"]:checked').value);

    if (!age || !height || !weight) {
        await showAlert("נא למלא את כל הנתונים");
        return;
    }

    // 1. חישוב BMI
    const bmi = weight / ((height / 100) ** 2);
    
    // 2. חישוב חלבון (על פי הלוגיקה שלך)
    let weightForProtein = bmi > 25 ? 24.9 * ((height / 100) ** 2) : weight;
    const proteinMin = (weightForProtein * 1.8).toFixed(0);
    const proteinMax = (weightForProtein * 2.2).toFixed(0);

    // 3. חישוב BMR - נוסחת Mifflin-St Jeor
    const bmr = calcBMR(weight, height, age, gender);

    // 4. חישוב תחזוקה (TDEE) - כאן משתמשים במקדם המדויק (למשל 1.465)
    const maintenance = calcTDEE(bmr, activityMultiplier);

    // 5. הצגת תוצאות
    const resultDiv = document.getElementById('calc-result');
    resultDiv.style.display = 'block';
    
    document.getElementById('res-bmi').innerHTML = `<strong>BMI:</strong> ${bmi.toFixed(1)}`;
    document.getElementById('res-protein').innerHTML = `<strong>טווח חלבון מומלץ:</strong> ${proteinMin} - ${proteinMax} גרם`;
    document.getElementById('res-maintenance').innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.7.6 1 1.3 1 2.5h6c0-1.2.3-1.9 1-2.5A6 6 0 0 0 12 3z"/></svg> <strong>קלוריות לתחזוקה:</strong> ${maintenance} קק"ל`;
    document.getElementById('res-cut').innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M4 6l7 10 3-4 6 7"/><circle cx="20" cy="19" r="1" fill="currentColor" stroke="none"/></svg> <strong>ירידה במשקל (חיטוב):</strong> ${maintenance - 250} קק"ל`;
    document.getElementById('res-bulk').innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg> <strong>עלייה במשקל (מסה):</strong> ${maintenance + 250} קק"ל`;
}

function buildWorkoutAccordions(targets = {}) {
    if (window.innerWidth > 600) return;
    // remove stale accordions so we can rebuild with fresh targets
    document.querySelectorAll('.workout-accordion').forEach(a => a.remove());
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
            item.className = 'workout-accord-item';
            const isChecked = checkbox?.checked;
            const exId = checkbox?.getAttribute('data-id') || '';

            const t = targets[name];
            let weightHtml, repsDisplay;
            if (t) {
                weightHtml = t.suggest_increase
                    ? `${t.target_weight} <span style="color:#22c55e;font-size:0.9em;">↑</span><div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">הוסף קצת משקל</div>`
                    : String(t.target_weight);
                repsDisplay = String(t.target_reps);
            } else {
                const savedWeights = _ensureWorkoutCache().exercise_weights || {};
                weightHtml = savedWeights[exId] || '—';
                repsDisplay = cells[4]?.textContent.trim() || '—';
            }

            const exNote = (CLIENT.exerciseNotes?.[name] || '');

            item.innerHTML = `
                <div class="workout-accord-header ${isChecked ? 'checked' : ''}">
                    <input type="checkbox" class="accord-checkbox" ${isChecked ? 'checked' : ''}>
                    <span class="accord-name">${name}</span>
                    ${canReorder ? `<div class="accord-order-btns">
                        <button class="accord-order-btn" ${i === 0 ? 'disabled' : ''} onclick="event.stopPropagation(); moveWorkoutExercise('${letter}', ${i}, -1)" aria-label="הזז למעלה">${_CWE_UP_ICON}</button>
                        <button class="accord-order-btn" ${i === rows.length - 1 ? 'disabled' : ''} onclick="event.stopPropagation(); moveWorkoutExercise('${letter}', ${i}, 1)" aria-label="הזז למטה">${_CWE_DOWN_ICON}</button>
                    </div>` : ''}
                    <span class="accord-check-icon"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg></span>
                    <span class="accord-toggle">▾</span>
                </div>
                <div class="workout-accord-body">
                    <div class="workout-accord-details">
                        <div class="accord-detail">
                            <span class="accord-detail-label">סטים חימום</span>
                            <span class="accord-detail-value">${warmup}</span>
                        </div>
                        <div class="accord-detail">
                            <span class="accord-detail-label">סטים עבודה</span>
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
                    <div class="accord-note-wrap">
                        <input type="text" class="accord-note-input" maxlength="100" placeholder="הערות לאימון..." data-ex-name="${name.replace(/"/g, '&quot;')}" value="${exNote.replace(/"/g, '&quot;')}">
                    </div>
                    ${bankUrl ? `<div class="accord-video-link"><button class="accord-video-btn" data-video-url="${encodeURIComponent(bankUrl)}">▶ צפה בסרטון</button></div>` : ''}
                </div>
            `;
            const videoBtn = item.querySelector('.accord-video-btn');
            if (videoBtn) {
                videoBtn.addEventListener('click', () => openVideoModal(decodeURIComponent(videoBtn.dataset.videoUrl)));
            }
            const accordCheckbox = item.querySelector('.accord-checkbox');
            const header = item.querySelector('.workout-accord-header');
            accordCheckbox.addEventListener('change', () => {
                const id = checkbox.getAttribute('data-id');
                const freshCb = document.querySelector(`.workout-checkbox[data-id="${id}"]`);
                if (freshCb) freshCb.checked = accordCheckbox.checked;
                _ensureWorkoutCache().exercises[id] = accordCheckbox.checked;
                if (typeof scheduleSyncWorkoutProgress === 'function') scheduleSyncWorkoutProgress();
                header.classList.toggle('checked', accordCheckbox.checked);
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

        // cardio display
        const cardio = letter ? CLIENT.cardioPlan?.[letter] : null;
        if (cardio?.description) {
            const cardioId = `${letter}_cardio`;
            const savedState = _ensureWorkoutCache().exercises || {};
            const isCardioChecked = !!savedState[cardioId];
            const cardioItem = document.createElement('div');
            cardioItem.className = 'workout-accord-item workout-cardio-item';
            cardioItem.innerHTML = `
                <div class="workout-accord-header ${isCardioChecked ? 'checked' : ''}">
                    <input type="checkbox" class="accord-checkbox workout-checkbox" data-id="${cardioId}" ${isCardioChecked ? 'checked' : ''}>
                    <span class="accord-name"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><path d="M3 12h4l2-4 3 8 2-5.5 1.5 3h5.5"/></svg> אירובי</span>
                    <span class="accord-check-icon"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg></span>
                    <span class="accord-toggle">▾</span>
                </div>
                <div class="workout-accord-body">
                    <div style="padding:8px 14px 14px;direction:rtl;">
                        <div style="font-size:14px;color:var(--text-primary);margin-bottom:4px;">${cardio.description}</div>
                        ${cardio.duration ? `<div style="font-size:13px;color:var(--text-secondary);">⏱ ${cardio.duration} דקות</div>` : ''}
                    </div>
                </div>
            `;
            const cardioHeader = cardioItem.querySelector('.workout-accord-header');
            const cardioCb = cardioItem.querySelector('.accord-checkbox');
            cardioCb.addEventListener('change', () => {
                cardioHeader.classList.toggle('checked', cardioCb.checked);
            });
            cardioHeader.addEventListener('click', (e) => {
                if (e.target.classList.contains('accord-checkbox')) return;
                cardioItem.classList.toggle('open');
            });
            accordion.appendChild(cardioItem);
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

function openClientWorkoutEditor() {
    _renderWorkoutGallery();
    document.getElementById('client-workout-editor-modal').classList.remove('hidden');
}

function closeClientWorkoutEditor() {
    document.getElementById('client-workout-editor-modal').classList.add('hidden');
}

function _setCweTitle(text) {
    const t = document.getElementById('cwe-modal-title');
    if (t) t.textContent = text;
}

function _renderWorkoutGallery() {
    _setCweTitle('בחירת תוכנית אימונים');
    const body = document.getElementById('cwe-gallery-body');
    if (!body) return;
    const tier = _getWorkoutTier();
    const unlockedCount = tier === 'pro' ? workoutTemplates.length : Math.min(CWE_BASIC_UNLOCKED, workoutTemplates.length);

    const chevron = '<svg class="cwe-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>';

    let html = '<div class="cwe-list">';
    const customLocked = !_hasCustomBuilderAccess();
    html += `
        <button class="cwe-row${customLocked ? ' cwe-locked' : ''}" ${customLocked ? 'disabled' : 'onclick="openCustomBuilder()"'}>
            <span class="cwe-row-text">
                <span class="cwe-row-name">התאמה אישית</span>
                <span class="cwe-row-split">${customLocked ? 'בונים תוכנית משלכם · פרימיום, בקרוב' : 'בונים תוכנית משלכם'}</span>
            </span>
            <span class="cwe-row-meta">${customLocked ? `<span class="cwe-lock">${_CWE_LOCK_ICON}</span>` : chevron}</span>
        </button>`;
    workoutTemplates.forEach((tpl, i) => {
        const locked = i >= unlockedCount;
        html += `
            <button class="cwe-row${locked ? ' cwe-locked' : ''}" ${locked ? 'disabled' : `onclick="openTemplateDetail(${i})"`}>
                <span class="cwe-row-text">
                    <span class="cwe-row-name">${tpl.name}</span>
                    <span class="cwe-row-split">${tpl.split || ''}</span>
                </span>
                <span class="cwe-row-meta">
                    ${locked ? `<span class="cwe-lock">${_CWE_LOCK_ICON}</span>` : chevron}
                </span>
            </button>`;
    });
    html += '</div>';
    body.innerHTML = html;
}

function openTemplateDetail(index) {
    const tpl = workoutTemplates[index];
    if (!tpl) return;
    _setCweTitle(tpl.name + (tpl.split ? ' · ' + tpl.split : ''));
    const body = document.getElementById('cwe-gallery-body');
    if (!body) return;

    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].filter(L => (tpl['workout' + L] || []).length);

    const tabs = letters.map((L, di) => {
        const day = tpl.workoutDays?.[L]?.[0];
        const label = (day !== undefined && day !== null) ? _CWE_DAY_NAMES[day] : 'אימון ' + L;
        return `<button class="cwe-day-tab${di === 0 ? ' active' : ''}" onclick="_cweSwitchDay(${index}, '${L}', this)">${label}</button>`;
    }).join('');

    const panels = letters.map((L, di) => {
        const cards = (tpl['workout' + L] || []).map(ex => `
            <div class="cwe-ex-card">
                <div class="cwe-ex-name">${ex.name}</div>
                <div class="cwe-ex-meta">חימום ${ex.warmupSets ?? 0} · עבודה ${ex.workSets ?? 0} · חזרות ${ex.reps || ''}</div>
            </div>`).join('');
        return `
            <div class="cwe-day-panel" data-day="${L}" style="display:${di === 0 ? 'block' : 'none'};">
                ${cards}
            </div>`;
    }).join('');

    body.innerHTML = `
        <div class="cwe-detail">
            <div class="cwe-day-tabs">${tabs}</div>
            ${panels}
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

    await syncWorkoutPlanNow();
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

let _cweCustomState  = null;
let _cweActiveWorkoutIdx = null;

function openCustomBuilder() {
    _cweCustomState = { workouts: [] };
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

function moveExerciseInCustomWorkout(workoutIdx, exIdx, direction) {
    _cweSyncCustomBuilderDom();
    const exercises = _cweCustomState.workouts[workoutIdx].exercises;
    const newIdx = exIdx + direction;
    if (newIdx < 0 || newIdx >= exercises.length) return;
    [exercises[exIdx], exercises[newIdx]] = [exercises[newIdx], exercises[exIdx]];
    _renderCustomBuilder();
}

function openExercisePicker(workoutIdx) {
    _cweSyncCustomBuilderDom();
    _cweActiveWorkoutIdx = workoutIdx;
    _renderCategoryChips();
}

function _renderCategoryChips() {
    _setCweTitle('בחירת קבוצת שרירים');
    const body = document.getElementById('cwe-gallery-body');
    if (!body) return;
    const rows = _CWE_CATEGORIES.map(cat => {
        const count = Object.keys(exerciseBank).filter(n => exerciseCategories[n] === cat).length;
        return `
        <button class="cwe-cat-row" onclick="selectExerciseCategory('${cat}')">
            <span class="cwe-cat-row-name">${cat}</span>
            <span class="cwe-cat-row-right">
                <span class="cwe-cat-row-count">${count} תרגילים</span>
                <span class="cwe-cat-row-arrow">‹</span>
            </span>
        </button>`;
    }).join('');
    body.innerHTML = `
        <div class="cwe-cb-picker">
            <div class="cwe-cat-list">${rows}</div>
            <button class="cwe-back-btn cwe-cb-picker-back" onclick="backToCustomBuilder()">חזרה לתוכנית</button>
        </div>`;
}

let _cweCategoryExerciseNames = [];

function selectExerciseCategory(cat) {
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
    w.exercises.push({ name, reps: '10-15', warmupSets: 1, workSets: 3 });
    _renderCustomBuilder();
}

function backToCustomBuilder() {
    _renderCustomBuilder();
}

function _renderCustomBuilder() {
    _setCweTitle('התאמה אישית');
    const body = document.getElementById('cwe-gallery-body');
    if (!body) return;

    const workoutsHtml = _cweCustomState.workouts.map((w, wi) => {
        const dayChips = [0, 1, 2, 3, 4, 5, 6].map(d => `
            <button class="cwe-cb-day-chip${w.days.includes(d) ? ' active' : ''}" onclick="toggleCustomBuilderDay(${wi}, ${d}, this)">${_CWE_DAY_NAMES[d]}</button>
        `).join('');

        const exRows = w.exercises.map((ex, ei) => `
            <div class="cwe-cb-ex-row" data-workout-idx="${wi}" data-ex-idx="${ei}">
                <div class="cwe-cb-ex-top">
                    <span class="cwe-cb-ex-name">${ex.name}</span>
                    <div class="cwe-cb-ex-move">
                        <button class="cwe-cb-ex-move-btn" ${ei === 0 ? 'disabled' : ''} onclick="moveExerciseInCustomWorkout(${wi}, ${ei}, -1)" aria-label="הזז למעלה">${_CWE_UP_ICON}</button>
                        <button class="cwe-cb-ex-move-btn" ${ei === w.exercises.length - 1 ? 'disabled' : ''} onclick="moveExerciseInCustomWorkout(${wi}, ${ei}, 1)" aria-label="הזז למטה">${_CWE_DOWN_ICON}</button>
                    </div>
                    <button class="cwe-cb-ex-del" onclick="removeExerciseFromCustomWorkout(${wi}, ${ei})">${_CWE_DEL_ICON}</button>
                </div>
                <div class="cwe-cb-ex-fields">
                    <div class="cwe-cb-field">
                        <span class="cwe-cb-field-label">חימום</span>
                        <input class="cwe-cb-input" type="number" min="0" max="9" value="${ex.warmupSets}" data-field="warmupSets" aria-label="סטים חימום">
                    </div>
                    <div class="cwe-cb-field">
                        <span class="cwe-cb-field-label">עבודה</span>
                        <input class="cwe-cb-input" type="number" min="0" max="9" value="${ex.workSets}" data-field="workSets" aria-label="סטים עבודה">
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
            <div class="cwe-detail-actions">
                <button class="cwe-choose-btn" onclick="saveCustomWorkout()">שמירת התוכנית</button>
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

async function saveCustomWorkout() {
    _cweSyncCustomBuilderDom();
    if (!_cweCustomState.workouts.length) { await showAlert('צריך להוסיף לפחות אימון אחד.'); return; }
    for (const w of _cweCustomState.workouts) {
        if (!w.days.length)      { await showAlert(`אימון ${w.letter} חייב יום בשבוע.`); return; }
        if (!w.exercises.length) { await showAlert(`אימון ${w.letter} חייב לפחות תרגיל אחד.`); return; }
    }

    const confirmed = await showConfirmDanger('התוכנית הקיימת תוחלף בתוכנית שבנית. להמשיך?');
    if (!confirmed) return;

    CLIENT.workoutsPerWeek = _cweCustomState.workouts.length;
    CLIENT.workoutSource = 'custom';
    ['A', 'B', 'C', 'D', 'E', 'F', 'G'].forEach(letter => { CLIENT['workout' + letter] = null; });
    CLIENT.workoutDays = {};
    CLIENT.cardioPlan  = {};
    _cweCustomState.workouts.forEach(w => {
        CLIENT['workout' + w.letter] = w.exercises.map(ex => ({ ...ex }));
        CLIENT.workoutDays[w.letter] = [...w.days];
    });

    await syncWorkoutPlanNow();
    await initWorkoutsFromClient();
    initWorkoutsChecklist();
    initVideos();
    closeClientWorkoutEditor();
}

