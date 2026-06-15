// ============================================================
// auth.js — Authentication, login UI, admin panel
// ============================================================

// Promise שמ-window.onload של app.js ממתין לו לפני אתחול
let _resolveAuthReady;
window._authReady = new Promise(r => { _resolveAuthReady = r; });
let _appInitDone = false;

// בריחת טקסט שמקורו במשתמש לפני הזרקה ל-HTML (מניעת XSS)
function _esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

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
    const sg = document.getElementById('login-signup-section');  if (sg) sg.style.display = 'none';
    const pd = document.getElementById('login-pending-section'); if (pd) pd.style.display = 'none';
    if (errorMsg) document.getElementById('login-error').textContent = errorMsg;
}

// מסך הרשמת משתמש חדש
function showSignupForm() {
    _showOverlay('login-overlay');
    document.getElementById('login-form-section').style.display    = 'none';
    document.getElementById('login-loading-section').style.display = 'none';
    document.getElementById('login-pending-section').style.display = 'none';
    document.getElementById('signup-error').textContent = '';
    document.getElementById('login-signup-section').style.display = 'flex';
    document.getElementById('login-overlay').scrollTop = 0;
}

// מסך "החשבון ממתין לאישור המנהל"
function showPendingScreen() {
    _showOverlay('login-overlay');
    document.getElementById('login-form-section').style.display    = 'none';
    document.getElementById('login-loading-section').style.display = 'none';
    document.getElementById('login-signup-section').style.display  = 'none';
    document.getElementById('login-pending-section').style.display = 'flex';
}

function showLoadingScreen(msg) {
    _showOverlay('login-overlay');
    document.getElementById('login-form-section').style.display    = 'none';
    document.getElementById('login-loading-section').style.display = 'flex';
    document.getElementById('loading-msg').textContent = msg || 'טוען...';
}

// ── אתחול כל פונקציות ה-app לאחר טעינת הנתונים ─────────────

async function reinitApp() {
    console.log('[reinitApp] called');
    if (typeof manageDailyReset       === 'function') manageDailyReset();
    if (typeof updateCounter          === 'function') updateCounter();
    if (typeof initWorkoutsFromClient === 'function') await initWorkoutsFromClient().catch(() => {});
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
    if (typeof checkThursdayBanner      === 'function') checkThursdayBanner();
    if (typeof _showPWAPromptIfNeeded   === 'function') _showPWAPromptIfNeeded();
    if (typeof checkMeetingReminder     === 'function') checkMeetingReminder();
    if (typeof _applySubscriberMode     === 'function') _applySubscriberMode();
    if (typeof loadProgressPhotos       === 'function') loadProgressPhotos();
    if (typeof renderFoodLog            === 'function') renderFoodLog();
}

// ── Auth flow ────────────────────────────────────────────────

