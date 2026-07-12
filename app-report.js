// ===== כרטיס התקדמות (תמונה לשיתוף/שמירה) =====

const _REPORT_COLORS = {
    bg: '#0a0a0f',
    panel: '#1c1c1e',
    panelAlt: '#2c2c2e',
    border: 'rgba(255,255,255,0.08)',
    textPrimary: '#f5f5f7',
    textSecondary: '#98989f',
    accent: '#3b82f6',
    accentSoft: 'rgba(59,130,246,0.15)',
    goal: '#f59e0b',
};

function canExportReport() {
    return !!CLIENT.isSubscriber;
}

function _loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

function _fmtDate(dateStr) {
    const d = new Date(dateStr);
    return `${d.getDate()}.${d.getMonth() + 1}.${String(d.getFullYear()).slice(2)}`;
}

// שמות התרגילים האמיתיים מתוכנית האימונים של הלקוח (workoutA/B/C ב-client.js).
// הטבלה עצמה עלולה להכיל שורות בדיקה ישנות עם שמות זרים (למשל "Bench Press") שלא שייכות ללקוח בכלל.
function _assignedExerciseNames() {
    const names = new Set();
    ['workoutA', 'workoutB', 'workoutC'].forEach(key => {
        (CLIENT[key] || []).forEach(ex => { if (ex && ex.name) names.add(ex.name); });
    });
    return names;
}

async function _fetchExerciseNames(userId) {
    const { data, error } = await db.from('workout_performance_log')
        .select('exercise_name').eq('client_id', userId);
    if (error || !data) return [];
    const assigned = _assignedExerciseNames();
    return [...new Set(data.map(r => r.exercise_name))].filter(n => assigned.has(n));
}

// בוחר את התרגילים עם השיפור הגדול ביותר במשקל (אחרון פחות ראשון), לא הערכת 1RM.
// minDataPoints הוא רק סף איכות נתונים (לא חלק מהניקוד) — תרגיל עם שיפור 0 לא נכנס בכלל
async function _selectTopExercises(userId, limit, minDataPoints) {
    const exerciseNames = await _fetchExerciseNames(userId);
    const candidates = [];
    for (const name of exerciseNames) {
        const { data, error } = await db.from('workout_performance_log')
            .select('date, weight_kg, reps')
            .eq('client_id', userId).eq('exercise_name', name)
            .order('date', { ascending: true });
        if (error || !data || data.length < minDataPoints) continue;
        const first = data[0].weight_kg || 0;
        const last = data[data.length - 1].weight_kg || 0;
        const improvement = last - first;
        if (improvement <= 0) continue;
        candidates.push({ name, data, dataPoints: data.length, first, last, improvement });
    }
    candidates.sort((a, b) => b.improvement - a.improvement);
    return candidates.slice(0, limit);
}

// הרצף הארוך ביותר אי-פעם (לא הרצף הנוכחי): שבועות רצופים שבהם עמד ביעד האימונים השבועי
function _longestWorkoutStreakWeeks(workoutDates) {
    if (!workoutDates.length) return 0;
    const weeklyTarget = Object.values(CLIENT.workoutDays || {}).reduce((s, days) => s + days.length, 0) || CLIENT.workoutsPerWeek || 3;
    const weekCounts = {};
    workoutDates.forEach(dateStr => {
        const d = new Date(dateStr);
        const sun = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
        const key = sun.toISOString().split('T')[0];
        weekCounts[key] = (weekCounts[key] || 0) + 1;
    });
    const weekKeys = Object.keys(weekCounts).sort();
    let maxRun = 0, curRun = 0;
    for (let d = new Date(weekKeys[0]); d <= new Date(weekKeys[weekKeys.length - 1]); d.setDate(d.getDate() + 7)) {
        const key = d.toISOString().split('T')[0];
        if ((weekCounts[key] || 0) >= weeklyTarget) {
            curRun++;
            maxRun = Math.max(maxRun, curRun);
        } else {
            curRun = 0;
        }
    }
    return maxRun;
}

