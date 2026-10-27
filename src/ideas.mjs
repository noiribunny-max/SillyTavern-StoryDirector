export const IDEAS_KEY = 'story-director.ideas.v1';
// Synchronous SHA-256 works on the existing HTTP/LAN surface as well as HTTPS.
// This is an integrity fingerprint, not authentication or a cross-device lock.
export function fingerprint(text) {
    const bytes = new TextEncoder().encode(text), n = bytes.length;
    const data = new Uint8Array(Math.ceil((n + 9) / 64) * 64); data.set(bytes); data[n] = 128;
    const view = new DataView(data.buffer); view.setUint32(data.length - 8, Math.floor(n / 0x20000000)); view.setUint32(data.length - 4, n << 3);
    const primes = []; for (let x=2; primes.length<64; x++) if (!primes.some(p=>p*p<=x&&x%p===0)) primes.push(x);
    const k = primes.map(p => (Math.cbrt(p)%1*0x100000000)>>>0);
    const h = primes.slice(0,8).map(p=>(Math.sqrt(p)%1*0x100000000)>>>0), w = new Uint32Array(64);
    const r = (x,n)=>(x>>>n)|(x<<(32-n));
    for(let off=0;off<data.length;off+=64){
        for(let i=0;i<16;i++)w[i]=view.getUint32(off+i*4);
        for(let i=16;i<64;i++){const a=w[i-15],b=w[i-2];w[i]=(w[i-16]+(r(a,7)^r(a,18)^(a>>>3))+w[i-7]+(r(b,17)^r(b,19)^(b>>>10)))>>>0;}
        let[a,b,c,d,e,f,g,z]=h;
        for(let i=0;i<64;i++){const t1=(z+(r(e,6)^r(e,11)^r(e,25))+((e&f)^(~e&g))+k[i]+w[i])>>>0,t2=((r(a,2)^r(a,13)^r(a,22))+((a&b)^(a&c)^(b&c)))>>>0;z=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}
        [a,b,c,d,e,f,g,z].forEach((v,i)=>h[i]=(h[i]+v)>>>0);
    }
    return h.map(v=>v.toString(16).padStart(8,'0')).join('');
}
const copy = value => structuredClone(value);
const stable = value => JSON.stringify(value, function (_, v) {
    return v && !Array.isArray(v) && typeof v === 'object'
        ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v;
});
const fail = code => { throw new Error(code); };
function hostDefaults(c) {
    const note=c.extensionSettings?.note;
    if (!note || !['defaultInterval','defaultPosition','defaultDepth','defaultRole'].every(k=>Number.isFinite(note[k]))) return {};
    return {note_prompt:note.default ?? '',note_interval:note.defaultInterval,note_position:note.defaultPosition,note_depth:note.defaultDepth,note_role:note.defaultRole};
}
function comparableMetadata(value, defaults) {
    const result=copy(value);
    // ST initializes these configured values on chat load. Only missing keys
    // receive those exact defaults; explicit values and foreign namespaces stay protected.
    for (const [key,v] of Object.entries(defaults)) if (!Object.hasOwn(result,key)) result[key]=v;
    if (result.timedWorldInfo && typeof result.timedWorldInfo==='object'
        && Object.keys(result.timedWorldInfo).every(k=>['sticky','cooldown'].includes(k))
        && Object.values(result.timedWorldInfo).every(v=>v && typeof v==='object' && !Array.isArray(v) && Object.keys(v).length===0)) delete result.timedWorldInfo;
    return stable(result);
}
export function scopeOf(c) {
    const card = c.characters?.[c.characterId];
    if (c.groupId != null || !c.chatId || !c.chatMetadata?.integrity || !card?.avatar) fail('EULE_SINGLE_CHAT_REQUIRED');
    return { chatId: c.chatId, integrity: c.chatMetadata.integrity,
        branch: c.chatMetadata.branchId ?? c.chatMetadata.branch_id ?? null, card: card.avatar };
}
export function sourceOf(c) {
    return fingerprint(stable((c.chat ?? []).map(m => [m.mes, m.swipe_id ?? 0, !!m.is_user, !!m.is_system])));
}
export function occurrenceStatus(p, c) {
    if (!p.occurrence) return null;
    const m=c.chat?.[p.occurrence.messageId];
    return m && !m.is_user && !m.is_system && m.mes === p.occurrence.message && (m.swipe_id ?? 0) === p.occurrence.swipe ? 'CURRENT' : 'STALE';
}
export function newIdeaId(random = globalThis.crypto) {
    if (typeof random?.randomUUID === 'function') return random.randomUUID();
    // getRandomValues remains available on the phone server's HTTP/LAN origin.
    if (typeof random?.getRandomValues !== 'function') fail('EULE_RANDOM_UNAVAILABLE');
    const bytes=random.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
    const h=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
export function createIdeaStore({ getContext, fetcher, uuid = () => newIdeaId(), now = () => new Date().toISOString() }) {
    let busy = false;
    const blockedScopes = new Set();
    function read() {
        const c = getContext(), scope = scopeOf(c), s = c.chatMetadata[IDEAS_KEY];
        if (!s) return { schema: 1, revision: 0, scope, ideas: [] };
        if (s.schema !== 1 || !Array.isArray(s.ideas) || stable(s.scope) !== stable(scope)) fail('EULE_HISTORY_SCOPE_MISMATCH');
        if (!Number.isSafeInteger(s.revision) || s.revision < 0 || s.ideas.length > 400 || stable(s).length > 1500000) fail('EULE_HISTORY_INVALID');
        const ids=new Set();
        for (const p of s.ideas) {
            if (!p || typeof p.id!=='string' || ids.has(p.id) || !['event','twist','timeskip','unstuck'].includes(p.kind)
                || typeof p.text!=='string' || !p.text.trim() || p.text.length>12000 || typeof p.original!=='string'
                || !/^[a-f0-9]{64}$/.test(p.source) || !['PROPOSED','ACCEPTED','REJECTED','DEFERRED'].includes(p.decision)
                || !['NOT_SENT','PENDING','SENT','UNKNOWN'].includes(p.delivery) || !Array.isArray(p.revisions) || !Array.isArray(p.decisions)) fail('EULE_HISTORY_INVALID');
            ids.add(p.id);
        }
        return copy(s);
    }
    function pin() { const c = getContext(); return { scope: scopeOf(c), source: sourceOf(c) }; }
    function assertCurrent(p) {
        if (!p || stable(scopeOf(getContext())) !== stable(p.scope) || sourceOf(getContext()) !== p.source) fail('EULE_SOURCE_STALE');
    }
    async function disk(c) {
        const card = c.characters[c.characterId];
        const r = await fetcher('/api/chats/get', { method: 'POST', cache: 'no-store', headers: c.getRequestHeaders(),
            body: JSON.stringify({ ch_name: card.name, avatar_url: card.avatar, file_name: c.chatId }) });
        if (!r.ok) fail('EULE_READBACK_FAILED');
        const rows = await r.json();
        if (!rows?.[0]?.chat_metadata) fail('EULE_READBACK_FAILED');
        return rows;
    }
    async function update(change, { initializeBranch = false } = {}) {
        if (blockedScopes.has(stable(scopeOf(getContext())))) fail('EULE_SAVE_STATUS_UNKNOWN');
        if (busy) fail('EULE_WRITE_BUSY');
        const c = getContext(), pinned = pin(), metadata = c.chatMetadata, before = copy(metadata);
        const defaults=hostDefaults(c);
        const inherited = metadata[IDEAS_KEY];
        let previous;
        if (initializeBranch) {
            if (!inherited || inherited.schema !== 1 || !Array.isArray(inherited.ideas) || stable(inherited.scope) === stable(pinned.scope)
                || inherited.scope?.card !== pinned.scope.card || inherited.scope?.chatId === pinned.scope.chatId) fail('EULE_BRANCH_INITIALIZATION_INVALID');
            // Preserve the complete copied namespace for inspection; never treat it as this branch's ideas.
            previous = { schema: 1, revision: 0, scope: pinned.scope, ideas: [], quarantinedParent: copy(inherited) };
        } else previous = read();
        busy = true;
        let attempted = false;
        try {
            const initial = await disk(c); assertCurrent(pinned);
            if (comparableMetadata(initial[0].chat_metadata,defaults) !== comparableMetadata(before,defaults)) fail('EULE_METADATA_CONFLICT');
            if (stable(metadata)!==stable(before) || stable(hostDefaults(c))!==stable(defaults)) fail('EULE_METADATA_CONFLICT');
            const next = copy(previous); change(next); next.revision++;
            if (next.ideas.length > 400 || stable(next).length > 1500000) fail('EULE_HISTORY_CAPACITY');
            if (c.chatMetadata !== metadata) fail('EULE_SOURCE_STALE');
            metadata[IDEAS_KEY] = next; attempted = true;
            await c.saveMetadata();
            const saved = await disk(c); assertCurrent(pinned);
            if (c.chatMetadata !== metadata || stable(hostDefaults(c))!==stable(defaults) || comparableMetadata(saved[0].chat_metadata,defaults) !== comparableMetadata(metadata,defaults)) fail('EULE_SAVE_STATUS_UNKNOWN');
            return copy(next);
        } catch (e) {
            if (attempted) { blockedScopes.add(stable(pinned.scope)); throw new Error('EULE_SAVE_STATUS_UNKNOWN'); }
            throw e;
        } finally { busy = false; }
    }
    async function add(rows, pinned) {
        assertCurrent(pinned);
        if (!Array.isArray(rows) || !rows.length || rows.some(r=>!['event','twist','timeskip','unstuck'].includes(r.kind)||typeof r.text!=='string'||!r.text.trim()||r.text.length>12000)) fail('EULE_IDEA_INVALID');
        const entries = rows.map(r => ({ id: uuid(), kind: r.kind, text: r.text, original: r.text, source: pinned.source,
            created: now(), decision: 'PROPOSED', delivery: 'NOT_SENT', occurrence: null, revisions: [], decisions: [],
            continuationOf: r.continuationOf ?? null, range: r.range ?? null, task: r.task ?? 'random',
            direction: r.direction ?? '', intensity: r.intensity ?? 'mittel' }));
        await update(s => { assertCurrent(pinned); s.ideas.push(...entries); }); return entries;
    }
    async function decide(id, action, { text, evidence, confirmed = false } = {}) {
        return update(s => {
            const p = s.ideas.find(x => x.id === id); if (!p) fail('EULE_IDEA_MISSING');
            if (['PENDING', 'UNKNOWN'].includes(p.delivery)) fail('EULE_DELIVERY_UNRESOLVED');
            if (text !== undefined && text !== p.text) {
                if (p.delivery !== 'NOT_SENT' || !text.trim() || text.length > 12000) fail('EULE_EDIT_INVALID');
                p.revisions.push({ text: p.text, at: now() }); p.text = text.trim(); p.decision = 'PROPOSED'; p.reviewedSource=null;
            }
            if (action === 'REVIEW_CURRENT') {
                if (!confirmed || p.delivery !== 'NOT_SENT' || p.decision === 'REJECTED') fail('EULE_REVIEW_CONFIRM_REQUIRED');
                p.reviewedSource = sourceOf(getContext());
            } else if (['PROPOSED','ACCEPTED','REJECTED','DEFERRED'].includes(action)) p.decision = action;
            else if (action === 'PLAYED') {
                if (!confirmed || p.decision !== 'ACCEPTED' || !Number.isSafeInteger(evidence?.messageId)) fail('EULE_OCCURRENCE_PROOF_REQUIRED');
                const m = getContext().chat[evidence.messageId];
                if (!m || m.is_system || m.is_user || !evidence.quote?.trim() || !m.mes?.includes(evidence.quote)) fail('EULE_OCCURRENCE_PROOF_INVALID');
                p.occurrence = { messageId: evidence.messageId, quote: evidence.quote, message: m.mes, swipe: m.swipe_id ?? 0, at: now(), userConfirmed: true };
            } else if (action !== 'EDIT') fail('EULE_DECISION_INVALID');
            p.decisions.push({ action, at: now() });
        });
    }
    async function delivery(id, status) {
        return update(s => {
            const p = s.ideas.find(x => x.id === id); if (!p || p.decision !== 'ACCEPTED') fail('EULE_ACCEPT_FIRST');
            if (status === 'PENDING' && (p.delivery !== 'NOT_SENT' || (p.reviewedSource ?? p.source) !== sourceOf(getContext()))) fail('EULE_DELIVERY_STALE_OR_REPEATED');
            if (!['PENDING','SENT','UNKNOWN'].includes(status) || status !== 'PENDING' && p.delivery !== 'PENDING') fail('EULE_DELIVERY_INVALID');
            p.delivery = status;
        });
    }
    async function initializeBranch(confirmed) {
        if (confirmed !== true) fail('EULE_BRANCH_CONFIRM_REQUIRED');
        return update(() => {}, { initializeBranch: true });
    }
    return { read, pin, assertCurrent, add, decide, delivery, initializeBranch, blocked: () => blockedScopes.has(stable(scopeOf(getContext()))) };
}
