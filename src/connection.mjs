export const CONNECTION_KEY = 'story-director.connection.v1';
const error = code => Object.assign(new Error(code),{directorCode:code});
let inFlight = false;
export function connectionSettings(c) {
 const s=c.extensionSettings?.[CONNECTION_KEY]??{};
 return {schema:1,enabled:s.enabled===true,profileId:s.profileId??'',model:s.model??'',url:s.url??'',temperature:s.temperature??.9,maxInputCharacters:s.maxInputCharacters??24000,timeoutMs:s.timeoutMs??90000};
}
export function validateConnection(c,s) {
 if(!s.enabled||!s.profileId)throw error('EULE_OWN_CONNECTION_REQUIRED');
 if(!Number.isFinite(s.temperature)||s.temperature<0||s.temperature>2||!Number.isSafeInteger(s.maxInputCharacters)||s.maxInputCharacters<1000||s.maxInputCharacters>120000||!Number.isSafeInteger(s.timeoutMs)||s.timeoutMs<1000||s.timeoutMs>180000)throw error('EULE_CONNECTION_LIMITS_INVALID');
 const service=c.ConnectionManagerRequestService;
 if(typeof service?.sendRequest!=='function'||typeof service?.getProfile!=='function'||typeof service?.validateProfile!=='function')throw error('EULE_PROFILE_SERVICE_UNAVAILABLE');
 let profile,type;try{profile=service.getProfile(s.profileId);type=service.validateProfile(profile);}catch{throw error('EULE_PROFILE_MISSING');}
 if(type.selected!=='openai'||type.source!=='custom')throw error('EULE_OPENAI_COMPATIBLE_PROFILE_REQUIRED');
 if(!profile?.['secret-id'])throw error('EULE_PROFILE_SECRET_REQUIRED');
 const model=(s.model||profile.model||'').trim();if(!model||model.length>200)throw error('EULE_MODEL_REQUIRED');
 let url;try{url=new URL(s.url||profile['api-url']);}catch{throw error('EULE_ENDPOINT_INVALID');}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw error('EULE_HTTPS_ENDPOINT_REQUIRED');
 // The host appends /chat/completions; never accept an already complete route.
 if(/\/chat\/completions\/?$/.test(url.pathname))throw error('EULE_BASE_URL_REQUIRED');
 return {service,profile,model,url:url.href.replace(/\/$/,'')};
}
export async function requestEuleModel(c,prompt,maxTokens,{test=false,signal=null}={}) {
 if(inFlight)throw error('EULE_REQUEST_BUSY');
 const settings=connectionSettings(c),chosen=validateConnection(c,settings);
 const profileSnapshot=JSON.stringify(chosen.profile);
 if(!Number.isSafeInteger(maxTokens)||maxTokens<1||maxTokens>8192)throw error('EULE_OUTPUT_LIMIT_INVALID');
 const messages=typeof prompt==='string'?[{role:'user',content:prompt}]:prompt;
 if(!Array.isArray(messages)||messages.some(m=>typeof m.content!=='string')||JSON.stringify(messages).length>settings.maxInputCharacters)throw error('EULE_INPUT_BUDGET_EXCEEDED');
 const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
 if(signal?.aborted)controller.abort();
 const timer=setTimeout(abort,settings.timeoutMs);timer.unref?.();
 try{
  if(controller.signal.aborted)throw error('EULE_REQUEST_ABORTED');
  inFlight=true;
  const pending=Promise.resolve().then(()=>{if(controller.signal.aborted)throw error('EULE_REQUEST_ABORTED');return chosen.service.sendRequest(settings.profileId,messages,maxTokens,{stream:false,extractData:false,includePreset:false,includeInstruct:false,signal:controller.signal},
   {model:chosen.model,custom_url:chosen.url,temperature:settings.temperature,max_tokens:maxTokens});}).finally(()=>{inFlight=false;});
  const aborted=new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(error('EULE_REQUEST_ABORTED')),{once:true}));
  const response=await Promise.race([pending,aborted]);
  if(controller.signal.aborted)throw error('EULE_REQUEST_ABORTED');
  if(JSON.stringify(connectionSettings(c))!==JSON.stringify(settings))throw error('EULE_CONNECTION_CHANGED');
  if(JSON.stringify(chosen.service.getProfile(settings.profileId))!==profileSnapshot)throw error('EULE_CONNECTION_CHANGED');
  return response;
 }catch(e){if(e.directorCode)throw e;throw error(controller.signal.aborted?'EULE_REQUEST_ABORTED':'EULE_PROVIDER_FAILED');}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
