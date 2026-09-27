const HUD_POSITION_KEY = 'story-director-hud-position';

const storyDirectorState = {
    suggestions: [],
    activeSuggestion: null,
    activeInstruction: null,
    eventGenerationInProgress: false,
    timeSkipSelection: null,
    timeSkipYearMode: 'real',
    timeSkipGenerationInProgress: false,
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

            <div class="story-director-timeskip-settings" id="story-director-timeskip-settings" style="display:none;">
                <div class="story-director-section-title">
                    ⏩ Zeitsprung festlegen
                </div>

                <div class="story-director-timeskip-mode">
                    <label class="story-director-radio-label">
                        <input
                            type="radio"
                            name="story-director-timeskip-mode"
                            value="date"
                            checked
                        >
                        🗓️ Konkretes Datum
                    </label>

                    <label class="story-director-radio-label">
                        <input
                            type="radio"
                            name="story-director-timeskip-mode"
                            value="duration"
                        >
                        ⏩ Dauer
                    </label>
                </div>

                <div id="story-director-timeskip-date-fields">
                    <label class="story-director-setting-label" for="story-director-timeskip-year-mode">
                        Jahresformat
                    </label>
                    <select
                        id="story-director-timeskip-year-mode"
                        class="story-director-select"
                    >
                        <option value="real">Echtes Jahr (2026)</option>
                        <option value="fictional">Fiktives Jahr (XX26)</option>
                    </select>

                    <div class="story-director-timeskip-date-hint">
                        Beim fiktiven Format kannst du z. B. <strong>14.05.XX12</strong> eingeben.
                    </div>

                    <label class="story-director-setting-label" for="story-director-timeskip-start">
                        Von
                    </label>
                    <input
                        type="text"
                        id="story-director-timeskip-start"
                        class="story-director-input"
                        placeholder="14.05.2026"
                        inputmode="numeric"
                    >

                    <label class="story-director-setting-label" for="story-director-timeskip-end">
                        Bis
                    </label>
                    <input
                        type="text"
                        id="story-director-timeskip-end"
                        class="story-director-input"
                        placeholder="20.10.2026"
                        inputmode="numeric"
                    >
                </div>

                <div id="story-director-timeskip-duration-fields" style="display:none;">
                    <label class="story-director-setting-label" for="story-director-timeskip-number">
                        Anzahl
                    </label>
                    <input
                        type="number"
                        id="story-director-timeskip-number"
                        class="story-director-input"
                        min="1"
                        step="1"
                        value="1"
                    >

                    <label class="story-director-setting-label" for="story-director-timeskip-unit">
                        Einheit
                    </label>
                    <select
                        id="story-director-timeskip-unit"
                        class="story-director-select"
                    >
                        <option value="days">Tage</option>
                        <option value="weeks">Wochen</option>
                        <option value="months">Monate</option>
                        <option value="years">Jahre</option>
                    </select>
                </div>

                <button
                    type="button"
                    class="story-director-button"
                    id="story-director-timeskip-continue"
                >
                    ✓ Zeitraum übernehmen
                </button>

                <button
                    type="button"
                    class="story-director-button"
                    data-action="timeskip-generate"
                >
                    ⏩ Zeitsprung erstellen
                </button>

                <div
                    id="story-director-timeskip-status"
                    class="story-director-timeskip-status"
                    style="display:none;"
                ></div>
            </div>

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
    setupTimeSkipSettings(panel);



    panel.querySelectorAll('.story-director-button[data-action]').forEach(button => {
        button.addEventListener('click', () => {
            handleDirectorAction(button.dataset.action);
        });
    });

    console.log('[Story Director] UI created!');
}

