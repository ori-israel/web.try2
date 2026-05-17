// ============================================================
// auth.js — Authentication, login UI, admin panel
// ============================================================

// Promise שמ-window.onload של app.js ממתין לו לפני אתחול
let _resolveAuthReady;
window._authReady = new Promise(r => { _resolveAuthReady = r; });

// ── UI helpers ──────────────────────────────────────────────

function _showOverlay(id) {
    ['login-overlay', 'admin-overlay'].forEach(oid => {
        const el = document.getElementById(oid);
        if (el) el.style.display = oid === id ? 'flex' : 'none';
    });
    const app = document.getElementById('app-container');
    if (app) app.style.display = 'none';
}

function _showApp() {
    ['login-overlay', 'admin-overlay'].forEach(oid => {
        const el = document.getElementById(oid);
        if (el) el.style.display = 'none';
    });
    const app = document.getElementById('app-container');
    if (app) app.style.display = 'block';
}

function showLoginForm(errorMsg) {
    _showOverlay('login-overlay');
    document.getElementById('login-form-section').style.display    = 'flex';
    document.getElementById('login-loading-section').style.display = 'none';
    if (errorMsg) document.getElementById('login-error').textContent = errorMsg;
}

function showLoadingScreen(msg) {
    _showOverlay('login-overlay');
    document.getElementById('login-form-section').style.display    = 'none';
    document.getElementById('login-loading-section').style.display = 'flex';
    document.getElementById('loading-msg').textContent = msg || 'טוען...';
}

// ── אתחול כל פונקציות ה-app לאחר טעינת הנתונים ─────────────

function reinitApp() {
    if (typeof manageDailyReset       === 'function') manageDailyReset();
    if (typeof updateCounter          === 'function') updateCounter();
    if (typeof initWorkoutsFromClient === 'function') initWorkoutsFromClient();
    if (typeof initWorkoutsChecklist  === 'function') initWorkoutsChecklist();
    if (typeof initVideos             === 'function') initVideos();
    if (typeof buildWorkoutAccordions === 'function') buildWorkoutAccordions();
    if (typeof loadPortions           === 'function') loadPortions();
    if (typeof loadChecklist          === 'function') loadChecklist();
    if (typeof generatePortionGoals   === 'function') generatePortionGoals();
    if (typeof updateGoalRecommendations==='function') updateGoalRecommendations();
    if (typeof loadPerfData           === 'function') loadPerfData();
    if (typeof loadSavedWeight        === 'function') loadSavedWeight();
    if (typeof loadCoachingGoal       === 'function') loadCoachingGoal();
    if (typeof updateWorkoutStreak    === 'function') updateWorkoutStreak();
    if (typeof updateNutritionStreak  === 'function') updateNutritionStreak();
    if (typeof updateVacationBanner   === 'function') updateVacationBanner();
    if (typeof populateProfileForm    === 'function') populateProfileForm();
    if (typeof initFAQ                === 'function') initFAQ();
    setTimeout(() => {
        if (typeof renderWeightChart    === 'function') renderWeightChart();
        if (typeof checkBirthday        === 'function') checkBirthday();
    }, 150);
}

// ── Auth flow ────────────────────────────────────────────────

async function handleLoginSuccess(user) {
    SB_USER = user;
    showLoadingScreen('טוען פרופיל...');
    try {
        const profile = await sbFetchProfile(user.id);
        SB_IS_ADMIN = profile?.is_admin || false;

        if (SB_IS_ADMIN) {
            await renderAdminPanel();
            _showOverlay('admin-overlay');
        } else {
            await _loadClientAndShowApp(user.id);
        }
    } catch (err) {
        console.error('[Auth]', err);
        showLoginForm('שגיאה בטעינת הנתונים. נסה שוב.');
    }
}

