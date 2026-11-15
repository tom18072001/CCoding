// Module csvcheck — xem mục "csvcheck" trong SPEC.md.

function fail(code, message, row) {
  const e = new Error(message);
  e.code = code;
  if (row !== undefined) e.row = row;
  return e;
}

function getDelimiter(options) {
  if (options === undefined || options === null) return ',';
  if (typeof options !== 'object') throw fail('CSV_INVALID_INPUT', 'options không hợp lệ');
  const d = options.delimiter;
  if (d === undefined) return ',';
  if (typeof d !== 'string' || d.length !== 1 || d === '"' || d === '\r' || d === '\n') {
    throw fail('CSV_INVALID_INPUT', 'delimiter không hợp lệ');
  }
  return d;
}

export function parseCsv(text, options = {}) {
  if (typeof text !== 'string') throw fail('CSV_INVALID_INPUT', 'text phải là chuỗi');
  const delim = getDelimiter(options);
  let i = text[0] === '﻿' ? 1 : 0;
  const n = text.length;
  const records = [];

  const readField = () => {
    const row = records.length + 1;
    if (text[i] === '"') {
      i++;
      let buf = '';
      for (;;) {
        if (i >= n) throw fail('CSV_UNTERMINATED_QUOTE', 'nháy không đóng', row);
        const c = text[i];
        if (c === '"') {
          if (text[i + 1] === '"') { buf += '"'; i += 2; continue; }
          i++;
          break;
        }
        buf += c;
        i++;
      }
      if (i < n && text[i] !== delim && text[i] !== '\r' && text[i] !== '\n') {
        throw fail('CSV_BAD_QUOTE', 'ký tự sau nháy đóng', row);
      }
      return buf;
    }
    const start = i;
    while (i < n && text[i] !== delim && text[i] !== '\r' && text[i] !== '\n') {
      if (text[i] === '"') throw fail('CSV_BAD_QUOTE', 'nháy giữa ô không nháy', row);
      i++;
    }
    return text.slice(start, i);
  };

  while (i < n) {
    if (text[i] === '\r') { i += text[i + 1] === '\n' ? 2 : 1; continue; }
    if (text[i] === '\n') { i++; continue; }
    const fields = [];
    for (;;) {
      fields.push(readField());
      if (i >= n) break;
      if (text[i] === delim) { i++; continue; }
      i += text[i] === '\r' && text[i + 1] === '\n' ? 2 : 1;
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
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1 || mo < 1 || mo > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return d <= dim;
}

function isLen(v) {
  return Number.isInteger(v) && v >= 0;
}

function checkSchema(schema) {
  const bad = (m) => fail('CSV_INVALID_SCHEMA', m);
  if (schema === null || typeof schema !== 'object' || !Array.isArray(schema.columns) || schema.columns.length === 0) {
    throw bad('columns phải là mảng không rỗng');
  }
  const names = new Set();
  const cols = [];
  for (const c of schema.columns) {
    if (c === null || typeof c !== 'object' || Array.isArray(c)) throw bad('cột không phải object');
    if (typeof c.name !== 'string' || names.has(c.name)) throw bad('name thiếu hoặc trùng');
    names.add(c.name);
    const type = c.type === undefined ? 'string' : c.type;
    if (!TYPES.includes(type)) throw bad('type lạ');
    let re = null;
    if (c.pattern !== undefined) {
      if (typeof c.pattern !== 'string') throw bad('pattern phải là chuỗi');
      try { re = new RegExp(c.pattern); } catch { throw bad('pattern không biên dịch được'); }
    }
    if (c.enum !== undefined) {
      if (!Array.isArray(c.enum) || c.enum.length === 0 || c.enum.some((v) => typeof v !== 'string')) {
        throw bad('enum không hợp lệ');
      }
    }
    for (const k of ['min', 'max']) {
      const v = c[k];
      if (v === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof v !== 'number' || !Number.isFinite(v)) throw bad(`${k} phải là số hữu hạn`);
      } else if (type === 'date') {
        if (typeof v !== 'string' || !isValidDate(v)) throw bad(`${k} phải là ngày hợp lệ`);
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      if (c[k] !== undefined && !isLen(c[k])) throw bad(`${k} phải là số nguyên >= 0`);
    }
    cols.push({ def: c, type, re });
  }
  return cols;
}

function typeOk(type, s) {
  switch (type) {
    case 'int': return /^[+-]?\d+$/.test(s) && Number.isSafeInteger(Number(s));
    case 'number': return /^[+-]?\d+(\.\d+)?$/.test(s) && Number.isFinite(Number(s));
    case 'bool': return /^(true|false)$/i.test(s);
    case 'date': return isValidDate(s);
    default: return true;
  }
}

export function validateCsv(text, schema, options = {}) {
  const cols = checkSchema(schema);
  if (typeof text !== 'string') throw fail('CSV_INVALID_INPUT', 'text phải là chuỗi');
  getDelimiter(options);
  let records;
  try {
    records = parseCsv(text, options);
  } catch (e) {
    if (e.code === 'CSV_UNTERMINATED_QUOTE' || e.code === 'CSV_BAD_QUOTE') {
      return { ok: false, rowCount: 0, errors: [{ row: e.row, column: null, code: e.code.slice(4) }] };
    }
    throw e;
  }
  const errors = [];
  if (records.length === 0) {
    return { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] };
  }
  const header = records[0];
  const idx = cols.map((c) => header.indexOf(c.def.name));
  cols.forEach((c, k) => {
    if (idx[k] === -1) errors.push({ row: 1, column: c.def.name, code: 'MISSING_COLUMN' });
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
      const d = c.def;
      const cell = rec[idx[k]];
      const err = (code) => errors.push({ row, column: d.name, code });
      if (cell === '') {
        if (d.required === true) err('REQUIRED');
        return;
      }
      if (!typeOk(c.type, cell)) { err('TYPE'); return; }
      if (d.enum !== undefined && !d.enum.includes(cell)) err('ENUM');
      if (c.re && !c.re.test(cell)) err('PATTERN');
      const len = Array.from(cell).length;
      if (d.minLength !== undefined && len < d.minLength) err('MIN_LENGTH');
      if (d.maxLength !== undefined && len > d.maxLength) err('MAX_LENGTH');
      if (c.type === 'int' || c.type === 'number') {
        const v = Number(cell);
        if (d.min !== undefined && v < d.min) err('MIN');
        if (d.max !== undefined && v > d.max) err('MAX');
      } else if (c.type === 'date') {
        if (d.min !== undefined && cell < d.min) err('MIN');
        if (d.max !== undefined && cell > d.max) err('MAX');
      }
      if (d.unique === true) {
        if (seen[k].has(cell)) err('UNIQUE');
        else seen[k].add(cell);
      }
    });
  }
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
