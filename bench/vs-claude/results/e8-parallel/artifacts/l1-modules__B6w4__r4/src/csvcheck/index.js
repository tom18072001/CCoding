// Module csvcheck — xem mục "csvcheck" trong SPEC.md.

function fail(code, row) {
  const e = new Error(code);
  e.code = code;
  if (row !== undefined) e.row = row;
  return e;
}

function getDelimiter(options) {
  if (options === undefined || options === null) return ',';
  if (typeof options !== 'object') throw fail('CSV_INVALID_INPUT');
  const d = options.delimiter === undefined ? ',' : options.delimiter;
  if (typeof d !== 'string' || Array.from(d).length !== 1 || d === '"' || d === '\r' || d === '\n') {
    throw fail('CSV_INVALID_INPUT');
  }
  return d;
}

export function parseCsv(text, options = {}) {
  if (typeof text !== 'string') throw fail('CSV_INVALID_INPUT');
  const delim = getDelimiter(options);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const n = text.length;
  const rows = [];
  let pos = 0;

  const eatNewline = () => {
    if (text[pos] === '\r' && text[pos + 1] === '\n') pos += 2;
    else pos += 1;
  };

  while (pos < n) {
    if (text[pos] === '\r' || text[pos] === '\n') { eatNewline(); continue; }
    const rowNo = rows.length + 1;
    const fields = [];
    for (;;) {
      let val = '';
      let endRecord = false;
      if (text[pos] === '"') {
        pos++;
        for (;;) {
          if (pos >= n) throw fail('CSV_UNTERMINATED_QUOTE', rowNo);
          const c = text[pos];
          if (c === '"') {
            if (text[pos + 1] === '"') { val += '"'; pos += 2; } else { pos++; break; }
          } else { val += c; pos++; }
        }
        if (pos >= n) endRecord = true;
        else if (text[pos] === delim) pos++;
        else if (text[pos] === '\r' || text[pos] === '\n') { eatNewline(); endRecord = true; }
        else throw fail('CSV_BAD_QUOTE', rowNo);
      } else {
        const start = pos;
        while (pos < n && text[pos] !== delim && text[pos] !== '\r' && text[pos] !== '\n') {
          if (text[pos] === '"') throw fail('CSV_BAD_QUOTE', rowNo);
          pos++;
        }
        val = text.slice(start, pos);
        if (pos >= n) endRecord = true;
        else if (text[pos] === delim) pos++;
        else { eatNewline(); endRecord = true; }
      }
      fields.push(val);
      if (endRecord) break;
    }
    rows.push(fields);
  }
  return rows;
}

const TYPES = ['string', 'int', 'number', 'bool', 'date'];

function isDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (y < 1 || mo < 1 || mo > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return d <= dim;
}

function checkType(type, s) {
  switch (type) {
    case 'int': return /^[+-]?\d+$/.test(s) && Number.isSafeInteger(Number(s));
    case 'number': return /^[+-]?\d+(\.\d+)?$/.test(s) && Number.isFinite(Number(s));
    case 'bool': return /^(true|false)$/i.test(s);
    case 'date': return isDate(s);
    default: return true;
  }
}

function compileSchema(schema) {
  const bad = () => fail('CSV_INVALID_SCHEMA');
  if (schema === null || typeof schema !== 'object' || !Array.isArray(schema.columns) || schema.columns.length === 0) throw bad();
  const seen = new Set();
  return schema.columns.map((col) => {
    if (col === null || typeof col !== 'object' || Array.isArray(col)) throw bad();
    if (typeof col.name !== 'string' || col.name === '' || seen.has(col.name)) throw bad();
    seen.add(col.name);
    const type = col.type === undefined ? 'string' : col.type;
    if (!TYPES.includes(type)) throw bad();
    let re = null;
    if (col.pattern !== undefined) {
      if (typeof col.pattern !== 'string') throw bad();
      try { re = new RegExp(col.pattern); } catch { throw bad(); }
    }
    if (col.enum !== undefined &&
      (!Array.isArray(col.enum) || col.enum.length === 0 || !col.enum.every((x) => typeof x === 'string'))) throw bad();
    for (const k of ['min', 'max']) {
      const v = col[k];
      if (v === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof v !== 'number' || !Number.isFinite(v)) throw bad();
      } else if (type === 'date') {
        if (typeof v !== 'string' || !isDate(v)) throw bad();
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      const v = col[k];
      if (v !== undefined && !(Number.isInteger(v) && v >= 0)) throw bad();
    }
    return { name: col.name, type, col, re };
  });
}

export function validateCsv(text, schema, options = {}) {
  const cols = compileSchema(schema);
  let rows;
  try {
    rows = parseCsv(text, options);
  } catch (e) {
    if (e.code === 'CSV_UNTERMINATED_QUOTE' || e.code === 'CSV_BAD_QUOTE') {
      return { ok: false, rowCount: 0, errors: [{ row: e.row, column: null, code: e.code.slice(4) }] };
    }
    throw e;
  }
  if (rows.length === 0) {
    return { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] };
  }
  const errors = [];
  const header = rows[0];
  const idx = cols.map((c) => header.indexOf(c.name));
  cols.forEach((c, i) => {
    if (idx[i] < 0) errors.push({ row: 1, column: c.name, code: 'MISSING_COLUMN' });
  });
  const uniq = cols.map(() => new Set());
  for (let r = 1; r < rows.length; r++) {
    const rec = rows[r];
    const row = r + 1;
    if (rec.length !== header.length) {
      errors.push({ row, column: null, code: 'ROW_LENGTH' });
      continue;
    }
    cols.forEach((c, i) => {
      if (idx[i] < 0) return;
      const s = rec[idx[i]];
      const k = c.col;
      const err = (code) => errors.push({ row, column: c.name, code });
      if (s === '') { if (k.required) err('REQUIRED'); return; }
      if (!checkType(c.type, s)) { err('TYPE'); return; }
      if (k.enum !== undefined && !k.enum.includes(s)) err('ENUM');
      if (c.re && !c.re.test(s)) err('PATTERN');
      const len = (k.minLength !== undefined || k.maxLength !== undefined) ? Array.from(s).length : 0;
      if (k.minLength !== undefined && len < k.minLength) err('MIN_LENGTH');
      if (k.maxLength !== undefined && len > k.maxLength) err('MAX_LENGTH');
      if (c.type === 'int' || c.type === 'number' || c.type === 'date') {
        const v = c.type === 'date' ? s : Number(s);
        if (k.min !== undefined && v < k.min) err('MIN');
        if (k.max !== undefined && v > k.max) err('MAX');
      }
      if (k.unique) {
        if (uniq[i].has(s)) err('UNIQUE'); else uniq[i].add(s);
      }
    });
  }
  return { ok: errors.length === 0, rowCount: rows.length - 1, errors };
}