async function _loadClientAndShowApp(userId) {
    SB_VIEW_ID = userId;
    showLoadingScreen('טוען נתונים...');
    try {
        await loadUserIntoApp(userId);
    } catch (err) {
        console.error('[Auth] data load error:', err);
    }

    // החל ערכת צבעים מה-localStorage שנטען
    const theme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    const themeBtn = document.querySelector('.theme-toggle');
    if (themeBtn) themeBtn.textContent = theme === 'dark' ? '☀️' : '🌙';

    _showApp();

    // פתרון ה-promise כדי ש-window.onload יוכל להמשיך
    _resolveAuthReady();

    // אם window.onload כבר רץ — נריץ ידנית את פונקציות האתחול
    if (document.readyState === 'complete') reinitApp();

    // הצגת כפתור מנהל בתפריט המבורגר אם צריך
    if (SB_IS_ADMIN) {
        const btn    = document.getElementById('admin-hamburger-btn');
        const nameEl = document.getElementById('admin-bar-name');
        if (btn)    btn.style.display = 'flex';
        if (nameEl) nameEl.textContent = CLIENT.name || CLIENT.nickname || 'לקוח';
    }
}

function toggleAdminPanel() {
    const panel = document.getElementById('admin-panel');
    if (panel) panel.classList.toggle('open');
}

// סגירת הפאנל בלחיצה מחוץ אליו
document.addEventListener('click', e => {
    const menu = document.querySelector('.hamburger-menu');
    if (menu && !menu.contains(e.target)) {
        document.getElementById('admin-panel')?.classList.remove('open');
    }
});

// ── Login form handlers ──────────────────────────────────────

async function doLogin() {
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn      = document.getElementById('login-btn');
    const errorEl  = document.getElementById('login-error');

    errorEl.textContent = '';
    if (!email || !password) { errorEl.textContent = 'יש למלא אימייל וסיסמה'; return; }

    btn.disabled    = true;
    btn.textContent = 'מתחבר...';
    try {
        const { user } = await sbSignIn(email, password);
        await handleLoginSuccess(user);
    } catch {
        errorEl.textContent = 'אימייל או סיסמה שגויים';
        btn.disabled    = false;
        btn.textContent = 'התחבר';
    }
}

async function doLogout() {
    if (!await showConfirmDanger('להתנתק?')) return;
    _clearUserLocalStorage();
    sbSignOut().finally(() => location.reload());
}

function _clearUserLocalStorage() {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k.startsWith('sb-')) keysToRemove.push(k);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
}

// ── Admin panel ──────────────────────────────────────────────

let _coachMode     = 'overview';
let _coachClients  = null;
let _coachDashData = null;

async function renderAdminPanel() {
    const list = document.getElementById('admin-client-list');
    if (!list) return;
    list.className = 'admin-client-list';
    list.innerHTML = '<div class="admin-loading">טוען נתונים...</div>';
    _syncCoachToggle();
    try {
        _coachClients = await sbFetchAllClients();
        if (!_coachClients.length) {
            list.innerHTML = '<div class="admin-empty">אין לקוחות רשומים עדיין</div>';
            return;
        }
        _coachDashData = await sbFetchCoachDashData(_coachClients.map(c => c.id));
        _renderCoachList(list);
    } catch (err) {
        list.innerHTML = `<div class="admin-error">שגיאה: ${err.message}</div>`;
    }
}

function setCoachMode(mode) {
    _coachMode = mode;
    _syncCoachToggle();
    const list = document.getElementById('admin-client-list');
    if (list && _coachClients && _coachDashData) _renderCoachList(list);
}

function _syncCoachToggle() {
    document.querySelectorAll('.coach-mode-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === _coachMode);
    });
}

function _renderCoachList(list) {
    if (_coachMode === 'urgent') _renderUrgentMode(list);
    else                         _renderOverviewMode(list);
}