// יעדי המנות היומיים הנוכחיים (מוצגים ב-DOM בטאב תזונה), משמשים גם לחישוב רצף וגם לסינון שורות לא סבירות
function _getNutritionTargets() {
    try {
        const p = parseFloat(document.getElementById('protein-target').innerText.replace('/ ', ''));
        const c = parseFloat(document.getElementById('carbs-target').innerText.replace('/ ', ''));
        const f = parseFloat(document.getElementById('fat-target').innerText.replace('/ ', ''));
        if (!p || !c || !f || isNaN(p) || isNaN(c) || isNaN(f)) return null;
        return { protein: p, carbs: c, fat: f };
    } catch (e) { return null; }
}

// שורות עם ערכים גבוהים באופן קיצוני מהיעד הן כנראה שורות בדיקה ישנות בטבלה, לא נתונים אמיתיים
function _filterPlausibleNutritionRows(rows, targets) {
    const CEILING_MULT = 3;
    const ceiling = key => targets ? targets[key] * CEILING_MULT : 20; // בלי יעד ידוע: תקרה סבירה גנרית
    return rows.filter(r =>
        (r.protein || 0) <= ceiling('protein') &&
        (r.carbs || 0) <= ceiling('carbs') &&
        (r.fat || 0) <= ceiling('fat')
    );
}

// הרצף הארוך ביותר אי-פעם: ימים רצופים שבהם הושג יעד המנות היומי (לפי היעד הנוכחי, הערכה)
function _longestNutritionStreakDays(nutritionRows, targets) {
    if (!targets) return null;
    const sorted = [...nutritionRows].sort((a, b) => new Date(a.date) - new Date(b.date));
    let maxRun = 0, curRun = 0, prevDate = null;
    sorted.forEach(row => {
        const complete = (row.protein || 0) >= targets.protein && (row.carbs || 0) >= targets.carbs && (row.fat || 0) >= targets.fat;
        const gapDays = prevDate ? (new Date(row.date) - prevDate) / 86400000 : null;
        if (complete) {
            curRun = (gapDays === 1) ? curRun + 1 : 1;
            maxRun = Math.max(maxRun, curRun);
        } else {
            curRun = 0;
        }
        prevDate = new Date(row.date);
    });
    return maxRun;
}

async function _fetchTrainingStats(userId, sinceDate) {
    const [wRes, nRes] = await Promise.all([
        db.from('workout_performance_log').select('date').eq('client_id', userId),
        db.from('daily_nutrition').select('date, protein, carbs, fat').eq('user_id', userId).gte('date', sinceDate),
    ]);
    const workoutDates = [...new Set((wRes.data || []).map(r => r.date))];
    const targets = _getNutritionTargets();
    const nutritionRows = _filterPlausibleNutritionRows(nRes.data || [], targets);
    const avg = key => nutritionRows.length
        ? nutritionRows.reduce((s, r) => s + (r[key] || 0), 0) / nutritionRows.length
        : 0;
    return {
        sessionCount: workoutDates.length,
        nutritionDaysLogged: nutritionRows.length,
        avgProtein: avg('protein'),
        avgCarbs: avg('carbs'),
        avgFat: avg('fat'),
        longestWorkoutStreakWeeks: _longestWorkoutStreakWeeks(workoutDates),
        longestNutritionStreakDays: _longestNutritionStreakDays(nutritionRows, targets),
    };
}

function _fmtNum(n) {
    return Number.isInteger(n) ? `${n}` : n.toFixed(1);
}

function _buildHighlightSentences(bodyWeightDelta, topExercise, stats) {
    const sentences = [];
    if (bodyWeightDelta != null && Math.abs(bodyWeightDelta) >= 0.1) {
        const dir = bodyWeightDelta > 0 ? 'עלית' : 'ירדת';
        sentences.push(`${dir} ${_fmtNum(Math.abs(bodyWeightDelta))} ק"ג במשקל הגוף מאז ההתחלה`);
    }
    if (topExercise && topExercise.improvement > 0) {
        sentences.push(`שיפרת את המשקל ב${topExercise.name} ב-${_fmtNum(topExercise.improvement)} מאז שהתחלת`);
    }
    if (stats.sessionCount > 0) {
        sentences.push(`בוצעו ${stats.sessionCount} אימונים מתועדים בתקופה`);
    }
    return sentences;
}

