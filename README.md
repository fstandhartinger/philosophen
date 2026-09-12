# Was würde der Philosoph sagen?

Ein persönliches Geburtstagsgeschenk für Armin: acht philosophische Perspektiven, erreichbar ohne Anmeldung unter **https://philosophen.app.mintapis.com**.

Sokrates, Aristoteles, Epikur, Immanuel Kant, Friedrich Nietzsche, Hannah Arendt, Simone de Beauvoir und Albert Camus antworten als ausdrücklich gekennzeichnete imaginative KI-Simulationen. Antworten sind keine historischen Zitate.

## Lokal starten

Node.js 22, `npm ci`, `npm run build`, `npm start` (Port 3000). Die Serverumgebung benötigt `CHUTES_API_KEY`, `OPENROUTER_API_KEY` und `GROQ_API_KEY`. Geheimnisse gehören ausschließlich in die Serverumgebung. Auf Sandy heißt der vorhandene OpenRouter-Vault-Eintrag `OPEN_ROUTER_API_KEY`; beim Deployment wird er dem erwarteten App-Namen zugeordnet.

`npm test` prüft Backendvalidierung, Rückfallreihenfolge und Fehlerpfade. Browser- und Produktionsnachweise liegen in `evidence/`; Druckkarten, QR und Video in `deliverables/`.

## Modelle

Strikte Reihenfolge, am 12.09.2026 jeweils per Live-Katalog und echter Completion geprüft:

1. Chutes `moonshotai/Kimi-K3-TEE`
2. Chutes `Qwen/Qwen3.8-27B-TEE`
3. OpenRouter `openrouter/free` (Modellwahl des Routers kann wechseln)
4. OpenRouter `openai/gpt-5.6-luna`

Fehler, Zeitüberschreitung und leere Antworten lösen den nächsten Versuch aus. Mikrofonaufnahmen transkribiert Groq `whisper-large-v3`; das Ergebnis bleibt vor dem Senden editierbar.

## Datenschutz und Installation

Gesprächsverlauf und Entwürfe werden im eigenen Browser gespeichert. Für Antworten werden die Gesprächsnachrichten an den tatsächlich verwendeten Modellanbieter übermittelt, für Transkription die Aufnahme an Groq. Die App besitzt kein Nutzerkonto und keine Gesprächsdatenbank. Anbieter können eigene Speicherungsregeln haben.

Die PWA bietet den echten Installationsdialog nur an, wenn der Browser ihn bereitstellt. Unter iOS erklärt sie „Teilen → Zum Home-Bildschirm“. Internet wird für Antworten und Transkription benötigt.

## Updates und Hosting

`scripts/build.mjs` berechnet eine Inhaltsversion, die Client, Server und Service Worker gemeinsam verwenden. API und HTML werden nicht gecacht; Updates erhalten Entwürfe und erfordern einen sicheren Neuladevorgang. Hosting erfolgt ausschließlich als eigene Docker-Anwendung auf Sandy/Coolify. Betriebsdetails und Grenzen: [INTERNAL.md](INTERNAL.md). Abgeschlossene Prüfung und Telegram-Lieferbelege: [FINAL_REPORT.md](FINAL_REPORT.md).
