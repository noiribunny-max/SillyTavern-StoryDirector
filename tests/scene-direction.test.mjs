import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';


function fixture(inventory = true) {
    const calls = [], state = { meta: { stateId: 'state', chatId: 'chat', stateVersion: 1 }, world: { time: { day: 1 } }, characters: {} }, settings = {};
    const context = { chatId: 'chat', chatMetadata: {}, chat: [{ mes: 'Vorher' }], setExtensionPrompt: async (id, text) => calls.push({ id, text }) };
    let text = '';
    const service = {
        confirmEule(value) { assert.equal(value.confirmed,true); text=value.text; return { finish({success}) {if(success)text='';} }; },
        acquire:()=>({text}), preview:()=>text
    };
    const sandbox = { console: { log() {}, warn() {}, error() {} }, window: {}, document: { getElementById: () => null },
        localStorage: { getItem: () => null }, SillyTavern: { getContext: () => context }, RPGStateTracker: inventory ? { sceneDirection: service } : undefined };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8').replace('export async function init()', 'async function init()'), sandbox);
    return { context, service, sandbox, calls, state };
}
test('actual Eule acceptance uses one inventory prompt and does not write state or the duplicate Eule prompt', async () => {
    const f = fixture(), before = structuredClone(f.state);
    f.context.generate = async () => {
        assert.match(f.service.acquire().text, /Bestätigter Zeitsprung/);
        assert.equal(f.calls.filter(c => c.id === 'story-director-active-suggestion' && c.text).length, 0);
        return 'RPG';
    };
    await vm.runInContext("performStoryDirectorSuggestion('Bestätigter Zeitsprung')", f.sandbox);
    assert.equal(f.service.preview(), ''); assert.deepEqual(f.state, before);
});
test('failed and aborted generation retains the Eule proposal and releases delivery lock', async () => {
    for (const result of [false, new Error('offline')]) {
        const f = fixture(); f.context.generate = async () => { if (result instanceof Error) throw result; return result; };
        await assert.rejects(vm.runInContext("performStoryDirectorSuggestion('Noch nicht zugestellt')", f.sandbox));
        assert.match(f.service.preview(), /Noch nicht zugestellt/);
        f.context.generate = async () => 'OK';
        await vm.runInContext("performStoryDirectorSuggestion('Erneut bestätigt')", f.sandbox);
        assert.equal(f.service.preview(), '');
    }
});
test('standalone Eule remains usable without Inventory or Director; exposed lease retires on edits and chat changes', async () => {
    for (const mutate of [f => f.context.chat[0].mes = 'Edited', f => f.context.chatId = 'other']) {
        const f = fixture(false);
        f.context.generate = async () => {
            const lease = f.sandbox.EuleSceneDirection.acquire(); assert.ok(lease?.isCurrent());
            mutate(f); assert.equal(lease.isCurrent(), false); return 'OK';
        };
        await vm.runInContext("performStoryDirectorSuggestion('Vorgabe')", f.sandbox);
        assert.equal(f.sandbox.EuleSceneDirection, undefined);
        assert.equal(f.calls.filter(c => c.text).length, 1);
    }
});
