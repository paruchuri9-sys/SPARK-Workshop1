# SPARK controlled deployment (Option 2)

This pipeline is **not live until the repository secrets and GitHub environment are configured**. The production Apps Script deployment is unchanged.

## Set up once
1. Enable the Apps Script API in your Google account settings at https://script.google.com/home/usersettings.
2. In Apps Script Project Settings, copy the **Script ID** (not the web-app URL, and not the Library ID).
3. In Deploy > Manage deployments, copy the existing **web app deployment ID** from the /exec URL.
4. On a trusted computer install Node.js and run `npm install -g @google/clasp@3`, then `clasp login` with the Google account that owns SPARK. Do not paste OAuth tokens into chat.
5. Under GitHub repository Settings > Secrets and variables > Actions, add encrypted secrets `CLASPRC_JSON` (contents of your private `~/.clasprc.json`), `SPARK_SCRIPT_ID` and `SPARK_DEPLOYMENT_ID`.
6. Create GitHub environment `spark-production`, configure required reviewers and restrict branch permissions if supported by your GitHub plan. Make sure the project owner can approve.
7. Keep `OPENAI_API_KEY`, `SPARK_MODEL` and `SPARK_EVENT_SHEET_ID` in Apps Script Script Properties. These are not source-control secrets.

## Deploy
1. Review and merge the pipeline PR.
2. In Actions, run **SPARK Apps Script controlled deploy**.
3. Choose approved source branch and write a release note. Approve the environment gate.
4. Workflow validates source files, pushes the full set of 3 Apps Script files, and creates a new version of the *existing* web-app deployment. It does not change the deployment URL.
5. Confirm the visible Design/Reasoner versions and run a real Upload > Uncover > Select > Build smoke test.

## Rollback
Record the last known good **numeric Apps Script project version** before first release. In Actions, run **SPARK Apps Script rollback**, supply this version and the reason, then approve. This changes the deployed version but **does not revert code in the Apps Script editor or stored data**. A later deployment must use an explicitly approved Git commit.

## Limitations and security
- `clasp push --force` replaces *all* files in the specified Apps Script project. Only use it with the standalone SPARK MVP script, never Workshop 1.
- CI validates syntax and contracts, not the learning-science quality of generated interventions.
- A refresh token in `CLASPRC_JSON` permits Apps Script management. Restrict repository Actions/workflow editing, rotate on compromise, and use a dedicated deploy identity if possible.
- The selected source is deliberately restricted to main or the v0.3 candidate branch.
- Ensure `appsscript.json` preserves the required scopes and existing Web app execute-as/access model.
