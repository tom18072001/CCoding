// Tầng 1a — bộ tách từ. Xem SPEC.md mục 3.

const KEYWORDS = new Set(['include', 'const', 'true', 'false', 'null']);
const NUM_CHAR = /[0-9A-Za-z_.+-]/;
const NUM_FULL = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;
const IDENT_START = /[A-Za-z_]/;
const IDENT_CHAR = /[A-Za-z0-9_-]/;
const INTERP = /^@?[A-Za-z_][A-Za-z0-9_-]*(\.([A-Za-z_][A-Za-z0-9_-]*|0|[1-9][0-9]*))*$/;
const HEX4 = /^[0-9a-fA-F]{4}$/;
const ESC = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', $: '$' };

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
  const fail = (code, message, l, c) => { throw new LexError(code, message, l, c); };

  // Tiến một ký tự (xử lý xuống dòng \n, \r\n, \r).
  const adv = () => {
    const ch = src[i];
    if (ch === '\r') {
      i++;
      if (src[i] === '\n') i++;
      line++;
      col = 1;
    } else if (ch === '\n') {
      i++;
      line++;
      col = 1;
    } else {
      i++;
      col++;
    }
  };
  const isNl = (ch) => ch === '\n' || ch === '\r';

  while (i < src.length) {
    const ch = src[i];
    const sl = line;
    const sc = col;
    if (ch === ' ' || ch === '\t' || isNl(ch)) { adv(); continue; }
    if (ch === '#' || (ch === '/' && src[i + 1] === '/')) {
      while (i < src.length && !isNl(src[i])) adv();
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      adv(); adv();
      let closed = false;
      while (i < src.length) {
        if (src[i] === '*' && src[i + 1] === '/') { adv(); adv(); closed = true; break; }
        adv();
      }
      if (!closed) fail('LEX_UNTERMINATED_COMMENT', 'Chú thích khối chưa đóng', sl, sc);
      continue;
    }
    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      let j = i;
      while (j < src.length && NUM_CHAR.test(src[j])) j++;
      const text = src.slice(i, j);
      const value = NUM_FULL.test(text) ? Number(text) : NaN;
      if (!Number.isFinite(value)) fail('LEX_BAD_NUMBER', `Số không hợp lệ: ${text}`, sl, sc);
      for (let k = i; k < j; k++) adv();
      tokens.push({ type: 'number', value: value === 0 ? 0 : value, line: sl, column: sc });
      continue;
    }
    if (IDENT_START.test(ch)) {
      let j = i + 1;
      while (j < src.length && IDENT_CHAR.test(src[j])) j++;
      const text = src.slice(i, j);
      for (let k = i; k < j; k++) adv();
      tokens.push({ type: KEYWORDS.has(text) ? 'keyword' : 'ident', value: text, line: sl, column: sc });
      continue;
    }
    if ('={}[],'.includes(ch)) {
      adv();
      tokens.push({ type: 'punct', value: ch, line: sl, column: sc });
      continue;
    }
    if (ch === '"') {
      adv();
      const parts = [];
      let text = '';
      const flush = () => { if (text !== '') { parts.push({ type: 'Text', value: text }); text = ''; } };
      for (;;) {
        if (i >= src.length || isNl(src[i])) fail('LEX_UNTERMINATED_STRING', 'Chuỗi chưa đóng', sl, sc);
        const c = src[i];
        if (c === '"') { adv(); break; }
        if (c === '\\') {
          const el = line, ec = col;
          const n = src[i + 1];
          if (n === undefined || isNl(n)) fail('LEX_BAD_ESCAPE', 'Thoát không hợp lệ', el, ec);
          if (n === 'u') {
            const hex = src.slice(i + 2, i + 6);
            if (!HEX4.test(hex)) fail('LEX_BAD_ESCAPE', 'Thoát \\u không hợp lệ', el, ec);
            text += String.fromCharCode(parseInt(hex, 16));
            for (let k = 0; k < 6; k++) adv();
          } else if (Object.hasOwn(ESC, n)) {
            text += ESC[n];
            adv(); adv();
          } else {
            fail('LEX_BAD_ESCAPE', 'Thoát không hợp lệ', el, ec);
          }
          continue;
        }
        if (c === '$' && src[i + 1] === '{') {
          const dl = line, dc = col;
          let j = i + 2;
          while (j < src.length && src[j] !== '}' && src[j] !== '"' && !isNl(src[j])) j++;
          if (src[j] !== '}') fail('LEX_BAD_INTERPOLATION', 'Nội suy chưa đóng', dl, dc);
          const inner = src.slice(i + 2, j);
          if (!INTERP.test(inner)) fail('LEX_BAD_INTERPOLATION', 'Nội suy sai dạng', dl, dc);
          const isConst = inner[0] === '@';
          const path = (isConst ? inner.slice(1) : inner).split('.');
          flush();
          parts.push({ type: 'Ref', path, const: isConst, line: dl, column: dc });
          for (let k = i; k <= j; k++) adv();
          continue;
        }
        text += c;
        adv();
      }
      flush();
      tokens.push({ type: 'string', value: parts, line: sl, column: sc });
      continue;
    }
    fail('LEX_UNEXPECTED_CHAR', `Ký tự không hợp lệ: ${ch}`, sl, sc);
  }
  tokens.push({ type: 'eof', value: null, line, column: col });
  return tokens;
}
