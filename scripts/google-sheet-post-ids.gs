/** Bound to the publishing spreadsheet. Edits only the current document; no network or account access. */
function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(function (v) { return String(v).trim().toLowerCase(); });
  const idColumn = headers.indexOf('post id');
  if (idColumn < 0 || headers.indexOf('design') < 0 || headers.indexOf('platform') < 0) return;
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(3000)) return;
  try {
    const first = Math.max(2, e.range.getRow()), last = e.range.getLastRow();
    if (first > last) return;
    const contentColumns = ['date', 'time', 'post title', 'caption', 'design', 'thumbnail', 'platform', 'media type'].map(function (h) { return headers.indexOf(h); }).filter(function (i) { return i >= 0; });
    const rows = sheet.getRange(first, 1, last - first + 1, headers.length).getValues();
    rows.forEach(function (row, offset) {
      if (String(row[idColumn] || '').trim() || !contentColumns.some(function (i) { return String(row[i] || '').trim(); })) return;
      // Recheck the exact cell under the document lock; never replace a manually supplied or existing ID.
      const cell = sheet.getRange(first + offset, idColumn + 1);
      if (cell.isBlank()) cell.setValue('ENG-' + Utilities.getUuid());
    });
  } finally { lock.releaseLock(); }
}
