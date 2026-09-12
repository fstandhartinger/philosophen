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

## Produktionsressource (12.09.2026)

- URL: https://philosophen.app.mintapis.com
- Repository: https://github.com/fstandhartinger/philosophen
- Coolify-App UUID: `u6fc5idncuehuouqihmhwo29` (nur diese Ressource ändern).
- Erster erfolgreicher Deploy: `zcgfzdcjvap9zl5zu8wyypyp`, Quellrevision `f3d0e7d9595a741aba14255f5e1ba1df2150b9ee`, Inhaltsversion `3821e9f99cb399fa`.
- Docker: Node 22 Alpine, nicht privilegierter node-Nutzer, Port 3000, 1 CPU, 512 MB RAM (128 MB Reservation), Healthcheck GET /healthz, kein automatisches Deployment bei Push.
- Standardgrenzen: 4.000 Zeichen/Nachricht, 12.000 Zeichen/Kontext, 24 Nachrichten; 20 Chats/min/IP, 120/Tag/IP; 8 Transkriptionen/min/IP, 60/Tag/IP; global 1.000 Anbieteranfragen/Tag geteilt über Chat/Audio. Max. 8 Chats und 4 Audioanfragen gleichzeitig, überzählige Anfragen werden mit 503 abgewiesen. Max. 12 MB Audio, Aufnahme stoppt nach 60 Sekunden. 25 Sekunden pro Modellversuch, maximal 100 Sekunden gesamt, Groq 35 Sekunden.
- Private Proxy-Hops werden vertraut; der letzte nicht vertrauenswürdige Hop bestimmt die IP. Server logs enthalten keine Gesprächsinhalte oder Schlüssel.

## Verifikation reproduzieren

`npm test` (41 deterministische Tests). Nach `npm run build` und Start des Servers: `BASE_URL=http://localhost:3000 node tests/browser.mjs` (37 Browserprüfungen). `node tests/pwa-upgrade.mjs` baut zwei Versionen und startet ausschließlich eigene Testprozesse auf Port 3107; anschließend mit `npm run build` die normale Inhaltsversion wiederherstellen. Kein paralleler lokaler Build während dieses Tests.

`BASE_URL=https://philosophen.app.mintapis.com HEADED=1 xvfb-run -a node tests/installability.mjs` nutzt ein frisches normales Chromium-Profil; Inkognito erlaubt keine PWA-Installation. `node tests/production-audio.mjs` verwendet einen deutschen WAV-Testton als Browser-Mikrofonquelle und ruft tatsächlich Groq über Produktion auf. `python3 scripts/verify-production.py https://philosophen.app.mintapis.com evidence/test-de.mp3` ruft alle acht Personas und Groq live auf (Anbieterkosten).

## Medien reproduzieren

- Porträts: Prompts in `deliverables/art-portraits/prompts.jsonl`, erzeugt mit dem imagegen-Skill-CLI, dessen Modellstandard `gpt-image-2` explizit geprüft wurde. `scripts/art-convert-webp.py` optimiert vorhandene Originale auf 640px, `scripts/art-brand.py` erzeugt das Phi-Logo/Icons und lädt lokale OFL-Schriften.
- Karten: `python3 -m venv scripts/.venv-media`, dort `pip install reportlab qrcode pillow pymupdf opencv-python-headless`, dann `scripts/.venv-media/bin/python scripts/gift_cards.py`. Druck in Originalgröße 100 %, ohne Randlos-Vergrößerung; A6 148 × 105 mm. Die PNGs sind 1748 × 1240 Pixel mit 300-dpi-Metadaten. Alle QR-Codes werden dekodiert geprüft.
- Film: Narration `deliverables/narration.txt`, George `JBFqnCBsd6RMkjVDRZzb`, `eleven_multilingual_v2`. Animation `scripts/gift-explainer/anim.html` mit deterministischem `seekTo(t)`. Beim Skill-Buildskript `NODE_PATH=/home/flori/Dev/chutes/philosophen/node_modules` setzen. Die Animation nutzt auf die 53,812 Sekunden Tonspur abgestimmte Zeitmarken.
