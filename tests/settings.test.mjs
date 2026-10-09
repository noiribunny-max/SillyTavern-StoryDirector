import fs from 'node:fs'; import vm from 'node:vm'; import assert from 'node:assert/strict';
class Element {
 constructor(){this.children=[];this.dataset={};this.style={};this.events={};this.value='';this.disabled=false;this.textContent='';}
 set innerHTML(value){this.html=value;this.children=[];}get innerHTML(){return this.html??'';}
 appendChild(child){this.children.push(child);return child;}addEventListener(type, fn){this.events[type]=fn;}setAttribute(){}focus(){}
 querySelectorAll(selector){return selector==='button'?this.children:[];}
}
const result=new Element(), direction=new Element();const values=new Map([['story-director-result',result],['story-director-direction',direction],['story-director-tokens-event',{value:800}],['story-director-tokens-twist',{value:1400}],['story-director-different',{checked:false}]]);
let settings=JSON.stringify({slotCount:4,slots:[{slot:1,task:'positive'},{slot:2,task:'negative'},{slot:3,task:'romance'},{slot:4,task:'storythread'}],tokens:{event:800,twist:1400}});
const originalSettings=settings, prompts=[], injections=[];let calls=0, failed=false, aborted=false, retry=false;
const context={extensionSettings:{connectionManager:{selectedProfile:'profile'}},ConnectionManagerRequestService:{sendRequest:async(id,prompt,tokens)=>{prompts.push({prompt,tokens}); if(retry){retry=false;return {reasoning:'only'};}return {content:`# Suggestion ${++calls}\nEine bekannte Figur bringt eine Nachricht. Daraus entsteht ein neuer Konflikt.`};}},setExtensionPrompt:async(id,text)=>injections.push(text),generate:async()=>{if(failed)throw Error('generation failed');return aborted?false:'RPG response';}};
const sandbox={console:{log(){},warn(){},error(){}},window:{},document:{getElementById:id=>values.get(id),createElement:()=>new Element()},localStorage:{getItem:()=>settings,setItem:(k,v)=>{settings=v;}},SillyTavern:{getContext:()=>context}};
vm.createContext(sandbox);let source=fs.readFileSync(new URL('../index.js', import.meta.url),'utf8');vm.runInContext(source.replace('export async function init()','async function init()'),sandbox);
vm.runInContext("getStoryDirectorContext = async () => ({chat:[{name:'NPC',text:'Story background'}],lore:['Lore fact'],doomTracker:{infoBox:'Doom context'}});",sandbox);
async function invoke(code){return await vm.runInContext(code,sandbox);}
for(const kind of ['event','twist'])for(const idea of ['', 'Eine bekannte Figur überrascht uns']){
 direction.value=idea;prompts.length=0;await invoke(`handleDirectorAction('${kind}')`);
 assert.equal(result.children.length,4);assert.equal(prompts.length,4);
 for(let i=0;i<4;i++){
 const {prompt,tokens}=prompts[i];assert.equal(tokens,kind==='twist'?1400:800);assert.ok(prompt.includes('Lore fact'));assert.ok(prompt.includes('Doom context'));
 assert.equal(prompt.includes('OPTIONALE KREATIVE RICHTUNG'),!!idea);if(idea){assert.ok(prompt.includes('KEINE bereits geschehene Tatsache'));if(i>0)assert.ok(prompt.includes('VORHERIGER VORSCHLAG'));}
 if(kind==='twist')assert.ok(prompt.includes('Vermeide einen Twist, der lediglich ein normales neues Ereignis darstellt.'));
 }
 assert.ok(prompts[0].prompt.includes(kind==='twist'?'unerwartet positive':'positiven dramaturgischen'));
 assert.ok(prompts[1].prompt.includes(kind==='twist'?'unerwartete negative':'negativen dramaturgischen'));
 assert.ok(prompts[2].prompt.includes(kind==='twist'?'romantische Wendung':'romantischen dramaturgischen'));
 assert.ok(prompts[3].prompt.includes('offenen Storyfaden'));
}
assert.equal(settings,originalSettings);
const card=result.children[0], text=card.children[1], editor=card.children[2], actions=card.children[3];
await actions.children[0].events.click();editor.value='Edited twist';await actions.children[0].events.click();assert.equal(text.textContent,'Edited twist');
failed=true;await assert.rejects(actions.children[1].events.click());assert.equal(result.children.length,4);assert.ok(direction.value);assert.equal(actions.children[0].disabled,false);assert.equal(actions.children[1].disabled,false);
failed=false;aborted=true;await assert.rejects(actions.children[1].events.click());assert.equal(result.children.length,4);
aborted=false;await actions.children[1].events.click();assert.equal(result.children.length,0);assert.ok(result.innerHTML.includes('weise Eule'));assert.equal(direction.value,'');assert.equal(settings,originalSettings);assert.ok(injections.some(text=>text.includes('Edited twist')));assert.equal(injections.at(-1),'');
retry=true;prompts.length=0;await invoke("generateDirectorResponse('Retry prompt',1400)");assert.equal(prompts.length,2);assert.equal(prompts[1].tokens,1400);
assert.equal(await invoke("getStoryDirectorTaskInstruction('storythread') === getStoryDirectorTaskInstruction('story-thread')"),true);
assert.equal(await invoke("getStoryDirectorTwistInstruction('storythread') === getStoryDirectorTwistInstruction('story-thread')"),true);
assert.ok(source.includes('${STORY_DIRECTOR_EMPTY_HTML}'));assert.ok(source.includes('async function generateStoryDirectorUnstuck()'));assert.ok(source.includes('async function openStoryDirectorTimeSkipDialog()'));
console.log('PASS: Event/Twist x free/directed, four slot moods, diversity, context, edit, accept failure/abort/success, reset/settings, retry, aliases and existing modes.');

