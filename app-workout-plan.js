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
            if (wCell.querySelector('input')) return;
            const current = wCell.innerText.replace(/[^\d.]/g, '');
            const input = document.createElement('input');
            input.type = 'number';
            input.value = current || '';
            input.style.cssText = 'width:60px;text-align:center;border:1px solid var(--main-green);border-radius:4px;padding:2px;font-size:16px;';
            wCell.innerText = '';
            wCell.appendChild(input);
            input.focus();
            input.onblur = function() {
                const val = this.value.trim();
                wCell.innerText = val || '';
                const _uid = getActiveUserId();
                if (val && _uid) localStorage.setItem('workout_weight_' + exKey + '_' + _uid, val);
            };
            input.onkeydown = function(e) { if (e.key === 'Enter') this.blur(); };
        };
        // only fall back to localStorage when no Supabase target exists
        if (!targets[exerciseName]) {
            const _uid = getActiveUserId();
            const saved = _uid ? localStorage.getItem('workout_weight_' + exKey + '_' + _uid) : null;
            if (saved) weightCell.innerText = saved;
        }
    });
}

async function resetWorkout() {
    const day = window._selectedWorkoutDay ?? new Date().getDay();
    const activeLetter = _cweLetterForDay(day);
    if (!activeLetter) return;

    const confirmed = await showConfirmDanger('לאפס את כל הסימונים שסימנת באימון הזה היום?');
    if (!confirmed) return;

    const progress = _ensureWorkoutCache().exercises;
    Object.keys(progress).forEach(key => { if (key.startsWith(activeLetter + '_')) delete progress[key]; });
    if (typeof scheduleSyncWorkoutProgress === 'function') scheduleSyncWorkoutProgress();

    document.querySelectorAll(`[data-id^="${activeLetter}_"]`).forEach(cb => cb.checked = false);
    document.querySelectorAll(`#workout-${activeLetter} .accord-checkbox`).forEach((cb, i) => {
        cb.checked = false;
        const header = cb.closest('.workout-accord-header');
        if (header) header.classList.remove('checked');
        const item = cb.closest('.workout-accord-item');
        if (item) item.classList.remove('checked');
        const numBadge = item?.querySelector('.accord-num');
        if (numBadge) numBadge.textContent = i + 1;
    });
}

const _ORDER_UP_ICON   = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>';
const _ORDER_DOWN_ICON  = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';

let _workoutReorderMode = false;

function _canReorderWorkout() {
    return !!(CLIENT.workoutSource && CLIENT.workoutSource !== 'admin');
}

function refreshWorkoutReorderToggle() {
    const btn = document.getElementById('workout-reorder-btn');
    if (!btn) return;
    if (_canReorderWorkout()) {
        btn.style.display = '';
    } else {
        btn.style.display = 'none';
        _workoutReorderMode = false;
        btn.classList.remove('active');
    }
}

function toggleWorkoutReorderMode() {
    if (!_canReorderWorkout()) return;
    _workoutReorderMode = !_workoutReorderMode;
    const btn = document.getElementById('workout-reorder-btn');
    if (btn) btn.classList.toggle('active', _workoutReorderMode);
    ['A', 'B', 'C', 'D', 'E', 'F', 'G'].forEach(letter => {
        if (CLIENT['workout' + letter]) _renderWorkoutTbody(letter, CLIENT['workout' + letter], _exerciseTargets || {});
    });
    initWorkoutTableWeights(_exerciseTargets || {});
    if (typeof initVideos === 'function') initVideos();
    if (typeof buildWorkoutAccordions === 'function') buildWorkoutAccordions(_exerciseTargets || {});
}

