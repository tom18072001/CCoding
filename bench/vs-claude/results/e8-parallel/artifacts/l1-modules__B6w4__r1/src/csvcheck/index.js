// Module csvcheck — phân tích CSV (RFC 4180) và kiểm theo lược đồ. Xem SPEC.md.

function fail(code, row) {
  const e = new Error(code);
  e.code = code;
  if (row !== undefined) e.row = row;
  return e;
}

export function parseCsv(text, options = {}) {
  if (typeof text !== 'string') throw fail('CSV_INVALID_INPUT');
  let delimiter = ',';
  if (options && options.delimiter !== undefined) delimiter = options.delimiter;
  if (
    typeof delimiter !== 'string' ||
    Array.from(delimiter).length !== 1 ||
    delimiter === '"' || delimiter === '\r' || delimiter === '\n'
  ) {
    throw fail('CSV_INVALID_INPUT');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const chars = Array.from(text);
  const n = chars.length;
  const records = [];
  let fields = [];
  let field = '';
  let started = false; // bản ghi hiện tại đã có ký tự/dấu phân cách
  let i = 0;

  const endRecord = () => {
    fields.push(field);
    records.push(fields);
    fields = [];
    field = '';
    started = false;
  };

  while (i < n) {
    const c = chars[i];
    if (!started && (c === '\r' || c === '\n')) { // dòng trống
      i += (c === '\r' && chars[i + 1] === '\n') ? 2 : 1;
      continue;
    }
    started = true;
    if (c === '"' && field === '') {
      // trường có nháy
      i++;
      let closed = false;
      while (i < n) {
        if (chars[i] === '"') {
          if (chars[i + 1] === '"') { field += '"'; i += 2; continue; }
          closed = true;
          i++;
          break;
        }
        field += chars[i++];
      }
      if (!closed) throw fail('CSV_UNTERMINATED_QUOTE', records.length + 1);
      if (i < n) {
        const d = chars[i];
        if (d !== delimiter && d !== '\r' && d !== '\n') throw fail('CSV_BAD_QUOTE', records.length + 1);
      }
      if (i >= n) { endRecord(); break; }
      if (chars[i] === delimiter) { fields.push(field); field = ''; i++; if (i >= n) { endRecord(); } continue; }
      // xuống dòng
      i += (chars[i] === '\r' && chars[i + 1] === '\n') ? 2 : 1;
      endRecord();
      continue;
    }
    if (c === delimiter) {
      fields.push(field);
      field = '';
      i++;
      if (i >= n) endRecord();
      continue;
    }
    if (c === '\r' || c === '\n') {
      i += (c === '\r' && chars[i + 1] === '\n') ? 2 : 1;
      endRecord();
      continue;
    }
    if (c === '"') throw fail('CSV_BAD_QUOTE', records.length + 1);
    field += c;
    i++;
    if (i >= n) endRecord();
  }
  return records;
}

const TYPES = ['string', 'int', 'number', 'bool', 'date'];

function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (y < 1 || m < 1 || m > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  return d <= dim;
}

function badSchema() {
  return fail('CSV_INVALID_SCHEMA');
}

function checkSchema(schema) {
  if (!schema || typeof schema !== 'object' || !Array.isArray(schema.columns) || schema.columns.length === 0) {
    throw badSchema();
  }
  const names = new Set();
  const cols = [];
  for (const col of schema.columns) {
    if (!col || typeof col !== 'object' || Array.isArray(col)) throw badSchema();
    if (typeof col.name !== 'string' || names.has(col.name)) throw badSchema();
    names.add(col.name);
    const type = col.type === undefined ? 'string' : col.type;
    if (!TYPES.includes(type)) throw badSchema();
    let regex = null;
    if (col.pattern !== undefined) {
      if (typeof col.pattern !== 'string') throw badSchema();
      try { regex = new RegExp(col.pattern); } catch { throw badSchema(); }
    }
    if (col.enum !== undefined) {
      if (!Array.isArray(col.enum) || col.enum.length === 0 || !col.enum.every((v) => typeof v === 'string')) {
        throw badSchema();
      }
    }
    for (const k of ['min', 'max']) {
      const v = col[k];
      if (v === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof v !== 'number' || !Number.isFinite(v)) throw badSchema();
      } else if (type === 'date') {
        if (!validDate(v)) throw badSchema();
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      const v = col[k];
      if (v !== undefined && !(Number.isInteger(v) && v >= 0)) throw badSchema();
    }
    cols.push({ col, type, regex });
  }
  return cols;
}

function typeOk(type, v) {
  switch (type) {
    case 'int': return /^[+-]?\d+$/.test(v) && Number.isSafeInteger(Number(v));
    case 'number': return /^[+-]?\d+(\.\d+)?$/.test(v) && Number.isFinite(Number(v));
    case 'bool': { const l = v.toLowerCase(); return l === 'true' || l === 'false'; }
    case 'date': return validDate(v);
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
    cols.forEach(({ col, type, regex }, k) => {
      if (idx[k] === -1) return;
      const v = rec[idx[k]];
      const add = (code) => errors.push({ row, column: col.name, code });
      if (v === '') {
        if (col.required) add('REQUIRED');
        return;
      }
      if (!typeOk(type, v)) { add('TYPE'); return; }
      if (col.enum !== undefined && !col.enum.includes(v)) add('ENUM');
      if (regex && !regex.test(v)) add('PATTERN');
      const len = Array.from(v).length;
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
        if (seen[k].has(v)) add('UNIQUE');
        else seen[k].add(v);
      }
    });
  }
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