function setupTimeSkipSettings(panel) {
    const settings = panel.querySelector(
        '#story-director-timeskip-settings'
    );

    if (!settings) {
        return;
    }

    const modeInputs = settings.querySelectorAll(
        'input[name="story-director-timeskip-mode"]'
    );

    const yearMode = settings.querySelector(
        '#story-director-timeskip-year-mode'
    );

    const startInput = settings.querySelector(
        '#story-director-timeskip-start'
    );

    const endInput = settings.querySelector(
        '#story-director-timeskip-end'
    );

    const updateYearMode = () => {
        const fictional = yearMode?.value === 'fictional';

        if (startInput) {
            startInput.placeholder = fictional
                ? '14.05.XX12'
                : '14.05.2026';
        }

        if (endInput) {
            endInput.placeholder = fictional
                ? '20.10.XX12'
                : '20.10.2026';
        }

        storyDirectorState.timeSkipYearMode =
            fictional ? 'fictional' : 'real';
    };

    if (yearMode) {
        yearMode.addEventListener('change', updateYearMode);
    }

    const dateFields = settings.querySelector(
        '#story-director-timeskip-date-fields'
    );

    const durationFields = settings.querySelector(
        '#story-director-timeskip-duration-fields'
    );

    const updateMode = () => {
        const mode = settings.querySelector(
            'input[name="story-director-timeskip-mode"]:checked'
        )?.value;

        const isDateMode = mode === 'date';

        if (dateFields) {
            dateFields.style.display =
                isDateMode ? 'block' : 'none';
        }

        if (durationFields) {
            durationFields.style.display =
                isDateMode ? 'none' : 'block';
        }
    };

    modeInputs.forEach(input => {
        input.addEventListener('change', updateMode);
    });

    const continueButton = settings.querySelector(
        '#story-director-timeskip-continue'
    );

    const status = settings.querySelector(
        '#story-director-timeskip-status'
    );

    if (continueButton) {
        continueButton.addEventListener('click', () => {
            const mode = settings.querySelector(
                'input[name="story-director-timeskip-mode"]:checked'
            )?.value;

            try {
                const selection =
                    getStoryDirectorTimeSkipSelection(settings, mode);

                storyDirectorState.timeSkipSelection = selection;

                if (status) {
                    status.style.display = 'block';
                    status.textContent =
                        `✓ ${selection.label}`;
                }

                console.log(
                    '[Story Director] Time Skip selection:',
                    selection
                );
            } catch (error) {
                if (status) {
                    status.style.display = 'block';
                    status.textContent =
                        `⚠️ ${error.message}`;
                }

                console.warn(
                    '[Story Director] Time Skip selection invalid:',
                    error
                );
            }
        });
    }

    updateMode();
    updateYearMode();
}

function getStoryDirectorTimeSkipSelection(settings, mode) {
    if (mode === 'date') {
        const startText = settings.querySelector(
            '#story-director-timeskip-start'
        )?.value?.trim();

        const endText = settings.querySelector(
            '#story-director-timeskip-end'
        )?.value?.trim();

        const yearMode =
            settings.querySelector(
                '#story-director-timeskip-year-mode'
            )?.value === 'fictional'
                ? 'fictional'
                : 'real';

        if (!startText || !endText) {
            throw new Error(
                'Bitte Start- und Enddatum eingeben.'
            );
        }

        const start = parseStoryDirectorDateText(
            startText,
            yearMode
        );

        const end = parseStoryDirectorDateText(
            endText,
            yearMode
        );

        if (!start || !end) {
            throw new Error(
                yearMode === 'fictional'
                    ? 'Bitte ein gültiges Datum wie 14.05.XX12 eingeben.'
                    : 'Bitte ein gültiges Datum wie 14.05.2026 eingeben.'
            );
        }

        if (end.date <= start.date) {
            throw new Error(
                'Das Enddatum muss nach dem Startdatum liegen.'
            );
        }

        const days = Math.round(
            (end.date.getTime() - start.date.getTime()) /
            (1000 * 60 * 60 * 24)
        );

        return {
            mode: 'date',
            yearMode,
            startDate: formatStoryDirectorDateInput(
                start.date,
                yearMode
            ),
            endDate: formatStoryDirectorDateInput(
                end.date,
                yearMode
            ),
            startDisplay: formatStoryDirectorDisplayDate(
                start.date,
                yearMode
            ),
            endDisplay: formatStoryDirectorDisplayDate(
                end.date,
                yearMode
            ),
            days,
            label: `${formatStoryDirectorDisplayDate(start.date, yearMode)} → ${formatStoryDirectorDisplayDate(end.date, yearMode)} (${days} Tage)`,
        };
    }

    if (mode === 'duration') {
        const numberValue = settings.querySelector(
            '#story-director-timeskip-number'
        )?.value;

        const unit = settings.querySelector(
            '#story-director-timeskip-unit'
        )?.value;

        const amount = Number(numberValue);

        if (!Number.isInteger(amount) || amount < 1) {
            throw new Error(
                'Bitte eine ganze Zahl größer als 0 eingeben.'
            );
        }

        const unitLabels = {
            days: amount === 1 ? 'Tag' : 'Tage',
            weeks: amount === 1 ? 'Woche' : 'Wochen',
            months: amount === 1 ? 'Monat' : 'Monate',
            years: amount === 1 ? 'Jahr' : 'Jahre',
        };

        if (!unit || !unitLabels[unit]) {
            throw new Error(
                'Bitte eine gültige Zeiteinheit auswählen.'
            );
        }

        const storyDate = getStoryDirectorCurrentStoryDate();

        if (!storyDate) {
            throw new Error(
                'Ich konnte kein eindeutiges Story-Datum finden. Bitte nutze einmal „Konkretes Datum“, damit der Zeitsprung einen festen Ausgangspunkt hat.'
            );
        }

        const endDate = addStoryDirectorDuration(
            storyDate.date,
            amount,
            unit
        );

        const yearMode = storyDate.yearMode;
        const startValue = formatStoryDirectorDateInput(
            storyDate.date,
            yearMode
        );
        const endValue = formatStoryDirectorDateInput(
            endDate,
            yearMode
        );

        const days = Math.round(
            (endDate.getTime() - storyDate.date.getTime()) /
            (1000 * 60 * 60 * 24)
        );

        return {
            mode: 'duration',
            amount,
            unit,
            yearMode,
            startDate: startValue,
            endDate: endValue,
            startDisplay: formatStoryDirectorDisplayDate(
                storyDate.date,
                yearMode
            ),
            endDisplay: formatStoryDirectorDisplayDate(
                endDate,
                yearMode
            ),
            days,
            label: `${amount} ${unitLabels[unit]} → ${formatStoryDirectorDisplayDate(storyDate.date, yearMode)} → ${formatStoryDirectorDisplayDate(endDate, yearMode)}`,
        };
    }

    throw new Error(
        'Kein gültiger Time-Skip-Modus ausgewählt.'
    );
}

