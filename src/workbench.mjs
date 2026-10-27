import {createConnectionFields} from './connection-fields.mjs';
import { createIdeaStore, occurrenceStatus } from './ideas.mjs';
import { compareIdeas } from './similarity.mjs';
import { CONNECTION_KEY, connectionSettings, validateConnection, requestEuleModel } from './connection.mjs';
export function createWorkbench({getContext,document,fetcher,onOpenHistory=()=>{},onContinue=()=>{},onSelect=()=>{}}) {
 const store=createIdeaStore({getContext,fetcher});
 let continuation=null;
 let historyPage=0;
 const labels={PROPOSED:'Vorgeschlagen',ACCEPTED:'Angenommen',REJECTED:'Abgelehnt',DEFERRED:'Später'};
 function notice(message){let e=document.getElementById('eule-notice');if(e)e.textContent=message;}
 function safeError(e){
  const code=/^EULE_[A-Z_]+$/.test(e?.message??'')?e.message:'EULE_ACTION_FAILED';
  const explanations={EULE_OWN_CONNECTION_REQUIRED:'Bitte zuerst Eules eigenes Verbindungsprofil einrichten.',EULE_TEST_CONFIRM_REQUIRED:'Den einmaligen Verbindungstest zuerst ausdrücklich freigeben.',EULE_GENERATION_CONFIRM_REQUIRED:'Die RPG-Generierung zuerst ausdrücklich bestätigen.',EULE_METADATA_CONFLICT:'Browser- und Servermetadaten unterscheiden sich. Es wurde nichts überschrieben.',EULE_SAVE_STATUS_UNKNOWN:'Speicherergebnis unklar; weitere Schreibaktionen dieses Chats sind gesperrt.',EULE_SOURCE_STALE:'Chat, Branch oder Verlauf hat sich geändert. Vorschlag nicht übertragen.',EULE_DELIVERY_STALE_OR_REPEATED:'Die Idee ist veraltet oder wurde schon übertragen. Aktuellen Verlauf ausdrücklich prüfen.',EULE_PROVIDER_FAILED:'Eules eigene Verbindung ist fehlgeschlagen. Kein Rückfall auf das Hauptmodell.',EULE_REQUEST_BUSY:'Eine Eule-Anfrage läuft noch. Keine weitere Anfrage gestartet.'};
  const result={length:'Antwort an der Ausgabegrenze abgeschnitten; nicht übernommen.',empty:'Leere Modellantwort; nicht übernommen.',format:'Antwortformat unbrauchbar; nicht übernommen.'}[e?.directorCode];
  notice((result||explanations[code]||code)+' Keine automatische Wiederholung. Bei Speicherfehlern den Serverstand prüfen.');
 }
 function button(parent,text,action){const b=document.createElement('button');b.type='button';b.textContent=text;parent.appendChild(b);b.addEventListener('click',async()=>{b.disabled=true;try{await action();}catch(e){safeError(e);}finally{b.disabled=false;}});return b;}
 function current(id){const p=store.read().ideas.find(p=>p.id===id);if(!p)throw Error('EULE_IDEA_MISSING');return p;}
 function context(){const s=store.read();return s.ideas.slice(-20).map(p=>({text:p.text,decision:p.decision,occurrence:occurrenceStatus(p,getContext())}));}
 function summary(){return context().map(p=>`[${labels[p.decision]}${p.occurrence==='CURRENT'?'; ausgespielt bestätigt':p.occurrence==='STALE'?'; alter Beleg inzwischen abweichend – keine aktuelle Tatsachenbestätigung':''}] ${p.text.slice(0,1000)}`).join('\n');}
 function getContinuation(){if(!continuation)return null;try{current(continuation);return continuation;}catch{continuation=null;return null;}}
 async function add(rows,pin){const parent=getContinuation();return store.add(rows.map(r=>({...r,continuationOf:parent})),pin);}
 function renderHistory(){
  const root=document.getElementById('eule-history');if(!root)return;root.textContent='';
  let s;try{s=store.read();}catch(e){
   safeError(e);
   if(e.message==='EULE_HISTORY_SCOPE_MISMATCH'){
    const explanation=document.createElement('p');explanation.textContent='Kopierte fremde Historie wird nicht angewendet. Nur bei einem neuen Storyzweig derselben Karte: eigene leere Historie ausdrücklich starten; kopierte Daten bleiben gesondert erhalten.';root.appendChild(explanation);
    const confirm=document.createElement('input');confirm.type='checkbox';confirm.setAttribute('aria-label','Dies ist bewusst ein neuer Storyzweig derselben Karte.');root.appendChild(confirm);
    button(root,'Eigenständige Branch-Historie beginnen',async()=>{await store.initializeBranch(confirm.checked);renderHistory();notice('Eigenständige Branch-Historie gespeichert; keine alten Vorschläge oder Freigaben übernommen.');});
   }
   return;
  }
  const heading=document.createElement('p');heading.textContent=`Ideenhistorie dieses Chats/Branches: ${s.ideas.length}/400. Keine automatische Löschung. Annahme und tatsächliches Geschehen sind getrennt.`;root.appendChild(heading);
  historyPage=Math.min(historyPage,Math.max(0,Math.ceil(s.ideas.length/20)-1));
  if(s.ideas.length>20){
   button(root,'Neuere Ideen',async()=>{historyPage=Math.max(0,historyPage-1);renderHistory();});
   button(root,'Ältere Ideen',async()=>{historyPage=Math.min(Math.ceil(s.ideas.length/20)-1,historyPage+1);renderHistory();});
   const page=document.createElement('p');page.textContent=`Seite ${historyPage+1}/${Math.ceil(s.ideas.length/20)}`;root.appendChild(page);
  }
  for(const p of [...s.ideas].reverse().slice(historyPage*20,historyPage*20+20)){
   const card=document.createElement('details');card.className='story-director-result-card';root.appendChild(card);
   const occurrence=occurrenceStatus(p,getContext());
   const title=document.createElement('summary');title.textContent=`${labels[p.decision]} · ${p.kind} · ${p.delivery}${occurrence==='CURRENT'?' · Ausgespielt':occurrence==='STALE'?' · Beleg veraltet':''}: ${p.text.slice(0,150)}`;card.appendChild(title);
   const text=document.createElement('p');text.textContent=`${labels[p.decision]} · ${p.kind} · Übergabe ${p.delivery}${occurrence==='CURRENT'?' · Ausgespielt (Nutzerbeleg)':occurrence==='STALE'?' · Alter Ausspielbeleg inzwischen abweichend':''}: ${p.text}`;card.appendChild(text);
   button(card,'Vorschlag öffnen / bearbeiten',async()=>onSelect(p));
   const matches=compareIdeas(p.text,s.ideas.filter(x=>x.id!==p.id),{continuationOf:p.continuationOf});
   if(matches.length){const warn=document.createElement('p');warn.textContent='Ähnliche Ideen: '+matches.map(x=>`${x.reason} (${labels[x.decision]})${x.continuation?' – bewusste Fortsetzung':''}`).join('; ');card.appendChild(warn);}
   for(const [label,action]of [['Annehmen','ACCEPTED'],['Ablehnen','REJECTED'],['Später','DEFERRED']])button(card,label,async()=>{await store.decide(p.id,action);renderHistory();});
   button(card,'Bewusst weiterentwickeln',async()=>{continuation=p.id;onContinue(p);notice('Fortsetzung gewählt. Erst der ausdrückliche Generierungsklick fordert einen neuen Vorschlag an.');});
   const review=document.createElement('input');review.type='checkbox';review.setAttribute('aria-label','Ich habe die ältere Idee für den aktuellen Chatverlauf erneut geprüft.');card.appendChild(review);
   button(card,'Für aktuellen Verlauf erneut geprüft',async()=>{await store.decide(p.id,'REVIEW_CURRENT',{confirmed:review.checked});renderHistory();});
   const message=document.createElement('input');message.type='number';message.min='1';message.placeholder='Beleg: Nachricht (1-basiert)';message.setAttribute('aria-label','Belegnachricht');card.appendChild(message);
   const quote=document.createElement('textarea');quote.placeholder='Exaktes kurzes Zitat aus der ausgespielten Assistant-Nachricht';quote.setAttribute('aria-label','Belegzitat');card.appendChild(quote);
   const consent=document.createElement('input');consent.type='checkbox';consent.setAttribute('aria-label','Ich bestätige: Die Idee wurde anhand dieser Quelle tatsächlich ausgespielt.');card.appendChild(consent);
   button(card,'Als ausgespielt belegen',async()=>{await store.decide(p.id,'PLAYED',{confirmed:consent.checked,evidence:{messageId:Number(message.value)-1,quote:quote.value}});renderHistory();});
  }
 }
 function mount(panel){
  const section=panel.querySelector('.story-director-section');
  const note=document.createElement('p');note.id='eule-notice';note.setAttribute('role','status');panel.insertBefore(note,section);
  const intensity=document.createElement('select');intensity.id='eule-intensity';intensity.setAttribute('aria-label','Dramatik');
  for(const value of ['ruhig','mittel','hoch']){const o=document.createElement('option');o.value=value;o.textContent='Dramatik: '+value;intensity.appendChild(o);}intensity.value='mittel';section.appendChild(intensity);
  button(section,'Ideenhistorie / Entscheidungen',async()=>{renderHistory();onOpenHistory();});
  const history=document.createElement('details');const title=document.createElement('summary');title.textContent='Gespeicherte Ideen dieses Chats';history.appendChild(title);const h=document.createElement('div');h.id='eule-history';history.appendChild(h);section.appendChild(history);
  const settings=panel.querySelector('#story-director-settings');
  const box=document.createElement('fieldset');box.className='eule-external-api';const legend=document.createElement('legend');legend.textContent='EXTERNAL API';box.appendChild(legend);settings.prepend(box);
  const s=connectionSettings(getContext());
  function input(label,type,value){const l=document.createElement('label');l.textContent=label;const i=document.createElement('input');i.type=type;if(type==='checkbox')i.checked=value;else i.value=String(value);l.appendChild(i);box.appendChild(l);return i;}
  const enabled=input('Eigene Verbindung ausdrücklich aktivieren','checkbox',s.enabled);
  const select=document.createElement('select');select.setAttribute('aria-label','Eule-Verbindungsprofil');const profileLabel=document.createElement('label');profileLabel.className='eule-api-profile';profileLabel.textContent='Verbindungsprofil';profileLabel.appendChild(select);box.appendChild(profileLabel);
  const empty=document.createElement('option');empty.value='';empty.textContent='Eigenes OpenAI-kompatibles ST-Profil wählen';select.appendChild(empty);
  function refreshProfiles(){
   const selected=select.value||s.profileId;
   let profiles=[];try{profiles=getContext().ConnectionManagerRequestService?.getSupportedProfiles?.()??[];}catch{}
   select.replaceChildren(empty);
   for(const p of profiles){const o=document.createElement('option');o.value=p.id;o.textContent=p.name||p.id;select.appendChild(o);}
   if(selected&&!profiles.some(p=>p.id===selected)){const o=document.createElement('option');o.value=selected;o.textContent='Gespeichertes Profil nicht verfügbar – bitte prüfen';select.appendChild(o);}
   select.value=selected;
  }
  refreshProfiles();select.addEventListener('focus',refreshProfiles);
  const guide=document.createElement('p');guide.className='eule-api-hint';guide.hidden=true;guide.setAttribute('role','status');
  guide.textContent='So richtest du Eules Schlüssel ein: In SillyTaverns API-Einstellungen Chat Completion → Custom (OpenAI-kompatibel) wählen. Dort Base URL, API-Schlüssel und Modell eintragen und verbinden. Diese Verbindung als eigenes Profil (z. B. Eule) speichern, dann deine normale Chat-Verbindung wieder auswählen. Zurück bei Eule dieses Profil auswählen, eigene Verbindung aktivieren und speichern. Das Schlüsselfeld hier ist nur eine Statusanzeige.';
  const manageProfile=()=>{guide.hidden=false;document.getElementById('API-status-top')?.click();notice('Die API-Einstellungen wurden geöffnet. Die Anleitung zur Einrichtung steht bei Eules Verbindung.');};
  const {model,url}=createConnectionFields({document,parent:box,settings:s,profileSelect:select,getService:()=>getContext().ConnectionManagerRequestService,onManage:manageProfile});
  box.appendChild(guide);
  const temperature=input('Temperatur 0 bis 2','number',s.temperature),budget=input('Maximale Eingabezeichen (Schätzung, keine Tokenzahl)','number',s.maxInputCharacters),timeout=input('Zeitlimit in Millisekunden','number',s.timeoutMs);
  temperature.step='.1';temperature.min='0';temperature.max='2';
  const info=document.createElement('p');info.textContent='NanoGPT-Basis: https://nano-gpt.com/api/v1. Schlüssel nur im SillyTavern-Secret-Store des eigenen Profils verwalten. Hier werden keine Schlüssel gelesen oder gespeichert. Ausgabegrenzen stehen weiterhin unten je Aufgabe.';box.appendChild(info);
  button(box,'API-Schlüssel einrichten / Anleitung',async()=>{manageProfile();});
  button(box,'Eule-Verbindung speichern',async()=>{
   const value={schema:1,enabled:enabled.checked,profileId:select.value,model:model.value.trim(),url:url.value.trim(),temperature:Number(temperature.value),maxInputCharacters:Number(budget.value),timeoutMs:Number(timeout.value)};
   if(value.enabled)validateConnection(getContext(),value);
   const c=getContext();if(typeof c.saveSettingsDebounced!=='function')throw Error('EULE_SETTINGS_SAVE_UNAVAILABLE');
   c.extensionSettings[CONNECTION_KEY]=value;c.saveSettingsDebounced();notice('Nur Eules Verbindung gespeichert. Keine Modellanfrage und keine Umschaltung des Hauptprofils.');
  });
  const testConsent=input('Einmaliger Verbindungstest: eine kostenpflichtige Anfrage, höchstens 16 Ausgabetokens; kein Chat-/Lorekontext','checkbox',false);
  button(box,'Gespeicherte Eule-Verbindung einmal testen',async()=>{
   if(!testConsent.checked)throw Error('EULE_TEST_CONFIRM_REQUIRED');testConsent.checked=false;
   const r=await requestEuleModel(getContext(),'Reply with OK.',16,{test:true});
   const p=r?.data??r?.response??r;
   if(p?.choices?.[0]?.finish_reason==='length')throw Error('EULE_TEST_TOKEN_LIMIT');
   const text=typeof r==='string'?r:p?.choices?.[0]?.message?.content??p?.content;
   if(typeof text!=='string'||!text.trim())throw Error('EULE_TEST_EMPTY');notice('Verbindungstest erfolgreich. Genau eine Anfrage; keine RPG-Daten übermittelt.');
  });
 }
 return {store,mount,renderHistory,summary,add,current,getContinuation,safeError};
}
