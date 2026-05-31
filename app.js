function localDateStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}


// ── Custom dialog (replaces alert / confirm / prompt) ────────
function _appDialog({ message, withInput = false, defaultValue = '', okLabel = 'אישור', cancelLabel = null, okClass = 'primary-btn' }) {
    return new Promise(resolve => {
        const dialogEl = document.getElementById('app-dialog');
        document.getElementById('app-dialog-msg').textContent = message;
        const inputEl  = document.getElementById('app-dialog-input');
        const cancelEl = document.getElementById('app-dialog-cancel');
        const okEl     = document.getElementById('app-dialog-ok');
        inputEl.style.display  = withInput    ? 'block' : 'none';
        cancelEl.style.display = cancelLabel  ? 'inline-flex' : 'none';
        inputEl.value      = defaultValue;
        cancelEl.textContent = cancelLabel || '';
        okEl.textContent     = okLabel;
        okEl.className = `app-dialog-btn ${okClass}`;
        dialogEl.classList.remove('hidden');
        if (withInput) setTimeout(() => inputEl.focus(), 50);

        const done = (val) => {
            dialogEl.classList.add('hidden');
            dialogEl.removeEventListener('click', outsideClick);
            okEl.onclick = cancelEl.onclick = inputEl.onkeydown = null;
            resolve(val);
        };
        const outsideClick = (e) => {
            if (e.target === dialogEl) done(cancelLabel ? (withInput ? null : false) : true);
        };
        dialogEl.addEventListener('click', outsideClick);
        okEl.onclick     = () => done(withInput ? (inputEl.value.trim() || null) : true);
        cancelEl.onclick = () => done(withInput ? null : false);
        inputEl.onkeydown = (e) => { if (e.key === 'Enter') okEl.click(); if (e.key === 'Escape') cancelEl.click(); };
    });
}
function showAlert(msg)              { return _appDialog({ message: msg, okLabel: 'סגור', okClass: 'secondary-btn' }); }
function showConfirm(msg)            { return _appDialog({ message: msg, okLabel: 'כן', cancelLabel: 'לא' }); }
function showConfirmDanger(msg)      { return _appDialog({ message: msg, okLabel: 'כן', cancelLabel: 'לא', okClass: 'danger-btn' }); }
function showPrompt(msg, def = '')   { return _appDialog({ message: msg, withInput: true, defaultValue: def, okLabel: 'אישור', cancelLabel: 'ביטול' }); }

function toggleHamburger(event) {
    event.stopPropagation();
    document.querySelector('.hamburger-menu').classList.toggle('open');
}

document.addEventListener('click', function(e) {
    const menu = document.querySelector('.hamburger-menu');
    if (menu && menu.classList.contains('open') && !menu.contains(e.target)) {
        menu.classList.remove('open');
    }
});

function _setThemeBtn(theme) {
    const btn = document.getElementById('theme-toggle-profile-btn');
    if (btn) btn.textContent = theme === 'dark' ? '☀️ מצב יום' : '🌙 מצב לילה';
}

function toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    _setThemeBtn(next);
    if (typeof syncThemeNow === 'function') syncThemeNow(next);
    renderWeightChart();
}

(function initTheme() {
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    _setThemeBtn(saved);
})();

    function generatePortionGoals() {
    // 1. חישוב BMR - נוסחת Mifflin-St Jeor
    const weight = parseFloat(sessionStorage.getItem('current_weight')) || CLIENT.currentWeight;
    const ageCalc = Math.floor((new Date() - new Date(CLIENT.birthDate)) / (1000 * 60 * 60 * 24 * 365.25));
    let bmr = (10 * weight) + (6.25 * CLIENT.height) - (5 * ageCalc);
    bmr = CLIENT.gender === 'male' ? bmr + 5 : bmr - 161;

    // 2. חישוב TDEE
    const tdee = Math.round(bmr * CLIENT.activityLevel);

    // 3. קלוריות לפי יעד
    const totalCalories = CLIENT.goal === 'cut' ? tdee - 250 : tdee + 250;

    // 4. חישוב חלבון
    const proteinGrams = weight * CLIENT.proteinRatio;
    const proteinCals = proteinGrams * 4;

    // 5. יתרה קלורית
    const remainingCals = totalCalories - proteinCals;
    const carbCals = CLIENT.goal === 'cut' ? remainingCals * 0.7 : remainingCals * 0.6;
    const fatCals = CLIENT.goal === 'cut' ? remainingCals * 0.3 : remainingCals * 0.4;

    // 6. חישוב מנות
    const pPortions = Math.round((proteinGrams / portionValues.protein) * 2) / 2;
    const cPortions = Math.round((carbCals / 4 / portionValues.carbs) * 2) / 2;
    const fPortions = Math.round((fatCals / 9 / portionValues.fat) * 2) / 2;

    // 7. עדכון HTML
    document.getElementById('protein-target').innerText = `/ ${pPortions}`;
    document.getElementById('carbs-target').innerText = `/ ${cPortions}`;
    document.getElementById('fat-target').innerText = `/ ${fPortions}`;

    const goalText = CLIENT.goal === 'cut' ? 'חיטוב' : 'מסה';
    document.getElementById('header-goal-display').innerText = `${goalText} | ${totalCalories} קק"ל`;
    const coachEl = document.getElementById('coach-name-display');
    if (coachEl) coachEl.textContent = COACH_NAME;
    document.title = `פורטל הליווי של ${CLIENT.name}`;
    const h1 = document.querySelector('h1');
    h1.innerText = `תוכנית הכושר של ${CLIENT.name}`;
    h1.style.visibility = 'visible';

}

function _youtubeEmbedUrl(url) {
    try {
        const u = new URL(url);
        let id;
        if (u.hostname === 'youtu.be') {
            id = u.pathname.slice(1);
        } else if (u.pathname.includes('/shorts/')) {
            id = u.pathname.split('/shorts/')[1].split('?')[0];
        } else {
            id = u.searchParams.get('v');
        }
        return id ? `https://www.youtube.com/embed/${id}?autoplay=1` : null;
    } catch { return null; }
}

function openVideoModal(url) {
    const embedUrl = _youtubeEmbedUrl(url);
    if (!embedUrl) return;
    document.getElementById('video-modal-iframe').src = embedUrl;
    document.getElementById('video-modal').classList.remove('hidden');
}

function closeVideoModal() {
    document.getElementById('video-modal').classList.add('hidden');
    document.getElementById('video-modal-iframe').src = '';
}

function initVideos() {
    const tables = document.querySelectorAll('.workout-table');
    tables.forEach(table => {
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
            const exerciseName = row.cells[1].innerText.trim();
            const videoCell = row.querySelector('.video-cell');
            const bankUrl = exerciseBank[exerciseName];
            if (videoCell) {
                if (bankUrl) {
                    const btn = document.createElement('button');
                    btn.className = 'play-link';
                    btn.textContent = '▶';
                    btn.addEventListener('click', () => openVideoModal(bankUrl));
                    videoCell.innerHTML = '';
                    videoCell.appendChild(btn);
                } else {
                    videoCell.textContent = '-';
                }
            }
        });
    });
}

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

    // פונקציה לניהול הצ'קליסט של האימונים
function initWorkoutsChecklist() {
    const savedState = JSON.parse(localStorage.getItem('workout_progress_v3')) || {};
    document.querySelectorAll('.workout-checkbox').forEach(cb => {
        const id = cb.getAttribute('data-id');
        if (savedState[id]) cb.checked = true;
    });

    document.addEventListener('change', (e) => {
        if (!e.target.classList.contains('workout-checkbox')) return;
        const cb = e.target;
        const id = cb.getAttribute('data-id');
        const currentState = JSON.parse(localStorage.getItem('workout_progress_v3')) || {};
        currentState[id] = cb.checked;
        localStorage.setItem('workout_progress_v3', JSON.stringify(currentState));
        if (typeof scheduleSyncWorkoutProgress === 'function') scheduleSyncWorkoutProgress();
        checkWorkoutCompletion(cb);
    });
}

function checkWorkoutCompletion(clickedCheckbox) {
    const storedDate = localStorage.getItem('workout_completed_date');
    if (storedDate && storedDate !== localDateStr()) {
        localStorage.removeItem('workout_completed_date');
    }

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
        if (localStorage.getItem('workout_popup_shown_date') !== today && isScheduledToday) {
            localStorage.setItem('workout_popup_shown_date', today);
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

    function manageDailyReset() {
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
        const lastReset = localStorage.getItem('last_reset_v4');
        if (lastReset === todayStr) return;
        localStorage.removeItem('user_portions_v3');
        localStorage.removeItem('tasks_v3');
        localStorage.removeItem('workout_progress_v3');
        localStorage.removeItem('workout_completed_date');
        localStorage.removeItem('workout_popup_shown_date');
        localStorage.removeItem('workout_streak_incremented_date');
        sessionStorage.removeItem('ai_chat_history');
        localStorage.setItem('last_reset_v4', todayStr);
        location.reload();
    }
    setInterval(() => manageDailyReset(), 60 * 1000);

    function modifyPortion(type, amount) {
        let current = userPortions[type] + amount;
        if (current < 0) current = 0;
        userPortions[type] = current;
        document.getElementById(type + '-val').innerText = current;
        localStorage.setItem('user_portions_v3', JSON.stringify(userPortions));
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
        const saved = localStorage.getItem('user_portions_v3');
        if (saved) {
            userPortions = JSON.parse(saved);
            document.getElementById('protein-val').innerText = userPortions.protein;
            document.getElementById('carbs-val').innerText = userPortions.carbs;
            document.getElementById('fat-val').innerText = userPortions.fat;
        }
        setTimeout(updateAllPortionProgress, 50);
    }

    function toggleTask(el) {
        const checkbox = el.querySelector('input');
        const evt = window.event;
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
        localStorage.setItem('tasks_v3', JSON.stringify(states));
    }

    function loadChecklist() {
        const savedTasks = JSON.parse(localStorage.getItem('tasks_v3'));
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
                localStorage.setItem('survey_submitted_' + _surveyWeekKey(), '1');
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
                    delete _trackingWidgetCache['history_' + uid];
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
                const savedWeights = JSON.parse(localStorage.getItem('exercise_weights') || '{}');
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
                const currentState = JSON.parse(localStorage.getItem('workout_progress_v3')) || {};
                currentState[id] = accordCheckbox.checked;
                localStorage.setItem('workout_progress_v3', JSON.stringify(currentState));
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
            const savedState = JSON.parse(localStorage.getItem('workout_progress_v3') || '{}');
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
        const dow = today.getDay();
        const mon = new Date(today);
        mon.setDate(today.getDate() + (dow === 0 ? -6 : 1 - dow));
        return `${mon.getFullYear()}-${String(mon.getMonth()+1).padStart(2,'0')}-${String(mon.getDate()).padStart(2,'0')}`;
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
        if (localStorage.getItem('survey_submitted_' + _surveyWeekKey())) return;
        const uid = typeof SB_USER !== 'undefined' && SB_USER?.id;
        if (!uid) return;
        try {
            const hasRow = await sbCheckThisWeekQuestionnaire(uid);
            if (hasRow) {
                localStorage.setItem('survey_submitted_' + _surveyWeekKey(), '1');
                return;
            }
            const banner = document.getElementById('weekly-survey-banner');
            if (banner) banner.style.display = 'flex';
        } catch(e) { console.warn('[SB] thursday banner:', e.message); }
    }

window.addEventListener('offline', () => {
    const banner = document.getElementById('offline-banner');
    if (banner) banner.style.display = 'block';
});

window.addEventListener('online', () => {
    const banner = document.getElementById('offline-banner');
    if (banner) banner.style.display = 'none';
    const toast = document.getElementById('supabase-error-toast');
    if (toast) {
        toast.textContent = 'התחברת מחדש ✅';
        toast.style.background = '#22c55e';
        toast.style.display = 'block';
        clearTimeout(window._onlineToastTimer);
        window._onlineToastTimer = setTimeout(() => {
            toast.style.display = 'none';
            toast.textContent = '⚠️ בעיית תקשורת — מנסה שוב';
            toast.style.background = '#e55';
        }, 3000);
    }
});

// ── PWA install ──────────────────────────────────────────────
let _deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    _deferredInstallPrompt = e;
});

window.addEventListener('appinstalled', () => {
    localStorage.setItem('pwa_installed', 'yes');
    _deferredInstallPrompt = null;
});

function _isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function _applySubscriberMode() {
    const hide = CLIENT.isSubscriber;
    const ids = ['calendly-hamburger-btn', 'open-survey-btn', 'coaching-goal-card'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = hide ? 'none' : '';
    });
    // באנרים — מוסתרים תמיד למנויים
    ['weekly-survey-banner', 'meeting-reminder-banner'].forEach(id => {
        const el = document.getElementById(id);
        if (el && hide) el.style.display = 'none';
    });
    const whatsappBtn = document.querySelector('.whatsapp-top-btn');
    if (whatsappBtn) whatsappBtn.style.display = hide ? 'none' : '';
}

function _showPWAPromptIfNeeded() {
    if (localStorage.getItem('pwa_prompt_shown')) return;
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    setTimeout(() => {
        const popup = document.getElementById('pwa-install-popup');
        if (popup) popup.style.cssText = 'display:flex;align-items:center;justify-content:center;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;';
    }, 2500);
}

function pwaInstallYes() {
    document.getElementById('pwa-install-popup').style.display = 'none';
    localStorage.setItem('pwa_prompt_shown', 'yes');
    if (_isIOS()) {
        const p = document.getElementById('pwa-ios-popup');
        p.style.cssText = 'display:flex;align-items:center;justify-content:center;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;';
    } else if (_deferredInstallPrompt) {
        _deferredInstallPrompt.prompt();
        _deferredInstallPrompt.userChoice.then(() => { _deferredInstallPrompt = null; });
    }
}

function pwaInstallLater() {
    document.getElementById('pwa-install-popup').style.display = 'none';
    localStorage.setItem('pwa_prompt_shown', 'later');
}

function pwaIosClose() {
    document.getElementById('pwa-ios-popup').style.display = 'none';
}

function triggerPWAInstall() {
    if (window.matchMedia('(display-mode: standalone)').matches || (!_isIOS() && localStorage.getItem('pwa_installed'))) {
        const toast = document.createElement('div');
        toast.innerText = 'האפליקציה כבר נמצאת במסך הבית ✓';
        toast.style.cssText = `position:fixed;top:24px;left:50%;transform:translateX(-50%);background:var(--accent);color:white;padding:12px 24px;border-radius:25px;font-size:15px;font-weight:bold;z-index:100001;box-shadow:0 4px 15px rgba(0,0,0,0.2);white-space:nowrap;`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
        return;
    }
    if (_isIOS()) {
        const p = document.getElementById('pwa-ios-popup');
        p.style.cssText = 'display:flex;align-items:center;justify-content:center;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;';
    } else if (_deferredInstallPrompt) {
        _deferredInstallPrompt.prompt();
        _deferredInstallPrompt.userChoice.then(() => { _deferredInstallPrompt = null; });
    } else {
        showAlert('כדי להוסיף למסך הבית, השתמש בתפריט הדפדפן');
    }
}

   window.onload = async () => {
    // ממתין לאימות Supabase לפני אתחול האפליקציה
    if (window._authReady) await window._authReady;
    if (typeof _appInitDone !== 'undefined' && _appInitDone) return;
    manageDailyReset();
    updateCounter();
    initVideos();
    loadPortions();
    loadChecklist();
    generatePortionGoals();
    updateGoalRecommendations();
    initWorkoutJournal();
    loadSavedWeight();
    loadCoachingGoal();
    updateWorkoutStreak();
    updateNutritionStreak();
    setTimeout(renderWeightChart, 100);
    checkBirthday();
    checkThursdayBanner();
    _showPWAPromptIfNeeded();
    _applySubscriberMode();
};

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        // keepalive save — survives iOS page kill
        const uid = typeof getActiveUserId === 'function' ? getActiveUserId() : null;
        if (uid) {
            const p = JSON.parse(localStorage.getItem('user_portions_v3') || '{}');
            if (p.protein || p.carbs || p.fat) {
                if (typeof sbQueueNutritionSync === 'function') {
                    sbQueueNutritionSync(uid, p.protein || 0, p.carbs || 0, p.fat || 0);
                } else if (typeof sbSaveNutrition === 'function') {
                    sbSaveNutrition(uid, p.protein || 0, p.carbs || 0, p.fat || 0).catch(() => {});
                }
            }
        }
    }
    if (document.visibilityState === 'visible' && typeof loadPortions === 'function') {
        loadPortions();
    }
});

window.addEventListener('pageshow', (e) => {
    if (e.persisted && typeof loadPortions === 'function') {
        loadPortions();
    }
});

    function toggleAccordion(id) {
        const content = document.getElementById(id);
        const allAccordions = document.querySelectorAll('.accordion-content');
        
        // סגירת שאר האקורדיונים
        allAccordions.forEach(acc => {
            if (acc.id !== id) {
                acc.style.display = 'none';
            }
        });

        // פתיחה או סגירה של הנוכחי
        if (content.style.display === 'block') {
            content.style.display = 'none';
        } else {
    content.style.display = 'block';
    if (id.startsWith('perf-')) initWorkoutJournal();
}
    }

    function updateGoalRecommendations() {
    const listContainer = document.getElementById('goal-food-list');
    const btnText = document.querySelector('.special-btn') || document.getElementById('goal-rec-btn');
    
    if (!listContainer || !btnText) return;

    const currentGoal = CLIENT.goal;

    if (currentGoal === "cut" || currentGoal === "חיטוב") {
        btnText.innerText = "💡 מאכלים שיעזרו לכם לרדת במשקל מבלי להיות רעבים";
        listContainer.innerHTML = `
            <li>חזה עוף (150 גרם\u00A0<b>לפני בישול</b>) = 1 חלבון</li>
            <li>פילה הודו (150 גרם\u00A0<b>לפני בישול</b>) = 1 חלבון</li>
            <li>פילה דג לבן (160 גרם\u00A0<b>לפני בישול</b>) = 1 חלבון</li>
            <li>טונה במים (קופסה מסוננת ~120 גרם) = 1 חלבון</li>
            <li>קוטג' 1% (250 גרם) = 1 חלבון</li>
            <li>חלבון ביצה (8 יח') = 1 חלבון</li>
            <li>יוגורט חלבון דל שומן (2 יח') = 1 חלבון</li>
            <li>תפוח אדמה (220 גרם\u00A0<b>לפני בישול</b>) = 1 פחמימה</li>
            <li>בטטה (220 גרם\u00A0<b>לפני בישול</b>) = 1 פחמימה</li>
            <li>עדשים (60 גרם\u00A0<b>לפני בישול/יבש</b>) = 1 פחמימה</li>
            <li>שעועית לבנה (60 גרם\u00A0<b>לפני בישול/יבש</b>) = 1 פחמימה</li>
            <li>קינואה (50 גרם\u00A0<b>לפני בישול/יבש</b>) = 1 פחמימה</li>
            <li>לחם קל (2 פרוסות) = 1 פחמימה</li>
            <li>פריכיות דקות (6–7 יח') = 1 פחמימה</li>
            <li>תפוח (1.5 יח') = 1 פחמימה</li>
            <li>תותים (300 גרם) = 1 פחמימה</li>
            <li>פופקורן ללא שמן (5–6 כוסות) = 1 פחמימה</li>
            <li>דלעת (500 גרם\u00A0<b>לפני בישול</b>) = 1 פחמימה</li>
            <li>פריכיות כוסמין (6 יח') = 1 פחמימה</li>
            <li>חלב דל שומן (כוס 330 מ"ל) = 0.5 פחמימה + 0.5 חלבון</li>
            <li>כרוב = 0 מנות (ללא הגבלה)</li>
        `;
    } else {
        btnText.innerText = "💡 מאכלים שיעזרו לך להגיע ליעדי החלבון והקלוריות מבלי לאכול בכוח";
        listContainer.innerHTML = `
            <li>פרגיות (150 גרם\u00A0<b>לפני בישול</b>) = 1 חלבון</li>
            <li>בקר טחון 15% (150 גרם\u00A0<b>לפני בישול</b>) = 1 חלבון</li>
            <li>סלמון (150 גרם\u00A0<b>לפני בישול</b>) = 1 חלבון</li>
            <li>אורז לבן (50 גרם\u00A0<b>לפני בישול/יבש</b>) = 1 פחמימה</li>
            <li>פסטה (50 גרם\u00A0<b>לפני בישול/יבש</b>) = 1 פחמימה</li>
            <li>קוסקוס (50 גרם\u00A0<b>לפני בישול/יבש</b>) = 1 פחמימה</li>
            <li>פתיתים (50 גרם\u00A0<b>לפני בישול/יבש</b>) = 1 פחמימה</li>
            <li>שיבולת שועל (50 גרם\u00A0<b>לפני בישול/יבש</b>) = 1 פחמימה</li>
            <li>תמר מג'הול (2 יח') = 1 פחמימה</li>
            <li>בננה גדולה (1 יח') = 1 פחמימה</li>
            <li>טורטייה (יחידה אחת) = 1 פחמימה</li>
            <li>בייגל (חצי יחידה) = 1 פחמימה</li>
            <li>גרנולה (5 כפות גדושות) = 1 פחמימה</li>
            <li>חמאת בוטנים (כף גדושה) = 1 שומן</li>
            <li>טחינה גולמית (כף) = 1 שומן</li>
            <li>שמן זית (כף) = 1 שומן</li>
            <li>אגוזי מלך (6 יח') = 1 שומן</li>
            <li>קשיו (10–12 יח') = 1 שומן</li>
            <li>אבוקדו (חצי יחידה) = 1 שומן</li>
            <li>חלב 3% (כוס 330 מ"ל) = 0.5 פחמימה + 0.5 חלבון</li>
        `;
    }
}
    function toggleChapter(btn) {
  const container = btn.parentElement;
  const isActive = container.classList.contains('active');
  
  // סגירת כל הפרקים האחרים
  document.querySelectorAll('.chapter-container').forEach(c => {
    c.classList.remove('active');
  });

  // פתיחה/סגירה של הנוכחי
  if (!isActive) {
    container.classList.add('active');
  }
}

function toggleTerm(header) {
  const item = header.parentElement;
  item.classList.toggle('active');
}

function filterInfo() {
  const input = document.getElementById('infoSearch');
  const filter = input.value.toLowerCase().trim();
  const chapters = document.querySelectorAll('.chapter-container');

  chapters.forEach(chapter => {
    const terms = chapter.querySelectorAll('.term-item');
    let chapterHasMatch = false;

    terms.forEach(term => {
      // שינוי קריטי: שומרים את ה-HTML המקורי לתצוגה בלבד
      if (!term.dataset.originalHtml) {
          term.dataset.originalHtml = term.innerHTML;
      }
      
      const originalHtml = term.dataset.originalHtml;
      // החיפוש מתבצע אך ורק על הטקסט שהמשתמש רואה בעיניים
      const plainText = term.innerText.toLowerCase();

      if (plainText.includes(filter)) {
        term.style.display = ""; 
        chapterHasMatch = true;
        
        if (filter.length > 0) {
            // מדגישים בתוך ה-HTML המקורי, אבל רק על בסיס התאמה בטקסט הנקי
            term.innerHTML = highlightText(originalHtml, filter);
        } else {
            term.innerHTML = originalHtml;
        }
      } else {
        term.style.display = "none";
      }
    });

    // ניהול נראות הפרק (Chapter)
    if (chapterHasMatch) {
      chapter.style.display = "";
      if (filter.length > 0) {
        chapter.classList.add('active');
      }
    } else {
      chapter.style.display = "none";
    }
    
    // ניקוי חיפוש
    if (filter === "") {
      chapter.classList.remove('active');
      terms.forEach(t => {
          if (t.dataset.originalHtml) t.innerHTML = t.dataset.originalHtml;
      });
    }
  });
}

