// Tầng 1a — bộ tách từ. Xem SPEC.md mục 3.

const KEYWORDS = new Set(['include', 'const', 'true', 'false', 'null']);
const NUMBER_CHARS = /[0-9A-Za-z_.+-]/;
const NUMBER_RE = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;
const IDENT_START = /[A-Za-z_]/;
const IDENT_PART = /[A-Za-z0-9_-]/;
const REF_RE = /^(@?)([A-Za-z_][A-Za-z0-9_-]*(?:\.(?:[A-Za-z_][A-Za-z0-9_-]*|0|[1-9][0-9]*))*)$/;
const HEX4 = /^[0-9A-Fa-f]{4}$/;
const SIMPLE_ESC = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', $: '$' };

class LexError extends Error {
  constructor(code, message, line, column) {
    super(message);
    this.code = code;
    this.line = line;
    this.column = column;
  }
}

function run(source) {
  let i = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;
  let col = 1;
  const tokens = [];
  const n = source.length;

  // Tiến một ký tự (mã UTF-16); \r\n tính một lần xuống dòng.
  const advance = () => {
    const c = source[i];
    if (c === '\r') {
      i += source[i + 1] === '\n' ? 2 : 1;
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

  while (true) {
    while (i < n && (source[i] === ' ' || source[i] === '\t' || isNl(source[i]))) advance();
    if (i >= n) break;
    const c = source[i];
    const sl = line;
    const sc = col;

    if (c === '#' || (c === '/' && source[i + 1] === '/')) {
      while (i < n && !isNl(source[i])) advance();
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      advance();
      advance();
      let closed = false;
      while (i < n) {
        if (source[i] === '*' && source[i + 1] === '/') {
          advance();
          advance();
          closed = true;
          break;
        }
        advance();
      }
      if (!closed) throw new LexError('LEX_UNTERMINATED_COMMENT', 'Chú thích khối không đóng', sl, sc);
      continue;
    }
    if ('={}[],'.includes(c)) {
      tokens.push({ type: 'punct', value: c, line: sl, column: sc });
      advance();
      continue;
    }
    if ((c >= '0' && c <= '9') || c === '-') {
      let j = i;
      while (j < n && NUMBER_CHARS.test(source[j])) j++;
      const text = source.slice(i, j);
      const v = NUMBER_RE.test(text) ? Number(text) : NaN;
      if (!Number.isFinite(v)) throw new LexError('LEX_BAD_NUMBER', `Số không hợp lệ: ${text}`, sl, sc);
      while (i < j) advance();
      tokens.push({ type: 'number', value: v === 0 ? 0 : v, line: sl, column: sc });
      continue;
    }
    if (IDENT_START.test(c)) {
      let j = i + 1;
      while (j < n && IDENT_PART.test(source[j])) j++;
      const text = source.slice(i, j);
      while (i < j) advance();
      tokens.push({ type: KEYWORDS.has(text) ? 'keyword' : 'ident', value: text, line: sl, column: sc });
      continue;
    }
    if (c === '"') {
      advance();
      const parts = [];
      let buf = '';
      const flush = () => {
        if (buf !== '') parts.push({ type: 'Text', value: buf });
        buf = '';
      };
      while (true) {
        if (i >= n || isNl(source[i])) {
          throw new LexError('LEX_UNTERMINATED_STRING', 'Chuỗi không đóng', sl, sc);
        }
        const ch = source[i];
        if (ch === '"') {
          advance();
          break;
        }
        if (ch === '\\') {
          const el = line;
          const ec = col;
          const nx = source[i + 1];
          if (nx !== undefined && Object.hasOwn(SIMPLE_ESC, nx)) {
            buf += SIMPLE_ESC[nx];
            advance();
            advance();
          } else if (nx === 'u') {
            const hex = source.slice(i + 2, i + 6);
            if (!HEX4.test(hex)) throw new LexError('LEX_BAD_ESCAPE', 'Thoát \\u không hợp lệ', el, ec);
            buf += String.fromCharCode(parseInt(hex, 16));
            for (let k = 0; k < 6; k++) advance();
          } else {
            throw new LexError('LEX_BAD_ESCAPE', 'Thoát không hợp lệ', el, ec);
          }
          continue;
        }
        if (ch === '$' && source[i + 1] === '{') {
          const rl = line;
          const rc = col;
          let j = i + 2;
          while (j < n && source[j] !== '}' && source[j] !== '"' && !isNl(source[j])) j++;
          const bad = () => new LexError('LEX_BAD_INTERPOLATION', 'Nội suy không hợp lệ', rl, rc);
          if (j >= n || source[j] !== '}') throw bad();
          const m = REF_RE.exec(source.slice(i + 2, j));
          if (!m) throw bad();
          flush();
          parts.push({ type: 'Ref', path: m[2].split('.'), const: m[1] === '@', line: rl, column: rc });
          while (i <= j) advance();
          continue;
        }
        buf += ch;
        advance();
      }
      flush();
      tokens.push({ type: 'string', value: parts, line: sl, column: sc });
      continue;
    }
    throw new LexError('LEX_UNEXPECTED_CHAR', `Ký tự không hợp lệ: ${c}`, sl, sc);
  }
  tokens.push({ type: 'eof', value: null, line, column: col });
  return tokens;
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
