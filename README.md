# SPARK Workshop 1 Web App

Production web app for the SPARK Workshop 1 data-center adaptive-reasoning activity.

## Current workshop structure

Five breakout groups:
- 🦉 Owl
- 🦊 Fox
- 🐦‍⬛ Raven
- 🐬 Dolphin
- 🐙 Octopus

Breakout-room web flow uses **9 phases**. The transfer discussion after Phase 9 occurs in the main Zoom room.

## Live runtime

The synchronized workshop runs through a Google Apps Script web app bound to a Google Sheet. Each group has one authoritative phase and one authoritative deadline.

- The moderator entering a group starts Phase 1 and its timer.
- Participant joins do not start or reset the timer.
- Submitting data never advances the phase.
- Participants remain on the current phase after submission.
- Only the moderator's **Next phase** control advances the group.
- **+1 minute** extends the shared group deadline.
- Late participants join the current phase with the current time remaining.

## Data storage

All five groups are stored in the Google Sheet bound to the Apps Script project. The app automatically creates/uses these tabs:

- `ParticipantsV2` — participant/moderator name, ID, group and role.
- `ResponsesV2` — timestamped submitted text/group artifacts and individual written responses.
- `VotesV2` — individual recommendation choices and confidence values.
- `EventsV2` — joins, phase starts, moderator actions and other logged events.
- `GroupDataV2` — the latest shared state and latest group response for each group/phase.

`ResponsesV2`, `VotesV2`, and `EventsV2` preserve the timestamped activity history. `GroupDataV2` provides the latest current value used by the live interface.

## Live dashboard

The Apps Script project now includes `Dashboard.html` and a protected dashboard API.

After deploying the current Apps Script files, open:

`<YOUR_APPS_SCRIPT_WEB_APP_URL>?view=dashboard`

Enter the moderator code once. The dashboard refreshes every five seconds and includes:

- current phase, remaining time, participant count and moderator for all five groups;
- selected evidence by group and cross-group frequency;
- Stage 1, 5, 6 and 8 decision trajectories;
- participant maintain/change counts from initial to final recommendation when available;
- phase-by-phase submitted text across all groups;
- automatic cross-group structural signals;
- direct link to the underlying Google Sheet;
- Copy Synthesis Packet and Download JSON controls.

The dashboard performs a **structured automatic synthesis** of recorded workshop data. It intentionally does not assign qualitative reasoning scores or make semantic judgments about educator responses.

## Architecture

**GitHub = source/version control and local/review build.  
Google Apps Script Web App = synchronized live workshop runtime and dashboard.  
Google Sheets = authoritative live data store.**

GitHub Pages is only a local/single-browser review environment unless a shared backend is configured. It is not the multi-device workshop runtime.

## Apps Script deployment

1. Open the Google Sheet used for the workshop.
2. Open **Extensions → Apps Script**.
3. Replace `Code.gs` with `apps-script/Code.gs`.
4. Replace/add HTML files named exactly `Index`, `ScenarioData`, and `Dashboard` using the matching repository files.
5. Save the project.
6. **Deploy → Manage deployments → Edit** the existing web-app deployment, or create a new web-app deployment.
7. Use the deployed Apps Script URL for the workshop.
8. Use `<WEB_APP_URL>?view=dashboard` for the live synthesis dashboard.

## Production smoke test

Before the workshop, test with a moderator and at least two participants on separate browsers/devices and verify:

- moderator entry starts one shared timer;
- late participant sees the same current phase and remaining time;
- participant submission does not move the phase;
- moderator Next phase moves every participant in that group;
- +1 minute changes the shared deadline for everyone;
- five groups remain isolated;
- dashboard reflects submissions, votes and group responses from all five groups;
- Phase 9 ends the breakout activity and sends participants back to the main Zoom room.
