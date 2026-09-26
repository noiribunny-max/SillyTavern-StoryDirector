const HUD_POSITION_KEY = 'story-director-hud-position';

const storyDirectorState = {
    suggestions: [],
    activeSuggestion: null,
    activeInstruction: null,
    eventGenerationInProgress: false,
};

async function generateDirectorResponse(prompt, maxTokens) {
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

    try {
        const result = await connectionService.sendRequest(
    profileId,
    prompt,
    maxTokens,
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

        if (typeof result === 'string') {
            return result;
        }

        if (result?.content) {
            return result.content;
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
            <div class="story-director-empty">
                Noch kein Vorschlag vorhanden.
                <br>
                <span>Die weise Eule wartet auf ihren Einsatz. 🦉</span>
            </div>
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
    formattedContext = null
) {

    const tokenSelect =
        document.getElementById(
            'story-director-tokens-event'
        );

    const maxTokens =
        Number(tokenSelect?.value) || 800;

    const taskInstruction =
        getStoryDirectorTaskInstruction(
            slot.task
        );

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

    const prompt = `
Du bist der Story Director eines langfristigen RPGs.

Du entwickelst aus dem folgenden Story-Kontext EINE konkrete Idee
für ein mögliches zukünftiges Story-Event.

=== AKTUELLER STORY-KONTEXT ===

${formattedContext}

=== DRAMATURGISCHER FOKUS ===

${taskInstruction}

=== AUFGABE ===

Erzeuge EIN konkretes Story-Event, das sich natürlich aus der
bisherigen Geschichte entwickeln kann.

WICHTIGE REGELN:

- Berücksichtige den bisherigen Chatverlauf und die aktuelle Situation.
- Berücksichtige relevante Lorebook-Informationen.
- Berücksichtige den Doom Tracker.
- Baue möglichst auf bestehenden Charakterbeziehungen,
  offenen Situationen und Handlungsfäden auf.
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

    const response =
        await generateDirectorResponse(
            prompt,
            maxTokens
        );

    console.log(
        '[Story Director] Event slot generated:',
        {
            slot: slot.slot,
            task: slot.task,
            response,
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

    /*
     * Der erste echte Director-Test:
     * Nur "Event" verwendet bereits die KI.
     */
    if (action === 'event') {
        const tokenSelect =
            document.getElementById('story-director-tokens-event');

        const maxTokens =
            Number(tokenSelect?.value) || 800;

                if (storyDirectorState.eventGenerationInProgress) {
        console.log(
            '[Story Director] Event generation already running.'
        );
        return;
    }

    storyDirectorState.eventGenerationInProgress = true;

        result.innerHTML = `
            <div class="story-director-placeholder">
                <strong>🎲 Event wird generiert...</strong>

                <p>
                    🦉 Die Eule denkt nach...
                </p>
            </div>
        `;

        try {
          
            const storyContext = await getStoryDirectorContext({
    chatLimit: 100,
});

async function generateStoryDirectorEvents() {
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

    const results = [];

    for (const slot of slots) {
        const result =
            await generateEventForSlot(
                slot,
                formattedContext
            );

        results.push(result);
    }

    console.log(
        '[Story Director] All event slots generated:',
        results
    );

    return results;
}

const formattedContext =
    formatStoryDirectorContextForPrompt(storyContext);

    const slotSettings = getStoryDirectorSlotSettings();

const slot1 =
    slotSettings.find(slot => slot.slot === 1) ?? {
        slot: 1,
        task: 'random',
    };

const slot1Instruction =
    getStoryDirectorTaskInstruction(slot1.task);

const prompt = `
Du bist der Story Director eines langfristigen RPGs.

Du entwickelst aus dem folgenden Story-Kontext EINE konkrete Idee
für ein mögliches zukünftiges Story-Event.

=== AKTUELLER STORY-KONTEXT ===

${formattedContext}

=== AUFGABE ===

=== DRAMATURGISCHER FOKUS ===

${slot1Instruction}

Erzeuge EIN konkretes Story-Event, das sich natürlich aus der
bisherigen Geschichte entwickeln kann.

WICHTIGE REGELN:

- Berücksichtige den bisherigen Chatverlauf und die aktuelle Situation.
- Berücksichtige relevante Lorebook-Informationen.
- Berücksichtige den Doom Tracker.
- Baue möglichst auf bereits bestehenden Charakterbeziehungen,
  offenen Situationen und Handlungsfäden auf.
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

[Konkrete Beschreibung des Ereignisses in 2–5 Absätzen.]
`;

const response =
    await generateDirectorResponse(
        prompt,
        maxTokens
    );

result.innerHTML = `
    <div class="story-director-result-card">
        <strong>🎲 Event-Vorschlag</strong>

        <div class="story-director-result-text"></div>
    </div>
`;

const textElement =
    result.querySelector('.story-director-result-text');

if (textElement) {
    textElement.textContent = response;
}



console.log(
    '[Story Director] Event generated:',
    response
);

storyDirectorState.eventGenerationInProgress = false;

} catch (error) {
    result.innerHTML = `
        <div class="story-director-placeholder">
            <strong>❌ Fehler bei der Generierung</strong>

            <p>
                Die Eule konnte keine Antwort bekommen.
            </p>

            <small>
                Sieh in der Browser-Konsole nach.
            </small>
        </div>
    `;

    console.error(
        '[Story Director] Event generation failed:',
        error
    );
}
storyDirectorState.eventGenerationInProgress = false;

return;
}

/*
 * Die anderen Funktionen bleiben vorerst Platzhalter.
 */
result.innerHTML = `
    <div class="story-director-placeholder">
        <strong>${name}</strong>

        <p>
            Diese Funktion kommt als Nächstes. 🦉
        </p>

        <small>
            Die Verbindung zur KI funktioniert bereits.
        </small>
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
            select.value = savedSlot.task;
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
            ? settings.slots
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
        storythread: 'Storyfaden',
    };

    return labels[task] || task || 'Zufällig';
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

        storythread:
            'Der Event-Vorschlag soll einen bereits bestehenden offenen Storyfaden aufgreifen und sinnvoll weiterführen.',
    };

    return instructions[task] || instructions.random;
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
        return JSON.parse(saved);
    } catch (error) {
        console.warn(
            '[Story Director] Could not load suggestion settings:',
            error
        );

        return null;
    }
}