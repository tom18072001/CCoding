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
    throw fail('CSV_INVALID_INPUT', 'delimiter phải là đúng một ký tự hợp lệ');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const n = text.length;
  const records = [];
  let pos = 0;
  while (pos < n) {
    const c = text[pos];
    if (c === '\r' || c === '\n') { // dòng trống
      pos += c === '\r' && text[pos + 1] === '\n' ? 2 : 1;
      continue;
    }
    const row = records.length + 1;
    const fields = [];
    for (;;) {
      if (text[pos] === '"') {
        pos++;
        let val = '';
        for (;;) {
          if (pos >= n) throw fail('CSV_UNTERMINATED_QUOTE', 'nháy không đóng', row);
          const ch = text[pos];
          if (ch === '"') {
            if (text[pos + 1] === '"') { val += '"'; pos += 2; continue; }
            pos++;
            break;
          }
          val += ch;
          pos++;
        }
        fields.push(val);
        if (pos >= n) break;
        const nx = text[pos];
        if (nx === delim) { pos++; continue; }
        if (nx === '\r' || nx === '\n') {
          pos += nx === '\r' && text[pos + 1] === '\n' ? 2 : 1;
          break;
        }
        throw fail('CSV_BAD_QUOTE', 'ký tự thừa sau nháy đóng', row);
      } else {
        const start = pos;
        while (pos < n && text[pos] !== delim && text[pos] !== '\r' && text[pos] !== '\n') {
          if (text[pos] === '"') throw fail('CSV_BAD_QUOTE', 'nháy giữa ô không nháy', row);
          pos++;
        }
        fields.push(text.slice(start, pos));
        if (pos >= n) break;
        const nx = text[pos];
        if (nx === delim) { pos++; continue; }
        pos += nx === '\r' && text[pos + 1] === '\n' ? 2 : 1;
        break;
      }
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
  if (y < 1 || mo < 1 || mo > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return d <= dim;
}

function checkType(type, s) {
  switch (type) {
    case 'int': return /^[+-]?\d+$/.test(s) && Number.isSafeInteger(Number(s));
    case 'number': return /^[+-]?\d+(\.\d+)?$/.test(s) && Number.isFinite(Number(s));
    case 'bool': return /^(true|false)$/i.test(s);
    case 'date': return isDate(s);
    default: return true;
  }
}

function compileSchema(schema) {
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
        (!Array.isArray(col.enum) || col.enum.length === 0 || col.enum.some((v) => typeof v !== 'string'))) {
      throw bad('enum không hợp lệ');
    }
    for (const k of ['min', 'max']) {
      const v = col[k];
      if (v === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof v !== 'number' || !Number.isFinite(v)) throw bad(`${k} phải là số hữu hạn`);
      } else if (type === 'date') {
        if (typeof v !== 'string' || !isDate(v)) throw bad(`${k} phải là ngày hợp lệ`);
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      const v = col[k];
      if (v !== undefined && !(Number.isInteger(v) && v >= 0)) throw bad(`${k} phải là số nguyên >= 0`);
    }
    return { name: col.name, type, required: col.required === true, re, col, seen: new Set() };
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
  const idx = cols.map((c) => header.indexOf(c.name));
  cols.forEach((c, i) => {
    if (idx[i] === -1) errors.push({ row: 1, column: c.name, code: 'MISSING_COLUMN' });
  });
  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    const row = r + 1;
    if (rec.length !== header.length) {
      errors.push({ row, column: null, code: 'ROW_LENGTH' });
      continue;
    }
    cols.forEach((c, i) => {
      if (idx[i] === -1) return;
      const v = rec[idx[i]];
      const err = (code) => errors.push({ row, column: c.name, code });
      const k = c.col;
      if (v === '') { if (c.required) err('REQUIRED'); return; }
      if (!checkType(c.type, v)) { err('TYPE'); return; }
      if (k.enum !== undefined && !k.enum.includes(v)) err('ENUM');
      if (c.re && !c.re.test(v)) err('PATTERN');
      if (k.minLength !== undefined || k.maxLength !== undefined) {
        const len = Array.from(v).length;
        if (k.minLength !== undefined && len < k.minLength) err('MIN_LENGTH');
        if (k.maxLength !== undefined && len > k.maxLength) err('MAX_LENGTH');
      }
      if (c.type === 'int' || c.type === 'number') {
        const num = Number(v);
        if (k.min !== undefined && num < k.min) err('MIN');
        if (k.max !== undefined && num > k.max) err('MAX');
      } else if (c.type === 'date') {
        if (k.min !== undefined && v < k.min) err('MIN');
        if (k.max !== undefined && v > k.max) err('MAX');
      }
      if (k.unique) {
        if (c.seen.has(v)) err('UNIQUE'); else c.seen.add(v);
      }
    });
  }
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