// ממוצע ציון שבועי והשבוע הכי טוב (ציון 0-100 מטבלת weekly_scores)
async function _fetchWeeklyScoreStats(userId) {
    const { data, error } = await db.from('weekly_scores')
        .select('week_start, score').eq('client_id', userId);
    if (error || !data || !data.length) return null;
    const avgScore = data.reduce((s, r) => s + (r.score || 0), 0) / data.length;
    const bestWeek = data.reduce((a, b) => (b.score || 0) > (a.score || 0) ? b : a);
    return { avgScore, bestWeek };
}

async function gatherCardData(userId) {
    const history = JSON.parse(sessionStorage.getItem('weight_history') || '[]')
        .filter(p => p.date && !isNaN(new Date(p.date).getTime()))
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    const topExercises = await _selectTopExercises(userId, 3, 2);
    const sinceDate = CLIENT.startDate || new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];
    const stats = await _fetchTrainingStats(userId, sinceDate);
    const weeklyScoreStats = await _fetchWeeklyScoreStats(userId);
    const streaks = window._streaksCache || {};
    const bodyWeightDelta = (typeof CLIENT.currentWeight === 'number' && typeof CLIENT.startWeight === 'number')
        ? CLIENT.currentWeight - CLIENT.startWeight : null;

    // הרצף המוצג הוא הרצף הכי ארוך אי-פעם, לא בהכרח הנוכחי
    const workoutStreak = Math.max(stats.longestWorkoutStreakWeeks, streaks.workout_streak || 0);
    const nutritionStreak = stats.longestNutritionStreakDays != null
        ? Math.max(stats.longestNutritionStreakDays, streaks.nutrition_streak || 0)
        : (streaks.nutrition_streak || 0);

    return {
        clientName: CLIENT.name || CLIENT.nickname || 'מתאמן',
        startDate: CLIENT.startDate || null,
        weightHistory: history,
        startWeight: CLIENT.startWeight,
        currentWeight: CLIENT.currentWeight,
        goalWeight: CLIENT.goalWeight,
        topExercises,
        stats,
        weeklyScoreStats,
        highlights: _buildHighlightSentences(bodyWeightDelta, topExercises[0], stats),
        workoutStreak,
        nutritionStreak,
        logoImg: await _loadImage('/OI.512.512.png').catch(() => null),
    };
}

function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
}

