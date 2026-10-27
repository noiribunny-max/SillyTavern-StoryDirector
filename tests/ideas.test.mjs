import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdeaStore, IDEAS_KEY, fingerprint } from '../src/ideas.mjs';
import { createHash } from 'node:crypto';
import { compareIdeas } from '../src/similarity.mjs';
test('SHA-256 vectors including unicode and multiple blocks',()=>{
 for(const s of ['', 'abc', 'Mitsuki ä 🦉', 'x'.repeat(10000)])assert.equal(fingerprint(s),createHash('sha256').update(s).digest('hex'));
});
test('paraphrase motif is reviewable, valid continuation remains explicit',()=>{
 const h=[{id:'old',text:'Ein unbekannter Ninja beobachtet Mitsuki.',decision:'REJECTED'}];
 const hits=compareIdeas('Mitsuki bemerkt einen geheimnisvollen Verfolger.',h);
 assert.equal(hits[0].confidence,'REVIEW');assert.equal(hits[0].decision,'REJECTED');
 assert.equal(compareIdeas('Mitsuki stellt den Verfolger zur Rede. Seine Beobachtungen haben neue Folgen.',h,{continuationOf:'old'})[0].continuation,true);
 assert.equal(compareIdeas('Gemeinsam kochen sie Nudeln.',h).length,0);
});
function fixture() {
 let count=0;
 const c={chatId:'chat',characterId:0,characters:[{name:'Erzaehler',avatar:'card.png'}],chatMetadata:{integrity:'branch-a',foreign:{keep:1}},chat:[{mes:'Eine rein kuenstliche Szene.',is_user:false}],getRequestHeaders:()=>({})};
 let metadata=structuredClone(c.chatMetadata);
 c.saveMetadata=async()=>{metadata=structuredClone(c.chatMetadata);};
 const store=createIdeaStore({getContext:()=>c,uuid:()=>String(++count),fetcher:async()=>({ok:true,json:async()=>[{chat_metadata:structuredClone(metadata)},...c.chat]})});
 return {c,store,disk:()=>metadata,editDisk:f=>f(metadata)};
}
test('persist proposal/decisions, reload, foreign namespace unchanged; acceptance is not occurrence',async()=>{
 const f=fixture();const [p]=await f.store.add([{kind:'event',text:'Eine Idee.'}],f.store.pin());
 for(const s of ['DEFERRED','REJECTED','ACCEPTED']){await f.store.decide(p.id,s);assert.equal(f.store.read().ideas[0].decision,s);}
 assert.equal(f.disk()[IDEAS_KEY].ideas[0].occurrence,null);assert.deepEqual(f.disk().foreign,{keep:1});
 f.c.chatMetadata=structuredClone(f.disk());assert.equal(f.store.read().ideas.length,1);
});
test('branch/chat/card switches block stale results and copied history',async()=>{
 for(const key of ['chat','branch','card']){const f=fixture(),p=f.store.pin();
  if(key==='chat')f.c.chatId='other';if(key==='branch')f.c.chatMetadata.integrity='branch-b';if(key==='card')f.c.characters[0].avatar='other.png';
  await assert.rejects(f.store.add([{kind:'event',text:'X'}],p),/STALE/);
 }
 const f=fixture();await f.store.add([{kind:'event',text:'X'}],f.store.pin());f.c.chatMetadata.integrity='other';assert.throws(()=>f.store.read(),/SCOPE/);
});
test('real source revision and explicit proof required for occurrence',async()=>{
 const f=fixture();const[p]=await f.store.add([{kind:'event',text:'X'}],f.store.pin());await f.store.decide(p.id,'ACCEPTED');
 await assert.rejects(f.store.decide(p.id,'PLAYED',{confirmed:true,evidence:{messageId:0,quote:'invented'}}),/INVALID/);
 await f.store.decide(p.id,'PLAYED',{confirmed:true,evidence:{messageId:0,quote:'rein kuenstliche'}});
 assert.equal(f.store.read().ideas[0].occurrence.userConfirmed,true);
});
test('server conflict does not overwrite, unverified write remains blocked',async()=>{
 const f=fixture();f.editDisk(m=>m.foreign.keep=2);await assert.rejects(f.store.add([{kind:'event',text:'X'}],f.store.pin()),/CONFLICT/);assert.equal(f.c.chatMetadata[IDEAS_KEY],undefined);
 const g=fixture();g.c.saveMetadata=async()=>{};await assert.rejects(g.store.add([{kind:'event',text:'X'}],g.store.pin()),/UNKNOWN/);assert.equal(g.store.blocked(),true);
});
test('delivery cannot repeat and success does not mark occurred',async()=>{
 const f=fixture();const[p]=await f.store.add([{kind:'event',text:'X'}],f.store.pin());await f.store.decide(p.id,'ACCEPTED');await f.store.delivery(p.id,'PENDING');await f.store.delivery(p.id,'SENT');
 await assert.rejects(f.store.delivery(p.id,'PENDING'),/REPEATED/);assert.equal(f.store.read().ideas[0].occurrence,null);
});

