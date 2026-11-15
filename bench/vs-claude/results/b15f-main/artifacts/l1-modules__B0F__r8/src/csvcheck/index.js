// Module csvcheck — xem mục "csvcheck" trong SPEC.md (dòng 269–392).

function fail(code, message, row) {
  const e = new Error(message);
  e.code = code;
  if (row !== undefined) e.row = row;
  return e;
}

export function parseCsv(text, options = {}) {
  if (typeof text !== 'string') throw fail('CSV_INVALID_INPUT', 'text phải là chuỗi');
  const opts = options === undefined || options === null ? {} : options;
  if (typeof opts !== 'object') throw fail('CSV_INVALID_INPUT', 'options không hợp lệ');
  const delimiter = opts.delimiter === undefined ? ',' : opts.delimiter;
  if (typeof delimiter !== 'string' || delimiter.length !== 1 ||
      delimiter === '"' || delimiter === '\r' || delimiter === '\n') {
    throw fail('CSV_INVALID_INPUT', 'delimiter phải là đúng một ký tự, không phải nháy/xuống dòng');
  }
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const n = text.length;
  const records = [];

  while (i < n) {
    const c = text[i];
    // dòng trống: bỏ qua
    if (c === '\r') { i += text[i + 1] === '\n' ? 2 : 1; continue; }
    if (c === '\n') { i += 1; continue; }

    const row = records.length + 1;
    const fields = [];
    let done = false;
    while (!done) {
      let field = '';
      if (text[i] === '"') {
        i++;
        let closed = false;
        while (i < n) {
          if (text[i] === '"') {
            if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
            i++; closed = true; break;
          }
          field += text[i++];
        }
        if (!closed) throw fail('CSV_UNTERMINATED_QUOTE', `nháy không đóng ở hàng ${row}`, row);
        if (i < n && text[i] !== delimiter && text[i] !== '\r' && text[i] !== '\n') {
          throw fail('CSV_BAD_QUOTE', `ký tự sau nháy đóng ở hàng ${row}`, row);
        }
      } else {
        while (i < n && text[i] !== delimiter && text[i] !== '\r' && text[i] !== '\n') {
          if (text[i] === '"') throw fail('CSV_BAD_QUOTE', `nháy giữa ô không nháy ở hàng ${row}`, row);
          field += text[i++];
        }
      }
      fields.push(field);
      if (i >= n) { done = true; }
      else if (text[i] === delimiter) { i++; }
      else if (text[i] === '\r') { i += text[i + 1] === '\n' ? 2 : 1; done = true; }
      else { i++; done = true; }
    }
    records.push(fields);
  }
  return records;
}

const TYPES = ['string', 'int', 'number', 'bool', 'date'];

function isRealDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (y === 0 || mo < 1 || mo > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return d <= dim;
}

function checkType(type, v) {
  switch (type) {
    case 'int': return /^[+-]?\d+$/.test(v) && Number.isSafeInteger(Number(v));
    case 'number': return /^[+-]?\d+(\.\d+)?$/.test(v) && Number.isFinite(Number(v));
    case 'bool': { const l = v.toLowerCase(); return l === 'true' || l === 'false'; }
    case 'date': return isRealDate(v);
    default: return true;
  }
}

function bad(msg) { return fail('CSV_INVALID_SCHEMA', msg); }

function compileSchema(schema) {
  if (schema === null || typeof schema !== 'object' || !Array.isArray(schema.columns) ||
      schema.columns.length === 0) throw bad('columns phải là mảng không rỗng');
  const seen = new Set();
  return schema.columns.map((col, idx) => {
    if (col === null || typeof col !== 'object' || Array.isArray(col)) throw bad(`cột #${idx} không phải object`);
    if (typeof col.name !== 'string') throw bad(`cột #${idx} thiếu name`);
    if (seen.has(col.name)) throw bad(`name trùng: ${col.name}`);
    seen.add(col.name);
    const type = col.type === undefined ? 'string' : col.type;
    if (!TYPES.includes(type)) throw bad(`type lạ ở cột ${col.name}`);
    let re = null;
    if (col.pattern !== undefined) {
      if (typeof col.pattern !== 'string') throw bad(`pattern ở cột ${col.name}`);
      try { re = new RegExp(col.pattern); } catch { throw bad(`pattern không biên dịch được ở cột ${col.name}`); }
    }
    if (col.enum !== undefined &&
        (!Array.isArray(col.enum) || col.enum.length === 0 || !col.enum.every((x) => typeof x === 'string'))) {
      throw bad(`enum ở cột ${col.name}`);
    }
    for (const k of ['min', 'max']) {
      const v = col[k];
      if (v === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof v !== 'number' || !Number.isFinite(v)) throw bad(`${k} ở cột ${col.name}`);
      } else if (type === 'date') {
        if (typeof v !== 'string' || !isRealDate(v)) throw bad(`${k} ở cột ${col.name}`);
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      const v = col[k];
      if (v !== undefined && !(Number.isInteger(v) && v >= 0)) throw bad(`${k} ở cột ${col.name}`);
    }
    return { col, type, re };
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
  const idxOf = cols.map(({ col }) => header.indexOf(col.name));
  cols.forEach(({ col }, k) => {
    if (idxOf[k] === -1) errors.push({ row: 1, column: col.name, code: 'MISSING_COLUMN' });
  });
  const uniques = cols.map(() => new Set());

  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    const row = r + 1;
    if (rec.length !== header.length) {
      errors.push({ row, column: null, code: 'ROW_LENGTH' });
      continue;
    }
    cols.forEach(({ col, type, re }, k) => {
      if (idxOf[k] === -1) return;
      const v = rec[idxOf[k]];
      const name = col.name;
      const push = (code) => errors.push({ row, column: name, code });
      if (v === '') { if (col.required) push('REQUIRED'); return; }
      if (!checkType(type, v)) { push('TYPE'); return; }
      if (col.enum !== undefined && !col.enum.includes(v)) push('ENUM');
      if (re && !re.test(v)) push('PATTERN');
      const len = Array.from(v).length;
      if (col.minLength !== undefined && len < col.minLength) push('MIN_LENGTH');
      if (col.maxLength !== undefined && len > col.maxLength) push('MAX_LENGTH');
      if (type === 'int' || type === 'number') {
        const num = Number(v);
        if (col.min !== undefined && num < col.min) push('MIN');
        if (col.max !== undefined && num > col.max) push('MAX');
      } else if (type === 'date') {
        if (col.min !== undefined && v < col.min) push('MIN');
        if (col.max !== undefined && v > col.max) push('MAX');
      }
      if (col.unique) {
        if (uniques[k].has(v)) push('UNIQUE'); else uniques[k].add(v);
      }
    });
  }
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
