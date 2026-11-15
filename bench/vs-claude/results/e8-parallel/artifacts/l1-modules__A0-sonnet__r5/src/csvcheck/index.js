// csvcheck — xem SPEC.md, mục "Module csvcheck".

function err(code, row) {
  const e = new Error(code);
  e.code = code;
  if (row !== undefined) e.row = row;
  return e;
}

export function parseCsv(text, options = {}) {
  if (typeof text !== 'string') throw err('CSV_INVALID_INPUT');
  if (options === null || typeof options !== 'object') options = {};
  const delim = options.delimiter === undefined ? ',' : options.delimiter;
  if (typeof delim !== 'string' || delim.length !== 1 || delim === '"' || delim === '\r' || delim === '\n') {
    throw err('CSV_INVALID_INPUT');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const n = text.length;
  const rows = [];
  let pos = 0;

  const eatTerminator = () => {
    if (text[pos] === '\r' && text[pos + 1] === '\n') pos += 2;
    else pos += 1;
  };

  while (pos < n) {
    if (text[pos] === '\r' || text[pos] === '\n') {
      eatTerminator(); // dòng trống
      continue;
    }
    const row = rows.length + 1;
    const cells = [];
    for (;;) {
      let val = '';
      if (text[pos] === '"') {
        pos++;
        for (;;) {
          if (pos >= n) throw err('CSV_UNTERMINATED_QUOTE', row);
          const c = text[pos];
          if (c === '"') {
            if (text[pos + 1] === '"') {
              val += '"';
              pos += 2;
            } else {
              pos++;
              break;
            }
          } else {
            val += c;
            pos++;
          }
        }
        if (pos < n && text[pos] !== delim && text[pos] !== '\r' && text[pos] !== '\n') {
          throw err('CSV_BAD_QUOTE', row);
        }
      } else {
        while (pos < n && text[pos] !== delim && text[pos] !== '\r' && text[pos] !== '\n') {
          if (text[pos] === '"') throw err('CSV_BAD_QUOTE', row);
          val += text[pos++];
        }
      }
      cells.push(val);
      if (pos >= n) break;
      if (text[pos] === delim) {
        pos++;
        continue;
      }
      eatTerminator();
      break;
    }
    rows.push(cells);
  }
  return rows;
}

const TYPES = ['string', 'int', 'number', 'bool', 'date'];

function isRealDate(s) {
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

function checkSchema(schema) {
  const bad = () => err('CSV_INVALID_SCHEMA');
  if (schema === null || typeof schema !== 'object' || !Array.isArray(schema.columns) || schema.columns.length === 0) {
    throw bad();
  }
  const names = new Set();
  const out = [];
  for (const col of schema.columns) {
    if (col === null || typeof col !== 'object' || Array.isArray(col)) throw bad();
    if (typeof col.name !== 'string' || names.has(col.name)) throw bad();
    names.add(col.name);
    const type = col.type === undefined ? 'string' : col.type;
    if (!TYPES.includes(type)) throw bad();
    let re = null;
    if (col.pattern !== undefined) {
      if (typeof col.pattern !== 'string') throw bad();
      try {
        re = new RegExp(col.pattern);
      } catch {
        throw bad();
      }
    }
    if (col.enum !== undefined) {
      if (!Array.isArray(col.enum) || col.enum.length === 0 || col.enum.some((x) => typeof x !== 'string')) {
        throw bad();
      }
    }
    for (const k of ['min', 'max']) {
      const v = col[k];
      if (v === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof v !== 'number' || !Number.isFinite(v)) throw bad();
      } else if (type === 'date') {
        if (!isRealDate(v)) throw bad();
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      const v = col[k];
      if (v !== undefined && (!Number.isInteger(v) || v < 0)) throw bad();
    }
    out.push({ col, type, re });
  }
  return out;
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
  let rows;
  try {
    rows = parseCsv(text, options);
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
  if (rows.length === 0) {
    return { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] };
  }

  const errors = [];
  const header = rows[0];
  const idx = cols.map(({ col }) => header.indexOf(col.name));
  cols.forEach(({ col }, k) => {
    if (idx[k] < 0) errors.push({ row: 1, column: col.name, code: 'MISSING_COLUMN' });
  });
  const seen = cols.map(() => new Set());

  for (let r = 1; r < rows.length; r++) {
    const row = r + 1;
    const cells = rows[r];
    if (cells.length !== header.length) {
      errors.push({ row, column: null, code: 'ROW_LENGTH' });
      continue;
    }
    cols.forEach(({ col, type, re }, k) => {
      if (idx[k] < 0) return;
      const v = cells[idx[k]];
      const add = (code) => errors.push({ row, column: col.name, code });
      if (v === '') {
        if (col.required === true) add('REQUIRED');
        return;
      }
      if (!typeOk(type, v)) return add('TYPE');
      if (col.enum !== undefined && !col.enum.includes(v)) add('ENUM');
      if (re && !re.test(v)) add('PATTERN');
      const len = col.minLength !== undefined || col.maxLength !== undefined ? Array.from(v).length : 0;
      if (col.minLength !== undefined && len < col.minLength) add('MIN_LENGTH');
      if (col.maxLength !== undefined && len > col.maxLength) add('MAX_LENGTH');
      if (type === 'int' || type === 'number') {
        const x = Number(v);
        if (col.min !== undefined && x < col.min) add('MIN');
        if (col.max !== undefined && x > col.max) add('MAX');
      } else if (type === 'date') {
        if (col.min !== undefined && v < col.min) add('MIN');
        if (col.max !== undefined && v > col.max) add('MAX');
      }
      if (col.unique) {
        if (seen[k].has(v)) add('UNIQUE');
        else seen[k].add(v);
      }
    });
  }
  return { ok: errors.length === 0, rowCount: rows.length - 1, errors };
}