function _drawWeightPanel(ctx, data, x, y, w, h) {
    const C = _REPORT_COLORS;
    _roundRect(ctx, x, y, w, h, 24);
    ctx.fillStyle = C.panel;
    ctx.fill();

    const pad = 32;
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.textPrimary;
    ctx.font = '700 32px Heebo, sans-serif';
    ctx.fillText('משקל גוף', x + w - pad, y + 50);

    if (data.startDate) {
        ctx.fillStyle = C.textSecondary;
        ctx.font = '400 22px Heebo, sans-serif';
        ctx.fillText(`${_fmtDate(data.startDate)} — היום`, x + w - pad, y + 82);
    }

    const chartX = x + pad;
    const chartY = y + 110;
    const chartW = w - pad * 2;
    const chartH = 170;

    const history = data.weightHistory;
    const allWeights = [data.startWeight, data.goalWeight, data.currentWeight, ...history.map(p => p.weight)]
        .filter(v => typeof v === 'number' && !isNaN(v));

    if (!allWeights.length || !data.startDate) {
        ctx.fillStyle = C.textSecondary;
        ctx.font = '500 24px Heebo, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('אין עדיין מספיק נתוני משקל', x + w / 2, chartY + chartH / 2);
        return;
    }

    const dataMin = Math.min(...allWeights);
    const dataMax = Math.max(...allWeights);
    const yRange = Math.max(dataMax - dataMin, 6);
    const minY = Math.floor(dataMin - yRange * 0.2);
    const maxY = Math.ceil(dataMax + yRange * 0.2);

    const startDate = new Date(data.startDate);
    const endDate = new Date(Math.max(Date.now(), startDate.getTime() + 86400000));
    const toX = dateStr => chartX + ((new Date(dateStr) - startDate) / (endDate - startDate)) * chartW;
    const toY = weight => chartY + (1 - (weight - minY) / (maxY - minY)) * chartH;

    const step = yRange <= 15 ? 2 : yRange <= 30 ? 5 : 10;
    ctx.textBaseline = 'middle';
    for (let wgt = Math.ceil(minY / step) * step; wgt <= maxY; wgt += step) {
        const gy = toY(wgt);
        ctx.strokeStyle = C.border;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(chartX, gy);
        ctx.lineTo(chartX + chartW, gy);
        ctx.stroke();
        ctx.fillStyle = C.textSecondary;
        ctx.font = '500 18px Heebo, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(wgt + '', chartX - 8, gy);
    }

    if (typeof data.goalWeight === 'number') {
        const goalY = toY(data.goalWeight);
        ctx.save();
        ctx.strokeStyle = C.goal;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(chartX, goalY);
        ctx.lineTo(chartX + chartW, goalY);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = C.goal;
        ctx.font = '600 18px Heebo, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`יעד ${data.goalWeight}`, chartX + chartW, goalY - 6);
    }

    if (history.length > 1) {
        const points = history.map(p => ({ x: toX(p.date), y: toY(p.weight) }));
        const grad = ctx.createLinearGradient(0, chartY, 0, chartY + chartH);
        grad.addColorStop(0, C.accentSoft);
        grad.addColorStop(1, 'rgba(59,130,246,0)');
        ctx.beginPath();
        ctx.moveTo(points[0].x, chartY + chartH);
        points.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.lineTo(points[points.length - 1].x, chartY + chartH);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.strokeStyle = C.accent;
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.stroke();

        const last = points[points.length - 1];
        ctx.fillStyle = C.accent;
        ctx.beginPath();
        ctx.arc(last.x, last.y, 6, 0, Math.PI * 2);
        ctx.fill();
    } else if (history.length === 1) {
        const p = { x: toX(history[0].date), y: toY(history[0].weight) };
        ctx.fillStyle = C.accent;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.fill();
    }

    // שורת סיכום: התחלה / עכשיו / יעד
    const statsY = chartY + chartH + 46;
    const stats = [
        { label: 'התחלה', value: data.startWeight, color: C.textSecondary },
        { label: 'עכשיו', value: data.currentWeight, color: C.accent },
        { label: 'יעד', value: data.goalWeight, color: C.goal },
    ].filter(s => typeof s.value === 'number');

    const colW = chartW / stats.length;
    ctx.textAlign = 'center';
    stats.forEach((s, i) => {
        const cx = chartX + colW * i + colW / 2;
        ctx.fillStyle = s.color;
        ctx.font = '700 30px Heebo, sans-serif';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(`${s.value} ק"ג`, cx, statsY);
        ctx.fillStyle = C.textSecondary;
        ctx.font = '400 18px Heebo, sans-serif';
        ctx.fillText(s.label, cx, statsY + 26);
    });
}

