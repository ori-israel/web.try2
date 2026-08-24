// ===== ליבה: כלים, דיאלוגים, תפריט, מצב כהה, וידאו, PWA, רשת, FAQ, תמונות התקדמות =====

// קלוריות של פריט בודד ביומן: אם יש ערך קלוריות מדויק ששמור על הפריט (kcal_g,
// נקרא ישירות מתווית היצרן) — משתמשים בו כמו שהוא. אחרת נופלים לחישוב מהמאקרו
// (חלבון/פחמימה *4, שומן *9, אלכוהול *7). המספר על התווית אמין יותר כי היצרן
// מחשב לפי ערכים אמיתיים (ממתיקים/סיבים שנספרים כפחמימה אבל נותנים פחות קלוריות).
function entryKcal(o) {
    if (!o) return 0;
    if (o.kcal_g != null) return o.kcal_g;
    return (o.protein_g || 0) * 4 + (o.carbs_g || 0) * 4 + (o.fat_g || 0) * 9 + (o.alcohol_g || 0) * 7;
}

// Disable double-tap zoom, keep pinch zoom
(function() {
    var lastTap = 0;
    document.addEventListener('touchend', function(e) {
        var now = Date.now();
        if (now - lastTap < 300) e.preventDefault();
        lastTap = now;
    }, { passive: false });
})();

// גובה + מיקום ה-viewport האמיתי הנראה כשהמקלדת פתוחה.
// באייפון, position:fixed נשאר מחובר ל-layout viewport (כולל השטח שהמקלדת מכסה),
// לא ל-visual viewport (מה שבאמת נראה) — בלי זה מודל "קבוע" זז/נחתך כשהמקלדת נפתחת.
// --vvh/--vvtop עוקבים אחרי מה שבאמת נראה, ו-.kb-open מסמן שהמקלדת כנראה פתוחה.
// --kb-height הוא גובה השטח שהמקלדת תופסת, לשימוש כ-padding-bottom בפופאפים
// כדי שהם ימורכזו בשטח הנראה בפועל, בלי לחתוך את הרקע הכהה שמכסה הכל.
(function() {
    if (!window.visualViewport) return;
    var vv = window.visualViewport;
    function update() {
        document.documentElement.style.setProperty('--vvh', vv.height + 'px');
        document.documentElement.style.setProperty('--vvtop', vv.offsetTop + 'px');
        var kbOpen = (window.innerHeight - vv.height) > 120;
        document.documentElement.classList.toggle('kb-open', kbOpen);
        document.documentElement.style.setProperty('--kb-height', (kbOpen ? Math.max(0, window.innerHeight - vv.height) : 0) + 'px');
    }
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
})();

// נעילת גלילת הדף כשמודל/פופאפ פתוח — מונע קפיצה/היעלמות של אלמנטים קבועים
// באייפון כשהמקלדת נפתחת (position:fixed מתנהג לא צפוי אם הדף מאחוריו זז).
// מקור אמת יחיד לכל האתר: כל modal-overlay (חוץ מ-app-dialog) + barcode-scanner-modal
// דרך MutationObserver גנרי, רשימת IDs קבועה לפופאפים במבנה אחר, ומונה ידני
// לאוברליים שנוצרים דינמית (תמונת התקדמות, גרף כוח, שיא אישי).
(function() {
    var scrollY = 0;
    var EXTRA_MODAL_IDS = [
        'weight-chart-modal', 'profile-overlay', 'new-client-modal', 'workout-editor-modal',
        'calendly-modal', 'achievement-popup', 'workout-complete-msg',
        'pwa-install-popup', 'renewal-reminder-popup', 'pwa-ios-popup', 'birthday-modal',
        'weekly-survey-banner', 'ai-chat-overlay', 'survey-overlay'
    ];
    var dynamicOverlayCount = 0;
    window._dynamicOverlayOpen = function () { dynamicOverlayCount++; updateBodyLock(); };
    window._dynamicOverlayClosed = function () { dynamicOverlayCount = Math.max(0, dynamicOverlayCount - 1); updateBodyLock(); };

    function _isVisible(el) {
        if (!el || el.classList.contains('hidden')) return false;
        return getComputedStyle(el).display !== 'none';
    }
    function isAnyModalOpen() {
        if (dynamicOverlayCount > 0) return true;
        // app-dialog (אישור/התראה) לא כולל שדה קלט בפועל (showPrompt לא בשימוש) - לא זקוק לנעילה הכבדה
        // שמיועדת להגנה מפני מקלדת. נעילה עליו גרמה לקפיצה ויזואלית למעלה וחזרה בכל אישור/מחיקה
        if (document.querySelector('.modal-overlay:not(#app-dialog):not(.hidden)')) return true;
        if (_isVisible(document.getElementById('barcode-scanner-modal'))) return true;
        return EXTRA_MODAL_IDS.some(id => _isVisible(document.getElementById(id)));
    }
    function updateBodyLock() {
        var shouldLock = isAnyModalOpen();
        var isLocked = document.documentElement.classList.contains('modal-open');
        if (shouldLock && !isLocked) {
            scrollY = window.scrollY || 0;
            document.documentElement.classList.add('modal-open');
            document.body.style.top = -scrollY + 'px';
        } else if (!shouldLock && isLocked) {
            document.documentElement.classList.remove('modal-open');
            document.body.style.top = '';
            window.scrollTo(0, scrollY);
        }
    }
    var observer = new MutationObserver(updateBodyLock);
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    document.addEventListener('DOMContentLoaded', updateBodyLock);
    updateBodyLock();

    // חסימה ישירה של מחוות גלילה מחוץ לתוכן הגלילי של המודל עצמו — הגנה כפולה,
    // כי position:fixed לבד לא תמיד אמין מספיק לחסימת גלילה באייפון
    document.addEventListener('touchmove', function(e) {
        if (!document.documentElement.classList.contains('modal-open')) return;
        if (e.target.closest('.modal-card, .bc-confirm-body, .bc-notfound-body, .bc-video')) return;
        e.preventDefault();
    }, { passive: false });
})();

function localDateStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}