async function handleLoginSuccess(user) {
    SB_USER = user;
    showLoadingScreen('טוען פרופיל...');
    sbUpdateLastSeen(user.id).catch(() => {});
    // תיעוד אישור התנאים — ראיה משפטית. נרשם פעם אחת לכל גרסת תנאים
    sbLogConsent(user.id, user.email);
    try {
        const profile = await sbFetchProfile(user.id);
        SB_IS_ADMIN = profile?.is_admin || false;

        // חסימת כניסה למשתמש שטרם אושר ע"י המנהל (אדמין תמיד נכנס)
        // נחסם כל מי שאינו בדיוק 'approved' — כולל סטטוס ריק/חסר (ברירת מחדל בטוחה)
        if (!SB_IS_ADMIN && (!profile || profile.status !== 'approved')) {
            await sbSignOut().catch(() => {});
            SB_USER = null;
            showPendingScreen();
            return;
        }

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
    // ניקוי מיידי של תמונת הפרופיל — מונע הצגת תמונה של לקוח קודם
    if (typeof _refreshAvatarUI === 'function') _refreshAvatarUI(null);
    showLoadingScreen('טוען נתונים...');
    try {
        await loadUserIntoApp(userId);
    } catch (err) {
        console.error('[Auth] data load error:', err);
    }

    // החל ערכת צבעים מה-localStorage שנטען
    const theme = localStorage.getItem('theme') || 'dark';
    if (typeof _applyTheme === 'function') _applyTheme(theme);

    // איפוס טאב לתזונה (tab1) בכל כניסה ללקוח
    document.querySelectorAll('.tab-btn, .tab-content').forEach(el => el.classList.remove('active'));
    document.querySelector('.tab-btn[data-tab="tab1"]')?.classList.add('active');
    document.getElementById('tab1')?.classList.add('active');

    // מגדיר reset key פר-יוזר לפני שmanagedDailyReset יכול לרוץ
    const _n = new Date();
    const _todayStr = `${_n.getFullYear()}-${String(_n.getMonth()+1).padStart(2,'0')}-${String(_n.getDate()).padStart(2,'0')}`;
    localStorage.setItem('last_reset_v4_' + userId, _todayStr);

    // פתרון ה-promise כדי ש-window.onload יוכל להמשיך
    _appInitDone = true;
    _resolveAuthReady();

    // אם window.onload כבר רץ — מריצים reinitApp קודם ורק אחרי מציגים את האפליקציה
    // כך המשתמש לא רואה לרגע נתונים של לקוח קודם
    if (document.readyState === 'complete') {
        await reinitApp();
    }
    _showApp();

    // הצגת כפתור מנהל בתפריט המבורגר אם צריך
    if (SB_IS_ADMIN) {
        const btn    = document.getElementById('admin-hamburger-btn');
        const nameEl = document.getElementById('admin-bar-name');
        if (btn)    btn.style.display = 'flex';
        if (nameEl) nameEl.textContent = (CLIENT.name || CLIENT.nickname || 'לקוח') + (CLIENT.isSubscriber ? ' 💳' : '');
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

async function sendMagicLink() {
    const email   = document.getElementById('login-email').value.trim();
    const errorEl = document.getElementById('login-error');
    errorEl.style.color = '#e55';
    if (!email) { errorEl.textContent = 'נא להכניס אימייל'; return; }
    const { error } = await db.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (error) {
        const msg = error.message?.toLowerCase() || '';
        errorEl.textContent = msg.includes('rate limit')
            ? 'נשלחו יותר מדי קישורים — יש להמתין כמה דקות'
            : msg.includes('signups not allowed') || msg.includes('user not found')
            ? 'המייל לא רשום במערכת'
            : msg.includes('invalid email')
            ? 'כתובת מייל לא תקינה'
            : msg.includes('email not confirmed')
            ? 'יש לאשר את המייל תחילה'
            : 'שגיאה — יש לנסות שוב';
    } else {
        errorEl.style.color = '#4ade80';
        errorEl.textContent = 'קישור נשלח! יש לבדוק את המייל';
    }
}

async function doLogin() {
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn      = document.getElementById('login-btn');
    const errorEl  = document.getElementById('login-error');
    const remember = document.getElementById('remember-me-cb')?.checked;

    errorEl.textContent = '';
    if (!email || !password) { errorEl.textContent = 'יש למלא אימייל וסיסמה'; return; }

    btn.disabled    = true;
    btn.textContent = 'מתחבר...';
    try {
        const { user } = await sbSignIn(email, password);
        if (remember) {
            localStorage.setItem('remember_me', 'yes');
        } else {
            sessionStorage.setItem('remember_me', 'session');
        }
        await handleLoginSuccess(user);
    } catch {
        errorEl.textContent = 'אימייל או סיסמה שגויים';
        btn.disabled    = false;
        btn.textContent = 'התחברות';
    }
}

// הרשמה עצמית — יצירת משתמש חדש שממתין לאישור המנהל
async function doSignup() {
    const name        = document.getElementById('signup-name').value.trim();
    const email       = document.getElementById('signup-email').value.trim();
    const password    = document.getElementById('signup-password').value;
    const birthDate   = document.getElementById('signup-birth-date').value;
    const startWeight = document.getElementById('signup-start-weight').value;
    const goalWeight  = document.getElementById('signup-goal-weight').value;
    const height      = document.getElementById('signup-height').value;
    const gender      = document.getElementById('signup-gender').value;
    const goal        = document.getElementById('signup-goal').value;
    const errorEl     = document.getElementById('signup-error');
    const btn         = document.getElementById('signup-btn');

    errorEl.style.color = '#e55';
    if (!name || !email || !password || !birthDate || !startWeight || !goalWeight || !height) {
        errorEl.textContent = 'יש למלא את כל השדות'; return;
    }
    if (password.length < 6) { errorEl.textContent = 'הסיסמה חייבת להכיל לפחות 6 תווים'; return; }

    btn.disabled    = true;
    btn.textContent = 'יוצר חשבון...';
    const { error } = await db.auth.signUp({
        email, password,
        options: { data: {
            name,
            birth_date:   birthDate,
            start_weight: startWeight,
            goal_weight:  goalWeight,
            height:       height,
            gender:       gender,
            goal:         goal,
        } }
    });
    if (error) {
        const msg = error.message?.toLowerCase() || '';
        errorEl.textContent =
              msg.includes('already') ? 'המייל כבר רשום במערכת'
            : msg.includes('signups not allowed') ? 'ההרשמה אינה זמינה כרגע'
            : msg.includes('invalid email') ? 'כתובת מייל לא תקינה'
            : msg.includes('password') ? 'הסיסמה חלשה מדי (לפחות 6 תווים)'
            : 'שגיאה — יש לנסות שוב';
        btn.disabled    = false;
        btn.textContent = 'יצירת חשבון';
        return;
    }
    errorEl.style.color = '#4ade80';
    errorEl.textContent = 'נשלח אליך מייל אימות. אשר אותו, ולאחר מכן המתן לאישור המנהל.';
    btn.textContent = 'נשלח ✓';
}

async function doLogout() {
    if (!await showConfirmDanger('להתנתק?')) return;
    _clearUserLocalStorage();
    localStorage.removeItem('remember_me');
    sessionStorage.removeItem('remember_me');
    sbSignOut().finally(() => location.reload());
}

function _clearUserLocalStorage() {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith('sb-')) continue;
        if (k === 'workout_popup_shown_date') continue;
        if (k.startsWith('survey_submitted_')) continue;
        if (k === 'pwa_prompt_shown') continue;
        if (k === 'remember_me') continue;
        if (k === 'last_reset_v4') continue;
        if (k.startsWith('last_reset_v4_')) continue;
        if (k.startsWith('food_log_')) continue;
        keysToRemove.push(k);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    // ניקוי sessionStorage גם — אחרת נתוני לקוח קודם דולפים במעבר בין לקוחות
    ['weight_history', 'current_weight', 'ai_chat_history'].forEach(k => sessionStorage.removeItem(k));
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith('user_portions_v3_')) sessionStorage.removeItem(k);
    }
    // איפוס cache בזיכרון כדי שנתוני לקוח אחד לא ידלפו לאחר
    window._workoutDataCache = { exercises: {}, tasks: [], exercise_weights: {} };
    // איפוס היסטוריית צ'אט AI בזיכרון
    if (typeof aiChatHistory !== 'undefined') aiChatHistory = [];
    // איפוס streaks cache
    if (window._streaksCache) window._streaksCache = { workout_streak: 0, nutrition_streak: 0, workout_completed_date: null, nutrition_completed_date: null };
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
    _refreshPendingBadge();
    try {
        _coachClients = await sbFetchAllClients();
        if (!_coachClients.length) {
            list.innerHTML = '<div class="admin-empty">אין לקוחות רשומים עדיין</div>';
            return;
        }
        _coachDashData = await sbFetchCoachDashData(_coachClients.map(c => c.id));
        if (_coachMode === 'subscribers') _renderSubscribersMode(list);
        else _renderCoachList(list);
    } catch (err) {
        list.innerHTML = `<div class="admin-error">שגיאה: ${err.message}</div>`;
    }
}

