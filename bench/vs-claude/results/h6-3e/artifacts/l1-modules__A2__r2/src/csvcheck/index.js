// Module csvcheck — xem mục "csvcheck" trong SPEC.md.

function err(code, row) {
  const e = new Error(code);
  e.code = code;
  if (row !== undefined) e.row = row;
  return e;
}

export function parseCsv(text, options = {}) {
  if (typeof text !== 'string') throw err('CSV_INVALID_INPUT');
  if (options === null || typeof options !== 'object') options = {};
  const delimiter = options.delimiter === undefined ? ',' : options.delimiter;
  if (
    typeof delimiter !== 'string' ||
    delimiter.length !== 1 ||
    delimiter === '"' ||
    delimiter === '\r' ||
    delimiter === '\n'
  ) {
    throw err('CSV_INVALID_INPUT');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const len = text.length;
  const records = [];
  let pos = 0;

  const skipEol = () => {
    if (text[pos] === '\r' && text[pos + 1] === '\n') pos += 2;
    else pos += 1;
  };

  while (pos < len) {
    if (text[pos] === '\r' || text[pos] === '\n') {
      skipEol();
      continue;
    }
    const row = records.length + 1;
    const fields = [];
    for (;;) {
      let field = '';
      if (text[pos] === '"') {
        pos++;
        for (;;) {
          if (pos >= len) throw err('CSV_UNTERMINATED_QUOTE', row);
          const c = text[pos];
          if (c === '"') {
            if (text[pos + 1] === '"') {
              field += '"';
              pos += 2;
              continue;
            }
            pos++;
            break;
          }
          field += c;
          pos++;
        }
        if (pos < len && text[pos] !== delimiter && text[pos] !== '\r' && text[pos] !== '\n') {
          throw err('CSV_BAD_QUOTE', row);
        }
      } else {
        while (pos < len) {
          const c = text[pos];
          if (c === delimiter || c === '\r' || c === '\n') break;
          if (c === '"') throw err('CSV_BAD_QUOTE', row);
          field += c;
          pos++;
        }
      }
      fields.push(field);
      if (pos < len && text[pos] === delimiter) {
        pos++;
        continue;
      }
      if (pos < len) skipEol();
      break;
    }
    records.push(fields);
  }
  return records;
}

const TYPES = ['string', 'int', 'number', 'bool', 'date'];

function isRealDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (y < 1 || m < 1 || m > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  return d <= dim;
}

function checkSchema(schema) {
  const bad = () => err('CSV_INVALID_SCHEMA');
  if (schema === null || typeof schema !== 'object' || !Array.isArray(schema.columns) || schema.columns.length === 0) {
    throw bad();
  }
  const names = new Set();
  const cols = [];
  for (const c of schema.columns) {
    if (c === null || typeof c !== 'object' || Array.isArray(c)) throw bad();
    if (typeof c.name !== 'string' || names.has(c.name)) throw bad();
    names.add(c.name);
    const type = c.type === undefined ? 'string' : c.type;
    if (!TYPES.includes(type)) throw bad();
    let re = null;
    if (c.pattern !== undefined) {
      if (typeof c.pattern !== 'string') throw bad();
      try {
        re = new RegExp(c.pattern);
      } catch {
        throw bad();
      }
    }
    if (c.enum !== undefined) {
      if (!Array.isArray(c.enum) || c.enum.length === 0 || c.enum.some((x) => typeof x !== 'string')) throw bad();
    }
    for (const k of ['min', 'max']) {
      if (c[k] === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof c[k] !== 'number' || !Number.isFinite(c[k])) throw bad();
      } else if (type === 'date') {
        if (typeof c[k] !== 'string' || !isRealDate(c[k])) throw bad();
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      if (c[k] !== undefined && (!Number.isInteger(c[k]) || c[k] < 0)) throw bad();
    }
    cols.push({ def: c, type, re });
  }
  return cols;
}

function typeOk(type, v) {
  switch (type) {
    case 'int':
      return /^[+-]?\d+$/.test(v) && Number.isSafeInteger(Number(v));
    case 'number':
      return /^[+-]?\d+(\.\d+)?$/.test(v) && Number.isFinite(Number(v));
    case 'bool':
      return /^(true|false)$/i.test(v);
    case 'date':
      return isRealDate(v);
    default:
      return true;
  }
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
  const idx = cols.map((c) => header.indexOf(c.def.name));
  cols.forEach((c, i) => {
    if (idx[i] === -1) errors.push({ row: 1, column: c.def.name, code: 'MISSING_COLUMN' });
  });
  const seen = cols.map(() => new Set());

  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    const row = r + 1;
    if (rec.length !== header.length) {
      errors.push({ row, column: null, code: 'ROW_LENGTH' });
      continue;
    }
    cols.forEach((c, i) => {
      if (idx[i] === -1) return;
      const { def, type, re } = c;
      const v = rec[idx[i]];
      const push = (code) => errors.push({ row, column: def.name, code });
      if (v === '') {
        if (def.required === true) push('REQUIRED');
        return;
      }
      if (!typeOk(type, v)) {
        push('TYPE');
        return;
      }
      if (def.enum !== undefined && !def.enum.includes(v)) push('ENUM');
      if (re && !re.test(v)) push('PATTERN');
      const length = Array.from(v).length;
      if (def.minLength !== undefined && length < def.minLength) push('MIN_LENGTH');
      if (def.maxLength !== undefined && length > def.maxLength) push('MAX_LENGTH');
      if (type === 'int' || type === 'number') {
        const n = Number(v);
        if (def.min !== undefined && n < def.min) push('MIN');
        if (def.max !== undefined && n > def.max) push('MAX');
      } else if (type === 'date') {
        if (def.min !== undefined && v < def.min) push('MIN');
        if (def.max !== undefined && v > def.max) push('MAX');
      }
      if (def.unique === true) {
        if (seen[i].has(v)) push('UNIQUE');
        else seen[i].add(v);
      }
    });
  }
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
