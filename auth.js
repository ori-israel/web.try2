// ============================================================
// auth.js — Authentication, login UI, admin panel
// ============================================================

function _showHeightInInches(val) {
    const el = document.getElementById('height-inches-hint');
    if (!el) return;
    const cm = parseInt(val);
    if (cm >= 100 && cm <= 250) {
        const totalInches = cm / 2.54;
        const feet = Math.floor(totalInches / 12);
        const inches = Math.round(totalInches % 12);
        el.textContent = '≈ ' + feet + '′' + inches + '″';
    } else {
        el.textContent = '';
    }
}

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
    // משתמש שנכנס לאפליקציה בוודאי אינו "ממתין" יותר
    try { sessionStorage.removeItem('oi_pending_signup'); } catch (e) {}
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
    // זוכר שהמשתמש ממתין — כדי שהמסך יישאר גם אחרי רענון (למשל עדכון SW)
    try { sessionStorage.setItem('oi_pending_signup', '1'); } catch (e) {}
    _showOverlay('login-overlay');
    document.getElementById('login-form-section').style.display    = 'none';
    document.getElementById('login-loading-section').style.display = 'none';
    document.getElementById('login-signup-section').style.display  = 'none';
    document.getElementById('login-pending-section').style.display = 'flex';
}

// יציאה ממסך ההמתנה (לחיצה על "חזרה למסך הכניסה")
function leavePendingScreen() {
    try { sessionStorage.removeItem('oi_pending_signup'); } catch (e) {}
    showLoginForm();
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
    // הגנה כפולה: משתמש רגיל (לא אדמין) שאינו מאושר לעולם לא יראה את האפליקציה.
    // אדמין שצופה בלקוח עובר (SB_IS_ADMIN=true). זה גם חוסם מסלולי כניסה עתידיים.
    if (!SB_IS_ADMIN) {
        const _p = await sbFetchProfile(userId).catch(() => null);
        if (!_p || _p.status !== 'approved') {
            await sbSignOut().catch(() => {});
            SB_USER = null;
            showPendingScreen();
            return;
        }
    }
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
    const theme = localStorage.getItem('theme') || 'auto';
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
    } catch (err) {
        const msg  = (err?.message || '').toLowerCase();
        const code = (err?.code || '').toLowerCase();
        // משתמש חסום = ממתין לאישור המנהל → מסך ההמתנה במקום שגיאה
        if (code === 'user_banned' || msg.includes('banned')) {
            showPendingScreen();
            return;
        }
        if (msg.includes('email not confirmed') || code === 'email_not_confirmed') {
            errorEl.textContent = 'יש לאשר תחילה את קישור האימות שנשלח למייל';
        } else {
            errorEl.textContent = 'אימייל או סיסמה שגויים';
        }
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
    if (!Number.isInteger(parseFloat(height)) || parseFloat(height) < 100) { errorEl.textContent = 'יש להכניס גובה בסנטימטרים, לדוגמה: 172'; return; }

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
            : (msg.includes('rate limit') || msg.includes('rate_limit') || msg.includes('too many')) ? 'יותר מדי ניסיונות — יש להמתין כשעה ולנסות שוב'
            : ('שגיאה: ' + (error.message || 'יש לנסות שוב'));
        btn.disabled    = false;
        btn.textContent = 'יצירת חשבון';
        return;
    }
    // יציאה מכל חיבור שאולי נוצר (אם אימות מייל כבוי) — המשתמש לא נכנס עד אישור
    await sbSignOut().catch(() => {});
    // איפוס הטופס לפעם הבאה
    errorEl.textContent = '';
    btn.disabled = false;
    btn.textContent = 'יצירת חשבון';
    ['signup-name','signup-email','signup-password','signup-birth-date','signup-start-weight','signup-goal-weight','signup-height'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    // מעבר ישיר למסך "ממתין לאישור"
    showPendingScreen();
}

async function doLogout() {
    if (!await showConfirmDanger('להתנתק?')) return;
    _clearUserLocalStorage();
    try { sessionStorage.removeItem('oi_pending_signup'); } catch (e) {}
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
        } else if (sessionStorage.getItem('oi_pending_signup')) {
            // נרשם זה עתה וממתין לאישור — נשאר במסך ההמתנה גם אחרי רענון
            showPendingScreen();
        } else {
            showLoginForm();
        }
    } catch (err) {
        console.error('[Auth] init:', err);
        showLoginForm('שגיאת חיבור. בדוק אינטרנט ונסה שוב.');
    }
});
