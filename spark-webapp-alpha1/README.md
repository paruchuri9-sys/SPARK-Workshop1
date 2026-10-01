# SPARK Web App Alpha 1

A deliberately small implementation of the SPARK **DISCOVER → SELECT → DEVELOP** loop.

## Current scope

1. Accept an existing lesson/activity as a public http/https URL, PDF, DOCX, TXT/MD/CSV, or pasted text.
2. Reconstruct the activity before proposing changes.
3. Generate a broad candidate set, retain keep/reject decisions, and surface **0–5** defensible reasoning opportunities.
4. Let the educator select a subset and enter constraints/additional context.
5. Develop teacher-usable strengthening only for the selected moments.
6. Preserve provenance: source lesson, educator input, activity map, candidate moments, filtering decisions, surfaced moments, selections, constraints, generated designs, and explicit feedback.

The app stores structured rationale/provenance summaries, not hidden model chain-of-thought.

## AWS target

- Lambda + Function URL: FastAPI application
- S3: private uploaded lesson originals
- DynamoDB: session record plus append-only events and feedback
- Local development retains SQLite fallback.

See deploy/aws/template.yaml.

## Research boundary

Alpha 1 is not an efficacy instrument or final teacher product. It exists to test whether SPARK uncovers grounded, nonredundant, worthwhile opportunities and whether educator selection plus constraints can turn selected opportunities into usable lesson-strengthening designs.


## OpenAI credential

The deployed Lambda reads the OpenAI API key from AWS Secrets Manager using `SPARK/OpenAIApiKey2`. The secret may be raw text or a one-value JSON object. The secret value is never stored in GitHub.

## URL ingestion

Educators can supply a public http/https lesson URL instead of uploading a file. SPARK validates redirects, rejects private/local network destinations, caps remote downloads at 10 MB, and supports HTML/text plus linked PDF/DOCX content. The original and resolved URLs are recorded as source provenance.


## Research/admin API

Read-only endpoints expose stored Alpha research records without granting DynamoDB credentials:

- `GET /api/research/sessions?limit=50`
- `GET /api/research/session/{session_id}`
- `GET /api/research/session/{session_id}/events`

They require the HTTP header `X-SPARK-Research-Token`. The token is loaded at runtime from AWS Secrets Manager secret `SPARK/ResearchAdminToken`. The session endpoint omits raw lesson text by default; use `?include_lesson=true` only when the authenticated researcher needs the source text.

## Alpha 1 discovery calibration

Discovery prompt version `discover-0.2` uses a stricter gate: newness, consequence, teacher value, grounding, feasibility, and distinctness. It aims for three surfaced moments when three clearly clear the bar and uses four or five only when the additions are independently strong. The full candidate/rejection trace is still retained for research.

## Telemetry

Each new discovery run records model latency, total run latency, URL/file extraction time, OpenAI request/response IDs when available, token usage, prompt/schema versions, input size, candidate count, and surfaced count.


## Google Drive research mirror

The canonical research artifacts remain in S3. If AWS Secrets Manager contains a Google service-account JSON secret named `SPARK/GoogleDriveServiceAccount`, Lambda mirrors each run into the configured Drive folder `SPARK Alpha 1 Runs`.

Setup:
1. Create a Google Cloud service account with Drive API access.
2. Store its complete JSON credential document in AWS Secrets Manager as `SPARK/GoogleDriveServiceAccount`.
3. Share the Drive folder with the service account's `client_email` as Editor.
4. No Google credential is stored in GitHub.

If this secret is absent or Drive upload fails, the SPARK run remains successful and the S3 research artifacts are still preserved. The export event records Drive mirror status.
