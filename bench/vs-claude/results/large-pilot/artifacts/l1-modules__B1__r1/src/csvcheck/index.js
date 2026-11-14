// Module csvcheck — xem mục "csvcheck" trong SPEC.md.

function fail(code, row) {
  const err = new Error(code);
  err.code = code;
  if (row !== undefined) err.row = row;
  return err;
}

export function parseCsv(text, options = {}) {
  if (typeof text !== 'string') throw fail('CSV_INVALID_INPUT');
  const opts = options ?? {};
  const delimiter = opts.delimiter === undefined ? ',' : opts.delimiter;
  if (typeof delimiter !== 'string' || delimiter.length !== 1
    || delimiter === '"' || delimiter === '\r' || delimiter === '\n') {
    throw fail('CSV_INVALID_INPUT');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const n = text.length;
  const records = [];
  let i = 0;
  const isEol = (c) => c === '\r' || c === '\n';
  const skipEol = () => {
    if (text[i] === '\r' && text[i + 1] === '\n') i += 2;
    else i += 1;
  };

  while (i < n) {
    if (isEol(text[i])) { skipEol(); continue; } // dòng trống
    const row = records.length + 1;
    const rec = [];
    for (;;) {
      let cell = '';
      if (text[i] === '"') {
        i++;
        let closed = false;
        while (i < n) {
          const c = text[i];
          if (c === '"') {
            if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
            i++;
            closed = true;
            break;
          }
          cell += c;
          i++;
        }
        if (!closed) throw fail('CSV_UNTERMINATED_QUOTE', row);
        if (i < n && text[i] !== delimiter && !isEol(text[i])) throw fail('CSV_BAD_QUOTE', row);
      } else {
        const start = i;
        while (i < n && text[i] !== delimiter && !isEol(text[i])) {
          if (text[i] === '"') throw fail('CSV_BAD_QUOTE', row);
          i++;
        }
        cell = text.slice(start, i);
      }
      rec.push(cell);
      if (i < n && text[i] === delimiter) { i++; continue; }
      if (i < n) skipEol();
      break;
    }
    records.push(rec);
  }
  return records;
}

const TYPES = ['string', 'int', 'number', 'bool', 'date'];

function isValidDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1 || mo < 1 || mo > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return d <= dim;
}

function invalidSchema() {
  return fail('CSV_INVALID_SCHEMA');
}

function compileSchema(schema) {
  if (schema === null || typeof schema !== 'object' || !Array.isArray(schema.columns)
    || schema.columns.length === 0) throw invalidSchema();
  const names = new Set();
  return schema.columns.map((col) => {
    if (col === null || typeof col !== 'object' || Array.isArray(col)) throw invalidSchema();
    if (typeof col.name !== 'string' || col.name === '' || names.has(col.name)) throw invalidSchema();
    names.add(col.name);
    const type = col.type === undefined ? 'string' : col.type;
    if (!TYPES.includes(type)) throw invalidSchema();
    let re = null;
    if (col.pattern !== undefined) {
      if (typeof col.pattern !== 'string') throw invalidSchema();
      try { re = new RegExp(col.pattern); } catch { throw invalidSchema(); }
    }
    if (col.enum !== undefined
      && (!Array.isArray(col.enum) || col.enum.length === 0
        || col.enum.some((v) => typeof v !== 'string'))) throw invalidSchema();
    for (const k of ['min', 'max']) {
      const v = col[k];
      if (v === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof v !== 'number' || !Number.isFinite(v)) throw invalidSchema();
      } else if (type === 'date') {
        if (typeof v !== 'string' || !isValidDate(v)) throw invalidSchema();
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      const v = col[k];
      if (v !== undefined && !(Number.isInteger(v) && v >= 0)) throw invalidSchema();
    }
    return { col, type, re };
  });
}

function typeOk(type, s) {
  switch (type) {
    case 'string': return true;
    case 'int': return /^[+-]?\d+$/.test(s) && Number.isSafeInteger(Number(s));
    case 'number': return /^[+-]?\d+(\.\d+)?$/.test(s) && Number.isFinite(Number(s));
    case 'bool': return /^(true|false)$/i.test(s);
    case 'date': return isValidDate(s);
    default: return false;
  }
}

export function validateCsv(text, schema, options = {}) {
  const cols = compileSchema(schema);
  let records;
  try {
    records = parseCsv(text, options);
  } catch (e) {
    if (e.code === 'CSV_UNTERMINATED_QUOTE' || e.code === 'CSV_BAD_QUOTE') {
      return {
        ok: false,
        rowCount: 0,
        errors: [{ row: e.row, column: null, code: e.code.slice(4) }],
      };
    }
    throw e;
  }
  if (records.length === 0) {
    return { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] };
  }

  const header = records[0];
  const errors = [];
  const idx = cols.map(({ col }) => header.indexOf(col.name));
  cols.forEach(({ col }, k) => {
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
    cols.forEach(({ col, type, re }, k) => {
      if (idx[k] === -1) return;
      const v = rec[idx[k]];
      const err = (code) => errors.push({ row, column: col.name, code });
      if (v === '') {
        if (col.required === true) err('REQUIRED');
        return;
      }
      if (!typeOk(type, v)) { err('TYPE'); return; }
      if (col.enum !== undefined && !col.enum.includes(v)) err('ENUM');
      if (re && !re.test(v)) err('PATTERN');
      const len = Array.from(v).length;
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
