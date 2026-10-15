# SPARK Browser Smoke Test

The prior release workflow reported HTTP 200 after deployment of v0.3, yet the user saw Google's "Sorry, unable to open the file at this time." A real Chromium browser test is now available independently of deployment.

## Run without redeploying
GitHub > Actions > **SPARK browser smoke test** > **Run workflow**, branch **main**.

The test reads the existing secret `SPARK_DEPLOYMENT_ID`, opens that exact `/exec` URL in a clean, anonymous Chromium session, checks all frames for Google's error text, and requires the SPARK heading, source input and Find opportunities action to be rendered together.

It **does not call OpenAI, submit a lesson, create a deployment, or change code**. Browser failures are summarized in `spark-browser-smoke-<run>` with no screenshots or page HTML to avoid capturing account identities or lesson data.

## Interpretation
- **PASS:** the public SPARK interface rendered for an anonymous browser session. It does not prove the LLM endpoints work.
- **FAIL:** inspect the browser result artifact's reason. A fail may indicate access permissions, Google account/session behavior, loading time, or markup mismatch.
- **PASS but user cannot open:** likely an authentication/profile/network-specific delivery problem. Compare only with consent and avoid sharing Google account cookies.

## Follow-up
Do not treat this alone as v0.3 acceptance. Run a private, human-approved source URL → uncover → multi-select → build exercise, reviewing reasoning classifications and teacher/student views. Keep the previous numeric Apps Script release for rollback.
