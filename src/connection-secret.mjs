import {CONNECTION_KEY} from './connection.mjs';
const category='api_key_custom';
let saving=false;
const failure=()=>new Error('EULE_KEY_SAVE_FAILED');
// Never fetch secret values. /read returns masked metadata; retain IDs only.
export async function saveDirectorSecret(c,profileId,value,{fetcher=globalThis.fetch}={}){
 if(saving)throw new Error('EULE_KEY_SAVE_BUSY');
 if(globalThis.document?.body?.dataset?.generating==='true')throw new Error('EULE_KEY_SAVE_BUSY');
 if(!profileId||typeof value!=='string'||!value.trim())throw new Error('EULE_KEY_REQUIRED');
 if(typeof c.saveSettingsDebounced!=='function'||typeof c.getRequestHeaders!=='function')throw failure();
 let profile,type;try{profile=c.ConnectionManagerRequestService.getProfile(profileId);type=c.ConnectionManagerRequestService.validateProfile(profile);}catch{throw failure();}
 if(type?.selected!=='openai'||type?.source!=='custom')throw new Error('EULE_OPENAI_COMPATIBLE_PROFILE_REQUIRED');
 saving=true;let id,previous;
 async function post(path,body){
  const r=await fetcher('/api/secrets/'+path,{method:'POST',headers:c.getRequestHeaders(),body:JSON.stringify(body)});
  if(!r.ok)throw failure();return r;
 }
 try{
  const state=await (await post('read',{})).json();
  previous=state?.[category]?.find(entry=>entry.active)?.id;
  const result=await (await post('write',{key:category,value:value.trim(),label:'Story Director · '+(profile.name||profileId)})).json();
  if(typeof result?.id!=='string'||!result.id)throw failure();id=result.id;
  // Native writes activate the new key. Restore the previous default so
  // Eule alone selects its own reference in subsequent requests.
  if(previous)await post('rotate',{key:category,id:previous});
  if(c.ConnectionManagerRequestService.getProfile(profileId)!==profile) {
   // Some hosts return copies. Compare identity by ID rather than object.
   const current=c.ConnectionManagerRequestService.getProfile(profileId);
   if(current?.id!==profile.id)throw failure();
  }
  const settings=c.extensionSettings[CONNECTION_KEY]??={};
  settings.secretIds={...settings.secretIds,[profileId]:id};
  c.saveSettingsDebounced();return id;
 }catch{
  // Remove only a newly created, unassigned key on a failed save.
  if(id){try{await post('delete',{key:category,id});if(previous)await post('rotate',{key:category,id:previous});}catch{throw new Error('EULE_KEY_SAVE_RECOVERY_REQUIRED');}}
  throw failure();
 }finally{saving=false;value='';}
}