// ── Custom dialog (replaces alert / confirm / prompt) ────────
function _appDialog({ message, withInput = false, defaultValue = '', okLabel = 'אישור', cancelLabel = null, okClass = 'primary-btn' }) {
    return new Promise(resolve => {
        const dialogEl = document.getElementById('app-dialog');
        document.getElementById('app-dialog-msg').textContent = message;
        const inputEl  = document.getElementById('app-dialog-input');
        const cancelEl = document.getElementById('app-dialog-cancel');
        const okEl     = document.getElementById('app-dialog-ok');
        inputEl.style.display  = withInput    ? 'block' : 'none';
        cancelEl.style.display = cancelLabel  ? 'inline-flex' : 'none';
        inputEl.value      = defaultValue;
        cancelEl.textContent = cancelLabel || '';
        okEl.textContent     = okLabel;
        okEl.className = `app-dialog-btn ${okClass}`;
        dialogEl.classList.remove('hidden');
        if (withInput) setTimeout(() => inputEl.focus(), 50);

        const done = (val) => {
            dialogEl.classList.add('hidden');
            dialogEl.removeEventListener('click', outsideClick);
            okEl.onclick = cancelEl.onclick = inputEl.onkeydown = null;
            resolve(val);
        };
        const outsideClick = (e) => {
            if (e.target === dialogEl) done(cancelLabel ? (withInput ? null : false) : true);
        };
        dialogEl.addEventListener('click', outsideClick);
        okEl.onclick     = () => done(withInput ? (inputEl.value.trim() || null) : true);
        cancelEl.onclick = () => done(withInput ? null : false);
        inputEl.onkeydown = (e) => { if (e.key === 'Enter') okEl.click(); if (e.key === 'Escape') cancelEl.click(); };
    });
}
function showAlert(msg)              { return _appDialog({ message: msg, okLabel: 'סגור', okClass: 'secondary-btn' }); }
function showConfirm(msg)            { return _appDialog({ message: msg, okLabel: 'כן', cancelLabel: 'לא' }); }
function showConfirmDanger(msg)      { return _appDialog({ message: msg, okLabel: 'כן', cancelLabel: 'לא', okClass: 'danger-btn' }); }
function showPrompt(msg, def = '')   { return _appDialog({ message: msg, withInput: true, defaultValue: def, okLabel: 'אישור', cancelLabel: 'ביטול' }); }

function toggleHamburger(event) {
    event.stopPropagation();
    document.querySelector('.hamburger-menu').classList.toggle('open');
}

document.addEventListener('click', function(e) {
    const menu = document.querySelector('.hamburger-menu');
    if (menu && menu.classList.contains('open') && !menu.contains(e.target)) {
        menu.classList.remove('open');
    }
});

function _setThemeBtn(setting) {
    const sel = document.getElementById('theme-select');
    if (sel) sel.value = setting;
}

function _applyTheme(setting) {
    let actual = setting;
    if (setting === 'auto') {
        actual = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', actual);
    _setThemeBtn(setting);
}

function setTheme(value) {
    localStorage.setItem('theme', value);
    _applyTheme(value);
    if (typeof syncThemeNow === 'function') syncThemeNow(value);
    renderWeightChart();
}

(function initTheme() {
    const saved = localStorage.getItem('theme') || 'auto';
    _applyTheme(saved);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if ((localStorage.getItem('theme') || 'auto') === 'auto') _applyTheme('auto');
    });
})();

    function calcPortionTargets() {
    const weight = parseFloat(sessionStorage.getItem('current_weight')) || CLIENT.currentWeight;
    const ageCalc = Math.floor((new Date() - new Date(CLIENT.birthDate)) / (1000 * 60 * 60 * 24 * 365.25));
    return calcNutritionTargets({
        weight, height: CLIENT.height, age: ageCalc, gender: CLIENT.gender,
        activityLevel: CLIENT.activityLevel, goal: CLIENT.goal,
        proteinRatio: CLIENT.proteinRatio, carbRatio: CLIENT.carbRatio
    });
}

    function generatePortionGoals() {
    const { totalCalories, proteinGrams, carbsGrams, fatGrams } = calcPortionTargets();

    // עדכון HTML — יעדים בגרמים (המסך היומי עובד בגרמים, לא במנות)
    document.getElementById('protein-target').innerText = `/ ${proteinGrams}`;
    document.getElementById('carbs-target').innerText = `/ ${carbsGrams}`;
    document.getElementById('fat-target').innerText = `/ ${fatGrams}`;
    const kcalTargetEl = document.getElementById('kcal-target');
    if (kcalTargetEl) kcalTargetEl.innerText = totalCalories;
    window._getGramTargets = () => ({ protein: proteinGrams, carbs: carbsGrams, fat: fatGrams, totalCalories });
    // היעדים רק עכשיו הפכו זמינים — לרענן את חיווי הקלוריות שתלוי בהם (יכול היה לרוץ קודם בלי טווח)
    if (typeof addFoodMacros === 'function') addFoodMacros();

    const goalText = CLIENT.goal === 'cut' ? 'חיטוב' : CLIENT.goal === 'maintain' ? 'שמירה על המשקל הנוכחי' : 'מסה';
    document.getElementById('header-goal-display').innerText = `${goalText} | ${totalCalories} קק"ל`;
    // שם המאמן מוצג רק ללקוחות ליווי - למנויים אין מאמן אישי, השורה נסגרת לגמרי
    const coachLine = document.getElementById('coach-name-line');
    if (coachLine) {
        if (CLIENT.isSubscriber) {
            coachLine.style.display = 'none';
        } else {
            coachLine.style.display = '';
            const coachEl = document.getElementById('coach-name-display');
            if (coachEl) coachEl.textContent = COACH_NAME;
        }
    }
    document.title = `פורטל הליווי של ${CLIENT.name}`;
    const h1 = document.querySelector('h1');
    h1.innerText = `תוכנית הכושר של ${CLIENT.name}`;
    h1.style.visibility = 'visible';

    // מיישר בפועל את האות הראשונה של שורת היעד לאות הראשונה של הכותרת.
    // קופסת האלמנט כבר מיושרת (נבדק), הפער האמיתי הוא ברמת הגליף עצמו -
    // לכן מודדים את המיקום המדויק של האות הראשונה בפועל (Range), לא את קופסת האלמנט
    function _firstCharRight(el) {
        const textNode = el.firstChild;
        if (!textNode || textNode.nodeType !== Node.TEXT_NODE || !textNode.textContent.length) return null;
        const range = document.createRange();
        range.setStart(textNode, 0);
        range.setEnd(textNode, 1);
        const rects = range.getClientRects();
        return rects.length ? rects[0].right : null;
    }
    function _alignHeaderGoalLine() {
        const goalLine = document.getElementById('header-goal-display');
        if (!h1 || !goalLine) return;
        goalLine.style.marginRight = '0px';
        const h1Right = _firstCharRight(h1);
        const goalRight = _firstCharRight(goalLine);
        if (h1Right == null || goalRight == null) return;
        goalLine.style.marginRight = (goalRight - h1Right) + 'px';
    }
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(_alignHeaderGoalLine);
    }
    requestAnimationFrame(_alignHeaderGoalLine);

}

