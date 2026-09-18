# SME Review Platform

A static web app for subject-matter expert review of AI legal-assistance
transcripts, across five domains: bankruptcy, immigration, personal injury,
family law and foreclosure.

Each reviewer signs in, chooses their area of expertise, reads a project
overview, then a page introducing the first case, then works through its five transcripts — the conversation PDF on the
left, the turn-by-turn rubric and questions on the right. After the fifth, the
next case's page appears. The judicial opinion behind each case is one click
away throughout, from the case page and from the progress rail. After the last transcript there is a closing page for
anything the per-transcript questions did not cover. Answers are appended to a
Google Doc as they are submitted.

The overview is shown once, before the first case, and stays reachable from the
header. Its wording lives in `js/ui/welcome.js` and follows
`assets/project_overview.pdf`, which reviewers can download from the page.

50 transcripts in total: 5 domains × 2 cases × 5 transcripts.

## Where the data comes from

`transcripts/` is the source of truth. Each domain folder holds its PDFs plus a
`UPLBench SME Review - <Domain>.md` describing both cases — the case brief, the
prompt components, the rubric, and the five transcripts in order.

```bash
node tools/build-study.mjs
```

parses those documents into `data/study.json`, which the site reads as a plain
static file. No Google credentials are needed for any of it, and the PDFs are
served straight from the repo.

Two things the markdown does not carry:

| | Where it comes from |
|---|---|
| Reviewer roster | `reviewers.json`, or the `Reviewers` tab of the sheet |
| Gold labels ("Our labels: Yes, No, Yes") | the Google Sheet |

```bash
node tools/build-study.mjs --sheet
```

merges both in, using a service-account key you keep on your machine. See
[SETUP.md](SETUP.md).

Google is otherwise used only at the end of the chain: each reviewer signs in so
the app can write **their** answers to **their** Google Doc.

## Quick look

```bash
python3 -m http.server 4173
```

Then <http://localhost:4173/?demo=1> — the real flow, no sign-in, nothing
written to Google. Set `ALLOW_DEMO: false` in `config.js` to disable it.

## Layout

```
config.js              all administrator settings
index.html
css/styles.css
js/
  main.js              bootstrap and hash router
  auth.js              Google sign-in
  api/                 http, drive, docs, sheets
  data/                schema (source → review plan), store (state, drafts)
  ui/                  login, instructions, review, done, pdfviewer, editor
tools/
  build-study.mjs      transcripts/ → data/study.json
  google-auth.mjs      service-account JWT, no npm dependencies
  ui/welcome.js        the project overview page
  ui/final.js          the closing page
  ui/domain.js         the area-of-expertise chooser
  ui/opinion.js        the judicial-opinion overlay
assets/                project_overview.pdf, offered as a download
cases/                 judicial opinion PDFs, matched to cases by name
opinions.json          optional: pin an opinion whose file name is unhelpful
transcripts/           PDFs and the per-domain review documents
data/study.json        generated; commit it
reviewers.json         roster, if you are not using the sheet
```

## Notes on method

- **The repository is private**, and needs to stay that way: `study.json`,
  `transcripts/` and `assets/` are served as plain static files with no access
  control of their own.
- **Transcripts are not blinded.** The app does not name the model, but the PDFs
  themselves carry a `Model:` field on page 1. Regenerate them without that
  header if blind review matters.
- Model and condition are recorded in each answer document alongside the
  reviewer's text, so results stay attributable.
- Reviewers pick their own area of expertise and can switch from the header;
  progress is tracked separately per area.
- Progress saves as reviewers type and resumes on any device — the answer doc is
  the record of what has already been submitted. Submitted answers are also kept
  locally, so returning to an earlier transcript shows what was written; that
  part is per-browser, not per-account.
