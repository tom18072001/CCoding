// Tầng 1a — bộ tách từ. Xem SPEC.md mục 3.

const KEYWORDS = new Set(['include', 'const', 'true', 'false', 'null']);
const NUMBER_RE = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;
const INTERP_RE = /^@?[A-Za-z_][A-Za-z0-9_-]*(\.([A-Za-z_][A-Za-z0-9_-]*|0|[1-9][0-9]*))*$/;
const ESCAPES = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', $: '$' };

const isIdentStart = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
const isDigit = (c) => c >= '0' && c <= '9';
const isIdentChar = (c) => isIdentStart(c) || isDigit(c) || c === '-';
const isNumChar = (c) => isIdentStart(c) || isDigit(c) || c === '.' || c === '+' || c === '-';

export function tokenize(source) {
  const src = String(source);
  const len = src.length;
  let i = src.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;
  let col = 1;
  const tokens = [];

  const fail = (code, message, l, c) => ({ ok: false, error: { code, message, line: l, column: c } });
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

  while (i < len) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
      adv();
      continue;
    }
    if (c === '#' || (c === '/' && src[i + 1] === '/')) {
      while (i < len && !isNl(src[i])) {
        i++;
        col++;
      }
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end === -1) return fail('LEX_UNTERMINATED_COMMENT', 'Chú thích khối chưa đóng', line, col);
      while (i < end + 2) adv();
      continue;
    }
    const sl = line;
    const sc = col;
    if (isIdentStart(c)) {
      let j = i;
      while (j < len && isIdentChar(src[j])) j++;
      const name = src.slice(i, j);
      col += j - i;
      i = j;
      tokens.push({ type: KEYWORDS.has(name) ? 'keyword' : 'ident', value: name, line: sl, column: sc });
      continue;
    }
    if (isDigit(c) || c === '-') {
      let j = i;
      while (j < len && isNumChar(src[j])) j++;
      const text = src.slice(i, j);
      const v = NUMBER_RE.test(text) ? Number(text) : NaN;
      if (!Number.isFinite(v)) return fail('LEX_BAD_NUMBER', `Số không hợp lệ: ${text}`, sl, sc);
      col += j - i;
      i = j;
      tokens.push({ type: 'number', value: v === 0 ? 0 : v, line: sl, column: sc });
      continue;
    }
    if ('={}[],'.includes(c)) {
      adv();
      tokens.push({ type: 'punct', value: c, line: sl, column: sc });
      continue;
    }
    if (c === '"') {
      adv();
      const parts = [];
      let text = '';
      const flush = () => {
        if (text !== '') parts.push({ type: 'Text', value: text });
        text = '';
      };
      let closed = false;
      while (!closed) {
        if (i >= len || isNl(src[i])) {
          return fail('LEX_UNTERMINATED_STRING', 'Chuỗi chưa đóng', sl, sc);
        }
        const d = src[i];
        if (d === '"') {
          adv();
          closed = true;
        } else if (d === '\\') {
          const n = src[i + 1];
          if (n !== undefined && Object.prototype.hasOwnProperty.call(ESCAPES, n)) {
            text += ESCAPES[n];
            adv();
            adv();
          } else if (n === 'u') {
            const hex = src.slice(i + 2, i + 6);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) return fail('LEX_BAD_ESCAPE', 'Thoát \\u không hợp lệ', line, col);
            text += String.fromCharCode(parseInt(hex, 16));
            i += 6;
            col += 6;
          } else {
            return fail('LEX_BAD_ESCAPE', 'Ký tự thoát không hợp lệ', line, col);
          }
        } else if (d === '$' && src[i + 1] === '{') {
          let j = i + 2;
          while (j < len && src[j] !== '}' && src[j] !== '"' && !isNl(src[j])) j++;
          if (j >= len || src[j] !== '}') return fail('LEX_BAD_INTERPOLATION', 'Nội suy chưa đóng', line, col);
          const inner = src.slice(i + 2, j);
          if (!INTERP_RE.test(inner)) return fail('LEX_BAD_INTERPOLATION', 'Nội suy sai dạng', line, col);
          flush();
          const isConst = inner[0] === '@';
          parts.push({
            type: 'Ref',
            path: (isConst ? inner.slice(1) : inner).split('.'),
            const: isConst,
            line,
            column: col,
          });
          col += j + 1 - i;
          i = j + 1;
        } else {
          text += d;
          adv();
        }
      }
      flush();
      tokens.push({ type: 'string', value: parts, line: sl, column: sc });
      continue;
    }
    return fail('LEX_UNEXPECTED_CHAR', `Ký tự không hợp lệ: ${c}`, sl, sc);
  }
  tokens.push({ type: 'eof', value: null, line, column: col });
  return { ok: true, tokens };
}
