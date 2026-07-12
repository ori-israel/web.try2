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

async function _fetchExerciseNames(userId) {
    const { data, error } = await db.from('workout_performance_log')
        .select('exercise_name').eq('client_id', userId);
    if (error || !data) return [];
    // שמות שמתחילים ב-__ הם סימונים פנימיים (למשל __workout_done__), לא תרגילים אמיתיים
    return [...new Set(data.map(r => r.exercise_name))].filter(n => n && !n.startsWith('__'));
}

// בוחר את התרגילים הכי "מייצגים" להישגי כוח: שילוב של כמות נתונים
// (כמה פעם תועד) ושיפור במשקל (אחרון פחות ראשון), לא הערכת 1RM
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
        candidates.push({ name, data, dataPoints: data.length, first, last, improvement: last - first });
    }
    if (!candidates.length) return [];
    const maxData = Math.max(...candidates.map(c => c.dataPoints));
    const maxImprovement = Math.max(1, ...candidates.map(c => Math.max(c.improvement, 0)));
    candidates.forEach(c => {
        c.score = (c.dataPoints / maxData) * 0.5 + (Math.max(c.improvement, 0) / maxImprovement) * 0.5;
    });
    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, limit);
}

async function _fetchTrainingStats(userId, sinceDate) {
    const [wRes, nRes] = await Promise.all([
        db.from('workout_performance_log').select('date').eq('client_id', userId),
        db.from('daily_nutrition').select('date, protein, carbs, fat').eq('user_id', userId).gte('date', sinceDate),
    ]);
    const workoutDates = wRes.data ? new Set(wRes.data.map(r => r.date)) : new Set();
    const nutritionRows = nRes.data || [];
    const avg = key => nutritionRows.length
        ? nutritionRows.reduce((s, r) => s + (r[key] || 0), 0) / nutritionRows.length
        : 0;
    return {
        sessionCount: workoutDates.size,
        nutritionDaysLogged: nutritionRows.length,
        avgProtein: avg('protein'),
        avgCarbs: avg('carbs'),
        avgFat: avg('fat'),
    };
}

function _buildHighlightSentences(bodyWeightDelta, topExercise, stats) {
    const sentences = [];
    if (bodyWeightDelta != null && Math.abs(bodyWeightDelta) >= 0.1) {
        const dir = bodyWeightDelta > 0 ? 'עלית' : 'ירדת';
        sentences.push(`${dir} ${Math.abs(bodyWeightDelta).toFixed(1)} ק"ג במשקל הגוף מאז ההתחלה`);
    }
    if (topExercise && topExercise.improvement > 0) {
        sentences.push(`שיפרת ב${topExercise.name} ${topExercise.improvement.toFixed(1)} ק"ג מאז שהתחלת`);
    }
    if (stats.sessionCount > 0) {
        sentences.push(`בוצעו ${stats.sessionCount} אימונים מתועדים בתקופה`);
    }
    return sentences;
}

async function gatherCardData(userId) {
    const history = JSON.parse(sessionStorage.getItem('weight_history') || '[]')
        .filter(p => p.date && !isNaN(new Date(p.date).getTime()))
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    const topExercises = await _selectTopExercises(userId, 3, 2);
    const sinceDate = CLIENT.startDate || new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];
    const stats = await _fetchTrainingStats(userId, sinceDate);
    const streaks = window._streaksCache || {};
    const bodyWeightDelta = (typeof CLIENT.currentWeight === 'number' && typeof CLIENT.startWeight === 'number')
        ? CLIENT.currentWeight - CLIENT.startWeight : null;

    return {
        clientName: CLIENT.name || CLIENT.nickname || 'מתאמן',
        startDate: CLIENT.startDate || null,
        weightHistory: history,
        startWeight: CLIENT.startWeight,
        currentWeight: CLIENT.currentWeight,
        goalWeight: CLIENT.goalWeight,
        topExercises,
        stats,
        highlights: _buildHighlightSentences(bodyWeightDelta, topExercises[0], stats),
        workoutStreak: streaks.workout_streak || 0,
        nutritionStreak: streaks.nutrition_streak || 0,
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
    ctx.fillText(`מ-${ex.first} ל-${ex.last} ק"ג`, x + w / 2, textY);

    if (ex.improvement !== 0) {
        const pct = ex.first ? Math.abs((ex.improvement / ex.first) * 100) : 0;
        const sign = ex.improvement > 0 ? '+' : '';
        ctx.fillStyle = ex.improvement > 0 ? C.accent : C.textSecondary;
        ctx.font = '700 24px Heebo, sans-serif';
        ctx.fillText(`${sign}${ex.improvement.toFixed(1)} ק"ג (${pct.toFixed(0)}%)`, x + w / 2, textY + 32);
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

function _drawStatsPanel(ctx, data, x, y, w, h) {
    const C = _REPORT_COLORS;
    const tiles = [
        { label: 'אימונים בתקופה', value: `${data.stats.sessionCount}` },
        { label: 'ממוצע מנות ליום', value: `${data.stats.avgProtein.toFixed(1)}/${data.stats.avgCarbs.toFixed(1)}/${data.stats.avgFat.toFixed(1)}` },
        { label: 'סטריק אימונים', value: `${data.workoutStreak} שבועות` },
        { label: 'סטריק תזונה', value: `${data.nutritionStreak} ימים` },
    ];
    const gap = 16;
    const tileW = (w - gap * (tiles.length - 1)) / tiles.length;
    ctx.direction = 'rtl';
    tiles.forEach((t, i) => {
        const tx = x + w - (i + 1) * tileW - i * gap;
        _roundRect(ctx, tx, y, tileW, h, 18);
        ctx.fillStyle = C.panelAlt;
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = C.accent;
        ctx.font = '700 26px Heebo, sans-serif';
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
    const statsH = 140;

    const H = MARGIN + headerH + weightH + GAP
        + (exercisesH ? exercisesH + GAP : 0)
        + (highlightsH ? highlightsH + GAP : 0)
        + statsH + MARGIN;

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

    _drawStatsPanel(ctx, data, MARGIN, y, contentW, statsH);

    return canvas;
}

async function _shareOrDownloadImage(canvas, filename) {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('canvas export failed');
    const file = new File([blob], filename, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({ files: [file], title: 'כרטיס התקדמות' });
            return;
        } catch (e) {
            if (e.name === 'AbortError') return; // המשתמש ביטל את השיתוף
        }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

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
        await _shareOrDownloadImage(canvas, `כרטיס-התקדמות-${data.clientName}.png`);
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

function _applyReportExportVisibility() {
    const wrap = document.getElementById('export-report-wrap');
    if (wrap) wrap.style.display = canExportReport() ? '' : 'none';
}
