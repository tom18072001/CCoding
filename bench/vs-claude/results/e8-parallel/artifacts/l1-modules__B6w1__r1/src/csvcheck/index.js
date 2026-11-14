// Module csvcheck — xem mục "csvcheck" trong SPEC.md. Không import module khác.

function csvError(code, row) {
  const e = new Error(code);
  e.code = code;
  if (row !== undefined) e.row = row;
  return e;
}

export function parseCsv(text, options = {}) {
  if (typeof text !== 'string') throw csvError('CSV_INVALID_INPUT');
  const opts = options == null ? {} : options;
  const delimiter = opts.delimiter === undefined ? ',' : opts.delimiter;
  if (
    typeof delimiter !== 'string' || delimiter.length !== 1 ||
    delimiter === '"' || delimiter === '\r' || delimiter === '\n'
  ) throw csvError('CSV_INVALID_INPUT');

  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const n = text.length;
  const records = [];
  let i = 0;

  const eolAt = (k) => {
    if (text[k] === '\r') return text[k + 1] === '\n' ? 2 : 1;
    if (text[k] === '\n') return 1;
    return 0;
  };

  while (i < n) {
    const blank = eolAt(i);
    if (blank) { i += blank; continue; } // dòng trống: bỏ qua
    const row = records.length + 1;
    const fields = [];
    for (;;) {
      let value = '';
      if (text[i] === '"') {
        i++;
        let closed = false;
        while (i < n) {
          if (text[i] === '"') {
            if (text[i + 1] === '"') { value += '"'; i += 2; continue; }
            i++; closed = true; break;
          }
          value += text[i++];
        }
        if (!closed) throw csvError('CSV_UNTERMINATED_QUOTE', row);
        if (i < n && text[i] !== delimiter && !eolAt(i)) throw csvError('CSV_BAD_QUOTE', row);
      } else {
        while (i < n && text[i] !== delimiter && !eolAt(i)) {
          if (text[i] === '"') throw csvError('CSV_BAD_QUOTE', row);
          value += text[i++];
        }
      }
      fields.push(value);
      if (i >= n) break;
      if (text[i] === delimiter) { i++; continue; }
      i += eolAt(i);
      break;
    }
    records.push(fields);
  }
  return records;
}

const TYPES = ['string', 'int', 'number', 'bool', 'date'];

function isDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const y = Number(s.slice(0, 4)), m = Number(s.slice(5, 7)), d = Number(s.slice(8, 10));
  if (y < 1 || m < 1 || m > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
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

function bad() {
  const e = new Error('CSV_INVALID_SCHEMA');
  e.code = 'CSV_INVALID_SCHEMA';
  return e;
}

function compileSchema(schema) {
  if (schema === null || typeof schema !== 'object' || !Array.isArray(schema.columns) || schema.columns.length === 0) throw bad();
  const names = new Set();
  return schema.columns.map((c) => {
    if (c === null || typeof c !== 'object' || Array.isArray(c)) throw bad();
    if (typeof c.name !== 'string' || names.has(c.name)) throw bad();
    names.add(c.name);
    const type = c.type === undefined ? 'string' : c.type;
    if (!TYPES.includes(type)) throw bad();
    let re = null;
    if (c.pattern !== undefined) {
      if (typeof c.pattern !== 'string') throw bad();
      try { re = new RegExp(c.pattern); } catch { throw bad(); }
    }
    if (c.enum !== undefined &&
      (!Array.isArray(c.enum) || c.enum.length === 0 || !c.enum.every((v) => typeof v === 'string'))) throw bad();
    for (const k of ['min', 'max']) {
      if (c[k] === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof c[k] !== 'number' || !Number.isFinite(c[k])) throw bad();
      } else if (type === 'date') {
        if (!isDate(c[k])) throw bad();
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      if (c[k] !== undefined && !(Number.isInteger(c[k]) && c[k] >= 0)) throw bad();
    }
    return { ...c, type, re };
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
  const idx = cols.map((c) => header.indexOf(c.name));
  cols.forEach((c, k) => {
    if (idx[k] === -1) errors.push({ row: 1, column: c.name, code: 'MISSING_COLUMN' });
  });
  const seen = cols.map(() => new Set());

  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    const row = r + 1;
    if (rec.length !== header.length) {
      errors.push({ row, column: null, code: 'ROW_LENGTH' });
      continue;
    }
    cols.forEach((c, k) => {
      if (idx[k] === -1) return;
      const v = rec[idx[k]];
      const err = (code) => errors.push({ row, column: c.name, code });
      if (v === '') { if (c.required === true) err('REQUIRED'); return; }
      if (!checkType(c.type, v)) { err('TYPE'); return; }
      if (c.enum !== undefined && !c.enum.includes(v)) err('ENUM');
      if (c.re && !c.re.test(v)) err('PATTERN');
      const len = Array.from(v).length;
      if (c.minLength !== undefined && len < c.minLength) err('MIN_LENGTH');
      if (c.maxLength !== undefined && len > c.maxLength) err('MAX_LENGTH');
      if (c.type === 'int' || c.type === 'number' || c.type === 'date') {
        const x = c.type === 'date' ? v : Number(v);
        if (c.min !== undefined && x < c.min) err('MIN');
        if (c.max !== undefined && x > c.max) err('MAX');
      }
      if (c.unique === true) {
        if (seen[k].has(v)) err('UNIQUE'); else seen[k].add(v);
      }
    });
  }
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
