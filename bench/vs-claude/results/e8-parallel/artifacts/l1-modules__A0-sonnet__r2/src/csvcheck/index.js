function mkErr(code, extra) {
  const e = new Error(code);
  e.code = code;
  if (extra) Object.assign(e, extra);
  return e;
}

export function parseCsv(text, options) {
  if (typeof text !== 'string') throw mkErr('CSV_INVALID_INPUT');
  let delim = ',';
  if (options !== undefined && options !== null) {
    if (typeof options !== 'object') throw mkErr('CSV_INVALID_INPUT');
    if (options.delimiter !== undefined) {
      const dl = options.delimiter;
      if (typeof dl !== 'string' || Array.from(dl).length !== 1 || dl === '"' || dl === '\r' || dl === '\n') {
        throw mkErr('CSV_INVALID_INPUT');
      }
      delim = dl;
    }
  }
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const n = text.length;
  const records = [];
  const dlen = delim.length;
  while (i < n) {
    // start of a record
    const c0 = text[i];
    if (c0 === '\n') { i++; continue; }
    if (c0 === '\r') { i += text[i + 1] === '\n' ? 2 : 1; continue; }
    const row = records.length + 1;
    const rec = [];
    for (;;) {
      // start of a cell
      let cell = '';
      if (text[i] === '"') {
        i++;
        for (;;) {
          if (i >= n) throw mkErr('CSV_UNTERMINATED_QUOTE', { row });
          const ch = text[i];
          if (ch === '"') {
            if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
            i++;
            break;
          }
          cell += ch;
          i++;
        }
        // after closing quote
        if (i < n && !text.startsWith(delim, i) && text[i] !== '\n' && text[i] !== '\r') {
          throw mkErr('CSV_BAD_QUOTE', { row });
        }
      } else {
        const s = i;
        while (i < n) {
          const ch = text[i];
          if (ch === '\n' || ch === '\r' || text.startsWith(delim, i)) break;
          if (ch === '"') throw mkErr('CSV_BAD_QUOTE', { row });
          i++;
        }
        cell = text.slice(s, i);
      }
      rec.push(cell);
      if (i >= n) break;
      if (text.startsWith(delim, i)) {
        i += dlen;
        continue; // next cell (may be empty at EOF/EOL)
      }
      // end of line
      i += text[i] === '\r' && text[i + 1] === '\n' ? 2 : 1;
      break;
    }
    records.push(rec);
  }
  return records;
}

const COL_TYPES = ['string', 'int', 'number', 'bool', 'date'];

function isRealDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  if (y < 1 || mo < 1 || mo > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return d <= dim;
}

function compileSchema(schema) {
  const bad = () => mkErr('CSV_INVALID_SCHEMA');
  if (typeof schema !== 'object' || schema === null || !Array.isArray(schema.columns) || schema.columns.length === 0) {
    throw bad();
  }
  const names = new Set();
  return schema.columns.map((c) => {
    if (typeof c !== 'object' || c === null || Array.isArray(c)) throw bad();
    if (typeof c.name !== 'string' || names.has(c.name)) throw bad();
    names.add(c.name);
    const type = c.type === undefined ? 'string' : c.type;
    if (!COL_TYPES.includes(type)) throw bad();
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
        if (typeof c[k] !== 'string' || !isRealDate(c[k])) throw bad();
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      if (c[k] === undefined) continue;
      if (!Number.isSafeInteger(c[k]) || c[k] < 0) throw bad();
    }
    return { name: c.name, type, re, def: c };
  });
}

function typeOk(type, v) {
  switch (type) {
    case 'int': return /^[+-]?\d+$/.test(v) && Number.isSafeInteger(Number(v));
    case 'number': return /^[+-]?\d+(\.\d+)?$/.test(v) && Number.isFinite(Number(v));
    case 'bool': return /^(true|false)$/i.test(v);
    case 'date': return isRealDate(v);
    default: return true;
  }
}

export function validateCsv(text, schema, options) {
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
      const d = c.def;
      const add = (code) => errors.push({ row, column: c.name, code });
      if (v === '') {
        if (d.required) add('REQUIRED');
        return;
      }
      if (!typeOk(c.type, v)) {
        add('TYPE');
        return;
      }
      if (d.enum !== undefined && !d.enum.includes(v)) add('ENUM');
      if (c.re && !c.re.test(v)) add('PATTERN');
      const len = Array.from(v).length;
      if (d.minLength !== undefined && len < d.minLength) add('MIN_LENGTH');
      if (d.maxLength !== undefined && len > d.maxLength) add('MAX_LENGTH');
      if (c.type === 'int' || c.type === 'number') {
        const x = Number(v);
        if (d.min !== undefined && x < d.min) add('MIN');
        if (d.max !== undefined && x > d.max) add('MAX');
      } else if (c.type === 'date') {
        if (d.min !== undefined && v < d.min) add('MIN');
        if (d.max !== undefined && v > d.max) add('MAX');
      }
      if (d.unique) {
        if (seen[k].has(v)) add('UNIQUE');
        else seen[k].add(v);
      }
    });
  }
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
