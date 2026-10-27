const stop = new Set('der die das ein eine einer einem einen und oder ist sind wird werden hat haben von mit bei zur zum im am sich sie er es ihr dem den des'.split(' '));
const patterns = [
 ['surveillance', /beobacht|verfolg|beschatt|spion|heimlich.*(?:folg|blick)|fremd.*(?:blick|ninja)/u],
 ['rescue', /rett|befrei|bergung/u], ['betrayal', /verrat|hintergeh|doppelagent/u],
 ['message', /nachricht|botschaft|brief|bote|schriftrolle/u], ['meeting', /begegn|treff|besuch/u],
 ['quiet', /ruhe|alltag|gemeinsam.*(?:essen|koch)|pause|picknick/u], ['training', /train|uebung|übung/u],
 ['consequence', /konsequenz|folge|auswirkung/u],
];
export function describeIdea(text) {
 const clean=String(text).normalize('NFKC').toLocaleLowerCase('de').replace(/[^\p{L}\p{N}\s]/gu,' ');
 const words=[...new Set(clean.split(/\s+/).filter(w=>w.length>2&&!stop.has(w)))];
 return { words, motifs:patterns.filter(([,p])=>p.test(clean)).map(([id])=>id), clean };
}
export function compareIdeas(text, history, { continuationOf = null } = {}) {
 const a=describeIdea(text);
 return history.map(p=>{
  const b=describeIdea(p.text), shared=a.words.filter(w=>b.words.includes(w)).length;
  const jaccard=shared/Math.max(1,new Set([...a.words,...b.words]).size);
  const motif=a.motifs.some(m=>b.motifs.includes(m));
  const exact=a.clean.trim()===b.clean.trim();
  const confidence=exact?'EXACT':jaccard>=.65?'HIGH':motif&&(shared>=1||a.motifs.length===1&&b.motifs.length===1)?'REVIEW':null;
  return {id:p.id,decision:p.decision,confidence,continuation:p.id===continuationOf,
   reason:exact?'Gleiche Formulierung':motif?'Ähnliche Plotmechanik; bitte vergleichen':'Ähnliche Wortwahl'};
 }).filter(p=>p.confidence);
}
