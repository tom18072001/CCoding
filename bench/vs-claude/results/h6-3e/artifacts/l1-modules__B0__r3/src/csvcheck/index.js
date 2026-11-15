// Module csvcheck — phân tích CSV (RFC 4180) và kiểm theo lược đồ. Xem SPEC.md.

function fail(code, message, row) {
  const err = new Error(message);
  err.code = code;
  if (row !== undefined) err.row = row;
  return err;
}

export function parseCsv(text, options = {}) {
  if (typeof text !== 'string') throw fail('CSV_INVALID_INPUT', 'text phải là chuỗi');
  const opts = options == null ? {} : options;
  if (typeof opts !== 'object') throw fail('CSV_INVALID_INPUT', 'options không hợp lệ');
  const delimiter = opts.delimiter === undefined ? ',' : opts.delimiter;
  if (typeof delimiter !== 'string' || delimiter.length !== 1 ||
      delimiter === '"' || delimiter === '\r' || delimiter === '\n') {
    throw fail('CSV_INVALID_INPUT', 'delimiter không hợp lệ');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const records = [];
  let record = [];
  let field = '';
  let atLineStart = true; // chưa có ký tự nào trong bản ghi hiện tại
  const n = text.length;
  let i = 0;
  const row = () => records.length + 1;

  const endRecord = () => {
    record.push(field);
    records.push(record);
    record = [];
    field = '';
    atLineStart = true;
  };
  const eolLen = (k) => (text[k] === '\r' && text[k + 1] === '\n' ? 2 : 1);

  while (i < n) {
    const c = text[i];
    if (c === '\r' || c === '\n') {
      if (!atLineStart) endRecord(); // dòng trống thì bỏ qua
      i += eolLen(i);
      continue;
    }
    atLineStart = false;
    if (c === '"') {
      const startRow = row();
      i++;
      let closed = false;
      while (i < n) {
        if (text[i] === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          i++; closed = true; break;
        }
        field += text[i++];
      }
      if (!closed) throw fail('CSV_UNTERMINATED_QUOTE', 'nháy không đóng', startRow);
      if (i < n && text[i] !== delimiter && text[i] !== '\r' && text[i] !== '\n') {
        throw fail('CSV_BAD_QUOTE', 'ký tự lạ sau nháy đóng', row());
      }
    } else {
      while (i < n && text[i] !== delimiter && text[i] !== '\r' && text[i] !== '\n') {
        if (text[i] === '"') throw fail('CSV_BAD_QUOTE', 'nháy giữa ô không nháy', row());
        field += text[i++];
      }
    }
    if (i < n && text[i] === delimiter) {
      // ô kết thúc bằng dấu phân cách: sinh thêm ô kế tiếp (có thể rỗng)
      record.push(field);
      field = '';
      i++;
      if (i >= n) endRecord();
      else if (text[i] === '\r' || text[i] === '\n') { endRecord(); i += eolLen(i); }
      else atLineStart = false;
    }
  }
  if (!atLineStart) endRecord();
  return records;
}

const TYPES = ['string', 'int', 'number', 'bool', 'date'];

function isRealDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (y < 1 || mo < 1 || mo > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return d <= dim;
}

function checkType(type, s) {
  switch (type) {
    case 'string': return true;
    case 'int': return /^[+-]?\d+$/.test(s) && Number.isSafeInteger(Number(s));
    case 'number': return /^[+-]?\d+(\.\d+)?$/.test(s) && Number.isFinite(Number(s));
    case 'bool': return /^(true|false)$/i.test(s);
    case 'date': return isRealDate(s);
    default: return false;
  }
}

function badSchema(msg) { return fail('CSV_INVALID_SCHEMA', msg); }

function compileSchema(schema) {
  if (schema === null || typeof schema !== 'object' || !Array.isArray(schema.columns) ||
      schema.columns.length === 0) throw badSchema('columns phải là mảng không rỗng');
  const names = new Set();
  return schema.columns.map((col) => {
    if (col === null || typeof col !== 'object' || Array.isArray(col)) throw badSchema('cột phải là object');
    if (typeof col.name !== 'string' || col.name === '' || names.has(col.name)) throw badSchema('name thiếu hoặc trùng');
    names.add(col.name);
    const type = col.type === undefined ? 'string' : col.type;
    if (!TYPES.includes(type)) throw badSchema('type lạ');
    let re = null;
    if (col.pattern !== undefined) {
      if (typeof col.pattern !== 'string') throw badSchema('pattern phải là chuỗi');
      try { re = new RegExp(col.pattern); } catch { throw badSchema('pattern không biên dịch được'); }
    }
    if (col.enum !== undefined &&
        (!Array.isArray(col.enum) || col.enum.length === 0 || !col.enum.every((e) => typeof e === 'string'))) {
      throw badSchema('enum không hợp lệ');
    }
    for (const k of ['min', 'max']) {
      const v = col[k];
      if (v === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof v !== 'number' || !Number.isFinite(v)) throw badSchema(`${k} phải là số hữu hạn`);
      } else if (type === 'date') {
        if (typeof v !== 'string' || !isRealDate(v)) throw badSchema(`${k} phải là ngày hợp lệ`);
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      const v = col[k];
      if (v !== undefined && (!Number.isInteger(v) || v < 0)) throw badSchema(`${k} không hợp lệ`);
    }
    return { col, type, re, seen: new Set() };
  });
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
  const idx = cols.map((c) => header.indexOf(c.col.name));
  cols.forEach((c, k) => {
    if (idx[k] === -1) errors.push({ row: 1, column: c.col.name, code: 'MISSING_COLUMN' });
  });

  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    const rowNo = r + 1;
    if (rec.length !== header.length) {
      errors.push({ row: rowNo, column: null, code: 'ROW_LENGTH' });
      continue;
    }
    cols.forEach((c, k) => {
      if (idx[k] === -1) return;
      const { col, type, re, seen } = c;
      const name = col.name;
      const s = rec[idx[k]];
      const err = (code) => errors.push({ row: rowNo, column: name, code });
      if (s === '') { if (col.required === true) err('REQUIRED'); return; }
      if (!checkType(type, s)) { err('TYPE'); return; }
      if (col.enum !== undefined && !col.enum.includes(s)) err('ENUM');
      if (re && !re.test(s)) err('PATTERN');
      if (col.minLength !== undefined || col.maxLength !== undefined) {
        const len = Array.from(s).length;
        if (col.minLength !== undefined && len < col.minLength) err('MIN_LENGTH');
        if (col.maxLength !== undefined && len > col.maxLength) err('MAX_LENGTH');
      }
      if (type === 'int' || type === 'number') {
        const v = Number(s);
        if (col.min !== undefined && v < col.min) err('MIN');
        if (col.max !== undefined && v > col.max) err('MAX');
      } else if (type === 'date') {
        if (col.min !== undefined && s < col.min) err('MIN');
        if (col.max !== undefined && s > col.max) err('MAX');
      }
      if (col.unique === true) {
        if (seen.has(s)) err('UNIQUE'); else seen.add(s);
      }
    });
  }
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
