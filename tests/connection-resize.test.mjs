import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8').replace('export async function init()', 'async function init()');
test('dedicated profile routes requests without changing chat selection; missing profile fails closed', async () => {
    const saved = new Map([['story-director-profile', 'owl']]), calls = [];
    const context = { extensionSettings: { connectionManager: { selectedProfile: 'chat', profiles: [{ id: 'owl' }] } }, ConnectionManagerRequestService: { sendRequest: async (...args) => { calls.push(args); return { content: 'Ready' }; } } };
    const sandbox = { console, window: {}, localStorage: { getItem: key => saved.get(key) }, SillyTavern: { getContext: () => context } };
    vm.createContext(sandbox); vm.runInContext(source, sandbox);
    await vm.runInContext("generateDirectorResponse('Test', 100)", sandbox);
    assert.equal(calls[0][0], 'owl'); assert.equal(context.extensionSettings.connectionManager.selectedProfile, 'chat');
    context.extensionSettings.connectionManager.profiles = [];
    await assert.rejects(vm.runInContext("generateDirectorResponse('Test', 100)", sandbox), /Verbindungsprofil fehlt/);
    assert.equal(calls.length, 1);
    saved.clear(); await vm.runInContext("generateDirectorResponse('Test', 100)", sandbox);
    assert.equal(calls[1][0], 'chat');
});
class Target {
    events = {}; style = {}; children = [];
    addEventListener(type, fn) { this.events[type] = fn; }
    removeEventListener(type) { delete this.events[type]; }
    appendChild(child) { this.children.push(child); }
    setPointerCapture(id) { this.capture = id; }
    hasPointerCapture(id) { return this.capture === id; }
    releasePointerCapture() { this.capture = null; }
    remove() { this.removed = true; }
    fire(type, values = {}) { this.events[type]?.({ pointerId: 1, button: 0, clientX: 0, clientY: 0, preventDefault() {}, stopPropagation() {}, ...values }); }
}
test('touch/mouse corner resize clamps, persists, restores and cleans up', () => {
    const saved = new Map(), panel = new Target(), win = new Target();
    Object.assign(win, { innerWidth: 800, innerHeight: 600 });
    panel.classList = { contains: () => false };
    panel.getBoundingClientRect = () => ({ left: parseFloat(panel.style.left) || 100, top: parseFloat(panel.style.top) || 100, width: parseFloat(panel.style.width) || 320, height: parseFloat(panel.style.height) || 300 });
    const sandbox = { console, window: win, panel, document: { createElement: () => new Target() }, localStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) } };
    vm.createContext(sandbox); vm.runInContext(source, sandbox);
    const dispose = vm.runInContext('setupDirectorResize(panel)', sandbox);
    const corner = panel.children[2];
    corner.fire('pointerdown'); corner.fire('pointermove', { clientX: 150, clientY: 100 }); corner.fire('pointerup');
    assert.equal(panel.style.width, '470px'); assert.equal(panel.style.height, '400px');
    assert.deepEqual(JSON.parse(saved.get('story-director-panel-size')), { width: 470, height: 400 });
    corner.fire('pointerdown'); corner.fire('pointermove', { clientX: 5000, clientY: 5000 }); corner.fire('pointercancel');
    assert.equal(panel.style.width, '784px'); assert.equal(panel.style.height, '584px');
    dispose(); assert.equal(win.events.resize, undefined); assert.ok(panel.children.every(child => child.removed));
    panel.style = {}; vm.runInContext('setupDirectorResize(panel)', sandbox);
    assert.equal(panel.style.width, '784px');
});
