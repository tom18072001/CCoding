// csvcheck — xem SPEC.md, mục "Module csvcheck".

function err(code, row) {
  const e = new Error(code);
  e.code = code;
  if (row !== undefined) e.row = row;
  return e;
}

export function parseCsv(text, options = {}) {
  if (typeof text !== 'string') throw err('CSV_INVALID_INPUT');
  const opts = options === undefined || options === null ? {} : options;
  let delim = ',';
  if (opts.delimiter !== undefined) {
    const d = opts.delimiter;
    if (typeof d !== 'string' || d.length !== 1 || d === '"' || d === '\r' || d === '\n') {
      throw err('CSV_INVALID_INPUT');
    }
    delim = d;
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const n = text.length;
  const records = [];
  let i = 0;
  while (i < n) {
    const c = text[i];
    if (c === '\r') {
      i += text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    if (c === '\n') {
      i++;
      continue;
    }
    const row = records.length + 1;
    const fields = [];
    for (;;) {
      let value = '';
      if (text[i] === '"') {
        i++;
        let closed = false;
        while (i < n) {
          if (text[i] === '"') {
            if (text[i + 1] === '"') {
              value += '"';
              i += 2;
            } else {
              i++;
              closed = true;
              break;
            }
          } else value += text[i++];
        }
        if (!closed) throw err('CSV_UNTERMINATED_QUOTE', row);
        if (i < n && text[i] !== delim && text[i] !== '\r' && text[i] !== '\n') throw err('CSV_BAD_QUOTE', row);
      } else {
        const start = i;
        while (i < n && text[i] !== delim && text[i] !== '\r' && text[i] !== '\n') {
          if (text[i] === '"') throw err('CSV_BAD_QUOTE', row);
          i++;
        }
        value = text.slice(start, i);
      }
      fields.push(value);
      if (i < n && text[i] === delim) {
        i++;
        continue;
      }
      if (i < n) i += text[i] === '\r' && text[i + 1] === '\n' ? 2 : 1;
      break;
    }
    records.push(fields);
  }
  return records;
}

const TYPES = ['string', 'int', 'number', 'bool', 'date'];

function schemaError() {
  const e = new Error('CSV_INVALID_SCHEMA');
  e.code = 'CSV_INVALID_SCHEMA';
  return e;
}

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

function compileSchema(schema) {
  if (schema === null || typeof schema !== 'object' || !Array.isArray(schema.columns) || schema.columns.length === 0) {
    throw schemaError();
  }
  const seen = new Set();
  return schema.columns.map((col) => {
    if (col === null || typeof col !== 'object' || Array.isArray(col)) throw schemaError();
    if (typeof col.name !== 'string' || seen.has(col.name)) throw schemaError();
    seen.add(col.name);
    const type = col.type === undefined ? 'string' : col.type;
    if (!TYPES.includes(type)) throw schemaError();
    let regex = null;
    if (col.pattern !== undefined) {
      if (typeof col.pattern !== 'string') throw schemaError();
      try {
        regex = new RegExp(col.pattern);
      } catch {
        throw schemaError();
      }
    }
    if (col.enum !== undefined) {
      if (!Array.isArray(col.enum) || col.enum.length === 0 || !col.enum.every((x) => typeof x === 'string')) {
        throw schemaError();
      }
    }
    for (const k of ['min', 'max']) {
      const v = col[k];
      if (v === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof v !== 'number' || !Number.isFinite(v)) throw schemaError();
      } else if (type === 'date') {
        if (typeof v !== 'string' || !isDate(v)) throw schemaError();
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      if (col[k] !== undefined && !(Number.isInteger(col[k]) && col[k] >= 0)) throw schemaError();
    }
    return {
      name: col.name,
      type,
      required: !!col.required,
      unique: !!col.unique,
      regex,
      enumSet: col.enum === undefined ? null : new Set(col.enum),
      min: col.min,
      max: col.max,
      minLength: col.minLength,
      maxLength: col.maxLength,
    };
  });
}

function typeOk(type, v) {
  switch (type) {
    case 'string':
      return true;
    case 'int':
      return /^[+-]?\d+$/.test(v) && Number.isSafeInteger(Number(v));
    case 'number':
      return /^[+-]?\d+(\.\d+)?$/.test(v) && Number.isFinite(Number(v));
    case 'bool':
      return /^(true|false)$/i.test(v);
    case 'date':
      return isDate(v);
    default:
      return false;
  }
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
  const index = cols.map((c) => header.indexOf(c.name));
  cols.forEach((c, k) => {
    if (index[k] === -1) errors.push({ row: 1, column: c.name, code: 'MISSING_COLUMN' });
  });
  const uniques = cols.map(() => new Set());

  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    const row = r + 1;
    if (rec.length !== header.length) {
      errors.push({ row, column: null, code: 'ROW_LENGTH' });
      continue;
    }
    cols.forEach((c, k) => {
      if (index[k] === -1) return;
      const v = rec[index[k]];
      const fail = (code) => errors.push({ row, column: c.name, code });
      if (v === '') {
        if (c.required) fail('REQUIRED');
        return;
      }
      if (!typeOk(c.type, v)) return fail('TYPE');
      if (c.enumSet && !c.enumSet.has(v)) fail('ENUM');
      if (c.regex && !c.regex.test(v)) fail('PATTERN');
      if (c.minLength !== undefined || c.maxLength !== undefined) {
        const len = Array.from(v).length;
        if (c.minLength !== undefined && len < c.minLength) fail('MIN_LENGTH');
        if (c.maxLength !== undefined && len > c.maxLength) fail('MAX_LENGTH');
      }
      if (c.type === 'int' || c.type === 'number') {
        const num = Number(v);
        if (c.min !== undefined && num < c.min) fail('MIN');
        if (c.max !== undefined && num > c.max) fail('MAX');
      } else if (c.type === 'date') {
        if (c.min !== undefined && v < c.min) fail('MIN');
        if (c.max !== undefined && v > c.max) fail('MAX');
      }
      if (c.unique) {
        if (uniques[k].has(v)) fail('UNIQUE');
        else uniques[k].add(v);
      }
    });
  }
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
