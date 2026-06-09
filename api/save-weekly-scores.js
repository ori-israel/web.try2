const { createClient } = require('@supabase/supabase-js');

const WEEKS_BACK = 8; // כמה שבועות שהסתיימו לבדוק ולהשלים בכל ריצה

const fmt = d => d.toISOString().split('T')[0];

// חישוב ציון של שבוע יחיד ללקוח יחיד. נוסחה זהה ל-app.js calcPortionTargets()/auth.js.
async function computeScore(supabase, profile, weekStart, weekEnd) {
    const userId = profile.id;

    // אימונים (40%): ימי אימון ייחודיים ÷ יעד שבועי
    const { data: workoutData } = await supabase
        .from('workout_performance_log')
        .select('date')
        .eq('client_id', userId)
        .gte('date', weekStart)
        .lte('date', weekEnd);
    const workoutDates  = new Set((workoutData || []).map(r => r.date));
    const weeklyTarget  = Object.values(profile.workout_days || {}).reduce((s, days) => s + days.length, 0) || profile.workouts_per_week || 3;
    const workoutsScore = Math.min(workoutDates.size / weeklyTarget, 1);

    // תזונה (40%): יום נספר רק אם כל 3 המנות עומדות ביעד האישי
    const pv  = profile.portion_values || {};
    const pvP = pv.protein ?? 27.5;
    const pvC = pv.carbs   ?? 37.5;
    const pvF = pv.fat     ?? 12.5;

    const weight   = profile.current_weight || profile.start_weight || 80;
    const age      = profile.birth_date ? Math.floor((new Date() - new Date(profile.birth_date)) / (1000*60*60*24*365.25)) : 30;
    const gender   = profile.gender || 'male';
    const height   = profile.height || 170;
    const activity = profile.activity_level || 1.4;
    const goal     = profile.goal || 'maintain';
    const pRatio   = profile.protein_ratio || 2.0;
    let bmr = (10 * weight) + (6.25 * height) - (5 * age);
    bmr = gender === 'male' ? bmr + 5 : bmr - 161;
    const tdee         = Math.round(bmr * activity);
    const totalCal     = goal === 'cut' ? tdee - 250 : tdee + 250;
    const proteinGrams = weight * pRatio;
    const remaining    = totalCal - proteinGrams * 4;
    const carbCals     = goal === 'cut' ? remaining * 0.7 : remaining * 0.6;
    const fatCals      = goal === 'cut' ? remaining * 0.3 : remaining * 0.4;
    const tgProtein    = Math.round((proteinGrams / pvP) * 2) / 2;
    const tgCarbs      = Math.round((carbCals / 4 / pvC) * 2) / 2;
    const tgFat        = Math.round((fatCals / 9 / pvF) * 2) / 2;

    const { data: nutritionData } = await supabase
        .from('daily_nutrition')
        .select('protein, carbs, fat')
        .eq('user_id', userId)
        .gte('date', weekStart)
        .lte('date', weekEnd);
    let nutritionMet = 0;
    (nutritionData || []).forEach(r => {
        if (r.protein >= tgProtein && r.carbs >= tgCarbs && r.fat >= tgFat) nutritionMet++;
    });
    const nutritionScore = Math.min(nutritionMet / 7, 1);

    // הרגלים (20%): שקילה כלשהי השבוע
    const { data: weightData } = await supabase
        .from('weight_history')
        .select('date')
        .eq('user_id', userId)
        .gte('date', weekStart)
        .lte('date', weekEnd)
        .limit(1);
    const habitsScore = (weightData && weightData.length > 0) ? 1 : 0;

    return {
        score:           Math.round((workoutsScore * 0.4 + nutritionScore * 0.4 + habitsScore * 0.2) * 100),
        workouts_score:  Math.round(workoutsScore  * 100),
        nutrition_score: Math.round(nutritionScore * 100),
        habits_score:    Math.round(habitsScore    * 100),
    };
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const secret = process.env.CRON_SECRET;
    const auth   = req.headers.authorization || '';
    if (!secret || auth !== `Bearer ${secret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
    );

    // ניקוי יומן מאכלים ישן — מוחק כל מה שמעל 7 ימים (שומר על הטבלה קטנה)
    try {
        const cutoff = new Date();
        cutoff.setUTCDate(cutoff.getUTCDate() - 7);
        const { error: foodDelErr } = await supabase
            .from('food_log')
            .delete()
            .lt('date', fmt(cutoff));
        if (foodDelErr) console.error('food_log cleanup error:', foodDelErr.message);
        else console.log(`food_log cleanup: removed entries older than ${fmt(cutoff)}`);
    } catch (e) {
        console.error('food_log cleanup failed:', e.message);
    }

    // השבוע האחרון שהסתיים: ראשון–שבת. ה-cron רץ ראשון 00:02 UTC = שבת הרגע נגמרה.
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    const lastSat = new Date(now);
    lastSat.setUTCDate(now.getUTCDate() - 1); // אתמול = שבת
    const lastSun = new Date(lastSat);
    lastSun.setUTCDate(lastSat.getUTCDate() - 6); // 6 ימים לפני שבת = ראשון

    // בניית רשימת 8 השבועות שהסתיימו (מהחדש לישן)
    const weeks = [];
    for (let i = 0; i < WEEKS_BACK; i++) {
        const sun = new Date(lastSun); sun.setUTCDate(lastSun.getUTCDate() - 7 * i);
        const sat = new Date(lastSat); sat.setUTCDate(lastSat.getUTCDate() - 7 * i);
        weeks.push({ weekStart: fmt(sun), weekEnd: fmt(sat) });
    }
    const earliestStart = weeks[weeks.length - 1].weekStart;

    console.log(`Backfilling weekly scores from ${earliestStart} to ${weeks[0].weekStart}`);

    const { data: profiles, error: profErr } = await supabase
        .from('profiles')
        .select('id, workouts_per_week, workout_days, protein_ratio, current_weight, start_weight, vacation_mode, portion_values, birth_date, gender, height, activity_level, goal')
        .eq('is_admin', false);

    if (profErr) {
        console.error('Error fetching profiles:', profErr);
        return res.status(500).json({ error: profErr.message });
    }

    // שליפה אחת של כל הציונים הקיימים בטווח — כדי לדעת מה כבר שמור (לא לדרוס)
    const clientIds = profiles.map(p => p.id);
    const { data: existingRows } = await supabase
        .from('weekly_scores')
        .select('client_id, week_start')
        .in('client_id', clientIds)
        .gte('week_start', earliestStart);
    const existingSet = new Set((existingRows || []).map(r => `${r.client_id}|${r.week_start}`));

    const results = [];

    for (const profile of profiles) {
        const userId = profile.id;

        if (profile.vacation_mode) {
            results.push({ userId, skipped: true, reason: 'vacation' });
            continue;
        }

        for (const { weekStart, weekEnd } of weeks) {
            // לדלג אם כבר קיים ציון לאותו שבוע — להשלים חסרים בלבד
            if (existingSet.has(`${userId}|${weekStart}`)) continue;

            try {
                const s = await computeScore(supabase, profile, weekStart, weekEnd);
                const { error: insertErr } = await supabase
                    .from('weekly_scores')
                    .insert({ client_id: userId, week_start: weekStart, ...s });

                if (insertErr) {
                    console.error(`Error saving ${userId} ${weekStart}:`, insertErr.message);
                    results.push({ userId, weekStart, error: insertErr.message });
                } else {
                    console.log(`Saved ${s.score} for ${userId} ${weekStart}`);
                    results.push({ userId, weekStart, score: s.score, backfilled: true });
                }
            } catch (e) {
                console.error(`Failed ${userId} ${weekStart}:`, e.message);
                results.push({ userId, weekStart, error: e.message });
            }
        }
    }

    return res.status(200).json({ weeksChecked: weeks.map(w => w.weekStart), filled: results.filter(r => r.backfilled).length, results });
};
