// Module csvcheck — xem mục "csvcheck" trong SPEC.md.

function err(code, message, row) {
  const e = new Error(message || code);
  e.code = code;
  if (row !== undefined) e.row = row;
  return e;
}

export function parseCsv(text, options) {
  if (typeof text !== 'string') throw err('CSV_INVALID_INPUT');
  let delimiter = ',';
  if (options !== null && options !== undefined) {
    if (typeof options !== 'object') throw err('CSV_INVALID_INPUT');
    if (options.delimiter !== undefined) delimiter = options.delimiter;
  }
  if (typeof delimiter !== 'string' || delimiter.length !== 1 || delimiter === '"' || delimiter === '\r' || delimiter === '\n') {
    throw err('CSV_INVALID_INPUT');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const records = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    const c = text[i];
    // dòng trống
    if (c === '\r') {
      i += text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    if (c === '\n') {
      i++;
      continue;
    }
    const row = records.length + 1;
    const rec = [];
    // đọc một bản ghi
    for (;;) {
      let field = '';
      if (text[i] === '"') {
        i++;
        let closed = false;
        while (i < n) {
          if (text[i] === '"') {
            if (text[i + 1] === '"') {
              field += '"';
              i += 2;
            } else {
              i++;
              closed = true;
              break;
            }
          } else field += text[i++];
        }
        if (!closed) throw err('CSV_UNTERMINATED_QUOTE', undefined, row);
        if (i < n && text[i] !== delimiter && text[i] !== '\r' && text[i] !== '\n') {
          throw err('CSV_BAD_QUOTE', undefined, row);
        }
      } else {
        while (i < n && text[i] !== delimiter && text[i] !== '\r' && text[i] !== '\n') {
          if (text[i] === '"') throw err('CSV_BAD_QUOTE', undefined, row);
          field += text[i++];
        }
      }
      rec.push(field);
      if (i >= n) break;
      if (text[i] === delimiter) {
        i++;
        continue; // ô kế tiếp (kể cả ô rỗng cuối bản ghi)
      }
      // kết thúc dòng
      i += text[i] === '\r' && text[i + 1] === '\n' ? 2 : 1;
      break;
    }
    records.push(rec);
  }
  return records;
}

const TYPES = ['string', 'int', 'number', 'bool', 'date'];

function invalidSchema() {
  return err('CSV_INVALID_SCHEMA');
}

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function isDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1 || mo < 1 || mo > 12 || d < 1) return false;
  const dim = [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return d <= dim;
}

function checkType(type, s) {
  switch (type) {
    case 'string':
      return true;
    case 'int':
      return /^[+-]?\d+$/.test(s) && Number.isSafeInteger(Number(s));
    case 'number':
      return /^[+-]?\d+(\.\d+)?$/.test(s) && Number.isFinite(Number(s));
    case 'bool':
      return /^(?:true|false)$/i.test(s);
    case 'date':
      return isDate(s);
    default:
      return false;
  }
}

function normalizeSchema(schema) {
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
    let re = null;
    if (col.pattern !== undefined) {
      if (typeof col.pattern !== 'string') throw invalidSchema();
      try {
        re = new RegExp(col.pattern);
      } catch {
        throw invalidSchema();
      }
    }
    if (col.enum !== undefined) {
      if (!Array.isArray(col.enum) || col.enum.length === 0 || col.enum.some((e) => typeof e !== 'string')) {
        throw invalidSchema();
      }
    }
    for (const k of ['min', 'max']) {
      const v = col[k];
      if (v === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof v !== 'number' || !Number.isFinite(v)) throw invalidSchema();
      } else if (type === 'date') {
        if (typeof v !== 'string' || !isDate(v)) throw invalidSchema();
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      const v = col[k];
      if (v !== undefined && (typeof v !== 'number' || !Number.isInteger(v) || v < 0)) throw invalidSchema();
    }
    return { col, type, re, required: col.required === true, unique: col.unique === true };
  });
}

export function validateCsv(text, schema, options) {
  const cols = normalizeSchema(schema);
  let records;
  try {
    records = parseCsv(text, options);
  } catch (e) {
    if (e && (e.code === 'CSV_UNTERMINATED_QUOTE' || e.code === 'CSV_BAD_QUOTE')) {
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
  const idx = cols.map((c) => header.indexOf(c.col.name));
  cols.forEach((c, k) => {
    if (idx[k] === -1) errors.push({ row: 1, column: c.col.name, code: 'MISSING_COLUMN' });
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
      const cell = rec[idx[k]];
      const name = c.col.name;
      const push = (code) => errors.push({ row, column: name, code });
      if (cell === '') {
        if (c.required) push('REQUIRED');
        return;
      }
      if (!checkType(c.type, cell)) {
        push('TYPE');
        return;
      }
      const def = c.col;
      if (def.enum !== undefined && !def.enum.includes(cell)) push('ENUM');
      if (c.re && !c.re.test(cell)) push('PATTERN');
      const len = def.minLength !== undefined || def.maxLength !== undefined ? Array.from(cell).length : 0;
      if (def.minLength !== undefined && len < def.minLength) push('MIN_LENGTH');
      if (def.maxLength !== undefined && len > def.maxLength) push('MAX_LENGTH');
      if (c.type === 'int' || c.type === 'number') {
        const v = Number(cell);
        if (def.min !== undefined && v < def.min) push('MIN');
        if (def.max !== undefined && v > def.max) push('MAX');
      } else if (c.type === 'date') {
        if (def.min !== undefined && cell < def.min) push('MIN');
        if (def.max !== undefined && cell > def.max) push('MAX');
      }
      if (c.unique) {
        if (seen[k].has(cell)) push('UNIQUE');
        else seen[k].add(cell);
      }
    });
  }
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
