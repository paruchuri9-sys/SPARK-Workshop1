# SPARK Workshop 1 Web App v1.2

Production rebuild of the SPARK Workshop 1 data-center adaptive-reasoning activity.

## Current workshop structure

Five breakout groups:
- 🦉 Owl
- 🦊 Fox
- 🐦‍⬛ Raven
- 🐬 Dolphin
- 🐙 Octopus

Participants enter their **full name** and click the Zoom breakout group to which they were assigned. Moderators control only their assigned group.

## v1.2 participant flow

- Phase 1 begins as soon as the first participant in a group joins. The shared group timer starts immediately.
- Participants read the starting record and submit their initial response without waiting for a moderator to start the scenario.
- Phases advance automatically when the completion requirement for that phase is met.
- If the moderator manually advances while one participant is still finishing an individual-response phase, that participant can finish and submit the older phase, then joins the group on the current phase.
- Full name, group, internal participant ID, current phase and unsubmitted draft content are retained locally so accidental refresh/close is recoverable.
- There is no separate waiting page, recorder role, readiness button, or normal participant Back/Next navigation.

### Automatic phase completion

1. Phase 1: all joined participants submit their initial response.
2. Phase 2: group Need-to-Know response is submitted.
3. Phase 3: two evidence packets and rationale are submitted.
4. Phase 4: group evidence review is submitted.
5. Phase 5: all individual preliminary choices + group reasoning are submitted.
6. Phase 6: all joined participants submit their response to the new information.
7. Phase 7: Perspective Challenge is submitted.
8. Phase 8: all individual final choices + final group artifact are submitted.
9. Phase 9: educator reflection is submitted.
10. Phase 10: transfer map is submitted; workshop activity is complete.

Phase 1 includes a short roster-stabilization grace period before automatic advancement so the first participant cannot immediately advance the room before others arrive.

## v1.2 moderator flow

The moderator dashboard is exception-oriented rather than start-oriented. It shows the current phase, group timer, participant/progress status, and concise phase-specific **SAY** and **DO** guidance.

Normal operation requires no button press. The two primary controls are:
- **Next phase**: manually advance when the group is ready even if one person is still finishing.
- **+1 minute**: extend the current group timer.

Neutral prompts and private moderator notes remain available in collapsed sections.

## Core runtime decisions

- Five independent group states, phases, prompts and timers.
- Stage 1 is locked after submission to preserve the independent starting judgment.
- Same-phase polling updates only small live regions instead of rebuilding active forms.
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

The active browser runtime is `app3.js`. The Apps Script `Index.html` loads the same runtime from GitHub Pages so the live and review UIs stay aligned.

The GitHub Pages root is a local single-browser test/review environment when no backend URL is configured. It is **not** the synchronized multi-device workshop runtime by itself.

## Live Apps Script deployment

1. Open the Google Sheet that will hold workshop data.
2. Open **Extensions → Apps Script**.
3. Replace `Code.gs` with `apps-script/Code.gs`.
4. Replace the HTML files named `Index` and `ScenarioData` with the matching repository files.
5. Save the project.
6. **Deploy → New deployment → Web app** (or update the existing deployment).
7. Use the deployed Apps Script web-app URL as the participant URL.

Moderator URLs use the deployed URL with the assigned animal group and moderator key.

## Production smoke test still required

After redeploying Apps Script, test with multiple browsers/devices and verify:
- joining a group immediately starts Phase 1 and one shared timer,
- all-complete phases advance automatically,
- `Next phase` and `+1 minute` affect only the moderator's assigned group,
- a lagging participant can finish an older individual phase after the group advances and then rejoin the current phase,
- draft recovery survives refresh/close,
- vote distributions remain hidden until appropriate,
- five groups remain isolated from one another.
