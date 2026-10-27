// Public profile metadata only. Never recover, fetch, export or copy API secrets.
export function profileConnectionDisplay(service,profileId){
 if(!profileId)return{url:'',model:'',keyAssigned:false,status:'Kein Profil gewählt.'};
 try{const profile=service?.getProfile?.(profileId);if(!profile)throw Error('MISSING');return{url:typeof profile['api-url']==='string'?profile['api-url']:'',model:typeof profile.model==='string'?profile.model:'',keyAssigned:!!profile['secret-id'],status:profile['secret-id']?'Schlüsselzuordnung im Profil vorhanden · nicht getestet.':'Im Profil fehlt die Schlüsselzuordnung.'};}
 catch{return{url:'',model:'',keyAssigned:false,status:'Verbindungsprofil nicht verfügbar.'};}
}
export function createConnectionFields({document:d,parent,settings,profileSelect,getService,onManage=()=>{}}){
 const root=d.createElement('div');root.className='eule-api-fields';parent.append(root);
 function row(label,id,type,value){const line=d.createElement('div');line.className='eule-api-row';const title=d.createElement('label');title.htmlFor=id;title.textContent=label;const field=d.createElement('div');field.className='eule-api-control';const input=d.createElement('input');input.id=id;input.type=type;input.value=value;input.autocomplete='off';input.spellcheck=false;field.append(input);line.append(title,field);root.append(line);return{input,field};}
 const url=row('Base URL','eule-api-base-url','text',settings.url);url.input.setAttribute('aria-describedby','eule-api-defaults-hint');
 const key=row('API Key','eule-api-key-managed','password','');key.input.readOnly=true;key.input.setAttribute('aria-label','API Key – im Verbindungsprofil verwaltet');key.input.setAttribute('aria-describedby','eule-api-key-status');
 const manage=d.createElement('button');manage.type='button';manage.className='eule-api-key-manage';manage.textContent='⚙';manage.title='API Key im SillyTavern-Verbindungsprofil verwalten';manage.setAttribute('aria-label',manage.title);manage.addEventListener('click',onManage);key.field.append(manage);
 const model=row('Model','eule-api-model','text',settings.model);model.input.setAttribute('aria-describedby','eule-api-defaults-hint');
 const status=d.createElement('p');status.id='eule-api-key-status';status.className='eule-api-hint';status.setAttribute('role','status');parent.append(status);
 const hint=d.createElement('p');hint.id='eule-api-defaults-hint';hint.className='eule-api-hint';hint.textContent='Base URL und Model dürfen leer bleiben: Dann gelten die Werte des gewählten Profils. API Key wird ausschließlich im SillyTavern-Profil verwaltet; dieses Feld zeigt keinen auslesbaren Schlüssel.';parent.append(hint);
 function refresh(){const view=profileConnectionDisplay(getService(),profileSelect.value);url.input.placeholder=view.url||'https://anbieter.example/v1';model.input.placeholder=view.model||'Modell-ID aus dem Profil';key.input.value=view.keyAssigned?'************':'';key.input.placeholder=view.keyAssigned?'':'Nicht zugeordnet';status.textContent=view.status;}
 profileSelect.addEventListener('change',refresh);refresh();return{url:url.input,model:model.input};
}
