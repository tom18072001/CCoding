// Module csvcheck — xem mục "csvcheck" trong SPEC.md.

function csvError(code, row) {
  const err = new Error(code);
  err.code = code;
  if (row !== undefined) err.row = row;
  return err;
}

function resolveDelimiter(options) {
  const opts = options === undefined || options === null ? {} : options;
  const d = opts.delimiter === undefined ? ',' : opts.delimiter;
  if (typeof d !== 'string' || d.length !== 1 || d === '"' || d === '\r' || d === '\n') {
    throw csvError('CSV_INVALID_INPUT');
  }
  return d;
}

export function parseCsv(text, options = {}) {
  if (typeof text !== 'string') throw csvError('CSV_INVALID_INPUT');
  const delim = resolveDelimiter(options);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const n = text.length;
  const records = [];
  let i = 0;

  while (i < n) {
    const row = records.length + 1;
    // dòng trống: bỏ qua
    if (text[i] === '\n') { i += 1; continue; }
    if (text[i] === '\r') { i += text[i + 1] === '\n' ? 2 : 1; continue; }

    const rec = [];
    let done = false;
    while (!done) {
      // bắt đầu một ô
      let field = '';
      if (text[i] === '"') {
        i += 1;
        let closed = false;
        while (i < n) {
          const c = text[i];
          if (c === '"') {
            if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
            i += 1;
            closed = true;
            break;
          }
          field += c;
          i += 1;
        }
        if (!closed) throw csvError('CSV_UNTERMINATED_QUOTE', row);
        if (i < n && text[i] !== delim && text[i] !== '\n' && text[i] !== '\r') {
          throw csvError('CSV_BAD_QUOTE', row);
        }
      } else {
        while (i < n && text[i] !== delim && text[i] !== '\n' && text[i] !== '\r') {
          if (text[i] === '"') throw csvError('CSV_BAD_QUOTE', row);
          field += text[i];
          i += 1;
        }
      }
      rec.push(field);
      if (i >= n) { done = true; }
      else if (text[i] === delim) { i += 1; if (i >= n) { rec.push(''); done = true; } }
      else if (text[i] === '\n') { i += 1; done = true; }
      else { i += text[i + 1] === '\n' ? 2 : 1; done = true; }
    }
    records.push(rec);
  }
  return records;
}

const TYPES = ['string', 'int', 'number', 'bool', 'date'];

function isValidDate(s) {
  if (typeof s !== 'string') return false;
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

function isValidType(type, v) {
  switch (type) {
    case 'string': return true;
    case 'int': return /^[+-]?\d+$/.test(v) && Number.isSafeInteger(Number(v));
    case 'number': return /^[+-]?\d+(\.\d+)?$/.test(v) && Number.isFinite(Number(v));
    case 'bool': return /^(true|false)$/i.test(v);
    case 'date': return isValidDate(v);
    default: return false;
  }
}

function invalidSchema() {
  return csvError('CSV_INVALID_SCHEMA');
}

function checkSchema(schema) {
  if (schema === null || typeof schema !== 'object' || !Array.isArray(schema.columns)
    || schema.columns.length === 0) throw invalidSchema();
  const names = new Set();
  const cols = [];
  for (const c of schema.columns) {
    if (c === null || typeof c !== 'object' || Array.isArray(c)) throw invalidSchema();
    if (typeof c.name !== 'string' || names.has(c.name)) throw invalidSchema();
    names.add(c.name);
    const type = c.type === undefined ? 'string' : c.type;
    if (!TYPES.includes(type)) throw invalidSchema();
    let re = null;
    if (c.pattern !== undefined) {
      if (typeof c.pattern !== 'string') throw invalidSchema();
      try { re = new RegExp(c.pattern); } catch { throw invalidSchema(); }
    }
    if (c.enum !== undefined) {
      if (!Array.isArray(c.enum) || c.enum.length === 0
        || c.enum.some((e) => typeof e !== 'string')) throw invalidSchema();
    }
    for (const k of ['min', 'max']) {
      if (c[k] === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof c[k] !== 'number' || !Number.isFinite(c[k])) throw invalidSchema();
      } else if (type === 'date') {
        if (!isValidDate(c[k])) throw invalidSchema();
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      if (c[k] === undefined) continue;
      if (!Number.isInteger(c[k]) || c[k] < 0) throw invalidSchema();
    }
    cols.push({ def: c, type, re });
  }
  return cols;
}

export function validateCsv(text, schema, options = {}) {
  const cols = checkSchema(schema);
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
  const idx = cols.map((c) => header.indexOf(c.def.name));
  cols.forEach((c, k) => {
    if (idx[k] === -1) errors.push({ row: 1, column: c.def.name, code: 'MISSING_COLUMN' });
  });
  const seen = cols.map(() => new Set());

  for (let r = 1; r < records.length; r += 1) {
    const rec = records[r];
    const row = r + 1;
    if (rec.length !== header.length) {
      errors.push({ row, column: null, code: 'ROW_LENGTH' });
      continue;
    }
    cols.forEach((c, k) => {
      if (idx[k] === -1) return;
      const def = c.def;
      const v = rec[idx[k]];
      const err = (code) => errors.push({ row, column: def.name, code });
      if (v === '') {
        if (def.required === true) err('REQUIRED');
        return;
      }
      if (!isValidType(c.type, v)) { err('TYPE'); return; }
      if (def.enum !== undefined && !def.enum.includes(v)) err('ENUM');
      if (c.re !== null && !c.re.test(v)) err('PATTERN');
      const len = Array.from(v).length;
      if (def.minLength !== undefined && len < def.minLength) err('MIN_LENGTH');
      if (def.maxLength !== undefined && len > def.maxLength) err('MAX_LENGTH');
      if (def.min !== undefined || def.max !== undefined) {
        if (c.type === 'int' || c.type === 'number') {
          const x = Number(v);
          if (def.min !== undefined && x < def.min) err('MIN');
          if (def.max !== undefined && x > def.max) err('MAX');
        } else if (c.type === 'date') {
          if (def.min !== undefined && v < def.min) err('MIN');
          if (def.max !== undefined && v > def.max) err('MAX');
        }
      }
      if (def.unique === true) {
        if (seen[k].has(v)) err('UNIQUE');
        else seen[k].add(v);
      }
    });
  }
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