// Settings checks using the same temporary VM/ST/DOM doubles.
for (const kind of ['event','twist']) for (const enabled of [true,false]) {
 values.set('story-director-story-threads',{checked:enabled});values.set('story-director-avoid-recent',{checked:enabled});
 direction.value='';prompts.length=0;await invoke(`generateStoryDirectorEvents('${kind}')`);
 assert.equal(prompts[0].prompt.includes('Bevorzuge vorhandene offene Storyfäden'),enabled);
 assert.equal(prompts[0].prompt.includes('Vermeide Wiederholungen von Ideen'),enabled);
 assert.equal(prompts[1].prompt.includes('VORHERIGER VORSCHLAG'),enabled);
 if(enabled)assert.ok(prompts[0].prompt.includes('Eine ausdrücklich gewählte Storyfaden-Fortsetzung bleibt zulässig'));
}
values.set('story-director-custom-tokens',{checked:false});
context.mainApi='openai';context.chatCompletionSettings={openai_max_tokens:777};
for(const kind of ['event','twist','timeskip','unstuck'])assert.equal(await invoke(`getStoryDirectorGenerationTokens('${kind}')`),777);
context.ConnectionManagerRequestService.getProfile=()=>({preset:'Chosen'});
context.ConnectionManagerRequestService.validateProfile=()=>({selected:'openai'});
context.getPresetManager=()=>({getCompletionPresetByName:()=>({openai_max_tokens:913})});
assert.equal(await invoke("getStoryDirectorGenerationTokens('twist')"),913);
context.ConnectionManagerRequestService.validateProfile=()=>({selected:'textgenerationwebui'});
context.getPresetManager=()=>({getCompletionPresetByName:()=>({genamt:654})});
assert.equal(await invoke("getStoryDirectorGenerationTokens('twist')"),654);
context.getPresetManager=undefined;context.textCompletionSettings={genamt:432};assert.equal(await invoke("getStoryDirectorGenerationTokens('event')"),432);
context.textCompletionSettings={genamt:-1};assert.equal(await invoke("getStoryDirectorGenerationTokens('event')"),800);
values.set('story-director-custom-tokens',{checked:true});
values.set('story-director-tokens-timeskip',{value:1200});values.set('story-director-tokens-unstuck',{value:1600});
for(const [kind,tokens] of Object.entries({event:800,twist:1400,timeskip:1200,unstuck:1600}))assert.equal(await invoke(`getStoryDirectorGenerationTokens('${kind}')`),tokens);
// Restore with the avoid-recent DOM element absent; custom tokens/selects still load.
const slotCount=new Element(),slots=new Element();values.set('story-director-slot-count',slotCount);values.set('story-director-slots',slots);values.delete('story-director-avoid-recent');
for(const value of values.values())value.addEventListener ??= ()=>{};
sandbox.panel={querySelector:selector=>values.get(selector.slice(1))};
settings=JSON.stringify({slotCount:4,slots:[{slot:1,task:'storythread'}],customTokens:false,tokens:{event:555,twist:666,timeskip:777,unstuck:888}});
await invoke('setupSuggestionSettings(panel)');assert.equal(values.get('story-director-custom-tokens').checked,false);
for(const [kind,tokens] of Object.entries({event:555,twist:666,timeskip:777,unstuck:888}))assert.equal(Number(values.get('story-director-tokens-'+kind).value),tokens);
assert.equal(slots.children[0].children[1].value,'story-thread');
settings=JSON.stringify({slotCount:4,slots:[]});await invoke('setupSuggestionSettings(panel)');assert.equal(values.get('story-director-custom-tokens').checked,true);assert.equal(values.get('story-director-tokens-twist').value,'1400');
values.delete('story-director-story-threads');assert.equal(await invoke("getStoryDirectorOption('preferStoryThreads','story-director-story-threads')"),true);
assert.equal(await invoke("getStoryDirectorOption('avoidRecentIdeas','story-director-avoid-recent')"),true);
console.log('PASS: settings on/off for Event/Twist, round diversity, storythread continuation, custom/Connection/ST/fallback budgets for all modes, independent load without avoid DOM, legacy defaults.');
