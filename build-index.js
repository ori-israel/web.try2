const fs = require('fs');
const path = require('path');

const PARTIALS_DIR = path.join(__dirname, 'partials');
const OUTPUT_FILE = path.join(__dirname, 'index.html');

const PARTIALS = [
    '00-head.html',
    '01-login-overlay.html',
    '02-admin-modals.html',
    '03-app-shell-header.html',
    '04-tab1-nutrition.html',
    '05-tab2-workouts.html',
    '06-tab4-tracking.html',
    '07-tab5-info-center.html',
    '08-overlays-modals.html',
    '09-script-tags.html',
    '10-footer-modals-scripts.html',
];

const combined = PARTIALS.map(name => fs.readFileSync(path.join(PARTIALS_DIR, name), 'utf8')).join('');
fs.writeFileSync(OUTPUT_FILE, combined);
console.log(`index.html נבנה מ-${PARTIALS.length} קבצי partials`);
