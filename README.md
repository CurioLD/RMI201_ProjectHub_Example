# RMI101 project hub

A static website for the RMIT Online project hub. Netlify serves the `site` folder. Every weekday at 7:00am Sydney time, a GitHub Action reads Jira, rewrites `site/project-data.json` and commits it. Netlify then republishes the site automatically. Nobody needs to touch it after setup.

```
Jira  →  GitHub Action (weekdays 7am)  →  commit project-data.json  →  Netlify redeploys  →  hub URL
```

## What's in the repo

| Path | What it does |
| --- | --- |
| `site/index.html`, `styles.css`, `app.js`, `d3.min.js` | The hub page. No logins and no external services apart from Google Fonts. |
| `site/project-data.json` | Jira stories and tasks plus the last update time. Rewritten by the Action. |
| `site/charter.json` | Scope, milestones, people and actions from the charter and SOW. Edit it by hand if those change. |
| `scripts/fetch-jira.mjs` | Reads Jira and writes `project-data.json`. If Jira fails, it changes nothing, so the site keeps the last good data. |
| `.github/workflows/refresh-jira.yml` | The weekday schedule. It can also be run on demand. |
| `netlify.toml` | Tells Netlify to publish `site`, with no build step and no search-engine indexing. |

## One-time setup (about 20 minutes)

### 1. Create a Jira API token
1. Go to https://id.atlassian.com/manage-profile/security/api-tokens.
2. Create an API token named `projecthub`, and set the longest expiry allowed.
3. Copy the token. You'll paste it into GitHub in step 3.

The token reads Jira with your access. It lives only in GitHub's encrypted secrets and never reaches the website.

### 2. Create the GitHub repository
1. In GitHub, create a new **private** repository called `projecthub`, with no README.
2. Upload every file and folder from this package, keeping the same folder structure.
3. On a Mac, Finder hides the `.github` folder. Press **Cmd + Shift + .** in Finder to show it before you drag files in. If it still doesn't upload, use **Add file → Create new file** in GitHub. Name the file `.github/workflows/refresh-jira.yml` and paste in the contents of that file.

### 3. Add the secrets and allow the Action to commit
1. In the repository, go to **Settings → Secrets and variables → Actions → New repository secret**:
   - `JIRA_EMAIL`: your Atlassian login email
   - `JIRA_API_TOKEN`: the token from step 1
2. Go to **Settings → Actions → General → Workflow permissions** and choose **Read and write permissions**. Save.

### 4. Test the refresh once
1. Go to **Actions → Refresh Jira data → Run workflow**.
2. After about a minute, the run should be green, and there should be a new commit, "Refresh Jira data", changing `site/project-data.json`.
3. If the run is red, open it and read the error. A 401 error means the email or token is wrong. A 403 error means the account can't see RMI101.

### 5. Connect Netlify
1. In Netlify, go to **Add new project → Import an existing project → GitHub** and pick `projecthub`.
2. Leave the build command empty. The publish directory reads `site` from `netlify.toml`.
3. Deploy, then open the site.
4. Go to **Project configuration → Change project name** and pick a name that's hard to guess, for example `rmit-courses-hub-7k2q`. The link is public to anyone who has it.

### 6. Check it end to end
- The footer shows "Last updated from Jira" with today's time.
- Change a status in Jira, run the workflow again, and confirm the change appears on the site after Netlify redeploys. That takes under a minute.

## Good to know

- **Unlisted, not private.** Anyone with the URL can open it, and search engines are told not to index it. The page shows people's names and roles from the charter.
- **Client view.** Weekly meetings, onboarding, internal coordination and oversight rows, retrospectives and "(Associate LD)" rows are left out. Staff names in brackets are removed from titles. You can change the `HIDE` list in `scripts/fetch-jira.mjs`.
- **Schedule.** The schedule is set for Sydney daylight saving time. After daylight saving ends in April, change `0 20` to `0 21` in the workflow to keep 7:00am.
- **If a refresh fails,** the site keeps the previous data and the footer date stops moving. GitHub emails the repository owner about failed runs.
- **Token expiry.** Atlassian tokens expire. When yours does, create a new one and update `JIRA_API_TOKEN`.
- **Free plans are enough.** Each run takes under a minute of GitHub Actions time, and each Netlify deploy is a few seconds with no build.
