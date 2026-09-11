# SPARK Workshop 1 Web App v1.0

Production rebuild of the SPARK Workshop 1 data-center adaptive-reasoning activity.

## Current workshop structure

Five breakout groups:
- 🦉 Owl
- 🦊 Fox
- 🐦‍⬛ Raven
- 🐬 Dolphin
- 🐙 Octopus

Participants enter their **full name** and click the Zoom breakout group to which they were assigned. Moderators enter through the separate moderator page and control only their assigned group.

## v1.0 runtime decisions

- One canonical participant/moderator runtime (`app.js`). The former patch stack is removed from the active codebase.
- No recorder role and no readiness button.
- Moderator explicitly starts the scenario and each subsequent phase.
- Each group has independent moderator state, phase, prompt and timer.
- Participants can move at most one phase ahead of the moderator; the evolving-information phase is not exposed early.
- Stage 1 is locked after submission to preserve the independent starting judgment.
- Same-phase polling updates only small live regions instead of rebuilding the form, preventing typed responses from being erased.
- Formal group-result logic uses **consensus** or **strict majority (>50%)**. A plurality is not labeled a majority; otherwise the result is `No majority / unresolved`.
- Vote distributions remain hidden from participants until all currently joined group members have submitted at that decision point.
- Perspective Challenge automatically assigns a contrasting option when the group has a consensus/strict-majority recommendation.
- Evidence packets use a scan-first `Quick read` with additional detail collapsed.

## Decision options

1. Proceed under current requirements
2. Proceed with project-specific conditions
3. Defer pending specific studies/information
4. Oppose the project

The starting record also states the tradeoff: **Delay could reduce risk, but it could also mean losing the project and potential follow-on investment.**

## Architecture

**GitHub = source/version control and local/review build.  
Google Apps Script Web App = synchronized live workshop runtime.  
Google Sheets = live data store.**

The GitHub Pages root works as a local single-browser test/review environment when no backend URL is configured. It is **not** the synchronized multi-device workshop runtime by itself.

The `apps-script/` source contains the live backend. `Index.html` loads the canonical `app.js` and `styles.css` from this GitHub Pages project so the live and review UIs use the same runtime rather than separate patch copies.

## Live Apps Script deployment

1. Create/open the Google Sheet that will hold workshop data.
2. Open **Extensions → Apps Script**.
3. Replace `Code.gs` with `apps-script/Code.gs`.
4. Add HTML files named exactly `Index` and `ScenarioData`, using the matching repository files.
5. Save the project. Setup is automatic on first request; the backend creates new V2 sheets for participants, responses, votes, events and group data.
6. **Deploy → New deployment → Web app**.
7. Execute as **Me** and choose access consistent with the workshop/IRB plan.
8. Use the deployed Apps Script web-app URL as the participant URL.

Moderator URLs can be generated from the deployed URL as:
`<WEB_APP_URL>?role=moderator&group=Owl&key=<MODERATOR_KEY>`

Use the corresponding animal name for the other four groups.

## Data captured

- participant internal ID, full name and group
- individual choices at phases 1, 5, 6 and 8
- confidence values
- group artifacts
- evidence packet selection
- moderator prompt exposure and notes
- group-specific phase transitions and timing

The backend keeps raw vote history while the current state uses the latest submission for each participant/stage.

## Structural verification completed in the v1.0 rebuild

Automated logic/runtime checks were run for:
- strict-majority vs. plurality/tie behavior
- group-specific moderator-state isolation
- Stage 1 lock-after-submit
- removal of recorder/ready content from all 10 stage templates
- component-only same-stage polling (no full participant-form rebuild unless the released phase changes)

GitHub Pages deployment also completed successfully after the canonical rebuild.

## Still required before workshop use

A true production smoke test must be run **after the Apps Script project is updated and redeployed**, because the GitHub repository cannot itself publish a Google Apps Script deployment. Test with at least 5 simultaneous devices/browsers and verify:
- one moderator per animal group
- each moderator advances only their own group
- participant names appear on the correct moderator dashboard
- typed responses survive multiple polling cycles
- all participants see the same selected evidence and phase releases
- vote distributions appear only after all joined members submit
- mobile layout and accessibility are acceptable

## Scenario design docs
- `docs/SCENARIO_v1.1.md`
- `docs/SCENARIO_FRAMEWORK_v1.0.md`
