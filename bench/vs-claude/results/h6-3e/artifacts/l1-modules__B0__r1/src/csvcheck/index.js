// Module csvcheck — xem mục "csvcheck" trong SPEC.md.

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
  const d = opts.delimiter === undefined ? ',' : opts.delimiter;
  if (typeof d !== 'string' || d.length !== 1 || d === '"' || d === '\r' || d === '\n') {
    throw fail('CSV_INVALID_INPUT');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const n = text.length;
  const records = [];
  let i = 0;

  const eolLen = (p) => (text[p] === '\r' ? (text[p + 1] === '\n' ? 2 : 1) : text[p] === '\n' ? 1 : 0);

  while (i < n) {
    const l = eolLen(i);
    if (l) { i += l; continue; } // dòng trống
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
        if (i < n && text[i] !== d && !eolLen(i)) throw fail('CSV_BAD_QUOTE', row);
      } else {
        const s = i;
        while (i < n && text[i] !== d && !eolLen(i)) {
          if (text[i] === '"') throw fail('CSV_BAD_QUOTE', row);
          i++;
        }
        val = text.slice(s, i);
      }
      fields.push(val);
      if (i < n && text[i] === d) { i++; continue; }
      i += i < n ? eolLen(i) : 0;
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
  const y = +m[1], mo = +m[2], da = +m[3];
  if (y === 0 || mo < 1 || mo > 12 || da < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return da <= dim;
}

function checkType(type, v) {
  switch (type) {
    case 'int': return /^[+-]?\d+$/.test(v) && Number.isSafeInteger(Number(v));
    case 'number': return /^[+-]?\d+(\.\d+)?$/.test(v) && Number.isFinite(Number(v));
    case 'bool': { const l = v.toLowerCase(); return l === 'true' || l === 'false'; }
    case 'date': return isDate(v);
    default: return true;
  }
}

function normalizeSchema(schema) {
  const bad = () => { throw fail('CSV_INVALID_SCHEMA'); };
  if (schema === null || typeof schema !== 'object' || !Array.isArray(schema.columns) || schema.columns.length === 0) bad();
  const names = new Set();
  return schema.columns.map((c) => {
    if (c === null || typeof c !== 'object' || Array.isArray(c)) bad();
    if (typeof c.name !== 'string' || names.has(c.name)) bad();
    names.add(c.name);
    const type = c.type === undefined ? 'string' : c.type;
    if (!TYPES.includes(type)) bad();
    let re = null;
    if (c.pattern !== undefined) {
      if (typeof c.pattern !== 'string') bad();
      try { re = new RegExp(c.pattern); } catch { bad(); }
    }
    if (c.enum !== undefined) {
      if (!Array.isArray(c.enum) || c.enum.length === 0 || c.enum.some((x) => typeof x !== 'string')) bad();
    }
    for (const k of ['min', 'max']) {
      if (c[k] === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof c[k] !== 'number' || !Number.isFinite(c[k])) bad();
      } else if (type === 'date') {
        if (typeof c[k] !== 'string' || !isDate(c[k])) bad();
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      if (c[k] !== undefined && !(Number.isInteger(c[k]) && c[k] >= 0)) bad();
    }
    return { name: c.name, type, required: c.required === true, unique: c.unique === true, re, c };
  });
}

export function validateCsv(text, schema, options = {}) {
  const cols = normalizeSchema(schema);
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
  const idx = cols.map((col) => header.indexOf(col.name));
  cols.forEach((col, k) => {
    if (idx[k] < 0) errors.push({ row: 1, column: col.name, code: 'MISSING_COLUMN' });
  });
  const seen = cols.map(() => new Set());
  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    const row = r + 1;
    if (rec.length !== header.length) {
      errors.push({ row, column: null, code: 'ROW_LENGTH' });
      continue;
    }
    cols.forEach((col, k) => {
      if (idx[k] < 0) return;
      const v = rec[idx[k]];
      const c = col.c;
      const err = (code) => errors.push({ row, column: col.name, code });
      if (v === '') { if (col.required) err('REQUIRED'); return; }
      if (!checkType(col.type, v)) { err('TYPE'); return; }
      if (c.enum !== undefined && !c.enum.includes(v)) err('ENUM');
      if (col.re && !col.re.test(v)) err('PATTERN');
      const len = (c.minLength !== undefined || c.maxLength !== undefined) ? Array.from(v).length : 0;
      if (c.minLength !== undefined && len < c.minLength) err('MIN_LENGTH');
      if (c.maxLength !== undefined && len > c.maxLength) err('MAX_LENGTH');
      if (col.type === 'int' || col.type === 'number') {
        const x = Number(v);
        if (c.min !== undefined && x < c.min) err('MIN');
        if (c.max !== undefined && x > c.max) err('MAX');
      } else if (col.type === 'date') {
        if (c.min !== undefined && v < c.min) err('MIN');
        if (c.max !== undefined && v > c.max) err('MAX');
      }
      if (col.unique) {
        if (seen[k].has(v)) err('UNIQUE'); else seen[k].add(v);
      }
    });
  }
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
