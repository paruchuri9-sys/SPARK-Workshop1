# SPARK Next — clean Netlify MVP

Independent development branch. Does not alter historical Apps Script deployments.

## Implementation
- Static three-step UI, plain JS, no framework.
- Netlify function `/api/spark`: `analyze`, `event`, `build`.
- Server-only OpenAI key; JSON-schema structured responses.
- Native `@netlify/database` and versioned SQL migration. Database writes are awaited before reporting successful generation. No silent in-memory fallback.
- Session and lesson UUIDs, version metadata, generation and selection events, activity output. No raw source lesson is persisted by this implementation. Generated content may contain excerpts of the submitted lesson.

## Setup
1. Create a new Netlify site from this repository, base directory `spark-next`, publish directory `public`.
2. Use a credit-based Netlify plan with Netlify Database enabled. The `@netlify/database` dependency and migration should provision it on deploy; confirm in Data & Storage > Database.
3. Set `OPENAI_API_KEY` as a Netlify **Functions** environment secret. Optional `SPARK_MODEL` (defaults to `gpt-4.1-mini`). Do not put the key in GitHub or frontend files.
4. Run `npm install`, `npm test`, `npx netlify dev` in `spark-next`. Netlify CLI handles a local DB.
5. Test with a non-sensitive lesson; confirm `spark_events` rows via Netlify database UI.

## Explicit limitations
- This first vertical slice supports **paste only**. Public-URL fetching and uploaded files require separate extraction and SSRF/security review.
- There is no educator login or research consent flow. **Do not expose as an unrestricted public study**. Restrict site access until authentication, consent, abuse controls, request budgets, retention policy and IRB-compliant data handling are in place.
- Model output schema enforces field shapes, not validity of evidence or pedagogical quality.
- The UI makes no claim of validation until a live Netlify deploy, DB migration, API call and database read-back are confirmed.
- `activity_generated` stores output text; determine retention before real teacher data collection.

## Acceptance gate
Deployment must serve UI, analyze one real lesson, display 1–5 correctly grounded moments, select 2, build combined activity, then verify session events in Postgres. Keep v0.2 intact.
