// csvcheck — xem SPEC.md, mục "Module csvcheck".

function err(code, row) {
  const e = new Error(code);
  e.code = code;
  if (row !== undefined) e.row = row;
  return e;
}

export function parseCsv(text, options) {
  if (typeof text !== 'string') throw err('CSV_INVALID_INPUT');
  let delim = ',';
  if (options !== undefined && options !== null && options.delimiter !== undefined) {
    const dl = options.delimiter;
    if (typeof dl !== 'string' || Array.from(dl).length !== 1 || dl === '"' || dl === '\r' || dl === '\n') {
      throw err('CSV_INVALID_INPUT');
    }
    delim = dl;
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const records = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    const c = text[i];
    // dòng trống
    if (c === '\n') { i++; continue; }
    if (c === '\r') { i += text[i + 1] === '\n' ? 2 : 1; continue; }
    const row = records.length + 1;
    const rec = [];
    let done = false;
    while (!done) {
      // bắt đầu một ô
      let cell = '';
      if (text[i] === '"') {
        i++;
        for (;;) {
          if (i >= n) throw err('CSV_UNTERMINATED_QUOTE', row);
          const ch = text[i];
          if (ch === '"') {
            if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
            i++;
            break;
          }
          cell += ch;
          i++;
        }
        const nx = text[i];
        if (i < n && nx !== delim && nx !== '\n' && nx !== '\r') throw err('CSV_BAD_QUOTE', row);
      } else {
        while (i < n) {
          const ch = text[i];
          if (ch === delim || ch === '\n' || ch === '\r') break;
          if (ch === '"') throw err('CSV_BAD_QUOTE', row);
          cell += ch;
          i++;
        }
      }
      rec.push(cell);
      if (i >= n) done = true;
      else if (text[i] === delim) {
        i++;
        if (i >= n) { rec.push(''); done = true; }
      } else {
        i += text[i] === '\r' && text[i + 1] === '\n' ? 2 : 1;
        done = true;
      }
    }
    records.push(rec);
  }
  return records;
}

const TYPES = ['string', 'int', 'number', 'bool', 'date'];

function isRealDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const y = +s.slice(0, 4), m = +s.slice(5, 7), d = +s.slice(8, 10);
  if (y < 1 || m < 1 || m > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  return d <= dim;
}

function checkSchema(schema) {
  const bad = () => err('CSV_INVALID_SCHEMA');
  if (schema === null || typeof schema !== 'object' || !Array.isArray(schema.columns) || schema.columns.length === 0) throw bad();
  const names = new Set();
  const cols = [];
  for (const c of schema.columns) {
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
    if (c.enum !== undefined) {
      if (!Array.isArray(c.enum) || c.enum.length === 0 || c.enum.some((x) => typeof x !== 'string')) throw bad();
    }
    for (const k of ['min', 'max']) {
      if (c[k] === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof c[k] !== 'number' || !Number.isFinite(c[k])) throw bad();
      } else if (type === 'date') {
        if (!isRealDate(c[k])) throw bad();
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      if (c[k] !== undefined && (!Number.isInteger(c[k]) || c[k] < 0)) throw bad();
    }
    cols.push({ ...c, type, re });
  }
  return cols;
}

function typeOk(type, v) {
  switch (type) {
    case 'string': return true;
    case 'int': return /^[+-]?\d+$/.test(v) && Number.isSafeInteger(Number(v));
    case 'number': return /^[+-]?\d+(\.\d+)?$/.test(v) && Number.isFinite(Number(v));
    case 'bool': return /^(true|false)$/i.test(v);
    case 'date': return isRealDate(v);
  }
  return false;
}

export function validateCsv(text, schema, options) {
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
  const errors = [];
  if (records.length === 0) {
    return { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] };
  }
  const header = records[0];
  const idx = cols.map((c) => header.indexOf(c.name));
  cols.forEach((c, k) => {
    if (idx[k] < 0) errors.push({ row: 1, column: c.name, code: 'MISSING_COLUMN' });
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
      const v = rec[idx[k]];
      const push = (code) => errors.push({ row, column: c.name, code });
      if (v === '') {
        if (c.required) push('REQUIRED');
        return;
      }
      if (!typeOk(c.type, v)) { push('TYPE'); return; }
      if (c.enum !== undefined && !c.enum.includes(v)) push('ENUM');
      if (c.re && !c.re.test(v)) push('PATTERN');
      const len = Array.from(v).length;
      if (c.minLength !== undefined && len < c.minLength) push('MIN_LENGTH');
      if (c.maxLength !== undefined && len > c.maxLength) push('MAX_LENGTH');
      if (c.type === 'int' || c.type === 'number') {
        const x = Number(v);
        if (c.min !== undefined && x < c.min) push('MIN');
        if (c.max !== undefined && x > c.max) push('MAX');
      } else if (c.type === 'date') {
        if (c.min !== undefined && v < c.min) push('MIN');
        if (c.max !== undefined && v > c.max) push('MAX');
      }
      if (c.unique) {
        if (seen[k].has(v)) push('UNIQUE');
        else seen[k].add(v);
      }
    });
  }
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
