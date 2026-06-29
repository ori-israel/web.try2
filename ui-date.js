(function () {
    'use strict';

    const MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
    const DAYS   = ['א','ב','ג','ד','ה','ו','ש'];

    let _panel   = null;
    let _trigger = null;
    let _ctx     = null; // { inp, trigger, year, month }

    function _today() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }

    function _fmt(val) {
        if (!val) return '';
        const [y, m, d] = val.split('-');
        return `${parseInt(d, 10)} ${MONTHS[parseInt(m, 10) - 1]} ${y}`;
    }

    function _sync(inp, btn, lbl) {
        const formatted = _fmt(inp.value);
        lbl.textContent = formatted || 'בחר תאריך';
        lbl.classList.toggle('dp-placeholder', !formatted);
        btn.disabled = inp.disabled;
        btn.classList.toggle('cs-disabled', inp.disabled);
    }

    // ── Init one <input type="date"> ─────────────────────────────
    function _init(inp) {
        if (inp._dpInit) return;
        inp._dpInit = true;

        const btn = document.createElement('button');
        btn.type = 'button';
        const cls = inp.className.trim();
        btn.className = (cls ? cls + ' ' : '') + 'cs-trigger';
        btn.setAttribute('aria-haspopup', 'dialog');
        btn.setAttribute('aria-expanded', 'false');

        const lbl = document.createElement('span');
        lbl.className = 'cs-label';

        const arr = document.createElement('span');
        arr.className = 'cs-arrow';
        arr.setAttribute('aria-hidden', 'true');

        btn.appendChild(lbl);
        btn.appendChild(arr);

        // Wire label[for] to the button so clicking the label opens picker
        if (inp.id) {
            btn.id = inp.id + '-dpbtn';
            const label = document.querySelector(`label[for="${inp.id}"]`);
            if (label) label.htmlFor = btn.id;
        }

        inp.parentNode.insertBefore(btn, inp.nextSibling);
        inp.style.display = 'none';

        _sync(inp, btn, lbl);

        // Intercept external .value = X (loadProfile, openNewClientModal, etc.)
        const vd = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        Object.defineProperty(inp, 'value', {
            get()  { return vd.get.call(this); },
            set(v) { vd.set.call(this, v); _sync(inp, btn, lbl); },
            configurable: true,
        });

        // Watch disabled attribute (setCoachFieldsState)
        new MutationObserver(() => _sync(inp, btn, lbl))
            .observe(inp, { attributes: true, attributeFilter: ['disabled'] });

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (inp.disabled) return;
            if (_trigger === btn) { _close(); return; }
            _close();
            _open(inp, btn, lbl);
        });
    }

    // ── Open panel ────────────────────────────────────────────────
    function _open(inp, trigger, lbl) {
        _trigger = trigger;
        trigger.setAttribute('aria-expanded', 'true');
        trigger.classList.add('cs-open');

        const val = inp.value || _today();
        const d   = new Date(val + 'T12:00:00');
        _ctx = { inp, trigger, year: d.getFullYear(), month: d.getMonth() };

        const panel = document.createElement('div');
        panel.className = 'dp-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('dir', 'rtl');

        panel.addEventListener('click', (e) => {
            e.stopPropagation(); // prevent global _close()

            const day  = e.target.closest('.dp-day');
            const prev = e.target.closest('.dp-nav-prev');
            const next = e.target.closest('.dp-nav-next');

            if (day) {
                const ds  = day.dataset.date;
                const t   = _ctx.trigger;
                inp.value = ds;
                inp.dispatchEvent(new Event('change', { bubbles: true }));
                _close();
                t.focus();
            } else if (prev) {
                if (_ctx.month === 0) { _ctx.month = 11; _ctx.year--; }
                else _ctx.month--;
                _render();
            } else if (next) {
                if (_ctx.month === 11) { _ctx.month = 0; _ctx.year++; }
                else _ctx.month++;
                _render();
            }
        });

        panel.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { e.preventDefault(); _close(); trigger.focus(); }
            else if (e.key === 'Enter' || e.key === ' ') {
                if (e.target.classList.contains('dp-day') ||
                    e.target.classList.contains('dp-nav')) {
                    e.preventDefault(); e.target.click();
                }
            }
        });

        document.body.appendChild(panel);
        _panel = panel;

        _render();
        _pos(panel, trigger);

        requestAnimationFrame(() => panel.classList.add('dp-panel-open'));
    }

    // ── Render calendar grid ──────────────────────────────────────
    function _render() {
        if (!_panel || !_ctx) return;
        const { inp, year, month } = _ctx;
        const today = _today();
        const sel   = inp.value;

        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstDOW    = new Date(year, month, 1).getDay();

        let html = `
        <div class="dp-header">
            <button class="dp-nav dp-nav-prev" type="button">›</button>
            <span class="dp-month-label">${MONTHS[month]} ${year}</span>
            <button class="dp-nav dp-nav-next" type="button">‹</button>
        </div>
        <div class="dp-daynames">
            ${DAYS.map(d => `<div>${d}</div>`).join('')}
        </div>
        <div class="dp-grid">`;

        for (let i = 0; i < firstDOW; i++) html += '<div></div>';
        for (let day = 1; day <= daysInMonth; day++) {
            const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            let cls = 'dp-day';
            if (ds === sel)   cls += ' dp-day-sel';
            if (ds === today) cls += ' dp-day-today';
            html += `<div class="${cls}" data-date="${ds}" role="button" tabindex="0">${day}</div>`;
        }

        html += '</div>';
        _panel.innerHTML = html;
    }

    // ── Position panel (fixed to body) ────────────────────────────
    function _pos(panel, trigger) {
        const r   = trigger.getBoundingClientRect();
        const vh  = window.innerHeight;
        const est = 290;

        panel.style.width = Math.max(r.width, 260) + 'px';
        panel.style.left  = r.left + 'px';

        if (r.bottom + est > vh - 8) {
            panel.style.top    = '';
            panel.style.bottom = (vh - r.top + 4) + 'px';
        } else {
            panel.style.top    = (r.bottom + 4) + 'px';
            panel.style.bottom = '';
        }
    }

    // ── Close ─────────────────────────────────────────────────────
    function _close() {
        if (!_panel) return;
        const p = _panel, t = _trigger;
        _panel = null; _trigger = null; _ctx = null;
        if (t) { t.setAttribute('aria-expanded', 'false'); t.classList.remove('cs-open'); }
        p.classList.remove('dp-panel-open');
        setTimeout(() => p.remove(), 220);
    }

    document.addEventListener('click', _close);
    window.addEventListener('resize', _close);
    document.addEventListener('scroll', (e) => {
        if (_panel && !_panel.contains(e.target)) _close();
    }, true);

    // ── Init all ──────────────────────────────────────────────────
    function _initAll() {
        document.querySelectorAll('input[type="date"]').forEach(_init);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _initAll);
    else _initAll();
})();
