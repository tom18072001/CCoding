// Module csvcheck — xem mục "csvcheck" trong SPEC.md.

function fail(code, message, row) {
  const e = new Error(message);
  e.code = code;
  if (row !== undefined) e.row = row;
  return e;
}

export function parseCsv(text, options = {}) {
  if (typeof text !== 'string') throw fail('CSV_INVALID_INPUT', 'text phải là chuỗi');
  const opts = options == null ? {} : options;
  if (typeof opts !== 'object') throw fail('CSV_INVALID_INPUT', 'options không hợp lệ');
  const delim = opts.delimiter === undefined ? ',' : opts.delimiter;
  if (typeof delim !== 'string' || delim.length !== 1 || delim === '"' || delim === '\r' || delim === '\n') {
    throw fail('CSV_INVALID_INPUT', 'delimiter không hợp lệ');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const n = text.length;
  const records = [];
  let i = 0;
  while (i < n) {
    const c = text[i];
    if (c === '\r') { i += text[i + 1] === '\n' ? 2 : 1; continue; } // dòng trống
    if (c === '\n') { i++; continue; }
    const row = records.length + 1;
    const fields = [];
    for (;;) {
      let field = '';
      if (text[i] === '"') {
        i++;
        for (;;) {
          if (i >= n) throw fail('CSV_UNTERMINATED_QUOTE', 'nháy không đóng', row);
          const ch = text[i];
          if (ch === '"') {
            if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
            i++;
            break;
          }
          field += ch;
          i++;
        }
        if (i < n && text[i] !== delim && text[i] !== '\r' && text[i] !== '\n') {
          throw fail('CSV_BAD_QUOTE', 'ký tự thừa sau nháy đóng', row);
        }
      } else {
        const start = i;
        while (i < n && text[i] !== delim && text[i] !== '\r' && text[i] !== '\n') {
          if (text[i] === '"') throw fail('CSV_BAD_QUOTE', 'nháy giữa ô không nháy', row);
          i++;
        }
        field = text.slice(start, i);
      }
      fields.push(field);
      if (i < n && text[i] === delim) { i++; continue; }
      if (i < n) i += text[i] === '\r' && text[i + 1] === '\n' ? 2 : 1;
      break;
    }
    records.push(fields);
  }
  return records;
}

const TYPES = ['string', 'int', 'number', 'bool', 'date'];

function isDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (y < 1 || mo < 1 || mo > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return d <= dim;
}

function badSchema(msg) {
  return fail('CSV_INVALID_SCHEMA', msg);
}

function compileSchema(schema) {
  if (schema === null || typeof schema !== 'object' || !Array.isArray(schema.columns) || schema.columns.length === 0) {
    throw badSchema('columns phải là mảng không rỗng');
  }
  const seen = new Set();
  return schema.columns.map((col) => {
    if (col === null || typeof col !== 'object' || Array.isArray(col)) throw badSchema('cột phải là object');
    if (typeof col.name !== 'string' || col.name === '' || seen.has(col.name)) throw badSchema('name thiếu hoặc trùng');
    seen.add(col.name);
    const type = col.type === undefined ? 'string' : col.type;
    if (!TYPES.includes(type)) throw badSchema('type lạ');
    let re = null;
    if (col.pattern !== undefined) {
      if (typeof col.pattern !== 'string') throw badSchema('pattern phải là chuỗi');
      try { re = new RegExp(col.pattern); } catch { throw badSchema('pattern không biên dịch được'); }
    }
    if (col.enum !== undefined &&
        (!Array.isArray(col.enum) || col.enum.length === 0 || !col.enum.every((v) => typeof v === 'string'))) {
      throw badSchema('enum không hợp lệ');
    }
    for (const k of ['min', 'max']) {
      const v = col[k];
      if (v === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof v !== 'number' || !Number.isFinite(v)) throw badSchema(`${k} phải là số hữu hạn`);
      } else if (type === 'date') {
        if (typeof v !== 'string' || !isDate(v)) throw badSchema(`${k} phải là ngày hợp lệ`);
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      const v = col[k];
      if (v !== undefined && !(Number.isInteger(v) && v >= 0)) throw badSchema(`${k} không hợp lệ`);
    }
    return { col, type, re };
  });
}

function typeOk(type, s) {
  switch (type) {
    case 'string': return true;
    case 'int': return /^[+-]?\d+$/.test(s) && Number.isSafeInteger(Number(s));
    case 'number': return /^[+-]?\d+(\.\d+)?$/.test(s) && Number.isFinite(Number(s));
    case 'bool': return /^(true|false)$/i.test(s);
    case 'date': return isDate(s);
    default: return false;
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
  const header = records[0];
  const errors = [];
  const idx = cols.map(({ col }) => header.indexOf(col.name));
  cols.forEach(({ col }, k) => {
    if (idx[k] === -1) errors.push({ row: 1, column: col.name, code: 'MISSING_COLUMN' });
  });
  const uniques = cols.map(() => new Set());

  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    const row = r + 1;
    if (rec.length !== header.length) {
      errors.push({ row, column: null, code: 'ROW_LENGTH' });
      continue;
    }
    cols.forEach(({ col, type, re }, k) => {
      if (idx[k] === -1) return;
      const v = rec[idx[k]];
      const add = (code) => errors.push({ row, column: col.name, code });
      if (v === '') {
        if (col.required === true) add('REQUIRED');
        return;
      }
      if (!typeOk(type, v)) { add('TYPE'); return; }
      if (col.enum !== undefined && !col.enum.includes(v)) add('ENUM');
      if (re && !re.test(v)) add('PATTERN');
      const len = col.minLength !== undefined || col.maxLength !== undefined ? Array.from(v).length : 0;
      if (col.minLength !== undefined && len < col.minLength) add('MIN_LENGTH');
      if (col.maxLength !== undefined && len > col.maxLength) add('MAX_LENGTH');
      if (type === 'int' || type === 'number') {
        const num = Number(v);
        if (col.min !== undefined && num < col.min) add('MIN');
        if (col.max !== undefined && num > col.max) add('MAX');
      } else if (type === 'date') {
        if (col.min !== undefined && v < col.min) add('MIN');
        if (col.max !== undefined && v > col.max) add('MAX');
      }
      if (col.unique === true) {
        if (uniques[k].has(v)) add('UNIQUE');
        else uniques[k].add(v);
      }
    });
  }
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