function parseStoryDirectorDateText(value, yearMode = 'real') {
    const text = String(value ?? '').trim();

    let match = text.match(
        /^(\d{1,2})\.(\d{1,2})\.(XX)?(\d{1,6})$/i
    );

    if (!match) {
        match = text.match(
            /^(\d{4,6})-(\d{1,2})-(\d{1,2})$/
        );

        if (match) {
            const year = Number(match[1]);
            const month = Number(match[2]);
            const day = Number(match[3]);
            const date = createValidStoryDirectorDate(
                year,
                month,
                day
            );

            return date
                ? {
                    date,
                    yearMode: yearMode === 'fictional'
                        ? 'fictional'
                        : 'real',
                }
                : null;
        }

        return null;
    }

    const day = Number(match[1]);
    const month = Number(match[2]);
    const hasXX = Boolean(match[3]);
    const year = Number(match[4]);

    if (yearMode === 'fictional' && !hasXX) {
        // Im fiktiven Modus akzeptieren wir auch 14.05.12
        // und behandeln die Jahreszahl als reine Story-Jahreszahl.
    }

    if (yearMode === 'real' && hasXX) {
        return null;
    }

    const date = createValidStoryDirectorDate(
        year,
        month,
        day
    );

    return date
        ? {
            date,
            yearMode: hasXX || yearMode === 'fictional'
                ? 'fictional'
                : 'real',
        }
        : null;
}

function formatStoryDirectorDate(value) {
    const parsed = parseStoryDirectorDateText(
        value,
        'real'
    );

    if (!parsed) {
        return String(value);
    }

    return formatStoryDirectorDisplayDate(
        parsed.date,
        parsed.yearMode
    );
}

function formatStoryDirectorDisplayDate(date, yearMode = 'real') {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    return yearMode === 'fictional'
        ? `${day}.${month}.XX${String(year).padStart(2, '0')}`
        : `${day}.${month}.${year}`;
}

function formatStoryDirectorDateInput(date, yearMode = 'real') {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return yearMode === 'fictional'
        ? `XX${String(year).padStart(2, '0')}-${month}-${day}`
        : `${String(year).padStart(4, '0')}-${month}-${day}`;
}

function addStoryDirectorDuration(startDate, amount, unit) {
    const result = new Date(startDate.getTime());

    if (unit === 'days') {
        result.setDate(result.getDate() + amount);
        return result;
    }

    if (unit === 'weeks') {
        result.setDate(result.getDate() + amount * 7);
        return result;
    }

    if (unit === 'months') {
        const originalDay = result.getDate();
        result.setDate(1);
        result.setMonth(result.getMonth() + amount);

        const lastDay = new Date(
            result.getFullYear(),
            result.getMonth() + 1,
            0
        ).getDate();

        result.setDate(Math.min(originalDay, lastDay));
        return result;
    }

    if (unit === 'years') {
        const originalMonth = result.getMonth();
        const originalDay = result.getDate();

        result.setDate(1);
        result.setFullYear(
            result.getFullYear() + amount
        );
        result.setMonth(originalMonth);

        const lastDay = new Date(
            result.getFullYear(),
            originalMonth + 1,
            0
        ).getDate();

        result.setDate(Math.min(originalDay, lastDay));
        return result;
    }

    throw new Error('Unbekannte Zeiteinheit.');
}