function highlightText(html, filter) {
    if (!filter) return html;

    // יוצרים אלמנט זמני כדי לעבוד על הטקסט מבלי לפגוע במקור
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    // פונקציה רקורסיבית שעוברת רק על צומתי טקסט (Text Nodes)
    const walk = (node) => {
        if (node.nodeType === 3) { // Text node
            const text = node.nodeValue;
            const escapedFilter = filter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(${escapedFilter})`, 'gi');
            if (regex.test(text)) {
                const span = document.createElement('span');
                span.innerHTML = text.replace(regex, '<mark style="background-color: yellow; color: black;">$1</mark>');
                node.parentNode.replaceChild(span, node);
            }
        } else if (node.nodeType === 1 && node.childNodes && !['SCRIPT', 'STYLE'].includes(node.tagName)) {
            // עוברים על הילדים של האלמנט (אבל מדלגים על סקריפטים)
            Array.from(node.childNodes).forEach(walk);
        }
    };

    walk(tempDiv);
    return tempDiv.innerHTML;
}

// רשימת השאלות והתשובות המלאה - ללא מספור


// פונקציה לבניית השאלות הנפוצות
function initFAQ() {
    const container = document.getElementById('faq-categories-container');
    if (!container) return;

    container.innerHTML = ''; 

    faqData.forEach((item) => {
        const chapterDiv = document.createElement('div');
        chapterDiv.className = 'chapter-container';

        chapterDiv.innerHTML = `
            <button class="chapter-btn" onclick="toggleChapter(this)">
                <span>❓ ${item.category}</span>
                <span class="arrow">▼</span>
            </button>
            <div class="chapter-content">
                ${item.questions.map(qObj => `
                    <div class="term-item">
                        <div class="term-header" onclick="toggleTerm(this)">${qObj.q}</div>
                        <div class="term-body">${qObj.a}</div>
                    </div>
                `).join('')}
            </div>
        `;
        container.appendChild(chapterDiv);
    });
}

// הפעלה בטעינת הדף
    document.addEventListener('DOMContentLoaded', () => {
        initFAQ();
        initVideos();
        manageDailyReset();      
        showWorkout('A'); 

        // לוגיקה לכפתור חזרה למעלה - הכנסנו אותה לכאן כדי לוודא שהכפתור כבר קיים ב-HTML
        const btn = document.getElementById("backToTop");
        if (btn) {
            btn.addEventListener("click", function() {
                window.scrollTo({top: 0, behavior: 'smooth'});
            });
        }
    });

    // הלוגיקה של ההופעה/הסתרה יכולה להישאר בחוץ
    window.onscroll = function() {
        const btn = document.getElementById("backToTop");
        if (btn) {
            if (document.body.scrollTop > 300 || document.documentElement.scrollTop > 300) {
                btn.style.display = "block";
            } else {
                btn.style.display = "none";
            }
        }
    };

    function editWeightInline(el) {
    if (el.querySelector('input')) return;
    const current = el.innerText;
    const input = document.createElement('input');
    input.type = 'number';
    input.value = current;
    input.style.cssText = 'width:70px; text-align:center; border:1px solid var(--main-green); border-radius:6px; padding:4px; font-size:22px; font-weight:bold; color:var(--dark-green);';
    el.innerText = '';
    el.appendChild(input);
    el.onclick = null;
    input.focus();
    const save = () => {
        const val = parseFloat(input.value.trim());
        if (val && !isNaN(val)) {
            el.innerText = val;
            sessionStorage.setItem('current_weight', val);
            const _wDate = localDateStr();
            const weightHistory = JSON.parse(sessionStorage.getItem('weight_history') || '[]');
            weightHistory.push({ date: _wDate, weight: val });
            sessionStorage.setItem('weight_history', JSON.stringify(weightHistory));
            if (typeof syncWeightNow === 'function') syncWeightNow(_wDate, val).then(() => {
                const uid = getActiveUserId();
                if (uid && typeof _trackingWidgetCache !== 'undefined') {
                    delete _trackingWidgetCache['weekly_' + uid];
                    delete _trackingWidgetCache['history_' + uid];
                    if (typeof renderWeeklyScore === 'function') renderWeeklyScore(uid);
                    if (typeof renderScoreHistory === 'function') renderScoreHistory(uid);
                }
            });
            const allVals = document.querySelectorAll('.weight-val');
            const startWeight = parseFloat(allVals[0].innerText);
            const goalWeight = parseFloat(allVals[2].innerText);
            const weightDiff = startWeight - goalWeight;
            const percent = weightDiff === 0 ? 0 : Math.min(100, Math.round(((startWeight - val) / weightDiff) * 100));
            document.querySelectorAll('.progress-bar')[0].style.width = percent + '%';
            const pt = document.querySelector('.progress-text');
            pt.innerText = 'עברת כבר ' + percent + '% מהדרך ליעד!';
            pt.style.visibility = 'visible';
            generatePortionGoals();
            showWeightUpdateToast();
            renderWeightChart();
        } else {
            el.innerText = current;
        }
        el.onclick = () => editWeightInline(el);
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); }});
}

function loadSavedWeight() {
    document.getElementById('start-weight-display').innerText = CLIENT.startWeight;
    document.getElementById('goal-weight-display').innerText = CLIENT.goalWeight;
    const savedWeight = sessionStorage.getItem('current_weight');
    if (savedWeight) {
        const el = document.getElementById('current-weight-display');
        el.innerText = savedWeight;
        const allVals = document.querySelectorAll('.weight-val');
        const startWeight = parseFloat(allVals[0].innerText);
        const goalWeight = parseFloat(allVals[2].innerText);
        const weightDiff = startWeight - goalWeight;
        const percent = weightDiff === 0 ? 0 : Math.min(100, Math.round(((startWeight - parseFloat(savedWeight)) / weightDiff) * 100));
        document.querySelectorAll('.progress-bar')[0].style.width = percent + '%';
        const pt = document.querySelector('.progress-text');
        pt.innerText = 'עברת כבר ' + percent + '% מהדרך ליעד!';
        pt.style.visibility = 'visible';
    }
}

function makeEditable(td) {
    if (td.querySelector('input')) return;
    const current = td.innerText;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = current;
    input.style.cssText = 'width:60px; text-align:center; border:1px solid var(--main-green); border-radius:4px; padding:2px; font-size:14px;';
    td.innerText = '';
    td.appendChild(input);
    input.focus();
    input.select();
    input.setSelectionRange(0, input.value.length);
    const save = () => {
        const val = input.value.trim() || current;
        td.innerText = val;
        const key = 'perf_' + td.closest('tr').rowIndex + '_' + td.cellIndex;
        localStorage.setItem(key, val);
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
}

// ── יומן ביצועי אימון ───────────────────────────────────────

let _exerciseTargets = {};
let journalSelectedDate = null;
const lastShownPR = new Map();
const _trackingWidgetCache = {};
let journalCalOpen = false;
let journalCalViewYear = null;
let journalCalViewMonth = null;
let journalCalStart = null;
let journalCalMax = null;
let journalCalOutsideHandler = null;

// auth.js reinitApp() still calls loadPerfData() — keep as alias so admin view works
function loadPerfData() { initWorkoutJournal(); }

function initWorkoutJournal() {
    if (!journalSelectedDate) {
        journalSelectedDate = localDateStr();
    }
    renderJournalForDate(journalSelectedDate);
    const userId = getActiveUserId();
    if (userId) renderWeeklyScore(userId);
    if (userId) renderScoreHistory(userId);
}

function getWeekRange() {
    const today = new Date();
    const day = today.getDay(); // 0=Sun, 6=Sat
    const sun = new Date(today);
    sun.setDate(today.getDate() - day); // back to Sunday
    const sat = new Date(sun);
    sat.setDate(sun.getDate() + 6);
    const fmt = d => d.toISOString().split('T')[0];
    return { monStr: fmt(sun), sunStr: fmt(sat) };
}

function buildStars(score0to5) {
    const rounded = Math.round(score0to5 * 2) / 2;
    let s = '';
    for (let i = 1; i <= 5; i++) {
        if (rounded >= i) s += '<span style="opacity:1">⭐</span>';
        else if (rounded >= i - 0.5) s += '<span style="opacity:0.6">⭐</span>';
        else s += '<span style="opacity:0.3">⭐</span>';
    }
    return s;
}

function ensureWeeklyScoreContainer() {
    let el = document.getElementById('weekly-score-container');
    if (!el) {
        const anchor = document.getElementById('score-widgets-anchor');
        if (!anchor) return null;
        el = document.createElement('div');
        el.id = 'weekly-score-container';
        anchor.insertAdjacentElement('afterend', el);
    }
    return el;
}

async function renderWeeklyScore(userId) {
    const cacheKey = 'weekly_' + userId;
    if (_trackingWidgetCache[cacheKey] && Date.now() - _trackingWidgetCache[cacheKey] < 5 * 60 * 1000) return;
    const container = ensureWeeklyScoreContainer();
    if (!container) return;
    container.innerHTML = '<div style="text-align:center;padding:12px;color:var(--text-secondary);font-size:0.9rem;">טוען ציון שבועי...</div>';

    const { monStr, sunStr } = getWeekRange();
    try {
        const weeklyTarget = CLIENT.workoutsPerWeek || 3;
        const proteinGoal  = Math.round((CLIENT.currentWeight || CLIENT.startWeight || 80) * (CLIENT.proteinRatio || 2));
        const calorieGoal  = 2000;

        const [{ data: workoutData }, { data: nutritionRows }, { data: weightData }] = await Promise.all([
            db.from('workout_performance_log').select('date')
              .eq('client_id', userId).gte('date', monStr).lte('date', sunStr),
            db.from('daily_nutrition').select('date, protein, carbs, fat')
              .eq('user_id', userId).gte('date', monStr).lte('date', sunStr),
            db.from('weight_history').select('date')
              .eq('user_id', userId).gte('date', monStr).lte('date', sunStr).limit(1),
        ]);

        const workoutDates = new Set((workoutData || []).map(r => r.date));

        const workoutCount = workoutDates.size;
        const workoutScore = Math.min(workoutCount / weeklyTarget, 1);

        let nutritionMet = 0;
        (nutritionRows || []).forEach(r => {
            const proteinG = r.protein * portionValues.protein;
            const kcal = proteinG * 4 + (r.carbs * portionValues.carbs) * 4 + (r.fat * portionValues.fat) * 9;
            if (proteinG >= proteinGoal && kcal >= calorieGoal * 0.85) nutritionMet++;
        });
        const nutritionScore = Math.min(nutritionMet / 7, 1);

        const hasWeight   = weightData && weightData.length > 0;
        const habitsScore = hasWeight ? 1 : 0;

        const finalScore = workoutScore * 0.4 + nutritionScore * 0.4 + habitsScore * 0.2;
        const pct        = Math.round(finalScore * 100);
        const stars      = buildStars(finalScore * 5);
        const weekLabel  = `${journalFormatShortDate(monStr)} – ${journalFormatShortDate(sunStr)}`;

        container.innerHTML = `
            <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px;direction:rtl;">
                <div style="font-weight:bold;font-size:0.9rem;color:var(--text-secondary);margin-bottom:10px;">📊 ציון שבועי &nbsp;|&nbsp; ${weekLabel}</div>
                <div style="font-size:1.5rem;text-align:center;margin-bottom:10px;direction:ltr;">${stars}&nbsp;<span style="font-size:1.1rem;font-weight:bold;">${pct}%</span></div>
                <div style="font-size:0.88rem;display:flex;flex-direction:column;gap:6px;color:var(--text-primary);">
                    <div>${workoutScore >= 1 ? '✅' : '⚠️'} אימונים: ${workoutCount}/${weeklyTarget} השבוע &nbsp;<span style="color:var(--text-secondary)">(${Math.round(workoutScore*100)}%)</span></div>
                    <div>${nutritionMet >= Math.ceil(7 * 0.6) ? '✅' : '⚠️'} תזונה: ${nutritionMet}/7 ימים עמדו ביעד &nbsp;<span style="color:var(--text-secondary)">(${Math.round(nutritionScore*100)}%)</span></div>
                    <div>${hasWeight ? '✅' : '⚠️'} שקילה: ${hasWeight ? 'נשקלת השבוע ✓' : 'טרם נשקל השבוע'}</div>
                </div>
            </div>`;
        _trackingWidgetCache[cacheKey] = Date.now();
        if (typeof checkAchievements === 'function') checkAchievements(CLIENT, null, null, null);
    } catch (err) {
        console.error('Weekly score error:', err);
        container.innerHTML = '';
    }
}

async function renderScoreHistory(userId) {
    const cacheKey = 'history_' + userId;
    if (_trackingWidgetCache[cacheKey] && Date.now() - _trackingWidgetCache[cacheKey] < 5 * 60 * 1000) return;
    let container = document.getElementById('score-history-container');
    if (!container) {
        const anchor = document.getElementById('score-history-anchor');
        if (!anchor) return;
        container = document.createElement('div');
        container.id = 'score-history-container';
        anchor.insertAdjacentElement('afterend', container);
    }
    container.innerHTML = '<div style="text-align:center;padding:12px;color:var(--text-secondary);font-size:0.9rem;">טוען היסטוריה...</div>';

    try {
        const today = new Date();
        const dow   = today.getDay();
        const fmt   = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const thisMon = new Date(today);
        thisMon.setDate(today.getDate() - dow); // back to Sunday
        thisMon.setHours(0, 0, 0, 0);
        const thisMonStr = fmt(thisMon);
        const thisSunStr = fmt(new Date(thisMon.getTime() + 6 * 86400000));

        // Past weeks from weekly_scores (same source as admin panel)
        // Order descending + limit so we always get the MOST RECENT weeks, then reverse for display
        const { data: histRaw } = await db
            .from('weekly_scores')
            .select('week_start, score')
            .eq('client_id', userId)
            .lt('week_start', thisMonStr)
            .order('week_start', { ascending: false })
            .limit(7);
        const histData = (histRaw || []).reverse();

        // Current week — compute live from raw data
        const weeklyTarget = CLIENT.workoutsPerWeek || 3;
        const proteinGoal  = Math.round((CLIENT.currentWeight || CLIENT.startWeight || 80) * (CLIENT.proteinRatio || 2));
        const [{ data: wkData }, { data: nutData }, { data: wtData }] = await Promise.all([
            db.from('workout_performance_log').select('date').eq('client_id', userId).gte('date', thisMonStr).lte('date', thisSunStr),
            db.from('daily_nutrition').select('date,protein,carbs,fat').eq('user_id', userId).gte('date', thisMonStr).lte('date', thisSunStr),
            db.from('weight_history').select('date').eq('user_id', userId).gte('date', thisMonStr).lte('date', thisSunStr),
        ]);
        let nutritionMet = 0;
        (nutData || []).forEach(r => {
            const proteinG = r.protein * portionValues.protein;
            const kcal = proteinG * 4 + (r.carbs * portionValues.carbs) * 4 + (r.fat * portionValues.fat) * 9;
            if (proteinG >= proteinGoal && kcal >= 1700) nutritionMet++;
        });
        const curScore = Math.round((
            Math.min(new Set((wkData||[]).map(r=>r.date)).size / weeklyTarget, 1) * 0.4 +
            Math.min(nutritionMet / 7, 1) * 0.4 +
            ((wtData||[]).length > 0 ? 1 : 0) * 0.2
        ) * 100);

        // Merge: past weeks + current week
        const pastPoints = (histData || []).map(r => {
            const [, m, d] = r.week_start.split('-');
            return { label: `${d}/${m}`, score: r.score, current: false };
        });
        const computed = [...pastPoints, { label: 'השבוע', score: curScore, current: true }];

        // Trim leading all-zero past weeks, always keep current week
        const firstReal = computed.findIndex(w => w.score > 0 || w.current);
        const visible = firstReal >= 0 ? computed.slice(firstReal) : computed.slice(-1);

        await loadChartJs();

        container.innerHTML = `
            <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px;direction:rtl;">
                <div style="font-weight:bold;font-size:0.9rem;color:var(--text-secondary);margin-bottom:12px;">📈 היסטוריית ציונים שבועיים</div>
                <canvas id="score-history-canvas"></canvas>
            </div>`;

        const goalLabelPlugin = {
            id: 'goalLabel',
            afterDraw(chart) {
                const yScale = chart.scales.y;
                const y = yScale.getPixelForValue(80);
                const { ctx: c, chartArea } = chart;
                c.save();
                c.fillStyle = 'rgba(245,197,24,0.85)';
                c.font = 'bold 10px sans-serif';
                c.textAlign = 'left';
                c.fillText('יעד', chartArea.left + 4, y - 4);
                c.restore();
            }
        };

        const ctx = container.querySelector('#score-history-canvas').getContext('2d');
        new Chart(ctx, {
            type: 'line',
            plugins: [goalLabelPlugin],
            data: {
                labels: visible.map(w => w.label),
                datasets: [{
                    label: 'ציון שבועי',
                    data: visible.map(w => w.score),
                    borderColor: '#f5c518',
                    backgroundColor: 'rgba(245,197,24,0.06)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: visible.map(w => w.current ? 8 : 5),
                    pointHoverRadius: 10,
                    pointBackgroundColor: visible.map(w => w.current ? '#fff' : '#f5c518'),
                    pointBorderColor: visible.map(w => w.current ? '#f5c518' : '#fff'),
                    pointBorderWidth: visible.map(w => w.current ? 3 : 1.5),
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 2,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: c => ` ציון: ${c.parsed.y}%` } }
                },
                scales: {
                    y: {
                        min: 0, max: 100,
                        ticks: { stepSize: 20 },
                        grid: {
                            color: c => c.tick.value === 80 ? 'rgba(245,197,24,0.6)' : 'rgba(128,128,128,0.1)',
                            lineWidth: c => c.tick.value === 80 ? 2 : 1,
                            borderDash: c => c.tick.value === 80 ? [6, 3] : [],
                        }
                    },
                    x: { ticks: { maxRotation: 0, font: { size: 11 } } }
                }
            }
        });
        _trackingWidgetCache[cacheKey] = Date.now();
    } catch (err) {
        console.error('Score history error:', err);
        container.innerHTML = `
            <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px;direction:rtl;">
                <div style="font-weight:bold;font-size:0.9rem;color:var(--text-secondary);margin-bottom:8px;">📈 היסטוריית ציונים שבועיים</div>
                <div style="text-align:center;color:var(--text-secondary);font-size:0.88rem;padding:8px 0;">אין מספיק היסטוריה עדיין</div>
            </div>`;
    }
}

function getWorkoutLetterForDate(dateStr) {
    const dayOfWeek = new Date(dateStr + 'T12:00:00').getDay();
    const workoutDays = CLIENT.workoutDays || {};
    for (const [letter, days] of Object.entries(workoutDays)) {
        if (Array.isArray(days) && days.includes(dayOfWeek)) return letter;
    }
    return null;
}

function getExercisesForLetter(letter) {
    return CLIENT['workout' + letter] || [];
}

function journalFormatDate(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    const months = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
    return `יום ${dayNames[d.getDay()]}, ${d.getDate()} ב${months[d.getMonth()]} ${d.getFullYear()}`;
}

function journalFormatShortDate(dateStr) {
    const [y, m, day] = dateStr.split('-');
    return `${day}/${m}/${y}`;
}

async function renderJournalForDate(dateStr) {
    const container = document.getElementById('workout-journal-container');
    if (!container) return;

    const today = localDateStr();
    const startDate = CLIENT.startDate || today;
    const maxDate = new Date(new Date(startDate + 'T12:00:00').getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const isToday = dateStr === today;
    const atMin = dateStr <= startDate;
    const atMax = dateStr >= maxDate;

    const navBtnStyle = 'background:#5b7cfa;color:#ffffff;border:none;border-radius:20px;padding:8px 14px;font-size:13px;font-weight:bold;cursor:pointer;';

    let html = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px;">
            <button onclick="journalPrevDay()" ${atMin ? 'disabled' : ''} style="${navBtnStyle}opacity:${atMin ? '.35' : '1'}">יום קודם</button>
            <div style="text-align:center;flex:1;position:relative;">
                <button onclick="toggleJournalCal()" style="font-size:15px;font-weight:bold;color:var(--text-primary);background:transparent;border:none;border-bottom:2px solid #5b7cfa;cursor:pointer;padding:4px 8px;">${journalFormatDate(dateStr)}</button>
                <div id="journal-calendar" style="display:none;position:absolute;top:calc(100% + 8px);left:50%;transform:translateX(-50%);z-index:1000;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:12px;min-width:280px;box-shadow:0 4px 20px rgba(0,0,0,0.2);"></div>
                ${!isToday ? `<button onclick="journalGoToday()" style="background:#5b7cfa;color:#ffffff;border:none;border-radius:20px;padding:8px 20px;font-size:14px;font-weight:bold;cursor:pointer;display:block;margin:6px auto 0;box-shadow:0 2px 6px rgba(0,0,0,0.3);">חזרה להיום</button>` : ''}
            </div>
            <button onclick="journalNextDay()" ${atMax ? 'disabled' : ''} style="${navBtnStyle}opacity:${atMax ? '.35' : '1'}">יום הבא</button>
        </div>`;

    const workoutLetter = getWorkoutLetterForDate(dateStr);
    const exercises = workoutLetter ? getExercisesForLetter(workoutLetter) : [];

    if (!workoutLetter || !exercises.length) {
        container.innerHTML = html + '<div style="text-align:center;padding:18px 0;color:var(--text-secondary);font-size:15px;">אין אימון מתוכנן היום</div>';
        initJournalCal(dateStr, startDate, maxDate);
        return;
    }

    container.innerHTML = html + '<div style="text-align:center;padding:8px 0;font-size:13px;color:var(--text-secondary);">טוען...</div>';

    const userId = getActiveUserId();
    let savedEntries = {};
    let lastEntries = {};

    try {
        const rows = await sbFetchWorkoutPerformanceLog(userId, dateStr);
        rows.forEach(r => { savedEntries[r.exercise_name] = { weight_kg: r.weight_kg, reps: r.reps }; });

        await Promise.all(exercises.map(async ex => {
            const last = await sbFetchLastWorkoutPerformance(userId, ex.name, dateStr);
            if (last) lastEntries[ex.name] = last;
        }));
    } catch (err) {
        console.error('Journal load error:', err);
    }

    html += `<div style="font-size:13px;color:var(--text-secondary);text-align:center;margin-bottom:4px;">אימון ${workoutLetter}</div>`;
    html += `<div style="font-size:13px;color:var(--text-secondary);text-align:center;margin-bottom:12px;">יש להזין משקל וחזרות מהסט הטוב ביותר באימון הנוכחי</div>`;
    html += '<div id="journal-exercises">';

    exercises.forEach(ex => {
        const saved = savedEntries[ex.name] || {};
        const last = lastEntries[ex.name];
        const lastHtml = last
            ? `<div class="journal-last-entry">אימון קודם (${journalFormatShortDate(last.date)}): משקל ${last.weight_kg} × ${last.reps} חזרות</div>`
            : `<div class="journal-last-entry" style="color:var(--text-muted)">אין רשומה קודמת</div>`;
        const isSaved = saved.weight_kg != null;
        html += `
            <div class="journal-ex-card${isSaved ? ' journal-ex-saved' : ''}">
                <div class="journal-ex-header">
                    <span class="journal-ex-name">${ex.name}</span>
                    <button class="journal-chart-btn" data-exercise="${ex.name}">📊</button>
                </div>
                ${lastHtml}
                <div class="journal-ex-body">
                    <div class="journal-ex-inputs">
                        <label class="journal-ex-label">
                            <span>משקל:</span>
                            <input type="number" class="journal-weight-input" data-exercise="${ex.name}"
                                   value="${saved.weight_kg ?? ''}" min="0" step="0.5"
                                   style="width:80px;padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--input-bg);color:var(--text-primary);font-size:16px;text-align:center;">
                        </label>
                        <label class="journal-ex-label">
                            <span>חזרות:</span>
                            <input type="number" class="journal-reps-input" data-exercise="${ex.name}"
                                   value="${saved.reps ?? ''}" min="0" step="1"
                                   style="width:80px;padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--input-bg);color:var(--text-primary);font-size:16px;text-align:center;">
                        </label>
                    </div>
                    <button class="journal-save-btn" data-exercise="${ex.name}">שמירה ✓</button>
                </div>
            </div>`;
    });

    html += '</div>';
    html += '<div id="journal-save-msg" style="font-size:15px;font-weight:bold;color:var(--main-green);text-align:center;padding:8px;min-height:20px;"></div>';

    container.innerHTML = html;

    container.querySelectorAll('.journal-ex-header').forEach(header => {
        header.addEventListener('click', (e) => {
            if (e.target.classList.contains('journal-chart-btn')) return;
            header.closest('.journal-ex-card').classList.toggle('open');
        });
    });

    container.querySelectorAll('.journal-chart-btn').forEach(btn => {
        btn.addEventListener('click', () => showStrengthChart(btn.dataset.exercise, userId));
    });

    container.querySelectorAll('.journal-save-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const exerciseName = btn.dataset.exercise;
            await autoSaveJournalEntries(dateStr, workoutLetter, exerciseName);
            btn.textContent = '✓ נשמר';
            btn.closest('.journal-ex-card').classList.add('journal-ex-saved');
            setTimeout(() => { btn.textContent = 'שמירה ✓'; }, 2000);
        });
    });
    container.querySelectorAll('.journal-weight-input').forEach(inp => {
        inp.addEventListener('keydown', e => {
            if (!['0','1','2','3','4','5','6','7','8','9','.','Backspace','Delete','Tab','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault();
        });
    });
    container.querySelectorAll('.journal-reps-input').forEach(inp => {
        inp.addEventListener('keydown', e => {
            if (!['0','1','2','3','4','5','6','7','8','9','Backspace','Delete','Tab','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault();
        });
    });
    initJournalCal(dateStr, startDate, maxDate);
}

// ── Calendar picker ──────────────────────────────────────────

function initJournalCal(selectedDate, startDate, maxDate) {
    journalCalStart = startDate;
    journalCalMax = maxDate;
    journalCalOpen = false;
    const d = new Date(selectedDate + 'T12:00:00');
    journalCalViewYear = d.getFullYear();
    journalCalViewMonth = d.getMonth();
    renderJournalCalGrid(selectedDate);
    const calEl = document.getElementById('journal-calendar');
    if (calEl) calEl.addEventListener('click', e => e.stopPropagation());
    if (journalCalOutsideHandler) document.removeEventListener('click', journalCalOutsideHandler);
    journalCalOutsideHandler = (e) => {
        const cal = document.getElementById('journal-calendar');
        const btn = cal && cal.previousElementSibling;
        if (cal && !cal.contains(e.target) && e.target !== btn) {
            cal.style.display = 'none';
            journalCalOpen = false;
        }
    };
    document.addEventListener('click', journalCalOutsideHandler);
}

function toggleJournalCal() {
    const cal = document.getElementById('journal-calendar');
    if (!cal) return;
    journalCalOpen = !journalCalOpen;
    cal.style.display = journalCalOpen ? 'block' : 'none';
    if (journalCalOpen) {
        setTimeout(() => {
            cal.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 50);
    }
}

function renderJournalCalGrid(selectedDate) {
    const cal = document.getElementById('journal-calendar');
    if (!cal) return;
    const year = journalCalViewYear;
    const month = journalCalViewMonth;
    const today = localDateStr();
    const monthNames = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
    const dayNames = ['א','ב','ג','ד','ה','ו','ש'];
    const firstOfMonth = `${year}-${String(month+1).padStart(2,'0')}-01`;
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const lastOfMonth = `${year}-${String(month+1).padStart(2,'0')}-${String(daysInMonth).padStart(2,'0')}`;
    const canPrev = firstOfMonth > journalCalStart;
    const canNext = lastOfMonth < journalCalMax;
    const navStyle = 'background:#5b7cfa;color:#ffffff;border:none;border-radius:8px;padding:4px 10px;font-size:14px;font-weight:bold;cursor:pointer;';
    const disStyle = navStyle + 'opacity:0.35;cursor:default;';
    let html = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <button onclick="journalCalPrevMonth('${selectedDate}')" style="${canPrev ? navStyle : disStyle}" ${canPrev ? '' : 'disabled'}>‹</button>
        <span style="font-weight:bold;font-size:14px;color:var(--text-primary);">${monthNames[month]} ${year}</span>
        <button onclick="journalCalNextMonth('${selectedDate}')" style="${canNext ? navStyle : disStyle}" ${canNext ? '' : 'disabled'}>›</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px;">
        ${dayNames.map(d => `<div style="text-align:center;font-size:12px;font-weight:bold;color:var(--text-secondary);padding:3px 0;">${d}</div>`).join('')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;">`;
    const firstDayOfWeek = new Date(year, month, 1).getDay();
    for (let i = 0; i < firstDayOfWeek; i++) html += '<div></div>';
    for (let day = 1; day <= daysInMonth; day++) {
        const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const disabled = ds < journalCalStart || ds > journalCalMax;
        const isSelected = ds === selectedDate;
        const isToday = ds === today;
        let bg = 'transparent', color = 'var(--text-primary)', cursor = 'pointer', border = 'none';
        if (isToday && isSelected) { bg = '#5b7cfa'; color = '#ffffff'; border = '2px solid var(--main-green)'; }
        else if (isSelected) { bg = 'var(--main-green)'; color = '#ffffff'; }
        else if (isToday) { bg = '#5b7cfa'; color = '#ffffff'; }
        if (disabled) { color = 'var(--text-secondary)'; cursor = 'default'; }
        html += `<div onclick="${disabled ? '' : `journalCalSelect('${ds}')`}"
            style="text-align:center;padding:5px 2px;border-radius:6px;font-size:13px;background:${bg};color:${color};cursor:${cursor};opacity:${disabled ? '0.35' : '1'};border:${border};box-sizing:border-box;">${day}</div>`;
    }
    html += '</div>';
    cal.innerHTML = html;
}

function journalCalPrevMonth(selectedDate) {
    if (journalCalViewMonth === 0) { journalCalViewMonth = 11; journalCalViewYear--; }
    else journalCalViewMonth--;
    renderJournalCalGrid(selectedDate);
}

function journalCalNextMonth(selectedDate) {
    if (journalCalViewMonth === 11) { journalCalViewMonth = 0; journalCalViewYear++; }
    else journalCalViewMonth++;
    renderJournalCalGrid(selectedDate);
}

function journalCalSelect(dateStr) {
    const cal = document.getElementById('journal-calendar');
    if (cal) cal.style.display = 'none';
    journalCalOpen = false;
    journalSelectedDate = dateStr;
    renderJournalForDate(dateStr);
}

function journalPrevDay() {
    const d = new Date(journalSelectedDate + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    const startDate = CLIENT.startDate || localDateStr();
    const candidate = d.toISOString().split('T')[0];
    if (candidate < startDate) return;
    journalSelectedDate = candidate;
    renderJournalForDate(journalSelectedDate);
}

function journalNextDay() {
    const d = new Date(journalSelectedDate + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    const startDate = CLIENT.startDate || localDateStr();
    const maxDate = new Date(new Date(startDate + 'T12:00:00').getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const candidate = d.toISOString().split('T')[0];
    if (candidate > maxDate) return;
    journalSelectedDate = candidate;
    renderJournalForDate(journalSelectedDate);
}

function journalGoToday() {
    journalSelectedDate = localDateStr();
    renderJournalForDate(journalSelectedDate);
}

async function loadChartJs() {
    if (window.Chart) return;
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/chart.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
}

async function showStrengthChart(exerciseName, userId) {
    await loadChartJs();
    const { data, error } = await db
        .from('workout_performance_log')
        .select('date, weight_kg, reps')
        .eq('client_id', userId)
        .eq('exercise_name', exerciseName)
        .order('date', { ascending: true });
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6)';
    const modal = document.createElement('div');
    modal.style.cssText = 'background:var(--bg-card);border-radius:16px;padding:20px;width:90%;max-width:500px;position:relative;';
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const close = (e) => { if (e.target === overlay || e.target.id === 'close-chart-btn') overlay.remove(); };
    overlay.addEventListener('click', close);

    if (error || !data || !data.length) {
        modal.innerHTML = `
            <button id="close-chart-btn" style="position:absolute;top:10px;left:10px;background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--text-primary);">✕</button>
            <div style="font-weight:bold;font-size:1.1rem;text-align:center;margin-bottom:16px;direction:rtl;">${exerciseName}</div>
            <div style="text-align:center;padding:24px 0;color:var(--text-secondary);font-size:0.95rem;">אין נתונים להצגה</div>`;
        return;
    }

    modal.innerHTML = `
        <button id="close-chart-btn" style="position:absolute;top:10px;left:10px;background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--text-primary);">✕</button>
        <div style="font-weight:bold;font-size:1.1rem;text-align:center;margin-bottom:16px;direction:rtl;">${exerciseName}</div>
        <canvas id="strength-chart-canvas"></canvas>`;

    const ctx = modal.querySelector('#strength-chart-canvas').getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(r => r.date),
            datasets: [
                {
                    label: 'משקל',
                    data: data.map(r => r.weight_kg),
                    borderColor: '#5b7cfa',
                    backgroundColor: 'rgba(91,124,250,0.15)',
                    fill: true,
                    tension: 0.3,
                    yAxisID: 'y',
                },
                {
                    label: 'חזרות',
                    data: data.map(r => r.reps),
                    borderColor: '#4caf50',
                    backgroundColor: 'transparent',
                    borderDash: [6, 3],
                    tension: 0.3,
                    yAxisID: 'y2',
                }
            ]
        },
        options: {
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            scales: {
                y:  { type: 'linear', position: 'left',  min: 0, max: 100, ticks: { color: '#5b7cfa' }, title: { display: true, text: 'משקל' } },
                y2: { type: 'linear', position: 'right', min: 0, max: 25,  grid: { drawOnChartArea: false }, ticks: { color: '#4caf50', stepSize: 1, precision: 0 }, title: { display: true, text: 'חזרות' } }
            }
        }
    });
}

async function fetchAllTimeBest(userId, exerciseName, beforeDate) {
    const { data, error } = await db
        .from('workout_performance_log')
        .select('weight_kg, reps')
        .eq('client_id', userId)
        .eq('exercise_name', exerciseName)
        .lt('date', beforeDate);
    if (error || !data || !data.length) return null;
    return data.reduce((best, row) => {
        if (row.weight_kg > best.weight_kg || (row.weight_kg === best.weight_kg && row.reps > best.reps)) return row;
        return best;
    }, data[0]);
}

async function autoSaveJournalEntries(dateStr, workoutLetter, changedExercise) {
    const userId = getActiveUserId();
    const entries = [];
    document.querySelectorAll('.journal-weight-input').forEach(wi => {
        const exerciseName = wi.dataset.exercise;
        const ri = document.querySelector(`.journal-reps-input[data-exercise="${CSS.escape(exerciseName)}"]`);
        const weight = parseFloat(wi.value);
        const reps = parseInt(ri?.value);
        if (!isNaN(weight) && weight >= 0 && !isNaN(reps) && reps >= 0) {
            entries.push({ exercise_name: exerciseName, workout_letter: workoutLetter, weight_kg: weight, reps });
        }
    });
    try {
        const candidateEntries = entries.filter(e => e.exercise_name === changedExercise);
        const prevBests = await Promise.all(
            candidateEntries.map(e => fetchAllTimeBest(userId, e.exercise_name, dateStr).catch(() => null))
        );
        await sbSaveWorkoutPerformanceLog(userId, dateStr, entries);
        initWorkoutsFromClient();
        const msg = document.getElementById('journal-save-msg');
        if (msg) {
            msg.textContent = 'נשמר ✓';
            setTimeout(() => { if (msg) msg.textContent = ''; }, 2000);
        }
        const prs = [];
        candidateEntries.forEach((e, i) => {
            const prev = prevBests[i];
            if (e.weight_kg > 0 && (!prev || e.weight_kg > prev.weight_kg || (e.weight_kg === prev.weight_kg && e.reps > prev.reps))) {
                const lastShown = lastShownPR.get(e.exercise_name);
                const betterThanLastShown = !lastShown || e.weight_kg > lastShown.weight_kg || (e.weight_kg === lastShown.weight_kg && e.reps > lastShown.reps);
                if (betterThanLastShown) prs.push({ name: e.exercise_name, weight: e.weight_kg, reps: e.reps });
            }
        });
        if (prs.length > 0) showPRPopups(prs);
    } catch (err) {
        console.error('Journal auto-save error:', err);
    }
}

function showPRPopups(prs) {
    let idx = 0;
    function showNext() {
        if (idx >= prs.length) return;
        const pr = prs[idx++];
        lastShownPR.set(pr.name, { weight_kg: pr.weight, reps: pr.reps });
        const backdrop = document.createElement('div');
        backdrop.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5)';
        backdrop.innerHTML = `<div style="background:var(--bg-card);border-radius:14px;padding:19px 24px;text-align:center"><div style="font-size:1.55rem;font-weight:bold">🏆 שיא אישי חדש!</div><div style="font-size:1.2rem;font-weight:bold;margin-top:7px">${pr.name}</div><div style="font-size:1.15rem;margin-top:5px">משקל ${pr.weight} × ${pr.reps} חזרות</div></div>`;
        document.body.appendChild(backdrop);
        let closed = false;
        const close = () => { if (closed) return; closed = true; backdrop.remove(); showNext(); };
        backdrop.addEventListener('click', close);
        setTimeout(close, 3000);
    }
    showNext();
}

async function saveJournalEntries(dateStr, workoutLetter) {
    const userId = getActiveUserId();
    const entries = [];
    document.querySelectorAll('.journal-weight-input').forEach(wi => {
        const exerciseName = wi.dataset.exercise;
        const ri = document.querySelector(`.journal-reps-input[data-exercise="${CSS.escape(exerciseName)}"]`);
        const weight = parseFloat(wi.value);
        const reps = parseInt(ri?.value);
        if (!isNaN(weight) && weight >= 0 && !isNaN(reps) && reps >= 0) {
            entries.push({ exercise_name: exerciseName, workout_letter: workoutLetter, weight_kg: weight, reps });
        }
    });
    try {
        await sbSaveWorkoutPerformanceLog(userId, dateStr, entries);
        const msg = document.getElementById('journal-save-msg');
        if (msg) {
            msg.style.color = 'var(--main-green)';
            msg.textContent = '✅ נשמר בהצלחה!';
            setTimeout(() => { if (msg) msg.textContent = ''; }, 2500);
        }
    } catch (err) {
        console.error('Journal save error:', err);
        const msg = document.getElementById('journal-save-msg');
        if (msg) { msg.style.color = '#e55'; msg.textContent = '❌ שגיאה בשמירה'; }
    }
}

// ── משקלים בטבלאות האימונים ─────────────────────────────────

function initWorkoutTableWeights(targets = {}) {
    document.querySelectorAll('.workout-table tbody tr').forEach(row => {
        const weightCell = row.cells[5];
        if (!weightCell) return;
        const exerciseName = row.cells[1]?.textContent.trim();
        if (!exerciseName) return;
        const exKey = exerciseName.replace(/\s+/g, '_');
        weightCell.style.cursor = 'pointer';
        weightCell.onclick = null;
        weightCell.onclick = function() {
            const wCell = this;
            const wKey = 'workout_weight_' + exKey;
            if (wCell.querySelector('input')) return;
            const current = wCell.innerText.replace(/[^\d.]/g, '');
            const input = document.createElement('input');
            input.type = 'number';
            input.value = current || '';
            input.style.cssText = 'width:60px;text-align:center;border:1px solid var(--main-green);border-radius:4px;padding:2px;font-size:14px;';
            wCell.innerText = '';
            wCell.appendChild(input);
            input.focus();
            input.onblur = function() {
                const val = this.value.trim();
                wCell.innerText = val || '';
                if (val) localStorage.setItem(wKey, val);
            };
            input.onkeydown = function(e) { if (e.key === 'Enter') this.blur(); };
        };
        // only fall back to localStorage when no Supabase target exists
        if (!targets[exerciseName]) {
            const saved = localStorage.getItem('workout_weight_' + exKey);
            if (saved) weightCell.innerText = saved;
        }
    });
}

function resetWorkout() {
    const activeBtn = document.querySelector('.workout-nav-btn.active');
    const activeLetter = activeBtn?.getAttribute('onclick')?.match(/'([A-G])'/)?.[1];
    if (!activeLetter) return;

    const progress = JSON.parse(localStorage.getItem('workout_progress_v3') || '{}');
    Object.keys(progress).forEach(key => { if (key.startsWith(activeLetter + '_')) delete progress[key]; });
    localStorage.setItem('workout_progress_v3', JSON.stringify(progress));

    document.querySelectorAll(`[data-id^="${activeLetter}_"]`).forEach(cb => cb.checked = false);
    document.querySelectorAll(`#workout-${activeLetter} .accord-checkbox`).forEach(cb => {
        cb.checked = false;
        const header = cb.closest('.workout-accord-header');
        if (header) header.classList.remove('checked');
    });
}


async function initWorkoutsFromClient() {
    console.log('[init] function called, uid:', getActiveUserId());
    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const selector = document.getElementById('workout-selector');
    selector.innerHTML = '';

    const dayNames = ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'יום שבת'];
    let firstLetter = null;

    const uid = getActiveUserId();
    if (uid) {
        try { _exerciseTargets = await getExerciseTargets(uid); } catch(e) { console.warn('getExerciseTargets failed', e); }
    }
    const targets = _exerciseTargets;

    letters.forEach(letter => {
        const workout = CLIENT['workout' + letter];
        const hasCardio = !!CLIENT.cardioPlan?.[letter]?.description;
        if ((!workout || !workout.length) && !hasCardio) return;

        if (!firstLetter) firstLetter = letter;

        const btn = document.createElement('button');
        btn.className = 'workout-nav-btn';
        const days = CLIENT.workoutDays?.[letter];
        btn.innerText = days && days.length ? days.map(d => dayNames[d]).join(' + ') : 'אימון ' + letter;
        btn.setAttribute('onclick', `showWorkout('${letter}')`);
        selector.appendChild(btn);

        const container = document.getElementById('workout-' + letter);
        if (!container) return;
        const tbody = container.querySelector('tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        (workout || []).forEach((ex, i) => {
            const t = targets[ex.name];
            const weightDisplay = t
                ? `${t.target_weight}${t.suggest_increase ? ' <span style="color:#22c55e;font-size:0.9em;">↑</span>' : ''}`
                : '';
            const repsDisplay = t ? String(t.target_reps) : ex.reps;
            const subtext = t?.suggest_increase
                ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">הוסף קצת משקל</div>`
                : '';
            tbody.innerHTML += `
                <tr>
                    <td><input type="checkbox" class="workout-checkbox" data-id="${letter}_${i}"></td>
                    <td>${ex.name}</td>
                    <td>${ex.warmupSets ?? 1}</td>
                    <td>${ex.workSets ?? 2}</td>
                    <td>${repsDisplay}</td>
                    <td>${weightDisplay}${subtext}</td>
                    <td class="video-cell"></td>
                </tr>`;
        });

        container.style.display = 'none';
    });

    const totalShown = selector.querySelectorAll('.workout-nav-btn').length;
    if (totalShown >= 6) {
        selector.classList.add('multi-row');
        const perRow = Math.ceil(totalShown / 2);
        const pct = (100 / perRow).toFixed(2);
        selector.querySelectorAll('.workout-nav-btn').forEach(btn => {
            btn.style.flex = `1 1 calc(${pct}% - 6px)`;
            btn.style.maxWidth = `calc(${pct}% - 6px)`;
        });
    } else {
        selector.classList.remove('multi-row');
    }

    const todayDay = new Date().getDay();
    const todayLetter = Object.entries(CLIENT.workoutDays || {}).find(([, days]) => days.includes(todayDay))?.[0];
    showWorkout(todayLetter || firstLetter);
    initWorkoutsChecklist();
    initWorkoutTableWeights(targets);
    buildWorkoutAccordions(targets);
}

function showWeightUpdateToast() {
    const toast = document.createElement('div');
    toast.innerText = '✅ המשקל עודכן!';
    toast.style.cssText = `
        position: fixed;
        top: 24px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--accent);
        color: white;
        padding: 12px 24px;
        border-radius: 25px;
        font-size: 16px;
        font-weight: bold;
        z-index: 9999;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        animation: fadeIn 0.3s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function loadCoachingGoal() {
    const el = document.getElementById('coaching-goal-display');
    if (!el) return;
    const saved = localStorage.getItem('coaching_goal');
    const rawGoal = saved || CLIENT.coachingGoal || '';
    el.value = rawGoal.slice(0, 300);
    el.addEventListener('input', () => {
        if (el.value.length > 300) el.value = el.value.slice(0, 300);
        const val = el.value.trim();
        localStorage.setItem('coaching_goal', val);
        if (typeof syncCoachingGoalNow === 'function') syncCoachingGoalNow(val);
    });
}

function updateVacationBanner() {
    const banner = document.getElementById('vacation-banner');
    if (banner) banner.style.display = CLIENT.vacationMode ? 'block' : 'none';
}

function updateWorkoutStreak() {
    const today = new Date();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    let streak = parseInt(localStorage.getItem('workout_streak') || '0');
    const lastCompleted = localStorage.getItem('workout_completed_date');

    if (CLIENT.vacationMode) {
        const el = document.getElementById('workout-streak-count');
        if (el) el.innerText = streak + ' 🏖️';
        return;
    }

    if (!lastCompleted) {
        document.getElementById('workout-streak-count').innerText = streak;
        return;
    }

    const lastDate = new Date(lastCompleted);
    const lastMidnight = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate());
    const daysDiff = Math.floor((todayMidnight - lastMidnight) / (1000 * 60 * 60 * 24));

    if (daysDiff > 1) {
        streak = 0;
        localStorage.setItem('workout_streak', '0');
    }

    document.getElementById('workout-streak-count').innerText = streak;
}

function completeWorkoutStreak(letter) {
    if (CLIENT.vacationMode) return;
    const today = localDateStr();
    const todayDay = new Date().getDay();

    const scheduledDays = CLIENT.workoutDays?.[letter];
    if (!scheduledDays || !scheduledDays.includes(todayDay)) return;
    if (localStorage.getItem('workout_streak_incremented_date') === today) return;

    localStorage.setItem('workout_streak_incremented_date', today);
    let streak = parseInt(localStorage.getItem('workout_streak') || '0');
    streak++;
    localStorage.setItem('workout_streak', streak);
    document.getElementById('workout-streak-count').innerText = streak;
    if (typeof syncStreaksNow === 'function') syncStreaksNow();
    if (streak === 7 && typeof _showAchievementPopup === 'function') _showAchievementPopup('streak_7_workout');
    if (typeof checkAchievements === 'function') checkAchievements(CLIENT, null, null, null);

    // Mark workout as done in performance log so weekly score updates in real-time
    const uid = getActiveUserId();
    if (uid) {
        db.from('workout_performance_log').insert({
            client_id: uid,
            date: today,
            exercise_name: '__workout_done__',
            workout_letter: letter,
            weight_kg: 0,
            reps: 0
        }).then(() => {
            if (typeof _trackingWidgetCache !== 'undefined') delete _trackingWidgetCache['weekly_' + uid];
            if (typeof renderWeeklyScore === 'function') renderWeeklyScore(uid);
        }).catch(() => {});
    }
}

function checkNutritionStreak() {
    const proteinVal = userPortions.protein;
    const carbsVal = userPortions.carbs;
    const fatVal = userPortions.fat;
    
    const proteinTarget = parseFloat(document.getElementById('protein-target').innerText.replace('/ ', ''));
    const carbsTarget = parseFloat(document.getElementById('carbs-target').innerText.replace('/ ', ''));
    const fatTarget = parseFloat(document.getElementById('fat-target').innerText.replace('/ ', ''));
    
    if (proteinVal >= proteinTarget && carbsVal >= carbsTarget && fatVal >= fatTarget) {
        completeNutritionStreak();
    }
}

function completeNutritionStreak() {
    if (CLIENT.vacationMode) return;
    const today = localDateStr();
    if (localStorage.getItem('nutrition_completed_date') === today) return;

    localStorage.setItem('nutrition_completed_date', today);
    let streak = parseInt(localStorage.getItem('nutrition_streak') || '0');
    streak++;
    localStorage.setItem('nutrition_streak', streak);
    document.getElementById('nutrition-streak-count').innerText = streak;
    if (typeof syncStreaksNow === 'function') syncStreaksNow();
    if (streak === 7 && typeof _showAchievementPopup === 'function') _showAchievementPopup('streak_7_nutrition');
    if (typeof checkAchievements === 'function') checkAchievements(CLIENT, null, null, null);
    const uid = getActiveUserId();
    if (uid && typeof _trackingWidgetCache !== 'undefined') {
        delete _trackingWidgetCache['weekly_' + uid];
        if (typeof renderWeeklyScore === 'function') renderWeeklyScore(uid);
    }
    showNutritionComplete();
}

function showNutritionComplete() {
    const msg = document.getElementById('nutrition-complete-msg');
    if (!msg) return;
    msg.style.cssText = "display:flex; position:fixed; top:0; left:0; width:100vw; height:100vh; z-index:9999; align-items:center; justify-content:center;";
    msg.onclick = (e) => { if (e.target === msg) closeNutritionComplete(); };
}

function closeNutritionComplete() {
    const msg = document.getElementById('nutrition-complete-msg');
    if (msg) msg.style.display = 'none';
}

function updateNutritionStreak() {
    const today = new Date();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    let streak = parseInt(localStorage.getItem('nutrition_streak') || '0');
    const lastCompleted = localStorage.getItem('nutrition_completed_date');

    if (CLIENT.vacationMode) {
        const el = document.getElementById('nutrition-streak-count');
        if (el) el.innerText = streak + ' 🏖️';
        return;
    }

    if (!lastCompleted) {
        document.getElementById('nutrition-streak-count').innerText = streak;
        return;
    }

    const lastDate = new Date(lastCompleted);
    const lastMidnight = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate());
    const daysDiff = Math.floor((todayMidnight - lastMidnight) / (1000 * 60 * 60 * 24));

    if (daysDiff > 1) {
        streak = 0;
        localStorage.setItem('nutrition_streak', '0');
    }

    document.getElementById('nutrition-streak-count').innerText = streak;
}

function openWeightChartModal() {
    const modal = document.getElementById('weight-chart-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    setTimeout(renderWeightChart, 50);
}

function closeWeightChartModal() {
    const modal = document.getElementById('weight-chart-modal');
    if (modal) modal.style.display = 'none';
}

function renderWeightChart() {
    const canvas = document.getElementById('weight-chart');
    if (!canvas) return;
    if (!CLIENT.startDate || isNaN(new Date(CLIENT.startDate).getTime())) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 220 * dpr;
    canvas.style.height = '220px';
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = 220;
    const pad = { top: 24, right: 16, bottom: 44, left: 42 };

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const colors = {
        grid: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)',
        label: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.5)',
        goalLine: isDark ? '#f59e0b' : '#d97706',
        goalLabel: isDark ? '#fbbf24' : '#b45309',
        line: '#3b82f6',
        lineGlow: isDark ? 'rgba(59,130,246,0.3)' : 'rgba(59,130,246,0.2)',
        gradTop: isDark ? 'rgba(59,130,246,0.25)' : 'rgba(59,130,246,0.15)',
        gradBot: isDark ? 'rgba(59,130,246,0)' : 'rgba(59,130,246,0)',
        dot: '#3b82f6',
        dotRing: isDark ? '#1a1e30' : '#ffffff',
        empty: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.4)',
    };

    const startDate = new Date(CLIENT.startDate);
    const endDate = new Date(CLIENT.startDate);
    endDate.setMonth(endDate.getMonth() + 6);

    const history = JSON.parse(sessionStorage.getItem('weight_history') || '[]')
        .filter(p => p.date && !isNaN(new Date(p.date).getTime()));
    const allWeights = [CLIENT.startWeight, CLIENT.goalWeight, ...history.map(p => p.weight)];
    const dataMin = Math.min(...allWeights);
    const dataMax = Math.max(...allWeights);
    const yRange = Math.max(dataMax - dataMin, 10);
    const minY = Math.floor(dataMin - yRange * 0.25);
    const maxY = Math.ceil(dataMax + yRange * 0.25);

    const toX = (dateStr) => {
        const d = new Date(dateStr);
        return pad.left + ((d - startDate) / (endDate - startDate)) * (W - pad.left - pad.right);
    };
    const toY = (weight) => {
        return pad.top + (1 - (weight - minY) / (maxY - minY)) * (H - pad.top - pad.bottom);
    };

    ctx.clearRect(0, 0, W, H);
    if (isDark) {
        ctx.fillStyle = '#1e2235';
        ctx.beginPath();
        ctx.roundRect(0, 0, W, H, 12);
        ctx.fill();
    }

    const step = yRange <= 15 ? 2 : yRange <= 30 ? 5 : 10;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let w = Math.ceil(minY / step) * step; w <= maxY; w += step) {
        const y = toY(w);
        ctx.strokeStyle = colors.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(W - pad.right, y);
        ctx.stroke();
        ctx.fillStyle = colors.label;
        ctx.font = '500 11px Heebo';
        ctx.fillText(w + '', pad.left - 8, y);
    }

    const goalY = toY(CLIENT.goalWeight);
    ctx.save();
    ctx.strokeStyle = colors.goalLine;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.left, goalY);
    ctx.lineTo(W - pad.right, goalY);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = colors.goalLabel;
    ctx.font = '600 10px Heebo';
    ctx.textAlign = 'left';
    ctx.fillText('יעד ' + CLIENT.goalWeight, pad.left + 4, goalY - 8);

    const months = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];
    ctx.fillStyle = colors.label;
    ctx.font = '500 11px Heebo';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= 6; i++) {
        const d = new Date(CLIENT.startDate);
        if (!CLIENT.startDate || isNaN(d.getTime())) return;
        d.setMonth(d.getMonth() + i);
        d.setDate(1);
        const x = toX(d.toISOString().split('T')[0]);
        ctx.fillText(months[d.getMonth()], x, H - 30);
    }

    if (history.length === 0) {
        ctx.font = '500 14px Heebo';
        ctx.fillStyle = colors.empty;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('עדכן משקל נוכחי כדי לראות התקדמות', W / 2, H / 2);
        return;
    }

    const sorted = [...history].sort((a, b) => new Date(a.date) - new Date(b.date));
    const points = sorted.map(p => ({ x: toX(p.date), y: toY(p.weight) }));

    if (points.length > 1) {
        const grad = ctx.createLinearGradient(0, pad.top, 0, H - pad.bottom);
        grad.addColorStop(0, colors.gradTop);
        grad.addColorStop(1, colors.gradBot);
        ctx.beginPath();
        ctx.moveTo(points[0].x, H - pad.bottom);
        points.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.lineTo(points[points.length - 1].x, H - pad.bottom);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
    }

    if (points.length > 1) {
        ctx.save();
        ctx.strokeStyle = colors.lineGlow;
        ctx.lineWidth = 6;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.stroke();
        ctx.restore();
    }

    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();

    points.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = colors.dotRing;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = colors.dot;
        ctx.fill();
        if (i === points.length - 1) {
            ctx.fillStyle = colors.label;
            ctx.font = '600 11px Heebo';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(sorted[i].weight + '', p.x, p.y - 10);
        }
    });
}

// ─── Food Scanner ───────────────────────────────────────────────
const USDA_TABLE = [
  {
    "name": "חזה עוף ללא עור",
    "name_en": "Chicken breast, skinless",
    "protein": 31.0,
    "fat": 3.6,
    "carbs": 0.0
  },
  {
    "name": "חזה עוף עם עור",
    "name_en": "Chicken breast, with skin",
    "protein": 25.9,
    "fat": 7.8,
    "carbs": 0.0
  },
  {
    "name": "שוק עוף ללא עור",
    "name_en": "Chicken thigh, skinless",
    "protein": 24.3,
    "fat": 8.6,
    "carbs": 0.0
  },
  {
    "name": "שוק עוף עם עור",
    "name_en": "Chicken thigh, with skin",
    "protein": 21.9,
    "fat": 13.3,
    "carbs": 0.0
  },
  {
    "name": "כנף עוף עם עור",
    "name_en": "Chicken wing, with skin",
    "protein": 20.7,
    "fat": 16.8,
    "carbs": 0.0
  },
  {
    "name": "כנף עוף ללא עור",
    "name_en": "Chicken wing, skinless",
    "protein": 23.0,
    "fat": 6.6,
    "carbs": 0.0
  },
  {
    "name": "עוף טחון",
    "name_en": "Ground chicken",
    "protein": 17.5,
    "fat": 8.1,
    "carbs": 0.0
  },
  {
    "name": "עוף שלם עם עור",
    "name_en": "Whole chicken, with skin",
    "protein": 18.6,
    "fat": 15.1,
    "carbs": 0.0
  },
  {
    "name": "כבד עוף",
    "name_en": "Chicken liver",
    "protein": 16.9,
    "fat": 4.8,
    "carbs": 0.9
  },
  {
    "name": "לב עוף",
    "name_en": "Chicken heart",
    "protein": 15.6,
    "fat": 9.3,
    "carbs": 0.1
  },
  {
    "name": "קורקבן עוף",
    "name_en": "Chicken gizzard",
    "protein": 17.7,
    "fat": 2.1,
    "carbs": 0.0
  },
  {
    "name": "פרגית ללא עור",
    "name_en": "Chicken leg quarter, skinless",
    "protein": 24.0,
    "fat": 5.7,
    "carbs": 0.0
  },
  {
    "name": "שניצל עוף",
    "name_en": "Chicken schnitzel",
    "protein": 20.5,
    "fat": 10.2,
    "carbs": 9.8
  },
  {
    "name": "נגטס עוף",
    "name_en": "Chicken nuggets",
    "protein": 14.2,
    "fat": 14.0,
    "carbs": 17.0
  },
  {
    "name": "הודו חזה ללא עור",
    "name_en": "Turkey breast, skinless",
    "protein": 29.9,
    "fat": 1.0,
    "carbs": 0.0
  },
  {
    "name": "הודו טחון",
    "name_en": "Ground turkey",
    "protein": 19.7,
    "fat": 6.9,
    "carbs": 0.0
  },
  {
    "name": "שוק הודו",
    "name_en": "Turkey leg",
    "protein": 23.0,
    "fat": 8.0,
    "carbs": 0.0
  },
  {
    "name": "נקניק הודו",
    "name_en": "Turkey sausage",
    "protein": 14.3,
    "fat": 6.3,
    "carbs": 2.1
  },
  {
    "name": "פילה בקר",
    "name_en": "Beef tenderloin",
    "protein": 22.1,
    "fat": 10.6,
    "carbs": 0.0
  },
  {
    "name": "אנטריקוט בקר",
    "name_en": "Ribeye steak",
    "protein": 19.8,
    "fat": 18.9,
    "carbs": 0.0
  },
  {
    "name": "סינטה בקר",
    "name_en": "Sirloin steak",
    "protein": 21.7,
    "fat": 8.9,
    "carbs": 0.0
  },
  {
    "name": "בקר טחון 5%",
    "name_en": "Ground beef, 5% fat",
    "protein": 22.0,
    "fat": 5.0,
    "carbs": 0.0
  },
  {
    "name": "בקר טחון 15%",
    "name_en": "Ground beef, 15% fat",
    "protein": 18.2,
    "fat": 15.0,
    "carbs": 0.0
  },
  {
    "name": "בקר טחון 20%",
    "name_en": "Ground beef, 20% fat",
    "protein": 17.2,
    "fat": 20.0,
    "carbs": 0.0
  },
  {
    "name": "כבד בקר",
    "name_en": "Beef liver",
    "protein": 20.4,
    "fat": 3.6,
    "carbs": 5.1
  },
  {
    "name": "שפונדרה בקר",
    "name_en": "Beef brisket",
    "protein": 18.0,
    "fat": 17.4,
    "carbs": 0.0
  },
  {
    "name": "צלעות בקר",
    "name_en": "Beef ribs",
    "protein": 18.8,
    "fat": 19.7,
    "carbs": 0.0
  },
  {
    "name": "פלדה בקר",
    "name_en": "Beef chuck",
    "protein": 20.6,
    "fat": 12.0,
    "carbs": 0.0
  },
  {
    "name": "שייטל בקר",
    "name_en": "Beef top round",
    "protein": 23.0,
    "fat": 4.5,
    "carbs": 0.0
  },
  {
    "name": "קישקע בקר",
    "name_en": "Beef tripe",
    "protein": 12.1,
    "fat": 3.7,
    "carbs": 0.0
  },
  {
    "name": "קציצות בקר",
    "name_en": "Beef meatballs",
    "protein": 15.2,
    "fat": 11.6,
    "carbs": 8.4
  },
  {
    "name": "המבורגר בקר",
    "name_en": "Beef hamburger patty",
    "protein": 17.0,
    "fat": 15.0,
    "carbs": 0.0
  },
  {
    "name": "לשון בקר",
    "name_en": "Beef tongue",
    "protein": 16.4,
    "fat": 15.6,
    "carbs": 0.4
  },
  {
    "name": "חזיר כתף (לא כשר)",
    "name_en": "Pork shoulder",
    "protein": 17.1,
    "fat": 14.0,
    "carbs": 0.0
  },
  {
    "name": "כבש ירך",
    "name_en": "Lamb leg",
    "protein": 22.0,
    "fat": 9.5,
    "carbs": 0.0
  },
  {
    "name": "כבש כתף",
    "name_en": "Lamb shoulder",
    "protein": 18.3,
    "fat": 14.8,
    "carbs": 0.0
  },
  {
    "name": "טלה טחון",
    "name_en": "Ground lamb",
    "protein": 16.6,
    "fat": 19.7,
    "carbs": 0.0
  },
  {
    "name": "כבש צלעות",
    "name_en": "Lamb chops",
    "protein": 21.8,
    "fat": 14.2,
    "carbs": 0.0
  },
  {
    "name": "עגל",
    "name_en": "Veal cutlet",
    "protein": 19.9,
    "fat": 5.8,
    "carbs": 0.0
  },
  {
    "name": "נקניקייה בקר",
    "name_en": "Beef hot dog",
    "protein": 11.2,
    "fat": 19.0,
    "carbs": 2.0
  },
  {
    "name": "נקניקייה הודו/עוף",
    "name_en": "Turkey/chicken hot dog",
    "protein": 11.0,
    "fat": 8.0,
    "carbs": 3.5
  },
  {
    "name": "בולונה",
    "name_en": "Bologna",
    "protein": 10.8,
    "fat": 17.5,
    "carbs": 4.3
  },
  {
    "name": "סלמי",
    "name_en": "Salami",
    "protein": 22.6,
    "fat": 25.4,
    "carbs": 1.2
  },
  {
    "name": "פסטרמה",
    "name_en": "Pastrami",
    "protein": 17.9,
    "fat": 8.9,
    "carbs": 0.5
  },
  {
    "name": "שוורמה עוף",
    "name_en": "Chicken shawarma",
    "protein": 19.5,
    "fat": 9.0,
    "carbs": 3.5
  },
  {
    "name": "שוורמה טלה",
    "name_en": "Lamb shawarma",
    "protein": 17.0,
    "fat": 12.0,
    "carbs": 3.0
  },
  {
    "name": "קבב מעורב",
    "name_en": "Mixed kebab",
    "protein": 16.5,
    "fat": 14.0,
    "carbs": 3.5
  },
  {
    "name": "סלמון פילה",
    "name_en": "Atlantic salmon, fillet",
    "protein": 20.4,
    "fat": 13.4,
    "carbs": 0.0
  },
  {
    "name": "טונה בשמן",
    "name_en": "Tuna, canned in oil",
    "protein": 25.5,
    "fat": 8.1,
    "carbs": 0.0
  },
  {
    "name": "טונה במים",
    "name_en": "Tuna, canned in water",
    "protein": 25.5,
    "fat": 1.0,
    "carbs": 0.0
  },
  {
    "name": "טונה טרייה",
    "name_en": "Tuna, fresh",
    "protein": 23.3,
    "fat": 4.9,
    "carbs": 0.0
  },
  {
    "name": "בס ים",
    "name_en": "Sea bass",
    "protein": 18.4,
    "fat": 2.0,
    "carbs": 0.0
  },
  {
    "name": "דניס",
    "name_en": "Sea bream (Dorade)",
    "protein": 18.0,
    "fat": 4.5,
    "carbs": 0.0
  },
  {
    "name": "לוקוס",
    "name_en": "Grouper",
    "protein": 19.4,
    "fat": 1.0,
    "carbs": 0.0
  },
  {
    "name": "פורל",
    "name_en": "Rainbow trout",
    "protein": 20.1,
    "fat": 5.8,
    "carbs": 0.0
  },
  {
    "name": "בורי",
    "name_en": "Mullet",
    "protein": 19.0,
    "fat": 4.7,
    "carbs": 0.0
  },
  {
    "name": "מוסר ים",
    "name_en": "European sea bass",
    "protein": 17.5,
    "fat": 3.7,
    "carbs": 0.0
  },
  {
    "name": "קרפיון",
    "name_en": "Carp",
    "protein": 17.8,
    "fat": 5.6,
    "carbs": 0.0
  },
  {
    "name": "הליבוט",
    "name_en": "Halibut",
    "protein": 22.5,
    "fat": 2.9,
    "carbs": 0.0
  },
  {
    "name": "קוד (בקלה)",
    "name_en": "Cod",
    "protein": 17.8,
    "fat": 0.7,
    "carbs": 0.0
  },
  {
    "name": "טיילפיה",
    "name_en": "Tilapia",
    "protein": 20.1,
    "fat": 2.7,
    "carbs": 0.0
  },
  {
    "name": "אמנון",
    "name_en": "Tilapia (St. Peter's fish)",
    "protein": 20.1,
    "fat": 2.7,
    "carbs": 0.0
  },
  {
    "name": "סרדינים בשמן",
    "name_en": "Sardines, canned in oil",
    "protein": 24.6,
    "fat": 11.5,
    "carbs": 0.0
  },
  {
    "name": "מקרל",
    "name_en": "Mackerel",
    "protein": 18.6,
    "fat": 13.9,
    "carbs": 0.0
  },
  {
    "name": "הרינג",
    "name_en": "Herring",
    "protein": 17.7,
    "fat": 13.2,
    "carbs": 0.0
  },
  {
    "name": "אנשובי",
    "name_en": "Anchovies",
    "protein": 28.9,
    "fat": 9.7,
    "carbs": 0.0
  },
  {
    "name": "שרימפס",
    "name_en": "Shrimp",
    "protein": 20.1,
    "fat": 1.7,
    "carbs": 0.9
  },
  {
    "name": "קלמרי",
    "name_en": "Squid",
    "protein": 15.6,
    "fat": 1.4,
    "carbs": 3.1
  },
  {
    "name": "תמנון",
    "name_en": "Octopus",
    "protein": 14.9,
    "fat": 1.0,
    "carbs": 2.2
  },
  {
    "name": "סרטן",
    "name_en": "Crab",
    "protein": 18.1,
    "fat": 1.1,
    "carbs": 0.0
  },
  {
    "name": "צדפות",
    "name_en": "Oysters",
    "protein": 7.0,
    "fat": 2.5,
    "carbs": 4.7
  },
  {
    "name": "לוקס (סלמון מעושן)",
    "name_en": "Smoked salmon (lox)",
    "protein": 18.3,
    "fat": 4.3,
    "carbs": 0.0
  },
  {
    "name": "ביצה שלמה גדולה",
    "name_en": "Whole egg, large",
    "protein": 12.6,
    "fat": 9.5,
    "carbs": 0.7
  },
  {
    "name": "חלבון ביצה",
    "name_en": "Egg white",
    "protein": 10.9,
    "fat": 0.2,
    "carbs": 0.7
  },
  {
    "name": "חלמון ביצה",
    "name_en": "Egg yolk",
    "protein": 15.9,
    "fat": 26.5,
    "carbs": 1.8
  },
  {
    "name": "חלב פרה 3%",
    "name_en": "Whole milk, 3%",
    "protein": 3.2,
    "fat": 3.3,
    "carbs": 4.8
  },
  {
    "name": "חלב 1%",
    "name_en": "Low-fat milk, 1%",
    "protein": 3.4,
    "fat": 1.0,
    "carbs": 5.0
  },
  {
    "name": "חלב עיזים",
    "name_en": "Goat milk",
    "protein": 3.6,
    "fat": 4.1,
    "carbs": 4.5
  },
  {
    "name": "שוקו 1%",
    "name_en": "Chocolate milk, 1%",
    "protein": 3.4,
    "fat": 1.0,
    "carbs": 11.5
  },
  {
    "name": "שוקו 3%",
    "name_en": "Chocolate milk, 3%",
    "protein": 3.2,
    "fat": 3.3,
    "carbs": 11.2
  },
  {
    "name": "יוגורט רגיל 3%",
    "name_en": "Plain yogurt, 3%",
    "protein": 3.5,
    "fat": 3.3,
    "carbs": 4.7
  },
  {
    "name": "יוגורט דל שומן 1.5%",
    "name_en": "Low-fat yogurt, 1.5%",
    "protein": 5.0,
    "fat": 1.5,
    "carbs": 7.0
  },
  {
    "name": "יוגורט יווני 0%",
    "name_en": "Greek yogurt, 0% fat",
    "protein": 10.2,
    "fat": 0.7,
    "carbs": 3.6
  },
  {
    "name": "יוגורט יווני 2%",
    "name_en": "Greek yogurt, 2% fat",
    "protein": 9.9,
    "fat": 2.0,
    "carbs": 3.6
  },
  {
    "name": "קוטג' 1%",
    "name_en": "Cottage cheese, 1%",
    "protein": 12.4,
    "fat": 1.0,
    "carbs": 3.4
  },
  {
    "name": "קוטג' 5%",
    "name_en": "Cottage cheese, 5%",
    "protein": 11.1,
    "fat": 4.3,
    "carbs": 3.4
  },
  {
    "name": "גבינה לבנה 5%",
    "name_en": "Israeli white cheese (Gvina Levana), 5%",
    "protein": 7.5,
    "fat": 5.0,
    "carbs": 3.5
  },
  {
    "name": "גבינה לבנה 9%",
    "name_en": "Israeli white cheese, 9%",
    "protein": 7.2,
    "fat": 9.0,
    "carbs": 3.2
  },
  {
    "name": "גבינה צהובה 28%",
    "name_en": "Yellow cheese, 28%",
    "protein": 24.0,
    "fat": 28.0,
    "carbs": 1.3
  },
  {
    "name": "גבינה צהובה 9%",
    "name_en": "Yellow cheese, light 9%",
    "protein": 26.0,
    "fat": 9.0,
    "carbs": 2.0
  },
  {
    "name": "גבינת פטה",
    "name_en": "Feta cheese",
    "protein": 14.2,
    "fat": 21.3,
    "carbs": 4.1
  },
  {
    "name": "גבינת עיזים",
    "name_en": "Goat cheese",
    "protein": 21.6,
    "fat": 29.8,
    "carbs": 0.1
  },
  {
    "name": "גבינת בולגרית",
    "name_en": "Bulgarian white cheese (brine cheese)",
    "protein": 13.5,
    "fat": 20.0,
    "carbs": 1.5
  },
  {
    "name": "גבינת מוצרלה",
    "name_en": "Mozzarella",
    "protein": 22.2,
    "fat": 17.1,
    "carbs": 2.2
  },
  {
    "name": "גבינת פרמזן",
    "name_en": "Parmesan",
    "protein": 35.8,
    "fat": 25.8,
    "carbs": 3.2
  },
  {
    "name": "לבן 1%",
    "name_en": "Laban, 1% fat",
    "protein": 3.5,
    "fat": 1.0,
    "carbs": 5.0
  },
  {
    "name": "לבן 3%",
    "name_en": "Laban, 3% fat",
    "protein": 3.3,
    "fat": 3.0,
    "carbs": 4.7
  },
  {
    "name": "שמנת חמוצה 15%",
    "name_en": "Sour cream, 15%",
    "protein": 2.1,
    "fat": 14.6,
    "carbs": 3.6
  },
  {
    "name": "שמנת חמוצה 27%",
    "name_en": "Sour cream, 27%",
    "protein": 1.9,
    "fat": 27.0,
    "carbs": 3.0
  },
  {
    "name": "שמנת להקצפה 38%",
    "name_en": "Heavy whipping cream, 38%",
    "protein": 2.1,
    "fat": 37.0,
    "carbs": 3.0
  },
  {
    "name": "חמאה",
    "name_en": "Butter",
    "protein": 0.9,
    "fat": 81.1,
    "carbs": 0.1
  },
  {
    "name": "גבינת ריקוטה",
    "name_en": "Ricotta cheese",
    "protein": 11.3,
    "fat": 10.3,
    "carbs": 3.0
  },
  {
    "name": "שמנת בישול 15%",
    "name_en": "Cooking cream, 15%",
    "protein": 2.4,
    "fat": 15.0,
    "carbs": 3.6
  },
  {
    "name": "גלידת וניל",
    "name_en": "Vanilla ice cream",
    "protein": 3.5,
    "fat": 7.3,
    "carbs": 24.0
  },
  {
    "name": "עדשים כתומות מבושלות",
    "name_en": "Red lentils, cooked",
    "protein": 9.0,
    "fat": 0.4,
    "carbs": 20.1
  },
  {
    "name": "עדשים ירוקות מבושלות",
    "name_en": "Green lentils, cooked",
    "protein": 9.0,
    "fat": 0.4,
    "carbs": 19.5
  },
  {
    "name": "עדשים שחורות מבושלות",
    "name_en": "Black lentils, cooked",
    "protein": 9.0,
    "fat": 0.4,
    "carbs": 20.1
  },
  {
    "name": "חומוס מבושל",
    "name_en": "Chickpeas, cooked",
    "protein": 8.9,
    "fat": 2.6,
    "carbs": 27.4
  },
  {
    "name": "שעועית שחורה מבושלת",
    "name_en": "Black beans, cooked",
    "protein": 8.9,
    "fat": 0.5,
    "carbs": 23.7
  },
  {
    "name": "שעועית לבנה מבושלת",
    "name_en": "White beans, cooked",
    "protein": 9.7,
    "fat": 0.4,
    "carbs": 22.8
  },
  {
    "name": "שעועית אדומה מבושלת",
    "name_en": "Kidney beans, cooked",
    "protein": 8.7,
    "fat": 0.5,
    "carbs": 22.8
  },
  {
    "name": "פול מבושל",
    "name_en": "Fava beans, cooked",
    "protein": 7.6,
    "fat": 0.4,
    "carbs": 19.7
  },
  {
    "name": "אפונה ירוקה מבושלת",
    "name_en": "Green peas, cooked",
    "protein": 5.4,
    "fat": 0.4,
    "carbs": 15.6
  },
  {
    "name": "סויה מבושלת",
    "name_en": "Soybeans, cooked",
    "protein": 16.6,
    "fat": 9.0,
    "carbs": 9.9
  },
  {
    "name": "טופו מוצק",
    "name_en": "Tofu, firm",
    "protein": 8.2,
    "fat": 4.8,
    "carbs": 1.9
  },
  {
    "name": "טופו רך",
    "name_en": "Tofu, soft/silken",
    "protein": 5.3,
    "fat": 2.7,
    "carbs": 1.5
  },
  {
    "name": "אדמאמה",
    "name_en": "Edamame, shelled",
    "protein": 11.9,
    "fat": 5.2,
    "carbs": 8.9
  },
  {
    "name": "חומוס מוכן (ממרח)",
    "name_en": "Hummus, prepared",
    "protein": 7.9,
    "fat": 9.6,
    "carbs": 14.3
  },
  {
    "name": "פול מדמס",
    "name_en": "Foul medames",
    "protein": 6.0,
    "fat": 2.5,
    "carbs": 17.5
  },
  {
    "name": "אורז לבן מבושל",
    "name_en": "White rice, cooked",
    "protein": 2.7,
    "fat": 0.3,
    "carbs": 28.2
  },
  {
    "name": "אורז מלא מבושל",
    "name_en": "Brown rice, cooked",
    "protein": 2.6,
    "fat": 0.9,
    "carbs": 23.0
  },
  {
    "name": "אורז בסמטי מבושל",
    "name_en": "Basmati rice, cooked",
    "protein": 2.7,
    "fat": 0.3,
    "carbs": 28.0
  },
  {
    "name": "פסטה מבושלת",
    "name_en": "Pasta, cooked",
    "protein": 5.1,
    "fat": 1.1,
    "carbs": 30.9
  },
  {
    "name": "פסטה מלאה מבושלת",
    "name_en": "Whole wheat pasta, cooked",
    "protein": 5.5,
    "fat": 0.9,
    "carbs": 27.0
  },
  {
    "name": "קוסקוס מבושל",
    "name_en": "Couscous, cooked",
    "protein": 3.8,
    "fat": 0.2,
    "carbs": 23.2
  },
  {
    "name": "בולגור מבושל",
    "name_en": "Bulgur, cooked",
    "protein": 3.1,
    "fat": 0.2,
    "carbs": 18.6
  },
  {
    "name": "קינואה מבושלת",
    "name_en": "Quinoa, cooked",
    "protein": 4.4,
    "fat": 1.9,
    "carbs": 21.3
  },
  {
    "name": "שעורה מבושלת",
    "name_en": "Barley, cooked",
    "protein": 2.3,
    "fat": 0.4,
    "carbs": 28.2
  },
  {
    "name": "שיבולת שועל (גלגלת)",
    "name_en": "Rolled oats, dry",
    "protein": 13.2,
    "fat": 6.5,
    "carbs": 67.0
  },
  {
    "name": "דייסת שיבולת שועל מבושלת",
    "name_en": "Oatmeal, cooked",
    "protein": 2.5,
    "fat": 1.5,
    "carbs": 12.0
  },
  {
    "name": "לחם לבן",
    "name_en": "White bread",
    "protein": 8.0,
    "fat": 3.3,
    "carbs": 49.0
  },
  {
    "name": "לחם מלא",
    "name_en": "Whole wheat bread",
    "protein": 9.0,
    "fat": 3.5,
    "carbs": 41.3
  },
  {
    "name": "לחם שיפון",
    "name_en": "Rye bread",
    "protein": 8.5,
    "fat": 3.3,
    "carbs": 48.3
  },
  {
    "name": "פיתה לבנה",
    "name_en": "Pita bread, white",
    "protein": 9.1,
    "fat": 1.2,
    "carbs": 55.7
  },
  {
    "name": "פיתה מלאה",
    "name_en": "Pita bread, whole wheat",
    "protein": 9.5,
    "fat": 1.5,
    "carbs": 48.0
  },
  {
    "name": "לאפה",
    "name_en": "Laffa (Iraqi flatbread)",
    "protein": 7.5,
    "fat": 1.5,
    "carbs": 52.0
  },
  {
    "name": "חלה",
    "name_en": "Challah bread",
    "protein": 8.4,
    "fat": 5.8,
    "carbs": 47.5
  },
  {
    "name": "בגט",
    "name_en": "Baguette",
    "protein": 9.0,
    "fat": 1.5,
    "carbs": 55.0
  },
  {
    "name": "לחמניה",
    "name_en": "Dinner roll",
    "protein": 8.0,
    "fat": 3.0,
    "carbs": 50.0
  },
  {
    "name": "טורטייה קמח",
    "name_en": "Flour tortilla",
    "protein": 7.3,
    "fat": 7.3,
    "carbs": 49.1
  },
  {
    "name": "טורטייה תירס",
    "name_en": "Corn tortilla",
    "protein": 5.7,
    "fat": 2.5,
    "carbs": 44.6
  },
  {
    "name": "מצה",
    "name_en": "Matzah (unleavened bread)",
    "protein": 10.5,
    "fat": 1.3,
    "carbs": 81.0
  },
  {
    "name": "קמח חיטה לבן",
    "name_en": "All-purpose flour",
    "protein": 10.3,
    "fat": 1.0,
    "carbs": 76.3
  },
  {
    "name": "קמח מלא",
    "name_en": "Whole wheat flour",
    "protein": 13.2,
    "fat": 2.5,
    "carbs": 71.0
  },
  {
    "name": "תירס מבושל",
    "name_en": "Corn, cooked",
    "protein": 3.4,
    "fat": 1.5,
    "carbs": 21.0
  },
  {
    "name": "לחם קינואה מלא",
    "name_en": "Quinoa whole grain bread",
    "protein": 10.0,
    "fat": 4.5,
    "carbs": 39.0
  },
  {
    "name": "גרנולה",
    "name_en": "Granola",
    "protein": 8.0,
    "fat": 14.0,
    "carbs": 58.0
  },
  {
    "name": "קורנפלקס",
    "name_en": "Corn flakes cereal",
    "protein": 7.5,
    "fat": 0.4,
    "carbs": 84.0
  },
  {
    "name": "חיטה תפוחה (פאפד וויט)",
    "name_en": "Puffed wheat cereal",
    "protein": 15.0,
    "fat": 1.0,
    "carbs": 76.0
  },
  {
    "name": "עגבנייה",
    "name_en": "Tomato",
    "protein": 0.9,
    "fat": 0.2,
    "carbs": 3.9
  },
  {
    "name": "מלפפון",
    "name_en": "Cucumber",
    "protein": 0.7,
    "fat": 0.1,
    "carbs": 3.6
  },
  {
    "name": "פלפל אדום",
    "name_en": "Red bell pepper",
    "protein": 1.0,
    "fat": 0.3,
    "carbs": 6.0
  },
  {
    "name": "פלפל ירוק",
    "name_en": "Green bell pepper",
    "protein": 0.9,
    "fat": 0.2,
    "carbs": 4.6
  },
  {
    "name": "פלפל צהוב",
    "name_en": "Yellow bell pepper",
    "protein": 1.0,
    "fat": 0.2,
    "carbs": 6.3
  },
  {
    "name": "גזר",
    "name_en": "Carrot",
    "protein": 0.9,
    "fat": 0.2,
    "carbs": 9.6
  },
  {
    "name": "חציל",
    "name_en": "Eggplant",
    "protein": 1.0,
    "fat": 0.2,
    "carbs": 5.9
  },
  {
    "name": "קישוא",
    "name_en": "Zucchini",
    "protein": 1.2,
    "fat": 0.3,
    "carbs": 3.1
  },
  {
    "name": "בצל",
    "name_en": "Onion",
    "protein": 1.1,
    "fat": 0.1,
    "carbs": 9.3
  },
  {
    "name": "בצל ירוק",
    "name_en": "Green onion (scallion)",
    "protein": 1.8,
    "fat": 0.2,
    "carbs": 7.3
  },
  {
    "name": "שום",
    "name_en": "Garlic",
    "protein": 6.4,
    "fat": 0.5,
    "carbs": 33.1
  },
  {
    "name": "ברוקולי",
    "name_en": "Broccoli",
    "protein": 2.8,
    "fat": 0.4,
    "carbs": 6.6
  },
  {
    "name": "כרובית",
    "name_en": "Cauliflower",
    "protein": 1.9,
    "fat": 0.3,
    "carbs": 5.0
  },
  {
    "name": "כרוב לבן",
    "name_en": "White cabbage",
    "protein": 1.3,
    "fat": 0.1,
    "carbs": 5.8
  },
  {
    "name": "כרוב סגול",
    "name_en": "Purple cabbage",
    "protein": 1.4,
    "fat": 0.2,
    "carbs": 7.4
  },
  {
    "name": "חסה iceבוגר",
    "name_en": "Iceberg lettuce",
    "protein": 0.9,
    "fat": 0.1,
    "carbs": 3.0
  },
  {
    "name": "חסה רומית",
    "name_en": "Romaine lettuce",
    "protein": 1.2,
    "fat": 0.3,
    "carbs": 3.3
  },
  {
    "name": "תרד",
    "name_en": "Spinach",
    "protein": 2.9,
    "fat": 0.4,
    "carbs": 3.6
  },
  {
    "name": "עלי רוקט",
    "name_en": "Arugula",
    "protein": 2.6,
    "fat": 0.7,
    "carbs": 3.7
  },
  {
    "name": "כרוב ניצנים",
    "name_en": "Brussels sprouts",
    "protein": 3.4,
    "fat": 0.3,
    "carbs": 8.9
  },
  {
    "name": "אספרגוס",
    "name_en": "Asparagus",
    "protein": 2.2,
    "fat": 0.1,
    "carbs": 3.9
  },
  {
    "name": "סלרי",
    "name_en": "Celery",
    "protein": 0.7,
    "fat": 0.2,
    "carbs": 3.0
  },
  {
    "name": "פטרוזיליה",
    "name_en": "Parsley",
    "protein": 3.0,
    "fat": 0.8,
    "carbs": 6.3
  },
  {
    "name": "כוסברה",
    "name_en": "Cilantro",
    "protein": 2.1,
    "fat": 0.5,
    "carbs": 3.7
  },
  {
    "name": "נענע",
    "name_en": "Fresh mint",
    "protein": 3.3,
    "fat": 0.7,
    "carbs": 8.4
  },
  {
    "name": "בזיל",
    "name_en": "Fresh basil",
    "protein": 3.2,
    "fat": 0.6,
    "carbs": 2.7
  },
  {
    "name": "אבוקדו",
    "name_en": "Avocado",
    "protein": 2.0,
    "fat": 15.0,
    "carbs": 8.5
  },
  {
    "name": "ארטישוק",
    "name_en": "Artichoke",
    "protein": 3.3,
    "fat": 0.2,
    "carbs": 10.5
  },
  {
    "name": "סלק",
    "name_en": "Beet",
    "protein": 1.6,
    "fat": 0.2,
    "carbs": 9.6
  },
  {
    "name": "דלעת",
    "name_en": "Pumpkin",
    "protein": 1.0,
    "fat": 0.1,
    "carbs": 6.5
  },
  {
    "name": "דלורית",
    "name_en": "Butternut squash",
    "protein": 1.0,
    "fat": 0.1,
    "carbs": 11.7
  },
  {
    "name": "בטטה",
    "name_en": "Sweet potato",
    "protein": 1.6,
    "fat": 0.1,
    "carbs": 20.1
  },
  {
    "name": "תפוח אדמה",
    "name_en": "Potato",
    "protein": 2.0,
    "fat": 0.1,
    "carbs": 17.5
  },
  {
    "name": "תפוח אדמה אפוי",
    "name_en": "Baked potato",
    "protein": 2.5,
    "fat": 0.1,
    "carbs": 21.0
  },
  {
    "name": "צ'יפס",
    "name_en": "French fries",
    "protein": 3.4,
    "fat": 12.7,
    "carbs": 35.7
  },
  {
    "name": "פטריות שמפיניון",
    "name_en": "Mushrooms, button",
    "protein": 3.1,
    "fat": 0.3,
    "carbs": 3.3
  },
  {
    "name": "פטריות שיטאקי",
    "name_en": "Shiitake mushrooms",
    "protein": 2.2,
    "fat": 0.5,
    "carbs": 6.8
  },
  {
    "name": "תירס בגרגרים",
    "name_en": "Corn kernels",
    "protein": 3.4,
    "fat": 1.5,
    "carbs": 21.0
  },
  {
    "name": "פלפל חריף",
    "name_en": "Chili pepper",
    "protein": 2.0,
    "fat": 0.4,
    "carbs": 9.0
  },
  {
    "name": "כרישה",
    "name_en": "Leek",
    "protein": 1.5,
    "fat": 0.3,
    "carbs": 14.2
  },
  {
    "name": "עגבנייה שרי",
    "name_en": "Cherry tomatoes",
    "protein": 1.0,
    "fat": 0.2,
    "carbs": 5.8
  },
  {
    "name": "חמוציות (פטל שחור)",
    "name_en": "Radish",
    "protein": 0.7,
    "fat": 0.1,
    "carbs": 3.4
  },
  {
    "name": "עגבנייה מיובשת",
    "name_en": "Sun-dried tomatoes",
    "protein": 5.1,
    "fat": 0.9,
    "carbs": 55.8
  },
  {
    "name": "זיתים שחורים",
    "name_en": "Black olives",
    "protein": 0.8,
    "fat": 10.9,
    "carbs": 6.0
  },
  {
    "name": "זיתים ירוקים",
    "name_en": "Green olives",
    "protein": 1.0,
    "fat": 11.0,
    "carbs": 3.8
  },
  {
    "name": "תפוח עץ",
    "name_en": "Apple",
    "protein": 0.3,
    "fat": 0.2,
    "carbs": 13.8
  },
  {
    "name": "בננה",
    "name_en": "Banana",
    "protein": 1.1,
    "fat": 0.3,
    "carbs": 22.8
  },
  {
    "name": "תפוז",
    "name_en": "Orange",
    "protein": 0.9,
    "fat": 0.1,
    "carbs": 11.8
  },
  {
    "name": "מנדרינה",
    "name_en": "Mandarin",
    "protein": 0.8,
    "fat": 0.2,
    "carbs": 13.3
  },
  {
    "name": "אשכולית",
    "name_en": "Grapefruit",
    "protein": 0.8,
    "fat": 0.1,
    "carbs": 10.7
  },
  {
    "name": "לימון",
    "name_en": "Lemon",
    "protein": 1.1,
    "fat": 0.3,
    "carbs": 9.3
  },
  {
    "name": "ענבים אדומים",
    "name_en": "Red grapes",
    "protein": 0.7,
    "fat": 0.2,
    "carbs": 17.2
  },
  {
    "name": "ענבים ירוקים",
    "name_en": "Green grapes",
    "protein": 0.7,
    "fat": 0.2,
    "carbs": 17.5
  },
  {
    "name": "תות שדה",
    "name_en": "Strawberry",
    "protein": 0.7,
    "fat": 0.3,
    "carbs": 7.7
  },
  {
    "name": "אבטיח",
    "name_en": "Watermelon",
    "protein": 0.6,
    "fat": 0.2,
    "carbs": 7.6
  },
  {
    "name": "מלון",
    "name_en": "Cantaloupe melon",
    "protein": 0.8,
    "fat": 0.2,
    "carbs": 8.2
  },
  {
    "name": "מנגו",
    "name_en": "Mango",
    "protein": 0.8,
    "fat": 0.4,
    "carbs": 15.0
  },
  {
    "name": "אננס",
    "name_en": "Pineapple",
    "protein": 0.5,
    "fat": 0.1,
    "carbs": 13.1
  },
  {
    "name": "פפאיה",
    "name_en": "Papaya",
    "protein": 0.5,
    "fat": 0.3,
    "carbs": 10.8
  },
  {
    "name": "קיווי",
    "name_en": "Kiwi",
    "protein": 1.1,
    "fat": 0.5,
    "carbs": 14.7
  },
  {
    "name": "פרי שסק",
    "name_en": "Loquat",
    "protein": 0.4,
    "fat": 0.2,
    "carbs": 12.1
  },
  {
    "name": "שזיף",
    "name_en": "Plum",
    "protein": 0.7,
    "fat": 0.3,
    "carbs": 11.4
  },
  {
    "name": "אפרסק",
    "name_en": "Peach",
    "protein": 0.9,
    "fat": 0.3,
    "carbs": 9.5
  },
  {
    "name": "משמש",
    "name_en": "Apricot",
    "protein": 1.4,
    "fat": 0.4,
    "carbs": 11.1
  },
  {
    "name": "דובדבן",
    "name_en": "Cherry",
    "protein": 1.1,
    "fat": 0.2,
    "carbs": 16.0
  },
  {
    "name": "אגס",
    "name_en": "Pear",
    "protein": 0.4,
    "fat": 0.1,
    "carbs": 15.2
  },
  {
    "name": "תמר מג'הול",
    "name_en": "Medjool date",
    "protein": 1.8,
    "fat": 0.2,
    "carbs": 75.0
  },
  {
    "name": "תאנה טרייה",
    "name_en": "Fresh fig",
    "protein": 0.8,
    "fat": 0.3,
    "carbs": 19.2
  },
  {
    "name": "תאנה מיובשת",
    "name_en": "Dried fig",
    "protein": 3.3,
    "fat": 0.9,
    "carbs": 63.9
  },
  {
    "name": "צימוקים",
    "name_en": "Raisins",
    "protein": 3.1,
    "fat": 0.5,
    "carbs": 79.2
  },
  {
    "name": "שזיפים מיובשים",
    "name_en": "Prunes (dried plums)",
    "protein": 2.2,
    "fat": 0.4,
    "carbs": 63.9
  },
  {
    "name": "חמוציות מיובשות",
    "name_en": "Dried cranberries",
    "protein": 0.1,
    "fat": 1.4,
    "carbs": 82.0
  },
  {
    "name": "אוכמניות",
    "name_en": "Blueberries",
    "protein": 0.7,
    "fat": 0.3,
    "carbs": 14.5
  },
  {
    "name": "פטל",
    "name_en": "Raspberries",
    "protein": 1.2,
    "fat": 0.7,
    "carbs": 11.9
  },
  {
    "name": "רימון",
    "name_en": "Pomegranate",
    "protein": 1.7,
    "fat": 1.2,
    "carbs": 18.7
  },
  {
    "name": "ליצ'י",
    "name_en": "Lychee",
    "protein": 0.8,
    "fat": 0.4,
    "carbs": 16.5
  },
  {
    "name": "גויאבה",
    "name_en": "Guava",
    "protein": 2.6,
    "fat": 1.0,
    "carbs": 14.3
  },
  {
    "name": "שקדים",
    "name_en": "Almonds",
    "protein": 21.2,
    "fat": 49.9,
    "carbs": 21.6
  },
  {
    "name": "אגוזי מלך",
    "name_en": "Walnuts",
    "protein": 15.2,
    "fat": 65.2,
    "carbs": 13.7
  },
  {
    "name": "קשיו",
    "name_en": "Cashews",
    "protein": 18.2,
    "fat": 43.9,
    "carbs": 30.2
  },
  {
    "name": "פיסטוקים",
    "name_en": "Pistachios",
    "protein": 20.2,
    "fat": 45.3,
    "carbs": 27.5
  },
  {
    "name": "אגוזי לוז",
    "name_en": "Hazelnuts",
    "protein": 14.9,
    "fat": 60.8,
    "carbs": 16.7
  },
  {
    "name": "אגוזי ברזיל",
    "name_en": "Brazil nuts",
    "protein": 14.3,
    "fat": 66.4,
    "carbs": 11.7
  },
  {
    "name": "אגוזי מקדמיה",
    "name_en": "Macadamia nuts",
    "protein": 7.9,
    "fat": 75.8,
    "carbs": 13.8
  },
  {
    "name": "בוטנים",
    "name_en": "Peanuts",
    "protein": 25.8,
    "fat": 49.2,
    "carbs": 16.1
  },
  {
    "name": "זרעי שומשום",
    "name_en": "Sesame seeds",
    "protein": 17.7,
    "fat": 49.7,
    "carbs": 23.4
  },
  {
    "name": "זרעי חמנייה",
    "name_en": "Sunflower seeds",
    "protein": 20.8,
    "fat": 51.5,
    "carbs": 20.0
  },
  {
    "name": "זרעי דלעת",
    "name_en": "Pumpkin seeds",
    "protein": 19.0,
    "fat": 19.4,
    "carbs": 53.8
  },
  {
    "name": "זרעי פשתן",
    "name_en": "Flaxseeds",
    "protein": 18.3,
    "fat": 42.2,
    "carbs": 28.9
  },
  {
    "name": "זרעי צ'יה",
    "name_en": "Chia seeds",
    "protein": 16.5,
    "fat": 30.7,
    "carbs": 42.1
  },
  {
    "name": "זרעי קנאביס",
    "name_en": "Hemp seeds",
    "protein": 31.6,
    "fat": 48.8,
    "carbs": 8.7
  },
  {
    "name": "קוקוס מגורד",
    "name_en": "Shredded coconut",
    "protein": 3.3,
    "fat": 33.5,
    "carbs": 15.2
  },
  {
    "name": "חמאת בוטנים",
    "name_en": "Peanut butter",
    "protein": 25.1,
    "fat": 50.4,
    "carbs": 20.0
  },
  {
    "name": "חמאת שקדים",
    "name_en": "Almond butter",
    "protein": 21.0,
    "fat": 55.5,
    "carbs": 19.0
  },
  {
    "name": "שמן זית",
    "name_en": "Olive oil",
    "protein": 0.0,
    "fat": 100.0,
    "carbs": 0.0
  },
  {
    "name": "שמן קנולה",
    "name_en": "Canola oil",
    "protein": 0.0,
    "fat": 100.0,
    "carbs": 0.0
  },
  {
    "name": "שמן חמניות",
    "name_en": "Sunflower oil",
    "protein": 0.0,
    "fat": 100.0,
    "carbs": 0.0
  },
  {
    "name": "שמן קוקוס",
    "name_en": "Coconut oil",
    "protein": 0.0,
    "fat": 100.0,
    "carbs": 0.0
  },
  {
    "name": "שמן שומשום",
    "name_en": "Sesame oil",
    "protein": 0.0,
    "fat": 100.0,
    "carbs": 0.0
  },
  {
    "name": "שמן תירס",
    "name_en": "Corn oil",
    "protein": 0.0,
    "fat": 100.0,
    "carbs": 0.0
  },
  {
    "name": "מרגרינה",
    "name_en": "Margarine",
    "protein": 0.3,
    "fat": 80.0,
    "carbs": 0.7
  },
  {
    "name": "טחינה גולמית",
    "name_en": "Tahini, raw sesame paste",
    "protein": 17.0,
    "fat": 53.8,
    "carbs": 21.2
  },
  {
    "name": "טחינה מוכנה",
    "name_en": "Tahini sauce, prepared",
    "protein": 8.0,
    "fat": 22.0,
    "carbs": 8.0
  },
  {
    "name": "מיונז",
    "name_en": "Mayonnaise",
    "protein": 1.1,
    "fat": 74.9,
    "carbs": 0.6
  },
  {
    "name": "מיונז דל שומן",
    "name_en": "Light mayonnaise",
    "protein": 1.3,
    "fat": 35.0,
    "carbs": 10.0
  },
  {
    "name": "קטשופ",
    "name_en": "Ketchup",
    "protein": 1.7,
    "fat": 0.4,
    "carbs": 26.1
  },
  {
    "name": "חרדל",
    "name_en": "Mustard",
    "protein": 3.7,
    "fat": 4.0,
    "carbs": 5.8
  },
  {
    "name": "חומץ תפוחים",
    "name_en": "Apple cider vinegar",
    "protein": 0.0,
    "fat": 0.0,
    "carbs": 0.9
  },
  {
    "name": "רוטב סויה",
    "name_en": "Soy sauce",
    "protein": 8.1,
    "fat": 0.1,
    "carbs": 6.7
  },
  {
    "name": "רוטב חריף",
    "name_en": "Hot sauce (Tabasco style)",
    "protein": 0.5,
    "fat": 0.5,
    "carbs": 1.0
  },
  {
    "name": "רוטב שוואורמה",
    "name_en": "Shawarma sauce",
    "protein": 2.0,
    "fat": 20.0,
    "carbs": 5.0
  },
  {
    "name": "עמבה",
    "name_en": "Amba (mango pickle sauce)",
    "protein": 0.5,
    "fat": 3.0,
    "carbs": 12.0
  },
  {
    "name": "חריימה",
    "name_en": "Harissa",
    "protein": 2.1,
    "fat": 9.5,
    "carbs": 9.5
  },
  {
    "name": "גוג'וג'",
    "name_en": "Zhug (Yemenite hot sauce)",
    "protein": 2.5,
    "fat": 15.0,
    "carbs": 5.0
  },
  {
    "name": "סלסה",
    "name_en": "Salsa",
    "protein": 1.5,
    "fat": 0.3,
    "carbs": 7.0
  },
  {
    "name": "פסטו",
    "name_en": "Pesto",
    "protein": 5.5,
    "fat": 30.5,
    "carbs": 6.5
  },
  {
    "name": "שמן צ'ילי",
    "name_en": "Chili oil",
    "protein": 0.3,
    "fat": 95.0,
    "carbs": 2.0
  },
  {
    "name": "במבה",
    "name_en": "Bamba (peanut puffs)",
    "protein": 10.0,
    "fat": 22.0,
    "carbs": 56.0
  },
  {
    "name": "ביסלי גריל",
    "name_en": "Bissli Grill flavor",
    "protein": 9.5,
    "fat": 16.0,
    "carbs": 65.0
  },
  {
    "name": "ביסלי בצל",
    "name_en": "Bissli Onion flavor",
    "protein": 9.0,
    "fat": 16.5,
    "carbs": 65.0
  },
  {
    "name": "ביסלי פיצה",
    "name_en": "Bissli Pizza flavor",
    "protein": 9.0,
    "fat": 16.0,
    "carbs": 65.0
  },
  {
    "name": "אפרופו",
    "name_en": "Apropos chips",
    "protein": 6.5,
    "fat": 26.0,
    "carbs": 60.0
  },
  {
    "name": "טיסטי",
    "name_en": "Tasty corn snack",
    "protein": 7.0,
    "fat": 24.0,
    "carbs": 60.0
  },
  {
    "name": "פצפוצים",
    "name_en": "Patzpuzim (Israeli corn puffs)",
    "protein": 6.0,
    "fat": 20.0,
    "carbs": 64.0
  },
  {
    "name": "חטיף תירס (שלגון)",
    "name_en": "Corn snack Shalgon",
    "protein": 5.5,
    "fat": 19.0,
    "carbs": 67.0
  },
  {
    "name": "קרקרים",
    "name_en": "Crackers",
    "protein": 8.5,
    "fat": 12.5,
    "carbs": 68.0
  },
  {
    "name": "קרקרים מלאים",
    "name_en": "Whole wheat crackers",
    "protein": 10.0,
    "fat": 10.0,
    "carbs": 62.0
  },
  {
    "name": "פריכיות אורז",
    "name_en": "Rice cakes",
    "protein": 7.5,
    "fat": 1.5,
    "carbs": 81.5
  },
  {
    "name": "פריכיות תירס",
    "name_en": "Corn cakes",
    "protein": 6.5,
    "fat": 1.5,
    "carbs": 82.0
  },
  {
    "name": "חטיף תפוח אדמה (בייגלה)",
    "name_en": "Pretzels (Beigele)",
    "protein": 9.0,
    "fat": 3.5,
    "carbs": 79.0
  },
  {
    "name": "פופקורן",
    "name_en": "Popcorn, air-popped",
    "protein": 11.0,
    "fat": 4.5,
    "carbs": 74.0
  },
  {
    "name": "פופקורן מחמאה",
    "name_en": "Popcorn, buttered",
    "protein": 9.0,
    "fat": 20.0,
    "carbs": 64.0
  },
  {
    "name": "צ'יפס (תפוח אדמה)",
    "name_en": "Potato chips",
    "protein": 6.6,
    "fat": 35.0,
    "carbs": 53.0
  },
  {
    "name": "חטיף תירס (דוריטוס)",
    "name_en": "Tortilla chips (Doritos style)",
    "protein": 7.0,
    "fat": 22.0,
    "carbs": 65.0
  },
  {
    "name": "שוקולד עלית מריר",
    "name_en": "Elite dark chocolate",
    "protein": 5.5,
    "fat": 33.0,
    "carbs": 52.0
  },
  {
    "name": "שוקולד עלית חלב",
    "name_en": "Elite milk chocolate",
    "protein": 7.5,
    "fat": 31.5,
    "carbs": 56.0
  },
  {
    "name": "שוקולד עלית 75% מוצק",
    "name_en": "Elite 75% dark chocolate",
    "protein": 7.0,
    "fat": 43.0,
    "carbs": 40.0
  },
  {
    "name": "שוקולד עלית לבן",
    "name_en": "Elite white chocolate",
    "protein": 5.5,
    "fat": 33.0,
    "carbs": 58.0
  },
  {
    "name": "הלבה",
    "name_en": "Halva (sesame candy)",
    "protein": 13.2,
    "fat": 29.6,
    "carbs": 50.0
  },
  {
    "name": "הלבה בשוקולד",
    "name_en": "Halva with chocolate",
    "protein": 10.5,
    "fat": 32.0,
    "carbs": 52.0
  },
  {
    "name": "בורקס גבינה",
    "name_en": "Bourekas, cheese filled",
    "protein": 9.5,
    "fat": 17.0,
    "carbs": 34.0
  },
  {
    "name": "בורקס תפוח אדמה",
    "name_en": "Bourekas, potato filled",
    "protein": 7.5,
    "fat": 14.5,
    "carbs": 38.5
  },
  {
    "name": "בורקס פטריות",
    "name_en": "Bourekas, mushroom filled",
    "protein": 7.0,
    "fat": 14.0,
    "carbs": 37.0
  },
  {
    "name": "רוגלך שוקולד",
    "name_en": "Rugelach, chocolate",
    "protein": 7.0,
    "fat": 22.0,
    "carbs": 55.0
  },
  {
    "name": "רוגלך קינמון",
    "name_en": "Rugelach, cinnamon",
    "protein": 7.5,
    "fat": 20.0,
    "carbs": 57.0
  },
  {
    "name": "עוגיות שוקולד צ'יפס",
    "name_en": "Chocolate chip cookies",
    "protein": 5.0,
    "fat": 21.0,
    "carbs": 67.0
  },
  {
    "name": "עוגיות שיבולת שועל",
    "name_en": "Oatmeal cookies",
    "protein": 7.0,
    "fat": 17.0,
    "carbs": 65.0
  },
  {
    "name": "עוגת שוקולד",
    "name_en": "Chocolate cake",
    "protein": 5.5,
    "fat": 20.0,
    "carbs": 50.0
  },
  {
    "name": "עוגת גבינה",
    "name_en": "Cheesecake",
    "protein": 5.5,
    "fat": 17.5,
    "carbs": 30.0
  },
  {
    "name": "קרואסון",
    "name_en": "Croissant",
    "protein": 8.2,
    "fat": 21.0,
    "carbs": 46.0
  },
  {
    "name": "דנית",
    "name_en": "Danish pastry",
    "protein": 7.0,
    "fat": 19.0,
    "carbs": 52.0
  },
  {
    "name": "סופגנייה ריבה",
    "name_en": "Jelly doughnut (Sufganiya)",
    "protein": 5.5,
    "fat": 13.5,
    "carbs": 53.0
  },
  {
    "name": "מאפין שוקולד",
    "name_en": "Chocolate muffin",
    "protein": 6.0,
    "fat": 18.0,
    "carbs": 50.0
  },
  {
    "name": "ואפל",
    "name_en": "Waffle",
    "protein": 7.0,
    "fat": 14.0,
    "carbs": 55.0
  },
  {
    "name": "שניצל מוכן (מסופרמרקט)",
    "name_en": "Ready-made schnitzel",
    "protein": 18.0,
    "fat": 12.5,
    "carbs": 14.0
  },
  {
    "name": "קציצות עוף מוכנות",
    "name_en": "Ready-made chicken patties",
    "protein": 14.5,
    "fat": 11.0,
    "carbs": 10.0
  },
  {
    "name": "קציצות בשר מוכנות",
    "name_en": "Ready-made meat patties",
    "protein": 14.0,
    "fat": 12.5,
    "carbs": 9.0
  },
  {
    "name": "פלאפל (מטוגן)",
    "name_en": "Falafel, fried",
    "protein": 13.3,
    "fat": 17.8,
    "carbs": 31.8
  },
  {
    "name": "פלאפל (אפוי)",
    "name_en": "Falafel, baked",
    "protein": 14.5,
    "fat": 8.0,
    "carbs": 28.0
  },
  {
    "name": "סביח (ביצה וחציל)",
    "name_en": "Sabich (egg and eggplant)",
    "protein": 7.5,
    "fat": 10.5,
    "carbs": 22.0
  },
  {
    "name": "שקשוקה",
    "name_en": "Shakshuka",
    "protein": 7.5,
    "fat": 8.5,
    "carbs": 8.5
  },
  {
    "name": "מלאווח",
    "name_en": "Malawach (Yemenite flatbread)",
    "protein": 7.0,
    "fat": 18.0,
    "carbs": 40.0
  },
  {
    "name": "ג'חנון",
    "name_en": "Jachnun (Yemenite pastry)",
    "protein": 7.5,
    "fat": 16.0,
    "carbs": 45.0
  },
  {
    "name": "פיצה גבינה",
    "name_en": "Cheese pizza",
    "protein": 12.0,
    "fat": 11.0,
    "carbs": 29.0
  },
  {
    "name": "פיצה ירקות",
    "name_en": "Vegetable pizza",
    "protein": 10.0,
    "fat": 9.0,
    "carbs": 30.0
  },
  {
    "name": "חביתה",
    "name_en": "Omelette, plain",
    "protein": 10.0,
    "fat": 10.0,
    "carbs": 1.0
  },
  {
    "name": "חביתה ירקות",
    "name_en": "Vegetable omelette",
    "protein": 9.0,
    "fat": 8.5,
    "carbs": 4.0
  },
  {
    "name": "כריך טונה",
    "name_en": "Tuna sandwich",
    "protein": 16.0,
    "fat": 8.5,
    "carbs": 25.0
  },
  {
    "name": "כריך עוף",
    "name_en": "Chicken sandwich",
    "protein": 18.0,
    "fat": 7.5,
    "carbs": 25.0
  },
  {
    "name": "כריך גבינה",
    "name_en": "Cheese sandwich",
    "protein": 14.0,
    "fat": 14.0,
    "carbs": 28.0
  },
  {
    "name": "ביצה קשה",
    "name_en": "Hard-boiled egg",
    "protein": 12.6,
    "fat": 9.5,
    "carbs": 0.7
  },
  {
    "name": "ביצה עין שמש",
    "name_en": "Fried egg, sunny side up",
    "protein": 13.0,
    "fat": 14.8,
    "carbs": 0.4
  },
  {
    "name": "ביצה מקושקשת",
    "name_en": "Scrambled eggs",
    "protein": 9.9,
    "fat": 7.8,
    "carbs": 1.6
  },
  {
    "name": "ביצה מבושלת רכה",
    "name_en": "Soft-boiled egg",
    "protein": 12.4,
    "fat": 9.2,
    "carbs": 0.7
  },
  {
    "name": "קוסקוס ירקות",
    "name_en": "Vegetable couscous",
    "protein": 4.5,
    "fat": 2.5,
    "carbs": 25.0
  },
  {
    "name": "מרק עוף",
    "name_en": "Chicken soup",
    "protein": 3.5,
    "fat": 2.5,
    "carbs": 3.0
  },
  {
    "name": "מרק ירקות",
    "name_en": "Vegetable soup",
    "protein": 2.0,
    "fat": 1.5,
    "carbs": 8.0
  },
  {
    "name": "מרק עדשים",
    "name_en": "Lentil soup",
    "protein": 5.5,
    "fat": 1.5,
    "carbs": 12.0
  },
  {
    "name": "מרק שעועית",
    "name_en": "Bean soup",
    "protein": 5.0,
    "fat": 1.5,
    "carbs": 13.0
  },
  {
    "name": "אורז עם עדשים (מג'דרה)",
    "name_en": "Mujaddara (rice and lentils)",
    "protein": 5.5,
    "fat": 3.5,
    "carbs": 24.0
  },
  {
    "name": "סלט יווני",
    "name_en": "Greek salad",
    "protein": 4.5,
    "fat": 12.0,
    "carbs": 7.0
  },
  {
    "name": "סלט ירקות ישראלי",
    "name_en": "Israeli salad (tomato-cucumber)",
    "protein": 1.5,
    "fat": 3.5,
    "carbs": 7.0
  },
  {
    "name": "סלט טונה",
    "name_en": "Tuna salad",
    "protein": 16.5,
    "fat": 9.0,
    "carbs": 3.0
  },
  {
    "name": "סלט ביצים",
    "name_en": "Egg salad",
    "protein": 8.5,
    "fat": 10.0,
    "carbs": 2.5
  },
  {
    "name": "סלט כרוב קולסלו",
    "name_en": "Coleslaw salad",
    "protein": 1.5,
    "fat": 6.0,
    "carbs": 9.0
  },
  {
    "name": "תבשיל קדרה",
    "name_en": "Cholent (Hamin) stew",
    "protein": 9.5,
    "fat": 8.5,
    "carbs": 22.0
  },
  {
    "name": "קוגל לוקשן",
    "name_en": "Kugel (noodle casserole)",
    "protein": 8.5,
    "fat": 12.0,
    "carbs": 38.0
  },
  {
    "name": "לביבות תפוח אדמה",
    "name_en": "Potato latkes",
    "protein": 4.5,
    "fat": 14.5,
    "carbs": 30.0
  },
  {
    "name": "מאפה תירס",
    "name_en": "Corn bread",
    "protein": 6.5,
    "fat": 7.5,
    "carbs": 43.0
  },
  {
    "name": "גפילטע פיש",
    "name_en": "Gefilte fish",
    "protein": 12.5,
    "fat": 3.5,
    "carbs": 5.0
  },
  {
    "name": "קרפ (בלינץ)",
    "name_en": "Crepes / Blintzes",
    "protein": 8.5,
    "fat": 9.0,
    "carbs": 38.0
  },
  {
    "name": "מרצפן",
    "name_en": "Marzipan",
    "protein": 7.5,
    "fat": 17.5,
    "carbs": 65.0
  },
  {
    "name": "שוקולד ממרח (נוטלה)",
    "name_en": "Chocolate hazelnut spread (Nutella)",
    "protein": 6.3,
    "fat": 30.9,
    "carbs": 57.5
  },
  {
    "name": "ריבה",
    "name_en": "Jam / jelly",
    "protein": 0.4,
    "fat": 0.1,
    "carbs": 65.0
  },
  {
    "name": "דבש",
    "name_en": "Honey",
    "protein": 0.3,
    "fat": 0.0,
    "carbs": 82.4
  },
  {
    "name": "סילן (מולסת תמרים)",
    "name_en": "Silan (date syrup)",
    "protein": 1.5,
    "fat": 0.3,
    "carbs": 77.0
  },
  {
    "name": "סוכר לבן",
    "name_en": "White sugar",
    "protein": 0.0,
    "fat": 0.0,
    "carbs": 99.9
  },
  {
    "name": "סוכר חום",
    "name_en": "Brown sugar",
    "protein": 0.1,
    "fat": 0.0,
    "carbs": 98.1
  },
  {
    "name": "סוכר קנה",
    "name_en": "Cane sugar",
    "protein": 0.0,
    "fat": 0.0,
    "carbs": 99.8
  },
  {
    "name": "ממרח שוקולד בוטנים",
    "name_en": "Chocolate peanut spread",
    "protein": 14.0,
    "fat": 28.0,
    "carbs": 45.0
  },
  {
    "name": "ממרח גבינה",
    "name_en": "Cream cheese spread",
    "protein": 6.5,
    "fat": 25.0,
    "carbs": 4.0
  },
  {
    "name": "שמנת גבינה",
    "name_en": "Cream cheese",
    "protein": 5.9,
    "fat": 34.9,
    "carbs": 4.1
  },
  {
    "name": "גבינת ברי",
    "name_en": "Brie cheese",
    "protein": 20.8,
    "fat": 27.7,
    "carbs": 0.5
  },
  {
    "name": "גבינת קממבר",
    "name_en": "Camembert cheese",
    "protein": 19.8,
    "fat": 24.3,
    "carbs": 0.5
  },
  {
    "name": "גבינת עמק (ארגנטינה)",
    "name_en": "Emek cheese (Argentine style)",
    "protein": 23.5,
    "fat": 26.0,
    "carbs": 1.0
  },
  {
    "name": "גבינת צ'דר",
    "name_en": "Cheddar cheese",
    "protein": 24.9,
    "fat": 33.1,
    "carbs": 1.3
  },
  {
    "name": "לחם קלוי (טוסט)",
    "name_en": "Toast (white bread, toasted)",
    "protein": 9.5,
    "fat": 4.0,
    "carbs": 52.0
  },
  {
    "name": "גרד (קורנפלור)",
    "name_en": "Cornstarch",
    "protein": 0.3,
    "fat": 0.1,
    "carbs": 91.3
  },
  {
    "name": "שמרים יבשים",
    "name_en": "Dry yeast",
    "protein": 40.4,
    "fat": 7.6,
    "carbs": 41.2
  },
  {
    "name": "אבקת אפייה",
    "name_en": "Baking powder",
    "protein": 0.0,
    "fat": 0.0,
    "carbs": 27.7
  },
  {
    "name": "קקאו אבקה",
    "name_en": "Cocoa powder, unsweetened",
    "protein": 19.6,
    "fat": 13.7,
    "carbs": 57.9
  },
  {
    "name": "וניל",
    "name_en": "Vanilla extract",
    "protein": 0.1,
    "fat": 0.1,
    "carbs": 12.7
  },
  {
    "name": "קינמון טחון",
    "name_en": "Ground cinnamon",
    "protein": 4.0,
    "fat": 1.2,
    "carbs": 80.6
  },
  {
    "name": "פפריקה",
    "name_en": "Paprika",
    "protein": 14.1,
    "fat": 12.9,
    "carbs": 53.9
  },
  {
    "name": "כמון",
    "name_en": "Cumin",
    "protein": 17.8,
    "fat": 22.3,
    "carbs": 44.2
  },
  {
    "name": "כורכום",
    "name_en": "Turmeric",
    "protein": 9.7,
    "fat": 3.3,
    "carbs": 67.1
  },
  {
    "name": "הל",
    "name_en": "Cardamom",
    "protein": 10.8,
    "fat": 6.7,
    "carbs": 68.5
  },
  {
    "name": "זעתר (תבלין)",
    "name_en": "Za'atar spice blend",
    "protein": 9.0,
    "fat": 7.0,
    "carbs": 42.0
  },
  {
    "name": "בהרט",
    "name_en": "Baharat spice blend",
    "protein": 11.0,
    "fat": 10.0,
    "carbs": 55.0
  },
  {
    "name": "ראס אל-חנות",
    "name_en": "Ras el hanout",
    "protein": 10.0,
    "fat": 8.5,
    "carbs": 57.0
  },
  {
    "name": "אניס",
    "name_en": "Anise seeds",
    "protein": 17.6,
    "fat": 15.9,
    "carbs": 50.0
  },
  {
    "name": "עלי דפנה",
    "name_en": "Bay leaves",
    "protein": 7.6,
    "fat": 8.4,
    "carbs": 74.9
  },
  {
    "name": "פלפל שחור",
    "name_en": "Black pepper",
    "protein": 10.4,
    "fat": 3.3,
    "carbs": 63.9
  },
  {
    "name": "מלח",
    "name_en": "Salt",
    "protein": 0.0,
    "fat": 0.0,
    "carbs": 0.0
  },
  {
    "name": "אורגנו",
    "name_en": "Oregano, dried",
    "protein": 9.0,
    "fat": 4.3,
    "carbs": 68.9
  },
  {
    "name": "כף חומוס",
    "name_en": "Hummus with pita wrap",
    "protein": 9.5,
    "fat": 10.0,
    "carbs": 30.0
  },
  {
    "name": "שוורמה בפיתה",
    "name_en": "Shawarma in pita",
    "protein": 18.0,
    "fat": 11.0,
    "carbs": 28.0
  },
  {
    "name": "פלאפל בפיתה",
    "name_en": "Falafel in pita",
    "protein": 10.5,
    "fat": 12.5,
    "carbs": 36.5
  },
  {
    "name": "בורגר במסעדה",
    "name_en": "Restaurant hamburger",
    "protein": 18.5,
    "fat": 20.0,
    "carbs": 28.0
  },
  {
    "name": "קציצות שוק עוף",
    "name_en": "Chicken thigh meatballs",
    "protein": 17.5,
    "fat": 12.0,
    "carbs": 6.0
  },
  {
    "name": "חלה מלאה",
    "name_en": "Whole wheat challah",
    "protein": 9.0,
    "fat": 4.5,
    "carbs": 43.0
  },
  {
    "name": "כדורי אורז",
    "name_en": "Rice balls (onigiri)",
    "protein": 3.5,
    "fat": 0.5,
    "carbs": 30.0
  },
  {
    "name": "קרוטונים",
    "name_en": "Croutons",
    "protein": 8.0,
    "fat": 9.0,
    "carbs": 68.0
  },
  {
    "name": "פנקייק",
    "name_en": "Pancakes",
    "protein": 6.5,
    "fat": 7.5,
    "carbs": 41.0
  },
  {
    "name": "פרנץ' טוסט",
    "name_en": "French toast",
    "protein": 8.5,
    "fat": 7.0,
    "carbs": 29.0
  },
  {
    "name": "בייגל",
    "name_en": "Bagel",
    "protein": 9.8,
    "fat": 1.4,
    "carbs": 53.8
  },
  {
    "name": "פיתות מיני",
    "name_en": "Mini pita bread",
    "protein": 8.5,
    "fat": 1.0,
    "carbs": 55.0
  },
  {
    "name": "לחמינג'ון",
    "name_en": "Lahmajoun (Armenian pizza)",
    "protein": 12.0,
    "fat": 8.5,
    "carbs": 35.0
  },
  {
    "name": "קיש גבינה",
    "name_en": "Cheese quiche",
    "protein": 9.5,
    "fat": 17.5,
    "carbs": 22.0
  },
  {
    "name": "קיש ירקות",
    "name_en": "Vegetable quiche",
    "protein": 7.5,
    "fat": 13.5,
    "carbs": 23.0
  },
  {
    "name": "גבינת חלומי",
    "name_en": "Halloumi cheese",
    "protein": 24.0,
    "fat": 26.0,
    "carbs": 2.0
  },
  {
    "name": "גבינת צ'בר",
    "name_en": "Tzfatit cheese (Safed cheese)",
    "protein": 16.0,
    "fat": 20.0,
    "carbs": 2.0
  },
  {
    "name": "לבנה",
    "name_en": "Labneh (strained yogurt)",
    "protein": 8.0,
    "fat": 9.5,
    "carbs": 3.5
  },
  {
    "name": "לבנה בשמן זית",
    "name_en": "Labneh in olive oil",
    "protein": 7.5,
    "fat": 18.0,
    "carbs": 3.0
  },
  {
    "name": "ריבת חלב",
    "name_en": "Dulce de leche (milk jam)",
    "protein": 6.7,
    "fat": 8.5,
    "carbs": 55.0
  },
  {
    "name": "פודינג וניל",
    "name_en": "Vanilla pudding",
    "protein": 3.3,
    "fat": 3.2,
    "carbs": 22.0
  },
  {
    "name": "פודינג שוקולד",
    "name_en": "Chocolate pudding",
    "protein": 3.5,
    "fat": 4.0,
    "carbs": 22.5
  },
  {
    "name": "מוס שוקולד",
    "name_en": "Chocolate mousse",
    "protein": 5.5,
    "fat": 15.0,
    "carbs": 24.0
  },
  {
    "name": "עוגת גזר",
    "name_en": "Carrot cake",
    "protein": 5.5,
    "fat": 17.5,
    "carbs": 50.0
  },
  {
    "name": "בראוניז שוקולד",
    "name_en": "Chocolate brownies",
    "protein": 6.5,
    "fat": 22.0,
    "carbs": 52.0
  },
  {
    "name": "עוגיות אורז (אמה)",
    "name_en": "Rice cookies",
    "protein": 6.5,
    "fat": 3.0,
    "carbs": 80.0
  },
  {
    "name": "חטיף גרנולה",
    "name_en": "Granola bar",
    "protein": 7.5,
    "fat": 13.0,
    "carbs": 58.0
  },
  {
    "name": "חטיף אנרגיה",
    "name_en": "Energy bar",
    "protein": 10.5,
    "fat": 10.5,
    "carbs": 55.0
  },
  {
    "name": "חטיף חלבון",
    "name_en": "Protein bar",
    "protein": 25.0,
    "fat": 10.0,
    "carbs": 35.0
  },
  {
    "name": "פרוטין שייק (אבקת חלבון)",
    "name_en": "Protein shake powder",
    "protein": 70.0,
    "fat": 5.0,
    "carbs": 15.0
  },
  {
    "name": "משקה ספורט",
    "name_en": "Sports drink (Gatorade style)",
    "protein": 0.0,
    "fat": 0.0,
    "carbs": 6.0
  },
  {
    "name": "מיץ תפוזים טבעי",
    "name_en": "Fresh orange juice",
    "protein": 0.7,
    "fat": 0.2,
    "carbs": 10.4
  },
  {
    "name": "מיץ תפוחים",
    "name_en": "Apple juice",
    "protein": 0.1,
    "fat": 0.1,
    "carbs": 11.7
  },
  {
    "name": "מיץ ענבים",
    "name_en": "Grape juice",
    "protein": 0.6,
    "fat": 0.1,
    "carbs": 14.8
  },
  {
    "name": "לימונדה",
    "name_en": "Lemonade",
    "protein": 0.1,
    "fat": 0.1,
    "carbs": 9.5
  },
  {
    "name": "קולה",
    "name_en": "Cola (Coca-Cola)",
    "protein": 0.0,
    "fat": 0.0,
    "carbs": 10.6
  },
  {
    "name": "סודה (מוגזת)",
    "name_en": "Soda water",
    "protein": 0.0,
    "fat": 0.0,
    "carbs": 0.0
  },
  {
    "name": "קפה שחור",
    "name_en": "Black coffee",
    "protein": 0.3,
    "fat": 0.0,
    "carbs": 0.0
  },
  {
    "name": "קפה עם חלב",
    "name_en": "Coffee with milk (latte)",
    "protein": 3.5,
    "fat": 3.5,
    "carbs": 4.5
  },
  {
    "name": "תה ללא סוכר",
    "name_en": "Tea, unsweetened",
    "protein": 0.0,
    "fat": 0.0,
    "carbs": 0.2
  },
  {
    "name": "בירה לייט",
    "name_en": "Light beer",
    "protein": 0.5,
    "fat": 0.0,
    "carbs": 3.6
  },
  {
    "name": "בירה רגילה",
    "name_en": "Regular beer",
    "protein": 0.5,
    "fat": 0.0,
    "carbs": 4.6
  },
  {
    "name": "יין אדום",
    "name_en": "Red wine",
    "protein": 0.1,
    "fat": 0.0,
    "carbs": 2.6
  },
  {
    "name": "יין לבן",
    "name_en": "White wine",
    "protein": 0.1,
    "fat": 0.0,
    "carbs": 2.6
  },
  {
    "name": "חזה עוף מבושל בתנור",
    "name_en": "Baked chicken breast",
    "protein": 30.0,
    "fat": 4.0,
    "carbs": 0.0
  },
  {
    "name": "עוף בגריל",
    "name_en": "Grilled chicken",
    "protein": 26.5,
    "fat": 7.5,
    "carbs": 0.0
  },
  {
    "name": "קציצות עוף",
    "name_en": "Chicken meatballs",
    "protein": 17.5,
    "fat": 10.0,
    "carbs": 6.5
  },
  {
    "name": "גביע קוטג' קטן",
    "name_en": "Cottage cheese small cup",
    "protein": 12.0,
    "fat": 2.5,
    "carbs": 3.5
  },
  {
    "name": "גביע יוגורט",
    "name_en": "Yogurt cup",
    "protein": 4.5,
    "fat": 2.5,
    "carbs": 13.5
  },
  {
    "name": "ביצים מקושקשות עם ירקות",
    "name_en": "Scrambled eggs with veggies",
    "protein": 10.5,
    "fat": 9.5,
    "carbs": 3.5
  },
  {
    "name": "אורז עם פסטת עגבניות",
    "name_en": "Rice with tomato pasta sauce",
    "protein": 3.0,
    "fat": 2.5,
    "carbs": 30.0
  },
  {
    "name": "לחם עם גבינה ועגבנייה",
    "name_en": "Bread with cheese and tomato",
    "protein": 12.5,
    "fat": 10.0,
    "carbs": 26.0
  },
  {
    "name": "עוגת בננה",
    "name_en": "Banana bread/cake",
    "protein": 5.5,
    "fat": 9.5,
    "carbs": 53.0
  },
  {
    "name": "שוקולד מריר 85%",
    "name_en": "Dark chocolate 85%",
    "protein": 8.0,
    "fat": 46.0,
    "carbs": 34.0
  },
  {
    "name": "קפה קר (אייסד קפה)",
    "name_en": "Iced coffee",
    "protein": 2.0,
    "fat": 3.0,
    "carbs": 8.0
  },
  {
    "name": "שייק פירות",
    "name_en": "Fruit smoothie",
    "protein": 1.5,
    "fat": 0.5,
    "carbs": 18.0
  },
  {
    "name": "שייק חלבון בננה",
    "name_en": "Banana protein shake",
    "protein": 15.0,
    "fat": 2.0,
    "carbs": 22.0
  },
  {
    "name": "חזה הודו מעושן",
    "name_en": "Smoked turkey breast",
    "protein": 22.0,
    "fat": 2.5,
    "carbs": 1.5
  },
  {
    "name": "בשר טחון אפוי",
    "name_en": "Baked ground beef (meatloaf)",
    "protein": 16.5,
    "fat": 14.0,
    "carbs": 6.5
  },
  {
    "name": "כנפיים בגריל",
    "name_en": "Grilled chicken wings",
    "protein": 24.0,
    "fat": 13.5,
    "carbs": 0.0
  },
  {
    "name": "בשר בשרות (meat stew)",
    "name_en": "Beef stew",
    "protein": 14.5,
    "fat": 8.5,
    "carbs": 8.0
  },
  {
    "name": "קבב עוף",
    "name_en": "Chicken kebab",
    "protein": 18.5,
    "fat": 8.5,
    "carbs": 2.5
  },
  {
    "name": "דג מלוח (מושט)",
    "name_en": "Salted fish (Moshut)",
    "protein": 22.0,
    "fat": 3.0,
    "carbs": 0.0
  },
  {
    "name": "גבינת ברינזה",
    "name_en": "Bryndza cheese",
    "protein": 15.0,
    "fat": 21.0,
    "carbs": 2.0
  },
  {
    "name": "שמנת לפי 5%",
    "name_en": "Cream 5% fat",
    "protein": 3.2,
    "fat": 5.0,
    "carbs": 4.5
  },
  {
    "name": "מנגולד",
    "name_en": "Swiss chard",
    "protein": 1.8,
    "fat": 0.2,
    "carbs": 3.7
  },
  {
    "name": "ארוגולה בייבי",
    "name_en": "Baby arugula",
    "protein": 2.6,
    "fat": 0.7,
    "carbs": 3.7
  },
  {
    "name": "קייל (כרוב דינוזאור)",
    "name_en": "Kale",
    "protein": 4.3,
    "fat": 0.9,
    "carbs": 8.8
  },
  {
    "name": "אנדיב",
    "name_en": "Endive",
    "protein": 1.0,
    "fat": 0.1,
    "carbs": 4.1
  },
  {
    "name": "פנפה",
    "name_en": "Fennel",
    "protein": 1.2,
    "fat": 0.2,
    "carbs": 7.3
  },
  {
    "name": "טופינמבור",
    "name_en": "Jerusalem artichoke",
    "protein": 2.0,
    "fat": 0.0,
    "carbs": 17.4
  },
  {
    "name": "פסיפלורה",
    "name_en": "Passion fruit",
    "protein": 2.2,
    "fat": 0.7,
    "carbs": 23.4
  },
  {
    "name": "אנגוריה",
    "name_en": "Angouria (Armenian cucumber)",
    "protein": 0.8,
    "fat": 0.2,
    "carbs": 3.3
  },
  {
    "name": "שוקו חלב מלא",
    "name_en": "Whole milk chocolate drink",
    "protein": 3.5,
    "fat": 3.5,
    "carbs": 11.5
  },
  {
    "name": "שמנת לבישול 10%",
    "name_en": "Cooking cream 10%",
    "protein": 2.5,
    "fat": 10.0,
    "carbs": 3.7
  },
  {
    "name": "גלידת שוקולד",
    "name_en": "Chocolate ice cream",
    "protein": 3.8,
    "fat": 8.5,
    "carbs": 26.5
  },
  {
    "name": "ארטיק (ויפי)",
    "name_en": "Ice cream bar (Vienneta style)",
    "protein": 3.0,
    "fat": 9.5,
    "carbs": 27.5
  },
  {
    "name": "שרבט לימון",
    "name_en": "Lemon sorbet",
    "protein": 0.3,
    "fat": 0.1,
    "carbs": 27.0
  },
  {
    "name": "לחם שאור",
    "name_en": "Sourdough bread",
    "protein": 8.8,
    "fat": 1.7,
    "carbs": 48.3
  },
  {
    "name": "לחמניית המבורגר",
    "name_en": "Hamburger bun",
    "protein": 9.0,
    "fat": 4.5,
    "carbs": 51.0
  },
  {
    "name": "נאן",
    "name_en": "Naan bread",
    "protein": 8.7,
    "fat": 3.2,
    "carbs": 50.0
  },
  {
    "name": "פוקאצ'ה",
    "name_en": "Focaccia",
    "protein": 8.5,
    "fat": 8.0,
    "carbs": 48.0
  },
  {
    "name": "צ'יאבטה",
    "name_en": "Ciabatta",
    "protein": 8.3,
    "fat": 2.0,
    "carbs": 50.0
  },
  {
    "name": "לחם שיפון מלא",
    "name_en": "Whole rye bread",
    "protein": 9.4,
    "fat": 3.3,
    "carbs": 47.8
  },
  {
    "name": "מפרום (תפוח אדמה ממולא)",
    "name_en": "Mafrum (stuffed potato)",
    "protein": 7.5,
    "fat": 9.5,
    "carbs": 22.0
  },
  {
    "name": "כוסכוס פרל",
    "name_en": "Pearl couscous (ptitim)",
    "protein": 6.5,
    "fat": 1.0,
    "carbs": 72.0
  },
  {
    "name": "פתיתים מבושלים",
    "name_en": "Ptitim (Israeli couscous), cooked",
    "protein": 3.5,
    "fat": 0.5,
    "carbs": 30.0
  },
  {
    "name": "סנדביץ' סלמי",
    "name_en": "Salami sandwich",
    "protein": 16.5,
    "fat": 21.0,
    "carbs": 26.0
  },
  {
    "name": "כריך אבוקדו",
    "name_en": "Avocado toast/sandwich",
    "protein": 5.5,
    "fat": 10.5,
    "carbs": 28.5
  },
  {
    "name": "חמאת כמהין",
    "name_en": "Truffle butter",
    "protein": 0.8,
    "fat": 82.0,
    "carbs": 0.2
  },
  {
    "name": "אבקת חלבון מי גבינה",
    "name_en": "Whey protein powder",
    "protein": 80.0,
    "fat": 4.5,
    "carbs": 8.5
  },
  {
    "name": "אבקת חלבון קזאין",
    "name_en": "Casein protein powder",
    "protein": 77.0,
    "fat": 3.5,
    "carbs": 11.0
  },
  {
    "name": "בי סי אי איי (BCAA)",
    "name_en": "BCAA supplement",
    "protein": 85.0,
    "fat": 0.5,
    "carbs": 5.0
  },
  {
    "name": "קרמבו",
    "name_en": "Krembo (chocolate marshmallow cookie)",
    "protein": 3.5,
    "fat": 8.5,
    "carbs": 66.0
  },
  {
    "name": "בורקס שמרים גבינה",
    "name_en": "Yeast bourekas with cheese",
    "protein": 10.5,
    "fat": 18.5,
    "carbs": 36.5
  },
  {
    "name": "שקדי מרק",
    "name_en": "Soup almonds (mandeln)",
    "protein": 10.5,
    "fat": 10.5,
    "carbs": 67.0
  },
  {
    "name": "מצה עם חמאה",
    "name_en": "Matzah with butter",
    "protein": 9.5,
    "fat": 18.5,
    "carbs": 74.0
  },
  {
    "name": "חלבה (רולדה)",
    "name_en": "Halva roll",
    "protein": 12.5,
    "fat": 27.5,
    "carbs": 48.5
  },
  {
    "name": "טורקיש דלייט (לוקום)",
    "name_en": "Turkish delight (Lokum)",
    "protein": 0.5,
    "fat": 0.1,
    "carbs": 79.0
  },
  {
    "name": "מבשלת עדשים",
    "name_en": "Lentil Dal (Indian style)",
    "protein": 7.5,
    "fat": 3.5,
    "carbs": 18.5
  },
  {
    "name": "ספגטי בולונז",
    "name_en": "Spaghetti Bolognese",
    "protein": 9.5,
    "fat": 6.5,
    "carbs": 24.5
  },
  {
    "name": "ריזוטו",
    "name_en": "Risotto",
    "protein": 4.0,
    "fat": 5.5,
    "carbs": 29.0
  },
  {
    "name": "לזניה",
    "name_en": "Lasagna",
    "protein": 8.5,
    "fat": 9.0,
    "carbs": 24.5
  },
  {
    "name": "פנה ארביאטה",
    "name_en": "Penne Arrabbiata",
    "protein": 5.0,
    "fat": 3.5,
    "carbs": 32.5
  },
  {
    "name": "פסטה קרבונרה",
    "name_en": "Pasta Carbonara",
    "protein": 11.5,
    "fat": 14.5,
    "carbs": 27.5
  },
  {
    "name": "ניוקי",
    "name_en": "Gnocchi",
    "protein": 3.5,
    "fat": 1.0,
    "carbs": 37.0
  },
  {
    "name": "סושי (נגירי)",
    "name_en": "Sushi nigiri",
    "protein": 7.5,
    "fat": 1.0,
    "carbs": 17.5
  },
  {
    "name": "מאקי (רול)",
    "name_en": "Maki roll",
    "protein": 5.5,
    "fat": 2.5,
    "carbs": 22.5
  },
  {
    "name": "ואיקי",
    "name_en": "Tempura udon",
    "protein": 5.0,
    "fat": 3.0,
    "carbs": 20.0
  },
  {
    "name": "אסאי בול",
    "name_en": "Acai bowl",
    "protein": 4.5,
    "fat": 8.5,
    "carbs": 35.0
  },
  {
    "name": "אבקת אסאי",
    "name_en": "Acai powder",
    "protein": 3.0,
    "fat": 5.5,
    "carbs": 22.0
  },
  {
    "name": "שזיף יפני (אומבושי)",
    "name_en": "Umeboshi (pickled plum)",
    "protein": 0.9,
    "fat": 0.2,
    "carbs": 10.5
  },
  {
    "name": "נורי (אצות ים)",
    "name_en": "Nori seaweed",
    "protein": 36.0,
    "fat": 0.7,
    "carbs": 44.3
  },
  {
    "name": "ספירולינה",
    "name_en": "Spirulina",
    "protein": 57.5,
    "fat": 7.7,
    "carbs": 23.9
  },
  {
    "name": "אלוורה ג'ל",
    "name_en": "Aloe vera gel",
    "protein": 0.0,
    "fat": 0.0,
    "carbs": 0.5
  },
  {
    "name": "זרעי גויאבה",
    "name_en": "Psyllium husk",
    "protein": 2.2,
    "fat": 0.7,
    "carbs": 70.0
  },
  {
    "name": "קמח שקדים",
    "name_en": "Almond flour",
    "protein": 21.9,
    "fat": 52.5,
    "carbs": 19.0
  },
  {
    "name": "קמח קוקוס",
    "name_en": "Coconut flour",
    "protein": 18.0,
    "fat": 14.5,
    "carbs": 57.5
  },
  {
    "name": "פסטה עדשים",
    "name_en": "Lentil pasta, cooked",
    "protein": 11.0,
    "fat": 0.7,
    "carbs": 23.0
  },
  {
    "name": "פסטה חומוס",
    "name_en": "Chickpea pasta, cooked",
    "protein": 11.5,
    "fat": 2.0,
    "carbs": 22.0
  },
  {
    "name": "כרוב ים (קורג'ט)",
    "name_en": "Zucchini noodles (Zoodles)",
    "protein": 1.2,
    "fat": 0.3,
    "carbs": 3.1
  },
  {
    "name": "ספגטי דלעת",
    "name_en": "Spaghetti squash, cooked",
    "protein": 0.7,
    "fat": 0.6,
    "carbs": 6.9
  },
  {
    "name": "חלב שקדים",
    "name_en": "Almond milk, unsweetened",
    "protein": 0.5,
    "fat": 1.2,
    "carbs": 0.3
  },
  {
    "name": "חלב סויה",
    "name_en": "Soy milk, unsweetened",
    "protein": 3.0,
    "fat": 1.8,
    "carbs": 1.2
  },
  {
    "name": "חלב קוקוס",
    "name_en": "Coconut milk",
    "protein": 2.3,
    "fat": 24.0,
    "carbs": 6.0
  },
  {
    "name": "חלב אוט (שיבולת שועל)",
    "name_en": "Oat milk",
    "protein": 1.2,
    "fat": 1.5,
    "carbs": 7.0
  },
  {
    "name": "יוגורט סויה",
    "name_en": "Soy yogurt",
    "protein": 4.0,
    "fat": 2.5,
    "carbs": 9.0
  },
  {
    "name": "גבינה טבעונית",
    "name_en": "Vegan cheese",
    "protein": 4.0,
    "fat": 12.0,
    "carbs": 20.0
  },
  {
    "name": "טמפה",
    "name_en": "Tempeh",
    "protein": 19.0,
    "fat": 10.8,
    "carbs": 7.6
  },
  {
    "name": "סייטן",
    "name_en": "Seitan (wheat gluten)",
    "protein": 25.0,
    "fat": 1.9,
    "carbs": 13.8
  },
  {
    "name": "בייקון עוף",
    "name_en": "Chicken bacon strips",
    "protein": 21.0,
    "fat": 7.5,
    "carbs": 2.0
  },
  {
    "name": "ג'ירו יווני",
    "name_en": "Gyro meat",
    "protein": 18.5,
    "fat": 12.5,
    "carbs": 2.5
  },
  {
    "name": "טאקו",
    "name_en": "Taco (with beef)",
    "protein": 12.5,
    "fat": 10.5,
    "carbs": 20.0
  },
  {
    "name": "ברריטו עוף",
    "name_en": "Chicken burrito",
    "protein": 13.5,
    "fat": 7.5,
    "carbs": 30.0
  },
  {
    "name": "ספרינג רול",
    "name_en": "Spring roll (fried)",
    "protein": 4.5,
    "fat": 7.0,
    "carbs": 24.0
  },
  {
    "name": "דים סאם",
    "name_en": "Dim sum dumplings",
    "protein": 7.5,
    "fat": 5.0,
    "carbs": 18.0
  },
  {
    "name": "פד תאי",
    "name_en": "Pad Thai",
    "protein": 8.5,
    "fat": 7.5,
    "carbs": 26.0
  },
  {
    "name": "קארי קוקוס עוף",
    "name_en": "Chicken coconut curry",
    "protein": 13.5,
    "fat": 10.5,
    "carbs": 8.5
  },
  {
    "name": "ביריאני",
    "name_en": "Biryani (chicken)",
    "protein": 10.5,
    "fat": 7.5,
    "carbs": 28.5
  },
  {
    "name": "פלאפל ביתי אפוי",
    "name_en": "Homemade baked falafel",
    "protein": 14.0,
    "fat": 7.0,
    "carbs": 26.0
  },
  {
    "name": "מוחמרה (רוטב אגוזים)",
    "name_en": "Muhammara (walnut-pepper sauce)",
    "protein": 8.5,
    "fat": 23.0,
    "carbs": 18.0
  },
  {
    "name": "בבא גנוש",
    "name_en": "Baba ganoush",
    "protein": 2.5,
    "fat": 8.5,
    "carbs": 8.5
  },
  {
    "name": "מוטבל",
    "name_en": "Mutabbal (eggplant dip)",
    "protein": 2.5,
    "fat": 9.0,
    "carbs": 7.5
  },
  {
    "name": "דיפ גבינה",
    "name_en": "Cheese dip",
    "protein": 8.5,
    "fat": 20.0,
    "carbs": 5.0
  },
  {
    "name": "גוואקמולי",
    "name_en": "Guacamole",
    "protein": 2.0,
    "fat": 13.5,
    "carbs": 7.5
  },
  {
    "name": "צזיקי",
    "name_en": "Tzatziki",
    "protein": 3.5,
    "fat": 4.5,
    "carbs": 4.5
  },
  {
    "name": "רוטב יוגורט שום",
    "name_en": "Garlic yogurt sauce",
    "protein": 4.0,
    "fat": 5.0,
    "carbs": 6.0
  },
  {
    "name": "פסטה פסטו",
    "name_en": "Pasta with pesto",
    "protein": 7.0,
    "fat": 10.5,
    "carbs": 30.0
  },
  {
    "name": "פסטה עגבניות",
    "name_en": "Pasta with tomato sauce",
    "protein": 5.5,
    "fat": 3.5,
    "carbs": 32.0
  },
  {
    "name": "ליוולות (liver dumplings)",
    "name_en": "Liver dumplings",
    "protein": 10.0,
    "fat": 8.5,
    "carbs": 22.5
  },
  {
    "name": "חזה עוף מוקפץ עם ירקות",
    "name_en": "Stir-fried chicken breast with vegetables",
    "protein": 22.5,
    "fat": 7.5,
    "carbs": 6.5
  },
  {
    "name": "שניצל בקר",
    "name_en": "Beef schnitzel",
    "protein": 21.5,
    "fat": 12.5,
    "carbs": 10.0
  },
  {
    "name": "בשר טחון עם אורז",
    "name_en": "Ground beef with rice",
    "protein": 12.5,
    "fat": 9.5,
    "carbs": 20.5
  },
  {
    "name": "תפוח אדמה מבושל",
    "name_en": "Boiled potato",
    "protein": 2.0,
    "fat": 0.1,
    "carbs": 17.0
  },
  {
    "name": "גזר מבושל",
    "name_en": "Cooked carrots",
    "protein": 0.8,
    "fat": 0.2,
    "carbs": 8.2
  },
  {
    "name": "ברוקולי מבושל",
    "name_en": "Cooked broccoli",
    "protein": 2.5,
    "fat": 0.4,
    "carbs": 7.0
  },
  {
    "name": "כרובית מבושלת",
    "name_en": "Cooked cauliflower",
    "protein": 1.8,
    "fat": 0.2,
    "carbs": 5.1
  },
  {
    "name": "חצילים מגורים מבושלים",
    "name_en": "Cooked eggplant",
    "protein": 0.8,
    "fat": 0.2,
    "carbs": 8.7
  },
  {
    "name": "קישוא מבושל",
    "name_en": "Cooked zucchini",
    "protein": 1.1,
    "fat": 0.2,
    "carbs": 4.0
  },
  {
    "name": "בטטה מבושלת",
    "name_en": "Cooked sweet potato",
    "protein": 1.6,
    "fat": 0.1,
    "carbs": 18.7
  },
  {
    "name": "תרד מבושל",
    "name_en": "Cooked spinach",
    "protein": 2.9,
    "fat": 0.3,
    "carbs": 3.8
  },
  {
    "name": "אורז עם פסטה (אורז מקרוני)",
    "name_en": "Rice with vermicelli",
    "protein": 3.5,
    "fat": 1.5,
    "carbs": 32.0
  },
  {
    "name": "אורז מוסף בהרים",
    "name_en": "Rice pilaf with spices",
    "protein": 3.0,
    "fat": 3.5,
    "carbs": 29.5
  },
  {
    "name": "עוף בלימון",
    "name_en": "Lemon chicken",
    "protein": 24.0,
    "fat": 8.5,
    "carbs": 2.5
  },
  {
    "name": "אנטריקוט בגריל",
    "name_en": "Grilled ribeye steak",
    "protein": 23.0,
    "fat": 17.0,
    "carbs": 0.0
  },
  {
    "name": "צלי בשר (רוסטביף)",
    "name_en": "Roast beef",
    "protein": 24.0,
    "fat": 12.0,
    "carbs": 0.0
  },
  {
    "name": "בשר בקר בישול ארוך",
    "name_en": "Slow-cooked beef",
    "protein": 21.5,
    "fat": 10.5,
    "carbs": 0.5
  },
  {
    "name": "דג בנייר כסף",
    "name_en": "Baked fish in foil",
    "protein": 20.0,
    "fat": 6.5,
    "carbs": 0.0
  },
  {
    "name": "דג מטוגן",
    "name_en": "Fried fish",
    "protein": 18.5,
    "fat": 12.5,
    "carbs": 8.0
  },
  {
    "name": "מרק קרם ירקות",
    "name_en": "Cream of vegetable soup",
    "protein": 2.5,
    "fat": 5.0,
    "carbs": 10.0
  },
  {
    "name": "גספצ'ו",
    "name_en": "Gazpacho",
    "protein": 1.5,
    "fat": 2.0,
    "carbs": 6.5
  },
  {
    "name": "מינסטרונה",
    "name_en": "Minestrone",
    "protein": 3.5,
    "fat": 1.5,
    "carbs": 11.0
  },
  {
    "name": "מרק טומ קא",
    "name_en": "Tom Kha Gai soup",
    "protein": 5.5,
    "fat": 7.5,
    "carbs": 6.5
  },
  {
    "name": "גחלות (גרגרי חומוס קלוי)",
    "name_en": "Roasted chickpeas",
    "protein": 14.0,
    "fat": 6.5,
    "carbs": 45.0
  },
  {
    "name": "זרעי חמניות קלויים",
    "name_en": "Roasted sunflower seeds",
    "protein": 21.0,
    "fat": 52.0,
    "carbs": 18.5
  },
  {
    "name": "מיקס אגוזים",
    "name_en": "Mixed nuts",
    "protein": 17.0,
    "fat": 57.0,
    "carbs": 18.5
  },
  {
    "name": "שוקולד עם אגוזים",
    "name_en": "Chocolate with nuts",
    "protein": 7.5,
    "fat": 36.0,
    "carbs": 48.0
  },
  {
    "name": "ממרח טחינה ושוקולד",
    "name_en": "Tahini chocolate spread",
    "protein": 12.0,
    "fat": 35.0,
    "carbs": 38.0
  },
  {
    "name": "לחם שוקולד",
    "name_en": "Chocolate bread",
    "protein": 7.5,
    "fat": 8.5,
    "carbs": 53.0
  },
  {
    "name": "קינמון רול",
    "name_en": "Cinnamon roll",
    "protein": 6.0,
    "fat": 14.0,
    "carbs": 56.0
  },
  {
    "name": "מלאווח עם דבש",
    "name_en": "Malawach with honey",
    "protein": 7.0,
    "fat": 18.5,
    "carbs": 48.0
  },
  {
    "name": "ג'חנון עם עגבנייה",
    "name_en": "Jachnun with tomato",
    "protein": 7.5,
    "fat": 16.5,
    "carbs": 46.5
  },
  {
    "name": "מלאווח עם גבינה",
    "name_en": "Malawach with cheese",
    "protein": 13.0,
    "fat": 24.0,
    "carbs": 41.0
  },
  {
    "name": "שקדי מרק עם שמן",
    "name_en": "Soup nuts fried",
    "protein": 10.0,
    "fat": 13.0,
    "carbs": 66.0
  },
  {
    "name": "ורד גנוז (זעתר לחם)",
    "name_en": "Zaatar manakish bread",
    "protein": 9.5,
    "fat": 9.5,
    "carbs": 48.0
  },
  {
    "name": "כיכר דבש",
    "name_en": "Honey cake (Lekach)",
    "protein": 5.5,
    "fat": 8.5,
    "carbs": 62.0
  },
  {
    "name": "תמרים ממולאים בשקדים",
    "name_en": "Dates stuffed with almonds",
    "protein": 3.0,
    "fat": 4.5,
    "carbs": 72.0
  },
  {
    "name": "נאמול (סלט קוריאני)",
    "name_en": "Namul Korean salad",
    "protein": 2.5,
    "fat": 3.5,
    "carbs": 6.0
  },
  {
    "name": "קפיר",
    "name_en": "Kefir",
    "protein": 3.3,
    "fat": 1.0,
    "carbs": 4.7
  },
  {
    "name": "כפיר תמרים",
    "name_en": "Date kefir",
    "protein": 3.0,
    "fat": 0.5,
    "carbs": 12.0
  },
  {
    "name": "חמוצים (מלפפונים)",
    "name_en": "Pickled cucumbers",
    "protein": 0.5,
    "fat": 0.1,
    "carbs": 2.5
  },
  {
    "name": "כרוב כבוש (קימצ'י)",
    "name_en": "Kimchi",
    "protein": 2.4,
    "fat": 0.5,
    "carbs": 4.3
  },
  {
    "name": "ירקות מאורים",
    "name_en": "Lacto-fermented vegetables",
    "protein": 1.0,
    "fat": 0.3,
    "carbs": 5.0
  },
  {
    "name": "בורקס שמרים בטטה",
    "name_en": "Sweet potato yeast bourekas",
    "protein": 7.5,
    "fat": 13.0,
    "carbs": 40.0
  },
  {
    "name": "לפת מוחמצת",
    "name_en": "Pickled turnip (Lift)",
    "protein": 0.7,
    "fat": 0.1,
    "carbs": 4.0
  },
  {
    "name": "שישליק",
    "name_en": "Shashlik (skewered meat)",
    "protein": 19.0,
    "fat": 13.5,
    "carbs": 1.0
  },
  {
    "name": "שיפוד ירקות",
    "name_en": "Vegetable skewer (grilled)",
    "protein": 2.0,
    "fat": 4.5,
    "carbs": 8.5
  },
  {
    "name": "שיפוד עוף ופלפלים",
    "name_en": "Chicken and pepper skewer",
    "protein": 20.0,
    "fat": 6.5,
    "carbs": 4.5
  },
  {
    "name": "זנב שור",
    "name_en": "Oxtail",
    "protein": 15.5,
    "fat": 18.0,
    "carbs": 0.0
  },
  {
    "name": "שנה (ברך כבש)",
    "name_en": "Lamb shank",
    "protein": 19.5,
    "fat": 12.5,
    "carbs": 0.0
  },
  {
    "name": "אסאדו (צלעות בקר)",
    "name_en": "Asado beef ribs",
    "protein": 16.5,
    "fat": 22.5,
    "carbs": 0.0
  },
  {
    "name": "אנטרקוט לכשרות",
    "name_en": "Kosher entrecote",
    "protein": 20.0,
    "fat": 17.5,
    "carbs": 0.0
  },
  {
    "name": "מגרת בקר",
    "name_en": "Beef cheeks",
    "protein": 20.0,
    "fat": 9.5,
    "carbs": 0.0
  },
  {
    "name": "קבב אדאנה",
    "name_en": "Adana kebab (spicy lamb)",
    "protein": 18.0,
    "fat": 15.0,
    "carbs": 2.5
  },
  {
    "name": "כדורי גבינה מטוגנים",
    "name_en": "Fried cheese balls",
    "protein": 13.5,
    "fat": 20.0,
    "carbs": 18.5
  },
  {
    "name": "ספינג' בשמן",
    "name_en": "Israeli sfinj doughnuts",
    "protein": 6.0,
    "fat": 16.0,
    "carbs": 48.0
  },
  {
    "name": "לוקמה (ספינג' סורי)",
    "name_en": "Luqaimat (fried dumplings)",
    "protein": 4.5,
    "fat": 14.0,
    "carbs": 52.0
  },
  {
    "name": "זלאביה",
    "name_en": "Zalabia (fried pastry in syrup)",
    "protein": 4.5,
    "fat": 11.5,
    "carbs": 60.0
  },
  {
    "name": "קונאפה",
    "name_en": "Kunafeh (cheese pastry)",
    "protein": 7.5,
    "fat": 13.5,
    "carbs": 50.0
  },
  {
    "name": "בקלווה",
    "name_en": "Baklava",
    "protein": 7.5,
    "fat": 23.5,
    "carbs": 55.0
  },
  {
    "name": "עוגת מקרון",
    "name_en": "Macaron",
    "protein": 5.5,
    "fat": 13.0,
    "carbs": 67.0
  },
  {
    "name": "גלידת גלתו",
    "name_en": "Gelato",
    "protein": 3.5,
    "fat": 6.5,
    "carbs": 24.5
  },
  {
    "name": "קקאו חם",
    "name_en": "Hot cocoa",
    "protein": 4.5,
    "fat": 5.0,
    "carbs": 20.5
  },
  {
    "name": "קפה נמס",
    "name_en": "Instant coffee",
    "protein": 12.2,
    "fat": 0.5,
    "carbs": 65.0
  },
  {
    "name": "תה ירוק",
    "name_en": "Green tea",
    "protein": 0.2,
    "fat": 0.0,
    "carbs": 0.2
  },
  {
    "name": "קמומיל",
    "name_en": "Chamomile tea",
    "protein": 0.0,
    "fat": 0.0,
    "carbs": 0.2
  },
  {
    "name": "אספרסו",
    "name_en": "Espresso",
    "protein": 0.6,
    "fat": 0.2,
    "carbs": 0.0
  },
  {
    "name": "קפה לאטה",
    "name_en": "Latte",
    "protein": 3.7,
    "fat": 3.5,
    "carbs": 5.0
  },
  {
    "name": "קפוצ'ינו",
    "name_en": "Cappuccino",
    "protein": 3.5,
    "fat": 3.0,
    "carbs": 4.5
  },
  {
    "name": "ממרח שקדים ודבש",
    "name_en": "Almond honey spread",
    "protein": 18.5,
    "fat": 48.5,
    "carbs": 24.0
  },
  {
    "name": "דגי ברוטב עגבניות",
    "name_en": "Fish in tomato sauce",
    "protein": 17.5,
    "fat": 5.5,
    "carbs": 5.5
  },
  {
    "name": "ברנז'אס (חציל מטוגן)",
    "name_en": "Fried eggplant slices",
    "protein": 1.5,
    "fat": 10.5,
    "carbs": 8.5
  },
  {
    "name": "חציל קלוי",
    "name_en": "Roasted eggplant",
    "protein": 1.2,
    "fat": 1.0,
    "carbs": 8.7
  },
  {
    "name": "בצל מטוגן",
    "name_en": "Fried onions",
    "protein": 1.3,
    "fat": 7.5,
    "carbs": 12.5
  },
  {
    "name": "קוקי (עוגיות אמריקאיות)",
    "name_en": "Cookies (American style)",
    "protein": 5.5,
    "fat": 22.5,
    "carbs": 64.0
  },
  {
    "name": "חטיף אגוז ברזיל",
    "name_en": "Brazil nut snack",
    "protein": 14.3,
    "fat": 66.4,
    "carbs": 11.7
  },
  {
    "name": "פלאפל תמבוחה",
    "name_en": "Falafel with matbucha",
    "protein": 12.5,
    "fat": 15.5,
    "carbs": 30.5
  },
  {
    "name": "עגבניות ממולאות",
    "name_en": "Stuffed tomatoes",
    "protein": 5.5,
    "fat": 5.5,
    "carbs": 13.5
  },
  {
    "name": "פלפלים ממולאים",
    "name_en": "Stuffed peppers",
    "protein": 7.5,
    "fat": 7.5,
    "carbs": 15.5
  },
  {
    "name": "דלעת ממולאת",
    "name_en": "Stuffed zucchini/pumpkin",
    "protein": 6.5,
    "fat": 6.5,
    "carbs": 14.5
  },
  {
    "name": "וורק (עלה גפן)",
    "name_en": "Stuffed grape leaves (Warak Dawali)",
    "protein": 4.5,
    "fat": 6.5,
    "carbs": 17.5
  },
  {
    "name": "אורז עם תבלינים (פלאב)",
    "name_en": "Spiced rice pilaf (Palov/Plov)",
    "protein": 4.5,
    "fat": 6.5,
    "carbs": 32.5
  },
  {
    "name": "מנסף (אורז וכבש)",
    "name_en": "Mansaf (lamb with rice)",
    "protein": 14.5,
    "fat": 10.5,
    "carbs": 24.0
  },
  {
    "name": "מקלובה",
    "name_en": "Maqluba (upside-down rice dish)",
    "protein": 9.5,
    "fat": 7.0,
    "carbs": 26.5
  },
  {
    "name": "כסקס מרוקאי",
    "name_en": "Moroccan couscous with vegetables",
    "protein": 5.5,
    "fat": 4.5,
    "carbs": 28.5
  },
  {
    "name": "טג'ין עוף",
    "name_en": "Chicken tagine",
    "protein": 18.5,
    "fat": 9.5,
    "carbs": 10.5
  },
  {
    "name": "מרקה (תבשיל ים תיכוני)",
    "name_en": "Mediterranean fish stew (Marka)",
    "protein": 17.5,
    "fat": 7.5,
    "carbs": 8.5
  },
  {
    "name": "גרגרי חרובים",
    "name_en": "Carob pods",
    "protein": 4.6,
    "fat": 1.4,
    "carbs": 89.3
  },
  {
    "name": "פסטה שחורה (דיו דיונון)",
    "name_en": "Black squid ink pasta, cooked",
    "protein": 5.5,
    "fat": 1.5,
    "carbs": 30.5
  },
  {
    "name": "סלמון אפוי",
    "name_en": "Baked salmon",
    "protein": 22.5,
    "fat": 11.0,
    "carbs": 0.0
  },
  {
    "name": "טונה אפויה",
    "name_en": "Baked tuna steak",
    "protein": 26.0,
    "fat": 5.5,
    "carbs": 0.0
  },
  {
    "name": "שמן אבוקדו",
    "name_en": "Avocado oil",
    "protein": 0.0,
    "fat": 100.0,
    "carbs": 0.0
  },
  {
    "name": "גרעיני צנוברים",
    "name_en": "Pine nuts",
    "protein": 13.7,
    "fat": 68.4,
    "carbs": 13.1
  },
  {
    "name": "גרעיני אבטיח קלויים",
    "name_en": "Roasted watermelon seeds",
    "protein": 28.3,
    "fat": 36.0,
    "carbs": 15.0
  },
  {
    "name": "חלבה לפיסיים (עם שומשום)",
    "name_en": "Halva with pistachio",
    "protein": 13.0,
    "fat": 30.0,
    "carbs": 49.0
  },
  {
    "name": "ממרח תמרים",
    "name_en": "Date paste spread",
    "protein": 2.0,
    "fat": 0.5,
    "carbs": 75.0
  },
  {
    "name": "ביסלי ים",
    "name_en": "Bissli Sea flavor",
    "protein": 9.0,
    "fat": 16.0,
    "carbs": 65.0
  },
  {
    "name": "אפרופו גבינה",
    "name_en": "Apropos cheese flavor",
    "protein": 7.0,
    "fat": 27.0,
    "carbs": 58.0
  },
  {
    "name": "כדורי תירס",
    "name_en": "Corn balls (Israeli snack)",
    "protein": 5.5,
    "fat": 18.0,
    "carbs": 67.5
  },
  {
    "name": "בורקס עוף",
    "name_en": "Chicken bourekas",
    "protein": 11.5,
    "fat": 15.5,
    "carbs": 33.0
  },
  {
    "name": "פסטה שמן זית ושום",
    "name_en": "Pasta aglio e olio",
    "protein": 7.0,
    "fat": 14.0,
    "carbs": 30.0
  },
  {
    "name": "ריזוטו דלעת",
    "name_en": "Pumpkin risotto",
    "protein": 4.5,
    "fat": 6.5,
    "carbs": 30.5
  },
  {
    "name": "חומוס עם טחינה ופינוק",
    "name_en": "Hummus with tahini and toppings",
    "protein": 9.0,
    "fat": 14.5,
    "carbs": 16.5
  },
  {
    "name": "מטבוחה (רוטב עגבניות ופלפלים)",
    "name_en": "Matbucha (tomato and pepper sauce)",
    "protein": 1.5,
    "fat": 4.5,
    "carbs": 8.5
  },
  {
    "name": "סלט חצילים",
    "name_en": "Eggplant salad",
    "protein": 1.5,
    "fat": 7.5,
    "carbs": 8.0
  },
  {
    "name": "סלט גזר",
    "name_en": "Carrot salad (Moroccan)",
    "protein": 1.0,
    "fat": 4.5,
    "carbs": 11.0
  },
  {
    "name": "טבולה",
    "name_en": "Tabbouleh salad",
    "protein": 3.0,
    "fat": 5.5,
    "carbs": 13.0
  },
  {
    "name": "פטוש",
    "name_en": "Fattoush salad",
    "protein": 2.5,
    "fat": 5.5,
    "carbs": 12.5
  },
  {
    "name": "סלט קפריז",
    "name_en": "Caprese salad",
    "protein": 8.5,
    "fat": 11.5,
    "carbs": 3.5
  },
  {
    "name": "סלט ניסואז",
    "name_en": "Nicoise salad",
    "protein": 10.5,
    "fat": 9.5,
    "carbs": 8.0
  },
  {
    "name": "סלט קיסר",
    "name_en": "Caesar salad",
    "protein": 8.0,
    "fat": 12.0,
    "carbs": 7.5
  },
  {
    "name": "סלט וולדורף",
    "name_en": "Waldorf salad",
    "protein": 3.5,
    "fat": 12.0,
    "carbs": 12.0
  },
  {
    "name": "שייק אבוקדו",
    "name_en": "Avocado smoothie",
    "protein": 3.5,
    "fat": 12.5,
    "carbs": 15.0
  },
  {
    "name": "שייק גרנולה",
    "name_en": "Granola smoothie",
    "protein": 5.5,
    "fat": 6.5,
    "carbs": 35.0
  },
  {
    "name": "משקה אנרגיה (רד בול)",
    "name_en": "Energy drink (Red Bull style)",
    "protein": 0.7,
    "fat": 0.0,
    "carbs": 11.3
  }
];

// חיפוש בטבלת USDA — מחזיר ערכים ל-100 גרם אם נמצא
function findInUSDA(name) {
    if (!name) return null;
    const n = name.toLowerCase().trim();
    // 1. חיפוש מדויק
    let found = USDA_TABLE.find(r => r.name === name || r.name_en.toLowerCase() === n);
    if (found) return found;
    // 2. חיפוש חלקי
    found = USDA_TABLE.find(r => r.name.includes(name) || name.includes(r.name) ||
        r.name_en.toLowerCase().includes(n) || n.includes(r.name_en.toLowerCase()));
    if (found) return found;
    // 3. חיפוש לפי מילים בודדות — מחלץ מילות מפתח ומחפש כל אחת
    const words = name.replace(/[()״׳,]/g, ' ').split(/\s+/).filter(w => w.length > 2);
    for (const word of words) {
        const wLow = word.toLowerCase();
        found = USDA_TABLE.find(r => r.name.includes(word) || r.name_en.toLowerCase().includes(wLow));
        if (found) return found;
    }
    return null;
}

// מחשב מאקרו לפריט לפי גרמים — מטבלה אם אפשר, אחרת מ-AI
function enrichItemMacros(item) {
    const usda = findInUSDA(item.lookup_name) || findInUSDA(item.name) || findInUSDA(item.name_en);
    if (usda && item.grams) {
        const ratio = item.grams / 100;
        return {
            ...item,
            protein_g: Math.round(usda.protein * ratio * 10) / 10,
            fat_g:     Math.round(usda.fat     * ratio * 10) / 10,
            carbs_g:   Math.round(usda.carbs   * ratio * 10) / 10,
            _fromTable: true
        };
    }
    return item;
}

let scannedPortions = { protein: 0, fat: 0, carbs: 0 };
let scannedGrams = { protein: 0, fat: 0, carbs: 0 };
let scannedItems = [];
let scannedImageBase64 = null;
let scannedImageMime = null;
let _deletedItem = null;
let _deletedIdx = null;
let _undoTimer = null;

function renderScanDetails() {
    const detailsBox = document.getElementById('scan-details-box');
    if (scannedItems.length > 0) {
        detailsBox.innerHTML = scannedItems.map((item, i) =>
            `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                <button onclick="deleteScannedItem(${i})" style="background:none;border:none;color:#888;font-size:18px;cursor:pointer;padding:0 6px;line-height:1;min-width:32px;">✕</button>
                <span style="flex:1;text-align:right;font-size:15px;">${item.name} — <span onclick="editItemGrams(${i}, this)" style="color:#aaa;cursor:pointer;text-decoration:underline dotted;">${Math.round(item.grams)}g</span></span>
            </div>`
        ).join('') + `<div id="add-item-row" style="margin-top:6px;">
            <button onclick="showAddItemForm()" style="background:none;border:none;color:#888;font-size:15px;cursor:pointer;padding:8px 0;width:100%;text-align:right;">+ הוסף פריט</button>
        </div>`;
    } else {
        detailsBox.innerHTML = '';
    }
}

function showAddItemForm() {
    const row = document.getElementById('add-item-row');
    if (!row) return;
    row.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <input id="add-item-name" type="text" placeholder="שם המאכל" style="flex:1;min-width:100px;background:#333;border:1px solid #555;border-radius:4px;color:#fff;font-size:13px;padding:4px 8px;" />
            <input id="add-item-grams" type="number" placeholder="גרם" value="100" style="width:60px;background:#333;border:1px solid #555;border-radius:4px;color:#fff;font-size:13px;padding:4px 6px;text-align:center;" />
            <button onclick="confirmAddItem()" style="background:#fff;color:#000;border:none;border-radius:4px;padding:4px 10px;font-size:13px;cursor:pointer;">✓</button>
            <button onclick="renderScanDetails()" style="background:none;border:none;color:#888;font-size:15px;cursor:pointer;padding:0 2px;">✕</button>
        </div>`;
    document.getElementById('add-item-name').focus();
    document.getElementById('add-item-grams').addEventListener('focus', function() { this.select(); });
    document.getElementById('add-item-grams').addEventListener('keydown', e => { if (e.key === 'Enter') confirmAddItem(); });
    document.getElementById('add-item-name').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('add-item-grams').focus(); });
}

