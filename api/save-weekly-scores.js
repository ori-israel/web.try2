const { createClient } = require('@supabase/supabase-js');

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

    // Week that just ended: Sun–Sat (Israeli calendar). Cron runs Sun 00:02 UTC = Sat just ended.
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    const sat = new Date(now);
    sat.setUTCDate(now.getUTCDate() - 1); // yesterday = Saturday
    const sun = new Date(sat);
    sun.setUTCDate(sat.getUTCDate() - 6); // 6 days before Sat = Sunday

    const fmt = d => d.toISOString().split('T')[0];
    const weekStart = fmt(sun);
    const weekEnd   = fmt(sat);

    console.log(`Saving weekly scores for ${weekStart} – ${weekEnd}`);

    const { data: profiles, error: profErr } = await supabase
        .from('profiles')
        .select('id, workouts_per_week, protein_ratio, current_weight, start_weight, vacation_mode, portion_values, birth_date, gender, height, activity_level, goal')
        .eq('is_admin', false);

    if (profErr) {
        console.error('Error fetching profiles:', profErr);
        return res.status(500).json({ error: profErr.message });
    }

    const results = [];

    for (const profile of profiles) {
        const userId = profile.id;

        if (profile.vacation_mode) {
            console.log(`Skipping ${userId} — vacation mode active`);
            results.push({ userId, skipped: true, reason: 'vacation' });
            continue;
        }

        // Skip if score already saved for this client + week
        const { data: existing } = await supabase
            .from('weekly_scores')
            .select('id')
            .eq('client_id', userId)
            .eq('week_start', weekStart)
            .maybeSingle();

        if (existing) {
            results.push({ userId, skipped: true });
            continue;
        }

        // Workouts (40%): distinct dates in workout_performance_log ÷ workouts_per_week
        const { data: workoutData } = await supabase
            .from('workout_performance_log')
            .select('date')
            .eq('client_id', userId)
            .gte('date', weekStart)
            .lte('date', weekEnd);

        const workoutDates  = new Set((workoutData || []).map(r => r.date));
        const weeklyTarget  = profile.workouts_per_week || 3;
        const workoutsScore = Math.min(workoutDates.size / weeklyTarget, 1);

        // Nutrition (40%): a day counts only if ALL 3 portions meet their target.
        // Formula identical to app.js calcPortionTargets() / auth.js coach dashboard — keep them in sync.
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

        // Habits (20%): any weight entry this week
        const { data: weightData } = await supabase
            .from('weight_history')
            .select('date')
            .eq('user_id', userId)
            .gte('date', weekStart)
            .lte('date', weekEnd)
            .limit(1);

        const habitsScore = (weightData && weightData.length > 0) ? 1 : 0;

        // Final weighted score (0–100)
        const score             = Math.round((workoutsScore * 0.4 + nutritionScore * 0.4 + habitsScore * 0.2) * 100);
        const workoutsScorePct  = Math.round(workoutsScore  * 100);
        const nutritionScorePct = Math.round(nutritionScore * 100);
        const habitsScorePct    = Math.round(habitsScore    * 100);

        const { error: insertErr } = await supabase
            .from('weekly_scores')
            .insert({
                client_id:       userId,
                week_start:      weekStart,
                score,
                workouts_score:  workoutsScorePct,
                nutrition_score: nutritionScorePct,
                habits_score:    habitsScorePct,
            });

        if (insertErr) {
            console.error(`Error saving score for ${userId}:`, insertErr);
            results.push({ userId, error: insertErr.message });
        } else {
            console.log(`Saved score ${score} for ${userId}`);
            results.push({ userId, score, weekStart });
        }
    }

    return res.status(200).json({ week: weekStart, results });
};
