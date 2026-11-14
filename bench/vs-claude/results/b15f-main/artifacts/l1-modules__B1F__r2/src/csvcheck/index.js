// Module csvcheck — xem mục "csvcheck" trong SPEC.md.

function fail(code, row) {
  const e = new Error(code);
  e.code = code;
  if (row !== undefined) e.row = row;
  return e;
}

export function parseCsv(text, options = {}) {
  if (typeof text !== 'string') throw fail('CSV_INVALID_INPUT');
  if (options === null || typeof options !== 'object') throw fail('CSV_INVALID_INPUT');
  const delimiter = options.delimiter === undefined ? ',' : options.delimiter;
  if (typeof delimiter !== 'string' || delimiter.length !== 1 ||
      delimiter === '"' || delimiter === '\r' || delimiter === '\n') {
    throw fail('CSV_INVALID_INPUT');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const records = [];
  let record = [];
  let field = '';
  let started = false; // đã có ký tự nào trong bản ghi hiện tại (kể cả ô rỗng sau dấu phân cách)
  let fieldStart = true;
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
    fieldStart = true;
  };

  while (i < n) {
    const ch = text[i];
    if (ch === '"' && fieldStart) {
      // ô có nháy
      started = true;
      fieldStart = false;
      i++;
      let closed = false;
      while (i < n) {
        const c = text[i];
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          i++;
          closed = true;
          break;
        }
        field += c;
        i++;
      }
      if (!closed) throw fail('CSV_UNTERMINATED_QUOTE', records.length + 1);
      if (i < n) {
        const c = text[i];
        if (c !== delimiter && c !== '\r' && c !== '\n') throw fail('CSV_BAD_QUOTE', records.length + 1);
      }
      continue;
    }
    if (ch === delimiter) {
      started = true;
      record.push(field);
      field = '';
      fieldStart = true;
      i++;
      // sau dấu phân cách luôn có một ô (có thể rỗng) — đánh dấu bằng pending
      // ô kế tiếp được xử lý ở vòng sau; nếu hết dòng thì endRecord đẩy ô rỗng
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      i++;
      endRecord();
      continue;
    }
    if (ch === '"') throw fail('CSV_BAD_QUOTE', records.length + 1);
    started = true;
    fieldStart = false;
    field += ch;
    i++;
  }
  endRecord();
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
    default: return true;
  }
}

function badSchema() { return fail('CSV_INVALID_SCHEMA'); }

function compileSchema(schema) {
  if (schema === null || typeof schema !== 'object' || !Array.isArray(schema.columns) ||
      schema.columns.length === 0) throw badSchema();
  const names = new Set();
  return schema.columns.map((col) => {
    if (col === null || typeof col !== 'object' || Array.isArray(col)) throw badSchema();
    if (typeof col.name !== 'string' || names.has(col.name)) throw badSchema();
    names.add(col.name);
    const type = col.type === undefined ? 'string' : col.type;
    if (!TYPES.includes(type)) throw badSchema();
    let re = null;
    if (col.pattern !== undefined) {
      if (typeof col.pattern !== 'string') throw badSchema();
      try { re = new RegExp(col.pattern); } catch { throw badSchema(); }
    }
    if (col.enum !== undefined &&
        (!Array.isArray(col.enum) || col.enum.length === 0 || col.enum.some((v) => typeof v !== 'string'))) {
      throw badSchema();
    }
    for (const k of ['min', 'max']) {
      const v = col[k];
      if (v === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof v !== 'number' || !Number.isFinite(v)) throw badSchema();
      } else if (type === 'date') {
        if (typeof v !== 'string' || !isRealDate(v)) throw badSchema();
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      const v = col[k];
      if (v !== undefined && !(Number.isInteger(v) && v >= 0)) throw badSchema();
    }
    return { name: col.name, type, required: col.required === true, unique: col.unique === true,
      re, enum: col.enum, min: col.min, max: col.max, minLength: col.minLength, maxLength: col.maxLength };
  });
}

export function validateCsv(text, schema, options = {}) {
  const cols = compileSchema(schema);
  let records;
  try {
    records = parseCsv(text, options);
  } catch (e) {
    if (e.code === 'CSV_UNTERMINATED_QUOTE' || e.code === 'CSV_BAD_QUOTE') {
      return { ok: false, rowCount: 0,
        errors: [{ row: e.row, column: null, code: e.code.slice(4) }] };
    }
    throw e;
  }
  const errors = [];
  if (records.length === 0) {
    return { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] };
  }
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
      if (v === '') { if (c.required) err('REQUIRED'); return; }
      if (!checkType(c.type, v)) { err('TYPE'); return; }
      if (c.enum !== undefined && !c.enum.includes(v)) err('ENUM');
      if (c.re && !c.re.test(v)) err('PATTERN');
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
        if (seen[k].has(v)) err('UNIQUE'); else seen[k].add(v);
      }
    });
  }
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
