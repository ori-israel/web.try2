const _ACH_ICON_BARBELL = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><rect x="2" y="10" width="2.5" height="4" rx="0.6"/><rect x="5" y="8.5" width="2" height="7" rx="0.6"/><path d="M7.5 12h9"/><rect x="17" y="8.5" width="2" height="7" rx="0.6"/><rect x="19.5" y="10" width="2.5" height="4" rx="0.6"/></svg>';
const _ACH_ICON_FLAME    = '<span style="display:inline-flex;vertical-align:-3px;"><svg viewBox="0 0 24 24" width="17" height="17" fill="#f97316" stroke="#f97316" stroke-width="1" stroke-linejoin="round"><path d="M12 2.5c-1.2 3.3-5 5.7-5 9.5a5 5 0 0 0 10 0c0-1.6-.7-2.9-1.8-4 .1 1.7-.9 2.4-1.6 2 .9-2 -.2-4.2-1.6-7.5z"/></svg></span>';
const _ACH_ICON_DIAMOND  = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20"/><path d="M9 3l3 6 3-6"/><path d="M9 9l3 12 3-12"/></svg>';
const _ACH_ICON_SCALE    = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><path d="M12 3v18"/><path d="M6 21h12"/><path d="M5 7h5M14 7h5"/><path d="M5 7l-3 6a3 3 0 0 0 6 0z"/><path d="M19 7l-3 6a3 3 0 0 0 6 0z"/><circle cx="12" cy="4" r="1.2"/></svg>';
const _ACH_ICON_TREND    = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><path d="M3 17l6-6 4 4 8-9"/><path d="M17 6h4v4"/></svg>';
const _ACH_ICON_UTENSILS = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><path d="M5.5 3v6M8 3v6M10.5 3v6"/><path d="M5.5 9c0 1.8 2.5 1.8 2.5 1.8S10.5 10.8 10.5 9"/><path d="M8 10.8v10.2"/><path d="M17 3l2 6-2 3"/><path d="M17 3v18"/></svg>';
const _ACH_ICON_TROPHY   = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><path d="M8 4h8v4a4 4 0 0 1-8 0V4z"/><path d="M8 5H5a3 3 0 0 0 3 5"/><path d="M16 5h3a3 3 0 0 1-3 5"/><path d="M10 13v3"/><path d="M14 13v3"/><path d="M7 20h10"/><path d="M9 20c0-2 .5-3 3-3s3 1 3 3"/></svg>';

const ACHIEVEMENTS = {
    first_workout:       { title: _ACH_ICON_BARBELL + ' האימון הראשון!',        desc: 'ברוך הבא, סיימת את האימון הראשון שלך!' },
    '10_workouts':       { title: _ACH_ICON_FLAME   + ' 10 אימונים!',            desc: 'הגעת ל-10 אימונים. אתה בדרך הנכונה.' },
    '50_workouts':       { title: _ACH_ICON_DIAMOND + ' 50 אימונים!',            desc: 'מדהים, 50 אימונים מאחוריך. אתה מכונה.' },
    weight_goal:         { title: _ACH_ICON_SCALE   + ' יעד המשקל הושג!',        desc: 'הגעת ליעד שהצבת לעצמך. כל הכבוד!' },
    '3_weeks_80':        { title: _ACH_ICON_TREND   + ' שלושה שבועות מעל 80!',   desc: '3 שבועות רצופים עם ציון 80 ומעלה. קבוע!' },
    streak_7_workout:    { title: _ACH_ICON_BARBELL + ' רצף שבועי באימונים!',    desc: '7 ימים רצופים של אימונים. ביצוע מושלם.' },
    streak_7_nutrition:  { title: _ACH_ICON_UTENSILS + ' רצף שבועי בתזונה!',     desc: '7 ימים רצופים עם עמידה ביעדי התזונה.' },
    score_100:           { title: _ACH_ICON_TROPHY + ' ציון שבועי מושלם!',      desc: 'קיבלת 100% השבוע. אין מה להוסיף.' },
};

