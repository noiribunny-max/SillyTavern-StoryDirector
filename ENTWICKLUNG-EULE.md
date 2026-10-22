# Eule – isolierter Entwicklungsstand 0.3.0-dev.1

Basis: develop 0.2.0, c7fc569ace2a8c43b40f0337c08f698cb4752c2f.
Arbeitszweig: feature/ideas-history-own-api. Uncommittiert, nicht veröffentlicht.

## Bedienung

1. Eule öffnen, Einstellungen wählen. Ein eigenes SillyTavern-Verbindungsprofil für Chat Completion / Custom (OpenAI-kompatibel) im Connection Manager anlegen. Den Schlüssel dort im SillyTavern-Secret-Store hinterlegen und dem Profil zuordnen. Nach neu angelegten Profilen die Seite neu laden.
2. Dieses Profil ausdrücklich unter „Eigene Eule-Verbindung“ wählen. Bei NanoGPT lautet die HTTPS-Basisadresse https://nano-gpt.com/api/v1. Modell und Temperatur festlegen; Ausgabegrenzen je Aufgabe darunter einstellen. Die aktuelle Entwicklungsgrenze beträgt 8192 Ausgabetokens. Eingabegrenzen zählen Zeichen, nicht exakte Tokens.
3. Verbindung speichern startet keine Anfrage. Der separate Verbindungstest verlangt einen Haken und sendet genau eine Anfrage mit höchstens 16 Ausgabetokens und ohne Chat-/Lorekontext. Anbietergebühren können entstehen. Keine automatischen Wiederholungen oder Hauptmodell-Fallbacks.
4. Event/Twist erzeugt je konfiguriertem Slot genau eine Anfrage (1–4). Time Skip, Story retten und gezieltes Neuplanen jeweils eine. Erzeugte Ideen werden vor der Übernahme gespeichert.
5. Annehmen, Ablehnen und Später sind reine Entscheidungen. Bearbeitungen werden versioniert. Erst der zusätzliche Haken und „Jetzt in RPG-Antwort umsetzen“ starten ausdrücklich die normale RPG-Generierung. Diese verwendet den regulären RPG-Anschluss des Hosts; das ist keine Ausweichverbindung für Eules eigene Ideenanfragen.
6. Historie öffnen: gespeicherte Ideen lassen sich wieder öffnen, bearbeiten und bewusst weiterentwickeln. Nach verändertem Chatverlauf ist für eine ältere Idee eine ausdrückliche erneute Kontextprüfung nötig. Ähnliche Plotmechaniken verlangen eine zusätzliche Bestätigung vor der Übergabe.
7. „Ausgespielt“ verlangt Annahme, ausdrückliche Bestätigung, Nachrichtennummer (hier 1-basiert einschließlich vorhandener Systemzeilen) und exaktes Zitat aus einer Assistant-Nachricht. Es ist ein Nutzerbeleg, keine automatische semantische Tatsachenprüfung. Geänderte Nachrichten/Swipes machen den Beleg veraltet.
8. Ein kopierter Storyzweig übernimmt keine Freigaben. Bei passender Karte und anderer Chatkennung kann ausdrücklich eine leere eigene Historie begonnen werden. Die kopierten Elterndaten bleiben in einem gesonderten, nicht ausgewerteten Bereich erhalten.

## Speichervertrag

Eigener Chat-Metadatenbereich: story-director.ideas.v1, Schema 1. Bindung: Chatkennung, Host-Integrität, gegebenenfalls Branchkennung und Kartenavatar. Gruppen-/temporäre Chats ohne verlässliche Bindung sind gesperrt.

Vor jeder Änderung: serverseitigen Chat lesend abrufen, Metadaten vergleichen, lokale Bindung und Quellenrevision prüfen. Danach ausschließlich den eigenen Bereich ändern, über saveMetadata speichern und unabhängig vom Server zurücklesen. Nur tatsächlich konfigurierte, fehlende Author-Note-Standardfelder und vollständig leere sticky/cooldown-Strukturen werden für den Vergleich normalisiert. Explizite Werte, tainted, echte Zeitereignisse und fremde Erweiterungsbereiche bleiben geschützt.

Unklare Schreibausgänge sperren weitere eigene Änderungen für die betroffene Bindung in dieser Laufzeit; PENDING/UNKNOWN-Übergaben bleiben nach Reload unbenutzbar. Nicht blind erneut generieren oder Sperren löschen. Der Host bietet keine serverseitige Compare-and-Swap-Transaktion: ein einzelner aktiver Schreiber ist vorausgesetzt. Parallelzugriffe mehrerer Tabs/Geräte sind nicht als atomar freigegeben.

Die Historie wird nicht automatisch gekürzt: höchstens 400 Ideen und 1,5 Millionen serialisierte Zeichen einschließlich separierter Elterndaten. Bei Erreichen der Grenze wird abgelehnt. Die Modellzusammenfassung verwendet die letzten 20 Ideen mit jeweils höchstens 1000 Zeichen; der lokale Ähnlichkeitsvergleich berücksichtigt die aktive gespeicherte Historie. Die Oberfläche zeigt 20 Ideen je Seite.

## Prüfung und Grenzen

Offline: `node --test tests/*.test.mjs`. Browser-Testdouble: `python -m http.server 8005 --bind 127.0.0.1`, dann `/tests/browser-fixture/`. Die Fixture ist keine SillyTavern-Installation und besitzt weder einen echten Schlüssel noch einen Modellanschluss. Sie schreibt ausschließlich künstliche Daten in den Local Storage ihrer eigenen Prüforigin.

Die semantische Erkennung ist eine lokale deutschsprachige Wort-/Motivheuristik. Sie erkennt manche Umformulierungen und kann falsch-positive oder übersehene Treffer haben. Keine Embeddings und keine versteckten KI-Bewertungsaufrufe. Timeskips verwenden belegten Chat-/Lorekontext und explizite Ergänzungen; keine neue Inventar-/Kalenderschnittstelle. Monats-/Jahressprünge begrenzen den Tag auf das Monatsende. XX-Jahre sind eine vereinfachte Konvention; beliebige Fantasy-Kalender werden nicht vollständig simuliert.

Noch offen: echter SillyTavern-End-to-End-Praxistest dieses neuen Entwicklungsstands mit unabhängigem Readback, ausdrücklich freigegebener NanoGPT-Livetest und Prüfung am Android-Gerät. Kein getesteter Termux-Installationspfad und keine Veröffentlichung dieses Standes.
