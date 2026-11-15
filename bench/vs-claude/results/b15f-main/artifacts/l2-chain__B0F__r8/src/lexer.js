// Tầng 1a — bộ tách từ. Xem SPEC.md mục 3.

const KEYWORDS = new Set(['include', 'const', 'true', 'false', 'null']);
const NUM_CHAR = /[0-9A-Za-z_.+-]/;
const NUM_RE = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;
const REF_RE = /^@?[A-Za-z_][A-Za-z0-9_-]*(\.([A-Za-z_][A-Za-z0-9_-]*|0|[1-9][0-9]*))*$/;
const IDENT_START = /[A-Za-z_]/;
const IDENT_CHAR = /[A-Za-z0-9_-]/;
const HEX4 = /^[0-9a-fA-F]{4}$/;
const ESCAPES = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', $: '$' };

class LexError {
  constructor(code, message, line, column) {
    this.code = code;
    this.message = message;
    this.line = line;
    this.column = column;
  }
}

/**
 * Tách từ văn bản cfg.
 * @param {string} source
 * @returns {{ok: true, tokens: object[]} | {ok: false, error: {code: string, message: string, line: number, column: number}}}
 */
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
  let i = 0;
  if (src.charCodeAt(0) === 0xfeff) i = 1;
  let line = 1;
  let col = 1;
  const n = src.length;
  const tokens = [];
  const fail = (code, message, l, c) => { throw new LexError(code, message, l, c); };
  const isNl = (ch) => ch === '\n' || ch === '\r';
  // Qua một ký tự xuống dòng tại i (xử lý \r\n).
  const newline = () => {
    if (src[i] === '\r' && src[i + 1] === '\n') i += 2; else i += 1;
    line += 1;
    col = 1;
  };

  while (i < n) {
    const ch = src[i];
    if (ch === ' ' || ch === '\t') { i++; col++; continue; }
    if (isNl(ch)) { newline(); continue; }
    if (ch === '#' || (ch === '/' && src[i + 1] === '/')) {
      while (i < n && !isNl(src[i])) { i++; col++; }
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      const sl = line, sc = col;
      i += 2; col += 2;
      let closed = false;
      while (i < n) {
        if (src[i] === '*' && src[i + 1] === '/') { i += 2; col += 2; closed = true; break; }
        if (isNl(src[i])) newline(); else { i++; col++; }
      }
      if (!closed) fail('LEX_UNTERMINATED_COMMENT', 'Chú thích khối chưa đóng', sl, sc);
      continue;
    }
    if (IDENT_START.test(ch)) {
      const sl = line, sc = col;
      let j = i + 1;
      while (j < n && IDENT_CHAR.test(src[j])) j++;
      const word = src.slice(i, j);
      col += j - i; i = j;
      tokens.push({ type: KEYWORDS.has(word) ? 'keyword' : 'ident', value: word, line: sl, column: sc });
      continue;
    }
    if ((ch >= '0' && ch <= '9') || ch === '-') {
      const sl = line, sc = col;
      let j = i;
      while (j < n && NUM_CHAR.test(src[j])) j++;
      const text = src.slice(i, j);
      const v = NUM_RE.test(text) ? Number(text) : NaN;
      if (!Number.isFinite(v)) fail('LEX_BAD_NUMBER', `Số không hợp lệ: ${text}`, sl, sc);
      col += j - i; i = j;
      tokens.push({ type: 'number', value: v === 0 ? 0 : v, line: sl, column: sc });
      continue;
    }
    if ('={}[],'.includes(ch)) {
      tokens.push({ type: 'punct', value: ch, line, column: col });
      i++; col++;
      continue;
    }
    if (ch === '"') {
      const sl = line, sc = col;
      const parts = [];
      let text = '';
      const flush = () => { if (text !== '') { parts.push({ type: 'Text', value: text }); text = ''; } };
      i++; col++;
      for (;;) {
        if (i >= n || isNl(src[i])) fail('LEX_UNTERMINATED_STRING', 'Chuỗi chưa đóng', sl, sc);
        const c = src[i];
        if (c === '"') { i++; col++; break; }
        if (c === '\\') {
          const e = src[i + 1];
          if (e !== undefined && Object.hasOwn(ESCAPES, e)) {
            text += ESCAPES[e]; i += 2; col += 2; continue;
          }
          if (e === 'u') {
            const hex = src.slice(i + 2, i + 6);
            if (!HEX4.test(hex)) fail('LEX_BAD_ESCAPE', 'Escape \\u không hợp lệ', line, col);
            text += String.fromCharCode(parseInt(hex, 16)); i += 6; col += 6; continue;
          }
          fail('LEX_BAD_ESCAPE', 'Escape không hợp lệ', line, col);
        }
        if (c === '$' && src[i + 1] === '{') {
          let j = i + 2;
          while (j < n && src[j] !== '}' && src[j] !== '"' && !isNl(src[j])) j++;
          if (j >= n || src[j] !== '}') fail('LEX_BAD_INTERPOLATION', 'Nội suy không đóng được', line, col);
          const inner = src.slice(i + 2, j);
          if (!REF_RE.test(inner)) fail('LEX_BAD_INTERPOLATION', 'Nội suy sai dạng', line, col);
          const isConst = inner[0] === '@';
          const path = (isConst ? inner.slice(1) : inner).split('.');
          flush();
          parts.push({ type: 'Ref', path, const: isConst, line, column: col });
          col += j + 1 - i; i = j + 1;
          continue;
        }
        text += c; i++; col++;
      }
      flush();
      tokens.push({ type: 'string', value: parts, line: sl, column: sc });
      continue;
    }
    fail('LEX_UNEXPECTED_CHAR', `Ký tự không hợp lệ: ${ch}`, line, col);
  }
  tokens.push({ type: 'eof', value: null, line, column: col });
  return tokens;
}
