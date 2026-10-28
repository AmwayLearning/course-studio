/**
 * Course Studio — Google Apps Script backend
 *
 * Keeps the list of courses in this Google Sheet ("Courses" tab) and the
 * course files in a Google Drive folder called "Course Studio files".
 * Big files are stored in 3 MB pieces so even 80 MB packages fit.
 *
 * One-time setup (full click-by-click steps are in SETUP-STEPS.md):
 *   1. Change EDITOR_PIN below to your own PIN (at least 4 characters).
 *   2. Save, pick "setup" in the function list and click Run. Allow access.
 *   3. Deploy → New deployment → Web app → Execute as: Me,
 *      Who has access: Anyone → Deploy. Copy the Web app URL.
 *   4. Paste the URL into index.html (the STUDIO_API_URL line).
 *
 * To change the PIN later: edit EDITOR_PIN, save, run "setup" again.
 * Running setup again never deletes anything.
 *
 * Reading (listing courses, previewing, downloading) needs no PIN, so anyone
 * with the studio link can view courses. Creating, editing and deleting need
 * the PIN.
 */

const EDITOR_PIN = 'CHANGE-ME';   // ← your editor PIN

const SHEET = 'Courses';
const LOG = 'Change log';
const HEADERS = ['id', 'title', 'description', 'category', 'kind', 'status', 'author', 'lessonCount', 'fileCount',
  'size', 'activityId', 'thumbnail', 'blobs', 'created', 'updated', 'updatedBy'];

/* ------------------------------------------------------------- setup -- */
function setup() {
  if (!EDITOR_PIN || EDITOR_PIN === 'CHANGE-ME' || String(EDITOR_PIN).length < 4) {
    throw new Error('Set EDITOR_PIN at the top of this file to your own PIN (at least 4 characters), save, and run setup again.');
  }
  const props = PropertiesService.getScriptProperties();
  props.setProperty('EDITOR_PIN', String(EDITOR_PIN));

  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET) || ss.insertSheet(SHEET);
  if (sh.getLastRow() === 0) sh.appendRow(HEADERS);
  else {
    const have = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    HEADERS.forEach(h => { if (have.indexOf(h) < 0) sh.getRange(1, sh.getLastColumn() + 1).setValue(h); });
  }
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#edf1fe');

  let log = ss.getSheetByName(LOG);
  if (!log) {
    log = ss.insertSheet(LOG);
    log.appendRow(['time', 'who', 'action', 'course id', 'course title']);
    log.setFrozenRows(1);
    log.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#fff0eb');
  }

  root_();   // creates the Drive folder
  const s1 = ss.getSheetByName('Sheet1');
  if (s1 && s1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s1);
  Logger.log('Setup done. Drive folder: ' + root_().getUrl());
}

function root_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('ROOT_FOLDER');
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  const f = DriveApp.createFolder('Course Studio files');
  props.setProperty('ROOT_FOLDER', f.getId());
  return f;
}
function courseFolder_(id, create) {
  const root = root_();
  const it = root.getFoldersByName(id);
  if (it.hasNext()) return it.next();
  return create ? root.createFolder(id) : null;
}

/* ------------------------------------------------------------- web app -- */
function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (!p.action || p.action === 'list') return json_({ ok: true, courses: readAll_() });
    if (p.action === 'chunk') return json_({ ok: true, data: readChunk_(p.id, p.name, p.v, p.i) });
    if (p.action === 'ping') return json_({ ok: true });
    return json_({ ok: false, error: 'Unknown action.' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents || '{}'); } catch (err) { return json_({ ok: false, error: 'Bad request.' }); }
  try {
    const check = checkPin_(b.pin);
    if (!check.ok) return json_(check);
    const who = String(b.who || 'Editor').slice(0, 60);
    if (b.action === 'verify') return json_({ ok: true });
    if (b.action === 'chunk') { writeChunk_(b.id, b.name, b.v, b.i, b.data); return json_({ ok: true }); }
    if (b.action === 'log') return json_({ ok: true, log: readLog_(50) });

    const lock = LockService.getScriptLock();
    lock.waitLock(25000);
    try {
      if (b.action === 'saveMeta') { saveMeta_(b.course || {}, who); return json_({ ok: true, courses: readAll_() }); }
      if (b.action === 'delete') { remove_(String(b.id || ''), who); return json_({ ok: true, courses: readAll_() }); }
    } finally { lock.releaseLock(); }
    return json_({ ok: false, error: 'Unknown action.' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

/* ------------------------------------------------------------- helpers -- */
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function checkPin_(pin) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('pinFails') || 0);
  if (fails >= 10) return { ok: false, error: 'Too many wrong PINs. Wait 10 minutes and try again.' };
  const real = PropertiesService.getScriptProperties().getProperty('EDITOR_PIN');
  if (!real) return { ok: false, error: 'Course Studio is not set up yet. Run the "setup" function in Apps Script.' };
  if (String(pin || '') !== real) { cache.put('pinFails', String(fails + 1), 600); return { ok: false, error: 'That PIN is not correct.', badPin: true }; }
  return { ok: true };
}

const safeId_ = id => { id = String(id || ''); if (!/^[A-Za-z0-9._-]{1,80}$/.test(id)) throw new Error('Bad course ID.'); return id; };
const safeName_ = n => { n = String(n || ''); if (!/^[A-Za-z0-9._-]{1,80}$/.test(n)) throw new Error('Bad file name.'); return n; };
const partName_ = (name, v, i) => safeName_(name) + '.v' + Number(v) + '.p' + Number(i);

function writeChunk_(id, name, v, i, data) {
  const folder = courseFolder_(safeId_(id), true);
  const fname = partName_(name, v, i);
  const old = folder.getFilesByName(fname);
  while (old.hasNext()) old.next().setTrashed(true);
  folder.createFile(Utilities.newBlob(Utilities.base64Decode(String(data || '')), 'application/octet-stream', fname));
}
function readChunk_(id, name, v, i) {
  const folder = courseFolder_(safeId_(id), false);
  if (!folder) throw new Error('This course has no files.');
  const it = folder.getFilesByName(partName_(name, v, i));
  if (!it.hasNext()) throw new Error('A piece of this course is missing (' + name + ').');
  return Utilities.base64Encode(it.next().getBlob().getBytes());
}

function sheet_() { const sh = SpreadsheetApp.getActive().getSheetByName(SHEET); if (!sh) throw new Error('Run the "setup" function in Apps Script first.'); return sh; }
function readAll_() {
  const values = sheet_().getDataRange().getValues();
  const head = values.shift().map(String);
  return values.filter(r => String(r[0] || '').trim()).map(r => {
    const o = {};
    head.forEach((h, i) => { let v = r[i]; if (v instanceof Date) v = v.toISOString(); o[h] = v; });
    try { o.blobs = o.blobs ? JSON.parse(o.blobs) : {}; } catch (e) { o.blobs = {}; }
    ['lessonCount', 'fileCount', 'size'].forEach(k => { o[k] = o[k] === '' ? null : Number(o[k]); });
    return o;
  });
}
const clean_ = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, max || 500);

