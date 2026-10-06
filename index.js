const HUD_POSITION_KEY = 'story-director-hud-position';

const storyDirectorState = {
    suggestions: [],
    activeSuggestion: null,
    activeInstruction: null,
    eventGenerationInProgress: false,
    applyingSuggestion: false,
};

const STORY_DIRECTOR_EMPTY_HTML = `<div class="story-director-empty">Noch kein Vorschlag vorhanden.<br><span>Die weise Eule wartet auf ihren Einsatz. 🦉</span></div>`;
function resetStoryDirectorRound() {
    storyDirectorState.suggestions = [];
    storyDirectorState.activeSuggestion = null;
    storyDirectorState.activeInstruction = null;
    const result = document.getElementById('story-director-result');
    if (result) result.innerHTML = STORY_DIRECTOR_EMPTY_HTML;
    const direction = document.getElementById('story-director-direction');
    if (direction) direction.value = '';
}
function normalizeStoryDirectorTask(task) { return task === 'storythread' ? 'story-thread' : task; }
function getStoryDirectorDirectionInstruction(direction) {
    if (!direction?.trim()) return '';
    return `
=== OPTIONALE KREATIVE RICHTUNG ===
${direction.trim()}
=== ENDE DER RICHTUNG ===
Diese Idee ist kreative Steuerung, KEINE bereits geschehene Tatsache und KEINE verbindliche fertige Szene. Entwickle eine mögliche Umsetzung passend zum Storykontext und zur Slot-Stimmung. Alle Slots sind Alternativen; variiere Mechanismus, Enthüllung oder Konsequenz statt dieselbe Idee umzuformulieren.
`;
}

async function generateDirectorResponse(prompt, maxTokens, retryOnEmpty = true) {
    const context = SillyTavern.getContext();
    const connectionService =
        context.ConnectionManagerRequestService;

    const profileId =
        context.extensionSettings?.connectionManager?.selectedProfile;

    if (!profileId) {
        throw new Error(
            '[Story Director] Kein aktives Connection Profile gefunden.'
        );
    }

    const extractResponseText = (result) => {
        if (typeof result === 'string' && result.trim()) {
            return result.trim();
        }

        const candidates = [
            result?.content,
            result?.text,
            result?.response?.content,
            result?.response?.text,
            result?.message?.content,
            result?.choices?.[0]?.message?.content,
            result?.choices?.[0]?.text,
            result?.data?.content,
            result?.data?.text,
        ];

        for (const candidate of candidates) {
            if (typeof candidate === 'string' && candidate.trim()) {
                return candidate.trim();
            }
        }

        return null;
    };

    const request = async (requestPrompt, requestTokens) => {
        const result = await connectionService.sendRequest(
            profileId,
            requestPrompt,
            requestTokens,
            {
                stream: false,
                extractData: true,
            },
            {
                reasoning_effort: 'low',
            }
        );

        console.log(
            '[Story Director] RAW API RESULT:',
            result
        );

        console.log(
            '[Story Director] CONTENT CHECK:',
            typeof result?.content,
            Boolean(result?.content),
            result?.content
        );

        const text = extractResponseText(result);

        if (text) {
            return text;
        }

        return {
            empty: true,
            hasReasoning: Boolean(result?.reasoning),
            raw: result,
        };
    };

    try {
        const firstAttempt = await request(prompt, maxTokens);

        if (typeof firstAttempt === 'string') {
            return firstAttempt;
        }

        // Manche Modelle liefern gelegentlich nur einen Reasoning-Block und
        // kein finales content-Feld. Ein einzelner kompakter Retry verhindert,
        // dass dadurch der komplette Event-Lauf abbricht.
        if (retryOnEmpty && firstAttempt?.empty) {
            console.warn(
                '[Story Director] Leere Antwort erhalten – kompakter Retry wird versucht.'
            );

            const retryPrompt = `${prompt}\n\n=== WICHTIGER AUSGABEBEFEHL ===\nGib jetzt ausschließlich die fertige Antwort aus. Keine Analyse, kein Reasoning, keine Vorüberlegungen und keine Meta-Erklärung. Beginne direkt mit dem verlangten Titel bzw. Ergebnis.`;

            const retryTokens = Math.min(Number(maxTokens) || 800, 1000);
            const secondAttempt = await request(retryPrompt, retryTokens);

            if (typeof secondAttempt === 'string') {
                return secondAttempt;
            }
        }

        throw new Error(
            '[Story Director] Die KI hat keinen Text zurückgegeben.'
        );
    } catch (error) {
        console.error(
            '[Story Director] Generation failed:',
            error
        );

        throw error;
    }
}

window.testStoryDirectorConnection = async () => {
    try {
        const response = await generateDirectorResponse(
            'Antworte nur mit: Story Director online.',
            100
        );

        console.log(
            '[Story Director] TEST RESPONSE:',
            response
        );

        return response;
    } catch (error) {
        console.error(
            '[Story Director] TEST FAILED:',
            error
        );

        throw error;
    }
};

function getStoryDirectorChatContext(limit = 30) {
    const context = SillyTavern.getContext();

    const chat = context.chat ?? [];

    const messages = chat
        .filter(message =>
            message &&
            !message.is_system &&
            typeof message.mes === 'string' &&
            message.mes.trim()
        )
        .slice(-limit);

    return messages.map(message => ({
        name: message.name || 'Unbekannt',
        isUser: Boolean(message.is_user),
        text: message.mes.trim(),
    }));
}

async function getStoryDirectorBoundLorebookContext() {
    const context = SillyTavern.getContext();

    const lorebookName =
        context.chatMetadata?.world_info ?? null;

    if (!lorebookName) {
        return {
            lorebookName: null,
            entries: [],
        };
    }

    const worldInfo =
        await context.loadWorldInfo(lorebookName);

    const entries = Object.values(
        worldInfo?.entries ?? {}
    )
        .filter(entry =>
            entry &&
            typeof entry.content === 'string' &&
            entry.content.trim()
        )
        .map(entry => ({
            comment:
                typeof entry.comment === 'string'
                    ? entry.comment.trim()
                    : '',

            content:
                entry.content.trim(),

            key:
                Array.isArray(entry.key)
                    ? entry.key
                    : [],

            secondary:
                Array.isArray(entry.secondary)
                    ? entry.secondary
                    : [],

            constant:
                Boolean(entry.constant),

            order:
                entry.order ?? 0,
        }));

    return {
        lorebookName,
        entries,
    };
}

function findRelevantStoryDirectorLorebookEntries(
    lorebookContext,
    searchText,
    limit = 20
) {
    const entries = lorebookContext?.entries ?? [];

    if (!searchText || !entries.length) {
        return [];
    }

    const stopWords = new Set([
        'und', 'oder', 'der', 'die', 'das',
        'den', 'dem', 'des', 'ein', 'eine',
        'einer', 'einem', 'einen',
        'ist', 'war', 'wird', 'hat', 'haben',
        'sich', 'sie', 'er', 'es', 'ich',
        'du', 'wir', 'ihr', 'mit', 'von',
        'auf', 'für', 'aus', 'bei', 'nach',
        'vor', 'über', 'unter', 'aber',
        'nicht', 'noch', 'nur', 'auch',
        'dann', 'wenn', 'wie', 'so',
        'the', 'and', 'or', 'was', 'were',
        'this', 'that', 'with', 'from',
    ]);

    const words = searchText
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
        .split(/\s+/)
        .map(word => word.trim())
        .filter(word =>
            word.length >= 3 &&
            !stopWords.has(word)
        );

    const uniqueWords = [...new Set(words)];

    const scoredEntries = entries.map(entry => {
        const keys = [
            ...(entry.key ?? []),
            ...(entry.secondary ?? []),
        ]
            .filter(value => typeof value === 'string')
            .map(value => value.trim().toLowerCase());

        const comment =
            (entry.comment ?? '').toLowerCase();

        let score = 0;

        for (const word of uniqueWords) {

            // Exakte bzw. sehr direkte Treffer in Lorebook-Keys
            for (const key of keys) {
                if (
                    key === word ||
                    key.includes(word)
                ) {
                    score += 20;
                }
            }

            // Treffer im Namen / Kommentar des Eintrags
            if (comment.includes(word)) {
                score += 8;
            }
        }

        // Konstante Einträge sind grundsätzlich etwas wichtiger.
        if (entry.constant) {
            score += 3;
        }

        return {
            ...entry,
            score,
        };
    });

    return scoredEntries
        .filter(entry => entry.score >= 8)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}

async function getStoryDirectorRelevantLorebookContext(
    chatLimit = 10,
    loreLimit = 20
) {
    const storyContext =
        getStoryDirectorChatContext(chatLimit);

    const lorebook =
        await getStoryDirectorBoundLorebookContext();

    const searchText = storyContext
        .map(message => message.text)
        .join('\n');

    const relevantEntries =
        findRelevantStoryDirectorLorebookEntries(
            lorebook,
            searchText,
            loreLimit
        );

    return {
        lorebookName: lorebook.lorebookName,
        searchText,
        entries: relevantEntries,
    };
}

window.testStoryDirectorRelevantLorebook = async () => {
    return await getStoryDirectorRelevantLorebookContext(
        100,
        20
    );
};

window.testStoryDirectorLorebookSearch = async () => {
    const lorebook =
        await getStoryDirectorBoundLorebookContext();

    return findRelevantStoryDirectorLorebookEntries(
        lorebook,
        'Naruto Mitsuki Konoha Training',
        20
    );
};

window.testStoryDirectorBoundLorebook = async () => {
    return await getStoryDirectorBoundLorebookContext();
};

window.testStoryDirectorChatContext = () => {
    return getStoryDirectorChatContext(30);
};

