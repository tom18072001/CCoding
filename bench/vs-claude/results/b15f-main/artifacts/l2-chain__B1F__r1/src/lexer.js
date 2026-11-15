// Tầng 1a — bộ tách từ. Xem SPEC.md mục 3.

const KEYWORDS = new Set(['include', 'const', 'true', 'false', 'null']);
const NUMBER_RE = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;
const INTERP_RE = /^@?[A-Za-z_][A-Za-z0-9_-]*(\.([A-Za-z_][A-Za-z0-9_-]*|0|[1-9][0-9]*))*$/;

const isDigit = (c) => c >= '0' && c <= '9';
const isIdentStart = (c) => (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c === '_';
const isIdentChar = (c) => isIdentStart(c) || isDigit(c) || c === '-';
const isNumChar = (c) => isIdentStart(c) || isDigit(c) || c === '.' || c === '+' || c === '-';
const isHex = (c) => (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');

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

function run(src) {
  let i = src.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;
  let col = 1;
  const tokens = [];

  // Tiến một "đơn vị" (xuống dòng \r\n tính một lần).
  const advance = () => {
    const c = src[i];
    if (c === '\r') {
      i += src[i + 1] === '\n' ? 2 : 1;
      line++;
      col = 1;
    } else if (c === '\n') {
      i++;
      line++;
      col = 1;
    } else {
      i++;
      col++;
    }
  };
  const isNl = (c) => c === '\n' || c === '\r';

  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || isNl(c)) {
      advance();
      continue;
    }
    if (c === '#' || (c === '/' && src[i + 1] === '/')) {
      while (i < src.length && !isNl(src[i])) advance();
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const sl = line;
      const sc = col;
      advance();
      advance();
      let closed = false;
      while (i < src.length) {
        if (src[i] === '*' && src[i + 1] === '/') {
          advance();
          advance();
          closed = true;
          break;
        }
        advance();
      }
      if (!closed) throw new LexError('LEX_UNTERMINATED_COMMENT', 'Chú thích khối chưa đóng', sl, sc);
      continue;
    }
    const tl = line;
    const tc = col;
    if (isIdentStart(c)) {
      let j = i;
      while (j < src.length && isIdentChar(src[j])) j++;
      const word = src.slice(i, j);
      col += j - i;
      i = j;
      tokens.push({
        type: KEYWORDS.has(word) ? 'keyword' : 'ident',
        value: word,
        line: tl,
        column: tc,
      });
      continue;
    }
    if (isDigit(c) || c === '-') {
      let j = i;
      while (j < src.length && isNumChar(src[j])) j++;
      const text = src.slice(i, j);
      const value = NUMBER_RE.test(text) ? Number(text) : NaN;
      if (!Number.isFinite(value)) {
        throw new LexError('LEX_BAD_NUMBER', `Số không hợp lệ: ${text}`, tl, tc);
      }
      col += j - i;
      i = j;
      tokens.push({ type: 'number', value: value === 0 ? 0 : value, line: tl, column: tc });
      continue;
    }
    if ('={}[],'.includes(c)) {
      advance();
      tokens.push({ type: 'punct', value: c, line: tl, column: tc });
      continue;
    }
    if (c === '"') {
      advance();
      tokens.push({ type: 'string', value: readString(tl, tc), line: tl, column: tc });
      continue;
    }
    throw new LexError('LEX_UNEXPECTED_CHAR', `Ký tự không hợp lệ: ${c}`, tl, tc);
  }
  tokens.push({ type: 'eof', value: null, line, column: col });
  return tokens;

  // Đọc phần thân chuỗi; con trỏ đứng sau dấu nháy mở.
  function readString(ql, qc) {
    const parts = [];
    let text = '';
    const flush = () => {
      if (text !== '') parts.push({ type: 'Text', value: text });
      text = '';
    };
    const simple = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', $: '$' };
    for (;;) {
      if (i >= src.length || isNl(src[i])) {
        throw new LexError('LEX_UNTERMINATED_STRING', 'Chuỗi chưa đóng', ql, qc);
      }
      const c = src[i];
      if (c === '"') {
        advance();
        flush();
        return parts;
      }
      if (c === '\\') {
        const el = line;
        const ec = col;
        const n = src[i + 1];
        if (n !== undefined && Object.hasOwn(simple, n)) {
          text += simple[n];
          advance();
          advance();
        } else if (n === 'u') {
          const hex = src.slice(i + 2, i + 6);
          if (hex.length !== 4 || ![...hex].every(isHex)) {
            throw new LexError('LEX_BAD_ESCAPE', 'Thoát \\u không hợp lệ', el, ec);
          }
          text += String.fromCharCode(parseInt(hex, 16));
          for (let k = 0; k < 6; k++) advance();
        } else {
          throw new LexError('LEX_BAD_ESCAPE', 'Thoát không hợp lệ', el, ec);
        }
        continue;
      }
      if (c === '$' && src[i + 1] === '{') {
        const dl = line;
        const dc = col;
        let j = i + 2;
        while (j < src.length && src[j] !== '}' && src[j] !== '"' && !isNl(src[j])) j++;
        if (j >= src.length || src[j] !== '}') {
          throw new LexError('LEX_BAD_INTERPOLATION', 'Nội suy chưa đóng', dl, dc);
        }
        const inner = src.slice(i + 2, j);
        if (!INTERP_RE.test(inner)) {
          throw new LexError('LEX_BAD_INTERPOLATION', 'Nội suy sai dạng', dl, dc);
        }
        const isConst = inner[0] === '@';
        const path = (isConst ? inner.slice(1) : inner).split('.');
        flush();
        parts.push({ type: 'Ref', path, const: isConst, line: dl, column: dc });
        col += j + 1 - i;
        i = j + 1;
        continue;
      }
      text += c;
      advance();
    }
  }
}
