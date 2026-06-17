/* ===========================================================
   מדריך מודרך באפליקציה (Tour Guide)
   זרקור + בועת הסבר + "הבא". טקסטים קבועים, לשון ניטרלית.
   מדריך לכל טאב + מדריך כללי. סינון לפי מנוי/ליווי.
   =========================================================== */
(function () {
  'use strict';

  // ---------- נתוני השלבים ----------
  // step: { sel, text, coachOnly?, center?, pre? }
  // sel = string ל-querySelector או פונקציה שמחזירה אלמנט
  const STEPS = {
    tab1: [
      { sel: '#nutrition-streak-display', text: 'מספר הימים ברצף עם עמידה ביעדי התזונה 🔥' },
      { sel: '#macros-dashboard',        text: 'כמות החלבון, הפחמימות והשומן שנאכלו היום מתוך היעד' },
      { sel: '.food-log-btn',            text: 'כל האוכל שאכלת היום מרוכז כאן' },
      { sel: '.food-scan-btn',           text: 'להוספת מנה: צילום אוכל וזיהוי אוטומטי ב-AI 📷, העלאת תמונה 🖼️, או הזנה בכתב ✍️. כדאי לנסות לבד' },
      { sel: '.accordion-container',     text: 'רשימת מאכלים לפי קטגוריות, נותנת רעיון כללי מה אפשר לאכול' },
      { sel: 'button[onclick="openCalc()"]', text: 'חישוב כמות הקלוריות והחלבון הדרושה לפי המטרה' },
    ],
    tab2: [
      { sel: '#workout-streak-display', text: 'מספר השבועות ברצף עם אימון שהושלם 🔥' },
      { sel: '#workout-selector',       text: 'בחירת האימון להיום: ראשון, שני, שלישי וכן הלאה לפי התוכנית' },
      { sel: function () {
          const v = Array.from(document.querySelectorAll('.workout-container'))
            .find(el => el.offsetParent !== null);
          return v || document.getElementById('workout-A');
        },
        text: 'לכל תרגיל מופיע כמה משקל וכמה חזרות לעשות, וכמה סטים של חימום וסטים של עבודה. מסמנים ✔ בסיום כל תרגיל' },
      { sel: '#workout-journal-card',   text: 'מעקב אחרי המשקלים בכל תרגיל לאורך זמן, ובכל תרגיל יש גרף 📊 שמראה את השיפור בביצועים' },
    ],
    tab4: [
      { sel: function () {
          return document.getElementById('weekly-score-container')
              || document.getElementById('score-history-container')
              || document.getElementById('score-widgets-anchor');
        },
        text: 'ציון שבועי שמסכם את ההתקדמות, וגרף "היסטוריית ציונים שבועיים" שמראה את המגמה לאורך הזמן 📈' },
      { sel: '.weight-card',          text: 'משקל התחלה, נוכחי ויעד. לחיצה על המשקל הנוכחי מעדכנת אותו, ויש גרף 📈 של ההתקדמות' },
      { sel: '#progress-photos-card', text: 'העלאת תמונות לאורך הדרך כדי לראות את השינוי בעיניים' },
      { sel: '#coaching-goal-card',   text: 'היעד שנקבע עד הפגישה הבאה, מוצג כאן לתזכורת', coachOnly: true },
      { sel: '#open-survey-btn',      text: 'שאלון שבועי קצר למילוי כדי לעקוב אחרי ההרגשה וההתקדמות', coachOnly: true },
    ],
    tab5: [
      { sel: '#infoSearch',                text: 'חיפוש מהיר של כל מושג בתחום, למשל חלבון, כשל שרירי או קלוריות' },
      { sel: '#info-chapters',             text: 'מאגר מסודר לפי נושאים. לחיצה על פרק פותחת אותו, ולחיצה על מושג מציגה הסבר פשוט' },
      { sel: '#faq-categories-container',  text: 'תשובות לשאלות שחוזרות הרבה, מסודרות לפי קטגוריות' },
    ],
    general: [
      { center: true, text: 'ברוכים הבאים לאפליקציית OI. סיור קצר שמראה איך הכל עובד' },
      { sel: '.tabs',         text: 'ארבעה אזורים: תזונה, אימונים, מעקב ויעדים, ומרכז המידע. מעבר ביניהם בלחיצה', pre: closeMenu },
      { sel: '.hamburger-btn', pre: closeMenu, text: function () {
          return isSubscriber()
            ? 'התפריט העליון. כאן נמצאים הפרופיל ומאמן ה-AI'
            : 'התפריט העליון. כאן נמצאים הפרופיל, מאמן ה-AI, וקביעת פגישה';
        } },
      { sel: 'button[onclick="openAIChat()"]', text: 'מאמן חכם שזמין בכל שעה לשאלות על תזונה, אימונים והתהליך. עונה בהתאמה אישית למידע האישי', pre: openMenu },
      { sel: '.whatsapp-top-btn',  text: 'כפתור לשליחת הודעה ישירה למאמן בוואטסאפ בכל שאלה או עדכון', coachOnly: true, pre: openMenu },
      { sel: '#calendly-hamburger-btn', text: 'קביעת פגישה אישית עם המאמן ישירות מהאפליקציה', coachOnly: true, pre: openMenu },
      { sel: function () { return document.querySelector('#profile-overlay .profile-group'); },
        text: 'כל הפרטים האישיים. אפשר לעדכן שם, משקל, אלרגיות ומאכלים מועדפים, שעוזרים למאמן ה-AI להתאים המלצות', pre: openProfileForTour },
      { sel: '#theme-toggle-profile-btn', text: 'מעבר בין תצוגה כהה לבהירה לפי ההעדפה', pre: openProfileForTour },
      { sel: '#pwa-add-btn',  text: 'התקנת האפליקציה על הטלפון כמו אפליקציה רגילה', pre: openProfileForTour },
    ],
  };

  const TAB_NAMES = { tab1: 'תזונה', tab2: 'אימונים', tab4: 'מעקב ויעדים', tab5: 'מרכז המידע' };
  const TAB_ORDER = ['tab1', 'tab2', 'tab4', 'tab5'];

  // ---------- עזרי סוג משתמש ----------
  function isSubscriber() {
    // CLIENT מוגדר כ-const גלובלי (לא על window) — לכן ניגשים אליו ישירות
    return (typeof CLIENT !== 'undefined') && !!CLIENT.isSubscriber;
  }
  // טקסט יכול להיות מחרוזת או פונקציה שמחזירה טקסט לפי סוג המשתמש
  function txtOf(step) { return typeof step.text === 'function' ? step.text() : step.text; }
  function visible(list) { return list.filter(s => !(s.coachOnly && isSubscriber())); }

  // ---------- עזרי תפריט/פרופיל ----------
  function openMenu()  {
    // דחייה: כך מאזין "לחיצה מחוץ לתפריט" (שרץ על אותה לחיצת "הבא") לא סוגר את התפריט מיד
    const m = document.querySelector('.hamburger-menu');
    if (m) setTimeout(function () { m.classList.add('open'); }, 0);
  }
  function closeMenu() { const m = document.querySelector('.hamburger-menu'); if (m) m.classList.remove('open'); }
  function openProfileForTour() {
    closeMenu();
    const ov = document.getElementById('profile-overlay');
    if (ov && !ov.classList.contains('open')) {
      try { if (typeof openProfile === 'function') openProfile(); } catch (e) {}
    }
  }
  function closeProfileForTour() {
    const ov = document.getElementById('profile-overlay');
    if (ov && ov.classList.contains('open')) {
      try { if (typeof closeProfile === 'function') closeProfile(); } catch (e) {}
    }
  }

  // ---------- בניית שכבת ה-DOM (פעם אחת) ----------
  let blocker, highlight, bubble, els = false;
  function build() {
    if (els) return;
    blocker = document.createElement('div');   blocker.className = 'tour-blocker';
    highlight = document.createElement('div');  highlight.className = 'tour-highlight';
    bubble = document.createElement('div');     bubble.className = 'tour-bubble';
    document.body.appendChild(blocker);
    document.body.appendChild(highlight);
    document.body.appendChild(bubble);
    // חסימת גלילה ידנית בזמן המדריך (גלילה אוטומטית לאלמנט עדיין מותרת)
    const block = function (e) {
      if (e.target.closest && e.target.closest('.tour-bubble')) return; // בועה עצמה לא נחסמת
      e.preventDefault();
    };
    blocker.addEventListener('wheel', block, { passive: false });
    blocker.addEventListener('touchmove', block, { passive: false });
    els = true;
  }
  function showLayer(on) {
    build();
    const d = on ? 'block' : 'none';
    blocker.style.display = d; highlight.style.display = d; bubble.style.display = d;
  }

  // נעילת גלילה מלאה בזמן מדריך (גלילה אוטומטית לאלמנט עדיין מותרת — היא לא אירוע משתמש)
  function preventScroll(e) {
    if (e.target.closest && e.target.closest('.tour-bubble')) return; // גלילה בתוך הבועה מותרת
    e.preventDefault();
  }
  let scrollLocked = false;
  function lockScroll() {
    if (scrollLocked) return;
    document.addEventListener('wheel', preventScroll, { passive: false, capture: true });
    document.addEventListener('touchmove', preventScroll, { passive: false, capture: true });
    scrollLocked = true;
  }
  function unlockScroll() {
    if (!scrollLocked) return;
    document.removeEventListener('wheel', preventScroll, { capture: true });
    document.removeEventListener('touchmove', preventScroll, { capture: true });
    scrollLocked = false;
  }

  // ---------- מצב ריצה ----------
  let queue = [], idx = 0, ctx = null; // ctx = 'tab1'/'general' וכו'

  function startTab(tabId) {
    ctx = tabId;
    queue = visible(STEPS[tabId] || []);
    idx = 0;
    if (!queue.length) return;
    build(); showLayer(true);
    lockScroll();
    bindResize();
    render();
  }
  function startGeneral() {
    ctx = 'general';
    queue = visible(STEPS.general);
    idx = 0;
    build(); showLayer(true);
    lockScroll();
    bindResize();
    render();
  }

  function render() {
    if (idx >= queue.length) { finish(); return; }
    const step = queue[idx];
    if (typeof step.pre === 'function') { try { step.pre(); } catch (e) {} }

    // שלב מרכזי (פתיחה) — בלי זרקור
    if (step.center) {
      blocker.classList.add('solid');
      highlight.style.display = 'none';
      placeBubbleCenter(txtOf(step));
      return;
    }

    blocker.classList.remove('solid');
    highlight.style.display = 'none'; // יוצג רק אחרי שמוקם, למניעת הבהוב

    // המתנה קצרה אם pre פתח משהו (תפריט/פרופיל), ואז גלילה ומיקום
    const delay = step.pre ? 420 : 0; // זמן לפתיחת תפריט/פרופיל (אנימציה ~0.35s) לפני מדידה
    setTimeout(function () {
      const el = resolve(step.sel);
      // דילוג אם האלמנט לא קיים או מוסתר/ריק (למשל פיצ'ר ליווי אצל מנוי)
      if (!el || el.offsetParent === null || (el.offsetWidth === 0 && el.offsetHeight === 0)) {
        idx++; render(); return;
      }
      try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
      setTimeout(function () { positionTo(el, txtOf(step)); }, 320);
    }, delay);
  }

  function resolve(sel) {
    try { return typeof sel === 'function' ? sel() : document.querySelector(sel); }
    catch (e) { return null; }
  }

  function positionTo(el, text) {
    const r = el.getBoundingClientRect();
    const pad = 8;
    highlight.style.display = 'block';
    highlight.style.top = (r.top - pad) + 'px';
    highlight.style.left = (r.left - pad) + 'px';
    highlight.style.width = (r.width + pad * 2) + 'px';
    highlight.style.height = (r.height + pad * 2) + 'px';
    placeBubbleNear(r, text);
  }

  function bubbleHTML(text, isLast) {
    const n = queue.length, cur = idx + 1;
    const nextLabel = isLast ? 'סיום' : 'הבא';
    return (
      '<p class="tour-text">' + text + '</p>' +
      '<div class="tour-foot">' +
      '<button class="tour-skip" data-act="skip">דלג</button>' +
      '<span class="tour-prog">' + cur + ' / ' + n + '</span>' +
      '<button class="tour-next" data-act="next">' + nextLabel + '</button>' +
      '</div>'
    );
  }

  function placeBubbleNear(r, text) {
    const isLast = idx === queue.length - 1;
    bubble.innerHTML = bubbleHTML(text, isLast);
    bubble.classList.remove('tour-center');
    bubble.style.display = 'block';
    // מודדים אחרי render
    const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight, m = 10;
    let top = r.bottom + 12;
    if (top + bh + m > vh) top = r.top - bh - 12;      // אין מקום למטה -> למעלה
    if (top < m) top = m;
    let left = r.left + r.width / 2 - bw / 2;            // ממורכז לרוחב המטרה
    if (left + bw + m > vw) left = vw - bw - m;
    if (left < m) left = m;
    bubble.style.top = top + 'px';
    bubble.style.left = left + 'px';
    wireBubble();
  }

  function placeBubbleCenter(text) {
    const isLast = idx === queue.length - 1;
    bubble.innerHTML = bubbleHTML(text, isLast);
    bubble.classList.add('tour-center');
    bubble.style.display = 'block';
    bubble.style.top = ''; bubble.style.left = '';
    wireBubble();
  }

  function wireBubble() {
    const next = bubble.querySelector('[data-act="next"]');
    const skip = bubble.querySelector('[data-act="skip"]');
    if (next) next.onclick = function () { idx++; render(); };
    if (skip) skip.onclick = function () { close(); };
  }

  // ---------- סיום ----------
  function finish() {
    // ניקוי מצבי פתיחה
    closeProfileForTour();
    closeMenu();
    blocker.classList.add('solid');
    highlight.style.display = 'none';

    let title = '🎉 כל הכבוד!';
    let msg, nextTab = null;
    if (ctx === 'general') {
      msg = 'סיימת את הסיור הכללי. אפשר לפתוח כל מדריך שוב מתי שרוצים מהכפתורים.';
      markGeneralSeen();
    } else {
      const i = TAB_ORDER.indexOf(ctx);
      nextTab = (i >= 0 && i < TAB_ORDER.length - 1) ? TAB_ORDER[i + 1] : null;
      msg = 'סיימת את הסיור של ' + (TAB_NAMES[ctx] || '');
    }

    let btns = '';
    if (nextTab) {
      btns = '<button class="tour-next" data-act="gonext">סיור ב' + TAB_NAMES[nextTab] + '</button>' +
             '<button class="tour-skip" data-act="done">סיום</button>';
    } else {
      btns = '<button class="tour-next" data-act="done">סיום</button>';
    }
    bubble.classList.add('tour-center');
    bubble.style.display = 'block';
    bubble.innerHTML = '<p class="tour-title">' + title + '</p>' +
                       '<p class="tour-text">' + msg + '</p>' +
                       '<div class="tour-foot tour-foot-end">' + btns + '</div>';
    const go = bubble.querySelector('[data-act="gonext"]');
    const done = bubble.querySelector('[data-act="done"]');
    if (done) done.onclick = close;
    if (go) go.onclick = function () {
      close();
      const btn = document.querySelector('.tab-btn[data-tab="' + nextTab + '"]');
      if (btn) btn.click();
      setTimeout(function () { startTab(nextTab); }, 350);
    };
  }

  function close() {
    closeProfileForTour();
    closeMenu();
    showLayer(false);
    if (blocker) blocker.classList.remove('solid');
    unlockScroll();
    unbindResize();
    queue = []; idx = 0; ctx = null;
  }

  // ---------- מעקב אחרי שינוי גודל מסך ----------
  let resizeBound = false;
  function onResize() {
    if (!queue.length) return;
    const step = queue[idx];
    if (!step || step.center) return;
    const el = resolve(step.sel);
    if (el) positionTo(el, txtOf(step));
  }
  function bindResize() {
    if (!resizeBound) {
      window.addEventListener('resize', onResize);
      window.addEventListener('scroll', onResize, true); // ביטחון: יישור הזרקור אם בכל זאת קרתה גלילה
      resizeBound = true;
    }
  }
  function unbindResize() {
    if (resizeBound) {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
      resizeBound = false;
    }
  }

  // ---------- דגל "נצפה" למדריך הכללי ----------
  function uid() {
    return (typeof getActiveUserId === 'function' && getActiveUserId()) || 'default';
  }
  function generalKey() { return 'tour_general_seen_' + uid(); }
  function markGeneralSeen() { try { localStorage.setItem(generalKey(), '1'); } catch (e) {} }
  function generalSeen() { try { return localStorage.getItem(generalKey()) === '1'; } catch (e) { return false; } }

  // הרצה אוטומטית בכניסה ראשונה של מתאמן (לא אדמין, לא נצפה)
  function maybeAutoRun() {
    if (window.SB_IS_ADMIN) return;          // אדמין שצופה — לא נחשב
    if (generalSeen()) return;               // כבר ראה פעם
    markGeneralSeen();                       // לא להציג שוב אוטומטית
    setTimeout(startGeneral, 600);
  }

  // ---------- חשיפה גלובלית ----------
  window.startTabTour = startTab;
  window.startGeneralTour = startGeneral;
  window.Tour = { startTab: startTab, startGeneral: startGeneral, maybeAutoRun: maybeAutoRun };
})();
