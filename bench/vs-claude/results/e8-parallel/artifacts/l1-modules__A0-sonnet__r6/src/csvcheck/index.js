// Module csvcheck — xem mục "csvcheck" trong SPEC.md.

function err(code, row) {
  const e = new Error(code);
  e.code = code;
  if (row !== undefined) e.row = row;
  return e;
}

export function parseCsv(text, options = {}) {
  if (typeof text !== 'string') throw err('CSV_INVALID_INPUT');
  if (options === null || typeof options !== 'object') throw err('CSV_INVALID_INPUT');
  const delimiter = options.delimiter === undefined ? ',' : options.delimiter;
  if (typeof delimiter !== 'string' || delimiter.length !== 1 || delimiter === '"' || delimiter === '\r' || delimiter === '\n') {
    throw err('CSV_INVALID_INPUT');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const records = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    const c = text[i];
    if (c === '\r' || c === '\n') { // dòng trống
      i += c === '\r' && text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    const row = records.length + 1;
    const fields = [];
    for (;;) {
      let field = '';
      if (text[i] === '"') {
        i++;
        for (;;) {
          if (i >= n) throw err('CSV_UNTERMINATED_QUOTE', row);
          const q = text.indexOf('"', i);
          if (q === -1) throw err('CSV_UNTERMINATED_QUOTE', row);
          field += text.slice(i, q);
          if (text[q + 1] === '"') {
            field += '"';
            i = q + 2;
          } else {
            i = q + 1;
            break;
          }
        }
        if (i < n && text[i] !== delimiter && text[i] !== '\r' && text[i] !== '\n') {
          throw err('CSV_BAD_QUOTE', row);
        }
      } else {
        const start = i;
        while (i < n && text[i] !== delimiter && text[i] !== '\r' && text[i] !== '\n') {
          if (text[i] === '"') throw err('CSV_BAD_QUOTE', row);
          i++;
        }
        field = text.slice(start, i);
      }
      fields.push(field);
      if (i < n && text[i] === delimiter) {
        i++;
        continue; // có thể là ô rỗng cuối văn bản
      }
      if (i < n) i += text[i] === '\r' && text[i + 1] === '\n' ? 2 : 1;
      break;
    }
    records.push(fields);
  }
  return records;
}

// ---------- validateCsv ----------

const TYPES = ['string', 'int', 'number', 'bool', 'date'];

function isRealDate(s) {
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
  return err('CSV_INVALID_SCHEMA');
}

function compileSchema(schema) {
  if (schema === null || typeof schema !== 'object' || !Array.isArray(schema.columns) || schema.columns.length === 0) {
    throw invalidSchema();
  }
  const names = new Set();
  return schema.columns.map((col) => {
    if (col === null || typeof col !== 'object' || Array.isArray(col)) throw invalidSchema();
    if (typeof col.name !== 'string' || names.has(col.name)) throw invalidSchema();
    names.add(col.name);
    const type = col.type === undefined ? 'string' : col.type;
    if (!TYPES.includes(type)) throw invalidSchema();
    let regex = null;
    if (col.pattern !== undefined) {
      if (typeof col.pattern !== 'string') throw invalidSchema();
      try {
        regex = new RegExp(col.pattern);
      } catch {
        throw invalidSchema();
      }
    }
    if (col.enum !== undefined) {
      if (!Array.isArray(col.enum) || col.enum.length === 0 || !col.enum.every((x) => typeof x === 'string')) {
        throw invalidSchema();
      }
    }
    for (const k of ['min', 'max']) {
      const v = col[k];
      if (v === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof v !== 'number' || !Number.isFinite(v)) throw invalidSchema();
      } else if (type === 'date') {
        if (typeof v !== 'string' || !isRealDate(v)) throw invalidSchema();
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      const v = col[k];
      if (v !== undefined && !(Number.isInteger(v) && v >= 0)) throw invalidSchema();
    }
    return { col, type, regex, name: col.name };
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
      return isRealDate(cell);
    default:
      return true;
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
  const active = [];
  for (const c of cols) {
    const idx = header.indexOf(c.name);
    if (idx === -1) errors.push({ row: 1, column: c.name, code: 'MISSING_COLUMN' });
    else active.push({ ...c, idx, seen: new Set() });
  }

  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    const row = r + 1;
    if (rec.length !== header.length) {
      errors.push({ row, column: null, code: 'ROW_LENGTH' });
      continue;
    }
    for (const c of active) {
      const cell = rec[c.idx];
      const spec = c.col;
      const fail = (code) => errors.push({ row, column: c.name, code });
      if (cell === '') {
        if (spec.required) fail('REQUIRED');
        continue;
      }
      if (!typeOk(c.type, cell)) {
        fail('TYPE');
        continue;
      }
      if (spec.enum !== undefined && !spec.enum.includes(cell)) fail('ENUM');
      if (c.regex && !c.regex.test(cell)) fail('PATTERN');
      if (spec.minLength !== undefined || spec.maxLength !== undefined) {
        const len = Array.from(cell).length;
        if (spec.minLength !== undefined && len < spec.minLength) fail('MIN_LENGTH');
        if (spec.maxLength !== undefined && len > spec.maxLength) fail('MAX_LENGTH');
      }
      if (c.type === 'int' || c.type === 'number') {
        const v = Number(cell);
        if (spec.min !== undefined && v < spec.min) fail('MIN');
        if (spec.max !== undefined && v > spec.max) fail('MAX');
      } else if (c.type === 'date') {
        if (spec.min !== undefined && cell < spec.min) fail('MIN');
        if (spec.max !== undefined && cell > spec.max) fail('MAX');
      }
      if (spec.unique) {
        if (c.seen.has(cell)) fail('UNIQUE');
        else c.seen.add(cell);
      }
    }
  }
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
