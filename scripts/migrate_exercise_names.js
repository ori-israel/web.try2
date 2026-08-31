// מיגרציה חד-פעמית: מעדכן שמות תרגילים ישנים לשמות החדשים (תיקנון שמות, 2026-08-31)
// אצל כל המשתמשים הקיימים ב-Supabase, כדי שתוכניות/היסטוריית משקלים לא "ייעלמו".
//
// שימוש:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate_exercise_names.js
//   (ברירת מחדל: dry-run בלבד, מדפיס מה ישתנה בלי לגעת ב-DB)
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate_exercise_names.js --apply
//   (מבצע בפועל)

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const APPLY = process.argv.includes('--apply');
const MAP = JSON.parse(fs.readFileSync(path.join(__dirname, 'exercise_rename_map.json'), 'utf8'));
const RENAME_PAIRS = Object.entries(MAP).filter(([oldName, newName]) => oldName !== newName);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('חסר SUPABASE_URL או SUPABASE_SERVICE_ROLE_KEY בסביבה.');
    process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY);

const WORKOUT_COLS = ['workout_a', 'workout_b', 'workout_c', 'workout_d', 'workout_e', 'workout_f', 'workout_g'];

function renameInWorkoutArray(arr) {
    if (!Array.isArray(arr)) return { changed: false, arr };
    let changed = false;
    const newArr = arr.map(ex => {
        if (ex && typeof ex === 'object' && ex.name && MAP[ex.name] && MAP[ex.name] !== ex.name) {
            changed = true;
            return { ...ex, name: MAP[ex.name] };
        }
        return ex;
    });
    return { changed, arr: newArr };
}

function renameNotesKeys(notes) {
    if (!notes || typeof notes !== 'object') return { changed: false, notes };
    let changed = false;
    const newNotes = {};
    for (const [name, val] of Object.entries(notes)) {
        const newName = MAP[name] && MAP[name] !== name ? MAP[name] : name;
        if (newName !== name) changed = true;
        newNotes[newName] = val;
    }
    return { changed, notes: newNotes };
}

async function migrateProfiles() {
    const { data: profiles, error } = await db
        .from('profiles')
        .select('id, ' + WORKOUT_COLS.join(', ') + ', exercise_notes');
    if (error) throw error;

    console.log(`נבדקו ${profiles.length} פרופילים.`);
    let profilesToChange = 0;

    for (const profile of profiles) {
        const update = {};
        let anyChange = false;

        for (const col of WORKOUT_COLS) {
            const { changed, arr } = renameInWorkoutArray(profile[col]);
            if (changed) { update[col] = arr; anyChange = true; }
        }

        const { changed: notesChanged, notes } = renameNotesKeys(profile.exercise_notes);
        if (notesChanged) { update.exercise_notes = notes; anyChange = true; }

        if (anyChange) {
            profilesToChange++;
            console.log(`\nפרופיל ${profile.id}:`);
            for (const key of Object.keys(update)) console.log(`  - ${key} משתנה`);
            if (APPLY) {
                const { error: updErr } = await db.from('profiles').update(update).eq('id', profile.id);
                if (updErr) console.error(`  שגיאה בעדכון ${profile.id}:`, updErr.message);
                else console.log('  עודכן.');
            }
        }
    }

    console.log(`\nסה"כ פרופילים עם שינוי: ${profilesToChange} / ${profiles.length}`);
}

async function migratePerformanceLog() {
    console.log('\n--- workout_performance_log ---');
    let totalRows = 0;

    for (const [oldName, newName] of RENAME_PAIRS) {
        const { count, error: countErr } = await db
            .from('workout_performance_log')
            .select('id', { count: 'exact', head: true })
            .eq('exercise_name', oldName);
        if (countErr) { console.error('שגיאה בספירה עבור', oldName, countErr.message); continue; }
        if (!count) continue;

        totalRows += count;
        console.log(`"${oldName}" → "${newName}": ${count} רשומות`);

        if (APPLY) {
            const { error: updErr } = await db
                .from('workout_performance_log')
                .update({ exercise_name: newName })
                .eq('exercise_name', oldName);
            if (updErr) console.error('  שגיאה בעדכון:', updErr.message);
            else console.log('  עודכן.');
        }
    }

    console.log(`\nסה"כ רשומות ביומן ביצועים עם שינוי: ${totalRows}`);
}

(async () => {
    console.log(APPLY ? '=== מצב ביצוע בפועל ===' : '=== מצב DRY-RUN (לא נוגע ב-DB) ===');
    await migrateProfiles();
    await migratePerformanceLog();
    if (!APPLY) console.log('\nזה היה dry-run. כדי לבצע בפועל: הרץ שוב עם --apply');
})();