function setCoachMode(mode) {
    _coachMode = mode;
    _syncCoachToggle();
    const list = document.getElementById('admin-client-list');
    if (!list) return;
    if (mode === 'archive') _renderArchiveMode(list);
    else if (mode === 'pending') _renderPendingMode(list);
    else if (mode === 'subscribers') _renderSubscribersMode(list);
    else if (_coachClients && _coachDashData) _renderCoachList(list);
}

function _syncCoachToggle() {
    document.querySelectorAll('.coach-mode-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === _coachMode);
    });
}

// עדכון מונה הממתינים על כפתור "ממתינים"
async function _refreshPendingBadge() {
    const badge = document.getElementById('pending-count-badge');
    if (!badge) return;
    try {
        const pend = await sbFetchPendingClients();
        if (pend.length) { badge.textContent = pend.length; badge.style.display = 'inline-block'; }
        else { badge.style.display = 'none'; }
    } catch { badge.style.display = 'none'; }
}

// מצב "ממתינים לאישור" בלוח המנהל
async function _renderPendingMode(list) {
    list.className = 'admin-client-list';
    list.innerHTML = '<div class="admin-loading">טוען...</div>';
    try {
        const pend = await sbFetchPendingClients();
        if (!pend.length) {
            list.innerHTML = '<div class="admin-empty">אין משתמשים שממתינים לאישור</div>';
            return;
        }
        list.innerHTML = '';
        pend.forEach(c => {
            const name = c.name || c.nickname || '(ללא שם)';
            const date = c.created_at ? new Date(c.created_at).toLocaleDateString('he-IL') : '';
            const row = document.createElement('div');
            row.className = 'coach-overview-card';
            row.innerHTML =
                `<div style="font-weight:bold;font-size:15px;color:var(--text-primary,#fff);">${_esc(name)}</div>` +
                `<div style="font-size:13px;color:var(--text-secondary,#888);margin:2px 0 10px;">${_esc(c.email || '')} · נרשם ${date}</div>` +
                `<div style="display:flex;gap:8px;">` +
                  `<button class="admin-approve-btn" data-id="${c.id}" style="flex:1;background:var(--gradient-btn);color:#fff;border:none;border-radius:8px;padding:9px;font-weight:bold;cursor:pointer;">אשר ✓</button>` +
                  `<button class="admin-reject-btn" data-id="${c.id}" data-name="${_esc(name)}" style="flex:1;background:transparent;border:1px solid #e55;color:#e55;border-radius:8px;padding:9px;font-weight:bold;cursor:pointer;">דחה ✕</button>` +
                `</div>`;
            row.querySelector('.admin-approve-btn').addEventListener('click', async function () {
                this.disabled = true; this.textContent = 'מאשר...';
                try {
                    await sbApproveClient(this.dataset.id);
                    _showToast('✅ המשתמש אושר');
                    await _renderPendingMode(list);
                    _refreshPendingBadge();
                } catch (e) { this.disabled = false; this.textContent = 'אשר ✓'; await showAlert('שגיאה: ' + e.message); }
            });
            row.querySelector('.admin-reject-btn').addEventListener('click', async function () {
                const nm = this.dataset.name;
                if (!await showConfirmDanger(`לדחות את ${nm}? המשתמש יועבר לארכיון.`)) return;
                try {
                    await _authedPost('/api/delete-user', { userId: this.dataset.id });
                    _showToast(`🗃️ ${nm} נדחה והועבר לארכיון`);
                    await _renderPendingMode(list);
                    _refreshPendingBadge();
                } catch (e) { await showAlert('שגיאה: ' + e.message); }
            });
            list.appendChild(row);
        });
    } catch (err) {
        list.innerHTML = `<div class="admin-error">שגיאה: ${err.message}</div>`;
    }
}

