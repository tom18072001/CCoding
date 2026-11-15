// Module csvcheck — xem mục "csvcheck" trong SPEC.md.

function fail(code, message, row) {
  const err = new Error(message);
  err.code = code;
  if (row !== undefined) err.row = row;
  return err;
}

function resolveDelimiter(options) {
  if (options !== undefined && options !== null && typeof options !== 'object') {
    throw fail('CSV_INVALID_INPUT', 'options không hợp lệ');
  }
  const d = options == null ? undefined : options.delimiter;
  if (d === undefined) return ',';
  if (typeof d !== 'string' || Array.from(d).length !== 1 || d === '"' || d === '\r' || d === '\n') {
    throw fail('CSV_INVALID_INPUT', 'delimiter không hợp lệ');
  }
  return d;
}

export function parseCsv(text, options = {}) {
  if (typeof text !== 'string') throw fail('CSV_INVALID_INPUT', 'text phải là chuỗi');
  const delim = resolveDelimiter(options);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const records = [];
  const n = text.length;
  let i = 0;

  while (i < n) {
    // đầu bản ghi
    const c0 = text[i];
    if (c0 === '\r') { i += (text[i + 1] === '\n') ? 2 : 1; continue; } // dòng trống
    if (c0 === '\n') { i += 1; continue; }

    const row = records.length + 1;
    const rec = [];
    let endRecord = false;
    while (!endRecord) {
      // đầu ô
      if (text[i] === '"') {
        i++;
        let val = '';
        for (;;) {
          if (i >= n) throw fail('CSV_UNTERMINATED_QUOTE', 'nháy không đóng', row);
          const ch = text[i];
          if (ch === '"') {
            if (text[i + 1] === '"') { val += '"'; i += 2; continue; }
            i++;
            break;
          }
          val += ch;
          i++;
        }
        rec.push(val);
        if (i >= n) { endRecord = true; break; }
        const a = text[i];
        if (a === delim) { i++; if (i >= n) { rec.push(''); endRecord = true; } continue; }
        if (a === '\r') { i += (text[i + 1] === '\n') ? 2 : 1; endRecord = true; break; }
        if (a === '\n') { i++; endRecord = true; break; }
        throw fail('CSV_BAD_QUOTE', 'ký tự sau nháy đóng', row);
      } else {
        let val = '';
        for (;;) {
          if (i >= n) { rec.push(val); endRecord = true; break; }
          const ch = text[i];
          if (ch === delim) { rec.push(val); i++; if (i >= n) { rec.push(''); endRecord = true; } break; }
          if (ch === '\r') { rec.push(val); i += (text[i + 1] === '\n') ? 2 : 1; endRecord = true; break; }
          if (ch === '\n') { rec.push(val); i++; endRecord = true; break; }
          if (ch === '"') throw fail('CSV_BAD_QUOTE', 'nháy giữa ô không nháy', row);
          val += ch;
          i++;
        }
      }
    }
    records.push(rec);
  }
  return records;
}

const TYPES = ['string', 'int', 'number', 'bool', 'date'];

function isValidDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
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
    case 'int': return /^[+-]?\d+$/.test(s) && Number.isSafeInteger(Number(s));
    case 'number': return /^[+-]?\d+(\.\d+)?$/.test(s) && Number.isFinite(Number(s));
    case 'bool': { const l = s.toLowerCase(); return l === 'true' || l === 'false'; }
    case 'date': return isValidDate(s);
    default: return true;
  }
}

function bad(msg) {
  return fail('CSV_INVALID_SCHEMA', msg);
}

function compileSchema(schema) {
  if (schema === null || typeof schema !== 'object' || !Array.isArray(schema.columns) || schema.columns.length === 0) {
    throw bad('columns phải là mảng không rỗng');
  }
  const names = new Set();
  return schema.columns.map((c) => {
    if (c === null || typeof c !== 'object' || Array.isArray(c)) throw bad('cột phải là object');
    if (typeof c.name !== 'string' || names.has(c.name)) throw bad('name thiếu hoặc trùng');
    names.add(c.name);
    const type = c.type === undefined ? 'string' : c.type;
    if (!TYPES.includes(type)) throw bad('type lạ');
    let re = null;
    if (c.pattern !== undefined) {
      if (typeof c.pattern !== 'string') throw bad('pattern phải là chuỗi');
      try { re = new RegExp(c.pattern); } catch { throw bad('pattern không biên dịch được'); }
    }
    if (c.enum !== undefined) {
      if (!Array.isArray(c.enum) || c.enum.length === 0 || c.enum.some((v) => typeof v !== 'string')) {
        throw bad('enum không hợp lệ');
      }
    }
    for (const k of ['min', 'max']) {
      const v = c[k];
      if (v === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof v !== 'number' || !Number.isFinite(v)) throw bad(`${k} phải là số hữu hạn`);
      } else if (type === 'date') {
        if (typeof v !== 'string' || !isValidDate(v)) throw bad(`${k} phải là ngày hợp lệ`);
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      const v = c[k];
      if (v !== undefined && !(Number.isInteger(v) && v >= 0)) throw bad(`${k} không hợp lệ`);
    }
    return { def: c, type, re };
  });
}

export function validateCsv(text, schema, options = {}) {
  const cols = compileSchema(schema);

  let records;
  try {
    records = parseCsv(text, options);
  } catch (e) {
    if (e.code === 'CSV_UNTERMINATED_QUOTE' || e.code === 'CSV_BAD_QUOTE') {
      return {
        ok: false,
        rowCount: 0,
        errors: [{ row: e.row, column: null, code: e.code.slice(4) }],
      };
    }
    throw e;
  }

  if (records.length === 0) {
    return { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] };
  }

  const errors = [];
  const header = records[0];
  const index = cols.map((c) => header.indexOf(c.def.name));
  cols.forEach((c, k) => {
    if (index[k] === -1) errors.push({ row: 1, column: c.def.name, code: 'MISSING_COLUMN' });
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
      if (index[k] === -1) return;
      const d = c.def;
      const cell = rec[index[k]];
      const push = (code) => errors.push({ row, column: d.name, code });
      if (cell === '') {
        if (d.required === true) push('REQUIRED');
        return;
      }
      if (!checkType(c.type, cell)) { push('TYPE'); return; }
      if (d.enum !== undefined && !d.enum.includes(cell)) push('ENUM');
      if (c.re && !c.re.test(cell)) push('PATTERN');
      if (d.minLength !== undefined || d.maxLength !== undefined) {
        const len = Array.from(cell).length;
        if (d.minLength !== undefined && len < d.minLength) push('MIN_LENGTH');
        if (d.maxLength !== undefined && len > d.maxLength) push('MAX_LENGTH');
      }
      if (c.type === 'int' || c.type === 'number') {
        const v = Number(cell);
        if (d.min !== undefined && v < d.min) push('MIN');
        if (d.max !== undefined && v > d.max) push('MAX');
      } else if (c.type === 'date') {
        if (d.min !== undefined && cell < d.min) push('MIN');
        if (d.max !== undefined && cell > d.max) push('MAX');
      }
      if (d.unique === true) {
        if (seen[k].has(cell)) push('UNIQUE');
        else seen[k].add(cell);
      }
    });
  }

  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
