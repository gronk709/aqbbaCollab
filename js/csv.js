/* ==========================================================================
   Minimal CSV parse/build helpers — no external library. This app has no
   build step (plain ES modules, no package.json), so pulling in a CSV
   package would mean a CDN script tag for one small, well-understood format
   rather than a few dozen lines here. Handles the RFC4180 basics bulk
   upload actually needs: quoted fields, escaped quotes ("" inside a quoted
   field), commas/newlines inside quotes, and either \n or \r\n line endings.
   ========================================================================== */

/* Returns an array of row objects keyed by the header row, lowercased and
   trimmed — callers look fields up as row['hive id'], row['date'], etc.,
   so a template edited in a spreadsheet app (which may re-case or pad
   headers) still matches. Every value is a trimmed string; a short row
   (fewer commas than the header has columns) just gets '' for the rest. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      pushField();
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      pushField();
      pushRow();
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) { pushField(); pushRow(); }

  const nonBlank = rows.filter((r) => r.some((v) => v.trim() !== ''));
  if (!nonBlank.length) return [];

  const headers = nonBlank[0].map((h) => h.trim().toLowerCase());
  return nonBlank.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (r[idx] ?? '').trim(); });
    return obj;
  });
}

/* Quotes a field only if it needs it (contains a comma, quote, or newline)
   — keeps the common case (plain words/numbers) readable unquoted. */
function csvField(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsvLine(fields) {
  return fields.map(csvField).join(',');
}

export function buildCsvText(headerRow, sampleRows = []) {
  return [headerRow, ...sampleRows].map(toCsvLine).join('\r\n') + '\r\n';
}

/* Triggers a browser download of a CSV template/export — no server
   round-trip needed, this is just a client-side Blob + temporary anchor
   click, the standard way to hand the browser a file to save. */
export function downloadCsvFile(filename, csvText) {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
