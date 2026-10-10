import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8').replace('export async function init()', 'async function init()');
class Target {
    listeners = new Map();
    addEventListener(type, fn) { const set = this.listeners.get(type) ?? new Set(); set.add(fn); this.listeners.set(type, set); }
    removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
    emit(type, values = {}) { const event = { pointerId: 1, clientX: 100, clientY: 100, button: 0, buttons: 1, pointerType: 'mouse', target: this, preventDefault() {}, ...values }; for (const fn of [...this.listeners.get(type) ?? []]) fn(event); }
    closest() { return null; }
}
function fixture({ captureFails = false, width = 800, height = 600 } = {}) {
    const win = new Target(), doc = new Target(), element = new Target();
    Object.assign(win, { innerWidth: width, innerHeight: height });
    Object.assign(element, { id: 'story-director-toggle', style: { left: '100px', top: '100px' }, dataset: {}, isConnected: true });
    let reads = 0, captured = null, saves = [], frames = new Map(), frameId = 0;
    element.getBoundingClientRect = () => { reads++; const left = parseFloat(element.style.left), top = parseFloat(element.style.top); return { left, top, width: 52, height: 52, right: left + 52, bottom: top + 52 }; };
    element.setPointerCapture = id => { if (captureFails) throw Error('capture unavailable'); captured = id; };
    element.hasPointerCapture = id => captured === id;
    element.releasePointerCapture = id => { captured = null; element.emit('lostpointercapture', { pointerId: id }); };
    win.requestAnimationFrame = fn => { frames.set(++frameId, fn); return frameId; };
    win.cancelAnimationFrame = id => frames.delete(id);
    const sandbox = { window: win, document: doc, console, localStorage: { setItem(key, value) { saves.push({ key, value: JSON.parse(value) }); }, getItem() { return saves.at(-1) ? JSON.stringify(saves.at(-1).value) : null; } }, element };
    vm.createContext(sandbox); vm.runInContext(source, sandbox);
    const dispose = vm.runInContext('setupDraggable(element)', sandbox);
    return { win, doc, element, sandbox, dispose, saves, get reads() { return reads; }, get captured() { return captured; }, get frameCount() { return frames.size; }, tick() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn()); } };
}