function _renderCoachList(list) {
    if (_coachMode === 'urgent') _renderUrgentMode(list);
    else                         _renderOverviewMode(list);
}

async function _renderArchiveMode(list) {
    _ensureSearchBar(list);
    list.className = 'admin-client-list';
    list.innerHTML = '<div class="admin-loading">טוען ארכיון...</div>';
    try {
        const deleted = await sbFetchDeletedClients();
        if (!deleted.length) {
            list.innerHTML = '<div class="admin-empty">אין לקוחות בארכיון</div>';
            return;
        }
        list.innerHTML = '';
        deleted.forEach(client => {
            const name = client.name || client.nickname || client.email || '(ללא שם)';
            const deletedDate = new Date(client.deleted_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
            const row = document.createElement('div');
            row.className = 'coach-urgent-row';
            row.dataset.name = name.toLowerCase();
            row.style.opacity = '0.75';
            row.innerHTML = `
                <div class="coach-urgent-left">
                    <div class="coach-urgent-text">
                        <span class="coach-urgent-name">${_esc(name)}</span>
                        <span class="coach-urgent-reason" style="color:#888">נמחק: ${deletedDate}</span>
                    </div>
                </div>
                <div class="coach-urgent-right">
                    <button class="admin-restore-btn" data-client-id="${client.id}" data-client-name="${_esc(name)}" style="background:#4ade80;color:#000;border:none;border-radius:8px;padding:6px 14px;font-size:13px;font-weight:bold;cursor:pointer;">שחזר</button>
                </div>`;
            row.querySelector('.admin-restore-btn').addEventListener('click', function(e) {
                e.stopPropagation();
                restoreClient(this.dataset.clientId, this.dataset.clientName);
            });
            list.appendChild(row);
        });
    } catch (err) {
        list.innerHTML = `<div class="admin-error">שגיאה: ${err.message}</div>`;
    }
}

async function toggleSubscriberMode(clientId, current) {
    const newVal = !current;
    const client = _coachClients?.find(c => c.id === clientId);
    const name   = client?.name || client?.nickname || '';
    if (client) client.is_subscriber = newVal;
    try {
        await sbSetSubscriberMode(clientId, newVal);
        _showToast(newVal ? `💳 ${name} הועבר למנויים` : `✅ ${name} הועבר חזרה לליווי`);
    } catch (e) {
        if (client) client.is_subscriber = current;
        alert('שגיאה בעדכון סטטוס מנוי');
    }
    const list = document.getElementById('admin-client-list');
    if (list) _renderCoachList(list);
}

function _renderSubscribersMode(list) {
    _ensureSearchBar(list);
    list.className = 'admin-client-list';
    list.innerHTML = '';

    if (!_coachClients) {
        list.innerHTML = '<div class="admin-loading">טוען...</div>';
        return;
    }

    const subscribers = _coachClients.filter(c => c.is_subscriber);
    if (!subscribers.length) {
        list.innerHTML = '<div class="admin-empty">אין לקוחות במנוי כרגע</div>';
        return;
    }

    subscribers.forEach(client => {
        const name = client.name || client.nickname || '(ללא שם)';
        const s    = _coachDashData ? _buildClientStats(client) : null;
        const score = s?.currentScore ?? null;
        const bClr  = score === null ? '#444' : score >= 80 ? '#4ade80' : score >= 50 ? '#facc15' : '#f87171';
        const sStr  = score !== null ? Math.round(score) : '—';

        const row = document.createElement('div');
        row.className = 'coach-urgent-row';
        row.dataset.name = name.toLowerCase();
        row.innerHTML = `
            <div class="coach-urgent-left">
                ${_coachInitials(name, client.id)}
                <div class="coach-urgent-text">
                    <span class="coach-urgent-name">${_esc(name)}</span>
                    <span class="coach-urgent-reason" style="color:#60a5fa;font-weight:600;">💳 מנוי פעיל — סיים ליווי</span>
                </div>
            </div>
            <div class="coach-urgent-right">
                <span class="coach-urgent-score" style="color:${bClr}">${sStr}</span>
                <button class="admin-select-btn" data-client-id="${client.id}">כניסה ›</button>
                <button class="coach-unsub-btn" data-client-id="${client.id}" data-is-sub="true" style="background:transparent;border:1px solid #f87171;color:#f87171;border-radius:8px;padding:5px 10px;font-size:12px;cursor:pointer;">החזר לליווי</button>
            </div>`;
        row.querySelector('.admin-select-btn').addEventListener('click', function() {
            adminViewClient(this.dataset.clientId);
        });
        row.querySelector('.coach-unsub-btn').addEventListener('click', function(e) {
            e.stopPropagation();
            toggleSubscriberMode(this.dataset.clientId, true);
        });
        list.appendChild(row);
    });
}

function _buildClientStats(client) {
    const { profiles, scores, workouts, nutrition, monStr, prevMonStr, lastWeightDates } = _coachDashData;
    const profile = profiles.find(p => p.id === client.id) || {};

    const clientScores = scores
        .filter(s => s.client_id === client.id)
        .sort((a, b) => a.week_start.localeCompare(b.week_start));

    const currentWeek = clientScores.find(s => s.week_start === monStr)  || null;
    const prevWeek    = clientScores.find(s => s.week_start === prevMonStr) || null;
    const last4       = clientScores.slice(-4).map(s => s.score);

    const pv = profile.portion_values || {};
    const pvP = pv.protein ?? 27.5;
    const pvC = pv.carbs   ?? 37.5;
    const pvF = pv.fat     ?? 12.5;

    // Portion targets — same formula as app.js calcPortionTargets()
    const weight   = profile.current_weight || 80;
    const age      = profile.birth_date ? Math.floor((new Date() - new Date(profile.birth_date)) / (1000*60*60*24*365.25)) : 30;
    const gender   = profile.gender || 'male';
    const height   = profile.height || 170;
    const activity = profile.activity_level || 1.4;
    const goal     = profile.goal || 'maintain';
    const pRatio   = profile.protein_ratio || 2.0;
    let bmr = (10 * weight) + (6.25 * height) - (5 * age);
    bmr = gender === 'male' ? bmr + 5 : bmr - 161;
    const tdee          = Math.round(bmr * activity);
    const totalCal      = goal === 'cut' ? tdee - 250 : tdee + 250;
    const proteinGrams  = weight * pRatio;
    const remaining     = totalCal - proteinGrams * 4;
    const carbCals      = goal === 'cut' ? remaining * 0.7 : remaining * 0.6;
    const fatCals       = goal === 'cut' ? remaining * 0.3 : remaining * 0.4;
    const tgProtein     = Math.round((proteinGrams / pvP) * 2) / 2;
    const tgCarbs       = Math.round((carbCals / 4 / pvC) * 2) / 2;
    const tgFat         = Math.round((fatCals / 9 / pvF) * 2) / 2;

    const nutritionMeetsGoal = n => n.protein >= tgProtein && n.carbs >= tgCarbs && n.fat >= tgFat;

    const clientWorkouts  = workouts.filter(w => w.client_id === client.id);
    const clientNutrition = nutrition.filter(n => n.user_id  === client.id);

    const hasWorkout = clientWorkouts.length > 0;

    const nutritionBadDays = clientNutrition.filter(n => !nutritionMeetsGoal(n)).length;

    // Live scores for current week (cron only saves at week end)
    const weeklyTarget      = profile.workouts_per_week || 3;
    const workoutDates      = new Set(clientWorkouts.map(w => w.date));
    const liveWorkouts      = Math.min(Math.round(workoutDates.size / weeklyTarget * 100), 100);
    const nutritionMet      = clientNutrition.filter(nutritionMeetsGoal).length;
    const liveNutrition     = Math.min(Math.round(nutritionMet / 7 * 100), 100);
    const lastWeight        = lastWeightDates?.[client.id];
    const liveHabits        = (lastWeight && lastWeight >= monStr) ? 100 : 0;
    const liveScore         = Math.round(liveWorkouts * 0.4 + liveNutrition * 0.4 + liveHabits * 0.2);

    return {
        currentScore:    currentWeek?.score           ?? liveScore,
        prevScore:       prevWeek?.score              ?? null,
        workoutsScore:   currentWeek?.workouts_score  ?? liveWorkouts,
        nutritionScore:  currentWeek?.nutrition_score ?? liveNutrition,
        habitsScore:     currentWeek?.habits_score    ?? liveHabits,
        last4,
        hasWorkout,
        nutritionBadDays,
        vacationMode:      !!(profile.vacation_mode),
        isSubscriber:      !!(profile.is_subscriber),
        lastSeen:          profile.last_seen || null,
        lastWeightUpdate:  lastWeightDates?.[client.id] || null,
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

    return `<svg width="100%" viewBox="0 0 ${VW} ${VH}" style="display:block;background:var(--bg-card-alt);border-radius:8px;overflow:hidden;">
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

function _ensureSearchBar(list) {
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
}

function _coachSearch(query) {
    const q = query.trim().toLowerCase();
    document.querySelectorAll('#admin-client-list .coach-overview-card, #admin-client-list .coach-urgent-row').forEach(el => {
        el.style.display = (!q || (el.dataset.name || '').includes(q)) ? '' : 'none';
    });
}

function _renderUrgentMode(list) {
    list.className = 'admin-client-list';
    _ensureSearchBar(list);
    const items = _coachClients.filter(c => !c.is_subscriber).map(client => {
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
        row.dataset.name = name.toLowerCase();
        row.innerHTML = `
            <div class="coach-urgent-left">
                ${_coachInitials(name, client.id)}
                <div class="coach-urgent-text">
                    <span class="coach-urgent-name">${_esc(name)}</span>
                    <span class="coach-urgent-reason ${cls}">${reason}</span>
                </div>
            </div>
            <div class="coach-urgent-right">
                <span class="coach-urgent-score">${scoreStr}</span>
                <button class="coach-vac-icon${vac ? ' active' : ''}" data-client-id="${client.id}" data-vac="${vac}">🏖️</button>
                <button class="admin-select-btn" data-client-id="${client.id}">כניסה ›</button>
            </div>`;
        row.querySelector('.coach-vac-icon').addEventListener('click', function() {
            toggleVacationMode(this.dataset.clientId, this.dataset.vac === 'true');
        });
        row.querySelector('.admin-select-btn').addEventListener('click', function() {
            adminViewClient(this.dataset.clientId);
        });
        list.appendChild(row);
    });

    if (!list.children.length) {
        list.innerHTML = '<div class="admin-empty">🎉 כל הלקוחות במצב תקין!</div>';
    }
}

function _renderOverviewMode(list) {
    _ensureSearchBar(list);
    list.className = 'admin-client-list coach-overview-list';
    list.innerHTML = '';

    _coachClients.filter(c => !c.is_subscriber).forEach(client => {
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
                ${client.avatar_url
                    ? `<img src="${_esc(client.avatar_url)}" alt="תמונת פרופיל של ${_esc(name)}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span style="display:none">${_coachInitials(name, client.id)}</span>`
                    : _coachInitials(name, client.id)}
                <div style="display:flex;flex-direction:column;flex:1;min-width:0;">
                    <div class="coach-card-name">${_esc(name)}</div>
                    ${(() => {
                        if (!s.lastSeen) return '<span style="font-size:11px;color:#888;">כניסה אחרונה: לא ידוע</span>';
                        const days = Math.floor((Date.now() - new Date(s.lastSeen).getTime()) / 86400000);
                        const clr  = days >= 5 ? '#f87171' : days >= 2 ? '#fb923c' : '#4ade80';
                        const lbl  = days === 0 ? 'היום' : days === 1 ? 'אתמול' : days === 2 ? 'שלשום' : `לפני ${days} ימים`;
                        return `<span style="font-size:11px;color:${clr};">כניסה אחרונה: ${lbl}</span>`;
                    })()}
                    ${(() => {
                        if (!s.lastWeightUpdate) return '<span style="font-size:11px;color:#888;">עדכון משקל אחרון: לא עודכן</span>';
                        const days = Math.floor((Date.now() - new Date(s.lastWeightUpdate + 'T00:00:00').getTime()) / 86400000);
                        const clr  = days >= 14 ? '#f87171' : days >= 7 ? '#fb923c' : '#4ade80';
                        const lbl  = days === 0 ? 'היום' : days === 1 ? 'אתמול' : `לפני ${days} ימים`;
                        return `<span style="font-size:11px;color:${clr};">עדכון משקל אחרון: ${lbl}</span>`;
                    })()}
                </div>
                <div class="coach-card-score" style="color:${bClr}">${sStr}<span class="coach-card-score-unit">pts</span></div>
                <button class="coach-vac-icon${vac ? ' active' : ''}" data-client-id="${client.id}" data-vac="${vac}">🏖️</button>
            </div>
            <div class="coach-card-body">
                <div class="coach-bars">
                    ${_coachScoreBar('אימונים', s.workoutsScore)}
                    ${_coachScoreBar('תזונה',   s.nutritionScore)}
                    ${_coachScoreBar('הרגלים',  s.habitsScore)}
                </div>
                <div class="coach-sparkline">${_coachSparkline(s.last4)}</div>
                <button class="coach-q-btn" data-client-id="${client.id}">📋 שאלון אחרון</button>
                <button class="admin-select-btn" data-client-id="${client.id}" style="width:100%;margin-top:6px">כניסה ›</button>
                <button class="admin-move-subscriber-btn" data-client-id="${client.id}" style="width:100%;margin-top:6px;background:transparent;border:1px solid #60a5fa;color:#60a5fa;border-radius:8px;padding:8px;font-size:13px;cursor:pointer;">💳 העבר למנויים</button>
                <button class="admin-delete-client-btn" data-client-id="${client.id}" data-client-name="${_esc(name)}" style="width:100%;margin-top:6px">🗑️ מחק לקוח</button>
            </div>`;
        card.querySelector('.coach-vac-icon').addEventListener('click', function(e) {
            e.stopPropagation();
            toggleVacationMode(this.dataset.clientId, this.dataset.vac === 'true');
        });
        card.querySelector('.coach-q-btn').addEventListener('click', function(e) {
            e.stopPropagation();
            showQuestionnaireModal(this.dataset.clientId);
        });
        card.querySelector('.admin-select-btn').addEventListener('click', function() {
            adminViewClient(this.dataset.clientId);
        });
        card.querySelector('.admin-move-subscriber-btn').addEventListener('click', async function(e) {
            e.stopPropagation();
            const confirmed = await showConfirmDanger(`להעביר את ${name} למנויים?\nהפיצ'רים של הליווי יעלמו בשביל ${name}.`);
            if (!confirmed) return;
            toggleSubscriberMode(this.dataset.clientId, false);
        });
        card.querySelector('.admin-delete-client-btn').addEventListener('click', function(e) {
            e.stopPropagation();
            deleteClient(this.dataset.clientId, this.dataset.clientName);
        });
        list.appendChild(card);
    });
}

