# Update banner follow-up — 2026-09-12

Cause: `brand.css` changed the fixed banner to sticky while retaining `left:50%` and `translateX(-50%)`. On the public 390px viewport its left edge was -147px. No banner keyframe animation exists; the transform/cascade conflict caused the clipping.

Fix: one fixed, top-positioned banner rule with symmetric safe-area inline gutters, auto margins and maximum width; no centering transform. Text and button wrap, with a 44px minimum action height. Removed conflicting brand overrides. Visible brand and accessible name now use “Armins Philosophen Kumpels.” Existing update, storage and speech logic are unchanged.

Validation: 48 unit tests passed; existing real two-build PWA upgrade regression passed 16/16, including busy gating, draft retention, runtime upgrade and cache cleanup. Initial regression attempt encountered an occupied localhost port; successful isolated run used 127.0.0.1:13127.

`tests/update-banner.mjs` forces `/api/version` on the real component. 320/360/390/430 portrait, 844×390 landscape and 1440×900 desktop, at 100% and 200% root text size: 36 local idle/busy/refreshing states passed. Bounds include action, viewport centering, internal overflow and 30 insertion frames (zero banner animations). Refreshing uses a pending mock SW update to hold the real state. Chat requests are intercepted; no model calls. Keyboard activation sets up busy/cancel states; update action uses a real pointer click. Existing unrelated page overflow at 200% is measured before insertion; banner must add none.

Evidence: `evidence/update-banner/{before,local}/` contains screenshots and measured JSON. `evidence/pwa-upgrade-results.json` contains upgrade results. Supervisor logs: `/home/flori/task-logs/philosophen-banner/`.

Production: same Sandy app `u6fc5idncuehuouqihmhwo29`, https://philosophen.app.mintapis.com. Deployment `ma19u04yxbgj3s3ofqirr56z` finished at 19:49:26 UTC; application `running:healthy`. Deployed source revision `925169351405f88165e56b690cd35c0ee99ac738`, pushed to origin/main. Browser runtime, public `/api/version` and `/healthz` all report `0c0f7836d2b0c758`. All 36 public banner states passed after deployment finished; production screenshots and runtime evidence are in `evidence/update-banner/public/`. Portrait screenshots were visually inspected. This final evidence-only commit does not change deployed application sources.
