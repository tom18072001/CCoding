// Module csvcheck — xem mục "csvcheck" trong SPEC.md.

function fail(code, row) {
  const err = new Error(code);
  err.code = code;
  if (row !== undefined) err.row = row;
  return err;
}

function resolveDelimiter(options) {
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
  const delim = resolveDelimiter(options);
  let i = text[0] === '﻿' ? 1 : 0;
  const n = text.length;
  const records = [];

  const atTerminator = (p) => text[p] === '\n' || text[p] === '\r';
  const skipTerminator = (p) => (text[p] === '\r' && text[p + 1] === '\n' ? p + 2 : p + 1);

  while (i < n) {
    if (atTerminator(i)) { i = skipTerminator(i); continue; } // dòng trống
    const row = records.length + 1;
    const rec = [];
    for (;;) {
      let cell = '';
      if (text[i] === '"') {
        i++;
        for (;;) {
          if (i >= n) throw fail('CSV_UNTERMINATED_QUOTE', row);
          const c = text[i];
          if (c === '"') {
            if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
            i++;
            break;
          }
          cell += c;
          i++;
        }
        if (i < n && text[i] !== delim && !atTerminator(i)) throw fail('CSV_BAD_QUOTE', row);
      } else {
        const start = i;
        while (i < n && text[i] !== delim && !atTerminator(i)) {
          if (text[i] === '"') throw fail('CSV_BAD_QUOTE', row);
          i++;
        }
        cell = text.slice(start, i);
      }
      rec.push(cell);
      if (i < n && text[i] === delim) { i++; continue; }
      break;
    }
    records.push(rec);
    if (i < n) i = skipTerminator(i);
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

function checkType(type, s) {
  switch (type) {
    case 'int': return /^[+-]?\d+$/.test(s) && Number.isSafeInteger(Number(s));
    case 'number': return /^[+-]?\d+(\.\d+)?$/.test(s) && Number.isFinite(Number(s));
    case 'bool': return /^(true|false)$/i.test(s);
    case 'date': return isValidDate(s);
    default: return true;
  }
}

function prepareSchema(schema) {
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
      if (!Array.isArray(col.enum) || col.enum.length === 0 || !col.enum.every((e) => typeof e === 'string')) throw bad();
    }
    for (const k of ['min', 'max']) {
      const v = col[k];
      if (v === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof v !== 'number' || !Number.isFinite(v)) throw bad();
      } else if (type === 'date') {
        if (typeof v !== 'string' || !isValidDate(v)) throw bad();
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      const v = col[k];
      if (v !== undefined && !(Number.isInteger(v) && v >= 0)) throw bad();
    }
    return { col, type, re };
  });
}

export function validateCsv(text, schema, options = {}) {
  const cols = prepareSchema(schema);
  if (typeof text !== 'string') throw fail('CSV_INVALID_INPUT');
  resolveDelimiter(options);

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
  const index = cols.map(({ col }) => header.indexOf(col.name));
  cols.forEach(({ col }, k) => {
    if (index[k] < 0) errors.push({ row: 1, column: col.name, code: 'MISSING_COLUMN' });
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
      if (index[k] < 0) return;
      const cell = rec[index[k]];
      const add = (code) => errors.push({ row, column: col.name, code });
      if (cell === '') {
        if (col.required) add('REQUIRED');
        return;
      }
      if (!checkType(type, cell)) { add('TYPE'); return; }
      if (col.enum !== undefined && !col.enum.includes(cell)) add('ENUM');
      if (re && !re.test(cell)) add('PATTERN');
      const len = (col.minLength !== undefined || col.maxLength !== undefined) ? Array.from(cell).length : 0;
      if (col.minLength !== undefined && len < col.minLength) add('MIN_LENGTH');
      if (col.maxLength !== undefined && len > col.maxLength) add('MAX_LENGTH');
      if (type === 'int' || type === 'number') {
        const v = Number(cell);
        if (col.min !== undefined && v < col.min) add('MIN');
        if (col.max !== undefined && v > col.max) add('MAX');
      } else if (type === 'date') {
        if (col.min !== undefined && cell < col.min) add('MIN');
        if (col.max !== undefined && cell > col.max) add('MAX');
      }
      if (col.unique) {
        if (seen[k].has(cell)) add('UNIQUE');
        else seen[k].add(cell);
      }
    });
  }
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
