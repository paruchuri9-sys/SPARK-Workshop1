# SPARK Workshop 1 Web App

Production web app for the SPARK Workshop 1 data-center adaptive-reasoning activity.

## Current structure

Five breakout groups: Owl, Fox, Raven, Dolphin, and Octopus. The breakout-room web flow uses 9 phases. The transfer discussion after Phase 9 occurs in the main Zoom room.

## Deployment architecture

**GitHub Pages hosts all workshop and dashboard frontend files.**

**Google Apps Script contains only `Code.gs`.** It acts as a thin bridge between the GitHub-hosted interface and the Google Sheet.

**Google Sheets is the authoritative live datastore.**

The participant/moderator web-app URL remains the deployed Apps Script URL. Apps Script serves a minimal shell that embeds the GitHub Pages interface and securely relays `google.script.run` calls between the page and `Code.gs`.

This means future changes to the workshop UI, wording, scenario data, moderator controls, styles, or dashboard can be made in GitHub without copying HTML or JavaScript into Apps Script.

## Apps Script setup

1. Open the Google Sheet used for the workshop.
2. Open **Extensions → Apps Script**.
3. Replace the entire `Code.gs` file with `apps-script/Code.gs` from this repository.
4. No Apps Script HTML files are required.
5. Save.
6. Use **Deploy → Manage deployments → Edit** and deploy a new version of the Web App, or create a new Web App deployment.
7. Use the deployed Apps Script URL for participants and moderators.
8. Use `<WEB_APP_URL>?view=dashboard` for the live dashboard.

## Live workshop behavior

Each group has one authoritative phase and deadline.

- Moderator entering the group starts Phase 1 and its timer.
- Participant joins do not start or reset the timer.
- Late participants enter the current phase with the remaining time.
- Submission records data but never advances the phase.
- Participants remain on the current phase after submitting.
- Only the moderator's **Next phase** control advances the group.
- **+1 minute** extends the shared deadline for everyone in that group.
- Phase 9 ends the breakout activity and sends participants back to the main Zoom room.

## Data storage

The bound Google Sheet automatically contains:

- `ParticipantsV2`: participant/moderator names, IDs, groups, and roles.
- `ResponsesV2`: timestamped submitted text and group artifacts.
- `VotesV2`: individual recommendation choices and confidence values.
- `EventsV2`: joins, phase starts, moderator actions, and other logged events.
- `GroupDataV2`: latest shared state and latest group response for each group/phase.

`ResponsesV2`, `VotesV2`, and `EventsV2` preserve timestamped history. `GroupDataV2` is the current-state store used by the interface.

## Dashboard

Open:

`<WEB_APP_URL>?view=dashboard`

The dashboard frontend is `dashboard.html` on GitHub Pages. It refreshes the live data every five seconds and shows:

- phase, remaining time, participant count, and moderator for all five groups;
- evidence selected by group and across groups;
- Stage 1, 5, 6, and 8 decision trajectories;
- maintain/change counts where initial and final responses are available;
- phase-by-phase submitted material across all groups;
- structural cross-group synthesis;
- direct access to the underlying Google Sheet;
- copyable synthesis packet and JSON download.

## Frontend files

The active GitHub-hosted frontend includes:

- `index.html`
- `styles.css`
- `config.js`
- `scenario-data.js`
- `app5.js`
- `moderator-lite.js`
- `manual-flow.js`
- `bridge.js`
- `dashboard.html`

Directly opening GitHub Pages remains useful for single-browser/local review. The deployed Apps Script URL is the synchronized multi-device runtime because it supplies the live bridge to Google Sheets.

## Production smoke test

Before the workshop, use separate browsers/devices and verify:

- moderator entry starts one shared timer;
- a late participant sees the same phase and remaining time;
- submission does not move the phase;
- moderator Next phase moves every participant in the group;
- +1 minute updates the shared deadline;
- two different groups can run independently at different times;
- dashboard reflects both groups correctly;
- Phase 9 ends the breakout activity.
