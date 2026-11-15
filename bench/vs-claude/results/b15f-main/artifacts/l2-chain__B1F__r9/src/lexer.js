// Tầng 1a — bộ tách từ. Xem SPEC.md mục 3.

const KEYWORDS = new Set(['include', 'const', 'true', 'false', 'null']);
const NUMBER_RE = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;
const INTERP_RE = /^@?[A-Za-z_][A-Za-z0-9_-]*(\.([A-Za-z_][A-Za-z0-9_-]*|0|[1-9][0-9]*))*$/;
const isIdentStart = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
const isDigit = (c) => c >= '0' && c <= '9';
const isIdentPart = (c) => isIdentStart(c) || isDigit(c) || c === '-';
const isNumChar = (c) => isDigit(c) || isIdentStart(c) || c === '.' || c === '+' || c === '-';
const isHex = (c) => /^[0-9a-fA-F]$/.test(c);
const SIMPLE_ESCAPES = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', $: '$' };

export function tokenize(source) {
  const src = String(source);
  let i = src.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;
  let col = 1;
  const tokens = [];

  // Tiến một ký tự (xử lý xuống dòng \n, \r\n, \r).
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
  const fail = (code, message, l, c) => ({ ok: false, error: { code, message, line: l, column: c } });
  const isNl = (c) => c === '\n' || c === '\r';

  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || isNl(c)) { adv(); continue; }
    const sl = line;
    const sc = col;
    if (c === '#' || (c === '/' && src[i + 1] === '/')) {
      while (i < src.length && !isNl(src[i])) adv();
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      adv(); adv();
      let closed = false;
      while (i < src.length) {
        if (src[i] === '*' && src[i + 1] === '/') { adv(); adv(); closed = true; break; }
        adv();
      }
      if (!closed) return fail('LEX_UNTERMINATED_COMMENT', 'Chú thích khối chưa đóng', sl, sc);
      continue;
    }
    if (isIdentStart(c)) {
      let j = i;
      while (j < src.length && isIdentPart(src[j])) j++;
      const word = src.slice(i, j);
      col += j - i;
      i = j;
      tokens.push({ type: KEYWORDS.has(word) ? 'keyword' : 'ident', value: word, line: sl, column: sc });
      continue;
    }
    if (isDigit(c) || c === '-') {
      let j = i;
      while (j < src.length && isNumChar(src[j])) j++;
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
      const flush = () => { if (text !== '') { parts.push({ type: 'Text', value: text }); text = ''; } };
      while (true) {
        if (i >= src.length || isNl(src[i])) {
          return fail('LEX_UNTERMINATED_STRING', 'Chuỗi chưa đóng', sl, sc);
        }
        const ch = src[i];
        if (ch === '"') { adv(); break; }
        if (ch === '\\') {
          const el = line;
          const ec = col;
          const n = src[i + 1];
          if (n !== undefined && Object.hasOwn(SIMPLE_ESCAPES, n)) {
            text += SIMPLE_ESCAPES[n];
            adv(); adv();
          } else if (n === 'u') {
            const hex = src.slice(i + 2, i + 6);
            if (hex.length === 4 && [...hex].every(isHex)) {
              text += String.fromCharCode(parseInt(hex, 16));
              i += 6; col += 6;
            } else {
              return fail('LEX_BAD_ESCAPE', 'Escape \\u không hợp lệ', el, ec);
            }
          } else {
            return fail('LEX_BAD_ESCAPE', 'Escape không hợp lệ', el, ec);
          }
          continue;
        }
        if (ch === '$' && src[i + 1] === '{') {
          const rl = line;
          const rc = col;
          let j = i + 2;
          while (j < src.length && src[j] !== '}' && src[j] !== '"' && !isNl(src[j])) j++;
          if (j >= src.length || src[j] !== '}') {
            return fail('LEX_BAD_INTERPOLATION', 'Nội suy chưa đóng', rl, rc);
          }
          const inner = src.slice(i + 2, j);
          if (!INTERP_RE.test(inner)) {
            return fail('LEX_BAD_INTERPOLATION', 'Nội suy sai dạng', rl, rc);
          }
          const isConst = inner[0] === '@';
          const path = (isConst ? inner.slice(1) : inner).split('.');
          flush();
          parts.push({ type: 'Ref', path, const: isConst, line: rl, column: rc });
          col += j + 1 - i;
          i = j + 1;
          continue;
        }
        text += ch;
        adv();
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
