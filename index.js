const HUD_POSITION_KEY = 'story-director-hud-position';

const storyDirectorState = {
    suggestions: [],
    activeSuggestion: null,
    activeInstruction: null,
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

    const search = searchText.toLowerCase();

    const words = search
        .split(/\s+/)
        .map(word => word.trim())
        .filter(word => word.length >= 3);

    const scoredEntries = entries.map(entry => {
        const keyText = [
            ...(entry.key ?? []),
            ...(entry.secondary ?? []),
        ]
            .join(' ')
            .toLowerCase();

        const commentText =
            (entry.comment ?? '').toLowerCase();

        const contentText =
            (entry.content ?? '').toLowerCase();

        let score = 0;

        for (const word of words) {
            if (keyText.includes(word)) {
                score += 10;
            }

            if (commentText.includes(word)) {
                score += 5;
            }

            if (contentText.includes(word)) {
                score += 1;
            }
        }

        if (entry.constant) {
            score += 2;
        }

        return {
            ...entry,
            score,
        };
    });

    return scoredEntries
        .filter(entry => entry.score > 0)
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
        10,
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
} = {}) {
    const chat = getStoryDirectorChatContext(chatLimit);

     const worldInfo =
    await getStoryDirectorWorldInfoContext(chatLimit);

    const loreEntries = [
        worldInfo.worldInfoString,
        worldInfo.worldInfoBefore,
        worldInfo.worldInfoAfter,
        ...(worldInfo.worldInfoExamples ?? []),
        ...(worldInfo.worldInfoDepth ?? []).flatMap(
            depthEntry => depthEntry.entries ?? []
        ),
    ]
        .filter(entry =>
            typeof entry === 'string' &&
            entry.trim()
        )
        .map(entry => entry.trim());

    const uniqueLoreEntries = [
        ...new Set(loreEntries),
    ];
    
    const doomTracker =
        getStoryDirectorDoomTrackerContext();
    return {
        chat,
        lore: uniqueLoreEntries,
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

const formattedContext =
    formatStoryDirectorContextForPrompt(storyContext);

const prompt = `
Du bist der Story Director eines langfristigen RPGs.

Du analysierst den folgenden aktuellen Story-Kontext und entwickelst
daraus EINE konkrete Idee für ein mögliches zukünftiges Story-Event.

=== AKTUELLER STORY-KONTEXT ===

${formattedContext}

=== AUFGABE ===

Erzeuge EINE konkrete Idee für ein mögliches zukünftiges Story-Event.

Wichtig:
- Berücksichtige den bisherigen Chatverlauf.
- Berücksichtige relevante Lorebook-Informationen.
- Berücksichtige den Doom Tracker.
- Das Event muss zur bisherigen Handlung und den beteiligten Charakteren passen.
- Wiederhole nicht einfach Ereignisse, die bereits passiert sind.
- Baue möglichst auf bestehenden Handlungsfäden, Beziehungen, Konflikten oder offenen Situationen auf.
- Keine endgültige Handlung für den Spieler festschreiben.
- Keine Meta-Erklärung über deine Analyse.
- Keine Aufzählung mehrerer Möglichkeiten.
- Die Idee soll als Inspiration für den Spieler dienen.
- Schreibe auf Deutsch.
- Sei konkret und erzählerisch.
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