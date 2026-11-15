const TYPES = new Set(['string', 'int', 'number', 'bool', 'date']);

function fail(code, message, row) {
  const e = new Error(message);
  e.code = code;
  if (row !== undefined) e.row = row;
  return e;
}

export function parseCsv(text, options = {}) {
  if (typeof text !== 'string') throw fail('CSV_INVALID_INPUT', 'Đầu vào phải là chuỗi');
  const delim = options.delimiter === undefined ? ',' : options.delimiter;
  if (typeof delim !== 'string' || delim.length !== 1 || delim === '"' || delim === '\r' || delim === '\n') {
    throw fail('CSV_INVALID_INPUT', 'delimiter phải là đúng một ký tự, không phải nháy kép hay xuống dòng');
  }
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const n = s.length;
  const rows = [];
  let i = 0;
  while (i < n) {
    const c = s[i];
    if (c === '\n' || c === '\r') {
      i += c === '\r' && s[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    const rowNo = rows.length + 1;
    const row = [];
    for (;;) {
      let field = '';
      if (s[i] === '"') {
        i++;
        for (;;) {
          if (i >= n) throw fail('CSV_UNTERMINATED_QUOTE', `Hàng ${rowNo}: thiếu nháy đóng`, rowNo);
          const ch = s[i];
          if (ch === '"') {
            if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
            i++;
            break;
          }
          field += ch;
          i++;
        }
        if (i < n && s[i] !== delim && s[i] !== '\n' && s[i] !== '\r') {
          throw fail('CSV_BAD_QUOTE', `Hàng ${rowNo}: ký tự lạ sau nháy đóng`, rowNo);
        }
      } else {
        let j = i;
        while (j < n && s[j] !== delim && s[j] !== '\n' && s[j] !== '\r') {
          if (s[j] === '"') throw fail('CSV_BAD_QUOTE', `Hàng ${rowNo}: nháy kép giữa ô không có nháy`, rowNo);
          j++;
        }
        field = s.slice(i, j);
        i = j;
      }
      row.push(field);
      if (i >= n) break;
      if (s[i] === delim) {
        i++;
        if (i >= n) { row.push(''); break; }
        continue;
      }
      i += s[i] === '\r' && s[i + 1] === '\n' ? 2 : 1;
      break;
    }
    rows.push(row);
  }
  return rows;
}

function isDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1 || mo < 1 || mo > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return d <= dim;
}

function typeOk(type, v) {
  switch (type) {
    case 'int': return /^[+-]?\d+$/.test(v) && Number.isSafeInteger(Number(v));
    case 'number': return /^[+-]?\d+(\.\d+)?$/.test(v) && Number.isFinite(Number(v));
    case 'bool': return /^(true|false)$/i.test(v);
    case 'date': return isDate(v);
    default: return true;
  }
}

function bad(msg) {
  return fail('CSV_INVALID_SCHEMA', `Lược đồ không hợp lệ: ${msg}`);
}

function checkSchema(schema) {
  if (!schema || typeof schema !== 'object' || !Array.isArray(schema.columns) || schema.columns.length === 0) {
    throw bad('thiếu columns');
  }
  const names = new Set();
  return schema.columns.map((col) => {
    if (!col || typeof col !== 'object' || Array.isArray(col)) throw bad('cột không phải object');
    if (typeof col.name !== 'string' || col.name === '' || names.has(col.name)) throw bad('name thiếu hoặc trùng');
    names.add(col.name);
    const type = col.type === undefined ? 'string' : col.type;
    if (!TYPES.has(type)) throw bad(`type lạ: ${String(type)}`);
    if (col.pattern !== undefined) {
      if (typeof col.pattern !== 'string') throw bad('pattern phải là chuỗi');
      try { new RegExp(col.pattern); } catch { throw bad('pattern không biên dịch được'); }
    }
    if (col.enum !== undefined && (!Array.isArray(col.enum) || col.enum.length === 0 || col.enum.some((x) => typeof x !== 'string'))) {
      throw bad('enum phải là mảng chuỗi không rỗng');
    }
    for (const k of ['min', 'max']) {
      const v = col[k];
      if (v === undefined) continue;
      if ((type === 'int' || type === 'number') && !(typeof v === 'number' && Number.isFinite(v))) throw bad(`${k} phải là số hữu hạn`);
      if (type === 'date' && !(typeof v === 'string' && isDate(v))) throw bad(`${k} phải là ngày YYYY-MM-DD hợp lệ`);
    }
    for (const k of ['minLength', 'maxLength']) {
      const v = col[k];
      if (v !== undefined && !(Number.isInteger(v) && v >= 0)) throw bad(`${k} phải là số nguyên >= 0`);
    }
    return { ...col, type };
  });
}

export function validateCsv(text, schema, options = {}) {
  const cols = checkSchema(schema);
  let rows;
  try {
    rows = parseCsv(text, options);
  } catch (e) {
    if (e.code === 'CSV_UNTERMINATED_QUOTE' || e.code === 'CSV_BAD_QUOTE') {
      return { ok: false, rowCount: 0, errors: [{ row: e.row, column: null, code: e.code.slice(4) }] };
    }
    throw e;
  }
  if (rows.length === 0) {
    return { ok: false, rowCount: 0, errors: [{ row: 1, column: null, code: 'EMPTY_INPUT' }] };
  }
  const errors = [];
  const header = rows[0];
  const idx = cols.map((c) => header.indexOf(c.name));
  cols.forEach((c, k) => {
    if (idx[k] < 0) errors.push({ row: 1, column: c.name, code: 'MISSING_COLUMN' });
  });
  const seen = cols.map(() => new Set());
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const rowNo = r + 1;
    if (row.length !== header.length) {
      errors.push({ row: rowNo, column: null, code: 'ROW_LENGTH' });
      continue;
    }
    cols.forEach((c, k) => {
      if (idx[k] < 0) return;
      const v = row[idx[k]];
      const add = (code) => errors.push({ row: rowNo, column: c.name, code });
      if (v === '') {
        if (c.required) add('REQUIRED');
        return;
      }
      if (!typeOk(c.type, v)) { add('TYPE'); return; }
      if (c.enum !== undefined && !c.enum.includes(v)) add('ENUM');
      if (c.pattern !== undefined && !new RegExp(c.pattern).test(v)) add('PATTERN');
      const len = Array.from(v).length;
      if (c.minLength !== undefined && len < c.minLength) add('MIN_LENGTH');
      if (c.maxLength !== undefined && len > c.maxLength) add('MAX_LENGTH');
      const cmp = c.type === 'int' || c.type === 'number' ? Number(v) : c.type === 'date' ? v : undefined;
      if (cmp !== undefined) {
        if (c.min !== undefined && cmp < c.min) add('MIN');
        if (c.max !== undefined && cmp > c.max) add('MAX');
      }
      if (c.unique) {
        if (seen[k].has(v)) add('UNIQUE');
        else seen[k].add(v);
      }
    });
  }
  return { ok: errors.length === 0, rowCount: rows.length - 1, errors };
}
