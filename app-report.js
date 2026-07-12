// ===== כרטיס התקדמות (תמונה לשיתוף/שמירה) =====

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

// גרף המשקל מצויר על קנבס קבוע שקיים תמיד ב-DOM (בתוך weight-chart-modal),
// אבל renderWeightChart מודד רוחב לפי getBoundingClientRect, שמחזיר 0 כשההורה
// display:none. פותחים את המודל באופן בלתי נראה (visibility:hidden) כדי
// שיהיה לו רוחב אמיתי, מציירים, מצלמים, וסוגרים בחזרה.
async function _captureWeightChart() {
    const modal = document.getElementById('weight-chart-modal');
    const canvas = document.getElementById('weight-chart');
    if (!modal || !canvas || typeof renderWeightChart !== 'function') return null;
    const prevDisplay = modal.style.display;
    const prevVisibility = modal.style.visibility;
    modal.style.visibility = 'hidden';
    modal.style.display = 'flex';
    try {
        renderWeightChart();
        return canvas.toDataURL('image/png');
    } finally {
        modal.style.display = prevDisplay;
        modal.style.visibility = prevVisibility;
    }
}

async function _fetchExerciseNames(userId) {
    const { data, error } = await db.from('workout_performance_log')
        .select('exercise_name').eq('client_id', userId);
    if (error || !data) return [];
    return [...new Set(data.map(r => r.exercise_name))];
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
        candidates.push({ name, data, dataPoints: data.length, improvement: last - first });
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

async function _renderStrengthMiniChart(ex) {
    await loadChartJs();
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 260;
    const ctx = canvas.getContext('2d');
    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ex.data.map(r => r.date),
            datasets: [{
                data: ex.data.map(r => r.weight_kg),
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59,130,246,0.15)',
                fill: true,
                tension: 0.3,
                pointRadius: 0
            }]
        },
        options: {
            responsive: false,
            animation: false,
            plugins: {
                legend: { display: false },
                title: { display: true, text: ex.name, font: { size: 15 }, color: '#f5f5f7' }
            },
            scales: {
                x: { display: false },
                y: { display: true, ticks: { color: '#98989f' }, grid: { color: 'rgba(255,255,255,0.08)' } }
            }
        }
    });
    const dataUrl = canvas.toDataURL('image/png');
    chart.destroy();
    return dataUrl;
}

function _buildHighlightSentences(bodyWeightDelta, topExercise) {
    const sentences = [];
    if (bodyWeightDelta != null && Math.abs(bodyWeightDelta) >= 0.1) {
        const dir = bodyWeightDelta > 0 ? 'עלית' : 'ירדת';
        sentences.push(`${dir} ${Math.abs(bodyWeightDelta).toFixed(1)} ק"ג במשקל הגוף מאז ההתחלה`);
    }
    if (topExercise && topExercise.improvement > 0) {
        sentences.push(`שיפרת ב${topExercise.name} ${topExercise.improvement.toFixed(1)} ק"ג מאז שהתחלת`);
    }
    return sentences;
}

async function gatherCardData(userId) {
    const weightDataUrl = await _captureWeightChart();
    const topExercises = await _selectTopExercises(userId, 3, 2);
    const strengthDataUrls = [];
    for (const ex of topExercises) {
        strengthDataUrls.push(await _renderStrengthMiniChart(ex));
    }
    const streaks = window._streaksCache || {};
    const bodyWeightDelta = (typeof CLIENT.currentWeight === 'number' && typeof CLIENT.startWeight === 'number')
        ? CLIENT.currentWeight - CLIENT.startWeight : null;

    return {
        clientName: CLIENT.name || CLIENT.nickname || 'מתאמן',
        weightImg: weightDataUrl ? await _loadImage(weightDataUrl).catch(() => null) : null,
        strengthImgs: await Promise.all(strengthDataUrls.map(u => _loadImage(u).catch(() => null))),
        highlights: _buildHighlightSentences(bodyWeightDelta, topExercises[0]),
        workoutStreak: streaks.workout_streak || 0,
        nutritionStreak: streaks.nutrition_streak || 0,
        logoImg: await _loadImage('/OI.512.512.png').catch(() => null),
    };
}

async function buildProgressCardImage(data) {
    const W = 1080, H = 1350;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, W, H);

    if (data.logoImg) ctx.drawImage(data.logoImg, 40, 40, 90, 90);
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f5f5f7';
    ctx.font = '700 44px Heebo, sans-serif';
    ctx.fillText(data.clientName, W - 40, 70);
    ctx.font = '400 26px Heebo, sans-serif';
    ctx.fillStyle = '#98989f';
    ctx.fillText('כרטיס התקדמות', W - 40, 112);

    let y = 170;

    if (data.weightImg) {
        const chartH = 300;
        ctx.drawImage(data.weightImg, 40, y, W - 80, chartH);
        y += chartH + 30;
    }

    const strengthImgs = data.strengthImgs.filter(Boolean);
    if (strengthImgs.length) {
        const gap = 20;
        const colW = (W - 80 - gap * (strengthImgs.length - 1)) / strengthImgs.length;
        const colH = 260;
        strengthImgs.forEach((img, i) => {
            const x = 40 + i * (colW + gap);
            ctx.drawImage(img, x, y, colW, colH);
        });
        y += colH + 50;
    }

    ctx.textAlign = 'right';
    ctx.font = '600 32px Heebo, sans-serif';
    ctx.fillStyle = '#3b82f6';
    data.highlights.forEach(line => {
        ctx.fillText(line, W - 40, y);
        y += 46;
    });
    y += 24;

    ctx.font = '500 26px Heebo, sans-serif';
    ctx.fillStyle = '#98989f';
    ctx.fillText(`סטריק תזונה: ${data.nutritionStreak} ימים   |   סטריק אימונים: ${data.workoutStreak} שבועות`, W - 40, y);

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
