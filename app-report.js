// ===== ייצוא דוח התקדמות (PDF) =====

function canExportReport() {
    return !!CLIENT.isSubscriber;
}

async function loadJsPDF() {
    if (window.jspdf) return;
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/jspdf@2/dist/jspdf.umd.min.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
}

// טקסט עברי כתמונה — jsPDF לא כולל גופן עם תווים בעברית, אז כל טקסט
// בדוח מצויר על קנבס (שמרנדר עברית נכון) והופך לתמונה במקום doc.text()
function _labelImage(text, opts = {}) {
    const { width = 700, height = 60, fontSize = 26, color = '#1c1c1e', align = 'right' } = opts;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.direction = 'rtl';
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${fontSize}px Heebo, -apple-system, sans-serif`;
    ctx.fillStyle = color;
    ctx.fillText(text, align === 'right' ? width - 6 : width / 2, height / 2);
    return canvas.toDataURL('image/png');
}

async function _urlToDataURL(url) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('fetch failed: ' + resp.status);
    const blob = await resp.blob();
    const format = blob.type === 'image/png' ? 'PNG' : 'JPEG';
    const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
    return { dataUrl, format };
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

async function _captureScoreHistoryChart(userId) {
    if (typeof renderScoreHistory !== 'function') return null;
    await renderScoreHistory(userId);
    const canvas = document.getElementById('score-history-canvas');
    return canvas ? canvas.toDataURL('image/png') : null;
}

async function _fetchExerciseNames(userId) {
    const { data, error } = await db.from('workout_performance_log')
        .select('exercise_name').eq('client_id', userId);
    if (error || !data) return [];
    return [...new Set(data.map(r => r.exercise_name))];
}

// גרף כוח לכל תרגיל שיש לו נתונים — אותה הגדרת גרף בדיוק כמו showStrengthChart
// (app-journal.js), רק על קנבס זמני שלא מוצג במסך, לא בתוך מודל אינטראקטיבי
async function _captureStrengthCharts(userId) {
    await loadChartJs();
    const exerciseNames = await _fetchExerciseNames(userId);
    const charts = [];
    for (const name of exerciseNames) {
        const { data, error } = await db.from('workout_performance_log')
            .select('date, weight_kg, reps')
            .eq('client_id', userId).eq('exercise_name', name)
            .order('date', { ascending: true });
        if (error || !data || !data.length) continue;

        const canvas = document.createElement('canvas');
        canvas.width = 700;
        canvas.height = 380;
        const ctx = canvas.getContext('2d');
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(r => r.date),
                datasets: [
                    { label: 'משקל', data: data.map(r => r.weight_kg), borderColor: '#5b7cfa', backgroundColor: 'rgba(91,124,250,0.15)', fill: true, tension: 0.3, yAxisID: 'y' },
                    { label: 'חזרות', data: data.map(r => r.reps), borderColor: '#4caf50', backgroundColor: 'transparent', borderDash: [6, 3], tension: 0.3, yAxisID: 'y2' }
                ]
            },
            options: {
                responsive: false,
                animation: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { title: { display: true, text: name, font: { size: 16 } } },
                scales: {
                    y:  { type: 'linear', position: 'left',  min: 0, max: 100, ticks: { color: '#5b7cfa' }, title: { display: true, text: 'משקל' } },
                    y2: { type: 'linear', position: 'right', min: 0, max: 25,  grid: { drawOnChartArea: false }, ticks: { color: '#4caf50', stepSize: 1, precision: 0 }, title: { display: true, text: 'חזרות' } }
                }
            }
        });
        charts.push({ name, image: canvas.toDataURL('image/png') });
        chart.destroy();
    }
    return charts;
}

async function _gatherProgressPhotos(userId) {
    if (typeof sbFetchProgressPhotos !== 'function') return [];
    const photos = await sbFetchProgressPhotos(userId);
    if (!photos || !photos.length) return [];
    const signedUrls = await sbGetSignedPhotoUrls(photos.map(p => p.storage_path));
    const results = [];
    for (const p of photos) {
        const url = signedUrls[p.storage_path];
        if (!url) continue;
        try {
            results.push(await _urlToDataURL(url));
        } catch (e) {
            console.warn('progress photo skipped in report:', e.message);
        }
    }
    return results;
}

async function gatherReportData(userId, includePhotos) {
    const [weightImg, scoreImg, strengthCharts, photos] = await Promise.all([
        _captureWeightChart(),
        _captureScoreHistoryChart(userId),
        _captureStrengthCharts(userId),
        includePhotos ? _gatherProgressPhotos(userId) : Promise.resolve([])
    ]);
    const streaks = window._streaksCache || {};
    return {
        clientName: CLIENT.name || CLIENT.nickname || 'מתאמן',
        goal: CLIENT.goal === 'cut' ? 'חיטוב' : 'מסה',
        workoutStreak: streaks.workout_streak || 0,
        nutritionStreak: streaks.nutrition_streak || 0,
        weightImg, scoreImg, strengthCharts, photos
    };
}

async function buildProgressReportPDF(data) {
    await loadJsPDF();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    const ensureSpace = neededHeight => {
        if (y + neededHeight > pageHeight - margin) {
            doc.addPage();
            y = margin;
        }
    };

    // כותרת: לוגו + שם + מטרה + סטריקים, הכל כתמונה אחת בגלל טקסט בעברית
    try {
        const logo = await _urlToDataURL(location.origin + '/OI.512.512.png');
        doc.addImage(logo.dataUrl, logo.format, margin, y, 16, 16);
    } catch (e) { console.warn('report logo skipped:', e.message); }
    const headerText = `דוח התקדמות — ${data.clientName}  |  מטרה: ${data.goal}  |  סטריק תזונה: ${data.nutritionStreak} ימים  |  סטריק אימונים: ${data.workoutStreak} שבועות`;
    doc.addImage(_labelImage(headerText, { width: 1400, height: 90, fontSize: 26 }), 'PNG', margin, y, contentWidth, 11);
    y += 24;

    const addChartBlock = (title, img) => {
        if (!img) return;
        const imgHeight = contentWidth * 0.5;
        ensureSpace(14 + imgHeight);
        doc.addImage(_labelImage(title, { width: 1000, height: 70 }), 'PNG', margin, y, contentWidth, 8);
        y += 12;
        doc.addImage(img, 'PNG', margin, y, contentWidth, imgHeight);
        y += imgHeight + 10;
    };

    addChartBlock('מעקב משקל גוף', data.weightImg);
    addChartBlock('היסטוריית ציונים שבועיים', data.scoreImg);
    data.strengthCharts.forEach(c => addChartBlock(`התקדמות כוח: ${c.name}`, c.image));

    if (data.photos && data.photos.length) {
        ensureSpace(16);
        doc.addImage(_labelImage('תמונות התקדמות', { width: 1000, height: 70 }), 'PNG', margin, y, contentWidth, 8);
        y += 12;
        const photoSize = 70;
        data.photos.forEach(p => {
            ensureSpace(photoSize + 8);
            doc.addImage(p.dataUrl, p.format, pageWidth - margin - photoSize, y, photoSize, photoSize);
            y += photoSize + 8;
        });
    }

    doc.save(`דוח-התקדמות-${data.clientName}.pdf`);
}

async function exportProgressReport() {
    if (!canExportReport()) return;
    const userId = getActiveUserId();
    if (!userId) return;

    const btn = document.getElementById('export-report-btn');
    const checkbox = document.getElementById('export-report-photos-cb');
    const includePhotos = !!(checkbox && checkbox.checked);
    const origHTML = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.style.opacity = '0.6';
        btn.textContent = 'מכין דוח...';
    }
    try {
        const data = await gatherReportData(userId, includePhotos);
        await buildProgressReportPDF(data);
    } catch (e) {
        console.error('exportProgressReport:', e);
        if (typeof showAlert === 'function') showAlert('שגיאה ביצירת הדוח, נסה שוב');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.innerHTML = origHTML;
        }
    }
}

function _applyReportExportVisibility() {
    const wrap = document.getElementById('export-report-wrap');
    if (wrap) wrap.style.display = canExportReport() ? '' : 'none';
}