function _drawExercisePanel(ctx, ex, x, y, w, h) {
    const C = _REPORT_COLORS;
    _roundRect(ctx, x, y, w, h, 20);
    ctx.fillStyle = C.panel;
    ctx.fill();

    const pad = 24;
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.textPrimary;
    ctx.font = '700 26px Heebo, sans-serif';
    ctx.fillText(ex.name, x + w / 2, y + 40);

    const chartX = x + pad;
    const chartY = y + 58;
    const chartW = w - pad * 2;
    const chartH = 110;

    const weights = ex.data.map(r => r.weight_kg || 0);
    const minW = Math.min(...weights);
    const maxW = Math.max(...weights);
    const range = Math.max(maxW - minW, 1);
    const points = weights.map((wgt, i) => ({
        x: chartX + (i / (weights.length - 1)) * chartW,
        y: chartY + (1 - (wgt - minW) / range) * chartH,
    }));

    const grad = ctx.createLinearGradient(0, chartY, 0, chartY + chartH);
    grad.addColorStop(0, C.accentSoft);
    grad.addColorStop(1, 'rgba(59,130,246,0)');
    ctx.beginPath();
    ctx.moveTo(points[0].x, chartY + chartH);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, chartY + chartH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = C.accent;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();

    const last = points[points.length - 1];
    ctx.fillStyle = C.accent;
    ctx.beginPath();
    ctx.arc(last.x, last.y, 5, 0, Math.PI * 2);
    ctx.fill();

    const textY = chartY + chartH + 40;
    ctx.textAlign = 'center';
    ctx.fillStyle = C.textSecondary;
    ctx.font = '400 20px Heebo, sans-serif';
    ctx.fillText(`מ-${ex.first} ל-${ex.last}`, x + w / 2, textY);

    if (ex.improvement !== 0) {
        const pct = ex.first ? Math.abs((ex.improvement / ex.first) * 100) : 0;
        const sign = ex.improvement > 0 ? '+' : '';
        ctx.fillStyle = ex.improvement > 0 ? C.accent : C.textSecondary;
        ctx.font = '700 24px Heebo, sans-serif';
        ctx.fillText(`${sign}${_fmtNum(ex.improvement)} (${pct.toFixed(0)}%)`, x + w / 2, textY + 32);
    }
}

