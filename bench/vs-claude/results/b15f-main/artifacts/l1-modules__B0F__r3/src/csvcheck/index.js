// Module csvcheck — xem mục "csvcheck" trong SPEC.md.

function fail(code, row) {
  const err = new Error(code);
  err.code = code;
  if (row !== undefined) err.row = row;
  return err;
}

function resolveDelimiter(options) {
  if (options === undefined || options === null) return ',';
  if (typeof options !== 'object') throw fail('CSV_INVALID_INPUT');
  const d = options.delimiter;
  if (d === undefined) return ',';
  if (typeof d !== 'string' || Array.from(d).length !== 1 || d === '"' || d === '\r' || d === '\n') {
    throw fail('CSV_INVALID_INPUT');
  }
  return d;
}

export function parseCsv(text, options = {}) {
  if (typeof text !== 'string') throw fail('CSV_INVALID_INPUT');
  const delim = resolveDelimiter(options);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const n = text.length;
  const records = [];
  let i = 0;

  while (i < n) {
    // đầu bản ghi: dòng trống bị bỏ qua
    const c0 = text[i];
    if (c0 === '\r' || c0 === '\n') {
      i += c0 === '\r' && text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    const row = records.length + 1;
    const rec = [];
    // đọc các ô cho tới hết bản ghi
    for (;;) {
      let value = '';
      if (text[i] === '"') {
        i++;
        let closed = false;
        while (i < n) {
          const ch = text[i];
          if (ch === '"') {
            if (text[i + 1] === '"') { value += '"'; i += 2; continue; }
            i++;
            closed = true;
            break;
          }
          value += ch;
          i++;
        }
        if (!closed) throw fail('CSV_UNTERMINATED_QUOTE', row);
        if (i < n && text[i] !== delim && text[i] !== '\r' && text[i] !== '\n') {
          throw fail('CSV_BAD_QUOTE', row);
        }
      } else {
        const start = i;
        while (i < n && text[i] !== delim && text[i] !== '\r' && text[i] !== '\n') {
          if (text[i] === '"') throw fail('CSV_BAD_QUOTE', row);
          i++;
        }
        value = text.slice(start, i);
      }
      rec.push(value);
      if (i >= n) break;
      const ch = text[i];
      if (ch === delim) { i++; if (i >= n) { rec.push(''); break; } continue; }
      // kết thúc dòng
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
      break;
    }
    records.push(rec);
  }
  return records;
}

const TYPES = ['string', 'int', 'number', 'bool', 'date'];

function isValidDate(s) {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1 || mo < 1 || mo > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return d <= dim;
}

function checkType(type, s) {
  switch (type) {
    case 'int': return /^[+-]?[0-9]+$/.test(s) && Number.isSafeInteger(Number(s));
    case 'number': return /^[+-]?[0-9]+(\.[0-9]+)?$/.test(s) && Number.isFinite(Number(s));
    case 'bool': return /^(true|false)$/i.test(s);
    case 'date': return isValidDate(s);
    default: return true;
  }
}

function compileSchema(schema) {
  const bad = () => fail('CSV_INVALID_SCHEMA');
  if (schema === null || typeof schema !== 'object' || !Array.isArray(schema.columns) || schema.columns.length === 0) {
    throw bad();
  }
  const names = new Set();
  return schema.columns.map((col) => {
    if (col === null || typeof col !== 'object' || Array.isArray(col)) throw bad();
    if (typeof col.name !== 'string' || names.has(col.name)) throw bad();
    names.add(col.name);
    const type = col.type === undefined ? 'string' : col.type;
    if (!TYPES.includes(type)) throw bad();
    let re = null;
    if (col.pattern !== undefined) {
      if (typeof col.pattern !== 'string') throw bad();
      try { re = new RegExp(col.pattern); } catch { throw bad(); }
    }
    if (col.enum !== undefined) {
      if (!Array.isArray(col.enum) || col.enum.length === 0 || !col.enum.every((v) => typeof v === 'string')) throw bad();
    }
    for (const k of ['min', 'max']) {
      const v = col[k];
      if (v === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof v !== 'number' || !Number.isFinite(v)) throw bad();
      } else if (type === 'date') {
        if (typeof v !== 'string' || !isValidDate(v)) throw bad();
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      const v = col[k];
      if (v !== undefined && !(Number.isInteger(v) && v >= 0)) throw bad();
    }
    return { name: col.name, type, required: col.required === true, unique: col.unique === true, re, def: col };
  });
}

export function validateCsv(text, schema, options = {}) {
  const cols = compileSchema(schema);
  let records;
  try {
    records = parseCsv(text, options);
  } catch (e) {
    if (e && (e.code === 'CSV_UNTERMINATED_QUOTE' || e.code === 'CSV_BAD_QUOTE')) {
      return { ok: false, rowCount: 0, errors: [{ row: e.row, column: null, code: e.code.slice(4) }] };
    }
    throw e;
  }
  if (records.length === 0) {
    return { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] };
  }

  const header = records[0];
  const errors = [];
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
      const cell = rec[idx[k]];
      const d = c.def;
      const push = (code) => errors.push({ row, column: c.name, code });
      if (cell === '') {
        if (c.required) push('REQUIRED');
        return;
      }
      if (!checkType(c.type, cell)) { push('TYPE'); return; }
      if (d.enum !== undefined && !d.enum.includes(cell)) push('ENUM');
      if (c.re && !c.re.test(cell)) push('PATTERN');
      const len = Array.from(cell).length;
      if (d.minLength !== undefined && len < d.minLength) push('MIN_LENGTH');
      if (d.maxLength !== undefined && len > d.maxLength) push('MAX_LENGTH');
      if (c.type === 'int' || c.type === 'number') {
        const v = Number(cell);
        if (d.min !== undefined && v < d.min) push('MIN');
        if (d.max !== undefined && v > d.max) push('MAX');
      } else if (c.type === 'date') {
        if (d.min !== undefined && cell < d.min) push('MIN');
        if (d.max !== undefined && cell > d.max) push('MAX');
      }
      if (c.unique) {
        if (seen[k].has(cell)) push('UNIQUE');
        else seen[k].add(cell);
      }
    });
  }
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
