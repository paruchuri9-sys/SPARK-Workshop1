# SPARK Workshop 1 Web App v1.1

Production rebuild of the SPARK Workshop 1 data-center adaptive-reasoning activity.

## Current workshop structure

Five breakout groups:
- 🦉 Owl
- 🦊 Fox
- 🐦‍⬛ Raven
- 🐬 Dolphin
- 🐙 Octopus

Participants enter their **full name** and click the Zoom breakout group to which they were assigned. Moderators control only their assigned group.

## v1.1 participant flow

- Participants see the Stage 1 starting record immediately after joining their group.
- Before the moderator starts, they can read but the initial-response controls are disabled.
- When the moderator clicks **Start scenario**, the Stage 1 response controls enable automatically.
- Full name, group, internal participant ID and current phase are remembered on the device. Closing or refreshing the page returns the participant to the activity.
- Unsubmitted form content is locally auto-saved by phase so an accidental refresh does not normally erase typing.
- There is no separate waiting page, recorder role or readiness button.
- Participant navigation is deliberately simple: the app shows only a **Next** action when the next phase is available.

## v1.1 moderator flow

The moderator dashboard shows a concise, phase-specific **Say** script and **Do** instruction above the controls. Normal operation is:

1. confirm participants are in the correct room,
2. click **Start scenario**,
3. read the short phase script,
4. click **Start next phase** when appropriate.

Neutral prompts and private moderator notes remain available but are collapsed so they do not clutter the normal workflow.

## Core runtime decisions

- Five independent group states, phases, prompts and timers.
- Participants can move at most one phase ahead of the moderator; the evolving-information phase is not exposed early.
- Stage 1 is locked after submission to preserve the independent starting judgment.
- Same-phase polling updates only small live regions instead of rebuilding the form.
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

The active browser runtime is `app2.js`. The Apps Script `Index.html` loads the same runtime from GitHub Pages so the live and review UIs stay aligned.

The GitHub Pages root is a local single-browser test/review environment when no backend URL is configured. It is **not** the synchronized multi-device workshop runtime by itself.

## Live Apps Script deployment

1. Create/open the Google Sheet that will hold workshop data.
2. Open **Extensions → Apps Script**.
3. Replace `Code.gs` with `apps-script/Code.gs`.
4. Add HTML files named exactly `Index` and `ScenarioData`, using the matching repository files.
5. Save the project.
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

## Still required before workshop use

Run a production smoke test **after the Apps Script project is updated and redeployed**. Test at minimum:
- participant sees Stage 1 before start but cannot answer yet
- moderator start enables Stage 1 for only that group
- each moderator advances only their own group
- closing/reopening a participant browser resumes name, group and phase
- typed draft survives refresh before submission
- participant names appear on the correct moderator dashboard
- all participants see the same selected evidence and phase releases
- vote distributions appear only after all joined members submit

## Scenario design docs
- `docs/SCENARIO_v1.1.md`
- `docs/SCENARIO_FRAMEWORK_v1.0.md`
