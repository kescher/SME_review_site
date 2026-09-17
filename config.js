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
  CLIENT_ID: '',

  // Scopes requested from the reviewer's own Google account. Trim this to the
  // minimum your setup actually needs — fewer scopes means a milder consent
  // screen. With DATA_SOURCE 'static' and PDFs bundled by `--pdfs`, only
  // openid/email/profile, drive.file and documents are required.
  SCOPES: [
    'openid', 'email', 'profile',                            // who is reviewing
    'https://www.googleapis.com/auth/spreadsheets.readonly', // rubric + roster
    'https://www.googleapis.com/auth/drive.readonly',        // transcript PDFs
    'https://www.googleapis.com/auth/drive.file',            // the answer doc
    'https://www.googleapis.com/auth/documents',             // write answers
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
  // Drive folder the generated answer docs are moved into. Reviewers need
  // edit access to it; leave blank to keep docs in the reviewer's own Drive.
  RESPONSES_FOLDER_ID: '',

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
