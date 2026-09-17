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

**Name each file after the case**, as the case overview page titles it. A file
named for its docket number (`671675.pdf`) will not match anything; the builder
lists every unmatched file and every case left without an opinion.

Reviewers reach the opinion from a button on the case page and from one in the
progress rail, which stays visible through all five transcripts. It opens in an
overlay over the review screen, with an "open in new tab" link.

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

Either edit `reviewers.json`:

```json
[
  { "email": "someone@example.edu", "name": "A Reviewer", "domain": "bankruptcy" }
]
```

`domain` must be one of `bankruptcy`, `immigration`, `personal_injury`,
`family_law`, `foreclosure`.

Or keep it on a `Reviewers` tab in the spreadsheet with `email`, `name` and
`domain` columns, and use `--sheet` below.

> The roster decides which domain a reviewer is shown. It is not a security
> boundary — see [Access](#access).

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

1. **APIs & Services → OAuth consent screen** → External. Fill in the app name
   and support email.
2. Scopes: `openid`, `email`, `profile`, `.../auth/drive.file`,
   `.../auth/documents`. Nothing more — the PDFs are served from the repo, so
   no Drive read scope is needed.
3. Add every reviewer under **Test users**.
4. **Credentials → Create credentials → OAuth client ID → Web application.**
   Under **Authorised JavaScript origins** add your Pages URL
   (`https://<you>.github.io`) and `http://localhost:4173` for local testing.
5. Put the client ID in `config.js`, and trim `SCOPES` to match step 2.

> While the consent screen is in **Testing**, Google shows an "unverified app"
> warning and allows up to 100 test users. For a known set of reviewers that is
> the right place to stay.

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

One doc per reviewer, `SME Review — Name (email)`, created in their Drive, then
moved into `RESPONSES_FOLDER_ID` (give reviewers **Editor** access to that
folder) and shared with `ADMIN_EMAIL`. Set at least one, or the docs stay in
each reviewer's own Drive where you cannot read them.

Each submission records the reviewer's three answers plus a provenance line with
the model and condition.

---

## Access

**This repository is private**, which is what makes the rest of this safe: the
case data is served as static files with no access control of its own.

- **`data/study.json`, `transcripts/` and `assets/`** are readable by anyone who
  can load the site. GitHub Pages on a private repository restricts that to
  people with repository access — which needs a paid GitHub plan. If the
  repository is ever made public, every transcript, rubric and gold label
  becomes public with it.
- **Answer docs** are written by each reviewer's own Google account. Only they
  and whoever you share the responses folder with can read them. This is a real
  boundary, independent of the repository.
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

**Answers save but you cannot find the docs** — neither `RESPONSES_FOLDER_ID`
nor `ADMIN_EMAIL` is set.
