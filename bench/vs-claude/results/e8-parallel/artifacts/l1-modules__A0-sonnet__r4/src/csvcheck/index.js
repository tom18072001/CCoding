// csvcheck — phân tích CSV (RFC 4180) và kiểm theo lược đồ. Xem SPEC.md.

function fail(code, message, row) {
  const e = new Error(message || code);
  e.code = code;
  if (row !== undefined) e.row = row;
  return e;
}

export function parseCsv(text, options) {
  if (typeof text !== 'string') throw fail('CSV_INVALID_INPUT');
  let delimiter = ',';
  if (options !== undefined && options !== null) {
    if (typeof options !== 'object') throw fail('CSV_INVALID_INPUT');
    if (options.delimiter !== undefined) delimiter = options.delimiter;
  }
  if (
    typeof delimiter !== 'string' ||
    Array.from(delimiter).length !== 1 ||
    delimiter === '"' ||
    delimiter === '\r' ||
    delimiter === '\n'
  ) {
    throw fail('CSV_INVALID_INPUT');
  }

  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const n = text.length;
  const dl = delimiter.length;
  const records = [];
  let i = 0;

  const atDelim = (p) => text.startsWith(delimiter, p);

  while (i < n) {
    // dòng trống
    if (text[i] === '\r' || text[i] === '\n') {
      i += text[i] === '\r' && text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    const row = records.length + 1;
    const fields = [];
    for (;;) {
      let field = '';
      if (text[i] === '"') {
        i++;
        for (;;) {
          if (i >= n) throw fail('CSV_UNTERMINATED_QUOTE', undefined, row);
          const c = text[i];
          if (c === '"') {
            if (text[i + 1] === '"') {
              field += '"';
              i += 2;
            } else {
              i++;
              break;
            }
          } else {
            field += c;
            i++;
          }
        }
        if (i < n && !atDelim(i) && text[i] !== '\r' && text[i] !== '\n') {
          throw fail('CSV_BAD_QUOTE', undefined, row);
        }
      } else {
        const start = i;
        while (i < n && !atDelim(i) && text[i] !== '\r' && text[i] !== '\n') {
          if (text[i] === '"') throw fail('CSV_BAD_QUOTE', undefined, row);
          i++;
        }
        field = text.slice(start, i);
      }
      fields.push(field);
      if (i < n && atDelim(i)) {
        i += dl;
        continue; // ô kế tiếp (có thể rỗng ở cuối tệp)
      }
      if (i < n) i += text[i] === '\r' && text[i + 1] === '\n' ? 2 : 1;
      break;
    }
    records.push(fields);
  }
  return records;
}

const TYPES = ['string', 'int', 'number', 'bool', 'date'];

function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (y < 1 || m < 1 || m > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  return d <= dim;
}

function badSchema(msg) {
  return fail('CSV_INVALID_SCHEMA', msg);
}

function compileSchema(schema) {
  if (schema === null || typeof schema !== 'object' || !Array.isArray(schema.columns) || schema.columns.length === 0) {
    throw badSchema('columns');
  }
  const seen = new Set();
  return schema.columns.map((c) => {
    if (c === null || typeof c !== 'object' || Array.isArray(c)) throw badSchema('column');
    if (typeof c.name !== 'string' || c.name === '' || seen.has(c.name)) throw badSchema('name');
    seen.add(c.name);
    const type = c.type === undefined ? 'string' : c.type;
    if (!TYPES.includes(type)) throw badSchema('type');
    let re = null;
    if (c.pattern !== undefined) {
      if (typeof c.pattern !== 'string') throw badSchema('pattern');
      try {
        re = new RegExp(c.pattern);
      } catch {
        throw badSchema('pattern');
      }
    }
    if (c.enum !== undefined) {
      if (!Array.isArray(c.enum) || c.enum.length === 0 || c.enum.some((v) => typeof v !== 'string')) {
        throw badSchema('enum');
      }
    }
    for (const k of ['min', 'max']) {
      if (c[k] === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof c[k] !== 'number' || !Number.isFinite(c[k])) throw badSchema(k);
      } else if (type === 'date') {
        if (!validDate(c[k])) throw badSchema(k);
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      if (c[k] !== undefined && !(Number.isSafeInteger(c[k]) && c[k] >= 0)) throw badSchema(k);
    }
    return { ...c, type, re, required: c.required === true, unique: c.unique === true };
  });
}

function typeOk(type, cell) {
  switch (type) {
    case 'int':
      return /^[+-]?\d+$/.test(cell) && Number.isSafeInteger(Number(cell));
    case 'number':
      return /^[+-]?\d+(\.\d+)?$/.test(cell) && Number.isFinite(Number(cell));
    case 'bool':
      return /^(true|false)$/i.test(cell);
    case 'date':
      return validDate(cell);
    default:
      return true;
  }
}

export function validateCsv(text, schema, options) {
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

  const errors = [];
  const header = records[0];
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
      const cell = rec[idx[k]];
      const err = (code) => errors.push({ row, column: c.name, code });
      if (cell === '') {
        if (c.required) err('REQUIRED');
        return;
      }
      if (!typeOk(c.type, cell)) return err('TYPE');
      if (c.enum !== undefined && !c.enum.includes(cell)) err('ENUM');
      if (c.re !== null && !c.re.test(cell)) err('PATTERN');
      const len = Array.from(cell).length;
      if (c.minLength !== undefined && len < c.minLength) err('MIN_LENGTH');
      if (c.maxLength !== undefined && len > c.maxLength) err('MAX_LENGTH');
      if (c.type === 'int' || c.type === 'number') {
        const v = Number(cell);
        if (c.min !== undefined && v < c.min) err('MIN');
        if (c.max !== undefined && v > c.max) err('MAX');
      } else if (c.type === 'date') {
        if (c.min !== undefined && cell < c.min) err('MIN');
        if (c.max !== undefined && cell > c.max) err('MAX');
      }
      if (c.unique) {
        if (seen[k].has(cell)) err('UNIQUE');
        else seen[k].add(cell);
      }
    });
  }
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