async function adminViewClient(clientId) {
    // Re-verify admin status from DB on every client-view action (not just JS variable)
    const session = await sbGetSession();
    if (!session?.user) return;
    const self = await sbFetchProfile(session.user.id);
    if (!self?.is_admin) {
        console.error('[adminViewClient] Access denied — not admin');
        return;
    }
    document.getElementById('admin-hamburger-btn').style.display = 'none';
    _clearUserLocalStorage();
    await _loadClientAndShowApp(clientId);
}

function adminBackToList() {
    document.getElementById('admin-hamburger-btn').style.display = 'none';
    _clearUserLocalStorage();
    SB_VIEW_ID = null;
    window._authReady = new Promise(r => { _resolveAuthReady = r; });
    _appInitDone = false;
    renderAdminPanel().then(() => _showOverlay('admin-overlay'));
}

// ── New client modal ─────────────────────────────────────────

function openNewClientModal() {
    const modal = document.getElementById('new-client-modal');
    modal.style.display = 'flex';
    document.getElementById('nc-name').value = '';
    document.getElementById('nc-email').value = '';
    document.getElementById('nc-password').value = '';
    document.getElementById('nc-start-date').value = new Date().toISOString().slice(0, 10);
    document.getElementById('nc-birth-date').value = '';
    document.getElementById('nc-start-weight').value = '';
    document.getElementById('nc-goal-weight').value = '';
    document.getElementById('nc-height').value = '';
    document.getElementById('nc-gender').value = 'male';
    document.getElementById('nc-goal').value = 'cut';
    document.getElementById('nc-error').style.display = 'none';
}

