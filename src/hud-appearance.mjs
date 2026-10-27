export const HUD_APPEARANCE_KEY = 'story-director-hud-appearance-v1';
export function normalizeAppearance(value, mobile = false) {
    const size = Number.isFinite(value?.size) ? Math.round(value.size) : mobile ? 56 : 52;
    const opacity = Number.isFinite(value?.opacity) ? value.opacity : 1;
    return { size: Math.min(80, Math.max(32, size)), opacity: Math.min(1, Math.max(.25, opacity)) };
}

// Holding without moving opens preferences. Moving still belongs to the existing drag handler.
export function setupIconGestures(toggle, { open, win = window, doc = document, setTimer = setTimeout, clearTimer = clearTimeout }) {
    const dispose = [];
    let hold = null, timer = null;
    const listen = (target, type, fn) => { target.addEventListener(type, fn); dispose.push(() => target.removeEventListener(type, fn)); };
    function cancel() { if (timer !== null) clearTimer(timer); timer = null; hold = null; }
    function show(event, held = false) {
        event?.preventDefault(); cancel();
        if (toggle.dataset.appearanceOpen === 'true') return;
        if (held) toggle.dataset.appearanceSuppressClick = 'true';
        // Release drag capture before placing an interactive dialog over the icon.
        toggle.dispatchEvent(new Event('eule-appearance-open'));
        open();
    }
    listen(toggle, 'contextmenu', event => show(event));
    listen(toggle, 'keydown', event => { if (event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey) show(event); });
    listen(toggle, 'pointerdown', event => {
        if (event.isPrimary === false || event.button !== undefined && event.button !== 0) return;
        toggle.dataset.appearanceSuppressClick = 'false';
        if (!['touch', 'pen'].includes(event.pointerType)) return;
        cancel(); hold = { id: event.pointerId, x: event.clientX, y: event.clientY };
        timer = setTimer(() => { timer = null; show(null, true); }, 650);
    });
    listen(win, 'pointermove', event => { if (hold?.id === event.pointerId && (Math.abs(event.clientX - hold.x) > 4 || Math.abs(event.clientY - hold.y) > 4)) cancel(); });
    for (const type of ['pointerup', 'pointercancel']) listen(win, type, event => { if (hold?.id === event.pointerId) cancel(); });
    listen(toggle, 'lostpointercapture', cancel);
    listen(win, 'blur', cancel);
    listen(doc, 'visibilitychange', () => { if (doc.hidden) cancel(); });
    return () => { cancel(); dispose.splice(0).forEach(fn => fn()); };
}

export function installHudAppearance(toggle, { onResize = () => {}, onSave = () => {}, storage = localStorage, win = window, doc = document } = {}) {
    const mobile = () => win.matchMedia('(max-width: 600px)').matches;
    let saved = null, dialog = null;
    try { const value = JSON.parse(storage.getItem(HUD_APPEARANCE_KEY)); if (value?.schema === 1) saved = normalizeAppearance(value, mobile()); } catch { /* Keep the existing default if browser storage is unavailable. */ }
    function apply(value) {
        toggle.style.width = value.size + 'px'; toggle.style.height = value.size + 'px';
        toggle.style.fontSize = Math.round(value.size * .54) + 'px'; toggle.style.opacity = String(value.opacity);
        onResize();
    }
    if (saved) apply(saved);
    function open() {
        if (dialog) return;
        const original = saved ?? normalizeAppearance(null, mobile());
        const position = { left: toggle.style.left, top: toggle.style.top, right: toggle.style.right };
        toggle.dataset.appearanceOpen = 'true';
        dialog = doc.createElement('div'); dialog.className = 'eule-appearance-overlay';
        const box = doc.createElement('section'); box.className = 'eule-appearance-dialog';
        box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Eulensymbol anpassen');
        const heading = doc.createElement('h3'); heading.textContent = 'Eulensymbol anpassen'; box.appendChild(heading);
        const info = doc.createElement('p'); info.textContent = 'Nur das eingeklappte Symbol. Vorschau sofort; gespeichert nur für diesen Browser. Ziehen verschiebt die Eule weiterhin.'; box.appendChild(info);
        function slider(label, min, max, value, suffix) {
            const wrapper = doc.createElement('label'); wrapper.textContent = label + ' ';
            const output = doc.createElement('output'); wrapper.appendChild(output);
            const input = doc.createElement('input'); input.type = 'range'; input.min = min; input.max = max; input.step = '1'; input.value = value; input.setAttribute('aria-label', label);
            wrapper.appendChild(input); box.appendChild(wrapper);
            const update = () => { output.textContent = input.value + suffix; }; input.addEventListener('input', update); update();
            return { input, update };
        }
        const size = slider('Größe', '32', '80', String(original.size), ' px');
        const opacity = slider('Deckkraft', '25', '100', String(Math.round(original.opacity * 100)), ' %');
        const read = () => normalizeAppearance({ size: Number(size.input.value), opacity: Number(opacity.input.value) / 100 }, mobile());
        const preview = () => apply(read()); size.input.addEventListener('input', preview); opacity.input.addEventListener('input', preview);
        const status = doc.createElement('p'); status.setAttribute('role', 'status'); box.appendChild(status);
        function close(commit) {
            if (!dialog) return;
            if (!commit) { apply(original); Object.assign(toggle.style, position); }
            doc.removeEventListener('keydown', keydown); dialog.remove(); dialog = null;
            toggle.dataset.appearanceOpen = 'false'; toggle.dataset.appearanceSuppressClick = 'false'; toggle.focus();
        }
        function button(label, fn) { const b = doc.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', fn); box.appendChild(b); }
        button('Standardwerte', () => { const defaults = normalizeAppearance(null, mobile()); size.input.value = defaults.size; opacity.input.value = defaults.opacity * 100; size.update(); opacity.update(); preview(); });
        button('Abbrechen', () => close(false));
        button('Speichern', () => {
            const next = read();
            try { storage.setItem(HUD_APPEARANCE_KEY, JSON.stringify({ schema: 1, ...next })); }
            catch { status.textContent = 'Browser konnte die Einstellung nicht speichern. Erneut versuchen oder abbrechen.'; return; }
            saved = next; apply(next); try { onSave(); } catch { /* Appearance is saved even if the separate position write fails. */ } close(true);
        });
        function keydown(event) {
            if (event.key === 'Escape') { event.preventDefault(); close(false); }
            if (event.key === 'Tab') {
                const controls = [...box.querySelectorAll('input,button')], first = controls[0], last = controls.at(-1);
                if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
            }
        }
        doc.addEventListener('keydown', keydown); dialog.appendChild(box); doc.body.appendChild(dialog); size.input.focus();
        dialog.cancel = () => close(false);
    }
    const stopGestures = setupIconGestures(toggle, { open, win, doc });
    const resize = () => { if (toggle.offsetWidth > 0) onResize(); };
    win.addEventListener('resize', resize); win.visualViewport?.addEventListener('resize', resize);
    return () => { stopGestures(); win.removeEventListener('resize', resize); win.visualViewport?.removeEventListener('resize', resize); dialog?.cancel(); };
}
