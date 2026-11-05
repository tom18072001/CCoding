// Tầng 1a — bộ tách từ. Xem SPEC.md mục 3.

const KEYWORDS = new Set(['include', 'const', 'true', 'false', 'null']);
const IDENT_START = /[A-Za-z_]/;
const IDENT_PART = /[A-Za-z0-9_-]/;
const NUM_CHAR = /[0-9A-Za-z_.+-]/;
const NUM_RE = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;
const REF_RE = /^(@)?([A-Za-z_][A-Za-z0-9_-]*(?:\.(?:[A-Za-z_][A-Za-z0-9_-]*|0|[1-9][0-9]*))*)$/;
const HEX4 = /^[0-9A-Fa-f]{4}$/;
const SIMPLE_ESC = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', $: '$' };
const PUNCT = new Set(['=', '{', '}', '[', ']', ',']);

export function tokenize(source) {
  const src = String(source);
  let i = src.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;
  let col = 1;
  const tokens = [];
  const fail = (code, message, l, c) => ({ ok: false, error: { code, message, line: l, column: c } });

  const adv = () => {
    const ch = src[i];
    if (ch === '\r') {
      i += src[i + 1] === '\n' ? 2 : 1;
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

  while (i < src.length) {
    const ch = src[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      adv();
      continue;
    }
    if (ch === '#' || (ch === '/' && src[i + 1] === '/')) {
      while (i < src.length && src[i] !== '\n' && src[i] !== '\r') adv();
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      const sl = line, sc = col;
      adv(); adv();
      let closed = false;
      while (i < src.length) {
        if (src[i] === '*' && src[i + 1] === '/') {
          adv(); adv();
          closed = true;
          break;
        }
        adv();
      }
      if (!closed) return fail('LEX_UNTERMINATED_COMMENT', 'Chú thích khối không đóng', sl, sc);
      continue;
    }
    if (IDENT_START.test(ch)) {
      let j = i + 1;
      while (j < src.length && IDENT_PART.test(src[j])) j++;
      const word = src.slice(i, j);
      tokens.push({ type: KEYWORDS.has(word) ? 'keyword' : 'ident', value: word, line, column: col });
      col += j - i;
      i = j;
      continue;
    }
    if ((ch >= '0' && ch <= '9') || ch === '-') {
      let j = i + 1;
      while (j < src.length && NUM_CHAR.test(src[j])) j++;
      const text = src.slice(i, j);
      const n = NUM_RE.test(text) ? Number(text) : NaN;
      if (!Number.isFinite(n)) return fail('LEX_BAD_NUMBER', `Số không hợp lệ: ${text}`, line, col);
      tokens.push({ type: 'number', value: n === 0 ? 0 : n, line, column: col });
      col += j - i;
      i = j;
      continue;
    }
    if (ch === '"') {
      const sl = line, sc = col;
      const parts = [];
      let buf = '';
      let j = i + 1;
      const colAt = (k) => sc + (k - i);
      for (;;) {
        const c = src[j];
        if (c === undefined || c === '\n' || c === '\r') {
          return fail('LEX_UNTERMINATED_STRING', 'Chuỗi không đóng', sl, sc);
        }
        if (c === '"') {
          j++;
          break;
        }
        if (c === '\\') {
          const n = src[j + 1];
          if (n !== undefined && Object.hasOwn(SIMPLE_ESC, n)) {
            buf += SIMPLE_ESC[n];
            j += 2;
            continue;
          }
          if (n === 'u') {
            const h = src.slice(j + 2, j + 6);
            if (HEX4.test(h)) {
              buf += String.fromCharCode(parseInt(h, 16));
              j += 6;
              continue;
            }
          }
          return fail('LEX_BAD_ESCAPE', 'Chuỗi thoát không hợp lệ', sl, colAt(j));
        }
        if (c === '$' && src[j + 1] === '{') {
          let k = j + 2;
          while (k < src.length && src[k] !== '}' && src[k] !== '"' && src[k] !== '\n' && src[k] !== '\r') k++;
          const m = src[k] === '}' ? REF_RE.exec(src.slice(j + 2, k)) : null;
          if (!m) return fail('LEX_BAD_INTERPOLATION', 'Nội suy không hợp lệ', sl, colAt(j));
          if (buf) {
            parts.push({ type: 'Text', value: buf });
            buf = '';
          }
          parts.push({ type: 'Ref', path: m[2].split('.'), const: m[1] === '@', line: sl, column: colAt(j) });
          j = k + 1;
          continue;
        }
        buf += c;
        j++;
      }
      if (buf) parts.push({ type: 'Text', value: buf });
      tokens.push({ type: 'string', value: parts, line: sl, column: sc });
      col += j - i;
      i = j;
      continue;
    }
    if (PUNCT.has(ch)) {
      tokens.push({ type: 'punct', value: ch, line, column: col });
      adv();
      continue;
    }
    return fail('LEX_UNEXPECTED_CHAR', `Ký tự không hợp lệ: ${ch}`, line, col);
  }
  tokens.push({ type: 'eof', value: null, line, column: col });
  return { ok: true, tokens };
}
