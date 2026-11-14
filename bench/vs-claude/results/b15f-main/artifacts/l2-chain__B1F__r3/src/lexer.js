// Tầng 1a — bộ tách từ. Xem SPEC.md mục 3.

const KEYWORDS = new Set(['include', 'const', 'true', 'false', 'null']);
const NUMBER_RE = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;
const INTERP_RE = /^@?[A-Za-z_][A-Za-z0-9_-]*(\.([A-Za-z_][A-Za-z0-9_-]*|0|[1-9][0-9]*))*$/;
const isIdentStart = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
const isDigit = (c) => c >= '0' && c <= '9';
const isIdentPart = (c) => isIdentStart(c) || isDigit(c) || c === '-';
const isNumberChar = (c) => /[0-9A-Za-z_.+-]/.test(c);
const isHex = (c) => /^[0-9A-Fa-f]$/.test(c);
const SIMPLE_ESCAPES = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', $: '$' };

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
    return { ok: true, tokens: scan(String(source)) };
  } catch (e) {
    if (e instanceof LexError) {
      return { ok: false, error: { code: e.code, message: e.message, line: e.line, column: e.column } };
    }
    throw e;
  }
}

function scan(src) {
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  const n = src.length;
  let i = 0;
  let line = 1;
  let col = 1;
  const tokens = [];

  // Tiến một ký tự (xuống dòng \r\n tính một lần).
  const adv = () => {
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
  const fail = (code, message, l, c) => { throw new LexError(code, message, l, c); };

  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || isNl(c)) { adv(); continue; }
    if (c === '#' || (c === '/' && src[i + 1] === '/')) {
      while (i < n && !isNl(src[i])) adv();
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const sl = line, sc = col;
      adv(); adv();
      let closed = false;
      while (i < n) {
        if (src[i] === '*' && src[i + 1] === '/') { adv(); adv(); closed = true; break; }
        adv();
      }
      if (!closed) fail('LEX_UNTERMINATED_COMMENT', 'Chú thích khối chưa đóng', sl, sc);
      continue;
    }
    const tl = line, tc = col;
    if (isIdentStart(c)) {
      let j = i;
      while (j < n && isIdentPart(src[j])) j++;
      const word = src.slice(i, j);
      for (let k = i; k < j; k++) adv();
      tokens.push({ type: KEYWORDS.has(word) ? 'keyword' : 'ident', value: word, line: tl, column: tc });
      continue;
    }
    if (isDigit(c) || c === '-') {
      let j = i;
      while (j < n && isNumberChar(src[j])) j++;
      const text = src.slice(i, j);
      let v = NaN;
      if (NUMBER_RE.test(text)) v = Number(text);
      if (!Number.isFinite(v)) fail('LEX_BAD_NUMBER', `Số không hợp lệ: ${text}`, tl, tc);
      if (v === 0) v = 0;
      for (let k = i; k < j; k++) adv();
      tokens.push({ type: 'number', value: v, line: tl, column: tc });
      continue;
    }
    if ('={}[],'.includes(c)) {
      adv();
      tokens.push({ type: 'punct', value: c, line: tl, column: tc });
      continue;
    }
    if (c === '"') {
      adv();
      const parts = [];
      let text = '';
      const flush = () => { if (text !== '') { parts.push({ type: 'Text', value: text }); text = ''; } };
      for (;;) {
        if (i >= n || isNl(src[i])) {
          fail('LEX_UNTERMINATED_STRING', 'Chuỗi chưa đóng', tl, tc);
        }
        const ch = src[i];
        if (ch === '"') { adv(); break; }
        if (ch === '\\') {
          const el = line, ec = col;
          const nx = src[i + 1];
          if (nx !== undefined && Object.hasOwn(SIMPLE_ESCAPES, nx)) {
            text += SIMPLE_ESCAPES[nx];
            adv(); adv();
          } else if (nx === 'u') {
            const hex = src.slice(i + 2, i + 6);
            if (hex.length !== 4 || ![...hex].every(isHex)) {
              fail('LEX_BAD_ESCAPE', 'Thoát \\u cần đúng 4 chữ số hex', el, ec);
            }
            text += String.fromCharCode(parseInt(hex, 16));
            for (let k = 0; k < 6; k++) adv();
          } else {
            fail('LEX_BAD_ESCAPE', 'Thoát không hợp lệ', el, ec);
          }
          continue;
        }
        if (ch === '$' && src[i + 1] === '{') {
          const rl = line, rc = col;
          let j = i + 2;
          while (j < n && src[j] !== '}' && src[j] !== '"' && !isNl(src[j])) j++;
          if (j >= n || src[j] !== '}') {
            fail('LEX_BAD_INTERPOLATION', 'Nội suy chưa đóng', rl, rc);
          }
          const inner = src.slice(i + 2, j);
          if (!INTERP_RE.test(inner)) {
            fail('LEX_BAD_INTERPOLATION', 'Nội suy sai dạng', rl, rc);
          }
          const isConst = inner[0] === '@';
          const path = (isConst ? inner.slice(1) : inner).split('.');
          flush();
          parts.push({ type: 'Ref', path, const: isConst, line: rl, column: rc });
          for (let k = i; k <= j; k++) adv();
          continue;
        }
        text += ch;
        adv();
      }
      flush();
      tokens.push({ type: 'string', value: parts, line: tl, column: tc });
      continue;
    }
    fail('LEX_UNEXPECTED_CHAR', `Ký tự không hợp lệ: ${c}`, tl, tc);
  }
  tokens.push({ type: 'eof', value: null, line, column: col });
  return tokens;
}
