// Tầng 1a — bộ tách từ. Xem SPEC.md mục 3.

const KEYWORDS = new Set(['include', 'const', 'true', 'false', 'null']);
const NUMBER_RUN = /[0-9A-Za-z_.+-]/;
const NUMBER_FULL = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;
const INTERP_FULL = /^@?[A-Za-z_][A-Za-z0-9_-]*(\.([A-Za-z_][A-Za-z0-9_-]*|0|[1-9][0-9]*))*$/;
const IDENT_START = /[A-Za-z_]/;
const IDENT_PART = /[A-Za-z0-9_-]/;
const HEX4 = /^[0-9A-Fa-f]{4}$/;
const SIMPLE_ESC = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', $: '$' };

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
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  const n = src.length;
  let i = 0;
  let line = 1;
  let lineStart = 0;
  const tokens = [];
  const col = (idx) => idx - lineStart + 1;
  const fail = (code, message, l, c) => { throw new LexError(code, message, l, c); };
  // Nếu src[idx] bắt đầu một xuống dòng thì trả độ dài (1 hoặc 2), ngược lại 0.
  const nlLen = (idx) => {
    const ch = src[idx];
    if (ch === '\n') return 1;
    if (ch === '\r') return src[idx + 1] === '\n' ? 2 : 1;
    return 0;
  };
  const newline = (len) => { i += len; line++; lineStart = i; };

  while (i < n) {
    const ch = src[i];
    const nl = nlLen(i);
    if (nl) { newline(nl); continue; }
    if (ch === ' ' || ch === '\t') { i++; continue; }
    if (ch === '#' || (ch === '/' && src[i + 1] === '/')) {
      while (i < n && !nlLen(i)) i++;
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      const sl = line, sc = col(i);
      i += 2;
      let closed = false;
      while (i < n) {
        if (src[i] === '*' && src[i + 1] === '/') { i += 2; closed = true; break; }
        const k = nlLen(i);
        if (k) newline(k); else i++;
      }
      if (!closed) fail('LEX_UNTERMINATED_COMMENT', 'Chú thích khối chưa đóng', sl, sc);
      continue;
    }
    const tl = line, tc = col(i);
    if (IDENT_START.test(ch)) {
      let j = i + 1;
      while (j < n && IDENT_PART.test(src[j])) j++;
      const word = src.slice(i, j);
      i = j;
      tokens.push({ type: KEYWORDS.has(word) ? 'keyword' : 'ident', value: word, line: tl, column: tc });
      continue;
    }
    if ((ch >= '0' && ch <= '9') || ch === '-') {
      let j = i + 1;
      while (j < n && NUMBER_RUN.test(src[j])) j++;
      const text = src.slice(i, j);
      const v = NUMBER_FULL.test(text) ? Number(text) : NaN;
      if (!Number.isFinite(v)) fail('LEX_BAD_NUMBER', `Số không hợp lệ: ${text}`, tl, tc);
      i = j;
      tokens.push({ type: 'number', value: v === 0 ? 0 : v, line: tl, column: tc });
      continue;
    }
    if ('={}[],'.includes(ch)) {
      i++;
      tokens.push({ type: 'punct', value: ch, line: tl, column: tc });
      continue;
    }
    if (ch === '"') {
      i++;
      const parts = [];
      let text = '';
      const flush = () => { if (text !== '') { parts.push({ type: 'Text', value: text }); text = ''; } };
      for (;;) {
        if (i >= n || nlLen(i)) fail('LEX_UNTERMINATED_STRING', 'Chuỗi chưa đóng', tl, tc);
        const c = src[i];
        if (c === '"') { i++; break; }
        if (c === '\\') {
          const ec = col(i);
          const e = src[i + 1];
          if (e === undefined || nlLen(i + 1)) fail('LEX_BAD_ESCAPE', 'Thoát không hợp lệ', line, ec);
          if (e === 'u') {
            const hex = src.slice(i + 2, i + 6);
            if (!HEX4.test(hex)) fail('LEX_BAD_ESCAPE', 'Thoát \\u thiếu chữ số hex', line, ec);
            text += String.fromCharCode(parseInt(hex, 16));
            i += 6;
          } else if (Object.hasOwn(SIMPLE_ESC, e)) {
            text += SIMPLE_ESC[e];
            i += 2;
          } else {
            fail('LEX_BAD_ESCAPE', `Thoát không hợp lệ: \\${e}`, line, ec);
          }
          continue;
        }
        if (c === '$' && src[i + 1] === '{') {
          const rl = line, rc = col(i);
          let j = i + 2;
          while (j < n && src[j] !== '}' && src[j] !== '"' && !nlLen(j)) j++;
          if (j >= n || src[j] !== '}') fail('LEX_BAD_INTERPOLATION', 'Nội suy chưa đóng', rl, rc);
          const inner = src.slice(i + 2, j);
          if (!INTERP_FULL.test(inner)) fail('LEX_BAD_INTERPOLATION', 'Nội suy sai dạng', rl, rc);
          const isConst = inner[0] === '@';
          const path = (isConst ? inner.slice(1) : inner).split('.');
          flush();
          parts.push({ type: 'Ref', path, const: isConst, line: rl, column: rc });
          i = j + 1;
          continue;
        }
        text += c;
        i++;
      }
      flush();
      tokens.push({ type: 'string', value: parts, line: tl, column: tc });
      continue;
    }
    fail('LEX_UNEXPECTED_CHAR', `Ký tự không hợp lệ: ${ch}`, tl, tc);
  }
  tokens.push({ type: 'eof', value: null, line, column: col(i) });
  return tokens;
}
