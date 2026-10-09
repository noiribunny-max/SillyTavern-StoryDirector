# Eule: Vorschläge und eigene API

## Implementierung und Befund

Eule ist diese eigenständige Erweiterung: https://github.com/noiribunny-max/SillyTavern-StoryDirector.
Inventar enthält lediglich einen Integrationsadapter und wurde nicht verändert.

Der bisherige Retry setzte Math.min(maxTokens, 1000). Das erklärt eine mögliche Ausgabegrenze von 1000 bei eingestellten 1600; die konkrete Termux-Anfrage wurde hier nicht beobachtet. 151036 Eingabetokens stammen nicht von der Ausgabegrenze. Der Director fordert derzeit bis zu 100 Chatnachrichten sowie relevante Lore und Doom-Kontext an; das kann große Eingaben verursachen.

Der Retry behält jetzt das konfigurierte Budget. Numerische Felder erlauben jede positive sichere ganze Zahl; Anbieterlimits gelten weiter. Ungültige Eingaben werden nicht gespeichert. Die Hauptverbindung wird nicht umgestellt und erhält keine pauschale reasoning_effort-Überschreibung mehr.

Die Anfrage nutzt extractData=false, damit finish_reason und usage erhalten bleiben, sofern Host und Anbieter diese liefern. Ohne Metadaten bleibt der Abbruchgrund unbekannt. Unterstützte Antwortformen: OpenAI choices, Ollama message/response, direkte Texte sowie ältere content/text-Antworten. length/max_tokens wird auch bei vorhandenem Teiltext als Fehler behandelt; kein Teilvorschlag wird übernommen. Fehlerdiagnosen zeigen angeforderte und gemeldete Tokenzahlen, niemals rohe Anbieterfehler, Inhalte oder Schlüssel.

Event/Twist-Prompts verlangen pro Slot eine konkrete spielbare Idee in 2–4 Sätzen ohne Begründung, Bewertung, Alternativen oder Fragen. Der Parser entfernt explizite Thinking-Blöcke und separat überschriebene Kommentare und weist erkennbar ungültige Formate zurück. Er garantiert keine semantische Qualität; Satzgrenzen bei Abkürzungen sind eine bekannte Einschränkung. Es gibt keinen automatischen Ausarbeitungsaufruf.

## Lokale Verifikation

Aus dem Repository ausführen:

    node tests/generation.test.mjs
    node tests/local.test.mjs
    node tests/settings.test.mjs

Alle drei Suiten bestanden. Tests verwenden simulierte ST-/DOM-/Providerantworten und prüfen Tokenweitergabe einschließlich Retry, raw/extracted/native Antwortformen, length/empty/Request-Fehler, Parser, einzelne Slotfehler, Kontext/Slotrichtungen, Bearbeiten/Übernehmen/Abbruch, erhaltene Einstellungen sowie unveränderte Hauptprofilwahl. Kein realer Anbieter wurde angefragt.

## Noch ausstehender Test in SillyTavern / Termux

1. Erweiterung aktualisieren und SillyTavern neu laden. Vorher Slotrichtungen und Hauptmodell notieren.
2. Eigene Ausgabegrenzen aktivieren. Event auf 1600 und Twist auf einen freien Wert wie 2345 setzen. Einstellungen schließen/öffnen und Werte prüfen; 0, negative Zahlen und Brüche müssen abgewiesen werden.
3. Event und Twist jeweils mit Konflikt und Negativer Verlauf erzeugen, einmal ohne und einmal mit Richtung. Pro erfolgreichem Slot eine konkrete Idee in 2–4 Sätzen prüfen. Keine Begründung, Bewertung, Alternativen oder Frage. Loregrenzen und Spielerfreiheit prüfen.
4. Bei einem Anbieterabbruch muss der Slot finish_reason=length und bekannte Tokenzahlen anzeigen. Der Slot darf keinen Übernehmen-Button erhalten; andere Slots laufen weiter. Ohne gelieferten Abbruchgrund darf keine Ursache behauptet werden.
5. Bei leerer Ausgabe die beiden Anfragen anhand der sicheren Antwortdiagnose vergleichen: beide müssen denselben angeforderten Wert nennen. Die tatsächliche Anbietergrenze zusätzlich im Server prüfen, ohne Zugangsdaten zu teilen.
6. Erfolgreichen Vorschlag bearbeiten und übernehmen; RPG-Fortsetzung und Rundenreset prüfen. Hauptmodell/-Profil müssen gleich bleiben.
7. Auf dem Handy Eingabefelder, Fehlermeldungen, Scrollen und vorhandene Schaltflächen prüfen. Story retten und Director-Zeitsprung kurz auf bestehendes Verhalten prüfen. Inventar-Zeitbug und Quiz bleiben außerhalb dieses Tests.

