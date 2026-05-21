const ACHIEVEMENTS = {
    first_workout:       { title: '🏋️ האימון הראשון!',        desc: 'ברוך הבא — סיימת את האימון הראשון שלך!' },
    '10_workouts':       { title: '🔥 10 אימונים!',            desc: 'הגעת ל-10 אימונים. אתה בדרך הנכונה.' },
    '50_workouts':       { title: '💎 50 אימונים!',            desc: 'מדהים — 50 אימונים מאחוריך. אתה מכונה.' },
    weight_goal:         { title: '⚖️ יעד המשקל הושג!',        desc: 'הגעת ליעד שהצבת לעצמך. כל הכבוד!' },
    '3_weeks_80':        { title: '📈 שלושה שבועות מעל 80!',   desc: '3 שבועות רצופים עם ציון 80 ומעלה. קבוע!' },
    streak_7_workout:    { title: '💪 רצף שבועי באימונים!',    desc: '7 ימים רצופים של אימונים. ביצוע מושלם.' },
    streak_7_nutrition:  { title: '🥗 רצף שבועי בתזונה!',     desc: '7 ימים רצופים עם עמידה ביעדי התזונה.' },
    score_100:           { title: '🏆 ציון שבועי מושלם!',      desc: 'קיבלת 100% השבוע. אין מה להוסיף.' },
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

        document.getElementById('achievement-title').textContent = ach.title;
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
