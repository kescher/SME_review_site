# Setup

The case data already works with no credentials at all. Google is needed for two
things only: the gold labels and roster (read once, by you) and each reviewer's
answer document (written by them).

---

## 1. Build the study data

```bash
node tools/build-study.mjs --check   # report what parsed, write nothing
node tools/build-study.mjs           # write data/study.json
```

The builder reads `transcripts/<Domain>/UPLBench SME Review - <Domain>.md` and
pulls out, per case: the citation, the case brief, the prompt components, the
rubric for each of the three turns, and the five sample transcripts in the order
they are listed. It warns if a listed PDF is missing or a case does not have
exactly five.

Commit `data/study.json` — the published site reads it directly.

Re-run it whenever `transcripts/` changes.

### Adding a domain or case

Follow the existing shape: a `## CASE n: <citation>` heading with `### Case
Brief`, `### Prompt Components`, `### Rubric` and `### Sample Transcripts`
beneath it. Folder names map to domains in `DOMAIN_KEY` at the top of
`tools/build-study.mjs`.

---

## 2. The project overview page

`js/ui/welcome.js` holds the text of the page reviewers see before their first
case. It follows `assets/project_overview.pdf`, which is linked from the page as
a download — replace both if the wording changes.

Reviewers see it once; the header link brings them back to it. The "seen" flag
is per browser, so a reviewer on a new machine sees it again.

---

## 3. The judicial opinions

Put the opinion PDFs in `cases/`, either flat or in domain subfolders:

```
cases/Bankruptcy/The Florida Bar v. Catarcio.pdf
cases/Bankruptcy/In re Torres.pdf
```

The builder matches each file to a case by name — first by containment, then by
distinctive words with legal boilerplate (`the`, `v`, `inc`, `bar`, `assn`,
`counsel`…) ignored, so trailing spaces, expanded abbreviations and appended
citations all still match. Ambiguous matches are reported rather than guessed.

Nesting does not matter — `cases/<Domain>/x.pdf`, `cases/cases/<Domain>/x.pdf`
and a flat `cases/x.pdf` all work, since the domain is taken from whichever path
component names one.

**Name each file after the case**, as the case overview page titles it. The
builder lists every unmatched file and every case left without an opinion.

For a file whose name cannot identify the case — a download named after its
docket number, say — pin it in `opinions.json` at the project root instead of
renaming:

```json
{
  "Disciplinary Couns. v. Foreclosure Alternatives, Inc.": "cases/Foreclosure/671675.pdf"
}
```

Keys are the case title exactly as the builder prints it, or `<domain>/<case-id>`
(e.g. `foreclosure/case-1`). Keys beginning with `_` are ignored, so you can
leave comments. Paths work written from the project root or from inside
`cases/`.

The rubric parsed from each case's `### Rubric` table is shown twice: on the
case page, in a table pairing each of the three requests with its No UPL / Yes
UPL criteria, and again beside every transcript while reviewing.

Reviewers reach the opinion two ways, both labelled **Read judicial opinion**:
a link near the top of the case page, and a button beside the case name in the
progress rail, which stays visible through all five transcripts. Either opens an
overlay over the current screen, with an "open in new tab" link.

Cases with no opinion simply show no button — nothing else changes.

---

## 4. The questions

`CONFIG.QUESTIONS` in `config.js` holds the three questions asked about every
transcript; `CONFIG.FINAL_QUESTIONS` holds the closing page shown once, after
the last transcript. Both take `label`, `help` and `required`.

Changing a question's `id` discards any drafts saved under the old id, so edit
the wording freely but leave ids alone once reviewing has started.

---

## 5. The reviewer roster

Reviewers **choose their own area of expertise** after signing in, so the roster
is an allowlist plus a default, not an assignment. A reviewer may switch areas
from the header at any time; progress is tracked per area.

Either edit `reviewers.json`:

