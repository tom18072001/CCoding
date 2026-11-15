// Module csvcheck — xem mục "csvcheck" trong SPEC.md.

function fail(code, message, row) {
  const err = new Error(message);
  err.code = code;
  if (row !== undefined) err.row = row;
  return err;
}

export function parseCsv(text, options = {}) {
  if (typeof text !== 'string') throw fail('CSV_INVALID_INPUT', 'text phải là chuỗi');
  let delimiter = ',';
  if (options !== undefined && options !== null) {
    if (typeof options !== 'object') throw fail('CSV_INVALID_INPUT', 'options không hợp lệ');
    if (options.delimiter !== undefined) delimiter = options.delimiter;
  }
  if (typeof delimiter !== 'string' || delimiter.length !== 1 ||
      delimiter === '"' || delimiter === '\r' || delimiter === '\n') {
    throw fail('CSV_INVALID_INPUT', 'delimiter không hợp lệ');
  }

  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const n = text.length;
  const records = [];
  let record = [];
  let field = '';
  // atStart: đang ở đầu bản ghi và chưa có ký tự nào (dòng trống bị bỏ qua)
  let atStart = true;

  const curRow = () => records.length + 1;

  while (i < n) {
    const ch = text[i];
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      i++;
      if (!atStart) {
        record.push(field);
        records.push(record);
        record = [];
        field = '';
        atStart = true;
      }
      continue;
    }
    atStart = false;
    if (ch === delimiter) {
      record.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '"') {
      if (field !== '') throw fail('CSV_BAD_QUOTE', 'nháy giữa ô không nháy', curRow());
      // ô có nháy
      i++;
      let closed = false;
      while (i < n) {
        const c = text[i];
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          closed = true;
          i++;
          break;
        }
        field += c;
        i++;
      }
      if (!closed) throw fail('CSV_UNTERMINATED_QUOTE', 'nháy không đóng', curRow());
      if (i < n) {
        const c = text[i];
        if (c !== delimiter && c !== '\r' && c !== '\n') {
          throw fail('CSV_BAD_QUOTE', 'ký tự thừa sau nháy đóng', curRow());
        }
      }
      continue;
    }
    // ký tự thường (nháy đầu ô đã xử lý ở trên; `"` sau ký tự thường là lỗi)
    field += ch;
    i++;
    while (i < n) {
      const c = text[i];
      if (c === delimiter || c === '\r' || c === '\n') break;
      if (c === '"') throw fail('CSV_BAD_QUOTE', 'nháy giữa ô không nháy', curRow());
      field += c;
      i++;
    }
  }
  if (!atStart) {
    record.push(field);
    records.push(record);
  }
  return records;
}

const TYPES = ['string', 'int', 'number', 'bool', 'date'];

function isValidDate(s) {
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

function checkType(type, s) {
  switch (type) {
    case 'int':
      return /^[+-]?\d+$/.test(s) && Number.isSafeInteger(Number(s));
    case 'number':
      return /^[+-]?\d+(\.\d+)?$/.test(s) && Number.isFinite(Number(s));
    case 'bool':
      return /^(true|false)$/i.test(s);
    case 'date':
      return isValidDate(s);
    default:
      return true;
  }
}

function prepareSchema(schema) {
  const bad = (m) => fail('CSV_INVALID_SCHEMA', m);
  if (!schema || typeof schema !== 'object' || !Array.isArray(schema.columns) || schema.columns.length === 0) {
    throw bad('columns phải là mảng không rỗng');
  }
  const names = new Set();
  return schema.columns.map((col) => {
    if (!col || typeof col !== 'object' || Array.isArray(col)) throw bad('cột phải là object');
    if (typeof col.name !== 'string' || col.name === '' || names.has(col.name)) throw bad('name thiếu hoặc trùng');
    names.add(col.name);
    const type = col.type === undefined ? 'string' : col.type;
    if (!TYPES.includes(type)) throw bad('type lạ');
    let re = null;
    if (col.pattern !== undefined) {
      if (typeof col.pattern !== 'string') throw bad('pattern phải là chuỗi');
      try { re = new RegExp(col.pattern); } catch { throw bad('pattern không biên dịch được'); }
    }
    if (col.enum !== undefined &&
        (!Array.isArray(col.enum) || col.enum.length === 0 || !col.enum.every((e) => typeof e === 'string'))) {
      throw bad('enum không hợp lệ');
    }
    for (const k of ['min', 'max']) {
      const v = col[k];
      if (v === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof v !== 'number' || !Number.isFinite(v)) throw bad(`${k} phải là số hữu hạn`);
      } else if (type === 'date') {
        if (typeof v !== 'string' || !isValidDate(v)) throw bad(`${k} phải là ngày hợp lệ`);
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      const v = col[k];
      if (v !== undefined && !(Number.isInteger(v) && v >= 0)) throw bad(`${k} phải là số nguyên >= 0`);
    }
    return { col, type, re, seen: new Set() };
  });
}

export function validateCsv(text, schema, options = {}) {
  const defs = prepareSchema(schema);
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
  const idx = defs.map((d) => header.indexOf(d.col.name));
  defs.forEach((d, k) => {
    if (idx[k] === -1) errors.push({ row: 1, column: d.col.name, code: 'MISSING_COLUMN' });
  });

  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    const row = r + 1;
    if (rec.length !== header.length) {
      errors.push({ row, column: null, code: 'ROW_LENGTH' });
      continue;
    }
    defs.forEach((d, k) => {
      if (idx[k] === -1) return;
      const { col, type, re, seen } = d;
      const v = rec[idx[k]];
      const add = (code) => errors.push({ row, column: col.name, code });
      if (v === '') {
        if (col.required) add('REQUIRED');
        return;
      }
      if (!checkType(type, v)) { add('TYPE'); return; }
      if (col.enum !== undefined && !col.enum.includes(v)) add('ENUM');
      if (re && !re.test(v)) add('PATTERN');
      const len = (col.minLength !== undefined || col.maxLength !== undefined) ? Array.from(v).length : 0;
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
      if (col.unique) {
        if (seen.has(v)) add('UNIQUE');
        else seen.add(v);
      }
    });
  }
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
