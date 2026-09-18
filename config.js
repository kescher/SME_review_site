/* ---------------------------------------------------------------------------
 * SME Review Platform — configuration
 *
 * Everything an administrator needs to change lives in this one file.
 * It is plain JavaScript so it can be edited without any build tooling.
 * ------------------------------------------------------------------------- */

export const CONFIG = {

  /* -- Google OAuth ------------------------------------------------------ */
  // OAuth 2.0 Web Application client ID from Google Cloud Console.
  // Authorised JavaScript origin must include your GitHub Pages URL.
  CLIENT_ID: '711515548082-afm59b0jgon9t9732r9njuhr43lfi76g.apps.googleusercontent.com',

// client secret: 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

  // Scopes requested from the reviewer's own Google account.
  //
  // This is the minimum the app actually uses: case data comes from
  // data/study.json and the PDFs are served from the repo, so nothing here
  // reads the reviewer's Drive or your spreadsheet at runtime. Keeping it this
  // short matters — `drive.readonly` is one of Google's *restricted* scopes,
  // and asking for it is what would pull you into a verification review and a
  // third-party security assessment.
  //
  // `drive.file` only grants access to files this app itself creates, which is
  // exactly the reviewer's own answer document.
  //
  // Switching DATA_SOURCE back to 'sheets', or serving transcripts from Drive
  // rather than the repo, would need 'spreadsheets.readonly' and
  // 'drive.readonly' added back here.
  SCOPES: [
    'openid', 'email', 'profile',                     // who is reviewing
    'https://www.googleapis.com/auth/drive.file',     // create + file the answer doc
    'https://www.googleapis.com/auth/documents',      // write into it
  ].join(' '),

  /* -- Source data ------------------------------------------------------- */
  // Spreadsheet holding the roster, the case instructions and the rubric rows.
  SHEET_ID: '1Cm27efZz31UfX3BUpzW5IHK58lS5HSOukWnHKCJXrYw',

  // Roster tab: which reviewer is assigned to which domain.
  REVIEWERS_TAB: 'Reviewers',

  // One tab per domain, holding that domain's cases and transcripts.
  // Left side = domain key, right side = the exact tab name in the sheet.
  DOMAIN_TABS: {
    bankruptcy:      'Bankruptcy',
    immigration:     'Immigration',
    personal_injury: 'Personal Injury',
    family_law:      'Family Law',
    foreclosure:     'Foreclosure',
  },

  // Optional tab holding the per-case instructions pages. If a domain tab
  // already carries an `instructions` column, this tab is not needed.
  INSTRUCTIONS_TAB: 'Instructions',

  // Drive folder containing the transcript PDFs. Only needed when rows
  // identify a PDF by file name rather than by file id.
  PDF_FOLDER_ID: '',

  /* -- Answer output ----------------------------------------------------- */
  // Drive folder every reviewer's answer document is moved into.
  //
  // Reviewers need *Editor* access to this folder for the move to succeed, and
  // Drive has no write-only folder — so each reviewer can open the folder and
  // read every other reviewer's answers. That is an accepted trade for keeping
  // all responses in one place you own. Use ADMIN_EMAIL instead if reviewers
  // must not see each other.
  //
  // The id is the last path segment of the folder's URL:
  //   https://drive.google.com/drive/folders/<THIS PART>
  RESPONSES_FOLDER_ID: '1EQhT-6zpQ-6xb59OTMtvwPOOXzdbsVgJ',

  // Address given writer access to every answer doc. Leave blank to skip.
  ADMIN_EMAIL: '',

  // Title of the per-reviewer answer doc. {name} and {email} are substituted.
  DOC_TITLE: 'SME Review — {name} ({email})',

  /* -- Review flow ------------------------------------------------------- */
  // Transcripts shown per case before the next instructions page.
  TRANSCRIPTS_PER_CASE: 5,

  // Questions asked about every transcript. Edit freely; `id` is what gets
  // stored in drafts, so changing an id discards existing drafts for it.
  QUESTIONS: [
    {
      id: 'rubrics',
      label: 'Did we apply the rubric correctly, and do you have other feedback ' +
             'on the prompts or rubric?',
      help: 'Our labels are shown above. Tell us where you agree or disagree and ' +
            'why — and flag anything in the prompts or rubric that does not ' +
            'capture the judicial reasoning or your experience in this domain.',
      required: true,
    },
    {
      id: 'advice',
      label: 'What is your opinion of the legal advice/information provided by the model in this conversation?',
      required: true,
    },
    {
      id: 'service',
      label: 'What is your opinion of the quality of the legal service provided by the model in this conversation?',
      required: true,
    },
  ],

  // Asked once, on the closing page, after the last transcript.
  FINAL_QUESTIONS: [
    {
      id: 'anything_else',
      label: 'Is there anything else we should know about that we have not ' +
             'asked for?',
      help: 'Observations about the domain, the study design, patterns across ' +
            'the transcripts — anything the per-transcript questions did not ' +
            'give you room for.',
      required: false,
    },
  ],

  /* -- Where case data comes from ---------------------------------------- */
  // 'static' data/study.json, built by `node tools/build-study.mjs` from the
  //          transcripts/ folder. The normal choice.
  // 'sheets' read the spreadsheet live at runtime instead. Requires the
  //          spreadsheet to be shared with every reviewer.
  DATA_SOURCE: 'static',

  DATA_FILE: './data/study.json',

  // ?demo=1 previews the real flow without signing in, writing nothing to
  // Google. Set to false to turn that off entirely.
  ALLOW_DEMO: true,

  // Which domain ?demo=1 shows. Blank uses the first one in the data.
  DEMO_DOMAIN: 'bankruptcy',

  // Set by ?demo=1 at startup; read throughout to skip every Google call.
  DEMO: false,
};

/* Column headers expected in each tab. Change the right-hand side to match
 * your spreadsheet's actual header text — matching is case-insensitive and
 * ignores spaces and underscores. */
export const COLUMNS = {
  reviewers: {
    email:  'email',
    name:   'name',
    domain: 'domain',
  },
  instructions: {
    domain: 'domain',
    caseId: 'case_id',
    title:  'case_title',
    order:  'case_order',
    body:   'instructions',
  },
  // Columns on each domain tab. One row = one transcript.
  transcripts: {
    caseId:       'case_id',
    order:        'transcript_order',
    transcriptId: 'transcript_id',
    pdfFileId:    'pdf_file_id',   // preferred
    pdfFileName:  'pdf_file_name', // fallback, resolved against PDF_FOLDER_ID
    prompt:       'rubric_prompt',
    followup1:    'rubric_followup_1',
    followup2:    'rubric_followup_2',
    labels:       'our_labels',
    // Optional: instructions text carried on the domain tab itself.
    instructions: 'instructions',
    caseTitle:    'case_title',
  },
};

export const DOMAINS = {
  bankruptcy:      'Bankruptcy',
  immigration:     'Immigration',
  personal_injury: 'Personal Injury',
  family_law:      'Family Law',
  foreclosure:     'Foreclosure',
};