async function confirmAddItem() {
    const nameEl = document.getElementById('add-item-name');
    const gramsEl = document.getElementById('add-item-grams');
    if (!nameEl || !gramsEl) return;
    const name = nameEl.value.trim();
    const grams = parseInt(gramsEl.value) || 100;
    if (!name) { nameEl.focus(); return; }

    // Try USDA first
    const usdaItem = enrichItemMacros({ name, grams, lookup_name: name });
    const foundInUSDA = usdaItem.protein_g > 0 || usdaItem.fat_g > 0 || usdaItem.carbs_g > 0;

    if (foundInUSDA) {
        scannedItems.push(usdaItem);
        updateScannedTotals();
        renderScanDetails();
        return;
    }

    // Fallback: Claude text-only
    const row = document.getElementById('add-item-row');
    if (row) row.innerHTML = `<span style="color:#888;font-size:12px;">מחפש מידע תזונתי...</span>`;

    try {
        const { data: { session } } = await db.auth.getSession();
        const token = session?.access_token;
        const prompt = `מהם ערכי המאקרו של ${grams} גרם ${name}? החזר JSON בלבד ללא הסברים: {"protein_g": X, "fat_g": X, "carbs_g": X}`;
        const resp = await fetch('/api/claude', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
            body: JSON.stringify({ prompt })
        });
        if (resp.status === 429) {
            const errData = await resp.json().catch(() => ({}));
            const row2 = document.getElementById('add-item-row');
            if (row2) row2.innerHTML = `<span style="color:#ff6b6b;font-size:12px;">${errData.error || 'הגעת למגבלת הבירורים בשעה'}</span>`;
            return;
        }
        if (!resp.ok) throw new Error('claude error');
        const { text } = await resp.json();
        const match = text.match(/\{[\s\S]*?\}/);
        if (!match) throw new Error('no json');
        const macros = JSON.parse(match[0]);
        scannedItems.push({
            name,
            grams,
            protein_g: macros.protein_g || 0,
            fat_g: macros.fat_g || 0,
            carbs_g: macros.carbs_g || 0
        });
    } catch (e) {
        scannedItems.push({ name, grams, protein_g: 0, fat_g: 0, carbs_g: 0 });
    }
    updateScannedTotals();
    renderScanDetails();
}

