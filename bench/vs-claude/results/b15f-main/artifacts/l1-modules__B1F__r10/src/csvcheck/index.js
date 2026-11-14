// Module csvcheck — xem mục "csvcheck" trong SPEC.md.

function fail(code, row) {
  const e = new Error(code);
  e.code = code;
  if (row !== undefined) e.row = row;
  return e;
}

export function parseCsv(text, options = {}) {
  if (typeof text !== 'string') throw fail('CSV_INVALID_INPUT');
  if (options === null || typeof options !== 'object') throw fail('CSV_INVALID_INPUT');
  const delimiter = options.delimiter === undefined ? ',' : options.delimiter;
  if (
    typeof delimiter !== 'string' ||
    Array.from(delimiter).length !== 1 ||
    delimiter === '"' || delimiter === '\r' || delimiter === '\n'
  ) throw fail('CSV_INVALID_INPUT');
  const dl = delimiter.length;

  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const n = text.length;
  const records = [];
  let i = 0;

  while (i < n) {
    const ch = text[i];
    // dòng trống
    if (ch === '\n') { i++; continue; }
    if (ch === '\r') { i += text[i + 1] === '\n' ? 2 : 1; continue; }

    const row = records.length + 1;
    const rec = [];
    for (;;) {
      let field = '';
      if (text[i] === '"') {
        i++;
        let closed = false;
        while (i < n) {
          if (text[i] === '"') {
            if (text[i + 1] === '"') { field += '"'; i += 2; }
            else { i++; closed = true; break; }
          } else { field += text[i]; i++; }
        }
        if (!closed) throw fail('CSV_UNTERMINATED_QUOTE', row);
        if (i < n && !text.startsWith(delimiter, i) && text[i] !== '\r' && text[i] !== '\n') {
          throw fail('CSV_BAD_QUOTE', row);
        }
      } else {
        while (i < n && !text.startsWith(delimiter, i) && text[i] !== '\r' && text[i] !== '\n') {
          if (text[i] === '"') throw fail('CSV_BAD_QUOTE', row);
          field += text[i];
          i++;
        }
      }
      rec.push(field);
      if (i >= n) break;
      if (text.startsWith(delimiter, i)) {
        i += dl;
        continue; // ô tiếp theo (có thể rỗng ở cuối văn bản)
      }
      i += text[i] === '\r' && text[i + 1] === '\n' ? 2 : 1;
      break;
    }
    records.push(rec);
  }
  return records;
}

const TYPES = ['string', 'int', 'number', 'bool', 'date'];

function isRealDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y === 0 || mo < 1 || mo > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return d <= dim;
}

function badSchema() { return fail('CSV_INVALID_SCHEMA'); }

function checkSchema(schema) {
  if (schema === null || typeof schema !== 'object' || !Array.isArray(schema.columns) || schema.columns.length === 0) {
    throw badSchema();
  }
  const names = new Set();
  const out = [];
  for (const c of schema.columns) {
    if (c === null || typeof c !== 'object' || Array.isArray(c)) throw badSchema();
    if (typeof c.name !== 'string' || names.has(c.name)) throw badSchema();
    names.add(c.name);
    const type = c.type === undefined ? 'string' : c.type;
    if (!TYPES.includes(type)) throw badSchema();
    let re = null;
    if (c.pattern !== undefined) {
      if (typeof c.pattern !== 'string') throw badSchema();
      try { re = new RegExp(c.pattern); } catch { throw badSchema(); }
    }
    if (c.enum !== undefined) {
      if (!Array.isArray(c.enum) || c.enum.length === 0 || c.enum.some((x) => typeof x !== 'string')) throw badSchema();
    }
    for (const k of ['min', 'max']) {
      const v = c[k];
      if (v === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof v !== 'number' || !Number.isFinite(v)) throw badSchema();
      } else if (type === 'date') {
        if (typeof v !== 'string' || !isRealDate(v)) throw badSchema();
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      const v = c[k];
      if (v !== undefined && !(Number.isInteger(v) && v >= 0)) throw badSchema();
    }
    out.push({
      name: c.name, type, required: c.required === true, re,
      enum: c.enum, min: c.min, max: c.max,
      minLength: c.minLength, maxLength: c.maxLength, unique: c.unique === true,
    });
  }
  return out;
}

function typeOk(type, s) {
  switch (type) {
    case 'string': return true;
    case 'int': return /^[+-]?\d+$/.test(s) && Number.isSafeInteger(Number(s));
    case 'number': return /^[+-]?\d+(\.\d+)?$/.test(s) && Number.isFinite(Number(s));
    case 'bool': return /^(true|false)$/i.test(s);
    case 'date': return isRealDate(s);
  }
  return false;
}

export function validateCsv(text, schema, options = {}) {
  const cols = checkSchema(schema);
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
      const add = (code) => errors.push({ row, column: c.name, code });
      if (v === '') { if (c.required) add('REQUIRED'); return; }
      if (!typeOk(c.type, v)) { add('TYPE'); return; }
      if (c.enum !== undefined && !c.enum.includes(v)) add('ENUM');
      if (c.re && !c.re.test(v)) add('PATTERN');
      const len = Array.from(v).length;
      if (c.minLength !== undefined && len < c.minLength) add('MIN_LENGTH');
      if (c.maxLength !== undefined && len > c.maxLength) add('MAX_LENGTH');
      if (c.type === 'int' || c.type === 'number') {
        const num = Number(v);
        if (c.min !== undefined && num < c.min) add('MIN');
        if (c.max !== undefined && num > c.max) add('MAX');
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