function getStoryDirectorWorldInfoContext(chatLimit = 100) {
    const context = SillyTavern.getContext();

    const chat = context.chat ?? [];

    const chatForWorldInfo = chat
        .filter(message =>
            message &&
            !message.is_system &&
            typeof message.mes === 'string' &&
            message.mes.trim()
        )
        .slice(-chatLimit)
        .map(message =>
            `${message.name || ''}: ${message.mes.trim()}`
        )
        .reverse();

    return context.getWorldInfoPrompt(
        chatForWorldInfo,
        25700,
        true
    );
}

window.testStoryDirectorWorldInfoContext = async () => {
    return await getStoryDirectorWorldInfoContext(100);
};

function getStoryDirectorDoomTrackerContext() {
    const context = SillyTavern.getContext();
    const chat = context.chat ?? [];

    // Die letzte Assistant-Nachricht finden
    for (let i = chat.length - 1; i >= 0; i--) {
        const message = chat[i];

        if (
            !message ||
            message.is_user ||
            message.is_system
        ) {
            continue;
        }

        const swipeId = message.swipe_id || 0;

        const swipeData =
            message.extra?.dooms_tracker_swipes?.[swipeId];

        if (!swipeData) {
            return null;
        }

        return {
            swipeId,

            quests:
                swipeData.quests ?? null,

            infoBox:
                swipeData.infoBox ?? null,

            characterThoughts:
                swipeData.characterThoughts ?? null,
        };
    }

    return null;
}

async function getStoryDirectorContext({
    chatLimit = 100,
    loreLimit = 20,
} = {}) {
    const chat =
        getStoryDirectorChatContext(chatLimit);

    const relevantLore =
        await getStoryDirectorRelevantLorebookContext(
            chatLimit,
            loreLimit
        );

    const doomTracker =
        getStoryDirectorDoomTrackerContext();

    return {
        chat,
        lore: relevantLore.entries.map(entry =>
            entry.content
        ),
        lorebookName:
            relevantLore.lorebookName,
        doomTracker,
    };
}

window.testStoryDirectorContext = async () => {
    return await getStoryDirectorContext({
        chatLimit: 100,
    });
};

export async function init() {
    console.log('[Story Director] Extension loaded!');
    console.log('[Story Director] Starting UI...');

    if (document.body) {
        createStoryDirectorPanel();
    } else {
        console.log('[Story Director] Body not ready, waiting...');

        document.addEventListener('DOMContentLoaded', () => {
            createStoryDirectorPanel();
        }, { once: true });
    }
}


const STORY_DIRECTOR_INJECTION_ID = 'story-director-active-suggestion';

async function clearStoryDirectorInjection() {
    const context = SillyTavern.getContext();

    if (typeof context.setExtensionPrompt === 'function') {
        try {
            await context.setExtensionPrompt(
                STORY_DIRECTOR_INJECTION_ID,
                '',
                0,
                0,
                false,
                1
            );
        } catch (error) {
            console.warn(
                '[Story Director] Could not clear active suggestion injection:',
                error
            );
        }
    }

    storyDirectorState.activeSuggestion = null;
    storyDirectorState.activeInstruction = null;
}

async function applyStoryDirectorSuggestion(response) {
    if (storyDirectorState.applyingSuggestion || storyDirectorState.eventGenerationInProgress) {
        throw new Error('[Story Director] Eine Generierung oder Übernahme läuft bereits.');
    }
    storyDirectorState.applyingSuggestion = true;
    try {
        await performStoryDirectorSuggestion(response);
        resetStoryDirectorRound();
    } finally {
        storyDirectorState.applyingSuggestion = false;
    }
}

async function performStoryDirectorSuggestion(response) {
    const suggestion = String(response ?? '').trim();

    if (!suggestion) {
        throw new Error('[Story Director] Der Vorschlag ist leer.');
    }

    const context = SillyTavern.getContext();

    if (typeof context.setExtensionPrompt !== 'function') {
        throw new Error(
            '[Story Director] SillyTavern stellt setExtensionPrompt nicht zur Verfügung.'
        );
    }

    const injection = `
<OOC>
VERBINDLICHE REGIEANWEISUNG FÜR DIE NÄCHSTE RPG-ANTWORT

Die folgende Vorgabe MUSS in der unmittelbar nächsten RPG-Antwort tatsächlich umgesetzt und sichtbar ausgespielt werden.

Es reicht NICHT, die Vorgabe nur intern zu berücksichtigen, darüber nachzudenken oder für eine spätere Antwort vorzumerken.
Das beschriebene Ereignis bzw. der beschriebene Zeitsprung muss JETZT in der nächsten Antwort umgesetzt werden.

- Behandle diese Anweisung nicht als Spielertext.
- Erwähne diese OOC-Anweisung, den Story Director oder die Vorgabe niemals in der RPG-Antwort.
- Lass NPCs weiterhin selbstständig und charaktergetreu handeln.
- Erfinde keine Handlungen, Gedanken oder Entscheidungen für den Spielercharakter.
- Setze die Vorgabe als Teil der normalen RPG-Erzählung um.
- Verschiebe die Umsetzung nicht auf eine spätere Antwort.
- Eine bloße Andeutung oder ein Hinweis darauf, dass das Ereignis passieren könnte, reicht nicht aus.

=== VERBINDLICHE REGIEVORGABE ===
${suggestion}
=== ENDE DER REGIEVORGABE ===
</OOC>`;

    await context.setExtensionPrompt(
        STORY_DIRECTOR_INJECTION_ID,
        injection,
        0,
        0,
        false,
        1
    );

    storyDirectorState.activeSuggestion = suggestion;
    storyDirectorState.activeInstruction = injection;

    console.log(
        '[Story Director] Suggestion übernommen und für die nächste KI-Antwort injiziert.'
    );

    if (typeof context.generate !== 'function') {
        await clearStoryDirectorInjection();
        throw new Error(
            '[Story Director] SillyTavern context.generate konnte nicht gefunden werden.'
        );
    }

    try {
        // Die Vorgabe steckt bereits in setExtensionPrompt().
        // Deshalb wird hier die normale SillyTavern-RPG-Generierung
        // ohne zusätzlichen User-Prompt ausgelöst.
        const generated = await context.generate();
        if (generated === false) throw new Error('[Story Director] RPG-Generierung wurde abgebrochen.');
    } finally {
        // Die Director-Vorgabe gilt ausschließlich für diese eine Antwort.
        await clearStoryDirectorInjection();
    }
}

function createStoryDirectorActionButton(label, className, handler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `story-director-card-button ${className}`;
    button.textContent = label;
    button.addEventListener('click', handler);
    return button;
}

function createStoryDirectorResultCard({
    label,
    response,
    failed = false,
    icon = '🎲',
    acceptInstruction = null,
}) {
    const card = document.createElement('div');
    card.className = 'story-director-result-card';

    const title = document.createElement('strong');
    title.textContent = `${failed ? '⚠️' : icon} ${label}`;
    card.appendChild(title);

    const text = document.createElement('div');
    text.className = 'story-director-result-text';
    text.textContent = response ?? '';
    card.appendChild(text);

    if (failed) {
        return card;
    }

    const editor = document.createElement('textarea');
    editor.className = 'story-director-result-editor';
    editor.value = response ?? '';
    editor.style.display = 'none';
    editor.setAttribute('aria-label', 'Story Director Vorschlag bearbeiten');

    const actions = document.createElement('div');
    actions.className = 'story-director-card-actions';

    const editButton = createStoryDirectorActionButton(
        '✏️ Bearbeiten',
        'story-director-edit-button',
        () => {
            const editing = editor.style.display !== 'none';

            if (editing) {
                text.textContent = editor.value.trim();
                editor.style.display = 'none';
                editButton.textContent = '✏️ Bearbeiten';
            } else {
                editor.value = text.textContent;
                editor.style.display = 'block';
                editButton.textContent = '💾 Speichern';
                editor.focus();
            }
        }
    );

    const acceptButton = createStoryDirectorActionButton(
        '✅ Übernehmen',
        'story-director-accept-button',
        async () => {
            const currentText =
                editor.style.display !== 'none'
                    ? editor.value.trim()
                    : text.textContent.trim();

            if (!currentText) {
                return;
            }

            text.textContent = currentText;
            editor.value = currentText;
            editor.style.display = 'none';
            editButton.textContent = '✏️ Bearbeiten';

            actions.querySelectorAll('button').forEach(button => {
                button.disabled = true;
            });

            const originalLabel = acceptButton.textContent;
            acceptButton.textContent = '🦉 Wird übernommen...';

            try {
                const instructionToApply = acceptInstruction
                    ? acceptInstruction + '\n\n=== AKTUELLER/BEARBEITETER TEXT ===\n' + currentText
                    : currentText;

                await applyStoryDirectorSuggestion(instructionToApply);
            } catch (error) {
                console.error(
                    '[Story Director] Suggestion apply failed:',
                    error
                );
                acceptButton.disabled = false;
                editButton.disabled = false;
                acceptButton.textContent = originalLabel;
                throw error;
            }
        }
    );

    actions.appendChild(editButton);
    actions.appendChild(acceptButton);

    card.appendChild(editor);
    card.appendChild(actions);

    return card;
}

function formatStoryDirectorContextForPrompt(storyContext) {
    const chatText = (storyContext.chat ?? [])
        .map(message => {
            const speaker = message.isUser
                ? 'USER'
                : (message.name || 'CHARAKTER');

            return `${speaker}: ${message.text}`;
        })
        .join('\n\n');

    const loreText = (storyContext.lore ?? [])
        .map((entry, index) =>
            `[Lorebook ${index + 1}]\n${entry}`
        )
        .join('\n\n');

    const doom = storyContext.doomTracker;

    let doomText = '';

    if (doom) {
        doomText = [
            '[DOOM TRACKER]',

            doom.infoBox
                ? `Scene / InfoBox:\n${doom.infoBox}`
                : '',

            doom.quests
                ? `Quests:\n${doom.quests}`
                : '',

            doom.characterThoughts
                ? `Character Thoughts:\n${doom.characterThoughts}`
                : '',
        ]
            .filter(Boolean)
            .join('\n\n');
    }

   

    return [
        '=== CHATVERLAUF ===',
        chatText || '(Kein Chatverlauf verfügbar.)',

        '=== LOREBOOK / WORLD INFO ===',
        loreText || '(Keine relevanten Lorebook-Einträge aktiviert.)',

        '=== DOOM TRACKER ===',
        doomText || '(Keine Doom-Tracker-Daten verfügbar.)',
    ].join('\n\n');
}

