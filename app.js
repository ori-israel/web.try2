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
    h1.innerText = `תוכנית הליווי של ${CLIENT.name}`;
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
            const weightCell = item.querySelector('.weight-detail');
            accordion.appendChild(item);
        });
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
            if (typeof syncWeightNow === 'function') syncWeightNow(_wDate, val);
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
            ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:6px;direction:rtl;">אימון קודם (${journalFormatShortDate(last.date)}): ${last.weight_kg} ק"ג × ${last.reps} חזרות</div>`
            : '';
        html += `
            <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px;">
                <div style="font-weight:bold;margin-bottom:10px;direction:rtl;color:var(--text-primary);display:flex;align-items:center;justify-content:space-between;">
                    <button class="journal-chart-btn" data-exercise="${ex.name}" style="background:transparent;border:1px solid rgba(128,128,128,0.4);border-radius:6px;padding:2px 6px;font-size:14px;cursor:pointer;opacity:0.7;line-height:1;" title="גרף חוזק" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">📊</button>
                    <span>${ex.name}</span>
                </div>
                <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;">
                    <label style="font-size:13px;display:flex;align-items:center;gap:6px;color:var(--text-primary);">
                        <span>משקל:</span>
                        <input type="number" class="journal-weight-input" data-exercise="${ex.name}"
                               value="${saved.weight_kg ?? ''}" min="0" step="0.5"
                               style="width:80px;padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--input-bg);color:var(--text-primary);font-size:16px;text-align:center;">
                    </label>
                    <label style="font-size:13px;display:flex;align-items:center;gap:6px;color:var(--text-primary);">
                        <span>חזרות:</span>
                        <input type="number" class="journal-reps-input" data-exercise="${ex.name}"
                               value="${saved.reps ?? ''}" min="0" step="1"
                               style="width:80px;padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--input-bg);color:var(--text-primary);font-size:16px;text-align:center;">
                    </label>
                    <button class="journal-save-btn" data-exercise="${ex.name}"
                            style="padding:8px 16px;border:none;border-radius:8px;background:var(--accent);color:#fff;font-size:14px;font-weight:bold;cursor:pointer;">שמירה ✓</button>
                </div>
                ${lastHtml}
            </div>`;
    });

    html += '</div>';
    html += '<div id="journal-save-msg" style="font-size:15px;font-weight:bold;color:var(--main-green);text-align:center;padding:8px;min-height:20px;"></div>';

    container.innerHTML = html;

    container.querySelectorAll('.journal-chart-btn').forEach(btn => {
        btn.addEventListener('click', () => showStrengthChart(btn.dataset.exercise, userId));
    });

    container.querySelectorAll('.journal-save-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const exerciseName = btn.dataset.exercise;
            await autoSaveJournalEntries(dateStr, workoutLetter, exerciseName);
            btn.textContent = '✓ נשמר';
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
                y:  { type: 'linear', position: 'left',  min: 0, max: 100, ticks: { color: '#5b7cfa' }, title: { display: true, text: 'ק"ג' } },
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
        backdrop.innerHTML = `<div style="background:var(--bg-card);border-radius:14px;padding:19px 24px;text-align:center"><div style="font-size:1.55rem;font-weight:bold">🏆 שיא אישי חדש!</div><div style="font-size:1.2rem;font-weight:bold;margin-top:7px">${pr.name}</div><div style="font-size:1.15rem;margin-top:5px">${pr.weight} ק"ג × ${pr.reps} חזרות</div></div>`;
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
        if (!workout || !workout.length) return;

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
        workout.forEach((ex, i) => {
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
    el.value = saved || CLIENT.coachingGoal || '';
    el.addEventListener('input', () => {
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
let scannedPortions = { protein: 0, fat: 0, carbs: 0 };
let scannedGrams = { protein: 0, fat: 0, carbs: 0 };
let scannedItems = [];
let scannedImageBase64 = null;
let scannedImageMime = null;

function openFoodScanner() {
    const modal = document.getElementById('food-scanner-modal');
    modal.style.display = '';
    modal.classList.remove('hidden');
    document.getElementById('scanner-step-1').classList.remove('hidden');
    document.getElementById('scanner-step-2').classList.add('hidden');
    document.getElementById('scanner-loading').classList.add('hidden');
    document.getElementById('food-preview').classList.add('hidden');
    document.getElementById('scan-correction').value = '';
    scannedImageBase64 = null;
    scannedImageMime = null;
    scannedPortions = { protein: 0, fat: 0, carbs: 0 };
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

    const compressed = await compressImage(base64, mimeType);
    base64 = compressed.base64;
    mimeType = compressed.mimeType;

    const correctionNote = correction ? `שים לב: ${correction}. ` : '';
    const prompt = `${correctionNote}זהה את האוכל בתמונה והעריך כמויות בצורה מדויקת ככל האפשר.
הנחיות:
- העריך לפי גודל המנה הנראה בתמונה ביחס לצלחת/כלי
- השתמש בערכי מאגר USDA לחישוב מאקרו לפי גרמים
- אם לא ניתן לזהות בוודאות — העריך טווח ובחר את האמצע
- items חייב לכלול כל רכיב בנפרד (לדוגמה: אורז, חזה עוף, שמן)
- עבור כל פריט ב-items: חשב מאקרו לאותו פריט בלבד לפי USDA
- protein_g/fat_g/carbs_g ברמת ה-food = סכום כל הפריטים
החזר JSON בלבד, ללא טקסט נוסף:
{"food": "שם האוכל בעברית", "protein_g": X, "fat_g": X, "carbs_g": X, "items": [{"name": "שם מאכל", "grams": X, "protein_g": X, "fat_g": X, "carbs_g": X}, ...]}`;

    try {
        const { data: { session: _scanSession } } = await db.auth.getSession();
        if (!_scanSession) throw new Error('לא מחובר');
        const response = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_scanSession.access_token}` },
            body: JSON.stringify({
                model: 'gemini-2.5-flash-lite',
                payload: {
                    contents: [{
                        parts: [
                            { text: prompt },
                            { inline_data: { mime_type: mimeType, data: base64 } }
                        ]
                    }]
                }
            })
        });
        if (!response.ok) { const e = await response.json().catch(() => ({})); throw new Error(e.error || 'gemini error'); }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '', buffer = '';
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
        scannedItems = Array.isArray(result.items) ? result.items : [];

        document.getElementById('scan-food-name').textContent = `🍽️ ${result.food}`;
        document.getElementById('scan-portions').innerHTML =
            `<div style="display:flex; flex-direction:column; gap:6px;">` +
            `<div>🥩 חלבון: <b>${scannedPortions.protein} מנות</b> <span style="color:#888;font-size:13px;">(${scannedGrams.protein}g)</span></div>` +
            `<div>🍚 פחמימה: <b>${scannedPortions.carbs} מנות</b> <span style="color:#888;font-size:13px;">(${scannedGrams.carbs}g)</span></div>` +
            `<div>🥑 שומן: <b>${scannedPortions.fat} מנות</b> <span style="color:#888;font-size:13px;">(${scannedGrams.fat}g)</span></div>` +
            `</div>`;

        const detailsBtn = document.getElementById('scan-details-btn');
        const detailsBox = document.getElementById('scan-details-box');
        if (scannedItems.length > 0) {
            detailsBtn.classList.remove('hidden');
            detailsBox.innerHTML = scannedItems.map(item => `<div>${item.name} — ${Math.round(item.grams)}g</div>`).join('');
        } else {
            detailsBtn.classList.add('hidden');
        }
        detailsBox.classList.add('hidden');
        document.getElementById('scanner-loading').classList.add('hidden');
        document.getElementById('scanner-step-1').classList.add('hidden');
        document.getElementById('scanner-step-2').classList.remove('hidden');
    } catch (err) {
        document.getElementById('scanner-loading').classList.add('hidden');
        document.getElementById('scanner-step-1').classList.add('hidden');
        document.getElementById('scanner-step-2').classList.remove('hidden');
        document.getElementById('scan-food-name').textContent = '⚠️ לא הצלחתי לזהות את האוכל';
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

    const prompt = `הערת המשתמש לגבי מנה שזוהתה: "${correction}"

זהה מה המשתמש רוצה לשנות — שם הפריט וכמות חדשה — והחזר JSON בלבד:
{"name": "שם הפריט בעברית", "grams": X, "protein_g": X, "fat_g": X, "carbs_g": X}

חשב מאקרו לפריט החדש בלבד לפי USDA. אם לא ברור מה הפריט — נחש לפי ההקשר.`;

    try {
        const { data: { session: _s } } = await db.auth.getSession();
        if (!_s) throw new Error('לא מחובר');
        const response = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_s.access_token}` },
            body: JSON.stringify({
                model: 'gemini-2.5-flash-lite',
                payload: { contents: [{ parts: [{ text: prompt }] }] }
            })
        });
        if (!response.ok) throw new Error('gemini error');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '', buffer = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n'); buffer = lines.pop();
            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const js = line.slice(6).trim();
                if (!js || js === '[DONE]') continue;
                try { const p = JSON.parse(js); const t = p.candidates?.[0]?.content?.parts?.[0]?.text; if (t) fullText += t; } catch {}
            }
        }
        const jsonMatch = fullText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('no JSON');
        const changed = JSON.parse(jsonMatch[0]);

        // מחפש פריט קיים עם שם דומה ומחליף — אחרת מוסיף
        const idx = scannedItems.findIndex(i => i.name === changed.name);
        if (idx >= 0) {
            scannedItems[idx] = changed;
        } else {
            // ננסה להתאים לפי מילה ראשונה
            const firstWord = changed.name.split(' ')[0];
            const fuzzyIdx = scannedItems.findIndex(i => i.name.includes(firstWord) || firstWord.includes(i.name.split(' ')[0]));
            if (fuzzyIdx >= 0) scannedItems[fuzzyIdx] = changed;
            else scannedItems.push(changed);
        }

        // מחשב סכום מכל הפריטים בקוד — לא מסתמך על AI
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
        const detailsBtn = document.getElementById('scan-details-btn');
        const detailsBox = document.getElementById('scan-details-box');
        if (scannedItems.length > 0) { detailsBtn.classList.remove('hidden'); detailsBox.innerHTML = scannedItems.map(i => `<div>${i.name} — ${Math.round(i.grams)}g</div>`).join(''); }
        else { detailsBtn.classList.add('hidden'); }
        detailsBox.classList.add('hidden');
        document.getElementById('scan-correction').value = '';
    } catch {
        document.getElementById('scan-food-name').textContent = '⚠️ שגיאה בחישוב מחדש';
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