const REPEATING = new Set(['streak_7_workout', 'streak_7_nutrition', 'score_100']);

async function checkAchievements(profile, streaks, weeklyScores, workoutLogs) {
    const userId = getActiveUserId();
    if (!userId) return;

    const { data: profileRow } = await db
        .from('profiles')
        .select('achievements_unlocked')
        .eq('id', userId)
        .single();

    const unlocked = [...(profileRow?.achievements_unlocked || [])];
    const newlyUnlocked = [];

    if (!workoutLogs) {
        const { data } = await db
            .from('workout_performance_log')
            .select('date')
            .eq('client_id', userId);
        workoutLogs = data || [];
    }

    if (!weeklyScores) {
        const { data } = await db
            .from('weekly_scores')
            .select('score, week_start')
            .eq('client_id', userId)
            .order('week_start', { ascending: false });
        weeklyScores = data || [];
    }

    if (!streaks) {
        streaks = {
            workout_streak:   parseInt(localStorage.getItem('workout_streak')   || '0'),
            nutrition_streak: parseInt(localStorage.getItem('nutrition_streak') || '0'),
        };
    }

    function tryUnlock(key, condition) {
        if (unlocked.includes(key) || !condition) return;
        unlocked.push(key);
        newlyUnlocked.push(key);
    }

    tryUnlock('first_workout', workoutLogs.length >= 1);
    tryUnlock('10_workouts',   workoutLogs.length >= 10);
    tryUnlock('50_workouts',   workoutLogs.length >= 50);

    const goal          = profile?.goal          || CLIENT?.goal;
    const currentWeight = profile?.currentWeight || CLIENT?.currentWeight || profile?.current_weight;
    const startWeight   = profile?.startWeight   || CLIENT?.startWeight   || profile?.start_weight;
    if (goal === 'cut'  && currentWeight != null && startWeight != null && currentWeight <= startWeight - 5) tryUnlock('weight_goal', true);
    if (goal === 'bulk' && currentWeight != null && startWeight != null && currentWeight >= startWeight + 3) tryUnlock('weight_goal', true);

    if (weeklyScores.length >= 3) {
        const last3 = weeklyScores.slice(0, 3).map(s => s.score);
        tryUnlock('3_weeks_80', last3.every(s => s >= 80));
    }

    if (newlyUnlocked.length > 0) {
        await db.from('profiles')
            .update({ achievements_unlocked: unlocked })
            .eq('id', userId);
        for (const key of newlyUnlocked) await _showAchievementPopup(key);
    }

    // score_100 repeating — once per day
    const today = typeof localDateStr === 'function' ? localDateStr() : new Date().toISOString().slice(0,10);
    if (weeklyScores.length > 0 && weeklyScores[0].score === 100) {
        const sessionKey = 'ach_shown_score_100_' + today;
        if (!localStorage.getItem(sessionKey)) {
            localStorage.setItem(sessionKey, '1');
            await _showAchievementPopup('score_100');
        }
    }
}

function _showAchievementPopup(key) {
    return new Promise(resolve => {
        const ach = ACHIEVEMENTS[key];
        const el  = document.getElementById('achievement-popup');
        if (!ach || !el) { resolve(); return; }

        document.getElementById('achievement-title').innerHTML = ach.title;
        document.getElementById('achievement-desc').textContent  = ach.desc;
        el.style.cssText = 'display:flex;position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:10000;align-items:center;justify-content:center;';

        const done = () => { _closeAchievementPopup(); resolve(); };
        el._timer   = setTimeout(done, 4000);
        el._resolve = resolve;
        el.onclick  = (e) => { if (e.target === el) done(); };
    });
}

function _closeAchievementPopup() {
    const el = document.getElementById('achievement-popup');
    if (!el) return;
    clearTimeout(el._timer);
    el.style.display = 'none';
    if (el._resolve) { el._resolve(); el._resolve = null; }
}
