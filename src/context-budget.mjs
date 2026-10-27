// Uses the same serialized UTF-16 character measure as the connection guard.
export const requestCharacters = prompt => JSON.stringify([{role:'user',content:prompt}]).length;
const fail = code => Object.assign(new Error(code === 'EULE_MINIMUM_CONTEXT_TOO_LARGE'
    ? 'Eules Eingabegrenze reicht für Anweisungen, Zusatzkontext und die neueste Nachricht nicht aus. Bitte Zusatzkontext oder eigene Vorgaben gezielt verkleinern. Es wurde keine Modellanfrage gesendet.'
    : 'Eules Kontext konnte nicht eindeutig zugeordnet werden. Es wurde keine Modellanfrage gesendet.'), {directorCode:code});

export function selectBudgetedContext({prompt,formattedContext,storyContext,render,maxCharacters}) {
    if(typeof prompt!=='string'||typeof formattedContext!=='string'||!formattedContext||typeof render!=='function'||!Array.isArray(storyContext?.chat)||!Number.isSafeInteger(maxCharacters))throw fail('EULE_CONTEXT_BUDGET_INVALID');
    const position=prompt.indexOf(formattedContext);
    if(position<0||prompt.indexOf(formattedContext,position+formattedContext.length)>=0)throw fail('EULE_CONTEXT_BUDGET_INVALID');
    const prefix=prompt.slice(0,position),suffix=prompt.slice(position+formattedContext.length);
    const assemble=chat=>prefix+render({...storyContext,chat})+suffix;
    const all=storyContext.chat;
    // Short requests remain byte-for-byte unchanged. No synthetic summary is made.
    if(requestCharacters(prompt)<=maxCharacters)return {prompt,selectedMessages:all.length,omittedMessages:0,characters:requestCharacters(prompt)};
    // Keep the whole latest message and all explicitly collected auxiliary facts.
    // Without reliable relevance labels, silently discarding lore or tracker facts is unsafe.
    let selected=all.length?all.slice(-1):[],result=assemble(selected);
    if(requestCharacters(result)>maxCharacters)throw fail('EULE_MINIMUM_CONTEXT_TOO_LARGE');
    for(let i=all.length-2;i>=0;i--){const candidate=[all[i],...selected],text=assemble(candidate);if(requestCharacters(text)>maxCharacters)break;selected=candidate;result=text;}
    return {prompt:result,selectedMessages:selected.length,omittedMessages:all.length-selected.length,characters:requestCharacters(result)};
}