## Block 2: konkrete separate API-Integration (noch nicht implementiert)

Umfang verlangt einen eigenen geprüften Anbieterpfad und sichere Schlüsselspeicherung; diese reine Browser-Erweiterung besitzt dafür noch keinen Backend-Endpunkt. Deshalb kein provisorischer Cloud-Schlüssel in localStorage und kein direkter ungeprüfter Browser-Fetch.

1. Opt-in-Verbindung in Director-Einstellungen: standardmäßig Hauptprofil. Zunächst ein separat ausgewähltes vorhandenes ST-Connection-Manager-Profil verwenden. Dieses kann API-Adresse, Modell und Secret-ID bereits verwalten, ohne selectedProfile umzuschalten. Verfügbarkeit der installierten ST-Version prüfen. Nur die Profil-ID speichern; Schlüssel im ST-Secret-Store belassen. Keine Schlüssel exportieren oder loggen. Beim Profilfehler abbrechen, nicht unbemerkt auf die RPG-Verbindung zurückfallen.
2. Falls direkte Director-Felder für URL/Key benötigt werden: ST-seitigen Backend-/Secret-Store-Pfad separat implementieren und prüfen. Eingabe als Passwort, nur Speichern/Ersetzen/Löschen, kein Klartext-Lesen. HTTPS für Cloud; explizite lokale HTTP-Unterstützung. Keine Schlüssel oder URLs mit eingebetteten Zugangsdaten in Diagnosen. Kein beliebiger Proxy-Weitertransport.
3. Anbieterformat ausdrücklich auswählen: OpenAI-kompatibel oder Ollama-nativ. Modell-ID frei eingeben; optionale Modellliste nur per Nutzerklick. OpenAI nutzt messages/max_tokens, Ollama messages/options.num_predict. Denken separat und standardmäßig ohne Override; think=false oder reasoning_effort nur bei nachgewiesener Unterstützung des ausgewählten Anbieters und Modells. Nicht global abschalten.
4. Testverbindung nur per Klick: statische kurze Testnachricht ohne Chat, Lore, Doom oder Inventar. Vorher Zielanbieter und Modell anzeigen; keinen Test automatisch beim Öffnen/Speichern durchführen. Zeitlimit/Abbruch, HTTP-Fehlerklassen, Antwortformat, finish reason und sichere Zählwerte anzeigen.
5. Separater Kontextfilter: standardmäßig begrenzte jüngere Nachrichten, relevante Lore und ausdrücklich aktivierte Zusatzquellen. Quellen-/Wissensgrenzen erhalten. Zeichen-/Tokenbudget transparent anzeigen, Auslassungen kennzeichnen und bei fehlender Grundlage keine Fakten erfinden. Keine vollständigen 100 Nachrichten als Standard für externe Vorschläge. Nutzer muss externe Nutzung aktiv einschalten, bevor Storydaten an das Ziel gehen.
6. Tests mit simulierten Anbietern für beide Formate, fehlende Profile/Keys, Auth-/Netz-/Rate-/Timeoutfehler, Tokenlimit, Thinking-Fähigkeiten, Datenfilter, Key-Redaktion und unveränderte Hauptverbindung. Danach reale Testverbindung und Vorschläge auf Desktop/Mobil erst mit Nutzerkonfiguration prüfen.
7. Optionaler Twist-ausarbeiten-Button als eigener späterer Schritt: nur Klick löst Anfrage aus; aktuellen bearbeiteten Vorschlag und denselben freigegebenen Kontext verwenden, Ausgangsidee erhalten und Ausarbeitung separat anzeigen.

Offizielle Schnittstellenreferenz (geprüft):
https://github.com/SillyTavern/SillyTavern/blob/release/public/scripts/extensions/shared.js