function getStoryDirectorCurrentStoryDate() {
    const context = SillyTavern.getContext();
    const chat = context.chat ?? [];

    const recentText = chat
        .slice(-100)
        .filter(message =>
            message &&
            typeof message.mes === 'string' &&
            !message.is_system
        )
        .map(message => message.mes)
        .join('\n');

    const matches = [];

    const fictionalGermanPattern =
        /\b(\d{1,2})\.(\d{1,2})\.XX(\d{1,6})\b/gi;

    let match;

    while (
        (match = fictionalGermanPattern.exec(recentText)) !== null
    ) {
        const date = createValidStoryDirectorDate(
            Number(match[3]),
            Number(match[2]),
            Number(match[1])
        );

        if (date) {
            matches.push({
                index: match.index,
                date,
                yearMode: 'fictional',
            });
        }
    }

    const fictionalIsoPattern =
        /\bXX(\d{1,6})-(\d{1,2})-(\d{1,2})\b/gi;

    while (
        (match = fictionalIsoPattern.exec(recentText)) !== null
    ) {
        const date = createValidStoryDirectorDate(
            Number(match[1]),
            Number(match[2]),
            Number(match[3])
        );

        if (date) {
            matches.push({
                index: match.index,
                date,
                yearMode: 'fictional',
            });
        }
    }

    const isoPattern =
        /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g;

    while ((match = isoPattern.exec(recentText)) !== null) {
        const date = createValidStoryDirectorDate(
            Number(match[1]),
            Number(match[2]),
            Number(match[3])
        );

        if (date) {
            matches.push({
                index: match.index,
                date,
                yearMode: 'real',
            });
        }
    }

    const germanPattern =
        /\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b/g;

    while ((match = germanPattern.exec(recentText)) !== null) {
        const date = createValidStoryDirectorDate(
            Number(match[3]),
            Number(match[2]),
            Number(match[1])
        );

        if (date) {
            matches.push({
                index: match.index,
                date,
                yearMode: 'real',
            });
        }
    }

    matches.sort((a, b) => a.index - b.index);

    return matches.length
        ? matches[matches.length - 1]
        : null;
}

function createValidStoryDirectorDate(year, month, day) {
    const date = new Date(0);
    date.setHours(0, 0, 0, 0);
    date.setFullYear(year, month - 1, day);

    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return null;
    }

    date.setHours(0, 0, 0, 0);
    return date;
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

window.testStoryDirectorAllEvents = async () => {
    return await generateStoryDirectorEvents();
};

