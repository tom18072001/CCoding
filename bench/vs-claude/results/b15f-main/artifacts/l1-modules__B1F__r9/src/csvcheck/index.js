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
  const delimiter = opts.delimiter === undefined ? ',' : opts.delimiter;
  if (typeof delimiter !== 'string' || delimiter.length !== 1 ||
      delimiter === '"' || delimiter === '\r' || delimiter === '\n') {
    throw fail('CSV_INVALID_INPUT', 'delimiter phải là đúng một ký tự hợp lệ');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const records = [];
  let record = [];
  let field = '';
  let atLineStart = true; // chưa có ký tự nào trong dòng hiện tại
  let i = 0;
  const n = text.length;
  const row = () => records.length + 1;

  const endRecord = () => {
    record.push(field);
    records.push(record);
    record = [];
    field = '';
    atLineStart = true;
  };

  while (i < n) {
    const c = text[i];
    if (atLineStart && (c === '\n' || c === '\r')) {
      // dòng trống: bỏ qua
      i += (c === '\r' && text[i + 1] === '\n') ? 2 : 1;
      continue;
    }
    atLineStart = false;
    if (c === '"' && field === '') {
      // ô có nháy
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
      if (!closed) throw fail('CSV_UNTERMINATED_QUOTE', 'nháy không đóng', row());
      if (i < n) {
        const d = text[i];
        if (d !== delimiter && d !== '\n' && d !== '\r') {
          throw fail('CSV_BAD_QUOTE', 'ký tự lạ sau nháy đóng', row());
        }
      }
      continue;
    }
    if (c === '"') throw fail('CSV_BAD_QUOTE', 'nháy giữa ô không nháy', row());
    if (c === delimiter) {
      record.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\n' || c === '\r') {
      endRecord();
      i += (c === '\r' && text[i + 1] === '\n') ? 2 : 1;
      continue;
    }
    field += c;
    i++;
  }
  if (!atLineStart) endRecord();
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

function checkSchema(schema) {
  const bad = (m) => fail('CSV_INVALID_SCHEMA', m);
  if (schema == null || typeof schema !== 'object' || !Array.isArray(schema.columns) ||
      schema.columns.length === 0) throw bad('columns phải là mảng không rỗng');
  const names = new Set();
  const cols = [];
  for (const col of schema.columns) {
    if (col == null || typeof col !== 'object' || Array.isArray(col)) throw bad('cột phải là object');
    if (typeof col.name !== 'string') throw bad('name thiếu hoặc không phải chuỗi');
    if (names.has(col.name)) throw bad('name trùng');
    names.add(col.name);
    const type = col.type === undefined ? 'string' : col.type;
    if (!TYPES.includes(type)) throw bad('type lạ');
    if (col.pattern !== undefined) {
      if (typeof col.pattern !== 'string') throw bad('pattern phải là chuỗi');
      try { new RegExp(col.pattern); } catch { throw bad('pattern không biên dịch được'); }
    }
    if (col.enum !== undefined &&
        (!Array.isArray(col.enum) || col.enum.length === 0 ||
         !col.enum.every((v) => typeof v === 'string'))) throw bad('enum không hợp lệ');
    for (const k of ['min', 'max']) {
      if (col[k] === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof col[k] !== 'number' || !Number.isFinite(col[k])) throw bad(`${k} phải là số hữu hạn`);
      } else if (type === 'date') {
        if (typeof col[k] !== 'string' || !isValidDate(col[k])) throw bad(`${k} phải là ngày hợp lệ`);
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      if (col[k] !== undefined && !(Number.isInteger(col[k]) && col[k] >= 0)) {
        throw bad(`${k} phải là số nguyên >= 0`);
      }
    }
    cols.push({ ...col, type, regex: col.pattern !== undefined ? new RegExp(col.pattern) : null });
  }
  return cols;
}

function typeOk(type, v) {
  switch (type) {
    case 'int': return /^[+-]?\d+$/.test(v) && Number.isSafeInteger(Number(v));
    case 'number': return /^[+-]?\d+(\.\d+)?$/.test(v) && Number.isFinite(Number(v));
    case 'bool': return /^(true|false)$/i.test(v);
    case 'date': return isValidDate(v);
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
  const idx = cols.map((c) => header.indexOf(c.name));
  cols.forEach((c, k) => {
    if (idx[k] === -1) errors.push({ row: 1, column: c.name, code: 'MISSING_COLUMN' });
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
      const v = rec[idx[k]];
      const err = (code) => errors.push({ row, column: c.name, code });
      if (v === '') {
        if (c.required) err('REQUIRED');
        return;
      }
      if (!typeOk(c.type, v)) { err('TYPE'); return; }
      if (c.enum !== undefined && !c.enum.includes(v)) err('ENUM');
      if (c.regex && !c.regex.test(v)) err('PATTERN');
      const len = Array.from(v).length;
      if (c.minLength !== undefined && len < c.minLength) err('MIN_LENGTH');
      if (c.maxLength !== undefined && len > c.maxLength) err('MAX_LENGTH');
      if (c.type === 'int' || c.type === 'number') {
        const num = Number(v);
        if (c.min !== undefined && num < c.min) err('MIN');
        if (c.max !== undefined && num > c.max) err('MAX');
      } else if (c.type === 'date') {
        if (c.min !== undefined && v < c.min) err('MIN');
        if (c.max !== undefined && v > c.max) err('MAX');
      }
      if (c.unique) {
        if (seen[k].has(v)) err('UNIQUE');
        else seen[k].add(v);
      }
    });
  }
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
