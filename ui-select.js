(function () {
    'use strict';

    let _panel   = null;
    let _trigger = null;

    // ── Sync button label + disabled state with <select> ─────────
    function _sync(sel, btn, lbl) {
        const opt = sel.options[sel.selectedIndex];
        lbl.textContent = opt ? opt.textContent : '';
        btn.disabled = sel.disabled;
        btn.classList.toggle('cs-disabled', sel.disabled);
    }

    // ── Wrap one <select> ─────────────────────────────────────────
    function _init(sel) {
        if (sel._csInit) return;
        sel._csInit = true;

        const btn = document.createElement('button');
        btn.type  = 'button';

        // Copy classes, drop profile-select (only had cursor — cs-trigger handles it)
        const cls = sel.className.replace(/\bprofile-select\b/, '').replace(/\s+/, ' ').trim();
        btn.className = (cls ? cls + ' ' : '') + 'cs-trigger';
        btn.setAttribute('aria-haspopup', 'listbox');
        btn.setAttribute('aria-expanded', 'false');

        // Copy inline styles (edit-food-unit carries them), then enforce flex
        if (sel.style.cssText) {
            btn.style.cssText         = sel.style.cssText;
            btn.style.display         = 'flex';
            btn.style.alignItems      = 'center';
            btn.style.justifyContent  = 'space-between';
            btn.style.cursor          = 'pointer';
        }

        const lbl = document.createElement('span');
        lbl.className = 'cs-label';

        const arr = document.createElement('span');
        arr.className = 'cs-arrow';
        arr.setAttribute('aria-hidden', 'true');

        btn.appendChild(lbl);
        btn.appendChild(arr);

        // Insert button right after select, then hide select
        sel.parentNode.insertBefore(btn, sel.nextSibling);
        sel.style.display = 'none';

        _sync(sel, btn, lbl);

        // Intercept external .value = X (loadProfile, admin, saveFoodLogEdit, etc.)
        const vd = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
        Object.defineProperty(sel, 'value', {
            get()  { return vd.get.call(this); },
            set(v) { vd.set.call(this, v); _sync(sel, btn, lbl); },
            configurable: true,
        });

        const sid = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');
        Object.defineProperty(sel, 'selectedIndex', {
            get()  { return sid.get.call(this); },
            set(v) { sid.set.call(this, v); _sync(sel, btn, lbl); },
            configurable: true,
        });

        // Watch disabled attribute (setCoachFieldsState: f.disabled = !editable)
        new MutationObserver(() => _sync(sel, btn, lbl))
            .observe(sel, { attributes: true, attributeFilter: ['disabled'] });

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (sel.disabled) return;
            if (_trigger === btn) { _close(); return; }
            _close();
            _open(sel, btn);
        });
    }

    // ── Open panel ────────────────────────────────────────────────
    function _open(sel, trigger) {
        _trigger = trigger;
        trigger.setAttribute('aria-expanded', 'true');
        trigger.classList.add('cs-open');

        const panel = document.createElement('div');
        panel.className = 'cs-panel';
        panel.setAttribute('role', 'listbox');
        panel.setAttribute('dir', 'rtl');

        Array.from(sel.options).forEach((opt) => {
            const item = document.createElement('div');
            item.className  = 'cs-option' + (opt.value === sel.value ? ' cs-selected' : '');
            item.setAttribute('role', 'option');
            item.setAttribute('tabindex', '0');
            if (opt.value === sel.value) item.setAttribute('aria-selected', 'true');
            item.textContent = opt.textContent;

            // Prevent blur-triggered close before click fires
            item.addEventListener('pointerdown', (e) => e.preventDefault());

            item.addEventListener('click', (e) => {
                e.stopPropagation();
                sel.value = opt.value;
                sel.dispatchEvent(new Event('change', { bubbles: true }));
                _close();
                trigger.focus();
            });

            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.click(); }
            });

            panel.appendChild(item);
        });

        document.body.appendChild(panel);
        _panel = panel;

        _pos(panel, trigger, sel.options.length);

        function onKey(e) {
            if (!_panel) return;
            const items = [..._panel.querySelectorAll('.cs-option')];
            const idx   = items.indexOf(document.activeElement);
            if      (e.key === 'Escape')    { e.preventDefault(); _close(); trigger.focus(); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(idx + 1, items.length - 1)]?.focus(); }
            else if (e.key === 'ArrowUp')   { e.preventDefault(); items[Math.max(idx - 1, 0)]?.focus(); }
        }
        document.addEventListener('keydown', onKey);
        panel._onKey = onKey;

        requestAnimationFrame(() => panel.classList.add('cs-panel-open'));
    }

    // ── Position panel relative to trigger (fixed to body) ───────
    function _pos(panel, trigger, optCount) {
        const r   = trigger.getBoundingClientRect();
        const vh  = window.innerHeight;
        const est = Math.min(optCount * 44 + 8, 248);

        panel.style.width = r.width + 'px';
        panel.style.left  = r.left + 'px';

        if (r.bottom + est > vh - 8) {
            panel.style.top    = '';
            panel.style.bottom = (vh - r.top + 4) + 'px';
        } else {
            panel.style.top    = (r.bottom + 4) + 'px';
            panel.style.bottom = '';
        }
    }

    // ── Close panel ───────────────────────────────────────────────
    function _close() {
        if (!_panel) return;
        const p = _panel, t = _trigger;
        _panel = null; _trigger = null;
        if (t) { t.setAttribute('aria-expanded', 'false'); t.classList.remove('cs-open'); }
        if (p._onKey) document.removeEventListener('keydown', p._onKey);
        p.classList.remove('cs-panel-open');
        setTimeout(() => p.remove(), 220);
    }

    // ── Global dismiss triggers ───────────────────────────────────
    document.addEventListener('click', _close);
    window.addEventListener('resize', _close);
    document.addEventListener('scroll', (e) => {
        if (_panel && !_panel.contains(e.target)) _close();
    }, true);

    // ── Init ──────────────────────────────────────────────────────
    function _initAll() {
        document.querySelectorAll('select').forEach(_init);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _initAll);
    else _initAll();
})();