window.testStoryDirectorFormattedContext = async () => {
    const storyContext = await getStoryDirectorContext({
        chatLimit: 100,
    });

    return formatStoryDirectorContextForPrompt(storyContext);
};

function createStoryDirectorPanel() {
    if (document.getElementById('story-director-panel')) {
        return;
    }

    const toggle = document.createElement('button');
    toggle.id = 'story-director-toggle';
    toggle.className = 'story-director-toggle';
    toggle.type = 'button';
    toggle.textContent = '🦉';
    toggle.title = 'Story Director öffnen';

    const panel = document.createElement('div');
    panel.id = 'story-director-panel';
    panel.className = 'story-director-panel story-director-collapsed';

    panel.innerHTML = `
        <div class="story-director-header">
            <div>
                <div class="story-director-title">
                    🦉 Story Director
                </div>

                <div class="story-director-subtitle">
                    Der kleine Regisseur deiner Geschichte
                </div>
            </div>

            <button
                class="story-director-close"
                type="button"
                title="Story Director schließen"
            >
                ×
            </button>
        </div>

        <div class="story-director-section">
            <div class="story-director-section-title">
                🎬 Geschichte beeinflussen
            </div>

            <label for="story-director-direction">Idee / Richtung für Event oder Twist (optional)</label>
            <textarea id="story-director-direction" class="story-director-direction" rows="2" placeholder="Freie Generierung oder eine kreative Richtung…"></textarea>

            <button class="story-director-button" data-action="event">
                🎲 Event würfeln
            </button>

            <button class="story-director-button" data-action="twist">
                🌀 Twist würfeln
            </button>

            <button class="story-director-button" data-action="timeskip">
                ⏩ Time Skip
            </button>

            <button class="story-director-button" data-action="unstuck">
                🆘 Story festgefahren?
            </button>
                        
            <button class="story-director-button" data-action="settings">
                ⚙️ Einstellungen
            </button>
        </div>

        <div class="story-director-result" id="story-director-result">
            ${STORY_DIRECTOR_EMPTY_HTML}
        </div>
                <div class="story-director-settings" id="story-director-settings">
            <div class="story-director-settings-header">
                <strong>⚙️ Vorschlags-Einstellungen</strong>

                <button
                    class="story-director-back"
                    type="button"
                    title="Zurück"
                >
                    ←
                </button>
            </div>

         <div class="story-director-settings-content">

    <label
        class="story-director-setting-label"
        for="story-director-slot-count"
    >
        Anzahl der Vorschläge
    </label>

    <select
        id="story-director-slot-count"
        class="story-director-select"
    >
        <option value="1">1</option>
        <option value="2">2</option>
        <option value="3" selected>3</option>
        <option value="4">4</option>
    </select>

    <div
        id="story-director-slots"
        class="story-director-slots"
    ></div>
        <div class="story-director-options">

        <label class="story-director-checkbox">
            <input
                type="checkbox"
                id="story-director-different"
                checked
            >
            <span>Vorschläge müssen sich unterscheiden</span>
        </label>

        <label class="story-director-checkbox">
            <input
                type="checkbox"
                id="story-director-story-threads"
                checked
            >
            <span>Bestehende Storyfäden bevorzugen</span>
        </label>

        <label class="story-director-checkbox">
            <input
                type="checkbox"
                id="story-director-avoid-recent"
                checked
            >
            <span>Kürzlich verwendete Ideen vermeiden</span>
        </label>

    </div>
   
    <div class="story-director-generation">

        <div class="story-director-generation-title">
            🧠 Director-Generation
        </div>

        <label class="story-director-checkbox">
            <input
                type="checkbox"
                id="story-director-custom-tokens"
                checked
            >
            <span>Director verwendet eigene Antwortlängen</span>
        </label>

        <div class="story-director-token-settings">

            <div class="story-director-token-setting">
                <label
                    class="story-director-setting-label"
                    for="story-director-tokens-event"
                >
                    🎲 Event
                </label>

                <select
                    id="story-director-tokens-event"
                    class="story-director-select"
                >
                    <option value="500">500 Tokens</option>
                    <option value="800" selected>800 Tokens</option>
                    <option value="1200">1200 Tokens</option>
                    <option value="1600">1600 Tokens</option>
                    <option value="2000">2000 Tokens</option>
                </select>
            </div>

            <div class="story-director-token-setting">
                <label
                    class="story-director-setting-label"
                    for="story-director-tokens-twist"
                >
                    🌀 Twist
                </label>

                <select
                    id="story-director-tokens-twist"
                    class="story-director-select"
                >
                    <option value="800">800 Tokens</option>
                    <option value="1200">1200 Tokens</option>
                    <option value="1400" selected>1400 Tokens</option>
                    <option value="1600">1600 Tokens</option>
                    <option value="2000">2000 Tokens</option>
                </select>
            </div>

            <div class="story-director-token-setting">
                <label
                    class="story-director-setting-label"
                    for="story-director-tokens-timeskip"
                >
                    ⏩ Time Skip
                </label>

                <select
                    id="story-director-tokens-timeskip"
                    class="story-director-select"
                >
                    <option value="800">800 Tokens</option>
                    <option value="1200" selected>1200 Tokens</option>
                    <option value="1600">1600 Tokens</option>
                    <option value="2000">2000 Tokens</option>
                </select>
            </div>

            <div class="story-director-token-setting">
                <label
                    class="story-director-setting-label"
                    for="story-director-tokens-unstuck"
                >
                    🆘 Story retten
                </label>

                <select
                    id="story-director-tokens-unstuck"
                    class="story-director-select"
                >
                    <option value="1000">1000 Tokens</option>
                    <option value="1400">1400 Tokens</option>
                    <option value="1600" selected>1600 Tokens</option>
                    <option value="2000">2000 Tokens</option>
                    <option value="2500">2500 Tokens</option>
                </select>
            </div>

        </div>

    </div>
</div>
    `;

    document.body.appendChild(toggle);
    document.body.appendChild(panel);

    restoreHudPosition(toggle, panel);

    setupToggle(toggle, panel);
    setupCloseButton(toggle, panel);
    setupDragging(toggle, panel);
    setupSettingsBackButton(panel);
    setupSuggestionSettings(panel);

    


    panel.querySelectorAll('.story-director-button').forEach(button => {
        button.addEventListener('click', () => {
            handleDirectorAction(button.dataset.action);
        });
    });

    console.log('[Story Director] UI created!');
}

function setupToggle(toggle, panel) {
    toggle.addEventListener('click', () => {
        if (toggle.dataset.wasDragged === 'true') {
            toggle.dataset.wasDragged = 'false';
            return;
        }

        panel.classList.remove('story-director-collapsed');
        toggle.classList.add('story-director-hidden');
        toggle.title = 'Story Director ist geöffnet';
    });
}

function setupCloseButton(toggle, panel) {
    const closeButton = panel.querySelector('.story-director-close');

    closeButton.addEventListener('click', () => {
        panel.classList.add('story-director-collapsed');
        toggle.classList.remove('story-director-hidden');
        toggle.title = 'Story Director öffnen';
    });
}

function setupDragging(toggle, panel) {
    setupDraggable(toggle);
    setupDraggable(panel, panel.querySelector('.story-director-header'));
}

function setupDraggable(element, handle = element) {
    let dragging = false;
    let moved = false;

    let startPointerX = 0;
    let startPointerY = 0;

    let startLeft = 0;
    let startTop = 0;

    handle.addEventListener('pointerdown', event => {
        if (event.button !== undefined && event.button !== 0) {
            return;
        }

        dragging = true;
        moved = false;

        startPointerX = event.clientX;
        startPointerY = event.clientY;

        const rect = element.getBoundingClientRect();

        startLeft = rect.left;
        startTop = rect.top;

        element.style.left = `${startLeft}px`;
        element.style.top = `${startTop}px`;
        element.style.right = 'auto';

        if (element === toggle) {
            toggle.dataset.wasDragged = 'false';
        }

        handle.setPointerCapture?.(event.pointerId);
    });

    handle.addEventListener('pointermove', event => {
        if (!dragging) {
            return;
        }

        const deltaX = event.clientX - startPointerX;
        const deltaY = event.clientY - startPointerY;

        if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
            moved = true;
        }

        let newLeft = startLeft + deltaX;
        let newTop = startTop + deltaY;

        const rect = element.getBoundingClientRect();

        const maxLeft = window.innerWidth - rect.width;
        const maxTop = window.innerHeight - rect.height;

        newLeft = Math.max(0, Math.min(newLeft, maxLeft));
        newTop = Math.max(0, Math.min(newTop, maxTop));

        element.style.left = `${newLeft}px`;
        element.style.top = `${newTop}px`;

        if (element === toggle && moved) {
            toggle.dataset.wasDragged = 'true';
        }
    });

    handle.addEventListener('pointerup', event => {
        if (!dragging) {
            return;
        }

        dragging = false;

        handle.releasePointerCapture?.(event.pointerId);

        snapToEdge(element);
        saveHudPosition(element);
    });

    handle.addEventListener('pointercancel', () => {
        dragging = false;
    });
}

