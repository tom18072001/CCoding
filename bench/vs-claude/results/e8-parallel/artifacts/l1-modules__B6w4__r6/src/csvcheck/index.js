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
  const delim = opts.delimiter === undefined ? ',' : opts.delimiter;
  if (typeof delim !== 'string' || delim.length !== 1 || delim === '"' || delim === '\r' || delim === '\n') {
    throw fail('CSV_INVALID_INPUT', 'delimiter không hợp lệ');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const records = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    const row = records.length + 1;
    const c0 = text[i];
    if (c0 === '\r' || c0 === '\n') { // dòng trống
      i += c0 === '\r' && text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    const fields = [];
    for (;;) {
      let field = '';
      if (text[i] === '"') {
        i++;
        for (;;) {
          if (i >= n) throw fail('CSV_UNTERMINATED_QUOTE', 'nháy chưa đóng', row);
          const c = text[i];
          if (c === '"') {
            if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
            i++;
            break;
          }
          field += c;
          i++;
        }
        if (i < n) {
          const c = text[i];
          if (c !== delim && c !== '\r' && c !== '\n') throw fail('CSV_BAD_QUOTE', 'ký tự thừa sau nháy đóng', row);
        }
      } else {
        while (i < n) {
          const c = text[i];
          if (c === delim || c === '\r' || c === '\n') break;
          if (c === '"') throw fail('CSV_BAD_QUOTE', 'nháy giữa ô không nháy', row);
          field += c;
          i++;
        }
      }
      fields.push(field);
      if (i >= n) break;
      const c = text[i];
      if (c === delim) { i++; continue; }
      i += c === '\r' && text[i + 1] === '\n' ? 2 : 1;
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
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y === 0 || mo < 1 || mo > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return d <= dim;
}

function checkSchema(schema) {
  const bad = (m) => fail('CSV_INVALID_SCHEMA', m);
  if (!schema || typeof schema !== 'object' || !Array.isArray(schema.columns) || schema.columns.length === 0) {
    throw bad('columns phải là mảng không rỗng');
  }
  const seen = new Set();
  return schema.columns.map((c) => {
    if (!c || typeof c !== 'object' || Array.isArray(c)) throw bad('cột phải là object');
    if (typeof c.name !== 'string' || c.name === '' || seen.has(c.name)) throw bad('name thiếu hoặc trùng');
    seen.add(c.name);
    const type = c.type === undefined ? 'string' : c.type;
    if (!TYPES.includes(type)) throw bad('type lạ');
    let re = null;
    if (c.pattern !== undefined) {
      if (typeof c.pattern !== 'string') throw bad('pattern không hợp lệ');
      try { re = new RegExp(c.pattern); } catch { throw bad('pattern không biên dịch được'); }
    }
    if (c.enum !== undefined &&
        (!Array.isArray(c.enum) || c.enum.length === 0 || c.enum.some((x) => typeof x !== 'string'))) {
      throw bad('enum không hợp lệ');
    }
    for (const k of ['min', 'max']) {
      const v = c[k];
      if (v === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof v !== 'number' || !Number.isFinite(v)) throw bad(k + ' phải là số hữu hạn');
      } else if (type === 'date') {
        if (typeof v !== 'string' || !isDate(v)) throw bad(k + ' phải là ngày hợp lệ');
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      if (c[k] !== undefined && !(Number.isInteger(c[k]) && c[k] >= 0)) throw bad(k + ' không hợp lệ');
    }
    return { ...c, type, re };
  });
}

function typeOk(type, v) {
  switch (type) {
    case 'int': return /^[+-]?\d+$/.test(v) && Number.isSafeInteger(Number(v));
    case 'number': return /^[+-]?\d+(\.\d+)?$/.test(v) && Number.isFinite(Number(v));
    case 'bool': { const l = v.toLowerCase(); return l === 'true' || l === 'false'; }
    case 'date': return isDate(v);
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
      return { ok: false, rowCount: 0, errors: [{ row: e.row, column: null, code: e.code.slice(4) }] };
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
    if (idx[k] < 0) errors.push({ row: 1, column: c.name, code: 'MISSING_COLUMN' });
  });
  const uniq = cols.map(() => new Set());
  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    const row = r + 1;
    if (rec.length !== header.length) {
      errors.push({ row, column: null, code: 'ROW_LENGTH' });
      continue;
    }
    cols.forEach((c, k) => {
      if (idx[k] < 0) return;
      const v = rec[idx[k]];
      const err = (code) => errors.push({ row, column: c.name, code });
      if (v === '') { if (c.required) err('REQUIRED'); return; }
      if (!typeOk(c.type, v)) { err('TYPE'); return; }
      if (c.enum !== undefined && !c.enum.includes(v)) err('ENUM');
      if (c.re && !c.re.test(v)) err('PATTERN');
      const len = Array.from(v).length;
      if (c.minLength !== undefined && len < c.minLength) err('MIN_LENGTH');
      if (c.maxLength !== undefined && len > c.maxLength) err('MAX_LENGTH');
      if (c.type === 'int' || c.type === 'number') {
        const x = Number(v);
        if (c.min !== undefined && x < c.min) err('MIN');
        if (c.max !== undefined && x > c.max) err('MAX');
      } else if (c.type === 'date') {
        if (c.min !== undefined && v < c.min) err('MIN');
        if (c.max !== undefined && v > c.max) err('MAX');
      }
      if (c.unique) {
        if (uniq[k].has(v)) err('UNIQUE'); else uniq[k].add(v);
      }
    });
  }
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
