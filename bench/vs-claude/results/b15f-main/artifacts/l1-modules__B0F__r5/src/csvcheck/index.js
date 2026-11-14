// Module csvcheck — xem mục "csvcheck" trong SPEC.md.

function fail(code, message, row) {
  const err = new Error(message);
  err.code = code;
  if (row !== undefined) err.row = row;
  return err;
}

export function parseCsv(text, options = {}) {
  if (typeof text !== 'string') throw fail('CSV_INVALID_INPUT', 'text phải là chuỗi');
  let delimiter = ',';
  if (options !== undefined && options !== null) {
    if (typeof options !== 'object') throw fail('CSV_INVALID_INPUT', 'options không hợp lệ');
    if (options.delimiter !== undefined) delimiter = options.delimiter;
  }
  if (
    typeof delimiter !== 'string' ||
    delimiter.length !== 1 ||
    delimiter === '"' ||
    delimiter === '\r' ||
    delimiter === '\n'
  ) {
    throw fail('CSV_INVALID_INPUT', 'delimiter phải là đúng một ký tự hợp lệ');
  }

  let i = 0;
  if (text.charCodeAt(0) === 0xfeff) i = 1;
  const n = text.length;
  const records = [];

  while (i < n) {
    // Dòng trống: bỏ qua
    if (text[i] === '\r') {
      i += text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    if (text[i] === '\n') {
      i += 1;
      continue;
    }
    const row = records.length + 1;
    const rec = [];
    // phân tích một bản ghi
    for (;;) {
      let field = '';
      if (text[i] === '"') {
        i += 1;
        let closed = false;
        while (i < n) {
          const ch = text[i];
          if (ch === '"') {
            if (text[i + 1] === '"') {
              field += '"';
              i += 2;
            } else {
              i += 1;
              closed = true;
              break;
            }
          } else {
            field += ch;
            i += 1;
          }
        }
        if (!closed) throw fail('CSV_UNTERMINATED_QUOTE', 'nháy chưa đóng', row);
        if (i < n && text[i] !== delimiter && text[i] !== '\r' && text[i] !== '\n') {
          throw fail('CSV_BAD_QUOTE', 'ký tự lạ sau nháy đóng', row);
        }
      } else {
        while (i < n) {
          const ch = text[i];
          if (ch === delimiter || ch === '\r' || ch === '\n') break;
          if (ch === '"') throw fail('CSV_BAD_QUOTE', 'nháy giữa ô không nháy', row);
          field += ch;
          i += 1;
        }
      }
      rec.push(field);
      if (i >= n) break;
      const ch = text[i];
      if (ch === delimiter) {
        i += 1;
        continue; // ô kế tiếp (có thể rỗng ở cuối bản ghi/văn bản)
      }
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
  return fail('CSV_INVALID_SCHEMA', `lược đồ sai: ${msg}`);
}

function compileSchema(schema) {
  if (schema === null || typeof schema !== 'object' || !Array.isArray(schema.columns) || schema.columns.length === 0) {
    throw badSchema('columns phải là mảng không rỗng');
  }
  const seen = new Set();
  return schema.columns.map((c) => {
    if (c === null || typeof c !== 'object' || Array.isArray(c)) throw badSchema('cột phải là object');
    if (typeof c.name !== 'string') throw badSchema('name phải là chuỗi');
    if (seen.has(c.name)) throw badSchema('name trùng');
    seen.add(c.name);
    const type = c.type === undefined ? 'string' : c.type;
    if (!TYPES.includes(type)) throw badSchema('type lạ');
    let re = null;
    if (c.pattern !== undefined) {
      if (typeof c.pattern !== 'string') throw badSchema('pattern phải là chuỗi');
      try {
        re = new RegExp(c.pattern);
      } catch {
        throw badSchema('pattern không biên dịch được');
      }
    }
    if (c.enum !== undefined) {
      if (!Array.isArray(c.enum) || c.enum.length === 0 || !c.enum.every((v) => typeof v === 'string')) {
        throw badSchema('enum phải là mảng chuỗi không rỗng');
      }
    }
    for (const k of ['min', 'max']) {
      if (c[k] === undefined) continue;
      if (type === 'int' || type === 'number') {
        if (typeof c[k] !== 'number' || !Number.isFinite(c[k])) throw badSchema(`${k} phải là số hữu hạn`);
      } else if (type === 'date') {
        if (typeof c[k] !== 'string' || !isValidDate(c[k])) throw badSchema(`${k} phải là ngày hợp lệ`);
      }
    }
    for (const k of ['minLength', 'maxLength']) {
      if (c[k] === undefined) continue;
      if (!Number.isInteger(c[k]) || c[k] < 0) throw badSchema(`${k} phải là số nguyên >= 0`);
    }
    return { def: c, type, re, unique: new Set() };
  });
}

function typeOk(type, cell) {
  switch (type) {
    case 'int':
      return /^[+-]?\d+$/.test(cell) && Number.isSafeInteger(Number(cell));
    case 'number':
      return /^[+-]?\d+(\.\d+)?$/.test(cell) && Number.isFinite(Number(cell));
    case 'bool':
      return /^(true|false)$/i.test(cell);
    case 'date':
      return isValidDate(cell);
    default:
      return true;
  }
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

  const header = records[0];
  const errors = [];
  const idx = cols.map((c) => header.indexOf(c.def.name));
  cols.forEach((c, k) => {
    if (idx[k] < 0) errors.push({ row: 1, column: c.def.name, code: 'MISSING_COLUMN' });
  });

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
      const cell = rec[idx[k]];
      const err = (code) => errors.push({ row, column: d.name, code });
      if (cell === '') {
        if (d.required === true) err('REQUIRED');
        return;
      }
      if (!typeOk(c.type, cell)) {
        err('TYPE');
        return;
      }
      if (d.enum !== undefined && !d.enum.includes(cell)) err('ENUM');
      if (c.re && !c.re.test(cell)) err('PATTERN');
      const len = Array.from(cell).length;
      if (d.minLength !== undefined && len < d.minLength) err('MIN_LENGTH');
      if (d.maxLength !== undefined && len > d.maxLength) err('MAX_LENGTH');
      if (c.type === 'int' || c.type === 'number') {
        const v = Number(cell);
        if (d.min !== undefined && v < d.min) err('MIN');
        if (d.max !== undefined && v > d.max) err('MAX');
      } else if (c.type === 'date') {
        if (d.min !== undefined && cell < d.min) err('MIN');
        if (d.max !== undefined && cell > d.max) err('MAX');
      }
      if (d.unique === true) {
        if (c.unique.has(cell)) err('UNIQUE');
        else c.unique.add(cell);
      }
    });
  }

  return { ok: errors.length === 0, rowCount: records.length - 1, errors };
}