function deleteScannedItem(idx) {
    _deletedItem = scannedItems[idx];
    _deletedIdx = idx;
    scannedItems.splice(idx, 1);
    updateScannedTotals();
    renderScanDetails();
    // הצג toast
    const toast = document.getElementById('scan-undo-toast');
    toast.classList.remove('hidden');
    if (_undoTimer) clearTimeout(_undoTimer);
    _undoTimer = setTimeout(() => {
        toast.classList.add('hidden');
        _deletedItem = null;
        _deletedIdx = null;
    }, 2000);
}

function undoDeleteItem() {
    if (_deletedItem === null) return;
    clearTimeout(_undoTimer);
    scannedItems.splice(_deletedIdx, 0, _deletedItem);
    _deletedItem = null;
    _deletedIdx = null;
    updateScannedTotals();
    renderScanDetails();
    document.getElementById('scan-undo-toast').classList.add('hidden');
}

function editItemGrams(idx, el) {
    const current = Math.round(scannedItems[idx].grams);
    const input = document.createElement('input');
    input.type = 'number';
    input.value = current;
    input.style.cssText = 'width:52px;background:#333;border:1px solid #555;border-radius:4px;color:#fff;font-size:13px;padding:2px 4px;text-align:center;';
    el.replaceWith(input);
    input.focus();
    input.select();
    const save = () => {
        const val = parseInt(input.value);
        if (val > 0) {
            scannedItems[idx] = enrichItemMacros({ ...scannedItems[idx], grams: val });
            updateScannedTotals();
        }
        renderScanDetails();
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { input.blur(); } });
}

