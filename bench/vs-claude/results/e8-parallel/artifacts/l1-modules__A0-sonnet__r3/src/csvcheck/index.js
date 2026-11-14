// csvcheck — xem SPEC.md, mục "Module csvcheck".

function err(code, row) {
  const e = new Error(code);
  e.code = code;
  if (row !== undefined) e.row = row;
  return e;
}

export function parseCsv(text, options) {
  if (typeof text !== 'string') throw err('CSV_INVALID_INPUT');
  let delimiter = ',';
  if (options !== undefined && options !== null && options.delimiter !== undefined) {
    delimiter = options.delimiter;
  }
  if (typeof delimiter !== 'string' || delimiter.length !== 1 || delimiter === '"' || delimiter === '\r' || delimiter === '\n') {
    throw err('CSV_INVALID_INPUT');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const records = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    // dòng trống
    if (text[i] === '\r' || text[i] === '\n') {
      i += text[i] === '\r' && text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    const row = records.length + 1;
    const rec = [];
    for (;;) {
      let field = '';
      if (text[i] === '"') {
        i++;
        for (;;) {
          if (i >= n) throw err('CSV_UNTERMINATED_QUOTE', row);
          const c = text[i];
          if (c === '"') {
            if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
            i++;
            break;
          }
          field += c;
          i++;
        }
        if (i < n && text[i] !== delimiter && text[i] !== '\r' && text[i] !== '\n') {
          throw err('CSV_BAD_QUOTE', row);
        }
      } else {
        while (i < n && text[i] !== delimiter && text[i] !== '\r' && text[i] !== '\n') {
          if (text[i] === '"') throw err('CSV_BAD_QUOTE', row);
          field += text[i];
          i++;
        }
      }
      rec.push(field);
      if (i >= n) break;
      if (text[i] === delimiter) {
        i++;
        if (i >= n) { rec.push(''); break; }
        continue;
      }
      // kết thúc dòng
      i += text[i] === '\r' && text[i + 1] === '\n' ? 2 : 1;
      break;
    }
    records.push(rec);
  }
  return records;
}

const TYPES = ['string', 'int', 'number', 'bool', 'date'];

function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const y = +s.slice(0, 4);
  const m = +s.slice(5, 7);
  const d = +s.slice(8, 10);
  if (y < 1 || m < 1 || m > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  return d <= dim;
}

function checkSchema(schema) {
  const bad = () => err('CSV_INVALID_SCHEMA');
  if (schema === null || typeof schema !== 'object' || !Array.isArray(schema.columns) || schema.columns.length === 0) {
    throw bad();
  }
  const names = new Set();
  const cols = [];
  for (const c of schema.columns) {
    if (c === null || typeof c !== 'object' || Array.isArray(c)) throw bad();
    if (typeof c.name !== 'string' || c.name === '' || names.has(c.name)) throw bad();
    names.add(c.name);
    const type = c.type === undefined ? 'string' : c.type;
    if (!TYPES.includes(type)) throw bad();
    let re = null;
    if (c.pattern !== undefined) {
      if (typeof c.pattern !== 'string') throw bad();
      try { re = new RegExp(c.pattern); } catch { throw bad(); }
    }
    if (c.enum !== undefined) {
      if (!Array.isArray(c.enum) || c.enum.length === 0 || !c.enum.every((x) => typeof x === 'string')) throw bad();
    }
    for (const k of ['min', 'max']) {
      if (c[k] === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof c[k] !== 'number' || !Number.isFinite(c[k])) throw bad();
      } else if (type === 'date') {
        if (!validDate(c[k])) throw bad();
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      if (c[k] !== undefined && (!Number.isSafeInteger(c[k]) || c[k] < 0)) throw bad();
    }
    cols.push({ def: c, type, re });
  }
  return cols;
}

function typeOk(type, v) {
  switch (type) {
    case 'int': return /^[+-]?\d+$/.test(v) && Number.isSafeInteger(Number(v));
    case 'number': return /^[+-]?\d+(\.\d+)?$/.test(v) && Number.isFinite(Number(v));
    case 'bool': return /^(true|false)$/i.test(v);
    case 'date': return validDate(v);
    default: return true;
  }
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
  const push = (row, column, code) => errors.push({ row, column, code });
  if (records.length === 0) {
    push(1, null, 'EMPTY_INPUT');
    return { ok: false, rowCount: 0, errors };
  }
  const header = records[0];
  for (const c of cols) c.idx = header.indexOf(c.def.name);
  for (const c of cols) if (c.idx < 0) push(1, c.def.name, 'MISSING_COLUMN');
  for (const c of cols) c.seen = new Set();

  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    const row = r + 1;
    if (rec.length !== header.length) {
      push(row, null, 'ROW_LENGTH');
      continue;
    }
    for (const c of cols) {
      if (c.idx < 0) continue;
      const d = c.def;
      const name = d.name;
      const v = rec[c.idx];
      if (v === '') {
        if (d.required === true) push(row, name, 'REQUIRED');
        continue;
      }
      if (!typeOk(c.type, v)) { push(row, name, 'TYPE'); continue; }
      if (d.enum !== undefined && !d.enum.includes(v)) push(row, name, 'ENUM');
      if (c.re && !c.re.test(v)) push(row, name, 'PATTERN');
      const len = Array.from(v).length;
      if (d.minLength !== undefined && len < d.minLength) push(row, name, 'MIN_LENGTH');
      if (d.maxLength !== undefined && len > d.maxLength) push(row, name, 'MAX_LENGTH');
      if (c.type === 'int' || c.type === 'number' || c.type === 'date') {
        const x = c.type === 'date' ? v : Number(v);
        if (d.min !== undefined && x < d.min) push(row, name, 'MIN');
        if (d.max !== undefined && x > d.max) push(row, name, 'MAX');
      }
      if (d.unique) {
        if (c.seen.has(v)) push(row, name, 'UNIQUE');
        else c.seen.add(v);
      }
    }
  }
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
