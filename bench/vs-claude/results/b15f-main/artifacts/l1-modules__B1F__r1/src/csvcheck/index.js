// Module csvcheck — xem mục "csvcheck" trong SPEC.md.

function fail(code, message, row) {
  const e = new Error(message);
  e.code = code;
  if (row !== undefined) e.row = row;
  return e;
}

export function parseCsv(text, options = {}) {
  if (typeof text !== 'string') throw fail('CSV_INVALID_INPUT', 'text phải là chuỗi');
  const opts = options == null ? {} : options;
  const delimiter = opts.delimiter === undefined ? ',' : opts.delimiter;
  if (typeof delimiter !== 'string' || delimiter.length !== 1 ||
      delimiter === '"' || delimiter === '\r' || delimiter === '\n') {
    throw fail('CSV_INVALID_INPUT', 'delimiter không hợp lệ');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const records = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    const c = text[i];
    // dòng trống: bỏ qua
    if (c === '\n') { i++; continue; }
    if (c === '\r') { i += text[i + 1] === '\n' ? 2 : 1; continue; }
    const row = records.length + 1;
    const rec = [];
    for (;;) {
      let field = '';
      if (text[i] === '"') {
        i++;
        for (;;) {
          if (i >= n) throw fail('CSV_UNTERMINATED_QUOTE', 'nháy không đóng', row);
          const ch = text[i];
          if (ch === '"') {
            if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
            i++;
            break;
          }
          field += ch;
          i++;
        }
        const nx = text[i];
        if (i < n && nx !== delimiter && nx !== '\r' && nx !== '\n') {
          throw fail('CSV_BAD_QUOTE', 'ký tự thừa sau nháy đóng', row);
        }
      } else {
        while (i < n) {
          const ch = text[i];
          if (ch === delimiter || ch === '\r' || ch === '\n') break;
          if (ch === '"') throw fail('CSV_BAD_QUOTE', 'nháy giữa ô không nháy', row);
          field += ch;
          i++;
        }
      }
      rec.push(field);
      if (i >= n) break;
      const ch = text[i];
      if (ch === delimiter) { i++; continue; } // có thể sinh ô rỗng cuối
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
      break;
    }
    records.push(rec);
  }
  return records;
}

const TYPES = ['string', 'int', 'number', 'bool', 'date'];

function validDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y === 0 || mo < 1 || mo > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return d <= dim;
}

function checkSchema(schema) {
  const bad = (m) => fail('CSV_INVALID_SCHEMA', m);
  if (schema === null || typeof schema !== 'object' || !Array.isArray(schema.columns) ||
      schema.columns.length === 0) throw bad('columns phải là mảng không rỗng');
  const names = new Set();
  const cols = [];
  for (const c of schema.columns) {
    if (c === null || typeof c !== 'object' || Array.isArray(c)) throw bad('cột phải là object');
    if (typeof c.name !== 'string' || c.name === '' || names.has(c.name)) throw bad('name thiếu hoặc trùng');
    names.add(c.name);
    const type = c.type === undefined ? 'string' : c.type;
    if (!TYPES.includes(type)) throw bad('type lạ');
    let re = null;
    if (c.pattern !== undefined) {
      if (typeof c.pattern !== 'string') throw bad('pattern phải là chuỗi');
      try { re = new RegExp(c.pattern); } catch { throw bad('pattern không biên dịch được'); }
    }
    if (c.enum !== undefined &&
        (!Array.isArray(c.enum) || c.enum.length === 0 || c.enum.some((v) => typeof v !== 'string'))) {
      throw bad('enum không hợp lệ');
    }
    for (const k of ['min', 'max']) {
      const v = c[k];
      if (v === undefined) continue;
      if ((type === 'int' || type === 'number') && !(typeof v === 'number' && Number.isFinite(v))) throw bad(`${k} phải là số hữu hạn`);
      if (type === 'date' && !(typeof v === 'string' && validDate(v))) throw bad(`${k} phải là ngày hợp lệ`);
    }
    for (const k of ['minLength', 'maxLength']) {
      const v = c[k];
      if (v !== undefined && !(Number.isInteger(v) && v >= 0)) throw bad(`${k} phải là số nguyên >= 0`);
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
  const header = records[0];
  const errors = [];
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
      if (c.type === 'int' || c.type === 'number' || c.type === 'date') {
        const x = c.type === 'date' ? v : Number(v);
        if (d.min !== undefined && x < d.min) err('MIN');
        if (d.max !== undefined && x > d.max) err('MAX');
      }
      if (d.unique) {
        if (seen[k].has(v)) err('UNIQUE'); else seen[k].add(v);
      }
    });
  }
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
