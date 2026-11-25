// CipherTrivia website leads: the site's contact function (site/netlify/functions/contact.mjs)
// posts every enquiry here and this script adds it to the sheet as a row. It runs inside the
// Google Sheet (Apps Script), not on Netlify; this copy is the reference.
//
// Set up once:
// 1. In the Google Sheet: Extensions > Apps Script. Replace all the code there with this file and
//    Save. Nothing to edit: the website's key (LEADS_SHEET_KEY in Netlify) is learnt from the first
//    enquiry the site sends, and from then on only posts with that key are accepted.
// 2. Deploy > New deployment > Select type: Web app. Execute as: Me. Who has access: Anyone.
//    Deploy, allow access with your Google account, and copy the Web app URL. To check it, open the
//    URL in a browser: it shows {"ok":true,"script":"CipherTrivia leads","version":2,...}.
// 3. Netlify > Site configuration > Environment variables: LEADS_SHEET_URL = the Web app URL and
//    LEADS_SHEET_KEY = any long random text, then deploy the site again.
//
// Enquiries go to the "Leads" tab and likely spam to "Spam"; each tab and its header row are made
// the first time they are needed. Columns are filled by their header name, so you can move them
// or add your own (Status, Notes...) anywhere.
// Changed LEADS_SHEET_KEY in Netlify? Run resetKey once here (choose it beside Run, then Run).
// After editing this script, publish the change with Deploy > Manage deployments > Edit >
// Version: New version, or the old code keeps running at the same URL.

const VERSION = 2;
const COLUMNS = ['Received', 'Name', 'Email', 'Phone', 'Company', 'Service', 'Message', 'Form', 'Page',
  'Source', 'Campaign', 'Landing page', 'Google click ID'];

// Opening the web app URL in a browser shows which version is live there
function doGet() {
  const keySet = Boolean(PropertiesService.getScriptProperties().getProperty('KEY'));
  return reply({ ok: true, script: 'CipherTrivia leads', version: VERSION, keySet: keySet });
}

function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply({ ok: false, error: 'unreadable request' });
  }
  if (!data.key) return reply({ ok: false, error: 'no key' });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    // The first enquiry after setup fixes the key; later posts must bring the same one
    const props = PropertiesService.getScriptProperties();
    const known = props.getProperty('KEY');
    if (!known) props.setProperty('KEY', data.key);
    else if (known !== data.key) return reply({ ok: false, error: 'wrong key (LEADS_SHEET_KEY changed? run resetKey in the script)' });

    const tab = data.tab === 'Spam' ? 'Spam' : 'Leads';
    const book = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = book.getSheetByName(tab) || book.insertSheet(tab);
    if (sheet.getLastRow() === 0) {
      const titles = tab === 'Spam' ? COLUMNS.concat('Reason') : COLUMNS;
      sheet.appendRow(titles);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, titles.length).setFontWeight('bold');
    }
    const head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const row = Object.assign({}, data.row, { Received: new Date() });
    sheet.appendRow(head.map(function (h) { return h in row ? cell(row[h]) : ''; }));
  } finally {
    lock.releaseLock();
  }
  return reply({ ok: true });
}

// Forget the learnt key: the next enquiry from the site sets it again
function resetKey() {
  PropertiesService.getScriptProperties().deleteProperty('KEY');
}

// Text that starts like a formula (= + - @), phone numbers included, is kept as plain text
function cell(value) {
  if (value instanceof Date) return value;
  const s = String(value == null ? '' : value);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
