import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAppearance, setupIconGestures, installHudAppearance, HUD_APPEARANCE_KEY } from '../src/hud-appearance.mjs';
class Target {
    listeners = new Map(); dataset = {}; style = {}; children = [];
    addEventListener(type, fn) { const list=this.listeners.get(type)??new Set();list.add(fn);this.listeners.set(type,list); }
    removeEventListener(type,fn) { this.listeners.get(type)?.delete(fn); }
    emit(type,values={}) { const event={type,pointerId:1,pointerType:'touch',button:0,isPrimary:true,clientX:50,clientY:50,preventDefault(){this.prevented=true;},...values};for(const fn of [...this.listeners.get(type)??[]])fn(event);return event; }
    dispatchEvent(event) { this.emit(event.type); }
    appendChild(child){this.children.push(child);return child;}
    setAttribute(){} focus(){this.focused=true;} remove(){this.removed=true;}
}
function fixture() {
    const toggle=new Target(),win=new Target(),doc=new Target();let next=0;const timers=new Map(),opens=[];
    const stop=setupIconGestures(toggle,{win,doc,open:()=>{opens.push(true);toggle.dataset.appearanceOpen='true';},setTimer:fn=>{timers.set(++next,fn);return next;},clearTimer:id=>timers.delete(id)});
    return{toggle,win,doc,stop,opens,timers,tick:()=>{const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());}};
}
test('appearance defaults preserve existing sizes; limits keep icon reachable',()=>{
 assert.deepEqual(normalizeAppearance(null),{size:52,opacity:1});assert.equal(normalizeAppearance(null,true).size,56);
 assert.deepEqual(normalizeAppearance({size:1,opacity:0}),{size:32,opacity:.25});assert.deepEqual(normalizeAppearance({size:500,opacity:5}),{size:80,opacity:1});
});
test('desktop right-click and keyboard menu open preferences without dragging',()=>{
 const f=fixture();assert.equal(f.toggle.emit('contextmenu').prevented,true);assert.equal(f.opens.length,1);assert.equal(f.timers.size,0);
 f.toggle.dataset.appearanceOpen='false';f.toggle.emit('keydown',{key:'F10',shiftKey:true});assert.equal(f.opens.length,2);f.stop();
});
test('stationary long press opens once, cancels drag and suppresses ensuing click',()=>{
 const f=fixture();let cancels=0;f.toggle.addEventListener('eule-appearance-open',()=>cancels++);
 f.toggle.emit('pointerdown');assert.equal(f.opens.length,0);f.tick();assert.equal(f.opens.length,1);assert.equal(cancels,1);assert.equal(f.toggle.dataset.appearanceSuppressClick,'true');
 f.toggle.emit('contextmenu');assert.equal(f.opens.length,1);f.stop();
});
test('moving finger preserves drag, unrelated pointers do not cancel hold',()=>{
 const f=fixture();f.toggle.emit('pointerdown');f.win.emit('pointermove',{pointerId:2,clientX:150});assert.equal(f.timers.size,1);
 f.win.emit('pointermove',{clientX:55});f.tick();assert.equal(f.opens.length,0);f.stop();
});
test('release, cancel, blur and disposal prevent delayed menus',()=>{
 for(const end of ['pointerup','pointercancel','blur','dispose']){
  const f=fixture();f.toggle.emit('pointerdown');if(end==='dispose')f.stop();else f.win.emit(end);f.tick();assert.equal(f.opens.length,0);f.stop();
 }
 const f=fixture();f.toggle.emit('pointerdown',{isPrimary:false});f.tick();assert.equal(f.opens.length,0);f.stop();
});
test('stored appearance survives remount, preview cancel leaves stored preference unchanged',()=>{
 const store=new Map([[HUD_APPEARANCE_KEY,JSON.stringify({schema:1,size:40,opacity:.5})]]);
 const storage={getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)};
 const toggle=new Target(),win=new Target(),doc=new Target();win.matchMedia=()=>({matches:false});doc.body=new Target();doc.createElement=()=>new Target();
 const stop=installHudAppearance(toggle,{win,doc,storage});assert.equal(toggle.style.width,'40px');assert.equal(toggle.style.opacity,'.5'.replace(/^\./,'0.'));
 toggle.emit('contextmenu');const overlay=doc.body.children[0],box=overlay.children[0],size=box.children[2].children[1];size.value='70';size.emit('input');assert.equal(toggle.style.width,'70px');
 box.children.find(e=>e.textContent==='Abbrechen').emit('click');assert.equal(toggle.style.width,'40px');assert.equal(JSON.parse(store.get(HUD_APPEARANCE_KEY)).size,40);stop();
});
