// Module csvcheck — phân tích CSV (RFC 4180) và kiểm theo lược đồ. Xem SPEC.md.

function fail(code, message, row) {
  const e = new Error(message);
  e.code = code;
  if (row !== undefined) e.row = row;
  return e;
}

export function parseCsv(text, options = {}) {
  if (typeof text !== 'string') throw fail('CSV_INVALID_INPUT', 'text phải là chuỗi');
  if (options === null || typeof options !== 'object') {
    throw fail('CSV_INVALID_INPUT', 'options không hợp lệ');
  }
  const delimiter = options.delimiter === undefined ? ',' : options.delimiter;
  if (typeof delimiter !== 'string' || delimiter.length !== 1 ||
      delimiter === '"' || delimiter === '\r' || delimiter === '\n') {
    throw fail('CSV_INVALID_INPUT', 'delimiter không hợp lệ');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const records = [];
  let record = [];
  let field = '';
  let started = false; // bản ghi hiện tại đã có ký tự nào chưa
  const n = text.length;
  let i = 0;

  const endRecord = () => {
    if (started) {
      record.push(field);
      records.push(record);
    }
    record = [];
    field = '';
    started = false;
  };

  while (i < n) {
    const c = text[i];
    if (c === '\r' || c === '\n') {
      endRecord();
      i += (c === '\r' && text[i + 1] === '\n') ? 2 : 1;
      continue;
    }
    started = true;
    if (c === delimiter) {
      record.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '"' && field === '') {
      i++;
      let closed = false;
      while (i < n) {
        if (text[i] === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          closed = true;
          i++;
          break;
        }
        field += text[i++];
      }
      if (!closed) throw fail('CSV_UNTERMINATED_QUOTE', 'nháy không đóng', records.length + 1);
      if (i < n && text[i] !== delimiter && text[i] !== '\r' && text[i] !== '\n') {
        throw fail('CSV_BAD_QUOTE', 'ký tự sau nháy đóng', records.length + 1);
      }
      continue;
    }
    if (c === '"') throw fail('CSV_BAD_QUOTE', 'nháy giữa ô không nháy', records.length + 1);
    field += c;
    i++;
  }
  endRecord();
  return records;
}

const TYPES = ['string', 'int', 'number', 'bool', 'date'];

function isRealDate(s) {
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

function checkType(type, v) {
  switch (type) {
    case 'int': return /^[+-]?\d+$/.test(v) && Number.isSafeInteger(Number(v));
    case 'number': return /^[+-]?\d+(\.\d+)?$/.test(v) && Number.isFinite(Number(v));
    case 'bool': return /^(true|false)$/i.test(v);
    case 'date': return isRealDate(v);
    default: return true;
  }
}

function badSchema(msg) {
  return fail('CSV_INVALID_SCHEMA', msg);
}

function normalizeSchema(schema) {
  if (schema === null || typeof schema !== 'object' || !Array.isArray(schema.columns) ||
      schema.columns.length === 0) {
    throw badSchema('columns phải là mảng không rỗng');
  }
  const names = new Set();
  return schema.columns.map((col) => {
    if (col === null || typeof col !== 'object' || Array.isArray(col)) throw badSchema('cột phải là object');
    if (typeof col.name !== 'string' || col.name === '' || names.has(col.name)) {
      throw badSchema('name thiếu hoặc trùng');
    }
    names.add(col.name);
    const type = col.type === undefined ? 'string' : col.type;
    if (!TYPES.includes(type)) throw badSchema('type lạ');
    let re = null;
    if (col.pattern !== undefined) {
      if (typeof col.pattern !== 'string') throw badSchema('pattern phải là chuỗi');
      try { re = new RegExp(col.pattern); } catch { throw badSchema('pattern không biên dịch được'); }
    }
    if (col.enum !== undefined &&
        (!Array.isArray(col.enum) || col.enum.length === 0 || col.enum.some((x) => typeof x !== 'string'))) {
      throw badSchema('enum không hợp lệ');
    }
    for (const k of ['min', 'max']) {
      const b = col[k];
      if (b === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof b !== 'number' || !Number.isFinite(b)) throw badSchema(`${k} phải là số hữu hạn`);
      } else if (type === 'date') {
        if (typeof b !== 'string' || !isRealDate(b)) throw badSchema(`${k} phải là chuỗi ngày hợp lệ`);
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      const b = col[k];
      if (b !== undefined && (!Number.isInteger(b) || b < 0)) throw badSchema(`${k} không hợp lệ`);
    }
    return { col, type, re };
  });
}

export function validateCsv(text, schema, options = {}) {
  const cols = normalizeSchema(schema);
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
      if (!checkType(type, v)) { add('TYPE'); return; }
      if (col.enum !== undefined && !col.enum.includes(v)) add('ENUM');
      if (re && !re.test(v)) add('PATTERN');
      const len = Array.from(v).length;
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
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
