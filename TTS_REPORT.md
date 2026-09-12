# On-demand answer speech

Implemented entirely on Sandy on 2026-09-12 for the existing application `u6fc5idncuehuouqihmhwo29` at https://philosophen.app.mintapis.com. Runtime source version: `1a7856ee09b5ff3a`. Deployment verification is recorded below after release.

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
