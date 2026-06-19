// ===== יומן אימונים, ציון שבועי, היסטוריה, גרפים, רצף, גרף משקל =====

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
        const weeklyTarget = Object.values(CLIENT.workoutDays || {}).reduce((s, days) => s + days.length, 0) || CLIENT.workoutsPerWeek || 3;
        const targets = calcPortionTargets();

        const [{ data: workoutData }, { data: nutritionRows }, { data: weightData }] = await Promise.all([
            db.from('workout_performance_log').select('date')
              .eq('client_id', userId).gte('date', monStr).lte('date', sunStr),
            db.from('daily_nutrition').select('date, protein, carbs, fat')
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
            if (r.protein >= targets.protein && r.carbs >= targets.carbs && r.fat >= targets.fat) nutritionMet++;
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
                    <div>${hasWeight ? '✅' : '⚠️'} שקילה: ${hasWeight ? 'נשקלת השבוע ✓' : 'טרם נשקלת השבוע'}</div>
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

        // שליפה אחת לכל סוג נתון לכל הטווח (במקום פנייה נפרדת לכל שבוע) — מהיר בהרבה, אותן תוצאות בדיוק
        const [scoresRes, wkRes, nutRes, wtRes] = await Promise.all([
            db.from('weekly_scores').select('week_start, score').eq('client_id', userId).gte('week_start', rangeStart).lt('week_start', curStart),
            db.from('workout_performance_log').select('date').eq('client_id', userId).gte('date', rangeStart).lte('date', curEnd),
            db.from('daily_nutrition').select('date,protein,carbs,fat').eq('user_id', userId).gte('date', rangeStart).lte('date', curEnd),
            db.from('weight_history').select('date').eq('user_id', userId).gte('date', rangeStart).lte('date', curEnd),
        ]);
        if (getActiveUserId() !== userId) return;

        const storedMap = new Map((scoresRes.data || []).map(r => [r.week_start, r.score]));
        const wkRows  = wkRes.data  || [];
        const nutRows = nutRes.data || [];
        const wtRows  = wtRes.data  || [];

        // חישוב ציון שבוע מהנתונים שכבר נשלפו (בזיכרון, בלי פניות נוספות) — אותה נוסחה
        const scoreFromMem = (start, end) => {
            const days = new Set(wkRows.filter(r => r.date >= start && r.date <= end).map(r => r.date)).size;
            let nutMet = 0;
            nutRows.forEach(r => {
                if (r.date >= start && r.date <= end && r.protein >= targets2.protein && r.carbs >= targets2.carbs && r.fat >= targets2.fat) nutMet++;
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

function resetWorkout() {
    const activeBtn = document.querySelector('.workout-nav-btn.active');
    const activeLetter = activeBtn?.getAttribute('onclick')?.match(/'([A-G])'/)?.[1];
    if (!activeLetter) return;

    const progress = _ensureWorkoutCache().exercises;
    Object.keys(progress).forEach(key => { if (key.startsWith(activeLetter + '_')) delete progress[key]; });
    if (typeof scheduleSyncWorkoutProgress === 'function') scheduleSyncWorkoutProgress();

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
    if (el) el.innerText = CLIENT.vacationMode ? streak + ' 🏖️' : streak;
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
        if (el) el.innerText = CLIENT.vacationMode ? streak + ' 🏖️' : streak;
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

async function completeNutritionStreak() {
    if (CLIENT.vacationMode) return;
    const today = localDateStr();
    if (_streaksCache.nutrition_completed_date === today) return;

    _streaksCache.nutrition_completed_date = today;
    let streak = (_streaksCache.nutrition_streak || 0) + 1;
    _streaksCache.nutrition_streak = streak;
    document.getElementById('nutrition-streak-count').innerText = streak;
    if (typeof syncStreaksNow === 'function') syncStreaksNow();
    if (streak === 7 && typeof _showAchievementPopup === 'function') _showAchievementPopup('streak_7_nutrition');
    if (typeof checkAchievements === 'function') checkAchievements(CLIENT, null, null, null);
    const uid = getActiveUserId();
    if (uid) {
        try { await sbSaveNutrition(uid, userPortions.protein, userPortions.carbs, userPortions.fat); } catch (_) {}
        if (typeof _trackingWidgetCache !== 'undefined') {
            delete _trackingWidgetCache['weekly_' + uid];
            if (typeof renderWeeklyScore === 'function') renderWeeklyScore(uid);
        }
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

    let streak = _streaksCache.nutrition_streak || 0;
    const lastCompleted = _streaksCache.nutrition_completed_date;

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
    const endDate = new Date(Math.max(
        new Date(CLIENT.startDate).setMonth(new Date(CLIENT.startDate).getMonth() + 6),
        Date.now()
    ));
    endDate.setDate(endDate.getDate() + 14); // padding קטן בסוף

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
    ctx.textBaseline = 'top';
    const totalMonths = (endDate.getFullYear() - startDate.getFullYear()) * 12 + endDate.getMonth() - startDate.getMonth();
    const skipEvery = totalMonths > 12 ? 3 : totalMonths > 8 ? 2 : 1;
    const tickStart = new Date(startDate);
    tickStart.setDate(1);
    tickStart.setMonth(tickStart.getMonth() + 1);
    let tickIdx = 0;
    let prevX = -999;
    while (tickStart <= endDate) {
        if (tickIdx % skipEvery === 0) {
            const x = toX(tickStart.toISOString().split('T')[0]);
            if (x >= pad.left + 10 && x <= W - pad.right - 10 && x - prevX > 30) {
                ctx.textAlign = 'center';
                ctx.fillText(months[tickStart.getMonth()], x, H - 30);
                prevX = x;
            }
        }
        tickStart.setMonth(tickStart.getMonth() + 1);
        tickIdx++;
    }

    // קו תחילת ליווי + תווית בציר התחתון
    const startX = toX(CLIENT.startDate);
    if (startX >= pad.left && startX <= W - pad.right) {
        ctx.save();
        ctx.strokeStyle = 'rgba(100,200,100,0.5)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(startX, pad.top);
        ctx.lineTo(startX, H - pad.bottom);
        ctx.stroke();
        ctx.restore();
        // תאריך תחילת ליווי בציר התחתון
        const sd = new Date(CLIENT.startDate);
        const sdStr = `${sd.getDate()}.${sd.getMonth() + 1}.${String(sd.getFullYear()).slice(2)}`;
        ctx.fillStyle = 'rgba(100,200,100,0.9)';
        ctx.font = '600 10px Heebo';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(sdStr, startX, H - 30);
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

    points.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = colors.dotRing;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = colors.dot;
        ctx.fill();
    });

    // שמור נתוני נקודות ל-tooltip
    canvas._weightPoints = sorted.map((p, i) => ({ x: points[i].x, y: points[i].y, weight: p.weight, date: p.date }));

    // הוסף listener אחד בלבד
    if (!canvas._weightTooltipReady) {
        canvas._weightTooltipReady = true;
        const _showWeightTip = (e) => {
            const rect = canvas.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            const mx = clientX - rect.left;
            const my = clientY - rect.top;

            const pts = canvas._weightPoints || [];
            let nearest = null, minDist = 50;
            pts.forEach(p => {
                const d = Math.sqrt((p.x - mx) ** 2 + (p.y - my) ** 2);
                if (d < minDist) { minDist = d; nearest = p; }
            });

            document.getElementById('weight-chart-tip')?.remove();
            if (!nearest) return;

            const monthNames = ['ינו','פבר','מרץ','אפר','מאי','יונ','יול','אוג','ספט','אוק','נוב','דצמ'];
            const dt = new Date(nearest.date);
            const dateStr = `${dt.getDate()} ${monthNames[dt.getMonth()]} ${dt.getFullYear()}`;

            const tip = document.createElement('div');
            tip.id = 'weight-chart-tip';
            tip.innerHTML = `<div style="font-size:11px;color:var(--text-secondary);margin-bottom:2px">${dateStr}</div><div style="font-size:15px;font-weight:700">${nearest.weight} ק"ג</div>`;
            tip.style.cssText = 'position:fixed;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:6px 12px;pointer-events:none;z-index:99999;text-align:center;box-shadow:0 4px 14px rgba(0,0,0,0.35);direction:rtl;';
            document.body.appendChild(tip);

            const tipW = 110;
            let left = rect.left + nearest.x - tipW / 2;
            let top  = rect.top  + nearest.y - 60;
            left = Math.max(8, Math.min(left, window.innerWidth - tipW - 8));
            top  = Math.max(8, top);
            tip.style.left = left + 'px';
            tip.style.top  = top  + 'px';

            clearTimeout(canvas._tipTimer);
            canvas._tipTimer = setTimeout(() => tip.remove(), 2500);
        };
        canvas.addEventListener('click', _showWeightTip);
        canvas.addEventListener('touchstart', _showWeightTip, { passive: true });
    }
}

// חיפוש בטבלת USDA — מחזיר ערכים ל-100 גרם אם נמצא