function closeNewClientModal() {
    document.getElementById('new-client-modal').style.display = 'none';
}

async function submitNewClient() {
    const name      = document.getElementById('nc-name').value.trim();
    const email     = document.getElementById('nc-email').value.trim();
    const password  = document.getElementById('nc-password').value;
    const startDate = document.getElementById('nc-start-date').value;
    const errEl     = document.getElementById('nc-error');
    const btn       = document.getElementById('nc-submit-btn');

    errEl.style.display = 'none';
    if (!name || !email || !password) {
        errEl.textContent = 'שם, אימייל וסיסמה הם שדות חובה';
        errEl.style.display = 'block';
        return;
    }
    if (password.length < 6) {
        errEl.textContent = 'סיסמה חייבת להכיל לפחות 6 תווים';
        errEl.style.display = 'block';
        return;
    }

    btn.textContent = 'יוצר...';
    btn.disabled = true;

    try {
        await _authedPost('/api/create-user', {
            name,
            email,
            password,
            startDate,
            birthDate:   document.getElementById('nc-birth-date').value   || null,
            startWeight: parseFloat(document.getElementById('nc-start-weight').value) || null,
            goalWeight:  parseFloat(document.getElementById('nc-goal-weight').value)  || null,
            height:      parseInt(document.getElementById('nc-height').value)          || null,
            gender:      document.getElementById('nc-gender').value,
            goal:        document.getElementById('nc-goal').value,
        });
        closeNewClientModal();
        await renderAdminPanel();
    } catch (e) {
        errEl.textContent = e.message;
        errEl.style.display = 'block';
    } finally {
        btn.textContent = 'צור לקוח';
        btn.disabled = false;
    }
}

