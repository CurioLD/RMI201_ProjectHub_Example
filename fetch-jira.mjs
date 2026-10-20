// Refreshes site/project-data.json from Jira.
// Runs in GitHub Actions on a schedule. Needs two repository secrets:
//   JIRA_EMAIL      the Atlassian account email that owns the token
//   JIRA_API_TOKEN  an Atlassian API token (https://id.atlassian.com/manage-profile/security/api-tokens)
// If anything fails, the script exits with an error and leaves the existing
// project-data.json untouched, so the site keeps showing the last good data.

import { readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const SITE = 'https://curiogroup.atlassian.net';
const PROJECT = 'RMI101';
// Epics left out of the hub (cancelled BUSM4505 work).
const EXCLUDED_EPICS = ['RMI101-110', 'RMI101-284'];
const JQL = `project = ${PROJECT} AND issuetype not in subTaskIssueTypes() AND issuetype != Epic`
  + ` AND ("Epic Link" is EMPTY OR "Epic Link" not in (${EXCLUDED_EPICS.join(', ')})) ORDER BY key`;
const FIELDS = ['summary', 'status', 'duedate', 'customfield_10706', 'customfield_10015', 'parent'];
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'site', 'project-data.json');

// Client view: internal rows left out, internal names taken out of titles.
const HIDE = [
  /^weekly meeting/i,
  /^onboarding/i,
  /gateway \d coordination/i,
  /oversight and gateway quality reviews/i,
  /internal retrospective/i,
  /blueprint workshop preparation/i,
  /\(associate ld\)/i,
];
const CLEAN = [
  [/\s*\((?:[^)]*\b(?:Mel|Joanne|May|Lizette|Mark|Gabby|Kadee)\b[^)]*)\)/g, ''],
];

export function tidy(rows) {
  return rows
    .filter((r) => !HIDE.some((re) => re.test(r.summary || '')))
    .filter((r) => !EXCLUDED_EPICS.includes(r.epic))
    .map((r) => ({ ...r, summary: CLEAN.reduce((s, [re, to]) => s.replace(re, to), r.summary || '').trim() }));
}

const STATUS = { done: 'Done', indeterminate: 'In progress', new: 'To do' };

function shape(issue) {
  const f = issue.fields || {};
  const cat = f.status && f.status.statusCategory ? f.status.statusCategory.key : 'new';
  const epic = f.customfield_10015 || (f.parent && f.parent.key) || null;
  const day = (v) => (v ? String(v).slice(0, 10) : null);
  return { key: issue.key, epic, status: STATUS[cat] || 'To do', start: day(f.customfield_10706), due: day(f.duedate), summary: f.summary || '' };
}

async function fetchAll() {
  const { JIRA_EMAIL, JIRA_API_TOKEN } = process.env;
  if (!JIRA_EMAIL || !JIRA_API_TOKEN) throw new Error('JIRA_EMAIL and JIRA_API_TOKEN secrets are not set.');
  const auth = 'Basic ' + Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
  const rows = [];
  let nextPageToken;
  for (let page = 0; page < 50; page += 1) {
    const res = await fetch(`${SITE}/rest/api/3/search/jql`, {
      method: 'POST',
      headers: { Authorization: auth, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ jql: JQL, fields: FIELDS, maxResults: 100, ...(nextPageToken ? { nextPageToken } : {}) }),
    });
    if (!res.ok) throw new Error(`Jira answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = await res.json();
    (body.issues || []).forEach((i) => rows.push(shape(i)));
    if (body.isLast || !body.nextPageToken) return rows;
    nextPageToken = body.nextPageToken;
  }
  throw new Error('Stopped after 50 pages; check the JQL.');
}

async function main() {
  const raw = await fetchAll();
  if (raw.length === 0) throw new Error('Jira returned no issues; keeping the previous data.');
  const issues = tidy(raw).sort((a, b) => Number(a.key.split('-')[1]) - Number(b.key.split('-')[1]));
  const data = { project: PROJECT, synced_at: new Date().toISOString(), issues };
  const tmp = OUT + '.tmp';
  await writeFile(tmp, JSON.stringify(data, null, 1) + '\n');
  await rename(tmp, OUT);
  console.log(`Saved ${issues.length} issues (${issues.filter((r) => r.status === 'Done').length} done) from ${raw.length} in Jira.`);
}

// Build the first data file from a saved row list: node scripts/fetch-jira.mjs --from rows.json
async function fromFile(file) {
  const rows = JSON.parse(await readFile(file, 'utf8'));
  const issues = tidy(rows);
  await writeFile(OUT, JSON.stringify({ project: PROJECT, synced_at: new Date().toISOString(), issues }, null, 1) + '\n');
  console.log(`Saved ${issues.length} issues from ${file}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--from');
  (i > -1 ? fromFile(process.argv[i + 1]) : main()).catch((e) => { console.error(e.message); process.exit(1); });
}