async function generateTwistForSlot(
    slot,
    formattedContext = null
) {
    const tokenSelect =
        document.getElementById(
            'story-director-tokens-twist'
        );

    const maxTokens =
        Number(tokenSelect?.value) || 1400;

    const taskInstruction =
    getStoryDirectorTwistInstruction(slot.task);

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
Du bist der Story Director eines laufenden RPGs.

Deine Aufgabe ist es, eine einzelne mögliche TWIST-Idee
für die nächste Entwicklung der Geschichte zu entwerfen.

=== AKTUELLER STORY-KONTEXT ===

${formattedContext}

=== GEWÜNSCHTE DRAMATURGISCHE RICHTUNG ===

${taskInstruction}

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

    const response =
        await generateDirectorResponse(
            prompt,
            maxTokens
        );

    console.log(
        '[Story Director] Twist slot generated:',
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

window.testStoryDirectorTwistSlot = async () => {
    const slots =
        getStoryDirectorSlotSettings();

    const slot1 =
        slots.find(slot => slot.slot === 1) ?? {
            slot: 1,
            task: 'random',
        };

    return await generateTwistForSlot(slot1);
};

async function generateStoryDirectorTwists() {
    console.log(
        '[Story Director] Generating all twist slots...'
    );

    const slots =
        getStoryDirectorSlotSettings();

    if (!slots.length) {
        throw new Error(
            '[Story Director] Keine Twist-Slots konfiguriert.'
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
            await generateTwistForSlot(
                slot,
                formattedContext
            );

        results.push(result);
    }

    console.log(
        '[Story Director] All twist slots generated:',
        results
    );

    return results;
}

window.testStoryDirectorAllTwists = async () => {
    return await generateStoryDirectorTwists();
};

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

async function generateStoryDirectorTimeSkip(selection = null) {
    const chosenSelection =
        selection ?? storyDirectorState.timeSkipSelection;

    if (!chosenSelection) {
        throw new Error(
            'Bitte zuerst einen Zeitraum festlegen und übernehmen.'
        );
    }

    const tokenSelect =
        document.getElementById(
            'story-director-tokens-timeskip'
        );

    const maxTokens =
        Number(tokenSelect?.value) || 1200;

    const storyContext =
        await getStoryDirectorContext({
            chatLimit: 100,
            loreLimit: 20,
        });

    const formattedContext =
        formatStoryDirectorContextForPrompt(
            storyContext
        );

    const yearWarning =
        chosenSelection.yearMode === 'fictional'
            ? 'Das verwendete Jahr ist fiktiv. Behandle XX-Jahreszahlen ausschließlich als Story-Zeitrechnung und wandle sie niemals in reale Jahreszahlen um.'
            : 'Verwende die angegebenen realen Jahreszahlen unverändert.';

    const prompt = `
Du bist der Story Director eines langfristigen RPGs.

Deine Aufgabe ist es, einen bereits festgelegten ZEITSPRUNG zwischen zwei Story-Daten erzählerisch sinnvoll zu füllen.

=== ZEITSPRUNG ===
Start: ${chosenSelection.startDisplay}
Ende: ${chosenSelection.endDisplay}
Dauer: ${chosenSelection.days} Tage
${yearWarning}

=== AKTUELLER STORY-KONTEXT ===

${formattedContext}

=== AUFGABE ===

Erstelle eine kompakte Zusammenfassung dessen, was WÄHREND dieses gesamten Zeitraums passiert sein könnte bzw. passiert ist.

Der Zeitsprung soll sich wie eine glaubwürdige Weiterentwicklung der bereits laufenden Geschichte anfühlen. Nutze dafür vor allem bestehende Charaktere, Beziehungen, offene Situationen, bereits angedeutete Handlungsfäden, Lorebook-Fakten und den Doom Tracker.

WICHTIGE REGELN:
- Der Zeitraum wird vollständig übersprungen. Schreibe keine normale Szene und keine Schritt-für-Schritt-Erzählung.
- Erfinde nicht für jeden Tag oder Monat ein Ereignis. Nenne nur Entwicklungen, die für die Geschichte relevant sind.
- Behalte bestehende Namen, Charaktereigenschaften, Beziehungen und Lorebook-Fakten bei.
- Überschreibe keine bestehenden Fakten.
- Wenn der Kontext keine konkrete Entwicklung für einen Bereich hergibt, darfst du eine kleine plausible Entwicklung ergänzen, aber keine großen neuen Fakten, Figuren oder Wendungen ohne Grundlage erfinden.
- Große Veränderungen sollen nachvollziehbar aus dem bisherigen Verlauf entstehen.
- Lass wichtige Spielerentscheidungen offen, wenn sie aus dem Kontext nicht feststehen.
- Beende den Zeitraum mit dem neuen erzählerischen Status der Geschichte.
- Bei sehr langen Zeiträumen darfst du Entwicklungen zeitlich bündeln, statt viele einzelne Ereignisse aufzuzählen.
- Schreibe auf Deutsch.
- Keine Analyse des Prompts.
- Keine Erklärung deiner Denkweise.
- Keine fertige RPG-Szene.
- Keine Dialoge.
- Keine inneren Monologe.
- Keine Liste mit möglichen Alternativen.

=== FORMAT ===

# ⏩ Zeitsprung: ${chosenSelection.startDisplay} → ${chosenSelection.endDisplay}

## ❤️ Beziehungen
Welche relevanten Veränderungen oder Entwicklungen gab es zwischen wichtigen Charakteren?

## 🧠 Charakterentwicklung
Welche wichtigen persönlichen Entwicklungen, Erfahrungen oder Veränderungen gab es?

## ⚔️ Wichtige Ereignisse
Welche relevanten Ereignisse, Konflikte, Gefahren oder Erfolge fanden statt?

## 🎯 Storyfäden & Konsequenzen
Welche offenen Handlungsfäden wurden weitergeführt und welche Folgen früherer Ereignisse wurden sichtbar?

## 🌍 Welt & Umfeld
Welche für die Geschichte relevanten Veränderungen gab es im Umfeld oder in der Welt?

## 📌 Stand am Ende des Zeitsprungs
Wo stehen die wichtigen Figuren und die Geschichte jetzt?

Halte die einzelnen Abschnitte kompakt. Der gesamte Output soll ungefähr 250–500 Wörter umfassen.
`;

    const response =
        await generateDirectorResponse(
            prompt,
            maxTokens
        );

    console.log(
        '[Story Director] Time Skip generated:',
        {
            selection: chosenSelection,
            response,
        }
    );

    return {
        selection: chosenSelection,
        response,
    };
}

window.testStoryDirectorTimeSkip = async () => {
    return await generateStoryDirectorTimeSkip();
};

async function handleDirectorAction(action) {
    if (action === 'timeskip') {
        const settings = document.getElementById(
            'story-director-timeskip-settings'
        );

        if (settings) {
            settings.style.display =
                settings.style.display === 'none'
                    ? 'block'
                    : 'none';
        }

        return;
    }

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
    if (storyDirectorState.eventGenerationInProgress) {
        console.log(
            '[Story Director] Event generation already running.'
        );
        return;
    }

    storyDirectorState.eventGenerationInProgress = true;

    result.innerHTML = `
        <div class="story-director-placeholder">
            <strong>🎲 Events werden generiert...</strong>

            <p>
                🦉 Die Eule denkt nach...
            </p>
        </div>
    `;

    try {
        const events =
            await generateStoryDirectorEvents();

        result.innerHTML = '';

events.forEach(event => {
    const card =
        document.createElement('div');

    card.className =
        'story-director-result-card';

    const title =
        document.createElement('strong');

    title.textContent =
        `🎲 ${event.label}`;

    const text =
        document.createElement('div');

    text.className =
        'story-director-result-text';

    text.textContent =
        event.response;

    const actions =
        document.createElement('div');

    actions.className =
        'story-director-result-actions';

    const editButton =
        document.createElement('button');

    editButton.className =
        'story-director-button story-director-edit-button';

    editButton.type = 'button';
    editButton.textContent = '✏️ Bearbeiten';

    editButton.addEventListener('click', () => {
    const textarea =
        document.createElement('textarea');

    textarea.className =
        'story-director-edit-textarea';

    textarea.value =
        event.response;

    textarea.rows = 8;

    text.replaceWith(textarea);

    editButton.textContent =
        '💾 Speichern';

    editButton.classList.add(
        'story-director-save-button'
    );

    editButton.onclick = () => {
    event.response =
        textarea.value;

    textarea.replaceWith(text);

    text.textContent =
        event.response;

    editButton.textContent =
        '✏️ Bearbeiten';

    editButton.classList.remove(
        'story-director-save-button'
    );

    editButton.onclick = null;
};

});

    const acceptButton =
        document.createElement('button');

    acceptButton.className =
        'story-director-button story-director-accept-button';

    acceptButton.type = 'button';
    acceptButton.textContent = '✓ Übernehmen';

    acceptButton.addEventListener('click', async () => {
    const suggestion = event.response.trim();

    if (!suggestion) {
        console.warn(
            '[Story Director] Cannot accept empty suggestion.'
        );
        return;
    }

    try {
        acceptButton.disabled = true;
        acceptButton.textContent = '⏳ Wird übernommen...';

        const context = SillyTavern.getContext();

        await context.generate(
            `Nutze den folgenden Story-Director-Vorschlag als konkrete Vorgabe für die nächste RPG-Szene.

WICHTIG:
- Setze den Vorschlag in der nächsten Antwort erzählerisch um.
- Behalte alle bestehenden Charaktereigenschaften, Namen, Beziehungen und Lorebook-Fakten bei.
- Der Vorschlag darf bestehende Fakten nicht überschreiben.
- Schreibe die normale RPG-Szene direkt weiter.
- Erkläre nicht, dass ein Story-Director-Vorschlag verwendet wurde.

STORY-DIRECTOR-VORSCHLAG:
${suggestion}`,
            false
        );
        
result.innerHTML = `
    <div class="story-director-placeholder">
        <strong>🦉 Story Director bereit</strong>

        <p>
            Wähle eine Aktion, um neue Story-Ideen zu erhalten.
        </p>
    </div>
`;

    } catch (error) {
        console.error(
            '[Story Director] Accept generation failed:',
            error
        );

        acceptButton.disabled = false;
        acceptButton.textContent = '✓ Übernehmen';
    }
});

    actions.appendChild(editButton);
    actions.appendChild(acceptButton);

    card.appendChild(title);
    card.appendChild(text);
    card.appendChild(actions);

    result.appendChild(card);
});

        console.log(
            '[Story Director] Event cards rendered:',
            events
        );

    } catch (error) {
        result.innerHTML = `
            <div class="story-director-placeholder">
                <strong>❌ Fehler bei der Generierung</strong>

                <p>
                    Die Eule konnte keine Events erzeugen.
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
    } finally {
        storyDirectorState.eventGenerationInProgress = false;
    }

    return;
}

if (action === 'twist') {
    if (storyDirectorState.twistGenerationInProgress) {
        console.log(
            '[Story Director] Twist generation already running.'
        );
        return;
    }

    storyDirectorState.twistGenerationInProgress = true;

    result.innerHTML = `
        <div class="story-director-placeholder">
            <strong>🌀 Twists werden generiert...</strong>

            <p>
                🦉 Die Eule denkt nach...
            </p>
        </div>
    `;

    try {
        const twists =
            await generateStoryDirectorTwists();

        result.innerHTML = '';

        twists.forEach(twist => {
            const card =
                document.createElement('div');

            card.className =
                'story-director-result-card';

            const title =
                document.createElement('strong');

            title.textContent =
                `🌀 ${twist.label}`;

            const text =
                document.createElement('div');

            text.className =
                'story-director-result-text';

            text.textContent =
                twist.response;

            const actions =
                document.createElement('div');

            actions.className =
                'story-director-result-actions';

            const editButton =
                document.createElement('button');

            editButton.className =
                'story-director-button story-director-edit-button';

            editButton.type = 'button';
            editButton.textContent = '✏️ Bearbeiten';

            editButton.addEventListener('click', () => {
                const textarea =
                    document.createElement('textarea');

                textarea.className =
                    'story-director-edit-textarea';

                textarea.value =
                    twist.response;

                textarea.rows = 8;

                text.replaceWith(textarea);

                editButton.textContent =
                    '💾 Speichern';

                editButton.classList.add(
                    'story-director-save-button'
                );

                editButton.onclick = () => {
                    twist.response =
                        textarea.value;

                    textarea.replaceWith(text);

                    text.textContent =
                        twist.response;

                    editButton.textContent =
                        '✏️ Bearbeiten';

                    editButton.classList.remove(
                        'story-director-save-button'
                    );

                    editButton.onclick = null;
                };
            });

            const acceptButton =
                document.createElement('button');

            acceptButton.className =
                'story-director-button story-director-accept-button';

            acceptButton.type = 'button';
            acceptButton.textContent = '✓ Übernehmen';

            acceptButton.addEventListener('click', async () => {
                const suggestion =
                    twist.response.trim();

                if (!suggestion) {
                    console.warn(
                        '[Story Director] Cannot accept empty twist.'
                    );
                    return;
                }

                try {
                    acceptButton.disabled = true;
                    acceptButton.textContent =
                        '⏳ Wird übernommen...';

                    const context =
                        SillyTavern.getContext();

                    await context.generate(
                        `Nutze den folgenden Story-Director-Twist als konkrete Vorgabe für die nächste RPG-Szene.

WICHTIG:
- Setze die Wendung in der nächsten Antwort erzählerisch um.
- Behalte alle bestehenden Charaktereigenschaften, Namen, Beziehungen und Lorebook-Fakten bei.
- Der Twist darf bestehende Fakten nicht überschreiben.
- Schreibe die normale RPG-Szene direkt weiter.
- Erkläre nicht, dass ein Story-Director-Twist verwendet wurde.

STORY-DIRECTOR-TWIST:
${suggestion}`,
                        false
                    );

                    result.innerHTML = `
                        <div class="story-director-placeholder">
                            <strong>🦉 Story Director bereit</strong>

                            <p>
                                Wähle eine Aktion, um neue Story-Ideen zu erhalten.
                            </p>
                        </div>
                    `;

                } catch (error) {
                    console.error(
                        '[Story Director] Twist accept generation failed:',
                        error
                    );

                    acceptButton.disabled = false;
                    acceptButton.textContent =
                        '✓ Übernehmen';
                }
            });

            actions.appendChild(editButton);
            actions.appendChild(acceptButton);

            card.appendChild(title);
            card.appendChild(text);
            card.appendChild(actions);

            result.appendChild(card);
        });

        console.log(
            '[Story Director] Twist cards rendered:',
            twists
        );

    } catch (error) {
        result.innerHTML = `
            <div class="story-director-placeholder">
                <strong>❌ Fehler bei der Generierung</strong>

                <p>
                    Die Eule konnte keine Twists erzeugen.
                </p>

                <small>
                    Sieh in der Browser-Konsole nach.
                </small>
            </div>
        `;

        console.error(
            '[Story Director] Twist generation failed:',
            error
        );

    } finally {
        storyDirectorState.twistGenerationInProgress = false;
    }

    return;
}

if (action === 'timeskip-generate') {
    if (storyDirectorState.timeSkipGenerationInProgress) {
        console.log(
            '[Story Director] Time Skip generation already running.'
        );
        return;
    }

    if (!storyDirectorState.timeSkipSelection) {
        const settings = document.getElementById(
            'story-director-timeskip-settings'
        );

        if (settings) {
            settings.style.display = 'block';
        }

        if (result) {
            result.innerHTML = `
                <div class="story-director-placeholder">
                    <strong>⏩ Zeitraum fehlt</strong>
                    <p>
                        Lege zuerst den Zeitraum fest und klicke auf
                        „✓ Zeitraum übernehmen“.
                    </p>
                </div>
            `;
        }

        return;
    }

    storyDirectorState.timeSkipGenerationInProgress = true;

    result.innerHTML = `
        <div class="story-director-placeholder">
            <strong>⏩ Zeitsprung wird erstellt...</strong>
            <p>🦉 Die Eule schaut nach, was in der Zwischenzeit passiert sein könnte...</p>
        </div>
    `;

    try {
        const timeSkip =
            await generateStoryDirectorTimeSkip();

        result.innerHTML = '';

        const card =
            document.createElement('div');

        card.className =
            'story-director-result-card';

        const title =
            document.createElement('strong');

        title.textContent =
            `⏩ ${timeSkip.selection.label}`;

        const text =
            document.createElement('div');

        text.className =
            'story-director-result-text';

        text.textContent =
            timeSkip.response;

        const actions =
            document.createElement('div');

        actions.className =
            'story-director-result-actions';

        const editButton =
            document.createElement('button');

        editButton.className =
            'story-director-button story-director-edit-button';
        editButton.type = 'button';
        editButton.textContent = '✏️ Bearbeiten';

        editButton.addEventListener('click', () => {
            const textarea =
                document.createElement('textarea');

            textarea.className =
                'story-director-edit-textarea';
            textarea.value =
                timeSkip.response;
            textarea.rows = 16;

            text.replaceWith(textarea);

            editButton.textContent =
                '💾 Speichern';
            editButton.classList.add(
                'story-director-save-button'
            );

            editButton.onclick = () => {
                timeSkip.response =
                    textarea.value;

                textarea.replaceWith(text);
                text.textContent =
                    timeSkip.response;

                editButton.textContent =
                    '✏️ Bearbeiten';
                editButton.classList.remove(
                    'story-director-save-button'
                );
                editButton.onclick = null;
            };
        });

        const acceptButton =
            document.createElement('button');

        acceptButton.className =
            'story-director-button story-director-accept-button';
        acceptButton.type = 'button';
        acceptButton.textContent = '✓ Übernehmen';

        acceptButton.addEventListener('click', async () => {
            const summary =
                timeSkip.response.trim();

            if (!summary) {
                return;
            }

            try {
                acceptButton.disabled = true;
                acceptButton.textContent =
                    '⏳ Wird übernommen...';

                const context =
                    SillyTavern.getContext();

                await context.generate(
                    `Der folgende Story-Director-Zeitsprung wurde für die laufende RPG-Geschichte erstellt.

Nutze ihn als verbindlichen Hintergrund für die nächste RPG-Szene.

WICHTIG:
- Die Ereignisse des Zeitsprungs gelten ab jetzt als Teil der Geschichte.
- Behalte alle bestehenden Charaktereigenschaften, Namen, Beziehungen und Lorebook-Fakten bei.
- Überschreibe keine bestehenden Fakten.
- Beginne die nächste normale RPG-Szene am Ende des angegebenen Zeitsprungs.
- Erzähle nicht noch einmal den gesamten Zeitsprung nach.
- Zeige stattdessen die aktuelle Situation und schreibe die RPG-Szene normal weiter.
- Erkläre nicht, dass ein Story Director verwendet wurde.

STORY-DIRECTOR-ZEITSPRUNG:
${summary}`,
                    false
                );

                result.innerHTML = `
                    <div class="story-director-placeholder">
                        <strong>🦉 Story Director bereit</strong>
                        <p>Der Zeitsprung wurde als neuer Hintergrund übernommen.</p>
                    </div>
                `;
            } catch (error) {
                console.error(
                    '[Story Director] Time Skip accept generation failed:',
                    error
                );

                acceptButton.disabled = false;
                acceptButton.textContent =
                    '✓ Übernehmen';
            }
        });

        actions.appendChild(editButton);
        actions.appendChild(acceptButton);

        card.appendChild(title);
        card.appendChild(text);
        card.appendChild(actions);

        result.appendChild(card);

        console.log(
            '[Story Director] Time Skip card rendered:',
            timeSkip
        );
    } catch (error) {
        result.innerHTML = `
            <div class="story-director-placeholder">
                <strong>❌ Fehler beim Time Skip</strong>
                <p>Die Eule konnte den Zeitsprung nicht erstellen.</p>
                <small>Sieh in der Browser-Konsole nach.</small>
            </div>
        `;

        console.error(
            '[Story Director] Time Skip generation failed:',
            error
        );
    } finally {
        storyDirectorState.timeSkipGenerationInProgress = false;
    }

    return;
}

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

        storythread:
            'Der Twist soll einen bereits bestehenden offenen Storyfaden überraschend weiterentwickeln. Eine bisher nebensächliche Information oder ein offener Punkt kann dabei eine neue Bedeutung bekommen.',
    };

    return instructions[task] || instructions.random;
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