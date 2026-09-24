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

function createStoryDirectorPanel() {
    // Verhindert doppelte Panels beim erneuten Laden
    if (document.getElementById('story-director-panel')) {
        return;
    }

    const panel = document.createElement('div');
    panel.id = 'story-director-panel';
    panel.className = 'story-director-panel';

    panel.innerHTML = `
        <div class="story-director-header">
            <div class="story-director-title">
                🦉 Story Director
            </div>
            <div class="story-director-subtitle">
                Der kleine Regisseur deiner Geschichte
            </div>
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
        </div>

        <div class="story-director-result" id="story-director-result">
            <div class="story-director-empty">
                Noch kein Vorschlag vorhanden.
                <br>
                <span>Die weise Eule wartet auf ihren Einsatz. 🦉</span>
            </div>
        </div>
    `;

    document.body.appendChild(panel);

    panel.querySelectorAll('.story-director-button').forEach(button => {
        button.addEventListener('click', () => {
            handleDirectorAction(button.dataset.action);
        });
    });

    console.log('[Story Director] UI created!');
}

function handleDirectorAction(action) {
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

    result.innerHTML = `
        <div class="story-director-placeholder">
            <strong>${name}</strong>
            <p>
                Diese Funktion kommt als Nächstes. 🦉
            </p>
            <small>
                Die Oberfläche funktioniert bereits –
                jetzt bekommt der Director sein Gehirn.
            </small>
        </div>
    `;

    console.log(`[Story Director] Action: ${action}`);
}