function saveMeta_(c, who) {
  const id = safeId_(c.id);
  const thumb = String(c.thumbnail || '');
  if (thumb.length > 48000) throw new Error('The thumbnail picture is too big.');
  if (thumb && !/^data:image\/(jpeg|png|webp);base64,/.test(thumb)) throw new Error('The thumbnail must be a picture.');
  const blobs = {};
  Object.keys(c.blobs || {}).forEach(k => { const b = c.blobs[k] || {}; blobs[safeName_(k)] = { v: Number(b.v) || 1, parts: Number(b.parts) || 1, size: Number(b.size) || 0 }; });

  const sh = sheet_(), values = sh.getDataRange().getValues(), head = values[0].map(String);
  let row = 0; for (let i = 1; i < values.length; i++) if (String(values[i][0]) === id) { row = i + 1; break; }
  const now = new Date().toISOString();
  const prev = {}; if (row) head.forEach((h, i) => { prev[h] = values[row - 1][i]; });
  const rec = {
    id, title: clean_(c.title, 200) || 'Untitled course', description: clean_(c.description, 2000), category: clean_(c.category, 80),
    kind: c.kind === 'package' ? 'package' : 'authored', status: c.status === 'Draft' ? 'Draft' : 'Published', author: clean_(c.author, 80),
    lessonCount: c.lessonCount == null ? '' : Number(c.lessonCount), fileCount: c.fileCount == null ? '' : Number(c.fileCount), size: Number(c.size) || 0,
    activityId: clean_(c.activityId, 400), thumbnail: thumb, blobs: JSON.stringify(blobs),
    created: prev.created instanceof Date ? prev.created.toISOString() : (prev.created || now), updated: now, updatedBy: who,
  };
  const out = head.map(h => rec[h] !== undefined ? rec[h] : (prev[h] !== undefined ? prev[h] : ''));
  if (row) sh.getRange(row, 1, 1, head.length).setValues([out]); else sh.appendRow(out);
  log_(who, row ? 'Edited' : 'Added', id, rec.title);
  tidy_(id, blobs);
}

// remove older versions of a course's files once a new version is saved
function tidy_(id, blobs) {
  const folder = courseFolder_(id, false); if (!folder) return;
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next(), m = f.getName().match(/^(.+)\.v(\d+)\.p(\d+)$/);
    if (!m || /^asset-/.test(m[1])) continue;
    const keep = blobs[m[1]];
    if (keep && Number(m[2]) !== keep.v) f.setTrashed(true);
    else if (keep && Number(m[3]) >= keep.parts) f.setTrashed(true);
  }
}

function remove_(id, who) {
  id = safeId_(id);
  const sh = sheet_(), values = sh.getDataRange().getValues();
  for (let i = values.length - 1; i >= 1; i--) {
    if (String(values[i][0]) === id) {
      sh.deleteRow(i + 1);
      const folder = courseFolder_(id, false); if (folder) folder.setTrashed(true);
      log_(who, 'Deleted', id, values[i][1]);
      return;
    }
  }
  throw new Error('That course is no longer in the studio.');
}

function log_(who, action, id, title) {
  const log = SpreadsheetApp.getActive().getSheetByName(LOG);
  if (!log) return;
  const now = new Date();
  // the editor saves every few seconds: keep one "Edited" line per person and course for each 10 minutes
  if (action === 'Edited' && log.getLastRow() > 1) {
    const last = log.getRange(log.getLastRow(), 1, 1, 5).getValues()[0];
    if (last[1] === who && last[2] === 'Edited' && String(last[3]) === String(id) && now - new Date(last[0]) < 10 * 60 * 1000) {
      log.getRange(log.getLastRow(), 1, 1, 5).setValues([[now.toISOString(), who, action, id, title]]);
      return;
    }
  }
  log.appendRow([now.toISOString(), who, action, id, title]);
}
function readLog_(n) {
  const log = SpreadsheetApp.getActive().getSheetByName(LOG);
  if (!log || log.getLastRow() < 2) return [];
  const start = Math.max(2, log.getLastRow() - n + 1);
  return log.getRange(start, 1, log.getLastRow() - start + 1, 5).getValues().reverse()
    .map(r => ({ time: r[0] instanceof Date ? r[0].toISOString() : String(r[0]), who: r[1], action: r[2], id: r[3], title: r[4] }));
}
