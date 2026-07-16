// ===== ליבה: כלים, דיאלוגים, תפריט, מצב כהה, וידאו, PWA, רשת, FAQ, תמונות התקדמות =====

// Disable double-tap zoom, keep pinch zoom
(function() {
    var lastTap = 0;
    document.addEventListener('touchend', function(e) {
        var now = Date.now();
        if (now - lastTap < 300) e.preventDefault();
        lastTap = now;
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
    const btn = document.getElementById('theme-toggle-profile-btn');
    if (!btn) return;
    if (setting === 'light')      btn.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg> מצב יום';
    else if (setting === 'auto')  btn.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><path d="M3 21v-5h5"/></svg> אוטומטי';
    else                          btn.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/></svg> מצב לילה';
}

function _applyTheme(setting) {
    let actual = setting;
    if (setting === 'auto') {
        actual = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', actual);
    _setThemeBtn(setting);
}

function toggleTheme() {
    const current = localStorage.getItem('theme') || 'auto';
    const next = current === 'dark' ? 'light' : current === 'light' ? 'auto' : 'dark';
    localStorage.setItem('theme', next);
    _applyTheme(next);
    if (typeof syncThemeNow === 'function') syncThemeNow(next);
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
    let bmr = (10 * weight) + (6.25 * CLIENT.height) - (5 * ageCalc);
    bmr = CLIENT.gender === 'male' ? bmr + 5 : bmr - 161;
    const tdee = Math.round(bmr * CLIENT.activityLevel);
    const totalCalories = CLIENT.goal === 'cut' ? tdee - 250 : tdee + 250;
    const proteinGrams = weight * CLIENT.proteinRatio;
    const proteinCals = proteinGrams * 4;
    const remainingCals = totalCalories - proteinCals;
    const carbRatio = (CLIENT.carbRatio != null) ? CLIENT.carbRatio : (CLIENT.goal === 'cut' ? 0.7 : 0.6);
    const carbCals = remainingCals * carbRatio;
    const fatCals = remainingCals * (1 - carbRatio);
    return {
        protein: Math.round((proteinGrams / portionValues.protein) * 2) / 2,
        carbs:   Math.round((carbCals / 4 / portionValues.carbs) * 2) / 2,
        fat:     Math.round((fatCals / 9 / portionValues.fat) * 2) / 2,
        totalCalories,
    };
}

    function generatePortionGoals() {
    const { protein: pPortions, carbs: cPortions, fat: fPortions, totalCalories } = calcPortionTargets();

    // 7. עדכון HTML
    document.getElementById('protein-target').innerText = `/ ${pPortions}`;
    document.getElementById('carbs-target').innerText = `/ ${cPortions}`;
    document.getElementById('fat-target').innerText = `/ ${fPortions}`;
    window._getPortionTargets = () => ({ protein: pPortions, carbs: cPortions, fat: fPortions });

    const goalText = CLIENT.goal === 'cut' ? 'חיטוב' : 'מסה';
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
            toast.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M12 9v4"/><path d="M10.3 3.9L2.5 18a1.5 1.5 0 0 0 1.3 2.2h16.4a1.5 1.5 0 0 0 1.3-2.2L13.7 3.9a1.5 1.5 0 0 0-2.6 0z"/><circle cx="12" cy="16.5" r="0.6" fill="currentColor" stroke="none"/></svg> בעיית תקשורת — מנסה שוב';
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
        toast.style.cssText = `position:fixed;top:24px;left:50%;transform:translateX(-50%);background:var(--accent);color:white;padding:12px 24px;border-radius:25px;font-size:15px;font-weight:bold;z-index:100001;box-shadow:0 4px 15px rgba(0,0,0,0.2);white-space:nowrap;`;
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
    loadPortions();
    renderFoodLog();
    loadChecklist();
    generatePortionGoals();
    updateGoalRecommendations();
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
    if (document.visibilityState === 'visible' && typeof loadPortions === 'function') {
        manageDailyReset();
        loadPortions();
        // בדיקת באנרים כשהמשתמש חוזר לאפליקציה — תופס מעבר שעת ההצגה בלי רענון
        if (typeof checkThursdayBanner  === 'function') checkThursdayBanner();
        if (typeof checkMeetingReminder === 'function') checkMeetingReminder();
    }
});

window.addEventListener('pageshow', (e) => {
    if (e.persisted && typeof loadPortions === 'function') {
        loadPortions();
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

    // בנק המאכלים — סגור כברירת מחדל, נפתח רק בבחירה, נשמר לאורך הסשן (עד יציאה מהאפליקציה)
    function _foodBankTabKey() {
        const uid = typeof getActiveUserId === 'function' ? getActiveUserId() : null;
        return 'food_bank_tab_' + (uid || 'local');
    }
    function selectFoodBankTab(id, btnEl) {
        const alreadyOpen = btnEl && btnEl.classList.contains('active');
        document.querySelectorAll('.food-bank-pane').forEach(pane => { pane.style.display = 'none'; });
        document.querySelectorAll('.food-bank-tab').forEach(btn => btn.classList.remove('active'));
        if (alreadyOpen) {
            sessionStorage.removeItem(_foodBankTabKey());
            const tabsRow = document.querySelector('.food-bank-tabs');
            if (tabsRow) tabsRow.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }
        const pane = document.getElementById(id);
        if (pane) pane.style.display = 'block';
        if (btnEl) btnEl.classList.add('active');
        sessionStorage.setItem(_foodBankTabKey(), id);
    }
    (function _restoreFoodBankTab() {
        const saved = sessionStorage.getItem(_foodBankTabKey());
        if (!saved) return;
        const pane = document.getElementById(saved);
        const btn = document.querySelector('.food-bank-tab[data-bank="' + saved + '"]');
        if (pane) pane.style.display = 'block';
        if (btn) btn.classList.add('active');
    })();

    function updateGoalRecommendations() {
    const listContainer = document.getElementById('goal-food-list');
    const tabLabel = document.getElementById('goal-bank-tab-label');
    const caption = document.getElementById('goal-food-caption');

    if (!listContainer || !tabLabel || !caption) return;

    const currentGoal = CLIENT.goal;

    if (currentGoal === "cut" || currentGoal === "חיטוב") {
        tabLabel.textContent = 'חיטוב';
        caption.textContent = 'מאכלים שיעזרו לכם לרדת במשקל מבלי להיות רעבים';
        listContainer.innerHTML = `
            <li>חזה עוף (150 גרם\u00A0<b>לפני בישול</b>) = 1 חלבון</li>
            <li>פילה הודו (150 גרם\u00A0<b>לפני בישול</b>) = 1 חלבון</li>
            <li>פילה דג לבן (160 גרם\u00A0<b>לפני בישול</b>) = 1 חלבון</li>
            <li>טונה במים (קופסה מסוננת ~120 גרם) = 1 חלבון</li>
            <li>קוטג' 1% (250 גרם) = 1 חלבון</li>
            <li>חלבון ביצה (8 יח') = 1 חלבון</li>
            <li>יוגורט חלבון דל שומן (2 יח') = 1 חלבון</li>
            <li>תפוח אדמה (220 גרם\u00A0<b>לפני בישול</b>) = 1 פחמימה</li>
            <li>בטטה (220 גרם\u00A0<b>לפני בישול</b>) = 1 פחמימה</li>
            <li>עדשים (60 גרם\u00A0<b>לפני בישול/יבש</b>) = 1 פחמימה</li>
            <li>שעועית לבנה (60 גרם\u00A0<b>לפני בישול/יבש</b>) = 1 פחמימה</li>
            <li>קינואה (50 גרם\u00A0<b>לפני בישול/יבש</b>) = 1 פחמימה</li>
            <li>לחם קל (2 פרוסות) = 1 פחמימה</li>
            <li>פריכיות דקות (6–7 יח') = 1 פחמימה</li>
            <li>תפוח (1.5 יח') = 1 פחמימה</li>
            <li>תותים (300 גרם) = 1 פחמימה</li>
            <li>פופקורן ללא שמן (5–6 כוסות) = 1 פחמימה</li>
            <li>דלעת (500 גרם\u00A0<b>לפני בישול</b>) = 1 פחמימה</li>
            <li>פריכיות כוסמין (6 יח') = 1 פחמימה</li>
            <li>חלב דל שומן (כוס 330 מ"ל) = 0.5 פחמימה + 0.5 חלבון</li>
            <li>כרוב = 0 מנות (ללא הגבלה)</li>
        `;
    } else {
        tabLabel.textContent = 'מסה';
        caption.textContent = 'מאכלים שיעזרו לך להגיע ליעדי החלבון והקלוריות מבלי לאכול בכוח';
        listContainer.innerHTML = `
            <li>פרגיות (150 גרם\u00A0<b>לפני בישול</b>) = 1 חלבון</li>
            <li>בקר טחון 15% (150 גרם\u00A0<b>לפני בישול</b>) = 1 חלבון</li>
            <li>סלמון (150 גרם\u00A0<b>לפני בישול</b>) = 1 חלבון</li>
            <li>אורז לבן (50 גרם\u00A0<b>לפני בישול/יבש</b>) = 1 פחמימה</li>
            <li>פסטה (50 גרם\u00A0<b>לפני בישול/יבש</b>) = 1 פחמימה</li>
            <li>קוסקוס (50 גרם\u00A0<b>לפני בישול/יבש</b>) = 1 פחמימה</li>
            <li>פתיתים (50 גרם\u00A0<b>לפני בישול/יבש</b>) = 1 פחמימה</li>
            <li>שיבולת שועל (50 גרם\u00A0<b>לפני בישול/יבש</b>) = 1 פחמימה</li>
            <li>תמר מג'הול (2 יח') = 1 פחמימה</li>
            <li>בננה גדולה (1 יח') = 1 פחמימה</li>
            <li>טורטייה (יחידה אחת) = 1 פחמימה</li>
            <li>בייגל (חצי יחידה) = 1 פחמימה</li>
            <li>גרנולה (5 כפות גדושות) = 1 פחמימה</li>
            <li>חמאת בוטנים (כף גדושה) = 1 שומן</li>
            <li>טחינה גולמית (כף) = 1 שומן</li>
            <li>שמן זית (כף) = 1 שומן</li>
            <li>אגוזי מלך (6 יח') = 1 שומן</li>
            <li>קשיו (10–12 יח') = 1 שומן</li>
            <li>אבוקדו (חצי יחידה) = 1 שומן</li>
            <li>חלב 3% (כוס 330 מ"ל) = 0.5 פחמימה + 0.5 חלבון</li>
        `;
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

        // לוגיקה לכפתור חזרה למעלה - הכנסנו אותה לכאן כדי לוודא שהכפתור כבר קיים ב-HTML
        const btn = document.getElementById("backToTop");
        if (btn) {
            btn.addEventListener("click", function() {
                window.scrollTo({top: 0, behavior: 'smooth'});
            });
        }
    });

    // הלוגיקה של ההופעה/הסתרה יכולה להישאר בחוץ
    window.onscroll = function() {
        const btn = document.getElementById("backToTop");
        if (btn) {
            if (document.body.scrollTop > 300 || document.documentElement.scrollTop > 300) {
                btn.style.display = "block";
            } else {
                btn.style.display = "none";
            }
        }
    };

    function editWeightInline(el) {
    if (el.querySelector('input')) return;
    const current = el.innerText;
    const input = document.createElement('input');
    input.type = 'number';
    input.value = current;
    input.style.cssText = 'width:70px; text-align:center; border:1px solid var(--main-green); border-radius:6px; padding:4px; font-size:22px; font-weight:bold; color:var(--dark-green);';
    el.innerText = '';
    el.appendChild(input);
    el.onclick = null;
    input.focus();
    const save = () => {
        const val = parseFloat(input.value.trim());
        if (val && !isNaN(val)) {
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
            document.querySelectorAll('.progress-bar')[0].style.width = percent + '%';
            const pt = document.querySelector('.progress-text');
            pt.innerText = 'עברת כבר ' + percent + '% מהדרך ליעד!';
            pt.style.visibility = 'visible';
            generatePortionGoals();
            showWeightUpdateToast();
            renderWeightChart();
        } else {
            el.innerText = current;
        }
        el.onclick = () => editWeightInline(el);
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); }});
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
        _showProgressPhotoToast('התמונה גדולה מדי — מקסימום 10MB', false);
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

// ── נעילת גלילת רקע כשחלון/מודל פתוח ─────────────────────────
// עוקב אחרי כל המודלים הקבועים ב-DOM (לפי ID) וגם אחרי מודלים
// שנוצרים דינמית (progress photo, גרף כוח, שיא אישי), ונועל/משחרר
// גלילה של הרקע לפי מי שפתוח כרגע. מקור אמת אחד לכל האתר.
(function () {
    const MODAL_IDS = [
        'food-scanner-modal', 'food-log-edit-modal', 'weight-chart-modal', 'profile-overlay',
        'new-client-modal', 'workout-editor-modal', 'questionnaire-modal', 'video-modal',
        'calendly-modal', 'app-dialog', 'achievement-popup', 'workout-complete-msg',
        'nutrition-complete-msg', 'pwa-install-popup', 'renewal-reminder-popup', 'pwa-ios-popup',
        'birthday-modal', 'weekly-survey-banner', 'ai-chat-overlay', 'survey-overlay', 'calc-overlay',
        'progress-card-modal', 'client-workout-editor-modal'
    ];
    let dynamicOverlayCount = 0;
    window._dynamicOverlayOpen = function () { dynamicOverlayCount++; _refreshScrollLock(); };
    window._dynamicOverlayClosed = function () { dynamicOverlayCount = Math.max(0, dynamicOverlayCount - 1); _refreshScrollLock(); };

    function _isModalVisible(el) {
        if (!el || el.classList.contains('hidden')) return false;
        return getComputedStyle(el).display !== 'none';
    }
    // overflow:hidden לבד לא עוצר גלילת מגע ב-iOS Safari/PWA, אז "מקפיאים"
    // את הדף במקום עם position:fixed ומחזירים לגלילה במקום המדויק בסגירה
    let _savedScrollY = 0;
    function _refreshScrollLock() {
        const anyModalOpen = MODAL_IDS.some(id => _isModalVisible(document.getElementById(id)));
        const shouldLock = anyModalOpen || dynamicOverlayCount > 0;
        const isLocked = document.body.classList.contains('scroll-locked');
        if (shouldLock && !isLocked) {
            _savedScrollY = window.scrollY || window.pageYOffset || 0;
            document.body.classList.add('scroll-locked');
            document.body.style.position = 'fixed';
            document.body.style.top = (-_savedScrollY) + 'px';
            document.body.style.width = '100%';
        } else if (!shouldLock && isLocked) {
            document.body.classList.remove('scroll-locked');
            document.body.style.position = '';
            document.body.style.top = '';
            document.body.style.width = '';
            window.scrollTo(0, _savedScrollY);
        }
    }
    document.addEventListener('DOMContentLoaded', function () {
        MODAL_IDS.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            new MutationObserver(_refreshScrollLock).observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
        });
        _refreshScrollLock();
    });
})();