function _buildClientStats(client) {
    const { profiles, scores, workouts, nutrition, monStr, prevMonStr } = _coachDashData;
    const profile = profiles.find(p => p.id === client.id) || {};

    const clientScores = scores
        .filter(s => s.client_id === client.id)
        .sort((a, b) => a.week_start.localeCompare(b.week_start));

    const currentWeek = clientScores.find(s => s.week_start === monStr)  || null;
    const prevWeek    = clientScores.find(s => s.week_start === prevMonStr) || null;
    const last4       = clientScores.slice(-4).map(s => s.score);

    const hasWorkout  = workouts.some(w => w.client_id === client.id);

    const weight      = profile.current_weight || 80;
    const pRatio      = profile.protein_ratio  || 2.0;
    const proteinGoal = Math.round(weight * pRatio);
    const calGoal     = 2000;

    const nutritionBadDays = nutrition
        .filter(n => n.user_id === client.id)
        .filter(n => {
            const kcal = n.protein * 4 + n.carbs * 4 + n.fat * 9;
            return !(n.protein >= proteinGoal && kcal >= calGoal * 0.85);
        }).length;

    return {
        currentScore:    currentWeek?.score          ?? null,
        prevScore:       prevWeek?.score             ?? null,
        workoutsScore:   currentWeek?.workouts_score ?? null,
        nutritionScore:  currentWeek?.nutrition_score ?? null,
        habitsScore:     currentWeek?.habits_score   ?? null,
        last4,
        hasWorkout,
        nutritionBadDays,
        vacationMode:    !!(profile.vacation_mode),
    };
}

