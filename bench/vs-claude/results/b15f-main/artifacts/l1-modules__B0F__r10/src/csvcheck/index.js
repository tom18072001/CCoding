// Module csvcheck — xem mục "csvcheck" trong SPEC.md.

function fail(code, message, row) {
  const e = new Error(message);
  e.code = code;
  if (row !== undefined) e.row = row;
  return e;
}

export function parseCsv(text, options = {}) {
  if (typeof text !== 'string') throw fail('CSV_INVALID_INPUT', 'text phải là chuỗi');
  if (options === null || options === undefined) options = {};
  if (typeof options !== 'object') throw fail('CSV_INVALID_INPUT', 'options sai');
  const delim = options.delimiter === undefined ? ',' : options.delimiter;
  if (typeof delim !== 'string' || delim.length !== 1 || delim === '"' || delim === '\r' || delim === '\n') {
    throw fail('CSV_INVALID_INPUT', 'delimiter không hợp lệ');
  }

  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const START = 0; // đầu ô
  const UNQUOTED = 1;
  const QUOTED = 2;
  const AFTER_QUOTE = 3; // sau nháy đóng
  const records = [];
  let fields = [];
  let field = '';
  let state = START;
  const n = text.length;

  const endRecord = () => {
    fields.push(field);
    records.push(fields);
    fields = [];
    field = '';
    state = START;
  };

  for (let i = 0; i < n; i++) {
    const c = text[i];
    const row = records.length + 1;
    if (state === QUOTED) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else state = AFTER_QUOTE;
      } else field += c;
      continue;
    }
    const isEol = c === '\r' || c === '\n';
    if (isEol) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      if (state === START && fields.length === 0) continue; // dòng trống
      endRecord();
      continue;
    }
    if (c === delim) {
      fields.push(field);
      field = '';
      state = START;
      continue;
    }
    if (state === START) {
      if (c === '"') state = QUOTED;
      else { field += c; state = UNQUOTED; }
    } else if (state === UNQUOTED) {
      if (c === '"') throw fail('CSV_BAD_QUOTE', 'nháy giữa ô không nháy', row);
      field += c;
    } else {
      throw fail('CSV_BAD_QUOTE', 'ký tự sau nháy đóng', row);
    }
  }
  if (state === QUOTED) throw fail('CSV_UNTERMINATED_QUOTE', 'nháy không đóng', records.length + 1);
  if (!(state === START && fields.length === 0)) endRecord();
  return records;
}

const TYPES = ['string', 'int', 'number', 'bool', 'date'];

function isRealDate(s) {
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

function badSchema(msg) {
  return fail('CSV_INVALID_SCHEMA', msg);
}

function compileSchema(schema) {
  if (schema === null || typeof schema !== 'object' || !Array.isArray(schema.columns) || schema.columns.length === 0) {
    throw badSchema('columns phải là mảng không rỗng');
  }
  const names = new Set();
  return schema.columns.map((col) => {
    if (col === null || typeof col !== 'object' || Array.isArray(col)) throw badSchema('cột không phải object');
    if (typeof col.name !== 'string' || names.has(col.name)) throw badSchema('name thiếu hoặc trùng');
    names.add(col.name);
    const type = col.type === undefined ? 'string' : col.type;
    if (!TYPES.includes(type)) throw badSchema('type lạ');
    let re = null;
    if (col.pattern !== undefined) {
      if (typeof col.pattern !== 'string') throw badSchema('pattern phải là chuỗi');
      try { re = new RegExp(col.pattern); } catch { throw badSchema('pattern không biên dịch được'); }
    }
    if (col.enum !== undefined) {
      if (!Array.isArray(col.enum) || col.enum.length === 0 || !col.enum.every((v) => typeof v === 'string')) {
        throw badSchema('enum sai');
      }
    }
    for (const k of ['min', 'max']) {
      const v = col[k];
      if (v === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof v !== 'number' || !Number.isFinite(v)) throw badSchema(`${k} phải là số hữu hạn`);
      } else if (type === 'date') {
        if (typeof v !== 'string' || !isRealDate(v)) throw badSchema(`${k} phải là ngày hợp lệ`);
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      const v = col[k];
      if (v !== undefined && !(Number.isInteger(v) && v >= 0)) throw badSchema(`${k} phải là số nguyên >= 0`);
    }
    return { col, type, re };
  });
}

function typeOk(type, v) {
  switch (type) {
    case 'int': return /^[+-]?\d+$/.test(v) && Number.isSafeInteger(Number(v));
    case 'number': return /^[+-]?\d+(\.\d+)?$/.test(v) && Number.isFinite(Number(v));
    case 'bool': return v.toLowerCase() === 'true' || v.toLowerCase() === 'false';
    case 'date': return isRealDate(v);
    default: return true;
  }
}

export function validateCsv(text, schema, options = {}) {
  const compiled = compileSchema(schema);

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
  const index = compiled.map(({ col }) => header.indexOf(col.name)); // lần xuất hiện đầu tiên
  compiled.forEach(({ col }, k) => {
    if (index[k] === -1) errors.push({ row: 1, column: col.name, code: 'MISSING_COLUMN' });
  });

  const seen = compiled.map(() => new Set());
  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    const row = r + 1;
    if (rec.length !== header.length) {
      errors.push({ row, column: null, code: 'ROW_LENGTH' });
      continue;
    }
    compiled.forEach(({ col, type, re }, k) => {
      if (index[k] === -1) return;
      const v = rec[index[k]];
      const add = (code) => errors.push({ row, column: col.name, code });
      if (v === '') {
        if (col.required === true) add('REQUIRED');
        return;
      }
      if (!typeOk(type, v)) { add('TYPE'); return; }
      if (col.enum !== undefined && !col.enum.includes(v)) add('ENUM');
      if (re !== null && !re.test(v)) add('PATTERN');
      const len = Array.from(v).length;
      if (col.minLength !== undefined && len < col.minLength) add('MIN_LENGTH');
      if (col.maxLength !== undefined && len > col.maxLength) add('MAX_LENGTH');
      if (type === 'int' || type === 'number') {
        const num = Number(v);
        if (col.min !== undefined && num < col.min) add('MIN');
        if (col.max !== undefined && num > col.max) add('MAX');
      } else if (type === 'date') {
        if (col.min !== undefined && v < col.min) add('MIN');
        if (col.max !== undefined && v > col.max) add('MAX');
      }
      if (col.unique === true) {
        if (seen[k].has(v)) add('UNIQUE');
        else seen[k].add(v);
      }
    });
  }
  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
