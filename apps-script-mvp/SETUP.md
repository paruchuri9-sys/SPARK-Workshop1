# SPARK MVP v0.2 standalone Apps Script setup

1. Go to https://script.google.com and create a **New project** named **SPARK MVP v0.2**.
2. Replace the default `Code.gs` with the contents of this folder's `Code.gs`.
3. Open **Project Settings → Script Properties** and add:
   - `OPENAI_API_KEY` = your API key
   - `SPARK_MODEL` = an OpenAI Responses API model available to your account
4. Choose **Deploy → New deployment → Web app**.
5. Execute as: **Me**.
6. Who has access: choose the setting appropriate for your test group. For your own test, use the least-permissive option that still lets you open it.
7. Deploy and copy the `.../exec` URL.

You can test either way:

- Open the Apps Script deployment URL directly. It embeds the GitHub-hosted MVP.
- Or open the GitHub UI once with:
  `https://paruchuri9-sys.github.io/SPARK-Workshop1/mvp.html?backend=YOUR_ENCODED_EXEC_URL`

The GitHub page remembers that backend URL in browser localStorage, so subsequent visits to `mvp.html` do not need the query parameter.

A `health` API action is included for debugging. This backend has no dependency on the Workshop 1 spreadsheet or Apps Script project.
