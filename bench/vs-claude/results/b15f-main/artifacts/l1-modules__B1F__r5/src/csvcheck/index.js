// Module csvcheck — xem mục "csvcheck" trong SPEC.md.

function fail(code, row) {
  const e = new Error(code);
  e.code = code;
  if (row !== undefined) e.row = row;
  return e;
}

export function parseCsv(text, options = {}) {
  if (typeof text !== 'string') throw fail('CSV_INVALID_INPUT');
  if (options === null || options === undefined) options = {};
  if (typeof options !== 'object') throw fail('CSV_INVALID_INPUT');
  let delim = ',';
  if (options.delimiter !== undefined) {
    const d = options.delimiter;
    if (typeof d !== 'string' || d.length !== 1 || d === '"' || d === '\r' || d === '\n') {
      throw fail('CSV_INVALID_INPUT');
    }
    delim = d;
  }
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const n = text.length;
  const records = [];
  while (i < n) {
    const c = text[i];
    if (c === '\r' || c === '\n') { // dòng trống
      i += c === '\r' && text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    const rowNo = records.length + 1;
    const fields = [];
    for (;;) {
      let value = '';
      if (text[i] === '"') {
        i++;
        for (;;) {
          if (i >= n) throw fail('CSV_UNTERMINATED_QUOTE', rowNo);
          if (text[i] === '"') {
            if (text[i + 1] === '"') { value += '"'; i += 2; continue; }
            i++;
            break;
          }
          value += text[i++];
        }
        if (i < n && text[i] !== delim && text[i] !== '\r' && text[i] !== '\n') {
          throw fail('CSV_BAD_QUOTE', rowNo);
        }
      } else {
        while (i < n && text[i] !== delim && text[i] !== '\r' && text[i] !== '\n') {
          if (text[i] === '"') throw fail('CSV_BAD_QUOTE', rowNo);
          value += text[i++];
        }
      }
      fields.push(value);
      if (i < n && text[i] === delim) { i++; continue; }
      break;
    }
    records.push(fields);
    if (i < n) i += text[i] === '\r' && text[i + 1] === '\n' ? 2 : 1;
  }
  return records;
}

const TYPES = ['string', 'int', 'number', 'bool', 'date'];
const isInt0 = (v) => Number.isInteger(v) && v >= 0;

function isDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (y < 1 || m < 1 || m > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  return d <= dim;
}

function checkType(type, s) {
  switch (type) {
    case 'int': return /^[+-]?\d+$/.test(s) && Number.isSafeInteger(Number(s));
    case 'number': return /^[+-]?\d+(\.\d+)?$/.test(s) && Number.isFinite(Number(s));
    case 'bool': {
      const l = s.toLowerCase();
      return l === 'true' || l === 'false';
    }
    case 'date': return isDate(s);
    default: return true;
  }
}

function compileSchema(schema) {
  const bad = () => fail('CSV_INVALID_SCHEMA');
  if (schema === null || typeof schema !== 'object' || !Array.isArray(schema.columns) || schema.columns.length === 0) throw bad();
  const names = new Set();
  return schema.columns.map((col) => {
    if (col === null || typeof col !== 'object' || Array.isArray(col)) throw bad();
    if (typeof col.name !== 'string' || names.has(col.name)) throw bad();
    names.add(col.name);
    const type = col.type === undefined ? 'string' : col.type;
    if (!TYPES.includes(type)) throw bad();
    let re = null;
    if (col.pattern !== undefined) {
      if (typeof col.pattern !== 'string') throw bad();
      try { re = new RegExp(col.pattern); } catch { throw bad(); }
    }
    if (col.enum !== undefined) {
      if (!Array.isArray(col.enum) || col.enum.length === 0 || !col.enum.every((x) => typeof x === 'string')) throw bad();
    }
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
      if (col[k] !== undefined && !isInt0(col[k])) throw bad();
    }
    return { col, type, re };
  });
}

export function validateCsv(text, schema, options = {}) {
  const cols = compileSchema(schema);
  let records;
  try {
    records = parseCsv(text, options);
  } catch (e) {
    if (e.code === 'CSV_UNTERMINATED_QUOTE' || e.code === 'CSV_BAD_QUOTE') {
      return { ok: false, rowCount: 0, errors: [{ row: e.row, column: null, code: e.code.slice(4) }] };
    }
    throw e;
  }
  if (records.length === 0) {
    return { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] };
  }
  const errors = [];
  const header = records[0];
  const idx = cols.map(({ col }) => header.indexOf(col.name));
  cols.forEach(({ col }, k) => {
    if (idx[k] < 0) errors.push({ row: 1, column: col.name, code: 'MISSING_COLUMN' });
  });
  const seen = cols.map(() => new Set());
  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    const row = r + 1;
    if (rec.length !== header.length) {
      errors.push({ row, column: null, code: 'ROW_LENGTH' });
      continue;
    }
    cols.forEach(({ col, type, re }, k) => {
      if (idx[k] < 0) return;
      const v = rec[idx[k]];
      const err = (code) => errors.push({ row, column: col.name, code });
      if (v === '') {
        if (col.required === true) err('REQUIRED');
        return;
      }
      if (!checkType(type, v)) { err('TYPE'); return; }
      if (col.enum !== undefined && !col.enum.includes(v)) err('ENUM');
      if (re && !re.test(v)) err('PATTERN');
      const len = (col.minLength !== undefined || col.maxLength !== undefined) ? Array.from(v).length : 0;
      if (col.minLength !== undefined && len < col.minLength) err('MIN_LENGTH');
      if (col.maxLength !== undefined && len > col.maxLength) err('MAX_LENGTH');
      if (type === 'int' || type === 'number') {
        const num = Number(v);
        if (col.min !== undefined && num < col.min) err('MIN');
        if (col.max !== undefined && num > col.max) err('MAX');
      } else if (type === 'date') {
        if (col.min !== undefined && v < col.min) err('MIN');
        if (col.max !== undefined && v > col.max) err('MAX');
      }
      if (col.unique === true) {
        if (seen[k].has(v)) err('UNIQUE');
        else seen[k].add(v);
      }
    });
  }
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