function _youtubeEmbedUrl(url) {
    try {
        const u = new URL(url);
        let id;
        if (u.hostname === 'youtu.be') {
            id = u.pathname.slice(1);
        } else if (u.pathname.includes('/shorts/')) {
            id = u.pathname.split('/shorts/')[1].split('?')[0];
        } else {
            id = u.searchParams.get('v');
        }
        return id ? `https://www.youtube.com/embed/${id}?autoplay=1` : null;
    } catch { return null; }
}

function openVideoModal(url) {
    const embedUrl = _youtubeEmbedUrl(url);
    if (!embedUrl) return;
    document.getElementById('video-modal-iframe').src = embedUrl;
    document.getElementById('video-modal').classList.remove('hidden');
}

function closeVideoModal() {
    document.getElementById('video-modal').classList.add('hidden');
    document.getElementById('video-modal-iframe').src = '';
}

function initVideos() {
    const tables = document.querySelectorAll('.workout-table');
    tables.forEach(table => {
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
            const exerciseName = row.cells[1].innerText.trim();
            const videoCell = row.querySelector('.video-cell');
            const bankUrl = exerciseBank[exerciseName];
            if (videoCell) {
                if (bankUrl) {
                    const btn = document.createElement('button');
                    btn.className = 'play-link';
                    btn.textContent = '▶';
                    btn.addEventListener('click', () => openVideoModal(bankUrl));
                    videoCell.innerHTML = '';
                    videoCell.appendChild(btn);
                } else {
                    videoCell.textContent = '-';
                }
            }
        });
    });
}

window.addEventListener('offline', () => {
    const banner = document.getElementById('offline-banner');
    if (banner) banner.style.display = 'block';
});

window.addEventListener('online', () => {
    const banner = document.getElementById('offline-banner');
    if (banner) banner.style.display = 'none';
    const toast = document.getElementById('supabase-error-toast');
    if (toast) {
        toast.innerHTML = 'התחברת מחדש <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M5 13l4 4L19 7"/></svg>';
        toast.style.background = '#22c55e';
        toast.style.display = 'block';
        clearTimeout(window._onlineToastTimer);
        window._onlineToastTimer = setTimeout(() => {
            toast.style.display = 'none';
            toast.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M12 9v4"/><path d="M10.3 3.9L2.5 18a1.5 1.5 0 0 0 1.3 2.2h16.4a1.5 1.5 0 0 0 1.3-2.2L13.7 3.9a1.5 1.5 0 0 0-2.6 0z"/><circle cx="12" cy="16.5" r="0.6" fill="currentColor" stroke="none"/></svg> בעיית תקשורת, מנסה שוב';
            toast.style.background = '#e55';
        }, 3000);
    }
});

// ── PWA install ──────────────────────────────────────────────
let _deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    _deferredInstallPrompt = e;
});

window.addEventListener('appinstalled', () => {
    localStorage.setItem('pwa_installed', 'yes');
    _deferredInstallPrompt = null;
});

function _isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function _applySubscriberMode() {
    const hide = CLIENT.isSubscriber;
    const ids = ['calendly-hamburger-btn', 'open-survey-btn', 'coaching-goal-card', 'whatsapp-top-btn'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = hide ? 'none' : '';
    });
    // באנרים — מוסתרים תמיד למנויים
    ['weekly-survey-banner', 'meeting-reminder-banner'].forEach(id => {
        const el = document.getElementById(id);
        if (el && hide) el.style.display = 'none';
    });
}

function _showPWAPromptIfNeeded() {
    if (localStorage.getItem('pwa_prompt_shown')) return;
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    setTimeout(() => {
        const popup = document.getElementById('pwa-install-popup');
        if (popup) popup.style.cssText = 'display:flex;align-items:center;justify-content:center;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;';
    }, 2500);
}

function pwaInstallYes() {
    document.getElementById('pwa-install-popup').style.display = 'none';
    localStorage.setItem('pwa_prompt_shown', 'yes');
    if (_isIOS()) {
        const p = document.getElementById('pwa-ios-popup');
        p.style.cssText = 'display:flex;align-items:center;justify-content:center;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;';
    } else if (_deferredInstallPrompt) {
        _deferredInstallPrompt.prompt();
        _deferredInstallPrompt.userChoice.then(() => { _deferredInstallPrompt = null; });
    }
}

function pwaInstallLater() {
    document.getElementById('pwa-install-popup').style.display = 'none';
    localStorage.setItem('pwa_prompt_shown', 'later');
}

function pwaIosClose() {
    document.getElementById('pwa-ios-popup').style.display = 'none';
}

// ── תזכורת חידוש מנוי — לכולם חוץ ממי שמחויב אוטומטית באמת (auto_billing), בימים מדויקים: 14/7/3/2/1 ──
function checkSubscriptionRenewalReminder() {
    if (CLIENT.autoBilling) return;
    const endDateStr = CLIENT.subscriptionEndDate;
    if (!endDateStr) return;

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const end = new Date(endDateStr + 'T00:00:00');
    const daysLeft = Math.round((end - today) / 86400000);
    if (![14, 7, 3, 2, 1].includes(daysLeft)) return;

    const uid = getActiveUserId();
    if (!uid) return;
    const todayStr = today.toISOString().split('T')[0];
    const key = 'renewal_popup_shown_' + uid;
    if (localStorage.getItem(key) === todayStr) return;
    localStorage.setItem(key, todayStr);

    const textEl = document.getElementById('renewal-reminder-text');
    if (textEl) textEl.textContent = `המנוי שלך מסתיים בעוד ${daysLeft} ${daysLeft === 1 ? 'יום' : 'ימים'}. כדאי לחדש כדי לא לאבד גישה.`;
    const popup = document.getElementById('renewal-reminder-popup');
    if (popup) popup.style.cssText = 'display:flex;align-items:center;justify-content:center;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;';
}

function dismissRenewalReminder() {
    document.getElementById('renewal-reminder-popup').style.display = 'none';
}

