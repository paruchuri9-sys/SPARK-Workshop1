# SPARK MVP release candidate: Design 0.3.0 / Reasoner 0.3.0

Date: 2026-10-14. Status: **release candidate, not deployed**.

## Rationale and evidence trace
- Observation: ReadWriteThink "Investigating Genre" produced five plausible moments, but much reasoning was already explicit in the lesson.
- Competing interpretations: novelty detector failure versus valid recognition of existing reasoning opportunities.
- Decision: expose provisional source-grounded `uncovered | strengthened | already_present` classification. Do **not** claim objective novelty. Show construct label, plain-language explanation, provenance, and exact incremental instructional value.
- Observation: UI limited teachers to one moment. Decision: multi-selection with per-moment duration and combined generation under the initial time budget.
- Risk: assembling cards into independent mini-lessons. Mitigation: one integrated builder response using all selections and allocated minutes.
- Risk: unwanted alteration of a working prototype. Mitigation: isolated Git branch, versioned UI and reasoner, deploy-by-manual-copy only, rollback below.

## Contract changes
- Uncover returns 1–5 moments including existing schema fields plus:
  `construct_label`, `construct_explanation`, `coverage_status`, `coverage_rationale`, `added_value`.
- Build takes `selections: [{moment,minutes,adjustment}]` rather than `selectedMoment`.
- UI shows **Design v0.3.0 · Reasoner v0.3.0**.
- Events record `sessionId, event, versions, release` and compact metadata. No full lesson or student contents are logged.
- Configure Script Property `SPARK_EVENT_SHEET_ID` with a dedicated Google Sheet ID for persistent `MVPEventsV1` rows. Without a Sheet ID, metadata goes to Apps Script execution logs instead, which are not durable study logs. A spreadsheet is **required** for persistent logging.
- No DynamoDB or S3 connection. Avoid personal/student information in MVP submissions.

## Deployment
1. Preserve the presently deployed Apps Script version as the rollback target; record its version number.
2. In the **existing standalone SPARK Apps Script** project replace `Code.gs` and `Index.html` using this branch.
3. Set Script Properties `OPENAI_API_KEY`, `SPARK_MODEL`, and (for persistent logs) `SPARK_EVENT_SHEET_ID`.
4. Deploy **a new version** to the existing Web app deployment (do not replace the old source history). First run a controlled instructor-only smoke test.
5. Check that the header says **Design v0.3.0 · Reasoner v0.3.0** and that at least one event appears in `MVPEventsV1`.
6. Only then expand testing.

## Smoke-test checks
- Upload/paste/public HTML lesson URL; verify no JS error and sensible 1–5 moments.
- Strong-reasoning source: at least some `strengthened` or `already_present` candidates; do not count them as new opportunities.
- Thin source: appropriate opportunities may be `uncovered`, but never invent original content.
- Every card shows construct, explanation, source coverage and what is added.
- Choose two 5-minute moments on a 10-minute budget; both remain selected and one integrated artifact is generated.
- Exceed the budget; Build is disabled and an explanatory message appears.
- Skip selected moment; it is removed from the selection and the budget recalculates.
- Teacher View and Student View show the integrated result.
- Confirm session events and versions are present in spreadsheet or execution logs; no full source text logged.
- Review historical sensitive content with educators for factual and pedagogical safety.

## Rollback
- In Apps Script choose **Deploy → Manage deployments → Edit → Version** and select the previously recorded working version.
- The release branch remains intact as evidence of the attempted change.
- Restore both `Code.gs` and `Index.html` together if modifying local editor source. Do not mix 0.2 UI with 0.3 backend since the build payload changed.

## Known limits
- Reasoning construct names are model-generated, not a validated ontology.
- `coverage_status` is a tentative source-grounded judgment, not educator-measured novelty.
- No classroom learning effect measured.
- Apps Script deployment and API calls require an actual live smoke test; repository code inspection alone is not end-to-end verification.
- No durable source/artifact archival; only metadata events when spreadsheet configured.
