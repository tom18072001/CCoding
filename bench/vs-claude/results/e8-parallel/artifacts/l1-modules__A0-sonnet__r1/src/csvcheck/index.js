// csvcheck — xem SPEC.md, mục "Module csvcheck".

function err(code, message, row) {
  const e = new Error(message || code);
  e.code = code;
  if (row !== undefined) e.row = row;
  return e;
}

export function parseCsv(text, options) {
  if (typeof text !== 'string') throw err('CSV_INVALID_INPUT');
  let delimiter = ',';
  if (options !== undefined && options !== null && options.delimiter !== undefined) {
    delimiter = options.delimiter;
  }
  if (typeof delimiter !== 'string' || delimiter.length !== 1 || delimiter === '"' || delimiter === '\r' || delimiter === '\n') {
    throw err('CSV_INVALID_INPUT');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const n = text.length;
  const records = [];
  let i = 0;
  while (i < n) {
    const c0 = text[i];
    if (c0 === '\r' || c0 === '\n') {
      // dòng trống
      i += c0 === '\r' && text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    const row = records.length + 1;
    const fields = [];
    for (;;) {
      let val = '';
      if (text[i] === '"') {
        i++;
        for (;;) {
          if (i >= n) throw err('CSV_UNTERMINATED_QUOTE', undefined, row);
          const c = text[i];
          if (c === '"') {
            if (text[i + 1] === '"') {
              val += '"';
              i += 2;
            } else {
              i++;
              break;
            }
          } else {
            val += c;
            i++;
          }
        }
        if (i < n && text[i] !== delimiter && text[i] !== '\r' && text[i] !== '\n') {
          throw err('CSV_BAD_QUOTE', undefined, row);
        }
      } else {
        const start = i;
        while (i < n && text[i] !== delimiter && text[i] !== '\r' && text[i] !== '\n') {
          if (text[i] === '"') throw err('CSV_BAD_QUOTE', undefined, row);
          i++;
        }
        val = text.slice(start, i);
      }
      fields.push(val);
      if (i >= n) break;
      if (text[i] === delimiter) {
        i++;
        continue;
      }
      i += text[i] === '\r' && text[i + 1] === '\n' ? 2 : 1;
      break;
    }
    records.push(fields);
  }
  return records;
}

const TYPES = ['string', 'int', 'number', 'bool', 'date'];

function isDate(s) {
  if (typeof s !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  if (y < 1 || mo < 1 || mo > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return d <= dim;
}

function checkSchema(schema) {
  const bad = () => err('CSV_INVALID_SCHEMA');
  if (typeof schema !== 'object' || schema === null || !Array.isArray(schema.columns) || schema.columns.length === 0) {
    throw bad();
  }
  const names = new Set();
  const cols = [];
  for (const c of schema.columns) {
    if (typeof c !== 'object' || c === null || Array.isArray(c)) throw bad();
    if (typeof c.name !== 'string' || c.name === '' || names.has(c.name)) throw bad();
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
      const v = c[k];
      if (v === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof v !== 'number' || !Number.isFinite(v)) throw bad();
      } else if (type === 'date') {
        if (!isDate(v)) throw bad();
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      const v = c[k];
      if (v !== undefined && (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0)) throw bad();
    }
    cols.push({ def: c, type, re });
  }
  return cols;
}

function typeOk(type, cell) {
  switch (type) {
    case 'string':
      return true;
    case 'int':
      return /^[+-]?\d+$/.test(cell) && Number.isSafeInteger(Number(cell));
    case 'number':
      return /^[+-]?\d+(\.\d+)?$/.test(cell) && Number.isFinite(Number(cell));
    case 'bool':
      return /^(true|false)$/i.test(cell);
    case 'date':
      return isDate(cell);
    default:
      return false;
  }
}

export function validateCsv(text, schema, options) {
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
  for (const c of cols) {
    c.idx = header.indexOf(c.def.name);
    c.seen = new Set();
    if (c.idx < 0) errors.push({ row: 1, column: c.def.name, code: 'MISSING_COLUMN' });
  }

  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    const row = r + 1;
    if (rec.length !== header.length) {
      errors.push({ row, column: null, code: 'ROW_LENGTH' });
      continue;
    }
    for (const c of cols) {
      if (c.idx < 0) continue;
      const { def, type } = c;
      const cell = rec[c.idx];
      const fail = (code) => errors.push({ row, column: def.name, code });
      if (cell === '') {
        if (def.required) fail('REQUIRED');
        continue;
      }
      if (!typeOk(type, cell)) {
        fail('TYPE');
        continue;
      }
      if (def.enum !== undefined && !def.enum.includes(cell)) fail('ENUM');
      if (c.re && !c.re.test(cell)) fail('PATTERN');
      const len = Array.from(cell).length;
      if (def.minLength !== undefined && len < def.minLength) fail('MIN_LENGTH');
      if (def.maxLength !== undefined && len > def.maxLength) fail('MAX_LENGTH');
      if (type === 'int' || type === 'number') {
        const v = Number(cell);
        if (def.min !== undefined && v < def.min) fail('MIN');
        if (def.max !== undefined && v > def.max) fail('MAX');
      } else if (type === 'date') {
        if (def.min !== undefined && cell < def.min) fail('MIN');
        if (def.max !== undefined && cell > def.max) fail('MAX');
      }
      if (def.unique) {
        if (c.seen.has(cell)) fail('UNIQUE');
        else c.seen.add(cell);
      }
    }
  }
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
