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

The deployed Lambda reads the OpenAI API key from AWS Secrets Manager using the secret name `SPARK/OpenAIApiKey`. Store either the raw API key as the secret string or JSON containing `OPENAI_API_KEY`, `api_key`, or `key`. The secret value is never stored in GitHub.

## URL ingestion

Educators can supply a public http/https lesson URL instead of uploading a file. SPARK validates redirects, rejects private/local network destinations, caps remote downloads at 10 MB, and supports HTML/text plus linked PDF/DOCX content. The original and resolved URLs are recorded as source provenance.
