// csvcheck — xem SPEC.md, mục "Module csvcheck".

function err(code, message, row) {
  const e = new Error(message || code);
  e.code = code;
  if (row !== undefined) e.row = row;
  return e;
}

export function parseCsv(text, options) {
  if (typeof text !== 'string') throw err('CSV_INVALID_INPUT');
  const opts = options === null || typeof options !== 'object' ? {} : options;
  let delim = ',';
  if (opts.delimiter !== undefined) {
    delim = opts.delimiter;
    if (typeof delim !== 'string' || Array.from(delim).length !== 1 || delim === '"' || delim === '\r' || delim === '\n') {
      throw err('CSV_INVALID_INPUT');
    }
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const n = text.length;
  const dl = delim.length;
  const records = [];
  let i = 0;

  while (i < n) {
    // Dòng trống: bỏ qua.
    if (text[i] === '\r') {
      i += text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    if (text[i] === '\n') {
      i++;
      continue;
    }
    const row = records.length + 1;
    const fields = [];
    for (;;) {
      let value = '';
      if (text[i] === '"') {
        i++;
        for (;;) {
          if (i >= n) throw err('CSV_UNTERMINATED_QUOTE', 'unterminated quote', row);
          const c = text[i];
          if (c === '"') {
            if (text[i + 1] === '"') {
              value += '"';
              i += 2;
            } else {
              i++;
              break;
            }
          } else {
            value += c;
            i++;
          }
        }
        // Sau nháy đóng chỉ được: phân cách, xuống dòng, hết văn bản.
        if (i < n && text[i] !== '\r' && text[i] !== '\n' && !text.startsWith(delim, i)) {
          throw err('CSV_BAD_QUOTE', 'bad quote', row);
        }
      } else {
        const start = i;
        while (i < n && text[i] !== '\r' && text[i] !== '\n' && !text.startsWith(delim, i)) {
          if (text[i] === '"') throw err('CSV_BAD_QUOTE', 'bad quote', row);
          i++;
        }
        value = text.slice(start, i);
      }
      fields.push(value);
      if (i < n && text.startsWith(delim, i)) {
        i += dl;
        continue; // ô kế tiếp (có thể rỗng ở cuối văn bản)
      }
      if (i < n) i += text[i] === '\r' && text[i + 1] === '\n' ? 2 : 1;
      break;
    }
    records.push(fields);
  }
  return records;
}

const TYPES = ['string', 'int', 'number', 'bool', 'date'];

function validDateString(s) {
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
      if (!Array.isArray(col.enum) || col.enum.length === 0 || col.enum.some((v) => typeof v !== 'string')) {
        throw invalidSchema();
      }
    }
    for (const k of ['min', 'max']) {
      const v = col[k];
      if (v === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof v !== 'number' || !Number.isFinite(v)) throw invalidSchema();
      } else if (type === 'date') {
        if (typeof v !== 'string' || !validDateString(v)) throw invalidSchema();
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      const v = col[k];
      if (v !== undefined && !(Number.isSafeInteger(v) && v >= 0)) throw invalidSchema();
    }
    return {
      name: col.name,
      type,
      required: Boolean(col.required),
      unique: Boolean(col.unique),
      re,
      enumSet: col.enum === undefined ? null : col.enum,
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
    case 'bool': {
      const l = v.toLowerCase();
      return l === 'true' || l === 'false';
    }
    case 'date':
      return validDateString(v);
    default:
      return false;
  }
}

function checkCell(col, v, seen) {
  if (v === '') return col.required ? ['REQUIRED'] : [];
  if (!typeOk(col.type, v)) return ['TYPE'];
  const out = [];
  if (col.enumSet !== null && !col.enumSet.includes(v)) out.push('ENUM');
  if (col.re !== null && !col.re.test(v)) out.push('PATTERN');
  if (col.minLength !== undefined || col.maxLength !== undefined) {
    const len = Array.from(v).length;
    if (col.minLength !== undefined && len < col.minLength) out.push('MIN_LENGTH');
    if (col.maxLength !== undefined && len > col.maxLength) out.push('MAX_LENGTH');
  }
  if (col.type === 'int' || col.type === 'number') {
    const num = Number(v);
    if (col.min !== undefined && num < col.min) out.push('MIN');
    if (col.max !== undefined && num > col.max) out.push('MAX');
  } else if (col.type === 'date') {
    if (col.min !== undefined && v < col.min) out.push('MIN');
    if (col.max !== undefined && v > col.max) out.push('MAX');
  }
  if (col.unique) {
    if (seen.has(v)) out.push('UNIQUE');
    else seen.add(v);
  }
  return out;
}

export function validateCsv(text, schema, options) {
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

  const errors = [];
  const header = records[0];
  const index = new Map();
  header.forEach((h, i) => {
    if (!index.has(h)) index.set(h, i);
  });
  const present = cols.map((c) => (index.has(c.name) ? index.get(c.name) : -1));
  cols.forEach((c, k) => {
    if (present[k] === -1) errors.push({ row: 1, column: c.name, code: 'MISSING_COLUMN' });
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
      if (present[k] === -1) return;
      for (const code of checkCell(c, rec[present[k]], seen[k])) errors.push({ row, column: c.name, code });
    });
  }
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
