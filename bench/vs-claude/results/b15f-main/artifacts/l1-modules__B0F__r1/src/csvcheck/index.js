// Module csvcheck — xem mục "csvcheck" trong SPEC.md.

function err(code, message, row) {
  const e = new Error(message);
  e.code = code;
  if (row !== undefined) e.row = row;
  return e;
}

export function parseCsv(text, options = {}) {
  if (typeof text !== 'string') throw err('CSV_INVALID_INPUT', 'text phải là chuỗi');
  if (options === null || options === undefined) options = {};
  if (typeof options !== 'object') throw err('CSV_INVALID_INPUT', 'options phải là object');
  let delim = ',';
  if (options.delimiter !== undefined) {
    const d = options.delimiter;
    if (typeof d !== 'string' || d.length !== 1 || d === '"' || d === '\r' || d === '\n') {
      throw err('CSV_INVALID_INPUT', 'delimiter không hợp lệ');
    }
    delim = d;
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const n = text.length;
  const records = [];
  let i = 0;
  const isNl = (c) => c === '\n' || c === '\r';
  const skipNl = () => {
    if (text[i] === '\r' && text[i + 1] === '\n') i += 2;
    else i += 1;
  };

  while (i < n) {
    if (isNl(text[i])) { skipNl(); continue; } // dòng trống
    const row = records.length + 1;
    const rec = [];
    for (;;) {
      let field = '';
      if (text[i] === '"') {
        i++;
        for (;;) {
          if (i >= n) throw err('CSV_UNTERMINATED_QUOTE', 'nháy không đóng', row);
          const c = text[i];
          if (c === '"') {
            if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
            i++;
            break;
          }
          field += c;
          i++;
        }
        if (i < n && text[i] !== delim && !isNl(text[i])) {
          throw err('CSV_BAD_QUOTE', 'ký tự sau nháy đóng', row);
        }
      } else {
        while (i < n && text[i] !== delim && !isNl(text[i])) {
          if (text[i] === '"') throw err('CSV_BAD_QUOTE', 'nháy giữa ô không nháy', row);
          field += text[i];
          i++;
        }
      }
      rec.push(field);
      if (i < n && text[i] === delim) { i++; continue; }
      break;
    }
    records.push(rec);
    if (i < n) skipNl();
  }
  return records;
}

const TYPES = ['string', 'int', 'number', 'bool', 'date'];

function isRealDate(s) {
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
  return err('CSV_INVALID_SCHEMA', msg);
}

function checkSchema(schema) {
  if (schema === null || typeof schema !== 'object' || !Array.isArray(schema.columns) || schema.columns.length === 0) {
    throw badSchema('columns phải là mảng không rỗng');
  }
  const names = new Set();
  const regexes = [];
  for (const col of schema.columns) {
    if (col === null || typeof col !== 'object' || Array.isArray(col)) throw badSchema('cột phải là object');
    if (typeof col.name !== 'string' || names.has(col.name)) throw badSchema('name thiếu hoặc trùng');
    names.add(col.name);
    const type = col.type === undefined ? 'string' : col.type;
    if (!TYPES.includes(type)) throw badSchema('type lạ');
    let re = null;
    if (col.pattern !== undefined) {
      if (typeof col.pattern !== 'string') throw badSchema('pattern phải là chuỗi');
      try { re = new RegExp(col.pattern); } catch { throw badSchema('pattern không biên dịch được'); }
    }
    regexes.push(re);
    if (col.enum !== undefined) {
      if (!Array.isArray(col.enum) || col.enum.length === 0 || col.enum.some((v) => typeof v !== 'string')) {
        throw badSchema('enum không hợp lệ');
      }
    }
    for (const k of ['min', 'max']) {
      if (col[k] === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof col[k] !== 'number' || !Number.isFinite(col[k])) throw badSchema(`${k} phải là số hữu hạn`);
      } else if (type === 'date') {
        if (!isRealDate(col[k])) throw badSchema(`${k} phải là ngày hợp lệ`);
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      if (col[k] !== undefined && !(Number.isInteger(col[k]) && col[k] >= 0)) {
        throw badSchema(`${k} phải là số nguyên >= 0`);
      }
    }
  }
  return regexes;
}

function typeOk(type, v) {
  switch (type) {
    case 'int': return /^[+-]?\d+$/.test(v) && Number.isSafeInteger(Number(v));
    case 'number': return /^[+-]?\d+(\.\d+)?$/.test(v) && Number.isFinite(Number(v));
    case 'bool': return /^(true|false)$/i.test(v);
    case 'date': return isRealDate(v);
    default: return true;
  }
}

export function validateCsv(text, schema, options = {}) {
  const regexes = checkSchema(schema);
  let rows;
  try {
    rows = parseCsv(text, options);
  } catch (e) {
    if (e.code === 'CSV_UNTERMINATED_QUOTE' || e.code === 'CSV_BAD_QUOTE') {
      return { ok: false, rowCount: 0, errors: [{ row: e.row, column: null, code: e.code.slice(4) }] };
    }
    throw e;
  }
  if (rows.length === 0) {
    return { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] };
  }
  const errors = [];
  const header = rows[0];
  const cols = schema.columns;
  const idx = cols.map((c) => header.indexOf(c.name));
  cols.forEach((c, k) => {
    if (idx[k] === -1) errors.push({ row: 1, column: c.name, code: 'MISSING_COLUMN' });
  });
  const seen = cols.map(() => new Set());

  for (let r = 1; r < rows.length; r++) {
    const rec = rows[r];
    const row = r + 1;
    if (rec.length !== header.length) {
      errors.push({ row, column: null, code: 'ROW_LENGTH' });
      continue;
    }
    cols.forEach((c, k) => {
      if (idx[k] === -1) return;
      const v = rec[idx[k]];
      const add = (code) => errors.push({ row, column: c.name, code });
      if (v === '') {
        if (c.required) add('REQUIRED');
        return;
      }
      const type = c.type === undefined ? 'string' : c.type;
      if (!typeOk(type, v)) { add('TYPE'); return; }
      if (c.enum !== undefined && !c.enum.includes(v)) add('ENUM');
      if (regexes[k] && !regexes[k].test(v)) add('PATTERN');
      const len = Array.from(v).length;
      if (c.minLength !== undefined && len < c.minLength) add('MIN_LENGTH');
      if (c.maxLength !== undefined && len > c.maxLength) add('MAX_LENGTH');
      const cmp = type === 'int' || type === 'number' || type === 'date';
      if (cmp) {
        const val = type === 'date' ? v : Number(v);
        if (c.min !== undefined && val < c.min) add('MIN');
        if (c.max !== undefined && val > c.max) add('MAX');
      }
      if (c.unique) {
        if (seen[k].has(v)) add('UNIQUE');
        else seen[k].add(v);
      }
    });
  }
  return { ok: errors.length === 0, rowCount: rows.length - 1, errors };
}
