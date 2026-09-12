# Read-aloud spinner fix

2026-09-12: Exempted the spinner from the generic first-child icon width; set equal .8rem inline/block dimensions, flex:none and border-box. Retained the circular border and .8s linear rotation. No backend/API changes.

Build passed. A Chromium harness entered the actual loading state with intercepted chat and pending /api/speech requests (no paid calls). At 320, 390 and 1280px viewports, computed untransformed width and height matched (12.7969px), with 50% border radius and no flex shrinking. Inspected the 320px screenshot: circular, aligned spinner. Reduced-motion remains disabled by the existing global animation:none rule.

Build version: b10932acd46e237e. Verification harness, screenshots and command evidence: /home/flori/task-logs/philosophen-spinner/. Deployment/public verification results are recorded in run.log.