function snapToEdge(element) {
    const rect = element.getBoundingClientRect();

    const distanceLeft = rect.left;
    const distanceRight = window.innerWidth - rect.right;

    const margin = window.innerWidth <= 600 ? 8 : 12;

    if (distanceLeft < distanceRight) {
        element.style.left = `${margin}px`;
    } else {
        element.style.left = `${window.innerWidth - rect.width - margin}px`;
    }

    const updatedRect = element.getBoundingClientRect();

    let top = updatedRect.top;

    top = Math.max(
        margin,
        Math.min(top, window.innerHeight - updatedRect.height - margin)
    );

    element.style.top = `${top}px`;
}

function saveHudPosition(element) {
    const rect = element.getBoundingClientRect();

    const position = {
        left: rect.left,
        top: rect.top
    };

    localStorage.setItem(
        HUD_POSITION_KEY,
        JSON.stringify(position)
    );
}

function restoreHudPosition(toggle, panel) {
    const saved = localStorage.getItem(HUD_POSITION_KEY);

    if (!saved) {
        return;
    }

    try {
        const position = JSON.parse(saved);

        if (
            typeof position.left !== 'number' ||
            typeof position.top !== 'number'
        ) {
            return;
        }

        const element = toggle;

        element.style.left = `${position.left}px`;
        element.style.top = `${position.top}px`;
        element.style.right = 'auto';
    } catch (error) {
        console.warn(
            '[Story Director] Could not restore HUD position:',
            error
        );
    }
}

async function generateEventForSlot(
    slot,
    formattedContext = null,
    diversityContext = null,
    kind = 'event',
    direction = ''
) {
    const tokenSelect =
        document.getElementById(
            `story-director-tokens-${kind}`
        );

    const maxTokens =
        Number(tokenSelect?.value) || (kind === 'twist' ? 1400 : 800);

    const taskInstruction =
        (kind === 'twist' ? getStoryDirectorTwistInstruction : getStoryDirectorTaskInstruction)(slot.task);

    if (!formattedContext) {
        const storyContext =
            await getStoryDirectorContext({
                chatLimit: 100,
            });

        formattedContext =
            formatStoryDirectorContextForPrompt(
                storyContext
            );
    }

    const previousSuggestions =
        Array.isArray(diversityContext?.previousSuggestions)
            ? diversityContext.previousSuggestions
            : [];

    const requireDifferentSuggestions =
        Boolean(direction.trim()) || (diversityContext?.differentSuggestions ?? true);

    let diversityInstruction = '';

    if (requireDifferentSuggestions && previousSuggestions.length) {
        const previousText = previousSuggestions
            .map((suggestion, index) =>
                `VORHERIGER VORSCHLAG ${index + 1}:\n${suggestion}`
            )
            .join('\n\n');

        diversityInstruction = `
=== BEREITS ERZEUGTE VORSCHLÄGE ===
${previousText}

=== WICHTIGE DIVERSITÄTSREGEL ===
Dieser Slot muss sich deutlich von den bereits erzeugten Vorschlägen unterscheiden.
${direction.trim() ? 'Behalte den Kern der kreativen Richtung bei; darin gewünschte Figuren oder Orte dürfen wiederkehren. Wähle aber einen anderen Mechanismus, eine andere Enthüllung oder Konsequenz und berücksichtige die jeweilige Slot-Stimmung.' : 'Verwende keinen bereits verwendeten Charakter, Ort, Clan, Gruppe, Gegenstand oder Storykonflikt erneut als Hauptfokus, sofern der gewählte dramaturgische Fokus nicht ausdrücklich genau dessen Fortsetzung verlangt.'}
Lorebook-Einträge sind Hintergrundwissen und keine Aufforderung, sie in jedem Vorschlag zu verwenden.
Suche stattdessen einen anderen relevanten Ansatz aus dem aktuellen Story-Kontext.
`;
    }

    const eventPrompt = `
Du bist der Story Director eines langfristigen RPGs.

Du entwickelst aus dem folgenden Story-Kontext EINE konkrete Idee
für ein mögliches zukünftiges Story-Event.

=== AKTUELLER STORY-KONTEXT ===

${formattedContext}

=== DRAMATURGISCHER FOKUS ===

${taskInstruction}
${getStoryDirectorDirectionInstruction(direction)}
${diversityInstruction}

=== AUFGABE ===

Erzeuge EIN konkretes Story-Event, das sich natürlich aus der
bisherigen Geschichte entwickeln kann.

WICHTIGE REGELN:

- Berücksichtige den bisherigen Chatverlauf und die aktuelle Situation.
- Berücksichtige relevante Lorebook-Informationen.
- Berücksichtige den Doom Tracker.
- Baue möglichst auf bestehenden Charakterbeziehungen,
  offenen Situationen und Handlungsfäden auf.
- Lorebook-Einträge sind Hintergrundwissen. Verwende sie nur,
  wenn sie für diesen konkreten Vorschlag wirklich relevant sind.
- Das Event soll eine konkrete neue Entwicklung oder ein konkretes
  Geschehen darstellen.
- Das Event darf neue Impulse einführen, soll aber zur bestehenden
  Geschichte passen.
- Schreibe KEINE Erklärung darüber, warum das Event zur Geschichte passt.
- Schreibe KEINE Analyse deiner eigenen Überlegungen.
- Schreibe KEINE möglichen weiteren Entwicklungen.
- Schreibe KEINE Eskalationsstufen.
- Schreibe KEINEN vollständigen Story-Arc.
- Schreibe KEINE Liste mit mehreren möglichen Events.
- Lege keine Entscheidung oder Reaktion für den Spieler endgültig fest.
- Lass den Charakteren Raum, auf das Ereignis selbst zu reagieren.
- Das Ergebnis soll als direkte Inspiration für die nächste RPG-Szene
  verwendbar sein.
- Schreibe auf Deutsch.
- Sei konkret, aber schreibe keine fertige Szene.
- Formuliere den Output als kompakten Regie-Vorschlag.
- Beschreibe kurz und sachlich, welches Ereignis als Nächstes eintreten könnte.
- Schreibe NICHT die Szene selbst aus.
- Verwende keine ausführliche Atmosphäre oder Sinneseindrücke.
- Schreibe keine Dialoge.
- Schreibe keine inneren Monologe.
- Erzähle nicht Schritt für Schritt, wie die Szene abläuft.
- Der Vorschlag soll eine konkrete Idee liefern, die der Spieler anschließend
  selbst in der RPG-Szene umsetzen kann.
- Verwende einen passenden Titel für das Event.
- Halte den Vorschlag bei ungefähr 80–150 Wörtern.
- Schreibe maximal 2 kurze Absätze.
- Vermeide unnötige Wiederholungen bereits geschehener Ereignisse.

FORMAT:

# Event-Titel

[Konkrete Beschreibung des Ereignisses.]
`;

    const twistPrompt = `
Du bist der Story Director eines laufenden RPGs.

Deine Aufgabe ist es, eine einzelne mögliche TWIST-Idee
für die nächste Entwicklung der Geschichte zu entwerfen.

=== AKTUELLER STORY-KONTEXT ===

${formattedContext}

=== GEWÜNSCHTE DRAMATURGISCHE RICHTUNG ===

${taskInstruction}
${getStoryDirectorDirectionInstruction(direction)}
${diversityInstruction}

=== REGELN FÜR DEN TWIST ===

- Der Twist muss sich aus dem bisherigen Storyverlauf ergeben.
- Er soll überraschend sein, aber rückblickend nachvollziehbar bleiben.
- Nutze vorhandene Charaktere, Beziehungen, offene Situationen,
  Hinweise und Storyfäden.
- Bevorzuge bereits vorhandene Informationen gegenüber neu erfundenen Fakten.
- Erfinde keine wichtigen Hintergrundinformationen über Charaktere,
  wenn dafür keine Grundlage im vorhandenen Kontext existiert.
- Der Twist darf bestehende Lorebook-Fakten NICHT widersprechen.
- Der Twist soll die Geschichte tatsächlich verändern oder
  eine bestehende Situation in ein neues Licht rücken.
- Vermeide einen Twist, der lediglich ein normales neues Ereignis darstellt.
- Lege keine endgültige Reaktion des Spielers fest.
- Schreibe keine vollständige Szene.
- Schreibe keine Dialoge.
- Schreibe keine Analyse deiner eigenen Überlegungen.
- Schreibe keine Liste mehrerer Twists.
- Schreibe auf Deutsch.
- Formuliere einen konkreten Regie-Vorschlag.
- Halte den Vorschlag ungefähr bei 80–150 Wörtern.
- Schreibe maximal 2 kurze Absätze.

WICHTIG:

Die gewählte dramaturgische Richtung bestimmt die ART des Twists.
Sie ist kein Stichwort, das einfach wörtlich in den Twist eingebaut
werden muss.

Der Twist soll zur aktuellen Geschichte passen und nicht künstlich
wirken.

FORMAT:

# Twist-Titel

[Konkrete Beschreibung der überraschenden Wendung.]
`;

    const prompt = kind === 'twist' ? twistPrompt : eventPrompt;
    const response =
        await generateDirectorResponse(prompt, maxTokens);

    console.log(
        '[Story Director] Suggestion slot generated:',
        {
            slot: slot.slot,
            task: slot.task,
            response,
            previousSuggestionCount: previousSuggestions.length,
            differentSuggestions: requireDifferentSuggestions,
        }
    );

    return {
        slot: slot.slot,
        task: slot.task,
        label: getStoryDirectorTaskLabel(slot.task),
        response,
    };
}

window.testStoryDirectorEventSlot = async () => {
    const slots = getStoryDirectorSlotSettings();

    const slot1 =
        slots.find(slot => slot.slot === 1) ?? {
            slot: 1,
            task: 'random',
        };

    return await generateEventForSlot(slot1);
};

window.testStoryDirectorAllEvents = async () => {
    return await generateStoryDirectorEvents();
};