function updateScannedTotals() {
    const round = v => Math.round(v * 2) / 2;
    scannedGrams = {
        protein: Math.round(scannedItems.reduce((s, i) => s + (i.protein_g || 0), 0)),
        fat:     Math.round(scannedItems.reduce((s, i) => s + (i.fat_g     || 0), 0)),
        carbs:   Math.round(scannedItems.reduce((s, i) => s + (i.carbs_g   || 0), 0))
    };
    scannedPortions = {
        protein: round(Math.max(0, scannedGrams.protein / 27.5)),
        fat:     round(Math.max(0, scannedGrams.fat     / 12.5)),
        carbs:   round(Math.max(0, scannedGrams.carbs   / 37.5))
    };
    document.getElementById('scan-portions').innerHTML =
        `<div style="display:flex; flex-direction:column; gap:6px;">` +
        `<div>🥩 חלבון: <b>${scannedPortions.protein} מנות</b> <span style="color:#888;font-size:13px;">(${scannedGrams.protein}g)</span></div>` +
        `<div>🍚 פחמימה: <b>${scannedPortions.carbs} מנות</b> <span style="color:#888;font-size:13px;">(${scannedGrams.carbs}g)</span></div>` +
        `<div>🥑 שומן: <b>${scannedPortions.fat} מנות</b> <span style="color:#888;font-size:13px;">(${scannedGrams.fat}g)</span></div>` +
        `</div>`;
}