function _coachInitials(name, id) {
    const COLORS = ['#4ade80','#60a5fa','#f472b6','#fb923c','#a78bfa','#34d399','#f87171','#38bdf8'];
    const hash   = [...(id || '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
    const color  = COLORS[Math.abs(hash) % COLORS.length];
    const words  = (name || '?').trim().split(/\s+/);
    const init   = ((words[0]?.[0] || '') + (words[1]?.[0] || '')).toUpperCase() || '?';
    return `<div class="coach-avatar" style="background:${color}">${init}</div>`;
}

function _coachSparkline(scores) {
    if (!scores.length) return '<span style="color:#555;font-size:11px;padding:8px 0;display:block">אין נתונים</span>';
    const VW = 240, VH = 72;
    const PT = 20, PB = 8, PL = 10, PR = 10;
    const chartW = VW - PL - PR;
    const chartH = VH - PT - PB;
    const last = scores[scores.length - 1];
    const clr  = last >= 80 ? '#4ade80' : last >= 50 ? '#facc15' : '#f87171';

    const pts = scores.map((s, i) => ({
        x: PL + (scores.length === 1 ? chartW / 2 : (i / (scores.length - 1)) * chartW),
        y: PT + chartH - (s / 100) * chartH,
        s,
    }));

    const targetY  = (PT + chartH - 0.8 * chartH).toFixed(1);
    const labelY   = (parseFloat(targetY) - 3).toFixed(1);
    const polyline = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const dots     = pts.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="${clr}"/>`).join('');
    const labels   = pts.map(p => `<text x="${p.x.toFixed(1)}" y="${(p.y - 9).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="500" fill="${clr}">${Math.round(p.s)}</text>`).join('');

    return `<svg width="100%" viewBox="0 0 ${VW} ${VH}" style="display:block">
        <rect x="0" y="0" width="${VW}" height="${VH}" rx="8" fill="#0f172a" opacity="0.75"/>
        <line x1="${PL}" y1="${targetY}" x2="${VW - PR - 18}" y2="${targetY}" stroke="#f59e0b" stroke-width="1.2" stroke-dasharray="5 4" opacity="0.6"/>
        <text x="${VW - PR - 2}" y="${labelY}" text-anchor="end" font-size="9" fill="#f59e0b" opacity="0.8">יעד 80</text>
        <polyline points="${polyline}" fill="none" stroke="${clr}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        ${dots}${labels}
    </svg>`;
}

function _coachScoreBar(label, score) {
    const pct = score ?? 0;
    const clr = pct >= 80 ? '#4ade80' : pct >= 50 ? '#facc15' : '#f87171';
    return `<div class="coach-bar-row">
        <span class="coach-bar-label">${label}</span>
        <div class="coach-bar-track"><div class="coach-bar-fill" style="width:${pct}%;background:${clr}"></div></div>
        <span class="coach-bar-pct">${Math.round(pct)}%</span>
    </div>`;
}

function _showToast(msg) {
    let toast = document.getElementById('coach-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'coach-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('visible');
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => toast.classList.remove('visible'), 3000);
}

async function toggleVacationMode(clientId, current) {
    const newVal = !current;
    const profile = _coachDashData?.profiles.find(p => p.id === clientId);
    const client  = _coachClients?.find(c => c.id === clientId);
    const name    = client?.name || client?.nickname || '';
    if (profile) profile.vacation_mode = newVal;
    try {
        await sbSetVacationMode(clientId, newVal);
        _showToast(newVal ? `🏖️ מצב חופשה הופעל עבור ${name}` : `✅ מצב חופשה כובה עבור ${name}`);
    } catch (e) {
        if (profile) profile.vacation_mode = current;
        alert('שגיאה בעדכון מצב חופשה');
    }
    const list = document.getElementById('admin-client-list');
    if (list) _renderCoachList(list);
}

function _coachSearch(query) {
    const q = query.trim().toLowerCase();
    document.querySelectorAll('#admin-client-list .coach-overview-card').forEach(card => {
        card.style.display = (!q || card.dataset.name.includes(q)) ? '' : 'none';
    });
}

function _renderUrgentMode(list) {
    list.className = 'admin-client-list';
    const sb = document.getElementById('coach-search-bar');
    if (sb) sb.style.display = 'none';
    const items = _coachClients.map(client => {
        const s    = _buildClientStats(client);
        const name = client.name || client.nickname || '(ללא שם)';
        let priority = 5, reason = null, cls = '';

        if (s.prevScore !== null && s.currentScore !== null && (s.prevScore - s.currentScore) > 20) {
            priority = 1; cls = 'urgent-critical';
            reason = `ירידה של ${Math.round(s.prevScore - s.currentScore)} נק׳ מהשבוע שעבר`;
        } else if (!s.hasWorkout) {
            priority = 2; cls = 'urgent-warning';
            reason = 'לא תיעד אימון השבוע';
        } else if (s.nutritionBadDays >= 3) {
            priority = 3; cls = 'urgent-warning';
            reason = `תזונה מתחת ליעד ${s.nutritionBadDays} ימים השבוע`;
        } else if (s.currentScore !== null && s.currentScore < 50) {
            priority = 4; cls = 'urgent-low';
            reason = `ציון נמוך: ${Math.round(s.currentScore)}`;
        }
        return { client, s, name, priority, reason, cls };
    });

    items.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return (a.s.currentScore ?? 100) - (b.s.currentScore ?? 100);
    });

    list.innerHTML = '';
    items.filter(i => i.reason).forEach(({ client, s, name, reason, cls }) => {
        const scoreStr = s.currentScore !== null ? Math.round(s.currentScore) : '—';
        const vac = s.vacationMode;
        const row = document.createElement('div');
        row.className = 'coach-urgent-row';
        row.innerHTML = `
            <div class="coach-urgent-left">
                ${_coachInitials(name, client.id)}
                <div class="coach-urgent-text">
                    <span class="coach-urgent-name">${name}</span>
                    <span class="coach-urgent-reason ${cls}">${reason}</span>
                </div>
            </div>
            <div class="coach-urgent-right">
                <span class="coach-urgent-score">${scoreStr}</span>
                <button class="coach-vac-icon${vac ? ' active' : ''}" onclick="toggleVacationMode('${client.id}', ${vac})">🏖️</button>
                <button class="admin-select-btn" onclick="adminViewClient('${client.id}')">כניסה ›</button>
            </div>`;
        list.appendChild(row);
    });

    if (!list.children.length) {
        list.innerHTML = '<div class="admin-empty">🎉 כל הלקוחות במצב תקין!</div>';
    }
}

