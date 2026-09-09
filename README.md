# SPARK Workshop 1 Web App v0.3

Interactive UCA-themed web app for the SPARK Workshop 1 data-center adaptive-reasoning scenario.

## What changed from v0.2

v0.3 incorporates:
- the core-educator pilot findings,
- the rebuilt Data Center Scenario v1.1,
- the SPARK Scenario Design & Quality Framework v1.0,
- the broader completeness structure learned from prior university/community decision scenarios.

Major additions:
- richer starting record with verified/local-scale facts,
- explicit stakeholder context without assigning stakeholder roles,
- seven rebuilt evidence packets,
- source-status/provenance labeling,
- infrastructure/construction/public-service content,
- noise, flood/site risk, governance, monitoring and successor/decommissioning questions,
- final enforceable-condition/monitoring stage,
- consensus/majority/tie logic based on every participant submitting a choice,
- facilitator-controlled latent thought prompts,
- group-specific prompt exposure,
- evidence-selection and decision-trajectory synthesis.

## UCA theme
- Purple: `#582C83`
- Gray: `#7C878E`
- Purple shadow: `#3b245e`

No logo asset is bundled.

## Recommended runtime architecture

**GitHub = source/version control.  
Google Apps Script Web App = live workshop runtime.  
Google Sheets = data store.**

The repository root is a static demo/prototype. It works in local/demo mode with browser `localStorage`.

For the live synchronized workshop, deploy the `apps-script/` version from a Google Sheet-bound Apps Script project. The Apps Script version is self-contained and does not depend on a CDN at runtime.

## Apps Script deployment

1. Create/open a Google Sheet for workshop data.
2. Extensions → Apps Script.
3. Replace `Code.gs` with `apps-script/Code.gs`.
4. Add HTML files named exactly:
   - `Index`
   - `Styles`
   - `App`
   - `ScenarioData`
   - `AppCore`
5. Paste the matching repository files from `apps-script/`.
6. Run `setup()` once and authorize.
7. Deploy → New deployment → Web app.
8. Execute as: **Me**.
9. Choose access appropriate to the participants and UCA/IRB requirements.

Participant URL:
`<WEB_APP_URL>`

Facilitator Group 1:
`<WEB_APP_URL>?role=facilitator&group=1`

Synthesis:
`<WEB_APP_URL>?role=synthesis`

## Data captured

The Google Sheet backend stores:
- participant/group/recorder join state
- individual choices at stages 1, 5, 6 and 8
- confidence values
- group artifacts
- evidence packet selections
- facilitator prompt exposure
- readiness
- stage transitions
- facilitator notes

Derived after the fact:
- consensus / majority / tie
- decision trajectories
- confidence trajectories
- convergence/divergence
- evidence-choice patterns
- support/prompt dependence

## Scenario design docs
- `docs/SCENARIO_v1.1.md`
- `docs/SCENARIO_FRAMEWORK_v1.0.md`

## Before live use
- Test with at least 5 simultaneous devices.
- Test participant, recorder, facilitator and synthesis views.
- Confirm participant-code handling matches the approved IRB/data plan.
- Check evidence wording one final time with Debbie/Freeman.
- Keep synthesis hidden from breakout groups until the scenario is complete.