async function generateStoryDirectorEvents(kind = 'event', direction = document.getElementById('story-director-direction')?.value ?? '') {
    console.log(
        '[Story Director] Generating all event slots...'
    );

    const slots =
        getStoryDirectorSlotSettings();

    if (!slots.length) {
        throw new Error(
            '[Story Director] Keine Event-Slots konfiguriert.'
        );
    }

    const storyContext =
        await getStoryDirectorContext({
            chatLimit: 100,
        });

    const formattedContext =
        formatStoryDirectorContextForPrompt(
            storyContext
        );

    const differentSuggestions =
        Boolean(direction.trim()) || (document.getElementById('story-director-different')?.checked ?? true);

    const results = [];
    const previousSuggestions = [];

    for (const slot of slots) {
        try {
            const result =
                await generateEventForSlot(
                    slot,
                    formattedContext,
                    {
                        differentSuggestions,
                        previousSuggestions,
                    },
                    kind,
                    direction
                );

            results.push(result);

            if (differentSuggestions && result?.response) {
                previousSuggestions.push(result.response);
            }
        } catch (error) {
            // Ein einzelner leerer/fehlgeschlagener API-Call darf nicht mehr
            // alle bereits erfolgreich erzeugten Slots zerstören.
            console.warn(
                `[Story Director] Slot ${slot.slot} konnte nicht erzeugt werden. Der nächste Slot wird trotzdem versucht.`,
                error
            );

            results.push({
                slot: slot.slot,
                task: slot.task,
                label: getStoryDirectorTaskLabel(slot.task),
                response: 'Für diesen Slot konnte momentan kein Vorschlag erzeugt werden. Die übrigen Slots wurden weiter generiert.',
                failed: true,
            });
        }
    }

    console.log(
        '[Story Director] All event slots processed:',
        results
    );

    return results;
}

async function generateStoryDirectorUnstuck() {
    const tokenSelect =
        document.getElementById('story-director-tokens-unstuck');

    const maxTokens =
        Number(tokenSelect?.value) || 1600;

    const storyContext =
        await getStoryDirectorContext({
            chatLimit: 100,
        });

    const formattedContext =
        formatStoryDirectorContextForPrompt(
            storyContext
        );

    const prompt = `
Du bist der Story Director eines langfristigen RPGs.

Die Geschichte wirkt festgefahren. Analysiere den aktuellen Stand nur so weit,
wie es nötig ist, um konkrete Wege zu finden, wie die Handlung wieder natürlich
in Bewegung kommen kann.

=== AKTUELLER STORY-KONTEXT ===
${formattedContext}

=== AUFGABE ===
Erstelle 3 klar unterschiedliche Möglichkeiten, die Geschichte aus der aktuellen
Situation heraus weiterzuführen.

WICHTIGE REGELN:
- Nutze zuerst bereits bestehende Storyfäden, offene Situationen und Charakterbeziehungen.
- Lorebook und Doom Tracker sind Hintergrundwissen und müssen nicht zwanghaft verwendet werden.
- Erfinde keine bereits geschehenen Ereignisse neu.
- Keine fertige Szene.
- Keine Dialoge.
- Keine inneren Monologe.
- Keine Entscheidung des Spielers erzwingen.
- Keine vollständigen Story-Arcs.
- Jede Möglichkeit muss einen anderen Ansatz verfolgen.
- Schreibe auf Deutsch.
- Halte jede Möglichkeit kompakt.

FORMAT:

# Möglichkeit 1 – [kurzer Titel]
[Konkreter Ansatz in 2–4 Sätzen.]

# Möglichkeit 2 – [kurzer Titel]
[Konkreter Ansatz in 2–4 Sätzen.]

# Möglichkeit 3 – [kurzer Titel]
[Konkreter Ansatz in 2–4 Sätzen.]
`;

    return await generateDirectorResponse(prompt, maxTokens);
}


function parseStoryDirectorDate(value) {
    const input = String(value ?? '').trim();
    const match = input.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-]([A-Za-z]{0,2}\d{1,6})$/);

    if (!match) return null;

    const day = Number(match[1]);
    const month = Number(match[2]);
    const yearToken = match[3].toUpperCase();

    if (!Number.isInteger(day) || !Number.isInteger(month)) return null;

    let yearNumber;
    let yearPrefix = '';

    if (yearToken.startsWith('XX')) {
        yearPrefix = 'XX';
        yearNumber = Number(yearToken.slice(2));
    } else {
        yearNumber = Number(yearToken);
    }

    if (!Number.isInteger(yearNumber) || yearNumber < 0 || yearNumber > 999999) {
        return null;
    }

    const calculationYear = yearPrefix ? 2000 + yearNumber : yearNumber;

    if (month < 1 || month > 12 || day < 1 || day > 31) {
        return null;
    }

    const date = new Date(Date.UTC(calculationYear, month - 1, day));

    if (
        date.getUTCFullYear() !== calculationYear ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        return null;
    }

    return {
        day,
        month,
        yearNumber,
        yearPrefix,
        calculationYear,
        date,
        original: String(day).padStart(2, '0') + '.' +
            String(month).padStart(2, '0') + '.' + yearToken,
    };
}

function formatStoryDirectorDate(dateInfo) {
    if (!dateInfo) return '';

    const year = dateInfo.yearPrefix
        ? 'XX' + String(dateInfo.yearNumber).padStart(2, '0')
        : String(dateInfo.yearNumber);

    return (
        String(dateInfo.day).padStart(2, '0') + '.' +
        String(dateInfo.month).padStart(2, '0') + '.' +
        year
    );
}

function addStoryDirectorDuration(start, amount, unit) {
    if (!start || !Number.isFinite(amount) || amount <= 0) return null;

    const result = {
        ...start,
        date: new Date(start.date.getTime()),
    };

    if (unit === 'days') {
        result.date.setUTCDate(result.date.getUTCDate() + amount);
    } else if (unit === 'weeks') {
        result.date.setUTCDate(result.date.getUTCDate() + amount * 7);
    } else if (unit === 'months') {
        result.date.setUTCMonth(result.date.getUTCMonth() + amount);
    } else if (unit === 'years') {
        result.date.setUTCFullYear(result.date.getUTCFullYear() + amount);
    } else {
        return null;
    }

    result.day = result.date.getUTCDate();
    result.month = result.date.getUTCMonth() + 1;

    if (start.yearPrefix) {
        result.yearNumber = result.date.getUTCFullYear() - 2000;
        result.yearPrefix = 'XX';
    } else {
        result.yearNumber = result.date.getUTCFullYear();
        result.yearPrefix = '';
    }

    return result;
}

function getStoryDirectorDateDifference(start, end) {
    if (!start || !end) return null;

    return Math.round(
        (end.date.getTime() - start.date.getTime()) / 86400000
    );
}

function createStoryDirectorTimeSkipDialog() {
    const overlay = document.createElement('div');
    overlay.id = 'story-director-timeskip-dialog';
    overlay.style.cssText = [
        'position:fixed',
        'inset:0',
        'z-index:100000',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'padding:16px',
        'background:rgba(0,0,0,.72)',
    ].join(';');

    const box = document.createElement('div');
    box.style.cssText = [
        'width:min(560px,100%)',
        'max-height:90vh',
        'overflow:auto',
        'padding:18px',
        'border-radius:12px',
        'background:var(--SmartThemeBlurTintColor,#202020)',
        'color:var(--SmartThemeBodyColor,#fff)',
        'box-sizing:border-box',
        'box-shadow:0 10px 40px rgba(0,0,0,.5)',
    ].join(';');

    box.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:14px;">
            <strong style="font-size:1.15em;">⏩ Time Skip</strong>
            <button type="button" data-ts-cancel style="font-size:1.2em;">×</button>
        </div>

        <label style="display:block;margin-bottom:6px;">Berechnungsart</label>
        <select data-ts-mode style="width:100%;margin-bottom:14px;">
            <option value="range">🗓️ Start- und Enddatum</option>
            <option value="duration">⏩ Startdatum + Dauer</option>
        </select>

        <div data-ts-start-wrap>
            <label style="display:block;margin-bottom:6px;">Startdatum</label>
            <input data-ts-start type="text" placeholder="z. B. 14.05.XX12"
                style="width:100%;box-sizing:border-box;margin-bottom:12px;">
        </div>

        <div data-ts-end-wrap>
            <label style="display:block;margin-bottom:6px;">Enddatum</label>
            <input data-ts-end type="text" placeholder="z. B. 20.10.XX12"
                style="width:100%;box-sizing:border-box;margin-bottom:12px;">
        </div>

        <div data-ts-duration-wrap style="display:none;">
            <label style="display:block;margin-bottom:6px;">Dauer</label>
            <div style="display:flex;gap:8px;margin-bottom:12px;">
                <input data-ts-duration type="number" min="1" step="1" placeholder="z. B. 2"
                    style="flex:1;min-width:0;">
                <select data-ts-unit style="flex:1;min-width:0;">
                    <option value="days">Tage</option>
                    <option value="weeks">Wochen</option>
                    <option value="months">Monate</option>
                    <option value="years">Jahre</option>
                </select>
            </div>
        </div>

        <label style="display:block;margin-bottom:6px;">📝 Zusätzliche Vorgaben</label>
        <textarea data-ts-instructions rows="6"
            placeholder="z. B. Mitsuki ist noch nicht zurück. Ignoriere Mitsuki in der Zusammenfassung. Sie schreibt Naruto gelegentlich Briefe mit Fotos und Zeichnungen."
            style="width:100%;box-sizing:border-box;resize:vertical;margin-bottom:14px;"></textarea>

        <div data-ts-error style="display:none;margin-bottom:12px;padding:8px;border-radius:8px;background:rgba(180,40,40,.25);"></div>

        <div style="display:flex;justify-content:flex-end;gap:8px;">
            <button type="button" data-ts-cancel>Abbrechen</button>
            <button type="button" data-ts-submit>⏩ Zeitsprung erstellen</button>
        </div>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const mode = box.querySelector('[data-ts-mode]');
    const endWrap = box.querySelector('[data-ts-end-wrap]');
    const durationWrap = box.querySelector('[data-ts-duration-wrap]');
    const errorBox = box.querySelector('[data-ts-error]');

    const updateMode = () => {
        const durationMode = mode.value === 'duration';
        endWrap.style.display = durationMode ? 'none' : 'block';
        durationWrap.style.display = durationMode ? 'block' : 'none';
    };

    mode.addEventListener('change', updateMode);

    const close = () => overlay.remove();

    box.querySelectorAll('[data-ts-cancel]').forEach(button => {
        button.addEventListener('click', close);
    });

    return { overlay, box, mode, errorBox, close };
}

