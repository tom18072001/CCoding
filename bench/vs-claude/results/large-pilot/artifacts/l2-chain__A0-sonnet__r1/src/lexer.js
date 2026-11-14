// Tầng 1a — bộ tách từ. Xem SPEC.md mục 3.

const KEYWORDS = new Set(['include', 'const', 'true', 'false', 'null']);
const NUMBER_RE = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;
const NUMBER_CHAR = /[0-9A-Za-z_.+-]/;
const INTERP_RE = /^@?[A-Za-z_][A-Za-z0-9_-]*(\.([A-Za-z_][A-Za-z0-9_-]*|0|[1-9][0-9]*))*$/;
const HEX4 = /^[0-9a-fA-F]{4}$/;
const ESCAPES = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', $: '$' };

const isDigit = (c) => c >= '0' && c <= '9';
const isIdentStart = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
const isIdentChar = (c) => isIdentStart(c) || isDigit(c) || c === '-';
const isNewline = (c) => c === '\n' || c === '\r';

class LexError {
  constructor(code, message, line, column) {
    this.code = code;
    this.message = message;
    this.line = line;
    this.column = column;
  }
}

export function tokenize(source) {
  try {
    return { ok: true, tokens: run(String(source)) };
  } catch (e) {
    if (e instanceof LexError) {
      return { ok: false, error: { code: e.code, message: e.message, line: e.line, column: e.column } };
    }
    throw e;
  }
}

function run(text) {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const n = src.length;
  const tokens = [];
  let i = 0;
  let line = 1;
  let col = 1;

  // tiêu thụ một ký tự logic (xuống dòng \r\n tính một lần)
  const bump = () => {
    const c = src[i];
    if (c === '\n') { i++; line++; col = 1; }
    else if (c === '\r') { i += src[i + 1] === '\n' ? 2 : 1; line++; col = 1; }
    else { i++; col++; }
  };
  const skipLine = () => { while (i < n && !isNewline(src[i])) { i++; col++; } };

  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || isNewline(c)) { bump(); continue; }
    if (c === '#') { skipLine(); continue; }
    if (c === '/') {
      const d = src[i + 1];
      if (d === '/') { skipLine(); continue; }
      if (d === '*') {
        const sl = line, sc = col;
        bump(); bump();
        while (i < n && !(src[i] === '*' && src[i + 1] === '/')) bump();
        if (i >= n) throw new LexError('LEX_UNTERMINATED_COMMENT', 'Chú thích khối chưa đóng', sl, sc);
        i += 2; col += 2;
        continue;
      }
      throw new LexError('LEX_UNEXPECTED_CHAR', 'Ký tự không hợp lệ "/"', line, col);
    }
    if (isDigit(c) || c === '-') {
      let j = i;
      while (j < n && NUMBER_CHAR.test(src[j])) j++;
      const s = src.slice(i, j);
      const v = NUMBER_RE.test(s) ? Number(s) : NaN;
      if (!Number.isFinite(v)) throw new LexError('LEX_BAD_NUMBER', `Số không hợp lệ: ${s}`, line, col);
      tokens.push({ type: 'number', value: v === 0 ? 0 : v, line, column: col });
      col += j - i; i = j;
      continue;
    }
    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < n && isIdentChar(src[j])) j++;
      const s = src.slice(i, j);
      tokens.push({ type: KEYWORDS.has(s) ? 'keyword' : 'ident', value: s, line, column: col });
      col += j - i; i = j;
      continue;
    }
    if ('={}[],'.includes(c)) {
      tokens.push({ type: 'punct', value: c, line, column: col });
      i++; col++;
      continue;
    }
    if (c === '"') { tokens.push(readString()); continue; }
    throw new LexError('LEX_UNEXPECTED_CHAR', `Ký tự không hợp lệ "${c}"`, line, col);
  }
  tokens.push({ type: 'eof', value: null, line, column: col });
  return tokens;

  function readString() {
    const sl = line, sc = col;
    const parts = [];
    let buf = '';
    i++; col++;
    for (;;) {
      if (i >= n) throw new LexError('LEX_UNTERMINATED_STRING', 'Chuỗi chưa đóng', sl, sc);
      const c = src[i];
      if (c === '"') {
        if (buf) parts.push({ type: 'Text', value: buf });
        i++; col++;
        return { type: 'string', value: parts, line: sl, column: sc };
      }
      if (isNewline(c)) throw new LexError('LEX_UNTERMINATED_STRING', 'Chuỗi chưa đóng', sl, sc);
      if (c === '\\') {
        const d = src[i + 1];
        if (d === 'u') {
          const hex = src.slice(i + 2, i + 6);
          if (!HEX4.test(hex)) throw new LexError('LEX_BAD_ESCAPE', 'Thoát \\u không hợp lệ', line, col);
          buf += String.fromCharCode(parseInt(hex, 16));
          i += 6; col += 6;
        } else if (d !== undefined && Object.hasOwn(ESCAPES, d)) {
          buf += ESCAPES[d];
          i += 2; col += 2;
        } else {
          throw new LexError('LEX_BAD_ESCAPE', 'Thoát không hợp lệ', line, col);
        }
        continue;
      }
      if (c === '$' && src[i + 1] === '{') {
        let j = i + 2;
        while (j < n && src[j] !== '}' && src[j] !== '"' && !isNewline(src[j])) j++;
        const body = src.slice(i + 2, j);
        if (j >= n || src[j] !== '}' || !INTERP_RE.test(body)) {
          throw new LexError('LEX_BAD_INTERPOLATION', 'Nội suy không hợp lệ', line, col);
        }
        if (buf) { parts.push({ type: 'Text', value: buf }); buf = ''; }
        const isConst = body[0] === '@';
        parts.push({
          type: 'Ref',
          path: (isConst ? body.slice(1) : body).split('.'),
          const: isConst,
          line,
          column: col,
        });
        col += j + 1 - i; i = j + 1;
        continue;
      }
      buf += c; i++; col++;
    }
  }
}