function triggerPWAInstall() {
    if (window.matchMedia('(display-mode: standalone)').matches || (!_isIOS() && localStorage.getItem('pwa_installed'))) {
        const toast = document.createElement('div');
        toast.innerHTML = 'האפליקציה כבר נמצאת במסך הבית <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M5 13l4 4L19 7"/></svg>';
        toast.style.cssText = `position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:var(--accent);color:white;padding:12px 24px;border-radius:25px;font-size:15px;font-weight:bold;z-index:100001;box-shadow:0 4px 15px rgba(0,0,0,0.2);white-space:nowrap;`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
        return;
    }
    if (_isIOS()) {
        const p = document.getElementById('pwa-ios-popup');
        p.style.cssText = 'display:flex;align-items:center;justify-content:center;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;';
    } else if (_deferredInstallPrompt) {
        _deferredInstallPrompt.prompt();
        _deferredInstallPrompt.userChoice.then(() => { _deferredInstallPrompt = null; });
    } else {
        showAlert('כדי להוסיף למסך הבית, השתמש בתפריט הדפדפן');
    }
}

   window.onload = async () => {
    // ממתין לאימות Supabase לפני אתחול האפליקציה
    if (window._authReady) await window._authReady;
    if (typeof _appInitDone !== 'undefined' && _appInitDone) return;
    manageDailyReset();
    updateCounter();
    initVideos();
    loadDailyNutrition();
    renderFoodLog();
    loadChecklist();
    generatePortionGoals();
    initWorkoutJournal();
    loadSavedWeight();
    loadCoachingGoal();
    updateWorkoutStreak();
    updateNutritionStreak();
    setTimeout(renderWeightChart, 100);
    checkBirthday();
    checkThursdayBanner();
    _showPWAPromptIfNeeded();
    _applySubscriberMode();
    if (typeof _applyReportExportVisibility === 'function') _applyReportExportVisibility();
    if (window.Tour && typeof Tour.maybeAutoRun === 'function') Tour.maybeAutoRun();
};

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        // keepalive save — survives iOS page kill
        const uid = typeof getActiveUserId === 'function' ? getActiveUserId() : null;
        if (uid) {
            const p = JSON.parse(localStorage.getItem(_portionsKey()) || '{}');
            if (p.protein || p.carbs || p.fat) {
                if (typeof sbQueueNutritionSync === 'function') {
                    sbQueueNutritionSync(uid, p.protein || 0, p.carbs || 0, p.fat || 0);
                } else if (typeof sbSaveNutrition === 'function') {
                    sbSaveNutrition(uid, p.protein || 0, p.carbs || 0, p.fat || 0).catch(() => {});
                }
            }
        }
    }
    if (document.visibilityState === 'visible' && typeof loadDailyNutrition === 'function') {
        manageDailyReset();
        loadDailyNutrition();
        // בדיקת באנרים כשהמשתמש חוזר לאפליקציה — תופס מעבר שעת ההצגה בלי רענון
        if (typeof checkThursdayBanner  === 'function') checkThursdayBanner();
        if (typeof checkMeetingReminder === 'function') checkMeetingReminder();
    }
});

window.addEventListener('pageshow', (e) => {
    if (e.persisted && typeof loadDailyNutrition === 'function') {
        loadDailyNutrition();
    }
});

    function toggleAccordion(id) {
        const content = document.getElementById(id);
        const allAccordions = document.querySelectorAll('.accordion-content');
        
        // סגירת שאר האקורדיונים
        allAccordions.forEach(acc => {
            if (acc.id !== id) {
                acc.style.display = 'none';
            }
        });

        // פתיחה או סגירה של הנוכחי
        if (content.style.display === 'block') {
            content.style.display = 'none';
        } else {
    content.style.display = 'block';
    if (id.startsWith('perf-')) initWorkoutJournal();
}
    }

    function toggleChapter(btn) {
  const container = btn.parentElement;
  const isActive = container.classList.contains('active');
  
  // סגירת כל הפרקים האחרים
  document.querySelectorAll('.chapter-container').forEach(c => {
    c.classList.remove('active');
  });

  // פתיחה/סגירה של הנוכחי
  if (!isActive) {
    container.classList.add('active');
  }
}

function toggleTerm(header) {
  const item = header.parentElement;
  item.classList.toggle('active');
}

function filterInfo() {
  const input = document.getElementById('infoSearch');
  const filter = input.value.toLowerCase().trim();
  const chapters = document.querySelectorAll('.chapter-container');

  chapters.forEach(chapter => {
    const terms = chapter.querySelectorAll('.term-item');
    let chapterHasMatch = false;

    terms.forEach(term => {
      // שינוי קריטי: שומרים את ה-HTML המקורי לתצוגה בלבד
      if (!term.dataset.originalHtml) {
          term.dataset.originalHtml = term.innerHTML;
      }
      
      const originalHtml = term.dataset.originalHtml;
      // החיפוש מתבצע אך ורק על הטקסט שהמשתמש רואה בעיניים
      const plainText = term.innerText.toLowerCase();

      if (plainText.includes(filter)) {
        term.style.display = ""; 
        chapterHasMatch = true;
        
        if (filter.length > 0) {
            // מדגישים בתוך ה-HTML המקורי, אבל רק על בסיס התאמה בטקסט הנקי
            term.innerHTML = highlightText(originalHtml, filter);
        } else {
            term.innerHTML = originalHtml;
        }
      } else {
        term.style.display = "none";
      }
    });

    // ניהול נראות הפרק (Chapter)
    if (chapterHasMatch) {
      chapter.style.display = "";
      if (filter.length > 0) {
        chapter.classList.add('active');
      }
    } else {
      chapter.style.display = "none";
    }
    
    // ניקוי חיפוש
    if (filter === "") {
      chapter.classList.remove('active');
      terms.forEach(t => {
          if (t.dataset.originalHtml) t.innerHTML = t.dataset.originalHtml;
      });
    }
  });
}