function _renderOverviewMode(list) {
    // Search bar — insert once, reuse across re-renders
    let sb = document.getElementById('coach-search-bar');
    if (!sb) {
        sb = document.createElement('div');
        sb.id = 'coach-search-bar';
        sb.innerHTML = '<input type="text" placeholder="חיפוש לקוח..." oninput="_coachSearch(this.value)">';
        list.parentElement.insertBefore(sb, list);
    }
    sb.style.display = '';
    const inp = sb.querySelector('input');
    if (inp) inp.value = '';

    list.className = 'admin-client-list coach-overview-list';
    list.innerHTML = '';

    _coachClients.forEach(client => {
        const s    = _buildClientStats(client);
        const name = client.name || client.nickname || '(ללא שם)';
        const score = s.currentScore;
        const bClr = score === null ? '#444' : score >= 80 ? '#4ade80' : score >= 50 ? '#facc15' : '#f87171';
        const sStr = score !== null ? Math.round(score) : '—';
        const vac  = s.vacationMode;

        const card = document.createElement('div');
        card.className = 'coach-overview-card';
        card.dataset.name = name.toLowerCase();
        card.style.borderColor = bClr;
        card.innerHTML = `
            <div class="coach-card-header" onclick="this.closest('.coach-overview-card').classList.toggle('expanded')">
                ${_coachInitials(name, client.id)}
                <div class="coach-card-name">${name}</div>
                <div class="coach-card-score" style="color:${bClr}">${sStr}<span class="coach-card-score-unit">pts</span></div>
                <button class="coach-vac-icon${vac ? ' active' : ''}" onclick="event.stopPropagation();toggleVacationMode('${client.id}',${vac})">🏖️</button>
            </div>
            <div class="coach-card-body">
                <div class="coach-bars">
                    ${_coachScoreBar('אימונים', s.workoutsScore)}
                    ${_coachScoreBar('תזונה',   s.nutritionScore)}
                    ${_coachScoreBar('הרגלים',  s.habitsScore)}
                </div>
                <div class="coach-sparkline">${_coachSparkline(s.last4)}</div>
                <button class="coach-q-btn" onclick="event.stopPropagation();showQuestionnaireModal('${client.id}')">📋 שאלון אחרון</button>
                <button class="admin-select-btn" style="width:100%;margin-top:6px" onclick="adminViewClient('${client.id}')">כניסה ›</button>
            </div>`;
        list.appendChild(card);
    });
}

async function adminViewClient(clientId) {
    document.getElementById('admin-hamburger-btn').style.display = 'none';
    _clearUserLocalStorage();
    await _loadClientAndShowApp(clientId);
}

function adminBackToList() {
    document.getElementById('admin-hamburger-btn').style.display = 'none';
    _clearUserLocalStorage();
    SB_VIEW_ID = null;
    _resolveAuthReady = () => {}; // שיחה נוספת לא תשפיע
    renderAdminPanel().then(() => _showOverlay('admin-overlay'));
}

// ── מודל שאלון שבועי ────────────────────────────────────────