function _renderWorkoutTbody(letter, workout, targets) {
    const container = document.getElementById('workout-' + letter);
    if (!container) return;
    const tbody = container.querySelector('tbody');
    if (!tbody) return;
    const canReorder = _canReorderWorkout() && _workoutReorderMode;
    tbody.innerHTML = '';
    (workout || []).forEach((ex, i) => {
        const t = targets[ex.name];
        const weightDisplay = t
            ? `${t.target_weight}${t.suggest_increase ? ' <span style="color:#22c55e;font-size:0.9em;">↑</span>' : ''}`
            : '';
        const repsDisplay = t ? String(t.target_reps) : ex.reps;
        const subtext = t?.suggest_increase
            ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">מומלץ להוסיף קצת משקל</div>`
            : '';
        const orderCell = canReorder
            ? `<div class="workout-order-btns">
                    <button class="workout-order-btn" ${i === 0 ? 'disabled' : ''} onclick="moveWorkoutExercise('${letter}', ${i}, -1)" aria-label="הזז למעלה">${_ORDER_UP_ICON}</button>
                    <button class="workout-order-btn" ${i === workout.length - 1 ? 'disabled' : ''} onclick="moveWorkoutExercise('${letter}', ${i}, 1)" aria-label="הזז למטה">${_ORDER_DOWN_ICON}</button>
               </div>`
            : '';
        tbody.innerHTML += `
            <tr data-order-idx="${i}">
                <td><input type="checkbox" class="workout-checkbox" data-id="${letter}_${i}"></td>
                <td>${ex.name}</td>
                <td>${ex.warmupSets ?? 1}</td>
                <td>${ex.workSets ?? 2}</td>
                <td>${repsDisplay}</td>
                <td>${weightDisplay}${subtext}</td>
                <td class="video-cell"></td>
                <td>${orderCell}</td>
            </tr>`;
    });
}

function _flashMovedRows(letter, i, j) {
    const container = document.getElementById('workout-' + letter);
    if (!container) return;
    [i, j].forEach(idx => {
        const els = [
            container.querySelector(`tr[data-order-idx="${idx}"]`),
            container.querySelector(`.workout-accord-item:nth-child(${idx + 1})`),
        ];
        els.forEach(el => {
            if (!el) return;
            el.classList.add('order-flash');
            setTimeout(() => el.classList.remove('order-flash'), 450);
        });
    });
}

function _flipAnimate(el, deltaY) {
    if (!el || !deltaY) return;
    el.style.transition = 'none';
    el.style.transform = `translateY(${deltaY}px)`;
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            el.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
            el.style.transform = '';
        });
    });
}

function _slideSwapPair(beforeI, beforeJ, afterI, afterJ) {
    if (beforeI == null || beforeJ == null) return;
    _flipAnimate(afterI, beforeJ - beforeI);
    _flipAnimate(afterJ, beforeI - beforeJ);
}

function moveWorkoutExercise(letter, index, direction) {
    if (!_canReorderWorkout()) return;
    const arr = CLIENT['workout' + letter];
    if (!Array.isArray(arr)) return;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= arr.length) return;

    const container = document.getElementById('workout-' + letter);
    const beforeTableI  = container?.querySelector(`tr[data-order-idx="${index}"]`)?.getBoundingClientRect().top;
    const beforeTableJ  = container?.querySelector(`tr[data-order-idx="${newIndex}"]`)?.getBoundingClientRect().top;
    const beforeAccordI = container?.querySelector(`.workout-accord-item:nth-child(${index + 1})`)?.getBoundingClientRect().top;
    const beforeAccordJ = container?.querySelector(`.workout-accord-item:nth-child(${newIndex + 1})`)?.getBoundingClientRect().top;

    [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];

    // המיקום (לא שם התרגיל) קובע את מזהה הצ'קבוקס, אז אחרי סידור מחדש מאפסים סימוני "בוצע" של האימון הזה כדי לא לשייך אותם לתרגיל הלא נכון
    const progress = _ensureWorkoutCache().exercises;
    Object.keys(progress).forEach(key => { if (key.startsWith(letter + '_')) delete progress[key]; });
    if (typeof scheduleSyncWorkoutProgress === 'function') scheduleSyncWorkoutProgress();

    _renderWorkoutTbody(letter, arr, _exerciseTargets || {});
    initWorkoutTableWeights(_exerciseTargets || {});
    if (typeof initVideos === 'function') initVideos();
    if (typeof buildWorkoutAccordions === 'function') buildWorkoutAccordions(_exerciseTargets || {});

    _slideSwapPair(
        beforeTableI, beforeTableJ,
        container?.querySelector(`tr[data-order-idx="${index}"]`),
        container?.querySelector(`tr[data-order-idx="${newIndex}"]`)
    );
    _slideSwapPair(
        beforeAccordI, beforeAccordJ,
        container?.querySelector(`.workout-accord-item:nth-child(${index + 1})`),
        container?.querySelector(`.workout-accord-item:nth-child(${newIndex + 1})`)
    );
    _flashMovedRows(letter, index, newIndex);
    if (typeof syncWorkoutPlanNow === 'function') syncWorkoutPlanNow();
}