async function openStoryDirectorTimeSkipDialog() {
    const dialog = createStoryDirectorTimeSkipDialog();
    const box = dialog.box;

    const submit = box.querySelector('[data-ts-submit]');
    const startInput = box.querySelector('[data-ts-start]');
    const endInput = box.querySelector('[data-ts-end]');
    const durationInput = box.querySelector('[data-ts-duration]');
    const unitInput = box.querySelector('[data-ts-unit]');
    const instructionsInput = box.querySelector('[data-ts-instructions]');

    submit.addEventListener('click', async () => {
        const start = parseStoryDirectorDate(startInput.value);
        const mode = dialog.mode.value;

        let end = null;
        let durationText = '';

        if (!start) {
            dialog.errorBox.textContent =
                'Bitte gib ein gültiges Startdatum ein, z. B. 14.05.XX12.';
            dialog.errorBox.style.display = 'block';
            return;
        }

        if (mode === 'range') {
            end = parseStoryDirectorDate(endInput.value);

            if (!end) {
                dialog.errorBox.textContent =
                    'Bitte gib ein gültiges Enddatum ein, z. B. 20.10.XX12.';
                dialog.errorBox.style.display = 'block';
                return;
            }

            if (end.date <= start.date) {
                dialog.errorBox.textContent =
                    'Das Enddatum muss nach dem Startdatum liegen.';
                dialog.errorBox.style.display = 'block';
                return;
            }

            const days = getStoryDirectorDateDifference(start, end);
            durationText = days + ' Tag' + (days === 1 ? '' : 'e');
        } else {
            const amount = Number(durationInput.value);

            if (!Number.isInteger(amount) || amount <= 0) {
                dialog.errorBox.textContent =
                    'Bitte gib eine positive ganze Zahl für die Dauer ein.';
                dialog.errorBox.style.display = 'block';
                return;
            }

            end = addStoryDirectorDuration(start, amount, unitInput.value);

            if (!end) {
                dialog.errorBox.textContent =
                    'Die Dauer konnte nicht berechnet werden.';
                dialog.errorBox.style.display = 'block';
                return;
            }

            const unitLabels = {
                days: amount === 1 ? 'Tag' : 'Tage',
                weeks: amount === 1 ? 'Woche' : 'Wochen',
                months: amount === 1 ? 'Monat' : 'Monate',
                years: amount === 1 ? 'Jahr' : 'Jahre',
            };

            durationText = amount + ' ' + unitLabels[unitInput.value];
        }

        const startText = formatStoryDirectorDate(start);
        const endText = formatStoryDirectorDate(end);
        const extraInstructions = instructionsInput.value.trim();

        dialog.close();

        const tokenSelect =
            document.getElementById('story-director-tokens-timeskip');

        const maxTokens = Number(tokenSelect?.value) || 1200;

        const storyContext =
            await getStoryDirectorContext({ chatLimit: 100 });

        const formattedContext =
            formatStoryDirectorContextForPrompt(storyContext);

        const prompt = `
Du bist der Story Director eines langfristigen RPGs.

Die Geschichte wird für einen definierten Zeitraum übersprungen.
Du sollst zusammenfassen, was WÄHREND dieses Zeitraums sinnvoll und
nachvollziehbar passiert ist, damit die RPG-Geschichte anschließend am
Ende des Zeitraums fortgesetzt werden kann.

=== ZEITRAUM ===
Start: ${startText}
Ende: ${endText}
Dauer: ${durationText}

=== AKTUELLER STORY-KONTEXT ===
${formattedContext}

=== ZUSÄTZLICHE VORGABEN DES SPIELERS ===
${extraInstructions || '(Keine zusätzlichen Vorgaben.)'}

Diese Vorgaben sind feste Rahmenbedingungen für den Zeitsprung.
Sie sind keine bloßen Story-Ideen und dürfen nicht ignoriert werden.
Wenn eine Figur laut Vorgabe noch nicht zurück ist, darf sie während
dieses Zeitsprungs nicht plötzlich zurückkehren.
Wenn eine Figur ausdrücklich nicht als Hauptfokus behandelt werden soll,
mache sie nicht zum zentralen Entwicklungspunkt.
Erlaubte indirekte Ereignisse, die ausdrücklich vorgegeben wurden,
dürfen aber berücksichtigt werden.

=== AUFGABE ===
Erstelle eine kompakte, aber inhaltlich brauchbare Zusammenfassung
der relevanten Entwicklungen WÄHREND des Zeitsprungs.

Berücksichtige:
- bestehende Charakterbeziehungen
- Charakterentwicklung
- wichtige Ereignisse
- offene Storyfäden und deren Konsequenzen
- relevante Veränderungen in Welt und Umfeld
- den Zustand der Geschichte am Ende des Zeitsprungs

Für lange Zeiträume musst du nicht künstlich jeden Monat oder jede
Woche mit Ereignissen füllen. Beschreibe nur Entwicklungen, die für
die Geschichte tatsächlich relevant sind.

WICHTIGE REGELN:
- Nutze zuerst den vorhandenen Story-Kontext.
- Lorebook und Doom Tracker sind Hintergrundwissen und müssen nur
  verwendet werden, wenn sie relevant sind.
- Erfinde keine bereits geschehenen Ereignisse neu.
- Widersprich keinen bestehenden Charakter- oder Loreinformationen.
- Keine ausgeschriebene Szene.
- Keine langen Dialoge.
- Keine Spielerentscheidung erzwingen.
- Der Zeitsprung endet exakt am angegebenen Enddatum.
- Schreibe auf Deutsch.

FORMAT:

# ⏩ Zeitsprung: ${startText} → ${endText}

## ❤️ Beziehungen
[Relevante Entwicklungen.]

## 🧠 Charakterentwicklung
[Relevante Entwicklungen.]

## ⚔️ Wichtige Ereignisse
[Relevante Ereignisse.]

## 🎯 Storyfäden & Konsequenzen
[Was sich bei offenen Handlungsfäden verändert.]

## 🌍 Welt & Umfeld
[Nur relevante Veränderungen.]

## 📌 Stand am Ende des Zeitsprungs
[Die Ausgangslage für die nächste RPG-Antwort.]
`;

        const result = document.getElementById('story-director-result');

        if (!result) return;

        storyDirectorState.eventGenerationInProgress = true;

        result.innerHTML = `
            <div class="story-director-placeholder">
                <strong>⏩ Zeitsprung wird berechnet...</strong>
                <p>🦉 Die Eule schaut, was in dieser Zeit passiert...</p>
            </div>
        `;

        try {
            const response =
                await generateDirectorResponse(prompt, maxTokens);

            result.innerHTML = '';

            const acceptInstruction = `
Der Time Skip wurde bereits vollständig berücksichtigt.

Der Zeitsprung von ${startText} bis ${endText} (${durationText}) ist
JETZT kanonisch passiert. Die untenstehende Zusammenfassung beschreibt
die relevanten Entwicklungen während dieses Zeitraums.

Setze die RPG-Geschichte unmittelbar AM ENDE dieses Zeitsprungs fort.
Erzähle den Zeitsprung nicht noch einmal vollständig nach und springe
nicht zurück zum Startdatum.

Behandle die bestehenden Charakter-, Lorebook- und Weltinformationen
weiterhin als verbindlich.

=== ZEITSPRUNG-ZUSAMMENFASSUNG ===
`;

            result.appendChild(
                createStoryDirectorResultCard({
                    label: 'Time Skip ' + startText + ' → ' + endText,
                    response,
                    icon: '⏩',
                    acceptInstruction,
                })
            );
        } catch (error) {
            result.innerHTML = `
                <div class="story-director-placeholder">
                    <strong>❌ Time Skip fehlgeschlagen</strong>
                    <p>Die Eule konnte den Zeitsprung momentan nicht berechnen.</p>
                    <small>Sieh in der Browser-Konsole nach.</small>
                </div>
            `;

            console.error(
                '[Story Director] Time Skip generation failed:',
                error
            );
        } finally {
            storyDirectorState.eventGenerationInProgress = false;
        }
    });
}

