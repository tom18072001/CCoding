// Module csvcheck — xem mục "csvcheck" trong SPEC.md.

function fail(code, message, row) {
  const e = new Error(message);
  e.code = code;
  if (row !== undefined) e.row = row;
  return e;
}

export function parseCsv(text, options = {}) {
  if (typeof text !== 'string') throw fail('CSV_INVALID_INPUT', 'text phải là chuỗi');
  const opts = options === null || options === undefined ? {} : options;
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
    if (c === '"') {
      const p = i === 0 ? '\n' : text[i - 1];
      const atFieldStart = field === '' && (p === delimiter || p === '\n' || p === '\r');
      const row = records.length + 1;
      if (!atFieldStart) throw fail('CSV_BAD_QUOTE', 'nháy giữa ô không nháy', row);
      started = true;
      i++;
      for (;;) {
        if (i >= n) throw fail('CSV_UNTERMINATED_QUOTE', 'nháy không đóng', row);
        const d = text[i];
        if (d === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          i++;
          break;
        }
        field += d;
        i++;
      }
      if (i < n) {
        const e = text[i];
        if (e !== delimiter && e !== '\r' && e !== '\n') {
          throw fail('CSV_BAD_QUOTE', 'ký tự lạ sau nháy đóng', row);
        }
      }
      continue;
    }
    if (c === delimiter) {
      started = true;
      record.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      i++;
      endRecord();
      continue;
    }
    started = true;
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
    case 'bool': { const l = v.toLowerCase(); return l === 'true' || l === 'false'; }
    case 'date': return isRealDate(v);
    default: return true;
  }
}

function compileSchema(schema) {
  const bad = (m) => fail('CSV_INVALID_SCHEMA', m);
  if (schema === null || typeof schema !== 'object' || !Array.isArray(schema.columns) ||
      schema.columns.length === 0) throw bad('columns phải là mảng không rỗng');
  const names = new Set();
  return schema.columns.map((c) => {
    if (c === null || typeof c !== 'object' || Array.isArray(c)) throw bad('cột phải là object');
    if (typeof c.name !== 'string' || names.has(c.name)) throw bad('name thiếu hoặc trùng');
    names.add(c.name);
    const type = c.type === undefined ? 'string' : c.type;
    if (!TYPES.includes(type)) throw bad('type lạ');
    let re = null;
    if (c.pattern !== undefined) {
      if (typeof c.pattern !== 'string') throw bad('pattern phải là chuỗi');
      try { re = new RegExp(c.pattern); } catch { throw bad('pattern không biên dịch được'); }
    }
    if (c.enum !== undefined &&
        (!Array.isArray(c.enum) || c.enum.length === 0 || c.enum.some((x) => typeof x !== 'string'))) {
      throw bad('enum không hợp lệ');
    }
    for (const k of ['min', 'max']) {
      if (c[k] === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof c[k] !== 'number' || !Number.isFinite(c[k])) throw bad(k + ' phải là số hữu hạn');
      } else if (type === 'date') {
        if (typeof c[k] !== 'string' || !isRealDate(c[k])) throw bad(k + ' phải là ngày hợp lệ');
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      if (c[k] !== undefined && !(Number.isInteger(c[k]) && c[k] >= 0)) throw bad(k + ' không hợp lệ');
    }
    return { ...c, type, re, required: c.required === true, unique: c.unique === true };
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
      const add = (code) => errors.push({ row, column: c.name, code });
      if (v === '') { if (c.required) add('REQUIRED'); return; }
      if (!checkType(c.type, v)) { add('TYPE'); return; }
      if (c.enum !== undefined && !c.enum.includes(v)) add('ENUM');
      if (c.re && !c.re.test(v)) add('PATTERN');
      const len = Array.from(v).length;
      if (c.minLength !== undefined && len < c.minLength) add('MIN_LENGTH');
      if (c.maxLength !== undefined && len > c.maxLength) add('MAX_LENGTH');
      if (c.type === 'int' || c.type === 'number') {
        const num = Number(v);
        if (c.min !== undefined && num < c.min) add('MIN');
        if (c.max !== undefined && num > c.max) add('MAX');
      } else if (c.type === 'date') {
        if (c.min !== undefined && v < c.min) add('MIN');
        if (c.max !== undefined && v > c.max) add('MAX');
      }
      if (c.unique) {
        if (seen[k].has(v)) add('UNIQUE'); else seen[k].add(v);
      }
    });
  }
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