async function showQuestionnaireModal(clientId) {
    const modal = document.getElementById('questionnaire-modal');
    const body  = document.getElementById('qmodal-body');
    body.innerHTML = '<p style="color:#aaa">טוען...</p>';
    modal.classList.remove('hidden');
    try {
        const row = await sbFetchLatestQuestionnaire(clientId);
        if (!row) { body.innerHTML = '<p style="color:#aaa">אין שאלון עדיין.</p>'; return; }
        const date = new Date(row.submitted_at).toLocaleDateString('he-IL', { day:'numeric', month:'long', year:'numeric' });
        body.innerHTML = `
            <p class="qmodal-date">נשלח: ${date}</p>
            <div class="qmodal-q"><strong>1. ניצחון:</strong><p>${row.q1_win || '—'}</p></div>
            <div class="qmodal-q"><strong>2. אתגר:</strong><p>${row.q2_challenge || '—'}</p></div>
            <div class="qmodal-q"><strong>3. ציון עמידה:</strong><p>${row.q3_score != null ? row.q3_score + '/10' : '—'}</p></div>
            <div class="qmodal-q"><strong>4. הערות:</strong><p>${row.q4_topic || '—'}</p></div>`;
    } catch(e) {
        body.innerHTML = '<p style="color:#f87171">שגיאה בטעינה.</p>';
        console.error('[SB] questionnaire fetch:', e.message);
    }
}

function closeQuestionnaireModal() {
    document.getElementById('questionnaire-modal').classList.add('hidden');
}

// ── עורך תוכנית אימונים (מנהל בלבד) ────────────────────────

function openWorkoutEditor() {
    _renderWorkoutEditorBody();
    document.getElementById('workout-editor-modal').style.display = 'flex';
}

function closeWorkoutEditor() {
    document.getElementById('workout-editor-modal').style.display = 'none';
}

function _weLetters() {
    const count = parseInt(document.getElementById('we-workouts-per-week')?.value) || CLIENT.workoutsPerWeek || 3;
    return 'ABCDEFG'.slice(0, Math.min(Math.max(count, 1), 7)).split('');
}

function _renderWorkoutEditorBody() {
    const container = document.getElementById('workout-editor-body');
    if (!container) return;
    const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    const perWeek  = CLIENT.workoutsPerWeek || 3;

    container.innerHTML = `
        <div class="we-per-week-row">
            <label for="we-workouts-per-week">מספר אימוני כוח בשבוע:</label>
            <input id="we-workouts-per-week" type="number" min="1" max="7" value="${perWeek}" class="we-per-week-input"
                onchange="_rerenderWorkoutSections()">
        </div>
        <div id="we-sections"></div>
    `;

    _rerenderWorkoutSections();
}

