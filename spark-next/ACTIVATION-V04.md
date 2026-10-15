# SPARK activation design v0.4 (candidate)

**Frozen boundary:** SPARK identifies and activates situated reasoning opportunities within instruction. RIE addresses their deliberate connection and reinforcement across lessons, subjects, and educational experiences.

## Teacher-facing card contract
- Title: Reasoning opportunity, not "reasoning already present".
- Reasoning type: controlled construct label; expandable **Learn more** provides explanation.
- Minimal move: a specific teacher question, cue, or process shift in an existing lesson step, preferably 0–5 extra minutes.
- Connection cue: connects reasoning to another step within the lesson.
- Transfer cue: optional invitation to notice relevance in a different context; do **not** claim demonstrated transfer.
- Quick check: optional teacher-ready question labeled recognition, prompted application, or transfer probe. No response collection or student-level scoring in this release.
- Existing coverage / citation: maintained in collapsed teacher explanation, rather than made into a recommendation ranking.

## Important scope boundary
No classroom responses are captured. Student accounts, assignment integrations, manual response entry, and transfer-outcome claims are **deferred**. Existing operational PostgreSQL logging of generated opportunities, selected moments, and generated activities continues unchanged.

## Acceptance tests prior to merge
1. Verify a reasoning-rich original lesson: already_present cards may be worth surfacing without pretending to add an activity.
2. Check that suggested moves are distinct from verbatim existing teacher questions.
3. Confirm time estimates refer only to *incremental* time, including 0.
4. Check Learn more, evidence/rationale, quick-check sections collapse/expand.
5. Confirm quick-check items do not claim that choosing an option proves independent transfer.
6. Select two opportunities and build an integrated activity; inspect teacher/student output and Postgres events.
7. Confirm lesson URL beta remains functional and protected by source host allowlist.

## Limitations
The model currently returns 1–5 moments and each has a quick_check field (which may be empty); it is not yet a learned cost-benefit intervention selector. New output schema has not been validated by live model/database tests. Native Netlify/OpenAI secrets remain deployment requirements.