async function _authedPost(path, body) {
    const session = await sbGetSession();
    if (!session) throw new Error('פג תוקף החיבור — יש לרענן את הדף');
    const resp = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
    });
    const result = await resp.json();
    if (!resp.ok) throw new Error(result.error || 'שגיאת שרת');
    return result;
}

// ── Delete client ─────────────────────────────────────────────

async function deleteClient(clientId, clientName) {
    const confirmed = await showConfirmDanger(`למחוק את ${clientName}? ניתן לשחזר מהארכיון.`);
    if (!confirmed) return;
    try {
        await _authedPost('/api/delete-user', { userId: clientId });
        _showToast(`🗃️ ${clientName} הועבר לארכיון`);
        await renderAdminPanel();
    } catch (e) {
        await showAlert('שגיאה: ' + e.message);
    }
}

async function restoreClient(clientId, clientName) {
    try {
        await _authedPost('/api/restore-user', { userId: clientId });
        _showToast(`✅ ${clientName} שוחזר בהצלחה`);
        const list = document.getElementById('admin-client-list');
        if (list) await _renderArchiveMode(list);
        await renderAdminPanel();
        setCoachMode('overview');
    } catch (e) {
        await showAlert('שגיאה: ' + e.message);
    }
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
            <div class="qmodal-q"><strong>1. ניצחון:</strong><p>${_esc(row.q1_win) || '—'}</p></div>
            <div class="qmodal-q"><strong>2. אתגר:</strong><p>${_esc(row.q2_challenge) || '—'}</p></div>
            <div class="qmodal-q"><strong>3. ציון עמידה:</strong><p>${row.q3_score != null ? row.q3_score + '/10' : '—'}</p></div>
            <div class="qmodal-q"><strong>4. הערות:</strong><p>${_esc(row.q4_topic) || '—'}</p></div>`;
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
            <div class="we-cardio-section">
                <div class="we-cardio-title">🏃 אירובי (אופציונלי)</div>
                <div class="we-cardio-row">
                    <input class="we-input we-cardio-desc" type="text" maxlength="120"
                        placeholder="תיאור: הליכון שיפוע 15 מהירות 4..."
                        value="${CLIENT.cardioPlan?.[letter]?.description || ''}"
                        data-workout="${letter}">
                    <div class="we-cardio-duration-wrap">
                        <input class="we-input we-cardio-duration" type="number" min="1" max="180"
                            placeholder="דקות"
                            value="${CLIENT.cardioPlan?.[letter]?.duration || ''}"
                            data-workout="${letter}">
                        <span class="we-cardio-unit">דק׳</span>
                    </div>
                </div>
            </div>
        `;
        sectionsEl.appendChild(section);
    });
    sectionsEl.querySelectorAll('.we-name-input').forEach(_initExerciseAutocomplete);
}

