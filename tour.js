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
      { center: true, text: 'זה אזור התזונה, כאן נעקוב יחד אחרי כל מה שאכלת מול היעדים שנציב' },
      { sel: '#nutrition-streak-display', text: 'מספר הימים ברצף עם עמידה ביעדי התזונה <svg viewBox="0 0 24 24" width="14" height="14" fill="#f97316" stroke="#f97316" stroke-width="1" stroke-linejoin="round" style="vertical-align:-2px"><path d="M12 2.5c-1.2 3.3-5 5.7-5 9.5a5 5 0 0 0 10 0c0-1.6-.7-2.9-1.8-4 .1 1.7-.9 2.4-1.6 2 .9-2 -.2-4.2-1.6-7.5z"/></svg>' },
      { sel: '#macros-progress-group',   text: 'הקלוריות ביום, וכמות החלבון, הפחמימות והשומן בגרמים מתוך היעד' },
      { sel: '.food-action-row .food-action-tile:nth-child(1)', text: 'להוספת אוכל: צילום תמונה וזיהוי אוטומטי ב-AI, סריקת ברקוד, צילום טבלת הערכים התזונתיים על גב האריזה, העלאה מהגלריה, או חיפוש במאגר המזון. כדאי לנסות לבד' },
      { sel: '.food-action-row .food-action-tile:nth-child(2)', text: 'כל האוכל שאכלת היום מרוכז כאן' },
      { sel: '.food-action-row .food-action-tile:nth-child(3)', text: 'מאכלים ומתכונים אישיים ששמרת, לשימוש חוזר מהיר בלי לחפש כל פעם מחדש' },
      { sel: '.meal-idea-card',          text: 'המאמן AI מציע ארוחה בהתאמה אישית, לפי מה שנשאר לך היום ולפי הטעם שלך' },
    ],
    tab2: [
      { center: true, text: 'זה אזור האימונים, כאן נעקוב יחד אחרי תוכנית האימונים השבועית שלך, תרגיל אחרי תרגיל' },
      { sel: '#workout-streak-display', text: 'מספר השבועות ברצף שבהם עמדת ביעד האימונים השבועי <svg viewBox="0 0 24 24" width="14" height="14" fill="#f97316" stroke="#f97316" stroke-width="1" stroke-linejoin="round" style="vertical-align:-2px"><path d="M12 2.5c-1.2 3.3-5 5.7-5 9.5a5 5 0 0 0 10 0c0-1.6-.7-2.9-1.8-4 .1 1.7-.9 2.4-1.6 2 .9-2 -.2-4.2-1.6-7.5z"/></svg>' },
      { sel: '#workout-selector',       text: 'בחירת האימון להיום: ראשון, שני, שלישי וכן הלאה לפי התוכנית' },
      { sel: function () {
          const v = Array.from(document.querySelectorAll('.workout-container'))
            .find(el => el.offsetParent !== null);
          return v || document.getElementById('workout-A');
        },
        text: 'לכל תרגיל מופיע כמה משקל וכמה חזרות לעשות, וכמה סטים של חימום וסטים של עבודה. מסמנים <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M5 13l4 4L19 7"/></svg> בסיום כל תרגיל' },
      { sel: '#workout-journal-card',   text: 'מעקב אחרי המשקלים בכל תרגיל לאורך זמן, ובכל תרגיל יש גרף <svg viewBox="0 0 24 24" width="13" height="13" fill="var(--accent)" style="vertical-align:-2px"><rect x="4" y="13" width="4" height="7" rx="1"/><rect x="10" y="8" width="4" height="12" rx="1"/><rect x="16" y="4" width="4" height="16" rx="1"/></svg> שמראה את השיפור בביצועים' },
      { sel: 'button[onclick="openClientWorkoutEditor()"]', text: 'עריכת תוכנית האימונים: בחירה מתוך תבניות מוכנות, או בניית תוכנית אישית מאפס' },
      { sel: '#workout-reorder-btn', text: 'סידור מחדש של התרגילים: מפעילים ומזיזים תרגיל למעלה או למטה בסדר עם החצים' },
    ],
    tab4: [
      { center: true, text: 'זה אזור מעקב ויעדים, כאן נעקוב יחד אחרי ההתקדמות שלך לאורך זמן: משקל, תמונות וציון שבועי' },
      { sel: function () {
          return document.getElementById('weekly-score-container')
              || document.getElementById('score-history-container')
              || document.getElementById('score-widgets-anchor');
        },
        text: 'ציון שבועי שמסכם את ההתקדמות, וגרף "היסטוריית ציונים שבועיים" שמראה את המגמה לאורך הזמן <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>' },
      { sel: '.weight-card',          text: 'משקל התחלה, נוכחי ויעד. לחיצה על המשקל הנוכחי מעדכנת אותו, ויש גרף <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg> של ההתקדמות' },
      { sel: '#progress-photos-card', text: 'העלאת תמונות לאורך הדרך כדי לראות את השינוי בעיניים' },
      { sel: '#export-report-wrap',   text: 'יצירת תמונה אחת עם גרף משקל, שלושת התרגילים הכי בולטים והסטריקים, לשמירה או שיתוף' },
      { sel: '#coaching-goal-card',   text: 'היעד שנקבע עד הפגישה הבאה, מוצג כאן לתזכורת', coachOnly: true },
      { sel: '#open-survey-btn',      text: 'שאלון שבועי קצר למילוי כדי לעקוב אחרי ההרגשה וההתקדמות', coachOnly: true },
    ],
    tab5: [
      { center: true, text: 'זה מרכז המידע, כאן נמצא יחד את כל התשובות: מאגר ידע על תזונה ואימונים, ושאלות נפוצות' },
      { sel: '#infoSearch',                text: 'חיפוש מהיר של כל מושג בתחום, למשל חלבון, כשל שרירי או קלוריות' },
      { sel: '#info-chapters',             text: 'מאגר מסודר לפי נושאים. לחיצה על פרק פותחת אותו, ולחיצה על מושג מציגה הסבר פשוט' },
      { sel: '#faq-categories-container',  text: 'תשובות לשאלות שחוזרות הרבה, מסודרות לפי קטגוריות' },
    ],
    ai: [
      { center: true, text: 'זהו המאמן AI. הוא מכיר אותך אישית: יודע את תוכנית האימון שלך, כמה אכלת היום, ואת ההתקדמות שלך. אפשר לשאול אותו כל שאלה על תזונה, אימונים והתאוששות' },
      { sel: '#ai-websearch-btn', text: 'הפעלת חיפוש אינטרנט בזמן אמת. כשפעיל, הסוכן מחפש מידע עדכני ומביא מקורות. כבוי כברירת מחדל לתשובות מהירות יותר' },
      { sel: 'button[onclick="resetAIChat()"]', text: 'איפוס השיחה ופתיחת שיחה חדשה. הסוכן לא זוכר שיחות קודמות בין כניסות' },
      { sel: '#ai-chat-input', text: 'אפשר לשאול כל שאלה על תזונה ואימונים. בנוסף: לבקש להוסיף מזון ישירות ליומן, למשל: "הוסף לי 150 גרם אורז"' },
      { sel: '#tab5 .ai-disclaimer', text: function () {
          return isSubscriber()
            ? 'הסוכן עשוי לטעות, יש להשתמש בו ככלי עזר בלבד'
            : 'הסוכן עשוי לטעות. בשאלות חשובות על תוכנית האימון או התזונה, כדאי לאמת מול אורי';
        } },
    ],
    general: [
      { center: true, text: 'ברוכים הבאים לאפליקציית OI. סיור קצר שמראה איך הכל עובד' },
      { sel: '.tabs',         text: 'ארבעה אזורים: תזונה, אימונים, מעקב ויעדים, ומאמן AI. מעבר ביניהם בלחיצה', pre: closeMenu },
      { sel: '.tab-btn[data-tab="tab5"]', text: 'מאמן חכם שזמין בכל שעה לשאלות על תזונה, אימונים והתהליך. מכיר את הנתונים האישיים שלך ועונה בהתאמה אישית', pre: closeMenu },
      { sel: '.hamburger-btn', pre: closeMenu, text: function () {
          return isSubscriber()
            ? 'התפריט העליון. כאן נמצא הפרופיל האישי'
            : 'התפריט העליון. כאן נמצאים הפרופיל, וואטסאפ למאמן, וקביעת פגישה';
        } },
      { sel: '.whatsapp-top-btn',  text: 'כפתור לשליחת הודעה ישירה למאמן בוואטסאפ בכל שאלה או עדכון', coachOnly: true, pre: openMenu },
      { sel: '#calendly-hamburger-btn', text: 'קביעת פגישה אישית עם המאמן ישירות מהאפליקציה', coachOnly: true, pre: openMenu },
      { sel: function () { return document.querySelector('#profile-overlay .profile-group'); },
        text: 'כל הפרטים האישיים. אפשר לעדכן שם, משקל, אלרגיות ומאכלים מועדפים, שעוזרים למאמן ה-AI להתאים המלצות', pre: openProfileForTour },
      { sel: '#pwa-add-btn',  text: 'התקנת האפליקציה על הטלפון כמו אפליקציה רגילה', pre: openProfileForTour },
    ],
  };

  const TAB_NAMES = { tab1: 'תזונה', tab2: 'אימונים', tab4: 'מעקב ויעדים', tab5: 'מאמן AI' };

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
    if (tabId === 'tab5') { return startAI(); } // tab5 הוא כעת המאמן AI — מפעיל את סיור הסוכן
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
    bubble.classList.add('is-hidden');     // הבהוב החוצה לפני מעבר לשלב הבא
    highlight.style.display = 'none';       // יוצג רק אחרי שמוקם, למניעת הבהוב

    // המתנה קצרה אם pre פתח משהו (תפריט/פרופיל), ואז גלילה ומיקום
    const delay = step.pre ? 420 : 0; // זמן לפתיחת תפריט/פרופיל (אנימציה ~0.35s) לפני מדידה
    setTimeout(function () {
      const el = resolve(step.sel);
      // דילוג אם האלמנט לא קיים או מוסתר/ריק (למשל פיצ'ר ליווי אצל מנוי)
      // הערה: אלמנט עם position:fixed (כמו סרגל הטאבים) מקבל offsetParent === null גם כשהוא גלוי,
      // אז בודקים את זה רק עבור אלמנטים שאינם fixed
      const isFixed = el && getComputedStyle(el).position === 'fixed';
      if (!el || (!isFixed && el.offsetParent === null) || (el.offsetWidth === 0 && el.offsetHeight === 0)) {
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
    // הבהוב פנימה רך אחרי שהבועה מוקמה במקום החדש
    requestAnimationFrame(function () { bubble.classList.remove('is-hidden'); });
  }

  function bubbleHTML(text, isLast) {
    const n = queue.length, cur = idx + 1;
    const nextLabel = isLast ? 'סיום' : 'הבא';
    return (
      '<p class="tour-text">' + text + '</p>' +
      '<div class="tour-foot">' +
      '<button class="tour-skip" data-act="skip">דילוג</button>' +
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
    bubble.classList.add('is-hidden');
    bubble.innerHTML = bubbleHTML(text, isLast);
    bubble.classList.add('tour-center');
    bubble.style.display = 'block';
    bubble.style.top = ''; bubble.style.left = '';
    wireBubble();
    // הבהוב פנימה רך (double rAF כדי שמצב המוסתר ייצבע קודם)
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { bubble.classList.remove('is-hidden'); });
    });
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

    let title = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" style="vertical-align:-3px"><path d="M12 3l1.5 6L20 10.5 14 12l-2 6-2-6-6-1.5L10.5 9z"/></svg> כל הכבוד!';
    let msg;
    if (ctx === 'general') {
      msg = 'סיימת את הסיור הכללי. אפשר לפתוח כל מדריך שוב מתי שרוצים מהכפתורים.';
      markGeneralSeen();
    } else if (ctx === 'ai') {
      msg = 'סיימת את הסיור של הסוכן AI';
    } else {
      msg = 'סיימת את הסיור של ' + (TAB_NAMES[ctx] || '');
    }

    const btns = '<button class="tour-next" data-act="done">סיום</button>';
    bubble.classList.add('is-hidden');
    bubble.classList.add('tour-center');
    bubble.style.display = 'block';
    bubble.style.top = ''; bubble.style.left = '';
    bubble.innerHTML = '<p class="tour-title">' + title + '</p>' +
                       '<p class="tour-text">' + msg + '</p>' +
                       '<div class="tour-foot tour-foot-end">' + btns + '</div>';
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { bubble.classList.remove('is-hidden'); });
    });
    const done = bubble.querySelector('[data-act="done"]');
    if (done) done.onclick = close;
  }

  function close() {
    closeProfileForTour();
    closeMenu();
    showLayer(false);
    if (blocker) blocker.classList.remove('solid');
    if (bubble) bubble.classList.remove('is-hidden', 'tour-center');
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
  function startAI() {
    // המאמן AI הוא טאב קבוע (tab5) — לוודא שאנחנו בו לפני הסיור
    const tab5 = document.getElementById('tab5');
    if (tab5 && !tab5.classList.contains('active')) {
      if (typeof openAIChat === 'function') openAIChat();
    }
    ctx = 'ai';
    queue = STEPS.ai;
    idx = 0;
    build(); showLayer(true);
    lockScroll();
    bindResize();
    render();
  }

  window.startTabTour = startTab;
  window.startGeneralTour = startGeneral;
  window.startAITour = startAI;
  window.Tour = { startTab: startTab, startGeneral: startGeneral, maybeAutoRun: maybeAutoRun, startAI: startAI };
})();
