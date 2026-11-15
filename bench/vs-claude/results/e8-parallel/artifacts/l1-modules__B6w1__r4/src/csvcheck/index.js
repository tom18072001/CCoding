// Module csvcheck — xem mục "csvcheck" trong SPEC.md.

function fail(code, row) {
  const err = new Error(code);
  err.code = code;
  if (row !== undefined) err.row = row;
  return err;
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
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const records = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    const c0 = text[i];
    // dòng trống: bỏ qua
    if (c0 === '\r' || c0 === '\n') {
      i += c0 === '\r' && text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    const row = records.length + 1;
    const rec = [];
    for (;;) {
      let field = '';
      if (text[i] === '"') {
        i++;
        for (;;) {
          if (i >= n) throw fail('CSV_UNTERMINATED_QUOTE', row);
          const ch = text[i];
          if (ch === '"') {
            if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
            i++;
            break;
          }
          field += ch;
          i++;
        }
        if (i < n && text[i] !== delim && text[i] !== '\r' && text[i] !== '\n') {
          throw fail('CSV_BAD_QUOTE', row);
        }
      } else {
        while (i < n && text[i] !== delim && text[i] !== '\r' && text[i] !== '\n') {
          if (text[i] === '"') throw fail('CSV_BAD_QUOTE', row);
          field += text[i];
          i++;
        }
      }
      rec.push(field);
      if (i < n && text[i] === delim) { i++; continue; }
      if (i < n) i += text[i] === '\r' && text[i + 1] === '\n' ? 2 : 1;
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
  const y = +m[1], mo = +m[2], d = +m[3];
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

function badSchema() { return fail('CSV_INVALID_SCHEMA'); }

function compileSchema(schema) {
  if (schema === null || typeof schema !== 'object' || !Array.isArray(schema.columns) || schema.columns.length === 0) {
    throw badSchema();
  }
  const names = new Set();
  return schema.columns.map((col) => {
    if (col === null || typeof col !== 'object' || Array.isArray(col)) throw badSchema();
    if (typeof col.name !== 'string' || col.name === '' || names.has(col.name)) throw badSchema();
    names.add(col.name);
    const type = col.type === undefined ? 'string' : col.type;
    if (!TYPES.includes(type)) throw badSchema();
    let re = null;
    if (col.pattern !== undefined) {
      if (typeof col.pattern !== 'string') throw badSchema();
      try { re = new RegExp(col.pattern); } catch { throw badSchema(); }
    }
    if (col.enum !== undefined) {
      if (!Array.isArray(col.enum) || col.enum.length === 0 || !col.enum.every((e) => typeof e === 'string')) throw badSchema();
    }
    for (const k of ['min', 'max']) {
      const v = col[k];
      if (v === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof v !== 'number' || !Number.isFinite(v)) throw badSchema();
      } else if (type === 'date') {
        if (typeof v !== 'string' || !validDate(v)) throw badSchema();
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      const v = col[k];
      if (v !== undefined && !(Number.isInteger(v) && v >= 0)) throw badSchema();
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
    if (e && (e.code === 'CSV_UNTERMINATED_QUOTE' || e.code === 'CSV_BAD_QUOTE')) {
      return { ok: false, rowCount: 0, errors: [{ row: e.row, column: null, code: e.code.slice(4) }] };
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
      const s = rec[idx[k]];
      const add = (code) => errors.push({ row, column: col.name, code });
      if (s === '') {
        if (col.required === true) add('REQUIRED');
        return;
      }
      if (!checkType(type, s)) { add('TYPE'); return; }
      if (col.enum !== undefined && !col.enum.includes(s)) add('ENUM');
      if (re && !re.test(s)) add('PATTERN');
      if (col.minLength !== undefined || col.maxLength !== undefined) {
        const len = Array.from(s).length;
        if (col.minLength !== undefined && len < col.minLength) add('MIN_LENGTH');
        if (col.maxLength !== undefined && len > col.maxLength) add('MAX_LENGTH');
      }
      if (type === 'int' || type === 'number') {
        const v = Number(s);
        if (col.min !== undefined && v < col.min) add('MIN');
        if (col.max !== undefined && v > col.max) add('MAX');
      } else if (type === 'date') {
        if (col.min !== undefined && s < col.min) add('MIN');
        if (col.max !== undefined && s > col.max) add('MAX');
      }
      if (col.unique) {
        if (seen[k].has(s)) add('UNIQUE');
        else seen[k].add(s);
      }
    });
  }
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