function _drawHighlightsPanel(ctx, highlights, x, y, w, h) {
    const C = _REPORT_COLORS;
    _roundRect(ctx, x, y, w, h, 20);
    ctx.fillStyle = C.panel;
    ctx.fill();

    const pad = 32;
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    let ty = y + 48;
    highlights.forEach(line => {
        ctx.fillStyle = C.accent;
        ctx.beginPath();
        ctx.arc(x + w - pad - 4, ty - 9, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C.textPrimary;
        ctx.font = '600 28px Heebo, sans-serif';
        ctx.fillText(line, x + w - pad - 24, ty);
        ty += 52;
    });
}

function _drawMacrosPanel(ctx, data, x, y, w, h) {
    const C = _REPORT_COLORS;
    _roundRect(ctx, x, y, w, h, 20);
    ctx.fillStyle = C.panel;
    ctx.fill();

    const pad = 32;
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.textPrimary;
    ctx.font = '700 26px Heebo, sans-serif';
    ctx.fillText('ממוצע מנות ליום', x + w - pad, y + 44);

    const cols = [
        { label: 'חלבון', value: data.stats.avgProtein },
        { label: 'פחמימה', value: data.stats.avgCarbs },
        { label: 'שומן', value: data.stats.avgFat },
    ];
    const colY = y + h - 38;
    const colW = (w - pad * 2) / cols.length;
    ctx.textAlign = 'center';
    cols.forEach((c, i) => {
        const cx = x + w - pad - colW * i - colW / 2;
        ctx.fillStyle = C.accent;
        ctx.font = '700 32px Heebo, sans-serif';
        ctx.fillText(_fmtNum(c.value), cx, colY - 26);
        ctx.fillStyle = C.textSecondary;
        ctx.font = '400 18px Heebo, sans-serif';
        ctx.fillText(c.label, cx, colY);
    });
}

function _drawWeeklyScorePanel(ctx, data, x, y, w, h) {
    const C = _REPORT_COLORS;
    _roundRect(ctx, x, y, w, h, 20);
    ctx.fillStyle = C.panel;
    ctx.fill();

    const pad = 32;
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.textPrimary;
    ctx.font = '700 26px Heebo, sans-serif';
    ctx.fillText('ציונים שבועיים', x + w - pad, y + 44);

    const s = data.weeklyScoreStats;
    const colY = y + h - 38;
    const colW = (w - pad * 2) / 2;

    ctx.textAlign = 'center';
    const avgCx = x + w - pad - colW / 2;
    ctx.fillStyle = C.accent;
    ctx.font = '700 32px Heebo, sans-serif';
    ctx.fillText(Math.round(s.avgScore) + '', avgCx, colY - 26);
    ctx.fillStyle = C.textSecondary;
    ctx.font = '400 18px Heebo, sans-serif';
    ctx.fillText('ממוצע', avgCx, colY);

    const bestCx = x + w - pad - colW - colW / 2;
    ctx.fillStyle = C.accent;
    ctx.font = '700 32px Heebo, sans-serif';
    ctx.fillText(Math.round(s.bestWeek.score) + '', bestCx, colY - 26);
    ctx.fillStyle = C.textSecondary;
    ctx.font = '400 18px Heebo, sans-serif';
    ctx.fillText(`השבוע הכי טוב (${_fmtDate(s.bestWeek.week_start)})`, bestCx, colY);
}

function _drawStreakTiles(ctx, data, x, y, w, h) {
    const C = _REPORT_COLORS;
    const tiles = [
        { label: 'אימונים בתקופה', value: `${data.stats.sessionCount}` },
        { label: 'הרצף הכי ארוך: אימונים', value: `${data.workoutStreak} שבועות` },
        { label: 'הרצף הכי ארוך: תזונה', value: `${data.nutritionStreak} ימים` },
    ];
    const gap = 16;
    const tileW = (w - gap * (tiles.length - 1)) / tiles.length;
    tiles.forEach((t, i) => {
        const tx = x + w - (i + 1) * tileW - i * gap;
        _roundRect(ctx, tx, y, tileW, h, 18);
        ctx.fillStyle = C.panelAlt;
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = C.accent;
        ctx.font = '700 28px Heebo, sans-serif';
        ctx.fillText(t.value, tx + tileW / 2, y + h / 2 - 2);
        ctx.fillStyle = C.textSecondary;
        ctx.font = '400 16px Heebo, sans-serif';
        ctx.fillText(t.label, tx + tileW / 2, y + h / 2 + 26);
    });
}

async function buildProgressCardImage(data) {
    if (document.fonts && document.fonts.ready) {
        try { await document.fonts.ready; } catch (e) { /* ignore */ }
    }

    const C = _REPORT_COLORS;
    const W = 1080;
    const MARGIN = 40;
    const GAP = 24;
    const contentW = W - MARGIN * 2;

    const headerH = 130;
    const weightH = 400;
    const exercises = data.topExercises;
    const exercisesH = exercises.length ? 300 : 0;
    const highlightsH = data.highlights.length ? 60 + data.highlights.length * 52 : 0;
    const macrosH = 140;
    const weeklyScoreH = data.weeklyScoreStats ? 140 : 0;
    const streakTilesH = 110;

    const H = MARGIN + headerH + weightH + GAP
        + (exercisesH ? exercisesH + GAP : 0)
        + (highlightsH ? highlightsH + GAP : 0)
        + macrosH + GAP
        + (weeklyScoreH ? weeklyScoreH + GAP : 0)
        + streakTilesH + MARGIN;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    // כותרת
    if (data.logoImg) {
        _roundRect(ctx, MARGIN, MARGIN, 76, 76, 18);
        ctx.save();
        ctx.clip();
        ctx.drawImage(data.logoImg, MARGIN, MARGIN, 76, 76);
        ctx.restore();
    }
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.textPrimary;
    ctx.font = '700 42px Heebo, sans-serif';
    ctx.fillText(data.clientName, W - MARGIN, MARGIN + 40);
    ctx.font = '400 24px Heebo, sans-serif';
    ctx.fillStyle = C.textSecondary;
    ctx.fillText('כרטיס התקדמות', W - MARGIN, MARGIN + 76);

    let y = MARGIN + headerH;

    _drawWeightPanel(ctx, data, MARGIN, y, contentW, weightH);
    y += weightH + GAP;

    if (exercisesH) {
        const gap = 20;
        const colW = (contentW - gap * (exercises.length - 1)) / exercises.length;
        exercises.forEach((ex, i) => {
            const ex_x = MARGIN + i * (colW + gap);
            _drawExercisePanel(ctx, ex, ex_x, y, colW, exercisesH);
        });
        y += exercisesH + GAP;
    }

    if (highlightsH) {
        _drawHighlightsPanel(ctx, data.highlights, MARGIN, y, contentW, highlightsH);
        y += highlightsH + GAP;
    }

    _drawMacrosPanel(ctx, data, MARGIN, y, contentW, macrosH);
    y += macrosH + GAP;

    if (weeklyScoreH) {
        _drawWeeklyScorePanel(ctx, data, MARGIN, y, contentW, weeklyScoreH);
        y += weeklyScoreH + GAP;
    }

    _drawStreakTiles(ctx, data, MARGIN, y, contentW, streakTilesH);

    return canvas;
}

// הכרטיס נבנה כתמונה בזיכרון בלבד (קנבס בדפדפן) ומוצג בתצוגה מקדימה.
// שום דבר לא נשלח או נשמר בסופאבייס — רק שמירה/שיתוף מקומיים ביוזמת המשתמש.
let _progressCardBlob = null;
let _progressCardFilename = '';
let _progressCardObjectUrl = null;

async function exportProgressReport() {
    if (!canExportReport()) return;
    const userId = getActiveUserId();
    if (!userId) return;

    const btn = document.getElementById('export-report-btn');
    const origText = btn ? btn.textContent : '';
    if (btn) {
        btn.disabled = true;
        btn.style.opacity = '0.6';
        btn.textContent = 'מכין כרטיס...';
    }
    try {
        const data = await gatherCardData(userId);
        const canvas = await buildProgressCardImage(data);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('canvas export failed');

        _progressCardBlob = blob;
        _progressCardFilename = `כרטיס-התקדמות-${data.clientName}.png`;
        if (_progressCardObjectUrl) URL.revokeObjectURL(_progressCardObjectUrl);
        _progressCardObjectUrl = URL.createObjectURL(blob);

        const img = document.getElementById('progress-card-preview-img');
        if (img) img.src = _progressCardObjectUrl;
        const modal = document.getElementById('progress-card-modal');
        if (modal) modal.classList.remove('hidden');
    } catch (e) {
        console.error('exportProgressReport:', e);
        if (typeof showAlert === 'function') showAlert('שגיאה ביצירת הכרטיס, נסה שוב');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.textContent = origText;
        }
    }
}

function closeProgressCardModal() {
    const modal = document.getElementById('progress-card-modal');
    if (modal) modal.classList.add('hidden');
}

// אין ב-Web API דרך לשמור תמונה ישירות לגלריה; תפריט השיתוף המובנה של המערכת
// הוא הדרך היחידה למשתמש להגיע ל"שמירת תמונה"/"הוספה לתמונות". דסקטופ בלי
// Web Share נופל להורדה רגילה של הקובץ.
function _downloadProgressCardFile() {
    if (!_progressCardBlob) return;
    const url = URL.createObjectURL(_progressCardBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = _progressCardFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function shareProgressCardImage() {
    if (!_progressCardBlob) return;
    const file = new File([_progressCardBlob], _progressCardFilename, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({ files: [file], title: 'כרטיס התקדמות' });
            return;
        } catch (e) {
            if (e.name === 'AbortError') return; // המשתמש ביטל את השיתוף
        }
    }
    _downloadProgressCardFile();
}

function _applyReportExportVisibility() {
    const wrap = document.getElementById('export-report-wrap');
    if (wrap) wrap.style.display = canExportReport() ? '' : 'none';
}
