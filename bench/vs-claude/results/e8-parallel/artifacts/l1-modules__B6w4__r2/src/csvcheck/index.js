// Module csvcheck — xem mục "csvcheck" trong SPEC.md.

function err(code, row) {
  const e = new Error(code);
  e.code = code;
  if (row !== undefined) e.row = row;
  return e;
}

export function parseCsv(text, options = {}) {
  if (typeof text !== 'string') throw err('CSV_INVALID_INPUT');
  const opts = options == null ? {} : options;
  if (typeof opts !== 'object') throw err('CSV_INVALID_INPUT');
  const delim = opts.delimiter === undefined ? ',' : opts.delimiter;
  if (
    typeof delim !== 'string' || Array.from(delim).length !== 1 ||
    delim === '"' || delim === '\r' || delim === '\n'
  ) throw err('CSV_INVALID_INPUT');

  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const n = text.length;
  const records = [];

  const eol = () => {
    if (text[i] === '\r') i += (text[i + 1] === '\n') ? 2 : 1;
    else i += 1;
  };

  while (i < n) {
    if (text[i] === '\r' || text[i] === '\n') { eol(); continue; } // dòng trống
    const rowNo = records.length + 1;
    const rec = [];
    for (;;) {
      let field = '';
      if (text[i] === '"') {
        i++;
        for (;;) {
          if (i >= n) throw err('CSV_UNTERMINATED_QUOTE', rowNo);
          const c = text[i];
          if (c === '"') {
            if (text[i + 1] === '"') { field += '"'; i += 2; }
            else { i++; break; }
          } else { field += c; i++; }
        }
        if (i < n && text[i] !== delim && text[i] !== '\r' && text[i] !== '\n') {
          throw err('CSV_BAD_QUOTE', rowNo);
        }
      } else {
        const start = i;
        while (i < n && text[i] !== delim && text[i] !== '\r' && text[i] !== '\n') {
          if (text[i] === '"') throw err('CSV_BAD_QUOTE', rowNo);
          i++;
        }
        field = text.slice(start, i);
      }
      rec.push(field);
      if (i >= n) break;
      if (text[i] === delim) { i++; continue; }
      eol();
      break;
    }
    records.push(rec);
  }
  return records;
}

const TYPES = ['string', 'int', 'number', 'bool', 'date'];

function validDate(s) {
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
    case 'date': return validDate(s);
    default: return true;
  }
}

function bad() { return err('CSV_INVALID_SCHEMA'); }

function compileSchema(schema) {
  if (schema === null || typeof schema !== 'object' || !Array.isArray(schema.columns) ||
      schema.columns.length === 0) throw bad();
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
      if (!Array.isArray(c.enum) || c.enum.length === 0 || c.enum.some((v) => typeof v !== 'string')) throw bad();
    }
    for (const k of ['min', 'max']) {
      const v = c[k];
      if (v === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof v !== 'number' || !Number.isFinite(v)) throw bad();
      } else if (type === 'date') {
        if (typeof v !== 'string' || !validDate(v)) throw bad();
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      const v = c[k];
      if (v !== undefined && !(Number.isInteger(v) && v >= 0)) throw bad();
    }
    return { name: c.name, type, required: c.required === true, unique: c.unique === true, re, c };
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
  const idx = cols.map((col) => header.indexOf(col.name));
  cols.forEach((col, k) => {
    if (idx[k] === -1) errors.push({ row: 1, column: col.name, code: 'MISSING_COLUMN' });
  });
  const seen = cols.map(() => new Set());

  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    const row = r + 1;
    if (rec.length !== header.length) {
      errors.push({ row, column: null, code: 'ROW_LENGTH' });
      continue;
    }
    cols.forEach((col, k) => {
      if (idx[k] === -1) return;
      const v = rec[idx[k]];
      const c = col.c;
      const push = (code) => errors.push({ row, column: col.name, code });
      if (v === '') { if (col.required) push('REQUIRED'); return; }
      if (!checkType(col.type, v)) { push('TYPE'); return; }
      if (c.enum !== undefined && !c.enum.includes(v)) push('ENUM');
      if (col.re && !col.re.test(v)) push('PATTERN');
      const len = Array.from(v).length;
      if (c.minLength !== undefined && len < c.minLength) push('MIN_LENGTH');
      if (c.maxLength !== undefined && len > c.maxLength) push('MAX_LENGTH');
      if (col.type === 'int' || col.type === 'number') {
        const x = Number(v);
        if (c.min !== undefined && x < c.min) push('MIN');
        if (c.max !== undefined && x > c.max) push('MAX');
      } else if (col.type === 'date') {
        if (c.min !== undefined && v < c.min) push('MIN');
        if (c.max !== undefined && v > c.max) push('MAX');
      }
      if (col.unique) {
        if (seen[k].has(v)) push('UNIQUE'); else seen[k].add(v);
      }
    });
  }
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