async function initWorkoutsFromClient() {
    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const selector = document.getElementById('workout-selector');
    selector.innerHTML = '';

    const dayNames = ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'יום שבת'];
    const dayLetters = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

    const uid = getActiveUserId();
    if (uid) {
        try { _exerciseTargets = await getExerciseTargets(uid); } catch(e) { console.warn('getExerciseTargets failed', e); }
    }
    const targets = _exerciseTargets;

    const dayToLetter = {};
    letters.forEach(letter => {
        const workout = CLIENT['workout' + letter];
        const hasCardio = !!CLIENT.cardioPlan?.[letter]?.description;
        if ((!workout || !workout.length) && !hasCardio) return;

        // אימון בלי יום משויך הוא נתון פגום (תבנית ישנה/לא שלמה) — לא ניתן לתזמן אותו, אז לא מציגים אותו בבחירה
        const days = CLIENT.workoutDays?.[letter];
        if (!days || !days.length) return;

        days.forEach(d => { dayToLetter[d] = letter; });

        _renderWorkoutTbody(letter, workout, targets);

        const container = document.getElementById('workout-' + letter);
        if (container) container.style.display = 'none';
    });

    // בורר ימים: עיגול אחד לכל יום בשבוע שיש בו אימון כוח ו/או אירובי, בסדר לוח השנה (א׳ עד ש׳) — בלי גלילה, שורה אחת תמיד
    [0, 1, 2, 3, 4, 5, 6].forEach(d => {
        const hasLetter = !!dayToLetter[d];
        const hasCardio = !!CLIENT.cardioSchedule?.[d];
        if (!hasLetter && !hasCardio) return;
        const btn = document.createElement('button');
        btn.className = 'workout-nav-btn';
        btn.textContent = dayLetters[d];
        btn.title = dayNames[d];
        btn.dataset.day = d;
        btn.setAttribute('aria-label', dayNames[d]);
        btn.setAttribute('onclick', `showWorkoutDay(${d})`);
        selector.appendChild(btn);
    });

    initWorkoutsChecklist();
    refreshWorkoutReorderToggle();
    showWorkoutDay(new Date().getDay());
}

