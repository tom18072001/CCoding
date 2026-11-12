// Tầng 1a — bộ tách từ. Xem SPEC.md mục 3.

const KEYWORDS = new Set(['include', 'const', 'true', 'false', 'null']);
const PUNCT = new Set(['=', '{', '}', '[', ']', ',']);
const INTERP_RE =
  /^(@)?([A-Za-z_][A-Za-z0-9_-]*)((?:\.(?:[A-Za-z_][A-Za-z0-9_-]*|0|[1-9][0-9]*))*)$/;
const NUMBER_RE = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;

const isDigit = (c) => c >= '0' && c <= '9';
const isIdentStart = (c) => (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c === '_';
const isIdentPart = (c) => isIdentStart(c) || isDigit(c) || c === '-';
const isNumChar = (c) =>
  isDigit(c) || (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') ||
  c === '_' || c === '.' || c === '+' || c === '-';
const isHex = (c) => /^[0-9a-fA-F]$/.test(c);

class LexError {
  constructor(code, message, line, column) {
    this.error = { code, message, line, column };
  }
}

/**
 * Tách văn bản cfg thành token.
 * @param {string} source
 * @returns {{ok: true, tokens: Array<{type:string,value:any,line:number,column:number}>}
 *   | {ok: false, error: {code:string,message:string,line:number,column:number}}}
 */
export function tokenize(source) {
  try {
    return { ok: true, tokens: run(String(source)) };
  } catch (e) {
    if (e instanceof LexError) return { ok: false, error: e.error };
    throw e;
  }
}

function run(src) {
  let i = src.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;
  let col = 1;
  const tokens = [];

  // độ dài xuống dòng tại vị trí p (0 nếu không phải)
  const nlLen = (p) => {
    const c = src[p];
    if (c === '\n') return 1;
    if (c === '\r') return src[p + 1] === '\n' ? 2 : 1;
    return 0;
  };
  // tiến một "ký tự" (đơn vị mã hoặc xuống dòng) và cập nhật vị trí
  const step = () => {
    const n = nlLen(i);
    if (n) {
      i += n;
      line++;
      col = 1;
    } else {
      i++;
      col++;
    }
  };
  const fail = (code, message, l, c) => {
    throw new LexError(code, message, l, c);
  };

  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || nlLen(i)) {
      step();
      continue;
    }
    if (c === '#' || (c === '/' && src[i + 1] === '/')) {
      while (i < src.length && !nlLen(i)) step();
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const l0 = line, c0 = col;
      step(); step();
      let closed = false;
      while (i < src.length) {
        if (src[i] === '*' && src[i + 1] === '/') {
          step(); step();
          closed = true;
          break;
        }
        step();
      }
      if (!closed) fail('LEX_UNTERMINATED_COMMENT', 'Chú thích khối không đóng', l0, c0);
      continue;
    }
    const l0 = line, c0 = col;
    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < src.length && isIdentPart(src[j])) j++;
      const word = src.slice(i, j);
      col += j - i;
      i = j;
      tokens.push({ type: KEYWORDS.has(word) ? 'keyword' : 'ident', value: word, line: l0, column: c0 });
      continue;
    }
    if (isDigit(c) || c === '-') {
      let j = i + 1;
      while (j < src.length && isNumChar(src[j])) j++;
      const text = src.slice(i, j);
      const v = NUMBER_RE.test(text) ? Number(text) : NaN;
      if (!Number.isFinite(v)) fail('LEX_BAD_NUMBER', `Số không hợp lệ: ${text}`, l0, c0);
      col += j - i;
      i = j;
      tokens.push({ type: 'number', value: v === 0 ? 0 : v, line: l0, column: c0 });
      continue;
    }
    if (PUNCT.has(c)) {
      step();
      tokens.push({ type: 'punct', value: c, line: l0, column: c0 });
      continue;
    }
    if (c === '"') {
      step();
      const parts = [];
      let text = '';
      const flush = () => {
        if (text !== '') parts.push({ type: 'Text', value: text });
        text = '';
      };
      for (;;) {
        if (i >= src.length || nlLen(i)) {
          fail('LEX_UNTERMINATED_STRING', 'Chuỗi không đóng', l0, c0);
        }
        const ch = src[i];
        if (ch === '"') {
          step();
          break;
        }
        if (ch === '\\') {
          const el = line, ec = col;
          const n = src[i + 1];
          const simple = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', $: '$' };
          if (n !== undefined && Object.hasOwn(simple, n)) {
            text += simple[n];
            step(); step();
          } else if (n === 'u') {
            const hex = src.slice(i + 2, i + 6);
            if (hex.length !== 4 || ![...hex].every(isHex)) {
              fail('LEX_BAD_ESCAPE', 'Thoát \\u thiếu 4 chữ số hex', el, ec);
            }
            text += String.fromCharCode(parseInt(hex, 16));
            for (let k = 0; k < 6; k++) step();
          } else {
            fail('LEX_BAD_ESCAPE', 'Thoát không hợp lệ', el, ec);
          }
          continue;
        }
        if (ch === '$' && src[i + 1] === '{') {
          const dl = line, dc = col;
          let j = i + 2;
          while (j < src.length && src[j] !== '}' && src[j] !== '"' && !nlLen(j)) j++;
          if (j >= src.length || src[j] !== '}') {
            fail('LEX_BAD_INTERPOLATION', 'Nội suy không đóng', dl, dc);
          }
          const m = INTERP_RE.exec(src.slice(i + 2, j));
          if (!m) fail('LEX_BAD_INTERPOLATION', 'Nội suy sai dạng', dl, dc);
          flush();
          parts.push({
            type: 'Ref',
            path: (m[2] + m[3]).split('.'),
            const: m[1] === '@',
            line: dl,
            column: dc,
          });
          col += j + 1 - i;
          i = j + 1;
          continue;
        }
        text += ch;
        step();
      }
      flush();
      tokens.push({ type: 'string', value: parts, line: l0, column: c0 });
      continue;
    }
    // ký tự lạ (cả cặp surrogate là một ký tự, nhưng vị trí chỉ là điểm đầu)
    fail('LEX_UNEXPECTED_CHAR', `Ký tự không hợp lệ: ${c}`, l0, c0);
  }
  tokens.push({ type: 'eof', value: null, line, column: col });
  return tokens;
}
