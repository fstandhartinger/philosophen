# On-demand answer speech

Implemented entirely on Sandy on 2026-09-12 for the existing application `u6fc5idncuehuouqihmhwo29` at https://philosophen.app.mintapis.com. Runtime source version: `747cd0002bf3b489`. Deployment verification is recorded below after release.

## Behavior

Only completed assistant answers have a Vorlesen button. A real click activates/resumes Web Audio immediately, then downloads and decodes the answer; a small spinner remains visible until playback is ready. Pause, resume and replay reuse the same audio. One controller owns playback and the pending request. Selecting another answer stops the first. Changing philosopher, clearing or unmounting aborts requests, stops audio, closes contexts and revokes blob URLs; generation epochs reject late results. No request is made when messages arrive or during the chat loading placeholder.

Speech text comes from the rendered Markdown DOM: paragraph/list content and link labels remain, formatting syntax and link destinations are not spoken. No response is truncated. At most three recordings and 64 MiB of encoded plus retained decoded audio are cached in the tab, never localStorage. An individual oversized decoded recording uses native media controls instead. Decoding itself may temporarily allocate additional memory. After eviction or changing philosopher, a subsequent click generates again.

Native HTML audio controls are offered when the audio context is unavailable or remains blocked. Tested automatic playback in real desktop Chromium and mobile Chromium emulation after an artificial 1.6-second delay, with `--autoplay-policy=user-gesture-required`, no autoplay-disabling flags. Physical iPhone/Safari was not tested. WebKit browser download was attempted but its Linux system libraries are absent; its run is explicitly skipped, not represented as iOS validation. Browser/OS policy or backgrounding can still require another tap.

## Provider and safeguards

Live ElevenLabs documentation and account voice/model catalogs were fetched directly from Sandy **before implementation**. Evidence: `evidence/tts/docs-source.json`, `voices.json`, `models.json`; complete documentation HTML retained outside Git at `/home/flori/task-logs/philosophen-tts/api-docs.html`.

- Male: George, `JBFqnCBsd6RMkjVDRZzb`, standard warm narrative voice, for sokrates/aristoteles/epikur/kant/nietzsche/camus.
- Female: Sarah, `EXAVITQu4vr4xnSDxMaL`, standard reassuring/professional voice, for arendt/beauvoir.
- Model: `eleven_multilingual_v2`, German supported by its live catalog, `language_code: de`; output `mp3_44100_128`. These are standard catalog voices, not historical identities or cloned voices. Both catalog voices are natively labeled English; actual German generation with the multilingual model was verified, not a claim of native German voice certification.
- Versioned same-origin `POST /api/speech`; server alone determines voice. `ELEVENLABS_API_KEY` upserted through the normal Sandy MCP write-only environment operation. No secret value is in frontend code, evidence or logs. `/etc/sandy-paas/mcp.env` was not read.
- Maximum complete input 16,000 characters (ample for the unchanged chat model's 1,400-token output budget). Longer input is rejected explicitly. Inputs over 8,000 characters are split without losing content and synthesized sequentially below the provider's 10,000-character maximum; MP3 segments are concatenated.
- Separate speech limits: 6 requests/minute/IP, 60,000 characters/day/IP, 300,000 characters/day globally; one inflight/IP and three globally. Paid attempts reserve character budget before provider calls; failed/aborted attempts are not refunded. Bounds are per process in memory and reset on restart; they are cost containment, not authentication or durable billing limits. No server audio cache or deduplication was added.
- 90-second whole-operation timeout, disconnect cancellation, streamed 16 MiB audio bound, provider status/content-type/signature/empty validation. Frontend additionally decodes before playback and supports retry. Requests and API responses are `no-store`; service worker excludes all APIs.

## Validation and evidence

- `npm test`: 48 passed, including 7 new backend cases covering all voices, origin/input/version, lossless long splitting, timeout/retry, invalid media/provider failure, budgets/concurrency and disconnect abort. Injectable backend fetch avoids network in these tests. `evidence/tts/backend-tests.log`.
- `tests/speech-browser.mjs`: desktop/mobile delayed real WebAudio playback, no eager request, plain-text/persona payload, spinner, pause/resume/replay without regeneration, switch cancellation and stale-response suppression, clear, retry, native fallback controls, no mobile overflow. `evidence/tts/browser-results.json`, `*-loading.png`, `*-playing.png`.
- Existing backend/browser/PWA tests: 37 browser checks, 9 follow-up dialog cases, 16 PWA upgrade checks passed. Installability reports no Chromium installability or manifest errors. Evidence in `evidence/browser-results.json`, `followup-local-results.json`, `pwa-upgrade-results.json`, `installability.json`. A fresh source-derived build was restored after the PWA A/B build test.
- Live provider German audio: `evidence/tts/live-male.mp3` (7.105 s), `live-female.mp3` (6.583 s), with ffprobe JSON proving valid MP3/44.1kHz. Production evidence is appended after deployment.
- OpenCode `chutes/moonshotai/Kimi-K3-TEE` was given a narrow backend/test task capped at 180 seconds. It used the window reading context without producing files; the coordinator took over at timeout. Log: `/home/flori/task-logs/philosophen-tts/kimi-backend.log`. Supervisor: `/home/flori/task-logs/philosophen-tts/run.log`.

The exact title “Armins und seine Philosophen Kumpels.”, Ja/Nein installation invitation and three-day cooldown are unchanged. No models, persona prompts, art, gift media or Telegram sends were changed.

## Finished production release

Final deployed application revision: `449145a13f8ba0f826cc25b1e1d32bca7b95e4d9` (implementation `ac35dcf` plus strict philosopher-type validation; its targeted 7 backend tests also pass in `evidence/tts/speech-final-tests.log`). Deployment `ijchxyhendgekjxzbxpolzn5` finished at 2026-09-12 15:54:51 UTC. Sandy reports `running:healthy`. `evidence/tts/deployment.json` records the MCP result.

Public HTTPS health, API and actual browser runtime agree on **`747cd0002bf3b489`**. After the deployment completed, `tests/speech-production.mjs` exercised real assistant responses, actual button taps, the real same-origin ElevenLabs endpoint, spinner and automatic WebAudio playback on mobile Chromium with gesture policy enabled:

| Persona | HTTP | Audio bytes | ffprobe duration | Click-to-ready check |
|---|---:|---:|---:|---:|
| Sokrates / George | 200 | 229,085 | 14.289 s | 3.257 s |
| Hannah Arendt / Sarah | 200 | 329,395 | 20.558 s | 4.313 s |

Both pause/resume operations reused their recordings, for exactly two speech requests during this successful run. No browser errors, no horizontal overflow and no API entries in the service-worker Cache API. `evidence/tts/production-results.json` includes actual versioned text/persona payloads. Production loading/playing screenshots were visually inspected. MP3s and ffprobe outputs are `evidence/tts/production-{male,female}.mp3[.json]`; the fixture is captured from the very Blob that the UI decodes/plays, avoiding an empty body returned by Playwright's network response inspection. This test instrumentation adds no speech requests and changes no app behavior.

The final documentation/evidence commit follows the deployed code commit; it changes only tests, report and evidence, not runtime source. No additional deploy is needed for those artifacts. Temporary test servers were stopped. No physical phone/autoplay guarantee is claimed.
