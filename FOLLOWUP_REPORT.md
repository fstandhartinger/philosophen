# Follow-up · 12.09.2026

Production: https://philosophen.app.mintapis.com
Sandy app: `u6fc5idncuehuouqihmhwo29`
Source revision: `59bc7eec6e893693e1e7b5ac97f1ec8358e0e5c0`
Content version: `62624fc59a48a13d`
Deployment: `8iwpmeqmq4jfqyccxdctdzow` (finished; application running:healthy).

Automatic smartphone invitation uses an accessible native HTML dialog with exactly “Ja” and “Nein”. It checks once per second and on foreground/focus. No automatic desktop or standalone invitation; chat requests, recording/transcription, focused text inputs, other dialogs and update notices defer it. Nein, Escape, backdrop dismissal and native cancellation use a three-day cooldown (`philosophen-install-v1.dismissedAt` in guarded localStorage), including across reloads. Manual install bypasses cooldown. Ja consumes the saved beforeinstallprompt event, including a late event; otherwise it explains Safari Share → Add to Home Screen or Android browser-menu installation. Only appinstalled marks successful installation persistently. Storage failures retain the cooldown in memory; persistence across reloads cannot be guaranteed when browser storage is denied.

Brand text is exactly “Armins und seine Philosophen Kumpels.”; the main headline remains. All five requested texts and their empty elements were removed; repeated simulation wording in chat heading and privacy modal was removed. Actual data-processing explanations remain. Backend, personas, models and existing artwork/media were untouched.

Local validation: production build; 41 backend tests; 37 existing browser checks; 16 PWA upgrade checks; nine targeted browser scenarios covering cooldown boundary/reload/foreground, Ja/native cancellation/late event/iOS and Android fallback, standalone/desktop, modal/chat/recording deferral, dismissal, storage denial and mobile overflow. Normal headed Chromium reports no manifest/installability errors and a trusted beforeinstallprompt event. 

Public verification: HTTPS `/`, `/healthz`, manifest and service worker return 200; API and actual browser runtime both report `62624fc59a48a13d`. All nine targeted scenarios pass on the public URL, including both iOS standalone and Android display-mode stubs. See `evidence/followup-public-results.json` and `evidence/followup-public-https.json`. Public chat/audio behavior used mocked responses and a fake microphone; no provider generation was repeated.

Screenshots: `evidence/followup-local-360-invite.png`, `evidence/followup-local-390-home.png`, `evidence/followup-local-ios-instructions.png`. Public screenshots: `evidence/followup-public-360-invite.png`, `evidence/followup-public-390-home.png`, `evidence/followup-public-ios-instructions.png`.

Limit: mobile tests use Chromium device/user-agent emulation, including iOS fallback and standalone stubs. They do not prove installation on physical iOS Safari or Android devices. Real desktop Chromium installability was checked separately. No model/art/media generation, gift-file resend or Telegram message.
