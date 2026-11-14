// Module csvcheck — xem mục "csvcheck" trong SPEC.md.

function fail(code, message, row) {
  const e = new Error(message);
  e.code = code;
  if (row !== undefined) e.row = row;
  return e;
}

export function parseCsv(text, options = {}) {
  if (typeof text !== 'string') throw fail('CSV_INVALID_INPUT', 'text phải là chuỗi');
  const delimiter = options && options.delimiter !== undefined ? options.delimiter : ',';
  if (typeof delimiter !== 'string' || delimiter.length !== 1
    || delimiter === '"' || delimiter === '\r' || delimiter === '\n') {
    throw fail('CSV_INVALID_INPUT', 'delimiter không hợp lệ');
  }
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  const records = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    const c = text[i];
    // dòng trống
    if (c === '\r') { i += text[i + 1] === '\n' ? 2 : 1; continue; }
    if (c === '\n') { i++; continue; }

    const row = records.length + 1;
    const record = [];
    for (;;) {
      let field = '';
      if (text[i] === '"') {
        i++;
        let closed = false;
        while (i < n) {
          if (text[i] === '"') {
            if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
            i++;
            closed = true;
            break;
          }
          field += text[i++];
        }
        if (!closed) throw fail('CSV_UNTERMINATED_QUOTE', 'nháy không đóng', row);
        if (i < n && text[i] !== delimiter && text[i] !== '\r' && text[i] !== '\n') {
          throw fail('CSV_BAD_QUOTE', 'ký tự lạ sau nháy đóng', row);
        }
      } else {
        const start = i;
        while (i < n && text[i] !== delimiter && text[i] !== '\r' && text[i] !== '\n') {
          if (text[i] === '"') throw fail('CSV_BAD_QUOTE', 'nháy giữa ô không nháy', row);
          i++;
        }
        field = text.slice(start, i);
      }
      record.push(field);
      if (i >= n) break;
      if (text[i] === delimiter) {
        i++;
        continue; // sau dấu phân cách luôn có thêm một ô (có thể rỗng)
      }
      // kết thúc dòng
      i += text[i] === '\r' && text[i + 1] === '\n' ? 2 : 1;
      break;
    }
    records.push(record);
  }
  return records;
}

const TYPES = ['string', 'int', 'number', 'bool', 'date'];

function isRealDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y === 0 || mo < 1 || mo > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return d <= dim;
}

function checkSchema(schema) {
  const bad = (msg) => fail('CSV_INVALID_SCHEMA', msg);
  if (!schema || typeof schema !== 'object' || !Array.isArray(schema.columns)
    || schema.columns.length === 0) throw bad('columns phải là mảng không rỗng');
  const names = new Set();
  const cols = [];
  for (const col of schema.columns) {
    if (!col || typeof col !== 'object' || Array.isArray(col)) throw bad('cột phải là object');
    if (typeof col.name !== 'string' || col.name === '' || names.has(col.name)) {
      throw bad('name thiếu hoặc trùng');
    }
    names.add(col.name);
    const type = col.type === undefined ? 'string' : col.type;
    if (!TYPES.includes(type)) throw bad('type lạ');
    let re = null;
    if (col.pattern !== undefined) {
      if (typeof col.pattern !== 'string') throw bad('pattern phải là chuỗi');
      try { re = new RegExp(col.pattern); } catch { throw bad('pattern không biên dịch được'); }
    }
    if (col.enum !== undefined
      && (!Array.isArray(col.enum) || col.enum.length === 0
        || col.enum.some((v) => typeof v !== 'string'))) {
      throw bad('enum phải là mảng chuỗi không rỗng');
    }
    for (const k of ['min', 'max']) {
      const v = col[k];
      if (v === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof v !== 'number' || !Number.isFinite(v)) throw bad(`${k} phải là số hữu hạn`);
      } else if (type === 'date') {
        if (typeof v !== 'string' || !isRealDate(v)) throw bad(`${k} phải là ngày hợp lệ`);
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      const v = col[k];
      if (v !== undefined && !(Number.isInteger(v) && v >= 0)) throw bad(`${k} không hợp lệ`);
    }
    cols.push({ col, type, re });
  }
  return cols;
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
  const cols = checkSchema(schema);
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
      const add = (code) => errors.push({ row, column: col.name, code });
      if (v === '') {
        if (col.required) add('REQUIRED');
        return;
      }
      if (!typeOk(type, v)) { add('TYPE'); return; }
      if (col.enum !== undefined && !col.enum.includes(v)) add('ENUM');
      if (re && !re.test(v)) add('PATTERN');
      const len = Array.from(v).length;
      if (col.minLength !== undefined && len < col.minLength) add('MIN_LENGTH');
      if (col.maxLength !== undefined && len > col.maxLength) add('MAX_LENGTH');
      if (type === 'int' || type === 'number' || type === 'date') {
        const x = type === 'date' ? v : Number(v);
        if (col.min !== undefined && x < col.min) add('MIN');
        if (col.max !== undefined && x > col.max) add('MAX');
      }
      if (col.unique) {
        if (seen[k].has(v)) add('UNIQUE');
        else seen[k].add(v);
      }
    });
  }
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
