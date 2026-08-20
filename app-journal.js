// ===== יומן אימונים, ציון שבועי, היסטוריה, גרפים, רצף, גרף משקל =====

const _JOURNAL_OK = '<span style="display:inline-flex;width:16px;height:16px;border-radius:50%;background:#22c55e;align-items:center;justify-content:center;vertical-align:-3px;flex-shrink:0;"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="white" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg></span>';
const _JOURNAL_WARN = '<span style="display:inline-flex;color:#f59e0b;vertical-align:-3px;flex-shrink:0;"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M10.3 3.9L2.5 18a1.5 1.5 0 0 0 1.3 2.2h16.4a1.5 1.5 0 0 0 1.3-2.2L13.7 3.9a1.5 1.5 0 0 0-2.6 0z"/><circle cx="12" cy="16.5" r="0.6" fill="currentColor" stroke="none"/></svg></span>';

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
        document.getElementById('weight-progress-bar').style.width = percent + '%';
        const pt = document.getElementById('weight-progress-text');
        pt.innerText = 'עברת כבר ' + percent + '% מהדרך ליעד!';
        pt.style.visibility = 'visible';
    }
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
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return { monStr: fmt(sun), sunStr: fmt(sat) };
}

function buildStars(score0to5) {
    const rounded = Math.round(score0to5 * 2) / 2;
    const STAR_PATH = 'M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z';
    let s = '';
    for (let i = 1; i <= 5; i++) {
        if (rounded >= i) {
            s += `<svg viewBox="0 0 24 24" width="22" height="22" fill="var(--accent)" style="vertical-align:-5px"><path d="${STAR_PATH}"/></svg>`;
        } else if (rounded >= i - 0.5) {
            const id = 'starHalf' + i + '_' + Math.random().toString(36).slice(2, 8);
            s += `<svg viewBox="0 0 24 24" width="22" height="22" style="vertical-align:-5px"><defs><clipPath id="${id}"><rect x="0" y="0" width="12" height="24"/></clipPath></defs><path d="${STAR_PATH}" fill="var(--text-muted)"/><path d="${STAR_PATH}" fill="var(--accent)" clip-path="url(#${id})"/></svg>`;
        } else {
            s += `<svg viewBox="0 0 24 24" width="22" height="22" fill="var(--text-muted)" style="vertical-align:-5px"><path d="${STAR_PATH}"/></svg>`;
        }
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
        const weeklyTarget = Object.values(CLIENT.workoutDays || {}).reduce((s, days) => s + days.length, 0) || CLIENT.workoutsPerWeek || 3;
        const targets = calcPortionTargets();

        const [{ data: workoutData }, { data: nutritionRows }, { data: weightData }] = await Promise.all([
            db.from('workout_performance_log').select('date')
              .eq('client_id', userId).gte('date', monStr).lte('date', sunStr),
            db.from('daily_nutrition').select('date, protein:protein_g, carbs:carbs_g, fat:fat_g')
              .eq('user_id', userId).gte('date', monStr).lte('date', sunStr),
            db.from('weight_history').select('date')
              .eq('user_id', userId).gte('date', monStr).lte('date', sunStr).limit(1),
        ]);
        if (getActiveUserId() !== userId) return;

        const workoutDates = new Set((workoutData || []).map(r => r.date));

        const workoutCount = workoutDates.size;
        const workoutScore = Math.min(workoutCount / weeklyTarget, 1);

        let nutritionMet = 0;
        (nutritionRows || []).forEach(r => {
            if (r.protein >= targets.proteinGrams && r.carbs >= targets.carbsGrams && r.fat >= targets.fatGrams) nutritionMet++;
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
                <div style="font-weight:bold;font-size:0.9rem;color:var(--text-secondary);margin-bottom:10px;display:flex;align-items:center;gap:6px;"><svg viewBox="0 0 24 24" width="14" height="14" fill="var(--accent)"><rect x="4" y="13" width="4" height="7" rx="1"/><rect x="10" y="8" width="4" height="12" rx="1"/><rect x="16" y="4" width="4" height="16" rx="1"/></svg> ציון שבועי &nbsp;|&nbsp; ${weekLabel}</div>
                <div style="font-size:1.5rem;text-align:center;margin-bottom:10px;direction:ltr;">${stars}&nbsp;<span style="font-size:1.1rem;font-weight:bold;">${pct}%</span></div>
                <div style="font-size:0.88rem;display:flex;flex-direction:column;gap:6px;color:var(--text-primary);">
                    <div>${workoutScore >= 1 ? _JOURNAL_OK : _JOURNAL_WARN} אימונים: ${workoutCount}/${weeklyTarget} השבוע &nbsp;<span style="color:var(--text-secondary)">(${Math.round(workoutScore*100)}%)</span></div>
                    <div>${nutritionMet >= Math.ceil(7 * 0.6) ? _JOURNAL_OK : _JOURNAL_WARN} תזונה: ${nutritionMet}/7 ימים עמדו ביעד &nbsp;<span style="color:var(--text-secondary)">(${Math.round(nutritionScore*100)}%)</span></div>
                    <div>${hasWeight ? _JOURNAL_OK : _JOURNAL_WARN} שקילה: ${hasWeight ? 'נשקלת השבוע <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M5 13l4 4L19 7"/></svg>' : 'טרם נשקלת השבוע'}</div>
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
        const fmt      = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const fmtLabel = d => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;

        // ראשון של השבוע הנוכחי
        const thisSun = new Date(today);
        thisSun.setDate(today.getDate() - dow);
        thisSun.setHours(0, 0, 0, 0);

        // פרמטרים משותפים לחישוב ציון (זהים לנוסחה בכל מקום)
        const weeklyTarget = Object.values(CLIENT.workoutDays || {}).reduce((s, days) => s + days.length, 0) || CLIENT.workoutsPerWeek || 3;
        const targets2 = calcPortionTargets();

        // רצף קבוע: 7 שבועות עבר + השבוע הנוכחי, לפי תאריך — אף שבוע לא מדולג
        const PAST_WEEKS = 7;
        const weeks = [];
        for (let i = PAST_WEEKS; i >= 1; i--) {
            const s = new Date(thisSun.getTime() - i * 7 * 86400000);
            const e = new Date(s.getTime() + 6 * 86400000);
            weeks.push({ start: fmt(s), end: fmt(e), label: fmtLabel(s), current: false });
        }
        const curStart = fmt(thisSun);
        const curEnd   = fmt(new Date(thisSun.getTime() + 6 * 86400000));
        const allWeeks = [...weeks, { start: curStart, end: curEnd, label: 'השבוע', current: true }];
        const rangeStart = weeks[0].start; // השבוע הישן ביותר

        // שלב 1: הציונים השמורים לשבועות עבר (נכתבים סופית ע"י cron, לעולם לא נדרסים)
        const scoresRes = await db.from('weekly_scores').select('week_start, score').eq('client_id', userId).gte('week_start', rangeStart).lt('week_start', curStart);
        if (getActiveUserId() !== userId) return;
        const storedMap = new Map((scoresRes.data || []).map(r => [r.week_start, r.score]));

        // שלב 2: דאטה גולמי נשלף רק מהשבוע הראשון בלי ציון שמור ואילך (בד"כ רק השבוע הנוכחי) — לא על כל הטווח
        const missingWeek = weeks.find(w => !storedMap.has(w.start));
        const rawStart = missingWeek ? missingWeek.start : curStart;

        const [wkRes, nutRes, wtRes] = await Promise.all([
            db.from('workout_performance_log').select('date').eq('client_id', userId).gte('date', rawStart).lte('date', curEnd),
            db.from('daily_nutrition').select('date,protein:protein_g,carbs:carbs_g,fat:fat_g').eq('user_id', userId).gte('date', rawStart).lte('date', curEnd),
            db.from('weight_history').select('date').eq('user_id', userId).gte('date', rawStart).lte('date', curEnd),
        ]);
        if (getActiveUserId() !== userId) return;

        const wkRows  = wkRes.data  || [];
        const nutRows = nutRes.data || [];
        const wtRows  = wtRes.data  || [];

        // חישוב ציון שבוע מהנתונים שכבר נשלפו (בזיכרון, בלי פניות נוספות) — אותה נוסחה
        const scoreFromMem = (start, end) => {
            const days = new Set(wkRows.filter(r => r.date >= start && r.date <= end).map(r => r.date)).size;
            let nutMet = 0;
            nutRows.forEach(r => {
                if (r.date >= start && r.date <= end && r.protein >= targets2.proteinGrams && r.carbs >= targets2.carbsGrams && r.fat >= targets2.fatGrams) nutMet++;
            });
            const hasWt = wtRows.some(r => r.date >= start && r.date <= end);
            return Math.round((
                Math.min(days / weeklyTarget, 1) * 0.4 +
                Math.min(nutMet / 7, 1) * 0.4 +
                (hasWt ? 1 : 0) * 0.2
            ) * 100);
        };

        // עבר: ציון שמור אם קיים, אחרת חי. נוכחי: תמיד חי (דינמי).
        const computed = allWeeks.map(w => ({
            label: w.label,
            current: w.current,
            score: (!w.current && storedMap.has(w.start)) ? storedMap.get(w.start) : scoreFromMem(w.start, w.end),
        }));

        // קיצוץ שבועות פתיחה עם ציון 0 (לפני שהלקוח התחיל), תמיד שומרים את השבוע הנוכחי
        const firstReal = computed.findIndex(w => w.score > 0 || w.current);
        const visible = firstReal >= 0 ? computed.slice(firstReal) : computed.slice(-1);

        await loadChartJs();
        if (getActiveUserId() !== userId) return;

        container.innerHTML = `
            <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px;direction:rtl;">
                <div style="font-weight:bold;font-size:0.9rem;color:var(--text-secondary);margin-bottom:12px;display:flex;align-items:center;gap:6px;"><span style="display:inline-flex;width:20px;height:20px;border-radius:50%;background:var(--tag-bg);align-items:center;justify-content:center;flex-shrink:0;"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg></span>היסטוריית ציונים שבועיים</div>
                <canvas id="score-history-canvas"></canvas>
            </div>`;

        const goalLabelPlugin = {
            id: 'goalLabel',
            afterDraw(chart) {
                const yScale = chart.scales.y;
                const y = yScale.getPixelForValue(80);
                const { ctx: c, chartArea } = chart;
                c.save();
                c.fillStyle = 'rgba(59,130,246,0.85)';
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
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59,130,246,0.08)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: visible.map(w => w.current ? 8 : 5),
                    pointHoverRadius: 10,
                    pointBackgroundColor: visible.map(w => w.current ? '#fff' : '#3b82f6'),
                    pointBorderColor: visible.map(w => w.current ? '#3b82f6' : '#fff'),
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
                            color: c => c.tick.value === 80 ? 'rgba(99,102,241,0.5)' : 'rgba(128,128,128,0.1)',
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
                <div style="font-weight:bold;font-size:0.9rem;color:var(--text-secondary);margin-bottom:8px;display:flex;align-items:center;gap:6px;"><span style="display:inline-flex;width:20px;height:20px;border-radius:50%;background:var(--tag-bg);align-items:center;justify-content:center;flex-shrink:0;"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg></span>היסטוריית ציונים שבועיים</div>
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

    const dayLetters = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
    const monthNames = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
    const selDate = new Date(dateStr + 'T12:00:00');
    const sunday = new Date(selDate);
    sunday.setDate(selDate.getDate() - selDate.getDay());
    const weekDays = [0, 1, 2, 3, 4, 5, 6].map(i => {
        const d = new Date(sunday);
        d.setDate(sunday.getDate() + i);
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return { ds, letter: dayLetters[i], disabled: ds < startDate || ds > maxDate };
    });
    const weekRow = weekDays.map(w => `
        <button class="workout-nav-btn${w.ds === dateStr ? ' active' : ''}" ${w.disabled ? 'disabled' : ''} onclick="journalSelectDate('${w.ds}')">${w.letter}</button>
    `).join('');

    let html = `
        <div class="workout-selector">${weekRow}</div>
        <div class="journal-datebar">
            <div class="journal-date-capsule">
                <button onclick="journalPrevDay()" ${atMin ? 'disabled' : ''} aria-label="יום קודם"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></button>
                <button class="journal-date-mid" onclick="toggleJournalCal()">${selDate.getDate()} ב${monthNames[selDate.getMonth()]}</button>
                <button onclick="journalNextDay()" ${atMax ? 'disabled' : ''} aria-label="יום הבא"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg></button>
            </div>
            ${!isToday ? '<button class="journal-today-btn" onclick="journalGoToday()"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>היום</button>' : ''}
            <div id="journal-calendar" style="display:none;position:absolute;top:calc(100% + 8px);left:50%;transform:translateX(-50%);z-index:1000;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:12px;min-width:280px;box-shadow:0 4px 20px rgba(0,0,0,0.2);"></div>
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

    html += `<div class="journal-workout-label">אימון ליום ${_CWE_DAY_NAMES[selDate.getDay()]}</div>`;
    html += `<div class="journal-hint">יש להזין משקל וחזרות מהסט הטוב ביותר באימון הנוכחי</div>`;
    html += '<div id="journal-exercises">';

    exercises.forEach((ex, idx) => {
        const saved = savedEntries[ex.name] || {};
        const last = lastEntries[ex.name];
        const lastHtml = last
            ? `<div class="journal-last-entry">קודם ${journalFormatShortDate(last.date)}: ${last.weight_kg} ק"ג ל-${last.reps} חזרות</div>`
            : `<div class="journal-last-entry journal-last-empty">אין רשומה קודמת</div>`;
        const isSaved = saved.weight_kg != null;
        html += `
            <div class="journal-ex-card${isSaved ? ' journal-ex-saved' : ''}">
                <div class="journal-ex-header">
                    <span class="journal-ex-num">${isSaved ? '✓' : idx + 1}</span>
                    <span class="journal-ex-name">${ex.name}</span>
                    <button class="journal-hist-btn" data-exercise="${ex.name}"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><rect x="4" y="13" width="4" height="7" rx="1"/><rect x="10" y="8" width="4" height="12" rx="1"/><rect x="16" y="4" width="4" height="16" rx="1"/></svg>היסטוריה</button>
                </div>
                ${lastHtml}
                <div class="journal-ex-body">
                    <div class="journal-ex-inputs">
                        <div class="journal-ex-field">
                            <span class="journal-ex-field-label">משקל</span>
                            <input type="number" class="journal-weight-input journal-ex-input" data-exercise="${ex.name}"
                                   value="${saved.weight_kg ?? ''}" min="0" step="0.5">
                        </div>
                        <div class="journal-ex-field">
                            <span class="journal-ex-field-label">חזרות</span>
                            <input type="number" class="journal-reps-input journal-ex-input" data-exercise="${ex.name}"
                                   value="${saved.reps ?? ''}" min="0" step="1">
                        </div>
                        <button class="journal-save-btn" data-exercise="${ex.name}">שמירה <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M5 13l4 4L19 7"/></svg></button>
                    </div>
                </div>
            </div>`;
    });

    html += '</div>';
    html += '<div id="journal-save-msg" style="font-size:15px;font-weight:bold;color:var(--main-green);text-align:center;padding:8px;min-height:20px;"></div>';

    container.innerHTML = html;

    container.querySelectorAll('.journal-ex-header').forEach(header => {
        header.addEventListener('click', (e) => {
            if (e.target.closest('.journal-hist-btn')) return;
            header.closest('.journal-ex-card').classList.toggle('open');
        });
    });

    container.querySelectorAll('.journal-hist-btn').forEach(btn => {
        btn.addEventListener('click', () => showStrengthChart(btn.dataset.exercise, userId));
    });

    container.querySelectorAll('.journal-save-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const exerciseName = btn.dataset.exercise;
            await autoSaveJournalEntries(dateStr, workoutLetter, exerciseName);
            btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M5 13l4 4L19 7"/></svg> נשמר';
            btn.closest('.journal-ex-card').classList.add('journal-ex-saved');
            setTimeout(() => { btn.innerHTML = 'שמירה <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M5 13l4 4L19 7"/></svg>'; }, 2000);
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
        if (cal && !cal.contains(e.target) && !e.target.closest('.journal-date-mid')) {
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

function journalSelectDate(dateStr) {
    const startDate = CLIENT.startDate || localDateStr();
    const maxDate = new Date(new Date(startDate + 'T12:00:00').getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    if (dateStr < startDate || dateStr > maxDate) return;
    journalSelectedDate = dateStr;
    renderJournalForDate(dateStr);
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

function _journalNiceAxisMax(maxValue) {
    const candidates = [5, 10, 15, 20, 25, 30, 40, 50, 60, 80, 100, 120, 150, 200, 250, 300, 400, 500, 750, 1000];
    const target = Math.max(maxValue, 1) * 1.15;
    for (const c of candidates) { if (c >= target) return c; }
    return Math.ceil(target / 100) * 100;
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
    window._dynamicOverlayOpen();

    const close = (e) => {
        if (e.target === overlay || e.target.id === 'close-chart-btn') {
            overlay.remove();
            window._dynamicOverlayClosed();
        }
    };
    overlay.addEventListener('click', close);

    if (error || !data || !data.length) {
        modal.innerHTML = `
            <button id="close-chart-btn" style="position:absolute;top:10px;left:10px;background:none;border:none;cursor:pointer;color:var(--text-primary);display:flex;"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
            <div style="font-weight:bold;font-size:1.1rem;text-align:center;margin-bottom:16px;direction:rtl;">${exerciseName}</div>
            <div style="text-align:center;padding:24px 0;color:var(--text-secondary);font-size:0.95rem;">אין נתונים להצגה</div>`;
        return;
    }

    modal.innerHTML = `
        <button id="close-chart-btn" style="position:absolute;top:10px;left:10px;background:none;border:none;cursor:pointer;color:var(--text-primary);display:flex;"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
        <div style="font-weight:bold;font-size:1.1rem;text-align:center;margin-bottom:16px;direction:rtl;">${exerciseName}</div>
        <canvas id="strength-chart-canvas"></canvas>`;

    const weightMax = _journalNiceAxisMax(Math.max(...data.map(r => r.weight_kg)));
    const repsMax = _journalNiceAxisMax(Math.max(...data.map(r => r.reps)));

    const ctx = modal.querySelector('#strength-chart-canvas').getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(r => r.date),
            datasets: [
                {
                    label: 'משקל',
                    data: data.map(r => r.weight_kg),
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59,130,246,0.15)',
                    fill: true,
                    tension: 0.3,
                    yAxisID: 'y',
                },
                {
                    label: 'חזרות',
                    data: data.map(r => r.reps),
                    borderColor: '#22c55e',
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
            plugins: {
                tooltip: {
                    titleAlign: 'center',
                    bodyAlign: 'center',
                    titleFont: { size: 12, weight: 'bold' },
                    bodyFont: { size: 12, weight: 'bold' },
                    padding: 10,
                    cornerRadius: 12,
                    usePointStyle: true,
                    boxWidth: 8,
                    boxHeight: 8,
                    boxPadding: 4,
                    callbacks: {
                        label: (c) => `${c.dataset.label}: ${c.formattedValue}`
                    }
                }
            },
            scales: {
                y:  { type: 'linear', position: 'left',  min: 0, max: weightMax, ticks: { color: '#3b82f6' }, title: { display: true, text: 'משקל', color: '#3b82f6' } },
                y2: { type: 'linear', position: 'right', min: 0, max: repsMax,  grid: { drawOnChartArea: false }, ticks: { color: '#22c55e', precision: 0 }, title: { display: true, text: 'חזרות', color: '#22c55e' } }
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
            msg.innerHTML = 'נשמר <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M5 13l4 4L19 7"/></svg>';
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
        backdrop.innerHTML = `<div style="background:var(--bg-card);border-radius:14px;padding:19px 24px;text-align:center"><div style="font-size:1.55rem;font-weight:bold"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-4px"><path d="M8 4h8v4a4 4 0 0 1-8 0V4z"/><path d="M8 5H5a3 3 0 0 0 3 5"/><path d="M16 5h3a3 3 0 0 1-3 5"/><path d="M10 13v3"/><path d="M14 13v3"/><path d="M7 20h10"/><path d="M9 20c0-2 .5-3 3-3s3 1 3 3"/></svg> שיא אישי חדש!</div><div style="font-size:1.2rem;font-weight:bold;margin-top:7px">${pr.name}</div><div style="font-size:1.15rem;margin-top:5px">משקל ${pr.weight} × ${pr.reps} חזרות</div></div>`;
        document.body.appendChild(backdrop);
        window._dynamicOverlayOpen();
        let closed = false;
        const close = () => { if (closed) return; closed = true; backdrop.remove(); window._dynamicOverlayClosed(); showNext(); };
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
            msg.innerHTML = _JOURNAL_OK + ' נשמר בהצלחה!';
            setTimeout(() => { if (msg) msg.textContent = ''; }, 2500);
        }
    } catch (err) {
        console.error('Journal save error:', err);
        const msg = document.getElementById('journal-save-msg');
        if (msg) { msg.style.color = '#e55'; msg.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg> שגיאה בשמירה'; }
    }
}

