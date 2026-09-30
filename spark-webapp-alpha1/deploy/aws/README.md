# AWS deployment

The prototype targets one Lambda/HTTP API for the UI and API, S3 for uploaded lesson originals, and DynamoDB for the SPARK research/provenance record.

From deploy/aws:

```bash
sam build -t template.yaml
sam deploy --guided
```

After deployment, configure OPENAI_API_KEY using a secret-backed process. Without it, the app remains in explicit demo mode.

The DynamoDB table stores a session META record plus append-only EVENT and FEEDBACK records. Lesson originals remain private in S3.