function openFoodScanner() {
    const modal = document.getElementById('food-scanner-modal');
    modal.style.display = '';
    modal.classList.remove('hidden');
    document.getElementById('scanner-modal-title').textContent = '🍽️ הוספת מנות';
    document.getElementById('scanner-step-1').classList.remove('hidden');
    document.getElementById('scanner-step-2').classList.add('hidden');
    document.getElementById('scanner-loading').classList.add('hidden');
    document.getElementById('food-preview').classList.add('hidden');
    document.getElementById('scan-correction').value = '';
    document.getElementById('scan-food-label').style.display = '';
    document.getElementById('scan-food-name').style.display = '';
    scannedImageBase64 = null;
    scannedImageMime = null;
    scannedItems = [];
    scannedPortions = { protein: 0, fat: 0, carbs: 0 };
}

function openTextEntry() {
    scannedItems = [];
    scannedPortions = { protein: 0, fat: 0, carbs: 0 };
    scannedGrams = { protein: 0, fat: 0, carbs: 0 };
    const modal = document.getElementById('food-scanner-modal');
    modal.style.display = '';
    modal.classList.remove('hidden');
    document.getElementById('scanner-modal-title').textContent = '✍️ הזנת ארוחה בכתב';
    document.getElementById('scanner-step-1').classList.add('hidden');
    document.getElementById('scanner-loading').classList.add('hidden');
    document.getElementById('scanner-error').classList.add('hidden');
    document.getElementById('scan-food-label').style.display = 'none';
    document.getElementById('scan-food-name').style.display = 'none';
    document.getElementById('scan-portions').innerHTML = '';
    document.getElementById('scan-details-box').innerHTML = '<div id="add-item-row"></div>';
    document.getElementById('scan-undo-toast').classList.add('hidden');
    document.getElementById('scanner-step-2').classList.remove('hidden');
    showAddItemForm();
}

