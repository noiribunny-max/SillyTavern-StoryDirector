import test from 'node:test';import assert from 'node:assert/strict';
import {CONNECTION_KEY,requestEuleModel,validateConnection,connectionSettings} from '../src/connection.mjs';
function fixture(){const calls=[];const c={extensionSettings:{connectionManager:{selectedProfile:'MAIN'},[CONNECTION_KEY]:{enabled:true,profileId:'EULE',temperature:.7}},ConnectionManagerRequestService:{getProfile:()=>({id:'EULE',model:'fixture-model','api-url':'https://nano-gpt.com/api/v1','secret-id':'SECRET_REFERENCE_ONLY'}),validateProfile:()=>({selected:'openai',source:'custom'}),sendRequest:async(...a)=>{calls.push(a);return {choices:[{message:{content:'ok'}}]};}}};return{c,calls};}
test('own profile, secret reference, URL, model and temperature without main mutation',async()=>{const f=fixture();await requestEuleModel(f.c,'synthetic',50);assert.equal(f.calls.length,1);assert.equal(f.calls[0][0],'EULE');assert.equal(f.calls[0][4].temperature,.7);assert.equal(f.calls[0][3].includePreset,false);assert.equal(f.c.extensionSettings.connectionManager.selectedProfile,'MAIN');assert.equal(JSON.stringify(f.calls).includes('SECRET_REFERENCE_ONLY'),false);});
test('missing own config/secret/profile and insecure endpoints never fall back',async()=>{
 for(const kind of ['disabled','secret','url','missing']){const f=fixture();if(kind==='disabled')f.c.extensionSettings[CONNECTION_KEY].enabled=false;if(kind==='secret')f.c.ConnectionManagerRequestService.getProfile=()=>({});if(kind==='url')f.c.extensionSettings[CONNECTION_KEY].url='http://example.com';if(kind==='missing')f.c.ConnectionManagerRequestService.getProfile=()=>{throw Error('PRIVATE DUMP')};await assert.rejects(requestEuleModel(f.c,'synthetic',20));assert.equal(f.calls.length,0);}
});
test('provider failure/empty response has no hidden retry or main fallback',async()=>{const f=fixture();f.c.ConnectionManagerRequestService.sendRequest=async()=>{f.calls.push('one');throw Error('API KEY PRIVATE');};await assert.rejects(requestEuleModel(f.c,'synthetic',20),e=>e.message==='EULE_PROVIDER_FAILED');assert.equal(f.calls.length,1);});
test('input/output limits and pre-aborted request',async()=>{const f=fixture();await assert.rejects(requestEuleModel(f.c,'x'.repeat(24001),20),/BUDGET/);await assert.rejects(requestEuleModel(f.c,'x',9000),/OUTPUT/);assert.equal(f.calls.length,0);const ctrl=new AbortController();ctrl.abort();await assert.rejects(requestEuleModel(f.c,'x',20,{signal:ctrl.signal}),/ABORTED/);assert.equal(f.calls.length,0);});

test('changing own profile during request rejects result and simultaneous requests do not multiply calls',async()=>{
 const f=fixture();let finish;let profile={id:'EULE',model:'fixture-model','api-url':'https://nano-gpt.com/api/v1','secret-id':'REFERENCE'};
 f.c.ConnectionManagerRequestService.getProfile=()=>profile;
 f.c.ConnectionManagerRequestService.sendRequest=async()=>{f.calls.push('one');return new Promise(resolve=>finish=resolve);};
 const pending=requestEuleModel(f.c,'x',20);await Promise.resolve();await Promise.resolve();
 await assert.rejects(requestEuleModel(f.c,'second',20),/BUSY/);assert.equal(f.calls.length,1);
 profile={...profile,model:'changed'};finish('synthetic');await assert.rejects(pending,/CHANGED/);
});