function highlightText(html, filter) {
    if (!filter) return html;

    // יוצרים אלמנט זמני כדי לעבוד על הטקסט מבלי לפגוע במקור
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    // פונקציה רקורסיבית שעוברת רק על צומתי טקסט (Text Nodes)
    const walk = (node) => {
        if (node.nodeType === 3) { // Text node
            const text = node.nodeValue;
            const escapedFilter = filter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(${escapedFilter})`, 'gi');
            if (regex.test(text)) {
                const span = document.createElement('span');
                span.innerHTML = text.replace(regex, '<mark style="background-color: yellow; color: black;">$1</mark>');
                node.parentNode.replaceChild(span, node);
            }
        } else if (node.nodeType === 1 && node.childNodes && !['SCRIPT', 'STYLE'].includes(node.tagName)) {
            // עוברים על הילדים של האלמנט (אבל מדלגים על סקריפטים)
            Array.from(node.childNodes).forEach(walk);
        }
    };

    walk(tempDiv);
    return tempDiv.innerHTML;
}

// רשימת השאלות והתשובות המלאה - ללא מספור


// פונקציה לבניית השאלות הנפוצות
function initFAQ() {
    const container = document.getElementById('faq-categories-container');
    if (!container) return;

    container.innerHTML = ''; 

    faqData.forEach((item) => {
        const chapterDiv = document.createElement('div');
        chapterDiv.className = 'chapter-container';

        chapterDiv.innerHTML = `
            <button class="chapter-btn" onclick="toggleChapter(this)">
                <span><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 4.8 1c0 1.5-2.3 1.8-2.3 3.5"/><circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none"/></svg> ${item.category}</span>
                <span class="arrow">▼</span>
            </button>
            <div class="chapter-content">
                ${item.questions.map(qObj => `
                    <div class="term-item">
                        <div class="term-header" onclick="toggleTerm(this)">${qObj.q}</div>
                        <div class="term-body">${qObj.a}</div>
                    </div>
                `).join('')}
            </div>
        `;
        container.appendChild(chapterDiv);
    });
}

// הפעלה בטעינת הדף
    document.addEventListener('DOMContentLoaded', () => {
        initFAQ();
        initVideos();
        showWorkout('A');
    });

    // ── עדכון משקל נוכחי — סרגל גרירה (בוטום שיט) ──────────────────────
    const _WEIGHT_RULER_MIN = 30, _WEIGHT_RULER_MAX = 250, _WEIGHT_RULER_STEP = 0.5, _WEIGHT_RULER_TICK_GAP = 14;
    let _weightRulerValue = 70;
    let _weightRulerReady = false;

    function _weightRulerOffsetFor(v) {
        // הקווים ממורכזים בתוך תא ברוחב TICK_GAP — צריך להוסיף חצי תא כדי שהמחוג יתיישר בדיוק על הקו
        return -((v - _WEIGHT_RULER_MIN) / _WEIGHT_RULER_STEP) * _WEIGHT_RULER_TICK_GAP - _WEIGHT_RULER_TICK_GAP / 2;
    }

    function _buildWeightRulerTicks() {
        const track = document.getElementById('weight-ruler-track');
        if (!track) return;
        track.innerHTML = '';
        const n = Math.round((_WEIGHT_RULER_MAX - _WEIGHT_RULER_MIN) / _WEIGHT_RULER_STEP);
        for (let i = 0; i <= n; i++) {
            const v = _WEIGHT_RULER_MIN + i * _WEIGHT_RULER_STEP;
            const isMajor = Math.abs(v - Math.round(v)) < 0.001 && Math.round(v) % 5 === 0;
            const t = document.createElement('div');
            t.className = 'weight-ruler-tick' + (isMajor ? ' major' : '');
            const line = document.createElement('div');
            line.className = 'weight-ruler-tick-line';
            t.appendChild(line);
            if (isMajor) {
                const lbl = document.createElement('div');
                lbl.className = 'weight-ruler-tick-label';
                lbl.textContent = Math.round(v);
                t.appendChild(lbl);
            }
            track.appendChild(t);
        }
    }

    function _renderWeightRuler() {
        const track = document.getElementById('weight-ruler-track');
        const valEl = document.getElementById('weight-ruler-value');
        if (!track || !valEl) return;
        track.style.transform = `translateX(${_weightRulerOffsetFor(_weightRulerValue)}px)`;
        valEl.textContent = _weightRulerValue.toFixed(1);
    }

    function _initWeightRulerDrag() {
        if (_weightRulerReady) return;
        _weightRulerReady = true;
        const wrap = document.getElementById('weight-ruler-wrap');
        const track = document.getElementById('weight-ruler-track');
        if (!wrap || !track) return;
        let dragging = false, startX = 0, startOffset = 0;
        const pointerX = e => e.touches ? e.touches[0].clientX : e.clientX;
        const minOffset = _weightRulerOffsetFor(_WEIGHT_RULER_MAX);
        const maxOffset = _weightRulerOffsetFor(_WEIGHT_RULER_MIN);

        wrap.addEventListener('pointerdown', e => {
            dragging = true;
            track.style.transition = 'none';
            startX = pointerX(e);
            startOffset = _weightRulerOffsetFor(_weightRulerValue);
        });
        window.addEventListener('pointermove', e => {
            if (!dragging) return;
            let newOffset = startOffset + (pointerX(e) - startX);
            newOffset = Math.max(minOffset, Math.min(maxOffset, newOffset));
            _weightRulerValue = _WEIGHT_RULER_MIN + (-newOffset / _WEIGHT_RULER_TICK_GAP) * _WEIGHT_RULER_STEP;
            _renderWeightRuler();
        });
        window.addEventListener('pointerup', () => {
            if (!dragging) return;
            dragging = false;
            _weightRulerValue = Math.round(_weightRulerValue * 10) / 10;
            track.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
            _renderWeightRuler();
        });
    }

    function openWeightUpdateSheet() {
        const el = document.getElementById('current-weight-display');
        const overlay = document.getElementById('weight-sheet-overlay');
        if (!el || !overlay) return;
        const current = parseFloat(el.innerText);
        _weightRulerValue = !isNaN(current)
            ? Math.max(_WEIGHT_RULER_MIN, Math.min(_WEIGHT_RULER_MAX, Math.round(current / _WEIGHT_RULER_STEP) * _WEIGHT_RULER_STEP))
            : 70;
        _buildWeightRulerTicks();
        const track = document.getElementById('weight-ruler-track');
        if (track) track.style.transition = 'none';
        _renderWeightRuler();
        _initWeightRulerDrag();
        overlay.classList.add('open');
        window._dynamicOverlayOpen();
    }

    function closeWeightUpdateSheet() {
        const overlay = document.getElementById('weight-sheet-overlay');
        if (!overlay || !overlay.classList.contains('open')) return;
        overlay.classList.remove('open');
        window._dynamicOverlayClosed();
    }

    function saveWeightFromSheet() {
        const val = _weightRulerValue;
        const el = document.getElementById('current-weight-display');
        if (!el || !val || isNaN(val)) { closeWeightUpdateSheet(); return; }
        el.innerText = val;
        sessionStorage.setItem('current_weight', val);
        const _wDate = localDateStr();
        const weightHistory = JSON.parse(sessionStorage.getItem('weight_history') || '[]');
        weightHistory.push({ date: _wDate, weight: val });
        sessionStorage.setItem('weight_history', JSON.stringify(weightHistory));
        if (typeof syncWeightNow === 'function') syncWeightNow(_wDate, val).then(() => {
            const uid = getActiveUserId();
            if (uid && typeof _trackingWidgetCache !== 'undefined') {
                delete _trackingWidgetCache['weekly_' + uid];
                delete _trackingWidgetCache['history_' + uid];
                if (typeof renderWeeklyScore === 'function') renderWeeklyScore(uid);
                if (typeof renderScoreHistory === 'function') renderScoreHistory(uid);
            }
        });
        const allVals = document.querySelectorAll('.weight-val');
        const startWeight = parseFloat(allVals[0].innerText);
        const goalWeight = parseFloat(allVals[2].innerText);
        const weightDiff = startWeight - goalWeight;
        const percent = weightDiff === 0 ? 0 : Math.min(100, Math.round(((startWeight - val) / weightDiff) * 100));
        document.getElementById('weight-progress-bar').style.width = percent + '%';
        const pt = document.getElementById('weight-progress-text');
        pt.innerText = 'עברת כבר ' + percent + '% מהדרך ליעד!';
        pt.style.visibility = 'visible';
        generatePortionGoals();
        showWeightUpdateToast();
        renderWeightChart();
        closeWeightUpdateSheet();
    }

    // ── סרגל מספרים כללי לשימוש חוזר (יומן משקל/חזרות, גובה) ──────
    const _NUM_SHEET_TICK_GAP = 14;
    let _numSheetMin = 0, _numSheetMax = 100, _numSheetStep = 1, _numSheetLabelStep = 10, _numSheetDecimals = 0;
    let _numSheetValue = 0;
    let _numSheetOnSave = null;
    let _numSheetReady = false;

    function _numSheetOffsetFor(v) {
        // הקווים ממורכזים בתוך תא ברוחב TICK_GAP — צריך להוסיף חצי תא כדי שהמחוג יתיישר בדיוק על הקו
        return -((v - _numSheetMin) / _numSheetStep) * _NUM_SHEET_TICK_GAP - _NUM_SHEET_TICK_GAP / 2;
    }

    function _buildNumSheetTicks() {
        const track = document.getElementById('num-sheet-track');
        if (!track) return;
        track.innerHTML = '';
        const n = Math.round((_numSheetMax - _numSheetMin) / _numSheetStep);
        for (let i = 0; i <= n; i++) {
            const v = _numSheetMin + i * _numSheetStep;
            const isMajor = Math.abs(v - Math.round(v)) < 0.001 && Math.round(v) % _numSheetLabelStep === 0;
            const t = document.createElement('div');
            t.className = 'weight-ruler-tick' + (isMajor ? ' major' : '');
            const line = document.createElement('div');
            line.className = 'weight-ruler-tick-line';
            t.appendChild(line);
            if (isMajor) {
                const lbl = document.createElement('div');
                lbl.className = 'weight-ruler-tick-label';
                lbl.textContent = Math.round(v);
                t.appendChild(lbl);
            }
            track.appendChild(t);
        }
    }

    function _renderNumSheet() {
        const track = document.getElementById('num-sheet-track');
        const valEl = document.getElementById('num-sheet-value');
        if (!track || !valEl) return;
        track.style.transform = `translateX(${_numSheetOffsetFor(_numSheetValue)}px)`;
        valEl.textContent = _numSheetDecimals > 0 ? _numSheetValue.toFixed(_numSheetDecimals) : Math.round(_numSheetValue);
    }

    function _initNumSheetDrag() {
        if (_numSheetReady) return;
        _numSheetReady = true;
        const wrap = document.getElementById('num-sheet-wrap');
        const track = document.getElementById('num-sheet-track');
        if (!wrap || !track) return;
        let dragging = false, startX = 0, startOffset = 0;
        const pointerX = e => e.touches ? e.touches[0].clientX : e.clientX;

        wrap.addEventListener('pointerdown', e => {
            dragging = true;
            track.style.transition = 'none';
            startX = pointerX(e);
            startOffset = _numSheetOffsetFor(_numSheetValue);
        });
        window.addEventListener('pointermove', e => {
            if (!dragging) return;
            const minOffset = _numSheetOffsetFor(_numSheetMax);
            const maxOffset = _numSheetOffsetFor(_numSheetMin);
            let newOffset = startOffset + (pointerX(e) - startX);
            newOffset = Math.max(minOffset, Math.min(maxOffset, newOffset));
            _numSheetValue = _numSheetMin + (-newOffset / _NUM_SHEET_TICK_GAP) * _numSheetStep;
            _renderNumSheet();
        });
        window.addEventListener('pointerup', () => {
            if (!dragging) return;
            dragging = false;
            const _nsRoundFactor = Math.pow(10, _numSheetDecimals);
            _numSheetValue = Math.round(_numSheetValue * _nsRoundFactor) / _nsRoundFactor;
            track.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
            _renderNumSheet();
        });
    }

    function openNumberRulerSheet(opts) {
        _numSheetMin = opts.min;
        _numSheetMax = opts.max;
        _numSheetStep = opts.step || 1;
        _numSheetLabelStep = opts.labelStep || 10;
        _numSheetDecimals = opts.decimals || 0;
        _numSheetOnSave = opts.onSave;
        _numSheetValue = Math.max(_numSheetMin, Math.min(_numSheetMax, opts.value ?? _numSheetMin));

        document.getElementById('num-sheet-title').textContent = opts.title || '';
        const subtitleEl = document.getElementById('num-sheet-subtitle');
        if (subtitleEl) {
            subtitleEl.textContent = opts.subtitle || '';
            subtitleEl.style.display = opts.subtitle ? '' : 'none';
        }
        document.getElementById('num-sheet-unit').textContent = opts.unit || '';

        _buildNumSheetTicks();
        const track = document.getElementById('num-sheet-track');
        if (track) track.style.transition = 'none';
        _renderNumSheet();
        _initNumSheetDrag();

        document.getElementById('num-sheet-overlay').classList.add('open');
        window._dynamicOverlayOpen();
    }

    function closeNumberRulerSheet() {
        const overlay = document.getElementById('num-sheet-overlay');
        if (!overlay || !overlay.classList.contains('open')) return;
        overlay.classList.remove('open');
        window._dynamicOverlayClosed();
    }

    function saveNumberRulerSheet() {
        const val = Math.round(_numSheetValue * 100) / 100;
        if (typeof _numSheetOnSave === 'function') _numSheetOnSave(val);
        closeNumberRulerSheet();
    }

    function openHeightPickerFor(inputId, isSignup) {
        const input = document.getElementById(inputId);
        if (!input) return;
        openNumberRulerSheet({
            min: 120, max: 240, step: 1, labelStep: 10,
            title: 'גובה', unit: 'ס״מ',
            value: parseInt(input.value) || 170,
            onSave: (val) => {
                input.value = val;
                if (isSignup && typeof _showHeightInInches === 'function') _showHeightInInches(val);
            }
        });
    }

    function openWeightPickerFor(inputId, title) {
        const input = document.getElementById(inputId);
        if (!input) return;
        openNumberRulerSheet({
            min: 30, max: 250, step: 0.5, decimals: 1, labelStep: 5,
            title: title || 'משקל', unit: 'ק״ג',
            value: parseFloat(input.value) || 70,
            onSave: (val) => { input.value = val; }
        });
    }

    function openMonthsPickerFor(inputId, title) {
        const input = document.getElementById(inputId);
        if (!input) return;
        openNumberRulerSheet({
            min: 1, max: 50, step: 1, labelStep: 10,
            title: title || 'חודשים', unit: 'חודשים',
            value: parseInt(input.value) || 1,
            onSave: (val) => { input.value = val; }
        });
    }

    // ── כמות+יחידה — בוטום שיט עם צ'יפים+סרגל (רכיב עצמאי, לא משתף DOM עם num-sheet) ──
    const _AMOUNT_UNIT_CONFIG = {
        'גרם':    { min: 1,    max: 1000, step: 5,    labelStep: 100, decimals: 0, default: 100 },
        'יחידות': { min: 1,    max: 20,   step: 1,    labelStep: 5,   decimals: 0, default: 1 },
        'כוסות':  { min: 0.25, max: 10,   step: 0.25, labelStep: 1,   decimals: 2, default: 1 },
        'כפות':   { min: 0.25, max: 10,   step: 0.25, labelStep: 1,   decimals: 2, default: 1 },
    };
    let _amtSheetUnit = 'גרם';
    let _amtSheetValue = 100;
    let _amtSheetOnSave = null;
    let _amtSheetReady = false;

    function _amtSheetOffsetFor(v) {
        const cfg = _AMOUNT_UNIT_CONFIG[_amtSheetUnit];
        // הקווים ממורכזים בתוך תא ברוחב TICK_GAP — צריך להוסיף חצי תא כדי שהמחוג יתיישר בדיוק על הקו
        return -((v - cfg.min) / cfg.step) * _NUM_SHEET_TICK_GAP - _NUM_SHEET_TICK_GAP / 2;
    }

    function _buildAmtSheetTicks() {
        const track = document.getElementById('amount-sheet-track');
        if (!track) return;
        const cfg = _AMOUNT_UNIT_CONFIG[_amtSheetUnit];
        track.innerHTML = '';
        const n = Math.round((cfg.max - cfg.min) / cfg.step);
        for (let i = 0; i <= n; i++) {
            const v = cfg.min + i * cfg.step;
            const isMajor = Math.abs(v - Math.round(v)) < 0.001 && Math.round(v) % cfg.labelStep === 0;
            const t = document.createElement('div');
            t.className = 'weight-ruler-tick' + (isMajor ? ' major' : '');
            const line = document.createElement('div');
            line.className = 'weight-ruler-tick-line';
            t.appendChild(line);
            if (isMajor) {
                const lbl = document.createElement('div');
                lbl.className = 'weight-ruler-tick-label';
                lbl.textContent = Math.round(v);
                t.appendChild(lbl);
            }
            track.appendChild(t);
        }
    }

    function _renderAmtSheet() {
        const track = document.getElementById('amount-sheet-track');
        const valEl = document.getElementById('amount-sheet-value');
        if (!track || !valEl) return;
        const cfg = _AMOUNT_UNIT_CONFIG[_amtSheetUnit];
        track.style.transform = `translateX(${_amtSheetOffsetFor(_amtSheetValue)}px)`;
        valEl.textContent = cfg.decimals > 0 ? _amtSheetValue.toFixed(cfg.decimals) : Math.round(_amtSheetValue);
    }

    function _initAmtSheetDrag() {
        if (_amtSheetReady) return;
        _amtSheetReady = true;
        const wrap = document.getElementById('amount-sheet-wrap');
        const track = document.getElementById('amount-sheet-track');
        if (!wrap || !track) return;
        let dragging = false, startX = 0, startOffset = 0;
        const pointerX = e => e.touches ? e.touches[0].clientX : e.clientX;

        wrap.addEventListener('pointerdown', e => {
            dragging = true;
            track.style.transition = 'none';
            startX = pointerX(e);
            startOffset = _amtSheetOffsetFor(_amtSheetValue);
        });
        window.addEventListener('pointermove', e => {
            if (!dragging) return;
            const cfg = _AMOUNT_UNIT_CONFIG[_amtSheetUnit];
            const minOffset = _amtSheetOffsetFor(cfg.max);
            const maxOffset = _amtSheetOffsetFor(cfg.min);
            let newOffset = startOffset + (pointerX(e) - startX);
            newOffset = Math.max(minOffset, Math.min(maxOffset, newOffset));
            _amtSheetValue = cfg.min + (-newOffset / _NUM_SHEET_TICK_GAP) * cfg.step;
            _renderAmtSheet();
        });
        window.addEventListener('pointerup', () => {
            if (!dragging) return;
            dragging = false;
            const cfg = _AMOUNT_UNIT_CONFIG[_amtSheetUnit];
            const _amtRoundFactor = Math.pow(10, cfg.decimals);
            _amtSheetValue = Math.round(_amtSheetValue * _amtRoundFactor) / _amtRoundFactor;
            track.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
            _renderAmtSheet();
        });
    }

    function _amtSheetSwitchUnit(unit) {
        _amtSheetUnit = unit;
        document.querySelectorAll('#amount-sheet-unit-chips .amount-unit-chip').forEach(c => c.classList.toggle('sel', c.dataset.u === unit));
        document.getElementById('amount-sheet-unit-label').textContent = unit;
        _amtSheetValue = _AMOUNT_UNIT_CONFIG[unit].default;
        const track = document.getElementById('amount-sheet-track');
        if (track) track.style.transition = 'none';
        _buildAmtSheetTicks();
        _renderAmtSheet();
        _initAmtSheetDrag();
    }

    function openAmountUnitSheet(opts) {
        _amtSheetOnSave = opts.onSave;
        const initUnit = (opts.unit && _AMOUNT_UNIT_CONFIG[opts.unit]) ? opts.unit : 'גרם';
        const cfg = _AMOUNT_UNIT_CONFIG[initUnit];
        _amtSheetUnit = initUnit;
        _amtSheetValue = Math.max(cfg.min, Math.min(cfg.max, opts.amount ?? cfg.default));

        document.querySelectorAll('#amount-sheet-unit-chips .amount-unit-chip').forEach(c => c.classList.toggle('sel', c.dataset.u === initUnit));
        document.getElementById('amount-sheet-unit-label').textContent = initUnit;
        _buildAmtSheetTicks();
        const track = document.getElementById('amount-sheet-track');
        if (track) track.style.transition = 'none';
        _renderAmtSheet();
        _initAmtSheetDrag();

        document.getElementById('amount-sheet-overlay').classList.add('open');
        window._dynamicOverlayOpen();
    }

    function closeAmountSheet() {
        const overlay = document.getElementById('amount-sheet-overlay');
        if (!overlay || !overlay.classList.contains('open')) return;
        overlay.classList.remove('open');
        window._dynamicOverlayClosed();
    }

    function saveAmountSheet() {
        const cfg = _AMOUNT_UNIT_CONFIG[_amtSheetUnit];
        const val = Math.round(_amtSheetValue * 100) / 100;
        if (typeof _amtSheetOnSave === 'function') _amtSheetOnSave(val, _amtSheetUnit);
        closeAmountSheet();
    }

// ── Progress Photos ──────────────────────────────────────────────────────────

const PROGRESS_PHOTOS_LIMIT = 10;

async function loadProgressPhotos() {
    const uid = getActiveUserId();
    const gallery = document.getElementById('progress-photos-gallery');
    const countEl = document.getElementById('progress-photos-count');
    const uploadLabel = document.getElementById('progress-photo-upload-label');
    if (!gallery || !uid) return;

    // ניקוי מיידי לפני fetch — מונע הצגת תמונות של משתמש אחר
    gallery.innerHTML = '<span style="color:var(--text-secondary);font-size:0.88rem;">טוען...</span>';
    if (countEl) countEl.textContent = '';

    const photos = await sbFetchProgressPhotos(uid);
    const count = photos.length;

    if (countEl) countEl.textContent = count > 0 ? `${count}/${PROGRESS_PHOTOS_LIMIT}` : '';
    if (uploadLabel) uploadLabel.style.display = count >= PROGRESS_PHOTOS_LIMIT ? 'none' : '';

    if (count === 0) {
        gallery.innerHTML = `<span style="color:var(--text-secondary);font-size:0.88rem;">עדיין לא הועלתה תמונת התקדמות</span>`;
        return;
    }

    const signedUrls = await sbGetSignedPhotoUrls(photos.map(p => p.storage_path));

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;scrollbar-width:thin;';
    photos.forEach(p => {
        const url = signedUrls[p.storage_path];
        if (!url) return;
        const dateStr = new Date(p.uploaded_at).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
        const item = document.createElement('div');
        item.style.flexShrink = '0';
        const img = document.createElement('img');
        img.src = url;
        img.alt = 'תמונת התקדמות';
        img.style.cssText = 'width:72px;height:72px;object-fit:cover;border-radius:8px;cursor:pointer;border:1px solid var(--border);display:block;';
        img.addEventListener('click', () => openProgressPhoto(url, p.id, p.storage_path));
        const label = document.createElement('div');
        label.style.cssText = 'font-size:10px;color:var(--text-secondary);text-align:center;margin-top:2px;';
        label.textContent = dateStr;
        item.appendChild(img);
        item.appendChild(label);
        wrapper.appendChild(item);
    });
    gallery.innerHTML = '';
    gallery.appendChild(wrapper);
}

async function uploadProgressPhoto(input) {
    const file = input.files[0];
    if (!file) return;
    input.value = '';

    if (!file.type.startsWith('image/')) {
        _showProgressPhotoToast('ניתן להעלות תמונות בלבד', false);
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        _showProgressPhotoToast('התמונה גדולה מדי, מקסימום 10MB', false);
        return;
    }

    const uid = getActiveUserId();
    if (!uid) return;

    const existing = await sbFetchProgressPhotos(uid);
    if (existing.length >= PROGRESS_PHOTOS_LIMIT) {
        _showProgressPhotoToast(`הגעת למגבלת ${PROGRESS_PHOTOS_LIMIT} תמונות`, false);
        return;
    }

    const gallery = document.getElementById('progress-photos-gallery');
    if (gallery) gallery.innerHTML = `<span style="color:var(--text-secondary);font-size:0.88rem;">מעלה תמונה...</span>`;

    try {
        await sbUploadProgressPhoto(uid, file);
        _showProgressPhotoToast('התמונה נשמרה <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M5 13l4 4L19 7"/></svg>');
    } catch (e) {
        console.error('[uploadProgressPhoto]', e);
        _showProgressPhotoToast('שגיאה בהעלאה', false);
    }
    await loadProgressPhotos();
}

async function deleteProgressPhoto(photoId, storagePath) {
    try {
        await sbDeleteProgressPhoto(photoId, storagePath);
    } catch (e) {
        console.error('[deleteProgressPhoto]', e);
    }
    await loadProgressPhotos();
}

function openProgressPhoto(url, photoId, storagePath) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `
        <button id="pp-close" style="position:absolute;top:16px;left:16px;background:none;border:none;color:white;cursor:pointer;line-height:1;display:flex;"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
        <button id="pp-delete" style="position:absolute;top:16px;right:16px;background:#e55;color:white;border:none;border-radius:10px;padding:7px 16px;font-size:14px;font-weight:bold;cursor:pointer;display:flex;align-items:center;gap:5px;"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M6 7v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7"/><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/><path d="M10 11v6"/><path d="M14 11v6"/></svg> מחיקת תמונה</button>
        <img src="${url}" alt="תמונת התקדמות מוגדלת" style="max-width:100%;max-height:88vh;border-radius:10px;object-fit:contain;">`;
    const closeOverlay = () => { overlay.remove(); window._dynamicOverlayClosed(); };
    overlay.querySelector('#pp-close').addEventListener('click', closeOverlay);
    overlay.querySelector('#pp-delete').addEventListener('click', () => {
        const confirmed = document.createElement('div');
        confirmed.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;z-index:10000;';
        confirmed.innerHTML = `
            <div style="color:white;font-size:18px;font-weight:bold;text-align:center;">למחוק את התמונה?</div>
            <div style="display:flex;gap:12px;">
                <button id="pp-confirm-yes" style="background:#e55;color:white;border:none;border-radius:10px;padding:10px 28px;font-size:15px;font-weight:bold;cursor:pointer;">מחיקה</button>
                <button id="pp-confirm-no" style="background:rgba(255,255,255,0.15);color:white;border:none;border-radius:10px;padding:10px 28px;font-size:15px;cursor:pointer;">ביטול</button>
            </div>`;
        confirmed.querySelector('#pp-confirm-yes').addEventListener('click', async () => {
            closeOverlay();
            await deleteProgressPhoto(photoId, storagePath);
        });
        confirmed.querySelector('#pp-confirm-no').addEventListener('click', () => confirmed.remove());
        overlay.appendChild(confirmed);
    });
    overlay.addEventListener('click', e => { if (e.target === overlay) closeOverlay(); });
    document.body.appendChild(overlay);
    window._dynamicOverlayOpen();
}

function _showProgressPhotoToast(msg, success = true) {
    const t = document.createElement('div');
    t.innerHTML = msg;
    t.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:${success ? '#22c55e' : '#e55'};color:white;padding:10px 22px;border-radius:20px;font-size:14px;font-weight:bold;z-index:99999;box-shadow:0 4px 15px rgba(0,0,0,0.2);white-space:nowrap;`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}