function closeFoodScanner() {
    document.getElementById('food-scanner-modal').classList.add('hidden');
}

function handleFoodImageFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
        const dataUrl = ev.target.result;
        scannedImageMime = file.type;
        scannedImageBase64 = dataUrl.split(',')[1];
        const preview = document.getElementById('food-preview');
        preview.src = dataUrl;
        preview.classList.remove('hidden');
        analyzeFood(scannedImageBase64, scannedImageMime, '');
    };
    reader.readAsDataURL(file);
}

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('food-image-input').addEventListener('change', function(e) {
        handleFoodImageFile(e.target.files[0]);
        e.target.value = '';
    });
    document.getElementById('food-gallery-input').addEventListener('change', function(e) {
        handleFoodImageFile(e.target.files[0]);
        e.target.value = '';
    });
});

async function compressImage(base64, mimeType) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = function() {
            const MAX = 800;
            let { width, height } = img;
            if (width > MAX || height > MAX) {
                if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
                else                { width = Math.round(width * MAX / height); height = MAX; }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            resolve({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
        };
        img.src = `data:${mimeType};base64,${base64}`;
    });
}

async function analyzeFood(base64, mimeType, correction) {
    document.getElementById('scanner-step-2').classList.add('hidden');
    document.getElementById('scanner-loading').classList.remove('hidden');
    document.getElementById('scanner-error').classList.add('hidden');

    const compressed = await compressImage(base64, mimeType);
    base64 = compressed.base64;
    mimeType = compressed.mimeType;

    const prevList = scannedItems.length > 0
        ? `\nהפריטים שזוהו עד כה:\n${scannedItems.map(i => `- ${i.name} (${Math.round(i.grams)}g)`).join('\n')}\n`
        : '';
    const correctionNote = correction
        ? `תיקון מהמשתמש: "${correction}"\nשמור על כל הפריטים שנכונים. שנה/הסר/הוסף רק את מה שהמשתמש ציין במפורש.${prevList}\n`
        : '';
    const prompt = `${correctionNote}זהה את האוכל בתמונה והעריך כמויות בצורה מדויקת ככל האפשר.
הנחיות:
- העריך לפי גודל המנה הנראה בתמונה ביחס לצלחת/כלי
- השתמש בערכי מאגר USDA לחישוב מאקרו לפי גרמים
- זהה לפי מה שאתה רואה בתמונה בלבד — צבע, צורה, מרקם. אל תניח סוג מאכל לפי הקשר
- כדורים חומים יכולים להיות קציצות בשר, פלאפל, כדורי עוף — זהה לפי מרקם ומראה
- ירוק כהה וקרמי = כנראה אבוקדו, לא חסה
- אל תניח שהמנה טבעונית או צמחונית
- אם לא ניתן לזהות בוודאות — אל תכלול. עדיף פחות פריטים נכונים מאשר פריטים שגויים
- items חייב לכלול כל רכיב בנפרד (לדוגמה: אורז, חזה עוף, שמן)
- אסור לאחד שני מאכלים שונים לפריט אחד
- עבור כל פריט ב-items: חשב מאקרו לאותו פריט בלבד לפי USDA
- protein_g/fat_g/carbs_g ברמת ה-food = סכום כל הפריטים
החזר JSON בלבד, ללא טקסט נוסף:
{"food": "שם האוכל בעברית", "protein_g": X, "fat_g": X, "carbs_g": X, "items": [{"name": "שם מאכל מלא", "lookup_name": "שם קצר לחיפוש (מילה אחת או שתיים, ללא תוספות)", "grams": X, "protein_g": X, "fat_g": X, "carbs_g": X}, ...]}`;

    try {
        const { data: { session: _scanSession } } = await db.auth.getSession();
        if (!_scanSession) throw new Error('לא מחובר');
        const response = await fetch('/api/claude', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_scanSession.access_token}` },
            body: JSON.stringify({ prompt, imageBase64: base64, imageMime: mimeType })
        });
        if (!response.ok) { const e = await response.json().catch(() => ({})); throw new Error(e.error || 'claude error'); }
        const { text: fullText } = await response.json();
        const jsonMatch = fullText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('no JSON');
        const result = JSON.parse(jsonMatch[0]);

        const round = v => Math.round(v * 2) / 2;
        scannedGrams = {
            protein: Math.round(result.protein_g || 0),
            fat:     Math.round(result.fat_g     || 0),
            carbs:   Math.round(result.carbs_g   || 0)
        };
        scannedPortions = {
            protein: round(Math.max(0, scannedGrams.protein / 27.5)),
            fat:     round(Math.max(0, scannedGrams.fat     / 12.5)),
            carbs:   round(Math.max(0, scannedGrams.carbs   / 37.5))
        };
        scannedItems = (Array.isArray(result.items) ? result.items : []).map(enrichItemMacros);

        document.getElementById('scan-food-name').textContent = `🍽️ ${result.food}`;
        document.getElementById('scan-portions').innerHTML =
            `<div style="display:flex; flex-direction:column; gap:6px;">` +
            `<div>🥩 חלבון: <b>${scannedPortions.protein} מנות</b> <span style="color:#888;font-size:13px;">(${scannedGrams.protein}g)</span></div>` +
            `<div>🍚 פחמימה: <b>${scannedPortions.carbs} מנות</b> <span style="color:#888;font-size:13px;">(${scannedGrams.carbs}g)</span></div>` +
            `<div>🥑 שומן: <b>${scannedPortions.fat} מנות</b> <span style="color:#888;font-size:13px;">(${scannedGrams.fat}g)</span></div>` +
            `</div>`;

        renderScanDetails();
        document.getElementById('scanner-loading').classList.add('hidden');
        document.getElementById('scanner-step-1').classList.add('hidden');
        document.getElementById('scanner-step-2').classList.remove('hidden');
    } catch (err) {
        document.getElementById('scanner-loading').classList.add('hidden');
        document.getElementById('scanner-step-1').classList.add('hidden');
        document.getElementById('scanner-step-2').classList.remove('hidden');
        const errMsg = err.message.includes('מגבלת') ? err.message : 'לא הצלחתי לזהות את האוכל';
        const errEl = document.getElementById('scanner-error');
        errEl.textContent = '⛔ ' + errMsg;
        errEl.classList.remove('hidden');
        document.getElementById('scan-portions').innerHTML = '';
        scannedPortions = { protein: 0, fat: 0, carbs: 0 };
    }
}

function toggleScanDetails() {
    const box = document.getElementById('scan-details-box');
    const btn = document.getElementById('scan-details-btn');
    const open = box.classList.toggle('hidden');
    btn.textContent = open ? '▼ פרטים נוספים' : '▲ הסתר פרטים';
}

async function recalculate() {
    const correction = document.getElementById('scan-correction').value.trim();
    if (!correction) return;

    document.getElementById('scanner-step-2').classList.add('hidden');
    document.getElementById('scanner-loading').classList.remove('hidden');
    document.getElementById('scanner-error').classList.add('hidden');

    const itemsList = scannedItems.map((it, i) => `${i + 1}. ${it.name} — ${Math.round(it.grams)}g`).join('\n');
    const prompt = `אתה עוזר לניתוח תזונה. להלן רשימת המאכלים שזוהו בצלחת:
${itemsList}

המשתמש אומר: "${correction}"

עדכן את הרשימה לפי הוראות המשתמש בדיוק. שנה/הסר/הוסף רק את מה שצוין במפורש. אל תשנה גרמים או פרטים של פריטים שלא הוזכרו — שמור אותם זהים לחלוטין.
החזר JSON בלבד:
{"food": "תיאור קצר", "protein_g": X, "fat_g": X, "carbs_g": X, "items": [{"name": "שם", "lookup_name": "שם קצר", "grams": X, "protein_g": X, "fat_g": X, "carbs_g": X}]}`;

    try {
        const { data: { session: _s } } = await db.auth.getSession();
        if (!_s) throw new Error('לא מחובר');
        const response = await fetch('/api/claude', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_s.access_token}` },
            body: JSON.stringify({ prompt })
        });
        if (!response.ok) { const e = await response.json().catch(() => ({})); throw new Error(e.error || 'claude error'); }
        const { text: fullText } = await response.json();
        const jsonMatch = fullText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('no JSON');
        const result = JSON.parse(jsonMatch[0]);

        scannedItems = (Array.isArray(result.items) ? result.items : []).map(enrichItemMacros);
        const round = v => Math.round(v * 2) / 2;
        scannedGrams = {
            protein: Math.round(scannedItems.reduce((s, i) => s + (i.protein_g || 0), 0)),
            fat:     Math.round(scannedItems.reduce((s, i) => s + (i.fat_g     || 0), 0)),
            carbs:   Math.round(scannedItems.reduce((s, i) => s + (i.carbs_g   || 0), 0))
        };
        scannedPortions = {
            protein: round(Math.max(0, scannedGrams.protein / 27.5)),
            fat:     round(Math.max(0, scannedGrams.fat     / 12.5)),
            carbs:   round(Math.max(0, scannedGrams.carbs   / 37.5))
        };

        document.getElementById('scan-food-name').textContent = `🍽️ ${result.food}`;
        document.getElementById('scan-portions').innerHTML =
            `<div style="display:flex; flex-direction:column; gap:6px;">` +
            `<div>🥩 חלבון: <b>${scannedPortions.protein} מנות</b> <span style="color:#888;font-size:13px;">(${scannedGrams.protein}g)</span></div>` +
            `<div>🍚 פחמימה: <b>${scannedPortions.carbs} מנות</b> <span style="color:#888;font-size:13px;">(${scannedGrams.carbs}g)</span></div>` +
            `<div>🥑 שומן: <b>${scannedPortions.fat} מנות</b> <span style="color:#888;font-size:13px;">(${scannedGrams.fat}g)</span></div>` +
            `</div>`;
        renderScanDetails();
        document.getElementById('scan-correction').value = '';
    } catch (err) {
        const errMsg2 = err.message?.includes('מגבלת') ? err.message : 'שגיאה בחישוב מחדש';
        const errEl2 = document.getElementById('scanner-error');
        errEl2.textContent = '⛔ ' + errMsg2;
        errEl2.classList.remove('hidden');
    } finally {
        document.getElementById('scanner-loading').classList.add('hidden');
        document.getElementById('scanner-step-2').classList.remove('hidden');
    }
}