function _weRowHtml(letter, i, name = '', reps = '10-15', warmupSets = 1, workSets = 2) {
    return `
        <div class="we-row">
            <div class="we-col-name" style="position:relative;">
                <input class="we-input we-name-input" type="text" value="${name}" placeholder="שם תרגיל" data-field="name" data-workout="${letter}" data-idx="${i}">
            </div>
            <input class="we-input we-sets we-col-sets" type="number" min="0" max="9" value="${warmupSets}" data-field="warmupSets" data-workout="${letter}" data-idx="${i}">
            <input class="we-input we-sets we-col-sets" type="number" min="0" max="9" value="${workSets}" data-field="workSets" data-workout="${letter}" data-idx="${i}">
            <input class="we-input we-reps we-col-reps" type="text" value="${reps}" placeholder="10-15" data-field="reps" data-workout="${letter}" data-idx="${i}">
            <button class="we-del-btn we-col-del" onclick="weDeleteRow('${letter}', this)">✕</button>
        </div>`;
}

function _initExerciseAutocomplete(input) {
    const removeDropdown = () => {
        const d = input.parentNode.querySelector('.we-autocomplete');
        if (d) d.remove();
    };
    input.addEventListener('input', () => {
        removeDropdown();
        const val = input.value.trim();
        if (!val) return;
        const matches = Object.keys(exerciseBank).filter(n => n.includes(val)).slice(0, 8);
        if (!matches.length) return;
        const dropdown = document.createElement('div');
        dropdown.className = 'we-autocomplete';
        dropdown.style.cssText = 'position:absolute;top:100%;right:0;left:0;z-index:10001;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.2);max-height:220px;overflow-y:auto;';
        matches.forEach(name => {
            const item = document.createElement('div');
            item.textContent = name;
            item.style.cssText = 'padding:8px 12px;cursor:pointer;font-size:14px;direction:rtl;';
            item.addEventListener('mousedown', e => { e.preventDefault(); input.value = name; removeDropdown(); });
            item.addEventListener('mouseover', () => { item.style.background = 'var(--border)'; });
            item.addEventListener('mouseout', () => { item.style.background = ''; });
            dropdown.appendChild(item);
        });
        input.parentNode.appendChild(dropdown);
    });
    input.addEventListener('blur', () => setTimeout(removeDropdown, 150));
}

function weAddRow(letter) {
    const body = document.getElementById(`we-body-${letter}`);
    const i    = body.querySelectorAll('.we-row').length;
    body.insertAdjacentHTML('beforeend', _weRowHtml(letter, i));
    const newInput = body.querySelector('.we-row:last-child .we-name-input');
    if (newInput) _initExerciseAutocomplete(newInput);
}

function weDeleteRow(letter, btn) {
    btn.closest('.we-row').remove();
}

async function saveWorkoutPlan() {
    const confirmed = await showConfirmDanger('לשמור את תוכנית האימון? הנתונים הקיימים יוחלפו.');
    if (!confirmed) return;
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

            const cardioDesc = document.querySelector(`.we-cardio-desc[data-workout="${letter}"]`)?.value.trim() || '';
            const cardioDur  = parseInt(document.querySelector(`.we-cardio-duration[data-workout="${letter}"]`)?.value) || 0;
            if (!CLIENT.cardioPlan) CLIENT.cardioPlan = {};
            CLIENT.cardioPlan[letter] = cardioDesc ? { description: cardioDesc, duration: cardioDur || null } : null;
        });

        await syncWorkoutPlanNow();
        await initWorkoutsFromClient();
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
        if (e.key === 'Enter' && document.getElementById('terms-cb')?.checked) doLogin();
    });

    try {
        const session = await sbGetSession();
        if (session) {
            const remembered = localStorage.getItem('remember_me') === 'yes'
                             || sessionStorage.getItem('remember_me') === 'session';
            if (!remembered) {
                await sbSignOut();
                showLoginForm();
            } else {
                await handleLoginSuccess(session.user);
            }
        } else {
            showLoginForm();
        }
    } catch (err) {
        console.error('[Auth] init:', err);
        showLoginForm('שגיאת חיבור. בדוק אינטרנט ונסה שוב.');
    }
});
