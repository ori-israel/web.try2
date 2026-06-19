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

    // --- לוגיקה של המונים ואיפוס ---
    let userPortions = { protein: 0, carbs: 0, fat: 0 };
    function _portionsKey()         { return 'user_portions_v3_'   + (getActiveUserId() || 'default'); }

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

    function modifyPortion(type, amount) {
        let current = userPortions[type] + amount;
        if (current < 0) current = 0;
        userPortions[type] = current;
        document.getElementById(type + '-val').innerText = current;
        localStorage.setItem(_portionsKey(), JSON.stringify(userPortions));
        updatePortionProgress(type);
        checkNutritionStreak();
        const uid = typeof getActiveUserId === 'function' ? getActiveUserId() : null;
        if (uid) {
            if (typeof sbQueueNutritionSync === 'function') {
                sbQueueNutritionSync(uid, userPortions.protein, userPortions.carbs, userPortions.fat);
            } else if (typeof sbSaveNutrition === 'function') {
                sbSaveNutrition(uid, userPortions.protein, userPortions.carbs, userPortions.fat).catch(() => {});
            }
        }
    }
    window.modifyPortion = modifyPortion;
    window._getUserPortions = () => ({ ...userPortions });

    function updatePortionProgress(type) {
        const val = userPortions[type];
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

    function updateAllPortionProgress() {
        ['protein', 'carbs', 'fat'].forEach(updatePortionProgress);
    }

    function loadPortions() {
        const saved = localStorage.getItem(_portionsKey());
        userPortions = saved ? JSON.parse(saved) : { protein: 0, carbs: 0, fat: 0 };
        document.getElementById('protein-val').innerText = userPortions.protein;
        document.getElementById('carbs-val').innerText = userPortions.carbs;
        document.getElementById('fat-val').innerText = userPortions.fat;
        setTimeout(updateAllPortionProgress, 50);

        // טעינה מ-Supabase — מקור האמת האמיתי
        const uid = typeof getActiveUserId === 'function' ? getActiveUserId() : null;
        if (uid && typeof sbFetchTodayNutrition === 'function') {
            sbFetchTodayNutrition(uid).then(data => {
                if (getActiveUserId() !== uid) return; // משתמש השתנה בינתיים
                // מיזוג: אם סופאבייס החזיר ערך — קח את המקסימום מול localStorage
                // (מגן מפני מצב שהשמירה לשרת טרם הגיעה, ו-localStorage מכיל ערך עדכני יותר)
                if (data) {
                    const local = JSON.parse(localStorage.getItem(_portionsKey()) || '{}');
                    userPortions = {
                        protein: Math.max(data.protein || 0, local.protein || 0),
                        carbs:   Math.max(data.carbs   || 0, local.carbs   || 0),
                        fat:     Math.max(data.fat      || 0, local.fat      || 0),
                    };
                } else {
                    // אין רשומה לסופאבייס היום = יום חדש → איפוס
                    userPortions = { protein: 0, carbs: 0, fat: 0 };
                }
                localStorage.setItem(_portionsKey(), JSON.stringify(userPortions));
                document.getElementById('protein-val').innerText = userPortions.protein;
                document.getElementById('carbs-val').innerText = userPortions.carbs;
                document.getElementById('fat-val').innerText = userPortions.fat;
                updateAllPortionProgress();
            }).catch(() => {});
        }
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
        document.body.style.overflow = 'hidden'; 
    }
    function closeSurvey() { 
        document.getElementById('survey-overlay').style.display = 'none';
        document.body.style.overflow = 'auto'; 
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
        if (counterEl) counterEl.innerText = diffInDays > 0 ? "יום " + diffInDays + " למסע שלך!" : "מתחילים בקרוב!";
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
        document.body.style.overflow = 'hidden'; 
    }
    function closeCalc() { 
        document.getElementById('calc-overlay').style.display = 'none';
        document.body.style.overflow = 'auto'; 
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
    let bmr = (10 * weight) + (6.25 * height) - (5 * age);
    bmr = (gender === 'male') ? bmr + 5 : bmr - 161;

    // 4. חישוב תחזוקה (TDEE) - כאן משתמשים במקדם המדויק (למשל 1.465)
    const maintenance = Math.round(bmr * activityMultiplier);

    // 5. הצגת תוצאות
    const resultDiv = document.getElementById('calc-result');
    resultDiv.style.display = 'block';
    
    document.getElementById('res-bmi').innerHTML = `<strong>BMI:</strong> ${bmi.toFixed(1)}`;
    document.getElementById('res-protein').innerHTML = `<strong>טווח חלבון מומלץ:</strong> ${proteinMin} - ${proteinMax} גרם`;
    document.getElementById('res-maintenance').innerHTML = `💡 <strong>קלוריות לתחזוקה:</strong> ${maintenance} קק"ל`;
    document.getElementById('res-cut').innerHTML = `📉 <strong>ירידה במשקל (חיטוב):</strong> ${maintenance - 250} קק"ל`;
    document.getElementById('res-bulk').innerHTML = `📈 <strong>עלייה במשקל (מסה):</strong> ${maintenance + 250} קק"ל`;
}

function buildWorkoutAccordions(targets = {}) {
    if (window.innerWidth > 600) return;
    // remove stale accordions so we can rebuild with fresh targets
    document.querySelectorAll('.workout-accordion').forEach(a => a.remove());
    document.querySelectorAll('.workout-table').forEach(table => {
        const wrapper = table.closest('.table-wrapper');
        if (!wrapper) return;
        const accordion = document.createElement('div');
        accordion.className = 'workout-accordion';
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
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
                    <span class="accord-check-icon">✓</span>
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
        const workoutContainer = wrapper.closest('[id^="workout-"]');
        const letter = workoutContainer?.id?.replace('workout-', '');
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
                    <span class="accord-name">🏃 אירובי</span>
                    <span class="accord-check-icon">✓</span>
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

