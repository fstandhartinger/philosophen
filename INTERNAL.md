# Betrieb

## Zuständigkeit

Eigenständige App `philosophen`, eigener Container und Git-Repository. Keine Änderungen an chutes-web oder fremden Deployments. Sandy MCP: zuerst get_platform_overview, Ressource prüfen, dann gezielt deployen. Die App benötigt keine persistenten Volumes.

## Release

1. `npm ci && npm test && npm run build`.
2. Browserprüfungen und ggf. Zwei-Build-Updateprüfung ausführen.
3. Änderungen committen/pushen; nur die UUID dieser App deployen.
4. Deployment-Endstatus, öffentliches HTTPS `/healthz`, `/api/version` und einen Chat prüfen.

Die Buildversion ist ein SHA-256-Präfix über src/server/public, Lockfile, HTML und Buildskript. Sie ist dadurch auch ohne .git im Docker-Build stabil. `BUILD_VERSION` ist nur für kontrollierte Update-Tests gedacht. Server und Client müssen denselben Build verwenden.

## Geheimnisse und Anbieter

Nur Laufzeitvariablen: CHUTES_API_KEY, OPENROUTER_API_KEY, GROQ_API_KEY. Quelle `~/.config/dev-secrets.env`, OpenRouter-Quellname OPEN_ROUTER_API_KEY. Nie `/etc/sandy-paas/mcp.env` lesen. ElevenLabs und Bildschlüssel dienen nur der lokalen Medienerzeugung; nicht in den App-Container übernehmen.

Aktuelle Modell-IDs erneut in den Anbieterkatalogen prüfen, wenn ein Modell ausfällt. Reihenfolge nicht stillschweigend ändern. Nach ID-Wechsel echte Antwort prüfen und `evidence/model-catalog-and-completions.json` aktualisieren. Der Free-Router wählt ein wechselndes kostenloses Modell.

## Grenzen

Einzelner Sandy-Host ohne Hochverfügbarkeitszusage. Gesprächsspeicher nur im Browser, beim Löschen der Browserdaten verloren. Öffentliche App mit begrenzter Nutzung; In-Memory-Begrenzer setzen bei Neustart zurück und sind für eine einzelne Instanz ausgelegt. Anbieterabhängige Kosten und Verfügbarkeit, kein Login. PWA-Offlinebetrieb erlaubt keine neuen KI-Antworten.

## Gestaltung und Medien

Kohärente generierte Porträts in public/portraits, Markenassets in public/icons. Modell-/Promptbelege in evidence/artwork*. Reproduzierbare Druck- und Videoquellen in scripts/gift* beziehungsweise deliverables. Telegram-Nachrichtenbelege werden von scripts/telegram.py ohne Schlüssel in evidence/telegram-deliveries.json geschrieben.
