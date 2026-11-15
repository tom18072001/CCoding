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
  const delim = opts.delimiter === undefined ? ',' : opts.delimiter;
  if (typeof delim !== 'string' || Array.from(delim).length !== 1 || delim.length !== 1
    || delim === '"' || delim === '\r' || delim === '\n') {
    throw fail('CSV_INVALID_INPUT', 'delimiter không hợp lệ');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const n = text.length;
  const records = [];
  let pos = 0;

  const isEol = (c) => c === '\r' || c === '\n';
  const eatEol = () => {
    if (text[pos] === '\r' && text[pos + 1] === '\n') pos += 2;
    else pos += 1;
  };

  while (pos < n) {
    if (isEol(text[pos])) { eatEol(); continue; } // dòng trống
    const row = records.length + 1;
    const fields = [];
    for (;;) {
      let value = '';
      if (text[pos] === '"') {
        pos++;
        for (;;) {
          if (pos >= n) throw fail('CSV_UNTERMINATED_QUOTE', 'nháy không đóng', row);
          const c = text[pos];
          if (c === '"') {
            if (text[pos + 1] === '"') { value += '"'; pos += 2; continue; }
            pos++;
            break;
          }
          value += c;
          pos++;
        }
        if (pos < n && text[pos] !== delim && !isEol(text[pos])) {
          throw fail('CSV_BAD_QUOTE', 'ký tự lạ sau nháy đóng', row);
        }
      } else {
        const start = pos;
        while (pos < n && text[pos] !== delim && !isEol(text[pos])) {
          if (text[pos] === '"') throw fail('CSV_BAD_QUOTE', 'nháy giữa ô không nháy', row);
          pos++;
        }
        value = text.slice(start, pos);
      }
      fields.push(value);
      if (pos >= n) break;
      if (text[pos] === delim) { pos++; continue; }
      eatEol();
      break;
    }
    records.push(fields);
  }
  return records;
}

const TYPES = ['string', 'int', 'number', 'bool', 'date'];

function isValidDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3]);
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
    case 'date': return isValidDate(v);
    default: return true;
  }
}

function badSchema(msg) {
  return fail('CSV_INVALID_SCHEMA', msg);
}

function prepareSchema(schema) {
  if (schema === null || typeof schema !== 'object' || !Array.isArray(schema.columns)
    || schema.columns.length === 0) throw badSchema('columns phải là mảng không rỗng');
  const names = new Set();
  return schema.columns.map((col) => {
    if (col === null || typeof col !== 'object' || Array.isArray(col)) throw badSchema('cột không phải object');
    if (typeof col.name !== 'string' || col.name === '' || names.has(col.name)) throw badSchema('name thiếu/trùng');
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
      const x = col[k];
      if (x === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof x !== 'number' || !Number.isFinite(x)) throw badSchema(`${k} phải là số hữu hạn`);
      } else if (type === 'date') {
        if (typeof x !== 'string' || !isValidDate(x)) throw badSchema(`${k} phải là ngày hợp lệ`);
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      const x = col[k];
      if (x !== undefined && !(Number.isInteger(x) && x >= 0)) throw badSchema(`${k} không hợp lệ`);
    }
    return { col, type, re, seen: col.unique ? new Set() : null };
  });
}

export function validateCsv(text, schema, options = {}) {
  const cols = prepareSchema(schema);

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
  const idx = cols.map((c) => header.indexOf(c.col.name));
  cols.forEach((c, i) => {
    if (idx[i] === -1) errors.push({ row: 1, column: c.col.name, code: 'MISSING_COLUMN' });
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
      const { col, type } = c;
      const v = rec[idx[i]];
      const err = (code) => errors.push({ row, column: col.name, code });
      if (v === '') {
        if (col.required) err('REQUIRED');
        return;
      }
      if (!checkType(type, v)) { err('TYPE'); return; }
      if (col.enum !== undefined && !col.enum.includes(v)) err('ENUM');
      if (c.re && !c.re.test(v)) err('PATTERN');
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
      if (c.seen) {
        if (c.seen.has(v)) err('UNIQUE');
        else c.seen.add(v);
      }
    });
  }

  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
