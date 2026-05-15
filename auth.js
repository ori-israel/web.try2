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
    if (typeof populateProfileForm    === 'function') populateProfileForm();
    if (typeof initFAQ                === 'function') initFAQ();
    setTimeout(() => {
        if (typeof renderWeightChart    === 'function') renderWeightChart();
        if (typeof checkWeeklyReminders === 'function') checkWeeklyReminders();
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

    // הצגת כפתור מנהל צף אם צריך
    if (SB_IS_ADMIN) {
        const wrap   = document.getElementById('admin-fab-wrap');
        const nameEl = document.getElementById('admin-bar-name');
        if (wrap)   wrap.style.display = 'block';
        if (nameEl) nameEl.textContent = CLIENT.name || CLIENT.nickname || 'לקוח';
    }
}

function toggleAdminPanel() {
    const panel = document.getElementById('admin-panel');
    if (panel) panel.classList.toggle('open');
}

// סגירת הפאנל בלחיצה מחוץ אליו
document.addEventListener('click', e => {
    const wrap = document.getElementById('admin-fab-wrap');
    if (wrap && !wrap.contains(e.target)) {
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

function doLogout() {
    if (!confirm('להתנתק?')) return;
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

async function renderAdminPanel() {
    const list = document.getElementById('admin-client-list');
    if (!list) return;
    list.innerHTML = '<div class="admin-loading">טוען לקוחות...</div>';
    try {
        const clients = await sbFetchAllClients();
        if (!clients.length) {
            list.innerHTML = '<div class="admin-empty">אין לקוחות רשומים עדיין</div>';
            return;
        }
        list.innerHTML = '';
        clients.forEach(c => {
            const card = document.createElement('div');
            card.className = 'admin-client-card';
            const displayName = c.name || c.nickname || '(ללא שם)';
            card.innerHTML = `
                <div class="admin-client-info">
                    <span class="admin-client-name">${displayName}</span>
                    <span class="admin-client-email">${c.email || ''}</span>
                </div>
                <button class="admin-select-btn" onclick="adminViewClient('${c.id}', '${displayName.replace(/'/g, "\\'")}')">כניסה ›</button>
            `;
            list.appendChild(card);
        });
    } catch (err) {
        list.innerHTML = `<div class="admin-error">שגיאה: ${err.message}</div>`;
    }
}

async function adminViewClient(clientId) {
    document.getElementById('admin-fab-wrap').style.display = 'none';
    _clearUserLocalStorage();
    await _loadClientAndShowApp(clientId);
}

function adminBackToList() {
    document.getElementById('admin-fab-wrap').style.display = 'none';
    _clearUserLocalStorage();
    SB_VIEW_ID = null;
    _resolveAuthReady = () => {}; // שיחה נוספת לא תשפיע
    renderAdminPanel().then(() => _showOverlay('admin-overlay'));
}

// ── עורך תוכנית אימונים (מנהל בלבד) ────────────────────────

function openWorkoutEditor() {
    _renderWorkoutEditorBody();
    document.getElementById('workout-editor-modal').style.display = 'flex';
}

function closeWorkoutEditor() {
    document.getElementById('workout-editor-modal').style.display = 'none';
}

function _renderWorkoutEditorBody() {
    const container = document.getElementById('workout-editor-body');
    if (!container) return;
    const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    container.innerHTML = '';

    ['A', 'B', 'C'].forEach(letter => {
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
            <table class="we-table">
                <thead><tr><th>שם תרגיל</th><th>חזרות</th><th></th></tr></thead>
                <tbody id="we-body-${letter}">
                    ${workout.map((ex, i) => _weRowHtml(letter, i, ex.name, ex.reps)).join('')}
                </tbody>
            </table>
            <button class="we-add-btn" onclick="weAddRow('${letter}')">+ הוסף תרגיל</button>
        `;
        container.appendChild(section);
    });
}

function _weRowHtml(letter, i, name = '', reps = '10-15') {
    return `
        <tr>
            <td><input class="we-input" type="text" value="${name}" placeholder="שם תרגיל" data-field="name" data-workout="${letter}" data-idx="${i}"></td>
            <td><input class="we-input we-reps" type="text" value="${reps}" placeholder="10-15" data-field="reps" data-workout="${letter}" data-idx="${i}"></td>
            <td><button class="we-del-btn" onclick="weDeleteRow('${letter}', this)">✕</button></td>
        </tr>`;
}

function weAddRow(letter) {
    const tbody = document.getElementById(`we-body-${letter}`);
    const i     = tbody.querySelectorAll('tr').length;
    tbody.insertAdjacentHTML('beforeend', _weRowHtml(letter, i));
}

function weDeleteRow(letter, btn) {
    btn.closest('tr').remove();
}

async function saveWorkoutPlan() {
    const btn = document.getElementById('we-save-btn');
    btn.disabled    = true;
    btn.textContent = 'שומר...';
    try {
        ['A', 'B', 'C'].forEach(letter => {
            const tbody     = document.getElementById(`we-body-${letter}`);
            const exercises = [];
            tbody.querySelectorAll('tr').forEach(row => {
                const nameEl = row.querySelector('[data-field="name"]');
                const repsEl = row.querySelector('[data-field="reps"]');
                if (nameEl?.value.trim()) {
                    exercises.push({ name: nameEl.value.trim(), reps: repsEl?.value.trim() || '10-15' });
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
