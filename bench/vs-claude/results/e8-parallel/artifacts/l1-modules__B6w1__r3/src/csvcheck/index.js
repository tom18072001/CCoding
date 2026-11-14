// Module csvcheck — phân tích CSV (RFC 4180) và kiểm theo lược đồ. Xem SPEC.md.

function fail(code, row) {
  const e = new Error(code);
  e.code = code;
  if (row !== undefined) e.row = row;
  return e;
}

export function parseCsv(text, options = {}) {
  if (typeof text !== 'string') throw fail('CSV_INVALID_INPUT');
  const opts = options == null ? {} : options;
  if (typeof opts !== 'object') throw fail('CSV_INVALID_INPUT');
  let delim = ',';
  if (opts.delimiter !== undefined) {
    const d = opts.delimiter;
    if (typeof d !== 'string' || Array.from(d).length !== 1 || d === '"' || d === '\r' || d === '\n') {
      throw fail('CSV_INVALID_INPUT');
    }
    delim = d;
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const n = text.length;
  const records = [];
  let i = 0;
  const eol = () => {
    if (text[i] === '\r' && text[i + 1] === '\n') i += 2;
    else i += 1;
  };
  while (i < n) {
    if (text[i] === '\r' || text[i] === '\n') { eol(); continue; } // dòng trống
    const row = records.length + 1;
    const fields = [];
    for (;;) {
      let val = '';
      if (text[i] === '"') {
        i++;
        for (;;) {
          if (i >= n) throw fail('CSV_UNTERMINATED_QUOTE', row);
          const c = text[i];
          if (c === '"') {
            if (text[i + 1] === '"') { val += '"'; i += 2; continue; }
            i++;
            break;
          }
          val += c;
          i++;
        }
        if (i < n && text[i] !== delim && text[i] !== '\r' && text[i] !== '\n') {
          throw fail('CSV_BAD_QUOTE', row);
        }
      } else {
        const s = i;
        while (i < n && text[i] !== delim && text[i] !== '\r' && text[i] !== '\n') {
          if (text[i] === '"') throw fail('CSV_BAD_QUOTE', row);
          i++;
        }
        val = text.slice(s, i);
      }
      fields.push(val);
      if (i < n && text[i] === delim) { i++; continue; }
      if (i < n) eol();
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
  if (y < 1 || mo < 1 || mo > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return d <= dim;
}

function badSchema() { return fail('CSV_INVALID_SCHEMA'); }

function checkSchema(schema) {
  if (schema === null || typeof schema !== 'object' || !Array.isArray(schema.columns) || schema.columns.length === 0) {
    throw badSchema();
  }
  const names = new Set();
  const cols = [];
  for (const c of schema.columns) {
    if (c === null || typeof c !== 'object' || Array.isArray(c)) throw badSchema();
    if (typeof c.name !== 'string' || names.has(c.name)) throw badSchema();
    names.add(c.name);
    const type = c.type === undefined ? 'string' : c.type;
    if (!TYPES.includes(type)) throw badSchema();
    let re = null;
    if (c.pattern !== undefined) {
      if (typeof c.pattern !== 'string') throw badSchema();
      try { re = new RegExp(c.pattern); } catch { throw badSchema(); }
    }
    if (c.enum !== undefined) {
      if (!Array.isArray(c.enum) || c.enum.length === 0 || !c.enum.every((x) => typeof x === 'string')) throw badSchema();
    }
    for (const k of ['min', 'max']) {
      const v = c[k];
      if (v === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof v !== 'number' || !Number.isFinite(v)) throw badSchema();
      } else if (type === 'date') {
        if (typeof v !== 'string' || !isDate(v)) throw badSchema();
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      const v = c[k];
      if (v !== undefined && (!Number.isInteger(v) || v < 0)) throw badSchema();
    }
    cols.push({ def: c, type, re });
  }
  return cols;
}

function typeOk(type, s) {
  switch (type) {
    case 'string': return true;
    case 'int': return /^[+-]?\d+$/.test(s) && Number.isSafeInteger(Number(s));
    case 'number': return /^[+-]?\d+(\.\d+)?$/.test(s) && Number.isFinite(Number(s));
    case 'bool': return /^(true|false)$/i.test(s);
    case 'date': return isDate(s);
    default: return false;
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
  const idx = cols.map((c) => header.indexOf(c.def.name));
  cols.forEach((c, k) => {
    if (idx[k] < 0) errors.push({ row: 1, column: c.def.name, code: 'MISSING_COLUMN' });
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
      if (idx[k] < 0) return;
      const d = c.def;
      const v = rec[idx[k]];
      const err = (code) => errors.push({ row, column: d.name, code });
      if (v === '') { if (d.required) err('REQUIRED'); return; }
      if (!typeOk(c.type, v)) { err('TYPE'); return; }
      if (d.enum !== undefined && !d.enum.includes(v)) err('ENUM');
      if (c.re && !c.re.test(v)) err('PATTERN');
      const len = Array.from(v).length;
      if (d.minLength !== undefined && len < d.minLength) err('MIN_LENGTH');
      if (d.maxLength !== undefined && len > d.maxLength) err('MAX_LENGTH');
      const numeric = c.type === 'int' || c.type === 'number';
      if (numeric || c.type === 'date') {
        const x = numeric ? Number(v) : v;
        if (d.min !== undefined && x < d.min) err('MIN');
        if (d.max !== undefined && x > d.max) err('MAX');
      }
      if (d.unique) {
        if (seen[k].has(v)) err('UNIQUE');
        else seen[k].add(v);
      }
    });
  }
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
