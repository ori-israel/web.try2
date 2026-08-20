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