function _rerenderWorkoutSections() {
    const sectionsEl = document.getElementById('we-sections');
    if (!sectionsEl) return;
    const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    sectionsEl.innerHTML = '';

    _weLetters().forEach(letter => {
        const workout = CLIENT['workout' + letter] || [];
        const days    = CLIENT.workoutDays?.[letter] || [];

        const section = document.createElement('div');
        section.className = 'we-section';
        section.innerHTML = `
            <div class="we-section-header">
                <h3 class="we-section-title">אימון ${letter}</h3>
                <div class="we-days-row">
                    ${[0,1,2,3,4,5,6].map(d => `
                        <label class="we-day-label">
                            <input type="checkbox" class="we-day-cb" data-workout="${letter}" data-day="${d}" ${days.includes(d) ? 'checked' : ''}>
                            <span>${dayNames[d]}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
            <div class="we-list">
                <div class="we-header-row">
                    <span class="we-col-name">שם תרגיל</span>
                    <span class="we-col-sets">ח׳</span>
                    <span class="we-col-sets">ע׳</span>
                    <span class="we-col-reps">חזרות</span>
                    <span class="we-col-del"></span>
                </div>
                <div id="we-body-${letter}">
                    ${workout.map((ex, i) => _weRowHtml(letter, i, ex.name, ex.reps, ex.warmupSets, ex.workSets)).join('')}
                </div>
            </div>
            <button class="we-add-btn" onclick="weAddRow('${letter}')">+ הוסף תרגיל</button>
        `;
        sectionsEl.appendChild(section);
    });
}

function _weRowHtml(letter, i, name = '', reps = '10-15', warmupSets = 1, workSets = 2) {
    return `
        <div class="we-row">
            <input class="we-input we-col-name" type="text" value="${name}" placeholder="שם תרגיל" data-field="name" data-workout="${letter}" data-idx="${i}">
            <input class="we-input we-sets we-col-sets" type="number" min="0" max="9" value="${warmupSets}" data-field="warmupSets" data-workout="${letter}" data-idx="${i}">
            <input class="we-input we-sets we-col-sets" type="number" min="0" max="9" value="${workSets}" data-field="workSets" data-workout="${letter}" data-idx="${i}">
            <input class="we-input we-reps we-col-reps" type="text" value="${reps}" placeholder="10-15" data-field="reps" data-workout="${letter}" data-idx="${i}">
            <button class="we-del-btn we-col-del" onclick="weDeleteRow('${letter}', this)">✕</button>
        </div>`;
}

function weAddRow(letter) {
    const body = document.getElementById(`we-body-${letter}`);
    const i    = body.querySelectorAll('.we-row').length;
    body.insertAdjacentHTML('beforeend', _weRowHtml(letter, i));
}

function weDeleteRow(letter, btn) {
    btn.closest('.we-row').remove();
}

async function saveWorkoutPlan() {
    const btn = document.getElementById('we-save-btn');
    btn.disabled    = true;
    btn.textContent = 'שומר...';
    try {
        const perWeek = parseInt(document.getElementById('we-workouts-per-week')?.value) || 3;
        CLIENT.workoutsPerWeek = perWeek;

        _weLetters().forEach(letter => {
            const tbody     = document.getElementById(`we-body-${letter}`);
            const exercises = [];
            tbody.querySelectorAll('.we-row').forEach(row => {
                const nameEl      = row.querySelector('[data-field="name"]');
                const repsEl      = row.querySelector('[data-field="reps"]');
                const warmupEl    = row.querySelector('[data-field="warmupSets"]');
                const workEl      = row.querySelector('[data-field="workSets"]');
                if (nameEl?.value.trim()) {
                    exercises.push({
                        name:       nameEl.value.trim(),
                        reps:       repsEl?.value.trim() || '10-15',
                        warmupSets: parseInt(warmupEl?.value) || 0,
                        workSets:   parseInt(workEl?.value)   || 3,
                    });
                }
            });
            CLIENT['workout' + letter] = exercises;

            const days = [];
            document.querySelectorAll(`.we-day-cb[data-workout="${letter}"]`).forEach(cb => {
                if (cb.checked) days.push(parseInt(cb.dataset.day));
            });
            if (!CLIENT.workoutDays) CLIENT.workoutDays = {};
            CLIENT.workoutDays[letter] = days;
        });

        await syncWorkoutPlanNow();
        initWorkoutsFromClient();
        initWorkoutsChecklist();
        initVideos();

        btn.textContent       = '✓ נשמר!';
        btn.style.background  = '#22c55e';
        setTimeout(() => {
            btn.textContent      = 'שמור תוכנית';
            btn.style.background = '';
            btn.disabled         = false;
            closeWorkoutEditor();
        }, 1200);
    } catch (err) {
        btn.textContent      = 'שגיאה!';
        btn.style.background = '#e55';
        setTimeout(() => {
            btn.textContent      = 'שמור תוכנית';
            btn.style.background = '';
            btn.disabled         = false;
        }, 2000);
    }
}

// ── Init on DOMContentLoaded ─────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    showLoadingScreen('בודק חיבור...');

    // Enter בשדה סיסמה = לחיצה על כניסה
    document.getElementById('login-password')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') doLogin();
    });

    try {
        const session = await sbGetSession();
        if (session) {
            await handleLoginSuccess(session.user);
        } else {
            showLoginForm();
        }
    } catch (err) {
        console.error('[Auth] init:', err);
        showLoginForm('שגיאת חיבור. בדוק אינטרנט ונסה שוב.');
    }
});
