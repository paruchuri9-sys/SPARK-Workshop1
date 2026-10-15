# SPARK verified release checkpoint — 2026-10-15

## Evidence
- New independent Apps Script web-app deployment URL was observed rendering the v0.2 SPARK Page 1 successfully.
- Older deployments returned Google's "Sorry, unable to open the file at this time" even when their doGet executions completed.
- Therefore a successful clasp deploy, and even an Apps Script doGet completion, are insufficient evidence of browser accessibility.

## Changes in this release tooling
1. Before clasp push, query `clasp deployments` for the exact configured deployment ID, refusing a mismatched Script ID / Deployment ID pairing.
2. Stage a build/commit stamp in the SPARK HTML. Version number and behavior/reasoner version in the v0.3 branch remain independent; the build SHA is for forensic traceability.
3. Capture source branch, source commit and deployment URL in GitHub Actions summary.
4. Probe published URL with an anonymous HTTP request, rejecting known Google file-access or sign-in error pages.
5. Require manual browser and actual Uncover → Select → Build test before calling a release behaviorally validated.

## Limitations / safeguards
- The HTTP probe may be inconclusive because Google may render sign-in, redirects, bot gating, or an Apps Script wrapper differently to command-line clients. A failed probe is a release verification failure, not necessarily proof the app is broken.
- The pipeline does **not** auto-roll back; use the existing version-number rollback workflow with the known-good Apps Script project version. Preserve the working release number before deployment.
- The version stamp is a Git source commit, not a separately verified Google deployment artifact hash.
- Do not update `SPARK_DEPLOYMENT_ID` without verifying that it belongs to the same Apps Script project as `SPARK_SCRIPT_ID`.
- Persistent event logs require a configured event sheet and classroom use requires privacy review.

## Manual acceptance
- Check exact deployed URL in ordinary browser.
- Confirm Design v0.3.0 and Reasoner v0.3.0 visible if v0.3 source selected, and Build commit displayed.
- Use a real lesson URL, inspect provenance, construct labels and coverage classifications.
- Select two reasoning opportunities within budget, verify integrated Teacher and Student Views.
- Confirm expected release metadata and session events; retain any failure in the release history.