function addScannedPortions() {
    const protein = scannedPortions.protein || 0;
    const carbs   = scannedPortions.carbs   || 0;
    const fat     = scannedPortions.fat     || 0;
    const added = [];
    if (protein > 0) { modifyPortion('protein', protein); added.push(`חלבון +${protein}`); }
    if (carbs   > 0) { modifyPortion('carbs',   carbs);   added.push(`פחמימה +${carbs}`); }
    if (fat     > 0) { modifyPortion('fat',     fat);     added.push(`שומן +${fat}`); }
    closeFoodScanner();
    const toast = document.createElement('div');
    toast.innerText = added.length ? '✅ נוסף: ' + added.join(' | ') : '⚠️ לא נוספו מנות';
    toast.style.cssText = `position:fixed;top:24px;left:50%;transform:translateX(-50%);background:var(--accent);color:white;padding:12px 24px;border-radius:25px;font-size:15px;font-weight:bold;z-index:9999;box-shadow:0 4px 15px rgba(0,0,0,0.2);animation:fadeIn 0.3s ease;white-space:nowrap;`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ── Progress Photos ──────────────────────────────────────────────────────────

const PROGRESS_PHOTOS_LIMIT = 10;

async function loadProgressPhotos() {
    const uid = getActiveUserId();
    const gallery = document.getElementById('progress-photos-gallery');
    const countEl = document.getElementById('progress-photos-count');
    const uploadLabel = document.getElementById('progress-photo-upload-label');
    if (!gallery || !uid) return;

    // ניקוי מיידי לפני fetch — מונע הצגת תמונות של משתמש אחר
    gallery.innerHTML = '<span style="color:var(--text-secondary);font-size:0.88rem;">טוען...</span>';
    if (countEl) countEl.textContent = '';

    const photos = await sbFetchProgressPhotos(uid);
    const count = photos.length;

    if (countEl) countEl.textContent = count > 0 ? `${count}/${PROGRESS_PHOTOS_LIMIT}` : '';
    if (uploadLabel) uploadLabel.style.display = count >= PROGRESS_PHOTOS_LIMIT ? 'none' : '';

    if (count === 0) {
        gallery.innerHTML = `<span style="color:var(--text-secondary);font-size:0.88rem;">עדיין לא הועלתה תמונת התקדמות</span>`;
        return;
    }

    const signedUrls = await sbGetSignedPhotoUrls(photos.map(p => p.storage_path));

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;scrollbar-width:thin;';
    photos.forEach(p => {
        const url = signedUrls[p.storage_path];
        if (!url) return;
        const dateStr = new Date(p.uploaded_at).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
        const item = document.createElement('div');
        item.style.flexShrink = '0';
        const img = document.createElement('img');
        img.src = url;
        img.alt = 'תמונת התקדמות';
        img.style.cssText = 'width:72px;height:72px;object-fit:cover;border-radius:8px;cursor:pointer;border:1px solid var(--border);display:block;';
        img.addEventListener('click', () => openProgressPhoto(url, p.id, p.storage_path));
        const label = document.createElement('div');
        label.style.cssText = 'font-size:10px;color:var(--text-secondary);text-align:center;margin-top:2px;';
        label.textContent = dateStr;
        item.appendChild(img);
        item.appendChild(label);
        wrapper.appendChild(item);
    });
    gallery.innerHTML = '';
    gallery.appendChild(wrapper);
}

async function uploadProgressPhoto(input) {
    const file = input.files[0];
    if (!file) return;
    input.value = '';

    if (!file.type.startsWith('image/')) {
        _showProgressPhotoToast('ניתן להעלות תמונות בלבד', false);
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        _showProgressPhotoToast('התמונה גדולה מדי — מקסימום 10MB', false);
        return;
    }

    const uid = getActiveUserId();
    if (!uid) return;

    const existing = await sbFetchProgressPhotos(uid);
    if (existing.length >= PROGRESS_PHOTOS_LIMIT) {
        _showProgressPhotoToast(`הגעת למגבלת ${PROGRESS_PHOTOS_LIMIT} תמונות`, false);
        return;
    }

    const gallery = document.getElementById('progress-photos-gallery');
    if (gallery) gallery.innerHTML = `<span style="color:var(--text-secondary);font-size:0.88rem;">מעלה תמונה...</span>`;

    try {
        await sbUploadProgressPhoto(uid, file);
        _showProgressPhotoToast('התמונה נשמרה ✓');
    } catch (e) {
        console.error('[uploadProgressPhoto]', e);
        _showProgressPhotoToast('שגיאה בהעלאה', false);
    }
    await loadProgressPhotos();
}

async function deleteProgressPhoto(photoId, storagePath) {
    try {
        await sbDeleteProgressPhoto(photoId, storagePath);
    } catch (e) {
        console.error('[deleteProgressPhoto]', e);
    }
    await loadProgressPhotos();
}

function openProgressPhoto(url, photoId, storagePath) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `
        <button id="pp-close" style="position:absolute;top:16px;left:16px;background:none;border:none;font-size:28px;color:white;cursor:pointer;line-height:1;">✕</button>
        <button id="pp-delete" style="position:absolute;top:16px;right:16px;background:#e55;color:white;border:none;border-radius:10px;padding:7px 16px;font-size:14px;font-weight:bold;cursor:pointer;">🗑 מחיקת תמונה</button>
        <img src="${url}" style="max-width:100%;max-height:88vh;border-radius:10px;object-fit:contain;">`;
    overlay.querySelector('#pp-close').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#pp-delete').addEventListener('click', () => {
        const confirmed = document.createElement('div');
        confirmed.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;z-index:10000;';
        confirmed.innerHTML = `
            <div style="color:white;font-size:18px;font-weight:bold;text-align:center;">למחוק את התמונה?</div>
            <div style="display:flex;gap:12px;">
                <button id="pp-confirm-yes" style="background:#e55;color:white;border:none;border-radius:10px;padding:10px 28px;font-size:15px;font-weight:bold;cursor:pointer;">מחיקה</button>
                <button id="pp-confirm-no" style="background:rgba(255,255,255,0.15);color:white;border:none;border-radius:10px;padding:10px 28px;font-size:15px;cursor:pointer;">ביטול</button>
            </div>`;
        confirmed.querySelector('#pp-confirm-yes').addEventListener('click', async () => {
            overlay.remove();
            await deleteProgressPhoto(photoId, storagePath);
        });
        confirmed.querySelector('#pp-confirm-no').addEventListener('click', () => confirmed.remove());
        overlay.appendChild(confirmed);
    });
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
}

function _showProgressPhotoToast(msg, success = true) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:${success ? '#22c55e' : '#e55'};color:white;padding:10px 22px;border-radius:20px;font-size:14px;font-weight:bold;z-index:99999;box-shadow:0 4px 15px rgba(0,0,0,0.2);white-space:nowrap;`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