async function handleDirectorAction(action) {
    if (action === 'settings') {
        openSettings();
        return;
    }

    const result = document.getElementById('story-director-result');

    if (!result) {
        return;
    }

    const actionNames = {
        event: '🎲 Event',
        twist: '🌀 Twist',
        timeskip: '⏩ Time Skip',
        unstuck: '🆘 Story retten',
    };

    const name = actionNames[action] ?? 'Aktion';
    if (storyDirectorState.applyingSuggestion) return;

    if (action === 'event' || action === 'twist') {
        if (storyDirectorState.eventGenerationInProgress) {
            console.log(
                '[Story Director] Event generation already running.'
            );
            return;
        }

        storyDirectorState.eventGenerationInProgress = true;

        result.innerHTML = `
            <div class="story-director-placeholder">
                <strong>${name}s werden generiert...</strong>
                <p>🦉 Die Eule denkt nach...</p>
            </div>
        `;

        try {
            const events =
                await generateStoryDirectorEvents(action);

            result.innerHTML = '';

            events.forEach(event => {
                result.appendChild(
                    createStoryDirectorResultCard({
                        label: event.label,
                        response: event.response,
                        failed: event.failed,
                        icon: action === 'twist' ? '🌀' : '🎲',
                    })
                );
            });
        } catch (error) {
            result.innerHTML = `
                <div class="story-director-placeholder">
                    <strong>❌ Fehler bei der Generierung</strong>
                    <p>Die Eule konnte keine ${action === 'twist' ? 'Twists' : 'Events'} erzeugen.</p>
                    <small>Sieh in der Browser-Konsole nach.</small>
                </div>
            `;

            console.error(
                '[Story Director] Event generation failed:',
                error
            );
        } finally {
            storyDirectorState.eventGenerationInProgress = false;
        }

        return;
    }

    if (action === 'timeskip') {
        if (storyDirectorState.eventGenerationInProgress) {
            console.log('[Story Director] Another Director generation is already running.');
            return;
        }

        await openStoryDirectorTimeSkipDialog();
        return;
    }

    if (action === 'unstuck') {
        if (storyDirectorState.eventGenerationInProgress) {
            console.log(
                '[Story Director] Another Director generation is already running.'
            );
            return;
        }

        storyDirectorState.eventGenerationInProgress = true;

        result.innerHTML = `
            <div class="story-director-placeholder">
                <strong>🆘 Die Eule sucht einen Ausweg...</strong>
                <p>🦉 Die aktuelle Geschichte wird analysiert...</p>
            </div>
        `;

        try {
            const response =
                await generateStoryDirectorUnstuck();

            result.innerHTML = '';

            result.appendChild(
                createStoryDirectorResultCard({
                    label: 'Story retten',
                    response,
                    icon: '🆘',
                })
            );
        } catch (error) {
            result.innerHTML = `
                <div class="story-director-placeholder">
                    <strong>❌ Story-Rettung fehlgeschlagen</strong>
                    <p>Die Eule konnte momentan keinen Ausweg erzeugen.</p>
                    <small>Sieh in der Browser-Konsole nach.</small>
                </div>
            `;

            console.error(
                '[Story Director] Unstuck generation failed:',
                error
            );
        } finally {
            storyDirectorState.eventGenerationInProgress = false;
        }

        return;
    }

    result.innerHTML = `
        <div class="story-director-placeholder">
            <strong>${name}</strong>
            <p>Diese Funktion kommt als Nächstes. 🦉</p>
            <small>Die Verbindung zur KI funktioniert bereits.</small>
        </div>
    `;

    console.log(`[Story Director] Action: ${action}`);
}

function openSettings() {
    const section = document.querySelector('.story-director-section');
    const result = document.getElementById('story-director-result');
    const settings = document.getElementById('story-director-settings');

    if (!section || !result || !settings) {
        return;
    }

    section.style.display = 'none';
    result.style.display = 'none';
    settings.style.display = 'block';

    console.log('[Story Director] Settings opened');
}


function setupSettingsBackButton(panel) {
    const backButton = panel.querySelector('.story-director-back');
    const section = panel.querySelector('.story-director-section');
    const result = panel.querySelector('#story-director-result');
    const settings = panel.querySelector('#story-director-settings');

    if (!backButton || !section || !result || !settings) {
        return;
    }

    backButton.addEventListener('click', () => {
        settings.style.display = 'none';
        section.style.display = 'block';
        result.style.display = 'block';

        console.log('[Story Director] Settings closed');
    });
}

function setupSuggestionSettings(panel) {
    const slotCountSelect = panel.querySelector('#story-director-slot-count');
    const slotsContainer = panel.querySelector('#story-director-slots');

    if (!slotCountSelect || !slotsContainer) {
        return;
    }

    const tasks = [
        { value: 'random', label: '🎲 Zufällig' },
        { value: 'positive', label: '✨ Positiver Verlauf' },
        { value: 'negative', label: '⚠️ Negativer Verlauf' },
        { value: 'gore', label: '🩸 Gore / Gewalt' },
        { value: 'danger', label: '💥 Gefahr' },
        { value: 'twist', label: '🌀 Twist' },
        { value: 'romance', label: '❤️ Romantik' },
        { value: 'relationship', label: '🤝 Beziehung' },
        { value: 'character', label: '🧠 Charakterentwicklung' },
        { value: 'mystery', label: '🕵️ Mystery' },
        { value: 'horror', label: '👻 Horror' },
        { value: 'conflict', label: '⚔️ Konflikt' },
        { value: 'humor', label: '😂 Humor' },
        { value: 'worldbuilding', label: '🌍 Worldbuilding' },
        { value: 'consequence', label: '🔗 Konsequenz' },
        { value: 'story-thread', label: '🎯 Storyfaden' }
    ];

    function renderSlots(savedSlots = null) {
    const count = Number(slotCountSelect.value);

    slotsContainer.innerHTML = '';

    for (let i = 1; i <= count; i++) {
        const slot = document.createElement('div');
        slot.className = 'story-director-slot';

        const label = document.createElement('label');
        label.className = 'story-director-setting-label';
        label.textContent = `Slot ${i}`;

        const select = document.createElement('select');
        select.className = 'story-director-select';
        select.dataset.slot = String(i);

        tasks.forEach(task => {
            const option = document.createElement('option');

            option.value = task.value;
            option.textContent = task.label;

            select.appendChild(option);
        });

        const savedSlot = savedSlots?.find(
            saved => saved.slot === i
        );

        if (savedSlot) {
            select.value = normalizeStoryDirectorTask(savedSlot.task);
        }

        slot.appendChild(label);
        slot.appendChild(select);
        slotsContainer.appendChild(slot);
    }
}
    

    slotCountSelect.addEventListener('change', () => {
    const currentSlots = Array.from(
        slotsContainer.querySelectorAll('.story-director-select')
    ).map(select => ({
        slot: Number(select.dataset.slot),
        task: select.value,
    }));

    renderSlots(currentSlots);
    saveSuggestionSettings(slotCountSelect, slotsContainer);
});

    slotsContainer.addEventListener('change', () => {
        saveSuggestionSettings(slotCountSelect, slotsContainer);
    });

        const checkboxIds = [
        'story-director-different',
        'story-director-story-threads',
        'story-director-avoid-recent',
    ];

    checkboxIds.forEach(id => {
        const checkbox = panel.querySelector(`#${id}`);

        if (checkbox) {
            checkbox.addEventListener('change', () => {
                saveSuggestionSettings(slotCountSelect, slotsContainer);
            });
        }
    });

    const tokenSelectIds = [
        'story-director-custom-tokens',
        'story-director-tokens-event',
        'story-director-tokens-twist',
        'story-director-tokens-timeskip',
        'story-director-tokens-unstuck',
    ];

    tokenSelectIds.forEach(id => {
        const element = panel.querySelector(`#${id}`);

        if (element) {
            element.addEventListener('change', () => {
                saveSuggestionSettings(slotCountSelect, slotsContainer);
            });
        }
    });

const savedSettings = loadSuggestionSettings();

if (savedSettings) {
    slotCountSelect.value = String(savedSettings.slotCount);
    renderSlots(savedSettings.slots);

    const differentSuggestions =
        panel.querySelector('#story-director-different');

    const preferStoryThreads =
        panel.querySelector('#story-director-story-threads');

    const avoidRecentIdeas =
        panel.querySelector('#story-director-avoid-recent');

    if (differentSuggestions) {
        differentSuggestions.checked =
            savedSettings.differentSuggestions ?? true;
    }

    if (preferStoryThreads) {
        preferStoryThreads.checked =
            savedSettings.preferStoryThreads ?? true;
    }

    if (avoidRecentIdeas) {
        avoidRecentIdeas.checked =
            savedSettings.avoidRecentIdeas ?? true;

        const customTokens =
            panel.querySelector('#story-director-custom-tokens');

        if (customTokens) {
            customTokens.checked =
                savedSettings.customTokens ?? true;
        }

        const tokenSettings = savedSettings.tokens ?? {};

        const eventTokens =
            panel.querySelector('#story-director-tokens-event');

        const twistTokens =
            panel.querySelector('#story-director-tokens-twist');

        const timeskipTokens =
            panel.querySelector('#story-director-tokens-timeskip');

        const unstuckTokens =
            panel.querySelector('#story-director-tokens-unstuck');

        if (eventTokens) {
            eventTokens.value =
                String(tokenSettings.event ?? 800);
        }

        if (twistTokens) {
            twistTokens.value =
                String(tokenSettings.twist ?? 1400);
        }

        if (timeskipTokens) {
            timeskipTokens.value =
                String(tokenSettings.timeskip ?? 1200);
        }

        if (unstuckTokens) {
            unstuckTokens.value =
                String(tokenSettings.unstuck ?? 1600);
        }
    }
} else {
    renderSlots();
}
}
function saveSuggestionSettings(slotCountSelect, slotsContainer) {
    const settings = {
        slotCount: Number(slotCountSelect.value),
        slots: [],

        differentSuggestions:
            document.getElementById('story-director-different')?.checked ?? true,

        preferStoryThreads:
            document.getElementById('story-director-story-threads')?.checked ?? true,

        avoidRecentIdeas:
            document.getElementById('story-director-avoid-recent')?.checked ?? true,
            
        customTokens:
            document.getElementById('story-director-custom-tokens')?.checked ?? true,

        tokens: {
            event:
                Number(document.getElementById('story-director-tokens-event')?.value) || 800,

            twist:
                Number(document.getElementById('story-director-tokens-twist')?.value) || 1400,

            timeskip:
                Number(document.getElementById('story-director-tokens-timeskip')?.value) || 1200,

            unstuck:
                Number(document.getElementById('story-director-tokens-unstuck')?.value) || 1600,
        },    
    };

    slotsContainer.querySelectorAll('.story-director-select').forEach(select => {
        settings.slots.push({
            slot: Number(select.dataset.slot),
            task: select.value,
        });
    });

    localStorage.setItem(
        'story-director-suggestion-settings',
        JSON.stringify(settings)
    );

    console.log('[Story Director] Suggestion settings saved:', settings);
}

