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
  const d = options.delimiter;
  if (d === undefined) return ',';
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
  const records = [];
  let i = 0;
  while (i < n) {
    const c = text[i];
    // dòng trống
    if (c === '\r' || c === '\n') {
      i += c === '\r' && text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    const rowNo = records.length + 1;
    const rec = [];
    let done = false;
    while (!done) {
      let field = '';
      if (text[i] === '"') {
        i++;
        let closed = false;
        while (i < n) {
          if (text[i] === '"') {
            if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
            i++;
            closed = true;
            break;
          }
          field += text[i++];
        }
        if (!closed) throw fail('CSV_UNTERMINATED_QUOTE', rowNo);
        if (i < n && text[i] !== delim && text[i] !== '\r' && text[i] !== '\n') {
          throw fail('CSV_BAD_QUOTE', rowNo);
        }
      } else {
        while (i < n && text[i] !== delim && text[i] !== '\r' && text[i] !== '\n') {
          if (text[i] === '"') throw fail('CSV_BAD_QUOTE', rowNo);
          field += text[i++];
        }
      }
      rec.push(field);
      if (i >= n) { done = true; }
      else if (text[i] === delim) { i++; if (i >= n) { rec.push(''); done = true; } }
      else { i += text[i] === '\r' && text[i + 1] === '\n' ? 2 : 1; done = true; }
    }
    records.push(rec);
  }
  return records;
}

const TYPES = ['string', 'int', 'number', 'bool', 'date'];

function isRealDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (y < 1 || mo < 1 || mo > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return d <= dim;
}

function checkType(type, v) {
  switch (type) {
    case 'int': return /^[+-]?\d+$/.test(v) && Number.isSafeInteger(Number(v));
    case 'number': return /^[+-]?\d+(\.\d+)?$/.test(v) && Number.isFinite(Number(v));
    case 'bool': return /^(true|false)$/i.test(v);
    case 'date': return isRealDate(v);
    default: return true;
  }
}

function compileSchema(schema) {
  const bad = () => fail('CSV_INVALID_SCHEMA');
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
    if (c.enum !== undefined) {
      if (!Array.isArray(c.enum) || c.enum.length === 0 || !c.enum.every((x) => typeof x === 'string')) throw bad();
    }
    for (const k of ['min', 'max']) {
      const v = c[k];
      if (v === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof v !== 'number' || !Number.isFinite(v)) throw bad();
      } else if (type === 'date') {
        if (typeof v !== 'string' || !isRealDate(v)) throw bad();
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      const v = c[k];
      if (v !== undefined && !(Number.isInteger(v) && v >= 0)) throw bad();
    }
    return { name: c.name, type, required: c.required === true, unique: c.unique === true, enum: c.enum, re,
      min: c.min, max: c.max, minLength: c.minLength, maxLength: c.maxLength };
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
  const header = records[0];
  const errors = [];
  const idx = cols.map((c) => header.indexOf(c.name));
  cols.forEach((c, k) => {
    if (idx[k] < 0) errors.push({ row: 1, column: c.name, code: 'MISSING_COLUMN' });
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
      if (idx[k] < 0) return;
      const v = rec[idx[k]];
      const add = (code) => errors.push({ row, column: c.name, code });
      if (v === '') { if (c.required) add('REQUIRED'); return; }
      if (!checkType(c.type, v)) { add('TYPE'); return; }
      if (c.enum !== undefined && !c.enum.includes(v)) add('ENUM');
      if (c.re && !c.re.test(v)) add('PATTERN');
      const len = Array.from(v).length;
      if (c.minLength !== undefined && len < c.minLength) add('MIN_LENGTH');
      if (c.maxLength !== undefined && len > c.maxLength) add('MAX_LENGTH');
      if (c.type === 'int' || c.type === 'number') {
        const x = Number(v);
        if (c.min !== undefined && x < c.min) add('MIN');
        if (c.max !== undefined && x > c.max) add('MAX');
      } else if (c.type === 'date') {
        if (c.min !== undefined && v < c.min) add('MIN');
        if (c.max !== undefined && v > c.max) add('MAX');
      }
      if (c.unique) {
        if (seen[k].has(v)) add('UNIQUE'); else seen[k].add(v);
      }
    });
  }
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