test('deferred ideas need explicit current-context review; rejected ideas cannot bypass it',async()=>{
 const f=fixture();const[p]=await f.store.add([{kind:'event',text:'Alte Idee.'}],f.store.pin());
 await f.store.decide(p.id,'DEFERRED');f.c.chat.push({mes:'Neue Szene.',is_user:true});await f.store.decide(p.id,'ACCEPTED');
 await assert.rejects(f.store.delivery(p.id,'PENDING'),/STALE/);
 await assert.rejects(f.store.decide(p.id,'REVIEW_CURRENT'),/CONFIRM/);
 await f.store.decide(p.id,'REVIEW_CURRENT',{confirmed:true});await f.store.delivery(p.id,'PENDING');
 assert.equal(f.store.read().ideas[0].delivery,'PENDING');
 const g=fixture();const[q]=await g.store.add([{kind:'event',text:'Nein.'}],g.store.pin());await g.store.decide(q.id,'REJECTED');
 await assert.rejects(g.store.decide(q.id,'REVIEW_CURRENT',{confirmed:true}),/CONFIRM/);
});

test('unverified write blocks its own scope, not an independent chat',async()=>{
 const f=fixture();const save=f.c.saveMetadata;f.c.saveMetadata=async()=>{};
 await assert.rejects(f.store.add([{kind:'event',text:'X'}],f.store.pin()),/UNKNOWN/);
 f.c.chatId='separate';f.c.chatMetadata={integrity:'independent',foreign:{keep:1}};f.c.saveMetadata=save;await save();
 assert.equal(f.store.blocked(),false);await f.store.add([{kind:'event',text:'Separate Idee.'}],f.store.pin());
 assert.equal(f.store.read().ideas.length,1);
});

test('malformed history is rejected without resetting or saving it',async()=>{
 const f=fixture();await f.store.add([{kind:'event',text:'X'}],f.store.pin());
 f.c.chatMetadata[IDEAS_KEY].ideas[0].delivery='BROKEN';const before=structuredClone(f.c.chatMetadata);
 assert.throws(()=>f.store.read(),/INVALID/);assert.deepEqual(f.c.chatMetadata,before);
});

test('copied branch history starts independently only after explicit confirmation; copy retained',async()=>{
 const f=fixture();await f.store.add([{kind:'event',text:'Elternidee.'}],f.store.pin());const parent=structuredClone(f.c.chatMetadata[IDEAS_KEY]);
 f.c.chatId='branch-copy';f.c.chatMetadata.integrity='branch-copy';await f.c.saveMetadata();
 assert.throws(()=>f.store.read(),/SCOPE/);await assert.rejects(f.store.initializeBranch(false),/CONFIRM/);
 await f.store.initializeBranch(true);assert.equal(f.store.read().ideas.length,0);assert.deepEqual(f.store.read().quarantinedParent,parent);
 await f.store.add([{kind:'event',text:'Zweigidee.'}],f.store.pin());assert.equal(f.store.read().ideas.length,1);
});

test('an edited or swiped occurrence is no longer current evidence',async()=>{
 const {occurrenceStatus}=await import('../src/ideas.mjs');const f=fixture();const[p]=await f.store.add([{kind:'event',text:'X'}],f.store.pin());await f.store.decide(p.id,'ACCEPTED');
 await f.store.decide(p.id,'PLAYED',{confirmed:true,evidence:{messageId:0,quote:'rein kuenstliche'}});
 const saved=f.store.read().ideas[0];assert.equal(occurrenceStatus(saved,f.c),'CURRENT');f.c.chat[0].swipe_id=1;assert.equal(occurrenceStatus(saved,f.c),'STALE');
});

test('only configured host note defaults and empty WI structures reconcile; real metadata stays protected',async()=>{
 const f=fixture();f.c.extensionSettings={note:{default:'',defaultInterval:1,defaultPosition:1,defaultDepth:4,defaultRole:0}};
 Object.assign(f.c.chatMetadata,{note_prompt:'',note_interval:1,note_position:1,note_depth:4,note_role:0,timedWorldInfo:{sticky:{},cooldown:{}}});
 await f.store.add([{kind:'event',text:'X'}],f.store.pin());assert.equal(f.store.read().ideas.length,1);
 const g=fixture();g.c.chatMetadata.tainted=true;await assert.rejects(g.store.add([{kind:'event',text:'X'}],g.store.pin()),/CONFLICT/);
 const h=fixture();h.c.chatMetadata.timedWorldInfo={cooldown:{actual:{end:9}}};await assert.rejects(h.store.add([{kind:'event',text:'X'}],h.store.pin()),/CONFLICT/);
});

test('HTTP/LAN UUID fallback uses cryptographic random values without secure-context randomUUID',async()=>{
 const {newIdeaId}=await import('../src/ideas.mjs');const {webcrypto}=await import('node:crypto');
 const rng={getRandomValues:a=>webcrypto.getRandomValues(a)};const a=newIdeaId(rng),b=newIdeaId(rng);
 assert.match(a,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);assert.notEqual(a,b);
 assert.throws(()=>newIdeaId({}),/RANDOM/);
});