function getStoryDirectorSlotSettings() {
    const saved =
        localStorage.getItem(
            'story-director-suggestion-settings'
        );

    if (!saved) {
        return [];
    }

    try {
        const settings = JSON.parse(saved);

        return Array.isArray(settings.slots)
            ? settings.slots.map(slot => ({ ...slot, task: normalizeStoryDirectorTask(slot.task) }))
            : [];
    } catch (error) {
        console.error(
            '[Story Director] Slot settings could not be read:',
            error
        );

        return [];
    }
}

window.testStoryDirectorSlotSettings = () => {
    return getStoryDirectorSlotSettings();
};

function getStoryDirectorTaskLabel(task) {
    const labels = {
        random: 'Zufällig',
        positive: 'Positiver Verlauf',
        negative: 'Negativer Verlauf',
        gore: 'Gore / Gewalt',
        danger: 'Gefahr',
        twist: 'Twist',
        romance: 'Romantik',
        relationship: 'Beziehung',
        character: 'Charakterentwicklung',
        mystery: 'Mystery',
        horror: 'Horror',
        conflict: 'Konflikt',
        humor: 'Humor',
        worldbuilding: 'Worldbuilding',
        consequence: 'Konsequenz',
        'story-thread': 'Storyfaden',
    };

    task = normalizeStoryDirectorTask(task);
    return labels[task] || task || 'Zufällig';
}

function getStoryDirectorTwistInstruction(task) {
    const instructions = {
        random:
            'Wähle zuerst eine passende dramaturgische Twist-Richtung aus dem aktuellen Storykontext. Die Richtung kann zum Beispiel Romantik, Beziehung, Konflikt, Gefahr, Mystery, Charakterentwicklung, Konsequenz oder eine andere sinnvolle Wendung sein. Entwickle anschließend einen Twist in dieser Richtung.',

        positive:
            'Der Twist soll eine unerwartet positive Wendung erzeugen, die sich glaubwürdig aus der bisherigen Geschichte ergibt. Die positive Entwicklung soll nicht wie ein zufälliges Geschenk wirken.',

        negative:
            'Der Twist soll eine unerwartete negative Wendung erzeugen, zum Beispiel einen Rückschlag, eine Komplikation, einen Verlust, eine Enthüllung oder neuen Druck. Die Wendung muss zur bisherigen Geschichte passen.',

        gore:
            'Der Twist soll, sofern es zur Geschichte passt, eine unerwartete Wendung mit Gewalt oder Gore enthalten. Die Gewalt soll dramaturgisch relevant sein und nicht nur zur Effekthascherei dienen.',

        danger:
            'Der Twist soll eine unerwartete Gefahr oder Bedrohung offenbaren oder eine bestehende Gefahr in ein neues Licht rücken.',

        twist:
            'Der Twist soll eine besonders überraschende Wendung darstellen, die eine bestehende Situation, Information oder Erwartung der Geschichte auf unerwartete Weise verändert.',

        romance:
            'Der Twist soll eine unerwartete romantische Wendung erzeugen. Er kann bestehende Gefühle vertiefen, eine bisher anders verstandene Beziehung verändern, ein verborgenes emotionales Detail offenbaren oder eine romantische Situation in eine neue Richtung lenken. Erfinde keine Gefühle oder Beziehungen ohne Grundlage im Storykontext.',

        relationship:
            'Der Twist soll eine bestehende Beziehung zwischen Charakteren überraschend verändern oder neu interpretieren. Die Veränderung muss sich aus bisherigen Interaktionen, Konflikten oder gemeinsamen Erlebnissen ergeben.',

        character:
            'Der Twist soll eine überraschende Charakterentwicklung ermöglichen. Eine bestehende Eigenschaft, Erinnerung, Motivation oder Entscheidung einer Figur soll dadurch in ein neues Licht gerückt werden.',

        mystery:
            'Der Twist soll ein bestehendes Rätsel, einen Hinweis oder eine offene Frage überraschend neu interpretieren. Eine neue Information soll die bisherige Bedeutung verändern, ohne unbegründete Lore zu erfinden.',

        horror:
            'Der Twist soll eine unerwartete unheimliche oder bedrohliche Wendung erzeugen. Etwas bereits Bekanntes, Sichergeglaubtes oder scheinbar Harmloses kann dabei eine andere Bedeutung bekommen.',

        conflict:
            'Der Twist soll einen bestehenden oder entstehenden Konflikt unerwartet verändern oder verschärfen. Die Wendung soll aus den Interessen, Handlungen oder Beziehungen der beteiligten Charaktere entstehen.',

        humor:
            'Der Twist soll eine unerwartet humorvolle Wendung erzeugen, die zu den Charakteren und der bisherigen Situation passt. Der Humor darf die bestehende Charakterisierung nicht zerstören.',

        worldbuilding:
            'Der Twist soll eine überraschende Erkenntnis über die Welt, einen Ort, eine Gruppe, ihre Regeln oder ihre Geschichte liefern. Die Information muss mit dem vorhandenen Worldbuilding vereinbar sein.',

        consequence:
            'Der Twist soll eine unerwartete Konsequenz eines bereits geschehenen Ereignisses oder einer früheren Entscheidung enthüllen. Die Verbindung soll rückblickend nachvollziehbar sein.',

        'story-thread':
            'Der Twist soll einen bereits bestehenden offenen Storyfaden überraschend weiterentwickeln. Eine bisher nebensächliche Information oder ein offener Punkt kann dabei eine neue Bedeutung bekommen.',
    };

    return instructions[normalizeStoryDirectorTask(task)] || instructions.random;
}

function getStoryDirectorTaskInstruction(task) {
    const instructions = {
        random:
            'Wähle selbst eine passende dramaturgische Richtung, die sich natürlich aus der aktuellen Geschichte ergibt.',

        positive:
            'Der Event-Vorschlag soll einen positiven dramaturgischen Verlauf ermöglichen, ohne künstlich oder unrealistisch zu wirken.',

        negative:
            'Der Event-Vorschlag soll einen negativen dramaturgischen Verlauf ermöglichen, zum Beispiel durch einen Rückschlag, Konflikt, Verlust, Druck oder eine unerwartete Komplikation.',

        gore:
            'Der Event-Vorschlag soll Gewalt oder Gore als relevantes dramaturgisches Element enthalten, sofern dies zur aktuellen Geschichte passt.',

        danger:
            'Der Event-Vorschlag soll eine konkrete Gefahr oder Bedrohung einführen, die zur aktuellen Geschichte passt.',

        twist:
            'Der Event-Vorschlag soll eine überraschende Wendung enthalten, die sich trotzdem nachvollziehbar aus der bisherigen Geschichte entwickeln kann.',

        romance:
            'Der Event-Vorschlag soll einen romantischen dramaturgischen Fokus haben und die bestehende Beziehung oder emotionale Nähe sinnvoll weiterentwickeln.',

        relationship:
            'Der Event-Vorschlag soll die Beziehung zwischen bestehenden Charakteren weiterentwickeln oder verändern.',

        character:
            'Der Event-Vorschlag soll die persönliche Entwicklung eines bestehenden Charakters voranbringen.',

        mystery:
            'Der Event-Vorschlag soll ein Rätsel, eine offene Frage oder ein verborgenes Detail der Geschichte weiterentwickeln.',

        horror:
            'Der Event-Vorschlag soll eine passende unheimliche oder bedrohliche Entwicklung enthalten.',

        conflict:
            'Der Event-Vorschlag soll einen bestehenden oder neuen Konflikt zwischen Figuren oder Interessen weiterentwickeln.',

        humor:
            'Der Event-Vorschlag soll eine humorvolle Situation erzeugen, die zu den Charakteren und der aktuellen Geschichte passt.',

        worldbuilding:
            'Der Event-Vorschlag soll einen relevanten Aspekt der Welt, ihrer Regeln, Orte, Gruppen oder Geschichte erweitern.',

        consequence:
            'Der Event-Vorschlag soll eine nachvollziehbare Konsequenz aus einem bereits geschehenen Ereignis oder einer bestehenden Entscheidung entwickeln.',

        'story-thread':
            'Der Event-Vorschlag soll einen bereits bestehenden offenen Storyfaden aufgreifen und sinnvoll weiterführen.',
    };

    return instructions[normalizeStoryDirectorTask(task)] || instructions.random;
}

window.testStoryDirectorTaskInstruction = () => {
    const slots = getStoryDirectorSlotSettings();

    return slots.map(slot => ({
        slot: slot.slot,
        task: slot.task,
        instruction: getStoryDirectorTaskInstruction(slot.task),
    }));
};

window.testStoryDirectorTaskLabel = () => {
    const slots = getStoryDirectorSlotSettings();

    return slots.map(slot => ({
        slot: slot.slot,
        task: slot.task,
        label: getStoryDirectorTaskLabel(slot.task),
    }));
};

function loadSuggestionSettings() {
    const saved = localStorage.getItem(
        'story-director-suggestion-settings'
    );

    if (!saved) {
        return null;
    }

    try {
        const settings = JSON.parse(saved);
        if (Array.isArray(settings.slots)) settings.slots = settings.slots.map(slot => ({ ...slot, task: normalizeStoryDirectorTask(slot.task) }));
        return settings;
    } catch (error) {
        console.warn(
            '[Story Director] Could not load suggestion settings:',
            error
        );

        return null;
    }
}