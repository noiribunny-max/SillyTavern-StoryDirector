import { installHudAppearance } from '../src/hud-appearance.mjs';
import { createWorkbench } from '../src/workbench.mjs';
import { connectionSettings, requestEuleModel, CONNECTION_KEY } from '../src/connection.mjs';
import { compareIdeas } from '../src/similarity.mjs';
import { selectBudgetedContext } from '../src/context-budget.mjs';
export function prepareSandbox(sandbox) {
 Object.assign(sandbox,{installHudAppearance,createWorkbench,connectionSettings,requestEuleModel,compareIdeas,selectBudgetedContext});
 const c=sandbox.SillyTavern?.getContext?.();if(!c)return;
 c.chatId??='fixture-chat';c.chatMetadata??={};c.chatMetadata.integrity??='fixture-branch';c.characterId??=0;c.characters??=[{name:'Synthetic',avatar:'fixture.png'}];c.chat??=[];
 c.getRequestHeaders??=()=>({});c.extensionSettings??={};
 c.extensionSettings[CONNECTION_KEY]={enabled:true,profileId:'EULE-OWN',temperature:.9};
 const service=c.ConnectionManagerRequestService??={};
 service.getProfile??=()=>({id:'EULE-OWN',model:'synthetic','api-url':'https://nano-gpt.com/api/v1','secret-id':'synthetic-reference'});
 service.validateProfile??=()=>({selected:'openai',source:'custom'});
 const send=service.sendRequest;
 if(send)service.sendRequest=async(id,messages,tokens,...rest)=>send(id,Array.isArray(messages)?messages.map(m=>m.content).join('\n'):messages,tokens,...rest);
 let disk=structuredClone(c.chatMetadata);c.saveMetadata=async()=>{disk=structuredClone(c.chatMetadata);};
 sandbox.fetch=async()=>({ok:true,json:async()=>[{chat_metadata:structuredClone(disk)},...c.chat]});
}
export const vmSource = s => s.replace(/^import .*;\r?\n/gm,'').replace('export async function init()','async function init()');
