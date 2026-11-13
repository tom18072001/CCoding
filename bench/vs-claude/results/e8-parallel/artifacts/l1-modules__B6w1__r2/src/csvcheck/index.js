// Module csvcheck — xem mục "csvcheck" trong SPEC.md.

function fail(code, row) {
  const e = new Error(code);
  e.code = code;
  if (row !== undefined) e.row = row;
  return e;
}

export function parseCsv(text, options = {}) {
  if (typeof text !== 'string') throw fail('CSV_INVALID_INPUT');
  const opts = options === null || options === undefined ? {} : options;
  if (typeof opts !== 'object') throw fail('CSV_INVALID_INPUT');
  const delim = opts.delimiter === undefined ? ',' : opts.delimiter;
  if (typeof delim !== 'string' || delim.length !== 1 || delim === '"' || delim === '\r' || delim === '\n') {
    throw fail('CSV_INVALID_INPUT');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const records = [];
  let record = [];
  let field = '';
  let started = false; // đã đọc ký tự nào của bản ghi hiện tại
  const n = text.length;
  let i = 0;
  const row = () => records.length + 1;

  const endField = () => { record.push(field); field = ''; };
  const endRecord = () => { endField(); records.push(record); record = []; started = false; };

  while (i < n) {
    const c = text[i];
    if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      i++;
      if (started) endRecord(); // dòng trống bị bỏ qua
      continue;
    }
    started = true;
    if (c === '"') {
      i++;
      let closed = false;
      while (i < n) {
        if (text[i] === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          i++; closed = true; break;
        }
        field += text[i++];
      }
      if (!closed) throw fail('CSV_UNTERMINATED_QUOTE', row());
      if (i < n) {
        const d = text[i];
        if (d === delim) { endField(); i++; continue; }
        if (d !== '\r' && d !== '\n') throw fail('CSV_BAD_QUOTE', row());
      }
      continue;
    }
    // ô không nháy
    while (i < n) {
      const d = text[i];
      if (d === delim || d === '\r' || d === '\n') break;
      if (d === '"') throw fail('CSV_BAD_QUOTE', row());
      field += d;
      i++;
    }
    if (i < n && text[i] === delim) {
      endField();
      i++;
    }
  }
  if (started) endRecord();
  return records;
}

const TYPES = ['string', 'int', 'number', 'bool', 'date'];

function validDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
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
    case 'date': return validDate(v);
    default: return true;
  }
}

function bad() { return fail('CSV_INVALID_SCHEMA'); }

function compileSchema(schema) {
  if (schema === null || typeof schema !== 'object' || !Array.isArray(schema.columns) || schema.columns.length === 0) throw bad();
  const names = new Set();
  return schema.columns.map((c) => {
    if (c === null || typeof c !== 'object' || Array.isArray(c)) throw bad();
    if (typeof c.name !== 'string' || names.has(c.name)) throw bad();
    names.add(c.name);
    const type = c.type === undefined ? 'string' : c.type;
    if (!TYPES.includes(type)) throw bad();
    let re = null;
    if (c.pattern !== undefined) {
      if (typeof c.pattern !== 'string') throw bad();
      try { re = new RegExp(c.pattern); } catch { throw bad(); }
    }
    if (c.enum !== undefined && (!Array.isArray(c.enum) || c.enum.length === 0 || c.enum.some((x) => typeof x !== 'string'))) throw bad();
    for (const k of ['min', 'max']) {
      if (c[k] === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof c[k] !== 'number' || !Number.isFinite(c[k])) throw bad();
      } else if (type === 'date') {
        if (typeof c[k] !== 'string' || !validDate(c[k])) throw bad();
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      if (c[k] !== undefined && (!Number.isInteger(c[k]) || c[k] < 0)) throw bad();
    }
    return {
      name: c.name, type, re, required: c.required === true, unique: c.unique === true,
      enum: c.enum, min: c.min, max: c.max, minLength: c.minLength, maxLength: c.maxLength, seen: new Set(),
    };
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
  cols.forEach((c, k) => {
    if (idx[k] < 0) errors.push({ row: 1, column: c.name, code: 'MISSING_COLUMN' });
  });
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
      if (!checkType(c.type, v)) { err('TYPE'); return; }
      if (c.enum && !c.enum.includes(v)) err('ENUM');
      if (c.re && !c.re.test(v)) err('PATTERN');
      const len = (c.minLength !== undefined || c.maxLength !== undefined) ? Array.from(v).length : 0;
      if (c.minLength !== undefined && len < c.minLength) err('MIN_LENGTH');
      if (c.maxLength !== undefined && len > c.maxLength) err('MAX_LENGTH');
      if (c.type === 'int' || c.type === 'number' || c.type === 'date') {
        const x = c.type === 'date' ? v : Number(v);
        if (c.min !== undefined && x < c.min) err('MIN');
        if (c.max !== undefined && x > c.max) err('MAX');
      }
      if (c.unique) {
        if (c.seen.has(v)) err('UNIQUE'); else c.seen.add(v);
      }
    });
  }
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
