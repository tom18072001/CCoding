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
  let delimiter = ',';
  if (opts.delimiter !== undefined) {
    const d = opts.delimiter;
    if (typeof d !== 'string' || Array.from(d).length !== 1 || d === '"' || d === '\r' || d === '\n') {
      throw fail('CSV_INVALID_INPUT', 'delimiter không hợp lệ');
    }
    delimiter = d;
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const records = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    const c = text[i];
    // dòng trống
    if (c === '\n') { i++; continue; }
    if (c === '\r') { i += text[i + 1] === '\n' ? 2 : 1; continue; }
    const row = records.length + 1;
    const rec = [];
    let endRecord = false;
    while (!endRecord) {
      let cell = '';
      if (text[i] === '"') {
        i++;
        let closed = false;
        while (i < n) {
          if (text[i] === '"') {
            if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
            i++; closed = true; break;
          }
          cell += text[i++];
        }
        if (!closed) throw fail('CSV_UNTERMINATED_QUOTE', 'nháy không đóng', row);
        if (i < n && text[i] !== delimiter && text[i] !== '\n' && text[i] !== '\r') {
          throw fail('CSV_BAD_QUOTE', 'ký tự thừa sau nháy đóng', row);
        }
      } else {
        const start = i;
        while (i < n && text[i] !== delimiter && text[i] !== '\n' && text[i] !== '\r') {
          if (text[i] === '"') throw fail('CSV_BAD_QUOTE', 'nháy giữa ô không nháy', row);
          i++;
        }
        cell = text.slice(start, i);
      }
      rec.push(cell);
      if (i >= n) endRecord = true;
      else if (text[i] === delimiter) {
        i++;
        if (i >= n) { rec.push(''); endRecord = true; }
      } else {
        i += text[i] === '\r' && text[i + 1] === '\n' ? 2 : 1;
        endRecord = true;
      }
    }
    records.push(rec);
  }
  return records;
}

const TYPES = ['string', 'int', 'number', 'bool', 'date'];

function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (y < 1 || m < 1 || m > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  return d <= dim;
}

function checkType(type, v) {
  switch (type) {
    case 'int': return /^[+-]?\d+$/.test(v) && Number.isSafeInteger(Number(v));
    case 'number': return /^[+-]?\d+(\.\d+)?$/.test(v) && Number.isFinite(Number(v));
    case 'bool': return /^(true|false)$/i.test(v);
    case 'date': return isValidDate(v);
    default: return true;
  }
}

function badSchema(msg) {
  return fail('CSV_INVALID_SCHEMA', msg);
}

function compileSchema(schema) {
  if (schema === null || typeof schema !== 'object' || !Array.isArray(schema.columns) || schema.columns.length === 0) {
    throw badSchema('columns phải là mảng không rỗng');
  }
  const names = new Set();
  return schema.columns.map((col) => {
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
    if (col.enum !== undefined) {
      if (!Array.isArray(col.enum) || col.enum.length === 0 || !col.enum.every((x) => typeof x === 'string')) {
        throw badSchema('enum không hợp lệ');
      }
    }
    for (const k of ['min', 'max']) {
      const v = col[k];
      if (v === undefined) continue;
      if ((type === 'int' || type === 'number') && !(typeof v === 'number' && Number.isFinite(v))) {
        throw badSchema(`${k} phải là số hữu hạn`);
      }
      if (type === 'date' && !isValidDate(v)) throw badSchema(`${k} phải là chuỗi ngày hợp lệ`);
    }
    for (const k of ['minLength', 'maxLength']) {
      const v = col[k];
      if (v !== undefined && !(Number.isInteger(v) && v >= 0)) throw badSchema(`${k} không hợp lệ`);
    }
    return { col, type, re };
  });
}

export function validateCsv(text, schema, options = {}) {
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
  const header = records[0];
  const errors = [];
  const idx = cols.map(({ col }) => header.indexOf(col.name));
  cols.forEach(({ col }, k) => {
    if (idx[k] === -1) errors.push({ row: 1, column: col.name, code: 'MISSING_COLUMN' });
  });
  const seen = cols.map(() => new Set());

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
      const err = (code) => errors.push({ row, column: col.name, code });
      if (v === '') {
        if (col.required) err('REQUIRED');
        return;
      }
      if (!checkType(type, v)) { err('TYPE'); return; }
      if (col.enum !== undefined && !col.enum.includes(v)) err('ENUM');
      if (re && !re.test(v)) err('PATTERN');
      const len = (col.minLength !== undefined || col.maxLength !== undefined) ? Array.from(v).length : 0;
      if (col.minLength !== undefined && len < col.minLength) err('MIN_LENGTH');
      if (col.maxLength !== undefined && len > col.maxLength) err('MAX_LENGTH');
      if (type === 'int' || type === 'number') {
        const num = Number(v);
        if (col.min !== undefined && num < col.min) err('MIN');
        if (col.max !== undefined && num > col.max) err('MAX');
      } else if (type === 'date') {
        if (col.min !== undefined && v < col.min) err('MIN');
        if (col.max !== undefined && v > col.max) err('MAX');
      }
      if (col.unique) {
        if (seen[k].has(v)) err('UNIQUE');
        else seen[k].add(v);
      }
    });
  }
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
