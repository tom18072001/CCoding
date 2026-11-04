// csvcheck — xem SPEC.md, mục "Module csvcheck".

function err(code, row) {
  const e = new Error(code);
  e.code = code;
  if (row !== undefined) e.row = row;
  return e;
}

export function parseCsv(text, options = {}) {
  if (typeof text !== 'string') throw err('CSV_INVALID_INPUT');
  const delim = (options ?? {}).delimiter === undefined ? ',' : options.delimiter;
  if (
    typeof delim !== 'string' ||
    Array.from(delim).length !== 1 ||
    delim === '"' ||
    delim === '\r' ||
    delim === '\n'
  ) {
    throw err('CSV_INVALID_INPUT');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const n = text.length;
  const rows = [];
  let i = 0;

  const newlineLen = (at) => {
    if (text[at] === '\r') return text[at + 1] === '\n' ? 2 : 1;
    return text[at] === '\n' ? 1 : 0;
  };

  while (i < n) {
    const nl = newlineLen(i);
    if (nl) {
      i += nl; // dòng trống
      continue;
    }
    const row = [];
    for (;;) {
      let field = '';
      if (text[i] === '"') {
        i++;
        for (;;) {
          if (i >= n) throw err('CSV_UNTERMINATED_QUOTE', rows.length + 1);
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
        if (i < n && !text.startsWith(delim, i) && !newlineLen(i)) {
          throw err('CSV_BAD_QUOTE', rows.length + 1);
        }
      } else {
        const start = i;
        while (i < n && !text.startsWith(delim, i) && !newlineLen(i)) {
          if (text[i] === '"') throw err('CSV_BAD_QUOTE', rows.length + 1);
          i++;
        }
        field = text.slice(start, i);
      }
      row.push(field);
      if (i >= n) break;
      const nl2 = newlineLen(i);
      if (nl2) {
        i += nl2;
        break;
      }
      i += delim.length; // dấu phân cách; ô kế tiếp có thể rỗng ở cuối văn bản
    }
    rows.push(row);
  }
  return rows;
}

const TYPES = ['string', 'int', 'number', 'bool', 'date'];

function isRealDate(s) {
  const mt = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!mt) return false;
  const y = Number(mt[1]);
  const m = Number(mt[2]);
  const d = Number(mt[3]);
  if (y < 1 || m < 1 || m > 12) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  return d >= 1 && d <= dim;
}

function schemaError() {
  return err('CSV_INVALID_SCHEMA');
}

function compileSchema(schema) {
  if (schema === null || typeof schema !== 'object' || !Array.isArray(schema.columns) || schema.columns.length === 0) {
    throw schemaError();
  }
  const names = new Set();
  return schema.columns.map((col) => {
    if (col === null || typeof col !== 'object' || Array.isArray(col)) throw schemaError();
    if (typeof col.name !== 'string' || names.has(col.name)) throw schemaError();
    names.add(col.name);
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
      if (!Array.isArray(col.enum) || col.enum.length === 0 || col.enum.some((v) => typeof v !== 'string')) {
        throw schemaError();
      }
    }
    for (const k of ['min', 'max']) {
      const v = col[k];
      if (v === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof v !== 'number' || !Number.isFinite(v)) throw schemaError();
      } else if (type === 'date') {
        if (typeof v !== 'string' || !isRealDate(v)) throw schemaError();
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      const v = col[k];
      if (v !== undefined && !(Number.isInteger(v) && v >= 0)) throw schemaError();
    }
    return { col, type, regex, enumSet: col.enum === undefined ? null : new Set(col.enum) };
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
  const index = cols.map((c) => header.indexOf(c.col.name));
  cols.forEach((c, k) => {
    if (index[k] < 0) errors.push({ row: 1, column: c.col.name, code: 'MISSING_COLUMN' });
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
      if (index[k] < 0) return;
      const cell = rec[index[k]];
      const { col, type } = c;
      const fail = (code) => errors.push({ row, column: col.name, code });
      if (cell === '') {
        if (col.required) fail('REQUIRED');
        return;
      }
      if (!typeOk(type, cell)) {
        fail('TYPE');
        return;
      }
      if (c.enumSet && !c.enumSet.has(cell)) fail('ENUM');
      if (c.regex && !c.regex.test(cell)) fail('PATTERN');
      const len = Array.from(cell).length;
      if (col.minLength !== undefined && len < col.minLength) fail('MIN_LENGTH');
      if (col.maxLength !== undefined && len > col.maxLength) fail('MAX_LENGTH');
      if (type === 'int' || type === 'number') {
        const v = Number(cell);
        if (col.min !== undefined && v < col.min) fail('MIN');
        if (col.max !== undefined && v > col.max) fail('MAX');
      } else if (type === 'date') {
        if (col.min !== undefined && cell < col.min) fail('MIN');
        if (col.max !== undefined && cell > col.max) fail('MAX');
      }
      if (col.unique) {
        if (seen[k].has(cell)) fail('UNIQUE');
        else seen[k].add(cell);
      }
    });
  }
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