test('fast mouse moves use capture and one latest-position write per frame without layout reads', () => {
    const f = fixture(); f.element.emit('pointerdown');
    assert.equal(f.captured, 1); assert.equal(f.reads, 1);
    for (let x = 110; x <= 700; x++) f.win.emit('pointermove', { clientX: x, clientY: 250 });
    assert.equal(f.frameCount, 1); assert.equal(f.element.style.left, '100px'); assert.equal(f.reads, 1);
    f.tick(); assert.equal(f.element.style.left, '700px'); assert.equal(f.element.style.top, '250px');
    assert.equal(f.reads, 1); assert.equal(f.element.dataset.wasDragged, 'true');
    f.win.emit('pointerup', { clientX: 720, clientY: 300 });
    assert.equal(f.frameCount, 0); assert.equal(f.captured, null); assert.equal(f.saves.length, 1);
    assert.deepEqual(f.saves[0], { key: 'story-director-hud-position', value: { left: 736, top: 300 } });
    f.tick(); assert.equal(f.element.style.top, '300px');
    f.element.style.top = '0px'; vm.runInContext('restoreHudPosition(element, null)', f.sandbox);
    assert.equal(f.element.style.top, '300px');
});
test('touch gestures ignore other pointers and preserve mobile snapping and bounds', () => {
    const f = fixture({ width: 390, height: 844 });
    f.element.emit('pointerdown', { pointerType: 'touch' });
    f.element.emit('pointerdown', { pointerId: 2, isPrimary: false });
    f.win.emit('pointermove', { pointerId: 2, clientX: 1 }); f.win.emit('pointerup', { pointerId: 2 });
    assert.equal(f.captured, 1); assert.equal(f.frameCount, 0);
    f.win.emit('pointermove', { pointerType: 'touch', clientX: 999, clientY: 999 }); f.tick();
    assert.equal(f.element.style.left, '338px'); assert.equal(f.element.style.top, '792px');
    f.win.emit('pointerup', { pointerType: 'touch', clientX: 999, clientY: 999 });
    assert.deepEqual(f.saves[0].value, { left: 330, top: 784 });
});
test('failed capture still tracks outside the handle and a simple tap opens the panel without saving', () => {
    const f = fixture({ captureFails: true });
    const panel = { classList: { remove() { panel.open = true; } } };
    f.element.classList = { add() {} }; f.sandbox.panel = panel;
    vm.runInContext('setupToggle(element, panel)', f.sandbox);
    f.element.emit('pointerdown'); f.win.emit('pointerup'); f.element.emit('click');
    assert.equal(panel.open, true); assert.equal(f.saves.length, 0);
    panel.open = false; f.element.emit('pointerdown'); f.win.emit('pointermove', { clientX: 500 });
    f.win.emit('pointerup', { clientX: 500 }); f.element.emit('click');
    assert.equal(panel.open, false); assert.equal(f.saves.length, 1);
});
for (const ending of ['pointercancel', 'lostpointercapture', 'blur', 'visibilitychange', 'dispose']) {
    test(`${ending} clears gesture/capture/frame and permits the next drag without accidental persistence`, () => {
        const f = fixture(); f.element.emit('pointerdown'); f.win.emit('pointermove', { clientX: 200 });
        if (ending === 'dispose') f.dispose();
        else if (ending === 'lostpointercapture') f.element.emit(ending);
        else if (ending === 'visibilitychange') { f.doc.hidden = true; f.doc.emit(ending); }
        else f.win.emit(ending);
        assert.equal(f.captured, null); assert.equal(f.frameCount, 0); assert.equal(f.saves.length, 0);
        f.win.emit('pointermove', { clientX: 700 }); f.tick(); assert.equal(f.element.style.left, '200px');
        if (ending === 'dispose') {
            assert.ok([...f.win.listeners.values(), ...f.doc.listeners.values(), ...f.element.listeners.values()].every(set => set.size === 0));
        } else {
            f.element.emit('pointerdown'); f.win.emit('pointerup', { clientX: 300 }); assert.equal(f.saves.length, 1);
        }
    });
}
test('panel header controls do not initiate dragging, but header text does', () => {
    const f = fixture(); f.dispose(); f.element.id = 'story-director-panel';
    const handle = new Target(); f.sandbox.handle = handle;
    vm.runInContext('setupDraggable(element, handle)', f.sandbox);
    const close = { closest() { return close; } };
    handle.emit('pointerdown', { target: close }); assert.equal(f.captured, null);
    handle.emit('pointerdown'); f.win.emit('pointermove', { clientX: 300 }); f.tick();
    assert.equal(f.element.style.left, '300px');
});
test('touch scrolling remains enabled for panel content and disabled on drag surfaces', () => {
    const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    for (const selector of ['header', 'toggle']) assert.match(css.match(new RegExp(`\\.story-director-${selector} \\{([^}]+)`))[1], /touch-action: none/);
    assert.match(css.match(/\.story-director-panel \{([^}]+)/)[1], /touch-action: pan-y/);
});
test('removing the HUD disconnects its observer and all drag listeners', () => {
    const f = fixture(); f.dispose();
    const panel = new Target(), handle = new Target();
    Object.assign(panel, { id: 'story-director-panel', isConnected: true, querySelector() { return handle; } });
    let observer;
    f.sandbox.panel = panel;
    f.sandbox.MutationObserver = class {
        constructor(callback) { this.callback = callback; observer = this; }
        observe() { this.observing = true; }
        disconnect() { this.observing = false; }
    };
    const cleanup = vm.runInContext('setupDragging(element, panel)', f.sandbox);
    f.element.emit('pointerdown'); f.win.emit('pointermove', { clientX: 200 });
    f.element.isConnected = false; observer.callback();
    assert.equal(observer.observing, false); assert.equal(f.frameCount, 0); assert.equal(f.captured, null);
    assert.ok([...f.win.listeners.values(), ...f.doc.listeners.values(), ...f.element.listeners.values(), ...handle.listeners.values()].every(set => set.size === 0));
    cleanup(); // Explicit/repeated disposal is safe too.
});
test('right button and nonprimary input are ignored; missing mouse release clears the gesture', () => {
    const f = fixture();
    f.element.emit('pointerdown', { button: 2 }); f.element.emit('pointerdown', { isPrimary: false });
    assert.equal(f.captured, null);
    f.element.emit('pointerdown'); f.win.emit('pointermove', { clientX: 200, buttons: 0 });
    assert.equal(f.captured, null); assert.equal(f.frameCount, 0); assert.equal(f.saves.length, 0);
    f.element.emit('pointerdown'); f.win.emit('pointerup', { clientX: 300 }); assert.equal(f.saves.length, 1);
});