```json
[
  { "email": "someone@example.edu", "name": "A Reviewer", "domain": "bankruptcy" }
]
```

`domain` must be one of `bankruptcy`, `immigration`, `personal_injury`,
`family_law`, `foreclosure`. It is shown on the chooser as "Assigned to you" and
preselected, but the reviewer may pick any area. Leave it blank to express no
preference.

Or keep it on a `Reviewers` tab in the spreadsheet with `email`, `name` and
`domain` columns, and use `--sheet` below.

> The roster decides who may sign in, not what they review. It is not a
> security boundary either — see [Access](#access).

---

## 6. Gold labels from the spreadsheet

The markdown carries no "Our labels: Yes, No, Yes" values, so those come from the
sheet. This needs a service-account key, used only on your machine.

1. <https://console.cloud.google.com> → create or pick a project.
2. **APIs & Services → Library** → enable **Google Sheets API**, **Google Drive
   API** and **Google Docs API**.
3. **Credentials → Create credentials → Service account**, any name.
4. Open it → **Keys → Add key → Create new key → JSON**.
5. Save it as `tools/credentials.json` (already in `.gitignore`), or point
   `GOOGLE_APPLICATION_CREDENTIALS` at it.
6. Share the spreadsheet with the service account's `client_email` as Viewer.

Then:

```bash
node tools/build-study.mjs --sheet
```

It matches each spreadsheet row to a parsed transcript by PDF name or model
name, copies the first column whose header contains "label", and reports every
row it could not match. Check that report — if the counts look wrong, tell me
the column names and I will adjust the matching.

---

## 7. OAuth client, so reviewers can sign in

Google renamed this area to **Google Auth Platform**. Direct links below, since
the left-hand nav moves around.

### a. Project and APIs

<https://console.cloud.google.com/apis/library> — pick or create a project, then
enable:

- **Google Docs API**
- **Google Drive API**
- **Google Sheets API** (only if you run `--sheet` for the gold labels)

### b. Configure the auth platform

<https://console.cloud.google.com/auth/overview>

If it has never been set up, click **Get started** and complete four steps:

| Step | What to enter |
|---|---|
| App Information | App name (e.g. `UPLBench SME Review`), your support email |
| Audience | **External** |
| Contact Information | your email |
| Finish | agree, Create |

### c. Add the reviewers as test users

<https://console.cloud.google.com/auth/audience>

Confirm **User type: External**, **Publishing status: Testing**, then under
**Test users → Add users** add every reviewer's Google address, plus your own.

Leave it in Testing. Publishing starts a verification review you do not need for
a study of this size. Testing allows up to 100 users.

### d. Declare the scopes

<https://console.cloud.google.com/auth/scopes> → **Add or remove scopes**

```
openid
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/userinfo.profile
https://www.googleapis.com/auth/drive.file
https://www.googleapis.com/auth/documents
```

Nothing else. `drive.readonly` is a *restricted* scope and would pull you into a
verification review and a third-party security assessment; the app does not use
it. These must match `CONFIG.SCOPES` in `config.js`.

### e. Create the client

<https://console.cloud.google.com/auth/clients> → **Create client**

- **Application type:** Web application
- **Name:** anything
- **Authorised JavaScript origins:**
  ```
  http://localhost:4173
  https://<your-github-username>.github.io
  ```
- **Authorised redirect URIs:** leave empty

Origins are scheme + host only — no path, no trailing slash. Even when the site
is served at `https://you.github.io/sme-review/`, the origin is
`https://you.github.io`. A path here makes Google reject the sign-in.

Copy the client ID (`…​.apps.googleusercontent.com`) into `CONFIG.CLIENT_ID`. It
is not a secret; it ships in the JavaScript and is safe to commit.

### If "External" is unavailable

A Workspace organisation can restrict projects to Internal only. Internal limits
sign-in to that domain, which will not work for outside reviewers. Create the
project under a personal Google account instead — everything else is identical.

### First sign-in

Testing-mode apps show an "unverified app" warning. Reviewers click **Advanced →
Continue**. Warn them in advance so it does not look broken.

---

## 8. Configure and deploy

```js
CLIENT_ID: '<your oauth client id>',
DATA_SOURCE: 'static',
ALLOW_DEMO: false,                                 // for the live deployment
RESPONSES_FOLDER_ID: '<folder for answer docs>',
ADMIN_EMAIL: 'you@example.com',
```

Push to `main`. `.github/workflows/pages.yml` publishes the repository as-is.
Enable Pages once under **Settings → Pages → Source: GitHub Actions**.

### Where answers go

Each reviewer gets one doc, `SME Review — Name (email)`, created by **their own**
Google account — which is why it starts in their Drive, not yours. Two settings
move it somewhere you can reach:

```js
RESPONSES_FOLDER_ID: '<folder id>',   // move the doc into a folder you own
ADMIN_EMAIL: '',                      // or: share the doc with you in place
```

Set neither and the answers are stranded across ten separate Drives.

**This study uses the folder**, already set in `config.js`:

```js
RESPONSES_FOLDER_ID: '1EQhT-6zpQ-6xb59OTMtvwPOOXzdbsVgJ',
```

**Share that folder with every reviewer as Editor** before the study opens.
Viewer is not enough — the move needs write access, and without it the doc stays
in the reviewer's own Drive.

Filing is best-effort by design: if the move fails, the reviewer sees a warning
but carries on, and their answers are still recorded in a document you can
collect afterwards. A failed move never blocks a review.

> Editor access is required for the move to succeed, and Drive has no
> write-only folder. **Every reviewer can therefore open the folder and read
> every other reviewer's answers**, including their names, which are in the
> document titles. This was a considered trade for keeping all responses in one
> place. If reviewers must not see each other, leave `RESPONSES_FOLDER_ID`
> blank and set `ADMIN_EMAIL` instead: the docs then stay in each reviewer's own
> Drive, shared only with you.

Each submission records the reviewer's three answers plus a provenance line with
the model and condition. The closing page is appended once at the end.

---

## Access

**This repository is private**, which is what makes the rest of this safe: the
case data is served as static files with no access control of its own.

- **`data/study.json`, `transcripts/` and `assets/`** are readable by anyone who
  can load the site. GitHub Pages on a private repository restricts that to
  people with repository access — which needs a paid GitHub plan. If the
  repository is ever made public, every transcript, rubric and gold label
  becomes public with it.
- **Answer docs** are written by each reviewer's own Google account and moved
  into your responses folder. Everyone with access to that folder — you and all
  reviewers — can read them. Reviewers are not isolated from each other by
  design; see "Where answers go".
- **The roster** decides what the app shows someone. It is baked into
  `study.json`, so it is an assignment list, not a security control.
- **`?demo=1`** lets anyone who can load the site walk the flow without signing
  in. It writes nothing to Google. Set `ALLOW_DEMO: false` for the live
  deployment.

## A note on blinding

The app does not display the model name. The PDFs do: page 1 of each transcript
carries `Model:` and `Jurisdiction:` fields. If blind review matters,
regenerate the PDFs without that header — no change to this app is needed.

---

## Troubleshooting

**"is not on the reviewer roster"** — their Google address is not in
`reviewers.json` / the `Reviewers` tab, or does not match. Rebuild after editing.

**A transcript pane says no PDF is linked** — the markdown lists a file that is
not in the folder. `--check` names it.

**403 from `--sheet`** — the spreadsheet has not been shared with the service
account's `client_email`.

**Nothing loads; console shows an origin error** — the Pages URL is not listed
under Authorised JavaScript origins on the OAuth client.

**Answers save but you cannot find the docs** — the reviewer probably lacks
Editor access to the responses folder, so the move failed and the doc stayed in
their Drive. They would have seen a warning after signing in; the browser
console records the underlying Drive error.