function showWeightUpdateToast() {
    const toast = document.createElement('div');
    toast.innerHTML = _JOURNAL_OK + ' המשקל עודכן!';
    toast.style.cssText = `
        position: fixed;
        bottom: 90px;
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
    const _cgUid = typeof getActiveUserId === 'function' ? getActiveUserId() : null;
    const saved = _cgUid ? localStorage.getItem('coaching_goal_' + _cgUid) : null;
    const rawGoal = saved || CLIENT.coachingGoal || '';
    el.value = rawGoal.slice(0, 300);
    el.addEventListener('input', () => {
        if (el.value.length > 300) el.value = el.value.slice(0, 300);
        const val = el.value.trim();
        if (_cgUid) localStorage.setItem('coaching_goal_' + _cgUid, val);
        if (typeof syncCoachingGoalNow === 'function') syncCoachingGoalNow(val);
    });
}

function updateVacationBanner() {
    const banner = document.getElementById('vacation-banner');
    if (banner) banner.style.display = CLIENT.vacationMode ? 'block' : 'none';
}

function updateWorkoutStreak() {
    // הצגה מיידית מהמטמון, ואז חישוב מחדש אסינכרוני מהשרת
    const streak = _streaksCache.workout_streak || 0;
    const el = document.getElementById('workout-streak-count');
    if (el) el.innerHTML = CLIENT.vacationMode ? streak + ' <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/></svg>' : streak;
    refreshWorkoutStreak();
}

async function refreshWorkoutStreak() {
    const uid = getActiveUserId();
    if (!uid || typeof sbFetchWorkoutStreak !== 'function') return;
    try {
        const streak = await sbFetchWorkoutStreak(uid);
        if (getActiveUserId() !== uid) return;
        _streaksCache.workout_streak = streak;
        const el = document.getElementById('workout-streak-count');
        if (el) el.innerHTML = CLIENT.vacationMode ? streak + ' <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/></svg>' : streak;
        if (typeof syncStreaksNow === 'function') syncStreaksNow();
    } catch (e) { console.warn('[streak] refresh failed:', e.message); }
}

function completeWorkoutStreak(letter) {
    if (CLIENT.vacationMode) return;
    const today = localDateStr();
    const uid = getActiveUserId();
    if (!uid) return;

    // סימון אימון כבוצע — פעם אחת ביום לכל אות אימון
    const doneGuard = 'workout_done_' + uid + '_' + today + '_' + letter;
    if (localStorage.getItem(doneGuard)) { refreshWorkoutStreak(); return; }
    localStorage.setItem(doneGuard, '1');

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
        refreshWorkoutStreak();
    }).catch(() => {});

    if (typeof checkAchievements === 'function') checkAchievements(CLIENT, null, null, null);
}

// מרנדר את מספר הרצף לתא (עם אייקון מזוודה במצב חופשה)
function _renderNutritionStreakUI(streak) {
    const el = document.getElementById('nutrition-streak-count');
    if (!el) return;
    if (CLIENT.vacationMode) {
        el.innerHTML = streak + ' <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/></svg>';
    } else {
        el.innerText = streak;
    }
}

// טווח הקלוריות ה"מוצלח" לפי מטרה: חיטוב מ-250 מתחת ליעד עד היעד, מסה מ-250 מתחת עד 250 מעליו,
// שמירה על המשקל ±150 סביב היעד. משמש גם להערכת הרצף וגם לחיווי הצבעוני על מסך התזונה היומי.
function _calorieRangeForGoal(goal, target) {
    if (goal === 'cut')      return { min: target - 250, max: target };
    if (goal === 'maintain') return { min: target - 150, max: target + 150 };
    return { min: target - 250, max: target + 250 }; // bulk
}

// היום נחשב מוצלח אם: חלבון הגיע לפחות ליעד (רצפה בלבד), וסך הקלוריות בטווח לפי המטרה
function _isNutritionDaySuccessful(row, targets) {
    if (!row) return false; // לא היה תיעוד אוכל באותו יום כלל
    const protein = row.protein_g || 0;
    const carbs   = row.carbs_g   || 0;
    const fat     = row.fat_g     || 0;
    const alcohol = row.alcohol_g || 0;
    if (protein < targets.protein) return false;

    const totalCalories = protein * 4 + carbs * 4 + fat * 9 + alcohol * 7;
    const { min, max } = _calorieRangeForGoal(CLIENT.goal, targets.totalCalories);
    return totalCalories >= min && totalCalories <= max;
}

function _addDaysToDateStr(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// מציג מיד את הרצף השמור, ואז מריץ הערכה של הימים האחרונים שעדיין לא הוערכו (מול הימים שכבר הסתיימו)
function updateNutritionStreak() {
    _renderNutritionStreakUI(_streaksCache.nutrition_streak || 0);
    if (!CLIENT.vacationMode) _evaluateNutritionStreak();
}

async function _evaluateNutritionStreak() {
    const uid = typeof getActiveUserId === 'function' ? getActiveUserId() : null;
    if (!uid) return;
    if (typeof window._getGramTargets !== 'function') return;
    const targets = window._getGramTargets();
    if (!(targets.protein > 0 && targets.totalCalories > 0)) return; // יעדים לא חושבו עדיין

    const today = localDateStr();
    const lastEvaluated = _streaksCache.nutrition_completed_date;

    // רשימת התאריכים שהסתיימו ועדיין לא הוערכו (מהיום שאחרי lastEvaluated ועד אתמול)
    let cursor = lastEvaluated ? _addDaysToDateStr(lastEvaluated, 1) : _addDaysToDateStr(today, -1);
    const datesToEvaluate = [];
    while (cursor < today) {
        datesToEvaluate.push(cursor);
        cursor = _addDaysToDateStr(cursor, 1);
    }
    if (datesToEvaluate.length === 0) return;
    // הגנה מפני פער ענק (לקוח חדש/לא נכנס הרבה זמן) — מספיק להעריך עד 30 יום אחורה
    const limited = datesToEvaluate.slice(-30);

    let streak = _streaksCache.nutrition_streak || 0;
    let reached7 = false;
    for (const dateStr of limited) {
        const row = typeof sbFetchNutritionByDate === 'function' ? await sbFetchNutritionByDate(uid, dateStr).catch(() => null) : null;
        if (_isNutritionDaySuccessful(row, targets)) {
            streak++;
            if (streak === 7) reached7 = true;
        } else {
            streak = 0;
        }
    }

    _streaksCache.nutrition_streak = streak;
    _streaksCache.nutrition_completed_date = limited[limited.length - 1];
    if (typeof syncStreaksNow === 'function') syncStreaksNow();
    if (reached7 && typeof _showAchievementPopup === 'function') _showAchievementPopup('streak_7_nutrition');
    if (typeof checkAchievements === 'function') checkAchievements(CLIENT, null, null, null);

    _renderNutritionStreakUI(streak);
}

